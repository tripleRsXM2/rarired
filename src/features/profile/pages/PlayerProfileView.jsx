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

  // Slice 2: ProfileHero handles avatar / name / location / skill / style /
  // bio / signature metric / single trust pill. Recent-form chips show only
  // when the viewer has confirmed matches with this player (we don't have
  // public match history for arbitrary users — RLS), so we hide them here
  // and surface H2H instead.
  var challengeBlock = (openChallenge && authUser && profile.id !== authUser.id) ? (
    <div style={{ display: "flex", gap: 6, alignItems: "stretch" }}>
      <button
        onClick={function () { openChallenge(profile, "profile"); }}
        style={{
          flex: 1, padding: "12px", borderRadius: 8, border: "none",
          background: t.accent, color: "#fff",
          fontSize: 13, fontWeight: 700, letterSpacing: "0.02em", textTransform: "uppercase",
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
      {/* Hero (slice 2) */}
      <div style={{ padding: "20px 20px 14px" }}>
        <ProfileHero
          t={t}
          profile={profile}
          viewerIsSelf={false}
          recentFormHistory={null}
          belowIdentitySlot={challengeBlock}
        />
      </div>

      <div style={{ padding: "0 20px" }}>
        {/* Streak summary — kept until commit 2D folds it into the
            stats accordion. Ranking already lives in the Hero. */}
        {streakCount > 0 && (
          <div style={{
            background: t.bgCard, border: "1px solid " + t.border, borderRadius: 0,
            padding: "12px 14px", marginBottom: 12,
            display: "flex", justifyContent: "flex-end", alignItems: "center",
          }}>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 9, fontWeight: 700, color: t.textTertiary, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 2 }}>
                Current streak
              </div>
              <div style={{
                fontSize: 22, fontWeight: 800,
                color: streakType === "win" ? t.green : t.red,
                letterSpacing: "-0.4px", lineHeight: 1.1,
              }}>
                {streakLabel}
              </div>
            </div>
          </div>
        )}

        {/* Stats strip — 4-col, shared outer border, uppercase caps labels */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 0, marginBottom: 18, background: t.bgCard, border: "1px solid " + t.border }}>
          {[
            { l: "Matches", v: played, c: t.text },
            { l: "Wins",    v: wins,   c: t.green },
            { l: "Losses",  v: losses, c: t.red },
            { l: "Win %",   v: played ? winRate + "%" : "—", c: t.accent },
          ].map(function (s, i) {
            return (
              <div key={s.l} style={{ padding: "10px 8px", textAlign: "center", borderLeft: i === 0 ? "none" : "1px solid " + t.border }}>
                <div style={{ fontSize: 9, color: t.textTertiary, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 3 }}>{s.l}</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: s.c, fontVariantNumeric: "tabular-nums", letterSpacing: "-0.2px", lineHeight: 1.1 }}>{s.v}</div>
              </div>
            );
          })}
        </div>

        {/* Head-to-head — only shown when the two players have actually played */}
        {authUser && h2h.totalMatches > 0 && (
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 9, fontWeight: 700, color: t.textTertiary, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 8 }}>
              Head-to-head
            </div>
            <div style={{
              background: t.bgCard, border: "1px solid " + t.border, borderRadius: 0,
            }}>
              <div style={{ display: "flex", alignItems: "stretch", justifyContent: "space-between" }}>
                <div style={{ textAlign: "center", flex: 1, padding: "12px 10px" }}>
                  <div style={{ fontSize: 9, fontWeight: 700, color: t.textTertiary, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>You</div>
                  <div style={{ fontSize: 22, fontWeight: 800, color: h2h.viewerWins > h2h.subjectWins ? t.green : t.text, fontVariantNumeric: "tabular-nums", letterSpacing: "-0.4px", lineHeight: 1.1 }}>
                    {h2h.viewerWins}
                  </div>
                </div>
                <div style={{ fontSize: 14, color: t.textTertiary, fontWeight: 300, alignSelf: "center", padding: "0 4px" }}>—</div>
                <div style={{ textAlign: "center", flex: 1, padding: "12px 10px" }}>
                  <div style={{ fontSize: 9, fontWeight: 700, color: t.textTertiary, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {profile.name || "Them"}
                  </div>
                  <div style={{ fontSize: 22, fontWeight: 800, color: h2h.subjectWins > h2h.viewerWins ? t.green : t.text, fontVariantNumeric: "tabular-nums", letterSpacing: "-0.4px", lineHeight: 1.1 }}>
                    {h2h.subjectWins}
                  </div>
                </div>
              </div>
              <div style={{ textAlign: "center", fontSize: 10, color: t.textTertiary, borderTop: "1px solid " + t.border, padding: "8px 10px", letterSpacing: "0.02em" }}>
                {h2h.totalMatches} match{h2h.totalMatches !== 1 ? "es" : ""} played
                {h2h.lastDate ? " · last " + h2h.lastDate : ""}
              </div>
            </div>
          </div>
        )}

        {authUser && h2h.totalMatches === 0 && played > 0 && (
          <div style={{
            marginBottom: 20,
            padding: "12px 14px",
            background: t.bgCard, border: "1px dashed " + t.border, borderRadius: 0,
            textAlign: "center",
            fontSize: 12, color: t.textSecondary,
          }}>
            You haven't played {profile.name || "this player"} yet.
          </div>
        )}
      </div>
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
    <div style={{ maxWidth: 680, margin: "0 auto", paddingBottom: 100 }}>
      {onBack && (
        <button
          onClick={onBack}
          style={{
            margin: "14px 20px 0", padding: "6px 12px",
            background: "transparent", border: "1px solid " + t.border,
            borderRadius: 0, color: t.textSecondary, fontSize: 12, fontWeight: 600,
            cursor: "pointer",
          }}>
          ← Back
        </button>
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
