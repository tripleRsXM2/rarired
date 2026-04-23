// src/lib/utils/deepLink.js
//
// Notification deep-link plumbing. When NotificationsPanel navigates to a
// list-style route, it attaches a highlight id via react-router state.
// Destination panels call `useDeepLinkHighlight(<key>)` and render the
// matching list item with `getDeepLinkRowProps(id)` spread on it — that
// adds a ref (for scrollIntoView) and a brief CSS pulse class.
//
// Usage:
//   var hl = useDeepLinkHighlight("highlightChallengeId");
//   // In the row render:
//   <div {...hl.rowProps(challenge.id)} ...>

import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

export function useDeepLinkHighlight(stateKey) {
  var location = useLocation();
  var navigate = useNavigate();
  var [activeId, setActiveId] = useState(null);
  var nodesRef = useRef({}); // id → HTMLElement

  // On mount / when the route state arrives, pick up the id + clear it
  // from history so it doesn't replay on a back-nav or a second refresh.
  useEffect(function () {
    var incoming = location.state && location.state[stateKey];
    if (!incoming) return;
    setActiveId(incoming);
    // Strip the state from history in place so Back works cleanly.
    navigate(location.pathname + location.search, { replace: true, state: null });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state && location.state[stateKey]]);

  // After render, if there's an active row, scroll it into view + tag for
  // the pulse animation. Clear after 2s so re-renders don't retrigger.
  useEffect(function () {
    if (!activeId) return;
    var el = nodesRef.current[activeId];
    if (el && el.scrollIntoView) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    }
    var tid = setTimeout(function () { setActiveId(null); }, 2000);
    return function () { clearTimeout(tid); };
  }, [activeId]);

  function rowProps(id) {
    return {
      ref: function (node) {
        if (node) nodesRef.current[id] = node;
        else delete nodesRef.current[id];
      },
      className: activeId === id ? "cs-deeplink-pulse" : undefined,
    };
  }

  return { activeId: activeId, rowProps: rowProps };
}
