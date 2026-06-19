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

function buildEmail(signal, effectiveSignal, subscriberOrLocale = "en", env = process.env) {
  const localeHint =
    typeof subscriberOrLocale === "string" ? subscriberOrLocale : subscriberOrLocale?.locale || "en";
  const thai = isThaiAsset(signal.symbol) || localeHint === "th";
  const priceText = signal.price === null ? "N/A" : Number(signal.price).toLocaleString("en-US");
  const percentileText = signal.percentile ? `${signal.percentile.percent}%` : "pending";
  const symbol = escapeHtml(signal.symbol);
  const action = String(signal.action || "").toUpperCase();
  const isRiskAlert = action === "SELL_ZONE";
  const meta = localizedMeta(effectiveSignal, thai);
  const dashboardUrl = env.PUBLIC_URL || DEFAULT_DASHBOARD_URL;
  const subscriberPlan = planName(subscriberOrLocale);
  const headline = thai
    ? isRiskAlert
      ? `${symbol}: เข้าโซนเสี่ยงซื้อแพง`
      : `${symbol}: เริ่มเข้าโซนที่ควรจับตา`
    : isRiskAlert
      ? `${symbol}: Expensive-zone risk is elevated`
      : `${symbol}: A low-regret window is opening`;
  const subject = thai
    ? isRiskAlert
      ? `SavePulse: ${signal.symbol} เข้าโซนเสี่ยงซื้อแพง`
      : `SavePulse: ${signal.symbol} จังหวะดีอาจไม่รอนาน`
    : isRiskAlert
      ? `SavePulse: ${signal.symbol} moved into an expensive-risk zone`
      : `SavePulse: ${signal.symbol} may be entering a better window`;

  const text = thai
    ? [
        headline,
        `ราคาอ้างอิง: ${priceText}`,
        `ตำแหน่งเปอร์เซ็นไทล์: ${percentileText}`,
        `สถานะ: ${meta.label}`,
        "จังหวะเรทดีมักอยู่ไม่นาน หลายคนมาเห็นอีกทีตอนเรทขยับไปแล้ว",
        "ข้อความนี้เป็นข้อมูลประกอบการตัดสินใจ ไม่ใช่คำแนะนำลงทุนหรือการรับประกันผลตอบแทน"
      ].join("\n")
    : [
        headline,
        `Reference price: ${priceText}`,
        `Percentile position: ${percentileText}`,
        `Decision state: ${meta.label}`,
        "Good rate windows rarely stay open for long. Many people check again after the move has already passed.",
        "This is decision intelligence, not financial advice, a trading signal, or a return guarantee."
      ].join("\n");

  const bodyCopy = thai
    ? isRiskAlert
      ? "SavePulse เห็นสัญญาณว่าเรทหรือสินทรัพย์นี้อยู่ในโซนที่คนจำนวนมากอาจรู้สึกว่าเข้าช้าไปแล้ว ควรใช้ข้อมูลนี้เพื่อชะลออารมณ์และทบทวนแผนก่อนตัดสินใจ"
      : "SavePulse เห็นจังหวะที่ควรจับตา จังหวะเรทดีมักไม่ได้เปิดอยู่นาน หากคุณมีแผนแลกเงินหรือสะสมอยู่แล้ว นี่คือเวลาที่ควรกลับมาเช็กการ์ดตัดสินใจ"
    : isRiskAlert
      ? "SavePulse detected a zone where many people may later feel they acted too late. Use this to slow down and review your plan before making a decision."
      : "SavePulse detected a window worth checking. Better rate windows do not usually stay open for long. If you already planned to exchange or save, now is the moment to review your decision card.";

  const html = `<!doctype html>
<html>
  <body style="margin:0;background:#eef7f8;font-family:Arial,sans-serif;color:#111827;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:28px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:640px;background:#ffffff;border:1px solid #dcebed;border-radius:18px;overflow:hidden;box-shadow:0 18px 45px rgba(15,118,110,.12);">
            <tr>
              <td style="padding:26px 30px;background:linear-gradient(135deg,#087f83,#00a6b2);color:#ffffff;">
                <div style="font-size:12px;text-transform:uppercase;letter-spacing:.08em;">SavePulse ${escapeHtml(subscriberPlan)} Alert</div>
                <h1 style="margin:9px 0 0;font-size:26px;line-height:1.25;">${headline}</h1>
              </td>
            </tr>
            <tr>
              <td style="padding:30px;">
                <p style="font-size:16px;line-height:1.6;margin:0 0 18px;">${escapeHtml(bodyCopy)}</p>
                <div style="border:1px solid #fde68a;background:#fffbeb;border-radius:14px;padding:14px 16px;margin:0 0 20px;color:#92400e;font-size:14px;line-height:1.5;">
                  ${thai ? "หลายคนแลกช้าไป แล้วค่อยมารู้ทีหลังว่าส่วนต่างมากกว่าที่คิด" : "Many people exchange too late, then realize the difference was larger than expected."}
                </div>
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
                  <tr>
                    <td style="padding:12px;border:1px solid #e5e7eb;">${thai ? "สินทรัพย์" : "Asset"}</td>
                    <td style="padding:12px;border:1px solid #e5e7eb;"><strong>${symbol}</strong></td>
                  </tr>
                  <tr>
                    <td style="padding:12px;border:1px solid #e5e7eb;">${thai ? "ราคาอ้างอิง" : "Reference price"}</td>
                    <td style="padding:12px;border:1px solid #e5e7eb;">${escapeHtml(priceText)}</td>
                  </tr>
                  <tr>
                    <td style="padding:12px;border:1px solid #e5e7eb;">${thai ? "สถานะวันนี้" : "Decision state"}</td>
                    <td style="padding:12px;border:1px solid #e5e7eb;">${escapeHtml(meta.label)}</td>
                  </tr>
                  <tr>
                    <td style="padding:12px;border:1px solid #e5e7eb;">${thai ? "เปอร์เซ็นไทล์" : "Percentile"}</td>
                    <td style="padding:12px;border:1px solid #e5e7eb;">${escapeHtml(percentileText)}</td>
                  </tr>
                </table>
                <p style="font-size:14px;line-height:1.6;color:#4b5563;margin:18px 0 0;">${escapeHtml(meta.guidance)}</p>
                <div style="margin:24px 0 0;">
                  <a href="${escapeHtml(dashboardUrl)}" style="display:inline-block;background:#087f83;color:#ffffff;text-decoration:none;font-weight:700;border-radius:12px;padding:13px 18px;">
                    ${thai ? "เปิดการ์ดตัดสินใจวันนี้" : "Open today's decision card"}
                  </a>
                </div>
                <p style="font-size:12px;line-height:1.6;color:#6b7280;margin:20px 0 0;">${escapeHtml(text.split("\n").at(-1))}</p>
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
