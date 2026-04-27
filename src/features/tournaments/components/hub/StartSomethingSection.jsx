// src/features/tournaments/components/hub/StartSomethingSection.jsx
//
// Module 13 (Compete hub Slice 1) — minimal Start something.
// Two creation cards: "Challenge someone" and "Create a friend
// league". Tournament creation is intentionally NOT included —
// per Slice 1 directive, only ship surfaces that already work.
//
// Renders unconditionally below Active now. When Active now is
// empty this section becomes the visual anchor of the page; when
// Active now has content this sits as a calm "what next" prompt.

import SectionHeader from "./SectionHeader.jsx";

export default function StartSomethingSection({ t, onChallenge, onCreateLeague }) {
  return (
    <section style={{ marginBottom: 24 }}>
      <SectionHeader t={t} label="Start something" />
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <StartCard
          t={t}
          title="Challenge someone"
          body="Invite a player and set the match format."
          ctaLabel="Challenge"
          onClick={onChallenge}
        />
        <StartCard
          t={t}
          title="Create a friend league"
          body="Set rules, invite friends, and track standings."
          ctaLabel="Create league"
          onClick={onCreateLeague}
        />
      </div>
    </section>
  );
}

// ── StartCard ───────────────────────────────────────────────────
// Same chrome as ActiveCompetitionCard (border, radius, padding) but
// dressed up as a creation prompt rather than an active item. CTA is
// always primary — these are unambiguous "do this" cards.
function StartCard({ t, title, body, ctaLabel, onClick }) {
  return (
    <div style={{
      background: t.bgCard,
      border: "1px solid " + t.border,
      borderRadius: 10,
      padding: "14px 14px",
      display: "flex",
      flexDirection: "column",
      gap: 10,
    }}>
      <div>
        <div style={{
          fontSize: 14, fontWeight: 700, color: t.text,
          letterSpacing: "-0.15px",
        }}>
          {title}
        </div>
        <div style={{
          fontSize: 12, color: t.textSecondary, marginTop: 4, lineHeight: 1.45,
        }}>
          {body}
        </div>
      </div>
      <button
        onClick={onClick}
        style={{
          minHeight: 44,
          padding: "10px 16px",
          background: t.accent,
          color: "#fff",
          border: "none",
          borderRadius: 0,
          fontSize: 12.5, fontWeight: 700,
          letterSpacing: "0.03em", textTransform: "uppercase",
          cursor: "pointer",
          alignSelf: "flex-start",
          // On really narrow viewports give the button room to grow
          // so it stays a reasonable tap target.
          minWidth: 160,
        }}>
        {ctaLabel}
      </button>
    </div>
  );
}
