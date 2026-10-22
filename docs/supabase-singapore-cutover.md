# Supabase Singapore cutover runbook — 2026-10-21

This is the operational companion to the first-open performance plan. The code side
is already deployed: `POST /v1/me/bootstrap` is live on `pdx1` and the legacy
`/v1/wechat/session` and `/v1/me/home` routes are unchanged. Nothing in this
document has been executed against production yet.

Status: **Step 0 passed on 2026-10-22.** A Shanghai handset on cellular data with
VPN off reported `x-vercel-id: sin1::...`, `country: CN`, so the edge is already
Singapore and Stage 1 applies. The only remaining blocker is the new Supabase
project.

1. **Step 0 measurement — done.** See `docs/api-performance-2026-10-16.md`.
2. **New Supabase project.** Create it in `ap-southeast-1` (Singapore) in the
   dashboard; neither the connected MCP binding nor a local CLI can create
   projects.

## Baseline snapshot (2026-10-21)

Taken read-only from the live Oregon database before any migration:

| Table | Rows |
| --- | --- |
| activities | 1 |
| activity_participants | 2 |
| activity_tasks | 1 |
| audit_events | 8 |
| families | 2 |
| family_invitations | 1 |
| family_join_requests | 1 |
| family_members | 3 |
| ledger_entries | 0 |
| ledger_entry_splits | 0 |
| ledger_goal_funds | 0 |
| member_private_profiles | 0 |
| notification_deliveries | 4 |
| reminder_occurrence_members | 3 |
| reminder_occurrences | 2 |
| reminder_plan_members | 1 |
| reminder_plans | 2 |
| space_item_media | 0 |
| space_item_members | 0 |
| space_items | 0 |
| user_sessions | 14 |
| users | 9 |
| wechat_identities | 9 |

23 tables in schema `nestful`, 14 of the sessions unrevoked and unexpired.
Server is PostgreSQL 17.11. Re-count the table list with:

```sql
select tablename from pg_tables where schemaname = 'nestful' order by 1;
select relname as table_name,
       (xpath('/row/c/text()',
              query_to_xml(format('select count(*) as c from %I.%I', schemaname, relname),
                           false, true, '')))[1]::text::int as row_count
from pg_stat_user_tables
where schemaname = 'nestful'
order by relname;
```

## Tooling

The server is PG 17 and local `pg_dump` 16 cannot dump it. Homebrew has no bottle
for `postgresql@17` on this Intel macOS 26 machine, so 17.11 was built from source:

```bash
export PG17_BIN="$HOME/.local/pgsql17/bin"
"$PG17_BIN/pg_dump" --version    # pg_dump (PostgreSQL) 17.11
```

Use `pg_dump`, `pg_restore`, and `psql` from that directory for every step below.
They do not touch the local PG 16 used by `pnpm test:postgres`.

## Rehearsal

```bash
mkdir -p .data/private-backups && chmod 700 .data/private-backups
"$PG17_BIN/pg_dump" "$OLD_DATABASE_URL" \
  --schema=nestful --no-owner --no-acl --format=custom \
  --file=.data/private-backups/nestful-rehearsal.dump
"$PG17_BIN/pg_restore" "$NEW_DATABASE_URL" \
  --no-owner --no-acl --clean --if-exists --single-transaction \
  .data/private-backups/nestful-rehearsal.dump
"$PG17_BIN/psql" "$NEW_DATABASE_URL" -v ON_ERROR_STOP=1 \
  -f services/api/migrations/003_relational_v2_up.sql \
  -f services/api/migrations/004_cursor_timestamp_precision_up.sql \
  -f services/api/migrations/005_runtime_role_membership_up.sql \
  -f services/api/migrations/006_mvp_collaboration_up.sql
```

Both URLs are the **session pooler** (port 5432), never the transaction pooler on
6543 — the app runs `begin; set local role nestful_runtime` and needs a pinned
connection. Keep both values in the shell environment or a password manager; never
write them into the repo or a command that gets committed.

Delete `.data/private-backups/nestful-rehearsal.dump` after the counts match.

## Verification before cutover

- Table list identical to the baseline (23 tables).
- Per-table counts identical to the table above.
- `select count(*) from nestful.user_sessions where revoked_at is null and expires_at > now();` returns 14.
- `nestful_runtime` exists, is `nologin`, and `postgres` can `set role nestful_runtime`:

  ```sql
  select rolname, rolcanlogin, rolinherit from pg_roles where rolname = 'nestful_runtime';
  begin; set local role nestful_runtime; select count(*) from nestful.users; rollback;
  ```

- Inside that role, an `update`/`delete` on `nestful.audit_events` is denied but
  DML on ordinary tables is allowed.
- A spot-check user's session row matches the old database (`select id, user_id,
  expires_at from nestful.user_sessions order by id limit 5;` on both).

## Cutover

1. Freeze the old database:

   ```sql
   revoke insert, update, delete on all tables in schema nestful from nestful_runtime;
   ```

   Wait a few seconds for in-flight requests, then take the final dump with the
   same `pg_dump` command to `.data/private-backups/nestful-final.dump`.

2. On the new database, drop and restore:

   ```bash
   "$PG17_BIN/psql" "$NEW_DATABASE_URL" -v ON_ERROR_STOP=1 -c 'drop schema nestful cascade;'
   "$PG17_BIN/pg_restore" "$NEW_DATABASE_URL" \
     --no-owner --no-acl --single-transaction \
     .data/private-backups/nestful-final.dump
   ```

   Re-run migrations `003`–`006` to recreate the runtime role grants.

3. In Vercel, update `DATABASE_URL` (Production, Preview, Development) to the new
   session pooler URI **and** change `vercel.json` to `"regions": ["sin1"]` in the
   same deployment. Never ship `sin1` while `DATABASE_URL` still points at Oregon.

4. Confirm the deployment's only function region is `sin1`. If Vercel rejects it
   with `upgrade_required`, `iad1` is still selected on the Hobby plan; uncheck it.

5. Verify: `/health` returns 200 with `storage: relational-v2` and an
   `x-vercel-id` ending in `::sin1`; `/v1/me/bootstrap` without credentials returns
   401 `session_required`; `/v1/me/home` still returns 401 `unauthorized`; an
   existing logged-in device opens Home without re-login.

Keep the old Oregon database read-only for 7–14 days as the rollback source.

## Rollback

```sql
grant select, insert, update, delete on all tables in schema nestful to nestful_runtime;
revoke update, delete on nestful.audit_events from nestful_runtime;
```

Point Vercel `DATABASE_URL` back at the old database, set `vercel.json` back to
`["pdx1"]`, and redeploy. The old database was frozen, so any writes made on the
new database after cutover need a one-way copy before rollback; avoid rollback
after significant new writes unless necessary.
