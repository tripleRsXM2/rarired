// src/features/profile/components/ProfileHero.jsx
//
// Visual reset v2: ProfileHero drops the card frame and adopts the
// same borderless editorial composition Home now uses. The display
// ranking number is the loudest thing on the page; the avatar remains
// (the photographic anchor for identity), but supporting chrome
// shrinks back so type carries the surface.
//
// Composition (top → bottom):
//   1. Top row — 88px avatar (left) + actionSlot (right, e.g. Edit)
//   2. Name as display text (clamp 28-40px, weight 800)
//   3. Caption row — "Skill · Style · Suburb" as one quiet line
//      (no pills — the v1 row of pills became one caption)
//   4. Bio (optional)
//   5. Display ranking metric — clamp(56-96px) tabular-nums weight 800,
//      mirrors HomeHero
//   6. Recent form chips — sharp bordered W/L glyphs
//   7. Single trust caption (provisional / confirmed) — uppercase, no pill
//   8. belowIdentitySlot — used by PlayerProfileView for the
//      Challenge CTA (full-width primary block, mirrors LOG A MATCH)

import { avColor, avatarUrl, displayLocation } from "../../../lib/utils/avatar.js";
import { PresenceDot } from "../../people/components/PresenceIndicator.jsx";
import {
  computeRecentForm,
  formatConfirmedBadge,
  provisionalLabel,
} from "../utils/profileStats.js";

function trustLine(t, profile) {
  var prov = provisionalLabel(profile);
  if (prov) return { text: prov, color: t.orange };
  var confirmed = formatConfirmedBadge(profile);
  if (confirmed) return { text: confirmed, color: t.textTertiary };
  return null;
}

function AvatarBlock({ t, profile, viewerIsSelf, size }) {
  var sz = size || 88;
  var url = avatarUrl(profile);
  return (
    <div style={{ position: "relative", flexShrink: 0 }}>
      {url ? (
        <img
          src={url}
          alt={profile.name || "player"}
          style={{
            width: sz, height: sz, borderRadius: "50%", objectFit: "cover",
            background: "#eee",
          }}
        />
      ) : (
        <div style={{
          width: sz, height: sz, borderRadius: "50%",
          background: avColor(profile.name),
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: Math.round(sz * 0.34), fontWeight: 800, color: "#fff",
        }}>
          {profile.avatar || (profile.name || "?").slice(0, 2).toUpperCase()}
        </div>
      )}
      <PresenceDot profile={profile} t={t} viewerIsSelf={!!viewerIsSelf} size={18} />
    </div>
  );
}

export default function ProfileHero({
  t, profile, viewerIsSelf,
  actionSlot,           // host-supplied — top-right (Edit)
  belowIdentitySlot,    // host-supplied — full-width below trust (Challenge CTA on public profile)
  recentFormHistory,    // viewer's match history; null on public profile (RLS)
}) {
  if (!profile) return null;

  var played       = profile.matches_played != null ? profile.matches_played : 0;
  var hasMatches   = played > 0;
  var rankPts      = profile.ranking_points != null ? profile.ranking_points : 1000;
  var location     = displayLocation(profile);
  var recentForm   = recentFormHistory ? computeRecentForm(recentFormHistory, 5) : [];
  var trust        = trustLine(t, profile);

  var captionParts = [profile.skill, profile.style, location].filter(Boolean);

  return (
    <div className="cs-profile-hero">
      {/* Top row — avatar + Edit/etc action */}
      <div style={{
        display: "flex", alignItems: "flex-start", gap: 18,
        justifyContent: "space-between",
      }}>
        <AvatarBlock t={t} profile={profile} viewerIsSelf={viewerIsSelf} size={88} />
        {actionSlot && (
          <div style={{ flexShrink: 0, paddingTop: 6 }}>{actionSlot}</div>
        )}
      </div>

      {/* Name — display type, the page's title */}
      <div style={{
        marginTop: 22,
        fontSize: "clamp(28px, 4.6vw, 40px)",
        fontWeight: 800,
        color: t.text,
        letterSpacing: "-0.025em",
        lineHeight: 1.05,
      }}>
        {profile.name || "Unnamed player"}
      </div>

      {/* Caption row — one quiet line, no pills */}
      {captionParts.length > 0 && (
        <div style={{
          marginTop: 10,
          fontSize: 13,
          fontWeight: 500,
          color: t.textTertiary,
          letterSpacing: "0.01em",
        }}>
          {captionParts.join("  ·  ")}
        </div>
      )}

      {/* Bio */}
      {profile.bio && (
        <p style={{
          marginTop: 12,
          marginBottom: 0,
          fontSize: 13,
          color: t.textSecondary,
          lineHeight: 1.55,
          maxWidth: 560,
        }}>
          {profile.bio}
        </p>
      )}

      {/* Display ranking metric */}
      {hasMatches && (
        <div style={{ marginTop: "clamp(28px, 4vw, 40px)" }}>
          <div style={{
            fontSize: "clamp(56px, 11vw, 96px)",
            fontWeight: 800,
            color: t.text,
            letterSpacing: "-0.04em",
            lineHeight: 0.95,
            fontVariantNumeric: "tabular-nums",
          }}>
            {rankPts.toLocaleString()}
          </div>
          <div style={{
            marginTop: 8,
            fontSize: 10,
            fontWeight: 700,
            color: t.textTertiary,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
          }}>
            Ranking points
          </div>
        </div>
      )}

      {/* Recent form chips — only when we have viewer history */}
      {recentForm.length > 0 && (
        <div style={{ marginTop: 24, display: "flex", gap: 5 }}>
          {recentForm.map(function (r, i) {
            var isW = r === "W";
            return (
              <span key={i} style={{
                width: 26, height: 26,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 12, fontWeight: 800,
                color: isW ? t.green : t.red,
                background: "transparent",
                border: "1.5px solid " + (isW ? t.green : t.red),
                borderRadius: 0,
                letterSpacing: "0.02em",
              }}>{r}</span>
            );
          })}
        </div>
      )}

      {/* Single trust caption */}
      {trust && (
        <div style={{
          marginTop: 18,
          fontSize: 11,
          fontWeight: 700,
          color: trust.color,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
        }}>
          {trust.text}
        </div>
      )}

      {/* Below-identity slot — Challenge CTA on public profile lives here
          as a full-width primary block, mirroring Home's LOG A MATCH. */}
      {belowIdentitySlot && (
        <div style={{ marginTop: 28 }}>
          {belowIdentitySlot}
        </div>
      )}
    </div>
  );
}
