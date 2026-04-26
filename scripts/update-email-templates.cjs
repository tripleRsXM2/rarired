// One-shot: brand the Supabase auth email templates.
// Run with: SUPABASE_ACCESS_TOKEN=... node scripts/update-email-templates.cjs
const ACCESS = process.env.SUPABASE_ACCESS_TOKEN;
const REF = "yndpjabmrkqclcxeecei";
if (!ACCESS) { console.error("SUPABASE_ACCESS_TOKEN missing"); process.exit(1); }

const wrap = (title, intro, cta, ctaLabel, footerLine) =>
`<!doctype html>
<html><body style="margin:0;padding:0;background:#f5f3f0;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;color:#14110f">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f3f0;padding:40px 20px">
    <tr><td align="center">
      <table role="presentation" width="520" cellpadding="0" cellspacing="0" style="background:#ffffff;border:1px solid #e6e2dc;border-radius:14px;padding:32px">
        <tr><td>
          <div style="font-size:11px;font-weight:800;letter-spacing:0.16em;text-transform:uppercase;color:#7a7068;margin-bottom:18px">CourtSync</div>
          <h1 style="font-size:22px;font-weight:800;letter-spacing:-0.4px;margin:0 0 14px;color:#14110f">${title}</h1>
          <p style="font-size:14px;line-height:1.55;color:#3a342f;margin:0 0 22px">${intro}</p>
          <p style="margin:0 0 26px">
            <a href="${cta}" style="display:inline-block;padding:13px 22px;background:#14110f;color:#ffffff;text-decoration:none;border-radius:9px;font-size:13px;font-weight:700;letter-spacing:0.04em">${ctaLabel}</a>
          </p>
          <p style="font-size:12px;line-height:1.5;color:#7a7068;margin:0 0 6px">If the button doesn't work, paste this URL into your browser:</p>
          <p style="font-size:12px;line-height:1.5;color:#3a342f;word-break:break-all;margin:0 0 24px"><a href="${cta}" style="color:#3a342f">${cta}</a></p>
          <hr style="border:none;border-top:1px solid #e6e2dc;margin:0 0 18px"/>
          <p style="font-size:11px;line-height:1.55;color:#9a9088;margin:0">${footerLine}</p>
        </td></tr>
      </table>
      <p style="font-size:11px;color:#9a9088;margin:18px 0 0">CourtSync &middot; Sydney</p>
    </td></tr>
  </table>
</body></html>`;

const cfg = {
  mailer_subjects_confirmation: "Welcome to CourtSync — confirm your email",
  mailer_subjects_recovery:     "Reset your CourtSync password",
  mailer_subjects_invite:       "You've been invited to CourtSync",
  mailer_subjects_magic_link:   "Your CourtSync sign-in link",
  mailer_subjects_email_change: "Confirm your new CourtSync email",

  mailer_templates_confirmation_content: wrap(
    "Confirm your email",
    "Welcome to CourtSync — Sydney's verified social tennis network. Tap the button below to confirm <b>{{ .Email }}</b> and start logging matches.",
    "{{ .ConfirmationURL }}",
    "Confirm email",
    "Didn't sign up? You can ignore this email — no account will be created without confirmation."
  ),
  mailer_templates_recovery_content: wrap(
    "Reset your password",
    "We got a request to reset the password for <b>{{ .Email }}</b>. Tap the button below to choose a new one. The link expires in 1 hour.",
    "{{ .ConfirmationURL }}",
    "Reset password",
    "Didn't request this? You can ignore this email — your password won't change unless you click the link."
  ),
  mailer_templates_magic_link_content: wrap(
    "Your sign-in link",
    "Tap the button below to sign into CourtSync as <b>{{ .Email }}</b>. The link expires in 1 hour and works only once.",
    "{{ .ConfirmationURL }}",
    "Sign in",
    "Didn't request this? You can ignore this email."
  ),
  mailer_templates_invite_content: wrap(
    "You've been invited",
    "Someone invited you to join CourtSync — Sydney's verified social tennis network. Tap below to accept and create your account.",
    "{{ .ConfirmationURL }}",
    "Accept invite",
    "If you weren't expecting this, you can ignore the email."
  ),
  mailer_templates_email_change_content: wrap(
    "Confirm your new email",
    "Confirm the change of your CourtSync email from <b>{{ .Email }}</b> to <b>{{ .NewEmail }}</b>.",
    "{{ .ConfirmationURL }}",
    "Confirm change",
    "Didn't request this change? Reach out and we'll lock it down."
  ),
};

fetch(`https://api.supabase.com/v1/projects/${REF}/config/auth`, {
  method: "PATCH",
  headers: {
    "Authorization": "Bearer " + ACCESS,
    "Content-Type": "application/json",
  },
  body: JSON.stringify(cfg),
}).then(r => r.text().then(t => {
  console.log("HTTP", r.status);
  console.log(t.slice(0, 400));
}));
