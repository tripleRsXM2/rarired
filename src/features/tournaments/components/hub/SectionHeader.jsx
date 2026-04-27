// src/features/tournaments/components/hub/SectionHeader.jsx
//
// Tiny shared section label for the Compete hub. Mirrors the
// uppercase / letter-spaced style HomeTab uses for "this week",
// "leagues", etc., so the hub feels visually consistent with the
// feed page.

export default function SectionHeader({ t, label, count, action }) {
  return (
    <div style={{
      display: "flex", alignItems: "baseline", justifyContent: "space-between",
      gap: 12, marginBottom: 10,
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
