// src/features/profile/pages/PlayerProfileView.jsx
//
// Editorial Tennis read-only profile for any user that isn't the
// viewer. Mirrors the language of ProfileScreen (own-profile) so a
// tap on a friend's avatar lands in the same visual realm — cream
// paper, mono kickers, big rating numeral, hairline dividers — with
// the friend-specific affordances (Challenge CTA + Block menu +
// Head-to-head block) layered in.
//
// 2026-05-03 rewrite: drops the legacy `t`-token ProfileHero shared
// component in favour of inline ED_TOK styling so the typography +
// palette stay identical to the own-profile screen.

import { useEffect, useState } from "react";
import { ED_TOK, MicroLabel, EdDivider } from "../../home/components/EditorialScreen.jsx";
import PlayerAvatar from "../../../components/ui/PlayerAvatar.jsx";
import { usePlayerProfile } from "../hooks/usePlayerProfile.js";
import { computeHeadToHead } from "../utils/profileStats.js";
import { fetchTrustBadge } from "../../trust/services/trustService.js";
import { track } from "../../../lib/analytics.js";

export default function PlayerProfileView({
  // t kept on the prop list for back-compat (Block menu still pulls
  // a couple of legacy colour tokens for the destructive button copy).
  t,
  authUser, userId, viewerHistory, onBack, openChallenge, blockUser,
}) {
  var state = usePlayerProfile(userId);
  var profile = state.profile;

  // Module 3.5: fire once per public-profile view, after the real
  // profile has loaded.
  useEffect(function () {
    if (!profile || !profile.id) return;
    track("profile_viewed", { target_user_id: profile.id, is_self: false });
  }, [profile && profile.id]);

  // Module 10 Slice 2 — public reliability badge.
  var [trustBadge, setTrustBadge] = useState(null);
  useEffect(function () {
    if (!profile || !profile.id) return;
    var alive = true;
    fetchTrustBadge(profile.id).then(function (row) {
      if (alive) setTrustBadge(row && row.public_badge);
    });
    return function () { alive = false; };
  }, [profile && profile.id]);

  if (state.loading) return <Shell onBack={onBack}><Skeleton/></Shell>;
  if (state.error) {
    return <Shell onBack={onBack}>
      <Empty title="Couldn't load profile" body={state.error}/>
    </Shell>;
  }
  if (!profile) {
    return <Shell onBack={onBack}>
      <Empty title="Profile not found" body="This player may have deleted their account."/>
    </Shell>;
  }

  var firstName = profile.name ? profile.name.split(/\s+/)[0] : "player";
  var region = profile.suburb || "—";
  var level  = profile.skill  || "—";

  var rating = (profile.ranking_points != null) ? Math.round(profile.ranking_points) : null;
  var played = profile.matches_played || 0;
  var wins   = profile.wins   || 0;
  var losses = profile.losses || 0;
  var winRate = (wins + losses) > 0 ? Math.round((wins / (wins + losses)) * 100) : null;

  // H2H computed from the viewer's own history (RLS-safe).
  var h2h = computeHeadToHead(viewerHistory || [], authUser && authUser.id, profile.id);

  var canChallenge = openChallenge && authUser && profile.id !== authUser.id;

  return (
    <Shell onBack={onBack}>
      <div style={{
        background:    ED_TOK.bg,
        color:         ED_TOK.ink,
        fontFamily:    ED_TOK.sans,
        minHeight:     "calc(100dvh - 64px)",
        paddingBottom: 96,
      }}>
        {/* Hero — avatar + region/level kicker. Same composition as
            ProfileScreen's hero so identity reads identical. */}
        <div style={{
          display:    "flex",
          alignItems: "center",
          gap:        14,
          padding:    "20px 22px 14px",
        }}>
          <PlayerAvatar
            name={profile.name}
            avatar={profile.avatar}
            avatarUrl={profile.avatar_url}
            profile={profile}
            size={64}
          />
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{
              fontFamily:    ED_TOK.display,
              fontSize:      "clamp(28px, 7vw, 36px)",
              fontWeight:    600,
              letterSpacing: "-0.025em",
              lineHeight:    1.0,
              color:         ED_TOK.ink,
              overflow:      "hidden",
              textOverflow:  "ellipsis",
              whiteSpace:    "nowrap",
            }}>
              {profile.name || "Player"}
            </div>
            <div style={{
              fontFamily:    ED_TOK.mono,
              fontSize:      11.5,
              color:         ED_TOK.ink2,
              letterSpacing: "0.04em",
              marginTop:     6,
              lineHeight:    1.35,
            }}>
              {region} · {level}
            </div>
            {trustBadge && (
              <div style={{
                marginTop:     6,
                fontFamily:    ED_TOK.mono,
                fontSize:      10,
                fontWeight:    700,
                letterSpacing: "0.16em",
                textTransform: "uppercase",
                color:         ED_TOK.accent,
              }}>
                {trustBadge}
              </div>
            )}
          </div>
        </div>

        {/* Big rating numeral — same scale as ProfileScreen so the
            friend's identity reads at the same visual weight. */}
        {rating != null && (
          <>
            <div style={{
              padding: "0 22px 4px",
              display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap",
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
              flexWrap:   "wrap",
            }}>
              <MicroLabel>CourtSync rating</MicroLabel>
              <span style={{
                fontFamily:    ED_TOK.mono,
                fontSize:      10.5,
                fontWeight:    600,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                color:         ED_TOK.muted,
              }}>
                {played} confirmed match{played === 1 ? "" : "es"}
              </span>
            </div>
          </>
        )}

        {/* Challenge CTA — full-width primary block, mirrors ProfileScreen's
            visual weight for primary actions (HOME's LOG A MATCH). The
            overflow menu houses Block. */}
        {canChallenge && (
          <div style={{ padding: "0 22px 18px" }}>
            <div style={{ display: "flex", gap: 8, alignItems: "stretch" }}>
              <button
                onClick={function () { openChallenge(profile, "profile"); }}
                style={{
                  flex:          1,
                  padding:       "16px 18px",
                  background:    ED_TOK.ink,
                  color:         ED_TOK.bg,
                  border:        "none",
                  borderRadius:  999,
                  fontFamily:    ED_TOK.mono,
                  fontSize:      12,
                  fontWeight:    700,
                  letterSpacing: "0.16em",
                  textTransform: "uppercase",
                  cursor:        "pointer",
                  transition:    "opacity 140ms ease",
                }}
                onMouseEnter={function (e) { e.currentTarget.style.opacity = "0.92"; }}
                onMouseLeave={function (e) { e.currentTarget.style.opacity = "1"; }}>
                Challenge {firstName}
              </button>
              {blockUser && (
                <ProfileOverflowMenu profile={profile} blockUser={blockUser}/>
              )}
            </div>
          </div>
        )}

        <EdDivider style={{ margin: "8px 22px 18px" }}/>

        {/* Stat row — 4 cells, hairline-separated. Lifted from
            ProfileScreen's 2x2 stat grid but flattened to a single
            row because the friend view doesn't need a "your area"
            cell, and the 4-stat row reads cleaner under the rating. */}
        <div style={{ padding: "4px 22px 8px" }}>
          <div style={{ display: "flex", alignItems: "stretch" }}>
            <PStatCell value={played}                          label="Played"  isLast={false}/>
            <PStatCell value={wins}                            label="Wins"    isLast={false}/>
            <PStatCell value={losses}                          label="Losses"  isLast={false}/>
            <PStatCell value={winRate != null ? winRate + "%" : "—"} label="Win %" isLast/>
          </div>
        </div>

        {/* Head-to-head — only when the viewer has actually played
            this person. Same editorial type stack: mono microlabel,
            big numeral. */}
        {authUser && h2h.totalMatches > 0 && (
          <>
            <EdDivider style={{ margin: "26px 22px 18px" }}/>
            <div style={{ padding: "0 22px 4px" }}>
              <MicroLabel>Head to head</MicroLabel>
            </div>
            <div style={{ padding: "12px 22px 0" }}>
              <div style={{ display: "flex", alignItems: "stretch" }}>
                <H2HCell
                  label="You"
                  value={h2h.viewerWins}
                  highlighted={h2h.viewerWins > h2h.subjectWins}
                  isLast={false}
                />
                <H2HCell
                  label={profile.name || "Them"}
                  value={h2h.subjectWins}
                  highlighted={h2h.subjectWins > h2h.viewerWins}
                  isLast
                />
              </div>
              <div style={{
                marginTop:     14,
                fontFamily:    ED_TOK.mono,
                fontSize:      10.5,
                color:         ED_TOK.muted,
                letterSpacing: "0.10em",
                textTransform: "uppercase",
                textAlign:     "center",
              }}>
                {h2h.totalMatches} match{h2h.totalMatches !== 1 ? "es" : ""} played
                {h2h.lastDate ? " · last " + h2h.lastDate : ""}
              </div>
            </div>
          </>
        )}

        {/* "Not yet played" microcopy — only when the viewer HAS
            played some ranked tennis but never against this person.
            Skipped on a brand-new viewer to avoid scolding. */}
        {authUser && h2h.totalMatches === 0 && played > 0 && (
          <>
            <EdDivider style={{ margin: "26px 22px 18px" }}/>
            <div style={{
              padding:       "8px 22px 0",
              fontFamily:    ED_TOK.sans,
              fontSize:      13,
              color:         ED_TOK.ink2,
              textAlign:     "center",
              lineHeight:    1.5,
            }}>
              You haven't played {firstName} yet.
            </div>
          </>
        )}
      </div>
    </Shell>
  );
}

// ── Editorial helpers (local) ─────────────────────────────────────

function PStatCell({ value, label, isLast }) {
  return (
    <div style={{
      flex:        1,
      padding:     "0 6px",
      borderRight: isLast ? "none" : "1px solid " + ED_TOK.line,
      textAlign:   "center",
    }}>
      <div style={{
        fontFamily:        ED_TOK.display,
        fontSize:          "clamp(28px, 5vw, 36px)",
        fontWeight:        700,
        letterSpacing:     "-0.025em",
        lineHeight:        1,
        color:             ED_TOK.ink,
        fontVariantNumeric:"tabular-nums",
      }}>
        {value}
      </div>
      <div style={{
        marginTop:     8,
        fontFamily:    ED_TOK.mono,
        fontSize:      10,
        fontWeight:    700,
        color:         ED_TOK.muted,
        letterSpacing: "0.14em",
        textTransform: "uppercase",
      }}>
        {label}
      </div>
    </div>
  );
}

function H2HCell({ label, value, highlighted, isLast }) {
  return (
    <div style={{
      flex:        1,
      padding:     "0 8px",
      borderRight: isLast ? "none" : "1px solid " + ED_TOK.line,
      textAlign:   "center",
      minWidth:    0,
    }}>
      <div style={{
        fontFamily:    ED_TOK.mono,
        fontSize:      10,
        fontWeight:    700,
        color:         ED_TOK.muted,
        letterSpacing: "0.14em",
        textTransform: "uppercase",
        marginBottom:  10,
        overflow:      "hidden",
        textOverflow:  "ellipsis",
        whiteSpace:    "nowrap",
      }}>
        {label}
      </div>
      <div style={{
        fontFamily:        ED_TOK.display,
        fontSize:          "clamp(40px, 7vw, 56px)",
        fontWeight:        800,
        letterSpacing:     "-0.03em",
        lineHeight:        1,
        color:             highlighted ? ED_TOK.win : ED_TOK.ink,
        fontVariantNumeric:"tabular-nums",
      }}>
        {value}
      </div>
    </div>
  );
}

// Overflow menu next to the Challenge CTA — Block lives here.
// Restyled to the editorial palette (round outlined chip, ink-on-cream
// dropdown). Asymmetric block (council decision): blocked users go
// invisible to the viewer; viewer remains neutrally visible to them —
// no notification fires.
function ProfileOverflowMenu({ profile, blockUser }) {
  var [open, setOpen] = useState(false);
  return (
    <div style={{ position: "relative", flexShrink: 0 }}>
      <button
        onClick={function () { setOpen(!open); }}
        aria-label="More actions"
        title="More actions"
        style={{
          width:        50,
          height:       "100%",
          padding:      0,
          borderRadius: 999,
          border:       "1px solid " + ED_TOK.lineStrong,
          background:   "transparent",
          color:        ED_TOK.ink,
          fontSize:     18,
          fontWeight:   700,
          lineHeight:   1,
          cursor:       "pointer",
        }}>
        ⋯
      </button>
      {open && (
        <>
          <div
            onClick={function () { setOpen(false); }}
            style={{ position: "fixed", inset: 0, zIndex: 50 }}
          />
          <div style={{
            position:     "absolute",
            right:        0,
            top:          "calc(100% + 6px)",
            minWidth:     180,
            background:   ED_TOK.bg,
            border:       "1px solid " + ED_TOK.line,
            borderRadius: 12,
            boxShadow:    "0 12px 28px rgba(42, 32, 26, 0.18)",
            overflow:     "hidden",
            zIndex:       60,
          }}>
            <button
              onClick={function () {
                setOpen(false);
                if (window.confirm("Block " + profile.name + "? They won't be able to message you and will disappear from your map and discovery surfaces.")) {
                  blockUser(profile);
                }
              }}
              style={{
                display:    "block",
                width:      "100%",
                padding:    "12px 16px",
                border:     "none",
                background: "transparent",
                color:      ED_TOK.loss,
                fontFamily: ED_TOK.sans,
                fontSize:   13.5,
                fontWeight: 600,
                textAlign:  "left",
                cursor:     "pointer",
              }}>
              Block
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// ── Shell / loading / empty (editorial palette) ───────────────────

function Shell({ onBack, children }) {
  return (
    <div style={{
      width:      "100%",
      background: ED_TOK.bg,
      color:      ED_TOK.ink,
      fontFamily: ED_TOK.sans,
    }}>
      {onBack && (
        <div style={{
          padding: "20px 22px 0",
        }}>
          <button
            onClick={onBack}
            style={{
              display:       "inline-flex",
              alignItems:    "center",
              gap:           8,
              padding:       "8px 14px",
              background:    "transparent",
              border:        "1px solid " + ED_TOK.line,
              borderRadius:  999,
              color:         ED_TOK.ink,
              fontFamily:    ED_TOK.mono,
              fontSize:      11,
              fontWeight:    700,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              cursor:        "pointer",
            }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2"
              strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 18l-6-6 6-6"/>
            </svg>
            Back
          </button>
        </div>
      )}
      {children}
    </div>
  );
}

function Skeleton() {
  return (
    <div style={{ padding: "28px 22px", opacity: 0.5 }}>
      <div style={{ display: "flex", gap: 14, marginBottom: 22 }}>
        <div style={{ width: 64, height: 64, borderRadius: "50%", background: ED_TOK.bg2 }} />
        <div style={{ flex: 1 }}>
          <div style={{ width: 200, height: 28, background: ED_TOK.bg2, borderRadius: 4, marginBottom: 10 }} />
          <div style={{ width: 140, height: 12, background: ED_TOK.bg2, borderRadius: 4 }} />
        </div>
      </div>
      <div style={{ width: 220, height: 80, background: ED_TOK.bg2, borderRadius: 8, marginBottom: 20 }} />
      <div style={{ display: "flex", gap: 0 }}>
        {[0, 1, 2, 3].map(function (i) {
          return <div key={i} style={{
            flex: 1, height: 56, background: ED_TOK.bg2,
            borderRight: i === 3 ? "none" : "1px solid " + ED_TOK.bg,
          }}/>;
        })}
      </div>
    </div>
  );
}

function Empty({ title, body }) {
  return (
    <div style={{ padding: "60px 24px", textAlign: "center" }}>
      <div style={{
        fontFamily:    ED_TOK.display,
        fontSize:      28,
        fontWeight:    600,
        letterSpacing: "-0.025em",
        color:         ED_TOK.ink,
        marginBottom:  10,
      }}>{title}</div>
      <div style={{
        fontFamily: ED_TOK.sans,
        fontSize:   13.5,
        color:      ED_TOK.ink2,
        lineHeight: 1.5,
      }}>{body}</div>
    </div>
  );
}
