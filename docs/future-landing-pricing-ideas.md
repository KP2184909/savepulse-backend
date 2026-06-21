# Future Landing And Pricing Ideas

Last reviewed: 2026-06-21

Status: Research backlog only. Do not implement during Private Early Beta v0.9.

This note captures future visual, engagement, and localized pricing ideas for SavePulse. The current production landing page, email templates, pricing, backend, scheduler, and checkout must remain unchanged until the household pilot and the review gates at the end of this document are complete.

Concept image references:

- `65C0A6F9-862C-434D-8F4B-00ED91761888.PNG`
- `59638D71-5B23-43F7-ACF9-2FCD37568561.PNG`
- `FB759A76-42AC-4AA7-AF9A-7F424C282C5E.PNG`

These images are inspiration only. They are not approved production designs, data examples, claims, prices, or copy.

## 1. Visual Direction

Explore a more premium, emotional, and high-engagement mobile landing experience:

- Mobile-first fintech aesthetic.
- Dark teal, mint, and restrained neon gradients.
- Glass-like cards with clear hierarchy and readable contrast.
- A large emotional headline centered on checking before exchanging.
- Rate cards that feel current and responsive without implying live trading.
- A visually rewarding primary CTA.
- A repeatable "check before exchange" habit loop.

Possible three-screen landing sequence:

1. Hero and instant hook: explain the value within five seconds.
2. Today's watchlist and hidden-cost insight: show how a small rate difference may affect the final amount.
3. Daily Pulse signup and Early Beta conversion: offer cognitive relief and a clear next step.

Visual energy must not reduce readability, accessibility, mobile performance, or legal clarity. All displayed rates, activity counts, confidence values, time labels, ranges, and user counts must come from real data or be clearly labeled examples.

## 2. Engagement And FOMO Mechanics

Preserve these ideas conceptually without creating deceptive urgency:

- **Information gap:** "What should I check before exchanging today?"
- **Loss aversion:** A small rate difference can affect the final amount.
- **Reward anticipation:** A clear CTA, Daily Pulse, and progressively available insights.
- **Curiosity:** Locked Plus, Pro, and Business previews may explain what each tier adds.
- **Social proof:** Show beta-user or activity counts only when measured and true.
- **Scarcity:** Mention Early Beta or a limited pilot only while it is genuinely limited.
- **Habit loop:** Build a useful morning Daily Pulse routine after delivery is proven reliable.
- **Cognitive relief:** Users should not need to monitor charts themselves.

Do not use fabricated counters, false countdowns, artificial scarcity, or decorative confidence percentages that are not backed by defined data.

## 3. Safe FOMO Principle

Core principle:

> ไม่ใช่กลัวพลาดกำไร แต่กลัวเสียเปรียบจากการแลกเงินโดยไม่เช็กข้อมูลก่อน

Approved direction:

- เช็กก่อนแลก
- ลดโอกาสเสียเปรียบ
- ข้อสังเกตจากข้อมูลย้อนหลัง
- เรทค่อนข้างดี
- เริ่มน่าจับตา
- ยังไม่ต้องรีบ
- ใช้ประกอบการตัดสินใจ
- ไม่รับประกันเรทในอนาคต

Avoid in marketing and decision copy:

- กำไร
- ทำกำไร
- สัญญาณซื้อขาย
- ซื้อเลย
- ขายเลย
- แลกเลย
- ต้องแลก
- จุดเข้า
- พลาดกำไร
- รับประกัน, except inside an explicit disclaimer such as `ไม่รับประกันเรทในอนาคต`
- win rate
- profit
- guaranteed
- buy signal
- sell signal
- entry
- take profit

Some generated concepts contain wording such as `ได้เปรียบ`, `ไม่พลาดโอกาส`, `ปลอดภัย 100%`, or `สัญญาณ`. Treat these as visual placeholders only. Do not copy them into production. Any future wording must pass a separate compliance review.

## 4. Localized Pricing Research

These numbers are hypotheses for later validation. They are not approved production prices.

### Possible Early Beta Pricing

| Plan | International | Thailand |
| --- | ---: | ---: |
| Free | $0 | ฿0 |
| Plus | $5/month | ฿149/month |
| Pro | $15/month | ฿399/month |
| Business | $59/month | ฿1,490/month |

### Possible Future Public Pricing

| Plan | International | Thailand |
| --- | ---: | ---: |
| Plus | $7/month | ฿199/month |
| Pro | $19/month | ฿499/month |
| Business | $79/month | ฿1,990/month |

Before adopting localized pricing, review taxes, payment-provider fees, currency display rules, refund language, plan entitlements, and whether regional pricing is operationally supportable.

## 5. Pricing Psychology

- Plus should feel like a low-friction personal subscription.
- Pro should communicate strong value for serious personal users without manipulating them.
- Business should be positioned as B2B decision support, not inexpensive consumer software.
- Use `Early Beta pricing` rather than heavy discount or countdown language.
- Do not claim ROI, profit, guaranteed savings, or guaranteed exchange outcomes.
- Business copy should focus on invoice exposure and THB cost impact, not trading-style profit and loss.

## 6. Package Positioning

### Free

- One watched item.
- Daily Pulse Lite.
- Good for trying the checking habit.

### Plus

- Personal exchange decisions.
- More watched items.
- Best suited to people exchanging currencies.

### Pro

- FX, gold, and BTC coverage.
- Fuller radar and daily decision cards.
- Best suited to serious personal users.

### Business

- Invoice exposure.
- THB cost-impact monitoring.
- Best suited to import/export SMEs and finance teams.

Package names, limits, entitlements, and prices must be validated together before any future implementation. Locked cards should explain value without pretending unavailable features already exist.

## 7. Review Gates Before Implementation

Do not implement these ideas until all of the following are complete:

- The household pilot is completed.
- Feedback from the owner's wife or first real user is recorded.
- Welcome email delivery is verified with a new subscriber.
- One manual Daily Pulse to one verified user succeeds after a dry run.
- Email logs and mobile inbox rendering are reviewed.
- At least a few real beta users confirm that they understand the product.
- Current landing-page and email stability is preserved.
- Any social proof or scarcity claim has a real, auditable source.
- Any new pricing has explicit owner approval and a separate checkout-readiness review.

## 8. Future Batch Implementation Rules

When the gates pass, review and batch the work rather than making frequent production edits:

1. Convert pilot feedback into a prioritized problem list.
2. Separate visual experiments from copy, pricing, and backend changes.
3. Prototype without publishing to production.
4. Validate mobile readability, accessibility, performance, real-data binding, and compliance.
5. Approve final copy and pricing explicitly.
6. Publish one reviewed production batch and monitor it.

Until then:

- Do not edit production UI or homepage copy from this note.
- Do not edit email templates or pricing from this note.
- Do not change backend logic.
- Do not enable `DAILY_EMAIL_ENABLED`.
- Do not send email because of this research note.
- Do not run Stripe Live or expose checkout.
- Do not add the conceptual features shown in the images.

