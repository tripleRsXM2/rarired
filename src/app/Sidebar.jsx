// src/app/Sidebar.jsx
// Desktop-only left navigation sidebar. Hidden on mobile via CSS (.cs-sidebar-col).
// Shown at 64px (icons only) on 1024–1199px, 220px (icons + labels) on ≥1200px.

import { avColor } from "../lib/utils/avatar.js";

var NAV_ITEMS = [
  {
    id: "home", label: "Feed",
    icon: function(){
      return (
        <svg width="17" height="17" viewBox="0 0 18 18" fill="none">
          <rect x="2" y="10" width="3.5" height="6" rx="1" fill="currentColor"/>
          <rect x="7.25" y="6" width="3.5" height="10" rx="1" fill="currentColor"/>
          <rect x="12.5" y="2" width="3.5" height="14" rx="1" fill="currentColor"/>
        </svg>
      );
    }
  },
  {
    id: "tournaments", label: "Compete",
    icon: function(){
      return (
        <svg width="17" height="17" viewBox="0 0 18 18" fill="none">
          <path d="M4 2h10v5a5 5 0 0 1-10 0V2z" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinejoin="round"/>
          <path d="M9 12v3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          <path d="M6 15h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          <path d="M4 4H2a3 3 0 0 0 2 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          <path d="M14 4h2a3 3 0 0 1-2 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
      );
    }
  },
  {
    id: "people", label: "People",
    icon: function(){
      return (
        <svg width="17" height="17" viewBox="0 0 18 18" fill="none">
          <circle cx="6.5" cy="5.5" r="2.5" stroke="currentColor" strokeWidth="1.5"/>
          <path d="M1.5 15c0-2.485 2.239-4.5 5-4.5s5 2.015 5 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          <circle cx="13" cy="5.5" r="2" stroke="currentColor" strokeWidth="1.5"/>
          <path d="M13 11c2 0 3.5 1.2 3.5 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
      );
    }
  },
  {
    id: "profile", label: "Profile",
    icon: function(){
      return (
        <svg width="17" height="17" viewBox="0 0 18 18" fill="none">
          <circle cx="9" cy="6" r="3" stroke="currentColor" strokeWidth="1.5"/>
          <path d="M3 15c0-3.314 2.686-5 6-5s6 1.686 6 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
      );
    }
  },
  {
    id: "admin", label: "Admin",
    icon: function(){
      return (
        <svg width="17" height="17" viewBox="0 0 18 18" fill="none">
          <circle cx="9" cy="9" r="2.5" stroke="currentColor" strokeWidth="1.5"/>
          <path d="M9 2v1.5M9 14.5V16M2 9h1.5M14.5 9H16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          <path d="M4.222 4.222l1.06 1.06M12.718 12.718l1.06 1.06M4.222 13.778l1.06-1.06M12.718 5.282l1.06-1.06" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
      );
    }
  },
];

export default function Sidebar({
  t, tab, setTab,
  profile, authUser,
  unreadCount,
  showNotifications, setShowNotifications, markSeen,
  onOpenSettings, openLogin,
}) {

  function handleNav(id) {
    if (id === "people") setTab("people");
    else setTab(id);
  }

  return (
    <div style={{
      display: "flex", flexDirection: "column",
      height: "100vh", width: "100%",
    }}>

      {/* Logo */}
      <div style={{
        padding: "18px 16px",
        display: "flex", alignItems: "center", gap: 10,
        borderBottom: "1px solid " + t.border,
        flexShrink: 0, minHeight: 60,
      }}>
        <div style={{
          width: 28, height: 28, borderRadius: 6,
          background: t.accent, display: "flex",
          alignItems: "center", justifyContent: "center",
          fontSize: 11, fontWeight: 800, color: "#fff",
          flexShrink: 0, letterSpacing: "-0.5px",
        }}>CS</div>
        <span className="cs-nav-label" style={{
          fontSize: 15, fontWeight: 700,
          letterSpacing: "-0.4px", color: t.text,
        }}>CourtSync</span>
      </div>

      {/* Primary nav */}
      <div style={{ flex: 1, padding: "10px 10px", display: "flex", flexDirection: "column", gap: 2, overflowY: "auto" }}>
        {NAV_ITEMS.map(function(nav) {
          var active = tab === nav.id;
          return (
            <button
              key={nav.id}
              className="cs-nav-item"
              onClick={function() { handleNav(nav.id); }}
              style={{
                color: active ? t.accent : t.textSecondary,
                background: active ? t.accentSubtle : "transparent",
                fontWeight: active ? 600 : 400,
              }}
            >
              <span style={{ color: active ? t.accent : t.textSecondary, flexShrink: 0, display: "flex" }}>
                {nav.icon()}
              </span>
              <span className="cs-nav-label" style={{ color: active ? t.accent : t.text, fontWeight: active ? 600 : 400 }}>
                {nav.label}
              </span>
            </button>
          );
        })}
      </div>

      {/* Bottom controls */}
      <div style={{
        padding: "10px 10px",
        borderTop: "1px solid " + t.border,
        display: "flex", flexDirection: "column", gap: 2,
        flexShrink: 0,
      }}>
        {/* Notifications */}
        {authUser && (
          <button
            className="cs-nav-item"
            onClick={function() {
              setShowNotifications(function(v) { return !v; });
              if (!showNotifications && markSeen) markSeen();
            }}
            style={{ color: unreadCount > 0 ? t.accent : t.textSecondary, position: "relative" }}
          >
            <span style={{ flexShrink: 0, display: "flex", position: "relative" }}>
              <svg width="17" height="17" viewBox="0 0 18 18" fill="none">
                <path d="M9 2a6 6 0 0 1 6 6v3l1.5 2H1.5L3 11V8a6 6 0 0 1 6-6z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
                <path d="M7 15a2 2 0 0 0 4 0" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
              {unreadCount > 0 && (
                <span style={{
                  position: "absolute", top: -4, right: -4,
                  width: 14, height: 14, borderRadius: "50%",
                  background: t.accent, border: "2px solid " + t.bgCard,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 7, fontWeight: 800, color: "#fff",
                }}>
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              )}
            </span>
            <span className="cs-nav-label" style={{ color: unreadCount > 0 ? t.accent : t.textSecondary }}>
              Notifications{unreadCount > 0 ? " · " + unreadCount : ""}
            </span>
          </button>
        )}

        {/* User avatar / login */}
        {authUser ? (
          <button
            className="cs-nav-item"
            onClick={onOpenSettings}
            style={{ color: t.textSecondary }}
          >
            <div style={{
              width: 28, height: 28, borderRadius: "50%",
              background: avColor(profile.name),
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 10, fontWeight: 700, color: "#fff", flexShrink: 0,
            }}>{profile.avatar}</div>
            <span className="cs-nav-label" style={{ color: t.text, fontWeight: 500 }}>
              {profile.name || "You"}
            </span>
          </button>
        ) : (
          <button
            className="cs-nav-item"
            onClick={openLogin}
            style={{ color: t.accent }}
          >
            <span style={{ flexShrink: 0, display: "flex" }}>
              <svg width="17" height="17" viewBox="0 0 18 18" fill="none">
                <path d="M7 3H4a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3M11 5l4 4-4 4M5 9h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </span>
            <span className="cs-nav-label" style={{ fontWeight: 600 }}>Log in</span>
          </button>
        )}
      </div>
    </div>
  );
}
