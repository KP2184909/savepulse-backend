# Production scheduler preparation — credential handoff pending

Verified SavePulse Production knkimiyxcmkslxemcynp had Vault but no cron or
HTTP scheduler extensions. Installed pg_cron and initially pg_net. Readback
showed net.http_request_queue PUBLIC SELECT remained despite two REVOKE
migrations: owner is supabase_admin and current postgres cannot assume it.
No credential-bearing pg_net request was submitted; queue count was0 and no
cron jobs existed. Removed this newly installed unused pg_net extension.
Do not use the previous pg_net cron template on this project.

Installed official http extension1.6 in extensions instead. It makes synchronous
HTTP calls without a token-bearing request queue. Created private schema and
SECURITY INVOKER private.run_savepulse_billing_worker(), fixed Render URL,
55-second total/10-second connection bounds, response status/time only. Raw
request headers, credentials, HTTP bodies and exception details are never
persisted. Verified anon/authenticated/service_role cannot execute the function.

Generated a dedicated32-byte random worker token server-side in Vault named
savepulse_billing_worker_token. It was never selected, printed or committed.
The private probe at2026-11-04T03:56:48.849398Z reached Render and returned503,
consistent with worker credential not configured yet. No billing task was run.
Vault token generation did not configure Render or grant public access.

Prepared Chrome Vault secret page with its value still hidden, and a blank
Render Environment Value row named BILLING_WORKER_KEY. User must reveal/copy/
paste and submit the credential themselves under Computer Use requirements.
No cron job has been scheduled; new Live sales and queue remain disabled.

After owner saves Render credential: verify deployment, bind queue flags with
sales closed, call the private worker and inspect HTTP plus durable heartbeat,
then schedule the prepared5-minute job and verify an automatic invocation.
Cold Render starts can exceed the HTTP timeout; retries and health observation
remain necessary. No paid service/plan or customer email was added.

References used: Supabase schedule-functions and http extension documentation,
plus pgsql-http's upstream request/header types. Current changelog scanned;
no relevant new breaking change for these server-side APIs. TLS verification
remains on by default; no browser security warning was bypassed.
