"use strict";
// Run only after the owner selects the existing Stripe sandbox. No keys are printed.
const StripeClient = require("stripe");
async function main() {
  const key = process.env.FREIGHT_STRIPE_SECRET_KEY,
    expected = process.env.FREIGHT_STRIPE_ACCOUNT_ID;
  if (
    !key?.startsWith("sk_test_") ||
    !/^acct_[A-Za-z0-9]+$/.test(expected || "")
  )
    throw Error("Selected sandbox account ID and test key are required");
  const stripe = new StripeClient(key, { maxNetworkRetries: 2 });
  const account = await stripe.accounts.retrieve();
  if (account.id !== expected) throw Error("Stripe account mismatch");
  const lookup = "freightpulse_company_usd_monthly_99_test_v1";
  let price = (await stripe.prices.list({ lookup_keys: [lookup], limit: 10 }))
      .data[0],
    product;
  if (price) {
    product = await stripe.products.retrieve(price.product);
  } else {
    product = await stripe.products.create(
      {
        name: "FreightPulse AI — Sandbox",
        description:
          "Development/test service. USD 99 per company per month; commercial launch not approved.",
        metadata: { service: "freightpulse", environment: "sandbox" },
      },
      { idempotencyKey: "freightpulse-test-product-v1" },
    );
    price = await stripe.prices.create(
      {
        product: product.id,
        currency: "usd",
        unit_amount: 9900,
        recurring: {
          interval: "month",
          interval_count: 1,
          usage_type: "licensed",
        },
        lookup_key: lookup,
        metadata: { service: "freightpulse", environment: "sandbox" },
      },
      { idempotencyKey: "freightpulse-test-monthly-99-v1" },
    );
  }
  if (
    price.livemode !== false ||
    product.livemode !== false ||
    product.metadata.service !== "freightpulse" ||
    price.unit_amount !== 9900 ||
    price.currency !== "usd" ||
    price.recurring?.interval !== "month" ||
    price.recurring.interval_count !== 1 ||
    price.recurring.usage_type !== "licensed" ||
    !price.active ||
    !product.active
  )
    throw Error("Existing sandbox catalog does not match FreightPulse");
  const configs = await stripe.billingPortal.configurations.list({
    limit: 100,
    active: true,
  });
  let portal = configs.data.find(
    (c) =>
      c.metadata?.service === "freightpulse" &&
      c.metadata?.environment === "sandbox",
  );
  if (!portal)
    portal = await stripe.billingPortal.configurations.create(
      {
        business_profile: { headline: "FreightPulse AI sandbox billing" },
        features: {
          invoice_history: { enabled: true },
          payment_method_update: { enabled: true },
          subscription_cancel: { enabled: true, mode: "at_period_end" },
          subscription_update: { enabled: false },
        },
        metadata: { service: "freightpulse", environment: "sandbox" },
      },
      { idempotencyKey: "freightpulse-test-portal-v1" },
    );
  if (portal.livemode !== false) throw Error("Sandbox portal required");
  console.log(
    JSON.stringify(
      {
        mode: "test",
        accountId: account.id,
        productId: product.id,
        priceId: price.id,
        portalConfigurationId: portal.id,
        liveSales: false,
        taxPolicy: "pending",
      },
      null,
      2,
    ),
  );
}
main().catch(() => {
  console.error(
    "FreightPulse sandbox provisioning not confirmed. Check the selected test account and permissions securely; no credential values were logged.",
  );
  process.exitCode = 1;
});
