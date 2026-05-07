const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors()); 
app.use(bodyParser.json());

let assetStates = {
    "USDTHB": { action: "WAIT_ZONE", price: 0, timestamp: null },
    "JPYTHB": { action: "WAIT_ZONE", price: 0, timestamp: null },
    "EURTHB": { action: "WAIT_ZONE", price: 0, timestamp: null },
    "XAUTHB": { action: "WAIT_ZONE", price: 0, timestamp: null },
    "BTCTHB": { action: "WAIT_ZONE", price: 0, timestamp: null },
    "USDJPY": { action: "WAIT_ZONE", price: 0, timestamp: null },
    "EURUSD": { action: "WAIT_ZONE", price: 0, timestamp: null },
    "XAUUSD": { action: "WAIT_ZONE", price: 0, timestamp: null },
    "BTCUSD": { action: "WAIT_ZONE", price: 0, timestamp: null }
};

const quantile = (arr, q) => {
    const sorted = [...arr].sort((a, b) => a - b);
    const pos = (sorted.length - 1) * q;
    const base = Math.floor(pos);
    const rest = pos - base;
    return sorted[base + 1] !== undefined ? sorted[base] + rest * (sorted[base + 1] - sorted[base]) : sorted[base];
};

const generateMockHistory = (symbol) => {
    let prices = [];
    let current = 100;
    for (let i = 0; i < 90; i++) {
        current = current * (1 + (Math.random() - 0.5) * 0.02);
        prices.push(current);
    }
    return prices;
};

app.get('/', (req, res) => {
    res.send('SavePulse Global API is Online 🚀');
});

app.post('/api/v1/webhook/tradingview', (req, res) => {
    const { secret_key, symbol, action, price, timeframe } = req.body;

    if (secret_key !== "SAVEPULSE_MASTER_KEY_2026") {
        return res.status(401).json({ status: "error", message: "Unauthorized" });
    }

    if (assetStates[symbol]) {
        assetStates[symbol] = {
            action: action,
            price: price,
            timeframe: timeframe,
            timestamp: new Date().toISOString()
        };
        console.log(`✅ Signal Received: Updated ${symbol} to ${action}`);
        return res.json({ status: "success", message: `Asset ${symbol} updated` });
    } else {
        return res.status(404).json({ status: "error", message: "Symbol not found" });
    }
});

app.get('/api/v1/analyze', (req, res) => {
    const { holding, target } = req.query;
    const symbol = holding === "THB" ? `${target}THB` : `${target}${holding}`;

    const history = generateMockHistory(symbol);
    const p10 = quantile(history, 0.10);
    const p90 = quantile(history, 0.90);
    const current = history[history.length - 1];
    
    const clipped = Math.min(Math.max(current, p10), p90);
    const percentile = (clipped - p10) / (p90 - p10);

    const tvSignal = assetStates[symbol] ? assetStates[symbol].action : "WAIT_ZONE";

    let label = "🟡 โซนราคาเฉลี่ย";
    let color = "amber";
    let actionBtn = "ทยอยแบ่งแลก";
    
    if (tvSignal === "BUY_ZONE" || percentile < 0.3) {
        label = "🟢 โซนราคาต่ำ (โอกาสดี)";
        color = "teal";
        actionBtn = "ตัดสินใจแลกตอนนี้";
    } else if (tvSignal === "SELL_ZONE" || percentile > 0.7) {
        label = "🔴 โซนราคาสูง (ควรเลี่ยง)";
        color = "rose";
        actionBtn = "ยังไม่แลกตอนนี้";
    }

    res.json({
        status: "success",
        data: {
            zone: { percentile, label, color, tv_signal: tvSignal },
            probability: { value: 0.82, text: `${Math.round((1 - percentile) * 100)}% มีโอกาสได้ราคาดีกว่าภายใน 7 วัน` },
            recommendation: { action: actionBtn, insight: "วิเคราะห์จาก EMA Day และสถิติ 90 วัน" }
        }
    });
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
