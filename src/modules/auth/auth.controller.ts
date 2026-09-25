import { Request, Response } from 'express';
import * as authService from './auth.service';

export async function signup(req: Request, res: Response) {
  const { user, token } = await authService.signup(req.body);
  res.status(201).json({ data: { user, token } });
}

export async function login(req: Request, res: Response) {
  const { token } = await authService.login(req.body);
  res.status(200).json({ data: { token } });
}