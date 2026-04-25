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

import { useEffect, useState } from "react";
import LeafletMap from "../components/LeafletMap.jsx";
import ZoneSidePanel from "../components/ZoneSidePanel.jsx";
import CourtInfoCard from "../components/CourtInfoCard.jsx";
import { ZONE_BY_ID } from "../data/zones.js";
import { fetchZoneActivity } from "../services/mapService.js";
import { track } from "../../../lib/analytics.js";

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
  var selectedZone = selected ? ZONE_BY_ID[selected] : null;
  var homeZone = profile && profile.home_zone;

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
        onHover={setHovered}
        onSelect={handleSelect}
        onCourtSelect={handleCourtSelect}
      />

      {/* Title pill — sits top-left, shifted right of the Leaflet zoom
          control (+/−) so the two don't stack. */}
      <div style={{
        position:"absolute", top:12, left:56, zIndex:500,
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
