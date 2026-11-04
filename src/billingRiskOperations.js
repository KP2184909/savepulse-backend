"use strict";
const { createBillingRiskInbox } = require("./billingRiskInbox");
const { createBillingRiskResolver } = require("./billingRiskResolver");
const { keyMode } = require("./billingLifecycle");

// A durable review workflow, never an automatic refund or access decision.
function createBillingRiskOperations({ store, stripe, invoiceSource, env = process.env }) {
  const mode = keyMode(env.STRIPE_SECRET_KEY || env.STRIPE_API_KEY);
  const accountId = env.STRIPE_EXPECTED_ACCOUNT_ID;
  const enabled = env.BILLING_V2_ENABLED === "true" &&
    ["test", "live"].includes(mode) && /^acct_\w+$/.test(accountId || "");
  if (!enabled) return null;
  const resolver = createBillingRiskResolver({ stripe, mode, accountId, invoiceSource });
  const inbox = createBillingRiskInbox({ store, mode, accountId, resolve: resolver.resolve });
  let running = false;
  async function tick() {
    if (running) return { processed: 0 };
    running = true;
    try {
      const rows = await store.billingRiskRows(mode, accountId, true);
      let processed = 0;
      for (const row of rows) if ((await inbox.reconcile(row.key)).updated) processed++;
      return { processed };
    } finally { running = false; }
  }
  async function summary() {
    const rows = await store.billingRiskRows(mode, accountId, false);
    return { mode, accountId, limit: 100, truncated: rows.length === 100,
      tasks: rows.map(row => ({ eventId: row.eventId, type: row.type, state: row.state,
        ownershipVerified: row.ownershipVerified === true, receivedAt: row.receivedAt,
        attempts: row.attempts || 0, nextAttemptAt: row.nextAttemptAt || null,
        entitlementChanged: false, creditNoteCreated: false })) };
  }
  return { receive: inbox.receive, tick, summary };
}
module.exports = { createBillingRiskOperations };
