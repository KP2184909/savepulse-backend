"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  ACTIONS,
  DEMOTION_MS,
  TRACKED_ASSETS,
  applyAutoDemotion,
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

test("auto-demote memory logic softens stale strong buy and sell states", () => {
  const now = new Date("2026-05-26T12:00:00.000Z");
  const receivedAt = new Date(now.getTime() - DEMOTION_MS - 1).toISOString();

  assert.equal(applyAutoDemotion({ symbol: "JPYTHB", action: "STRONG_BUY", receivedAt }, now).action, "BUY_ZONE");
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
