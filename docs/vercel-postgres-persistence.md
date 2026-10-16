# Vercel Postgres persistence — v2

Nestful requires Postgres. File persistence and the single global JSONB state
have been removed from the new API. No schema creation occurs in an API request.

## Provision

1. Back up `public.nestful_app_state` before the early-data reset.
2. Run `services/api/migrations/003_relational_v2_up.sql`, `004_cursor_timestamp_precision_up.sql`, and `005_runtime_role_membership_up.sql` as the migration owner. The last migration grants that login explicit `SET TRUE` membership, required on PostgreSQL 16+.
3. Create a separate database login with a generated password and grant it
   `nestful_runtime`; never commit its password or connection URL.
4. Use the exact Transaction pooler endpoint from Supabase Connect (usually port
   6543). Its pooled username is `<login-role>.<project-ref>`.
5. Configure Vercel Production `DATABASE_URL` with the selected login and
   `PGSSL=require`. Keep the existing WeChat credentials and template IDs.
6. Set a strong `CRON_SECRET` and provide the same value to the external scheduler
   and GitHub `NESTFUL_CRON_SECRET`. Dispatch requires a bearer token; it no longer
   permits unauthenticated requests or a secret in the query string.
7. Deploy the matching API and preview client after all checks pass.

The Supabase project is `qrspwgrkxogbpvrdafnn`. V2 business tables are in the
private **nestful** schema, not the default public schema. Do not expose that
schema through PostgREST. `nestful_runtime` has DML but no DDL rights, and cannot
update or delete audit events. Every API transaction enters this role. On
2026-10-16 the user chose the existing `postgres` pooler connection and explicitly
authorized `GRANT nestful_runtime TO postgres WITH INHERIT FALSE, SET TRUE`.
The connection credential therefore still has the owner's privileges outside
the API's restricted transactions; switching to a dedicated login remains a
separate improvement. Passwords containing special characters must be URL encoded.

## Verify

- `GET /health` must return `storage: relational-v2`; it now checks database access.
- Anonymous family, member, reminder, activity, ledger, and space requests must
  fail. The old global `GET /v1/families` route is removed.
- Two real WeChat users create/join a family, then verify reminders, per-person
  completion, ledger, activities, and independently created space entries.
- Complete an activity, then explicitly save it as memory. Repeating that action
  must not create duplicate memories.
- Verify scheduler authorization and inspect notification states. Provider
  acceptance is not confirmation of delivery or reading.

`DATABASE_URL` and other production Secrets cannot be read back with env pull.
Updating a variable requires a new deployment. Never temporarily deploy an
endpoint that exposes credentials, or downgrade a Secret to readable config.

Keep function compute close to the database: `vercel.json` selects `pdx1`,
matching the current Supabase `us-west-2` endpoint. If the database region changes,
review this setting too. See [the measured performance follow-up](api-performance-2026-10-16.md).

## Recovery history

On 2026-10-15, the replacement Supabase project's legacy state was restored from
`db_cluster-22-08-2026@03-11-27.backup.gz`; its row was last updated on 2026-06-16.
The restore matched its source JSONB: 6 families, 8 members, 3 users, 7 reminder
plans, 11 reminders, 10 invitations, and 59 audit events. Only business state was
restored; system schemas and database roles were not imported. The direct DB
hostname failed on Vercel; switching to the Transaction pooler restored service.

For the v2 reset, take a fresh backup because the legacy app has received writes
since that recovery. Keep the old table inaccessible to the runtime after cutover.
Once new writes begin, do not roll back to stale JSONB. Pause writes and restore
or repair the v2 database instead.
