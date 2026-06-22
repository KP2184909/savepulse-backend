# Future Premium Email And Landing Design Direction

Last reviewed: 2026-06-22

Status: Design backlog only. Do not implement during Private Early Beta v0.9.

This note captures future visual direction for a more premium, emotionally engaging, and FOMO-aware SavePulse experience. The current production homepage, email templates, pricing, backend behavior, scheduler, and checkout must remain stable until the household pilot is complete and the owner explicitly approves an implementation batch.

Concept image references:

- `5D361048-8120-4F82-A771-FCF19555F97E.PNG` — Business email concept.
- `6095A1C7-6600-4300-89DD-188EF2BF84BA.PNG` — Pro email concept.
- `937814E9-ED7A-4308-9AED-316ADD4F8D3D.PNG` — Plus email concept.
- `A1CBE3C0-88CE-4B69-8B0E-5FF17CEEAA1E.PNG` — Free email concept.

These images are visual inspiration only. They are not approved production designs, copy, calculations, confidence values, prices, product entitlements, or claims.

## 1. Overall Visual Direction

Explore a premium fintech presentation with:

- Dark teal foundations with mint and aqua highlights.
- A clean white outer email frame for trust and inbox readability.
- Rounded, glass-like cards with controlled glow and clear boundaries.
- Strong visual hierarchy that remains easy to scan on a phone.
- High mobile readability with generous line height and stable card widths.
- Subtle chart shapes and motion cues that communicate recency without looking like a trading terminal.
- An emotionally engaging primary CTA that remains calm and credible.
- Elegant, trustworthy visual polish rather than noisy or spam-like urgency.

The design should feel alive, but it must not imply real-time execution, guaranteed accuracy, or automatic financial action. Every rate, percentage, range, date, invoice amount, comparison, and activity count must be generated from defined real data or clearly labeled as an example.

### Email-Client Constraints

Future email implementation must account for Gmail, Apple Mail, Outlook, dark mode, image blocking, and narrow screens:

- Treat glow, charts, and motion as progressive enhancement, not required information.
- Do not depend on JavaScript, video, hover, animation, backdrop blur, or unsupported CSS.
- Preserve meaning when background images and decorative graphics are blocked.
- Use accessible live text for important values instead of baking them into images.
- Keep the core layout compatible with table-based email rendering and inline CSS.
- Maintain sufficient contrast and tappable CTA dimensions.
- Include a plain-text version, disclaimer, and unsubscribe link.

## 2. Package Email Direction

### Free — Daily Pulse Lite

Purpose: establish the basic daily checking habit with minimal cognitive load.

- One main decision card.
- One historical-context card.
- One locked Gold/BTC teaser that explains the paid tier without implying access already exists.
- One CTA to view today's card.
- Short, readable, and useful within seconds.
- Keep advanced metrics and dense multi-asset content out of this tier.

### Plus — Personal Watchlist

Purpose: provide a more personal view for people making currency-exchange decisions.

- Multiple watched currency items.
- A stronger personal-watchlist feel.
- Approximately three stacked cards with consistent structure.
- A restrained Pro teaser for broader asset coverage.
- More useful than Free while remaining simple and highly readable.
- Avoid filling the email with technical indicators or decorative percentages.

### Pro — Full Radar

Purpose: provide a premium multi-asset overview for serious personal users.

- Currencies, gold, and BTC in one email.
- A premium radar-like identity without presenting the product as a trading platform.
- Denser information than Plus, but still easy to scan on mobile.
- Clear grouping by currencies, gold, and BTC.
- A replay or recent-history context card.
- A strong `Full Radar` CTA using safe decision-support language around it.
- Progressive detail so the most important observation appears before secondary metrics.

### Business — Invoice Cost Impact

Purpose: help import/export SMEs and finance teams understand currency-driven invoice cost changes.

- Executive and operational tone.
- Summary cards for monitored invoice exposure, nearest due date, and current cost pressure.
- A practical invoice list with currency, amount, due date, and estimated THB cost change.
- Clear distinction between cost increase and cost decrease.
- Plain explanation of what changed since the previous reference point.
- Focus on prioritization and planning for finance teams.
- Do not frame cost movement as trading profit or loss.
- State assumptions, reference rate, timestamp, and whether fees or spreads are excluded.

## 3. Engagement And FOMO Mechanics

Preserve these ideas without deceptive urgency:

- **Information gap:** What should I check before exchanging today?
- **Loss aversion:** A small rate difference can affect the final amount.
- **Reward anticipation:** A visually rewarding CTA and a fresh daily card.
- **Curiosity:** Locked premium cards that accurately preview additional value.
- **Habit loop:** A useful Daily Pulse each morning only after delivery operations are proven.
- **Cognitive relief:** The user does not need to monitor charts personally.
- **Business urgency:** Real invoice due dates and estimated cost impact can help teams prioritize review.

Do not use fake counters, fake scarcity, arbitrary confidence percentages, unsupported historical claims, or alarmist due-date language. Business urgency must come from real invoice data supplied or confirmed by the user.

## 4. Safety Rules

The concept images may contain risky or overly aggressive placeholders. Do not copy those phrases directly into production.

Avoid:

- กำไร
- ทำกำไร
- สัญญาณซื้อขาย
- สัญญาณ
- ซื้อเลย
- ขายเลย
- แลกเลย
- ต้องแลก
- จุดเข้า
- พลาดกำไร
- ได้เปรียบสุดๆ
- ไม่พลาดโอกาส
- ปลอดภัย 100%
- รับประกัน, except within a clear disclaimer such as `ไม่รับประกันเรทในอนาคต`
- win rate
- profit
- guaranteed
- buy signal
- sell signal
- entry
- take profit

Safer direction:

- เช็กก่อนแลก
- ลดโอกาสเสียเปรียบ
- ข้อสังเกตจากข้อมูลย้อนหลัง
- เรทค่อนข้างดี
- เริ่มน่าจับตา
- ยังไม่ต้องรีบ
- ใช้ประกอบการตัดสินใจ
- ไม่รับประกันเรทในอนาคต

Additional safeguards:

- Do not describe decorative percentages as confidence unless the metric is formally defined and tested.
- Do not present generated chart shapes as real history.
- Do not state `ทุกเช้า 08:30 น.` until scheduled delivery is enabled and operationally verified.
- Do not show an invoice calculation without its rate source, reference time, direction, and assumptions.
- Do not claim privacy or security in absolute terms.

## 5. Implementation Timing Gate

Do not implement this design direction until:

- The household pilot is completed.
- Feedback from the first real user is collected and recorded.
- Welcome email delivery is verified with a new real signup.
- One manual Daily Pulse to the verified household pilot user succeeds after a dry run.
- The production email log and mobile inbox rendering are reviewed.
- The owner explicitly approves a defined design-upgrade batch.

Current production stability takes priority over visual novelty.

## 6. Recommended Future Phases

Do not combine all changes into one production release.

### Phase 1 — Email Visual Upgrade Only

- Prototype all four package emails outside production.
- Validate Gmail, Apple Mail, Outlook, dark mode, image blocking, and narrow mobile widths.
- Keep current email data contracts and delivery logic unchanged.
- Obtain explicit visual and compliance approval before replacing templates.

### Phase 2 — Homepage Visual Upgrade

- Apply the approved visual language to the landing page separately.
- Preserve proven signup, language, live-rate conversion, legal, and mobile behavior.
- Bind every dynamic claim to real production data.
- Compare comprehension and signup feedback against the current stable page.

### Phase 3 — Pricing And Packaging Copy Alignment

- Reconcile package names, limits, email entitlements, localized pricing, and checkout readiness.
- Validate pricing with real beta feedback before publication.
- Review taxes, refunds, payment-provider behavior, and regional presentation.
- Require separate owner approval before exposing paid checkout.

## 7. Current Lockdown

Until the timing gate is complete:

- Do not edit the production homepage.
- Do not edit production email templates.
- Do not change pricing or package entitlements.
- Do not change backend logic.
- Do not enable `DAILY_EMAIL_ENABLED`.
- Do not send email because of this design note.
- Do not run Stripe Live or expose checkout.
- Do not deploy the visual concepts.

