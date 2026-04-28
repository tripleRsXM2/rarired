// src/features/map/components/LeafletMap.jsx
//
// Thin wrapper over Leaflet. Renders:
//   • Carto positron basemap (light) or dark-matter (dark) depending on theme
//   • six zone polygons (hand-tuned, see data/zones.js)
//   • court markers as small circled rackets
//   • a home pin at the user's declared home_zone centroid (if any)
//
// State (hover/selected) is owned by the parent MapTab; we just render.

import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
// Marker clustering — at city zoom we have ~52 court markers crammed
// into a small frame which read as visual noise. The cluster plugin
// merges nearby markers into a count badge until the user zooms in.
import "leaflet.markercluster";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";
import { ZONES, ZONE_BY_ID } from "../data/zones.js";
import { COURTS } from "../data/courts.js";

// Pick a basemap tile set that reads OK against the current theme.
// Dark themes (hard-court, night-court) use dark-matter; light themes use
// positron. Both are "nolabels" — we deliberately don't layer streetnames
// or suburb labels on top so the zones read as the primary content.
//
// `override` lets the layers panel force a specific basemap regardless of
// the app theme — some users want a dark map even in light app mode (and
// vice versa). "auto" defers to the app theme; "light"/"dark" override.
function resolveDark(theme, override){
  if(override === "light") return false;
  if(override === "dark")  return true;
  return theme === "hard-court" || theme === "night-court";
}
function tileUrlFor(theme, override){
  return resolveDark(theme, override)
    ? "https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png"
    : "https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png";
}

// Zone-name label HTML — a small all-caps eyebrow set at each zone's
// rendered centroid. Letter-spaced, white drop-shadow halo so it's
// readable on either light or dark basemaps. Non-interactive (the
// underlying polygon still receives clicks).
function zoneNameLabelHtml(z, isDark){
  var color = isDark ? "rgba(255,255,255,0.92)" : "rgba(20,18,17,0.85)";
  var halo  = isDark
    ? "0 0 3px rgba(0,0,0,0.85), 0 1px 2px rgba(0,0,0,0.85)"
    : "0 0 3px rgba(255,255,255,0.95), 0 1px 2px rgba(255,255,255,0.85)";
  return (
    '<div style="font: 800 10px/1 system-ui,sans-serif;' +
      'letter-spacing:0.16em;text-transform:uppercase;' +
      'color:' + color + ';text-shadow:' + halo + ';' +
      'white-space:nowrap;pointer-events:none;text-align:center">' +
      z.name +
    '</div>'
  );
}

// Shorten verbose venue names for tight on-map labels. We're already
// in a tennis app + the "tennis" context is implied by being on the
// map, so dropping " Tennis Centre" / " Tennis Courts" / " Tennis"
// suffixes typically halves the label width without losing meaning.
function shortenCourtName(name){
  if(!name) return "";
  // Parenthetical first so a name like "Foo Tennis Centre (The Ark)"
  // becomes "Foo Tennis Centre" and the suffix strip below catches
  // it on the next pass.
  return String(name)
    .replace(/\s+\(.*?\)$/, "")
    .replace(/\s+Tennis Centre$/i, "")
    .replace(/\s+Tennis Courts$/i, "")
    .replace(/\s+Tennis Club$/i, "")
    .replace(/\s+Tennis$/i, "")
    .trim();
}

var COURT_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="1"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="12" y1="5" x2="12" y2="19"/><line x1="7" y1="9" x2="7" y2="15"/><line x1="17" y1="9" x2="17" y2="15"/></svg>';

// (HOME_SVG retired — the home indicator is now baked directly into
// the zone-number label as a house-shaped badge. See zoneLabelHtml.)

// Council decision: drop the floating zone-name labels from the map.
// They duplicated the bottom-left hover tooltip + the side-panel
// header, and overlapped court markers. We still want a quick visual
// for *home* and *active* zones at a glance, so render a minimal
// centroid badge only when there's something to say. Empty zones
// are unlabelled — the polygon colour + tooltip carry the rest.
//
// Returns null when there's nothing worth painting (saves a marker
// per zone in the common case).
function zoneCentroidBadgeHtml(z, activity, isHome, showHomes, showActivity) {
  // Each layer toggles independently — homes via showHomes, flame
  // (activity) badges via showActivity. Returns null if both toggles
  // suppress the badge so we render no marker at all (saves DOM).
  var paintHome  = isHome && showHomes !== false;
  var hasFlame   = showActivity !== false && activity && activity.matches_7d > 0;
  if (!paintHome && !hasFlame) return null;

  var homeBadge = paintHome
    ? ('<div style="width:32px;height:32px;border-radius:50%;background:' + z.color + ';' +
         'box-shadow:0 1px 3px rgba(0,0,0,0.25),0 0 0 3px rgba(255,255,255,0.92);' +
         'display:flex;align-items:center;justify-content:center">' +
         '<svg width="16" height="16" viewBox="0 0 18 18" fill="none">' +
           '<path d="M3 8l6-5 6 5v6a1 1 0 0 1 -1 1H4a1 1 0 0 1 -1-1V8z" ' +
                 'stroke="#fff" stroke-width="1.7" stroke-linejoin="round"/>' +
           '<path d="M7 15v-4h4v4" ' +
                 'stroke="#fff" stroke-width="1.7" stroke-linejoin="round"/>' +
         '</svg>' +
       '</div>')
    : '';

  var flame = hasFlame
    ? ('<div class="cs-flame" style="margin-top:3px;font-size:10px;font-weight:800;letter-spacing:0.02em;' +
        'color:#fff;background:rgba(239,68,68,0.95);padding:2px 8px;border-radius:12px;' +
        'box-shadow:0 1px 2px rgba(0,0,0,0.25)">🔥 ' + activity.matches_7d + '</div>')
    : '';

  return (
    '<div style="display:flex;flex-direction:column;align-items:center;gap:0;pointer-events:none">' +
      homeBadge + flame +
    '</div>'
  );
}

export default function LeafletMap({
  t, theme, hovered, selected, homeZone, zoneActivity,
  onHover, onSelect, onCourtSelect,
  // Independent layer toggles, controlled by the on-map cog panel in
  // MapTab. All default true; flipping any one off removes that layer
  // without touching the others. Zone colors are NEVER toggled — they
  // are identifying chrome, not an overlay.
  showHomes = true,
  showCourts = true,
  showActivity = true,
  showZoneNames = true,
  // When set (a venue name string), the map enters focus mode:
  // the cluster group is hidden and only that one venue's marker
  // is shown. Driven by the side panel's inline court selection.
  focusedCourtName = null,
  // Map-native Play Match flow.
  //   "off"   — normal map
  //   "zone"  — picking a zone; non-hovered zones dim slightly
  //   "court" — zone picked; other zones heavy-dim, fit to that
  //             zone, courts get permanent name labels
  playMode = "off",
  playZoneId = null,
  // Set when playMode === "players" — the venue the user picked
  // before reaching the player picker. We reframe the map onto
  // this court so it sits dead-centre under the floating cards.
  playCourtName = null,
  // Phone breakpoint — drives tighter padding on the auto-fit so
  // Sydney's bbox actually fills the viewport instead of floating
  // inside ugly whitespace on a 400px-wide screen.
  isMobile = false,
  // Map basemap override: "auto" follows app theme (default), "light"
  // forces positron, "dark" forces dark-matter. Lives in the cog
  // panel so users can read a dark map in a light app and vice versa.
  mapThemeOverride = "auto",
}){
  var elRef = useRef(null);
  var mapRef = useRef(null);
  var zoneLayersRef = useRef({});    // id -> L.polygon
  var zoneLabelsRef = useRef({});    // id -> L.marker (number + name)
  var zoneCentersRef = useRef({});   // id -> [lat,lng] of the actually-rendered
                                     //   polygon's bounding-box centre. Used by
                                     //   both the label and the home pin so they
                                     //   always line up with what's drawn, even
                                     //   when the source GeoJSON is missing some
                                     //   of a zone's member suburbs.
  // Home pin retired (see zoneLabelHtml — home is baked into the label).
  // var homePinRef = useRef(null);
  var tileLayersRef = useRef({ base: null });
  var zoneNameLayersRef = useRef({}); // id -> L.marker (zone-name eyebrow)
  // Court cluster group is held in a ref so the showCourts toggle can
  // add/remove the whole layer without rebuilding markers each flip.
  var courtClusterRef = useRef(null);
  // Markers grouped by zone id so the "selected zone hides other-zone
  // courts" effect can add/remove them from the cluster without
  // rebuilding the whole layer. User feedback (web): 'when picking
  // courts... the courts that fall in the other zones are still
  // visible. can you hide those?'
  var courtMarkersByZoneRef = useRef({});
  // Solo highlight marker shown when focusedCourtName is set —
  // cluster hides, this single marker takes over.
  var soloMarkerRef = useRef(null);
  // Map-native play-court-mode markers — one per court in the
  // chosen zone, each with a permanent name tooltip.
  var playCourtsRef = useRef([]);
  // Marker-cluster group used in court mode so dense areas show
  // the same "N" bubble pattern as the main map. Individual courts
  // (when not clustered) render with a dot + caps label below.
  var playZoneClusterRef = useRef(null);
  // Mirrors playMode for any deferred callback (setTimeout from
  // zoomend, etc.) so they read the CURRENT mode rather than the
  // stale closure value at the time they were scheduled. Without
  // this a pending render-after-zoom that fires post-back-out
  // would re-add court markers after cleanup wiped them.
  var playModeRef = useRef(playMode);
  playModeRef.current = playMode;
  // Same closure-ref pattern for `selected` — used by the
  // ResizeObserver below to decide whether to re-fit on resize.
  var selectedRef = useRef(selected);
  selectedRef.current = selected;

  // Stash onCourtSelect in a ref so the init effect (which runs once) always
  // reads the latest callback — otherwise the first render's closure sticks.
  var courtSelectRef = useRef(onCourtSelect);
  courtSelectRef.current = onCourtSelect;
  // Same closure-fix pattern for onSelect + onHover. Polygon click
  // handlers are wired once in init; without the ref they'd hold a
  // stale onSelect — the parent's handleSelect captures `playMode`
  // in its closure, so a stale handleSelect sees playMode="off"
  // forever and the play-mode branch never fires. THIS was the
  // "click does nothing" bug in the map-native flow.
  var selectRef = useRef(onSelect);
  selectRef.current = onSelect;
  var hoverRef = useRef(onHover);
  hoverRef.current = onHover;

  // Init map once. Re-render policy: don't destroy/recreate on theme change;
  // swap the tile layers in place in a separate effect below.
  useEffect(function(){
    if(!elRef.current || mapRef.current) return;
    var map = L.map(elRef.current, {
      // Zoom +/- buttons retired — users still get pinch + scroll
      // zoom; the chrome was just visual noise top-left and
      // competed with the title pill.
      zoomControl: false,
      // Custom attribution config — drops the default "Leaflet"
      // prefix (legally optional, visually noisy) and keeps only
      // the OSM/CARTO licence-required attribution. Styled small
      // via CSS in providers.jsx.
      attributionControl: false,
      preferCanvas: true,
      // Continuous (non-snapping) zoom so the auto-fit can land at
      // ANY zoom that frames the bbox cleanly — not just integer
      // 12 / 13 / 14. The integer snap was the source of "the map
      // looks ugly small" on mobile: a 6-zone Sydney bbox would
      // fitBounds and zoomSnap:1 would round DOWN to a level that
      // left ugly whitespace, then jump UP to a level that cropped
      // the polygons. zoomSnap:0 lets fitBounds compute the exact
      // fractional zoom that fills the frame edge-to-edge.
      // zoomDelta:0.5 keeps keyboard +/- nav coarse-grained so
      // accessibility users still feel a discrete step.
      zoomSnap: 0,
      zoomDelta: 0.5,
      wheelPxPerZoomLevel: 80,
    });
    L.control.attribution({
      prefix: false, // drop the "Leaflet" word
      position: "bottomright",
    }).addTo(map);

    var base = L.tileLayer(tileUrlFor(theme, mapThemeOverride), {
      attribution: "© OSM · © CARTO",
      subdomains: "abcd",
      maxZoom: 19,
    }).addTo(map);
    tileLayersRef.current.base = base;

    // Zone polygons — each zone may have 1..N outer shapes (MultiPolygon).
    // Leaflet accepts a list of rings; we pass the whole array so holes and
    // disjoint pieces both render under a single layer.
    var allZoneLayers = [];
    ZONES.forEach(function(z){
      var shapes = (z.polygons && z.polygons.length) ? z.polygons : [];
      var poly = L.polygon(shapes, {
        color: z.color, weight: 2, opacity: 0.9,
        fillColor: z.color, fillOpacity: 0.42,
        smoothFactor: 0.5,
      }).addTo(map);
      allZoneLayers.push(poly);
      poly.on("mouseover", function(){ if(hoverRef.current) hoverRef.current(z.id); });
      poly.on("mouseout",  function(){ if(hoverRef.current) hoverRef.current(null); });
      poly.on("click",     function(){ if(selectRef.current) selectRef.current(z.id); });
      zoneLayersRef.current[z.id] = poly;

      // Derive the label position from the actual rendered shape's bbox
      // centre instead of the hardcoded z.center — the GeoJSON is missing a
      // handful of member suburbs for some zones (e.g. Palm Beach is absent
      // from Northern Beaches), which pulls the "true" centroid off the
      // visible polygon.
      var bbCenter = poly.getBounds().getCenter();
      var labelLatLng = [bbCenter.lat, bbCenter.lng];
      zoneCentersRef.current[z.id] = labelLatLng;

      // Floating zone label retired (council decision — labels duplicated
      // the bottom-left hover tooltip + the side-panel header, and
      // overlapped court markers). Centroid markers below render only
      // when there's a signal worth showing (home + activity), via the
      // refresh effect downstream.
      zoneLabelsRef.current[z.id] = null;
    });

    // Fit the view to the union of all zone polygons so the zones fill
    // the visible map instead of floating inside extra whitespace.
    if(allZoneLayers.length){
      var group = L.featureGroup(allZoneLayers);
      // Asymmetric padding so the bbox doesn't crash into the
      // floating chrome. On mobile the bottom prompt + Play Match
      // CTA stack ~150px tall; on desktop both are smaller and
      // there's room to spare. paddingTopLeft / paddingBottomRight
      // are [x, y] — y is what we care about for the prompt.
      // Combined with zoomSnap:0 (set on map init) the fit can land
      // at ANY fractional zoom that fills the available frame —
      // no "rounded down to ugly whitespace" artefact.
      map.fitBounds(group.getBounds(), {
        paddingTopLeft:     isMobile ? [12, 24] : [24, 24],
        paddingBottomRight: isMobile ? [12, 96] : [24, 80],
        maxZoom: 14,
      });
    }

    // Hard-refresh sizing race fix: on first paint the container
    // may not have its final dimensions yet (CSS / dvh / flex layout
    // settles after Leaflet measures), so the initial fitBounds
    // computes off the wrong size and the map renders mis-centred.
    // ResizeObserver fires invalidateSize + re-fits whenever the
    // container changes size — covers hard-refresh, browser-resize,
    // sidebar-collapse, orientation flip, etc.
    var ro = null;
    if(typeof ResizeObserver !== "undefined"){
      ro = new ResizeObserver(function(){
        try { map.invalidateSize(); } catch(_){}
        // Re-fit only when no zone is selected and we're not in
        // play mode — those modes own their own framing.
        if(!selectedRef.current && playModeRef.current === "off" && allZoneLayers.length){
          try {
            map.fitBounds(L.featureGroup(allZoneLayers).getBounds(), {
              paddingTopLeft:     isMobile ? [12, 24]  : [24, 24],
              paddingBottomRight: isMobile ? [12, 96]  : [24, 80],
              maxZoom: 14,
              animate: false,
            });
          } catch(_){}
        }
      });
      ro.observe(elRef.current);
    }
    // Belt-and-braces: a deferred invalidateSize after the first
    // paint cycle in case the ResizeObserver doesn't fire (some
    // older browsers don't trigger it for the initial layout).
    setTimeout(function(){
      try { map.invalidateSize(); } catch(_){}
      if(!selectedRef.current && playModeRef.current === "off" && allZoneLayers.length){
        try {
          map.fitBounds(L.featureGroup(allZoneLayers).getBounds(), {
            paddingTopLeft:     isMobile ? [12, 24] : [24, 24],
            paddingBottomRight: isMobile ? [12, 96] : [24, 80],
            maxZoom: 14,
            animate: false,
          });
        } catch(_){}
      }
    }, 60);

    // Zoom-aware label visibility — UI council rule: at broad zoom
    // (city-fit) zone names and activity flames are hidden because
    // they collide with cluster numbers. The layers panel toggles
    // (zoneNames / activity) become MAX preferences — they still
    // respect this zoom rule on top. Apple Maps / Mapbox pattern.
    // Threshold 13: zoom 11-12 hides, zoom 13+ shows.
    function applyBroadZoomFlag(){
      var z = map.getZoom();
      var broad = z < 13;
      var c = map.getContainer();
      if(broad){ c.setAttribute("data-broad-zoom","true"); }
      else     { c.removeAttribute("data-broad-zoom"); }
    }
    map.on("zoomend", applyBroadZoomFlag);
    applyBroadZoomFlag();

    // Court markers — clustered at low zoom so the city view doesn't
    // drown in 50+ overlapping pins. Each cluster paints a count badge
    // ("12") and expands when the user zooms in or taps. Individual
    // markers behave the same as before (tap opens CourtInfoCard via
    // onCourtSelect).
    var clusterGroup = L.markerClusterGroup({
      showCoverageOnHover: false,
      // Cluster aggressively at city zoom, ease off as the user
      // zooms in. spiderfy lets a tight cluster expand into a
      // halo on tap rather than forcing another zoom-in.
      spiderfyOnMaxZoom: true,
      disableClusteringAtZoom: 15,
      maxClusterRadius: 60,
      iconCreateFunction: function (cluster) {
        var n = cluster.getChildCount();
        // Cluster bubble — solid dark fill, white tabular-nums.
        // Restores the contrast user originally liked (dark # vs
        // white court dots). CTA hierarchy is preserved through
        // SIZE (88px CTA vs 28px cluster) + POSITION (bottom-centre
        // vs zone centroid), not colour.
        return L.divIcon({
          className: "cs-court-cluster",
          html:
            '<div style="box-sizing:border-box;width:28px;height:28px;border-radius:50%;' +
              'background:#14110f;color:#fff;' +
              'display:flex;align-items:center;justify-content:center;' +
              'box-shadow:0 2px 8px rgba(0,0,0,0.22);' +
              'font:700 12px/1 ui-sans-serif,system-ui,sans-serif;' +
              'font-variant-numeric:tabular-nums;letter-spacing:-0.02em">' + n + '</div>',
          iconSize: [28, 28], iconAnchor: [14, 14],
        });
      },
    });
    // Mobile bumps the visible white dot + the hit box ~+10% per user
    // feedback: 'increase the white circles by 10%. sometimes when
    // zooming in, its hard to press'. 14→16 visible, 26→29 hit box.
    var courtDotPx = isMobile ? 16 : 14;
    var courtHitPx = isMobile ? 29 : 26;
    var courtHitAnchor = Math.round(courtHitPx / 2);
    COURTS.forEach(function(c){
      // Default court marker — minimalist solid white dot. The visible
      // dot is sized just above the eye and the icon (hit) box is
      // a comfortable tap target. Soft shadow + hairline ring keep
      // it readable on both light + dark basemaps.
      var html =
        '<div style="width:' + courtHitPx + 'px;height:' + courtHitPx + 'px;display:flex;align-items:center;justify-content:center">' +
          '<div style="box-sizing:border-box;width:' + courtDotPx + 'px;height:' + courtDotPx + 'px;border-radius:50%;background:#fff;' +
            'box-shadow:0 1px 3px rgba(0,0,0,0.28),0 0 0 1px rgba(20,18,17,0.18);' +
            'cursor:pointer"></div>' +
        '</div>';
      var m = L.marker([c.lat, c.lng], {
        icon: L.divIcon({ className: "", html: html, iconSize: [courtHitPx, courtHitPx], iconAnchor: [courtHitAnchor, courtHitAnchor] }),
        zIndexOffset: 1000,
      });
      m.bindTooltip(
        '<div style="font:500 11px/1.3 system-ui,sans-serif"><b>' + c.name + '</b></div>',
        { direction: "top", offset: [0,-10], opacity: 1 }
      );
      m.on("click", function(){
        if(courtSelectRef.current) courtSelectRef.current(c);
      });
      clusterGroup.addLayer(m);
      // Index by zone for the "selected zone hides other zones'
      // courts" effect below.
      if(c.zone){
        if(!courtMarkersByZoneRef.current[c.zone]) courtMarkersByZoneRef.current[c.zone] = [];
        courtMarkersByZoneRef.current[c.zone].push(m);
      }
    });
    courtClusterRef.current = clusterGroup;
    if(showCourts) map.addLayer(clusterGroup);

    mapRef.current = map;
    return function(){
      try { if(ro) ro.disconnect(); } catch(_){}
      map.remove();
      mapRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[]);

  // Swap tile layers when the app theme OR the user's map-theme
  // override changes (keeps zoom / center / selection state). Zone-
  // name eyebrows also re-render so their halo colour stays readable
  // (white halo on dark map, dark halo on light map).
  useEffect(function(){
    var map = mapRef.current;
    if(!map || !tileLayersRef.current.base) return;
    map.removeLayer(tileLayersRef.current.base);
    var base = L.tileLayer(tileUrlFor(theme, mapThemeOverride), {
      attribution: "© OSM · © CARTO",
      subdomains: "abcd", maxZoom: 19,
    }).addTo(map);
    tileLayersRef.current.base = base;
    // Zone-name labels redraw via their own effect (depends on theme).
  },[theme, mapThemeOverride]);

  // Zone-name eyebrows — small all-caps labels at each zone centroid,
  // toggleable via the layers panel. Re-rendered when the toggle flips
  // OR the theme changes (halo colour depends on dark/light basemap).
  useEffect(function(){
    var map = mapRef.current;
    if(!map) return;
    // Wipe previous markers first — simpler than reconciling a delta.
    Object.keys(zoneNameLayersRef.current).forEach(function(id){
      var m = zoneNameLayersRef.current[id];
      if(m) map.removeLayer(m);
    });
    zoneNameLayersRef.current = {};
    // Hide all peripheral chrome during play mode — user picks zones
    // / courts only, no other labels distract.
    if(!showZoneNames || playMode !== "off") return;
    var isDark = resolveDark(theme, mapThemeOverride);
    ZONES.forEach(function(z){
      var center = zoneCentersRef.current[z.id] || z.center;
      if(!center) return;
      var marker = L.marker(center, {
        icon: L.divIcon({
          className: "cs-zone-name",
          html: zoneNameLabelHtml(z, isDark),
          iconSize: [140, 16],
          // Rule (locked): zone names must never overlap the cluster
          // number bubbles. Clusters sit AT the centroid (28px tall,
          // anchored centre → 14px above centroid). Pushing the
          // label anchor down to 51 (icon height 16 + 35 below)
          // means the label paints 35px ABOVE the centroid, leaving
          // ~21px of clearance above any cluster bubble.
          iconAnchor: [70, 51],
        }),
        interactive: false,
        // Sit above polygons (z 400) but below courts (z 600 via
        // zIndexOffset 1000) so a court marker pinned at the centroid
        // doesn't disappear under the label.
        zIndexOffset: 200,
      }).addTo(map);
      zoneNameLayersRef.current[z.id] = marker;
    });
  },[showZoneNames, theme, mapThemeOverride, playMode]);

  // Court visibility — coordinates THREE toggles:
  //   1. showCourts (layers panel) — hide the whole layer entirely
  //   2. focusedCourtName (side panel pin) — show ONLY that venue
  //   3. playMode === "court" — hide cluster, show all courts in
  //      the chosen zone with permanent name labels (map-native
  //      step-2 of the Play Match flow)
  useEffect(function(){
    var map = mapRef.current;
    var cluster = courtClusterRef.current;
    if(!map || !cluster) return;

    var inFocus    = !!focusedCourtName;
    var inPlayCourt   = playMode === "court" && !!playZoneId;
    var inPlayZone    = playMode === "zone";
    var inPlayPlayers = playMode === "players" && !!playCourtName;
    // Cluster stays visible during side-panel court focus (user
    // feedback: 'instead of hiding the others, can we grey and make
    // them less noticeable'). Dimming is done via CSS — see the
    // data-court-focus attribute set below + providers.jsx rule.
    // Still hidden during play-mode flows since those have their own
    // dedicated court rendering.
    var showCluster = showCourts && !inPlayCourt && !inPlayZone && !inPlayPlayers;
    // Solo focus marker — visible when in side-panel focus mode OR
    // when in the map-native players step (where we want exactly
    // ONE marker on the picked court, anchoring the venue).
    var showSolo    = (inFocus || inPlayPlayers) && !inPlayZone && !inPlayCourt;
    // Which name to render the solo marker for. Players mode wins
    // over the side-panel focus, since playCourtName is the more
    // specific signal in that flow.
    var soloName    = inPlayPlayers ? playCourtName : focusedCourtName;

    // Cluster visibility
    if(showCluster){
      if(!map.hasLayer(cluster)) map.addLayer(cluster);
    } else {
      if(map.hasLayer(cluster)) map.removeLayer(cluster);
    }
    // When a zone is selected (default mode), hide courts that
    // belong to OTHER zones — only the picked zone's courts remain
    // tappable. Restores all courts to the cluster when nothing is
    // selected. User feedback: 'when picking courts... the courts
    // that fall in the other zones are still visible. can you hide
    // those?'
    if(showCluster){
      var byZone = courtMarkersByZoneRef.current || {};
      Object.keys(byZone).forEach(function(zoneId){
        var markers = byZone[zoneId] || [];
        var shouldShow = !selected || zoneId === selected;
        markers.forEach(function(mk){
          var has = cluster.hasLayer(mk);
          if(shouldShow && !has) cluster.addLayer(mk);
          else if(!shouldShow && has) cluster.removeLayer(mk);
        });
      });
    }
    // data-court-focus drives the CSS dim rule in providers.jsx —
    // when a side-panel court is pinned, every cluster child marker
    // fades to ~35% opacity so the picked one (rendered as the solo
    // marker on top, full opacity) reads as the focal point while
    // surrounding venues stay legible for spatial context.
    var container = map.getContainer();
    if(inFocus) container.setAttribute("data-court-focus", "true");
    else        container.removeAttribute("data-court-focus");

    // Solo highlight marker — full-opacity court icon with an accent
    // ring so it pops as "the pinned one". Reuses COURT_SVG to keep
    // visual language consistent with the cluster's child markers.
    if(soloMarkerRef.current){
      map.removeLayer(soloMarkerRef.current);
      soloMarkerRef.current = null;
    }
    if(showSolo){
      var c = COURTS.find(function(x){
        return x.name === soloName
          || (x.aliases && x.aliases.indexOf(soloName) !== -1);
      });
      if(c){
        // Focused marker — same white-dot language as the default,
        // just a touch bigger (18 vs 14) so it has presence. In
        // focus mode it's the only court visible on the map, so a
        // colour swap isn't needed — the size + the fact that it
        // stands alone is enough signal. Keeps the visual system
        // cohesive (everything is a white dot).
        // Mobile +10% bump matches the default-marker treatment.
        var soloDotPx = isMobile ? 20 : 18;
        var soloHitPx = isMobile ? 33 : 30;
        var soloAnchor = Math.round(soloHitPx / 2);
        var html =
          '<div style="width:' + soloHitPx + 'px;height:' + soloHitPx + 'px;display:flex;align-items:center;justify-content:center">' +
            '<div style="box-sizing:border-box;width:' + soloDotPx + 'px;height:' + soloDotPx + 'px;border-radius:50%;background:#fff;' +
              'box-shadow:0 2px 6px rgba(0,0,0,0.32),0 0 0 1px rgba(20,18,17,0.22);' +
              'cursor:pointer"></div>' +
          '</div>';
        var m = L.marker([c.lat, c.lng], {
          icon: L.divIcon({ className:"cs-court-solo", html: html, iconSize:[soloHitPx, soloHitPx], iconAnchor:[soloAnchor, soloAnchor] }),
          zIndexOffset: 2000,
          interactive: true,
        });
        m.bindTooltip(
          '<div style="font:600 11px/1.3 system-ui,sans-serif"><b>' + c.name + '</b></div>',
          { direction:"top", offset:[0,-14], opacity: 1 }
        );
        m.on("click", function(){
          if(courtSelectRef.current) courtSelectRef.current(c);
        });
        m.addTo(map);
        soloMarkerRef.current = m;
      }
    }

    // Play-court-mode markers — one per court in the picked zone,
    // each with a permanent name label. Replaces the cluster while
    // playMode === "court" so the user sees individual venues with
    // their names floating beside them. Tooltips have a built-in
    // pointer that connects label → marker.
    // Tear down the previous court-mode cluster group (if any) before
    // either re-rendering or leaving court mode entirely.
    if(playZoneClusterRef.current){
      try { map.removeLayer(playZoneClusterRef.current); } catch(_){}
      playZoneClusterRef.current = null;
    }
    playCourtsRef.current = [];
    if(inPlayCourt){
      // Court-mode rendering uses leaflet.markercluster — same plugin
      // as the main map's city-zoom court bubbles. Dense areas (e.g.
      // Eastern Suburbs) collapse into an "N" count badge until the
      // user zooms in past 15; sparse zones show individual dots +
      // caps labels straight away. This replaces the bespoke
      // collision-detection / variant-line rendering, which was
      // visually busy at city zoom.
      var zoneCourts = COURTS.filter(function(c){ return c.zone === playZoneId; });
      var cluster = L.markerClusterGroup({
        showCoverageOnHover: false,
        spiderfyOnMaxZoom: true,
        disableClusteringAtZoom: 15,
        maxClusterRadius: 60,
        iconCreateFunction: function(c2){
          var n = c2.getChildCount();
          // Match the main map cluster bubble — solid dark fill,
          // white tabular-nums. Same 28×28 size so the visual
          // language is consistent across modes.
          return L.divIcon({
            className: "cs-court-cluster",
            html:
              '<div style="box-sizing:border-box;width:28px;height:28px;border-radius:50%;' +
                'background:#14110f;color:#fff;' +
                'display:flex;align-items:center;justify-content:center;' +
                'box-shadow:0 2px 8px rgba(0,0,0,0.22);' +
                'font:700 12px/1 ui-sans-serif,system-ui,sans-serif;' +
                'font-variant-numeric:tabular-nums;letter-spacing:-0.02em">' + n + '</div>',
            iconSize: [28, 28], iconAnchor: [14, 14],
          });
        },
      });
      zoneCourts.forEach(function(c){
        var labelText = shortenCourtName(c.name).toUpperCase();
        // Each leaf marker = white dot + caps label below. Same
        // visual as before, just contributed to the cluster group
        // so leaflet.markercluster collapses tight neighbours into
        // a single count badge until zoom-in.
        var html =
          '<div style="position:relative;width:160px;height:48px;cursor:pointer">' +
            '<div class="cs-play-dot" style="position:absolute;left:75px;top:0"></div>' +
            '<div class="cs-play-name" style="position:absolute;top:16px;left:0;right:0;text-align:center">' +
              labelText +
            '</div>' +
          '</div>';
        var m = L.marker([c.lat, c.lng], {
          icon: L.divIcon({ className:"cs-play-court", html: html, iconSize:[160,48], iconAnchor:[80,5] }),
          zIndexOffset: 1500,
        });
        m.on("click", function(){
          if(courtSelectRef.current) courtSelectRef.current(c);
        });
        cluster.addLayer(m);
      });
      cluster.addTo(map);
      playZoneClusterRef.current = cluster;
      // Fit the map to the picked zone so the courts are spread
      // out enough that their labels don't pile on top of each
      // other. fitBounds(bbox) with maxZoom 14 — same framing as
      // before; clusters now handle the "too many in one spot"
      // problem at lower zooms.
      var zoneLayer = zoneLayersRef.current[playZoneId];
      if(zoneLayer){
        try {
          // Court mode framing — top padding clears the small top-left
          // card; bottom clears the prompt + progress bar. User
          // follow-up: 'choose court default size of map zoom is too
          // small'. Tightening both paddings drops the wasted whitespace
          // and lets fitBounds land at a closer zoom on the picked zone.
          map.fitBounds(zoneLayer.getBounds(), {
            paddingTopLeft:     isMobile ? [16, 40] : [40, 40],
            paddingBottomRight: isMobile ? [16, 96] : [40, 80],
            animate: false,
            maxZoom: 15,
          });
        } catch(_){}
      }
    }
  },[showCourts, focusedCourtName, playMode, playZoneId, playCourtName, selected]);

  // Reflect play-mode on the leaflet-container so CSS in providers
  // can blur+dim the tile pane. Also auto-fit to all zones on
  // entering "zone" mode so the user can see every option even
  // if they were zoomed deep in beforehand.
  var prevPlayModeRef = useRef("off");
  useEffect(function(){
    var map = mapRef.current;
    if(!map) return;
    var c = map.getContainer();
    if(playMode === "off") c.removeAttribute("data-play-mode");
    else                   c.setAttribute("data-play-mode", playMode);

    var prev = prevPlayModeRef.current;
    prevPlayModeRef.current = playMode;
    // Refit to all zones whenever we LAND in zone mode — entering
    // play mode (off → zone) AND backing out from court → zone.
    // Without the second case, hitting back from "Choose your court"
    // left the map zoomed into the picked zone with no way to see
    // the others.
    if(playMode === "zone" && prev !== "zone"){
      var layers = Object.values(zoneLayersRef.current).filter(Boolean);
      if(layers.length){
        try {
          var group = L.featureGroup(layers);
          // animate:false so the map snaps to the framing instantly.
          // Animation was the cause of "map moves on its own + I
          // can't click a zone" — clicks during a pan didn't
          // reliably hit polygon hit-areas.
          map.fitBounds(group.getBounds(), {
            paddingTopLeft:     isMobile ? [12, 24] : [40, 40],
            paddingBottomRight: isMobile ? [12, 88] : [40, 80],
            maxZoom: 14,
            animate: false,
          });
        } catch(_){}
      }
    }
    // PLAYERS mode reframes onto the picked court so the venue sits
    // dead-centre under the floating cards. Zoom 16 keeps the
    // surrounding streets readable but tight enough that the court
    // is unmistakably "where we're playing".
    if(playMode === "players" && prev !== "players" && playCourtName){
      var court = COURTS.find(function(c){
        return c.name === playCourtName
          || (c.aliases && c.aliases.indexOf(playCourtName) !== -1);
      });
      if(court){
        try { map.setView([court.lat, court.lng], 16, { animate: false }); }
        catch(_){}
      }
    }
  },[playMode, playCourtName]);

  // Restyle zones when hover / selected / play-mode change. Zone
  // colours are always shown unless we're in court-pick play mode
  // (where everything except the chosen zone fades hard so the
  // chosen zone leads the eye).
  useEffect(function(){
    Object.keys(zoneLayersRef.current).forEach(function(id){
      var layer = zoneLayersRef.current[id];
      var z = ZONE_BY_ID[id];
      if(!layer || !z) return;
      var isHover = hovered === id;
      var isSel   = selected === id;

      // Play mode COURT or PLAYERS: only the chosen zone is bright,
      // everything else fades to a hairline. Same visual lock-in for
      // both — the user has committed to a zone, the rest must read
      // as background.
      if((playMode === "court" || playMode === "players") && playZoneId){
        var isPlay = id === playZoneId;
        layer.setStyle({
          color: z.color,
          weight: isPlay ? 3 : 1,
          opacity: isPlay ? 1 : 0.18,
          fillColor: z.color,
          fillOpacity: isPlay ? 0.55 : 0.05,
        });
        return;
      }
      // Default mode WITH a pinned selection: lock focus on the picked
      // zone so the others fade to a hairline. Same visual lock-in the
      // old FAB-driven 'court' play mode produced — user feedback was
      // that they liked the other zones disappearing when one was
      // selected on web. Mobile is unaffected because the side panel
      // covers the map entirely once selected is set.
      if(playMode === "off" && selected){
        var isSelHere = id === selected;
        layer.setStyle({
          color: z.color,
          weight: isSelHere ? 3 : 1,
          opacity: isSelHere ? 1 : 0.18,
          fillColor: z.color,
          fillOpacity: isSelHere ? 0.62 : 0.05,
        });
        return;
      }
      // Play mode ZONE: every zone is interactive but slightly dimmed
      // (compared to default) so the user reads "pick one of these".
      // Hovered zone gets a subtle lift.
      if(playMode === "zone"){
        layer.setStyle({
          color: z.color,
          weight: isHover ? 3 : 2,
          opacity: 0.9,
          fillColor: z.color,
          fillOpacity: isHover ? 0.62 : 0.30,
        });
        return;
      }
      // Default mode (no play flow active)
      // Mobile keeps the outline but at 30% less weight (2 → 1.4) per
      // user follow-up: 'bring back the outline of the zones, but
      // make the lines 30% less thick on mobile'.
      if(isSel){
        layer.setStyle({ color: z.color, weight: 3, opacity: 1, fillColor: z.color, fillOpacity: 0.62 });
      } else if(isHover){
        layer.setStyle({ color: z.color, weight: 2.5, opacity: 1, fillColor: z.color, fillOpacity: 0.6 });
      } else {
        layer.setStyle({
          color: z.color,
          weight: isMobile ? 1.4 : 2,
          opacity: 0.9,
          fillColor: z.color,
          fillOpacity: 0.42,
        });
      }
    });
  },[hovered, selected, playMode, playZoneId, isMobile]);

  // Reframe the map when the selected zone changes (default mode
  // only — Play Match flow owns its own framing). Three cases:
  //   • selected goes truthy → fit to that zone with right-side
  //     padding so the picked polygon centres in the left half
  //     of the map (the right ~384px is owned by the side panel).
  //   • selected goes null AFTER having been set → refit to all
  //     zones so the user sees the whole city again. User: 'when
  //     you press the > to close the zone area, it should reframe
  //     on the map again, right now it stays the same.'
  //   • mobile: skip — the side panel covers the whole map so the
  //     refit would be invisible work.
  var prevSelectedRef = useRef(null);
  useEffect(function(){
    var map = mapRef.current;
    if(!map) return;
    if(playMode !== "off"){ prevSelectedRef.current = selected; return; }
    if(isMobile){ prevSelectedRef.current = selected; return; }

    if(selected){
      var layer = zoneLayersRef.current[selected];
      if(layer){
        try {
          map.fitBounds(layer.getBounds(), {
            paddingTopLeft:     [40, 40],
            paddingBottomRight: [384, 40],
            maxZoom: 14,
            animate: true,
            duration: 0.45,
          });
        } catch(_){}
      }
    } else if(prevSelectedRef.current){
      // selected → null transition: refit to all zones (city view).
      var layers = Object.values(zoneLayersRef.current).filter(Boolean);
      if(layers.length){
        try {
          var group = L.featureGroup(layers);
          map.fitBounds(group.getBounds(), {
            paddingTopLeft:     [24, 24],
            paddingBottomRight: [24, 80],
            maxZoom: 14,
            animate: true,
            duration: 0.45,
          });
        } catch(_){}
      }
    }
    prevSelectedRef.current = selected;
  },[selected, playMode, isMobile]);

  // Update zone label HTML when activity streams in — the flame badge is
  // attached to the zone number/name stack so it follows the polygon
  // centre automatically.
  // Centroid badge — renders ONLY when a zone is the viewer's home
  // and/or has activity in the last 7 days. Add/remove markers as the
  // signals change rather than mutating an always-present label. Keeps
  // the map clean for inactive zones.
  useEffect(function(){
    var map = mapRef.current;
    if(!map) return;
    // Hide home + flame centroid badges during play mode so the
    // map shows only the polygons (step 1) or only the picked
    // zone's courts (step 2).
    var inPlay = playMode !== "off";
    Object.keys(zoneLabelsRef.current).forEach(function(id){
      var z = ZONE_BY_ID[id];
      if(!z) return;
      var prev = zoneLabelsRef.current[id];
      if(prev){ map.removeLayer(prev); }
      if(inPlay){ zoneLabelsRef.current[id] = null; return; }
      var html = zoneCentroidBadgeHtml(z, zoneActivity && zoneActivity[id], homeZone === z.id, showHomes, showActivity);
      if(!html){
        zoneLabelsRef.current[id] = null;
        return;
      }
      var center = zoneCentersRef.current[id] || z.center;
      var marker = L.marker(center, {
        icon: L.divIcon({
          className: "cs-zone-centroid",
          html: html,
          iconSize: [60, 60],
          // iconAnchor y > iconSize.height pushes the badge ABOVE the
          // lat/lng. 70 places the home circle ~10-40px above the
          // centroid (close enough to read as "this zone is yours"
          // at any zoom level) while still clearing the cluster
          // bubble's top edge (-14px) by ~24px. Earlier value of 110
          // pushed home 78-110px above centroid which at broad zoom
          // looked like it had drifted off the polygon entirely
          // ("home deregisters when we zoom out so much").
          iconAnchor: [30, 70],
        }),
        interactive: false,
        // 10000 wins against any other marker layer including the
        // marker-cluster plugin's internal pane shuffling. Earlier
        // 1500 wasn't enough to consistently beat the cluster's
        // own zindex management at broad zoom.
        zIndexOffset: 10000,
      }).addTo(map);
      zoneLabelsRef.current[id] = marker;
    });
  },[zoneActivity, homeZone, showHomes, showActivity, playMode]);

  // (Old standalone home-pin effect retired — the home indicator is
  // baked into the zone-number label's house-shaped badge above. One
  // marker per zone, less clutter.)

  return (
    <div ref={elRef} style={{ position: "absolute", inset: 0 }} />
  );
}
