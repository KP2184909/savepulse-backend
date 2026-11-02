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
