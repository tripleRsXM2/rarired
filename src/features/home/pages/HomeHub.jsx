// src/features/home/pages/HomeHub.jsx
//
// Editorial Tennis home — 3-tile hub (per design-handoff/README).
//
// Replaces the dense feed-driven HomeTab on the /home route with three
// large square tiles: Compete (tournaments + leagues), Matches
// (history), Profile. Each tile pushes the user into an existing
// feature page via the router — Compete → /tournaments, Matches →
// /matches, Profile → /profile. The "+" log-match action lives in
// the bottom tab bar (App.jsx), centered + raised.
//
// (The handoff README originally labeled the first tile "Maps". The
// product term is "Compete" — same destination, more accurate name.)
//
// Design tokens are inlined here to keep the component self-contained
// and avoid leaking the cream/terracotta palette into the rest of the
// app (where the existing per-theme tokens still rule). The tokens
// match design-handoff/styles.css :root exactly:
//
//   bg=#F0E9DA  ink=#2A201A  ink-2=#4A3F36  muted=#8A7F70
//   accent=#FF2D55  win=#3A7D44  loss=#C3392B
//   tile palette: terracotta #B8593E / ochre #8E6C3F / espresso #2A201A
//
// Typography: Space Grotesk (display) / Sora (body) / JetBrains Mono
// (microlabels). Loaded in index.html.

import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { formatMatchScore } from "../../scoring/utils/tennisScoreValidation.js";
import { isActive } from "../../leagues/utils/leagueLifecycle.js";

// ── Design tokens (cream paper + warm earth). Local to this hub so
// existing themed pages keep their tokens untouched.
var TOK = {
  bg:        "#F0E9DA",
  bg2:       "#E8E0CE",
  ink:       "#2A201A",
  ink2:      "#4A3F36",
  muted:     "#8A7F70",
  line:      "rgba(42, 32, 26, 0.12)",
  lineStrong:"rgba(42, 32, 26, 0.22)",
  accent:    "#FF2D55",
  win:       "#3A7D44",
  loss:      "#C3392B",
  display:   "'Space Grotesk', 'Sora', ui-sans-serif, -apple-system, sans-serif",
  sans:      "'Sora', ui-sans-serif, -apple-system, 'SF Pro Text', sans-serif",
  mono:      "'JetBrains Mono', ui-monospace, 'SF Mono', Menlo, monospace",
};

// Tonal warm-earth palette per design-handoff. The "compete" tile is
// the hero terracotta moment; matches sits in ochre clay; profile is
// espresso for the deepest contrast.
var TILE_PALETTE = {
  compete: { bg: "#B8593E", grad: "radial-gradient(120% 80% at 80% 20%, #D27052 0%, #B8593E 45%, #8C3F2A 100%)" },
  matches: { bg: "#8E6C3F", grad: "radial-gradient(120% 80% at 20% 30%, #B58A56 0%, #8E6C3F 50%, #5E4528 100%)" },
  profile: { bg: "#2A201A", grad: "radial-gradient(120% 80% at 60% 40%, #4A3B30 0%, #2A201A 55%, #14100C 100%)" },
};

export default function HomeHub({
  authUser,
  profile,
  history,
  myLeagues,
  // Optional — App.jsx may pass it for the maps-tile kicker count.
  // Falls through gracefully when omitted.
  tournaments,
}) {
  var navigate = useNavigate();
  var greetRef = useRef(null);

  // The README spec: top-bar title "Home" fades in only after the
  // greeting scrolls out of view. We watch the greeting block.
  // Currently we don't render our own top bar (App.jsx renders the
  // global header), so this state is exposed for future top-bar
  // integration. For now we still observe to keep the contract honest.
  // eslint-disable-next-line no-unused-vars
  var [_titleVisible, setTitleVisible] = useState(true);
  useEffect(function () {
    if (!greetRef.current) return;
    var io = new IntersectionObserver(function (entries) {
      setTitleVisible(entries[0].isIntersecting);
    }, { threshold: 0.1 });
    io.observe(greetRef.current);
    return function () { io.disconnect(); };
  }, []);

  // ── Derive tile content from real data ──────────────────────────
  // Greeting name — strip to first word for the bold portion.
  var fullName = (profile && profile.name) || (authUser && authUser.email && authUser.email.split("@")[0]) || "Player";
  var firstName = fullName.split(/\s+/)[0];

  // Compete tile kicker — count active leagues + tournaments.
  var activeLeaguesCount = (myLeagues || []).filter(function (lg) {
    return lg.my_status === "active" && isActive(lg);
  }).length;
  var openTournCount = (tournaments && tournaments.tournaments)
    ? tournaments.tournaments.filter(function (tn) { return tn.status === "open" || tn.status === "active"; }).length
    : 0;
  var competeKickerParts = [];
  if (activeLeaguesCount > 0) competeKickerParts.push(activeLeaguesCount + " active");
  if (openTournCount > 0) competeKickerParts.push(openTournCount + " open");
  var competeKicker = competeKickerParts.length ? competeKickerParts.join(" · ") : "Browse competitions";

  // Compete tile meta — soonest upcoming league/tournament.
  var nextLeague = (myLeagues || []).find(function (lg) {
    return lg.my_status === "active" && isActive(lg);
  });
  var competeMeta = nextLeague
    ? nextLeague.name
    : "Find a league or tournament";

  // Matches tile — confirmed count + last match.
  var confirmedHistory = (history || []).filter(function (m) { return m.status === "confirmed"; });
  var matchesKicker = confirmedHistory.length > 0
    ? confirmedHistory.length + " confirmed"
    : "No matches yet";
  var lastMatch = confirmedHistory[0];
  var matchesMeta;
  if (lastMatch) {
    var oppLabel = lastMatch.friendName || lastMatch.opponentName || lastMatch.oppName || lastMatch.playerName || "—";
    var scoreLabel = formatMatchScore(lastMatch.sets) || "";
    matchesMeta = "Last: " + (scoreLabel ? scoreLabel + " · " : "") + oppLabel;
  } else {
    matchesMeta = "Log your first match";
  }

  // Profile tile — region + level kicker; rating + rank meta.
  var region = (profile && profile.suburb) || "Set a home court";
  var level  = (profile && profile.skill) || "Add a level";
  var profileKicker = region + " · " + level;
  var ratingNum = (profile && profile.ranking_points != null) ? Math.round(profile.ranking_points) : null;
  var profileMeta = ratingNum != null
    ? "Rating " + ratingNum
    : "Tap to view profile";

  // ── Render ──────────────────────────────────────────────────────
  return (
    <div style={{
      background:    TOK.bg,
      color:         TOK.ink,
      fontFamily:    TOK.sans,
      minHeight:     "calc(100dvh - 64px)",
      paddingBottom: 96,
    }}>
      {/* Greeting block — observed for top-bar title fade. */}
      <div ref={greetRef} style={{ padding: "20px 22px 18px" }}>
        <p style={{
          margin:        0,
          fontFamily:    TOK.display,
          fontSize:      26,
          fontWeight:    500,
          letterSpacing: "-0.02em",
          color:         TOK.ink,
          lineHeight:    1.2,
        }}>
          <span style={{ color: TOK.muted, fontWeight: 400 }}>Welcome home,</span>{" "}
          <span style={{ color: TOK.ink, fontWeight: 700 }}>{firstName}</span>
        </p>
      </div>

      {/* 3-tile stack — full-bleed, 12px gap, square 1:1. */}
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <Tile
          kind="compete"
          kicker={competeKicker}
          title="Compete"
          meta={competeMeta}
          onClick={function () { navigate("/tournaments"); }}
          art={<CompeteArt />}
        />
        <Tile
          kind="matches"
          kicker={matchesKicker}
          title="Matches"
          meta={matchesMeta}
          onClick={function () { navigate("/matches"); }}
          art={<MatchesArt />}
        />
        <Tile
          kind="profile"
          kicker={profileKicker}
          title="Profile"
          meta={profileMeta}
          onClick={function () { navigate("/profile"); }}
          art={<ProfileArt initials={initialsFromName(fullName)} />}
        />
      </div>
    </div>
  );
}

// ── Tile ────────────────────────────────────────────────────────
// Square button: solid colour bg + radial-gradient art layer that
// scales 1.04 on hover, 18% top-bottom dark overlay for legibility,
// glass arrow top-right, content stack bottom-left.
function Tile({ kind, kicker, title, meta, onClick, art }) {
  var palette = TILE_PALETTE[kind];

  // Hover scale on the art layer only — the tile itself stays put.
  var [hover, setHover] = useState(false);

  return (
    <button
      onClick={onClick}
      onMouseEnter={function () { setHover(true); }}
      onMouseLeave={function () { setHover(false); }}
      style={{
        position:       "relative",
        width:          "100%",
        aspectRatio:    "1 / 1",
        border:         "none",
        borderRadius:   0,
        overflow:       "hidden",
        background:     palette.bg,
        color:          "#fff",
        textAlign:      "left",
        padding:        28,
        display:        "flex",
        flexDirection:  "column",
        justifyContent: "flex-end",
        cursor:         "pointer",
        transition:     "transform 240ms cubic-bezier(0.22, 1, 0.36, 1)",
      }}>
      {/* Art layer — radial gradient + abstract motif, scales on hover. */}
      <div style={{
        position:   "absolute",
        inset:      0,
        background: palette.grad,
        transform:  hover ? "scale(1.04)" : "scale(1)",
        transition: "transform 700ms cubic-bezier(0.22, 1, 0.36, 1)",
        pointerEvents: "none",
      }}>
        {art}
      </div>

      {/* Legibility overlay. */}
      <div style={{
        position:   "absolute",
        inset:      0,
        background: "linear-gradient(180deg, transparent 30%, rgba(0,0,0,0.45) 100%)",
        pointerEvents: "none",
      }}/>

      {/* Glass arrow, top-right. */}
      <span aria-hidden="true" style={{
        position:       "absolute",
        top:            22,
        right:          22,
        width:          38,
        height:         38,
        borderRadius:   "50%",
        background:     "rgba(255,255,255,0.16)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        color:          "#fff",
        display:        "grid",
        placeItems:     "center",
        fontFamily:     TOK.display,
        fontSize:       20,
        fontWeight:     400,
        border:         "1px solid rgba(255,255,255,0.22)",
      }}>→</span>

      {/* Content stack — bottom-left. */}
      <div style={{
        position:      "relative",
        display:       "flex",
        flexDirection: "column",
        gap:           6,
        color:         "#fff",
      }}>
        <span style={{
          fontFamily:    TOK.mono,
          fontSize:      11,
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          color:         "rgba(255,255,255,0.78)",
          fontWeight:    600,
        }}>
          {kicker}
        </span>
        <h2 style={{
          margin:        0,
          fontFamily:    TOK.display,
          fontSize:      "clamp(48px, 14vw, 64px)",
          fontWeight:    500,
          letterSpacing: "-0.04em",
          lineHeight:    0.95,
          color:         "#fff",
        }}>
          {title}
        </h2>
        <span style={{
          fontFamily:    TOK.mono,
          fontSize:      11.5,
          color:         "rgba(255,255,255,0.78)",
          letterSpacing: "0.04em",
          marginTop:     4,
          // Truncate long meta lines — names/scores can run long.
          overflow:      "hidden",
          textOverflow:  "ellipsis",
          whiteSpace:    "nowrap",
        }}>
          {meta}
        </span>
      </div>
    </button>
  );
}

// ── Art motifs (CSS only, no slop SVG) ──────────────────────────

// Tennis-court abstract — perspective court rectangle with white
// service/baseline lines + a small bracket motif top-right.
function CompeteArt() {
  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none" }}>
      <div style={{
        position:        "absolute",
        top:             "14%",
        left:            "12%",
        right:           "12%",
        bottom:          "38%",
        border:          "2px solid rgba(255,255,255,0.55)",
        borderRadius:    4,
        transform:       "perspective(800px) rotateX(38deg)",
        transformOrigin: "center",
      }}>
        {/* Service + baseline lines */}
        <div style={{ position: "absolute", top: "22%",   left: 0, right: 0, height: 2, background: "rgba(255,255,255,0.55)" }}/>
        <div style={{ position: "absolute", bottom: "22%", left: 0, right: 0, height: 2, background: "rgba(255,255,255,0.55)" }}/>
        <div style={{ position: "absolute", top: "22%",   bottom: "22%", left: "50%", width: 2, background: "rgba(255,255,255,0.55)" }}/>
        {/* Net */}
        <div style={{ position: "absolute", top: "50%", left: "-8%", right: "-8%", height: 3, transform: "translateY(-50%)", background: "rgba(255,255,255,0.75)" }}/>
      </div>
      {/* Bracket motif top-right */}
      <div style={{
        position:      "absolute",
        top:           "8%",
        right:         "6%",
        display:       "flex",
        flexDirection: "column",
        gap:           8,
        opacity:       0.32,
      }}>
        {[0,1,2,3].map(function (i) {
          return (
            <div key={i} style={{ display: "flex", gap: 4 }}>
              <span style={{ display: "block", width: 22, height: 4, background: "#fff", borderRadius: 2 }}/>
              <span style={{ display: "block", width: 22, height: 4, background: "#fff", borderRadius: 2 }}/>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Match streak chart-ish bars + thin horizontal trail rows.
function MatchesArt() {
  var bars = [42, 56, 38, 62, 70, 48, 72, 80, 64, 78, 88];
  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none" }}>
      <div style={{
        position:    "absolute",
        bottom:      "30%",
        left:        "8%",
        right:       "8%",
        height:      "50%",
        display:     "flex",
        alignItems:  "flex-end",
        gap:         6,
      }}>
        {bars.map(function (h, i) {
          return (
            <span key={i} style={{
              flex:         1,
              height:       h + "%",
              background:   (i % 3 === 1) ? "rgba(255,255,255,0.32)" : "rgba(255,255,255,0.85)",
              borderRadius: "3px 3px 0 0",
              minHeight:    "12%",
            }}/>
          );
        })}
      </div>
      <div style={{
        position:      "absolute",
        top:           "14%",
        left:          "8%",
        right:         "8%",
        display:       "flex",
        flexDirection: "column",
        gap:           6,
      }}>
        <div style={{ height: 2, background: "rgba(255,255,255,0.18)", borderRadius: 2, width: "60%" }}/>
        <div style={{ height: 2, background: "rgba(255,255,255,0.18)", borderRadius: 2, width: "80%" }}/>
        <div style={{ height: 2, background: "rgba(255,255,255,0.18)", borderRadius: 2, width: "40%" }}/>
      </div>
    </div>
  );
}

// Profile — big initials orb + concentric rings.
function ProfileArt({ initials }) {
  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none" }}>
      {/* Concentric rings, centered on the orb */}
      <div style={{ position: "absolute", top: "16%", left: "50%", transform: "translateX(-50%)" }}>
        <span style={{ position: "absolute", borderRadius: "50%", border: "1.5px solid rgba(255,255,255,0.18)",
          top: "50%", left: "50%", width: 180, height: 180, margin: "-90px 0 0 -90px" }}/>
        <span style={{ position: "absolute", borderRadius: "50%", border: "1.5px solid rgba(255,255,255,0.18)",
          top: "50%", left: "50%", width: 230, height: 230, margin: "-115px 0 0 -115px", opacity: 0.6 }}/>
        <span style={{ position: "absolute", borderRadius: "50%", border: "1.5px solid rgba(255,255,255,0.18)",
          top: "50%", left: "50%", width: 290, height: 290, margin: "-145px 0 0 -145px", opacity: 0.3 }}/>
      </div>
      {/* Orb with initials */}
      <div style={{
        position:   "absolute",
        top:        "20%",
        left:       "50%",
        transform:  "translateX(-50%)",
        width:      140,
        height:     140,
        borderRadius: "50%",
        background: "linear-gradient(140deg, #C9A876, #8E6C3F)",
        color:      "#1A1410",
        display:    "grid",
        placeItems: "center",
        fontFamily: TOK.mono,
        fontWeight: 700,
        fontSize:   44,
        letterSpacing: "0.04em",
      }}>
        {initials}
      </div>
    </div>
  );
}

// Two-letter initials from a display name.
function initialsFromName(name) {
  if (!name) return "?";
  var parts = String(name).trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
