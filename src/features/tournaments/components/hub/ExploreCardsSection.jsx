// src/features/tournaments/components/hub/ExploreCardsSection.jsx
//
// Module 13 (Compete hub Slice 2) — replaces Slice 1's three-pill
// ExploreFooterLinks with proper Explore cards. Each card is a
// lightweight entry point into one of the legacy category pages
// (/tournaments/list | /tournaments/challenges | /tournaments/leagues).
//
// Visually subordinate to Active now and Start something:
//   - smaller body type
//   - hairline border (no accent fill / no left rule)
//   - subtle hover (opacity 0.85) instead of a coloured CTA
//   - footer-style chevron affordance reads as "browse" not "act"
//
// Order on the page: Leagues first because it's the highest-traffic
// category in V1. Tournaments last because creation isn't ready and
// the card is purely informational/browse.

import SectionHeader, { HUB_SECTION_MB } from "./SectionHeader.jsx";

export default function ExploreCardsSection({ t, onLeagues, onChallenges, onTournaments }) {
  return (
    <section style={{ marginBottom: HUB_SECTION_MB }}>
      <SectionHeader t={t} label="Explore competition types" />
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <ExploreCard
          t={t}
          title="Leagues"
          body="Create private friend leagues and track standings."
          onClick={onLeagues}
        />
        <ExploreCard
          t={t}
          title="Challenges"
          body="Invite someone to play and confirm results."
          onClick={onChallenges}
        />
        <ExploreCard
          t={t}
          title="Tournaments"
          body="Browse structured brackets and events."
          onClick={onTournaments}
        />
      </div>
    </section>
  );
}

// ── ExploreCard ─────────────────────────────────────────────────
// Subordinate card pattern. Lighter than Active / Start cards:
//   - radius 10 to match the rest of the hub
//   - same hairline border + bgCard surface
//   - smaller padding (12 vs 14) so the section reads as a calm row
//     of options, not three more action cards
//   - chevron suffix on the title so it reads as "open another page"
//     not "act on this"
function ExploreCard({ t, title, body, onClick }) {
  return (
    <button
      onClick={onClick}
      onMouseEnter={function (e) { e.currentTarget.style.opacity = "0.92"; }}
      onMouseLeave={function (e) { e.currentTarget.style.opacity = "1"; }}
      style={{
        textAlign: "left",
        background: t.bgCard,
        border: "1px solid " + t.border,
        borderRadius: 10,
        padding: "12px 14px",
        cursor: "pointer",
        // Tap target via padding; the card is the affordance.
        minHeight: 60,
        display: "flex",
        alignItems: "center",
        gap: 10,
        transition: "opacity 0.15s",
        // Reset default button styling
        font: "inherit",
        color: "inherit",
      }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 14, fontWeight: 700, color: t.text,
          letterSpacing: "-0.15px",
          display: "flex", alignItems: "center", gap: 6,
        }}>
          {title}
          <ChevronGlyph t={t} />
        </div>
        <div style={{
          fontSize: 12, color: t.textSecondary,
          marginTop: 3, lineHeight: 1.45,
        }}>
          {body}
        </div>
      </div>
    </button>
  );
}

// Inline chevron — same line-art convention NAV_ICONS uses
// (currentColor stroke, 1.5 width, 18×18 viewBox). Sized to the
// card title.
function ChevronGlyph({ t }) {
  return (
    <svg width="14" height="14" viewBox="0 0 18 18" fill="none"
      style={{ color: t.textTertiary, flexShrink: 0 }}>
      <path d="M7 4l5 5-5 5"
        stroke="currentColor" strokeWidth="1.5"
        strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}
