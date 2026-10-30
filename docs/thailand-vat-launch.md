# SavePulse Thailand VAT launch basis

Reviewed 2026-10-29. This records researched rules and implementation boundaries, not a claim that all customer transactions have identical treatment.

User confirms Thailand VAT registration (PP20); approved monthly totals USD 5/15/59 include applicable VAT. No accountant letter is a software prerequisite.

## Domestic ordinary taxable service

The official government announcement extends the combined VAT rate of 7% through 2027-09-30. Treat ordinary taxable domestic service at 7%, subject to the seller's actual registered activity and transaction facts. Inclusive calculation: VAT = gross * 7/107; net = gross - VAT. Stripe currency rounding and THB tax-document rounding must be recorded separately; do not add 7% to the approved gross prices.

Source: https://www.thaigov.go.th/th/news/166956

## Overseas service

Do not infer zero-rating from a foreign card, email, billing country or foreign incorporation alone. Revenue Department Notification 105 as amended requires the relevant service to be used abroad and evidence of payment in the registered supplier's name. Mixed domestic/overseas use requires treatment of the respective portions; unsupported cases need review rather than a default zero rate.

Source: https://www.rd.go.th/3288.html

Destination-country obligations are independent of Thai export VAT. For example, EU B2C electronic services are generally taxed where the customer resides. A Thai VAT registration does not establish worldwide compliance.

Source: https://taxation-customs.ec.europa.eu/taxation/vat/vat-directive/place-taxation_en

## Tax invoice and FX

Stripe USD invoice/receipt must not automatically be labelled a compliant Thai tax invoice. Required Thai tax invoice information includes seller name/address/tax number, customer name/address, document number/date, service description/value and separately stated VAT. Relevant branch and customer tax-identification particulars must also be supported. Unless an applicable approval exists, show tax-invoice amounts in THB. Preserve the actual selected lawful FX method, rate, source and tax-point date; do not silently select a new method if the company already uses one.

Sources:
- https://rd.go.th/5208.html (section 86/4)
- https://www.rd.go.th/3568.html
- https://www.rd.go.th/40711.html

## Fast launch boundary and remaining facts

Prepare a domestic ordinary-service path first; overseas checkout must not simply reuse a blanket Thai rate or zero rate. A domestic-only product restriction must be enforced before payment, not by charging foreign customers and rejecting fulfillment afterward.

Still need the actual VAT-registered seller name/address/tax number/branch, whether that same entity is the Stripe merchant, and the company's existing FX/tax-invoice process. Do not invent these facts or require an accountant letter merely to supply them. No paid tax service is authorized.

Stripe sandbox GetTaxSettings returned country unsupported. Use manual Tax Rates where applicable; do not enable automatic_tax or a paid Stripe Tax subscription. Connector operation discovery did not expose manual Tax Rate creation in this session; Dashboard fallback remains available. No tax settings or live collection were changed during this research.

## Seller facts confirmed by owner — 2026-10-29

Server-side seller profile is in config/billing-seller.json. Owner confirms legal name, head office, address, 13-digit tax number matching PP20, and that the same legal entity is the Stripe merchant. Profile is preparation data; it does not activate tax invoices or change Stripe. Existing Business invoices endpoint tracks customers' procurement exposure and is not a seller tax-invoice issuance system. A compliant seller tax-invoice workflow and established FX method are still required.

## Draft implementation — 2026-10-29

Owner reports no prior USD tax-invoice FX method. Added src/thaiTaxInvoiceDraft.js and administrator-only POST /api/v1/admin/billing/tax-invoice-draft. The server retrieves a paid USD invoice from Stripe and checks mode, subscription, verified account binding, customer and paid Checkout before passing it to the draft builder. Posted payment amounts cannot override the provider invoice.

The draft builder is deliberately scoped to ordinary domestic TH service use during the verified 7% period. It converts USD cents to THB satang with integer arithmetic, splits inclusive VAT, preserves rate method/source/date and tax-point date, and escapes HTML. Foreign/mixed use, unpaid invoices, missing customer details, undocumented FX and unreviewed rate periods fail validation. No issue number, persistence or customer email is created. No official tax invoice is represented as issued.

Required fields: invoiceId; customer.name/address/country/serviceUseCountry and taxId/branchCode when applicable; fx.method/sourceUrl/rateDate/taxPointDate/thbPerUsd/selectionReason; treatment=th_domestic_standard_7_inclusive. FX is an administrator-supplied documented rate, not yet fetched or independently verified by this code. Do not treat draft generation as compliant completed issuance. Draft endpoint is not yet deployed to Production or the Edge sandbox wrapper.

Validation: 123 automated tests pass, including paid-source ownership, administrator access, inclusive arithmetic and missing/invalid FX or customer cases. Full issuance still needs authoritative FX retrieval/evidence, durable unique invoice numbering and storage, tax-point exceptions, credit notes/refunds, and customer delivery. No live billing or tax changes made.

## Durable ledger implementation — 2026-10-29

Added taxDocumentLedger.js, using the existing CAS storage interface. A single atomic write allocates a sequential monthly number and stores the document; repeat/concurrent invoice requests reuse the same document. Test and live namespaces and document prefixes are separate. Source adapter must independently verify payment, recipient and FX evidence. Delivery leases, provider idempotency keys and a retry-retention boundary prevent blind duplicate mail after ambiguous sends. This module has not been connected to Production or an actual issuance source/mailer yet; no genuine customer tax invoice was issued.

127 automated tests pass. Tests cover concurrent issuance/restart, mode separation, failed email retry and duplicate suppression. BOT API connection is pending owner signup through the official portal. No new paid services or Production state changed.

## BOT connection verified — 2026-10-29

Owner registered BOT API app 5995 (SavePulse Tax Invoice FX), obtained approved Exchange Rates Plan access and entered the Token directly into isolated Supabase Secret BOT_EXCHANGE_RATE_API_KEY. No token was placed in source or chat.

Official endpoint/schema checked in the developer portal: https://gateway.api.bot.or.th/Stat-ExchangeRate/v2/DAILY_AVG_EXG_RATE/ ; query start_period, end_period, currency; Authorization header is the raw Token, not Token Hash. Documented publication time is 18:00 Bangkok on business days.

Deployed isolated savepulse-bot-fx-probe v6 verified HTTP 200 and USD buying_transfer for 2026-10-28: 33.6482000 (normalized exact value 33.6482). Evidence hash da4504d4123e21791418bb802c7334a938db2237067914b09c8bdbbc66bc2086 stored in RLS scheduler_state using the tested createBotTaxFx adapter. Raw rate precision is preserved; trailing zero normalization does not round. No midpoint or prior-day fallback occurs if the requested tax-point date is missing. Probe permits only the fixed QA date, is rate-cached and expires after 2026-10-29 UTC; it is not a public market-data feed.

129 automated tests pass. This verifies actual BOT connectivity and exact-date FX evidence persistence, not full issued customer tax invoices or Production billing. Issuance integration, customer billing details, manual inclusive Stripe VAT setup and live configuration are still pending.

## Subsequent correction and implementation boundary

Read docs/tax-document-qa.md before relying on earlier exact-date-only notes. RD P.132/2548 distinguishes reference announcement and observation dates; tested sandbox selection uses the documented prior business closing rate for supported ordinary daytime receipts, with explicit review for exceptional timing/month-end/special closures and calendar years outside 2026. Test document and durable retry worker are now verified in the isolated sandbox. No automatic genuine e-Tax issuance is enabled. Seller enrollment/signing/time-stamp or paper fulfillment, exceptional FX policy and actual refund-to-credit-note integration still require completion.
