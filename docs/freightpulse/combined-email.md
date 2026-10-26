# FreightPulse combined subscriber email

Owner decision, 2026-10-26: all FreightPulse subscribers receive the same full shipping-route dataset in one email. Dashboard route preferences must not narrow email coverage. FreightPulse entitlement remains independent of SavePulse plans; “package 5” is the owner's product label, not a replacement SavePulse plan ID.

The digest includes all six regional container routes and separate BDI/ZIM context. Stale, missing and unknown-freshness data remain explicit. It does not substitute fictional advice for unavailable market data. Email can be disabled by the subscriber. Timing/cadence awaits the owner's choice; no production schedule was enabled.

`src/freightDigestEmail.js` renders escaped HTML and plain text with Demo/Test labels. The sandbox worker aggregates one full-route message per company/report batch instead of looping selected routes. A durable lease, stable idempotency key, frozen retry payload and delivery history prevent duplicate batches across retries/concurrent workers. Access and email preference are rechecked before sending. Owner-approved Pine rules remain blocked from worker email delivery pending live-feed readiness; only the explicitly requested static Demo sample was sent.

Validation: 145 local tests PASS, including all-route coverage with two signals, route preferences not narrowing the digest, stale window suppression, HTML escaping, live-template rejection, concurrent delivery and exact retry payload preservation.

A single Demo sample was sent through the connected SavePulse Gmail account to savepulse.cloud@gmail.com only. Gmail returned message/thread ID `1a176fa9bcef339e` with SENT and INBOX labels. This proves the requested sample send, not automated provider/scheduler delivery or inbox placement for customers. No marketing/CRM or invitation workflow was changed.

Preview artifact: `/freightpulse/email-demo.html`, clearly marked Demo, generated from the dated static report fixture. No current market claims or actual member data appear in it.
