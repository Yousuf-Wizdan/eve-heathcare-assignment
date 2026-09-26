import { Router } from 'express';
import { createBooking, listBookings, getBooking, cancelBooking } from './bookings.controller';
import { validate } from '../../middleware/validate';
import { authenticate } from '../../middleware/authenticate';
import { createBookingSchema, bookingParamsSchema, listBookingsQuerySchema } from './bookings.schema';
import { asyncHandler } from '../../utils/asyncHandler';

const router = Router();

/**
 * @openapi
 * /api/bookings:
 *   post:
 *     tags: [Bookings]
 *     summary: Create a booking
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/BookingCreate'
 *     responses:
 *       '201':
 *         description: Booking created (status PENDING)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   $ref: '#/components/schemas/BookingCreated'
 *       '400':
 *         $ref: '#/components/responses/BadRequest'
 *       '401':
 *         $ref: '#/components/responses/Unauthorized'
 *       '404':
 *         $ref: '#/components/responses/NotFound'
 */
router.post(
  '/',
  authenticate,
  validate({ body: createBookingSchema }),
  asyncHandler(createBooking),
);

/**
 * @openapi
 * /api/bookings:
 *   get:
 *     tags: [Bookings]
 *     summary: List the current user's bookings
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20, maximum: 100 }
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [PENDING, CONFIRMED, FAILED, CANCELLED]
 *     responses:
 *       '200':
 *         description: Paginated bookings
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/BookingSummary'
 *                 meta:
 *                   $ref: '#/components/schemas/PaginationMeta'
 *       '401':
 *         $ref: '#/components/responses/Unauthorized'
 */
router.get(
  '/',
  authenticate,
  validate({ query: listBookingsQuerySchema }),
  asyncHandler(listBookings),
);

/**
 * @openapi
 * /api/bookings/{id}:
 *   get:
 *     tags: [Bookings]
 *     summary: Get booking details (owner or admin)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       '200':
 *         description: Booking detail with payments
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   $ref: '#/components/schemas/BookingDetail'
 *       '401':
 *         $ref: '#/components/responses/Unauthorized'
 *       '403':
 *         $ref: '#/components/responses/Forbidden'
 *       '404':
 *         $ref: '#/components/responses/NotFound'
 */
router.get(
  '/:id',
  authenticate,
  validate({ params: bookingParamsSchema }),
  asyncHandler(getBooking),
);

/**
 * @openapi
 * /api/bookings/{id}/cancel:
 *   patch:
 *     tags: [Bookings]
 *     summary: Cancel a booking (owner)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       '200':
 *         description: Booking cancelled
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     id: { type: string, format: uuid }
 *                     status: { $ref: '#/components/schemas/BookingStatus' }
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
  '/:id/cancel',
  authenticate,
  validate({ params: bookingParamsSchema }),
  asyncHandler(cancelBooking),
);

export { router as bookingsRoutes };