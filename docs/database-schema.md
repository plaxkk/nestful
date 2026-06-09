# Database Schema and Privacy Permissions

This document defines the target relational schema and the current production persistence model.

## Current Persistence

The API supports two storage modes:

1. Local development file storage.
2. Production Postgres/Supabase storage.

Local development still persists data into a local JSON file:

```text
.data/nestful.json
```

The file is ignored by git. This keeps local acceptance data across API restarts while avoiding database setup during MVP validation.

Set a custom path with:

```bash
DATA_FILE=/path/to/nestful.json npm run dev:api
```

Production uses Postgres when `NESTFUL_STORAGE=postgres` and `DATABASE_URL` are configured. The API creates this backing table automatically on first access:

```sql
create table if not exists nestful_app_state (
  id text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);
```

This replaces Vercel local file storage with cloud database persistence immediately while preserving the current API contract. The JSONB state stores the current business entities:

- users
- userSessions
- families
- members
- invitations
- reminders
- activities
- ledgerEntries
- ledgerGoalFunds
- digitalSpaceItems
- auditEvents

The normalized tables below remain the target schema for the next hardening pass, after the product validates core family workflows.

## Normalized Migration Plan

The API still reads and writes `nestful_app_state.data` while product flows are changing quickly. The first normalized migration is checked in, but it is designed as an idempotent projection from JSONB into relational tables:

- `services/api/migrations/001_normalized_postgres_up.sql` creates normalized tables, backfills from `nestful_app_state`, and adds lookup indexes.
- `services/api/migrations/001_normalized_postgres_verify.sql` compares JSONB entity counts with normalized table counts and checks for basic orphaned rows.
- `services/api/migrations/001_normalized_postgres_down.sql` drops only normalized tables and leaves `nestful_app_state` untouched for rollback.

Run the migration against a database backup or staging clone first:

```bash
psql "$DATABASE_URL" -f services/api/migrations/001_normalized_postgres_up.sql
psql "$DATABASE_URL" -f services/api/migrations/001_normalized_postgres_verify.sql
```

Rollback while JSONB remains the source of truth:

```bash
psql "$DATABASE_URL" -f services/api/migrations/001_normalized_postgres_down.sql
```

Do not switch the API runtime to normalized-table reads until the verify query returns zero count deltas for all entities that exist in JSONB and product writes have a dual-write or cutover plan.

## Vercel Environment Variables

Set these on the Vercel Nestful project for Production:

```bash
NESTFUL_STORAGE=postgres
DATABASE_URL=<Supabase/Postgres pooled connection string>
PGSSL=require
```

Remove the old production `DATA_FILE` variable after `DATABASE_URL` is configured, so production does not imply local filesystem persistence.

## Target Tables

### users

```sql
create table users (
  id text primary key,
  nickname text not null,
  avatar_url text,
  created_at timestamptz not null
);
```

### wechat_identities

```sql
create table wechat_identities (
  id text primary key,
  user_id text not null references users(id),
  app_id text not null,
  openid text not null,
  unionid text,
  session_key_encrypted text,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  unique (app_id, openid)
);
```

### user_sessions

```sql
create table user_sessions (
  id text primary key,
  user_id text not null references users(id),
  token_hash text not null unique,
  expires_at timestamptz not null,
  created_at timestamptz not null
);
```

### families

```sql
create table families (
  id text primary key,
  name text not null,
  owner_user_id text not null references users(id),
  created_at timestamptz not null
);
```

### family_members

```sql
create table family_members (
  id text primary key,
  family_id text not null references families(id),
  user_id text references users(id),
  wechat_open_id text,
  display_name text not null,
  role text not null check (role in ('admin', 'member', 'elder', 'child', 'guest')),
  birthday date,
  birthday_calendar text check (birthday_calendar in ('solar', 'lunar')),
  location text,
  emergency_contact text,
  joined_at timestamptz not null
);
```

### family_invitations

```sql
create table family_invitations (
  id text primary key,
  family_id text not null references families(id),
  code text not null unique,
  role text not null check (role in ('admin', 'member', 'elder', 'child', 'guest')),
  created_by_member_id text not null references family_members(id),
  created_at timestamptz not null,
  expires_at timestamptz,
  canceled_at timestamptz,
  accepted_at timestamptz,
  accepted_by_member_id text references family_members(id)
);
```

### reminder_plans

```sql
create table reminder_plans (
  id text primary key,
  family_id text not null references families(id),
  type text not null check (type in ('birthday', 'medicine', 'exercise', 'anniversary', 'bill', 'activity')),
  title text not null,
  assignee_member_id text references family_members(id),
  target_scope text check (target_scope in ('member', 'family')),
  target_member_ids text[] not null default '{}',
  frequency text not null check (frequency in ('once', 'daily_once', 'daily_twice', 'daily_three_times', 'weekly', 'monthly', 'yearly')),
  schedule jsonb not null default '{}'::jsonb,
  created_by_member_id text not null references family_members(id),
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  next_due_at timestamptz,
  last_completed_at timestamptz,
  completed_count integer not null default 0
);
```

### reminders

```sql
create table reminders (
  id text primary key,
  plan_id text references reminder_plans(id),
  family_id text not null references families(id),
  type text not null check (type in ('birthday', 'medicine', 'exercise', 'anniversary', 'bill', 'activity')),
  title text not null,
  due_at timestamptz not null,
  occurrence_number integer not null default 1,
  occurrence_status text not null default 'pending' check (occurrence_status in ('pending', 'completed', 'skipped')),
  assignee_member_id text references family_members(id),
  target_scope text check (target_scope in ('member', 'family')),
  target_member_ids text[] not null default '{}',
  frequency text check (frequency in ('once', 'daily_once', 'daily_twice', 'daily_three_times', 'weekly', 'monthly', 'yearly')),
  schedule jsonb not null default '{}'::jsonb,
  created_by_member_id text not null references family_members(id),
  enabled boolean not null default true,
  notification jsonb,
  completed_by_member_id text references family_members(id),
  completed_at timestamptz
);
```

### activities

```sql
create table activities (
  id text primary key,
  family_id text not null references families(id),
  title text not null,
  status text not null check (status in ('draft', 'scheduled', 'completed', 'cancelled')),
  starts_at timestamptz not null,
  location text,
  description text,
  budget_cents integer,
  created_by_member_id text not null references family_members(id),
  memory_item_id text,
  completed_at timestamptz,
  cancelled_at timestamptz
);
```

### activity_participants

```sql
create table activity_participants (
  activity_id text not null references activities(id),
  member_id text not null references family_members(id),
  rsvp text not null check (rsvp in ('accepted', 'declined', 'tentative', 'pending')),
  joined_at timestamptz not null,
  primary key (activity_id, member_id)
);
```

### activity_tasks

```sql
create table activity_tasks (
  id text primary key,
  activity_id text not null references activities(id),
  family_id text not null references families(id),
  title text not null,
  assignee_member_id text references family_members(id),
  status text not null check (status in ('open', 'done')),
  created_by_member_id text not null references family_members(id),
  completed_at timestamptz
);
```

### audit_events

```sql
create table audit_events (
  id text primary key,
  family_id text not null references families(id),
  actor_member_id text references family_members(id),
  action text not null,
  resource_type text not null,
  resource_id text not null,
  created_at timestamptz not null
);
```

### ledger_entries

```sql
create table ledger_entries (
  id text primary key,
  family_id text not null references families(id),
  type text not null check (type in ('expense', 'income')),
  category text not null check (category in ('daily', 'education', 'health', 'travel', 'housing', 'subscription', 'other')),
  title text not null,
  amount_cents integer not null check (amount_cents > 0),
  paid_by_member_id text not null references family_members(id),
  split_member_ids text[] not null,
  occurred_at timestamptz not null,
  recurrence text check (recurrence in ('monthly', 'yearly')),
  recurring_reminder_id text references reminders(id)
);
```

### ledger_goal_funds

```sql
create table ledger_goal_funds (
  id text primary key,
  family_id text not null references families(id),
  title text not null,
  target_amount_cents integer not null check (target_amount_cents > 0),
  current_amount_cents integer not null default 0 check (current_amount_cents >= 0),
  created_by_member_id text not null references family_members(id),
  due_at timestamptz,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
```

### digital_space_items

```sql
create table digital_space_items (
  id text primary key,
  family_id text not null references families(id),
  kind text not null check (kind in ('document', 'account', 'memory')),
  title text not null,
  summary text,
  url text,
  occurred_at timestamptz,
  created_by_member_id text not null references family_members(id),
  activity_id text references activities(id),
  place text,
  tagged_member_ids text[] not null,
  media_items jsonb not null default '[]'::jsonb,
  security_warning text,
  created_at timestamptz not null
);
```

## Target Indexes

The normalized migration creates indexes for the access patterns used by the current API and upcoming table-backed reads:

- `family_id` on family-scoped tables.
- `user_id` and member actor references for auth and profile lookups.
- `member_id`, `assignee_member_id`, `created_by_member_id`, and payer/actor references.
- `due_at`, `next_due_at`, `starts_at`, `occurred_at`, `expires_at`, and `created_at` for reminders, activities, ledger summaries, invitations, audit history, and timeline ordering.

## Privacy Rules

1. Every record with family data is scoped by `family_id`.
2. A member can only act inside their own family.
3. Only `admin` can create invitations and directly add members.
4. Public member lists redact sensitive fields such as `emergencyContact`.
5. Health, documents, and account registry data must use explicit visibility scopes when implemented. Finance and digital-space notes are family-visible in the MVP and need finer scopes before storing sensitive records.
6. Sensitive mutations should produce audit events.
7. The client must never be trusted to provide arbitrary `familyId` / `memberId` without server validation.

## Current Code Enforcement

Implemented in `services/api/src/privacy.ts`:

- `canManageFamily`
- `canCreateInvitation`
- `canAddMemberDirectly`
- `redactMemberForList`

Implemented in `services/api/src/store.ts`:

- local file persistence
- app session token creation with hashed token storage
- audit event creation for family, member, invitation, reminder, ledger entry, digital-space item, activity creation, reminder completion, invitation acceptance, member updates/removal, and invitation cancellation
- duplicate membership check on invitation acceptance

Implemented in `services/api/src/routes.ts`:

- invitation creator must be an admin member of the same family
- invitation listing and cancellation require an admin member of the same family
- direct member creation requires an admin actor
- member detail redacts sensitive fields unless the viewer is an admin or the member themself
- member profile edits require the member themself or an admin; role changes and removals require an admin
- the final admin in a family cannot be downgraded or removed
- member lists return redacted member data
- reminder creator/completer and optional assignee must be members of the same family
- ledger entry payer must be a member of the same family
- digital-space item creator must be a member of the same family
- activity creator must be a member of the same family
