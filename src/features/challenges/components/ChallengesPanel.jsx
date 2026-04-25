// src/features/challenges/components/ChallengesPanel.jsx
//
// The "Challenges" sub-tab content for the People page. Three sections:
// Incoming pending → Outgoing pending → Accepted (ready to play). Each row
// is a small card with the partner identity, the proposed details (if any),
// and the right action buttons.
//
// Design intent: this is a coordination inbox, not a chat. If users want to
// negotiate logistics they can DM. We deliberately don't add comments on
// challenges.

import { useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import PlayerAvatar from "../../../components/ui/PlayerAvatar.jsx";
import { useDeepLinkHighlight } from "../../../lib/utils/deepLink.js";

function fmtProposedAt(iso) {
  if (!iso) return null;
  var d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  return d.toLocaleString("en-AU", {
    weekday: "short", day: "numeric", month: "short",
    hour: "numeric", minute: "2-digit",
  });
}

function ChallengeRow({ c, t, partner, openProfile, leftActions, rightActions, rowAnchor }) {
  function goPartner() { if (openProfile && partner && partner.id) openProfile(partner.id); }
  return (
    <div {...(rowAnchor || {})} style={{
      borderTop: "1px solid " + t.border,
      paddingTop: 14, paddingBottom: 14,
      display: "flex", flexDirection: "column", gap: 10,
    }}>
      {/* Identity */}
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div
          onClick={goPartner}
          style={{ flexShrink: 0, cursor: openProfile ? "pointer" : "default" }}>
          <PlayerAvatar name={partner && partner.name} avatar={partner && partner.avatar} profile={partner} size={38} />
        </div>
        <div onClick={goPartner} style={{ flex: 1, minWidth: 0, cursor: openProfile ? "pointer" : "default" }}>
          <div style={{
            fontSize: 15, fontWeight: 800, color: t.text,
            letterSpacing: "-0.2px", lineHeight: 1.1,
          }}>
            {(partner && partner.name) || "Player"}
          </div>
          {((partner && partner.suburb) || (partner && partner.skill)) && (
            <div style={{
              fontSize: 9, fontWeight: 800, letterSpacing: "0.16em",
              textTransform: "uppercase", color: t.textTertiary,
              marginTop: 4,
            }}>
              {[(partner && partner.suburb), (partner && partner.skill)].filter(Boolean).join(" · ")}
            </div>
          )}
        </div>
        {leftActions}
      </div>

      {/* Proposed details — hairline mini-grid, no fill */}
      {(c.proposed_at || c.venue || c.court || c.message) && (
        <div style={{
          paddingTop: 8,
          borderTop: "1px solid " + t.border,
          fontSize: 12, color: t.textSecondary, lineHeight: 1.5,
          letterSpacing: "-0.1px",
        }}>
          {c.proposed_at && (
            <div style={{ marginBottom: 4, display: "flex", gap: 8, alignItems: "baseline" }}>
              <span style={{
                fontSize: 9, fontWeight: 800, letterSpacing: "0.16em",
                textTransform: "uppercase", color: t.textTertiary,
                width: 48, flexShrink: 0,
              }}>When</span>
              <span style={{ color: t.text }}>{fmtProposedAt(c.proposed_at) || c.proposed_at}</span>
            </div>
          )}
          {(c.venue || c.court) && (
            <div style={{ marginBottom: c.message ? 4 : 0, display: "flex", gap: 8, alignItems: "baseline" }}>
              <span style={{
                fontSize: 9, fontWeight: 800, letterSpacing: "0.16em",
                textTransform: "uppercase", color: t.textTertiary,
                width: 48, flexShrink: 0,
              }}>Where</span>
              <span style={{ color: t.text }}>{[c.venue, c.court].filter(Boolean).join(" · ")}</span>
            </div>
          )}
          {c.message && (
            <div style={{ fontStyle: "italic", marginTop: 6, color: t.text, letterSpacing: "-0.1px" }}>
              "{c.message}"
            </div>
          )}
        </div>
      )}

      {/* Action buttons row */}
      {rightActions && (
        <div style={{ display: "flex", gap: 8, marginTop: 2 }}>{rightActions}</div>
      )}
    </div>
  );
}

// Shared button styles for the action row — keeps every row visually tied
// to the rest of the editorial pass.
function rowButtonPrimary(t, color, busy) {
  return {
    flex: 1, padding: "11px 12px", borderRadius: 8, border: "none",
    background: color, color: "#fff",
    fontSize: 11, fontWeight: 800,
    letterSpacing: "0.12em", textTransform: "uppercase",
    cursor: busy ? "default" : "pointer", opacity: busy ? 0.6 : 1,
  };
}
function rowButtonSecondary(t, busy) {
  return {
    padding: "11px 14px", borderRadius: 8,
    border: "1px solid " + t.border, background: "transparent",
    color: t.textSecondary,
    fontSize: 11, fontWeight: 800,
    letterSpacing: "0.12em", textTransform: "uppercase",
    cursor: busy ? "default" : "pointer", opacity: busy ? 0.6 : 1,
  };
}

export default function ChallengesPanel({
  t, authUser, challenges, profileMap, loading, openProfile,
  acceptChallenge, declineChallenge, cancelChallenge,
  onLogConvertedMatch,   // (challenge, partnerProfile) => void  — opens ScoreModal prefilled
  toast,                 // optional — non-blocking error reporter
  // Module 4 — when there are no challenges, turn the empty state into a
  // friends-list so the user has a one-tap path into the challenge composer
  // instead of being told "go to a profile and tap Challenge".
  friends, openChallenge,
}) {
  function reportErr(msg) { if (toast) toast(msg, "error"); else window.alert(msg); }
  if (!authUser) return null;

  // Deep link — if we arrived here from tapping a challenge_received /
  // accepted / expired / declined notification, scroll to + pulse the
  // row so the user doesn't have to hunt for it in three sections.
  var deepLink = useDeepLinkHighlight("highlightChallengeId");

  // Auto-open the score modal when we arrive with `logChallengeId` in
  // location.state — this is the deep link the challenge_accepted
  // notification uses, so the "Log result →" CTA in the tray takes the
  // user straight into the score flow instead of dropping them on the
  // challenges list and making them find the row + tap again.
  var location = useLocation();
  var navigate = useNavigate();
  var autoLoggedRef = useRef({});
  useEffect(function () {
    var logId = location.state && location.state.logChallengeId;
    if (!logId) return;
    if (autoLoggedRef.current[logId]) return;
    var c = challenges.find(function (x) { return x.id === logId && x.status === "accepted"; });
    if (!c || !onLogConvertedMatch) return;
    var pid = c.challenger_id === authUser.id ? c.challenged_id : c.challenger_id;
    var partner = profileMap[pid] || { id: pid, name: "Player" };
    autoLoggedRef.current[logId] = true;
    onLogConvertedMatch(c, partner);
    // Clear the state so a refresh doesn't reopen the modal.
    navigate(location.pathname, { replace: true, state: { highlightChallengeId: logId } });
  }, [location.state, challenges, profileMap, authUser && authUser.id]);

  var incoming = challenges.filter(function (c) { return c.status === "pending" && c.challenged_id === authUser.id; });
  var outgoing = challenges.filter(function (c) { return c.status === "pending" && c.challenger_id === authUser.id; });
  var accepted = challenges.filter(function (c) { return c.status === "accepted"; });

  function partnerOf(c) {
    var pid = c.challenger_id === authUser.id ? c.challenged_id : c.challenger_id;
    return profileMap[pid] || { id: pid, name: "Player" };
  }
  function busy(id) { return !!(loading && loading[id]); }

  if (!incoming.length && !outgoing.length && !accepted.length) {
    var friendsList = Array.isArray(friends) ? friends : [];
    // No challenges AND no friends → original empty state (nothing to act on).
    if (!friendsList.length || !openChallenge) {
      return (
        <div style={{ textAlign: "center", padding: "60px 20px" }}>
          <div style={{ fontSize: 36, marginBottom: 14 }}>🎾</div>
          <div style={{
            fontSize: 9, fontWeight: 800, letterSpacing: "0.16em",
            textTransform: "uppercase", color: t.textTertiary,
            marginBottom: 8,
          }}>No challenges</div>
          <div style={{
            fontSize: 22, fontWeight: 800, color: t.text,
            letterSpacing: "-0.6px", lineHeight: 1.05,
            marginBottom: 10,
          }}>Nothing yet.</div>
          <div style={{
            fontSize: 13, color: t.textSecondary, lineHeight: 1.5,
            maxWidth: 320, margin: "0 auto", letterSpacing: "-0.1px",
          }}>
            Open a friend's profile and tap <strong>Challenge</strong> to set up a match. You can also rematch from any confirmed match card on the feed.
          </div>
        </div>
      );
    }
    // No challenges BUT have friends → show friends list with a one-tap
    // Challenge button per row. Reduces the path from "want to play → played"
    // from 3 taps (open People → open profile → tap Challenge) to 1 tap.
    return (
      <div>
        <div style={{
          fontSize: 9, fontWeight: 800, letterSpacing: "0.16em",
          textTransform: "uppercase", color: t.textTertiary,
          marginBottom: 8,
        }}>
          Start a challenge
        </div>
        <div style={{
          fontSize: 13, color: t.textSecondary, marginBottom: 18,
          lineHeight: 1.5, letterSpacing: "-0.1px",
        }}>
          No active challenges. Tap a friend below to set up a match.
        </div>
        {friendsList.map(function (f) {
          return (
            <div key={f.id} style={{
              borderTop: "1px solid " + t.border,
              paddingTop: 12, paddingBottom: 12,
              display: "flex", alignItems: "center", gap: 12,
            }}>
              <div
                onClick={function () { if (openProfile) openProfile(f.id); }}
                style={{ flexShrink: 0, cursor: openProfile ? "pointer" : "default" }}>
                <PlayerAvatar name={f.name} avatar={f.avatar} profile={f} size={36} />
              </div>
              <div
                onClick={function () { if (openProfile) openProfile(f.id); }}
                style={{ flex: 1, minWidth: 0, cursor: openProfile ? "pointer" : "default" }}>
                <div style={{
                  fontSize: 14, fontWeight: 800, color: t.text,
                  letterSpacing: "-0.2px",
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                }}>
                  {f.name || "Player"}
                </div>
                {(f.suburb || f.skill) && (
                  <div style={{
                    fontSize: 9, fontWeight: 800, letterSpacing: "0.16em",
                    textTransform: "uppercase", color: t.textTertiary,
                    marginTop: 4,
                  }}>
                    {[f.suburb, f.skill].filter(Boolean).join(" · ")}
                  </div>
                )}
              </div>
              <button
                onClick={function () { openChallenge(f, "profile"); }}
                style={{
                  flexShrink: 0, padding: "9px 14px", borderRadius: 6, border: "none",
                  background: t.accent, color: "#fff",
                  fontSize: 10, fontWeight: 800,
                  letterSpacing: "0.12em", textTransform: "uppercase",
                  cursor: "pointer",
                }}>
                Challenge
              </button>
            </div>
          );
        })}
      </div>
    );
  }

  // Section eyebrow — strong ALL-CAPS tag + tabular count.
  function sectionEyebrow(label, count) {
    return (
      <div style={{
        display: "flex", alignItems: "baseline", gap: 8,
        marginBottom: 4,
      }}>
        <span style={{
          fontSize: 10, fontWeight: 800, letterSpacing: "0.16em",
          textTransform: "uppercase", color: t.text,
        }}>{label}</span>
        <span style={{
          fontSize: 10, fontWeight: 800, letterSpacing: "0.12em",
          color: t.textTertiary, fontVariantNumeric: "tabular-nums",
        }}>· {count}</span>
      </div>
    );
  }

  return (
    <div>
      {incoming.length > 0 && (
        <div style={{ marginBottom: 28 }}>
          {sectionEyebrow("Incoming", incoming.length)}
          {incoming.map(function (c) {
            var p = partnerOf(c);
            return (
              <ChallengeRow
                key={c.id} c={c} t={t} partner={p} openProfile={openProfile} rowAnchor={deepLink.rowProps(c.id)}
                rightActions={<>
                  <button disabled={busy(c.id)}
                    onClick={async function () { var r = await acceptChallenge(c); if (r && r.error) reportErr(r.error); }}
                    style={rowButtonPrimary(t, t.green, busy(c.id))}>
                    Accept
                  </button>
                  <button disabled={busy(c.id)}
                    onClick={async function () { var r = await declineChallenge(c); if (r && r.error) reportErr(r.error); }}
                    style={Object.assign({}, rowButtonSecondary(t, busy(c.id)), { flex: 1, padding: "11px 12px" })}>
                    Decline
                  </button>
                </>}
              />
            );
          })}
        </div>
      )}

      {accepted.length > 0 && (
        <div style={{ marginBottom: 28 }}>
          {sectionEyebrow("Ready to play", accepted.length)}
          {accepted.map(function (c) {
            var p = partnerOf(c);
            return (
              <ChallengeRow
                key={c.id} c={c} t={t} partner={p} openProfile={openProfile} rowAnchor={deepLink.rowProps(c.id)}
                rightActions={<>
                  {/* Mutually accepted — only action now is to log the result
                      once played. Replaces the old Accept/Decline/Counter
                      trio because those choices have already been resolved. */}
                  <button
                    onClick={function () { if (onLogConvertedMatch) onLogConvertedMatch(c, p); }}
                    style={rowButtonPrimary(t, t.accent, false)}>
                    Log match info
                  </button>
                  <button disabled={busy(c.id)}
                    onClick={async function () { if (window.confirm("Cancel this challenge?")) { var r = await cancelChallenge(c); if (r && r.error) reportErr(r.error); } }}
                    style={rowButtonSecondary(t, busy(c.id))}>
                    Cancel
                  </button>
                </>}
              />
            );
          })}
        </div>
      )}

      {outgoing.length > 0 && (
        <div>
          {sectionEyebrow("Sent", outgoing.length)}
          {outgoing.map(function (c) {
            var p = partnerOf(c);
            return (
              <ChallengeRow
                key={c.id} c={c} t={t} partner={p} openProfile={openProfile} rowAnchor={deepLink.rowProps(c.id)}
                rightActions={<>
                  <span style={{
                    flex: 1, padding: "11px 12px", textAlign: "center",
                    color: t.textTertiary,
                    fontSize: 9, fontWeight: 800, letterSpacing: "0.16em",
                    textTransform: "uppercase",
                  }}>
                    Awaiting response
                  </span>
                  <button disabled={busy(c.id)}
                    onClick={async function () { if (window.confirm("Cancel this challenge?")) { var r = await cancelChallenge(c); if (r && r.error) reportErr(r.error); } }}
                    style={rowButtonSecondary(t, busy(c.id))}>
                    Cancel
                  </button>
                </>}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
