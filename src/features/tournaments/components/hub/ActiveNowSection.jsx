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
import SectionHeader from "./SectionHeader.jsx";

export default function ActiveNowSection({ t, cards }) {
  return (
    <section style={{ marginBottom: 24 }}>
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
// Stays small — the StartSomethingSection right below carries the
// "what next" weight per Slice 1 spec adjustment. No fake suggestions.
function ActiveNowEmpty({ t }) {
  return (
    <div style={{
      background: t.bgCard,
      border: "1px solid " + t.border,
      borderRadius: 10,
      padding: "20px 18px",
      textAlign: "center",
    }}>
      <div style={{
        fontSize: 14, fontWeight: 700, color: t.text,
        letterSpacing: "-0.15px",
      }}>
        Nothing active right now.
      </div>
      <div style={{
        fontSize: 12, color: t.textSecondary, marginTop: 6, lineHeight: 1.5,
      }}>
        Start something below.
      </div>
    </div>
  );
}
