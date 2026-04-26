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
  // Solo highlight marker shown when focusedCourtName is set —
  // cluster hides, this single marker takes over.
  var soloMarkerRef = useRef(null);
  // Map-native play-court-mode markers — one per court in the
  // chosen zone, each with a permanent name tooltip.
  var playCourtsRef = useRef([]);
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
      map.fitBounds(group.getBounds(), { padding: [24, 24] });
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
          try { map.fitBounds(L.featureGroup(allZoneLayers).getBounds(), { padding: [24,24], animate: false }); } catch(_){}
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
        try { map.fitBounds(L.featureGroup(allZoneLayers).getBounds(), { padding: [24,24], animate: false }); } catch(_){}
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
    COURTS.forEach(function(c){
      // Default court marker — minimalist solid white dot. The
      // visible dot is 14px but the icon (hit) box is 26px so the
      // tap target is comfortable on mobile (small dots were hard
      // to hit). Soft shadow + hairline ring keep it readable on
      // both light + dark basemaps.
      var html =
        '<div style="width:26px;height:26px;display:flex;align-items:center;justify-content:center">' +
          '<div style="box-sizing:border-box;width:14px;height:14px;border-radius:50%;background:#fff;' +
            'box-shadow:0 1px 3px rgba(0,0,0,0.28),0 0 0 1px rgba(20,18,17,0.18);' +
            'cursor:pointer"></div>' +
        '</div>';
      var m = L.marker([c.lat, c.lng], {
        icon: L.divIcon({ className: "", html: html, iconSize: [26,26], iconAnchor: [13,13] }),
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
    var inPlayCourt = playMode === "court" && !!playZoneId;
    var inPlayZone  = playMode === "zone";
    // Cluster only shows in default mode (no focus, not in play).
    var showCluster = showCourts && !inFocus && !inPlayCourt && !inPlayZone;
    // Solo focus marker hidden during play modes — they have their
    // own marker rendering (or none, in zone mode).
    var showSolo    = showCourts && inFocus && !inPlayZone && !inPlayCourt;

    // Cluster visibility
    if(showCluster){
      if(!map.hasLayer(cluster)) map.addLayer(cluster);
    } else {
      if(map.hasLayer(cluster)) map.removeLayer(cluster);
    }

    // Solo highlight marker — full-opacity court icon with an accent
    // ring so it pops as "the pinned one". Reuses COURT_SVG to keep
    // visual language consistent with the cluster's child markers.
    if(soloMarkerRef.current){
      map.removeLayer(soloMarkerRef.current);
      soloMarkerRef.current = null;
    }
    if(showSolo){
      var c = COURTS.find(function(x){ return x.name === focusedCourtName; });
      if(c){
        // Focused marker — same white-dot language as the default,
        // just a touch bigger (18 vs 14) so it has presence. In
        // focus mode it's the only court visible on the map, so a
        // colour swap isn't needed — the size + the fact that it
        // stands alone is enough signal. Keeps the visual system
        // cohesive (everything is a white dot).
        var html =
          '<div style="width:30px;height:30px;display:flex;align-items:center;justify-content:center">' +
            '<div style="box-sizing:border-box;width:18px;height:18px;border-radius:50%;background:#fff;' +
              'box-shadow:0 2px 6px rgba(0,0,0,0.32),0 0 0 1px rgba(20,18,17,0.22);' +
              'cursor:pointer"></div>' +
          '</div>';
        var m = L.marker([c.lat, c.lng], {
          icon: L.divIcon({ className:"cs-court-solo", html: html, iconSize:[30,30], iconAnchor:[15,15] }),
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
    // Detach any zoom listener bound by a previous render pass.
    if(playCourtsRef.current.__unbind){
      try { playCourtsRef.current.__unbind(); } catch(_){}
    }
    playCourtsRef.current.forEach(function(m){ if(map.hasLayer(m)) map.removeLayer(m); });
    playCourtsRef.current = [];
    if(inPlayCourt){
      // Collision + cluster-aware rendering.
      //   • Compute each court's screen pixel after fitBounds / zoom.
      //   • If a court has ANY neighbour within ~80px, mark crowded.
      //   • Group crowded courts into CLUSTERS via flood-fill on the
      //     collision graph, then deterministically distribute the 3
      //     line-length variants WITHIN each cluster. Random hash
      //     assignment was putting cluster mates on the same variant
      //     and stacking them; cluster-aware ensures variant 0/1/2
      //     are spread across each tight group.
      var zoneCourts = COURTS.filter(function(c){ return c.zone === playZoneId; });
      var renderTimer = null;
      function renderCourtsLayer(){
        var map2 = mapRef.current;
        // Read the LIVE play-mode from a ref (not the closure)
        // — pending setTimeouts from zoom/pan events that fire
        // after the user has backed out would otherwise see the
        // stale "court" value and re-add markers.
        if(!map2 || playModeRef.current !== "court") return;
        // Clear any markers from a previous render pass (e.g. after
        // zoom) — keeps the layer fresh without piling up duplicates.
        playCourtsRef.current.forEach(function(m){
          if(map2.hasLayer(m)) map2.removeLayer(m);
        });
        // Preserve the __unbind so we don't lose the zoom listener
        // when we wipe the array.
        var unbind = playCourtsRef.current.__unbind;
        playCourtsRef.current = [];
        if(unbind) playCourtsRef.current.__unbind = unbind;
        var pts = zoneCourts.map(function(c){
          return { c: c, pt: map2.latLngToContainerPoint([c.lat, c.lng]) };
        });
        var COLLISION_PX = 80;
        pts.forEach(function(a, i){ a.idx = i; });
        pts.forEach(function(a){
          a.crowded = pts.some(function(b){
            if(b === a) return false;
            var dx = a.pt.x - b.pt.x;
            var dy = a.pt.y - b.pt.y;
            return (dx*dx + dy*dy) < (COLLISION_PX * COLLISION_PX);
          });
        });
        // Flood-fill cluster membership across the collision graph.
        var clusterId = pts.map(function(){ return -1; });
        var nextCluster = 0;
        function neighbours(idx){
          var a = pts[idx], out = [];
          pts.forEach(function(b, j){
            if(j === idx) return;
            var dx = a.pt.x - b.pt.x;
            var dy = a.pt.y - b.pt.y;
            if(dx*dx + dy*dy < COLLISION_PX*COLLISION_PX) out.push(j);
          });
          return out;
        }
        pts.forEach(function(p, i){
          if(!p.crowded || clusterId[i] !== -1) return;
          var stack = [i];
          while(stack.length){
            var k = stack.pop();
            if(clusterId[k] !== -1) continue;
            clusterId[k] = nextCluster;
            neighbours(k).forEach(function(n){
              if(clusterId[n] === -1 && pts[n].crowded) stack.push(n);
            });
          }
          nextCluster++;
        });
        // Assign variant index within each cluster (round-robin so
        // no two cluster mates share a variant unless the cluster
        // exceeds VARIANTS.length).
        var perClusterCount = {};
        pts.forEach(function(p, i){
          if(!p.crowded){ p.variantIdx = 0; return; }
          var ci = clusterId[i];
          var pos = perClusterCount[ci] || 0;
          p.variantIdx = pos;
          perClusterCount[ci] = pos + 1;
        });
        // (Earlier clear at the top of renderCourtsLayer already
        // wiped + preserved __unbind. This second clear was a
        // remnant from the original single-pass implementation; it
        // re-set playCourtsRef.current = [] WITHOUT preserving
        // __unbind, so on zoom the zoom-listener was orphaned and a
        // subsequent "back" couldn't detach it — courts stayed
        // visible after exiting court mode.)

        // Crowded labels — all in NE direction (up-right) per user.
        // Three line-length variants cycle so cluster mates stagger
        // along the same diagonal. Label halo (-webkit-text-stroke
        // in CSS) acts as a buffer so any line crossing near a
        // label appears to pass BEHIND the text instead of cutting
        // through letters.
        var VARIANTS = [
          { anchor:[15,110], lineTo:[40,82],  labelX:45, labelY:71 },  // NE short
          { anchor:[15,110], lineTo:[62,55],  labelX:67, labelY:44 },  // NE medium
          { anchor:[15,110], lineTo:[90,25],  labelX:95, labelY:14 },  // NE long
        ];

        pts.forEach(function(p, i){
          var c = p.c;
          var labelText = shortenCourtName(c.name).toUpperCase();
          var html, iconSize, iconAnchor;

          if(p.crowded){
            // Crowded: dot + connector + caps name. Variant chosen
            // by cluster-aware round-robin so cluster mates stagger
            // along the diagonal instead of stacking.
            var d = VARIANTS[(p.variantIdx || 0) % VARIANTS.length];
            html =
              '<div style="position:relative;width:180px;height:120px;cursor:pointer">' +
                '<svg width="180" height="120" style="position:absolute;inset:0;pointer-events:none">' +
                  '<line x1="' + d.anchor[0] + '" y1="' + d.anchor[1] + '" ' +
                        'x2="' + d.lineTo[0] + '" y2="' + d.lineTo[1] + '" ' +
                        'stroke="rgba(20,18,17,0.55)" stroke-width="1" ' +
                        'style="filter:drop-shadow(0 0 2px rgba(255,255,255,0.7))"/>' +
                '</svg>' +
                '<div class="cs-play-dot" style="position:absolute;' +
                  'left:' + (d.anchor[0] - 5) + 'px;top:' + (d.anchor[1] - 5) + 'px;"></div>' +
                '<div class="cs-play-name" style="position:absolute;' +
                  'left:' + d.labelX + 'px;top:' + d.labelY + 'px;white-space:nowrap">' +
                  labelText +
                '</div>' +
              '</div>';
            iconSize = [180, 120];
            iconAnchor = d.anchor;
          } else {
            // Calm: dot + caps name 4px below. Same name class.
            html =
              '<div style="position:relative;width:160px;height:48px;cursor:pointer">' +
                '<div class="cs-play-dot" style="position:absolute;left:75px;top:0"></div>' +
                '<div class="cs-play-name" style="position:absolute;top:16px;left:0;right:0;text-align:center">' +
                  labelText +
                '</div>' +
              '</div>';
            iconSize = [160, 48];
            iconAnchor = [80, 5];
          }

          var m = L.marker([c.lat, c.lng], {
            icon: L.divIcon({ className:"cs-play-court", html: html, iconSize: iconSize, iconAnchor: iconAnchor }),
            zIndexOffset: 1500,
          });
          m.on("click", function(){
            if(courtSelectRef.current) courtSelectRef.current(c);
          });
          m.addTo(map2);
          playCourtsRef.current.push(m);
        });
      }
      // Initial paint after fitBounds settles.
      renderTimer = setTimeout(renderCourtsLayer, 50);
      // Re-render when the user zooms — pixel positions change so
      // the cluster + variant assignments need to update too.
      function onZoom(){
        if(renderTimer) clearTimeout(renderTimer);
        renderTimer = setTimeout(renderCourtsLayer, 60);
      }
      map.on("zoomend moveend", onZoom);
      // Stash an unbinder so the cleanup branch (when leaving court
      // mode) can detach the listener.
      playCourtsRef.current.__unbind = function(){
        map.off("zoomend moveend", onZoom);
        if(renderTimer) clearTimeout(renderTimer);
      };
      // Fit the map to the picked zone so the courts are spread out
      // enough that their labels don't pile on top of each other.
      // fitBounds(bbox) with maxZoom 14 — the framing user liked
      // before. Compact zones (CBD, Inner West) crop tightly to
      // their bbox at zoom ~13-14 so the polygon fills the viewport.
      // Tall zones (Eastern Suburbs, Northern Beaches) hit a lower
      // natural zoom (~12) so the whole bbox is visible.
      var zoneLayer = zoneLayersRef.current[playZoneId];
      if(zoneLayer){
        try {
          map.fitBounds(zoneLayer.getBounds(), {
            padding: [40, 40],
            animate: false,
            maxZoom: 14,
          });
        } catch(_){}
      }
    }
  },[showCourts, focusedCourtName, playMode, playZoneId]);

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
          map.fitBounds(group.getBounds(), { padding: [40, 40], animate: false });
        } catch(_){}
      }
    }
  },[playMode]);

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

      // Play mode COURT: only the chosen zone is bright. Everything
      // else fades to a hairline.
      if(playMode === "court" && playZoneId){
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
      if(isSel){
        layer.setStyle({ color: z.color, weight: 3, opacity: 1, fillColor: z.color, fillOpacity: 0.62 });
      } else if(isHover){
        layer.setStyle({ color: z.color, weight: 2.5, opacity: 1, fillColor: z.color, fillOpacity: 0.6 });
      } else {
        layer.setStyle({ color: z.color, weight: 2, opacity: 0.9, fillColor: z.color, fillOpacity: 0.42 });
      }
    });
  },[hovered, selected, playMode, playZoneId]);

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
