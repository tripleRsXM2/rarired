// QuickLogScreen.jsx — Final-score quick-log (no live scoring) for the
// v2 BaselineApp. Faithful port of the design's `QuickLogScreen` in
// `screens-mobile-2.jsx`. Per-set numpad input with optional tiebreak.

import React from "react";
import { Card, Eyebrow, ServeDot } from "./atoms.jsx";

export default function QuickLogScreen({ theme, accent, onSave }) {
  const [sets, setSets] = React.useState([
    { score: [6, 4], tb: null },
    { score: [3, 6], tb: null },
    { score: [7, 6], tb: [7, 4] },
  ]);
  const [activeIdx, setActiveIdx]   = React.useState(2);
  const [activeSide, setActiveSide] = React.useState(0);
  const [activeField, setActiveField] = React.useState("score");

  const updateSet = (idx, fn) => setSets((prev) => prev.map((s, i) => (i === idx ? fn(s) : s)));
  const setScoreVal = (idx, side, v) =>
    updateSet(idx, (s) => ({ ...s, score: side === 0 ? [v, s.score[1]] : [s.score[0], v] }));
  const setTbVal = (idx, side, v) =>
    updateSet(idx, (s) => {
      const tb = s.tb || [0, 0];
      return { ...s, tb: side === 0 ? [v, tb[1]] : [tb[0], v] };
    });

  const tap = (n) => {
    const get = () => activeField === "tb"
      ? (sets[activeIdx].tb || [0, 0])[activeSide]
      : sets[activeIdx].score[activeSide];
    const set = (v) => activeField === "tb"
      ? setTbVal(activeIdx, activeSide, v)
      : setScoreVal(activeIdx, activeSide, v);
    if (n === "DEL") { set(Math.floor(get() / 10)); return; }
    if (n === "TB") {
      updateSet(activeIdx, (s) => ({ ...s, tb: s.tb ? null : [0, 0] }));
      setActiveField("tb");
      return;
    }
    const cur = get();
    const nv = cur === 0 ? Number(n) : (cur >= 10 ? Number(n) : Number(`${cur}${n}`));
    set(Math.min(nv, 99));
  };

  const addSet = () => {
    setSets((prev) => [...prev, { score: [0, 0], tb: null }]);
    setActiveIdx(sets.length);
    setActiveSide(0);
    setActiveField("score");
  };
  const removeSet = (idx) => {
    if (sets.length <= 1) return;
    setSets((prev) => prev.filter((_, i) => i !== idx));
    setActiveIdx(Math.max(0, Math.min(activeIdx, sets.length - 2)));
  };

  return (
    <div style={{ height: "100%", background: theme.bg, color: theme.ink, display: "flex", flexDirection: "column" }}>
      <div style={{ padding: "14px 20px 4px" }}>
        <Eyebrow color={theme.inkSoft}>Quick log</Eyebrow>
        <h1 className="t-serif" style={{ fontSize: 28, lineHeight: 1.05, margin: "4px 0 0", letterSpacing: "-0.015em" }}>
          Final <em>score</em>
        </h1>
      </div>

      <div style={{ padding: "12px 16px 4px" }}>
        <Card theme={theme} padded={false}>
          <div style={{ display: "grid", gridTemplateColumns: "96px 1fr", alignItems: "stretch" }}>
            <div style={{
              padding: "12px 0 12px 14px", display: "flex", flexDirection: "column",
              justifyContent: "space-around", borderRight: `1px solid ${theme.line}`,
              background: theme.bgRaised,
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <ServeDot active color={accent} />
                <span style={{ fontFamily: "Inter", fontWeight: 600, fontSize: 13 }}>You</span>
              </div>
              <div style={{ height: 8 }} />
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <ServeDot active={false} color={accent} />
                <span style={{ fontFamily: "Inter", fontWeight: 600, fontSize: 13 }}>M. Carter</span>
              </div>
            </div>
            <div className="t-noscroll" style={{ overflowX: "auto", overflowY: "hidden", WebkitOverflowScrolling: "touch" }}>
              <div style={{ display: "flex", gap: 8, padding: "10px 12px" }}>
                {sets.map((s, i) => (
                  <SetColumn
                    key={i}
                    idx={i}
                    set={s}
                    active={activeIdx === i}
                    activeSide={activeSide}
                    activeField={activeField}
                    onSelect={(side, field) => { setActiveIdx(i); setActiveSide(side); setActiveField(field); }}
                    onRemove={sets.length > 1 ? () => removeSet(i) : null}
                    theme={theme} accent={accent}
                  />
                ))}
                <button onClick={addSet} className="t-btn" style={{
                  appearance: "none", border: `1px dashed ${theme.lineStrong}`,
                  background: "transparent", borderRadius: 10,
                  width: 48, alignSelf: "stretch", flexShrink: 0,
                  color: theme.inkSoft, fontFamily: "JetBrains Mono", fontSize: 22, fontWeight: 300,
                  cursor: "pointer",
                }}>+</button>
              </div>
            </div>
          </div>
        </Card>
      </div>

      <div style={{ padding: "6px 20px 0", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ fontSize: 11, color: theme.inkSoft, fontFamily: "Inter", fontWeight: 500 }}>
          Editing: <strong style={{ color: theme.ink }}>Set {activeIdx + 1}</strong>
          {activeField === "tb" && <span style={{ color: accent }}> · Tiebreak</span>}
          <span style={{ color: theme.inkFaint }}> · {activeSide === 0 ? "You" : "M. Carter"}</span>
        </div>
        {sets[activeIdx]?.tb && (
          <button onClick={() => setActiveField(activeField === "tb" ? "score" : "tb")} className="t-btn" style={{
            appearance: "none", border: 0, background: "transparent",
            color: accent, fontFamily: "Inter", fontSize: 11, fontWeight: 600, cursor: "pointer",
          }}>{activeField === "tb" ? "Set score" : "Tiebreak"}</button>
        )}
      </div>

      <div style={{ flex: 1 }} />
      <div style={{ padding: "0 20px 12px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
          {["1", "2", "3", "4", "5", "6", "7", "8", "9", "TB", "0", "DEL"].map((k) => (
            <button key={k} onClick={() => tap(k)} className="t-btn" style={{
              appearance: "none", padding: "20px 0", borderRadius: 14,
              background: theme.bgRaised, color: theme.ink, border: `1px solid ${theme.line}`,
              fontFamily: "JetBrains Mono", fontSize: k === "TB" || k === "DEL" ? 13 : 24,
              fontWeight: 500, letterSpacing: "-0.02em",
            }}>{k}</button>
          ))}
        </div>
      </div>

      <div style={{ padding: "6px 20px 20px" }}>
        <button onClick={onSave} className="t-btn" style={{
          width: "100%", appearance: "none", border: 0, padding: "16px",
          borderRadius: 14, background: theme.ink, color: theme.bg,
          fontFamily: "Inter", fontWeight: 600, fontSize: 15,
        }}>Save match</button>
      </div>
    </div>
  );
}

function SetColumn({ idx, set, active, activeSide, activeField, onSelect, onRemove, theme, accent }) {
  const cellW = 48;
  const Cell = ({ side, field, value }) => {
    const isActive = active && activeSide === side && activeField === field;
    const isTb = field === "tb";
    return (
      <button onClick={() => onSelect(side, field)} className="t-btn" data-set-idx={idx} style={{
        width: isTb ? 26 : cellW, height: isTb ? 22 : cellW, borderRadius: isTb ? 6 : 10,
        border: `1.5px solid ${isActive ? accent : theme.line}`,
        background: isActive ? `${accent}22` : (isTb ? theme.chip : "transparent"),
        fontFamily: "JetBrains Mono",
        fontSize: isTb ? 11 : 20, fontWeight: isTb ? 700 : 600, color: theme.ink,
        fontVariantNumeric: "tabular-nums", letterSpacing: "-0.02em",
        cursor: "pointer", appearance: "none",
        display: "flex", alignItems: "center", justifyContent: "center",
        flexShrink: 0,
      }}>{value}</button>
    );
  };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, flexShrink: 0 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", height: 12 }}>
        <span style={{ fontSize: 9, fontFamily: "Inter", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: active ? accent : theme.inkFaint, whiteSpace: "nowrap" }}>
          S{idx + 1}
        </span>
        {onRemove && (
          <button onClick={(e) => { e.stopPropagation(); onRemove(); }} className="t-btn" style={{
            appearance: "none", border: 0, background: "transparent",
            color: theme.inkFaint, cursor: "pointer", padding: 0, lineHeight: 1, fontSize: 12,
          }}>×</button>
        )}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
        <Cell side={0} field="score" value={set.score[0]} />
        {set.tb && <Cell side={0} field="tb" value={set.tb[0]} />}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
        <Cell side={1} field="score" value={set.score[1]} />
        {set.tb && <Cell side={1} field="tb" value={set.tb[1]} />}
      </div>
    </div>
  );
}
