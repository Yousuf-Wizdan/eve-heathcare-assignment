import { Router } from 'express';
import { signup, login } from './auth.controller';
import { validate } from '../../middleware/validate';
import { signupSchema, loginSchema } from './auth.schema';
import { asyncHandler } from '../../utils/asyncHandler';

const router = Router();

/**
 * @openapi
 * /api/auth/signup:
 *   post:
 *     tags: [Auth]
 *     summary: Create a new user account
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/SignupRequest'
 *     responses:
 *       '201':
 *         description: Account created
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     user:
 *                       $ref: '#/components/schemas/User'
 *                     token:
 *                       type: string
 *       '400':
 *         $ref: '#/components/responses/BadRequest'
 *       '409':
 *         $ref: '#/components/responses/Conflict'
 */
router.post('/signup', validate({ body: signupSchema }), asyncHandler(signup));

/**
 * @openapi
 * /api/auth/login:
 *   post:
 *     tags: [Auth]
 *     summary: Authenticate and receive a JWT
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/LoginRequest'
 *     responses:
 *       '200':
 *         description: Login successful
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     token:
 *                       type: string
 *       '400':
 *         $ref: '#/components/responses/BadRequest'
 *       '401':
 *         $ref: '#/components/responses/Unauthorized'
 */
router.post('/login', validate({ body: loginSchema }), asyncHandler(login));

export { router as authRoutes };