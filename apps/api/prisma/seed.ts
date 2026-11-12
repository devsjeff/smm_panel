import bcrypt from 'bcryptjs';
import { env } from '../src/env';
import { prisma } from '../src/db';
import { encrypt } from '../src/lib/crypto';

async function main() {
  if (env.ADMIN_EMAIL && env.ADMIN_PASSWORD) {
    if (env.ADMIN_PASSWORD.length < 8) throw new Error('ADMIN_PASSWORD must be at least 8 characters');
    const email = env.ADMIN_EMAIL.trim().toLowerCase();
    const passwordHash = await bcrypt.hash(env.ADMIN_PASSWORD, 11);
    await prisma.user.upsert({
      where: { email },
      create: { email, name: 'Admin', passwordHash, role: 'ADMIN' },
      update: { role: 'ADMIN', passwordHash },
    });
    console.log(`Admin ready: ${email}`);
  } else {
    console.log('ADMIN_EMAIL / ADMIN_PASSWORD not set: skipped admin creation');
  }

  if (env.ENABLE_MOCK_PROVIDER) {
    const apiUrl = `http://localhost:${env.PORT}/api/mock-provider`;
    await prisma.provider.upsert({
      where: { name: 'Mock Provider' },
      create: { name: 'Mock Provider', apiUrl, apiKeyEnc: encrypt('mock-key') },
      update: { apiUrl },
    });
    console.log('Mock provider ready: open Admin > Providers and press "Sync services"');
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
