// VersionPicker — Mdawg-only A/B splash shown after sign-in.
//
// Two full-screen split buttons (V1 top half, V2 bottom half) — both
// mobile and web. On click, persists the choice in localStorage under
// `cs-app-version` so the picker doesn't re-show on refresh. To
// switch versions later, hit /version-reset (clears the flag and
// reloads).
//
// The V2 surface is a placeholder right now — when the user hands
// over the V2 Claude Design code, we swap the placeholder for the
// real design.
//
// Mounting: gated in App.jsx behind a localStorage check so production
// users on `main` are unaffected. This file lives in `features/version-
// picker/` rather than `auth/` so it's clearly experimental and easy
// to delete when we pick a winner.

import { useEffect } from "react";

const STORAGE_KEY = "cs-app-version";

export function getAppVersion() {
  try { return typeof localStorage !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null; }
  catch (_) { return null; }
}
export function setAppVersion(v) {
  try { localStorage.setItem(STORAGE_KEY, v); } catch (_) {}
}
export function clearAppVersion() {
  try { localStorage.removeItem(STORAGE_KEY); } catch (_) {}
}

// Skin tokens — locked locally so the rest of the app's theme system
// doesn't affect this splash. Cream + ink to match the editorial
// realm the user already lives in post-onboarding.
const TOK = {
  // V1 = ink (dark) / V2 = clay accent (orange) → strong visual
  // contrast between halves so the user reads them as distinct
  // choices, not stacked variants.
  v1Bg:    "#14110F",
  v1Fg:    "#F0E9DA",
  v1Muted: "rgba(240,233,218,0.55)",
  v2Bg:    "#FF5A1F",
  v2Fg:    "#14110F",
  v2Muted: "rgba(20,17,15,0.65)",
  font:    "'Space Grotesk', -apple-system, BlinkMacSystemFont, system-ui, sans-serif",
  display: "'Space Grotesk', -apple-system, BlinkMacSystemFont, system-ui, sans-serif",
  mono:    "'Geist Mono', ui-monospace, 'SF Mono', Menlo, monospace",
};

export default function VersionPicker({ onPick }) {
  // Lock body scroll while the picker is up. Restore on unmount —
  // even if the user picks one and the picker unmounts, we want
  // the chosen experience to scroll normally.
  useEffect(function () {
    var prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return function () { document.body.style.overflow = prev; };
  }, []);

  function handlePick(v) {
    setAppVersion(v);
    if (onPick) onPick(v);
  }

  return (
    <div style={{
      position:       "fixed",
      inset:          0,
      zIndex:         9000,
      display:        "flex",
      flexDirection:  "column",
      background:     TOK.v1Bg,
    }}>
      <Half
        kind="v1"
        title="V1"
        subtitle="Current app"
        body="Your existing CourtSync — feed, map, compete, profile, messaging."
        bg={TOK.v1Bg}
        fg={TOK.v1Fg}
        muted={TOK.v1Muted}
        onClick={function () { handlePick("v1"); }}
      />
      <Half
        kind="v2"
        title="V2"
        subtitle="New experience"
        body="The next-generation interface — design coming soon."
        bg={TOK.v2Bg}
        fg={TOK.v2Fg}
        muted={TOK.v2Muted}
        onClick={function () { handlePick("v2"); }}
      />
    </div>
  );
}

// ─── Half ─────────────────────────────────────────────────────────

function Half({ kind, title, subtitle, body, bg, fg, muted, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        flex:           1,
        minHeight:      0,
        appearance:     "none",
        border:         0,
        background:     bg,
        color:          fg,
        cursor:         "pointer",
        padding:        "clamp(28px, 6vw, 64px)",
        display:        "flex",
        flexDirection:  "column",
        alignItems:     "flex-start",
        justifyContent: "center",
        gap:            "clamp(10px, 1.5vw, 16px)",
        fontFamily:     TOK.font,
        position:       "relative",
        overflow:       "hidden",
        // No outline ring on hover — feels like a real surface, not
        // a button. The arrow + colour shift tells you it's tappable.
        transition:     "background 180ms cubic-bezier(.2,.8,.2,1)",
      }}
      onMouseEnter={function (e) {
        e.currentTarget.style.filter = kind === "v1" ? "brightness(1.18)" : "brightness(0.94)";
      }}
      onMouseLeave={function (e) { e.currentTarget.style.filter = "none"; }}
      onMouseDown={function (e) {
        e.currentTarget.style.transform = "scale(0.997)";
        e.currentTarget.style.transition = "transform 90ms cubic-bezier(.2,.8,.2,1), background 180ms cubic-bezier(.2,.8,.2,1)";
      }}
      onMouseUp={function (e) { e.currentTarget.style.transform = "scale(1)"; }}
    >
      {/* Top label — small mono kicker */}
      <div style={{
        fontFamily:     TOK.mono,
        fontSize:       "clamp(10px, 1.1vw, 12px)",
        fontWeight:     500,
        letterSpacing:  "0.16em",
        textTransform:  "uppercase",
        color:          muted,
      }}>
        {subtitle}
      </div>

      {/* Big version mark */}
      <div style={{
        fontFamily:     TOK.display,
        fontSize:       "clamp(72px, 14vw, 180px)",
        fontWeight:     500,
        letterSpacing:  "-0.04em",
        lineHeight:     0.9,
        color:          fg,
      }}>
        {title}
      </div>

      {/* Body copy */}
      <div style={{
        fontSize:       "clamp(14px, 1.4vw, 18px)",
        lineHeight:     1.45,
        color:          muted,
        maxWidth:       560,
        marginTop:      "clamp(4px, 0.6vw, 8px)",
      }}>
        {body}
      </div>

      {/* Right-arrow affordance — bottom-right corner so the user's
          eye is pulled toward the action. */}
      <div style={{
        position:       "absolute",
        right:          "clamp(20px, 3vw, 48px)",
        bottom:         "clamp(20px, 3vw, 48px)",
        display:        "flex",
        alignItems:     "center",
        gap:            10,
        fontFamily:     TOK.mono,
        fontSize:       "clamp(10px, 1.1vw, 12px)",
        fontWeight:     500,
        letterSpacing:  "0.16em",
        textTransform:  "uppercase",
        color:          muted,
      }}>
        <span>Continue</span>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M5 12 H 19 M 13 6 L 19 12 L 13 18" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </div>

      {/* Hairline at the centre seam — only on V2 (the lower half)
          to add a subtle dividing edge between the two surfaces. */}
      {kind === "v2" && (
        <div style={{
          position:    "absolute",
          top:         0,
          left:        0,
          right:       0,
          height:      1,
          background:  "rgba(255,255,255,0.06)",
        }}/>
      )}
    </button>
  );
}

// ─── V2 placeholder ────────────────────────────────────────────────
// Shown when the user has picked V2 but we don't have the V2 design
// yet. Once the user hands over the V2 Claude Design we swap this
// for the real screens.
export function V2Placeholder() {
  return (
    <div style={{
      minHeight:      "100dvh",
      display:        "flex",
      flexDirection:  "column",
      alignItems:     "center",
      justifyContent: "center",
      padding:        "32px 24px",
      background:     TOK.v2Bg,
      color:          TOK.v2Fg,
      fontFamily:     TOK.font,
      textAlign:      "center",
      gap:            14,
    }}>
      <div style={{
        fontFamily:     TOK.mono,
        fontSize:       11,
        letterSpacing:  "0.2em",
        textTransform:  "uppercase",
        color:          TOK.v2Muted,
      }}>V2 · placeholder</div>
      <h1 style={{
        fontFamily:     TOK.display,
        fontWeight:     600,
        fontSize:       "clamp(40px, 8vw, 96px)",
        letterSpacing:  "-0.03em",
        lineHeight:     0.95,
        margin:         0,
      }}>
        V2 lands here.
      </h1>
      <p style={{
        fontSize:       "clamp(15px, 1.5vw, 18px)",
        color:          TOK.v2Muted,
        maxWidth:       420,
        margin:         "4px 0 0",
        lineHeight:     1.5,
      }}>
        The V2 Claude Design code will be wired into this surface. For now this is
        a holding page so the picker can route you here.
      </p>
      <button
        type="button"
        onClick={function () { clearAppVersion(); window.location.reload(); }}
        style={{
          marginTop:    24,
          appearance:   "none",
          border:       "1.5px solid " + TOK.v2Fg,
          background:   "transparent",
          color:        TOK.v2Fg,
          padding:      "12px 22px",
          borderRadius: 999,
          fontFamily:   TOK.mono,
          fontSize:     11,
          fontWeight:   600,
          letterSpacing:"0.16em",
          textTransform:"uppercase",
          cursor:       "pointer",
        }}>
        ← Back to picker
      </button>
    </div>
  );
}
