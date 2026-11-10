"use strict";
const { AsyncLocalStorage } = require("node:async_hooks");

// Test-only adapter. Never imported by the Production server.
function createBillingSandboxClock({ store, stripe, env, wallNow = Date.now }) {
  const context = new AsyncLocalStorage();
  const key = "billing-simulation:v1:test:clock";
  const email = "savepulse.cloud@gmail.com";
  function guard() {
    if (env.SUPABASE_URL !== "https://sktzydyiwqylpstxjicf.supabase.co" || env.STRIPE_EXPECTED_ACCOUNT_ID !== "acct_1TbuPE0su7h1AsZT" || !/^(sk|rk)_test_/.test(env.STRIPE_SECRET_KEY || "")) throw Error("billing_simulation_test_only");
  }
  async function resolve(config) {
    guard();
    const account = await stripe("GET", "/account");
    if (account.id !== env.STRIPE_EXPECTED_ACCOUNT_ID || !/^clock_\w+$/.test(config.clockId || "") || !/^cus_\w+$/.test(config.customerId || "")) throw Error("billing_simulation_binding_invalid");
    const customer = await stripe("GET", `/customers/${config.customerId}`);
    const clock = await stripe("GET", `/test_helpers/test_clocks/${config.clockId}`);
    if (customer.deleted || customer.livemode !== false || customer.email !== email || customer.test_clock !== clock.id || clock.id !== config.clockId || clock.livemode !== false || clock.status !== "ready" || !Number.isSafeInteger(clock.frozen_time) || Math.abs(clock.frozen_time * 1000 - wallNow()) > 180 * 86400000) throw Error("billing_simulation_clock_not_ready");
    return { customerId: customer.id, clockId: clock.id, time: clock.frozen_time * 1000 };
  }
  return {
    active: () => Boolean(context.getStore()),
    now: () => context.getStore()?.time ?? wallNow(),
    async run(fn) {
      const config = await store.get(key);
      return config && config.enabled !== false ? context.run(await resolve(config), fn) : fn();
    },
    async stripe(method, path, params, idempotencyKey) {
      const selected = context.getStore();
      if (selected && method === "POST" && path === "/checkout/sessions") {
        if (params.customer_email !== email || params.customer) throw Error("billing_simulation_customer_mismatch");
        const { customer_email, ...rest } = params;
        return stripe(method, path, { ...rest, customer: selected.customerId, customer_update: { name: "auto", address: "auto" } }, `${idempotencyKey}/test-clock-v2`);
      }
      return stripe(method, path, params, idempotencyKey);
    },
    async prepare() {
      guard();
      if (await store.get(key)) throw Error("billing_simulation_already_configured");
      const account = await stripe("GET", "/account");
      if (account.id !== env.STRIPE_EXPECTED_ACCOUNT_ID) throw Error("billing_simulation_binding_invalid");
      const clock = await stripe("POST", "/test_helpers/test_clocks", { frozen_time: Math.floor(wallNow() / 1000), name: "SavePulse USD39 lifecycle QA" }, "savepulse-pro39-clock-v1");
      const customer = await stripe("POST", "/customers", { email, name: "SavePulse USD39 clock QA TEST ONLY", test_clock: clock.id }, "savepulse-pro39-clock-customer-v1");
      const config = { version: 1, clockId: clock.id, customerId: customer.id };
      await resolve(config);
      if (!await store.insert(key, config)) throw Error("billing_simulation_already_configured");
      return { mode: "test", ...config, emailsSent: 0 };
    },
    async suspend() {
      guard();
      const config = await store.get(key);
      if (!config || config.enabled === false) return {mode:"test",simulation:false};
      await resolve(config);
      if (!await store.cas(key,config.version,{...config,version:config.version+1,enabled:false})) throw Error("billing_simulation_busy");
      return {mode:"test",simulation:false,emailsSent:0};
    }
  };
}
module.exports = { createBillingSandboxClock };
