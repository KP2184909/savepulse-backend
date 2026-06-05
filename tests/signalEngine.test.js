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
  isThaiAsset,
  userFacingActionForDirection
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
      symbol: "OANDA:jpythb",
      action: "SuperTrend Buy",
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
  assert.equal(
    businessDaysElapsed(
      new Date("2026-05-26T03:00:00.000Z"),
      new Date("2026-05-26T12:00:00.000Z")
    ),
    1
  );

  assert.equal(
    businessDaysElapsed(
      new Date("2026-05-26T03:00:00.000Z"),
      new Date("2026-06-01T12:00:00.000Z")
    ),
    BUY_WINDOW_BUSINESS_DAYS
  );

  assert.equal(
    businessDaysElapsed(
      new Date("2026-05-26T03:00:00.000Z"),
      new Date("2026-06-02T12:00:00.000Z")
    ),
    6
  );
});

test("auto-demote memory logic limits buy entries to five business days", () => {
  const receivedAt = "2026-05-26T03:00:00.000Z";

  const fresh = applyAutoDemotion(
    { symbol: "JPYTHB", action: "STRONG_BUY", receivedAt },
    new Date("2026-05-26T12:00:00.000Z")
  );
  assert.equal(fresh.action, "STRONG_BUY");
  assert.equal(fresh.businessDaysElapsed, 1);

  const agedButOpen = applyAutoDemotion(
    { symbol: "JPYTHB", action: "STRONG_BUY", receivedAt },
    new Date("2026-06-01T12:00:00.000Z")
  );
  assert.equal(agedButOpen.action, "BUY_ZONE");
  assert.equal(agedButOpen.businessDaysElapsed, 5);
  assert.equal(agedButOpen.decisionWindowExpired, false);

  const expired = applyAutoDemotion(
    { symbol: "JPYTHB", action: "STRONG_BUY", receivedAt },
    new Date("2026-06-02T12:00:00.000Z")
  );
  assert.equal(expired.action, "WAIT_ZONE");
  assert.equal(expired.demotedFrom, "STRONG_BUY");
  assert.equal(expired.businessDaysElapsed, 6);
  assert.equal(expired.decisionWindowExpired, true);
  assert.equal(expired.meta.th.label, "รอก่อน ยังไม่ควรซื้อตอนนี้");
});

test("auto-demote memory logic still softens stale sell states", () => {
  const now = new Date("2026-05-26T12:00:00.000Z");
  const receivedAt = new Date(now.getTime() - DEMOTION_MS - 1).toISOString();

  assert.equal(applyAutoDemotion({ symbol: "XAUTHB", action: "SELL_ZONE", receivedAt }, now).action, "WAIT_ZONE");
  assert.equal(applyAutoDemotion({ symbol: "BTCUSD", action: "WAIT_ZONE", receivedAt }, now).action, "WAIT_ZONE");
});

test("Thai asset routing follows THB suffix", () => {
  assert.equal(isThaiAsset("JPYTHB"), true);
  assert.equal(isThaiAsset("OANDA:JPYTHB"), true);
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

test("common TradingView action aliases map to SavePulse states", () => {
  assert.equal(createSignal({ symbol: "USDTHB", action: "BUY" }).action, ACTIONS.STRONG_BUY);
  assert.equal(createSignal({ symbol: "USDTHB", action: "sell" }).action, ACTIONS.SELL_ZONE);
  assert.equal(createSignal({ symbol: "USDTHB", action: "SuperTrend Sell" }).action, ACTIONS.SELL_ZONE);
});

test("user-facing action uses canonical direction for base to quote", () => {
  const result = userFacingActionForDirection({
    symbol: "JPYTHB",
    action: "BUY_ZONE",
    userFromCurrency: "JPY",
    userToCurrency: "THB"
  });

  assert.equal(result.action, ACTIONS.BUY_ZONE);
  assert.equal(result.direction, "canonical");
  assert.equal(result.inverted, false);
  assert.equal(result.label.th, "เริ่มน่าจับตา");
  assert.equal(
    result.copy.th,
    "ถ้าคุณถือ JPY อยู่ จังหวะนี้เริ่มค่อนข้างดีเมื่อเทียบกับ THB"
  );
});

test("user-facing action inverts base-favorable signals for quote to base", () => {
  const result = userFacingActionForDirection({
    symbol: "JPYTHB",
    action: "BUY_ZONE",
    userFromCurrency: "THB",
    userToCurrency: "JPY"
  });

  assert.equal(result.action, ACTIONS.SELL_ZONE);
  assert.equal(result.direction, "inverted");
  assert.equal(result.inverted, true);
  assert.equal(result.label.th, "รอก่อน");
  assert.equal(
    result.copy.th,
    "JPY เริ่มแพงขึ้นเมื่อเทียบกับ THB ถ้าคุณยังไม่รีบ อาจรอดูจังหวะที่ดีกว่านี้"
  );
});

test("user-facing action keeps strong buy canonical and inverts it for reverse direction", () => {
  const direct = userFacingActionForDirection({
    symbol: "EURTHB",
    action: "STRONG_BUY",
    userFromCurrency: "EUR",
    userToCurrency: "THB"
  });
  const reverse = userFacingActionForDirection({
    symbol: "EURTHB",
    action: "STRONG_BUY",
    userFromCurrency: "THB",
    userToCurrency: "EUR"
  });

  assert.equal(direct.action, ACTIONS.STRONG_BUY);
  assert.equal(direct.label.en, "Good time to exchange");
  assert.equal(reverse.action, ACTIONS.SELL_ZONE);
  assert.equal(reverse.direction, "inverted");
  assert.equal(reverse.label.en, "Wait for now");
});

test("user-facing action keeps wait neutral when direction is inverted", () => {
  const result = userFacingActionForDirection({
    symbol: "USDJPY",
    action: "WAIT_ZONE",
    userFromCurrency: "JPY",
    userToCurrency: "USD"
  });

  assert.equal(result.action, ACTIONS.WAIT_ZONE);
  assert.equal(result.direction, "inverted");
  assert.equal(result.label.th, "ยังไม่ต้องรีบ");
});
