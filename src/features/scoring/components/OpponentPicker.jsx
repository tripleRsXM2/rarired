// src/features/scoring/components/OpponentPicker.jsx
//
// Slice 3 — three-state opponent picker for the Log Match composer.
// Internal `editing` state owns the visual mode; the parent only sees
// the canonical `value` (string name) + `selectedId` (friend id|null).
//
//   1. INPUT          — input + suggestion dropdown. Friends bubble
//                       up first. When the typed query has no matches,
//                       the dropdown grows a bottom row "Use 'Bob' —
//                       they'll need an invite" that commits the
//                       freetext name without an id.
//
//   2. FRIEND CHIP    — selectedId is set. Shows avatar + name + a
//                       small "VERIFIED" eyebrow in accent colour.
//                       Tap the × to clear and re-enter input mode.
//
//   3. FREETEXT CHIP  — value is set, selectedId is null, editing
//                       has been committed (user picked the
//                       "use this name" row OR pressed Enter in the
//                       input). Shows a muted avatar + name + a
//                       "WILL NEED INVITE" eyebrow. Tap × to clear.
//
// External clears (parent sets value="" + selectedId=null) drop the
// picker back to input mode automatically. Mid-typing never triggers
// chip mode — only an explicit commit (friend select, freetext-row
// tap, or Enter) does.

import { useState, useEffect } from "react";
import { avColor, initials } from "../../../lib/utils/avatar.js";
import { inputStyle } from "../../../lib/theme.js";
import PlayerAvatar from "../../../components/ui/PlayerAvatar.jsx";

export default function OpponentPicker({
  t,
  value,            // string — current typed name (parent-owned)
  onChangeName,     // (string) => void
  selectedId,       // string|null — friend id when a linked opponent is chosen
  onSelect,         // (id|null, name|null, profile?) => void
  onClear,          // () => void — clear both name + id
  friends,          // array of {id, name, avatar, avatar_url, skill, ...}
  suggestedPlayers, // array of same shape
  showDrop,
  setShowDrop,
}) {
  var iStyle = inputStyle(t);
  var name = value || "";
  var trimmed = name.trim();

  // editing=true: render input + dropdown.
  // editing=false: render chip (friend if selectedId, else freetext).
  // Default to editing=true on first mount when nothing is committed.
  // Default to editing=false when the parent opened with a pre-filled
  // value (e.g. challenge conversion → opponent already known).
  var [editing, setEditing] = useState(function () { return !value && !selectedId; });

  // Keep internal mode in sync with external clears. If the parent
  // wipes both fields (e.g. modal close + re-open), drop into input
  // mode so the user can pick again. We DON'T flip back to chip mode
  // automatically when the parent updates `value` mid-typing — that
  // would interrupt typing.
  useEffect(function () {
    if (!value && !selectedId) setEditing(true);
  }, [value, selectedId]);

  // Resolve the friend object for chip render (state 2).
  var linkedFriend = selectedId
    ? (friends || []).concat(suggestedPlayers || []).find(function (u) {
        return u.id === selectedId;
      })
    : null;

  // ── State 2: friend chip ────────────────────────────────────────────
  if (!editing && linkedFriend) {
    return (
      <ChipBox t={t}
        avatar={
          <PlayerAvatar
            name={linkedFriend.name}
            avatar={linkedFriend.avatar}
            avatarUrl={linkedFriend.avatar_url}
            profile={linkedFriend}
            size={36}
          />
        }
        eyebrow="Verified"
        eyebrowColor={t.accent}
        name={linkedFriend.name}
        onEdit={function () { setEditing(true); setShowDrop(false); }}
        onClear={function () { onClear(); setEditing(true); }}
      />
    );
  }

  // ── State 3: freetext chip (committed name, no friend) ──────────────
  if (!editing && trimmed && !selectedId) {
    return (
      <ChipBox t={t}
        avatar={<FreetextAvatar t={t} name={trimmed} />}
        eyebrow="Will need invite"
        eyebrowColor={t.textTertiary}
        name={trimmed}
        onEdit={function () { setEditing(true); setShowDrop(false); }}
        onClear={function () { onClear(); setEditing(true); }}
      />
    );
  }

  // ── State 1: input + dropdown ───────────────────────────────────────
  function commitFreetext(text) {
    var v = (text || "").trim();
    if (!v) return;
    onChangeName(v);
    setEditing(false);
    setShowDrop(false);
  }

  function handleKeyDown(e) {
    if (e.key === "Enter") {
      e.preventDefault();
      // Enter commits whatever's typed as freetext (when no friend is
      // already selected). If the user wanted a friend they'd tap
      // them in the dropdown.
      if (trimmed && !selectedId) commitFreetext(trimmed);
    } else if (e.key === "Escape") {
      setShowDrop(false);
    }
  }

  return (
    <div style={{ position: "relative" }}>
      <input
        value={name}
        placeholder="Friend or name…"
        onChange={function (e) { onChangeName(e.target.value); setShowDrop(true); }}
        onFocus={function () { setShowDrop(true); }}
        onBlur={function () { setTimeout(function () { setShowDrop(false); }, 180); }}
        onKeyDown={handleKeyDown}
        style={Object.assign({}, iStyle, {
          fontSize: 13, marginBottom: 0,
          textAlign: "right",
          padding: "8px 10px",
        })}/>
      {showDrop && (function () {
        var q = trimmed.toLowerCase();
        var pool = (friends || []).concat(
          (suggestedPlayers || []).filter(function (s) {
            return !(friends || []).some(function (f) { return f.id === s.id; });
          })
        );
        var hits = q
          ? pool.filter(function (u) { return u.name && u.name.toLowerCase().includes(q); })
          : (friends || []).slice(0, 6);

        // Show the freetext-commit row when:
        //   - user has typed at least 2 chars
        //   - the typed query doesn't exactly match any pool entry
        //     (case-insensitive, trimmed)
        var exactMatch = q && pool.some(function (u) {
          return u.name && u.name.toLowerCase().trim() === q;
        });
        var showFreetextRow = q.length >= 2 && !exactMatch;

        if (!hits.length && !showFreetextRow) return null;

        return (
          <div style={{
            position: "absolute", top: "calc(100% + 4px)",
            // Anchor to the input's right edge but allow the dropdown
            // to extend leftward up to 280px. Without this the
            // dropdown was only as wide as the narrow opponent input
            // (≈170px on a 375 viewport), which clipped friend names
            // to a single letter and made the VERIFIED badge collide
            // with the name+skill block. min(...) keeps it inside the
            // viewport on small screens.
            right: 0,
            width: "min(280px, calc(100vw - 32px))",
            maxWidth: "100vw",
            background: t.bgCard, border: "1px solid " + t.border,
            borderRadius: 10,
            boxShadow: "0 8px 28px rgba(0,0,0,0.14)",
            zIndex: 400, overflow: "hidden",
          }}>
            {hits.map(function (u) {
              var isFriend = (friends || []).some(function (f) { return f.id === u.id; });
              return (
                <div key={u.id}
                  onMouseDown={function () {
                    onSelect(u.id, u.name, u);
                    setEditing(false);
                    setShowDrop(false);
                  }}
                  style={{
                    display: "flex", alignItems: "center", gap: 10,
                    padding: "10px 12px", cursor: "pointer",
                    borderBottom: "1px solid " + t.border,
                  }}>
                  <div style={{
                    width: 30, height: 30, borderRadius: "50%",
                    background: avColor(u.name),
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 11, fontWeight: 700, color: "#fff", flexShrink: 0,
                  }}>
                    {(u.avatar && u.avatar.length <= 2)
                      ? u.avatar
                      : (u.name || "?").slice(0, 2).toUpperCase()}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontSize: 13, fontWeight: 600, color: t.text,
                      whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                    }}>
                      {u.name}
                    </div>
                    {u.skill && (
                      <div style={{
                        fontSize: 11, color: t.textTertiary,
                        whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                      }}>
                        {u.skill}
                      </div>
                    )}
                  </div>
                  {/* The status badge MUST flex-shrink:0 so it can't
                      eat into the name column and overlap when space
                      is tight. whiteSpace:nowrap belt-and-braces. */}
                  <span style={{
                    flexShrink: 0,
                    fontSize: 9, fontWeight: 800,
                    color: isFriend ? t.accent : t.textTertiary,
                    letterSpacing: "0.12em", textTransform: "uppercase",
                    whiteSpace: "nowrap",
                  }}>
                    {isFriend ? "Verified" : "Suggested"}
                  </span>
                </div>
              );
            })}

            {/* Freetext commit row — bottom of the dropdown. */}
            {showFreetextRow && (
              <div
                onMouseDown={function () { commitFreetext(trimmed); }}
                style={{
                  display: "flex", alignItems: "center", gap: 10,
                  padding: "10px 12px", cursor: "pointer",
                  background: t.bgTertiary,
                }}>
                <FreetextAvatar t={t} name={trimmed} size={30} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontSize: 13, fontWeight: 600, color: t.text,
                    whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                  }}>
                    Use "{trimmed}"
                  </div>
                  <div style={{ fontSize: 11, color: t.textTertiary }}>
                    Not on CourtSync — they'll need an invite
                  </div>
                </div>
                <span style={{
                  fontSize: 9, fontWeight: 800,
                  color: t.textTertiary,
                  letterSpacing: "0.12em", textTransform: "uppercase",
                }}>
                  Invite
                </span>
              </div>
            )}
          </div>
        );
      })()}
    </div>
  );
}

// ── Local sub-components ──────────────────────────────────────────────

// Chip wrapper used by both the friend-chip (state 2) and freetext-chip
// (state 3) renders. Layout: avatar + (eyebrow / name) stack + ×.
// Tapping anywhere outside the × calls onEdit so the user can re-enter
// input mode without explicitly clearing.
function ChipBox({ t, avatar, eyebrow, eyebrowColor, name, onEdit, onClear }) {
  return (
    <div style={{
      display: "flex", alignItems: "center",
      justifyContent: "flex-end",
      gap: 10, minWidth: 0,
    }}>
      <button type="button" onClick={onEdit}
        style={{
          display: "flex", alignItems: "center",
          gap: 10, minWidth: 0,
          background: "transparent", border: "none",
          padding: 0, cursor: "pointer",
          textAlign: "right",
        }}>
        <div style={{ minWidth: 0, textAlign: "right" }}>
          <div style={{
            fontSize: 9, fontWeight: 800,
            color: eyebrowColor, letterSpacing: "0.16em",
            textTransform: "uppercase",
          }}>
            {eyebrow}
          </div>
          <div style={{
            fontSize: 14, fontWeight: 700, color: t.text,
            letterSpacing: "-0.2px",
            whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
          }}>
            {name}
          </div>
        </div>
        {avatar}
      </button>
      <button type="button"
        onClick={onClear}
        aria-label="Clear opponent"
        style={{
          background: "transparent", border: "none",
          color: t.textTertiary, fontSize: 16,
          padding: "0 0 0 2px", cursor: "pointer",
          lineHeight: 1,
        }}>
        ×
      </button>
    </div>
  );
}

// Muted-grey avatar for freetext opponents — no avColor hash here so
// the visual reads as "placeholder identity" vs the deterministic-
// coloured friend avatars.
function FreetextAvatar({ t, name, size = 36 }) {
  var label = initials(name) || "?";
  return (
    <div style={{
      width: size, height: size, borderRadius: "50%",
      background: t.bgTertiary,
      border: "1px dashed " + t.border,
      display: "flex", alignItems: "center", justifyContent: "center",
      fontSize: Math.round(size * 0.32), fontWeight: 700,
      color: t.textTertiary,
      flexShrink: 0,
      letterSpacing: "-0.5px",
    }}>
      {label}
    </div>
  );
}
