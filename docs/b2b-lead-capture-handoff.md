# SavePulse B2B lead capture — activation handoff

Status: implementation tested locally; production capture/CRM/email must pass the acceptance checks below before promotion. No new prices, subscriptions or paid services agreed.

## What was changed
- B2B page only: company, country, business email, position, persona, problem, interest and explicit enquiry consent.
- No calculator figures or documents uploaded. Separate English Business Privacy Notice and thank-you page.
- Netlify Forms enabled through the connected project API. Honeypot and provider spam filtering retained.
- Fix: invalid or empty calculator inputs clear the printable/copyable result rather than leaving a stale result usable.
- First-touch channel supports `utm_source=linkedin`, `partner`, `email`, `youtube`; otherwise Website.
- Signed Netlify `formSubmitted` event forwards to an owner-controlled Apps Script. No public client CRM secret.
- Google CRM: new WebsiteLeads, LeadEvents, GrowthFunnel tabs; original tabs and existing records retained.
- Apps Script uses a script lock, normalised email dedupe, company keys, request-id idempotency, formula escaping, legacy suppression and immutable existing stages.
- One English acknowledgement per new unsuppressed inbound email; owner notice per unique request. No cold outreach. Sending/failed email states require review; blind resends are prohibited.

## Activation requiring the owner account
1. Open the existing CRM and Extensions → Apps Script. Copy `integrations/google-apps-script/Code.gs` and its manifest to a dedicated script project. Do not replace another existing script.
2. Set private Script Properties `B2B_CRM_SPREADSHEET_ID` to the existing CRM spreadsheet ID and `B2B_OWNER_EMAIL` to the connected owner Gmail address. Generate a strong random shared secret; set Script Property `B2B_CRM_SECRET`. Never put it in the spreadsheet, repository, browser form or chat.
3. Authorise the script to access Sheets and send email from the deploying account. It does not request permission to read your Gmail mailbox.
4. Deploy a Web app, executing as the owner. The endpoint accepts only timestamped HMAC-signed POSTs; GET exposes no lead data. The owner must approve the service authorisation/public endpoint setting.
5. In Netlify runtime environment settings set `B2B_CRM_ENDPOINT` to the deployed `/exec` URL and `B2B_CRM_SECRET` to the same secret; do not change membership, pricing, daily-email or checkout environment settings.
6. Redeploy the reviewed repository revision. If automatic builds are ignored, trigger a deploy from the Netlify dashboard. Never replace the full site with just the B2B folder.
7. Add a Netlify form email notification to the connected owner Gmail address as a fallback for this form. Inspect both verified and spam submissions if the test does not appear. The connected Netlify tools do not expose notification creation or a deployment trigger.
8. Submit one clearly marked QA enquiry using the owner's real business email. Check Netlify record, WebsiteLeads row, LeadEvents receipt, Gmail acknowledgement and owner notice. Submit same request-id again: no extra row or email. Submit a new request-id/same email: existing stage preserved and owner notified, no duplicate acknowledgement. Do not remove suppression to make a test pass.
9. Check Desktop, an actual mobile viewport/device and Print/PDF page fit. Compare main consumer homepage, API health, membership and unsubscribe with baseline. Only then change GrowthFunnel status from DRAFT to ACTIVE.

## Failure recovery and privacy
Netlify retains submissions independently of the CRM forwarder. A missing configuration/failed relay is a recoverable integration error, not successful CRM delivery. Review Netlify form submissions and retry their original request IDs after fixing configuration. LeadEvents idempotency prevents duplicate CRM rows/normal sends on repeated delivery. Ambiguous email Sending statuses require Gmail verification before any manual resend. Do not log raw leads/secrets. Review inactive enquiries after 12 months and handle privacy requests across Netlify, Sheets and email; do not automatically delete the historical CRM. Provider quotas/costs must be confirmed before volume increases.

## Funnel definitions
GrowthFunnel covers the WebsiteLeads cohort only, not all historical members. Company key is self-reported normalised company + country, requiring legal-identity review before counting paid companies. Contact dedupe uses email; multiple contacts can belong to one company.
- Website companies: distinct nonempty company key.
- Human replies: human reply evidence date; automatic acknowledgements do not count.
- Discovery calls: completed-call evidence date; demo request is not a call.
- Pilots: actual pilot start evidence date; interest is not a pilot.
- Active paying: billing evidence reference, billing verification date, active paid YES and Paid Access Through >= today, distinct company key.
- Lead→Paying: active paying / distinct website companies. Empty with no denominator.
Stage is workflow state, not conversion evidence. Existing Dashboard is retained; its historical paying count is not reconciled with billing. Global company-level billing integration remains pending. Never count the same legal company twice across old and new cohorts.

## QA evidence
Live baseline desktop UI: Q=100, supplier price 100→110, FX 35→36, fixed costs 0 gives budget 350,000; updated 396,000; supplier variance 35,000; FX variance 11,000; total 46,000. At locked FX 100%, updated 385,000; FX variance 0. Print control clicked, but exported PDF rendering is not yet verified. Mobile device/viewport QA remains pending.
Local tests cover calculator reconciliation/locked FX, empty-input stale-print prevention, HMAC relay, duplicate events, repeated email/stage preservation, legacy suppression, formula injection and consent rejection. Existing backend suite is also run. Local mocks do not prove Netlify event delivery, Apps Script OAuth or Gmail delivery.

Official implementation references: https://developers.google.com/apps-script/guides/web ; https://developers.google.com/apps-script/reference/mail/mail-app ; Netlify connected coding context for platform formSubmitted handlers.
