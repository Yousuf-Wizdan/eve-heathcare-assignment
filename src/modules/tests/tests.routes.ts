import { Router } from 'express';
import { listTests, createTest } from './tests.controller';
import { validate } from '../../middleware/validate';
import { authenticate } from '../../middleware/authenticate';
import { requireRole } from '../../middleware/authorize';
import { createTestSchema, listTestsQuerySchema } from './tests.schema';
import { asyncHandler } from '../../utils/asyncHandler';

const router = Router();

/**
 * @openapi
 * /api/tests:
 *   get:
 *     tags: [Tests]
 *     summary: List diagnostic tests
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20, maximum: 100 }
 *     responses:
 *       '200':
 *         description: Paginated tests
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/DiagnosticTest'
 *                 meta:
 *                   $ref: '#/components/schemas/PaginationMeta'
 *   post:
 *     tags: [Tests]
 *     summary: Create a diagnostic test (admin)
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/TestCreate'
 *     responses:
 *       '201':
 *         description: Test created
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   $ref: '#/components/schemas/DiagnosticTest'
 *       '400':
 *         $ref: '#/components/responses/BadRequest'
 *       '401':
 *         $ref: '#/components/responses/Unauthorized'
 *       '403':
 *         $ref: '#/components/responses/Forbidden'
 */
router.get('/', validate({ query: listTestsQuerySchema }), asyncHandler(listTests));
router.post('/', authenticate, requireRole('ADMIN'), validate({ body: createTestSchema }), asyncHandler(createTest));

export { router as testsRoutes };