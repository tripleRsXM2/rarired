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
import { ZONES, ZONE_BY_ID, SYDNEY_BOUNDS } from "../data/zones.js";
import { COURTS } from "../data/courts.js";

// Pick a basemap tile set that reads OK against the current theme.
// Dark themes (ao, us-open) use dark-matter; light themes use positron.
function tileUrlFor(theme){
  var dark = theme === "ao" || theme === "us-open";
  return dark
    ? "https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png"
    : "https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png";
}
function labelTileUrlFor(theme){
  var dark = theme === "ao" || theme === "us-open";
  return dark
    ? "https://{s}.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}{r}.png"
    : "https://{s}.basemaps.cartocdn.com/light_only_labels/{z}/{x}/{y}{r}.png";
}

var COURT_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="1"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="12" y1="5" x2="12" y2="19"/><line x1="7" y1="9" x2="7" y2="15"/><line x1="17" y1="9" x2="17" y2="15"/></svg>';

var HOME_SVG = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 3l9 8h-3v9h-5v-6H11v6H6v-9H3z"/></svg>';

export default function LeafletMap({
  t, theme, hovered, selected, homeZone,
  onHover, onSelect,
}){
  var elRef = useRef(null);
  var mapRef = useRef(null);
  var zoneLayersRef = useRef({});    // id -> L.polygon
  var zoneLabelsRef = useRef({});    // id -> L.marker (number + name)
  var homePinRef = useRef(null);
  var tileLayersRef = useRef({ base: null, labels: null });

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
    var labels = L.tileLayer(labelTileUrlFor(theme), {
      subdomains: "abcd",
      maxZoom: 19,
      pane: "shadowPane",
    }).addTo(map);
    tileLayersRef.current.base = base;
    tileLayersRef.current.labels = labels;

    map.fitBounds(SYDNEY_BOUNDS, { padding: [24, 24] });

    // Zone polygons — each zone may have 1..N outer shapes (MultiPolygon).
    // Leaflet accepts a list of rings; we pass the whole array so holes and
    // disjoint pieces both render under a single layer.
    ZONES.forEach(function(z){
      var shapes = (z.polygons && z.polygons.length) ? z.polygons : [];
      var poly = L.polygon(shapes, {
        color: z.color, weight: 2, opacity: 0.9,
        fillColor: z.color, fillOpacity: 0.42,
        smoothFactor: 0.5,
      }).addTo(map);
      poly.on("mouseover", function(){ onHover && onHover(z.id); });
      poly.on("mouseout",  function(){ onHover && onHover(null); });
      poly.on("click",     function(){ onSelect && onSelect(z.id); });
      zoneLayersRef.current[z.id] = poly;

      // Number badge + zone name label
      var html =
        '<div style="display:flex;flex-direction:column;align-items:center;gap:4px;text-align:center;pointer-events:none">' +
          '<div style="width:30px;height:30px;border-radius:50%;background:' + z.color + ';color:#fff;' +
            'font-weight:700;font-size:14px;line-height:30px;text-align:center;' +
            'box-shadow:0 1px 3px rgba(0,0,0,0.25),0 0 0 3px rgba(255,255,255,0.85)">' + z.num + '</div>' +
          '<div style="font-size:10px;font-weight:700;letter-spacing:0.04em;color:#141211;' +
            'text-shadow:0 0 3px #fff,0 0 6px #fff;max-width:130px;line-height:1.15">' +
            z.name.toUpperCase() + '</div>' +
        '</div>';
      var label = L.marker(z.center, {
        icon: L.divIcon({ className: "cs-zone-label", html: html, iconSize: [140, 56], iconAnchor: [70, 28] }),
        interactive: false,
        zIndexOffset: 500,
      }).addTo(map);
      zoneLabelsRef.current[z.id] = label;
    });

    // Court markers
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
        '<div style="font:500 11px/1.3 system-ui,sans-serif"><b>' + c.name + '</b><br>' +
          '<span style="opacity:0.65;font-size:10px">' + c.courts + ' court' + (c.courts===1?'':'s') + '</span></div>',
        { direction: "top", offset: [0,-10], opacity: 1 }
      );
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
    map.removeLayer(tileLayersRef.current.labels);
    var base = L.tileLayer(tileUrlFor(theme), {
      attribution: "© OpenStreetMap · © CARTO",
      subdomains: "abcd", maxZoom: 19,
    }).addTo(map);
    var labels = L.tileLayer(labelTileUrlFor(theme), {
      subdomains: "abcd", maxZoom: 19, pane: "shadowPane",
    }).addTo(map);
    tileLayersRef.current.base = base;
    tileLayersRef.current.labels = labels;
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

  // Home pin — add/remove/move as homeZone changes.
  useEffect(function(){
    var map = mapRef.current;
    if(!map) return;
    // Remove prior pin
    if(homePinRef.current){ map.removeLayer(homePinRef.current); homePinRef.current = null; }
    if(!homeZone) return;
    var z = ZONE_BY_ID[homeZone];
    if(!z) return;
    var accent = (t && t.accent) || "#14110f";
    var textC = (t && t.accentText) || "#fff";
    var html =
      '<div style="width:32px;height:32px;border-radius:50%;background:' + accent + ';color:' + textC + ';' +
        'display:flex;align-items:center;justify-content:center;' +
        'box-shadow:0 2px 6px rgba(0,0,0,0.25),0 0 0 3px rgba(255,255,255,0.9)">' +
        '<div style="width:16px;height:16px;display:flex">' + HOME_SVG + '</div>' +
      '</div>';
    // iconAnchor y pushed to 70 so the pin renders ~54px ABOVE the centroid,
    // clearing the zone number + name label stack below it.
    var pin = L.marker(z.center, {
      icon: L.divIcon({ className: "cs-home-pin", html: html, iconSize: [32,32], iconAnchor: [16,70] }),
      interactive: false,
      zIndexOffset: 1500,
    }).addTo(map);
    homePinRef.current = pin;
  },[homeZone, t]);

  return (
    <div ref={elRef} style={{ position: "absolute", inset: 0 }} />
  );
}
