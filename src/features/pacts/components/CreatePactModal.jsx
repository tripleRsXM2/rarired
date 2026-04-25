// src/features/pacts/components/CreatePactModal.jsx
//
// Propose a new pact. Two modes — picked at the top of the modal:
//
//   • Direct    — partner chosen from friend list. Partner is notified,
//                 partner taps Agree to lift to 'confirmed'.
//
//   • Open court — partner_id left null, zone_id required. Appears in
//                 the Open Courts panel of that zone. Any eligible
//                 player can claim it via claim_open_pact.
//
// Keeps the fields tight: venue (free text), optional court, date + time,
// optional cost estimate + split preference, optional booking ref if
// someone's already booked. All optional fields default to empty.

import { useState } from "react";
import PlayerAvatar from "../../../components/ui/PlayerAvatar.jsx";
import { ZONES, ZONE_BY_ID } from "../../map/data/zones.js";
import { COURTS } from "../../map/data/courts.js";
import { SKILL_LEVELS } from "../../../lib/constants/domain.js";

function toIso(dateStr, timeStr) {
  if (!dateStr) return null;
  var dt = new Date(dateStr + "T" + (timeStr || "18:00") + ":00");
  if (isNaN(dt.getTime())) return null;
  return dt.toISOString();
}

export default function CreatePactModal({
  t, authUser, profile, friends, onClose, onPropose,
  defaultPartner, // optional preselected partner (e.g. from a challenge)
}) {
  var [mode, setMode] = useState(defaultPartner ? "direct" : "direct"); // "direct" | "open"
  var [partner, setPartner] = useState(defaultPartner || null);
  var [friendQuery, setFriendQuery] = useState("");
  // Venue picker state. `venueSource` is the curated court id (e.g.
  // court name) or "__custom" for freetext. Empty = nothing chosen yet.
  var [venueSource, setVenueSource] = useState("");
  var [venue, setVenue] = useState("");
  var [court, setCourtText] = useState("");
  var [date, setDate] = useState(function () {
    var d = new Date(Date.now() + 24 * 3600 * 1000);
    return d.toISOString().slice(0, 10);
  });
  var [time, setTime] = useState("18:00");
  var [zoneId, setZoneId] = useState((profile && profile.home_zone) || (ZONES[0] && ZONES[0].id));
  var [skill, setSkill]   = useState((profile && profile.skill) || "");
  var [message, setMessage] = useState("");
  var [totalCost, setTotalCost] = useState(""); // in dollars as typed
  var [splitMode, setSplitMode] = useState("50_50");
  var [bookingRef, setBookingRef] = useState("");
  var [saving, setSaving] = useState(false);
  var [error, setError]   = useState("");

  async function submit() {
    setError("");
    if (mode === "direct" && !partner) { setError("Pick a partner."); return; }
    if (!venue.trim()) { setError("Venue is required."); return; }
    var scheduled = toIso(date, time);
    if (!scheduled) { setError("Pick a valid date and time."); return; }
    setSaving(true);
    var cents = null;
    if (totalCost.trim()) {
      var n = Number(totalCost);
      if (isFinite(n) && n >= 0) cents = Math.round(n * 100);
    }
    var payload = {
      partner_id: mode === "direct" ? (partner && partner.id) : null,
      zone_id:    mode === "open"   ? zoneId : ((profile && profile.home_zone) || null),
      venue:      venue.trim(),
      court:      court.trim() || null,
      scheduled_at: scheduled,
      skill:      mode === "open" ? (skill || null) : null,
      message:    message.trim() ? message.trim().slice(0, 280) : null,
      total_cost_cents: cents,
      split_mode: splitMode,
      booking_ref: bookingRef.trim() || null,
    };
    var r = await onPropose(payload);
    setSaving(false);
    if (r && r.error) { setError(typeof r.error === "string" ? r.error : (r.error.message || "Could not post.")); return; }
    onClose();
  }

  var inputStyle = {
    width: "100%", padding: "11px 12px", borderRadius: 8,
    border: "1px solid " + t.border, background: t.inputBg, color: t.text,
    fontSize: 14, fontWeight: 500, boxSizing: "border-box",
  };

  return (
    <div onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 600,
        background: "rgba(0,0,0,0.48)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 16,
      }}>
      <div onClick={function (e) { e.stopPropagation(); }}
        style={{
          width: "100%", maxWidth: 520, maxHeight: "92vh", overflowY: "auto",
          background: t.modalBg, border: "1px solid " + t.border, borderRadius: 16,
          padding: "24px 22px 22px",
        }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
          <div>
            <h2 style={{ fontSize: 19, fontWeight: 700, color: t.text, margin: 0, letterSpacing: "-0.4px" }}>
              New pact
            </h2>
            <p style={{ fontSize: 12, color: t.textSecondary, margin: "4px 0 0", lineHeight: 1.4 }}>
              Line up the plan. You both agree, then one of you books.
            </p>
          </div>
          <button onClick={onClose}
            style={{ background: "none", border: "none", color: t.textTertiary, fontSize: 22, cursor: "pointer", padding: 0, lineHeight: 1 }}>×</button>
        </div>

        {/* Mode switch */}
        <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
          {[{ id: "direct", label: "Partner" }, { id: "open", label: "Open court" }].map(function (m) {
            var on = mode === m.id;
            return (
              <button key={m.id}
                onClick={function () { setMode(m.id); }}
                style={{
                  flex: 1, padding: "10px", borderRadius: 8,
                  border: "1px solid " + (on ? t.accent : t.border),
                  background: on ? t.accentSubtle : "transparent",
                  color: on ? t.accent : t.textSecondary,
                  fontSize: 13, fontWeight: on ? 700 : 500, cursor: "pointer",
                }}>
                {m.label}
              </button>
            );
          })}
        </div>

        {/* Direct mode — partner pick with search + scrollable list */}
        {mode === "direct" && (
          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 11, fontWeight: 700, color: t.textTertiary, letterSpacing: "0.12em", textTransform: "uppercase" }}>Partner</label>
            {partner ? (
              <div style={{ marginTop: 6, display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", border: "1px solid " + t.border, borderRadius: 8 }}>
                <PlayerAvatar name={partner.name} avatar={partner.avatar} avatarUrl={partner.avatar_url} size={30}/>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: t.text }}>{partner.name}</div>
                </div>
                <button onClick={function () { setPartner(null); }}
                  style={{ background: "transparent", border: "none", fontSize: 12, color: t.textTertiary, cursor: "pointer" }}>change</button>
              </div>
            ) : (function () {
              // Filter friends by the search query. Case-insensitive, matches
              // anywhere in the name. Passing authUser.id upstream ensures
              // we never see the viewer themselves in this list.
              var list = (friends || []).filter(function (f) {
                if (!f || !f.id) return false;
                if (authUser && f.id === authUser.id) return false;
                if (!friendQuery.trim()) return true;
                return (f.name || "").toLowerCase().indexOf(friendQuery.trim().toLowerCase()) >= 0;
              });
              return (
                <div style={{ marginTop: 6 }}>
                  <input
                    value={friendQuery}
                    onChange={function (e) { setFriendQuery(e.target.value); }}
                    placeholder={(friends || []).length ? ("Search " + (friends || []).length + " friend" + ((friends || []).length === 1 ? "" : "s") + "…") : "No friends to search"}
                    style={Object.assign({}, inputStyle, { marginBottom: 8 })}/>
                  <div style={{ maxHeight: 220, overflowY: "auto", border: "1px solid " + t.border, borderRadius: 8 }}>
                    {(friends || []).length === 0 && (
                      <div style={{ padding: "16px", fontSize: 12, color: t.textTertiary, lineHeight: 1.5 }}>
                        You don't have any friends on the app yet.
                        Post an <strong>open court</strong> instead, or add friends from the People tab.
                      </div>
                    )}
                    {(friends || []).length > 0 && list.length === 0 && (
                      <div style={{ padding: "16px", fontSize: 12, color: t.textTertiary }}>
                        No friends match "{friendQuery}".
                      </div>
                    )}
                    {list.map(function (f, idx) {
                      return (
                        <button key={f.id}
                          onClick={function () { setPartner(f); }}
                          style={{
                            display: "flex", gap: 10, width: "100%", padding: "9px 10px",
                            border: "none", background: "transparent", cursor: "pointer",
                            alignItems: "center",
                            borderBottom: idx === list.length - 1 ? "none" : "1px solid " + t.border,
                            textAlign: "left",
                          }}
                          onMouseEnter={function (e) { e.currentTarget.style.background = t.accentSubtle; }}
                          onMouseLeave={function (e) { e.currentTarget.style.background = "transparent"; }}>
                          <PlayerAvatar name={f.name} avatar={f.avatar} avatarUrl={f.avatar_url} size={28}/>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 13, color: t.text, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.name}</div>
                            {f.skill && (
                              <div style={{ fontSize: 10.5, color: t.textTertiary, marginTop: 1 }}>
                                {f.skill}{f.home_zone ? (" · " + ((ZONE_BY_ID[f.home_zone] && ZONE_BY_ID[f.home_zone].name) || "")) : ""}
                              </div>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })()}
          </div>
        )}

        {/* Open mode — zone + skill */}
        {mode === "open" && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: t.textTertiary, letterSpacing: "0.12em", textTransform: "uppercase" }}>Zone</label>
              <select value={zoneId || ""} onChange={function (e) { setZoneId(e.target.value || null); }}
                style={Object.assign({}, inputStyle, { marginTop: 6 })}>
                {ZONES.map(function (z) { return <option key={z.id} value={z.id}>{z.name}</option>; })}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: t.textTertiary, letterSpacing: "0.12em", textTransform: "uppercase" }}>Skill</label>
              <select value={skill || ""} onChange={function (e) { setSkill(e.target.value); }}
                style={Object.assign({}, inputStyle, { marginTop: 6 })}>
                <option value="">Any</option>
                {SKILL_LEVELS.map(function (s) { return <option key={s} value={s}>{s}</option>; })}
              </select>
            </div>
          </div>
        )}

        {/* Venue picker — curated courts grouped by zone + custom fallback.
            Picking a curated court auto-sets both the venue string and the
            zone_id (for open-court postings) so the map and the pact agree
            on which zone this match belongs to. "Other (type your own)"
            unlocks the freetext field below for venues we haven't curated. */}
        <div style={{ marginBottom: 10 }}>
          <label style={{ fontSize: 11, fontWeight: 700, color: t.textTertiary, letterSpacing: "0.12em", textTransform: "uppercase" }}>Venue</label>
          <select
            value={venueSource}
            onChange={function (e) {
              var v = e.target.value;
              setVenueSource(v);
              if (v === "__custom") {
                setVenue("");  // clear so the custom input is empty and placeholder shows
              } else if (v) {
                var c = COURTS.find(function (x) { return x.name === v; });
                if (c) {
                  setVenue(c.name);
                  if (c.zone) setZoneId(c.zone);
                }
              } else {
                setVenue("");
              }
            }}
            style={Object.assign({}, inputStyle, { marginTop: 6 })}>
            <option value="">Pick a venue…</option>
            {ZONES.map(function (z) {
              var inZone = COURTS.filter(function (c) { return c.zone === z.id; });
              if (!inZone.length) return null;
              return (
                <optgroup key={z.id} label={z.num + " · " + z.name}>
                  {inZone.map(function (c) {
                    return <option key={c.name} value={c.name}>{c.name}{c.suburb ? " — " + c.suburb : ""}</option>;
                  })}
                </optgroup>
              );
            })}
            <option value="__custom">Other (type your own)</option>
          </select>
          {venueSource === "__custom" && (
            <input
              value={venue}
              onChange={function (e) { setVenue(e.target.value); }}
              placeholder="Venue name"
              autoFocus
              style={Object.assign({}, inputStyle, { marginTop: 8 })}/>
          )}
        </div>

        <div style={{ marginBottom: 10 }}>
          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: t.textTertiary, letterSpacing: "0.12em", textTransform: "uppercase" }}>Court #</label>
            <input value={court} onChange={function (e) { setCourtText(e.target.value); }}
              placeholder="optional"
              style={Object.assign({}, inputStyle, { marginTop: 6 })}/>
          </div>
        </div>

        {/* Date + time */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: t.textTertiary, letterSpacing: "0.12em", textTransform: "uppercase" }}>Date</label>
            <input type="date" value={date} onChange={function (e) { setDate(e.target.value); }}
              style={Object.assign({}, inputStyle, { marginTop: 6 })}/>
          </div>
          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: t.textTertiary, letterSpacing: "0.12em", textTransform: "uppercase" }}>Time</label>
            <input type="time" value={time} onChange={function (e) { setTime(e.target.value); }}
              style={Object.assign({}, inputStyle, { marginTop: 6 })}/>
          </div>
        </div>

        {/* Message */}
        <div style={{ marginBottom: 10 }}>
          <label style={{ fontSize: 11, fontWeight: 700, color: t.textTertiary, letterSpacing: "0.12em", textTransform: "uppercase" }}>Note (optional)</label>
          <textarea value={message} onChange={function (e) { setMessage(e.target.value.slice(0, 280)); }}
            placeholder={mode === "open" ? "e.g. Looking for a 4.0 level hit, doubles welcome." : "e.g. Best of 3 sets, bring balls."}
            style={Object.assign({}, inputStyle, { marginTop: 6, resize: "vertical", minHeight: 60, fontFamily: "inherit" })}/>
        </div>

        {/* Cost + split */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1.6fr", gap: 10, marginBottom: 10 }}>
          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: t.textTertiary, letterSpacing: "0.12em", textTransform: "uppercase" }}>Court fee (AU$)</label>
            <input type="number" value={totalCost} onChange={function (e) { setTotalCost(e.target.value); }}
              placeholder="optional"
              style={Object.assign({}, inputStyle, { marginTop: 6 })}/>
          </div>
          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: t.textTertiary, letterSpacing: "0.12em", textTransform: "uppercase" }}>Split</label>
            <select value={splitMode} onChange={function (e) { setSplitMode(e.target.value); }}
              style={Object.assign({}, inputStyle, { marginTop: 6 })}>
              <option value="50_50">50 / 50</option>
              <option value="proposer_pays">I'm shouting (I pay all)</option>
              <option value="partner_pays">They're shouting (they pay all)</option>
              <option value="custom">Custom (set on booking)</option>
            </select>
          </div>
        </div>

        {/* Booking ref */}
        <div style={{ marginBottom: 14 }}>
          <label style={{ fontSize: 11, fontWeight: 700, color: t.textTertiary, letterSpacing: "0.12em", textTransform: "uppercase" }}>Already booked? Confirmation #</label>
          <input value={bookingRef} onChange={function (e) { setBookingRef(e.target.value); }}
            placeholder="optional — paste the operator's reference"
            style={Object.assign({}, inputStyle, { marginTop: 6 })}/>
        </div>

        {error && (
          <div style={{ padding: "10px 12px", borderRadius: 8, background: t.redSubtle, border: "1px solid " + t.red + "44", fontSize: 12, color: t.red, marginBottom: 10 }}>
            {error}
          </div>
        )}

        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={onClose}
            style={{ flex: 1, padding: 12, borderRadius: 8, border: "1px solid " + t.border, background: "transparent", color: t.text, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
            Cancel
          </button>
          <button onClick={submit} disabled={saving}
            style={{ flex: 2, padding: 12, borderRadius: 8, border: "none", background: saving ? t.border : t.accent, color: t.accentText, fontSize: 13, fontWeight: 700, cursor: saving ? "default" : "pointer", letterSpacing: "-0.01em" }}>
            {saving ? "Posting…" : (mode === "open" ? "Post open court" : "Send pact")}
          </button>
        </div>
      </div>
    </div>
  );
}
