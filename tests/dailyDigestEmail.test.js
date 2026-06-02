"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  BANNED_EMAIL_WORDS_TH,
  buildDailyDigestEmail,
  buildEmailPreviewIndex,
  sampleSignals
} = require("../src/dailyDigestEmail");

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

test("plan previews reveal the right paid feature ladder", () => {
  const free = buildDailyDigestEmail({ plan: "free", locale: "th" }).html;
  const plus = buildDailyDigestEmail({ plan: "plus", locale: "th" }).html;
  const pro = buildDailyDigestEmail({ plan: "pro", locale: "th" }).html;
  const business = buildDailyDigestEmail({ plan: "business", locale: "th" }).html;

  assert.match(free, /ข้อมูลเต็มยังล็อกไว้/);
  assert.match(free, /เฉพาะ Pro/);
  assert.match(plus, /อัปเกรดเป็น Pro/);
  assert.match(pro, /ทองคำ และบิตคอยน์/);
  assert.match(business, /USD 148,250\.00/);
  assert.match(business, /ใบแจ้งหนี้ที่น่าติดตาม/);
  assert.match(business, /ต้นทุนธุรกิจ/);
});

test("email preview index and Netlify route are available", () => {
  const html = buildEmailPreviewIndex("th");
  const redirects = fs.readFileSync(path.join(__dirname, "..", "public", "_redirects"), "utf8");

  assert.match(html, /SavePulse Email Preview/);
  assert.match(redirects, /\/email-preview\/\*/);
});
