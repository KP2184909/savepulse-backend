# SavePulse Analytics Network

Decision intelligence for everyday savers. SavePulse turns TradingView daily signals into simple regret-risk states without charts, trading promises, or buy/sell instructions.

## What is included

- `server.js`: Render-ready Node API with TradingView webhook ingestion, persisted local memory, five-business-day buy-window demotion, subscriber capture, plan-based notification routing, Business invoice tracking, and static dashboard hosting.
- `src/signalEngine.js`: Pure decision-state logic, including the percentile formula `P = (Current - P10) / (P90 - P10)`.
- `src/plans.js`: Free, Plus, Pro, and Business entitlement model for watchlists, asset access, channels, and alert timing.
- `src/emailDispatcher.js`: Bilingual alert email renderer and dispatcher. Supports free-tier API email providers such as Brevo/Resend/Mailjet, with SMTP as a fallback.
- `public/index.html`: Bilingual TH/EN dashboard with Decision Light orb, radar list, visitor counter, quota bar, and opportunity-cost calculator.
- `tests/signalEngine.test.js`: Node built-in tests for the mathematical, memory, and TradingView-normalization rules.
- `tests/plans.test.js`: Node built-in tests for the Free, Plus, Pro, and Business entitlement ladder.
- `render.yaml`: Render web-service blueprint with production env placeholders.

## Local run

This workspace currently has `node` but not `npm`, so the core tests run without installing packages:

```bash
node --test
```

Start the local app:

```bash
node server.js
```

Open:

```text
http://localhost:3000
```

## Render environment

Set these in Render before production use:

```bash
NODE_ENV=production
HOST=0.0.0.0
WEBHOOK_SECRET=your-shared-tradingview-secret
ADMIN_READINESS_KEY=your-separate-admin-readiness-key
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_USER=your-sender-email@gmail.com
SMTP_PASS=your-google-app-password
FROM_EMAIL="SavePulse <your-sender-email@gmail.com>"
EMAIL_PROVIDER=brevo
BREVO_API_KEY=your-brevo-api-key
PUBLIC_URL=https://savepulse-backend.onrender.com
VIP_EMAILS=member1@example.com,member2@example.com
DAILY_FREE_QUOTA=50
DAILY_EMAIL_ENABLED=false
DAILY_EMAIL_TIME=08:30
DAILY_EMAIL_TIMEZONE=Asia/Bangkok
DAILY_EMAIL_SIGNAL_MAX_AGE_HOURS=36
STRIPE_SECRET_KEY=sk_test_or_live_xxx
STRIPE_WEBHOOK_SECRET=whsec_xxx
STRIPE_PRICE_PLUS=price_xxx
STRIPE_PRICE_PRO=price_xxx
STRIPE_PRICE_BUSINESS=price_xxx
# Optional fallback if Stripe is not connected yet:
CHECKOUT_PLUS_URL=https://your-payment-provider/plus
CHECKOUT_PRO_URL=https://your-payment-provider/pro
CHECKOUT_BUSINESS_URL=https://your-payment-provider/business
```

Do not commit real email API keys, SMTP passwords, Stripe keys, or webhook secrets.

### Email delivery without paid infrastructure

For beta, prefer an email API provider over Gmail SMTP on Render. Gmail SMTP can work locally but may time out from hosted infrastructure. The backend chooses providers in this order unless `EMAIL_PROVIDER` is set:

1. `BREVO_API_KEY`
2. `RESEND_API_KEY`
3. `MAILJET_API_KEY` + `MAILJET_SECRET_KEY`
4. SMTP variables

Recommended beta setup:

```bash
EMAIL_PROVIDER=brevo
BREVO_API_KEY=your-brevo-api-key
FROM_EMAIL="SavePulse <alerts@savepulse.cloud>"
```

Keep `DAILY_EMAIL_ENABLED=false` until a real test email from Render succeeds. Then run a dry run first:

```bash
curl -X POST https://savepulse-backend.onrender.com/api/v1/daily-digest/send \
  -H "content-type: application/json" \
  -d '{"secret_key":"your-shared-tradingview-secret","dryRun":true}'
```

### Daily email scheduler

The production scheduler wakes every five minutes and sends once per Bangkok calendar day after the configured send window. The default is 08:30 Asia/Bangkok, after the daily TradingView alerts are expected to arrive.

```bash
DAILY_EMAIL_ENABLED=false
DAILY_EMAIL_TIME=08:30
DAILY_EMAIL_TIMEZONE=Asia/Bangkok
DAILY_EMAIL_SIGNAL_MAX_AGE_HOURS=36
```

Before sending normal daily emails, the backend requires fresh latest signals for all 9 tracked assets:

```text
USDTHB, JPYTHB, EURTHB, XAUTHB, BTCTHB, USDJPY, EURUSD, XAUUSD, BTCUSD
```

If any signal is missing or stale, each eligible recipient is logged as skipped with `skipped_reason=incomplete_signals`. Daily email logs are stored in `state/email_logs.json` and mirrored to `public.email_logs` when Supabase is configured. Logs use safe summary fields only and do not store secrets or raw webhook payloads.

Plan templates:

- Free: Daily Pulse Lite
- Plus: Daily Decision Card
- Pro: Full Timing Radar
- Business: Invoice Risk Brief

Admin debug endpoints are protected by `x-savepulse-admin-key`:

```bash
curl "https://savepulse-backend.onrender.com/api/v1/admin/daily-email-jobs" \
  -H "x-savepulse-admin-key: $ADMIN_READINESS_KEY"

curl "https://savepulse-backend.onrender.com/api/v1/admin/daily-email-logs?limit=25" \
  -H "x-savepulse-admin-key: $ADMIN_READINESS_KEY"
```

Manual dry run:

```bash
curl -X POST https://savepulse-backend.onrender.com/api/v1/daily-digest/send \
  -H "content-type: application/json" \
  -H "x-savepulse-admin-key: $ADMIN_READINESS_KEY" \
  -d '{"dryRun":true}'
```

Manual send after reviewing the dry run:

```bash
curl -X POST https://savepulse-backend.onrender.com/api/v1/daily-digest/send \
  -H "content-type: application/json" \
  -H "x-savepulse-admin-key: $ADMIN_READINESS_KEY" \
  -d '{"dryRun":false}'
```

Responses intentionally avoid secrets, raw Stripe payloads, Supabase keys, customer IDs, and subscription IDs.

## TradingView webhook

Webhook URL:

```text
https://savepulse-backend.onrender.com/api/v1/webhook/tradingview
```

Message example:

```json
{
  "secret_key": "$WEBHOOK_SECRET",
  "symbol": "JPYTHB",
  "action": "STRONG_BUY",
  "price": {{close}},
  "timeframe": "1D",
  "p10": 0.20,
  "p90": 0.30,
  "detail": "Daily close is inside the watch window",
  "days_in_window": 2,
  "ema_fast": 0.203,
  "ema_slow": 0.201,
  "bar_time": "{{time}}"
}
```

Supported actions:

- `STRONG_BUY`: fresh low-regret window, sends VIP email.
- `BUY_ZONE`: favorable value zone.
- `WAIT_ZONE`: neutral patience zone.
- `SELL_ZONE`: peak regret risk zone.

Common TradingView names are accepted too. `BUY`, `SuperTrend Buy`, and `Long` map to `STRONG_BUY`; `SELL`, `SuperTrend Sell`, and `Exit Sell` map to `SELL_ZONE`; `HOLD`, `WAIT`, and `Neutral` map to `WAIT_ZONE`. Symbols with an exchange prefix such as `OANDA:USDTHB` are normalized to `USDTHB`.

Optional Pine fields are accepted and normalized into the stored signal `payload.pine` object:

- `detail`: short internal explanation for the daily bar state.
- `days_in_window`: numeric day count from the Pine script.
- `ema_fast`: numeric fast EMA value.
- `ema_slow`: numeric slow EMA value.
- `bar_time`: bar timestamp. ISO strings, milliseconds, and seconds are accepted.

The backend does not store the TradingView `secret_key` inside the signal object.

`STRONG_BUY` follows the SavePulse low-regret decision window:

- Business day 1: remains `STRONG_BUY`.
- Business days 2-5: softens to `BUY_ZONE`.
- Business day 6 onward: becomes `WAIT_ZONE` with the Thai status "รอก่อน ยังไม่ควรซื้อตอนนี้", even if TradingView still shows Buy and no Sell alert has fired.

Business days are counted Monday-Friday using Bangkok time. `SELL_ZONE` still automatically becomes `WAIT_ZONE` after 24 hours.

## Plans and entitlements

SavePulse now has a backend plan model for the Free-to-paid ladder:

| Plan | Price | Primary audience | Backend rules |
| --- | ---: | --- | --- |
| Free | 0 THB / $0 | Lead capture and one exchange goal | 1 watchlist item, fiat only, email only, delayed major alerts |
| Plus | 199 THB / $7 monthly | Travelers and currency savers | 5 watchlist items, fiat real-time alerts, timing window, personalized examples |
| Pro | 499 THB / $19 monthly | Serious savers tracking currency, gold, and BTC | 20 watchlist items, all 9 assets, two-way opportunity/risk alerts |
| Business | 1,990 THB / $49 monthly | SME import/export workflows | Team-scale watchlists, invoice exposure tracking, business reports |

`GET /api/v1/plans` returns the public plan metadata used by pricing pages and sign-up flows.

Subscribe or update a subscriber:

```bash
curl -X POST http://localhost:3000/api/v1/subscribe \
  -H "content-type: application/json" \
  -d '{
    "email": "member@example.com",
    "locale": "en",
    "plan": "plus",
    "watchlist": ["USDTHB", "JPYTHB", "XAUUSD"],
    "channels": ["email", "line"]
  }'
```

The API sanitizes the watchlist by plan. In the example above, `XAUUSD` is rejected for Plus because gold/BTC alerts unlock on Pro and Business.

Public signups cannot self-upgrade into a paid plan. If a visitor requests `plus`, `pro`, or `business` without the master secret, the API keeps the subscriber on their existing plan or Free and returns a checkout payload. Payment providers can call the protected admin route after checkout:

```bash
curl -X POST http://localhost:3000/api/v1/admin/subscribers/plan \
  -H "content-type: application/json" \
  -d '{
    "secret_key": "$WEBHOOK_SECRET",
    "email": "member@example.com",
    "plan": "pro",
    "watchlist": ["JPYTHB", "XAUTHB", "BTCUSD"]
  }'
```

Frontends can request a payment link with:

```bash
curl -X POST http://localhost:3000/api/v1/billing/checkout \
  -H "content-type: application/json" \
  -d '{ "email": "member@example.com", "plan": "plus" }'
```

If `STRIPE_SECRET_KEY` and the plan price ID are configured, this endpoint creates a Stripe Checkout subscription session and returns its `url`. If Stripe is not configured yet, it falls back to `CHECKOUT_PLUS_URL`, `CHECKOUT_PRO_URL`, or `CHECKOUT_BUSINESS_URL` when those are present.

Stripe webhook endpoint:

```text
POST https://savepulse-backend.onrender.com/api/v1/billing/webhook
```

Recommended Stripe events:

- `checkout.session.completed`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `invoice.payment_succeeded`
- `invoice.payment_failed`

`checkout.session.completed` upgrades the subscriber to the paid plan from Stripe Checkout metadata. Subscription cancellation events downgrade the subscriber to Free when the email metadata is present.

## Billing readiness checks

Admin billing checks are protected. Set `ADMIN_READINESS_KEY` in Render before public deploy, and keep it separate from the TradingView `WEBHOOK_SECRET`.

```bash
curl https://savepulse-backend.onrender.com/api/v1/admin/billing-readiness \
  -H "x-savepulse-admin-key: $ADMIN_READINESS_KEY"

curl "https://savepulse-backend.onrender.com/api/v1/admin/stripe-events?limit=10" \
  -H "x-savepulse-admin-key: $ADMIN_READINESS_KEY"

curl "https://savepulse-backend.onrender.com/api/v1/admin/latest-signals" \
  -H "x-savepulse-admin-key: $ADMIN_READINESS_KEY"
```

These responses intentionally summarize readiness and recent Stripe processing without returning secrets, raw Stripe payloads, customer IDs, subscription IDs, or Supabase keys.

## Checking TradingView alert delivery

After a TradingView alert fires, check Supabase first:

- Table: `public.signals`
- One row per canonical symbol: `USDTHB`, `JPYTHB`, `EURTHB`, `XAUTHB`, `BTCTHB`, `USDJPY`, `EURUSD`, `XAUUSD`, `BTCUSD`
- Key fields:
  - `symbol`: confirms which alert updated.
  - `action`: latest canonical backend state from TradingView.
  - `timeframe`: should normally be `1D`.
  - `price`: latest webhook price.
  - `received_at`: when SavePulse accepted the webhook.
  - `updated_at`: when the Supabase row was updated.
  - `payload`: normalized signal details.
  - `payload->'pine'`: optional Pine fields such as `detail`, `daysInWindow`, `emaFast`, `emaSlow`, and `barTime`.

Safe admin snapshot for all 9 latest signals:

```bash
curl "https://savepulse-backend.onrender.com/api/v1/admin/latest-signals" \
  -H "x-savepulse-admin-key: $ADMIN_READINESS_KEY"
```

Public production check without secrets:

```bash
npm run check:signals
```

This checks the public `/api/v1/status` endpoint for all 9 tracked symbols and prints the latest received time in Bangkok time. It intentionally does not require or print admin keys, webhook secrets, raw payloads, or customer data.

If signals do not update, open Render Dashboard -> `savepulse-backend` -> Logs, then search around the time TradingView should have fired:

- `POST /api/v1/webhook/tradingview` should appear when TradingView reaches Render.
- `unauthorized_webhook` means the TradingView message secret does not match `WEBHOOK_SECRET`.
- `invalid JSON body` means the TradingView alert message is not valid JSON.
- `unsupported action` means the action text is not one of the supported names or aliases.
- `symbol must normalize` or unsupported symbol errors usually mean the alert sent a malformed symbol.
- `Supabase mirror sync failed for signals` means the local webhook write succeeded but Supabase mirroring failed; check `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`.

The admin snapshot is protected and intentionally avoids returning raw webhook payloads or secrets.

## Notification routing

TradingView webhooks now go through the entitlement layer before email:

- `STRONG_BUY` can notify Free, Plus, Pro, and Business subscribers if the asset is allowed by their plan.
- Free alerts are queued with a 180-minute delay to keep the paid real-time upgrade meaningful.
- `SELL_ZONE` is treated as a risk alert and is only delivered to Pro and Business subscribers.
- `BUY_ZONE` and `WAIT_ZONE` update the dashboard state but do not send alert emails.

Queue status:

```text
GET /api/v1/notifications/summary
```

Manual protected flush, useful for Render maintenance checks:

```bash
curl -X POST http://localhost:3000/api/v1/notifications/flush \
  -H "content-type: application/json" \
  -d '{ "secret_key": "$WEBHOOK_SECRET" }'
```

Real email delivery requires one configured provider: Brevo, Resend, Mailjet, or SMTP. Without a provider, jobs are recorded and marked skipped when due, which keeps webhook writes safe during setup.

## Business invoice tracking

Business subscribers can register invoice exposure:

```bash
curl -X POST http://localhost:3000/api/v1/business/invoices \
  -H "content-type: application/json" \
  -d '{
    "email": "ops@example.com",
    "amount": 85000,
    "currency": "USD",
    "targetCurrency": "THB",
    "dueDate": "2026-06-15",
    "vendor": "Supplier invoice"
  }'
```

The response includes the mapped SavePulse symbol, days until due, and the current decision state for that exposure. This is a prototype entitlement and exposure layer; Stripe Checkout is wired for subscription activation, while account authentication still needs to be connected before public paid launch.

## Tracked assets

The dashboard radar list is seeded in this exact order:

- `USDTHB`
- `JPYTHB`
- `EURTHB`
- `XAUTHB`
- `BTCTHB`
- `USDJPY`
- `EURUSD`
- `XAUUSD`
- `BTCUSD`
