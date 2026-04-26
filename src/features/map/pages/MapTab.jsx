// src/features/map/pages/MapTab.jsx
//
// Full-bleed Leaflet map of Sydney showing the six CourtSync matchmaking
// zones, public courts, and (if set) the user's home-zone pin. The right
// side panel is the only interactive surface — search/filter pills were
// dropped in favour of a calmer surface.
//
// Module: map activity signal — loads confirmed-match counts per zone
// over the last 7 days so the label shows "🔥 N this week". Emits map
// analytics events so we can measure whether the map drives challenges.

import { useEffect, useRef, useState } from "react";
import LeafletMap from "../components/LeafletMap.jsx";
import ZoneSidePanel from "../components/ZoneSidePanel.jsx";
import CourtInfoCard from "../components/CourtInfoCard.jsx";
import PlayMatchWizard from "../components/PlayMatchWizard.jsx";
import MapPlayerOverlay from "../components/MapPlayerOverlay.jsx";
import StepProgressBar from "../components/StepProgressBar.jsx";
import useIsMobile from "../../../lib/hooks/useIsMobile.js";
import { ZONE_BY_ID } from "../data/zones.js";
import { COURTS } from "../data/courts.js";
import { fetchZoneActivity } from "../services/mapService.js";
import { track } from "../../../lib/analytics.js";

// Layer + map-theme preferences persist locally so a user's "show me
// just courts on a dark map" view sticks across reloads. Small Hooked
// investment — every customisation makes returning more valuable.
var LAYERS_STORAGE_KEY = "cs.map.layers.v1";
// Activity defaults OFF — flame badges are seasonal/editorial signal,
// not chrome. Users opt in if they want to see "where matches happened
// this week". Homes + courts stay on as they're navigational anchors.
// Defaults locked by UI Designer council:
//   homes     ON  — personal anchor; your home is the most important pin
//   courts    ON  — primary content of the map (find where to play)
//   zoneNames ON  — first-time orientation; without "Inner West" /
//                   "Eastern Suburbs" eyebrows non-locals can't read the
//                   coloured polygons. Power users opt out.
//   activity  OFF — flame badges are seasonal/editorial; loud red as a
//                   default reads like notifications you didn't subscribe to.
//   mapTheme  AUTO — follow app theme unless explicitly overridden.
var DEFAULT_LAYERS = { homes: true, courts: true, zoneNames: true, activity: false, mapTheme: "auto" };
function loadLayers(){
  try{
    var raw = localStorage.getItem(LAYERS_STORAGE_KEY);
    if(!raw) return DEFAULT_LAYERS;
    var parsed = JSON.parse(raw);
    return Object.assign({}, DEFAULT_LAYERS, parsed);
  } catch(_){ return DEFAULT_LAYERS; }
}
function saveLayers(v){
  try{ localStorage.setItem(LAYERS_STORAGE_KEY, JSON.stringify(v)); } catch(_){}
}

export default function MapTab({
  t, theme, authUser, profile,
  onSetHomeZone, onClearHomeZone, onOpenProfile, openChallenge,
  // Phase 2 — map-centric matchmaking. Called when user taps Message
  // on a player row. We forward partner + slot to dms.openConversationWith
  // and then switch them to the messages tab. Parent (App.jsx) provides.
  onMessagePlayer,
  // Play Match wizard direct-send (Option A — stay-on-map flow).
  // When provided the wizard's "Send invite" closes the wizard and
  // dispatches the messages in the background via this prop, then
  // surfaces a toast. Falls back to onMessagePlayer (which opens the
  // inline compose modal) when not provided.
  onPlayMatchSend,
  // Asymmetric block — viewer's blocked-user list is threaded through
  // every player-fetch on the map so blocked users never render.
  blockedUserIds,
}){
  var [hovered,setHovered]=useState(null);
  var [selected,setSelected]=useState(null);
  var [selectedCourt,setSelectedCourt]=useState(null);
  var [zoneActivity,setZoneActivity]=useState({});
  // Inline court selection from the side panel (a venue name string).
  // Distinct from `selectedCourt` above which is the full court object
  // for the CourtInfoCard modal. When set, LeafletMap goes into focus
  // mode: cluster hidden, only that one venue's marker shown — and
  // the side panel header switches "Courts in zone" → "Courts here".
  var [panelCourtName,setPanelCourtName]=useState(null);
  // Phase 2: Play Match wizard. Opens from the orange CTA. Walks the
  // user through zone → court → player(s) → send invite. Respects
  // any zone already selected on the map (skips step 1 if so).
  var [wizardOpen,setWizardOpen]=useState(false);
  var [wizardInitialCourt,setWizardInitialCourt]=useState(null);
  // Player picks handed off from the map-native MapPlayerOverlay
  // (playMode="players") to the wizard's When step. Array of full
  // profile objects; null when the wizard is opened without a
  // pre-selected partner set.
  var [wizardInitialPartners,setWizardInitialPartners]=useState(null);
  var [wizardInitialFormat,setWizardInitialFormat]=useState(null);

  // Map-native Play Match flow. Every step is driven directly on the
  // map — no modal — until the final When+Send confirmation. Modes:
  //   "off"     — no play flow active
  //   "zone"    — picking a zone, polygons interactive
  //   "court"   — zone chosen, map zoomed in, courts get labels
  //   "players" — court chosen, blurred map + floating Singles/Doubles
  //               toggle + horizontal-scroll player cards (see
  //               MapPlayerOverlay). On Continue we open the wizard
  //               at the final When+Send step.
  var [playMode,setPlayMode]=useState("off");
  var [playZoneId,setPlayZoneId]=useState(null);
  var [playCourtName,setPlayCourtName]=useState(null);
  // When the zone changes, drop any panel-court selection so we don't
  // leak a stale venue name into a different zone's panel.
  useEffect(function(){ setPanelCourtName(null); },[selected]);
  // Layer-panel state — independent toggles for the optional overlays
  // plus a basemap-theme override. Zone colors are NOT here; they're
  // permanent identifying chrome. Persisted to localStorage so a user's
  // "minimalist dark map, courts only" preference survives reloads.
  var [layers,setLayers]=useState(loadLayers);
  var [layersOpen,setLayersOpen]=useState(false);
  var layersBtnRef = useRef(null);
  var layersPanelRef = useRef(null);
  var selectedZone = selected ? ZONE_BY_ID[selected] : null;
  // The side panel must NOT render during the map-native play mode —
  // it would cover the map and defeat the in-map experience. Also
  // hidden while the Play Match wizard is open (otherwise it sticks
  // out behind the wizard's modal backdrop).
  var sidePanelZone = (playMode === "off" && !wizardOpen) ? selectedZone : null;
  var playZone = playZoneId ? ZONE_BY_ID[playZoneId] : null;
  var homeZone = profile && profile.home_zone;

  // Persist + emit analytics whenever a layer flips. One handler covers
  // all toggles to keep the track payload uniform.
  function setLayer(key, value){
    setLayers(function(prev){
      var next = Object.assign({}, prev);
      next[key] = value;
      saveLayers(next);
      return next;
    });
    track("map_layer_toggled", { layer: key, value: value });
  }

  // Close the layers panel on outside-click / Escape.
  useEffect(function(){
    if(!layersOpen) return;
    function onDoc(e){
      var b = layersBtnRef.current;
      var p = layersPanelRef.current;
      if(b && b.contains(e.target)) return;
      if(p && p.contains(e.target)) return;
      setLayersOpen(false);
    }
    function onKey(e){ if(e.key === "Escape") setLayersOpen(false); }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return function(){
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  },[layersOpen]);

  // Fire-and-forget map_opened once per mount. has_home_zone lets us
  // see whether users open the map because they haven't picked one yet
  // vs. returning users who're browsing others' zones.
  useEffect(function(){
    track("map_opened", { has_home_zone: !!homeZone });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[]);

  // Load 7-day activity per zone. Single cheap query; caller-side aggregation.
  useEffect(function(){
    var cancelled = false;
    fetchZoneActivity(7).then(function(r){
      if(cancelled) return;
      if(r.error){ console.warn("[MapTab] fetchZoneActivity:", r.error); return; }
      setZoneActivity(r.data || {});
    });
    return function(){ cancelled = true; };
  },[]);

  // Phone breakpoint — shared with the rest of the codebase. Drives
  // mobile-specific repositioning of the play-mode chrome (court
  // card moves to top-left during court mode so the bottom prompt
  // breathes; segmented progress bar tightens its margins, etc.).
  var isMobile = useIsMobile();

  // Resolve the basemap tone the user is actually seeing (same logic
  // as LeafletMap.resolveDark). Used by the Play Match CTA to invert
  // its colours on dark basemaps so the button never gets lost.
  var mapDark;
  if(layers.mapTheme === "light") mapDark = false;
  else if(layers.mapTheme === "dark") mapDark = true;
  else mapDark = theme === "hard-court" || theme === "night-court";

  // Wrap setters so we can emit analytics at selection time. Zone props
  // include the activity snapshot so funnel queries don't need a join.
  function handleSelect(zoneId){
    // In map-native play mode, tapping a zone advances the flow
    // rather than opening the side panel. Step 1 → step 2.
    if(playMode === "zone" && zoneId){
      setPlayZoneId(zoneId);
      setPlayMode("court");
      track("play_match_zone_picked", { zone_id: zoneId });
      track("play_match_step_entered", { step: 1 });
      return;
    }
    // In court mode, taps on other zones are no-ops. They were
    // falling through to setSelected which silently changed state
    // even though the side panel doesn't render in court mode —
    // user perceived "map layers working in the background."
    if(playMode === "court" || playMode === "players") return;
    setSelected(zoneId);
    if(zoneId){
      var a = zoneActivity[zoneId] || { matches_7d: 0, players_7d: 0 };
      track("zone_selected", {
        zone_id: zoneId,
        is_home: homeZone === zoneId,
        matches_last_7d: a.matches_7d,
        players_last_7d: a.players_7d,
      });
    }
  }
  function handleCourtSelect(court){
    // In map-native play mode (step 2 → step 3), tapping a court
    // moves us to the player picker — also map-native (see
    // MapPlayerOverlay). We stash the court name on `playCourtName`
    // so the overlay can fetch the right roster.
    if(playMode === "court" && court && court.zone === playZoneId){
      setPlayCourtName(court.name);
      setPlayMode("players");
      track("play_match_court_picked", { zone_id: playZoneId, court_name: court.name });
      track("play_match_step_entered", { step: 2 });
      return;
    }
    setSelectedCourt(court);
    if(court){
      track("court_opened", { court_name: court.name, zone_id: court.zone });
    }
  }
  function exitPlayMode(){
    var step = playMode === "zone" ? 0 : playMode === "court" ? 1 : 2;
    track("play_match_cancelled", {
      step: step,
      last_completed: step - 1,
    });
    setPlayMode("off");
    setPlayZoneId(null);
    setPlayCourtName(null);
  }
  function handleSetHome(zoneId){
    if(onSetHomeZone) onSetHomeZone(zoneId);
    track("home_zone_set", { zone_id: zoneId, from: "map" });
  }
  function handleClearHome(){
    if(onClearHomeZone) onClearHomeZone();
    track("home_zone_cleared", { zone_id: homeZone || null, from: "map" });
  }

  return (
    <div className="cs-map-frame" style={{ width:"100%", background: t.bg }}>

      {/* The map */}
      <LeafletMap
        t={t} theme={theme}
        hovered={hovered} selected={selected}
        homeZone={homeZone}
        zoneActivity={zoneActivity}
        showHomes={layers.homes}
        showCourts={layers.courts}
        showActivity={layers.activity}
        showZoneNames={layers.zoneNames}
        mapThemeOverride={layers.mapTheme}
        focusedCourtName={panelCourtName}
        playMode={playMode}
        playZoneId={playZoneId}
        playCourtName={playCourtName}
        isMobile={isMobile}
        onHover={setHovered}
        onSelect={handleSelect}
        onCourtSelect={handleCourtSelect}
      />

      {/* Edge-fade vignette — non-interactive presentation polish.
          v1 used gradients fading to t.bg, but on light themes the
          frame colour is so close to CARTO's near-white basemap that
          the fade was mathematically present and visually invisible.
          v2 uses an inset box-shadow which ALWAYS darkens the edges
          regardless of basemap colour, plus a subtle gradient pass
          to soften the very corners. Theme-aware intensity: dark
          themes get a deeper shadow (the basemap is already dark, so
          we need more contrast at the edge). pointer-events:none
          so click-throughs are unaffected. */}

      {/* SYD Tennis Zones title pill retired — redundant chrome.
          Map tab + Sydney polygons are self-evident; the pill was
          adding visual noise top-left without affording anything. */}

      {/* Map layers control — Nike Run-style. A small layers icon top-
          right opens a card with independent switches for each optional
          overlay (homes / courts / activity flames) plus a basemap
          theme picker (auto/light/dark). Zone colors are NOT a toggle —
          they're permanent identifying chrome. Preferences persist to
          localStorage.
          Hidden during the entire Play Match flow (steps 2-4) so the
          map chrome doesn't compete with the floating prompt + step
          UI. Reappears when the user backs out of play mode. */}
      {playMode === "off" && (
      <button
        ref={layersBtnRef}
        onClick={function(){
          setLayersOpen(function(v){
            var next = !v;
            if(next) track("map_layers_panel_opened", {});
            return next;
          });
        }}
        title="Map layers"
        aria-label="Map layers"
        aria-expanded={layersOpen}
        style={{
          // Slide left to make room for the side panel when a zone is
          // selected so the cog never sits behind it. 372 = panel
          // maxWidth (360) + 12 gutter. Timing + easing match the
          // panel's slideInRight keyframe (.28s, cubic-bezier(.32,
          // .72,0,1)) so they glide together as one motion rather
          // than the cog "popping" out of sync.
          position:"absolute", top:12,
          right: selected ? 372 : 12,
          transition: "right 0.28s cubic-bezier(.32,.72,0,1)",
          zIndex:500,
          background: layersOpen ? t.text : t.bgCard,
          color: layersOpen ? t.bg : t.text,
          border:"1px solid "+(layersOpen ? t.text : t.border),
          borderRadius:8, padding:"8px 10px",
          cursor:"pointer", boxShadow:"0 1px 4px rgba(0,0,0,0.08)",
          display:"flex", alignItems:"center", justifyContent:"center",
          transition:"background 0.15s, color 0.15s",
        }}>
        {/* Stacked-squares "layers" SVG — per icon rule, no emoji */}
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none"
             stroke="currentColor" strokeWidth="1.5"
             strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 2 L16 5.5 L9 9 L2 5.5 Z"/>
          <path d="M2 9 L9 12.5 L16 9"/>
          <path d="M2 12.5 L9 16 L16 12.5"/>
        </svg>
      </button>
      )}

      {layersOpen && playMode === "off" && (
        <div ref={layersPanelRef}
          style={{
            // Slides with the cog. Same easing/timing as the cog +
            // side panel so all three motions feel like one gesture.
            position:"absolute", top:54,
            right: selected ? 372 : 12,
            transition: "right 0.28s cubic-bezier(.32,.72,0,1)",
            zIndex:600,
            background: t.bgCard, color: t.text,
            border: "1px solid " + t.border,
            borderRadius: 12, padding: "12px 14px",
            minWidth: 240, maxWidth: 280,
            boxShadow: "0 12px 32px rgba(0,0,0,0.18)",
            display:"flex", flexDirection:"column", gap:10,
          }}>
          <div style={{
            fontSize:9, fontWeight:800, letterSpacing:"0.12em",
            textTransform:"uppercase", color: t.textTertiary,
          }}>
            Map layers
          </div>

          <LayerRow t={t} label="Home indicators"
            sub="Your home + others' home pins"
            checked={layers.homes}
            onChange={function(v){ setLayer("homes", v); }}/>
          <LayerRow t={t} label="Court markers"
            sub="Public courts in each zone"
            checked={layers.courts}
            onChange={function(v){ setLayer("courts", v); }}/>
          <LayerRow t={t} label="Zone names"
            sub="Inner West, Eastern Suburbs, etc."
            checked={layers.zoneNames}
            onChange={function(v){ setLayer("zoneNames", v); }}/>
          <LayerRow t={t} label="Activity"
            sub="Flame badges on busy zones (7d)"
            checked={layers.activity}
            onChange={function(v){ setLayer("activity", v); }}/>

          <div style={{ height:1, background: t.border, margin:"4px 0" }}/>

          <div style={{
            fontSize:9, fontWeight:800, letterSpacing:"0.12em",
            textTransform:"uppercase", color: t.textTertiary,
          }}>
            Map theme
          </div>
          <UnderlineTabs t={t}
            value={layers.mapTheme}
            onChange={function(v){ setLayer("mapTheme", v); }}
            options={[
              { id:"auto",  label:"Auto"  },
              { id:"light", label:"Light" },
              { id:"dark",  label:"Dark"  },
            ]}/>
        </div>
      )}

      {/* Hovered-zone card — promoted from a small chip to a card-style
          element now that the floating zone-name labels are gone. This
          IS the on-map zone identifier when nothing is selected. Larger
          type, accent stripe, drop-shadow + slide-in animation. */}
      {(function(){
        // Bottom-left context card. Composes one of two layouts:
        //
        //   • COURT card — used during playMode === "players". The
        //     picked court is the foreground subject; we show its
        //     name, the zone-coloured accent rule, and a small line
        //     reading "<suburb>, Sydney · N courts". Hover input is
        //     suppressed in this mode (the hover card would compete
        //     with the player overlay's own context).
        //
        //   • ZONE card — every other state. Resolves the zone in
        //     three states:
        //       1. Court mode → ALWAYS show the picked zone
        //          (persistent context: "you're inside Eastern Suburbs").
        //       2. Zone mode → show the hovered zone (preview).
        //       3. Default mode → show the hovered zone if user is
        //          hovering and nothing is otherwise selected.
        var labelStyle = {
          fontSize: 30, fontWeight: 900,
          letterSpacing: "-0.025em", lineHeight: 1.05,
          color: mapDark ? "#ffffff" : "#14110f",
          textShadow: mapDark
            ? "0 2px 14px rgba(0,0,0,0.55), 0 1px 2px rgba(0,0,0,0.45)"
            : "0 2px 14px rgba(255,255,255,0.55), 0 1px 2px rgba(255,255,255,0.45)",
        };
        var subStyle = {
          fontSize: 12, lineHeight: 1.4,
          color: mapDark ? "rgba(255,255,255,0.82)" : "rgba(20,18,17,0.7)",
          textShadow: mapDark
            ? "0 1px 4px rgba(0,0,0,0.55)"
            : "0 1px 4px rgba(255,255,255,0.55)",
          fontWeight: 500,
        };
        // Position rule:
        //   • Desktop OR (mobile + zone-hover): bottom-left, classic
        //     hover-preview slot.
        //   • Mobile + court/players mode: top-left so the bottom of
        //     the screen stays clear for the prompt + Continue button
        //     and the player cards. Top placement clears the step
        //     progress bar (which sits at top:~10px / 3px tall).
        var pinTopLeft = isMobile && (playMode === "court" || playMode === "players");
        var wrapStyle = pinTopLeft
          ? {
              position:"absolute",
              top: "calc(env(safe-area-inset-top, 0px) + 30px)",
              left: 14,
              maxWidth: 220,
              zIndex:500, pointerEvents:"none",
              display:"flex", flexDirection:"column", gap: 6,
              fontFamily: "ui-sans-serif, -apple-system, BlinkMacSystemFont, 'SF Pro Display', system-ui, sans-serif",
            }
          : {
              position:"absolute", left: isMobile ? 14 : 18, bottom: isMobile ? 14 : 18,
              maxWidth: isMobile ? 240 : 360,
              zIndex:500, pointerEvents:"none",
              display:"flex", flexDirection:"column", gap: 8,
              fontFamily: "ui-sans-serif, -apple-system, BlinkMacSystemFont, 'SF Pro Display', system-ui, sans-serif",
            };
        // When pinned top-left we tighten typography so the card
        // doesn't crowd the progress bar / format toggle.
        if(pinTopLeft){
          labelStyle = Object.assign({}, labelStyle, { fontSize: 22 });
        } else if(isMobile){
          labelStyle = Object.assign({}, labelStyle, { fontSize: 24 });
        }

        // ── COURT card (players mode) ─────────────────────────────
        if(playMode === "players" && playCourtName){
          var court = COURTS.find(function(c){
            return c.name === playCourtName
              || (c.aliases && c.aliases.indexOf(playCourtName) !== -1);
          });
          if(!court) return null;
          var courtZone = ZONE_BY_ID[court.zone];
          // Strip the "Tennis Centre / Tennis Courts / Tennis"
          // suffix since the context already implies tennis.
          var displayName = String(court.name)
            .replace(/\s+\(.*?\)$/, "")
            .replace(/\s+Tennis Centre$/i, "")
            .replace(/\s+Tennis Courts$/i, "")
            .replace(/\s+Tennis Club$/i, "")
            .replace(/\s+Tennis$/i, "")
            .trim();
          var subParts = [];
          if(court.suburb) subParts.push(court.suburb + ", Sydney");
          subParts.push((court.courts || 1) + " " + ((court.courts === 1) ? "court" : "courts"));
          return (
            <div className="fade-up" style={wrapStyle}>
              <span style={labelStyle}>{displayName}</span>
              {courtZone && (
                <div style={{
                  width: 56, height: 3,
                  background: courtZone.color,
                  borderRadius: 2,
                  boxShadow: "0 1px 4px " + courtZone.color + "55",
                }}/>
              )}
              <div style={subStyle}>{subParts.join(" · ")}</div>
            </div>
          );
        }

        // ── ZONE card ─────────────────────────────────────────────
        var which = (playMode === "court" && playZoneId) ? playZoneId
                  : (playMode === "zone"  && hovered)    ? hovered
                  : (hovered && !selected)               ? hovered
                  : null;
        if(!which) return null;
        var h = ZONE_BY_ID[which];
        if(!h) return null;
        return (
          <div className="fade-up" style={wrapStyle}>
            <div style={{
              display:"flex", alignItems:"center", gap: 10, flexWrap:"wrap",
            }}>
              <span style={labelStyle}>{h.name}</span>
            </div>
            {/* Thin accent rule in the zone colour — a designer
                touch that anchors the name without re-introducing
                a left border on a card. */}
            <div style={{
              width: 56, height: 3,
              background: h.color,
              borderRadius: 2,
              boxShadow: "0 1px 4px " + h.color + "55",
            }}/>
            {h.blurb && (
              <div style={subStyle}>{h.blurb}</div>
            )}
          </div>
        );
      })()}

      {/* Side panel — primary workspace when a zone is selected.
          Selection-then-action pattern: user highlights a court, then
          1+ players, then fires a batched Message or a single Challenge. */}
      {sidePanelZone && (
      <ZoneSidePanel
        t={t} zone={sidePanelZone} onClose={function(){ setSelected(null); }}
        authUser={authUser} profile={profile}
        homeZone={homeZone}
        activity={selectedZone ? zoneActivity[selectedZone.id] : null}
        blockedUserIds={blockedUserIds}
        panelCourtName={panelCourtName}
        onPanelCourtChange={setPanelCourtName}
        onSetHome={handleSetHome}
        onClearHome={handleClearHome}
        onOpenProfile={function(uid){
          if(!uid) return;
          if(selectedZone) track("profile_opened_from_map", {
            target_user_id: uid, zone_id: selectedZone.id, source: "zone_player",
          });
          if(onOpenProfile) onOpenProfile(uid);
        }}
        onMessageSelected={function(partners, ctx){
          if(!partners || !partners.length) return;
          if(onMessagePlayer) onMessagePlayer(partners, ctx);
        }}
      />
      )}

      {/* Map-native Play Match flow — bold prompt + back button.
          Lives at the top-centre of the map during steps 1 and 2.
          The CTA below is hidden while play mode is active so we
          don't double-stack interactive surfaces. */}
      {/* Step progress bar lives INSIDE each step's prompt block
          (above the title) — see the prompt JSX below for zone+
          court, MapPlayerOverlay for players, and the wizard for
          When. Earlier version pinned it to the top of the screen
          but it felt detached from the action. */}

      {/* Players step has its own self-contained chrome (see
          MapPlayerOverlay) so we suppress the generic prompt+back
          when playMode === 'players'. */}
      {playMode !== "off" && playMode !== "players" && (
        <>
          {/* Bold prompt at the bottom. Composition:
                StepProgressBar (above)
                ← Title  (inline-flex pair, gap 8 — chevron sits
                          immediately to the left of the words so
                          the back-affordance reads as part of
                          the step title, not an isolated corner
                          button)
              The chevron + title are centered as a unit. */}
          <div style={{
            position:"absolute",
            bottom: "calc(env(safe-area-inset-bottom, 0px) + 40px)",
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
                step={playMode === "court" ? 1 : 0}
              />
              <div style={{
                display:"inline-flex",
                alignItems:"center",
                gap: isMobile ? 6 : 8,
                pointerEvents:"none",
              }}>
                <button type="button"
                  onClick={function(){
                    if(playMode === "court"){ setPlayZoneId(null); setPlayMode("zone"); return; }
                    exitPlayMode();
                  }}
                  aria-label={playMode === "court" ? "Back to zones" : "Cancel"}
                  style={{
                    pointerEvents: "auto",
                    background: "transparent", border: "none", cursor: "pointer",
                    color: mapDark ? "#ffffff" : "#14110f",
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
                <div style={{
                  fontSize: isMobile ? 30 : 40, fontWeight: 900,
                  letterSpacing: "0.02em",
                  lineHeight: 1.05,
                  textTransform: "uppercase",
                  color: mapDark ? "#ffffff" : "#14110f",
                  textShadow: mapDark
                    ? "0 2px 16px rgba(0,0,0,0.55), 0 1px 2px rgba(0,0,0,0.45)"
                    : "0 2px 16px rgba(255,255,255,0.55), 0 1px 2px rgba(255,255,255,0.45)",
                  fontFamily: "ui-sans-serif, -apple-system, BlinkMacSystemFont, 'SF Pro Display', system-ui, sans-serif",
                }}>
                  {playMode === "zone" && "Choose your zone"}
                  {playMode === "court" && "Choose court"}
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Map-native player picker (step 3). Renders only while
          playMode === 'players'. Owns its own state; on Continue
          we receive the partner profiles and open the wizard at
          the When+Send step. On Back we return to court-pick. */}
      {playMode === "players" && playZoneId && (
        <MapPlayerOverlay
          t={t}
          mapDark={mapDark}
          isMobile={isMobile}
          authUser={authUser}
          blockedUserIds={blockedUserIds}
          zoneId={playZoneId}
          courtName={playCourtName}
          onBack={function(){
            // Step back to court-pick. Keep the zone, drop the court.
            setPlayCourtName(null);
            setPlayMode("court");
          }}
          onContinue={function(picks){
            // Hand the resolved partner profiles + format off to the
            // wizard's When step. Wizard reads `selected` for zone
            // and `wizardInitialCourt` for court, then jumps to the
            // When step via the smart-skip when initialPartners is
            // present.
            setSelected(playZoneId);
            setWizardInitialCourt(playCourtName);
            setWizardInitialPartners(picks.partners || []);
            setWizardInitialFormat(picks.format || "doubles");
            setPlayMode("off");
            setWizardOpen(true);
            track("play_match_step_entered", { step: 3 });
          }}
        />
      )}

      {/* Court info modal — opens on court marker tap */}
      {/* Play Match CTA — primary action of the map. Bottom-centre,
          thumb-zone optimal. Orange so it pops against the green
          zone polygons + neutral chrome. Phase 1: visual only —
          tap fires telemetry so we can see interest from day one
          (Mom-test: instrument before shipping the flow). Phase 2
          will swap the no-op for a guided 5-step wizard inside a
          bottom sheet (zone → court → player(s) → send invite).
          Hidden during play mode so it doesn't double-stack with
          the floating prompt + back button up top. */}
      {playMode === "off" && (
      <button type="button"
        onClick={function(){
          track("play_match_cta_tapped", {
            has_zone: !!selected,
            has_court: !!panelCourtName,
          });
          // Map-native flow: skip the wizard modal for steps 1+2,
          // enter zone-pick mode on the map. Closes any existing
          // side panel + clears prior court pin so the user gets a
          // clean canvas.
          setSelected(null);
          setPanelCourtName(null);
          setPlayZoneId(null);
          setPlayMode("zone");
        }}
        aria-label="Play Match"
        style={{
          position:"absolute",
          left:"50%",
          bottom: "calc(env(safe-area-inset-bottom, 0px) + 32px)",
          transform:"translateX(-50%)",
          zIndex: 550,
          // Iconic circle — Strava/Nike/Apple Voice Memos pattern.
          // Flat solid fill, single soft drop shadow, no gradient,
          // no inner highlights. Theme-adaptive: dark CTA on light
          // basemap, light CTA on dark basemap — so contrast stays
          // constant and the button never gets lost. Apple's primary-
          // button pattern. Sized at 114px (was 104, +10% per user)
          // so it reads even more confidently as the map's hero
          // action without crowding the bottom prompt.
          width: 114, height: 114,
          borderRadius: "50%",
          border: "none",
          background: mapDark ? "#fff" : "#14110f",
          color: mapDark ? "#14110f" : "#fff",
          fontFamily: "ui-sans-serif, -apple-system, BlinkMacSystemFont, 'SF Pro Display', 'SF Pro', system-ui, sans-serif",
          cursor: "pointer",
          // Layered shadow scaled up with the bigger button — deeper
          // ambient shadow at the bottom for elevation, tighter
          // contact shadow underneath.
          boxShadow:
            "0 14px 32px rgba(20,18,17,0.36), " +
            "0 4px 8px rgba(20,18,17,0.22)",
          display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center",
          gap: 0,
          transition: "transform 0.12s ease, box-shadow 0.18s ease",
        }}
        onMouseDown={function(e){
          e.currentTarget.style.transform = "translateX(-50%) scale(0.95)";
        }}
        onMouseUp={function(e){
          e.currentTarget.style.transform = "translateX(-50%)";
        }}
        onMouseLeave={function(e){
          e.currentTarget.style.transform = "translateX(-50%)";
        }}>
        <span style={{
          fontSize: 21, fontWeight: 900,
          letterSpacing: "0.10em", lineHeight: 1,
        }}>PLAY</span>
        <span style={{
          fontSize: 11, fontWeight: 700,
          letterSpacing: "0.20em", lineHeight: 1,
          opacity: 0.72, marginTop: 3,
        }}>MATCH</span>
      </button>
      )}

      <CourtInfoCard t={t} court={selectedCourt}
        authUser={authUser}
        viewerProfile={profile}
        blockedUserIds={blockedUserIds}
        openChallenge={openChallenge}
        onOpenProfile={function(uid){
          if(!uid) return;
          if(selectedCourt) track("profile_opened_from_map", {
            target_user_id: uid, zone_id: selectedCourt.zone, source: "court_recent",
          });
          if(onOpenProfile) onOpenProfile(uid);
        }}
        onChallenge={function(partner){
          if(!partner || !partner.id || !selectedCourt) return;
          track("challenge_from_map", {
            target_user_id: partner.id,
            zone_id: selectedCourt.zone,
            source: "court",
          });
          if(openChallenge) openChallenge(partner, "map", null);
        }}
        onMessagePlayer={function(partner, slotOpts){
          if(!partner || !partner.id) return;
          if(onMessagePlayer) onMessagePlayer(partner, slotOpts);
          setSelectedCourt(null); // close the modal; we navigate away
        }}
        onClose={function(){ setSelectedCourt(null); }}/>

      {/* Play Match wizard — guided zone → court → player → invite
          flow. Respects any zone already selected on the map (skips
          step 1 if so). On Send Invite, fans the picked partners
          out via the existing onMessagePlayer pipeline so the DM
          opens with the venue context pre-filled. */}
      <PlayMatchWizard
        t={t}
        open={wizardOpen}
        authUser={authUser}
        blockedUserIds={blockedUserIds}
        initialZoneId={selected}
        initialCourtName={wizardInitialCourt}
        initialPartners={wizardInitialPartners}
        initialFormat={wizardInitialFormat}
        onBackToPicker={function(){
          // Map-native flow only — close the wizard and return to
          // the player overlay. Picks are reset (the overlay starts
          // fresh) which is acceptable: the user explicitly stepped
          // back to change them.
          setWizardOpen(false);
          setWizardInitialPartners(null);
          setWizardInitialFormat(null);
          setPlayMode("players");
        }}
        onClose={function(){
          // Tear down the whole play flow — without this, `selected`
          // stays set to the picked zone and the right-side panel
          // (sidePanelZone) pops back in once playMode falls to "off".
          setWizardOpen(false);
          setWizardInitialCourt(null);
          setWizardInitialPartners(null);
          setWizardInitialFormat(null);
          setPlayMode("off");
          setPlayZoneId(null);
          setPlayCourtName(null);
          setSelected(null);
        }}
        onSendInvite={function(partners, ctx){
          if(!partners || !partners.length){ setWizardOpen(false); return; }
          // Prefer the background-send path (Option A) when wired —
          // closes the wizard immediately, sends in the background,
          // toasts success, user stays on the map. Falls back to
          // onMessagePlayer (compose modal) for the legacy path.
          if(onPlayMatchSend){
            onPlayMatchSend(partners, ctx);
          } else if(onMessagePlayer){
            onMessagePlayer(partners, ctx);
          }
          // Same teardown as onClose — clearing `selected` here is
          // what stops the zone side-panel from flashing in after
          // the wizard closes on send.
          setWizardOpen(false);
          setWizardInitialCourt(null);
          setWizardInitialPartners(null);
          setWizardInitialFormat(null);
          setPlayMode("off");
          setPlayZoneId(null);
          setPlayCourtName(null);
          setSelected(null);
        }}
      />
    </div>
  );
}

// Underline-tabs segmented control. No borders, no fills — text only
// with a 2px underline under the active label. Used for the map-theme
// picker (Auto/Light/Dark) and any other small "pick one of N" choices.
// Council pick over iOS-style filled segments because we need this to
// feel light inside a tight floating panel.
function UnderlineTabs({ t, value, onChange, options }){
  return (
    <div style={{ display:"flex", gap:18, paddingBottom:2 }}>
      {options.map(function(opt){
        var active = value === opt.id;
        return (
          <button key={opt.id} type="button"
            onClick={function(){ if(!active) onChange(opt.id); }}
            style={{
              padding:"4px 0",
              background:"transparent",
              border:"none",
              borderBottom: "2px solid " + (active ? t.text : "transparent"),
              color: active ? t.text : t.textTertiary,
              fontSize: 12,
              fontWeight: active ? 700 : 500,
              letterSpacing: "0.01em",
              cursor: active ? "default" : "pointer",
              transition: "color 0.15s, border-color 0.15s",
            }}>
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

// Compact toggle row used inside the layers panel. Whole row is the
// click target so finger-tap on mobile is forgiving.
function LayerRow({ t, label, sub, checked, onChange }){
  return (
    <button type="button"
      onClick={function(){ onChange(!checked); }}
      style={{
        display:"flex", alignItems:"center", gap:10,
        padding:"6px 0", background:"transparent",
        border:"none", cursor:"pointer", textAlign:"left",
        color: t.text,
      }}>
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ fontSize:13, fontWeight:600, letterSpacing:"-0.01em" }}>{label}</div>
        {sub && (
          <div style={{ fontSize:11, color:t.textTertiary, marginTop:1 }}>{sub}</div>
        )}
      </div>
      <span aria-hidden="true"
        style={{
          flex:"0 0 auto",
          width:34, height:20, borderRadius:12, position:"relative",
          background: checked ? "#10b981" : t.border,
          transition:"background 0.15s",
        }}>
        <span style={{
          position:"absolute", top:2, left: checked ? 16 : 2,
          width:16, height:16, borderRadius:"50%",
          background:"#fff", boxShadow:"0 1px 3px rgba(0,0,0,0.25)",
          transition:"left 0.15s",
        }}/>
      </span>
    </button>
  );
}

// Convert a #rrggbb token into rgba(...) — used by the play-mode
// glass overlays so we can take t.bgCard and dial it down to 94% alpha.
function hexToRgba(hex, alpha){
  if(!hex) return "rgba(255,255,255," + alpha + ")";
  var h = String(hex).replace("#", "");
  if(h.length === 3) h = h.split("").map(function(c){ return c + c; }).join("");
  var r = parseInt(h.slice(0,2), 16);
  var g = parseInt(h.slice(2,4), 16);
  var b = parseInt(h.slice(4,6), 16);
  if(isNaN(r) || isNaN(g) || isNaN(b)) return "rgba(255,255,255," + alpha + ")";
  return "rgba(" + r + "," + g + "," + b + "," + alpha + ")";
}
