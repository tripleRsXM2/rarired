// src/features/home/components/HomeActivityList.jsx
//
// Visual reset v2: a borderless 3-row activity preview that lives at
// the bottom of the Home surface. Replaces the dense FeedCard list
// (which previously was the entire Home).
//
// Per docs/design-direction.md → Visual reset (v2): "Activity preview
// is max 3 rows, not 5. The full feed lives one tap away. No card
// chrome on Home — that lives on the dedicated feed view."
//
// Each row is intentionally minimal:
//   - 32px avatar
//   - Player name + W/L pill
//   - One-line "{date} · {opponent} · {score}"
//   - Hairline divider between rows (no card)
//
// Tap on a row opens the full FeedCard for that match (deep-link).
// "See all activity" link below jumps to the full feed view (which
// in v2 is /home itself with the legacy FeedCard list — temporary
// until a dedicated /feed route exists).

import PlayerAvatar from "../../../components/ui/PlayerAvatar.jsx";

function shortScore(sets) {
  if (!sets || !sets.length) return null;
  return sets.map(function (s) {
    var y = s.you == null ? "" : String(s.you).trim();
    var t = s.them == null ? "" : String(s.them).trim();
    if (y === "" && t === "") return null;
    return (y || "—") + "-" + (t || "—");
  }).filter(Boolean).join(" ");
}

function ActivityRow({ t, m, isLast, onTap }) {
  var isOwn = !m.isTagged;
  var posterName = isOwn ? m.playerName : m.playerName; // FeedCard logic — same source either way
  var oppDisplay = m.isTagged
    ? (m.friendName || m.oppName || "Opponent")
    : (m.oppName || "Opponent");
  var iWon = m.result === "win";
  var score = shortScore(m.sets);

  // Avatar source — for own rows, the viewer's photo; for tagged
  // rows, the submitter's photo. The FeedCard plumbing already gives
  // us posterAvatarUrl / m.posterAvatarUrl on tagged rows.
  var avatarUrl = isOwn ? null : (m.posterAvatarUrl || null);

  return (
    <div
      onClick={onTap}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "16px 0",
        borderBottom: isLast ? "none" : "1px solid " + t.border,
        cursor: onTap ? "pointer" : "default",
        minWidth: 0,
      }}>
      <PlayerAvatar
        name={posterName || "Player"}
        avatar={null}
        avatarUrl={avatarUrl}
        size={32}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 14,
          fontWeight: 600,
          color: t.text,
          letterSpacing: "-0.1px",
          lineHeight: 1.2,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}>
          {posterName || "Player"}
          {isOwn && <span style={{ color: t.textTertiary, fontWeight: 500, marginLeft: 6 }}>· You</span>}
        </div>
        <div style={{
          marginTop: 3,
          fontSize: 12,
          color: t.textTertiary,
          letterSpacing: "0.01em",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}>
          {[m.date, "vs " + oppDisplay, score].filter(Boolean).join(" · ")}
        </div>
      </div>
      <span style={{
        flexShrink: 0,
        fontSize: 10,
        fontWeight: 800,
        letterSpacing: "0.12em",
        textTransform: "uppercase",
        color: iWon ? t.green : t.red,
      }}>
        {iWon ? "Won" : "Lost"}
      </span>
    </div>
  );
}

export default function HomeActivityList({
  t,
  history,
  authUser,
  onSeeAll,        // callback for "See all activity" — deep-link
  onTapMatch,      // (matchId) => void; scrolls to the FeedCard for that match
}) {
  if (!authUser) return null;

  // Confirmed matches only. Cap at 3.
  var rows = (history || [])
    .filter(function (m) { return m.status === "confirmed"; })
    .slice(0, 3);

  if (!rows.length) return null;

  return (
    <div className="cs-home-activity">
      <div style={{
        display: "flex",
        alignItems: "baseline",
        justifyContent: "space-between",
        marginBottom: 8,
      }}>
        <div style={{
          fontSize: "clamp(20px, 3vw, 24px)",
          fontWeight: 700,
          color: t.text,
          letterSpacing: "-0.02em",
        }}>
          Recent activity
        </div>
        {onSeeAll && (
          <button
            onClick={onSeeAll}
            style={{
              background: "transparent",
              border: "none",
              padding: 0,
              fontSize: 11,
              fontWeight: 700,
              color: t.textSecondary,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              cursor: "pointer",
            }}>
            See all →
          </button>
        )}
      </div>
      <div>
        {rows.map(function (m, i) {
          return (
            <ActivityRow
              key={m.id}
              t={t}
              m={m}
              isLast={i === rows.length - 1}
              onTap={onTapMatch ? function () { onTapMatch(m.id); } : undefined}
            />
          );
        })}
      </div>
    </div>
  );
}
