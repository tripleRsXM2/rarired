// src/features/tournaments/components/hub/ExploreFooterLinks.jsx
//
// Module 13 (Compete hub Slice 1) — minimal footer that deep-links
// into the existing category pages. Slice 2 replaces this with
// proper Explore cards (per the spec's "Explore competition types"
// section). This Slice 1 version is intentionally low-fi: a single
// row of three text links so users can still drill into the legacy
// pages from the hub without the visual cost of three full cards.

export default function ExploreFooterLinks({ t, onBrowseLeagues, onBrowseChallenges, onBrowseTournaments }) {
  return (
    <section style={{ marginBottom: 28, marginTop: 4 }}>
      <div style={{
        fontSize: 10, fontWeight: 800,
        textTransform: "uppercase", letterSpacing: "0.16em",
        color: t.textTertiary, marginBottom: 8,
      }}>
        Browse
      </div>
      <div style={{
        display: "flex", flexWrap: "wrap", gap: 8,
      }}>
        <FooterLink t={t} label="Leagues"     onClick={onBrowseLeagues}     />
        <FooterLink t={t} label="Challenges"  onClick={onBrowseChallenges}  />
        <FooterLink t={t} label="Tournaments" onClick={onBrowseTournaments} />
      </div>
    </section>
  );
}

function FooterLink({ t, label, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        flex: "1 1 100px",
        minWidth: 0, minHeight: 44,
        padding: "10px 14px",
        background: t.bgCard,
        border: "1px solid " + t.border,
        borderRadius: 8,
        color: t.text,
        fontSize: 12, fontWeight: 700,
        letterSpacing: "0.04em", textTransform: "uppercase",
        cursor: "pointer",
      }}>
      {label}
    </button>
  );
}
