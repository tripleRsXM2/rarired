// HistoryScreen.jsx — Match-history list for the v2 BaselineApp.
// Faithful port of the design's `HistoryScreen` in
// `screens-mobile-2.jsx`. Reads from the SAMPLE_HISTORY seed.

import React from "react";
import { CourtMini, Eyebrow } from "./atoms.jsx";
import { COURTS } from "../utils/tokens.js";
import PullToRefresh from "../../../../components/ui/PullToRefresh.jsx";

export default function HistoryScreen({ theme, accent, matches, onOpenProfile, onRefresh }) {
  // Filter chip — All / Wins / Losses. Singles + Doubles dropped for
  // now (no singles/doubles flag on match_history yet). Wins/Losses
  // count only SETTLED matches: a pending / disputed row has no final
  // result, so it's excluded from both filtered views.
  const [filter, setFilter] = React.useState("All");
  const FILTERS = ["All", "Wins", "Losses"];

  const all = matches || [];
  const visible = all.filter(function (m) {
    if (filter === "Wins")   return m.win  && !m.pending;
    if (filter === "Losses") return !m.win && !m.pending;
    return true; // "All"
  });

  return (
    <div style={{ height: "100%", background: theme.bg, color: theme.ink, display: "flex", flexDirection: "column" }}>
      <div style={{ padding: "22px 20px 8px" }}>
        <Eyebrow color={theme.inkSoft}>This season</Eyebrow>
        <h1 className="t-serif" style={{ fontSize: 38, lineHeight: 1.05, margin: "6px 0 0", letterSpacing: "-0.015em" }}>
          <em>14</em> matches
        </h1>
        <div style={{ display: "flex", gap: 14, marginTop: 14 }}>
          <Stat label="W–L"       v="9–5"  theme={theme} />
          <Stat label="Win %"     v="64%"  theme={theme} />
          <Stat label="Avg. time" v="1:24" theme={theme} />
        </div>
      </div>

      <div style={{ padding: "14px 20px 6px", display: "flex", gap: 6, overflowX: "auto" }} className="t-noscroll">
        {FILTERS.map((f) => (
          <Chip
            key={f}
            active={filter === f}
            onClick={() => setFilter(f)}
            theme={theme}
          >{f}</Chip>
        ))}
      </div>

      <PullToRefresh
        className="t-noscroll"
        tint={theme.inkSoft}
        onRefresh={onRefresh}
        style={{ flex: 1, padding: "6px 20px 24px" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {visible.length === 0 ? (
            <div style={{
              padding: "28px 14px", textAlign: "center",
              color: theme.inkSoft, fontFamily: "Inter", fontSize: 13,
            }}>
              {filter === "Wins"   ? "No wins logged yet."
                : filter === "Losses" ? "No losses logged yet."
                : "No matches yet."}
            </div>
          ) : (
            visible.map((m, i) => (
              <HistoryRow key={m.id || i} {...m} theme={theme} accent={accent} onOpenProfile={onOpenProfile} />
            ))
          )}
        </div>
      </PullToRefresh>
    </div>
  );
}

function Stat({ label, v, theme }) {
  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      <span className="t-num" style={{ fontSize: 20, fontWeight: 600, letterSpacing: "-0.02em" }}>{v}</span>
      <span className="t-cap" style={{ color: theme.inkSoft }}>{label}</span>
    </div>
  );
}

function Chip({ children, active, onClick, theme }) {
  return (
    <button onClick={onClick} className="t-btn" style={{
      appearance: "none", border: `1px solid ${active ? theme.ink : theme.line}`,
      borderRadius: 999, padding: "6px 12px",
      background: active ? theme.ink : "transparent",
      color: active ? theme.bg : theme.ink,
      fontFamily: "Inter", fontWeight: 500, fontSize: 12,
      whiteSpace: "nowrap", cursor: "pointer",
    }}>{children}</button>
  );
}

function HistoryRow({ date, opp, oppId, score, win, surface, status, pending, theme, accent, onOpenProfile }) {
  const surfaceColor = COURTS[surface]?.surface || "#1a4d2e";
  // The row deep-links to the opponent's profile when we have their
  // linked user id (free-text opponents have none — non-tappable).
  const canOpen = !!onOpenProfile && !!oppId;
  // Pill copy + colors. Pending matches show their real lifecycle
  // status (Pending / Disputed) instead of a final W/L, because the
  // result isn't settled until the opponent acts or the 72h window
  // expires. Source of truth: match_history.status, surfaced by
  // useV2History.shapeRow.
  let pillText = win ? "W" : "L";
  let pillBg   = win ? `${accent}30` : theme.chip;
  let pillFg   = win ? theme.ink : theme.inkSoft;
  if (pending) {
    if (status === "disputed" || status === "pending_reconfirmation") {
      pillText = "DISPUTED";
      pillBg   = theme.chip;
      pillFg   = theme.inkSoft;
    } else {
      pillText = "PENDING";
      pillBg   = theme.chip;
      pillFg   = theme.inkSoft;
    }
  }
  return (
    <div style={{
      display: "grid", gridTemplateColumns: "1fr auto auto", gap: 12, alignItems: "center",
      padding: "12px 14px", background: theme.bgRaised, border: `1px solid ${theme.line}`, borderRadius: 14,
      opacity: pending ? 0.92 : 1,
    }}>
      {/* Opponent identity — court chip + name + date. Tappable when
          we have the opponent's linked id; opens their v2 profile. */}
      <button
        type="button"
        onClick={canOpen ? function () { onOpenProfile(oppId); } : undefined}
        disabled={!canOpen}
        className="t-btn"
        style={{
          appearance: "none", border: 0, background: "transparent", padding: 0,
          margin: 0, textAlign: "left", color: "inherit",
          display: "flex", alignItems: "center", gap: 12, minWidth: 0,
          cursor: canOpen ? "pointer" : "default",
        }}>
        <CourtMini surface={surfaceColor} size={32} />
        <div style={{ minWidth: 0 }}>
          <div style={{
            fontFamily: "Inter", fontWeight: 600, fontSize: 14, color: theme.ink,
            whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
          }}>
            vs <span style={{ borderBottom: canOpen ? `1px solid ${theme.line}` : "none" }}>{opp}</span>
          </div>
          <div style={{ fontSize: 11, color: theme.inkSoft, fontFamily: "Inter" }}>{date}</div>
        </div>
      </button>
      <span className="t-num" style={{ fontSize: 14, color: theme.ink, fontWeight: 500 }}>{score}</span>
      <span style={{
        padding: "3px 8px", borderRadius: 999,
        background: pillBg, color: pillFg,
        fontFamily: "Inter", fontWeight: 700, fontSize: 10, letterSpacing: "0.08em",
        whiteSpace: "nowrap",
      }}>{pillText}</span>
    </div>
  );
}
