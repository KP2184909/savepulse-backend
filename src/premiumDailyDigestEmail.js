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
  if (tone === "teal") return { badgeBg: "#bfffe4", badgeColor: "#08734f", accent: COLORS.green, shadow: "rgba(115,241,202,.38)" };
  if (tone === "rose") return { badgeBg: "#ffe0e7", badgeColor: "#a51f43", accent: COLORS.rose, shadow: "rgba(255,156,171,.28)" };
  return { badgeBg: "#ffe4a2", badgeColor: "#795308", accent: COLORS.amber, shadow: "rgba(255,208,82,.28)" };
}

function clampPercent(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 50;
  return Math.max(0, Math.min(100, Math.round(number)));
}

function chartForTone(tone) {
  if (tone === "teal") return [8, 14, 11, 20, 17, 27];
  if (tone === "rose") return [27, 18, 23, 12, 16, 9];
  return [9, 13, 19, 12, 17, 23];
}

function chartBars(tone, height = 28) {
  const toneColors = toneStyle(tone);
  const bars = chartForTone(tone).map((barHeight) => (
    `<td valign="bottom" style="padding:0 1px;width:10px;"><div style="height:${Math.min(height, barHeight)}px;background:${toneColors.accent};border-radius:3px 3px 0 0;box-shadow:0 0 10px ${toneColors.shadow};"></div></td>`
  )).join("");

  return `<table role="presentation" cellpadding="0" cellspacing="0" style="display:inline-table;height:${height}px;"><tr>${bars}</tr><tr><td colspan="6" style="height:2px;background:rgba(126,242,217,.35);line-height:2px;font-size:0;">&nbsp;</td></tr></table>`;
}

function styles() {
  return `<style>
    html,body{margin:0!important;padding:0!important;width:100%!important;background:#eef4f5;color:${COLORS.ink};font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Arial,"Noto Sans Thai",sans-serif;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%}
    table,td,a,div,p,span{-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%}table{border-collapse:separate;border-spacing:0}.frame{table-layout:fixed}.fluid{width:100%!important;max-width:100%!important}.no-break{word-break:keep-all;overflow-wrap:normal}
    @media only screen and (max-width:520px){.page-pad{padding:6px 2px!important}.frame{border-radius:14px!important}.header-pad{padding:16px 16px!important}.logo-dot{width:43px!important;height:43px!important;line-height:43px!important}.brand{font-size:26px!important}.plan-pill{font-size:12px!important;padding:8px 13px!important}.panel-wrap{padding:8px!important}.hero-pad{padding:18px 14px 12px!important}.hero-title{font-size:23px!important;line-height:1.16!important;letter-spacing:0!important}.hero-copy{font-size:11px!important}.hero-chart{padding-top:11px!important;text-align:left!important}.hero-meta{white-space:normal!important;word-break:keep-all!important}.card-outer{padding-left:12px!important;padding-right:12px!important}.card-pad{padding:13px!important}.card-title{font-size:16px!important;line-height:1.28!important}.badge{font-size:10px!important;padding:8px 10px!important}.body-copy{font-size:11px!important}.footer-pad{padding:15px 18px 19px!important}.cta{font-size:16px!important}.compact-card .card-title{font-size:14px!important}.compact-chart{display:none!important}.metric-card{display:block!important;width:100%!important;padding:0 0 7px!important}.metric-value{font-size:16px!important}}
  </style>`;
}

function header(plan, badgeColor) {
  return `<tr><td class="header-pad" style="padding:20px 25px;border-bottom:1px solid #dbe7e9;background:#fff;"><table role="presentation" width="100%"><tr><td valign="middle"><table role="presentation"><tr><td class="logo-dot" style="width:48px;height:48px;border-radius:50%;background:linear-gradient(145deg,#18c7b7,#056672);color:#fff;text-align:center;line-height:48px;font-size:23px;font-weight:900;box-shadow:0 10px 22px rgba(4,142,143,.25);">⌁</td><td class="brand" style="padding-left:13px;color:#064851;font-size:30px;line-height:1.05;font-weight:900;">SavePulse</td></tr></table></td><td align="right"><span class="plan-pill" style="display:inline-block;padding:9px 16px;border:1.5px solid ${badgeColor};border-radius:999px;color:${badgeColor};font-size:13px;font-weight:900;letter-spacing:.02em;">${escapeHtml(plan.toUpperCase())}</span></td></tr></table></td></tr>`;
}

function hero(copy, rightVisual, metaRight) {
  return `<tr><td class="hero-pad" style="padding:23px 21px 14px;color:#fff;"><div class="hero-title" style="color:#fff;font-size:28px;line-height:1.15;font-weight:900;letter-spacing:0;word-break:keep-all;overflow-wrap:normal;">${escapeHtml(copy.headline)}</div><table role="presentation" width="100%" style="width:100%;margin-top:12px;"><tr><td valign="middle" style="width:66%;padding-right:12px;"><p class="hero-copy" style="margin:0;color:#dcf3f0;font-size:13px;line-height:1.55;">${escapeHtml(copy.subhead)}</p></td><td class="hero-chart" align="right" valign="middle" style="width:34%;">${rightVisual}</td></tr></table><table role="presentation" width="100%" style="width:100%;margin-top:14px;border:1px solid rgba(126,242,217,.28);border-radius:18px;background:rgba(0,31,37,.22);"><tr><td class="hero-meta" style="width:50%;padding:9px 11px;color:#d7efed;font-size:10px;line-height:1.35;white-space:nowrap;">◷ ${escapeHtml(copy.date)}</td><td class="hero-meta" style="width:50%;padding:9px 11px;border-left:1px solid rgba(126,242,217,.22);color:#d7efed;font-size:10px;line-height:1.35;white-space:nowrap;">${escapeHtml(metaRight)}</td></tr></table></td></tr>`;
}

function assetCard(item, { compact = false } = {}) {
  const tone = toneStyle(item.tone);
  const percent = clampPercent(item.percent);
  return `<tr><td class="card-outer" style="padding:0 16px ${compact ? "7px" : "11px"};"><table class="${compact ? "compact-card" : ""}" role="presentation" width="100%" style="width:100%;background:linear-gradient(145deg,#06464f 0%,#08726d 100%);border:1px solid ${tone.accent};border-radius:${compact ? "13px" : "17px"};box-shadow:0 0 0 1px rgba(255,255,255,.04) inset,0 10px 22px rgba(0,42,46,.16);"><tr><td class="card-pad" style="padding:${compact ? "12px 13px" : "16px 17px 15px"};"><table role="presentation" width="100%"><tr><td valign="top" style="width:${compact ? "63%" : "64%"};padding-right:10px;"><div class="card-title" style="color:#fff;font-size:${compact ? "15px" : "18px"};line-height:1.28;font-weight:900;">${escapeHtml(item.icon)}&nbsp; ${escapeHtml(item.name)}</div><div style="margin-top:3px;color:#a7d9d7;font-size:${compact ? "9px" : "10px"};line-height:1.35;">${escapeHtml(item.reference)}</div></td><td align="right" valign="top" style="width:${compact ? "37%" : "36%"};"><span class="badge" style="display:inline-block;padding:${compact ? "8px 9px" : "8px 11px"};background:${tone.badgeBg};color:${tone.badgeColor};border-radius:999px;font-size:${compact ? "10px" : "11px"};line-height:1.15;font-weight:900;white-space:nowrap;box-shadow:0 0 14px ${tone.shadow};">${escapeHtml(item.title)}</span></td></tr></table>${compact ? `<table role="presentation" width="100%" style="width:100%;margin-top:11px;"><tr><td valign="bottom" style="width:62%;"><div style="height:6px;background:#174f55;border-radius:999px;overflow:hidden;"><div style="width:${percent}%;height:6px;background:${tone.accent};border-radius:999px;"></div></div><div style="margin-top:6px;color:#b9dbd8;font-size:9px;line-height:1.35;">${escapeHtml(item.observationLabel)}</div></td><td class="compact-chart" align="right" valign="bottom" style="width:38%;">${chartBars(item.tone, 25)}</td></tr></table>` : `<p class="body-copy" style="margin:11px 0 0;color:#e6f6f4;font-size:12px;line-height:1.55;">${escapeHtml(item.short)}</p><table role="presentation" width="100%" style="width:100%;margin-top:12px;background:rgba(1,43,50,.58);border-radius:12px;"><tr><td style="padding:11px 12px;width:74%;"><div style="color:#8cf0df;font-size:10px;line-height:1.35;font-weight:800;">${escapeHtml(item.observationIntro)}</div><div style="margin-top:7px;height:7px;background:#195d61;border-radius:999px;overflow:hidden;"><div style="width:${percent}%;height:7px;background:${tone.accent};border-radius:999px;"></div></div><div style="margin-top:7px;color:#fff;font-size:11px;font-weight:900;line-height:1.35;">${escapeHtml(item.observationLabel)}</div><div style="margin-top:3px;color:#a7d2cf;font-size:9px;line-height:1.35;">${escapeHtml(item.observationExplanation)}</div></td><td align="right" valign="middle" style="padding:10px 12px 10px 4px;width:26%;">${chartBars(item.tone, 32)}</td></tr></table>`}</td></tr></table></td></tr>`;
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

function languageDivider(locale) {
  const thai = language(locale) === "th";
  return `<tr><td style="padding:6px 16px 17px;"><table role="presentation" width="100%" style="width:100%;border-top:1px solid rgba(126,242,217,.25);"><tr><td align="center" style="padding-top:16px;"><span style="display:inline-block;padding:7px 12px;border:1px solid rgba(126,242,217,.38);border-radius:999px;background:rgba(0,31,37,.24);color:#aef7e9;font-size:10px;font-weight:900;letter-spacing:.04em;">${thai ? "ภาษาไทย" : "English"}</span></td></tr></table></td></tr>`;
}

function visualForPlan(plan) {
  if (plan === "pro") {
    return '<div style="width:72px;height:72px;border:1px solid #25c9c1;border-radius:50%;color:#66f1dd;text-align:center;line-height:72px;font-size:31px;box-shadow:0 0 18px rgba(42,226,207,.3);">◎</div>';
  }

  return chartBars("teal", 34);
}

function metaRightForPlan(plan, locale) {
  const languageKey = language(locale);
  if (plan === "business") {
    return languageKey === "th" ? "ⓘ ใช้ช่วยวางแผนต้นทุน" : "ⓘ Cost planning support";
  }

  return languageKey === "th" ? "▣ อิงย้อนหลัง 5 วันทำการ" : "▣ Five-business-day context";
}

function planContent(plan, locale, assets) {
  const languageKey = language(locale);

  if (plan === "free") {
    return assetCard(assets[0]) + infoCard({
      icon: "↺",
      title: languageKey === "th" ? "ตัวอย่างจากข้อมูลย้อนหลัง" : "Historical context",
      body: languageKey === "th" ? "ระบบสรุปสิ่งที่เคยเกิดขึ้นในช่วงใกล้เคียง พร้อมจำนวนกรณีอ้างอิงที่ตรวจสอบได้" : "A summary of similar historical periods with a reviewable reference count.",
      warm: true
    }) + infoCard({
      icon: "⌕",
      title: languageKey === "th" ? "ข้อมูลเต็มยังล็อกไว้ — การ์ด Gold และ BTC เป็นเฉพาะ Pro" : "Full detail stays locked — Gold and BTC cards are Pro-only",
      body: languageKey === "th" ? "ดูภาพรวมหลายสินทรัพย์และติดตามรายการได้มากขึ้น" : "See a wider multi-asset view and follow more items."
    });
  }

  if (plan === "plus") {
    return assets.map((asset) => assetCard(asset)).join("") + infoCard({
      icon: "◎",
      title: languageKey === "th" ? "อัปเกรดเป็น Pro" : "Upgrade to Pro",
      body: languageKey === "th" ? "เพิ่มเรดาร์ทองคำ บิตคอยน์ และภาพรวมหลายสินทรัพย์ในอีเมลเดียว" : "Add gold, bitcoin, and a broader multi-asset radar.",
      warm: true
    });
  }

  if (plan === "pro") {
    const headings = languageKey === "th" ? ["ค่าเงิน", "ทองคำ", "บิตคอยน์"] : ["Currencies", "Gold", "Bitcoin"];
    return assets.map((group, index) => `<tr><td style="padding:4px 17px 7px;color:${index ? COLORS.amber : "#dff5f2"};font-size:14px;font-weight:900;">${index === 0 ? "◉" : index === 1 ? "▰" : "₿"} ${headings[index]}</td></tr>${group.map((asset) => assetCard(asset, { compact: true })).join("")}`).join("") + infoCard({
      icon: "↺",
      title: languageKey === "th" ? "ย้อนหลังสั้น ๆ (Replay)" : "Quick replay",
      body: languageKey === "th" ? "ทบทวนการเคลื่อนไหวสำคัญของ USD/THB, XAU/USD และ BTC/USD" : "Review important USD/THB, XAU/USD, and BTC/USD movement.",
      warm: true
    });
  }

  return businessContent(locale, assets);
}

function languageSection({ plan, locale, copy, assets, dashboardUrl }) {
  return `${hero(copy, visualForPlan(plan), metaRightForPlan(plan, locale))}${planContent(plan, locale, assets)}${cta(copy.cta, dashboardUrl)}`;
}

function businessContent(locale, assets = []) {
  const thai = language(locale) === "th";
  const assetMap = Object.fromEntries(assets.map((asset) => [asset.symbol, asset]));
  const usdRate = Number(assetMap.USDTHB?.price) > 0 ? Number(assetMap.USDTHB.price) : 36.72;
  const eurRate = Number(assetMap.EURTHB?.price) > 0 ? Number(assetMap.EURTHB.price) : 39.2;
  const examples = [
    { nameTh: "ผู้ขายชิ้นส่วน A", nameEn: "Parts supplier A", currency: "USD", amount: 68250, dueTh: "ครบกำหนดใน 8 วัน", dueEn: "Due in 8 days", rate: usdRate },
    { nameTh: "ผู้ขายบรรจุภัณฑ์ B", nameEn: "Packaging supplier B", currency: "EUR", amount: 42130, dueTh: "ครบกำหนดใน 14 วัน", dueEn: "Due in 14 days", rate: eurRate },
    { nameTh: "ผู้ขายวัตถุดิบ C", nameEn: "Materials supplier C", currency: "USD", amount: 37870, dueTh: "ครบกำหนดใน 23 วัน", dueEn: "Due in 23 days", rate: usdRate }
  ].map((item) => ({ ...item, thbCost: item.amount * item.rate }));
  const totalThb = examples.reduce((sum, item) => sum + item.thbCost, 0);
  const number = (value, digits = 0) => Number(value).toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
  const metrics = thai
    ? [["ตัวอย่างที่ติดตาม", "3 ใบแจ้งหนี้", "USD และ EUR"], ["ใบที่ครบกำหนดเร็วที่สุด", "อีก 8 วัน", "ช่วยจัดลำดับตรวจสอบ"], ["เงินบาทที่ควรเตรียม", `ประมาณ ${number(totalThb)} บาท`, "คำนวณจากเรทล่าสุด"]]
    : [["Examples tracked", "3 invoices", "USD and EUR"], ["Soonest invoice due", "In 8 days", "Helps prioritize review"], ["Thai baht to prepare", `About ${number(totalThb)} THB`, "Calculated from latest rates"]];
  const metricHtml = metrics.map(([label, value, note], index) => `<td valign="top" style="width:33.33%;padding:0 4px;"><table role="presentation" width="100%" style="width:100%;background:rgba(5,73,80,.78);border:1px solid #21a9a7;border-radius:12px;"><tr><td style="padding:11px 9px;"><div style="color:#8debe0;font-size:15px;">${["▤", "▣", "◇"][index]}</div><div style="margin-top:4px;color:#d9efed;font-size:9px;line-height:1.3;">${escapeHtml(label)}</div><div style="margin-top:6px;color:${index === 1 ? COLORS.amber : COLORS.mint};font-size:13px;line-height:1.3;font-weight:900;">${escapeHtml(value)}</div><div style="margin-top:3px;color:#9cc8c6;font-size:8px;line-height:1.3;">${escapeHtml(note)}</div></td></tr></table></td>`).join("");
  const invoices = examples.map((item) => thai
    ? [`ตัวอย่าง: ${item.nameTh}`, `ยอด ${item.currency} ${number(item.amount, 2)} • ${item.dueTh}`, `เตรียมเงินบาทประมาณ ${number(item.thbCost)} บาท`, "#0a8d4c", `เรทล่าสุด ${number(item.rate, item.currency === "USD" ? 3 : 3)} บาท/${item.currency}`]
    : [`Example: ${item.nameEn}`, `${item.currency} ${number(item.amount, 2)} • ${item.dueEn}`, `Prepare about ${number(item.thbCost)} THB`, "#0a8d4c", `Latest rate ${number(item.rate, 3)} THB/${item.currency}`]);
  const invoiceHtml = invoices.map(([name, detail, impact, color, note]) => `<tr><td style="padding:10px 11px;border-bottom:1px solid #dfe9ea;width:56%;"><div style="color:#122c33;font-size:11px;font-weight:900;">▥ ${escapeHtml(name)}</div><div style="margin-top:3px;color:#637880;font-size:9px;">${escapeHtml(detail)}</div></td><td align="right" style="padding:10px 11px;border-bottom:1px solid #dfe9ea;width:44%;"><div style="color:${color};font-size:10px;font-weight:900;">${escapeHtml(impact)}</div><div style="margin-top:3px;color:#788b91;font-size:8px;">${escapeHtml(note)}</div></td></tr>`).join("");
  return `<tr><td style="padding:0 17px 11px;"><table role="presentation" width="100%" style="width:100%;background:#fff9e9;border:1px solid #f0d181;border-radius:13px;"><tr><td style="padding:12px 13px;"><div style="color:#352c1e;font-size:13px;font-weight:900;">${thai ? "Business ช่วยทีมการเงินอย่างไร" : "How Business helps finance teams"}</div><div style="margin-top:4px;color:#6c5f49;font-size:9px;line-height:1.5;">${thai ? "แปลงยอดใบแจ้งหนี้ต่างประเทศเป็นต้นทุนเงินบาทด้วยเรทล่าสุด และเรียงรายการใกล้ครบกำหนด เพื่อช่วยเตรียมเงินสดและรู้ว่าควรตรวจสอบใบไหนก่อน" : "Converts foreign invoices into estimated Thai-baht cost using the latest rates and highlights upcoming due dates so teams can plan cash and prioritize reviews."}</div></td></tr></table></td></tr><tr><td style="padding:0 13px 11px;"><table role="presentation" width="100%"><tr>${metricHtml}</tr></table></td></tr><tr><td style="padding:0 17px 11px;"><table role="presentation" width="100%" style="width:100%;background:#e9fbf7;border-radius:14px;"><tr><td style="width:54px;padding:14px 0 14px 15px;"><div style="width:44px;height:44px;border-radius:50%;background:#0a8e88;color:#fff;text-align:center;line-height:44px;font-size:21px;">◇</div></td><td style="padding:13px 10px;"><div style="color:#0b6e68;font-size:14px;font-weight:900;">${thai ? `เรทที่ใช้วันนี้: USD ${number(usdRate, 3)} • EUR ${number(eurRate, 3)}` : `Rates used today: USD ${number(usdRate, 3)} • EUR ${number(eurRate, 3)}`}</div><div style="margin-top:3px;color:#406b6b;font-size:9px;line-height:1.45;">${thai ? "ฉบับทดลองคำนวณต้นทุนตามเรทล่าสุดเท่านั้น เมื่อมีเรทฐานของบริษัทจึงจะเปรียบเทียบต้นทุนเพิ่มหรือลดได้" : "This pilot estimates cost from current rates only. A company baseline rate is required before showing cost increases or decreases."}</div></td><td align="right" style="padding:13px 15px;color:#0bbcb2;font-size:16px;">▁▃▂▄▆</td></tr></table></td></tr><tr><td style="padding:0 17px 5px;color:#dff5f2;font-size:13px;font-weight:900;">▤ ${thai ? "ตัวอย่างใบแจ้งหนี้สมมติ" : "Illustrative invoice examples"}</td></tr><tr><td style="padding:0 17px 8px;color:#a9cfcc;font-size:8px;line-height:1.45;">${thai ? "ตัวอย่างนี้ไม่ใช่ข้อมูลบริษัทจริง แต่ยอดเงินบาทคำนวณจากข้อมูลเรทล่าสุด แต่ละแถวบอกยอด สกุลเงิน วันครบกำหนด และเงินบาทที่ควรเตรียม" : "These are not real company invoices, but the Thai-baht estimates use the latest rate data. Each row shows amount, currency, due date, and estimated cash required."}</td></tr><tr><td style="padding:0 17px 11px;"><table role="presentation" width="100%" style="width:100%;background:#fff;border-radius:13px;overflow:hidden;">${invoiceHtml}</table></td></tr>`;
}

function renderPremiumDailyDigestEmail({
  plan,
  locale,
  copy,
  assets,
  secondaryLocale,
  secondaryCopy,
  secondaryAssets,
  dashboardUrl,
  unsubscribeUrl,
  planName,
  disclaimerText
}) {
  const languageKey = language(locale);
  const badgeColor = plan === "plus" ? "#d99a12" : COLORS.teal;
  const panel = plan === "pro" ? "linear-gradient(145deg,#012d35 0%,#003f47 58%,#045e5b 100%)" : "linear-gradient(145deg,#023840 0%,#00545c 55%,#076d68 100%)";
  const secondary = secondaryCopy && secondaryAssets
    ? `${languageDivider(secondaryLocale)}${languageSection({ plan, locale: secondaryLocale, copy: secondaryCopy, assets: secondaryAssets, dashboardUrl })}`
    : "";
  const html = `<!doctype html><html lang="${languageKey}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="x-apple-disable-message-reformatting"><title>${escapeHtml(copy.subject)}</title>${styles()}</head><body><div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${escapeHtml(copy.subhead)}</div><table role="presentation" width="100%" style="width:100%;background:#eef4f5;"><tr><td class="page-pad" align="center" style="padding:22px 10px;"><table class="frame" role="presentation" width="100%" style="width:100%;max-width:600px;background:#fff;border:1px solid ${COLORS.line};border-radius:20px;overflow:hidden;box-shadow:0 18px 50px rgba(3,52,59,.14);">${header(planName, badgeColor)}<tr><td class="panel-wrap" style="padding:12px;"><table role="presentation" width="100%" style="width:100%;background:${panel};border-radius:18px;overflow:hidden;box-shadow:inset 0 0 0 1px rgba(88,235,216,.16);">${languageSection({ plan, locale, copy, assets, dashboardUrl })}${secondary}</table></td></tr>${footer({ planName, unsubscribeUrl, disclaimerText })}</table></td></tr></table></body></html>`;
  return html;
}

module.exports = { renderPremiumDailyDigestEmail };
