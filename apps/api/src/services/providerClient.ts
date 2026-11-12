import { z } from 'zod';
import { env } from '../env';
import { decrypt } from '../lib/crypto';

/**
 * rejected    – provider answered with an explicit error. Nothing was created. Safe to refund.
 * unreachable – request never reached the provider. Nothing was created. Safe to retry.
 * ambiguous   – timeout / broken response. The provider MAY have acted. Never auto-retry an
 *               "add" in this state (duplicate order = real money), flag for admin review.
 */
export type ProviderErrorKind = 'rejected' | 'unreachable' | 'ambiguous';

export class ProviderError extends Error {
  constructor(
    message: string,
    public kind: ProviderErrorKind,
  ) {
    super(message);
  }
}

// Providers send booleans as true / "true" / 1 / "1".
const flag = z.unknown().transform((v) => v === true || v === 'true' || v === 1 || v === '1');

const serviceSchema = z.object({
  service: z.coerce.string(),
  name: z.string(),
  type: z.string().default('Default'),
  category: z.string().default('Other'),
  rate: z.coerce.number().nonnegative(),
  min: z.coerce.number().int().nonnegative(),
  max: z.coerce.number().int().nonnegative(),
  refill: flag,
  cancel: flag,
});
export type ProviderService = z.infer<typeof serviceSchema>;

export type ProviderOrderStatus = {
  status?: string;
  remains?: string | number;
  start_count?: string | number | null;
  charge?: string | number;
  error?: string;
};

const NOT_SENT = ['ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN', 'ENETUNREACH', 'EHOSTUNREACH'];

export class ProviderClient {
  constructor(
    private apiUrl: string,
    private apiKey: string,
  ) {}

  static from(p: { apiUrl: string; apiKeyEnc: string }) {
    return new ProviderClient(p.apiUrl, decrypt(p.apiKeyEnc));
  }

  private async call(params: Record<string, string>): Promise<any> {
    const body = new URLSearchParams({ key: this.apiKey, ...params });
    let res: Response;
    try {
      res = await fetch(this.apiUrl, {
        method: 'POST',
        body,
        redirect: 'error',
        signal: AbortSignal.timeout(env.PROVIDER_TIMEOUT_MS),
      });
    } catch (e: any) {
      const code = e?.cause?.code as string | undefined;
      const kind = code && NOT_SENT.includes(code) ? 'unreachable' : 'ambiguous';
      throw new ProviderError(`Provider request failed: ${code ?? e?.name ?? 'error'}`, kind);
    }
    const text = await res.text();
    let json: any;
    try {
      json = JSON.parse(text);
    } catch {
      throw new ProviderError(`Provider returned non-JSON (HTTP ${res.status})`, 'ambiguous');
    }
    if (json && typeof json === 'object' && !Array.isArray(json) && json.error) {
      throw new ProviderError(String(json.error).slice(0, 300), 'rejected');
    }
    return json;
  }

  async services(): Promise<ProviderService[]> {
    const json = await this.call({ action: 'services' });
    if (!Array.isArray(json)) throw new ProviderError('Unexpected services response', 'ambiguous');
    const out: ProviderService[] = [];
    for (const raw of json) {
      const p = serviceSchema.safeParse(raw);
      if (p.success) out.push(p.data);
    }
    return out;
  }

  async balance(): Promise<{ balance: string; currency?: string }> {
    const json = await this.call({ action: 'balance' });
    if (json?.balance === undefined) throw new ProviderError('Unexpected balance response', 'ambiguous');
    return { balance: String(json.balance), currency: json.currency ? String(json.currency) : undefined };
  }

  async addOrder(service: string, link: string, quantity: number): Promise<string> {
    const json = await this.call({ action: 'add', service, link, quantity: String(quantity) });
    if (json?.order === undefined || json.order === null) {
      throw new ProviderError('Provider did not return an order id', 'ambiguous');
    }
    return String(json.order);
  }

  /** Up to 100 ids per call (API v2 limit). Result is keyed by provider order id. */
  async statuses(ids: string[]): Promise<Record<string, ProviderOrderStatus>> {
    if (ids.length === 1) {
      try {
        return { [ids[0]]: await this.call({ action: 'status', order: ids[0] }) };
      } catch (e) {
        if (e instanceof ProviderError && e.kind === 'rejected') return { [ids[0]]: { error: e.message } };
        throw e;
      }
    }
    const json = await this.call({ action: 'status', orders: ids.join(',') });
    if (!json || typeof json !== 'object') throw new ProviderError('Unexpected status response', 'ambiguous');
    return json;
  }
}
