// src/features/tournaments/components/hub/ActiveNowBand.jsx
//
// Module 13 (Compete hub design pass v3) — Active now is a single
// full-bleed dark carousel band that scrolls horizontally between
// every active competition (league invites, incoming challenges,
// active leagues, accepted challenges, active tournaments).
//
// Replaces the previous (CompeteFeaturedBand + ActiveNowSection)
// pair. One surface, priority-sorted, edge-to-edge across both
// mobile and desktop.
//
// Carousel mechanics:
//   - Native CSS scroll-snap (overflow-x: auto + scroll-snap-type:
//     x mandatory). Touch swipe works for free on mobile.
//   - Arrow buttons (←/→) + "N of M" indicator for desktop +
//     non-touch users. Arrows / indicator hidden when there's only
//     one slide.
//   - Slides are full-width within the band. Each slide takes
//     scroll-snap-align: start so the carousel always lands on a
//     slide boundary.
//
// Full-bleed escape:
//   The band sits in the hub's outer (unconstrained) wrapper, NOT
//   inside the centered max-width 720 inner container. This means
//   `width: 100%` lets it stretch to the full viewport on every
//   screen size — same pattern HomeTab uses for HomeLeagueBand.

import { useEffect, useRef, useState } from "react";

// INK constants — hardcoded, not theme tokens. Keeps the editorial
// moment consistent across every theme; matches HomeLeagueBand.
var INK          = "#0A0A0A";
var INK_TEXT     = "#FFFFFF";
var INK_TEXT_DIM = "rgba(255,255,255,0.55)";
var INK_BORDER   = "rgba(255,255,255,0.18)";
var INK_WIN      = "#7CD14E";
var INK_LOSS     = "#FF6B6B";

export default function ActiveNowBand({ slides }) {
  // Empty state lives in CompeteHub — when no slides, this band
  // doesn't render at all and the page falls through to a calmer
  // empty surface above the Explore section.
  if (!slides || slides.length === 0) return null;

  var scrollerRef = useRef(null);
  var [activeIdx, setActiveIdx] = useState(0);

  // Track which slide is currently snapped via IntersectionObserver
  // — the browser rules the scroll position, we just observe which
  // slide is most-visible. More reliable than scroll-event math
  // (handles momentum, snap-back, programmatic scrolls equally).
  useEffect(function () {
    var scroller = scrollerRef.current;
    if (!scroller) return undefined;
    var ratios = new Array(slides.length).fill(0);
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        var idx = parseInt(e.target.getAttribute("data-slide-idx"), 10);
        if (isNaN(idx)) return;
        ratios[idx] = e.intersectionRatio;
      });
      // Pick the slide with the highest visible ratio.
      var best = 0;
      var bestR = -1;
      for (var i = 0; i < ratios.length; i++) {
        if (ratios[i] > bestR) { bestR = ratios[i]; best = i; }
      }
      setActiveIdx(best);
    }, { root: scroller, threshold: [0, 0.25, 0.5, 0.75, 1] });
    Array.from(scroller.children).forEach(function (child) { io.observe(child); });
    return function () { io.disconnect(); };
  }, [slides.length]);

  function scrollTo(idx) {
    var scroller = scrollerRef.current;
    if (!scroller) return;
    var clamped = Math.max(0, Math.min(slides.length - 1, idx));
    var target  = scroller.children[clamped];
    if (target) {
      // scrollTo with smooth behaviour respects scroll-snap; the
      // snap engine settles us on the nearest slide afterwards.
      scroller.scrollTo({ left: target.offsetLeft, behavior: "smooth" });
    }
  }

  var hasMany = slides.length > 1;

  return (
    <div style={{
      // Full-bleed surface. Outer wrapper in CompeteHub does NOT
      // constrain width, so this stretches to the viewport edges.
      background: INK,
      color:      INK_TEXT,
      width:      "100%",
      // Vertical breathing — same as HomeLeagueBand.
      paddingTop:    "clamp(28px, 4vw, 48px)",
      paddingBottom: "clamp(28px, 4vw, 48px)",
      marginBottom:  "clamp(20px, 3vw, 32px)",
    }}>
      {/* Inner content rail — same 720 max-width as the hub's
          centered sections, so titles/captions line up vertically
          with everything else on the page. */}
      <div style={{
        maxWidth: 720,
        margin:   "0 auto",
        padding:  "0 clamp(20px, 4vw, 32px)",
      }}>
        {/* Eyebrow + indicator + arrows — single header row. */}
        <div style={{
          display:      "flex",
          alignItems:   "center",
          justifyContent: "space-between",
          gap:          12,
          marginBottom: 18,
        }}>
          <div style={{
            fontSize:       10,
            fontWeight:     800,
            color:          INK_TEXT_DIM,
            letterSpacing:  "0.16em",
            textTransform:  "uppercase",
          }}>
            Active now
            {hasMany && (
              <span style={{ marginLeft: 8, opacity: 0.85 }}>
                · {(activeIdx + 1) + " of " + slides.length}
              </span>
            )}
          </div>
          {hasMany && (
            <div style={{ display: "flex", gap: 6 }}>
              <NavArrowBtn dir="left"  enabled={activeIdx > 0}                      onClick={function () { scrollTo(activeIdx - 1); }} />
              <NavArrowBtn dir="right" enabled={activeIdx < slides.length - 1}      onClick={function () { scrollTo(activeIdx + 1); }} />
            </div>
          )}
        </div>

        {/* Scroller. */}
        <div
          ref={scrollerRef}
          style={{
            display:           "flex",
            overflowX:         "auto",
            scrollSnapType:    "x mandatory",
            // Hide native scrollbar — modern browsers via the
            // ::-webkit-scrollbar pseudo + scrollbarWidth.
            scrollbarWidth:    "none",
            // Negative side-margins + matching padding so each slide
            // can reach the band's inner edges without the scrollbar
            // gutter eating into the visible area.
            margin:            "0 -2px",
            padding:           "0 2px",
            // Native momentum scrolling on iOS.
            WebkitOverflowScrolling: "touch",
          }}>
          {slides.map(function (s, idx) {
            return (
              <div
                key={s.id}
                data-slide-idx={idx}
                style={{
                  flex:             "0 0 100%",
                  scrollSnapAlign:  "start",
                  // Tiny horizontal pad so adjacent slides peek slightly
                  // — telegraphs that the surface scrolls. Hidden when
                  // there's only one slide.
                  paddingRight:     hasMany ? 12 : 0,
                  boxSizing:        "border-box",
                }}>
                <Slide slide={s} />
              </div>
            );
          })}
        </div>
      </div>

      {/* Hide WebKit scrollbar via inlined CSS — keeps the carousel
          chrome clean on Chrome/Safari without affecting touch UX. */}
      <style>
        {".cs-active-band-scroller::-webkit-scrollbar{display:none}"}
      </style>
    </div>
  );
}

// ── Slide ────────────────────────────────────────────────────────
function Slide({ slide }) {
  return (
    <div style={{ minWidth: 0 }}>
      {/* Eyebrow */}
      {slide.eyebrow && (
        <div style={{
          fontSize:       10,
          fontWeight:     800,
          color:          INK_TEXT_DIM,
          letterSpacing:  "0.16em",
          textTransform:  "uppercase",
          marginBottom:   12,
        }}>
          {slide.eyebrow}
        </div>
      )}

      {/* Headline */}
      <div style={{
        fontSize:      "clamp(24px, 3.6vw, 32px)",
        fontWeight:    700,
        color:         INK_TEXT,
        letterSpacing: "-0.02em",
        lineHeight:    1.1,
        marginBottom:  slide.bigStat ? 24 : 14,
        overflowWrap:  "anywhere",
      }}>
        {slide.headline}
      </div>

      {/* Optional rank/big stat + caption row */}
      {(slide.bigStat || slide.caption || slide.metaLine) && (
        <div style={{
          display:    "flex",
          alignItems: "flex-end",
          gap:        "clamp(20px, 4vw, 40px)",
          flexWrap:   "wrap",
        }}>
          {slide.bigStat && (
            <div style={{ minWidth: 0 }}>
              <div style={{
                fontSize:           "clamp(56px, 9vw, 80px)",
                fontWeight:         800,
                color:              INK_TEXT,
                letterSpacing:      "-0.04em",
                lineHeight:         0.95,
                fontVariantNumeric: "tabular-nums",
              }}>
                {slide.bigStat.value}
              </div>
              {slide.bigStat.label && (
                <div style={{
                  marginTop:     10,
                  fontSize:      10,
                  fontWeight:    700,
                  color:         INK_TEXT_DIM,
                  letterSpacing: "0.12em",
                  textTransform: "uppercase",
                }}>
                  {slide.bigStat.label}
                </div>
              )}
            </div>
          )}

          <div style={{
            minWidth:      0,
            paddingBottom: 4,
            display:       "flex",
            flexDirection: "column",
            gap:           8,
          }}>
            {slide.caption && (
              <div style={{
                fontSize:      14,
                fontWeight:    600,
                color:         INK_TEXT,
                letterSpacing: "0.04em",
              }}>
                {slide.caption}
              </div>
            )}
            {slide.metaLine && (
              <div style={{
                fontSize:      12,
                fontWeight:    500,
                color:         INK_TEXT_DIM,
                letterSpacing: "0.02em",
              }}>
                {renderMetaLine(slide.metaLine, slide.metaTone)}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Action row */}
      {(slide.primary || slide.secondary) && (
        <div style={{
          marginTop: 28,
          display:   "flex",
          gap:       10,
          flexWrap:  "wrap",
          alignItems: "center",
        }}>
          {slide.primary && <ActionBtn action={slide.primary} variant="primary" />}
          {slide.secondary && <ActionBtn action={slide.secondary} variant="secondary" />}
        </div>
      )}
    </div>
  );
}

// Render the meta line with the tone-coloured fragment ("Won" or
// "Lost") inline — tiny custom parser since we only need the one
// pattern. Falls back to plain text when no tone is set.
function renderMetaLine(line, tone) {
  if (!tone) return line;
  // The slide normalizers always put the win/loss word at the
  // single position "{prefix}: Won/Lost ..." — we just colour the
  // word that matches the tone.
  var word = tone === "win" ? "Won" : "Lost";
  var idx  = line.indexOf(word);
  if (idx < 0) return line;
  var color = tone === "win" ? INK_WIN : INK_LOSS;
  var before = line.slice(0, idx);
  var after  = line.slice(idx + word.length);
  return (
    <span>
      {before}
      <span style={{ color: color, fontWeight: 700 }}>{word}</span>
      {after}
    </span>
  );
}

// ── ActionBtn ────────────────────────────────────────────────────
// Three visual variants render here:
//   - primary 'filled'  → white bg, dark text, square button
//   - primary 'arrow'   → inline arrow link (HomeLeagueBand pattern)
//   - secondary 'outline' → transparent bg, white border, white text
function ActionBtn({ action, variant }) {
  var [busy, setBusy] = useState(false);

  function handle() {
    if (busy) return;
    var r;
    try { r = action.onClick(); } catch (e) { return; }
    if (r && typeof r.then === "function") {
      setBusy(true);
      r.finally(function () { setBusy(false); });
    }
  }

  if (variant === "primary" && action.kind === "arrow") {
    return (
      <button
        onClick={handle}
        disabled={busy}
        style={{
          background:    "transparent",
          border:        "none",
          color:         INK_TEXT,
          fontSize:      12,
          fontWeight:    700,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          padding:       0,
          cursor:        busy ? "default" : "pointer",
          display:       "inline-flex",
          alignItems:    "center",
          gap:           8,
          opacity:       busy ? 0.6 : 1,
          transition:    "opacity 0.15s",
        }}
        onMouseEnter={function (e) { if (!busy) e.currentTarget.style.opacity = "0.8"; }}
        onMouseLeave={function (e) { if (!busy) e.currentTarget.style.opacity = "1"; }}>
        {busy ? "…" : action.label}
        {!busy && <span style={{ fontSize: 14 }}>→</span>}
      </button>
    );
  }

  // Filled (white-on-dark) primary
  if (variant === "primary") {
    return (
      <button
        onClick={handle}
        disabled={busy}
        style={{
          minHeight:     44,
          padding:       "0 18px",
          background:    INK_TEXT,
          color:         INK,
          border:        "none",
          borderRadius:  10,
          fontSize:      12,
          fontWeight:    700,
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          cursor:        busy ? "default" : "pointer",
          opacity:       busy ? 0.7 : 1,
          transition:    "opacity 0.15s",
        }}
        onMouseEnter={function (e) { if (!busy) e.currentTarget.style.opacity = "0.85"; }}
        onMouseLeave={function (e) { if (!busy) e.currentTarget.style.opacity = "1"; }}>
        {busy ? "…" : action.label}
      </button>
    );
  }

  // Outline secondary
  return (
    <button
      onClick={handle}
      disabled={busy}
      style={{
        minHeight:     44,
        padding:       "0 18px",
        background:    "transparent",
        color:         INK_TEXT,
        border:        "1px solid " + INK_BORDER,
        borderRadius:  10,
        fontSize:      12,
        fontWeight:    700,
        letterSpacing: "0.06em",
        textTransform: "uppercase",
        cursor:        busy ? "default" : "pointer",
        opacity:       busy ? 0.6 : 1,
        transition:    "opacity 0.15s",
      }}
      onMouseEnter={function (e) { if (!busy) e.currentTarget.style.opacity = "0.85"; }}
      onMouseLeave={function (e) { if (!busy) e.currentTarget.style.opacity = "1"; }}>
      {busy ? "…" : action.label}
    </button>
  );
}

// ── NavArrowBtn ──────────────────────────────────────────────────
// Small circular arrow button at the right of the header row.
// Mirrors the line-art icon convention (currentColor stroke 1.5,
// 18×18 viewBox).
function NavArrowBtn({ dir, enabled, onClick }) {
  return (
    <button
      onClick={enabled ? onClick : undefined}
      disabled={!enabled}
      aria-label={dir === "left" ? "Previous active item" : "Next active item"}
      style={{
        width:         32, height: 32,
        background:    "transparent",
        border:        "1px solid " + (enabled ? INK_BORDER : "rgba(255,255,255,0.07)"),
        borderRadius:  999,
        color:         enabled ? INK_TEXT : "rgba(255,255,255,0.25)",
        cursor:        enabled ? "pointer" : "default",
        display:       "inline-flex",
        alignItems:    "center",
        justifyContent: "center",
        padding:       0,
        transition:    "opacity 0.15s",
      }}>
      <svg width="14" height="14" viewBox="0 0 18 18" fill="none">
        {dir === "left" ? (
          <path d="M11 4l-5 5 5 5" stroke="currentColor" strokeWidth="1.5"
                strokeLinecap="round" strokeLinejoin="round"/>
        ) : (
          <path d="M7 4l5 5-5 5" stroke="currentColor" strokeWidth="1.5"
                strokeLinecap="round" strokeLinejoin="round"/>
        )}
      </svg>
    </button>
  );
}
