"use strict";
const fail = (code, status = 503) => Object.assign(new Error(code), { status });
function createFreightStripe({ env = process.env, client } = {}) {
  if (
    !env.FREIGHT_STRIPE_SECRET_KEY?.startsWith("sk_test_") ||
    !env.FREIGHT_STRIPE_PRICE_ID ||
    !env.FREIGHT_STRIPE_PRODUCT_ID ||
    !env.FREIGHT_STRIPE_PORTAL_CONFIG_ID
  )
    return null;
  const StripeClient = require("stripe");
  const stripe =
    client ||
    new StripeClient(env.FREIGHT_STRIPE_SECRET_KEY, {
      maxNetworkRetries: 2,
      timeout: 20000,
    });
  const base = env.FREIGHT_APP_BASE_URL || "";
  if (!/^https:\/\//.test(base) && !/^http:\/\/127\.0\.0\.1:\d+$/.test(base))
    throw fail("freight_base_url_required");
  const priceId = env.FREIGHT_STRIPE_PRICE_ID,
    productId = env.FREIGHT_STRIPE_PRODUCT_ID;
  async function price() {
    const [p, product] = await Promise.all([
      stripe.prices.retrieve(priceId),
      stripe.products.retrieve(productId),
    ]);
    if (
      p.livemode !== false ||
      !p.active ||
      p.currency !== "usd" ||
      p.unit_amount !== 9900 ||
      p.recurring?.interval !== "month" ||
      p.recurring.interval_count !== 1 ||
      p.recurring.usage_type !== "licensed" ||
      p.product !== productId ||
      product.livemode !== false ||
      !product.active ||
      product.metadata?.service !== "freightpulse"
    )
      throw fail("freight_price_mismatch");
    return p;
  }
  async function portalConfiguration() {
    const config = await stripe.billingPortal.configurations.retrieve(
      env.FREIGHT_STRIPE_PORTAL_CONFIG_ID,
    );
    const f = config.features || {};
    if (
      config.livemode !== false ||
      !config.active ||
      !f.invoice_history?.enabled ||
      !f.payment_method_update?.enabled ||
      !f.subscription_cancel?.enabled ||
      f.subscription_cancel.mode !== "at_period_end" ||
      f.subscription_update?.enabled
    )
      throw fail("freight_portal_configuration_mismatch");
  }
  return {
    async ensureCustomer(company) {
      await price();
      return stripe.customers.create(
        {
          email: company.ownerEmail,
          name: company.name,
          metadata: { service: "freightpulse", company_id: company.id },
        },
        { idempotencyKey: `freight-customer-${company.id}` },
      );
    },
    async checkout(company) {
      await price();
      await portalConfiguration();
      // This adapter deliberately cannot open live payments. Tax policy remains a launch gate.
      const sessions = await stripe.checkout.sessions.list({
        customer: company.customerId,
        status: "open",
        limit: 100,
      });
      const old = sessions.data.find(
        (s) =>
          s.metadata?.service === "freightpulse" &&
          s.metadata.company_id === company.id,
      );
      if (old) {
        const lines = await stripe.checkout.sessions.listLineItems(old.id, {
          limit: 10,
        });
        if (
          old.livemode !== false ||
          lines.data.length !== 1 ||
          lines.data[0].price?.id !== priceId ||
          lines.data[0].quantity !== 1
        )
          throw fail("freight_checkout_price_mismatch");
        return { url: old.url, mode: "test" };
      }
      if (
        !company.checkoutAttempt?.id ||
        !/^[a-z]{8}$/.test(company.checkoutAttempt.tag)
      )
        throw fail("checkout_attempt_required");
      const session = await stripe.checkout.sessions.create(
        {
          mode: "subscription",
          customer: company.customerId,
          line_items: [{ price: priceId, quantity: 1 }],
          client_reference_id: company.id,
          metadata: { service: "freightpulse", company_id: company.id },
          subscription_data: {
            metadata: { service: "freightpulse", company_id: company.id },
          },
          integration_identifier: `freightpulse_${company.checkoutAttempt.tag}`,
          success_url: `${base}/freightpulse/?checkout=return`,
          cancel_url: `${base}/freightpulse/?checkout=cancel`,
          custom_text: {
            submit: {
              message:
                "SANDBOX TEST ONLY: USD 99 per company/month, renews monthly until cancelled. Tax policy and company seats are pending approval. No real charge.",
            },
          },
        },
        { idempotencyKey: `freight-checkout-${company.checkoutAttempt.id}` },
      );
      return { url: session.url, mode: "test" };
    },
    async portal(company) {
      await portalConfiguration();
      const result = await stripe.billingPortal.sessions.create({
        customer: company.customerId,
        configuration: env.FREIGHT_STRIPE_PORTAL_CONFIG_ID,
        return_url: `${base}/freightpulse/`,
      });
      return { url: result.url, mode: "test" };
    },
    async snapshot(customerId, object, existingId) {
      await price();
      const customer = await stripe.customers.retrieve(customerId);
      if (
        customer.deleted ||
        customer.livemode !== false ||
        customer.metadata?.service !== "freightpulse"
      )
        throw fail("freight_customer_mismatch", 409);
      const list = await stripe.subscriptions.list({
        customer: customerId,
        status: "all",
        limit: 100,
      });
      const matching = list.data.filter((s) =>
        s.items?.data?.some((i) => i.price.id === priceId),
      );
      const requested =
        object.object === "subscription"
          ? object.id
          : typeof object.subscription === "string"
            ? object.subscription
            : object.parent?.subscription_details?.subscription;
      if (existingId && requested && existingId !== requested)
        throw fail("freight_subscription_mismatch", 409);
      const id =
        existingId ||
        requested ||
        matching.find(
          (s) => !["canceled", "incomplete_expired"].includes(s.status),
        )?.id ||
        matching[0]?.id;
      if (!id) throw fail("freight_subscription_pending", 409);
      const s = await stripe.subscriptions.retrieve(id, {
        expand: ["latest_invoice"],
      });
      if (
        s.customer !== customerId ||
        s.livemode !== false ||
        s.items.data.length !== 1 ||
        s.items.data[0].price.id !== priceId ||
        s.items.data[0].quantity !== 1
      )
        throw fail("freight_subscription_mismatch", 409);
      const end = s.items.data[0].current_period_end || s.current_period_end;
      return {
        verified: true,
        mode: "test",
        customerId,
        subscriptionId: s.id,
        status: s.status,
        invoicePaid: s.latest_invoice?.status === "paid",
        periodEnd: Number.isFinite(end)
          ? new Date(end * 1000).toISOString()
          : null,
        cancelAtPeriodEnd: Boolean(s.cancel_at_period_end),
      };
    },
    verify(raw, signature) {
      if (!env.FREIGHT_STRIPE_WEBHOOK_SECRET)
        throw fail("freight_webhook_not_configured");
      return stripe.webhooks.constructEvent(
        raw,
        signature,
        env.FREIGHT_STRIPE_WEBHOOK_SECRET,
        300,
      );
    },
  };
}
module.exports = { createFreightStripe };
