import { Request, Response } from 'express';
import * as bookingsService from './bookings.service';
import { parsePagination } from '../../utils/pagination';

export async function createBooking(req: Request, res: Response) {
  const booking = await bookingsService.createBooking(req.user!.id, req.body);
  res.status(201).json({
    data: {
      id: booking.id,
      status: booking.status,
      amount: booking.amount.toString(),
      appointmentAt: booking.appointmentAt.toISOString(),
    },
  });
}

export async function listBookings(req: Request, res: Response) {
  const params = parsePagination(req.query as { page?: string; limit?: string });
  const status = req.query.status as string | undefined;
  const result = await bookingsService.listUserBookings(req.user!.id, {
    ...params,
    status: status as 'PENDING' | 'CONFIRMED' | 'FAILED' | 'CANCELLED' | undefined,
  });
  res.json({
    data: result.bookings.map((b: { id: string; status: string; amount: { toString: () => string }; appointmentAt: Date; centre: unknown; centreTest: { test: unknown } }) => ({
      id: b.id,
      status: b.status,
      amount: b.amount.toString(),
      appointmentAt: b.appointmentAt.toISOString(),
      centre: b.centre,
      test: b.centreTest.test,
    })),
    meta: result.meta,
  });
}

export async function getBooking(req: Request, res: Response) {
  const id = req.params.id as string;
  const booking = await bookingsService.getBooking(id, req.user!.id, req.user!.role);
  res.json({
    data: {
      id: booking.id,
      status: booking.status,
      amount: booking.amount.toString(),
      appointmentAt: booking.appointmentAt.toISOString(),
      centre: booking.centre,
      test: booking.centreTest.test,
      payments: booking.payments.map((p: { id: string; status: string; amount: { toString: () => string }; createdAt: Date }) => ({
        id: p.id,
        status: p.status,
        amount: p.amount.toString(),
        createdAt: p.createdAt.toISOString(),
      })),
    },
  });
}

export async function cancelBooking(req: Request, res: Response) {
  const id = req.params.id as string;
  const booking = await bookingsService.cancelBooking(id, req.user!.id);
  res.json({
    data: {
      id: booking.id,
      status: booking.status,
    },
  });
}