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
import { ZONES, ZONE_BY_ID } from "../data/zones.js";
import { COURTS } from "../data/courts.js";

// Pick a basemap tile set that reads OK against the current theme.
// Dark themes (hard-court, night-court) use dark-matter; light themes use
// positron. Both are "nolabels" — we deliberately don't layer streetnames
// or suburb labels on top so the zones read as the primary content.
function tileUrlFor(theme){
  var dark = theme === "hard-court" || theme === "night-court";
  return dark
    ? "https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png"
    : "https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png";
}

var COURT_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="1"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="12" y1="5" x2="12" y2="19"/><line x1="7" y1="9" x2="7" y2="15"/><line x1="17" y1="9" x2="17" y2="15"/></svg>';

// (HOME_SVG retired — the home indicator is now baked directly into
// the zone-number label as a house-shaped badge. See zoneLabelHtml.)

// Build the HTML for a zone label. Broken out so the mount effect and
// the activity-refresh effect can produce the same markup — keeps the
// "🔥 N this week" badge in sync with zoneActivity as it streams in.
//
// `isHome` flips the label badge from a plain colored circle to a
// house-shaped tile (still showing the zone number) so the viewer's
// home zone reads at a glance — replaces the standalone home pin
// that used to float above the same number, which was visually
// distracting (council fix).
function zoneLabelHtml(z, activity, isHome) {
  var flame = activity && activity.matches_7d > 0
    ? ('<div style="margin-top:3px;font-size:9.5px;font-weight:700;letter-spacing:0.02em;' +
        'color:#fff;background:rgba(239,68,68,0.95);padding:1px 6px;border-radius:10px;' +
        'text-shadow:none;box-shadow:0 1px 2px rgba(0,0,0,0.2)">🔥 ' +
        activity.matches_7d + ' this week</div>')
    : '';
  // House-shaped badge: 36×36 svg with a roof + body, the zone number
  // overlaid in the centre. Plain circle for non-home zones (existing
  // look). Both keep the same outer ring + drop-shadow so size stays
  // consistent on the map.
  var badge = isHome
    ? ('<div style="position:relative;width:36px;height:36px;filter:drop-shadow(0 1px 2px rgba(0,0,0,0.25))">' +
         '<svg width="36" height="36" viewBox="0 0 36 36" fill="none">' +
           '<path d="M18 4 L31 15 V31 a2 2 0 0 1 -2 2 H7 a2 2 0 0 1 -2 -2 V15 Z" ' +
                 'fill="' + z.color + '" stroke="rgba(255,255,255,0.92)" stroke-width="2.5" stroke-linejoin="round"/>' +
         '</svg>' +
         '<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;' +
                     'padding-top:4px;color:#fff;font-weight:800;font-size:13px;line-height:1">' + z.num + '</div>' +
       '</div>')
    : ('<div style="width:30px;height:30px;border-radius:50%;background:' + z.color + ';color:#fff;' +
         'font-weight:700;font-size:14px;line-height:30px;text-align:center;' +
         'box-shadow:0 1px 3px rgba(0,0,0,0.25),0 0 0 3px rgba(255,255,255,0.85)">' + z.num + '</div>');
  return (
    '<div style="display:flex;flex-direction:column;align-items:center;gap:4px;text-align:center;pointer-events:none">' +
      badge +
      '<div style="font-size:10px;font-weight:700;letter-spacing:0.04em;color:#141211;' +
        'text-shadow:0 0 3px #fff,0 0 6px #fff;max-width:130px;line-height:1.15">' +
        z.name.toUpperCase() + '</div>' +
      flame +
    '</div>'
  );
}

export default function LeafletMap({
  t, theme, hovered, selected, homeZone, zoneActivity,
  onHover, onSelect, onCourtSelect,
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

  // Stash onCourtSelect in a ref so the init effect (which runs once) always
  // reads the latest callback — otherwise the first render's closure sticks.
  var courtSelectRef = useRef(onCourtSelect);
  courtSelectRef.current = onCourtSelect;

  // Init map once. Re-render policy: don't destroy/recreate on theme change;
  // swap the tile layers in place in a separate effect below.
  useEffect(function(){
    if(!elRef.current || mapRef.current) return;
    var map = L.map(elRef.current, {
      zoomControl: true,
      attributionControl: true,
      preferCanvas: true,
    });

    var base = L.tileLayer(tileUrlFor(theme), {
      attribution: "© OpenStreetMap · © CARTO",
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

      // Number badge + zone name label (+ optional 7-day activity flame).
      // homeZone passed in via prop — re-rendered when it changes via the
      // refresh effect below so the house badge appears/disappears live.
      var html = zoneLabelHtml(z, null, homeZone === z.id);
      var label = L.marker(labelLatLng, {
        icon: L.divIcon({ className: "cs-zone-label", html: html, iconSize: [140, 72], iconAnchor: [70, 36] }),
        interactive: false,
        zIndexOffset: 500,
      }).addTo(map);
      zoneLabelsRef.current[z.id] = label;
    });

    // Fit the view to the union of all zone polygons so the zones fill
    // the visible map instead of floating inside extra whitespace.
    if(allZoneLayers.length){
      var group = L.featureGroup(allZoneLayers);
      map.fitBounds(group.getBounds(), { padding: [24, 24] });
    }

    // Court markers — tap opens CourtInfoCard via the onCourtSelect ref.
    COURTS.forEach(function(c){
      var html =
        '<div style="width:22px;height:22px;border-radius:50%;background:#fff;border:1.5px solid rgba(20,18,17,0.9);' +
          'display:flex;align-items:center;justify-content:center;box-shadow:0 1px 2px rgba(0,0,0,0.15);color:#14110f;cursor:pointer">' +
          '<div style="width:13px;height:13px">' + COURT_SVG + '</div>' +
        '</div>';
      var m = L.marker([c.lat, c.lng], {
        icon: L.divIcon({ className: "", html: html, iconSize: [22,22], iconAnchor: [11,11] }),
        zIndexOffset: 1000,
      }).addTo(map);
      m.bindTooltip(
        '<div style="font:500 11px/1.3 system-ui,sans-serif"><b>' + c.name + '</b></div>',
        { direction: "top", offset: [0,-10], opacity: 1 }
      );
      m.on("click", function(){
        if(courtSelectRef.current) courtSelectRef.current(c);
      });
    });

    mapRef.current = map;
    return function(){ map.remove(); mapRef.current = null; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[]);

  // Swap tile layers when theme changes (keeps zoom / center / selection state).
  useEffect(function(){
    var map = mapRef.current;
    if(!map || !tileLayersRef.current.base) return;
    map.removeLayer(tileLayersRef.current.base);
    var base = L.tileLayer(tileUrlFor(theme), {
      attribution: "© OpenStreetMap · © CARTO",
      subdomains: "abcd", maxZoom: 19,
    }).addTo(map);
    tileLayersRef.current.base = base;
  },[theme]);

  // Restyle zones when hover / selected change.
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
  useEffect(function(){
    if(!mapRef.current) return;
    Object.keys(zoneLabelsRef.current).forEach(function(id){
      var marker = zoneLabelsRef.current[id];
      var z = ZONE_BY_ID[id];
      if(!marker || !z) return;
      var html = zoneLabelHtml(z, zoneActivity && zoneActivity[id], homeZone === z.id);
      marker.setIcon(L.divIcon({
        className: "cs-zone-label", html: html,
        iconSize: [140, 72], iconAnchor: [70, 36],
      }));
    });
  },[zoneActivity, homeZone]);

  // (Old standalone home-pin effect retired — the home indicator is
  // baked into the zone-number label's house-shaped badge above. One
  // marker per zone, less clutter.)

  return (
    <div ref={elRef} style={{ position: "absolute", inset: 0 }} />
  );
}
