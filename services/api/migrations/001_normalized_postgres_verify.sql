with app_state as (
  select data from nestful_app_state where id = 'default'
),
json_counts as (
  select 'users' as entity, jsonb_array_length(coalesce(data->'users', '[]'::jsonb)) as count from app_state
  union all select 'user_sessions', jsonb_array_length(coalesce(data->'userSessions', '[]'::jsonb)) from app_state
  union all select 'families', jsonb_array_length(coalesce(data->'families', '[]'::jsonb)) from app_state
  union all select 'family_members', jsonb_array_length(coalesce(data->'members', '[]'::jsonb)) from app_state
  union all select 'family_invitations', jsonb_array_length(coalesce(data->'invitations', '[]'::jsonb)) from app_state
  union all select 'reminder_plans', jsonb_array_length(coalesce(data->'reminderPlans', '[]'::jsonb)) from app_state
  union all select 'reminders', jsonb_array_length(coalesce(data->'reminders', '[]'::jsonb)) from app_state
  union all select 'activities', jsonb_array_length(coalesce(data->'activities', '[]'::jsonb)) from app_state
  union all select 'activity_participants', jsonb_array_length(coalesce(data->'activityParticipants', '[]'::jsonb)) from app_state
  union all select 'activity_tasks', jsonb_array_length(coalesce(data->'activityTasks', '[]'::jsonb)) from app_state
  union all select 'ledger_entries', jsonb_array_length(coalesce(data->'ledgerEntries', '[]'::jsonb)) from app_state
  union all select 'ledger_goal_funds', jsonb_array_length(coalesce(data->'ledgerGoalFunds', '[]'::jsonb)) from app_state
  union all select 'digital_space_items', jsonb_array_length(coalesce(data->'digitalSpaceItems', '[]'::jsonb)) from app_state
  union all select 'audit_events', jsonb_array_length(coalesce(data->'auditEvents', '[]'::jsonb)) from app_state
),
table_counts as (
  select 'users' as entity, count(*)::integer as count from users
  union all select 'user_sessions', count(*)::integer from user_sessions
  union all select 'families', count(*)::integer from families
  union all select 'family_members', count(*)::integer from family_members
  union all select 'family_invitations', count(*)::integer from family_invitations
  union all select 'reminder_plans', count(*)::integer from reminder_plans
  union all select 'reminders', count(*)::integer from reminders
  union all select 'activities', count(*)::integer from activities
  union all select 'activity_participants', count(*)::integer from activity_participants
  union all select 'activity_tasks', count(*)::integer from activity_tasks
  union all select 'ledger_entries', count(*)::integer from ledger_entries
  union all select 'ledger_goal_funds', count(*)::integer from ledger_goal_funds
  union all select 'digital_space_items', count(*)::integer from digital_space_items
  union all select 'audit_events', count(*)::integer from audit_events
)
select
  coalesce(json_counts.entity, table_counts.entity) as entity,
  coalesce(json_counts.count, 0) as jsonb_count,
  coalesce(table_counts.count, 0) as normalized_count,
  coalesce(table_counts.count, 0) - coalesce(json_counts.count, 0) as count_delta
from json_counts
full join table_counts using (entity)
order by entity;

select
  'orphaned_family_members' as check_name,
  count(*)::integer as count
from family_members
left join families on families.id = family_members.family_id
where families.id is null
union all
select 'orphaned_reminders', count(*)::integer
from reminders
left join families on families.id = reminders.family_id
where families.id is null
union all
select 'orphaned_ledger_entries', count(*)::integer
from ledger_entries
left join families on families.id = ledger_entries.family_id
where families.id is null
union all
select 'orphaned_digital_space_items', count(*)::integer
from digital_space_items
left join families on families.id = digital_space_items.family_id
where families.id is null;
