import { z } from 'zod';

export const createPaymentSchema = z.object({
  bookingId: z.string().uuid('Invalid booking ID'),
});

export const webhookSchema = z.object({
  eventId: z.string().min(1, 'Event ID is required'),
  eventType: z.string().min(1, 'Event type is required'),
  bookingId: z.string().uuid('Invalid booking ID'),
  paymentId: z.string().uuid('Invalid payment ID'),
  status: z.enum(['SUCCESS', 'FAILED']),
});