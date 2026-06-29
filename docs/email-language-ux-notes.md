# SavePulse Email Language UX Notes

Status: recommendation only  
Phase: Private Early Beta v0.9 / household pilot  
Last updated: 2026-06-29

This document captures the current bilingual Daily Pulse email findings and the recommended production direction. It is intentionally docs-only. Do not treat this file as approval to change production email behavior.

## Current Bilingual Email Test Result

The latest bilingual Daily Pulse email direction is strong enough for internal review.

- The premium teal and dark fintech style works well.
- The card system feels more polished and more trustworthy than the earlier email versions.
- The visual hierarchy is clearer across Free, Plus, Pro, and Business.
- The cards are readable on mobile.
- The primary CTA is clear.
- Disclaimer and unsubscribe content are present.
- The English-first, Thai-following layout works for internal testing and stakeholder review.

## Main Concern

Full bilingual duplication is probably too long for real production users.

Sending the full English email followed by the full Thai email can create:

- excessive scrolling
- repeated content
- weaker CTA visibility
- possible user confusion
- lower engagement on mobile

This is especially important for Pro and Business, where the email already contains multiple cards, context blocks, and footer/legal copy.

## Recommended Production Approach

Production emails should use each subscriber's language preference instead of duplicating the entire email in two languages.

Supported values:

- `language: "en"` for English
- `language: "th"` for Thai

Possible sources of the language preference:

- signup page language
- browser-detected language
- user manual language selection
- future account preference

Production email rule:

- Thai user receives Thai email only.
- English user receives English email only.
- Do not send full duplicated bilingual emails by default.

This keeps the email shorter, more focused, and easier to read on mobile.

## Bilingual Fallback Option

If bilingual email must be used temporarily during testing or early onboarding, use a lighter bilingual format:

- keep one language as primary
- add only a short summary in the second language
- avoid duplicating all cards twice
- avoid making the email too long

Example structure:

1. Full English email
2. Short Thai summary
3. Shared CTA
4. Shared disclaimer and unsubscribe

Or:

1. Full Thai email
2. Short English summary
3. Shared CTA
4. Shared disclaimer and unsubscribe

The second-language section should help comprehension without turning the email into two complete emails stacked together.

## Copy Refinement Notes

SavePulse should continue using softer, safer decision-support language.

Preferred wording:

- Use "No rush yet" instead of "Wait for now".
- Use "ยังไม่ต้องรีบ" instead of "รอก่อน" where possible.
- "Not urgent yet" is acceptable.
- Use "review", "check", "context", "decision support", and "historical data" framing.

Avoid directive language that sounds like a trading instruction.

Do not make the product sound like it is telling users exactly when to buy, sell, exchange, enter, or exit. SavePulse should help users check context before making their own decision.

## Email UX Notes

For long emails:

- Add a CTA earlier in the email, not only near the bottom.
- Keep the final CTA at the bottom too.
- Avoid making "ภาษาไทย" look like a clickable button unless it is actually a working anchor or link.
- If using a language separator, prefer copy like "Thai version below" or "อ่านภาษาไทยด้านล่าง".
- Keep disclaimer and unsubscribe visible and readable.

The CTA should stay easy to find even when the email becomes dense. This matters most for Pro and Business.

## Implementation Timing

Do not implement language-preference logic yet.

Revisit this recommendation after:

- household pilot feedback is collected
- the owner and first real household user confirm the email is understandable
- welcome email behavior is verified with a new real signup
- one manual Daily Pulse send to the pilot user succeeds
- current landing page and email stability is preserved

Until explicitly approved, keep this as a backlog recommendation only.

## Production Safety Notes

This document does not approve any of the following:

- enabling `DAILY_EMAIL_ENABLED`
- sending scheduled daily emails
- sending additional manual emails without explicit approval
- running Stripe Live
- exposing public checkout
- redesigning the homepage
- changing backend signal logic
- changing production email language behavior

