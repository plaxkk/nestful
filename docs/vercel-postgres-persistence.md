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
- `ledgerGoalFunds`
- `digitalSpaceItems`
- `auditEvents`

This is the Phase 3 persistence bridge from local JSON to cloud database. The normalized migration is now checked in under `services/api/migrations/`, but the API should continue to read and write JSONB until a staged cutover is explicitly scheduled.

## Normalized Migration Rehearsal

Run this on a staging clone first:

```bash
psql "$DATABASE_URL" -f services/api/migrations/001_normalized_postgres_up.sql
psql "$DATABASE_URL" -f services/api/migrations/001_normalized_postgres_verify.sql
```

The verify query should show zero `count_delta` for entities that exist in JSONB. If a rehearsal fails or the application should stay on JSONB, rollback only the normalized projection:

```bash
psql "$DATABASE_URL" -f services/api/migrations/001_normalized_postgres_down.sql
```

The rollback keeps `nestful_app_state` intact.

## Supabase Recovery (2026-10-15)

The replacement project is `qrspwgrkxogbpvrdafnn`. The cluster backup named
`db_cluster-22-08-2026@03-11-27.backup.gz` contained one Nestful state row,
last updated at `2026-06-16 08:04:25.17338+00`. Only that business row was
restored; Supabase system schemas and roles were not imported. A JSONB equality
query confirmed the restored document exactly matched the backup: 6 families,
8 members, 3 users, 7 reminder plans, 11 reminders, 10 invitations, and 59 audit
events. Changes after that snapshot cannot be recovered from this backup.

The schema is recorded in `services/api/migrations/002_private_app_state_up.sql`.
RLS is enabled and `anon`/`authenticated` table access is revoked because the
API uses a privileged Postgres connection. The advisor's informational
"RLS Enabled No Policy" finding is intentional: clients must not access this
all-family document through the Data API.

Production cutover completed after replacing the direct connection, which
returned `ENOTFOUND`, and deploying the updated environment. Production API
verification returned HTTP 200 for all 6 families, all 8 members, and all 11
reminders; family IDs matched the backup. An unknown invitation returned the
expected 404. A database update probe succeeded inside a rolled-back transaction,
leaving the business document unchanged. Mini-program WeChat login and new
family/invitation/reminder creation still require an authenticated device check;
old sessions may have expired and require login again.

Use the **Transaction pooler**
connection string from the project's **Connect** dialog (normally port 6543),
including its pooler hostname and `postgres.<project-ref>` username. Do not
derive the pooler hostname from the region. Keep the password secret and retain
`NESTFUL_STORAGE=postgres` and `PGSSL=require`, then redeploy and verify API
reads and writes. Updating the variable alone does not update a deployment.

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
