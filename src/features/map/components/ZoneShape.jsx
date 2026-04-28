// src/features/map/components/ZoneShape.jsx
//
// Tiny SVG glyph of a zone's outline. Reads the zone's polygon
// rings, computes their bounding box, and projects each [lat, lng]
// pair into the SVG viewport. Multi-polygon zones (some have
// disjoint islands like Northern Beaches with peninsula tips)
// render every shape so the user sees the actual silhouette.
//
// Used by the ZoneSidePanel mobile title card so the glyph rides
// alongside the zone name — gives the user a visual anchor when
// swiping between zones.
//
// Pure SVG line-art per the project icon rule (no emoji), accepts
// stroke colour via props (caller usually passes the zone's accent
// colour).

import React from "react";

export default function ZoneShape({ zone, size, width, height, fill, stroke, strokeWidth }){
  if(!zone || !zone.polygons || !zone.polygons.length) return null;
  // Independent width/height fall back to `size` (square). Lets a
  // caller fit the glyph into a non-square slot — e.g. a tight
  // mobile title row where vertical room is constrained but
  // horizontal room is plenty. User feedback (mobile zone tab):
  // 'increase the zone icon bigger, removing the space above and
  // below it. however, I dont want that section to increase in size'.
  var sw = strokeWidth != null ? strokeWidth : 1.5;
  var W = width  != null ? width  : (size || 36);
  var H = height != null ? height : (size || 36);

  // Bounding box across every ring of every polygon. lat is Y (north
  // is positive), lng is X. We invert lat so north is at the top of
  // the SVG.
  var minLat = Infinity, maxLat = -Infinity;
  var minLng = Infinity, maxLng = -Infinity;
  zone.polygons.forEach(function(rings){
    if(!rings) return;
    rings.forEach(function(ring){
      if(!ring) return;
      ring.forEach(function(pt){
        if(!pt || pt.length < 2) return;
        var lat = pt[0], lng = pt[1];
        if(lat < minLat) minLat = lat;
        if(lat > maxLat) maxLat = lat;
        if(lng < minLng) minLng = lng;
        if(lng > maxLng) maxLng = lng;
      });
    });
  });
  if(!isFinite(minLat) || !isFinite(minLng)) return null;

  var dLat = (maxLat - minLat) || 1;
  var dLng = (maxLng - minLng) || 1;
  // Tighter pad than before (was sw + 1, now sw / 2) so the polygon
  // fills more of the viewport. Matches the user's 'remove space'
  // intent without changing layout — the change is internal to the
  // SVG, container is unchanged.
  var pad = sw / 2;
  var availW = W - pad * 2;
  var availH = H - pad * 2;
  var scale = Math.min(availW / dLng, availH / dLat);
  // Centre the projected polygon inside the SVG.
  var w = dLng * scale, h = dLat * scale;
  var ox = (W - w) / 2;
  var oy = (H - h) / 2;
  function project(lat, lng){
    var x = ox + (lng - minLng) * scale;
    var y = oy + (maxLat - lat) * scale;  // invert lat
    return x.toFixed(2) + "," + y.toFixed(2);
  }

  // Each polygon ring becomes one M..L..Z path segment so a
  // multi-polygon zone (e.g. peninsulas + main mass) renders as
  // separate filled regions inside one <path>.
  var d = "";
  zone.polygons.forEach(function(rings){
    if(!rings) return;
    rings.forEach(function(ring){
      if(!ring || ring.length < 2) return;
      ring.forEach(function(pt, i){
        d += (i === 0 ? "M" : "L") + project(pt[0], pt[1]);
      });
      d += "Z";
    });
  });

  return (
    <svg
      width={W} height={H}
      viewBox={"0 0 " + W + " " + H}
      aria-hidden="true"
      style={{ display:"block", flexShrink: 0 }}>
      <path
        d={d}
        fill={fill || "none"}
        stroke={stroke || zone.color || "currentColor"}
        strokeWidth={sw}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}
