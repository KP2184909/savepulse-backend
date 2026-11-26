"use strict";

const { createTaxDocumentJobs } = require("../src/taxDocumentJobs");
const { createTaxDocumentLedger } = require("../src/taxDocumentLedger");
const { buildThaiTaxInvoiceDraft, renderTaxDocument } = require("../src/thaiTaxInvoiceDraft");

async function main() {
  const invoiceId = "in_etax_qa_fixture";
  const now = () => Date.parse("2026-11-24T04:00:00Z");
  const fx = {
    method: "BOT_DAILY_AVERAGE_BUYING",
    sourceUrl: "https://example.invalid/qa-fx",
    rateDate: "2026-11-23",
    taxPointDate: "2026-11-24",
    thbPerUsd: "35.000000",
    selectionReason: "อัตราแลกเปลี่ยนสมมติสำหรับทดสอบเท่านั้น",
  };
  const draft = buildThaiTaxInvoiceDraft({
    payment: {
      id: invoiceId,
      status: "paid",
      currency: "usd",
      amount_paid: 3900,
      livemode: false,
      status_transitions: { paid_at: Date.parse("2026-11-24T03:00:00Z") / 1000 },
    },
    customer: {
      name: "บริษัท ผู้ซื้อสมมติ จำกัด",
      address: "99 ถนนทดสอบ เขตทดสอบ กรุงเทพมหานคร",
      country: "TH",
      serviceUseCountry: "TH",
    },
    fx,
    treatment: "th_domestic_standard_7_inclusive",
    now: now(),
  });
  draft.seller = {
    legalNameTh: "บริษัท ผู้ขายสมมติ จำกัด",
    addressTh: "1 ถนนตัวอย่าง อำเภอตัวอย่าง นนทบุรี",
    taxId: "0000000000000",
    branchCode: "00000",
  };

  const rows = new Map();
  const store = {
    async get(key) {
      return structuredClone(rows.get(key));
    },
    async insert(key, value) {
      if (rows.has(key)) return false;
      rows.set(key, structuredClone(value));
      return true;
    },
    async cas(key, version, value) {
      if (rows.get(key)?.version !== version) return false;
      rows.set(key, structuredClone(value));
      return true;
    },
  };
  const ledger = createTaxDocumentLedger({
    store,
    mode: "test",
    now,
    source: async () => ({
      draft,
      evidenceVerified: true,
      mode: "test",
      recipient: "qa@example.invalid",
      fxEvidence: { fixture: true },
    }),
  });
  const jobs = createTaxDocumentJobs({ store, mode: "test", now, issue: ledger.issue });
  const job = await jobs.run(invoiceId);
  if (job.state !== "issued") throw Error(`Tax QA job did not issue a TEST document: ${job.state}`);
  const document = await ledger.issue(invoiceId);
  if (document.invoiceNumber !== job.document.invoiceNumber) throw Error("Tax QA invoice number changed on replay");
  process.stdout.write(renderTaxDocument(document));
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
