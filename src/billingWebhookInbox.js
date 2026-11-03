"use strict";
const crypto = require("node:crypto");
const { EVENTS } = require("./billingLifecycle");
const fail = code => Object.assign(new Error(code), { status: 503 });

// Call receive only after raw-body signature verification. Persist references,
// never the raw provider payload; processing still retrieves authoritative data.
function createBillingWebhookInbox({ store, mode, accountId, processEvent, now = Date.now }) {
  if (!["test", "live"].includes(mode) || !/^acct_\w+$/.test(accountId || "")) throw fail("billing_inbox_configuration_invalid");
  const prefix = `billing-webhook:v1:${mode}:${accountId}:`;
  const keyFor = eventId => prefix + crypto.createHash("sha256").update(eventId).digest("hex");
  async function receive(event) {
    if (event?.livemode !== (mode === "live")) throw Object.assign(Error("billing_mode_mismatch"), { status: 422 });
    if (!EVENTS.includes(event.type)) return { reason: "event_ignored", queued: false };
    if (!/^evt_\w+$/.test(event.id || "")) throw Object.assign(Error("billing_invalid_event"), { status: 422 });
    const object = event.data?.object || {};
    const ref = value => typeof value === "string" ? value : value?.id;
    const subscription = event.type.startsWith("customer.subscription.") ? object.id : ref(object.subscription) || ref(object.parent?.subscription_details?.subscription);
    if (!/^sub_\w+$/.test(subscription || "")) return { reason: "subscription_missing", queued: false };
    const minimal = { id: event.id, type: event.type, livemode: event.livemode,
      data: { object: { id: object.id, subscription } } };
    // Even expanded fields above are reduced to validated identifiers.
    if (!/^(sub|cs|in)_\w+$/.test(minimal.data.object.id || "")) throw Object.assign(Error("billing_invalid_event"), { status: 422 });
    const inserted = await store.insert(keyFor(event.id), { version: 1, event: minimal,
      state: "pending", attempts: 0, nextAttemptAt: now(), leaseUntil: 0, receivedAt: new Date(now()).toISOString() });
    return { queued: true, reason: inserted ? "event_queued" : "duplicate_queued_event" };
  }
  async function run(key) {
    if (!key.startsWith(prefix) || !/^[a-f0-9]{64}$/.test(key.slice(prefix.length))) throw fail("billing_inbox_key_invalid");
    const row = await store.get(key);
    if (!row || !["pending", "working"].includes(row.state) || row.nextAttemptAt > now() || row.leaseUntil > now()) return { processed: false };
    const claim = { ...row, version: row.version + 1, state: "working", leaseUntil: now() + 120000 };
    if (!await store.cas(key, row.version, claim)) return { processed: false };
    let next;
    try {
      await processEvent(claim.event);
      next = { ...claim, state: "processed", processedAt: new Date(now()).toISOString() };
    } catch (_) {
      const attempts = claim.attempts + 1;
      next = { ...claim, attempts, state: attempts >= 20 ? "manual_review_required" : "pending",
        lastError: "billing_event_processing_retry", nextAttemptAt: now() + Math.min(3600000, 30000 * 2 ** Math.min(attempts, 7)) };
    }
    // Fences a stalled worker after another worker reclaimed its expired lease.
    next.version = claim.version + 1; next.leaseUntil = 0;
    const saved = await store.cas(key, claim.version, next);
    return { processed: saved && next.state === "processed", state: saved ? next.state : "lease_lost" };
  }
  async function tick() {
    const rows = await store.billingWebhookRows(mode, accountId);
    let processed = 0;
    for (const row of rows) if ((await run(row.key)).processed) processed++;
    return { processed };
  }
  return { receive, run, tick, keyFor };
}
module.exports = { createBillingWebhookInbox };
