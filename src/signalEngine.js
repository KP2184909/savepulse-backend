"use strict";

const DEMOTION_MS = 24 * 60 * 60 * 1000;

const ACTIONS = Object.freeze({
  STRONG_BUY: "STRONG_BUY",
  BUY_ZONE: "BUY_ZONE",
  WAIT_ZONE: "WAIT_ZONE",
  SELL_ZONE: "SELL_ZONE"
});

const TRACKED_ASSETS = Object.freeze([
  "USDTHB",
  "JPYTHB",
  "EURTHB",
  "XAUTHB",
  "BTCTHB",
  "USDJPY",
  "EURUSD",
  "XAUUSD",
  "BTCUSD"
]);

const ACTION_META = Object.freeze({
  STRONG_BUY: {
    tone: "teal",
    severity: 1,
    orbClass: "orb-teal",
    en: {
      label: "High Confidence Safe Entry",
      headline: "Historically lowest regret risk",
      guidance: "A fresh daily signal has moved this asset into a favorable decision window."
    },
    th: {
      label: "จังหวะสะสมที่มั่นใจสูง",
      headline: "ความเสี่ยงเสียใจย้อนหลังอยู่ในโซนต่ำ",
      guidance: "สัญญาณรายวันล่าสุดบอกว่าโซนนี้เหมาะกับการตัดสินใจแบบมีวินัย"
    }
  },
  BUY_ZONE: {
    tone: "teal",
    severity: 2,
    orbClass: "orb-teal",
    en: {
      label: "Favorable Value Zone",
      headline: "Favorable value zone",
      guidance: "The setup remains constructive, but the strongest fresh-signal window has aged."
    },
    th: {
      label: "โซนมูลค่าน่าสะสม",
      headline: "ยังเป็นโซนที่ราคาเอื้อต่อการสะสม",
      guidance: "ภาพรวมยังเอื้อกับการตัดสินใจ แต่สัญญาณสดได้ผ่านช่วงเร่งด่วนไปแล้ว"
    }
  },
  WAIT_ZONE: {
    tone: "amber",
    severity: 3,
    orbClass: "orb-amber",
    en: {
      label: "Neutral Patience Zone",
      headline: "Patience has positive expected value",
      guidance: "The asset is not in a clear low-regret window. Discipline is the product here."
    },
    th: {
      label: "โซนรออย่างมีวินัย",
      headline: "การรอมีมูลค่ามากกว่าการรีบ",
      guidance: "สินทรัพย์ยังไม่อยู่ในโซนตัดสินใจที่ลดความเสียใจได้ชัดเจน"
    }
  },
  SELL_ZONE: {
    tone: "rose",
    severity: 4,
    orbClass: "orb-rose",
    en: {
      label: "Peak Regret Risk Zone",
      headline: "Peak regret risk is elevated",
      guidance: "Avoid emotional accumulation until the risk state cools down."
    },
    th: {
      label: "โซนเสี่ยงซื้อแพง",
      headline: "ความเสี่ยงเสียใจจากการรีบซื้อสูง",
      guidance: "หลีกเลี่ยงการสะสมด้วยอารมณ์จนกว่าสถานะความเสี่ยงจะเย็นลง"
    }
  }
});

function normalizeSymbol(symbol) {
  if (typeof symbol !== "string") {
    throw new Error("symbol is required");
  }

  const normalized = symbol.trim().toUpperCase();
  if (!/^[A-Z0-9:_-]{3,24}$/.test(normalized)) {
    throw new Error("symbol must be 3-24 chars and contain only A-Z, 0-9, :, _, or -");
  }

  return normalized;
}

function normalizeAction(action) {
  if (typeof action !== "string") {
    throw new Error("action is required");
  }

  const normalized = action.trim().toUpperCase();
  if (!Object.prototype.hasOwnProperty.call(ACTIONS, normalized)) {
    throw new Error(`unsupported action: ${action}`);
  }

  return normalized;
}

function numericOrNull(value) {
  if (value === "" || value === null || value === undefined) {
    return null;
  }

  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function confidencePercentile({ current, p10, p90 }) {
  const currentNumber = numericOrNull(current);
  const p10Number = numericOrNull(p10);
  const p90Number = numericOrNull(p90);

  if (currentNumber === null || p10Number === null || p90Number === null) {
    return null;
  }

  const denominator = p90Number - p10Number;
  if (denominator <= 0) {
    return null;
  }

  const raw = (currentNumber - p10Number) / denominator;
  const clamped = Math.max(0, Math.min(1, raw));

  return {
    raw,
    clamped,
    percent: Math.round(clamped * 100)
  };
}

function isThaiAsset(symbol) {
  return normalizeSymbol(symbol).endsWith("THB");
}

function actionMeta(action) {
  return ACTION_META[normalizeAction(action)];
}

function createDefaultSignal(symbol) {
  const normalizedSymbol = normalizeSymbol(symbol);

  return {
    id: `${normalizedSymbol}-default`,
    symbol: normalizedSymbol,
    action: ACTIONS.WAIT_ZONE,
    price: null,
    timeframe: "1D",
    p10: null,
    p90: null,
    percentile: null,
    source: "default",
    receivedAt: null
  };
}

function applyAutoDemotion(signal, now = new Date()) {
  if (!signal) {
    return null;
  }

  const createdAt = new Date(signal.receivedAt || signal.createdAt || signal.timestamp);
  const ageMs = Number.isFinite(createdAt.getTime()) ? now.getTime() - createdAt.getTime() : 0;
  const expired = ageMs > DEMOTION_MS;
  let effectiveAction = normalizeAction(signal.action);
  let demotedFrom = null;

  if (expired && effectiveAction === ACTIONS.STRONG_BUY) {
    demotedFrom = ACTIONS.STRONG_BUY;
    effectiveAction = ACTIONS.BUY_ZONE;
  }

  if (expired && effectiveAction === ACTIONS.SELL_ZONE) {
    demotedFrom = ACTIONS.SELL_ZONE;
    effectiveAction = ACTIONS.WAIT_ZONE;
  }

  return {
    ...signal,
    rawAction: normalizeAction(signal.action),
    action: effectiveAction,
    meta: actionMeta(effectiveAction),
    demotedFrom,
    expired,
    ageHours: Math.max(0, Math.round((ageMs / (60 * 60 * 1000)) * 10) / 10)
  };
}

function createSignal(payload, now = new Date()) {
  if (!payload || typeof payload !== "object") {
    throw new Error("payload body is required");
  }

  const symbol = normalizeSymbol(payload.symbol);
  const action = normalizeAction(payload.action);
  const price = numericOrNull(payload.price);
  const p10 = numericOrNull(payload.p10 ?? payload.P10);
  const p90 = numericOrNull(payload.p90 ?? payload.P90);
  const percentile = confidencePercentile({ current: price, p10, p90 });

  return {
    id: `${symbol}-${now.getTime()}`,
    symbol,
    action,
    price,
    timeframe: String(payload.timeframe || "1D").toUpperCase(),
    p10,
    p90,
    percentile,
    source: payload.source || "tradingview",
    receivedAt: now.toISOString()
  };
}

module.exports = {
  ACTIONS,
  ACTION_META,
  DEMOTION_MS,
  TRACKED_ASSETS,
  actionMeta,
  applyAutoDemotion,
  confidencePercentile,
  createDefaultSignal,
  createSignal,
  isThaiAsset,
  normalizeAction,
  normalizeSymbol,
  numericOrNull
};
