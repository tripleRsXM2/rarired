// PlayerProfileScreen.jsx — read-only profile for another player in
// the v2 BaselineApp. Surfaces the same information v1's
// PlayerProfileView shows (identity, CourtSync rating, played/wins/
// losses/win%, trust badge, head-to-head vs the viewer) but in the
// v2 modern design language — Inter body, JetBrains Mono eyebrows,
// serif display headings, theme-token surfaces.
//
// Data comes from useV2PlayerProfile(userId, viewerId). No v1
// feature imports — the v2 isolation rule holds.

import React from "react";
import { Eyebrow } from "../matches/components/atoms.jsx";
import { useV2PlayerProfile } from "../../data/index.js";

export default function PlayerProfileScreen({
  theme, accent, userId, viewerId, onBack, isPhone = false,
}) {
  var state = useV2PlayerProfile(userId, viewerId);
  var profile = state.profile;

  var padX = isPhone ? 18 : 32;

  // ── Shell — back bar + body. Reused across loading / error /
  //    loaded so the back affordance is always present. ──────────
  function Shell(props) {
    return (
      <div style={{
        width: "100%", height: "100%", overflowY: "auto",
        background: theme.bg, color: theme.ink,
        display: "flex", flexDirection: "column",
      }}>
        <div style={{
          padding: isPhone ? "52px 12px 8px" : "16px 18px 8px",
          flexShrink: 0,
        }}>
          <button
            onClick={onBack}
            className="t-btn"
            aria-label="Back"
            style={{
              width: 32, height: 32, appearance: "none", border: 0,
              background: "transparent", color: theme.ink, cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="m15 18-6-6 6-6"/>
            </svg>
          </button>
        </div>
        {props.children}
      </div>
    );
  }

  if (state.loading) {
    return (
      <Shell>
        <div style={{ padding: "8px " + padX + "px" }}>
          <SkeletonBlock theme={theme} h={64} w={64} radius="50%" />
          <div style={{ height: 14 }} />
          <SkeletonBlock theme={theme} h={34} w="62%" />
          <div style={{ height: 22 }} />
          <SkeletonBlock theme={theme} h={92} w="46%" />
          <div style={{ height: 26 }} />
          <SkeletonBlock theme={theme} h={70} w="100%" />
        </div>
      </Shell>
    );
  }

  if (state.error || !profile) {
    return (
      <Shell>
        <div style={{ padding: "40px " + padX + "px", textAlign: "center" }}>
          <h2 className="t-serif" style={{ fontSize: 26, margin: "0 0 8px", letterSpacing: "-0.02em" }}>
            {state.error ? "Couldn't load profile" : "Profile not found"}
          </h2>
          <p style={{ fontFamily: "Inter", fontSize: 13, color: theme.inkSoft, lineHeight: 1.5, margin: 0 }}>
            {state.error
              ? "Something went wrong fetching this player."
              : "This player may have deleted their account."}
          </p>
        </div>
      </Shell>
    );
  }

  // ── Derived display values ────────────────────────────────────
  var name    = profile.name || "Player";
  var first   = name.split(/\s+/)[0] || "Player";
  var region  = profile.suburb || "—";
  var level   = profile.skill  || "—";
  var rating  = (profile.ranking_points != null) ? Math.round(profile.ranking_points) : null;
  var played  = profile.matches_played || 0;
  var wins    = profile.wins   || 0;
  var losses  = profile.losses || 0;
  var winRate = (wins + losses) > 0 ? Math.round((wins / (wins + losses)) * 100) : null;

  var h2h        = state.h2h || { viewerWins: 0, subjectWins: 0, total: 0, lastDate: null };
  var hasH2H     = viewerId && viewerId !== userId && h2h.total > 0;
  var showNoH2H  = viewerId && viewerId !== userId && h2h.total === 0 && played > 0;

  var initials = (name.slice(0, 2) || "?").toUpperCase();

  return (
    <Shell>
      <div style={{ paddingBottom: 60 }}>
        {/* ── Hero — avatar + name + region·level + trust chip ──── */}
        <div style={{
          display: "flex", alignItems: "center", gap: 14,
          padding: "8px " + padX + "px 14px",
        }}>
          <div style={{
            width: 64, height: 64, borderRadius: "50%", flexShrink: 0,
            overflow: "hidden", background: theme.bgRaised,
            border: "0.5px solid " + theme.line,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontFamily: "Inter", fontWeight: 700, fontSize: 22, color: theme.inkSoft,
          }}>
            {profile.avatar_url
              ? <img src={profile.avatar_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              : initials}
          </div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <h1 className="t-serif" style={{
              margin: 0, fontSize: isPhone ? 30 : 36, lineHeight: 1.0,
              letterSpacing: "-0.02em",
              whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
            }}>{name}</h1>
            <div style={{
              marginTop: 6,
              fontFamily: "JetBrains Mono, ui-monospace, monospace",
              fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase",
              color: theme.inkSoft,
            }}>
              {region} · {level}
            </div>
            {state.trustBadge && (
              <div style={{
                marginTop: 8, display: "inline-flex", alignItems: "center",
                padding: "3px 9px", borderRadius: 999,
                background: accent + "22", color: theme.ink,
                fontFamily: "JetBrains Mono, ui-monospace, monospace",
                fontSize: 9.5, fontWeight: 700, letterSpacing: "0.12em",
                textTransform: "uppercase",
              }}>
                {state.trustBadge}
              </div>
            )}
          </div>
        </div>

        {/* ── Rating numeral ───────────────────────────────────── */}
        {rating != null && (
          <div style={{ padding: "10px " + padX + "px 6px" }}>
            <div className="t-num" style={{
              fontFamily: "JetBrains Mono, ui-monospace, monospace",
              fontVariantNumeric: "tabular-nums",
              fontSize: isPhone ? 64 : 78, fontWeight: 700,
              letterSpacing: "-0.04em", lineHeight: 0.95, color: theme.ink,
            }}>
              {rating.toLocaleString()}
            </div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginTop: 6, flexWrap: "wrap" }}>
              <Eyebrow color={theme.inkSoft}>CourtSync rating</Eyebrow>
              <span style={{
                fontFamily: "Inter", fontSize: 11, color: theme.inkFaint, fontWeight: 500,
              }}>
                {played} confirmed match{played === 1 ? "" : "es"}
              </span>
            </div>
          </div>
        )}

        {/* ── Record — Played / Wins / Losses / Win % ──────────── */}
        <div style={{ padding: "18px " + padX + "px 4px" }}>
          <div style={{
            display: "grid", gridTemplateColumns: "repeat(4, 1fr)",
            background: theme.bgRaised, border: "0.5px solid " + theme.line,
            borderRadius: 14, overflow: "hidden",
          }}>
            <StatCell theme={theme} value={played}  label="Played" first />
            <StatCell theme={theme} value={wins}    label="Wins" />
            <StatCell theme={theme} value={losses}  label="Losses" />
            <StatCell theme={theme} value={winRate != null ? winRate + "%" : "—"} label="Win %" accent={accent} />
          </div>
        </div>

        {/* ── Head-to-head ─────────────────────────────────────── */}
        {hasH2H && (
          <div style={{ padding: "26px " + padX + "px 4px" }}>
            <Eyebrow color={theme.inkSoft}>Head to head</Eyebrow>
            <div style={{
              marginTop: 12,
              display: "grid", gridTemplateColumns: "1fr 1fr",
              background: theme.bgRaised, border: "0.5px solid " + theme.line,
              borderRadius: 14, overflow: "hidden",
            }}>
              <H2HCell
                theme={theme} accent={accent}
                label="You" value={h2h.viewerWins}
                lead={h2h.viewerWins > h2h.subjectWins}
                first
              />
              <H2HCell
                theme={theme} accent={accent}
                label={first} value={h2h.subjectWins}
                lead={h2h.subjectWins > h2h.viewerWins}
              />
            </div>
            <div style={{
              marginTop: 12, textAlign: "center",
              fontFamily: "JetBrains Mono, ui-monospace, monospace",
              fontSize: 10.5, letterSpacing: "0.1em", textTransform: "uppercase",
              color: theme.inkFaint,
            }}>
              {h2h.total} match{h2h.total === 1 ? "" : "es"} played
            </div>
          </div>
        )}

        {showNoH2H && (
          <div style={{
            padding: "26px " + padX + "px 4px",
            fontFamily: "Inter", fontSize: 13, color: theme.inkSoft,
            textAlign: "center", lineHeight: 1.5,
          }}>
            You haven't played {first} yet.
          </div>
        )}
      </div>
    </Shell>
  );
}

// ── Sub-components ────────────────────────────────────────────────

function StatCell({ theme, value, label, accent, first }) {
  return (
    <div style={{
      padding: "14px 10px",
      borderLeft: first ? "none" : "0.5px solid " + theme.line,
      textAlign: "center",
    }}>
      <div className="t-num" style={{
        fontFamily: "JetBrains Mono, ui-monospace, monospace",
        fontVariantNumeric: "tabular-nums",
        fontSize: 22, fontWeight: 700, letterSpacing: "-0.02em",
        lineHeight: 1, color: accent || theme.ink,
      }}>{value}</div>
      <div style={{
        marginTop: 5,
        fontFamily: "Inter", fontSize: 10, fontWeight: 600,
        letterSpacing: "0.08em", textTransform: "uppercase",
        color: theme.inkSoft,
      }}>{label}</div>
    </div>
  );
}

function H2HCell({ theme, accent, label, value, lead, first }) {
  return (
    <div style={{
      padding: "18px 12px",
      borderLeft: first ? "none" : "0.5px solid " + theme.line,
      textAlign: "center",
    }}>
      <div className="t-num" style={{
        fontFamily: "JetBrains Mono, ui-monospace, monospace",
        fontVariantNumeric: "tabular-nums",
        fontSize: 40, fontWeight: 700, letterSpacing: "-0.03em",
        lineHeight: 1, color: lead ? accent : theme.inkSoft,
      }}>{value}</div>
      <div style={{
        marginTop: 7,
        fontFamily: "Inter", fontSize: 11, fontWeight: 600,
        color: theme.ink,
        whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
      }}>{label}</div>
    </div>
  );
}

function SkeletonBlock({ theme, h, w, radius }) {
  return (
    <div style={{
      height: h, width: w, borderRadius: radius || 10,
      background: theme.bgRaised, border: "0.5px solid " + theme.line,
    }} />
  );
}
