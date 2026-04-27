// src/features/map/components/ZoneSidePanel.jsx
//
// Primary map-pivot workspace. Slides in when a zone is selected.
// Selection-then-action pattern (per user feedback):
//
//   1. Courts list: single-select. Tapping Prince Alfred highlights it
//      as the active court (no modal open — inline state only).
//   2. Players list re-scopes to the selected court (or home-zone
//      players when none selected) with the same ranking the
//      CourtInfoCard uses — plays-here + skill + availability.
//   3. Player rows are multi-select up to 3 (enough for doubles).
//   4. Floating action bar at the bottom: [Message] (any count) and
//      [Challenge] (exactly 1). Opens the ComposeMessageModal or the
//      challenge composer upstream.
//
// Keeps:
//   • Set-as-home-area toggle (footer secondary affordance)
//   • Inline "Book ↗" link per court (native right-click works)
//
// Drops:
//   • "click court → open CourtInfoCard modal" (that modal is still
//     reachable from the map pin if users want the detailed view)

import { useEffect, useRef, useState } from "react";
import PlayerAvatar from "../../../components/ui/PlayerAvatar.jsx";
import { courtsInZone } from "../data/courts.js";
import { ZONES } from "../data/zones.js";
import { fetchPlayersInZone, fetchPlayersAtCourt, scorePlayerForCourt, fetchPublicPlayersCountInZone } from "../services/mapService.js";
import { NAV_ICONS } from "../../../lib/constants/navIcons.jsx";
import { track } from "../../../lib/analytics.js";
import ZoneShape from "./ZoneShape.jsx";

var MAX_SELECT = 3; // 3 others + viewer = 4 for doubles

export default function ZoneSidePanel({
  t, zone, onClose, onSelectZone,
  authUser, profile, homeZone, onSetHome, onClearHome,
  onOpenProfile, activity,
  // onMessageSelected(partners[], slotHints) — array, supports doubles.
  onMessageSelected,
  // Asymmetric block — viewer's blocked-user list is forwarded into
  // the player-fetch services so blocked users are dropped before
  // they ever render.
  blockedUserIds,
  // Court-selection state lifted to MapTab so LeafletMap can dim/
  // hide non-selected venues when a court is pinned in the panel.
  // panelCourtName is a venue name string (e.g. "Prince Alfred Park
  // Tennis Courts") or null. onPanelCourtChange takes the new value.
  panelCourtName,
  onPanelCourtChange,
}){
  var [players,setPlayers]=useState([]);
  var [loading,setLoading]=useState(false);

  // Local alias to keep the rest of the file readable. Reads from
  // props; writes go through the parent setter.
  var selectedCourt = panelCourtName || null;
  function setSelectedCourt(next){
    var resolved = typeof next === "function" ? next(selectedCourt) : next;
    if(onPanelCourtChange) onPanelCourtChange(resolved || null);
  }

  var [selectedIds, setSelectedIds]     = useState([]);
  // Tracks where a touch swipe started so the gesture handler at
  // the title card can decide on touchend whether the delta crossed
  // the threshold to navigate to the next/previous zone.
  var swipeStartRef = useRef(null);
  // Player list scope: "zone" (default, home_zone match in this zone)
  // or "everywhere" (whole user base, ranked the same way). Lets the
  // viewer pitch a match at a court to someone who isn't a local.
  var [scope, setScope] = useState("zone");

  // Clear player selection whenever the panel closes / switches zones.
  // The parent owns panelCourtName and resets it on zone change too.
  useEffect(function () {
    setSelectedIds([]);
  }, [zone && zone.id]);

  // Long-list collapse — zones with >5 venues feel cramped on mobile
  // when every court renders. Council call: collapse only on mobile;
  // desktop has ample vertical room and the full list reads fine. The
  // clutter complaint was mobile-only.
  var COLLAPSE_THRESHOLD = 5;
  var COLLAPSED_VISIBLE  = 4;
  var [courtsExpanded, setCourtsExpanded] = useState(false);
  useEffect(function(){ setCourtsExpanded(false); }, [zone && zone.id]);
  // Track viewport — collapse only applies under 768px. Re-evaluates
  // on resize so a phone-rotation widening past breakpoint expands.
  var [isNarrow, setIsNarrow] = useState(function(){
    return typeof window !== "undefined" && window.matchMedia("(max-width: 767px)").matches;
  });
  useEffect(function(){
    if(typeof window === "undefined") return;
    var mq = window.matchMedia("(max-width: 767px)");
    function onChange(e){ setIsNarrow(e.matches); }
    if(mq.addEventListener) mq.addEventListener("change", onChange);
    else mq.addListener(onChange);
    return function(){
      if(mq.removeEventListener) mq.removeEventListener("change", onChange);
      else mq.removeListener(onChange);
    };
  },[]);

  // Fetch + rank the player list. Always returns the WHOLE zone roster
  // (by home_zone) so users can reach anyone in their area — even to
  // pitch a match at a court the target doesn't usually play. When a
  // court is also selected we overlay the plays-here set: players who
  // self-report this court (or have history at it) get flagged and
  // float to the top via the ranking score.
  useEffect(function(){
    if (!zone) return;
    setLoading(true);
    // Anonymous viewers can't SELECT profiles via RLS. Fetch just the
    // count via SECURITY DEFINER RPC and render N blurred placeholder
    // rows + a sign-in nudge. No PII leaves the DB.
    if (!authUser) {
      fetchPublicPlayersCountInZone(zone.id).then(function (r) {
        var n = (r && r.data) || 0;
        // Build N anonymous placeholder rows so the blurred-avatar list
        // has something to render.
        var stubs = [];
        for (var i = 0; i < n; i++) {
          stubs.push({
            id: "anon-" + zone.id + "-" + i,
            name: "Player",
            avatar: "?", avatar_url: null, skill: "",
            playsHere: false,
          });
        }
        setPlayers(stubs);
        setLoading(false);
      });
      return;
    }
    var viewer = (profile && Object.assign({ id: authUser && authUser.id }, profile)) || { id: authUser && authUser.id };
    var blocked = blockedUserIds || [];
    // Scope = "everywhere" widens the roster to all users (not zone-
    // filtered). Lets the viewer pitch a match at a court to someone
    // who isn't a local. Pass null zoneId to fetchPlayersInZone — it
    // skips the home_zone filter when zoneId is falsy.
    var zoneReq = scope === "everywhere"
      ? fetchPlayersInZone(null, 80, blocked.concat(authUser && authUser.id ? [authUser.id] : []))
      : fetchPlayersInZone(zone.id, 40, blocked);
    var courtReq = selectedCourt
      ? fetchPlayersAtCourt(selectedCourt, viewer, 40, blocked)
      : Promise.resolve({ data: [] });
    Promise.all([zoneReq, courtReq]).then(function (arr) {
      var zr = arr[0]; var cr = arr[1];
      if (zr.error) console.warn("[ZoneSidePanel] fetchPlayersInZone:", zr.error);
      if (cr && cr.error) console.warn("[ZoneSidePanel] fetchPlayersAtCourt:", cr.error);
      // Build a map of court-players (has richer data: availability,
      // played_courts) keyed by id — we prefer their record when
      // someone appears in both sets.
      var courtMap = {};
      (cr && cr.data || []).forEach(function (p) { courtMap[p.id] = p; });
      // Merge: start with zone roster, upgrade to court record where
      // available, then add any court-only players not in the zone
      // (people who play here but live elsewhere — still valuable for
      // this specific court).
      var byId = {};
      (zr.data || []).forEach(function (p) {
        byId[p.id] = courtMap[p.id] ? Object.assign({}, p, courtMap[p.id], { playsHere: true }) : p;
      });
      Object.keys(courtMap).forEach(function (id) {
        if (!byId[id]) byId[id] = Object.assign({}, courtMap[id], { playsHere: true });
      });
      // Score + sort — playsHere dominates, then skill, then avail.
      // scorePlayerForCourt returns 0 playsHere bonus when selectedCourt
      // is null because no players will have it flagged in that case.
      var scored = Object.keys(byId).map(function (id) {
        var p = byId[id];
        var score = scorePlayerForCourt(viewer, p, !!p.playsHere);
        return Object.assign({}, p, { score: score });
      });
      scored.sort(function (a, b) { return b.score - a.score; });
      setPlayers(scored);
      setLoading(false);
    });
  },[zone && zone.id, selectedCourt, homeZone, authUser && authUser.id, scope]);

  // Same optimistic-you-are-home hack as before — preserves the UX
  // where setting home immediately lists you in the zone.
  var displayPlayers = players;
  if (!selectedCourt && zone && authUser && homeZone === zone.id && profile) {
    var alreadyThere = players.some(function(p){ return p.id === authUser.id; });
    if (!alreadyThere) {
      displayPlayers = [{
        id: authUser.id,
        name: profile.name, avatar: profile.avatar, avatar_url: profile.avatar_url,
        skill: profile.skill, ranking_points: profile.ranking_points,
        suburb: profile.suburb, home_zone: zone.id,
      }].concat(players);
    }
  }

  if(!zone) return null;

  var courts = courtsInZone(zone.id);
  // Count of distinct venues in the zone — the user-facing 'how
  // many places to play here' number. Was previously the sum of
  // physical courts across venues, which read as a confusing
  // double-counted value (each venue's row already shows its own
  // physical-court count below). User: 'change # of courts to
  // # of locations'.
  var totalLocations = courts.length;
  // Mobile: show ALL courts in a fixed-height scrollable list (~5
  // rows visible) instead of the old slice + expand-button. User
  // feedback: 'on mobile id like to show 5 courts but have a scroll
  // instead, and if its numbered you can follow it better'.
  // visibleCourts is always the full list now; the previous
  // COLLAPSE_THRESHOLD / COLLAPSED_VISIBLE / courtsExpanded /
  // setCourtsExpanded plumbing is intentionally retained as no-op
  // state to avoid breaking any external refs but is no longer
  // read in render.
  var visibleCourts = courts;
  // Approximate row height: 7px+12.5px line-height+7px padding ≈ 30px;
  // plus 2px gap. Cap ~5 rows worth = 180px on mobile.
  var coursListMaxH = isNarrow && courts.length > 5 ? 180 : null;
  // When a venue is pinned in the panel, the stat-row "Courts" cell
  // switches from the zone total to that venue's own court count
  // (e.g. "6 · Courts here") so the user sees the playable size of
  // the pinned location instead of the whole zone.
  var pinnedCourt = selectedCourt
    ? courts.find(function(c){ return c.name === selectedCourt; })
    : null;
  var courtsCellValue = pinnedCourt ? pinnedCourt.courts : totalLocations;
  // Pinned venue → 'Courts here' (physical court count at that
  // venue). Default → 'Locations' (distinct venue count).
  var courtsCellLabel = pinnedCourt ? "Courts here" : "Locations";
  var isHome = homeZone === zone.id;
  var canSetHome = !!authUser;

  function toggleCourt(c) {
    setSelectedCourt(function (prev) { return prev === c.name ? null : c.name; });
    // Used to wipe selectedIds here so a court-change couldn't leave
    // a 'stale' selected player on the chip. That broke the
    // player-then-court → message flow: user picks a player, sees
    // the action bar, then picks a court → bar disappears. User:
    // 'should work both ways, player then court = message'.
    // Keep the selection. The fetchPlayersInZone/AtCourt merge
    // always returns the picked players' rows, so they still
    // render under the new court filter.
  }

  function togglePlayer(p) {
    if (!authUser || p.id === authUser.id) return;
    setSelectedIds(function (prev) {
      if (prev.indexOf(p.id) >= 0) return prev.filter(function (x) { return x !== p.id; });
      if (prev.length >= MAX_SELECT) return prev; // cap — 3 others = doubles
      return prev.concat([p.id]);
    });
  }

  var selectedCount = selectedIds.length;
  var selectedPartners = selectedIds.map(function (id) {
    return displayPlayers.find(function (p) { return p.id === id; });
  }).filter(Boolean);
  var showActionBar = selectedCount > 0;

  return (
    <div className="slide-in-right" style={{
      // Width: full-bleed on mobile (covers the entire map — user
      // 'the zone card that slides out should just cover the entire
      // map, its weird we see a little sliver on the side'). Capped
      // at 360px on desktop where the map needs to stay visible
      // alongside the panel.
      position:"absolute", top:0, right:0, bottom:0,
      width:"100%", maxWidth: isNarrow ? "none" : 360,
      background: t.bgCard,
      borderLeft: isNarrow ? "none" : ("1px solid " + t.border),
      display:"flex", flexDirection:"column",
      // zIndex bumped from 500 → 1100 so the panel sits ABOVE
      // Leaflet's attribution control (~z 800) on mobile. User
      // feedback: 'OSM icon is still visible, can it hide when
      // we are in that tab.'
      zIndex: 1100,
      boxShadow: isNarrow ? "none" : "-8px 0 32px rgba(0,0,0,0.06)",
    }}>

      {/* Header — inline home-toggle next to the title (council fix:
          the old "Set as home / Clear" footer button was too prominent
          for what's a one-tap toggle). Same icon doubles as indicator
          and action: filled-accent when this zone is the viewer's home,
          outlined neutral otherwise. */}
      {(function(){
        // Swipe gesture wiring — on mobile, dragging the title card
        // left → next zone, right → previous zone. Threshold 48px so
        // a small accidental drag doesn't navigate. Falls back to a
        // no-op when isNarrow is false.
        return null;
      })()}
      <div
        onTouchStart={isNarrow && onSelectZone ? function(e){
          var x = e.touches[0] ? e.touches[0].clientX : 0;
          swipeStartRef.current = { x: x, t: Date.now() };
        } : null}
        onTouchEnd={isNarrow && onSelectZone ? function(e){
          var s = swipeStartRef.current;
          if(!s) return;
          var endX = (e.changedTouches[0] || {}).clientX || 0;
          var dx = endX - s.x;
          var dt = Date.now() - s.t;
          swipeStartRef.current = null;
          if(Math.abs(dx) < 48) return;       // not a swipe
          if(dt > 600) return;                 // too slow → probably a scroll
          var zonesArr = ZONES;
          var i = zonesArr.findIndex(function(z){ return z.id === zone.id; });
          if(i < 0) return;
          var next = dx < 0 ? (i + 1) % zonesArr.length
                            : (i - 1 + zonesArr.length) % zonesArr.length;
          onSelectZone(zonesArr[next].id);
          track("zone_swiped", { from: zone.id, to: zonesArr[next].id, direction: dx < 0 ? "left" : "right" });
        } : null}
        style={{
          // Mobile compacts the entire title block (incl. progression
          // bar) so it doesn't crowd the courts list. User: 'top 2
          // sections a tiny bit more compact'.
          padding: isNarrow
            ? (onSelectZone ? "8px 16px 10px" : "14px 16px 10px")
            : "20px 20px 16px",
          borderBottom:"1px solid "+t.border,
          touchAction: isNarrow && onSelectZone ? "pan-y" : "auto",
        }}>
        {/* Mobile: progression bar at the top of the title block.
            Six segments, one per zone in the canonical ZONES order;
            the active zone fills, others are hairline. Tap any
            segment to jump straight to that zone. Visual-and-tactile
            cue that the title card is swipeable left/right. User:
            'add a progression bar so people know you can swipe to
            different zones.' Hidden on desktop (no swipe gesture). */}
        {isNarrow && onSelectZone && (
          <div style={{
            display:"flex", gap: 4, marginBottom: 8,
          }}>
            {ZONES.map(function(z){
              var on = z.id === zone.id;
              return (
                <button key={z.id} type="button"
                  onClick={function(){ if(!on && onSelectZone) onSelectZone(z.id); }}
                  aria-label={"Jump to " + z.name}
                  aria-current={on ? "true" : "false"}
                  style={{
                    flex: 1,
                    height: 4,
                    minWidth: 0,
                    padding: 0,
                    borderRadius: 2,
                    border: "none",
                    background: on ? z.color : t.border,
                    opacity: on ? 1 : 0.55,
                    cursor: on ? "default" : "pointer",
                    transition: "background 0.18s, opacity 0.18s",
                  }}/>
              );
            })}
          </div>
        )}
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap: isNarrow ? 8 : 12 }}>
          <div style={{ display:"flex", gap: isNarrow ? 10 : 12, alignItems:"center", flex:1, minWidth:0 }}>
            <div style={{
              width: isNarrow ? 32 : 36, height: isNarrow ? 32 : 36, borderRadius:"50%", background: zone.color,
              display:"flex", alignItems:"center", justifyContent:"center",
              color:"#fff", fontWeight:700, fontSize: isNarrow ? 14 : 16, flexShrink:0,
              boxShadow:"0 0 0 3px "+t.bgCard,
            }}>{zone.num}</div>
            <div style={{ minWidth:0, flex:1 }}>
              <div style={{ fontSize: isNarrow ? 9 : 10, letterSpacing:"0.1em", color:t.textTertiary, textTransform:"uppercase", marginBottom: isNarrow ? 1 : 2 }}>Zone {zone.num}</div>
              <div style={{ display:"flex", alignItems:"center", gap:6, minWidth:0 }}>
                <div style={{ fontSize: isNarrow ? 16 : 18, fontWeight:700, color:t.text, letterSpacing:"-0.02em", lineHeight:1.15, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", minWidth:0 }}>
                  {zone.name}
                </div>
                {canSetHome && (
                  <button
                    onClick={function(){
                      if(isHome) onClearHome && onClearHome();
                      else onSetHome && onSetHome(zone.id);
                    }}
                    aria-label={isHome ? "Clear home zone" : "Set as home zone"}
                    title={isHome ? "Your home zone — tap to clear" : "Tap to set as your home zone"}
                    style={{
                      width:28, height:28, padding:0, flexShrink:0,
                      borderRadius:"50%",
                      border:"1px solid "+(isHome ? t.accent : t.border),
                      background: isHome ? t.accent : "transparent",
                      color: isHome ? t.accentText : t.textTertiary,
                      display:"inline-flex", alignItems:"center", justifyContent:"center",
                      cursor:"pointer", transition:"background 0.12s, color 0.12s, border-color 0.12s",
                    }}>
                    {NAV_ICONS.homeCourt(14)}
                  </button>
                )}
                {/* Zone shape glyph — bare SVG, no chip background.
                    User: 'remove the cube with bevelled edges' that
                    was sitting behind the silhouette. Sits at the
                    trailing edge of the name row via marginLeft:auto. */}
                <div style={{
                  flexShrink: 0, marginLeft: "auto",
                  display:"flex", alignItems:"center", justifyContent:"center",
                }}>
                  <ZoneShape zone={zone} size={isNarrow ? 34 : 42} stroke={zone.color} fill={zone.color + "26"} strokeWidth={1.5}/>
                </div>
              </div>
            </div>
          </div>
          {/* Close affordance — '>' chevron on both platforms per
              latest user feedback ('on mobile it has an X can you
              make it a >'). SVG line-art per the project's icon
              rule. */}
          <button onClick={onClose} aria-label="Close zone panel" style={{
            background:"transparent", border:"none", cursor:"pointer",
            color:t.textTertiary, padding:6, lineHeight:0,
            display:"flex", alignItems:"center", justifyContent:"center",
          }}>
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none"
                 stroke="currentColor" strokeWidth="1.7"
                 strokeLinecap="round" strokeLinejoin="round">
              <path d="M7 4l5 5-5 5"/>
            </svg>
          </button>
        </div>
        <div style={{ fontSize: isNarrow ? 11.5 : 12, color:t.textSecondary, marginTop: isNarrow ? 8 : 12, lineHeight:1.4 }}>{zone.blurb}</div>
      </div>

      {/* Stats row — desktop only. User feedback (mobile-only): 'I
          dont think you need to have the # players here.. that's
          already IN Zone... we can also get rid of the # locations
          and matches this week. You can keep the web as is, we have
          lots of space to use'. So on mobile the player count moves
          inline onto the 'In zone (N)' / 'Everywhere (N)' scope
          tabs, the location count folds into the 'N Courts · tap
          one…' header, and matches-this-week is dropped entirely.
          Desktop keeps the original three-stat layout. */}
      {!isNarrow && (
        <div style={{
          display:"grid",
          gridTemplateColumns: activity && activity.matches_7d > 0 ? "1fr 1fr 1fr" : "1fr 1fr",
          padding: "14px 20px", borderBottom:"1px solid "+t.border, gap: 12,
        }}>
          <div>
            <div style={{ fontSize: 20, fontWeight:700, color:t.text, lineHeight:1.1 }}>{courtsCellValue}</div>
            <div style={{ fontSize: 10, color:t.textTertiary, textTransform:"uppercase", letterSpacing:"0.08em", marginTop: 2 }}>{courtsCellLabel}</div>
          </div>
          <div>
            <div style={{ fontSize: 20, fontWeight:700, color:t.text, lineHeight:1.1 }}>{loading ? "…" : displayPlayers.length}</div>
            <div style={{ fontSize: 10, color:t.textTertiary, textTransform:"uppercase", letterSpacing:"0.08em", marginTop: 2 }}>Players here</div>
          </div>
          {activity && activity.matches_7d > 0 && (
            <div>
              <div style={{ fontSize: 20, fontWeight:700, color:"#ef4444", lineHeight:1.1 }}>🔥 {activity.matches_7d}</div>
              <div style={{ fontSize: 10, color:t.textTertiary, textTransform:"uppercase", letterSpacing:"0.08em", marginTop: 2 }}>
                Matches · This week
              </div>
            </div>
          )}
        </div>
      )}

      {/* Scrollable body — courts + players */}
      <div style={{ flex:1, overflowY:"auto", padding:"14px 20px 20px" }}>

        {/* Courts — on mobile we fold the location count INTO the
            header text ('6 Courts · tap one…') since the stats row
            above is hidden. Desktop keeps the bare 'Courts · tap…'
            because the stats row already shows the count. */}
        <div style={{ fontSize:10, color:t.textTertiary, textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:8 }}>
          {selectedCourt
            ? "Court · tap again to clear, or pick another"
            : (isNarrow && courts.length > 0
                ? (courts.length + " " + (courts.length === 1 ? "Court" : "Courts") + " · tap one to see who plays there")
                : "Courts · tap one to see who plays there")}
        </div>
        {courts.length === 0 ? (
          <div style={{ fontSize:12, color:t.textTertiary, marginBottom:16 }}>No curated courts yet.</div>
        ) : (
          <div style={{
            display:"flex", flexDirection:"column", gap:2, marginBottom:18,
            // Mobile: cap the list height to ~5 rows and let it scroll
            // internally. Desktop: render the full list uncapped.
            maxHeight: coursListMaxH ? coursListMaxH + "px" : null,
            overflowY: coursListMaxH ? "auto" : "visible",
            // Hide the scrollbar on iOS-style devices for a cleaner
            // look — the row count is short enough that absent
            // scrollbar still reads as scrollable.
            scrollbarWidth: "thin",
          }}>
            {visibleCourts.map(function (c, idx) {
              var selected = selectedCourt === c.name;
              // Plain row number — '1' / '2' / '10' etc. (no
              // leading zero pad per user). Lets the user track
              // position when the list scrolls on mobile.
              // tabular-nums keeps single- and double-digit rows
              // visually aligned along the left edge.
              var rowNum = String(idx + 1);
              // Flat row — no border, no card chrome. Selection state
              // = soft accent-tinted bg filling the whole row + bolded
              // accent-coloured text. Booking icon ghost on the right
              // with no divider line; just whitespace. Spotify x Apple
              // Maps hybrid. Distinct from the underline-tabs scope
              // picker so the two controls don't visually merge.
              return (
                <div key={c.name} style={{
                  display:"flex", alignItems:"center", gap:0,
                  borderRadius: 8,
                  background: selected ? t.accentSubtle : "transparent",
                  transition:"background 0.15s",
                }}>
                  <span aria-hidden="true" style={{
                    width: 28, flexShrink: 0,
                    paddingLeft: 8,
                    fontSize: 10.5, fontWeight: 700,
                    fontVariantNumeric: "tabular-nums",
                    letterSpacing: "0.04em",
                    color: selected ? t.accent : t.textTertiary,
                    opacity: selected ? 0.85 : 0.55,
                  }}>{rowNum}</span>
                  <button
                    onClick={function () { toggleCourt(c); }}
                    style={{
                      flex:1, minWidth:0, textAlign:"left",
                      padding:"7px 10px 7px 4px", background:"transparent", border:"none",
                      color: selected ? t.accent : t.text,
                      fontSize: 12.5,
                      fontWeight: selected ? 700 : 500,
                      letterSpacing: "-0.01em",
                      cursor:"pointer",
                      whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis",
                    }}>
                    {c.name}
                  </button>
                  {c.bookingUrl && (
                    <a href={c.bookingUrl}
                      target="_blank" rel="noopener noreferrer"
                      onClick={function (e) { e.stopPropagation(); }}
                      aria-label={"Open booking page for " + c.name + " in a new tab"}
                      title={"Book " + c.name + " (opens in a new tab)"}
                      style={{
                        display:"inline-flex", alignItems:"center", justifyContent:"center",
                        width: 28, height: 28, marginRight: 4,
                        color: selected ? t.accent : t.textTertiary,
                        textDecoration:"none", flexShrink:0,
                        opacity: selected ? 1 : 0.7,
                        transition:"opacity 0.15s, color 0.15s",
                      }}
                      onMouseEnter={function(e){ e.currentTarget.style.opacity = 1; e.currentTarget.style.color = t.accent; }}
                      onMouseLeave={function(e){ e.currentTarget.style.opacity = selected ? 1 : 0.7; e.currentTarget.style.color = selected ? t.accent : t.textTertiary; }}>
                      {NAV_ICONS.external(13)}
                    </a>
                  )}
                </div>
              );
            })}
            {/* Show-fewer / show-all expand button retired — mobile
                now scrolls the list inline (~5 rows visible) so
                every venue is reachable without an extra tap. */}
          </div>
        )}

        {/* Players list — scope toggle: "In zone" (default, home_zone match)
            vs "Everywhere" (whole user base). User feedback: sometimes
            you want to pitch a match at a court to someone who isn't a
            local. Court selection still floats home-court players to the
            top via the score function. */}
        <div style={{ fontSize:10, color:t.textTertiary, textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:6, display:"flex", justifyContent:"space-between", alignItems:"baseline" }}>
          <span>Players</span>
          {selectedCount > 0 && (
            <span style={{ fontSize:10, fontWeight:700, color:t.accent, textTransform:"none", letterSpacing:0 }}>
              {selectedCount} / {MAX_SELECT} selected
            </span>
          )}
        </div>
        {/* Scope picker — underline tabs (no borders, no fills). Same
            modern segmented language as the map-theme picker so the two
            controls feel like one system. */}
        <div style={{ display:"flex", gap:18, marginBottom:10, paddingBottom:2 }}>
          {[
            { id:"zone",       label:"In zone" },
            { id:"everywhere", label:"Everywhere" },
          ].map(function(s){
            var on = scope === s.id;
            // Mobile only: append the active-tab count inline so
            // the user still sees how many players are in the
            // current view without the (now-hidden) stats row.
            // Desktop keeps the bare label since the stats row
            // already surfaces the count above.
            var label = s.label;
            if (isNarrow && on) {
              label = label + " (" + (loading ? "…" : displayPlayers.length) + ")";
            }
            return (
              <button key={s.id} type="button"
                onClick={function(){ if(!on){ setScope(s.id); setSelectedIds([]); } }}
                style={{
                  padding:"4px 0",
                  background:"transparent",
                  border:"none",
                  borderBottom: "2px solid " + (on ? t.text : "transparent"),
                  color: on ? t.text : t.textTertiary,
                  fontSize: 12,
                  fontWeight: on ? 700 : 500,
                  letterSpacing:"0.01em",
                  cursor: on ? "default" : "pointer",
                  transition:"color 0.15s, border-color 0.15s",
                }}>
                {label}
              </button>
            );
          })}
        </div>
        {/* Anonymous nudge: signed-out viewers see blurred avatars + names
            so they can preview that "people are here" but not identify
            anyone. Surfaces a sign-in CTA below the player list. */}
        {!authUser && players.length > 0 && (
          <div style={{
            fontSize: 11, color: t.textSecondary, lineHeight: 1.5,
            background: t.accentSubtle, border: "1px solid " + t.accent + "33",
            borderRadius: 8, padding: "8px 10px", marginBottom: 10,
          }}>
            <strong style={{ color: t.text }}>{players.length} {players.length === 1 ? "player" : "players"}</strong> active in this zone — sign in to see who they are and message them.
          </div>
        )}
        {loading ? (
          <div style={{ fontSize:12, color:t.textTertiary }}>Loading…</div>
        ) : displayPlayers.length === 0 ? (
          <div style={{ fontSize:12, color:t.textTertiary, lineHeight:1.45 }}>
            {scope === "everywhere"
              ? "No players found yet. Try inviting friends to join."
              : selectedCourt
                ? "No one has tagged this court yet. Log a match here to change that."
                : ("No one has set this as their home yet." + (canSetHome && !isHome ? " Be the first." : ""))}
          </div>
        ) : (
          /* Horizontal-scroll player carousel — same swipe-friendly
             pattern as MapPlayerOverlay's picker. Replaces the
             vertical row list per user feedback ('add the player
             cards instead of the icons... slide left or right').
             Container has overflow-x:auto + flex centring so a
             short row of cards visually anchors to the centre and
             a long row scrolls; flex-shrink:0 on the cards stops
             them from compressing. */
          <div
            style={{
              display:"flex",
              gap: 8,
              justifyContent: displayPlayers.length <= 4 ? "center" : "flex-start",
              overflowX:"auto",
              overflowY:"hidden",
              scrollSnapType:"x mandatory",
              WebkitOverflowScrolling:"touch",
              padding:"4px 2px 12px",
              scrollbarWidth: "none",
              marginRight: -4, // bleed past the panel padding so the trailing card has visual room
            }}>
            {displayPlayers.map(function (p) {
              var isViewer = p.id === (authUser && authUser.id);
              var selected = selectedIds.indexOf(p.id) >= 0;
              var disabled = !authUser || isViewer || (!selected && selectedCount >= MAX_SELECT);
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={function () { togglePlayer(p); }}
                  disabled={disabled}
                  title={isViewer ? "That's you" : (disabled ? "Max selected" : (selected ? "Unselect" : "Select"))}
                  style={{
                    flexShrink: 0,
                    scrollSnapAlign: "start",
                    // 132px so 'Intermediate 2' / 'Advanced 1' etc.
                    // fit on a single chip line without ellipsis
                    // truncation. User: 'I want to make sure I
                    // read they are intermediate 2'.
                    width: 132,
                    padding: "10px 8px 12px",
                    borderRadius: 14,
                    background: selected ? t.accent : t.bgCard,
                    color: selected ? (t.accentText || "#fff") : t.text,
                    border: "1px solid " + (selected ? t.accent : t.border),
                    cursor: disabled && !selected ? "not-allowed" : "pointer",
                    opacity: disabled && !selected ? 0.55 : 1,
                    display:"flex", flexDirection:"column",
                    alignItems:"center", gap: 6,
                    boxShadow: selected
                      ? "0 8px 18px rgba(0,0,0,0.18)"
                      : "0 1px 3px rgba(0,0,0,0.06)",
                    transform: selected ? "translateY(-2px)" : "none",
                    transition:"background 0.15s, transform 0.15s, box-shadow 0.15s",
                    position:"relative",
                  }}>
                  {/* Profile chevron — sits inside the card top-right
                      so a tap on the card body still toggles select.
                      Suppressed on the viewer's own card (no profile
                      to open). pointerEvents managed via stopPropagation. */}
                  {!isViewer && onOpenProfile && authUser && (
                    <span
                      role="button"
                      tabIndex={0}
                      aria-label={"Open " + (p.name || "player") + " profile"}
                      onClick={function (e) { e.stopPropagation(); onOpenProfile(p.id); }}
                      onKeyDown={function(e){
                        if(e.key === "Enter" || e.key === " "){ e.stopPropagation(); onOpenProfile(p.id); }
                      }}
                      style={{
                        position:"absolute", top: 6, right: 6,
                        width: 22, height: 22, borderRadius: "50%",
                        background: selected ? "rgba(255,255,255,0.20)" : t.bgTertiary,
                        color: selected ? (t.accentText || "#fff") : t.textSecondary,
                        display:"flex", alignItems:"center", justifyContent:"center",
                        cursor:"pointer",
                      }}>
                      <svg width="11" height="11" viewBox="0 0 18 18" fill="none"
                           stroke="currentColor" strokeWidth="1.8"
                           strokeLinecap="round" strokeLinejoin="round">
                        <path d="M7 4l5 5-5 5"/>
                      </svg>
                    </span>
                  )}

                  {/* Avatar with selection ring */}
                  <div style={{ position:"relative" }}>
                    <PlayerAvatar
                      name={p.name} avatar={p.avatar} avatarUrl={p.avatar_url}
                      size={50} blurred={!authUser}/>
                    {selected && (
                      <span style={{
                        position:"absolute", bottom: -2, right: -2,
                        width: 18, height: 18, borderRadius:"50%",
                        background: "#fff", color: t.accent,
                        border: "2px solid " + t.accent,
                        display:"flex", alignItems:"center", justifyContent:"center",
                        fontSize: 10, fontWeight: 900, lineHeight: 1,
                      }}>✓</span>
                    )}
                    {p.playsHere && selectedCourt && !selected && (
                      <span
                        title={"Plays at " + selectedCourt}
                        aria-label={"Plays at " + selectedCourt}
                        style={{
                          position:"absolute", bottom: -2, right: -2,
                          width: 18, height: 18, borderRadius: "50%",
                          background: t.accent, color: "#fff",
                          border: "2px solid " + t.bgCard,
                          display:"flex", alignItems:"center", justifyContent:"center",
                        }}>
                        {NAV_ICONS.homeCourt(10)}
                      </span>
                    )}
                  </div>

                  {/* Name (with 'you' suffix when viewing yourself) */}
                  <div style={{
                    width: "100%",
                    fontSize: 12, fontWeight: 700,
                    letterSpacing: "-0.01em",
                    lineHeight: 1.15,
                    textAlign:"center",
                    overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap",
                    filter: !authUser ? "blur(5px)" : "none",
                  }}>
                    {p.name || "Player"}
                    {isViewer && <span style={{ opacity: 0.55, fontWeight: 500 }}> · you</span>}
                  </div>

                  {/* Skill / rating chip — full text, never
                      truncated. Card width is sized so 'INTERMEDIATE
                      2' (the longest expected label) fits in one
                      line. */}
                  {(p.skill || p.ranking_points) && (
                    <span style={{
                      padding: "2px 8px", borderRadius: 999,
                      background: selected
                        ? "rgba(255,255,255,0.20)"
                        : t.bgTertiary,
                      color: selected
                        ? (t.accentText || "#fff")
                        : t.textSecondary,
                      fontSize: 9, fontWeight: 800,
                      letterSpacing: "0.04em",
                      textTransform: "uppercase",
                      whiteSpace: "nowrap",
                    }}>
                      {p.skill ? p.skill : (p.ranking_points + " pts")}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* (Home toggle now lives inline next to the zone title, see
          header above — no footer button.) */}

      {/* Sticky action bar — visible once a player is selected. The
          single Message CTA covers doubles (≥1 recipient) and lets the
          user open a DM with someone even if they don't play at the
          selected court. Challenge was redundant — Message works in
          every case and the composer handles slot/template anyway. */}
      {showActionBar && (
        <div style={{
          padding:"12px 16px",
          borderTop:"1px solid "+t.border,
          background: t.modalBg,
          boxShadow:"0 -4px 16px rgba(0,0,0,0.06)",
        }}>
          <div style={{ fontSize:11, color:t.textSecondary, marginBottom:8, lineHeight:1.4 }}>
            <strong style={{ color:t.text }}>{selectedCount} selected</strong>
            {selectedCourt ? " · " + selectedCourt : ""}
          </div>
          <button
            onClick={function () {
              if (!onMessageSelected || !selectedPartners.length) return;
              onMessageSelected(selectedPartners, {
                venue: selectedCourt || (zone && zone.name) || "",
                zoneId: zone && zone.id,
                courtName: selectedCourt,
              });
            }}
            style={{
              width:"100%", padding:"11px", borderRadius:8, border:"none",
              background: t.accent, color: t.accentText,
              fontSize:13, fontWeight:700, cursor:"pointer",
              letterSpacing:"-0.01em",
            }}>
            Message{selectedCount > 1 ? " " + selectedCount : ""}
          </button>
        </div>
      )}
    </div>
  );
}
