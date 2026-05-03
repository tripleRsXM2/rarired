// src/features/notifications/components/NotificationsScreen.jsx
//
// Dedicated /notifications page in the Editorial Tennis realm.
// Replaces the legacy popup overlay with a proper route — same
// vocabulary as LogMatchPage / CreateLeagueModal / ProfileScreen:
// cream paper, espresso ink, mono uppercase microlabel kicker,
// display-font hero title, hairline section divider.
//
// The body of the screen renders <NotificationsPanel pageMode />,
// which strips the panel's own header + fixed-overlay chrome and
// hands the inner list back to us. All notification logic, grouping,
// row rendering, lifecycle behaviour stays inside the panel — this
// file is purely the screen wrapper.

import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ED_TOK } from "../../home/components/EditorialScreen.jsx";
import NotificationsPanel from "./NotificationsPanel.jsx";

export default function NotificationsScreen(props) {
  var navigate = useNavigate();

  // Mark seen on mount — same hook the popup-toggle path used to fire.
  // This clears the bell-badge unread count, but sticky_after_read
  // rows (casual_match_logged) stay visible because isActiveForUser
  // honours that flag.
  useEffect(function () {
    if (props.markSeen) props.markSeen();
    // intentionally only on mount — re-running on every render would
    // mark every row read on every re-render of the parent.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleBack() {
    if (typeof window !== "undefined" && window.history.length > 1) {
      navigate(-1);
    } else {
      navigate("/home");
    }
  }

  return (
    <div style={{
      background:    ED_TOK.bg,
      color:         ED_TOK.ink,
      fontFamily:    ED_TOK.sans,
      minHeight:     "calc(100dvh - var(--cs-nav-h, 0px) - var(--cs-tab-h, 0px))",
      paddingBottom: 96,
    }}>
      {/* Sticky chrome — same composition as EditorialScreen so the
          notifications page reads as part of the same family.
          Back chevron + mono kicker + spacer. */}
      <div style={{
        display:        "flex",
        alignItems:     "center",
        justifyContent: "space-between",
        gap:            12,
        padding:        "16px 22px 12px",
        position:       "sticky",
        top:            "var(--cs-nav-h, 0px)",
        background:     ED_TOK.bg,
        borderBottom:   "1px solid " + ED_TOK.line,
        zIndex:         2,
      }}>
        <button
          onClick={handleBack}
          aria-label="Back"
          style={{
            width:        32,
            height:       32,
            borderRadius: "50%",
            background:   "transparent",
            border:       "1px solid " + ED_TOK.line,
            color:        ED_TOK.ink,
            display:      "grid",
            placeItems:   "center",
            cursor:       "pointer",
            transition:   "background 160ms ease",
          }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2"
            strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 18l-6-6 6-6"/>
          </svg>
        </button>
        <span style={{
          fontFamily:    ED_TOK.mono,
          fontSize:      10.5,
          letterSpacing: "0.16em",
          textTransform: "uppercase",
          color:         ED_TOK.muted,
          fontWeight:    600,
          textAlign:     "center",
          flex:          1,
        }}>
          Notifications
        </span>
        <div style={{ width: 32 }}/>
      </div>

      {/* Hero title — display font, 56px clamp, same lockup as
          /matches and /profile. */}
      <div style={{ padding: "26px 22px 18px" }}>
        <h1 style={{
          margin:        0,
          fontFamily:    ED_TOK.display,
          fontSize:      "clamp(40px, 12vw, 56px)",
          fontWeight:    500,
          letterSpacing: "-0.035em",
          lineHeight:    0.92,
          color:         ED_TOK.ink,
        }}>
          Inbox
        </h1>
      </div>

      {/* Hairline divider opens the list section. */}
      <div style={{ height: 1, background: ED_TOK.line, margin: "0 22px 6px" }}/>

      {/* Body — let NotificationsPanel render its own list logic. */}
      <NotificationsPanel
        {...props}
        pageMode
      />
    </div>
  );
}
