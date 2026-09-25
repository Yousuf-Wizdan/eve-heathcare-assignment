import { prisma } from '../../config/prisma';
import * as centresService from './centres.service';

jest.mock('../../config/prisma', () => ({
  prisma: {
    diagnosticCentre: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
    },
  },
}));

describe('Centres Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('listCentres', () => {
    it('should return paginated centres', async () => {
      const mockCentres = [
        { id: '1', name: 'Centre 1', location: 'City A', centreTests: [] },
      ];

      (prisma.diagnosticCentre.findMany as jest.Mock).mockResolvedValue(mockCentres);
      (prisma.diagnosticCentre.count as jest.Mock).mockResolvedValue(1);

      const result = await centresService.listCentres({ page: 1, limit: 20 });

      expect(result.centres).toEqual(mockCentres);
      expect(result.meta.total).toBe(1);
    });

    it('should filter by location', async () => {
      (prisma.diagnosticCentre.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.diagnosticCentre.count as jest.Mock).mockResolvedValue(0);

      await centresService.listCentres({ page: 1, limit: 20, location: 'Bengaluru' });

      expect(prisma.diagnosticCentre.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            location: { contains: 'Bengaluru', mode: 'insensitive' },
          }),
        }),
      );
    });
  });

  describe('getCentre', () => {
    it('should return centre with tests', async () => {
      const mockCentre = {
        id: '1',
        name: 'Centre 1',
        location: 'City A',
        centreTests: [
          { test: { id: 't1', name: 'Test 1' }, price: 100 },
        ],
      };

      (prisma.diagnosticCentre.findUnique as jest.Mock).mockResolvedValue(mockCentre);

      const result = await centresService.getCentre('1');

      expect(result).toEqual(mockCentre);
    });

    it('should throw CENTRE_NOT_FOUND for non-existent centre', async () => {
      (prisma.diagnosticCentre.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(centresService.getCentre('non-existent')).rejects.toThrow('not found');
    });
  });

  describe('createCentre', () => {
    it('should create a new centre', async () => {
      const mockCentre = { id: '1', name: 'New Centre', location: 'City B' };
      (prisma.diagnosticCentre.create as jest.Mock).mockResolvedValue(mockCentre);

      const result = await centresService.createCentre({ name: 'New Centre', location: 'City B' });

      expect(result).toEqual(mockCentre);
    });
  });
});