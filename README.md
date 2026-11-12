# SMM Reseller Panel

Customers top up a wallet and place orders; the platform forwards each order to a wholesale
SMM provider (standard "API v2"), tracks its status, and refunds automatically when the
provider cancels or only partly delivers.

```
apps/web   Next.js 15 + TypeScript + Tailwind   customer + admin UI   :3000
apps/api   Express 5 + Prisma + BullMQ          REST API              :4000
           └─ src/worker.ts                     background worker (separate process)
PostgreSQL  users, wallet ledger, providers, services, orders
Redis       BullMQ job queues
```

## Run it locally

You need **PostgreSQL** and **Redis**. Either install Docker Desktop and run
`docker compose up -d`, or use hosted ones (Neon/Supabase for Postgres, Upstash for Redis)
and paste their URLs into `apps/api/.env`.

1. Fill `apps/api/.env` (already created, secrets pre-generated):
   - `DATABASE_URL`, `REDIS_URL`
   - `ADMIN_EMAIL`, `ADMIN_PASSWORD` (your first admin login)
2. `npm install`
3. `npm run db:migrate` then `npm run db:seed`
4. Three terminals: `npm run dev:api`, `npm run dev:worker`, `npm run dev:web`
5. Open http://localhost:3000 and sign in with the admin account.

**Try it without a real provider:** with `ENABLE_MOCK_PROVIDER=true` the seed adds a
"Mock Provider". Go to Admin > Providers > *Sync services*, give yourself balance in
Admin > Users, then place an order. It completes in about 90 seconds. Put `partial`,
`cancel` or `reject` in the link to see the refund paths.

**Go live with a real provider:** Admin > Providers > *Add provider* (API URL + key from
the provider's panel), *Sync services*, set your markup in Admin > Services & pricing.

## Environment variables

`apps/api/.env` (see `.env.example` for every option):

| Variable | What it is |
| --- | --- |
| `DATABASE_URL` | Postgres connection string |
| `REDIS_URL` | Redis connection string (`rediss://` for TLS) |
| `JWT_SECRET` | Signs login sessions |
| `ENCRYPTION_KEY` | Encrypts provider API keys in the DB. Don't change it after adding providers |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | Admin created by `npm run db:seed` |
| `WEB_ORIGIN` | Public URL of the site (used for the CSRF origin check) |
| `CURRENCY`, `DEFAULT_MARKUP_PERCENT` | Display currency, default markup |
| `ENABLE_MOCK_PROVIDER` | Fake provider for testing. **false in production** |

`apps/web/.env.local`: `API_URL` (where the API runs), `NEXT_PUBLIC_SITE_NAME`.

Provider API keys are **not** env vars: they are added in the admin UI and stored encrypted.

## How an order flows

1. **Customer places order** (`POST /api/orders`). In one DB transaction: the wallet is
   debited with a conditional update (`balance >= charge`), the order row is created as
   `PENDING`, and a ledger entry is written. Two simultaneous orders can't overspend.
2. **Queued.** After commit, a job goes onto the `order-dispatch` queue.
3. **Worker dispatches.** It claims the order (`PENDING -> PROCESSING`, only one job can
   win) and calls the provider's `action=add`.
   - Accepted: save the provider order id, status `IN_PROGRESS`.
   - Provider says no (bad link, no funds...): `FAILED`, full refund.
   - Provider unreachable: retried 5 times with backoff, then `FAILED` + refund.
   - Timeout / unreadable reply: **not** retried and **not** refunded, because the provider
     may have accepted it. Flagged "Needs review" for an admin (Resend / Link ID / Refund).
4. **Status sync every 60s.** The worker asks the provider for all in-progress orders,
   100 per request. `Completed` closes the order; `Partial` refunds the undelivered share;
   `Canceled` refunds everything.
5. **Sweeper** (same 60s job) re-queues orders that were charged but never dispatched
   (e.g. Redis was down) and flags orders stuck mid-dispatch.

Refunds are idempotent twice over: the status change is a guarded update, and the ledger
has a unique `(orderId, REFUND)` constraint.

## Deploying on Azure (simplest reliable setup)

| Piece | Azure service | Notes |
| --- | --- | --- |
| Web, API, Worker | **Azure Container Apps** (3 apps, one environment) | API and worker use the same image with different start commands. API ingress internal-only; only web is public. Worker: min 1 replica, no ingress |
| Database | **Azure Database for PostgreSQL Flexible Server** (Burstable B1ms) | Automatic daily backups, 7-day point-in-time restore |
| Queue | **Azure Cache for Redis** (Basic C0 to start) | Must use `noeviction`. Basic has no persistence; the sweeper recovers lost jobs. Move to Standard C1 when revenue justifies it |
| Images | Azure Container Registry (Basic) | |
| Secrets | Key Vault, referenced as Container Apps secrets | Never bake `.env` into images |
| Logs / alerts | Log Analytics + Azure Monitor | API and worker log JSON to stdout. Alert on the strings `flagged for review`, `provider balance is low`, and on container restarts |
| CI/CD | GitHub Actions: build images, push to ACR, `az containerapp update` | Run `npm run db:migrate` as a step before rolling the API |

Rough cost at low traffic: about **US$60-100/month** (Postgres ~$15-25, Redis ~$16,
Container Apps ~$20-40, registry + logs ~$10). Check the Azure pricing calculator for your
region before committing. The cheapest workable alternative is a single B2s VM running
everything with Docker Compose (~$30-40/month), at the cost of doing your own backups and
having one machine as a single point of failure.

Production checklist: `NODE_ENV=production`, `ENABLE_MOCK_PROVIDER=false`, real
`WEB_ORIGIN` (https), strong `ADMIN_PASSWORD`, provider URLs must be https (enforced).

## What is and isn't built

Built (MVP): registration/login with roles, service catalog by category, wallet with full
transaction ledger, manual deposit requests approved by an admin, order placement and
tracking, provider management, catalog sync, three-level markup pricing, dispatch worker,
60s status sync, automatic full/partial refunds, retries, admin review queue.

Not built yet:

- **Payment gateway.** Deposits are manual (customer submits a payment reference, admin
  approves). A gateway needs your merchant account; it plugs in as a webhook that does what
  "Approve" does today.
- Email verification, password reset, 2FA for admins.
- Customer-facing reseller API (API keys for your customers), refill/cancel buttons,
  drip-feed and subscription orders, multi-provider failover, currency conversion
  (provider rates are assumed to be in `CURRENCY`), tickets, automated tests.
- The optional Playwright "internal execution workers" module is intentionally not part of
  this codebase.
