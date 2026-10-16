-- Nestful v2. Independent business records; no import from legacy JSONB.
-- Run as the migration owner. Runtime receives DML only in this private schema.
begin;
create schema if not exists nestful;
revoke all on schema nestful from public;
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'nestful_runtime') then
    create role nestful_runtime nologin nosuperuser nocreatedb nocreaterole nobypassrls;
  end if;
end $$;

create table if not exists nestful.users (
  id uuid primary key default gen_random_uuid(),
  nickname text not null default '微信用户', avatar_url text,
  status text not null default 'active' check (status in ('active','disabled')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists nestful.wechat_identities (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references nestful.users(id),
  app_id text not null, openid text not null, unionid text,
  created_at timestamptz not null default now(), unique(app_id,openid)
);
create index if not exists wechat_identity_user_idx on nestful.wechat_identities(user_id);
create table if not exists nestful.user_sessions (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references nestful.users(id),
  token_hash text not null unique, expires_at timestamptz not null, revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists sessions_user_idx on nestful.user_sessions(user_id);
create index if not exists sessions_expiry_idx on nestful.user_sessions(expires_at);
create table if not exists nestful.families (
  id uuid primary key default gen_random_uuid(), name text not null check(length(name) between 1 and 100),
  timezone text not null default 'Asia/Shanghai', created_by_user_id uuid not null references nestful.users(id),
  version integer not null default 1 check(version>0),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), archived_at timestamptz
);
create index if not exists families_creator_idx on nestful.families(created_by_user_id);
create table if not exists nestful.family_members (
  id uuid primary key default gen_random_uuid(), family_id uuid not null references nestful.families(id),
  user_id uuid not null references nestful.users(id), display_name text not null,
  role text not null default 'member' check(role in ('admin','member')),
  identity_tag text check(identity_tag in ('elder','child','guest')),
  status text not null default 'active' check(status in ('active','inactive')),
  birthday_year integer check(birthday_year between 1900 and 2200),
  birthday_month integer check(birthday_month between 1 and 12),
  birthday_day integer check(birthday_day between 1 and 31),
  birthday_calendar text not null default 'solar' check(birthday_calendar in ('solar','lunar')),
  birthday_leap_month boolean not null default false, location text,
  version integer not null default 1 check(version>0), joined_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(family_id,user_id), unique(family_id,id),
  check((birthday_month is null)=(birthday_day is null)),
  check(not birthday_leap_month or birthday_calendar='lunar')
);
create index if not exists member_user_idx on nestful.family_members(user_id,status);
create index if not exists member_active_family_idx on nestful.family_members(family_id,status,role);
create table if not exists nestful.member_private_profiles (
  family_id uuid not null, member_id uuid primary key, emergency_contact text, notes text,
  updated_at timestamptz not null default now(),
  foreign key(family_id,member_id) references nestful.family_members(family_id,id)
);
create index if not exists member_private_family_idx on nestful.member_private_profiles(family_id,member_id);
create table if not exists nestful.family_invitations (
  id uuid primary key default gen_random_uuid(), family_id uuid not null references nestful.families(id),
  code_hash text not null unique, created_by_member_id uuid not null,
  created_at timestamptz not null default now(), expires_at timestamptz not null,
  canceled_at timestamptz, accepted_at timestamptz, accepted_by_member_id uuid,
  foreign key(family_id,created_by_member_id) references nestful.family_members(family_id,id),
  foreign key(family_id,accepted_by_member_id) references nestful.family_members(family_id,id),
  check(expires_at>created_at), check((accepted_at is null)=(accepted_by_member_id is null)),
  check(accepted_at is null or canceled_at is null)
);
create index if not exists invitations_family_idx on nestful.family_invitations(family_id,created_at desc,id);
create index if not exists invitations_creator_idx on nestful.family_invitations(family_id,created_by_member_id);
create index if not exists invitations_acceptor_idx on nestful.family_invitations(family_id,accepted_by_member_id);

create table if not exists nestful.reminder_plans (
  id uuid primary key default gen_random_uuid(), family_id uuid not null references nestful.families(id),
  type text not null check(type in ('birthday','anniversary','medicine','exercise','bill','activity')),
  title text not null, timezone text not null default 'Asia/Shanghai', starts_at timestamptz not null,
  enabled boolean not null default true, target_scope text not null check(target_scope in ('member','family')),
  assignee_member_id uuid, created_by_member_id uuid not null,
  frequency text not null check(frequency in ('once','daily_once','daily_twice','daily_three_times','weekly','monthly','yearly')),
  schedule_version integer not null default 1 check(schedule_version=1),
  schedule jsonb not null default '{}' check(jsonb_typeof(schedule)='object'),
  revision integer not null default 1 check(revision>0), version integer not null default 1 check(version>0),
  next_generation_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(family_id,id),
  foreign key(family_id,assignee_member_id) references nestful.family_members(family_id,id),
  foreign key(family_id,created_by_member_id) references nestful.family_members(family_id,id)
);
create index if not exists plans_due_idx on nestful.reminder_plans(next_generation_at) where enabled;
create index if not exists plans_family_idx on nestful.reminder_plans(family_id,created_at desc,id);
create index if not exists plans_assignee_idx on nestful.reminder_plans(family_id,assignee_member_id);
create index if not exists plans_creator_idx on nestful.reminder_plans(family_id,created_by_member_id);
create table if not exists nestful.reminder_plan_members (
  family_id uuid not null, plan_id uuid not null, member_id uuid not null, primary key(plan_id,member_id),
  foreign key(family_id,plan_id) references nestful.reminder_plans(family_id,id),
  foreign key(family_id,member_id) references nestful.family_members(family_id,id)
);
create index if not exists plan_members_family_plan_idx on nestful.reminder_plan_members(family_id,plan_id);
create index if not exists plan_members_member_idx on nestful.reminder_plan_members(family_id,member_id);
create table if not exists nestful.reminder_occurrences (
  id uuid primary key default gen_random_uuid(), family_id uuid not null, plan_id uuid not null,
  plan_revision integer not null, scheduled_at timestamptz not null, title text not null, type text not null,
  schedule_snapshot jsonb not null check(jsonb_typeof(schedule_snapshot)='object'),
  canceled_at timestamptz, created_at timestamptz not null default now(),
  unique(plan_id,plan_revision,scheduled_at), unique(family_id,id),
  foreign key(family_id,plan_id) references nestful.reminder_plans(family_id,id)
);
create index if not exists occurrences_family_due_idx on nestful.reminder_occurrences(family_id,scheduled_at desc,id);
create index if not exists occurrences_family_plan_idx on nestful.reminder_occurrences(family_id,plan_id);
create table if not exists nestful.reminder_occurrence_members (
  family_id uuid not null, occurrence_id uuid not null, member_id uuid not null,
  status text not null default 'pending' check(status in ('pending','completed','skipped')),
  completed_at timestamptz, primary key(occurrence_id,member_id),
  foreign key(family_id,occurrence_id) references nestful.reminder_occurrences(family_id,id),
  foreign key(family_id,member_id) references nestful.family_members(family_id,id),
  check((status='completed')=(completed_at is not null))
);
create index if not exists occurrence_members_family_idx on nestful.reminder_occurrence_members(family_id,occurrence_id);
create index if not exists occurrence_members_member_idx on nestful.reminder_occurrence_members(family_id,member_id);
create table if not exists nestful.notification_deliveries (
  id uuid primary key default gen_random_uuid(), family_id uuid not null, occurrence_id uuid not null, member_id uuid not null,
  channel text not null default 'wechat' check(channel='wechat'), template_id text not null,
  scheduled_at timestamptz not null, expires_at timestamptz not null,
  subscription_status text not null check(subscription_status in ('accept','reject','ban','filter','unavailable')),
  status text not null default 'pending' check(status in ('pending','processing','sent','failed','skipped','expired','unknown','canceled')),
  attempt_count integer not null default 0 check(attempt_count between 0 and 3),
  requested_at timestamptz not null default now(), next_attempt_at timestamptz not null,
  lease_token uuid, lease_expires_at timestamptz, send_started_at timestamptz,
  accepted_at timestamptz, last_error text, updated_at timestamptz not null default now(),
  unique(occurrence_id,member_id,template_id,scheduled_at),
  foreign key(occurrence_id,member_id) references nestful.reminder_occurrence_members(occurrence_id,member_id),
  foreign key(family_id,occurrence_id) references nestful.reminder_occurrences(family_id,id),
  foreign key(family_id,member_id) references nestful.family_members(family_id,id),
  check(expires_at>scheduled_at)
);
create index if not exists deliveries_due_idx on nestful.notification_deliveries(next_attempt_at) where status='pending';
create index if not exists deliveries_lease_idx on nestful.notification_deliveries(lease_expires_at) where status='processing';
create index if not exists deliveries_member_idx on nestful.notification_deliveries(family_id,member_id);
create index if not exists deliveries_occurrence_idx on nestful.notification_deliveries(family_id,occurrence_id);

-- Activities have no dependency on the digital-space module.
create table if not exists nestful.activities (
  id uuid primary key default gen_random_uuid(), family_id uuid not null references nestful.families(id),
  title text not null, starts_at timestamptz not null, location text, description text,
  budget_cents bigint check(budget_cents between 0 and 9007199254740991),
  status text not null default 'scheduled' check(status in ('draft','scheduled','completed','cancelled')),
  created_by_member_id uuid not null, version integer not null default 1 check(version>0),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  completed_at timestamptz, cancelled_at timestamptz, archived_at timestamptz, unique(family_id,id),
  foreign key(family_id,created_by_member_id) references nestful.family_members(family_id,id)
);
create index if not exists activities_family_time_idx on nestful.activities(family_id,starts_at desc,id);
create index if not exists activities_creator_idx on nestful.activities(family_id,created_by_member_id);
create table if not exists nestful.activity_participants (
  family_id uuid not null, activity_id uuid not null, member_id uuid not null,
  rsvp text not null default 'pending' check(rsvp in ('accepted','declined','tentative','pending')),
  joined_at timestamptz not null default now(), primary key(activity_id,member_id),
  foreign key(family_id,activity_id) references nestful.activities(family_id,id),
  foreign key(family_id,member_id) references nestful.family_members(family_id,id)
);
create index if not exists participants_family_activity_idx on nestful.activity_participants(family_id,activity_id);
create index if not exists participants_member_idx on nestful.activity_participants(family_id,member_id);
create table if not exists nestful.activity_tasks (
  id uuid primary key default gen_random_uuid(), family_id uuid not null, activity_id uuid not null,
  title text not null, assignee_member_id uuid, created_by_member_id uuid not null,
  status text not null default 'open' check(status in ('open','done')),
  version integer not null default 1 check(version>0), completed_at timestamptz,
  created_at timestamptz not null default now(),
  foreign key(family_id,activity_id) references nestful.activities(family_id,id),
  foreign key(family_id,assignee_member_id) references nestful.family_members(family_id,id),
  foreign key(family_id,created_by_member_id) references nestful.family_members(family_id,id)
);
create index if not exists tasks_activity_idx on nestful.activity_tasks(family_id,activity_id);
create index if not exists tasks_assignee_idx on nestful.activity_tasks(family_id,assignee_member_id);
create index if not exists tasks_creator_idx on nestful.activity_tasks(family_id,created_by_member_id);

create table if not exists nestful.ledger_entries (
  id uuid primary key default gen_random_uuid(), family_id uuid not null references nestful.families(id),
  type text not null check(type in ('expense','income')),
  category text not null check(category in ('daily','education','health','travel','housing','subscription','other')),
  title text not null, amount_cents bigint not null check(amount_cents between 1 and 9007199254740991),
  paid_by_member_id uuid not null, created_by_member_id uuid not null, occurred_at timestamptz not null,
  recurrence text check(recurrence in ('monthly','yearly')), recurring_plan_id uuid,
  version integer not null default 1 check(version>0), created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(), voided_at timestamptz, unique(family_id,id),
  foreign key(family_id,paid_by_member_id) references nestful.family_members(family_id,id),
  foreign key(family_id,created_by_member_id) references nestful.family_members(family_id,id),
  foreign key(family_id,recurring_plan_id) references nestful.reminder_plans(family_id,id)
);
create index if not exists ledger_family_time_idx on nestful.ledger_entries(family_id,occurred_at desc,id);
create index if not exists ledger_payer_idx on nestful.ledger_entries(family_id,paid_by_member_id);
create index if not exists ledger_creator_idx on nestful.ledger_entries(family_id,created_by_member_id);
create index if not exists ledger_plan_idx on nestful.ledger_entries(family_id,recurring_plan_id);
create table if not exists nestful.ledger_entry_splits (
  family_id uuid not null, entry_id uuid not null, member_id uuid not null,
  amount_cents bigint not null check(amount_cents between 0 and 9007199254740991), primary key(entry_id,member_id),
  foreign key(family_id,entry_id) references nestful.ledger_entries(family_id,id),
  foreign key(family_id,member_id) references nestful.family_members(family_id,id)
);
create index if not exists splits_family_entry_idx on nestful.ledger_entry_splits(family_id,entry_id);
create index if not exists splits_member_idx on nestful.ledger_entry_splits(family_id,member_id);
create table if not exists nestful.ledger_goal_funds (
  id uuid primary key default gen_random_uuid(), family_id uuid not null references nestful.families(id),
  title text not null, target_amount_cents bigint not null check(target_amount_cents between 1 and 9007199254740991),
  current_amount_cents bigint not null default 0 check(current_amount_cents between 0 and 9007199254740991),
  created_by_member_id uuid not null, due_at timestamptz, completed_at timestamptz, archived_at timestamptz,
  version integer not null default 1 check(version>0), created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key(family_id,created_by_member_id) references nestful.family_members(family_id,id)
);
create index if not exists goals_family_idx on nestful.ledger_goal_funds(family_id,created_at desc,id);
create index if not exists goals_creator_idx on nestful.ledger_goal_funds(family_id,created_by_member_id);

-- Digital space is independent; source activity is an optional one-way link.
create table if not exists nestful.space_items (
  id uuid primary key default gen_random_uuid(), family_id uuid not null references nestful.families(id),
  kind text not null check(kind in ('document','account','memory')), title text not null, summary text, url text,
  occurred_at timestamptz, place text, source_activity_id uuid, created_by_member_id uuid not null,
  version integer not null default 1 check(version>0), created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(), archived_at timestamptz, unique(family_id,id),
  foreign key(family_id,source_activity_id) references nestful.activities(family_id,id),
  foreign key(family_id,created_by_member_id) references nestful.family_members(family_id,id),
  check(source_activity_id is null or kind='memory')
);
create unique index if not exists one_memory_per_activity_idx on nestful.space_items(source_activity_id) where source_activity_id is not null;
create index if not exists space_family_time_idx on nestful.space_items(family_id,created_at desc,id);
create index if not exists space_creator_idx on nestful.space_items(family_id,created_by_member_id);
create index if not exists space_source_idx on nestful.space_items(family_id,source_activity_id);
create table if not exists nestful.space_item_members (
  family_id uuid not null, item_id uuid not null, member_id uuid not null, primary key(item_id,member_id),
  foreign key(family_id,item_id) references nestful.space_items(family_id,id),
  foreign key(family_id,member_id) references nestful.family_members(family_id,id)
);
create index if not exists space_members_family_item_idx on nestful.space_item_members(family_id,item_id);
create index if not exists space_members_member_idx on nestful.space_item_members(family_id,member_id);
create table if not exists nestful.space_item_media (
  id uuid primary key default gen_random_uuid(), family_id uuid not null, item_id uuid not null,
  kind text not null check(kind in ('image','video','file','link')), label text, url text, storage_path text,
  mime_type text, size_bytes bigint check(size_bytes between 1 and 9007199254740991),
  position integer not null default 0 check(position>=0), created_at timestamptz not null default now(),
  foreign key(family_id,item_id) references nestful.space_items(family_id,id)
);
create index if not exists media_item_idx on nestful.space_item_media(family_id,item_id,position);
create table if not exists nestful.audit_events (
  id uuid primary key default gen_random_uuid(), family_id uuid not null references nestful.families(id),
  actor_user_id uuid references nestful.users(id), actor_member_id uuid,
  action text not null, resource_type text not null, resource_id uuid not null,
  changes jsonb not null default '{}' check(jsonb_typeof(changes)='object'),
  created_at timestamptz not null default now(),
  foreign key(family_id,actor_member_id) references nestful.family_members(family_id,id)
);
create index if not exists audit_family_time_idx on nestful.audit_events(family_id,created_at desc,id);
create index if not exists audit_user_idx on nestful.audit_events(actor_user_id);
create index if not exists audit_member_idx on nestful.audit_events(family_id,actor_member_id);

-- Deferred checks allow parent/children to be changed in one transaction.
create or replace function nestful.check_ledger_split_total() returns trigger
language plpgsql security invoker set search_path=pg_catalog,nestful as $$
declare entry_key uuid; entry_row nestful.ledger_entries%rowtype; total numeric;
begin
  if tg_table_name='ledger_entries' then entry_key:=coalesce(new.id,old.id);
  else entry_key:=coalesce(new.entry_id,old.entry_id); end if;
  select * into entry_row from nestful.ledger_entries where id=entry_key;
  if not found then return null; end if;
  select coalesce(sum(amount_cents),0) into total from nestful.ledger_entry_splits where entry_id=entry_key;
  if (entry_row.type='expense' and total<>entry_row.amount_cents)
     or (entry_row.type='income' and exists(select 1 from nestful.ledger_entry_splits where entry_id=entry_key)) then
    raise exception 'ledger_split_total_invalid' using errcode='23514';
  end if;
  return null;
end $$;
revoke all on function nestful.check_ledger_split_total() from public;
grant execute on function nestful.check_ledger_split_total() to nestful_runtime;
drop trigger if exists ledger_total_check on nestful.ledger_entries;
create constraint trigger ledger_total_check after insert or update on nestful.ledger_entries
  deferrable initially deferred for each row execute function nestful.check_ledger_split_total();
drop trigger if exists splits_total_check on nestful.ledger_entry_splits;
create constraint trigger splits_total_check after insert or update or delete on nestful.ledger_entry_splits
  deferrable initially deferred for each row execute function nestful.check_ledger_split_total();

create or replace function nestful.check_family_admin() returns trigger
language plpgsql security invoker set search_path=pg_catalog,nestful as $$
declare family_key uuid;
begin
  if tg_table_name='families' then family_key:=coalesce(new.id,old.id);
  else family_key:=coalesce(new.family_id,old.family_id); end if;
  perform 1 from nestful.families where id=family_key and archived_at is null for update;
  if found and not exists(select 1 from nestful.family_members where family_id=family_key and status='active' and role='admin') then
    raise exception 'last_admin_required' using errcode='23514';
  end if;
  return null;
end $$;
revoke all on function nestful.check_family_admin() from public;
grant execute on function nestful.check_family_admin() to nestful_runtime;
drop trigger if exists family_admin_check on nestful.families;
create constraint trigger family_admin_check after insert or update on nestful.families
  deferrable initially deferred for each row execute function nestful.check_family_admin();
drop trigger if exists member_admin_check on nestful.family_members;
create constraint trigger member_admin_check after insert or update or delete on nestful.family_members
  deferrable initially deferred for each row execute function nestful.check_family_admin();

grant usage on schema nestful to nestful_runtime;
grant select,insert,update,delete on all tables in schema nestful to nestful_runtime;
revoke update,delete on nestful.audit_events from nestful_runtime;
-- Not exposed via PostgREST. No anon/authenticated grants, functions, or Auth JWT assumptions.
commit;
