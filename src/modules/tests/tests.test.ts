import { prisma } from '../../config/prisma';
import * as testsService from './tests.service';

jest.mock('../../config/prisma', () => ({
  prisma: {
    diagnosticTest: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
    },
    diagnosticCentre: {
      findUnique: jest.fn(),
    },
    centreTest: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
  },
}));

describe('Tests Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('listTests', () => {
    it('should return paginated tests', async () => {
      const mockTests = [{ id: '1', name: 'CBC', description: 'Blood count' }];
      (prisma.diagnosticTest.findMany as jest.Mock).mockResolvedValue(mockTests);
      (prisma.diagnosticTest.count as jest.Mock).mockResolvedValue(1);

      const result = await testsService.listTests({ page: 1, limit: 20 });

      expect(result.tests).toEqual(mockTests);
    });
  });

  describe('createTest', () => {
    it('should create a new test', async () => {
      const mockTest = { id: '1', name: 'Lipid Profile', description: 'Cholesterol test' };
      (prisma.diagnosticTest.create as jest.Mock).mockResolvedValue(mockTest);

      const result = await testsService.createTest({ name: 'Lipid Profile', description: 'Cholesterol test' });

      expect(result).toEqual(mockTest);
    });
  });

  describe('attachTestToCentre', () => {
    it('should attach test to centre with price', async () => {
      (prisma.diagnosticCentre.findUnique as jest.Mock).mockResolvedValue({ id: 'c1' });
      (prisma.diagnosticTest.findUnique as jest.Mock).mockResolvedValue({ id: 't1' });
      (prisma.centreTest.findUnique as jest.Mock).mockResolvedValue(null);
      (prisma.centreTest.create as jest.Mock).mockResolvedValue({
        id: 'ct1',
        centreId: 'c1',
        testId: 't1',
        price: 500,
      });

      const result = await testsService.attachTestToCentre('c1', { testId: 't1', price: 500 });

      expect(result.price).toEqual(500);
    });

    it('should throw CENTRE_TEST_EXISTS if already attached', async () => {
      (prisma.diagnosticCentre.findUnique as jest.Mock).mockResolvedValue({ id: 'c1' });
      (prisma.diagnosticTest.findUnique as jest.Mock).mockResolvedValue({ id: 't1' });
      (prisma.centreTest.findUnique as jest.Mock).mockResolvedValue({ id: 'existing' });

      await expect(
        testsService.attachTestToCentre('c1', { testId: 't1', price: 500 }),
      ).rejects.toThrow('already attached');
    });
  });
});