// src/app/Sidebar.jsx
// Desktop-only left navigation sidebar. Hidden on mobile via CSS (.cs-sidebar-col).
// Shown at 64px (icons only) on 1024–1199px, 220px (icons + labels) on ≥1200px.

import { avColor } from "../lib/utils/avatar.js";
import { NAV_ICONS } from "../lib/constants/navIcons.jsx";

// Label overrides — the TABS constant is the canonical nav order/ids/labels;
// Sidebar can override the label text where it wants (e.g. "Feed" over the
// generic label) without diverging from that order.
var NAV_ITEMS = [
  { id: "home",        label: "Feed",     icon: NAV_ICONS.home },
  { id: "map",         label: "Map",      icon: NAV_ICONS.map },
  { id: "tournaments", label: "Compete",  icon: NAV_ICONS.tournaments },
  { id: "people",      label: "People",   icon: NAV_ICONS.people },
  { id: "profile",     label: "Profile",  icon: NAV_ICONS.profile },
  { id: "admin",       label: "Admin",    icon: NAV_ICONS.admin },
];

export default function Sidebar({
  t, tab, setTab,
  profile, authUser,
  unreadCount,
  dmUnreadCount,         // count of unread DMs + pending message-requests
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

      {/* Notifications — promoted to the top of the sidebar, directly
          beneath the CourtSync title. Sits in its own segmented block
          (its own borderBottom) so it reads as header chrome, not part of
          the primary nav list below it. */}
      {authUser && (
        <div style={{
          padding: "8px 10px",
          borderBottom: "1px solid " + t.border,
          flexShrink: 0,
        }}>
          <button
            className="cs-nav-item"
            onClick={function() {
              setShowNotifications(function(v) { return !v; });
              if (!showNotifications && markSeen) markSeen();
            }}
            style={{ color: unreadCount > 0 ? t.accent : t.textSecondary, position: "relative" }}
          >
            <span style={{ flexShrink: 0, display: "flex", position: "relative" }}>
              {NAV_ICONS.notifications(17)}
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
        </div>
      )}

      {/* Primary nav — Admin is only visible to users whose
          profiles.is_admin = true. The real boundary is RLS on
          tournaments/audit_log etc, but we hide the nav entry for a
          cleaner UX (matches Instagram/Discord pattern). */}
      <div style={{ flex: 1, padding: "10px 10px", display: "flex", flexDirection: "column", gap: 2, overflowY: "auto" }}>
        {NAV_ITEMS.filter(function(nav){
          return nav.id !== "admin" || (profile && profile.is_admin);
        }).map(function(nav) {
          var active = tab === nav.id;
          // Instagram-style red dot on the People nav when we have
          // unread DMs or pending DM requests. Cleared when the user
          // opens Messages and the realtime read-receipt fires.
          var showDmBadge = nav.id === "people" && (dmUnreadCount || 0) > 0;
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
              <span style={{ color: active ? t.accent : t.textSecondary, flexShrink: 0, display: "flex", position: "relative" }}>
                {nav.icon()}
                {showDmBadge && (
                  <span style={{
                    position: "absolute", top: -4, right: -6,
                    minWidth: 14, height: 14, borderRadius: 7,
                    background: t.red || "#ef4444", color: "#fff",
                    fontSize: 9, fontWeight: 800,
                    padding: "0 4px", lineHeight: "14px", textAlign: "center",
                  }}>{dmUnreadCount > 9 ? "9+" : dmUnreadCount}</span>
                )}
              </span>
              <span className="cs-nav-label" style={{ color: active ? t.accent : t.text, fontWeight: active ? 600 : 400 }}>
                {nav.label}
              </span>
            </button>
          );
        })}
      </div>

      {/* Bottom controls — user avatar / login only. Notifications moved
          up under the logo so they read as header chrome, not nav. */}
      <div style={{
        padding: "10px 10px",
        borderTop: "1px solid " + t.border,
        display: "flex", flexDirection: "column", gap: 2,
        flexShrink: 0,
      }}>
        {/* User avatar / login */}
        {authUser ? (
          <button
            className="cs-nav-item"
            onClick={onOpenSettings}
            style={{ color: t.textSecondary }}
          >
            {profile.avatar_url
              ? <img src={profile.avatar_url} alt="" style={{ width:28,height:28,borderRadius:"50%",objectFit:"cover",flexShrink:0,background:"#eee" }}/>
              : <div style={{
                  width: 28, height: 28, borderRadius: "50%",
                  background: avColor(profile.name),
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 10, fontWeight: 700, color: "#fff", flexShrink: 0,
                }}>{profile.avatar}</div>}
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
