// VersionSwitch.jsx — V1/V2 toggle for the v2 BaselineApp shell.
// Sits top-left where the old "Back to picker" button was. V2 is the
// active half; tapping V1 calls onSwitchToV1 (App.jsx routes back to
// the V1 shell). Theme-token styled so it reads in both Classic and
// Modern looks.

import React from "react";

export default function VersionSwitch({ theme, onSwitchToV1 }) {
  var mono = "JetBrains Mono, ui-monospace, monospace";
  return (
    <div style={{
      display:      "inline-flex",
      border:       "1px solid " + theme.line,
      borderRadius: 999,
      overflow:     "hidden",
      flexShrink:   0,
    }}>
      <button
        type="button"
        onClick={onSwitchToV1}
        style={{
          appearance:    "none",
          border:        0,
          background:    "transparent",
          color:         theme.inkSoft,
          fontFamily:    mono,
          fontSize:      10,
          fontWeight:    700,
          letterSpacing: "0.08em",
          padding:       "5px 10px",
          cursor:        "pointer",
        }}>V1</button>
      <span style={{
        background:    theme.ink,
        color:         theme.bg,
        fontFamily:    mono,
        fontSize:      10,
        fontWeight:    700,
        letterSpacing: "0.08em",
        padding:       "5px 10px",
      }}>V2</span>
    </div>
  );
}
