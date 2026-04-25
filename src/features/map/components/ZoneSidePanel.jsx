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

import { useEffect, useState } from "react";
import PlayerAvatar from "../../../components/ui/PlayerAvatar.jsx";
import { courtsInZone } from "../data/courts.js";
import { fetchPlayersInZone, fetchPlayersAtCourt, scorePlayerForCourt, fetchPublicPlayersCountInZone } from "../services/mapService.js";
import { NAV_ICONS } from "../../../lib/constants/navIcons.jsx";

var MAX_SELECT = 3; // 3 others + viewer = 4 for doubles

export default function ZoneSidePanel({
  t, zone, onClose,
  authUser, profile, homeZone, onSetHome, onClearHome,
  onOpenProfile, activity,
  // onMessageSelected(partners[], slotHints) — array, supports doubles.
  onMessageSelected,
  // Asymmetric block — viewer's blocked-user list is forwarded into
  // the player-fetch services so blocked users are dropped before
  // they ever render.
  blockedUserIds,
}){
  var [players,setPlayers]=useState([]);
  var [loading,setLoading]=useState(false);

  // Single-selected court (by name) and multi-selected player ids.
  // Local to the panel — if a user closes it we reset, which matches
  // the user's mental model of "this is my current workspace".
  var [selectedCourt, setSelectedCourt] = useState(null);
  var [selectedIds, setSelectedIds]     = useState([]);
  // Player list scope: "zone" (default, home_zone match in this zone)
  // or "everywhere" (whole user base, ranked the same way). Lets the
  // viewer pitch a match at a court to someone who isn't a local.
  var [scope, setScope] = useState("zone");

  // Clear selection whenever the panel closes / switches zones.
  useEffect(function () {
    setSelectedCourt(null);
    setSelectedIds([]);
  }, [zone && zone.id]);

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
  var totalCourts = courts.reduce(function(n,c){ return n + c.courts; }, 0);
  var isHome = homeZone === zone.id;
  var canSetHome = !!authUser;

  function toggleCourt(c) {
    setSelectedCourt(function (prev) { return prev === c.name ? null : c.name; });
    setSelectedIds([]); // resetting players when changing court avoids a stale "selected" chip for someone who isn't in the new list
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
      // Width caps at 360px on desktop and shrinks to fit narrow phones
      // (~340–390px) without overflowing — fixed 360 used to bleed off
      // the right edge on small screens, which is what made the page
      // feel like it needed manual resizing.
      position:"absolute", top:0, right:0, bottom:0,
      width:"100%", maxWidth:360,
      background: t.bgCard, borderLeft: "1px solid "+t.border,
      display:"flex", flexDirection:"column", zIndex:500,
      boxShadow:"-8px 0 32px rgba(0,0,0,0.06)",
    }}>

      {/* Header — inline home-toggle next to the title (council fix:
          the old "Set as home / Clear" footer button was too prominent
          for what's a one-tap toggle). Same icon doubles as indicator
          and action: filled-accent when this zone is the viewer's home,
          outlined neutral otherwise. */}
      <div style={{ padding:"20px 20px 16px", borderBottom:"1px solid "+t.border }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:12 }}>
          <div style={{ display:"flex", gap:12, alignItems:"center", flex:1, minWidth:0 }}>
            <div style={{
              width:36, height:36, borderRadius:"50%", background: zone.color,
              display:"flex", alignItems:"center", justifyContent:"center",
              color:"#fff", fontWeight:700, fontSize:16, flexShrink:0,
              boxShadow:"0 0 0 3px "+t.bgCard,
            }}>{zone.num}</div>
            <div style={{ minWidth:0, flex:1 }}>
              <div style={{ fontSize:10, letterSpacing:"0.1em", color:t.textTertiary, textTransform:"uppercase", marginBottom:2 }}>Zone {zone.num}</div>
              <div style={{ display:"flex", alignItems:"center", gap:6, minWidth:0 }}>
                <div style={{ fontSize:18, fontWeight:700, color:t.text, letterSpacing:"-0.02em", lineHeight:1.15, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", minWidth:0 }}>
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
              </div>
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
        display:"grid",
        gridTemplateColumns: activity && activity.matches_7d > 0 ? "1fr 1fr 1fr" : "1fr 1fr",
        padding:"14px 20px", borderBottom:"1px solid "+t.border, gap:12,
      }}>
        <div>
          <div style={{ fontSize:20, fontWeight:700, color:t.text }}>{totalCourts}</div>
          <div style={{ fontSize:10, color:t.textTertiary, textTransform:"uppercase", letterSpacing:"0.08em", marginTop:2 }}>Courts nearby</div>
        </div>
        <div>
          <div style={{ fontSize:20, fontWeight:700, color:t.text }}>{loading ? "…" : displayPlayers.length}</div>
          <div style={{ fontSize:10, color:t.textTertiary, textTransform:"uppercase", letterSpacing:"0.08em", marginTop:2 }}>Players here</div>
        </div>
        {activity && activity.matches_7d > 0 && (
          <div>
            <div style={{ fontSize:20, fontWeight:700, color:"#ef4444" }}>🔥 {activity.matches_7d}</div>
            <div style={{ fontSize:10, color:t.textTertiary, textTransform:"uppercase", letterSpacing:"0.08em", marginTop:2 }}>
              Matches · 7d
            </div>
          </div>
        )}
      </div>

      {/* Scrollable body — courts + players */}
      <div style={{ flex:1, overflowY:"auto", padding:"14px 20px 20px" }}>

        {/* Courts */}
        <div style={{ fontSize:10, color:t.textTertiary, textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:8 }}>
          {selectedCourt ? "Court · tap again to clear, or pick another" : "Courts · tap one to see who plays there"}
        </div>
        {courts.length === 0 ? (
          <div style={{ fontSize:12, color:t.textTertiary, marginBottom:16 }}>No curated courts yet.</div>
        ) : (
          <div style={{ display:"flex", flexDirection:"column", gap:6, marginBottom:18 }}>
            {courts.map(function (c) {
              var selected = selectedCourt === c.name;
              return (
                <div key={c.name} style={{
                  display:"flex", alignItems:"stretch", gap:0,
                  borderRadius:8,
                  border:"1px solid "+(selected ? t.accent : t.border),
                  background: selected ? t.accentSubtle : t.bgTertiary,
                  overflow:"hidden",
                  transition:"background 0.15s, border-color 0.15s",
                }}>
                  <button
                    onClick={function () { toggleCourt(c); }}
                    style={{
                      flex:1, minWidth:0, textAlign:"left",
                      padding:"9px 11px", background:"transparent", border:"none",
                      color: selected ? t.accent : t.text,
                      fontSize:12, fontWeight: selected ? 700 : 500,
                      cursor:"pointer",
                      display:"flex", alignItems:"center", gap:8,
                    }}>
                    <span style={{
                      width:14, height:14, borderRadius:"50%",
                      border:"1.5px solid "+(selected ? t.accent : t.border),
                      background: selected ? t.accent : "transparent",
                      flexShrink:0, position:"relative",
                    }}>
                      {selected && (
                        <span style={{
                          position:"absolute", inset:0, display:"flex",
                          alignItems:"center", justifyContent:"center",
                          color:"#fff", fontSize:10, fontWeight:900, lineHeight:1,
                        }}>✓</span>
                      )}
                    </span>
                    <span style={{ overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                      {c.name}
                    </span>
                  </button>
                  {c.bookingUrl && (
                    <a href={c.bookingUrl}
                      target="_blank" rel="noopener noreferrer"
                      onClick={function (e) { e.stopPropagation(); }}
                      aria-label={"Open booking page for " + c.name + " in a new tab"}
                      title={"Book " + c.name + " (opens in a new tab)"}
                      style={{
                        display:"inline-flex", alignItems:"center", justifyContent:"center",
                        padding:"0 12px", borderLeft:"1px solid "+t.border,
                        color:t.accent, textDecoration:"none", flexShrink:0,
                      }}>
                      {NAV_ICONS.external(14)}
                    </a>
                  )}
                </div>
              );
            })}
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
                {s.label}
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
          <div style={{ display:"flex", flexDirection:"column", gap:4 }}>
            {displayPlayers.map(function (p) {
              var isViewer = p.id === (authUser && authUser.id);
              var selected = selectedIds.indexOf(p.id) >= 0;
              var disabled = !authUser || isViewer || (!selected && selectedCount >= MAX_SELECT);
              return (
                <div key={p.id} style={{
                  display:"flex", alignItems:"center", gap:8,
                  padding:"7px 8px", borderRadius:8,
                  background: selected ? t.accentSubtle : "transparent",
                  border:"1px solid "+(selected ? t.accent : "transparent"),
                  opacity: disabled && !selected ? 0.55 : 1,
                }}>
                  {/* Checkbox affordance — full row toggles selection when clickable. */}
                  <button
                    onClick={function () { togglePlayer(p); }}
                    disabled={disabled}
                    title={isViewer ? "That's you" : (disabled ? "Max selected" : (selected ? "Unselect" : "Select for doubles"))}
                    style={{
                      display:"flex", alignItems:"center", gap:10,
                      padding:0, background:"transparent", border:"none",
                      textAlign:"left", cursor: disabled ? "not-allowed" : "pointer",
                      flex:1, minWidth:0,
                    }}>
                    <span style={{
                      width:18, height:18, borderRadius:4,
                      border:"1.5px solid "+(selected ? t.accent : t.border),
                      background: selected ? t.accent : "transparent",
                      display:"flex", alignItems:"center", justifyContent:"center",
                      flexShrink:0,
                      color:"#fff", fontSize:10, fontWeight:900, lineHeight:1,
                    }}>
                      {selected ? "✓" : ""}
                    </span>
                    <PlayerAvatar name={p.name} avatar={p.avatar} avatarUrl={p.avatar_url} size={30} blurred={!authUser}/>
                    <div style={{ minWidth:0, flex:1 }}>
                      <div style={{ display:"flex", alignItems:"center", gap:5, minWidth:0 }}>
                        <span style={{ fontSize:13, color:t.text, fontWeight:600, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", minWidth:0,
                          filter: !authUser ? "blur(5px)" : "none" }}>
                          {p.name}
                          {isViewer && <span style={{ color:t.textTertiary, fontWeight:400 }}> · you</span>}
                        </span>
                        {p.playsHere && selectedCourt && (
                          <span
                            title={"Plays at " + selectedCourt}
                            style={{
                              display:"inline-flex", alignItems:"center", gap:3,
                              color: t.accent, flexShrink:0,
                            }}>
                            {NAV_ICONS.homeCourt(12)}
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize:11, color:t.textTertiary, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                        {[(p.skill||""), (p.ranking_points ? p.ranking_points + " pts" : "")]
                          .filter(Boolean).join(" · ")}
                      </div>
                    </div>
                  </button>
                  {/* Profile link — small chevron; separate from the
                      checkbox toggle so the row's main hit region is
                      the selection. */}
                  {!isViewer && onOpenProfile && (
                    <button
                      onClick={function (e) { e.stopPropagation(); onOpenProfile(p.id); }}
                      title="View profile"
                      style={{
                        background:"transparent", border:"1px solid "+t.border,
                        borderRadius:6, padding:"3px 8px",
                        color:t.textSecondary, fontSize:10, fontWeight:600,
                        cursor:"pointer", flexShrink:0,
                      }}>
                      Profile
                    </button>
                  )}
                </div>
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
