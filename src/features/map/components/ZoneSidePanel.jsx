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
import PlayerAvatar from "../../../components/ui/PlayerAvatar.jsx";
import { courtsInZone } from "../data/courts.js";
import { fetchPlayersInZone } from "../services/mapService.js";

export default function ZoneSidePanel({
  t, zone, onClose,
  authUser, profile, homeZone, onSetHome, onClearHome,
  onOpenProfile,
}){
  var [players,setPlayers]=useState([]);
  var [loading,setLoading]=useState(false);

  // Re-fetch when the zone changes OR when the user's home zone changes,
  // so setting/clearing "home" in this panel refreshes the list without
  // needing to close + reopen the panel.
  useEffect(function(){
    if(!zone) return;
    setLoading(true);
    fetchPlayersInZone(zone.id, 20).then(function(r){
      if(r.error){ console.error("[MapTab] fetchPlayersInZone:",r.error); setPlayers([]); }
      else setPlayers(r.data||[]);
      setLoading(false);
    });
  },[zone&&zone.id, homeZone]);

  // If the current user just set this zone as home, optimistically include
  // them at the top of the list so the UI reflects it instantly even before
  // the re-fetch resolves.
  var displayPlayers = players;
  if(zone && authUser && homeZone === zone.id && profile){
    var alreadyThere = players.some(function(p){ return p.id === authUser.id; });
    if(!alreadyThere){
      displayPlayers = [{
        id: authUser.id,
        name: profile.name,
        avatar: profile.avatar,
        avatar_url: profile.avatar_url,
        skill: profile.skill,
        ranking_points: profile.ranking_points,
        suburb: profile.suburb,
        home_zone: zone.id,
      }].concat(players);
    }
  }

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
          <div style={{ fontSize:20, fontWeight:700, color:t.text }}>{loading?"…":displayPlayers.length}</div>
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
                    padding:"9px 11px", borderRadius:8,
                    background: t.bgTertiary,
                    fontSize:12, color:t.text, fontWeight:500,
                  }}>
                    {c.name}
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
          : displayPlayers.length===0
            ? <div style={{ fontSize:12, color:t.textTertiary, lineHeight:1.45 }}>
                No one has set this as their home yet.
                {canSetHome && !isHome && " Be the first."}
              </div>
            : (
              <div style={{ display:"flex", flexDirection:"column", gap:4 }}>
                {displayPlayers.map(function(p){
                  return (
                    <button key={p.id}
                      onClick={function(){ onOpenProfile && onOpenProfile(p.id); }}
                      style={{
                        display:"flex", alignItems:"center", gap:10,
                        padding:"7px 8px", borderRadius:8,
                        background:"transparent", border:"none",
                        textAlign:"left", cursor:"pointer", width:"100%",
                      }}>
                      <PlayerAvatar name={p.name} avatar={p.avatar} avatarUrl={p.avatar_url} size={30}/>
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
              </div>
            )
        }
      </div>

      {/* Footer — home-zone toggle is the only action */}
      <div style={{ padding:"14px 20px", borderTop:"1px solid "+t.border }}>
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
      </div>
    </div>
  );
}
