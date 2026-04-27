// src/features/tournaments/components/hub/SectionHeader.jsx
//
// Tiny shared section label for the Compete hub. Mirrors the
// uppercase / letter-spaced style HomeTab uses for "this week",
// "leagues", etc., so the hub feels visually consistent with the
// feed page.

// Slice 2: shared vertical rhythm token used by every hub section.
// Mirrors HomeTab's clamp() pattern so the spacing breathes
// proportionally with the viewport instead of locking to 24px.
export var HUB_SECTION_MB = "clamp(20px, 3vw, 32px)";

export default function SectionHeader({ t, label, count, action }) {
  return (
    <div style={{
      display: "flex", alignItems: "baseline", justifyContent: "space-between",
      // Design pass: marginBottom 10 → clamp(12, 1.5vw, 16). Slight
      // breathing under the section header so the cards below don't
      // crowd the label.
      gap: 12, marginBottom: "clamp(12px, 1.5vw, 16px)",
    }}>
      <div style={{
        fontSize: 10, fontWeight: 800,
        textTransform: "uppercase", letterSpacing: "0.16em",
        color: t.textTertiary,
      }}>
        {label}
        {count != null && count > 0 && (
          <span style={{ marginLeft: 8, opacity: 0.7, fontWeight: 700 }}>
            · {count}
          </span>
        )}
      </div>
      {action /* optional right-aligned action element (toggle / link) */}
    </div>
  );
}
