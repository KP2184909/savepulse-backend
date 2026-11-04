"use strict";
// Pass only server-read ledger rows. Never accept destinations/document bodies
// from a client. A missing mailer must not consume delivery attempts.
async function runTaxDeliveryWorker({rows,ledger,configured,mode,now=Date.now(),limit=10}) {
  if(mode!=="test") throw Error("tax_document_live_delivery_not_approved");
  if(!configured)return {configured:false,accepted:0,review:0,failed:0};
  let accepted=0,review=0,failed=0,processed=0;
  for(const row of rows) {
    if(!/^tax-documents:v1:test:\d{6}$/.test(row.key||"")) continue;
    const period=row.key.slice(-6);
    for(const item of Object.values(row.value?.documents||{})) {
      if(processed>=limit)return {configured:true,accepted,review,failed};
      if(item.recipient!=="savepulse.cloud@gmail.com" || !item.document?.invoiceNumber?.startsWith("TEST-") || item.document.paymentMode!=="test")continue;
      const documents=[{document:item.document,job:item.delivery}];
      for(const [creditId,credit] of Object.entries(item.credits||{})) documents.push({document:credit,job:item.creditDeliveries?.[creditId]||{status:"pending"}});
      for(const entry of documents) {
        if(processed>=limit)return {configured:true,accepted,review,failed};
        const job=entry.job,doc=entry.document;
        if(!doc?.invoiceNumber?.startsWith("TEST-") || doc.paymentMode!=="test" || doc.sourceInvoiceId!==item.document.sourceInvoiceId)continue;
        if(!job || job.status==="sent" || job.leaseUntil>now || job.nextAttemptAt>now)continue;
        processed++;
        try {const result=await ledger.deliver(period,doc.sourceInvoiceId,doc.sourceRefundId);if(result.sent && !result.duplicate)accepted++;}
        catch(error) {
          if(error.message==="tax_document_delivery_needs_review")review++;
          else if(!["tax_document_delivery_busy","tax_document_delivery_retry_later"].includes(error.message))failed++;
        }
      }
    }
  }
  // Accepted means acknowledged by the email provider, not inbox delivery.
  return {configured:true,accepted,review,failed};
}
module.exports={runTaxDeliveryWorker};
