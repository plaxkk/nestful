begin;

drop table if exists digital_space_items;
drop table if exists ledger_goal_funds;
drop table if exists ledger_entries;
drop table if exists audit_events;
drop table if exists activity_tasks;
drop table if exists activity_participants;
drop table if exists activities;
drop table if exists reminders;
drop table if exists reminder_plans;
drop table if exists family_invitations;
drop table if exists family_members;
drop table if exists families;
drop table if exists user_sessions;
drop table if exists wechat_identities;
drop table if exists users;

delete from nestful_schema_migrations where version = '001_normalized_postgres';

commit;
