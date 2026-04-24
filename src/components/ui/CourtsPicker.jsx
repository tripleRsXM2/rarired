// src/components/ui/CourtsPicker.jsx
//
// Multi-select for "courts I actually play at". Backed by the curated
// COURTS list from features/map/data/courts.js — same names the venue
// picker, the map markers, and match_history.venue match against.
//
// UX contract (team huddle decision):
//   • cap at 8 selections; past the cap, unselected options disable
//   • selected courts render as removable chips at the top
//   • remaining options render grouped by zone, searchable
//   • zone labels match the map so users orient quickly
//
// Why the cap: self-reports get noisy above ~8 courts — "I play
// everywhere" is usually "I play at 3 places but I've been to 10 once."
// Keeping the cap low forces users to pick their real rotation.

import { useMemo, useState } from "react";
import { COURTS } from "../../features/map/data/courts.js";
import { ZONES } from "../../features/map/data/zones.js";

var DEFAULT_CAP = 8;

// Map every known name (canonical + every alias) → the canonical court
// name. Lets a legacy value like "Prince Alfred Park" or "Moore Park
// Tennis" still resolve to the current "Prince Alfred Park Tennis
// Courts" / "Centennial Parklands Sports Centre..." entry. Without this,
// a user whose played_courts already contained an alias would see the
// old string as a stuck-orphan chip while the current court was visible
// in the pickable list — the "missing" report the user called out.
var ALIAS_TO_CANONICAL = (function () {
  var m = {};
  COURTS.forEach(function (c) {
    m[c.name.toLowerCase()] = c.name;
    (c.aliases || []).forEach(function (a) { m[a.toLowerCase()] = c.name; });
  });
  return m;
})();

function toCanonical(name) {
  if (!name) return name;
  return ALIAS_TO_CANONICAL[name.toLowerCase()] || name;
}

export default function CourtsPicker({ t, value, onChange, cap }) {
  var limit = cap || DEFAULT_CAP;
  var [query, setQuery] = useState("");

  // Canonicalise + de-dupe the incoming selection. If the parent stores
  // an alias ("Prince Alfred Park"), we display + filter against the
  // canonical ("Prince Alfred Park Tennis Courts") so the user never
  // sees the same court twice and never sees a stuck orphan chip.
  var selected = useMemo(function () {
    var seen = new Set();
    var out = [];
    (value || []).forEach(function (n) {
      var c = toCanonical(n);
      if (!seen.has(c)) { seen.add(c); out.push(c); }
    });
    return out;
  }, [value]);

  var atCap = selected.length >= limit;

  var grouped = useMemo(function () {
    // One list per zone, each list filtered by the search query.
    return ZONES.map(function (z) {
      var inZone = COURTS.filter(function (c) {
        if (c.zone !== z.id) return false;
        if (selected.indexOf(c.name) >= 0) return false;
        if (!query.trim()) return true;
        var q = query.trim().toLowerCase();
        var hay = c.name + " " + (c.suburb || "") + " " + ((c.aliases || []).join(" "));
        return hay.toLowerCase().indexOf(q) >= 0;
      });
      return { zone: z, courts: inZone };
    }).filter(function (g) { return g.courts.length > 0; });
  }, [selected, query]);

  function addCourt(name) {
    if (atCap) return;
    var c = toCanonical(name);
    if (selected.indexOf(c) >= 0) return;
    // Write back the de-duped canonical list so the parent store settles.
    onChange(selected.concat([c]));
  }
  function removeCourt(name) {
    var c = toCanonical(name);
    onChange(selected.filter(function (n) { return n !== c; }));
  }

  return (
    <div>
      {/* Selected chips */}
      {selected.length > 0 && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
          {selected.map(function (name) {
            return (
              <span key={name} style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                padding: "5px 8px 5px 10px", borderRadius: 16,
                background: t.accentSubtle, color: t.accent,
                fontSize: 12, fontWeight: 700,
              }}>
                {name}
                <button onClick={function () { removeCourt(name); }}
                  title={"Remove " + name}
                  style={{
                    background: "transparent", border: "none", cursor: "pointer",
                    color: t.accent, padding: 0, fontSize: 14, lineHeight: 1,
                  }}>×</button>
              </span>
            );
          })}
        </div>
      )}

      {/* Counter + search */}
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}>
        <input
          value={query}
          onChange={function (e) { setQuery(e.target.value); }}
          placeholder="Search courts…"
          style={{
            flex: 1, padding: "8px 10px", borderRadius: 8,
            border: "1px solid " + t.border, background: t.inputBg, color: t.text,
            fontSize: 13,
          }}/>
        <span style={{
          fontSize: 11, fontWeight: 600,
          color: atCap ? t.red : t.textTertiary,
          whiteSpace: "nowrap",
        }}>
          {selected.length} / {limit}
        </span>
      </div>

      {atCap && (
        <div style={{ padding: "8px 10px", borderRadius: 8, background: t.redSubtle, border: "1px solid " + t.red + "44", color: t.red, fontSize: 11, marginBottom: 8 }}>
          Cap reached — remove a court to add another.
        </div>
      )}

      {/* Grouped picker */}
      <div style={{ maxHeight: 240, overflowY: "auto", border: "1px solid " + t.border, borderRadius: 8 }}>
        {grouped.length === 0 && (
          <div style={{ padding: 16, fontSize: 12, color: t.textTertiary, textAlign: "center" }}>
            {query.trim() ? ("No courts match \"" + query.trim() + "\".") : "All courts selected."}
          </div>
        )}
        {grouped.map(function (g, gi) {
          return (
            <div key={g.zone.id} style={{ borderTop: gi === 0 ? "none" : "1px solid " + t.border }}>
              <div style={{
                padding: "7px 10px", fontSize: 10, fontWeight: 700, color: t.textTertiary,
                textTransform: "uppercase", letterSpacing: "0.06em",
                background: t.bgTertiary,
              }}>
                {g.zone.num} · {g.zone.name}
              </div>
              {g.courts.map(function (c) {
                return (
                  <button key={c.name}
                    onClick={function () { addCourt(c.name); }}
                    disabled={atCap}
                    style={{
                      display: "flex", width: "100%", padding: "8px 10px",
                      border: "none", background: "transparent",
                      cursor: atCap ? "not-allowed" : "pointer",
                      opacity: atCap ? 0.5 : 1,
                      textAlign: "left", gap: 8, alignItems: "center",
                      borderTop: "1px solid " + t.border,
                    }}
                    onMouseEnter={function (e) { if (!atCap) e.currentTarget.style.background = t.accentSubtle; }}
                    onMouseLeave={function (e) { e.currentTarget.style.background = "transparent"; }}>
                    <span style={{ fontSize: 13, color: t.text, fontWeight: 500, flex: 1 }}>
                      {c.name}
                    </span>
                    <span style={{ fontSize: 11, color: t.textTertiary }}>{c.suburb}</span>
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
