---
name: test-before-ship
description: Use this skill for any feature, bug fix, or UI change in CourtSync before committing. Ensures every claim of "done" or "working" is backed by an executed test — not code inspection, not "looks right." Activates automatically on any multi-file change, UI change, or when the user reports a bug. **Keywords**: "test this", "verify", "ship", "is this working", "fixed", "push", "ready to commit".
---

# Test-Before-Ship Protocol (CourtSync)

## Why this skill exists

A user reported three bugs in a row (left-click menu, emoji "+", emoji 😊
input) that were *obvious* to an end-user in a real browser but that I'd
shipped without actually clicking through. Writing the code and running
`npm run build` is not "testing" — it proves the code compiles.

From now on: **no feature is "done" without an executed test**.
This means either an automated test that exercises the actual user flow,
or an explicit manual test you walked through end-to-end. Never infer
correctness from code inspection alone.

## Rules (apply to every change)

### 1. Write an end-to-end flow test for every user-visible change

For any change that touches UI, write a vitest+RTL test that exercises
the *exact path a user would take*. Not just "component renders" — the
full interaction:

- Click the button a user would click.
- Assert the thing the user expects to happen actually happened (a
  DOM node appears, a mock was called, a state mutation landed).
- If the change is multi-step (open menu → click item), the test does
  every step.

A test that only asserts "renders without crashing" is not enough.

### 2. Simulate two users for any multi-user flow

DMs, challenges, match confirmations, reactions — any feature that
involves more than one person must be covered by a test that mocks
both sides of the interaction. See `useDMs.test.js` for the pattern:
two mocked supabase clients, one emits a realtime payload to the other.

For the real DB layer, `scripts/verify-dm-two-user.mjs` exists. Run it
against staging with two test accounts whenever a migration or RLS
change could affect cross-user behaviour.

### 3. Run tests locally BEFORE the commit — every time

```
npm test
```

The commit must not happen if a test is failing or the output ends in
`failed`. If the user asked for the commit, write the test first,
confirm it passes, *then* commit. Running the tests AFTER you've
committed is not running them — it's verifying a different thing.

### 4. Verify the deployed bundle has your code

Writing code ≠ deployed code. After a push that the user will test:

- Curl the branch preview URL, pull the `index-*.js` hash from HTML.
- Grep the bundle for a distinctive literal from your change (an
  SVG path, an aria-label, a user-visible string). Minified identifier
  names won't survive — use strings.
- If the marker isn't there, the build didn't include your change —
  either the build failed silently or Vercel is serving cached edge.

The script `scripts/verify-deploy.mjs` does this if it exists; otherwise
use `curl | grep`. The Vercel commit status API at
`https://api.github.com/repos/<owner>/<repo>/commits/<sha>/status`
reports success/failure per commit.

### 5. Never claim a flow "works" without running it

Forbidden phrases in a report:
- "should work"
- "based on my reading of the code, this will..."
- "I believe this is fixed"
- "the code path is correct"

Required instead:
- "`npm test` ran and this test passed: <name of test>"
- "I clicked through the flow manually in the preview — here's what I saw"
- "the live bundle contains `<distinctive string>` so the change is deployed"

### 6. Operate as a team — dev + UI review

Before marking any UI change done:

- **Dev review**: does the test cover the bug reported? Does it cover
  the negative case (e.g. left-click on partner's bubble should NOT
  show delete options)?
- **UI review**: does the chrome match the app's theme tokens? Icons
  stroke-1.5 rounded? Spacing consistent with neighboring blocks?
- **Accessibility**: does every interactive element have an accessible
  name (aria-label or visible text)? Keyboard reachable?

Every round-trip should produce a test as well as code. If a user
reports a bug and you fix it without adding a regression test, you
haven't closed the loop.

### 7. Troubleshooting real-browser issues not reproduced by tests

If tests pass in jsdom but the user still reports the bug:

1. **First** verify the deployed bundle (Rule 4). A stale bundle or
   stale Vercel edge cache is the #1 cause. Ask the user to hard-
   refresh AND check DevTools → Network for the asset hash.
2. **Then** consider real-browser differences jsdom doesn't simulate:
   - Touch-vs-mouse events on hybrid devices
   - Safari's `-webkit-appearance` quirks
   - Service worker caching
3. **Only then** suspect a logic error — and if it is one, first write
   a failing test that reproduces the issue before fixing.

## Checklist — paste this into every "is it ready?" reply

Before declaring any feature or fix done, confirm:

- [ ] Tests added for the reported behaviour (positive + negative).
- [ ] `npm test` run after the final code change; output shows all
      passing; pasted the pass count in the report.
- [ ] `npm run build` passes.
- [ ] Distinctive literal from the change is present in the live
      deployed bundle (curl'd + grep'd).
- [ ] Per-user manual walkthrough done for each user role the change
      affects (if cross-user).
- [ ] Regression test added for the exact scenario the user reported.

If any row is unchecked, you are not done.
