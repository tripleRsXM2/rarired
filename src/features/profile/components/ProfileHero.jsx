// src/features/profile/components/ProfileHero.jsx
//
// Slice 2 of the design overhaul: the Profile Hero. Used by both
// ProfileTab (own profile) and PlayerProfileView (anyone else's
// public profile). Replaces the older two-block hero (identity row +
// separate ranking card + 3-pill trust strip) with a single editorial
// frame.
//
// Design rules (docs/design-direction.md → Profile structure):
//   • Avatar 88px (the photographic anchor — Profile is the crown jewel)
//   • Name + suburb + skill/style as the identity line
//   • One signature metric: ranking_points, dominant (38px)
//   • Recent form chips next to the metric
//   • Single trust badge — NOT a row of three. Consolidates the older
//     "confirmed count + provisional + confirmation rate" trio into a
//     single contextual pill (provisional state takes precedence; once
//     settled the pill becomes the confirmed-count badge). The
//     confirmation-rate moves to the deeper-stats accordion in commit
//     2D where it belongs.
//   • Optional `actionSlot` for the host page's primary CTA — Edit on
//     own profile, Challenge + overflow on a public profile.

import { avColor, avatarUrl, displayLocation } from "../../../lib/utils/avatar.js";
import { PresenceDot } from "../../people/components/PresenceIndicator.jsx";
import {
  computeRecentForm,
  formatConfirmedBadge,
  provisionalLabel,
} from "../utils/profileStats.js";

function trustPill(t, profile) {
  // Provisional users (< 20 confirmed matches) get the orange "still
  // settling" pill. Once settled, we show the confirmed-count badge.
  // This is the single trust signal in the Hero.
  var prov = provisionalLabel(profile);
  if (prov) {
    return {
      icon: "⚖",
      text: prov,
      color: t.orange,
      bg: t.orangeSubtle,
    };
  }
  var confirmed = formatConfirmedBadge(profile);
  if (confirmed) {
    return {
      icon: "✓",
      text: confirmed,
      color: t.green,
      bg: t.greenSubtle,
    };
  }
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
            boxShadow: "0 0 0 3px " + t.bg + ", 0 0 0 5px " + avColor(profile.name) + "44",
            background: "#eee",
          }}
        />
      ) : (
        <div style={{
          width: sz, height: sz, borderRadius: "50%",
          background: avColor(profile.name),
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: Math.round(sz * 0.34), fontWeight: 800, color: "#fff",
          boxShadow: "0 0 0 3px " + t.bg + ", 0 0 0 5px " + avColor(profile.name) + "44",
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
  actionSlot,           // host-supplied primary CTA (Edit / Challenge / etc)
  belowIdentitySlot,    // host-supplied secondary row (e.g. PlayerProfileView's Challenge button)
  recentFormHistory,    // viewer's match history (for own profile) OR null on public
}) {
  if (!profile) return null;

  var rankPts    = profile.ranking_points != null ? profile.ranking_points : 1000;
  var location   = displayLocation(profile);
  var recentForm = recentFormHistory ? computeRecentForm(recentFormHistory, 5) : [];
  var trust      = trustPill(t, profile);

  return (
    <div style={{
      background: t.bgCard,
      border: "1px solid " + t.border,
      borderRadius: 14,
      padding: "26px 22px 22px",
    }}>
      {/* Identity row — avatar + name + meta + (optional) action */}
      <div className="cs-profile-hero-row" style={{ display: "flex", alignItems: "flex-start", gap: 18 }}>
        <AvatarBlock t={t} profile={profile} viewerIsSelf={viewerIsSelf} size={88} />
        <div style={{ flex: 1, minWidth: 0, paddingTop: 4 }}>
          <div style={{
            fontSize: 24, fontWeight: 800, color: t.text,
            letterSpacing: "-0.5px", lineHeight: 1.1,
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>
            {profile.name || "Unnamed player"}
          </div>
          {location && (
            <div style={{ fontSize: 13, color: t.textSecondary, marginTop: 4 }}>
              {location}
            </div>
          )}
          {(profile.skill || profile.style) && (
            <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
              {profile.skill && (
                <span style={{
                  fontSize: 11, fontWeight: 700, color: t.accent,
                  background: t.accentSubtle, padding: "3px 10px", borderRadius: 20,
                  letterSpacing: "0.02em",
                }}>
                  {profile.skill}
                </span>
              )}
              {profile.style && (
                <span style={{
                  fontSize: 11, fontWeight: 600, color: t.green,
                  background: t.greenSubtle, padding: "3px 10px", borderRadius: 20,
                }}>
                  {profile.style}
                </span>
              )}
            </div>
          )}
        </div>
        {actionSlot && (
          <div style={{ flexShrink: 0, marginTop: 4 }}>
            {actionSlot}
          </div>
        )}
      </div>

      {/* Optional bio */}
      {profile.bio && (
        <p style={{
          fontSize: 13, color: t.textSecondary, lineHeight: 1.55,
          marginTop: 14, marginBottom: 0,
        }}>
          {profile.bio}
        </p>
      )}

      {/* Optional secondary slot — e.g. PlayerProfileView's Challenge button */}
      {belowIdentitySlot && (
        <div style={{ marginTop: 16 }}>
          {belowIdentitySlot}
        </div>
      )}

      {/* Signature metric + recent form. Side-by-side; wraps on mobile. */}
      <div className="cs-profile-hero-stats" style={{
        display: "flex", alignItems: "flex-end", gap: 28,
        marginTop: 20, flexWrap: "wrap",
      }}>
        <div style={{ minWidth: 0 }}>
          <div style={{
            fontSize: 38, fontWeight: 800, color: t.text,
            letterSpacing: "-1px", lineHeight: 1, fontVariantNumeric: "tabular-nums",
          }}>
            {rankPts.toLocaleString()}
          </div>
          <div style={{
            fontSize: 10, fontWeight: 700, color: t.textTertiary,
            textTransform: "uppercase", letterSpacing: "0.08em", marginTop: 6,
          }}>
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
                    width: 22, height: 22, borderRadius: 0,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 11, fontWeight: 700,
                    color: isW ? t.green : t.red,
                    background: isW ? t.greenSubtle : t.redSubtle,
                    border: "1px solid " + (isW ? t.green : t.red) + "33",
                  }}>{r}</span>
                );
              })}
            </div>
            <div style={{
              fontSize: 10, fontWeight: 700, color: t.textTertiary,
              textTransform: "uppercase", letterSpacing: "0.08em", marginTop: 6,
            }}>
              Recent form
            </div>
          </div>
        )}
      </div>

      {/* Single trust pill */}
      {trust && (
        <div style={{ marginTop: 18 }}>
          <span style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            padding: "5px 11px", borderRadius: 20,
            background: trust.bg, color: trust.color,
            border: "1px solid " + trust.color + "33",
            fontSize: 11, fontWeight: 700, letterSpacing: "0.02em",
          }}>
            <span aria-hidden="true">{trust.icon}</span>
            <span>{trust.text}</span>
          </span>
        </div>
      )}
    </div>
  );
}
