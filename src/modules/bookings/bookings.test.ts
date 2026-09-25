import { prisma } from '../../config/prisma';
import * as bookingsService from './bookings.service';

jest.mock('../../config/prisma', () => ({
  prisma: {
    booking: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    centreTest: {
      findUnique: jest.fn(),
    },
  },
}));

describe('Bookings Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('canTransition', () => {
    it('should allow PENDING -> CONFIRMED', () => {
      expect(bookingsService.canTransition('PENDING', 'CONFIRMED')).toBe(true);
    });

    it('should allow PENDING -> FAILED', () => {
      expect(bookingsService.canTransition('PENDING', 'FAILED')).toBe(true);
    });

    it('should allow PENDING -> CANCELLED', () => {
      expect(bookingsService.canTransition('PENDING', 'CANCELLED')).toBe(true);
    });

    it('should allow CONFIRMED -> CANCELLED', () => {
      expect(bookingsService.canTransition('CONFIRMED', 'CANCELLED')).toBe(true);
    });

    it('should not allow FAILED -> PENDING', () => {
      expect(bookingsService.canTransition('FAILED', 'PENDING')).toBe(false);
    });

    it('should not allow CANCELLED -> anything', () => {
      expect(bookingsService.canTransition('CANCELLED', 'PENDING')).toBe(false);
      expect(bookingsService.canTransition('CANCELLED', 'CONFIRMED')).toBe(false);
    });
  });

  describe('createBooking', () => {
    it('should create booking with price snapshot', async () => {
      const futureDate = new Date(Date.now() + 86400000).toISOString();
      const mockCentreTest = {
        id: 'ct-1',
        price: 500,
        isActive: true,
        centre: { isActive: true },
        test: { id: 't1', name: 'CBC' },
      };
      const mockBooking = {
        id: 'b-1',
        userId: 'u1',
        centreId: 'c1',
        testId: 't1',
        centreTestId: 'ct-1',
        appointmentAt: new Date(futureDate),
        amount: 500,
        status: 'PENDING',
      };

      (prisma.centreTest.findUnique as jest.Mock).mockResolvedValue(mockCentreTest);
      (prisma.booking.create as jest.Mock).mockResolvedValue(mockBooking);

      const result = await bookingsService.createBooking('u1', {
        centreId: 'c1',
        testId: 't1',
        appointmentAt: futureDate,
      });

      expect(result.amount).toEqual(500);
      expect(result.status).toBe('PENDING');
    });

    it('should throw INVALID_APPOINTMENT_TIME for past appointment', async () => {
      const pastDate = new Date(Date.now() - 86400000).toISOString();

      await expect(
        bookingsService.createBooking('u1', {
          centreId: 'c1',
          testId: 't1',
          appointmentAt: pastDate,
        }),
      ).rejects.toThrow('future');
    });

    it('should throw CENTRE_TEST_NOT_FOUND for non-existent centre test', async () => {
      const futureDate = new Date(Date.now() + 86400000).toISOString();
      (prisma.centreTest.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(
        bookingsService.createBooking('u1', {
          centreId: 'c1',
          testId: 't1',
          appointmentAt: futureDate,
        }),
      ).rejects.toThrow('not found');
    });

    it('should throw TEST_NOT_AVAILABLE for inactive centre test', async () => {
      const futureDate = new Date(Date.now() + 86400000).toISOString();
      (prisma.centreTest.findUnique as jest.Mock).mockResolvedValue({
        id: 'ct-1',
        price: 500,
        isActive: false,
        centre: { isActive: true },
      });

      await expect(
        bookingsService.createBooking('u1', {
          centreId: 'c1',
          testId: 't1',
          appointmentAt: futureDate,
        }),
      ).rejects.toThrow('not available');
    });
  });

  describe('cancelBooking', () => {
    it('should cancel a PENDING booking', async () => {
      const futureDate = new Date(Date.now() + 86400000);
      (prisma.booking.findUnique as jest.Mock).mockResolvedValue({
        id: 'b-1',
        userId: 'u1',
        status: 'PENDING',
        appointmentAt: futureDate,
      });
      (prisma.booking.update as jest.Mock).mockResolvedValue({
        id: 'b-1',
        status: 'CANCELLED',
      });

      const result = await bookingsService.cancelBooking('b-1', 'u1');

      expect(result.status).toBe('CANCELLED');
    });

    it('should throw BOOKING_NOT_CANCELLABLE for FAILED booking', async () => {
      (prisma.booking.findUnique as jest.Mock).mockResolvedValue({
        id: 'b-1',
        userId: 'u1',
        status: 'FAILED',
        appointmentAt: new Date(Date.now() + 86400000),
      });

      await expect(bookingsService.cancelBooking('b-1', 'u1')).rejects.toThrow('already failed');
    });

    it('should throw BOOKING_NOT_CANCELLABLE for CANCELLED booking', async () => {
      (prisma.booking.findUnique as jest.Mock).mockResolvedValue({
        id: 'b-1',
        userId: 'u1',
        status: 'CANCELLED',
        appointmentAt: new Date(Date.now() + 86400000),
      });

      await expect(bookingsService.cancelBooking('b-1', 'u1')).rejects.toThrow('already cancelled');
    });

    it('should throw FORBIDDEN for non-owner', async () => {
      (prisma.booking.findUnique as jest.Mock).mockResolvedValue({
        id: 'b-1',
        userId: 'other-user',
        status: 'PENDING',
        appointmentAt: new Date(Date.now() + 86400000),
      });

      await expect(bookingsService.cancelBooking('b-1', 'u1')).rejects.toThrow('Access denied');
    });
  });
});