-- Isolated FreightPulse Sandbox project only. No customer/member tables.
create table public.freightpulse_sandbox_config (
  id text primary key check(id='receiver'),
  token_hash text not null check(token_hash ~ '^[a-f0-9]{64}$'),
  enabled boolean not null default false,
  minute_bucket timestamptz, minute_count integer not null default 0,
  day_bucket date, day_count integer not null default 0
);
create table public.freightpulse_sandbox_latest (
  symbol text primary key,
  bar_time timestamptz not null,
  fingerprint text not null,
  payload jsonb not null,
  received_at timestamptz not null default clock_timestamp()
);
create table public.freightpulse_sandbox_events (
  symbol text not null,
  bar_time timestamptz not null,
  fingerprint text not null,
  payload jsonb not null,
  received_at timestamptz not null default clock_timestamp(),
  primary key(symbol,bar_time)
);
alter table public.freightpulse_sandbox_config enable row level security;
alter table public.freightpulse_sandbox_latest enable row level security;
alter table public.freightpulse_sandbox_events enable row level security;
revoke all on public.freightpulse_sandbox_config, public.freightpulse_sandbox_latest, public.freightpulse_sandbox_events from public,anon,authenticated;
grant select,insert,update on public.freightpulse_sandbox_config, public.freightpulse_sandbox_latest, public.freightpulse_sandbox_events to service_role;
create or replace function public.freightpulse_sandbox_ingest(p_payload jsonb,p_fingerprint text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare
  cfg public.freightpulse_sandbox_config%rowtype;
  prior public.freightpulse_sandbox_latest%rowtype;
  incoming_time timestamptz;
  instrument text;
  clock_time timestamptz := clock_timestamp();
  minute_now timestamptz := date_trunc('minute',clock_time);
  day_now date := (clock_time at time zone 'UTC')::date;
begin
  if p_payload->>'dataMode' is distinct from 'test' or p_payload ? 'secret_key'
     or p_fingerprint !~ '^[a-f0-9]{64}$' then
    return jsonb_build_object('error','invalid_test_payload');
  end if;
  instrument := p_payload->>'symbol';
  if instrument not in ('CS11!','CS21!','CS31!','CS41!','CS51!','CS61!','BDI','ZIM') then
    return jsonb_build_object('error','invalid_symbol');
  end if;
  incoming_time := (p_payload->>'barTime')::timestamptz;
  select * into cfg from public.freightpulse_sandbox_config where id='receiver' for update;
  if not found or not cfg.enabled then return jsonb_build_object('error','sandbox_receiver_disabled'); end if;
  if (cfg.minute_bucket=minute_now and cfg.minute_count>=60) or
     (cfg.day_bucket=day_now and cfg.day_count>=500) then
    return jsonb_build_object('error','sandbox_rate_limited');
  end if;
  update public.freightpulse_sandbox_config set
    minute_count=case when minute_bucket=minute_now then minute_count+1 else 1 end,
    minute_bucket=minute_now,
    day_count=case when day_bucket=day_now then day_count+1 else 1 end,
    day_bucket=day_now where id='receiver';
  select * into prior from public.freightpulse_sandbox_latest where symbol=instrument for update;
  if found then
    if incoming_time < prior.bar_time then return jsonb_build_object('error','out_of_order_bar'); end if;
    if incoming_time = prior.bar_time then
      if prior.fingerprint=p_fingerprint then return jsonb_build_object('accepted',false,'duplicate',true); end if;
      return jsonb_build_object('error','conflicting_bar');
    end if;
  end if;
  insert into public.freightpulse_sandbox_events(symbol,bar_time,fingerprint,payload,received_at)
    values(instrument,incoming_time,p_fingerprint,p_payload,clock_time);
  insert into public.freightpulse_sandbox_latest(symbol,bar_time,fingerprint,payload,received_at)
    values(instrument,incoming_time,p_fingerprint,p_payload,clock_time)
    on conflict(symbol) do update set bar_time=excluded.bar_time,fingerprint=excluded.fingerprint,payload=excluded.payload,received_at=excluded.received_at;
  return jsonb_build_object('accepted',true,'duplicate',false,'receivedAt',clock_time);
end;
$$;
revoke all on function public.freightpulse_sandbox_ingest(jsonb,text) from public,anon,authenticated;
grant execute on function public.freightpulse_sandbox_ingest(jsonb,text) to service_role;
