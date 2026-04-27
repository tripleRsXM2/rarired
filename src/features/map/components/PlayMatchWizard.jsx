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
import { fetchPlayersInZone, fetchPlayersAtCourt, scorePlayerForCourt, fetchViewerMatchCountsBy, tierFromSkill } from "../services/mapService.js";
import { nearbySkillLevels } from "../../../lib/constants/domain.js";
import PlayerAvatar from "../../../components/ui/PlayerAvatar.jsx";
import { NAV_ICONS } from "../../../lib/constants/navIcons.jsx";
import { track } from "../../../lib/analytics.js";

// Four steps:
//   0 zone   1 court   2 player(s)   3 when + send
// Step 3 was carrying too much (player picker + when chips + day
// chips + time chips + booking link + preview + send). Split per
// PM/UX council so each step has ONE clear action: pick player(s)
// then plan when. Modern wizard pattern (Strava, Hinge, Apple
// Watch onboarding).
var TOTAL_STEPS = 4;

// Day-of-week chip labels — Mon-Sun. Match what people actually
// type when planning ("Sat" not "Saturday") so the rendered draft
// reads naturally.
var DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
// MAX_SELECT used to be a hard 3-cap; replaced by per-format `maxSelect`
// derived from the Singles/Doubles toggle in step 2. See useState(format).

export default function PlayMatchWizard({
  t, open,
  authUser, blockedUserIds,
  initialZoneId,
  initialCourtName,
  // Map-native player picker (MapPlayerOverlay) hands off the
  // resolved partner profiles + chosen format so the wizard can
  // skip the player-pick step and land directly on When+Send.
  initialPartners,
  initialFormat,
  // Optional. When set AND the wizard was opened at step 3 via the
  // map flow, the back button on step 3 calls this instead of
  // walking back into the modal player picker (which the map flow
  // is supposed to replace).
  onBackToPicker,
  onClose, onSendInvite,
}){
  // Steps: 0 zone, 1 court, 2 players, 3 confirm.
  var [step, setStep]           = useState(0);
  var [zoneId, setZoneId]       = useState(initialZoneId || null);
  var [courtName, setCourtName] = useState(initialCourtName || null);
  var [scope, setScope]         = useState("zone"); // zone | everywhere
  var [selectedIds, setSelectedIds] = useState([]);
  var [players, setPlayers]     = useState([]);
  var [loading, setLoading]     = useState(false);
  // When? — drives the "this Saturday" / "Sat or Sun" wording in the
  // pre-filled invite. Modes:
  //   "week"      — default, "sometime this week"
  //   "next-week" — "sometime next week"
  //   "weekend"   — "this weekend"
  //   "days"      — pick specific day-of-week chips (multi-select)
  var [whenMode, setWhenMode] = useState("week");
  var [pickedDays, setPickedDays] = useState([]); // ["Mon","Tue",...]
  // Optional time-of-day cue. Defaults to "anytime" which omits any
  // time mention in the draft (lower friction); other values fold
  // into the phrase as "in the morning" / "this Saturday afternoon"
  // / etc.
  var [timeOfDay, setTimeOfDay] = useState("anytime"); // anytime|morning|afternoon|evening

  // Step 2 player-search query — case-insensitive prefix match on
  // first/last name. Filters the loaded `players` array client-side
  // (we already cap at ~80 candidates, so no server round-trip).
  var [playerQuery, setPlayerQuery] = useState("");

  // Step 2 format — Singles caps the picker at 1 partner, Doubles
  // caps at 3 (viewer + 3 = a foursome). Defaults to Doubles because
  // the picker UI already implies multi-select; users who want
  // singles flip it explicitly. Switching Doubles→Singles trims the
  // selection so the counter never lies about what'll be sent.
  var [format, setFormat] = useState("doubles"); // "singles" | "doubles"
  var maxSelect = format === "singles" ? 1 : 3;

  // Step 2 filter state. Off by default; user opens via the filter
  // button next to search. Filters compose with search and run
  // client-side over the loaded `players` array.
  //   genderFilter  — "any" | "male" | "female"
  //                   (we deliberately don't expose nonbinary as a
  //                   filter target; the user wanting tennis-format
  //                   gendering is the m/f case. Nonbinary players
  //                   are never excluded by gender filter unless
  //                   "Men" or "Women" is selected, which then hides
  //                   them — same treatment as null gender.)
  //   skillFilter   — "any" | "same" | "tier"
  //                   "same" = exact skill string match
  //                   "tier" = same broad tier (Beginner/Intermediate/Advanced)
  var [filtersOpen, setFiltersOpen] = useState(false);
  var [genderFilter, setGenderFilter] = useState("any");
  var [skillFilter, setSkillFilter] = useState("any");
  var activeFilterCount =
    (genderFilter !== "any" ? 1 : 0) +
    (skillFilter !== "any" ? 1 : 0);

  // Tracks whether a mouse-press started on the backdrop. Used to
  // distinguish "user clicked the dim area" from "user drag-selected
  // text inside the modal and overshot". See backdrop onMouseDown +
  // onClick below.
  var backdropDownRef = useRef(false);

  // Reset everything when the wizard opens. Lock body scroll while up.
  useEffect(function(){
    if(!open) return;
    // Smart skip:
    //   • zone + court + partners → jump to step 3 (When + Send).
    //     Player picking happened on the map (MapPlayerOverlay).
    //   • zone + court (no partners) → step 2 (legacy in-modal picker).
    //   • zone only → step 1 (court picker).
    //   • nothing → step 0 (zone picker).
    var hasPartners = Array.isArray(initialPartners) && initialPartners.length > 0;
    var startStep = (initialZoneId && initialCourtName && hasPartners) ? 3
                  : (initialZoneId && initialCourtName) ? 2
                  : initialZoneId ? 1 : 0;
    setStep(startStep);
    setZoneId(initialZoneId || null);
    setCourtName(initialCourtName || null);
    // Seed the player list + selected ids from the map-native picker
    // so the When step's invite preview reads the right names.
    if(hasPartners){
      setPlayers(initialPartners);
      setSelectedIds(initialPartners.map(function(p){ return p.id; }));
      if(initialFormat) setFormat(initialFormat);
    } else {
      setSelectedIds([]);
    }
    setScope("zone");
    if(!hasPartners) setFormat("doubles");
    setPlayerQuery("");
    setFiltersOpen(false);
    setGenderFilter("any");
    setSkillFilter("any");
    setWhenMode("week");
    setPickedDays([]);
    setTimeOfDay("anytime");
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
      // Second pass: pull confirmed-match counts between the viewer
      // and each candidate so we can rank "people you've already
      // played with" to the front and decorate their cards with a
      // social-proof chip. Single round-trip through match_history.
      var ids = arr2.map(function(p){ return p.id; });
      fetchViewerMatchCountsBy(viewerId, ids).then(function(hc){
        if(cancelled) return;
        var counts = (hc && hc.data) || {};
        // Annotate each candidate with historyCount (0 default) and
        // a properly-scored skill/avail signal from scorePlayerForCourt
        // (the previous call passed args in the wrong order so the
        // sort was a no-op — the only ranking signal was playsHere).
        var annotated = arr2.map(function(p){
          var n = counts[p.id] || 0;
          var score = scorePlayerForCourt(authUser || null, p, !!p.playsHere);
          return Object.assign({}, p, { historyCount: n, score: score });
        });
        // Rank: history-with-viewer desc → score desc.
        annotated.sort(function(a, b){
          if(b.historyCount !== a.historyCount) return b.historyCount - a.historyCount;
          return (b.score || 0) - (a.score || 0);
        });
        setPlayers(annotated);
        setLoading(false);
      }).catch(function(){
        if(cancelled) return;
        // History fetch failed — fall back to the un-annotated list,
        // still sorted by the (now correct) score signal.
        var fallback = arr2.map(function(p){
          var score = scorePlayerForCourt(authUser || null, p, !!p.playsHere);
          return Object.assign({}, p, { historyCount: 0, score: score });
        }).sort(function(a, b){ return (b.score || 0) - (a.score || 0); });
        setPlayers(fallback);
        setLoading(false);
      });
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
      if(prev.length >= maxSelect) return prev;
      return prev.concat([p.id]);
    });
  }
  function sendInvite(){
    var partners = selectedIds.map(function(id){
      return players.find(function(p){ return p.id === id; });
    }).filter(Boolean);
    if(!partners.length) return;
    // (player_picked is now fired from the step-2 "Continue" button
    // since picking is its own step in the 4-step flow.)
    var zone = ZONES.find(function(z){ return z.id === zoneId; });
    var when = resolveWhen(whenMode, pickedDays, timeOfDay);
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
      time_of_day: timeOfDay,
    });
    if(onSendInvite) onSendInvite(partners, ctx);
  }
  function back(){
    if(step === 0) return cancel();
    // Map-native flow: back from step 3 (When+Send) returns to the
    // map player picker, NOT the wizard's modal step 2 (which is
    // unreachable in the map flow).
    var hadPartners = Array.isArray(initialPartners) && initialPartners.length > 0;
    if(step === 3 && hadPartners && onBackToPicker){
      onBackToPicker();
      return;
    }
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
          {[0,1,2,3].map(function(i){
            return (
              <div key={i} style={{
                width: 22, height: 3, borderRadius: 2,
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
            {step === 3 && "When do you want to play?"}
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
                        {/* Description: ALWAYS show suburb + court
                            count for consistent scanability. All 52
                            courts have a suburb; only ~half had an
                            address, which made the list jagged
                            ("Beaconsfield · 4 courts" next to "Cnr
                            Cleveland St & Chalmers St · 6 courts"
                            felt inconsistent). Address still wins
                            for the Google Maps URL helper in
                            courts.js where specificity matters. */}
                        <div style={{
                          fontSize: 11, color: t.textSecondary,
                          marginTop: 3, fontWeight: 600, letterSpacing:"0.01em",
                          overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap",
                        }}>
                          {c.suburb ? c.suburb + " · " : ""}
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
              {/* Format selector — Singles vs Doubles. The most primary
                  intent on this screen ("how many partners do I want?"),
                  so it leads. Switching format trims the picked list to
                  the new cap so the counter never lies. */}
              <div style={{ display:"flex", gap:8, marginBottom:14 }}>
                {[
                  { id:"singles", label:"Singles", sub:"1 partner"  },
                  { id:"doubles", label:"Doubles", sub:"up to 3"    },
                ].map(function(f){
                  var on = format === f.id;
                  return (
                    <button key={f.id} type="button"
                      onClick={function(){
                        if(on) return;
                        setFormat(f.id);
                        // Trim selection to the new cap so what the
                        // counter says matches what'll actually send.
                        var newCap = f.id === "singles" ? 1 : 3;
                        setSelectedIds(function(prev){ return prev.slice(0, newCap); });
                      }}
                      style={{
                        flex:1,
                        padding:"10px 12px", borderRadius: 12,
                        background: on ? t.text : hexToRgba(t.bgCard, 0.78),
                        color: on ? t.bg : t.text,
                        border: "none", cursor: on ? "default" : "pointer",
                        textAlign:"left",
                        transition: "background 0.15s, color 0.15s",
                      }}>
                      <div style={{ fontSize: 13, fontWeight: 800, letterSpacing:"-0.01em" }}>
                        {f.label}
                      </div>
                      <div style={{
                        fontSize: 10.5, fontWeight: 600,
                        opacity: on ? 0.7 : 0.85,
                        marginTop: 2, letterSpacing:"0.01em",
                      }}>
                        {f.sub}
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Scope toggle — same underline-tabs pattern as the side panel */}
              <div style={{ display:"flex", gap:18, marginBottom:14, paddingBottom:2 }}>
                {[
                  { id:"zone",       label:"In zone" },
                  { id:"everywhere", label:"Everywhere" },
                ].map(function(s){
                  var on = scope === s.id;
                  return (
                    <button key={s.id} type="button"
                      onClick={function(){ if(!on){ setScope(s.id); setSelectedIds([]); setPlayerQuery(""); } }}
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

              {/* Search — only renders once the player set has loaded
                  AND there are enough candidates that scrolling becomes
                  the friction. Below ~6 players a search adds visual
                  weight without value. Filters client-side on the
                  already-loaded array so there's no server round-trip
                  per keystroke. */}
              {!loading && players.length >= 6 && (
                <>
                <div style={{ display:"flex", gap: 8, marginBottom: filtersOpen ? 8 : 10 }}>
                <div style={{ position:"relative", flex: 1 }}>
                  <svg width="14" height="14" viewBox="0 0 18 18" fill="none"
                       stroke="currentColor" strokeWidth="1.7"
                       strokeLinecap="round" strokeLinejoin="round"
                       style={{
                         position:"absolute", top:"50%", left: 12,
                         transform:"translateY(-50%)", color: t.textTertiary,
                         pointerEvents:"none",
                       }}>
                    <circle cx="8" cy="8" r="5"/>
                    <path d="M12 12l4 4"/>
                  </svg>
                  <input
                    type="search"
                    value={playerQuery}
                    placeholder={"Search " + players.length + " players"}
                    onChange={function(e){ setPlayerQuery(e.target.value); }}
                    autoComplete="off"
                    style={{
                      width: "100%", boxSizing:"border-box",
                      padding: "9px 32px 9px 34px",
                      borderRadius: 10,
                      background: hexToRgba(t.bgCard, 0.78),
                      border: "1px solid " + t.border,
                      color: t.text,
                      fontSize: 13,
                      letterSpacing:"-0.1px",
                      outline: "none",
                    }}/>
                  {playerQuery && (
                    <button type="button"
                      onClick={function(){ setPlayerQuery(""); }}
                      aria-label="Clear search"
                      style={{
                        position:"absolute", top:"50%", right: 6,
                        transform:"translateY(-50%)",
                        width: 24, height: 24, borderRadius: "50%",
                        background:"transparent", border:"none",
                        color: t.textSecondary, cursor:"pointer",
                        display:"flex", alignItems:"center", justifyContent:"center",
                      }}>
                      <svg width="11" height="11" viewBox="0 0 18 18" fill="none"
                           stroke="currentColor" strokeWidth="2"
                           strokeLinecap="round" strokeLinejoin="round">
                        <path d="M5 5l8 8M13 5l-8 8"/>
                      </svg>
                    </button>
                  )}
                </div>

                {/* Filters button — discreet 38×38 icon button with a
                    badge showing how many filters are active. Same
                    height as the search input so they sit on a clean
                    baseline. Pressed state when drawer is open. */}
                <button type="button"
                  onClick={function(){ setFiltersOpen(function(v){ return !v; }); }}
                  aria-label={filtersOpen ? "Hide filters" : "Show filters"}
                  aria-expanded={filtersOpen}
                  style={{
                    position:"relative",
                    width: 38, height: 38, borderRadius: 10,
                    flexShrink: 0,
                    background: filtersOpen
                      ? t.text
                      : hexToRgba(t.bgCard, 0.78),
                    border: "1px solid " + (filtersOpen ? t.text : t.border),
                    color: filtersOpen ? t.bg : t.textSecondary,
                    cursor:"pointer",
                    display:"flex", alignItems:"center", justifyContent:"center",
                    transition: "background 0.15s, color 0.15s",
                  }}>
                  <svg width="16" height="16" viewBox="0 0 18 18" fill="none"
                       stroke="currentColor" strokeWidth="1.7"
                       strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 5h12M5 9h8M7 13h4"/>
                  </svg>
                  {activeFilterCount > 0 && (
                    <span style={{
                      position:"absolute", top: -5, right: -5,
                      minWidth: 16, height: 16, padding:"0 4px",
                      borderRadius: 8,
                      background: t.accent, color: t.accentText || "#fff",
                      fontSize: 9, fontWeight: 900,
                      display:"flex", alignItems:"center", justifyContent:"center",
                      letterSpacing:"0.04em",
                    }}>
                      {activeFilterCount}
                    </span>
                  )}
                </button>
                </div>

                {/* Filters drawer — collapses when filtersOpen=false.
                    Renders a tight stack of pill rows (Gender, Skill).
                    Each row has an "Any" reset chip in the lead position.
                    Filter changes apply live (no apply/cancel). */}
                {filtersOpen && (
                  <div style={{
                    background: hexToRgba(t.bgCard, 0.78),
                    border: "1px solid " + t.border,
                    borderRadius: 12,
                    padding: "12px 14px",
                    marginBottom: 10,
                  }}>
                    {/* Gender row */}
                    <div style={{ marginBottom: 10 }}>
                      <div style={{
                        fontSize: 9, fontWeight: 800, letterSpacing:"0.14em",
                        textTransform:"uppercase", color: t.textTertiary,
                        marginBottom: 6,
                      }}>Gender</div>
                      <div style={{ display:"flex", gap: 6, flexWrap:"wrap" }}>
                        {[
                          { id:"any",    label:"Any" },
                          { id:"male",   label:"Men" },
                          { id:"female", label:"Women" },
                        ].map(function(opt){
                          var on = genderFilter === opt.id;
                          return (
                            <button key={opt.id} type="button"
                              onClick={function(){ setGenderFilter(opt.id); }}
                              style={{
                                padding:"6px 12px", borderRadius: 999,
                                background: on ? t.text : "transparent",
                                color: on ? t.bg : t.textSecondary,
                                border: "1px solid " + (on ? t.text : t.border),
                                cursor: "pointer",
                                fontSize: 11, fontWeight: on ? 700 : 600,
                                letterSpacing:"0.02em",
                                transition: "background 0.15s, color 0.15s",
                              }}>
                              {opt.label}
                            </button>
                          );
                        })}
                      </div>
                      {genderFilter !== "any" && (
                        <div style={{
                          fontSize: 10, color: t.textTertiary,
                          marginTop: 6, lineHeight: 1.4,
                        }}>
                          Players who haven't set gender are hidden while this filter is on.
                        </div>
                      )}
                    </div>

                    {/* Skill row */}
                    <div>
                      <div style={{
                        fontSize: 9, fontWeight: 800, letterSpacing:"0.14em",
                        textTransform:"uppercase", color: t.textTertiary,
                        marginBottom: 6,
                      }}>Skill match</div>
                      <div style={{ display:"flex", gap: 6, flexWrap:"wrap" }}>
                        {[
                          { id:"any",  label:"Any level" },
                          { id:"same", label:"My level" },
                          { id:"tier", label:"Similar" },
                        ].map(function(opt){
                          var on = skillFilter === opt.id;
                          return (
                            <button key={opt.id} type="button"
                              onClick={function(){ setSkillFilter(opt.id); }}
                              style={{
                                padding:"6px 12px", borderRadius: 999,
                                background: on ? t.text : "transparent",
                                color: on ? t.bg : t.textSecondary,
                                border: "1px solid " + (on ? t.text : t.border),
                                cursor: "pointer",
                                fontSize: 11, fontWeight: on ? 700 : 600,
                                letterSpacing:"0.02em",
                                transition: "background 0.15s, color 0.15s",
                              }}>
                              {opt.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}
                </>
              )}

              {/* Selection counter — reads against the live cap so the
                  "X of Y" matches the format pill above. */}
              <div style={{
                fontSize: 11, color: t.textSecondary, marginBottom: 8,
                display:"flex", justifyContent:"space-between", alignItems:"baseline",
              }}>
                <span>{selectedIds.length} of {maxSelect} selected</span>
                <span style={{ color: t.textTertiary }}>
                  {format === "singles" ? "1v1" : "Up to 4 players total"}
                </span>
              </div>

              {loading ? (
                <div style={{ padding:"24px 0", textAlign:"center", color: t.textTertiary, fontSize: 12 }}>
                  Loading players…
                </div>
              ) : players.length === 0 ? (
                // Empty-state hero — illustrative, not a toast. Distinct
                // copy + actions per scope so the user knows whether
                // they should widen the search (zone-only) or accept
                // they're early to the network (everywhere).
                <div style={{
                  padding:"24px 8px 12px", textAlign:"center",
                  display:"flex", flexDirection:"column", alignItems:"center", gap: 14,
                }}>
                  {/* Decorative tennis-ball-on-line illustration. Per
                      CLAUDE.md icon rule, large hero illustrations in
                      empty-states are OK. Drawn as currentColor so it
                      tints to the theme. */}
                  <svg width="96" height="64" viewBox="0 0 96 64" fill="none"
                       stroke={t.textTertiary} strokeWidth="1.5"
                       strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    {/* baseline */}
                    <path d="M6 52h84" strokeDasharray="2 4" opacity="0.5"/>
                    {/* ball — circle + curved seams */}
                    <circle cx="48" cy="36" r="14"/>
                    <path d="M34 36c4-8 24-8 28 0M34 36c4 8 24 8 28 0"/>
                    {/* arc trail */}
                    <path d="M14 50C18 28 36 14 48 14" opacity="0.4"/>
                  </svg>

                  {scope === "zone" ? (
                    <>
                      <div>
                        <div style={{
                          fontSize: 16, fontWeight: 800,
                          color: t.text, letterSpacing:"-0.02em",
                          marginBottom: 4,
                        }}>
                          You're first in this zone
                        </div>
                        <div style={{
                          fontSize: 12, color: t.textSecondary,
                          lineHeight: 1.45, maxWidth: 320, margin:"0 auto",
                          letterSpacing:"-0.05px",
                        }}>
                          Nobody's set this zone as their home yet. Widen the search to find players nearby, or invite someone to join.
                        </div>
                      </div>
                      <button type="button"
                        onClick={function(){ setScope("everywhere"); setSelectedIds([]); setPlayerQuery(""); }}
                        style={{
                          padding:"11px 20px", borderRadius: 10,
                          background: t.text, color: t.bg,
                          border:"none", cursor:"pointer",
                          fontSize: 12, fontWeight: 800,
                          letterSpacing:"0.04em", textTransform:"uppercase",
                        }}>
                        Try Everywhere
                      </button>
                    </>
                  ) : (
                    <>
                      <div>
                        <div style={{
                          fontSize: 16, fontWeight: 800,
                          color: t.text, letterSpacing:"-0.02em",
                          marginBottom: 4,
                        }}>
                          You're early
                        </div>
                        <div style={{
                          fontSize: 12, color: t.textSecondary,
                          lineHeight: 1.45, maxWidth: 320, margin:"0 auto",
                          letterSpacing:"-0.05px",
                        }}>
                          Nobody's signed up in your network yet. Bring a friend over and you'll have someone to play with.
                        </div>
                      </div>
                    </>
                  )}
                </div>
              ) : (() => {
                // Compose filters: search → gender → skill. Selection
                // state is tracked against the underlying `players`
                // array (by id), so filtering for render is safe —
                // picks survive any filter toggle.
                var q = (playerQuery || "").trim().toLowerCase();
                var viewerSkill = (authUser && authUser.profile && authUser.profile.skill) || null;
                var viewerTier  = viewerSkill ? tierFromSkill(viewerSkill) : null;
                var visible = players.filter(function(p){
                  // Search.
                  if(q){
                    var name = (p.name || p.username || p.full_name || "").toLowerCase();
                    if(name.indexOf(q) === -1) return false;
                  }
                  // Gender filter — when applied, candidates without
                  // a matching gender (including null/"prefer_not_to_say")
                  // are hidden. The drawer copy says so explicitly.
                  if(genderFilter !== "any"){
                    if(p.gender !== genderFilter) return false;
                  }
                  // Skill filter. 'same' = ±1 rung from viewer's level
                  // (e.g. Intermediate 2 also matches Intermediate 1 +
                  // Advanced 1). 'tier' = same broad tier.
                  if(skillFilter !== "any"){
                    if(!viewerSkill || !p.skill) return false;
                    if(skillFilter === "same"){
                      var nearSet = nearbySkillLevels(viewerSkill);
                      if(nearSet.indexOf(p.skill) === -1) return false;
                    } else if(skillFilter === "tier"){
                      var pt = tierFromSkill(p.skill);
                      if(!pt || !viewerTier || pt !== viewerTier) return false;
                    }
                  }
                  return true;
                });
                if(visible.length === 0) {
                  // Diagnose what's actually filtering the list to
                  // empty so the recovery action lines up with the
                  // user's last toggle, not a generic "clear all."
                  var msg, action, actionLabel;
                  if(q && activeFilterCount > 0){
                    msg = "No matches with these filters.";
                    actionLabel = "Clear search & filters";
                    action = function(){
                      setPlayerQuery("");
                      setGenderFilter("any");
                      setSkillFilter("any");
                    };
                  } else if(activeFilterCount > 0){
                    msg = "No players match these filters.";
                    actionLabel = "Clear filters";
                    action = function(){
                      setGenderFilter("any");
                      setSkillFilter("any");
                    };
                  } else {
                    msg = "No players match \"" + playerQuery + "\".";
                    actionLabel = "Clear search";
                    action = function(){ setPlayerQuery(""); };
                  }
                  return (
                    <div style={{ padding:"24px 0", textAlign:"center", color: t.textTertiary, fontSize: 12 }}>
                      {msg}
                      <div style={{ marginTop:8 }}>
                        <button type="button" onClick={action}
                          style={{
                            background:"transparent", border:"none", color: t.accent,
                            fontSize: 12, fontWeight: 700, cursor:"pointer",
                          }}>
                          {actionLabel}
                        </button>
                      </div>
                    </div>
                  );
                }
                return (
                <>
                {/* Horizontal scrolling carousel of profile cards.
                    Each card: 60px circle avatar (with accent ring on
                    select), name + skill below. Scroll-snap + mouse
                    drag friendly. Big tap target on mobile. */}
                <div style={{
                  display: "flex",
                  gap: 10,
                  overflowX: "auto",
                  overflowY: "hidden",
                  paddingBottom: 6,
                  scrollSnapType: "x mandatory",
                  WebkitOverflowScrolling: "touch",
                  // Hide scrollbar but keep functionality.
                  scrollbarWidth: "thin",
                }}>
                  {visible.map(function(p){
                    var isSel = selectedIds.indexOf(p.id) !== -1;
                    var disabled = !isSel && selectedIds.length >= maxSelect;
                    return (
                      <button key={p.id} type="button"
                        onClick={function(){ togglePlayer(p); }}
                        disabled={disabled}
                        style={{
                          flexShrink: 0,
                          scrollSnapAlign: "start",
                          width: 88,
                          padding: "8px 4px 10px",
                          borderRadius: 14,
                          background: isSel ? hexToRgba(t.accent, 0.12) : "transparent",
                          border: "none",
                          cursor: disabled ? "not-allowed" : "pointer",
                          opacity: disabled ? 0.4 : 1,
                          display:"flex", flexDirection:"column",
                          alignItems:"center", gap: 6,
                          transition: "background 0.15s",
                        }}>
                        {/* Avatar with selection ring */}
                        <div style={{
                          position:"relative",
                          width: 60, height: 60,
                          padding: isSel ? 3 : 0,
                          borderRadius:"50%",
                          background: isSel ? t.accent : "transparent",
                          flexShrink: 0,
                          transition: "background 0.15s, padding 0.15s",
                        }}>
                          <div style={{
                            width:"100%", height:"100%",
                            borderRadius:"50%",
                            overflow:"hidden",
                            background: t.bgCard,
                            display:"flex", alignItems:"center", justifyContent:"center",
                          }}>
                            <PlayerAvatar size={isSel ? 54 : 60} profile={p}/>
                          </div>
                          {isSel && (
                            <div style={{
                              position:"absolute", bottom: -2, right: -2,
                              width: 20, height: 20, borderRadius: "50%",
                              background: t.accent, color: t.accentText || "#fff",
                              border: "2px solid " + t.bgCard,
                              display:"flex", alignItems:"center", justifyContent:"center",
                              fontSize: 10, fontWeight: 900,
                            }}>✓</div>
                          )}
                        </div>
                        {/* Name */}
                        <div style={{
                          width: "100%",
                          fontSize: 11, fontWeight: 700,
                          color: t.text, letterSpacing:"-0.01em",
                          lineHeight: 1.15,
                          textAlign:"center",
                          overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap",
                          padding: "0 2px",
                        }}>
                          {firstName(p.name || p.username || p.full_name || "Player")}
                        </div>
                        {/* Social-proof chip — shows match history with
                            the viewer when there is any. Floats people
                            the user has already played with above the
                            skill pill so the picker reads as a
                            recommendation, not a directory. */}
                        {p.historyCount > 0 && (
                          <span style={{
                            padding: "1px 6px", borderRadius: 999,
                            background: hexToRgba(t.accent, 0.14),
                            color: t.accent,
                            fontSize: 8.5, fontWeight: 800,
                            letterSpacing:"0.04em",
                            textTransform:"uppercase",
                            whiteSpace:"nowrap",
                          }}>
                            {p.historyCount === 1 ? "1 match" : (p.historyCount + " matches")}
                          </span>
                        )}
                        {/* Skill pill */}
                        {(p.skill || p.skill_level) ? (
                          <span style={{
                            padding: "1px 6px", borderRadius: 999,
                            background: hexToRgba(t.bgCard, 0.78),
                            color: t.textSecondary,
                            fontSize: 8.5, fontWeight: 800,
                            letterSpacing:"0.04em",
                            textTransform:"uppercase",
                          }}>
                            {p.skill || p.skill_level}
                          </span>
                        ) : (
                          !p.historyCount && <span style={{ height: 14 }}/>
                        )}
                      </button>
                    );
                  })}
                </div>
                <div style={{
                  fontSize: 10.5, color: t.textTertiary,
                  marginTop: 4, letterSpacing: "0.02em",
                  display: "flex", alignItems: "center", gap: 4,
                }}>
                  <svg width="11" height="11" viewBox="0 0 18 18" fill="none"
                       stroke="currentColor" strokeWidth="1.6"
                       strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M3 9h12M11 5l4 4-4 4"/>
                  </svg>
                  <span>Slide for more players</span>
                </div>
                </>
                );
              })()}
            </div>
          )}

          {/* Step 3 — When? + send invite. Split out from step 2
              per user / PM council so each step has one clear
              action. Renders the same chip group + day chips +
              time tabs + booking link + message preview that
              previously crowded step 2. */}
          {step === 3 && (
            <div>
              {!loading && players.length > 0 && (
                <div>
                  {/* Sub-step 1 — pick a time. The circled-number
                      glyph visually maps to the user's mental
                      'first this, then that' mental model on the
                      final step (1. When → 2. Send invite). */}
                  <div style={{
                    display:"flex", alignItems:"center", gap: 10,
                    marginBottom: 12,
                  }}>
                    <span style={{
                      width: 22, height: 22, borderRadius: "50%",
                      background: t.accent, color: t.accentText || "#fff",
                      display:"flex", alignItems:"center", justifyContent:"center",
                      fontSize: 12, fontWeight: 900, lineHeight: 1,
                      flexShrink: 0,
                    }}>1</span>
                    <span style={{
                      fontSize: 13, fontWeight: 800, letterSpacing: "0.04em",
                      textTransform: "uppercase", color: t.text,
                    }}>When?</span>
                  </div>
                  <div style={{ display:"flex", gap: 6, flexWrap:"wrap" }}>
                    {[
                      { id:"week",      label:"This week" },
                      { id:"next-week", label:"Next week" },
                      { id:"weekend",   label:"Weekend" },
                      { id:"days",      label:"Pick days" },
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
                    <div style={{ display:"flex", gap: 5, flexWrap:"wrap", marginTop: 10 }}>
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
                              minWidth: 38, padding: "7px 0", borderRadius: 10,
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

                  {/* Time of day — underline tabs */}
                  <div style={{ display:"flex", gap: 18, marginTop: 12, paddingBottom: 2 }}>
                    {[
                      { id:"anytime",   label:"Anytime"   },
                      { id:"morning",   label:"Morning"   },
                      { id:"afternoon", label:"Afternoon" },
                      { id:"evening",   label:"Evening"   },
                    ].map(function(opt){
                      var on = timeOfDay === opt.id;
                      return (
                        <button key={opt.id} type="button"
                          onClick={function(){ if(!on) setTimeOfDay(opt.id); }}
                          style={{
                            padding:"4px 0", background:"transparent", border:"none",
                            borderBottom: "2px solid " + (on ? t.text : "transparent"),
                            color: on ? t.text : t.textTertiary,
                            fontSize: 12, fontWeight: on ? 700 : 500,
                            letterSpacing:"0.01em",
                            cursor: on ? "default" : "pointer",
                            transition:"color 0.15s, border-color 0.15s",
                          }}>
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>

                  {pickedCourt && pickedCourt.bookingUrl && (
                    <>
                    {/* Hairline rule above the booking link gives a
                        clear visual separation from the time-of-day
                        tabs that sit just above. Matches the rule
                        below that splits us from the message
                        preview. */}
                    <div style={{
                      height: 1, background: t.border,
                      marginTop: 16, marginBottom: 14,
                      opacity: 0.7,
                    }}/>
                    <a href={pickedCourt.bookingUrl}
                      target="_blank" rel="noopener noreferrer"
                      style={{
                        padding: "10px 12px", borderRadius: 12,
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
                        {/* Three-line stack — action verb, venue name,
                            quiet hint. Separating 'Check times' from
                            the venue name reads less like a long
                            sentence and more like a labelled link. */}
                        <div style={{
                          fontSize: 10.5, fontWeight: 800, color: t.textSecondary,
                          letterSpacing: "0.10em", textTransform: "uppercase",
                          lineHeight: 1.1,
                        }}>
                          Check times
                        </div>
                        <div style={{
                          fontSize: 13, fontWeight: 600, color: t.text,
                          letterSpacing: "-0.01em",
                          marginTop: 3, lineHeight: 1.2,
                          overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap",
                        }}>
                          {pickedCourt.name}
                        </div>
                        <div style={{
                          fontSize: 10, color: t.textTertiary, marginTop: 4,
                          letterSpacing:"0.04em", textTransform:"uppercase", fontWeight:700,
                        }}>
                          Open venue booking site
                        </div>
                      </div>
                    </a>
                    {/* Bottom hairline mirrors the one above — visually
                        anchors the booking link as its own block,
                        separated from the message-preview sub-step
                        below. */}
                    <div style={{
                      height: 1, background: t.border,
                      marginTop: 14, marginBottom: 8,
                      opacity: 0.7,
                    }}/>
                    </>
                  )}

                  {selectedIds.length > 0 && (
                    <div style={{ marginTop: 14 }}>
                      {/* Sub-step 2 — send the invite. Same circled-
                          number pattern as 'When?' above so the two
                          actions read as a clear ordered pair. */}
                      <div style={{
                        display:"flex", alignItems:"center", gap: 10,
                        marginBottom: 10,
                      }}>
                        <span style={{
                          width: 22, height: 22, borderRadius: "50%",
                          background: t.accent, color: t.accentText || "#fff",
                          display:"flex", alignItems:"center", justifyContent:"center",
                          fontSize: 12, fontWeight: 900, lineHeight: 1,
                          flexShrink: 0,
                        }}>2</span>
                        <span style={{
                          fontSize: 13, fontWeight: 800, letterSpacing: "0.04em",
                          textTransform: "uppercase", color: t.text,
                        }}>Send message invite</span>
                      </div>
                      <div style={{
                        padding: "12px 14px",
                        borderRadius: "16px 16px 16px 4px",
                        background: hexToRgba(t.accent, 0.10),
                        color: t.text, fontSize: 13.5, lineHeight: 1.45,
                        letterSpacing: "-0.005em", maxWidth: "95%",
                      }}>
                        {previewInviteText({
                          partners: selectedIds.map(function(id){ return players.find(function(p){ return p.id === id; }); }).filter(Boolean),
                          court: courtName, zone: zone,
                          when: resolveWhen(whenMode, pickedDays, timeOfDay),
                        })}
                      </div>
                      <div style={{
                        fontSize: 10, color: t.textTertiary,
                        marginTop: 6, letterSpacing:"0.02em",
                      }}>
                        This sends as a direct message to each player.
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

        </div>

        {/* Footer — step 2 = Continue → step 3, step 3 = Send invite. */}
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
            <button type="button" onClick={function(){
                if(!selectedIds.length) return;
                track("play_match_player_picked", { player_count: selectedIds.length, scope: scope });
                go(3);
              }}
              disabled={selectedIds.length === 0}
              style={{
                padding:"11px 22px", borderRadius: 10,
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
            display:"flex", gap:8, justifyContent:"flex-end", alignItems:"center",
          }}>
            <button type="button" onClick={sendInvite}
              style={{
                padding:"11px 24px", borderRadius: 10,
                background: t.accent,
                color: t.accentText || "#fff",
                border:"none",
                fontSize: 13, fontWeight: 800, letterSpacing:"0.02em",
                cursor: "pointer",
                boxShadow: "0 2px 6px rgba(20,18,17,0.18)",
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

// Resolve the chip selections into a structured value the rest of
// the pipeline (draft text, ctx, analytics) can consume.
function resolveWhen(mode, days, time){
  var t = time || "anytime";
  if(mode === "next-week") return { kind: "next-week", time: t };
  if(mode === "weekend")   return { kind: "weekend",   time: t };
  if(mode === "days" && Array.isArray(days) && days.length){
    return { kind: "days", days: days.slice(), time: t };
  }
  return { kind: "week", time: t }; // default
}

// Render a "when" structure into the natural-language phrase that
// fits inside the invite sentence ("...up for a hit at X <phrase>?").
//
// The shape splits into a "when-clause" (week/weekend/days) and an
// optional "time-clause" (morning/afternoon/evening). Anytime omits
// the time clause entirely so the message stays casual when the
// user doesn't care.
function whenPhrase(when){
  if(!when) return "sometime this week";
  var time = when.time || "anytime";
  var dayPart;
  if(when.kind === "next-week") {
    dayPart = "next week";
  } else if(when.kind === "weekend") {
    dayPart = "this weekend";
  } else if(when.kind === "days" && when.days && when.days.length){
    var d = sortDaysOfWeek(when.days);
    if(d.length === 1)        dayPart = "this " + d[0];
    else if(isContiguous(d))  dayPart = d[0] + "–" + d[d.length - 1];
    else if(d.length === 2)   dayPart = d[0] + " or " + d[1];
    else                       dayPart = d.slice(0, -1).join(", ") + " or " + d[d.length - 1];
  } else {
    dayPart = "this week";
  }

  // Time clause: anytime → omit. Specific day + time → "Saturday
  // morning" reads more naturally than "Saturday in the morning".
  // Generic week/weekend + time → "this week in the morning".
  if(time === "anytime"){
    // For the abstract "this week" / "next week" / "this weekend" we
    // prefix with "sometime" to read casually. For day-specific we
    // keep it tight ("this Saturday").
    if(when.kind === "week"      ) return "sometime this week";
    if(when.kind === "next-week" ) return "sometime next week";
    return dayPart;
  }
  // With a time and a specific day → tight: "this Saturday morning"
  if(when.kind === "days" && when.days && when.days.length === 1){
    return dayPart + " " + time;
  }
  // Otherwise prepend "in the": "this week in the morning"
  return dayPart + " in the " + time;
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
