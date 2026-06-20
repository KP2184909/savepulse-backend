# SavePulse Tiny Beta Launch Checklist

Last reviewed: 2026-06-20

This checklist is the operating playbook for a controlled Private Tiny Beta. It is not a feature roadmap. Keep the system stable, invite a small group, measure feedback, and only expand after the logs and user experience look healthy.

## Current Verified Production Status

- `https://savepulse.cloud` production landing page is live.
- Mobile EN/TH language switch works.
- Browser-language detection is live: Thai browsers start in Thai and other browsers start in English.
- A saved manual language choice overrides browser detection.
- Early Beta pricing is visible: `$5/mo`, `$15/mo`, `$59/mo`.
- Paid buttons are request-only: `Request early access` / `Contact us`.
- No public checkout flow is exposed from homepage paid buttons.
- `https://savepulse.cloud/api/v1/health` passes.
- Render backend health passes.
- Production signals are fresh for all 9 tracked symbols.
- Real mobile signup flow passed.
- Subscriber persistence passed.
- Resend controlled email delivery passed.
- `DAILY_EMAIL_ENABLED` must remain `false`.
- Stripe Live is not enabled for public checkout.

## Tiny Beta Definition

- Private group only.
- Start with one trusted household pilot before inviting the first 10 users.
- The household pilot may contain only one person; do not delay useful feedback just to fill a quota.
- After the household pilot passes, grow toward 10 users one at a time.
- Expand to 30 users only after logs, deliverability, and feedback look stable.
- No paid checkout yet.
- No public ads yet.
- No automatic daily scheduler until explicitly approved.
- No new product features during the initial beta observation window.

## Who To Invite First

Prioritize people with real exchange-rate pain:

- People who exchange THB/USD/JPY/EUR.
- People receiving income in foreign currency.
- Gold buyers or gold watchers.
- Small import/export SME owners.
- Finance or operations people who think in real invoices and payment timing.
- People who can give practical feedback, not only casual comments.

Avoid inviting broad public traffic until the first 10 users complete signup and at least one controlled Daily Pulse batch has been reviewed.

## First-Day Beta Flow

1. User opens `https://savepulse.cloud`.
2. User checks whether the product is understandable within 5 seconds.
3. User signs up with email.
4. Operator verifies subscriber count/state.
5. Operator dry-runs the Daily Pulse send for the selected beta emails.
6. Operator sends the first Daily Pulse manually only to selected beta users.
7. Operator checks email logs.
8. Operator checks inbox/spam feedback from users.
9. Operator collects qualitative feedback before inviting more users.

## One-Person Household Pilot

Use this before the first wider invitation round:

1. Ask the pilot to open `https://savepulse.cloud` on their own phone without an explanation first.
2. Ask what they think SavePulse does within five seconds.
3. Ask them to select the money they have, the money they want, and enter a realistic amount.
4. Confirm that the current rate and estimated conversion are understandable.
5. Ask them to sign up with their own email and confirm that the success state is clear.
6. Confirm that the welcome email arrives; check Inbox, Spam, Promotions, and Trash.
7. Record the asset or currency pair they actually care about.
8. Do not send a Daily Pulse until the operator has verified the subscriber and completed a dry run.
9. If a manual Daily Pulse is approved, send only to that pilot email and inspect the email log immediately.
10. Record confusion and wording feedback before changing the product or inviting another person.

Household pilot pass criteria:

- The pilot understands the product without coaching.
- Live conversion is readable and directionally correct.
- Signup succeeds once without duplicate confusion.
- Welcome email is received and readable on mobile.
- The pilot understands that SavePulse is decision support, not a trading signal or exchange service.
- No production errors or email delivery failures are observed.

## Manual Email Send Safety Rules

- Dry run first.
- Send only to selected beta emails.
- Do not send to all subscribers.
- Check `email_logs` after every send.
- Check `sent`, `failed`, `skipped`, and unsubscribe-related states.
- Stop immediately if deliverability, copy, layout, or compliance issues appear.
- Do not hide or remove unsubscribe links.
- Do not hide or remove disclaimers.
- Do not expose raw backend action names in user-facing email.
- Do not use copy that sounds like a trade instruction or guaranteed outcome.

## Feedback Questions

Ask each beta user:

- Did you understand what SavePulse does within 5 seconds?
- Did the website feel trustworthy?
- Was the email useful?
- Was anything confusing?
- Did it feel like financial advice or a trading signal?
- Would you want this every morning?
- Which currency/gold/BTC pair do you actually care about?
- Would you pay `$5/mo`, `$15/mo`, or `$59/mo` for the relevant tier?

## Do-Not-Do List

- Do not enable `DAILY_EMAIL_ENABLED` yet.
- Do not run Stripe Live test yet.
- Do not expose checkout publicly.
- Do not add Personal Rate Watch.
- Do not add LINE alert.
- Do not add new backend features.
- Do not send emails to all subscribers.
- Do not remove disclaimers.
- Do not remove unsubscribe links.
- Do not launch public ads.
- Do not expand from 10 to 30 users until the first batch is reviewed.

## Go/No-Go Criteria For Enabling Scheduler Later

The daily scheduler can only be considered after:

- 10-30 beta users successfully subscribed.
- At least one manual Daily Pulse batch was sent to selected beta users.
- Email logs show low or no failures.
- No spam complaints.
- Unsubscribe flow works.
- Copy is confirmed safe by reviewing real inbox rendering.
- Free, Plus, Pro, and Business email templates are readable on mobile.
- Production signals remain fresh for all 9 tracked symbols for multiple days.
- The operator explicitly approves turning on scheduled sends.

## Language Readiness

Verified behavior:

```text
Thai browser -> Thai homepage
Non-Thai browser -> English homepage
Manual toggle -> user can switch anytime and the saved choice wins next time
```

## Final Lockdown Notes

- Build phase for Early Beta is considered complete.
- The current phase is Beta Ops.
- Favor measurement, logs, and user feedback over new features.
- The safest launch path is:

```text
Lock system -> invite 10 users -> send manual Daily Pulse -> review logs and feedback -> expand carefully
```
