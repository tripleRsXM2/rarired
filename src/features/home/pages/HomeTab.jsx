// src/features/home/pages/HomeTab.jsx
import { useState } from "react";
import { supabase } from "../../../lib/supabase.js";
import { avColor } from "../../../lib/utils/avatar.js";
import { track } from "../../../lib/analytics.js";

var REASON_LABELS = {
  wrong_score:   "Score is wrong",
  wrong_winner:  "Winner is wrong",
  wrong_date:    "Date is wrong",
  wrong_venue:   "Venue or court is wrong",
  not_my_match:  "Didn't play this match",
  other:         "Other",
};

// ── Feed icon set (line-art, matches navIcons.jsx style) ────────────────────
// All 18×18, stroke="currentColor", stroke-width 1.5 — so they follow the
// parent button's color state (default = textSecondary, active = accent).
var ICONS = {
  like: function (size) {
    var s = size || 18;
    // Thumb-up outline.
    return (
      <svg width={s} height={s} viewBox="0 0 18 18" fill="none">
        <path d="M6 8.5V15h7.2a1.5 1.5 0 0 0 1.48-1.24l.84-4.76A1.5 1.5 0 0 0 14.04 7.5H10.5V4.5a1.5 1.5 0 0 0-2.94-.43L6 8.5z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
        <path d="M6 8.5v6.5H3.5a1 1 0 0 1-1-1v-5a1 1 0 0 1 1-1H6z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
      </svg>
    );
  },
  likeFilled: function (size) {
    var s = size || 18;
    return (
      <svg width={s} height={s} viewBox="0 0 18 18" fill="none">
        <path d="M6 8.5V15h7.2a1.5 1.5 0 0 0 1.48-1.24l.84-4.76A1.5 1.5 0 0 0 14.04 7.5H10.5V4.5a1.5 1.5 0 0 0-2.94-.43L6 8.5z" fill="currentColor"/>
        <path d="M6 8.5v6.5H3.5a1 1 0 0 1-1-1v-5a1 1 0 0 1 1-1H6z" fill="currentColor"/>
      </svg>
    );
  },
  comment: function (size) {
    var s = size || 18;
    return (
      <svg width={s} height={s} viewBox="0 0 18 18" fill="none">
        <path d="M15.5 9.5c0 3-2.686 5.5-6 5.5a6.9 6.9 0 0 1-2.5-.466L3 15.5l.966-3.5A5.9 5.9 0 0 1 3 9.5c0-3 2.686-5.5 6-5.5s6.5 2.5 6.5 5.5z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
      </svg>
    );
  },
  rematch: function (size) {
    var s = size || 18;
    // Loop / repeat arrow.
    return (
      <svg width={s} height={s} viewBox="0 0 18 18" fill="none">
        <path d="M3 9a6 6 0 0 1 10.5-3.95L15 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M15 3.5V7h-3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M15 9a6 6 0 0 1-10.5 3.95L3 14.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M3 14.5V11h3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    );
  },
  share: function (size) {
    var s = size || 18;
    return (
      <svg width={s} height={s} viewBox="0 0 18 18" fill="none">
        <path d="M7 3h-3a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M9 9l6-6M10 3h5v5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    );
  },
};

// ── IconButton (Strava-style compact footer action, sidebar-style chrome) ───
// Transparent by default, colour follows state. No box-fill — mirrors the
// left sidebar's nav-item idle state. Children are a callable SVG (one of
// ICONS above) so color flows through via currentColor.
function IconButton({ t, title, onClick, active, children }) {
  var [hover, setHover] = useState(false);
  var color = active ? t.accent : hover ? t.text : t.textSecondary;
  return (
    <button
      title={title}
      onClick={onClick}
      onMouseEnter={function () { setHover(true); }}
      onMouseLeave={function () { setHover(false); }}
      style={{
        width: 32, height: 32,
        border: "none", background: "transparent",
        display: "flex", alignItems: "center", justifyContent: "center",
        color: color, cursor: "pointer",
        transition: "color 0.13s",
        padding: 0,
      }}>
      {children}
    </button>
  );
}

// ── FeedCard ──────────────────────────────────────────────────────────────────
function FeedCard({
  m, isOwn, pName, pAvatar, demo, onDelete, onRemove,
  t, authUser, feedLikes, feedLikeCounts, feedComments,
  setFeedLikes, setFeedLikeCounts, setCommentModal, setCommentDraft,
  setDisputeModal, setDisputeDraft,
  confirmOpponentMatch, acceptCorrection, voidMatchAction,
  openProfile, openChallenge, toast,
}) {
  // Identity resolvers — who is the "poster" and who is the "opponent" from
  // the viewer's POV, so the right user IDs get wired into the profile links.
  // For tagged matches, the poster (pName) is the submitter; for own matches
  // the poster is the viewer themselves.
  var posterUserId   = m.isTagged ? (m.submitterId || null) : (authUser && authUser.id) || null;
  var opponentUserId = m.isTagged ? (authUser && authUser.id) || null : (m.opponent_id || null);
  function goPoster()   { if (openProfile && posterUserId)   openProfile(posterUserId); }
  function goOpponent() { if (openProfile && opponentUserId) openProfile(opponentUserId); }
  var posterClickable   = !demo && !!posterUserId   && (!authUser || posterUserId   !== authUser.id) && !!openProfile;
  var opponentClickable = !demo && !!opponentUserId && (!authUser || opponentUserId !== authUser.id) && !!openProfile;
  var isWin      = m.result === "win";
  var scoreStr   = (m.sets || []).map(function(s) { return s.you + "-" + s.them; }).join("  ");
  var liked      = !!feedLikes[m.id];
  var likeCount  = feedLikeCounts[m.id] || 0;
  var comments   = feedComments[m.id] || [];

  var status         = m.status || "confirmed";
  var isExpired      = status === "expired";
  var isPending      = status === "pending_confirmation";
  var isDisputed     = status === "disputed";
  var isPendingReconf = status === "pending_reconfirmation";
  var isVoided       = status === "voided";
  var isConfirmed    = status === "confirmed";
  var isOpponentView = isPending && m.isTagged;
  var isInDispute    = isDisputed || isPendingReconf;
  var needsMyAction  = isInDispute && authUser && m.pendingActionBy === authUser.id;
  var waitingForOther = isInDispute && authUser && m.pendingActionBy && m.pendingActionBy !== authUser.id;
  var cardOpacity    = (isExpired || isVoided) ? 0.5 : 1;

  function timeRemaining(expiresAt) {
    if (!expiresAt) return null;
    var ms = new Date(expiresAt) - Date.now();
    if (ms <= 0) return null;
    var h = Math.floor(ms / 3600000);
    if (h >= 48) return Math.floor(h / 24) + "d left";
    if (h >= 1) return h + "h left";
    return "<1h left";
  }

  function openDisputeModal(mode) {
    var prefill = mode === "counter" && m.currentProposal;
    setDisputeDraft({
      reasonCode: "",
      reasonDetail: "",
      sets: prefill
        ? m.currentProposal.sets.map(function(s) { return Object.assign({}, s); })
        : m.sets && m.sets.length ? m.sets.map(function(s) { return Object.assign({}, s); }) : [{ you: "", them: "" }],
      result: prefill ? m.currentProposal.result : m.result,
      date:   prefill ? m.currentProposal.match_date : m.rawDate || "",
      venue:  prefill ? m.currentProposal.venue : m.venue || "",
      court:  prefill ? m.currentProposal.court : m.court || "",
    });
    setDisputeModal({ match: m, mode });
  }

  function proposalScoreStr() {
    if (!m.currentProposal || !m.currentProposal.sets) return "";
    return m.currentProposal.sets.map(function(s) { return s.you + "-" + s.them; }).join("  ");
  }
  function changed(field) {
    if (!m.currentProposal) return false;
    if (field === "result") return m.result !== m.currentProposal.result;
    if (field === "sets")   return scoreStr !== proposalScoreStr();
    if (field === "date")   return m.rawDate !== m.currentProposal.match_date;
    if (field === "venue")  return (m.venue || "") !== (m.currentProposal.venue || "");
    if (field === "court")  return (m.court || "") !== (m.currentProposal.court || "");
    return false;
  }
  function chStyle(field) {
    return changed(field) ? { color: t.orange, fontWeight: 700 } : { color: t.text };
  }

  // ── Strava-style composition helpers ──────────────────────────────────
  // Compute set-level win counts ONCE here so we can reuse for:
  //   (a) the stats strip's "Sets" value
  //   (b) the scoreboard's winner-row derivation (existing logic)
  var setWinCounts = (function () {
    var sets = m.sets || [];
    var ys = 0, ts = 0;
    sets.forEach(function (s) {
      var y = Number(s.you), th = Number(s.them);
      if (!Number.isNaN(y) && !Number.isNaN(th) && y !== th) {
        if (y > th) ys++; else ts++;
      }
    });
    return { ys: ys, ts: ts };
  })();

  // The label in the header subtitle — "Ranked" / "Casual" / tournament name.
  var matchKindLabel = m.tournName && m.tournName !== "Casual Match"
    ? m.tournName
    : "Casual";

  // Strava-style subtitle: "Yesterday · Ranked · Moore Park"
  var subtitleParts = [m.date];
  if (matchKindLabel) subtitleParts.push(matchKindLabel);
  if (m.venue) subtitleParts.push(m.court ? m.venue + " · " + m.court : m.venue);
  var subtitleText = subtitleParts.filter(Boolean).join(" · ");

  // Compact status pill shown in the header top-right.
  var statusPill = isPending && !isOpponentView ? { label: "Pending",    color: t.orange,       bg: t.orangeSubtle }
                  : isDisputed                  ? { label: "Disputed",   color: t.red,          bg: t.redSubtle }
                  : isPendingReconf             ? { label: "Re-proposed",color: t.orange,       bg: t.orangeSubtle }
                  : isExpired                   ? { label: "Unverified", color: t.textTertiary, bg: t.bgTertiary }
                  : isVoided                    ? { label: "Voided",     color: t.textTertiary, bg: t.bgTertiary }
                  : null;

  return (
    <div
      className="cs-card"
      style={{
        background: t.bgCard,
        border: "1px solid " + t.border,
        borderRadius: 0,
        overflow: "hidden",
        marginBottom: 14,
        opacity: cardOpacity,
      }}
    >
      {/* ── Header (Strava-style: round avatar, accent name, meta subtitle) ── */}
      <div style={{ padding: "16px 16px 0", display: "flex", gap: 12, alignItems: "flex-start" }}>
        {/* Avatar — round, clickable when the poster is a real linked user */}
        <div
          onClick={posterClickable ? goPoster : undefined}
          style={{
            width: 40, height: 40, borderRadius: "50%", flexShrink: 0,
            background: avColor(pName),
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 14, fontWeight: 700, color: "#fff", letterSpacing: "-0.3px",
            cursor: posterClickable ? "pointer" : "default",
          }}>{pAvatar || (pName || "?").slice(0, 2).toUpperCase()}</div>

        {/* Name + subtitle */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: t.accent, letterSpacing: "-0.2px", lineHeight: 1.2 }}>
            <span
              onClick={posterClickable ? goPoster : undefined}
              style={{ cursor: posterClickable ? "pointer" : "default" }}>
              {pName}
            </span>
            {isOwn && <span style={{ fontSize: 11, color: t.textTertiary, fontWeight: 500 }}> · You</span>}
          </div>
          <div style={{ fontSize: 11, color: t.textSecondary, marginTop: 3, letterSpacing: "0.01em", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {subtitleText}
          </div>
        </div>

        {/* Top-right: status pill + close-button (kept minimal) */}
        <div style={{ display: "flex", gap: 6, alignItems: "center", flexShrink: 0 }}>
          {statusPill && (
            <span style={{
              fontSize: 9, fontWeight: 700, color: statusPill.color, background: statusPill.bg,
              padding: "3px 8px", borderRadius: 20, letterSpacing: "0.06em", textTransform: "uppercase",
            }}>{statusPill.label}</span>
          )}
          {isOwn && onDelete && !isInDispute && !isVoided && (
            <button onClick={async function() {
                if (!window.confirm("Delete this match?")) return;
                var res = await onDelete(m);
                if (res && res.error) (toast ? toast(res.error, "error") : window.alert(res.error));
              }}
              style={{ background: "none", border: "none", color: t.textTertiary, fontSize: 14, padding: "2px 4px", lineHeight: 1, cursor: "pointer" }}>✕</button>
          )}
          {m.isTagged && onRemove && isConfirmed && (
            <button onClick={async function() {
                if (!window.confirm("Remove from your feed?")) return;
                var res = await onRemove(m);
                if (res && res.error) (toast ? toast(res.error, "error") : window.alert(res.error));
              }}
              style={{ background: "none", border: "none", color: t.textTertiary, fontSize: 14, padding: "2px 4px", lineHeight: 1, cursor: "pointer" }}>✕</button>
          )}
        </div>
      </div>

      {/* ── Activity title row (Strava's "Evening Run" equivalent) ── */}
      <div style={{ padding: "12px 16px 6px", display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ fontSize: 20, lineHeight: 1, flexShrink: 0 }}>🎾</span>
        <h3 style={{
          margin: 0,
          fontSize: 20, fontWeight: 800, color: t.text,
          letterSpacing: "-0.4px", lineHeight: 1.15,
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>
          vs {m.oppName || "Unknown"}
        </h3>
      </div>

      {/* ── Stats strip (Strava's Distance/Pace/Time equivalent) ── */}
      {isConfirmed && scoreStr && (
        <div style={{
          padding: "6px 16px 14px",
          display: "grid",
          gridTemplateColumns: "1fr 1fr 1fr",
          gap: 0,
        }}>
          {[
            { label: "Result", value: isWin ? "Won" : "Lost", color: isWin ? t.green : t.red },
            { label: "Sets",   value: setWinCounts.ys + setWinCounts.ts > 0 ? (isOwn ? setWinCounts.ys : setWinCounts.ts) + "–" + (isOwn ? setWinCounts.ts : setWinCounts.ys) : "–", color: t.text },
            { label: "Score",  value: scoreStr.replace(/\s+/g, " "), color: t.text },
          ].map(function (s, i) {
            return (
              <div key={s.label} style={{
                borderLeft: i === 0 ? "none" : "1px solid " + t.border,
                paddingLeft: i === 0 ? 0 : 14,
                paddingRight: i === 2 ? 0 : 14,
              }}>
                <div style={{ fontSize: 10, color: t.textTertiary, fontWeight: 600, letterSpacing: "0.04em", marginBottom: 2 }}>
                  {s.label}
                </div>
                <div style={{
                  fontSize: 17, fontWeight: 800, color: s.color,
                  letterSpacing: "-0.3px", fontVariantNumeric: "tabular-nums", lineHeight: 1.1,
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                }}>
                  {s.value}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Scoreboard (flattened into card; venue/tourn moved to subtitle) ── */}
      <div style={{
        margin: "0 0 4px",
        borderTop: "1px solid " + t.border,
      }}>
        {/* Column-label strip — just set numbers, right-aligned, subtle */}
        {(m.sets || []).length > 0 && (
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "flex-end",
            padding: "6px 16px 0",
            background: "transparent",
          }}>
            <div style={{ display: "flex", alignItems: "center" }}>
              {(m.sets || []).map(function(_, i) {
                return (
                  <div key={i} style={{
                    width: 28, textAlign: "center",
                    fontSize: 9, fontWeight: 700, color: t.textTertiary,
                    letterSpacing: "0.04em",
                  }}>S{i + 1}</div>
                );
              })}
              <div style={{ width: 22 }} />
            </div>
          </div>
        )}

        {/* Player rows.
            Winner-row derivation: we trust the SCOREBOARD, not the stored
            `result` field. If the sets unambiguously pick a winner (more sets
            won on one side), we use that — this self-heals the classic
            "user accidentally tapped Loss but entered winning set scores" bug,
            where stored `result` disagrees with the actual score.
            If the sets are tied in count (retirement, incomplete match) we
            fall back to the stored `result` via `isWin` in the original
            tagged-frame logic. */}
        {(function() {
          var sets = m.sets || [];
          var ys = 0, ts = 0;
          sets.forEach(function (s) {
            var y = Number(s.you), th = Number(s.them);
            if (!Number.isNaN(y) && !Number.isNaN(th) && y !== th) {
              if (y > th) ys++; else ts++;
            }
          });
          // s.you is always the submitter's score in the DB, and pName is
          // always the submitter (own or tagged). So ys > ts means pName won.
          var posterWins = ys !== ts ? (ys > ts) : (isOwn ? isWin : !isWin);
          return [
            {
              name: pName,
              isWinner: posterWins,
              onClick: posterClickable ? goPoster : null,
              scores:    (m.sets || []).map(function(s) { return s.you;  }),
              oppScores: (m.sets || []).map(function(s) { return s.them; }),
            },
            {
              name: m.oppName,
              isWinner: !posterWins,
              onClick: opponentClickable ? goOpponent : null,
              scores:    (m.sets || []).map(function(s) { return s.them; }),
              oppScores: (m.sets || []).map(function(s) { return s.you;  }),
            },
          ];
        })().map(function(row, ri) {
          return (
            <div key={ri} style={{
              display: "flex", alignItems: "center",
              padding: "10px 16px",
              // First row under the column-label strip gets a subtle divider; rows after get one too.
              borderTop: "1px solid " + t.border,
              background: t.bgCard,
            }}>
              {/* Player name — clickable when that row is a real user */}
              <div
                onClick={row.onClick || undefined}
                style={{
                  flex: 1, minWidth: 0,
                  fontSize: 14,
                  fontWeight: row.isWinner ? 700 : 400,
                  color: row.isWinner ? t.text : t.textSecondary,
                  letterSpacing: row.isWinner ? "-0.2px" : "0",
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  paddingRight: 8,
                  cursor: row.onClick ? "pointer" : "default",
                }}>{row.name}</div>

              {/* Set scores */}
              {row.scores.map(function(score, i) {
                var opp = row.oppScores[i];
                var wonSet = (score !== "" && score !== undefined && opp !== "" && opp !== undefined)
                  ? Number(score) > Number(opp) : false;
                return (
                  <div key={i} style={{
                    width: 28, textAlign: "center",
                    fontSize: 18, fontWeight: wonSet ? 800 : 400,
                    color: wonSet ? t.text : t.textTertiary,
                    fontVariantNumeric: "tabular-nums",
                    lineHeight: 1,
                  }}>
                    {score !== undefined && score !== "" ? score : "–"}
                  </div>
                );
              })}

              {/* Winner indicator ◀ */}
              <div style={{ width: 22, textAlign: "center" }}>
                {row.isWinner && (
                  <span style={{ fontSize: 10, color: t.green, fontWeight: 700 }}>◀</span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* ── PENDING: submitter view ───────────────────────────────────────── */}
      {isPending && !isOpponentView && (
        <div style={{ borderTop: "1px solid " + t.border, padding: "10px 16px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 12, color: t.orange }}>⏳</span>
              <span style={{ fontSize: 12, color: t.textSecondary }}>Awaiting opponent confirmation</span>
            </div>
            {timeRemaining(m.expiresAt) && (
              <span style={{ fontSize: 10, fontWeight: 700, color: t.orange, background: t.orangeSubtle, padding: "2px 8px", borderRadius: 20, letterSpacing: "0.04em", flexShrink: 0 }}>{timeRemaining(m.expiresAt)}</span>
            )}
          </div>
        </div>
      )}

      {/* ── PENDING: opponent action buttons ─────────────────────────────── */}
      {isOpponentView && !demo && (
        <div style={{ borderTop: "1px solid " + t.border, padding: "12px 16px", display: "flex", gap: 8, flexWrap: "wrap" }}>
          <div style={{ fontSize: 12, color: t.textSecondary, width: "100%", marginBottom: 6, fontWeight: 500 }}>{pName} logged this match — does it look right?</div>
          <button onClick={async function() {
              var res = await confirmOpponentMatch(m);
              if (res && res.error) (toast ? toast(res.error, "error") : window.alert(res.error));
            }}
            style={{ flex: 1, padding: "10px 8px", borderRadius: 8, border: "none", background: t.green, color: "#fff", fontSize: 13, fontWeight: 700, minWidth: 80, transition: "opacity 0.15s" }}
            onMouseEnter={function(e){e.currentTarget.style.opacity="0.85";}} onMouseLeave={function(e){e.currentTarget.style.opacity="1";}}>
            ✓ Confirm
          </button>
          <button onClick={function() { openDisputeModal("dispute"); }}
            style={{ flex: 1, padding: "10px 8px", borderRadius: 8, border: "1px solid " + t.red + "44", background: t.redSubtle, color: t.red, fontSize: 13, fontWeight: 600, minWidth: 80 }}>
            Dispute
          </button>
        </div>
      )}

      {/* ── DISPUTED / RECONFIRMATION: diff block ────────────────────────── */}
      {isInDispute && m.currentProposal && (
        <div style={{ margin: "0 12px 12px", borderRadius: 8, border: "1px solid " + t.orange + "55", background: t.orangeSubtle, padding: 12 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: t.orange, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10 }}>
            {isPendingReconf ? "Counter-proposal awaiting opponent" : "Proposed correction"} · Round {m.revisionCount || 1}
            {(m.revisionCount || 0) >= 3 && <span style={{ marginLeft: 6, color: t.red }}> · Final round</span>}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div>
              <div style={{ fontSize: 9, fontWeight: 700, color: t.textTertiary, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>Original</div>
              <div style={{ fontSize: 12, color: t.text, marginBottom: 3 }}>{m.result === "win" ? "Win" : "Loss"}</div>
              {scoreStr && <div style={{ fontSize: 12, color: t.text, marginBottom: 3, fontVariantNumeric: "tabular-nums" }}>{scoreStr}</div>}
              {m.rawDate && <div style={{ fontSize: 11, color: t.textSecondary, marginBottom: 2 }}>{m.date}</div>}
              {m.venue && <div style={{ fontSize: 11, color: t.textSecondary }}>{m.venue}{m.court ? " · " + m.court : ""}</div>}
            </div>
            <div>
              <div style={{ fontSize: 9, fontWeight: 700, color: t.orange, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>Proposed</div>
              <div style={Object.assign({ fontSize: 12, marginBottom: 3 }, chStyle("result"))}>{m.currentProposal.result === "win" ? "Win" : "Loss"}</div>
              {proposalScoreStr() && <div style={Object.assign({ fontSize: 12, marginBottom: 3, fontVariantNumeric: "tabular-nums" }, chStyle("sets"))}>{proposalScoreStr()}</div>}
              {m.currentProposal.match_date && <div style={Object.assign({ fontSize: 11, marginBottom: 2 }, chStyle("date"))}>{m.currentProposal.match_date}</div>}
              {(m.currentProposal.venue || m.currentProposal.court) && (
                <div style={Object.assign({ fontSize: 11 }, chStyle("venue"))}>{[m.currentProposal.venue, m.currentProposal.court].filter(Boolean).join(" · ")}</div>
              )}
            </div>
          </div>
          {m.disputeReasonCode && (
            <div style={{ marginTop: 10, paddingTop: 8, borderTop: "1px solid " + t.orange + "33" }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: t.orange }}>{REASON_LABELS[m.disputeReasonCode] || m.disputeReasonCode}</span>
              {m.disputeReasonDetail && <span style={{ fontSize: 11, color: t.textSecondary }}> — {m.disputeReasonDetail}</span>}
            </div>
          )}
        </div>
      )}

      {/* ── DISPUTED: action buttons ──────────────────────────────────────── */}
      {isInDispute && needsMyAction && !demo && (
        <div style={{ borderTop: "1px solid " + t.border, padding: "12px 16px" }}>
          {(m.revisionCount || 0) >= 3 && (
            <div style={{ fontSize: 11, color: t.red, marginBottom: 8, fontWeight: 500 }}>Final round reached — accept or void.</div>
          )}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button onClick={async function() {
                var res = await acceptCorrection(m);
                if (res && res.error) (toast ? toast(res.error, "error") : window.alert(res.error));
              }}
              style={{ flex: 1, padding: "10px 8px", borderRadius: 8, border: "none", background: t.green, color: "#fff", fontSize: 13, fontWeight: 700, minWidth: 80, transition: "opacity 0.15s" }}
              onMouseEnter={function(e){e.currentTarget.style.opacity="0.85";}} onMouseLeave={function(e){e.currentTarget.style.opacity="1";}}>
              Accept
            </button>
            {(m.revisionCount || 0) < 3 && (
              <button onClick={function() { openDisputeModal("counter"); }}
                style={{ flex: 1, padding: "10px 8px", borderRadius: 8, border: "1px solid " + t.orange, background: t.orangeSubtle, color: t.orange, fontSize: 13, fontWeight: 600, minWidth: 80 }}>
                Counter-propose
              </button>
            )}
            <button onClick={async function() {
                if (!window.confirm("Void this match? This cannot be undone.")) return;
                var res = await voidMatchAction(m, "mutual_void");
                if (res && res.error) (toast ? toast(res.error, "error") : window.alert(res.error));
              }}
              style={{ flex: 1, padding: "10px 8px", borderRadius: 8, border: "1px solid " + t.red + "44", background: t.redSubtle, color: t.red, fontSize: 13, fontWeight: 600, minWidth: 80 }}>
              Void
            </button>
          </div>
        </div>
      )}

      {/* ── DISPUTED: waiting for other party ────────────────────────────── */}
      {isInDispute && waitingForOther && (
        <div style={{ borderTop: "1px solid " + t.border, padding: "10px 16px", display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 12, color: t.orange }}>⏳</span>
          <span style={{ fontSize: 12, color: t.textSecondary }}>
            {isPendingReconf ? "Waiting for opponent to reconfirm your counter" : "Waiting for their response to your correction"}
          </span>
        </div>
      )}

      {/* ── DISPUTED: no proposal yet ────────────────────────────────────── */}
      {isInDispute && !m.currentProposal && (
        <div style={{ borderTop: "1px solid " + t.border, padding: "10px 16px", display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 12, color: t.red }}>⚠</span>
          <span style={{ fontSize: 12, color: t.textSecondary }}>Under dispute — stats on hold</span>
        </div>
      )}

      {/* ── EXPIRED ──────────────────────────────────────────────────────── */}
      {isExpired && (
        <div style={{ borderTop: "1px solid " + t.border, padding: "10px 16px", display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 12, color: t.textTertiary }}>⏱</span>
          <span style={{ fontSize: 12, color: t.textTertiary }}>Confirmation window expired — does not count</span>
        </div>
      )}

      {/* ── VOIDED ───────────────────────────────────────────────────────── */}
      {isVoided && (
        <div style={{ borderTop: "1px solid " + t.border, padding: "10px 16px", display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 12, color: t.textTertiary }}>✕</span>
          <span style={{ fontSize: 12, color: t.textTertiary }}>
            {m.voidedReason === "not_my_match" ? "Voided — player reported this wasn't their match" :
             m.voidedReason === "max_revisions" ? "Voided — too many rounds of disagreement" :
             m.voidedReason === "timeout"       ? "Voided — dispute window expired" :
             "Voided — does not count"}
          </span>
        </div>
      )}

      {/* ── CONFIRMED: Strava-style social footer ──────────────────────────
          Left: kudos-style social-proof text ("N likes · M comments" or
                the empty-state prompt). Right: compact icon-first buttons.
          No big colored labels — the card visualization is the hero. */}
      {isConfirmed && !demo && (
        <div style={{
          borderTop: "1px solid " + t.border,
          padding: "10px 14px",
          display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10,
        }}>
          {/* Left: engagement summary / kudos prompt */}
          <div style={{ fontSize: 12, color: t.textSecondary, fontWeight: 500, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {(function () {
              var bits = [];
              if (likeCount > 0) bits.push(likeCount + (likeCount === 1 ? " like" : " likes"));
              if (comments.length > 0) bits.push(comments.length + (comments.length === 1 ? " comment" : " comments"));
              if (!bits.length) return <span style={{ color: t.textTertiary }}>Be the first to give kudos!</span>;
              return bits.join(" · ");
            })()}
          </div>

          {/* Right: minimal icon actions (Like · Comment · Rematch · Share) */}
          <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
            <IconButton
              t={t}
              title={liked ? "Unlike" : "Like"}
              active={liked}
              onClick={async function () {
                if (!authUser) return;
                var prevLiked = liked;
                var nowLiked = !liked;
                setFeedLikes(function(l) { var n = Object.assign({}, l); n[m.id] = nowLiked; return n; });
                setFeedLikeCounts(function(c) { var n = Object.assign({}, c); n[m.id] = Math.max(0, (n[m.id] || 0) + (nowLiked ? 1 : -1)); return n; });
                var res;
                if (nowLiked) { res = await supabase.from("feed_likes").insert({ match_id: m.id, user_id: authUser.id }); }
                else { res = await supabase.from("feed_likes").delete().eq("match_id", m.id).eq("user_id", authUser.id); }
                if (res && res.error) {
                  setFeedLikes(function(l) { var n = Object.assign({}, l); n[m.id] = prevLiked; return n; });
                  setFeedLikeCounts(function(c) { var n = Object.assign({}, c); n[m.id] = Math.max(0, (n[m.id] || 0) + (nowLiked ? -1 : 1)); return n; });
                  return;
                }
                if (nowLiked) {
                  var toNotify = [m.submitterId, m.opponent_id].filter(function (uid, i, arr) {
                    return uid && uid !== authUser.id && arr.indexOf(uid) === i;
                  });
                  track("feed_like", { match_id: m.id, participants_notified: toNotify.length });
                  if (toNotify.length) {
                    var oneHourAgoIso = new Date(Date.now() - 60 * 60 * 1000).toISOString();
                    supabase.from("notifications")
                      .select("id").eq("type", "like").eq("match_id", m.id)
                      .eq("from_user_id", authUser.id).gte("created_at", oneHourAgoIso).limit(1)
                      .then(function (r) {
                        if (r.error || (r.data && r.data.length)) return;
                        toNotify.forEach(function (uid) {
                          supabase.from("notifications").insert({
                            user_id: uid, type: "like", from_user_id: authUser.id, match_id: m.id,
                          });
                        });
                      });
                  }
                }
              }}>
              {liked ? ICONS.likeFilled() : ICONS.like()}
            </IconButton>
            <IconButton
              t={t}
              title={"Comment" + (comments.length > 0 ? " (" + comments.length + ")" : "")}
              onClick={function () { setCommentModal(m.id); setCommentDraft(""); }}>
              {ICONS.comment()}
            </IconButton>
            {openChallenge && opponentClickable && (
              <IconButton
                t={t}
                title="Rematch"
                onClick={function () {
                  openChallenge(
                    { id: opponentUserId, name: m.oppName, suburb: m.venue || "", skill: "" },
                    "rematch",
                    m
                  );
                }}>
                {ICONS.rematch()}
              </IconButton>
            )}
            <IconButton
              t={t}
              title="Share"
              onClick={function () { if (navigator.share) navigator.share({ title: "Match result", text: pName + (isWin ? " won " : " lost ") + "vs " + m.oppName + " " + scoreStr }); }}>
              {ICONS.share()}
            </IconButton>
          </div>
        </div>
      )}
      {demo && (
        <div style={{
          borderTop: "1px solid " + t.border,
          padding: "10px 14px",
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <span style={{ fontSize: 12, color: t.textTertiary }}>Be the first to give kudos!</span>
          <div style={{ display: "flex", gap: 4, color: t.textTertiary }}>
            <span style={{ padding: "7px 7px", display: "flex", alignItems: "center" }}>{ICONS.like()}</span>
            <span style={{ padding: "7px 7px", display: "flex", alignItems: "center" }}>{ICONS.comment()}</span>
          </div>
        </div>
      )}

      {/* Comments preview */}
      {isConfirmed && comments.length > 0 && (
        <div style={{ borderTop: "1px solid " + t.border, padding: "10px 16px", display: "flex", flexDirection: "column", gap: 6 }}>
          {comments.slice(-2).map(function(c) {
            return (
              <div key={c.id} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                <div style={{ width: 24, height: 24, borderRadius: "50%", background: avColor(c.author), display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 700, color: "#fff", flexShrink: 0 }}>{c.author.slice(0, 2).toUpperCase()}</div>
                <div style={{ flex: 1 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: t.text }}>{c.author} </span>
                  <span style={{ fontSize: 12, color: t.textSecondary }}>{c.text}</span>
                </div>
              </div>
            );
          })}
          {comments.length > 2 && (
            <button onClick={function() { setCommentModal(m.id); }} style={{ background: "none", border: "none", color: t.accent, fontSize: 11, fontWeight: 600, textAlign: "left", padding: 0 }}>
              View all {comments.length} comments
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ── HomeTab ───────────────────────────────────────────────────────────────────
export default function HomeTab({
  t, authUser, profile, history,
  feedLikes, setFeedLikes, feedLikeCounts, setFeedLikeCounts,
  feedComments, commentModal, setCommentModal, commentDraft, setCommentDraft,
  setShowAuth, setAuthMode, setAuthStep,
  setCasualOppName, setScoreModal, setScoreDraft,
  setDisputeModal, setDisputeDraft,
  deleteMatch, removeTaggedMatch,
  confirmOpponentMatch, acceptCorrection, voidMatchAction,
  openProfile,
  friends, playedOpponents, suggestedPlayers,
  sendFriendRequest, friendRelationLabel, socialLoading,
  onGoToDiscover,
  openChallenge,
  toast,
  pendingFreshCount,
  refreshFeed,
}) {
  // Feed filter — "Everyone" vs "Friends". Friends filter uses the same
  // friend_requests graph as the People tab; no schema change, stays in sync.
  var [feedFilter, setFeedFilter] = useState("everyone");
  var DEMO_FEED = [
    { id: "demo-1", oppName: "Alex Chen",     tournName: "Summer Open",       date: "Today",     sets: [{ you: 6, them: 3 }, { you: 6, them: 4 }], result: "win",  playerName: "Jordan Smith", playerAvatar: "JS", isOwn: false, status: "confirmed" },
    { id: "demo-2", oppName: "Sam Williams",  tournName: "Casual Match",      date: "Yesterday", sets: [{ you: 4, them: 6 }, { you: 3, them: 6 }], result: "loss", playerName: "Riley Brown",  playerAvatar: "RB", isOwn: false, status: "confirmed" },
    { id: "demo-3", oppName: "Morgan Davis",  tournName: "Moore Park Open",   date: "Mon",       sets: [{ you: 7, them: 5 }, { you: 6, them: 3 }], result: "win",  playerName: "Casey Moore",  playerAvatar: "CM", isOwn: false, status: "confirmed" },
  ];

  var feedCardProps = {
    t, authUser, feedLikes, feedLikeCounts, feedComments,
    setFeedLikes, setFeedLikeCounts, setCommentModal, setCommentDraft,
    setDisputeModal, setDisputeDraft,
    confirmOpponentMatch, acceptCorrection, voidMatchAction,
    openProfile, openChallenge,
    toast,
  };

  function openLogMatch() {
    setCasualOppName("");
    setScoreModal({ casual: true, oppName: "", tournName: "Casual Match" });
    setScoreDraft({ sets: [{ you: "", them: "" }], result: "win", notes: "", date: new Date().toISOString().slice(0, 10), venue: "", court: "" });
  }

  // ── Unauthenticated: hero + blurred demo feed ──────────────────────────────
  if (!authUser) {
    return (
      <div style={{ maxWidth: 680, margin: "0 auto" }}>
        <div style={{ padding: "36px 20px 24px" }}>
          <div style={{ fontSize: 28, fontWeight: 800, color: t.text, letterSpacing: "-0.6px", marginBottom: 8, lineHeight: 1.2 }}>
            Sydney Tennis.
          </div>
          <div style={{ fontSize: 14, color: t.textSecondary, lineHeight: 1.6, marginBottom: 24 }}>
            See how your friends are playing. Track your wins. Own your suburbs.
          </div>
          <div style={{ display: "flex", gap: 10, marginBottom: 32 }}>
            <button
              onClick={function() { setShowAuth(true); setAuthMode("signup"); setAuthStep("choose"); }}
              style={{ flex: 1, padding: "13px", borderRadius: 9, border: "none", background: t.accent, color: "#fff", fontSize: 14, fontWeight: 700, letterSpacing: "-0.1px" }}>
              Join free
            </button>
            <button
              onClick={function() { setShowAuth(true); setAuthMode("login"); setAuthStep("choose"); }}
              style={{ flex: 1, padding: "13px", borderRadius: 9, border: "1px solid " + t.border, background: "transparent", color: t.text, fontSize: 14, fontWeight: 500 }}>
              Log in
            </button>
          </div>
        </div>
        <div style={{ position: "relative", padding: "0 20px 40px" }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: t.textTertiary, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 14 }}>Recent activity</div>
          <div style={{ filter: "blur(3px)", pointerEvents: "none", userSelect: "none" }}>
            {DEMO_FEED.map(function(m) {
              return <FeedCard key={m.id} m={m} isOwn={false} pName={m.playerName} pAvatar={m.playerAvatar} demo={true} {...feedCardProps} />;
            })}
          </div>
          <div style={{ position: "absolute", top: "40%", left: "50%", transform: "translate(-50%,-50%)", textAlign: "center", background: t.bgCard, border: "1px solid " + t.border, borderRadius: 14, padding: "24px 24px", boxShadow: "0 8px 32px rgba(0,0,0,0.08)", width: "calc(100% - 80px)", maxWidth: 320 }}>
            <div style={{ fontSize: 22, marginBottom: 10 }}>🎾</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: t.text, marginBottom: 6 }}>Your community feed</div>
            <div style={{ fontSize: 13, color: t.textSecondary, lineHeight: 1.6, marginBottom: 18 }}>Sign up to see matches from players you follow and share your own results.</div>
            <button
              onClick={function() { setShowAuth(true); setAuthMode("signup"); setAuthStep("choose"); }}
              style={{ width: "100%", padding: "12px", borderRadius: 8, border: "none", background: t.accent, color: "#fff", fontSize: 13, fontWeight: 700 }}>
              Get started
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Authenticated feed ─────────────────────────────────────────────────────
  return (
    <div style={{ maxWidth: 720, margin: "0 auto", width: "100%" }}>
      {/* Page header */}
      <div style={{ padding: "28px 20px 0", display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 18, maxWidth: 720 }}>
        <div>
          <div style={{ fontSize: 24, fontWeight: 800, color: t.text, letterSpacing: "-0.6px", lineHeight: 1.1 }}>Feed</div>
          <div style={{ fontSize: 12, color: t.textTertiary, marginTop: 3 }}>
            {history.length} match{history.length !== 1 ? "es" : ""} logged
          </div>
        </div>
        <button
          onClick={openLogMatch}
          style={{ padding: "10px 18px", borderRadius: 9, border: "none", background: t.accent, color: "#fff", fontSize: 13, fontWeight: 700, flexShrink: 0, letterSpacing: "-0.1px", transition: "opacity 0.15s" }}
          onMouseEnter={function(e){e.currentTarget.style.opacity="0.85";}} onMouseLeave={function(e){e.currentTarget.style.opacity="1";}}>
          + Log match
        </button>
      </div>

      {/* Module 6: community-pulse one-liner. Compact stats from the user's
          existing local data (history + friends list) — no extra query. Gives
          a reason to glance at the feed on a no-match day. */}
      {(function () {
        if (!history || !history.length) return null;
        var friendIdSet = new Set((friends || []).map(function (f) { return f.id; }));
        var oneWeekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
        var thisWeek = history.filter(function (m) {
          if (m.status !== "confirmed") return false;
          var d = m.rawDate ? new Date(m.rawDate).getTime() : 0;
          return d >= oneWeekAgo;
        });
        var friendsThisWeek = thisWeek.filter(function (m) {
          var poster = m.isTagged ? m.submitterId : (authUser && authUser.id);
          var opp    = m.opponent_id;
          return (poster && friendIdSet.has(poster)) || (opp && friendIdSet.has(opp));
        });
        if (!thisWeek.length) return null;
        var msg = friendsThisWeek.length > 0
          ? friendsThisWeek.length + " friend match" + (friendsThisWeek.length !== 1 ? "es" : "") + " this week · " + thisWeek.length + " in your feed"
          : thisWeek.length + " confirmed match" + (thisWeek.length !== 1 ? "es" : "") + " this week";
        return (
          <div style={{
            padding: "0 20px 12px", maxWidth: 720,
            fontSize: 11, color: t.textTertiary,
            display: "flex", alignItems: "center", gap: 6,
            letterSpacing: "0.02em",
          }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: t.green, flexShrink: 0 }} />
            <span style={{ fontWeight: 600 }}>This week:</span>
            <span>{msg}</span>
          </div>
        );
      })()}

      {/* Filter pills — functional. Friends = matches where poster or opponent
          is in the viewer's friends list. */}
      <div style={{ display: "flex", gap: 6, padding: "0 20px 18px", maxWidth: 720 }}>
        {[
          { id: "everyone", label: "Everyone" },
          { id: "friends",  label: "Friends"  },
        ].map(function (f) {
          var on = feedFilter === f.id;
          return (
            <button key={f.id}
              onClick={function () { setFeedFilter(f.id); }}
              style={{
                fontSize: 12, fontWeight: on ? 700 : 500,
                color: on ? t.accent : t.textTertiary,
                background: on ? t.accentSubtle : t.bgCard,
                border: on ? "1px solid transparent" : "1px solid " + t.border,
                padding: "5px 14px", borderRadius: 20,
                cursor: "pointer",
              }}>
              {f.label}
            </button>
          );
        })}
      </div>

      {/* New-match banner (Module 6.5): shown when realtime detects a
          match_history INSERT involving the viewer that isn't in local state
          yet. Tap refreshes the feed — we don't eagerly splice the row in
          because it'd jump the list mid-scroll. */}
      {pendingFreshCount > 0 && refreshFeed && (
        <div style={{ padding: "0 20px 12px", maxWidth: 720, margin: "0 auto", width: "100%" }}>
          <button
            onClick={refreshFeed}
            className="pop"
            style={{
              width: "100%", padding: "10px 14px",
              background: t.accent, color: "#fff",
              border: "none", borderRadius: 10,
              fontSize: 12, fontWeight: 700, letterSpacing: "-0.1px",
              cursor: "pointer", transition: "opacity 0.15s",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
            }}
            onMouseEnter={function (e) { e.currentTarget.style.opacity = "0.85"; }}
            onMouseLeave={function (e) { e.currentTarget.style.opacity = "1"; }}
          >
            <span style={{ fontSize: 14 }}>↑</span>
            <span>
              {pendingFreshCount === 1
                ? "1 new match — tap to refresh"
                : pendingFreshCount + " new matches — tap to refresh"}
            </span>
          </button>
        </div>
      )}

      {/* Feed */}
      <div style={{ padding: "0 20px 40px", maxWidth: 720 }}>
        {(function () {
          // Apply feed filter once, render the chosen slice.
          var friendIdSet = new Set((friends || []).map(function (f) { return f.id; }));
          var filtered = history;
          if (feedFilter === "friends") {
            filtered = history.filter(function (m) {
              var posterId = m.isTagged ? m.submitterId : (authUser && authUser.id);
              var oppId    = m.opponent_id;
              return (posterId && friendIdSet.has(posterId)) ||
                     (oppId    && friendIdSet.has(oppId));
            });
          }

          if (history.length === 0) {
            return (
              <div style={{ background: t.bgCard, border: "1px solid " + t.border, borderRadius: 14, padding: "48px 24px", textAlign: "center" }}>
                <div style={{ fontSize: 44, marginBottom: 14 }}>🎾</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: t.text, marginBottom: 8, letterSpacing: "-0.3px" }}>Nothing here yet</div>
                <div style={{ fontSize: 13, color: t.textSecondary, lineHeight: 1.7, marginBottom: 24, maxWidth: 280, margin: "0 auto 24px" }}>Log your first match and it'll show up in your feed.</div>
                <button onClick={openLogMatch} style={{ padding: "13px 28px", borderRadius: 9, border: "none", background: t.accent, color: "#fff", fontSize: 14, fontWeight: 700, letterSpacing: "-0.1px" }}>Log your first match</button>
              </div>
            );
          }

          if (feedFilter === "friends" && filtered.length === 0) {
            return (
              <div style={{ background: t.bgCard, border: "1px solid " + t.border, borderRadius: 14, padding: "40px 24px", textAlign: "center" }}>
                <div style={{ fontSize: 36, marginBottom: 12 }}>🫱🏼‍🫲🏽</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: t.text, marginBottom: 6 }}>No matches from friends yet</div>
                <div style={{ fontSize: 13, color: t.textSecondary, lineHeight: 1.6, marginBottom: 20, maxWidth: 280, margin: "0 auto 20px" }}>
                  Once you add friends, their matches will appear here.
                </div>
                {onGoToDiscover && (
                  <button onClick={onGoToDiscover} style={{ padding: "11px 22px", borderRadius: 9, border: "none", background: t.accent, color: "#fff", fontSize: 13, fontWeight: 700 }}>
                    Find players
                  </button>
                )}
              </div>
            );
          }

          return filtered.map(function (m) {
            var isOwn = !m.isTagged;
            return (
              <FeedCard
                key={m.id} m={m} isOwn={isOwn} demo={false}
                pName={isOwn ? profile.name : (m.friendName || m.oppName)}
                pAvatar={isOwn ? profile.avatar : ""}
                onDelete={isOwn ? deleteMatch : null}
                onRemove={m.isTagged ? removeTaggedMatch : null}
                {...feedCardProps}
              />
            );
          });
        })()}

        {/* Live discovery widget — replaces the old "Coming soon" placeholder.
            Shows up to 3 players (prefer played-before, fall back to suburb)
            with an inline Add/Pending/Friends pill + "See all" CTA. */}
        {history.length > 0 && (function () {
          var rec = (playedOpponents && playedOpponents.length ? playedOpponents : (suggestedPlayers || [])).slice(0, 3);
          if (!rec.length || !friendRelationLabel) return null;
          return (
            <div style={{ background: t.bgCard, border: "1px solid " + t.border, borderRadius: 12, padding: "16px", marginTop: 4 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: t.text }}>Find players to follow</div>
                  <div style={{ fontSize: 12, color: t.textSecondary, marginTop: 2 }}>People near you and opponents you've played.</div>
                </div>
                {onGoToDiscover && (
                  <button onClick={onGoToDiscover} style={{ background: "none", border: "none", color: t.accent, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>See all</button>
                )}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {rec.map(function (u) {
                  var rel = friendRelationLabel(u.id);
                  var loading = !!(socialLoading && socialLoading[u.id]);
                  return (
                    <div key={u.id} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <div onClick={function () { if (openProfile) openProfile(u.id); }}
                        style={{ width: 34, height: 34, borderRadius: "50%", background: avColor(u.name || "?"), display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, color: "#fff", flexShrink: 0, cursor: openProfile ? "pointer" : "default" }}>
                        {(u.avatar || u.name || "?").slice(0, 2).toUpperCase()}
                      </div>
                      <div onClick={function () { if (openProfile) openProfile(u.id); }}
                        style={{ flex: 1, minWidth: 0, cursor: openProfile ? "pointer" : "default" }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: t.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{u.name}</div>
                        <div style={{ fontSize: 11, color: t.textTertiary }}>{[u.suburb, u.skill].filter(Boolean).join(" · ") || "New player"}</div>
                      </div>
                      {rel === "none" && sendFriendRequest && (
                        <button disabled={loading} onClick={function () { sendFriendRequest(u); }}
                          style={{ padding: "6px 14px", borderRadius: 8, border: "none", background: t.accent, color: "#fff", fontSize: 12, fontWeight: 600, opacity: loading ? 0.6 : 1, cursor: "pointer", flexShrink: 0 }}>
                          {loading ? "…" : "Add"}
                        </button>
                      )}
                      {rel === "sent" && (
                        <span style={{ padding: "6px 12px", borderRadius: 8, border: "1px solid " + t.border, color: t.textSecondary, fontSize: 11, fontWeight: 500, flexShrink: 0 }}>Pending</span>
                      )}
                      {rel === "friends" && (
                        <span style={{ padding: "6px 12px", borderRadius: 8, color: t.accent, fontSize: 11, fontWeight: 700, flexShrink: 0 }}>Friends ✓</span>
                      )}
                      {rel === "received" && (
                        <span style={{ padding: "6px 12px", borderRadius: 8, color: t.green, fontSize: 11, fontWeight: 600, flexShrink: 0 }}>Added you</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })()}
      </div>
    </div>
  );
}
