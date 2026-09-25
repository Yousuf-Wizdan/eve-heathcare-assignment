import { Request, Response } from 'express';
import * as testsService from './tests.service';
import { parsePagination } from '../../utils/pagination';

export async function listTests(req: Request, res: Response) {
  const params = parsePagination(req.query as { page?: string; limit?: string });
  const result = await testsService.listTests(params);
  res.json({ data: result.tests, meta: result.meta });
}

export async function createTest(req: Request, res: Response) {
  const test = await testsService.createTest(req.body);
  res.status(201).json({ data: test });
}

export async function attachTestToCentre(req: Request, res: Response) {
  const centreId = req.params.centreId as string;
  const centreTest = await testsService.attachTestToCentre(centreId, req.body);
  res.status(201).json({ data: centreTest });
}

export async function updateCentreTest(req: Request, res: Response) {
  const centreId = req.params.centreId as string;
  const testId = req.params.testId as string;
  const centreTest = await testsService.updateCentreTest(
    centreId,
    testId,
    req.body,
  );
  res.json({ data: centreTest });
}