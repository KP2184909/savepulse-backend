# SavePulse membership billing — sandbox release candidate

Public paid signup is not enabled by this branch. USD/month prices remain Plus 5, Pro 15 and Business 59. The no-card 14-day trial is independent and never creates a Stripe subscription. Business sales require a separate readiness decision.

## Implemented

`src/billingLifecycle.js` creates hosted Checkout only for a verified identity and a validated monthly USD Price. Server-generated account/attempt references bind Checkout to the eventual subscription; email in an arbitrary webhook is not ownership. Repeated clicks reuse Checkout; changing plan expires the previous open session before making another. A lost provider response retries identical parameters with the persisted idempotency key, and ambiguous attempts older than 23 hours stop for review.

Billing is authoritative in service-role-only `scheduler_state` rows under `billing:v2:<test/live>:<Stripe account>:<canonical email hash>`. Unique insert plus version-conditional PATCH implement durable CAS. An account lease and fencing prevent concurrent workers from overwriting each other. Processed event IDs are retained in the same account document (most recent 256); older replay also retrieves current provider state and is semantically idempotent. The recipient JSON mirror never proves access. Premium requests and email delivery resolve current paid entitlement again; storage/provider uncertainty fails closed.

Signed webhooks validate timestamp/HMAC, reject the other mode, validate a stored Checkout binding, and retrieve the current subscription after acquiring the account lease. Access uses the actual Price, customer, subscription, paid invoice and invoice/item period; active subscription status alone is insufficient. Failed renewals never extend paid time. Unpaid upgrades cannot acquire a higher entitlement from an earlier paid period. Cancellation at period end keeps only paid-through access; immediate cancellation revokes it. Reads reconcile after five minutes or period expiry, including recovery of a completed bound Checkout whose webhook was lost. Portal uses the server-bound customer ID.

The HTTP handlers use the same lifecycle as the Supabase sandbox function. Legacy metadata-only event application is not called by the public webhook anymore. Existing legacy memberships need verified migration/reconciliation before any Production billing release; do not enable v2 live over unmigrated legacy records.

## Deployed sandbox infrastructure (28 October 2026)

Existing free Supabase project `sktzydyiwqylpstxjicf` (FreightPulse Sandbox), in the owner-confirmed SavePulse organization, hosts the separate SavePulse billing test function. No hosting upgrade, paid add-on, or customer-record copy was made. `scheduler_state` was added using `billing-sandbox-schema.sql`; RLS is enabled and anon/authenticated SELECT is revoked. Security advisor reports INFO RLS-with-no-policy, intentional for server-only state: https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy

Function: `https://sktzydyiwqylpstxjicf.supabase.co/functions/v1/savepulse-billing-sandbox/<operation>`.

- `readiness`: safe configuration booleans, never keys.
- `catalog`, `status`, `checkout`, `portal`: test-account membership workflow.
- `webhook`: signed Stripe test events; no Production entitlement writes.

It checks the exact sandbox project URL and exact Stripe account, rejects live keys/events, and only authenticates `savepulse.cloud@gmail.com`. Existing SavePulse verified sessions are checked against the Production identity endpoint read-only. It does not start/cancel a Production trial, change a Production membership, or send a marketing email.

Stripe sandbox account: `acct_1TbuPE0su7h1AsZT`.

| Plan | USD/month | Sandbox Price |
|---|---:|---|
| Plus | 5 | `price_1UVWmu0su7h1AsZTM4eoZAok` |
| Pro | 15 | `price_1UVWmv0su7h1AsZTXsoHLSsG` |
| Business | 59 | `price_1UVWmw0su7h1AsZTO3N7SQ51` |

The old **test** endpoint `we_1TbvPk0su7h1AsZT9ETpm99l`, which pointed to the Production Render backend, was disabled before QA. The new test endpoint `we_1UVXZx0su7h1AsZTNnTXlvBq` points directly to this isolated function. Its signing secret is held in an RLS-protected server-only configuration row, not source control or client responses. Portal configuration `bpc_1UVXIX0su7h1AsZTxKN4Mw1W` supports invoice history, payment-method update and cancellation at period end; plan changes are disabled.

The function still requires the owner to enter the existing sandbox API key as the Supabase Edge secret `SAVEPULSE_BILLING_TEST_KEY`. A restricted test key is preferred; it needs account/price/subscription/Checkout read and Checkout create/expire/Portal session permissions. The Stripe connector OAuth grant authorizes agent tool calls; it does not provision runtime API credentials for this deployed backend. Never paste the key in chat. Edge secrets: https://supabase.com/dashboard/project/sktzydyiwqylpstxjicf/functions/secrets

Deploy Preview #10 forwards `/sandbox-billing/*` via a Netlify Function to the isolated Edge Function; it is disabled outside Deploy Preview for the verified Netlify site ID. The membership frontend uses that test route only on the exact Preview #10 hostname. Other API calls retain the existing proxy. Function headers are set on returned Responses; Netlify static `_headers`/`netlify.toml` headers do not configure function responses.

## Verified so far — distinguish layers

- Local tests cover verified HTTP signup/Checkout, signature rejection, duplicate events, current-state reconciliation after reload, trial independence, failed renewal, cancelled access, portal ownership and entitlement recheck before delivery. Run `node --test` for the current count.
- **Actual Stripe sandbox** hosted Pro Checkout `cs_test_a1MIwXTwDkk61ycantZ2oauRiyosNR7KjnIiHb2sS7sEdlngz5kHhrfSx8` was completed in Chrome using Stripe's public test card. API readback confirmed `complete` / `paid`, subscription `sub_1UVX9C0su7h1AsZTbO2EaRCy` active, paid initial invoice `in_1UVX9A0su7h1AsZT14M8POhK`.
- Test Clock `clock_1UVWz10su7h1AsZTWwyJDZfM` advanced to November 29: renewal invoice `in_1UVXGb0su7h1AsZT8BbhH0Gx` paid, subscription active.
- A Stripe test-only decline source was selected for the next cycle. Advancing to December 29 produced `past_due`, invoice `in_1UVXL50su7h1AsZTkqGJe0J3` open, attempted, amount due 1500 cents and amount paid 0.
- Customer Portal displayed card management, paid/failed invoice history and cancellation. Cancellation was submitted in the sandbox Portal; API readback confirmed `cancel_at=1801143219` (flexible billing mode), without relying solely on `cancel_at_period_end`.
- An auxiliary direct API test subscription `sub_1UVX6G0su7h1AsZTQNd0mS2j` was cancelled after its renewal check. These are isolated test objects, no real charges.
- Deployed Edge readiness confirms test-only isolation and signing configuration; the test API key is still absent. Therefore frontend → deployed billing → signed webhook → durable entitlement E2E is **NOT VERIFIED**. Actual Stripe lifecycle success is not proof of deployed membership fulfillment.
- Production paid checkout, tax treatment, legacy member migration, data-use rights and customer email fulfillment are **NOT VERIFIED**. Keep public checkout disabled.

Package shared modules before Edge deployment with `node tools/build-billing-sandbox.js`. `shared/` is generated and ignored; deploy the entrypoint plus generated ESM files. The tested Node source is canonical.
