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

const ACTION_ALIASES = Object.freeze({
  BUY: ACTIONS.STRONG_BUY,
  LONG: ACTIONS.STRONG_BUY,
  STRONGBUY: ACTIONS.STRONG_BUY,
  BUY_SIGNAL: ACTIONS.STRONG_BUY,
  SUPERTREND_BUY: ACTIONS.STRONG_BUY,
  SUPER_TREND_BUY: ACTIONS.STRONG_BUY,
  SELL: ACTIONS.SELL_ZONE,
  SHORT: ACTIONS.SELL_ZONE,
  EXITSELL: ACTIONS.SELL_ZONE,
  EXIT_SELL: ACTIONS.SELL_ZONE,
  SELL_SIGNAL: ACTIONS.SELL_ZONE,
  SUPERTREND_SELL: ACTIONS.SELL_ZONE,
  SUPER_TREND_SELL: ACTIONS.SELL_ZONE,
  WAIT: ACTIONS.WAIT_ZONE,
  HOLD: ACTIONS.WAIT_ZONE,
  NEUTRAL: ACTIONS.WAIT_ZONE
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
  ...ACTION_META.WAIT_ZONE,
  en: {
    label: "Entry Window Expired",
    headline: "Wait now, do not chase",
    guidance:
      "The trend may still look positive, but the five-business-day low-regret window has passed."
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

  const cleaned = symbol.trim().toUpperCase().replace(/\s+/g, "");
  const withoutExchange = cleaned.includes(":") ? cleaned.split(":").at(-1) : cleaned;
  const normalized = withoutExchange.replace(/[^A-Z0-9]/g, "");

  if (!/^[A-Z0-9]{3,24}$/.test(normalized)) {
    throw new Error("symbol must normalize to 3-24 alphanumeric chars");
  }

  return normalized;
}

function normalizeAction(action) {
  if (typeof action !== "string") {
    throw new Error("action is required");
  }

  const normalized = action.trim().toUpperCase().replace(/[\s-]+/g, "_");
  if (!Object.prototype.hasOwnProperty.call(ACTIONS, normalized)) {
    const compact = normalized.replace(/[^A-Z0-9]/g, "");
    const alias = ACTION_ALIASES[normalized] || ACTION_ALIASES[compact];

    if (alias) {
      return alias;
    }

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
  const shifted = new Date(date.getTime() + BANGKOK_OFFSET_MS);
  return (
    Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate()) -
    BANGKOK_OFFSET_MS
  );
}

function isBangkokBusinessDay(dayStartMs) {
  const shifted = new Date(dayStartMs + BANGKOK_OFFSET_MS);
  const day = shifted.getUTCDay();
  return day !== 0 && day !== 6;
}

function businessDaysElapsed(start, end) {
  if (!(start instanceof Date) || !(end instanceof Date)) {
    return null;
  }

  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) {
    return null;
  }

  const startDayMs = bangkokDayStartMs(start);
  const endDayMs = bangkokDayStartMs(end);

  if (endDayMs < startDayMs) {
    return 0;
  }

  let count = 0;
  for (let dayMs = startDayMs; dayMs <= endDayMs; dayMs += DAY_MS) {
    if (isBangkokBusinessDay(dayMs)) {
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
  const hasValidCreatedAt = Number.isFinite(createdAt.getTime());
  const ageMs = hasValidCreatedAt ? now.getTime() - createdAt.getTime() : 0;
  const elapsedBusinessDays = hasValidCreatedAt ? businessDaysElapsed(createdAt, now) : null;
  let expired = false;
  let decisionWindowExpired = false;
  const rawAction = normalizeAction(signal.action);
  let effectiveAction = rawAction;
  let demotedFrom = null;

  if (
    effectiveAction === ACTIONS.STRONG_BUY &&
    elapsedBusinessDays !== null &&
    elapsedBusinessDays > BUY_WINDOW_BUSINESS_DAYS
  ) {
    demotedFrom = ACTIONS.STRONG_BUY;
    effectiveAction = ACTIONS.WAIT_ZONE;
    expired = true;
    decisionWindowExpired = true;
  } else if (
    effectiveAction === ACTIONS.STRONG_BUY &&
    elapsedBusinessDays !== null &&
    elapsedBusinessDays > STRONG_BUY_FRESH_BUSINESS_DAYS
  ) {
    demotedFrom = ACTIONS.STRONG_BUY;
    effectiveAction = ACTIONS.BUY_ZONE;
  }

  if (ageMs > DEMOTION_MS && effectiveAction === ACTIONS.SELL_ZONE) {
    demotedFrom = ACTIONS.SELL_ZONE;
    effectiveAction = ACTIONS.WAIT_ZONE;
    expired = true;
  }

  return {
    ...signal,
    rawAction,
    action: effectiveAction,
    meta: decisionWindowExpired ? ENTRY_WINDOW_EXPIRED_META : actionMeta(effectiveAction),
    demotedFrom,
    expired,
    decisionWindowExpired,
    buyWindowBusinessDays: BUY_WINDOW_BUSINESS_DAYS,
    businessDaysElapsed: elapsedBusinessDays,
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
  ACTION_ALIASES,
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
