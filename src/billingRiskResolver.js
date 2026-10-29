"use strict";
const id = value => typeof value === "string" ? value : value?.id;
const fail = code => { throw Error(code); };
// Read-only traversal of Stripe's first-class payment graph. Never infer
// invoice ownership from a webhook's customer email or metadata.
function createBillingRiskResolver({stripe,mode,accountId,invoiceSource}) {
  const live = mode === "live";
  async function resolve(task) {
    if(task.mode!==mode || task.accountId!==accountId) fail("billing_mode_mismatch");
    if((await stripe("GET","/account")).id!==accountId) fail("billing_account_mismatch");
    const routes={"charge.refunded":"/charges/","charge.dispute.created":"/disputes/","radar.early_fraud_warning.created":"/radar/early_fraud_warnings/"};
    if(!routes[task.type] || !/^(ch|dp|issfr)_\w+$/.test(task.objectId||"")) fail("billing_invalid_risk_event");
    const object=await stripe("GET",routes[task.type]+task.objectId);
    if(object.id!==task.objectId || object.livemode!==live) fail("billing_mode_mismatch");
    const chargeId=task.type==="charge.refunded" ? object.id : id(object.charge);
    if(!/^ch_\w+$/.test(chargeId||"")) fail("billing_risk_unresolved");
    const charge=task.type==="charge.refunded" ? object : await stripe("GET","/charges/"+chargeId);
    if(charge.id!==chargeId || charge.livemode!==live) fail("billing_mode_mismatch");
    const intentId=id(charge.payment_intent);
    if(!/^pi_\w+$/.test(intentId||"")) fail("billing_risk_unresolved");
    if(id(object.payment_intent) && id(object.payment_intent)!==intentId) fail("billing_risk_payment_mismatch");
    const invoiceIds=new Set(); let after;
    // More than one invoice is possible. Stop rather than use a partial graph.
    for(let page=0;page<20;page++) {
      const list=await stripe("GET","/invoice_payments",{payment:{type:"payment_intent",payment_intent:intentId},status:"paid",limit:100,...(after?{starting_after:after}:{})});
      if(!Array.isArray(list.data)) fail("billing_risk_unresolved");
      for(const item of list.data) {
        if(item.status!=="paid" || item.payment?.type!=="payment_intent" || id(item.payment.payment_intent)!==intentId || !/^in_\w+$/.test(id(item.invoice)||"")) fail("billing_risk_payment_mismatch");
        invoiceIds.add(id(item.invoice));
      }
      if(!list.has_more) break;
      const next=list.data.at(-1)?.id;
      if(!next || next===after || page===19) fail("billing_risk_pagination_incomplete");
      after=next;
    }
    if(!invoiceIds.size) fail("billing_risk_unresolved");
    const invoices=[];
    for(const invoiceId of invoiceIds) {
      const context=await invoiceSource(invoiceId);
      const invoice=context.payment;
      if(invoice.id!==invoiceId || invoice.livemode!==live || invoice.status!=="paid" || invoice.parent?.type!=="subscription_details" || id(invoice.customer)!==id(charge.customer)) fail("billing_risk_ownership_mismatch");
      invoices.push({invoiceId,amountPaid:invoice.amount_paid,currency:invoice.currency});
    }
    // Refund-to-invoice allocation is ambiguous for multi-invoice payments.
    // Keep it for review, never distribute a refund using guessed proportions.
    return {ownershipVerified:true,chargeId,paymentIntentId:intentId,invoices,
      allocationReviewRequired:invoices.length!==1,reviewRequired:true};
  }
  return {resolve};
}
module.exports={createBillingRiskResolver};
