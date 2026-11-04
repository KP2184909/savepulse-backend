# Closed-sales lifecycle and SMTP rollout — 2026-11-03

Found a deployment blocker in draft PR10: requireEnabled also required Live
sales/tax approval, so disabling new sales would prevent signed subscription
events and existing-member status/Portal reads. Moved sales approval gating to
Checkout creation. The catalog remains disabled when Live sales, tax policy or
domestic VAT approval is missing. V2 enablement, exact account verification,
identity, bound session/subscription graph and signature checks still apply.

A virtual Live-mode provider fixture verifies existing paid access is retained,
Portal creation works, new Checkout is denied without provider calls, renewal
cancellation preserves paid access until applicable, and subscription deletion
returns Free even while new sales remain closed. No Live payment or subscriber
was created by this fixture. The membership script now refreshes authenticated
status even when the sales catalog is closed, so it can display an existing
member's Portal controls. Browser E2E for this closed-sales UI remains pending;
JavaScript syntax was checked, not represented as browser acceptance testing.

Combined draft regression suite:170/170 after merging SMTP security PR12.
Sandbox billing version22 ACTIVE; readiness test/isolated/configured and
liveSales=false. Authenticated worker request496 HTTP200, delivery accepted0,
failed0, no new tasks processed. These are sandbox runtime checks, not Live
closed-sales lifecycle E2E. The replacement remains undeployed to Production.

Separately merged/deployed PR12 as978969e8f5106e6916864c7b252904e9f3e22d6b.
It pins Nodemailer10.3.1 with a lockfile. Main tests105/105 pass, including the
actual SMTP dispatcher against a loopback-only server, and local npm audit
reports0 known vulnerabilities. Production trial/readiness reports the new
release, ready=true, database=verified, emailConfigured=true, autoRenew=false.
Public Plus checkout still returns configured=false/provider=disabled/url=null.
No production email was sent for this QA, and local SMTP compatibility does
not prove external inbox delivery. Render's new build audit output was not
independently read back; do not conflate local audit with a log inspection.

Live Stripe Subscriptions UI showed onboarding with Create a subscription and
no list. This is a UI observation, not a paginated API inventory proving all
historical subscriptions absent. Complete that inventory/legacy-member
migration review before replacing Production's webhook handler.
