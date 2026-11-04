"use strict";
const error = code => Object.assign(Error(code),{status:422});
const round=(n,d)=>(n+d/2n)/d;
// Called only by a trusted refund source after reviewing the section 82/10 reason.
// Does not initiate a Stripe refund, alter the original or use today's FX rate.
function buildThaiCreditNote({original,refund,review,cumulativeUsdCents,previousGrossSatang,previousVatSatang,now=Date.now()}) {
  if(original?.status!=="issued" || !original.issued || !original.invoiceNumber || !/^re_\w+$/.test(refund?.id||"") || refund.status!=="succeeded" || refund.currency!=="usd" || refund.invoiceId!==original.sourceInvoiceId || refund.mode!==original.paymentMode) throw error("credit_verified_refund_required");
  if(review?.reasonCode!=="service_cancelled" || !review.evidenceReference?.trim() || !review.reviewedBy?.trim()) throw error("credit_reason_review_required");
  if(!Number.isSafeInteger(refund.amount)||refund.amount<=0 || !Number.isSafeInteger(cumulativeUsdCents)||cumulativeUsdCents<refund.amount || cumulativeUsdCents>original.sourceGrossUsdCents || !Number.isSafeInteger(refund.created)||refund.created*1000>now) throw error("credit_amount_invalid");
  for(const value of [previousGrossSatang,previousVatSatang]) if(!Number.isSafeInteger(value)||value<0) throw error("credit_amount_invalid");
  const full=BigInt(original.sourceGrossUsdCents), amount=BigInt(cumulativeUsdCents);
  const gross=Number(round(BigInt(original.grossSatang)*amount,full))-previousGrossSatang;
  const vat=Number(round(BigInt(original.vatSatang)*amount,full))-previousVatSatang;
  if(gross<0 || vat<0 || vat>gross) throw error("credit_amount_invalid");
  const creditDate=new Date(refund.created*1000+7*3600000).toISOString().slice(0,10);
  if(creditDate<original.paymentDate) throw error("credit_date_invalid");
  return {type:"credit_note",status:"draft",issued:false,paymentMode:original.paymentMode,sourceInvoiceId:original.sourceInvoiceId,sourceRefundId:refund.id,originalInvoiceNumber:original.invoiceNumber,originalInvoiceDate:original.paymentDate,paymentDate:creditDate,seller:structuredClone(original.seller),customer:structuredClone(original.customer),currency:"THB",sourceGrossUsdCents:refund.amount,originalGrossSatang:original.grossSatang,correctedGrossSatang:original.grossSatang-previousGrossSatang-gross,grossSatang:gross,netSatang:gross-vat,vatSatang:vat,vatPercent:original.vatPercent,taxInclusive:true,fx:structuredClone(original.fx),reason:"ยกเลิกบริการและคืนค่าบริการ / Service cancellation and refund",review:structuredClone(review)};
}
module.exports={buildThaiCreditNote};
