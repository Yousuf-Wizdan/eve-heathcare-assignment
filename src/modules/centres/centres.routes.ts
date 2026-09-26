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

/**
 * @openapi
 * /api/centres:
 *   get:
 *     tags: [Centres]
 *     summary: List diagnostic centres
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20, maximum: 100 }
 *       - in: query
 *         name: location
 *         schema: { type: string }
 *         description: Case-insensitive location filter
 *     responses:
 *       '200':
 *         description: Paginated centres
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Centre'
 *                 meta:
 *                   $ref: '#/components/schemas/PaginationMeta'
 */
router.get(
  '/',
  validate({ query: listCentresQuerySchema }),
  asyncHandler(listCentres),
);

/**
 * @openapi
 * /api/centres/{centreId}:
 *   get:
 *     tags: [Centres]
 *     summary: Get centre details with attached tests and prices
 *     parameters:
 *       - in: path
 *         name: centreId
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       '200':
 *         description: Centre detail
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   $ref: '#/components/schemas/CentreDetail'
 *       '400':
 *         $ref: '#/components/responses/BadRequest'
 *       '404':
 *         $ref: '#/components/responses/NotFound'
 */
router.get(
  '/:centreId',
  validate({ params: centreParamsSchema }),
  asyncHandler(getCentre),
);

/**
 * @openapi
 * /api/centres:
 *   post:
 *     tags: [Centres]
 *     summary: Create a diagnostic centre (admin)
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CentreCreate'
 *     responses:
 *       '201':
 *         description: Centre created
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   $ref: '#/components/schemas/Centre'
 *       '400':
 *         $ref: '#/components/responses/BadRequest'
 *       '401':
 *         $ref: '#/components/responses/Unauthorized'
 *       '403':
 *         $ref: '#/components/responses/Forbidden'
 */
router.post(
  '/',
  authenticate,
  requireRole('ADMIN'),
  validate({ body: createCentreSchema }),
  asyncHandler(createCentre),
);

/**
 * @openapi
 * /api/centres/{centreId}/tests:
 *   post:
 *     tags: [Centres]
 *     summary: Attach a test to a centre with a price (admin)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: centreId
 *         required: true
 *         schema: { type: string, format: uuid }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CentreTestAttach'
 *     responses:
 *       '201':
 *         description: Test attached
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   $ref: '#/components/schemas/CentreTestRecord'
 *       '400':
 *         $ref: '#/components/responses/BadRequest'
 *       '401':
 *         $ref: '#/components/responses/Unauthorized'
 *       '403':
 *         $ref: '#/components/responses/Forbidden'
 *       '404':
 *         $ref: '#/components/responses/NotFound'
 *       '409':
 *         $ref: '#/components/responses/Conflict'
 */
router.post(
  '/:centreId/tests',
  authenticate,
  requireRole('ADMIN'),
  validate({ params: centreParamsSchema, body: attachTestSchema }),
  asyncHandler(attachTestToCentre),
);

/**
 * @openapi
 * /api/centres/{centreId}/tests/{testId}:
 *   patch:
 *     tags: [Centres]
 *     summary: Update centre test price/status (admin)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: centreId
 *         required: true
 *         schema: { type: string, format: uuid }
 *       - in: path
 *         name: testId
 *         required: true
 *         schema: { type: string, format: uuid }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CentreTestUpdate'
 *     responses:
 *       '200':
 *         description: Updated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   $ref: '#/components/schemas/CentreTestRecord'
 *       '400':
 *         $ref: '#/components/responses/BadRequest'
 *       '401':
 *         $ref: '#/components/responses/Unauthorized'
 *       '403':
 *         $ref: '#/components/responses/Forbidden'
 *       '404':
 *         $ref: '#/components/responses/NotFound'
 */
router.patch(
  '/:centreId/tests/:testId',
  authenticate,
  requireRole('ADMIN'),
  validate({ params: centreTestParamsSchema, body: updateCentreTestSchema }),
  asyncHandler(updateCentreTest),
);

export { router as centresRoutes };