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
- Deployed Edge readiness now confirms the test API key and signing configuration. See deployed QA below for frontend → billing → signed webhook → durable entitlement evidence. Earlier standalone lifecycle checks remain separate evidence.
- Production paid checkout, tax treatment, legacy member migration, data-use rights and customer email fulfillment are **NOT VERIFIED**. Keep public checkout disabled.

Package shared modules before Edge deployment with `node tools/build-billing-sandbox.js`. `shared/` is generated and ignored; deploy the entrypoint plus generated ESM files. The tested Node source is canonical.

## Deployed QA — 2026-10-29 (Asia/Bangkok)

- User configured the test API credential through Supabase Secrets; readiness returned configured=true and webhookConfigured=true, liveSales=false.
- Netlify preview deployment 6ae2bcb0bce95ad4641ae628 served membership UI. User verified the authorized test mailbox securely.
- Clicking Test Pro checkout created hosted Sandbox Checkout cs_test_a14GWuleVZ52TEYQKlFnvdmOTnNegvJz4SvT7wFwPjEyGd8punTvC1fFTw. Completed using Stripe public test card only, with browser card saving declined.
- Return page and browser reload showed pro/active, paid through 2026-11-29 10:33:33 Asia/Bangkok. Isolated database confirmed subscription sub_1UVk5r0su7h1AsZTX1FIFDJb and two processed verified webhook events.
- Customer Portal showed the $15 paid invoice, payment method management, and cancellation. Submitted cancellation for period end. Database then confirmed cancelAt=1795923213 and three processed verified webhook events, preserving the paid period.
- CSS repair ensures hidden verification and portal controls do not appear when inapplicable.
- Automated checks: 119 pass. Real deployed checkout above covers Pro; Plus/Business hosted checkout and future renewal/expiry for this exact bound account remain unverified. Earlier separate test-clock renewal/failure checks do not substitute for that coverage.
- Production paid signup remains closed; live tax policy, existing member migration and Business/data coverage require resolution before activation.

## Additional deployed QA — 2026-10-29

- Pro immediate test-only cancellation propagated to Free/canceled on the browser without resetting the trial.
- Plus hosted Checkout cs_test_a1prwzOnVkimcnNNHnSy4LlnfJoqmom1iMILNg6AaomErfu8f6s7IVfFoJ charged $5 test-only; browser and durable state showed plus/active for sub_1UVkY80su7h1AsZTyT7XlkZd, including reload.
- Cancelled that Plus test subscription without invoicing/proration before testing Business.
- Business hosted Checkout cs_test_a1uAdmtSuh6UCO48AcFQjeMfVXvO9pnX4QSRB5I4THlHZDoUKXYm4eMOJa charged $59 test-only; browser and durable state showed business/active for sub_1UVkar0su7h1AsZTkWHiIfEy. Seven verified events persisted across the test sequence. Cancelled this test subscription after verification, without invoicing/proration. No live subscriptions were changed.
- Production database read-only inventory: five Free subscriber rows, no paid subscriber rows. This does not prove that the live Stripe account has no subscriptions; live Stripe inventory still needs verification.
- User confirms Thailand VAT registration (PP20). Sandbox GetTaxSettings returns country unsupported. Automatic Stripe Tax remains disabled; manual tax treatment and inclusive/exclusive pricing need confirmation before implementation/activation. No paid Stripe Tax product enabled.

## Live readiness inventory — 2026-10-29

- Chrome Dashboard account acct_1TbuP21NzGcGzIig (SavePulse, not sandbox): Account status showed Active for Payments, Payouts and PromptPay payments, with no active tasks to complete.
- Live Subscriptions displayed the empty onboarding state (no listed subscriptions). Combined with the read-only Production database inventory above, no existing paid member migration was identified in the inspected sources. No live account mutations made.
- User confirms that $5/$15/$59 must INCLUDE VAT, not add tax to those totals. User confirms PP20 VAT registration in Thailand; exact service tax treatment and domestic/export handling remain to be confirmed. Do not use one blanket tax rule for all countries.
- Stripe connector access is currently scoped to sandbox only. Live Dashboard read access is available. Live backend credentials/prices/webhook/portal and full Production fulfillment remain unverified.

## VAT-inclusive deployed QA — 2026-10-29

- Edge `savepulse-billing-sandbox` version 7 is active in isolated project `sktzydyiwqylpstxjicf`. Preview deploy `6ae2e76ec26b4d355662b340` includes authenticated test-document controls. Production is unchanged.
- Hosted Plus Checkout `cs_test_a1SdZGGTDnLYL76cEHJ4wwyyjC3Z1Z5DRGlnpMZXXjWdjbuT1IXotLKEHo` displayed USD 5.00 total, VAT 7% inclusive USD 0.33. Completed with Stripe public test card, no real charge or browser card saving.
- Returned membership page and reload confirmed Plus / active, paid through 2026-11-29 13:23:51 Asia/Bangkok. Durable sandbox state confirms `sub_1UVmkf0su7h1AsZTTLSuys8M`, latestInvoicePaid=true.
- Clicking Prepare test tax document fetched the latest invoice server-side from the authenticated account. BOT has no exact 2026-10-29 payment-date rate yet. UI correctly reports pending publication without reducing membership, fabricating a rate or issuing a numbered document. Database contained only verified 2026-10-28 FX evidence at this check.
- Tax document email delivery remains NOT VERIFIED: dedicated test sender/key are not configured. No customer mail sent. No live billing enabled. Required follow-up: real exact-date document issuance after BOT publication, rendered-document review, authorized test-mail delivery, automated pending-job recovery, then live configuration and fulfillment readiness.
- Focused billing and tax ledger checks: 18 PASS after this change. Previous broader 130-check result remains separate evidence; no new full-suite claim.

## Durable tax-document follow-up — 2026-10-29

See tax-document-qa.md for corrected BOT reference-date selection, actual test document TEST-SP-TI-202610-000001, authenticated worker/cron proof, 139 passing checks and explicit remaining tax-document launch requirements. The earlier exact-payment-date waiting requirement is superseded for supported ordinary daytime cases; exceptional dates remain visible review jobs. No Production change or real tax filing.
