import { Router } from 'express';
import { createPayment, webhook } from './payments.controller';
import { validate } from '../../middleware/validate';
import { authenticate } from '../../middleware/authenticate';
import { createPaymentSchema, webhookSchema } from './payments.schema';
import { asyncHandler } from '../../utils/asyncHandler';

const router = Router();

router.post(
  '/',
  authenticate,
  validate({ body: createPaymentSchema }),
  asyncHandler(createPayment),
);

router.post(
  '/webhook',
  validate({ body: webhookSchema }),
  asyncHandler(webhook),
);

export { router as paymentsRoutes };