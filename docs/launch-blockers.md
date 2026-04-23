# Launch Blockers

Tracks the gap between **closed-beta-ready** (where we are) and **public-launch-ready**. Anything in this file MUST be resolved before open signup is turned on.

## Purpose

A single home for "we know this needs doing before real users" items that aren't feature work. Updated in the same commit as any change that lands or removes a blocker.

## Open

| # | Item | Owner | Blocks | Notes |
|---|------|-------|--------|-------|
| 1 | **Captcha on signup/signin** | Mikey + partner | Public launch | Supabase Auth config has `security_captcha_enabled=false`. Provider slot is set to `hcaptcha`. Need: hCaptcha or Cloudflare Turnstile sitekey + secret → paste secret to Supabase Dashboard → Attack Protection → Captcha, then wire the widget into `AuthModal.jsx` (needs `@hcaptcha/react-hcaptcha` or `@marsidev/react-turnstile`) and pass `{ options: { captchaToken } }` to `signUp` / `signInWithPassword`. Without this, an attacker can script 10k signups before our rate-limit triggers kick in. |
| 2 | **Custom SMTP sender** | Mikey | Public launch | Supabase default sender is `noreply@mail.app.supabase.io`. Some Gmail / Outlook inboxes spam-fold email verification links. Fix = Resend (3k/mo free) with a verified domain. Needs a real courtsync.* domain registered first. Until resolved, keep beta closed to people whose emails we can guarantee deliver. |

## Resolved

(none yet)

## Rule

When resolving an item: move the row from **Open** to **Resolved**, append the resolution commit SHA, and delete once the deploy has been verified.

## Last Updated By Module

- v0 — 2026-04-23, created during security hardening pass. Captures the two remaining pre-launch gaps after finding C1–C15 were all closed server-side.
