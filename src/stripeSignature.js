"use strict";
const crypto = require("node:crypto");
const { Buffer } = require("node:buffer");

function verifyStripeWebhookSignature(rawBody, signatureHeader, secret, nowMs = Date.now(), toleranceSeconds = 300) {
  if (!secret) throw Error("stripe_webhook_secret_not_configured");
  let timestamp;
  const signatures = [];
  for (const part of String(signatureHeader || "").split(",")) {
    const [key, value] = part.trim().split("=");
    if (key === "t") timestamp = Number(value);
    if (key === "v1" && /^[a-f0-9]{64}$/i.test(value || "")) signatures.push(value);
  }
  if (!Number.isFinite(timestamp) || !signatures.length) throw Error("invalid_stripe_signature_header");
  if (toleranceSeconds !== null && Math.abs(nowMs / 1000 - timestamp) > toleranceSeconds) throw Error("stripe_signature_timestamp_outside_tolerance");
  const body = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(String(rawBody || ""));
  const expected = crypto.createHmac("sha256", secret).update(`${timestamp}.`).update(body).digest();
  if (!signatures.some(value => crypto.timingSafeEqual(Buffer.from(value, "hex"), expected))) throw Error("invalid_stripe_signature");
  return true;
}

module.exports = { verifyStripeWebhookSignature };
