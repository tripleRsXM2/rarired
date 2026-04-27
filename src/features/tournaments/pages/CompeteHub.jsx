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
import CompeteStartActions       from "../components/hub/CompeteStartActions.jsx";
import SuggestedNextMovesSection from "../components/hub/SuggestedNextMovesSection.jsx";
import PastCompetitionsSection   from "../components/hub/PastCompetitionsSection.jsx";
import ExploreCardsSection       from "../components/hub/ExploreCardsSection.jsx";
import { buildFeaturedSlides }   from "../utils/competeNormalize.js";
import { buildSuggestions }      from "../utils/competeSuggestions.js";
import { getDismissedSet,
         dismissKey }            from "../utils/suggestionDismissals.js";

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
  // Slice 3: viewer's match history (rematch suggestion source) +
  // the App-level openChallenge handler (composes a challenge with
  // a target user + optional source match for venue/court prefill).
  history,
  openChallenge,
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

  // Merged profile map: leagues + challenges + the small subset
  // useMatchHistory keeps internally on each row's avatar field.
  // Keeping the merge in one place means the slides + suggestions
  // share the same name/avatar resolution.
  var mergedProfileMap = useMemo(function () {
    return Object.assign({}, leagues.profileMap || {}, challenges.profileMap || {});
  }, [leagues.profileMap, challenges.profileMap]);

  // ── Build slides for the carousel ──────────────────────────────
  var slides = useMemo(function () {
    return buildFeaturedSlides({
      leagues:      leagues.leagues,
      challenges:   challenges.challenges,
      tournaments:  (tournaments && tournaments.tournaments) || [],
      profileMap:   mergedProfileMap,
      detailCache:  leagues.detailCache,
      viewerId:     viewerId,
      handlers:     handlers,
      isEntered:    tournaments && tournaments.isEntered,
      tournStatus:  tournaments && tournaments.tournStatus,
    });
  }, [
    leagues.leagues, challenges.challenges, mergedProfileMap, leagues.detailCache,
    tournaments && tournaments.tournaments, viewerId, handlers,
    tournaments && tournaments.isEntered, tournaments && tournaments.tournStatus,
  ]);

  // ── Build suggestion cards (Slice 3 + dismissal layer) ─────────
  // buildSuggestions returns the priority-sorted array of items;
  // each helper inside fails closed (returns null when data is
  // missing). dismissedKeys is per-user localStorage state — items
  // whose key is in the set are filtered out so they never re-
  // surface until the user clears dismissals (or the suggestion
  // re-targets a different entity, e.g. a fresh rematch with a new
  // matchId).
  var [dismissedKeys, setDismissedKeys] = useState(function () { return getDismissedSet(viewerId); });
  // Re-read on user switch — login flow could land us here with a
  // different viewerId than we initialised with.
  useEffect(function () {
    setDismissedKeys(getDismissedSet(viewerId));
  }, [viewerId]);

  var allSuggestions = useMemo(function () {
    return buildSuggestions({
      leagues:     leagues.leagues || [],
      detailCache: leagues.detailCache || {},
      history:     history || [],
      viewerId:    viewerId,
      profileMap:  mergedProfileMap,
    });
  }, [leagues.leagues, leagues.detailCache, history, viewerId, mergedProfileMap]);

  var visibleSuggestions = useMemo(function () {
    return allSuggestions.filter(function (s) { return !dismissedKeys.has(s.key); });
  }, [allSuggestions, dismissedKeys]);

  function handleDismissSuggestion(key) {
    setDismissedKeys(dismissKey(viewerId, key));
  }

  // ── Render ─────────────────────────────────────────────────────
  return (
    <div className="fade-up" style={{
      paddingTop:    16,
      paddingBottom: 100,
    }}>
      <InnerRail style={{ marginBottom: "clamp(20px, 3vw, 32px)" }}>
        <CompeteHero t={t} />
      </InnerRail>

      {/* Carousel band — full-bleed across the viewport on every
          screen size. When there are no active items, it returns
          null and the empty state below renders inside the rail. */}
      <ActiveNowBand slides={slides} />

      <InnerRail>
        {slides.length === 0 && (
          <ActiveNowEmpty t={t} />
        )}

        {/* "Start something new" CTAs sit under the band so the
            editorial moment leads the page. When no active items
            exist, the empty state above sits directly above these
            buttons — they become the primary action path. */}
        <CompeteStartActions
          t={t}
          onChallenge={goChallenges}
          onCreateLeague={function () { setShowCreateLeague(true); }}
        />

        {/* Real-data suggestions only. The section hides itself
            when no items remain (after dismissals). Sits between
            the Active surface and Explore so it reads as a calm
            "what next" prompt rather than primary content. Internal
            UX: collapsible Hide/Show, side-arrow carousel between
            items, × dismiss per card (persisted to localStorage). */}
        <SuggestedNextMovesSection
          t={t}
          suggestions={visibleSuggestions}
          profileMap={mergedProfileMap}
          onRematch={function (targetUser, sourceMatch) {
            if (openChallenge) openChallenge(targetUser, "rematch", sourceMatch);
          }}
          onOpenLeague={goLeague}
          onDismiss={handleDismissSuggestion}
        />

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
