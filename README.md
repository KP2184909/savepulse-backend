# SavePulse Analytics Network

Decision intelligence for everyday savers. SavePulse turns TradingView daily signals into simple regret-risk states without charts, trading promises, or buy/sell instructions.

## What is included

- `server.js`: Render-ready Node API with TradingView webhook ingestion, persisted local memory, auto-demotion after 24 hours, subscriber capture, and static dashboard hosting.
- `src/signalEngine.js`: Pure decision-state logic, including the percentile formula `P = (Current - P10) / (P90 - P10)`.
- `src/emailDispatcher.js`: Nodemailer-compatible VIP broadcast engine for fresh `STRONG_BUY` events.
- `public/index.html`: Bilingual TH/EN dashboard with Decision Light orb, radar list, visitor counter, quota bar, and opportunity-cost calculator.
- `tests/signalEngine.test.js`: Node built-in tests for the mathematical and memory rules.
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
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_USER=your-sender-email@gmail.com
SMTP_PASS=your-google-app-password
FROM_EMAIL="SavePulse <your-sender-email@gmail.com>"
VIP_EMAILS=member1@example.com,member2@example.com
DAILY_FREE_QUOTA=50
```

Do not commit real SMTP passwords or webhook secrets.

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

`STRONG_BUY` automatically becomes `BUY_ZONE` after 24 hours without a fresh alert. `SELL_ZONE` automatically becomes `WAIT_ZONE` after 24 hours.

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
