import { Router } from 'express';
import { signup, login } from './auth.controller';
import { validate } from '../../middleware/validate';
import { signupSchema, loginSchema } from './auth.schema';
import { asyncHandler } from '../../utils/asyncHandler';

const router = Router();

router.post('/signup', validate({ body: signupSchema }), asyncHandler(signup));
router.post('/login', validate({ body: loginSchema }), asyncHandler(login));

export { router as authRoutes };