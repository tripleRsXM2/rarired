// FindPlayersWelcome — one-time, non-disruptive welcome surface that
// appears the first time a user lands in the app after onboarding.
//
// Replaces the in-flow Aha screen (per user feedback: 'Find players —
// this should be removed from the onboarding. Have this pop up the
// first time someone signs in. Make it a new menu, ask the design team
// to make it look good and not disruptive.').
//
// Trigger: cs-find-players-pending=1 in localStorage. Set by
// OnboardingFlow.finishOnboarding (both authed + unauth bail) when
// the user finishes the questionnaire. This component checks the
// flag, fetches players in their home zone, renders a sliding card,
// and clears the flag on dismiss.
//
// Design intent: bottom-sheet on mobile (matches Log Match modal),
// centered card on desktop. Soft scrim that's CLEARLY dismissable
// (X button + backdrop tap). NOT a modal — the user can ignore it
// without consequences, and it never re-appears once dismissed.
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { fetchPlayersInZone } from "../../map/services/mapService.js";
import { ZONE_BY_ID } from "../../map/data/zones.js";
import { avColor, initials as avInitials } from "../../../lib/utils/avatar.js";

const FLAG_KEY = "cs-find-players-pending";

// Local skin tokens — match the onboarding's design palette so the
// transition from VerifyEmail → SignIn → FindPlayersWelcome reads as
// one continuous moment. NOT the app's `t` theme system.
const SKIN = {
  bg:      "#FAFAF7",
  surface: "#FFFFFF",
  fg:      "#0A0A0A",
  muted:   "#787569",
  line:    "rgba(10,10,10,0.07)",
  line2:   "rgba(10,10,10,0.16)",
  accent:  "#FF5A1F",
  font:        "'Inter Tight', ui-sans-serif, system-ui, -apple-system, sans-serif",
  fontDisplay: "'Bricolage Grotesque', ui-sans-serif, system-ui, -apple-system, sans-serif",
};

export function isFindPlayersPending(){
  try { return typeof localStorage !== "undefined" && localStorage.getItem(FLAG_KEY) === "1"; }
  catch (_) { return false; }
}
export function clearFindPlayersPending(){
  try { localStorage.removeItem(FLAG_KEY); } catch (_) {}
}

export default function FindPlayersWelcome({ authUser, profile, onOpenProfile }){
  // Local visibility — independent from the localStorage flag so the
  // dismiss animation can play before unmount.
  const [open, setOpen] = useState(function(){
    return !!authUser && isFindPlayersPending();
  });
  const [players, setPlayers] = useState(null);

  // Fetch real players the moment we open. Two-stage: zone first, then
  // platform fallback if the zone is empty.
  useEffect(function(){
    if (!open || !authUser) return;
    let cancelled = false;
    var zone = profile && profile.home_zone;
    var exclude = [authUser.id];
    var primary = zone
      ? fetchPlayersInZone(zone, 6, exclude)
      : Promise.resolve({ data: [] });
    primary.then(function(r){
      if (cancelled) return;
      var rows = (r && r.data) || [];
      rows = rows.filter(function(p){ return p && p.id !== authUser.id; });
      if (rows.length > 0) { setPlayers(rows); return; }
      return fetchPlayersInZone(null, 6, exclude).then(function(r2){
        if (cancelled) return;
        var fb = (r2 && r2.data) || [];
        fb = fb.filter(function(p){ return p && p.id !== authUser.id; });
        setPlayers(fb);
      });
    }).catch(function(){ if (!cancelled) setPlayers([]); });
    return function(){ cancelled = true; };
  }, [open, authUser && authUser.id, profile && profile.home_zone]);

  function dismiss(){
    setOpen(false);
    clearFindPlayersPending();
  }

  if (!open) return null;
  if (typeof document === "undefined") return null;

  const zoneName = profile && profile.home_zone
    ? ((ZONE_BY_ID[profile.home_zone] || {}).name || "your area")
    : "your area";
  const count = players ? players.length : 0;

  return createPortal(
    <div
      role="dialog"
      aria-label="Players near you"
      className="cs-find-players-welcome"
      onClick={function(e){ if (e.target === e.currentTarget) dismiss(); }}
      style={{
        position: "fixed", inset: 0, zIndex: 600,
        // Soft scrim — dimmed but not opaque so the user feels they're
        // still on the home page. Tap-outside dismisses.
        background: "rgba(20,17,14,0.42)",
        display: "flex",
        // Mobile: bottom sheet alignment. Desktop (≥720px): centered.
        alignItems: "flex-end",
        justifyContent: "center",
        animation: "csFindPlayersScrim 240ms ease backwards",
      }}>
      <FontsHook/>
      <ScrimKeyframes/>
      <div
        onClick={function(e){ e.stopPropagation(); }}
        style={{
          width: "100%", maxWidth: 520,
          background: SKIN.bg, color: SKIN.fg,
          borderTopLeftRadius: 22, borderTopRightRadius: 22,
          padding: "26px 24px 30px",
          fontFamily: SKIN.font,
          maxHeight: "88dvh",
          display: "flex", flexDirection: "column",
          boxShadow: "0 -10px 30px rgba(20,17,14,0.18)",
          animation: "csFindPlayersSlide 320ms cubic-bezier(0.22,1,0.36,1) backwards",
          // Desktop: centered card with full radius + bottom margin.
          marginBottom: 0,
        }}>
        {/* Drag-handle dash for the bottom-sheet affordance */}
        <div style={{
          width: 36, height: 4, borderRadius: 2,
          background: SKIN.line2, alignSelf: "center", marginBottom: 16,
          opacity: 0.6,
        }}/>

        {/* Top strip: live dot + zone name + close */}
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <PulseDot color={SKIN.accent}/>
          <div style={{
            fontFamily: SKIN.font, fontSize: 11, fontWeight: 600,
            letterSpacing: "0.14em", textTransform: "uppercase", color: SKIN.muted,
            flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>Live · {zoneName}</div>
          <button type="button" onClick={dismiss}
            aria-label="Close"
            style={{
              appearance: "none", border: 0, background: "transparent",
              color: SKIN.muted, cursor: "pointer", padding: 6, marginRight: -6,
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
              <path d="M4 4 L 14 14 M 14 4 L 4 14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
            </svg>
          </button>
        </div>

        <h2 style={{
          fontFamily: SKIN.fontDisplay, fontWeight: 600, fontSize: 28, lineHeight: 1.05,
          letterSpacing: "-0.025em", margin: "10px 0 4px", color: SKIN.fg,
        }}>
          {players === null
            ? "Finding players…"
            : count === 0
              ? "You're early in this area."
              : `${count} ${count === 1 ? "player" : "players"} near you.`
          }
        </h2>
        <p style={{
          fontFamily: SKIN.font, fontSize: 14, lineHeight: 1.45, color: SKIN.muted,
          margin: 0,
        }}>
          {count === 0
            ? "We'll surface new players the moment they join your zone — or you can invite a friend to log a match together."
            : "Tap a card to see their full profile. You can message or challenge them from there."
          }
        </p>

        <div style={{
          flex: 1, marginTop: 18, overflowY: "auto", minHeight: 0,
          paddingBottom: 4,
        }}>
          {players === null ? (
            <Skeleton/>
          ) : count === 0 ? (
            null
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {players.map(function(p){
                return <PlayerCard key={p.id} p={p} onOpenProfile={onOpenProfile} onAfterTap={dismiss}/>;
              })}
            </div>
          )}
        </div>

        <button type="button" onClick={dismiss}
          style={{
            appearance: "none", border: 0,
            marginTop: 14, padding: "13px 18px", borderRadius: 999,
            background: SKIN.fg, color: SKIN.bg,
            fontFamily: SKIN.font, fontSize: 15, fontWeight: 600,
            cursor: "pointer", letterSpacing: "-0.01em",
            width: "100%",
            transition: "transform 160ms cubic-bezier(.2,.8,.2,1)",
          }}
          onMouseDown={function(e){ e.currentTarget.style.transform = "scale(0.98)"; }}
          onMouseUp={function(e){ e.currentTarget.style.transform = "scale(1)"; }}
          onMouseLeave={function(e){ e.currentTarget.style.transform = "scale(1)"; }}>
          Got it
        </button>
      </div>
    </div>,
    document.body
  );
}

// ─── Bits ──────────────────────────────────────────────────────────

function PlayerCard({ p, onOpenProfile, onAfterTap }){
  const init = (p.avatar || avInitials(p.name || "")) || "?";
  const clickable = !!(onOpenProfile && p.id);
  return (
    <button
      type="button"
      onClick={clickable ? function(){ onOpenProfile(p.id); if (onAfterTap) onAfterTap(); } : undefined}
      disabled={!clickable}
      style={{
        appearance: "none", textAlign: "left", width: "100%",
        display: "flex", alignItems: "center", gap: 14,
        padding: "12px 14px",
        background: SKIN.surface, border: `1px solid ${SKIN.line}`, borderRadius: 14,
        cursor: clickable ? "pointer" : "default",
        fontFamily: SKIN.font, color: SKIN.fg,
        transition: "transform 160ms cubic-bezier(.2,.8,.2,1)",
      }}
      onMouseDown={clickable ? function(e){ e.currentTarget.style.transform = "scale(0.98)"; } : undefined}
      onMouseUp={clickable ? function(e){ e.currentTarget.style.transform = "scale(1)"; } : undefined}
      onMouseLeave={clickable ? function(e){ e.currentTarget.style.transform = "scale(1)"; } : undefined}>
      <div style={{
        width: 42, height: 42, borderRadius: 999,
        background: avColor(p.name),
        display: "flex", alignItems: "center", justifyContent: "center",
        fontFamily: SKIN.fontDisplay, fontSize: 15, fontWeight: 600,
        color: "#fff", letterSpacing: "-0.02em", flexShrink: 0,
        overflow: "hidden",
      }}>
        {p.avatar_url
          ? <img src={p.avatar_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }}/>
          : init
        }
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontFamily: SKIN.fontDisplay, fontSize: 15, fontWeight: 600,
          letterSpacing: "-0.01em", color: SKIN.fg,
        }}>
          {p.name || "Player"}
        </div>
        <div style={{
          marginTop: 4, display: "flex", gap: 6, flexWrap: "wrap",
          fontFamily: SKIN.font, fontSize: 11, fontWeight: 500, color: SKIN.muted,
        }}>
          {p.skill && <span>{p.skill}</span>}
          {p.skill && p.suburb && <span aria-hidden="true">·</span>}
          {p.suburb && <span>{p.suburb}</span>}
        </div>
      </div>
      {clickable && (
        <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true" style={{ flexShrink: 0, opacity: 0.45 }}>
          <path d="M5 3 L 9 7 L 5 11" stroke={SKIN.fg} strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      )}
    </button>
  );
}

function Skeleton(){
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {[0,1,2].map(function(i){
        return (
          <div key={i} style={{
            background: SKIN.surface, border: `1px solid ${SKIN.line}`, borderRadius: 14,
            padding: "12px 14px", display: "flex", alignItems: "center", gap: 14, opacity: 0.6,
          }}>
            <div style={{ width: 42, height: 42, borderRadius: 999, background: SKIN.line }}/>
            <div style={{ flex: 1 }}>
              <div style={{ width: "55%", height: 12, background: SKIN.line, borderRadius: 4 }}/>
              <div style={{ width: "30%", height: 9, background: SKIN.line, borderRadius: 4, marginTop: 8 }}/>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function PulseDot({ color }){
  return (
    <div style={{ position: "relative", width: 8, height: 8 }}>
      <div style={{ position: "absolute", inset: 0, borderRadius: 999, background: color }}/>
      <div style={{
        position: "absolute", inset: -4, borderRadius: 999, background: color, opacity: 0.4,
        animation: "csFindPlayersPulse 1.6s ease-out infinite",
      }}/>
    </div>
  );
}

// Inject keyframes + Google Font links exactly once. Idempotent —
// repeated mounts are harmless. Mirrors the OnboardingFlow's font
// approach so we don't ship a separate font payload.
function FontsHook(){
  useEffect(function(){
    if (typeof document === "undefined") return;
    const id = "cs-find-players-fonts";
    if (document.getElementById(id)) return;
    const link = document.createElement("link");
    link.id = id;
    link.rel = "stylesheet";
    link.href = "https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:wght@500;600;700;800&family=Inter+Tight:wght@400;500;600;700&display=swap";
    document.head.appendChild(link);
  }, []);
  return null;
}

function ScrimKeyframes(){
  useEffect(function(){
    if (typeof document === "undefined") return;
    const id = "cs-find-players-keyframes";
    if (document.getElementById(id)) return;
    const style = document.createElement("style");
    style.id = id;
    style.textContent = [
      "@keyframes csFindPlayersPulse{0%{transform:scale(0.8);opacity:0.6}100%{transform:scale(2.2);opacity:0}}",
      "@keyframes csFindPlayersScrim{from{background:rgba(20,17,14,0)}to{background:rgba(20,17,14,0.42)}}",
      "@keyframes csFindPlayersSlide{from{transform:translateY(100%)}to{transform:translateY(0)}}",
      // Desktop ≥720px: center the card vertically with a margin so it
      // doesn't sit on the bottom edge.
      "@media(min-width:720px){.cs-find-players-welcome{align-items:center !important}",
      ".cs-find-players-welcome > div:nth-child(3){border-radius:22px !important;max-height:80vh !important;animation:csFindPlayersFadeIn 320ms cubic-bezier(0.22,1,0.36,1) backwards !important}",
      "@keyframes csFindPlayersFadeIn{from{transform:scale(0.96);opacity:0}to{transform:scale(1);opacity:1}}}",
    ].join("\n");
    document.head.appendChild(style);
  }, []);
  return null;
}
