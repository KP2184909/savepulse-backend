"use strict";
const crypto = require("node:crypto");
const fail = code => Object.assign(new Error(code), { status: 503 });
// One CAS write allocates a number AND stores the immutable document. A crash cannot
// allocate the same number to two invoices or store an unnumbered issued document.
function createTaxDocumentLedger({ store, source, send, mode, now = Date.now }) {
  if (!["test", "live"].includes(mode)) throw Error("tax_document_mode_required");
  const digest = value => crypto.createHash("sha256").update(value).digest("hex");
  async function change(key, fn) {
    for (let i = 0; i < 64; i++) {
      const old = await store.get(key);
      const next = fn(old || { version: 0, nextNumber: 1, documents: {} });
      if (!next) return old;
      next.version = (old?.version || 0) + 1;
      if (old ? await store.cas(key, old.version, next) : await store.insert(key, next)) return next;
    }
    throw fail("tax_document_storage_busy");
  }
  const keyFor = period => `tax-documents:v1:${mode}:${period}`;
  async function issue(invoiceId) {
    // Source must independently fetch payment/customer/FX evidence; never use request
    // body amounts, addresses or a caller-supplied "verified" flag as issuance proof.
    const verified = await source(invoiceId);
    const draft = verified?.draft;
    if (!verified?.evidenceVerified || verified.mode !== mode || draft?.status !== "draft" || draft.sourceInvoiceId !== invoiceId || draft.paymentMode !== mode || !verified.recipient || !draft.fx?.sourceUrl || !verified.fxEvidence) throw fail("tax_document_verified_source_required");
    const period = draft.paymentDate?.slice(0, 7).replace("-", "");
    if (!/^\d{6}$/.test(period || "")) throw fail("tax_document_period_required");
    const key = keyFor(period), id = digest(invoiceId);
    const row = await change(key, old => {
      if (old.documents[id]) return null;
      if (old.nextNumber > 999999) throw fail("tax_document_sequence_exhausted");
      const invoiceNumber = `${mode === "test" ? "TEST-" : ""}SP-TI-${period}-${String(old.nextNumber).padStart(6, "0")}`;
      const document = { ...structuredClone(draft), status: "issued", issued: true, invoiceNumber, issuedAt: new Date(now()).toISOString(), evidence: { sourceInvoice: invoiceId, fx: structuredClone(verified.fxEvidence) } };
      return { ...old, nextNumber: old.nextNumber + 1, documents: { ...old.documents, [id]: { document, recipient: verified.recipient, delivery: { status: "pending", attempts: 0 } } } };
    });
    return structuredClone(row.documents[id].document);
  }
  async function deliver(period, invoiceId) {
    const key = keyFor(period), id = digest(invoiceId), owner = crypto.randomUUID();
    const row = await change(key, old => {
      const item = old.documents[id];
      if (!item) throw fail("tax_document_not_found");
      const job = item.delivery;
      if (job.status === "sent") return null;
      // A worker may have sent but crashed before saving acknowledgement. Never
      // retry beyond provider idempotency retention and risk duplicate mail.
      if (job.firstAttemptAt && now() - job.firstAttemptAt >= 23 * 3600000) throw fail("tax_document_delivery_needs_review");
      if (job.leaseUntil > now()) throw fail("tax_document_delivery_busy");
      return { ...old, documents: { ...old.documents, [id]: { ...item, delivery: { ...job, status: "sending", owner, leaseUntil: now() + 90000, attempts: job.attempts + 1, firstAttemptAt: job.firstAttemptAt || now() } } } };
    });
    const item = row.documents[id];
    if (item.delivery.status === "sent") return { sent: true, duplicate: true };
    let result;
    try { result = await send({ to: item.recipient, document: structuredClone(item.document), idempotencyKey: `tax-document/${mode}/${item.document.invoiceNumber}` }); }
    catch (_) {
      await change(key, old => {
        const current = old.documents[id];
        if (current.delivery.owner !== owner) return null;
        return { ...old, documents: { ...old.documents, [id]: { ...current, delivery: { ...current.delivery, status: "failed", leaseUntil: 0, lastFailureAt: new Date(now()).toISOString() } } } };
      });
      throw fail("tax_document_delivery_failed");
    }
    if (!result?.id) throw fail("tax_document_delivery_unconfirmed");
    await change(key, old => {
      const current = old.documents[id];
      if (current.delivery.owner !== owner || current.delivery.leaseUntil <= now()) throw fail("tax_document_delivery_needs_review");
      return { ...old, documents: { ...old.documents, [id]: { ...current, delivery: { ...current.delivery, status: "sent", leaseUntil: 0, sentAt: new Date(now()).toISOString(), providerId: result.id } } } };
    });
    return { sent: true, duplicate: false };
  }
  return { issue, deliver };
}
module.exports = { createTaxDocumentLedger };
