// src/features/tournaments/components/hub/ActiveNowSection.jsx
//
// Module 13 (Compete hub Slice 1) — the main section of the hub.
// Renders priority-sorted ActiveCompetitionCards. When the list is
// empty, falls through to a small empty-state block — the larger
// action affordance is the StartSomethingSection that always sits
// directly below this section, so the empty state itself stays terse.
//
// Action-required items live AT THE TOP of this section (priority 1).
// We deliberately do not split them out into a separate "Needs your
// attention" subsection per the product directive — one Active now,
// priority sort within.

import ActiveCompetitionCard from "./ActiveCompetitionCard.jsx";
import SectionHeader, { HUB_SECTION_MB } from "./SectionHeader.jsx";

export default function ActiveNowSection({ t, cards }) {
  return (
    <section style={{ marginBottom: HUB_SECTION_MB }}>
      <SectionHeader t={t} label="Active now" count={cards.length || null} />
      {cards.length === 0 ? (
        <ActiveNowEmpty t={t} />
      ) : (
        cards.map(function (item) {
          return <ActiveCompetitionCard key={item.id} t={t} item={item} />;
        })
      )}
    </section>
  );
}

// ── Empty state ─────────────────────────────────────────────────
// Slice 2: matches HomeTab's "Nothing here yet" empty-state chrome
// (radius 14, generous padding, tennis-ball motif, body max-width
// 280). The CTA still lives in StartSomethingSection right below
// — Home's empty state has its own primary button, but the hub's
// composition makes that redundant, so we only carry the typography
// + emoji premium feel here, not the button.
function ActiveNowEmpty({ t }) {
  return (
    <div style={{
      background: t.bgCard,
      border: "1px solid " + t.border,
      borderRadius: 14,
      padding: "40px 24px",
      textAlign: "center",
    }}>
      <div style={{ fontSize: 36, marginBottom: 12 }}>🎾</div>
      <div style={{
        fontSize: 17, fontWeight: 700, color: t.text,
        letterSpacing: "-0.3px", marginBottom: 6,
      }}>
        Nothing active right now
      </div>
      <div style={{
        fontSize: 13, color: t.textSecondary,
        lineHeight: 1.6, maxWidth: 280, margin: "0 auto",
      }}>
        Start a challenge or a league below to see it here.
      </div>
    </div>
  );
}
