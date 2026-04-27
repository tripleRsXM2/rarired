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

import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import CreateLeagueModal from "../../leagues/components/CreateLeagueModal.jsx";
import CompeteHero               from "../components/hub/CompeteHero.jsx";
import ActiveNowSection          from "../components/hub/ActiveNowSection.jsx";
import StartSomethingSection     from "../components/hub/StartSomethingSection.jsx";
import PastCompetitionsSection   from "../components/hub/PastCompetitionsSection.jsx";
import ExploreFooterLinks        from "../components/hub/ExploreFooterLinks.jsx";
import { buildActiveNowCards }   from "../utils/competeNormalize.js";

export default function CompeteHub({
  t, authUser,
  // Hook bundles (passed from App.jsx — same shape as TournamentsTab).
  challenges,
  leagues,
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
      // Log result for an accepted challenge — deep-link with state.
      logChallenge:   function (challenge) { goLogChallenge(challenge); },
      // Generic deep-link into the legacy challenges page.
      openChallenges: function ()          { goChallenges(); },
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leagues, challenges]);

  function reportError(msg) { if (toast) toast(msg, "error"); else window.alert(msg); }

  // ── Build the Active now card list ─────────────────────────────
  var activeNowCards = useMemo(function () {
    return buildActiveNowCards({
      leagues:      leagues.leagues,                  // voided pre-filtered at hook
      challenges:   challenges.challenges,
      profileMap:   challenges.profileMap || {},
      detailCache:  leagues.detailCache,
      viewerId:     viewerId,
      handlers:     handlers,
    });
  }, [leagues.leagues, challenges.challenges, challenges.profileMap, leagues.detailCache, viewerId, handlers]);

  // ── Render ─────────────────────────────────────────────────────
  return (
    <div className="fade-up" style={{
      // Match TournamentsTab's container padding so direct deep-links
      // and the hub feel like the same surface.
      padding: "16px 20px 100px",
      maxWidth: 720, margin: "0 auto",
    }}>
      <CompeteHero
        t={t}
        onChallenge={goChallenges}
        onCreateLeague={function () { setShowCreateLeague(true); }}
      />

      <ActiveNowSection t={t} cards={activeNowCards} />

      <StartSomethingSection
        t={t}
        onChallenge={goChallenges}
        onCreateLeague={function () { setShowCreateLeague(true); }}
      />

      <PastCompetitionsSection
        t={t}
        leagues={leagues.leagues}
        onOpenLeague={goLeague}
      />

      <ExploreFooterLinks
        t={t}
        onBrowseLeagues={goLeagues}
        onBrowseChallenges={goChallenges}
        onBrowseTournaments={goTournaments}
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
