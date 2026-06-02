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

function smtpConfigured(env = process.env) {
  return Boolean(env.SMTP_HOST && env.SMTP_PORT && env.SMTP_USER && env.SMTP_PASS);
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

  const nodemailer = loadNodemailer();
  if (!nodemailer) {
    return { sent: 0, skipped: true, reason: "nodemailer_not_installed", recipients: recipients.length };
  }

  const transport = createTransport(nodemailer, env);

  const from = env.FROM_EMAIL || env.SMTP_USER;
  const results = [];

  for (const subscriber of recipients) {
    const template = buildEmail(signal, effectiveSignal, subscriber, env);
    try {
      const info = await transport.sendMail({
        from,
        to: subscriber.email,
        subject: template.subject,
        text: template.text,
        html: template.html
      });
      results.push({ email: subscriber.email, plan: subscriber.plan || "free", ok: true, id: info.messageId });
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

  const nodemailer = loadNodemailer();
  if (!nodemailer) {
    return { email, ok: false, skipped: true, reason: "nodemailer_not_installed" };
  }

  const template = buildEmail(signal, effectiveSignal, subscriber, env);
  const transport = createTransport(nodemailer, env);
  const info = await transport.sendMail({
    from: env.FROM_EMAIL || env.SMTP_USER,
    to: email,
    subject: template.subject,
    text: template.text,
    html: template.html
  });

  return { email, plan: subscriber?.plan || "free", ok: true, id: info.messageId };
}

async function sendDailyDigestEmail({ subscriber, signals = [], dashboardUrl, unsubscribeUrl, env = process.env }) {
  const email = String(subscriber?.email || "").trim().toLowerCase();

  if (!email) {
    return { ok: false, skipped: true, reason: "no_recipient" };
  }

  if (!smtpConfigured(env)) {
    return { email, ok: false, skipped: true, reason: "smtp_not_configured" };
  }

  const nodemailer = loadNodemailer();
  if (!nodemailer) {
    return { email, ok: false, skipped: true, reason: "nodemailer_not_installed" };
  }

  const template = buildDailyDigestEmail({
    plan: subscriber?.plan || "free",
    locale: subscriber?.locale || "th",
    signals,
    dashboardUrl,
    unsubscribeUrl
  });
  const transport = createTransport(nodemailer, env);
  const info = await transport.sendMail({
    from: env.FROM_EMAIL || env.SMTP_USER,
    to: email,
    subject: template.subject,
    text: template.text,
    html: template.html
  });

  return { email, plan: template.plan, ok: true, id: info.messageId };
}

async function broadcastStrongBuy(args) {
  return broadcastSignal(args);
}

module.exports = {
  broadcastSignal,
  broadcastStrongBuy,
  buildEmail,
  recipientRecords,
  recipientsFromEnv,
  sendDailyDigestEmail,
  sendSignalEmail,
  smtpConfigured,
  uniqueRecipients
};
