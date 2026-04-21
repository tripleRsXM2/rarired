// src/features/map/data/courts.js
//
// Hand-curated list of real public / publicly-bookable tennis venues in
// Sydney. The `zone` field is the CourtSync zone id the venue sits in.
//
// Per-court fields:
//   name        — display name
//   zone        — one of the six zone ids
//   courts      — number of playable courts at the venue
//   lat/lng     — marker position
//   suburb      — nearest suburb (used in the card + Google Maps query)
//   bookingUrl  — official booking page (null if we don't have a verified one)
//
// We deliberately do NOT embed images. Images of the venues are owned by
// their respective operators (councils, clubs, photographers); surfacing
// them here without a licence is not safe. The card instead links out to
// Google Maps (which handles its own imagery licensing) and — where we
// have it — the operator's booking page.
//
// Booking URLs are grouped by operator where possible:
//   • City of Sydney courts — https://book.cityofsydney.nsw.gov.au/
//   • Randwick council courts — https://www.randwick.nsw.gov.au/community/sport-and-recreation/sport-and-fitness-venues
//   • Waverley council courts — https://www.waverley.nsw.gov.au/recreation
//   • North Sydney council — https://www.northsydney.nsw.gov.au/recreation-facilities
//   • Individual clubs — own websites
// When a specific URL isn't known the card falls back to a helpful note
// with the Google Maps link.

export var COURTS = [
  // Zone 1 — CBD / Inner City
  { name:"Prince Alfred Park",       zone:"cbd",              courts:6, lat:-33.8898, lng:151.2093,
    suburb:"Surry Hills",
    bookingUrl:"https://www.cityofsydney.nsw.gov.au/venues-facilities-hire/prince-alfred-park-pool-tennis" },
  { name:"Rushcutters Bay Tennis",   zone:"cbd",              courts:4, lat:-33.8744, lng:151.2285,
    suburb:"Rushcutters Bay",
    bookingUrl:"https://www.rushcuttersbaytennis.com.au/" },

  // Zone 2 — Eastern Suburbs
  { name:"Moore Park Tennis",        zone:"east",             courts:9, lat:-33.8940, lng:151.2205,
    suburb:"Moore Park",
    bookingUrl:"https://mptennis.com.au/" },
  { name:"Cooper Park Tennis",       zone:"east",             courts:8, lat:-33.8825, lng:151.2510,
    suburb:"Double Bay",
    bookingUrl:"https://cooperparktennis.com.au/" },
  { name:"Steyne Park",              zone:"east",             courts:2, lat:-33.8760, lng:151.2435,
    suburb:"Double Bay",
    bookingUrl:null },
  { name:"Queens Park Tennis",       zone:"east",             courts:4, lat:-33.8958, lng:151.2520,
    suburb:"Queens Park",
    bookingUrl:"https://queensparktennis.com.au/" },
  { name:"Waverley Park Tennis",     zone:"east",             courts:6, lat:-33.8968, lng:151.2565,
    suburb:"Bondi Junction",
    bookingUrl:"https://waverleyparktennis.com.au/" },
  { name:"Latham Park Tennis",       zone:"east",             courts:5, lat:-33.9189, lng:151.2555,
    suburb:"Coogee",
    bookingUrl:null },
  { name:"Des Renford Tennis",       zone:"east",             courts:6, lat:-33.9390, lng:151.2410,
    suburb:"Maroubra",
    bookingUrl:"https://www.randwick.nsw.gov.au/community/sport-and-recreation" },
  { name:"Heffron Park Tennis",      zone:"east",             courts:8, lat:-33.9433, lng:151.2360,
    suburb:"Maroubra",
    bookingUrl:"https://www.randwick.nsw.gov.au/community/sport-and-recreation" },

  // Zone 3 — Inner West
  { name:"Wentworth Park Tennis",    zone:"inner-west",       courts:4, lat:-33.8790, lng:151.1937,
    suburb:"Glebe",
    bookingUrl:null },
  { name:"Camperdown Memorial",      zone:"inner-west",       courts:3, lat:-33.8904, lng:151.1770,
    suburb:"Newtown",
    bookingUrl:null },
  { name:"Jubilee Park Tennis",      zone:"inner-west",       courts:2, lat:-33.8803, lng:151.1808,
    suburb:"Glebe",
    bookingUrl:null },
  { name:"Leichhardt Park Tennis",   zone:"inner-west",       courts:6, lat:-33.8724, lng:151.1563,
    suburb:"Lilyfield",
    bookingUrl:"https://www.innerwest.nsw.gov.au/live/recreation-and-sports" },
  { name:"Mackey Park Tennis",       zone:"inner-west",       courts:4, lat:-33.9163, lng:151.1490,
    suburb:"Marrickville",
    bookingUrl:"https://www.innerwest.nsw.gov.au/live/recreation-and-sports" },
  { name:"Steel Park Tennis",        zone:"inner-west",       courts:3, lat:-33.9145, lng:151.1553,
    suburb:"Marrickville",
    bookingUrl:"https://www.innerwest.nsw.gov.au/live/recreation-and-sports" },
  { name:"Birchgrove Park",          zone:"inner-west",       courts:3, lat:-33.8495, lng:151.1780,
    suburb:"Birchgrove",
    bookingUrl:null },

  // Zone 4 — Lower North Shore
  { name:"North Sydney Tennis",      zone:"lower-north",      courts:7, lat:-33.8423, lng:151.2125,
    suburb:"North Sydney",
    bookingUrl:"https://www.northsydneytennis.com.au/" },
  { name:"St Leonards Park Tennis",  zone:"lower-north",      courts:4, lat:-33.8342, lng:151.2063,
    suburb:"North Sydney",
    bookingUrl:"https://www.northsydney.nsw.gov.au/recreation-facilities" },
  { name:"Primrose Park Tennis",     zone:"lower-north",      courts:4, lat:-33.8235, lng:151.2305,
    suburb:"Cremorne",
    bookingUrl:null },
  { name:"Drill Hall Common",        zone:"lower-north",      courts:2, lat:-33.8289, lng:151.2480,
    suburb:"Mosman",
    bookingUrl:null },
  { name:"Chatswood Park Tennis",    zone:"lower-north",      courts:5, lat:-33.7984, lng:151.1860,
    suburb:"Chatswood",
    bookingUrl:null },
  { name:"Blackman Park Tennis",     zone:"lower-north",      courts:4, lat:-33.8174, lng:151.1527,
    suburb:"Lane Cove",
    bookingUrl:null },

  // Zone 5 — Northern Beaches
  { name:"Manly Park Tennis",        zone:"northern-beaches", courts:4, lat:-33.7943, lng:151.2820,
    suburb:"Manly",
    bookingUrl:null },
  { name:"Keirle Park Tennis",       zone:"northern-beaches", courts:3, lat:-33.7990, lng:151.2785,
    suburb:"Manly",
    bookingUrl:null },

  // Zone 6 — South / Bayside
  { name:"Lance Hutchison Tennis",   zone:"south",            courts:4, lat:-33.9268, lng:151.1960,
    suburb:"Mascot",
    bookingUrl:null },
  { name:"Bicentennial Park Tennis", zone:"south",            courts:4, lat:-33.9478, lng:151.1370,
    suburb:"Rockdale",
    bookingUrl:null },
];

export function courtsInZone(zoneId){
  return COURTS.filter(function(c){ return c.zone === zoneId; });
}

export function totalCourtsInZone(zoneId){
  return courtsInZone(zoneId).reduce(function(n,c){ return n + c.courts; }, 0);
}

// Google Maps search URL for a court. Lands on the Google Maps page for
// the venue where the user can view photos, street view, reviews, and
// get directions — offloads imagery licensing entirely to Google.
export function googleMapsSearchUrl(court){
  var q = encodeURIComponent(court.name + " " + (court.suburb||"") + " Sydney NSW");
  return "https://www.google.com/maps/search/?api=1&query=" + q;
}
