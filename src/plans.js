"use strict";

const { TRACKED_ASSETS, normalizeSymbol } = require("./signalEngine");

const FIAT_ASSETS = Object.freeze(["USDTHB", "JPYTHB", "EURTHB", "USDJPY", "EURUSD"]);
const ADVANCED_ASSETS = Object.freeze(["XAUTHB", "BTCTHB", "XAUUSD", "BTCUSD"]);
const ALL_ASSETS = Object.freeze([...FIAT_ASSETS, ...ADVANCED_ASSETS]);
const PLAN_IDS = Object.freeze(["free", "plus", "pro", "business"]);

const PLANS = Object.freeze({
  free: {
    id: "free",
    name: "Free",
    audience: "Lead magnet for people checking one exchange goal.",
    prices: { thbMonthly: 0, usdMonthly: 0 },
    watchlistLimit: 1,
    assetUniverse: FIAT_ASSETS,
    alertChannels: ["email"],
    realTimeAlerts: false,
    alertDelayMinutes: 180,
    weeklyMajorAlertLimit: 2,
    majorAlertsOnly: true,
    twoWayAlerts: false,
    features: [
      "One watchlist item",
      "Limited fiat status",
      "Weekly rate pulse",
      "Delayed major opportunity alerts",
      "Generic historical examples"
    ]
  },
  plus: {
    id: "plus",
    name: "Plus",
    audience: "Travelers and currency savers who want real-time fiat alerts.",
    prices: { thbMonthly: 199, usdMonthly: 7 },
    watchlistLimit: 5,
    assetUniverse: FIAT_ASSETS,
    alertChannels: ["email", "line", "telegram"],
    realTimeAlerts: true,
    alertDelayMinutes: 0,
    weeklyMajorAlertLimit: null,
    majorAlertsOnly: false,
    twoWayAlerts: false,
    features: [
      "Five watchlist items",
      "Real-time fiat opportunity alerts",
      "Daily decision card",
      "Personalized historical examples",
      "Timing window visibility",
      "Email plus LINE or Telegram routing"
    ]
  },
  pro: {
    id: "pro",
    name: "Pro",
    audience: "Serious savers tracking currencies, gold, and bitcoin.",
    prices: { thbMonthly: 499, usdMonthly: 19 },
    watchlistLimit: 20,
    assetUniverse: ALL_ASSETS,
    alertChannels: ["email", "line", "telegram"],
    realTimeAlerts: true,
    alertDelayMinutes: 0,
    weeklyMajorAlertLimit: null,
    majorAlertsOnly: false,
    twoWayAlerts: true,
    features: [
      "Twenty watchlist items",
      "Fiat, gold, and bitcoin alerts",
      "Two-way opportunity and expensive-zone alerts",
      "Advanced confidence score",
      "Historical replay windows",
      "Priority alert queue"
    ]
  },
  business: {
    id: "business",
    name: "Business",
    audience: "SME import/export teams and invoice-driven currency exposure.",
    prices: { thbMonthly: 1990, usdMonthly: 49 },
    watchlistLimit: 100,
    assetUniverse: ALL_ASSETS,
    alertChannels: ["email", "team_email", "line", "telegram"],
    realTimeAlerts: true,
    alertDelayMinutes: 0,
    weeklyMajorAlertLimit: null,
    majorAlertsOnly: false,
    twoWayAlerts: true,
    features: [
      "Team watchlists",
      "Invoice exposure tracking",
      "Due-date currency alerts",
      "Weekly FX risk report",
      "CSV-ready workflow",
      "Business support queue"
    ]
  }
});

function normalizePlan(plan) {
  const normalized = String(plan || "free").trim().toLowerCase();
  return Object.prototype.hasOwnProperty.call(PLANS, normalized) ? normalized : "free";
}

function planFor(plan) {
  return PLANS[normalizePlan(plan)];
}

function publicPlan(plan) {
  const resolved = planFor(plan);

  return {
    id: resolved.id,
    name: resolved.name,
    audience: resolved.audience,
    prices: resolved.prices,
    watchlistLimit: resolved.watchlistLimit,
    assetUniverse: resolved.assetUniverse,
    alertChannels: resolved.alertChannels,
    realTimeAlerts: resolved.realTimeAlerts,
    alertDelayMinutes: resolved.alertDelayMinutes,
    weeklyMajorAlertLimit: resolved.weeklyMajorAlertLimit,
    majorAlertsOnly: resolved.majorAlertsOnly,
    twoWayAlerts: resolved.twoWayAlerts,
    features: resolved.features
  };
}

function publicPlans() {
  return PLAN_IDS.map(publicPlan);
}

function assetGroup(symbol) {
  const normalized = normalizeSymbol(symbol);

  if (FIAT_ASSETS.includes(normalized)) {
    return "fiat";
  }

  if (ADVANCED_ASSETS.includes(normalized)) {
    return "advanced";
  }

  return "unknown";
}

function isAssetAllowedForPlan(symbol, plan) {
  try {
    const normalized = normalizeSymbol(symbol);
    return planFor(plan).assetUniverse.includes(normalized);
  } catch (error) {
    return false;
  }
}

function arrayFromInput(value) {
  if (Array.isArray(value)) {
    return value;
  }

  if (typeof value === "string") {
    return value
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean);
  }

  return [];
}

function sanitizeWatchlist(value, plan) {
  const resolved = planFor(plan);
  const accepted = [];
  const rejected = [];
  const seen = new Set();

  for (const rawSymbol of arrayFromInput(value)) {
    let symbol;

    try {
      symbol = normalizeSymbol(rawSymbol);
    } catch (error) {
      rejected.push({ symbol: String(rawSymbol || ""), reason: "invalid_symbol" });
      continue;
    }

    if (!TRACKED_ASSETS.includes(symbol)) {
      rejected.push({ symbol, reason: "unsupported_asset" });
      continue;
    }

    if (!resolved.assetUniverse.includes(symbol)) {
      rejected.push({ symbol, reason: "plan_locked_asset" });
      continue;
    }

    if (seen.has(symbol)) {
      continue;
    }

    if (accepted.length >= resolved.watchlistLimit) {
      rejected.push({ symbol, reason: "watchlist_limit_reached" });
      continue;
    }

    accepted.push(symbol);
    seen.add(symbol);
  }

  return {
    watchlist: accepted,
    rejected,
    limit: resolved.watchlistLimit,
    allowedAssets: resolved.assetUniverse
  };
}

function sanitizeChannels(value, plan) {
  const resolved = planFor(plan);
  const requested = arrayFromInput(value).map((channel) => String(channel).trim().toLowerCase());
  const accepted = requested.filter((channel, index) => {
    return resolved.alertChannels.includes(channel) && requested.indexOf(channel) === index;
  });

  return accepted.length > 0 ? accepted : [resolved.alertChannels[0]];
}

function subscriberEntitlements(subscriber) {
  const plan = planFor(subscriber?.plan);

  return {
    plan: plan.id,
    watchlistLimit: plan.watchlistLimit,
    assetUniverse: plan.assetUniverse,
    alertChannels: plan.alertChannels,
    realTimeAlerts: plan.realTimeAlerts,
    alertDelayMinutes: plan.alertDelayMinutes,
    majorAlertsOnly: plan.majorAlertsOnly,
    twoWayAlerts: plan.twoWayAlerts,
    invoiceTracking: plan.id === "business"
  };
}

function signalCanNotifyPlan(signal, plan) {
  const resolved = planFor(plan);
  const action = String(signal?.action || "").toUpperCase();

  if (!isAssetAllowedForPlan(signal?.symbol, resolved.id)) {
    return false;
  }

  if (action === "STRONG_BUY") {
    return true;
  }

  return resolved.twoWayAlerts && action === "SELL_ZONE";
}

function deliveryDecisionForSignal(subscriber, signal) {
  const plan = planFor(subscriber?.plan);
  const watchlist = Array.isArray(subscriber?.watchlist) ? subscriber.watchlist : [];
  const symbol = String(signal?.symbol || "").toUpperCase();

  if (!signalCanNotifyPlan(signal, plan.id)) {
    return { eligible: false, reason: "plan_not_eligible" };
  }

  if (watchlist.length > 0 && !watchlist.includes(symbol)) {
    return { eligible: false, reason: "not_in_watchlist" };
  }

  return {
    eligible: true,
    plan: plan.id,
    delayMinutes: plan.alertDelayMinutes,
    channels: sanitizeChannels(subscriber?.channels, plan.id)
  };
}

module.exports = {
  ADVANCED_ASSETS,
  ALL_ASSETS,
  FIAT_ASSETS,
  PLAN_IDS,
  PLANS,
  assetGroup,
  deliveryDecisionForSignal,
  isAssetAllowedForPlan,
  normalizePlan,
  planFor,
  publicPlan,
  publicPlans,
  sanitizeChannels,
  sanitizeWatchlist,
  signalCanNotifyPlan,
  subscriberEntitlements
};
