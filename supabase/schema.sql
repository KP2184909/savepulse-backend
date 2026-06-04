create table if not exists public.signals (
  symbol text primary key,
  action text,
  timeframe text,
  price numeric,
  received_at timestamptz,
  effective_until timestamptz,
  updated_at timestamptz not null default now(),
  payload jsonb not null default '{}'::jsonb
);

create table if not exists public.subscribers (
  email text primary key,
  subscriber_id text,
  plan text not null default 'free',
  locale text not null default 'en',
  interest text,
  watchlist jsonb not null default '[]'::jsonb,
  channels jsonb not null default '["email"]'::jsonb,
  preferences jsonb not null default '{}'::jsonb,
  billing jsonb not null default '{}'::jsonb,
  created_at timestamptz,
  updated_at timestamptz not null default now(),
  payload jsonb not null default '{}'::jsonb
);

create table if not exists public.notification_jobs (
  id text primary key,
  status text not null default 'pending',
  type text not null default 'signal_alert',
  scheduled_for timestamptz,
  created_at timestamptz,
  finished_at timestamptz,
  payload jsonb not null default '{}'::jsonb
);

create table if not exists public.invoices (
  id text primary key,
  subscriber_id text,
  email text,
  symbol text,
  currency text,
  target_currency text,
  amount numeric,
  due_date timestamptz,
  vendor text,
  created_at timestamptz,
  updated_at timestamptz not null default now(),
  payload jsonb not null default '{}'::jsonb
);

create table if not exists public.scheduler_state (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.stripe_events (
  id text primary key,
  type text,
  payload jsonb not null default '{}'::jsonb,
  result jsonb not null default '{}'::jsonb,
  processed_at timestamptz not null default now()
);

alter table public.signals enable row level security;
alter table public.subscribers enable row level security;
alter table public.notification_jobs enable row level security;
alter table public.invoices enable row level security;
alter table public.scheduler_state enable row level security;
alter table public.stripe_events enable row level security;

create index if not exists subscribers_plan_idx on public.subscribers (plan);
create index if not exists notification_jobs_status_scheduled_idx on public.notification_jobs (status, scheduled_for);
create index if not exists invoices_email_idx on public.invoices (email);
create index if not exists stripe_events_type_idx on public.stripe_events (type);
