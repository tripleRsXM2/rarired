// src/features/settings/components/PrivacyStorageCard.jsx
//
// Module 9.2 — in-app Privacy & Storage disclosure.
//
// CourtSync sets no cookies, ships no third-party scripts, runs no
// marketing pixels. The only browser storage is essential (Supabase
// auth session) + a handful of preferences (theme, map layers, hidden
// DM ids, recent emojis) + tab-scoped flow state (analytics session
// id, post-auth redirect). A generic GDPR-style cookie banner would
// be both inaccurate and product-harmful, so instead we ship this
// disclosure card + a single user-facing toggle (analytics opt-out).
//
// The full storage inventory + threat model lives in
// docs/privacy-and-storage.md. This card mirrors the user-facing
// summary; if the doc changes, update both.
//
// Collapsible by default — surfaces inside SettingsScreen below the
// Profile Privacy section. Tapping the header expands the body.

import { useState } from "react";
import {
  getAnalyticsOptOut,
  setAnalyticsOptOut,
} from "../../../lib/analytics.js";

export default function PrivacyStorageCard({ t }) {
  var [open, setOpen] = useState(false);
  var [optedOut, setOptedOut] = useState(getAnalyticsOptOut());

  function toggleOptOut() {
    var next = !optedOut;
    setAnalyticsOptOut(next);
    setOptedOut(next);
  }

  // Section render helper — keeps the body markup readable.
  function Section({ eyebrow, children }) {
    return (
      <div style={{ paddingTop: 14, paddingBottom: 14, borderTop: "1px solid " + t.border }}>
        <div style={{
          fontSize: 9, fontWeight: 800,
          color: t.textTertiary, letterSpacing: "0.16em",
          textTransform: "uppercase", marginBottom: 6,
        }}>
          {eyebrow}
        </div>
        <div style={{
          fontSize: 12, color: t.textSecondary,
          lineHeight: 1.5, letterSpacing: "-0.05px",
        }}>
          {children}
        </div>
      </div>
    );
  }

  return (
    <div style={{
      background: t.bgCard,
      border: "1px solid " + t.border,
      borderRadius: 12,
      overflow: "hidden",
      marginBottom: 12,
    }}>
      <button type="button"
        onClick={function () { setOpen(function (v) { return !v; }); }}
        style={{
          width: "100%", padding: "14px 16px",
          background: "transparent", border: "none",
          textAlign: "left", cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: t.text, marginBottom: 2 }}>
            Privacy &amp; Storage
          </div>
          <div style={{ fontSize: 11, color: t.textTertiary }}>
            What we store on your device, why, and how to clear it.
          </div>
        </div>
        <span style={{
          fontSize: 12, color: t.textTertiary,
          transform: open ? "rotate(180deg)" : "rotate(0deg)",
          transition: "transform 0.15s",
          marginLeft: 12,
        }}>▾</span>
      </button>

      {open && (
        <div style={{ padding: "0 16px 4px" }}>

          <Section eyebrow="What we store on your device">
            <p style={{ margin: "0 0 8px" }}>
              CourtSync sets <strong>no cookies</strong> and uses no third-party tracking.
              Everything kept on your device falls into one of three buckets:
            </p>
            <ul style={{ margin: "0 0 0 18px", padding: 0 }}>
              <li><strong>Essential</strong> — your sign-in session (Supabase). Without it you'd be logged out on every page reload.</li>
              <li><strong>Preferences</strong> — theme, map layer toggles, recent emojis, hidden DM rows. Survive logout because they're tied to the device, not the account.</li>
              <li><strong>Tab-scoped flow state</strong> — an analytics session id and the page you were on before signing in (used by invite links). Cleared when you close the tab.</li>
            </ul>
          </Section>

          <Section eyebrow="Push notifications">
            <p style={{ margin: 0 }}>
              Push subscriptions are device-specific. Each device you sign in on can be
              enabled or disabled independently from <em>Phone alerts</em> above.
              When you sign out, this device's push subscription is automatically
              disabled so the next person to sign in here doesn't inherit your
              notifications.
            </p>
          </Section>

          <Section eyebrow="Analytics">
            <p style={{ margin: "0 0 10px" }}>
              We track in-app actions (matches logged, feeds opened, friend
              requests sent) so we can fix bugs and prioritise the next thing
              to build. Data lives in our own database, never shared with
              third parties.
            </p>
            <div style={{
              display: "flex", alignItems: "center",
              gap: 12, paddingTop: 6,
            }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: t.text }}>
                  {optedOut ? "Analytics is OFF on this device" : "Analytics is ON"}
                </div>
                <div style={{ fontSize: 11, color: t.textTertiary, marginTop: 2 }}>
                  {optedOut
                    ? "We won't record any usage events from this browser."
                    : "Toggle off to stop sending usage events from this browser."}
                </div>
              </div>
              <button
                type="button"
                onClick={toggleOptOut}
                aria-label={optedOut ? "Turn analytics on" : "Turn analytics off"}
                style={{
                  width: 42, height: 24, borderRadius: 14,
                  border: "none", cursor: "pointer", flexShrink: 0,
                  background: optedOut ? t.border : t.green,
                  position: "relative",
                  transition: "background 0.15s",
                }}>
                <span style={{
                  position: "absolute", top: 2, left: optedOut ? 2 : 20,
                  width: 20, height: 20, borderRadius: "50%", background: "#fff",
                  transition: "left 0.15s", boxShadow: "0 1px 3px rgba(0,0,0,0.25)",
                }}/>
              </button>
            </div>
          </Section>

          <Section eyebrow="How to clear local data">
            <p style={{ margin: 0 }}>
              Sign out from <em>Account</em> below — it clears your session, in-memory
              caches, and disables this device's push subscription. To wipe
              everything (including device preferences), use your browser's
              clear-site-data tool for this domain.
            </p>
          </Section>

          <Section eyebrow="Your choices">
            <p style={{ margin: 0 }}>
              Notification categories: <em>Phone alerts</em> above. Profile
              visibility: <em>Profile Privacy</em> above. Analytics opt-out: the
              toggle in this section. Sign-out fully invalidates this
              device's push subscription.
            </p>
          </Section>

        </div>
      )}
    </div>
  );
}
