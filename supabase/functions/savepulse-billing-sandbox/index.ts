import { createBillingLifecycle, createStripeApi, keyMode } from "./shared/billingLifecycle.mjs";
import { createTrialStore } from "./shared/trialLifecycle.mjs";
import { verifyStripeWebhookSignature } from "./shared/stripeSignature.mjs";

const projectUrl = "https://sktzydyiwqylpstxjicf.supabase.co";
const previewUrl = "https://deploy-preview-10--astounding-fenglisu-0ff097.netlify.app";
const testEmail = "savepulse.cloud@gmail.com";
const env = {
  BILLING_V2_ENABLED: "true", SUPABASE_URL: Deno.env.get("SUPABASE_URL"),
  SUPABASE_SERVICE_ROLE_KEY: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"),
  STRIPE_SECRET_KEY: Deno.env.get("SAVEPULSE_BILLING_TEST_KEY") || "",
  STRIPE_EXPECTED_ACCOUNT_ID: "acct_1TbuPE0su7h1AsZT", APP_BASE_URL: previewUrl,
  STRIPE_PRICE_PLUS: "price_1UVWmu0su7h1AsZTM4eoZAok",
  STRIPE_PRICE_PRO: "price_1UVWmv0su7h1AsZTXsoHLSsG",
  STRIPE_PRICE_BUSINESS: "price_1UVWmw0su7h1AsZTO3N7SQ51"
};
let webhookSecret = Deno.env.get("SAVEPULSE_BILLING_TEST_WEBHOOK_SECRET") || "";
const store = createTrialStore(env);
async function signingSecret() {
  if (!webhookSecret) webhookSecret = (await store.get("billing:v2:test:webhook-secret"))?.secret || "";
  return webhookSecret;
}
const fail = (code: string, status = 503) => Object.assign(Error(code), { status });
async function identity(token: string) {
  if (!/^[a-f0-9]{64}$/.test(token || "")) throw fail("authentication_required", 401);
  // Reuse existing verified identity read-only. No trial or Production billing mutation.
  const response = await fetch("https://savepulse-backend.onrender.com/api/v1/trial/status", {
    headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(15000)
  });
  if (!response.ok) throw fail("authentication_required", 401);
  const data = await response.json();
  if (data.email !== testEmail) throw fail("billing_test_mailbox_required", 403);
  return data.email;
}
const billing = createBillingLifecycle({ store, stripe: createStripeApi(env), identity, env });
function json(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { "cache-control": "no-store", "x-content-type-options": "nosniff" } });
}
Deno.serve(async request => {
  const operation = new URL(request.url).pathname.split("/").filter(Boolean).at(-1);
  try {
    if (env.SUPABASE_URL !== projectUrl) throw fail("sandbox_project_mismatch");
    if (operation === "readiness" && request.method === "GET") return json({ mode: "test", isolated: true, configured: keyMode(env.STRIPE_SECRET_KEY) === "test", webhookConfigured: Boolean(await signingSecret()), liveSales: false });
    if (keyMode(env.STRIPE_SECRET_KEY) !== "test") throw fail("billing_sandbox_key_required");
    if (request.method === "POST" && operation === "webhook") {
      if (Number(request.headers.get("content-length") || 0) > 262144) throw fail("request_too_large", 413);
      const raw = await request.text();
      if (new TextEncoder().encode(raw).length > 262144) throw fail("request_too_large", 413);
      try { verifyStripeWebhookSignature(raw, request.headers.get("stripe-signature"), await signingSecret()); }
      catch (_) { throw fail("invalid_stripe_signature", 400); }
      const result = await billing.event(JSON.parse(raw));
      return json({ received: true, updated: result.updated, reason: result.reason || null });
    }
    if (request.method === "GET" && operation === "catalog") return json(await billing.catalog());
    const token = request.headers.get("authorization")?.match(/^Bearer (.+)$/i)?.[1] || "";
    if (request.method === "GET" && operation === "status") return json(await billing.status(token));
    if (request.method === "POST" && operation === "portal") return json(await billing.portal(token));
    if (request.method === "POST" && operation === "checkout") {
      const raw = await request.text();
      if (raw.length > 2048) throw fail("request_too_large", 413);
      const body = JSON.parse(raw);
      if (body.email !== await identity(token)) throw fail("verified_email_mismatch", 403);
      return json({ checkout: await billing.checkout(token, body.plan) });
    }
    return json({ error: "not_found" }, 404);
  } catch (error) {
    const allowed = /^(billing_|authentication_required|verified_email_mismatch|invalid_stripe_signature|sandbox_project_mismatch|request_too_large|trial_storage_unavailable)/;
    return json({ error: allowed.test(error.message) ? error.message : "billing_unavailable" }, error.status || 503);
  }
});
