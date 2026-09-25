import { Request, Response } from 'express';
import * as paymentsService from './payments.service';
import { ApiError } from '../../utils/ApiError';

export async function createPayment(req: Request, res: Response) {
  const idempotencyKey = req.headers['idempotency-key'] as string | undefined;
  const result = await paymentsService.createPayment(req.user!.id, req.body, idempotencyKey);
  res.json({ data: result });
}

export async function webhook(req: Request, res: Response) {
  const signature = req.headers['x-webhook-signature'] as string;
  if (!signature) {
    throw ApiError.unauthorized('UNAUTHORIZED', 'Missing webhook signature');
  }

  const rawBody = (req as Request & { rawBody?: string }).rawBody || JSON.stringify(req.body);
  if (!paymentsService.verifyWebhookSignature(rawBody, signature)) {
    throw ApiError.unauthorized('UNAUTHORIZED', 'Invalid webhook signature');
  }

  const result = await paymentsService.processWebhook(req.body);
  res.json({ data: result });
}