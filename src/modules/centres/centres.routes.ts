import { Router } from 'express';
import { listCentres, getCentre, createCentre } from './centres.controller';
import { attachTestToCentre, updateCentreTest } from '../tests/tests.controller';
import { validate } from '../../middleware/validate';
import { authenticate } from '../../middleware/authenticate';
import { requireRole } from '../../middleware/authorize';
import { createCentreSchema, centreParamsSchema, listCentresQuerySchema } from './centres.schema';
import { attachTestSchema, updateCentreTestSchema, centreTestParamsSchema } from '../tests/tests.schema';
import { asyncHandler } from '../../utils/asyncHandler';

const router = Router();

router.get(
  '/',
  validate({ query: listCentresQuerySchema }),
  asyncHandler(listCentres),
);
router.get(
  '/:centreId',
  validate({ params: centreParamsSchema }),
  asyncHandler(getCentre),
);
router.post(
  '/',
  authenticate,
  requireRole('ADMIN'),
  validate({ body: createCentreSchema }),
  asyncHandler(createCentre),
);
router.post(
  '/:centreId/tests',
  authenticate,
  requireRole('ADMIN'),
  validate({ params: centreParamsSchema, body: attachTestSchema }),
  asyncHandler(attachTestToCentre),
);
router.patch(
  '/:centreId/tests/:testId',
  authenticate,
  requireRole('ADMIN'),
  validate({ params: centreTestParamsSchema, body: updateCentreTestSchema }),
  asyncHandler(updateCentreTest),
);

export { router as centresRoutes };