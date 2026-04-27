// src/tabs/ProfileTab.jsx
//
// Public-facing profile view: stats, match history, achievements, availability.
// Settings have been moved to SettingsScreen (accessible via top-bar avatar).

import { useEffect, useState } from "react";
import { avColor } from "../../../lib/utils/avatar.js";
import { DAYS_SHORT } from "../../../lib/constants/domain.js";
import {
  computeMostPlayed,
} from "../utils/profileStats.js";
import { track } from "../../../lib/analytics.js";
import { NAV_ICONS } from "../../../lib/constants/navIcons.jsx";
import ProfileHero from "../components/ProfileHero.jsx";
import ProfileRivalry from "../components/ProfileRivalry.jsx";
import ProfileStatsAccordion from "../components/ProfileStatsAccordion.jsx";
import HomeLeaguesStrip from "../../home/components/HomeLeaguesStrip.jsx";
import HomeActivityList from "../../home/components/HomeActivityList.jsx";
import { fetchTrustBadge } from "../../trust/services/trustService.js";

// ── ProfileMatchRow ──────────────────────────────────────────────────────────
// Compact version of the feed scoreboard for use inside the profile (Recent
// Matches + Matches tab). Same typography + winner-from-sets derivation as
// FeedCard, minus the social footer / action blocks. Header row shows
// opponent, date, tournament pill, and a tiny result chip on the right.
//
// Clicking the row opens the rematch composer (Module 4) — reinforces the
// core loop "played → rematch" without forcing the user to navigate to the
// opponent's profile first. Only enabled when we have a real opponent user
// (i.e. the match was between linked accounts, not a typed-in name) and an
// openChallenge handler is passed in.
function ProfileMatchRow({ m, t, profile, openChallenge }) {
  var sets = m.sets || [];
  // Viewer's scores are s.you for own matches; for tagged matches the row is
  // still rendered from the viewer's POV — normalizeMatch already flips
  // `result` but leaves sets in the submitter's frame, so we compute which
  // side the viewer is on.
  var viewerIsSubmitter = !m.isTagged;
  // Set-count winner derivation (trust the board, not the stored result).
  // Blank/non-numeric scores MUST be skipped — Number("") is 0, not NaN, so
  // a naive "isNaN" check counts "6-" incomplete sets as 6-0 wins and
  // flips the arrow on retirement / in-progress matches.
  var ys = 0, ts = 0;
  sets.forEach(function (s) {
    var yStr = s.you == null ? "" : String(s.you).trim();
    var tStr = s.them == null ? "" : String(s.them).trim();
    if (yStr === "" || tStr === "") return;
    var y = Number(yStr), th = Number(tStr);
    if (Number.isNaN(y) || Number.isNaN(th)) return;
    if (y === th) return;
    if (y > th) ys++; else ts++;
  });
  var isWinStored = m.result === "win";
  var viewerWins = ys !== ts
    ? (viewerIsSubmitter ? ys > ts : ts > ys)
    : isWinStored;
  var viewerName = (profile && profile.name) || "You";
  // For tagged rows, m.oppName is actually the viewer's OWN name (it's
  // what the submitter typed for their opponent — which is the viewer).
  // The real opponent from the viewer's POV is the submitter — we pick it
  // up from the enriched friendName (loadHistory participant fetch).
  // For tagged rows m.oppName is the viewer's OWN name (it's what the
  // submitter typed for their opponent — which is the viewer). The real
  // opponent is the submitter, picked up via the enriched friendName.
  // For own rows m.oppName is the actual opponent.
  var opponentDisplay = m.isTagged
    ? (m.friendName || "Opponent")
    : (m.oppName || "Unknown");
  var rows = [
    {
      name: viewerName,
      isWinner: viewerWins,
      scores: viewerIsSubmitter ? sets.map(function(s){return s.you;}) : sets.map(function(s){return s.them;}),
      oppScores: viewerIsSubmitter ? sets.map(function(s){return s.them;}) : sets.map(function(s){return s.you;}),
    },
    {
      name: opponentDisplay,
      isWinner: !viewerWins,
      scores: viewerIsSubmitter ? sets.map(function(s){return s.them;}) : sets.map(function(s){return s.you;}),
      oppScores: viewerIsSubmitter ? sets.map(function(s){return s.you;}) : sets.map(function(s){return s.them;}),
    },
  ];

  // Opponent user id from viewer POV. If viewer submitted the match, opponent
  // is m.opponent_id. If the match was tagged to the viewer, the "opponent"
  // is the submitter. Falls back to null for un-linked (typed-name) matches.
  var opponentUserId = m.isTagged ? m.submitterId : m.opponent_id;
  var canRematch = !!openChallenge && !!opponentUserId;
  function handleRematch(e) {
    if (e) e.stopPropagation();
    if (!canRematch) return;
    openChallenge(
      { id: opponentUserId, name: opponentDisplay, suburb: m.venue || "", skill: "" },
      "rematch",
      m
    );
  }

  return (
    <div
      onClick={canRematch ? handleRematch : undefined}
      title={canRematch ? "Rematch " + (opponentDisplay) : undefined}
      style={{
        background: t.bgCard,
        border: "1px solid " + t.border,
        borderRadius: 0,
        marginBottom: 8,
        overflow: "hidden",
        cursor: canRematch ? "pointer" : "default",
      }}>
      {/* Header: opponent + date + tourn + result chip */}
      <div style={{ display: "flex", alignItems: "center", padding: "10px 14px", gap: 10 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: t.text, letterSpacing: "-0.1px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            vs {opponentDisplay}
          </div>
          <div style={{ fontSize: 10.5, color: t.textTertiary, marginTop: 2, letterSpacing: "0.01em", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {[
              m.date,
              m.match_type === 'casual'
                ? 'Casual'
                : (m.tournName && m.tournName !== "Casual Match" ? m.tournName : 'Ranked'),
              m.venue,
            ].filter(Boolean).join(" · ")}
          </div>
        </div>
        {m.status === "confirmed" && (
          <span style={{
            fontSize: 9, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase",
            color: viewerWins ? t.green : t.red,
            background: viewerWins ? t.greenSubtle : t.redSubtle,
            padding: "2px 7px", borderRadius: 20, flexShrink: 0,
          }}>{viewerWins ? "Won" : "Lost"}</span>
        )}
        {m.status !== "confirmed" && (
          <span style={{
            fontSize: 9, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase",
            color: t.textTertiary, background: t.bgTertiary,
            padding: "2px 7px", borderRadius: 20, flexShrink: 0,
          }}>
            {m.status === "pending_confirmation" ? "Pending" :
             m.status === "disputed" ? "Disputed" :
             m.status === "pending_reconfirmation" ? "Re-proposed" :
             m.status === "voided" ? "Voided" :
             m.status === "expired" ? "Unverified" : m.status}
          </span>
        )}
        {canRematch && (
          <span
            onClick={handleRematch}
            title={"Rematch " + (opponentDisplay)}
            style={{
              flexShrink: 0, display: "flex", alignItems: "center",
              color: t.textTertiary, padding: 2,
            }}>
            {NAV_ICONS.rematch(14)}
          </span>
        )}
      </div>

      {/* Scoreboard — same compact style as feed card */}
      {sets.length > 0 && (
        <>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", padding: "0 14px", borderTop: "1px solid " + t.border }}>
            <div style={{ display: "flex", alignItems: "center" }}>
              {sets.map(function (_, i) {
                return (
                  <div key={i} style={{ width: 24, textAlign: "center", fontSize: 8, fontWeight: 600, color: t.textTertiary, letterSpacing: "0.04em", padding: "4px 0" }}>
                    S{i + 1}
                  </div>
                );
              })}
              <div style={{ width: 16 }} />
            </div>
          </div>
          {rows.map(function (row, ri) {
            return (
              <div key={ri} style={{
                display: "flex", alignItems: "center",
                padding: "6px 14px",
                borderTop: "1px solid " + t.border,
              }}>
                <div style={{
                  flex: 1, minWidth: 0,
                  fontSize: 13,
                  fontWeight: row.isWinner ? 600 : 400,
                  color: row.isWinner ? t.text : t.textSecondary,
                  letterSpacing: "-0.1px",
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", paddingRight: 8,
                }}>{row.name}</div>
                {row.scores.map(function (score, i) {
                  var opp = row.oppScores[i];
                  var wonSet = (score !== "" && score !== undefined && opp !== "" && opp !== undefined)
                    ? Number(score) > Number(opp) : false;
                  return (
                    <div key={i} style={{
                      width: 24, textAlign: "center",
                      fontSize: 14, fontWeight: wonSet ? 600 : 400,
                      color: wonSet ? t.text : t.textTertiary,
                      fontVariantNumeric: "tabular-nums", letterSpacing: "-0.2px", lineHeight: 1,
                    }}>
                      {score !== undefined && score !== "" ? score : "–"}
                    </div>
                  );
                })}
                <div style={{ width: 16, textAlign: "center" }}>
                  {row.isWinner && (
                    <span style={{ fontSize: 9, color: t.green, fontWeight: 600 }}>◀</span>
                  )}
                </div>
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}

var BADGES=[
  {id:"first", label:"First Match",   desc:"Play your first match",             icon:"🎾", check:function(w,p){return p>=1;}},
  {id:"win1",  label:"First Win",     desc:"Win your first match",              icon:"🏆", check:function(w){return w>=1;}},
  {id:"hat",   label:"Hat Trick",     desc:"Win 3 matches",                     icon:"🔥", check:function(w){return w>=3;}},
  {id:"ded",   label:"Dedicated",     desc:"Play 10 matches",                   icon:"💪", check:function(w,p){return p>=10;}},
  {id:"sharp", label:"Sharp",         desc:"70%+ win rate (5+ matches)",        icon:"⚡", check:function(w,p){return p>=5&&p>0&&Math.round(w/p*100)>=70;}},
  {id:"fire",  label:"On Fire",       desc:"3-match win streak",                icon:"🚀", check:function(w,p,sc,st){return st==="win"&&sc>=3;}},
  {id:"beast", label:"Unstoppable",   desc:"5-match win streak",                icon:"👑", check:function(w,p,sc,st){return st==="win"&&sc>=5;}},
  {id:"vet",   label:"Veteran",       desc:"Play 25 matches",                   icon:"🎖️",check:function(w,p){return p>=25;}},
];

export default function ProfileTab({
  t, authUser, profile,
  history,
  profileTab, setProfileTab,
  onOpenSettings,
  openProfile,
  // Module 4: rematch from match history — clicking a match row opens the
  // challenge composer in rematch mode (prefills venue/court from the match).
  openChallenge,
  // Module 7: active leagues the viewer is a member of + a deep-link to the
  // Leagues sub-tab so the profile page reinforces league identity/retention.
  myLeagues,
  onOpenLeagues,
  // Slice 2 (design overhaul) — reused HomeLeaguesStrip needs the detail
  // cache + per-league deep-link callback.
  leagueDetailCache, loadLeagueDetail, onOpenLeague,
}) {
  // Wins/played still needed for badge unlock checks. Rank, win-rate,
  // streak-label, and the loss tally now live inside the Hero +
  // ProfileStatsAccordion — no need to derive them here.
  var wins   = profile.wins != null ? profile.wins : history.filter(function(m){return m.result==="win";}).length;
  var played = profile.matches_played != null ? profile.matches_played : history.length;

  var streakCount = profile.streak_count != null ? profile.streak_count : 0;
  var streakType  = profile.streak_type  != null ? profile.streak_type  : null;
  if (profile.streak_count == null && history.length) {
    streakType = history[0].result;
    for (var si = 0; si < history.length; si++) {
      if (history[si].result === streakType) streakCount++;
      else break;
    }
  }

  var badges = BADGES.map(function(b){
    return Object.assign({},b,{unlocked:b.check(wins,played,streakCount,streakType)});
  });
  var unlockedCount = badges.filter(function(b){return b.unlocked;}).length;

  // Module 1 additions — derived identity signals. (Hero pulls its own
  // recentForm / trust-pill state from profileStats — kept as a slim
  // myId/mostPlayed pair here for the "Most played" tile below.)
  var myId = authUser && authUser.id;
  var mostPlayed = computeMostPlayed(history, myId, 5);

  // Module 3.5: self-view analytics. Fires once per profile-id load.
  useEffect(function () {
    if (!profile || !profile.id) return;
    track("profile_viewed", { target_user_id: profile.id, is_self: true });
  }, [profile && profile.id]);

  // Module 10 Slice 2 — own reliability badge. Fetched fresh on each
  // profile load so the user sees their badge update after recalc.
  // Best-effort; absence renders no chrome.
  var [trustBadge, setTrustBadge] = useState(null);
  useEffect(function () {
    if (!profile || !profile.id) return;
    var alive = true;
    fetchTrustBadge(profile.id).then(function (row) {
      if (alive) setTrustBadge(row && row.public_badge);
    });
    return function () { alive = false; };
  }, [profile && profile.id]);

  return (
    <div style={{ width: "100%" }}>

      {/* HERO — borderless editorial composition. Generous breathing room. */}
      <section style={{
        maxWidth: 720, margin: "0 auto",
        padding: "clamp(40px, 6vw, 72px) clamp(20px, 4vw, 32px) 0",
      }}>
        <ProfileHero
          t={t}
          profile={profile}
          viewerIsSelf={true}
          recentFormHistory={history}
          trustBadge={trustBadge}
          actionSlot={authUser && (
            <button
              onClick={onOpenSettings}
              title="Edit profile"
              style={{
                padding: "8px 14px",
                border: "1px solid " + t.border,
                background: "transparent",
                color: t.textSecondary,
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                cursor: "pointer",
              }}>
              <span style={{ display: "flex", alignItems: "center" }}>{NAV_ICONS.edit(12)}</span>
              Edit
            </button>
          )}
        />
      </section>

      {/* HAIRLINE */}
      <div style={{
        maxWidth: 720, margin: "clamp(40px, 6vw, 72px) auto 0",
        padding: "0 clamp(20px, 4vw, 32px)",
      }}>
        <div style={{ borderTop: "1px solid " + t.border }} />
      </div>

      {/* RIVALRY — borderless editorial. Only renders when there's a real
          H2H opponent (≥3 plays vs same linked user). */}
      <section style={{
        maxWidth: 720, margin: "0 auto",
        padding: "clamp(28px, 4vw, 40px) clamp(20px, 4vw, 32px) 0",
      }}>
        <ProfileRivalry
          t={t}
          authUser={authUser}
          history={history}
          openProfile={openProfile}
          openChallenge={openChallenge}
        />
      </section>

      {/* STATS — bordered (it's an interactive accordion; earns its frame). */}
      <section style={{
        maxWidth: 720, margin: "0 auto",
        padding: "clamp(32px, 4vw, 48px) clamp(20px, 4vw, 32px) 0",
      }}>
        <ProfileStatsAccordion t={t} profile={profile} history={history} />
      </section>

      {/* Sub-tabs: overview / matches / achievements */}
      <section style={{
        maxWidth: 720, margin: "clamp(32px, 4vw, 48px) auto 0",
        padding: "0 clamp(20px, 4vw, 32px)",
      }}>
        <div style={{ display: "flex", borderBottom: "1px solid " + t.border, gap: 4 }}>
          {["overview", "matches", "achievements"].map(function (pt) {
            var on = profileTab === pt;
            return (
              <button key={pt}
                onClick={function () { setProfileTab(pt); }}
                style={{
                  padding: "12px 4px",
                  marginRight: 20,
                  border: "none",
                  background: "transparent",
                  color: on ? t.text : t.textTertiary,
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  borderBottom: "2px solid " + (on ? t.text : "transparent"),
                  marginBottom: "-1px",
                  cursor: "pointer",
                }}>
                {pt}
              </button>
            );
          })}
        </div>
      </section>

      {/* ── Overview ─────────────────────────────────────────────────────────── */}
      {profileTab==="overview"&&(
        <div className="fade-up">
          {/* Recent matches — editorial activity list (mirrors Home).
              Tapping the toggle jumps to the Matches sub-tab where the
              full ProfileMatchRow list lives. */}
          <section style={{
            maxWidth: 720, margin: "0 auto",
            padding: "clamp(28px, 4vw, 40px) clamp(20px, 4vw, 32px) 0",
          }}>
            {history.length === 0 ? (
              <div style={{ padding: "32px 0", textAlign: "center" }}>
                <div style={{ fontSize: 24, marginBottom: 10 }}>🎾</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: t.text, marginBottom: 4, letterSpacing: "-0.1px" }}>
                  No matches yet
                </div>
                <div style={{ fontSize: 12, color: t.textTertiary }}>
                  Log your first match to start tracking your form.
                </div>
              </div>
            ) : (
              <HomeActivityList
                t={t}
                authUser={authUser}
                profile={profile}
                history={history}
                expanded={false}
                onToggle={history.length > 3 ? function () { setProfileTab("matches"); } : null}
              />
            )}
          </section>

          {/* Most-played opponents — identity check ("I've played these
              consistently"). Borderless chips with hairline divider. */}
          {mostPlayed.length > 0 && (
            <section style={{
              maxWidth: 720, margin: "0 auto",
              padding: "clamp(32px, 4vw, 48px) clamp(20px, 4vw, 32px) 0",
            }}>
              <div style={{
                fontSize: "clamp(20px, 3vw, 24px)",
                fontWeight: 700, color: t.text,
                letterSpacing: "-0.02em",
                marginBottom: 14,
              }}>
                Most played
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {mostPlayed.map(function (o, i) {
                  var clickable = !!o.opponentId && !!openProfile;
                  return (
                    <div key={i}
                      onClick={clickable ? function () { openProfile(o.opponentId); } : undefined}
                      style={{
                        display: "flex", alignItems: "center", gap: 10,
                        background: "transparent",
                        border: "1px solid " + t.border,
                        padding: "10px 14px 10px 10px",
                        cursor: clickable ? "pointer" : "default",
                      }}>
                      <div style={{
                        width: 30, height: 30, borderRadius: "50%", flexShrink: 0,
                        background: avColor(o.opponentName),
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: 11, fontWeight: 800, color: "#fff",
                      }}>{(o.opponentName || "?").slice(0, 2).toUpperCase()}</div>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: t.text, lineHeight: 1.2 }}>
                          {o.opponentName}
                        </div>
                        <div style={{ fontSize: 10, color: t.textTertiary, marginTop: 2, letterSpacing: "0.04em" }}>
                          <span style={{ color: t.green, fontWeight: 700 }}>{o.wins}</span>
                          <span style={{ margin: "0 3px" }}>–</span>
                          <span style={{ color: t.red, fontWeight: 700 }}>{o.losses}</span>
                          <span style={{ marginLeft: 6 }}>· {o.plays} played</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* Your leagues — strip, mirroring Home. */}
          <section style={{
            maxWidth: 720, margin: "0 auto",
            padding: "clamp(32px, 4vw, 48px) clamp(20px, 4vw, 32px) 0",
          }}>
            <HomeLeaguesStrip
              t={t}
              authUser={authUser}
              history={history}
              myLeagues={myLeagues}
              leagueDetailCache={leagueDetailCache}
              loadLeagueDetail={loadLeagueDetail}
              onOpenLeague={onOpenLeague || onOpenLeagues}
            />
          </section>

          {/* Achievements preview */}
          {unlockedCount > 0 && (
            <section style={{
              maxWidth: 720, margin: "0 auto",
              padding: "clamp(32px, 4vw, 48px) clamp(20px, 4vw, 32px) 0",
            }}>
              <div style={{
                display: "flex", alignItems: "baseline", justifyContent: "space-between",
                marginBottom: 14,
              }}>
                <div style={{
                  fontSize: "clamp(20px, 3vw, 24px)",
                  fontWeight: 700, color: t.text,
                  letterSpacing: "-0.02em",
                }}>
                  Achievements
                </div>
                <button
                  onClick={function () { setProfileTab("achievements"); }}
                  style={{
                    background: "transparent", border: "none", padding: 0,
                    fontSize: 11, fontWeight: 700, color: t.textSecondary,
                    letterSpacing: "0.08em", textTransform: "uppercase",
                    cursor: "pointer",
                  }}>
                  See all →
                </button>
              </div>
              <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 4 }}>
                {badges.filter(function (b) { return b.unlocked; }).map(function (b) {
                  return (
                    <div key={b.id} style={{
                      border: "1px solid " + t.border,
                      padding: "14px 12px",
                      textAlign: "center",
                      minWidth: 88,
                      flexShrink: 0,
                    }}>
                      <div style={{ fontSize: 24, marginBottom: 6 }}>{b.icon}</div>
                      <div style={{
                        fontSize: 9, fontWeight: 700, color: t.text,
                        lineHeight: 1.2, textTransform: "uppercase", letterSpacing: "0.06em",
                      }}>{b.label}</div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* Availability — borderless rows with hairline divider above. */}
          <section style={{
            maxWidth: 720, margin: "0 auto",
            padding: "clamp(32px, 4vw, 48px) clamp(20px, 4vw, 32px) clamp(56px, 8vw, 80px)",
          }}>
            <div style={{
              display: "flex", alignItems: "baseline", justifyContent: "space-between",
              marginBottom: 14,
            }}>
              <div style={{
                fontSize: "clamp(20px, 3vw, 24px)",
                fontWeight: 700, color: t.text,
                letterSpacing: "-0.02em",
              }}>
                Availability
              </div>
              {authUser && (
                <button
                  onClick={onOpenSettings}
                  style={{
                    background: "transparent", border: "none", padding: 0,
                    fontSize: 11, fontWeight: 700, color: t.textSecondary,
                    letterSpacing: "0.08em", textTransform: "uppercase",
                    cursor: "pointer",
                  }}>
                  Edit
                </button>
              )}
            </div>
            {DAYS_SHORT.filter(function (d) { return ((profile.availability || {})[d] || []).length > 0; }).length === 0 ? (
              <p style={{ fontSize: 13, color: t.textTertiary, margin: 0 }}>No availability set yet.</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column" }}>
                {DAYS_SHORT.filter(function (d) { return ((profile.availability || {})[d] || []).length > 0; }).map(function (day, i) {
                  return (
                    <div key={day} style={{
                      display: "flex", alignItems: "center", gap: 14,
                      padding: "12px 0",
                      borderTop: i === 0 ? "none" : "1px solid " + t.border,
                    }}>
                      <span style={{
                        fontSize: 10, fontWeight: 800, color: t.text,
                        width: 36, flexShrink: 0,
                        textTransform: "uppercase", letterSpacing: "0.12em",
                      }}>{day}</span>
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        {((profile.availability || {})[day] || []).map(function (b) {
                          return (
                            <span key={b} style={{
                              fontSize: 11, fontWeight: 600, color: t.text,
                              padding: "3px 10px",
                              border: "1px solid " + t.border,
                              letterSpacing: "0.04em",
                            }}>{b}</span>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      )}

      {/* ── Matches ──────────────────────────────────────────────────────────── */}
      {profileTab==="matches"&&(
        <section
          className="fade-up"
          style={{
            maxWidth: 720, margin: "0 auto",
            padding: "clamp(28px, 4vw, 40px) clamp(20px, 4vw, 32px) clamp(56px, 8vw, 80px)",
          }}>
          <div style={{
            display: "flex", alignItems: "baseline", justifyContent: "space-between",
            marginBottom: 18,
          }}>
            <div style={{
              fontSize: "clamp(22px, 3.2vw, 28px)",
              fontWeight: 700, color: t.text,
              letterSpacing: "-0.02em",
            }}>
              Match history
            </div>
            <span style={{
              fontSize: 11, fontWeight: 700, color: t.textTertiary,
              letterSpacing: "0.08em", textTransform: "uppercase",
            }}>
              {history.length} {history.length === 1 ? "match" : "matches"}
            </span>
          </div>
          {history.length === 0 ? (
            <div style={{ padding: "40px 0", textAlign: "center" }}>
              <div style={{ fontSize: 32, marginBottom: 12 }}>🎾</div>
              <div style={{ fontSize: 15, fontWeight: 700, color: t.text, marginBottom: 6 }}>No matches yet</div>
              <div style={{ fontSize: 13, color: t.textTertiary, lineHeight: 1.5 }}>
                Complete a tournament match and log your score to see your history here.
              </div>
            </div>
          ) : (
            history.map(function (m) {
              return <ProfileMatchRow key={m.id} m={m} t={t} profile={profile} openChallenge={openChallenge} />;
            })
          )}
        </section>
      )}

      {/* ── Achievements ─────────────────────────────────────────────────────── */}
      {profileTab==="achievements"&&(
        <section
          className="fade-up"
          style={{
            maxWidth: 720, margin: "0 auto",
            padding: "clamp(28px, 4vw, 40px) clamp(20px, 4vw, 32px) clamp(56px, 8vw, 80px)",
          }}>
          <div style={{
            fontSize: "clamp(22px, 3.2vw, 28px)",
            fontWeight: 700, color: t.text,
            letterSpacing: "-0.02em",
            marginBottom: 6,
          }}>
            Achievements
          </div>
          <div style={{ fontSize: 12, color: t.textTertiary, marginBottom: 18, letterSpacing: "0.04em" }}>
            {unlockedCount} of {badges.length} unlocked
          </div>
          <div style={{
            background: t.bgTertiary, height: 3, marginBottom: 24, overflow: "hidden",
          }}>
            <div style={{
              height: "100%",
              width: (unlockedCount / badges.length * 100) + "%",
              background: t.gold, transition: "width 0.5s ease",
            }}/>
          </div>
          <div>
            {badges.map(function (b, i) {
              return (
                <div key={b.id} style={{
                  borderTop: i === 0 ? "none" : "1px solid " + t.border,
                  padding: "14px 0",
                  display: "flex", alignItems: "center", gap: 14,
                  opacity: b.unlocked ? 1 : 0.45,
                }}>
                  <div style={{
                    width: 40, height: 40, flexShrink: 0,
                    background: b.unlocked ? t.goldSubtle : t.bgTertiary,
                    border: "1px solid " + (b.unlocked ? t.gold + "33" : t.border),
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 20, filter: b.unlocked ? "none" : "grayscale(1)",
                  }}>{b.icon}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: t.text, letterSpacing: "-0.1px" }}>
                      {b.label}
                    </div>
                    <div style={{ fontSize: 11, color: t.textTertiary, marginTop: 3 }}>{b.desc}</div>
                  </div>
                  {b.unlocked && (
                    <span style={{
                      fontSize: 9, fontWeight: 800, color: t.gold,
                      flexShrink: 0,
                      textTransform: "uppercase", letterSpacing: "0.12em",
                    }}>Unlocked</span>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
