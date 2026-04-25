// src/features/rating/components/RatingInfoIcon.jsx
//
// Tiny info `(i)` button that opens RatingInfoModal. Designed to sit
// next to the "COURTSYNC RATING" eyebrow on hero displays without
// stealing visual weight.

import { useState } from "react";
import { NAV_ICONS } from "../../../lib/constants/navIcons.jsx";
import RatingInfoModal from "./RatingInfoModal.jsx";
import { track } from "../../../lib/analytics.js";

export default function RatingInfoIcon({ t, size, label }) {
  var sz = size || 14;
  var [open, setOpen] = useState(false);

  function handleOpen() {
    setOpen(true);
    // Analytics — fire-and-forget. If track() doesn't exist or the
    // event isn't registered, the call is harmless.
    if (track) track("rating_info_opened", { surface: label || "unknown" });
  }

  return (
    <>
      <button
        type="button"
        onClick={handleOpen}
        aria-label="How CourtSync Rating works"
        title="How CourtSync Rating works"
        style={{
          background: "transparent", border: "none",
          padding: 0, margin: 0,
          width: sz + 4, height: sz + 4,
          display: "inline-flex",
          alignItems: "center", justifyContent: "center",
          color: t.textTertiary,
          cursor: "pointer",
          transition: "color 0.13s",
          flexShrink: 0,
        }}
        onMouseEnter={function (e) { e.currentTarget.style.color = t.text; }}
        onMouseLeave={function (e) { e.currentTarget.style.color = t.textTertiary; }}
      >
        {NAV_ICONS.info(sz)}
      </button>
      {open && <RatingInfoModal t={t} onClose={function () { setOpen(false); }}/>}
    </>
  );
}
