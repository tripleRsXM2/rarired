// src/features/leagues/components/LeagueLifecycleMenu.jsx
//
// Module 12 Slice 2 — owner-only 3-dot menu in the league detail
// header. Opens a dropdown with the lifecycle actions the current
// status allows (gated by canComplete / canArchive / canCancel /
// canVoid in ../utils/leagueLifecycle.js — same predicates the DB
// RPCs enforce). Selecting an action closes the menu and signals the
// parent (LeaguesPanel) to mount LeagueLifecycleModal for that action.

import { useEffect, useRef, useState } from "react";
import {
  canComplete, canArchive, canCancel, canVoid,
  LIFECYCLE_ACTION_COPY,
} from "../utils/leagueLifecycle.js";

export default function LeagueLifecycleMenu({
  t,
  league,
  iAmOwner,
  onPickAction,    // (action) => void where action ∈ 'complete'|'archive'|'cancel'|'void'
}) {
  var [open, setOpen] = useState(false);
  var rootRef = useRef(null);

  // Click-outside + Escape close. Standard dropdown plumbing — kept
  // local because it's the only place in the app that needs it; the
  // rest of the codebase uses portal modals, not anchored dropdowns.
  useEffect(function () {
    if (!open) return undefined;
    function onDocDown(e) {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
    }
    function onKey(e) { if (e.key === "Escape") setOpen(false); }
    document.addEventListener("mousedown", onDocDown);
    document.addEventListener("keydown", onKey);
    return function () {
      document.removeEventListener("mousedown", onDocDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Build the visible items. Each row knows its predicate; only the
  // ones that pass make it in. If nothing passes, render nothing —
  // the kebab disappears for non-owners or for past leagues whose
  // owner can't transition any further from the current state.
  var items = [];
  if (canComplete(league, iAmOwner)) items.push({ key: "complete", copy: LIFECYCLE_ACTION_COPY.complete });
  if (canArchive(league, iAmOwner))  items.push({ key: "archive",  copy: LIFECYCLE_ACTION_COPY.archive });
  if (canCancel(league, iAmOwner))   items.push({ key: "cancel",   copy: LIFECYCLE_ACTION_COPY.cancel });
  if (canVoid(league, iAmOwner))     items.push({ key: "void",     copy: LIFECYCLE_ACTION_COPY.void });

  if (items.length === 0) return null;

  function handlePick(actionKey) {
    setOpen(false);
    if (onPickAction) onPickAction(actionKey);
  }

  return (
    <div ref={rootRef} style={{ position: "relative", display: "inline-block" }}>
      <button
        onClick={function () { setOpen(function (v) { return !v; }); }}
        aria-label="Lifecycle actions"
        title="Lifecycle actions"
        style={{
          padding: "5px",
          background: "transparent",
          border: "1px solid " + t.border,
          borderRadius: 0,
          color: t.textSecondary,
          cursor: "pointer",
          display: "inline-flex", alignItems: "center", justifyContent: "center",
          lineHeight: 0,
        }}>
        {/* 3-dot kebab — line-art SVG, currentColor stroke, matches NAV_ICONS */}
        <svg width="16" height="16" viewBox="0 0 18 18" fill="none">
          <circle cx="9" cy="4"  r="1.25" fill="currentColor"/>
          <circle cx="9" cy="9"  r="1.25" fill="currentColor"/>
          <circle cx="9" cy="14" r="1.25" fill="currentColor"/>
        </svg>
      </button>

      {open && (
        <div
          role="menu"
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            right: 0,
            minWidth: 200,
            background: t.bgCard,
            border: "1px solid " + t.border,
            borderRadius: 0,
            boxShadow: "0 8px 24px rgba(0,0,0,0.25)",
            zIndex: 50,
            overflow: "hidden",
          }}>
          {items.map(function (item, idx) {
            return (
              <button
                key={item.key}
                role="menuitem"
                onClick={function () { handlePick(item.key); }}
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  background: "transparent",
                  border: "none",
                  borderTop: idx === 0 ? "none" : "1px solid " + t.border,
                  textAlign: "left",
                  cursor: "pointer",
                  color: item.copy.destructive ? t.red : t.text,
                  fontSize: 12.5,
                  fontWeight: 600,
                  letterSpacing: "0.01em",
                }}>
                {item.copy.verb}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
