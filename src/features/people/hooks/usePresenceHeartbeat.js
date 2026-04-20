// src/features/people/hooks/usePresenceHeartbeat.js
//
// Lightweight presence heartbeat:
//  • Pings profiles.last_active on mount
//  • Pings every HEARTBEAT_MS while the page is visible
//  • Pings again when the tab becomes visible after being hidden
//  • Stops when the tab is hidden (no spammy background pings)
//
// Always tracks last_active server-side, even if the user has hidden their
// presence from others — visibility is enforced at read time, not write time.

import { useEffect, useRef } from "react";
import { touchPresence } from "../services/presenceService.js";

var HEARTBEAT_MS = 60 * 1000; // 1 minute

export function usePresenceHeartbeat(authUser){
  var timerRef = useRef(null);
  var uid = authUser && authUser.id;

  useEffect(function(){
    if(!uid) return;

    function ping(){ touchPresence(uid); }

    function start(){
      if(timerRef.current) return;
      ping();
      timerRef.current = setInterval(ping, HEARTBEAT_MS);
    }
    function stop(){
      if(!timerRef.current) return;
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    function onVisibility(){
      if(document.visibilityState === "visible") start();
      else stop();
    }

    if(document.visibilityState === "visible") start();
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", start);
    window.addEventListener("blur", stop);
    window.addEventListener("beforeunload", stop);

    return function(){
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", start);
      window.removeEventListener("blur", stop);
      window.removeEventListener("beforeunload", stop);
    };
  }, [uid]);
}
