import { Request, Response } from 'express';
import * as centresService from './centres.service';
import { parsePagination } from '../../utils/pagination';

export async function listCentres(req: Request, res: Response) {
  const params = parsePagination(req.query as { page?: string; limit?: string });
  const location = req.query.location as string | undefined;
  const result = await centresService.listCentres({ ...params, location });
  res.json({ data: result.centres, meta: result.meta });
}

export async function getCentre(req: Request, res: Response) {
  const centreId = req.params.centreId as string;
  const centre = await centresService.getCentre(centreId);
  const formatted = {
    ...centre,
    tests: centre.centreTests.map((ct: { test: { id: string; name: string }; price: { toString: () => string } }) => ({
      testId: ct.test.id,
      name: ct.test.name,
      price: ct.price.toString(),
    })),
    centreTests: undefined,
  };
  res.json({ data: formatted });
}

export async function createCentre(req: Request, res: Response) {
  const centre = await centresService.createCentre(req.body);
  res.status(201).json({ data: centre });
}