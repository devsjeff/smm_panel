import 'dotenv/config';
import { z } from 'zod';

const bool = z
  .string()
  .optional()
  .transform((v) => v === 'true' || v === '1');

const schema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(4000),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  REDIS_URL: z.string().min(1, 'REDIS_URL is required'),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  ENCRYPTION_KEY: z.string().min(32, 'ENCRYPTION_KEY must be at least 32 characters'),
  ADMIN_EMAIL: z.string().optional(),
  ADMIN_PASSWORD: z.string().optional(),
  WEB_ORIGIN: z.string().default('http://localhost:3000'),
  CURRENCY: z.string().default('USD'),
  DEFAULT_MARKUP_PERCENT: z.coerce.number().min(0).default(30),
  ORDER_SYNC_INTERVAL_SECONDS: z.coerce.number().min(10).default(60),
  SERVICE_SYNC_INTERVAL_MINUTES: z.coerce.number().min(5).default(360),
  PROVIDER_TIMEOUT_MS: z.coerce.number().default(20000),
  LOW_BALANCE_THRESHOLD: z.coerce.number().default(10),
  DISPATCH_CONCURRENCY: z.coerce.number().min(1).default(10),
  ENABLE_MOCK_PROVIDER: bool,
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  const lines = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`);
  console.error(`Invalid environment (check apps/api/.env):\n${lines.join('\n')}`);
  process.exit(1);
}

export const env = parsed.data;
export const isProd = env.NODE_ENV === 'production';
