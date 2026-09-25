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
- **Testing**: Jest + Supertest

## Features

- User authentication (signup/login) with JWT
- Role-based access control (USER/ADMIN)
- Diagnostic centre and test management
- Booking system with state machine (PENDING → CONFIRMED/FAILED/CANCELLED)
- Payment simulation with idempotency
- Webhook processing with idempotent event handling
- Pagination support
- Rate limiting
- Structured logging with Pino
- API documentation with Swagger/OpenAPI

## Getting Started

### Prerequisites

- Node.js 20+
- PostgreSQL database (or Neon account)

### Installation

1. Clone the repository:
```bash
git clone <repository-url>
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

### Using Docker

1. Build and run with Docker Compose:
```bash
docker-compose up -d
```

This will start:
- API server on port 4000
- PostgreSQL database on port 5433

## API Documentation

Once the server is running, visit:
- Swagger UI: `http://localhost:4000/api-docs`
- Health check: `http://localhost:4000/health`

## API Endpoints

### Authentication

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/signup` | Create a new user account |
| POST | `/api/auth/login` | Authenticate and receive JWT |

### Diagnostic Centres

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/centres` | Public | List centres (with pagination, filter by location) |
| GET | `/api/centres/:id` | Public | Get centre details with tests |
| POST | `/api/centres` | Admin | Create a new centre |

### Diagnostic Tests

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/tests` | Public | List all tests |
| POST | `/api/tests` | Admin | Create a new test |
| POST | `/api/centres/:centreId/tests` | Admin | Attach test to centre with price |
| PATCH | `/api/centres/:centreId/tests/:testId` | Admin | Update centre test price/status |

### Bookings

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/bookings` | User | Create a new booking |
| GET | `/api/bookings` | User | List user's bookings |
| GET | `/api/bookings/:id` | User/Admin | Get booking details |
| PATCH | `/api/bookings/:id/cancel` | User | Cancel a booking |

### Payments

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/payments` | User | Process payment for booking |
| POST | `/api/payments/webhook` | Webhook | Receive payment status updates |

## Environment Variables

```env
# Server
NODE_ENV=development
PORT=4000

# Database (Neon)
DATABASE_URL=postgresql://user:pass@ep-xxxx-pooler.region.aws.neon.tech/db?sslmode=require
DIRECT_URL=postgresql://user:pass@ep-xxxx.region.aws.neon.tech/db?sslmode=require

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

- **User**: User accounts with role-based access
- **DiagnosticCentre**: Physical diagnostic centres
- **DiagnosticTest**: Test catalog entries
- **CentreTest**: Links centres to tests with pricing
- **Booking**: User bookings with status tracking
- **Payment**: Payment records with idempotency
- **WebhookEvent**: Idempotent webhook event logging

## Idempotency

### Payment Idempotency
- Each payment request can include an `Idempotency-Key` header
- Duplicate requests with the same key return the original result
- Prevents duplicate charges from retry logic

### Webhook Idempotency
- Each webhook event has a unique `eventId`
- Database constraint prevents duplicate processing
- Duplicate events return `{ received: true, duplicate: true }`

## Testing

Run all tests:
```bash
npm test
```

Run specific test suites:
```bash
npm run test:unit        # Unit tests only
npm run test:integration # Integration tests only
```

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
- JWT tokens are short-lived (1 hour) - refresh tokens are out of scope
- Payment simulation uses configurable success rate (default 85%)
- Webhook signatures use HMAC-SHA256
- Role-based access control is simplified (USER/ADMIN only)

## Future Improvements

- [ ] Real payment gateway integration (Stripe, Razorpay)
- [ ] Multi-currency support
- [ ] Refresh token implementation
- [ ] Full RBAC with granular permissions
- [ ] Booking retry payment flow (FAILED → PENDING)
- [ ] Redis caching for frequently accessed data
- [ ] Background job processing with BullMQ
- [ ] Full-text search for centres and tests
- [ ] Email/SMS notifications
- [ ] React admin dashboard