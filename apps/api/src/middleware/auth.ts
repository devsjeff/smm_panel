import type { RequestHandler, Response } from 'express';
import jwt from 'jsonwebtoken';
import type { Role } from '@prisma/client';
import { prisma } from '../db';
import { env, isProd } from '../env';
import { HttpError } from '../lib/http';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: { id: string; role: Role };
    }
  }
}

const COOKIE = 'smm_session';
const WEEK = 7 * 24 * 60 * 60;

export function setSession(res: Response, userId: string) {
  const token = jwt.sign({ sub: userId }, env.JWT_SECRET, { expiresIn: WEEK });
  res.cookie(COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: isProd,
    maxAge: WEEK * 1000,
    path: '/',
  });
}

export function clearSession(res: Response) {
  res.clearCookie(COOKIE, { path: '/' });
}

// Loads the user on every request so bans and role changes apply immediately.
export const requireAuth: RequestHandler = async (req, _res, next) => {
  const token = req.cookies?.[COOKIE];
  if (!token) throw new HttpError(401, 'Not signed in');
  let sub: string;
  try {
    sub = String((jwt.verify(token, env.JWT_SECRET) as jwt.JwtPayload).sub);
  } catch {
    throw new HttpError(401, 'Session expired');
  }
  const user = await prisma.user.findUnique({ where: { id: sub }, select: { id: true, role: true, status: true } });
  if (!user) throw new HttpError(401, 'Not signed in');
  if (user.status !== 'ACTIVE') throw new HttpError(403, 'Account suspended');
  req.user = { id: user.id, role: user.role };
  next();
};

export const requireAdmin: RequestHandler = (req, _res, next) => {
  if (req.user?.role !== 'ADMIN') throw new HttpError(403, 'Admin only');
  next();
};
