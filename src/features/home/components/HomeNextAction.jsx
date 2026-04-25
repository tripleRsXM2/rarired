// src/features/home/components/HomeNextAction.jsx
//
// Slice 1 of the design overhaul: the single contextual "next thing"
// card that sits directly under the Hero. Replaces both the generic
// "+ Log match" header button AND the standalone NextChallengeBanner.
//
// Design rule (docs/design-direction.md): one strong next action per
// screen, contextual to the user's state — never a generic CTA when
// there's a real next step.
//
// Priority (highest first — only one renders at a time):
//   1. Match in dispute needing MY response   (red,    urgent)
//   2. Match pending MY confirmation          (orange, urgent)
//   3. Accepted challenge in next 14 days     (accent, action)
//   4. (Future) League rank moved last 7d     (green,  positive)
//   5. Default: "Log a match"                 (neutral)
//
// "League rank moved" is intentionally deferred — it needs per-match
// snapshot deltas we don't surface yet. Documented in design-direction.md.

import PlayerAvatar from "../../../components/ui/PlayerAvatar.jsx";

// ── Selection helpers ────────────────────────────────────────────────────────

function pickDisputeMatch(history, authUserId) {
  if (!history || !authUserId) return null;
  for (var i = 0; i < history.length; i++) {
    var m = history[i];
    var isInDispute = m.status === "disputed" || m.status === "pending_reconfirmation";
    if (isInDispute && m.pendingActionBy === authUserId) return m;
  }
  return null;
}

function pickPendingConfirmMatch(history, authUserId) {
  if (!history || !authUserId) return null;
  // I need to confirm a match someone else logged: status=pending_confirmation
  // AND I'm the tagged opponent (m.isTagged means viewer is the opponent).
  for (var i = 0; i < history.length; i++) {
    var m = history[i];
    if (m.status === "pending_confirmation" && m.isTagged) return m;
  }
  return null;
}

function pickNextChallenge(challenges, authUserId) {
  if (!challenges || !challenges.length || !authUserId) return null;
  var FOURTEEN_DAYS = 14 * 24 * 60 * 60 * 1000;
  var now = Date.now();
  var upcoming = challenges.filter(function (c) {
    if (c.status !== "accepted") return false;
    if (c.challenger_id !== authUserId && c.challenged_id !== authUserId) return false;
    if (!c.proposed_at) return true;
    var ts = new Date(c.proposed_at).getTime();
    if (isNaN(ts)) return true;
    return ts >= now - 3 * 60 * 60 * 1000 && ts <= now + FOURTEEN_DAYS;
  });
  upcoming.sort(function (a, b) {
    var ad = a.proposed_at ? new Date(a.proposed_at).getTime() : Infinity;
    var bd = b.proposed_at ? new Date(b.proposed_at).getTime() : Infinity;
    if (ad !== bd) return ad - bd;
    return (new Date(b.created_at || 0)).getTime() - (new Date(a.created_at || 0)).getTime();
  });
  return upcoming[0] || null;
}

function fmtChallengeWhen(iso) {
  if (!iso) return null;
  var d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  var now = new Date();
  var sameDay = d.toDateString() === now.toDateString();
  var tomorrow = new Date(now); tomorrow.setDate(now.getDate() + 1);
  var isTomorrow = d.toDateString() === tomorrow.toDateString();
  var hm = d.toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit" });
  if (sameDay)    return "Today · " + hm;
  if (isTomorrow) return "Tomorrow · " + hm;
  return d.toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short" }) + " · " + hm;
}

function scrollToFeedMatch(matchId) {
  if (typeof document === "undefined") return;
  var el = document.getElementById("feed-match-" + matchId);
  if (!el) return;
  if (el.scrollIntoView) el.scrollIntoView({ behavior: "smooth", block: "center" });
  el.classList.add("cs-deeplink-pulse");
  setTimeout(function () { el.classList.remove("cs-deeplink-pulse"); }, 2000);
}

// ── Component ────────────────────────────────────────────────────────────────

export default function HomeNextAction({
  t, authUser, profile,
  history,
  challengesList, challengesProfileMap,
  onLogScores,        // (challenge, partner) => void   — accepted-challenge path
  openLogMatch,       // ()                  => void   — neutral-default path
}) {
  if (!authUser) return null;

  // Resolve in priority order — first hit wins.
  var disputeMatch = pickDisputeMatch(history, authUser.id);
  var pendingMatch = !disputeMatch ? pickPendingConfirmMatch(history, authUser.id) : null;
  var challenge    = (!disputeMatch && !pendingMatch) ? pickNextChallenge(challengesList, authUser.id) : null;

  var card = null;

  if (disputeMatch) {
    var oppName = disputeMatch.opponentName || disputeMatch.playerName || "your opponent";
    card = {
      tone: "red",
      eyebrow: "Action needed",
      title: "Match needs your response",
      subtitle: "vs " + oppName + " · review proposal or dispute",
      ctaLabel: "Review match",
      onCta: function () { scrollToFeedMatch(disputeMatch.id); },
    };
  } else if (pendingMatch) {
    var poster = pendingMatch.playerName || "Opponent";
    card = {
      tone: "orange",
      eyebrow: "Confirm match",
      title: poster + " logged a match against you",
      subtitle: "Confirm the score or open a dispute",
      ctaLabel: "Review",
      onCta: function () { scrollToFeedMatch(pendingMatch.id); },
    };
  } else if (challenge) {
    var partnerId = challenge.challenger_id === authUser.id ? challenge.challenged_id : challenge.challenger_id;
    var partner = (challengesProfileMap && challengesProfileMap[partnerId]) || { id: partnerId, name: "Player" };
    var whenLabel  = fmtChallengeWhen(challenge.proposed_at);
    var whereLabel = [challenge.venue, challenge.court].filter(Boolean).join(" · ");
    var sub = [whenLabel, whereLabel].filter(Boolean).join(" · ");
    card = {
      tone: "accent",
      eyebrow: "Next challenge",
      title: "vs " + (partner.name || "Player"),
      subtitle: sub || "Coordinate a time and log the result",
      avatar: partner,
      ctaLabel: "Log scores",
      onCta: function () { if (onLogScores) onLogScores(challenge, partner); },
    };
  } else {
    // Neutral default — single CTA per screen rule.
    var hasMatches = (profile && profile.matches_played != null && profile.matches_played > 0)
      || (history || []).some(function (m) { return m.status === "confirmed"; });
    card = {
      tone: "neutral",
      eyebrow: hasMatches ? "Up next" : "Get started",
      title: hasMatches ? "Log a match" : "Log your first match",
      subtitle: hasMatches ? "Track your progress and rank" : "Start your CourtSync identity",
      ctaLabel: hasMatches ? "Log match" : "Log first match",
      onCta: function () { if (openLogMatch) openLogMatch(); },
    };
  }

  // Tone → colors. We deliberately keep the tonal cue subtle — the eyebrow
  // line carries the urgency, the card itself stays calm.
  var toneAccent =
    card.tone === "red"     ? t.red    :
    card.tone === "orange"  ? t.orange :
    card.tone === "green"   ? t.green  :
    card.tone === "accent"  ? t.accent :
    /* neutral */             t.textSecondary;

  var ctaBg = card.tone === "neutral" ? t.text : toneAccent;

  return (
    <div style={{
      background: t.bgCard,
      border: "1px solid " + t.border,
      borderLeft: "3px solid " + toneAccent,
      borderRadius: 12,
      padding: "16px 18px",
      display: "flex",
      alignItems: "center",
      gap: 14,
    }}>
      {card.avatar && (
        <div style={{ flexShrink: 0 }}>
          <PlayerAvatar
            name={card.avatar.name}
            avatar={card.avatar.avatar}
            profile={card.avatar}
            size={44}
          />
        </div>
      )}

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 10, fontWeight: 700, color: toneAccent,
          letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 4,
        }}>
          {card.eyebrow}
        </div>
        <div style={{
          fontSize: 15, fontWeight: 700, color: t.text,
          letterSpacing: "-0.2px", lineHeight: 1.25,
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>
          {card.title}
        </div>
        {card.subtitle && (
          <div style={{
            fontSize: 12, color: t.textSecondary, marginTop: 3,
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>
            {card.subtitle}
          </div>
        )}
      </div>

      <button
        onClick={card.onCta}
        style={{
          flexShrink: 0,
          padding: "10px 16px",
          borderRadius: 8,
          border: "none",
          background: ctaBg,
          color: "#fff",
          fontSize: 12,
          fontWeight: 700,
          letterSpacing: "0.02em",
          cursor: "pointer",
          transition: "opacity 0.15s",
        }}
        onMouseEnter={function (e) { e.currentTarget.style.opacity = "0.85"; }}
        onMouseLeave={function (e) { e.currentTarget.style.opacity = "1"; }}>
        {card.ctaLabel}
      </button>
    </div>
  );
}
