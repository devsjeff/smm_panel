import express from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import { env, isProd } from './env';
import { prisma } from './db';
import { errorHandler, HttpError } from './lib/http';
import { log } from './lib/log';
import { authRouter } from './routes/auth';
import { userRouter } from './routes/user';
import { adminRouter } from './routes/admin';
import { mockProviderRouter } from './routes/mockProvider';

const app = express();
// The API sits behind the Next.js proxy / Azure ingress.
app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use(helmet());

app.get('/health', async (_req, res) => {
  await prisma.$queryRaw`SELECT 1`;
  res.json({ ok: true });
});

if (env.ENABLE_MOCK_PROVIDER) {
  if (isProd) log.warn('ENABLE_MOCK_PROVIDER is on in production: turn it off');
  app.use('/api/mock-provider', mockProviderRouter);
}

app.use(express.json({ limit: '100kb' }));
app.use(cookieParser());
app.use(rateLimit({ windowMs: 60 * 1000, limit: 300, standardHeaders: true, legacyHeaders: false }));

// CSRF: the session cookie is SameSite=Lax, and on top of that state-changing
// requests must come from our own site.
app.use((req, _res, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const origin = req.get('origin');
  if (origin && origin !== env.WEB_ORIGIN) throw new HttpError(403, 'Bad origin');
  next();
});

app.use('/api/auth', authRouter);
app.use('/api/admin', adminRouter);
app.use('/api', userRouter);

app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});
app.use(errorHandler);

const server = app.listen(env.PORT, () => log.info(`API listening on :${env.PORT}`));

async function shutdown() {
  server.close();
  await prisma.$disconnect();
  process.exit(0);
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
