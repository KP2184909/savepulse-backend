"use strict";

const { ACTIONS, TRACKED_ASSETS, applyAutoDemotion, createDefaultSignal } = require("./signalEngine");
const { ADVANCED_ASSETS, FIAT_ASSETS, normalizePlan, planFor } = require("./plans");

const DEFAULT_APP_URL = "https://savepulse.cloud";
const UNSUBSCRIBE_PLACEHOLDER = "{{unsubscribe_url}}";
const BANNED_EMAIL_WORDS_TH = Object.freeze(["สัญญาณซื้อ", "กำไร", "รับประกัน", "ต้องเข้า", "จุดเข้า"]);

const ASSET_LABELS = Object.freeze({
  USDTHB: {
    icon: "$",
    th: "คนมีเงินดอลลาร์ อยากแลกกลับเป็นเงินบาท",
    en: "Holding US dollars, want Thai baht"
  },
  JPYTHB: {
    icon: "¥",
    th: "คนมีเงินบาท อยากแลกเป็นเงินเยน",
    en: "Holding Thai baht, want Japanese yen"
  },
  EURTHB: {
    icon: "€",
    th: "คนมีเงินบาท อยากแลกเป็นเงินยูโร",
    en: "Holding Thai baht, want euros"
  },
  XAUTHB: {
    icon: "Au",
    th: "คนมีเงินบาท อยากวางแผนทองคำ",
    en: "Holding Thai baht, watching gold"
  },
  BTCTHB: {
    icon: "B",
    th: "คนมีเงินบาท อยากวางแผนบิตคอยน์",
    en: "Holding Thai baht, watching bitcoin"
  },
  USDJPY: {
    icon: "¥",
    th: "คนมีเงินดอลลาร์ อยากแลกเป็นเงินเยน",
    en: "Holding US dollars, want Japanese yen"
  },
  EURUSD: {
    icon: "€",
    th: "คนมีเงินดอลลาร์ อยากแลกเป็นเงินยูโร",
    en: "Holding US dollars, want euros"
  },
  XAUUSD: {
    icon: "Au",
    th: "คนมีเงินดอลลาร์ อยากวางแผนทองคำ",
    en: "Holding US dollars, watching gold"
  },
  BTCUSD: {
    icon: "B",
    th: "คนมีเงินดอลลาร์ อยากวางแผนบิตคอยน์",
    en: "Holding US dollars, watching bitcoin"
  }
});

const PLAN_COPY = Object.freeze({
  free: {
    th: {
      name: "Free",
      emailName: "Daily Pulse Lite",
      subject: "SavePulse Daily Pulse Lite: ข้อสังเกตวันนี้",
      eyebrow: "ข้อสังเกตวันนี้แบบ Lite",
      headline: "มีบางรายการเริ่มน่าจับตา แต่ข้อมูลเต็มยังล็อกไว้",
      fomo:
        "หลายคนมาเช็กอีกทีตอนเรทขยับไปแล้ว การเห็นภาพรวมตั้งแต่เช้าช่วยให้ไม่ตัดสินใจแบบเดาสุ่ม",
      cta: "ดูสถานะฟรีวันนี้",
      upgrade: "ปลดล็อก Plus เพื่อดูหลายรายการขึ้นและรับการ์ดตัดสินใจแบบละเอียด"
    },
    en: {
      name: "Free",
      emailName: "Daily Pulse Lite",
      subject: "SavePulse Daily Pulse Lite: Today's watch note",
      eyebrow: "Today's Lite Watch Note",
      headline: "One item is worth watching, but the full view is still locked",
      fomo:
        "Many people check again after the rate has already moved. A morning snapshot helps you avoid blind decisions.",
      cta: "Open today's free view",
      upgrade: "Unlock Plus for more watchlist items and a clearer daily decision card"
    }
  },
  plus: {
    th: {
      name: "Plus",
      emailName: "Daily Decision Card",
      subject: "SavePulse Plus: การ์ดตัดสินใจวันนี้",
      eyebrow: "การ์ดตัดสินใจประจำวัน",
      headline: "รายการที่คุณเฝ้าอยู่มีสถานะอัปเดตแล้ว",
      fomo:
        "จังหวะเรทที่ดูดีมักไม่รอคนที่ลืมเช็ก วันนี้เปิดดูไม่ถึงหนึ่งนาที แต่อาจช่วยให้คุณวางแผนดีขึ้น",
      cta: "เปิดการ์ดตัดสินใจ",
      upgrade: "อัปเกรดเป็น Pro เพื่อเพิ่มทองคำ บิตคอยน์ และเรดาร์หลายสินทรัพย์"
    },
    en: {
      name: "Plus",
      emailName: "Daily Decision Card",
      subject: "SavePulse Plus: Your daily decision card",
      eyebrow: "Daily Decision Card",
      headline: "Your watchlist has fresh status updates",
      fomo:
        "Better-looking rate windows rarely wait for people who forget to check. One minute today can improve your planning.",
      cta: "Open decision card",
      upgrade: "Upgrade to Pro for gold, bitcoin, and a wider timing radar"
    }
  },
  pro: {
    th: {
      name: "Pro",
      emailName: "Full Timing Radar",
      subject: "SavePulse Pro: เรดาร์สินทรัพย์วันนี้",
      eyebrow: "Full Timing Radar",
      headline: "ค่าเงิน ทองคำ และบิตคอยน์ถูกสรุปไว้ในหน้าเดียว",
      fomo:
        "คนที่ดูเฉพาะราคา มักพลาดภาพของจังหวะ วันนี้เราสรุปโซนที่ควรจับตาและโซนที่ควรระวังให้แล้ว",
      cta: "เปิด Full Radar",
      upgrade: "คุณอยู่ในแพ็กเกจ Pro แล้ว"
    },
    en: {
      name: "Pro",
      emailName: "Full Timing Radar",
      subject: "SavePulse Pro: Today's timing radar",
      eyebrow: "Full Timing Radar",
      headline: "Currencies, gold, and bitcoin summarized in one view",
      fomo:
        "People who only look at price often miss the timing context. Today's radar separates watch zones from caution zones.",
      cta: "Open Full Radar",
      upgrade: "You are already on Pro"
    }
  },
  business: {
    th: {
      name: "Business",
      emailName: "Invoice Risk Brief",
      subject: "SavePulse Business: สรุปความเสี่ยงต้นทุนวันนี้",
      eyebrow: "Invoice Risk Brief",
      headline: "ค่าเงินวันนี้ถูกแปลเป็นผลกระทบต่อต้นทุนธุรกิจ",
      fomo:
        "สำหรับใบแจ้งหนี้ต่างประเทศ การขยับเพียงเล็กน้อยของค่าเงินอาจเปลี่ยนต้นทุนทั้งเดือนโดยที่ทีมไม่รู้ตัว",
      cta: "เปิด Invoice Dashboard",
      upgrade: "คุณอยู่ในแพ็กเกจ Business แล้ว"
    },
    en: {
      name: "Business",
      emailName: "Invoice Risk Brief",
      subject: "SavePulse Business: Today's invoice cost brief",
      eyebrow: "Invoice Risk Brief",
      headline: "Today's currency moves translated into business cost exposure",
      fomo:
        "For overseas invoices, a small currency move can quietly change the month's cost before the team notices.",
      cta: "Open Invoice Dashboard",
      upgrade: "You are already on Business"
    }
  }
});

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function localeKey(locale) {
  return locale === "en" ? "en" : "th";
}

function formatNumber(value, locale = "th") {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return "--";
  }

  return number.toLocaleString(locale === "en" ? "en-US" : "th-TH", {
    maximumFractionDigits: number >= 100 ? 0 : 4
  });
}

function labelForSymbol(symbol, locale = "th") {
  const labels = ASSET_LABELS[symbol] || {
    icon: "?",
    th: "รายการที่ SavePulse เฝ้าให้",
    en: "A SavePulse watch item"
  };

  return {
    icon: labels.icon,
    text: labels[localeKey(locale)]
  };
}

function decisionForSignal(signal, locale = "th") {
  const effective = applyAutoDemotion(signal) || createDefaultSignal("JPYTHB");
  const action = effective.action;
  const thai = localeKey(locale) === "th";

  if (action === ACTIONS.STRONG_BUY || action === ACTIONS.BUY_ZONE) {
    return {
      tone: "teal",
      badge: thai ? "เริ่มน่าสนใจ" : "Worth watching",
      title: thai ? "จังหวะที่ควรจับตา" : "Window worth checking",
      body: thai
        ? "สถานะล่าสุดอยู่ในช่วงที่ลดความเสี่ยงเสียใจภายหลังได้ดีกว่าปกติ ถ้าวางแผนไว้อยู่แล้วให้เช็กการ์ดวันนี้"
        : "The latest status is in a comparatively lower-regret area. If this was already in your plan, review today's card."
    };
  }

  if (action === ACTIONS.SELL_ZONE) {
    return {
      tone: "rose",
      badge: thai ? "ควรระวัง" : "Use caution",
      title: thai ? "ค่อนข้างเสียเปรียบ" : "Less favorable today",
      body: thai
        ? "สถานะวันนี้มีความเสี่ยงเสียใจภายหลังสูงขึ้น เหมาะกับการชะลออารมณ์และกลับไปดูแผนก่อนตัดสินใจ"
        : "Today's status carries higher regret risk. It is better used as a pause-and-review prompt."
    };
  }

  return {
    tone: "amber",
    badge: thai ? "รอก่อน" : "Wait",
    title: thai ? "ยังไม่รีบตัดสินใจ" : "No rush today",
    body: thai
      ? "ยังไม่เห็นช่วงที่ชัดพอสำหรับการตัดสินใจแบบมั่นใจ ถ้าไม่รีบ การเฝ้าต่อยังมีประโยชน์"
      : "There is no clear low-regret window yet. If timing is flexible, continued monitoring still helps."
  };
}

function percentileText(signal, locale = "th") {
  const effective = applyAutoDemotion(signal);
  const percent = effective?.percentile?.percent;

  if (!Number.isFinite(percent)) {
    return localeKey(locale) === "th" ? "รอข้อมูลรอบถัดไป" : "Waiting for next data point";
  }

  return localeKey(locale) === "th"
    ? `ถูกกว่าประมาณ ${percent}% ของช่วง 90 วันที่ผ่านมา`
    : `Cheaper than about ${percent}% of the last 90 days`;
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

  return TRACKED_ASSETS.map((symbol, index) => ({
    ...createDefaultSignal(symbol),
    id: `${symbol}-daily-preview`,
    action: actions[symbol] || ACTIONS.WAIT_ZONE,
    price: [32.62, 0.2029, 37.92, 147706, 2499918, 159.2, 1.16, 4529, 76670][index],
    percentile: { percent: [54, 21, 47, 88, 82, 61, 72, 91, 58][index] },
    receivedAt: new Date("2026-05-29T07:00:00+07:00").toISOString()
  }));
}

function signalsBySymbol(inputSignals = []) {
  const defaults = Object.fromEntries(sampleSignals().map((signal) => [signal.symbol, signal]));

  for (const signal of inputSignals) {
    if (signal?.symbol) {
      defaults[String(signal.symbol).toUpperCase()] = signal;
    }
  }

  return defaults;
}

function visibleSymbolsForPlan(plan) {
  const planId = normalizePlan(plan);

  if (planId === "free") {
    return ["JPYTHB"];
  }

  if (planId === "plus") {
    return FIAT_ASSETS;
  }

  return TRACKED_ASSETS;
}

function lockedSymbolsForPlan(plan) {
  const planId = normalizePlan(plan);

  if (planId === "free") {
    return ["USDTHB", "EURTHB", "USDJPY", "EURUSD", ...ADVANCED_ASSETS];
  }

  if (planId === "plus") {
    return ADVANCED_ASSETS;
  }

  return [];
}

function statusRow(signal, locale = "th", locked = false) {
  const thai = localeKey(locale) === "th";
  const label = labelForSymbol(signal.symbol, locale);
  const decision = decisionForSignal(signal, locale);
  const priceLabel = thai ? "ราคาอ้างอิง" : "Reference";
  const lockLabel = thai ? "เฉพาะ Pro" : "Pro only";
  const subtitle = locked ? (thai ? "ปลดล็อกเพื่อดูสถานะเต็ม" : "Unlock to view full status") : decision.body;
  const badge = locked ? lockLabel : decision.badge;
  const toneColor = locked
    ? "#334155"
    : decision.tone === "teal"
      ? "#0f766e"
      : decision.tone === "rose"
        ? "#be123c"
        : "#b45309";
  const badgeBg = locked
    ? "#e2e8f0"
    : decision.tone === "teal"
      ? "#dff8ee"
      : decision.tone === "rose"
        ? "#ffe4e6"
        : "#fef3c7";

  return `
    <tr>
      <td style="padding:14px 0;border-bottom:1px solid #e7eef0;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td width="52" valign="top">
              <div style="width:40px;height:40px;border-radius:999px;background:#e8fbfa;color:#0f172a;font-size:17px;font-weight:800;line-height:40px;text-align:center;">${escapeHtml(label.icon)}</div>
            </td>
            <td valign="top">
              <div style="font-size:15px;font-weight:800;color:#0f172a;line-height:1.35;">${escapeHtml(label.text)}</div>
              <div style="font-size:12px;color:#64748b;line-height:1.55;margin-top:3px;">${escapeHtml(subtitle)}</div>
              ${
                locked
                  ? ""
                  : `<div style="font-size:11px;color:#64748b;margin-top:7px;">${escapeHtml(priceLabel)}: ${escapeHtml(formatNumber(signal.price, locale))} · ${escapeHtml(percentileText(signal, locale))}</div>`
              }
            </td>
            <td width="118" align="right" valign="top">
              <span style="display:inline-block;border-radius:999px;background:${badgeBg};color:${toneColor};font-size:12px;font-weight:800;padding:8px 13px;">${escapeHtml(badge)}</span>
            </td>
          </tr>
        </table>
      </td>
    </tr>`;
}

function businessInvoiceBlock(locale = "th") {
  const thai = localeKey(locale) === "th";
  const amount = thai ? "50,000 ดอลลาร์" : "USD 50,000";
  return `
    <div style="border:1px solid #cfe7ea;background:#f7feff;border-radius:16px;padding:18px;margin:18px 0;">
      <div style="font-size:12px;font-weight:900;color:#0f766e;text-transform:uppercase;letter-spacing:.06em;">${thai ? "ตัวอย่างใบแจ้งหนี้" : "Invoice example"}</div>
      <h3 style="margin:8px 0 8px;font-size:20px;color:#0f172a;">${thai ? `ใบแจ้งหนี้ ${amount} ที่ครบกำหนดใน 14 วัน` : `${amount} invoice due in 14 days`}</h3>
      <p style="margin:0;color:#475569;font-size:14px;line-height:1.65;">${
        thai
          ? "ถ้าค่าเงินขยับ 1% ต้นทุนโดยประมาณจะเปลี่ยนราว 500 ดอลลาร์ ทีมจึงควรเห็นสถานะก่อนถึงวันชำระจริง"
          : "A 1% currency move changes estimated cost by about USD 500, so the team should see status before the payment date."
      }</p>
    </div>`;
}

function disclaimer(locale = "th") {
  return localeKey(locale) === "th"
    ? "SavePulse เป็นเครื่องมือช่วยประกอบการตัดสินใจจากข้อมูลอัตราแลกเปลี่ยนย้อนหลัง ไม่ใช่คำแนะนำการลงทุน ไม่ใช่คำสั่งซื้อขาย และไม่ใช่การยืนยันผลลัพธ์ในอนาคต ราคาจริง ค่าธรรมเนียม และส่วนต่างอาจแตกต่างตามผู้ให้บริการ"
    : "SavePulse provides decision-support information based on historical exchange-rate data. It is not financial advice, investment advice, trading instruction, or a promise of future rates. Actual rates, fees, and spreads may vary by provider.";
}

function textFromHtml(html) {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
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
  const visibleRows = visibleSymbolsForPlan(planId).map((symbol) => signalMap[symbol] || createDefaultSignal(symbol));
  const lockedRows = lockedSymbolsForPlan(planId).map((symbol) => signalMap[symbol] || createDefaultSignal(symbol));
  const thai = language === "th";
  const planConfig = planFor(planId);
  const generatedAt = thai ? "อัปเดตเช้านี้" : "Updated this morning";

  const html = `<!doctype html>
<html lang="${language}">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(copy.subject)}</title>
  </head>
  <body style="margin:0;background:#eef8f9;font-family:Arial,'Helvetica Neue',sans-serif;color:#0f172a;">
    <div style="display:none;max-height:0;overflow:hidden;">${escapeHtml(copy.fomo)}</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef8f9;padding:26px 14px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:680px;background:#ffffff;border:1px solid #d7eaed;border-radius:22px;overflow:hidden;box-shadow:0 22px 55px rgba(15,118,110,.13);">
            <tr>
              <td style="padding:28px 30px;background:linear-gradient(135deg,#0f766e,#0891b2);color:#ffffff;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                  <tr>
                    <td>
                      <div style="font-size:22px;font-weight:900;letter-spacing:-.02em;">SavePulse</div>
                      <div style="font-size:12px;opacity:.85;margin-top:4px;">${escapeHtml(copy.emailName)} · ${escapeHtml(copy.name)}</div>
                    </td>
                    <td align="right" style="font-size:12px;font-weight:800;">${escapeHtml(generatedAt)}</td>
                  </tr>
                </table>
                <div style="font-size:12px;font-weight:900;text-transform:uppercase;letter-spacing:.08em;opacity:.86;margin-top:28px;">${escapeHtml(copy.eyebrow)}</div>
                <h1 style="font-size:30px;line-height:1.18;margin:8px 0 0;letter-spacing:-.03em;">${escapeHtml(copy.headline)}</h1>
              </td>
            </tr>
            <tr>
              <td style="padding:26px 30px 8px;">
                <div style="border:1px solid #fde68a;background:#fffbeb;border-radius:16px;padding:15px 17px;color:#78350f;font-size:14px;line-height:1.6;font-weight:700;">
                  ${escapeHtml(copy.fomo)}
                </div>
                ${
                  planId === "business"
                    ? businessInvoiceBlock(language)
                    : ""
                }
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:16px;">
                  ${visibleRows.map((signal) => statusRow(signal, language)).join("")}
                  ${lockedRows.slice(0, planId === "free" ? 3 : 4).map((signal) => statusRow(signal, language, true)).join("")}
                </table>
                ${
                  lockedRows.length > 0
                    ? `<p style="margin:18px 0 0;color:#64748b;font-size:13px;line-height:1.6;">${escapeHtml(copy.upgrade)}</p>`
                    : ""
                }
                <div style="margin:24px 0 0;">
                  <a href="${escapeHtml(dashboardUrl)}" style="display:inline-block;background:#0f766e;color:#ffffff;text-decoration:none;border-radius:14px;padding:14px 20px;font-size:15px;font-weight:900;">${escapeHtml(copy.cta)}</a>
                </div>
              </td>
            </tr>
            <tr>
              <td style="padding:22px 30px 28px;">
                <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:14px;padding:14px 16px;color:#64748b;font-size:12px;line-height:1.65;">
                  ${escapeHtml(disclaimer(language))}
                </div>
                <p style="font-size:12px;color:#64748b;line-height:1.6;margin:16px 0 0;">
                  ${thai ? "ไม่ต้องการรับอีเมลรายวันแล้ว?" : "No longer want daily emails?"}
                  <a href="${escapeHtml(unsubscribeUrl)}" style="color:#0f766e;font-weight:800;">${thai ? "ยกเลิกรับอีเมล" : "Unsubscribe"}</a>
                </p>
                <p style="font-size:11px;color:#94a3b8;margin:12px 0 0;">© 2026 SavePulse Analytics Network · ${escapeHtml(planConfig.name)}</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

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
  const links = ["free", "plus", "pro", "business"]
    .map((plan) => {
      const copy = PLAN_COPY[plan][language];
      return `<a href="/email-preview/${plan}?lang=${language}" style="display:block;border:1px solid #d7eaed;background:#fff;border-radius:16px;padding:18px;text-decoration:none;color:#0f172a;margin:10px 0;"><strong>${escapeHtml(copy.name)}</strong><br><span style="color:#64748b;">${escapeHtml(copy.emailName)}</span></a>`;
    })
    .join("");

  return `<!doctype html>
<html lang="${language}">
  <head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>SavePulse Email Preview</title></head>
  <body style="margin:0;background:#eef8f9;font-family:Arial,sans-serif;color:#0f172a;">
    <main style="max-width:680px;margin:0 auto;padding:42px 18px;">
      <h1 style="font-size:36px;margin:0 0 8px;">SavePulse Email Preview</h1>
      <p style="color:#64748b;line-height:1.6;margin:0 0 24px;">${thai ? "เลือกแพ็กเกจเพื่อดูตัวอย่างอีเมลรายวัน ยังไม่มีการส่งอีเมลจริง" : "Choose a plan to preview the daily email. No real emails are sent."}</p>
      ${links}
    </main>
  </body>
</html>`;
}

module.exports = {
  BANNED_EMAIL_WORDS_TH,
  buildDailyDigestEmail,
  buildEmailPreviewIndex,
  disclaimer,
  sampleSignals
};