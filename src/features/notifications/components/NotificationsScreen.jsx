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
import { ED_TOK } from "../../home/components/EditorialScreen.jsx";
import NotificationsPanel from "./NotificationsPanel.jsx";

export default function NotificationsScreen(props) {
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

  // Chrome stripped: the global top bar already reads "Notifications"
  // and provides the bell + avatar nav, so the page-level kicker bar
  // and "Inbox" hero were redundant chrome stacking under it. The
  // body now opens straight into the list with a thin top inset and
  // cream paper background — same realm vocabulary, less furniture.
  return (
    <div style={{
      background:    ED_TOK.bg,
      color:         ED_TOK.ink,
      fontFamily:    ED_TOK.sans,
      minHeight:     "calc(100dvh - var(--cs-nav-h, 0px) - var(--cs-tab-h, 0px))",
      paddingTop:    8,
      paddingBottom: 96,
    }}>
      <NotificationsPanel
        {...props}
        pageMode
      />
    </div>
  );
}
