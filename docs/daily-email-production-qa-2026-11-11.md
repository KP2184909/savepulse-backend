# Daily email production QA — 2026-11-11 (Asia/Bangkok)

| Check | Result | Evidence |
| --- | --- | --- |
| Plus manual pilot | PASS | Production admin response: one recipient, one sent, zero failed or skipped; the test mailbox received the email. It contained XAU/USD, XAU/THB, BTC/USD and BTC/THB only. |
| Pro public preview | PASS for content coverage | The English production preview contained all five FX pairs (USD/THB, JPY/THB, EUR/THB, USD/JPY and EUR/USD) plus the four Plus symbols. A preview does not verify delivery. |
| Pro inbox delivery | NOT VERIFIED | No Pro production message was sent in this check. |
| Production scheduled send at 08:30 | NOT VERIFIED | The manual pilot does not invoke the scheduler. Scheduled first delivery and replay were verified in sandbox only. |

The temporary durable test flag was turned off on Render after the Plus check. The next email QA should verify a Pro message in the authorized test mailbox, followed by an isolated scheduled run that records the Bangkok run date and confirms that replay does not send a second message. Do not use a customer recipient list for QA.
