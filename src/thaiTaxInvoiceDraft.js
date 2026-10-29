"use strict";
const seller = require("../config/billing-seller.json");
const error = code => Object.assign(new Error(code), { status: 422 });
const escape = value => String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const money = satang => (satang / 100).toFixed(2);
const round = (n, d) => (n + d / 2n) / d;
// Draft only: never allocates an invoice number, persists, emails or claims legal issuance.
function buildThaiTaxInvoiceDraft({ payment, customer, fx, treatment, now = Date.now() }) {
  if (!payment || !/^in_\w+$/.test(payment.id || "") || payment.status !== "paid" || payment.currency !== "usd" || !Number.isSafeInteger(payment.amount_paid) || payment.amount_paid <= 0) throw error("paid_usd_invoice_required");
  const paidAt = payment.status_transitions?.paid_at;
  if (!Number.isSafeInteger(paidAt) || paidAt <= 0 || paidAt * 1000 > now) throw error("valid_payment_time_required");
  if (!customer?.name?.trim() || !customer?.address?.trim() || customer.country !== "TH" || customer.serviceUseCountry !== "TH") throw error("domestic_customer_details_required");
  if (customer.taxId && !/^\d{13}$/.test(customer.taxId)) throw error("valid_customer_tax_id_required");
  if (customer.taxId && !/^\d{5}$/.test(customer.branchCode || "")) throw error("customer_branch_required");
  // Overseas/mixed use never silently inherits a domestic or zero rate.
  if (treatment !== "th_domestic_standard_7_inclusive") throw error("tax_treatment_review_required");
  if (paidAt * 1000 < Date.parse("2026-10-01T00:00:00+07:00") || paidAt * 1000 >= Date.parse("2027-10-01T00:00:00+07:00")) throw error("tax_rate_period_review_required");
  if (!fx || !/^(BOT_DAILY_AVERAGE_BUYING|TH_COMMERCIAL_BANK_BUYING)$/.test(fx.method || "") || !/^https:\/\//.test(fx.sourceUrl || "") || !/^\d{4}-\d{2}-\d{2}$/.test(fx.rateDate || "") || !/^\d{4}-\d{2}-\d{2}$/.test(fx.taxPointDate || "") || !fx.selectionReason?.trim()) throw error("documented_fx_required");
  if (!/^[1-9]\d{0,3}(\.\d{1,6})?$/.test(String(fx.thbPerUsd || ""))) throw error("valid_fx_rate_required");
  if (!Number.isFinite(Date.parse(fx.rateDate)) || !Number.isFinite(Date.parse(fx.taxPointDate)) || fx.rateDate > fx.taxPointDate) throw error("fx_date_review_required");
  const paidDate = new Date(paidAt * 1000 + 7 * 3600000).toISOString().slice(0, 10);
  if (fx.taxPointDate !== paidDate) throw error("tax_point_review_required");
  const [whole, fraction = ""] = String(fx.thbPerUsd).split(".");
  const micros = BigInt(whole) * 1000000n + BigInt(fraction.padEnd(6, "0"));
  const total = round(BigInt(payment.amount_paid) * micros, 1000000n);
  const vat = round(total * 7n, 107n);
  if (total > BigInt(Number.MAX_SAFE_INTEGER)) throw error("invoice_amount_too_large");
  return { status: "draft", issued: false, invoiceNumber: null, sourceInvoiceId: payment.id, paymentMode: payment.livemode === true ? "live" : "test", seller: structuredClone(seller), customer: structuredClone(customer), paymentDate: paidDate, sourceGrossUsdCents: payment.amount_paid, currency: "THB", grossSatang: Number(total), netSatang: Number(total - vat), vatSatang: Number(vat), vatPercent: 7, taxInclusive: true, fx: structuredClone(fx), warning: "DRAFT — NOT A TAX INVOICE. FX evidence and tax point require verification before issuance." };
}
function renderTaxDocument(draft) {
  if (!draft || !["draft", "issued"].includes(draft.status) || (draft.status === "issued" && (!draft.issued || !draft.invoiceNumber))) throw error("tax_document_required");
  const title = draft.status === "draft" ? "ฉบับร่าง — ไม่ใช่ใบกำกับภาษี" : draft.paymentMode === "test" ? "TEST ONLY — ใบกำกับภาษีทดสอบ" : "ใบกำกับภาษี / Tax Invoice";
  const warning = draft.status === "draft" ? draft.warning : draft.paymentMode === "test" ? "TEST DOCUMENT — NOT VALID FOR TAX FILING. NO REAL PAYMENT." : "";
  return `<!doctype html><html lang="th"><meta charset="utf-8"><title>SavePulse tax document draft</title><style>body{font:16px system-ui;max-width:800px;margin:40px auto;padding:24px;color:#16313a}h1{color:#926000}.box{padding:20px;background:#eff8f8;border-radius:12px}table{width:100%;margin-top:24px;border-collapse:collapse}td{padding:12px;border-bottom:1px solid #ddd}td:last-child{text-align:right}</style><h1>${escape(title)}</h1><p>${escape(warning)}</p><p>เลขที่ ${escape(draft.invoiceNumber || "ยังไม่ออกเลขเอกสาร")} · วันที่ ${escape(draft.paymentDate)}</p><div class="box"><b>${escape(draft.seller.legalNameTh)}</b><p>${escape(draft.seller.addressTh)}</p><p>เลขผู้เสียภาษี ${escape(draft.seller.taxId)} · สำนักงานใหญ่ ${escape(draft.seller.branchCode)}</p></div><h2>ผู้ซื้อ / Customer</h2><p>${escape(draft.customer.name)}<br>${escape(draft.customer.address)}</p><p>เอกสารชำระเงินอ้างอิง ${escape(draft.sourceInvoiceId)} · ${escape(draft.paymentMode)}</p><table><tr><td>มูลค่าบริการก่อน VAT</td><td>${money(draft.netSatang)} THB</td></tr><tr><td>VAT 7% รวมอยู่ในราคาแล้ว</td><td>${money(draft.vatSatang)} THB</td></tr><tr><td><b>รวม</b></td><td><b>${money(draft.grossSatang)} THB</b></td></tr></table><p>USD/THB ${escape(draft.fx.thbPerUsd)} · วันที่อัตรา ${escape(draft.fx.rateDate)} · ${escape(draft.fx.method)}</p><p>ที่มา: ${escape(draft.fx.sourceUrl)}</p><p>${draft.status === "draft" ? "ยังไม่มีเลขใบกำกับภาษี และยังไม่ได้ส่งเอกสารให้ลูกค้า" : ""}</p></html>`;
}
function renderThaiTaxInvoiceDraft(draft) {
  if (draft?.status !== "draft" || draft.issued !== false) throw error("draft_required");
  return renderTaxDocument(draft);
}
module.exports = { buildThaiTaxInvoiceDraft, renderThaiTaxInvoiceDraft, renderTaxDocument };
