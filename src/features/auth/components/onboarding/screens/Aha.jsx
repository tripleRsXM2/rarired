// Aha — final screen showing real local players matched to the user's
// zone. Uses fetchPlayersInZone — same RPC the Map tab's zone panel uses
// (RLS lets logged-in users select profiles where home_zone matches).
// We pass [auth.authUser.id] as excludeIds so the user's own profile
// doesn't appear in their own "players near you" list — that was a
// real bug in the previous build (count showed "1 player" with the
// user's own card).
//
// On the final CTAs we call onFinish() / onSkip() which write the final
// profile patch + set the cs-onb-done flag + close the flow. Both
// CTAs now share the same handler so "I'll explore on my own" is
// never a dead button.
import { useEffect, useState } from "react";
import { PrimaryButton, GhostButton, ScreenIn } from "../atoms.jsx";
import { fetchPlayersInZone } from "../../../../map/services/mapService.js";
import { ZONE_BY_ID } from "../../../../map/data/zones.js";
import { avColor, initials as avInitials } from "../../../../../lib/utils/avatar.js";

export default function Aha({ state, T, onFinish, onSkip, onOpenProfile, busy, viewerId }) {
  const [players, setPlayers] = useState(null);
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!state.zone) { setPlayers([]); return; }
    var exclude = viewerId ? [viewerId] : [];
    fetchPlayersInZone(state.zone, 6, exclude).then((r) => {
      if (cancelled) return;
      // Belt-and-braces: also filter client-side in case RLS lets the
      // viewer's own row through (older sessions, race conditions).
      var rows = (r && r.data) || [];
      if (viewerId) rows = rows.filter(function(p){ return p && p.id !== viewerId; });
      setPlayers(rows);
    }).catch(() => { if (!cancelled) setPlayers([]); });
    return () => { cancelled = true; };
  }, [state.zone, viewerId]);

  useEffect(() => {
    const t = setTimeout(() => setRevealed(true), 250);
    return () => clearTimeout(t);
  }, [players]);

  const zoneName = (ZONE_BY_ID[state.zone] || {}).name || "your area";
  const count = players ? players.length : 0;

  return (
    <ScreenIn k="s7">
      <div style={{ flex: 1, display: "flex", flexDirection: "column", padding: "12px 28px 28px", minHeight: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
          <PulseDot color={T.accent}/>
          <div style={{ fontFamily: T.font, fontSize: 12, fontWeight: 600, letterSpacing: "0.14em", textTransform: "uppercase", color: T.muted }}>
            Live · {zoneName}
          </div>
        </div>
        <h1 style={{
          fontFamily: T.fontDisplay, fontWeight: 600, fontSize: 36, lineHeight: 1.0,
          letterSpacing: "-0.03em", margin: "12px 0 6px", color: T.fg,
        }}>
          {players === null
            ? "Finding players…"
            : count === 0
              ? "You're early in this area."
              : `${count} ${count === 1 ? "player" : "players"} near you, ready to hit.`
          }
        </h1>
        <p style={{ fontFamily: T.font, fontSize: 14, lineHeight: 1.4, color: T.muted, margin: 0 }}>
          {count === 0
            ? "We'll notify you the moment someone joins. In the meantime, log a match or invite a friend."
            : "Matched on level, area, and when you play."
          }
        </p>

        <div style={{ flex: 1, marginTop: 22, overflowY: "auto", minHeight: 0, paddingBottom: 4 }}>
          {players === null ? (
            <SkeletonStack T={T}/>
          ) : count === 0 ? (
            <EmptyState T={T}/>
          ) : (
            <StackedPlayers players={players} revealed={revealed} T={T} onOpenProfile={onOpenProfile}/>
          )}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 12 }}>
          <PrimaryButton T={T} onClick={onFinish} disabled={busy}>
            {busy ? "Saving…" : "Get started"}
          </PrimaryButton>
          {onSkip && <GhostButton T={T} onClick={onSkip}>I'll explore on my own</GhostButton>}
        </div>
      </div>
    </ScreenIn>
  );
}

function StackedPlayers({ players, revealed, T, onOpenProfile }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {players.map((p, i) => (
        <div key={p.id} style={{
          opacity: revealed ? 1 : 0,
          transform: revealed ? "translateY(0) scale(1)" : "translateY(24px) scale(0.96)",
          transition: `opacity 540ms cubic-bezier(.2,.8,.2,1) ${i * 110}ms, transform 540ms cubic-bezier(.2,.8,.2,1) ${i * 110}ms`,
        }}>
          <PlayerCard p={p} T={T} onOpenProfile={onOpenProfile}/>
        </div>
      ))}
    </div>
  );
}

function PlayerCard({ p, T, onOpenProfile }) {
  // Cards link to the real profile route. User feedback: 'you should
  // link the existing profiles into find players.' p comes from
  // fetchPlayersInZone — already a real profile row, so we can hand
  // its id straight to the existing openProfile flow.
  const init = (p.avatar || avInitials(p.name || "")) || "?";
  const clickable = !!(onOpenProfile && p.id);
  const handleOpen = clickable ? function(){ onOpenProfile(p.id); } : null;
  return (
    <button
      type="button"
      onClick={handleOpen}
      disabled={!clickable}
      aria-label={clickable ? ("Open " + (p.name || "player") + "'s profile") : undefined}
      style={{
        appearance: "none", textAlign: "left", width: "100%",
        display: "flex", alignItems: "center", gap: 14,
        padding: "14px 16px",
        background: T.surface, border: `1px solid ${T.line}`, borderRadius: 16,
        cursor: clickable ? "pointer" : "default",
        fontFamily: T.font, color: T.fg,
        transition: "transform 160ms cubic-bezier(.2,.8,.2,1), box-shadow 160ms",
      }}
      onMouseDown={clickable ? function(e){ e.currentTarget.style.transform = "scale(0.98)"; } : undefined}
      onMouseUp={clickable ? function(e){ e.currentTarget.style.transform = "scale(1)"; } : undefined}
      onMouseLeave={clickable ? function(e){ e.currentTarget.style.transform = "scale(1)"; } : undefined}
    >
      <div style={{
        width: 46, height: 46, borderRadius: 999,
        background: avColor(p.name),
        display: "flex", alignItems: "center", justifyContent: "center",
        fontFamily: T.fontDisplay, fontSize: 16, fontWeight: 600,
        color: "#fff", letterSpacing: "-0.02em", flexShrink: 0,
        overflow: "hidden",
      }}>
        {p.avatar_url
          ? <img src={p.avatar_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }}/>
          : init
        }
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: T.fontDisplay, fontSize: 16, fontWeight: 600, letterSpacing: "-0.01em", color: T.fg }}>
          {p.name || "Player"}
        </div>
        <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
          {p.skill && <Tag T={T} accent>{p.skill}</Tag>}
          {p.suburb && <Tag T={T}>{p.suburb}</Tag>}
        </div>
      </div>
      {clickable && (
        <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true" style={{ flexShrink: 0, opacity: 0.45 }}>
          <path d="M5 3 L 9 7 L 5 11" stroke={T.fg} strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      )}
    </button>
  );
}

function Tag({ children, T, accent = false }) {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center",
      padding: "2px 8px", borderRadius: 999,
      background: accent ? T.accent : "transparent",
      border: accent ? `1px solid ${T.fg}` : `1px solid ${T.line2}`,
      color: accent ? T.fg : T.muted,
      fontFamily: T.font, fontSize: 11, fontWeight: 600, letterSpacing: "0.02em",
    }}>{children}</span>
  );
}

function PulseDot({ color }) {
  return (
    <div style={{ position: "relative", width: 8, height: 8 }}>
      <div style={{ position: "absolute", inset: 0, borderRadius: 999, background: color }}/>
      <div style={{
        position: "absolute", inset: -4, borderRadius: 999, background: color, opacity: 0.4,
        animation: "csOnbPulseRing 1.6s ease-out infinite",
      }}/>
    </div>
  );
}

function SkeletonStack({ T }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {[0,1,2].map((i) => (
        <div key={i} style={{
          background: T.surface, border: `1px solid ${T.line}`, borderRadius: 16,
          padding: "14px 16px", display: "flex", alignItems: "center", gap: 14, opacity: 0.6,
        }}>
          <div style={{ width: 46, height: 46, borderRadius: 999, background: T.surface2 }}/>
          <div style={{ flex: 1 }}>
            <div style={{ width: "60%", height: 14, background: T.surface2, borderRadius: 4 }}/>
            <div style={{ width: "30%", height: 10, background: T.surface2, borderRadius: 4, marginTop: 8 }}/>
          </div>
        </div>
      ))}
    </div>
  );
}

function EmptyState({ T }) {
  return (
    <div style={{
      background: T.surface, border: `1px solid ${T.line}`, borderRadius: 18,
      padding: "30px 22px", textAlign: "center",
    }}>
      <svg width="44" height="44" viewBox="0 0 44 44" style={{ display: "block", margin: "0 auto 14px" }}>
        <circle cx="22" cy="22" r="20" fill="none" stroke={T.line2} strokeWidth="1.4"/>
        <path d="M14 22 H 30 M 22 14 V 30" stroke={T.fg} strokeWidth="1.4" strokeLinecap="round"/>
      </svg>
      <div style={{ fontFamily: T.fontDisplay, fontSize: 18, fontWeight: 600, letterSpacing: "-0.01em", color: T.fg }}>
        Be the first here
      </div>
      <div style={{ fontFamily: T.font, fontSize: 13, color: T.muted, marginTop: 6, lineHeight: 1.5 }}>
        Invite a friend or post a match — players join your zone every week.
      </div>
    </div>
  );
}
