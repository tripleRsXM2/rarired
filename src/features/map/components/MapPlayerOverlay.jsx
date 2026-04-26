// src/features/map/components/MapPlayerOverlay.jsx
//
// Map-native player picker — replaces the modal-card step 2 of the
// PlayMatchWizard with a full-bleed overlay over a blurred map. The
// chrome mirrors the existing "Choose your zone" / "Choose court"
// play-mode pattern: bottom-anchored prompt with inline back arrow,
// theme-aware halo shadow, no boxes.
//
// Layout (top → bottom of viewport):
//   • Singles / Doubles toggle (top-centre, floating)
//   • Filter cog button (top-right) — opens an inline filter sheet
//   • Horizontal-scroll player cards (mid → lower-third), floating
//   • "Who do you want to play with?" bottom prompt (same spot/size
//     as Choose court) — morphs into "Continue →" pill once ≥ 1
//     player is picked
//
// The map underneath stays interactive in principle but the
// `data-play-mode='players'` attribute on the leaflet container
// applies the same blur as zone/court mode (see providers.jsx).
//
// State (format, scope, picks, filters, search) lives entirely
// here. On Continue, we hand back the resolved partner profiles
// + ctx to the parent; the parent opens the wizard at the When step.

import { useEffect, useMemo, useState } from "react";
import {
  fetchPlayersInZone,
  fetchPlayersAtCourt,
  scorePlayerForCourt,
  fetchViewerMatchCountsBy,
  tierFromSkill,
} from "../services/mapService.js";
import { nearbySkillLevels, AGE_BRACKET_BY_ID } from "../../../lib/constants/domain.js";
import StepProgressBar from "./StepProgressBar.jsx";
import PlayerAvatar from "../../../components/ui/PlayerAvatar.jsx";
import { track } from "../../../lib/analytics.js";

function firstName(n){ return (n||"Player").split(/\s+/)[0]; }

// Resolve the displayable age-bracket label from a profile.
// Returns the bracket's `label` ("18 – 24", "55+", etc.) or null
// when the user hasn't set one. Single lookup against the shared
// AGE_BRACKETS map — no DOB math, no timezone math.
function bracketLabel(p){
  if(!p || !p.age_bracket) return null;
  var b = AGE_BRACKET_BY_ID[p.age_bracket];
  return b ? b.label : null;
}
function hexToRgba(hex, a){
  if(!hex || typeof hex !== "string") return "rgba(0,0,0," + a + ")";
  var h = hex.replace("#","");
  if(h.length === 3) h = h.split("").map(function(c){return c+c;}).join("");
  var n = parseInt(h, 16);
  var r = (n>>16)&255, g = (n>>8)&255, b = n&255;
  return "rgba("+r+","+g+","+b+","+a+")";
}

export default function MapPlayerOverlay({
  t, mapDark,
  authUser, blockedUserIds,
  zoneId, courtName,
  onBack, onContinue,
  // Phone breakpoint — drives mobile chrome (Singles/Doubles + scope
  // tabs reposition; bottom prompt sized down; back-chevron tighter).
  isMobile = false,
}){
  // Picker state — independent from anything else on the map. Reset
  // implicitly by the parent unmounting/remounting the overlay when
  // playMode flips off and back on.
  var [players, setPlayers]   = useState([]);
  var [loading, setLoading]   = useState(true);
  var [scope, setScope]       = useState("zone"); // "zone" | "everywhere"
  var [format, setFormat]     = useState("doubles"); // "singles" | "doubles"
  var [selectedIds, setSelectedIds] = useState([]);
  var [filtersOpen, setFiltersOpen] = useState(false);
  var [genderFilter, setGenderFilter] = useState("any");
  var [skillFilter, setSkillFilter]   = useState("any");

  var maxSelect = format === "singles" ? 1 : 3;
  var activeFilterCount =
    (genderFilter !== "any" ? 1 : 0) +
    (skillFilter !== "any" ? 1 : 0);

  // Load players whenever the inputs change. Same merge + sort logic
  // as the wizard's step 2 — pulls the zone roster + court roster,
  // dedupes, history-annotates, and ranks.
  useEffect(function(){
    if(!zoneId) return;
    var cancelled = false;
    setLoading(true);
    var viewerId = authUser && authUser.id ? authUser.id : null;
    var blocked  = Array.isArray(blockedUserIds) ? blockedUserIds : [];
    var excludeForZone = viewerId ? blocked.concat([viewerId]) : blocked;
    var zoneArg = scope === "everywhere" ? null : zoneId;
    var zoneReq = fetchPlayersInZone(zoneArg, 60, excludeForZone);
    var courtReq = courtName
      ? fetchPlayersAtCourt(courtName, authUser || null, 40, blocked)
      : Promise.resolve({ data: [], error: null });
    Promise.all([zoneReq, courtReq]).then(function(arr){
      if(cancelled) return;
      var zr = arr[0], cr = arr[1];
      var courtMap = {};
      (cr && cr.data || []).forEach(function(p){ courtMap[p.id] = p; });
      var byId = {};
      (zr && zr.data || []).forEach(function(p){
        byId[p.id] = courtMap[p.id]
          ? Object.assign({}, p, courtMap[p.id], { playsHere: true })
          : p;
      });
      Object.keys(courtMap).forEach(function(id){
        if(!byId[id]) byId[id] = Object.assign({}, courtMap[id], { playsHere: true });
      });
      var arr2 = Object.values(byId).filter(function(p){
        return !viewerId || p.id !== viewerId;
      });
      var ids = arr2.map(function(p){ return p.id; });
      fetchViewerMatchCountsBy(viewerId, ids).then(function(hc){
        if(cancelled) return;
        var counts = (hc && hc.data) || {};
        var annotated = arr2.map(function(p){
          var n = counts[p.id] || 0;
          var score = scorePlayerForCourt(authUser || null, p, !!p.playsHere);
          return Object.assign({}, p, { historyCount: n, score: score });
        });
        annotated.sort(function(a, b){
          if(b.historyCount !== a.historyCount) return b.historyCount - a.historyCount;
          return (b.score || 0) - (a.score || 0);
        });
        setPlayers(annotated);
        setLoading(false);
      }).catch(function(){
        if(cancelled) return;
        var fallback = arr2.map(function(p){
          var score = scorePlayerForCourt(authUser || null, p, !!p.playsHere);
          return Object.assign({}, p, { historyCount: 0, score: score });
        }).sort(function(a, b){ return (b.score || 0) - (a.score || 0); });
        setPlayers(fallback);
        setLoading(false);
      });
    }).catch(function(){ if(!cancelled) setLoading(false); });
    return function(){ cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[zoneId, courtName, scope]);

  // Visible list = players → gender filter → skill filter.
  var visible = useMemo(function(){
    var viewerSkill = (authUser && authUser.profile && authUser.profile.skill) || null;
    var viewerTier  = viewerSkill ? tierFromSkill(viewerSkill) : null;
    // 'My level' = viewer's rung ± 1. We compute the allowed set once
    // here so the per-row filter is just an array check.
    var nearSet = (skillFilter === "same" && viewerSkill)
      ? nearbySkillLevels(viewerSkill)
      : [];
    return players.filter(function(p){
      if(genderFilter !== "any" && p.gender !== genderFilter) return false;
      if(skillFilter !== "any"){
        if(!viewerSkill || !p.skill) return false;
        if(skillFilter === "same" && nearSet.indexOf(p.skill) === -1) return false;
        if(skillFilter === "tier"){
          var pt = tierFromSkill(p.skill);
          if(!pt || !viewerTier || pt !== viewerTier) return false;
        }
      }
      return true;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[players, genderFilter, skillFilter, authUser]);

  function togglePlayer(p){
    setSelectedIds(function(prev){
      if(prev.indexOf(p.id) !== -1){
        return prev.filter(function(id){ return id !== p.id; });
      }
      if(prev.length >= maxSelect) return prev;
      return prev.concat([p.id]);
    });
  }

  function handleContinue(){
    var partners = selectedIds.map(function(id){
      return players.find(function(p){ return p.id === id; });
    }).filter(Boolean);
    if(!partners.length) return;
    track("play_match_player_picked", {
      player_count: partners.length,
      scope: scope,
      format: format,
    });
    onContinue && onContinue({ partners: partners, format: format, scope: scope });
  }

  // Map play-mode chrome colours: white text + dark halo on dark
  // basemaps; near-black text + white halo on light basemaps.
  var fg     = mapDark ? "#ffffff" : "#14110f";
  var halo   = mapDark
    ? "0 2px 16px rgba(0,0,0,0.55), 0 1px 2px rgba(0,0,0,0.45)"
    : "0 2px 16px rgba(255,255,255,0.55), 0 1px 2px rgba(255,255,255,0.45)";
  var glassBg = mapDark
    ? "rgba(20,18,17,0.55)"
    : "rgba(255,255,255,0.78)";
  var glassBorder = mapDark
    ? "1px solid rgba(255,255,255,0.18)"
    : "1px solid rgba(20,18,17,0.10)";

  // The Singles/Doubles toggle lives in different slots per
  // viewport. Desktop: centred pill in the top chrome alongside
  // the filter cog. Mobile: rendered separately just above the
  // title prompt to mirror the gap scope tabs have to the player
  // carousel (per user redesign brief). The element is the same;
  // only the wrapping position changes.
  var formatToggleEl = (
    <div className="fade-up" style={{
      display:"inline-flex",
      padding: 4, borderRadius: 999,
      background: glassBg,
      backdropFilter: "blur(20px) saturate(140%)",
      WebkitBackdropFilter: "blur(20px) saturate(140%)",
      border: glassBorder,
      boxShadow: "0 4px 16px rgba(0,0,0,0.12)",
      pointerEvents:"auto",
    }}>
      {[
        { id:"singles", label:"Singles" },
        { id:"doubles", label:"Doubles" },
      ].map(function(f){
        var on = format === f.id;
        return (
          <button key={f.id} type="button"
            onClick={function(){
              if(on) return;
              var newCap = f.id === "singles" ? 1 : 3;
              setFormat(f.id);
              setSelectedIds(function(prev){ return prev.slice(0, newCap); });
            }}
            style={{
              padding: isMobile ? "6px 12px" : "8px 18px",
              borderRadius: 999,
              background: on ? fg : "transparent",
              color: on ? (mapDark ? "#14110f" : "#ffffff") : fg,
              border:"none", cursor: on ? "default" : "pointer",
              fontSize: isMobile ? 11 : 12, fontWeight: 800,
              letterSpacing:"0.06em", textTransform:"uppercase",
              transition:"background 0.15s, color 0.15s",
            }}>
            {f.label}
          </button>
        );
      })}
    </div>
  );

  // ─────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────
  return (
    <>
      {/* TOP CHROME — desktop: format pill centred + cog absolute
          right. Mobile: cog only (format moves to the bottom slot). */}
      <div style={{
        position: "absolute",
        top: "calc(env(safe-area-inset-top, 0px) + " + (isMobile ? 14 : 16) + "px)",
        left: 16, right: 16,
        zIndex: 545,
        display:"flex", alignItems:"center",
        justifyContent: isMobile ? "flex-end" : "center",
        gap: isMobile ? 8 : 12,
        pointerEvents:"none",
      }}>
        {!isMobile && formatToggleEl}

        {/* Filter cog. On desktop it's absolutely positioned so the
            centred format pill keeps its visual primacy; on mobile
            it's inline at the end of the right-aligned chrome row. */}
        <button type="button"
          onClick={function(){ setFiltersOpen(function(v){ return !v; }); }}
          aria-label={filtersOpen ? "Hide filters" : "Show filters"}
          style={{
            position: isMobile ? "static" : "absolute", right: 0, top: 0,
            pointerEvents:"auto",
            width: isMobile ? 36 : 40, height: isMobile ? 36 : 40,
            borderRadius: 999,
            background: filtersOpen ? fg : glassBg,
            color: filtersOpen ? (mapDark ? "#14110f" : "#ffffff") : fg,
            border: filtersOpen ? "none" : glassBorder,
            backdropFilter: "blur(20px) saturate(140%)",
            WebkitBackdropFilter: "blur(20px) saturate(140%)",
            cursor:"pointer",
            display:"flex", alignItems:"center", justifyContent:"center",
            boxShadow: "0 4px 16px rgba(0,0,0,0.12)",
          }}>
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none"
               stroke="currentColor" strokeWidth="1.7"
               strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 5h12M5 9h8M7 13h4"/>
          </svg>
          {activeFilterCount > 0 && (
            <span style={{
              position:"absolute", top: -3, right: -3,
              minWidth: 18, height: 18, padding:"0 5px",
              borderRadius: 9,
              background: t.accent || "#ff6b3d", color: "#ffffff",
              fontSize: 10, fontWeight: 900,
              display:"flex", alignItems:"center", justifyContent:"center",
              border: "2px solid " + (mapDark ? "#0a0a0a" : "#ffffff"),
            }}>
              {activeFilterCount}
            </span>
          )}
        </button>
      </div>

      {/* MOBILE — Singles/Doubles slot. Sits directly above the
          title prompt with the same visual gap as scope tabs have
          to the player carousel above (≈ 16-18px). Hidden on
          desktop (rendered in the top chrome row instead). */}
      {isMobile && (
        <div style={{
          position:"absolute",
          bottom: "calc(env(safe-area-inset-bottom, 0px) + 100px)",
          left: 0, right: 0,
          zIndex: 545,
          display:"flex", justifyContent:"center",
          pointerEvents:"none",
        }}>
          {formatToggleEl}
        </div>
      )}

      {/* Scope tabs — In zone / Everywhere.
            • Desktop: directly below the format toggle (top chrome).
            • Mobile : just below the player cards (above the format
              toggle which sits above the title). Slightly tighter
              gap to the cards than before — user feedback was the
              previous bottom:110 read too far away.
          Quiet underline-tabs styling so they read as secondary. */}
      <div style={isMobile ? {
        position:"absolute",
        bottom: "calc(env(safe-area-inset-bottom, 0px) + 158px)",
        left: 0, right: 0,
        zIndex: 545,
        display:"flex", justifyContent:"center",
        pointerEvents:"none",
      } : {
        position:"absolute",
        top: "calc(env(safe-area-inset-top, 0px) + 64px)",
        left: 0, right: 0,
        zIndex: 545,
        display:"flex", justifyContent:"center",
        pointerEvents:"none",
      }}>
        <div className="fade-up" style={{
          display:"inline-flex", gap: 22,
          padding: "8px 18px", borderRadius: 999,
          background: glassBg,
          backdropFilter:"blur(20px) saturate(140%)",
          WebkitBackdropFilter:"blur(20px) saturate(140%)",
          border: glassBorder,
          boxShadow: "0 4px 16px rgba(0,0,0,0.10)",
          pointerEvents:"auto",
        }}>
          {[
            { id:"zone",       label:"In zone" },
            { id:"everywhere", label:"Everywhere" },
          ].map(function(s){
            var on = scope === s.id;
            return (
              <button key={s.id} type="button"
                onClick={function(){ if(!on){ setScope(s.id); setSelectedIds([]); } }}
                style={{
                  padding:"4px 0", background:"transparent", border:"none",
                  borderBottom: "2px solid " + (on ? fg : "transparent"),
                  color: on ? fg : (mapDark ? "rgba(255,255,255,0.55)" : "rgba(20,18,17,0.45)"),
                  fontSize: 11, fontWeight: on ? 800 : 600,
                  letterSpacing:"0.06em", textTransform:"uppercase",
                  cursor: on ? "default" : "pointer",
                  transition:"color 0.15s, border-color 0.15s",
                }}>
                {s.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Filter sheet — floats below the top chrome when open. */}
      {filtersOpen && (
        <div className="fade-up" style={{
          position:"absolute",
          top: "calc(env(safe-area-inset-top, 0px) + 116px)",
          left: 16, right: 16,
          zIndex: 545,
          display:"flex", justifyContent:"center",
          pointerEvents:"none",
        }}>
          <div style={{
            pointerEvents:"auto",
            width: "100%", maxWidth: 360,
            padding: "12px 14px",
            borderRadius: 16,
            background: glassBg,
            backdropFilter: "blur(28px) saturate(140%)",
            WebkitBackdropFilter: "blur(28px) saturate(140%)",
            border: glassBorder,
            boxShadow: "0 12px 32px rgba(0,0,0,0.18)",
          }}>
            <div style={{ marginBottom: 10 }}>
              <div style={{
                fontSize: 9, fontWeight: 800, letterSpacing:"0.14em",
                textTransform:"uppercase", color: fg, opacity: 0.55,
                marginBottom: 6,
              }}>Gender</div>
              <div style={{ display:"flex", gap: 6, flexWrap:"wrap" }}>
                {[
                  { id:"any",    label:"Any" },
                  { id:"male",   label:"Men" },
                  { id:"female", label:"Women" },
                ].map(function(opt){
                  var on = genderFilter === opt.id;
                  return (
                    <button key={opt.id} type="button"
                      onClick={function(){ setGenderFilter(opt.id); }}
                      style={{
                        padding:"6px 12px", borderRadius: 999,
                        background: on ? fg : "transparent",
                        color: on ? (mapDark ? "#14110f" : "#ffffff") : fg,
                        border: "1px solid " + (on ? fg : (mapDark ? "rgba(255,255,255,0.22)" : "rgba(20,18,17,0.18)")),
                        cursor:"pointer",
                        fontSize: 11, fontWeight: on ? 800 : 600,
                        letterSpacing:"0.02em",
                      }}>
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>
            <div>
              <div style={{
                fontSize: 9, fontWeight: 800, letterSpacing:"0.14em",
                textTransform:"uppercase", color: fg, opacity: 0.55,
                marginBottom: 6,
              }}>Skill match</div>
              <div style={{ display:"flex", gap: 6, flexWrap:"wrap" }}>
                {[
                  { id:"any",  label:"Any level" },
                  { id:"same", label:"My level" },
                  { id:"tier", label:"Similar" },
                ].map(function(opt){
                  var on = skillFilter === opt.id;
                  return (
                    <button key={opt.id} type="button"
                      onClick={function(){ setSkillFilter(opt.id); }}
                      style={{
                        padding:"6px 12px", borderRadius: 999,
                        background: on ? fg : "transparent",
                        color: on ? (mapDark ? "#14110f" : "#ffffff") : fg,
                        border: "1px solid " + (on ? fg : (mapDark ? "rgba(255,255,255,0.22)" : "rgba(20,18,17,0.18)")),
                        cursor:"pointer",
                        fontSize: 11, fontWeight: on ? 800 : 600,
                        letterSpacing:"0.02em",
                      }}>
                      {opt.label}
                    </button>
                  );
                })}
              </div>
              {/* Quiet helper line — clarifies what each filter means.
                  Hidden on "Any" so we don't add noise when the row
                  is in its default state. */}
              {skillFilter === "same" && (
                <div style={{
                  fontSize: 10, color: fg, opacity: 0.55,
                  marginTop: 6, lineHeight: 1.4,
                }}>
                  Your level ±1 rung (e.g. Intermediate 2 also matches Intermediate 1 and Advanced 1).
                </div>
              )}
              {skillFilter === "tier" && (
                <div style={{
                  fontSize: 10, color: fg, opacity: 0.55,
                  marginTop: 6, lineHeight: 1.4,
                }}>
                  Anyone in your broad tier (Beginner, Intermediate, or Advanced).
                </div>
              )}
            </div>
            {/* Scope tabs (In zone / Everywhere) live in the top
                chrome now, not in this sheet — see the standalone
                scope-tabs block above the filter button. */}
          </div>
        </div>
      )}

      {/* PLAYER CARDS — horizontal-scroll carousel anchored to the
          vertical centre of the viewport. Cards float over the
          blurred basemap; the picked court sits below them centred
          via the LeafletMap setView. */}
      <div style={{
        position:"absolute",
        left: 0, right: 0,
        top: "50%", transform: "translateY(-50%)",
        zIndex: 542,
        pointerEvents: "none",
      }}>
        {loading ? (
          <div style={{
            textAlign:"center",
            color: fg,
            opacity: 0.7,
            fontSize: 12,
            letterSpacing:"0.08em", textTransform:"uppercase", fontWeight: 700,
            textShadow: halo,
          }}>
            Finding players…
          </div>
        ) : visible.length === 0 ? (
          <div style={{
            textAlign:"center",
            color: fg,
            opacity: 0.92,
            fontSize: 13, fontWeight: 700,
            letterSpacing:"-0.1px",
            textShadow: halo,
            padding: "0 24px",
          }}>
            {players.length === 0
              ? (scope === "zone"
                  ? "You're first in this zone."
                  : "You're early — nobody's signed up yet.")
              : "No players match these filters."}
          </div>
        ) : (
          <div
            style={{
              display:"flex", gap: 10,
              overflowX:"auto", overflowY:"hidden",
              scrollSnapType:"x mandatory",
              WebkitOverflowScrolling:"touch",
              padding: "6px 16px 10px",
              pointerEvents:"auto",
              // Hide scrollbar — feels native on phones.
              scrollbarWidth: "none",
            }}>
            {visible.map(function(p){
              var isSel = selectedIds.indexOf(p.id) !== -1;
              var disabled = !isSel && selectedIds.length >= maxSelect;
              return (
                <button key={p.id} type="button"
                  onClick={function(){ togglePlayer(p); }}
                  disabled={disabled}
                  style={{
                    flexShrink: 0,
                    scrollSnapAlign:"start",
                    width: 132,
                    padding: "12px 10px 14px",
                    borderRadius: 18,
                    background: isSel
                      ? (mapDark ? "rgba(255,255,255,0.92)" : "rgba(20,18,17,0.92)")
                      : glassBg,
                    color: isSel
                      ? (mapDark ? "#14110f" : "#ffffff")
                      : fg,
                    border: isSel ? "none" : glassBorder,
                    backdropFilter:"blur(28px) saturate(140%)",
                    WebkitBackdropFilter:"blur(28px) saturate(140%)",
                    boxShadow: isSel
                      ? "0 12px 28px rgba(0,0,0,0.22)"
                      : "0 6px 18px rgba(0,0,0,0.10)",
                    cursor: disabled ? "not-allowed" : "pointer",
                    opacity: disabled ? 0.45 : 1,
                    display:"flex", flexDirection:"column",
                    alignItems:"center", gap: 8,
                    transition: "background 0.18s, color 0.18s, transform 0.18s, box-shadow 0.18s",
                    transform: isSel ? "translateY(-4px)" : "none",
                  }}>
                  <div style={{ position:"relative" }}>
                    <PlayerAvatar size={64} profile={p}/>
                    {isSel && (
                      <div style={{
                        position:"absolute", bottom: -2, right: -2,
                        width: 22, height: 22, borderRadius:"50%",
                        background: t.accent || "#ff6b3d", color:"#fff",
                        border: "2px solid " + (mapDark ? "#fff" : "#14110f"),
                        display:"flex", alignItems:"center", justifyContent:"center",
                        fontSize: 11, fontWeight: 900,
                      }}>✓</div>
                    )}
                  </div>
                  {(function(){
                    var bracket = bracketLabel(p);
                    var name = firstName(p.name || p.username || p.full_name || "Player");
                    return (
                      <div style={{
                        fontSize: 13, fontWeight: 800,
                        letterSpacing:"-0.01em",
                        lineHeight: 1.15,
                        textAlign:"center",
                        width: "100%",
                        overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap",
                      }}>
                        {name}
                        {bracket && (
                          <span style={{
                            fontWeight: 600,
                            opacity: 0.65,
                            marginLeft: 4,
                          }}>· {bracket}</span>
                        )}
                      </div>
                    );
                  })()}
                  {/* Chips stack — level always visible if known;
                      history chip stacks ABOVE level when present. */}
                  <div style={{
                    display:"flex", flexDirection:"column", alignItems:"center", gap: 3,
                    width: "100%",
                  }}>
                    {p.historyCount > 0 && (
                      <span style={{
                        padding: "2px 8px", borderRadius: 999,
                        background: hexToRgba(t.accent || "#ff6b3d", isSel ? 0.18 : 0.14),
                        color: t.accent || "#ff6b3d",
                        fontSize: 9, fontWeight: 900,
                        letterSpacing:"0.06em", textTransform:"uppercase",
                        whiteSpace:"nowrap",
                      }}>
                        {p.historyCount === 1 ? "1 match" : (p.historyCount + " matches")}
                      </span>
                    )}
                    {(p.skill || p.skill_level) ? (
                      <span style={{
                        padding: "2px 8px", borderRadius: 999,
                        background: isSel
                          ? (mapDark ? "rgba(20,18,17,0.10)" : "rgba(255,255,255,0.18)")
                          : (mapDark ? "rgba(255,255,255,0.10)" : "rgba(20,18,17,0.06)"),
                        color: isSel
                          ? (mapDark ? "rgba(20,18,17,0.7)" : "rgba(255,255,255,0.85)")
                          : (mapDark ? "rgba(255,255,255,0.75)" : "rgba(20,18,17,0.65)"),
                        fontSize: 9, fontWeight: 800,
                        letterSpacing:"0.04em", textTransform:"uppercase",
                        whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis",
                        maxWidth: "100%",
                      }}>
                        {p.skill || p.skill_level}
                      </span>
                    ) : (
                      !p.historyCount && <span style={{ height: 14 }}/>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* BOTTOM PROMPT — composition:
            StepProgressBar (4-segment, 'players' is step 2)
            ← Title  (inline-flex pair, chevron immediately left
                      of the words so the back-affordance reads as
                      part of the step rather than detached)
          Morphs into a Continue button once ≥1 player is picked. */}
      <div style={{
        position:"absolute",
        bottom: "calc(env(safe-area-inset-bottom, 0px) + " + (isMobile ? 24 : 40) + "px)",
        left: 0, right: 0,
        zIndex: 540,
        pointerEvents:"none",
      }}>
        <div className="fade-up" style={{
          maxWidth: 720,
          margin:"0 auto",
          padding: isMobile ? "0 14px" : "0 22px",
          textAlign:"center",
        }}>
          <StepProgressBar
            isMobile={isMobile}
            mapDark={mapDark}
            total={4}
            step={2}
          />
          <div style={{
            display:"inline-flex",
            alignItems:"center",
            gap: isMobile ? 6 : 8,
            pointerEvents:"none",
          }}>
            <button type="button"
              onClick={function(){ onBack && onBack(); }}
              aria-label="Back to court"
              style={{
                pointerEvents:"auto",
                background:"transparent", border:"none", cursor:"pointer",
                color: fg,
                padding: 4,
                display:"flex", alignItems:"center", justifyContent:"center",
                flexShrink: 0,
                filter: mapDark
                  ? "drop-shadow(0 1px 4px rgba(0,0,0,0.55))"
                  : "drop-shadow(0 1px 4px rgba(255,255,255,0.55))",
              }}>
              <svg width={isMobile ? 22 : 26} height={isMobile ? 22 : 26} viewBox="0 0 18 18" fill="none"
                   stroke="currentColor" strokeWidth="1.8"
                   strokeLinecap="round" strokeLinejoin="round">
                <path d="M11 14L6 9l5-5"/>
              </svg>
            </button>

            {selectedIds.length === 0 ? (
              <div style={{
                fontSize: isMobile ? 30 : 40, fontWeight: 900,
                letterSpacing:"0.02em", lineHeight: 1.05,
                textTransform:"uppercase",
                color: fg,
                textShadow: halo,
                fontFamily: "ui-sans-serif, -apple-system, BlinkMacSystemFont, 'SF Pro Display', system-ui, sans-serif",
              }}>
                Pick {format === "singles" ? "a player" : "players"}
              </div>
            ) : (
            <button type="button"
              onClick={handleContinue}
              style={{
                pointerEvents:"auto",
                background: t.accent || "#ff6b3d",
                color:"#ffffff",
                border:"none",
                padding: isMobile ? "13px 22px" : "16px 28px",
                borderRadius: 999,
                fontSize: isMobile ? 14 : 16, fontWeight: 900,
                letterSpacing:"0.06em", textTransform:"uppercase",
                fontFamily: "ui-sans-serif, -apple-system, BlinkMacSystemFont, 'SF Pro Display', system-ui, sans-serif",
                cursor:"pointer",
                boxShadow: "0 8px 22px rgba(0,0,0,0.22)",
                display:"inline-flex", alignItems:"center", gap: 12,
              }}>
              <span>Continue ({selectedIds.length})</span>
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none"
                   stroke="currentColor" strokeWidth="2.2"
                   strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 9h10M10 5l4 4-4 4"/>
              </svg>
            </button>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
