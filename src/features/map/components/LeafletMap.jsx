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
    ? ('<div style="margin-top:3px;font-size:10px;font-weight:800;letter-spacing:0.02em;' +
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

  // Stash onCourtSelect in a ref so the init effect (which runs once) always
  // reads the latest callback — otherwise the first render's closure sticks.
  var courtSelectRef = useRef(onCourtSelect);
  courtSelectRef.current = onCourtSelect;

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
      poly.on("mouseover", function(){ onHover && onHover(z.id); });
      poly.on("mouseout",  function(){ onHover && onHover(null); });
      poly.on("click",     function(){ onSelect && onSelect(z.id); });
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
        return L.divIcon({
          className: "cs-court-cluster",
          html:
            '<div style="width:34px;height:34px;border-radius:50%;background:#fff;' +
              'border:1.5px solid rgba(20,18,17,0.9);' +
              'display:flex;align-items:center;justify-content:center;' +
              'box-shadow:0 2px 6px rgba(0,0,0,0.18);color:#14110f;' +
              'font:700 13px/1 system-ui,sans-serif">' + n + '</div>',
          iconSize: [34, 34], iconAnchor: [17, 17],
        });
      },
    });
    COURTS.forEach(function(c){
      var html =
        '<div style="width:22px;height:22px;border-radius:50%;background:#fff;border:1.5px solid rgba(20,18,17,0.9);' +
          'display:flex;align-items:center;justify-content:center;box-shadow:0 1px 2px rgba(0,0,0,0.15);color:#14110f;cursor:pointer">' +
          '<div style="width:13px;height:13px">' + COURT_SVG + '</div>' +
        '</div>';
      var m = L.marker([c.lat, c.lng], {
        icon: L.divIcon({ className: "", html: html, iconSize: [22,22], iconAnchor: [11,11] }),
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
    return function(){ map.remove(); mapRef.current = null; };
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
    if(!showZoneNames) return;
    var isDark = resolveDark(theme, mapThemeOverride);
    ZONES.forEach(function(z){
      var center = zoneCentersRef.current[z.id] || z.center;
      if(!center) return;
      var marker = L.marker(center, {
        icon: L.divIcon({
          className: "cs-zone-name",
          html: zoneNameLabelHtml(z, isDark),
          iconSize: [140, 16],
          iconAnchor: [70, 8],
        }),
        interactive: false,
        // Sit above polygons (z 400) but below courts (z 600 via
        // zIndexOffset 1000) so a court marker pinned at the centroid
        // doesn't disappear under the label.
        zIndexOffset: 200,
      }).addTo(map);
      zoneNameLayersRef.current[z.id] = marker;
    });
  },[showZoneNames, theme, mapThemeOverride]);

  // Add/remove the court cluster layer when the courts toggle flips.
  useEffect(function(){
    var map = mapRef.current;
    var cluster = courtClusterRef.current;
    if(!map || !cluster) return;
    if(showCourts){
      if(!map.hasLayer(cluster)) map.addLayer(cluster);
    } else {
      if(map.hasLayer(cluster)) map.removeLayer(cluster);
    }
  },[showCourts]);

  // Restyle zones when hover / selected change. Zone colors are always
  // shown — they're identifying chrome, not a heat overlay. (The earlier
  // "heat off fades polygons to 0" branch was a regression: it removed
  // the very thing that tells users which suburb they're looking at.)
  useEffect(function(){
    Object.keys(zoneLayersRef.current).forEach(function(id){
      var layer = zoneLayersRef.current[id];
      var z = ZONE_BY_ID[id];
      if(!layer || !z) return;
      var isHover = hovered === id;
      var isSel   = selected === id;
      if(isSel){
        layer.setStyle({ color: z.color, weight: 3, opacity: 1, fillColor: z.color, fillOpacity: 0.62 });
      } else if(isHover){
        layer.setStyle({ color: z.color, weight: 2.5, opacity: 1, fillColor: z.color, fillOpacity: 0.6 });
      } else {
        layer.setStyle({ color: z.color, weight: 2, opacity: 0.9, fillColor: z.color, fillOpacity: 0.42 });
      }
    });
  },[hovered, selected]);

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
    Object.keys(zoneLabelsRef.current).forEach(function(id){
      var z = ZONE_BY_ID[id];
      if(!z) return;
      var prev = zoneLabelsRef.current[id];
      if(prev){ map.removeLayer(prev); }
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
          // lat/lng (courts at the polygon centre are very common in
          // dense zones — CBD's bbox centre sits right on Prince Alfred,
          // for instance). 90 means the icon centre paints ~30 px above
          // the centroid point, leaving room for the court marker
          // underneath.
          iconAnchor: [30, 90],
        }),
        interactive: false,
        zIndexOffset: 500,
      }).addTo(map);
      zoneLabelsRef.current[id] = marker;
    });
  },[zoneActivity, homeZone, showHomes, showActivity]);

  // (Old standalone home-pin effect retired — the home indicator is
  // baked into the zone-number label's house-shaped badge above. One
  // marker per zone, less clutter.)

  return (
    <div ref={elRef} style={{ position: "absolute", inset: 0 }} />
  );
}
