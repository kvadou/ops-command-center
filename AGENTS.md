# Acme Operations - Operations Platform

Internal operations platform for Acme Operations. Manages sales pipeline (CCT), job scheduling, tutor management, analytics dashboards, and multi-market franchise operations. Production system used daily by non-technical admins.

## Architecture

| Layer | Stack | Notes |
|-------|-------|-------|
| Frontend | React 18 + Vite, Tailwind + MUI + Headless UI | SPA, lazy-loaded routes |
| Backend | Node.js + Express | CommonJS, raw SQL |
| Database | PostgreSQL (5 databases) | `pg` pool, parameterized queries |
| Cache | Redis (shared) + in-memory fallback | `utils/cache.js` |
| Email | Brevo (transactional), Missive (CRM) | Webhooks + API polling |
| External | TutorCruncher (core), Stripe, Meta Ads, Google Ads | TC is dependency, not source of truth |
| Hosting | Heroku (4 apps) + GitHub auto-deploy to staging | Doug promotes staging to prod |

### File Structure

```
server.js              # Express app, 900+ lines, mounts 138+ routes
config/deps.js         # Pool + external service initialization
database-connections.js # Multi-region pool management
routes/                # 138+ Express routers (largest: webhook.js 7844 lines)
services/              # 64 service modules (largest: forecast-service.js 3987 lines)
jobs/                  # 7 scheduled jobs (Heroku Scheduler)
middleware/            # auth, error-handler, rbac, rate-limit, location-db
utils/                 # cache, logger (Pino), validation, clientManager
models/                # 7 Sequelize models (legacy, mostly unused)
migrations/            # 185 raw SQL files (idempotent, semantic names)
scripts/               # One-off and scheduled scripts
src/                   # React frontend
  App.js               # Router + layout (1200+ lines)
  components/          # 200+ components, 142K LOC total
  clubs/               # Club-specific components
  contexts/            # React contexts
  hooks/               # Custom React hooks
  pages/               # Page-level components
```

### Heroku Environments

| App | Purpose | Database |
|-----|---------|----------|
| `acme-ops-main` | Production | `PRODUCTION_DATABASE_URL` |
| `story-time-staging` | Staging (auto-deploy from GitHub) | `STAGING_DATABASE_URL` |
| `acmeops-westside` | Westside franchise | `WESTSIDE_DATABASE_URL` |
| `acmeops-eastside` | Eastside franchise | `EASTSIDE_DATABASE_URL` |

## Key Conventions

### Backend
- **Raw SQL only** -- no ORM for queries. Use `pool.query(SQL, [params])` with `$1, $2` placeholders
- **Services pattern**: Routes orchestrate, services contain business logic and queries
- **Auth**: JWT via `middleware/auth.js` with `requireAuth` middleware
- **Logging**: Pino structured logger (`utils/logger.js`), NOT `console.log`
- **Error handling**: Use `asyncHandler` wrapper from `middleware/error-handler.js`
- **Caching**: `utils/cache.js` for Redis + in-memory. Always `await clearCache()` on writes
- **Parallelism**: Use `Promise.all()` for independent DB queries and HTTP calls

### Frontend
- **React functional components** with hooks (useState, useEffect)
- **Lazy loading**: All non-critical routes use `React.lazy()` in App.js
- **Styling**: Tailwind utilities + MUI components + Headless UI
- **Layout**: Use `OperationsHubLayout` for new ops pages
- **No native dialogs**: Never use `window.alert()`, `window.confirm()`, `window.prompt()` -- use custom modals

### Database
- **Migrations**: Raw SQL in `migrations/`, idempotent (`IF NOT EXISTS`), run on ALL 5 databases
- **Naming**: snake_case tables and columns, `idx_{table}_{column}` for indexes
- **IDs**: `clients.client_id` is VARCHAR (TC ID); `contractors.contractor_id` is INTEGER -- normalize with `parseInt()` for lookups
- **Timestamps**: Always `TIMESTAMP WITH TIME ZONE` (UTC)
- **Soft delete preferred**: Use `deleted_at` column, never hard DELETE user-facing data without confirmation

## Safety Rules

- **NEVER push directly to Heroku** -- push to GitHub only; auto-deploys to staging
- **NEVER run destructive DB operations** without explicit confirmation
- **Run migrations on ALL databases** when adding schema changes (main, staging, westside, eastside, local)
- **Verify route file targets** with `grep "routerName" server.js` before modifying routes
- **Check table names match route names**: `/api/email-templates` must query `email_templates` table

## Key People

| Person | Role | Context |
|--------|------|---------|
| **Admin User** | Tech Director / Owner | Final decision-maker on all changes |
| **Alex Johnson** | Primary admin | Non-technical. Ask: "Can Nicholas do this without help?" |
| **Sam Williams** | COO-level admin | Same permissions as Nicholas |
| **Jamie Parker** | Client conversion | Manages CCT pipeline manually |
| **Morgan Davis** | Tutor pairing | Manages tutor quality |

## Domain Concepts

- **CCT** = Client Conversion Tracker. Conversion = first PAID lesson after trial
- **Pipeline stages** are manual (Jena manages). `prospect_status` auto-updates; `pipeline_stage` is manual
- **TutorCruncher (TC)** is the external scheduling/billing platform. Local DB syncs from TC
- **Labels** drive behavior, reporting, and calendar colors. Applied in `clientManager.js`
- **Trial pricing**: `actual_price` = promo $15 (customer pays); `original_price` = full value. Job rate = `original_price`
- **GGHS** = Good Game Handshakes. 1 per completed lesson (not per student). Lifetime metric across MindBody (2016-2023), E4 (2023-2024), and TutorCruncher (2024-present). Base count in `company_metrics` table, TC delta computed live across all branches (main + franchises). Target: 1 Million.

## Critical Pitfalls

1. **TC list vs detail endpoints**: `/clients/` list returns only 6 fields (no labels, phone, extra_attrs). Must fetch `/clients/{id}/` for full details
2. **Webhook payloads lack labels**: Always fetch full client details after webhook events
3. **Type mismatch in lookups**: `client_id` is VARCHAR in DB, integer from TC API. Use `parseInt()` for Set/Map keys
4. **Browser caching (304)**: When data exists in DB but UI shows stale values, add `Cache-Control: no-cache` headers
5. **Multi-dyno cache**: In-memory cache doesn't sync across Heroku dynos. Use Redis via `utils/cache.js`
6. **Node.js HTTP connection limits**: Default `maxSockets` is 5. Create custom agents with `maxSockets: 50` for internal API calls
7. **Heroku H12 timeout**: 30-second limit. Use `Promise.all()` for parallel queries, never sequential
8. **Regional databases**: Eastside/Westside have separate DBs. Check correct pool with `getLocationPool(req)`
9. **Two syncClients functions**: `services/server-fns.js` (manual sync) and `jobs/sync.service.js` (scheduled). Both must fetch full details for new clients
10. **Templates table vs email_templates table**: Two separate tables. Route name MUST match table name

## Layout Pitfalls

- **Detail pages inside AuthenticatedLayout**: Routes under the `*` catch-all in App.js are already wrapped in `AuthenticatedLayout` (header + sidebar). Detail page components (ClientDetailPage, JobDetailPage, etc.) must NOT add their own `OperationsHubLayout` — it causes duplicate chrome. Use `EntityDetailPage` directly or a bare fragment.
- **Navigation routes get automatic card wrapper**: All routes in the `navigation` array in App.js are wrapped in `<div className="bg-white rounded-xl border border-neutral-200 shadow-sm overflow-hidden">`. Don't add redundant card wrappers inside those components.

## Active Projects

| Project | Status | Checkpoint |
|---------|--------|------------|
| `billing-engine` | Week 1-2 Complete | `docs/plans/BILLING_ENGINE_CHECKPOINT.md` |

## Pricing Quick Reference

Home: $119/hr, Online: $59/hr, Club: $60/class, Trial promo: $15 (job rate = full value).
See `docs/PRICING.md` for complete pricing sheet.

## Detailed References

| Topic | Location |
|-------|----------|
| Learned rules from incidents | `docs/LEARNED_RULES.md` |
| Full retrospective archive | `docs/RETROSPECTIVES_ARCHIVE.md` |
| Architecture deep dive | `docs/ARCHITECTURE.md` |
| Development standards | `docs/STANDARDS.md` |
| Database conventions | `docs/DATABASE.md` |
| QA & testing standards | `docs/TESTING.md` |
| Agent dispatch patterns | `docs/AGENTS.md` |
| Billing engine checkpoint | `docs/plans/BILLING_ENGINE_CHECKPOINT.md` |
