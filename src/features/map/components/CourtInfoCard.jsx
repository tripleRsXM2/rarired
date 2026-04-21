// src/features/map/components/CourtInfoCard.jsx
//
// Modal shown when the user taps a court marker on the map. Surfaces the
// court name, suburb, zone, and two outbound actions:
//   • "View on Google Maps" — always; offloads imagery + street view + reviews
//   • "Book a court"        — if we have a verified bookingUrl for the venue
//
// We deliberately don't embed photos — venue imagery is owned by the
// operators and using it without a licence is risky. Linking out is safe
// and keeps CourtSync strictly in "discovery" mode (not a booking platform).

import { ZONE_BY_ID } from "../data/zones.js";
import { googleMapsSearchUrl } from "../data/courts.js";

export default function CourtInfoCard({ t, court, onClose }){
  if(!court) return null;
  var zone = ZONE_BY_ID[court.zone];
  var mapsUrl = googleMapsSearchUrl(court);

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

        {/* Actions */}
        <div style={{ padding:"0 18px 18px", display:"flex", flexDirection:"column", gap:8 }}>
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
