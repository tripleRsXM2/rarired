// Zone — picks home_zone. Replaces the design's map placeholder with a
// clean grid of the app's six real ZONES. Each card writes profiles.home_zone.
import { PrimaryButton, ScreenHeader, ScreenIn } from "../atoms.jsx";
import { ZONES } from "../../../../map/data/zones.js";

export default function Zone({ state, set, next, T }) {
  const valid = !!state.zone;
  return (
    <ScreenIn k="s4">
      <div style={{ flex: 1, display: "flex", flexDirection: "column", padding: "12px 28px 28px", minHeight: 0 }}>
        <ScreenHeader T={T} eyebrow="05 — Location" title="Where do you play?" subtitle="Pick the area you mostly play in. You can change this later." />

        <div style={{
          marginTop: 22, flex: 1, minHeight: 0,
          overflowY: "auto",
          display: "flex", flexDirection: "column", gap: 10,
          paddingBottom: 4,
        }}>
          {ZONES.map((z) => {
            const sel = state.zone === z.id;
            return (
              <button
                key={z.id}
                type="button"
                onClick={() => set({ zone: z.id })}
                style={{
                  appearance: "none", cursor: "pointer", textAlign: "left",
                  padding: "16px 18px", borderRadius: 16,
                  background: sel ? T.fg : T.surface,
                  color: sel ? T.bg : T.fg,
                  border: `1px solid ${sel ? T.fg : T.line}`,
                  display: "flex", alignItems: "center", gap: 14,
                  transition: "all 180ms cubic-bezier(.2,.8,.2,1)",
                  fontFamily: T.font,
                }}
              >
                <div style={{
                  width: 36, height: 36, borderRadius: 999,
                  background: z.color || T.surface2,
                  border: `1px solid ${sel ? T.bg : T.line2}`,
                  flexShrink: 0,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontFamily: T.fontDisplay, fontSize: 14, fontWeight: 700, color: "#0a0a0a",
                }}>
                  {z.num}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: T.fontDisplay, fontSize: 17, fontWeight: 600, letterSpacing: "-0.01em" }}>
                    {z.name}
                  </div>
                  <div style={{
                    fontFamily: T.font, fontSize: 12, opacity: 0.65, marginTop: 3,
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }}>{z.blurb}</div>
                </div>
                <div style={{
                  width: 22, height: 22, borderRadius: 999,
                  border: `1.5px solid ${sel ? T.bg : T.line2}`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  {sel && <div style={{ width: 10, height: 10, borderRadius: 999, background: T.accent }}/>}
                </div>
              </button>
            );
          })}
        </div>

        <div style={{ marginTop: 14 }}>
          <PrimaryButton T={T} disabled={!valid} onClick={next}>Continue</PrimaryButton>
        </div>
      </div>
    </ScreenIn>
  );
}
