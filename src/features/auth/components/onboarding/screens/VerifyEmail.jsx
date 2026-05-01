// VerifyEmail — terminal screen after Aha. Shown after the user finishes
// onboarding (Get started / I'll explore on my own). Tells them to check
// their email to confirm the address, and offers a "Back to sign in"
// path that signs them out + drops them on the SignIn screen so they
// can return after clicking the verification link.
//
// User feedback: 'when you get to the get started or I'll explore on
// my own it gets stuck, it should go back to a page: where it says
// verify your email; + go back to login.'
//
// Keeps the user in the onboarding shell — no navigate() — so the
// existing OnboardingFlow handles the transition cleanly.
import { useState } from "react";
import { PrimaryButton, GhostButton, ScreenIn, BrandMark, ErrorStrip } from "../atoms.jsx";
import { supabase } from "../../../../../lib/supabase.js";

export default function VerifyEmail({ T, email, onBackToSignIn }) {
  const [resending, setResending] = useState(false);
  const [resent, setResent] = useState(false);
  const [error, setError] = useState("");
  const [signingOut, setSigningOut] = useState(false);

  async function onResend(){
    if (!email) return;
    setResending(true); setError("");
    try {
      const r = await supabase.auth.resend({ type: "signup", email });
      if (r.error) {
        // "User already confirmed" is harmless — treat as success.
        if (/already confirmed/i.test(r.error.message)) {
          setResent(true);
        } else {
          setError(r.error.message || "Couldn't resend right now.");
        }
      } else {
        setResent(true);
      }
    } catch (e) {
      setError((e && e.message) || "Couldn't resend right now.");
    }
    setResending(false);
  }

  async function onBack(){
    if (signingOut) return;
    setSigningOut(true);
    // Sign the user out so the SignIn screen renders cleanly. After
    // verification the user comes back, signs in, and lands in /home.
    try { await supabase.auth.signOut(); } catch (_) {}
    setSigningOut(false);
    if (onBackToSignIn) onBackToSignIn();
  }

  return (
    <ScreenIn k="verify-email">
      <div style={{
        flex: 1, display: "flex", flexDirection: "column",
        padding: "20px 28px 28px",
        textAlign: "center", justifyContent: "center", alignItems: "center", gap: 18,
      }}>
        <BrandMark T={T} size={40}/>
        <div style={{
          fontFamily: T.font, fontSize: 12, fontWeight: 600,
          letterSpacing: "0.14em", textTransform: "uppercase", color: T.accent,
        }}>
          Almost there
        </div>
        <h1 style={{
          fontFamily: T.fontDisplay, fontWeight: 600, fontSize: 32, lineHeight: 1.1,
          letterSpacing: "-0.025em", margin: 0, color: T.fg,
        }}>
          Verify your email
        </h1>
        <p style={{
          fontFamily: T.font, fontSize: 15, color: T.muted, margin: 0,
          maxWidth: 320, lineHeight: 1.5,
        }}>
          We sent a confirmation link to{" "}
          {email
            ? <strong style={{ color: T.fg }}>{email}</strong>
            : <span>your email</span>
          }
          . Open it on this device, then sign back in to start playing.
        </p>

        {resent && (
          <div style={{
            background: T.surface, border: `1px solid ${T.line}`, borderRadius: 12,
            padding: "10px 14px", fontFamily: T.font, fontSize: 13, color: T.fg,
          }}>
            Resent — check your inbox (and spam).
          </div>
        )}

        <ErrorStrip msg={error} T={T}/>

        <div style={{ width: "100%", marginTop: 8, display: "flex", flexDirection: "column", gap: 10 }}>
          <PrimaryButton T={T} onClick={onBack} disabled={signingOut}>
            {signingOut ? "One sec…" : "Back to sign in"}
          </PrimaryButton>
          {email && (
            <GhostButton T={T} onClick={onResend} disabled={resending || resent}>
              {resending ? "Resending…" : resent ? "Email sent" : "Resend email"}
            </GhostButton>
          )}
        </div>
      </div>
    </ScreenIn>
  );
}
