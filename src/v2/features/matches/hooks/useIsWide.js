// useIsWide — viewport-based responsive split for the v2 design. Above
// the breakpoint we render the desktop/iPad layout (`DesktopLiveScreen`);
// below it we render the mobile layout (`LiveScoringScreen`). 700px is
// the threshold the design itself uses to flip layouts.

import { useEffect, useState } from "react";

export function useIsWide(minWidth = 700) {
  const [wide, setWide] = useState(() => {
    if (typeof window === "undefined") return true;
    return window.matchMedia(`(min-width: ${minWidth}px)`).matches;
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia(`(min-width: ${minWidth}px)`);
    const onChange = (e) => setWide(e.matches);
    if (mq.addEventListener) mq.addEventListener("change", onChange);
    else mq.addListener(onChange);
    return () => {
      if (mq.removeEventListener) mq.removeEventListener("change", onChange);
      else mq.removeListener(onChange);
    };
  }, [minWidth]);

  return wide;
}
