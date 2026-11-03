"use strict";
const STATUSES = new Set(["active", "past_due", "unpaid", "canceled", "incomplete", "incomplete_expired", "trialing", "paused"]);
async function inspectLiveSubscriptions({ env, get }) {
  const scope = "subscription_inventory_only";
  const unavailable = reason => ({ scope, complete: false, reason });
  if (!/^(sk|rk)_live_/.test(env.STRIPE_SECRET_KEY || env.STRIPE_API_KEY || "") ||
      !/^acct_\w+$/.test(env.STRIPE_EXPECTED_ACCOUNT_ID || "") || env.APP_BASE_URL !== "https://savepulse.cloud") return unavailable("live_configuration_required");
  try {
    if ((await get("/account")).id !== env.STRIPE_EXPECTED_ACCOUNT_ID) return unavailable("merchant_account_mismatch");
    const seen = new Set(), statuses = {}; let cursor;
    for (let page = 0; page < 100; page++) {
      const result = await get("/subscriptions", { status: "all", limit: 100, ...(cursor ? { starting_after: cursor } : {}) });
      if (!Array.isArray(result.data) || typeof result.has_more !== "boolean") throw Error("invalid_list");
      for (const subscription of result.data) {
        if (!/^sub_\w+$/.test(subscription.id || "") || subscription.livemode !== true || seen.has(subscription.id)) throw Error("invalid_subscription_page");
        seen.add(subscription.id);
        const status = STATUSES.has(subscription.status) ? subscription.status : "other";
        statuses[status] = (statuses[status] || 0) + 1;
      }
      if (!result.has_more) return { scope, complete: true, total: seen.size, statuses, migrationReviewRequired: seen.size > 0 };
      const next = result.data.at(-1)?.id;
      if (!next || next === cursor) throw Error("invalid_cursor");
      cursor = next;
    }
    return unavailable("inventory_limit_reached");
  } catch (_) { return unavailable("provider_read_failed"); }
}
function createInventoryReader(env = process.env, fetchImpl = globalThis.fetch) {
  return async (route, parameters = {}) => {
    if (!["/account", "/subscriptions"].includes(route)) throw Error("read_not_allowed");
    const query = new URLSearchParams(parameters);
    const response = await fetchImpl(`https://api.stripe.com/v1${route}${query.size ? `?${query}` : ""}`, {
      method: "GET", signal: AbortSignal.timeout(12000),
      headers: { authorization: `Bearer ${env.STRIPE_SECRET_KEY || env.STRIPE_API_KEY}`, "Stripe-Version": "2026-08-26.dahlia" }
    });
    if (!response.ok) throw Error("provider_read_failed");
    return response.json();
  };
}
module.exports = { inspectLiveSubscriptions, createInventoryReader };
