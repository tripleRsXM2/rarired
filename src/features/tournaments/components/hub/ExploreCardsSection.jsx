// src/features/tournaments/components/hub/ExploreCardsSection.jsx
//
// Module 13 (Compete hub) — "Explore competition types" section.
//
// Design pass: dropped the outlined card chrome. Each entry is now
// a banner-style row separated from the next by a hairline divider,
// consistent with the Suggested-for-you treatment. Reads as a calm
// list of "browse" entry points rather than three more action cards.
//
// Order on the page: Leagues first because it's the highest-traffic
// category in V1. Tournaments last because creation isn't ready and
// the card is purely informational/browse.

import SectionHeader, { HUB_SECTION_MB } from "./SectionHeader.jsx";

export default function ExploreCardsSection({ t, onLeagues, onChallenges, onTournaments }) {
  var rows = [
    { key: "leagues",     title: "Leagues",     body: "Create private friend leagues and track standings.", onClick: onLeagues },
    { key: "challenges",  title: "Challenges",  body: "Invite someone to play and confirm results.",        onClick: onChallenges },
    { key: "tournaments", title: "Tournaments", body: "Browse structured brackets and events.",             onClick: onTournaments },
  ];

  return (
    <section style={{ marginBottom: HUB_SECTION_MB }}>
      <SectionHeader t={t} label="Explore competition types" />
      {rows.map(function (r, idx) {
        return (
          <ExploreRow
            key={r.key}
            t={t}
            title={r.title}
            body={r.body}
            onClick={r.onClick}
            isLast={idx === rows.length - 1}
          />
        );
      })}
    </section>
  );
}

// ── ExploreRow ──────────────────────────────────────────────────
// Hairline-separated row. No box, no border, no bgCard. The whole
// row is the affordance — tap anywhere on it to open the page.
// Chevron suffix on the title reads as "open another page".
function ExploreRow({ t, title, body, onClick, isLast }) {
  return (
    <button
      onClick={onClick}
      onMouseEnter={function (e) { e.currentTarget.style.opacity = "0.7"; }}
      onMouseLeave={function (e) { e.currentTarget.style.opacity = "1"; }}
      style={{
        width:        "100%",
        textAlign:    "left",
        background:   "transparent",
        border:       "none",
        borderBottom: isLast ? "none" : "1px solid " + t.border,
        borderRadius: 0,
        padding:      "12px 0",
        cursor:       "pointer",
        display:      "flex",
        alignItems:   "center",
        gap:          12,
        transition:   "opacity 0.15s",
        font:         "inherit",
        color:        "inherit",
      }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize:      14,
          fontWeight:    700,
          color:         t.text,
          letterSpacing: "-0.2px",
          lineHeight:    1.25,
          display:       "flex",
          alignItems:    "center",
          gap:           6,
        }}>
          {title}
        </div>
        <div style={{
          fontSize:     12,
          color:        t.textSecondary,
          marginTop:    2,
          lineHeight:   1.4,
          overflow:     "hidden",
          textOverflow: "ellipsis",
          whiteSpace:   "nowrap",
        }}>
          {body}
        </div>
      </div>
      <ChevronGlyph t={t} />
    </button>
  );
}

// Inline chevron — same line-art convention NAV_ICONS uses
// (currentColor stroke, 1.5 width, 18×18 viewBox). Sized to align
// with the row's title weight.
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
