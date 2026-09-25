import { prisma } from '../../config/prisma';
import { ApiError } from '../../utils/ApiError';
import { paginationMeta, paginationSkip, PaginationParams } from '../../utils/pagination';

export async function listTests(params: PaginationParams) {
  const [tests, total] = await Promise.all([
    prisma.diagnosticTest.findMany({
      skip: paginationSkip(params),
      take: params.limit,
    }),
    prisma.diagnosticTest.count(),
  ]);

  return { tests, meta: paginationMeta(total, params) };
}

export async function createTest(data: { name: string; description?: string }) {
  return prisma.diagnosticTest.create({
    data: { name: data.name, description: data.description },
  });
}

export async function attachTestToCentre(
  centreId: string,
  data: { testId: string; price: number },
) {
  const centre = await prisma.diagnosticCentre.findUnique({ where: { id: centreId } });
  if (!centre) {
    throw ApiError.notFound('CENTRE_NOT_FOUND', 'Diagnostic centre not found');
  }

  const test = await prisma.diagnosticTest.findUnique({ where: { id: data.testId } });
  if (!test) {
    throw ApiError.notFound('TEST_NOT_FOUND', 'Diagnostic test not found');
  }

  const existing = await prisma.centreTest.findUnique({
    where: { centreId_testId: { centreId, testId: data.testId } },
  });
  if (existing) {
    throw ApiError.conflict('CENTRE_TEST_EXISTS', 'Test already attached to this centre');
  }

  return prisma.centreTest.create({
    data: {
      centreId,
      testId: data.testId,
      price: data.price,
    },
  });
}

export async function updateCentreTest(
  centreId: string,
  testId: string,
  data: { price?: number; isActive?: boolean },
) {
  const centreTest = await prisma.centreTest.findUnique({
    where: { centreId_testId: { centreId, testId } },
  });
  if (!centreTest) {
    throw ApiError.notFound('CENTRE_TEST_NOT_FOUND', 'Centre test not found');
  }

  return prisma.centreTest.update({
    where: { id: centreTest.id },
    data,
  });
}