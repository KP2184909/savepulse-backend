# Tax document pipeline QA — 29 October 2026

Edge version 10 ACTIVE. Scope: PR #10, isolated Supabase `sktzydyiwqylpstxjicf`, Stripe SavePulse sandbox only. No live charges, refunds, customer emails, production deployment or e-Tax filing.

## Corrections to earlier notes

Earlier exact-payment-date-only BOT selection was too restrictive. RD P.132/2548 section 5 distinguishes the reference announcement date from the observation date, including business-day/holiday examples. The selected T/T buying method remains unchanged. Ordinary supported daytime receipts now select the documented prior business closing rate, then require that exact observed date from BOT; missing data never triggers an arbitrary older-rate search.

Sources:
- https://www.rd.go.th/28635.html (section 5 examples; exceptional early-morning/month-end cases are explicit)
- https://www.bot.or.th/content/dam/bot/fipcs/documents/FPG/2568/ThaiPDF/25680162.pdf (national 2026 bank holidays, pages 2–3)
- https://www.bot.or.th/th/news-and-media/news/news-20260713.html (special October 16 closure)
- https://www.rd.go.th/5208.html (sections 86/4 and 86/10)

`taxFxPolicy.js` deliberately puts early-morning, month-end, special-closure dates and years outside the reviewed 2026 calendar into REVIEW, rather than guessing. This candidate policy is deployed to test only. Those cases and the ongoing calendar update process remain launch requirements, not claimed automated coverage.

## Verified on deployed sandbox

- Dedicated worker rejects unauthenticated requests with HTTP 401.
- Authenticated database `pg_net` request #1 returned HTTP 200, processed=1, states=[issued]. This exercised real paid Stripe invoice ownership, saved billing profile, BOT evidence and durable document allocation.
- Document `TEST-SP-TI-202610-000001`: USD 5.00; BOT USD T/T 33.6482, observation 2026-10-28, receipt 2026-10-29. THB gross 168.24, net 157.23, VAT 11.01. TEST ONLY, not valid for tax filing.
- Second authenticated worker request #2 returned HTTP 200, processed=0. Database still contains exactly one document and nextNumber=2.
- Actual Cron invocation at 2026-10-29 08:12 UTC succeeded; corresponding HTTP request #3 returned 200, processed=0. Temporarily used a one-minute test schedule, then restored the persistent 15-minute schedule.
- Sandbox Cron retry schedule active every 15 minutes. Pending/retry/expired-lease jobs resume; provider outages back off and unresolved jobs enter REVIEW after 24 hours. One run handles at most 20 jobs. Worker credentials are generated within the database, stored only in the RLS private state row, never returned or committed. Anonymous/authenticated roles cannot read state or the HTTP request queue.
- Security advisor has no warning/error findings; INFO RLS-without-policy findings are intentional for service-role-only tables. https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy

## Automated coverage

139 PASS after final fencing and live-gate edits. Coverage includes parallel issuance, duplicate refund requests, partial-refund totals conserving the original THB/VAT amounts, worker restart/backoff/lease fencing, provider error sanitization and explicit live-issuance gating.

Credit note logic uses the original invoice FX, immutable original data and a trusted succeeded-refund source plus a reviewed service-cancellation reason. Cancellation alone, failed refunds, FX movements and excess refunds cannot issue a credit note. The Edge wrapper intentionally does not expose a refund mutation or automatic live credit-note issuer. Actual Stripe refund → credit note integration remains NOT VERIFIED; these cases were tested with clearly labelled fixtures only.

## Remaining before genuine tax documents

- Confirm seller's e-Tax enrollment and approved signing/time-stamp delivery process, or implement the company's valid paper workflow. An ordinary HTML/PDF emailed by our app is not automatically an authorized e-Tax invoice. Official guide: https://www.rd.go.th/fileadmin/user_upload/eTax/manual_time_stamp_010666.pdf
- Review exceptional FX cases and a maintained calendar; the current implementation fails closed with visible REVIEW jobs.
- Chrome desktop QA completed after owner unlocked the Mac: authenticated membership page displayed TEST-SP-TI-202610-000001 in a sandboxed iframe; seller/buyer identity, service, invoice reference, net 157.23, VAT 11.01 and gross 168.24 THB were present. Screenshot inspection confirmed readable buyer details, amount rows and FX evidence without overlaps in the inspected desktop viewport. Mobile/print layout remains NOT VERIFIED.
- Complete succeeded Stripe refund ownership and credit-note review/delivery integration.
- Customer email delivery is step 2, still not configured in this sandbox. No test document email was sent here.

Live issuance/delivery remains disabled in code, independently of the paid-checkout flag. Sandbox proof does not imply Production readiness.

## Owner enrollment follow-up

Owner confirms no prior e-Tax enrollment. Opened the official RD Time Stamp application from https://www.rd.go.th/27659.html. Owner gave action-time approval to accept the agreement and prepare form ก.อ.01. The official site subsequently confirmed the application was recorded, pending email verification and signed-document upload by 2026-11-09. Downloaded the official one-page application PDF and checked its company tax ID matches the owner-confirmed seller profile. Contact details and the application PDF are not committed.

Required owner actions: verify the official email securely; sign/stamp form where applicable; provide corporate certificate issued within six months and signatory identification through the official upload flow. This is an application record, not approval to issue e-Tax documents. Live issuance remains disabled.

### Paid-invoice snapshot safeguard — 2026-10-29

Tax draft eligibility now reads `invoice.default_tax_rates` rather than the subscription’s mutable defaults. Missing, extra or mismatched tax rates, exemptions, discounts, shipping, outstanding balances, differing paid/total amounts and existing credit notes require review instead of entering the simple domestic invoice path. Reference: https://docs.stripe.com/api/invoices/object . This is a conservative eligibility gate, not complete tax reconciliation.

Local verification: 140 tests passed, including invoice snapshot persistence after subscription defaults change and nine unsupported invoice variants. This change has not been deployed or verified against a fresh Stripe sandbox invoice. Existing sandbox-issued documents are unchanged; no Production changes or payments were made.

### Sandbox deployment verification — 2026-10-29

Deployed `savepulse-billing-sandbox` version 11 only to isolated project `sktzydyiwqylpstxjicf`. Added a worker-credential-protected, read-only `auditLatestInvoice` operation. It validates the existing authorized test mailbox’s latest Stripe invoice without issuing documents or sending email. Database-side pg_net request 37 returned HTTP 200, `verified:true`, invoice `in_1UVmkd0su7h1AsZTJvc2bKrg`, USD 500 cents, documentsCreated 0 and emailsSent 0. An unauthenticated request was rejected with `authentication_required`. Existing retry cron remains active at `*/15 * * * *`. Local suite remains 140/140 passing. No new Checkout/payment was created. Production remains unchanged.

Remaining launch gates: lawful tax-document fulfillment/enrollment; exceptional FX-date review; actual Stripe refund-to-credit-note integration and risk-event reconciliation; sandbox tax-document email delivery; live account/price/webhook/portal verification; commercial data-use scope. The application being recorded or email-verified is not e-Tax approval.

### Risk-event inbox — sandbox only, 2026-10-29

Added a durable review inbox for signed `charge.refunded`, `charge.dispute.created` and `radar.early_fraud_warning.created` events. Records store event/object IDs and mode/account only, not raw customer/payment payloads. Unique event keys survive restarts and concurrent duplicate delivery. Storage failure propagates so Stripe can retry. No entitlement change or credit note is triggered by receipt alone.

Local suite: 144/144. Deployed isolated Edge version 12. A clearly labeled synthetic QA refund (`evt_savepulse_qa_risk_20261029`, nonexistent charge `ch_savepulse_qa_nonexistent`) sent with a server-side signature returned HTTP 200 `risk_review_queued` (pg_net 38); repeat returned HTTP 200 `duplicate_risk_event` (39). Database confirms exactly one pending QA task with rights unchanged and no credit note. An unsigned request returned `invalid_stripe_signature`. No real Stripe refund or customer change occurred.

This is receipt/deduplication verification, not end-to-end refund reconciliation. Stripe endpoint subscriptions for these three events have NOT yet been updated; real-event delivery, trusted charge-to-invoice ownership resolution, operator review and legal credit-note fulfillment remain pending. Do not enable Production sales based on this inbox alone.

### Read-only risk ownership resolution — 2026-10-29

Implemented charge/dispute/fraud-warning retrieval, charge PaymentIntent traversal, complete paginated `invoice_payments` lookup, and bound paid subscription invoice verification. Reference: https://docs.stripe.com/billing/subscriptions/webhooks#refund-events . No ownership inference from webhook email/metadata. Multiple invoices require allocation review. Risk transport routes are GET-only. Durable CAS reconciliation persists verified evidence separately from entitlement/credit-note decisions, with bounded retries and sanitized errors; after ten failed attempts it requires manual review.

Local suite 151/151: paginated and duplicate invoice links, dispute/fraud charge resolution, mode/account/customer/payment mismatch, missing/unbound invoices, pagination failure, concurrent reconciliation, retries and provider-error sanitization. Isolated Edge version 13 deployed. Worker request 41 returned HTTP 200, risksVerified 0 for the deliberately nonexistent QA charge. QA row remained ownershipVerified false, rights unchanged, pending_review, attempts 1. This proves fail-closed behavior only, not a real refunded-charge success case. No new tax documents, emails or Stripe refunds were initiated.

Still pending: subscribe sandbox Stripe endpoint to risk events; successful real sandbox refund traversal; review UI/operations, refund allocation and credit-note authorization; legal tax fulfillment and delivery. Production is unchanged.
