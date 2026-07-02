"use strict";

const { isThaiAsset } = require("./signalEngine");
const { buildDailyDigestEmail } = require("./dailyDigestEmail");

const DEFAULT_DASHBOARD_URL = "https://savepulse-backend.onrender.com";

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function loadNodemailer() {
  try {
    return require("nodemailer");
  } catch (error) {
    return null;
  }
}

function smtpTransportConfigured(env = process.env) {
  return Boolean(env.SMTP_HOST && env.SMTP_PORT && env.SMTP_USER && env.SMTP_PASS);
}

function apiProviderForEnv(env = process.env) {
  const requestedProvider = String(env.EMAIL_PROVIDER || "").trim().toLowerCase();
  const providers = {
    brevo: Boolean(env.BREVO_API_KEY || env.SENDINBLUE_API_KEY),
    resend: Boolean(env.RESEND_API_KEY),
    mailjet: Boolean(env.MAILJET_API_KEY && env.MAILJET_SECRET_KEY),
    smtp: smtpTransportConfigured(env)
  };

  if (requestedProvider) {
    return providers[requestedProvider] ? requestedProvider : "";
  }

  if (providers.brevo) return "brevo";
  if (providers.resend) return "resend";
  if (providers.mailjet) return "mailjet";
  if (providers.smtp) return "smtp";
  return "";
}

function smtpConfigured(env = process.env) {
  return Boolean(apiProviderForEnv(env));
}

function parseFromAddress(fromValue, fallbackEmail = "") {
  const raw = String(fromValue || fallbackEmail || "").trim();
  const angleMatch = raw.match(/^(.*?)<([^>]+)>$/);

  if (angleMatch) {
    return {
      name: angleMatch[1].trim().replace(/^"|"$/g, "") || "SavePulse",
      email: angleMatch[2].trim()
    };
  }

  return {
    name: "SavePulse",
    email: raw
  };
}

function defaultFrom(env = process.env) {
  return env.FROM_EMAIL || env.SMTP_USER || env.BREVO_FROM_EMAIL || env.RESEND_FROM_EMAIL || "SavePulse <alerts@savepulse.cloud>";
}

function appUrl(env = process.env) {
  return env.PUBLIC_URL || env.APP_BASE_URL || env.DASHBOARD_URL || DEFAULT_DASHBOARD_URL;
}

async function sendBrevoMail({ from, to, subject, text, html }, env = process.env) {
  const sender = parseFromAddress(from, env.BREVO_FROM_EMAIL);
  const response = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      accept: "application/json",
      "api-key": env.BREVO_API_KEY || env.SENDINBLUE_API_KEY,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      sender,
      to: [{ email: to }],
      subject,
      htmlContent: html,
      textContent: text
    })
  });
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(payload.message || payload.error || `Brevo email failed with ${response.status}`);
  }

  return { messageId: payload.messageId || payload.messageIds?.[0] || "" };
}

async function sendResendMail({ from, to, subject, text, html }, env = process.env) {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${env.RESEND_API_KEY}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject,
      html,
      text
    })
  });
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(payload.message || payload.error?.message || `Resend email failed with ${response.status}`);
  }

  return { messageId: payload.id || "" };
}

async function sendMailjetMail({ from, to, subject, text, html }, env = process.env) {
  const sender = parseFromAddress(from, env.MAILJET_FROM_EMAIL);
  const auth = Buffer.from(`${env.MAILJET_API_KEY}:${env.MAILJET_SECRET_KEY}`).toString("base64");
  const response = await fetch("https://api.mailjet.com/v3.1/send", {
    method: "POST",
    headers: {
      authorization: `Basic ${auth}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      Messages: [
        {
          From: { Email: sender.email, Name: sender.name },
          To: [{ Email: to }],
          Subject: subject,
          TextPart: text,
          HTMLPart: html
        }
      ]
    })
  });
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(payload.ErrorMessage || payload.Messages?.[0]?.Errors?.[0]?.ErrorMessage || `Mailjet email failed with ${response.status}`);
  }

  return { messageId: payload.Messages?.[0]?.To?.[0]?.MessageID || "" };
}

async function sendProviderMail(message, env = process.env) {
  const provider = apiProviderForEnv(env);
  const from = message.from || defaultFrom(env);

  if (!provider) {
    return { skipped: true, reason: "smtp_not_configured" };
  }

  if (provider === "brevo") {
    return { provider, ...(await sendBrevoMail({ ...message, from }, env)) };
  }

  if (provider === "resend") {
    return { provider, ...(await sendResendMail({ ...message, from }, env)) };
  }

  if (provider === "mailjet") {
    return { provider, ...(await sendMailjetMail({ ...message, from }, env)) };
  }

  const nodemailer = loadNodemailer();
  if (!nodemailer) {
    return { skipped: true, reason: "nodemailer_not_installed" };
  }

  const transport = createTransport(nodemailer, env);
  const info = await transport.sendMail({ ...message, from });
  return { provider, messageId: info.messageId || "" };
}

function buildWelcomeEmail({ subscriber = {}, dashboardUrl = DEFAULT_DASHBOARD_URL } = {}) {
  const locale = String(subscriber.locale || "th").toLowerCase() === "en" ? "en" : "th";
  const thai = locale === "th";
  const url = String(dashboardUrl || DEFAULT_DASHBOARD_URL).replace(/\/+$/, "");
  const subject = thai ? "ยินดีต้อนรับสู่ SavePulse" : "Welcome to SavePulse";
  const headline = thai ? "สมัคร SavePulse เรียบร้อยแล้ว" : "You are signed up for SavePulse";
  const intro = thai
    ? "เราจะช่วยสรุปข้อสังเกตจากข้อมูลย้อนหลังของค่าเงิน ทอง และ BTC เป็นภาษาที่อ่านง่าย เพื่อใช้ประกอบการตัดสินใจก่อนแลกเงินก้อนใหญ่"
    : "SavePulse summarizes historical exchange-rate, gold, and BTC reference data in plain language so you have more context before large currency decisions.";
  const next = thai
    ? "ช่วง Private Beta นี้เราจะทยอยส่ง Daily Pulse แบบควบคุมก่อน ยังไม่มีการเปิดชำระเงินจริง"
    : "During Private Beta, Daily Pulse emails are sent in a controlled way first. Paid checkout is not open yet.";
  const disclaimer = thai
    ? "SavePulse ไม่ใช่คำแนะนำการลงทุน ไม่ใช่คำสั่งให้แลกเงิน ไม่ใช่บริการรับแลกเงิน และไม่รับประกันผลลัพธ์หรือเรทในอนาคต"
    : "SavePulse is not financial advice, not an instruction to exchange money, not a money exchange service, and does not guarantee future rates or outcomes.";
  const cta = thai ? "เปิด SavePulse" : "Open SavePulse";
  const text = `${headline}\n\n${intro}\n\n${next}\n\n${url}\n\n${disclaimer}`;
  const html = `<!doctype html>
<html lang="${locale}">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <title>${escapeHtml(subject)}</title>
  </head>
  <body style="margin:0;background:#edf8f8;font-family:Inter,system-ui,-apple-system,'Segoe UI','Noto Sans Thai',sans-serif;color:#101827;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#edf8f8;padding:28px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:620px;background:#ffffff;border:1px solid #d8e7ea;border-radius:20px;overflow:hidden;">
            <tr>
              <td style="background:#067b7f;padding:28px 26px;color:#ffffff;">
                <div style="font-size:28px;font-weight:900;letter-spacing:.01em;">SavePulse</div>
                <div style="margin-top:14px;font-size:34px;line-height:1.15;font-weight:900;">${escapeHtml(headline)}</div>
              </td>
            </tr>
            <tr>
              <td style="padding:26px;">
                <p style="margin:0;color:#435468;font-size:17px;line-height:1.65;">${escapeHtml(intro)}</p>
                <div style="margin:22px 0;padding:16px;border-radius:14px;background:#effafa;color:#064e57;font-weight:800;line-height:1.55;">${escapeHtml(next)}</div>
                <a href="${escapeHtml(url)}" style="display:block;text-align:center;background:#078b8d;color:#ffffff;text-decoration:none;border-radius:12px;padding:15px 18px;font-size:16px;font-weight:900;">${escapeHtml(cta)}</a>
                <p style="margin:22px 0 0;color:#66788a;font-size:12px;line-height:1.6;">${escapeHtml(disclaimer)}</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  return { subject, text, html, locale };
}

async function sendWelcomeEmail({ subscriber, env = process.env }) {
  const email = String(subscriber?.email || "").trim().toLowerCase();

  if (!email) {
    return { ok: false, skipped: true, reason: "no_recipient" };
  }

  const template = buildWelcomeEmail({
    subscriber,
    dashboardUrl: appUrl(env)
  });
  const info = await sendProviderMail({
    from: defaultFrom(env),
    to: email,
    subject: template.subject,
    text: template.text,
    html: template.html
  }, env);

  if (info.skipped) {
    return { email, ok: false, skipped: true, reason: info.reason };
  }

  return { email, ok: true, provider: info.provider, id: info.messageId };
}

function recipientsFromEnv(env = process.env) {
  return String(env.VIP_EMAILS || "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

function recipientRecords(subscribers = [], env = process.env) {
  const records = subscribers
    .map((subscriber) => ({
      ...subscriber,
      email: String(subscriber.email || "").trim().toLowerCase()
    }))
    .filter((subscriber) => subscriber.email);

  for (const email of recipientsFromEnv(env)) {
    records.push({
      id: `env-${email}`,
      email,
      locale: email.endsWith(".th") ? "th" : "en",
      plan: "pro",
      source: "env"
    });
  }

  const seen = new Set();
  return records.filter((record) => {
    if (seen.has(record.email)) {
      return false;
    }

    seen.add(record.email);
    return true;
  });
}

function uniqueRecipients(subscribers = [], env = process.env) {
  return recipientRecords(subscribers, env).map((record) => record.email);
}

function localizedMeta(effectiveSignal, thai) {
  const fallback = thai
    ? { label: "สถานะรอตัดสินใจ", headline: "เช็กก่อนตัดสินใจ", guidance: "ใช้ข้อมูลนี้เพื่อวางแผนอย่างมีวินัย" }
    : { label: "Decision state", headline: "Check before deciding", guidance: "Use this as planning context." };

  if (!effectiveSignal?.meta) {
    return fallback;
  }

  return thai ? effectiveSignal.meta.th || fallback : effectiveSignal.meta.en || fallback;
}

function planName(subscriber) {
  const plan = String(subscriber?.plan || "free").trim().toLowerCase();
  return plan.charAt(0).toUpperCase() + plan.slice(1);
}

function alertTone(action) {
  if (action === "SELL_ZONE") {
    return {
      badgeBg: "#ffe6ec",
      badgeColor: "#a51f43",
      accent: "#ff9cab",
      chart: [30, 22, 27, 18, 15, 10]
    };
  }

  if (action === "WAIT_ZONE") {
    return {
      badgeBg: "#ffeeb8",
      badgeColor: "#795308",
      accent: "#ffd052",
      chart: [12, 18, 14, 20, 17, 22]
    };
  }

  return {
    badgeBg: "#bfffe4",
    badgeColor: "#08734f",
    accent: "#73f1ca",
    chart: [8, 14, 11, 20, 17, 28]
  };
}

function alertCopyFor(action, thai, symbol) {
  if (thai) {
    if (action === "SELL_ZONE") {
      return {
        subject: `SavePulse: ${symbol} อยู่ในโซนที่ควรระวัง`,
        eyebrow: "ข้อสังเกตล่าสุด",
        headline: `${symbol}: อยู่ในโซนที่ควรระวัง`,
        badge: "ควรระวัง",
        body:
          "ข้อมูลย้อนหลังบอกว่ารายการนี้อยู่ในโซนที่ควรทบทวนให้รอบคอบก่อนตัดสินใจ โดยเฉพาะถ้าคุณกำลังจะใช้เงินก้อนใหญ่",
        context:
          "ถ้ายังไม่จำเป็นเร่งด่วน การรอข้อมูลรอบถัดไปอาจช่วยให้เห็นภาพชัดขึ้นก่อนตัดสินใจ",
        cta: "ดูรายละเอียดบน SavePulse",
        note: "ใช้ประกอบการตัดสินใจ ไม่ใช่คำสั่งให้แลกเงิน"
      };
    }

    if (action === "WAIT_ZONE") {
      return {
        subject: `SavePulse: ${symbol} ยังไม่ต้องรีบ`,
        eyebrow: "ข้อสังเกตล่าสุด",
        headline: `${symbol}: ยังไม่ต้องรีบ`,
        badge: "ยังไม่ต้องรีบ",
        body:
          "ข้อมูลย้อนหลังยังไม่ชี้ว่าจังหวะนี้เด่นพอสำหรับการรีบตัดสินใจ หากยังมีเวลา ควรรอดูข้อมูลเพิ่มเติม",
        context:
          "เหมาะกับการเฝ้าดูต่อ ไม่ใช่จุดที่ต้องตัดสินใจทันที",
        cta: "ดูรายละเอียดบน SavePulse",
        note: "ใช้ประกอบการตัดสินใจ ไม่ใช่คำสั่งให้แลกเงิน"
      };
    }

    return {
      subject: `SavePulse: ${symbol} เริ่มน่าจับตา`,
      eyebrow: "ข้อสังเกตล่าสุด",
      headline: `${symbol}: เริ่มน่าจับตา`,
      badge: "เริ่มน่าจับตา",
      body:
        "ข้อมูลย้อนหลังบอกว่ารายการนี้เริ่มอยู่ในช่วงที่ควรกลับมาเช็กบริบทอีกครั้ง หากคุณมีแผนแลกเงินอยู่แล้ว",
      context:
        "ช่วงที่ดูน่าสนใจมักไม่ได้อยู่นาน การเช็กก่อนแลกช่วยลดโอกาสเสียเปรียบโดยไม่รู้ตัว",
      cta: "ดูรายละเอียดบน SavePulse",
      note: "ใช้ประกอบการตัดสินใจ ไม่ใช่คำสั่งให้แลกเงิน"
    };
  }

  if (action === "SELL_ZONE") {
    return {
      subject: `SavePulse: ${symbol} needs extra caution`,
      eyebrow: "Latest context",
      headline: `${symbol}: extra caution zone`,
      badge: "Use caution",
      body:
        "Historical context suggests this item deserves a more careful review before making a large decision.",
      context:
        "If timing is not urgent, waiting for the next update may give you clearer context.",
      cta: "View details on SavePulse",
      note: "Decision-support context, not an instruction to exchange."
    };
  }

  if (action === "WAIT_ZONE") {
    return {
      subject: `SavePulse: ${symbol} is not urgent yet`,
      eyebrow: "Latest context",
      headline: `${symbol}: not urgent yet`,
      badge: "Not urgent yet",
      body:
        "Historical context does not yet show a strong reason to rush. If you have time, keep watching for a clearer setup.",
      context:
        "This is a monitoring state, not a reason to act immediately.",
      cta: "View details on SavePulse",
      note: "Decision-support context, not an instruction to exchange."
    };
  }

  return {
    subject: `SavePulse: ${symbol} is worth watching`,
    eyebrow: "Latest context",
    headline: `${symbol}: worth watching`,
    badge: "Worth watching",
    body:
      "Historical context suggests this item is worth checking again if you already have an exchange plan.",
    context:
      "Checking before you exchange helps reduce the chance of being disadvantaged by timing.",
    cta: "View details on SavePulse",
    note: "Decision-support context, not an instruction to exchange."
  };
}

function confidencePercent(signal) {
  const percent = Number(signal?.percentile?.percent);
  if (!Number.isFinite(percent)) {
    return null;
  }

  return Math.max(0, Math.min(100, Math.round(percent)));
}

function alertBars(tone) {
  return tone.chart.map((height) => (
    `<td valign="bottom" style="padding:0 2px;width:12px;"><div style="height:${height}px;background:${tone.accent};border-radius:4px 4px 0 0;box-shadow:0 0 12px ${tone.accent};"></div></td>`
  )).join("");
}

function buildEmail(signal, effectiveSignal, subscriberOrLocale = "en", env = process.env) {
  const localeHint =
    typeof subscriberOrLocale === "string" ? subscriberOrLocale : subscriberOrLocale?.locale || "en";
  const thai = isThaiAsset(signal.symbol) || localeHint === "th";
  const priceText = signal.price === null ? "N/A" : Number(signal.price).toLocaleString("en-US");
  const symbolRaw = String(signal.symbol || "").toUpperCase();
  const symbol = escapeHtml(symbolRaw);
  const action = String(signal.action || "").toUpperCase();
  const dashboardUrl = env.PUBLIC_URL || DEFAULT_DASHBOARD_URL;
  const subscriberPlan = planName(subscriberOrLocale);
  const tone = alertTone(action);
  const copy = alertCopyFor(action, thai, symbolRaw);
  const percent = confidencePercent(signal);
  const percentText = percent === null
    ? thai ? "รอข้อมูลย้อนหลังเพิ่มเติม" : "More history needed"
    : `${percent}%`;
  const percentWidth = percent === null ? 45 : percent;
  const subject = copy.subject;

  const text = thai
    ? [
        copy.headline,
        `ราคาอ้างอิง: ${priceText}`,
        `สถานะ: ${copy.badge}`,
        `ระดับข้อสังเกตจากข้อมูลย้อนหลัง: ${percentText}`,
        copy.body,
        copy.context,
        "SavePulse ไม่ใช่คำแนะนำการลงทุน ไม่ใช่คำสั่งให้แลกเงิน ไม่ใช่บริการรับแลกเงิน และไม่รับประกันผลลัพธ์หรือเรทในอนาคต"
      ].join("\n")
    : [
        copy.headline,
        `Reference price: ${priceText}`,
        `Status: ${copy.badge}`,
        `Historical context level: ${percentText}`,
        copy.body,
        copy.context,
        "SavePulse is not financial advice, not an instruction to exchange money, not a money exchange service, and does not guarantee future rates or outcomes."
      ].join("\n");

  const html = `<!doctype html>
<html lang="${thai ? "th" : "en"}">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <meta name="x-apple-disable-message-reformatting">
    <title>${escapeHtml(subject)}</title>
  </head>
  <body style="margin:0;background:#edf6f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,'Noto Sans Thai',sans-serif;color:#10252b;-webkit-text-size-adjust:100%;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${escapeHtml(copy.body)}</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#edf6f7;padding:18px 8px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border:1px solid #d7e4e6;border-radius:20px;overflow:hidden;box-shadow:0 18px 50px rgba(3,52,59,.14);">
            <tr>
              <td style="padding:20px 24px;border-bottom:1px solid #dbe7e9;background:#ffffff;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                  <tr>
                    <td valign="middle">
                      <table role="presentation" cellpadding="0" cellspacing="0">
                        <tr>
                          <td style="width:48px;height:48px;border-radius:50%;background:linear-gradient(145deg,#18c7b7,#056672);color:#ffffff;text-align:center;line-height:48px;font-size:24px;font-weight:900;box-shadow:0 10px 22px rgba(4,142,143,.25);">⌁</td>
                          <td style="padding-left:13px;color:#064851;font-size:30px;line-height:1.05;font-weight:900;">SavePulse</td>
                        </tr>
                      </table>
                    </td>
                    <td align="right"><span style="display:inline-block;padding:9px 15px;border:1.5px solid #078b8d;border-radius:999px;color:#078b8d;font-size:13px;font-weight:900;letter-spacing:.02em;">${escapeHtml(subscriberPlan.toUpperCase())}</span></td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:12px;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:linear-gradient(145deg,#023840 0%,#00545c 56%,#076d68 100%);border-radius:18px;overflow:hidden;box-shadow:inset 0 0 0 1px rgba(88,235,216,.16);">
                  <tr>
                    <td style="padding:24px 21px 14px;color:#ffffff;">
                      <div style="color:#73f1ca;font-size:13px;font-weight:900;letter-spacing:.04em;text-transform:uppercase;">${escapeHtml(copy.eyebrow)}</div>
                      <div style="margin-top:8px;color:#ffffff;font-size:31px;line-height:1.12;font-weight:900;word-break:keep-all;">${escapeHtml(copy.headline)}</div>
                      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:14px;">
                        <tr>
                          <td valign="middle" style="width:64%;padding-right:12px;color:#dff5f2;font-size:14px;line-height:1.55;">${escapeHtml(copy.body)}</td>
                          <td align="right" valign="middle" style="width:36%;">
                            <table role="presentation" cellpadding="0" cellspacing="0" style="display:inline-table;height:36px;"><tr>${alertBars(tone)}</tr><tr><td colspan="6" style="height:2px;background:rgba(126,242,217,.35);line-height:2px;font-size:0;">&nbsp;</td></tr></table>
                          </td>
                        </tr>
                      </table>
                      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:15px;border:1px solid rgba(126,242,217,.28);border-radius:18px;background:rgba(0,31,37,.22);">
                        <tr>
                          <td style="width:50%;padding:10px 12px;color:#d7efed;font-size:11px;line-height:1.35;">${thai ? "อ้างอิงล่าสุด" : "Latest reference"}<br><strong style="font-size:17px;color:#ffffff;">${escapeHtml(priceText)}</strong></td>
                          <td style="width:50%;padding:10px 12px;border-left:1px solid rgba(126,242,217,.22);color:#d7efed;font-size:11px;line-height:1.35;">${thai ? "รายการ" : "Item"}<br><strong style="font-size:17px;color:#ffffff;">${symbol}</strong></td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:0 17px 12px;">
                      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:linear-gradient(145deg,#06464f 0%,#08726d 100%);border:1px solid ${tone.accent};border-radius:17px;box-shadow:0 10px 22px rgba(0,42,46,.16);">
                        <tr>
                          <td style="padding:16px 17px 15px;">
                            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                              <tr>
                                <td valign="top" style="width:58%;padding-right:10px;">
                                  <div style="color:#ffffff;font-size:19px;line-height:1.28;font-weight:900;">${symbol}</div>
                                  <div style="margin-top:3px;color:#a7d9d7;font-size:11px;line-height:1.35;">${thai ? "ข้อสังเกตจากข้อมูลย้อนหลัง" : "Historical context"}</div>
                                </td>
                                <td align="right" valign="top" style="width:42%;"><span style="display:inline-block;padding:9px 11px;background:${tone.badgeBg};color:${tone.badgeColor};border-radius:999px;font-size:12px;line-height:1.15;font-weight:900;white-space:nowrap;box-shadow:0 0 14px ${tone.accent};">${escapeHtml(copy.badge)}</span></td>
                              </tr>
                            </table>
                            <p style="margin:13px 0 0;color:#e6f6f4;font-size:13px;line-height:1.6;">${escapeHtml(copy.context)}</p>
                            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:13px;background:rgba(1,43,50,.58);border-radius:12px;">
                              <tr>
                                <td style="padding:12px 13px;width:75%;">
                                  <div style="color:#8cf0df;font-size:11px;line-height:1.35;font-weight:800;">${thai ? "ระดับข้อสังเกตจากข้อมูลย้อนหลัง" : "Historical context level"}</div>
                                  <div style="margin-top:8px;height:8px;background:#195d61;border-radius:999px;overflow:hidden;"><div style="width:${percentWidth}%;height:8px;background:${tone.accent};border-radius:999px;"></div></div>
                                  <div style="margin-top:8px;color:#ffffff;font-size:12px;font-weight:900;line-height:1.35;">${escapeHtml(percentText)}</div>
                                </td>
                                <td align="right" valign="middle" style="padding:10px 13px 10px 4px;width:25%;">
                                  <table role="presentation" cellpadding="0" cellspacing="0" style="display:inline-table;height:32px;"><tr>${alertBars(tone)}</tr></table>
                                </td>
                              </tr>
                            </table>
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:0 17px 12px;">
                      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#fff9e9;border:1px solid #f0d181;border-radius:14px;">
                        <tr>
                          <td style="width:45px;padding:14px 0 14px 15px;"><div style="width:36px;height:36px;border-radius:50%;background:#ffe29a;color:#a97000;text-align:center;line-height:36px;font-size:18px;font-weight:900;">↺</div></td>
                          <td style="padding:13px 14px;">
                            <div style="font-size:15px;font-weight:900;color:#352c1e;">${thai ? "บริบทจากข้อมูลย้อนหลัง" : "Historical context"}</div>
                            <div style="margin-top:4px;color:#6c5f49;font-size:11px;line-height:1.5;">${thai ? "อีเมลนี้ช่วยบอกว่าตอนนี้ต่างจากช่วงก่อนหน้าอย่างไร เพื่อให้คุณเช็กข้อมูลก่อนตัดสินใจด้วยตัวเอง" : "This alert highlights how the current context differs from recent history so you can check before making your own decision."}</div>
                            <div style="display:inline-block;margin-top:9px;padding:7px 10px;border-radius:10px;background:#ffeeb8;color:#7a5708;font-size:11px;font-weight:900;">${escapeHtml(copy.note)}</div>
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                  <tr>
                    <td align="center" style="padding:0 17px 18px;">
                      <a href="${escapeHtml(dashboardUrl)}" style="display:block;padding:14px 17px;background:linear-gradient(90deg,#20d5b0,#079b9b);border:1px solid #a5ffe2;border-radius:13px;color:#ffffff;text-decoration:none;text-align:center;font-size:18px;line-height:1.3;font-weight:900;box-shadow:0 0 22px rgba(51,237,196,.5);">⚡ ${escapeHtml(copy.cta)} →</a>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td align="center" style="padding:17px 27px 23px;">
                <p style="margin:0;color:#71838c;font-size:11px;line-height:1.65;">${thai ? "SavePulse ให้ข้อมูลประกอบการตัดสินใจจากข้อมูลย้อนหลัง ไม่ใช่คำแนะนำการลงทุน ไม่ใช่บริการรับแลกเงิน และไม่รับประกันผลลัพธ์หรือเรทในอนาคต" : "SavePulse provides decision-support context from historical data. It is not financial advice, not a money exchange service, and does not guarantee future rates or outcomes."}</p>
                <div style="margin-top:10px;padding-top:10px;border-top:1px solid #dbe8ea;color:#8a9aa1;font-size:10px;">${escapeHtml(subscriberPlan)} • © 2026 SavePulse Analytics Network</div>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  return { html, subject, text };
}

async function broadcastSignal({ signal, effectiveSignal, subscribers = [], env = process.env }) {
  const recipients = recipientRecords(subscribers, env);

  if (recipients.length === 0) {
    return { sent: 0, skipped: true, reason: "no_recipients" };
  }

  if (!smtpConfigured(env)) {
    return { sent: 0, skipped: true, reason: "smtp_not_configured", recipients: recipients.length };
  }

  const from = defaultFrom(env);
  const results = [];

  for (const subscriber of recipients) {
    const template = buildEmail(signal, effectiveSignal, subscriber, env);
    try {
      const info = await sendProviderMail({
        from,
        to: subscriber.email,
        subject: template.subject,
        text: template.text,
        html: template.html
      }, env);

      if (info.skipped) {
        results.push({ email: subscriber.email, plan: subscriber.plan || "free", ok: false, skipped: true, reason: info.reason });
      } else {
        results.push({ email: subscriber.email, plan: subscriber.plan || "free", ok: true, provider: info.provider, id: info.messageId });
      }
    } catch (error) {
      results.push({ email: subscriber.email, plan: subscriber.plan || "free", ok: false, error: error.message });
    }
  }

  return {
    sent: results.filter((result) => result.ok).length,
    failed: results.filter((result) => !result.ok).length,
    results
  };
}

function createTransport(nodemailer, env = process.env) {
  return nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: Number(env.SMTP_PORT || 465),
    secure: Number(env.SMTP_PORT || 465) === 465,
    auth: {
      user: env.SMTP_USER,
      pass: env.SMTP_PASS
    }
  });
}

async function sendSignalEmail({ signal, effectiveSignal, subscriber, env = process.env }) {
  const email = String(subscriber?.email || "").trim().toLowerCase();

  if (!email) {
    return { ok: false, skipped: true, reason: "no_recipient" };
  }

  if (!smtpConfigured(env)) {
    return { email, ok: false, skipped: true, reason: "smtp_not_configured" };
  }

  const template = buildEmail(signal, effectiveSignal, subscriber, env);
  const info = await sendProviderMail({
    from: defaultFrom(env),
    to: email,
    subject: template.subject,
    text: template.text,
    html: template.html
  }, env);

  if (info.skipped) {
    return { email, ok: false, skipped: true, reason: info.reason };
  }

  return { email, plan: subscriber?.plan || "free", ok: true, provider: info.provider, id: info.messageId };
}

async function sendDailyDigestEmail({ subscriber, signals = [], dashboardUrl, unsubscribeUrl, env = process.env }) {
  const email = String(subscriber?.email || "").trim().toLowerCase();

  if (!email) {
    return { ok: false, skipped: true, reason: "no_recipient" };
  }

  if (!smtpConfigured(env)) {
    return { email, ok: false, skipped: true, reason: "smtp_not_configured" };
  }

  const template = buildDailyDigestEmail({
    plan: subscriber?.plan || "free",
    locale: subscriber?.locale || "th",
    signals,
    dashboardUrl,
    unsubscribeUrl
  });
  const info = await sendProviderMail({
    from: defaultFrom(env),
    to: email,
    subject: template.subject,
    text: template.text,
    html: template.html
  }, env);

  if (info.skipped) {
    return { email, ok: false, skipped: true, reason: info.reason };
  }

  return { email, plan: template.plan, ok: true, provider: info.provider, id: info.messageId };
}

async function broadcastStrongBuy(args) {
  return broadcastSignal(args);
}

module.exports = {
  broadcastSignal,
  broadcastStrongBuy,
  buildEmail,
  buildWelcomeEmail,
  apiProviderForEnv,
  recipientRecords,
  recipientsFromEnv,
  sendDailyDigestEmail,
  sendWelcomeEmail,
  sendSignalEmail,
  sendProviderMail,
  smtpConfigured,
  uniqueRecipients
};
