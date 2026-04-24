// src/features/map/components/CourtInfoCard.jsx
//
// Modal shown when the user taps a court marker on the map. Surfaces the
// court name, suburb, zone, recent players, and two outbound actions:
//   • "View on Google Maps" — always; offloads imagery + street view + reviews
//   • "Book a court"        — if we have a verified bookingUrl for the venue
//
// Recent players — pulled from confirmed matches at this venue over the
// last 60 days. Clicking a player opens their profile; a ⚡ "Challenge"
// button next to each player fires the challenge composer for that
// partner. This is the density lever — turning a court tap into a
// concrete "rematch someone real".
//
// We deliberately don't embed photos — venue imagery is owned by the
// operators and using it without a licence is risky. Linking out is safe
// and keeps CourtSync strictly in "discovery" mode (not a booking platform).

import { useEffect, useState } from "react";
import PlayerAvatar from "../../../components/ui/PlayerAvatar.jsx";
import { ZONE_BY_ID } from "../data/zones.js";
import { googleMapsSearchUrl } from "../data/courts.js";
import { fetchRecentPlayersAtCourt } from "../services/mapService.js";

export default function CourtInfoCard({
  t, court, onClose,
  authUser, onOpenProfile, onChallenge, openChallenge,
}){
  var [recent, setRecent] = useState([]);
  var [loading, setLoading] = useState(false);

  // Load recent players whenever the court changes. We intentionally
  // over-fetch a 60-day window because courts are cold — a 7-day window
  // would almost always be empty for anything outside the busiest few.
  useEffect(function(){
    if(!court) { setRecent([]); return; }
    setLoading(true);
    fetchRecentPlayersAtCourt(court.name, 60, 6).then(function(r){
      if(r.error){ console.warn("[CourtInfoCard] recent players:", r.error); setRecent([]); }
      else setRecent(r.data || []);
      setLoading(false);
    });
  },[court && court.name]);

  if(!court) return null;
  var zone = ZONE_BY_ID[court.zone];
  var mapsUrl = googleMapsSearchUrl(court);

  // Filter out the viewer themselves — they can't challenge themselves
  // and seeing yourself in the list is noise.
  var others = recent.filter(function(p){ return !authUser || p.id !== authUser.id; });

  function handleChallenge(p, e){
    if(e) e.stopPropagation();
    // Delegate to onChallenge (which tracks the event) if provided;
    // fall back to openChallenge for direct callers.
    if(onChallenge) onChallenge(p);
    else if(openChallenge) openChallenge(p, "map", null);
    if(onClose) onClose();
  }

  return (
    <div
      onClick={onClose}
      style={{
        position:"absolute", inset:0, zIndex:700,
        background:"rgba(0,0,0,0.45)",
        display:"flex", alignItems:"center", justifyContent:"center",
        padding:16,
      }}>
      <div
        onClick={function(e){ e.stopPropagation(); }}
        className="pop"
        style={{
          width:"100%", maxWidth:360,
          background:t.bgCard, border:"1px solid "+t.border,
          borderRadius:14, overflow:"hidden",
          boxShadow:"0 20px 60px rgba(0,0,0,0.35)",
          maxHeight:"85vh", display:"flex", flexDirection:"column",
        }}>

        {/* Header with zone color accent strip */}
        {zone && (
          <div style={{ height:4, background: zone.color }}/>
        )}
        <div style={{ padding:"18px 18px 10px", display:"flex", gap:12, alignItems:"flex-start" }}>
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ fontSize:10, letterSpacing:"0.12em", color:t.textTertiary,
              textTransform:"uppercase", marginBottom:4 }}>
              {zone ? (zone.num + " · " + zone.name) : "Court"}
            </div>
            <div style={{ fontSize:17, fontWeight:700, color:t.text, letterSpacing:"-0.02em", lineHeight:1.2 }}>
              {court.name}
            </div>
            {court.suburb && (
              <div style={{ fontSize:12, color:t.textSecondary, marginTop:3 }}>{court.suburb}, Sydney</div>
            )}
          </div>
          <button onClick={onClose} style={{
            background:"transparent", border:"none", cursor:"pointer",
            color:t.textTertiary, fontSize:18, padding:4, lineHeight:1, flexShrink:0,
          }}>✕</button>
        </div>

        {/* Stat row */}
        <div style={{ padding:"4px 18px 14px", display:"flex", gap:16 }}>
          <div>
            <div style={{ fontSize:18, fontWeight:700, color:t.text }}>{court.courts}</div>
            <div style={{ fontSize:10, color:t.textTertiary, textTransform:"uppercase",
              letterSpacing:"0.08em", marginTop:2 }}>
              Court{court.courts===1?"":"s"}
            </div>
          </div>
          {zone && (
            <div style={{ flex:1 }}>
              <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                <div style={{ width:10, height:10, borderRadius:"50%", background:zone.color }}/>
                <span style={{ fontSize:13, color:t.text, fontWeight:600 }}>{zone.name}</span>
              </div>
              <div style={{ fontSize:10, color:t.textTertiary, textTransform:"uppercase",
                letterSpacing:"0.08em", marginTop:2 }}>
                Zone
              </div>
            </div>
          )}
        </div>

        {/* Recent players section — scrollable body so the card grows
            gracefully when there are many; actions stick to the bottom. */}
        <div style={{ flex:1, overflowY:"auto", padding:"0 18px 4px" }}>
          <div style={{ fontSize:10, color:t.textTertiary, textTransform:"uppercase",
            letterSpacing:"0.08em", marginBottom:8 }}>
            Recently played here
          </div>
          {loading ? (
            <div style={{ fontSize:12, color:t.textTertiary, marginBottom:14 }}>Loading…</div>
          ) : others.length === 0 ? (
            <div style={{ fontSize:12, color:t.textTertiary, lineHeight:1.5, marginBottom:14 }}>
              No confirmed matches logged here yet — be the first to log one.
            </div>
          ) : (
            <div style={{ display:"flex", flexDirection:"column", gap:4, marginBottom:10 }}>
              {others.map(function(p){
                var canChallenge = !!authUser && !!(onChallenge || openChallenge);
                return (
                  <div key={p.id} style={{
                    display:"flex", alignItems:"center", gap:10,
                    padding:"6px 8px", borderRadius:8,
                  }}>
                    <button
                      onClick={function(){ if(onOpenProfile) onOpenProfile(p.id); }}
                      style={{
                        display:"flex", alignItems:"center", gap:10,
                        padding:0, background:"transparent", border:"none",
                        cursor:"pointer", flex:1, minWidth:0, textAlign:"left",
                      }}>
                      <PlayerAvatar name={p.name} avatar={p.avatar} avatarUrl={p.avatar_url} size={30}/>
                      <div style={{ minWidth:0, flex:1 }}>
                        <div style={{ fontSize:13, color:t.text, fontWeight:600,
                          overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                          {p.name}
                        </div>
                        <div style={{ fontSize:11, color:t.textTertiary }}>
                          {[(p.skill||""), (p.ranking_points?(p.ranking_points+" pts"):"")]
                            .filter(Boolean).join(" · ")}
                        </div>
                      </div>
                    </button>
                    {canChallenge && (
                      <button
                        onClick={function(e){ handleChallenge(p, e); }}
                        style={{
                          padding:"5px 10px", borderRadius:6,
                          border:"1px solid "+t.accent,
                          background:t.accent+"18", color:t.accent,
                          fontSize:11, fontWeight:700, cursor:"pointer",
                          flexShrink:0, letterSpacing:"-0.01em",
                        }}>
                        Challenge
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Actions */}
        <div style={{ padding:"10px 18px 18px", display:"flex", flexDirection:"column", gap:8,
          borderTop:"1px solid "+t.border }}>
          {court.bookingUrl
            ? (
              <a href={court.bookingUrl} target="_blank" rel="noopener noreferrer"
                style={{
                  display:"block", textAlign:"center", textDecoration:"none",
                  padding:"12px", borderRadius:8,
                  background:t.accent, color:t.accentText,
                  fontSize:13, fontWeight:700, letterSpacing:"-0.01em",
                }}>
                Book a court →
              </a>
            )
            : (
              <div style={{
                fontSize:11, color:t.textTertiary, lineHeight:1.45,
                background:t.bgTertiary, padding:"10px 12px", borderRadius:8,
              }}>
                Booking info isn't verified yet for this venue. Try Google Maps or the local council website.
              </div>
            )
          }
          <a href={mapsUrl} target="_blank" rel="noopener noreferrer"
            style={{
              display:"block", textAlign:"center", textDecoration:"none",
              padding:"11px", borderRadius:8,
              background:"transparent", color:t.text, border:"1px solid "+t.border,
              fontSize:12, fontWeight:600,
            }}>
            View on Google Maps →
          </a>
        </div>
      </div>
    </div>
  );
}
