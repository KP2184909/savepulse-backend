"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { assessSignalReadiness, signalTimestamp } = require("../src/dailyEmailScheduler");
const now = new Date("2026-11-09T03:00:00Z");
const assess = signals => assessSignalReadiness(signals, { now, requiredSymbols: ["USDTHB"], maxAgeHours: 36 });

test("recent delivery cannot refresh an old Pine source bar", () => {
  const signal = { symbol: "USDTHB", source: "tradingview", receivedAt: now, updatedAt: now, pine: { barTime: Date.parse("2026-10-01T00:00:00Z") } };
  assert.deepEqual(assess([signal]).staleSymbols, ["USDTHB"]);
  assert.equal(signalTimestamp(signal).toISOString(), "2026-10-01T00:00:00.000Z");
});

test("fresh source bars accept seconds, milliseconds and ISO representations", () => {
  const stamp = Date.parse("2026-11-08T22:00:00Z");
  for (const barTime of [stamp, stamp / 1000, String(stamp), new Date(stamp).toISOString()]) {
    assert.equal(assess([{ symbol: "USDTHB", pine: { barTime } }]).ready, true);
  }
});

test("unknown, invalid and future TradingView observation dates fail readiness", () => {
  for (const signal of [
    { source: "tradingview" },
    { pine: {} },
    { pine: { barTime: "invalid" } },
    { bar_time: "2026-11-10T22:00:00Z" }
  ]) {
    assert.equal(assess([{ symbol: "USDTHB", receivedAt: now, ...signal }]).ready, false);
  }
});

test("an old replay does not displace a newer source observation", () => {
  const fresh = { symbol: "USDTHB", pine: { barTime: "2026-11-08T22:00:00Z" }, receivedAt: "2026-11-08T23:00:00Z" };
  const replay = { symbol: "USDTHB", pine: { barTime: "2026-10-01T00:00:00Z" }, receivedAt: now };
  assert.equal(assess([fresh, replay]).ready, true);
  assert.equal(assess([replay, fresh]).ready, true);
});

test("conflicting source timestamps use the older observation conservatively", () => {
  assert.equal(assess([{ symbol: "USDTHB", barTime: now, pine: { barTime: "2026-10-01T00:00:00Z" } }]).ready, false);
});
