import { prisma } from '../../config/prisma';
import { ApiError } from '../../utils/ApiError';
import { parsePagination, paginationMeta, paginationSkip, PaginationParams } from '../../utils/pagination';

type BookingStatus = 'PENDING' | 'CONFIRMED' | 'FAILED' | 'CANCELLED';

const VALID_TRANSITIONS: Record<BookingStatus, BookingStatus[]> = {
  PENDING: ['CONFIRMED', 'FAILED', 'CANCELLED'],
  CONFIRMED: ['CANCELLED'],
  FAILED: [],
  CANCELLED: [],
};

export function canTransition(from: BookingStatus, to: BookingStatus): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false;
}

export async function createBooking(userId: string, data: { centreId: string; testId: string; appointmentAt: string }) {
  const appointmentDate = new Date(data.appointmentAt);
  if (appointmentDate <= new Date()) {
    throw ApiError.badRequest('INVALID_APPOINTMENT_TIME', 'Appointment must be in the future');
  }

  const centreTest = await prisma.centreTest.findUnique({
    where: {
      centreId_testId: { centreId: data.centreId, testId: data.testId },
    },
    include: { centre: true, test: true },
  });

  if (!centreTest) {
    throw ApiError.notFound('CENTRE_TEST_NOT_FOUND', 'Centre test not found');
  }

  if (!centreTest.isActive || !centreTest.centre.isActive) {
    throw ApiError.badRequest('TEST_NOT_AVAILABLE', 'This test is not available at the selected centre');
  }

  const booking = await prisma.booking.create({
    data: {
      userId,
      centreId: data.centreId,
      testId: data.testId,
      centreTestId: centreTest.id,
      appointmentAt: appointmentDate,
      amount: centreTest.price,
      status: 'PENDING',
    },
  });

  return booking;
}

export async function listUserBookings(
  userId: string,
  params: PaginationParams & { status?: BookingStatus },
) {
  const where = {
    userId,
    ...(params.status ? { status: params.status } : {}),
  };

  const [bookings, total] = await Promise.all([
    prisma.booking.findMany({
      where,
      skip: paginationSkip(params),
      take: params.limit,
      orderBy: { createdAt: 'desc' },
      include: {
        centre: { select: { id: true, name: true, location: true } },
        centreTest: { include: { test: { select: { id: true, name: true } } } },
      },
    }),
    prisma.booking.count({ where }),
  ]);

  return { bookings, meta: paginationMeta(total, params) };
}

export async function getBooking(bookingId: string, userId: string, role: string) {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: {
      centre: { select: { id: true, name: true, location: true } },
      centreTest: { include: { test: { select: { id: true, name: true } } } },
      payments: true,
    },
  });

  if (!booking) {
    throw ApiError.notFound('BOOKING_NOT_FOUND', 'Booking not found');
  }

  if (role !== 'ADMIN' && booking.userId !== userId) {
    throw ApiError.forbidden('FORBIDDEN', 'Access denied');
  }

  return booking;
}

export async function cancelBooking(bookingId: string, userId: string) {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
  });

  if (!booking) {
    throw ApiError.notFound('BOOKING_NOT_FOUND', 'Booking not found');
  }

  if (booking.userId !== userId) {
    throw ApiError.forbidden('FORBIDDEN', 'Access denied');
  }

  if (booking.appointmentAt <= new Date()) {
    throw ApiError.conflict('BOOKING_NOT_CANCELLABLE', 'Cannot cancel a past booking');
  }

  if (booking.status === 'CANCELLED' || booking.status === 'FAILED') {
    throw ApiError.conflict('BOOKING_NOT_CANCELLABLE', `Booking is already ${booking.status.toLowerCase()}`);
  }

  const updated = await prisma.booking.update({
    where: { id: bookingId },
    data: { status: 'CANCELLED' },
  });

  return updated;
}