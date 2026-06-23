"use strict";

const {
  ACTIONS,
  TRACKED_ASSETS,
  applyAutoDemotion,
  createDefaultSignal,
  marketForSymbol,
  userFacingActionForDirection
} = require("./signalEngine");
const { ADVANCED_ASSETS, FIAT_ASSETS, normalizePlan, planFor } = require("./plans");
const { renderPremiumDailyDigestEmail } = require("./premiumDailyDigestEmail");

const DEFAULT_APP_URL = "https://savepulse.cloud";
const UNSUBSCRIBE_PLACEHOLDER = "{{unsubscribe_url}}";
const BANNED_EMAIL_WORDS_TH = Object.freeze([
  "สัญญาณซื้อ",
  "สัญญาณขาย",
  "ทำกำไร",
  "กำไร",
  "รับประกัน",
  "ต้องเข้า",
  "จุดเข้า",
  "ซื้อเลย",
  "ขายเลย",
  "แลกเลย",
  "พลาดกำไร"
]);

const BRAND = Object.freeze({
  teal: "#078b8d",
  tealDark: "#075e63",
  ink: "#101827",
  muted: "#64748b",
  line: "#d9e8ed",
  wash: "#eef8f9",
  amber: "#b7791f",
  amberBg: "#fff6dd",
  rose: "#be123c",
  roseBg: "#ffe7eb",
  green: "#16a34a",
  greenBg: "#e7f8ee"
});

const ASSET_LABELS = Object.freeze({
  USDTHB: { icon: "$", th: "ดอลลาร์สหรัฐ → บาทไทย", en: "US dollars → Thai baht", group: "fx", from: "USD", to: "THB" },
  JPYTHB: { icon: "¥", th: "บาทไทย → เยนญี่ปุ่น", en: "Thai baht → Japanese yen", group: "fx", from: "THB", to: "JPY" },
  EURTHB: { icon: "€", th: "บาทไทย → ยูโร", en: "Thai baht → Euros", group: "fx", from: "THB", to: "EUR" },
  XAUTHB: { icon: "Au", th: "บาทไทย → ทองคำ", en: "Thai baht → Gold", group: "gold", from: "THB", to: "XAU" },
  BTCTHB: { icon: "B", th: "บาทไทย → บิตคอยน์", en: "Thai baht → Bitcoin", group: "bitcoin", from: "THB", to: "BTC" },
  USDJPY: { icon: "¥", th: "ดอลลาร์สหรัฐ → เยนญี่ปุ่น", en: "US dollars → Japanese yen", group: "fx", from: "USD", to: "JPY" },
  EURUSD: { icon: "€", th: "ดอลลาร์สหรัฐ → ยูโร", en: "US dollars → Euros", group: "fx", from: "USD", to: "EUR" },
  XAUUSD: { icon: "Au", th: "ดอลลาร์สหรัฐ → ทองคำ", en: "US dollars → Gold", group: "gold", from: "USD", to: "XAU" },
  BTCUSD: { icon: "B", th: "ดอลลาร์สหรัฐ → บิตคอยน์", en: "US dollars → Bitcoin", group: "bitcoin", from: "USD", to: "BTC" }
});

const PLAN_COPY = Object.freeze({
  free: {
    th: {
      name: "Free",
      emailName: "Daily Pulse Lite",
      subject: "SavePulse Daily Pulse Lite | ข้อสังเกตวันนี้ก่อนคุณแลกเงินก้อนใหญ่",
      headline: "ข้อสังเกตวันนี้ก่อนคุณแลกเงินก้อนใหญ่",
      subhead: "สรุปแบบ Lite ให้เห็นความเคลื่อนไหวสำคัญ โดยยังล็อกรายละเอียดลึกไว้สำหรับแผนที่สูงกว่า",
      cta: "ดูการ์ดวันนี้",
      date: "อัปเดตทุกเช้า 08:30 น.",
      pill: "FREE"
    },
    en: {
      name: "Free",
      emailName: "Daily Pulse Lite",
      subject: "SavePulse Daily Pulse Lite | Which rate is worth watching before you exchange late",
      headline: "Which rate is worth watching before you exchange late",
      subhead: "A Lite daily snapshot that shows one important movement while deeper context stays unlocked for paid plans.",
      cta: "Open today's card",
      date: "Updated every morning at 08:30",
      pill: "FREE"
    }
  },
  plus: {
    th: {
      name: "Plus",
      emailName: "Daily Decision Card",
      subject: "SavePulse | Daily Decision Card สำหรับคุณ",
      headline: "รายการที่คุณเฝ้าอยู่ มีข้อสังเกตใหม่วันนี้",
      subhead: "การ์ดสรุปจากเรทอ้างอิง เพื่อช่วยประกอบการตัดสินใจอย่างมีข้อมูลมากขึ้น",
      cta: "เปิดการ์ดวันนี้",
      date: "อัปเดตทุกเช้า 08:30 น.",
      pill: "PLUS"
    },
    en: {
      name: "Plus",
      emailName: "Daily Decision Card",
      subject: "SavePulse | Your Daily Decision Card",
      headline: "Your watchlist has timing changes today",
      subhead: "A simple decision card based on current rate context, built for calmer planning.",
      cta: "Open today's card",
      date: "Updated every morning at 08:30",
      pill: "PLUS"
    }
  },
  pro: {
    th: {
      name: "Pro",
      emailName: "Full Daily Radar",
      subject: "SavePulse Pro | เรดาร์ค่าเงิน ทองคำ และบิตคอยน์วันนี้",
      headline: "ทองคำ บิตคอยน์ และค่าเงิน วันนี้ตัวไหนน่าจับตาเป็นพิเศษ",
      subhead: "สรุปจังหวะสำคัญจากข้อมูลสถิติย้อนหลัง เพื่อช่วยให้คุณทบทวนก่อนตัดสินใจ",
      cta: "เปิด Full Radar",
      date: "อัปเดตทุกเช้า 08:30 น.",
      pill: "PRO"
    },
    en: {
      name: "Pro",
      emailName: "Full Daily Radar",
      subject: "SavePulse Pro | Today's currency, gold, and bitcoin radar",
      headline: "Gold, bitcoin, and currencies: which areas deserve attention today",
      subhead: "A wider timing radar based on historical context, built for confident review.",
      cta: "Open Full Radar",
      date: "Updated every morning at 08:30",
      pill: "PRO"
    }
  },
  business: {
    th: {
      name: "Business",
      emailName: "Invoice Risk Brief",
      subject: "SavePulse Business | สรุปผลกระทบค่าเงินต่อใบแจ้งหนี้วันนี้",
      headline: "ต้นทุนใบแจ้งหนี้วันนี้เปลี่ยนไปเท่าไหร่",
      subhead: "ระบบสรุป invoice ต่างประเทศที่คุณกำลังติดตาม และประเมินผลกระทบโดยประมาณจากเรทอ้างอิงล่าสุด",
      cta: "เปิด Invoice Dashboard",
      date: "อัปเดตทุกเช้า 08:30 น.",
      pill: "BUSINESS"
    },
    en: {
      name: "Business",
      emailName: "Invoice Risk Brief",
      subject: "SavePulse Business | Invoice Risk Brief: How today's rates changed your invoice cost",
      headline: "How today's rates changed your invoice cost",
      subhead: "Currency movement translated into business cost context for your finance team.",
      cta: "Open Invoice Dashboard",
      date: "Updated every morning at 08:30",
      pill: "BUSINESS"
    }
  }
});

function localeKey(locale) {
  return locale === "en" ? "en" : "th";
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#039;");
}

function textFromHtml(html) {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function labelForSymbol(symbol, locale = "th") {
  const label = ASSET_LABELS[symbol] || { icon: "?", th: "รายการที่ SavePulse เฝ้าให้", en: "SavePulse watch item", group: "fx" };
  const market = marketForSymbol(symbol) || {};
  return {
    icon: label.icon,
    name: label[localeKey(locale)],
    group: label.group,
    from: label.from || market.base,
    to: label.to || market.quote
  };
}

function sampleSignals() {
  const actions = {
    USDTHB: ACTIONS.WAIT_ZONE,
    JPYTHB: ACTIONS.BUY_ZONE,
    EURTHB: ACTIONS.WAIT_ZONE,
    XAUTHB: ACTIONS.SELL_ZONE,
    BTCTHB: ACTIONS.SELL_ZONE,
    USDJPY: ACTIONS.WAIT_ZONE,
    EURUSD: ACTIONS.SELL_ZONE,
    XAUUSD: ACTIONS.SELL_ZONE,
    BTCUSD: ACTIONS.WAIT_ZONE
  };
  const percents = [54, 21, 47, 88, 82, 61, 72, 91, 58];

  return TRACKED_ASSETS.map((symbol, index) => ({
    ...createDefaultSignal(symbol),
    id: `${symbol}-daily-preview`,
    action: actions[symbol] || ACTIONS.WAIT_ZONE,
    percentile: { percent: percents[index] },
    receivedAt: new Date("2026-06-02T07:00:00+07:00").toISOString()
  }));
}

function signalsBySymbol(inputSignals = []) {
  const defaults = Object.fromEntries(sampleSignals().map((signal) => [signal.symbol, signal]));

  for (const signal of inputSignals) {
    if (signal && signal.symbol) {
      defaults[String(signal.symbol).toUpperCase()] = signal;
    }
  }

  return defaults;
}

function symbolsForPlan(plan) {
  const planId = normalizePlan(plan);

  if (planId === "free") {
    return ["USDTHB"];
  }

  if (planId === "plus") {
    return ["EURUSD", "JPYTHB", "USDTHB", "EURTHB"].filter((symbol) => FIAT_ASSETS.includes(symbol));
  }

  return TRACKED_ASSETS;
}

function directionAwareDecision(signal, locale = "th", direction = {}) {
  const effective = applyAutoDemotion(signal) || createDefaultSignal("USDTHB");
  const language = localeKey(locale);
  const thai = language === "th";
  const label = labelForSymbol(effective.symbol, language);
  const resolved = userFacingActionForDirection({
    symbol: effective.symbol,
    action: effective.action,
    userFromCurrency: direction.from || label.from,
    userToCurrency: direction.to || label.to
  });
  const action = resolved.action;
  const title = resolved.label?.[language] || (thai ? "ยังไม่ต้องรีบ" : "Not urgent yet");
  const short = resolved.copy?.[language] || (thai
    ? "เรทยังไม่ได้ดีหรือแย่ชัดเจน"
    : "The rate is not clearly favorable or unfavorable yet");

  if (action === ACTIONS.STRONG_BUY || action === ACTIONS.BUY_ZONE) {
    return {
      tone: "teal",
      badge: title,
      title,
      short,
      body: thai
        ? "ข้อมูลล่าสุดอยู่ในช่วงที่ลดความเสี่ยงเสียใจภายหลังได้ดีกว่าปกติ ถ้าวางแผนไว้แล้วให้เช็กการ์ดวันนี้"
        : "The latest data is in a lower-regret area. If this is already part of your plan, open today's card."
    };
  }

  if (action === ACTIONS.SELL_ZONE) {
    return {
      tone: "rose",
      badge: title,
      title,
      short,
      body: thai
        ? "สถานะวันนี้มีความเสี่ยงเสียใจภายหลังสูงขึ้น เหมาะกับการชะลออารมณ์และกลับไปดูแผนก่อนตัดสินใจ"
        : "Today's status carries higher regret risk. Use it as a pause-and-review prompt."
    };
  }

  return {
    tone: "amber",
    badge: title,
    title,
    short,
    body: thai
      ? "ยังไม่เห็นช่วงที่ชัดพอสำหรับการตัดสินใจแบบมั่นใจ ถ้าไม่รีบ การเฝ้าต่อยังมีประโยชน์"
      : "There is no clear low-regret window yet. If timing is flexible, continued monitoring still helps."
  };
}

function decisionForSignal(signal, locale = "th", direction = {}) {
  return directionAwareDecision(signal, locale, direction);
}

function toneColor(tone) {
  if (tone === "teal") return { color: BRAND.teal, bg: BRAND.greenBg };
  if (tone === "rose") return { color: BRAND.rose, bg: BRAND.roseBg };
  return { color: BRAND.amber, bg: BRAND.amberBg };
}

function baseUrl(url) {
  return String(url || DEFAULT_APP_URL).replace(/\/+$/, "");
}

function ctaButton(label, href, width = "260px") {
  return `<a href="${escapeHtml(href)}" style="display:block;width:${width};max-width:100%;box-sizing:border-box;background:${BRAND.teal};color:#fff;text-decoration:none;border-radius:12px;padding:15px 18px;font-size:16px;font-weight:800;text-align:center;margin:0 auto;">${escapeHtml(label)} &rarr;</a>`;
}

function logo(planPill) {
  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td style="font-size:28px;line-height:1.2;font-weight:900;color:${BRAND.teal};letter-spacing:-.02em;"><span style="font-size:24px;">~</span> SavePulse</td>
        <td align="right"><span style="display:inline-block;background:${BRAND.teal};color:#fff;border-radius:8px;padding:7px 10px;font-size:13px;font-weight:900;">${escapeHtml(planPill)}</span></td>
      </tr>
    </table>`;
}

function footer({ locale, unsubscribeUrl, planName }) {
  const thai = localeKey(locale) === "th";
  return `
    <div style="border-top:1px solid ${BRAND.line};margin-top:26px;padding:22px 24px;text-align:center;color:${BRAND.muted};font-size:12px;line-height:1.7;background:#fbfdfe;">
      <div>${escapeHtml(disclaimer(locale))}</div>
      <div style="margin-top:12px;">
        <a href="${escapeHtml(unsubscribeUrl)}" style="color:${BRAND.teal};font-weight:800;">${thai ? "ยกเลิกรับอีเมล" : "Unsubscribe"}</a>
      </div>
      <div style="margin-top:8px;">${escapeHtml(planName)} · © 2026 SavePulse Analytics Network</div>
    </div>`;
}

function emailShell({ locale, subject, preheader, body, outerBg = "#eef8f9" }) {
  const lang = localeKey(locale);
  return `<!doctype html>
<html lang="${lang}">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="x-apple-disable-message-reformatting">
    <title>${escapeHtml(subject)}</title>
  </head>
  <body style="margin:0;padding:0;background:${outerBg};font-family:Arial,'Helvetica Neue',sans-serif;color:${BRAND.ink};-webkit-text-size-adjust:100%;text-size-adjust:100%;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(preheader)}</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td align="center" style="padding:18px 10px;">
          ${body}
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function cardStart(maxWidth = 760, extra = "") {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:${maxWidth}px;background:#fff;border:1px solid ${BRAND.line};border-radius:18px;overflow:hidden;box-shadow:0 14px 42px rgba(15,23,42,.10);${extra}">`;
}

function percentFromSignal(signal) {
  return Number(signal?.percentile?.percent ?? signal?.percentile ?? 50);
}

function observationLevelFromPercent(percent, locale = "th") {
  const thai = localeKey(locale) === "th";
  if (!Number.isFinite(percent)) {
    return thai ? "ระดับข้อสังเกต: ปานกลาง" : "Observation level: medium";
  }
  if (percent >= 72) {
    return thai ? "ระดับข้อสังเกต: สูง" : "Observation level: high";
  }
  if (percent <= 28) {
    return thai ? "ระดับข้อสังเกต: ต่ำ" : "Observation level: low";
  }
  return thai ? "ระดับข้อสังเกต: ปานกลาง" : "Observation level: medium";
}

function observationWidthFromPercent(percent) {
  if (!Number.isFinite(percent)) return 50;
  if (percent >= 72) return 76;
  if (percent <= 28) return 34;
  return 56;
}

function safeEmailTitle(title, locale = "th") {
  if (localeKey(locale) !== "th") {
    return title === "Exchange now" ? "Favorable area" : title;
  }
  if (title === "แลกได้เลย") {
    return "เรทค่อนข้างดี";
  }
  return title;
}

function naturalAssetShort(symbol, decision, locale = "th") {
  const thai = localeKey(locale) === "th";
  const code = symbolCode(symbol);

  if (!thai) {
    return decision.short;
  }

  if (symbol === "XAUUSD") {
    return "ราคาทองคำเมื่อเทียบกับดอลลาร์ ยังไม่อยู่ในโซนที่เด่นชัดเมื่อเทียบกับข้อมูลย้อนหลัง";
  }

  if (symbol === "XAUTHB") {
    return "ราคาทองคำเมื่อเทียบกับเงินบาท ยังไม่อยู่ในโซนที่เด่นชัดเมื่อเทียบกับข้อมูลย้อนหลัง";
  }

  if (symbol === "BTCUSD") {
    return "ราคาบิตคอยน์เมื่อเทียบกับดอลลาร์ ยังไม่อยู่ในโซนที่เด่นชัดเมื่อเทียบกับข้อมูลย้อนหลัง";
  }

  if (symbol === "BTCTHB") {
    return "ราคาบิตคอยน์เมื่อเทียบกับเงินบาท ยังไม่อยู่ในโซนที่เด่นชัดเมื่อเทียบกับข้อมูลย้อนหลัง";
  }

  return String(decision.short || "เรทยังไม่อยู่ในโซนที่เด่นชัดเมื่อเทียบกับข้อมูลย้อนหลัง")
    .replace(/เรท ([A-Z]{3}) เทียบกับ ([A-Z]{3}) ยังไม่ได้ดีหรือแย่ชัดเจน/g, "เรทยังไม่อยู่ในโซนที่เด่นชัดเมื่อเทียบกับข้อมูลย้อนหลัง")
    .replace(/ถ้าคุณถือ ([A-Z]{3}) อยู่ จังหวะนี้เริ่มค่อนข้างดีเมื่อเทียบกับ ([A-Z]{3})/g, `เรทอ้างอิง ${code} อยู่ในโซนที่ค่อนข้างดีเมื่อเทียบกับข้อมูลย้อนหลัง`)
    .replace(/([A-Z]{3}) เริ่มแพงขึ้นเมื่อเทียบกับ ([A-Z]{3}) ถ้าคุณยังไม่รีบ อาจรอดูจังหวะที่ดีกว่านี้/g, `เรทอ้างอิง ${code} อยู่ในโซนที่ควรทบทวนแผนก่อนตัดสินใจ`);
}

function miniChart(tone = "teal") {
  const color = toneColor(tone).color;
  return `<svg width="108" height="42" viewBox="0 0 120 46" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M4 34 C18 25 27 30 41 19 S65 10 78 18 S101 28 116 8" stroke="${color}" stroke-width="4" stroke-linecap="round"/>
    <path d="M4 39 H116" stroke="#d9e8ed" stroke-width="2"/>
  </svg>`;
}

function sectionBox(content, { bg = "#fff", border = BRAND.line, padding = "18px", radius = "14px" } = {}) {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${border};border-radius:${radius};background:${bg};">
    <tr><td style="padding:${padding};">${content}</td></tr>
  </table>`;
}

function heroBlock(copy, planLabel) {
  return `
    <tr><td style="padding:24px 22px 8px;">${logo(planLabel)}</td></tr>
    <tr>
      <td style="padding:8px 22px 4px;">
        <h1 style="font-size:30px;line-height:1.22;letter-spacing:-.02em;margin:14px 0 10px;color:${BRAND.ink};">${escapeHtml(copy.headline)}</h1>
        <p style="font-size:16px;line-height:1.55;color:${BRAND.muted};margin:0;">${escapeHtml(copy.subhead)}</p>
        <div style="margin-top:14px;font-size:13px;color:${BRAND.muted};font-weight:800;">☷ ${escapeHtml(copy.date)}</div>
      </td>
    </tr>`;
}

function symbolCode(symbol) {
  const market = marketForSymbol(symbol) || {};
  return `${market.base || symbol.slice(0, 3)}/${market.quote || symbol.slice(3)}`;
}

function assetCard(symbol, signal, locale, { compact = false } = {}) {
  const label = labelForSymbol(symbol, locale);
  const decision = decisionForSignal(signal, locale, signal?.userDirection || {});
  const color = toneColor(decision.tone);
  const percent = percentFromSignal(signal);
  const observationLabel = observationLevelFromPercent(percent, locale);
  const observationWidth = observationWidthFromPercent(percent);
  const safeTitle = safeEmailTitle(decision.title, locale);
  const safeShort = naturalAssetShort(symbol, decision, locale);
  return sectionBox(`
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td valign="top" style="width:54px;padding-right:12px;">
          <div style="width:46px;height:46px;border-radius:50%;background:${BRAND.wash};border:1px solid ${BRAND.line};text-align:center;line-height:46px;font-size:22px;font-weight:900;color:${BRAND.teal};">${escapeHtml(label.icon)}</div>
        </td>
        <td valign="top">
          <div style="font-size:${compact ? "16px" : "18px"};line-height:1.35;font-weight:900;color:${BRAND.ink};">${escapeHtml(label.name)}</div>
          <div style="font-size:12px;line-height:1.4;color:${BRAND.muted};margin-top:2px;">${escapeHtml(localeKey(locale) === "th" ? `อ้างอิง ${symbolCode(symbol)}` : `Reference ${symbolCode(symbol)}`)}</div>
        </td>
      </tr>
      <tr>
        <td colspan="2" style="padding-top:14px;">
          <span style="display:inline-block;background:${color.bg};color:${color.color};border-radius:999px;padding:7px 10px;font-size:13px;line-height:1.2;font-weight:900;">${escapeHtml(safeTitle)}</span>
          <p style="font-size:14px;line-height:1.55;color:${BRAND.muted};margin:10px 0 0;">${escapeHtml(safeShort)}</p>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:13px;">
            <tr>
              <td style="background:#edf4f5;border-radius:999px;height:10px;overflow:hidden;"><div style="width:${observationWidth}%;height:10px;background:${color.color};border-radius:999px;"></div></td>
            </tr>
          </table>
          <div style="font-size:12px;line-height:1.4;color:${BRAND.muted};font-weight:900;margin-top:7px;">${escapeHtml(observationLabel)}</div>
        </td>
      </tr>
    </table>`);
}

function simpleInfoBox({ icon = "✓", title, body, tone = "teal" }) {
  const color = toneColor(tone);
  return sectionBox(`
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td valign="top" style="width:44px;padding-right:12px;">
          <div style="width:36px;height:36px;border-radius:10px;background:${color.bg};color:${color.color};text-align:center;line-height:36px;font-weight:900;">${escapeHtml(icon)}</div>
        </td>
        <td valign="top">
          <div style="font-size:17px;line-height:1.35;font-weight:900;color:${BRAND.ink};">${escapeHtml(title)}</div>
          <div style="font-size:14px;line-height:1.55;color:${BRAND.muted};margin-top:5px;">${escapeHtml(body)}</div>
        </td>
      </tr>
    </table>`, { bg: tone === "amber" ? "#fffaf0" : "#fbfdfe", border: tone === "amber" ? "#f0ddb0" : BRAND.line });
}

function renderFreeEmail({ locale, copy, signalMap, dashboardUrl, unsubscribeUrl, planName }) {
  const thai = localeKey(locale) === "th";
  const signal = signalMap.USDTHB || sampleSignals()[0];
  const body = `
    ${cardStart(600)}
      ${heroBlock(copy, copy.pill)}
      <tr><td style="padding:18px 22px 0;">${assetCard("USDTHB", signal, locale)}</td></tr>
      <tr>
        <td style="padding:14px 22px 0;">${simpleInfoBox({
          icon: "↕",
          title: thai ? "ตัวอย่างจากข้อมูลย้อนหลัง" : "Historical example",
          body: thai
            ? "จากข้อมูลย้อนหลัง เมื่อเกิดจุดสังเกตลักษณะคล้ายกัน เรทอ้างอิงเคยดีขึ้นเฉลี่ย 0.38 บาทภายใน 2 วัน ข้อมูลนี้ใช้เพื่อประกอบภาพรวม ไม่ยืนยันผลในอนาคต"
            : "On a prior watch window, waiting two days improved the reference rate by about 0.38 baht. Historical data is illustrative, not a future confirmation.",
          tone: "amber"
        })}</td>
      </tr>
      <tr>
        <td style="padding:14px 22px 0;">${simpleInfoBox({
          icon: "▣",
          title: thai ? "ปลดล็อกการ์ด Gold และ BTC" : "Unlock Gold and BTC cards",
          body: thai ? "ข้อมูลเต็มยังล็อกไว้ หัวข้อทองคำและบิตคอยน์เป็นเฉพาะ Pro" : "Full detail is locked. Gold and bitcoin are Pro-only.",
          tone: "teal"
        })}</td>
      </tr>
      <tr><td align="center" style="padding:22px 22px 0;">${ctaButton(copy.cta, dashboardUrl, "100%")}</td></tr>
      <tr><td>${footer({ locale, unsubscribeUrl, planName })}</td></tr>
    </table>`;

  return emailShell({ locale, subject: copy.subject, preheader: copy.subhead, body });
}

function watchRow(symbol, signal, locale) {
  return `<tr><td style="padding:0 0 12px;">${assetCard(symbol, signal, locale, { compact: true })}</td></tr>`;
}

function renderPlusEmail({ locale, copy, signalMap, dashboardUrl, unsubscribeUrl, planName }) {
  const thai = localeKey(locale) === "th";
  const rows = symbolsForPlan("plus").map((symbol) => watchRow(symbol, signalMap[symbol], locale)).join("");
  const body = `
    ${cardStart(600)}
      ${heroBlock(copy, copy.pill)}
      <tr>
        <td style="padding:16px 22px 0;">
          <div style="display:inline-block;background:${BRAND.wash};color:${BRAND.teal};border-radius:999px;padding:8px 12px;font-size:13px;font-weight:900;">◷ ${thai ? "หน้าต่าง 5 วันทำการ" : "Five-business-day window"}</div>
        </td>
      </tr>
      <tr>
        <td style="padding:14px 22px 0;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}</table>
        </td>
      </tr>
      <tr><td align="center" style="padding:10px 22px 0;">${ctaButton(copy.cta, dashboardUrl, "100%")}</td></tr>
      <tr>
        <td style="padding:14px 22px 0;">${simpleInfoBox({
          icon: "◎",
          title: thai ? "อัปเกรดเป็น Pro" : "Upgrade to Pro",
          body: thai ? "เพิ่มเรดาร์ทองคำ บิตคอยน์ และภาพรวมหลายสินทรัพย์ในอีเมลเดียว" : "Add gold, bitcoin, and a wider multi-asset radar in one email.",
          tone: "teal"
        })}</td>
      </tr>
      <tr><td>${footer({ locale, unsubscribeUrl, planName })}</td></tr>
    </table>`;

  return emailShell({ locale, subject: copy.subject, preheader: copy.subhead, body });
}

function groupCard(title, symbols, signalMap, locale) {
  const rows = symbols.map((symbol) => {
    const signal = signalMap[symbol];
    return `<tr><td style="padding:0 0 12px;">${assetCard(symbol, signal, locale, { compact: true })}</td></tr>`;
  }).join("");

  return `<tr><td style="padding:0 22px 2px;">
    <div style="font-size:20px;line-height:1.35;font-weight:900;color:${BRAND.ink};margin:12px 0 10px;">${escapeHtml(title)}</div>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}</table>
  </td></tr>`;
}

function renderProEmail({ locale, copy, signalMap, dashboardUrl, unsubscribeUrl, planName }) {
  const thai = localeKey(locale) === "th";
  const body = `
    ${cardStart(600)}
      <tr><td style="padding:24px 22px 10px;">${logo(copy.pill)}</td></tr>
      <tr>
        <td style="padding:0 22px;">
          <div style="background:#082b31;border-radius:16px;padding:24px;color:#fff;">
            <div style="display:inline-block;background:rgba(20,184,166,.18);border-radius:999px;padding:8px 12px;font-size:13px;font-weight:900;color:#8ff4e8;">◎ Full Daily Radar</div>
            <h1 style="font-size:29px;line-height:1.22;letter-spacing:-.02em;margin:16px 0 8px;">${escapeHtml(copy.headline)}</h1>
            <p style="font-size:16px;line-height:1.55;color:#d4f7f4;margin:0;">${escapeHtml(copy.subhead)}</p>
          </div>
          <div style="font-size:13px;color:${BRAND.muted};font-weight:800;margin-top:14px;">☷ ${escapeHtml(copy.date)} · ${thai ? "ระดับข้อสังเกตอ้างอิงจากข้อมูลย้อนหลัง" : "Observation level references historical context"}</div>
        </td>
      </tr>
      ${groupCard(thai ? "ค่าเงิน" : "Currencies", ["USDTHB", "EURTHB", "JPYTHB"], signalMap, locale)}
      ${groupCard(thai ? "ทองคำ" : "Gold", ["XAUUSD", "XAUTHB"], signalMap, locale)}
      ${groupCard(thai ? "บิตคอยน์" : "Bitcoin", ["BTCUSD", "BTCTHB"], signalMap, locale)}
      <tr>
        <td style="padding:8px 22px 0;">${simpleInfoBox({
          icon: "↺",
          title: thai ? "ย้อนหลังสั้น ๆ" : "Quick replay",
          body: thai
            ? "เรทอ้างอิง USD/THB, XAU/USD และ BTC/USD มีการเปลี่ยนแปลงในข้อมูลย้อนหลังรอบล่าสุด ใช้เพื่อทบทวน ไม่ใช่การยืนยันอนาคต"
            : "USD/THB, XAU/USD, and BTC/USD moved in the latest historical replay. Use this for review, not as future confirmation.",
          tone: "amber"
        })}</td>
      </tr>
      <tr><td align="center" style="padding:22px 22px 0;">${ctaButton(copy.cta, dashboardUrl, "100%")}</td></tr>
      <tr><td>${footer({ locale, unsubscribeUrl, planName })}</td></tr>
    </table>`;

  return emailShell({ locale, subject: copy.subject, preheader: copy.subhead, body, outerBg: "#eaf6f7" });
}

function renderBusinessEmail({ locale, copy, dashboardUrl, unsubscribeUrl, planName }) {
  const thai = localeKey(locale) === "th";
  const metricCards = [
    thai ? ["ยอดรวม invoice ที่ติดตาม", "USD 148,250", "อ้างอิงเรทล่าสุด 36.72 บาท/ดอลลาร์"] : ["Tracked invoice total", "USD 148,250", "Latest reference 36.72 THB/USD"],
    thai ? ["ใบที่ใกล้ครบกำหนดที่สุด", "10 มิ.ย. 2569", "อีก 8 วัน"] : ["Nearest due invoice", "Jun 10, 2026", "8 days left"],
    thai ? ["ความผันผวนค่าเงิน", "ต่ำ", "ช่วง 7 วันล่าสุด +0.52%"] : ["Currency movement", "Low", "Last 7 days +0.52%"],
    thai ? ["สถานะวันนี้", "ติดตามต่อ", "ยังไม่พบแรงกดดันสูงจากข้อมูลย้อนหลัง"] : ["Today's status", "Monitor", "No high pressure seen in historical context"]
  ].map(([title, main, sub]) => sectionBox(`
    <div style="font-size:12px;color:${BRAND.muted};font-weight:800;">${escapeHtml(title)}</div>
    <div style="font-size:22px;line-height:1.3;font-weight:900;color:${BRAND.teal};margin-top:7px;">${escapeHtml(main)}</div>
    <div style="font-size:12px;color:${BRAND.muted};line-height:1.45;margin-top:4px;">${escapeHtml(sub)}</div>
  `, { bg: "#eff7fb", border: "#d9e8ed", padding: "14px" })).join('<div style="height:10px;line-height:10px;">&nbsp;</div>');
  const invoiceCards = [
    ["ABC Components Ltd.", "USD", "68,250", thai ? "31 พ.ค. 2569" : "May 31", "decrease", "1,120.45", thai ? "เทียบกับเรทอ้างอิงก่อนหน้า" : "Compared with the prior reference rate"],
    ["Global Packaging Inc.", "EUR", "42,130", thai ? "6 มิ.ย. 2569" : "Jun 6", "increase", "1,874.32", thai ? "ควรติดตามใกล้ชิด เพราะครบกำหนดภายใน 2 สัปดาห์" : "Worth closer monitoring because it is due within two weeks"],
    ["Oceanic Materials Co.", "USD", "37,870", thai ? "15 มิ.ย. 2569" : "Jun 15", "decrease", "612.18", thai ? "ผลกระทบยังอยู่ในระดับต่ำ แต่ควรติดตามต่อ" : "Impact is still low, but keep monitoring"]
  ].map(([supplier, currency, amount, due, direction, impactAmount, note]) => {
    const isIncrease = direction === "increase";
    const impactTitle = thai
      ? (isIncrease ? "ต้นทุนเพิ่มขึ้นโดยประมาณ" : "ต้นทุนลดลงโดยประมาณ")
      : (isIncrease ? "Estimated cost increase" : "Estimated cost decrease");
    const impactColor = isIncrease ? BRAND.rose : BRAND.green;
    return sectionBox(`
    <div style="font-size:16px;line-height:1.35;font-weight:900;color:${BRAND.ink};">${escapeHtml(supplier)}</div>
    <div style="font-size:13px;line-height:1.5;color:${BRAND.muted};margin-top:6px;">${escapeHtml(currency)} ${escapeHtml(amount)} · ${escapeHtml(thai ? `ครบกำหนด ${due}` : `Due ${due}`)}</div>
    <div style="font-size:12px;line-height:1.4;color:${BRAND.muted};font-weight:800;margin-top:12px;">${escapeHtml(impactTitle)}</div>
    <div style="font-size:24px;line-height:1.25;font-weight:900;color:${impactColor};margin-top:4px;">${escapeHtml(impactAmount)} ${thai ? "บาท" : "THB"}</div>
    <div style="font-size:12px;line-height:1.45;color:${BRAND.muted};margin-top:7px;">${escapeHtml(note)}</div>
  `, { bg: "#fff", border: BRAND.line, padding: "14px" });
  }).join('<div style="height:10px;line-height:10px;">&nbsp;</div>');
  const body = `
    ${cardStart(600)}
      ${heroBlock(copy, copy.pill)}
      <tr><td style="padding:16px 22px 0;">${metricCards}</td></tr>
      <tr>
        <td style="padding:18px 22px 0;">
          <h2 style="font-size:20px;line-height:1.35;margin:0 0 12px;color:${BRAND.ink};">▦ ${thai ? "ใบแจ้งหนี้ที่น่าติดตาม" : "Invoices to monitor"}</h2>
          ${invoiceCards}
        </td>
      </tr>
      <tr>
        <td style="padding:14px 22px 0;">${simpleInfoBox({
          icon: "!",
          title: thai ? "หมายเหตุสำหรับทีมบัญชี/การเงิน" : "Finance team note",
          body: thai ? "ค่าเงินช่วงนี้ผันผวนต่ำ แต่ยังควรติดตาม invoice ที่ครบกำหนดใน 2 สัปดาห์ข้างหน้า เพราะยอดที่ต้องจ่ายอาจทำให้ต้นทุนเงินบาทเปลี่ยนได้" : "Currency movement is low right now, but invoices due within the next two weeks still deserve monitoring because payable amounts can change THB cost.",
          tone: "amber"
        })}</td>
      </tr>
      <tr><td align="center" style="padding:22px 22px 0;">${ctaButton(copy.cta, dashboardUrl, "100%")}</td></tr>
      <tr><td>${footer({ locale, unsubscribeUrl, planName })}</td></tr>
    </table>`;

  return emailShell({ locale, subject: copy.subject, preheader: copy.subhead, body, outerBg: "#f6fbfd" });
}

function disclaimer(locale = "th") {
  return localeKey(locale) === "th"
    ? "ข้อมูลในอีเมลนี้จัดทำเพื่อสนับสนุนการตัดสินใจจากข้อมูลย้อนหลังเท่านั้น ไม่ใช่คำแนะนำการลงทุน ไม่ใช่คำสั่งซื้อขายหรือการทำธุรกรรม และไม่ยืนยันผลลัพธ์ในอนาคต โปรดตรวจสอบเรท ค่าธรรมเนียม และสเปรดจริงกับผู้ให้บริการก่อนตัดสินใจ"
    : "This email is decision-support information based on historical data only. It is not financial advice, investment advice, trading instruction, or a confirmation of future rates. Please verify provider rates, fees, and spreads before making decisions.";
}

const PREMIUM_ASSET_ICONS = Object.freeze({
  USDTHB: "🇺🇸",
  EURUSD: "🇪🇺",
  EURTHB: "🇪🇺",
  JPYTHB: "🇯🇵",
  USDJPY: "🇯🇵",
  XAUUSD: "🟨",
  XAUTHB: "🇹🇭",
  BTCUSD: "₿",
  BTCTHB: "🇹🇭"
});

function premiumAssetModel(symbol, signalMap, locale) {
  const signal = signalMap[symbol] || createDefaultSignal(symbol);
  const label = labelForSymbol(symbol, locale);
  const decision = decisionForSignal(signal, locale, signal?.userDirection || {});
  const percent = Math.max(0, Math.min(100, Math.round(percentFromSignal(signal))));
  const thai = localeKey(locale) === "th";

  return {
    symbol,
    icon: PREMIUM_ASSET_ICONS[symbol] || label.icon,
    name: label.name,
    reference: thai ? `อ้างอิง ${symbolCode(symbol)}` : `Reference ${symbolCode(symbol)}`,
    tone: decision.tone,
    title: safeEmailTitle(decision.title, locale),
    short: naturalAssetShort(symbol, decision, locale),
    percent,
    observationIntro: thai ? "ระดับข้อสังเกตจากข้อมูลย้อนหลัง" : "Historical observation level",
    observationLabel: observationLevelFromPercent(percent, locale)
  };
}

function premiumAssetsForPlan(plan, signalMap, locale) {
  if (plan === "free") {
    return [premiumAssetModel("USDTHB", signalMap, locale)];
  }

  if (plan === "plus") {
    return ["EURUSD", "JPYTHB", "USDTHB"].map((symbol) => premiumAssetModel(symbol, signalMap, locale));
  }

  if (plan === "pro") {
    return [
      ["USDTHB", "EURTHB", "JPYTHB"],
      ["XAUUSD", "XAUTHB"],
      ["BTCUSD", "BTCTHB"]
    ].map((symbols) => symbols.map((symbol) => premiumAssetModel(symbol, signalMap, locale)));
  }

  return [];
}

function buildDailyDigestEmail({
  plan = "free",
  locale = "th",
  signals = [],
  dashboardUrl = DEFAULT_APP_URL,
  unsubscribeUrl = UNSUBSCRIBE_PLACEHOLDER
} = {}) {
  const planId = normalizePlan(plan);
  const language = localeKey(locale);
  const copy = PLAN_COPY[planId][language];
  const signalMap = signalsBySymbol(signals);
  const resolvedDashboardUrl = baseUrl(dashboardUrl);
  const planName = planFor(planId).name;
  const html = renderPremiumDailyDigestEmail({
    plan: planId,
    locale: language,
    copy,
    assets: premiumAssetsForPlan(planId, signalMap, language),
    dashboardUrl: resolvedDashboardUrl,
    unsubscribeUrl,
    planName,
    disclaimerText: disclaimer(language)
  });

  return {
    plan: planId,
    locale: language,
    subject: copy.subject,
    html,
    text: textFromHtml(html)
  };
}

function buildEmailPreviewIndex(locale = "th") {
  const language = localeKey(locale);
  const thai = language === "th";
  const links = ["free", "plus", "pro", "business"].map((plan) => {
    const copy = PLAN_COPY[plan][language];
    return `<a href="/email-preview/${plan}?lang=${language}" style="display:block;border:1px solid ${BRAND.line};background:#fff;border-radius:16px;padding:18px;text-decoration:none;color:${BRAND.ink};margin:10px 0;"><strong>${escapeHtml(copy.name)}</strong><br><span style="color:${BRAND.muted};">${escapeHtml(copy.emailName)}</span><br><small style="color:#94a3b8;">${escapeHtml(copy.subject)}</small></a>`;
  }).join("");

  return `<!doctype html>
<html lang="${language}">
  <head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>SavePulse Email Preview</title></head>
  <body style="margin:0;background:${BRAND.wash};font-family:Arial,sans-serif;color:${BRAND.ink};">
    <main style="max-width:680px;margin:0 auto;padding:42px 18px;">
      <h1 style="font-size:36px;margin:0 0 8px;">SavePulse Email Preview</h1>
      <p style="color:${BRAND.muted};line-height:1.6;margin:0 0 24px;">${thai ? "เลือกแพ็กเกจเพื่อดูตัวอย่างอีเมลรายวัน แต่ละแพ็กเกจมีหน้าตาและน้ำเสียงต่างกัน ยังไม่มีการส่งอีเมลจริง" : "Choose a plan to preview the daily email. Each plan has a distinct design and tone. No real emails are sent."}</p>
      ${links}
    </main>
  </body>
</html>`;
}

module.exports = {
  BANNED_EMAIL_WORDS_TH,
  buildDailyDigestEmail,
  buildEmailPreviewIndex,
  decisionForSignal,
  disclaimer,
  labelForSymbol,
  sampleSignals
};
