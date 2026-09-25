import { Request, Response, NextFunction } from 'express';
import { ApiError } from '../utils/ApiError';

type Role = 'USER' | 'ADMIN';

export function requireRole(...roles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) {
      throw ApiError.unauthorized('UNAUTHORIZED', 'Authentication required');
    }
    if (!roles.includes(req.user.role as Role)) {
      throw ApiError.forbidden('FORBIDDEN', 'Insufficient permissions');
    }
    next();
  };
}