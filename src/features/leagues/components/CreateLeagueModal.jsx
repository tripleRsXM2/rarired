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

  // Chrome matches ScoreModal exactly — same backdrop opacity, same blur,
  // same padding, same borderRadius, same maxWidth, same maxHeight, same
  // internal 28/24px inset. The only difference is content.
  return (
    <div
      onClick={onClose}
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200, padding: "0 16px" }}>
      <div
        onClick={function (e) { e.stopPropagation(); }}
        className="pop"
        style={{ background: t.modalBg, border: "1px solid " + t.border, borderRadius: 16, padding: "28px 24px", width: "100%", maxWidth: 540, maxHeight: "92vh", overflowY: "auto" }}>

        <h2 style={{ fontSize: 18, fontWeight: 700, color: t.text, marginBottom: 4, letterSpacing: "-0.3px" }}>
          New league
        </h2>
        <p style={{ fontSize: 12, color: t.textSecondary, marginBottom: 18 }}>
          Private season with your friends. Invite members after you create it.
        </p>

        {/* Name */}
        <div style={{ marginBottom: 14 }}>
          <label style={{ fontSize: 10, fontWeight: 700, color: t.textSecondary, display: "block", marginBottom: 6, letterSpacing: "0.06em", textTransform: "uppercase" }}>Name</label>
          <input value={name} placeholder="e.g. Sunday Crew Autumn"
            autoFocus
            onChange={function (e) { setName(e.target.value); }}
            style={Object.assign({}, iStyle, { fontSize: 14, marginBottom: 0 })}/>
        </div>

        {/* Description */}
        <div style={{ marginBottom: 14 }}>
          <label style={{ fontSize: 10, fontWeight: 700, color: t.textSecondary, display: "block", marginBottom: 6, letterSpacing: "0.06em", textTransform: "uppercase" }}>Description (optional)</label>
          <textarea value={description}
            placeholder="A short note so friends know what this league is."
            rows={2}
            onChange={function (e) { setDescription(e.target.value); }}
            style={Object.assign({}, iStyle, { fontSize: 13, resize: "none", marginBottom: 0 })}/>
        </div>

        {/* Dates + Max members */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 14 }}>
          <div>
            <label style={{ fontSize: 10, fontWeight: 700, color: t.textSecondary, display: "block", marginBottom: 6, letterSpacing: "0.06em", textTransform: "uppercase" }}>Start</label>
            <input type="date" value={startDate}
              onChange={function (e) { setStartDate(e.target.value); }}
              style={Object.assign({}, iStyle, { fontSize: 13, marginBottom: 0 })}/>
          </div>
          <div>
            <label style={{ fontSize: 10, fontWeight: 700, color: t.textSecondary, display: "block", marginBottom: 6, letterSpacing: "0.06em", textTransform: "uppercase" }}>End</label>
            <input type="date" value={endDate}
              onChange={function (e) { setEndDate(e.target.value); }}
              style={Object.assign({}, iStyle, { fontSize: 13, marginBottom: 0 })}/>
          </div>
          <div>
            <label style={{ fontSize: 10, fontWeight: 700, color: t.textSecondary, display: "block", marginBottom: 6, letterSpacing: "0.06em", textTransform: "uppercase" }}>Max members</label>
            <input type="number" min="2" value={maxMembers} placeholder="—"
              onChange={function (e) { setMaxMembers(e.target.value); }}
              style={Object.assign({}, iStyle, { fontSize: 13, marginBottom: 0 })}/>
          </div>
        </div>

        {/* Match format */}
        <div style={{ marginBottom: 14 }}>
          <label style={{ fontSize: 10, fontWeight: 700, color: t.textSecondary, display: "block", marginBottom: 8, letterSpacing: "0.06em", textTransform: "uppercase" }}>Match format</label>
          <div style={{ display: "flex", gap: 8 }}>
            {MATCH_FORMATS.map(function (o) {
              var on = matchFormat === o.id;
              return (
                <button key={o.id}
                  onClick={function () { setMatchFormat(o.id); }}
                  style={{ flex: 1, padding: "11px", borderRadius: 9, border: "1px solid " + (on ? t.accent : t.border), background: on ? t.accentSubtle : "transparent", color: on ? t.accent : t.textSecondary, fontSize: 14, fontWeight: on ? 700 : 500, cursor: "pointer" }}>
                  {o.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Tiebreak */}
        <div style={{ marginBottom: 14 }}>
          <label style={{ fontSize: 10, fontWeight: 700, color: t.textSecondary, display: "block", marginBottom: 8, letterSpacing: "0.06em", textTransform: "uppercase" }}>Tiebreak</label>
          <div style={{ display: "flex", gap: 8 }}>
            {TIEBREAK_FORMATS.map(function (o) {
              var on = tiebreakFormat === o.id;
              return (
                <button key={o.id}
                  onClick={function () { setTiebreakFormat(o.id); }}
                  style={{ flex: 1, padding: "11px", borderRadius: 9, border: "1px solid " + (on ? t.accent : t.border), background: on ? t.accentSubtle : "transparent", color: on ? t.accent : t.textSecondary, fontSize: 13, fontWeight: on ? 700 : 500, cursor: "pointer" }}>
                  {o.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Max matches per opponent */}
        <div style={{ marginBottom: 14 }}>
          <label style={{ fontSize: 10, fontWeight: 700, color: t.textSecondary, display: "block", marginBottom: 8, letterSpacing: "0.06em", textTransform: "uppercase" }}>Max matches per opponent</label>
          <div style={{ display: "flex", gap: 8 }}>
            {MAX_MATCHES_OPTIONS.map(function (o) {
              var on = maxMatchesPerOpponent === o.id;
              return (
                <button key={String(o.id)}
                  onClick={function () { setMaxMatchesPerOpponent(o.id); }}
                  style={{ flex: 1, padding: "11px", borderRadius: 9, border: "1px solid " + (on ? t.accent : t.border), background: on ? t.accentSubtle : "transparent", color: on ? t.accent : t.textSecondary, fontSize: 13, fontWeight: on ? 700 : 500, cursor: "pointer" }}>
                  {o.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Points */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 16 }}>
          <div>
            <label style={{ fontSize: 10, fontWeight: 700, color: t.textSecondary, display: "block", marginBottom: 6, letterSpacing: "0.06em", textTransform: "uppercase" }}>Win points</label>
            <input type="number" min="0" value={winPoints}
              onChange={function (e) { setWinPoints(parseInt(e.target.value || "0", 10)); }}
              style={Object.assign({}, iStyle, { fontSize: 13, marginBottom: 0 })}/>
          </div>
          <div>
            <label style={{ fontSize: 10, fontWeight: 700, color: t.textSecondary, display: "block", marginBottom: 6, letterSpacing: "0.06em", textTransform: "uppercase" }}>Loss points</label>
            <input type="number" min="0" value={lossPoints}
              onChange={function (e) { setLossPoints(parseInt(e.target.value || "0", 10)); }}
              style={Object.assign({}, iStyle, { fontSize: 13, marginBottom: 0 })}/>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div style={{ marginBottom: 12, padding: "10px 14px", borderRadius: 8, background: t.redSubtle, border: "1px solid " + t.red + "44", fontSize: 12, color: t.red, fontWeight: 500 }}>
            {error}
          </div>
        )}

        {/* Actions — same layout as ScoreModal's Cancel / Save row. */}
        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={onClose}
            style={{ flex: 1, padding: "12px", borderRadius: 8, border: "1px solid " + t.border, background: "transparent", color: t.text, fontSize: 13, fontWeight: 500 }}>
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving}
            style={{ flex: 2, padding: "12px", borderRadius: 8, border: "none", background: saving ? t.border : t.accent, color: "#fff", fontSize: 13, fontWeight: 600, opacity: saving ? 0.7 : 1 }}>
            {saving ? "Creating…" : "Create league"}
          </button>
        </div>
      </div>
    </div>
  );
}
