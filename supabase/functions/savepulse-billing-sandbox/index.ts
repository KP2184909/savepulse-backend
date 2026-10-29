import crypto from "node:crypto";
import { selectBotTaxRateDate } from "./shared/taxFxPolicy.mjs";
import { createTaxDocumentJobs } from "./shared/taxDocumentJobs.mjs";
import { createBotTaxFx } from "./shared/botTaxFx.mjs";
import { createTaxDocumentLedger } from "./shared/taxDocumentLedger.mjs";
import { buildThaiTaxInvoiceDraft, renderTaxDocument } from "./shared/thaiTaxInvoiceDraft.mjs";
import { createBillingLifecycle, createStripeApi, keyMode } from "./shared/billingLifecycle.mjs";
import { createTrialStore } from "./shared/trialLifecycle.mjs";
import { verifyStripeWebhookSignature } from "./shared/stripeSignature.mjs";

const projectUrl = "https://sktzydyiwqylpstxjicf.supabase.co";
const previewUrl = "https://deploy-preview-10--astounding-fenglisu-0ff097.netlify.app";
const testEmail = "savepulse.cloud@gmail.com";
const env = {
  BILLING_V2_ENABLED: "true", BILLING_DOMESTIC_VAT_ENABLED: "true", STRIPE_MANUAL_TAX_RATE: "", SUPABASE_URL: Deno.env.get("SUPABASE_URL"),
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
const stripe = createStripeApi(env);
const billing = createBillingLifecycle({ store, stripe, identity, env });
async function ensureSandboxTaxRate() {
  const key = "billing:v2:test:inclusive-th-vat7";
  const stored = await store.get(key);
  if (stored?.id) { env.STRIPE_MANUAL_TAX_RATE = stored.id; return; }
  const listed = await stripe("GET", "/tax_rates", { limit: 100 });
  const description = "SavePulse sandbox Thailand VAT 7% inclusive";
  let rate = listed.data?.find(rate => rate.description === description && rate.inclusive === true && rate.country === "TH" && Number(rate.percentage) === 7 && rate.active && !rate.livemode);
  if (!rate) rate = await stripe("POST", "/tax_rates", { display_name: "VAT", description, percentage: 7, inclusive: true, country: "TH", jurisdiction: "Thailand" }, "savepulse-sandbox-inclusive-vat7-v1");
  if (rate.livemode || !rate.id) throw fail("billing_tax_configuration_invalid");
  await store.insert(key, { version: 1, id: rate.id });
  env.STRIPE_MANUAL_TAX_RATE = rate.id;
}
const taxLedger = createTaxDocumentLedger({ store, mode: "test", source: async invoiceId => {
  const context = await billing.paidInvoiceForTaxDraft(invoiceId, true);
  if (context.recipient !== testEmail || !context.customer) throw fail("billing_tax_profile_missing",422);
  const selection = selectBotTaxRateDate(context.payment.status_transitions.paid_at);
  const evidence = await createBotTaxFx({ token: Deno.env.get("BOT_EXCHANGE_RATE_API_KEY"), store })(selection.rateDate);
  const fx = { ...evidence, ...selection };
  return { evidenceVerified: true, mode: "test", recipient: testEmail, fxEvidence: evidence, draft: buildThaiTaxInvoiceDraft({ payment: context.payment, customer: context.customer, fx, treatment: "th_domestic_standard_7_inclusive" }) };
}, send: async ({ to, document, idempotencyKey }) => {
  const key = Deno.env.get("SAVEPULSE_TEST_RESEND_KEY"), from = Deno.env.get("SAVEPULSE_TEST_FROM_EMAIL");
  if (!key || !from || to !== testEmail) throw fail("billing_tax_delivery_not_configured");
  const response = await fetch("https://api.resend.com/emails", { method: "POST", headers: { authorization: `Bearer ${key}`, "content-type": "application/json", "idempotency-key": idempotencyKey }, body: JSON.stringify({ from, to: [testEmail], subject: `[TEST] SavePulse tax document ${document.invoiceNumber}`, html: renderTaxDocument(document) }), signal: AbortSignal.timeout(12000) });
  if (!response.ok) throw fail("billing_tax_delivery_failed");
  return response.json();
} });
const taxJobs = createTaxDocumentJobs({ store, mode: "test", issue: invoiceId => taxLedger.issue(invoiceId) });
function json(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { "cache-control": "no-store", "x-content-type-options": "nosniff" } });
}
Deno.serve(async request => {
  const operation = new URL(request.url).pathname.split("/").filter(Boolean).at(-1);
  try {
    if (env.SUPABASE_URL !== projectUrl) throw fail("sandbox_project_mismatch");
    if (operation === "readiness" && request.method === "GET") return json({ mode: "test", isolated: true, configured: keyMode(env.STRIPE_SECRET_KEY) === "test", webhookConfigured: Boolean(await signingSecret()), liveSales: false });
    if (keyMode(env.STRIPE_SECRET_KEY) !== "test") throw fail("billing_sandbox_key_required");
    if (request.method === "POST" && operation === "tax-worker") {
      const expected = (await store.get("tax-worker:v1:test:credential"))?.token || "";
      const provided = request.headers.get("x-savepulse-worker-token") || "";
      if (!/^[a-f0-9]{64}$/.test(expected) || !/^[a-f0-9]{64}$/.test(provided) || !crypto.timingSafeEqual(new TextEncoder().encode(provided),new TextEncoder().encode(expected))) throw fail("authentication_required",401);
      await ensureSandboxTaxRate();
      const workerInput = await request.json().catch(() => ({}));
      if (workerInput.auditLatestInvoice === true) {
        const account = await store.get(billing.accountKey(testEmail));
        if (!account?.membership?.subscriptionId) throw fail("billing_invoice_required",422);
        const subscription = await stripe("GET",`/subscriptions/${account.membership.subscriptionId}`,{expand:["latest_invoice"]});
        const invoiceId = typeof subscription.latest_invoice === "string" ? subscription.latest_invoice : subscription.latest_invoice?.id;
        const context = await billing.paidInvoiceForTaxDraft(invoiceId,true);
        if(context.recipient !== testEmail || !context.customer) throw fail("billing_test_mailbox_required",403);
        return json({mode:"test",audit:"paid_invoice_snapshot",verified:true,invoiceId:context.payment.id,amountPaid:context.payment.amount_paid,currency:context.payment.currency,documentsCreated:0,emailsSent:0});
      }
      // Recover a missed paid webhook for the single authorized sandbox account.
      const account = await store.get(billing.accountKey(testEmail));
      if(account?.membership?.subscriptionId){
        const subscription=await stripe("GET",`/subscriptions/${account.membership.subscriptionId}`,{expand:["latest_invoice"]});
        if(subscription.latest_invoice?.status === "paid") await taxJobs.enqueue(subscription.latest_invoice.id);
      }
      const query = new URLSearchParams({select:"key,value",key:"like.tax-job:v1:test:*","value->>state":"in.(pending,retry,working)",order:"updated_at.asc",limit:"20"});
      const response = await fetch(`${projectUrl}/rest/v1/scheduler_state?${query}`,{headers:{apikey:env.SUPABASE_SERVICE_ROLE_KEY!,authorization:`Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`},signal:AbortSignal.timeout(12000)});
      if(!response.ok) throw fail("tax_document_storage_busy");
      const jobs = await response.json(), states = [];
      for(const job of jobs){ if(job.value.nextAttemptAt<=Date.now() && job.value.leaseUntil<=Date.now()){const result=await taxJobs.run(job.value.invoiceId);states.push(result.state);} }
      return json({mode:"test",processed:states.length,states});
    }
    if (request.method === "POST" && operation === "webhook") {
      if (Number(request.headers.get("content-length") || 0) > 262144) throw fail("request_too_large", 413);
      const raw = await request.text();
      if (new TextEncoder().encode(raw).length > 262144) throw fail("request_too_large", 413);
      try { verifyStripeWebhookSignature(raw, request.headers.get("stripe-signature"), await signingSecret()); }
      catch (_) { throw fail("invalid_stripe_signature", 400); }
      const event = JSON.parse(raw);
      const result = await billing.event(event);
      if ((result.updated || result.reason === "duplicate_event") && result.email === testEmail && ["invoice.paid","invoice.payment_succeeded"].includes(event.type) && /^in_\w+$/.test(event.data?.object?.id || "")) await taxJobs.enqueue(event.data.object.id);
      return json({ received: true, updated: result.updated, reason: result.reason || null });
    }
    if (request.method === "GET" && operation === "catalog") return json(await billing.catalog());
    const token = request.headers.get("authorization")?.match(/^Bearer (.+)$/i)?.[1] || "";
    if (request.method === "GET" && operation === "status") return json(await billing.status(token));
    if (request.method === "POST" && operation === "portal") return json(await billing.portal(token));
    if (request.method === "POST" && operation === "profile") {
      await identity(token);
      const raw = await request.text(); if (raw.length > 2048) throw fail("request_too_large",413);
      await ensureSandboxTaxRate();
      return json(await billing.saveProfile(token, JSON.parse(raw)));
    }
    if (request.method === "POST" && operation === "tax-document") {
      const email = await identity(token);
      const raw = await request.text(); if (raw.length > 2048) throw fail("request_too_large",413);
      const body = JSON.parse(raw);
      const row = await store.get(billing.accountKey(email));
      if (!row?.membership?.subscriptionId) throw fail("billing_invoice_required",422);
      const subscription = await stripe("GET", `/subscriptions/${row.membership.subscriptionId}`);
      const latest = typeof subscription.latest_invoice === "string" ? subscription.latest_invoice : subscription.latest_invoice?.id;
      if (!latest || (body.invoiceId && body.invoiceId !== latest)) throw fail("billing_invoice_required",422);
      await ensureSandboxTaxRate();
      const job = await taxJobs.run(latest);
      if (job.state !== "issued") return json({ pending:true, state:job.state, nextAttemptAt:job.nextAttemptAt, error:job.lastError || "tax_document_pending" },202);
      const document = job.document;
      let delivery = "not_configured";
      if (Deno.env.get("SAVEPULSE_TEST_RESEND_KEY") && Deno.env.get("SAVEPULSE_TEST_FROM_EMAIL")) {
        await taxLedger.deliver(document.paymentDate.slice(0,7).replace("-",""), latest); delivery = "sent";
      }
      return json({ document, html: renderTaxDocument(document), delivery });
    }
    if (request.method === "POST" && operation === "checkout") {
      const raw = await request.text();
      if (raw.length > 2048) throw fail("request_too_large", 413);
      const body = JSON.parse(raw);
      if (body.email !== await identity(token)) throw fail("verified_email_mismatch", 403);
      await ensureSandboxTaxRate();
      return json({ checkout: await billing.checkout(token, body.plan) });
    }
    return json({ error: "not_found" }, 404);
  } catch (error) {
    const allowed = /^(tax_fx_|tax_document_|billing_|authentication_required|verified_email_mismatch|invalid_stripe_signature|sandbox_project_mismatch|request_too_large|trial_storage_unavailable)/;
    return json({ error: allowed.test(error.message) ? error.message : "billing_unavailable" }, error.status || 503);
  }
});
