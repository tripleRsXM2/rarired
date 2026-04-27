// src/features/tournaments/components/hub/CompeteHero.jsx
//
// Module 13 (Compete hub Slice 1) — top of the page. Title +
// subtitle + two primary CTAs. Tournament creation is intentionally
// not surfaced (creation flow doesn't yet exist for end users).
//
// Vertical budget per spec: ~120px on mobile so Active now appears
// quickly. We size the type and padding to fit, then let flex-wrap
// push the buttons under the copy on the narrowest screens — that
// can briefly exceed the 120px target on 320–360px viewports, which
// is acceptable since the project does not target sub-375px screens.

export default function CompeteHero({ t, onChallenge, onCreateLeague }) {
  return (
    <section style={{
      marginBottom: 18,
      padding: "8px 0 10px",
    }}>
      <div style={{
        // Design pass: editorial scale matching HomeHero's greeting
        // pattern (clamp(22px, 3.4vw, 32px) for the greeting, with a
        // tighter ceiling here since "Compete" is a single word and
        // doesn't need to grow as much as "Hi, Mikey"). Tighter
        // letter-spacing (-0.6px) reads as more confident, less
        // app-shell.
        fontSize: "clamp(22px, 3.6vw, 28px)",
        fontWeight: 800, color: t.text,
        letterSpacing: "-0.6px", lineHeight: 1.05,
      }}>
        Compete
      </div>
      <div style={{
        fontSize: 13, color: t.textSecondary,
        marginTop: 4, lineHeight: 1.4,
        letterSpacing: "0.005em",
      }}>
        Your leagues, challenges, and competitions in one place.
      </div>
      <div style={{
        display: "flex", flexWrap: "wrap", gap: 8, marginTop: 10,
      }}>
        {/* Hero CTA copy is the shortest unambiguous form of these
            actions so both fit on a single line at 375px-uppercase-
            letterspaced widths. The Start Something section below
            uses the longer phrasings ("Challenge", "Create league")
            with explanatory copy. */}
        <HeroCta t={t} kind="primary"   label="New challenge" onClick={onChallenge} />
        <HeroCta t={t} kind="secondary" label="New league"    onClick={onCreateLeague} />
      </div>
    </section>
  );
}

function HeroCta({ t, kind, label, onClick }) {
  var primary = kind === "primary";
  return (
    <button
      onClick={onClick}
      style={{
        // Buttons share width on narrow screens (each 1 1 140px).
        // On wider screens they sit side-by-side at natural width.
        flex: "1 1 140px",
        minWidth: 0, minHeight: 44, height: 44,
        padding: "0 16px",
        background: primary ? t.accent : "transparent",
        color: primary ? "#fff" : t.text,
        border: primary ? "none" : ("1px solid " + t.border),
        // Slice 2: round corners to 10 — matches HomeNextAction's
        // PrimaryCTA. Reads as a sibling of the Feed's premium CTA
        // shape rather than the older sharp-cornered button style
        // that surfaces elsewhere in the app.
        borderRadius: 10,
        fontSize: 12.5, fontWeight: 700, lineHeight: 1,
        letterSpacing: "0.03em", textTransform: "uppercase",
        cursor: "pointer",
        transition: "opacity 0.15s",
      }}
      onMouseEnter={function (e) { e.currentTarget.style.opacity = "0.85"; }}
      onMouseLeave={function (e) { e.currentTarget.style.opacity = "1"; }}>
      {label}
    </button>
  );
}
