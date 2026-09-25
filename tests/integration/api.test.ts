import request from 'supertest';
import crypto from 'node:crypto';
import { app } from '../../src/app';
import { prisma } from '../../src/config/prisma';

const ts = Date.now();
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || 'dev-webhook-secret-change-in-production';

function userCreds(n: number) {
  return { name: `Test User ${n}`, email: `test-${ts}-${n}@example.com`, password: 'TestPass123!' };
}

function sign(body: string) {
  return crypto.createHmac('sha256', WEBHOOK_SECRET).update(body).digest('hex');
}

function futureISO(daysAhead = 30) {
  return new Date(Date.now() + daysAhead * 86_400_000).toISOString();
}

let centreId: string;
let testId: string;
let centreTestId: string;

beforeAll(async () => {
  await prisma.$connect();
  const ct = await prisma.centreTest.findFirst({
    where: { isActive: true, centre: { isActive: true } },
    select: { id: true, centreId: true, testId: true, price: true },
  });
  if (!ct) throw new Error('No active CentreTest found — run seed first');
  centreId = ct.centreId;
  testId = ct.testId;
  centreTestId = ct.id;
});

afterAll(async () => {
  const testUsers = await prisma.user.findMany({
    where: { name: { startsWith: 'Test User' } },
    select: { id: true },
  });
  const testUserIds = testUsers.map((u) => u.id);
  if (testUserIds.length > 0) {
    await prisma.payment.deleteMany({ where: { booking: { userId: { in: testUserIds } } } });
    await prisma.booking.deleteMany({ where: { userId: { in: testUserIds } } });
    await prisma.user.deleteMany({ where: { id: { in: testUserIds } } });
  }
  await prisma.$disconnect();
});

// ── 1. Health & Swagger ──────────────────────────────────────────────────────

describe('Health & Swagger', () => {
  it('GET /health returns status ok', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });

  it('GET /api-docs/ serves Swagger UI', async () => {
    const res = await request(app).get('/api-docs/');
    expect(res.status).toBe(200);
  });
});

// ── 2. Authentication ───────────────────────────────────────────────────────

describe('Authentication', () => {
  it('POST /api/auth/signup creates user and returns token', async () => {
    const creds = userCreds(1);
    const res = await request(app).post('/api/auth/signup').send(creds);
    expect(res.status).toBe(201);
    expect(res.body.data.user.email).toBe(creds.email);
    expect(res.body.data.user.role).toBe('USER');
    expect(res.body.data.token).toBeTruthy();
  });

  it('POST /api/auth/signup with duplicate email returns 409 EMAIL_TAKEN', async () => {
    const creds = userCreds(1);
    const res = await request(app).post('/api/auth/signup').send(creds);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('EMAIL_TAKEN');
  });

  it('POST /api/auth/login with valid credentials returns token', async () => {
    const creds = userCreds(1);
    const res = await request(app).post('/api/auth/login').send({ email: creds.email, password: creds.password });
    expect(res.status).toBe(200);
    expect(res.body.data.token).toBeTruthy();
  });

  it('POST /api/auth/login with wrong password returns 401 INVALID_CREDENTIALS', async () => {
    const creds = userCreds(1);
    const res = await request(app).post('/api/auth/login').send({ email: creds.email, password: 'wrong' });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
  });

  it('POST /api/auth/signup with missing fields returns 400', async () => {
    const res = await request(app).post('/api/auth/signup').send({ email: 'x@x.com' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});

// ── 3. Authorization ────────────────────────────────────────────────────────

describe('Authorization', () => {
  it('Protected endpoint without token returns 401', async () => {
    const res = await request(app).get('/api/bookings');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('Protected endpoint with invalid token returns 401', async () => {
    const res = await request(app).get('/api/bookings').set('Authorization', 'Bearer invalid.token.here');
    expect(res.status).toBe(401);
  });

  it('Admin-only endpoint with USER token returns 403', async () => {
    const creds = userCreds(1);
    const login = await request(app).post('/api/auth/login').send({ email: creds.email, password: creds.password });
    const token = login.body.data.token;
    const res = await request(app).post('/api/centres').set('Authorization', `Bearer ${token}`).send({ name: 'Test', location: 'Test' });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });
});

// ── 4. Centres & Tests ──────────────────────────────────────────────────────

describe('Centres & Tests', () => {
  it('GET /api/centres lists centres with pagination', async () => {
    const res = await request(app).get('/api/centres');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.meta).toBeTruthy();
    expect(res.body.data.length).toBeGreaterThan(0);
  });

  it('GET /api/centres/:id returns centre with tests', async () => {
    const res = await request(app).get(`/api/centres/${centreId}`);
    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(centreId);
    expect(Array.isArray(res.body.data.tests)).toBe(true);
    expect(res.body.data.tests.length).toBeGreaterThan(0);
    expect(res.body.data.tests[0].price).toBeTruthy();
  });

  it('GET /api/tests lists tests', async () => {
    const res = await request(app).get('/api/tests');
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThan(0);
  });
});

// ── 5. Booking Creation & Amount Snapshot ────────────────────────────────────

describe('Booking creation', () => {
  let userToken: string;

  beforeAll(async () => {
    const creds = userCreds(2);
    await request(app).post('/api/auth/signup').send(creds);
    const login = await request(app).post('/api/auth/login').send({ email: creds.email, password: creds.password });
    userToken = login.body.data.token;
  });

  it('Creates booking with PENDING status and correct amount snapshot', async () => {
    const res = await request(app)
      .post('/api/bookings')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ centreId, testId, appointmentAt: futureISO() });
    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe('PENDING');
    expect(res.body.data.amount).toBeTruthy();
    expect(Number(res.body.data.amount)).toBeGreaterThan(0);
  });

  it('Booking amount matches CentreTest price', async () => {
    const ct = await prisma.centreTest.findUnique({
      where: { id: centreTestId },
      select: { price: true },
    });
    const res = await request(app)
      .post('/api/bookings')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ centreId, testId, appointmentAt: futureISO(60) });
    expect(res.body.data.amount).toBe(ct!.price.toString());
  });

  it('Rejects booking with past appointmentAt — 400 INVALID_APPOINTMENT_TIME', async () => {
    const res = await request(app)
      .post('/api/bookings')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ centreId, testId, appointmentAt: '2020-01-01T09:00:00.000Z' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_APPOINTMENT_TIME');
  });

  it('Rejects booking for non-existent centre/test — 404', async () => {
    const fake = '00000000-0000-0000-0000-000000000000';
    const res = await request(app)
      .post('/api/bookings')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ centreId: fake, testId: fake, appointmentAt: futureISO() });
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('CENTRE_TEST_NOT_FOUND');
  });

  it('Rejects booking with invalid UUID — 400 VALIDATION_ERROR', async () => {
    const res = await request(app)
      .post('/api/bookings')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ centreId: 'not-a-uuid', testId, appointmentAt: futureISO() });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});

// ── 6. Booking Detail & Ownership ───────────────────────────────────────────

describe('Booking detail & ownership', () => {
  let user1Token: string;
  let user2Token: string;
  let bookingId: string;

  beforeAll(async () => {
    const c1 = userCreds(3);
    const c2 = userCreds(4);
    await request(app).post('/api/auth/signup').send(c1);
    await request(app).post('/api/auth/signup').send(c2);
    const l1 = await request(app).post('/api/auth/login').send({ email: c1.email, password: c1.password });
    const l2 = await request(app).post('/api/auth/login').send({ email: c2.email, password: c2.password });
    user1Token = l1.body.data.token;
    user2Token = l2.body.data.token;
    const bk = await request(app)
      .post('/api/bookings')
      .set('Authorization', `Bearer ${user1Token}`)
      .send({ centreId, testId, appointmentAt: futureISO() });
    bookingId = bk.body.data.id;
  });

  it('Owner can read own booking', async () => {
    const res = await request(app).get(`/api/bookings/${bookingId}`).set('Authorization', `Bearer ${user1Token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(bookingId);
    expect(res.body.data.centre).toBeTruthy();
    expect(res.body.data.test).toBeTruthy();
    expect(Array.isArray(res.body.data.payments)).toBe(true);
  });

  it('Other user gets 403 FORBIDDEN', async () => {
    const res = await request(app).get(`/api/bookings/${bookingId}`).set('Authorization', `Bearer ${user2Token}`);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('Non-existent booking returns 404', async () => {
    const fake = '00000000-0000-0000-0000-000000000000';
    const res = await request(app).get(`/api/bookings/${fake}`).set('Authorization', `Bearer ${user1Token}`);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('BOOKING_NOT_FOUND');
  });

  it('GET /api/bookings lists own bookings with pagination', async () => {
    const res = await request(app).get('/api/bookings').set('Authorization', `Bearer ${user1Token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThan(0);
    expect(res.body.meta).toBeTruthy();
  });
});

// ── 7. Payment — Success, Failure, Idempotency ─────────────────────────────

describe('Payment', () => {
  let userToken: string;
  let bookingId: string;

  beforeAll(async () => {
    const creds = userCreds(5);
    await request(app).post('/api/auth/signup').send(creds);
    const login = await request(app).post('/api/auth/login').send({ email: creds.email, password: creds.password });
    userToken = login.body.data.token;
    const bk = await request(app)
      .post('/api/bookings')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ centreId, testId, appointmentAt: futureISO() });
    bookingId = bk.body.data.id;
  });

  it('Payment for PENDING booking returns SUCCESS (PAYMENT_SUCCESS_RATE=1.0)', async () => {
    const res = await request(app)
      .post('/api/payments')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ bookingId });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('SUCCESS');
    expect(res.body.data.paymentId).toBeTruthy();
    expect(res.body.data.bookingId).toBe(bookingId);
  });

  it('Booking transitions to CONFIRMED after successful payment', async () => {
    const res = await request(app).get(`/api/bookings/${bookingId}`).set('Authorization', `Bearer ${userToken}`);
    expect(res.body.data.status).toBe('CONFIRMED');
    expect(res.body.data.payments.length).toBe(1);
  });

  it('Re-playing with same Idempotency-Key returns stored result, no duplicate payment', async () => {
    const key = `idem-test-${ts}`;
    const bk = await request(app)
      .post('/api/bookings')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ centreId, testId, appointmentAt: futureISO(90) });
    const bid = bk.body.data.id;

    const r1 = await request(app)
      .post('/api/payments')
      .set('Authorization', `Bearer ${userToken}`)
      .set('Idempotency-Key', key)
      .send({ bookingId: bid });
    const r2 = await request(app)
      .post('/api/payments')
      .set('Authorization', `Bearer ${userToken}`)
      .set('Idempotency-Key', key)
      .send({ bookingId: bid });

    expect(r1.body.data.paymentId).toBe(r2.body.data.paymentId);
    expect(r1.body.data.status).toBe(r2.body.data.status);

    const payments = await prisma.payment.count({ where: { bookingId: bid } });
    expect(payments).toBe(1);
  });

  it('Paying for a CONFIRMED booking returns 409 BOOKING_NOT_PAYABLE', async () => {
    const res = await request(app)
      .post('/api/payments')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ bookingId });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('BOOKING_NOT_PAYABLE');
  });

  it('Paying for non-existent booking returns 404', async () => {
    const res = await request(app)
      .post('/api/payments')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ bookingId: '00000000-0000-0000-0000-000000000000' });
    expect(res.status).toBe(404);
  });
});

// ── 8. Payment Failure ──────────────────────────────────────────────────────

describe('Payment failure', () => {
  it('FAILED booking cannot be re-paid — 409', async () => {
    const creds = userCreds(6);
    await request(app).post('/api/auth/signup').send(creds);
    const login = await request(app).post('/api/auth/login').send({ email: creds.email, password: creds.password });
    const token = login.body.data.token;

    const bk = await request(app)
      .post('/api/bookings')
      .set('Authorization', `Bearer ${token}`)
      .send({ centreId, testId, appointmentAt: futureISO() });

    await prisma.booking.update({ where: { id: bk.body.data.id }, data: { status: 'FAILED' } });

    const res = await request(app)
      .post('/api/payments')
      .set('Authorization', `Bearer ${token}`)
      .send({ bookingId: bk.body.data.id });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('BOOKING_NOT_PAYABLE');
  });
});

// ── 9. Cancellation ─────────────────────────────────────────────────────────

describe('Cancellation', () => {
  let userToken: string;

  beforeAll(async () => {
    const creds = userCreds(7);
    await request(app).post('/api/auth/signup').send(creds);
    const login = await request(app).post('/api/auth/login').send({ email: creds.email, password: creds.password });
    userToken = login.body.data.token;
  });

  it('Can cancel a PENDING booking → CANCELLED', async () => {
    const bk = await request(app)
      .post('/api/bookings')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ centreId, testId, appointmentAt: futureISO() });
    const res = await request(app)
      .patch(`/api/bookings/${bk.body.data.id}/cancel`)
      .set('Authorization', `Bearer ${userToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('CANCELLED');
  });

  it('Can cancel a CONFIRMED booking → CANCELLED', async () => {
    const bk = await request(app)
      .post('/api/bookings')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ centreId, testId, appointmentAt: futureISO() });
    await request(app)
      .post('/api/payments')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ bookingId: bk.body.data.id });
    const res = await request(app)
      .patch(`/api/bookings/${bk.body.data.id}/cancel`)
      .set('Authorization', `Bearer ${userToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('CANCELLED');
  });

  it('Cannot cancel a CANCELLED booking → 409', async () => {
    const bk = await request(app)
      .post('/api/bookings')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ centreId, testId, appointmentAt: futureISO() });
    await request(app).patch(`/api/bookings/${bk.body.data.id}/cancel`).set('Authorization', `Bearer ${userToken}`);
    const res = await request(app)
      .patch(`/api/bookings/${bk.body.data.id}/cancel`)
      .set('Authorization', `Bearer ${userToken}`);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('BOOKING_NOT_CANCELLABLE');
  });

  it('Cannot cancel a FAILED booking → 409', async () => {
    const bk = await request(app)
      .post('/api/bookings')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ centreId, testId, appointmentAt: futureISO() });
    await prisma.booking.update({ where: { id: bk.body.data.id }, data: { status: 'FAILED' } });
    const res = await request(app)
      .patch(`/api/bookings/${bk.body.data.id}/cancel`)
      .set('Authorization', `Bearer ${userToken}`);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('BOOKING_NOT_CANCELLABLE');
  });

  it('Cannot cancel another user\'s booking → 403', async () => {
    const c1 = userCreds(8);
    const c2 = userCreds(9);
    await request(app).post('/api/auth/signup').send(c1);
    await request(app).post('/api/auth/signup').send(c2);
    const l1 = await request(app).post('/api/auth/login').send({ email: c1.email, password: c1.password });
    const l2 = await request(app).post('/api/auth/login').send({ email: c2.email, password: c2.password });
    const bk = await request(app)
      .post('/api/bookings')
      .set('Authorization', `Bearer ${l1.body.data.token}`)
      .send({ centreId, testId, appointmentAt: futureISO() });
    const res = await request(app)
      .patch(`/api/bookings/${bk.body.data.id}/cancel`)
      .set('Authorization', `Bearer ${l2.body.data.token}`);
    expect(res.status).toBe(403);
  });
});

// ── 10. Webhook — Signature & Idempotency ───────────────────────────────────

describe('Webhook', () => {
  it('Rejects webhook with missing signature — 401', async () => {
    const res = await request(app)
      .post('/api/payments/webhook')
      .send({ eventId: 'x', eventType: 'y', bookingId: '00000000-0000-0000-0000-000000000000', paymentId: '00000000-0000-0000-0000-000000000000', status: 'SUCCESS' });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('Rejects webhook with invalid signature — 401', async () => {
    const body = JSON.stringify({ eventId: 'x', eventType: 'y', bookingId: '00000000-0000-0000-0000-000000000000', paymentId: '00000000-0000-0000-0000-000000000000', status: 'SUCCESS' });
    const badSig = 'a'.repeat(64);
    const res = await request(app)
      .post('/api/payments/webhook')
      .set('X-Webhook-Signature', badSig)
      .set('Content-Type', 'application/json')
      .send(body);
    expect(res.status).toBe(401);
  });

  it('Accepts webhook with valid signature and processes it', async () => {
    const creds = userCreds(10);
    await request(app).post('/api/auth/signup').send(creds);
    const login = await request(app).post('/api/auth/login').send({ email: creds.email, password: creds.password });
    const token = login.body.data.token;
    const bk = await request(app)
      .post('/api/bookings')
      .set('Authorization', `Bearer ${token}`)
      .send({ centreId, testId, appointmentAt: futureISO() });
    const pay = await request(app)
      .post('/api/payments')
      .set('Authorization', `Bearer ${token}`)
      .send({ bookingId: bk.body.data.id });

    const eventId = `evt-wh-${ts}-ok`;
    const body = JSON.stringify({
      eventId,
      eventType: 'payment.completed',
      bookingId: bk.body.data.id,
      paymentId: pay.body.data.paymentId,
      status: 'SUCCESS',
    });
    const sig = sign(body);
    const res = await request(app)
      .post('/api/payments/webhook')
      .set('X-Webhook-Signature', sig)
      .set('Content-Type', 'application/json')
      .send(body);
    expect(res.status).toBe(200);
    expect(res.body.data.received).toBe(true);
    expect(res.body.data.duplicate).toBe(false);
  });

  it('Duplicate webhook eventId returns duplicate:true, no state change', async () => {
    const creds = userCreds(11);
    await request(app).post('/api/auth/signup').send(creds);
    const login = await request(app).post('/api/auth/login').send({ email: creds.email, password: creds.password });
    const token = login.body.data.token;
    const bk = await request(app)
      .post('/api/bookings')
      .set('Authorization', `Bearer ${token}`)
      .send({ centreId, testId, appointmentAt: futureISO() });
    const pay = await request(app)
      .post('/api/payments')
      .set('Authorization', `Bearer ${token}`)
      .send({ bookingId: bk.body.data.id });

    const eventId = `evt-wh-${ts}-dup`;
    const body = JSON.stringify({
      eventId,
      eventType: 'payment.completed',
      bookingId: bk.body.data.id,
      paymentId: pay.body.data.paymentId,
      status: 'SUCCESS',
    });
    const sig = sign(body);

    await request(app)
      .post('/api/payments/webhook')
      .set('X-Webhook-Signature', sig)
      .set('Content-Type', 'application/json')
      .send(body);
    const res2 = await request(app)
      .post('/api/payments/webhook')
      .set('X-Webhook-Signature', sig)
      .set('Content-Type', 'application/json')
      .send(body);

    expect(res2.status).toBe(200);
    expect(res2.body.data.duplicate).toBe(true);

    const webhookCount = await prisma.webhookEvent.count({ where: { eventId } });
    expect(webhookCount).toBe(1);
  });

  it('Webhook with unknown bookingId is recorded but ignored', async () => {
    const eventId = `evt-wh-${ts}-unknown`;
    const body = JSON.stringify({
      eventId,
      eventType: 'payment.completed',
      bookingId: '00000000-0000-0000-0000-000000000000',
      paymentId: '00000000-0000-0000-0000-000000000000',
      status: 'SUCCESS',
    });
    const sig = sign(body);
    const res = await request(app)
      .post('/api/payments/webhook')
      .set('X-Webhook-Signature', sig)
      .set('Content-Type', 'application/json')
      .send(body);
    expect(res.status).toBe(200);
    expect(res.body.data.received).toBe(true);
    expect(res.body.data.duplicate).toBe(false);
    expect(res.body.data.ignored).toBe(true);

    const recorded = await prisma.webhookEvent.findUnique({ where: { eventId } });
    expect(recorded).toBeTruthy();
  });

  it('Short/malformed signature returns 401 (not 500)', async () => {
    const body = JSON.stringify({ eventId: `evt-wh-${ts}-short`, eventType: 'y', bookingId: '00000000-0000-0000-0000-000000000000', paymentId: '00000000-0000-0000-0000-000000000000', status: 'SUCCESS' });
    const shortSig = 'abc';
    const res = await request(app)
      .post('/api/payments/webhook')
      .set('X-Webhook-Signature', shortSig)
      .set('Content-Type', 'application/json')
      .send(body);
    expect(res.status).toBe(401);
  });

  it('Long/malformed signature returns 401 (not 500)', async () => {
    const body = JSON.stringify({ eventId: `evt-wh-${ts}-long`, eventType: 'y', bookingId: '00000000-0000-0000-0000-000000000000', paymentId: '00000000-0000-0000-0000-000000000000', status: 'SUCCESS' });
    const longSig = 'a'.repeat(256);
    const res = await request(app)
      .post('/api/payments/webhook')
      .set('X-Webhook-Signature', longSig)
      .set('Content-Type', 'application/json')
      .send(body);
    expect(res.status).toBe(401);
  });
});

// ── 11. Webhook transitions booking state ───────────────────────────────────

describe('Webhook state transitions', () => {
  it('Webhook SUCCESS on PENDING booking → CONFIRMED', async () => {
    const creds = userCreds(12);
    await request(app).post('/api/auth/signup').send(creds);
    const login = await request(app).post('/api/auth/login').send({ email: creds.email, password: creds.password });
    const token = login.body.data.token;

    const bk = await request(app)
      .post('/api/bookings')
      .set('Authorization', `Bearer ${token}`)
      .send({ centreId, testId, appointmentAt: futureISO() });
    const bid = bk.body.data.id;

    const payRow = await prisma.payment.create({
      data: {
        bookingId: bid,
        amount: bk.body.data.amount,
        status: 'PENDING',
        idempotencyKey: `wh-test-${ts}-${Math.random()}`,
        providerRef: `sim-wh-${ts}`,
      },
    });

    const eventId = `evt-wh-${ts}-success`;
    const body = JSON.stringify({
      eventId,
      eventType: 'payment.completed',
      bookingId: bid,
      paymentId: payRow.id,
      status: 'SUCCESS',
    });
    const sig = sign(body);
    const res = await request(app)
      .post('/api/payments/webhook')
      .set('X-Webhook-Signature', sig)
      .set('Content-Type', 'application/json')
      .send(body);
    expect(res.status).toBe(200);
    expect(res.body.data.received).toBe(true);

    const updated = await prisma.booking.findUnique({ where: { id: bid } });
    expect(updated!.status).toBe('CONFIRMED');

    const updatedPay = await prisma.payment.findUnique({ where: { id: payRow.id } });
    expect(updatedPay!.status).toBe('SUCCESS');
  });

  it('Webhook on already-CONFIRMED booking is no-op', async () => {
    const creds = userCreds(13);
    await request(app).post('/api/auth/signup').send(creds);
    const login = await request(app).post('/api/auth/login').send({ email: creds.email, password: creds.password });
    const token = login.body.data.token;

    const bk = await request(app)
      .post('/api/bookings')
      .set('Authorization', `Bearer ${token}`)
      .send({ centreId, testId, appointmentAt: futureISO() });
    await request(app)
      .post('/api/payments')
      .set('Authorization', `Bearer ${token}`)
      .send({ bookingId: bk.body.data.id });

    const payRow = await prisma.payment.create({
      data: {
        bookingId: bk.body.data.id,
        amount: bk.body.data.amount,
        status: 'PENDING',
        idempotencyKey: `wh-noop-${ts}-${Math.random()}`,
        providerRef: `sim-wh-noop-${ts}`,
      },
    });

    const eventId = `evt-wh-${ts}-noop`;
    const body = JSON.stringify({
      eventId,
      eventType: 'payment.completed',
      bookingId: bk.body.data.id,
      paymentId: payRow.id,
      status: 'SUCCESS',
    });
    const sig = sign(body);
    const res = await request(app)
      .post('/api/payments/webhook')
      .set('X-Webhook-Signature', sig)
      .set('Content-Type', 'application/json')
      .send(body);
    expect(res.status).toBe(200);
    expect(res.body.data.received).toBe(true);
    expect(res.body.data.duplicate).toBe(false);

    const booking = await prisma.booking.findUnique({ where: { id: bk.body.data.id } });
    expect(booking!.status).toBe('CONFIRMED');
  });
});

// ── 12. Cancellation blocks further payment ─────────────────────────────────

describe('Cancelled booking cannot be paid', () => {
  it('Paying for CANCELLED booking returns 409', async () => {
    const creds = userCreds(14);
    await request(app).post('/api/auth/signup').send(creds);
    const login = await request(app).post('/api/auth/login').send({ email: creds.email, password: creds.password });
    const token = login.body.data.token;

    const bk = await request(app)
      .post('/api/bookings')
      .set('Authorization', `Bearer ${token}`)
      .send({ centreId, testId, appointmentAt: futureISO() });
    await request(app).patch(`/api/bookings/${bk.body.data.id}/cancel`).set('Authorization', `Bearer ${token}`);

    const res = await request(app)
      .post('/api/payments')
      .set('Authorization', `Bearer ${token}`)
      .send({ bookingId: bk.body.data.id });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('BOOKING_NOT_PAYABLE');
  });
});

// ── 13. Amount serialization ────────────────────────────────────────────────

describe('Amount serialization', () => {
  it('Amount is serialized as a numeric string', async () => {
    const creds = userCreds(15);
    await request(app).post('/api/auth/signup').send(creds);
    const login = await request(app).post('/api/auth/login').send({ email: creds.email, password: creds.password });
    const token = login.body.data.token;

    const bk = await request(app)
      .post('/api/bookings')
      .set('Authorization', `Bearer ${token}`)
      .send({ centreId, testId, appointmentAt: futureISO() });
    expect(typeof bk.body.data.amount).toBe('string');
    expect(Number(bk.body.data.amount)).toBeGreaterThan(0);
    expect(bk.body.data.amount).toMatch(/^\d+(\.\d+)?$/);
  });
});