// src/features/people/components/EmojiPicker.jsx
//
// Lightweight emoji picker — categories tab bar at the top, grid body,
// search input at the bottom. Uses the bundled EMOJI_BY_CATEGORY set
// (~400 glyphs, ~12 KB). Pure emoji characters, rendered by the OS —
// no images, no external fonts.
//
// Designed to work identically on desktop and mobile. Calls `onPick(emoji)`
// on every selection; keeps the picker open so users can pick multiple
// (e.g. for reactions) — the caller closes when appropriate.

import { useEffect, useMemo, useRef, useState } from "react";
import {
  EMOJI_CATEGORIES,
  EMOJI_BY_CATEGORY,
  searchEmojis,
  readRecents,
  pushRecent,
} from "../utils/emojiData.js";

export default function EmojiPicker({ t, onPick, onClose, anchor }) {
  // anchor: optional DOMRect from the trigger element. We position the
  // picker above or below the anchor. If omitted we center it.

  var [cat, setCat] = useState("smileys");
  var [query, setQuery] = useState("");
  var [recents, setRecents] = useState(function () { return readRecents(); });
  var rootRef = useRef(null);

  // Close on outside tap / Escape. The outside-click listeners are attached
  // on the next frame so the same click that opened the picker (via its
  // trigger button) doesn't immediately hit `document` and close us again —
  // that's what was breaking the "+" → picker flow on desktop.
  useEffect(function () {
    function onDoc(e) {
      if (!rootRef.current) return;
      if (rootRef.current.contains(e.target)) return;
      onClose && onClose();
    }
    function onKey(e) { if (e.key === "Escape") onClose && onClose(); }
    var rafId = requestAnimationFrame(function () {
      document.addEventListener("mousedown", onDoc);
      document.addEventListener("touchstart", onDoc);
    });
    document.addEventListener("keydown", onKey);
    return function () {
      cancelAnimationFrame(rafId);
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("touchstart", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  var list = useMemo(function () {
    if (query.trim()) return searchEmojis(query, 200).map(function (e) { return [e, ""]; });
    if (cat === "recent") return recents.map(function (e) { return [e, ""]; });
    return EMOJI_BY_CATEGORY[cat] || [];
  }, [cat, query, recents]);

  function handlePick(emoji) {
    setRecents(pushRecent(emoji));
    onPick && onPick(emoji);
  }

  // Position: prefer ABOVE the anchor on mobile (keyboard-safe), below on
  // desktop. Falls back to centered if no anchor.
  var pos = useMemo(function () {
    if (!anchor) {
      return { position: "fixed", left: "50%", top: "50%", transform: "translate(-50%,-50%)" };
    }
    var vw = window.innerWidth, vh = window.innerHeight;
    var w = Math.min(340, vw - 16);
    var left = Math.max(8, Math.min(anchor.left, vw - w - 8));
    // Compute available vertical space on each side of the anchor and
    // clamp picker height to whichever fits. Picker NEVER overlaps the
    // anchor button — that was the "emoji box covers the chat entry"
    // bug. Prefer opening above on mobile and when below is tight.
    var gap = 8;
    var spaceAbove = Math.max(0, anchor.top - gap - 8);
    var spaceBelow = Math.max(0, vh - anchor.bottom - gap - 8);
    var preferBelow = spaceBelow >= 240; // enough for ~6 rows
    var h, top;
    if (preferBelow) {
      h = Math.min(360, spaceBelow);
      top = anchor.bottom + gap;
    } else {
      h = Math.min(360, spaceAbove);
      top = Math.max(8, anchor.top - h - gap);
    }
    // Final safety: if the chosen side is too tiny, flip and use the
    // larger side even if it's the less-preferred one.
    if (h < 180 && (preferBelow ? spaceAbove : spaceBelow) > h) {
      if (preferBelow) {
        h = Math.min(360, spaceAbove);
        top = Math.max(8, anchor.top - h - gap);
      } else {
        h = Math.min(360, spaceBelow);
        top = anchor.bottom + gap;
      }
    }
    return { position: "fixed", left: left, top: top, width: w, height: h };
  }, [anchor]);

  return (
    <div
      ref={rootRef}
      className="pop"
      role="dialog"
      aria-label="Pick an emoji"
      style={Object.assign({}, pos, {
        zIndex: 2100,
        background: t.bgCard,
        border: "1px solid " + t.border,
        borderRadius: 14,
        boxShadow: "0 12px 36px rgba(0,0,0,0.22)",
        display: "flex", flexDirection: "column",
        overflow: "hidden",
        width: pos.width || 340,
        height: pos.height || 360,
      })}>

      {/* Category tabs */}
      <div style={{
        display: "flex", gap: 2, padding: "6px 4px", borderBottom: "1px solid " + t.border,
        overflowX: "auto", flexShrink: 0,
      }}>
        {EMOJI_CATEGORIES.map(function (c) {
          if (c.id === "recent" && !recents.length) return null;
          var on = cat === c.id && !query;
          return (
            <button key={c.id} type="button" aria-label={c.label}
              onClick={function () { setQuery(""); setCat(c.id); }}
              style={{
                fontSize: 16, padding: "6px 8px", lineHeight: 1,
                border: "none", background: on ? t.accentSubtle : "transparent",
                color: t.text, borderRadius: 7, cursor: "pointer",
                flex: "0 0 auto", opacity: on ? 1 : 0.65,
              }}>{c.icon}</button>
          );
        })}
      </div>

      {/* Grid */}
      <div style={{
        flex: 1, overflowY: "auto", padding: "6px 4px",
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(34px, 1fr))",
        gap: 0,
        alignContent: "start",
      }}>
        {list.length === 0 && (
          <div style={{
            gridColumn: "1/-1", textAlign: "center", padding: "24px 16px",
            color: t.textTertiary, fontSize: 12,
          }}>No emoji found</div>
        )}
        {list.map(function (row, i) {
          var ch = Array.isArray(row) ? row[0] : row;
          return (
            <button key={ch + ":" + i} type="button"
              onClick={function () { handlePick(ch); }}
              style={{
                fontSize: 22, lineHeight: 1,
                padding: "6px 0",
                background: "transparent", border: "none", cursor: "pointer",
                borderRadius: 6,
              }}
              onMouseEnter={function (e) { e.currentTarget.style.background = t.bgTertiary; }}
              onMouseLeave={function (e) { e.currentTarget.style.background = "transparent"; }}
            >{ch}</button>
          );
        })}
      </div>

      {/* Search */}
      <div style={{ padding: 8, borderTop: "1px solid " + t.border, flexShrink: 0 }}>
        <input
          type="text"
          value={query}
          onChange={function (e) { setQuery(e.target.value); }}
          placeholder="Search…"
          autoFocus={false}
          style={{
            width: "100%", padding: "8px 10px",
            borderRadius: 8, border: "1px solid " + t.border,
            background: t.inputBg, color: t.text, fontSize: 13, boxSizing: "border-box",
          }}
        />
      </div>
    </div>
  );
}
