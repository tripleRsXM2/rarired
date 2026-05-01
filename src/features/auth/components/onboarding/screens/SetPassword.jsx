// SetPassword — full-screen overlay shown when Supabase fires
// PASSWORD_RECOVERY (the user clicked the email reset link). Mirrors the
// same set-password step in AuthModal so the existing recovery flow keeps
// working when OnboardingFlow is mounted as the logged-out shell.
import { useState } from "react";
import { PrimaryButton, BigInput, ScreenHeader, ScreenIn, ErrorStrip, BrandMark } from "../atoms.jsx";
import { supabase } from "../../../../../lib/supabase.js";

const PASSWORD_RULE_TEXT = "Min 10 characters, with upper- & lowercase letters and a number.";

function validatePassword(pw){
  if(!pw || pw.length < 10) return false;
  if(!/[a-z]/.test(pw)) return false;
  if(!/[A-Z]/.test(pw)) return false;
  if(!/[0-9]/.test(pw)) return false;
  return true;
}

export default function SetPassword({ T, onDone }) {
  const [pw1, setPw1] = useState("");
  const [pw2, setPw2] = useState("");
  const [error, setError] = useState("");
  const [fe, setFe] = useState({});
  const [loading, setLoading] = useState(false);

  async function onSubmit(){
    const next = {};
    if(!validatePassword(pw1)) next.pw1 = PASSWORD_RULE_TEXT;
    if(pw1 !== pw2) next.pw2 = "Passwords don't match.";
    if(Object.keys(next).length){ setFe(next); return; }
    setLoading(true); setError("");
    const r = await supabase.auth.updateUser({ password: pw1 });
    setLoading(false);
    if(r.error){ setError(r.error.message); return; }
    if(onDone) onDone();
  }

  return (
    <ScreenIn k="set-password">
      <div style={{ flex: 1, display: "flex", flexDirection: "column", padding: "20px 28px 28px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <BrandMark T={T} size={28} />
          <span style={{ fontFamily: T.fontDisplay, fontWeight: 600, fontSize: 17, letterSpacing: "-0.01em", color: T.fg }}>
            CourtSync
          </span>
        </div>

        <div style={{ marginTop: 28 }}>
          <ScreenHeader T={T} eyebrow="Set password" title="New password" subtitle="Choose a new password for your account." />
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 18, marginTop: 24 }}>
          <div>
            <BigInput
              T={T} type="password" autoComplete="new-password" placeholder="New password"
              value={pw1} onChange={(v) => { setPw1(v); setFe((f) => ({ ...f, pw1: null })); }}
              fontSize={22}
            />
            {fe.pw1 && <div style={{ marginTop: 6, fontFamily: T.font, fontSize: 12, color: "#E11D48" }}>{fe.pw1}</div>}
          </div>
          <div>
            <BigInput
              T={T} type="password" autoComplete="new-password" placeholder="Repeat password"
              value={pw2} onChange={(v) => { setPw2(v); setFe((f) => ({ ...f, pw2: null })); }}
              fontSize={22}
            />
            {fe.pw2 && <div style={{ marginTop: 6, fontFamily: T.font, fontSize: 12, color: "#E11D48" }}>{fe.pw2}</div>}
          </div>
        </div>

        <ErrorStrip msg={error} T={T} />

        <div style={{ flex: 1, minHeight: 12 }}/>
        <PrimaryButton T={T} disabled={loading} onClick={onSubmit}>
          {loading ? "Updating…" : "Update password"}
        </PrimaryButton>
      </div>
    </ScreenIn>
  );
}
