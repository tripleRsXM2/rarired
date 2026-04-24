# FeedCard — Roland Garros Brush-Stroke Border

**Date:** 2026-04-24
**Module:** Feed visual polish
**Status:** Approved, ready for plan
**Branch:** `Mikey`

## Problem

Feed cards currently use a flat 1px `border: "1px solid t.border"`. Clean but mechanical. The founder wants an aesthetic more in line with the tennis identity — specifically the painted white line on Roland Garros clay, which is subtly hand-brushed, slightly uneven in opacity, and distinctly *painted* rather than *drawn*. Refined, elegant, not literal.

## Decision

Replace the hard CSS border on `FeedCard` with an SVG overlay rectangle whose stroke is textured via a single globally-defined `feTurbulence + feDisplacementMap` filter. The rectangle still reads as rectangular, but the line gets the painter's-hand feel of a brushed court stripe.

### Alternatives considered

| Option | Why rejected |
|---|---|
| Court-line corners (brushed L-marks at each corner) | More overtly tennis-branded, adds 4 extra SVG per card, fights minimalism |
| Full mini-court motif (card becomes a miniature top-down court) | Too literal, competes with the scoreboard for visual hierarchy |
| CSS `border-image` with pre-rendered painted-stroke PNG | Doesn't take `filter`, looks static and frozen, same bitmap on every card |
| Multi-layer `box-shadow` stack | Cheap but doesn't actually produce a brushed edge — just a soft glow |

## Visual target

- The line still traces a rectangle (the card keeps its sharp corners and Strava-minimal chrome)
- The line itself has **slight opacity variation along its length** and a **soft, slightly fuzzy edge** — the signature of a painted line versus a drawn line
- Displacement is low (≤ 1px) so the rectangle doesn't appear broken or noisy; the hand only shows up on close inspection
- Stroke colour picks up `t.border` so every theme adapts automatically (warm + cream on Wimbledon, muted on French Open, etc.)

## Technique

### 1. Single global SVG filter

A hidden `<svg>` containing the filter `<defs>` is mounted once at the app root via `providers.jsx`. The filter chain:

```
feTurbulence (type=fractalNoise, baseFrequency ≈ 0.9, numOctaves=1, seed=3)
  → feDisplacementMap (in=SourceGraphic, in2=turbulence, scale ≈ 1.2, xChannelSelector="R", yChannelSelector="G")
```

Short, cheap, and deterministic (fixed seed = consistent stroke across renders). SVG compiles the filter once; every card overlay just references `url(#cs-brushstroke)`.

### 2. Per-card overlay

Each `FeedCard`'s outer `<div>` gets:
- `position: relative`
- `border: 1px solid transparent` (reserves the pixel so the SVG overlay doesn't push layout)
- An absolutely-positioned child `<svg>` at `inset: 0, pointerEvents: "none"` with a `<rect>` occupying the full box, `stroke={t.border}`, `strokeWidth={1}`, `fill="none"`, and `filter="url(#cs-brushstroke)"`

The overlay sits behind the card content (low z-index) so it doesn't intercept clicks. Using a transparent border to reserve the pixel keeps content flush with where it was before — zero layout shift.

### 3. Why an SVG overlay over CSS `border-image`

`border-image` cannot accept a `filter` and has awkward rounded-corner behaviour. The overlay route keeps sharp corners, lets the filter do the work, and doesn't touch the card's existing content flow.

## Scope

### In scope
- `FeedCard` outer border (confirmed + pending + disputed + voided variants — the colouring still uses the existing `cardBorder` string, just piped into the overlay's `stroke` prop)
- `providers.jsx` — add the hidden `<svg><defs><filter>` block at the app DOM root

### Out of scope for V1
- `ProfileMatchRow`, `LeaguesPanel` rows, `ChallengesPanel` rows, `RightPanel` leaderboard rows — secondary surfaces. Re-apply only if the feed card treatment lands well.
- Scoreboard internal divider lines inside FeedCard — structural separators, not decorative. Keeping them sharp preserves the ATP-scoreboard feel.
- No change to status pills, league pill, social footer, avatars, or any other card chrome.

## Files touched

| File | Change |
|---|---|
| `src/app/providers.jsx` | Add a `<svg aria-hidden="true" style="position:absolute;width:0;height:0;">` with `<defs><filter id="cs-brushstroke">` near the root — a pattern commonly used for icon/symbol libraries |
| `src/features/home/pages/HomeTab.jsx` | `FeedCard` outer div: swap the `cardBorder` string from CSS `border` to a transparent reservation, add an inline `<svg>` overlay with the painted-stroke rect. Colour keeps flowing from the same `statusColor` derivation that already drives `cardBorder`. |

Two-file change. No new components extracted (would promote to `components/ui/BrushStrokeBorder.jsx` only if we adopt this in a second place later).

## Implementation notes

- **Colour preservation**: the existing `cardBorder` computation (`orange` for pending, `red` for disputed, `orange88` for non-action pending, default `t.border`) becomes the `stroke` prop on the overlay rect. Needs-action cards still get their colour emphasis; they just get the painted edge too.
- **Border thickness preservation**: existing cards use `2px solid` when action is needed. Overlay stroke becomes `strokeWidth={2}` in that case. Same visual weight, painted.
- **Animation coexistence**: `FeedCard` has no CSS animations on the outer div, so the filter doesn't create paint repaint pressure.
- **Dark mode**: `t.border` adapts; `feDisplacementMap` is colour-agnostic. Will verify on each theme.

## Testing

- **Visual check** on each theme (Wimbledon, French Open, AO, US Open) — capture before/after screenshots of a single FeedCard
- **Scroll perf**: scroll a feed with ≥ 50 cards and look for dropped frames (Chrome DevTools Performance panel). `feTurbulence + feDisplacementMap` is cheap but applied to every overlay, worth verifying
- **Accessibility**: overlay SVG has `aria-hidden="true"`; card semantics unchanged
- **Both card states**: confirmed (default neutral border) + pending / disputed (coloured border at 2px thickness). Both should show the painted effect.

## Risks

- **Filter perf on low-end mobile Safari** — if `feTurbulence` causes jank on a 50+ card feed, fallback is a static SVG data-URI `border-image` that bakes in a painted look without runtime filtering. Spec'd but not implemented unless needed.
- **Aesthetic drift** — the brush effect must be subtle enough that the card still reads as a card. If displacement scale is too high (2px+), rectangles look wobbly. Locked to ≤1.2px.
- **Not applied to secondary surfaces** — feeds + standings might look inconsistent. Acceptable trade-off: the feed card IS the hero surface, secondary surfaces with sharp borders create visual hierarchy.

## Rollback

Single revert. Two files. Filter definition in `providers.jsx` is inert if not referenced; removing the overlay from `FeedCard` brings the old hard border back instantly.

## Success criteria

- Every feed card renders with a visibly painted (not mechanical) outline
- Effect is consistent across themes
- No measurable scroll-perf regression
- Existing status-colour emphasis (pending = orange, disputed = red, etc.) still reads clearly
