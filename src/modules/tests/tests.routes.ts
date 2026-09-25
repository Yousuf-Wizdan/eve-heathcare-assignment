import { Router } from 'express';
import { listTests, createTest } from './tests.controller';
import { validate } from '../../middleware/validate';
import { authenticate } from '../../middleware/authenticate';
import { requireRole } from '../../middleware/authorize';
import { createTestSchema, listTestsQuerySchema } from './tests.schema';
import { asyncHandler } from '../../utils/asyncHandler';

const router = Router();

router.get('/', validate({ query: listTestsQuerySchema }), asyncHandler(listTests));
router.post('/', authenticate, requireRole('ADMIN'), validate({ body: createTestSchema }), asyncHandler(createTest));

export { router as testsRoutes };