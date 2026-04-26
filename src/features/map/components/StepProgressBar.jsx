// src/features/map/components/StepProgressBar.jsx
//
// Segmented step indicator for the Play Match flow. Lives at the
// very top of the map during play mode (zone → court → players →
// when). Each of the four steps is a thin pill; finished + active
// fill, future steps are hairline.
//
// iOS-Stories-style row — small, deliberately quiet, theme-aware
// halo so it reads on both light and dark basemaps without a
// background card. Pointer-events disabled so it doesn't intercept
// taps on the map underneath.
//
// `step` is 0-indexed: 0 = zone, 1 = court, 2 = players, 3 = when.

import React from "react";

export default function StepProgressBar({ step, total, mapDark, isMobile }){
  var n = total || 4;
  var active = Math.max(0, Math.min(n - 1, step | 0));
  // Visual: filled segments for steps already reached (≤ active),
  // hairline for the rest. Active segment gets a brighter colour to
  // distinguish "currently here" from "already past."
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
        position:"absolute",
        top: "calc(env(safe-area-inset-top, 0px) + " + (isMobile ? 10 : 14) + "px)",
        left: isMobile ? 14 : 22,
        right: isMobile ? 14 : 22,
        zIndex: 555,
        display:"flex", alignItems:"center", gap: 6,
        pointerEvents:"none",
      }}>
      {Array.from({length:n}).map(function(_, i){
        var bg;
        if(i < active)       bg = filledPast;
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
