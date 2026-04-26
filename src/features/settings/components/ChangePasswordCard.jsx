// ChangePasswordCard.jsx
//
// Industry-standard "change password" surface inside Settings → Account.
//
// UX rules:
//   1. Collapsed by default — a single row "Change password" with a chevron.
//      Avoids cluttering the Account section for users who never need it.
//   2. Three fields: Current password, New password, Confirm new password.
//   3. We RE-AUTHENTICATE the user with their current password BEFORE
//      calling supabase.auth.updateUser({password}). Supabase's updateUser
//      does NOT verify the old password (that's by design — the session
//      token is the auth), but skipping a current-password check is a
//      well-known footgun: anyone with a hijacked browser tab can lock
//      the real owner out. We follow Google/GitHub/Stripe's pattern.
//   4. Password rules surfaced live (icon ✓ when satisfied) — no surprise
//      server-side rejection.
//   5. New password ≠ current password (Supabase rejects this with
//      "same_password"; we pre-empt + show a clearer message).
//   6. Show/Hide eye toggle on each field.
//   7. Success: toast, collapse, clear fields. Session stays valid.
//   8. Errors are inline, never destructive (no clearing of fields on
//      failure — user shouldn't have to re-type everything).
//
// The password policy MUST mirror the Supabase project's auth policy
// (today: ≥10 chars, lower + upper + digit). If you change the policy
// in Supabase, change the rules array below in lockstep.

import { useState, useMemo } from "react";
import { supabase } from "../../../lib/supabase.js";
import { inputStyle } from "../../../lib/theme.js";
import { track } from "../../../lib/analytics.js";

// Each rule: { id, label, test } — test(pw) → boolean.
// The list is rendered inline so the user knows exactly what's missing
// and never gets surprised by a server-side rejection.
var PASSWORD_RULES = [
  { id: "len",    label: "At least 10 characters", test: function(pw){ return !!pw && pw.length >= 10; } },
  { id: "lower",  label: "A lowercase letter",     test: function(pw){ return /[a-z]/.test(pw||""); } },
  { id: "upper",  label: "An uppercase letter",    test: function(pw){ return /[A-Z]/.test(pw||""); } },
  { id: "digit",  label: "A number",               test: function(pw){ return /[0-9]/.test(pw||""); } },
];

function passwordIsStrong(pw){
  for(var i=0;i<PASSWORD_RULES.length;i++){
    if(!PASSWORD_RULES[i].test(pw)) return false;
  }
  return true;
}

function EyeButton({ shown, onToggle, t }){
  // 18×18 line-art glyph, stroke=currentColor, per project icon rule
  // (CLAUDE.md: never use emoji as icons; never inline a one-off SVG
  // that doesn't follow the line-art style).
  var glyph = shown
    ? (
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M2 9s2.5-5 7-5 7 5 7 5"/>
        <path d="M2 15l13-13"/>
        <circle cx="9" cy="9" r="2.2"/>
      </svg>
    )
    : (
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M1.5 9s2.7-5.5 7.5-5.5S16.5 9 16.5 9 13.8 14.5 9 14.5 1.5 9 1.5 9z"/>
        <circle cx="9" cy="9" r="2.5"/>
      </svg>
    );
  return (
    <button type="button"
      onClick={onToggle}
      aria-label={shown ? "Hide password" : "Show password"}
      style={{
        position:"absolute", right:8, top:"50%", transform:"translateY(-50%)",
        background:"transparent", border:"none", padding:6,
        color:t.textTertiary, cursor:"pointer", display:"flex",
      }}>
      {glyph}
    </button>
  );
}

export default function ChangePasswordCard({ t, authUser, toast }){
  var iStyle = inputStyle(t);
  var [open,setOpen] = useState(false);
  var [busy,setBusy] = useState(false);
  var [current,setCurrent] = useState("");
  var [next,setNext] = useState("");
  var [confirm,setConfirm] = useState("");
  var [showCurrent,setShowCurrent] = useState(false);
  var [showNext,setShowNext] = useState(false);
  var [error,setError] = useState("");

  var rules = useMemo(function(){
    return PASSWORD_RULES.map(function(r){
      return { id:r.id, label:r.label, ok:r.test(next) };
    });
  },[next]);

  var canSubmit =
    !busy &&
    !!current &&
    !!next &&
    passwordIsStrong(next) &&
    next === confirm &&
    next !== current;

  function reset(){
    setCurrent(""); setNext(""); setConfirm("");
    setShowCurrent(false); setShowNext(false);
    setError("");
  }

  async function submit(){
    setError("");
    if(!authUser || !authUser.email){
      setError("You're signed out. Sign in again before changing your password.");
      return;
    }
    if(next === current){
      setError("Your new password must be different from the current one.");
      return;
    }
    if(!passwordIsStrong(next)){
      setError("New password doesn't meet the requirements yet.");
      return;
    }
    if(next !== confirm){
      setError("New passwords don't match.");
      return;
    }
    setBusy(true);
    // Step 1 — re-authenticate with the current password. Supabase's
    // updateUser does not verify the old password; running an explicit
    // signInWithPassword keeps a hijacked tab from silently swapping
    // the password. signInWithPassword refreshes the session in place
    // — no logout side-effect.
    var auth = await supabase.auth.signInWithPassword({
      email: authUser.email,
      password: current,
    });
    if(auth.error){
      setBusy(false);
      var msg = auth.error.message || "";
      if(msg.toLowerCase().includes("invalid") || msg.includes("Invalid login credentials")){
        setError("Current password is incorrect.");
      } else {
        setError(msg || "Couldn't verify your current password.");
      }
      return;
    }
    // Step 2 — update the password.
    var upd = await supabase.auth.updateUser({ password: next });
    setBusy(false);
    if(upd.error){
      var um = upd.error.message || "";
      if(um.toLowerCase().includes("same_password") || um.toLowerCase().includes("should be different")){
        setError("Your new password must be different from the current one.");
      } else if(um.includes("Password should be") || um.toLowerCase().includes("weak_password")){
        setError("Password doesn't meet the policy. Check the rules above.");
      } else {
        setError(um || "Couldn't update password. Try again.");
      }
      return;
    }
    track("password_changed", { from:"settings" });
    if(toast) toast("Password updated", "success");
    reset();
    setOpen(false);
  }

  // Collapsed row — looks identical in shape to Sign out below it.
  if(!open){
    return (
      <button
        type="button"
        onClick={function(){ setOpen(true); }}
        style={{
          width:"100%", padding:"14px 16px", border:"none",
          borderTop:"1px solid "+t.border,
          background:"transparent", color:t.text,
          fontSize:13, fontWeight:600, textAlign:"left", cursor:"pointer",
          display:"flex", alignItems:"center", gap:10,
        }}>
        <span style={{flex:1}}>Change password</span>
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{color:t.textTertiary}}>
          <path d="M5 3l4 4-4 4"/>
        </svg>
      </button>
    );
  }

  // Expanded form.
  var labelStyle = {
    fontSize:10, fontWeight:700, color:t.textSecondary,
    display:"block", marginBottom:6,
    letterSpacing:"0.12em", textTransform:"uppercase",
  };
  return (
    <div style={{
      padding:"16px", borderTop:"1px solid "+t.border,
    }}>
      <div style={{
        display:"flex", alignItems:"center", justifyContent:"space-between",
        marginBottom:14,
      }}>
        <span style={{fontSize:13, fontWeight:700, color:t.text}}>Change password</span>
        <button type="button"
          onClick={function(){ reset(); setOpen(false); }}
          style={{
            background:"none", border:"none", padding:"4px 6px",
            color:t.textSecondary, fontSize:11, fontWeight:700,
            letterSpacing:"0.12em", textTransform:"uppercase",
            cursor:"pointer",
          }}>
          Cancel
        </button>
      </div>

      {/* Current password */}
      <div style={{marginBottom:12}}>
        <label style={labelStyle}>Current password</label>
        <div style={{position:"relative"}}>
          <input
            type={showCurrent ? "text" : "password"}
            value={current}
            autoComplete="current-password"
            onChange={function(e){ setCurrent(e.target.value); setError(""); }}
            style={Object.assign({}, iStyle, {paddingRight:38})}
            placeholder="Your current password"
          />
          <EyeButton t={t} shown={showCurrent} onToggle={function(){ setShowCurrent(function(v){return !v;}); }}/>
        </div>
      </div>

      {/* New password */}
      <div style={{marginBottom:10}}>
        <label style={labelStyle}>New password</label>
        <div style={{position:"relative"}}>
          <input
            type={showNext ? "text" : "password"}
            value={next}
            autoComplete="new-password"
            onChange={function(e){ setNext(e.target.value); setError(""); }}
            style={Object.assign({}, iStyle, {paddingRight:38})}
            placeholder="New password"
          />
          <EyeButton t={t} shown={showNext} onToggle={function(){ setShowNext(function(v){return !v;}); }}/>
        </div>
      </div>

      {/* Live rule checklist — neutral grey when not yet satisfied,
          green check when met. Surfacing the rules inline is the
          single biggest UX win vs. a single "policy: …" hint. */}
      <ul style={{
        margin:"0 0 12px", padding:0, listStyle:"none",
        display:"grid", gap:4,
      }}>
        {rules.map(function(r){
          return (
            <li key={r.id} style={{
              display:"flex", alignItems:"center", gap:8,
              fontSize:11.5, color: r.ok ? t.green : t.textSecondary,
              transition:"color 0.12s",
            }}>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                {r.ok
                  ? <path d="M3 7.5l3 3 5-6"/>
                  : <circle cx="7" cy="7" r="3"/>
                }
              </svg>
              <span style={{letterSpacing:"-0.1px"}}>{r.label}</span>
            </li>
          );
        })}
      </ul>

      {/* Confirm */}
      <div style={{marginBottom:12}}>
        <label style={labelStyle}>Confirm new password</label>
        <input
          type={showNext ? "text" : "password"}
          value={confirm}
          autoComplete="new-password"
          onChange={function(e){ setConfirm(e.target.value); setError(""); }}
          style={iStyle}
          placeholder="Repeat new password"
        />
        {!!confirm && next !== confirm && (
          <div style={{fontSize:10.5, color:t.red, marginTop:5, fontWeight:600, letterSpacing:"0.04em"}}>
            Passwords don't match.
          </div>
        )}
      </div>

      {/* Inline error strip — same hairline style as AuthModal */}
      {!!error && (
        <div style={{
          marginBottom:12,
          paddingTop:10, paddingBottom:10,
          borderTop:"1px solid "+t.border,
          display:"flex", gap:10, alignItems:"baseline",
        }}>
          <span style={{
            fontSize:9, fontWeight:800, letterSpacing:"0.16em",
            textTransform:"uppercase", color:t.red, flexShrink:0,
          }}>
            Error
          </span>
          <span style={{
            fontSize:12, color:t.text,
            lineHeight:1.4, letterSpacing:"-0.1px",
          }}>{error}</span>
        </div>
      )}

      <button
        type="button"
        disabled={!canSubmit}
        onClick={submit}
        style={{
          width:"100%", padding:"12px", borderRadius:8, border:"none",
          background: canSubmit ? t.accent : t.border,
          color:"#fff", fontSize:13, fontWeight:700,
          letterSpacing:"0.04em",
          cursor: canSubmit ? "pointer" : "not-allowed",
          opacity: canSubmit ? 1 : 0.65,
        }}>
        {busy ? "Updating…" : "Update password"}
      </button>
    </div>
  );
}
