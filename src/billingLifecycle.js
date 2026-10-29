"use strict";

const crypto = require("node:crypto");
const { canonicalEmail } = require("./trialLifecycle");
const fail = (code, status = 503) => Object.assign(new Error(code), { status });
const hash = value => crypto.createHash("sha256").update(value).digest("hex");
const id = value => typeof value === "string" ? value : value?.id;
const AMOUNTS = Object.freeze({ plus: 500, pro: 1500, business: 5900 });
const EVENTS = Object.freeze([
  "checkout.session.completed", "checkout.session.async_payment_succeeded", "checkout.session.async_payment_failed",
  "customer.subscription.created", "customer.subscription.updated", "customer.subscription.deleted",
  "invoice.paid", "invoice.payment_succeeded", "invoice.payment_failed", "invoice.payment_action_required"
]);

function keyMode(key) {
  if (/^(sk|rk)_test_/.test(key || "")) return "test";
  if (/^(sk|rk)_live_/.test(key || "")) return "live";
  return "unknown";
}

// Server-side transport only. Provider errors never echo keys, request bodies or URLs.
function createStripeApi(env = process.env, fetchImpl = globalThis.fetch) {
  const key = env.STRIPE_SECRET_KEY || env.STRIPE_API_KEY || "";
  return async function stripe(method, route, values = {}, idempotencyKey) {
    if (!key || !/^\/(account|prices|invoices|checkout\/sessions|subscriptions|billing_portal\/sessions)(\/|$)/.test(route)) throw fail("billing_unavailable");
    const form = new URLSearchParams();
    const encode = (prefix, value) => {
      if (Array.isArray(value)) value.forEach((entry, i) => encode(`${prefix}[${i}]`, entry));
      else if (value && typeof value === "object") Object.entries(value).forEach(([k, entry]) => encode(`${prefix}[${k}]`, entry));
      else if (value !== undefined && value !== null) form.append(prefix, String(value));
    };
    Object.entries(values).forEach(([k, value]) => encode(k, value));
    const response = await fetchImpl(`https://api.stripe.com/v1${route}${method === "GET" && form.size ? `?${form}` : ""}`, {
      method, signal: AbortSignal.timeout(12000),
      headers: { authorization: `Bearer ${key}`, "Stripe-Version": "2026-08-26.dahlia", "content-type": "application/x-www-form-urlencoded", ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}) },
      ...(method === "GET" ? {} : { body: form })
    });
    const data = await response.json().catch(() => null);
    if (!response.ok || !data) throw fail("billing_provider_unavailable");
    return data;
  };
}

function createBillingLifecycle({ store, stripe, identity, env = process.env, now = Date.now }) {
  const mode = keyMode(env.STRIPE_SECRET_KEY || env.STRIPE_API_KEY);
  const expectedAccount = env.STRIPE_EXPECTED_ACCOUNT_ID || "";
  const prefix = `billing:v2:${mode}:${expectedAccount}:`;
  const enabled = env.BILLING_V2_ENABLED === "true";
  const prices = Object.fromEntries(Object.keys(AMOUNTS).map(plan => [plan, env[`STRIPE_PRICE_${plan.toUpperCase()}`] || ""]));
  const accountKey = email => `${prefix}${hash(canonicalEmail(email))}`;
  const baseUrl = String(env.APP_BASE_URL || "").replace(/\/$/, "");
  let verifiedAccount = false;
  function requireEnabled() {
    if (!enabled || !["test", "live"].includes(mode) || !/^acct_\w+$/.test(expectedAccount) || !/^https:\/\//.test(baseUrl)) throw fail("billing_unavailable");
    if (mode === "live" && (env.BILLING_LIVE_APPROVED !== "true" || env.BILLING_TAX_POLICY_CONFIRMED !== "true")) throw fail("billing_live_not_ready");
  }
  async function verifyAccount() {
    requireEnabled();
    if (!verifiedAccount) {
      const account = await stripe("GET", "/account");
      if (account.id !== expectedAccount) throw fail("billing_account_mismatch");
      verifiedAccount = true;
    }
  }
  async function authenticated(token) {
    requireEnabled();
    const email = await identity(token);
    if (mode === "test" && email !== "savepulse.cloud@gmail.com") throw fail("billing_test_mailbox_required", 403);
    return email;
  }
  async function mutate(key, change) {
    for (let attempt = 0; attempt < 8; attempt++) {
      const old = await store.get(key);
      const next = change(old);
      if (!next) return old;
      next.version = (old?.version || 0) + 1;
      if (old ? await store.cas(key, old.version, next) : await store.insert(key, next)) return next;
    }
    throw fail("billing_busy_retry", 409);
  }
  async function locked(key, fn) {
    const owner = crypto.randomUUID();
    let row = await mutate(key, old => {
      if (old?.lease?.until > now()) throw fail("billing_busy_retry", 409);
      return { ...old, lease: { owner, until: now() + 90000 } };
    });
    const save = async patch => {
      if (row.lease.owner !== owner || row.lease.until <= now()) throw fail("billing_busy_retry", 409);
      const next = { ...row, ...patch, version: row.version + 1 };
      if (!await store.cas(key, row.version, next)) throw fail("billing_busy_retry", 409);
      row = next;
    };
    try { return await fn({ row: () => row, save }); }
    finally {
      // A lease takeover fences a slow/failed worker from overwriting newer state.
      await store.cas(key, row.version, { ...row, version: row.version + 1, lease: { owner: "", until: 0 } });
    }
  }
  function publicStatus(row) {
    const membership = row?.membership;
    const active = Boolean(membership && ["active", "past_due"].includes(membership.status) && membership.paidUntil * 1000 > now());
    return {
      managed: Boolean(membership), mode, plan: active ? membership.plan : "free",
      status: membership?.status || "none", paidUntil: membership?.paidUntil ? new Date(membership.paidUntil * 1000).toISOString() : null,
      renews: membership?.status === "active" && !membership.cancelAtPeriodEnd && !membership.cancelAt,
      cancellationScheduled: Boolean(membership?.cancelAtPeriodEnd || membership?.cancelAt),
      portalAvailable: Boolean(membership?.customerId), verifiedAt: membership?.verifiedAt || null
    };
  }
  async function validatePrice(plan) {
    if (!AMOUNTS[plan] || !prices[plan]) throw fail("billing_plan_unavailable", 422);
    if (mode === "live" && plan === "business" && env.BILLING_BUSINESS_ENABLED !== "true") throw fail("billing_plan_unavailable", 422);
    const price = await stripe("GET", `/prices/${prices[plan]}`);
    if (!price.active || price.livemode !== (mode === "live") || price.currency !== "usd" || price.unit_amount !== AMOUNTS[plan] || price.recurring?.interval !== "month" || price.recurring.interval_count !== 1 || price.type !== "recurring") throw fail("billing_price_mismatch");
    return price;
  }
  async function sync(ctx, subscription) {
    const row = ctx.row(), binding = row.bindings?.[subscription.metadata?.billing_attempt];
    if (!binding?.sessionId || subscription.metadata?.billing_account !== row.accountRef || subscription.metadata?.service !== "savepulse") throw fail("billing_binding_missing", 422);
    if (subscription.livemode !== (mode === "live")) throw fail("billing_mode_mismatch", 422);
    const session = await stripe("GET", `/checkout/sessions/${binding.sessionId}`);
    if (session.livemode !== (mode === "live") || session.mode !== "subscription" || session.metadata?.billing_account !== row.accountRef || session.metadata?.billing_attempt !== subscription.metadata.billing_attempt || id(session.subscription) !== subscription.id || id(session.customer) !== id(subscription.customer)) throw fail("billing_binding_mismatch", 422);
    const items = subscription.items?.data || [];
    const price = items[0]?.price;
    const plan = Object.keys(prices).find(plan => prices[plan] === id(price));
    if (items.length !== 1 || items[0].quantity !== 1 || !plan || price.currency !== "usd" || price.unit_amount !== AMOUNTS[plan]) throw fail("billing_price_mismatch", 422);
    const invoice = subscription.latest_invoice;
    const invoiceSubscription = id(invoice?.subscription) || id(invoice?.parent?.subscription_details?.subscription);
    const line = invoice?.lines?.data?.find(line => (id(line.price) || id(line.pricing?.price_details?.price)) === prices[plan]);
    const end = Number(items[0].current_period_end || subscription.current_period_end || 0);
    const paid = session.status === "complete" && session.payment_status === "paid" && invoice?.status === "paid" && invoice.livemode === (mode === "live") && id(invoice.customer) === id(subscription.customer) && invoiceSubscription === subscription.id && line?.period?.start <= now() / 1000 && line?.period?.end > now() / 1000;
    const previous = row.membership?.subscriptionId === subscription.id ? row.membership : null;
    const paidUntil = paid ? Math.min(end, line.period.end) : previous?.paidUntil || 0;
    const membership = {
      plan: paid ? plan : previous?.plan || plan, subscriptionId: subscription.id, customerId: id(subscription.customer), status: subscription.status,
      paidUntil, cancelAtPeriodEnd: Boolean(subscription.cancel_at_period_end), cancelAt: subscription.cancel_at || null,
      verifiedAt: new Date(now()).toISOString(), latestInvoicePaid: invoice?.status === "paid"
    };
    // A late cancellation from an older subscription cannot revoke a newer one.
    if (row.membership && row.membership.subscriptionId !== subscription.id && !["canceled", "incomplete_expired"].includes(row.membership.status)) throw fail("billing_subscription_conflict", 409);
    await ctx.save({ membership, pending: row.pending?.attempt === subscription.metadata.billing_attempt ? null : row.pending });
    return publicStatus(ctx.row());
  }
  async function freshSubscription(subscriptionId) {
    return stripe("GET", `/subscriptions/${subscriptionId}`, { expand: ["latest_invoice", "items.data.price"] });
  }
  async function checkout(token, plan) {
    const email = await authenticated(token);
    await verifyAccount();
    await validatePrice(plan);
    return locked(accountKey(email), async ctx => {
      let row = ctx.row();
      if (row.membership?.subscriptionId) {
        await sync(ctx, await freshSubscription(row.membership.subscriptionId)); row = ctx.row();
        if (!["canceled", "incomplete_expired"].includes(row.membership.status)) throw fail("billing_membership_exists_use_portal", 409);
      }
      let pending = row.pending;
      if (pending?.sessionId) {
        const existing = await stripe("GET", `/checkout/sessions/${pending.sessionId}`);
        if (existing.status === "complete") throw fail("billing_payment_processing", 409);
        if (existing.status === "open") {
          if (pending.plan === plan) return { configured: true, provider: "stripe", mode, url: existing.url };
          // Choosing a different plan first closes the old payment opportunity.
          // A race with completed payment causes Stripe to reject expiry; no new checkout is created.
          const expired = await stripe("POST", `/checkout/sessions/${pending.sessionId}/expire`);
          if (expired.status !== "expired") throw fail("billing_payment_processing", 409);
        } else if (existing.status !== "expired") {
          throw fail("billing_checkout_needs_review", 409);
        }
        await ctx.save({ pending: null });
        pending = null;
      }
      if (pending && now() - pending.createdAt >= 23 * 3600000) throw fail("billing_checkout_needs_review", 409);
      if (pending && pending.plan !== plan) throw fail("billing_checkout_already_open", 409);
      if (!pending) {
        const attempt = crypto.randomUUID(), accountRef = hash(canonicalEmail(email));
        const metadata = { service: "savepulse", billing_account: accountRef, billing_attempt: attempt, plan };
        const params = {
          mode: "subscription", customer_email: email, client_reference_id: accountRef,
          line_items: [{ price: prices[plan], quantity: 1 }], metadata,
          subscription_data: { metadata, billing_mode: { type: "flexible" } },
          success_url: `${baseUrl}/membership/?checkout=success`, cancel_url: `${baseUrl}/membership/?checkout=cancelled`,
          integration_identifier: `savepulse_${crypto.randomBytes(8).toString("hex").replace(/[0-9]/g, "a").slice(0, 8)}`
        };
        pending = { attempt, plan, params, createdAt: now() };
        await ctx.save({ email, accountRef, pending });
      }
      const session = await stripe("POST", "/checkout/sessions", pending.params, `savepulse-checkout/${pending.attempt}`);
      if (!session.id || session.livemode !== (mode === "live") || !session.url?.startsWith("https://checkout.stripe.com/")) throw fail("billing_checkout_invalid");
      await ctx.save({ pending: { ...pending, sessionId: session.id }, bindings: { ...ctx.row().bindings, [pending.attempt]: { sessionId: session.id, plan } } });
      return { configured: true, provider: "stripe", mode, url: session.url };
    });
  }
  async function reconcileEmail(email) {
    requireEnabled();
    const row = await store.get(accountKey(email));
    if (!row?.membership) {
      if (!row?.pending?.sessionId) return publicStatus(row);
      await verifyAccount();
      return locked(accountKey(email), async ctx => {
        const session = await stripe("GET", `/checkout/sessions/${ctx.row().pending.sessionId}`);
        if (session.status !== "complete" || !id(session.subscription)) return publicStatus(ctx.row());
        return sync(ctx, await freshSubscription(id(session.subscription)));
      });
    }
    if (now() - Date.parse(row.membership.verifiedAt) < 5 * 60000 && row.membership.paidUntil * 1000 > now()) return publicStatus(row);
    await verifyAccount();
    return locked(accountKey(email), async ctx => sync(ctx, await freshSubscription(ctx.row().membership.subscriptionId)));
  }
  async function status(token) { return reconcileEmail(await authenticated(token)); }
  async function portal(token) {
    const email = await authenticated(token);
    await verifyAccount();
    const row = await store.get(accountKey(email));
    if (!row?.membership?.customerId) throw fail("billing_membership_not_found", 404);
    const result = await stripe("POST", "/billing_portal/sessions", { customer: row.membership.customerId, return_url: `${baseUrl}/membership/` });
    if (!result.url?.startsWith("https://billing.stripe.com/")) throw fail("billing_portal_unavailable");
    return { url: result.url };
  }
  async function event(event) {
    requireEnabled();
    if (event?.livemode !== (mode === "live")) throw fail("billing_mode_mismatch", 422);
    if (!EVENTS.includes(event.type)) return { updated: false, reason: "event_ignored" };
    if (!/^evt_\w+$/.test(event.id || "")) throw fail("billing_invalid_event", 422);
    await verifyAccount();
    const object = event.data?.object;
    const subscriptionId = event.type.startsWith("customer.subscription.") ? object?.id : id(object?.subscription) || id(object?.parent?.subscription_details?.subscription);
    if (!/^sub_\w+$/.test(subscriptionId || "")) return { updated: false, reason: "subscription_missing" };
    const reference = (await freshSubscription(subscriptionId)).metadata?.billing_account;
    if (!/^[a-f0-9]{64}$/.test(reference || "")) return { updated: false, reason: "unbound_subscription" };
    const key = prefix + reference;
    if (!await store.get(key)) return { updated: false, reason: "unbound_subscription" };
    return locked(key, async ctx => {
      if (ctx.row().events?.includes(event.id)) return { updated: false, reason: "duplicate_event", email: ctx.row().email };
      // Retrieve again after acquiring the account lease: stale delivery order never overwrites newer state.
      const current = await freshSubscription(subscriptionId);
      if (ctx.row().membership?.subscriptionId && ctx.row().membership.subscriptionId !== subscriptionId && ["canceled", "incomplete_expired"].includes(current.status)) return { updated: false, reason: "older_subscription_ended" };
      const result = await sync(ctx, current);
      await ctx.save({ events: [...(ctx.row().events || []).slice(-255), event.id] });
      return { updated: true, membership: result, email: ctx.row().email };
    });
  }
  async function paidInvoiceForTaxDraft(invoiceId) {
    await verifyAccount();
    if (!/^in_\w+$/.test(invoiceId || "")) throw fail("billing_invoice_required", 422);
    const invoice = await stripe("GET", `/invoices/${invoiceId}`);
    if (invoice.livemode !== (mode === "live") || invoice.status !== "paid" || invoice.currency !== "usd" || !Number.isSafeInteger(invoice.amount_paid) || invoice.amount_paid <= 0) throw fail("billing_paid_invoice_required", 422);
    const subscriptionId = id(invoice.subscription) || id(invoice.parent?.subscription_details?.subscription);
    if (!/^sub_\w+$/.test(subscriptionId || "")) throw fail("billing_bound_invoice_required", 422);
    const sub = await freshSubscription(subscriptionId);
    const reference = sub.metadata?.billing_account;
    if (sub.livemode !== invoice.livemode || sub.metadata?.service !== "savepulse" || !/^[a-f0-9]{64}$/.test(reference || "") || id(invoice.customer) !== id(sub.customer)) throw fail("billing_bound_invoice_required", 422);
    const row = await store.get(prefix + reference);
    const binding = row?.bindings?.[sub.metadata?.billing_attempt];
    if (!binding || !row.email || hash(canonicalEmail(row.email)) !== reference) throw fail("billing_bound_invoice_required", 422);
    const session = await stripe("GET", `/checkout/sessions/${binding.sessionId}`);
    if (id(session.subscription) !== sub.id || session.payment_status !== "paid" || session.status !== "complete") throw fail("billing_bound_invoice_required", 422);
    return invoice;
  }
  async function catalog() {
    await verifyAccount();
    const plans = [];
    for (const plan of Object.keys(AMOUNTS)) {
      if (!prices[plan] || (mode === "live" && plan === "business" && env.BILLING_BUSINESS_ENABLED !== "true")) continue;
      await validatePrice(plan);
      plans.push({ id: plan, amount: AMOUNTS[plan] / 100, currency: "USD", interval: "month" });
    }
    return { enabled: true, mode, plans, noCardTrialUrl: "/trial/", taxPolicyConfirmed: env.BILLING_TAX_POLICY_CONFIRMED === "true" };
  }
  return { checkout, status, portal, event, catalog, paidInvoiceForTaxDraft, reconcileEmail, accountKey, enabled, mode, prices, publicStatus, requiredEvents: EVENTS };
}

module.exports = { createBillingLifecycle, createStripeApi, keyMode, AMOUNTS, EVENTS };
