// Single source of truth for "are we on a phone-sized viewport?"
// Used by every surface that needs to swap mobile-only chrome
// (top-left vs bottom-left card position, segmented progress bar
// padding, prompt sizing, etc.). Re-evaluates on resize so a
// phone rotated to landscape past the breakpoint flips state.
//
// Breakpoint locked at 767px to match the existing ZoneSidePanel
// + Messages conventions in this codebase.

import { useEffect, useState } from "react";

var QUERY = "(max-width: 767px)";

function read(){
  return typeof window !== "undefined" && window.matchMedia(QUERY).matches;
}

export default function useIsMobile(){
  var [v, setV] = useState(read);
  useEffect(function(){
    if(typeof window === "undefined") return;
    var mq = window.matchMedia(QUERY);
    function onChange(e){ setV(e.matches); }
    if(mq.addEventListener) mq.addEventListener("change", onChange);
    else mq.addListener(onChange);
    return function(){
      if(mq.removeEventListener) mq.removeEventListener("change", onChange);
      else mq.removeListener(onChange);
    };
  },[]);
  return v;
}
