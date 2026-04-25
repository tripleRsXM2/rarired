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
    <div>
      <div style={{
        fontSize: 11, fontWeight: 700, color: t.textTertiary,
        textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 10,
      }}>
        Rivalry
      </div>

      <div style={{
        background: t.bgCard,
        border: "1px solid " + t.border,
        borderRadius: 12,
        padding: "16px 18px",
        display: "flex", flexDirection: "column", gap: 14,
      }}>
        {/* Identity row — avatar + name + a "you lead / they lead / even" line */}
        <div
          onClick={openProfile ? onTapOpponent : undefined}
          style={{
            display: "flex", alignItems: "center", gap: 12,
            cursor: openProfile ? "pointer" : "default",
            minWidth: 0,
          }}>
          <div style={{
            width: 44, height: 44, borderRadius: "50%", flexShrink: 0,
            background: avColor(rival.opponentName),
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 14, fontWeight: 800, color: "#fff",
          }}>
            {(rival.opponentName || "?").slice(0, 2).toUpperCase()}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontSize: 15, fontWeight: 700, color: t.text,
              letterSpacing: "-0.1px", lineHeight: 1.2,
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            }}>
              {rival.opponentName}
            </div>
            <div style={{
              fontSize: 11, color: t.textTertiary, marginTop: 3,
              letterSpacing: "0.01em",
            }}>
              {iLead     ? "You lead" :
               theyLead  ? "They lead" :
                           "Even"}
              {" · "}
              {h2h.totalMatches} match{h2h.totalMatches !== 1 ? "es" : ""} played
            </div>
          </div>
        </div>

        {/* H2H score block — wins on each side, mirroring the public-profile
            head-to-head card so the rhythm is consistent. */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          background: t.bg,
          border: "1px solid " + t.border,
          padding: "10px 14px",
          borderRadius: 10,
        }}>
          <div style={{ textAlign: "center", flex: 1 }}>
            <div style={{
              fontSize: 9, fontWeight: 700, color: t.textTertiary,
              textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4,
            }}>
              You
            </div>
            <div style={{
              fontSize: 24, fontWeight: 800,
              color: iLead ? t.green : t.text,
              fontVariantNumeric: "tabular-nums", letterSpacing: "-0.4px", lineHeight: 1,
            }}>
              {h2h.viewerWins}
            </div>
          </div>
          <div style={{
            fontSize: 12, color: t.textTertiary, fontWeight: 400,
            alignSelf: "center", padding: "0 8px",
          }}>
            —
          </div>
          <div style={{ textAlign: "center", flex: 1, minWidth: 0 }}>
            <div style={{
              fontSize: 9, fontWeight: 700, color: t.textTertiary,
              textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4,
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            }}>
              {rival.opponentName}
            </div>
            <div style={{
              fontSize: 24, fontWeight: 800,
              color: theyLead ? t.green : t.text,
              fontVariantNumeric: "tabular-nums", letterSpacing: "-0.4px", lineHeight: 1,
            }}>
              {h2h.subjectWins}
            </div>
          </div>
        </div>

        {/* Footer: last result chip + rematch CTA */}
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {lastMatch && (
            <span style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              fontSize: 11, color: t.textSecondary,
            }}>
              <span style={{
                fontSize: 10, fontWeight: 700, letterSpacing: "0.06em",
                textTransform: "uppercase",
                padding: "3px 7px", borderRadius: 0,
                background: lastWasWin ? t.greenSubtle : t.redSubtle,
                color:      lastWasWin ? t.green       : t.red,
                border: "1px solid " + (lastWasWin ? t.green : t.red) + "33",
              }}>
                Last: {lastWasWin ? "Won" : "Lost"}
              </span>
              {lastMatch.date && (
                <span style={{ color: t.textTertiary }}>{lastMatch.date}</span>
              )}
            </span>
          )}
          <div style={{ flex: 1 }} />
          {openChallenge && (
            <button
              onClick={onRematch}
              style={{
                flexShrink: 0,
                padding: "9px 16px",
                borderRadius: 8,
                border: "none",
                background: t.accent, color: "#fff",
                fontSize: 12, fontWeight: 700,
                letterSpacing: "0.02em",
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
