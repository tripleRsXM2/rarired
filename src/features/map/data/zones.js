// src/features/map/data/zones.js
//
// The six CourtSync matchmaking zones. Each one aggregates many real NSW
// suburbs into one contiguous area. Polygons are REAL — generated offline
// from `scripts/sydney-suburbs.geojson` by `scripts/build-zone-polygons.mjs`,
// unioned per zone, simplified, and committed at `./zonePolygons.js` so the
// runtime bundle never needs Turf or the raw GeoJSON.
//
// Each zone's `polygons` is an array of [lat, lng] ring arrays (Leaflet order);
// each zone has 1 or more polygons (MultiPolygon → array of polygons).
// `members` is the uppercase suburb list — used to map a user's declared
// suburb to a zone later.
// `center` is the centroid the map uses for the zone label + home pin.

import { ZONE_POLYGONS } from "./zonePolygons.js";

export var ZONES = [
  {
    id: "cbd", num: 1, name: "CBD / Inner City", region: "cbd",
    color: "#E8736A",
    blurb: "City, Surry Hills, Darlinghurst, Pyrmont, Ultimo",
    center: [-33.883, 151.207],
    polygons: ZONE_POLYGONS["cbd"],
    members: [
      "SYDNEY","HAYMARKET","THE ROCKS","MILLERS POINT","BARANGAROO","DAWES POINT",
      "PYRMONT","ULTIMO","CHIPPENDALE","DARLINGTON","REDFERN","EVELEIGH",
      "SURRY HILLS","DARLINGHURST","WOOLLOOMOOLOO","POTTS POINT","ELIZABETH BAY",
      "RUSHCUTTERS BAY","WATERLOO","ZETLAND","ALEXANDRIA","BEACONSFIELD",
      "ERSKINEVILLE","ROSEBERY",
    ],
  },

  {
    id: "east", num: 2, name: "Eastern Suburbs", region: "east",
    color: "#E89B4A",
    blurb: "Bondi, Coogee, Randwick, Bronte, Clovelly, Rose Bay",
    center: [-33.905, 151.260],
    polygons: ZONE_POLYGONS["east"],
    members: [
      "PADDINGTON","WOOLLAHRA","CENTENNIAL PARK","MOORE PARK","QUEENS PARK","WAVERLEY",
      "DOUBLE BAY","BELLEVUE HILL","DARLING POINT","EDGECLIFF","POINT PIPER",
      "ROSE BAY","VAUCLUSE","WATSONS BAY","DOVER HEIGHTS",
      "BONDI","BONDI BEACH","NORTH BONDI","TAMARAMA","BRONTE","BONDI JUNCTION",
      "CLOVELLY","COOGEE","SOUTH COOGEE","RANDWICK","KENSINGTON","KINGSFORD",
      "MAROUBRA","MALABAR","LITTLE BAY","CHIFLEY","MATRAVILLE","EASTGARDENS",
      "PAGEWOOD","HILLSDALE","DACEYVILLE","PHILLIP BAY","LA PEROUSE","EASTLAKES",
    ],
  },

  {
    id: "inner-west", num: 3, name: "Inner West", region: "inner-west",
    color: "#6FB28F",
    blurb: "Newtown, Marrickville, Leichhardt, Stanmore, Dulwich Hill",
    center: [-33.895, 151.160],
    polygons: ZONE_POLYGONS["inner-west"],
    members: [
      "NEWTOWN","ENMORE","CAMPERDOWN","MACDONALDTOWN","ST PETERS","SYDENHAM","TEMPE",
      "STANMORE","PETERSHAM","LEWISHAM","DULWICH HILL","HURLSTONE PARK",
      "MARRICKVILLE","TURRELLA","EARLWOOD",
      "GLEBE","FOREST LODGE","ANNANDALE","LEICHHARDT","LILYFIELD","ROZELLE",
      "BALMAIN","BALMAIN EAST","BIRCHGROVE",
      "HABERFIELD","SUMMER HILL","ASHFIELD","ASHBURY","CROYDON","CROYDON PARK",
      "CANTERBURY",
    ],
  },

  {
    id: "lower-north", num: 4, name: "Lower North Shore", region: "north-shore",
    color: "#B691C9",
    blurb: "North Sydney, Neutral Bay, Mosman, Cremorne, Chatswood",
    center: [-33.818, 151.205],
    polygons: ZONE_POLYGONS["lower-north"],
    members: [
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
  },

  {
    id: "northern-beaches", num: 5, name: "Northern Beaches", region: "northern-beaches",
    color: "#7FC4D9",
    blurb: "Manly, Dee Why, Brookvale, Curl Curl, Narrabeen, Palm Beach",
    center: [-33.700, 151.300],
    polygons: ZONE_POLYGONS["northern-beaches"],
    members: [
      "MANLY","MANLY VALE","FAIRLIGHT","BALGOWLAH","BALGOWLAH HEIGHTS","NORTH BALGOWLAH",
      "SEAFORTH","CLONTARF","QUEENSCLIFF","NORTH MANLY","NORTH HARBOUR",
      "FRESHWATER","CURL CURL","NORTH CURL CURL","DEE WHY","BROOKVALE","BEACON HILL",
      "NARRAWEENA","CROMER","COLLAROY","COLLAROY PLATEAU","WHEELER HEIGHTS",
      "NARRABEEN","NORTH NARRABEEN","ELANORA HEIGHTS","WARRIEWOOD","MONA VALE",
      "BAYVIEW","NEWPORT","BILGOLA","BILGOLA PLATEAU","AVALON BEACH","CLAREVILLE",
      "WHALE BEACH","PALM BEACH","CHURCH POINT","INGLESIDE","TERREY HILLS",
      "DUFFYS FOREST","BELROSE","DAVIDSON","FORESTVILLE","FRENCHS FOREST",
      "KILLARNEY HEIGHTS","ALLAMBIE HEIGHTS",
    ],
  },

  {
    id: "south", num: 6, name: "South / Bayside", region: "south",
    color: "#4BA8A8",
    blurb: "Mascot, Botany, Brighton-Le-Sands, Kogarah, Rockdale",
    center: [-33.955, 151.170],
    polygons: ZONE_POLYGONS["south"],
    members: [
      "MASCOT","BOTANY","BANKSMEADOW","PORT BOTANY",
      "ROCKDALE","BEXLEY","BEXLEY NORTH","KINGSGROVE",
      "BRIGHTON-LE-SANDS","KYEEMAGH","ARNCLIFFE","WOLLI CREEK","BANKSIA",
      "BARDWELL PARK","BARDWELL VALLEY","MONTEREY",
      "KOGARAH","KOGARAH BAY","CARLTON","ALLAWAH","HURSTVILLE","HURSTVILLE GROVE",
      "RAMSGATE","RAMSGATE BEACH","DOLLS POINT","SANDRINGHAM","SANS SOUCI",
      "BEVERLEY PARK","CARSS PARK","BLAKEHURST","CONNELLS POINT","KYLE BAY",
    ],
  },
];

export var ZONE_BY_ID = {};
ZONES.forEach(function(z){ ZONE_BY_ID[z.id] = z; });

// Quick lookup: uppercase suburb name → zone id (used to infer a user's
// home zone from their declared profile suburb, if set).
export var SUBURB_TO_ZONE = {};
ZONES.forEach(function(z){
  z.members.forEach(function(m){ SUBURB_TO_ZONE[m.toUpperCase()] = z.id; });
});

// Total bounds of all six zones — used to fit the map view on mount.
// Derived from the polygons above; hardcoded to avoid a runtime sweep.
export var SYDNEY_BOUNDS = [[-34.02, 151.08], [-33.59, 151.36]];
