import express from 'express';
import helmet from 'helmet';
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
app.use(express.json({ limit: '10kb' }));

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
    },
  },
  apis: ['./src/modules/**/*.routes.ts'],
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