// src/components/ui/AvailabilityChips.jsx
//
// Compact availability picker used by OnboardingModal + SettingsScreen.
// Presets the common patterns (weekday mornings, weekend anytime, etc.)
// so new users can set a sensible availability in one or two taps; power
// users expand a 7 × 4 grid for full control.
//
// State shape is { [DAY]: TIME_BLOCK[] } — same jsonb the DB already
// expects on profiles.availability, so no schema changes and
// SettingsScreen's old grid view keeps working off the same value.
//
// Preset taps TOGGLE their cells — tapping "Weekday evenings" twice
// clears those cells. Taps never stomp unrelated cells, so mixing
// "Weekday evenings" + "Weekend mornings" does what you'd expect.

import { useMemo, useState } from "react";
import { DAYS_SHORT, TIME_BLOCKS } from "../../lib/constants/domain.js";

// Each preset defines which (day, block) cells it owns. Matches how
// Sydney club players actually think about their week — not "Monday
// morning" in isolation, but "weekday mornings" or "weekend play".
var PRESETS = [
  { id: "weekday-am",   label: "Weekday mornings",   days: ["Mon","Tue","Wed","Thu","Fri"], blocks: ["Morning"] },
  { id: "weekday-pm",   label: "Weekday evenings",   days: ["Mon","Tue","Wed","Thu","Fri"], blocks: ["Evening","Late"] },
  { id: "weekend-am",   label: "Weekend mornings",   days: ["Sat","Sun"], blocks: ["Morning"] },
  { id: "weekend-pm",   label: "Weekend afternoons", days: ["Sat","Sun"], blocks: ["Afternoon"] },
  { id: "weekend-any",  label: "Weekend anytime",    days: ["Sat","Sun"], blocks: TIME_BLOCKS },
  { id: "flexible",     label: "Flexible",           days: DAYS_SHORT,     blocks: TIME_BLOCKS },
];

// Does the current availability object fully contain every (day, block)
// pair this preset lights up? Used to render a preset as ON when all
// its cells are already set, even if they were set via the grid.
function presetIsOn(value, preset) {
  for (var i = 0; i < preset.days.length; i++) {
    var d = preset.days[i];
    var slots = (value && value[d]) || [];
    for (var j = 0; j < preset.blocks.length; j++) {
      if (slots.indexOf(preset.blocks[j]) < 0) return false;
    }
  }
  return true;
}

export default function AvailabilityChips({ t, value, onChange, initiallyExpanded }) {
  var v = value || {};
  var [expanded, setExpanded] = useState(!!initiallyExpanded);

  var activePresets = useMemo(function () {
    var s = {};
    PRESETS.forEach(function (p) { s[p.id] = presetIsOn(v, p); });
    return s;
  }, [value]);

  function togglePreset(preset) {
    var alreadyOn = activePresets[preset.id];
    var next = Object.assign({}, v);
    preset.days.forEach(function (d) {
      var slots = (next[d] || []).slice();
      preset.blocks.forEach(function (b) {
        var idx = slots.indexOf(b);
        if (alreadyOn && idx >= 0) slots.splice(idx, 1);
        else if (!alreadyOn && idx < 0) slots.push(b);
      });
      if (slots.length) next[d] = slots;
      else delete next[d];
    });
    onChange(next);
  }

  function toggleCell(day, block) {
    var next = Object.assign({}, v);
    var slots = (next[day] || []).slice();
    var i = slots.indexOf(block);
    if (i >= 0) slots.splice(i, 1); else slots.push(block);
    if (slots.length) next[day] = slots;
    else delete next[day];
    onChange(next);
  }

  var anySet = Object.keys(v).some(function (d) { return (v[d] || []).length > 0; });

  return (
    <div>
      {/* Preset cloud */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
        {PRESETS.map(function (p) {
          var on = activePresets[p.id];
          return (
            <button key={p.id}
              onClick={function () { togglePreset(p); }}
              style={{
                padding: "7px 12px", borderRadius: 20,
                border: "1px solid " + (on ? t.accent : t.border),
                background: on ? t.accentSubtle : "transparent",
                color: on ? t.accent : t.textSecondary,
                fontSize: 12, fontWeight: on ? 700 : 500, cursor: "pointer",
                transition: "background 0.12s, border-color 0.12s",
              }}>
              {p.label}
            </button>
          );
        })}
      </div>

      {/* Summary + expand toggle */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: expanded ? 10 : 0 }}>
        <span style={{ fontSize: 11, color: t.textTertiary }}>
          {anySet ? "Tap presets to toggle, or fine-tune below" : "Pick one or more presets to get started"}
        </span>
        <button onClick={function () { setExpanded(!expanded); }}
          style={{ background: "transparent", border: "none", color: t.accent, fontSize: 11, fontWeight: 600, cursor: "pointer", padding: 0 }}>
          {expanded ? "Hide grid ▲" : "Fine-tune ▼"}
        </button>
      </div>

      {/* 7 × 4 grid for power users */}
      {expanded && (
        <div style={{ border: "1px solid " + t.border, borderRadius: 8, overflow: "hidden" }}>
          <div style={{ display: "grid", gridTemplateColumns: "60px repeat(" + TIME_BLOCKS.length + ", 1fr)", background: t.bgTertiary, fontSize: 10, fontWeight: 700, color: t.textTertiary, textTransform: "uppercase", letterSpacing: "0.05em" }}>
            <div style={{ padding: "6px 8px" }}></div>
            {TIME_BLOCKS.map(function (b) {
              return <div key={b} style={{ padding: "6px 4px", textAlign: "center", borderLeft: "1px solid " + t.border }}>{b}</div>;
            })}
          </div>
          {DAYS_SHORT.map(function (d, di) {
            return (
              <div key={d} style={{
                display: "grid", gridTemplateColumns: "60px repeat(" + TIME_BLOCKS.length + ", 1fr)",
                borderTop: di === 0 ? "none" : "1px solid " + t.border,
              }}>
                <div style={{ padding: "10px 8px", fontSize: 12, color: t.textSecondary, fontWeight: 600 }}>{d}</div>
                {TIME_BLOCKS.map(function (b) {
                  var on = ((v[d] || []).indexOf(b)) >= 0;
                  return (
                    <button key={b}
                      onClick={function () { toggleCell(d, b); }}
                      style={{
                        borderLeft: "1px solid " + t.border,
                        background: on ? t.accentSubtle : "transparent",
                        color: on ? t.accent : t.textTertiary,
                        border: "none", borderLeftWidth: 1, borderLeftStyle: "solid", borderLeftColor: t.border,
                        cursor: "pointer",
                        padding: "8px 4px",
                        fontSize: 14, fontWeight: 600,
                      }}>
                      {on ? "✓" : "·"}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
