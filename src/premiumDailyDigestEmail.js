"use strict";

const COLORS = Object.freeze({
  teal: "#078b8d",
  mint: "#7ef2d9",
  ink: "#10252b",
  muted: "#71838c",
  line: "#d7e4e6",
  amber: "#ffd052",
  green: "#73f1ca",
  rose: "#ff9cab"
});

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#039;");
}

function language(locale) {
  return locale === "en" ? "en" : "th";
}

function toneStyle(tone) {
  if (tone === "teal") return { badgeBg: "#bfffe4", badgeColor: "#08734f", accent: COLORS.green };
  if (tone === "rose") return { badgeBg: "#ffe0e7", badgeColor: "#a51f43", accent: COLORS.rose };
  return { badgeBg: "#ffe4a2", badgeColor: "#795308", accent: COLORS.amber };
}

function clampPercent(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 50;
  return Math.max(0, Math.min(100, Math.round(number)));
}

function chartForTone(tone) {
  if (tone === "teal") return "▁▄▂▆▄█";
  if (tone === "rose") return "▅▃▆▂▄▁";
  return "▁▃▅▂▄▆";
}

function styles() {
  return `<style>
    html,body{margin:0!important;padding:0!important;width:100%!important;background:#eef4f5;color:${COLORS.ink};font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Arial,"Noto Sans Thai",sans-serif;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%}
    table,td,a,div,p,span{-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%}table{border-collapse:separate;border-spacing:0}.frame{table-layout:fixed}
    @media only screen and (max-width:520px){.page-pad{padding:7px 3px!important}.frame{border-radius:13px!important}.header-pad{padding:16px 17px!important}.brand{font-size:25px!important}.panel-wrap{padding:8px!important}.hero-pad{padding:19px 16px 13px!important}.hero-title{font-size:24px!important}.hero-copy{font-size:11px!important}.hero-meta{white-space:normal!important;word-break:break-word}.card-pad{padding:14px!important}.card-title{font-size:15px!important}.body-copy{font-size:11px!important}.footer-pad{padding:15px 18px 19px!important}.cta{font-size:16px!important}.compact{font-size:10px!important}}
  </style>`;
}

function header(plan, badgeColor) {
  return `<tr><td class="header-pad" style="padding:20px 26px;border-bottom:1px solid #dbe7e9;"><table role="presentation" width="100%"><tr><td valign="middle"><table role="presentation"><tr><td style="width:46px;height:46px;border-radius:50%;background:linear-gradient(145deg,#12bcb0,#046f78);color:#fff;text-align:center;line-height:46px;font-size:23px;font-weight:900;box-shadow:0 7px 16px rgba(4,142,143,.22);">⌁</td><td class="brand" style="padding-left:13px;color:#064851;font-size:29px;line-height:1.1;font-weight:900;">SavePulse</td></tr></table></td><td align="right"><span style="display:inline-block;padding:8px 15px;border:1px solid ${badgeColor};border-radius:999px;color:${badgeColor};font-size:13px;font-weight:900;">${escapeHtml(plan.toUpperCase())}</span></td></tr></table></td></tr>`;
}

function hero(copy, rightVisual, metaRight) {
  return `<tr><td class="hero-pad" style="padding:25px 23px 15px;color:#fff;"><div class="hero-title" style="color:#fff;font-size:30px;line-height:1.12;font-weight:900;">${escapeHtml(copy.headline)}</div><table role="presentation" width="100%" style="width:100%;margin-top:10px;"><tr><td valign="middle" style="width:62%;padding-right:12px;"><p class="hero-copy" style="margin:0;color:#e2f4f2;font-size:13px;line-height:1.55;">${escapeHtml(copy.subhead)}</p></td><td align="right" valign="middle" style="width:38%;">${rightVisual}</td></tr></table><table role="presentation" width="100%" style="width:100%;margin-top:13px;border:1px solid rgba(112,231,220,.25);border-radius:999px;background:rgba(0,31,37,.18);"><tr><td class="hero-meta" style="width:50%;padding:8px 10px;color:#d7efed;font-size:10px;white-space:nowrap;">◷ ${escapeHtml(copy.date)}</td><td class="hero-meta" style="width:50%;padding:8px 10px;border-left:1px solid rgba(112,231,220,.22);color:#d7efed;font-size:10px;white-space:nowrap;">${escapeHtml(metaRight)}</td></tr></table></td></tr>`;
}

function assetCard(item, { compact = false } = {}) {
  const tone = toneStyle(item.tone);
  const percent = clampPercent(item.percent);
  return `<tr><td style="padding:0 17px ${compact ? "6px" : "10px"};"><table role="presentation" width="100%" style="width:100%;background:linear-gradient(145deg,#07545b,#087a75);border:1px solid ${tone.accent};border-radius:${compact ? "11px" : "15px"};"><tr><td class="card-pad" style="padding:${compact ? "10px 11px" : "16px 17px 14px"};"><table role="presentation" width="100%"><tr><td valign="middle" style="width:${compact ? "44%" : "62%"};"><div class="card-title" style="color:#fff;font-size:${compact ? "12px" : "17px"};line-height:1.3;font-weight:900;">${escapeHtml(item.icon)}&nbsp; ${escapeHtml(item.name)}</div><div style="margin-top:2px;color:#a7d9d7;font-size:${compact ? "8px" : "10px"};">${escapeHtml(item.reference)}</div>${compact ? `<div style="margin-top:6px;height:5px;background:#174f55;border-radius:999px;overflow:hidden;"><div style="width:${percent}%;height:5px;background:${tone.accent};border-radius:999px;"></div></div>` : ""}</td>${compact ? `<td align="center" style="width:23%;color:${tone.accent};font-size:14px;white-space:nowrap;">${chartForTone(item.tone)}</td>` : ""}<td align="right" valign="middle" style="width:${compact ? "33%" : "38%"};"><span style="display:inline-block;padding:${compact ? "7px 9px" : "8px 11px"};background:${tone.badgeBg};color:${tone.badgeColor};border-radius:999px;font-size:${compact ? "9px" : "10px"};font-weight:900;white-space:nowrap;">${escapeHtml(item.title)}</span></td></tr></table>${compact ? "" : `<p class="body-copy" style="margin:10px 0 0;color:#e6f6f4;font-size:11px;line-height:1.5;">${escapeHtml(item.short)}</p><table role="presentation" width="100%" style="width:100%;margin-top:10px;background:rgba(1,48,55,.46);border-radius:10px;"><tr><td style="padding:10px 11px;width:76%;"><div style="color:#83e6d6;font-size:9px;font-weight:800;">${escapeHtml(item.observationIntro)}</div><div style="margin-top:6px;height:6px;background:#195d61;border-radius:999px;overflow:hidden;"><div style="width:${percent}%;height:6px;background:${tone.accent};border-radius:999px;"></div></div><div style="margin-top:6px;color:#fff;font-size:10px;font-weight:900;line-height:1.35;">${escapeHtml(item.observationLabel)}</div><div style="margin-top:3px;color:#9fcac7;font-size:8px;line-height:1.35;">${escapeHtml(item.observationExplanation)}</div></td><td align="right" valign="middle" style="padding:10px 11px 10px 4px;width:24%;"><div style="color:${tone.accent};font-size:14px;white-space:nowrap;">${chartForTone(item.tone)}</div></td></tr></table>`}</td></tr></table></td></tr>`;
}

function infoCard({ icon, title, body, warm = false }) {
  return `<tr><td style="padding:0 17px 11px;"><table role="presentation" width="100%" style="width:100%;background:${warm ? "#fff9e9" : "#06484f"};border:1px solid ${warm ? "#f0d181" : "#19aaa7"};border-radius:14px;"><tr><td style="width:45px;padding:13px 0 13px 14px;"><div style="width:36px;height:36px;border-radius:50%;background:${warm ? "#ffe29a" : "#075a60"};color:${warm ? "#a97000" : COLORS.mint};text-align:center;line-height:36px;font-size:18px;font-weight:900;">${escapeHtml(icon)}</div></td><td style="padding:12px 13px;"><div style="font-size:14px;font-weight:900;color:${warm ? "#352c1e" : "#fff"};">${title}</div><div style="margin-top:3px;color:${warm ? "#6c5f49" : "#b9ddda"};font-size:10px;line-height:1.45;">${body}</div></td></tr></table></td></tr>`;
}

function cta(label, href) {
  return `<tr><td align="center" style="padding:0 17px 18px;"><a class="cta" href="${escapeHtml(href)}" style="display:block;padding:14px 17px;background:linear-gradient(90deg,#20d5b0,#079b9b);border:1px solid #a5ffe2;border-radius:13px;color:#fff;text-decoration:none;text-align:center;font-size:18px;line-height:1.3;font-weight:900;box-shadow:0 0 22px rgba(51,237,196,.5);">⚡ ${escapeHtml(label)} →</a></td></tr>`;
}

function footer({ planName, unsubscribeUrl, disclaimerText }) {
  return `<tr><td class="footer-pad" align="center" style="padding:17px 27px 23px;"><p style="margin:0;color:${COLORS.muted};font-size:9px;line-height:1.65;">${escapeHtml(disclaimerText)}</p><p style="margin:9px 0 0;font-size:10px;"><a href="${escapeHtml(unsubscribeUrl)}" style="color:#087f83;font-weight:800;">ยกเลิกรับอีเมลนี้ / Unsubscribe</a></p><div style="margin-top:10px;padding-top:10px;border-top:1px solid #dbe8ea;color:#8a9aa1;font-size:9px;">${escapeHtml(planName)} • © 2026 SavePulse Analytics Network</div></td></tr>`;
}

function businessContent(locale) {
  const thai = language(locale) === "th";
  const metrics = thai
    ? [["ยอดต่างประเทศที่ต้องชำระ", "USD 148,250", "ตัวอย่างยอดรวมที่ติดตาม"], ["ใบที่ครบกำหนดเร็วที่สุด", "10 มิ.ย. 2569", "เหลืออีก 8 วัน"], ["ผลต่อต้นทุนเงินบาท 7 วัน", "เพิ่ม 0.52%", "ใช้เตรียมเงินสดโดยประมาณ"]]
    : [["Foreign amount payable", "USD 148,250", "Example tracked total"], ["Soonest invoice due", "Jun 10, 2026", "8 days remaining"], ["7-day THB cost impact", "Up 0.52%", "For approximate cash planning"]];
  const metricHtml = metrics.map(([label, value, note], index) => `<td valign="top" style="width:33.33%;padding:0 4px;"><table role="presentation" width="100%" style="width:100%;background:rgba(5,73,80,.78);border:1px solid #21a9a7;border-radius:12px;"><tr><td style="padding:11px 9px;"><div style="color:#8debe0;font-size:15px;">${["▤", "▣", "◇"][index]}</div><div style="margin-top:4px;color:#d9efed;font-size:9px;line-height:1.3;">${escapeHtml(label)}</div><div style="margin-top:6px;color:${index === 1 ? COLORS.amber : COLORS.mint};font-size:13px;line-height:1.3;font-weight:900;">${escapeHtml(value)}</div><div style="margin-top:3px;color:#9cc8c6;font-size:8px;line-height:1.3;">${escapeHtml(note)}</div></td></tr></table></td>`).join("");
  const invoices = thai
    ? [["ตัวอย่าง: ผู้ขายชิ้นส่วน A", "ยอด USD 68,250.00 • ครบกำหนด 31 พ.ค. 2569", "ใช้เงินบาทลดลงประมาณ 1,120.45 บาท", "#0a8d4c", "เทียบกับเรทอ้างอิงก่อนหน้า"], ["ตัวอย่าง: ผู้ขายบรรจุภัณฑ์ B", "ยอด EUR 42,130.00 • ครบกำหนด 6 มิ.ย. 2569", "ใช้เงินบาทเพิ่มขึ้นประมาณ 1,874.32 บาท", "#df3c3c", "รายการใกล้ครบกำหนด ควรตรวจสอบก่อน"], ["ตัวอย่าง: ผู้ขายวัตถุดิบ C", "ยอด USD 37,870.00 • ครบกำหนด 15 มิ.ย. 2569", "ใช้เงินบาทลดลงประมาณ 612.18 บาท", "#0a8d4c", "ผลกระทบโดยประมาณยังอยู่ระดับต่ำ"]]
    : [["Example: Parts supplier A", "USD 68,250.00 • Due May 31, 2026", "Uses about 1,120.45 THB less", "#0a8d4c", "Compared with the prior reference rate"], ["Example: Packaging supplier B", "EUR 42,130.00 • Due Jun 6, 2026", "Uses about 1,874.32 THB more", "#df3c3c", "Due soon; review before payment"], ["Example: Materials supplier C", "USD 37,870.00 • Due Jun 15, 2026", "Uses about 612.18 THB less", "#0a8d4c", "Estimated impact remains low"]];
  const invoiceHtml = invoices.map(([name, detail, impact, color, note]) => `<tr><td style="padding:10px 11px;border-bottom:1px solid #dfe9ea;width:56%;"><div style="color:#122c33;font-size:11px;font-weight:900;">▥ ${escapeHtml(name)}</div><div style="margin-top:3px;color:#637880;font-size:9px;">${escapeHtml(detail)}</div></td><td align="right" style="padding:10px 11px;border-bottom:1px solid #dfe9ea;width:44%;"><div style="color:${color};font-size:10px;font-weight:900;">${escapeHtml(impact)}</div><div style="margin-top:3px;color:#788b91;font-size:8px;">${escapeHtml(note)}</div></td></tr>`).join("");
  return `<tr><td style="padding:0 17px 11px;"><table role="presentation" width="100%" style="width:100%;background:#fff9e9;border:1px solid #f0d181;border-radius:13px;"><tr><td style="padding:12px 13px;"><div style="color:#352c1e;font-size:13px;font-weight:900;">${thai ? "Business ช่วยทีมการเงินอย่างไร" : "How Business helps finance teams"}</div><div style="margin-top:4px;color:#6c5f49;font-size:9px;line-height:1.5;">${thai ? "แปลงยอดใบแจ้งหนี้ต่างประเทศเป็นต้นทุนเงินบาท เปรียบเทียบกับเรทอ้างอิงก่อนหน้า และเรียงรายการใกล้ครบกำหนด เพื่อให้รู้ว่าควรตรวจสอบใบไหนก่อน" : "Converts foreign invoices into estimated Thai-baht cost, compares with the prior reference rate, and highlights upcoming due dates so the team knows what to review first."}</div></td></tr></table></td></tr><tr><td style="padding:0 13px 11px;"><table role="presentation" width="100%"><tr>${metricHtml}</tr></table></td></tr><tr><td style="padding:0 17px 11px;"><table role="presentation" width="100%" style="width:100%;background:#e9fbf7;border-radius:14px;"><tr><td style="width:54px;padding:14px 0 14px 15px;"><div style="width:44px;height:44px;border-radius:50%;background:#0a8e88;color:#fff;text-align:center;line-height:44px;font-size:21px;">◇</div></td><td style="padding:13px 10px;"><div style="color:#0b6e68;font-size:14px;font-weight:900;">${thai ? "ภาพรวมวันนี้: ยังไม่พบแรงกดดันสูง" : "Today's overview: No high cost pressure"}</div><div style="margin-top:3px;color:#406b6b;font-size:9px;line-height:1.45;">${thai ? "ค่าเงินยังเคลื่อนไหวในกรอบแคบ แต่ควรตรวจใบที่ใกล้ครบกำหนดและใบที่ใช้เงินบาทเพิ่มขึ้น" : "Currency movement remains narrow, but invoices due soon or requiring more Thai baht should be reviewed."}</div></td><td align="right" style="padding:13px 15px;color:#0bbcb2;font-size:16px;">▁▃▂▄▆</td></tr></table></td></tr><tr><td style="padding:0 17px 5px;color:#dff5f2;font-size:13px;font-weight:900;">▤ ${thai ? "ตัวอย่างใบแจ้งหนี้สมมติ" : "Illustrative invoice examples"}</td></tr><tr><td style="padding:0 17px 8px;color:#a9cfcc;font-size:8px;line-height:1.45;">${thai ? "ตัวอย่างนี้อธิบายรูปแบบการอ่าน ไม่ใช่ข้อมูลบริษัทจริง แต่ละแถวบอกยอด สกุลเงิน วันครบกำหนด และต้นทุนเงินบาทที่เปลี่ยนไป" : "These examples explain how to read the brief; they are not real company data. Each row shows amount, currency, due date, and estimated Thai-baht cost change."}</td></tr><tr><td style="padding:0 17px 11px;"><table role="presentation" width="100%" style="width:100%;background:#fff;border-radius:13px;overflow:hidden;">${invoiceHtml}</table></td></tr>`;
}

function renderPremiumDailyDigestEmail({ plan, locale, copy, assets, dashboardUrl, unsubscribeUrl, planName, disclaimerText }) {
  const languageKey = language(locale);
  const badgeColor = plan === "plus" ? "#d99a12" : COLORS.teal;
  const panel = plan === "pro" ? "linear-gradient(145deg,#012d35 0%,#003f47 58%,#045e5b 100%)" : "linear-gradient(145deg,#023840 0%,#00545c 55%,#076d68 100%)";
  const visual = plan === "pro" ? '<div style="width:72px;height:72px;border:1px solid #25c9c1;border-radius:50%;color:#66f1dd;text-align:center;line-height:72px;font-size:31px;box-shadow:0 0 18px rgba(42,226,207,.3);">◎</div>' : '<div style="color:#70f4df;font-size:29px;text-shadow:0 0 14px rgba(86,246,221,.85);white-space:nowrap;">▁▃▂▄▆▅█</div>';
  const metaRight = plan === "business"
    ? (languageKey === "th" ? "ⓘ ใช้ช่วยวางแผนต้นทุน" : "ⓘ Cost planning support")
    : (languageKey === "th" ? "▣ อิงย้อนหลัง 5 วันทำการ" : "▣ Five-business-day context");
  let content = "";
  if (plan === "free") {
    content = assetCard(assets[0]) + infoCard({ icon: "↺", title: languageKey === "th" ? "ตัวอย่างจากข้อมูลย้อนหลัง" : "Historical context", body: languageKey === "th" ? "ระบบสรุปสิ่งที่เคยเกิดขึ้นในช่วงใกล้เคียง พร้อมจำนวนกรณีอ้างอิงที่ตรวจสอบได้" : "A summary of similar historical periods with a reviewable reference count.", warm: true }) + infoCard({ icon: "⌕", title: languageKey === "th" ? "ข้อมูลเต็มยังล็อกไว้ — การ์ด Gold และ BTC เป็นเฉพาะ Pro" : "Full detail stays locked — Gold and BTC cards are Pro-only", body: languageKey === "th" ? "ดูภาพรวมหลายสินทรัพย์และติดตามรายการได้มากขึ้น" : "See a wider multi-asset view and follow more items." });
  } else if (plan === "plus") {
    content = assets.map((asset) => assetCard(asset)).join("") + infoCard({ icon: "◎", title: languageKey === "th" ? "อัปเกรดเป็น Pro" : "Upgrade to Pro", body: languageKey === "th" ? "เพิ่มเรดาร์ทองคำ บิตคอยน์ และภาพรวมหลายสินทรัพย์ในอีเมลเดียว" : "Add gold, bitcoin, and a broader multi-asset radar.", warm: true });
  } else if (plan === "pro") {
    const headings = languageKey === "th" ? ["ค่าเงิน", "ทองคำ", "บิตคอยน์"] : ["Currencies", "Gold", "Bitcoin"];
    content = assets.map((group, index) => `<tr><td style="padding:4px 17px 7px;color:${index ? COLORS.amber : "#dff5f2"};font-size:14px;font-weight:900;">${index === 0 ? "◉" : index === 1 ? "▰" : "₿"} ${headings[index]}</td></tr>${group.map((asset) => assetCard(asset, { compact: true })).join("")}`).join("") + infoCard({ icon: "↺", title: languageKey === "th" ? "ย้อนหลังสั้น ๆ (Replay)" : "Quick replay", body: languageKey === "th" ? "ทบทวนการเคลื่อนไหวสำคัญของ USD/THB, XAU/USD และ BTC/USD" : "Review important USD/THB, XAU/USD, and BTC/USD movement.", warm: true });
  } else {
    content = businessContent(locale);
  }
  const html = `<!doctype html><html lang="${languageKey}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="x-apple-disable-message-reformatting"><title>${escapeHtml(copy.subject)}</title>${styles()}</head><body><div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${escapeHtml(copy.subhead)}</div><table role="presentation" width="100%" style="width:100%;background:#eef4f5;"><tr><td class="page-pad" align="center" style="padding:22px 10px;"><table class="frame" role="presentation" width="100%" style="width:100%;max-width:600px;background:#fff;border:1px solid ${COLORS.line};border-radius:20px;overflow:hidden;box-shadow:0 18px 50px rgba(3,52,59,.14);">${header(planName, badgeColor)}<tr><td class="panel-wrap" style="padding:12px;"><table role="presentation" width="100%" style="width:100%;background:${panel};border-radius:18px;overflow:hidden;box-shadow:inset 0 0 0 1px rgba(88,235,216,.16);">${hero(copy, visual, metaRight)}${content}${cta(copy.cta, dashboardUrl)}</table></td></tr>${footer({ planName, unsubscribeUrl, disclaimerText })}</table></td></tr></table></body></html>`;
  return html;
}

module.exports = { renderPremiumDailyDigestEmail };
