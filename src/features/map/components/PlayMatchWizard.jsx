// src/features/map/components/PlayMatchWizard.jsx
//
// Guided 4-step "Play Match" flow opened from the orange CTA at the
// bottom-centre of the map. Council scope:
//   1. Pick a zone (6 colored cards)
//   2. Pick a court (flat list of venues in that zone)
//   3. Pick player(s) — In zone / Everywhere toggle, multi-select up to 3
//   4. Confirm + send invite (pre-filled DM with venue context)
//
// Phase 2a (this file): scaffolding + steps 1 and 2. Step 3+4 are
// stubbed with a "Coming soon" panel so the flow feels real end-to-end
// while we wire the player picker + send-invite next.
//
// Reuses ZONES, courtsInZone(), and the analytics track() helper so we
// don't fork logic. Each step transition fires its own event so we can
// see drop-off in the funnel:
//   play_match_step_entered { step }
//   play_match_zone_picked  { zone_id }
//   play_match_court_picked { zone_id, court_name }
//   play_match_cancelled    { step, last_completed }

import { useEffect, useState } from "react";
import { ZONES } from "../data/zones.js";
import { courtsInZone } from "../data/courts.js";
import { NAV_ICONS } from "../../../lib/constants/navIcons.jsx";
import { track } from "../../../lib/analytics.js";

var TOTAL_STEPS = 4;

export default function PlayMatchWizard({ t, open, onClose, onComplete, initialZoneId }){
  // 0 = pick zone, 1 = pick court, 2 = pick players, 3 = confirm + send.
  // initialZoneId lets the wizard skip step 1 if a zone is already
  // selected on the map (council pick — respect existing state).
  var [step, setStep] = useState(0);
  var [zoneId, setZoneId] = useState(initialZoneId || null);
  var [courtName, setCourtName] = useState(null);

  // When the wizard opens, decide where to start. If we have a zone
  // already, jump to step 1 (court picker). Otherwise step 0.
  useEffect(function(){
    if(!open) return;
    var startStep = initialZoneId ? 1 : 0;
    setStep(startStep);
    setZoneId(initialZoneId || null);
    setCourtName(null);
    track("play_match_step_entered", { step: startStep });
    // Lock body scroll while the wizard is up.
    if(typeof document !== "undefined"){
      var prev = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return function(){ document.body.style.overflow = prev; };
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[open]);

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
  function back(){
    if(step === 0) return cancel();
    go(step - 1);
  }
  function cancel(){
    track("play_match_cancelled", { step: step, last_completed: step - 1 });
    if(onClose) onClose();
  }

  var zone = zoneId ? ZONES.find(function(z){ return z.id === zoneId; }) : null;
  var courts = zoneId ? courtsInZone(zoneId) : [];

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
        // 100dvh-safe; on mobile becomes near-full-height.
        maxHeight: "calc(100dvh - 24px)",
        display: "flex", flexDirection: "column",
        overflow: "hidden",
      }}>

        {/* Header — back arrow, title, close */}
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

        {/* Body — scrollable */}
        <div style={{ flex:1, overflowY:"auto", padding:"16px" }}>

          {/* Step 0 — pick zone */}
          {step === 0 && (
            <div style={{
              display:"grid",
              gridTemplateColumns:"1fr 1fr",
              gap: 10,
            }}>
              {ZONES.map(function(z){
                return (
                  <button key={z.id} type="button"
                    onClick={function(){ pickZone(z); }}
                    style={{
                      textAlign:"left",
                      padding:"14px 14px 12px",
                      borderRadius: 12,
                      border: "1px solid " + t.border,
                      borderLeft: "4px solid " + z.color,
                      background: t.bgCard,
                      cursor:"pointer",
                      display:"flex", flexDirection:"column", gap: 6,
                      transition: "border-color 0.15s, transform 0.1s",
                    }}
                    onMouseEnter={function(e){ e.currentTarget.style.borderColor = z.color; }}
                    onMouseLeave={function(e){ e.currentTarget.style.borderColor = t.border; e.currentTarget.style.borderLeftColor = z.color; }}>
                    <div style={{
                      fontSize: 9, fontWeight: 800, letterSpacing: "0.14em",
                      textTransform: "uppercase", color: z.color,
                    }}>
                      Zone {z.num}
                    </div>
                    <div style={{
                      fontSize: 14, fontWeight: 800, color: t.text,
                      letterSpacing: "-0.02em", lineHeight: 1.15,
                    }}>
                      {z.name}
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {/* Step 1 — pick court */}
          {step === 1 && zone && (
            <div>
              <div style={{
                fontSize: 11, color: t.textSecondary, marginBottom: 10,
              }}>
                {courts.length} {courts.length === 1 ? "venue" : "venues"} in {zone.name}
              </div>
              <div style={{ display:"flex", flexDirection:"column", gap: 2 }}>
                {courts.map(function(c){
                  return (
                    <button key={c.name} type="button"
                      onClick={function(){ pickCourt(c); }}
                      style={{
                        textAlign:"left",
                        padding:"10px 12px",
                        borderRadius: 8,
                        border:"none",
                        background:"transparent",
                        color: t.text,
                        fontSize: 13,
                        fontWeight: 600,
                        letterSpacing: "-0.01em",
                        cursor:"pointer",
                        display:"flex", alignItems:"center", justifyContent:"space-between",
                        gap: 10,
                        transition: "background 0.12s",
                      }}
                      onMouseEnter={function(e){ e.currentTarget.style.background = t.bgTertiary; }}
                      onMouseLeave={function(e){ e.currentTarget.style.background = "transparent"; }}>
                      <span style={{
                        overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap",
                      }}>{c.name}</span>
                      <span style={{
                        flexShrink:0, color: t.textTertiary, fontSize: 11, fontWeight: 600,
                      }}>{c.courts} {c.courts === 1 ? "court" : "courts"}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Steps 2-3 stubbed for phase 2b/c */}
          {(step === 2 || step === 3) && (
            <div style={{
              padding: "20px 4px",
              display:"flex", flexDirection:"column", alignItems:"center", gap: 12,
              color: t.textSecondary, textAlign:"center",
            }}>
              <div style={{
                width:48, height:48, borderRadius:"50%",
                background: t.bgTertiary, color: t.textTertiary,
                display:"flex", alignItems:"center", justifyContent:"center",
                fontSize: 20,
              }}>⏳</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: t.text }}>
                Coming next
              </div>
              <div style={{ fontSize: 12, lineHeight: 1.5, maxWidth: 320 }}>
                Phase 2 of the wizard ships the player picker and the
                pre-filled invite next. For now you've selected:
                <div style={{
                  marginTop: 12, padding: "10px 12px",
                  background: t.bgTertiary, borderRadius: 8,
                  textAlign:"left", color: t.text, fontSize: 12, fontWeight: 600,
                }}>
                  <div>Zone: <span style={{ color: zone && zone.color }}>{zone && zone.name}</span></div>
                  <div style={{ marginTop: 4 }}>Court: {courtName}</div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer — only shows on stubbed steps so user can finish/dismiss */}
        {(step === 2 || step === 3) && (
          <div style={{
            padding: "12px 16px",
            borderTop: "1px solid " + t.border,
            display:"flex", gap:8, justifyContent:"flex-end",
          }}>
            <button type="button" onClick={cancel}
              style={{
                padding:"10px 18px", borderRadius: 8,
                background:"transparent",
                border:"1px solid "+t.border,
                color:t.text, fontSize: 13, fontWeight: 700,
                cursor:"pointer",
              }}>
              Close
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
