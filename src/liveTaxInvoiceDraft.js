"use strict";

const { selectBotTaxRateDate } = require("./taxFxPolicy");
const { buildThaiTaxInvoiceDraft } = require("./thaiTaxInvoiceDraft");

const fail = (code, status = 422) => Object.assign(new Error(code), { status });

async function buildVerifiedLiveTaxInvoiceDraft({ invoiceId, paidInvoice, getBotRate, now = Date.now() }) {
  const { payment, customer } = await paidInvoice(invoiceId, true);
  if (payment?.id !== invoiceId || payment.livemode !== true || payment.status !== "paid") {
    throw fail("billing_paid_invoice_required");
  }
  if (!customer) throw fail("billing_tax_profile_missing");
  if (customer.country !== "TH" || customer.serviceUseCountry !== "TH") {
    throw fail("domestic_customer_details_required");
  }

  const selection = selectBotTaxRateDate(payment.status_transitions?.paid_at);
  const evidence = await getBotRate(selection.rateDate);
  if (evidence?.rateDate !== selection.rateDate || evidence.method !== "BOT_DAILY_AVERAGE_BUYING") {
    throw fail("tax_fx_exact_date_unavailable", 503);
  }
  return buildThaiTaxInvoiceDraft({
    payment,
    customer,
    fx: { ...evidence, ...selection },
    treatment: "th_domestic_standard_7_inclusive",
    now,
  });
}

module.exports = { buildVerifiedLiveTaxInvoiceDraft };
