"use strict";
const crypto = require("node:crypto");
const TYPES = Object.freeze({
  "charge.refunded": /^ch_\w+$/,
  "charge.dispute.created": /^dp_\w+$/,
  "radar.early_fraud_warning.created": /^issfr_\w+$/
});
// Call only after signature verification. Keep a durable review task, not a
// client-supplied membership decision or a raw payment/customer payload.
function createBillingRiskInbox({ store, mode, accountId, resolve, now = Date.now }) {
  if (!["test", "live"].includes(mode) || !/^acct_\w+$/.test(accountId || "")) throw Error("billing_risk_configuration_invalid");
  async function receive(event) {
    if (!Object.hasOwn(TYPES, event?.type || "")) return { received: false, reason: "event_ignored" };
    if (event.livemode !== (mode === "live")) throw Error("billing_mode_mismatch");
    if (!/^evt_\w+$/.test(event.id || "") || !TYPES[event.type].test(event.data?.object?.id || "")) throw Error("billing_invalid_risk_event");
    const key = `billing-risk:v1:${mode}:${accountId}:` + crypto.createHash("sha256").update(event.id).digest("hex");
    const inserted = await store.insert(key, {
      version: 1, eventId: event.id, type: event.type, objectId: event.data.object.id,
      accountId, mode, state: "pending_review", receivedAt: new Date(now()).toISOString(),
      ownershipVerified: false, entitlementChanged: false, creditNoteCreated: false
    });
    if (!inserted) return { received: true, reason: "duplicate_risk_event" };
    return { received: true, reason: "risk_review_queued" };
  }
  async function reconcile(key) {
    const prefix = `billing-risk:v1:${mode}:${accountId}:`;
    if (!resolve || !key.startsWith(prefix) || !/^[a-f0-9]{64}$/.test(key.slice(prefix.length))) throw Error("billing_risk_configuration_invalid");
    const row = await store.get(key);
    if (!row || row.state !== "pending_review" || (row.nextAttemptAt || 0) > now()) return {updated:false};
    let result;
    try { result = await resolve(row); }
    catch (_) {
      // Provider payloads/errors must not leak credentials or customer details.
      const attempts=(row.attempts || 0)+1;
      const next={...row,version:row.version+1,attempts,lastError:"risk_resolution_requires_review",nextAttemptAt:now()+Math.min(3600000,60000*2**Math.min(attempts,6))};
      if(attempts>=10) next.state="manual_review_required";
      await store.cas(key,row.version,next);
      return {updated:false,reason:"risk_resolution_requires_review"};
    }
    if(result?.ownershipVerified!==true) throw Error("billing_risk_ownership_required");
    const next={...row,version:row.version+1,state:"verified_review_required",ownershipVerified:true,
      evidence:result,verifiedAt:new Date(now()).toISOString()};
    return {updated:await store.cas(key,row.version,next),reason:"risk_ownership_verified"};
  }
  return { receive, reconcile };
}
module.exports = { createBillingRiskInbox, TYPES };
