"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {createBillingRiskResolver}=require("../src/billingRiskResolver");
function fixture(){
 const charge={id:"ch_fixture",livemode:false,payment_intent:"pi_fixture",customer:"cus_fixture"};
 const object={id:"dp_fixture",livemode:false,charge:"ch_fixture",payment_intent:"pi_fixture"};
 const invoice={id:"in_fixture",livemode:false,status:"paid",parent:{type:"subscription_details"},customer:"cus_fixture",amount_paid:500,currency:"usd"};
 const payment={id:"inpay_fixture",status:"paid",invoice:"in_fixture",payment:{type:"payment_intent",payment_intent:"pi_fixture"}};
 const pages=[{data:[payment],has_more:false}],requests=[];
 const stripe=async(method,route,values)=>{requests.push({method,route,values});if(route==="/account")return{id:"acct_fixture"};if(route==="/charges/ch_fixture")return charge;if(route==="/disputes/dp_fixture"||route==="/radar/early_fraud_warnings/issfr_fixture")return object;if(route==="/invoice_payments")return pages.length>1?pages.shift():pages[0];throw Error("unexpected");};
 const options={stripe,mode:"test",accountId:"acct_fixture",invoiceSource:async()=>({payment:invoice})};
 return{charge,object,invoice,payment,pages,requests,options,api:createBillingRiskResolver(options),task:{mode:"test",accountId:"acct_fixture",type:"charge.refunded",objectId:"ch_fixture"}};
}
test("risk ownership follows retrieved charge and paginated invoice payments",async()=>{
 const f=fixture();f.pages.splice(0,1,{data:[f.payment],has_more:true},{data:[{...f.payment,id:"inpay_second"}],has_more:false});
 const result=await f.api.resolve(f.task);assert.equal(result.ownershipVerified,true);assert.equal(result.invoices.length,1);assert.equal(result.reviewRequired,true);assert.equal(f.requests.at(-1).values.starting_after,"inpay_fixture");assert.ok(f.requests.every(r=>r.method==="GET"));
});
test("disputes and fraud warnings retrieve charge rather than trust event metadata",async()=>{
 for(const [type,id] of [["charge.dispute.created","dp_fixture"],["radar.early_fraud_warning.created","issfr_fixture"]]){
 const f=fixture();f.object.id=id;assert.equal((await f.api.resolve({...f.task,type,objectId:id})).chargeId,"ch_fixture");
 }
});
test("wrong mode account customer and payment links cannot verify ownership",async()=>{
 for(const mutate of [f=>f.charge.livemode=true,f=>f.invoice.customer="cus_other",f=>f.payment.payment.payment_intent="pi_other",f=>f.charge.payment_intent=null]){
 const f=fixture();mutate(f);await assert.rejects(f.api.resolve(f.task),/billing_/);
 }
 const f=fixture();await assert.rejects(f.api.resolve({...f.task,accountId:"acct_other"}),/mode_mismatch/);
 const api=createBillingRiskResolver({...f.options,stripe:async()=>({id:"acct_other"})});await assert.rejects(api.resolve(f.task),/account_mismatch/);
});
test("multiple invoice allocations remain review-only and incomplete pagination fails closed",async()=>{
 const f=fixture();f.pages[0].data.push({...f.payment,id:"inpay_other",invoice:"in_other"});
 const api=createBillingRiskResolver({...f.options,invoiceSource:async id=>({payment:{...f.invoice,id}})});
 const result=await api.resolve(f.task);assert.equal(result.invoices.length,2);assert.equal(result.allocationReviewRequired,true);
 const g=fixture();g.pages[0].has_more=true;await assert.rejects(g.api.resolve(g.task),/pagination_incomplete/);
});
test("unbound and unrelated invoices are retained for review rather than accepted",async()=>{
 const f=fixture();f.pages[0].data=[];await assert.rejects(f.api.resolve(f.task),/unresolved/);
 const g=fixture();const api=createBillingRiskResolver({...g.options,invoiceSource:async()=>{throw Error("billing_bound_invoice_required");}});await assert.rejects(api.resolve(g.task),/bound_invoice_required/);
});

test("credit source retrieves a successful refund and requires invoice allocation and reason review",async()=>{
 const f=fixture();const refund={id:"re_fixture",charge:"ch_fixture",payment_intent:"pi_fixture",status:"succeeded",currency:"usd",amount:100,created:100};
 const api=createBillingRiskResolver({...f.options,stripe:async(...args)=>args[1]==="/refunds/re_fixture"?refund:f.options.stripe(...args)});
 const review={reasonCode:"service_cancelled",reviewedBy:"sandbox_qa",evidenceReference:"qa_fixture"};
 const result=await api.verifiedRefund("in_fixture","re_fixture",review);assert.equal(result.refund.amount,100);assert.equal(result.refund.mode,"test");assert.equal(result.evidenceVerified,true);
 await assert.rejects(api.verifiedRefund("in_other","re_fixture",review),/allocation_review/);
 await assert.rejects(api.verifiedRefund("in_fixture","re_fixture",{}),/reason_review/);
 refund.status="pending";await assert.rejects(api.verifiedRefund("in_fixture","re_fixture",review),/verified_refund/);
 refund.status="succeeded";refund.payment_intent="pi_other";await assert.rejects(api.verifiedRefund("in_fixture","re_fixture",review),/allocation_review/);
});
