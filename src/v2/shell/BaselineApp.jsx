// BaselineApp.jsx — Root v2 shell. Full-bleed layout (no browser-chrome
// preview wrapper) so the v2 app fills the actual viewport on web and
// iPad. On narrow viewports (<700px) we swap the sidebar layout for a
// mobile shell that renders the design's phone screens
// (LiveScoringScreen, ChangeoverScreen, SummaryScreen, HistoryScreen,
// QuickLogScreen) with a bottom tab bar.
//
// Default appearance is **Modern**; a segmented toggle on Home flips
// between Classic and Modern token sets and applies the modern CSS
// overlay alongside it. Default theme is `paper`, default court is
// `grass` — matches the prototype.
//
// User feedback (web): 'can you make sure it doesnt have a window
// inside a window? make it full screen. it doesnt need
// baseline.tennis/home bar at the top with the 3 colour circles.'
// User feedback (mobile): 'the Zip had a mobile section, can you make
// sure its using that?'

import React from "react";

import Sidebar from "./Sidebar.jsx";
import HomeScreen from "./HomeScreen.jsx";
import AppearanceToggle from "./AppearanceToggle.jsx";
import VersionSwitch from "./VersionSwitch.jsx";
import CompetitionsScreen from "../features/competitions/CompetitionsScreen.jsx";
import MessagesScreen from "../features/messages/MessagesScreen.jsx";

import LiveScoringScreen from "../features/matches/components/LiveScoringScreen.jsx";
import DesktopLiveScreen from "../features/matches/components/DesktopLiveScreen.jsx";
import LiveSetupCard from "../features/matches/components/LiveSetupCard.jsx";
import ChangeoverScreen from "../features/matches/components/ChangeoverScreen.jsx";
import SummaryScreen from "../features/matches/components/SummaryScreen.jsx";
import HistoryScreen from "../features/matches/components/HistoryScreen.jsx";
import QuickLogScreen from "../features/matches/components/QuickLogScreen.jsx";
import WatchGlance from "../features/matches/components/WatchGlance.jsx";

import { addPoint, undo, newMatch, engineToLogPayload, endSetEarly, tagLastPoint } from "../features/matches/utils/tennisEngine.js";
import { THEMES, COURTS } from "../features/matches/utils/tokens.js";
import { MODERN_THEMES, MODERN_COURTS, ensureModernCss } from "../features/matches/utils/modernTokens.js";
import { ensureFonts } from "../features/matches/utils/fonts.js";
import { useIsWide } from "../features/matches/hooks/useIsWide.js";

import { buildFinishedMatch } from "../features/matches/data/sampleMatches.js";
import { FORMATS } from "../features/matches/utils/tennisEngine.js";
import { SAMPLE_HISTORY } from "../features/matches/data/sampleHistory.js";
import { useV2Profile, useV2History, useV2Competitions, useV2Friends, logV2Match } from "../data/index.js";
import PlayerProfileScreen from "../features/profile/PlayerProfileScreen.jsx";
import { emitRatingMatchInviteDM } from "../../features/people/services/dmWidgets.js";
// useDMs is NOT imported here — it would race v1's instance for the
// same realtime channel name (`convs:<uid>`) and crash Supabase
// Realtime with 'cannot add postgres_changes callbacks after
// subscribe()'. App.jsx is the canonical owner; we receive `dms` as
// a prop.

const DEFAULTS = { theme: "paper", court: "grass", p1Name: "You", p2Name: "M. Carter", format: "bo3" };

// localStorage key for the in-progress live match. Per-device only —
// each browser remembers its own running match. Cleared on finish /
// reset / when the saved match is older than 24h on next mount.
var LIVE_MATCH_KEY = "cs.v2.liveMatch";

// Strip the (heavy) `cfg` reference and any non-serializable fields
// before persisting; `cfg` is rehydrated from `FORMATS[format]` on
// restore so we don't burn space caching it.
function serializeLiveMatch(m) {
  if (!m) return null;
  var clone = Object.assign({}, m);
  delete clone.cfg;
  return clone;
}
function saveLiveMatch(m) {
  try {
    if (typeof window === "undefined" || !window.localStorage) return;
    if (!m) { window.localStorage.removeItem(LIVE_MATCH_KEY); return; }
    window.localStorage.setItem(LIVE_MATCH_KEY, JSON.stringify(serializeLiveMatch(m)));
  } catch (_) { /* storage full or disabled — fail silent */ }
}
function clearLiveMatch() {
  try {
    if (typeof window === "undefined" || !window.localStorage) return;
    window.localStorage.removeItem(LIVE_MATCH_KEY);
  } catch (_) {}
}

// Tiny error boundary so a crash inside the V2 tree shows a readable
// banner instead of blanking the screen. User reported a blank /v2 on
// the Mdawg preview — without an error boundary, an uncaught throw
// inside React's render phase unmounts the entire subtree and the
// user sees only the root <div>. This catches it visibly.
class V2ErrorBoundary extends React.Component {
  constructor(props){ super(props); this.state = { err: null }; }
  static getDerivedStateFromError(err){ return { err: err }; }
  componentDidCatch(err, info){
    try {
      console.error("[V2 BaselineApp crash]", err, info);
      window.__cs_v2_crash = { message: err && err.message, stack: err && err.stack, info: info };
    } catch(_){}
  }
  render(){
    if (this.state.err) {
      var msg = (this.state.err && this.state.err.message) || String(this.state.err);
      return (
        <div style={{
          position: "fixed", inset: 0, padding: 24, overflow: "auto",
          background: "#1a1a1a", color: "#fff", fontFamily: "ui-monospace, monospace",
          fontSize: 13, lineHeight: 1.5, zIndex: 99999,
        }}>
          <div style={{ color: "#ff7a7a", fontWeight: 700, marginBottom: 8 }}>
            V2 crashed: {msg}
          </div>
          <div style={{ whiteSpace: "pre-wrap", opacity: 0.85 }}>
            {(this.state.err && this.state.err.stack) || ""}
          </div>
          <div style={{ marginTop: 20, opacity: 0.6 }}>
            Open DevTools console and share the full error. Or run
            <code style={{ background: "#000", padding: "2px 6px", margin: "0 4px", borderRadius: 4 }}>
              window.__cs_v2_crash
            </code>
            in the console.
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function BaselineAppInner({ onBack, authUser, dms, everyonePlayers }) {
  React.useEffect(() => { ensureFonts(); }, []);

  // ── Supabase data layer (v2 isolated adapters) ────────────────
  // v2-only hooks for things v1 doesn't already load. authUser + dms
  // come from App.jsx (the v1 root) as props so we don't double-
  // subscribe to Supabase realtime channels. Without that share, a
  // second useDMs() call here would race for the same `convs:<uid>`
  // channel and Supabase Realtime would throw 'cannot add
  // postgres_changes callbacks after subscribe()' — crashing the v2
  // tree. The v2 hooks below (profile / history / competitions /
  // friends) do NOT subscribe to realtime so they stay local here.
  const v2Profile      = useV2Profile();
  // Prefer the prop-passed authUser when available; fall back to the
  // hook's own session lookup so the file still works standalone in
  // tests or if mounted outside of App.jsx.
  const resolvedAuthUser = authUser || v2Profile.authUser;
  const v2UserId       = resolvedAuthUser && resolvedAuthUser.id;
  const v2History      = useV2History(v2UserId);
  const v2Competitions = useV2Competitions(v2UserId);
  const v2Friends      = useV2Friends(v2UserId);

  const liveHistory = v2History.loading
    ? SAMPLE_HISTORY
    : (v2History.history || []);
  const liveWeekStats = v2History.weekStats || null;
  const liveCompetitions = v2Competitions.competitions || [];
  const liveFriends = v2Friends.friends || [];
  const viewerName = (v2Profile.profile && v2Profile.profile.name)
    || (resolvedAuthUser && resolvedAuthUser.email
        ? resolvedAuthUser.email.split("@")[0]
        : DEFAULTS.p1Name);

  // QuickLog save handler — inserts a casual match via logV2Match,
  // then reloads the history feed so the new row shows on Home /
  // History the moment the user lands back. Returns { data, error }
  // straight from logV2Match so QuickLogScreen can surface failures.
  const onQuickLogSubmit = React.useCallback(function (payload) {
    return logV2Match(v2UserId, payload.opponent, payload.sets, {
      // Threaded through so the auto-emit confirm-card DM in
      // logV2Match knows how to label the submitter side of the
      // widget. Falls back to the email-based default inside
      // logV2Match if absent.
      submitterName: viewerName,
    }).then(function (res) {
      if (res && !res.error && v2History.reload) v2History.reload();
      return res;
    });
  }, [v2UserId, v2History.reload, viewerName]);

  // Appearance toggle — Modern (default) or Classic. Modern flips both
  // the THEMES/COURTS tables and overlays a CSS block that handles
  // type/border-radius tweaks inline styles can't reach.
  const [look, setLook] = React.useState("modern");
  React.useEffect(() => { if (look === "modern") ensureModernCss(); }, [look]);

  // User-pickable court — wired into the Live screens via the
  // pressable CourtPicker chip in the top-right. Defaults to grass.
  // User feedback: 'the grass icon in the top right, can you make
  // it pressable? and have you be able to change it to hard court
  // clay etc.'
  const [courtId, setCourtId] = React.useState(DEFAULTS.court);
  const themes = look === "modern" ? MODERN_THEMES : THEMES;
  const courts = look === "modern" ? MODERN_COURTS : COURTS;
  const theme = themes[DEFAULTS.theme] || themes.paper;
  const court = courts[courtId] || courts.grass;
  const accent = court.accent;

  const [route, setRoute] = React.useState("home");
  const [, force] = React.useReducer((x) => x + 1, 0);

  // Friend-profile route carries the target user's id alongside the
  // string route. onOpenProfile(userId) stashes the id and switches
  // to the "profile" route; onGo() to any other route leaves the id
  // in place (harmless — only read while route === "profile").
  const [profileUserId, setProfileUserId] = React.useState(null);
  const onOpenProfile = React.useCallback(function (uid) {
    if (!uid) return;
    setProfileUserId(uid);
    setRoute("profile");
  }, []);

  // Live match — single source of truth. Held in a ref so navigation
  // doesn't reset it; persisted to localStorage so a page refresh /
  // close-and-reopen restores the in-progress match. User feedback:
  // "if you have an existing match that you haven't logged in live
  // scoring, keep it at that. Make it remember."
  //
  // null = no match in progress. Live tab + Home both branch on that
  // and show a Start-match CTA / setup card instead of demo data.
  const liveRef = React.useRef(null);
  const liveRestoredRef = React.useRef(false);
  if (!liveRestoredRef.current) {
    liveRestoredRef.current = true;
    try {
      var raw = (typeof window !== "undefined" && window.localStorage)
        ? window.localStorage.getItem(LIVE_MATCH_KEY) : null;
      if (raw) {
        var parsed = JSON.parse(raw);
        // Drop the restore if the match is finished or older than 24h
        // — stale ones are noise, finished ones belong in History.
        var stale = parsed && parsed.startedAt && (Date.now() - parsed.startedAt > 24 * 3600 * 1000);
        if (parsed && !parsed.endedAt && !stale && parsed.format && FORMATS[parsed.format]) {
          // cfg is a reference to FORMATS — rehydrate from the format id.
          parsed.cfg = FORMATS[parsed.format];
          liveRef.current = parsed;
        } else if (parsed) {
          // Stale / finished — clear the slot.
          try { window.localStorage.removeItem(LIVE_MATCH_KEY); } catch (_) {}
        }
      }
    } catch (_) { /* localStorage disabled or JSON malformed — fail silent */ }
  }
  const liveMatch = liveRef.current;

  // Scoreboard display name for the viewer. Prefers the loaded
  // profile name (e.g. "Mdawg") so the scoreboard reads with the
  // user's actual identity. Falls back to "You" — NOT the email
  // handle (`test@test.com` → "test"), which is an internal
  // identifier that shouldn't leak into the UI. Declared up here
  // before the rename effect that depends on it (TDZ-safety).
  const viewerDisplayName = (v2Profile.profile && v2Profile.profile.name) || "You";

  // Rename p1 in the running match once the profile resolves —
  // covers the race where a match was created before useV2Profile
  // landed (p1 came in as "You", flips to "Mdawg" once the profile
  // arrives). Skips the rename if p1 is already in sync OR if the
  // user has manually edited it to something non-default.
  React.useEffect(function () {
    var m = liveRef.current;
    if (!m || !m.p1) return;
    if (m.p1.name === viewerDisplayName) return;
    // Only auto-rename from the "You" placeholder — never overwrite
    // a real profile name with a different one (avoids surprising
    // the user mid-match if they re-auth as someone else).
    if (m.p1.name !== "You") return;
    m.p1.name = viewerDisplayName;
    saveLiveMatch(m);
    force();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewerDisplayName]);

  // SummaryScreen still renders a demo finished match — it's the
  // visual prototype for the post-match recap and isn't wired to a
  // real match yet. Kept here so the existing route doesn't break.
  const finishedMatch = React.useMemo(() => buildFinishedMatch(viewerName || DEFAULTS.p1Name, DEFAULTS.p2Name), [viewerName]);

  const onPoint = (side) => {
    if (!liveRef.current) return;
    addPoint(liveRef.current, side);
    saveLiveMatch(liveRef.current);
    force();
  };
  const onUndoLive = () => {
    if (!liveRef.current) return;
    undo(liveRef.current);
    saveLiveMatch(liveRef.current);
    force();
  };
  // Wipe the in-progress match without saving. Wraps in a confirm
  // because it's destructive — any unsaved score is gone (no undo
  // past localStorage). Routes back to the live setup card so the
  // user can start fresh. User feedback: "there's no button to
  // cancel match. I think we need to add that in."
  const onCancelLiveMatch = () => {
    if (!liveRef.current) return;
    if (typeof window === "undefined" || !window.confirm) {
      liveRef.current = null;
      clearLiveMatch();
      force();
      setRoute("live");
      return;
    }
    if (window.confirm("Discard this match? Any unsaved progress will be lost.")) {
      liveRef.current = null;
      clearLiveMatch();
      force();
      setRoute("live");
    }
  };
  // Close the current set early with whatever games are on the board.
  // No-op when there's nothing to close (engine handles the guard).
  const onEndSet = () => {
    if (!liveRef.current) return;
    endSetEarly(liveRef.current);
    saveLiveMatch(liveRef.current);
    force();
  };
  // Re-label the most recent point. Passes an engine-key tag
  // ('ace'/'df'/'winner'/'error'/'net') — UI chips map their human
  // labels to these keys before calling.
  const onTagPoint = (tag) => {
    if (!liveRef.current) return;
    tagLastPoint(liveRef.current, tag);
    saveLiveMatch(liveRef.current);
    force();
  };

  // Build + persist a brand-new live match. Called from the
  // LiveSetupCard once an opponent + format are chosen. Stores
  // opponent_id alongside the engine state so a future
  // "Log this match" hand-off can populate match_history without
  // re-asking who the opponent was.
  // (viewerDisplayName is declared earlier — see the block above
  // the rename effect that depends on it.)

  const onCreateLiveMatch = (args) => {
    var opp = (args && args.opponent) || null;
    var fmt = (args && args.format) || DEFAULTS.format;
    var p2Name = (opp && opp.name) || "Opponent";
    var m = newMatch({ format: fmt, p1: { name: viewerDisplayName }, p2: { name: p2Name } });
    // Stash the opponent id (and free-text flag) on the match object
    // so when we eventually log it we know whether to write
    // opponent_id or to use opp_name only.
    m.opponentMeta = { id: (opp && opp.id) || null, name: p2Name };
    liveRef.current = m;
    saveLiveMatch(m);
    force();
    setRoute("live");
  };

  // Home + Summary "Start new match" tile. Drops the current live
  // match (if any) and routes to live; the setup card takes over
  // from there. Calling code that wants to *keep* an in-progress
  // match should route directly with onGo("live").
  const onNewMatch = () => {
    liveRef.current = null;
    clearLiveMatch();
    force();
    setRoute("live");
  };
  const onGo = (id) => setRoute(id);

  // Save / commit the in-progress live match via the same backend
  // Quick-log uses (logV2Match). Reshapes engine.setHistory into the
  // v2Sets payload, pulls the opponent (id + name) from the
  // opponentMeta we stashed when the match was created via
  // onCreateLiveMatch, then routes the user to History on success.
  //
  // Returns { error: null } on success or { error: <message> } on
  // failure so the live-screen Save button can render an inline
  // banner. Doesn't clear the local match on error — the user keeps
  // their state and can retry.
  const onSaveLiveMatch = React.useCallback(async function () {
    var m = liveRef.current;
    if (!m) return { error: "No match in progress." };
    if (!v2UserId) return { error: "Sign in to save matches." };

    var v2Sets = engineToLogPayload(m);
    if (!v2Sets.length) {
      return { error: "Play at least one point before saving." };
    }

    var opp = m.opponentMeta || { id: null, name: (m.p2 && m.p2.name) || "Opponent" };
    var res = await logV2Match(v2UserId, opp, v2Sets, {
      submitterName: viewerName,
    });
    if (res && res.error) {
      return { error: (res.error && res.error.message) || "Couldn't save the match." };
    }

    // Success — wipe the local match (it now lives in match_history)
    // and reload the history feed so the saved row appears immediately.
    liveRef.current = null;
    clearLiveMatch();
    if (v2History.reload) v2History.reload();
    force();
    setRoute("history");
    return { error: null };
  }, [v2UserId, viewerName, v2History.reload]);

  // Players-tab callbacks. `onMessagePlayer` opens a 1:1 conversation
  // with the player (creating a draft conv if none exists) and routes
  // to the v2 Messages screen so the user lands inside the open
  // thread. `onInvitePlayer` is a placeholder until the auto-emit
  // widget work (PR3) lands on this branch — the rating-match invite
  // event will live there. For now we just send the user to v2
  // Messages with a pre-opened thread so they can drop a manual ping.
  const onMessagePlayer = React.useCallback(function (player) {
    if (!player || !player.id) return;
    if (dms && typeof dms.openConversationWith === "function") {
      try { dms.openConversationWith(player.id); } catch (_) {}
    }
    setRoute("messages");
  }, [dms]);
  const onInvitePlayer = React.useCallback(function (player) {
    if (!player || !player.id) return;
    // Slice D: emit a rating-match invite-card DM into the 1:1 conv
    // before navigating. The card renders with Accept / Reschedule
    // buttons in the recipient's thread; sender sees a "waiting" hint.
    // No challenge entity yet — Accept currently fires a templated
    // "Yes, let's lock in a time" reply (see widgetActions.js).
    if (resolvedAuthUser && resolvedAuthUser.id) {
      emitRatingMatchInviteDM(resolvedAuthUser.id, player.id, {
        opponentName: (player.name || "").split(" ")[0] || "you",
      }).then(function (r) {
        if (r && r.error) console.warn("[rating-match invite DM failed]", r.error.message || r.error);
      }).catch(function (e) { console.warn("[rating-match invite DM threw]", e); });
    }
    if (dms && typeof dms.openConversationWith === "function") {
      try { dms.openConversationWith(player.id); } catch (_) {}
    }
    setRoute("messages");
  }, [dms, resolvedAuthUser]);

  const isWide = useIsWide(700);

  // Keyboard-open detection (mobile only). When the on-screen
  // keyboard slides up, `visualViewport.height` shrinks by the
  // keyboard's height while `window.innerHeight` stays put — so
  // the difference is a reliable signal across iOS Safari + Chrome
  // on Android. We treat anything > 100px as "keyboard up" to ride
  // past small chrome differences (URL bar appearing/disappearing).
  // The mobile tab bar (Home / Score / Comps / Inbox / History /
  // Log) gets hidden while the keyboard is up to give input flows
  // back the ~80px of vertical real estate. User feedback: "on
  // mobile, when you do click the writing bar, the icons are still
  // visible ... to save screen space when the keyboard shows up on
  // your mobile phone, it should hide the icons on the bottom."
  const [keyboardOpen, setKeyboardOpen] = React.useState(false);
  React.useEffect(function () {
    if (typeof window === "undefined" || !window.visualViewport) return;
    var vv = window.visualViewport;
    function check() {
      var diff = window.innerHeight - vv.height;
      setKeyboardOpen(diff > 100);
    }
    vv.addEventListener("resize", check);
    vv.addEventListener("scroll", check);
    check();
    return function () {
      vv.removeEventListener("resize", check);
      vv.removeEventListener("scroll", check);
    };
  }, []);

  // ── Mobile layout (<700px) ──────────────────────────────────
  // Renders the design's phone-frame screens directly into the
  // viewport (no fake phone bezel — we ARE the phone). Bottom tab
  // bar swaps between the 5 most-used routes; a top kebab opens
  // the secondary routes (messages, watch, etc.).
  if (!isWide) {
    return (
      <div className={look === "modern" ? "v2-modern-root" : ""} style={{
        position: "fixed", inset: 0, zIndex: 0,
        background: theme.bg, color: theme.ink,
        fontFamily: "Inter, -apple-system, system-ui, sans-serif",
        display: "flex", flexDirection: "column",
        overflow: "hidden",
      }}>
        {/* Top bar — V1/V2 toggle on the left, appearance toggle on
            the right. The old back-to-picker button is retired; the
            V1/V2 toggle is the switcher now. */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "calc(env(safe-area-inset-top, 0px) + 10px) 16px 10px",
          borderBottom: `0.5px solid ${theme.line}`, flexShrink: 0,
          background: theme.bg,
        }}>
          <VersionSwitch theme={theme} onSwitchToV1={onBack} />
          <AppearanceToggle value={look} onChange={setLook} theme={theme} compact />
        </div>

        {/* Content — flex 1, scrolls within itself. */}
        <div style={{ flex: 1, minHeight: 0, overflow: "auto", display: "flex", flexDirection: "column" }}>
          <MobileRouteView
            route={route}
            theme={theme} accent={accent} court={court}
            courts={courts} currentCourtId={courtId} onCourtChange={setCourtId}
            liveMatch={liveMatch} finishedMatch={finishedMatch}
            onPoint={onPoint} onUndo={onUndoLive}
            onGo={onGo} onNewMatch={onNewMatch}
            look={look} onLookChange={setLook}
            history={liveHistory} weekStats={liveWeekStats}
            friends={liveFriends} onQuickLogSubmit={onQuickLogSubmit}
            competitions={liveCompetitions} viewerName={viewerName}
            dms={dms} authUser={resolvedAuthUser} everyonePlayers={everyonePlayers}
            onMessagePlayer={onMessagePlayer} onInvitePlayer={onInvitePlayer}
            onCreateLiveMatch={onCreateLiveMatch}
            onSaveLiveMatch={onSaveLiveMatch}
            onEndSet={onEndSet} onTagPoint={onTagPoint}
            profileUserId={profileUserId} viewerId={v2UserId}
            onOpenProfile={onOpenProfile}
            onCancel={onCancelLiveMatch}
          />
        </div>

        {/* Bottom tab bar — primary mobile nav. 6 tabs that match the
            most-used sidebar items. Secondary routes (messages, watch,
            desktop) reachable via Home tiles. Hidden while the
            on-screen keyboard is open (see keyboardOpen state) so
            input-heavy flows (compose, rename, free-text opponent)
            get the screen real estate back. */}
        {!keyboardOpen && (
          <MobileTabBar route={route} onGo={onGo} theme={theme} accent={accent} />
        )}
      </div>
    );
  }

  // ── Desktop / iPad layout (≥700px) ──────────────────────────
  // Full-bleed: sidebar + main fill the entire viewport. No outer
  // padding, no rounded card, no shadow — the v2 app *is* the page.
  // User feedback (latest): 'I like how in this zip the web app is
  // full screen. currently ours is inside a window inside a web
  // browser which looks weird ... do not include the
  // baseline.tennis/competition bar at the top like the zip. just
  // make it clean.'
  return (
    <div className={look === "modern" ? "v2-modern-root" : ""} style={{
      position: "fixed", inset: 0, zIndex: 0,
      background: theme.bg,
      color: theme.ink,
      fontFamily: "Inter, -apple-system, system-ui, sans-serif",
      display: "flex",
      overflow: "hidden",
    }}>
      <div className="desktop-shell" style={{
        flex: 1,
        height: "100%",
        background: theme.bg,
        display: "flex",
        minWidth: 0,
      }}>
        <Sidebar theme={theme} accent={accent} route={route} onGo={onGo} onBack={onBack} look={look} onLookChange={setLook} />
        <div style={{ flex: 1, minWidth: 0, position: "relative", overflow: "auto" }}>
          <RouteView
            route={route}
            theme={theme} accent={accent} court={court}
            courts={courts} currentCourtId={courtId} onCourtChange={setCourtId}
            liveMatch={liveMatch} finishedMatch={finishedMatch}
            onPoint={onPoint} onUndo={onUndoLive}
            onGo={onGo} onNewMatch={onNewMatch}
            look={look} onLookChange={setLook}
            history={liveHistory} weekStats={liveWeekStats}
            friends={liveFriends} onQuickLogSubmit={onQuickLogSubmit}
            competitions={liveCompetitions} viewerName={viewerName}
            dms={dms} authUser={resolvedAuthUser} everyonePlayers={everyonePlayers}
            onMessagePlayer={onMessagePlayer} onInvitePlayer={onInvitePlayer}
            onCreateLiveMatch={onCreateLiveMatch}
            onSaveLiveMatch={onSaveLiveMatch}
            onEndSet={onEndSet} onTagPoint={onTagPoint}
            profileUserId={profileUserId} viewerId={v2UserId}
            onOpenProfile={onOpenProfile}
            onCancel={onCancelLiveMatch}
          />
        </div>
      </div>
    </div>
  );
}

// Public export — wraps the inner shell in an error boundary so a
// crash surfaces a readable banner instead of blanking the screen.
export default function BaselineApp(props) {
  return (
    <V2ErrorBoundary>
      <BaselineAppInner {...props}/>
    </V2ErrorBoundary>
  );
}

// ─── Desktop route view ────────────────────────────────────────────

function RouteView({
  route, theme, accent, court,
  courts, currentCourtId, onCourtChange,
  liveMatch, finishedMatch,
  onPoint, onUndo, onGo, onNewMatch,
  look, onLookChange,
  history, weekStats, competitions, viewerName,
  friends, onQuickLogSubmit,
  dms, authUser, everyonePlayers,
  onMessagePlayer, onInvitePlayer,
  onCreateLiveMatch, onSaveLiveMatch,
  onEndSet, onTagPoint, onCancel,
  profileUserId, viewerId, onOpenProfile,
}) {
  var isPhone = false;   // RouteView is the desktop/iPad layout
  switch (route) {
    case "home":
      return <HomeScreen
        theme={theme} accent={accent} court={court}
        liveMatch={liveMatch} history={history}
        weekStats={weekStats} viewerName={viewerName}
        friends={friends} onCreateLiveMatch={onCreateLiveMatch} isPhone={isPhone}
        onGo={onGo} onNewMatch={onNewMatch}
        look={look} onLookChange={onLookChange}
      />;
    case "live":
      // Empty-state — no match started yet. Render the setup card
      // (opponent picker + format chips + Start button) instead of
      // crashing the scoring UI on a null match.
      if (!liveMatch) {
        return <LiveSetupCard
          theme={theme} accent={accent} court={court}
          viewerName={viewerName} friends={friends}
          onStart={onCreateLiveMatch} isPhone={false}
        />;
      }
      return <DesktopLiveScreen
        match={liveMatch} theme={theme} accent={accent} court={court}
        courts={courts} currentCourtId={currentCourtId} onCourtChange={onCourtChange}
        onPoint={onPoint} onUndo={onUndo}
        onChangeover={() => onGo("changeover")}
        onSave={onSaveLiveMatch}
        onEndSet={onEndSet} onTagPoint={onTagPoint}
        onCancel={onCancel}
      />;
    case "competitions":
      return <CompetitionsScreen
        theme={theme} accent={accent} court={court}
        onLog={() => onGo("live")} competitions={competitions}
        everyonePlayers={everyonePlayers} friends={friends} authUser={authUser}
        onMessagePlayer={onMessagePlayer} onInvitePlayer={onInvitePlayer}
      />;
    case "profile":
      return <PlayerProfileScreen theme={theme} accent={accent} userId={profileUserId} viewerId={viewerId} onBack={() => onGo("home")} isPhone={false} />;
    case "messages":
      return <MessagesScreen theme={theme} accent={accent} isPhone={false} dms={dms} authUser={authUser} everyonePlayers={everyonePlayers} onOpenProfile={onOpenProfile} />;
    case "changeover":
      // Changeover only makes sense mid-match — bounce to the live
      // tab (which renders the setup card when there's no match).
      if (!liveMatch) return <LiveSetupCard theme={theme} accent={accent} court={court} viewerName={viewerName} friends={friends} onStart={onCreateLiveMatch} isPhone={false} />;
      return <ChangeoverScreen match={liveMatch} theme={theme} accent={accent} court={court} onResume={() => onGo("live")} totalSec={90} />;
    case "summary":
      return <SummaryScreen match={finishedMatch} theme={theme} accent={accent} court={court} onShare={() => {}} onNew={onNewMatch} />;
    case "history":
      return <HistoryScreen theme={theme} accent={accent} matches={history} onOpenProfile={onOpenProfile} />;
    case "quicklog":
      return <QuickLogScreen theme={theme} accent={accent} onSave={() => onGo("home")} friends={friends} viewerName={viewerName} onSubmit={onQuickLogSubmit} />;
    case "desktop":
      // Desktop variant of Live — same null-match handling as "live".
      if (!liveMatch) return <LiveSetupCard theme={theme} accent={accent} court={court} viewerName={viewerName} friends={friends} onStart={onCreateLiveMatch} isPhone={false} />;
      return <DesktopLiveScreen match={liveMatch} theme={theme} accent={accent} court={court} onPoint={onPoint} onUndo={onUndo} onChangeover={() => onGo("changeover")} />;
    case "watch":
      // Watch glance is a mid-match shortcut — when no match exists,
      // fall back to the setup card so the user sees the same path.
      if (!liveMatch) return <LiveSetupCard theme={theme} accent={accent} court={court} viewerName={viewerName} friends={friends} onStart={onCreateLiveMatch} isPhone={false} />;
      return (
        <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: theme.bg, gap: 36 }}>
          <WatchGlance match={liveMatch} accent={accent} onPoint={onPoint} onUndo={onUndo} />
          <div style={{ maxWidth: 280, color: theme.ink }}>
            <div className="t-cap" style={{ color: theme.inkSoft }}>Apple Watch</div>
            <h2 className="t-serif" style={{ fontSize: 32, lineHeight: 1, margin: "6px 0 12px", letterSpacing: "-0.01em" }}>Tap to score, glance to know.</h2>
            <p style={{ fontSize: 13, color: theme.inkSoft, lineHeight: 1.5, fontFamily: "Inter" }}>
              Top half is you, bottom half is your opponent. Crown spins through sets. Force-touch for stats.
            </p>
          </div>
        </div>
      );
    default:
      return <HomeScreen
        theme={theme} accent={accent} court={court}
        liveMatch={liveMatch} history={history}
        weekStats={weekStats} viewerName={viewerName}
        friends={friends} onCreateLiveMatch={onCreateLiveMatch} isPhone={isPhone}
        onGo={onGo} onNewMatch={onNewMatch}
        look={look} onLookChange={onLookChange}
      />;
  }
}

// ─── Mobile route view ─────────────────────────────────────────────
// Renders the design's phone-frame screens directly into the viewport.
// Each screen is full-flex so it stretches inside the scroll region.

function MobileRouteView({
  route, theme, accent, court,
  courts, currentCourtId, onCourtChange,
  liveMatch, finishedMatch,
  onPoint, onUndo, onGo, onNewMatch,
  look, onLookChange,
  history, weekStats, competitions, viewerName,
  friends, onQuickLogSubmit,
  dms, authUser, everyonePlayers,
  onMessagePlayer, onInvitePlayer,
  onCreateLiveMatch, onSaveLiveMatch,
  onEndSet, onTagPoint, onCancel,
  profileUserId, viewerId, onOpenProfile,
}) {
  var isPhone = true;    // MobileRouteView is the narrow-viewport layout
  switch (route) {
    case "home":
      return <HomeScreen
        theme={theme} accent={accent} court={court}
        liveMatch={liveMatch} history={history}
        weekStats={weekStats} viewerName={viewerName}
        friends={friends} onCreateLiveMatch={onCreateLiveMatch} isPhone={isPhone}
        onGo={onGo} onNewMatch={onNewMatch}
        look={look} onLookChange={onLookChange}
      />;
    case "live":
      // Empty-state — render the setup card instead of crashing
      // the mobile scoring UI on a null match. Same component
      // desktop uses, with isPhone=true so the spacing tightens.
      if (!liveMatch) {
        return <LiveSetupCard
          theme={theme} accent={accent} court={court}
          viewerName={viewerName} friends={friends}
          onStart={onCreateLiveMatch} isPhone={true}
        />;
      }
      return (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
          <LiveScoringScreen
            match={liveMatch} theme={theme} accent={accent} court={court}
            courts={courts} currentCourtId={currentCourtId} onCourtChange={onCourtChange}
            onPoint={onPoint} onUndo={onUndo}
            onChangeover={() => onGo("changeover")}
            onSave={onSaveLiveMatch}
            onEndSet={onEndSet} onTagPoint={onTagPoint}
            onCancel={onCancel}
          />
        </div>
      );
    case "competitions":
      return <CompetitionsScreen
        theme={theme} accent={accent} court={court}
        onLog={() => onGo("live")} competitions={competitions}
        everyonePlayers={everyonePlayers} friends={friends} authUser={authUser}
        onMessagePlayer={onMessagePlayer} onInvitePlayer={onInvitePlayer}
      />;
    case "profile":
      return <PlayerProfileScreen theme={theme} accent={accent} userId={profileUserId} viewerId={viewerId} onBack={() => onGo("home")} isPhone={true} />;
    case "messages":
      return <MessagesScreen theme={theme} accent={accent} isPhone={true} dms={dms} authUser={authUser} everyonePlayers={everyonePlayers} onOpenProfile={onOpenProfile} />;
    case "changeover":
      if (!liveMatch) return <LiveSetupCard theme={theme} accent={accent} court={court} viewerName={viewerName} friends={friends} onStart={onCreateLiveMatch} isPhone={true} />;
      return <ChangeoverScreen match={liveMatch} theme={theme} accent={accent} court={court} onResume={() => onGo("live")} totalSec={90} />;
    case "summary":
      return <SummaryScreen match={finishedMatch} theme={theme} accent={accent} court={court} onShare={() => {}} onNew={onNewMatch} />;
    case "history":
      return <HistoryScreen theme={theme} accent={accent} matches={history} onOpenProfile={onOpenProfile} />;
    case "quicklog":
      return <QuickLogScreen theme={theme} accent={accent} onSave={() => onGo("home")} friends={friends} viewerName={viewerName} onSubmit={onQuickLogSubmit} />;
    case "desktop":
    case "watch":
      // On mobile, fall back to home for desktop/watch routes (they
      // don't make sense on a phone). Tap home + scroll to recents.
      return <HomeScreen
        theme={theme} accent={accent} court={court}
        liveMatch={liveMatch} history={history}
        weekStats={weekStats} viewerName={viewerName}
        friends={friends} onCreateLiveMatch={onCreateLiveMatch} isPhone={isPhone}
        onGo={onGo} onNewMatch={onNewMatch}
        look={look} onLookChange={onLookChange}
      />;
    default:
      return <HomeScreen
        theme={theme} accent={accent} court={court}
        liveMatch={liveMatch} history={history}
        weekStats={weekStats} viewerName={viewerName}
        friends={friends} onCreateLiveMatch={onCreateLiveMatch} isPhone={isPhone}
        onGo={onGo} onNewMatch={onNewMatch}
        look={look} onLookChange={onLookChange}
      />;
  }
}

// ─── Mobile tab bar ────────────────────────────────────────────────

function MobileTabBar({ route, onGo, theme, accent }) {
  // 6 primary tabs. Order (user feedback 2026-05-17): Inbox sits in
  // the middle between Score and Log; History moves to the end.
  //   Home · Comps · Score · Inbox · Log · History
  const TABS = [
    { id: "home",         label: "Home",    Icon: HomeIcon },
    { id: "competitions", label: "Comps",   Icon: TrophyIcon },
    { id: "live",         label: "Score",   Icon: LiveIcon },
    { id: "messages",     label: "Inbox",   Icon: ChatIcon },
    { id: "quicklog",     label: "Log",     Icon: PenIcon },
    { id: "history",      label: "History", Icon: HistoryIcon },
  ];
  return (
    <div style={{
      display: "flex", justifyContent: "space-around", alignItems: "center",
      padding: "8px 6px calc(env(safe-area-inset-bottom, 0px) + 8px)",
      borderTop: `0.5px solid ${theme.line}`,
      background: theme.bg, flexShrink: 0,
    }}>
      {TABS.map(function(t){
        var on = route === t.id ||
                 (t.id === "live" && (route === "changeover" || route === "summary"));
        return (
          <button key={t.id} type="button" onClick={function(){ onGo(t.id); }}
            style={{
              appearance: "none", background: "transparent", border: 0, cursor: "pointer",
              display: "flex", flexDirection: "column", alignItems: "center", gap: 3,
              padding: "4px 8px",
              color: on ? accent : theme.inkSoft,
              fontFamily: "JetBrains Mono, ui-monospace, monospace",
              fontSize: 9.5, letterSpacing: "0.08em", textTransform: "uppercase",
              fontWeight: on ? 600 : 500,
              minWidth: 0,
            }}>
            <t.Icon size={20} active={on}/>
            <span>{t.label}</span>
          </button>
        );
      })}
    </div>
  );
}

// ─── Tab icons (line-art SVG, no emoji) ────────────────────────────

function HomeIcon({ size=20 }){ return (<svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M3 11 L 12 4 L 21 11 V 20 a 1 1 0 0 1 -1 1 H 14 v -6 H 10 v 6 H 4 a 1 1 0 0 1 -1 -1 Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" fill="none"/></svg>); }
function LiveIcon({ size=20, active }){ return (<svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.5" fill={active ? "currentColor" : "none"} fillOpacity="0.18"/><path d="M3 12 C 7 9, 17 9, 21 12" stroke="currentColor" strokeWidth="1.2" fill="none"/><path d="M3 12 C 7 15, 17 15, 21 12" stroke="currentColor" strokeWidth="1.2" fill="none"/></svg>); }
function TrophyIcon({ size=20 }){ return (<svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M7 4 H 17 V 8 C 17 11.5, 14.5 14, 12 14 C 9.5 14, 7 11.5, 7 8 Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" fill="none"/><path d="M7 5 H 4 C 4 8, 6 9, 7 9 M 17 5 H 20 C 20 8, 18 9, 17 9" stroke="currentColor" strokeWidth="1.4" fill="none" strokeLinecap="round"/><path d="M9 21 H 15 M 12 14 V 21" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>); }
function HistoryIcon({ size=20 }){ return (<svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 6 H 20 M 4 12 H 20 M 4 18 H 20" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>); }
function PenIcon({ size=20 }){ return (<svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 20 H 9 L 19 10 L 14 5 L 4 15 Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" fill="none"/><path d="M12 7 L 17 12" stroke="currentColor" strokeWidth="1.2"/></svg>); }
function ChatIcon({ size=20 }){ return (<svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/></svg>); }

export { LiveScoringScreen };
