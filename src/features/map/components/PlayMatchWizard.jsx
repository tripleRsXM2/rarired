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
        position:"fixed", inset:0, zIndex: 3000,
        background:"rgba(20,18,17,0.55)",
        display:"flex", alignItems:"center", justifyContent:"center",
        padding: 12,
      }}
      onClick={function(e){ if(e.target === e.currentTarget) cancel(); }}>
      <div style={{
        background: t.bgCard,
        color: t.text,
        border: "1px solid " + t.border,
        borderRadius: 16,
        boxShadow: "0 24px 60px rgba(20,18,17,0.32)",
        width: "100%",
        maxWidth: 460,
        maxHeight: "calc(100dvh - 24px)",
        display: "flex", flexDirection: "column",
        overflow: "hidden",
      }}>

        {/* Header */}
        <div style={{
          display:"flex", alignItems:"center", gap:8,
          padding:"14px 16px",
          borderBottom: "1px solid " + t.border,
        }}>
          <button type="button" onClick={back} aria-label={step === 0 ? "Cancel" : "Back"}
            style={{
              width:32, height:32, borderRadius:8,
              background:"transparent", border:"none", cursor:"pointer",
              color: t.text,
              display:"flex", alignItems:"center", justifyContent:"center",
            }}>
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none"
                 stroke="currentColor" strokeWidth="1.7"
                 strokeLinecap="round" strokeLinejoin="round">
              <path d="M11 14L6 9l5-5"/>
            </svg>
          </button>
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{
              fontSize: 9, fontWeight: 800, letterSpacing: "0.14em",
              textTransform: "uppercase", color: t.textTertiary, lineHeight: 1,
            }}>
              Step {step + 1} of {TOTAL_STEPS}
            </div>
            <div style={{
              fontSize: 16, fontWeight: 800, color: t.text,
              letterSpacing: "-0.01em", marginTop: 4, lineHeight: 1.2,
            }}>
              {step === 0 && "Where do you want to play?"}
              {step === 1 && "Which court?"}
              {step === 2 && "Who do you want to play with?"}
              {step === 3 && "Send invite"}
            </div>
          </div>
          <button type="button" onClick={cancel} aria-label="Close"
            style={{
              width:32, height:32, borderRadius:8,
              background:"transparent", border:"none", cursor:"pointer",
              color: t.textTertiary, fontSize: 18,
            }}>✕</button>
        </div>

        {/* Step progress bar */}
        <div style={{ display:"flex", gap:4, padding:"10px 16px 0" }}>
          {[0,1,2,3].map(function(i){
            return (
              <div key={i} style={{
                flex:1, height:3, borderRadius:2,
                background: i <= step ? t.accent : t.border,
                transition: "background 0.18s",
              }}/>
            );
          })}
        </div>

        {/* Body */}
        <div style={{ flex:1, overflowY:"auto", padding:"16px" }}>

          {/* Step 0 — pick zone */}
          {step === 0 && (
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap: 10 }}>
              {ZONES.map(function(z){
                return (
                  <button key={z.id} type="button"
                    onClick={function(){ pickZone(z); }}
                    style={{
                      textAlign:"left", padding:"14px 14px 12px", borderRadius: 12,
                      border: "1px solid " + t.border,
                      borderLeft: "4px solid " + z.color,
                      background: t.bgCard, cursor:"pointer",
                      display:"flex", flexDirection:"column", gap: 6,
                      transition: "border-color 0.15s",
                    }}
                    onMouseEnter={function(e){ e.currentTarget.style.borderColor = z.color; }}
                    onMouseLeave={function(e){ e.currentTarget.style.borderColor = t.border; e.currentTarget.style.borderLeftColor = z.color; }}>
                    <div style={{
                      fontSize: 9, fontWeight: 800, letterSpacing: "0.14em",
                      textTransform: "uppercase", color: z.color,
                    }}>Zone {z.num}</div>
                    <div style={{
                      fontSize: 14, fontWeight: 800, color: t.text,
                      letterSpacing: "-0.02em", lineHeight: 1.15,
                    }}>{z.name}</div>
                  </button>
                );
              })}
            </div>
          )}

          {/* Step 1 — pick court */}
          {step === 1 && zone && (
            <div>
              <div style={{ fontSize: 11, color: t.textSecondary, marginBottom: 10 }}>
                {courts.length} {courts.length === 1 ? "venue" : "venues"} in {zone.name}
              </div>
              <div style={{ display:"flex", flexDirection:"column", gap: 2 }}>
                {courts.map(function(c){
                  return (
                    <button key={c.name} type="button"
                      onClick={function(){ pickCourt(c); }}
                      style={{
                        textAlign:"left", padding:"10px 12px", borderRadius: 8,
                        border:"none", background:"transparent",
                        color: t.text, fontSize: 13, fontWeight: 600,
                        letterSpacing: "-0.01em", cursor:"pointer",
                        display:"flex", alignItems:"center", justifyContent:"space-between",
                        gap: 10, transition: "background 0.12s",
                      }}
                      onMouseEnter={function(e){ e.currentTarget.style.background = t.bgTertiary; }}
                      onMouseLeave={function(e){ e.currentTarget.style.background = "transparent"; }}>
                      <span style={{ overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                        {c.name}
                      </span>
                      <span style={{ flexShrink:0, color: t.textTertiary, fontSize: 11, fontWeight: 600 }}>
                        {c.courts} {c.courts === 1 ? "court" : "courts"}
                      </span>
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
                <div style={{ display:"flex", flexDirection:"column", gap: 2 }}>
                  {players.map(function(p){
                    var isSel = selectedIds.indexOf(p.id) !== -1;
                    var disabled = !isSel && selectedIds.length >= MAX_SELECT;
                    return (
                      <button key={p.id} type="button"
                        onClick={function(){ togglePlayer(p); }}
                        disabled={disabled}
                        style={{
                          textAlign:"left",
                          padding:"8px 10px", borderRadius: 10,
                          background: isSel ? t.accentSubtle : "transparent",
                          border:"none", cursor: disabled ? "not-allowed" : "pointer",
                          opacity: disabled ? 0.4 : 1,
                          display:"flex", alignItems:"center", gap: 10,
                          transition: "background 0.12s",
                        }}>
                        <PlayerAvatar size={32} profile={p}/>
                        <div style={{ flex:1, minWidth:0 }}>
                          <div style={{
                            fontSize: 13, fontWeight: 700,
                            color: isSel ? t.accent : t.text,
                            letterSpacing:"-0.01em",
                            overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap",
                          }}>{p.full_name || p.username || "Player"}</div>
                          <div style={{
                            fontSize: 11, color: t.textTertiary, marginTop: 1,
                            display:"flex", gap: 6, alignItems:"center",
                          }}>
                            {p.skill_level && <span>{p.skill_level}</span>}
                            {p.playsHere && (
                              <span style={{
                                fontSize:9, fontWeight:800, color:"#fff",
                                background: t.accent, padding:"1px 6px",
                                borderRadius:10, letterSpacing:"0.04em",
                              }}>PLAYS HERE</span>
                            )}
                          </div>
                        </div>
                        {/* Selection check */}
                        <span style={{
                          width:18, height:18, borderRadius:"50%",
                          border:"1.5px solid "+(isSel ? t.accent : t.border),
                          background: isSel ? t.accent : "transparent",
                          flexShrink:0, position:"relative",
                          display:"flex", alignItems:"center", justifyContent:"center",
                          color:"#fff", fontSize: 11, fontWeight: 900,
                        }}>{isSel ? "✓" : ""}</span>
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
                          {p.full_name || p.username || "Player"}
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
    var who = partners[0].full_name || partners[0].username || "there";
    return "Hey " + firstName(who) + ", up for a hit at " + venue + " sometime this week?";
  }
  var names = partners.map(function(p){ return firstName(p.full_name || p.username || "there"); });
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
