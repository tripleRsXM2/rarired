// src/features/pacts/pages/PactsTab.jsx
//
// TINDIS — the matchmaking tab. Three sub-panels:
//   • Active     — proposed, confirmed, or booked pacts the viewer is in
//   • Open courts — unclaimed postings in the viewer's zone
//   • History     — played / cancelled / expired
//
// Nav-mounted one slot ahead of Feed (see Sidebar NAV_ITEMS + TABS).

import { useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import PlayerAvatar from "../../../components/ui/PlayerAvatar.jsx";
import PactCard from "../components/PactCard.jsx";
import CreatePactModal from "../components/CreatePactModal.jsx";
import { ZONE_BY_ID } from "../../map/data/zones.js";
import { track } from "../../../lib/analytics.js";

function formatWhen(iso) {
  if (!iso) return "";
  var d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-AU", {
    weekday: "short", day: "numeric", month: "short",
    hour: "numeric", minute: "2-digit",
  });
}

var VALID_SUBS = ["active", "open", "history"];

export default function PactsTab(props) {
  var t = props.t;
  var authUser = props.authUser;
  var profile  = props.profile;
  var friends  = props.friends || [];
  var pacts    = (props.pacts && props.pacts.pacts) || [];
  var openCourts = (props.pacts && props.pacts.openCourts) || [];
  var profileMap = (props.pacts && props.pacts.profileMap) || {};
  var loading  = props.pacts && props.pacts.loading;
  var proposePact = props.pacts && props.pacts.proposePact;
  var agreeToPact = props.pacts && props.pacts.agreeToPact;
  var bookPact    = props.pacts && props.pacts.bookPact;
  var setPaid     = props.pacts && props.pacts.setPaid;
  var cancelPact  = props.pacts && props.pacts.cancelPact;
  var claimOpen   = props.pacts && props.pacts.claimOpenPact;

  var location = useLocation();
  var navigate = useNavigate();
  var pathParts = location.pathname.split("/").filter(Boolean);
  var sub = pathParts[1] && VALID_SUBS.indexOf(pathParts[1]) >= 0 ? pathParts[1] : "active";

  function setSub(s) { navigate("/tindis/" + s); }

  var [showCreate, setShowCreate] = useState(false);

  // Partition pacts by lifecycle bucket.
  var buckets = useMemo(function () {
    var active = [], history = [];
    (pacts || []).forEach(function (p) {
      if (p.status === "proposed" || p.status === "confirmed" || p.status === "booked") {
        active.push(p);
      } else {
        history.push(p);
      }
    });
    // Active: nearest upcoming first; History: most recent first.
    active.sort(function (a, b) { return (a.scheduled_at || "").localeCompare(b.scheduled_at || ""); });
    history.sort(function (a, b) { return (b.updated_at || b.scheduled_at || "").localeCompare(a.updated_at || a.scheduled_at || ""); });
    return { active: active, history: history };
  }, [pacts]);

  var activeCount = buckets.active.length;
  var openCount   = openCourts.length;

  function openCreate() {
    setShowCreate(true);
    track("pact_create_opened", { from: sub });
  }

  var subTabs = [
    { id: "active",  label: "Active",       count: activeCount || null },
    { id: "open",    label: "Open courts",  count: openCount   || null },
    { id: "history", label: "History",      count: null },
  ];

  return (
    <div>
      {/* Sub-tab bar */}
      <div style={{ display: "flex", borderBottom: "1px solid " + t.border, padding: "0 20px", overflowX: "auto" }}>
        {subTabs.map(function (tb) {
          var on = sub === tb.id;
          return (
            <button key={tb.id} onClick={function () { setSub(tb.id); }}
              style={{
                padding: "10px 0", marginRight: 20, border: "none", background: "transparent",
                color: on ? t.accent : t.textTertiary, fontSize: 13, fontWeight: on ? 700 : 400,
                borderBottom: "2px solid " + (on ? t.accent : "transparent"),
                marginBottom: "-1px", display: "flex", gap: 5, alignItems: "center", flexShrink: 0,
                cursor: "pointer",
              }}>
              {tb.label}
              {tb.count > 0 && (
                <span style={{ fontSize: 10, fontWeight: 800, color: on ? t.accent : t.textTertiary,
                  background: on ? t.accentSubtle : t.bgTertiary, padding: "1px 6px", borderRadius: 10 }}>
                  {tb.count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Hero / header */}
      <div style={{ maxWidth: 680, margin: "0 auto", padding: "24px 20px 8px" }}>
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 12, marginBottom: 14 }}>
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 800, color: t.text, letterSpacing: "-0.5px", margin: 0 }}>
              TINDIS
            </h1>
            <div style={{ fontSize: 12, color: t.textSecondary, marginTop: 3 }}>
              Plan a match, agree, book, and split the court fee — all without handing money through the app.
            </div>
          </div>
          <button onClick={openCreate}
            style={{ padding: "9px 16px", borderRadius: 8, border: "none", background: t.accent, color: t.accentText, fontSize: 13, fontWeight: 700, cursor: "pointer", letterSpacing: "-0.01em", flexShrink: 0 }}>
            + New pact
          </button>
        </div>

        {/* Active */}
        {sub === "active" && (
          <div>
            {loading && buckets.active.length === 0 && (
              <div style={{ padding: 16, color: t.textTertiary, fontSize: 12 }}>Loading…</div>
            )}
            {!loading && buckets.active.length === 0 && (
              <div style={{ textAlign: "center", padding: "36px 20px", border: "1px dashed " + t.border, borderRadius: 10 }}>
                <div style={{ fontSize: 30, marginBottom: 8 }}>🎾</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: t.text, marginBottom: 4 }}>
                  No active pacts
                </div>
                <div style={{ fontSize: 12, color: t.textSecondary, lineHeight: 1.5, maxWidth: 320, margin: "0 auto 12px" }}>
                  Start one with a friend, or post an open court in your zone.
                </div>
                <button onClick={openCreate}
                  style={{ padding: "8px 16px", borderRadius: 8, border: "none", background: t.accent, color: t.accentText, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                  + New pact
                </button>
              </div>
            )}
            {buckets.active.map(function (p) {
              return (
                <PactCard key={p.id} t={t} authUser={authUser} pact={p} profileMap={profileMap}
                  onAgree={agreeToPact} onBook={bookPact} onCancel={cancelPact} onSetPaid={setPaid}
                  onOpenProfile={props.openProfile}/>
              );
            })}
          </div>
        )}

        {/* Open courts */}
        {sub === "open" && (
          <div>
            <div style={{ fontSize: 11, color: t.textTertiary, marginBottom: 10, lineHeight: 1.5 }}>
              Open postings in your zone ({(ZONE_BY_ID[profile && profile.home_zone] && ZONE_BY_ID[profile && profile.home_zone].name) || "no home zone set"}).
              Claim one to convert it to a mutual pact.
            </div>
            {openCourts.length === 0 && (
              <div style={{ padding: "28px 20px", border: "1px dashed " + t.border, borderRadius: 10, textAlign: "center" }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: t.text, marginBottom: 4 }}>No open courts right now</div>
                <div style={{ fontSize: 12, color: t.textSecondary, lineHeight: 1.5, maxWidth: 340, margin: "0 auto 12px" }}>
                  Be the first — post an open court for someone in your zone to claim.
                </div>
                <button onClick={openCreate}
                  style={{ padding: "8px 16px", borderRadius: 8, border: "none", background: t.accent, color: t.accentText, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                  + Post an open court
                </button>
              </div>
            )}
            {openCourts.map(function (p) {
              var author = profileMap[p.proposer_id] || { id: p.proposer_id, name: "Player" };
              var isMine = p.proposer_id === (authUser && authUser.id);
              return (
                <div key={p.id} className="fade-up" style={{
                  background: t.bgCard, border: "1px solid " + t.border, borderRadius: 10,
                  padding: "12px 14px", marginBottom: 10,
                  display: "flex", gap: 10, alignItems: "center",
                }}>
                  <PlayerAvatar name={author.name} avatar={author.avatar} avatarUrl={author.avatar_url} size={36}/>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: t.text }}>
                      {author.name}{isMine ? " (you)" : ""}
                      {p.skill ? <span style={{ marginLeft: 8, fontSize: 10, fontWeight: 600, color: t.textTertiary, background: t.bgTertiary, padding: "1px 6px", borderRadius: 10 }}>{p.skill}</span> : null}
                    </div>
                    <div style={{ fontSize: 12, color: t.textSecondary, marginTop: 2 }}>
                      {p.venue}{p.court ? " · Court " + p.court : ""}
                    </div>
                    <div style={{ fontSize: 11, color: t.textTertiary, marginTop: 2 }}>
                      {formatWhen(p.scheduled_at)}
                      {p.total_cost_cents != null ? (" · $" + (p.total_cost_cents/100).toFixed(0) + " court fee") : ""}
                    </div>
                    {p.message && (
                      <div style={{ fontSize: 11, color: t.textSecondary, fontStyle: "italic", marginTop: 4 }}>
                        "{p.message}"
                      </div>
                    )}
                  </div>
                  {!isMine && (
                    <button onClick={function () { claimOpen && claimOpen(p); }}
                      style={{ padding: "8px 14px", borderRadius: 6, border: "none", background: t.accent, color: t.accentText, fontSize: 12, fontWeight: 700, cursor: "pointer", flexShrink: 0, letterSpacing: "-0.01em" }}>
                      Claim
                    </button>
                  )}
                  {isMine && (
                    <button onClick={function () { cancelPact && cancelPact(p); }}
                      style={{ padding: "8px 12px", borderRadius: 6, border: "1px solid " + t.border, background: "transparent", color: t.textSecondary, fontSize: 11, fontWeight: 600, cursor: "pointer", flexShrink: 0 }}>
                      Cancel
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* History */}
        {sub === "history" && (
          <div>
            {buckets.history.length === 0 && (
              <div style={{ padding: "28px 20px", border: "1px dashed " + t.border, borderRadius: 10, textAlign: "center" }}>
                <div style={{ fontSize: 12, color: t.textSecondary, lineHeight: 1.5 }}>
                  Completed, cancelled, and expired pacts will live here.
                </div>
              </div>
            )}
            {buckets.history.map(function (p) {
              return (
                <PactCard key={p.id} t={t} authUser={authUser} pact={p} profileMap={profileMap}
                  onAgree={agreeToPact} onBook={bookPact} onCancel={cancelPact} onSetPaid={setPaid}
                  onOpenProfile={props.openProfile}/>
              );
            })}
          </div>
        )}
      </div>

      {showCreate && (
        <CreatePactModal
          t={t} authUser={authUser} profile={profile} friends={friends}
          onClose={function () { setShowCreate(false); }}
          onPropose={proposePact}/>
      )}
    </div>
  );
}
