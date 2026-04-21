// src/features/map/pages/MapTab.jsx
//
// Full-bleed Leaflet map of Sydney showing the six CourtSync matchmaking
// zones, public courts, and (if set) the user's home-zone pin. The right
// side panel is the only interactive surface — search/filter pills were
// dropped in favour of a calmer surface.
//
// Sizing: height is calc'd so it fits between the top nav and the mobile
// tab bar without scrolling the map off the screen.

import { useState } from "react";
import LeafletMap from "../components/LeafletMap.jsx";
import ZoneSidePanel from "../components/ZoneSidePanel.jsx";
import CourtInfoCard from "../components/CourtInfoCard.jsx";
import { ZONE_BY_ID } from "../data/zones.js";

export default function MapTab({
  t, theme, authUser, profile,
  onSetHomeZone, onClearHomeZone, onOpenProfile,
}){
  var [hovered,setHovered]=useState(null);
  var [selected,setSelected]=useState(null);
  var [selectedCourt,setSelectedCourt]=useState(null);
  var selectedZone = selected ? ZONE_BY_ID[selected] : null;
  var homeZone = profile && profile.home_zone;

  return (
    <div className="cs-map-frame" style={{ width:"100%", background: t.bg }}>

      {/* The map */}
      <LeafletMap
        t={t} theme={theme}
        hovered={hovered} selected={selected}
        homeZone={homeZone}
        onHover={setHovered}
        onSelect={setSelected}
        onCourtSelect={setSelectedCourt}
      />

      {/* Title pill — floats top-left over the map */}
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

      {/* Floating hovered-zone tooltip (bottom-left) */}
      {hovered && !selected && (function(){
        var h = ZONE_BY_ID[hovered];
        if(!h) return null;
        return (
          <div style={{
            position:"absolute", left:12, bottom:12,
            background: t.text, color: t.bg,
            padding:"8px 12px", borderRadius:6,
            fontSize:12, zIndex:500, pointerEvents:"none",
            boxShadow:"0 4px 16px rgba(0,0,0,0.15)",
            display:"flex", alignItems:"center", gap:8,
          }}>
            <span style={{ fontWeight:700 }}>{h.num}. {h.name}</span>
            <span style={{ opacity:0.55 }}>·</span>
            <span style={{ opacity:0.8 }}>{h.blurb.split(",")[0]} area</span>
          </div>
        );
      })()}

      {/* Side panel — slides in when a zone is selected */}
      <ZoneSidePanel
        t={t} zone={selectedZone} onClose={function(){ setSelected(null); }}
        authUser={authUser} profile={profile}
        homeZone={homeZone}
        onSetHome={onSetHomeZone}
        onClearHome={onClearHomeZone}
        onOpenProfile={onOpenProfile}
      />

      {/* Court info modal — opens on court marker tap */}
      <CourtInfoCard t={t} court={selectedCourt}
        onClose={function(){ setSelectedCourt(null); }}/>
    </div>
  );
}
