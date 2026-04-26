// src/app/providers.jsx
import { useEffect } from "react";

export default function Providers({ t, theme, children }){
  useEffect(function(){
    var el=document.createElement("style");
    el.id="cs-css";
    el.textContent=[
      // ── Base ──────────────────────────────────────────────────────────────
      "body{background:"+t.bg+";color:"+t.text+";font-family:'Space Grotesk',-apple-system,BlinkMacSystemFont,sans-serif;margin:0}",
      "button{cursor:pointer;font-family:inherit;letter-spacing:0.01em}",
      "input,select,textarea{font-family:inherit;letter-spacing:0.01em}",
      "input:focus,select:focus,textarea:focus{outline:none}",
      "::-webkit-scrollbar{width:0;height:0}",
      "*{box-sizing:border-box}",

      // ── Keyframes ─────────────────────────────────────────────────────────
      "@keyframes fadeUp{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}",
      "@keyframes pop{0%{transform:scale(.97);opacity:0}100%{transform:scale(1);opacity:1}}",
      "@keyframes slideUp{from{transform:translateY(100%)}to{transform:translateY(0)}}",
      "@keyframes slideInRight{from{transform:translateX(100%)}to{transform:translateX(0)}}",
      "@keyframes reveal{from{clip-path:inset(100% 0 0 0)}to{clip-path:inset(0 0 0 0)}}",
      "@keyframes shimmer{0%{background-position:-400px 0}100%{background-position:400px 0}}",
      // Brief accent ring pulse — used when deep-linking into a list to
      // visually guide the eye to the row that was just targeted (e.g.
      // tapping a challenge_received notification scrolls to + pulses
      // the matching row on /tournaments/challenges).
      "@keyframes deeplinkPulse{0%{box-shadow:0 0 0 0 "+t.accent+"00,0 0 0 0 "+t.accent+"00}"+
        "10%{box-shadow:0 0 0 4px "+t.accent+",0 0 24px 0 "+t.accent+"66}"+
        "100%{box-shadow:0 0 0 0 "+t.accent+"00,0 0 0 0 "+t.accent+"00}}",

      // ── Animation classes ─────────────────────────────────────────────────
      ".slide-in-right{animation:slideInRight .28s cubic-bezier(.32,.72,0,1) both}",
      ".fade-up{animation:fadeUp .3s cubic-bezier(.32,.72,0,1) both}",
      ".pop{animation:pop .22s cubic-bezier(.34,2.27,.64,1) both}",
      ".slide-up{animation:slideUp .36s cubic-bezier(.32,.72,0,1) both}",
      ".reveal{animation:reveal .4s cubic-bezier(.32,.72,0,1) both}",
      ".cs-deeplink-pulse{animation:deeplinkPulse 1.8s cubic-bezier(.32,.72,0,1) both;border-radius:inherit}",

      // ── Responsive layout shell ───────────────────────────────────────────
      // Mobile default: single column, block layout. Uses 100dvh so iOS
      // Safari's url-bar collapse / Android keyboard open doesn't leave
      // a dead strip at the bottom or push content under the chrome.
      "html,body{margin:0;padding:0;overflow-x:hidden}",
      "body{min-height:100dvh}",
      ".cs-shell{min-height:100dvh;display:block;background:"+t.bg+"}",
      ".cs-center-col{flex:1;min-width:0}",
      ".cs-sidebar-col{display:none}",
      ".cs-right-col{display:none}",

      // Desktop ≥1024px: flex row, show sidebar
      "@media(min-width:1024px){",
        ".cs-shell{display:flex;align-items:flex-start}",
        ".cs-sidebar-col{display:flex;flex-direction:column;width:64px;min-width:64px;flex-shrink:0;",
          "position:sticky;top:0;height:100vh;border-right:1px solid "+t.border+";",
          "background:"+t.bgCard+";overflow:hidden;z-index:30;transition:width 0.2s}",
        ".cs-center-col{overflow-y:auto;max-height:100vh}",
      "}",

      // ≥1200px: expand sidebar to show labels
      "@media(min-width:1200px){.cs-sidebar-col{width:220px;min-width:220px}}",

      // ≥1440px: show right panel + hide chrome that duplicates right-panel actions
      "@media(min-width:1440px){",
        ".cs-right-col{display:flex;flex-direction:column;width:292px;min-width:292px;",
          "flex-shrink:0;position:sticky;top:0;height:100vh;border-left:1px solid "+t.border+";",
          "overflow-y:auto;gap:0}",
        // Anything tagged .cs-hide-at-rightpanel is duplicated by the right
        // panel at this breakpoint (e.g. the feed header "+ Log match" button
        // is covered by RightPanel's Quick Actions). Hide it to avoid two
        // affordances for the same action.
        ".cs-hide-at-rightpanel{display:none!important}",
      "}",

      // Hide mobile chrome on desktop
      "@media(min-width:1024px){.cs-mob-nav{display:none!important}.cs-mob-tabs{display:none!important}}",

      // Mobile bottom padding (tab bar clearance) — removed on desktop
      ".cs-outer-pad{padding-bottom:80px}",
      "@media(min-width:1024px){.cs-outer-pad{padding-bottom:0}}",

      // ── Shell height tokens (for full-bleed pages like Map) ──────────────
      // --cs-nav-h = sticky mobile top nav height; --cs-tab-h = mobile bottom
      // tab bar height including iOS safe area. Both collapse to 0 on desktop.
      ":root{--cs-nav-h:52px;--cs-tab-h:calc(48px + env(safe-area-inset-bottom,0px))}",
      "@media(min-width:1024px){:root{--cs-nav-h:0px;--cs-tab-h:0px}}",
      // A map-mode flag on the center col kills the outer-pad padding so the
      // map can reach the tab bar; the map itself owns its own sizing.
      ".cs-center-col-map{padding-bottom:0!important}",
      // Full-bleed map frame. Uses dvh so iOS url-bar retraction doesn't
      // leave a dead strip at the bottom. isolation:isolate caps Leaflet's
      // internal z-indexes so Settings + modals render cleanly on top.
      ".cs-map-frame{position:relative;overflow:hidden;min-height:360px;isolation:isolate;" +
        "height:calc(100dvh - var(--cs-nav-h) - var(--cs-tab-h))}",

      // Map-native Play Match — basemap softens during play mode.
      // Light blur only (no darken, no desat) per user feedback —
      // the basemap should recede subtly, not feel "off". Reduced
      // ~30% from the original 2.5px → 1.75px.
      ".leaflet-container[data-play-mode='zone'] .leaflet-tile-pane," +
        ".leaflet-container[data-play-mode='court'] .leaflet-tile-pane," +
        ".leaflet-container[data-play-mode='players'] .leaflet-tile-pane{" +
        "filter:blur(1.75px);" +
        "transition:filter 0.35s ease}",

      // Map-native Play Match — court markers in step 2 use a 4-way
      // diagonal-offset placement so labels don't stack on top of
      // each other in dense clusters. Each marker is a 140×80 box
      // with: an SVG diagonal connector line + a 10px white dot at
      // the lat/lng anchor + a glassy white label pill at the
      // diagonal offset. Direction cycles NE/NW/SE/SW per court.
      ".cs-play-court{pointer-events:auto}",
      // (Hover-only labels retired per user — labels now visible
      // always, no connector lines.)
      // Unified label style — pure caps typography. No box, no
      // border. Used for BOTH calm (dot + name below) and crowded
      // (dot + line + offset name) placements. The only difference
      // is position; the type style is the same so the system reads
      // as one visual language. Stronger halo for legibility since
      // we no longer have a chip background.
      ".cs-play-name{font:800 12px/1.15 ui-sans-serif,system-ui,sans-serif;" +
        "color:#000;letter-spacing:0.05em;text-transform:uppercase;" +
        "white-space:nowrap;" +
        // Strong glyph stroke so connector lines that pass near a
        // label appear to go BEHIND the text rather than cutting
        // through letters. paint-order:stroke ensures the white
        // outline is rendered first so the black fill draws on top
        // (otherwise the stroke eats the glyph). Combined with the
        // soft outer halo for legibility on busy basemap.
        "-webkit-text-stroke:2px #fff;" +
        "paint-order:stroke fill;" +
        "text-shadow:0 1px 2px rgba(255,255,255,0.85)," +
        "0 0 6px rgba(255,255,255,0.6)}",
      ".cs-play-dot{width:10px;height:10px;border-radius:50%;background:#fff;" +
        "box-shadow:0 1px 3px rgba(20,18,17,0.4),0 0 0 1px rgba(20,18,17,0.32)}",

      // Zoom-aware label visibility — at broad zoom (city-fit) zone
      // names + activity flames hide so they don't collide with
      // cluster number bubbles. The layers panel toggles still
      // control max visibility; this rule trims them at low zoom.
      // Set on the leaflet container by LeafletMap.applyBroadZoomFlag.
      ".leaflet-container[data-broad-zoom='true'] .cs-zone-name{display:none!important}",
      ".leaflet-container[data-broad-zoom='true'] .cs-zone-centroid .cs-flame{display:none!important}",

      // Leaflet attribution — small, subtle, mobile-safe. Default
      // styling is bulky (12px white pill) and on phones it gets
      // cropped behind the bottom tab bar. Override: small font,
      // semi-transparent bg, lift it above the iOS safe-area + the
      // app's bottom nav so it never gets clipped.
      ".leaflet-control-attribution{font-size:9.5px!important;padding:1px 6px!important;" +
        "background:rgba(255,255,255,0.72)!important;color:#555!important;" +
        "letter-spacing:0.01em;line-height:1.4;border-radius:4px 0 0 0;" +
        "margin:0 0 calc(env(safe-area-inset-bottom,0px) + 4px) 0!important}",
      ".leaflet-control-attribution a{color:#1f6feb!important;text-decoration:none}",
      // On mobile (no hover, narrow viewport) the bottom tab bar
      // sits above the map → push the attribution up clear of it.
      "@media(max-width:1023px){.leaflet-control-attribution{" +
        "margin-bottom:calc(env(safe-area-inset-bottom,0px) + 6px)!important}}",

      // ── Feed card ─────────────────────────────────────────────────────────
      ".cs-card{transition:border-color 0.15s ease,box-shadow 0.15s ease}",
      "@media(hover:hover){.cs-card:hover{border-color:"+t.borderStrong+"!important}}",
      // Slice 5 (design overhaul) — feed-card vertical-spacing pass.
      // Default = mobile = tight (10px between cards, slim header gutter).
      // Desktop ≥1024px restores the existing rhythm. Inline-style
      // overrides require !important here.
      ".cs-feed-card{margin-bottom:10px!important}",
      // v2 match-first refactor removed the 34px header avatar — header
      // is now just the eyebrow + status chrome. Padding-bottom only
      // needs to clear the type, not an avatar circle. Tighten to keep
      // the eyebrow visually attached to the scoreboard below.
      ".cs-feed-card .cs-feed-card-header{padding:12px 14px 6px!important}",
      ".cs-feed-card .cs-feed-card-footer{padding:8px 14px!important}",
      "@media(min-width:1024px){",
        ".cs-feed-card{margin-bottom:14px!important}",
        ".cs-feed-card .cs-feed-card-header{padding:14px 16px 6px!important}",
        ".cs-feed-card .cs-feed-card-footer{padding:10px 16px!important}",
      "}",
      // v2 visual reset — full-width-feed wrapper (Home "All activity"
      // expanded) renders cards edge-to-edge on mobile but with a
      // visible gap between them so they read as separate units, not
      // a single fused list. The gap IS the divider — cards have NO
      // top/bottom borders on mobile to avoid the "double line" effect
      // where two flush hairlines stack into a thick 2px stripe.
      // Desktop ≥1024px restores the constrained gutter + rounded
      // bordered cards with the original 14px gap.
      ".cs-fullbleed-feed-wrap{padding-left:0!important;padding-right:0!important}",
      ".cs-fullbleed-feed-wrap .cs-feed-card{border:none!important;border-radius:0!important;margin-bottom:10px!important}",
      "@media(min-width:1024px){",
        ".cs-fullbleed-feed-wrap{padding-left:clamp(20px,4vw,32px)!important;padding-right:clamp(20px,4vw,32px)!important}",
        ".cs-fullbleed-feed-wrap .cs-feed-card{border:1px solid "+t.border+"!important;border-radius:10px!important;margin-bottom:14px!important}",
      "}",

      // ── Sidebar nav items ─────────────────────────────────────────────────
      ".cs-nav-item{display:flex;align-items:center;gap:10px;padding:8px 12px;border-radius:7px;",
        "border:none;background:transparent;cursor:pointer;width:100%;text-align:left;",
        "transition:background 0.13s ease;white-space:nowrap;overflow:hidden}",
      "@media(hover:hover){.cs-nav-item:hover{background:"+t.bgTertiary+"}}",

      // Sidebar text label — hidden until wide
      ".cs-nav-label{font-size:13px;font-weight:500;overflow:hidden;white-space:nowrap;",
        "display:none;letter-spacing:-0.1px}",
      "@media(min-width:1200px){.cs-nav-label{display:block}}",

      // ── Skeleton loader ───────────────────────────────────────────────────
      ".cs-skeleton{background:linear-gradient(90deg,"+t.bgTertiary+" 25%,"+t.border+" 50%,"+t.bgTertiary+" 75%);",
        "background-size:800px 100%;animation:shimmer 1.4s infinite linear;border-radius:6px}",

      // ── Notification panel — responsive positioning ───────────────────────
      // Mobile: dropdown below the bell button (top-right)
      ".cs-notif-panel{position:fixed;top:58px;right:12px;width:calc(100vw - 24px);max-height:480px;",
        "border-radius:14px;overflow:hidden;animation:pop .2s cubic-bezier(.34,2.27,.64,1) both}",
      // Desktop ≥1024px: full-height slide-in from right edge
      "@media(min-width:1024px){",
        ".cs-notif-panel{top:0;right:0;left:auto;width:380px;height:100vh;max-height:100vh;",
          "border-radius:0;border-left:1px solid "+t.border+";animation:slideInRight .26s cubic-bezier(.32,.72,0,1) both}",
      "}",

      // ── DM conversation details drawer — desktop-only reveal ─────────────
      // The button is display:none in inline style (mobile default); this
      // rule flips it to inline-flex at ≥1024px. Keeping the drawer off
      // mobile avoids cramming a 300px pane beside a 390px thread.
      "@media(min-width:1024px){.cs-dm-details-btn{display:inline-flex!important}}",
    ].join("");
    document.head.appendChild(el);
    document.body.style.background=t.bg;
    return function(){var o=document.getElementById("cs-css");if(o)o.remove();};
  },[theme]);
  return children;
}
