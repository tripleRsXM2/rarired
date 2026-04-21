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

import { avColor } from "../../../lib/utils/avatar.js";

function fmtProposedAt(iso) {
  if (!iso) return null;
  var d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  return d.toLocaleString("en-AU", {
    weekday: "short", day: "numeric", month: "short",
    hour: "numeric", minute: "2-digit",
  });
}

function ChallengeRow({ c, t, partner, openProfile, leftActions, rightActions }) {
  function goPartner() { if (openProfile && partner && partner.id) openProfile(partner.id); }
  return (
    <div style={{
      background: t.bgCard, border: "1px solid " + t.border, borderRadius: 12,
      padding: "14px 16px", marginBottom: 8,
      display: "flex", flexDirection: "column", gap: 10,
    }}>
      {/* Identity */}
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div
          onClick={goPartner}
          style={{
            width: 38, height: 38, borderRadius: "50%",
            background: avColor((partner && partner.name) || "?"),
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 12, fontWeight: 700, color: "#fff", flexShrink: 0,
            cursor: openProfile ? "pointer" : "default",
          }}>
          {((partner && (partner.avatar || partner.name)) || "?").slice(0, 2).toUpperCase()}
        </div>
        <div onClick={goPartner} style={{ flex: 1, minWidth: 0, cursor: openProfile ? "pointer" : "default" }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: t.text }}>
            {(partner && partner.name) || "Player"}
          </div>
          <div style={{ fontSize: 11, color: t.textTertiary, marginTop: 1 }}>
            {[(partner && partner.suburb), (partner && partner.skill)].filter(Boolean).join(" · ")}
          </div>
        </div>
        {leftActions}
      </div>

      {/* Proposed details — only render if at least one field has content */}
      {(c.proposed_at || c.venue || c.court || c.message) && (
        <div style={{
          background: t.bgTertiary, borderRadius: 8, padding: "10px 12px",
          fontSize: 12, color: t.textSecondary, lineHeight: 1.5,
        }}>
          {c.proposed_at && (
            <div style={{ marginBottom: 4 }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: t.textTertiary, textTransform: "uppercase", letterSpacing: "0.06em" }}>When · </span>
              {fmtProposedAt(c.proposed_at) || c.proposed_at}
            </div>
          )}
          {(c.venue || c.court) && (
            <div style={{ marginBottom: c.message ? 4 : 0 }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: t.textTertiary, textTransform: "uppercase", letterSpacing: "0.06em" }}>Where · </span>
              {[c.venue, c.court].filter(Boolean).join(" · ")}
            </div>
          )}
          {c.message && (
            <div style={{ fontStyle: "italic", marginTop: 4, color: t.text }}>
              "{c.message}"
            </div>
          )}
        </div>
      )}

      {/* Action buttons row */}
      {rightActions && (
        <div style={{ display: "flex", gap: 6 }}>{rightActions}</div>
      )}
    </div>
  );
}

export default function ChallengesPanel({
  t, authUser, challenges, profileMap, loading, openProfile,
  acceptChallenge, declineChallenge, cancelChallenge,
  onLogConvertedMatch,   // (challenge) => void  — opens ScoreModal prefilled
  toast,                 // optional — non-blocking error reporter
}) {
  function reportErr(msg) { if (toast) toast(msg, "error"); else window.alert(msg); }
  if (!authUser) return null;

  var incoming = challenges.filter(function (c) { return c.status === "pending" && c.challenged_id === authUser.id; });
  var outgoing = challenges.filter(function (c) { return c.status === "pending" && c.challenger_id === authUser.id; });
  var accepted = challenges.filter(function (c) { return c.status === "accepted"; });

  function partnerOf(c) {
    var pid = c.challenger_id === authUser.id ? c.challenged_id : c.challenger_id;
    return profileMap[pid] || { id: pid, name: "Player" };
  }
  function busy(id) { return !!(loading && loading[id]); }

  if (!incoming.length && !outgoing.length && !accepted.length) {
    return (
      <div style={{ textAlign: "center", padding: "48px 20px" }}>
        <div style={{ fontSize: 36, marginBottom: 12 }}>🎾</div>
        <div style={{ fontSize: 16, fontWeight: 700, color: t.text, marginBottom: 6 }}>No challenges yet</div>
        <div style={{ fontSize: 13, color: t.textSecondary, lineHeight: 1.5, maxWidth: 320, margin: "0 auto" }}>
          Open a friend's profile and tap <strong>Challenge</strong> to set up a match.
          You can also rematch from any confirmed match card on the feed.
        </div>
      </div>
    );
  }

  return (
    <div>
      {incoming.length > 0 && (
        <div style={{ marginBottom: 22 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: t.textTertiary, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 12 }}>
            Incoming · {incoming.length}
          </div>
          {incoming.map(function (c) {
            var p = partnerOf(c);
            return (
              <ChallengeRow
                key={c.id} c={c} t={t} partner={p} openProfile={openProfile}
                rightActions={<>
                  <button disabled={busy(c.id)}
                    onClick={async function () { var r = await acceptChallenge(c); if (r && r.error) reportErr(r.error); }}
                    style={{ flex: 1, padding: "10px", borderRadius: 8, border: "none", background: t.green, color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", opacity: busy(c.id) ? 0.6 : 1 }}>
                    Accept
                  </button>
                  <button disabled={busy(c.id)}
                    onClick={async function () { var r = await declineChallenge(c); if (r && r.error) reportErr(r.error); }}
                    style={{ flex: 1, padding: "10px", borderRadius: 8, border: "1px solid " + t.border, background: "transparent", color: t.textSecondary, fontSize: 13, fontWeight: 500, cursor: "pointer", opacity: busy(c.id) ? 0.6 : 1 }}>
                    Decline
                  </button>
                </>}
              />
            );
          })}
        </div>
      )}

      {accepted.length > 0 && (
        <div style={{ marginBottom: 22 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: t.textTertiary, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 12 }}>
            Ready to play · {accepted.length}
          </div>
          {accepted.map(function (c) {
            var p = partnerOf(c);
            return (
              <ChallengeRow
                key={c.id} c={c} t={t} partner={p} openProfile={openProfile}
                rightActions={<>
                  <button
                    onClick={function () { if (onLogConvertedMatch) onLogConvertedMatch(c, p); }}
                    style={{ flex: 1, padding: "10px", borderRadius: 8, border: "none", background: t.accent, color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                    Log result
                  </button>
                  <button disabled={busy(c.id)}
                    onClick={async function () { if (window.confirm("Cancel this challenge?")) { var r = await cancelChallenge(c); if (r && r.error) reportErr(r.error); } }}
                    style={{ padding: "10px 14px", borderRadius: 8, border: "1px solid " + t.border, background: "transparent", color: t.textSecondary, fontSize: 13, fontWeight: 500, cursor: "pointer", opacity: busy(c.id) ? 0.6 : 1 }}>
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
          <div style={{ fontSize: 10, fontWeight: 700, color: t.textTertiary, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 12 }}>
            Sent · {outgoing.length}
          </div>
          {outgoing.map(function (c) {
            var p = partnerOf(c);
            return (
              <ChallengeRow
                key={c.id} c={c} t={t} partner={p} openProfile={openProfile}
                rightActions={<>
                  <span style={{ flex: 1, padding: "10px", textAlign: "center", color: t.textTertiary, fontSize: 12, fontWeight: 500 }}>
                    Awaiting response
                  </span>
                  <button disabled={busy(c.id)}
                    onClick={async function () { if (window.confirm("Cancel this challenge?")) { var r = await cancelChallenge(c); if (r && r.error) reportErr(r.error); } }}
                    style={{ padding: "10px 14px", borderRadius: 8, border: "1px solid " + t.border, background: "transparent", color: t.textSecondary, fontSize: 13, fontWeight: 500, cursor: "pointer", opacity: busy(c.id) ? 0.6 : 1 }}>
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
