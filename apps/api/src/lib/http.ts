import type { ErrorRequestHandler } from 'express';
import { Prisma } from '@prisma/client';
import { ZodError, z } from 'zod';
import { log } from './log';

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export const pageQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

export function paged<T>(items: T[], total: number, page: number, pageSize: number) {
  return { items, total, page, pages: Math.max(1, Math.ceil(total / pageSize)) };
}

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof ZodError) {
    const i = err.issues[0];
    res.status(400).json({ error: `${i.path.join('.') || 'input'}: ${i.message}` });
    return;
  }
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message });
    return;
  }
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') {
      res.status(409).json({ error: 'Already exists' });
      return;
    }
    if (err.code === 'P2025') {
      res.status(404).json({ error: 'Not found' });
      return;
    }
  }
  log.error({ err }, 'unhandled request error');
  res.status(500).json({ error: 'Internal server error' });
};
