-- JSONB runtime storage for a replacement Supabase project.
-- Restore business data separately; never import the cluster's system schemas.
begin;

create table if not exists public.nestful_app_state (
  id text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now(),
  constraint nestful_app_state_data_object check (jsonb_typeof(data) = 'object')
);

create index if not exists nestful_app_state_updated_at_idx
  on public.nestful_app_state(updated_at);

-- The backend uses its Postgres connection. No client Data API access is needed.
alter table public.nestful_app_state enable row level security;
revoke all on table public.nestful_app_state from anon, authenticated;

commit;
