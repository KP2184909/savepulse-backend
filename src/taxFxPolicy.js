"use strict";
const error=code=>Object.assign(Error(code),{status:422});
// Reviewed national bank calendar, BOT notification 31/2568. Bangkok-only 16 Oct
// closure and early-morning/month-end announcement exceptions require review.
const holidays=new Set(["01-01","01-02","03-03","04-06","04-13","04-14","04-15","05-01","05-04","06-01","06-03","07-28","07-29","08-12","10-13","10-23","12-07","12-10","12-31"].map(x=>`2026-${x}`));
const day=date=>new Date(`${date}T00:00:00Z`);
const previous=date=>new Date(day(date).getTime()-86400000).toISOString().slice(0,10);
const business=date=>![0,6].includes(day(date).getUTCDay())&&!holidays.has(date);
function selectBotTaxRateDate(paidAt) {
  if(!Number.isSafeInteger(paidAt)||paidAt<=0)throw error("tax_fx_date_invalid");
  const local=new Date(paidAt*1000+7*3600000),date=local.toISOString().slice(0,10);
  if(local.getUTCFullYear()!==2026)throw error("tax_fx_calendar_review_required");
  if(date>="2026-10-16"&&date<="2026-10-20")throw error("tax_fx_special_closure_review_required");
  // Never infer publication timing from data absence. Exceptional cases are
  // visible review jobs; the normal daytime path uses the prior business close.
  if(local.getUTCHours()*60+local.getUTCMinutes()<510)throw error("tax_fx_announcement_time_review_required");
  let announcement=date;while(!business(announcement))announcement=previous(announcement);
  let next=new Date(day(announcement).getTime()+86400000).toISOString().slice(0,10);
  while(!business(next))next=new Date(day(next).getTime()+86400000).toISOString().slice(0,10);
  if(next.slice(0,7)!==announcement.slice(0,7))throw error("tax_fx_month_end_review_required");
  let rateDate=previous(announcement);while(!business(rateDate))rateDate=previous(rateDate);
  if(!rateDate.startsWith("2026-"))throw error("tax_fx_calendar_review_required");
  return {rateDate,taxPointDate:date,policyVersion:"rd-p132-2548-bot-tt-daytime-v1",announcementDate:announcement,legalSource:"https://www.rd.go.th/28635.html",calendarSource:"https://www.bot.or.th/content/dam/bot/fipcs/documents/FPG/2568/ThaiPDF/25680162.pdf",selectionReason:"BOT buying-transfer reference for ordinary daytime receipt; prior business closing rate under RD P.132/2548 section 5 examples. Exceptional publication cases require review."};
}
module.exports={selectBotTaxRateDate};
