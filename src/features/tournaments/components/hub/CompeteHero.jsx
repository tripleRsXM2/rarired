// src/features/tournaments/components/hub/CompeteHero.jsx
//
// Module 13 (Compete hub) — page header. Title + subtitle only.
//
// CTAs (Create challenge / Create league) used to live here but
// were moved BELOW the Active now band so the editorial moment
// (the carousel) leads the page. The CTA row now lives in
// CompeteStartActions and renders directly under the band.

export default function CompeteHero({ t }) {
  return (
    <section style={{
      marginBottom: 18,
      padding: "8px 0 10px",
    }}>
      <div style={{
        // Editorial scale matching HomeHero's greeting pattern.
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
    </section>
  );
}
