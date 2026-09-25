import { v4 as uuidv4 } from 'uuid';
import crypto from 'node:crypto';
import { prisma, Prisma } from '../../config/prisma';
import { env } from '../../config/env';
import { ApiError } from '../../utils/ApiError';

type PaymentStatus = 'PENDING' | 'SUCCESS' | 'FAILED';

function simulatePayment(): PaymentStatus {
  return Math.random() < env.PAYMENT_SUCCESS_RATE ? 'SUCCESS' : 'FAILED';
}

export async function createPayment(
  userId: string,
  data: { bookingId: string },
  idempotencyKey?: string,
) {
  const key = idempotencyKey || uuidv4();

  const existingPayment = await prisma.payment.findUnique({
    where: { idempotencyKey: key },
  });
  if (existingPayment) {
    return {
      paymentId: existingPayment.id,
      bookingId: existingPayment.bookingId,
      status: existingPayment.status,
    };
  }

  const paymentStatus = simulatePayment();

  const result = await prisma.$transaction(async (tx) => {
    const bookings = await tx.$queryRaw<{ id: string; userId: string; amount: string; status: string }[]>`
      SELECT id, "userId", amount, status FROM bookings WHERE id = ${data.bookingId} FOR UPDATE
    `;
    const booking = bookings[0];

    if (!booking) {
      throw ApiError.notFound('BOOKING_NOT_FOUND', 'Booking not found');
    }

    if (booking.userId !== userId) {
      throw ApiError.forbidden('FORBIDDEN', 'Access denied');
    }

    if (booking.status !== 'PENDING') {
      throw ApiError.conflict('BOOKING_NOT_PAYABLE', `Booking is ${booking.status.toLowerCase()}, cannot process payment`);
    }

    const payment = await tx.payment.create({
      data: {
        bookingId: data.bookingId,
        amount: booking.amount,
        status: paymentStatus,
        idempotencyKey: key,
        providerRef: `sim_${uuidv4()}`,
      },
    });

    await tx.booking.update({
      where: { id: data.bookingId },
      data: { status: paymentStatus === 'SUCCESS' ? 'CONFIRMED' : 'FAILED' },
    });

    return payment;
  });

  return {
    paymentId: result.id,
    bookingId: result.bookingId,
    status: result.status,
  };
}

export function verifyWebhookSignature(rawBody: string, signature: string): boolean {
  const expectedSignature = crypto
    .createHmac('sha256', env.WEBHOOK_SECRET)
    .update(rawBody)
    .digest('hex');
  const sigBuf = Buffer.from(signature);
  const expectedBuf = Buffer.from(expectedSignature);
  if (sigBuf.length !== expectedBuf.length) {
    return false;
  }
  return crypto.timingSafeEqual(sigBuf, expectedBuf);
}

export async function processWebhook(payload: {
  eventId: string;
  eventType: string;
  bookingId: string;
  paymentId: string;
  status: PaymentStatus;
}) {
  return prisma.$transaction(async (tx) => {
    try {
      await tx.webhookEvent.create({
        data: {
          eventId: payload.eventId,
          eventType: payload.eventType,
          payload: payload as unknown as Prisma.InputJsonValue,
        },
      });
    } catch (error: unknown) {
      if (
        error instanceof Error &&
        'code' in error &&
        (error as { code: string }).code === 'P2002'
      ) {
        return { received: true, duplicate: true };
      }
      throw error;
    }

    const bookings = await tx.$queryRaw<{ id: string; status: string }[]>`
      SELECT id, status FROM bookings WHERE id = ${payload.bookingId} FOR UPDATE
    `;
    const booking = bookings[0];

    if (!booking) {
      return { received: true, duplicate: false, ignored: true };
    }

    const payments = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM payments WHERE id = ${payload.paymentId}
    `;
    const payment = payments[0];

    if (!payment) {
      return { received: true, duplicate: false, ignored: true };
    }

    if (booking.status !== 'PENDING') {
      return { received: true, duplicate: false };
    }

    await tx.payment.update({
      where: { id: payload.paymentId },
      data: { status: payload.status },
    });

    await tx.booking.update({
      where: { id: payload.bookingId },
      data: { status: payload.status === 'SUCCESS' ? 'CONFIRMED' : 'FAILED' },
    });

    return { received: true, duplicate: false };
  });
}