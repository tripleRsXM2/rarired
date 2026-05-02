// src/features/home/pages/ProfileScreen.jsx
//
// Editorial Tennis profile screen (per design-handoff/README §4).
//
// Replaces the dense ProfileTab on /profile (own-profile only) with a
// minimal editorial view:
//   1. Avatar XL + region/level + joined date row (this is the hero
//      block — when it scrolls out of view, the global top bar fades
//      "Profile" in)
//   2. Big rating numeral (clamp 78–104px) + ▲ delta + "CourtSync
//      rating" microlabel
//   3. 2x2 stat grid — Rank / Win rate / Time on court / Win streak
//   4. Best win callout
//   5. Achievements chip row (placeholder until the trust badge
//      system is wired in — Module 10 territory)
//
// 2026-05-02: dropped the EditorialScreen wrapper + the redundant
// 56px "Profile" hero title — the global top mob-nav now handles
// the title (fades in on scroll). Editing happens via the avatar
// button in the top mob nav (opens SettingsScreen) — the same
// path the rest of the app uses, so we don't surface a duplicate
// "Edit" affordance here.
//
// Stats sourced from the same currentUser.profile + matchHistory
// state ProfileTab uses today, so we don't introduce a new data
// pipeline — only a new presentation.

import { useEffect, useMemo, useRef } from "react";
import { ED_TOK, MicroLabel, EdDivider } from "../components/EditorialScreen.jsx";
import PlayerAvatar from "../../../components/ui/PlayerAvatar.jsx";

export default function ProfileScreen({
  authUser,
  profile,
  history,
  // Editorial top-bar scroll callback (App.jsx). Flips to true when
  // the avatar/region hero block scrolls out of view so the global
  // top nav can fade in "Profile". Defaults to a no-op so the page
  // still renders if mounted outside the App.jsx hierarchy.
  setScrolledPastHero,
}) {
  var heroRef = useRef(null);
  useEffect(function () {
    if (!heroRef.current) return;
    if (!setScrolledPastHero) return;
    setScrolledPastHero(false);
    var io = new IntersectionObserver(function (entries) {
      setScrolledPastHero(!entries[0].isIntersecting);
    }, { threshold: 0.1 });
    io.observe(heroRef.current);
    return function () { io.disconnect(); };
  }, [setScrolledPastHero]);

  // ── Derive the editorial fields from real data ────────────────
  var name = (profile && profile.name) || (authUser && authUser.email && authUser.email.split("@")[0]) || "Player";
  var handle = profile && profile.username ? "@" + profile.username : "";
  var region = (profile && profile.suburb) || "Set a home court";
  var level  = (profile && profile.skill)  || "Add a level";
  var joined = formatJoined(profile && (profile.created_at || profile.joined_at));

  var rating = (profile && profile.ranking_points != null) ? Math.round(profile.ranking_points) : null;
  var ratingDelta = (profile && profile.ranking_delta != null) ? Math.round(profile.ranking_delta) : null;

  // Match-derived stats — use confirmed history only, viewer-frame
  // result is already attached by useMatchHistory.
  var stats = useMemo(function () {
    var confirmed = (history || []).filter(function (m) { return m.status === "confirmed"; });
    var rankedConfirmed = confirmed.filter(function (m) { return m.match_type === "ranked"; });
    var wins = rankedConfirmed.filter(function (m) { return m.result === "win"; }).length;
    var losses = rankedConfirmed.filter(function (m) { return m.result === "loss"; }).length;
    var winrate = (wins + losses) > 0 ? Math.round((wins / (wins + losses)) * 100) : null;
    // Win streak — longest tail of consecutive wins in viewer-frame
    // result, walking newest → oldest. useMatchHistory sorts history
    // descending by date, so we just walk the array.
    var streak = 0;
    for (var i = 0; i < confirmed.length; i++) {
      if (confirmed[i].result === "win") streak++;
      else break;
    }
    // Best win — confirmed ranked wins, sorted by opponent rating
    // when we have it. Falls back to most-recent ranked win if rating
    // wasn't surfaced on the row.
    var bestWin = null;
    var rankedWins = rankedConfirmed.filter(function (m) { return m.result === "win"; });
    if (rankedWins.length) {
      bestWin = rankedWins.slice().sort(function (a, b) {
        var ar = a.opponent_rating != null ? a.opponent_rating : 0;
        var br = b.opponent_rating != null ? b.opponent_rating : 0;
        return br - ar;
      })[0];
    }
    return {
      played:  confirmed.length,
      wins:    wins,
      losses:  losses,
      winrate: winrate,
      streak:  streak,
      bestWin: bestWin,
    };
  }, [history]);

  return (
    <div className="cs-ed-push" style={{
      background:    ED_TOK.bg,
      color:         ED_TOK.ink,
      fontFamily:    ED_TOK.sans,
      minHeight:     "calc(100dvh - 64px)",
      paddingBottom: 96,
    }}>
      {/* Avatar + region/level/joined block — the hero. The global
          top mob-nav fades "Profile" in once this block scrolls out
          of view, per the editorial design. */}
      <div ref={heroRef} style={{
        display:    "flex",
        alignItems: "center",
        gap:        14,
        padding:    "20px 22px 18px",
      }}>
        <PlayerAvatar
          name={name}
          avatar={profile && profile.avatar}
          avatarUrl={profile && profile.avatar_url}
          profile={profile}
          size={64}
        />
        <div style={{ minWidth: 0 }}>
          <div style={{
            fontFamily:    ED_TOK.mono,
            fontSize:      11.5,
            color:         ED_TOK.ink2,
            letterSpacing: "0.04em",
            whiteSpace:    "normal",
            lineHeight:    1.35,
          }}>
            {region} · {level}
          </div>
          {joined && (
            <div style={{
              fontFamily:    ED_TOK.mono,
              fontSize:      10.5,
              color:         ED_TOK.muted,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              marginTop:     4,
            }}>
              Joined {joined}
            </div>
          )}
        </div>
      </div>

      {/* Big rating numeral. */}
      {rating != null && (
        <>
          <div style={{
            display:    "flex",
            alignItems: "baseline",
            gap:        12,
            padding:    "0 22px 4px",
            flexWrap:   "wrap",
          }}>
            <h2 style={{
              margin:        0,
              fontFamily:    ED_TOK.display,
              fontSize:      "clamp(78px, 22vw, 104px)",
              fontWeight:    800,
              letterSpacing: "-0.05em",
              lineHeight:    0.9,
              color:         ED_TOK.ink,
            }}>
              {rating.toLocaleString()}
            </h2>
          </div>
          <div style={{
            padding:    "0 22px 18px",
            display:    "flex",
            alignItems: "center",
            gap:        10,
            fontSize:   12.5,
            color:      ED_TOK.ink2,
            fontFamily: ED_TOK.mono,
            flexWrap:   "wrap",
          }}>
            <MicroLabel>CourtSync rating</MicroLabel>
            {ratingDelta != null && ratingDelta !== 0 && (
              <span style={{
                fontFamily:    ED_TOK.mono,
                fontSize:      12,
                fontWeight:    600,
                letterSpacing: "0.04em",
                padding:       "2px 8px",
                borderRadius:  4,
                color:         ratingDelta > 0 ? ED_TOK.win : ED_TOK.loss,
                background:    ratingDelta > 0
                  ? "rgba(58,125,68,0.12)"
                  : "rgba(195,57,43,0.12)",
              }}>
                {ratingDelta > 0 ? "▲" : "▼"} {Math.abs(ratingDelta)}
              </span>
            )}
          </div>
        </>
      )}

      {/* 2x2 stat grid. */}
      <div style={{ padding: "12px 22px" }}>
        <div style={{
          display:             "grid",
          gridTemplateColumns: "repeat(2, 1fr)",
          gap:                 1,
          background:          ED_TOK.line,
          border:              "1px solid " + ED_TOK.line,
          borderRadius:        16,
          overflow:            "hidden",
          marginBottom:        4,
        }}>
          <PStat
            big={rating != null ? "—" : "—"}
            label={"In " + (region || "your area")}
            sub={stats.played + " confirmed"}
            highlight
          />
          <PStat
            big={stats.winrate != null ? stats.winrate + "%" : "—"}
            label="Win rate"
            sub={stats.wins + "–" + stats.losses}
          />
          <PStat
            big={stats.played}
            label="Matches"
            sub="all time"
          />
          <PStat
            big={stats.streak}
            label="Win streak"
            sub="current"
            highlight
          />
        </div>
      </div>

      <EdDivider style={{ margin: "14px 22px" }}/>

      {/* Best win this month. */}
      {stats.bestWin && (
        <>
          <div style={{ padding: "4px 22px 8px" }}>
            <MicroLabel>Best win recently</MicroLabel>
            <div style={{
              fontFamily:    ED_TOK.display,
              fontSize:      22,
              letterSpacing: "-0.01em",
              marginTop:     6,
              fontStyle:     "italic",
              color:         ED_TOK.ink,
            }}>
              vs. {stats.bestWin.friendName || stats.bestWin.opponentName || stats.bestWin.oppName || stats.bestWin.playerName || "—"}
            </div>
          </div>
          <EdDivider style={{ margin: "14px 22px" }}/>
        </>
      )}

      {/* Achievements row (placeholder until trust badges + streak
          milestones are surfaced from the profile object — see
          docs/trust-and-ranking-rules.md). */}
      <div style={{ padding: "4px 22px 24px" }}>
        <div style={{ marginBottom: 12 }}>
          <MicroLabel>Achievements</MicroLabel>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {buildBadges(stats).map(function (b) {
            return (
              <div key={b.label} style={{
                display:       "inline-flex",
                alignItems:    "center",
                gap:           7,
                padding:       "8px 12px",
                border:        "1px solid " + ED_TOK.line,
                borderRadius:  999,
                fontFamily:    ED_TOK.mono,
                fontSize:      11,
                letterSpacing: "0.04em",
                color:         b.earned ? ED_TOK.ink : ED_TOK.muted,
                background:    b.earned ? ED_TOK.bg2 : "transparent",
              }}>
                <span style={{
                  color:    b.earned ? ED_TOK.accent : ED_TOK.muted,
                  fontSize: 10,
                }}>
                  {b.earned ? "●" : "○"}
                </span>
                <span>{b.label}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// 2x2 grid cell.
function PStat({ big, label, sub, highlight }) {
  return (
    <div style={{
      background: highlight ? ED_TOK.bg2 : ED_TOK.bg,
      padding:    "18px 16px",
    }}>
      <div style={{
        fontFamily:    ED_TOK.display,
        fontSize:      32,
        fontWeight:    700,
        letterSpacing: "-0.03em",
        lineHeight:    1,
        marginBottom:  8,
        color:         ED_TOK.ink,
      }}>
        {big}
      </div>
      <div style={{ display: "block", marginBottom: 4 }}>
        <MicroLabel>{label}</MicroLabel>
      </div>
      <div style={{
        fontFamily:    ED_TOK.mono,
        fontSize:      11,
        color:         ED_TOK.ink2,
        letterSpacing: "0.02em",
      }}>
        {sub}
      </div>
    </div>
  );
}

// Cheap placeholder badge derivation. Replaced when the trust badge
// system surfaces explicit earned/locked predicates on the profile
// object (Module 10 territory — see docs/trust-and-ranking-rules.md).
function buildBadges(stats) {
  return [
    { label: "First win",        earned: stats.wins >= 1 },
    { label: "5-match streak",   earned: stats.streak >= 5 },
    { label: "10 confirmed",     earned: stats.played >= 10 },
    { label: "25 confirmed",     earned: stats.played >= 25 },
    { label: "50%+ win rate",    earned: stats.winrate != null && stats.winrate >= 50 },
    { label: "Tournament debut", earned: false },
  ];
}

// "Mar 2026" from an ISO timestamp. Falls through to null when the
// profile doesn't carry a creation date (older rows pre-migration).
function formatJoined(iso) {
  if (!iso) return null;
  var d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-AU", { month: "short", year: "numeric" });
}
