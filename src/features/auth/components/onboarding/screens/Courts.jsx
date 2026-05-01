// Courts — multi-select. Real venues from src/features/map/data/courts.js.
// Filtered by selected zone first, then "everywhere else" (capped at 8).
// We store the user's picks as the venue display names (matches what
// match_history.venue / profiles.played_courts expects in the rest of
// the codebase — this is a free-text column today).
import { useMemo, useState } from "react";
import { PrimaryButton, ScreenHeader, ScreenIn } from "../atoms.jsx";
import { COURTS } from "../../../../map/data/courts.js";
import { ZONE_BY_ID } from "../../../../map/data/zones.js";

export default function Courts({ state, set, next, T }) {
  const [q, setQ] = useState("");

  const toggle = (name) => {
    const has = state.courts.includes(name);
    set({ courts: has ? state.courts.filter((x) => x !== name) : [...state.courts, name] });
  };

  const zoneInfo = ZONE_BY_ID[state.zone];
  const zoneName = (zoneInfo && zoneInfo.name) || "";

  const allCourts = useMemo(() => COURTS.map((c) => {
    const z = ZONE_BY_ID[c.zone];
    return {
      ...c,
      zoneId: c.zone,
      zoneName: (z && z.name) || "",
      zoneColor: (z && z.color) || T.muted,
    };
  }), [T.muted]);

  const zoneList = useMemo(() => allCourts.filter((c) => c.zoneId === state.zone), [allCourts, state.zone]);
  const otherCourts = useMemo(() => allCourts.filter((c) => c.zoneId !== state.zone), [allCourts, state.zone]);

  const query = q.trim().toLowerCase();
  const isSearching = query.length > 0;
  const filtered = useMemo(() => {
    if (!isSearching) return [];
    return allCourts.filter((c) =>
      c.name.toLowerCase().includes(query) ||
      c.zoneName.toLowerCase().includes(query) ||
      (c.suburb || "").toLowerCase().includes(query)
    ).slice(0, 30);
  }, [query, isSearching, allCourts]);

  return (
    <ScreenIn k="s5">
      <div style={{ flex: 1, display: "flex", flexDirection: "column", padding: "12px 28px 28px", minHeight: 0 }}>
        <ScreenHeader
          T={T}
          eyebrow="06 — Courts"
          title="Which courts are home?"
          subtitle={`Pick the courts you play at${zoneName ? ` — ${zoneName} first, but search anywhere in Sydney.` : "."}`}
        />

        <SearchInput T={T} value={q} onChange={setQ} placeholder="Search any court or suburb in Sydney"/>

        <div style={{ marginTop: 12, flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 8, minHeight: 0, paddingBottom: 4 }}>
          {isSearching ? (
            <>
              {filtered.length === 0 && (
                <div style={{ fontFamily: T.font, fontSize: 14, color: T.muted, padding: 24, textAlign: "center" }}>
                  No courts match "{q}".
                </div>
              )}
              {filtered.map((c) => {
                const sel = state.courts.includes(c.name);
                return <CourtRow key={c.name} court={c} selected={sel} onToggle={() => toggle(c.name)} T={T} showZone/>;
              })}
            </>
          ) : (
            <>
              {zoneList.length > 0 && (
                <CourtSectionLabel T={T}>{zoneName} <span style={{ opacity: 0.5, fontWeight: 500 }}>· Your zone</span></CourtSectionLabel>
              )}
              {zoneList.map((c) => {
                const sel = state.courts.includes(c.name);
                return <CourtRow key={c.name} court={c} selected={sel} onToggle={() => toggle(c.name)} T={T}/>;
              })}
              {zoneList.length === 0 && (
                <div style={{ fontFamily: T.font, fontSize: 14, color: T.muted, padding: 24, textAlign: "center" }}>
                  No home zone selected — search above for any court.
                </div>
              )}

              {otherCourts.length > 0 && (
                <>
                  <CourtSectionLabel T={T} top>Everywhere else</CourtSectionLabel>
                  {otherCourts.slice(0, 8).map((c) => {
                    const sel = state.courts.includes(c.name);
                    return <CourtRow key={c.name} court={c} selected={sel} onToggle={() => toggle(c.name)} T={T} showZone/>;
                  })}
                  {otherCourts.length > 8 && (
                    <div style={{ fontFamily: T.font, fontSize: 12, color: T.muted, padding: "8px 4px", textAlign: "center" }}>
                      Search above for {otherCourts.length - 8} more courts across Sydney.
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </div>

        <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
          <PrimaryButton T={T} secondary onClick={next}>Skip</PrimaryButton>
          <PrimaryButton T={T} onClick={next}>{state.courts.length > 0 ? `Continue — ${state.courts.length}` : "Continue"}</PrimaryButton>
        </div>
      </div>
    </ScreenIn>
  );
}

function SearchInput({ value, onChange, placeholder, T }) {
  const [focus, setFocus] = useState(false);
  return (
    <div style={{
      marginTop: 20,
      display: "flex", alignItems: "center", gap: 10,
      padding: "12px 14px",
      background: T.surface,
      border: `1px solid ${focus ? T.fg : T.line}`,
      borderRadius: 12, transition: "border-color 180ms",
    }}>
      <svg width="16" height="16" viewBox="0 0 16 16">
        <circle cx="7" cy="7" r="5" fill="none" stroke={T.muted} strokeWidth="1.4"/>
        <path d="M11 11 L 14 14" stroke={T.muted} strokeWidth="1.4" strokeLinecap="round"/>
      </svg>
      <input
        type="text" value={value} placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setFocus(true)} onBlur={() => setFocus(false)}
        style={{
          flex: 1, appearance: "none", border: 0, outline: 0, background: "transparent",
          fontFamily: T.font, fontSize: 15, color: T.fg,
        }}
      />
    </div>
  );
}

function CourtSectionLabel({ children, T, top = false }) {
  return (
    <div style={{
      fontFamily: T.font, fontSize: 11, fontWeight: 700, letterSpacing: "0.12em",
      textTransform: "uppercase", color: T.muted,
      marginTop: top ? 14 : 4, marginBottom: 2, padding: "0 4px",
    }}>{children}</div>
  );
}

function CourtRow({ court, selected, onToggle, T, showZone = false }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      style={{
        appearance: "none", cursor: "pointer", textAlign: "left",
        padding: "14px 16px", borderRadius: 14,
        background: selected ? T.fg : T.surface,
        color: selected ? T.bg : T.fg,
        border: `1px solid ${selected ? T.fg : T.line}`,
        display: "flex", alignItems: "center", gap: 14,
        transition: "all 180ms cubic-bezier(.2,.8,.2,1)",
        fontFamily: T.font,
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: T.fontDisplay, fontSize: 16, fontWeight: 600, letterSpacing: "-0.01em", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {court.name}
        </div>
        <div style={{ fontFamily: T.font, fontSize: 12, opacity: 0.65, marginTop: 2, display: "flex", alignItems: "center", gap: 6 }}>
          {showZone && court.zoneName && (
            <>
              <span style={{
                display: "inline-flex", alignItems: "center", gap: 4,
                fontWeight: 600, letterSpacing: "0.04em", textTransform: "uppercase", fontSize: 10,
              }}>
                <span style={{ width: 6, height: 6, borderRadius: 999, background: court.zoneColor || (selected ? T.bg : T.muted) }}/>
                {court.zoneName}
              </span>
              <span style={{ opacity: 0.5 }}>·</span>
            </>
          )}
          <span>{court.courts} courts{court.suburb ? ` · ${court.suburb}` : ""}</span>
        </div>
      </div>
      <div style={{
        width: 22, height: 22, borderRadius: 7,
        border: `1.5px solid ${selected ? T.bg : T.line2}`,
        background: selected ? T.bg : "transparent",
        display: "flex", alignItems: "center", justifyContent: "center",
        flexShrink: 0,
      }}>
        {selected && <svg width="12" height="12" viewBox="0 0 14 14"><path d="M2 7 L 6 11 L 12 3" stroke={T.fg} strokeWidth="2.2" fill="none" strokeLinecap="round" strokeLinejoin="round"/></svg>}
      </div>
    </button>
  );
}
