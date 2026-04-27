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
        fontSize: 20, fontWeight: 800, color: t.text,
        letterSpacing: "-0.4px", lineHeight: 1.1,
      }}>
        Compete
      </div>
      <div style={{
        fontSize: 12.5, color: t.textSecondary,
        marginTop: 3, lineHeight: 1.4,
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
        borderRadius: 0,
        fontSize: 12.5, fontWeight: 700, lineHeight: 1,
        letterSpacing: "0.03em", textTransform: "uppercase",
        cursor: "pointer",
      }}>
      {label}
    </button>
  );
}
