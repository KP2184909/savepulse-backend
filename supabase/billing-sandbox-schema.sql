-- Apply only to the existing FreightPulse Sandbox project (sktzydyiwqylpstxjicf).
-- Same CAS state table used by the tested SavePulse lifecycle, isolated from Production.
create table if not exists public.scheduler_state (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.scheduler_state enable row level security;
revoke all on public.scheduler_state from anon, authenticated;
grant select, insert, update on public.scheduler_state to service_role;
