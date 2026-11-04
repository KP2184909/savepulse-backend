-- Install only; does not schedule or invoke the worker. No plaintext credential.
create schema if not exists private;
revoke all on schema private from public,anon,authenticated,service_role;
create or replace function private.run_savepulse_billing_worker()
returns jsonb language plpgsql security invoker
set search_path = pg_catalog,extensions
as $function$
declare
  worker_token text;
  result extensions.http_response;
  report jsonb;
begin
  select decrypted_secret into worker_token from vault.decrypted_secrets
    where name='savepulse_billing_worker_token';
  if worker_token is null or worker_token !~ '^[a-f0-9]{64}$' then
    return jsonb_build_object('ok',false,'reason','worker_credential_missing');
  end if;
  perform extensions.http_set_curlopt('CURLOPT_TIMEOUT_MS','55000');
  perform extensions.http_set_curlopt('CURLOPT_CONNECTTIMEOUT_MS','10000');
  select * into result from extensions.http((
    'POST','https://savepulse-backend.onrender.com/api/v1/admin/billing/webhook-worker',
    array[extensions.http_header('x-savepulse-worker-token',worker_token)],
    'application/json','{}')::extensions.http_request);
  -- Never persist request headers or a raw provider/HTTP response.
  report := jsonb_build_object('ok',result.status=200,'status',result.status,
    'completedAt',clock_timestamp());
  insert into public.scheduler_state(key,value)
    values('billing-external-worker:v1:live:status',report)
    on conflict(key) do update set value=excluded.value,updated_at=now();
  return report;
exception when others then
  report := jsonb_build_object('ok',false,'reason','worker_http_failed','completedAt',clock_timestamp());
  insert into public.scheduler_state(key,value)
    values('billing-external-worker:v1:live:status',report)
    on conflict(key) do update set value=excluded.value,updated_at=now();
  return report;
end;
$function$;
revoke all on function private.run_savepulse_billing_worker() from public,anon,authenticated,service_role;
