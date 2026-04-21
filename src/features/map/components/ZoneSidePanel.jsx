// src/features/map/components/ZoneSidePanel.jsx
//
// Slides in from the right when a zone is selected. Shows:
//   • zone number + name + blurb
//   • courts nearby count + list
//   • "Players here" list (from profiles.home_zone)
//   • "Set as home area" toggle — writes profile.home_zone
//   • "Browse players here" — routes to People with the zone filter
//
// Uses the app theme tokens for chrome; keeps the zone accent color
// only for the zone dot/number.

import { useEffect, useState } from "react";
import { avColor } from "../../../lib/utils/avatar.js";
import { courtsInZone } from "../data/courts.js";
import { fetchPlayersInZone } from "../services/mapService.js";

export default function ZoneSidePanel({
  t, zone, onClose,
  authUser, profile, homeZone, onSetHome, onClearHome,
  onBrowseZonePlayers, onOpenProfile,
}){
  var [players,setPlayers]=useState([]);
  var [loading,setLoading]=useState(false);

  useEffect(function(){
    if(!zone) return;
    setLoading(true);
    fetchPlayersInZone(zone.id, 20).then(function(r){
      if(r.error){ console.error("[MapTab] fetchPlayersInZone:",r.error); setPlayers([]); }
      else setPlayers(r.data||[]);
      setLoading(false);
    });
  },[zone&&zone.id]);

  if(!zone) return null;

  var courts = courtsInZone(zone.id);
  var totalCourts = courts.reduce(function(n,c){ return n + c.courts; }, 0);
  var isHome = homeZone === zone.id;
  var canSetHome = !!authUser;

  return (
    <div className="slide-in-right" style={{
      position:"absolute", top:0, right:0, bottom:0, width:320,
      background: t.bgCard, borderLeft: "1px solid "+t.border,
      display:"flex", flexDirection:"column", zIndex:500,
      boxShadow:"-8px 0 32px rgba(0,0,0,0.06)",
    }}>

      {/* Header */}
      <div style={{ padding:"20px 20px 16px", borderBottom:"1px solid "+t.border }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:12 }}>
          <div style={{ display:"flex", gap:12, alignItems:"center", flex:1, minWidth:0 }}>
            <div style={{
              width:36, height:36, borderRadius:"50%", background: zone.color,
              display:"flex", alignItems:"center", justifyContent:"center",
              color:"#fff", fontWeight:700, fontSize:16, flexShrink:0,
              boxShadow:"0 0 0 3px "+t.bgCard,
            }}>{zone.num}</div>
            <div style={{ minWidth:0 }}>
              <div style={{ fontSize:10, letterSpacing:"0.1em", color:t.textTertiary, textTransform:"uppercase", marginBottom:2 }}>Zone {zone.num}</div>
              <div style={{ fontSize:18, fontWeight:700, color:t.text, letterSpacing:"-0.02em", lineHeight:1.15 }}>{zone.name}</div>
            </div>
          </div>
          <button onClick={onClose} style={{
            background:"transparent", border:"none", cursor:"pointer",
            color:t.textTertiary, fontSize:18, padding:4, lineHeight:1,
          }}>✕</button>
        </div>
        <div style={{ fontSize:12, color:t.textSecondary, marginTop:12, lineHeight:1.45 }}>{zone.blurb}</div>
      </div>

      {/* Stats row */}
      <div style={{
        display:"grid", gridTemplateColumns:"1fr 1fr",
        padding:"14px 20px", borderBottom:"1px solid "+t.border, gap:12,
      }}>
        <div>
          <div style={{ fontSize:20, fontWeight:700, color:t.text }}>{totalCourts}</div>
          <div style={{ fontSize:10, color:t.textTertiary, textTransform:"uppercase", letterSpacing:"0.08em", marginTop:2 }}>Courts nearby</div>
        </div>
        <div>
          <div style={{ fontSize:20, fontWeight:700, color:t.text }}>{loading?"…":players.length}</div>
          <div style={{ fontSize:10, color:t.textTertiary, textTransform:"uppercase", letterSpacing:"0.08em", marginTop:2 }}>Players here</div>
        </div>
      </div>

      {/* Scrollable body */}
      <div style={{ flex:1, overflowY:"auto", padding:"14px 20px 20px" }}>

        {/* Courts list */}
        <div style={{ fontSize:10, color:t.textTertiary, textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:8 }}>Courts</div>
        {courts.length===0
          ? <div style={{ fontSize:12, color:t.textTertiary, marginBottom:16 }}>No curated courts yet.</div>
          : (
            <div style={{ display:"flex", flexDirection:"column", gap:6, marginBottom:18 }}>
              {courts.map(function(c){
                return (
                  <div key={c.name} style={{
                    display:"flex", justifyContent:"space-between", alignItems:"center",
                    padding:"9px 11px", borderRadius:8,
                    background: t.bgTertiary,
                  }}>
                    <span style={{ fontSize:12, color:t.text, fontWeight:500 }}>{c.name}</span>
                    <span style={{ fontSize:10, color:t.textSecondary, fontWeight:600 }}>{c.courts} crt</span>
                  </div>
                );
              })}
            </div>
          )
        }

        {/* Players list */}
        <div style={{ fontSize:10, color:t.textTertiary, textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:8 }}>Players in this zone</div>
        {loading
          ? <div style={{ fontSize:12, color:t.textTertiary }}>Loading…</div>
          : players.length===0
            ? <div style={{ fontSize:12, color:t.textTertiary, lineHeight:1.45 }}>
                No one has set this as their home yet.
                {canSetHome && !isHome && " Be the first."}
              </div>
            : (
              <div style={{ display:"flex", flexDirection:"column", gap:4 }}>
                {players.slice(0,8).map(function(p){
                  return (
                    <button key={p.id}
                      onClick={function(){ onOpenProfile && onOpenProfile(p.id); }}
                      style={{
                        display:"flex", alignItems:"center", gap:10,
                        padding:"7px 8px", borderRadius:8,
                        background:"transparent", border:"none",
                        textAlign:"left", cursor:"pointer", width:"100%",
                      }}>
                      <div style={{
                        width:30, height:30, borderRadius:"50%", background: avColor(p.name),
                        display:"flex", alignItems:"center", justifyContent:"center",
                        fontSize:11, fontWeight:700, color:"#fff", flexShrink:0,
                      }}>{(p.avatar||p.name||"?").slice(0,2).toUpperCase()}</div>
                      <div style={{ minWidth:0, flex:1 }}>
                        <div style={{ fontSize:13, color:t.text, fontWeight:600, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                          {p.name}
                          {p.id===(authUser&&authUser.id) && <span style={{ color:t.textTertiary, fontWeight:400 }}> · you</span>}
                        </div>
                        <div style={{ fontSize:11, color:t.textTertiary, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                          {(p.skill||"")} {p.ranking_points?("· "+p.ranking_points+" pts"):""}
                        </div>
                      </div>
                    </button>
                  );
                })}
                {players.length > 8 && (
                  <button onClick={function(){ onBrowseZonePlayers && onBrowseZonePlayers(zone.id); }}
                    style={{
                      fontSize:12, color:t.accent, background:"transparent", border:"none",
                      textAlign:"left", padding:"4px 8px", cursor:"pointer", fontWeight:600,
                    }}>
                    View all {players.length}+ players →
                  </button>
                )}
              </div>
            )
        }
      </div>

      {/* Footer actions */}
      <div style={{ padding:"14px 20px", borderTop:"1px solid "+t.border, display:"flex", flexDirection:"column", gap:8 }}>
        <button
          onClick={function(){
            if(!canSetHome) return;
            if(isHome) onClearHome && onClearHome();
            else onSetHome && onSetHome(zone.id);
          }}
          disabled={!canSetHome}
          style={{
            width:"100%", padding:"12px",
            background: isHome ? "transparent" : t.accent,
            color: isHome ? t.accent : t.accentText,
            border: isHome ? ("1px solid "+t.accent) : "none",
            borderRadius:8, cursor: canSetHome ? "pointer" : "not-allowed",
            fontSize:13, fontWeight:700, opacity: canSetHome ? 1 : 0.5,
          }}>
          {isHome ? "✓ Your home area · Clear" : "Set as home area"}
        </button>
        <button
          onClick={function(){ onBrowseZonePlayers && onBrowseZonePlayers(zone.id); }}
          style={{
            width:"100%", padding:"11px",
            background:"transparent", color:t.text,
            border:"1px solid "+t.border, borderRadius:8,
            cursor:"pointer", fontSize:12, fontWeight:600,
          }}>
          Browse players here
        </button>
      </div>
    </div>
  );
}
