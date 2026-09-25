import { Request, Response } from 'express';
import * as authService from './auth.service';
import { prisma } from '../../config/prisma';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { env } from '../../config/env';

// Mock prisma
jest.mock('../../config/prisma', () => ({
  prisma: {
    user: {
      findUnique: jest.fn(),
      create: jest.fn(),
    },
  },
}));

describe('Auth Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('signup', () => {
    it('should create a new user and return user with token', async () => {
      const mockUser = {
        id: 'user-1',
        name: 'Test User',
        email: 'test@example.com',
        role: 'USER',
      };

      (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);
      (prisma.user.create as jest.Mock).mockResolvedValue(mockUser);

      const result = await authService.signup({
        name: 'Test User',
        email: 'test@example.com',
        password: 'Password123!',
      });

      expect(result.user).toEqual(mockUser);
      expect(result.token).toBeDefined();
      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { email: 'test@example.com' },
      });
      expect(prisma.user.create).toHaveBeenCalled();
    });

    it('should throw EMAIL_TAKEN if email already exists', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({ id: 'existing-user' });

      await expect(
        authService.signup({
          name: 'Test User',
          email: 'existing@example.com',
          password: 'Password123!',
        }),
      ).rejects.toThrow('Email already in use');
    });
  });

  describe('login', () => {
    it('should return token for valid credentials', async () => {
      const passwordHash = await bcrypt.hash('Password123!', 10);
      const mockUser = {
        id: 'user-1',
        email: 'test@example.com',
        passwordHash,
        role: 'USER',
      };

      (prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);

      const result = await authService.login({
        email: 'test@example.com',
        password: 'Password123!',
      });

      expect(result.token).toBeDefined();
    });

    it('should throw INVALID_CREDENTIALS for wrong password', async () => {
      const passwordHash = await bcrypt.hash('CorrectPassword!', 10);
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        id: 'user-1',
        email: 'test@example.com',
        passwordHash,
      });

      await expect(
        authService.login({
          email: 'test@example.com',
          password: 'WrongPassword!',
        }),
      ).rejects.toThrow('Invalid email or password');
    });

    it('should throw INVALID_CREDENTIALS for non-existent user', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(
        authService.login({
          email: 'nonexistent@example.com',
          password: 'Password123!',
        }),
      ).rejects.toThrow('Invalid email or password');
    });
  });
});