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

### Actual Stripe sandbox refund and credit-note integration — 2026-10-30

Reverified connector account `acct_1TbuPE0su7h1AsZT`, livemode false. Updated ONLY webhook `we_1UVXZx0su7h1AsZTNnTXlvBq` to include charge.refunded, charge.dispute.created and radar.early_fraud_warning.created, preserving lifecycle events and URL. Existing charge `ch_3UVmkd0su7h1AsZT0sB3JONp` was USD 500 cents, succeeded, unrefunded, customer `cus_VWqRWC6rGK1vXF`, authorized test mailbox. Created partial sandbox refund `re_3UVmkd0su7h1AsZT0lrYTwsf` for 100 cents, succeeded. Actual Stripe event `evt_3UVmkd0su7h1AsZT0fg03DoI` arrived in durable inbox; worker 82 HTTP 200 verified its ownership through PaymentIntent and invoice `in_1UVmkd0su7h1AsZTJvc2bKrg`.

Added read-only refund verification and wired ledger refundSource to a service-role-only review record. Worker-authenticated credit-note operation requires that record; request 84 HTTP 422 `credit_reason_review_required` verified refusal without review. Risk/refund API routes remain GET-only in backend.

For a clearly labeled TEST cancellation scenario, canceled sandbox subscription `sub_1UVmkf0su7h1AsZTTLSuys8M` with invoice_now false and prorate false. Recorded sandbox integration QA review (not legal approval). Edge version 15 issued `TEST-SP-TI-202610-000001-CN-001` from the verified refund (request 85 HTTP 200), gross THB 33.65, VAT 2.20. Repeated request 86 returned the same number; DB confirms exactly one credit and original gross 168.24 unchanged. Subscription cancellation webhook persisted canceled state. No live payment/refund/member/tax document changed, no tax-document email sent.

Local tests: 152/152. Actual sandbox refund-to-invoice-to-TEST-credit-note verified; disputed/fraud event success paths remain fixture-tested only. Credit-note review is worker/database controlled, no operator UI yet. Tax-document delivery still lacks isolated mailer configuration; production legal issuance/e-Tax approval and data-use launch scope remain pending.

### Tax email retry worker — 2026-10-30

Added a bounded invoice-document delivery worker to the isolated scheduled endpoint. Missing mailer configuration does not consume attempts. It only accepts server-read TEST ledger documents addressed to savepulse.cloud@gmail.com, skips sent/leased/backoff entries, and continues after individual failures. Ledger retry time persists across restart with 1-minute exponential backoff capped at 1 hour; existing 23-hour provider-idempotency review gate remains. UI now distinguishes provider acceptance from actual inbox delivery. Credit-note delivery is not yet included.

Local suite 156/156. Edge version 16 deployed only to sandbox. Worker 94 was invoked to check missing-configuration behavior. Resend existing account is signed in; a separate Sending access key form was prepared, but no key created or copied by agent. User credential entry is pending; no actual tax email sent or inbox receipt verified. Production remains unchanged.

### Actual tax-document inbox delivery — 2026-10-30

User saved the isolated Resend key through the secure dashboard. Added a sandbox-only default sender `SavePulse Sandbox <alerts@savepulse.cloud>` (same domain as existing SavePulse sender; Production key unchanged). Edge version 18 deployed. Worker 96 HTTP 200: configured true, accepted 1, failed 0. Ledger records one attempt and provider acknowledgment `01a18b0b-340c-7e99-ab98-59251b5ee7d2`.

Gmail connector for savepulse.cloud@gmail.com independently found exactly one matching message, ID `1a18b0b3bbd6446f`, labeled INBOX, received 2026-10-30 04:22:10 UTC / 11:22:10 Asia/Bangkok. Subject `[TEST] SavePulse tax document TEST-SP-TI-202610-000001`. Snippet includes TEST ONLY / NOT VALID FOR TAX FILING / NO REAL PAYMENT. No attachment: this verifies HTML email delivery only, not PDF/A-3, digital signature, time stamp, or legal electronic issuance. Worker 97 repeated HTTP 200 accepted 0; no duplicate send. Local suite 156/156 remains passing. Credit-note email delivery and Production remain unverified/not enabled.

### Credit-note inbox delivery — 2026-11-02

User reports RD supporting documents uploaded; official approval remains pending and has not been independently confirmed. This does not enable live issuance.

Added separate per-refund delivery state for issued TEST credit notes. Invoice and each credit have independent leases, retries and provider idempotency keys; sending a credit never resets the original invoice's delivery. Local tests 158/158 cover original sent + pending credit, retry/restart independence, stable/distinct keys and duplicate suppression. Edge version 19 deployed only to isolated sandbox.

Worker 399 HTTP 200 accepted 1, failed 0. Gmail for authorized test mailbox independently found INBOX message `1a19b2e1beae48ab`, subject `[TEST] SavePulse tax document TEST-SP-TI-202610-000001-CN-001`, received 2026-11-02 07:34:11 UTC / 14:34:11 Asia/Bangkok. HTML contains TEST ONLY / credit note / NOT VALID FOR TAX FILING / NO REAL PAYMENT. No attachment. This verifies HTML test credit-note delivery, not legal e-Tax, PDF/A-3 or time stamp. Repeat worker 400 verifies no duplicate acceptance. Production unchanged.

### Time Stamp sender authorization — 2026-11-24

The company activated its Revenue Department Time Stamp account and registered `savepulse.cloud@gmail.com` for head-office branch `00000` on 23 November. The mailbox received ETDA's ready-to-use notice from `csemail@etax.teda.th` on 24 November at 01:30 Bangkok time. Gmail reported DKIM and SPF pass, and the body explicitly authorizes that address for the live e-Tax Invoice by Email service. See the [ETDA confirmation in Gmail](https://mail.google.com/mail/u/?authuser=savepulse.cloud%40gmail.com#all/1a209ac1dd24dc7d). This establishes sender eligibility. SavePulse has yet to verify a document accepted by ETDA, receipt and retention of the stamped files, or live customer fulfillment.

The [Revenue Department Time Stamp standard](https://www.rd.go.th/fileadmin/user_upload/tortor/standard/FP-02-2566_e-Tax_Invoice_by_Time_Stamp_V01.00.0000.pdf) specifies PDF/A-3 and a maximum file size of 2 MB. The approval email specifies one buyer address in To, the production Time Stamp address in CC, and a bracketed subject. A standard invoice issued on 24 November 2026 would use the date segment `[24112569]` and type segment `[INV]` followed by its real document number. The existing synthetic layout sample omits taxpayer IDs and must stay out of the production channel.

The [ETDA UAT instructions](https://www.etda.or.th/getattachment/Our-Service/Digital-Trusted-services-Infrastructure/TEDA/ETAX/Information/CONTACT-US/%E0%B8%95%E0%B8%94%E0%B8%95%E0%B9%88%E0%B8%AD%E0%B9%80%E0%B8%A3%E0%B8%B2/eTax_Email_instruction_to_register_email_atTest_env_v1-0-%281%29.pdf.aspx?lang=th-TH) describe separate enrollment and a separate test CC. The inquiry for current UAT access and file requirements was [sent to ETDA](https://mail.google.com/mail/u/?authuser=savepulse.cloud%40gmail.com#all/1a206d2d28158d61). No reply was found in the SavePulse mailbox on 26 November. No test invoice was sent to ETDA or a customer, and there was no change to paid-checkout or live issuance settings.

The synthetic layout sample initially failed veraPDF 1.30.4 because the file trailer lacked file identifiers. After adding them, it passed the PDF/A-3b validation profile. The file is 49,443 bytes, with identical extracted text and rendered pixels before and after the fix. This verifies the sample's PDF format only. The sample is fictional, omits tax IDs, and has not been accepted or stamped by ETDA.

### Generate an offline invoice from the tax job

Run from the backend checkout with Node.js, Python 3, Chrome or Chromium, and the [veraPDF CLI](https://docs.verapdf.org/install/). Install the Python packages into a local virtual environment. Pass `--chrome /path/to/chromium` or `--verapdf /path/to/verapdf` if either tool needs an explicit path.

```sh
python3 -m venv /tmp/savepulse-tax-qa-venv
/tmp/savepulse-tax-qa-venv/bin/python -m pip install 'pikepdf==9.11.0' 'Pillow==11.3.0'
/tmp/savepulse-tax-qa-venv/bin/python tools/export-tax-invoice-qa.py /tmp/SavePulse-TEST-invoice.pdf
```

The tool reuses the tax draft builder, job, ledger, and HTML template. It processes a fictional domestic USD 39 paid invoice with an in-memory store, checks that repeating issuance returns the same number, and exports the PDF only after veraPDF accepts the PDF/A-3b profile and the output meets the 2 MB limit. The sample uses fictional identities and an FX fixture. Keep it as local QA evidence. Confirm ETDA's required UAT sender and fixture details before preparing an attachment for their test mailbox.

### Prepare the email for a reviewed invoice

```sh
/tmp/savepulse-tax-qa-venv/bin/python -m pip install 'PyMuPDF==1.26.5'
/tmp/savepulse-tax-qa-venv/bin/python -B tools/etax_email.py /tmp/SavePulse-TEST-invoice.pdf /tmp/SavePulse-TEST-invoice.eml
PYTHONPATH=tools python3 -B -m unittest discover -s tests -p 'etaxEmailTest.py'
```

Preview uses reserved addresses and preserves the original PDF bytes in one attachment. After ETDA confirms enrollment and fixture details, `--mode uat --from <registered-uat-mailbox> --to <controlled-test-buyer>` prepares a draft addressed to the UAT service. For a reviewed, actual SavePulse invoice, `--mode live --from savepulse.cloud@gmail.com --to <buyer-email>` prepares a draft addressed to the production service. The operator confirms the issue date and buyer against the invoice and uses the authorized mailbox for delivery. This tool accepts new invoices in the SavePulse layout and creates an unsent .eml file. It does not issue documents or enable checkout.

The [Revenue Department guide](https://www.rd.go.th/fileadmin/user_upload/eTax/manual_time_stamp_230167.pdf#page=31) specifies the bracketed subject and single buyer and describes retaining the reply, stamped PDF, and Time Token. Verify the returned timestamp before marking delivery complete. As of 26 November the public production billing catalog reports disabled, and the automatic return and retention of stamped files is still unverified.

### Stripe Live and tax draft check — 2026-11-26

The production Plans API and Stripe Live both display USD 5 / 39 / 59 per month. The USD 39 / 49 / 69 revision is separate. The Stripe dashboard shows the current Render webhook destination enabled for all 13 lifecycle and risk events, including `invoice.paid`. The overview showed zero deliveries this week, so the configured event list does not establish that a signed Live request was accepted. The public catalog still reports disabled and the no-card trial is ready.

After the owner signed in, Render showed the matching SavePulse merchant, Thai inclusive 7% VAT ID, and USD Plus and Business price IDs. The saved legacy Pro ID resolves to the USD 39 ID in deployed code. Billing V2 and the webhook queue are enabled. Public checkout, Live approval, the tax policy confirmation, and Business checkout are disabled. No `BOT_EXCHANGE_RATE_API_KEY` was listed for Render. The isolated Supabase sandbox has its own BOT secret.

Production Supabase recorded a scheduled worker HTTP 200 at 16:55 Bangkok time and a recent Live heartbeat. No unresolved or completed lifecycle queue entries were found. This verifies scheduled worker access and an empty queue. A signed payment-to-entitlement Live transaction still needs verification.

The private Live tax draft route now derives totals and buyer details from the bound, paid Stripe invoice and uses the BOT buying-transfer rate selected for that tax point. It retains rate evidence in the draft and rejects unsupported domestic VAT context or missing exact-date FX evidence. This is a draft and cannot allocate an invoice number or send an email. The TEST endpoint behavior is preserved. No Stripe resource, Render variable or production checkout setting was changed.
