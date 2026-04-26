// src/features/notifications/components/PushSettingsCard.jsx
//
// Phone-alerts settings card. Lives inside SettingsScreen. Owns the
// Enable/Disable button, the iOS install nudge, the permission-denied
// state, the unsupported state, and the per-category preference
// toggles.
//
// State machine (resolved client-side from device caps + Notification
// permission + current PushSubscription):
//
//   ┌──────────────┐   user installs PWA on iOS 16.4+ then re-opens
//   │ ios-install  │──────────────────────────────────────────┐
//   └──────────────┘                                          │
//                                                             ▼
//   ┌──────────────┐  enablePush()         ┌──────────────────┐
//   │ idle         │ ─────────────────────▶│ enabled          │
//   │ (default)    │                       └──────────────────┘
//   └──────────────┘                              │ disablePush()
//          │                                      ▼
//          │ permission denied             ┌──────────────────┐
//          ▼                               │ idle             │
//   ┌──────────────┐                       └──────────────────┘
//   │ denied       │
//   └──────────────┘
//
// Editorial vocabulary matches the rest of the redesigned app —
// 0.16em ALL-CAPS eyebrows, hairline strips, 800-weight uppercase
// action buttons.

import { useEffect, useMemo, useState } from "react";
import {
  isIOS,
  isStandalonePWA,
  isSupportedIOSForWebPush,
  supportsPush,
  couldSupportPush,
} from "../../../lib/deviceCaps.js";
import {
  getPermission,
  enablePush,
  disablePush,
  getCurrentSubscription,
} from "../../../lib/pushClient.js";
import {
  fetchMyPushPrefs,
  saveMyPushPrefs,
  sendSelfTestPush,
} from "../services/pushService.js";

var CATEGORIES = [
  { key: "result_reviews",    label: "Result reviews",     hint: "Disputes, counter-proposals, confirmations needed" },
  { key: "match_invites",     label: "Match invites",      hint: "New challenges + opponent invites" },
  { key: "match_updates",     label: "Match updates",      hint: "Confirmed, voided, expired, deleted" },
  { key: "league_updates",    label: "League updates",     hint: "Invites + standings movement" },
  { key: "tournament_updates",label: "Tournament updates", hint: "Match scheduled, deadline approaching" },
  { key: "ranking_changes",   label: "Ranking changes",    hint: "When a confirmed result moves your CourtSync Rating" },
  { key: "system_updates",    label: "System updates",     hint: "Friend requests, account events" },
];

function eyebrowStyle(t, color) {
  return {
    fontSize: 9, fontWeight: 800, letterSpacing: "0.16em",
    textTransform: "uppercase", color: color || t.textTertiary,
  };
}

function HairlineStrip({ t, eyebrow, eyebrowColor, children, marginBottom }) {
  return (
    <div style={{
      borderTop: "1px solid " + t.border,
      paddingTop: 12, paddingBottom: 12,
      marginBottom: marginBottom == null ? 14 : marginBottom,
    }}>
      <div style={Object.assign({}, eyebrowStyle(t, eyebrowColor), { marginBottom: 6 })}>
        {eyebrow}
      </div>
      {children}
    </div>
  );
}

export default function PushSettingsCard({ t, authUser }) {
  // ── derived device + permission state ──────────────────────────────
  var [permission, setPermission] = useState(getPermission());
  var [hasSub, setHasSub]         = useState(false);
  var [busy, setBusy]             = useState(false);
  var [error, setError]           = useState("");
  var [info, setInfo]             = useState("");
  var [prefs, setPrefs]           = useState(null);
  var [prefsLoading, setPrefsLoading] = useState(true);

  var canPush       = useMemo(function () { return supportsPush(); }, []);
  var couldPush     = useMemo(function () { return couldSupportPush(); }, []);
  var iosTab        = isIOS() && !isStandalonePWA();
  var iosUnsupported = isIOS() && !isSupportedIOSForWebPush();

  useEffect(function () {
    var alive = true;
    getCurrentSubscription().then(function (sub) {
      if (!alive) return;
      setHasSub(!!sub);
    });
    return function () { alive = false; };
  }, []);

  useEffect(function () {
    if (!authUser) { setPrefs(null); setPrefsLoading(false); return; }
    var alive = true;
    setPrefsLoading(true);
    fetchMyPushPrefs(authUser.id).then(function (r) {
      if (!alive) return;
      if (r.error) { setError(r.error.message || "Couldn't load preferences."); setPrefsLoading(false); return; }
      setPrefs(r.data || null);
      setPrefsLoading(false);
    });
    return function () { alive = false; };
  }, [authUser && authUser.id]);

  function refreshPermission() { setPermission(getPermission()); }

  async function handleEnable() {
    if (!authUser) return;
    setBusy(true); setError(""); setInfo("");
    var r = await enablePush(authUser.id);
    setBusy(false);
    refreshPermission();
    if (r.error) {
      setError(r.message || "Couldn't enable notifications.");
      // permission_denied is sticky — surface it via the state path
      if (r.error === "permission_denied") setPermission("denied");
      return;
    }
    setHasSub(true);
    setInfo("Phone alerts are enabled on this device.");
  }

  async function handleDisable() {
    setBusy(true); setError(""); setInfo("");
    var r = await disablePush();
    setBusy(false);
    refreshPermission();
    if (r.error) { setError(r.message || "Couldn't disable notifications."); return; }
    setHasSub(false);
    setInfo("Phone alerts are off on this device.");
  }

  async function handleToggle(category, next) {
    if (!authUser) return;
    var optimistic = Object.assign({}, prefs, {});
    optimistic[category] = next;
    setPrefs(optimistic);
    var r = await saveMyPushPrefs(authUser.id, optimisticOnly(optimistic));
    if (r.error) {
      setError(r.error.message || "Couldn't save preference.");
      // revert
      var revert = Object.assign({}, optimistic, {});
      revert[category] = !next;
      setPrefs(revert);
    }
  }

  async function handleTestPush() {
    setBusy(true); setError(""); setInfo("");
    var r = await sendSelfTestPush();
    setBusy(false);
    if (r.error) {
      setError((r.error.message || String(r.error)) + " — make sure VAPID + the send-push function are deployed.");
      return;
    }
    setInfo("Test push sent. Check your notifications.");
  }

  // Status string + colour for the eyebrow
  var statusEyebrow = "Off on this device";
  var statusColor   = t.textTertiary;
  if (iosUnsupported)            { statusEyebrow = "Unsupported"; statusColor = t.textTertiary; }
  else if (iosTab)               { statusEyebrow = "Add to Home Screen first"; statusColor = t.orange; }
  else if (!couldPush)           { statusEyebrow = "Unsupported"; statusColor = t.textTertiary; }
  else if (permission === "denied") { statusEyebrow = "Blocked"; statusColor = t.red; }
  else if (hasSub && permission === "granted") { statusEyebrow = "Enabled on this device"; statusColor = t.green; }

  return (
    <div style={{
      background: t.bgCard,
      border: "1px solid " + t.border,
      borderRadius: 12,
      padding: 20,
      marginBottom: 12,
    }}>
      {/* Header */}
      <div style={{ marginBottom: 14 }}>
        <div style={Object.assign({}, eyebrowStyle(t, statusColor), { marginBottom: 6 })}>
          {statusEyebrow}
        </div>
        <div style={{
          fontSize: 18, fontWeight: 800, color: t.text,
          letterSpacing: "-0.4px", lineHeight: 1.1, marginBottom: 4,
        }}>
          Phone alerts
        </div>
        <div style={{
          fontSize: 13, color: t.textSecondary,
          letterSpacing: "-0.1px", lineHeight: 1.5,
        }}>
          Get important match, review, league, ranking, and booking updates on this device.
        </div>
      </div>

      {/* State-specific guidance / action */}
      {iosUnsupported && (
        <HairlineStrip t={t} eyebrow="iOS too old" eyebrowColor={t.textTertiary}>
          <div style={{ fontSize: 13, color: t.text, lineHeight: 1.5, letterSpacing: "-0.1px" }}>
            Phone alerts on iPhone require iOS 16.4 or later and the Home Screen version of CourtSync.
          </div>
        </HairlineStrip>
      )}

      {iosTab && !iosUnsupported && (
        <HairlineStrip t={t} eyebrow="iPhone setup" eyebrowColor={t.orange}>
          <div style={{ fontSize: 13, color: t.text, lineHeight: 1.55, letterSpacing: "-0.1px" }}>
            To receive alerts on iPhone, add CourtSync to your Home Screen first.
            <br />
            <span style={{ color: t.textSecondary }}>
              Tap <strong>Share</strong> → <strong>Add to Home Screen</strong>, then open CourtSync from the new icon.
            </span>
          </div>
        </HairlineStrip>
      )}

      {!iosTab && !couldPush && !iosUnsupported && (
        <HairlineStrip t={t} eyebrow="Unsupported" eyebrowColor={t.textTertiary}>
          <div style={{ fontSize: 13, color: t.text, lineHeight: 1.5, letterSpacing: "-0.1px" }}>
            This browser doesn't support web push notifications. Try Chrome / Edge on Android or desktop.
          </div>
        </HairlineStrip>
      )}

      {permission === "denied" && (
        <HairlineStrip t={t} eyebrow="Blocked" eyebrowColor={t.red}>
          <div style={{ fontSize: 13, color: t.text, lineHeight: 1.5, letterSpacing: "-0.1px" }}>
            Notifications are blocked for this device. Re-enable them in your browser or iPhone app settings, then tap "Enable" again here.
          </div>
        </HairlineStrip>
      )}

      {/* Primary action — only when device CAN actually subscribe right
          now. iOS Safari tabs see the install nudge above and no button. */}
      {canPush && permission !== "denied" && (
        <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
          {!hasSub && (
            <button
              type="button"
              disabled={busy || !authUser}
              onClick={handleEnable}
              style={primaryBtnStyle(t, busy || !authUser)}>
              {busy ? "Working…" : "Enable phone alerts"}
            </button>
          )}
          {hasSub && (
            <>
              <button
                type="button"
                disabled={busy}
                onClick={handleDisable}
                style={secondaryBtnStyle(t, busy)}>
                {busy ? "Working…" : "Turn off"}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={handleTestPush}
                style={Object.assign({}, secondaryBtnStyle(t, busy), { borderColor: t.accent, color: t.accent })}>
                Send test
              </button>
            </>
          )}
        </div>
      )}

      {/* Status messages */}
      {info && (
        <HairlineStrip t={t} eyebrow="Status" eyebrowColor={t.green} marginBottom={14}>
          <div style={{ fontSize: 12, color: t.text, lineHeight: 1.4, letterSpacing: "-0.1px" }}>
            {info}
          </div>
        </HairlineStrip>
      )}
      {error && (
        <HairlineStrip t={t} eyebrow="Error" eyebrowColor={t.red} marginBottom={14}>
          <div style={{ fontSize: 12, color: t.text, lineHeight: 1.4, letterSpacing: "-0.1px" }}>
            {error}
          </div>
        </HairlineStrip>
      )}

      {/* Per-category preferences — only when push is at least
          potentially supported. Hidden on locked-out states because
          the toggles wouldn't change anything. */}
      {couldPush && !iosUnsupported && authUser && (
        <div style={{ marginTop: 8 }}>
          <div style={Object.assign({}, eyebrowStyle(t), { marginBottom: 10 })}>
            What to alert me about
          </div>
          {prefsLoading && (
            <div style={{ fontSize: 12, color: t.textTertiary }}>Loading preferences…</div>
          )}
          {!prefsLoading && (
            <div style={{ borderTop: "1px solid " + t.border }}>
              {CATEGORIES.map(function (c) {
                var on = prefs ? !!prefs[c.key] : true;
                return (
                  <CategoryRow
                    key={c.key}
                    t={t}
                    label={c.label}
                    hint={c.hint}
                    enabled={on}
                    onChange={function (next) { handleToggle(c.key, next); }}
                  />
                );
              })}
            </div>
          )}
          <div style={{
            marginTop: 10, fontSize: 11, color: t.textTertiary, lineHeight: 1.5,
            letterSpacing: "-0.1px",
          }}>
            Alerts are enabled per device. You can turn them on separately for each phone or browser you use.
          </div>
        </div>
      )}
    </div>
  );
}

// Per-category row — flat hairline-bottom rows + a small toggle.
function CategoryRow({ t, label, hint, enabled, onChange }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 12,
      paddingTop: 10, paddingBottom: 10,
      borderBottom: "1px solid " + t.border,
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: t.text, letterSpacing: "-0.1px" }}>
          {label}
        </div>
        {hint && (
          <div style={{ fontSize: 11, color: t.textTertiary, marginTop: 2, letterSpacing: "-0.1px" }}>
            {hint}
          </div>
        )}
      </div>
      <button
        type="button"
        onClick={function () { onChange(!enabled); }}
        aria-pressed={!!enabled}
        style={{
          flexShrink: 0,
          width: 42, height: 24, borderRadius: 12,
          border: "1px solid " + (enabled ? t.accent : t.border),
          background: enabled ? t.accent : "transparent",
          position: "relative", cursor: "pointer",
          transition: "background 0.15s, border-color 0.15s",
        }}>
        <span style={{
          position: "absolute",
          top: 2, left: enabled ? 20 : 2,
          width: 18, height: 18, borderRadius: "50%",
          background: enabled ? "#fff" : t.textSecondary,
          transition: "left 0.15s, background 0.15s",
        }}/>
      </button>
    </div>
  );
}

function primaryBtnStyle(t, disabled) {
  return {
    flex: 1, padding: "13px",
    borderRadius: 10, border: "none",
    background: disabled ? t.border : t.accent, color: "#fff",
    fontSize: 11, fontWeight: 800,
    letterSpacing: "0.12em", textTransform: "uppercase",
    cursor: disabled ? "not-allowed" : "pointer",
  };
}
function secondaryBtnStyle(t, disabled) {
  return {
    flex: 1, padding: "13px",
    borderRadius: 10, border: "1px solid " + t.border, background: "transparent",
    color: t.text,
    fontSize: 11, fontWeight: 800,
    letterSpacing: "0.12em", textTransform: "uppercase",
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.6 : 1,
  };
}

// Strip the synthetic / read-only fields from get_notification_prefs's
// payload before we upsert it back. updated_at would otherwise be
// included in the INSERT and overridden by the touch_updated_at
// trigger anyway.
function optimisticOnly(p) {
  return {
    match_invites:      p.match_invites,
    match_updates:      p.match_updates,
    result_reviews:     p.result_reviews,
    league_updates:     p.league_updates,
    tournament_updates: p.tournament_updates,
    ranking_changes:    p.ranking_changes,
    court_bookings:     p.court_bookings,
    system_updates:     p.system_updates,
  };
}
