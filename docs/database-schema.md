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

- families
- members
- invitations
- reminders
- activities
- ledgerEntries
- digitalSpaceItems
- auditEvents

The normalized tables below remain the target schema for the next hardening pass, after the product validates core family workflows.

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
  accepted_at timestamptz,
  accepted_by_member_id text references family_members(id)
);
```

### reminders

```sql
create table reminders (
  id text primary key,
  family_id text not null references families(id),
  type text not null check (type in ('birthday', 'medicine', 'exercise', 'anniversary', 'bill', 'activity')),
  title text not null,
  due_at timestamptz not null,
  assignee_member_id text references family_members(id),
  created_by_member_id text not null references family_members(id),
  enabled boolean not null default true,
  completed_at timestamptz
);
```

### activities

```sql
create table activities (
  id text primary key,
  family_id text not null references families(id),
  title text not null,
  status text not null,
  starts_at timestamptz not null,
  location text,
  description text,
  budget_cents integer,
  created_by_member_id text not null references family_members(id)
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
  occurred_at timestamptz not null
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
  tagged_member_ids text[] not null,
  created_at timestamptz not null
);
```

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
- audit event creation for family, member, invitation, reminder, ledger entry, digital-space item, activity creation, reminder completion, and invitation acceptance
- duplicate membership check on invitation acceptance

Implemented in `services/api/src/routes.ts`:

- invitation creator must be an admin member of the same family
- direct member creation requires an admin actor
- member lists return redacted member data
- reminder creator/completer and optional assignee must be members of the same family
- ledger entry payer must be a member of the same family
- digital-space item creator must be a member of the same family
- activity creator must be a member of the same family
