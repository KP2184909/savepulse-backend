# Live launch audit — 2026-11-02

Decision: NOT READY for public paid signup. No Live setting, charge, subscription,
tax registration or customer email was changed during this audit.

## Direct observations

| Check | Result | Evidence / limit |
| --- | --- | --- |
| Production trial dependencies | PASS | GET https://savepulse.cloud/api/v1/trial/readiness returned 200, ready=true, database=verified, emailConfigured=true, autoRenew=false, release 25cb7efa437c946d920f45e9ea6834a1d93b3e8f. This is trial readiness, not paid billing approval. |
| Production paid catalog | FAIL | GET /api/v1/billing/catalog returned 404 `Not found` on both savepulse.cloud and savepulse-backend.onrender.com. The PR route is not available there. |
| Production membership page | PARTIAL | GET https://savepulse.cloud/membership/ returned 200 HTML; this does not establish functioning checkout. |
| Correct Stripe Live account | PASS | Logged-in Chrome displayed SavePulse account acct_1TbuP21NzGcGzIig, Live dashboard and Payment links list. No key was revealed. |
| Existing Live Payment Links match approved USD catalog | FAIL | Active list contains Business USD59, Business THB1990, Pro THB499, Plus THB199. No USD5/15 links in that list. This does not prove the absence of USD Price objects elsewhere. |
| Live API connector | NOT VERIFIED | Both usable connections enumerate sandbox acct_1TbuPE0su7h1AsZT only; do not use their settings as Live evidence. |
| Live key/account binding, USD Price objects, inclusive tax rate, portal and webhook event configuration | NOT VERIFIED | Dashboard inspection was interrupted by Mac lock before details could be verified. Do not infer these values from sandbox. |
| Render repository, branch, deployed commit and environment flags | NOT VERIFIED | Production trial endpoint reports release above; Render dashboard configuration itself still needs inspection. Never dump environment values. |
| RD e-Tax authorization | PENDING | Owner reports uploaded documents and awaiting approval; approval has not been independently verified. |
| Automated regression suite | PASS | 159/159 after Live tax configuration guard. Automated tests are separate from Live proof. |

## Fix from audit

Live checkout now rejects `billing_live_tax_configuration_required` before any
provider or storage action if BILLING_DOMESTIC_VAT_ENABLED is not exactly `true`.
Previously Live approval flags could enable the demo path without a tax profile
or inclusive rate. Test mode remains available for the isolated demo. This fix
is in PR10; it is not a Production deployment.

## Exceptional tax cases and launch handling

The supported implementation is ordinary domestic Thailand service use with
inclusive VAT, not worldwide automated taxation.

| Case | Required handling before release |
| --- | --- |
| Foreign customer or mixed-country use | Do not infer 0% from card/email/address. Determine actual use abroad, evidence and allocation; separately check destination-country obligations. Current profile rejects non-TH service use. |
| Prepayment, credit balance, discounts, prorations, multiple invoice allocations | Route to review. Current draft verifier rejects unsupported totals/credits/discounts rather than manufacturing a standard invoice. Confirm the tax point for the actual transaction; a delayed payout is not automatically the tax point. |
| Before publication, month-end, special bank closures, calendar after 2026 | Current FX policy explicitly queues review. Its normal daytime selection is tested sandbox behavior, not proof that the modern BOT dataset's publication timing matches every historical RD example. BOT API documents 18:00 publication, while P132 examples discuss morning announcements. Reconcile publication/observation dates and retain evidence before Live automation. |
| Refund, chargeback, dispute | A payment event alone is not a legal credit-note reason. Preserve original invoice, independently verify refund ownership and require supported reason review. Dispute/fraud fixtures do not establish actual Live handling. |
| FX changes after issuance | Do not rewrite an issued invoice or issue a credit note solely because the exchange rate changed. |
| Thai business requests withholding/deduction | Current gross-card-payment flow does not implement withholding certificates or net settlement. Resolve contract/payment classification and documentary process before offering this variation; do not automatically call all subscriptions subject to one withholding rate. |
| e-Tax pending | Current TEST HTML emails are not valid e-Tax invoices. Need approved electronic issuance/signing/time-stamp process, or a separately prepared lawful paper issuance/delivery process. Enrollment pending does not cancel VAT obligations. |

Authoritative sources reviewed:

- https://www.rd.go.th/28635.html — P132/2548 sections 5–7 and 10, FX method/THB amounts, exceptions and immutable issued amounts.
- https://www.rd.go.th/3288.html — Notification105 as amended, overseas use/mixed use and payment evidence.
- https://www.rd.go.th/5208.html — tax-invoice and credit-note provisions.
- https://www.thaigov.go.th/th/news/166956 — government announcement of VAT7% extension through 30 September2027; verify operative rate validity at activation.
- https://taxation-customs.ec.europa.eu/taxation/vat/vat-directive/place-taxation_en — separate place-of-taxation obligations.

## Next execution order

1. Finish read-only Live/Render audit after Mac unlock: no secrets in evidence.
2. Establish the actual Live invoice delivery process and exceptional FX review
   ownership; keep unsupported jurisdictions and transactions blocked before payment.
3. Prepare matching USD5/15/59 inclusive Live Prices, verified account-bound
   Checkout, customer portal and signed webhook lifecycle. Do not publish old
   unbound static Payment Links as a shortcut.
4. Deploy reviewed PR only after launch gates are satisfied; verify server catalog,
   identity/profile, payment-to-entitlement and cancellation. Test-mode success
   must never be represented as a real paid Production transaction.

No public paid signup URL is approved by this audit.

## Follow-up after owner unlocked Mac

Render login was refreshed through the existing GitHub login (no new permission
grant). Dashboard and Settings confirm service srv-d7u3efpj2pic739fm8kg,
repository KP2184909/savepulse-backend, branch main, deployed commit
25cb7efa437c946d920f45e9ea6834a1d93b3e8f, Free instance in Ohio, build
`npm install`, start `npm start`, blank root directory. This supersedes the
Render repository/branch/commit NOT VERIFIED row above.

Read-only Environment inventory shows existing STRIPE_PRICE_PLUS/PRO/BUSINESS,
STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, SUPABASE_URL and
SUPABASE_SERVICE_ROLE_KEY, email/scheduler settings and WEBHOOK_SECRET. Values
remained masked. The displayed 22-variable inventory contains none of
BILLING_V2_ENABLED, BILLING_LIVE_APPROVED, BILLING_TAX_POLICY_CONFIRMED,
BILLING_DOMESTIC_VAT_ENABLED, STRIPE_EXPECTED_ACCOUNT_ID,
STRIPE_MANUAL_TAX_RATE or PUBLIC_CHECKOUT_ENABLED. No environment group is
linked. Presence of old Stripe variables does not verify mode or values.

Live Business USD59 Payment Link plink_1USZVb1NzGcGzIig9rMyZppD is Active,
monthly, Free trial=No, collect names/business names/addresses/tax IDs=No,
automatic tax=No, metadata=none. This proves it is not the no-card trial and
does not establish a compliant domestic billing profile or account binding.
Automatic tax=No alone does not establish whether a manual rate exists.

Live Event destinations lists the SavePulse Render billing webhook Active,
listening to 6 events, displayed error rate 0%. A separate Grok destination has
2 events. The event identities and recent signed payment lifecycle delivery
were not verified; a displayed 0% error rate without a known event volume is
not an end-to-end PASS. Do not modify the separate Grok integration.

Customer Portal settings load and expose invoice, customer-information,
payment-method and cancellation sections, with Portal link offering Activate
link. Section availability is not proof their saved options are enabled;
the public login link is also separate from authenticated API portal sessions.
Chrome's Stripe page subsequently stalled/turned blank during detail clicks.
No Portal/webhook edit was saved and no Live key was revealed.

Remaining: verify actual Live Price/rate/account values and Portal/event options,
prepare credential handoff where required, finish lawful tax issuance and FX
exception workflow, then deploy and run Production QA. Mac unlock resolved the
earlier lock blocker; remaining limitations must not be reported as a locked Mac.

## Read-only preflight tool

`node tools/check-billing-live.js` runs inside a trusted backend environment using
its existing environment variables. Do not put credentials in command arguments
or paste its environment into chat. The tool makes GET requests only, outputs
fixed PASS/FAIL/NOT_VERIFIED checks and never outputs provider objects or errors.
It verifies exact merchant identity before inspecting further resources, approved
USD monthly prices, the inclusive TH rate, lifecycle webhook coverage and default
Portal invoice/card/cancel-at-period-end options. Lists are paginated with bounds;
incomplete reads cannot produce a PASS.

`ready=true` has scope `configuration_only`: it is not a launch authorization and
does not validate e-Tax status, FX exceptions, database readiness, risk operations,
data distribution rights or a real Production payment. Local execution without
Live configuration correctly returned ready=false and made no provider requests.
No actual Live preflight run has been completed yet. Regression suite:162/162.

Chrome subsequently reported concurrent user changes and the extension could not
attach to Stripe. Native inspection was stopped to avoid interfering with the
owner's active work. Backend work continued without changing Live settings.

## Live Product catalog read-through

Read the actual Live Product catalog (3 active products, no next page), not only
Payment Links. Plus prod_Ub7MmvDu1du8ya has one displayed price,
price_1Tbxxi1NzGcGzIigj0m9KxUK: THB199/month, default, zero active subscriptions.
Its detail page says `No other currency options`; it is not the approved USD5
price. Pro/VIP is displayed as THB499/month; Business shows two prices. No USD5
or USD15 price is displayed in this active catalog. Archived resources were not
inspected. The Plus detail page did not expose tax behavior, so it remains
unverified rather than assumed inclusive/exclusive.

With owner permission to control Chrome again, both native coordinate input and
tab clicks failed to open webhook details. Native reported no window available;
tab control timed out/reset. Direct URL navigation and read-only page snapshots
still work. Requested one manual click on the existing SavePulse webhook row,
without Edit or revealing signing secrets, to unblock inspection. No Live
mutation or new payment occurred.

## Subsequent Live preparation through the owner-opened in-app browser

The owner opened Stripe in the in-app browser, where controls worked. The
following supersedes the earlier resource inventory and browser blocker; it
does not supersede the outstanding launch checks. No charge, subscription,
Payment Link, paid Stripe Tax service, or credential change was made.

- Live account `acct_1TbuP21NzGcGzIig` was read using Workbench's GET-only
  `stripe accounts retrieve`: charges_enabled=true, payouts_enabled=true,
  details_submitted=true, currently_due count=0. Private account fields were
  not copied into this report.
- Existing SavePulse webhook `we_1Tbybu1NzGcGzIig15mPycaa` was saved with all
  10 lifecycle events in billingLifecycle.EVENTS. Added async checkout success
  and failure, invoice.paid and invoice.payment_action_required. Existing
  endpoint URL and API version 2026-04-22.dahlia remain unchanged. Grok's
  separate endpoint was not modified. Zero deliveries is not an E2E PASS.
- Created Plus USD5/month `price_1UXMqk1NzGcGzIigg8QIVIcY` on the existing
  Plus product, and Pro USD15/month `price_1UXMsa1NzGcGzIigw2Yn8Rqb` on the
  existing Pro product. Both displayed zero active subscriptions. Original
  THB prices and product defaults remain unchanged.
- Existing Business USD59/month `price_1USZVT1NzGcGzIigFNd6xEER` was verified
  by a read-only price listing. Its tax_behavior is unspecified. The new
  Plus/Pro price UI did not explicitly set tax_behavior: do not describe those
  Price objects as having an inclusive tax_behavior. Backend gross VAT uses
  the separately validated inclusive manual TaxRate.
- Created active Thailand VAT7% manual rate
  `txr_1UXN1P1NzGcGzIigNtsHvtP5`, with calculation Inclusive, verified in
  the saved list. It is not yet attached to Production checkout. No automatic
  tax service was activated.
- Expanded the saved Portal sections: invoice history, payment-method update,
  and subscription cancellation are enabled; cancellation is at period end.
  No Portal settings change was needed. A public Portal login link was not
  activated; authenticated backend Portal sessions remain the intended flow.

Non-secret backend mapping is prepared in
`ops/savepulse-live-prepared.env.example`, with sales/approval switches false.
It has not been applied to Render. The full server-side preflight has not run
with Live credentials. This is provider configuration evidence, not a passed
Production payment, fulfillment, tax issuance or risk workflow.

Outstanding: apply reviewed backend configuration after tested deployment,
verify signing-secret/account binding and database state server-side, finish
FX publication-time/special-case and lawful tax-document delivery handling,
wire and validate risk operations before adding risk events, and complete
Production signup/entitlement/Portal QA without unauthorized real charges.
e-Tax approval remains pending as last reported by the owner; Business sales
remain disabled pending actual service/data readiness. PR10 is still draft.

## Backend risk operations prepared after provider configuration

The main server now routes the three risk event types through the durable inbox
after Stripe signature verification, before lifecycle dispatch. Duplicate events
retain one task. A one-minute worker reads at most ten due pending tasks per
batch, resolves ownership using Stripe's payment graph, and retains verified
tasks for review. Provider failures retain bounded retry state; future retries
are excluded from the due query. This workflow never automatically issues a
refund/credit note or changes a membership based on a risk webhook.

`GET /api/v1/admin/billing/risk-review` exposes at most100 review summaries with
the existing administrator authorization and no-store responses. It excludes
raw provider payloads and customer/payment details. A full100-row result is
explicitly marked truncated; this is not an exhaustive operations dashboard.

`GET /api/v1/admin/billing/live-preflight` uses the same restricted GET-only
reader as the CLI and returns sanitized configuration checks. The required
webhook coverage is now13 events (10 lifecycle plus3 risk), so the currently
configured10-event Live endpoint intentionally fails that readiness check.
Add the risk subscriptions only after the receiver/worker is deployed and
verified. Do not announce that all13 are configured or Production tested.

Validation:166/166 automated tests passed, including actual local HTTP signature
rejection, durable duplicate risk processing, no entitlement change, unauthorized
admin denial, resumed worker ownership resolution and bounded due queries.
Sandbox ESM packaging and git diff checks passed. These are local test results;
the new operations and preflight endpoint are not deployed to Production yet.
