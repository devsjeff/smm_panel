import { Prisma } from '@prisma/client';
import { prisma, Decimal } from '../db';
import { env } from '../env';
import { log } from '../lib/log';
import { ProviderClient } from './providerClient';

const MARKUP_KEY = 'defaultMarkupPercent';

export async function getDefaultMarkup(): Promise<number> {
  const s = await prisma.setting.findUnique({ where: { key: MARKUP_KEY } });
  const n = s ? Number(s.value) : NaN;
  return Number.isFinite(n) && n >= 0 ? n : env.DEFAULT_MARKUP_PERCENT;
}

export async function setDefaultMarkup(percent: number) {
  await prisma.setting.upsert({
    where: { key: MARKUP_KEY },
    create: { key: MARKUP_KEY, value: String(percent) },
    update: { value: String(percent) },
  });
}

/** Sell price per 1000 = provider rate + markup, rounded up so we never sell below cost. */
export function computeRate(providerRate: Prisma.Decimal.Value, markupPercent: Prisma.Decimal.Value) {
  return new Decimal(providerRate)
    .mul(new Decimal(markupPercent).div(100).add(1))
    .toDecimalPlaces(5, Decimal.ROUND_UP);
}

/** Recompute every sell price: service override > provider markup > global default. */
export async function repriceAll() {
  const def = await getDefaultMarkup();
  return prisma.$executeRaw`
    UPDATE "Service" s
    SET "rate" = CEIL(s."providerRate" * (1 + COALESCE(s."customMarkupPercent", p."markupPercent", ${def}::numeric) / 100) * 100000) / 100000,
        "updatedAt" = NOW()
    FROM "Provider" p
    WHERE p."id" = s."providerId"`;
}

export async function refreshProviderBalance(providerId: string) {
  const provider = await prisma.provider.findUniqueOrThrow({ where: { id: providerId } });
  const { balance, currency } = await ProviderClient.from(provider).balance();
  if (Number(balance) < env.LOW_BALANCE_THRESHOLD) {
    log.warn({ provider: provider.name, balance }, 'provider balance is low');
  }
  return prisma.provider.update({
    where: { id: providerId },
    data: { balance: new Decimal(balance), currency: currency ?? provider.currency },
  });
}

/** Pull the provider's service list and upsert categories, services and prices. */
export async function syncProviderServices(providerId: string) {
  const provider = await prisma.provider.findUniqueOrThrow({ where: { id: providerId } });
  try {
    const list = await ProviderClient.from(provider).services();
    if (list.length === 0) throw new Error('Provider returned an empty service list');

    const defaultMarkup = await getDefaultMarkup();
    const baseMarkup = provider.markupPercent ?? defaultMarkup;

    const categoryIds = new Map<string, string>();
    for (const name of new Set(list.map((s) => s.category.trim() || 'Other'))) {
      const c = await prisma.category.upsert({ where: { name }, create: { name }, update: {} });
      categoryIds.set(name, c.id);
    }

    const existing = new Map(
      (
        await prisma.service.findMany({
          where: { providerId },
          select: { providerServiceId: true, customMarkupPercent: true },
        })
      ).map((s) => [s.providerServiceId, s]),
    );

    for (let i = 0; i < list.length; i += 100) {
      await prisma.$transaction(
        list.slice(i, i + 100).map((s) => {
          const markup = existing.get(s.service)?.customMarkupPercent ?? baseMarkup;
          const data = {
            name: s.name.slice(0, 500),
            type: s.type,
            categoryId: categoryIds.get(s.category.trim() || 'Other')!,
            providerRate: new Decimal(s.rate),
            rate: computeRate(s.rate, markup),
            min: s.min,
            max: s.max,
            refill: s.refill,
            cancel: s.cancel,
            providerAvailable: true,
          };
          return prisma.service.upsert({
            where: { providerId_providerServiceId: { providerId, providerServiceId: s.service } },
            create: { ...data, providerId, providerServiceId: s.service },
            update: data,
          });
        }),
      );
    }

    // Anything the provider no longer lists can't be ordered any more.
    const removed = await prisma.service.updateMany({
      where: { providerId, providerServiceId: { notIn: list.map((s) => s.service) } },
      data: { providerAvailable: false },
    });

    await prisma.provider.update({
      where: { id: providerId },
      data: { lastSyncedAt: new Date(), lastError: null },
    });
    log.info({ provider: provider.name, services: list.length, removed: removed.count }, 'services synced');
    return { services: list.length, removed: removed.count };
  } catch (e: any) {
    await prisma.provider.update({
      where: { id: providerId },
      data: { lastError: String(e?.message ?? e).slice(0, 300) },
    });
    throw e;
  }
}
