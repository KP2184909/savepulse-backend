"use strict";

const { COMMODITY_ASSETS, normalizeSymbol } = require("./signalEngine");
const SYMBOLS = Object.freeze(Object.keys(COMMODITY_ASSETS));
const escapeHtml = value => String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
const parsedTime = value => typeof value === "string" && Number.isFinite(Date.parse(value)) ? Date.parse(value) : null;

// This prepares a reviewable internal report, not customer delivery. A later
// commercial rollout needs independently verified source and distribution rights.
function buildBusinessCommodityReport({ signals = [], generatedAt, maxBarAgeHours = 72 } = {}) {
  const now = parsedTime(generatedAt);
  if (now === null || !Number.isFinite(maxBarAgeHours) || maxBarAgeHours <= 0) throw Error("invalid_report_configuration");
  const rows = SYMBOLS.map(symbol => {
    const meta = COMMODITY_ASSETS[symbol];
    const candidates = signals.filter(s => s?.symbol === symbol && parsedTime(s?.pine?.barTime) !== null)
      .sort((a,b) => parsedTime(b.pine.barTime) - parsedTime(a.pine.barTime));
    const signal = candidates[0];
    if (!signal) return { symbol, name: meta.en, unit: `${meta.currency}/${meta.unit}`, status: "missing", price: null, barTime: null };
    const barTime = parsedTime(signal.pine.barTime), receivedAt = parsedTime(signal.receivedAt);
    let identityValid = false;
    try { identityValid = Boolean(signal.sourceTicker) && normalizeSymbol(signal.sourceTicker) === symbol && signal.sourceTicker.toUpperCase() === meta.ticker; } catch (_) {}
    const validPrice = typeof signal.price === "number" && Number.isFinite(signal.price) && signal.price > 0;
    const timely = barTime <= now && now - barTime <= maxBarAgeHours * 3600000 && receivedAt !== null && receivedAt >= barTime && receivedAt <= now;
    const status = !identityValid ? "source_unverified" : !validPrice ? "invalid_price" : !timely ? "stale_or_invalid_time" : "source_freshness_unverified";
    return { symbol, name: meta.en, unit: `${meta.currency}/${meta.unit}`, status, price: null, barTime: signal.pine.barTime };
  });
  const lines = rows.map(r => `${r.name}: ${r.status.replaceAll("_", " ")} · ${r.unit}${r.barTime ? ` · bar opened ${r.barTime}` : ""}`);
  const intro = "INTERNAL TEST — Commodity reference benchmarks. Continuous futures can be affected by contract rollover and are not supplier quotes. No purchasing recommendation or conversion is implied.";
  return { mode: "internal_test", generatedAt, customerDeliveryEnabled: false, rows, subject: "[TEST] SavePulse Business — commodity reference review", text: [intro, "", ...lines].join("\n"), html: `<h1>SavePulse Business — internal test</h1><p>${escapeHtml(intro)}</p><ul>${lines.map(l => `<li>${escapeHtml(l)}</li>`).join("")}</ul>` };
}
module.exports = { buildBusinessCommodityReport };
