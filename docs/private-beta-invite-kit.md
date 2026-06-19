# SavePulse Private Beta Invite Kit

Last reviewed: 2026-06-19

Use this kit for the first controlled Tiny Beta group. Start with 10 people only. Do not invite the full 30-person group until signup, email delivery, logs, and feedback are reviewed.

## Beta Status To Communicate

SavePulse is in Private Early Beta. It helps people review exchange-rate, gold, and BTC reference data before large money decisions.

Be clear about what it is not:

- Not financial advice.
- Not investment advice.
- Not a trading signal.
- Not a money exchange service.
- Not a guarantee of future rates or outcomes.

## Who To Invite First

Prioritize people with real practical pain:

- People who exchange THB/USD/JPY/EUR.
- People receiving income in foreign currency.
- People planning travel or tuition payments.
- Gold buyers or gold watchers.
- People watching BTC as a reference asset.
- SME import/export owners.
- Finance or operations people who think in invoice cost.

Avoid inviting people who only want to test random apps but do not have a real exchange-rate decision.

## Thai Invite Message

```text
สวัสดีครับ ผมกำลังเปิด Private Beta ของ SavePulse ให้ลองกลุ่มเล็กก่อน

SavePulse เป็นเว็บช่วยเช็กข้อมูลประกอบก่อนแลกเงินก้อนใหญ่ เช่น USD/THB, JPY/THB, EUR/THB รวมถึงทองและ BTC โดยสรุปเป็นภาษาคน ไม่ใช่สัญญาณเทรด และไม่ใช่คำแนะนำการลงทุน

อยากชวนคุณลองใช้ฟรีและช่วยให้ feedback หน่อยครับ:
https://savepulse.cloud

สิ่งที่อยากให้ลอง:
1. เปิดเว็บแล้วเข้าใจไหมใน 5 วินาทีว่าเว็บช่วยอะไร
2. สมัครอีเมล
3. บอกผมว่าคู่เงิน/ทอง/BTC ที่คุณสนใจจริงคืออะไร
4. หลังได้รับ Daily Pulse แบบทดสอบ ช่วยดูว่าอ่านง่ายไหมและมีอะไรสับสนไหม

ตอนนี้ยังเป็น beta แบบควบคุม ยังไม่มีการเปิดจ่ายเงินจริง และยังไม่ใช่บริการแลกเงินครับ
```

## English Invite Message

```text
Hi, I am opening a small Private Beta for SavePulse.

SavePulse helps people review exchange-rate, gold, and BTC reference data before large currency decisions. It is written in plain language. It is not a trading signal, investment advice, or a money exchange service.

You can try it here:
https://savepulse.cloud

What I would love feedback on:
1. Do you understand what SavePulse does within 5 seconds?
2. Does the website feel trustworthy?
3. Which currency, gold, or BTC pair do you actually care about?
4. After receiving a test Daily Pulse, is the email useful and easy to read?

This is a controlled beta. Paid checkout is not open yet.
```

## First Reply To Ask For

Ask every invited user to reply with:

```text
1. Email used to sign up:
2. Pair or asset I care about:
3. Why I care about it:
4. I want updates: daily / only when important / not sure yet
```

## Operator Tracking Table

Use a simple sheet with these columns:

```text
Name
Email
User type
Primary pair or asset
Invited date
Signed up
Manual Daily Pulse sent
Inbox received
Spam issue
Feedback received
Would use every morning
Potential tier
Notes
```

Suggested `User type` values:

```text
Personal exchanger
Foreign-income receiver
Traveler/student
Gold watcher
BTC watcher
SME importer/exporter
Finance/operator
Other
```

## Feedback Questions

Ask these after they see the website:

- Did you understand what SavePulse does within 5 seconds?
- Did the website feel trustworthy?
- Was anything confusing?
- Did it feel like financial advice or a trading signal?
- Which currency/gold/BTC pair do you actually care about?
- Would you want this every morning?
- Would you pay `$5/mo`, `$15/mo`, or `$59/mo` for the relevant tier?

Ask these after they receive a Daily Pulse email:

- Did the subject feel worth opening?
- Was the email readable on mobile?
- Was the wording clear?
- Did anything feel too risky, pushy, or like a trading instruction?
- Was unsubscribe/disclaimer visible enough?
- What would make the email more useful tomorrow?

## First 10 User Launch Flow

1. Send the invite manually.
2. Ask the user to sign up at `https://savepulse.cloud`.
3. Record the signup email and primary pair/asset.
4. Verify subscriber state before sending any email.
5. Dry run the Daily Pulse send for selected beta emails.
6. Send a manual Daily Pulse only to selected beta emails.
7. Check email logs immediately.
8. Ask each user to check Inbox, Spam, Promotions, and Trash.
9. Collect feedback before inviting the next group.

## Do Not Do During First 10 Users

- Do not enable `DAILY_EMAIL_ENABLED`.
- Do not send Daily Pulse to all subscribers.
- Do not open public checkout.
- Do not run Stripe Live test.
- Do not launch ads.
- Do not add new backend features.
- Do not add LINE alerts.
- Do not promise better rates or outcomes.

## Expand To 30 Only If

- The first 10 users can sign up without confusion.
- Manual Daily Pulse send works.
- Email logs show low or no failures.
- No spam complaints.
- Users understand that SavePulse is decision support, not trading advice.
- At least several users say they would want the email again.
- Production signals remain fresh for all 9 tracked symbols.
