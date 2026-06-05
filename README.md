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

Keep `DAILY_DIGEST_ENABLED=false` until a real test email from Render succeeds. Then run a dry run first:

```bash
curl -X POST https://savepulse-backend.onrender.com/api/v1/daily-digest/send \
  -H "content-type: application/json" \
  -d '{"secret_key":"your-shared-tradingview-secret","dryRun":true}'
```

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
  "p90": 0.30
}
```

Supported actions:

- `STRONG_BUY`: fresh low-regret window, sends VIP email.
- `BUY_ZONE`: favorable value zone.
- `WAIT_ZONE`: neutral patience zone.
- `SELL_ZONE`: peak regret risk zone.

Common TradingView names are accepted too. `BUY`, `SuperTrend Buy`, and `Long` map to `STRONG_BUY`; `SELL`, `SuperTrend Sell`, and `Exit Sell` map to `SELL_ZONE`; `HOLD`, `WAIT`, and `Neutral` map to `WAIT_ZONE`. Symbols with an exchange prefix such as `OANDA:USDTHB` are normalized to `USDTHB`.

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
```

These responses intentionally summarize readiness and recent Stripe processing without returning secrets, raw Stripe payloads, customer IDs, subscription IDs, or Supabase keys.

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
