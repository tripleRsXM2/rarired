// src/features/map/data/courts.js
//
// Hand-curated list of real public / publicly-bookable tennis venues in
// Sydney. The `zone` field is the CourtSync zone id the venue sits in.
//
// Per-court fields:
//   name        — display name (matches the venue's own branding where known)
//   zone        — one of the six zone ids
//   courts      — number of playable courts at the venue
//   lat/lng     — marker position
//   suburb      — nearest suburb (used in the card + Google Maps query)
//   address     — optional street address. When present, googleMapsSearchUrl
//                 uses it instead of suburb for a tighter map target.
//   bookingUrl  — official booking page (null if we don't have a verified one)
//   aliases     — optional array of legacy names. match_history rows logged
//                 under an old venue string still attribute to this court's
//                 zone via mapService's NAME_TO_ZONE (see that file).
//
// We deliberately do NOT embed images. Images of the venues are owned by
// their respective operators (councils, clubs, photographers); surfacing
// them here without a licence is not safe. The card instead links out to
// Google Maps (which handles its own imagery licensing) and — where we
// have it — the operator's booking page.
//
// Known operators used as bookingUrl targets:
//   • https://www.tennisvenues.com.au/booking/<slug>
//       TennisVenues platform — used by ~20 Sydney venues from
//       Northern Beaches down through the Inner West, Eastern Suburbs,
//       and St George. Batch-added from the council-verified PDF
//       "Sydney Tennis Courts Editable List" (2026-04).
//   • https://parklandssports.com.au/online-court-bookings/
//       Centennial Parklands venues (Moore Park Tennis + adjacent).
//   • https://www.citycommunitytennis.com.au/locations
//       City Community Tennis — legacy list for venues not yet on
//       TennisVenues (Rushcutters Bay, Alexandria, Erskineville,
//       Perry Park, Wentworth, Jubilee, etc).
//   • Randwick / Waverley / Inner West / North Sydney council pages —
//       legit landing pages for council-managed venues that don't have
//       a direct booking URL yet.
//
// When the operator isn't verified, bookingUrl is null and the
// CourtInfoCard renders a short note + the Google Maps link.

var TV_BASE    = "https://www.tennisvenues.com.au/booking/";
function tv(slug){ return TV_BASE + slug; }

var PARKLANDS  = "https://parklandssports.com.au/online-court-bookings/";
var CCT        = "https://www.citycommunitytennis.com.au/locations";
var RANDWICK   = "https://www.randwick.nsw.gov.au/community/sport-and-recreation";
var INNER_WEST = "https://www.innerwest.nsw.gov.au/live/recreation-and-sports";
var NORTH_SYD  = "https://www.northsydney.nsw.gov.au/recreation-facilities";

// Jensens Tennis — runs their own booking engine on the intrac platform.
// Per-venue deep link by facility id. Public URLs with no auth bypass, no
// scraping, no embedding — standard hyperlink use (same legal posture as
// every other operator we link out to).
var JENSENS_BASE = "https://jensenstennis.intrac.com.au/tennis/book.cfm";
function jensens(facilityId, courtId){
  if (courtId) return JENSENS_BASE + "?location=" + facilityId + "&court=" + courtId;
  return JENSENS_BASE + "?facility=" + facilityId;
}

export var COURTS = [
  // ── Zone 1 — CBD / Inner City ──────────────────────────────────────────
  // Jensens Tennis runs the direct booking engine for Prince Alfred Park
  // (facility=1), Alexandria Park (=2), Beaconsfield / Perry Park (=3),
  // Wentworth Park / Glebe (=4), and Rosebery (location=6, court=283).
  // These deep-links go straight to the booking page vs the slower
  // TennisVenues / CCT aggregator pages.
  { name:"Prince Alfred Park Tennis Courts", zone:"cbd",  courts:6, lat:-33.8898, lng:151.2093,
    suburb:"Surry Hills", address:"Corner Cleveland and Chalmers Street, Surry Hills NSW 2010",
    bookingUrl: jensens(1),
    aliases: ["Prince Alfred Park"] },
  { name:"Rushcutters Bay Tennis",   zone:"cbd",  courts:4, lat:-33.8744, lng:151.2285,
    suburb:"Rushcutters Bay",  bookingUrl: CCT },
  { name:"Alexandria Park Tennis",   zone:"cbd",  courts:6, lat:-33.9010, lng:151.1970,
    suburb:"Alexandria",       bookingUrl: jensens(2) },
  { name:"Erskineville Oval Tennis", zone:"cbd",  courts:2, lat:-33.9030, lng:151.1860,
    suburb:"Erskineville",     bookingUrl: CCT },
  { name:"Perry Park Tennis",        zone:"cbd",  courts:4, lat:-33.9120, lng:151.1940,
    suburb:"Beaconsfield",     bookingUrl: jensens(3) },
  { name:"Rosebery Tennis",          zone:"cbd",  courts:4, lat:-33.9195, lng:151.2050,
    suburb:"Rosebery",         bookingUrl: jensens(6, 283) },

  // ── Zone 2 — Eastern Suburbs ───────────────────────────────────────────
  { name:"Centennial Parklands Sports Centre / Moore Park Tennis Courts",
    zone:"east", courts:19, lat:-33.8940, lng:151.2205,
    suburb:"Moore Park", address:"Corner Anzac Parade and Lang Road, Moore Park NSW 2021",
    bookingUrl: PARKLANDS,
    aliases: ["Moore Park Tennis", "Centennial Parklands Tennis"] },
  { name:"Sydney Boys High School Courts", zone:"east", courts:4, lat:-33.8935, lng:151.2165,
    suburb:"Moore Park", address:"556 Cleveland St, Moore Park NSW 2021",
    bookingUrl: tv("sydney-boys-high-school") },
  { name:"Bondi Beach Tennis",       zone:"east", courts:4, lat:-33.8910, lng:151.2690,
    suburb:"Bondi", address:"1A Warners Avenue, Bondi NSW 2026",
    bookingUrl: tv("bondi-tc") },
  { name:"Coogee Beach Tennis",      zone:"east", courts:4, lat:-33.9200, lng:151.2572,
    suburb:"Coogee", address:"Cnr Bream & Brook St, Coogee NSW 2034",
    bookingUrl: tv("eastern-suburbs-tennis-club") },
  { name:"Eastside Tennis Centre",   zone:"east", courts:4, lat:-33.9290, lng:151.2270,
    suburb:"Kingsford", address:"1 Court Ave, Kingsford NSW 2032",
    bookingUrl: tv("eastside-tennis-centre") },
  { name:"Snape Park Tennis Centre", zone:"east", courts:4, lat:-33.9395, lng:151.2405,
    suburb:"Maroubra", address:"15 Snape Street, Maroubra NSW 2035",
    bookingUrl: tv("snape-park-tc") },
  { name:"Cooper Park Tennis",       zone:"east", courts:8, lat:-33.8825, lng:151.2510,
    suburb:"Double Bay",       bookingUrl: tv("cooper-park-tc") },
  // Steyne Park + Waverley Park Tennis removed per user — not curated.
  { name:"Queens Park Tennis",       zone:"east", courts:4, lat:-33.8958, lng:151.2520,
    suburb:"Queens Park",
    bookingUrl: "https://www.queensparktennis.com.au/contact-us" },
  { name:"Latham Park Tennis",       zone:"east", courts:5, lat:-33.9189, lng:151.2555,
    suburb:"Coogee",           bookingUrl: tv("latham-park-tc") },
  { name:"Des Renford Tennis",       zone:"east", courts:6, lat:-33.9390, lng:151.2410,
    suburb:"Maroubra",         bookingUrl: RANDWICK },
  { name:"Heffron Park Tennis",      zone:"east", courts:8, lat:-33.9433, lng:151.2360,
    suburb:"Maroubra",         bookingUrl: RANDWICK },

  // ── Zone 3 — Inner West ────────────────────────────────────────────────
  { name:"Birchgrove Park Tennis Centre", zone:"inner-west", courts:3, lat:-33.8495, lng:151.1780,
    suburb:"Birchgrove", address:"Cnr Louisa Rd and Rose St, Birchgrove NSW 2041",
    bookingUrl: tv("birchgrove-park-tc"),
    aliases: ["Birchgrove Park"] },
  { name:"Croker Park Tennis Courts", zone:"inner-west", courts:4, lat:-33.8625, lng:151.1275,
    suburb:"Five Dock", address:"Croker Park, 1C Henley Marine Drive, Five Dock NSW 2046",
    bookingUrl: tv("Croker-park-tc") },
  { name:"Five Dock Park Tennis Centre", zone:"inner-west", courts:4, lat:-33.8705, lng:151.1295,
    suburb:"Five Dock", address:"20B Barnstaple Road, Five Dock NSW 2046",
    bookingUrl: tv("five-dock-tc") },
  { name:"Haberfield Tennis Centre (The Ark)", zone:"inner-west", courts:6, lat:-33.8790, lng:151.1395,
    suburb:"Haberfield", address:"154A Hawthorne Parade, Haberfield NSW 2045",
    bookingUrl: tv("haberfield-tc") },
  { name:"Trinity Tennis Centre",    zone:"inner-west", courts:4, lat:-33.9150, lng:151.1155,
    suburb:"Canterbury", address:"55 King St, Canterbury NSW 2193",
    bookingUrl: tv("trinity-tennis-centre") },
  { name:"Wentworth Park Tennis",    zone:"inner-west", courts:4, lat:-33.8790, lng:151.1937,
    suburb:"Glebe",            bookingUrl: jensens(4) },
  { name:"Jubilee Park Tennis",      zone:"inner-west", courts:2, lat:-33.8803, lng:151.1808,
    suburb:"Glebe",            bookingUrl: CCT },
  { name:"Camperdown Memorial",      zone:"inner-west", courts:3, lat:-33.8904, lng:151.1770,
    suburb:"Newtown",
    bookingUrl: "https://www.camperdowntennis.com.au/Intrac" },
  { name:"Leichhardt Park Tennis",   zone:"inner-west", courts:6, lat:-33.8724, lng:151.1563,
    suburb:"Lilyfield",        bookingUrl: INNER_WEST },
  { name:"Mackey Park Tennis",       zone:"inner-west", courts:4, lat:-33.9163, lng:151.1490,
    suburb:"Marrickville",     bookingUrl: INNER_WEST },
  { name:"Steel Park Tennis",        zone:"inner-west", courts:3, lat:-33.9145, lng:151.1553,
    suburb:"Marrickville",     bookingUrl: INNER_WEST },

  // ── Zone 4 — Lower North Shore ─────────────────────────────────────────
  { name:"Cammeray Tennis Club",     zone:"lower-north", courts:6, lat:-33.8240, lng:151.2108,
    suburb:"Cammeray", address:"Cnr Ernest St and Park Ave, Cammeray NSW 2062",
    bookingUrl: tv("cammeray-tc") },
  { name:"Primrose Park Tennis",     zone:"lower-north", courts:4, lat:-33.8235, lng:151.2305,
    suburb:"Cremorne", address:"Matora Lane, off Young Street, Cremorne NSW 2090",
    bookingUrl: tv("primrose-park-tc") },
  { name:"Mowbray Public School Tennis Courts", zone:"lower-north", courts:4, lat:-33.8110, lng:151.1635,
    suburb:"Lane Cove", address:"Mowbray Rd and Hatfield St, Lane Cove NSW 2066",
    bookingUrl: tv("mowbray-public-school") },
  { name:"Mosman Lawn Tennis Club",  zone:"lower-north", courts:4, lat:-33.8280, lng:151.2420,
    suburb:"Mosman", address:"32 Rosebery St, Mosman NSW 2088",
    bookingUrl: tv("mosman-lawn-tc") },
  { name:"Rawson Park Tennis",       zone:"lower-north", courts:4, lat:-33.8320, lng:151.2420,
    suburb:"Mosman", address:"Alexander Ave, Mosman NSW 2088",
    bookingUrl: tv("rawson-park-tc") },
  { name:"North Sydney Tennis",      zone:"lower-north", courts:7, lat:-33.8423, lng:151.2125,
    suburb:"North Sydney",     bookingUrl: NORTH_SYD },
  { name:"St Leonards Park Tennis",  zone:"lower-north", courts:4, lat:-33.8342, lng:151.2063,
    suburb:"North Sydney",     bookingUrl: NORTH_SYD },
  // Drill Hall Common removed per user.
  { name:"Chatswood Park Tennis",    zone:"lower-north", courts:5, lat:-33.7984, lng:151.1860,
    suburb:"Chatswood",
    bookingUrl: "https://www.chatswoodtennis.com.au/book-a-court/#bookacourt" },
  { name:"Blackman Park Tennis",     zone:"lower-north", courts:4, lat:-33.8174, lng:151.1527,
    suburb:"Lane Cove",
    bookingUrl: "https://lcw.tennisbcs.com.au/Applns/Bookings/Bookdisp2.aspx" },

  // ── Zone 5 — Northern Beaches ──────────────────────────────────────────
  { name:"Keirle Park Tennis Centre", zone:"northern-beaches", courts:3, lat:-33.7985, lng:151.2822,
    suburb:"Manly", address:"277 Pittwater Rd, Manly NSW 2095",
    bookingUrl: tv("keirle-park-tennis-centre"),
    aliases: ["Keirle Park Tennis"] },
  { name:"Bareena Park Tennis Club", zone:"northern-beaches", courts:4, lat:-33.8085, lng:151.2670,
    suburb:"Balgowlah Heights", address:"Vista Avenue, Balgowlah Heights NSW 2093",
    bookingUrl: tv("bareena-park-tc") },
  { name:"Koobilya St Tennis Court", zone:"northern-beaches", courts:2, lat:-33.7998, lng:151.2500,
    suburb:"Seaforth", address:"Opposite 14 Koobilya St, Seaforth NSW 2092",
    bookingUrl: tv("koobilya-st-tennis-court") },
  { name:"Wakehurst Tennis, Seaforth", zone:"northern-beaches", courts:4, lat:-33.7960, lng:151.2510,
    suburb:"Seaforth", address:"Upper Clontarf St, Seaforth NSW 2092",
    bookingUrl: tv("wakehurst-tc") },
  { name:"Narraweena Tennis Club",   zone:"northern-beaches", courts:4, lat:-33.7520, lng:151.2830,
    suburb:"Narraweena", address:"Cnr McIntosh & Victor Roads, Narraweena NSW 2099",
    bookingUrl: tv("narraweena-tennis-club") },
  { name:"Collaroy Tennis Club",     zone:"northern-beaches", courts:4, lat:-33.7370, lng:151.3000,
    suburb:"Collaroy", address:"Griffith Park, Anzac Ave, Collaroy NSW 2097",
    bookingUrl: tv("collaroy-tc") },
  { name:"Manly Park Tennis",        zone:"northern-beaches", courts:4, lat:-33.7943, lng:151.2820,
    suburb:"Manly",
    bookingUrl: "https://www.keirleparktenniscentre.com.au/tennis-court-hire-manly-2095/" },

  // ── Zone 6 — South / Bayside ───────────────────────────────────────────
  { name:"Illawarra Tennis Centre Rockdale", zone:"south", courts:6, lat:-33.9550, lng:151.1365,
    suburb:"Rockdale", address:"71 Chapel Street, Rockdale NSW 2216",
    bookingUrl: tv("rockdale-tc") },
  { name:"Parkside Tennis Courts",   zone:"south", courts:4, lat:-33.9885, lng:151.1215,
    suburb:"Kogarah Bay", address:"Harold Fraser Oval, 280 Princes Hwy, Kogarah Bay NSW 2217",
    bookingUrl: tv("parkside-tennis-courts-kogarah") },
  { name:"Ken Rosewall Tennis Centre", zone:"south", courts:8, lat:-33.9890, lng:151.0835,
    suburb:"Mortdale", address:"53 Roberts Ave, Mortdale NSW 2223",
    bookingUrl: tv("ken-rosewall-tennis-centre") },
  // Lance Hutchison Tennis + Bicentennial Park Tennis removed per user.
];

export function courtsInZone(zoneId){
  return COURTS.filter(function(c){ return c.zone === zoneId; });
}

export function totalCourtsInZone(zoneId){
  return courtsInZone(zoneId).reduce(function(n,c){ return n + c.courts; }, 0);
}

// Google Maps search URL for a court. Prefers the full street address when
// present (tighter hit), falls back to name + suburb. Landing on Google
// Maps gives photos, Street View, reviews, and directions — offloads all
// imagery licensing entirely to them.
export function googleMapsSearchUrl(court){
  var q = court.address
    ? encodeURIComponent(court.address)
    : encodeURIComponent(court.name + " " + (court.suburb||"") + " Sydney NSW");
  return "https://www.google.com/maps/search/?api=1&query=" + q;
}
