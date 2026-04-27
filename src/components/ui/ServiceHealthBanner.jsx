// src/components/ui/ServiceHealthBanner.jsx
//
// Top-of-viewport banner that surfaces Supabase API health. Renders
// nothing while healthy; slides in on 'degraded' (yellow, quiet)
// and on 'down' (red, urgent). User-feedback driven: during the
// 2026-04-27 PostgREST PGRST002 outage there was zero visible
// signal — every action just silently did nothing or fired a
// generic 'try again' toast. This banner closes that gap.
//
// Subscribes to lib/healthMonitor — purely passive. Doesn't
// throttle or block requests; the banner is the user's signal.

import { useEffect, useState } from "react";
import { subscribe } from "../../lib/healthMonitor.js";

export default function ServiceHealthBanner(){
  var [status, setStatus] = useState({ state: "healthy", lastError: null });
  // Animated 'reconnecting...' dot count for the down state — small
  // visual confirmation that the app is still alive even if no
  // requests are returning.
  var [dots, setDots] = useState(0);

  useEffect(function(){
    return subscribe(setStatus);
  }, []);

  useEffect(function(){
    if(status.state !== "down") return;
    var t = setInterval(function(){
      setDots(function(d){ return (d + 1) % 4; });
    }, 600);
    return function(){ clearInterval(t); };
  }, [status.state]);

  if(status.state === "healthy") return null;

  var isDown    = status.state === "down";
  var bg        = isDown ? "rgba(220, 38, 38, 0.96)"  : "rgba(245, 158, 11, 0.96)";
  var label     = isDown ? "Service unavailable"     : "Connection trouble";
  var detail    = isDown
    ? "We can't reach the server. Reconnecting" + ".".repeat(dots) + " ".repeat(3 - dots)
    : "Some requests are failing. Hold tight.";

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: "fixed",
        top: 0, left: 0, right: 0,
        zIndex: 9000,
        background: bg,
        color: "#fff",
        padding: "calc(env(safe-area-inset-top, 0px) + 8px) 16px 8px",
        fontFamily: "ui-sans-serif, -apple-system, BlinkMacSystemFont, 'SF Pro Display', system-ui, sans-serif",
        fontSize: 12,
        fontWeight: 700,
        letterSpacing: "0.04em",
        display: "flex",
        alignItems: "center",
        gap: 12,
        boxShadow: "0 2px 12px rgba(0,0,0,0.18)",
      }}>
      {/* Pulsing dot */}
      <span style={{
        width: 8, height: 8, borderRadius: "50%",
        background: "rgba(255,255,255,0.92)",
        boxShadow: "0 0 0 4px rgba(255,255,255,0.18)",
        flexShrink: 0,
        animation: "cs-health-pulse 1.2s ease-in-out infinite",
      }}/>
      <span style={{flex: 1, textTransform: "uppercase", letterSpacing: "0.10em"}}>{label}</span>
      <span style={{
        fontSize: 11, fontWeight: 600,
        letterSpacing: "0",
        textTransform: "none",
        opacity: 0.92,
        fontVariantNumeric: "tabular-nums",
        flexShrink: 0,
        // Reserve space for the worst-case dots so the layout doesn't shift.
        minWidth: 200, textAlign: "right",
      }}>{detail}</span>
      {isDown && (
        <button
          type="button"
          onClick={function(){ if(typeof window !== "undefined") window.location.reload(); }}
          style={{
            background: "rgba(255,255,255,0.18)",
            border: "1px solid rgba(255,255,255,0.32)",
            color: "#fff",
            padding: "5px 11px",
            borderRadius: 999,
            fontSize: 11, fontWeight: 800,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            cursor: "pointer",
            flexShrink: 0,
          }}>
          Refresh
        </button>
      )}
    </div>
  );
}
