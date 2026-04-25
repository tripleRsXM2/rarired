// src/features/profile/components/ProfileRivalry.jsx
//
// Slice 2 of the design overhaul: the rivalry highlight card on the
// own-profile page. Surfaces the viewer's TOP head-to-head opponent
// — the player they've actually had a rivalry with, not just a
// one-off match.
//
// Design rules (docs/design-direction.md → Profile structure):
//   • Sits between the Hero and the deeper stats accordion
//   • Only renders when there's a real rivalry — defined here as
//     ≥3 confirmed matches against the same LINKED opponent (one-offs
//     and freetext-name opponents don't qualify; we want a tap-through
//     to a real profile)
//   • Shows: opponent name + avatar + H2H score (your favour vs
//     theirs) + last result chip + rematch CTA
//   • Tap on the opponent → openProfile(opponentId)
//   • Rematch CTA → openChallenge(opponent, "rematch", lastMatch)

import { avColor } from "../../../lib/utils/avatar.js";
import {
  computeMostPlayed,
  computeHeadToHead,
} from "../utils/profileStats.js";

var RIVALRY_MIN_PLAYS = 3;

function pickRival(history, myId) {
  if (!history || !myId) return null;
  var top = computeMostPlayed(history, myId, 5);
  // Filter to LINKED opponents only — freetext names don't get a tap-through.
  var linked = top.filter(function (o) {
    return !!o.opponentId && o.plays >= RIVALRY_MIN_PLAYS;
  });
  return linked[0] || null;
}

function pickLastMatch(history, opponentId) {
  if (!history || !opponentId) return null;
  var rows = history.filter(function (m) {
    if (m.status !== "confirmed") return false;
    return m.opponent_id === opponentId || m.submitterId === opponentId;
  });
  rows.sort(function (a, b) {
    return (b.rawDate || "").localeCompare(a.rawDate || "");
  });
  return rows[0] || null;
}

export default function ProfileRivalry({
  t, authUser, history,
  openProfile, openChallenge,
}) {
  if (!authUser) return null;

  var myId = authUser.id;
  var rival = pickRival(history, myId);
  if (!rival) return null;

  var h2h = computeHeadToHead(history, myId, rival.opponentId);
  var lastMatch = pickLastMatch(history, rival.opponentId);
  var iLead    = h2h.viewerWins  > h2h.subjectWins;
  var theyLead = h2h.subjectWins > h2h.viewerWins;
  var lastWasWin = lastMatch && lastMatch.result === "win";

  function onTapOpponent() {
    if (!openProfile || !rival.opponentId) return;
    openProfile(rival.opponentId);
  }
  function onRematch(e) {
    if (e) e.stopPropagation();
    if (!openChallenge || !rival.opponentId) return;
    openChallenge(
      { id: rival.opponentId, name: rival.opponentName, suburb: "", skill: "" },
      "rematch",
      lastMatch || undefined
    );
  }

  return (
    <div className="cs-profile-rivalry">
      {/* Section header — editorial title, not a micro-eyebrow */}
      <div style={{
        fontSize: "clamp(20px, 3vw, 24px)",
        fontWeight: 700,
        color: t.text,
        letterSpacing: "-0.02em",
        marginBottom: 16,
      }}>
        Rivalry
      </div>

      <div className="cs-profile-rivalry-body" style={{
        display: "flex", flexDirection: "column", gap: 20,
      }}>
        {/* Opponent row — avatar + name + lead caption */}
        <div
          onClick={openProfile ? onTapOpponent : undefined}
          style={{
            display: "flex", alignItems: "center", gap: 14,
            cursor: openProfile ? "pointer" : "default",
            minWidth: 0,
          }}>
          <div style={{
            width: 48, height: 48, borderRadius: "50%", flexShrink: 0,
            background: avColor(rival.opponentName),
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 15, fontWeight: 800, color: "#fff",
          }}>
            {(rival.opponentName || "?").slice(0, 2).toUpperCase()}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontSize: 17, fontWeight: 700, color: t.text,
              letterSpacing: "-0.15px", lineHeight: 1.2,
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            }}>
              {rival.opponentName}
            </div>
            <div style={{
              marginTop: 4,
              fontSize: 11, fontWeight: 700,
              color: iLead ? t.green : theyLead ? t.red : t.textTertiary,
              letterSpacing: "0.08em", textTransform: "uppercase",
            }}>
              {iLead     ? "You lead" :
               theyLead  ? "They lead" :
                           "Tied"}
              <span style={{ color: t.textTertiary, fontWeight: 500, marginLeft: 6 }}>
                · {h2h.totalMatches} played
              </span>
            </div>
          </div>
        </div>

        {/* H2H — display numbers separated by a hairline divider, no card */}
        <div style={{
          display: "flex", alignItems: "stretch",
          paddingTop: 8, paddingBottom: 8,
        }}>
          <div style={{ flex: 1, textAlign: "center", borderRight: "1px solid " + t.border, padding: "0 8px" }}>
            <div style={{
              fontSize: 10, fontWeight: 700, color: t.textTertiary,
              textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 8,
            }}>
              You
            </div>
            <div style={{
              fontSize: "clamp(36px, 5vw, 48px)",
              fontWeight: 800,
              color: iLead ? t.green : t.text,
              fontVariantNumeric: "tabular-nums", letterSpacing: "-0.025em", lineHeight: 1,
            }}>
              {h2h.viewerWins}
            </div>
          </div>
          <div style={{ flex: 1, textAlign: "center", padding: "0 8px", minWidth: 0 }}>
            <div style={{
              fontSize: 10, fontWeight: 700, color: t.textTertiary,
              textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 8,
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            }}>
              {rival.opponentName}
            </div>
            <div style={{
              fontSize: "clamp(36px, 5vw, 48px)",
              fontWeight: 800,
              color: theyLead ? t.green : t.text,
              fontVariantNumeric: "tabular-nums", letterSpacing: "-0.025em", lineHeight: 1,
            }}>
              {h2h.subjectWins}
            </div>
          </div>
        </div>

        {/* Last result + rematch CTA — single line of text + ink CTA */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          {lastMatch && (
            <span style={{
              fontSize: 12,
              color: t.textSecondary,
              letterSpacing: "0.01em",
            }}>
              Last match · <span style={{
                color: lastWasWin ? t.green : t.red,
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.08em",
              }}>{lastWasWin ? "Won" : "Lost"}</span>
              {lastMatch.date && (
                <span style={{ color: t.textTertiary, marginLeft: 6 }}>· {lastMatch.date}</span>
              )}
            </span>
          )}
          <div style={{ flex: 1 }} />
          {openChallenge && (
            <button
              onClick={onRematch}
              style={{
                flexShrink: 0,
                padding: "12px 22px",
                background: t.text,
                color: t.bg,
                border: "none",
                fontSize: 12, fontWeight: 700,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                cursor: "pointer",
                transition: "opacity 0.15s",
              }}
              onMouseEnter={function (e) { e.currentTarget.style.opacity = "0.85"; }}
              onMouseLeave={function (e) { e.currentTarget.style.opacity = "1"; }}>
              Rematch
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
