# Live subscription inventory

Run node tools/check-live-subscriptions.js inside the trusted server environment.
It makes only GET /account and GET /subscriptions requests, verifies the expected
merchant before listing, uses status=all and follows pagination up to100 pages.
Only completion, counts by status and a migration-review indicator are printed.
No customer names, emails, subscription IDs, provider objects or secrets appear
in output. Partial/failed/mixed-mode/duplicate pages cannot report total0.

This is a read-only command, not a new HTTP route or a startup task. It does not
change checkout, member access, webhooks, tax, email, schedules or settings.
Any nonempty inventory requires review, including canceled subscriptions; it is
not an automatic authorization to migrate, cancel or open new sales. An empty
Stripe inventory does not prove the local legacy member store has no paid users.

Validation:109/109 main tests, including pagination/status coverage, strict empty
completion, account mismatch and sanitization. Production results are recorded
separately after execution. No paid requests or email sends are part of this QA.
