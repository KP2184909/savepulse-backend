"use strict";

const { TRACKED_ASSETS } = require("./signalEngine");
const { normalizePlan } = require("./plans");

const REQUIRED_DAILY_SIGNAL_SYMBOLS = Object.freeze([...TRACKED_ASSETS]);
const DEFAULT_DAILY_EMAIL_TIME = "08:30";
const DEFAULT_DAILY_EMAIL_TIMEZONE = "Asia/Bangkok";
const DEFAULT_SIGNAL_FRESHNESS_HOURS = 36;
let emailLogCounter = 0;

function emailIsValid(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || "").trim());
}

function asDate(value) {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  if (typeof value === "number") {
    const timestamp = value > 10_000_000_000 ? value : value * 1000;
    const date = new Date(timestamp);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  if (/^\d+$/.test(String(value))) {
    return asDate(Number(value));
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function signalTimestamp(signal = {}) {
  const candidates = [
    signal.receivedAt,
    signal.received_at,
    signal.updatedAt,
    signal.updated_at,
    signal.createdAt,
    signal.created_at,
    signal.barTime,
    signal.bar_time,
    signal.time
  ];

  return candidates.map(asDate).filter(Boolean).sort((a, b) => b.getTime() - a.getTime())[0] || null;
}

function localDateKey(now = new Date(), timeZone = DEFAULT_DAILY_EMAIL_TIMEZONE) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });
  const parts = Object.fromEntries(formatter.formatToParts(now).map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function assessSignalReadiness(signals = [], options = {}) {
  const requiredSymbols = options.requiredSymbols || REQUIRED_DAILY_SIGNAL_SYMBOLS;
  const now = asDate(options.now) || new Date();
  const maxAgeHours = Number(options.maxAgeHours || DEFAULT_SIGNAL_FRESHNESS_HOURS);
  const timeZone = options.timeZone || DEFAULT_DAILY_EMAIL_TIMEZONE;
  const latestBySymbol = new Map();

  for (const signal of signals || []) {
    const symbol = String(signal?.symbol || "").trim().toUpperCase();
    if (!requiredSymbols.includes(symbol)) {
      continue;
    }

    const timestamp = signalTimestamp(signal);
    const current = latestBySymbol.get(symbol);
    const currentTimestamp = signalTimestamp(current);

    if (!current || ((timestamp?.getTime() || 0) > (currentTimestamp?.getTime() || 0))) {
      latestBySymbol.set(symbol, signal);
    }
  }

  const missingSymbols = requiredSymbols.filter((symbol) => !latestBySymbol.has(symbol));
  const staleSymbols = [];

  for (const symbol of requiredSymbols) {
    const timestamp = signalTimestamp(latestBySymbol.get(symbol));
    if (!timestamp) {
      if (!missingSymbols.includes(symbol)) {
        staleSymbols.push(symbol);
      }
      continue;
    }

    const ageHours = (now.getTime() - timestamp.getTime()) / 3_600_000;
    if (ageHours > maxAgeHours || ageHours < -1) {
      staleSymbols.push(symbol);
    }
  }

  return {
    ready: missingSymbols.length === 0 && staleSymbols.length === 0,
    requiredSymbols,
    presentSymbols: requiredSymbols.filter((symbol) => latestBySymbol.has(symbol)),
    missingSymbols,
    staleSymbols,
    signalSnapshotDate: localDateKey(now, timeZone),
    checkedAt: now.toISOString(),
    maxAgeHours,
    timeZone
  };
}

function templateTypeForPlan(plan) {
  const normalized = normalizePlan(plan);
  return {
    free: "daily_pulse_lite",
    plus: "daily_decision_card",
    pro: "full_timing_radar",
    business: "invoice_risk_brief"
  }[normalized] || "daily_pulse_lite";
}

function subscriberSkipReason(subscriber = {}) {
  if (!emailIsValid(subscriber.email)) {
    return "invalid_email";
  }

  if (
    subscriber.dailyDigest === false ||
    subscriber.unsubscribedAt ||
    subscriber.unsubscribed_at ||
    subscriber.preferences?.dailyDigest === false ||
    subscriber.emailPreferences?.dailyDigest === false ||
    subscriber.emailPreferences?.unsubscribed === true
  ) {
    return "unsubscribed";
  }

  return "";
}

function subscriberDailyEmailEligible(subscriber = {}) {
  return !subscriberSkipReason(subscriber);
}

function subscriberId(subscriber = {}) {
  return String(subscriber.id || subscriber.subscriber_id || subscriber.email || "").trim().toLowerCase();
}

function isDuplicateDailyEmail(logs = [], subscriber = {}, templateType = "", signalSnapshotDate = "") {
  const id = subscriberId(subscriber);
  const email = String(subscriber.email || "").trim().toLowerCase();

  return logs.some((log) => {
    const logSubscriber = String(log.subscriber_id || "").trim().toLowerCase();
    const logEmail = String(log.email || "").trim().toLowerCase();

    return (
      (logSubscriber === id || (email && logEmail === email)) &&
      log.template_type === templateType &&
      log.signal_snapshot_date === signalSnapshotDate &&
      ["pending", "sent"].includes(log.status)
    );
  });
}

function createEmailLogEntry({
  subscriber = {},
  plan = "",
  templateType = "",
  status = "pending",
  skippedReason = "",
  errorMessage = "",
  providerMessageId = "",
  signalSnapshotDate = "",
  now = new Date()
} = {}) {
  const createdAt = (asDate(now) || new Date()).toISOString();
  emailLogCounter = (emailLogCounter + 1) % 1_000_000;
  const idPrefix = createdAt.replace(/[^0-9]/g, "");

  return {
    id: `${idPrefix}-${emailLogCounter}-${templateType || templateTypeForPlan(plan || subscriber.plan)}-${signalSnapshotDate || "daily"}-${cryptoSafeId(subscriber.email || subscriberId(subscriber))}`,
    subscriber_id: subscriberId(subscriber),
    email: String(subscriber.email || "").trim().toLowerCase(),
    plan: normalizePlan(plan || subscriber.plan || "free"),
    template_type: templateType || templateTypeForPlan(plan || subscriber.plan),
    status,
    skipped_reason: skippedReason,
    error_message: truncateForAdmin(errorMessage),
    provider_message_id: truncateForAdmin(providerMessageId, 96),
    signal_snapshot_date: signalSnapshotDate,
    created_at: createdAt,
    sent_at: status === "sent" ? createdAt : ""
  };
}

function truncateForAdmin(value, max = 180) {
  const text = String(value || "").trim();
  if (!text) {
    return "";
  }
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function cryptoSafeId(value) {
  return String(value || "subscriber")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "subscriber";
}

function sanitizeEmailLogForAdmin(log = {}) {
  return {
    id: log.id,
    subscriber_id: log.subscriber_id,
    email: log.email,
    plan: log.plan,
    template_type: log.template_type,
    status: log.status,
    skipped_reason: log.skipped_reason,
    error_message: truncateForAdmin(log.error_message),
    provider_message_id: truncateForAdmin(log.provider_message_id, 96),
    signal_snapshot_date: log.signal_snapshot_date,
    created_at: log.created_at,
    sent_at: log.sent_at
  };
}

function normalizeDirection(watchlistItem = {}) {
  const from = watchlistItem.from || watchlistItem.fromCurrency || watchlistItem.userFromCurrency;
  const to = watchlistItem.to || watchlistItem.toCurrency || watchlistItem.userToCurrency;

  if (!from || !to) {
    return null;
  }

  return {
    from: String(from).trim().toUpperCase(),
    to: String(to).trim().toUpperCase()
  };
}

function signalsForSubscriber(signals = [], subscriber = {}) {
  const watchlist = Array.isArray(subscriber.watchlist) ? subscriber.watchlist : [];
  const directionBySymbol = new Map();

  for (const item of watchlist) {
    if (typeof item === "string") {
      continue;
    }

    const symbol = String(item.symbol || "").trim().toUpperCase();
    const direction = normalizeDirection(item);
    if (symbol && direction) {
      directionBySymbol.set(symbol, direction);
    }
  }

  return (signals || []).map((signal) => {
    const symbol = String(signal?.symbol || "").trim().toUpperCase();
    const userDirection = directionBySymbol.get(symbol);
    return userDirection ? { ...signal, userDirection } : { ...signal };
  });
}

module.exports = {
  DEFAULT_DAILY_EMAIL_TIME,
  DEFAULT_DAILY_EMAIL_TIMEZONE,
  DEFAULT_SIGNAL_FRESHNESS_HOURS,
  REQUIRED_DAILY_SIGNAL_SYMBOLS,
  asDate,
  assessSignalReadiness,
  createEmailLogEntry,
  emailIsValid,
  isDuplicateDailyEmail,
  localDateKey,
  sanitizeEmailLogForAdmin,
  signalTimestamp,
  signalsForSubscriber,
  subscriberDailyEmailEligible,
  subscriberId,
  subscriberSkipReason,
  templateTypeForPlan,
  truncateForAdmin
};
