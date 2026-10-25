# FreightPulse AI — sandbox implementation plan

Status: development only. No production deployment, no live payments, no invitation campaigns changed.

## Existing architecture (inspected 25 October 2026)

- Node HTTP server, static HTML/JS frontend on Netlify, Render backend proxy /api/*.
- SavePulse has one subscriber.plan per verified email, plus independent server-side no-card trial identity/session records in Supabase scheduler_state. Existing paid checkout is closed.
- Existing Stripe handler verifies signatures but applies email/plan metadata to SavePulse; it is unsuitable for independent company subscriptions. FreightPulse must use its own webhook and company/customer/subscription binding.
- Supabase Production is ACTIVE_HEALTHY, seven existing public tables have RLS enabled. No schema or customer rows changed for this work. Trial key/value store offers awaited insert and version-checked CAS, reused behind a FreightPulse-only namespace for this prototype. No JSON fallback for member access.
- New Stripe connector requires reauthentication. Provider sandbox tests and Product/Price provisioning are blocked until a sandbox account is selected. Local adapter tests do not establish Stripe readiness.

## Build

1. Separate company and subscription records; reuse verified identity only. Support the same email owning both services without editing SavePulse plan, trial, subscriber or billing records. Company team membership/invites await an approved seat policy.
2. Sandbox-only Stripe adapter: separate Product/Price USD 99.00/month, quantity one company, no trial/coupon assumptions. Dedicated company Stripe customers and portal configuration isolate SavePulse billing. Hosted Checkout and Portal; canonical Stripe subscription/invoice retrieval after signed webhook, durable dedup and fenced per-company reconciliation.
3. Draft Pine payload validator; separate container/bulk/context families, closed 1D bars only, source freshness independent of delivery time, atomic per-stream duplicate/order checks. No CS/BDI rule engine copied from SavePulse. Real ingestion remains closed until contract, cancellation/restart rules and licensing are signed off.
4. Mobile Demo report plus authenticated test report, route preferences, notification history. BDI and ZIM are separate context panels. Demo is never silently mixed into member data.
5. Test-only operational email queue, stable provider idempotency key, persisted attempt/history and retry; recipients restricted to savepulse.cloud@gmail.com. Discord remains disabled extension point.
6. Unit/HTTP/UI tests. Draft PR only; do not merge/deploy production.

## Decisions before sale / live feed

- Company seats, invitation/transfer/admin policy (no number inferred).
- FreightPulse trial duration and discount policy (none enabled in sandbox).
- Tax jurisdiction/registrations, inclusive/exclusive handling, supported billing locations and exact checkout tax disclosure. No assumption that $99 is tax-inclusive, tax-free or that automatic_tax alone establishes registration.
- Rights to distribute/use each source commercially, attribution and delay requirements. TradingView access is not resale permission.
- Canonical route names and source tickers; CS11!/CS21!/CS31!/CS41!/CS51!/CS61! kept as identifiers until agreed.
- CS cancellation/restart, missing-bar calendar and window expiry; independent BDI script/rules; accepted ZIM context version. Draft CS prototype: close[t] > close[t-1] after close[t-1] < close[t-2], five data-bearing daily bars including day one, no EMA prerequisite. Backend does not invent these unresolved rules.
- Per-source freshness SLA, source-update meaning, bar timestamp convention and script versions, agreed with FreightPulse chat before real integration.
- Stripe sandbox selection and provider tests; live payments, customer-facing publication and production storage migration require a separate readiness review.

## Sources

- https://docs.stripe.com/billing/subscriptions/webhooks
- https://docs.stripe.com/customer-management/integrate-customer-portal
- https://supabase.com/docs/guides/database/postgres/row-level-security
