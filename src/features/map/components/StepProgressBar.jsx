// src/features/map/components/StepProgressBar.jsx
//
// Segmented step indicator for the Play Match flow. Renders inline
// — designed to sit DIRECTLY ABOVE the step title (e.g. "Choose
// court") so the user reads the dots-and-title as a unit. Earlier
// version pinned this to the top of the screen; user feedback was
// that it floated too far away from the action.
//
// Pure typography styling — small filled / hairline pills, theme-
// aware halo, no card chrome. Pointer-events:none so it never
// intercepts taps.
//
// `step` is 0-indexed: 0 = zone, 1 = court, 2 = players, 3 = when.
// `width` lets the caller cap the bar's width when embedded into
// a centered prompt block (otherwise it stretches edge-to-edge).

import React from "react";

export default function StepProgressBar({ step, total, mapDark, isMobile, width }){
  var n = total || 4;
  var active = Math.max(0, Math.min(n - 1, step | 0));
  var filledOn   = mapDark ? "rgba(255,255,255,0.95)" : "rgba(20,18,17,0.90)";
  var filledPast = mapDark ? "rgba(255,255,255,0.55)" : "rgba(20,18,17,0.55)";
  var rail       = mapDark ? "rgba(255,255,255,0.18)" : "rgba(20,18,17,0.15)";
  var halo = mapDark
    ? "0 1px 4px rgba(0,0,0,0.55)"
    : "0 1px 4px rgba(255,255,255,0.55)";
  return (
    <div
      role="progressbar"
      aria-valuenow={active + 1}
      aria-valuemin={1}
      aria-valuemax={n}
      style={{
        display:"flex",
        alignItems:"center",
        gap: isMobile ? 4 : 6,
        // Cap the bar at a sensible width so on a wide desktop it
        // doesn't span the entire viewport. The caller usually wants
        // it to match the title's width feel, ~200-300px.
        width: width || (isMobile ? 140 : 200),
        margin: "0 auto",
        marginBottom: isMobile ? 10 : 14,
        pointerEvents:"none",
      }}>
      {Array.from({length:n}).map(function(_, i){
        var bg;
        if(i < active)        bg = filledPast;
        else if(i === active) bg = filledOn;
        else                  bg = rail;
        return (
          <div key={i} style={{
            flex: 1,
            height: 3,
            borderRadius: 2,
            background: bg,
            boxShadow: i <= active ? halo : "none",
            transition: "background 0.18s ease",
          }}/>
        );
      })}
    </div>
  );
}
