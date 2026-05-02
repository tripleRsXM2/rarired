// src/features/home/components/EditorialTabBar.jsx
//
// Bottom tab bar — Editorial Tennis design (per design-handoff
// /Users/mkhc/Downloads/design_handoff_courtsync_home, screenshot
// reference). 5 items in a 5-column grid:
//
//   HOME · MAPS · + · FRIENDS · ME
//
// Layout / chrome:
//   - cream bg (ED_TOK.bg), hairline top border (ED_TOK.line)
//   - JetBrains Mono uppercase labels under each line-art icon
//   - active state = ink color, inactive = muted
//   - center "+" is a raised red circle that lifts 16px above the
//     bar (margin-top: -16px), accent fill, soft shadow, +2px lift
//     on hover. Tapping it fires onLogMatch — the universal
//     "log a match" entry point.
//
// Routing (mapped to existing app):
//   HOME     → /home (HomeHub)
//   MAPS     → /map (court-discovery map — the actual "maps" feature)
//   +        → openLogMatch (no route change)
//   FRIENDS  → /people
//   ACTIVITY → /matches (editorial match history list)
//
// Profile (/profile) is reachable via the avatar in the global
// top mob nav — no longer needs its own bottom-tab slot. The
// Compete hub (/tournaments) is reachable via the home-hub
// Compete tile + via direct URL.
//
// Hidden on desktop ≥1024px via the existing .cs-mob-tabs media
// rule in providers.jsx.

import { ED_TOK } from "./EditorialScreen.jsx";

// Line-art icons — 22×22 viewBox, currentColor stroke, 1.6 width.
// Matches the screenshot reference exactly.
var ICONS = {
  home: function () {
    return (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" strokeWidth="1.6"
        strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 11.5 12 4l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z"/>
      </svg>
    );
  },
  maps: function () {
    return (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" strokeWidth="1.6"
        strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2z"/>
        <path d="M9 4v14M15 6v14"/>
      </svg>
    );
  },
  friends: function () {
    return (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" strokeWidth="1.6"
        strokeLinecap="round" strokeLinejoin="round">
        <circle cx="9" cy="9" r="3.5"/>
        <circle cx="17" cy="10" r="2.5"/>
        <path d="M3 19c.8-3 3.4-4.5 6-4.5s5.2 1.5 6 4.5M14 17c.6-2 2.2-3 4-3s2.6.6 3 1.7"/>
      </svg>
    );
  },
  me: function () {
    return (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" strokeWidth="1.6"
        strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21c1.5-4 5-6 8-6s6.5 2 8 6"/>
      </svg>
    );
  },
  // Activity — bar-chart trend, mirrors the Matches home-hub tile
  // motif so the destination feels consistent.
  activity: function () {
    return (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" strokeWidth="1.6"
        strokeLinecap="round" strokeLinejoin="round">
        <path d="M5 21V11M11 21V5M17 21v-7M3 21h18"/>
      </svg>
    );
  },
};

// Tab definitions — id is the route's first path segment, used by
// the parent's setTab(id) handler.
var TABS = [
  { id: "home",    label: "Home",     Icon: ICONS.home     },
  { id: "map",     label: "Maps",     Icon: ICONS.maps     },
  { id: "log",     label: "Log",      primary: true        },
  { id: "people",  label: "Friends",  Icon: ICONS.friends  },
  { id: "matches", label: "Activity", Icon: ICONS.activity },
];

export default function EditorialTabBar({ activeTab, onTab, onLogMatch }) {
  return (
    <nav className="cs-mob-tabs" style={{
      position:       "fixed",
      bottom:         0,
      left:           0,
      right:          0,
      zIndex:         50,
      background:     ED_TOK.bg,
      borderTop:      "1px solid " + ED_TOK.line,
      backdropFilter: "blur(8px)",
      WebkitBackdropFilter: "blur(8px)",
      // Distribute 5 columns evenly. Padding at the bottom respects
      // the iOS home-bar inset so labels don't sit under the system
      // gesture indicator.
      display:             "grid",
      gridTemplateColumns: "repeat(5, 1fr)",
      padding:             "8px 8px calc(14px + env(safe-area-inset-bottom, 0px))",
      // The raised "+" pokes 16px above the bar — give the nav an
      // extra top margin so the lifted button doesn't get clipped
      // by a parent's overflow:hidden when one is introduced later.
      // (No-op today; defence-in-depth.)
      overflow:            "visible",
    }}>
      {TABS.map(function (tb) {
        if (tb.primary) {
          return (
            <button
              key={tb.id}
              onClick={onLogMatch}
              aria-label="Log a match"
              style={{
                background:    ED_TOK.accent,
                color:         "#fff",
                borderRadius:  "50%",
                width:         52,
                height:        52,
                margin:        "-16px auto 0",
                alignSelf:     "center",
                justifySelf:   "center",
                display:       "grid",
                placeItems:    "center",
                border:        "none",
                cursor:        "pointer",
                boxShadow:     "0 8px 22px rgba(255, 45, 85, 0.32)",
                transition:    "transform 160ms cubic-bezier(0.22, 1, 0.36, 1)",
              }}
              onMouseEnter={function (e) { e.currentTarget.style.transform = "translateY(-2px)"; }}
              onMouseLeave={function (e) { e.currentTarget.style.transform = "translateY(0)"; }}>
              <span style={{
                fontFamily: ED_TOK.display,
                fontSize:   28,
                lineHeight: 1,
                fontWeight: 400,
              }}>+</span>
            </button>
          );
        }
        var on = activeTab === tb.id;
        return (
          <button
            key={tb.id}
            onClick={function () { onTab(tb.id); }}
            style={{
              background:    "none",
              border:         "none",
              display:        "flex",
              flexDirection:  "column",
              alignItems:     "center",
              gap:            4,
              padding:        "8px 4px",
              color:          on ? ED_TOK.ink : ED_TOK.muted,
              fontFamily:     ED_TOK.mono,
              fontSize:       9.5,
              letterSpacing:  "0.12em",
              textTransform:  "uppercase",
              fontWeight:     500,
              cursor:         "pointer",
              transition:     "color 160ms",
            }}
            onMouseEnter={function (e) { if (!on) e.currentTarget.style.color = ED_TOK.ink; }}
            onMouseLeave={function (e) { if (!on) e.currentTarget.style.color = ED_TOK.muted; }}>
            <tb.Icon/>
            <span>{tb.label.toUpperCase()}</span>
          </button>
        );
      })}
    </nav>
  );
}
