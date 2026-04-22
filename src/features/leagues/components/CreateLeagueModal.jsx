// src/features/leagues/components/CreateLeagueModal.jsx
//
// Centred dialog (matches the app's ScoreModal / DisputeModal chrome)
// for creating a new private league. Deliberately lean: one screen, no
// wizards. Invites happen after creation from the league detail view.

import { useState } from "react";
import { inputStyle } from "../../../lib/theme.js";

var MATCH_FORMATS = [
  { id: "best_of_3", label: "Best of 3" },
  { id: "one_set",   label: "One set" },
];
var TIEBREAK_FORMATS = [
  { id: "standard",              label: "Standard tiebreak" },
  { id: "super_tiebreak_final",  label: "Super tiebreak final set" },
];
var MAX_MATCHES_OPTIONS = [
  { id: null, label: "Unlimited" },
  { id: 1,    label: "1 per opponent" },
  { id: 2,    label: "2 per opponent" },
];

export default function CreateLeagueModal({ t, onClose, createLeague, onCreated, toast }) {
  var iStyle = inputStyle(t);

  var [name, setName]                                       = useState("");
  var [description, setDescription]                         = useState("");
  var [startDate, setStartDate]                             = useState("");
  var [endDate, setEndDate]                                 = useState("");
  var [maxMembers, setMaxMembers]                           = useState("");
  var [matchFormat, setMatchFormat]                         = useState("best_of_3");
  var [tiebreakFormat, setTiebreakFormat]                   = useState("standard");
  var [maxMatchesPerOpponent, setMaxMatchesPerOpponent]     = useState(null);
  var [winPoints, setWinPoints]                             = useState(3);
  var [lossPoints, setLossPoints]                           = useState(0);
  var [saving, setSaving]                                   = useState(false);
  var [error, setError]                                     = useState("");

  function report(msg) { if (toast) toast(msg, "error"); else setError(msg); }

  async function handleSubmit() {
    setError("");
    if (!name.trim()) { setError("Give your league a name."); return; }
    if (endDate && startDate && endDate < startDate) {
      setError("End date must be on or after the start date."); return;
    }

    setSaving(true);
    var r = await createLeague({
      name: name.trim(),
      description: description.trim() || null,
      start_date: startDate || null,
      end_date:   endDate || null,
      max_members: maxMembers ? parseInt(maxMembers, 10) : null,
      match_format: matchFormat,
      tiebreak_format: tiebreakFormat,
      max_matches_per_opponent: maxMatchesPerOpponent,
      win_points:  winPoints,
      loss_points: lossPoints,
      draw_points: 0,
    });
    setSaving(false);
    if (r && r.error) {
      report((r.error && r.error.message) || "Could not create league — please try again.");
      return;
    }
    if (onCreated) onCreated(r.data /* = new league_id */);
    onClose();
  }

  // Compact styles used throughout — small labels, tighter grid
  var label = { fontSize: 10, fontWeight: 700, color: t.textSecondary, display: "block", marginBottom: 5, letterSpacing: "0.06em", textTransform: "uppercase" };
  var fieldInput = Object.assign({}, iStyle, { fontSize: 13, padding: "9px 12px", marginBottom: 0 });
  var segmentBtn = function (on, labelSize) {
    return {
      flex: 1, padding: "7px 8px",
      borderRadius: 7, border: "1px solid " + (on ? t.accent : t.border),
      background: on ? t.accentSubtle : "transparent",
      color: on ? t.accent : t.textSecondary,
      fontSize: labelSize || 12, fontWeight: on ? 700 : 500,
      cursor: "pointer",
      whiteSpace: "nowrap",
    };
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0,
        background: "rgba(0,0,0,0.45)",
        backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)",
        display: "flex", alignItems: "center", justifyContent: "center",
        zIndex: 200, padding: 16,
      }}>
      {/* The modal itself is the scroll container. maxHeight uses calc()
          against the viewport minus the 32px padding on the backdrop, so
          it's explicit about leaving breathing room instead of relying on
          the brittle flex-column + min-height:0 pattern (which was getting
          ignored on wider viewports and clipping the header + footer). */}
      <div
        onClick={function (e) { e.stopPropagation(); }}
        className="pop"
        style={{
          background: t.modalBg, border: "1px solid " + t.border, borderRadius: 16,
          width: "100%", maxWidth: 480,
          maxHeight: "calc(100vh - 32px)",
          overflowY: "auto",
          boxShadow: "0 20px 50px rgba(0,0,0,0.35)",
          position: "relative",
        }}>

        {/* ── Sticky header — position:sticky pins it inside the scroll
             container while the form body scrolls underneath. Far more
             robust than the previous flex-column pattern. */}
        <div style={{
          position: "sticky", top: 0, zIndex: 2,
          padding: "16px 20px 12px",
          borderBottom: "1px solid " + t.border,
          background: t.modalBg,
        }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, color: t.text, margin: 0, letterSpacing: "-0.2px" }}>
            New league
          </h2>
          <p style={{ fontSize: 11, color: t.textSecondary, margin: "3px 0 0", lineHeight: 1.4 }}>
            Private season with your friends. Invite members after you create it.
          </p>
        </div>

        {/* ── Scrollable body (in normal flow — parent scrolls) ────────────── */}
        <div style={{ padding: "14px 20px 16px" }}>

          {/* Name */}
          <div style={{ marginBottom: 12 }}>
            <label style={label}>Name</label>
            <input value={name} placeholder="e.g. Sunday Crew Autumn"
              autoFocus
              onChange={function (e) { setName(e.target.value); }}
              style={Object.assign({}, fieldInput, { fontSize: 14 })}/>
          </div>

          {/* Description */}
          <div style={{ marginBottom: 12 }}>
            <label style={label}>Description (optional)</label>
            <textarea value={description}
              placeholder="A short note so friends know what this league is."
              rows={2}
              onChange={function (e) { setDescription(e.target.value); }}
              style={Object.assign({}, fieldInput, { resize: "none" })}/>
          </div>

          {/* Dates + Max members in one row */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 12 }}>
            <div>
              <label style={label}>Start</label>
              <input type="date" value={startDate}
                onChange={function (e) { setStartDate(e.target.value); }}
                style={fieldInput}/>
            </div>
            <div>
              <label style={label}>End</label>
              <input type="date" value={endDate}
                onChange={function (e) { setEndDate(e.target.value); }}
                style={fieldInput}/>
            </div>
            <div>
              <label style={label}>Max members</label>
              <input type="number" min="2" value={maxMembers} placeholder="—"
                onChange={function (e) { setMaxMembers(e.target.value); }}
                style={fieldInput}/>
            </div>
          </div>

          {/* Match format */}
          <div style={{ marginBottom: 12 }}>
            <label style={label}>Match format</label>
            <div style={{ display: "flex", gap: 6 }}>
              {MATCH_FORMATS.map(function (o) {
                var on = matchFormat === o.id;
                return (
                  <button key={o.id} onClick={function () { setMatchFormat(o.id); }} style={segmentBtn(on, 12)}>
                    {o.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Tiebreak */}
          <div style={{ marginBottom: 12 }}>
            <label style={label}>Tiebreak</label>
            <div style={{ display: "flex", gap: 6 }}>
              {TIEBREAK_FORMATS.map(function (o) {
                var on = tiebreakFormat === o.id;
                return (
                  <button key={o.id} onClick={function () { setTiebreakFormat(o.id); }} style={segmentBtn(on, 11)}>
                    {o.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Max matches per opponent */}
          <div style={{ marginBottom: 12 }}>
            <label style={label}>Max matches per opponent</label>
            <div style={{ display: "flex", gap: 6 }}>
              {MAX_MATCHES_OPTIONS.map(function (o) {
                var on = maxMatchesPerOpponent === o.id;
                return (
                  <button key={String(o.id)} onClick={function () { setMaxMatchesPerOpponent(o.id); }} style={segmentBtn(on, 12)}>
                    {o.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Points */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <div>
              <label style={label}>Win points</label>
              <input type="number" min="0" value={winPoints}
                onChange={function (e) { setWinPoints(parseInt(e.target.value || "0", 10)); }}
                style={fieldInput}/>
            </div>
            <div>
              <label style={label}>Loss points</label>
              <input type="number" min="0" value={lossPoints}
                onChange={function (e) { setLossPoints(parseInt(e.target.value || "0", 10)); }}
                style={fieldInput}/>
            </div>
          </div>

          {/* Error (inside scroll area — unusual-length messages don't push the
              footer offscreen) */}
          {error && (
            <div style={{ marginTop: 12, padding: "9px 12px", borderRadius: 7, background: t.redSubtle, border: "1px solid " + t.red + "44", fontSize: 12, color: t.red, fontWeight: 500 }}>
              {error}
            </div>
          )}
        </div>

        {/* ── Sticky footer — bottom:0 pins it to the bottom of the scroll
             container (the modal itself), regardless of content length. */}
        <div style={{
          position: "sticky", bottom: 0, zIndex: 2,
          padding: "12px 20px 14px",
          borderTop: "1px solid " + t.border,
          background: t.modalBg,
          display: "flex", gap: 8,
        }}>
          <button
            onClick={onClose}
            style={{ flex: 1, padding: "11px", borderRadius: 8, border: "1px solid " + t.border, background: "transparent", color: t.text, fontSize: 13, fontWeight: 500, cursor: "pointer" }}>
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving}
            style={{ flex: 2, padding: "11px", borderRadius: 8, border: "none", background: saving ? t.border : t.accent, color: "#fff", fontSize: 13, fontWeight: 700, opacity: saving ? 0.7 : 1, cursor: saving ? "default" : "pointer" }}>
            {saving ? "Creating…" : "Create league"}
          </button>
        </div>
      </div>
    </div>
  );
}
