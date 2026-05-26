"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  deliveryDecisionForSignal,
  isAssetAllowedForPlan,
  normalizePlan,
  publicPlans,
  sanitizeChannels,
  sanitizeWatchlist,
  subscriberEntitlements
} = require("../src/plans");

test("plan normalization falls back to free", () => {
  assert.equal(normalizePlan("PLUS"), "plus");
  assert.equal(normalizePlan("unknown"), "free");
  assert.equal(normalizePlan(""), "free");
});

test("public plans expose the SavePulse pricing ladder", () => {
  const plans = publicPlans();
  assert.deepEqual(
    plans.map((plan) => plan.id),
    ["free", "plus", "pro", "business"]
  );
  assert.equal(plans.find((plan) => plan.id === "plus").prices.thbMonthly, 199);
  assert.equal(plans.find((plan) => plan.id === "business").prices.usdMonthly, 49);
});

test("free watchlist is capped to one fiat asset", () => {
  const result = sanitizeWatchlist(["JPYTHB", "EURTHB", "BTCUSD"], "free");

  assert.deepEqual(result.watchlist, ["JPYTHB"]);
  assert.deepEqual(
    result.rejected.map((item) => item.reason),
    ["watchlist_limit_reached", "plan_locked_asset"]
  );
});

test("plus excludes gold and bitcoin while pro includes them", () => {
  assert.equal(isAssetAllowedForPlan("XAUUSD", "plus"), false);
  assert.equal(isAssetAllowedForPlan("BTCUSD", "plus"), false);
  assert.equal(isAssetAllowedForPlan("XAUUSD", "pro"), true);
  assert.equal(isAssetAllowedForPlan("BTCUSD", "business"), true);
});

test("channels are limited by plan", () => {
  assert.deepEqual(sanitizeChannels(["line", "email"], "free"), ["email"]);
  assert.deepEqual(sanitizeChannels(["line", "telegram", "sms"], "plus"), ["line", "telegram"]);
  assert.deepEqual(sanitizeChannels([], "business"), ["email"]);
});

test("delivery rules keep free delayed and reserve sell alerts for pro and business", () => {
  const strongBuy = { symbol: "JPYTHB", action: "STRONG_BUY" };
  const sellGold = { symbol: "XAUUSD", action: "SELL_ZONE" };

  assert.deepEqual(deliveryDecisionForSignal({ plan: "free", watchlist: ["JPYTHB"] }, strongBuy), {
    eligible: true,
    plan: "free",
    delayMinutes: 180,
    channels: ["email"]
  });

  assert.deepEqual(deliveryDecisionForSignal({ plan: "plus", watchlist: ["XAUUSD"] }, sellGold), {
    eligible: false,
    reason: "plan_not_eligible"
  });

  assert.equal(deliveryDecisionForSignal({ plan: "pro", watchlist: ["XAUUSD"] }, sellGold).eligible, true);
  assert.equal(subscriberEntitlements({ plan: "business" }).invoiceTracking, true);
});
