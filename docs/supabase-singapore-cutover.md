# Supabase Singapore cutover runbook — 2026-10-21

This is the operational companion to the first-open performance plan.

Status: **Production cutover completed on 2026-10-22 (Asia/Shanghai).** Both the
API function and database now run in Singapore. The legacy `/v1/wechat/session`
and `/v1/me/home` routes are unchanged.

## Executed cutover — 2026-10-22

- Created Free project `nestful-sg` (`burmhxyovpyxixgjhxlu`) in organization
  `kkplayit`, region `ap-southeast-1`. With the user's authorization, paused
  `paper-loop` to free a Free-plan slot; it remains paused.
- Used PostgreSQL 17.11 tools and Session poolers on port 5432. Rehearsal and
  final restores both passed migrations 003–006. All 23 tables matched by count
  and sorted full-row content digest, including every session record.
- The live data had grown since the historical baseline below: 10 users,
  10 WeChat identities, 2 families, and 15 sessions, all 15 valid at cutover.
  The remaining table counts matched the historical baseline.
- Verified `nestful_runtime` is NOLOGIN and has no superuser, database-creation,
  role-creation, or RLS-bypass privileges. Role switching, ordinary DML in a
  rolled-back transaction, and denial of audit UPDATE/DELETE all passed.
  A read-only call through the actual Home repository returned the expected
  memberships and dashboard. Supabase security advisors reported no findings.
- Updated Vercel `DATABASE_URL` for Production, Preview, and Development and
  changed `vercel.json` to `["sin1"]`. Built and tested a production candidate
  without assigning production domains, then froze old writes, performed the
  final restore, compared data again, and promoted that candidate:
  `dpl_993YKGpyLhvZSQTccLXf3GbQnf12`.
- Production `https://nestful.kkplayit.online/health` returned 200 with
  `storage: relational-v2` and `x-vercel-id: sfo1::sin1::...` from the checking
  network. The first region is the caller's edge; the second confirms function
  execution in Singapore. Unauthenticated bootstrap returned 401
  `session_required`, and legacy Home returned 401 `unauthorized`.
- Old Oregon project `qrspwgrkxogbpvrdafnn` remains readable with runtime
  INSERT/UPDATE/DELETE revoked. Keep it and the private final dump until
  2026-11-05 for rollback review; do not blindly roll back after new writes.
  Connection files and dumps remain gitignored with private permissions.
- Existing session rows, hashes, identities, and expiry times match exactly.
  An authenticated phone check remains manual: automatic approval rejected
  extracting a live bearer token from private backups. No token was extracted.
- An earlier production candidate (`dpl_45iyvqYM5Cf18ELqQns1AbPWrm9d`) was built
  before the sensitive environment-variable update succeeded. It was not
  promoted; automatic approval rejected canceling it, so it remains unused.

The database/region switch applies to all published clients immediately. The
single-request login/Home bootstrap improvement still requires uploading a new
mini-program release, followed by a real-device check with an existing login.

1. **Step 0 measurement — done.** See `docs/api-performance-2026-10-16.md`.
2. **New Supabase project.** Create it in `ap-southeast-1` (Singapore). The
   connected Supabase MCP supports project creation; confirm the organization
   and Free-plan capacity first. The dashboard is needed to set/save a database
   password and obtain the project's Session pooler connection string.

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
"$PG17_BIN/pg_restore" --dbname="$NEW_DATABASE_URL" \
  --no-owner --no-acl --single-transaction \
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

The first restore above assumes an empty target. Do not use `--clean` on an
empty target: dropping triggers can fail when their schema does not exist, even
with `--if-exists`. Always pass the target to `pg_restore` with `--dbname`;
its positional argument is the dump file.

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

Build and validate a production deployment with `--prod --skip-domain` before
freezing writes. Set its `DATABASE_URL` to the verified Singapore Session pooler
and its `vercel.json` region to `["sin1"]`. The current production deployment
keeps its previous environment until the candidate is explicitly promoted.

1. Freeze the old database. In a transaction, acquire `ACCESS EXCLUSIVE` locks
   on the `nestful` tables before revoking runtime writes; this drains existing
   table transactions before the final snapshot. Commit the privilege change,
   then verify SELECT is still allowed and INSERT/UPDATE/DELETE are denied.

   ```sql
   begin;
   set local lock_timeout = '20s';
   do $$
   declare tables_sql text;
   begin
     select string_agg(format('%I.%I', schemaname, tablename), ', ' order by tablename)
       into tables_sql from pg_tables where schemaname = 'nestful';
     if tables_sql is null then raise exception 'nestful tables missing'; end if;
     execute 'lock table ' || tables_sql || ' in access exclusive mode';
   end $$;
   revoke insert, update, delete on all tables in schema nestful from nestful_runtime;
   commit;
   ```

   Take the final dump with the same `pg_dump` command to
   `.data/private-backups/nestful-final.dump`.

2. On the new database, drop and restore:

   ```bash
   "$PG17_BIN/psql" "$NEW_DATABASE_URL" -v ON_ERROR_STOP=1 -c 'drop schema nestful cascade;'
   "$PG17_BIN/pg_restore" --dbname="$NEW_DATABASE_URL" \
     --no-owner --no-acl --single-transaction \
     .data/private-backups/nestful-final.dump
   ```

   Re-run migrations `003`–`006` to recreate the runtime role grants.

3. Re-verify all table contents and runtime permissions, then promote the
   previously tested production candidate. `DATABASE_URL` (Production, Preview,
   Development) must point to the new session pooler and `vercel.json` must use
   `"regions": ["sin1"]`. Never promote `sin1` with the old Oregon connection.

   Vercel CLI 51.7.0's ordinary `env update` can reject an existing sensitive
   variable with `You cannot change the key of a Sensitive Environment Variable`.
   Use `PATCH /v9/projects/{project}/env/{variable}` with only the `value` field,
   authenticated through `vercel api`. Supply the JSON over stdin from a private
   local file and suppress the response; never place the connection string in
   process arguments or logs.

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
