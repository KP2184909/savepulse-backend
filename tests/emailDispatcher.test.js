"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  apiProviderForEnv,
  buildWelcomeEmail,
  sendDailyDigestEmail,
  sendSignalEmail,
  sendWelcomeEmail
} = require("../src/emailDispatcher");
const { createDefaultSignal } = require("../src/signalEngine");

test("email provider selection prefers free API providers over SMTP", () => {
  assert.equal(apiProviderForEnv({}), "");
  assert.equal(apiProviderForEnv({ SMTP_HOST: "smtp.example.com", SMTP_PORT: "587", SMTP_USER: "u", SMTP_PASS: "p" }), "smtp");
  assert.equal(
    apiProviderForEnv({
      BREVO_API_KEY: "brevo_test_key",
      SMTP_HOST: "smtp.example.com",
      SMTP_PORT: "587",
      SMTP_USER: "u",
      SMTP_PASS: "p"
    }),
    "brevo"
  );
  assert.equal(apiProviderForEnv({ EMAIL_PROVIDER: "resend", BREVO_API_KEY: "brevo_test_key" }), "");
  assert.equal(apiProviderForEnv({ EMAIL_PROVIDER: "resend", RESEND_API_KEY: "resend_test_key" }), "resend");
});

test("welcome email is safe, bilingual, and avoids raw backend signal names", () => {
  const th = buildWelcomeEmail({
    subscriber: { email: "member@example.com", locale: "th" },
    dashboardUrl: "https://savepulse.cloud"
  });
  const en = buildWelcomeEmail({
    subscriber: { email: "member@example.com", locale: "en" },
    dashboardUrl: "https://savepulse.cloud"
  });

  assert.match(th.subject, /SavePulse/);
  assert.match(th.html, /สมัคร SavePulse เรียบร้อยแล้ว/);
  assert.match(th.html, /ไม่ใช่คำแนะนำการลงทุน/);
  assert.match(en.subject, /Welcome/);
  assert.match(en.html, /You are signed up/);
  assert.match(en.html, /not financial advice/i);
  assert.doesNotMatch(`${th.text} ${th.html} ${en.text} ${en.html}`, /BUY_ZONE|SELL_ZONE|STRONG_BUY|WAIT_ZONE|billing\/checkout/);
});

test("welcome email can be sent through Resend without blocking signup flow callers", async () => {
  const originalFetch = global.fetch;
  let request;

  global.fetch = async (url, options) => {
    request = {
      url,
      options,
      body: JSON.parse(options.body)
    };

    return {
      ok: true,
      json: async () => ({ id: "welcome-message-123" })
    };
  };

  try {
    const result = await sendWelcomeEmail({
      subscriber: { email: "member@example.com", locale: "th" },
      env: {
        EMAIL_PROVIDER: "resend",
        RESEND_API_KEY: "resend_test_key",
        FROM_EMAIL: "SavePulse <alerts@savepulse.cloud>",
        PUBLIC_URL: "https://savepulse.cloud"
      }
    });

    assert.equal(result.ok, true);
    assert.equal(result.provider, "resend");
    assert.equal(result.id, "welcome-message-123");
    assert.equal(request.url, "https://api.resend.com/emails");
    assert.equal(request.options.headers.authorization, "Bearer resend_test_key");
    assert.equal(request.body.from, "SavePulse <alerts@savepulse.cloud>");
    assert.deepEqual(request.body.to, ["member@example.com"]);
    assert.match(request.body.subject, /SavePulse/);
    assert.match(request.body.html, /สมัคร SavePulse เรียบร้อยแล้ว/);
  } finally {
    global.fetch = originalFetch;
  }
});

test("daily digest email can be sent through Brevo API without nodemailer", async () => {
  const originalFetch = global.fetch;
  let request;

  global.fetch = async (url, options) => {
    request = {
      url,
      options,
      body: JSON.parse(options.body)
    };

    return {
      ok: true,
      json: async () => ({ messageId: "brevo-message-123" })
    };
  };

  try {
    const result = await sendDailyDigestEmail({
      subscriber: { email: "member@example.com", plan: "plus", locale: "th" },
      signals: [createDefaultSignal("JPYTHB")],
      dashboardUrl: "https://savepulse.cloud",
      unsubscribeUrl: "https://savepulse.cloud/unsubscribe?token=test",
      env: {
        BREVO_API_KEY: "brevo_test_key",
        FROM_EMAIL: "SavePulse <alerts@savepulse.cloud>"
      }
    });

    assert.equal(result.ok, true);
    assert.equal(result.provider, "brevo");
    assert.equal(result.id, "brevo-message-123");
    assert.equal(request.url, "https://api.brevo.com/v3/smtp/email");
    assert.equal(request.options.headers["api-key"], "brevo_test_key");
    assert.deepEqual(request.body.sender, { name: "SavePulse", email: "alerts@savepulse.cloud" });
    assert.deepEqual(request.body.to, [{ email: "member@example.com" }]);
    assert.match(request.body.subject, /SavePulse/);
    assert.match(request.body.htmlContent, /ยกเลิกรับอีเมล/);
  } finally {
    global.fetch = originalFetch;
  }
});

test("signal email can be sent through Resend API when selected", async () => {
  const originalFetch = global.fetch;
  let request;

  global.fetch = async (url, options) => {
    request = {
      url,
      options,
      body: JSON.parse(options.body)
    };

    return {
      ok: true,
      json: async () => ({ id: "resend-message-123" })
    };
  };

  try {
    const signal = {
      ...createDefaultSignal("JPYTHB"),
      action: "STRONG_BUY",
      price: 0.2029
    };
    const result = await sendSignalEmail({
      signal,
      effectiveSignal: signal,
      subscriber: { email: "member@example.com", plan: "pro", locale: "th" },
      env: {
        EMAIL_PROVIDER: "resend",
        RESEND_API_KEY: "resend_test_key",
        FROM_EMAIL: "SavePulse <alerts@savepulse.cloud>",
        PUBLIC_URL: "https://savepulse.cloud"
      }
    });

    assert.equal(result.ok, true);
    assert.equal(result.provider, "resend");
    assert.equal(result.id, "resend-message-123");
    assert.equal(request.url, "https://api.resend.com/emails");
    assert.equal(request.options.headers.authorization, "Bearer resend_test_key");
    assert.equal(request.body.from, "SavePulse <alerts@savepulse.cloud>");
    assert.deepEqual(request.body.to, ["member@example.com"]);
  } finally {
    global.fetch = originalFetch;
  }
});
