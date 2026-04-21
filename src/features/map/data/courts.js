// src/features/map/data/courts.js
//
// Hand-curated list of real public / publicly-bookable tennis venues in
// Sydney. The `zone` field is the CourtSync zone id the venue sits in —
// wired to the side panel "Courts nearby" list.
//
// Source: design hand-off. Safe to grow over time; keep it a static list
// until we need a courts table in the DB.

export var COURTS = [
  // Zone 1 — CBD / Inner City
  { name: "Prince Alfred Park",      zone: "cbd",              courts: 6, lat: -33.8898, lng: 151.2093 },
  { name: "Rushcutters Bay Tennis",  zone: "cbd",              courts: 4, lat: -33.8744, lng: 151.2285 },

  // Zone 2 — Eastern Suburbs
  { name: "Moore Park Tennis",       zone: "east",             courts: 9, lat: -33.8940, lng: 151.2205 },
  { name: "Cooper Park Tennis",      zone: "east",             courts: 8, lat: -33.8825, lng: 151.2510 },
  { name: "Steyne Park",             zone: "east",             courts: 2, lat: -33.8760, lng: 151.2435 },
  { name: "Queens Park Tennis",      zone: "east",             courts: 4, lat: -33.8958, lng: 151.2520 },
  { name: "Waverley Park Tennis",    zone: "east",             courts: 6, lat: -33.8968, lng: 151.2565 },
  { name: "Latham Park Tennis",      zone: "east",             courts: 5, lat: -33.9189, lng: 151.2555 },
  { name: "Des Renford Tennis",      zone: "east",             courts: 6, lat: -33.9390, lng: 151.2410 },
  { name: "Heffron Park Tennis",     zone: "east",             courts: 8, lat: -33.9433, lng: 151.2360 },

  // Zone 3 — Inner West
  { name: "Wentworth Park Tennis",   zone: "inner-west",       courts: 4, lat: -33.8790, lng: 151.1937 },
  { name: "Camperdown Memorial",     zone: "inner-west",       courts: 3, lat: -33.8904, lng: 151.1770 },
  { name: "Jubilee Park Tennis",     zone: "inner-west",       courts: 2, lat: -33.8803, lng: 151.1808 },
  { name: "Leichhardt Park Tennis",  zone: "inner-west",       courts: 6, lat: -33.8724, lng: 151.1563 },
  { name: "Mackey Park Tennis",      zone: "inner-west",       courts: 4, lat: -33.9163, lng: 151.1490 },
  { name: "Steel Park Tennis",       zone: "inner-west",       courts: 3, lat: -33.9145, lng: 151.1553 },
  { name: "Birchgrove Park",         zone: "inner-west",       courts: 3, lat: -33.8495, lng: 151.1780 },

  // Zone 4 — Lower North Shore
  { name: "North Sydney Tennis",     zone: "lower-north",      courts: 7, lat: -33.8423, lng: 151.2125 },
  { name: "St Leonards Park Tennis", zone: "lower-north",      courts: 4, lat: -33.8342, lng: 151.2063 },
  { name: "Primrose Park Tennis",    zone: "lower-north",      courts: 4, lat: -33.8235, lng: 151.2305 },
  { name: "Drill Hall Common",       zone: "lower-north",      courts: 2, lat: -33.8289, lng: 151.2480 },
  { name: "Chatswood Park Tennis",   zone: "lower-north",      courts: 5, lat: -33.7984, lng: 151.1860 },
  { name: "Blackman Park Tennis",    zone: "lower-north",      courts: 4, lat: -33.8174, lng: 151.1527 },

  // Zone 5 — Northern Beaches
  { name: "Manly Park Tennis",       zone: "northern-beaches", courts: 4, lat: -33.7943, lng: 151.2820 },
  { name: "Keirle Park Tennis",      zone: "northern-beaches", courts: 3, lat: -33.7990, lng: 151.2785 },

  // Zone 6 — South / Bayside
  { name: "Lance Hutchison Tennis",  zone: "south",            courts: 4, lat: -33.9268, lng: 151.1960 },
  { name: "Bicentennial Park Tennis",zone: "south",            courts: 4, lat: -33.9478, lng: 151.1370 },
];

export function courtsInZone(zoneId){
  return COURTS.filter(function(c){ return c.zone === zoneId; });
}

export function totalCourtsInZone(zoneId){
  return courtsInZone(zoneId).reduce(function(n,c){ return n + c.courts; }, 0);
}
