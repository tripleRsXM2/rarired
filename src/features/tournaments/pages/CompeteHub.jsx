// src/features/tournaments/pages/CompeteHub.jsx
//
// Module 13 (Compete hub Slice 1) — hub-first landing for /tournaments.
//
// This page replaces the tab-first /tournaments/list landing experience.
// Hierarchy (top → bottom, same on mobile + desktop):
//
//   1. CompeteHero            — title + 2 primary CTAs
//   2. ActiveNowSection       — priority-sorted cards (action-required first)
//   3. StartSomethingSection  — minimal Slice 1: Challenge + Create league
//   4. PastCompetitionsSection — collapsed by default on mobile
//   5. ExploreFooterLinks     — minimal "Browse" links into legacy pages
//
// Routing: this page renders only when the URL is exactly
// `/tournaments` (no trailing segment). Deeper routes
// (`/tournaments/list|challenges|leagues`) keep rendering the
// existing TournamentsTab — see App.jsx for the gate.
//
// We mount CreateLeagueModal locally so the hub's "Create league"
// CTA opens it inline (same modal LeaguesPanel uses). Challenge
// creation deep-links to /tournaments/challenges where the existing
// empty-state friend picker handles target selection — Slice 2 may
// inline a friend picker here once the UX is settled.

import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import CreateLeagueModal from "../../leagues/components/CreateLeagueModal.jsx";
import { isActive }    from "../../leagues/utils/leagueLifecycle.js";
import CompeteHero               from "../components/hub/CompeteHero.jsx";
import CompeteFeaturedBand,
  { selectFeaturedLeague }      from "../components/hub/CompeteFeaturedBand.jsx";
import ActiveNowSection          from "../components/hub/ActiveNowSection.jsx";
import StartSomethingSection     from "../components/hub/StartSomethingSection.jsx";
import PastCompetitionsSection   from "../components/hub/PastCompetitionsSection.jsx";
import ExploreCardsSection      from "../components/hub/ExploreCardsSection.jsx";
import { buildActiveNowCards }   from "../utils/competeNormalize.js";

export default function CompeteHub({
  t, authUser,
  // Hook bundles (passed from App.jsx — same shape as TournamentsTab).
  challenges,
  leagues,
  // Slice 2: tournament data flows through to Active now via the
  // normalizer's predicate gate. The hub itself never owns
  // tournament state — it just reads + routes.
  tournaments,
  // Misc:
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
    // Tournaments don't currently use a query-id deep-link; instead
    // the legacy TournamentsTab picks selectedTournId off the
    // useTournamentManager hook. We set that and navigate to the
    // list page — TournamentDetail then renders for the picked id.
    if (tournaments && tournaments.setSelectedTournId) {
      tournaments.setSelectedTournId(id);
    }
    navigate("/tournaments/list");
  }
  function goLogChallenge(challenge) {
    // Reproduces ChallengesPanel's deep-link contract: route state
    // carries `logChallengeId` which the panel's effect picks up
    // and auto-opens the score modal. Keeping this surface intact
    // means a user can log directly from the hub without the
    // ChallengesPanel-only friend-picker scaffolding.
    navigate("/tournaments/challenges", { state: { logChallengeId: challenge.id } });
  }

  // ── Handlers passed into the normalize helpers ─────────────────
  // Each card's CTA closes over these. Keeping the bag in one place
  // means a card can call back into the right hook without knowing
  // which hook owns the action.
  var handlers = useMemo(function () {
    return {
      // League invite responses — wraps respondToInvite so the page
      // can intercept errors and surface them via toast. Returns
      // the promise so the card's busy state ticks correctly.
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
      // Challenge accept/decline — wraps the hook's RPC. The hook's
      // realtime subscription will refresh the challenges array on
      // success, so the card disappears from Active now naturally.
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
      // Open a league's detail surface (existing route).
      openLeague:     function (id)        { goLeague(id); },
      // Slice 2: open a tournament's detail surface.
      openTournament: function (id)        { goTournament(id); },
      // Log result for an accepted challenge — deep-link with state.
      logChallenge:   function (challenge) { goLogChallenge(challenge); },
      // Generic deep-link into the legacy challenges page.
      openChallenges: function ()          { goChallenges(); },
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leagues, challenges, tournaments]);

  function reportError(msg) { if (toast) toast(msg, "error"); else window.alert(msg); }

  // ── Slice 2: lazy-load detail for active leagues ───────────────
  // Active league cards want a "Rank N · X matches played" subtitle,
  // which lives in league_standings (loaded by useLeagues.loadLeagueDetail).
  // We trigger the load once per visible active league IF its detail
  // isn't already cached. The hook caches per-league forever (no TTL),
  // so subsequent hub visits are zero-cost. Worst case on first load
  // for a user with N active leagues: N parallel detail fetches; in
  // practice N is 1–3.
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
    // We deliberately don't depend on `leagues.detailCache` so we
    // don't re-trigger on the cache update we ourselves caused.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leagues.leagues]);

  // ── Build the Active now card list ─────────────────────────────
  var activeNowCards = useMemo(function () {
    return buildActiveNowCards({
      leagues:      leagues.leagues,                  // voided pre-filtered at hook
      challenges:   challenges.challenges,
      tournaments:  (tournaments && tournaments.tournaments) || [],
      profileMap:   challenges.profileMap || {},
      detailCache:  leagues.detailCache,
      viewerId:     viewerId,
      handlers:     handlers,
      isEntered:    tournaments && tournaments.isEntered,
      tournStatus:  tournaments && tournaments.tournStatus,
    });
  }, [
    leagues.leagues, challenges.challenges, challenges.profileMap, leagues.detailCache,
    tournaments && tournaments.tournaments, viewerId, handlers,
    tournaments && tournaments.isEntered, tournaments && tournaments.tournStatus,
  ]);

  // Design pass: pick the league to feature in the dark band, if any.
  // Selection runs against the same data as the cards so they stay
  // in sync — featured league appears in the band; the same league
  // is filtered out of the cards below to avoid double-rendering.
  var featuredSelection = useMemo(function () {
    return selectFeaturedLeague(leagues.leagues, leagues.detailCache, viewerId);
  }, [leagues.leagues, leagues.detailCache, viewerId]);
  var excludeCardIds = useMemo(function () {
    if (!featuredSelection) return [];
    // The active-league card id is "league_active_<uuid>" — see
    // competeNormalize.normalizeActiveLeague.
    return ["league_active_" + featuredSelection.league.id];
  }, [featuredSelection]);

  // ── Render ─────────────────────────────────────────────────────
  return (
    <div className="fade-up" style={{
      // Slice 2: container padding mirrors HomeTab — fluid horizontal
      // padding via clamp() so spacing scales smoothly from 375px up
      // to wide desktops, instead of the fixed 20px gutter Slice 1
      // shipped with. maxWidth keeps the rail at 720 (Home's
      // constraint).
      padding: "16px clamp(20px, 4vw, 32px) 100px",
      maxWidth: 720, margin: "0 auto",
    }}>
      <CompeteHero
        t={t}
        onChallenge={goChallenges}
        onCreateLeague={function () { setShowCreateLeague(true); }}
      />

      {/* Design pass: dark editorial band sibling of HomeLeagueBand.
          Renders only when a qualifying active league has standings
          loaded (see selectFeaturedLeague). When it renders, the
          corresponding card is excluded from ActiveNowSection so the
          same league doesn't appear twice. */}
      <CompeteFeaturedBand
        t={t}
        authUser={authUser}
        leagues={leagues.leagues}
        detailCache={leagues.detailCache}
        profileMap={leagues.profileMap || {}}
        onOpenLeague={goLeague}
      />

      <ActiveNowSection t={t} cards={activeNowCards} excludeCardIds={excludeCardIds} />

      <StartSomethingSection
        t={t}
        onChallenge={goChallenges}
        onCreateLeague={function () { setShowCreateLeague(true); }}
      />

      {/* Slice 2: Explore moved up between Past and the Past section
          ordering is intentionally — Active now → Start something →
          Explore (browse paths) → Past competitions (history). Keeps
          historical content as the lowest-priority surface and gives
          users a clear route into category pages without scrolling
          past their archive. */}
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

      {showCreateLeague && (
        <CreateLeagueModal
          t={t}
          onClose={function () { setShowCreateLeague(false); }}
          createLeague={leagues.createLeague}
          onCreated={function (newId) {
            // Created from the hub — drop them into the new league's
            // detail surface so they immediately see what they made.
            setShowCreateLeague(false);
            goLeague(newId);
          }}
          toast={toast}
        />
      )}
    </div>
  );
}
