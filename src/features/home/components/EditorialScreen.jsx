// src/features/home/components/EditorialScreen.jsx
//
// Shared chrome for the home-hub destination screens (Compete /
// Matches / Profile). Provides:
//   1. Sticky top bar — back chevron (round, hairline border) + a
//      JetBrains-Mono kicker that names the section.
//   2. 56px Space-Grotesk hero title block.
//   3. A body slot for the screen-specific content.
//
// The wrapper paints the cream "Editorial Tennis" background and
// fixes the Sora font family inside its tree, so any descendant that
// uses inherited font-family lands on the right typeface without each
// screen having to re-state it.
//
// Back navigation defaults to navigate(-1). Pass `onBack` to override
// (e.g. always pop to /home regardless of how the user arrived).

import { useNavigate } from "react-router-dom";

// Editorial Tennis tokens — kept in sync with HomeHub.jsx + the
// design-handoff styles.css :root. Inlined per-screen to avoid the
// global-token migration until Phase 3.
export var ED_TOK = {
  bg:         "#F0E9DA",
  bg2:        "#E8E0CE",
  ink:        "#2A201A",
  ink2:       "#4A3F36",
  muted:      "#8A7F70",
  line:       "rgba(42, 32, 26, 0.12)",
  lineStrong: "rgba(42, 32, 26, 0.22)",
  accent:     "#FF2D55",
  win:        "#3A7D44",
  loss:       "#C3392B",
  display:    "'Space Grotesk', 'Sora', ui-sans-serif, -apple-system, sans-serif",
  sans:       "'Sora', ui-sans-serif, -apple-system, 'SF Pro Text', sans-serif",
  mono:       "'JetBrains Mono', ui-monospace, 'SF Mono', Menlo, monospace",
};

// ── Shared atoms exported for screen bodies ──────────────────────

// Uppercase letter-spaced microlabel — the editorial section eyebrow.
export function MicroLabel({ children, style }) {
  return (
    <span style={Object.assign({
      fontFamily:    ED_TOK.mono,
      fontSize:      10.5,
      fontWeight:    600,
      letterSpacing: "0.14em",
      textTransform: "uppercase",
      color:         ED_TOK.muted,
    }, style || {})}>
      {children}
    </span>
  );
}

// Hairline divider used between editorial sections.
export function EdDivider({ style }) {
  return <div style={Object.assign({
    height:     1,
    background: ED_TOK.line,
    margin:     "22px 0",
  }, style || {})}/>;
}

// ── Screen wrapper ───────────────────────────────────────────────

export default function EditorialScreen({
  // Required — the small uppercase microlabel above the hero title.
  // E.g. "Tournaments & leagues" on the Compete screen.
  kicker,
  // Required — 56px hero title rendered at the top of the body.
  title,
  // Optional — back-button override. Defaults to history-back.
  onBack,
  // Optional — anything that should sit on the right of the top bar
  // (e.g. an "Edit" link on Profile). Defaults to a 32px spacer so
  // the kicker stays visually centered.
  rightAction,
  // Optional — extra content rendered between the hero title and the
  // body slot. Useful for stat strips that should sit immediately
  // under the title without an extra section wrapper.
  belowTitle,
  children,
}) {
  var navigate = useNavigate();

  function handleBack() {
    if (onBack) { onBack(); return; }
    // Pop history if we have somewhere to pop to; otherwise land on
    // /home so the user is never stranded on a destination screen
    // with no way back to the hub.
    if (typeof window !== "undefined" && window.history.length > 1) {
      navigate(-1);
    } else {
      navigate("/home");
    }
  }

  return (
    <div className="cs-ed-push" style={{
      background:    ED_TOK.bg,
      color:         ED_TOK.ink,
      fontFamily:    ED_TOK.sans,
      minHeight:     "calc(100dvh - 64px)",
      paddingBottom: 96,
    }}>
      {/* Sticky bar — back chevron + kicker + right action slot. */}
      <div style={{
        display:        "flex",
        alignItems:     "center",
        justifyContent: "space-between",
        gap:            12,
        padding:        "16px 22px 12px",
        position:       "sticky",
        top:            "var(--cs-nav-h, 0px)",
        background:     ED_TOK.bg,
        borderBottom:   "1px solid " + ED_TOK.line,
        zIndex:         2,
      }}>
        <button
          onClick={handleBack}
          aria-label="Back"
          style={{
            width:        32,
            height:       32,
            borderRadius: "50%",
            background:   "transparent",
            border:       "1px solid " + ED_TOK.line,
            color:        ED_TOK.ink,
            display:      "grid",
            placeItems:   "center",
            cursor:       "pointer",
            transition:   "background 160ms ease",
          }}
          onMouseEnter={function (e) { e.currentTarget.style.background = ED_TOK.bg2; }}
          onMouseLeave={function (e) { e.currentTarget.style.background = "transparent"; }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2"
            strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 18l-6-6 6-6"/>
          </svg>
        </button>
        <span style={{
          fontFamily:    ED_TOK.mono,
          fontSize:      10.5,
          letterSpacing: "0.16em",
          textTransform: "uppercase",
          color:         ED_TOK.muted,
          fontWeight:    600,
          textAlign:     "center",
          flex:          1,
          overflow:      "hidden",
          textOverflow:  "ellipsis",
          whiteSpace:    "nowrap",
        }}>
          {kicker}
        </span>
        <div style={{ width: 32, display: "flex", justifyContent: "flex-end" }}>
          {rightAction}
        </div>
      </div>

      {/* Hero title — 56px Space Grotesk per design. */}
      <div style={{ padding: "26px 22px 14px" }}>
        <h1 style={{
          margin:        0,
          fontFamily:    ED_TOK.display,
          fontSize:      "clamp(40px, 12vw, 56px)",
          fontWeight:    500,
          letterSpacing: "-0.035em",
          lineHeight:    0.92,
          color:         ED_TOK.ink,
        }}>
          {title}
        </h1>
      </div>

      {belowTitle}

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {children}
      </div>
    </div>
  );
}
