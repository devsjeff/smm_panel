'use client';

import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { api } from '@/lib/api';
import { SITE_NAME } from './Shell';
import { Field, Notice } from './ui';

export function AuthForm({ mode }: { mode: 'login' | 'register' }) {
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const register = mode === 'register';

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api(`/auth/${mode}`, {
        body: register ? form : { email: form.email, password: form.password },
      });
      window.location.href = '/dashboard';
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm({ ...form, [k]: e.target.value });

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <div className="text-lg font-semibold tracking-tight">{SITE_NAME}</div>
          <p className="mt-1 text-sm text-muted">{register ? 'Create your account' : 'Sign in to your account'}</p>
        </div>
        <form onSubmit={submit} className="card space-y-4 p-5">
          {error && <Notice>{error}</Notice>}
          {register && (
            <Field label="Name">
              <input className="input" value={form.name} onChange={set('name')} required maxLength={100} autoComplete="name" />
            </Field>
          )}
          <Field label="Email">
            <input className="input" type="email" value={form.email} onChange={set('email')} required autoComplete="email" />
          </Field>
          <Field label="Password" hint={register ? 'At least 8 characters' : undefined}>
            <input
              className="input"
              type="password"
              value={form.password}
              onChange={set('password')}
              required
              minLength={8}
              autoComplete={register ? 'new-password' : 'current-password'}
            />
          </Field>
          <button className="btn btn-primary w-full" disabled={busy}>
            {busy ? 'Please wait...' : register ? 'Create account' : 'Sign in'}
          </button>
        </form>
        <p className="mt-4 text-center text-sm text-muted">
          {register ? 'Already have an account? ' : 'New here? '}
          <Link className="font-medium text-brand underline" href={register ? '/login' : '/register'}>
            {register ? 'Sign in' : 'Create an account'}
          </Link>
        </p>
      </div>
    </div>
  );
}
