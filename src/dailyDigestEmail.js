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

const DEFAULT_APP_URL = "https://savepulse.cloud";
const UNSUBSCRIBE_PLACEHOLDER = "{{unsubscribe_url}}";
const BANNED_EMAIL_WORDS_TH = Object.freeze(["สัญญาณซื้อ", "กำไร", "รับประกัน", "ต้องเข้า", "จุดเข้า"]);

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
      subject: "SavePulse Daily Pulse Lite | วันนี้เรทไหนเริ่มน่าจับตา ก่อนคุณแลกช้าไป",
      headline: "วันนี้เรทไหนเริ่มน่าจับตา ก่อนคุณแลกช้าไป",
      subhead: "สรุปแบบ Lite ให้เห็นความเคลื่อนไหวสำคัญ โดยยังล็อกรายละเอียดลึกไว้สำหรับแผนที่สูงกว่า",
      cta: "ดูการ์ดวันนี้",
      date: "อัปเดตทุกเช้า 08:00 น.",
      pill: "FREE"
    },
    en: {
      name: "Free",
      emailName: "Daily Pulse Lite",
      subject: "SavePulse Daily Pulse Lite | Which rate is worth watching before you exchange late",
      headline: "Which rate is worth watching before you exchange late",
      subhead: "A Lite daily snapshot that shows one important movement while deeper context stays unlocked for paid plans.",
      cta: "Open today's card",
      date: "Updated every morning at 08:00",
      pill: "FREE"
    }
  },
  plus: {
    th: {
      name: "Plus",
      emailName: "Daily Decision Card",
      subject: "SavePulse | Daily Decision Card สำหรับคุณ",
      headline: "รายการที่คุณเฝ้าอยู่ มีจังหวะเปลี่ยนวันนี้",
      subhead: "การ์ดสรุปจากเรทจริง วิเคราะห์เพื่อการตัดสินใจที่มั่นใจขึ้น",
      cta: "เปิดการ์ดวันนี้",
      date: "อัปเดตทุกเช้า",
      pill: "PLUS"
    },
    en: {
      name: "Plus",
      emailName: "Daily Decision Card",
      subject: "SavePulse | Your Daily Decision Card",
      headline: "Your watchlist has timing changes today",
      subhead: "A simple decision card based on current rate context, built for calmer planning.",
      cta: "Open today's card",
      date: "Updated every morning",
      pill: "PLUS"
    }
  },
  pro: {
    th: {
      name: "Pro",
      emailName: "Full Timing Radar",
      subject: "SavePulse Pro | เรดาร์ค่าเงิน ทองคำ และบิตคอยน์วันนี้",
      headline: "ทองคำ และบิตคอยน์ / ค่าเงิน วันนี้ตัวไหนเสี่ยงพลาดจังหวะ",
      subhead: "สรุปจังหวะสำคัญจากข้อมูลสถิติย้อนหลัง เพื่อช่วยให้คุณทบทวนก่อนตัดสินใจ",
      cta: "เปิด Full Radar",
      date: "อัปเดตล่าสุด 07:30 น.",
      pill: "PRO"
    },
    en: {
      name: "Pro",
      emailName: "Full Timing Radar",
      subject: "SavePulse Pro | Today's currency, gold, and bitcoin radar",
      headline: "Gold, bitcoin, and currencies: which areas deserve attention today",
      subhead: "A wider timing radar based on historical context, built for confident review.",
      cta: "Open Full Radar",
      date: "Last updated 07:30",
      pill: "PRO"
    }
  },
  business: {
    th: {
      name: "Business",
      emailName: "Invoice Risk Brief",
      subject: "SavePulse Business | Invoice Risk Brief: ต้นทุนใบแจ้งหนี้วันนี้เปลี่ยนไปเท่าไหร่",
      headline: "ต้นทุนใบแจ้งหนี้วันนี้เปลี่ยนไปเท่าไหร่",
      subhead: "แปลการขยับของค่าเงินเป็นผลกระทบต่อต้นทุนธุรกิจและใบแจ้งหนี้",
      cta: "เปิด Invoice Dashboard",
      date: "อัปเดต 08:30 น.",
      pill: "BUSINESS"
    },
    en: {
      name: "Business",
      emailName: "Invoice Risk Brief",
      subject: "SavePulse Business | Invoice Risk Brief: How today's rates changed your invoice cost",
      headline: "How today's rates changed your invoice cost",
      subhead: "Currency movement translated into business cost context for your finance team.",
      cta: "Open Invoice Dashboard",
      date: "Updated 08:30",
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
  return `<a href="${escapeHtml(href)}" style="display:inline-block;width:${width};max-width:100%;background:${BRAND.teal};color:#fff;text-decoration:none;border-radius:10px;padding:14px 18px;font-size:16px;font-weight:800;text-align:center;">${escapeHtml(label)} &rarr;</a>`;
}

function logo(planPill) {
  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td style="font-size:30px;font-weight:900;color:${BRAND.teal};letter-spacing:-.03em;"><span style="font-size:28px;">~</span> SavePulse</td>
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
    <title>${escapeHtml(subject)}</title>
  </head>
  <body style="margin:0;background:${outerBg};font-family:Arial,'Helvetica Neue',sans-serif;color:${BRAND.ink};">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(preheader)}</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td align="center" style="padding:34px 14px;">
          ${body}
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function cardStart(maxWidth = 760, extra = "") {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:${maxWidth}px;background:#fff;border:1px solid ${BRAND.line};border-radius:18px;overflow:hidden;box-shadow:0 18px 55px rgba(15,23,42,.12);${extra}">`;
}

function percentFromSignal(signal) {
  return Number(signal?.percentile?.percent ?? signal?.percentile ?? 54);
}

function miniChart(tone = "teal") {
  const color = toneColor(tone).color;
  return `<svg width="120" height="46" viewBox="0 0 120 46" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M4 34 C18 25 27 30 41 19 S65 10 78 18 S101 28 116 8" stroke="${color}" stroke-width="4" stroke-linecap="round"/>
    <path d="M4 39 H116" stroke="#d9e8ed" stroke-width="2"/>
  </svg>`;
}

function renderFreeEmail({ locale, copy, signalMap, dashboardUrl, unsubscribeUrl, planName }) {
  const thai = localeKey(locale) === "th";
  const signal = signalMap.USDTHB || sampleSignals()[0];
  const decision = decisionForSignal(signal, locale, signal?.userDirection || {});
  const color = toneColor(decision.tone);
  const body = `
    ${cardStart(760)}
      <tr><td style="padding:30px 34px 12px;">${logo(copy.pill)}</td></tr>
      <tr>
        <td style="padding:8px 34px 0;">
          <h1 style="font-size:38px;line-height:1.1;letter-spacing:-.04em;margin:20px 0 10px;color:${BRAND.ink};">${escapeHtml(copy.headline)}</h1>
          <div style="font-size:14px;color:${BRAND.muted};font-weight:700;">☷ ${escapeHtml(copy.date)}</div>
        </td>
      </tr>
      <tr>
        <td style="padding:22px 34px 0;">
          <div style="border:1px solid ${BRAND.line};border-radius:16px;padding:22px;background:#fff;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td width="180" align="center">
                  <div style="width:136px;height:136px;border:2px solid ${BRAND.teal};border-radius:999px;display:inline-block;text-align:center;">
                    <div style="font-size:34px;margin-top:29px;">${escapeHtml(labelForSymbol("USDTHB", locale).icon)}</div>
                    <div style="font-weight:900;font-size:18px;margin-top:8px;">USD/THB</div>
                    <div style="font-size:12px;color:${BRAND.muted};margin-top:3px;">${thai ? "ดอลลาร์สหรัฐ / บาท" : "US dollar / baht"}</div>
                  </div>
                </td>
                <td style="padding-left:18px;">
                  <div style="display:inline-block;background:${BRAND.wash};color:${BRAND.teal};border-radius:7px;padding:5px 9px;font-size:13px;font-weight:900;">${escapeHtml(thai ? "ข้อสังเกตวันนี้" : "Today's note")}</div>
                  <h2 style="font-size:34px;line-height:1.1;margin:12px 0 6px;color:${BRAND.ink};">${escapeHtml(decision.title)}</h2>
                  <p style="font-size:16px;color:${BRAND.muted};line-height:1.5;margin:0 0 14px;">${escapeHtml(decision.short)}</p>
                  <div style="height:12px;background:#e9f0f2;border-radius:999px;overflow:hidden;"><div style="height:12px;width:56%;background:${color.color};border-radius:999px;"></div></div>
                  <table role="presentation" width="100%" style="font-size:12px;color:${BRAND.muted};font-weight:800;margin-top:8px;"><tr><td>${thai ? "น่ารอ" : "Less ready"}</td><td align="center">${thai ? "รอดูก่อน" : "Watch"}</td><td align="right">${thai ? "น่าจับตา" : "Worth watching"}</td></tr></table>
                </td>
              </tr>
            </table>
          </div>
        </td>
      </tr>
      <tr>
        <td style="padding:18px 34px 0;">
          <div style="border:1px solid #f0ddb0;border-radius:14px;background:#fffaf0;padding:18px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="font-size:40px;width:58px;color:${BRAND.amber};">▥</td>
                <td style="font-size:15px;line-height:1.55;color:${BRAND.ink};">
                  <strong>${thai ? "ตัวอย่างจากข้อมูลย้อนหลัง" : "Historical example"}</strong><br>
                  ${thai ? "เมื่อ 17 พ.ค. 67 ข้อสังเกตเคยขึ้นว่า “น่าจับตา” หากแลกหลังจากนั้น 2 วัน เรทดีขึ้นเฉลี่ย 0.38 บาท" : "On a prior watch window, waiting two days improved the reference rate by about 0.38 baht."}
                  <div style="font-size:11px;color:${BRAND.muted};margin-top:4px;">${thai ? "ข้อมูลย้อนหลังใช้เพื่อประกอบภาพ ไม่ยืนยันผลในอนาคต" : "Historical data is illustrative and does not confirm future outcomes."}</div>
                </td>
                <td align="right" style="width:150px;">${miniChart("teal")}<div style="font-size:18px;color:${BRAND.teal};font-weight:900;">+0.38</div></td>
              </tr>
            </table>
          </div>
        </td>
      </tr>
      <tr>
        <td style="padding:18px 34px 0;">
          <div style="border:1px solid ${BRAND.line};border-radius:14px;background:#fbfdfe;padding:18px;">
            <table role="presentation" width="100%"><tr>
              <td style="font-size:38px;width:56px;color:${BRAND.teal};">▣</td>
              <td style="font-size:16px;line-height:1.5;"><strong>${thai ? "ปลดล็อกการ์ด Gold และ BTC" : "Unlock Gold and BTC cards"}</strong><br><span style="color:${BRAND.muted};">${thai ? "ข้อมูลเต็มยังล็อกไว้ หัวข้อทองคำและบิตคอยน์เป็นเฉพาะ Pro" : "Full detail is locked. Gold and bitcoin are Pro-only."}</span></td>
              <td align="right">${ctaButton(thai ? "ดูแผนและราคา" : "See plans", `${dashboardUrl}/#pricing`, "170px")}</td>
            </tr></table>
          </div>
        </td>
      </tr>
      <tr><td align="center" style="padding:24px 34px 0;">${ctaButton(copy.cta, dashboardUrl)}</td></tr>
      <tr><td>${footer({ locale, unsubscribeUrl, planName })}</td></tr>
    </table>`;

  return emailShell({ locale, subject: copy.subject, preheader: copy.subhead, body });
}

function watchRow(symbol, signal, locale) {
  const label = labelForSymbol(symbol, locale);
  const decision = decisionForSignal(signal, locale, signal?.userDirection || {});
  const color = toneColor(decision.tone);
  const percent = percentFromSignal(signal);
  return `
    <tr>
      <td style="padding:13px 14px;border-bottom:1px solid #edf2f4;width:210px;">
        <table role="presentation"><tr><td style="font-size:28px;width:42px;">${escapeHtml(label.icon)}</td><td><strong style="font-size:16px;">${escapeHtml(label.name)}</strong><br><span style="font-size:12px;color:${BRAND.muted};">${escapeHtml(symbol.replace("THB", "/THB").replace("USD", "/USD").replace(/^\//, ""))}</span></td></tr></table>
      </td>
      <td align="center" style="padding:13px 10px;border-bottom:1px solid #edf2f4;">${miniChart(decision.tone)}</td>
      <td style="padding:13px 14px;border-bottom:1px solid #edf2f4;">
        <span style="display:inline-block;background:${color.bg};color:${color.color};border-radius:999px;padding:7px 10px;font-weight:900;font-size:13px;">${escapeHtml(decision.title)}</span><br>
        <span style="font-size:12px;color:${BRAND.muted};">${escapeHtml(decision.short)} · ${percent}%</span>
      </td>
    </tr>`;
}

function renderPlusEmail({ locale, copy, signalMap, dashboardUrl, unsubscribeUrl, planName }) {
  const thai = localeKey(locale) === "th";
  const rows = symbolsForPlan("plus").map((symbol) => watchRow(symbol, signalMap[symbol], locale)).join("");
  const body = `
    ${cardStart(820)}
      <tr><td style="padding:30px 34px 10px;">${logo(copy.pill)}</td></tr>
      <tr>
        <td style="padding:0 34px 18px;">
          <table role="presentation" width="100%"><tr>
            <td>
              <h1 style="font-size:40px;line-height:1.1;letter-spacing:-.04em;margin:18px 0 8px;color:${BRAND.ink};">${escapeHtml(copy.headline)}</h1>
              <p style="font-size:16px;line-height:1.55;color:${BRAND.muted};margin:0;">${escapeHtml(copy.subhead)}</p>
              <div style="display:inline-block;margin-top:16px;background:${BRAND.wash};color:${BRAND.teal};border-radius:999px;padding:8px 12px;font-size:13px;font-weight:900;">◷ ${thai ? "หน้าต่าง 5 วันทำการ" : "Five-business-day window"}</div>
            </td>
            <td align="right" width="210">${miniChart("teal")}<div style="font-size:44px;color:${BRAND.teal};font-weight:900;">✓</div></td>
          </tr></table>
        </td>
      </tr>
      <tr>
        <td style="padding:0 34px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${BRAND.line};border-radius:14px;overflow:hidden;">${rows}</table>
        </td>
      </tr>
      <tr><td align="center" style="padding:25px 34px 0;">${ctaButton(copy.cta, dashboardUrl, "300px")}</td></tr>
      <tr>
        <td style="padding:22px 34px 0;">
          <div style="border:1px solid ${BRAND.line};border-radius:14px;background:#fbfdfe;padding:16px;text-align:center;color:${BRAND.muted};font-size:13px;">
            ${thai ? "อัปเกรดเป็น Pro เพื่อเพิ่มเรดาร์ทองคำ บิตคอยน์ และภาพรวมหลายสินทรัพย์ในอีเมลเดียว" : "Upgrade to Pro to add gold, bitcoin, and a wider multi-asset radar in one email."}
          </div>
        </td>
      </tr>
      <tr><td>${footer({ locale, unsubscribeUrl, planName })}</td></tr>
    </table>`;

  return emailShell({ locale, subject: copy.subject, preheader: copy.subhead, body });
}

function groupCard(title, symbols, signalMap, locale) {
  const rows = symbols.map((symbol) => {
    const signal = signalMap[symbol];
    const decision = decisionForSignal(signal, locale, signal?.userDirection || {});
    const color = toneColor(decision.tone);
    return `<tr><td style="padding:10px 0;border-bottom:1px solid #edf2f4;font-size:13px;">${escapeHtml(labelForSymbol(symbol, locale).name)}</td><td align="center" style="padding:10px 0;border-bottom:1px solid #edf2f4;"><span style="background:${color.bg};color:${color.color};border-radius:8px;padding:6px 8px;font-weight:900;font-size:12px;">${escapeHtml(decision.title)}</span></td><td align="right" style="padding:10px 0;border-bottom:1px solid #edf2f4;font-weight:900;">${percentFromSignal(signal)}%</td></tr>`;
  }).join("");

  return `<td valign="top" width="33.33%" style="padding:8px;">
    <div style="border:1px solid ${BRAND.line};border-radius:14px;background:#fff;padding:16px;min-height:220px;">
      <h3 style="margin:0 0 10px;font-size:19px;color:${BRAND.ink};">${escapeHtml(title)}</h3>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}</table>
    </div>
  </td>`;
}

function renderProEmail({ locale, copy, signalMap, dashboardUrl, unsubscribeUrl, planName }) {
  const thai = localeKey(locale) === "th";
  const body = `
    ${cardStart(820)}
      <tr><td style="padding:26px 30px 12px;">${logo(copy.pill)}</td></tr>
      <tr>
        <td style="padding:0 30px;">
          <div style="background:#082b31;border-radius:16px;padding:28px 28px;color:#fff;overflow:hidden;">
            <table role="presentation" width="100%"><tr>
              <td>
                <div style="display:inline-block;background:rgba(20,184,166,.18);border-radius:999px;padding:8px 12px;font-size:13px;font-weight:900;color:#8ff4e8;">◎ Full Timing Radar</div>
                <h1 style="font-size:36px;line-height:1.15;letter-spacing:-.04em;margin:18px 0 8px;">${escapeHtml(copy.headline)}</h1>
                <p style="font-size:16px;line-height:1.55;color:#d4f7f4;margin:0;">${escapeHtml(copy.subhead)}</p>
              </td>
              <td align="right" width="220"><div style="font-size:130px;line-height:1;color:#12d6c6;">◖</div></td>
            </tr></table>
          </div>
          <div style="font-size:13px;color:${BRAND.muted};font-weight:800;margin-top:14px;">☷ ${escapeHtml(copy.date)} · ${thai ? "ค่าความเชื่อมั่นอ้างอิงจากข้อมูลย้อนหลัง" : "Confidence references historical context"}</div>
        </td>
      </tr>
      <tr>
        <td style="padding:20px 22px 0;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
            ${groupCard(thai ? "ค่าเงิน" : "Currencies", ["USDTHB", "EURTHB", "JPYTHB"], signalMap, locale)}
            ${groupCard(thai ? "ทองคำ" : "Gold", ["XAUUSD", "XAUTHB"], signalMap, locale)}
            ${groupCard(thai ? "บิตคอยน์" : "Bitcoin", ["BTCUSD", "BTCTHB"], signalMap, locale)}
          </tr></table>
        </td>
      </tr>
      <tr>
        <td style="padding:18px 30px 0;">
          <div style="border:1px solid ${BRAND.line};border-radius:14px;padding:16px;">
            <h3 style="margin:0 0 10px;font-size:20px;">${thai ? "ย้อนหลังสั้น ๆ (Replay)" : "Short replay"}</h3>
            <table role="presentation" width="100%" style="font-size:13px;color:${BRAND.ink};">
              <tr><td>22 พ.ค. 67</td><td>USD/THB</td><td style="color:${BRAND.green};font-weight:900;">แข็งค่าขึ้น +0.89%</td><td align="right">70%</td></tr>
              <tr><td>21 พ.ค. 67</td><td>XAU/USD</td><td style="color:${BRAND.amber};font-weight:900;">แกว่งตัวในกรอบ</td><td align="right">59%</td></tr>
              <tr><td>20 พ.ค. 67</td><td>BTC/USD</td><td style="color:${BRAND.green};font-weight:900;">ปรับขึ้น +2.31%</td><td align="right">66%</td></tr>
            </table>
          </div>
        </td>
      </tr>
      <tr><td align="center" style="padding:25px 30px 0;">${ctaButton(copy.cta, dashboardUrl, "300px")}</td></tr>
      <tr><td>${footer({ locale, unsubscribeUrl, planName })}</td></tr>
    </table>`;

  return emailShell({ locale, subject: copy.subject, preheader: copy.subhead, body, outerBg: "#eaf6f7" });
}

function renderBusinessEmail({ locale, copy, dashboardUrl, unsubscribeUrl, planName }) {
  const thai = localeKey(locale) === "th";
  const body = `
    ${cardStart(840)}
      <tr><td style="padding:30px 34px 10px;">${logo(copy.pill)}</td></tr>
      <tr>
        <td style="padding:0 34px 18px;">
          <h1 style="font-size:36px;line-height:1.15;letter-spacing:-.04em;margin:22px 0 8px;color:${BRAND.ink};">${escapeHtml(copy.headline)}</h1>
          <p style="font-size:16px;color:${BRAND.muted};line-height:1.55;margin:0;">${escapeHtml(copy.subhead)}</p>
          <div style="margin-top:14px;color:${BRAND.teal};font-size:13px;font-weight:900;">☷ ${escapeHtml(copy.date)}</div>
          <div style="margin-top:18px;background:#eff7fb;border:1px solid #d9e8ed;border-radius:16px;padding:18px;">
            <table role="presentation" width="100%">
              <tr>
                ${[
                  thai ? ["ยอดรวมใบแจ้งหนี้ที่ติดตาม", "USD 148,250.00", "อ้างอิงเรทล่าสุด 36.72"] : ["Tracked invoice total", "USD 148,250.00", "Latest reference 36.72"],
                  thai ? ["วันครบกำหนดใกล้สุด", "10 มิ.ย. 2569", "อีก 8 วัน"] : ["Nearest due date", "Jun 10, 2026", "8 days left"],
                  thai ? ["ความเสี่ยงจากค่าเงิน", "ผันผวนต่ำ", "7 วัน +0.52%"] : ["Currency exposure", "Low movement", "7 days +0.52%"],
                  thai ? ["สถานะความเสี่ยง", "รอก่อน", "ยังไม่ต้องรีบ"] : ["Risk status", "Wait", "No rush yet"]
                ].map(([title, main, sub], index) => `<td width="25%" valign="top" style="padding:${index === 0 ? "0 16px 0 0" : "0 16px"};border-left:${index === 0 ? "0" : "1px solid #cbdeec"};">
                  <div style="font-size:12px;color:${BRAND.muted};font-weight:800;">${escapeHtml(title)}</div>
                  <div style="font-size:${index === 0 ? "24px" : "20px"};font-weight:900;color:${index === 3 ? BRAND.green : BRAND.teal};margin-top:9px;">${escapeHtml(main)}</div>
                  <div style="font-size:12px;color:${BRAND.muted};margin-top:7px;">${escapeHtml(sub)}</div>
                </td>`).join("")}
              </tr>
            </table>
          </div>
        </td>
      </tr>
      <tr>
        <td style="padding:0 34px;">
          <h2 style="font-size:20px;margin:10px 0;color:${BRAND.ink};">▦ ${thai ? "ใบแจ้งหนี้ที่น่าติดตาม" : "Invoices to monitor"}</h2>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${BRAND.line};border-radius:12px;overflow:hidden;font-size:13px;color:${BRAND.ink};">
            <tr style="background:#eff7fb;">${["Supplier", "Currency", "Amount", "Due Date", "Estimated Cost Impact*"].map((head) => `<th align="left" style="padding:12px 14px;border-bottom:1px solid ${BRAND.line};">${head}</th>`).join("")}</tr>
            ${[
              ["ABC Components Ltd.", "USD", "68,250.00", thai ? "31 พ.ค. 2569" : "May 31", "↓ -1,120.45 THB"],
              ["Global Packaging Inc.", "EUR", "42,130.00", thai ? "6 มิ.ย. 2569" : "Jun 6", "↑ +1,874.32 THB"],
              ["Oceanic Materials Co.", "USD", "37,870.00", thai ? "15 มิ.ย. 2569" : "Jun 15", "↓ -612.18 THB"]
            ].map((row) => `<tr>${row.map((cell, index) => `<td style="padding:13px 14px;border-bottom:1px solid #edf2f4;color:${index === 4 && cell.includes("+") ? BRAND.rose : index === 4 ? BRAND.green : BRAND.ink};font-weight:${index === 4 ? "900" : "500"};">${escapeHtml(cell)}</td>`).join("")}</tr>`).join("")}
          </table>
          <div style="margin-top:18px;border:1px solid #f0dfb8;background:#fff9e8;border-radius:14px;padding:16px;color:#8a5a05;font-size:14px;line-height:1.6;">
            <strong>🔔 ${thai ? "แจ้งเตือนสำหรับทีมบัญชี/การเงิน" : "Finance team note"}</strong><br>
            ${thai ? "อัตราแลกเปลี่ยนมีความผันผวนเล็กน้อยในช่วง 7 วันที่ผ่านมา แนะนำติดตามอย่างใกล้ชิด โดยเฉพาะใบแจ้งหนี้ที่ครบกำหนดภายใน 2 สัปดาห์" : "Currency movement has been mild over the last 7 days. Keep a close eye on invoices due within the next two weeks."}
          </div>
        </td>
      </tr>
      <tr><td align="center" style="padding:25px 34px 0;">${ctaButton(copy.cta, dashboardUrl, "310px")}</td></tr>
      <tr>
        <td style="padding:18px 34px 0;">
          <div style="background:#eef7ff;border:1px solid #dbeafe;border-radius:12px;padding:14px;color:#475569;font-size:12px;line-height:1.65;">
            * ${thai ? "Estimated Cost Impact คำนวณจากการเปลี่ยนแปลงของอัตราแลกเปลี่ยนเทียบกับเรทอ้างอิง ณ วันที่สร้างใบแจ้งหนี้ ตัวเลขเป็นการประมาณการ อาจเปลี่ยนแปลงได้ตามอัตราแลกเปลี่ยนจริง" : "Estimated Cost Impact compares current reference rates to invoice reference rates. Figures are estimates and may differ from actual provider rates."}
          </div>
        </td>
      </tr>
      <tr><td>${footer({ locale, unsubscribeUrl, planName })}</td></tr>
    </table>`;

  return emailShell({ locale, subject: copy.subject, preheader: copy.subhead, body, outerBg: "#f6fbfd" });
}

function disclaimer(locale = "th") {
  return localeKey(locale) === "th"
    ? "ข้อมูลในอีเมลนี้จัดทำเพื่อสนับสนุนการตัดสินใจจากข้อมูลย้อนหลังเท่านั้น ไม่ใช่คำแนะนำการลงทุน ไม่ใช่คำสั่งซื้อขายหรือการทำธุรกรรม และไม่ยืนยันผลลัพธ์ในอนาคต โปรดตรวจสอบเรท ค่าธรรมเนียม และสเปรดจริงกับผู้ให้บริการก่อนตัดสินใจ"
    : "This email is decision-support information based on historical data only. It is not financial advice, investment advice, trading instruction, or a confirmation of future rates. Please verify provider rates, fees, and spreads before making decisions.";
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
  const args = { locale: language, copy, signalMap, dashboardUrl: resolvedDashboardUrl, unsubscribeUrl, planName };

  let html;
  if (planId === "plus") {
    html = renderPlusEmail(args);
  } else if (planId === "pro") {
    html = renderProEmail(args);
  } else if (planId === "business") {
    html = renderBusinessEmail(args);
  } else {
    html = renderFreeEmail(args);
  }

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
