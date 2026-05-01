// EmailPassword — creates the auth.users row mid-onboarding. We do this
// here (not at the end) so the rest of the screens can write directly
// to profiles via upsertProfile while the user fills them in. If the
// user closes the tab mid-flow we still have a real account they can
// resume later via Sign In.
import { useState, useEffect, useRef } from "react";
import { PrimaryButton, BigInput, ScreenHeader, ScreenIn, ErrorStrip } from "../atoms.jsx";
import { supabase } from "../../../../../lib/supabase.js";

const PASSWORD_RULE_TEXT = "Min 10 characters, with upper- & lowercase letters and a number.";

function validateEmail(email){ return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()); }
function validatePassword(pw){
  if(!pw || pw.length < 10) return false;
  if(!/[a-z]/.test(pw)) return false;
  if(!/[A-Z]/.test(pw)) return false;
  if(!/[0-9]/.test(pw)) return false;
  return true;
}
// Mirror AuthModal's mapAuthError mapping so the user sees the same friendly
// strings whether they entered via the legacy flow or this new one.
function mapAuthError(msg){
  if(!msg) return "Something went wrong. Please try again.";
  if(msg.includes("Invalid login credentials") || msg.includes("invalid_credentials")) return "Incorrect email or password.";
  if(msg.includes("User already registered") || msg.includes("already been registered")) return "An account with this email already exists. Try Sign in instead.";
  if(msg.includes("Email not confirmed")) return "Please check your email to confirm your account first.";
  if(msg.includes("Password should be") || msg.toLowerCase().includes("weak_password") || msg.toLowerCase().includes("weak password")) return PASSWORD_RULE_TEXT;
  if(msg.includes("Unable to validate email")) return "Please enter a valid email address.";
  if(msg.includes("email_address_invalid") || (msg.includes("Email address") && msg.includes("is invalid"))) return "That email domain isn't allowed. Try a real address (e.g. gmail.com).";
  if(msg.includes("signup_disabled")) return "Sign ups are currently disabled. Contact support.";
  if(msg.includes("network") || msg.includes("fetch")) return "Connection error. Check your internet and try again.";
  return msg;
}

export default function EmailPassword({ state, set, next, T }) {
  const emailRef = useRef(null);
  useEffect(() => { if (emailRef.current) emailRef.current.focus(); }, []);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});

  const fullName = `${(state.first || "").trim()} ${(state.last || "").trim()}`.trim();
  const valid = state.email && state.password;

  async function onSubmit(){
    const fe = {};
    if(!state.email || !state.email.trim()) fe.email = "Email is required.";
    else if(!validateEmail(state.email)) fe.email = "Please enter a valid email address.";
    if(!state.password) fe.password = "Password is required.";
    else if(!validatePassword(state.password)) fe.password = PASSWORD_RULE_TEXT;
    if(Object.keys(fe).length){ setFieldErrors(fe); return; }
    setLoading(true); setError(""); setFieldErrors({});
    const r = await supabase.auth.signUp({
      email: state.email.trim(),
      password: state.password,
      options: { data: { name: fullName || undefined } },
    });
    setLoading(false);
    if(r.error){ setError(mapAuthError(r.error.message)); return; }
    next();
  }

  return (
    <ScreenIn k="s1c">
      <div style={{ flex: 1, display: "flex", flexDirection: "column", padding: "12px 28px 28px" }}>
        <ScreenHeader T={T} eyebrow="01 — Account" title="Create your account" subtitle="So we can save your progress and connect you with other players." />

        <div style={{ display: "flex", flexDirection: "column", gap: 18, marginTop: 28 }}>
          <div>
            <BigInput
              ref={emailRef}
              T={T} type="email" autoComplete="email" placeholder="Email"
              value={state.email}
              onChange={(v) => { set({ email: v }); setFieldErrors((f) => ({ ...f, email: null })); }}
              fontSize={22}
            />
            {fieldErrors.email && (
              <div style={{ marginTop: 6, fontFamily: T.font, fontSize: 12, color: "#E11D48" }}>{fieldErrors.email}</div>
            )}
          </div>
          <div>
            <BigInput
              T={T} type="password" autoComplete="new-password" placeholder="Password (min 10, Aa1)"
              value={state.password}
              onChange={(v) => { set({ password: v }); setFieldErrors((f) => ({ ...f, password: null })); }}
              fontSize={22}
            />
            {fieldErrors.password && (
              <div style={{ marginTop: 6, fontFamily: T.font, fontSize: 12, color: "#E11D48" }}>{fieldErrors.password}</div>
            )}
          </div>
        </div>

        <ErrorStrip msg={error} T={T} />

        <div style={{ flex: 1, minHeight: 12 }}/>
        <PrimaryButton T={T} disabled={!valid || loading} onClick={onSubmit}>
          {loading ? "Creating account…" : "Continue"}
        </PrimaryButton>
        <p style={{ marginTop: 12, fontFamily: T.font, fontSize: 12, color: T.muted, textAlign: "center" }}>
          By continuing, you agree to be a good sport.
        </p>
      </div>
    </ScreenIn>
  );
}
