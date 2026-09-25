import { Router } from 'express';
import { createBooking, listBookings, getBooking, cancelBooking } from './bookings.controller';
import { validate } from '../../middleware/validate';
import { authenticate } from '../../middleware/authenticate';
import { createBookingSchema, bookingParamsSchema, listBookingsQuerySchema } from './bookings.schema';
import { asyncHandler } from '../../utils/asyncHandler';

const router = Router();

router.post(
  '/',
  authenticate,
  validate({ body: createBookingSchema }),
  asyncHandler(createBooking),
);
router.get(
  '/',
  authenticate,
  validate({ query: listBookingsQuerySchema }),
  asyncHandler(listBookings),
);
router.get(
  '/:id',
  authenticate,
  validate({ params: bookingParamsSchema }),
  asyncHandler(getBooking),
);
router.patch(
  '/:id/cancel',
  authenticate,
  validate({ params: bookingParamsSchema }),
  asyncHandler(cancelBooking),
);

export { router as bookingsRoutes };