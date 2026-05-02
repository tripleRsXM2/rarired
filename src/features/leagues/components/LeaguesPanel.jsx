// src/features/leagues/components/LeaguesPanel.jsx
//
// The People → Leagues sub-tab. Two modes:
//   • LIST  — shows every league the viewer is in (or invited to) + a
//             "New league" CTA + inline Accept/Decline for pending invites
//   • DETAIL — drill-down into one league: standings table, members list
//             with owner controls, recent activity strip, rules summary
//
// State is local (no router nesting for V1 to keep the diff contained).
// Detail view is opened by selecting a league id; back = null it.

import { useState, useEffect, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import { useLocation, useNavigate } from "react-router-dom";
import PlayerAvatar from "../../../components/ui/PlayerAvatar.jsx";
import { NAV_ICONS } from "../../../lib/constants/navIcons.jsx";
import CreateLeagueModal from "./CreateLeagueModal.jsx";
import { useDeepLinkHighlight } from "../../../lib/utils/deepLink.js";
import LeagueRivalryCallout from "./LeagueRivalryCallout.jsx";
import LeagueLifecycleMenu  from "./LeagueLifecycleMenu.jsx";
import LeagueLifecycleModal from "./LeagueLifecycleModal.jsx";
import {
  LIFECYCLE_LABELS, lifecyclePillTokens,
  isActive, isPastLifecycle,
} from "../utils/leagueLifecycle.js";
// Editorial Tennis tokens — the league detail view (drill-down inside
// a created league) is intentionally restyled to match Log Match /
// Compete. The list view above keeps the legacy `t` palette for now
// since it sits inside the multi-tab Compete page chrome.
import { ED_TOK } from "../../home/components/EditorialScreen.jsx";

export default function LeaguesPanel({
  t, authUser,
  leagues,
  profileMap,
  detailCache,
  loadLeagueDetail,
  createLeague,
  inviteToLeague,
  respondToInvite,
  removeMember,
  archiveLeague,
  // Module 12 Slice 2 — three new lifecycle transitions. archiveLeague
  // also gained an extended (reason, note) signature; old single-arg
  // call sites still work because both args default to null on the
  // service side.
  completeLeague,
  cancelLeague,
  voidLeague,
  friends,
  openProfile,
  toast,
  // Per-league Log match — opens the score modal pre-filled with
  // this league + the league's mode (ranked/casual). Active members
  // tap this from the league detail header next to "+ Invite member".
  onLogMatchInLeague,
  // Slice 4 (design overhaul) — viewer history + challenge composer
  // for the new retention surfaces inside the league detail view.
  history,
  openChallenge,
  // Lets us hide the global "Compete" top mob nav while a league
  // detail view is open — the detail view owns its own sticky chrome.
  setHideTopMobNav,
  // Same idea but for the local "← Compete / Leagues" sub-chrome
  // rendered by TournamentsTab above this panel.
  setHideSubChrome,
}) {
  var [selectedId, setSelectedId]   = useState(null);
  var [showCreate, setShowCreate]   = useState(false);

  var location = useLocation();
  var navigate = useNavigate();

  // Side-effect: while a league is selected, hide BOTH the global
  // top mob nav AND the TournamentsTab "← Compete / Leagues"
  // sub-chrome — the detail view owns its own sticky chrome (back
  // chevron + scroll-aware kicker + lifecycle menu) and any layer
  // above it is redundant. Both flags reset on unmount or when
  // returning to the list view so the rest of the Compete tab keeps
  // its normal navigation framing.
  useEffect(function () {
    var open = !!selectedId;
    if (setHideTopMobNav) setHideTopMobNav(open);
    if (setHideSubChrome) setHideSubChrome(open);
    return function () {
      if (setHideTopMobNav) setHideTopMobNav(false);
      if (setHideSubChrome) setHideSubChrome(false);
    };
  }, [selectedId, setHideTopMobNav, setHideSubChrome]);

  function report(msg) { if (toast) toast(msg, "error"); else window.alert(msg); }

  // Deep-link: a feed-card league pill navigates to "/tournaments/leagues?id=<uuid>".
  // Auto-select the requested league on mount / URL change, then strip the
  // query param so refreshing doesn't keep reopening it.
  useEffect(function () {
    var params = new URLSearchParams(location.search);
    var urlId = params.get("id");
    if (urlId && urlId !== selectedId) {
      setSelectedId(urlId);
      // Clean the URL so back/refresh doesn't fight the user
      navigate("/tournaments/leagues", { replace: true });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.search]);

  // Load detail lazily when a league is opened
  useEffect(function () {
    if (selectedId && loadLeagueDetail) loadLeagueDetail(selectedId);
  }, [selectedId, loadLeagueDetail]);

  var selectedLeague = useMemo(function () {
    return (leagues || []).find(function (l) { return l.id === selectedId; });
  }, [leagues, selectedId]);

  // Deep-link: when we arrive here from a league_invite / league_joined
  // notification, scroll to + pulse the matching league row. MUST be
  // declared before any conditional early-return, or switching between
  // list and detail view changes the hook count and React crashes with
  // error #310 (blank screen).
  var leagueDeepLink = useDeepLinkHighlight("highlightLeagueId");

  // ── DETAIL VIEW ────────────────────────────────────────────────────────────
  if (selectedLeague) {
    return (
      <LeagueDetailView
        t={t} authUser={authUser}
        league={selectedLeague}
        detail={detailCache[selectedId]}
        profileMap={profileMap}
        onBack={function () {
          // Pop back to the Compete hub directly. Used to deselect
          // and land on the Leagues list page, but the list page
          // sits behind a hidden sub-chrome now and offers no clear
          // "next thing to do" — the Compete hub is the natural
          // root for a league exit.
          setSelectedId(null);
          navigate("/tournaments");
        }}
        onInvite={inviteToLeague}
        onRemove={removeMember}
        onArchive={archiveLeague}
        onComplete={completeLeague}
        onCancel={cancelLeague}
        onVoid={voidLeague}
        onRespond={respondToInvite}
        onLogMatchInLeague={onLogMatchInLeague}
        friends={friends}
        openProfile={openProfile}
        toast={toast}
        history={history}
        openChallenge={openChallenge}
      />
    );
  }

  // ── LIST VIEW ──────────────────────────────────────────────────────────────
  if (!leagues || leagues.length === 0) {
    return (
      <div>
        <ListHeader t={t} onNew={function () { setShowCreate(true); }} />
        <div style={{ textAlign: "center", padding: "40px 20px", background: t.bgCard, border: "1px solid " + t.border, borderRadius: 0 }}>
          <div style={{ fontSize: 32, marginBottom: 10 }}>🎾</div>
          <div style={{ fontSize: 15, fontWeight: 700, color: t.text, marginBottom: 6 }}>No leagues yet</div>
          <div style={{ fontSize: 13, color: t.textSecondary, lineHeight: 1.5, maxWidth: 320, margin: "0 auto 14px" }}>
            Start a private season with your friends. Log matches, climb the standings,
            bragging rights.
          </div>
          <button
            onClick={function () { setShowCreate(true); }}
            style={{ padding: "10px 20px", borderRadius: 0, border: "none", background: t.accent, color: "#fff", fontSize: 13, fontWeight: 700, letterSpacing: "0.02em", cursor: "pointer" }}>
            + Create league
          </button>
        </div>

        {showCreate && (
          <CreateLeagueModal
            t={t} onClose={function () { setShowCreate(false); }}
            createLeague={createLeague}
            onCreated={function (newId) { setSelectedId(newId); }}
            toast={toast}
          />
        )}
      </div>
    );
  }

  // Module 12 Slice 2 — split the list into Active vs Past so the
  // panel surfaces what's currently playable up top and pushes
  // historical seasons into a secondary section. Pending invites
  // count as active for the purposes of this split (they're the
  // most actionable thing in the list). Voided leagues are filtered
  // upstream in useLeagues. Cancelled / archived / completed all
  // fall under "Past".
  var activeRows = leagues.filter(function (lg) {
    return isActive(lg) || lg.my_status === "invited";
  });
  var pastRows   = leagues.filter(function (lg) {
    return isPastLifecycle(lg) && lg.my_status !== "invited";
  });

  return (
    <div>
      <ListHeader t={t} onNew={function () { setShowCreate(true); }} />

      {activeRows.length > 0 && (
        <>
          {/* Optional section divider — only render the label if both
              sections will be shown, so a single-section list isn't
              cluttered with chrome. */}
          {pastRows.length > 0 && (
            <SectionLabel t={t} label="Active" count={activeRows.length} />
          )}
          {activeRows.map(function (lg) {
            return (
              <LeagueRow
                key={lg.id}
                t={t}
                league={lg}
                authUser={authUser}
                onOpen={function () { setSelectedId(lg.id); }}
                onRespond={respondToInvite}
                toast={toast}
                rowAnchor={leagueDeepLink.rowProps(lg.id)}
              />
            );
          })}
        </>
      )}

      {pastRows.length > 0 && (
        <>
          <SectionLabel t={t} label="Past" count={pastRows.length} extraTopMargin={activeRows.length > 0}/>
          {pastRows.map(function (lg) {
            return (
              <LeagueRow
                key={lg.id}
                t={t}
                league={lg}
                authUser={authUser}
                onOpen={function () { setSelectedId(lg.id); }}
                onRespond={respondToInvite}
                toast={toast}
                rowAnchor={leagueDeepLink.rowProps(lg.id)}
              />
            );
          })}
        </>
      )}

      {showCreate && (
        <CreateLeagueModal
          t={t} onClose={function () { setShowCreate(false); }}
          createLeague={createLeague}
          onCreated={function (newId) { setSelectedId(newId); }}
          toast={toast}
        />
      )}
    </div>
  );
}

// ── SectionLabel ────────────────────────────────────────────────────
// Small uppercase divider for the Active / Past split. Only rendered
// when both sections have at least one row.
function SectionLabel({ t, label, count, extraTopMargin }) {
  return (
    <div style={{
      fontSize: 9, fontWeight: 700, color: t.textTertiary,
      textTransform: "uppercase", letterSpacing: "0.14em",
      marginTop: extraTopMargin ? 18 : 0,
      marginBottom: 8,
    }}>
      {label}
      {count != null ? (
        <span style={{ marginLeft: 6, color: t.textTertiary, fontWeight: 600, opacity: 0.7 }}>
          · {count}
        </span>
      ) : null}
    </div>
  );
}

// ── ListHeader ────────────────────────────────────────────────────────────────
function ListHeader({ t, onNew }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
      <div>
        <div style={{ fontSize: 10, fontWeight: 700, color: t.textTertiary, textTransform: "uppercase", letterSpacing: "0.12em" }}>
          Your leagues
        </div>
        <div style={{ fontSize: 11, color: t.textSecondary, marginTop: 2 }}>
          Private seasons with friends.
        </div>
      </div>
      <button onClick={onNew}
        style={{ padding: "8px 14px", borderRadius: 0, border: "none", background: t.accent, color: "#fff", fontSize: 12, fontWeight: 700, letterSpacing: "0.03em", cursor: "pointer" }}>
        + New
      </button>
    </div>
  );
}

// ── LeagueRow ─────────────────────────────────────────────────────────────────
function LeagueRow({ t, league, authUser, onOpen, onRespond, toast, rowAnchor }) {
  var pending = league.my_status === "invited";
  var [busy, setBusy] = useState(false);

  async function handleAccept(e) {
    e.stopPropagation();
    setBusy(true);
    var r = await onRespond(league.id, true);
    setBusy(false);
    if (r && r.error) { (toast ? toast(r.error.message || "Could not accept.", "error") : window.alert("Could not accept.")); }
  }
  async function handleDecline(e) {
    e.stopPropagation();
    if (!window.confirm("Decline invitation to " + league.name + "?")) return;
    setBusy(true);
    var r = await onRespond(league.id, false);
    setBusy(false);
    if (r && r.error) { (toast ? toast(r.error.message || "Could not decline.", "error") : window.alert("Could not decline.")); }
  }

  // Status pill: pull both colour + label from the lifecycle helper so
  // any future status addition (e.g. paused) lands in one place.
  var pillTokens = lifecyclePillTokens(league.status);
  var statusColor = t[pillTokens.fg] || t.textTertiary;
  var statusLabel = LIFECYCLE_LABELS[league.status] || league.status;

  return (
    <div
      {...(rowAnchor || {})}
      onClick={pending ? undefined : onOpen}
      style={{
        background: t.bgCard,
        border: pending ? "2px solid " + t.orange : "1px solid " + t.border,
        borderRadius: 0, padding: "12px 14px", marginBottom: 8,
        cursor: pending ? "default" : "pointer",
        transition: "border-color 0.15s",
        // Past leagues get a subtle visual de-emphasis so the active
        // ones win the eye. Not so faded that they read as disabled.
        opacity: !pending && isPastLifecycle(league) ? 0.78 : 1,
      }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: t.text, letterSpacing: "-0.15px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {league.name}
            </div>
            <span style={{ fontSize: 9, fontWeight: 700, color: statusColor, textTransform: "uppercase", letterSpacing: "0.12em" }}>
              {statusLabel}
            </span>
          </div>
          {league.description && (
            <div style={{ fontSize: 11, color: t.textSecondary, marginBottom: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {league.description}
            </div>
          )}
          <div style={{ fontSize: 10.5, color: t.textTertiary, letterSpacing: "0.01em" }}>
            {formatMatchFormat(league.match_format)}
            {league.max_matches_per_opponent ? " · max " + league.max_matches_per_opponent + " vs each" : ""}
            {league.start_date || league.end_date
              ? " · " + [league.start_date, league.end_date].filter(Boolean).join(" → ")
              : ""}
          </div>
        </div>
        {!pending && (
          <div style={{ color: t.textTertiary, flexShrink: 0, display: "flex", alignItems: "center" }}>
            {/* chevron-right glyph to signal "tap to open" */}
            <svg width="16" height="16" viewBox="0 0 18 18" fill="none">
              <path d="M7 4l5 5-5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
        )}
      </div>

      {/* Pending-invite inline CTAs */}
      {pending && (
        <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
          <button onClick={handleAccept} disabled={busy}
            style={{ flex: 1, padding: "9px 10px", borderRadius: 0, border: "none", background: t.green, color: "#fff", fontSize: 12, fontWeight: 700, letterSpacing: "0.03em", cursor: "pointer", opacity: busy ? 0.6 : 1, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
            <span style={{ display: "flex", alignItems: "center" }}>{NAV_ICONS.check(13)}</span>
            Accept invite
          </button>
          <button onClick={handleDecline} disabled={busy}
            style={{ flex: 1, padding: "9px 10px", borderRadius: 0, border: "1px solid " + t.red, background: "transparent", color: t.red, fontSize: 12, fontWeight: 600, letterSpacing: "0.03em", cursor: "pointer", opacity: busy ? 0.6 : 1, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
            <span style={{ display: "flex", alignItems: "center" }}>{NAV_ICONS.x(13)}</span>
            Decline
          </button>
        </div>
      )}
    </div>
  );
}

function formatMatchFormat(mf) {
  if (mf === "one_set") return "One set";
  if (mf === "best_of_3") return "Best of 3";
  return mf;
}

// ── LeagueDetailView ──────────────────────────────────────────────────────────
//
// Editorial Tennis restyle (matches Log Match / Compete language).
//
// Visual language:
//   - cream paper background (ED_TOK.bg) with hairline section dividers
//   - JetBrains-Mono kicker above each section ("STANDINGS", "MEMBERS")
//   - Space Grotesk hero for the league name
//   - status + mode pills as full-radius capsules with mono labels
//   - action buttons: outlined pill, mono uppercase
//
// Out of scope (deferred to follow-up):
//   - LeagueNextOpponent + LeagueRivalryCallout still consume legacy
//     `t` tokens. They render visually OK on the cream surface because
//     they own their own card chrome, but a Phase-2 pass should swap
//     them to ED_TOK so typography stays cohesive.
//   - InviteMembersModal portal — modal chrome lives on a dark scrim
//     and reads fine; restyle later if the user calls it out.
function LeagueDetailView({
  t, authUser, league, detail, profileMap,
  onBack, onInvite, onRemove, onArchive, onComplete, onCancel, onVoid, onRespond,
  onLogMatchInLeague,
  friends, openProfile, toast,
  // Slice 4: viewer's match history + challenge composer for the
  // new retention surfaces (next opponent / rivalry callout).
  history, openChallenge,
}) {
  var [inviteOpen, setInviteOpen] = useState(false);
  // Module 12 Slice 2 — which lifecycle action the user has picked
  // from the 3-dot menu. null when the modal is closed; otherwise one
  // of 'complete' | 'archive' | 'cancel' | 'void'.
  var [lifecycleAction, setLifecycleAction] = useState(null);

  // The sticky chrome's center kicker swaps from "PRIVATE LEAGUE"
  // (when the big hero name is visible) to the league name itself
  // (once the hero has scrolled out of view). Same idea as the
  // global top mob nav's scroll-reveal title — the chrome always
  // tells you where you are.
  var [heroVisible, setHeroVisible] = useState(true);
  var heroRef = useRef(null);
  useEffect(function () {
    var node = heroRef.current;
    if (!node || typeof IntersectionObserver === "undefined") return;
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        // The hero counts as "visible" while ANY part of it is in
        // the viewport — once the bottom edge crosses the top of
        // the screen, swap the kicker. Threshold 0 + a small
        // negative top rootMargin nudges the swap so the kicker
        // lands when the title is genuinely gone, not the moment
        // it begins to leave.
        setHeroVisible(e.isIntersecting);
      });
    }, { threshold: 0, rootMargin: "-12px 0px 0px 0px" });
    io.observe(node);
    return function () { io.disconnect(); };
  }, []);

  var myMembership = (detail && detail.members || []).find(function (m) { return m.user_id === authUser.id; });
  var iAmOwner = !!myMembership && myMembership.role === "owner";

  // Map action key → handler. Each handler accepts (reason, note) so
  // the modal can pass them through. The hook refreshes the list +
  // detail on success, which flips the status pill and re-evaluates
  // the menu items automatically.
  function handlerForAction(actionKey) {
    if (actionKey === "complete") return function (r, n) { return onComplete(league.id, r, n); };
    if (actionKey === "archive")  return function (r, n) { return onArchive(league.id, r, n); };
    if (actionKey === "cancel")   return function (r, n) { return onCancel(league.id, r, n); };
    if (actionKey === "void")     return function (r, n) { return onVoid(league.id, r, n); };
    return function () { return Promise.resolve({ error: { message: "unknown lifecycle action" } }); };
  }

  // Status label sourced from the lifecycle util so any new status
  // value lands in one file. We map the legacy `t.*` token names the
  // util returns into editorial colours by status family — active /
  // past / cancelled — instead of the dark-mode palette.
  var statusLabel = LIFECYCLE_LABELS[league.status] || league.status;
  var statusBg, statusFg;
  if (league.status === "active") {
    statusBg = "rgba(58, 125, 68, 0.14)"; statusFg = ED_TOK.win;
  } else if (league.status === "completed" || league.status === "archived") {
    statusBg = ED_TOK.bg2; statusFg = ED_TOK.muted;
  } else if (league.status === "cancelled" || league.status === "voided") {
    statusBg = "rgba(195, 57, 43, 0.12)"; statusFg = ED_TOK.loss;
  } else {
    statusBg = ED_TOK.bg2; statusFg = ED_TOK.muted;
  }

  // Mode pill — casual = muted; ranked = clay accent.
  var mode = league.mode || "ranked";
  var modeBg = mode === "casual" ? ED_TOK.bg2 : "rgba(255, 45, 85, 0.10)";
  var modeFg = mode === "casual" ? ED_TOK.muted : ED_TOK.accent;

  // Compute action-row visibility once so the JSX stays flat.
  var iAmActive = myMembership && myMembership.status === "active";
  var otherActiveMemberIds = ((detail && detail.members) || [])
    .filter(function (m) { return m.status === "active" && m.user_id !== authUser.id; })
    .map(function (m) { return m.user_id; });
  var canLogHere = iAmActive && otherActiveMemberIds.length > 0 && !!onLogMatchInLeague;
  var showActionRow = isActive(league) && (iAmActive || iAmOwner) && (iAmOwner || canLogHere);

  return (
    <div style={{
      // Self-contained editorial surface — paint cream over whatever
      // the parent tab background is so the section doesn't have a
      // mismatched seam.
      background: ED_TOK.bg,
      color:      ED_TOK.ink,
      fontFamily: ED_TOK.sans,
      // Negative margin pulls past the parent tab's "16px 20px 100px"
      // padding so the cream surface can extend edge-to-edge inside
      // the 680px content column. The negative top swallows the
      // parent's 16px padding so the sticky bar can sit flush; the
      // lateral -20px goes edge-to-edge; we leave the parent's 100px
      // bottom padding intact and add our own internal 32px breathing
      // room at the bottom.
      margin:     "-16px -20px 0",
      padding:    "0 0 32px",
      minHeight:  "calc(100dvh - 64px)",
    }}>
      {/* Sticky chrome — round back chevron + mono kicker. Mirrors
          the EditorialScreen wrapper used by Compete / Profile. */}
      <div style={{
        display:        "flex",
        alignItems:     "center",
        justifyContent: "space-between",
        gap:            12,
        padding:        "16px 22px 12px",
        position:       "sticky",
        top:            "var(--cs-nav-h, 0px)",
        background:     ED_TOK.bg,
        borderBottom:   "1px solid " + ED_TOK.line,
        zIndex:         2,
      }}>
        <button
          onClick={onBack}
          aria-label="Back to leagues"
          style={{
            width:        32,
            height:       32,
            borderRadius: "50%",
            background:   "transparent",
            border:       "1px solid " + ED_TOK.line,
            color:        ED_TOK.ink,
            display:      "grid",
            placeItems:   "center",
            cursor:       "pointer",
          }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2"
            strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 18l-6-6 6-6"/>
          </svg>
        </button>
        {/* Center kicker — morphs from the editorial "PRIVATE LEAGUE"
            microlabel (while the hero name is on screen) into the
            league name (Space Grotesk, slightly larger) once the
            hero has scrolled out. Two stacked spans cross-fade so
            the swap reads smooth rather than snapping. */}
        <div style={{
          flex:        1,
          minWidth:    0,
          textAlign:   "center",
          position:    "relative",
          height:      18,
        }}>
          <span style={{
            position:      "absolute",
            inset:         0,
            display:       "block",
            fontFamily:    ED_TOK.mono,
            fontSize:      10.5,
            letterSpacing: "0.16em",
            textTransform: "uppercase",
            color:         ED_TOK.muted,
            fontWeight:    600,
            overflow:      "hidden",
            textOverflow:  "ellipsis",
            whiteSpace:    "nowrap",
            opacity:       heroVisible ? 1 : 0,
            transform:     heroVisible ? "translateY(0)" : "translateY(-4px)",
            transition:    "opacity 220ms ease, transform 220ms ease",
            pointerEvents: "none",
          }}>
            Private league
          </span>
          <span style={{
            position:      "absolute",
            inset:         0,
            display:       "block",
            fontFamily:    ED_TOK.display,
            fontSize:      15,
            fontWeight:    600,
            letterSpacing: "-0.02em",
            color:         ED_TOK.ink,
            overflow:      "hidden",
            textOverflow:  "ellipsis",
            whiteSpace:    "nowrap",
            lineHeight:    1.2,
            opacity:       heroVisible ? 0 : 1,
            transform:     heroVisible ? "translateY(4px)" : "translateY(0)",
            transition:    "opacity 220ms ease, transform 220ms ease",
            pointerEvents: "none",
          }}>
            {league.name}
          </span>
        </div>
        {/* Lifecycle 3-dot menu — owner only and only when at least
            one transition is permitted. The menu component handles
            its own visibility check. */}
        <div style={{ width: 32, display: "flex", justifyContent: "flex-end", color: ED_TOK.ink }}>
          <LeagueLifecycleMenu
            t={t}
            league={league}
            iAmOwner={iAmOwner}
            onPickAction={function (action) { setLifecycleAction(action); }}
          />
        </div>
      </div>

      {/* Hero name + status/mode pills */}
      <div style={{ padding: "26px 22px 8px" }}>
        <h1 ref={heroRef} style={{
          margin:        0,
          fontFamily:    ED_TOK.display,
          fontSize:      "clamp(34px, 9.5vw, 44px)",
          fontWeight:    500,
          letterSpacing: "-0.03em",
          lineHeight:    1.0,
          color:         ED_TOK.ink,
        }}>
          {league.name}
        </h1>
        {league.description && (
          <div style={{
            marginTop:  10,
            fontSize:   13.5,
            lineHeight: 1.5,
            color:      ED_TOK.ink2,
          }}>
            {league.description}
          </div>
        )}

        {/* Pill row — full-radius capsules in editorial typography. */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginTop: 14 }}>
          <EditorialPill bg={statusBg} fg={statusFg} label={statusLabel}/>
          <EditorialPill bg={modeBg}   fg={modeFg}   label={mode}/>
        </div>

        {/* Rules summary — mono microlabel + body line. */}
        <div style={{ marginTop: 18 }}>
          <MicroEyebrow label="Rules"/>
          <div style={{
            marginTop:  6,
            fontSize:   13,
            lineHeight: 1.55,
            color:      ED_TOK.ink2,
            letterSpacing: "0.005em",
          }}>
            {formatMatchFormat(league.match_format)}
            {" · "}{formatTiebreak(league.tiebreak_format)}
            {" · "}{league.win_points}pt win / {league.loss_points}pt loss
            {league.max_matches_per_opponent
              ? " · max " + league.max_matches_per_opponent + " vs each opponent"
              : " · unlimited matches"}
            {league.start_date || league.end_date
              ? " · " + [league.start_date, league.end_date].filter(Boolean).join(" → ")
              : ""}
          </div>
        </div>

        {/* Owner note — slim cream callout when populated. */}
        {league.status_note && league.status !== "active" && (
          <div style={{
            marginTop:  14,
            padding:    "10px 12px",
            background: ED_TOK.bg2,
            border:     "1px solid " + ED_TOK.line,
            borderRadius: 10,
            fontSize:   12.5,
            color:      ED_TOK.ink2,
            lineHeight: 1.5,
          }}>
            <MicroEyebrow label="Owner note"/>
            <div style={{ marginTop: 4 }}>{league.status_note}</div>
          </div>
        )}

        {/* Action row — Invite + Log match (visibility computed above). */}
        {showActionRow && (
          <div style={{ display: "flex", gap: 8, marginTop: 18, flexWrap: "wrap" }}>
            {iAmOwner && (
              <EditorialPillButton onClick={function () { setInviteOpen(true); }}>
                + Invite member
              </EditorialPillButton>
            )}
            {canLogHere && (
              <EditorialPillButton onClick={function () { onLogMatchInLeague(league, otherActiveMemberIds); }}>
                + Log match
              </EditorialPillButton>
            )}
          </div>
        )}
      </div>

      {/* Slice 4 retention surface — closest H2H rivalry within league.
          Kept on legacy `t` tokens (its own component owns the card
          chrome). The Next-opponent card was removed per design ask:
          the same intent now reads better as a "Challenge" pill in
          each opponent's member row. */}
      <div style={{ padding: "26px 22px 0" }}>
        <LeagueRivalryCallout
          t={t}
          authUser={authUser}
          league={league}
          profileMap={profileMap}
          history={history}
          openChallenge={openChallenge}
        />
      </div>

      {/* Standings — section separation now comes from the eyebrow
          spacing alone; the full-bleed hairlines that used to sit
          above/below were removed per design ask. */}
      <div style={{ padding: "8px 22px 0" }}>
        <StandingsTable league={league} detail={detail} profileMap={profileMap} openProfile={openProfile} />
      </div>

      {/* Members */}
      <div style={{ padding: "26px 22px 0" }}>
        <MembersList
          authUser={authUser}
          detail={detail} profileMap={profileMap}
          iAmOwner={iAmOwner} leagueId={league.id}
          onRemove={onRemove}
          openProfile={openProfile}
          openChallenge={openChallenge}
          toast={toast}
        />
      </div>

      {/* Recent activity */}
      <div style={{ padding: "26px 22px 8px" }}>
        <RecentActivityList detail={detail} profileMap={profileMap} />
      </div>

      {/* Invite modal — kept on legacy `t` palette (modal portal to
          body, sits on dark scrim). Restyle is a follow-up. */}
      {inviteOpen && (
        <InviteMembersModal
          t={t}
          league={league}
          detail={detail}
          friends={friends || []}
          onClose={function () { setInviteOpen(false); }}
          onInvite={onInvite}
          toast={toast}
        />
      )}

      {/* Lifecycle modal — shared shape across complete / archive /
          cancel / void. Mounted only while an action is selected. */}
      {lifecycleAction && (
        <LeagueLifecycleModal
          t={t}
          league={league}
          action={lifecycleAction}
          onConfirm={handlerForAction(lifecycleAction)}
          onClose={function () { setLifecycleAction(null); }}
          toast={toast}
        />
      )}
    </div>
  );
}

// ── Editorial helpers (local to the league detail view) ─────────
function MicroEyebrow({ label }) {
  return (
    <div style={{
      fontFamily:    ED_TOK.mono,
      fontSize:      10,
      fontWeight:    700,
      letterSpacing: "0.16em",
      textTransform: "uppercase",
      color:         ED_TOK.muted,
    }}>
      {label}
    </div>
  );
}

function EditorialDivider() {
  return (
    <div style={{
      height:     1,
      background: ED_TOK.line,
      margin:     "26px 0",
    }}/>
  );
}

function EditorialPill({ bg, fg, label }) {
  return (
    <span style={{
      display:       "inline-flex",
      alignItems:    "center",
      padding:       "4px 10px",
      borderRadius:  999,
      background:    bg,
      color:         fg,
      fontFamily:    ED_TOK.mono,
      fontSize:      9.5,
      fontWeight:    700,
      letterSpacing: "0.14em",
      textTransform: "uppercase",
    }}>
      {label}
    </span>
  );
}

function EditorialPillButton({ onClick, children }) {
  var [hover, setHover] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={function () { setHover(true); }}
      onMouseLeave={function () { setHover(false); }}
      style={{
        padding:       "9px 16px",
        borderRadius:  999,
        border:        "1px solid " + ED_TOK.lineStrong,
        background:    hover ? ED_TOK.bg2 : "transparent",
        color:         ED_TOK.ink,
        fontFamily:    ED_TOK.mono,
        fontSize:      10.5,
        fontWeight:    700,
        letterSpacing: "0.14em",
        textTransform: "uppercase",
        cursor:        "pointer",
        transition:    "background 140ms ease",
      }}>
      {children}
    </button>
  );
}

function formatTiebreak(tb) {
  if (tb === "super_tiebreak_final") return "super tiebreak final";
  return "standard tiebreak";
}

// ── StandingsTable ────────────────────────────────────────────────────────────
// Slice 4: derive points earned per user in the last 7 days from the
// recent-matches strip we already load for this league. Not a true
// "rank delta" (that would need a snapshot table — see open question
// #2 in design-direction.md), but it answers the design intent
// "who climbed/dropped" by surfacing this-week movement. Falls back
// to {} when the league hasn't loaded recent yet.
function weeklyPointsByUser(recent, league) {
  var out = {};
  if (!recent || !league) return out;
  var winPts  = league.win_points  != null ? league.win_points  : 3;
  var lossPts = league.loss_points != null ? league.loss_points : 0;
  var oneWeekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  recent.forEach(function (m) {
    if (m.status !== "confirmed") return;
    var ts = m.confirmed_at ? new Date(m.confirmed_at).getTime() : 0;
    if (ts < oneWeekAgo) return;
    var submitterWon = m.result === "win";
    var winnerId = submitterWon ? m.user_id : m.opponent_id;
    var loserId  = submitterWon ? m.opponent_id : m.user_id;
    if (winnerId) out[winnerId] = (out[winnerId] || 0) + winPts;
    if (loserId)  out[loserId]  = (out[loserId]  || 0) + lossPts;
  });
  return out;
}

function StandingsTable({ league, detail, profileMap, openProfile }) {
  var rows = detail && detail.standings || [];
  var recent = detail && detail.recent || [];
  var weekly = weeklyPointsByUser(recent, league);
  // Flat-table grid (Ligue-1 style): rank, player, MP, W-L, SD, PTS.
  // No outer card; just hairlines between rows. Generous vertical
  // padding so the editorial type can breathe.
  var GRID = "28px 1fr 36px 48px 40px 44px";
  return (
    <div style={{ marginBottom: 6 }}>
      <MicroEyebrow label="Standings"/>
      <div style={{ marginTop: 14 }}>
        {/* Header row */}
        <div style={{
          display:             "grid",
          gridTemplateColumns: GRID,
          gap:                 6,
          padding:             "0 4px 10px",
          borderBottom:        "1px solid " + ED_TOK.line,
          fontFamily:          ED_TOK.mono,
          fontSize:            10,
          fontWeight:          700,
          color:               ED_TOK.muted,
          textTransform:       "uppercase",
          letterSpacing:       "0.14em",
        }}>
          <span>#</span>
          <span>Player</span>
          <span style={{ textAlign: "center" }}>MP</span>
          <span style={{ textAlign: "center" }}>W-L</span>
          <span style={{ textAlign: "center" }}>SD</span>
          <span style={{ textAlign: "right" }}>PTS</span>
        </div>
        {rows.length === 0 && (
          <div style={{
            padding:    "26px 4px",
            fontSize:   13,
            color:      ED_TOK.muted,
            textAlign:  "center",
            fontFamily: ED_TOK.sans,
            borderBottom: "1px solid " + ED_TOK.line,
          }}>
            No confirmed matches yet. Log one to kick things off.
          </div>
        )}
        {rows.map(function (row) {
          var p = profileMap[row.user_id] || { id: row.user_id, name: "Player" };
          var clickable = !!openProfile;
          var sd = row.set_difference;
          var sdColor = sd > 0 ? ED_TOK.win : sd < 0 ? ED_TOK.loss : ED_TOK.muted;
          return (
            <div key={row.user_id}
              onClick={clickable ? function () { openProfile(p.id); } : undefined}
              style={{
                display:             "grid",
                gridTemplateColumns: GRID,
                gap:                 6,
                alignItems:          "center",
                padding:             "16px 4px",
                borderBottom:        "1px solid " + ED_TOK.line,
                cursor:              clickable ? "pointer" : "default",
                fontSize:            14,
                color:               ED_TOK.ink,
                fontFamily:          ED_TOK.sans,
              }}>
              <span style={{
                fontFamily:        ED_TOK.mono,
                fontSize:          13,
                fontWeight:        500,
                color:             row.rank <= 3 ? ED_TOK.accent : ED_TOK.muted,
                fontVariantNumeric:"tabular-nums",
              }}>
                {row.rank || "—"}
              </span>
              <span style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                <PlayerAvatar name={p.name} avatar={p.avatar} profile={p} size={26}/>
                <span style={{
                  fontWeight:    600,
                  overflow:      "hidden",
                  textOverflow:  "ellipsis",
                  whiteSpace:    "nowrap",
                  minWidth:      0,
                  letterSpacing: "-0.01em",
                }}>
                  {p.name}
                </span>
                {weekly[row.user_id] > 0 && (
                  <span
                    title={"+" + weekly[row.user_id] + " league points this week"}
                    style={{
                      flexShrink:        0,
                      fontFamily:        ED_TOK.mono,
                      fontSize:          9,
                      fontWeight:        700,
                      color:             ED_TOK.win,
                      background:        "rgba(58, 125, 68, 0.12)",
                      borderRadius:      999,
                      padding:           "2px 6px",
                      letterSpacing:     "0.06em",
                      fontVariantNumeric:"tabular-nums",
                    }}>
                    +{weekly[row.user_id]}
                  </span>
                )}
              </span>
              <span style={{ textAlign: "center", fontVariantNumeric: "tabular-nums", color: ED_TOK.ink2 }}>{row.played}</span>
              <span style={{ textAlign: "center", fontVariantNumeric: "tabular-nums" }}>
                <span style={{ color: ED_TOK.win }}>{row.wins}</span>
                <span style={{ color: ED_TOK.muted, margin: "0 2px" }}>–</span>
                <span style={{ color: ED_TOK.loss }}>{row.losses}</span>
              </span>
              <span style={{ textAlign: "center", fontVariantNumeric: "tabular-nums", color: sdColor }}>
                {sd > 0 ? "+" : ""}{sd}
              </span>
              <span style={{
                textAlign:         "right",
                fontVariantNumeric:"tabular-nums",
                fontWeight:        700,
                color:             ED_TOK.ink,
                fontFamily:        ED_TOK.display,
                fontSize:          16,
                letterSpacing:     "-0.01em",
              }}>
                {row.points}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── MembersList ──────────────────────────────────────────────────────────────
//
// Flat-table layout (no boxed card). Header row is a clickable
// "Members · N" / chevron toggle that collapses the body — same
// affordance Standings doesn't get because Standings is the primary
// reason to be on this screen.
//
// Each non-viewer active member row carries a "Challenge" pill that
// opens the existing challenge composer prefilled with that opponent.
// (The dedicated "Next opponent" retention card was removed in favour
// of this — same intent, surfaced inline against every opponent.)
function MembersList({ authUser, detail, profileMap, iAmOwner, leagueId, onRemove, openProfile, openChallenge, toast }) {
  var rows = detail && detail.members || [];
  var active  = rows.filter(function (m) { return m.status === "active"; });
  var invited = rows.filter(function (m) { return m.status === "invited"; });
  var declined = rows.filter(function (m) { return m.status === "declined" || m.status === "removed"; });

  // Default expanded so info is visible on first paint; the toggle
  // lets the user collapse once they've scanned the roster.
  var [open, setOpen] = useState(true);

  function report(msg) { if (toast) toast(msg, "error"); else window.alert(msg); }

  async function handleRemove(userId, name) {
    if (!window.confirm("Remove " + (name || "this member") + " from the league?")) return;
    var r = await onRemove(leagueId, userId);
    if (r && r.error) report(r.error.message || "Could not remove.");
  }

  function Row({ m, showRemove, first }) {
    var p = profileMap[m.user_id] || { id: m.user_id, name: "Player" };
    var isSelf = m.user_id === authUser.id;
    var canChallenge = !!openChallenge && !isSelf && m.status === "active";
    return (
      <div style={{
        display:      "flex",
        alignItems:   "center",
        gap:          12,
        padding:      "16px 4px",
        borderBottom: "1px solid " + ED_TOK.line,
        borderTop:    first ? "1px solid " + ED_TOK.line : "none",
      }}>
        <div onClick={openProfile ? function () { openProfile(p.id); } : undefined}
          style={{ cursor: openProfile ? "pointer" : "default", flexShrink: 0 }}>
          <PlayerAvatar name={p.name} avatar={p.avatar} profile={p} size={32}/>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            display:       "flex",
            alignItems:    "center",
            gap:           8,
            fontSize:      14.5,
            fontWeight:    600,
            color:         ED_TOK.ink,
            overflow:      "hidden",
            textOverflow:  "ellipsis",
            whiteSpace:    "nowrap",
            letterSpacing: "-0.01em",
          }}>
            <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{p.name}</span>
            {m.role === "owner" && (
              <span style={{
                fontFamily:    ED_TOK.mono,
                fontSize:      9,
                color:         ED_TOK.accent,
                fontWeight:    700,
                letterSpacing: "0.14em",
                textTransform: "uppercase",
              }}>
                Owner
              </span>
            )}
            {isSelf && (
              <span style={{
                fontFamily:    ED_TOK.mono,
                fontSize:      9,
                color:         ED_TOK.muted,
                fontWeight:    700,
                letterSpacing: "0.14em",
                textTransform: "uppercase",
              }}>
                You
              </span>
            )}
          </div>
          {m.status !== "active" && (
            <div style={{
              fontFamily:    ED_TOK.mono,
              fontSize:      10,
              color:         ED_TOK.muted,
              marginTop:     3,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
            }}>
              {m.status}
            </div>
          )}
        </div>
        {/* Challenge pill — every active opponent gets one. Sits to
            the left of the (owner-only) remove button. The challenge
            composer (App.jsx → openChallenge) expects a profile-shape
            object + a source tag for telemetry. */}
        {canChallenge && (
          <ChallengePill onClick={function () {
            openChallenge(
              Object.assign(
                { id: p.id, name: p.name, suburb: p.suburb || "", skill: p.skill || "" },
                p
              ),
              "league_member_row"
            );
          }}/>
        )}
        {showRemove && m.role !== "owner" && !isSelf && (
          <button onClick={function () { handleRemove(m.user_id, p.name); }}
            style={{
              width:        28,
              height:       28,
              borderRadius: "50%",
              background:   "transparent",
              border:       "1px solid " + ED_TOK.line,
              color:        ED_TOK.muted,
              cursor:       "pointer",
              display:      "grid",
              placeItems:   "center",
              flexShrink:   0,
            }}
            title="Remove member">
            <svg width="12" height="12" viewBox="0 0 18 18" fill="none">
              <path d="M4 4l10 10M14 4L4 14" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"/>
            </svg>
          </button>
        )}
      </div>
    );
  }

  // Sub-section eyebrow (Invited / Inactive) — flat label, sits in
  // the row flow with a hairline above.
  function GroupHead({ label, count }) {
    return (
      <div style={{
        padding:       "16px 4px 8px",
        fontFamily:    ED_TOK.mono,
        fontSize:      10,
        fontWeight:    700,
        color:         ED_TOK.muted,
        textTransform: "uppercase",
        letterSpacing: "0.14em",
      }}>
        {label} · {count}
      </div>
    );
  }

  return (
    <div style={{ marginBottom: 6 }}>
      {/* Clickable header — eyebrow + count + chevron. */}
      <button
        type="button"
        onClick={function () { setOpen(function (v) { return !v; }); }}
        style={{
          display:        "flex",
          alignItems:     "center",
          justifyContent: "space-between",
          width:          "100%",
          padding:        "0",
          background:     "transparent",
          border:         "none",
          color:          ED_TOK.ink,
          cursor:         "pointer",
          fontFamily:     "inherit",
        }}
        aria-expanded={open}>
        <span style={{
          fontFamily:    ED_TOK.mono,
          fontSize:      10.5,
          fontWeight:    700,
          letterSpacing: "0.16em",
          textTransform: "uppercase",
          color:         ED_TOK.muted,
        }}>
          Members · {active.length}
        </span>
        <span style={{
          width:        24,
          height:       24,
          display:      "grid",
          placeItems:   "center",
          color:        ED_TOK.muted,
          transform:    open ? "rotate(180deg)" : "rotate(0deg)",
          transition:   "transform 180ms ease",
        }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2"
            strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 9l6 6 6-6"/>
          </svg>
        </span>
      </button>

      {open && (
        <div style={{ marginTop: 8 }}>
          {active.map(function (m, i) {
            return <Row key={m.id} m={m} showRemove={iAmOwner} first={i === 0}/>;
          })}
          {invited.length > 0 && (
            <>
              <GroupHead label="Invited" count={invited.length}/>
              {invited.map(function (m, i) {
                return <Row key={m.id} m={m} showRemove={false} first={i === 0}/>;
              })}
            </>
          )}
          {declined.length > 0 && iAmOwner && (
            <>
              <GroupHead label="Inactive" count={declined.length}/>
              {declined.map(function (m, i) {
                return <Row key={m.id} m={m} showRemove={false} first={i === 0}/>;
              })}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// Challenge pill — small outlined capsule, mono uppercase. Used in
// every active member row (except the viewer's own row).
function ChallengePill({ onClick }) {
  var [hover, setHover] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={function () { setHover(true); }}
      onMouseLeave={function () { setHover(false); }}
      style={{
        flexShrink:    0,
        padding:       "6px 11px",
        borderRadius:  999,
        border:        "1px solid " + ED_TOK.lineStrong,
        background:    hover ? ED_TOK.ink : "transparent",
        color:         hover ? ED_TOK.bg : ED_TOK.ink,
        fontFamily:    ED_TOK.mono,
        fontSize:      9.5,
        fontWeight:    700,
        letterSpacing: "0.14em",
        textTransform: "uppercase",
        cursor:        "pointer",
        transition:    "background 140ms ease, color 140ms ease",
      }}>
      Challenge
    </button>
  );
}

// ── RecentActivityList ───────────────────────────────────────────────────────
function RecentActivityList({ detail, profileMap }) {
  var rows = detail && detail.recent || [];
  if (!rows.length) return null;

  return (
    <div style={{ marginBottom: 6 }}>
      <MicroEyebrow label="Recent activity"/>
      <div style={{ marginTop: 14 }}>
        {rows.map(function (m, i) {
          var submitter = profileMap[m.user_id] || { name: "Player" };
          var opponent  = profileMap[m.opponent_id] || { name: m.opp_name || "Player" };
          var submitterWon = m.result === "win";
          var winner = submitterWon ? submitter : opponent;
          var loser  = submitterWon ? opponent  : submitter;
          var score = (m.sets || []).map(function (s) { return s.you + "-" + s.them; }).join("  ");
          var dateStr = m.confirmed_at ? new Date(m.confirmed_at).toLocaleDateString("en-AU", { day: "numeric", month: "short" }) : "";
          return (
            <div key={m.id} style={{
              display:      "flex",
              alignItems:   "center",
              gap:          12,
              padding:      "16px 4px",
              borderBottom: "1px solid " + ED_TOK.line,
              borderTop:    i === 0 ? "1px solid " + ED_TOK.line : "none",
            }}>
              <div style={{ flex: 1, minWidth: 0, fontSize: 14, color: ED_TOK.ink, lineHeight: 1.4 }}>
                <span style={{ fontWeight: 700, letterSpacing: "-0.01em" }}>{winner.name}</span>
                <span style={{ color: ED_TOK.muted, fontWeight: 400 }}> def. </span>
                <span style={{ letterSpacing: "-0.01em" }}>{loser.name}</span>
                <span style={{
                  color:             ED_TOK.muted,
                  fontFamily:        ED_TOK.mono,
                  fontWeight:        500,
                  marginLeft:        8,
                  fontVariantNumeric:"tabular-nums",
                  fontSize:          12.5,
                }}>{score}</span>
              </div>
              <span style={{
                fontFamily:    ED_TOK.mono,
                fontSize:      10.5,
                color:         ED_TOK.muted,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                flexShrink:    0,
              }}>{dateStr}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── InviteMembersModal — friends-first picker ────────────────────────────────
function InviteMembersModal({ t, league, detail, friends, onClose, onInvite, toast }) {
  var existingMemberIds = useMemo(function () {
    var set = new Set();
    (detail && detail.members || []).forEach(function (m) { set.add(m.user_id); });
    return set;
  }, [detail]);

  var [busy, setBusy]       = useState({});
  var [invited, setInvited] = useState({}); // local echo

  var eligible = (friends || []).filter(function (f) {
    return !existingMemberIds.has(f.id) && !invited[f.id];
  });

  async function handleInvite(friend) {
    setBusy(function (b) { var n = Object.assign({}, b); n[friend.id] = true; return n; });
    var r = await onInvite(league.id, friend.id);
    setBusy(function (b) { var n = Object.assign({}, b); delete n[friend.id]; return n; });
    if (r && r.error) {
      (toast ? toast((r.error && r.error.message) || "Could not send invite.", "error") : window.alert("Could not send invite."));
      return;
    }
    setInvited(function (v) { var n = Object.assign({}, v); n[friend.id] = true; return n; });
  }

  // Same portal fix as CreateLeagueModal — the People tab wraps its content
  // in a .fade-up div whose transform creates a CSS containing block that
  // breaks position:fixed children. Portaling out escapes that.
  return createPortal((
    <div
      onClick={onClose}
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200, padding: "0 16px" }}>
      <div
        onClick={function (e) { e.stopPropagation(); }}
        className="pop"
        style={{ background: t.modalBg, border: "1px solid " + t.border, borderRadius: 16, padding: "20px 20px 22px", width: "100%", maxWidth: 460, maxHeight: "80vh", overflowY: "auto", boxShadow: "0 20px 50px rgba(0,0,0,0.35)" }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, color: t.text, marginBottom: 4, letterSpacing: "-0.2px" }}>
          Invite to {league.name}
        </h2>
        <p style={{ fontSize: 12, color: t.textSecondary, marginBottom: 14 }}>
          Invites are private. Invitees get a notification and choose whether to join.
        </p>

        {eligible.length === 0 && (
          <div style={{ padding: "20px 14px", fontSize: 12, color: t.textTertiary, textAlign: "center" }}>
            {friends && friends.length === 0
              ? "Add friends first — then you can invite them to a league."
              : "All your friends are already in this league."}
          </div>
        )}

        {eligible.map(function (f) {
          return (
            <div key={f.id} style={{
              display: "flex", alignItems: "center", gap: 10,
              padding: "10px 12px", borderTop: "1px solid " + t.border,
            }}>
              <PlayerAvatar name={f.name} avatar={f.avatar} profile={f} size={32}/>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: t.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.name}</div>
                {(f.suburb || f.skill) && (
                  <div style={{ fontSize: 10.5, color: t.textTertiary, marginTop: 1 }}>
                    {[f.suburb, f.skill].filter(Boolean).join(" · ")}
                  </div>
                )}
              </div>
              <button
                onClick={function () { handleInvite(f); }}
                disabled={!!busy[f.id]}
                style={{ padding: "7px 12px", borderRadius: 0, border: "none", background: t.accent, color: "#fff", fontSize: 11, fontWeight: 700, letterSpacing: "0.03em", textTransform: "uppercase", cursor: "pointer", opacity: busy[f.id] ? 0.6 : 1 }}>
                {busy[f.id] ? "…" : "Invite"}
              </button>
            </div>
          );
        })}

        <div style={{ marginTop: 16, textAlign: "right" }}>
          <button onClick={onClose}
            style={{ padding: "8px 14px", borderRadius: 8, border: "1px solid " + t.border, background: "transparent", color: t.text, fontSize: 12, fontWeight: 500, cursor: "pointer" }}>
            Done
          </button>
        </div>
      </div>
    </div>
  ), document.body);
}
