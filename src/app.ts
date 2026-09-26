import express from 'express';
import helmet from 'helmet';
import path from 'path';
import swaggerJsdoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';
import { errorHandler } from './middleware/errorHandler';
import { rateLimiter } from './middleware/rateLimiter';
import { requestLogger } from './middleware/requestLogger';
import { authRoutes } from './modules/auth/auth.routes';
import { centresRoutes } from './modules/centres/centres.routes';
import { testsRoutes } from './modules/tests/tests.routes';
import { bookingsRoutes } from './modules/bookings/bookings.routes';
import { paymentsRoutes } from './modules/payments/payments.routes';

const app = express();

// Security & parsing
app.use(helmet());
app.use(express.json({
  limit: '10kb',
  verify: (req, _res, buf) => {
    (req as unknown as { rawBody?: string }).rawBody = buf.toString();
  },
}));

// Rate limiting
app.use(rateLimiter);

// Request logging
app.use(requestLogger);

// Swagger/OpenAPI setup
const swaggerOptions: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'EVE Healthcare Diagnostics API',
      version: '1.0.0',
      description: 'API for diagnostic test booking and payments',
    },
    servers: [
      {
        url: '/',
        description: 'Current host',
      },
      {
        url: 'http://localhost:4000',
        description: 'Development server',
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
      },
      responses: {
        BadRequest: {
          description: 'Validation error',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/Error' },
            },
          },
        },
        Unauthorized: {
          description: 'Missing or invalid credentials',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/Error' },
            },
          },
        },
        Forbidden: {
          description: 'Insufficient permissions',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/Error' },
            },
          },
        },
        NotFound: {
          description: 'Resource not found',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/Error' },
            },
          },
        },
        Conflict: {
          description: 'Resource conflict',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/Error' },
            },
          },
        },
        TooManyRequests: {
          description: 'Rate limit exceeded',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/Error' },
            },
          },
        },
      },
      schemas: {
        Error: {
          type: 'object',
          properties: {
            error: {
              type: 'object',
              properties: {
                code: { type: 'string', example: 'VALIDATION_ERROR' },
                message: { type: 'string', example: 'Invalid request' },
                details: { type: 'object', nullable: true },
              },
            },
          },
        },
        PaginationMeta: {
          type: 'object',
          properties: {
            page: { type: 'integer', example: 1 },
            limit: { type: 'integer', example: 20 },
            total: { type: 'integer', example: 42 },
            totalPages: { type: 'integer', example: 3 },
          },
        },
        User: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            name: { type: 'string', example: 'Asha Rao' },
            email: { type: 'string', format: 'email', example: 'asha@example.com' },
            role: { type: 'string', enum: ['USER', 'ADMIN'] },
          },
        },
        SignupRequest: {
          type: 'object',
          required: ['name', 'email', 'password'],
          properties: {
            name: { type: 'string', minLength: 1, maxLength: 255 },
            email: { type: 'string', format: 'email' },
            password: { type: 'string', minLength: 8 },
          },
        },
        LoginRequest: {
          type: 'object',
          required: ['email', 'password'],
          properties: {
            email: { type: 'string', format: 'email' },
            password: { type: 'string' },
          },
        },
        Centre: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            name: { type: 'string', example: 'HealthFirst Diagnostics' },
            location: { type: 'string', example: 'Bengaluru' },
            isActive: { type: 'boolean' },
          },
        },
        CentreCreate: {
          type: 'object',
          required: ['name', 'location'],
          properties: {
            name: { type: 'string', minLength: 1, maxLength: 255 },
            location: { type: 'string', minLength: 1, maxLength: 255 },
          },
        },
        CentreTest: {
          type: 'object',
          properties: {
            testId: { type: 'string', format: 'uuid' },
            name: { type: 'string', example: 'Complete Blood Count' },
            price: { type: 'string', example: '450.00' },
          },
        },
        CentreDetail: {
          allOf: [
            { $ref: '#/components/schemas/Centre' },
            {
              type: 'object',
              properties: {
                tests: {
                  type: 'array',
                  items: { $ref: '#/components/schemas/CentreTest' },
                },
              },
            },
          ],
        },
        DiagnosticTest: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            name: { type: 'string', example: 'Lipid Profile' },
            description: { type: 'string', nullable: true },
          },
        },
        TestCreate: {
          type: 'object',
          required: ['name'],
          properties: {
            name: { type: 'string', minLength: 1, maxLength: 255 },
            description: { type: 'string' },
          },
        },
        CentreTestAttach: {
          type: 'object',
          required: ['testId', 'price'],
          properties: {
            testId: { type: 'string', format: 'uuid' },
            price: { type: 'number', exclusiveMinimum: true, minimum: 0 },
          },
        },
        CentreTestUpdate: {
          type: 'object',
          properties: {
            price: { type: 'number', exclusiveMinimum: true, minimum: 0 },
            isActive: { type: 'boolean' },
          },
        },
        CentreTestRecord: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            centreId: { type: 'string', format: 'uuid' },
            testId: { type: 'string', format: 'uuid' },
            price: { type: 'string', example: '450.00' },
            isActive: { type: 'boolean' },
          },
        },
        BookingStatus: {
          type: 'string',
          enum: ['PENDING', 'CONFIRMED', 'FAILED', 'CANCELLED'],
        },
        BookingCreate: {
          type: 'object',
          required: ['centreId', 'testId', 'appointmentAt'],
          properties: {
            centreId: { type: 'string', format: 'uuid' },
            testId: { type: 'string', format: 'uuid' },
            appointmentAt: { type: 'string', format: 'date-time' },
          },
        },
        BookingCreated: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            status: { $ref: '#/components/schemas/BookingStatus' },
            amount: { type: 'string', example: '450' },
            appointmentAt: { type: 'string', format: 'date-time' },
          },
        },
        BookingSummary: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            status: { $ref: '#/components/schemas/BookingStatus' },
            amount: { type: 'string', example: '450' },
            appointmentAt: { type: 'string', format: 'date-time' },
            centre: { $ref: '#/components/schemas/Centre' },
            test: { $ref: '#/components/schemas/DiagnosticTest' },
          },
        },
        PaymentRecord: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            status: { type: 'string', enum: ['PENDING', 'SUCCESS', 'FAILED'] },
            amount: { type: 'string', example: '450' },
            createdAt: { type: 'string', format: 'date-time' },
          },
        },
        BookingDetail: {
          allOf: [
            { $ref: '#/components/schemas/BookingSummary' },
            {
              type: 'object',
              properties: {
                payments: {
                  type: 'array',
                  items: { $ref: '#/components/schemas/PaymentRecord' },
                },
              },
            },
          ],
        },
        PaymentCreate: {
          type: 'object',
          required: ['bookingId'],
          properties: {
            bookingId: { type: 'string', format: 'uuid' },
          },
        },
        PaymentResult: {
          type: 'object',
          properties: {
            paymentId: { type: 'string', format: 'uuid' },
            bookingId: { type: 'string', format: 'uuid' },
            status: { type: 'string', enum: ['PENDING', 'SUCCESS', 'FAILED'] },
          },
        },
        WebhookPayload: {
          type: 'object',
          required: ['eventId', 'eventType', 'bookingId', 'paymentId', 'status'],
          properties: {
            eventId: { type: 'string', example: 'evt_8f2a' },
            eventType: { type: 'string', example: 'payment.completed' },
            bookingId: { type: 'string', format: 'uuid' },
            paymentId: { type: 'string', format: 'uuid' },
            status: { type: 'string', enum: ['SUCCESS', 'FAILED'] },
          },
        },
        WebhookResult: {
          type: 'object',
          properties: {
            received: { type: 'boolean' },
            duplicate: { type: 'boolean' },
          },
        },
      },
    },
  },
  apis: [path.join(__dirname, '**', '*.routes.{ts,js}').replace(/\\/g, '/')],
};

const swaggerSpec = swaggerJsdoc(swaggerOptions);
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/centres', centresRoutes);
app.use('/api/tests', testsRoutes);
app.use('/api/bookings', bookingsRoutes);
app.use('/api/payments', paymentsRoutes);

// Error handling (must be last)
app.use(errorHandler);

export { app };