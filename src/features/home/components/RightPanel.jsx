// src/features/home/components/RightPanel.jsx
// Right sidebar panel — shown only on ≥1440px desktop via CSS (.cs-right-col).
// Sections: Leaderboard preview · Pending matches · Quick actions.

import { useState, useEffect } from "react";
import { supabase } from "../../../lib/supabase.js";
import { avColor } from "../../../lib/utils/avatar.js";

// ── Section wrapper ────────────────────────────────────────────────────────────
function Section({ t, title, children }) {
  return (
    <div style={{ padding: "24px 20px", borderBottom: "1px solid " + t.border }}>
      <div style={{
        fontSize: 10, fontWeight: 700, color: t.textTertiary,
        textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 14,
      }}>{title}</div>
      {children}
    </div>
  );
}

// ── Leaderboard ────────────────────────────────────────────────────────────────
function Leaderboard({ t, openProfile }) {
  var [players, setPlayers] = useState([]);
  var [loading, setLoading] = useState(true);

  useEffect(function() {
    supabase
      .from("profiles")
      .select("id,name,avatar,ranking_points,wins,losses")
      .not("name", "is", null)
      .gt("matches_played", 0)
      .order("ranking_points", { ascending: false })
      .limit(5)
      .then(function(res) {
        if (res.data) setPlayers(res.data);
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {[1,2,3,4,5].map(function(i) {
          return (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div className="cs-skeleton" style={{ width: 18, height: 14 }}/>
              <div className="cs-skeleton" style={{ width: 28, height: 28, borderRadius: "50%" }}/>
              <div style={{ flex: 1 }}>
                <div className="cs-skeleton" style={{ width: "60%", height: 12, marginBottom: 4 }}/>
                <div className="cs-skeleton" style={{ width: "40%", height: 10 }}/>
              </div>
              <div className="cs-skeleton" style={{ width: 36, height: 12 }}/>
            </div>
          );
        })}
      </div>
    );
  }

  if (!players.length) {
    return <div style={{ fontSize: 12, color: t.textTertiary }}>No ranked players yet.</div>;
  }

  var medals = ["🥇", "🥈", "🥉"];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      {players.map(function(p, i) {
        var clickable = !!openProfile;
        return (
          <div key={p.id}
            onClick={clickable ? function() { openProfile(p.id); } : undefined}
            onMouseEnter={clickable ? function(e) { e.currentTarget.style.background = t.bgTertiary; } : undefined}
            onMouseLeave={clickable ? function(e) { e.currentTarget.style.background = "transparent"; } : undefined}
            style={{
              display: "flex", alignItems: "center", gap: 10,
              padding: "6px 8px", borderRadius: 8,
              transition: "background 0.13s",
              cursor: clickable ? "pointer" : "default",
            }}>
            <span style={{
              width: 20, fontSize: i < 3 ? 14 : 11,
              fontWeight: 700, color: t.textTertiary,
              textAlign: "center", flexShrink: 0,
            }}>
              {i < 3 ? medals[i] : i + 1}
            </span>
            <div style={{
              width: 28, height: 28, borderRadius: "50%",
              background: avColor(p.name),
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 10, fontWeight: 700, color: "#fff", flexShrink: 0,
            }}>
              {p.avatar || (p.name || "?").slice(0, 2).toUpperCase()}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                fontSize: 13, fontWeight: 600, color: t.text,
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              }}>{p.name}</div>
              <div style={{ fontSize: 10, color: t.textTertiary }}>
                {p.wins || 0}W · {p.losses || 0}L
              </div>
            </div>
            <div style={{
              fontSize: 12, fontWeight: 700,
              color: i === 0 ? t.gold : t.textSecondary,
              flexShrink: 0,
            }}>
              {p.ranking_points || 0}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Pending actions ────────────────────────────────────────────────────────────
function PendingActions({ t, authUser, history }) {
  var pending = (history || []).filter(function(m) {
    if (m.status === "pending_confirmation" && m.isTagged) return true;
    if ((m.status === "disputed" || m.status === "pending_reconfirmation") && authUser && m.pendingActionBy === authUser.id) return true;
    return false;
  }).slice(0, 3);

  if (!pending.length) {
    return (
      <div style={{
        padding: "12px 14px", borderRadius: 8,
        background: t.bgTertiary,
        fontSize: 12, color: t.textTertiary, textAlign: "center",
      }}>
        No pending actions 🎾
      </div>
    );
  }

  var statusLabel = {
    pending_confirmation: { label: "Confirm?", color: t.orange },
    disputed: { label: "Respond", color: t.red },
    pending_reconfirmation: { label: "Review", color: t.orange },
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {pending.map(function(m) {
        var s = statusLabel[m.status] || { label: "View", color: t.accent };
        return (
          <div key={m.id} style={{
            display: "flex", alignItems: "center", gap: 10,
            padding: "10px 12px", borderRadius: 8,
            border: "1px solid " + t.border,
            background: t.bgCard,
          }}>
            <div style={{
              width: 32, height: 32, borderRadius: 8,
              background: avColor(m.oppName),
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 11, fontWeight: 700, color: "#fff", flexShrink: 0,
            }}>
              {(m.oppName || "?").slice(0, 2).toUpperCase()}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                fontSize: 12, fontWeight: 600, color: t.text,
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              }}>vs {m.oppName}</div>
              <div style={{ fontSize: 10, color: t.textTertiary }}>{m.date}</div>
            </div>
            <span style={{
              fontSize: 10, fontWeight: 700, color: s.color,
              background: s.color + "18",
              padding: "3px 8px", borderRadius: 20,
              letterSpacing: "0.04em", flexShrink: 0,
              textTransform: "uppercase",
            }}>{s.label}</span>
          </div>
        );
      })}
    </div>
  );
}

// ── Main export ────────────────────────────────────────────────────────────────
export default function RightPanel({ t, authUser, history, onLogMatch, openProfile }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: t.bgCard }}>

      {/* Quick actions */}
      <Section t={t} title="Quick actions">
        <button
          onClick={onLogMatch}
          style={{
            width: "100%", padding: "11px 16px",
            borderRadius: 8, border: "none",
            background: t.accent, color: "#fff",
            fontSize: 13, fontWeight: 700,
            letterSpacing: "-0.1px",
            transition: "opacity 0.15s",
          }}
          onMouseEnter={function(e) { e.currentTarget.style.opacity = "0.88"; }}
          onMouseLeave={function(e) { e.currentTarget.style.opacity = "1"; }}
        >
          + Log match
        </button>
      </Section>

      {/* Pending matches needing action */}
      {authUser && (
        <Section t={t} title="Needs your action">
          <PendingActions t={t} authUser={authUser} history={history} />
        </Section>
      )}

      {/* Leaderboard */}
      <Section t={t} title="Leaderboard">
        <Leaderboard t={t} openProfile={openProfile} />
      </Section>

    </div>
  );
}
