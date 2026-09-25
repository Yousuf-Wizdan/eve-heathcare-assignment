# EVE Healthcare Diagnostics API

A backend service for diagnostic test booking and payments, built with Node.js, Express, TypeScript, and PostgreSQL (via Neon).

## Tech Stack

- **Runtime**: Node.js 20 LTS
- **Language**: TypeScript (strict mode)
- **Framework**: Express 5
- **Database**: PostgreSQL via Neon (serverless)
- **ORM**: Prisma
- **Authentication**: JWT with bcrypt password hashing
- **Validation**: Zod
- **Logging**: Pino (structured JSON)
- **API Docs**: Swagger/OpenAPI

## Features

- User authentication (signup/login) with JWT
- Role-based access control (USER/ADMIN)
- Diagnostic centre and test management
- Booking system with state machine (PENDING → CONFIRMED/FAILED/CANCELLED)
- Payment simulation with idempotency
- Webhook processing with idempotent event handling (HMAC-SHA256 signed)
- Pagination support
- Rate limiting
- Structured logging with Pino
- API documentation with Swagger/OpenAPI

## Getting Started

### Prerequisites

- Node.js 20+
- PostgreSQL database (or Neon account)

### Using Docker (Recommended)

1. Build and run with Docker Compose:
```bash
docker-compose up -d
```

This will:
- Start a PostgreSQL database on port 5433
- Build and start the API server on port 4000
- Automatically run database migrations and seed data

No `.env` file is needed — all configuration is provided via `docker-compose.yml` with sensible defaults.

To view logs:
```bash
docker-compose logs -f api
```

To stop:
```bash
docker-compose down
```

To reset the database (delete volumes and restart):
```bash
docker-compose down -v
docker-compose up -d
```

### Manual Installation

1. Clone the repository:
```bash
git clone https://github.com/Yousuf-Wizdan/eve-heathcare-assignment.git
cd eve-diagnostics-api
```

2. Install dependencies:
```bash
npm install
```

3. Set up environment variables:
```bash
cp .env.example .env
# Edit .env with your database credentials
```

4. Run database migrations:
```bash
npx prisma migrate dev
```

5. Seed the database:
```bash
npx prisma db seed
```

6. Start the development server:
```bash
npm run dev
```

The API will be available at `http://localhost:4000`

### Building for Production

```bash
npm run build
npm start
```

## API Documentation

Once the server is running, visit:
- Swagger UI: `http://localhost:4000/api-docs`
- Health check: `http://localhost:4000/health`

## API Endpoints

### Authentication

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/auth/signup` | Public | Create a new user account |
| POST | `/api/auth/login` | Public | Authenticate and receive JWT |

**Signup example:**
```bash
curl -X POST http://localhost:4000/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{"name": "Asha Rao", "email": "asha@example.com", "password": "S3cure!pass"}'

# Response (201):
# { "data": { "user": { "id": "...", "name": "Asha Rao", "email": "asha@example.com", "role": "USER" }, "token": "eyJhbGci..." } }
```

**Login example:**
```bash
curl -X POST http://localhost:4000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "asha@example.com", "password": "S3cure!pass"}'

# Response (200):
# { "data": { "token": "eyJhbGci..." } }
```

### Diagnostic Centres

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/centres` | Public | List centres (with pagination, filter by `?location=`) |
| GET | `/api/centres/:id` | Public | Get centre details with tests and prices |
| POST | `/api/centres` | Admin | Create a new centre |

**Get centre detail example:**
```bash
# Use the UUID returned from the list centres endpoint
curl http://localhost:4000/api/centres/<centre-uuid>

# Response (200):
# { "data": { "id": "...", "name": "HealthFirst Diagnostics", "location": "Bengaluru",
#   "tests": [
#     { "testId": "...", "name": "Complete Blood Count", "price": "450.00" },
#     { "testId": "...", "name": "Lipid Profile", "price": "900.00" }
#   ] } }
```

### Diagnostic Tests

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/tests` | Public | List all tests (with pagination) |
| POST | `/api/tests` | Admin | Create a new test |
| POST | `/api/centres/:centreId/tests` | Admin | Attach test to centre with price |
| PATCH | `/api/centres/:centreId/tests/:testId` | Admin | Update centre test price/status |

### Bookings

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/bookings` | User | Create a new booking |
| GET | `/api/bookings` | User | List user's bookings (filter by `?status=`) |
| GET | `/api/bookings/:id` | User (owner) / Admin | Get booking details |
| PATCH | `/api/bookings/:id/cancel` | User (owner) | Cancel a booking |

**Create booking example:**
```bash
curl -X POST http://localhost:4000/api/bookings \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{"centreId": "<centre-uuid>", "testId": "<test-uuid>", "appointmentAt": "2026-10-05T09:30:00.000Z"}'

# Response (201):
# { "data": { "id": "...", "status": "PENDING", "amount": "450", "appointmentAt": "2026-10-05T09:30:00.000Z" } }
```

**Cancel booking example:**
```bash
curl -X PATCH http://localhost:4000/api/bookings/<booking-id>/cancel \
  -H "Authorization: Bearer <token>"

# Response (200):
# { "data": { "id": "...", "status": "CANCELLED" } }
```

### Payments

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/payments` | User (owner) | Process payment for booking |
| POST | `/api/payments/webhook` | Webhook signature | Receive payment status updates |

**Process payment example:**
```bash
curl -X POST http://localhost:4000/api/payments \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -H "Idempotency-Key: 9f1c2e6e-..." \
  -d '{"bookingId": "<booking-id>"}'

# Response (200):
# { "data": { "paymentId": "...", "bookingId": "...", "status": "SUCCESS" } }
```

**Webhook example:**
```bash
# The webhook requires an HMAC-SHA256 signature of the raw request body
curl -X POST http://localhost:4000/api/payments/webhook \
  -H "Content-Type: application/json" \
  -H "X-Webhook-Signature: <hmac-sha256-of-body>" \
  -d '{"eventId": "evt_8f2a...", "eventType": "payment.completed", "bookingId": "...", "paymentId": "...", "status": "SUCCESS"}'

# Response (200):
# { "data": { "received": true, "duplicate": false } }
```

## Environment Variables

```env
# Server
NODE_ENV=development
PORT=4000

# Database (Neon)
DATABASE_URL=postgresql://user:pass@ep-xxxx-pooler.region.aws.neon.tech/db?sslmode=require

# JWT
JWT_SECRET=your-secret-key
JWT_EXPIRES_IN=1h

# Webhook
WEBHOOK_SECRET=your-webhook-secret
PAYMENT_SUCCESS_RATE=0.85

# Rate Limiting
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX=100
```

- `DATABASE_URL` — Neon connection string (pooled or direct)
- `PAYMENT_SUCCESS_RATE` — Probability (0–1) that a simulated payment succeeds (default: 0.85)
- `JWT_EXPIRES_IN` — JWT token expiration (e.g. `1h`, `3600`)

## Seed Data

After running `npx prisma db seed`, the following test data is available:

**Users:**
- User: `user@example.com` / `Password123!`
- Admin: `admin@example.com` / `Admin123!`

**Diagnostic Centres:**
- HealthFirst Diagnostics (Bengaluru)
- MediCare Labs (Mumbai)
- CityHealth Diagnostics (Delhi)

**Diagnostic Tests:**
- Complete Blood Count
- Lipid Profile
- Blood Glucose Fasting
- Thyroid Profile
- Liver Function Test

## Database Schema

The database uses the following main entities:

- **User**: User accounts with role-based access (USER/ADMIN)
- **DiagnosticCentre**: Physical diagnostic centres with location and active status
- **DiagnosticTest**: Master test catalog entries (independent of centres)
- **CentreTest**: Join entity linking centres to tests with per-centre pricing and active status
- **Booking**: User bookings with status tracking (PENDING → CONFIRMED/FAILED/CANCELLED). Snapshots the price at booking time.
- **Payment**: Payment records with idempotency keys. A booking can have multiple payment attempts; only one can confirm the booking.
- **WebhookEvent**: Idempotent webhook event logging using a unique `eventId` constraint.

## Idempotency

### Payment Idempotency
- Each payment request can include an `Idempotency-Key` header
- If absent, the server generates one (UUID)
- Duplicate requests with the same key return the original stored result without creating a new payment
- Prevents duplicate charges from client retry logic

### Webhook Idempotency
The webhook endpoint (`POST /api/payments/webhook`) uses a durable database-level idempotency mechanism:

1. Verify the HMAC-SHA256 signature against the raw request body using `WEBHOOK_SECRET`
2. Validate the payload shape with Zod
3. Inside a transaction:
   - Attempt to INSERT into `webhook_events` using the `eventId` as a unique key
   - If the insert violates the unique constraint → already processed → return `200 { received: true, duplicate: true }`
   - Otherwise, lock the booking row with `SELECT ... FOR UPDATE` to prevent race conditions
   - If the booking is already in a terminal state (CONFIRMED/FAILED/CANCELLED) → no-op (idempotent)
   - Otherwise, update the payment and booking status
4. Return `200 { received: true, duplicate: false }`

The uniqueness guarantee lives in the database (`WebhookEvent.eventId @unique`), not in application memory — correct under concurrent requests and multiple server instances.

## Testing

The test suite uses a local PostgreSQL database (provided via Docker Compose) and the `.env.test` configuration file.

### Setting up the test database

1. Start the PostgreSQL container:
```bash
docker-compose up -d db
```

2. Apply database migrations (using the test database URL from `.env.test`):
```bash
DATABASE_URL="postgresql://postgres:postgres@localhost:5433/eve_diagnostics_test" npx prisma migrate deploy
```

3. Seed the test database:
```bash
DATABASE_URL="postgresql://postgres:postgres@localhost:5433/eve_diagnostics_test" npx prisma db seed
```

### Running tests

Once the database is running, migrated, and seeded:

```bash
npm test
```

Run integration tests only:
```bash
npm run test:integration
```

**Note:** Tests require PostgreSQL on `localhost:5433` (the Docker Compose `db` service). The `.env.test` file configures the test database connection. If the database container is not running or not seeded, tests will fail.

## Project Structure

```
src/
├── config/           # Configuration files
│   ├── env.ts       # Environment validation
│   ├── logger.ts    # Pino logger setup
│   └── prisma.ts    # Prisma client
├── middleware/       # Express middleware
│   ├── authenticate.ts
│   ├── authorize.ts
│   ├── errorHandler.ts
│   ├── rateLimiter.ts
│   ├── requestLogger.ts
│   └── validate.ts
├── modules/         # Feature modules
│   ├── auth/       # Authentication
│   ├── bookings/   # Booking management
│   ├── centres/    # Diagnostic centres
│   ├── payments/   # Payment processing
│   └── tests/      # Test catalog
├── utils/          # Utility functions
│   ├── ApiError.ts
│   ├── asyncHandler.ts
│   └── pagination.ts
├── app.ts          # Express app setup
└── server.ts       # Server entry point
```

## Assumptions

- PostgreSQL via Neon is used as the primary database (as per requirements)
- JWT tokens are short-lived (1 hour default, configurable via `JWT_EXPIRES_IN`) — refresh tokens are out of scope
- Payment simulation uses configurable success rate (default 85%)
- Webhook signatures use HMAC-SHA256
- Role-based access control is simplified to USER/ADMIN only
- A user can only access their own bookings; admin can access all bookings
- Booking cancellation is only allowed for PENDING or CONFIRMED bookings with a future appointment time
- Decimal precision: all monetary values use `Decimal(10,2)` in the database and are serialized as numeric strings in API responses

## Future Improvements

- Real payment gateway integration (Stripe, Razorpay)
- Multi-currency support
- Refresh token implementation with token revocation
- Full RBAC with granular permissions
- Booking retry payment flow (FAILED → PENDING)
- Redis caching for frequently accessed data
- Background job processing with BullMQ
- Full-text search for centres and tests
- Email/SMS notifications
- React admin dashboard