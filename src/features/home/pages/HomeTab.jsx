// src/features/home/pages/HomeTab.jsx
import { useState, useMemo } from "react";
import { supabase } from "../../../lib/supabase.js";
import { avColor } from "../../../lib/utils/avatar.js";
import { track } from "../../../lib/analytics.js";
import { NAV_ICONS } from "../../../lib/constants/navIcons.jsx";
import PlayerAvatar from "../../../components/ui/PlayerAvatar.jsx";
import FeedInteractionsModal from "../components/FeedInteractionsModal.jsx";
import HomeHero from "../components/HomeHero.jsx";
import HomeNextAction from "../components/HomeNextAction.jsx";
import HomeWeekStrip from "../components/HomeWeekStrip.jsx";
import HomeLeagueBand from "../components/HomeLeagueBand.jsx";
import HomeActivityList from "../components/HomeActivityList.jsx";
import { useDeepLinkHighlight } from "../../../lib/utils/deepLink.js";
import { formatMatchScore } from "../../scoring/utils/tennisScoreValidation.js";

var REASON_LABELS = {
  wrong_score:   "Score is wrong",
  wrong_winner:  "Winner is wrong",
  wrong_date:    "Date is wrong",
  wrong_venue:   "Venue or court is wrong",
  not_my_match:  "Didn't play this match",
  other:         "Other",
};

// ── Feed icon set (line-art, matches navIcons.jsx style) ────────────────────
// All 18×18, stroke="currentColor", stroke-width 1.5 — so they follow the
// parent button's color state (default = textSecondary, active = accent).
var ICONS = {
  tennisBall: function (size) {
    var s = size || 18;
    // Circle + the two characteristic tennis-ball seam curves.
    return (
      <svg width={s} height={s} viewBox="0 0 18 18" fill="none">
        <circle cx="9" cy="9" r="6.5" stroke="currentColor" strokeWidth="1.5"/>
        <path d="M3 6.5c2.5 1 4 3 4 5.5s-1.5 4.5-4 5.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none" transform="translate(0 -3.5)"/>
        <path d="M15 6.5c-2.5 1-4 3-4 5.5s1.5 4.5 4 5.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none" transform="translate(0 -3.5)"/>
      </svg>
    );
  },
  like: function (size) {
    var s = size || 18;
    // Thumb-up outline.
    return (
      <svg width={s} height={s} viewBox="0 0 18 18" fill="none">
        <path d="M6 8.5V15h7.2a1.5 1.5 0 0 0 1.48-1.24l.84-4.76A1.5 1.5 0 0 0 14.04 7.5H10.5V4.5a1.5 1.5 0 0 0-2.94-.43L6 8.5z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
        <path d="M6 8.5v6.5H3.5a1 1 0 0 1-1-1v-5a1 1 0 0 1 1-1H6z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
      </svg>
    );
  },
  likeFilled: function (size) {
    var s = size || 18;
    return (
      <svg width={s} height={s} viewBox="0 0 18 18" fill="none">
        <path d="M6 8.5V15h7.2a1.5 1.5 0 0 0 1.48-1.24l.84-4.76A1.5 1.5 0 0 0 14.04 7.5H10.5V4.5a1.5 1.5 0 0 0-2.94-.43L6 8.5z" fill="currentColor"/>
        <path d="M6 8.5v6.5H3.5a1 1 0 0 1-1-1v-5a1 1 0 0 1 1-1H6z" fill="currentColor"/>
      </svg>
    );
  },
  comment: function (size) {
    var s = size || 18;
    return (
      <svg width={s} height={s} viewBox="0 0 18 18" fill="none">
        <path d="M15.5 9.5c0 3-2.686 5.5-6 5.5a6.9 6.9 0 0 1-2.5-.466L3 15.5l.966-3.5A5.9 5.9 0 0 1 3 9.5c0-3 2.686-5.5 6-5.5s6.5 2.5 6.5 5.5z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
      </svg>
    );
  },
  rematch: function (size) {
    var s = size || 18;
    // Loop / repeat arrow.
    return (
      <svg width={s} height={s} viewBox="0 0 18 18" fill="none">
        <path d="M3 9a6 6 0 0 1 10.5-3.95L15 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M15 3.5V7h-3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M15 9a6 6 0 0 1-10.5 3.95L3 14.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M3 14.5V11h3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    );
  },
  share: function (size) {
    var s = size || 18;
    return (
      <svg width={s} height={s} viewBox="0 0 18 18" fill="none">
        <path d="M7 3h-3a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M9 9l6-6M10 3h5v5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    );
  },
};

// ── IconButton (Strava-style compact footer action, sidebar-style chrome) ───
// Transparent by default, colour follows state. No box-fill — mirrors the
// left sidebar's nav-item idle state. Children are a callable SVG (one of
// ICONS above) so color flows through via currentColor.
function IconButton({ t, title, onClick, active, children }) {
  var [hover, setHover] = useState(false);
  var color = active ? t.accent : hover ? t.text : t.textSecondary;
  return (
    <button
      title={title}
      onClick={onClick}
      onMouseEnter={function () { setHover(true); }}
      onMouseLeave={function () { setHover(false); }}
      style={{
        width: 32, height: 32,
        border: "none", background: "transparent",
        display: "flex", alignItems: "center", justifyContent: "center",
        color: color, cursor: "pointer",
        transition: "color 0.13s",
        padding: 0,
      }}>
      {children}
    </button>
  );
}

// ── FeedCard ──────────────────────────────────────────────────────────────────
function FeedCard({
  m, isOwn, pName, pAvatar, pAvatarUrl, oppAvatarUrl, demo, onDelete, onRemove, leaguesIndex, onOpenLeague,
  t, authUser, feedLikes, feedLikeCounts, feedComments,
  setFeedLikes, setFeedLikeCounts, setCommentModal, setCommentDraft,
  setDisputeModal, setDisputeDraft,
  confirmOpponentMatch, acceptCorrection, voidMatchAction,
  openProfile, openChallenge, toast,
  // Module — FeedInteractionsModal trigger.
  onOpenInteractions,
  // Deep-link anchor: { ref, className } from useDeepLinkHighlight.rowProps.
  // Spread onto the outer card div so scroll-to + pulse target this row.
  rowAnchor,
  // Slice 5 — set of user_ids the viewer has played ≥5 confirmed
  // matches against. Used to render a subtle "Rivalry" pill when
  // this match is between the viewer and a rival.
  viewerRivalsSet,
}) {
  // Identity resolvers — who is the "poster" and who is the "opponent"
  // for profile-link wiring. Three cases:
  //   own         — viewer logged it.        poster=viewer, opp=opponent_id
  //   tagged      — viewer is the opponent.  poster=submitter, opp=viewer
  //   third-party — viewer in neither side.  poster=submitter, opp=opponent_id
  var posterUserId, opponentUserId;
  if (m.isThirdParty) {
    posterUserId   = m.submitterId || null;
    opponentUserId = m.opponent_id || null;
  } else if (m.isTagged) {
    posterUserId   = m.submitterId || null;
    opponentUserId = (authUser && authUser.id) || null;
  } else {
    posterUserId   = (authUser && authUser.id) || null;
    opponentUserId = m.opponent_id || null;
  }
  function goPoster()   { if (openProfile && posterUserId)   openProfile(posterUserId); }
  function goOpponent() { if (openProfile && opponentUserId) openProfile(opponentUserId); }
  var posterClickable   = !demo && !!posterUserId   && (!authUser || posterUserId   !== authUser.id) && !!openProfile;
  var opponentClickable = !demo && !!opponentUserId && (!authUser || opponentUserId !== authUser.id) && !!openProfile;
  // Centralised through formatMatchScore so 7-6 sets render with their
  // tiebreak suffix ("7-6 (7-4)") in the proposal-changed line + share
  // text. The double-space separator we used to use becomes a comma.
  var scoreStr   = formatMatchScore(m.sets || []);
  var liked      = !!feedLikes[m.id];
  var likeCount  = feedLikeCounts[m.id] || 0;
  var comments   = feedComments[m.id] || [];

  var status         = m.status || "confirmed";
  var isExpired      = status === "expired";
  var isPending      = status === "pending_confirmation";
  var isDisputed     = status === "disputed";
  var isPendingReconf = status === "pending_reconfirmation";
  var isVoided       = status === "voided";
  var isConfirmed    = status === "confirmed";
  // Module 9: row is awaiting an opponent invite claim. Treat similar
  // to pending_confirmation visually but with a distinct "AWAITING
  // OPPONENT" badge — the user knows the next step is "share the link",
  // not "wait for them to confirm".
  var isAwaitingClaim = status === "pending_opponent_claim";
  var isOpponentView = isPending && m.isTagged;
  var isInDispute    = isDisputed || isPendingReconf;
  var needsMyAction  = isInDispute && authUser && m.pendingActionBy === authUser.id;
  var waitingForOther = isInDispute && authUser && m.pendingActionBy && m.pendingActionBy !== authUser.id;
  var cardOpacity    = (isExpired || isVoided) ? 0.5 : 1;

  function timeRemaining(expiresAt) {
    if (!expiresAt) return null;
    var ms = new Date(expiresAt) - Date.now();
    if (ms <= 0) return null;
    var h = Math.floor(ms / 3600000);
    if (h >= 48) return Math.floor(h / 24) + "d left";
    if (h >= 1) return h + "h left";
    return "<1h left";
  }

  function openDisputeModal(mode) {
    var prefill = mode === "counter" && m.currentProposal;
    setDisputeDraft({
      reasonCode: "",
      reasonDetail: "",
      sets: prefill
        ? m.currentProposal.sets.map(function(s) { return Object.assign({}, s); })
        : m.sets && m.sets.length ? m.sets.map(function(s) { return Object.assign({}, s); }) : [{ you: "", them: "" }],
      result: prefill ? m.currentProposal.result : m.result,
      date:   prefill ? m.currentProposal.match_date : m.rawDate || "",
      venue:  prefill ? m.currentProposal.venue : m.venue || "",
      court:  prefill ? m.currentProposal.court : m.court || "",
    });
    setDisputeModal({ match: m, mode });
  }

  function proposalScoreStr() {
    if (!m.currentProposal || !m.currentProposal.sets) return "";
    return formatMatchScore(m.currentProposal.sets);
  }
  function changed(field) {
    if (!m.currentProposal) return false;
    if (field === "result") return m.result !== m.currentProposal.result;
    if (field === "sets")   return scoreStr !== proposalScoreStr();
    if (field === "date")   return m.rawDate !== m.currentProposal.match_date;
    if (field === "venue")  return (m.venue || "") !== (m.currentProposal.venue || "");
    if (field === "court")  return (m.court || "") !== (m.currentProposal.court || "");
    return false;
  }
  function chStyle(field) {
    return changed(field) ? { color: t.orange, fontWeight: 700 } : { color: t.text };
  }

  // ── Strava-style composition helpers ──────────────────────────────────
  // Compute set-level win counts ONCE here so we can reuse for:
  //   (a) the stats strip's "Sets" value
  //   (b) the scoreboard's winner-row derivation (existing logic)
  //   (c) the RESULT / border / share-text self-heal below
  //
  // Critical: skip sets with a blank OR non-numeric score on EITHER side.
  // `Number("") === 0` (not NaN!) so a naive `Number().isNaN` check counts
  // a "6-" incomplete set as a 6-0 win, which completely messes up the
  // derived winner on retirement / in-progress matches. Matches the
  // server-side NULLIF('') behaviour in recalculate_league_standings.
  var setWinCounts = (function () {
    var sets = m.sets || [];
    var ys = 0, ts = 0;
    // Track partial-fill counts too — used by the self-heal heuristic
    // below to detect "stored result contradicts visible scores".
    var ySides = 0, tSides = 0;
    sets.forEach(function (s) {
      var yStr = s.you == null ? "" : String(s.you).trim();
      var tStr = s.them == null ? "" : String(s.them).trim();
      var yIsNum = yStr !== "" && !Number.isNaN(Number(yStr));
      var tIsNum = tStr !== "" && !Number.isNaN(Number(tStr));
      if (yIsNum) ySides++;
      if (tIsNum) tSides++;
      if (!yIsNum || !tIsNum) return;                     // incomplete or garbage → skip
      var y = Number(yStr), th = Number(tStr);
      if (y === th) return;                                // tied within a set → skip
      if (y > th) ys++; else ts++;
    });
    return { ys: ys, ts: ts, ySides: ySides, tSides: tSides };
  })();

  // ── Self-healing winner ──────────────────────────────────────────────────
  // ys/ts are in the SUBMITTER'S frame. We derive a single canonical
  // "submitter won" boolean and project it into viewer-frame as needed
  // for the three card types (own / tagged / third-party).
  //
  // Rule order:
  //   1. If the sets unambiguously pick a winner (ys ≠ ts), trust them.
  //      Self-heals the "tapped the wrong Win/Loss button but entered
  //      winning sets" data-entry bug.
  //   2. Otherwise — sets are tied OR every set was incomplete — if the
  //      stored result claims one side won but ONLY THE OTHER SIDE has
  //      any completed scores in the visible sets, that's the second
  //      data-entry bug: marked Win and entered the opp's score in
  //      "them" with their own column blank. Flip the result so the
  //      arrow points to the side that actually scored. The empty-set
  //      case (no scores either side) and legitimate retirements with
  //      at least one completed set on each side are NOT touched.
  //   3. Fall back to the stored result.
  //
  // m.result is in the SUBMITTER's POV for own + third-party rows
  // (normalizeMatch leaves it untouched) and FLIPPED to the viewer's
  // POV for tagged rows — so we flip back here for tagged so
  // `submitterWon` is consistent across all three.
  var submitterWonStored = m.isTagged ? (m.result === "loss") : (m.result === "win");
  var setsContradictStored = (setWinCounts.ys === setWinCounts.ts) && (
    (submitterWonStored && setWinCounts.ySides === 0 && setWinCounts.tSides > 0) ||
    (!submitterWonStored && setWinCounts.tSides === 0 && setWinCounts.ySides > 0)
  );
  var submitterWon = (setWinCounts.ys !== setWinCounts.ts)
    ? (setWinCounts.ys > setWinCounts.ts)
    : (setsContradictStored ? !submitterWonStored : submitterWonStored);
  // viewerWon — meaningful only when the viewer is in the match. For
  // third-party rows we don't use it for anything viewer-centric (no
  // win/loss tint on the card border, no viewer-claim share text).
  var viewerWon = m.isTagged ? !submitterWon : submitterWon;
  // Preserve the legacy `isWin` symbol for callers below (share text,
  // etc.) — equivalent to viewerWon, semantically "did the viewer win".
  var isWin = viewerWon;

  // The CONTEXT label that headlines the card. League takes precedence
  // (it's a more specific identity than "Ranked"); then a tournament
  // name; then the basic "Ranked" / "Casual" classification. Used as
  // the eyebrow at the top of the card.
  var leagueName = m.league_id && leaguesIndex ? (leaguesIndex[m.league_id] || null) : null;
  var contextLabel = leagueName
    ? leagueName
    : (m.tournName && m.tournName !== "Casual Match"
        ? m.tournName
        : (isRanked ? "Ranked" : "Casual"));

  // Footer metadata text — "Logged by X · date · venue". Replaces the
  // header subtitle. "you" instead of viewer's name when isOwn so the
  // card doesn't need to know the viewer's name pattern.
  var loggerLabel = isOwn ? "you" : pName;
  var venueText = m.venue ? (m.court ? m.venue + " · " + m.court : m.venue) : null;
  var footerMetaParts = [
    "Logged by " + loggerLabel,
    m.date,
    venueText,
  ].filter(Boolean);

  // Slice 5 — rivalry flag. True only when (a) the viewer is one of the
  // two players in this match and (b) the viewer has played the OTHER
  // side ≥5 confirmed times. Third-party matches in friends' feed don't
  // qualify because we don't have their shared history.
  var isRivalryMatch = (function () {
    if (!viewerRivalsSet || !authUser) return false;
    var posterId   = m.isTagged ? m.submitterId : (authUser && authUser.id);
    var opponentId = m.isTagged ? (authUser && authUser.id) : m.opponent_id;
    if (posterId !== authUser.id && opponentId !== authUser.id) return false;
    var otherSide = posterId === authUser.id ? opponentId : posterId;
    return !!otherSide && viewerRivalsSet.has(otherSide);
  })();

  // Compact status pill shown in the header top-right.
  var statusPill = isAwaitingClaim              ? { label: "Awaiting opponent", color: t.orange, bg: t.orangeSubtle }
                  : isPending && !isOpponentView ? { label: "Pending",    color: t.orange,       bg: t.orangeSubtle }
                  : isDisputed                  ? { label: "Disputed",   color: t.red,          bg: t.redSubtle }
                  : isPendingReconf             ? { label: "Re-proposed",color: t.orange,       bg: t.orangeSubtle }
                  : isExpired                   ? { label: "Unverified", color: t.textTertiary, bg: t.bgTertiary }
                  : isVoided                    ? { label: "Voided",     color: t.textTertiary, bg: t.bgTertiary }
                  : null;

  // Outer card treatment — unconfirmed matches "pop" against confirmed ones:
  //   - orange border for any pending/re-propose state
  //   - red border for active disputes
  //   - needs-my-action cards also get a slight accent background tint and
  //     a thicker border so the user's attention is drawn immediately
  var needsAction = isOpponentView || needsMyAction;
  var statusColor = isDisputed ? t.red
                   : (isPending || isPendingReconf || isAwaitingClaim) ? t.orange
                   : null;
  // Ranked integrity: 'ranked' matches affect Elo + leaderboard. Once
  // submitted, the submitter can no longer delete one unilaterally from
  // the feed — the proper paths are dispute (to correct) or void (to
  // revert the ranking effect). Voided ranked matches CAN be removed
  // because voiding already reversed any Elo impact.
  // Core product rule (2026-04-25): authoritative source is match_type.
  var isRanked       = m.match_type === 'ranked';
  var canSubmitterDelete = isOwn && onDelete && !isInDispute && (!isRanked || isVoided);
  var cardBorder = statusColor
                   ? (needsAction ? "2px solid " + statusColor : "1px solid " + statusColor + "88")
                   : "1px solid " + t.border;
  var cardBg = needsAction && statusColor
               ? (isDisputed ? t.redSubtle : t.orangeSubtle)
               : t.bgCard;

  // If rowAnchor has a className (deep-link active), merge with cs-card so
  // the pulse ring renders alongside the regular card hover styling.
  // cs-feed-card is the slice-5 hook for the mobile vertical-spacing pass
  // (see providers.jsx — tighter margin / header / footer paddings on
  // viewports < 1024px, restored at desktop).
  var mergedClassName = "cs-card cs-feed-card"
    + (rowAnchor && rowAnchor.className ? " " + rowAnchor.className : "");
  return (
    <div
      id={"feed-match-" + m.id}
      ref={rowAnchor && rowAnchor.ref}
      className={mergedClassName}
      style={{
        background: cardBg,
        border: cardBorder,
        // Elegant, refined corner softening. 10px is tight enough to read
        // as intentional rather than playful, generous enough to remove the
        // hard rectangle without making the card feel like a button. Matches
        // the radius token pattern used elsewhere in the theme (t.r2).
        borderRadius: 10,
        overflow: "hidden",
        marginBottom: 14,
        opacity: cardOpacity,
      }}
    >
      {/* ── Match-first context strip ───────────────────────────────────
          Replaces the legacy author-avatar header. The card is a match
          result first, social post second — the participants own the
          identity (visible in the scoreboard rows below), so the top
          band is now context + chrome only.

          Left:  uppercase eyebrow with the match's context — league name
                 if league-tagged (clickable, deep-links to standings),
                 else tournament name, else "Ranked" / "Casual".
          Right: status pill + close/lock controls. */}
      <div className="cs-feed-card-header" style={{
        padding: "14px 16px 0",
        display: "flex", gap: 10, alignItems: "center",
      }}>
        {/* Eyebrow — the match's context. Clickable when it's a league
            (deep-links into that league's standings). */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <button
            onClick={leagueName && onOpenLeague ? function (e) {
              e.stopPropagation();
              if (m.league_id) onOpenLeague(m.league_id);
            } : undefined}
            title={leagueName ? "Open league · " + leagueName : undefined}
            style={{
              background: "transparent", border: "none", padding: 0, margin: 0,
              cursor: (leagueName && onOpenLeague) ? "pointer" : "default",
              fontSize: 10, fontWeight: 800,
              color: leagueName ? t.accent : t.textTertiary,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              textAlign: "left",
              maxWidth: "100%",
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              display: "block",
            }}>
            {contextLabel}
          </button>
        </div>

        {/* Right-side chrome — status pill + close/lock buttons */}
        <div style={{ display: "flex", gap: 6, alignItems: "center", flexShrink: 0 }}>
          {statusPill && (
            <span style={{
              fontSize: 9, fontWeight: 700, color: statusPill.color, background: statusPill.bg,
              padding: "2px 7px", borderRadius: 20, letterSpacing: "0.06em", textTransform: "uppercase",
            }}>{statusPill.label}</span>
          )}
          {/* Unified ranked-integrity rule:
              Confirmed ranked matches are LOCKED for BOTH sides — submitter
              can't delete AND tagged opponent can't hide from feed. The
              match is part of the shared record that drives ELO + league
              standings, so neither party should be able to unilaterally
              remove it from view. Voided/expired ranked matches ARE removable
              (already reverted / never counted); casual matches are always
              removable for both sides (no ranking impact). */}
          {canSubmitterDelete && (
            <button onClick={async function() {
                if (!window.confirm(isVoided ? "Remove this voided match from your feed?" : "Delete this match?")) return;
                var res = await onDelete(m);
                if (res && res.error) (toast ? toast(res.error, "error") : window.alert(res.error));
              }}
              title="Delete match"
              style={{ background: "none", border: "none", color: t.textTertiary, fontSize: 13, padding: "2px 4px", lineHeight: 1, cursor: "pointer" }}>✕</button>
          )}
          {m.isTagged && onRemove && (isConfirmed || isVoided || isExpired) && (!isRanked || isVoided || isExpired) && (
            <button onClick={async function() {
                if (!window.confirm("Remove from your feed?")) return;
                var res = await onRemove(m);
                if (res && res.error) (toast ? toast(res.error, "error") : window.alert(res.error));
              }}
              title="Remove from my feed"
              style={{ background: "none", border: "none", color: t.textTertiary, fontSize: 13, padding: "2px 4px", lineHeight: 1, cursor: "pointer" }}>✕</button>
          )}
          {/* Padlock glyph — shown on locked ranked cards for BOTH sides
              (submitter + tagged opponent) so the missing × isn't a mystery.
              Hidden on voided (those ARE deletable) and on in-dispute cards
              (they're mid-flow, lock would be confusing). */}
          {isRanked && !isVoided && !isInDispute && (isOwn || (m.isTagged && isConfirmed)) && (
            <span
              title={isOwn
                ? "Ranked match — dispute or void to remove (protects ELO integrity)"
                : "Ranked match — part of the shared record. Can't be removed from your feed."}
              style={{ color: t.textTertiary, display: "flex", alignItems: "center", padding: 2, opacity: 0.6 }}>
              <svg width="12" height="12" viewBox="0 0 18 18" fill="none">
                <rect x="4" y="8" width="10" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.5"/>
                <path d="M6 8V6a3 3 0 0 1 6 0v2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            </span>
          )}
        </div>
      </div>

      {/* Stats strip removed — every value (Result / Sets / Score) was
          already visible in the scoreboard below via arrow + row bolding +
          set-cell values. See docs/superpowers/specs/2026-04-23-feed-card-
          reduce-redundancy-design.md for the reasoning.
          isWin + setWinCounts are still computed at the top of FeedCard
          because the outer border tint, share-sheet text, and scoreboard
          row derivation all depend on them. */}

      {/* ── Scoreboard — compact ATP-style typography ──
            v2: no border between header and scoreboard, no border between
            player rows. Whitespace + the avatar/name column carry the
            visual structure. Only the social footer earns a hairline,
            because that's a passive→active section change. */}
      <div style={{
        margin: "0 0 4px",
      }}>
        {/* Column-label strip — smaller, subtler, right-aligned. No visual weight. */}
        {(m.sets || []).length > 0 && (
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "flex-end",
            padding: "4px 16px 0",
          }}>
            <div style={{ display: "flex", alignItems: "center" }}>
              {(m.sets || []).map(function(_, i) {
                return (
                  <div key={i} style={{
                    width: 32, textAlign: "center",
                    fontSize: 8, fontWeight: 600, color: t.textTertiary,
                    letterSpacing: "0.04em",
                  }}>S{i + 1}</div>
                );
              })}
              <div style={{ width: 18 }} />
            </div>
          </div>
        )}

        {/* Player rows.
            Winner-row derivation: we trust the SCOREBOARD, not the stored
            `result` field. If the sets unambiguously pick a winner (more sets
            won on one side), we use that — this self-heals the classic
            "user accidentally tapped Loss but entered winning set scores" bug,
            where stored `result` disagrees with the actual score.
            If the sets are tied in count (retirement, incomplete match) we
            fall back to the stored `result` via `isWin` in the original
            tagged-frame logic. */}
        {(function() {
          // Row 1's player is the POSTER from the viewer's POV:
          //   own         — poster = viewer (pName = profile.name)
          //   tagged      — poster = submitter (pName = friendName)
          //   third-party — poster = submitter (pName = friendName)
          //
          // For own rows the poster is the viewer, so posterWins = viewerWon.
          // For tagged + third-party the poster is the submitter, so
          // posterWins = submitterWon. The canonical submitterWon was
          // derived above and folds in the unambiguous-sets self-heal.
          var posterWins = isOwn ? viewerWon : submitterWon;
          return [
            {
              name: pName,
              avatarInitials: pAvatar,
              avatarUrl: pAvatarUrl,
              isWinner: posterWins,
              onClick: posterClickable ? goPoster : null,
              scores:    (m.sets || []).map(function(s) { return s.you;  }),
              oppScores: (m.sets || []).map(function(s) { return s.them; }),
            },
            {
              name: m.oppName,
              avatarInitials: null,
              avatarUrl: oppAvatarUrl,
              isWinner: !posterWins,
              onClick: opponentClickable ? goOpponent : null,
              scores:    (m.sets || []).map(function(s) { return s.them; }),
              oppScores: (m.sets || []).map(function(s) { return s.you;  }),
            },
          ];
        })().map(function(row, ri) {
          return (
            <div key={ri} style={{
              display: "flex", alignItems: "center",
              padding: "6px 16px",
            }}>
              {/* Tiny avatar next to the name — makes the scoreboard identify
                  each row visually without needing the old "vs X" title row. */}
              <div
                onClick={row.onClick || undefined}
                style={{ flexShrink: 0, marginRight: 8, cursor: row.onClick ? "pointer" : "default" }}>
                <PlayerAvatar name={row.name} avatar={row.avatarInitials} avatarUrl={row.avatarUrl} size={22}/>
              </div>

              {/* Player name — clickable when that row is a real user */}
              <div
                onClick={row.onClick || undefined}
                style={{
                  flex: 1, minWidth: 0,
                  fontSize: 13,
                  fontWeight: row.isWinner ? 600 : 400,
                  color: row.isWinner ? t.text : t.textSecondary,
                  letterSpacing: "-0.1px",
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  paddingRight: 8,
                  cursor: row.onClick ? "pointer" : "default",
                }}>{row.name}</div>

              {/* Set scores — refined typography: winner sets in full weight,
                  loser sets dimmed. Smaller per-column width.
                  When the OTHER side's score is missing entirely
                  (retirement / time-limited / partial), the present
                  positive number is still the meaningful one — bold
                  it on the row that has it instead of dimming both.
                  When a set is 7-6 / 6-7 with valid inner tiebreak
                  details, the LOSING row shows a tiny superscript of
                  their inner-tiebreak points (tennis convention:
                  "7-6 (7-4)" = the 6-row scored 4 in the tiebreak). */}
              {row.scores.map(function(score, i) {
                var opp = row.oppScores[i];
                var hasMine = score !== "" && score !== undefined && score !== null;
                var hasOpp  = opp   !== "" && opp   !== undefined && opp   !== null;
                var wonSet;
                if (hasMine && hasOpp) {
                  wonSet = Number(score) > Number(opp);
                } else if (hasMine && !hasOpp) {
                  // Only my side recorded a number (e.g. opponent
                  // retired). Treat any positive value as the
                  // meaningful set winner so it doesn't render dim.
                  wonSet = Number(score) > 0;
                } else {
                  wonSet = false;
                }
                // Inner tiebreak read — tennis convention "7-6 (3)":
                // the parenthesised digit is the LOSER's tb score and
                // it sits next to the WINNER's "7". So we render it
                // on the winner's row, not the loser's. (Earlier
                // builds put it on the loser's row, which read as
                // "6³" and broke convention — the user expectation
                // is to find the digit attached to the winning side.)
                var setObj = (m.sets || [])[i];
                var tbSuper = null;
                if (setObj && setObj.tieBreak && hasMine && hasOpp) {
                  var hi = Math.max(Number(score), Number(opp));
                  var lo = Math.min(Number(score), Number(opp));
                  if (hi === 7 && lo === 6 && wonSet) {
                    // This is the WINNER's row in a 7-6 tb set.
                    // The superscript shows the loser's tb points
                    // (Math.min of the inner pair), regardless of
                    // which side of the tieBreak object the loser
                    // happens to live on.
                    var tbY = Number(setObj.tieBreak.you);
                    var tbT = Number(setObj.tieBreak.them);
                    if (Number.isFinite(tbY) && Number.isFinite(tbT)) {
                      tbSuper = Math.min(tbY, tbT);
                    }
                  }
                }
                return (
                  <div key={i} style={{
                    width: 32, textAlign: "center",
                    fontSize: 14, fontWeight: wonSet ? 600 : 400,
                    color: wonSet ? t.text : t.textTertiary,
                    fontVariantNumeric: "tabular-nums",
                    letterSpacing: "-0.2px",
                    lineHeight: 1,
                  }}>
                    {score !== undefined && score !== "" ? score : "–"}
                    {tbSuper != null && (
                      // Tennis convention: "7-6 (3)" — the parenthesised
                      // number is the LOSER's tiebreak score. Rendered
                      // as a true semantic <sup> so it sits INLINE next
                      // to the loser's "6" in its own cell, with no
                      // chance of bleeding into the neighbouring cell.
                      // (Earlier iterations used absolute positioning
                      // with right:-8 which pushed the digit OUT of
                      // its parent cell and visually attached it to
                      // the wrong set.)
                      <sup style={{
                        fontSize: 9,
                        fontWeight: 700,
                        color: t.textSecondary,
                        marginLeft: 1,
                        fontVariantNumeric: "tabular-nums",
                        lineHeight: 0,
                        verticalAlign: "super",
                      }}>{tbSuper}</sup>
                    )}
                  </div>
                );
              })}

              {/* Winner indicator ◀ — slim, accent-neutral */}
              <div style={{ width: 18, textAlign: "center" }}>
                {row.isWinner && (
                  <span style={{ fontSize: 9, color: t.green, fontWeight: 600 }}>◀</span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* ── PENDING: submitter view ───────────────────────────────────────── */}
      {isPending && !isOpponentView && (
        <div style={{ borderTop: "1px solid " + t.border, padding: "10px 16px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, color: t.orange }}>
              <span style={{ display: "flex", alignItems: "center" }}>
                <svg width="12" height="12" viewBox="0 0 18 18" fill="none">
                  <circle cx="9" cy="9" r="7" stroke="currentColor" strokeWidth="1.5"/>
                  <path d="M9 5v4l3 2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
              </span>
              <span style={{ fontSize: 12, color: t.textSecondary }}>Awaiting opponent confirmation</span>
            </div>
            {timeRemaining(m.expiresAt) && (
              <span style={{ fontSize: 10, fontWeight: 700, color: t.orange, background: t.orangeSubtle, padding: "2px 8px", borderRadius: 20, letterSpacing: "0.04em", flexShrink: 0 }}>{timeRemaining(m.expiresAt)}</span>
            )}
          </div>
        </div>
      )}

      {/* ── PENDING: opponent action buttons ─────────────────────────────── */}
      {/* Sharp-cornered Confirm/Dispute in line with the feed card chrome.
          Confirm = solid accent-green primary. Dispute = transparent line-art
          outline with red stroke. SVG icons per the no-emoji-as-icons rule. */}
      {isOpponentView && !demo && (
        <div style={{ borderTop: "1px solid " + t.border, padding: "10px 14px 12px" }}>
          <div style={{ fontSize: 11, color: t.textSecondary, marginBottom: 8, fontWeight: 500, letterSpacing: "0.01em" }}>
            {pName} logged this match — does it look right?
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={async function() {
                var res = await confirmOpponentMatch(m);
                if (res && res.error) (toast ? toast(res.error, "error") : window.alert(res.error));
              }}
              style={{
                flex: 1, padding: "9px 10px", borderRadius: 0, border: "none",
                background: t.green, color: "#fff",
                fontSize: 12, fontWeight: 700, letterSpacing: "0.03em",
                cursor: "pointer", transition: "opacity 0.15s",
                display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6,
              }}
              onMouseEnter={function(e){e.currentTarget.style.opacity="0.85";}} onMouseLeave={function(e){e.currentTarget.style.opacity="1";}}>
              <span style={{ display: "flex", alignItems: "center" }}>{NAV_ICONS.check(13)}</span>
              Confirm
            </button>
            <button onClick={function() { openDisputeModal("dispute"); }}
              style={{
                flex: 1, padding: "9px 10px", borderRadius: 0,
                border: "1px solid " + t.red, background: "transparent", color: t.red,
                fontSize: 12, fontWeight: 600, letterSpacing: "0.03em",
                cursor: "pointer",
                display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6,
              }}>
              <span style={{ display: "flex", alignItems: "center" }}>{NAV_ICONS.x(13)}</span>
              Dispute
            </button>
          </div>
        </div>
      )}

      {/* ── DISPUTED / RECONFIRMATION: diff block ────────────────────────── */}
      {isInDispute && m.currentProposal && (
        <div style={{ margin: "0 12px 12px", borderRadius: 8, border: "1px solid " + t.orange + "55", background: t.orangeSubtle, padding: 12 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: t.orange, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10 }}>
            {isPendingReconf ? "Counter-proposal awaiting opponent" : "Proposed correction"} · Round {m.revisionCount || 1}
            {(m.revisionCount || 0) >= 3 && <span style={{ marginLeft: 6, color: t.red }}> · Final round</span>}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div>
              <div style={{ fontSize: 9, fontWeight: 700, color: t.textTertiary, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>Original</div>
              <div style={{ fontSize: 12, color: t.text, marginBottom: 3 }}>{m.result === "win" ? "Win" : "Loss"}</div>
              {scoreStr && <div style={{ fontSize: 12, color: t.text, marginBottom: 3, fontVariantNumeric: "tabular-nums" }}>{scoreStr}</div>}
              {m.rawDate && <div style={{ fontSize: 11, color: t.textSecondary, marginBottom: 2 }}>{m.date}</div>}
              {m.venue && <div style={{ fontSize: 11, color: t.textSecondary }}>{m.venue}{m.court ? " · " + m.court : ""}</div>}
            </div>
            <div>
              <div style={{ fontSize: 9, fontWeight: 700, color: t.orange, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>Proposed</div>
              <div style={Object.assign({ fontSize: 12, marginBottom: 3 }, chStyle("result"))}>{m.currentProposal.result === "win" ? "Win" : "Loss"}</div>
              {proposalScoreStr() && <div style={Object.assign({ fontSize: 12, marginBottom: 3, fontVariantNumeric: "tabular-nums" }, chStyle("sets"))}>{proposalScoreStr()}</div>}
              {m.currentProposal.match_date && <div style={Object.assign({ fontSize: 11, marginBottom: 2 }, chStyle("date"))}>{m.currentProposal.match_date}</div>}
              {(m.currentProposal.venue || m.currentProposal.court) && (
                <div style={Object.assign({ fontSize: 11 }, chStyle("venue"))}>{[m.currentProposal.venue, m.currentProposal.court].filter(Boolean).join(" · ")}</div>
              )}
            </div>
          </div>
          {m.disputeReasonCode && (
            <div style={{ marginTop: 10, paddingTop: 8, borderTop: "1px solid " + t.orange + "33" }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: t.orange }}>{REASON_LABELS[m.disputeReasonCode] || m.disputeReasonCode}</span>
              {m.disputeReasonDetail && <span style={{ fontSize: 11, color: t.textSecondary }}> — {m.disputeReasonDetail}</span>}
            </div>
          )}
        </div>
      )}

      {/* ── DISPUTED: action buttons ──────────────────────────────────────── */}
      {/* Same sharp line-art treatment as the confirm/dispute block above —
          Accept (primary green), Counter-propose (orange outline),
          Void (red outline). SVG icons, no emoji. */}
      {isInDispute && needsMyAction && !demo && (
        <div style={{ borderTop: "1px solid " + t.border, padding: "10px 14px 12px" }}>
          {(m.revisionCount || 0) >= 3 && (
            <div style={{ fontSize: 11, color: t.red, marginBottom: 8, fontWeight: 500, letterSpacing: "0.01em" }}>
              Final round reached — accept or void.
            </div>
          )}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button onClick={async function() {
                var res = await acceptCorrection(m);
                if (res && res.error) (toast ? toast(res.error, "error") : window.alert(res.error));
              }}
              style={{
                flex: 1, padding: "9px 10px", borderRadius: 0, border: "none",
                background: t.green, color: "#fff",
                fontSize: 12, fontWeight: 700, letterSpacing: "0.03em", minWidth: 80,
                cursor: "pointer", transition: "opacity 0.15s",
                display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6,
              }}
              onMouseEnter={function(e){e.currentTarget.style.opacity="0.85";}} onMouseLeave={function(e){e.currentTarget.style.opacity="1";}}>
              <span style={{ display: "flex", alignItems: "center" }}>{NAV_ICONS.check(13)}</span>
              Accept
            </button>
            {(m.revisionCount || 0) < 3 && (
              <button onClick={function() { openDisputeModal("counter"); }}
                style={{
                  flex: 1, padding: "9px 10px", borderRadius: 0,
                  border: "1px solid " + t.orange, background: "transparent", color: t.orange,
                  fontSize: 12, fontWeight: 600, letterSpacing: "0.03em", minWidth: 80,
                  cursor: "pointer",
                  display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6,
                }}>
                <span style={{ display: "flex", alignItems: "center" }}>{NAV_ICONS.edit(12)}</span>
                Counter
              </button>
            )}
            <button onClick={async function() {
                if (!window.confirm("Void this match? This cannot be undone.")) return;
                var res = await voidMatchAction(m, "mutual_void");
                if (res && res.error) (toast ? toast(res.error, "error") : window.alert(res.error));
              }}
              style={{
                flex: 1, padding: "9px 10px", borderRadius: 0,
                border: "1px solid " + t.red, background: "transparent", color: t.red,
                fontSize: 12, fontWeight: 600, letterSpacing: "0.03em", minWidth: 80,
                cursor: "pointer",
                display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6,
              }}>
              <span style={{ display: "flex", alignItems: "center" }}>{NAV_ICONS.x(13)}</span>
              Void
            </button>
          </div>
        </div>
      )}

      {/* ── DISPUTED: waiting for other party ────────────────────────────── */}
      {isInDispute && waitingForOther && (
        <div style={{ borderTop: "1px solid " + t.border, padding: "10px 16px", display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 12, color: t.orange }}>⏳</span>
          <span style={{ fontSize: 12, color: t.textSecondary }}>
            {isPendingReconf ? "Waiting for opponent to reconfirm your counter" : "Waiting for their response to your correction"}
          </span>
        </div>
      )}

      {/* ── DISPUTED: no proposal yet ────────────────────────────────────── */}
      {isInDispute && !m.currentProposal && (
        <div style={{ borderTop: "1px solid " + t.border, padding: "10px 16px", display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 12, color: t.red }}>⚠</span>
          <span style={{ fontSize: 12, color: t.textSecondary }}>Under dispute — stats on hold</span>
        </div>
      )}

      {/* ── EXPIRED ──────────────────────────────────────────────────────── */}
      {isExpired && (
        <div style={{ borderTop: "1px solid " + t.border, padding: "10px 16px", display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 12, color: t.textTertiary }}>⏱</span>
          <span style={{ fontSize: 12, color: t.textTertiary }}>Confirmation window expired — does not count</span>
        </div>
      )}

      {/* ── VOIDED ───────────────────────────────────────────────────────── */}
      {isVoided && (
        <div style={{ borderTop: "1px solid " + t.border, padding: "10px 16px", display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 12, color: t.textTertiary }}>✕</span>
          <span style={{ fontSize: 12, color: t.textTertiary }}>
            {m.voidedReason === "not_my_match" ? "Voided — player reported this wasn't their match" :
             m.voidedReason === "max_revisions" ? "Voided — too many rounds of disagreement" :
             m.voidedReason === "timeout"       ? "Voided — dispute window expired" :
             "Voided — does not count"}
          </span>
        </div>
      )}

      {/* ── Logger / date / venue metadata ─────────────────────────────
          Replaces the legacy author header. The submitter's identity is
          surfaced here as quiet meta — secondary to the match itself —
          along with the date and venue. Rivalry tag is appended inline
          when applicable so it doesn't need its own row. */}
      {!demo && (
        <div style={{
          padding: "8px 16px 12px",
          fontSize: 11,
          color: t.textTertiary,
          letterSpacing: "0.01em",
          display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap",
          minWidth: 0,
        }}>
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>
            {footerMetaParts.join("  ·  ")}
          </span>
          {isRivalryMatch && (
            <span
              title="Rivalry — you've played this opponent 5+ times"
              style={{
                flexShrink: 0,
                fontSize: 9, fontWeight: 800,
                color: t.accent,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
              }}>
              · Rivalry
            </span>
          )}
        </div>
      )}

      {/* ── CONFIRMED: Strava-style social footer ──────────────────────────
          Left: kudos-style social-proof text ("N likes · M comments" or
                the empty-state prompt). Right: compact icon-first buttons.
          No big colored labels — the card visualization is the hero. */}
      {isConfirmed && !demo && (
        <div className="cs-feed-card-footer" style={{
          borderTop: "1px solid " + t.border,
          padding: "10px 14px",
          display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10,
        }}>
          {/* Left: engagement summary / kudos prompt — each count is its own
              clickable link opening the FeedInteractionsModal on the right tab. */}
          <div style={{ fontSize: 12, color: t.textSecondary, fontWeight: 500, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {likeCount === 0 && comments.length === 0 ? (
              <span style={{ color: t.textTertiary }}>Be the first to give kudos!</span>
            ) : (
              <>
                {likeCount > 0 && (
                  <span
                    onClick={onOpenInteractions ? function () { onOpenInteractions(m.id, "kudos"); } : undefined}
                    style={{ cursor: onOpenInteractions ? "pointer" : "default", color: t.textSecondary }}
                    onMouseEnter={function (e) { if (onOpenInteractions) e.currentTarget.style.color = t.text; }}
                    onMouseLeave={function (e) { e.currentTarget.style.color = t.textSecondary; }}
                  >
                    {likeCount + (likeCount === 1 ? " like" : " likes")}
                  </span>
                )}
                {likeCount > 0 && comments.length > 0 && " · "}
                {comments.length > 0 && (
                  <span
                    onClick={onOpenInteractions ? function () { onOpenInteractions(m.id, "comments"); } : undefined}
                    style={{ cursor: onOpenInteractions ? "pointer" : "default", color: t.textSecondary }}
                    onMouseEnter={function (e) { if (onOpenInteractions) e.currentTarget.style.color = t.text; }}
                    onMouseLeave={function (e) { e.currentTarget.style.color = t.textSecondary; }}
                  >
                    {comments.length + (comments.length === 1 ? " comment" : " comments")}
                  </span>
                )}
              </>
            )}
          </div>

          {/* Right: minimal icon actions (Like · Comment · Rematch · Share) */}
          <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
            <IconButton
              t={t}
              title={liked ? "Unlike" : "Like"}
              active={liked}
              onClick={async function () {
                if (!authUser) return;
                var prevLiked = liked;
                var nowLiked = !liked;
                setFeedLikes(function(l) { var n = Object.assign({}, l); n[m.id] = nowLiked; return n; });
                setFeedLikeCounts(function(c) { var n = Object.assign({}, c); n[m.id] = Math.max(0, (n[m.id] || 0) + (nowLiked ? 1 : -1)); return n; });
                var res;
                if (nowLiked) { res = await supabase.from("feed_likes").insert({ match_id: m.id, user_id: authUser.id }); }
                else { res = await supabase.from("feed_likes").delete().eq("match_id", m.id).eq("user_id", authUser.id); }
                if (res && res.error) {
                  setFeedLikes(function(l) { var n = Object.assign({}, l); n[m.id] = prevLiked; return n; });
                  setFeedLikeCounts(function(c) { var n = Object.assign({}, c); n[m.id] = Math.max(0, (n[m.id] || 0) + (nowLiked ? -1 : 1)); return n; });
                  return;
                }
                if (nowLiked) {
                  var toNotify = [m.submitterId, m.opponent_id].filter(function (uid, i, arr) {
                    return uid && uid !== authUser.id && arr.indexOf(uid) === i;
                  });
                  track("feed_like", { match_id: m.id, participants_notified: toNotify.length });
                  if (toNotify.length) {
                    var oneHourAgoIso = new Date(Date.now() - 60 * 60 * 1000).toISOString();
                    supabase.from("notifications")
                      .select("id").eq("type", "like").eq("match_id", m.id)
                      .eq("from_user_id", authUser.id).gte("created_at", oneHourAgoIso).limit(1)
                      .then(function (r) {
                        if (r.error || (r.data && r.data.length)) return;
                        // Cross-user notifications go through the
                        // emit_notification security-definer RPC (RLS
                        // blocks direct inserts with from_user_id set).
                        toNotify.forEach(function (uid) {
                          supabase.rpc("emit_notification", {
                            p_user_id: uid,
                            p_type: "like",
                            p_entity_id: m.id,
                            p_metadata: null,
                          });
                        });
                      });
                  }
                }
              }}>
              {liked ? ICONS.likeFilled() : ICONS.like()}
            </IconButton>
            <IconButton
              t={t}
              title={"Comment" + (comments.length > 0 ? " (" + comments.length + ")" : "")}
              onClick={function () {
                setCommentDraft("");
                if (onOpenInteractions) onOpenInteractions(m.id, "comments");
                else setCommentModal(m.id); // legacy fallback
              }}>
              {ICONS.comment()}
            </IconButton>
            {openChallenge && opponentClickable && (
              <IconButton
                t={t}
                title="Rematch"
                onClick={function () {
                  openChallenge(
                    { id: opponentUserId, name: m.oppName, suburb: m.venue || "", skill: "" },
                    "rematch",
                    m
                  );
                }}>
                {ICONS.rematch()}
              </IconButton>
            )}
            <IconButton
              t={t}
              title="Share"
              onClick={function () { if (navigator.share) navigator.share({ title: "Match result", text: pName + (isWin ? " won " : " lost ") + "vs " + m.oppName + " " + scoreStr }); }}>
              {ICONS.share()}
            </IconButton>
          </div>
        </div>
      )}
      {demo && (
        <div style={{
          borderTop: "1px solid " + t.border,
          padding: "10px 14px",
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <span style={{ fontSize: 12, color: t.textTertiary }}>Be the first to give kudos!</span>
          <div style={{ display: "flex", gap: 4, color: t.textTertiary }}>
            <span style={{ padding: "7px 7px", display: "flex", alignItems: "center" }}>{ICONS.like()}</span>
            <span style={{ padding: "7px 7px", display: "flex", alignItems: "center" }}>{ICONS.comment()}</span>
          </div>
        </div>
      )}

      {/* Comments preview */}
      {isConfirmed && comments.length > 0 && (
        <div style={{ borderTop: "1px solid " + t.border, padding: "10px 16px", display: "flex", flexDirection: "column", gap: 6 }}>
          {comments.slice(-2).map(function(c) {
            return (
              <div key={c.id} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                <div style={{ width: 24, height: 24, borderRadius: "50%", background: avColor(c.author), display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 700, color: "#fff", flexShrink: 0 }}>{c.author.slice(0, 2).toUpperCase()}</div>
                <div style={{ flex: 1 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: t.text }}>{c.author} </span>
                  <span style={{ fontSize: 12, color: t.textSecondary }}>{c.text}</span>
                </div>
              </div>
            );
          })}
          {comments.length > 2 && (
            <button onClick={function() { setCommentModal(m.id); }} style={{ background: "none", border: "none", color: t.accent, fontSize: 11, fontWeight: 600, textAlign: "left", padding: 0 }}>
              View all {comments.length} comments
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ── HomeTab ───────────────────────────────────────────────────────────────────
export default function HomeTab({
  t, authUser, profile, history,
  feedLikes, setFeedLikes, feedLikeCounts, setFeedLikeCounts,
  feedComments, setFeedComments, commentModal, setCommentModal, commentDraft, setCommentDraft,
  setShowAuth, setAuthMode, setAuthStep,
  setCasualOppName, setScoreModal, setScoreDraft,
  setDisputeModal, setDisputeDraft,
  deleteMatch, removeTaggedMatch,
  confirmOpponentMatch, acceptCorrection, voidMatchAction,
  openProfile,
  friends, playedOpponents, suggestedPlayers,
  sendFriendRequest, cancelRequest, acceptRequest, sentReq, recvReq,
  friendRelationLabel, socialLoading,
  onGoToDiscover,
  openChallenge,
  toast,
  pendingFreshCount,
  refreshFeed,
  notifyMatchOwnerOfComment,
  // Module 4: next-challenge banner at top of feed + deep-link into People.
  challengesList, challengesProfileMap, onLogConvertedMatch, goToChallengesTab,
  // Module 7 — simple id→name map so league-tagged matches can render a pill,
  // and a callback to deep-link into a specific league's detail view.
  leaguesIndex, onOpenLeague,
  // Slice 1 (design overhaul) — Home Leagues strip
  myLeagues, leagueDetailCache, loadLeagueDetail,
}) {
  // Deep-link: when we arrive from a notification that carries a
  // highlightMatchId in router state, scroll to that FeedCard and pulse it.
  var matchDeepLink = useDeepLinkHighlight("highlightMatchId");

  // Feed filter — "Everyone" vs "Me". The Me filter shows only matches
  // the viewer actually played in (own submissions + tagged matches the
  // viewer was the opponent in). Third-party friends-vs-friends rows
  // surfaced by the friends-feed RPC are excluded. Replaces the old
  // "Friends" filter (which surfaced their friends' matches) — users
  // wanted a way to see just their own activity, not the social feed.
  var [feedFilter, setFeedFilter] = useState("everyone");

  // Slice 1 (design overhaul) — Home feed is condensed to 5 cards by default
  // so it stops behaving like feed-as-home. "See all" expands inline.
  var [feedExpanded, setFeedExpanded] = useState(false);
  var FEED_PREVIEW_LIMIT = 5;

  // Strava-style Kudos + Comments modal state. Shape: {matchId, tab}.
  var [interactionsModal, setInteractionsModal] = useState(null);
  function openInteractions(matchId, tab) { setInteractionsModal({ matchId: matchId, tab: tab || "kudos" }); }
  function closeInteractions() { setInteractionsModal(null); }

  // For the modal's inline "Give kudos" CTA: we need the current liked/toggle
  // state of the match in the modal. The like handler lives inside FeedCard;
  // re-create a minimal one here so the modal can drive it.
  async function toggleLikeForModalMatch() {
    var mid = interactionsModal && interactionsModal.matchId;
    if (!mid || !authUser) return;
    var prev = !!feedLikes[mid];
    var now = !prev;
    setFeedLikes(function(l){var n=Object.assign({},l);n[mid]=now;return n;});
    setFeedLikeCounts(function(c){var n=Object.assign({},c);n[mid]=Math.max(0,(n[mid]||0)+(now?1:-1));return n;});
    var res;
    if (now) { res = await supabase.from("feed_likes").insert({match_id:mid,user_id:authUser.id}); }
    else     { res = await supabase.from("feed_likes").delete().eq("match_id",mid).eq("user_id",authUser.id); }
    if (res && res.error) {
      setFeedLikes(function(l){var n=Object.assign({},l);n[mid]=prev;return n;});
      setFeedLikeCounts(function(c){var n=Object.assign({},c);n[mid]=Math.max(0,(n[mid]||0)+(now?-1:1));return n;});
    }
  }
  var DEMO_FEED = [
    { id: "demo-1", oppName: "Alex Chen",     tournName: "Summer Open",       date: "Today",     sets: [{ you: 6, them: 3 }, { you: 6, them: 4 }], result: "win",  playerName: "Jordan Smith", playerAvatar: "JS", isOwn: false, status: "confirmed" },
    { id: "demo-2", oppName: "Sam Williams",  tournName: "Casual Match",      date: "Yesterday", sets: [{ you: 4, them: 6 }, { you: 3, them: 6 }], result: "loss", playerName: "Riley Brown",  playerAvatar: "RB", isOwn: false, status: "confirmed" },
    { id: "demo-3", oppName: "Morgan Davis",  tournName: "Moore Park Open",   date: "Mon",       sets: [{ you: 7, them: 5 }, { you: 6, them: 3 }], result: "win",  playerName: "Casey Moore",  playerAvatar: "CM", isOwn: false, status: "confirmed" },
  ];

  // Slice 5 (design overhaul) — derive the viewer's "rivals" set: linked
  // opponents the viewer has played ≥5 confirmed matches against. Drives
  // the subtle "Rivalry" pill on FeedCards. Computed at HomeTab so each
  // card doesn't re-walk history. Only useful for matches the viewer is
  // a participant in — third-party feed cards can't be classified
  // because we don't have those players' shared history client-side.
  var viewerRivalsSet = useMemo(function () {
    if (!authUser) return new Set();
    var counts = {};
    (history || []).forEach(function (m) {
      if (m.status !== "confirmed") return;
      // Third-party rows aren't the viewer's matches — they shouldn't
      // count toward the viewer's rivalry threshold even if one of the
      // friends in the match would otherwise qualify.
      if (m.isThirdParty) return;
      var oppId = m.isTagged ? m.submitterId : m.opponent_id;
      if (!oppId || oppId === authUser.id) return;
      counts[oppId] = (counts[oppId] || 0) + 1;
    });
    var s = new Set();
    Object.keys(counts).forEach(function (id) {
      if (counts[id] >= 5) s.add(id);
    });
    return s;
  }, [history, authUser && authUser.id]);

  var feedCardProps = {
    t, authUser, feedLikes, feedLikeCounts, feedComments,
    setFeedLikes, setFeedLikeCounts, setCommentModal, setCommentDraft,
    setDisputeModal, setDisputeDraft,
    confirmOpponentMatch, acceptCorrection, voidMatchAction,
    openProfile, openChallenge,
    toast,
    onOpenInteractions: openInteractions,
    leaguesIndex: leaguesIndex || {},
    onOpenLeague: onOpenLeague,
    viewerRivalsSet: viewerRivalsSet,
  };

  function openLogMatch() {
    setCasualOppName("");
    setScoreModal({ casual: true, oppName: "", tournName: "Casual Match" });
    setScoreDraft({ sets: [{ you: "", them: "" }], result: "win", notes: "", date: new Date().toISOString().slice(0, 10), venue: "", court: "" });
  }

  // ── Unauthenticated: hero + blurred demo feed ──────────────────────────────
  if (!authUser) {
    return (
      <div style={{ maxWidth: 680, margin: "0 auto" }}>
        <div style={{ padding: "36px 20px 24px" }}>
          <div style={{ fontSize: 28, fontWeight: 800, color: t.text, letterSpacing: "-0.6px", marginBottom: 8, lineHeight: 1.2 }}>
            Sydney Tennis.
          </div>
          <div style={{ fontSize: 14, color: t.textSecondary, lineHeight: 1.6, marginBottom: 24 }}>
            See how your friends are playing. Track your wins. Own your suburbs.
          </div>
          <div style={{ display: "flex", gap: 10, marginBottom: 32 }}>
            <button
              onClick={function() { setShowAuth(true); setAuthMode("signup"); setAuthStep("choose"); }}
              style={{ flex: 1, padding: "13px", borderRadius: 9, border: "none", background: t.accent, color: "#fff", fontSize: 14, fontWeight: 700, letterSpacing: "-0.1px" }}>
              Join free
            </button>
            <button
              onClick={function() { setShowAuth(true); setAuthMode("login"); setAuthStep("choose"); }}
              style={{ flex: 1, padding: "13px", borderRadius: 9, border: "1px solid " + t.border, background: "transparent", color: t.text, fontSize: 14, fontWeight: 500 }}>
              Log in
            </button>
          </div>
        </div>
        <div style={{ position: "relative", padding: "0 20px 40px" }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: t.textTertiary, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 14 }}>Recent activity</div>
          <div style={{ filter: "blur(3px)", pointerEvents: "none", userSelect: "none" }}>
            {DEMO_FEED.map(function(m) {
              return <FeedCard key={m.id} m={m} isOwn={false} pName={m.playerName} pAvatar={m.playerAvatar} demo={true} {...feedCardProps} />;
            })}
          </div>
          <div style={{ position: "absolute", top: "40%", left: "50%", transform: "translate(-50%,-50%)", textAlign: "center", background: t.bgCard, border: "1px solid " + t.border, borderRadius: 14, padding: "24px 24px", boxShadow: "0 8px 32px rgba(0,0,0,0.08)", width: "calc(100% - 80px)", maxWidth: 320 }}>
            <div style={{ fontSize: 22, marginBottom: 10 }}>🎾</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: t.text, marginBottom: 6 }}>Your community feed</div>
            <div style={{ fontSize: 13, color: t.textSecondary, lineHeight: 1.6, marginBottom: 18 }}>Sign up to see matches from players you follow and share your own results.</div>
            <button
              onClick={function() { setShowAuth(true); setAuthMode("signup"); setAuthStep("choose"); }}
              style={{ width: "100%", padding: "12px", borderRadius: 8, border: "none", background: t.accent, color: "#fff", fontSize: 13, fontWeight: 700 }}>
              Get started
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Authenticated feed ─────────────────────────────────────────────────────
  // Visual reset v2: the outer wrapper drops the 720px max-width so editorial
  // sections (HomeLeagueBand) can full-bleed. Constrained sections wrap their
  // own content to 720 with generous horizontal padding.
  function tapActivityRow(matchId) {
    if (!matchId) return;
    function scroll() {
      var el = typeof document !== "undefined" ? document.getElementById("feed-match-" + matchId) : null;
      if (!el) return;
      if (el.scrollIntoView) el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.classList.add("cs-deeplink-pulse");
      setTimeout(function () { el.classList.remove("cs-deeplink-pulse"); }, 2000);
    }
    if (!feedExpanded) {
      setFeedExpanded(true);
      // Wait for the full feed to render before trying to scroll.
      setTimeout(scroll, 80);
    } else {
      scroll();
    }
  }

  return (
    <div style={{ width: "100%" }}>
      {/* HERO — borderless editorial composition. Sits directly on the
          page background, generous breathing room around it. */}
      <section style={{
        maxWidth: 720, margin: "0 auto",
        padding: "clamp(40px, 6vw, 72px) clamp(20px, 4vw, 32px) 0",
      }}>
        <HomeHero t={t} profile={profile} history={history} />
      </section>

      {/* NEXT ACTION — single-line urgency (when present) + primary CTA.
          No card chrome. The CTA is the one accent moment in this surface. */}
      <section style={{
        maxWidth: 720, margin: "0 auto",
        padding: "clamp(28px, 4vw, 40px) clamp(20px, 4vw, 32px) 0",
      }}>
        <HomeNextAction
          t={t}
          authUser={authUser}
          profile={profile}
          history={history}
          challengesList={challengesList}
          challengesProfileMap={challengesProfileMap}
          onLogScores={onLogConvertedMatch}
          openLogMatch={openLogMatch}
        />
      </section>

      {/* HAIRLINE — 1px rule, full-rail width. Used instead of a card boundary
          when both sides of the rule belong to the same conceptual flow. */}
      <div style={{
        maxWidth: 720, margin: "clamp(48px, 7vw, 80px) auto 0",
        padding: "0 clamp(20px, 4vw, 32px)",
      }}>
        <div style={{ borderTop: "1px solid " + t.border }} />
      </div>

      {/* WEEK STRIP — three numbers separated by hairlines, no card. Only
          renders when there's been activity in the last 7 days. The
          "Played" cell is a button: tapping it opens All activity with
          the Me filter applied so the user can see exactly the matches
          that contributed to the count. */}
      <section style={{
        maxWidth: 720, margin: "0 auto",
        padding: "clamp(28px, 4vw, 40px) clamp(20px, 4vw, 32px) clamp(28px, 4vw, 40px)",
      }}>
        <HomeWeekStrip
          t={t}
          history={history}
          onPlayedClick={function () {
            setFeedFilter("me");
            setFeedExpanded(true);
            // Wait for the expanded feed to render, then scroll the
            // user to it. matchMedia prefers-reduced-motion is
            // respected by smooth scrolling on modern browsers.
            setTimeout(function () {
              if (typeof document === "undefined") return;
              var el = document.querySelector(".cs-fullbleed-feed-wrap");
              if (el && el.scrollIntoView) {
                el.scrollIntoView({ behavior: "smooth", block: "start" });
              }
            }, 80);
          }}
        />
      </section>

      {/* LEAGUE BAND — full-bleed near-black moment. Escapes the 720px rail
          deliberately for editorial impact. Hidden when the viewer has no
          active leagues. */}
      <HomeLeagueBand
        t={t}
        authUser={authUser}
        history={history}
        myLeagues={myLeagues}
        leagueDetailCache={leagueDetailCache}
        loadLeagueDetail={loadLeagueDetail}
        onOpenLeague={onOpenLeague}
      />

      {/* ACTIVITY LIST — owns the section header "Recent activity / All
          activity" + the toggle (chevron rotates ↓ ↔ ↑). Renders the
          3-row preview when collapsed; when expanded, just the header
          stays visible (the full feed below carries the rich list). */}
      <section style={{
        maxWidth: 720, margin: "0 auto",
        padding: "clamp(40px, 5vw, 64px) clamp(20px, 4vw, 32px) clamp(24px, 3vw, 32px)",
      }}>
        <HomeActivityList
          t={t}
          authUser={authUser}
          profile={profile}
          history={history}
          expanded={feedExpanded}
          onToggle={function () { setFeedExpanded(function (v) { return !v; }); }}
          onTapMatch={tapActivityRow}
        />
      </section>

      {/* NEW-MATCH BANNER — only when realtime detects a fresh match-row that
          isn't in local state. Sits above the full feed when expanded. */}
      {pendingFreshCount > 0 && refreshFeed && feedExpanded && (
        <div style={{
          maxWidth: 720, margin: "0 auto",
          padding: "0 clamp(20px, 4vw, 32px) 12px",
        }}>
          <button
            onClick={refreshFeed}
            className="pop"
            style={{
              width: "100%", padding: "10px 14px",
              background: t.accent, color: "#fff",
              border: "none", borderRadius: 10,
              fontSize: 12, fontWeight: 700, letterSpacing: "-0.1px",
              cursor: "pointer", transition: "opacity 0.15s",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
            }}
            onMouseEnter={function (e) { e.currentTarget.style.opacity = "0.85"; }}
            onMouseLeave={function (e) { e.currentTarget.style.opacity = "1"; }}
          >
            <span style={{ fontSize: 14 }}>↑</span>
            <span>
              {pendingFreshCount === 1
                ? "1 new match — tap to refresh"
                : pendingFreshCount + " new matches — tap to refresh"}
            </span>
          </button>
        </div>
      )}

      {/* FILTER PILLS — only render when the full feed is expanded. */}
      {feedExpanded && (
        <div style={{
          maxWidth: 720, margin: "0 auto",
          padding: "0 clamp(20px, 4vw, 32px) 18px",
          display: "flex", gap: 6,
        }}>
          {[
            { id: "everyone", label: "Everyone" },
            { id: "me",       label: "Me"       },
          ].map(function (f) {
            var on = feedFilter === f.id;
            return (
              <button key={f.id}
                onClick={function () { setFeedFilter(f.id); }}
                style={{
                  fontSize: 12, fontWeight: on ? 700 : 500,
                  color: on ? t.accent : t.textTertiary,
                  background: on ? t.accentSubtle : t.bgCard,
                  border: on ? "1px solid transparent" : "1px solid " + t.border,
                  padding: "5px 14px", borderRadius: 20,
                  cursor: "pointer",
                }}>
                {f.label}
              </button>
            );
          })}
        </div>
      )}

      {/* Full FeedCard list — only when expanded. v2: cs-fullbleed-feed-wrap
          drops horizontal padding on mobile so cards go edge-to-edge
          (Facebook-style); desktop restores the constrained gutter. */}
      <div
        className="cs-fullbleed-feed-wrap"
        style={{
          display: feedExpanded ? "block" : "none",
          maxWidth: 720, margin: "0 auto",
          padding: "0 clamp(20px, 4vw, 32px) 40px",
        }}>
        {(function () {
          // Apply feed filter once, render the chosen slice.
          //   "everyone" — full history (own + tagged + third-party friends)
          //   "me"       — only matches the viewer played in. Third-party
          //                rows (friend-vs-friend, viewer wasn't on court)
          //                are excluded; own + tagged stay.
          var filtered = history;
          if (feedFilter === "me") {
            filtered = history.filter(function (m) { return !m.isThirdParty; });
          }

          if (history.length === 0) {
            return (
              <div style={{ background: t.bgCard, border: "1px solid " + t.border, borderRadius: 14, padding: "48px 24px", textAlign: "center" }}>
                <div style={{ fontSize: 44, marginBottom: 14 }}>🎾</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: t.text, marginBottom: 8, letterSpacing: "-0.3px" }}>Nothing here yet</div>
                <div style={{ fontSize: 13, color: t.textSecondary, lineHeight: 1.7, marginBottom: 24, maxWidth: 280, margin: "0 auto 24px" }}>Log your first match and it'll show up in your feed.</div>
                <button onClick={openLogMatch} style={{ padding: "13px 28px", borderRadius: 9, border: "none", background: t.accent, color: "#fff", fontSize: 14, fontWeight: 700, letterSpacing: "-0.1px" }}>Log your first match</button>
              </div>
            );
          }

          if (feedFilter === "me" && filtered.length === 0) {
            return (
              <div style={{ background: t.bgCard, border: "1px solid " + t.border, borderRadius: 14, padding: "40px 24px", textAlign: "center" }}>
                <div style={{ fontSize: 36, marginBottom: 12 }}>🎾</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: t.text, marginBottom: 6 }}>You haven't played any matches yet</div>
                <div style={{ fontSize: 13, color: t.textSecondary, lineHeight: 1.6, marginBottom: 20, maxWidth: 280, margin: "0 auto 20px" }}>
                  Log a match and it'll show up here.
                </div>
                <button onClick={openLogMatch} style={{ padding: "11px 22px", borderRadius: 9, border: "none", background: t.accent, color: "#fff", fontSize: 13, fontWeight: 700 }}>
                  Log a match
                </button>
              </div>
            );
          }

          // Slice 1: Home feed is condensed by default. "See all" toggles to
          // the full list — same surface, no separate route yet (open question
          // in docs/design-direction.md → revisit when there's real value in
          // a dedicated /feed view).
          var visible = feedExpanded ? filtered : filtered.slice(0, FEED_PREVIEW_LIMIT);
          var hiddenCount = filtered.length - visible.length;

          var cards = visible.map(function (m) {
            // isOwn semantically means "viewer is the poster". A third-
            // party row (friend's match the viewer wasn't in) is NOT
            // tagged AND NOT own — both flags must be false.
            var isOwn = !m.isTagged && !m.isThirdParty;
            // Avatars per scoreboard row. Three cases mirror the FeedCard
            // identity resolver:
            //   own         — poster=viewer (profile.avatar_url),
            //                 opp=m.oppAvatarUrl (loaded in useMatchHistory)
            //   tagged      — poster=m.posterAvatarUrl (submitter),
            //                 opp=viewer (profile.avatar_url)
            //   third-party — poster=m.posterAvatarUrl (submitter),
            //                 opp=m.oppAvatarUrl (linked opponent if any)
            var posterAvatarUrl, oppAvatarUrl;
            if (m.isThirdParty) {
              posterAvatarUrl = m.posterAvatarUrl || null;
              oppAvatarUrl    = m.oppAvatarUrl   || null;
            } else if (m.isTagged) {
              posterAvatarUrl = m.posterAvatarUrl || null;
              oppAvatarUrl    = profile && profile.avatar_url;
            } else {
              posterAvatarUrl = profile && profile.avatar_url;
              oppAvatarUrl    = m.oppAvatarUrl || null;
            }
            // Poster display name — friendName is the enriched submitter
            // name (set for both tagged and third-party rows). Falls back
            // to oppName for legacy rows that lack the enriched field.
            var pName = isOwn
              ? profile.name
              : (m.friendName || m.oppName);
            return (
              <FeedCard
                key={m.id} m={m} isOwn={isOwn} demo={false}
                pName={pName}
                pAvatar={isOwn ? profile.avatar : ""}
                pAvatarUrl={posterAvatarUrl}
                oppAvatarUrl={oppAvatarUrl}
                onDelete={isOwn ? deleteMatch : null}
                onRemove={m.isTagged ? removeTaggedMatch : null}
                rowAnchor={matchDeepLink.rowProps(m.id)}
                {...feedCardProps}
              />
            );
          });

          if (hiddenCount > 0) {
            cards.push(
              <button
                key="cs-see-all"
                onClick={function () { setFeedExpanded(true); }}
                style={{
                  width: "100%",
                  padding: "12px 16px",
                  marginTop: 8,
                  background: "transparent",
                  border: "1px solid " + t.border,
                  borderRadius: 10,
                  color: t.textSecondary,
                  fontSize: 12, fontWeight: 600,
                  letterSpacing: "0.02em",
                  cursor: "pointer",
                  transition: "color 0.15s, border-color 0.15s",
                }}
                onMouseEnter={function (e) {
                  e.currentTarget.style.color = t.text;
                  e.currentTarget.style.borderColor = t.accent + "55";
                }}
                onMouseLeave={function (e) {
                  e.currentTarget.style.color = t.textSecondary;
                  e.currentTarget.style.borderColor = t.border;
                }}>
                See all matches ({hiddenCount} more)
              </button>
            );
          }

          return cards;
        })()}

        {/* Live discovery widget — replaces the old "Coming soon" placeholder.
            Shows up to 3 players (prefer played-before, fall back to suburb)
            with an inline Add/Pending/Friends pill + "See all" CTA. */}
        {history.length > 0 && (function () {
          var rec = (playedOpponents && playedOpponents.length ? playedOpponents : (suggestedPlayers || [])).slice(0, 3);
          if (!rec.length || !friendRelationLabel) return null;
          return (
            <div style={{ background: t.bgCard, border: "1px solid " + t.border, borderRadius: 12, padding: "16px", marginTop: 4 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: t.text }}>Find players to follow</div>
                  <div style={{ fontSize: 12, color: t.textSecondary, marginTop: 2 }}>People near you and opponents you've played.</div>
                </div>
                {onGoToDiscover && (
                  <button onClick={onGoToDiscover} style={{ background: "none", border: "none", color: t.accent, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>See all</button>
                )}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {rec.map(function (u) {
                  var rel = friendRelationLabel(u.id);
                  var loading = !!(socialLoading && socialLoading[u.id]);
                  return (
                    <div key={u.id} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <div onClick={function () { if (openProfile) openProfile(u.id); }}
                        style={{ width: 34, height: 34, borderRadius: "50%", background: avColor(u.name || "?"), display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, color: "#fff", flexShrink: 0, cursor: openProfile ? "pointer" : "default" }}>
                        {(u.avatar || u.name || "?").slice(0, 2).toUpperCase()}
                      </div>
                      <div onClick={function () { if (openProfile) openProfile(u.id); }}
                        style={{ flex: 1, minWidth: 0, cursor: openProfile ? "pointer" : "default" }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: t.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{u.name}</div>
                        <div style={{ fontSize: 11, color: t.textTertiary }}>{[u.suburb, u.skill].filter(Boolean).join(" · ") || "New player"}</div>
                      </div>
                      {rel === "none" && sendFriendRequest && (
                        <button disabled={loading} onClick={function () { sendFriendRequest(u); }}
                          style={{ padding: "6px 14px", borderRadius: 8, border: "none", background: t.accent, color: "#fff", fontSize: 12, fontWeight: 600, opacity: loading ? 0.6 : 1, cursor: "pointer", flexShrink: 0 }}>
                          {loading ? "…" : "Add"}
                        </button>
                      )}
                      {rel === "sent" && (
                        <span style={{ padding: "6px 12px", borderRadius: 8, border: "1px solid " + t.border, color: t.textSecondary, fontSize: 11, fontWeight: 500, flexShrink: 0 }}>Pending</span>
                      )}
                      {rel === "friends" && (
                        <span style={{ padding: "6px 12px", borderRadius: 8, color: t.accent, fontSize: 11, fontWeight: 700, flexShrink: 0 }}>Friends ✓</span>
                      )}
                      {rel === "received" && (
                        <span style={{ padding: "6px 12px", borderRadius: 8, color: t.green, fontSize: 11, fontWeight: 600, flexShrink: 0 }}>Added you</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })()}
      </div>

      {/* Strava-style Kudos / Comments modal — triggered from the feed-card
          social footer counts and the 💬 icon. */}
      <FeedInteractionsModal
        t={t}
        modal={interactionsModal}
        onClose={closeInteractions}
        authUser={authUser}
        profile={profile}
        feedComments={feedComments}
        setFeedComments={setFeedComments}
        commentDraft={commentDraft}
        setCommentDraft={setCommentDraft}
        onCommentPosted={notifyMatchOwnerOfComment}
        openProfile={openProfile}
        friendRelationLabel={friendRelationLabel}
        sendFriendRequest={sendFriendRequest}
        cancelRequest={cancelRequest}
        acceptRequest={acceptRequest}
        sentReq={sentReq}
        recvReq={recvReq}
        socialLoading={socialLoading}
        liked={interactionsModal ? !!feedLikes[interactionsModal.matchId] : false}
        onToggleLike={toggleLikeForModalMatch}
      />
    </div>
  );
}
