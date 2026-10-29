-- ISOLATED PROJECT ONLY: sktzydyiwqylpstxjicf. No live invoices or email delivery.
-- Generate the dedicated worker credential inside the database; never export it.
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;
insert into public.scheduler_state(key,value)
values ('tax-worker:v1:test:credential',jsonb_build_object('version',1,'token',encode(extensions.gen_random_bytes(32),'hex')))
on conflict(key) do nothing;
revoke all on net.http_request_queue from public,anon,authenticated;
select cron.schedule('savepulse-tax-document-sandbox-retry','*/15 * * * *',$job$
 select net.http_post(
  url := 'https://sktzydyiwqylpstxjicf.supabase.co/functions/v1/savepulse-billing-sandbox/tax-worker',
  headers := jsonb_build_object('Content-Type','application/json','x-savepulse-worker-token',(select value->>'token' from public.scheduler_state where key='tax-worker:v1:test:credential')),
  body := '{}'::jsonb,
  timeout_milliseconds := 60000
 );
$job$);
