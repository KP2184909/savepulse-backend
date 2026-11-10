"use strict";
const crypto = require("node:crypto");
const QA_RECIPIENT = "savepulse.cloud@gmail.com";
const digest = value => crypto.createHash("sha256").update(value).digest("hex");
// Message fields are flat strings; JSONB may reorder keys on round-trip.
const payloadDigest = message => digest(JSON.stringify(message, Object.keys(message).sort()));

// Test pilot only. Awaited insert/CAS persist before provider side effects.
function createDailyEmailOutbox({ store, send, now = Date.now }) {
  const result = job => ({ ok: job.state === "sent", skipped: job.state !== "sent",
    reason: job.state, messageId: job.messageId || "" });
  async function deliver({ message, idempotencyKey }) {
    if (message?.to !== QA_RECIPIENT || !/^daily-digest\/v1\/[a-f0-9]{64}$/.test(idempotencyKey || "")) {
      throw new Error("daily_email_test_scope_required");
    }
    const key = `daily-email-outbox:v1:test:${digest(idempotencyKey)}`;
    const frozen = JSON.parse(JSON.stringify({ from: message.from, to: message.to,
      subject: `[TEST] ${message.subject}`, text: `TEST ONLY — isolated QA delivery.\n\n${message.text}`,
      html: `<p><strong>TEST ONLY — isolated QA delivery.</strong></p>${message.html}`,
      idempotencyKey }));
    const createdAt = now();
    await store.insert(key, { version: 1, state: "pending", createdAt,
      message: frozen, payloadHash: payloadDigest(frozen) });
    let job = await store.get(key);
    if (!job) throw new Error("daily_email_storage_unavailable");
    if (job.state === "working") {
      if (job.leaseUntil > now()) return result(job);
      // Never blindly resend after a crash: provider may have accepted the email.
      const review = { ...job, version: job.version + 1, state: "manual_review_required" };
      await store.cas(key, job.version, review);
      return result(await store.get(key));
    }
    if (job.state !== "pending") return result(job);
    if (job.message?.to !== QA_RECIPIENT || job.message?.idempotencyKey !== idempotencyKey ||
        payloadDigest(job.message) !== job.payloadHash) {
      throw new Error("daily_email_frozen_payload_invalid");
    }
    // Avoid first delivery after a stale job has waited longer than provider key retention.
    if (now() - job.createdAt >= 23 * 60 * 60 * 1000) {
      await store.cas(key, job.version, { ...job, version: job.version + 1, state: "manual_review_required" });
      return result(await store.get(key));
    }
    const working = { ...job, version: job.version + 1, state: "working", leaseUntil: now() + 120000 };
    if (!await store.cas(key, job.version, working)) return result(await store.get(key));
    let outcome;
    try {
      const response = await send(structuredClone(working.message));
      outcome = response?.messageId && !response.skipped
        ? { state: "sent", messageId: String(response.messageId).slice(0, 160), sentAt: now() }
        : { state: "manual_review_required" };
    } catch (_) {
      outcome = { state: "manual_review_required" };
    }
    const saved = await store.cas(key, working.version, { ...working, ...outcome, version: working.version + 1 });
    if (!saved) throw new Error("daily_email_result_not_persisted");
    return result(await store.get(key));
  }
  return { deliver };
}
module.exports = { createDailyEmailOutbox };
