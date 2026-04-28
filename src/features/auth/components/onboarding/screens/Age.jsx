// Age — 6-card grid using the app's existing AGE_BRACKETS. Writes the
// selected `id` straight to profiles.age_bracket on Continue.
import { PrimaryButton, ScreenHeader, ScreenIn } from "../atoms.jsx";
import { AGE_BRACKETS } from "../../../../../lib/constants/domain.js";

export default function Age({ state, set, next, T }) {
  const valid = !!state.age;
  return (
    <ScreenIn k="s1b">
      <div style={{ flex: 1, display: "flex", flexDirection: "column", padding: "12px 28px 28px" }}>
        <ScreenHeader
          T={T}
          eyebrow="02 — Identity"
          title={`How old are you${state.first ? `, ${state.first}` : ""}?`}
          subtitle="So we can sort you into the right brackets and ladders."
        />
        <div style={{ marginTop: 28, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          {AGE_BRACKETS.map((a) => {
            const sel = state.age === a.id;
            return (
              <button
                key={a.id}
                type="button"
                onClick={() => set({ age: a.id })}
                style={{
                  appearance: "none", cursor: "pointer", textAlign: "left",
                  padding: "20px 18px", borderRadius: 16,
                  background: sel ? T.fg : T.surface,
                  color: sel ? T.bg : T.fg,
                  border: `1px solid ${sel ? T.fg : T.line}`,
                  display: "flex", flexDirection: "column", gap: 4,
                  transition: "all 180ms cubic-bezier(.2,.8,.2,1)",
                  position: "relative", overflow: "hidden",
                  fontFamily: T.font,
                }}
              >
                <div style={{
                  fontFamily: T.fontDisplay, fontSize: 28, fontWeight: 700,
                  letterSpacing: "-0.025em", lineHeight: 1,
                }}>{a.label}</div>
                <div style={{
                  fontFamily: T.font, fontSize: 11, fontWeight: 500,
                  textTransform: "uppercase", letterSpacing: "0.08em",
                  opacity: sel ? 0.6 : 0.5, marginTop: 2,
                }}>{a.sub}</div>
                {sel && (
                  <div style={{
                    position: "absolute", top: 12, right: 12,
                    width: 8, height: 8, borderRadius: 999, background: T.accent,
                  }}/>
                )}
              </button>
            );
          })}
        </div>
        <div style={{ flex: 1 }}/>
        <PrimaryButton T={T} disabled={!valid} onClick={next}>Continue</PrimaryButton>
      </div>
    </ScreenIn>
  );
}
