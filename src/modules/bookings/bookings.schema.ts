import { z } from 'zod';

export const createBookingSchema = z.object({
  centreId: z.string().uuid('Invalid centre ID'),
  testId: z.string().uuid('Invalid test ID'),
  appointmentAt: z.string().datetime('Invalid ISO datetime'),
});

export const bookingParamsSchema = z.object({
  id: z.string().uuid('Invalid booking ID'),
});

export const listBookingsQuerySchema = z.object({
  page: z.string().optional(),
  limit: z.string().optional(),
  status: z.enum(['PENDING', 'CONFIRMED', 'FAILED', 'CANCELLED']).optional(),
});