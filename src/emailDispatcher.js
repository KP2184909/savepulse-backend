"use strict";

const { isThaiAsset } = require("./signalEngine");

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

function uniqueRecipients(subscribers = [], env = process.env) {
  const fromSubscribers = subscribers
    .map((subscriber) => String(subscriber.email || "").trim().toLowerCase())
    .filter(Boolean);

  return [...new Set([...fromSubscribers, ...recipientsFromEnv(env)])];
}

function buildEmail(signal, effectiveSignal, localeHint = "en") {
  const thai = isThaiAsset(signal.symbol) || localeHint === "th";
  const priceText = signal.price === null ? "N/A" : Number(signal.price).toLocaleString("en-US");
  const percentileText = signal.percentile ? `${signal.percentile.percent}%` : "pending";
  const symbol = escapeHtml(signal.symbol);
  const headline = thai
    ? `${symbol}: โซนสะสมแบบลดความเสียใจ`
    : `${symbol}: Low-regret decision window`;
  const subject = thai
    ? `SavePulse Alert: ${signal.symbol} เข้าสู่โซนสะสม`
    : `SavePulse Alert: ${signal.symbol} entered a low-regret window`;

  const text = thai
    ? [
        headline,
        `ราคาอ้างอิง: ${priceText}`,
        `ตำแหน่งเปอร์เซ็นไทล์: ${percentileText}`,
        "ข้อความนี้เป็นข้อมูลประกอบการตัดสินใจ ไม่ใช่คำแนะนำลงทุนหรือการรับประกันผลตอบแทน"
      ].join("\n")
    : [
        headline,
        `Reference price: ${priceText}`,
        `Percentile position: ${percentileText}`,
        "This is decision intelligence, not financial advice, a trading signal, or a return guarantee."
      ].join("\n");

  const bodyCopy = thai
    ? "สัญญาณรายวันล่าสุดบอกว่าโอกาสเสียใจจากการรีบซื้ออยู่ในระดับต่ำกว่าปกติ เหมาะกับการประเมินแผนออมอย่างมีวินัย"
    : "The latest daily signal indicates a lower historical regret-risk window. Use it to review a disciplined saving plan, not as a profit promise.";

  const html = `<!doctype html>
<html>
  <body style="margin:0;background:#f6f8fb;font-family:Arial,sans-serif;color:#111827;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:28px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:640px;background:#ffffff;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
            <tr>
              <td style="padding:24px 28px;background:#0f766e;color:#ffffff;">
                <div style="font-size:12px;text-transform:uppercase;letter-spacing:.08em;">SavePulse Analytics Network</div>
                <h1 style="margin:8px 0 0;font-size:24px;line-height:1.25;">${headline}</h1>
              </td>
            </tr>
            <tr>
              <td style="padding:28px;">
                <p style="font-size:16px;line-height:1.6;margin:0 0 18px;">${escapeHtml(bodyCopy)}</p>
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
                  <tr>
                    <td style="padding:12px;border:1px solid #e5e7eb;">Symbol</td>
                    <td style="padding:12px;border:1px solid #e5e7eb;"><strong>${symbol}</strong></td>
                  </tr>
                  <tr>
                    <td style="padding:12px;border:1px solid #e5e7eb;">Reference price</td>
                    <td style="padding:12px;border:1px solid #e5e7eb;">${escapeHtml(priceText)}</td>
                  </tr>
                  <tr>
                    <td style="padding:12px;border:1px solid #e5e7eb;">Decision state</td>
                    <td style="padding:12px;border:1px solid #e5e7eb;">${escapeHtml(effectiveSignal.meta.en.label)}</td>
                  </tr>
                </table>
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

async function broadcastStrongBuy({ signal, effectiveSignal, subscribers = [], env = process.env }) {
  const recipients = uniqueRecipients(subscribers, env);

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

  const transport = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: Number(env.SMTP_PORT || 465),
    secure: Number(env.SMTP_PORT || 465) === 465,
    auth: {
      user: env.SMTP_USER,
      pass: env.SMTP_PASS
    }
  });

  const from = env.FROM_EMAIL || env.SMTP_USER;
  const results = [];

  for (const email of recipients) {
    const template = buildEmail(signal, effectiveSignal, email.endsWith(".th") ? "th" : "en");
    try {
      const info = await transport.sendMail({
        from,
        to: email,
        subject: template.subject,
        text: template.text,
        html: template.html
      });
      results.push({ email, ok: true, id: info.messageId });
    } catch (error) {
      results.push({ email, ok: false, error: error.message });
    }
  }

  return {
    sent: results.filter((result) => result.ok).length,
    failed: results.filter((result) => !result.ok).length,
    results
  };
}

module.exports = {
  broadcastStrongBuy,
  buildEmail,
  recipientsFromEnv,
  smtpConfigured,
  uniqueRecipients
};
