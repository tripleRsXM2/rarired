// src/features/tournaments/pages/CompeteHub.jsx
//
// Editorial Tennis "Compete v2" hub — supersedes the v1 carousel
// + explore-types layout. v2 design intent (see
// design_handoff_courtsync_compete_v2/README.md):
//
//   v1 carousel of active comps         → hero card + stacked minis
//   v1 three explore-types rows         → single "+" bottom sheet
//   v1 rank #2 was the visual hero      → competition NAME is hero
//   v1 last match as a small line       → colored score chip on hero
//   v1 two equal-weight CTAs            → one big challenge CTA
//   v1 no alerts surface                → "Needs your attention" banner
//
// Page hierarchy (top → bottom):
//   1. Hero header (kicker + 72px "Compete")
//   2. AttentionBanner — only when alerts.length > 0
//   3. SectionHead "Active · {n}"
//   4. HeroActiveCard (active[0]) + MiniActiveCard list (active[1..])
//      OR empty-state dashed card when active.length === 0
//   5. PrimaryCTA — "+ Challenge someone" + secondary text links
//   6. SectionHead "Past · {n}" with Show/Hide toggle
//   7. PastList (collapsed by default)
//   8. PlusSheet — bottom sheet, opens from any CTA
//
// Wiring:
//   - ACTIVE = active leagues (my_status=active, lifecycle isActive)
//     + entered tournaments (status not completed/cancelled)
//     + accepted challenges where viewer is challenger or challenged
//   - PAST  = leagues passing isPastLifecycle (completed/cancelled/archived)
//   - ATTENTION = matches where pendingActionBy === viewerId (need
//     viewer's response) + incoming pending challenges
//   - PlusSheet routes:
//       Challenge  → /tournaments/challenges (existing creation flow)
//       League     → opens the existing CreateLeagueModal
//       Tournament → /tournaments/list (existing browse page)

import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import CreateLeagueModal from "../../leagues/components/CreateLeagueModal.jsx";
import { isActive, isPastLifecycle, LIFECYCLE_LABELS } from "../../leagues/utils/leagueLifecycle.js";
import { ED_TOK } from "../../home/components/EditorialScreen.jsx";

// ── Page ─────────────────────────────────────────────────────────

export default function CompeteHub({
  t,
  authUser,
  challenges,
  leagues,
  tournaments,
  history,
  openChallenge,           // eslint-disable-line no-unused-vars — kept for future "rematch from card" wiring
  toast,
}) {
  var navigate = useNavigate();
  var viewerId = authUser && authUser.id;

  // No in-page hero to observe — the page now opens straight
  // onto the Start-a-league CTA, so the global top mob-nav title
  // ("Compete") shows immediately by default. (App.jsx resets
  // scrolledPastHero to true on tab change, which is what we
  // want here.)

  var [pastOpen, setPastOpen] = useState(false);
  var [plusOpen, setPlusOpen] = useState(false);
  var [showCreateLeague, setShowCreateLeague] = useState(false);

  // Lazy-load detail for active leagues so the hero card has rank
  // + record. Same effect the v1 hub used.
  useEffect(function () {
    if (!leagues || !leagues.loadLeagueDetail) return;
    var visible = (leagues.leagues || []).filter(function (lg) {
      return lg.my_status === "active" && isActive(lg);
    });
    visible.forEach(function (lg) {
      if (!leagues.detailCache || !leagues.detailCache[lg.id]) {
        leagues.loadLeagueDetail(lg.id);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leagues && leagues.leagues]);

  // Merged profile map for opponent name resolution on the hero
  // card's last-match chip + accepted-challenge name.
  var profileMap = useMemo(function () {
    return Object.assign({},
      (leagues && leagues.profileMap) || {},
      (challenges && challenges.profileMap) || {}
    );
  }, [leagues && leagues.profileMap, challenges && challenges.profileMap]);

  // ── ACTIVE list ─────────────────────────────────────────────
  var active = useMemo(function () {
    var out = [];
    // Active leagues
    (leagues && leagues.leagues || []).forEach(function (lg) {
      if (lg.my_status !== "active" || !isActive(lg)) return;
      var detail = leagues.detailCache && leagues.detailCache[lg.id];
      var standing = detail && (detail.standings || []).find(function (s) { return s.user_id === viewerId; });
      var memberCount = detail && (detail.members || []).filter(function (m) { return m.status === "active"; }).length;
      var lastMeta = detail ? lastLeagueResult(detail, lg.id, viewerId, profileMap) : null;
      out.push({
        id:      "league:" + lg.id,
        navTo:   "/tournaments/leagues?id=" + lg.id,
        type:    "League",
        name:    lg.name || "League",
        rank:    standing ? standing.rank : null,
        record:  standing ? (standing.wins + "–" + standing.losses) : "0–0",
        players: memberCount || 0,
        last:    lastMeta || { result: null, opp: null, score: null },
      });
    });
    // Accepted challenges (viewer is participant)
    (challenges && challenges.challenges || []).forEach(function (ch) {
      if (ch.status !== "accepted") return;
      if (ch.challenger_id !== viewerId && ch.challenged_id !== viewerId) return;
      var oppId = ch.challenger_id === viewerId ? ch.challenged_id : ch.challenger_id;
      var opp = profileMap[oppId];
      out.push({
        id:      "challenge:" + ch.id,
        navTo:   "/tournaments/challenges",
        type:    "Challenge",
        name:    "vs. " + ((opp && opp.name) || "Player"),
        rank:    null,
        record:  "0–0",
        players: 2,
        last:    { result: null, opp: null, score: null },
      });
    });
    // Active tournaments where the viewer is entered
    (tournaments && tournaments.tournaments || []).forEach(function (tn) {
      var entered = tournaments.isEntered ? tournaments.isEntered(tn.id) : false;
      if (!entered) return;
      if (tn.status === "completed" || tn.status === "cancelled") return;
      out.push({
        id:      "tourn:" + tn.id,
        navTo:   "/tournaments/list",
        type:    "Tournament",
        name:    tn.name || "Tournament",
        rank:    null,
        record:  "—",
        players: tn.player_count || 0,
        last:    { result: null, opp: null, score: null },
      });
    });
    return out;
  }, [leagues, challenges, tournaments, profileMap, viewerId]);

  // ── PAST list ───────────────────────────────────────────────
  var past = useMemo(function () {
    var out = [];
    (leagues && leagues.leagues || []).forEach(function (lg) {
      if (!isPastLifecycle(lg)) return;
      var tag = lg.status === "completed" ? "completed"
              : lg.status === "cancelled" ? "cancelled"
              : "archived";
      out.push({
        id:     "league:" + lg.id,
        navTo:  "/tournaments/leagues?id=" + lg.id,
        name:   lg.name || "League",
        reason: humaniseReason(lg),
        tag:    tag,
      });
    });
    return out;
  }, [leagues]);

  // (AttentionBanner removed — match-confirm / dispute alerts
  // surface inside the Activity tab's pending pills now.)

  // ── Handlers ─────────────────────────────────────────────────
  function pickFromSheet(kind) {
    setPlusOpen(false);
    if (kind === "challenge")  navigate("/tournaments/challenges");
    if (kind === "league")     setShowCreateLeague(true);
    if (kind === "tournament") navigate("/tournaments/list");
  }

  // ── Render ───────────────────────────────────────────────────
  var hero = active[0] || null;
  var rest = active.slice(1);

  return (
    <div style={{
      background:    ED_TOK.bg,
      color:         ED_TOK.ink,
      fontFamily:    ED_TOK.sans,
      minHeight:     "calc(100dvh - 64px)",
      paddingBottom: 96,
      position:      "relative",
    }}>
      {/* Top kicker + Primary CTA section. The previous 72px
          "Compete" hero is gone — global top mob-nav handles the
          title. Page opens straight onto the Start-a-league CTA. */}
      <div style={{ padding: "16px 22px 24px" }}>
        <div style={{
          fontFamily:    ED_TOK.mono,
          fontSize:      10.5,
          letterSpacing: "0.22em",
          textTransform: "uppercase",
          color:         ED_TOK.muted,
          fontWeight:    700,
          textAlign:     "center",
          paddingBottom: 18,
          marginBottom:  18,
          borderBottom:  "1px solid " + ED_TOK.line,
        }}>
          Tournaments &nbsp;·&nbsp; Leagues &nbsp;·&nbsp; Challenges
        </div>
        <button
          onClick={function () { setShowCreateLeague(true); }}
          style={primaryCTAStyle()}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2.4"
            strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 5v14M5 12h14"/>
          </svg>
          Start a league
        </button>
        <div style={{
          display:        "flex",
          justifyContent: "center",
          gap:            6,
          marginTop:      12,
          fontFamily:     ED_TOK.mono,
          fontSize:       11,
          fontWeight:     600,
          color:          ED_TOK.muted,
          letterSpacing:  "0.04em",
        }}>
          <span>or</span>
          <SecondaryLink onClick={function () { navigate("/tournaments/challenges"); }}>challenge someone</SecondaryLink>
          <span>·</span>
          <SecondaryLink onClick={function () { navigate("/tournaments/list"); }}>browse tournaments</SecondaryLink>
        </div>
      </div>

      {/* AttentionBanner removed — match-confirm / dispute alerts
          surface inside the Activity tab now, not here. */}

      {/* Active section */}
      <SectionHead label={"Active · " + active.length} />

      {active.length === 0 ? (
        <EmptyState onPlus={function () { setPlusOpen(true); }} />
      ) : (
        <>
          <HeroActiveCard item={hero} onOpen={function () { navigate(hero.navTo); }} />
          {rest.length > 0 && (
            <div style={{ padding: "0 22px 18px", display: "flex", flexDirection: "column", gap: 8 }}>
              {rest.map(function (it) {
                return <MiniActiveCard key={it.id} item={it} onOpen={function () { navigate(it.navTo); }} />;
              })}
            </div>
          )}
        </>
      )}

      {/* Past section */}
      <SectionHead
        label={"Past · " + past.length}
        action={past.length > 0 ? (pastOpen ? "Hide" : "Show") : null}
        onAction={function () { setPastOpen(function (v) { return !v; }); }}/>
      {pastOpen && past.length > 0 && (
        <div style={{ borderTop: "1px solid " + ED_TOK.line }}>
          {past.map(function (p) {
            return <PastRow key={p.id} item={p} onOpen={function () { navigate(p.navTo); }} />;
          })}
        </div>
      )}

      {/* Plus bottom-sheet */}
      <PlusSheet open={plusOpen} onClose={function () { setPlusOpen(false); }} onPick={pickFromSheet} />

      {/* Create-league modal — opens from the Start-a-league CTA
          and from the PlusSheet's "Start a league" option. */}
      {showCreateLeague && (
        <CreateLeagueModal
          t={t}
          onClose={function () { setShowCreateLeague(false); }}
          createLeague={leagues && leagues.createLeague}
          onCreated={function (newId) {
            setShowCreateLeague(false);
            navigate("/tournaments/leagues?id=" + newId);
          }}
          toast={toast}
        />
      )}
    </div>
  );
}

// ── SectionHead ─────────────────────────────────────────────────

function SectionHead({ label, action, onAction }) {
  return (
    <div style={{
      display:        "flex",
      justifyContent: "space-between",
      alignItems:     "baseline",
      padding:        "4px 22px 12px",
    }}>
      <span style={{
        fontFamily:    ED_TOK.mono,
        fontSize:      10.5,
        letterSpacing: "0.18em",
        textTransform: "uppercase",
        color:         ED_TOK.muted,
        fontWeight:    700,
      }}>
        {label}
      </span>
      {action && (
        <button
          onClick={onAction}
          style={{
            background:    "transparent",
            border:        "none",
            fontFamily:    ED_TOK.mono,
            fontSize:      10.5,
            letterSpacing: "0.16em",
            textTransform: "uppercase",
            color:         ED_TOK.ink,
            fontWeight:    700,
            cursor:        "pointer",
            padding:       0,
          }}>
          {action}
        </button>
      )}
    </div>
  );
}

// ── HeroActiveCard ──────────────────────────────────────────────

function HeroActiveCard({ item, onOpen }) {
  var won  = item.last.result === "Won";
  var lost = item.last.result === "Lost";
  return (
    <div style={{ padding: "0 22px 12px" }}>
      <div
        onClick={onOpen}
        style={{
          background:   ED_TOK.ink,
          color:        ED_TOK.bg,
          borderRadius: 24,
          padding:      "22px 22px 18px",
          cursor:       "pointer",
          transition:   "transform 160ms",
        }}
        onMouseEnter={function (e) { e.currentTarget.style.transform = "translateY(-1px)"; }}
        onMouseLeave={function (e) { e.currentTarget.style.transform = "translateY(0)"; }}>
        <div style={{
          display:        "flex",
          justifyContent: "space-between",
          alignItems:     "center",
        }}>
          <span style={{
            fontFamily:    ED_TOK.mono,
            fontSize:      10.5,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            fontWeight:    700,
            color:         "rgba(240, 233, 218, 0.55)",
          }}>
            {item.type}
          </span>
          {item.rank != null && (
            <span style={{
              fontFamily:    ED_TOK.mono,
              fontSize:      10.5,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              fontWeight:    700,
              color:         "rgba(240, 233, 218, 0.55)",
            }}>
              Your rank{" "}
              <b style={{
                color:         ED_TOK.bg,
                fontFamily:    ED_TOK.display,
                fontSize:      16,
                fontWeight:    600,
                marginLeft:    4,
                letterSpacing: "-0.02em",
              }}>#{item.rank}</b>
            </span>
          )}
        </div>

        <h2 style={{
          fontFamily:    ED_TOK.display,
          fontSize:      38,
          fontWeight:    500,
          letterSpacing: "-0.035em",
          lineHeight:    0.95,
          margin:        "18px 0 14px",
        }}>
          {item.name}
        </h2>

        <div style={{
          display:       "flex",
          gap:           18,
          marginTop:     4,
          fontFamily:    ED_TOK.mono,
          fontSize:      11,
          fontWeight:    600,
          color:         "rgba(240, 233, 218, 0.55)",
          letterSpacing: "0.04em",
        }}>
          <span>
            <b style={statBoldStyle()}>{item.record}</b>
            record
          </span>
          <span>
            <b style={statBoldStyle()}>{item.players}</b>
            {item.players === 1 ? "player" : "players"}
          </span>
        </div>

        <div style={{
          display:        "flex",
          justifyContent: "space-between",
          alignItems:     "center",
          paddingTop:     14,
          marginTop:      14,
          borderTop:      "1px solid rgba(240, 233, 218, 0.12)",
        }}>
          <div>
            <div style={{
              fontFamily:    ED_TOK.mono,
              fontSize:      9.5,
              letterSpacing: "0.16em",
              textTransform: "uppercase",
              fontWeight:    700,
              color:         "rgba(240, 233, 218, 0.45)",
              marginBottom:  4,
            }}>
              Last match
            </div>
            <div style={{
              fontFamily:    ED_TOK.display,
              fontSize:      17,
              fontWeight:    500,
              letterSpacing: "-0.015em",
            }}>
              {item.last.opp ? ("vs. " + item.last.opp) : "—"}
            </div>
          </div>
          {item.last.result ? (
            <div style={{
              display:       "inline-flex",
              alignItems:    "center",
              gap:           8,
              fontFamily:    ED_TOK.display,
              fontSize:      18,
              fontWeight:    600,
              letterSpacing: "-0.015em",
              padding:       "6px 12px",
              borderRadius:  999,
              background:    won ? "rgba(184, 230, 194, 0.15)" : "rgba(240, 181, 168, 0.15)",
              color:         won ? "#B8E6C2" : "#F0B5A8",
            }}>
              <span style={{
                fontFamily:    ED_TOK.mono,
                fontSize:      10,
                letterSpacing: "0.16em",
                textTransform: "uppercase",
                fontWeight:    700,
              }}>
                {item.last.result}
              </span>
              <span>{item.last.score}</span>
            </div>
          ) : (
            <span style={{
              fontFamily: ED_TOK.sans,
              fontSize:   13,
              color:      "rgba(240, 233, 218, 0.55)",
              fontStyle:  "italic",
            }}>
              No matches yet
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// ── MiniActiveCard ──────────────────────────────────────────────

function MiniActiveCard({ item, onOpen }) {
  var won  = item.last.result === "Won";
  var lost = item.last.result === "Lost";
  var dotColor = won ? "#3A7D44" : (lost ? "#C3392B" : ED_TOK.muted);
  return (
    <button
      onClick={onOpen}
      style={{
        background:          ED_TOK.bg2,
        border:              "1px solid " + ED_TOK.line,
        borderRadius:        14,
        padding:             "14px 16px",
        display:             "grid",
        gridTemplateColumns: "36px 1fr auto",
        alignItems:          "center",
        gap:                 14,
        cursor:              "pointer",
        textAlign:           "left",
        width:               "100%",
        fontFamily:          "inherit",
        color:               "inherit",
        transition:          "140ms",
      }}
      onMouseEnter={function (e) { e.currentTarget.style.background = "#DDD3BD"; }}
      onMouseLeave={function (e) { e.currentTarget.style.background = ED_TOK.bg2; }}>
      <span style={{
        fontFamily:    ED_TOK.display,
        fontSize:      28,
        fontWeight:    600,
        letterSpacing: "-0.04em",
        color:         ED_TOK.ink,
        lineHeight:    0.9,
        textAlign:     "center",
      }}>
        {item.rank != null ? (
          <>
            <span style={{
              fontFamily: ED_TOK.mono,
              fontSize:   13,
              fontWeight: 700,
              color:      ED_TOK.muted,
              marginRight: 1,
            }}>#</span>
            {item.rank}
          </>
        ) : "·"}
      </span>
      <div style={{ minWidth: 0 }}>
        <div style={{
          fontFamily:    ED_TOK.display,
          fontSize:      16,
          fontWeight:    600,
          letterSpacing: "-0.015em",
          lineHeight:    1.1,
          whiteSpace:    "nowrap",
          overflow:      "hidden",
          textOverflow:  "ellipsis",
        }}>
          {item.name}
        </div>
        <div style={{
          fontFamily:    ED_TOK.mono,
          fontSize:      10.5,
          fontWeight:    600,
          color:         ED_TOK.muted,
          marginTop:     3,
          letterSpacing: "0.04em",
        }}>
          {item.type} · {item.record}
        </div>
      </div>
      <span style={{
        width:        8,
        height:       8,
        borderRadius: "50%",
        flex:         "0 0 auto",
        background:   dotColor,
      }}/>
    </button>
  );
}

// ── PastRow ─────────────────────────────────────────────────────

function PastRow({ item, onOpen }) {
  var tagStyle = item.tag === "cancelled"
    ? { background: "#F0C8B8", color: "#6B2D1A" }
    : item.tag === "completed"
      ? { background: "#C8E0CA", color: "#1F4A28" }
      : { background: ED_TOK.bg2, color: ED_TOK.muted, border: "1px solid " + ED_TOK.line };
  return (
    <div
      onClick={onOpen}
      style={{
        display:      "flex",
        alignItems:   "center",
        gap:          14,
        padding:      "16px 22px",
        borderBottom: "1px solid " + ED_TOK.line,
        cursor:       "pointer",
      }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontFamily:    ED_TOK.display,
          fontSize:      16,
          fontWeight:    600,
          letterSpacing: "-0.015em",
          lineHeight:    1.1,
          color:         ED_TOK.ink,
        }}>
          {item.name}
        </div>
        <div style={{
          fontFamily: ED_TOK.sans,
          fontSize:   12.5,
          color:      ED_TOK.muted,
          marginTop:  4,
          lineHeight: 1.4,
        }}>
          {item.reason}
        </div>
      </div>
      <span style={Object.assign({
        fontFamily:    ED_TOK.mono,
        fontSize:      10,
        fontWeight:    700,
        letterSpacing: "0.14em",
        textTransform: "uppercase",
        padding:       "4px 10px",
        borderRadius:  999,
        flex:          "0 0 auto",
      }, tagStyle)}>
        {item.tag}
      </span>
    </div>
  );
}

// ── EmptyState ──────────────────────────────────────────────────

function EmptyState({ onPlus }) {
  return (
    <div style={{
      margin:       "0 22px 22px",
      padding:      "32px 24px",
      border:       "1px dashed " + ED_TOK.lineStrong,
      borderRadius: 18,
      textAlign:    "center",
    }}>
      <h3 style={{
        fontFamily:    ED_TOK.display,
        fontSize:      22,
        fontWeight:    600,
        letterSpacing: "-0.025em",
        lineHeight:    1.1,
        margin:        "12px 0 8px",
      }}>
        No competitions yet
      </h3>
      <p style={{
        fontFamily: ED_TOK.sans,
        fontSize:   14,
        color:      ED_TOK.muted,
        margin:     0,
        lineHeight: 1.5,
      }}>
        Challenge a friend or start a league to get on the board.
      </p>
    </div>
  );
}

// ── PlusSheet ───────────────────────────────────────────────────

function PlusSheet({ open, onClose, onPick }) {
  if (!open) return null;
  return (
    <>
      <div
        className="cs-sheet-scrim"
        onClick={onClose}
      />
      <div
        className="cs-sheet-panel"
        onClick={function (e) { e.stopPropagation(); }}
        style={{
          background:    ED_TOK.bg,
          color:         ED_TOK.ink,
          borderRadius:  "28px 28px 0 0",
          borderTop:     "1px solid " + ED_TOK.line,
          padding:       "10px 22px calc(22px + env(safe-area-inset-bottom, 0px))",
          fontFamily:    ED_TOK.sans,
          maxHeight:     "86dvh",
          overflowY:     "auto",
          boxShadow:     "0 -10px 40px rgba(0,0,0,0.18)",
        }}>
        <div style={{
          width:        36,
          height:       4,
          background:   ED_TOK.lineStrong,
          borderRadius: 999,
          margin:       "0 auto 12px",
        }}/>
        <div style={{
          textAlign:     "center",
          fontFamily:    ED_TOK.mono,
          fontSize:      11,
          letterSpacing: "0.2em",
          textTransform: "uppercase",
          fontWeight:    700,
          color:         ED_TOK.ink,
          marginBottom:  14,
        }}>
          Start something new
        </div>
        <SheetOption
          name="Challenge someone"
          desc="A single match. Quick."
          icon={<path d="M5 3v18M19 3v18M5 8h14M5 16h14"/>}
          onClick={function () { onPick("challenge"); }}/>
        <SheetOption
          name="Start a league"
          desc="Multi-week, with friends."
          icon={<path d="M6 4h12v3a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4zm6 7v6m-3 3h6"/>}
          onClick={function () { onPick("league"); }}/>
        <SheetOption
          name="Browse tournaments"
          desc="Public events near you."
          icon={<path d="M8 21h8M12 17v4M7 4h10v6a5 5 0 0 1-10 0V4z"/>}
          onClick={function () { onPick("tournament"); }}/>
      </div>
    </>
  );
}

function SheetOption({ name, desc, icon, onClick }) {
  var [hover, setHover] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={function () { setHover(true); }}
      onMouseLeave={function () { setHover(false); }}
      style={{
        display:      "flex",
        alignItems:   "center",
        gap:          14,
        padding:      16,
        background:   hover ? ED_TOK.ink : ED_TOK.bg2,
        border:       "1px solid " + (hover ? ED_TOK.ink : ED_TOK.line),
        borderRadius: 14,
        cursor:       "pointer",
        width:        "100%",
        textAlign:    "left",
        fontFamily:   "inherit",
        color:        hover ? ED_TOK.bg : ED_TOK.ink,
        marginBottom: 8,
        transition:   "140ms",
      }}>
      <span style={{
        width:        36,
        height:       36,
        borderRadius: 10,
        background:   hover ? "rgba(255,255,255,0.14)" : ED_TOK.bg,
        display:      "grid",
        placeItems:   "center",
        flex:         "0 0 auto",
        color:        hover ? ED_TOK.bg : ED_TOK.ink,
      }}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="1.6"
          strokeLinecap="round" strokeLinejoin="round">
          {icon}
        </svg>
      </span>
      <div>
        <div style={{
          fontFamily:    ED_TOK.display,
          fontSize:      17,
          fontWeight:    600,
          letterSpacing: "-0.015em",
        }}>
          {name}
        </div>
        <div style={{
          fontFamily: ED_TOK.mono,
          fontSize:   11,
          opacity:    0.7,
          marginTop:  2,
        }}>
          {desc}
        </div>
      </div>
    </button>
  );
}

// ── helpers ─────────────────────────────────────────────────────

function SecondaryLink({ children, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        background:                "transparent",
        border:                    "none",
        fontFamily:                "inherit",
        fontSize:                  "inherit",
        color:                     ED_TOK.ink,
        fontWeight:                700,
        cursor:                    "pointer",
        textDecoration:            "underline",
        textUnderlineOffset:       "3px",
        textDecorationThickness:   "1px",
        textDecorationColor:       ED_TOK.lineStrong,
        padding:                   0,
      }}
      onMouseEnter={function (e) { e.currentTarget.style.textDecorationColor = ED_TOK.ink; }}
      onMouseLeave={function (e) { e.currentTarget.style.textDecorationColor = ED_TOK.lineStrong; }}>
      {children}
    </button>
  );
}

function primaryCTAStyle() {
  return {
    width:          "100%",
    background:     ED_TOK.ink,
    color:          ED_TOK.bg,
    border:         "none",
    borderRadius:   999,
    padding:        18,
    fontFamily:     ED_TOK.mono,
    fontSize:       12,
    letterSpacing:  "0.2em",
    textTransform:  "uppercase",
    fontWeight:     700,
    cursor:         "pointer",
    display:        "inline-flex",
    alignItems:     "center",
    justifyContent: "center",
    gap:            10,
    transition:     "160ms",
  };
}

function statBoldStyle() {
  return {
    color:         ED_TOK.bg,
    fontFamily:    ED_TOK.display,
    fontWeight:    500,
    fontSize:      14,
    letterSpacing: "-0.01em",
    marginRight:   5,
  };
}

// Last viewer-side league match — winning/losing + opponent name +
// formatted score for the hero card's score chip. Mirrors the v1
// utility but returns the structured shape the v2 hero expects.
function lastLeagueResult(detail, leagueId, viewerId, profileMap) {
  if (!detail || !detail.recent || !leagueId || !viewerId) return null;
  var rows = (detail.recent || []).filter(function (m) {
    if (m.status !== "confirmed") return false;
    if (m.league_id && m.league_id !== leagueId) return false;
    return m.user_id === viewerId || m.opponent_id === viewerId;
  });
  rows.sort(function (a, b) {
    var ad = a.confirmed_at ? new Date(a.confirmed_at).getTime() : 0;
    var bd = b.confirmed_at ? new Date(b.confirmed_at).getTime() : 0;
    return bd - ad;
  });
  var last = rows[0];
  if (!last) return { result: null, opp: null, score: null };
  var viewerIsSubmitter = last.user_id === viewerId;
  var iWon = viewerIsSubmitter ? (last.result === "win") : (last.result === "loss");
  var oppId = viewerIsSubmitter ? last.opponent_id : last.user_id;
  var oppP = profileMap && profileMap[oppId];
  var oppName = (oppP && oppP.name) || "Opp";
  return {
    result: iWon ? "Won" : "Lost",
    opp:    oppName,
    score:  formatLastScore(last.sets) || "",
  };
}

// Best-effort score formatter for a sets array. Matches the
// "6–4, 6–3" shape used elsewhere on the editorial pages.
function formatLastScore(sets) {
  if (!Array.isArray(sets) || !sets.length) return "";
  return sets
    .map(function (s) {
      if (!s) return null;
      var y = s.you, t = s.them;
      if (y == null || y === "" || t == null || t === "") return null;
      return y + "–" + t;
    })
    .filter(Boolean)
    .join(", ");
}

// Past-league reason copy. Mirrors the LIFECYCLE_LABELS lookup +
// a handful of "why" mappings that are easier to read.
function humaniseReason(lg) {
  if (lg.status === "completed") {
    return "Completed";
  }
  if (lg.status === "cancelled") {
    if (lg.status_reason === "cancelled_by_creator") return "Cancelled by owner";
    return "Cancelled";
  }
  if (lg.status_reason === "inactive") return "Went quiet";
  return LIFECYCLE_LABELS[lg.status] || "Archived";
}
