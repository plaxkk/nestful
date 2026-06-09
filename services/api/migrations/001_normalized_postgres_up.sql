begin;

create table if not exists nestful_schema_migrations (
  version text primary key,
  applied_at timestamptz not null default now()
);

create table if not exists users (
  id text primary key,
  nickname text not null,
  avatar_url text,
  created_at timestamptz not null
);

create table if not exists wechat_identities (
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

create table if not exists user_sessions (
  id text primary key,
  user_id text not null references users(id),
  token_hash text not null unique,
  expires_at timestamptz not null,
  created_at timestamptz not null
);

create table if not exists families (
  id text primary key,
  name text not null,
  owner_user_id text not null references users(id),
  created_at timestamptz not null
);

create table if not exists family_members (
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

create table if not exists family_invitations (
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

create table if not exists reminder_plans (
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

create table if not exists reminders (
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

create table if not exists activities (
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

create table if not exists activity_participants (
  activity_id text not null references activities(id),
  member_id text not null references family_members(id),
  rsvp text not null check (rsvp in ('accepted', 'declined', 'tentative', 'pending')),
  joined_at timestamptz not null,
  primary key (activity_id, member_id)
);

create table if not exists activity_tasks (
  id text primary key,
  activity_id text not null references activities(id),
  family_id text not null references families(id),
  title text not null,
  assignee_member_id text references family_members(id),
  status text not null check (status in ('open', 'done')),
  created_by_member_id text not null references family_members(id),
  completed_at timestamptz
);

create table if not exists audit_events (
  id text primary key,
  family_id text not null references families(id),
  actor_member_id text references family_members(id),
  action text not null,
  resource_type text not null,
  resource_id text not null,
  created_at timestamptz not null
);

create table if not exists ledger_entries (
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

create table if not exists ledger_goal_funds (
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

create table if not exists digital_space_items (
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

with app_state as (
  select data from nestful_app_state where id = 'default'
)
insert into users (id, nickname, avatar_url, created_at)
select
  item->>'id',
  coalesce(nullif(item->>'nickname', ''), '微信用户'),
  nullif(item->>'avatarUrl', ''),
  coalesce(nullif(item->>'createdAt', '')::timestamptz, now())
from app_state, jsonb_array_elements(coalesce(data->'users', '[]'::jsonb)) as item
where item ? 'id'
on conflict (id) do update set
  nickname = excluded.nickname,
  avatar_url = excluded.avatar_url;

with app_state as (
  select data from nestful_app_state where id = 'default'
)
insert into wechat_identities (id, user_id, app_id, openid, created_at, updated_at)
select
  concat('mini-program:', item->>'wechatOpenId'),
  item->>'id',
  'mini-program',
  item->>'wechatOpenId',
  coalesce(nullif(item->>'createdAt', '')::timestamptz, now()),
  now()
from app_state, jsonb_array_elements(coalesce(data->'users', '[]'::jsonb)) as item
where item ? 'id' and nullif(item->>'wechatOpenId', '') is not null
on conflict (app_id, openid) do update set
  user_id = excluded.user_id,
  updated_at = now();

with app_state as (
  select data from nestful_app_state where id = 'default'
)
insert into user_sessions (id, user_id, token_hash, expires_at, created_at)
select
  item->>'id',
  item->>'userId',
  item->>'tokenHash',
  nullif(item->>'expiresAt', '')::timestamptz,
  coalesce(nullif(item->>'createdAt', '')::timestamptz, now())
from app_state, jsonb_array_elements(coalesce(data->'userSessions', '[]'::jsonb)) as item
where item ? 'id' and item ? 'userId' and item ? 'tokenHash' and item ? 'expiresAt'
on conflict (id) do update set
  expires_at = excluded.expires_at;

with app_state as (
  select data from nestful_app_state where id = 'default'
)
insert into families (id, name, owner_user_id, created_at)
select
  item->>'id',
  item->>'name',
  item->>'ownerUserId',
  coalesce(nullif(item->>'createdAt', '')::timestamptz, now())
from app_state, jsonb_array_elements(coalesce(data->'families', '[]'::jsonb)) as item
where item ? 'id' and item ? 'name' and item ? 'ownerUserId'
on conflict (id) do update set
  name = excluded.name,
  owner_user_id = excluded.owner_user_id;

with app_state as (
  select data from nestful_app_state where id = 'default'
)
insert into family_members (
  id,
  family_id,
  user_id,
  wechat_open_id,
  display_name,
  role,
  birthday,
  birthday_calendar,
  location,
  emergency_contact,
  joined_at
)
select
  item->>'id',
  item->>'familyId',
  nullif(item->>'userId', ''),
  nullif(item->>'wechatOpenId', ''),
  item->>'displayName',
  coalesce(nullif(item->>'role', ''), 'member'),
  nullif(item->>'birthday', '')::date,
  nullif(item->>'birthdayCalendar', ''),
  nullif(item->>'location', ''),
  nullif(item->>'emergencyContact', ''),
  coalesce(nullif(item->>'joinedAt', '')::timestamptz, now())
from app_state, jsonb_array_elements(coalesce(data->'members', '[]'::jsonb)) as item
where item ? 'id' and item ? 'familyId' and item ? 'displayName'
on conflict (id) do update set
  display_name = excluded.display_name,
  role = excluded.role,
  birthday = excluded.birthday,
  birthday_calendar = excluded.birthday_calendar,
  location = excluded.location,
  emergency_contact = excluded.emergency_contact,
  wechat_open_id = excluded.wechat_open_id;

with app_state as (
  select data from nestful_app_state where id = 'default'
)
insert into family_invitations (
  id,
  family_id,
  code,
  role,
  created_by_member_id,
  created_at,
  expires_at,
  canceled_at,
  accepted_at,
  accepted_by_member_id
)
select
  item->>'id',
  item->>'familyId',
  item->>'code',
  coalesce(nullif(item->>'role', ''), 'member'),
  item->>'createdByMemberId',
  coalesce(nullif(item->>'createdAt', '')::timestamptz, now()),
  nullif(item->>'expiresAt', '')::timestamptz,
  nullif(item->>'canceledAt', '')::timestamptz,
  nullif(item->>'acceptedAt', '')::timestamptz,
  nullif(item->>'acceptedByMemberId', '')
from app_state, jsonb_array_elements(coalesce(data->'invitations', '[]'::jsonb)) as item
where item ? 'id' and item ? 'familyId' and item ? 'code' and item ? 'createdByMemberId'
on conflict (id) do update set
  expires_at = excluded.expires_at,
  canceled_at = excluded.canceled_at,
  accepted_at = excluded.accepted_at,
  accepted_by_member_id = excluded.accepted_by_member_id;

with app_state as (
  select data from nestful_app_state where id = 'default'
)
insert into reminder_plans (
  id,
  family_id,
  type,
  title,
  assignee_member_id,
  target_scope,
  target_member_ids,
  frequency,
  schedule,
  created_by_member_id,
  enabled,
  created_at,
  next_due_at,
  last_completed_at,
  completed_count
)
select
  item->>'id',
  item->>'familyId',
  item->>'type',
  item->>'title',
  nullif(item->>'assigneeMemberId', ''),
  nullif(item->>'targetScope', ''),
  coalesce(array(select jsonb_array_elements_text(coalesce(item->'targetMemberIds', '[]'::jsonb))), '{}'::text[]),
  coalesce(nullif(item->>'frequency', ''), 'once'),
  coalesce(item->'schedule', '{}'::jsonb),
  item->>'createdByMemberId',
  coalesce((item->>'enabled')::boolean, true),
  coalesce(nullif(item->>'createdAt', '')::timestamptz, now()),
  nullif(item->>'nextDueAt', '')::timestamptz,
  nullif(item->>'lastCompletedAt', '')::timestamptz,
  coalesce((item->>'completedCount')::integer, 0)
from app_state, jsonb_array_elements(coalesce(data->'reminderPlans', '[]'::jsonb)) as item
where item ? 'id' and item ? 'familyId' and item ? 'type' and item ? 'title' and item ? 'createdByMemberId'
on conflict (id) do update set
  next_due_at = excluded.next_due_at,
  last_completed_at = excluded.last_completed_at,
  completed_count = excluded.completed_count,
  enabled = excluded.enabled;

with app_state as (
  select data from nestful_app_state where id = 'default'
)
insert into reminders (
  id,
  plan_id,
  family_id,
  type,
  title,
  due_at,
  occurrence_number,
  occurrence_status,
  assignee_member_id,
  target_scope,
  target_member_ids,
  frequency,
  schedule,
  created_by_member_id,
  enabled,
  notification,
  completed_by_member_id,
  completed_at
)
select
  item->>'id',
  nullif(item->>'planId', ''),
  item->>'familyId',
  item->>'type',
  item->>'title',
  nullif(item->>'dueAt', '')::timestamptz,
  coalesce((item->>'occurrenceNumber')::integer, 1),
  coalesce(nullif(item->>'occurrenceStatus', ''), case when item ? 'completedAt' then 'completed' else 'pending' end),
  nullif(item->>'assigneeMemberId', ''),
  nullif(item->>'targetScope', ''),
  coalesce(array(select jsonb_array_elements_text(coalesce(item->'targetMemberIds', '[]'::jsonb))), '{}'::text[]),
  nullif(item->>'frequency', ''),
  coalesce(item->'schedule', '{}'::jsonb),
  item->>'createdByMemberId',
  coalesce((item->>'enabled')::boolean, true),
  item->'notification',
  nullif(item->>'completedByMemberId', ''),
  nullif(item->>'completedAt', '')::timestamptz
from app_state, jsonb_array_elements(coalesce(data->'reminders', '[]'::jsonb)) as item
where item ? 'id' and item ? 'familyId' and item ? 'type' and item ? 'title' and item ? 'dueAt' and item ? 'createdByMemberId'
on conflict (id) do update set
  due_at = excluded.due_at,
  occurrence_status = excluded.occurrence_status,
  enabled = excluded.enabled,
  notification = excluded.notification,
  completed_by_member_id = excluded.completed_by_member_id,
  completed_at = excluded.completed_at;

with app_state as (
  select data from nestful_app_state where id = 'default'
)
insert into activities (
  id,
  family_id,
  title,
  status,
  starts_at,
  location,
  description,
  budget_cents,
  created_by_member_id,
  memory_item_id,
  completed_at,
  cancelled_at
)
select
  item->>'id',
  item->>'familyId',
  item->>'title',
  coalesce(nullif(item->>'status', ''), 'scheduled'),
  nullif(item->>'startsAt', '')::timestamptz,
  nullif(item->>'location', ''),
  nullif(item->>'description', ''),
  (item->>'budgetCents')::integer,
  item->>'createdByMemberId',
  nullif(item->>'memoryItemId', ''),
  nullif(item->>'completedAt', '')::timestamptz,
  nullif(item->>'cancelledAt', '')::timestamptz
from app_state, jsonb_array_elements(coalesce(data->'activities', '[]'::jsonb)) as item
where item ? 'id' and item ? 'familyId' and item ? 'title' and item ? 'startsAt' and item ? 'createdByMemberId'
on conflict (id) do update set
  status = excluded.status,
  memory_item_id = excluded.memory_item_id,
  completed_at = excluded.completed_at,
  cancelled_at = excluded.cancelled_at;

with app_state as (
  select data from nestful_app_state where id = 'default'
)
insert into activity_participants (activity_id, member_id, rsvp, joined_at)
select
  item->>'activityId',
  item->>'memberId',
  coalesce(nullif(item->>'rsvp', ''), 'pending'),
  coalesce(nullif(item->>'joinedAt', '')::timestamptz, now())
from app_state, jsonb_array_elements(coalesce(data->'activityParticipants', '[]'::jsonb)) as item
where item ? 'activityId' and item ? 'memberId'
on conflict (activity_id, member_id) do update set
  rsvp = excluded.rsvp;

with app_state as (
  select data from nestful_app_state where id = 'default'
)
insert into activity_tasks (
  id,
  activity_id,
  family_id,
  title,
  assignee_member_id,
  status,
  created_by_member_id,
  completed_at
)
select
  item->>'id',
  item->>'activityId',
  item->>'familyId',
  item->>'title',
  nullif(item->>'assigneeMemberId', ''),
  coalesce(nullif(item->>'status', ''), 'open'),
  item->>'createdByMemberId',
  nullif(item->>'completedAt', '')::timestamptz
from app_state, jsonb_array_elements(coalesce(data->'activityTasks', '[]'::jsonb)) as item
where item ? 'id' and item ? 'activityId' and item ? 'familyId' and item ? 'title' and item ? 'createdByMemberId'
on conflict (id) do update set
  status = excluded.status,
  completed_at = excluded.completed_at;

with app_state as (
  select data from nestful_app_state where id = 'default'
)
insert into ledger_entries (
  id,
  family_id,
  type,
  category,
  title,
  amount_cents,
  paid_by_member_id,
  split_member_ids,
  occurred_at,
  recurrence,
  recurring_reminder_id
)
select
  item->>'id',
  item->>'familyId',
  item->>'type',
  item->>'category',
  item->>'title',
  (item->>'amountCents')::integer,
  item->>'paidByMemberId',
  coalesce(
    nullif(array(select jsonb_array_elements_text(coalesce(item->'splitMemberIds', '[]'::jsonb))), '{}'::text[]),
    array[item->>'paidByMemberId']
  ),
  nullif(item->>'occurredAt', '')::timestamptz,
  nullif(item->>'recurrence', ''),
  nullif(item->>'recurringReminderId', '')
from app_state, jsonb_array_elements(coalesce(data->'ledgerEntries', '[]'::jsonb)) as item
where item ? 'id' and item ? 'familyId' and item ? 'type' and item ? 'category' and item ? 'title'
on conflict (id) do update set
  split_member_ids = excluded.split_member_ids,
  recurrence = excluded.recurrence,
  recurring_reminder_id = excluded.recurring_reminder_id;

with app_state as (
  select data from nestful_app_state where id = 'default'
)
insert into ledger_goal_funds (
  id,
  family_id,
  title,
  target_amount_cents,
  current_amount_cents,
  created_by_member_id,
  due_at,
  created_at,
  completed_at
)
select
  item->>'id',
  item->>'familyId',
  item->>'title',
  (item->>'targetAmountCents')::integer,
  coalesce((item->>'currentAmountCents')::integer, 0),
  item->>'createdByMemberId',
  nullif(item->>'dueAt', '')::timestamptz,
  coalesce(nullif(item->>'createdAt', '')::timestamptz, now()),
  nullif(item->>'completedAt', '')::timestamptz
from app_state, jsonb_array_elements(coalesce(data->'ledgerGoalFunds', '[]'::jsonb)) as item
where item ? 'id' and item ? 'familyId' and item ? 'title' and item ? 'targetAmountCents' and item ? 'createdByMemberId'
on conflict (id) do update set
  current_amount_cents = excluded.current_amount_cents,
  completed_at = excluded.completed_at;

with app_state as (
  select data from nestful_app_state where id = 'default'
)
insert into digital_space_items (
  id,
  family_id,
  kind,
  title,
  summary,
  url,
  occurred_at,
  created_by_member_id,
  activity_id,
  place,
  tagged_member_ids,
  media_items,
  security_warning,
  created_at
)
select
  item->>'id',
  item->>'familyId',
  item->>'kind',
  item->>'title',
  nullif(item->>'summary', ''),
  nullif(item->>'url', ''),
  nullif(item->>'occurredAt', '')::timestamptz,
  item->>'createdByMemberId',
  nullif(item->>'activityId', ''),
  nullif(item->>'place', ''),
  coalesce(array(select jsonb_array_elements_text(coalesce(item->'taggedMemberIds', '[]'::jsonb))), '{}'::text[]),
  coalesce(item->'mediaItems', '[]'::jsonb),
  nullif(item->>'securityWarning', ''),
  coalesce(nullif(item->>'createdAt', '')::timestamptz, now())
from app_state, jsonb_array_elements(coalesce(data->'digitalSpaceItems', '[]'::jsonb)) as item
where item ? 'id' and item ? 'familyId' and item ? 'kind' and item ? 'title' and item ? 'createdByMemberId'
on conflict (id) do update set
  summary = excluded.summary,
  url = excluded.url,
  tagged_member_ids = excluded.tagged_member_ids,
  media_items = excluded.media_items,
  security_warning = excluded.security_warning;

with app_state as (
  select data from nestful_app_state where id = 'default'
)
insert into audit_events (id, family_id, actor_member_id, action, resource_type, resource_id, created_at)
select
  item->>'id',
  item->>'familyId',
  nullif(item->>'actorMemberId', ''),
  item->>'action',
  item->>'resourceType',
  item->>'resourceId',
  coalesce(nullif(item->>'createdAt', '')::timestamptz, now())
from app_state, jsonb_array_elements(coalesce(data->'auditEvents', '[]'::jsonb)) as item
where item ? 'id' and item ? 'familyId' and item ? 'action' and item ? 'resourceType' and item ? 'resourceId'
on conflict (id) do nothing;

create index if not exists idx_families_owner_user_id on families(owner_user_id);
create index if not exists idx_families_created_at on families(created_at);
create index if not exists idx_family_members_family_id on family_members(family_id);
create index if not exists idx_family_members_user_id on family_members(user_id);
create index if not exists idx_family_members_joined_at on family_members(joined_at);
create index if not exists idx_family_invitations_family_id on family_invitations(family_id);
create index if not exists idx_family_invitations_created_by_member_id on family_invitations(created_by_member_id);
create index if not exists idx_family_invitations_created_at on family_invitations(created_at);
create index if not exists idx_family_invitations_expires_at on family_invitations(expires_at);
create index if not exists idx_reminder_plans_family_id on reminder_plans(family_id);
create index if not exists idx_reminder_plans_created_by_member_id on reminder_plans(created_by_member_id);
create index if not exists idx_reminder_plans_next_due_at on reminder_plans(next_due_at);
create index if not exists idx_reminder_plans_created_at on reminder_plans(created_at);
create index if not exists idx_reminders_family_id on reminders(family_id);
create index if not exists idx_reminders_assignee_member_id on reminders(assignee_member_id);
create index if not exists idx_reminders_created_by_member_id on reminders(created_by_member_id);
create index if not exists idx_reminders_due_at on reminders(due_at);
create index if not exists idx_activities_family_id on activities(family_id);
create index if not exists idx_activities_created_by_member_id on activities(created_by_member_id);
create index if not exists idx_activities_starts_at on activities(starts_at);
create index if not exists idx_activity_participants_member_id on activity_participants(member_id);
create index if not exists idx_activity_tasks_family_id on activity_tasks(family_id);
create index if not exists idx_activity_tasks_assignee_member_id on activity_tasks(assignee_member_id);
create index if not exists idx_activity_tasks_created_by_member_id on activity_tasks(created_by_member_id);
create index if not exists idx_audit_events_family_id on audit_events(family_id);
create index if not exists idx_audit_events_actor_member_id on audit_events(actor_member_id);
create index if not exists idx_audit_events_created_at on audit_events(created_at);
create index if not exists idx_ledger_entries_family_id on ledger_entries(family_id);
create index if not exists idx_ledger_entries_paid_by_member_id on ledger_entries(paid_by_member_id);
create index if not exists idx_ledger_entries_occurred_at on ledger_entries(occurred_at);
create index if not exists idx_ledger_goal_funds_family_id on ledger_goal_funds(family_id);
create index if not exists idx_ledger_goal_funds_created_by_member_id on ledger_goal_funds(created_by_member_id);
create index if not exists idx_ledger_goal_funds_created_at on ledger_goal_funds(created_at);
create index if not exists idx_ledger_goal_funds_due_at on ledger_goal_funds(due_at);
create index if not exists idx_digital_space_items_family_id on digital_space_items(family_id);
create index if not exists idx_digital_space_items_created_by_member_id on digital_space_items(created_by_member_id);
create index if not exists idx_digital_space_items_activity_id on digital_space_items(activity_id);
create index if not exists idx_digital_space_items_created_at on digital_space_items(created_at);
create index if not exists idx_digital_space_items_occurred_at on digital_space_items(occurred_at);

insert into nestful_schema_migrations (version)
values ('001_normalized_postgres')
on conflict (version) do nothing;

commit;
