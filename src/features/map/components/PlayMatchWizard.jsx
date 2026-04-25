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

import { useEffect, useRef, useState } from "react";
import { ZONES } from "../data/zones.js";
import { courtsInZone } from "../data/courts.js";
import { fetchPlayersInZone, fetchPlayersAtCourt, scorePlayerForCourt } from "../services/mapService.js";
import PlayerAvatar from "../../../components/ui/PlayerAvatar.jsx";
import { NAV_ICONS } from "../../../lib/constants/navIcons.jsx";
import { track } from "../../../lib/analytics.js";

// Three steps now: zone → court → player(s). The old step-4 confirm
// screen was dropped because it just echoed the draft the DM composer
// already shows. Council call: trust the user; the DM is the natural
// confirmation. Also harmonises with the side-panel "Message" path
// which goes straight to the DM with no extra confirm.
var TOTAL_STEPS = 3;

// Day-of-week chip labels — Mon-Sun. Match what people actually
// type when planning ("Sat" not "Saturday") so the rendered draft
// reads naturally.
var DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
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
  // When? — drives the "this Saturday" / "Sat or Sun" wording in the
  // pre-filled invite. Three modes:
  //   "week"     — default, "sometime this week"
  //   "weekend"  — "this weekend"
  //   "days"     — pick specific day-of-week chips (multi-select)
  var [whenMode, setWhenMode] = useState("week");
  var [pickedDays, setPickedDays] = useState([]); // ["Mon","Tue",...]

  // Tracks whether a mouse-press started on the backdrop. Used to
  // distinguish "user clicked the dim area" from "user drag-selected
  // text inside the modal and overshot". See backdrop onMouseDown +
  // onClick below.
  var backdropDownRef = useRef(false);

  // Reset everything when the wizard opens. Lock body scroll while up.
  useEffect(function(){
    if(!open) return;
    var startStep = initialZoneId ? 1 : 0;
    setStep(startStep);
    setZoneId(initialZoneId || null);
    setCourtName(null);
    setSelectedIds([]);
    setScope("zone");
    setWhenMode("week");
    setPickedDays([]);
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
    var viewerId = authUser && authUser.id ? authUser.id : null;
    var blocked  = Array.isArray(blockedUserIds) ? blockedUserIds : [];
    // Always exclude the viewer themselves — you don't invite
    // yourself to a match. fetchPlayersInZone takes (zoneId, limit,
    // excludeIds); fetchPlayersAtCourt takes (courtName, viewer,
    // limit, excludeIds) — different shapes, mind the params.
    var excludeForZone  = viewerId ? blocked.concat([viewerId]) : blocked;
    var zoneArg         = scope === "everywhere" ? null : zoneId;
    var zoneReq         = fetchPlayersInZone(zoneArg, 60, excludeForZone);
    // fetchPlayersAtCourt extracts .id from its viewer arg, so pass
    // the whole authUser object (not just the id string).
    var courtReq        = courtName
      ? fetchPlayersAtCourt(courtName, authUser || null, 40, blocked)
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
      // Defensive: drop the viewer in case either service slips them
      // through. You should never see yourself in your own invite list.
      var arr2 = Object.values(byId).filter(function(p){
        return !viewerId || p.id !== viewerId;
      });
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
  function sendInvite(){
    var partners = selectedIds.map(function(id){
      return players.find(function(p){ return p.id === id; });
    }).filter(Boolean);
    if(!partners.length) return;
    // Funnel: emit player_picked too so we keep the existing
    // step-completion event even though the dedicated confirm step
    // is gone.
    track("play_match_player_picked", { player_count: partners.length, scope: scope });
    var zone = ZONES.find(function(z){ return z.id === zoneId; });
    var when = resolveWhen(whenMode, pickedDays);
    var ctx = {
      venue: courtName || (zone && zone.name) || "",
      zoneId: zoneId,
      courtName: courtName,
      when: when, // structured for downstream consumers
      // Friendly pre-filled draft. The DM hook accepts a `draft` and
      // pre-populates the composer.
      draft: buildInviteDraft({ partners: partners, court: courtName, zone: zone, when: when }),
    };
    track("play_match_invite_sent", {
      zone_id: zoneId, court_name: courtName,
      partner_count: partners.length, scope: scope,
      when_mode: whenMode,
      day_count: whenMode === "days" ? pickedDays.length : null,
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
  var pickedCourt = courtName ? courts.find(function(c){ return c.name === courtName; }) : null;

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
      // Backdrop dismiss — track that the mousedown started on the
      // backdrop too, otherwise drag-selecting text inside the modal
      // and releasing on the backdrop fires a click event on the
      // common ancestor (this backdrop) and dismisses the wizard.
      // The bug: user drags to highlight text, overshoots, modal
      // disappears with their work. Fix: only close if the click
      // genuinely STARTED on the backdrop.
      onMouseDown={function(e){ backdropDownRef.current = e.target === e.currentTarget; }}
      onClick={function(e){
        if(backdropDownRef.current && e.target === e.currentTarget) cancel();
        backdropDownRef.current = false;
      }}>
      <div style={{
        // Translucent glass card — the boxy bordered modal is gone.
        // Content is the design; chrome is invisible. Theme-aware
        // bg so the wizard is readable on any palette (audit fix:
        // rgba(255,255,255,0.96) was hardcoded white and caused text
        // to wash out on dark themes).
        background: hexToRgba(t.bgCard, 0.96),
        WebkitBackdropFilter: "blur(40px) saturate(140%)",
        backdropFilter: "blur(40px) saturate(140%)",
        color: t.text,
        borderRadius: 22,
        boxShadow: "0 24px 60px rgba(20,18,17,0.28)",
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
            background: hexToRgba(t.bgCard, 0.78),
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
            background: hexToRgba(t.bgCard, 0.78),
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
          {[0,1,2].map(function(i){
            return (
              <div key={i} style={{
                width: 28, height: 3, borderRadius: 2,
                background: i <= step ? t.text : t.border,
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
            color: t.textTertiary, lineHeight: 1,
          }}>
            Step {step + 1} of {TOTAL_STEPS}
          </div>
          <div style={{
            fontSize: 22, fontWeight: 900,
            letterSpacing: "-0.025em", lineHeight: 1.15,
            color: t.text,
            marginTop: 8,
          }}>
            {step === 0 && "Where do you want to play?"}
            {step === 1 && "Which court?"}
            {step === 2 && "Who do you want to play with?"}
          </div>
        </div>

        {/* Body */}
        <div style={{ flex:1, overflowY:"auto", padding:"14px 22px 22px" }}>

          {/* Step 0 — pick zone — corner color bloom + bold typography.
              Each card has a soft radial gradient of the zone colour
              radiating from its top-right corner — the colour becomes
              the card's atmosphere instead of a label. Drops the
              venue count subtitle so the zone name is the only focal
              point. */}
          {step === 0 && (
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap: 10 }}>
              {ZONES.map(function(z){
                return (
                  <button key={z.id} type="button"
                    onClick={function(){ pickZone(z); }}
                    style={{
                      textAlign:"left",
                      padding: "14px 14px 16px",
                      borderRadius: 16,
                      border: "none",
                      background: hexToRgba(t.bgCard, 0.85),
                      color: t.text,
                      cursor:"pointer",
                      display:"flex", alignItems:"center",
                      minHeight: 78,
                      position:"relative", overflow:"hidden",
                      transition: "transform 0.14s ease",
                    }}
                    onMouseEnter={function(e){
                      e.currentTarget.style.transform = "translateY(-2px)";
                      var bloom = e.currentTarget.querySelector(".cs-zone-bloom");
                      if(bloom) bloom.style.opacity = "1";
                    }}
                    onMouseLeave={function(e){
                      e.currentTarget.style.transform = "translateY(0)";
                      var bloom = e.currentTarget.querySelector(".cs-zone-bloom");
                      if(bloom) bloom.style.opacity = "0.7";
                    }}>
                    {/* Corner bloom — radial gradient of zone colour
                        from the top-right corner. The card's identity
                        in atmospheric form. */}
                    <div className="cs-zone-bloom" style={{
                      position:"absolute", inset:0,
                      background: "radial-gradient(circle at 100% 0%, " +
                        hexToRgba(z.color, 0.55) + " 0%, " +
                        hexToRgba(z.color, 0.18) + " 35%, " +
                        "transparent 75%)",
                      opacity: 0.7,
                      transition: "opacity 0.18s ease",
                      pointerEvents:"none",
                    }}/>
                    {/* Big bold zone name — only focal point */}
                    <div style={{
                      position:"relative",
                      fontSize: 16, fontWeight: 900,
                      letterSpacing: "-0.02em", lineHeight: 1.1,
                      color: t.text,
                    }}>{z.name}</div>
                  </button>
                );
              })}
            </div>
          )}

          {/* Step 1 — pick court — soft-fill cards */}
          {step === 1 && zone && (
            <div>
              <div style={{
                fontSize: 11, color: t.textSecondary, marginBottom: 4,
                display:"flex", alignItems:"center", gap: 6,
              }}>
                <div style={{
                  width: 8, height: 8, borderRadius:"50%", background: zone.color,
                }}/>
                <span>{zone.name}</span>
                <span style={{ color: t.textTertiary }}>·</span>
                <span>{courts.length} {courts.length === 1 ? "venue" : "venues"}</span>
              </div>
              {/* (Booking-link affordance moved to step 3 — by then
                  the user has chosen a venue and the "check times"
                  context is meaningful. In step 2 it was premature.) */}
              <div style={{ display:"flex", flexDirection:"column", gap: 8 }}>
                {courts.map(function(c){
                  return (
                    <div key={c.name}
                      role="button" tabIndex={0}
                      onClick={function(){ pickCourt(c); }}
                      onKeyDown={function(e){
                        if(e.key === "Enter" || e.key === " "){
                          e.preventDefault();
                          pickCourt(c);
                        }
                      }}
                      style={{
                        position:"relative",
                        textAlign:"left",
                        padding: "14px 16px",
                        borderRadius: 14,
                        background: hexToRgba(t.bgCard, 0.78),
                        color: t.text,
                        cursor:"pointer",
                        display:"flex", alignItems:"center", justifyContent:"space-between",
                        gap: 12,
                        transition: "transform 0.1s ease, background 0.15s",
                      }}
                      onMouseEnter={function(e){
                        e.currentTarget.style.background = t.bgCard;
                        e.currentTarget.style.transform = "translateY(-1px)";
                      }}
                      onMouseLeave={function(e){
                        e.currentTarget.style.background = hexToRgba(t.bgCard, 0.78);
                        e.currentTarget.style.transform = "translateY(0)";
                      }}>
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{
                          fontSize: 15, fontWeight: 700,
                          letterSpacing:"-0.015em", lineHeight: 1.25,
                          color: t.text,
                          overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap",
                        }}>{c.name}</div>
                        {/* Description: address if we have it, else
                            suburb. Address is more specific so it
                            wins. Then the court count. */}
                        <div style={{
                          fontSize: 11, color: t.textSecondary,
                          marginTop: 3, fontWeight: 600, letterSpacing:"0.01em",
                          overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap",
                        }}>
                          {(c.address || c.suburb) ? (c.address || c.suburb) + " · " : ""}
                          {c.courts} {c.courts === 1 ? "court" : "courts"}
                        </div>
                      </div>
                      {/* Subtle right-pointing chevron — visual cue
                          that the row advances. Booking link moved to
                          step 3 where venue context exists. */}
                      <svg width="16" height="16" viewBox="0 0 18 18" fill="none"
                           stroke="currentColor" strokeWidth="1.7"
                           strokeLinecap="round" strokeLinejoin="round"
                           style={{ color: t.textTertiary, flexShrink: 0 }}>
                        <path d="M7 4l5 5-5 5"/>
                      </svg>
                    </div>
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

              {/* When? — chip group for the day/range, drives the
                  pre-filled draft wording. Optional; defaults to
                  "this week". Three modes: week / weekend / pick days.
                  "Pick days" expands a Mon-Sun multi-select. */}
              {!loading && players.length > 0 && (
                <div style={{ marginTop: 18 }}>
                  <div style={{
                    fontSize: 9, fontWeight: 800, letterSpacing: "0.14em",
                    textTransform: "uppercase", color: t.textTertiary,
                    marginBottom: 8,
                  }}>
                    When?
                  </div>
                  <div style={{ display:"flex", gap: 6, flexWrap:"wrap" }}>
                    {[
                      { id:"week",    label:"This week" },
                      { id:"weekend", label:"Weekend" },
                      { id:"days",    label:"Pick days" },
                    ].map(function(opt){
                      var on = whenMode === opt.id;
                      return (
                        <button key={opt.id} type="button"
                          onClick={function(){
                            setWhenMode(opt.id);
                            if(opt.id !== "days") setPickedDays([]);
                          }}
                          style={{
                            padding: "8px 14px", borderRadius: 999,
                            background: on ? t.text : hexToRgba(t.bgCard, 0.78),
                            color: on ? t.bg : t.textSecondary,
                            border:"none", cursor:"pointer",
                            fontSize: 12, fontWeight: 700,
                            letterSpacing:"0.01em",
                            transition: "background 0.15s, color 0.15s",
                          }}>
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>

                  {whenMode === "days" && (
                    <div style={{
                      display:"flex", gap: 5, flexWrap:"wrap",
                      marginTop: 10,
                    }}>
                      {DAYS.map(function(d){
                        var on = pickedDays.indexOf(d) !== -1;
                        return (
                          <button key={d} type="button"
                            onClick={function(){
                              setPickedDays(function(prev){
                                return prev.indexOf(d) !== -1
                                  ? prev.filter(function(x){ return x !== d; })
                                  : prev.concat([d]);
                              });
                            }}
                            style={{
                              minWidth: 38,
                              padding: "7px 0", borderRadius: 10,
                              background: on ? t.accent : hexToRgba(t.bgCard, 0.78),
                              color: on ? (t.accentText || "#fff") : t.textSecondary,
                              border:"none", cursor:"pointer",
                              fontSize: 11, fontWeight: 800,
                              letterSpacing:"0.04em",
                              transition: "background 0.15s, color 0.15s",
                            }}>
                            {d}
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {/* Booking-link slot — venue is locked in by now
                      so "check times at <venue>" reads naturally and
                      can directly inform the day choice above. */}
                  {pickedCourt && pickedCourt.bookingUrl && (
                    <a href={pickedCourt.bookingUrl}
                      target="_blank" rel="noopener noreferrer"
                      style={{
                        marginTop: 12,
                        padding: "10px 12px",
                        borderRadius: 12,
                        background: hexToRgba(t.bgCard, 0.78),
                        color: t.text, textDecoration:"none",
                        display:"flex", alignItems:"center", gap: 10,
                        transition: "background 0.15s",
                      }}
                      onMouseEnter={function(e){ e.currentTarget.style.background = t.bgCard; }}
                      onMouseLeave={function(e){ e.currentTarget.style.background = hexToRgba(t.bgCard, 0.78); }}>
                      <div style={{
                        width: 32, height: 32, borderRadius: 10,
                        background: hexToRgba(t.accent, 0.14),
                        color: t.accent, flexShrink: 0,
                        display:"flex", alignItems:"center", justifyContent:"center",
                      }}>
                        <svg width="14" height="14" viewBox="0 0 18 18" fill="none"
                             stroke="currentColor" strokeWidth="1.8"
                             strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <path d="M11 4h3v3M14 4l-6 6M8 5H5v8h8v-3"/>
                        </svg>
                      </div>
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{
                          fontSize: 12.5, fontWeight: 700, color: t.text,
                          letterSpacing: "-0.01em",
                          overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap",
                        }}>
                          Check times at {pickedCourt.name}
                        </div>
                        <div style={{
                          fontSize: 10, color: t.textTertiary, marginTop: 2,
                          letterSpacing:"0.04em", textTransform:"uppercase", fontWeight:700,
                        }}>
                          Opens venue's booking site
                        </div>
                      </div>
                    </a>
                  )}

                  {/* Live draft preview — message-bubble style so the
                      user sees EXACTLY what lands in the DM. Updates
                      as they tweak partners / when. */}
                  {selectedIds.length > 0 && (
                    <div style={{ marginTop: 14 }}>
                      <div style={{
                        fontSize: 9, fontWeight: 800, letterSpacing: "0.14em",
                        textTransform: "uppercase", color: t.textTertiary,
                        marginBottom: 6,
                      }}>
                        Message preview
                      </div>
                      <div style={{
                        padding: "12px 14px",
                        borderRadius: "16px 16px 16px 4px",
                        background: hexToRgba(t.accent, 0.10),
                        color: t.text,
                        fontSize: 13.5, lineHeight: 1.45,
                        letterSpacing: "-0.005em",
                        maxWidth: "95%",
                      }}>
                        {previewInviteText({
                          partners: selectedIds.map(function(id){ return players.find(function(p){ return p.id === id; }); }).filter(Boolean),
                          court: courtName,
                          zone: zone,
                          when: resolveWhen(whenMode, pickedDays),
                        })}
                      </div>
                      <div style={{
                        fontSize: 10, color: t.textTertiary,
                        marginTop: 6, letterSpacing:"0.02em",
                      }}>
                        You can edit before sending in the next screen.
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

        </div>

        {/* Footer — Send invite directly from step 2 (player picker).
            The old step 3 confirm screen was dropped: the DM composer
            already shows the same draft in editable form, so an extra
            preview screen is dead weight. Council call. */}
        {step === 2 && (
          <div style={{
            padding: "12px 16px",
            borderTop: "1px solid " + t.border,
            display:"flex", gap:8, justifyContent:"space-between", alignItems:"center",
          }}>
            <span style={{ fontSize: 11, color: t.textSecondary }}>
              {selectedIds.length === 0
                ? "Pick at least one"
                : (selectedIds.length === 1 ? "1 player selected" : selectedIds.length + " players selected")}
            </span>
            <button type="button" onClick={sendInvite}
              disabled={selectedIds.length === 0}
              style={{
                padding:"11px 22px", borderRadius: 10,
                background: selectedIds.length ? t.accent : t.border,
                color: selectedIds.length ? (t.accentText || "#fff") : t.textTertiary,
                border:"none",
                fontSize: 13, fontWeight: 800, letterSpacing:"0.02em",
                cursor: selectedIds.length ? "pointer" : "not-allowed",
                boxShadow: selectedIds.length ? "0 2px 6px rgba(20,18,17,0.18)" : "none",
                transition: "background 0.15s, box-shadow 0.15s",
              }}>
              Send invite →
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── helpers ──────────────────────────────────────────────────────────

function previewInviteText({ partners, court, zone, when }){
  if(!partners || !partners.length) return "";
  var venue = court || (zone && zone.name) || "";
  var phrase = whenPhrase(when);
  if(partners.length === 1){
    var who = partners[0].name || partners[0].username || partners[0].full_name || "there";
    return "Hey " + firstName(who) + ", up for a hit at " + venue + " " + phrase + "?";
  }
  var names = partners.map(function(p){ return firstName(p.name || p.username || p.full_name || "there"); });
  var joined = names.length === 2
    ? names.join(" and ")
    : names.slice(0, -1).join(", ") + ", and " + names[names.length - 1];
  return "Hey " + joined + " — keen for doubles at " + venue + " " + phrase + "?";
}

function buildInviteDraft({ partners, court, zone, when }){
  return previewInviteText({ partners: partners, court: court, zone: zone, when: when });
}

// Resolve the chip selection into a structured value the rest of the
// pipeline (draft text, ctx, analytics) can consume.
function resolveWhen(mode, days){
  if(mode === "weekend") return { kind: "weekend" };
  if(mode === "days" && Array.isArray(days) && days.length){
    return { kind: "days", days: days.slice() };
  }
  return { kind: "week" }; // default
}

// Render a "when" structure into the natural-language phrase that
// fits inside the invite sentence ("...up for a hit at X <phrase>?").
function whenPhrase(when){
  if(!when || when.kind === "week") return "sometime this week";
  if(when.kind === "weekend")       return "this weekend";
  if(when.kind === "days" && when.days && when.days.length){
    var d = sortDaysOfWeek(when.days);
    if(d.length === 1) return "this " + d[0];
    if(isContiguous(d)) return d[0] + "–" + d[d.length - 1]; // range
    if(d.length === 2)  return d[0] + " or " + d[1];
    return d.slice(0, -1).join(", ") + " or " + d[d.length - 1];
  }
  return "sometime this week";
}

function sortDaysOfWeek(arr){
  var order = { Mon:0, Tue:1, Wed:2, Thu:3, Fri:4, Sat:5, Sun:6 };
  return arr.slice().sort(function(a, b){ return (order[a]||0) - (order[b]||0); });
}

function isContiguous(sortedDays){
  if(sortedDays.length < 3) return false; // 1-2 days don't read as a "range"
  var order = { Mon:0, Tue:1, Wed:2, Thu:3, Fri:4, Sat:5, Sun:6 };
  for(var i = 1; i < sortedDays.length; i++){
    if(order[sortedDays[i]] !== order[sortedDays[i-1]] + 1) return false;
  }
  return true;
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
