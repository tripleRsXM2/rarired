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
import { ZONE_BY_ID } from "../data/zones.js";
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

  // Wrap setters so we can emit analytics at selection time. Zone props
  // include the activity snapshot so funnel queries don't need a join.
  function handleSelect(zoneId){
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
    setSelectedCourt(court);
    if(court){
      track("court_opened", { court_name: court.name, zone_id: court.zone });
    }
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

      {/* Title pill — sits top-left. Leaflet zoom control retired
          so we sit flush to the left edge. */}
      <div style={{
        position:"absolute", top:12, left:12, zIndex:500,
        background: t.bgCard, border:"1px solid "+t.border,
        borderRadius:8, padding:"8px 14px",
        display:"flex", alignItems:"center", gap:10,
        boxShadow:"0 1px 4px rgba(0,0,0,0.05)",
      }}>
        <div style={{
          width:26, height:26, borderRadius:6, background: t.accent,
          color: t.accentText, display:"flex", alignItems:"center", justifyContent:"center",
          fontSize:12, fontWeight:800, letterSpacing:"-0.5px",
        }}>SYD</div>
        <div>
          <div style={{ fontSize:9, letterSpacing:"0.12em", color:t.textTertiary, textTransform:"uppercase", lineHeight:1 }}>Tennis zones</div>
          <div style={{ fontSize:13, fontWeight:700, color:t.text, letterSpacing:"-0.02em", marginTop:2, lineHeight:1 }}>Sydney</div>
        </div>
      </div>

      {/* Map layers control — Nike Run-style. A small layers icon top-
          right opens a card with independent switches for each optional
          overlay (homes / courts / activity flames) plus a basemap
          theme picker (auto/light/dark). Zone colors are NOT a toggle —
          they're permanent identifying chrome. Preferences persist to
          localStorage. */}
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
          position:"absolute", top:12, right:12, zIndex:500,
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

      {layersOpen && (
        <div ref={layersPanelRef}
          style={{
            position:"absolute", top:54, right:12, zIndex:600,
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
      {hovered && !selected && (function(){
        var h = ZONE_BY_ID[hovered];
        if(!h) return null;
        var a = zoneActivity[hovered];
        return (
          <div className="fade-up"
            style={{
              position:"absolute", left:14, bottom:14,
              background: t.bgCard, color: t.text,
              border: "1px solid " + t.border,
              borderLeft: "4px solid " + h.color,
              padding:"12px 16px", borderRadius:10,
              minWidth: 240, maxWidth: 320,
              zIndex:500, pointerEvents:"none",
              boxShadow:"0 8px 28px rgba(0,0,0,0.18)",
              display:"flex", flexDirection:"column", gap:4,
            }}>
            <div style={{
              fontSize:9, fontWeight:800, letterSpacing:"0.12em",
              textTransform:"uppercase", color: h.color,
            }}>
              Zone {h.num}
            </div>
            <div style={{
              display:"flex", alignItems:"center", gap:8, flexWrap:"wrap",
            }}>
              <span style={{ fontSize:16, fontWeight:800, color:t.text, letterSpacing:"-0.3px" }}>
                {h.name}
              </span>
              {a && a.matches_7d > 0 && (
                <span style={{
                  fontSize:10, fontWeight:800, letterSpacing:"0.04em",
                  color:"#fff", background:"rgba(239,68,68,0.95)",
                  padding:"2px 8px", borderRadius:12,
                }}>
                  🔥 {a.matches_7d}
                </span>
              )}
            </div>
            <div style={{ fontSize:11.5, color:t.textSecondary, lineHeight:1.4 }}>
              {h.blurb}
            </div>
            <div style={{
              fontSize:10, color:t.textTertiary, marginTop:4,
              letterSpacing:"0.04em", textTransform:"uppercase", fontWeight:600,
            }}>
              Tap to open zone
            </div>
          </div>
        );
      })()}

      {/* Side panel — primary workspace when a zone is selected.
          Selection-then-action pattern: user highlights a court, then
          1+ players, then fires a batched Message or a single Challenge. */}
      <ZoneSidePanel
        t={t} zone={selectedZone} onClose={function(){ setSelected(null); }}
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

      {/* Court info modal — opens on court marker tap */}
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
