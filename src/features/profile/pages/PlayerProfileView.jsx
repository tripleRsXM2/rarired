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

import { useEffect } from "react";
import { avColor, avatarUrl, displayLocation } from "../../../lib/utils/avatar.js";
import { usePlayerProfile } from "../hooks/usePlayerProfile.js";
import {
  computeHeadToHead,
  formatConfirmedBadge,
  provisionalLabel,
} from "../utils/profileStats.js";
import { track } from "../../../lib/analytics.js";

export default function PlayerProfileView({
  t, authUser, userId, viewerHistory, onBack, openChallenge,
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
  var rankPts = profile.ranking_points != null ? profile.ranking_points : 1000;
  var streakCount = profile.streak_count || 0;
  var streakType  = profile.streak_type;
  var streakLabel = streakCount === 0 ? "—" : streakCount + (streakType === "win" ? " W" : " L");
  var confirmedBadge = formatConfirmedBadge(profile);
  var provLabel = provisionalLabel(profile);

  // H2H computed from the viewer's own history (RLS-safe).
  var h2h = computeHeadToHead(viewerHistory || [], authUser && authUser.id, profile.id);

  return (
    <Shell t={t} onBack={onBack}>
      {/* Hero */}
      <div style={{ padding: "28px 20px 0", background: t.bg }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 16, marginBottom: 18 }}>
          {(function(){
            var url = avatarUrl(profile);
            if(url){
              return (
                <img src={url} alt={profile.name||"player"}
                  style={{
                    width:72, height:72, borderRadius:"50%", objectFit:"cover", flexShrink:0,
                    boxShadow:"0 0 0 3px "+t.bg+", 0 0 0 5px "+avColor(profile.name)+"44",
                    background:"#eee",
                  }}/>
              );
            }
            return (
              <div style={{
                width: 72, height: 72, borderRadius: "50%", flexShrink: 0,
                background: avColor(profile.name),
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 24, fontWeight: 800, color: "#fff",
                boxShadow: "0 0 0 3px " + t.bg + ", 0 0 0 5px " + avColor(profile.name) + "44",
              }}>
                {profile.avatar || (profile.name || "?").slice(0, 2).toUpperCase()}
              </div>
            );
          })()}
          <div style={{ flex: 1, paddingTop: 4, minWidth: 0 }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: t.text, letterSpacing: "-0.5px", lineHeight: 1.1 }}>
              {profile.name || "Unnamed player"}
            </div>
            {displayLocation(profile) && (
              <div style={{ fontSize: 13, color: t.textSecondary, marginTop: 3 }}>{displayLocation(profile)}</div>
            )}
            <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
              {profile.skill && (
                <span style={{ fontSize: 11, fontWeight: 700, color: t.accent, background: t.accentSubtle, padding: "3px 9px", borderRadius: 20, letterSpacing: "0.02em" }}>
                  {profile.skill}
                </span>
              )}
              {profile.style && (
                <span style={{ fontSize: 11, fontWeight: 600, color: t.green, background: t.greenSubtle, padding: "3px 9px", borderRadius: 20 }}>
                  {profile.style}
                </span>
              )}
            </div>
          </div>
        </div>

        {profile.bio && (
          <p style={{ fontSize: 13, color: t.textSecondary, lineHeight: 1.6, marginBottom: 14, marginTop: -4 }}>
            {profile.bio}
          </p>
        )}

        {/* Trust + rating-state pills row (Modules 1 + 5) */}
        {(confirmedBadge || provLabel) && (
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 16 }}>
            {confirmedBadge && (
              <span style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                padding: "5px 10px", borderRadius: 20,
                background: t.greenSubtle, color: t.green,
                border: "1px solid " + t.green + "33",
                fontSize: 11, fontWeight: 700, letterSpacing: "0.02em",
              }}>
                <span>✓</span><span>{confirmedBadge}</span>
              </span>
            )}
            {provLabel && (
              <span style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                padding: "5px 10px", borderRadius: 20,
                background: t.orangeSubtle, color: t.orange,
                border: "1px solid " + t.orange + "33",
                fontSize: 11, fontWeight: 700, letterSpacing: "0.02em",
              }}>
                <span>⚖</span><span>{provLabel}</span>
              </span>
            )}
          </div>
        )}

        {/* Module 4: primary action on a public profile is "Challenge".
            Hidden when the viewer isn't signed in or is somehow viewing
            themselves (route should redirect, but guard anyway).
            Sharp-cornered accent block to match the rest of the chrome. */}
        {openChallenge && authUser && profile.id !== authUser.id && (
          <button
            onClick={function () { openChallenge(profile, "profile"); }}
            style={{
              width: "100%", padding: "12px", borderRadius: 0, border: "none",
              background: t.accent, color: "#fff",
              fontSize: 13, fontWeight: 700, letterSpacing: "0.02em", textTransform: "uppercase",
              cursor: "pointer", transition: "opacity 0.15s", marginBottom: 14,
            }}
            onMouseEnter={function (e) { e.currentTarget.style.opacity = "0.85"; }}
            onMouseLeave={function (e) { e.currentTarget.style.opacity = "1"; }}
          >
            Challenge {profile.name ? profile.name.split(" ")[0] : "player"}
          </button>
        )}

        {/* Ranking card — sharp, same rhythm as ProfileTab */}
        <div style={{
          background: t.bgCard, border: "1px solid " + t.border, borderRadius: 0,
          padding: "12px 14px", marginBottom: 12,
          display: "flex", justifyContent: "space-between", alignItems: "center",
        }}>
          <div>
            <div style={{ fontSize: 9, fontWeight: 700, color: t.textTertiary, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 2 }}>
              Ranking Points
            </div>
            <div style={{ fontSize: 22, fontWeight: 800, color: t.text, letterSpacing: "-0.4px", fontVariantNumeric: "tabular-nums", lineHeight: 1.1 }}>
              {rankPts.toLocaleString()}
            </div>
          </div>
          {streakCount > 0 && (
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
          )}
        </div>

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
