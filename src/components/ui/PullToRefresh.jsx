// src/components/ui/PullToRefresh.jsx
//
// Generic pull-to-refresh scroll container. Renders an overflow-y:auto
// region; dragging down from the very top reveals a spinner and,
// released past the threshold, runs onRefresh() — which may return a
// promise. The spinner holds for at least MIN_SPIN_MS so a fast (or
// synchronous) reload still reads as a deliberate refresh.
//
// Theme-agnostic on purpose so it can be shared by v1 (Editorial) and
// v2 (Baseline) — pass `tint` for the spinner colour and `style` for
// the container box. Lives in components/ui so v2 may import it
// without crossing the v1 isolation boundary.

import { useRef, useState } from "react";

var THRESHOLD   = 70;    // px of pull needed to trigger a refresh
var MAX_PULL    = 110;   // cap on how far the indicator travels
var MIN_SPIN_MS = 600;   // minimum spinner time once triggered

export default function PullToRefresh({ onRefresh, tint, style, className, children }) {
  var scrollRef = useRef(null);
  var gesture   = useRef({ startY: 0, active: false, dragging: false });
  var [pull, setPull] = useState(0);
  var [refreshing, setRefreshing] = useState(false);

  function onStart(e) {
    if (refreshing) return;
    var el = scrollRef.current;
    if (!el || el.scrollTop > 0) return;          // only from the very top
    gesture.current.startY = e.touches[0].clientY;
    gesture.current.active = true;
  }

  function onMove(e) {
    var g = gesture.current;
    if (!g.active || refreshing) return;
    var el = scrollRef.current;
    if (el && el.scrollTop > 0) { g.active = false; g.dragging = false; setPull(0); return; }
    var dy = e.touches[0].clientY - g.startY;
    if (dy <= 0) { g.dragging = false; setPull(0); return; }
    g.dragging = true;
    setPull(Math.min(MAX_PULL, dy * 0.5));        // rubber-band resistance
  }

  function onEnd() {
    var g = gesture.current;
    if (!g.active) return;
    g.active = false;
    g.dragging = false;
    setPull(function (cur) {
      if (cur >= THRESHOLD && !refreshing) {
        setRefreshing(true);
        var started = Date.now();
        Promise.resolve(onRefresh && onRefresh())
          .catch(function () {})
          .then(function () {
            var wait = Math.max(0, MIN_SPIN_MS - (Date.now() - started));
            setTimeout(function () { setRefreshing(false); setPull(0); }, wait);
          });
        return THRESHOLD;                          // park the spinner
      }
      return 0;                                    // snap back
    });
  }

  var indicatorH = refreshing ? THRESHOLD : pull;
  var progress   = Math.min(1, pull / THRESHOLD);
  var spinTint   = tint || "rgba(0,0,0,0.45)";

  return (
    <div
      ref={scrollRef}
      className={className}
      onTouchStart={onStart}
      onTouchMove={onMove}
      onTouchEnd={onEnd}
      onTouchCancel={onEnd}
      style={Object.assign({
        overflowY: "auto",
        WebkitOverflowScrolling: "touch",
        overscrollBehaviorY: "contain",
      }, style)}
    >
      <style>{"@keyframes cs-ptr-spin{to{transform:rotate(360deg)}}"}</style>
      {/* Pull indicator — a height-animating band at the top. */}
      <div style={{
        height: indicatorH,
        display: "flex", alignItems: "center", justifyContent: "center",
        overflow: "hidden",
        transition: gesture.current.dragging ? "none" : "height 240ms cubic-bezier(0.22,1,0.36,1)",
      }}>
        <svg width="20" height="20" viewBox="0 0 24 24"
          style={{
            opacity: refreshing ? 1 : progress,
            transformOrigin: "50% 50%",
            transform: refreshing ? "none" : "rotate(" + (progress * 270) + "deg)",
            animation: refreshing ? "cs-ptr-spin 0.7s linear infinite" : "none",
          }}>
          <circle cx="12" cy="12" r="9" fill="none"
            stroke={spinTint} strokeWidth="2.4" strokeLinecap="round"
            strokeDasharray="56.5"
            strokeDashoffset={refreshing ? 38 : 56.5 * (1 - progress)} />
        </svg>
      </div>
      {children}
    </div>
  );
}
