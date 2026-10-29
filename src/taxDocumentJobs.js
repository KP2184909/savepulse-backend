"use strict";
const crypto = require("node:crypto");
const fail = code => Object.assign(Error(code), { status: 503 });
const REVIEWABLE = new Set(["tax_fx_calendar_review_required","tax_fx_special_closure_review_required","tax_fx_announcement_time_review_required","tax_fx_month_end_review_required","billing_invoice_tax_review_required","billing_tax_profile_missing","tax_document_live_issuance_not_approved"]);
const RETRYABLE = new Set(["tax_fx_exact_date_unavailable", "tax_fx_provider_unavailable", "tax_fx_storage_unavailable", "tax_document_storage_busy", "billing_provider_unavailable"]);
function createTaxDocumentJobs({ store, issue, mode, now = Date.now }) {
  if (!["test", "live"].includes(mode)) throw Error("tax_document_mode_required");
  const keyFor = id => {
    if (!/^in_\w+$/.test(id || "")) throw fail("billing_invoice_required");
    return `tax-job:v1:${mode}:${crypto.createHash("sha256").update(id).digest("hex")}`;
  };
  async function change(key, fn) {
    for (let i=0;i<12;i++) { const old=await store.get(key), next=fn(old); if (!next) return old;
      next.version=(old?.version||0)+1;
      if(old ? await store.cas(key,old.version,next) : await store.insert(key,next)) return next;
    } throw fail("tax_document_storage_busy");
  }
  async function enqueue(invoiceId) {
    return change(keyFor(invoiceId), old => old ? null : { invoiceId, mode, state:"pending", attempts:0, nextAttemptAt:now(), createdAt:now(), leaseUntil:0 });
  }
  async function run(invoiceId) {
    await enqueue(invoiceId);
    const owner=crypto.randomUUID(), key=keyFor(invoiceId);
    const job=await change(key, old => {
      if (["issued","review"].includes(old.state) || old.nextAttemptAt>now() || old.leaseUntil>now()) return null;
      return {...old,state:"working",owner,leaseUntil:now()+90000,attempts:old.attempts+1};
    });
    if (job.owner!==owner || job.state!=="working") return job;
    let document, failure;
    try { document=await issue(invoiceId); if(document.paymentMode!==mode || document.sourceInvoiceId!==invoiceId || document.status!=="issued") throw fail("tax_document_verified_source_required"); }
    catch(error) { failure=(RETRYABLE.has(error.message)||REVIEWABLE.has(error.message)) ? error.message : "tax_document_review_required"; }
    return change(key, old => {
      if(old.owner!==owner || old.leaseUntil<=now()) throw fail("tax_document_worker_fenced");
      if(!failure) return {...old,state:"issued",document,completedAt:now(),leaseUntil:0};
      const retry=RETRYABLE.has(failure) && now()-old.createdAt<24*3600000;
      return {...old,state:retry?"retry":"review",lastError:failure,lastFailureAt:now(),leaseUntil:0,nextAttemptAt:retry?now()+Math.min(3600000,60000*2**Math.min(old.attempts-1,6)):null};
    });
  }
  return {enqueue,run,keyFor};
}
module.exports = { createTaxDocumentJobs };
