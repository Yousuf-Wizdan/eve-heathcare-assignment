import crypto from 'node:crypto';
import { prisma } from '../../config/prisma';
import * as paymentsService from './payments.service';
import { env } from '../../config/env';

jest.mock('../../config/prisma', () => ({
  prisma: {
    payment: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    booking: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    webhookEvent: {
      create: jest.fn(),
    },
    $transaction: jest.fn((callback) => callback({
      payment: {
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      booking: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      webhookEvent: {
        create: jest.fn(),
      },
    })),
  },
}));

jest.mock('../../config/env', () => ({
  env: {
    WEBHOOK_SECRET: 'test-secret',
    PAYMENT_SUCCESS_RATE: 1.0,
  },
}));

describe('Payments Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('createPayment', () => {
    it('should create payment and confirm booking on success', async () => {
      const mockBooking = {
        id: 'b-1',
        userId: 'u1',
        status: 'PENDING',
        amount: 500,
      };
      const mockPayment = {
        id: 'p-1',
        bookingId: 'b-1',
        status: 'SUCCESS',
        idempotencyKey: 'key-1',
      };

      (prisma.payment.findUnique as jest.Mock).mockResolvedValue(null);
      (prisma.booking.findUnique as jest.Mock).mockResolvedValue(mockBooking);
      (prisma.$transaction as jest.Mock).mockImplementation(async (callback) => {
        const tx = {
          payment: { create: jest.fn().mockResolvedValue(mockPayment) },
          booking: { update: jest.fn().mockResolvedValue({}) },
        };
        return callback(tx);
      });

      const result = await paymentsService.createPayment('u1', { bookingId: 'b-1' }, 'key-1');

      expect(result.status).toBe('SUCCESS');
      expect(result.paymentId).toBe('p-1');
    });

    it('should return idempotent result for duplicate key', async () => {
      const existingPayment = {
        id: 'p-1',
        bookingId: 'b-1',
        status: 'SUCCESS',
      };

      (prisma.payment.findUnique as jest.Mock).mockResolvedValue(existingPayment);

      const result = await paymentsService.createPayment('u1', { bookingId: 'b-1' }, 'key-1');

      expect(result.paymentId).toBe('p-1');
      expect(prisma.booking.findUnique).not.toHaveBeenCalled();
    });

    it('should throw BOOKING_NOT_PAYABLE for non-PENDING booking', async () => {
      (prisma.payment.findUnique as jest.Mock).mockResolvedValue(null);
      (prisma.booking.findUnique as jest.Mock).mockResolvedValue({
        id: 'b-1',
        userId: 'u1',
        status: 'CONFIRMED',
      });

      await expect(
        paymentsService.createPayment('u1', { bookingId: 'b-1' }, 'key-1'),
      ).rejects.toThrow('cannot process payment');
    });

    it('should throw FORBIDDEN for non-owner', async () => {
      (prisma.payment.findUnique as jest.Mock).mockResolvedValue(null);
      (prisma.booking.findUnique as jest.Mock).mockResolvedValue({
        id: 'b-1',
        userId: 'other-user',
        status: 'PENDING',
      });

      await expect(
        paymentsService.createPayment('u1', { bookingId: 'b-1' }, 'key-1'),
      ).rejects.toThrow('Access denied');
    });
  });

  describe('verifyWebhookSignature', () => {
    it('should verify valid signature', () => {
      const body = JSON.stringify({ test: 'data' });
      const signature = crypto
        .createHmac('sha256', 'test-secret')
        .update(body)
        .digest('hex');

      expect(paymentsService.verifyWebhookSignature(body, signature)).toBe(true);
    });

    it('should reject invalid signature', () => {
      const body = JSON.stringify({ test: 'data' });
      const wrongSignature = crypto
        .createHmac('sha256', 'wrong-secret')
        .update(body)
        .digest('hex');

      expect(paymentsService.verifyWebhookSignature(body, wrongSignature)).toBe(false);
    });
  });

  describe('processWebhook', () => {
    it('should process first webhook and update booking', async () => {
      const mockBooking = { id: 'b-1', status: 'PENDING' };
      const mockPayment = { id: 'p-1' };

      (prisma.$transaction as jest.Mock).mockImplementation(async (callback) => {
        const tx = {
          webhookEvent: { create: jest.fn().mockResolvedValue({}) },
          booking: {
            findUnique: jest.fn().mockResolvedValue(mockBooking),
            update: jest.fn().mockResolvedValue({}),
          },
          payment: {
            findUnique: jest.fn().mockResolvedValue(mockPayment),
            update: jest.fn().mockResolvedValue({}),
          },
        };
        return callback(tx);
      });

      const result = await paymentsService.processWebhook({
        eventId: 'evt-1',
        eventType: 'payment.success',
        bookingId: 'b-1',
        paymentId: 'p-1',
        status: 'SUCCESS',
      });

      expect(result.received).toBe(true);
      expect(result.duplicate).toBe(false);
    });

    it('should return duplicate for repeated webhook', async () => {
      const duplicateError = new Error('Unique constraint');
      (duplicateError as any).code = 'P2002';

      (prisma.$transaction as jest.Mock).mockImplementation(async (callback) => {
        const tx = {
          webhookEvent: { create: jest.fn().mockRejectedValue(duplicateError) },
        };
        return callback(tx);
      });

      const result = await paymentsService.processWebhook({
        eventId: 'evt-1',
        eventType: 'payment.success',
        bookingId: 'b-1',
        paymentId: 'p-1',
        status: 'SUCCESS',
      });

      expect(result.received).toBe(true);
      expect(result.duplicate).toBe(true);
    });

    it('should not update booking if already CONFIRMED', async () => {
      const mockUpdate = jest.fn();

      (prisma.$transaction as jest.Mock).mockImplementation(async (callback) => {
        const tx = {
          webhookEvent: { create: jest.fn().mockResolvedValue({}) },
          booking: { findUnique: jest.fn().mockResolvedValue({ id: 'b-1', status: 'CONFIRMED' }) },
          payment: {
            findUnique: jest.fn(),
            update: mockUpdate,
          },
        };
        return callback(tx);
      });

      const result = await paymentsService.processWebhook({
        eventId: 'evt-1',
        eventType: 'payment.success',
        bookingId: 'b-1',
        paymentId: 'p-1',
        status: 'SUCCESS',
      });

      expect(result.received).toBe(true);
      expect(result.duplicate).toBe(false);
      expect(mockUpdate).not.toHaveBeenCalled();
    });
  });
});