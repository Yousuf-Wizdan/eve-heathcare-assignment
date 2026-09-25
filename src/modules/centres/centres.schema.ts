import { z } from 'zod';

export const createCentreSchema = z.object({
  name: z.string().min(1, 'Name is required').max(255),
  location: z.string().min(1, 'Location is required').max(255),
});

export const centreParamsSchema = z.object({
  centreId: z.string().uuid('Invalid centre ID'),
});

export const listCentresQuerySchema = z.object({
  page: z.string().optional(),
  limit: z.string().optional(),
  location: z.string().optional(),
});