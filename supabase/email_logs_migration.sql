create table if not exists public.email_logs (
  id text primary key,
  subscriber_id text,
  email text,
  plan text,
  template_type text,
  status text not null default 'pending',
  skipped_reason text,
  error_message text,
  provider_message_id text,
  signal_snapshot_date text,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  payload jsonb not null default '{}'::jsonb
);

alter table public.email_logs enable row level security;

create index if not exists email_logs_snapshot_idx
  on public.email_logs (signal_snapshot_date, template_type, status);

create index if not exists email_logs_subscriber_date_idx
  on public.email_logs (subscriber_id, signal_snapshot_date, template_type);

create index if not exists email_logs_status_created_idx
  on public.email_logs (status, created_at desc);
