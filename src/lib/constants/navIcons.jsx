// src/lib/constants/navIcons.jsx
//
// Shared SVG nav icons keyed by tab id. Rendered in the desktop Sidebar
// (with labels) and the mobile bottom tab bar (icons only). Co-locating
// them means Sidebar and the mobile nav can't drift out of sync.

export var NAV_ICONS = {
  // Booking affordance — a calendar with a highlighted slot. Reads as
  // "reserve a time" rather than the previous box-with-arrow which was
  // the generic external-link icon (council vote: calendar over
  // literal book; book read as library/knowledge, not "booking").
  // Line-art per the icon rule.
  external: function(size){
    var s = size || 14;
    return (
      <svg width={s} height={s} viewBox="0 0 18 18" fill="none">
        {/* Calendar body */}
        <rect x="2.25" y="4" width="13.5" height="11.5" rx="1.5"
          stroke="currentColor" strokeWidth="1.5"/>
        {/* Top binding ticks */}
        <line x1="6" y1="2" x2="6" y2="5"
          stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        <line x1="12" y1="2" x2="12" y2="5"
          stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        {/* Header divider */}
        <line x1="2.25" y1="7.25" x2="15.75" y2="7.25"
          stroke="currentColor" strokeWidth="1.5"/>
        {/* Highlighted slot — the "booked" cell */}
        <rect x="9" y="9.5" width="3.5" height="3" rx="0.5"
          fill="currentColor" opacity="0.85"/>
      </svg>
    );
  },
  // Home-court — little house glyph used to flag a player whose
  // `played_courts` includes the currently-selected court.
  homeCourt: function(size){
    var s = size || 12;
    return (
      <svg width={s} height={s} viewBox="0 0 18 18" fill="none">
        <path d="M3 8l6-5 6 5v6a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
        <path d="M7 15v-4h4v4" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
      </svg>
    );
  },
  tindis: function(size){
    // Two-player pact — a handshake-ish glyph. Kept SVG-only per the
    // "no emoji as icons" rule.
    var s = size || 17;
    return (
      <svg width={s} height={s} viewBox="0 0 18 18" fill="none">
        <circle cx="5.5" cy="5" r="2" stroke="currentColor" strokeWidth="1.5"/>
        <circle cx="12.5" cy="5" r="2" stroke="currentColor" strokeWidth="1.5"/>
        <path d="M2 15c0.5-2 2-3.2 3.5-3.2M16 15c-0.5-2-2-3.2-3.5-3.2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        <path d="M6 11.5l2 1.6 2-1.6 2 1.6" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" fill="none"/>
      </svg>
    );
  },
  home: function(size){
    var s = size || 17;
    return (
      <svg width={s} height={s} viewBox="0 0 18 18" fill="none">
        <rect x="2" y="10" width="3.5" height="6" rx="1" fill="currentColor"/>
        <rect x="7.25" y="6" width="3.5" height="10" rx="1" fill="currentColor"/>
        <rect x="12.5" y="2" width="3.5" height="14" rx="1" fill="currentColor"/>
      </svg>
    );
  },
  map: function(size){
    var s = size || 17;
    return (
      <svg width={s} height={s} viewBox="0 0 18 18" fill="none">
        <path d="M2 4.5v10l4-1.5 6 2 4-1.5v-10l-4 1.5-6-2-4 1.5z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
        <path d="M6 3v10M12 5v10" stroke="currentColor" strokeWidth="1.5"/>
      </svg>
    );
  },
  tournaments: function(size){
    var s = size || 17;
    return (
      <svg width={s} height={s} viewBox="0 0 18 18" fill="none">
        <path d="M4 2h10v5a5 5 0 0 1-10 0V2z" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinejoin="round"/>
        <path d="M9 12v3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        <path d="M6 15h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        <path d="M4 4H2a3 3 0 0 0 2 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        <path d="M14 4h2a3 3 0 0 1-2 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      </svg>
    );
  },
  people: function(size){
    var s = size || 17;
    return (
      <svg width={s} height={s} viewBox="0 0 18 18" fill="none">
        <circle cx="6.5" cy="5.5" r="2.5" stroke="currentColor" strokeWidth="1.5"/>
        <path d="M1.5 15c0-2.485 2.239-4.5 5-4.5s5 2.015 5 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        <circle cx="13" cy="5.5" r="2" stroke="currentColor" strokeWidth="1.5"/>
        <path d="M13 11c2 0 3.5 1.2 3.5 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      </svg>
    );
  },
  profile: function(size){
    var s = size || 17;
    return (
      <svg width={s} height={s} viewBox="0 0 18 18" fill="none">
        <circle cx="9" cy="6" r="3" stroke="currentColor" strokeWidth="1.5"/>
        <path d="M3 15c0-3.314 2.686-5 6-5s6 1.686 6 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      </svg>
    );
  },
  admin: function(size){
    var s = size || 17;
    return (
      <svg width={s} height={s} viewBox="0 0 18 18" fill="none">
        <circle cx="9" cy="9" r="2.5" stroke="currentColor" strokeWidth="1.5"/>
        <path d="M9 2v1.5M9 14.5V16M2 9h1.5M14.5 9H16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        <path d="M4.222 4.222l1.06 1.06M12.718 12.718l1.06 1.06M4.222 13.778l1.06-1.06M12.718 5.282l1.06-1.06" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      </svg>
    );
  },
  // Not a tab — header chrome. Used by both the desktop sidebar's
  // notifications button and the mobile top-bar notification button.
  // Callers own their own badge overlay positioning.
  notifications: function(size){
    var s = size || 17;
    return (
      <svg width={s} height={s} viewBox="0 0 18 18" fill="none">
        <path d="M9 2a6 6 0 0 1 6 6v3l1.5 2H1.5L3 11V8a6 6 0 0 1 6-6z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
        <path d="M7 15a2 2 0 0 0 4 0" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      </svg>
    );
  },
  // Pencil / edit glyph — used on the profile hero edit button + anywhere
  // "edit this thing" is needed.
  edit: function(size){
    var s = size || 15;
    return (
      <svg width={s} height={s} viewBox="0 0 18 18" fill="none">
        <path d="M2 14l1-4L12 1l4 4-9 9-4 1z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
        <path d="M10 3l4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      </svg>
    );
  },
  // Checkmark — used for "Confirm" affordances (match confirmation, accept
  // friend request, etc). Replaces the emoji ✓ per the no-emoji-as-icons rule.
  check: function(size){
    var s = size || 15;
    return (
      <svg width={s} height={s} viewBox="0 0 18 18" fill="none">
        <path d="M3.5 9.5l3.5 3.5 7.5-8" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    );
  },
  // X / close glyph — used for "Decline" / "Dispute" / dismiss affordances.
  x: function(size){
    var s = size || 15;
    return (
      <svg width={s} height={s} viewBox="0 0 18 18" fill="none">
        <path d="M4 4l10 10M14 4L4 14" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"/>
      </svg>
    );
  },
  // Loop / rematch arrow — used in feed card + any future "repeat this
  // match" affordance. Kept here so it's available outside the feed too.
  rematch: function(size){
    var s = size || 17;
    return (
      <svg width={s} height={s} viewBox="0 0 18 18" fill="none">
        <path d="M3 9a6 6 0 0 1 10.5-3.95L15 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M15 3.5V7h-3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M15 9a6 6 0 0 1-10.5 3.95L3 14.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M3 14.5V11h3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    );
  },
};
