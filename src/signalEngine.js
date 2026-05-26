"use strict";

const DAY_MS = 24 * 60 * 60 * 1000;
const BANGKOK_OFFSET_MS = 7 * 60 * 60 * 1000;
const DEMOTION_MS = DAY_MS;
const STRONG_BUY_FRESH_BUSINESS_DAYS = 1;
const BUY_WINDOW_BUSINESS_DAYS = 5;

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

const ENTRY_WINDOW_EXPIRED_META = Object.freeze({
  tone: "amber",
  severity: 3,
  orbClass: "orb-amber",
  en: {
    label: "Wait Now",
    headline: "The 5-business-day entry window has expired",
    guidance: "Even if the indicator remains in buy mode, SavePulse avoids chasing after the low-regret decision window closes."
  },
  th: {
    label: "รอก่อน ยังไม่ควรซื้อตอนนี้",
    headline: "หน้าต่างซื้อ 5 วันทำการจบแล้ว",
    guidance: "แม้อินดิเคเตอร์อาจยังเป็น Buy แต่ช่วงตัดสินใจที่ลดความเสี่ยงเสียใจได้ผ่านไปแล้ว"
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

function bangkokDayStartMs(date) {
  const time = date instanceof Date ? date.getTime() : new Date(date).getTime();
  if (!Number.isFinite(time)) {
    return null;
  }

  return Math.floor((time + BANGKOK_OFFSET_MS) / DAY_MS) * DAY_MS - BANGKOK_OFFSET_MS;
}

function isBangkokBusinessDay(dayStartMs) {
  const bangkokMidnight = new Date(dayStartMs + BANGKOK_OFFSET_MS);
  const day = bangkokMidnight.getUTCDay();
  return day >= 1 && day <= 5;
}

function businessDaysElapsed(start, end = new Date()) {
  const startDay = bangkokDayStartMs(start);
  const endDay = bangkokDayStartMs(end);

  if (startDay === null || endDay === null || endDay < startDay) {
    return null;
  }

  let count = 0;
  for (let day = startDay; day <= endDay; day += DAY_MS) {
    if (isBangkokBusinessDay(day)) {
      count += 1;
    }
  }

  return count;
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
  let decisionWindowExpired = false;
  let businessDayAge = null;

  if (effectiveAction === ACTIONS.STRONG_BUY) {
    businessDayAge = businessDaysElapsed(createdAt, now);

    if (businessDayAge > BUY_WINDOW_BUSINESS_DAYS) {
      demotedFrom = ACTIONS.STRONG_BUY;
      effectiveAction = ACTIONS.WAIT_ZONE;
      decisionWindowExpired = true;
    } else if (businessDayAge > STRONG_BUY_FRESH_BUSINESS_DAYS) {
      demotedFrom = ACTIONS.STRONG_BUY;
      effectiveAction = ACTIONS.BUY_ZONE;
    }
  }

  if (expired && effectiveAction === ACTIONS.SELL_ZONE) {
    demotedFrom = ACTIONS.SELL_ZONE;
    effectiveAction = ACTIONS.WAIT_ZONE;
  }

  return {
    ...signal,
    rawAction: normalizeAction(signal.action),
    action: effectiveAction,
    meta: decisionWindowExpired ? ENTRY_WINDOW_EXPIRED_META : actionMeta(effectiveAction),
    demotedFrom,
    expired,
    decisionWindowExpired,
    buyWindowBusinessDays: BUY_WINDOW_BUSINESS_DAYS,
    businessDaysElapsed: businessDayAge,
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
  BUY_WINDOW_BUSINESS_DAYS,
  DEMOTION_MS,
  ENTRY_WINDOW_EXPIRED_META,
  STRONG_BUY_FRESH_BUSINESS_DAYS,
  TRACKED_ASSETS,
  actionMeta,
  applyAutoDemotion,
  businessDaysElapsed,
  confidencePercentile,
  createDefaultSignal,
  createSignal,
  isThaiAsset,
  normalizeAction,
  normalizeSymbol,
  numericOrNull
};
