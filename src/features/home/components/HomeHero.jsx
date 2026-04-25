// src/features/home/components/HomeHero.jsx
//
// Slice 1 of the design overhaul: the Hero is the FIRST thing the
// authenticated user sees. It establishes identity (avatar + name),
// surfaces the signature metric (ranking points), and shows recent
// form. Replaces the old "Feed" page-header.
//
// Design rules followed (see docs/design-direction.md):
//   • Identity over utility — Hero reads as "who I am as a player"
//   • One thing matters most — the ranking number is dominant
//   • Calm hierarchy — no equal-weight badges, single trust pill
//
// Responsive intent:
//   • Mobile <1024px:  centered vertical stack, avatar 72px
//   • Desktop ≥1024px: editorial 2-col layout, avatar 88px on the
//                      left, identity + signature metric on the right
//
// Empty state (no confirmed matches yet): the Hero renders a welcome
// frame instead of a 1000-rating ghost number — so brand-new users
// land on something motivating, not a zero.

import PlayerAvatar from "../../../components/ui/PlayerAvatar.jsx";
import { displayLocation } from "../../../lib/utils/avatar.js";
import { computeRecentForm } from "../../profile/utils/profileStats.js";

export default function HomeHero({ t, profile, history, friends }) {
  if (!profile) return null;

  var played       = (profile.matches_played != null)
    ? profile.matches_played
    : (history || []).filter(function (m) { return m.status === "confirmed"; }).length;
  var hasMatches   = played > 0;
  var rankPts      = profile.ranking_points != null ? profile.ranking_points : 1000;
  var recentForm   = computeRecentForm(history || [], 5);
  var location     = displayLocation(profile);

  // Light community-pulse phrase folded in from the old standalone strip
  // — kept short and only when there's something to say.
  var pulse = (function () {
    if (!history || !history.length) return null;
    var friendIdSet = new Set((friends || []).map(function (f) { return f.id; }));
    var oneWeekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    var thisWeek = history.filter(function (m) {
      if (m.status !== "confirmed") return false;
      var d = m.rawDate ? new Date(m.rawDate).getTime() : 0;
      return d >= oneWeekAgo;
    });
    if (!thisWeek.length) return null;
    var friendsThisWeek = thisWeek.filter(function (m) {
      return (m.submitterId && friendIdSet.has(m.submitterId))
          || (m.opponent_id && friendIdSet.has(m.opponent_id));
    });
    if (friendsThisWeek.length) {
      return friendsThisWeek.length + " friend match" + (friendsThisWeek.length !== 1 ? "es" : "") + " this week";
    }
    return thisWeek.length + " confirmed match" + (thisWeek.length !== 1 ? "es" : "") + " this week";
  })();

  // ── Empty-state hero (zero confirmed matches) ──────────────────────────
  if (!hasMatches) {
    return (
      <div style={shellStyle(t)}>
        <div className="cs-hero-row" style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <PlayerAvatar name={profile.name} avatar={profile.avatar} profile={profile} size={72}/>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: t.text, letterSpacing: "-0.5px", lineHeight: 1.1 }}>
              {profile.name || "Welcome"}
            </div>
            <div style={{ fontSize: 13, color: t.textSecondary, marginTop: 4 }}>
              {location || "Set your suburb to see local players"}
            </div>
          </div>
        </div>
        <div style={{ marginTop: 18, fontSize: 14, color: t.textSecondary, lineHeight: 1.5 }}>
          Log your first match to start tracking your ranking and form.
        </div>
      </div>
    );
  }

  // ── Standard hero ──────────────────────────────────────────────────────
  return (
    <div style={shellStyle(t)}>
      {/* Identity row — avatar + name + location/skill */}
      <div className="cs-hero-row" style={{ display: "flex", alignItems: "center", gap: 16 }}>
        <PlayerAvatar name={profile.name} avatar={profile.avatar} profile={profile} size={72}/>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 22, fontWeight: 800, color: t.text, letterSpacing: "-0.5px", lineHeight: 1.1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {profile.name || "You"}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 5, fontSize: 12, color: t.textSecondary }}>
            {location && <span>{location}</span>}
            {location && profile.skill && <span style={{ color: t.textTertiary }}>·</span>}
            {profile.skill && <span style={{ color: t.accent, fontWeight: 600 }}>{profile.skill}</span>}
          </div>
        </div>
      </div>

      {/* Signature metric + recent form. On desktop, side-by-side; on mobile, stacked. */}
      <div className="cs-hero-stats" style={{ display: "flex", alignItems: "flex-end", gap: 28, marginTop: 22, flexWrap: "wrap" }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 38, fontWeight: 800, color: t.text, letterSpacing: "-1px", lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>
            {rankPts.toLocaleString()}
          </div>
          <div style={{ fontSize: 10, fontWeight: 700, color: t.textTertiary, textTransform: "uppercase", letterSpacing: "0.08em", marginTop: 6 }}>
            Ranking points
          </div>
        </div>

        {recentForm.length > 0 && (
          <div style={{ minWidth: 0 }}>
            <div style={{ display: "flex", gap: 4 }}>
              {recentForm.map(function (r, i) {
                var isW = r === "W";
                return (
                  <span key={i} style={{
                    width: 22, height: 22,
                    borderRadius: 0,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 11, fontWeight: 700,
                    color: isW ? t.green : t.red,
                    background: isW ? t.greenSubtle : t.redSubtle,
                    border: "1px solid " + (isW ? t.green : t.red) + "33",
                  }}>{r}</span>
                );
              })}
            </div>
            <div style={{ fontSize: 10, fontWeight: 700, color: t.textTertiary, textTransform: "uppercase", letterSpacing: "0.08em", marginTop: 6 }}>
              Recent form
            </div>
          </div>
        )}
      </div>

      {/* Pulse line — small, subtle, only when there's signal */}
      {pulse && (
        <div style={{ marginTop: 18, fontSize: 11, color: t.textTertiary, letterSpacing: "0.01em", display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: t.green, flexShrink: 0 }}/>
          <span>{pulse}</span>
        </div>
      )}
    </div>
  );
}

function shellStyle(t) {
  return {
    margin: "0 auto",
    padding: "28px 20px 24px",
    background: t.bgCard,
    border: "1px solid " + t.border,
    borderRadius: 14,
  };
}
