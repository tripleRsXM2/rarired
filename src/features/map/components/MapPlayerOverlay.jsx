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
  // Age range — multi-select bracket ids (matches domain.AGE_BRACKETS).
  // Empty array = no filter. Includes/excludes purely by stored bracket;
  // null age_brackets are hidden whenever any age is selected (same
  // honesty rule as the gender filter).
  var [ageFilter, setAgeFilter] = useState([]);

  var maxSelect = format === "singles" ? 1 : 3;
  var activeFilterCount =
    (genderFilter !== "any" ? 1 : 0) +
    (skillFilter !== "any" ? 1 : 0) +
    (ageFilter.length > 0 ? 1 : 0);

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
      // Age filter — when ANY bracket is picked, players must have
      // a matching age_bracket. Players with null age_bracket are
      // hidden when this filter is on (same explicit-honesty rule
      // as gender — see drawer copy below).
      if(ageFilter.length > 0){
        if(!p.age_bracket || ageFilter.indexOf(p.age_bracket) === -1) return false;
      }
      return true;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[players, genderFilter, skillFilter, ageFilter, authUser]);

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
              padding: isMobile ? "5px 10px" : "8px 18px",
              borderRadius: 999,
              background: on ? fg : "transparent",
              color: on ? (mapDark ? "#14110f" : "#ffffff") : fg,
              border:"none", cursor: on ? "default" : "pointer",
              fontSize: isMobile ? 10 : 12, fontWeight: 800,
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

      {/* MOBILE — Singles/Doubles slot. Stacked ABOVE the scope
          tabs and ABOVE the player cards. Order top→bottom on
          mobile: top chrome (cog/card), Singles/Doubles, In zone/
          Everywhere, Cards, Title. */}
      {isMobile && (
        <div style={{
          position:"absolute",
          top: "calc(env(safe-area-inset-top, 0px) + 64px)",
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
            • Mobile : just below the Singles/Doubles slot above,
              and just above the player cards. Smaller fontSize
              than desktop so the row reads as quiet secondary
              chrome. */}
      <div style={isMobile ? {
        position:"absolute",
        top: "calc(env(safe-area-inset-top, 0px) + 102px)",
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
          display:"inline-flex", gap: isMobile ? 16 : 22,
          padding: isMobile ? "5px 14px" : "8px 18px",
          borderRadius: 999,
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
                  fontSize: isMobile ? 10 : 11, fontWeight: on ? 800 : 600,
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

      {/* Filter sheet — uniform section layout (label / chips /
          optional helper) with consistent paddings, type, and gaps.
          Desktop: drops below the top chrome.
          Mobile : pops centred in the viewport with a backdrop dim;
                   feels like a modal so the small screen isn't half-
                   covered by floating chrome. */}
      {filtersOpen && (function(){
        var sectionLabel = {
          fontSize: 10, fontWeight: 800,
          letterSpacing: "0.14em", textTransform: "uppercase",
          color: fg, opacity: 0.6,
          marginBottom: 8,
        };
        var helperLine = {
          fontSize: 11, lineHeight: 1.45,
          color: fg, opacity: 0.6,
          marginTop: 8,
        };
        // Single chip renderer used by every row so paddings, fonts,
        // borders, and hover states are guaranteed identical.
        function Chip(props){
          var on = props.on;
          return (
            <button type="button"
              onClick={props.onClick}
              style={{
                padding: "6px 12px",
                borderRadius: 999,
                background: on ? fg : "transparent",
                color: on ? (mapDark ? "#14110f" : "#ffffff") : fg,
                border: "1px solid " + (on ? fg : (mapDark ? "rgba(255,255,255,0.22)" : "rgba(20,18,17,0.18)")),
                cursor: "pointer",
                fontSize: 11, fontWeight: on ? 800 : 600,
                letterSpacing: "0.02em",
                whiteSpace: "nowrap",
              }}>
              {props.label}
            </button>
          );
        }
        var hasActive = activeFilterCount > 0;
        function resetAll(){
          setGenderFilter("any");
          setSkillFilter("any");
          setAgeFilter([]);
        }

        var sheet = (
          <div
            role="dialog"
            aria-label="Filters"
            onClick={function(e){ e.stopPropagation(); }}
            style={{
              pointerEvents:"auto",
              width: "100%",
              maxWidth: 360,
              padding: "16px 18px 18px",
              borderRadius: 18,
              background: glassBg,
              backdropFilter: "blur(28px) saturate(140%)",
              WebkitBackdropFilter: "blur(28px) saturate(140%)",
              border: glassBorder,
              boxShadow: "0 14px 36px rgba(0,0,0,0.22)",
            }}>
            {/* Header — title + reset/close. Aligns to the left so
                the heading anchors the same edge as section labels
                below it. */}
            <div style={{
              display:"flex", alignItems:"center", justifyContent:"space-between",
              gap: 10, marginBottom: 14,
            }}>
              <span style={{
                fontSize: 13, fontWeight: 800,
                letterSpacing: "0.04em", textTransform:"uppercase",
                color: fg,
              }}>Filters</span>
              <div style={{ display:"flex", alignItems:"center", gap: 6 }}>
                {hasActive && (
                  <button type="button"
                    onClick={resetAll}
                    style={{
                      background:"transparent", border:"none", cursor:"pointer",
                      color: fg, opacity: 0.7,
                      padding: "4px 8px",
                      fontSize: 10, fontWeight: 800,
                      letterSpacing: "0.10em", textTransform:"uppercase",
                    }}>
                    Reset
                  </button>
                )}
                <button type="button"
                  onClick={function(){ setFiltersOpen(false); }}
                  aria-label="Close filters"
                  style={{
                    background:"transparent", border:"none", cursor:"pointer",
                    color: fg, opacity: 0.7,
                    width: 28, height: 28,
                    display:"flex", alignItems:"center", justifyContent:"center",
                  }}>
                  <svg width="14" height="14" viewBox="0 0 18 18" fill="none"
                       stroke="currentColor" strokeWidth="2"
                       strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 5l8 8M13 5l-8 8"/>
                  </svg>
                </button>
              </div>
            </div>

            {/* GENDER */}
            <div style={{ marginBottom: 16 }}>
              <div style={sectionLabel}>Gender</div>
              <div style={{ display:"flex", gap: 6, flexWrap:"wrap" }}>
                {[
                  { id:"any",    label:"Any" },
                  { id:"male",   label:"Men" },
                  { id:"female", label:"Women" },
                ].map(function(opt){
                  return <Chip key={opt.id}
                    on={genderFilter === opt.id} label={opt.label}
                    onClick={function(){ setGenderFilter(opt.id); }}/>;
                })}
              </div>
            </div>

            {/* SKILL */}
            <div style={{ marginBottom: 16 }}>
              <div style={sectionLabel}>Skill match</div>
              <div style={{ display:"flex", gap: 6, flexWrap:"wrap" }}>
                {[
                  { id:"any",  label:"Any level" },
                  { id:"same", label:"My level" },
                  { id:"tier", label:"Similar" },
                ].map(function(opt){
                  return <Chip key={opt.id}
                    on={skillFilter === opt.id} label={opt.label}
                    onClick={function(){ setSkillFilter(opt.id); }}/>;
                })}
              </div>
              {skillFilter === "same" && (
                <div style={helperLine}>
                  Your level ±1 rung (e.g. Intermediate 2 also matches Intermediate 1 and Advanced 1).
                </div>
              )}
              {skillFilter === "tier" && (
                <div style={helperLine}>
                  Anyone in your broad tier (Beginner, Intermediate, or Advanced).
                </div>
              )}
            </div>

            {/* AGE */}
            <div>
              <div style={sectionLabel}>Age range</div>
              <div style={{ display:"flex", gap: 6, flexWrap:"wrap" }}>
                {[
                  { id:"u18",     label:"Under 18" },
                  { id:"18_24",   label:"18 – 24"  },
                  { id:"25_34",   label:"25 – 34"  },
                  { id:"35_44",   label:"35 – 44"  },
                  { id:"45_54",   label:"45 – 54"  },
                  { id:"55_plus", label:"55+"      },
                ].map(function(opt){
                  var on = ageFilter.indexOf(opt.id) !== -1;
                  return <Chip key={opt.id}
                    on={on} label={opt.label}
                    onClick={function(){
                      setAgeFilter(function(prev){
                        return prev.indexOf(opt.id) === -1
                          ? prev.concat([opt.id])
                          : prev.filter(function(x){ return x !== opt.id; });
                      });
                    }}/>;
                })}
              </div>
              {ageFilter.length > 0 && (
                <div style={helperLine}>
                  Players who haven't set their age are hidden while this filter is on.
                </div>
              )}
            </div>
          </div>
        );

        if(isMobile){
          // Mobile: centred modal with a tap-outside-to-dismiss
          // backdrop. Sits above the top chrome (z 700) so the
          // format toggle / scope tabs don't bleed through.
          return (
            <div
              onClick={function(){ setFiltersOpen(false); }}
              style={{
                position:"absolute", inset: 0,
                zIndex: 700,
                background: "rgba(0,0,0,0.42)",
                backdropFilter: "blur(2px)",
                WebkitBackdropFilter: "blur(2px)",
                display:"flex", alignItems:"center", justifyContent:"center",
                padding: 16,
                pointerEvents:"auto",
              }}>
              {sheet}
            </div>
          );
        }
        // Desktop: anchored to the top chrome below the cog.
        return (
          <div className="fade-up" style={{
            position:"absolute",
            top: "calc(env(safe-area-inset-top, 0px) + 116px)",
            left: 16, right: 16,
            zIndex: 545,
            display:"flex", justifyContent:"center",
            pointerEvents:"none",
          }}>
            {sheet}
          </div>
        );
      })()}

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
          // Carousel — flex parent with justify-content:center so
          // the cards centre when they fit the container. When the
          // row overflows, the parent's overflow:auto handles it
          // and modern browsers (Chrome / Safari / FF current) keep
          // the leftmost card reachable via scroll. Cards have
          // flex-shrink:0 so they never compress.
          <div
            style={{
              display:"flex",
              gap: 10,
              justifyContent:"center",
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
