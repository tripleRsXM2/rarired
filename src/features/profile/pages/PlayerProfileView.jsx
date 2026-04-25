// src/features/profile/pages/PlayerProfileView.jsx
//
// Read-only public profile for any user that isn't the viewer. Shows identity
// (name, location, skill), verification-oriented stats (confirmed count,
// ranking, record, streak), and head-to-head against the viewer computed
// locally from the viewer's own match history.
//
// Kept intentionally lean for Module 1: no achievements, no availability,
// no match history for the subject (RLS-restricted). Those surfaces are for
// later modules when we have an RPC for public match data.

import { useEffect, useState } from "react";
import { usePlayerProfile } from "../hooks/usePlayerProfile.js";
import {
  computeHeadToHead,
} from "../utils/profileStats.js";
import { track } from "../../../lib/analytics.js";
import ProfileHero from "../components/ProfileHero.jsx";

export default function PlayerProfileView({
  t, authUser, userId, viewerHistory, onBack, openChallenge, blockUser,
}) {
  var state = usePlayerProfile(userId);
  var profile = state.profile;

  // Module 3.5: fire once per public-profile view, once the real profile has
  // loaded. Skeleton / error / not-found states don't count.
  useEffect(function () {
    if (!profile || !profile.id) return;
    track("profile_viewed", {
      target_user_id: profile.id,
      is_self: false,
    });
  }, [profile && profile.id]);

  // Loading / error / not-found shells — all styled the same as the real
  // profile hero so the layout doesn't jump when the fetch resolves.
  if (state.loading) {
    return <Shell t={t} onBack={onBack}><Skeleton t={t} /></Shell>;
  }
  if (state.error) {
    return <Shell t={t} onBack={onBack}>
      <Empty t={t} title="Couldn't load profile" body={state.error} />
    </Shell>;
  }
  if (!profile) {
    return <Shell t={t} onBack={onBack}>
      <Empty t={t} title="Profile not found" body="This player may have deleted their account." />
    </Shell>;
  }

  var wins    = profile.wins || 0;
  var losses  = profile.losses || 0;
  var played  = profile.matches_played || 0;
  var winRate = played ? Math.round(wins / played * 100) : 0;
  var streakCount = profile.streak_count || 0;
  var streakType  = profile.streak_type;
  var streakLabel = streakCount === 0 ? "—" : streakCount + (streakType === "win" ? " W" : " L");

  // H2H computed from the viewer's own history (RLS-safe).
  var h2h = computeHeadToHead(viewerHistory || [], authUser && authUser.id, profile.id);

  // v2: the public-profile Challenge CTA renders below the Hero identity row
  // as a full-width primary block (mirrors Home's LOG A MATCH).
  var challengeBlock = (openChallenge && authUser && profile.id !== authUser.id) ? (
    <div style={{ display: "flex", gap: 8, alignItems: "stretch" }}>
      <button
        onClick={function () { openChallenge(profile, "profile"); }}
        style={{
          flex: 1, padding: "16px", border: "none",
          background: t.text, color: t.bg,
          fontSize: 14, fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase",
          cursor: "pointer", transition: "opacity 0.15s",
        }}
        onMouseEnter={function (e) { e.currentTarget.style.opacity = "0.85"; }}
        onMouseLeave={function (e) { e.currentTarget.style.opacity = "1"; }}
      >
        Challenge {profile.name ? profile.name.split(" ")[0] : "player"}
      </button>
      {blockUser && (
        <ProfileOverflowMenu t={t} profile={profile} blockUser={blockUser} />
      )}
    </div>
  ) : null;

  return (
    <Shell t={t} onBack={onBack}>
      {/* HERO — borderless editorial composition, mirrors own-profile. */}
      <section style={{
        maxWidth: 720, margin: "0 auto",
        padding: "clamp(16px, 3vw, 32px) clamp(20px, 4vw, 32px) 0",
      }}>
        <ProfileHero
          t={t}
          profile={profile}
          viewerIsSelf={false}
          recentFormHistory={null}
          belowIdentitySlot={challengeBlock}
        />
      </section>

      {/* HAIRLINE */}
      <div style={{
        maxWidth: 720, margin: "clamp(40px, 6vw, 64px) auto 0",
        padding: "0 clamp(20px, 4vw, 32px)",
      }}>
        <div style={{ borderTop: "1px solid " + t.border }} />
      </div>

      {/* PUBLIC STATS — borderless 4-stat row with hairlines (mirrors HomeWeekStrip). */}
      <section style={{
        maxWidth: 720, margin: "0 auto",
        padding: "clamp(28px, 4vw, 40px) clamp(20px, 4vw, 32px) 0",
      }}>
        <div style={{ display: "flex", alignItems: "stretch" }}>
          {[
            { l: "Played", v: played, c: t.text },
            { l: "Wins",   v: wins,   c: t.text },
            { l: "Losses", v: losses, c: t.text },
            { l: "Win %",  v: played ? winRate + "%" : "—", c: t.text },
          ].map(function (s, i, arr) {
            return (
              <div key={s.l} style={{
                flex: 1,
                padding: "0 4px",
                borderRight: i === arr.length - 1 ? "none" : "1px solid " + t.border,
                textAlign: "center",
              }}>
                <div style={{
                  fontSize: "clamp(28px, 4.5vw, 40px)",
                  fontWeight: 800, color: s.c,
                  letterSpacing: "-0.025em", lineHeight: 1,
                  fontVariantNumeric: "tabular-nums",
                }}>
                  {s.v}
                </div>
                <div style={{
                  marginTop: 8,
                  fontSize: 10, fontWeight: 700, color: t.textTertiary,
                  letterSpacing: "0.12em", textTransform: "uppercase",
                }}>
                  {s.l}
                </div>
              </div>
            );
          })}
        </div>

        {/* Streak — single line of meta beneath the stats, only when applicable */}
        {streakCount > 0 && (
          <div style={{
            marginTop: 18,
            fontSize: 11, fontWeight: 700,
            color: streakType === "win" ? t.green : t.red,
            letterSpacing: "0.08em", textTransform: "uppercase",
            textAlign: "center",
          }}>
            Current streak · {streakLabel}
          </div>
        )}
      </section>

      {/* HEAD-TO-HEAD — borderless display block, only when there's a real H2H */}
      {authUser && h2h.totalMatches > 0 && (
        <section style={{
          maxWidth: 720, margin: "0 auto",
          padding: "clamp(40px, 6vw, 64px) clamp(20px, 4vw, 32px) 0",
        }}>
          <div style={{
            fontSize: "clamp(20px, 3vw, 24px)",
            fontWeight: 700, color: t.text,
            letterSpacing: "-0.02em",
            marginBottom: 18,
          }}>
            Head to head
          </div>
          <div style={{ display: "flex", alignItems: "stretch" }}>
            <div style={{ flex: 1, textAlign: "center", borderRight: "1px solid " + t.border, padding: "0 8px" }}>
              <div style={{
                fontSize: 10, fontWeight: 700, color: t.textTertiary,
                textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 8,
              }}>
                You
              </div>
              <div style={{
                fontSize: "clamp(36px, 5vw, 56px)",
                fontWeight: 800,
                color: h2h.viewerWins > h2h.subjectWins ? t.green : t.text,
                fontVariantNumeric: "tabular-nums", letterSpacing: "-0.025em", lineHeight: 1,
              }}>
                {h2h.viewerWins}
              </div>
            </div>
            <div style={{ flex: 1, textAlign: "center", padding: "0 8px", minWidth: 0 }}>
              <div style={{
                fontSize: 10, fontWeight: 700, color: t.textTertiary,
                textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 8,
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              }}>
                {profile.name || "Them"}
              </div>
              <div style={{
                fontSize: "clamp(36px, 5vw, 56px)",
                fontWeight: 800,
                color: h2h.subjectWins > h2h.viewerWins ? t.green : t.text,
                fontVariantNumeric: "tabular-nums", letterSpacing: "-0.025em", lineHeight: 1,
              }}>
                {h2h.subjectWins}
              </div>
            </div>
          </div>
          <div style={{
            marginTop: 14,
            textAlign: "center",
            fontSize: 11, color: t.textTertiary, letterSpacing: "0.06em",
            textTransform: "uppercase",
          }}>
            {h2h.totalMatches} match{h2h.totalMatches !== 1 ? "es" : ""} played
            {h2h.lastDate ? " · last " + h2h.lastDate : ""}
          </div>
        </section>
      )}

      {authUser && h2h.totalMatches === 0 && played > 0 && (
        <section style={{
          maxWidth: 720, margin: "0 auto",
          padding: "clamp(40px, 5vw, 56px) clamp(20px, 4vw, 32px) 0",
        }}>
          <div style={{
            padding: "16px 0",
            textAlign: "center",
            fontSize: 12, color: t.textSecondary, letterSpacing: "0.04em",
          }}>
            You haven't played {profile.name || "this player"} yet.
          </div>
        </section>
      )}

      <div style={{ height: "clamp(56px, 8vw, 80px)" }} />
    </Shell>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Shell / loading / empty helpers — kept in-file because they're specific
// to this view's layout; promoting them would be premature generalisation.

// Overflow menu next to the Challenge CTA on a public profile. Houses
// the destructive actions (Block, future Report) so they're always one
// click away but never primary chrome. Asymmetric block (council
// decision): blocked users go invisible to the viewer; viewer remains
// neutrally visible to them — no notification fires.
function ProfileOverflowMenu({ t, profile, blockUser }) {
  var [open, setOpen] = useState(false);
  return (
    <div style={{ position: "relative", flexShrink: 0 }}>
      <button onClick={function () { setOpen(!open); }}
        aria-label="More actions"
        title="More actions"
        style={{
          width: 44, height: "100%", padding: 0,
          borderRadius: 0, border: "none",
          background: t.bgTertiary, color: t.textSecondary,
          fontSize: 18, fontWeight: 700, lineHeight: 1, cursor: "pointer",
        }}>⋯</button>
      {open && (
        <>
          <div onClick={function () { setOpen(false); }}
            style={{ position: "fixed", inset: 0, zIndex: 50 }}/>
          <div style={{
            position: "absolute", right: 0, top: "calc(100% + 4px)",
            minWidth: 160, background: t.bgCard, border: "1px solid " + t.border,
            borderRadius: 10, boxShadow: "0 8px 24px rgba(0,0,0,0.18)",
            overflow: "hidden", zIndex: 60,
          }}>
            <button
              onClick={function () {
                setOpen(false);
                if (window.confirm("Block " + profile.name + "? They won't be able to message you and will disappear from your map and discovery surfaces.")) {
                  blockUser(profile);
                }
              }}
              style={{
                display: "block", width: "100%", padding: "12px 16px",
                border: "none", background: "transparent",
                color: t.red, fontSize: 13, fontWeight: 600,
                textAlign: "left", cursor: "pointer",
              }}>
              Block
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function Shell({ t, onBack, children }) {
  return (
    <div style={{ width: "100%" }}>
      {onBack && (
        <div style={{
          maxWidth: 720, margin: "0 auto",
          padding: "20px clamp(20px, 4vw, 32px) 0",
        }}>
          <button
            onClick={onBack}
            style={{
              padding: "8px 14px",
              background: "transparent",
              border: "1px solid " + t.border,
              color: t.textSecondary,
              fontSize: 11, fontWeight: 700,
              letterSpacing: "0.06em", textTransform: "uppercase",
              cursor: "pointer",
            }}>
            ← Back
          </button>
        </div>
      )}
      {children}
    </div>
  );
}

function Skeleton({ t }) {
  return (
    <div style={{ padding: "28px 20px", opacity: 0.5 }}>
      <div style={{ display: "flex", gap: 16, marginBottom: 16 }}>
        <div style={{ width: 72, height: 72, borderRadius: "50%", background: t.bgTertiary }} />
        <div style={{ flex: 1 }}>
          <div style={{ width: 160, height: 20, background: t.bgTertiary, borderRadius: 4, marginBottom: 8 }} />
          <div style={{ width: 100, height: 12, background: t.bgTertiary, borderRadius: 4 }} />
        </div>
      </div>
      <div style={{ height: 60, background: t.bgTertiary, borderRadius: 0, marginBottom: 10 }} />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 0 }}>
        {[0, 1, 2, 3].map(function (i) {
          return <div key={i} style={{ height: 52, background: t.bgTertiary, borderLeft: i === 0 ? "none" : "1px solid " + t.bg }} />;
        })}
      </div>
    </div>
  );
}

function Empty({ t, title, body }) {
  return (
    <div style={{ padding: "60px 24px", textAlign: "center" }}>
      <div style={{ fontSize: 32, marginBottom: 10 }}>🎾</div>
      <div style={{ fontSize: 15, fontWeight: 700, color: t.text, marginBottom: 6 }}>{title}</div>
      <div style={{ fontSize: 13, color: t.textSecondary, lineHeight: 1.5 }}>{body}</div>
    </div>
  );
}
