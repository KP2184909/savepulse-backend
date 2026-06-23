"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  BANNED_EMAIL_WORDS_TH,
  buildDailyDigestEmail,
  buildEmailPreviewIndex,
  decisionForSignal,
  labelForSymbol,
  sampleSignals
} = require("../src/dailyDigestEmail");
const { ACTIONS } = require("../src/signalEngine");

const PLANS = ["free", "plus", "pro", "business"];

test("daily digest email renders all four SavePulse plans", () => {
  for (const plan of PLANS) {
    const template = buildDailyDigestEmail({ plan, locale: "th", signals: sampleSignals() });

    assert.equal(template.plan, plan);
    assert.match(template.subject, /SavePulse/);
    assert.match(template.html, /SavePulse/);
    assert.match(template.text, /SavePulse/);
  }
});

test("daily digest emails include legal disclaimer and unsubscribe placeholder", () => {
  for (const plan of PLANS) {
    const template = buildDailyDigestEmail({ plan, locale: "th" });

    assert.match(template.html, /ไม่ใช่คำแนะนำการลงทุน/);
    assert.match(template.html, /ยกเลิกรับอีเมล/);
    assert.match(template.html, /\{\{unsubscribe_url\}\}/);
  }
});

test("daily digest emails avoid high-risk Thai marketing words", () => {
  for (const plan of PLANS) {
    const template = buildDailyDigestEmail({ plan, locale: "th" });
    const combined = `${template.subject}\n${template.text}\n${template.html}`;

    for (const bannedWord of BANNED_EMAIL_WORDS_TH) {
      assert.equal(combined.includes(bannedWord), false, `${plan} contains ${bannedWord}`);
    }
  }
});

test("approved premium email design is used for every plan", () => {
  for (const plan of PLANS) {
    const template = buildDailyDigestEmail({ plan, locale: "th", signals: sampleSignals() });

    assert.match(template.html, /x-apple-disable-message-reformatting/);
    assert.match(template.html, /class="hero-title"/);
    assert.match(template.html, /max-width:600px/);
    assert.match(template.html, /linear-gradient/);
    assert.match(template.html, /box-shadow/);
  }
});

test("premium email cards display the real signal percentile", () => {
  const template = buildDailyDigestEmail({
    plan: "free",
    locale: "th",
    signals: [{
      symbol: "USDTHB",
      action: ACTIONS.WAIT_ZONE,
      percentile: { percent: 63 },
      receivedAt: new Date().toISOString()
    }]
  });

  assert.match(template.html, />63%<\/div>/);
  assert.match(template.html, /width:63%/);
});

test("plan previews reveal the right paid feature ladder", () => {
  const free = buildDailyDigestEmail({ plan: "free", locale: "th" }).html;
  const plus = buildDailyDigestEmail({ plan: "plus", locale: "th" }).html;
  const pro = buildDailyDigestEmail({ plan: "pro", locale: "th" }).html;
  const business = buildDailyDigestEmail({ plan: "business", locale: "th" }).html;

  assert.match(free, /ข้อมูลเต็มยังล็อกไว้/);
  assert.match(free, /เฉพาะ Pro/);
  assert.match(plus, /อัปเกรดเป็น Pro/);
  assert.match(pro, /ทองคำ และบิตคอยน์/);
  assert.match(business, /สรุปผลกระทบค่าเงินต่อใบแจ้งหนี้วันนี้/);
  assert.match(business, /USD 148,250/);
  assert.match(business, /ใบแจ้งหนี้ที่น่าติดตาม/);
  assert.match(business, /ต้นทุนเพิ่มขึ้นโดยประมาณ/);
  assert.match(business, /ต้นทุนลดลงโดยประมาณ/);
  assert.match(business, /เทียบกับเรทอ้างอิงก่อนหน้า/);
});

test("email preview index and Netlify route are available", () => {
  const html = buildEmailPreviewIndex("th");
  const redirects = fs.readFileSync(path.join(__dirname, "..", "public", "_redirects"), "utf8");

  assert.match(html, /SavePulse Email Preview/);
  assert.match(redirects, /\/email-preview\/\*/);
});

test("daily digest labels include the user-facing JPYTHB direction", () => {
  const label = labelForSymbol("JPYTHB", "th");

  assert.equal(label.from, "THB");
  assert.equal(label.to, "JPY");
  assert.equal(label.name, "บาทไทย → เยนญี่ปุ่น");
});

test("daily digest direction-aware copy keeps JPYTHB favorable for JPY to THB", () => {
  const decision = decisionForSignal(
    {
      symbol: "JPYTHB",
      action: ACTIONS.BUY_ZONE,
      receivedAt: new Date().toISOString()
    },
    "th",
    { from: "JPY", to: "THB" }
  );

  assert.equal(decision.title, "เริ่มน่าจับตา");
  assert.match(decision.short, /ถ้าคุณถือ JPY อยู่/);
});

test("daily digest direction-aware copy inverts JPYTHB for THB to JPY", () => {
  const decision = decisionForSignal(
    {
      symbol: "JPYTHB",
      action: ACTIONS.BUY_ZONE,
      receivedAt: new Date().toISOString()
    },
    "th",
    { from: "THB", to: "JPY" }
  );

  assert.equal(decision.title, "รอก่อน");
  assert.match(decision.short, /JPY เริ่มแพงขึ้นเมื่อเทียบกับ THB/);
});

test("plus daily digest uses user-facing direction for JPYTHB row", () => {
  const template = buildDailyDigestEmail({
    plan: "plus",
    locale: "th",
    signals: [
      {
        symbol: "JPYTHB",
        action: ACTIONS.BUY_ZONE,
        percentile: { percent: 21 },
        receivedAt: new Date().toISOString()
      }
    ]
  });

  assert.match(template.text, /บาทไทย → เยนญี่ปุ่น/);
  assert.match(template.text, /รอก่อน/);
  assert.match(template.text, /เรทอ้างอิง JPY\/THB อยู่ในโซนที่ควรทบทวนแผนก่อนตัดสินใจ/);
  assert.match(template.text, /ระดับข้อสังเกต: ต่ำ/);
  assert.doesNotMatch(template.text, /BUY_ZONE|SELL_ZONE|STRONG_BUY|WAIT_ZONE/);
});
