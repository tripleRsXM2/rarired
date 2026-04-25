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
import { fetchPlayersAtCourt } from "../services/mapService.js";
import { buildDraftFromTemplate } from "../../people/utils/dmTemplates.js";
import { track } from "../../../lib/analytics.js";

export default function CourtInfoCard({
  t, court, onClose,
  authUser, viewerProfile,
  onOpenProfile, onChallenge, openChallenge,
  // Phase 2: fires dms.openConversationWith + navigates to /people/messages.
  // Shape: onMessagePlayer(partner, { venue, date, time, draft })
  onMessagePlayer,
  // Asymmetric block — viewer's blocked-user list is filtered out of
  // the ranked candidate set in fetchPlayersAtCourt.
  blockedUserIds,
}){
  var [players, setPlayers] = useState([]);
  var [loading, setLoading] = useState(false);

  // Phase 2 — ranked player list for this court. Combines self-reported
  // played_courts with match-history derivation, then sorts by (plays-
  // here + skill match + availability overlap). See mapService.
  useEffect(function(){
    if(!court) { setPlayers([]); return; }
    setLoading(true);
    fetchPlayersAtCourt(court.name, viewerProfile || { id: authUser && authUser.id }, 12, blockedUserIds || []).then(function(r){
      if(r.error){ console.warn("[CourtInfoCard] players:", r.error); setPlayers([]); }
      else setPlayers(r.data || []);
      setLoading(false);
    });
  },[court && court.name, authUser && authUser.id]);

  if(!court) return null;
  var zone = ZONE_BY_ID[court.zone];
  var mapsUrl = googleMapsSearchUrl(court);

  // Defensive viewer filter — service already excludes the viewer id,
  // but a null viewerId in the service call is possible during sign-out
  // transitions.
  var others = players.filter(function(p){ return !authUser || p.id !== authUser.id; });

  function handleChallenge(p, e){
    if(e) e.stopPropagation();
    if(onChallenge) onChallenge(p);
    else if(openChallenge) openChallenge(p, "map", null);
    if(onClose) onClose();
  }

  function handleMessage(p, e){
    if(e) e.stopPropagation();
    if (!onMessagePlayer) return;
    var draft = buildDraftFromTemplate("casual", court.name, "", "");
    onMessagePlayer(p, { venue: court.name, date: "", time: "", draft: draft });
    track("dm_prefilled_from_map", {
      target_user_id: p.id,
      court_name: court.name,
      zone_id: court.zone,
      skill_match: !!(viewerProfile && viewerProfile.skill === p.skill),
      availability_overlap_count: 0, // placeholder — full count lives in service ranking
      plays_here: !!p.playsHere,
    });
    if (onClose) onClose();
  }

  // Skill-match indicator — small chip shown next to a player whose
  // skill sub-level matches the viewer's exactly, or whose tier matches.
  function skillHintFor(p) {
    if (!viewerProfile || !viewerProfile.skill || !p.skill) return null;
    if (viewerProfile.skill === p.skill) return "Your level";
    // same tier heuristic — cheap client-side check, authoritative logic
    // for ranking lives in scorePlayerForCourt.
    var va = (viewerProfile.skill.split(" ")[0] || "");
    var pb = (p.skill.split(" ")[0] || "");
    if (va && va === pb) return va;
    return null;
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
          // Widened from 360 → 440 once we started rendering per-row
          // action buttons. At 360 the name got truncated at ~8 chars
          // before the Message + Challenge pair on the right, so a list
          // of two-player venues was unreadable. 440 gives comfortable
          // room for name + skill-match chip + both buttons.
          width:"100%", maxWidth:440,
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

        {/* Players at this court — Phase 2 of the map pivot. Ranked
            list combining self-reported plays-here (profiles.played_courts)
            and match-history-derived plays-here, scored by skill match +
            availability overlap. Each row offers both Message (→ DM prefill)
            and Challenge. */}
        <div style={{ flex:1, overflowY:"auto", padding:"0 18px 4px" }}>
          <div style={{ fontSize:10, color:t.textTertiary, textTransform:"uppercase",
            letterSpacing:"0.08em", marginBottom:8 }}>
            Players at this court
          </div>
          {loading ? (
            <div style={{ fontSize:12, color:t.textTertiary, marginBottom:14 }}>Loading…</div>
          ) : others.length === 0 ? (
            <div style={{ fontSize:12, color:t.textTertiary, lineHeight:1.5, marginBottom:14 }}>
              No one has tagged this court yet. Be first — add it under Settings → Courts I play at.
            </div>
          ) : (
            <div style={{ display:"flex", flexDirection:"column", gap:2, marginBottom:10 }}>
              {others.map(function(p){
                var canChallenge = !!authUser && !!(onChallenge || openChallenge);
                var canMessage   = !!authUser && !!onMessagePlayer;
                var hint = skillHintFor(p);
                // Two-row layout per player: identity line full-width, action
                // line below. Stops long names getting squeezed into nothing
                // when both Message + Challenge buttons are rendered.
                return (
                  <div key={p.id} style={{
                    padding:"10px 10px", borderRadius:8,
                    border:"1px solid "+t.border,
                    display:"flex", flexDirection:"column", gap:8,
                  }}>
                    {/* Identity — avatar + name + skill subtitle. Full width,
                        no squeeze. Clickable area routes to the player's
                        profile. */}
                    <button
                      onClick={function(){ if(onOpenProfile) onOpenProfile(p.id); }}
                      style={{
                        display:"flex", alignItems:"center", gap:10,
                        padding:0, background:"transparent", border:"none",
                        cursor:"pointer", width:"100%", textAlign:"left",
                      }}>
                      <PlayerAvatar name={p.name} avatar={p.avatar} avatarUrl={p.avatar_url} size={34} blurred={!authUser}/>
                      <div style={{ minWidth:0, flex:1 }}>
                        <div style={{ display:"flex", alignItems:"center", gap:6, flexWrap:"wrap" }}>
                          <span style={{ fontSize:14, color:t.text, fontWeight:700,
                            overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap",
                            minWidth:0, maxWidth:"100%",
                            filter: !authUser ? "blur(5px)" : "none" }}>
                            {p.name}
                          </span>
                          {hint && (
                            <span style={{ fontSize:9, fontWeight:700, color:t.accent,
                              background:t.accentSubtle, padding:"1px 6px", borderRadius:10,
                              letterSpacing:"0.04em", textTransform:"uppercase", flexShrink:0 }}>
                              {hint}
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize:11, color:t.textTertiary, marginTop:1 }}>
                          {[(p.skill||""), (p.ranking_points?(p.ranking_points+" pts"):""),
                            (p.playsHere ? "Plays here" : null)]
                            .filter(Boolean).join(" · ")}
                        </div>
                      </div>
                    </button>
                    {/* Actions — full width row so buttons don't eat the name */}
                    {(canMessage || canChallenge) && (
                      <div style={{ display:"flex", gap:6 }}>
                        {canMessage && (
                          <button
                            onClick={function(e){ handleMessage(p, e); }}
                            style={{
                              flex:1, padding:"7px 10px", borderRadius:6,
                              border:"none",
                              background:t.accent, color:t.accentText,
                              fontSize:12, fontWeight:700, cursor:"pointer",
                              letterSpacing:"-0.01em",
                            }}>
                            Message
                          </button>
                        )}
                        {canChallenge && (
                          <button
                            onClick={function(e){ handleChallenge(p, e); }}
                            style={{
                              flex:1, padding:"7px 10px", borderRadius:6,
                              border:"1px solid "+t.accent,
                              background:"transparent", color:t.accent,
                              fontSize:12, fontWeight:700, cursor:"pointer",
                              letterSpacing:"-0.01em",
                            }}>
                            Challenge
                          </button>
                        )}
                      </div>
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
