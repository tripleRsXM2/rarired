// Availability — 4 chips. We persist using the existing
// profiles.availability (jsonb) shape used elsewhere in the app:
// {Mon:["Morning"],...}. The design's 4 ids (`wd-am`, `wd-pm`, `we`, `flex`)
// are mapped onto this shape so /people search filters keep working out
// of the box. v1 keeps it simple — see TODO at AVAIL_TO_AVAILABILITY for
// where to refine if we want per-day granularity later.
import { PrimaryButton, ScreenHeader, ScreenIn } from "../atoms.jsx";

const AVAILABILITY_OPTIONS = [
  { id: "wd-am", label: "Weekday mornings",  glyph: "sun-rise" },
  { id: "wd-pm", label: "Weekday evenings",  glyph: "moon" },
  { id: "we",    label: "Weekends",          glyph: "calendar" },
  { id: "flex",  label: "Flexible",          glyph: "infinity" },
];

export default function Availability({ state, set, next, T }) {
  const toggle = (id) => {
    const has = state.avail.includes(id);
    set({ avail: has ? state.avail.filter((x) => x !== id) : [...state.avail, id] });
  };
  const valid = state.avail.length > 0;
  return (
    <ScreenIn k="s6">
      <div style={{ flex: 1, display: "flex", flexDirection: "column", padding: "12px 28px 28px" }}>
        <ScreenHeader T={T} eyebrow="07 — Availability" title="When do you usually play?" subtitle="Pick all that apply." />
        <div style={{ marginTop: 28, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          {AVAILABILITY_OPTIONS.map((o) => {
            const sel = state.avail.includes(o.id);
            return <AvailChip key={o.id} opt={o} selected={sel} onToggle={() => toggle(o.id)} T={T}/>;
          })}
        </div>
        <div style={{ flex: 1, minHeight: 12 }}/>
        <PrimaryButton T={T} disabled={!valid} onClick={next}>Find my players</PrimaryButton>
      </div>
    </ScreenIn>
  );
}

function AvailChip({ opt, selected, onToggle, T }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      style={{
        appearance: "none", cursor: "pointer",
        padding: "24px 18px", borderRadius: 18,
        background: selected ? T.fg : T.surface,
        color: selected ? T.bg : T.fg,
        border: `1px solid ${selected ? T.fg : T.line}`,
        display: "flex", flexDirection: "column", alignItems: "flex-start", justifyContent: "space-between",
        gap: 18, minHeight: 130,
        transition: "all 180ms cubic-bezier(.2,.8,.2,1)",
        textAlign: "left",
        fontFamily: T.font,
      }}
    >
      <AvailGlyph id={opt.glyph} color={selected ? T.accent : T.fg}/>
      <div style={{ fontFamily: T.fontDisplay, fontSize: 16, fontWeight: 600, letterSpacing: "-0.01em" }}>
        {opt.label}
      </div>
    </button>
  );
}

function AvailGlyph({ id, color }) {
  const s = { stroke: color, strokeWidth: 1.6, fill: "none", strokeLinecap: "round", strokeLinejoin: "round" };
  return (
    <svg width="28" height="28" viewBox="0 0 28 28">
      {id === "sun-rise" && (<>
        <circle cx="14" cy="16" r="4.5" {...s}/>
        <path d="M14 7 V 5 M 6 16 H 4 M 22 16 H 24 M 8 10 L 6.5 8.5 M 20 10 L 21.5 8.5" {...s}/>
        <path d="M3 22 H 25" {...s}/>
      </>)}
      {id === "moon" && <path d="M20 17 A 8 8 0 1 1 11 8 A 6 6 0 0 0 20 17 Z" {...s}/>}
      {id === "calendar" && (<>
        <rect x="5" y="6" width="18" height="17" rx="2" {...s}/>
        <path d="M5 11 H 23 M 10 4 V 8 M 18 4 V 8" {...s}/>
        <circle cx="14" cy="16" r="1.5" fill={color} stroke="none"/>
      </>)}
      {id === "infinity" && (
        <path d="M9 14 C 9 11, 12 11, 14 14 C 16 17, 19 17, 19 14 C 19 11, 16 11, 14 14 C 12 17, 9 17, 9 14 Z" {...s}/>
      )}
    </svg>
  );
}

// Map the design's chip ids to the app's existing availability shape.
// Today: collapse "weekday mornings" → all weekdays Morning; "weekday evenings" → all weekdays Evening;
// weekends → Sat+Sun all-day; flexible → all 7 days, all 4 blocks.
// TODO: per-day picker once we ship a "refine availability" UX in Settings.
export function availChipsToProfileShape(avail) {
  const out = {};
  const WEEKDAYS = ["Mon","Tue","Wed","Thu","Fri"];
  const WEEKEND  = ["Sat","Sun"];
  const ALL_DAYS = WEEKDAYS.concat(WEEKEND);
  const TIME_BLOCKS = ["Morning","Afternoon","Evening","Late"];
  function add(day, blocks) {
    if (!out[day]) out[day] = [];
    blocks.forEach((b) => { if (!out[day].includes(b)) out[day].push(b); });
  }
  if (!Array.isArray(avail) || !avail.length) return out;
  if (avail.includes("flex")) {
    ALL_DAYS.forEach((d) => add(d, TIME_BLOCKS));
    return out;
  }
  if (avail.includes("wd-am")) WEEKDAYS.forEach((d) => add(d, ["Morning"]));
  if (avail.includes("wd-pm")) WEEKDAYS.forEach((d) => add(d, ["Evening"]));
  if (avail.includes("we"))    WEEKEND.forEach((d) => add(d, ["Morning","Afternoon","Evening"]));
  return out;
}
