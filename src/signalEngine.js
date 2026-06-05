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

const SYMBOL_MARKETS = Object.freeze({
  USDTHB: { base: "USD", quote: "THB" },
  JPYTHB: { base: "JPY", quote: "THB" },
  EURTHB: { base: "EUR", quote: "THB" },
  XAUTHB: { base: "XAU", quote: "THB" },
  BTCTHB: { base: "BTC", quote: "THB" },
  USDJPY: { base: "USD", quote: "JPY" },
  EURUSD: { base: "EUR", quote: "USD" },
  XAUUSD: { base: "XAU", quote: "USD" },
  BTCUSD: { base: "BTC", quote: "USD" }
});

const CURRENCY_ALIASES = Object.freeze({
  GOLD: "XAU",
  XAU: "XAU",
  BITCOIN: "BTC",
  BTC: "BTC",
  USD: "USD",
  THB: "THB",
  JPY: "JPY",
  EUR: "EUR"
});

const INVERTED_ACTIONS = Object.freeze({
  [ACTIONS.STRONG_BUY]: ACTIONS.SELL_ZONE,
  [ACTIONS.BUY_ZONE]: ACTIONS.SELL_ZONE,
  [ACTIONS.WAIT_ZONE]: ACTIONS.WAIT_ZONE,
  [ACTIONS.SELL_ZONE]: ACTIONS.BUY_ZONE
});

const USER_FACING_ACTION_COPY = Object.freeze({
  [ACTIONS.STRONG_BUY]: {
    th: "แลกได้เลย",
    en: "Good time to exchange"
  },
  [ACTIONS.BUY_ZONE]: {
    th: "เริ่มน่าจับตา",
    en: "Worth watching"
  },
  [ACTIONS.WAIT_ZONE]: {
    th: "ยังไม่ต้องรีบ",
    en: "Not urgent yet"
  },
  [ACTIONS.SELL_ZONE]: {
    th: "รอก่อน",
    en: "Wait for now"
  }
});

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

function normalizeCurrencyCode(currency) {
  if (typeof currency !== "string") {
    return "";
  }

  const normalized = currency.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  return CURRENCY_ALIASES[normalized] || normalized;
}

function marketForSymbol(symbol) {
  return SYMBOL_MARKETS[normalizeSymbol(symbol)] || null;
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

function invertAction(action) {
  return INVERTED_ACTIONS[normalizeAction(action)] || ACTIONS.WAIT_ZONE;
}

function directionCopy({ action, base, quote, direction }) {
  if (direction === "canonical" && (action === ACTIONS.STRONG_BUY || action === ACTIONS.BUY_ZONE)) {
    return {
      th: `ถ้าคุณถือ ${base} อยู่ จังหวะนี้เริ่มค่อนข้างดีเมื่อเทียบกับ ${quote}`,
      en: `If you hold ${base}, this timing is starting to look relatively favorable versus ${quote}.`
    };
  }

  if (direction === "inverted" && action === ACTIONS.SELL_ZONE) {
    return {
      th: `${base} เริ่มแพงขึ้นเมื่อเทียบกับ ${quote} ถ้าคุณยังไม่รีบ อาจรอดูจังหวะที่ดีกว่านี้`,
      en: `${base} is becoming more expensive versus ${quote}. If you are not in a hurry, waiting may reduce regret risk.`
    };
  }

  if (action === ACTIONS.SELL_ZONE) {
    return {
      th: `ถ้าคุณยังไม่รีบ อาจรอดูจังหวะที่ดีกว่านี้ก่อนแลกจาก ${base} เป็น ${quote}`,
      en: `If you are not in a hurry, consider waiting before exchanging ${base} into ${quote}.`
    };
  }

  if (action === ACTIONS.WAIT_ZONE) {
    return {
      th: `เรท ${base} เทียบกับ ${quote} ยังไม่ได้ดีหรือแย่ชัดเจน`,
      en: `${base} versus ${quote} is not clearly favorable or unfavorable yet.`
    };
  }

  return {
    th: `จังหวะ ${base} เทียบกับ ${quote} เริ่มน่าจับตา แต่ยังควรเช็กแผนของคุณก่อนตัดสินใจ`,
    en: `${base} versus ${quote} is worth watching, but still check your own timing before deciding.`
  };
}

function userFacingActionForDirection({
  symbol,
  action,
  userFromCurrency,
  userToCurrency
}) {
  const normalizedSymbol = normalizeSymbol(symbol);
  const canonicalAction = normalizeAction(action);
  const market = marketForSymbol(normalizedSymbol);
  const userFrom = normalizeCurrencyCode(userFromCurrency);
  const userTo = normalizeCurrencyCode(userToCurrency);

  if (!market) {
    const fallbackAction = ACTIONS.WAIT_ZONE;
    return {
      symbol: normalizedSymbol,
      base: null,
      quote: null,
      canonicalAction,
      action: fallbackAction,
      direction: "unsupported",
      supported: false,
      inverted: false,
      label: USER_FACING_ACTION_COPY[fallbackAction],
      copy: {
        th: "ยังไม่รองรับทิศทางนี้ใน SavePulse",
        en: "This direction is not supported yet in SavePulse."
      }
    };
  }

  let direction = "unsupported";
  let resolvedAction = ACTIONS.WAIT_ZONE;
  let inverted = false;

  if (userFrom === market.base && userTo === market.quote) {
    direction = "canonical";
    resolvedAction = canonicalAction;
  } else if (userFrom === market.quote && userTo === market.base) {
    direction = "inverted";
    resolvedAction = invertAction(canonicalAction);
    inverted = true;
  }

  const supported = direction !== "unsupported";
  const label = USER_FACING_ACTION_COPY[resolvedAction] || USER_FACING_ACTION_COPY[ACTIONS.WAIT_ZONE];
  const copy = supported
    ? directionCopy({
        action: resolvedAction,
        base: market.base,
        quote: market.quote,
        direction
      })
    : {
        th: "ยังไม่รองรับทิศทางนี้ใน SavePulse",
        en: "This direction is not supported yet in SavePulse."
      };

  return {
    symbol: normalizedSymbol,
    base: market.base,
    quote: market.quote,
    canonicalAction,
    action: resolvedAction,
    direction,
    supported,
    inverted,
    label,
    copy
  };
}

function numericOrNull(value) {
  if (value === "" || value === null || value === undefined) {
    return null;
  }

  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function textOrNull(value, maxLength = 500) {
  if (value === "" || value === null || value === undefined) {
    return null;
  }

  const text = String(value).trim();
  if (!text) {
    return null;
  }

  return text.slice(0, maxLength);
}

function dateIsoOrNull(value) {
  if (value === "" || value === null || value === undefined) {
    return null;
  }

  let date;
  if (typeof value === "number" || /^\d+$/.test(String(value).trim())) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
      return null;
    }

    date = new Date(numeric < 1_000_000_000_000 ? numeric * 1000 : numeric);
  } else {
    date = new Date(value);
  }

  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function pineFieldsFromPayload(payload) {
  return {
    detail: textOrNull(payload.detail ?? payload.details ?? payload.note ?? payload.comment),
    daysInWindow: numericOrNull(payload.days_in_window ?? payload.daysInWindow),
    emaFast: numericOrNull(payload.ema_fast ?? payload.emaFast),
    emaSlow: numericOrNull(payload.ema_slow ?? payload.emaSlow),
    barTime: dateIsoOrNull(payload.bar_time ?? payload.barTime)
  };
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
  const pine = pineFieldsFromPayload(payload);

  return {
    id: `${symbol}-${now.getTime()}`,
    symbol,
    action,
    price,
    timeframe: String(payload.timeframe || "1D").toUpperCase(),
    p10,
    p90,
    percentile,
    source: textOrNull(payload.source, 80) || "tradingview",
    pine,
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
  INVERTED_ACTIONS,
  STRONG_BUY_FRESH_BUSINESS_DAYS,
  SYMBOL_MARKETS,
  TRACKED_ASSETS,
  USER_FACING_ACTION_COPY,
  actionMeta,
  applyAutoDemotion,
  businessDaysElapsed,
  confidencePercentile,
  createDefaultSignal,
  createSignal,
  invertAction,
  isThaiAsset,
  marketForSymbol,
  normalizeAction,
  normalizeCurrencyCode,
  normalizeSymbol,
  numericOrNull,
  pineFieldsFromPayload,
  userFacingActionForDirection
};
