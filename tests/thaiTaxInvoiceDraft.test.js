"use strict";
const test = require("node:test"), assert = require("node:assert/strict");
const { buildThaiTaxInvoiceDraft, renderThaiTaxInvoiceDraft } = require("../src/thaiTaxInvoiceDraft");
// This FX is an explicit test fixture, never a live rate or source lookup.
const fixture = () => ({ payment: { id: "in_fixture", status: "paid", currency: "usd", amount_paid: 500, livemode: false, status_transitions: { paid_at: Date.parse("2026-10-29T03:00:00Z") / 1000 } }, customer: { name: "QA <test>", address: "Test only", country: "TH", serviceUseCountry: "TH", taxId: "0125554006077", branchCode: "00000" }, treatment: "th_domestic_standard_7_inclusive", fx: { method: "BOT_DAILY_AVERAGE_BUYING", sourceUrl: "https://www.bot.or.th/test-fixture-not-live", rateDate: "2026-10-28", taxPointDate: "2026-10-29", thbPerUsd: "35.000000", selectionReason: "TEST FIXTURE ONLY" }, now: Date.parse("2026-10-29T04:00:00Z") });
test("VAT is included, totals reconcile exactly and draft cannot imply issued tax invoice", () => {
  for (const cents of [500,1500,5900]) { const f = fixture(); f.payment.amount_paid = cents; const d = buildThaiTaxInvoiceDraft(f); assert.equal(d.grossSatang,cents*35); assert.equal(d.netSatang+d.vatSatang,d.grossSatang); assert.equal(d.issued,false); assert.equal(d.invoiceNumber,null); assert.equal(d.paymentMode,"test"); const html=renderThaiTaxInvoiceDraft(d); assert.ok(html.includes("QA &lt;test&gt;")); assert.ok(!html.includes("QA <test>")); }
});
test("unpaid, nonUSD, foreign/mixed use and undocumented FX never create a draft", () => {
  const changes=[ f=>f.payment.status="open", f=>f.payment.currency="thb", f=>f.customer.country="US", f=>f.customer.serviceUseCountry="US", f=>delete f.fx, f=>f.fx.taxPointDate="2026-10-30", f=>f.fx.rateDate="2026-10-30", f=>f.fx.thbPerUsd="NaN", f=>f.treatment="export_zero", f=>f.customer.branchCode="", f=>f.payment.status_transitions.paid_at=Date.parse("2027-10-01")/1000 ];
  for(const change of changes){const f=fixture();change(f);assert.throws(()=>buildThaiTaxInvoiceDraft(f));}
});

test("rendered test document includes buyer identity, service and source evidence; live output remains gated",()=>{
 const {renderTaxDocument}=require('../src/thaiTaxInvoiceDraft');const draft=buildThaiTaxInvoiceDraft(fixture());
 const issued={...draft,status:'issued',issued:true,invoiceNumber:'TEST-SP-TI-202610-000001'};
 const html=renderTaxDocument(issued);for(const text of ['TEST DOCUMENT','0125554006077','00000','SavePulse monthly membership','TEST FIXTURE ONLY'])assert.ok(html.includes(text));
 assert.throws(()=>renderTaxDocument({...issued,paymentMode:'live'}),/live_delivery_not_approved/);
});
