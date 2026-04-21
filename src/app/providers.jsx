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

      // ── Animation classes ─────────────────────────────────────────────────
      ".slide-in-right{animation:slideInRight .28s cubic-bezier(.32,.72,0,1) both}",
      ".fade-up{animation:fadeUp .3s cubic-bezier(.32,.72,0,1) both}",
      ".pop{animation:pop .22s cubic-bezier(.34,2.27,.64,1) both}",
      ".slide-up{animation:slideUp .36s cubic-bezier(.32,.72,0,1) both}",
      ".reveal{animation:reveal .4s cubic-bezier(.32,.72,0,1) both}",

      // ── Responsive layout shell ───────────────────────────────────────────
      // Mobile default: single column, block layout
      ".cs-shell{min-height:100vh;display:block;background:"+t.bg+"}",
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

      // ≥1440px: show right panel
      "@media(min-width:1440px){",
        ".cs-right-col{display:flex;flex-direction:column;width:292px;min-width:292px;",
          "flex-shrink:0;position:sticky;top:0;height:100vh;border-left:1px solid "+t.border+";",
          "overflow-y:auto;gap:0}",
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

      // ── Feed card ─────────────────────────────────────────────────────────
      ".cs-card{transition:border-color 0.15s ease,box-shadow 0.15s ease}",
      "@media(hover:hover){.cs-card:hover{border-color:"+t.borderStrong+"!important}}",

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
    ].join("");
    document.head.appendChild(el);
    document.body.style.background=t.bg;
    return function(){var o=document.getElementById("cs-css");if(o)o.remove();};
  },[theme]);
  return children;
}
