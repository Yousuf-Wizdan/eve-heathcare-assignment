import { z } from 'zod';

export const createTestSchema = z.object({
  name: z.string().min(1, 'Name is required').max(255),
  description: z.string().optional(),
});

export const listTestsQuerySchema = z.object({
  page: z.string().optional(),
  limit: z.string().optional(),
});

export const attachTestSchema = z.object({
  testId: z.string().uuid('Invalid test ID'),
  price: z.number().positive('Price must be positive'),
});

export const updateCentreTestSchema = z.object({
  price: z.number().positive('Price must be positive').optional(),
  isActive: z.boolean().optional(),
});

export const centreTestParamsSchema = z.object({
  centreId: z.string().uuid('Invalid centre ID'),
  testId: z.string().uuid('Invalid test ID'),
});