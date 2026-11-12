'use client';

import { useState, type FormEvent } from 'react';
import { Badge, Card, Field, fmtDate, Notice, PageHeader } from '@/components/ui';
import { api, useApi } from '@/lib/api';
import type { AdminProvider } from '@/lib/types';

const empty = { id: '', name: '', apiUrl: '', apiKey: '', markupPercent: '', isActive: true };

export default function AdminProvidersPage() {
  const { data, error, reload } = useApi<AdminProvider[]>('/admin/providers');
  const [form, setForm] = useState<typeof empty | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: 'green' | 'red'; text: string } | null>(null);

  async function run(key: string, fn: () => Promise<string>) {
    setBusy(key);
    setMessage(null);
    try {
      setMessage({ tone: 'green', text: await fn() });
      reload();
    } catch (err) {
      setMessage({ tone: 'red', text: (err as Error).message });
    } finally {
      setBusy(null);
    }
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!form) return;
    setBusy('save');
    setFormError(null);
    const body = {
      name: form.name,
      apiUrl: form.apiUrl,
      isActive: form.isActive,
      markupPercent: form.markupPercent === '' ? null : Number(form.markupPercent),
      // Blank key on edit = keep the stored one.
      ...(form.apiKey ? { apiKey: form.apiKey } : {}),
    };
    try {
      if (form.id) await api(`/admin/providers/${form.id}`, { method: 'PATCH', body });
      else await api('/admin/providers', { body });
      setForm(null);
      reload();
    } catch (err) {
      setFormError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <PageHeader title="Providers" sub="Wholesale SMM panels (API v2) that fulfil your orders">
        <button className="btn btn-primary" onClick={() => setForm(empty)}>
          Add provider
        </button>
      </PageHeader>

      {error && <Notice>{error}</Notice>}
      {message && (
        <div className="mb-4">
          <Notice tone={message.tone}>{message.text}</Notice>
        </div>
      )}

      {form && (
        <Card title={form.id ? 'Edit provider' : 'Add provider'} className="mb-5">
          <form onSubmit={save} className="grid gap-4 p-4 sm:grid-cols-2">
            {formError && (
              <div className="sm:col-span-2">
                <Notice>{formError}</Notice>
              </div>
            )}
            <Field label="Name">
              <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            </Field>
            <Field label="API URL" hint="Usually ends with /api/v2">
              <input
                className="input"
                type="url"
                placeholder="https://provider.com/api/v2"
                value={form.apiUrl}
                onChange={(e) => setForm({ ...form, apiUrl: e.target.value })}
                required
              />
            </Field>
            <Field label="API key" hint={form.id ? 'Leave blank to keep the current key' : 'Stored encrypted'}>
              <input
                className="input"
                type="password"
                autoComplete="off"
                value={form.apiKey}
                onChange={(e) => setForm({ ...form, apiKey: e.target.value })}
                required={!form.id}
              />
            </Field>
            <Field label="Markup %" hint="Blank = use the global default">
              <input
                className="input num"
                type="number"
                min="0"
                step="0.01"
                value={form.markupPercent}
                onChange={(e) => setForm({ ...form, markupPercent: e.target.value })}
              />
            </Field>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} />
              Active (its services can be ordered)
            </label>
            <div className="flex justify-end gap-2 sm:col-span-2">
              <button type="button" className="btn" onClick={() => setForm(null)}>
                Cancel
              </button>
              <button className="btn btn-primary" disabled={busy === 'save'}>
                {busy === 'save' ? 'Saving...' : 'Save provider'}
              </button>
            </div>
          </form>
        </Card>
      )}

      {data && data.length === 0 && !form && (
        <Card>
          <p className="p-6 text-sm text-muted">No providers yet. Add one, then sync its services to fill your catalog.</p>
        </Card>
      )}

      <div className="space-y-4">
        {data?.map((p) => (
          <Card key={p.id}>
            <div className="flex flex-wrap items-start justify-between gap-4 p-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h2 className="font-semibold">{p.name}</h2>
                  <Badge tone={p.isActive ? 'green' : 'gray'}>{p.isActive ? 'Active' : 'Off'}</Badge>
                </div>
                <div className="mt-1 truncate text-xs text-muted">{p.apiUrl}</div>
                <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm">
                  <span>
                    <span className="text-muted">Balance </span>
                    <span className="num font-medium">
                      {p.balance === null ? 'not checked' : `${Number(p.balance).toFixed(2)} ${p.currency ?? ''}`}
                    </span>
                  </span>
                  <span>
                    <span className="text-muted">Services </span>
                    <span className="num font-medium">{p._count.services.toLocaleString()}</span>
                  </span>
                  <span>
                    <span className="text-muted">Markup </span>
                    <span className="num font-medium">{p.markupPercent === null ? 'default' : `${Number(p.markupPercent)}%`}</span>
                  </span>
                  <span>
                    <span className="text-muted">Last sync </span>
                    {p.lastSyncedAt ? fmtDate(p.lastSyncedAt) : 'never'}
                  </span>
                </div>
                {p.lastError && <div className="mt-2 text-xs text-red-700">Last error: {p.lastError}</div>}
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  className="btn btn-sm"
                  disabled={busy !== null}
                  onClick={() =>
                    run(`sync-${p.id}`, async () => {
                      const r = await api<{ services: number; removed: number }>(`/admin/providers/${p.id}/sync`, { method: 'POST' });
                      return `${p.name}: ${r.services} services synced, ${r.removed} no longer offered.`;
                    })
                  }
                >
                  {busy === `sync-${p.id}` ? 'Syncing...' : 'Sync services'}
                </button>
                <button
                  className="btn btn-sm"
                  disabled={busy !== null}
                  onClick={() =>
                    run(`bal-${p.id}`, async () => {
                      const r = await api<{ balance: string; currency: string | null }>(`/admin/providers/${p.id}/balance`, { method: 'POST' });
                      return `${p.name} balance: ${Number(r.balance).toFixed(2)} ${r.currency ?? ''}`;
                    })
                  }
                >
                  {busy === `bal-${p.id}` ? 'Checking...' : 'Check balance'}
                </button>
                <button
                  className="btn btn-sm"
                  onClick={() =>
                    setForm({ id: p.id, name: p.name, apiUrl: p.apiUrl, apiKey: '', markupPercent: p.markupPercent ?? '', isActive: p.isActive })
                  }
                >
                  Edit
                </button>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </>
  );
}
