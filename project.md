# PROJECT.md — EVE Healthcare: Diagnostic Test Booking & Payments Service

> Hand this file to the coding agent as the single source of truth. It defines the stack, data model, API
> contracts, state machines, edge cases, folder structure, and a phased build plan. The agent should build
> phases **in order**, committing after each phase, and should not deviate from the schema/contracts below
> without flagging the deviation in the README's "Assumptions" section.

---

## 0. Assumptions (read first)

The assignment brief allows "Python/Django, FastAPI, Flask, or another backend framework." We are using
**Node.js + Express + TypeScript** instead ("MERN, in TS" — but adapted):

- **M**ongo → **replaced with PostgreSQL** (hosted on **Neon**), per your instruction and the brief's own
  preference for PostgreSQL. Mongo is not used anywhere.
- **E**xpress → kept, as the HTTP framework, written in TypeScript.
- **R**eact → **not built**. The brief explicitly scopes this as a *backend-only* assignment ("Build a small
  backend service…", submission requirements list no frontend). Building a React app would add surface area
  without adding evaluation signal, and the evaluation rubric has zero weight on UI. If you want a thin React
  admin/demo UI later, it's listed under "Future Improvements" (§14) but is explicitly out of scope for the
  submission.
- **N**ode → kept, TypeScript throughout (no plain JS).
- **ORM**: **Prisma** — confirmed to be a strong fit here (see §1.2). Neon is a first-class supported Prisma
  data source with an official driver adapter.

If your agent harness disagrees with any assumption above, it should stop and ask rather than silently
changing the data model or API contracts, since those are graded directly.

---

## 1. Tech Stack

| Concern | Choice | Why |
|---|---|---|
| Language | TypeScript (strict mode) | Type safety across DB, API, and validation layers |
| Runtime | Node.js 20 LTS or newer | Stable, widely supported |
| Web framework | Express 4/5 | Minimal, well-understood, easy to grade/read |
| ORM | Prisma ORM | Type-safe queries, migrations, great Postgres/Neon support |
| Database | PostgreSQL via **Neon** (serverless Postgres) | Required by you; matches brief's preference |
| Auth | JWT (jsonwebtoken) + bcrypt for password hashing | Matches brief's "JWT-based authentication" requirement |
| Validation | Zod | Schema validation for every request body/query/params |
| Testing | Jest + Supertest (ts-jest) | Unit + integration/API tests |
| Docs | Swagger/OpenAPI via swagger-jsdoc + swagger-ui-express | Bonus item in brief |
| Logging | Pino (structured JSON logs) | Bonus item; production-realistic |
| Rate limiting | express-rate-limit | Bonus item |
| Containerization | Docker + docker-compose | Submission requirement *if* Docker is used — we will use it |
| Lint/format | ESLint + Prettier | Code quality signal |

### 1.1 Why Neon needs a bit of care

Neon is serverless Postgres: connections over plain TCP can be throttled/dropped in serverless/edge
environments, and Neon strongly recommends using its **pooled** connection string for app traffic and the
**unpooled** (direct) connection string for migrations. Since this project runs as a normal long-lived Node
process (not an edge function), a standard TCP connection works fine, but we still separate the two URLs so
migrations are always safe to run and so the app can benefit from PgBouncer-style pooling under load.

### 1.2 Prisma + Neon — confirmed compatible

Yes, Prisma works well here. Two supported integration paths exist:

1. **Prisma + `pg` driver adapter, pointed at Neon's pooled connection string** (simplest; works everywhere,
   including plain Node servers). This is what we'll use by default.
2. **Prisma + `@prisma/adapter-neon` + `@neondatabase/serverless`** — Neon's own serverless driver
   (HTTP/WebSocket-based), recommended specifically for edge runtimes or when you want to avoid TCP entirely.

Current Prisma versions require an explicit **driver adapter** at `PrismaClient` construction time (the
built-in query engine binary is no longer the default path). Use `@prisma/adapter-neon`:

```ts
// src/config/prisma.ts
import { PrismaClient } from '../../generated/prisma/client';
import { PrismaNeon } from '@prisma/adapter-neon';
import { Pool } from '@neondatabase/serverless';
import { env } from './env';

const pool = new Pool({ connectionString: env.DATABASE_URL });
const adapter = new PrismaNeon(pool);

export const prisma = new PrismaClient({ adapter });
```

```prisma
// prisma/schema.prisma
generator client {
  provider = "prisma-client"
  output   = "../generated/prisma"
}

datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")   // Neon pooled connection string (runtime queries)
  directUrl = env("DIRECT_URL")     // Neon unpooled connection string (migrations only)
}
```

```ts
// prisma.config.ts (Prisma reads DB config for CLI/migrate from here, not the schema, in current versions)
import 'dotenv/config';
import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
});
```

`.env`:
```
DATABASE_URL="postgresql://<user>:<password>@<endpoint>-pooler.<region>.aws.neon.tech/<db>?sslmode=require"
DIRECT_URL="postgresql://<user>:<password>@<endpoint>.<region>.aws.neon.tech/<db>?sslmode=require"
```

The agent should pin exact package versions in `package.json` at implementation time and verify against
current Prisma docs, since Prisma's adapter API has moved fast; if `@prisma/adapter-neon` import paths differ
from what's shown here at build time, follow the installed package's own README rather than this file.

---

## 2. Architecture

Layered, feature-folder architecture. Each feature owns its routes → controller → service → validation, and
all features share the Prisma client, middleware, and utils.

```
Request
  → Express router (feature routes)
  → middleware (auth, validation, rate-limit where relevant)
  → controller (HTTP concerns only: parse req, call service, shape res)
  → service (business logic, transactions, state transitions)
  → Prisma client (data access)
  → PostgreSQL (Neon)
```

Rules the agent should follow:
- Controllers never touch Prisma directly.
- Services never touch `req`/`res` directly.
- All multi-step DB writes that must be atomic (e.g., "create payment + update booking") use
  `prisma.$transaction`.
- All input validation happens at the edge (Zod, in middleware) before it reaches a controller.

---

## 3. Folder Structure

```
eve-diagnostics-api/
├── prisma/
│   ├── schema.prisma
│   ├── migrations/
│   └── seed.ts
├── generated/prisma/                # Prisma client output (gitignored)
├── src/
│   ├── config/
│   │   ├── env.ts                   # Zod-validated env vars, fail fast on missing config
│   │   ├── prisma.ts                # PrismaClient singleton w/ Neon adapter
│   │   └── logger.ts                # Pino logger instance
│   ├── middleware/
│   │   ├── authenticate.ts          # verifies JWT, attaches req.user
│   │   ├── authorize.ts             # role/ownership checks
│   │   ├── validate.ts              # Zod request validator (body/query/params)
│   │   ├── errorHandler.ts          # centralized error → HTTP response mapping
│   │   ├── rateLimiter.ts           # bonus
│   │   └── requestLogger.ts         # bonus, structured request logs
│   ├── modules/
│   │   ├── auth/
│   │   │   ├── auth.routes.ts
│   │   │   ├── auth.controller.ts
│   │   │   ├── auth.service.ts
│   │   │   ├── auth.schema.ts       # Zod schemas
│   │   │   └── auth.test.ts
│   │   ├── centres/
│   │   │   ├── centres.routes.ts
│   │   │   ├── centres.controller.ts
│   │   │   ├── centres.service.ts
│   │   │   ├── centres.schema.ts
│   │   │   └── centres.test.ts
│   │   ├── tests/                   # diagnostic test catalog
│   │   │   ├── tests.routes.ts
│   │   │   ├── tests.controller.ts
│   │   │   ├── tests.service.ts
│   │   │   ├── tests.schema.ts
│   │   │   └── tests.test.ts
│   │   ├── bookings/
│   │   │   ├── bookings.routes.ts
│   │   │   ├── bookings.controller.ts
│   │   │   ├── bookings.service.ts
│   │   │   ├── bookings.schema.ts
│   │   │   └── bookings.test.ts
│   │   └── payments/
│   │       ├── payments.routes.ts
│   │       ├── payments.controller.ts
│   │       ├── payments.service.ts  # mock payment engine + webhook processing
│   │       ├── payments.schema.ts
│   │       └── payments.test.ts
│   ├── utils/
│   │   ├── ApiError.ts              # typed error class w/ HTTP status + code
│   │   ├── asyncHandler.ts          # wraps async route handlers
│   │   └── pagination.ts
│   ├── types/
│   │   └── express.d.ts             # augment Express Request with req.user
│   ├── app.ts                       # Express app wiring (middleware, routes, error handler)
│   └── server.ts                    # boot: connect DB, start HTTP server
├── tests/
│   ├── integration/                 # supertest end-to-end API tests, run against a test DB
│   └── setup.ts
├── docs/
│   └── openapi.yaml                 # or generated from swagger-jsdoc comments
├── .env.example
├── .eslintrc.cjs
├── .prettierrc
├── Dockerfile
├── docker-compose.yml
├── jest.config.ts
├── package.json
├── tsconfig.json
├── prisma.config.ts
└── README.md
```

---

## 4. Data Model

### 4.1 Entity overview

- **User** — an account that can log in and book tests.
- **DiagnosticCentre** — a physical/lab location.
- **DiagnosticTest** — a master catalog entry (e.g., "Complete Blood Count"), independent of any centre.
- **CentreTest** — join entity: which tests a given centre offers, and at what price. Price lives here, not
  on `DiagnosticTest`, because the same test can be priced differently per centre.
- **Booking** — a user's reservation of a specific `CentreTest` for a specific appointment time. Snapshots the
  price at booking time (`amount`) so later price changes don't retroactively alter past bookings.
- **Payment** — one attempt to pay for a booking. A booking can have multiple `Payment` rows over time (e.g.,
  a failed attempt followed by a retry), but only one can ever bring the booking to `CONFIRMED`.
- **WebhookEvent** — a durable log of every webhook event received, keyed by the provider's event ID, used
  purely to guarantee idempotency.

### 4.2 Prisma schema

```prisma
// prisma/schema.prisma

generator client {
  provider = "prisma-client"
  output   = "../generated/prisma"
}

datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")
  directUrl = env("DIRECT_URL")
}

enum Role {
  USER
  ADMIN
}

enum BookingStatus {
  PENDING
  CONFIRMED
  FAILED
  CANCELLED
}

enum PaymentStatus {
  PENDING
  SUCCESS
  FAILED
}

model User {
  id           String    @id @default(uuid())
  name         String
  email        String    @unique
  passwordHash String
  role         Role      @default(USER)
  bookings     Booking[]
  createdAt    DateTime  @default(now())
  updatedAt    DateTime  @updatedAt

  @@map("users")
}

model DiagnosticCentre {
  id          String       @id @default(uuid())
  name        String
  location    String
  isActive    Boolean      @default(true)
  centreTests CentreTest[]
  bookings    Booking[]
  createdAt   DateTime     @default(now())
  updatedAt   DateTime     @updatedAt

  @@index([location])
  @@map("diagnostic_centres")
}

model DiagnosticTest {
  id          String       @id @default(uuid())
  name        String
  description String?
  centreTests CentreTest[]
  createdAt   DateTime     @default(now())
  updatedAt   DateTime     @updatedAt

  @@map("diagnostic_tests")
}

// The price a specific centre charges for a specific test.
model CentreTest {
  id        String           @id @default(uuid())
  centreId  String
  testId    String
  price     Decimal          @db.Decimal(10, 2)
  isActive  Boolean          @default(true)
  centre    DiagnosticCentre @relation(fields: [centreId], references: [id])
  test      DiagnosticTest   @relation(fields: [testId], references: [id])
  bookings  Booking[]
  createdAt DateTime         @default(now())
  updatedAt DateTime         @updatedAt

  @@unique([centreId, testId])
  @@map("centre_tests")
}

model Booking {
  id            String        @id @default(uuid())
  userId        String
  centreId      String
  testId        String
  centreTestId  String
  appointmentAt DateTime
  amount        Decimal       @db.Decimal(10, 2)   // snapshot of CentreTest.price at booking time
  status        BookingStatus @default(PENDING)
  user          User          @relation(fields: [userId], references: [id])
  centre        DiagnosticCentre @relation(fields: [centreId], references: [id])
  centreTest    CentreTest    @relation(fields: [centreTestId], references: [id])
  payments      Payment[]
  createdAt     DateTime      @default(now())
  updatedAt     DateTime      @updatedAt

  @@index([userId])
  @@index([status])
  @@map("bookings")
}

model Payment {
  id             String        @id @default(uuid())
  bookingId      String
  booking        Booking       @relation(fields: [bookingId], references: [id])
  amount         Decimal       @db.Decimal(10, 2)
  status         PaymentStatus @default(PENDING)
  idempotencyKey String        @unique   // client-supplied or server-generated per attempt
  providerRef    String?       @unique   // simulated provider's payment/transaction id
  createdAt      DateTime      @default(now())
  updatedAt      DateTime      @updatedAt

  @@index([bookingId])
  @@map("payments")
}

// Durable idempotency ledger for inbound webhook calls.
model WebhookEvent {
  id          String   @id @default(uuid())
  eventId     String   @unique  // provider's unique event id — the idempotency key
  eventType   String
  payload     Json
  processedAt DateTime @default(now())

  @@map("webhook_events")
}
```

### 4.3 Why this shape

- **`CentreTest` as a first-class join model** (not an implicit m2m) lets us store `price` and `isActive`
  per centre/test pair, and gives `Booking` a stable foreign key (`centreTestId`) to snapshot from.
- **`Booking.amount` is a snapshot**, not a live join to `CentreTest.price` — a real-world requirement: if a
  centre changes its price tomorrow, today's booking must not silently change cost.
- **`Payment` is 1-to-many off `Booking`** so failed attempts + retries are fully auditable, instead of
  overwriting a single payment row (bad for an audit trail and for idempotency).
- **`Payment.idempotencyKey` is unique** — protects `POST /payments/` from being double-submitted (e.g., a
  client retry on a timeout) creating two charges for the same intent.
- **`WebhookEvent.eventId` is unique** — this is the actual idempotency mechanism for the webhook endpoint;
  see §7.3.

---

## 5. Authentication & Authorization

- **Signup**: `POST /api/auth/signup` — hash password with bcrypt (cost factor 10–12), create `User`
  (`role: USER` by default), return a JWT.
- **Login**: `POST /api/auth/login` — verify password, return a JWT.
- **JWT payload**: `{ sub: userId, role, iat, exp }`. Short-lived (e.g., 1h) is fine for this assignment;
  refresh tokens are explicitly out of scope (see §14).
- **`authenticate` middleware**: reads `Authorization: Bearer <token>`, verifies signature + expiry, attaches
  `req.user = { id, role }`. Missing/invalid/expired token → `401`.
- **`authorize` middleware**: two flavors —
  - `requireRole('ADMIN')` for centre/test management endpoints.
  - Ownership check inline in the booking service/controller: a `USER` may only read/cancel **their own**
    bookings; attempting to access another user's booking → `403` (not `404`, but see the note in §8 about
    not leaking existence — this assignment uses `403` for clarity/gradeability, documented as a deliberate
    choice in the README).
- Admin-only endpoints are for seeding/managing centres, tests, and centre-test pricing — a normal `USER`
  cannot create centres or tests.

---

## 6. API Design

Base path: `/api`. All responses use a consistent envelope.

**Success:**
```json
{ "data": { /* ... */ }, "meta": { /* pagination, optional */ } }
```

**Error:**
```json
{ "error": { "code": "BOOKING_NOT_FOUND", "message": "Booking not found", "details": null } }
```

### 6.1 Auth

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/auth/signup` | none | Create a user account |
| POST | `/api/auth/login` | none | Authenticate, receive JWT |

```http
POST /api/auth/signup
{ "name": "Asha Rao", "email": "asha@example.com", "password": "S3cure!pass" }

201
{ "data": { "user": { "id": "...", "name": "Asha Rao", "email": "asha@example.com", "role": "USER" },
            "token": "eyJhbGciOi..." } }
```

```http
POST /api/auth/login
{ "email": "asha@example.com", "password": "S3cure!pass" }

200
{ "data": { "token": "eyJhbGciOi..." } }
```

### 6.2 Diagnostic Centres & Tests

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/centres` | none | List centres (pagination, `?location=`) |
| GET | `/api/centres/:centreId` | none | Centre detail incl. tests it offers + price |
| POST | `/api/centres` | admin | Create a centre |
| GET | `/api/tests` | none | List master test catalog (pagination) |
| POST | `/api/tests` | admin | Create a test in the catalog |
| POST | `/api/centres/:centreId/tests` | admin | Attach a test to a centre with a price |
| PATCH | `/api/centres/:centreId/tests/:testId` | admin | Update price / active status |

```http
GET /api/centres/:centreId

200
{ "data": {
    "id": "...", "name": "HealthFirst Diagnostics", "location": "Bengaluru",
    "tests": [
      { "testId": "...", "name": "Complete Blood Count", "price": "450.00" },
      { "testId": "...", "name": "Lipid Profile", "price": "900.00" }
    ]
} }
```

### 6.3 Bookings

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/bookings` | user | Create a booking (status starts `PENDING`) |
| GET | `/api/bookings` | user | List **own** bookings (pagination, `?status=`) |
| GET | `/api/bookings/:id` | user (owner) / admin | Booking detail |
| PATCH | `/api/bookings/:id/cancel` | user (owner) | Cancel a booking |

```http
POST /api/bookings
Authorization: Bearer <token>
{ "centreId": "...", "testId": "...", "appointmentAt": "2026-10-05T09:30:00.000Z" }

201
{ "data": { "id": "...", "status": "PENDING", "amount": "450.00",
            "appointmentAt": "2026-10-05T09:30:00.000Z" } }
```

Validation for booking creation:
- `centreId` + `testId` must resolve to an **active** `CentreTest` (400/404 otherwise).
- `appointmentAt` must be a valid ISO datetime **in the future** (400 otherwise).
- Price is read from `CentreTest.price` server-side and copied into `Booking.amount` — never trust a
  client-supplied amount.

```http
PATCH /api/bookings/:id/cancel
Authorization: Bearer <token>

200
{ "data": { "id": "...", "status": "CANCELLED" } }
```
Cancellation rules: only `PENDING` or `CONFIRMED` bookings with a future `appointmentAt` can be cancelled;
`FAILED`/already-`CANCELLED` → `409`.

### 6.4 Payments

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/payments` | user (owner of booking) | Simulate a payment attempt for a booking |
| POST | `/api/payments/webhook` | signed (shared secret, no user JWT) | Provider → us status callback |

```http
POST /api/payments
Authorization: Bearer <token>
Idempotency-Key: 9f1c2e6e-...           (optional; server generates one if absent)
{ "bookingId": "..." }

200
{ "data": { "paymentId": "...", "bookingId": "...", "status": "SUCCESS" } }
```

Behavior (see §7 for full detail):
1. Booking must belong to the caller and be `PENDING`. Otherwise `409 BOOKING_NOT_PAYABLE`.
2. If a `Payment` with the same `idempotencyKey` already exists, return its stored result instead of
   simulating again (idempotent retry-safe).
3. Simulate an outcome (`SUCCESS` or `FAILED`) — configurable via env for deterministic tests.
4. In one DB transaction: write the `Payment` row, then update `Booking.status` to `CONFIRMED` (on success)
   or `FAILED` (on failure).

```http
POST /api/payments/webhook
X-Webhook-Signature: <hmac-sha256 of raw body using WEBHOOK_SECRET>
{ "eventId": "evt_8f2a...", "bookingId": "...", "paymentId": "...", "status": "SUCCESS" }

200
{ "data": { "received": true, "duplicate": false } }
```

If the same `eventId` arrives again: `200 { "data": { "received": true, "duplicate": true } }` — same status
code, no state change, no duplicate rows. See §7.3.

---

## 7. Booking & Payment State Machines

### 7.1 Booking status

```
            create booking
                 │
                 ▼
             ┌────────┐
     ┌──────►│PENDING │◄───────────┐
     │       └───┬────┘            │
     │           │                 │ (retry after FAILED payment
     │   payment │                 │  re-attempt goes through a
     │   success │  payment failure│  NEW payment; booking can be
     │           ▼                 │  moved back to PENDING by the
     │      ┌──────────┐           │  payments service before retry
     │      │CONFIRMED │           │
     │      └────┬─────┘      ┌────┴───┐
     │           │            │ FAILED │
     │   user cancels         └────────┘
     │           ▼
     │      ┌───────────┐
     └─────►│ CANCELLED │
            └───────────┘
```

Rules:
- A booking is created as `PENDING` and is **not** payable-confirmed until a payment succeeds.
- `PENDING → CONFIRMED`: payment success (via `/payments` sync call or the async webhook).
- `PENDING → FAILED`: payment failure.
- `PENDING → CANCELLED` or `CONFIRMED → CANCELLED`: explicit user cancellation (only while `appointmentAt`
  is in the future).
- `FAILED → PENDING`: allowed only via an explicit "retry payment" action (out of scope for v1 unless time
  permits — see §14); default behavior is the user cancels a `FAILED` booking and creates a new one.
- No other transitions are valid. The service layer enforces this with an explicit allow-list, not ad-hoc
  `if` checks scattered around — one `canTransition(from, to)` function used everywhere.

### 7.2 Payment simulation

`POST /api/payments` does not call any real gateway. The service:
1. Loads the booking, validates ownership + `PENDING` status.
2. Checks `idempotencyKey` — if seen before, short-circuits and returns the stored result.
3. Decides `SUCCESS`/`FAILED` via a pluggable simulator (default: random with a configurable success rate,
   e.g. `PAYMENT_SUCCESS_RATE=0.85`, overridable per-request in non-prod via a `forceStatus` field for
   deterministic tests).
4. Persists `Payment` + updates `Booking.status` **in a single `prisma.$transaction`**.

### 7.3 Webhook idempotency — the core edge case

This is the most heavily graded edge case in the brief, so it gets an explicit algorithm:

```
on POST /payments/webhook(eventId, bookingId, paymentId, status):
  1. verify signature (HMAC of raw body against WEBHOOK_SECRET); reject 401 if invalid
  2. validate payload shape (zod); reject 400 if malformed
  3. BEGIN TRANSACTION
       try INSERT INTO webhook_events (eventId, eventType, payload) VALUES (...)
       -- eventId has a UNIQUE constraint
       if insert violates unique constraint:
           ROLLBACK / no-op
           RETURN 200 { received: true, duplicate: true }   // already processed, don't reprocess
       -- first time seeing this event:
       load booking (by bookingId), load payment (by paymentId) FOR UPDATE
       if booking not found or payment not found:
           mark webhook_event as processed with an error note, RETURN 404 (or 200+duplicate:false+ignored,
           see note below), do not throw — a malformed/late webhook must not crash the endpoint
       if booking.status is not PENDING (already CONFIRMED/FAILED/CANCELLED by a prior event or the sync
       payment call):
           no-op (idempotent no matter which path — sync API or webhook — won by the race)
       else:
           update payment.status, update booking.status accordingly
     COMMIT
  4. RETURN 200 { received: true, duplicate: false }
```

Key design decisions the agent should preserve:
- **The uniqueness guarantee lives in the database** (`WebhookEvent.eventId @unique`), not in application
  memory — this is correct under concurrent/retried requests and multiple server instances.
- **Always return `200`** to the provider once the event is durably recorded, even if it turns out to be a
  duplicate or references a booking already resolved by another path — returning an error on a duplicate
  would make most real payment providers retry forever.
- **`FOR UPDATE` / transaction row locking** prevents a race where the synchronous `POST /payments` call and
  an async webhook for the *same* payment both try to transition the booking at the same moment.
- A webhook for a booking that's already `CONFIRMED`/`FAILED`/`CANCELLED` is a no-op, not an error — this
  makes the endpoint safe against out-of-order delivery too, not just exact duplicates.

---

## 8. Edge Cases Checklist

The agent should have a test (unit or integration) for every row below.

| # | Case | Expected behavior |
|---|---|---|
| 1 | Signup with an email already in use | `409 EMAIL_TAKEN` |
| 2 | Login with wrong password | `401 INVALID_CREDENTIALS` |
| 3 | Request with missing/malformed JWT | `401 UNAUTHORIZED` |
| 4 | Request with expired JWT | `401 TOKEN_EXPIRED` |
| 5 | Booking a non-existent centre/test | `404 CENTRE_TEST_NOT_FOUND` |
| 6 | Booking an inactive `CentreTest` | `400 TEST_NOT_AVAILABLE` |
| 7 | Booking with a past `appointmentAt` | `400 INVALID_APPOINTMENT_TIME` |
| 8 | Reading/cancelling another user's booking | `403 FORBIDDEN` |
| 9 | Cancelling an already-`CANCELLED`/`FAILED` booking | `409 BOOKING_NOT_CANCELLABLE` |
| 10 | Paying for a booking that's not `PENDING` | `409 BOOKING_NOT_PAYABLE` |
| 11 | Paying with a re-used `Idempotency-Key` | Returns the original stored result, no duplicate `Payment` row |
| 12 | Same webhook `eventId` delivered twice (or N times) | Exactly one state transition; `duplicate: true` on repeats |
| 13 | Webhook with invalid signature | `401`, event not recorded as processed |
| 14 | Webhook referencing an unknown booking/payment | Recorded, does not throw, returns 200 (see §7.3) |
| 15 | Concurrent `POST /payments` for the same booking (double-click) | Transaction + `PENDING` check ensures only one succeeds in moving state; the second sees `409` or the idempotent result |
| 16 | Invalid pagination params (`page=-1`, `limit=0`) | `400`, or safely clamp to sane defaults (document choice) |
| 17 | Non-admin hitting admin-only centre/test creation endpoints | `403 FORBIDDEN` |
| 18 | Negative or zero price on centre-test creation | `400 VALIDATION_ERROR` |
| 19 | Decimal precision on `amount`/`price` | Always `Decimal(10,2)` in DB and serialized as a fixed 2-decimal string in responses, never a floating-point `number`, to avoid rounding bugs |

---

## 9. Validation & Error Handling

- Every route has a Zod schema for `body`/`params`/`query`, enforced by a `validate(schema)` middleware
  before the controller runs.
- A single `ApiError` class (`statusCode`, `code`, `message`, optional `details`) is thrown from
  services/controllers; a centralized Express error-handling middleware converts it (and any unexpected
  error) into the standard error envelope from §6, logging unexpected (5xx) errors with a stack trace via
  Pino and returning a generic message to the client for those.
- `asyncHandler` wrapper avoids repetitive try/catch in every controller.

---

## 10. Testing Strategy

- **Unit tests**: booking state-transition logic, payment simulator, JWT helpers, password hashing —
  pure functions/services, Prisma mocked or not invoked.
- **Integration tests** (Supertest against a running Express app + a real test database — either a local
  Postgres via docker-compose or a dedicated Neon branch used only for CI): full request/response cycles for
  every endpoint in §6, plus every row in §8's edge case table.
- **Idempotency tests are mandatory**: send the same webhook payload twice (and ideally concurrently) and
  assert exactly one `Payment`/status transition and no duplicate `WebhookEvent` rows.
- Use a `beforeEach` that resets relevant tables (or wraps each test in a transaction that's rolled back) so
  tests are independent and repeatable.
- `npm test` runs everything; `npm run test:unit` / `npm run test:integration` split if useful.

---

## 11. Seed Data

`prisma/seed.ts` should create, at minimum:
- 2 users (one plain, optionally one admin) with known credentials documented in the README for manual
  testing.
- 2–3 diagnostic centres in different locations.
- 4–5 diagnostic tests in the catalog.
- `CentreTest` rows linking centres to a subset of tests at varied prices.

Run via `npx prisma db seed` (configured in `package.json`'s `prisma.seed` field).

---

## 12. Environment Variables

`.env.example`:
```
NODE_ENV=development
PORT=4000

DATABASE_URL=postgresql://user:pass@ep-xxxx-pooler.region.aws.neon.tech/db?sslmode=require
DIRECT_URL=postgresql://user:pass@ep-xxxx.region.aws.neon.tech/db?sslmode=require

JWT_SECRET=change-me
JWT_EXPIRES_IN=1h

WEBHOOK_SECRET=change-me-too
PAYMENT_SUCCESS_RATE=0.85

RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX=100
```
`src/config/env.ts` validates all of these with Zod at boot and exits fast with a clear message if any
required var is missing — do not let the app start silently misconfigured.

---

## 13. Docker

`Dockerfile` (multi-stage: build TS → run compiled JS):
```dockerfile
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npx prisma generate
RUN npm run build

FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/generated ./generated
COPY package*.json ./
EXPOSE 4000
CMD ["node", "dist/server.js"]
```

`docker-compose.yml` — since we use Neon (cloud) as the primary DB, compose mainly runs the API; optionally
include a local Postgres service for offline/CI testing so the project isn't hard-dependent on network
access:
```yaml
services:
  api:
    build: .
    env_file: .env
    ports:
      - "4000:4000"
    depends_on:
      - db
  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
      POSTGRES_DB: eve_diagnostics_test
    ports:
      - "5433:5432"
    volumes:
      - db_data:/var/lib/postgresql/data
volumes:
  db_data:
```

---

## 14. Explicitly Out of Scope (document in README as "future improvements")

- React/frontend UI.
- Refresh tokens / logout-with-revocation (JWT is single-token, short-lived for this scope).
- Real payment gateway integration.
- Multi-currency support.
- Full RBAC beyond `USER`/`ADMIN`.
- Booking-retry-payment flow (`FAILED → PENDING`) — noted as a natural next step.
- Redis caching / Celery-equivalent background jobs (BullMQ) — noted as bonus candidates if time remains.

---

## 15. Build Plan — Phased Execution for the Agent

Execute in order. Commit after each phase with a descriptive message. Do not start a phase until the
previous phase's tests pass.

**Phase 0 — Project scaffolding**
Initialize TS + Express project, ESLint/Prettier, tsconfig (strict), folder structure from §3, `env.ts`,
logger, `app.ts`/`server.ts` with a `GET /health` endpoint. Commit.

**Phase 1 — Database**
Write `prisma/schema.prisma` exactly as in §4.2. Set up Neon project, get pooled + direct URLs, run first
migration (`prisma migrate dev`). Write `prisma/seed.ts` per §11. Verify `npx prisma studio` shows seeded
data. Commit.

**Phase 2 — Auth module**
Signup, login, JWT issuance, `authenticate` middleware, `authorize` middleware, password hashing. Unit +
integration tests. Commit.

**Phase 3 — Centres & Tests module**
CRUD per §6.2 (admin-gated writes, public reads), pagination on list endpoints. Tests. Commit.

**Phase 4 — Bookings module**
Create/list/detail/cancel per §6.3, price-snapshot logic, ownership checks, state-machine guard from §7.1.
Tests covering edge cases #5–#9 from §8. Commit.

**Phase 5 — Payments module (sync)**
`POST /payments` per §7.2, idempotency-key handling, transactional booking-status update. Tests covering
edge cases #10–#11, #15. Commit.

**Phase 6 — Payments webhook (async, idempotent)**
`POST /payments/webhook` per §7.3, `WebhookEvent` ledger, signature verification, row locking. Tests covering
edge cases #12–#14, including a duplicate-delivery and a concurrent-delivery test. Commit.

**Phase 7 — Hardening pass**
Sweep the full §8 table; add any missing validation/error cases; centralize error handling if not already
consistent; confirm every endpoint has a Zod schema. Commit.

**Phase 8 — Bonus (time permitting, in this priority order)**
1. Swagger/OpenAPI docs (high value, low effort, directly graded).
2. Pagination polish + rate limiting.
3. Structured logging (Pino) on all requests + errors.
4. Docker + docker-compose verified end-to-end (`docker compose up` → hit `/health`).
5. Retry handling for webhook processing (e.g., a documented approach to re-drive failed webhook side
   effects — since our idempotency design already makes retries safe, this is mostly about outbound retry
   logging/metrics rather than new state).
6. Redis/Celery-equivalent — only if substantial time remains; not expected for this assignment's scope.

**Phase 9 — README + submission polish**
Write README covering: local run instructions (incl. Neon setup + `.env`), full endpoint reference with
example requests/responses, schema diagram or table, assumptions (point back to §0 of this doc), and a
"what I'd improve with more time" section drawn from §14. Final full test run. Commit + tag.

---

## 16. README Must-Haves (checklist for Phase 9)

- [ ] How to run locally (with and without Docker)
- [ ] How to set up Neon + apply migrations + seed
- [ ] Full endpoint list with example curl/HTTPie requests and responses
- [ ] Schema description (can reuse §4 of this doc, adapted)
- [ ] Assumptions made (§0 + any made during implementation)
- [ ] What's out of scope / what you'd improve with more time (§14)
- [ ] How idempotency is guaranteed for the webhook (short version of §7.3 — interviewers may ask you to
      explain this live, per the brief's note about a follow-up interview stage)
