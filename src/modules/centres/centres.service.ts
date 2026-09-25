import { prisma } from '../../config/prisma';
import { ApiError } from '../../utils/ApiError';
import {
  paginationMeta,
  paginationSkip,
  PaginationParams,
} from '../../utils/pagination';

export async function listCentres(params: PaginationParams & { location?: string }) {
  const where = {
    isActive: true,
    ...(params.location ? { location: { contains: params.location, mode: 'insensitive' as const } } : {}),
  };

  const [centres, total] = await Promise.all([
    prisma.diagnosticCentre.findMany({
      where,
      skip: paginationSkip(params),
      take: params.limit,
      select: {
        id: true,
        name: true,
        location: true,
        centreTests: {
          where: { isActive: true },
          select: {
            test: { select: { id: true, name: true } },
            price: true,
          },
        },
      },
    }),
    prisma.diagnosticCentre.count({ where }),
  ]);

  return { centres, meta: paginationMeta(total, params) };
}

export async function getCentre(centreId: string) {
  const centre = await prisma.diagnosticCentre.findUnique({
    where: { id: centreId },
    select: {
      id: true,
      name: true,
      location: true,
      centreTests: {
        where: { isActive: true },
        select: {
          test: { select: { id: true, name: true } },
          price: true,
        },
      },
    },
  });

  if (!centre) {
    throw ApiError.notFound('CENTRE_NOT_FOUND', 'Diagnostic centre not found');
  }

  return centre;
}

export async function createCentre(data: { name: string; location: string }) {
  return prisma.diagnosticCentre.create({
    data: { name: data.name, location: data.location },
  });
}