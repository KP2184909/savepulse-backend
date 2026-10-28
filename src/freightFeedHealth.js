"use strict";
const ROUTES = require("../public/freightpulse/routes");
const SYMBOLS = [...Object.keys(ROUTES), "BDI", "ZIM"];
const epoch = value => typeof value === "string" && Number.isFinite(Date.parse(value)) ? Date.parse(value) : null;

// Operational evidence only. Receipt time and an available chart bar never prove
// source freshness, a closed realtime bar, or commercial redistribution rights.
function freightFeedHealth({ observedAt, receipts = [], observations = [] } = {}) {
  const now = epoch(observedAt);
  if (now === null) throw Error("valid_observed_at_required");
  const rows = SYMBOLS.map(symbol => {
    const candidates = receipts.filter(r => r.symbol === symbol && epoch(r.barTime) !== null && epoch(r.receivedAt) !== null && epoch(r.receivedAt) <= now && epoch(r.barTime) <= epoch(r.receivedAt));
    candidates.sort((a,b) => epoch(b.barTime)-epoch(a.barTime) || epoch(b.receivedAt)-epoch(a.receivedAt));
    const receipt = candidates[0];
    const observation = observations.find(r => r.symbol === symbol) || {};
    const rawLast = epoch(observation.lastBarOpen), rawStart = epoch(observation.reviewStart);
    const last = rawLast !== null && rawLast <= now ? rawLast : null;
    const start = rawStart !== null && rawStart <= now ? rawStart : null;
    const source = epoch(receipt?.sourceUpdatedAt);
    const validSource = source !== null && source <= epoch(receipt?.receivedAt);
    const sourceEvidence = last !== null && start !== null && last < start
      ? "latest_available_bar_precedes_review_start"
      : last !== null ? "chart_bar_available_unverified_close" : "not_observed";
    return {
      symbol, route: ROUTES[symbol]?.name || null,
      receiptStatus: receipt ? "persisted" : "not_received",
      barTime: receipt?.barTime || null, receivedAt: receipt?.receivedAt || null,
      sourceFreshness: receipt?.sourceFreshness === "known" && validSource ? "known_requires_policy" : "unknown",
      sourceUpdatedAt: validSource ? receipt.sourceUpdatedAt : null,
      current: false,
      sourceEvidence, lastBarOpen: last === null ? null : observation.lastBarOpen,
      reviewStart: start === null ? null : observation.reviewStart,
    };
  });
  const received = rows.filter(r => r.receiptStatus === "persisted").length;
  return { observedAt, mode: "sandbox", expected: SYMBOLS.length, received,
    missing: SYMBOLS.length-received, liveReady: false, rows };
}
module.exports = { freightFeedHealth };
