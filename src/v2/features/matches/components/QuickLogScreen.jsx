// QuickLogScreen.jsx — Final-score quick-log (no live scoring) for the
// v2 BaselineApp. Faithful port of the design's `QuickLogScreen` in
// `screens-mobile-2.jsx`. Per-set − value + stepper input with an
// optional inline tiebreak. Replaces the older 3x4 numpad — the
// design zip dropped the numpad in favour of the stepper after user
// feedback: most scores are 0–7 so tap-to-increment is faster than a
// 12-button keypad and removes the ambiguity of "is 6 the active
// digit or do I need to backspace?".
//
// Hooked to Supabase: the opponent name is now a tappable field that
// opens a friend picker (live friends list passed in via props), and
// Save inserts a casual match into match_history via logV2Match.

import React from "react";
import { Card, Eyebrow, ServeDot } from "./atoms.jsx";

export default function QuickLogScreen({
  theme, accent, onSave,
  // viewerName  — signed-in player's display name (left "You" row).
  // friends     — [{ id, name, avatar_url, skill, suburb }] for the
  //               opponent picker. Empty array is fine (free-text only).
  // onSubmit    — async ({ opponent, sets }) => { data, error }.
  //               When provided, Save calls it instead of onSave().
  viewerName, friends, onSubmit,
}) {
  // Start with a single empty set — the prototype shipped pre-filled
  // demo scores, but a real log page must start blank so the user
  // doesn't accidentally Save a fake 6-4 3-6 7-6 match. + Add set
  // grows the list; logV2Match drops any 0-0 set on save.
  const [sets, setSets] = React.useState([{ score: [0, 0], tb: null }]);
  const [activeIdx, setActiveIdx]   = React.useState(0);
  const [activeSide, setActiveSide] = React.useState(0);
  const [activeField, setActiveField] = React.useState("score");

  // Opponent — { id?: uuid, name: string }. id is set only when the
  // user picks a linked friend; a typed name logs unlinked. Starts
  // unset so the user has to choose before saving.
  const [opponent, setOpponent] = React.useState(null);
  const [oppSheetOpen, setOppSheetOpen] = React.useState(false);

  const [saving, setSaving] = React.useState(false);
  const [error, setError]   = React.useState("");

  const youLabel = viewerName || "You";
  const oppLabel = opponent ? opponent.name : "Pick opponent";

  const updateSet = (idx, fn) => setSets((prev) => prev.map((s, i) => (i === idx ? fn(s) : s)));
  const setScoreVal = (idx, side, v) =>
    updateSet(idx, (s) => ({ ...s, score: side === 0 ? [v, s.score[1]] : [s.score[0], v] }));
  const setTbVal = (idx, side, v) =>
    updateSet(idx, (s) => {
      const tb = s.tb || [0, 0];
      return { ...s, tb: side === 0 ? [v, tb[1]] : [tb[0], v] };
    });

  // Current value of the active cell — read by the stepper. Score
  // cells cap at 7 (longest legal set score), tiebreaks at 25.
  const activeValue = activeField === "tb"
    ? ((sets[activeIdx].tb || [0, 0])[activeSide])
    : sets[activeIdx].score[activeSide];
  const activeMax = activeField === "tb" ? 25 : 7;
  const setActiveValue = (v) => {
    if (activeField === "tb") setTbVal(activeIdx, activeSide, v);
    else setScoreVal(activeIdx, activeSide, v);
  };
  const toggleActiveTiebreak = () =>
    updateSet(activeIdx, (s) => ({ ...s, tb: s.tb ? null : [0, 0] }));

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

  async function handleSave() {
    setError("");
    if (!opponent || !opponent.name) {
      setError("Pick an opponent first.");
      setOppSheetOpen(true);
      return;
    }
    // No onSubmit wired (e.g. legacy mount) — fall back to the old
    // navigate-home behaviour so the screen never dead-ends.
    if (!onSubmit) { if (onSave) onSave(); return; }
    setSaving(true);
    const res = await onSubmit({ opponent: opponent, sets: sets });
    setSaving(false);
    if (res && res.error) {
      setError((res.error && res.error.message) || "Couldn't save the match.");
      return;
    }
    if (onSave) onSave();
  }

  return (
    <div style={{ height: "100%", background: theme.bg, color: theme.ink, display: "flex", flexDirection: "column", position: "relative" }}>
      <div style={{ padding: "14px 20px 4px" }}>
        <Eyebrow color={theme.inkSoft}>Quick log</Eyebrow>
        <h1 className="t-serif" style={{ fontSize: 28, lineHeight: 1.05, margin: "4px 0 0", letterSpacing: "-0.015em" }}>
          Final <em>score</em>
        </h1>
      </div>

      <div style={{ padding: "12px 16px 4px" }}>
        <Card theme={theme} padded={false}>
          <div style={{ display: "grid", gridTemplateColumns: "112px 1fr", alignItems: "stretch" }}>
            <div style={{
              padding: "12px 0 12px 14px", display: "flex", flexDirection: "column",
              justifyContent: "space-around", borderRight: `1px solid ${theme.line}`,
              background: theme.bgRaised,
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <ServeDot active color={accent} />
                <span style={{
                  fontFamily: "Inter", fontWeight: 600, fontSize: 13,
                  whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                }}>{youLabel}</span>
              </div>
              <div style={{ height: 8 }} />
              {/* Opponent — tappable. Opens the picker sheet. */}
              <button
                type="button"
                onClick={() => setOppSheetOpen(true)}
                className="t-btn"
                style={{
                  appearance: "none", background: "transparent", border: 0,
                  padding: 0, cursor: "pointer", textAlign: "left",
                  display: "flex", alignItems: "center", gap: 8,
                }}>
                <ServeDot active={false} color={accent} />
                <span style={{
                  fontFamily: "Inter", fontWeight: 600, fontSize: 13,
                  color: opponent ? theme.ink : accent,
                  whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                  borderBottom: `1px dashed ${opponent ? theme.line : accent}`,
                }}>{oppLabel}</span>
              </button>
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
          <span style={{ color: theme.inkFaint }}> · {activeSide === 0 ? youLabel : oppLabel}</span>
        </div>
        {sets[activeIdx]?.tb && (
          <button onClick={() => setActiveField(activeField === "tb" ? "score" : "tb")} className="t-btn" style={{
            appearance: "none", border: 0, background: "transparent",
            color: accent, fontFamily: "Inter", fontSize: 11, fontWeight: 600, cursor: "pointer",
          }}>{activeField === "tb" ? "Set score" : "Tiebreak"}</button>
        )}
      </div>

      <div style={{ flex: 1 }} />
      {/* Stepper — minimal − value +. Replaces the older 3x4 numpad.
          The big number in the middle mirrors the active cell so the
          user knows what they're editing. Tap the chip below to add
          or remove a tiebreak on the active set; the stepper's max
          flips to 25 while editing the tiebreak, 7 for set scores. */}
      <div style={{ padding: "0 20px 12px" }}>
        <StepperPicker
          value={activeValue}
          onChange={setActiveValue}
          max={activeMax}
          theme={theme}
          accent={accent}
        />
        <div style={{ display: "flex", justifyContent: "center", marginTop: 10 }}>
          <button onClick={toggleActiveTiebreak} className="t-btn" style={{
            appearance: "none", border: `1px solid ${theme.line}`,
            background: sets[activeIdx] && sets[activeIdx].tb ? accent + "22" : "transparent",
            color: theme.ink, fontFamily: "Inter", fontSize: 11, fontWeight: 600,
            borderRadius: 999, padding: "5px 12px", cursor: "pointer",
          }}>{sets[activeIdx] && sets[activeIdx].tb ? "Remove tiebreak" : "+ Tiebreak"}</button>
        </div>
      </div>

      {/* Error strip — only renders when a save attempt failed or the
          opponent is missing. Sits just above the Save button. */}
      {error && (
        <div style={{
          margin: "0 20px 6px", padding: "9px 12px", borderRadius: 10,
          background: `${accent}1f`, color: theme.ink,
          fontFamily: "Inter", fontSize: 12, fontWeight: 500,
        }}>{error}</div>
      )}

      <div style={{ padding: "6px 20px 20px" }}>
        <button onClick={handleSave} disabled={saving} className="t-btn" style={{
          width: "100%", appearance: "none", border: 0, padding: "16px",
          borderRadius: 14, background: theme.ink, color: theme.bg,
          fontFamily: "Inter", fontWeight: 600, fontSize: 15,
          opacity: saving ? 0.6 : 1, cursor: saving ? "default" : "pointer",
        }}>{saving ? "Saving…" : "Save match"}</button>
      </div>

      {/* Opponent picker sheet — bottom-anchored overlay. Friends list
          from Supabase + a free-text fallback for non-app opponents. */}
      {oppSheetOpen && (
        <OpponentSheet
          theme={theme} accent={accent}
          friends={friends || []}
          onPick={(o) => { setOpponent(o); setOppSheetOpen(false); setError(""); }}
          onClose={() => setOppSheetOpen(false)}
        />
      )}
    </div>
  );
}

// ── Opponent picker sheet ──────────────────────────────────────────
// Bottom-anchored overlay: friends list (tap to pick a linked player)
// + a text field for a free-text opponent. Matches the v2 visual
// language (Inter / mono labels, hairline borders, theme tokens).

function OpponentSheet({ theme, accent, friends, onPick, onClose }) {
  const [query, setQuery] = React.useState("");
  const q = query.trim().toLowerCase();
  const filtered = q
    ? friends.filter((f) => (f.name || "").toLowerCase().indexOf(q) >= 0)
    : friends;

  return (
    <div
      onClick={onClose}
      style={{
        position: "absolute", inset: 0, zIndex: 40,
        background: "rgba(15,16,18,0.5)",
        display: "flex", flexDirection: "column", justifyContent: "flex-end",
      }}>
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: theme.bg, color: theme.ink,
          borderTopLeftRadius: 18, borderTopRightRadius: 18,
          borderTop: `0.5px solid ${theme.line}`,
          maxHeight: "80%", display: "flex", flexDirection: "column",
          padding: "16px 18px calc(env(safe-area-inset-bottom, 0px) + 16px)",
        }}>
        {/* Grab handle */}
        <div style={{
          width: 36, height: 4, borderRadius: 2, background: theme.lineStrong,
          margin: "0 auto 14px",
        }} />
        <div style={{ fontFamily: "JetBrains Mono", fontSize: 11, letterSpacing: "0.16em", textTransform: "uppercase", color: theme.inkSoft, marginBottom: 10 }}>
          Opponent
        </div>

        {/* Free-text — log against a name that isn't in your friends. */}
        <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search friends or type a name…"
            style={{
              flex: 1, appearance: "none",
              background: theme.bgRaised, color: theme.ink,
              border: `1px solid ${theme.line}`, borderRadius: 10,
              padding: "11px 12px", fontFamily: "Inter", fontSize: 14,
              outline: "none",
            }}
          />
          {query.trim() && (
            <button
              type="button"
              onClick={() => onPick({ id: null, name: query.trim() })}
              className="t-btn"
              style={{
                appearance: "none", border: 0, borderRadius: 10,
                padding: "0 16px", background: theme.ink, color: theme.bg,
                fontFamily: "Inter", fontWeight: 600, fontSize: 13, cursor: "pointer",
                whiteSpace: "nowrap",
              }}>Use name</button>
          )}
        </div>

        {/* Friends list */}
        <div className="t-noscroll" style={{ overflowY: "auto", display: "flex", flexDirection: "column", gap: 4 }}>
          {filtered.length === 0 ? (
            <div style={{ padding: "18px 4px", color: theme.inkSoft, fontFamily: "Inter", fontSize: 13 }}>
              {friends.length === 0
                ? "No friends yet — type an opponent name above."
                : "No friends match that search."}
            </div>
          ) : (
            filtered.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => onPick({ id: f.id, name: f.name })}
                className="t-btn"
                style={{
                  appearance: "none", border: 0, background: "transparent",
                  display: "flex", alignItems: "center", gap: 12,
                  padding: "10px 6px", cursor: "pointer", textAlign: "left",
                  borderBottom: `0.5px solid ${theme.line}`,
                }}>
                <div style={{
                  width: 36, height: 36, borderRadius: "50%", flexShrink: 0,
                  background: theme.bgRaised, border: `0.5px solid ${theme.line}`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontFamily: "Inter", fontWeight: 700, fontSize: 13, color: theme.inkSoft,
                  overflow: "hidden",
                }}>
                  {f.avatar_url
                    ? <img src={f.avatar_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    : (f.name || "?").slice(0, 2).toUpperCase()}
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontFamily: "Inter", fontWeight: 600, fontSize: 14, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {f.name}
                  </div>
                  {(f.suburb || f.skill) && (
                    <div style={{ fontSize: 11, color: theme.inkSoft, fontFamily: "Inter" }}>
                      {[f.suburb, f.skill].filter(Boolean).join(" · ")}
                    </div>
                  )}
                </div>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

// Minimal stepper — − value + buttons. Ported verbatim from the
// design's `StepperPicker` in screens-mobile-2.jsx (the third tennis-
// timer zip). The minus button is a hairline outline, the plus
// button is the accent-filled primary action so the most common
// gesture (incrementing a fresh 0-0 set) gets a thumb-magnet target.
function StepperPicker({ value, onChange, max = 7, theme, accent }) {
  const dec = () => onChange(Math.max(0, value - 1));
  const inc = () => onChange(Math.min(max, value + 1));
  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "center", gap: 14,
      background: theme.bgRaised, border: `1px solid ${theme.line}`,
      borderRadius: 12, padding: "8px 12px",
    }}>
      <button onClick={dec} className="t-btn" aria-label="Decrement" style={{
        width: 36, height: 36, borderRadius: "50%", appearance: "none",
        border: `1px solid ${theme.line}`,
        background: "transparent", color: theme.ink, cursor: "pointer",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        <svg width="14" height="14" viewBox="0 0 24 24"><path d="M5 12h14" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/></svg>
      </button>
      <span className="t-num" style={{
        fontFamily: "JetBrains Mono", fontVariantNumeric: "tabular-nums",
        fontSize: 32, fontWeight: 700, color: theme.ink, letterSpacing: "-0.03em",
        minWidth: 48, textAlign: "center",
      }}>{value}</span>
      <button onClick={inc} className="t-btn" aria-label="Increment" style={{
        width: 36, height: 36, borderRadius: "50%", appearance: "none", border: 0,
        background: accent, color: "#0f1410", cursor: "pointer",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        <svg width="14" height="14" viewBox="0 0 24 24"><path d="M12 5v14m-7-7h14" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/></svg>
      </button>
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
