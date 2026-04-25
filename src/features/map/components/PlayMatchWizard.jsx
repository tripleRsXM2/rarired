// src/features/map/components/PlayMatchWizard.jsx
//
// Guided 4-step "Play Match" flow opened from the orange CTA at the
// bottom-centre of the map.
//   1. Pick a zone (6 colored cards in a 2-col grid)
//   2. Pick a court (flat list with venue + N courts)
//   3. Pick player(s) — In-zone / Everywhere toggle, multi-select up to 3
//   4. Confirm + send invite (pre-filled DM with venue context)
//
// Reuses ZONES, courtsInZone(), fetchPlayersInZone(), and the existing
// onMessagePlayer pipeline so the send step lands in the same DM the
// rest of the app would.
//
// Funnel events (see docs/analytics-events.md):
//   play_match_step_entered    { step }
//   play_match_zone_picked     { zone_id }
//   play_match_court_picked    { zone_id, court_name }
//   play_match_player_picked   { player_count, scope }
//   play_match_invite_sent     { zone_id, court_name, partner_count, scope }
//   play_match_cancelled       { step, last_completed }

import { useEffect, useState } from "react";
import { ZONES } from "../data/zones.js";
import { courtsInZone } from "../data/courts.js";
import { fetchPlayersInZone, fetchPlayersAtCourt, scorePlayerForCourt } from "../services/mapService.js";
import PlayerAvatar from "../../../components/ui/PlayerAvatar.jsx";
import { track } from "../../../lib/analytics.js";

var TOTAL_STEPS = 4;
var MAX_SELECT  = 3; // viewer + 3 others = doubles

export default function PlayMatchWizard({
  t, open,
  authUser, blockedUserIds,
  initialZoneId,
  onClose, onSendInvite,
}){
  // Steps: 0 zone, 1 court, 2 players, 3 confirm.
  var [step, setStep]           = useState(0);
  var [zoneId, setZoneId]       = useState(initialZoneId || null);
  var [courtName, setCourtName] = useState(null);
  var [scope, setScope]         = useState("zone"); // zone | everywhere
  var [selectedIds, setSelectedIds] = useState([]);
  var [players, setPlayers]     = useState([]);
  var [loading, setLoading]     = useState(false);

  // Reset everything when the wizard opens. Lock body scroll while up.
  useEffect(function(){
    if(!open) return;
    var startStep = initialZoneId ? 1 : 0;
    setStep(startStep);
    setZoneId(initialZoneId || null);
    setCourtName(null);
    setSelectedIds([]);
    setScope("zone");
    track("play_match_step_entered", { step: startStep });
    if(typeof document !== "undefined"){
      var prev = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return function(){ document.body.style.overflow = prev; };
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[open]);

  // Fetch players whenever we hit step 2 — uses the same services
  // ZoneSidePanel does so the ranking/filter behaviour stays
  // consistent. Re-fetches if scope/zone/court change while on step 2.
  useEffect(function(){
    if(!open) return;
    if(step !== 2 || !zoneId) return;
    var cancelled = false;
    setLoading(true);
    var viewer  = authUser && authUser.id ? authUser.id : null;
    var blocked = Array.isArray(blockedUserIds) ? blockedUserIds : [];
    var zoneArg = scope === "everywhere" ? null : zoneId;
    var zoneReq = fetchPlayersInZone(zoneArg, viewer, 60, blocked);
    var courtReq = courtName
      ? fetchPlayersAtCourt(courtName, viewer, 40, blocked)
      : Promise.resolve({ data: [], error: null });
    Promise.all([zoneReq, courtReq]).then(function(arr){
      if(cancelled) return;
      var zr = arr[0], cr = arr[1];
      if(zr && zr.error) console.warn("[PlayMatchWizard] fetchPlayersInZone:", zr.error);
      if(cr && cr.error) console.warn("[PlayMatchWizard] fetchPlayersAtCourt:", cr.error);
      // Merge: zone roster, upgrade with court record if same id, add
      // court-only players who aren't in zone (when scope = zone).
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
      var arr2 = Object.values(byId);
      // Rank: plays-here first, then mapService.scorePlayerForCourt.
      arr2.sort(function(a, b){
        return scorePlayerForCourt(b, courtName, zoneId) - scorePlayerForCourt(a, courtName, zoneId);
      });
      setPlayers(arr2);
      setLoading(false);
    }).catch(function(){ if(!cancelled) setLoading(false); });
    return function(){ cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[open, step, zoneId, courtName, scope]);

  if(!open) return null;

  function go(nextStep){
    setStep(nextStep);
    track("play_match_step_entered", { step: nextStep });
  }
  function pickZone(z){
    setZoneId(z.id);
    setCourtName(null);
    track("play_match_zone_picked", { zone_id: z.id });
    go(1);
  }
  function pickCourt(c){
    setCourtName(c.name);
    track("play_match_court_picked", { zone_id: zoneId, court_name: c.name });
    go(2);
  }
  function togglePlayer(p){
    setSelectedIds(function(prev){
      if(prev.indexOf(p.id) !== -1){
        return prev.filter(function(id){ return id !== p.id; });
      }
      if(prev.length >= MAX_SELECT) return prev;
      return prev.concat([p.id]);
    });
  }
  function confirmPlayers(){
    if(!selectedIds.length) return;
    track("play_match_player_picked", { player_count: selectedIds.length, scope: scope });
    go(3);
  }
  function sendInvite(){
    var partners = selectedIds.map(function(id){
      return players.find(function(p){ return p.id === id; });
    }).filter(Boolean);
    if(!partners.length) return;
    var zone = ZONES.find(function(z){ return z.id === zoneId; });
    var ctx = {
      venue: courtName || (zone && zone.name) || "",
      zoneId: zoneId,
      courtName: courtName,
      // Friendly pre-filled draft. The DM hook accepts a `draft` and
      // pre-populates the composer.
      draft: buildInviteDraft({ partners: partners, court: courtName, zone: zone }),
    };
    track("play_match_invite_sent", {
      zone_id: zoneId, court_name: courtName,
      partner_count: partners.length, scope: scope,
    });
    if(onSendInvite) onSendInvite(partners, ctx);
  }
  function back(){
    if(step === 0) return cancel();
    go(step - 1);
  }
  function cancel(){
    track("play_match_cancelled", { step: step, last_completed: step - 1 });
    if(onClose) onClose();
  }

  var zone   = zoneId ? ZONES.find(function(z){ return z.id === zoneId; }) : null;
  var courts = zoneId ? courtsInZone(zoneId) : [];
  var selectedPlayers = selectedIds.map(function(id){
    return players.find(function(p){ return p.id === id; });
  }).filter(Boolean);

  return (
    <div role="dialog" aria-modal="true" aria-label="Play Match"
      style={{
        // Absolute (not fixed) so the modal centres on the MAP area,
        // not the whole viewport — the side nav stays visible to its
        // left and the wizard reads as part of the map surface.
        position:"absolute", inset:0, zIndex: 3000,
        // Backdrop: dark + heavy blur so the map behind softens
        // out — Nike Run / iOS sheet vibe. The map remains visible
        // as a hint of where you came from.
        background:"rgba(20,18,17,0.42)",
        WebkitBackdropFilter: "blur(10px)",
        backdropFilter: "blur(10px)",
        display:"flex", alignItems:"center", justifyContent:"center",
        padding: 12,
      }}
      onClick={function(e){ if(e.target === e.currentTarget) cancel(); }}>
      <div style={{
        // Translucent glass card — the boxy bordered modal is gone.
        // Content is the design; chrome is invisible.
        background: "rgba(255,255,255,0.96)",
        WebkitBackdropFilter: "blur(40px) saturate(140%)",
        backdropFilter: "blur(40px) saturate(140%)",
        color: t.text,
        borderRadius: 22,
        boxShadow:
          "0 24px 60px rgba(20,18,17,0.28), " +
          "0 1px 0 rgba(255,255,255,0.6) inset",
        width: "100%",
        maxWidth: 460,
        maxHeight: "calc(100dvh - 24px)",
        display: "flex", flexDirection: "column",
        overflow: "hidden",
        position: "relative",
      }}>

        {/* Floating chrome — back + close, no header bar.
            The buttons sit ON TOP of the content via absolute
            positioning so the body can extend full-bleed. */}
        <button type="button" onClick={back} aria-label={step === 0 ? "Cancel" : "Back"}
          style={{
            position:"absolute", top: 14, left: 14, zIndex: 2,
            width:36, height:36, borderRadius: "50%",
            background:"rgba(255,255,255,0.7)",
            WebkitBackdropFilter:"blur(20px)", backdropFilter:"blur(20px)",
            border:"none", cursor:"pointer",
            color: t.text,
            display:"flex", alignItems:"center", justifyContent:"center",
            boxShadow: "0 1px 4px rgba(20,18,17,0.10)",
          }}>
          <svg width="16" height="16" viewBox="0 0 18 18" fill="none"
               stroke="currentColor" strokeWidth="1.8"
               strokeLinecap="round" strokeLinejoin="round">
            <path d="M11 14L6 9l5-5"/>
          </svg>
        </button>
        <button type="button" onClick={cancel} aria-label="Close"
          style={{
            position:"absolute", top: 14, right: 14, zIndex: 2,
            width:36, height:36, borderRadius: "50%",
            background:"rgba(255,255,255,0.7)",
            WebkitBackdropFilter:"blur(20px)", backdropFilter:"blur(20px)",
            border:"none", cursor:"pointer",
            color: t.text,
            display:"flex", alignItems:"center", justifyContent:"center",
            boxShadow: "0 1px 4px rgba(20,18,17,0.10)",
          }}>
          <svg width="14" height="14" viewBox="0 0 18 18" fill="none"
               stroke="currentColor" strokeWidth="2"
               strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 5l8 8M13 5l-8 8"/>
          </svg>
        </button>

        {/* Step indicator — tiny dots floated above title */}
        <div style={{
          padding: "62px 28px 0",
          display:"flex", gap: 5,
        }}>
          {[0,1,2,3].map(function(i){
            return (
              <div key={i} style={{
                width: 22, height: 3, borderRadius: 2,
                background: i <= step ? "#14110f" : "rgba(20,18,17,0.12)",
                transition: "background 0.2s",
              }}/>
            );
          })}
        </div>

        {/* Title — typography-led, no header bar */}
        <div style={{ padding: "16px 28px 6px" }}>
          <div style={{
            fontSize: 10, fontWeight: 700, letterSpacing: "0.18em",
            textTransform: "uppercase",
            color: "rgba(20,18,17,0.42)", lineHeight: 1,
          }}>
            Step {step + 1} of {TOTAL_STEPS}
          </div>
          <div style={{
            fontSize: 22, fontWeight: 900,
            letterSpacing: "-0.025em", lineHeight: 1.15,
            color: "#14110f",
            marginTop: 8,
          }}>
            {step === 0 && "Where do you want to play?"}
            {step === 1 && "Which court?"}
            {step === 2 && "Who do you want to play with?"}
            {step === 3 && "Send invite"}
          </div>
        </div>

        {/* Body */}
        <div style={{ flex:1, overflowY:"auto", padding:"14px 22px 22px" }}>

          {/* Step 0 — pick zone — sleek glass cards, no redundant dots */}
          {step === 0 && (
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap: 10 }}>
              {ZONES.map(function(z){
                var venueCount = courtsInZone(z.id).length;
                return (
                  <button key={z.id} type="button"
                    onClick={function(){ pickZone(z); }}
                    style={{
                      textAlign:"left",
                      padding: "18px 16px",
                      borderRadius: 16,
                      border: "none",
                      // Soft glass card. Zone colour shows as a thin
                      // top-edge accent rule + name highlight on hover.
                      // No dot — the map already had the zone colours,
                      // repeating them as dots in the wizard was noise.
                      background: "rgba(255,255,255,0.78)",
                      color: t.text, cursor:"pointer",
                      display:"flex", flexDirection:"column",
                      gap: 6, minHeight: 86,
                      position:"relative", overflow:"hidden",
                      boxShadow: "0 1px 0 rgba(20,18,17,0.04)",
                      transition: "transform 0.12s ease, background 0.15s",
                    }}
                    onMouseEnter={function(e){
                      e.currentTarget.style.background = "#fff";
                      e.currentTarget.style.transform = "translateY(-1px)";
                    }}
                    onMouseLeave={function(e){
                      e.currentTarget.style.background = "rgba(255,255,255,0.78)";
                      e.currentTarget.style.transform = "translateY(0)";
                    }}>
                    {/* Thin top accent rule in zone colour */}
                    <div style={{
                      position:"absolute", top:0, left:0, right:0,
                      height: 3, background: z.color,
                    }}/>
                    <div style={{
                      fontSize: 17, fontWeight: 800,
                      letterSpacing: "-0.02em", lineHeight: 1.15,
                      color: "#14110f",
                      marginTop: 4,
                    }}>{z.name}</div>
                    <div style={{
                      fontSize: 11, color: "rgba(20,18,17,0.5)",
                      fontWeight: 600, letterSpacing: "0.01em",
                    }}>
                      {venueCount} {venueCount === 1 ? "venue" : "venues"}
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {/* Step 1 — pick court — soft-fill cards */}
          {step === 1 && zone && (
            <div>
              <div style={{
                fontSize: 11, color: t.textSecondary, marginBottom: 12,
                display:"flex", alignItems:"center", gap: 6,
              }}>
                <div style={{
                  width: 8, height: 8, borderRadius:"50%", background: zone.color,
                }}/>
                <span>{zone.name}</span>
                <span style={{ color: t.textTertiary }}>·</span>
                <span>{courts.length} {courts.length === 1 ? "venue" : "venues"}</span>
              </div>
              <div style={{ display:"flex", flexDirection:"column", gap: 8 }}>
                {courts.map(function(c){
                  return (
                    <button key={c.name} type="button"
                      onClick={function(){ pickCourt(c); }}
                      style={{
                        textAlign:"left",
                        padding: "14px 16px",
                        borderRadius: 14,
                        background: "rgba(255,255,255,0.78)",
                        border: "none",
                        color: t.text,
                        cursor:"pointer",
                        display:"flex", alignItems:"center", justifyContent:"space-between",
                        gap: 12,
                        boxShadow: "0 1px 0 rgba(20,18,17,0.04)",
                        transition: "transform 0.1s ease, background 0.15s",
                      }}
                      onMouseEnter={function(e){
                        e.currentTarget.style.background = "#fff";
                        e.currentTarget.style.transform = "translateY(-1px)";
                      }}
                      onMouseLeave={function(e){
                        e.currentTarget.style.background = "rgba(255,255,255,0.78)";
                        e.currentTarget.style.transform = "translateY(0)";
                      }}>
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{
                          fontSize: 15, fontWeight: 700,
                          letterSpacing:"-0.015em", lineHeight: 1.25,
                          color: "#14110f",
                          overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap",
                        }}>{c.name}</div>
                        <div style={{
                          fontSize: 11, color: "rgba(20,18,17,0.5)",
                          marginTop: 3, fontWeight: 600, letterSpacing:"0.01em",
                        }}>
                          {c.suburb ? c.suburb + " · " : ""}{c.courts} {c.courts === 1 ? "court" : "courts"}
                        </div>
                      </div>
                      <svg width="16" height="16" viewBox="0 0 18 18" fill="none"
                           stroke="currentColor" strokeWidth="1.7"
                           strokeLinecap="round" strokeLinejoin="round"
                           style={{ color: "rgba(20,18,17,0.35)", flexShrink: 0 }}>
                        <path d="M7 4l5 5-5 5"/>
                      </svg>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Step 2 — pick player(s) */}
          {step === 2 && (
            <div>
              {/* Scope toggle — same underline-tabs pattern as the side panel */}
              <div style={{ display:"flex", gap:18, marginBottom:14, paddingBottom:2 }}>
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
                        borderBottom: "2px solid " + (on ? t.text : "transparent"),
                        color: on ? t.text : t.textTertiary,
                        fontSize: 12, fontWeight: on ? 700 : 500,
                        letterSpacing:"0.01em",
                        cursor: on ? "default" : "pointer",
                        transition:"color 0.15s, border-color 0.15s",
                      }}>
                      {s.label}
                    </button>
                  );
                })}
              </div>

              {/* Selection counter */}
              <div style={{
                fontSize: 11, color: t.textSecondary, marginBottom: 8,
                display:"flex", justifyContent:"space-between", alignItems:"baseline",
              }}>
                <span>{selectedIds.length} of {MAX_SELECT} selected</span>
                <span style={{ color: t.textTertiary }}>Singles or doubles · up to 3</span>
              </div>

              {loading ? (
                <div style={{ padding:"24px 0", textAlign:"center", color: t.textTertiary, fontSize: 12 }}>
                  Loading players…
                </div>
              ) : players.length === 0 ? (
                <div style={{ padding:"24px 0", textAlign:"center", color: t.textTertiary, fontSize: 12 }}>
                  No players found {scope === "zone" ? "in this zone" : "yet"}.
                  {scope === "zone" && (
                    <div style={{ marginTop:8 }}>
                      <button type="button" onClick={function(){ setScope("everywhere"); setSelectedIds([]); }}
                        style={{
                          background:"transparent", border:"none", color: t.accent,
                          fontSize: 12, fontWeight: 700, cursor:"pointer",
                        }}>
                        Try Everywhere →
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <div style={{ display:"flex", flexDirection:"column", gap: 6 }}>
                  {players.map(function(p){
                    var isSel = selectedIds.indexOf(p.id) !== -1;
                    var disabled = !isSel && selectedIds.length >= MAX_SELECT;
                    return (
                      <button key={p.id} type="button"
                        onClick={function(){ togglePlayer(p); }}
                        disabled={disabled}
                        style={{
                          textAlign:"left",
                          padding:"10px 14px",
                          borderRadius: 14,
                          background: isSel ? t.accentSubtle : t.bgTertiary,
                          border:"none",
                          cursor: disabled ? "not-allowed" : "pointer",
                          opacity: disabled ? 0.45 : 1,
                          display:"flex", alignItems:"center", gap: 12,
                          transition: "background 0.15s, transform 0.1s",
                        }}>
                        {/* Avatar with selection ring (instead of a
                            separate checkbox — selection transforms
                            the avatar itself). */}
                        <div style={{
                          width: 48, height: 48,
                          padding: 3,
                          borderRadius:"50%",
                          background: isSel ? t.accent : "transparent",
                          flexShrink: 0,
                          transition: "background 0.15s",
                        }}>
                          <div style={{
                            width:"100%", height:"100%",
                            borderRadius:"50%",
                            overflow:"hidden",
                            background: t.bgCard,
                            display:"flex", alignItems:"center", justifyContent:"center",
                          }}>
                            <PlayerAvatar size={42} profile={p}/>
                          </div>
                        </div>
                        <div style={{ flex:1, minWidth:0 }}>
                          <div style={{
                            fontSize: 14, fontWeight: 700,
                            color: t.text,
                            letterSpacing:"-0.01em", lineHeight: 1.2,
                            overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap",
                          }}>{p.name || p.username || p.full_name || "Player"}</div>
                          <div style={{
                            fontSize: 11, color: t.textSecondary,
                            marginTop: 4,
                            display:"flex", gap: 6, alignItems:"center", flexWrap:"wrap",
                          }}>
                            {(p.skill || p.skill_level) && (
                              <span style={{
                                padding: "1px 7px", borderRadius: 8,
                                background: t.bg, color: t.textSecondary,
                                fontSize: 10, fontWeight: 700, letterSpacing:"0.02em",
                              }}>{p.skill || p.skill_level}</span>
                            )}
                            {p.playsHere && (
                              <span style={{
                                fontSize: 9, fontWeight:800, color: t.accent,
                                letterSpacing:"0.06em",
                                textTransform:"uppercase",
                              }}>· Plays here</span>
                            )}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Step 3 — confirm + send */}
          {step === 3 && (
            <div style={{ display:"flex", flexDirection:"column", gap: 14 }}>
              {/* Venue summary */}
              <div style={{
                padding:"12px 14px", borderRadius: 10,
                background: t.bgTertiary,
                display:"flex", flexDirection:"column", gap: 6,
              }}>
                <div style={{
                  fontSize: 9, fontWeight: 800, letterSpacing: "0.14em",
                  textTransform:"uppercase", color: t.textTertiary,
                }}>Venue</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: t.text, letterSpacing:"-0.01em" }}>
                  {courtName || (zone && zone.name)}
                </div>
                <div style={{ fontSize: 11, color: t.textSecondary }}>
                  {zone && zone.name}{courtName ? " · " + courtName : ""}
                </div>
              </div>

              {/* Recipients */}
              <div>
                <div style={{
                  fontSize: 9, fontWeight: 800, letterSpacing: "0.14em",
                  textTransform:"uppercase", color: t.textTertiary, marginBottom: 8,
                }}>
                  {selectedPlayers.length === 1 ? "Sending to" : "Sending to · group"}
                </div>
                <div style={{ display:"flex", flexDirection:"column", gap: 4 }}>
                  {selectedPlayers.map(function(p){
                    return (
                      <div key={p.id} style={{
                        display:"flex", alignItems:"center", gap: 10,
                        padding:"6px 0",
                      }}>
                        <PlayerAvatar size={28} profile={p}/>
                        <span style={{ fontSize: 13, fontWeight: 600, color: t.text }}>
                          {p.name || p.username || p.full_name || "Player"}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Message preview */}
              <div>
                <div style={{
                  fontSize: 9, fontWeight: 800, letterSpacing: "0.14em",
                  textTransform:"uppercase", color: t.textTertiary, marginBottom: 8,
                }}>Message preview</div>
                <div style={{
                  padding:"10px 12px", borderRadius: 10,
                  background: t.bgTertiary,
                  fontSize: 13, lineHeight: 1.45, color: t.text,
                }}>
                  {previewInviteText({ partners: selectedPlayers, court: courtName, zone: zone })}
                </div>
                <div style={{ fontSize: 10.5, color: t.textTertiary, marginTop: 6 }}>
                  You can edit before sending.
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer — step-dependent action */}
        {step === 2 && (
          <div style={{
            padding: "12px 16px",
            borderTop: "1px solid " + t.border,
            display:"flex", gap:8, justifyContent:"space-between", alignItems:"center",
          }}>
            <span style={{ fontSize: 11, color: t.textSecondary }}>
              {selectedIds.length === 0 ? "Pick at least one" : selectedIds.length + " selected"}
            </span>
            <button type="button" onClick={confirmPlayers}
              disabled={selectedIds.length === 0}
              style={{
                padding:"10px 22px", borderRadius: 10,
                background: selectedIds.length ? t.text : t.border,
                color: selectedIds.length ? t.bg : t.textTertiary,
                border:"none",
                fontSize: 13, fontWeight: 800, letterSpacing:"0.02em",
                cursor: selectedIds.length ? "pointer" : "not-allowed",
                transition: "background 0.15s",
              }}>
              Continue →
            </button>
          </div>
        )}
        {step === 3 && (
          <div style={{
            padding: "12px 16px",
            borderTop: "1px solid " + t.border,
            display:"flex", gap:8, justifyContent:"flex-end",
          }}>
            <button type="button" onClick={cancel}
              style={{
                padding:"10px 18px", borderRadius: 10,
                background:"transparent", border:"1px solid "+t.border,
                color:t.text, fontSize: 13, fontWeight: 700, cursor:"pointer",
              }}>
              Cancel
            </button>
            <button type="button" onClick={sendInvite}
              style={{
                padding:"10px 22px", borderRadius: 10,
                background: t.accent,
                color: t.accentText || "#fff", border:"none",
                fontSize: 13, fontWeight: 800, letterSpacing:"0.02em",
                cursor:"pointer",
                boxShadow:"0 2px 6px rgba(20,18,17,0.18)",
              }}>
              Send Invite
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── helpers ──────────────────────────────────────────────────────────

function previewInviteText({ partners, court, zone }){
  if(!partners || !partners.length) return "";
  var venue = court || (zone && zone.name) || "";
  if(partners.length === 1){
    var who = partners[0].name || partners[0].username || partners[0].full_name || "there";
    return "Hey " + firstName(who) + ", up for a hit at " + venue + " sometime this week?";
  }
  var names = partners.map(function(p){ return firstName(p.name || p.username || p.full_name || "there"); });
  var joined = names.length === 2
    ? names.join(" and ")
    : names.slice(0, -1).join(", ") + ", and " + names[names.length - 1];
  return "Hey " + joined + " — keen for doubles at " + venue + " sometime this week?";
}

function buildInviteDraft({ partners, court, zone }){
  return previewInviteText({ partners: partners, court: court, zone: zone });
}

function firstName(name){
  if(!name) return "";
  return String(name).trim().split(/\s+/)[0];
}

// Convert a #rrggbb hex into rgba(...) with the given alpha.
// Used for the zone-tile soft tinted backgrounds — taking each zone's
// own colour and dialing it back to ~10% opacity gives the modern
// "calm pastel chip" look without hardcoding 6 separate fills.
function hexToRgba(hex, alpha){
  if(!hex) return "rgba(0,0,0," + alpha + ")";
  var h = hex.replace("#", "");
  if(h.length === 3) h = h.split("").map(function(c){ return c + c; }).join("");
  var r = parseInt(h.slice(0,2), 16);
  var g = parseInt(h.slice(2,4), 16);
  var b = parseInt(h.slice(4,6), 16);
  if(isNaN(r) || isNaN(g) || isNaN(b)) return "rgba(0,0,0," + alpha + ")";
  return "rgba(" + r + "," + g + "," + b + "," + alpha + ")";
}
