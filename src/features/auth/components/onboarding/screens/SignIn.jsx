// SignIn — for returning users. Reused as the only screen shown to a
// logged-out visitor after they've already finished onboarding once
// (cs-onb-done flag set in localStorage).
import { useState, useEffect, useRef } from "react";
import { PrimaryButton, BigInput, ScreenHeader, ScreenIn, ErrorStrip, BrandMark, GhostButton } from "../atoms.jsx";
import { supabase } from "../../../../../lib/supabase.js";

function validateEmail(email){ return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()); }
function mapAuthError(msg){
  if(!msg) return "Something went wrong. Please try again.";
  if(msg.includes("Invalid login credentials") || msg.includes("invalid_credentials")) return "Incorrect email or password.";
  if(msg.includes("Email not confirmed")) return "Please check your email to confirm your account first.";
  if(msg.includes("network") || msg.includes("fetch")) return "Connection error. Check your internet and try again.";
  return msg;
}

export default function SignIn({ T, onBack, onCreateAccount }) {
  const emailRef = useRef(null);
  useEffect(() => { if (emailRef.current) emailRef.current.focus(); }, []);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});

  // Forgot-password sub-state. We don't navigate to a separate route — keep
  // it inline so the same screen handles both flows.
  const [forgotMode, setForgotMode] = useState(false);
  const [forgotSent, setForgotSent] = useState(false);

  async function onSubmit(){
    const fe = {};
    if(!email.trim()) fe.email = "Email is required.";
    else if(!validateEmail(email)) fe.email = "Please enter a valid email address.";
    if(!password) fe.password = "Password is required.";
    if(Object.keys(fe).length){ setFieldErrors(fe); return; }
    setLoading(true); setError(""); setFieldErrors({});
    const r = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setLoading(false);
    if(r.error){ setError(mapAuthError(r.error.message)); return; }
    // On success the auth controller fires SIGNED_IN, App.jsx unmounts
    // the OnboardingFlow and shows the main shell. No navigation needed.
  }

  async function onForgot(){
    if(!email.trim() || !validateEmail(email)){
      setError("Please enter a valid email address.");
      return;
    }
    setLoading(true); setError("");
    const r = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: window.location.origin });
    setLoading(false);
    if(r.error){ setError(mapAuthError(r.error.message)); return; }
    setForgotSent(true);
  }

  if (forgotSent) {
    return (
      <ScreenIn k="signin-forgot-sent">
        <div style={{ flex: 1, display: "flex", flexDirection: "column", padding: "20px 28px 28px", textAlign: "center", justifyContent: "center", alignItems: "center", gap: 18 }}>
          <BrandMark T={T} size={36} />
          <h1 style={{ fontFamily: T.fontDisplay, fontWeight: 600, fontSize: 28, lineHeight: 1.1, letterSpacing: "-0.025em", margin: 0, color: T.fg }}>
            Check your email
          </h1>
          <p style={{ fontFamily: T.font, fontSize: 14, color: T.muted, margin: 0, maxWidth: 320, lineHeight: 1.5 }}>
            We sent a reset link to <strong style={{ color: T.fg }}>{email}</strong>. Open it on this device to continue.
          </p>
          <div style={{ width: "100%", marginTop: 12 }}>
            <PrimaryButton T={T} onClick={() => { setForgotSent(false); setForgotMode(false); setError(""); }}>
              Back to sign in
            </PrimaryButton>
          </div>
        </div>
      </ScreenIn>
    );
  }

  return (
    <ScreenIn k={forgotMode ? "signin-forgot" : "signin"}>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", padding: "20px 28px 28px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <BrandMark T={T} size={28} />
          <span style={{ fontFamily: T.fontDisplay, fontWeight: 600, fontSize: 17, letterSpacing: "-0.01em", color: T.fg }}>
            CourtSync
          </span>
        </div>

        <div style={{ marginTop: 28 }}>
          <ScreenHeader
            T={T}
            eyebrow={forgotMode ? "Reset" : "Welcome back"}
            title={forgotMode ? "Reset password" : "Sign in to CourtSync"}
            subtitle={forgotMode ? "We'll send a reset link to your email." : null}
          />
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 18, marginTop: 24 }}>
          <div>
            <BigInput
              ref={emailRef}
              T={T} type="email" autoComplete="email" placeholder="Email"
              value={email}
              onChange={(v) => { setEmail(v); setFieldErrors((f) => ({ ...f, email: null })); }}
              fontSize={22}
            />
            {fieldErrors.email && (
              <div style={{ marginTop: 6, fontFamily: T.font, fontSize: 12, color: "#E11D48" }}>{fieldErrors.email}</div>
            )}
          </div>

          {!forgotMode && (
            <div>
              <BigInput
                T={T} type="password" autoComplete="current-password" placeholder="Password"
                value={password}
                onChange={(v) => { setPassword(v); setFieldErrors((f) => ({ ...f, password: null })); }}
                fontSize={22}
              />
              {fieldErrors.password && (
                <div style={{ marginTop: 6, fontFamily: T.font, fontSize: 12, color: "#E11D48" }}>{fieldErrors.password}</div>
              )}
            </div>
          )}

          {!forgotMode && (
            <div style={{ textAlign: "right" }}>
              <button
                type="button"
                onClick={() => { setForgotMode(true); setError(""); setFieldErrors({}); }}
                style={{
                  appearance: "none", border: 0, background: "transparent", padding: 0, cursor: "pointer",
                  color: T.muted, fontFamily: T.font, fontSize: 13, fontWeight: 500,
                  textDecoration: "underline",
                }}
              >
                Forgot password?
              </button>
            </div>
          )}
        </div>

        <ErrorStrip msg={error} T={T} />

        <div style={{ flex: 1, minHeight: 12 }}/>

        <PrimaryButton T={T} disabled={loading} onClick={forgotMode ? onForgot : onSubmit}>
          {loading ? "Please wait…" : (forgotMode ? "Send reset link" : "Sign in")}
        </PrimaryButton>

        <div style={{ marginTop: 12, display: "flex", justifyContent: "center", gap: 8, alignItems: "center" }}>
          {forgotMode ? (
            <GhostButton T={T} onClick={() => { setForgotMode(false); setError(""); }}>← Back to sign in</GhostButton>
          ) : (
            <>
              {onBack && <GhostButton T={T} onClick={onBack}>← Back</GhostButton>}
              {onCreateAccount && (
                <button
                  type="button"
                  onClick={onCreateAccount}
                  style={{
                    appearance: "none", border: 0, background: "transparent", padding: "10px 12px", cursor: "pointer",
                    color: T.fg, fontFamily: T.font, fontSize: 14, fontWeight: 600,
                  }}
                >
                  Create account →
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </ScreenIn>
  );
}
