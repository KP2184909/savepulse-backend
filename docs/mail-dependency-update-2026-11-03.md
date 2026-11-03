# SMTP dependency update — 2026-11-03

Render's existing build reported one high-severity dependency advisory while
using nodemailer ^6.9.16 with no committed lockfile. Prepared an isolated update
to exact nodemailer10.3.1 and committed npm's generated package-lock.json so
future installations resolve the reviewed artifact. Registry metadata and the
maintainer release page both identify10.3.1, released2026-10-29:
https://github.com/nodemailer/nodemailer/releases/tag/v10.3.1
https://github.com/nodemailer/nodemailer/security/advisories
The package requires Node>=20, matching this application's existing engine.

Validation:105/105 tests pass on main, including a new real SMTP dispatcher
integration against a loopback-only SMTP protocol fixture. It exercises SMTP
authentication and text/HTML message serialization using the installed package.
No external recipient/provider is contacted by the fixture. Existing Resend,
Brevo and trial regressions also pass. npm audit --omit=dev reports0 known
vulnerabilities for the resulting lockfile. This is an audit result, not proof
that no future vulnerabilities exist. git diff --check passes.

No sender identity, schedule, recipient list, email template, provider setting,
Stripe configuration, subscription or paid-checkout switch is changed.
Production inbox delivery and an external SMTP server are not validated by this
local test. The billing replacement remains in draft PR10.
