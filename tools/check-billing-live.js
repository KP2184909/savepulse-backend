"use strict";
const { inspectLiveBilling } = require("../src/billingLivePreflight");
// Run only in the server's environment. Never paste keys into command arguments.
const get = async (route, parameters = {}) => {
  if (!/^\/(account|prices\/price_\w+|tax_rates\/txr_\w+|webhook_endpoints|billing_portal\/configurations)$/.test(route)) throw Error("read_not_allowed");
  const query = new URLSearchParams(parameters);
  const response = await fetch(`https://api.stripe.com/v1${route}${query.size ? `?${query}` : ""}`, {
    method: "GET", signal: AbortSignal.timeout(12000),
    headers: { authorization: `Bearer ${process.env.STRIPE_SECRET_KEY || process.env.STRIPE_API_KEY}`, "Stripe-Version": "2026-08-26.dahlia" }
  });
  if (!response.ok) throw Error("provider_read_failed");
  return response.json();
};
inspectLiveBilling({ env: process.env, get }).then(report => {
  console.log(JSON.stringify(report, null, 2));
  process.exitCode = report.ready ? 0 : 1;
}).catch(() => { console.log('{"ready":false,"error":"preflight_failed"}'); process.exitCode = 1; });
