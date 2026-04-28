// Intent — multi-select cards. Stored locally + flushed to localStorage in
// OnboardingFlow.finishOnboarding (TODO: there's no profiles.intent column
// yet; once one ships, swap the localStorage write for an upsertProfile).
import { useState } from "react";
import { PrimaryButton, ScreenHeader, ScreenIn } from "../atoms.jsx";

const INTENT_OPTIONS = [
  { id: "improve",  label: "Improve my level",     hint: "Drills, lessons, structured play" },
  { id: "hit",      label: "Find people to hit",   hint: "Casual rallies and social tennis" },
  { id: "track",    label: "Track my matches",     hint: "Stats, history, progress over time" },
  { id: "compete",  label: "Compete seriously",    hint: "Ladders, leagues, tournaments" },
];

export default function Intent({ state, set, next, T }) {
  const valid = state.intent.length > 0;
  const toggle = (id) => {
    const has = state.intent.includes(id);
    set({ intent: has ? state.intent.filter((x) => x !== id) : [...state.intent, id] });
  };
  return (
    <ScreenIn k="s3">
      <div style={{ flex: 1, display: "flex", flexDirection: "column", padding: "12px 28px 28px" }}>
        <ScreenHeader T={T} eyebrow="04 — Intent" title="What are you here for?" subtitle="Pick anything that fits — we'll tune your experience." />
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 24 }}>
          {INTENT_OPTIONS.map((opt) => {
            const sel = state.intent.includes(opt.id);
            return <IntentCard key={opt.id} opt={opt} selected={sel} onToggle={() => toggle(opt.id)} T={T}/>;
          })}
        </div>
        <div style={{ flex: 1, minHeight: 12 }}/>
        <PrimaryButton T={T} disabled={!valid} onClick={next}>
          {valid ? `Continue — ${state.intent.length} selected` : "Pick at least one"}
        </PrimaryButton>
      </div>
    </ScreenIn>
  );
}

function IntentCard({ opt, selected, onToggle, T }) {
  const [hover, setHover] = useState(false);
  return (
    <button
      type="button"
      onClick={onToggle}
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{
        appearance: "none", cursor: "pointer", textAlign: "left",
        padding: "18px 20px", borderRadius: 18,
        background: selected ? T.fg : T.surface,
        color: selected ? T.bg : T.fg,
        border: `1px solid ${selected ? T.fg : (hover ? T.line2 : T.line)}`,
        display: "flex", alignItems: "center", gap: 14,
        transition: "all 180ms cubic-bezier(.2,.8,.2,1)",
        fontFamily: T.font,
      }}
    >
      <IntentGlyph id={opt.id} color={selected ? T.accent : T.fg} bg={selected ? T.bg : T.accent}/>
      <div style={{ flex: 1 }}>
        <div style={{ fontFamily: T.fontDisplay, fontSize: 18, fontWeight: 600, letterSpacing: "-0.01em" }}>{opt.label}</div>
        <div style={{ fontFamily: T.font, fontSize: 13, opacity: 0.65, marginTop: 2 }}>{opt.hint}</div>
      </div>
      <div style={{
        width: 24, height: 24, borderRadius: 8,
        border: `1.5px solid ${selected ? T.bg : T.line2}`,
        background: selected ? T.bg : "transparent",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        {selected && (
          <svg width="14" height="14" viewBox="0 0 14 14"><path d="M2 7 L 6 11 L 12 3" stroke={T.fg} strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"/></svg>
        )}
      </div>
    </button>
  );
}

function IntentGlyph({ id, color, bg }) {
  const stroke = { stroke: color, strokeWidth: 1.6, fill: "none", strokeLinecap: "round", strokeLinejoin: "round" };
  return (
    <div style={{ width: 40, height: 40, borderRadius: 12, background: bg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
      <svg width="22" height="22" viewBox="0 0 24 24">
        {id === "improve" && <path d="M4 18 L 10 12 L 14 16 L 20 6 M 14 6 L 20 6 L 20 12" {...stroke}/>}
        {id === "hit" && (<>
          <circle cx="9" cy="8" r="3" {...stroke}/><circle cx="16" cy="11" r="3" {...stroke}/>
          <path d="M3 20 C 4 16, 7 14, 9 14 M 11 20 C 12 17, 14 16, 16 16 C 18 16, 20 17, 21 20" {...stroke}/>
        </>)}
        {id === "track" && (<>
          <path d="M4 18 L 8 13 L 12 16 L 16 8 L 20 11" {...stroke}/>
          <circle cx="8" cy="13" r="1.4" fill={color} stroke="none"/>
          <circle cx="12" cy="16" r="1.4" fill={color} stroke="none"/>
          <circle cx="16" cy="8"  r="1.4" fill={color} stroke="none"/>
        </>)}
        {id === "compete" && (<>
          <path d="M7 4 H 17 V 8 C 17 11, 14.5 13, 12 13 C 9.5 13, 7 11, 7 8 Z" {...stroke}/>
          <path d="M7 5 H 4 C 4 8, 6 9, 7 9 M 17 5 H 20 C 20 8, 18 9, 17 9" {...stroke}/>
          <path d="M9 20 H 15 M 12 13 V 20" {...stroke}/>
        </>)}
      </svg>
    </div>
  );
}
