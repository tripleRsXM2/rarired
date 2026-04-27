// src/features/home/components/HomeNextAction.jsx
//
// Visual reset v2: the contextual next-action surface is no longer a
// bordered card. It's a single line of bold text with an inline arrow
// link, sitting under the Hero. The accent left-border / boxed body /
// avatar / CTA-pill chrome is gone.
//
// Three urgency states + neutral default:
//   1. dispute_needs_response  — red text, urgent verb
//   2. pending_confirm         — orange text, action verb
//   3. accepted_challenge      — accent text, calendar context
//   4. neutral                 — primary CTA pill, generously sized
//
// 1-3 render inline above the primary CTA when relevant. The neutral
// default is the primary "Log a match" CTA. Per docs/design-direction
// → Visual reset v2 ("Restraint with the accent").

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
  if (sameDay)    return "today · " + hm;
  if (isTomorrow) return "tomorrow · " + hm;
  return d.toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short" }).toLowerCase() + " · " + hm;
}

function scrollToFeedMatch(matchId) {
  if (typeof document === "undefined") return;
  var el = document.getElementById("feed-match-" + matchId);
  if (!el) return;
  if (el.scrollIntoView) el.scrollIntoView({ behavior: "smooth", block: "center" });
  el.classList.add("cs-deeplink-pulse");
  setTimeout(function () { el.classList.remove("cs-deeplink-pulse"); }, 2000);
}

// ── Inline urgency rows — bold text, no card ────────────────────────────────

function UrgencyLine({ t, color, label, verb, onClick }) {
  // Layout: [label pill] [verb (wraps) ......... arrow]
  // Previously the verb had whiteSpace: nowrap + ellipsis, which
  // truncated long names like "Mikey logged a match with you" on
  // 375px viewports. Now the verb wraps to a second line and the
  // arrow stays at the end (via flex-wrap on the row + the arrow
  // having flex-shrink: 0).
  return (
    <button
      onClick={onClick}
      style={{
        background: "transparent",
        border: "none",
        padding: 0,
        margin: 0,
        textAlign: "left",
        cursor: "pointer",
        display: "flex",
        flexWrap: "wrap",
        alignItems: "baseline",
        columnGap: 8,
        rowGap: 4,
        fontSize: "clamp(15px, 2vw, 17px)",
        fontWeight: 600,
        color: t.text,
        letterSpacing: "-0.2px",
        lineHeight: 1.35,
        width: "100%",
      }}>
      <span style={{
        fontSize: 10,
        fontWeight: 800,
        color: color,
        letterSpacing: "0.12em",
        textTransform: "uppercase",
        flexShrink: 0,
      }}>
        {label}
      </span>
      <span style={{
        flex: "1 1 auto",
        minWidth: 0,
        overflowWrap: "anywhere",
        // Trailing arrow lives at the end of the verb so it always
        // sits adjacent to the readable text, even after wrap.
      }}>
        {verb}{" "}
        <span style={{ color: color, fontWeight: 800, whiteSpace: "nowrap" }}>→</span>
      </span>
    </button>
  );
}

// ── Primary CTA — pill, generous, single accent moment ──────────────────────

function PrimaryCTA({ t, label, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: t.text,
        color: t.bg,
        border: "none",
        borderRadius: 10,
        padding: "16px 28px",
        fontSize: 14,
        fontWeight: 700,
        letterSpacing: "0.04em",
        textTransform: "uppercase",
        cursor: "pointer",
        transition: "opacity 0.15s",
      }}
      onMouseEnter={function (e) { e.currentTarget.style.opacity = "0.85"; }}
      onMouseLeave={function (e) { e.currentTarget.style.opacity = "1"; }}>
      {label}
    </button>
  );
}

// ── Component ───────────────────────────────────────────────────────────────

export default function HomeNextAction({
  t, authUser, profile,
  history,
  challengesList, challengesProfileMap,
  onLogScores,
  openLogMatch,
  // Optional. When wired (HomeTab passes it through from App.jsx),
  // urgency clicks open the ActionReviewDrawer overlay instead of
  // doing a scroll-to-feed-match (which fails when the feed isn't
  // rendered or the active filter excludes the match).
  onReviewMatch,
}) {
  if (!authUser) return null;

  var disputeMatch = pickDisputeMatch(history, authUser.id);
  var pendingMatch = !disputeMatch ? pickPendingConfirmMatch(history, authUser.id) : null;
  var challenge    = (!disputeMatch && !pendingMatch) ? pickNextChallenge(challengesList, authUser.id) : null;

  // Urgency line (if any) renders above the primary CTA. The CTA is
  // always present — the page's primary action is "Log a match",
  // contextual urgency just precedes it.
  //
  // Click handlers prefer onReviewMatch (opens the ActionReviewDrawer
  // overlay — same path notifications use) when wired by App.jsx;
  // fall back to scrollToFeedMatch otherwise. Scroll-to is fragile
  // (only works if the feed has rendered the match card, which fails
  // when the user landed here from a notification deep-link before
  // the feed list mounted, or when the active feed filter doesn't
  // include the match).
  var urgency = null;
  function reviewOrScroll(match) {
    return function () {
      if (onReviewMatch) onReviewMatch(match);
      else               scrollToFeedMatch(match.id);
    };
  }

  // Resolve the most-likely display name for the OTHER party on a
  // match row. useMatchHistory enriches tagged rows with `friendName`
  // (the linked-friend match override) and casual rows with `oppName`
  // (free-text). `playerName` is set inconsistently on the legacy
  // path. Falls through to "Someone" rather than the harsher
  // "Opponent" — reads as a placeholder, not a label.
  function nameForMatch(m) {
    if (!m) return "Someone";
    return m.friendName || m.playerName || m.opponentName || m.oppName || "Someone";
  }

  if (disputeMatch) {
    var oppName = nameForMatch(disputeMatch);
    urgency = {
      color: t.red,
      label: "Action needed",
      verb: "Match vs " + oppName + " needs your response",
      onClick: reviewOrScroll(disputeMatch),
    };
  } else if (pendingMatch) {
    var poster = nameForMatch(pendingMatch);
    urgency = {
      color: t.orange,
      label: "Confirm match",
      verb: poster + " logged a match with you",
      onClick: reviewOrScroll(pendingMatch),
    };
  } else if (challenge) {
    var partnerId = challenge.challenger_id === authUser.id ? challenge.challenged_id : challenge.challenger_id;
    var partner = (challengesProfileMap && challengesProfileMap[partnerId]) || { id: partnerId, name: "Player" };
    var when = fmtChallengeWhen(challenge.proposed_at);
    var verb = "Playing " + (partner.name || "Player") + (when ? " · " + when : "");
    urgency = {
      color: t.accent,
      label: "Next challenge",
      verb: verb,
      onClick: function () { if (onLogScores) onLogScores(challenge, partner); },
    };
  }

  // Choose CTA label based on whether the user has any confirmed matches.
  var hasMatches = (profile && profile.matches_played != null && profile.matches_played > 0)
    || (history || []).some(function (m) { return m.status === "confirmed" && !m.isThirdParty; });
  var ctaLabel = hasMatches ? "Log a match" : "Log your first match";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {urgency && (
        <UrgencyLine
          t={t}
          color={urgency.color}
          label={urgency.label}
          verb={urgency.verb}
          onClick={urgency.onClick}
        />
      )}
      <PrimaryCTA
        t={t}
        label={ctaLabel}
        onClick={openLogMatch}
      />
    </div>
  );
}
