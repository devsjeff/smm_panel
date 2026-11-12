import { Router } from 'express';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { prisma } from '../db';
import { env } from '../env';
import { HttpError } from '../lib/http';
import { clearSession, requireAuth, setSession } from '../middleware/auth';

export const authRouter = Router();

const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 11);

const limiter =rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: true, legacyHeaders: false });

const credentials = z.object({
  email: z.string().trim().toLowerCase().email().max(200),
  password: z.string().min(8).max(200),
});

authRouter.post('/register', limiter, async (req, res) => {
  const body = credentials.extend({ name: z.string().trim().min(1).max(100) }).parse(req.body);
  if (await prisma.user.findUnique({ where: { email: body.email } })) {
    throw new HttpError(409, 'Email is already registered');
  }
  const user = await prisma.user.create({
    data: { email: body.email, name: body.name, passwordHash: await bcrypt.hash(body.password, 11) },
  });
  setSession(res, user.id);
  res.status(201).json({ ok: true });
});

authRouter.post('/login', limiter, async (req, res) => {
  const body = credentials.parse(req.body);
  const user = await prisma.user.findUnique({ where: { email: body.email } });
  // Compare against a dummy hash when the user is missing so timing doesn't reveal it.
  const hash = user?.passwordHash ?? DUMMY_HASH;
  const ok = await bcrypt.compare(body.password, hash);
  if (!user || !ok) throw new HttpError(401, 'Wrong email or password');
  if (user.status !== 'ACTIVE') throw new HttpError(403, 'Account suspended');
  setSession(res, user.id);
  res.json({ ok: true });
});

authRouter.post('/logout', (_req, res) => {
  clearSession(res);
  res.json({ ok: true });
});

authRouter.get('/me', requireAuth, async (req, res) => {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: req.user!.id },
    select: { id: true, email: true, name: true, role: true, balance: true },
  });
  res.json({ ...user, currency: env.CURRENCY });
});
