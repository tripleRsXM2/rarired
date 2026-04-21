// src/components/ui/Toast.jsx
//
// Module 6 — non-blocking toast system. Replaces window.alert() across the
// app for error and success messages. Single global mount in App.jsx, with a
// `useToasts()` hook that returns an emit() function. Toasts auto-dismiss
// after 4s (errors) or 2.5s (success); user can dismiss by tapping the chip.
//
// Intentionally tiny — no animation library, no portal, no priority queue.
// Stacks bottom-right on desktop, bottom-centred on mobile via inline media
// hint. If we ever need richer behaviour (action buttons, undo), grow it then.

import { useState, useCallback, useRef, useEffect } from "react";

var nextId = 1;

export function useToasts() {
  var [toasts, setToasts] = useState([]); // [{id, message, kind, timeoutMs}]
  var timersRef = useRef({});

  var dismiss = useCallback(function (id) {
    setToasts(function (xs) { return xs.filter(function (x) { return x.id !== id; }); });
    if (timersRef.current[id]) {
      clearTimeout(timersRef.current[id]);
      delete timersRef.current[id];
    }
  }, []);

  var emit = useCallback(function (message, kind) {
    if (!message) return;
    var id = nextId++;
    var k = kind || "info";
    var ttl = k === "error" ? 4000 : 2500;
    setToasts(function (xs) { return xs.concat([{ id: id, message: message, kind: k }]); });
    timersRef.current[id] = setTimeout(function () { dismiss(id); }, ttl);
    return id;
  }, [dismiss]);

  // Cleanup any pending timers on unmount
  useEffect(function () {
    return function () {
      Object.values(timersRef.current).forEach(function (t) { clearTimeout(t); });
      timersRef.current = {};
    };
  }, []);

  return { toasts: toasts, emit: emit, dismiss: dismiss };
}

// Renderer — stack of toast chips. Pass `toasts` and `dismiss` from the hook.
export function ToastStack({ t, toasts, dismiss }) {
  if (!toasts || !toasts.length) return null;
  return (
    <div
      style={{
        position: "fixed", zIndex: 300,
        bottom: 16, right: 16, left: 16,
        display: "flex", flexDirection: "column", alignItems: "flex-end",
        gap: 8, pointerEvents: "none",
      }}
    >
      {toasts.map(function (toast) {
        var color = toast.kind === "error" ? t.red
                  : toast.kind === "success" ? t.green
                  : t.text;
        var bg    = toast.kind === "error" ? t.redSubtle
                  : toast.kind === "success" ? t.greenSubtle
                  : t.bgCard;
        return (
          <div
            key={toast.id}
            onClick={function () { dismiss(toast.id); }}
            className="fade-up"
            style={{
              background: bg, color: color,
              border: "1px solid " + color + "44",
              padding: "10px 14px", borderRadius: 10,
              fontSize: 13, fontWeight: 500, lineHeight: 1.35,
              boxShadow: "0 4px 16px rgba(0,0,0,0.12)",
              maxWidth: 360,
              cursor: "pointer", pointerEvents: "auto",
            }}
          >
            {toast.message}
          </div>
        );
      })}
    </div>
  );
}
