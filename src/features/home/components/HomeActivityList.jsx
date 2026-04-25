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

function ActivityRow({ t, m, isLast, onTap, profile }) {
  var isOwn = !m.isTagged;
  // For own matches the poster IS the viewer; for tagged matches the
  // poster is the friend who logged it (m.friendName per the
  // loadHistory enrichment). m.playerName isn't a field on real
  // history rows — it only exists on the unauth DEMO_FEED.
  var posterName = isOwn ? (profile && profile.name) || "You" : (m.friendName || m.oppName || "Player");
  var oppDisplay = m.isTagged
    ? (profile && profile.name) || "You"  // viewer is the opponent on tagged rows
    : (m.oppName || "Opponent");
  var iWon = m.result === "win";
  var score = shortScore(m.sets);

  // Avatar source — own match → viewer's photo; tagged → submitter's
  // photo (m.posterAvatarUrl populated by loadHistory enrichment).
  var avatarUrl = isOwn ? (profile && profile.avatar_url) || null : (m.posterAvatarUrl || null);

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

// Toggle button used in both collapsed + expanded states. Single source of
// truth for the chevron direction so the visual cue ("more below" vs "collapse
// up") stays consistent.
function ToggleButton({ t, expanded, totalCount, onClick }) {
  return (
    <button
      onClick={onClick}
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
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
      }}
      onMouseEnter={function (e) { e.currentTarget.style.color = t.text; }}
      onMouseLeave={function (e) { e.currentTarget.style.color = t.textSecondary; }}>
      <span>
        {expanded
          ? "Show less"
          : "Show all" + (totalCount ? " (" + totalCount + ")" : "")}
      </span>
      <svg width="11" height="11" viewBox="0 0 18 18" fill="none"
        style={{ transform: expanded ? "rotate(180deg)" : "none", transition: "transform 0.2s" }}>
        <path d="M4 7l5 5 5-5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    </button>
  );
}

export default function HomeActivityList({
  t,
  history,
  authUser,
  profile,
  expanded,        // when true, the 3-row preview is hidden — just the
                   // section header with a "Show less ↑" toggle renders
  onToggle,        // () => void; flips the expanded state in HomeTab
  onTapMatch,      // (matchId) => void; scrolls to the FeedCard for that match
}) {
  if (!authUser) return null;

  // Total count drives the toggle label ("Show all (8)") so the user knows
  // how many more matches are hidden behind the toggle.
  var allConfirmed = (history || []).filter(function (m) { return m.status === "confirmed"; });
  var totalCount = allConfirmed.length;
  var rows = allConfirmed.slice(0, 3);

  if (!rows.length) return null;

  // When expanded, render ONLY the section header — the 3-row preview is
  // hidden because the full feed below carries the same matches in richer
  // form. Avoids two stacked lists of the same data.
  return (
    <div className="cs-home-activity">
      <div style={{
        display: "flex",
        alignItems: "baseline",
        justifyContent: "space-between",
        marginBottom: expanded ? 0 : 8,
      }}>
        <div style={{
          fontSize: "clamp(20px, 3vw, 24px)",
          fontWeight: 700,
          color: t.text,
          letterSpacing: "-0.02em",
        }}>
          {expanded ? "All activity" : "Recent activity"}
        </div>
        {onToggle && totalCount > 3 && (
          <ToggleButton t={t} expanded={!!expanded} totalCount={totalCount} onClick={onToggle} />
        )}
      </div>
      {!expanded && (
        <div>
          {rows.map(function (m, i) {
            return (
              <ActivityRow
                key={m.id}
                t={t}
                m={m}
                profile={profile}
                isLast={i === rows.length - 1}
                onTap={onTapMatch ? function () { onTapMatch(m.id); } : undefined}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
