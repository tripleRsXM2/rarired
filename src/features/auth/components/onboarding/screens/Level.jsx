// Level — 6 rows for the app's SKILL_LEVELS ladder. Writes profiles.skill
// directly. Optional UTR is captured locally and saved to localStorage with
// a TODO; there is no profiles.utr column yet.
import { PrimaryButton, ScreenHeader, ScreenIn } from "../atoms.jsx";
import { SKILL_LEVELS, SKILL_HINTS } from "../../../../../lib/constants/domain.js";
import { useState } from "react";

export default function Level({ state, set, next, T }) {
  const valid = !!state.level;
  return (
    <ScreenIn k="s2">
      <div style={{ flex: 1, display: "flex", flexDirection: "column", padding: "12px 28px 28px", overflowY: "auto" }}>
        <ScreenHeader
          T={T}
          eyebrow="03 — Skill"
          title={`Where's your game, ${state.first || "player"}?`}
          subtitle="We'll match you with players at your level."
        />
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 24 }}>
          {SKILL_LEVELS.map((l, i) => (
            <LevelRow
              key={l}
              label={l}
              desc={SKILL_HINTS[l] || ""}
              idx={i}
              selected={state.level === l}
              onPick={() => set({ level: l })}
              T={T}
            />
          ))}
        </div>
        <div style={{ marginTop: 18, display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ flex: 1, height: 1, background: T.line }}/>
          <div style={{ fontFamily: T.font, fontSize: 11, letterSpacing: "0.18em", textTransform: "uppercase", color: T.muted }}>Optional</div>
          <div style={{ flex: 1, height: 1, background: T.line }}/>
        </div>
        <UTRInput T={T} value={state.utr} onChange={(v) => set({ utr: v })} />
        <div style={{ flex: 1, minHeight: 12 }}/>
        <PrimaryButton T={T} disabled={!valid} onClick={next}>Continue</PrimaryButton>
      </div>
    </ScreenIn>
  );
}

function LevelRow({ label, desc, idx, selected, onPick, T }) {
  const [hover, setHover] = useState(false);
  const filled = idx + 1; // 1..6 for 6 levels
  return (
    <button
      type="button"
      onClick={onPick}
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{
        appearance: "none", textAlign: "left", cursor: "pointer",
        padding: "14px 16px",
        borderRadius: 16,
        background: selected ? T.fg : T.surface,
        color: selected ? T.bg : T.fg,
        border: `1px solid ${selected ? T.fg : (hover ? T.line2 : T.line)}`,
        transition: "all 180ms cubic-bezier(.2,.8,.2,1)",
        display: "flex", alignItems: "center", gap: 14,
        transform: selected ? "scale(1.005)" : "scale(1)",
        fontFamily: T.font,
      }}
    >
      <LevelDots filled={filled} total={6} color={selected ? T.bg : T.fg} accent={T.accent} selected={selected}/>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: T.fontDisplay, fontSize: 17, fontWeight: 600, letterSpacing: "-0.01em" }}>{label}</div>
        <div style={{ fontFamily: T.font, fontSize: 13, opacity: 0.65, marginTop: 2 }}>{desc}</div>
      </div>
      <div style={{
        width: 22, height: 22, borderRadius: 999,
        border: `1.5px solid ${selected ? T.bg : T.line2}`,
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        {selected && <div style={{ width: 10, height: 10, borderRadius: 999, background: T.accent }}/>}
      </div>
    </button>
  );
}

function LevelDots({ filled, total, color, accent, selected }) {
  return (
    <div style={{ display: "flex", gap: 3, alignItems: "flex-end", height: 22, width: 30 }}>
      {Array.from({ length: total }).map((_, i) => (
        <div key={i} style={{
          width: 3, height: 6 + i * 2,
          borderRadius: 1.5,
          background: i < filled ? (selected ? accent : color) : "currentColor",
          opacity: i < filled ? 1 : 0.18,
        }}/>
      ))}
    </div>
  );
}

function UTRInput({ value, onChange, T }) {
  const [focus, setFocus] = useState(false);
  return (
    <div style={{ marginTop: 14, display: "flex", alignItems: "center", gap: 12 }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontFamily: T.font, fontSize: 13, color: T.muted, marginBottom: 4 }}>Know your UTR?</div>
        <div style={{ borderBottom: `1.5px solid ${focus ? T.fg : T.line}`, paddingBottom: 4, transition: "border-color 200ms" }}>
          <input
            type="number" step="0.01" placeholder="—"
            value={value || ""}
            onFocus={() => setFocus(true)} onBlur={() => setFocus(false)}
            onChange={(e) => onChange(e.target.value)}
            style={{
              width: "100%", appearance: "none", border: 0, outline: 0, background: "transparent",
              fontFamily: T.fontDisplay, fontSize: 22, fontWeight: 500, color: T.fg, padding: "4px 0",
            }}
          />
        </div>
        <div style={{ fontFamily: T.font, fontSize: 11, color: T.muted, marginTop: 6 }}>Improves match accuracy</div>
      </div>
    </div>
  );
}
