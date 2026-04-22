# FeedCard — Remove Redundant Stats Strip

**Date:** 2026-04-23
**Module:** Feed UI polish (post-Module 7)
**Status:** Approved, ready for plan

## Problem

The feed card currently renders a 3-column stats strip (`RESULT / SETS / SCORE`) between the "vs X" title row and the scoreboard. Every value in the strip is already visible in the scoreboard below it:

| Strip value | Already shown by |
|---|---|
| `RESULT: Lost` | Arrow on winning row + bolded winner name |
| `SETS: 0–1` | Count of cells with bolded score per row |
| `SCORE: 6-1` | The set cells themselves |

The strip adds ~60px of vertical noise per card without conveying any unique signal. The scoreboard (the "tennis-style" part the founder wants to keep) is strong enough on its own — that's the whole point of a real ATP scoreboard.

## Decision

Remove the stats strip entirely. Keep the scoreboard as the single authoritative display of the match outcome.

**Alternatives considered:**
- *Keep the strip, reduce to just `RESULT`* — still an extra row duplicating one bit that the arrow already shows.
- *Move a tiny `Won/Lost` pill into the header* — keeps the at-a-glance signal but still duplicates what the scoreboard shows below.

Rejected in favour of the cleaner drop-entirely approach; the scoreboard's arrow + row bolding are strong enough. If we miss the skim-read signal later we can revisit with the pill approach.

## Scope

### In scope
- Delete the stats strip block in `FeedCard` (HomeTab.jsx, approximately lines 365–395 — the block that renders the three-column `{ label, value, color }` array).

### Out of scope
- No changes to derivation helpers (`isWin`, `setWinCounts`) — still used elsewhere (outer border tint, scoreboard row logic, share-sheet text).
- No changes to the scoreboard itself.
- No changes to the status pill, league pill, title row, header chrome, or social footer.
- No changes to `ProfileMatchRow` — it already doesn't render a stats strip.
- No changes to the unauthenticated DEMO_FEED fixtures.

## What stays derived but un-rendered

- `isWin` — drives border colour + share text ("X won vs Y"); still computed at the top of `FeedCard`.
- `setWinCounts` — drives the scoreboard's arrow placement; still computed.

Nothing downstream changes; we simply stop printing a visible summary label for these values.

## Spacing

The scoreboard's `borderTop: "1px solid t.border"` currently separates it from the stats strip. After the strip is removed, that border will sit immediately below the title row. That reads fine as a "header-block / scoreboard" divider — no padding change required.

## Files touched

- `src/features/home/pages/HomeTab.jsx` — delete the stats strip JSX inside `FeedCard`.

Single-file change; deletion only, no new code added.

## Testing / verification

- **Visual check**: scroll the feed in dev, confirm cards render cleanly without the strip. Check on both Wimbledon (light) and dark themes.
- **Regression check**: confirm the scoreboard arrow, outer border tint, and share-sheet text still reflect the correct winner — i.e. `isWin` derivation is still wired.
- No unit tests to update; the stats strip had no test coverage.

## Risks

- **Users who liked the at-a-glance text summary** may miss it. Low risk — the arrow + bolded winner row communicates the same info in ~0.3s. If feedback says otherwise, option B (pill in header) is a 5-line follow-up.

## Rollback

- Single file, single commit. `git revert` is trivial.
