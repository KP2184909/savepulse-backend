"use strict";
const crypto = require("node:crypto");
const TYPES = Object.freeze({
  "charge.refunded": /^ch_\w+$/,
  "charge.dispute.created": /^dp_\w+$/,
  "radar.early_fraud_warning.created": /^issfr_\w+$/
});
// Call only after signature verification. Keep a durable review task, not a
// client-supplied membership decision or a raw payment/customer payload.
function createBillingRiskInbox({ store, mode, accountId, now = Date.now }) {
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
  return { receive };
}
module.exports = { createBillingRiskInbox, TYPES };
