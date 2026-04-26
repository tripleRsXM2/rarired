// src/features/scoring/components/OpponentPicker.jsx
//
// Three-state opponent picker for the redesigned Log Match composer.
//
//   1. Idle / typing     — input + suggestion dropdown (friends bubble up)
//   2. Linked friend     — chip with avatar + "VERIFIED" tag, tap × to clear
//   3. Freetext name     — chip with grey avatar + "WILL NEED INVITE" tag,
//                          tap × to clear
//
// Slice 1 keeps the data flow identical to the old in-modal block:
// ScoreModal owns `casualOppName`, `casualOppId`, `showOppDrop`, and the
// callbacks just write back into those setters. Slice 3 will polish the
// 3-state interaction further (currently the chip → input transition is
// abrupt; that's intentional — minimal change for slice 1).

import { avColor } from "../../../lib/utils/avatar.js";
import { inputStyle } from "../../../lib/theme.js";
import PlayerAvatar from "../../../components/ui/PlayerAvatar.jsx";

export default function OpponentPicker({
  t,
  value,            // string — current typed name
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

  // State 2/3: a name is committed (selected friend OR a typed-and-blurred
  // freetext). We render a chip. The chip's clear-button drops back to
  // state 1.
  // For slice 1 we keep the old behaviour: while typing the input is
  // visible and the dropdown floats. The chip-state only kicks in when a
  // friend has been selected (selectedId truthy). Freetext stays in
  // input mode through the whole flow — that's where slice 3 will
  // change the UX. This keeps slice 1 a clean refactor.
  var linkedFriend = selectedId
    ? (friends || []).concat(suggestedPlayers || []).find(function (u) {
        return u.id === selectedId;
      })
    : null;

  if (linkedFriend) {
    return (
      <div style={{
        display: "flex", alignItems: "center",
        justifyContent: "flex-end",
        gap: 10, minWidth: 0,
      }}>
        <div style={{ minWidth: 0, textAlign: "right" }}>
          <div style={{
            fontSize: 9, fontWeight: 800,
            color: t.accent, letterSpacing: "0.16em",
            textTransform: "uppercase",
          }}>
            Verified
          </div>
          <div style={{
            fontSize: 14, fontWeight: 700, color: t.text,
            letterSpacing: "-0.2px",
            whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
          }}>
            {linkedFriend.name}
          </div>
        </div>
        <PlayerAvatar
          name={linkedFriend.name}
          avatar={linkedFriend.avatar}
          avatarUrl={linkedFriend.avatar_url}
          profile={linkedFriend}
          size={36}
        />
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

  return (
    <div style={{ position: "relative" }}>
      <input
        value={name}
        placeholder="Friend or name…"
        onChange={function (e) { onChangeName(e.target.value); setShowDrop(true); }}
        onFocus={function () { setShowDrop(true); }}
        onBlur={function () { setTimeout(function () { setShowDrop(false); }, 180); }}
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
        if (!hits.length) return null;
        return (
          <div style={{
            position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0,
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
                      <div style={{ fontSize: 11, color: t.textTertiary }}>{u.skill}</div>
                    )}
                  </div>
                  <span style={{
                    fontSize: 9, fontWeight: 800,
                    color: isFriend ? t.accent : t.textTertiary,
                    letterSpacing: "0.12em", textTransform: "uppercase",
                  }}>
                    {isFriend ? "Verified" : "Suggested"}
                  </span>
                </div>
              );
            })}
          </div>
        );
      })()}
    </div>
  );
}
