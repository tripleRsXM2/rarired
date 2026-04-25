// src/features/rating/components/RatingInfoModal.jsx
//
// Full explanation of CourtSync Rating. Editorial vocabulary
// (matches the rest of the redesign): ALL-CAPS section eyebrows
// numbered 01–10, display-type headings, hairlines instead of
// cards.
//
// Mobile-first — bottom-sheet style on small screens, centred
// modal on desktop. Long content scrolls inside the sheet so the
// close affordance + the document body stay anchored.

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { RATING_INFO_SECTIONS, MODAL_TITLE } from "../copy.js";

export default function RatingInfoModal({ t, onClose }) {
  // Close on Esc — keyboard accessibility. Also close on backdrop tap
  // (the outer onClick).
  useEffect(function () {
    function onKey(e) { if (e.key === "Escape") onClose(); }
    window.addEventListener("keydown", onKey);
    return function () { window.removeEventListener("keydown", onKey); };
  }, [onClose]);

  return createPortal((
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 320,
        background: "rgba(0,0,0,0.45)",
        backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)",
        display: "flex",
        alignItems: "center", justifyContent: "center",
        padding: "0 16px calc(16px + env(safe-area-inset-bottom, 0px))",
      }}>
      <div
        onClick={function (e) { e.stopPropagation(); }}
        className="pop"
        role="dialog"
        aria-modal="true"
        aria-labelledby="cs-rating-info-title"
        style={{
          background: t.modalBg,
          border: "1px solid " + t.border,
          borderRadius: 14,
          width: "100%",
          maxWidth: 520,
          maxHeight: "92dvh",
          overflowY: "auto",
          boxShadow: "0 20px 60px rgba(0,0,0,0.35)",
        }}>
        <div style={{ padding: "26px 22px 28px" }}>

          {/* Header */}
          <div style={{
            display: "flex", justifyContent: "space-between", alignItems: "flex-start",
            marginBottom: 18,
            paddingBottom: 18,
            borderBottom: "1px solid " + t.border,
          }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                fontSize: 9, fontWeight: 800, letterSpacing: "0.16em",
                textTransform: "uppercase", color: t.textTertiary,
                marginBottom: 6,
              }}>
                CourtSync Rating
              </div>
              <h2
                id="cs-rating-info-title"
                style={{
                  fontSize: 22, fontWeight: 800, color: t.text,
                  margin: 0, letterSpacing: "-0.6px", lineHeight: 1.05,
                }}>
                {MODAL_TITLE}
              </h2>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              style={{
                background: "none", border: "none",
                color: t.textTertiary, fontSize: 22,
                padding: "0 0 0 12px",
                cursor: "pointer", lineHeight: 1,
                fontWeight: 300, flexShrink: 0,
              }}
              onMouseEnter={function (e) { e.currentTarget.style.color = t.text; }}
              onMouseLeave={function (e) { e.currentTarget.style.color = t.textTertiary; }}
            >×</button>
          </div>

          {/* Sections */}
          {RATING_INFO_SECTIONS.map(function (s, i) {
            return (
              <section key={s.id} style={{
                paddingTop: i === 0 ? 0 : 18,
                paddingBottom: 18,
                borderBottom: i === RATING_INFO_SECTIONS.length - 1
                  ? "none"
                  : "1px solid " + t.border,
              }}>
                <div style={{
                  display: "flex", alignItems: "baseline", gap: 10,
                  marginBottom: 8,
                }}>
                  <span style={{
                    fontSize: 11, fontWeight: 800, letterSpacing: "0.16em",
                    color: t.textTertiary, fontVariantNumeric: "tabular-nums",
                    flexShrink: 0,
                  }}>
                    {s.eyebrow}
                  </span>
                  <h3 style={{
                    fontSize: 16, fontWeight: 800, color: t.text,
                    margin: 0, letterSpacing: "-0.3px", lineHeight: 1.2,
                  }}>
                    {s.title}
                  </h3>
                </div>
                {s.body.map(function (chunk, ci) {
                  if (Array.isArray(chunk)) {
                    return (
                      <ul key={ci} style={{
                        margin: "8px 0 0",
                        paddingLeft: 0,
                        listStyle: "none",
                        display: "flex", flexDirection: "column", gap: 4,
                      }}>
                        {chunk.map(function (item, ii) {
                          return (
                            <li key={ii} style={{
                              display: "flex", alignItems: "baseline", gap: 8,
                              fontSize: 13, color: t.textSecondary,
                              lineHeight: 1.5, letterSpacing: "-0.1px",
                            }}>
                              <span style={{
                                color: t.textTertiary,
                                flexShrink: 0,
                                fontSize: 11,
                              }}>·</span>
                              <span>{item}</span>
                            </li>
                          );
                        })}
                      </ul>
                    );
                  }
                  return (
                    <p key={ci} style={{
                      fontSize: 13, color: t.textSecondary,
                      lineHeight: 1.55, letterSpacing: "-0.1px",
                      margin: ci === 0 ? "0" : "8px 0 0",
                    }}>
                      {chunk}
                    </p>
                  );
                })}
              </section>
            );
          })}

          {/* Close button at bottom for thumb-reach on mobile */}
          <button
            type="button"
            onClick={onClose}
            style={{
              marginTop: 22,
              width: "100%", padding: "14px",
              borderRadius: 10, border: "1px solid " + t.border,
              background: "transparent",
              color: t.text,
              fontSize: 11, fontWeight: 800,
              letterSpacing: "0.12em", textTransform: "uppercase",
              cursor: "pointer",
            }}>
            Got it
          </button>
        </div>
      </div>
    </div>
  ), document.body);
}
