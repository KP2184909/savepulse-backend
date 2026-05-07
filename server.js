{\rtf1\ansi\ansicpg874\cocoartf2868
\cocoatextscaling0\cocoaplatform0{\fonttbl\f0\froman\fcharset0 Times-Roman;}
{\colortbl;\red255\green255\blue255;\red0\green0\blue0;}
{\*\expandedcolortbl;;\cssrgb\c0\c0\c0;}
\paperw11900\paperh16840\margl1440\margr1440\vieww11520\viewh8400\viewkind0
\deftab720
\pard\pardeftab720\partightenfactor0

\f0\fs24 \cf0 \expnd0\expndtw0\kerning0
\outl0\strokewidth0 \strokec2 ```javascript\
// --- SavePulse Backend Server (Render.com Version) ---\
// \uc0\u3619 \u3632 \u3610 \u3610 \u3609 \u3637 \u3657 \u3607 \u3635 \u3627 \u3609 \u3657 \u3634 \u3607 \u3637 \u3656 \u3619 \u3633 \u3610  Webhook \u3592 \u3634 \u3585  TradingView \u3649 \u3621 \u3632 \u3651 \u3627 \u3657 \u3610 \u3619 \u3636 \u3585 \u3634 \u3619 \u3586 \u3657 \u3629 \u3617 \u3641 \u3621 \u3649 \u3585 \u3656 \u3627 \u3609 \u3657 \u3634 \u3648 \u3623 \u3655 \u3610 \
\
const express = require('express');\
const cors = require('cors');\
const bodyParser = require('body-parser');\
\
const app = express();\
const PORT = process.env.PORT || 3000;\
\
// \uc0\u3605 \u3633 \u3657 \u3591 \u3588 \u3656 \u3634 \u3588 \u3623 \u3634 \u3617 \u3611 \u3621 \u3629 \u3604 \u3616 \u3633 \u3618 \u3648 \u3610 \u3639 \u3657 \u3629 \u3591 \u3605 \u3657 \u3609 \
app.use(cors()); // \uc0\u3629 \u3609 \u3640 \u3597 \u3634 \u3605 \u3651 \u3627 \u3657 \u3627 \u3609 \u3657 \u3634 \u3648 \u3623 \u3655 \u3610  index.html \u3588 \u3640 \u3618 \u3585 \u3633 \u3610 \u3648 \u3595 \u3636 \u3619 \u3660 \u3615 \u3648 \u3623 \u3629 \u3619 \u3660 \u3609 \u3637 \u3657 \u3652 \u3604 \u3657 \
app.use(bodyParser.json());\
\
// --- 1. \uc0\u3600 \u3634 \u3609 \u3586 \u3657 \u3629 \u3617 \u3641 \u3621 \u3592 \u3635 \u3621 \u3629 \u3591  (In-Memory Database) ---\
// \uc0\u3651 \u3609 \u3629 \u3609 \u3634 \u3588 \u3605 \u3648 \u3619 \u3634 \u3592 \u3632 \u3648 \u3611 \u3621 \u3637 \u3656 \u3618 \u3609 \u3652 \u3611 \u3651 \u3594 \u3657  MongoDB \u3627 \u3619 \u3639 \u3629  Supabase\
let assetStates = \{\
    "USDTHB": \{ action: "WAIT_ZONE", price: 0, timestamp: null \},\
    "JPYTHB": \{ action: "WAIT_ZONE", price: 0, timestamp: null \},\
    "EURTHB": \{ action: "WAIT_ZONE", price: 0, timestamp: null \},\
    "XAUTHB": \{ action: "WAIT_ZONE", price: 0, timestamp: null \},\
    "BTCTHB": \{ action: "WAIT_ZONE", price: 0, timestamp: null \},\
    "USDJPY": \{ action: "WAIT_ZONE", price: 0, timestamp: null \},\
    "EURUSD": \{ action: "WAIT_ZONE", price: 0, timestamp: null \},\
    "XAUUSD": \{ action: "WAIT_ZONE", price: 0, timestamp: null \},\
    "BTCUSD": \{ action: "WAIT_ZONE", price: 0, timestamp: null \}\
\};\
\
// --- 2. Math Utility Functions (\uc0\u3649 \u3585 \u3609 \u3626 \u3617 \u3629 \u3591 ) ---\
\
const average = arr => arr.reduce((a, b) => a + b, 0) / arr.length;\
\
const quantile = (arr, q) => \{\
    const sorted = [...arr].sort((a, b) => a - b);\
    const pos = (sorted.length - 1) * q;\
    const base = Math.floor(pos);\
    const rest = pos - base;\
    return sorted[base + 1] !== undefined ? sorted[base] + rest * (sorted[base + 1] - sorted[base]) : sorted[base];\
\};\
\
// \uc0\u3592 \u3635 \u3621 \u3629 \u3591 \u3585 \u3634 \u3619 \u3626 \u3619 \u3657 \u3634 \u3591 \u3586 \u3657 \u3629 \u3617 \u3641 \u3621 \u3618 \u3657 \u3629 \u3609 \u3627 \u3621 \u3633 \u3591  90 \u3623 \u3633 \u3609  (Data Pipeline Simulation)\
const generateMockHistory = (symbol) => \{\
    let prices = [];\
    let current = 100;\
    for (let i = 0; i < 90; i++) \{\
        current = current * (1 + (Math.random() - 0.5) * 0.02);\
        prices.push(current);\
    \}\
    return prices;\
\};\
\
// --- 3. API Endpoints ---\
\
// \uc0\u3627 \u3609 \u3657 \u3634 \u3649 \u3619 \u3585  (Health Check)\
app.get('/', (req, res) => \{\
    res.send('SavePulse Global API is Online \uc0\u55357 \u56960 ');\
\});\
\
// [ENDPOINT 1] \uc0\u3626 \u3635 \u3627 \u3619 \u3633 \u3610 \u3619 \u3633 \u3610 \u3626 \u3633 \u3597 \u3597 \u3634 \u3603 \u3592 \u3634 \u3585  TradingView Webhook\
app.post('/api/v1/webhook/tradingview', (req, res) => \{\
    const \{ secret_key, symbol, action, price, timeframe \} = req.body;\
\
    // \uc0\u3619 \u3632 \u3610 \u3610 \u3605 \u3619 \u3623 \u3592 \u3626 \u3629 \u3610 \u3619 \u3627 \u3633 \u3626 \u3612 \u3656 \u3634 \u3609 \
    if (secret_key !== "SAVEPULSE_MASTER_KEY_2026") \{\
        console.log("\uc0\u10060  Unauthorized Webhook Attempt");\
        return res.status(401).json(\{ status: "error", message: "Unauthorized" \});\
    \}\
\
    // \uc0\u3629 \u3633 \u3611 \u3648 \u3604 \u3605 \u3626 \u3606 \u3634 \u3609 \u3632 \u3651 \u3609 \u3600 \u3634 \u3609 \u3586 \u3657 \u3629 \u3617 \u3641 \u3621 \
    if (assetStates[symbol]) \{\
        assetStates[symbol] = \{\
            action: action, // BUY_ZONE, SELL_ZONE, WAIT_ZONE\
            price: price,\
            timeframe: timeframe,\
            timestamp: new Date().toISOString()\
        \};\
        console.log(`\uc0\u9989  Signal Received: Updated $\{symbol\} to $\{action\}`);\
        return res.json(\{ status: "success", message: `Asset $\{symbol\} updated` \});\
    \} else \{\
        return res.status(404).json(\{ status: "error", message: "Symbol not found" \});\
    \}\
\});\
\
// [ENDPOINT 2] \uc0\u3626 \u3635 \u3627 \u3619 \u3633 \u3610 \u3626 \u3656 \u3591 \u3586 \u3657 \u3629 \u3617 \u3641 \u3621 \u3651 \u3627 \u3657 \u3627 \u3609 \u3657 \u3634 \u3648 \u3623 \u3655 \u3610  (Frontend \u8596  Backend)\
app.get('/api/v1/analyze', (req, res) => \{\
    const \{ holding, target \} = req.query;\
    // \uc0\u3626 \u3619 \u3657 \u3634 \u3591 \u3594 \u3639 \u3656 \u3629  Symbol \u3651 \u3627 \u3657 \u3605 \u3619 \u3591 \u3585 \u3633 \u3610  TradingView (\u3648 \u3594 \u3656 \u3609  \u3606 \u3639 \u3629  THB \u3629 \u3618 \u3634 \u3585 \u3652 \u3604 \u3657  USD = USDTHB)\
    const symbol = holding === "THB" ? `$\{target\}THB` : `$\{target\}$\{holding\}`;\
\
    const history = generateMockHistory(symbol);\
    const p10 = quantile(history, 0.10);\
    const p90 = quantile(history, 0.90);\
    const current = history[history.length - 1];\
    \
    // \uc0\u3588 \u3635 \u3609 \u3623 \u3603  Percentile\
    const clipped = Math.min(Math.max(current, p10), p90);\
    const percentile = (clipped - p10) / (p90 - p10);\
\
    // \uc0\u3604 \u3638 \u3591 \u3626 \u3633 \u3597 \u3597 \u3634 \u3603 \u3621 \u3656 \u3634 \u3626 \u3640 \u3604 \u3592 \u3634 \u3585  TradingView (\u3606 \u3657 \u3634 \u3652 \u3617 \u3656 \u3617 \u3637 \u3651 \u3627 \u3657 \u3648 \u3611 \u3655 \u3609  WAIT_ZONE)\
    const tvSignal = assetStates[symbol] ? assetStates[symbol].action : "WAIT_ZONE";\
\
    // \uc0\u3585 \u3635 \u3627 \u3609 \u3604 \u3588 \u3635 \u3649 \u3609 \u3632 \u3609 \u3635 \u3605 \u3634 \u3617 \u3619 \u3632 \u3610 \u3610  (Mapping)\
    let label = "\uc0\u55357 \u57313  \u3650 \u3595 \u3609 \u3619 \u3634 \u3588 \u3634 \u3648 \u3593 \u3621 \u3637 \u3656 \u3618 ";\
    let color = "amber";\
    let actionBtn = "\uc0\u3607 \u3618 \u3629 \u3618 \u3649 \u3610 \u3656 \u3591 \u3649 \u3621 \u3585 ";\
    \
    if (tvSignal === "BUY_ZONE" || percentile < 0.3) \{\
        label = "\uc0\u55357 \u57314  \u3650 \u3595 \u3609 \u3619 \u3634 \u3588 \u3634 \u3605 \u3656 \u3635  (\u3650 \u3629 \u3585 \u3634 \u3626 \u3604 \u3637 )";\
        color = "teal";\
        actionBtn = "\uc0\u3605 \u3633 \u3604 \u3626 \u3636 \u3609 \u3651 \u3592 \u3649 \u3621 \u3585 \u3605 \u3629 \u3609 \u3609 \u3637 \u3657 ";\
    \} else if (tvSignal === "SELL_ZONE" || percentile > 0.7) \{\
        label = "\uc0\u55357 \u56628  \u3650 \u3595 \u3609 \u3619 \u3634 \u3588 \u3634 \u3626 \u3641 \u3591  (\u3588 \u3623 \u3619 \u3648 \u3621 \u3637 \u3656 \u3618 \u3591 )";\
        color = "rose";\
        actionBtn = "\uc0\u3618 \u3633 \u3591 \u3652 \u3617 \u3656 \u3649 \u3621 \u3585 \u3605 \u3629 \u3609 \u3609 \u3637 \u3657 ";\
    \}\
\
    // \uc0\u3626 \u3656 \u3591 \u3588 \u3635 \u3605 \u3629 \u3610 \u3585 \u3621 \u3633 \u3610 \u3652 \u3611 \u3607 \u3637 \u3656 \u3627 \u3609 \u3657 \u3634 \u3648 \u3623 \u3655 \u3610 \
    res.json(\{\
        status: "success",\
        data: \{\
            zone: \{\
                percentile: percentile,\
                label: label,\
                color: color,\
                tv_signal: tvSignal\
            \},\
            probability: \{\
                value: 0.82,\
                text: `$\{Math.round((1 - percentile) * 100)\}% \uc0\u3617 \u3637 \u3650 \u3629 \u3585 \u3634 \u3626 \u3652 \u3604 \u3657 \u3619 \u3634 \u3588 \u3634 \u3604 \u3637 \u3585 \u3623 \u3656 \u3634 \u3616 \u3634 \u3618 \u3651 \u3609  7 \u3623 \u3633 \u3609 `\
            \},\
            confidence: \{ score: 0.78, level: "\uc0\u3626 \u3641 \u3591 " \},\
            recommendation: \{ action: actionBtn, insight: "\uc0\u3629 \u3636 \u3591 \u3592 \u3634 \u3585 \u3626 \u3606 \u3636 \u3605 \u3636  90 \u3623 \u3633 \u3609 \u3649 \u3621 \u3632 \u3626 \u3633 \u3597 \u3597 \u3634 \u3603  EMA Day" \}\
        \}\
    \});\
\});\
\
// \uc0\u3648 \u3619 \u3636 \u3656 \u3617 \u3619 \u3633 \u3609 \u3648 \u3595 \u3636 \u3619 \u3660 \u3615 \u3648 \u3623 \u3629 \u3619 \u3660 \
app.listen(PORT, () => \{\
    console.log(`\uc0\u55357 \u56960  SavePulse Server is ready on port $\{PORT\}`);\
\});\
\
\
```\
}