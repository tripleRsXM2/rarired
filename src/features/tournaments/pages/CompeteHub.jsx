// src/features/tournaments/pages/CompeteHub.jsx
//
// Module 13 — hub-first landing for /tournaments.
//
// Hierarchy (top → bottom, same on mobile + desktop):
//
//   1. CompeteHero            — title + 2 primary CTAs
//   2. ActiveNowBand          — full-bleed dark carousel of every
//                               active item (priority sorted).
//                               Empty state when nothing active.
//   3. ExploreCardsSection    — secondary navigation into legacy
//                               category pages
//   4. PastCompetitionsSection — historical leagues
//
// Routing: this page renders only when the URL is exactly
// `/tournaments` (no trailing segment). Deeper routes
// (`/tournaments/list|challenges|leagues`) keep rendering the
// existing TournamentsTab — see App.jsx for the gate.
//
// Layout structure (important):
//   <div .fade-up>           ← outer wrapper, NO max-width
//     <div max-720>          ← centered inner block (hero only)
//       CompeteHero
//     </div>
//     ActiveNowBand          ← full-bleed via width:100% on outer
//     <div max-720>          ← centered inner block (rest)
//       ExploreCardsSection
//       PastCompetitionsSection
//     </div>
//   </div>
//
// This mirrors HomeTab's pattern: HomeLeagueBand uses width:100% to
// stretch to the viewport; the centered sections sit in their own
// max-width inner divs. Keeping the band outside the centered rail
// is the cleanest way to break out without 100vw / scrollbar math.

import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import CreateLeagueModal from "../../leagues/components/CreateLeagueModal.jsx";
import { isActive }    from "../../leagues/utils/leagueLifecycle.js";
import CompeteHero               from "../components/hub/CompeteHero.jsx";
import ActiveNowBand             from "../components/hub/ActiveNowBand.jsx";
import PastCompetitionsSection   from "../components/hub/PastCompetitionsSection.jsx";
import ExploreCardsSection       from "../components/hub/ExploreCardsSection.jsx";
import { buildFeaturedSlides }   from "../utils/competeNormalize.js";

// Reusable inner-rail wrapper. Keeps 720 max-width + horizontal
// gutter so centered sections share the same vertical alignment as
// HomeTab. The outer .fade-up wrapper stays unconstrained so the
// dark band can stretch full-width.
function InnerRail({ children, style }) {
  return (
    <div style={Object.assign({
      maxWidth: 720,
      margin:   "0 auto",
      padding:  "0 clamp(20px, 4vw, 32px)",
    }, style || {})}>
      {children}
    </div>
  );
}

export default function CompeteHub({
  t, authUser,
  // Hook bundles (passed from App.jsx — same shape as TournamentsTab).
  challenges,
  leagues,
  tournaments,
  toast,
}) {
  var navigate = useNavigate();
  var [showCreateLeague, setShowCreateLeague] = useState(false);

  var viewerId = authUser && authUser.id;

  // ── Navigation helpers (deep-links into existing pages) ────────
  function goLeagues()     { navigate("/tournaments/leagues"); }
  function goChallenges()  { navigate("/tournaments/challenges"); }
  function goTournaments() { navigate("/tournaments/list"); }
  function goLeague(id)    { navigate("/tournaments/leagues?id=" + id); }
  function goTournament(id) {
    if (tournaments && tournaments.setSelectedTournId) {
      tournaments.setSelectedTournId(id);
    }
    navigate("/tournaments/list");
  }
  function goLogChallenge(challenge) {
    // Reproduces ChallengesPanel's deep-link contract: route state
    // carries `logChallengeId` which the panel's effect picks up
    // and auto-opens the score modal.
    navigate("/tournaments/challenges", { state: { logChallengeId: challenge.id } });
  }

  // ── Handlers passed into the slide builders ────────────────────
  var handlers = useMemo(function () {
    return {
      acceptInvite: function (leagueId) {
        return leagues.respondToInvite(leagueId, true).then(function (r) {
          if (r && r.error) reportError(r.error.message || "Could not accept.");
          return r;
        });
      },
      declineInvite: function (leagueId, leagueName) {
        if (!window.confirm("Decline invitation to " + (leagueName || "this league") + "?")) {
          return Promise.resolve({ error: null });
        }
        return leagues.respondToInvite(leagueId, false).then(function (r) {
          if (r && r.error) reportError(r.error.message || "Could not decline.");
          return r;
        });
      },
      acceptChallenge: function (challenge) {
        return challenges.acceptChallenge(challenge).then(function (r) {
          if (r && r.error) reportError(r.error.message || "Could not accept.");
          return r;
        });
      },
      declineChallenge: function (challenge) {
        if (!window.confirm("Decline this challenge?")) return Promise.resolve({ error: null });
        return challenges.declineChallenge(challenge).then(function (r) {
          if (r && r.error) reportError(r.error.message || "Could not decline.");
          return r;
        });
      },
      openLeague:     function (id)        { goLeague(id); },
      openTournament: function (id)        { goTournament(id); },
      logChallenge:   function (challenge) { goLogChallenge(challenge); },
      openChallenges: function ()          { goChallenges(); },
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leagues, challenges, tournaments]);

  function reportError(msg) { if (toast) toast(msg, "error"); else window.alert(msg); }

  // ── Lazy-load detail for active leagues so slides can render
  // rank + record. Cache hits prevent re-fetch on subsequent visits.
  useEffect(function () {
    if (!leagues || !leagues.loadLeagueDetail) return;
    var visibleActive = (leagues.leagues || []).filter(function (lg) {
      return lg.my_status === "active" && isActive(lg);
    });
    visibleActive.forEach(function (lg) {
      if (!leagues.detailCache || !leagues.detailCache[lg.id]) {
        leagues.loadLeagueDetail(lg.id);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leagues.leagues]);

  // ── Build slides for the carousel ──────────────────────────────
  var slides = useMemo(function () {
    return buildFeaturedSlides({
      leagues:      leagues.leagues,
      challenges:   challenges.challenges,
      tournaments:  (tournaments && tournaments.tournaments) || [],
      profileMap:   Object.assign({}, leagues.profileMap || {}, challenges.profileMap || {}),
      detailCache:  leagues.detailCache,
      viewerId:     viewerId,
      handlers:     handlers,
      isEntered:    tournaments && tournaments.isEntered,
      tournStatus:  tournaments && tournaments.tournStatus,
    });
  }, [
    leagues.leagues, challenges.challenges, challenges.profileMap, leagues.profileMap,
    leagues.detailCache, tournaments && tournaments.tournaments, viewerId, handlers,
    tournaments && tournaments.isEntered, tournaments && tournaments.tournStatus,
  ]);

  // ── Render ─────────────────────────────────────────────────────
  return (
    <div className="fade-up" style={{
      paddingTop:    16,
      paddingBottom: 100,
    }}>
      <InnerRail style={{ marginBottom: "clamp(20px, 3vw, 32px)" }}>
        <CompeteHero
          t={t}
          onChallenge={goChallenges}
          onCreateLeague={function () { setShowCreateLeague(true); }}
        />
      </InnerRail>

      {/* Carousel band — full-bleed across the viewport on every
          screen size. When there are no active items, it returns
          null and the empty state below renders inside the rail. */}
      <ActiveNowBand slides={slides} />

      <InnerRail>
        {slides.length === 0 && (
          <ActiveNowEmpty t={t} />
        )}

        <ExploreCardsSection
          t={t}
          onLeagues={goLeagues}
          onChallenges={goChallenges}
          onTournaments={goTournaments}
        />

        <PastCompetitionsSection
          t={t}
          leagues={leagues.leagues}
          onOpenLeague={goLeague}
        />
      </InnerRail>

      {showCreateLeague && (
        <CreateLeagueModal
          t={t}
          onClose={function () { setShowCreateLeague(false); }}
          createLeague={leagues.createLeague}
          onCreated={function (newId) {
            setShowCreateLeague(false);
            goLeague(newId);
          }}
          toast={toast}
        />
      )}
    </div>
  );
}

// ── Empty state ────────────────────────────────────────────────
// Renders only when the carousel has nothing to show. Same Home-
// style chrome (radius 14, generous padding, 🎾 motif) the previous
// ActiveNowSection used. Stays in the inner rail so it doesn't
// imply the band is broken — the band simply doesn't render when
// there's nothing active.
function ActiveNowEmpty({ t }) {
  return (
    <div style={{
      background:   t.bgCard,
      border:       "1px solid " + t.border,
      borderRadius: 14,
      padding:      "40px 24px",
      textAlign:    "center",
      marginBottom: "clamp(20px, 3vw, 32px)",
    }}>
      <div style={{ fontSize: 36, marginBottom: 12 }}>🎾</div>
      <div style={{
        fontSize:      17, fontWeight: 700, color: t.text,
        letterSpacing: "-0.3px", marginBottom: 6,
      }}>
        Nothing active right now
      </div>
      <div style={{
        fontSize: 13, color: t.textSecondary,
        lineHeight: 1.6, maxWidth: 280, margin: "0 auto",
      }}>
        Use the buttons above to start a challenge or a league.
      </div>
    </div>
  );
}
