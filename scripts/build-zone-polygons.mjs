// scripts/build-zone-polygons.mjs
//
// One-off generator. Reads the NSW suburb GeoJSON, filters features by
// each zone's member-suburb list, unions them with Turf, simplifies the
// result, and emits a compact JS module containing the six zone shapes.
//
// Run whenever the zone member lists change:
//   node scripts/build-zone-polygons.mjs
//
// Output is committed at src/features/map/data/zonePolygons.js so the
// runtime bundle never needs turf or the raw geojson.

import fs from "node:fs";
import path from "node:path";
import url from "node:url";
import * as turf from "@turf/turf";

var __dirname = path.dirname(url.fileURLToPath(import.meta.url));

// Keep in sync with src/features/map/data/zones.js — member lists only.
var ZONE_MEMBERS = {
  "cbd": [
    "SYDNEY","HAYMARKET","THE ROCKS","MILLERS POINT","BARANGAROO","DAWES POINT",
    "PYRMONT","ULTIMO","CHIPPENDALE","DARLINGTON","REDFERN","EVELEIGH",
    "SURRY HILLS","DARLINGHURST","WOOLLOOMOOLOO","POTTS POINT","ELIZABETH BAY",
    "RUSHCUTTERS BAY","WATERLOO","ZETLAND","ALEXANDRIA","BEACONSFIELD",
    "ERSKINEVILLE","ROSEBERY",
  ],
  "east": [
    "PADDINGTON","WOOLLAHRA","CENTENNIAL PARK","MOORE PARK","QUEENS PARK","WAVERLEY",
    "DOUBLE BAY","BELLEVUE HILL","DARLING POINT","EDGECLIFF","POINT PIPER",
    "ROSE BAY","VAUCLUSE","WATSONS BAY","DOVER HEIGHTS",
    "BONDI","BONDI BEACH","NORTH BONDI","TAMARAMA","BRONTE","BONDI JUNCTION",
    "CLOVELLY","COOGEE","SOUTH COOGEE","RANDWICK","KENSINGTON","KINGSFORD",
    "MAROUBRA","MALABAR","LITTLE BAY","CHIFLEY","MATRAVILLE","EASTGARDENS",
    "PAGEWOOD","HILLSDALE","DACEYVILLE","PHILLIP BAY","LA PEROUSE","EASTLAKES",
  ],
  "inner-west": [
    "NEWTOWN","ENMORE","CAMPERDOWN","MACDONALDTOWN","ST PETERS","SYDENHAM","TEMPE",
    "STANMORE","PETERSHAM","LEWISHAM","DULWICH HILL","HURLSTONE PARK",
    "MARRICKVILLE","TURRELLA","EARLWOOD",
    "GLEBE","FOREST LODGE","ANNANDALE","LEICHHARDT","LILYFIELD","ROZELLE",
    "BALMAIN","BALMAIN EAST","BIRCHGROVE",
    "HABERFIELD","SUMMER HILL","ASHFIELD","ASHBURY","CROYDON","CROYDON PARK",
    "CANTERBURY",
    // Drummoyne peninsula — added per user.
    "DRUMMOYNE","RUSSELL LEA","RODD POINT","FIVE DOCK","WAREEMBA",
    "ABBOTSFORD","CHISWICK",
  ],
  "lower-north": [
    "NORTH SYDNEY","MCMAHONS POINT","MILSONS POINT","LAVENDER BAY","KIRRIBILLI",
    "WAVERTON","NEUTRAL BAY","KURRABA POINT",
    "MOSMAN","CREMORNE","CREMORNE POINT","BEAUTY POINT","CLIFTON GARDENS","BALMORAL",
    "CROWS NEST","ST LEONARDS","NAREMBURN","WOLLSTONECRAFT","CAMMERAY",
    "NORTHBRIDGE","GREENWICH",
    "ARTARMON","WILLOUGHBY","WILLOUGHBY EAST","NORTH WILLOUGHBY","CASTLECRAG",
    "CASTLE COVE","MIDDLE COVE","CHATSWOOD","CHATSWOOD WEST",
    "LANE COVE","LANE COVE NORTH","LANE COVE WEST","LONGUEVILLE","RIVERVIEW",
    "LINLEY POINT","NORTHWOOD",
    "HUNTERS HILL","WOOLWICH","HUNTLEYS POINT","HUNTLEYS COVE",
  ],
  "northern-beaches": [
    // North Harbour removed per user — sits across the harbour from
    // Manly and felt geographically off-zone.
    //
    // Trimmed northern half: per user "remove everything north of
    // Belrose / North Narrabeen / Ingleside, as well as those just
    // listed." Removed: North Narrabeen, Elanora Heights, Warriewood,
    // Mona Vale, Bayview, Newport, Bilgola, Bilgola Plateau, Avalon
    // Beach, Clareville, Whale Beach, Palm Beach, Church Point,
    // Ingleside, Terrey Hills, Duffys Forest, Davidson, Belrose.
    "MANLY","MANLY VALE","FAIRLIGHT","BALGOWLAH","BALGOWLAH HEIGHTS","NORTH BALGOWLAH",
    "SEAFORTH","CLONTARF","QUEENSCLIFF","NORTH MANLY",
    "FRESHWATER","CURL CURL","NORTH CURL CURL","DEE WHY","BROOKVALE","BEACON HILL",
    "NARRAWEENA","CROMER","COLLAROY","COLLAROY PLATEAU","WHEELER HEIGHTS",
    "NARRABEEN",
    "FORESTVILLE","FRENCHS FOREST","KILLARNEY HEIGHTS","ALLAMBIE HEIGHTS",
  ],
  "south": [
    "MASCOT","BOTANY","BANKSMEADOW","PORT BOTANY",
    "ROCKDALE","BEXLEY","BEXLEY NORTH","KINGSGROVE",
    "BRIGHTON-LE-SANDS","KYEEMAGH","ARNCLIFFE","WOLLI CREEK","BANKSIA",
    "BARDWELL PARK","BARDWELL VALLEY","MONTEREY",
    "KOGARAH","KOGARAH BAY","CARLTON","ALLAWAH","HURSTVILLE","HURSTVILLE GROVE",
    "SOUTH HURSTVILLE","OATLEY",
    "RAMSGATE","RAMSGATE BEACH","DOLLS POINT","SANDRINGHAM","SANS SOUCI",
    "BEVERLEY PARK","CARSS PARK","BLAKEHURST","CONNELLS POINT","KYLE BAY",
  ],
};

// Read the raw suburb polygons.
var geo = JSON.parse(fs.readFileSync(path.join(__dirname, "sydney-suburbs.geojson"), "utf8"));

// Name → feature lookup
var nameToFeature = {};
geo.features.forEach(function(f){
  var n = (f.properties && f.properties.name || "").trim().toUpperCase();
  if(n) nameToFeature[n] = f;
});

// Union each zone's member suburbs.
var out = {};
var missing = {};

Object.entries(ZONE_MEMBERS).forEach(function(entry){
  var zoneId = entry[0];
  var members = entry[1];
  var polys = [];
  members.forEach(function(m){
    var feat = nameToFeature[m.toUpperCase()];
    if(!feat){
      missing[zoneId] = (missing[zoneId]||[]).concat(m);
      return;
    }
    // Normalise to Polygon list.
    if(feat.geometry.type === "Polygon") polys.push(turf.polygon(feat.geometry.coordinates));
    else if(feat.geometry.type === "MultiPolygon"){
      feat.geometry.coordinates.forEach(function(ring){ polys.push(turf.polygon(ring)); });
    }
  });
  if(!polys.length){ out[zoneId] = null; return; }

  // turf@7 changed union's signature to take a FeatureCollection; passing
  // two Features (the old API) throws "Must have at least 2 geometries"
  // and kills the iteration — losing every suburb after the first.
  var merged = polys[0];
  var failed = 0;
  for(var i=1;i<polys.length;i++){
    try {
      var u = turf.union(turf.featureCollection([merged, polys[i]]));
      if(u) merged = u;
      else failed++;
    } catch(e){ failed++; }
  }
  if(failed) console.log("  " + zoneId + ": " + failed + "/" + (polys.length-1) + " union steps skipped");
  // Light simplify — keeps real curves but drops sub-metre noise so the
  // polygons don't balloon the bundle. Tolerance is in degrees (~10m here).
  var simp = turf.simplify(merged, { tolerance: 0.00008, highQuality: true, mutate: false });
  out[zoneId] = simp.geometry;
});

// Log any member suburbs the geojson doesn't have — harmless, but good to see.
var missingCount = 0;
Object.entries(missing).forEach(function(e){ missingCount += e[1].length; });
if(missingCount) console.log("Missing members (not fatal):", missing);

// Emit the Leaflet-ready polygon arrays: lat/lng (swap from geojson's lng/lat).
function toLeafletRings(geom){
  function swapRing(ring){ return ring.map(function(p){ return [p[1], p[0]]; }); }
  if(geom.type === "Polygon") return [geom.coordinates.map(swapRing)];
  if(geom.type === "MultiPolygon") return geom.coordinates.map(function(p){ return p.map(swapRing); });
  return [];
}

var js = 'export var ZONE_POLYGONS = {\n';
Object.entries(out).forEach(function(e){
  var id = e[0], geom = e[1];
  if(!geom){ js += '  "' + id + '": [],\n'; return; }
  var rings = toLeafletRings(geom);
  js += '  "' + id + '": ' + JSON.stringify(rings) + ',\n';
});
js += '};\n';

var outPath = path.join(__dirname, "..", "src", "features", "map", "data", "zonePolygons.js");
fs.writeFileSync(outPath, '// GENERATED by scripts/build-zone-polygons.mjs — do not edit by hand.\n' + js);
console.log("Wrote", outPath, "(" + fs.statSync(outPath).size + " bytes)");
