-- Additive migration for the repository's numbered SQL runner.
begin;
alter table nestful.family_invitations
  add column if not exists mode text not null default 'single' check(mode in ('single','group')),
  add column if not exists max_uses integer not null default 1 check(max_uses between 1 and 100),
  add column if not exists use_count integer not null default 0 check(use_count between 0 and 100),
  add column if not exists requires_approval boolean not null default false;

create unique index if not exists invitations_family_id_key on nestful.family_invitations(family_id,id);
create table if not exists nestful.family_join_requests (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references nestful.families(id),
  invitation_id uuid not null references nestful.family_invitations(id),
  user_id uuid not null references nestful.users(id),
  display_name text not null check(length(display_name) between 1 and 60),
  status text not null default 'pending' check(status in ('pending','approved','rejected')),
  decided_by_member_id uuid,
  created_at timestamptz(3) not null default now(), decided_at timestamptz(3),
  unique(invitation_id,user_id),
  foreign key(family_id,invitation_id) references nestful.family_invitations(family_id,id),
  foreign key(family_id,decided_by_member_id) references nestful.family_members(family_id,id)
);
create index if not exists join_requests_family_pending_idx
  on nestful.family_join_requests(family_id,created_at,id) where status='pending';
create index if not exists join_requests_user_idx on nestful.family_join_requests(user_id);
create index if not exists activity_upcoming_idx on nestful.activities(family_id,starts_at,id)
  where archived_at is null and status in ('draft','scheduled');
grant select,insert,update on nestful.family_join_requests to nestful_runtime;
revoke all on nestful.family_join_requests from public;
-- nestful is private; no anon/authenticated grants or new SECURITY DEFINER code.
commit;
