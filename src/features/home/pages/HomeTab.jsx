// src/features/home/pages/HomeTab.jsx
import { supabase } from "../../../lib/supabase.js";
import { avColor } from "../../../lib/utils/avatar.js";

var REASON_LABELS = {
  wrong_score:   "Score is wrong",
  wrong_winner:  "Winner is wrong",
  wrong_date:    "Date is wrong",
  wrong_venue:   "Venue or court is wrong",
  not_my_match:  "Didn't play this match",
  other:         "Other",
};

// ── FeedCard ──────────────────────────────────────────────────────────────────
function FeedCard({
  m, isOwn, pName, pAvatar, demo, onDelete, onRemove,
  t, authUser, feedLikes, feedLikeCounts, feedComments,
  setFeedLikes, setFeedLikeCounts, setCommentModal, setCommentDraft,
  setDisputeModal, setDisputeDraft,
  confirmOpponentMatch, acceptCorrection, voidMatchAction,
  openProfile,
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

  var resultColor = isWin ? t.green : t.red;

  return (
    <div
      className="cs-card"
      style={{
        background: t.bgCard,
        border: "1px solid " + t.border,
        borderRadius: 12,
        overflow: "hidden",
        marginBottom: 12,
        opacity: cardOpacity,
      }}
    >
      {/* ── Card header ──────────────────────────────────────────────────── */}
      <div style={{ padding: "14px 16px 12px", display: "flex", gap: 10, alignItems: "center" }}>
        {/* Avatar — clickable when the poster is another real user */}
        <div
          onClick={posterClickable ? goPoster : undefined}
          style={{
            width: 38, height: 38, borderRadius: 10, flexShrink: 0,
            background: avColor(pName),
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 13, fontWeight: 700, color: "#fff", letterSpacing: "-0.3px",
            cursor: posterClickable ? "pointer" : "default",
          }}>{pAvatar || (pName || "?").slice(0, 2).toUpperCase()}</div>

        {/* Name + date */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: t.text, letterSpacing: "-0.2px" }}>
            <span
              onClick={posterClickable ? goPoster : undefined}
              style={{ cursor: posterClickable ? "pointer" : "default" }}>
              {pName}
            </span>
            {isOwn && <span style={{ fontSize: 11, color: t.textTertiary, fontWeight: 400 }}> · You</span>}
          </div>
          <div style={{ fontSize: 11, color: t.textTertiary, marginTop: 1, letterSpacing: "0.01em" }}>{m.date}</div>
        </div>

        {/* Badges */}
        <div style={{ display: "flex", gap: 6, alignItems: "center", flexShrink: 0 }}>
          {m.tournName && m.tournName !== "Casual Match" && (
            <span style={{ fontSize: 9, fontWeight: 700, color: t.accent, background: t.accentSubtle, padding: "3px 8px", borderRadius: 20, letterSpacing: "0.06em", textTransform: "uppercase" }}>{m.tournName}</span>
          )}
          {m.tournName === "Casual Match" && (
            <span style={{ fontSize: 9, fontWeight: 600, color: t.textTertiary, background: t.bgTertiary, padding: "3px 8px", borderRadius: 20, letterSpacing: "0.06em", textTransform: "uppercase" }}>Casual</span>
          )}
          {isPending && !isOpponentView && <span style={{ fontSize: 9, fontWeight: 700, color: t.orange, background: t.orangeSubtle, padding: "3px 8px", borderRadius: 20, letterSpacing: "0.06em", textTransform: "uppercase" }}>Pending</span>}
          {isDisputed     && <span style={{ fontSize: 9, fontWeight: 700, color: t.red,    background: t.redSubtle,    padding: "3px 8px", borderRadius: 20, letterSpacing: "0.06em", textTransform: "uppercase" }}>Disputed</span>}
          {isPendingReconf && <span style={{ fontSize: 9, fontWeight: 700, color: t.orange, background: t.orangeSubtle, padding: "3px 8px", borderRadius: 20, letterSpacing: "0.06em", textTransform: "uppercase" }}>Re-proposed</span>}
          {isExpired && <span style={{ fontSize: 9, fontWeight: 700, color: t.textTertiary, background: t.bgTertiary, padding: "3px 8px", borderRadius: 20, letterSpacing: "0.06em", textTransform: "uppercase" }}>Unverified</span>}
          {isVoided  && <span style={{ fontSize: 9, fontWeight: 700, color: t.textTertiary, background: t.bgTertiary, padding: "3px 8px", borderRadius: 20, letterSpacing: "0.06em", textTransform: "uppercase" }}>Voided</span>}
          {isOwn && onDelete && !isInDispute && !isVoided && (
            <button onClick={async function() {
                if (!window.confirm("Delete this match?")) return;
                var res = await onDelete(m);
                if (res && res.error) window.alert(res.error);
              }}
              style={{ background: "none", border: "none", color: t.textTertiary, fontSize: 14, padding: "2px 4px", lineHeight: 1 }}>✕</button>
          )}
          {m.isTagged && onRemove && isConfirmed && (
            <button onClick={async function() {
                if (!window.confirm("Remove from your feed?")) return;
                var res = await onRemove(m);
                if (res && res.error) window.alert(res.error);
              }}
              style={{ background: "none", border: "none", color: t.textTertiary, fontSize: 14, padding: "2px 4px", lineHeight: 1 }}>✕</button>
          )}
        </div>
      </div>

      {/* ── Scoreboard ──────────────────────────────────────────────────── */}
      <div style={{
        margin: "0 12px 14px",
        borderRadius: 10,
        overflow: "hidden",
        border: "1px solid " + resultColor + "40",
      }}>
        {/* Scoreboard header: venue/tournament on left, set labels on right */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "6px 14px",
          background: t.bgTertiary,
          borderBottom: "1px solid " + t.border,
        }}>
          <span style={{
            fontSize: 10, fontWeight: 600, color: t.textTertiary,
            letterSpacing: "0.04em", textTransform: "uppercase",
          }}>
            {[m.venue, m.court].filter(Boolean).join(" · ") ||
             (m.tournName && m.tournName !== "Casual Match" ? m.tournName : "Casual")}
          </span>
          {(m.sets || []).length > 0 && (
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
          )}
        </div>

        {/* Player rows
            For own matches (isOwn=true):  pName = viewer, isWin is direct.
            For tagged matches (isOwn=false): pName = submitter, but isWin is
            stored from the VIEWER's perspective (result inverted in normalizeMatch),
            so the submitter's win = !isWin. */}
        {(function() {
          var posterWins = isOwn ? isWin : !isWin;
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
              padding: "10px 14px",
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
              if (res && res.error) window.alert(res.error);
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
                if (res && res.error) window.alert(res.error);
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
                if (res && res.error) window.alert(res.error);
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

      {/* ── CONFIRMED: social actions ─────────────────────────────────────── */}
      {isConfirmed && !demo && (
        <div style={{ borderTop: "1px solid " + t.border, display: "flex" }}>
          <button
            onClick={async function() {
              if (!authUser) return;
              var prevLiked = liked;
              var nowLiked = !liked;
              // Optimistic update
              setFeedLikes(function(l) { var n = Object.assign({}, l); n[m.id] = nowLiked; return n; });
              setFeedLikeCounts(function(c) { var n = Object.assign({}, c); n[m.id] = Math.max(0, (n[m.id] || 0) + (nowLiked ? 1 : -1)); return n; });
              var res;
              if (nowLiked) { res = await supabase.from("feed_likes").insert({ match_id: m.id, user_id: authUser.id }); }
              else { res = await supabase.from("feed_likes").delete().eq("match_id", m.id).eq("user_id", authUser.id); }
              // Rollback on failure so the heart + count don't lie
              if (res && res.error) {
                setFeedLikes(function(l) { var n = Object.assign({}, l); n[m.id] = prevLiked; return n; });
                setFeedLikeCounts(function(c) { var n = Object.assign({}, c); n[m.id] = Math.max(0, (n[m.id] || 0) + (nowLiked ? -1 : 1)); return n; });
              }
            }}
            style={{ flex: 1, padding: "10px 8px", border: "none", borderRight: "1px solid " + t.border, background: "transparent", color: liked ? t.accent : t.textSecondary, fontSize: 11, fontWeight: liked ? 700 : 500, display: "flex", alignItems: "center", justifyContent: "center", gap: 5, letterSpacing: "0.02em", transition: "color 0.15s" }}>
            <span style={{ fontSize: 14 }}>👍</span>{liked ? "Liked" : "Like"}{likeCount > 0 ? " · " + likeCount : ""}
          </button>
          <button
            onClick={function() { setCommentModal(m.id); setCommentDraft(""); }}
            style={{ flex: 1, padding: "10px 8px", border: "none", borderRight: "1px solid " + t.border, background: "transparent", color: t.textSecondary, fontSize: 11, fontWeight: 500, display: "flex", alignItems: "center", justifyContent: "center", gap: 5, letterSpacing: "0.02em" }}>
            <span style={{ fontSize: 14 }}>💬</span>Comment{comments.length > 0 ? " (" + comments.length + ")" : ""}
          </button>
          <button
            onClick={function() { if (navigator.share) navigator.share({ title: "Match result", text: pName + (isWin ? " won " : " lost ") + "vs " + m.oppName + " " + scoreStr }); }}
            style={{ flex: 1, padding: "10px 8px", border: "none", background: "transparent", color: t.textSecondary, fontSize: 11, fontWeight: 500, display: "flex", alignItems: "center", justifyContent: "center", gap: 5, letterSpacing: "0.02em" }}>
            <span style={{ fontSize: 14 }}>↗</span>Share
          </button>
        </div>
      )}
      {demo && (
        <div style={{ borderTop: "1px solid " + t.border, padding: "10px 16px", display: "flex", gap: 16 }}>
          {["👍 Like", "💬 Comment", "↗ Share"].map(function(a) { return <span key={a} style={{ fontSize: 11, color: t.textTertiary, fontWeight: 500, letterSpacing: "0.02em" }}>{a}</span>; })}
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
}) {
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
    openProfile,
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

      {/* Filter pills */}
      <div style={{ display: "flex", gap: 6, padding: "0 20px 18px", maxWidth: 720 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: t.accent, background: t.accentSubtle, padding: "5px 14px", borderRadius: 20 }}>Everyone</span>
        <span style={{ fontSize: 12, fontWeight: 500, color: t.textTertiary, background: t.bgCard, border: "1px solid " + t.border, padding: "5px 14px", borderRadius: 20, opacity: 0.6 }}>Friends</span>
      </div>

      {/* Feed */}
      <div style={{ padding: "0 20px 40px", maxWidth: 720 }}>
        {history.length === 0
          ? (
            <div style={{ background: t.bgCard, border: "1px solid " + t.border, borderRadius: 14, padding: "48px 24px", textAlign: "center" }}>
              <div style={{ fontSize: 44, marginBottom: 14 }}>🎾</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: t.text, marginBottom: 8, letterSpacing: "-0.3px" }}>Nothing here yet</div>
              <div style={{ fontSize: 13, color: t.textSecondary, lineHeight: 1.7, marginBottom: 24, maxWidth: 280, margin: "0 auto 24px" }}>Log your first match and it'll show up in your feed.</div>
              <button onClick={openLogMatch} style={{ padding: "13px 28px", borderRadius: 9, border: "none", background: t.accent, color: "#fff", fontSize: 14, fontWeight: 700, letterSpacing: "-0.1px" }}>Log your first match</button>
            </div>
          )
          : history.map(function(m) {
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
          })
        }
        {history.length > 0 && (
          <div style={{ background: t.bgCard, border: "1px solid " + t.border, borderRadius: 12, padding: "20px", textAlign: "center", marginTop: 4 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: t.text, marginBottom: 4 }}>Find players to follow</div>
            <div style={{ fontSize: 12, color: t.textSecondary, marginBottom: 14 }}>See your friends' matches in your feed when the community grows.</div>
            <span style={{ fontSize: 12, fontWeight: 600, color: t.textTertiary, background: t.bgTertiary, border: "1px solid " + t.border, padding: "7px 16px", borderRadius: 8 }}>Coming soon</span>
          </div>
        )}
      </div>
    </div>
  );
}
