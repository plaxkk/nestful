# Vercel Postgres Persistence

Nestful production must not rely on Vercel local files. Vercel functions can be recreated at any time, so production persistence uses Postgres-compatible cloud storage.

## Required Environment Variables

Set these in the Vercel Nestful project for Production:

```text
NESTFUL_STORAGE=postgres
DATABASE_URL=<Supabase or Postgres pooled connection string>
PGSSL=require
```

Remove the old `DATA_FILE` Production variable after `DATABASE_URL` is set. `DATA_FILE` is only for local development.

If the external Postgres database is unavailable during an experience-version
acceptance, deploy with file storage as a temporary fallback:

```text
NESTFUL_STORAGE=file
DATA_FILE=/tmp/nestful.json
```

This restores the mini-program API on Vercel, but it is not durable production
persistence. Switch back to Postgres after `DATABASE_URL` is known-good.

## Recommended Database

Use Supabase/Postgres unless there is an explicit company requirement to keep Nestful data in Tencent Cloud.

For Supabase, use the pooled connection string from:

```text
Supabase Project -> Settings -> Database -> Connection string -> Transaction pooler
```

The value usually starts with:

```text
postgresql://...
```

## What the API Creates

On first production request, the API creates this table if it does not exist:

```sql
create table if not exists nestful_app_state (
  id text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);
```

Current business entities are persisted inside the `data` JSONB document:

- `families`
- `members`
- `invitations`
- `reminders`
- `activities`
- `ledgerEntries`
- `digitalSpaceItems`
- `auditEvents`

This is the Phase 3 persistence bridge from local JSON to cloud database. A later hardening pass can split this JSONB state into the normalized target tables in `docs/database-schema.md`.

## Vercel CLI Setup

After the database exists, add the variables:

```bash
vercel env add NESTFUL_STORAGE production
vercel env add DATABASE_URL production
vercel env add PGSSL production
```

Use these values:

```text
NESTFUL_STORAGE -> postgres
DATABASE_URL -> <database connection string>
PGSSL -> require
```

Then remove the old local-file variable from Production:

```bash
vercel env rm DATA_FILE production
```

Finally deploy:

```bash
vercel deploy --prod
```

## Verification

Run local checks before deploying:

```bash
corepack pnpm run typecheck
corepack pnpm run lint
DATA_FILE=/tmp/nestful-smoke.json corepack pnpm run dev:api
API_BASE_URL=http://127.0.0.1:3100 corepack pnpm run acceptance:smoke
vercel build --prod
```

After production deploy, verify:

```bash
curl https://nestful.kkplayit.online/health
curl https://nestful.kkplayit.online/v1/families
```

For persistence verification:

1. Create a family through the mini program or API.
2. Redeploy production with `vercel deploy --prod`.
3. Read `/v1/families` again.
4. Confirm the same family still exists.
