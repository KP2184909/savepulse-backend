"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  ACTIONS,
  BUY_WINDOW_BUSINESS_DAYS,
  DEMOTION_MS,
  TRACKED_ASSETS,
  applyAutoDemotion,
  businessDaysElapsed,
  confidencePercentile,
  createDefaultSignal,
  createSignal,
  isThaiAsset
} = require("../src/signalEngine");

test("confidencePercentile applies the SavePulse P formula and clamps display output", () => {
  assert.deepEqual(confidencePercentile({ current: 120, p10: 100, p90: 200 }), {
    raw: 0.2,
    clamped: 0.2,
    percent: 20
  });

  assert.equal(confidencePercentile({ current: 300, p10: 100, p90: 200 }).percent, 100);
  assert.equal(confidencePercentile({ current: 50, p10: 100, p90: 200 }).percent, 0);
  assert.equal(confidencePercentile({ current: 120, p10: 100, p90: 100 }), null);
});

test("createSignal normalizes TradingView webhook payloads", () => {
  const signal = createSignal(
    {
      symbol: "jpythb",
      action: "strong_buy",
      price: "0.221",
      timeframe: "1d",
      p10: "0.2",
      p90: "0.3"
    },
    new Date("2026-05-26T00:00:00.000Z")
  );

  assert.equal(signal.symbol, "JPYTHB");
  assert.equal(signal.action, ACTIONS.STRONG_BUY);
  assert.equal(signal.timeframe, "1D");
  assert.equal(signal.percentile.percent, 21);
});

test("business day counter follows Bangkok Monday-Friday calendar", () => {
  const signalDay = new Date("2026-05-26T03:00:00.000Z"); // Tuesday, 10:00 Bangkok time.

  assert.equal(businessDaysElapsed(signalDay, new Date("2026-05-26T14:00:00.000Z")), 1);
  assert.equal(businessDaysElapsed(signalDay, new Date("2026-06-01T14:00:00.000Z")), 5);
  assert.equal(businessDaysElapsed(signalDay, new Date("2026-06-02T14:00:00.000Z")), 6);
});

test("auto-demote memory logic limits buy entries to five business days", () => {
  const receivedAt = "2026-05-26T03:00:00.000Z";

  const fresh = applyAutoDemotion(
    { symbol: "JPYTHB", action: "STRONG_BUY", receivedAt },
    new Date("2026-05-26T14:00:00.000Z")
  );
  assert.equal(fresh.action, "STRONG_BUY");
  assert.equal(fresh.businessDaysElapsed, 1);

  const dayFive = applyAutoDemotion(
    { symbol: "JPYTHB", action: "STRONG_BUY", receivedAt },
    new Date("2026-06-01T14:00:00.000Z")
  );
  assert.equal(dayFive.action, "BUY_ZONE");
  assert.equal(dayFive.businessDaysElapsed, BUY_WINDOW_BUSINESS_DAYS);
  assert.equal(dayFive.decisionWindowExpired, false);

  const daySix = applyAutoDemotion(
    { symbol: "JPYTHB", action: "STRONG_BUY", receivedAt },
    new Date("2026-06-02T14:00:00.000Z")
  );
  assert.equal(daySix.action, "WAIT_ZONE");
  assert.equal(daySix.demotedFrom, "STRONG_BUY");
  assert.equal(daySix.businessDaysElapsed, 6);
  assert.equal(daySix.decisionWindowExpired, true);
  assert.equal(daySix.meta.th.label, "รอก่อน ยังไม่ควรซื้อตอนนี้");
});

test("auto-demote memory logic still softens stale sell states", () => {
  const now = new Date("2026-05-26T12:00:00.000Z");
  const receivedAt = new Date(now.getTime() - DEMOTION_MS - 1).toISOString();

  assert.equal(applyAutoDemotion({ symbol: "XAUTHB", action: "SELL_ZONE", receivedAt }, now).action, "WAIT_ZONE");
  assert.equal(applyAutoDemotion({ symbol: "BTCUSD", action: "WAIT_ZONE", receivedAt }, now).action, "WAIT_ZONE");
});

test("Thai asset routing follows THB suffix", () => {
  assert.equal(isThaiAsset("JPYTHB"), true);
  assert.equal(isThaiAsset("OANDA:XAUUSD"), false);
});

test("tracked asset universe matches the SavePulse alert list", () => {
  assert.deepEqual(TRACKED_ASSETS, [
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

  const defaultSignal = createDefaultSignal("xauthb");
  assert.equal(defaultSignal.symbol, "XAUTHB");
  assert.equal(defaultSignal.action, "WAIT_ZONE");
  assert.equal(defaultSignal.source, "default");
});
