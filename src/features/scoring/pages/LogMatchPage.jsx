// src/features/scoring/pages/LogMatchPage.jsx
//
// Editorial Tennis "Log a Match v2" — single-screen match-card flow.
// Mounted at /match/log; entered via the "+" in the bottom tab bar.
//
// The score is the hero. Everything else is a tappable detail row
// that opens a bottom sheet. Submit reveals a celebration overlay
// with the opponent name + score + a "pending confirmation" pill.
//
// Wires to existing infrastructure:
//   - useMatchHistory.submitMatch handles the actual insert + ranked
//     match_tag notification (or casual_match_logged for casual
//     non-league rows). Same path the legacy ScoreModal uses.
//   - Opponent recents = unique linked opponents from history (most
//     recent first) merged with viewer's friends.
//   - Type → League with no leagues → empty-state CTA navigates to
//     /tournaments/leagues so the user can create from the
//     existing CreateLeagueModal entry point on that page.
//
// Component boundaries are intentionally inlined here — the sheets
// only exist on this page and aren't reused elsewhere. If a sheet
// grows beyond ~80 lines it can be split out.

import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ED_TOK } from "../../home/components/EditorialScreen.jsx";
import {
  calculateRatingChange,
  getKFactor,
  getMatchFormatWeight,
} from "../../rating/utils/ratingSystem.js";
import { validateMatchScore } from "../utils/tennisScoreValidation.js";

// ── Page ─────────────────────────────────────────────────────────

export default function LogMatchPage({
  authUser,
  profile,
  history,
  friends,
  myLeagues,
  submitMatch,
  toast,
  // Triggers the post-match opponent feedback prompt (Module 10
  // Slice 2 — PostMatchFeedbackCard) once a ranked match with a
  // linked opponent is logged. Surfaces the "rate legitimacy /
  // sportsmanship" chips so the truth loop closes from both sides
  // — submitter rates the opponent now (right after logging), the
  // opponent rates the submitter when they confirm.
  setPendingFeedbackMatch,
}) {
  var navigate = useNavigate();
  var location = useLocation();

  // ── lockedLeague ───────────────────────────────────────────────
  // When the page is opened from inside a league (e.g. the league
  // detail page's "+ Log match" button), App.jsx passes a
  // lockedLeague payload via router state. The page locks type to
  // 'league' + the league's id, hides the Type sheet, and filters
  // the opponent list to active league members. Cleared on unmount
  // so a subsequent free-form open doesn't carry the lock.
  var lockedLeague = (location && location.state && location.state.lockedLeague) || null;

  // Lock the document body from scrolling/rubber-banding while
  // this page is mounted. Even with the page wrapper sized to the
  // viewport and overflow:hidden, iOS Safari can still elastically
  // drag the document — pinning body overflow:hidden + overscroll-
  // behavior:none kills that for as long as the user is here, then
  // restores the prior values on unmount so other pages keep their
  // native bounce.
  useEffect(function () {
    var prevOverflow = document.body.style.overflow;
    var prevOverscroll = document.body.style.overscrollBehavior;
    document.body.style.overflow = "hidden";
    document.body.style.overscrollBehavior = "none";
    return function () {
      document.body.style.overflow = prevOverflow;
      document.body.style.overscrollBehavior = prevOverscroll;
    };
  }, []);

  // ── Form state ────────────────────────────────────────────────
  // Default to ONE set so the page fits a typical mobile viewport
  // without needing to scroll. Users can + Add set up to 5.
  var [sets, setSets] = useState([{ a: "", b: "" }]);
  var [opp, setOpp] = useState(null);            // { id, name, sub }
  // When opened from a league, type + leagueId are pre-set from
  // the router state and the Type row is rendered in a locked,
  // non-tappable form.
  var [type, setType] = useState(lockedLeague ? "league" : null);
  var [leagueId, setLeagueId] = useState(lockedLeague ? lockedLeague.id : null);
  var [completion, setCompletion] = useState("completed"); // 'completed' | 'time_limited' | 'retired'
  var [details, setDetails] = useState({
    court: "",
    date: new Date().toISOString().slice(0, 10),
    time: new Date().toTimeString().slice(0, 5),
    notes: "",
  });

  // ── Score-sheet state ─────────────────────────────────────────
  // Lifted to the page so opening a specific cell from the
  // scoreboard preserves which set + side is being edited.
  var [activeSet, setActiveSet] = useState(0);
  var [activeSide, setActiveSide] = useState("a");
  var [scoreMode, setScoreMode] = useState("pad");

  // ── Sheet open state ──────────────────────────────────────────
  // Auto-open the score sheet on mobile so tapping the bottom "+"
  // lands the user straight into score entry — forcing the score
  // to be filled first before anything else. User feedback:
  // 'on mobile when we log a match by pressing the + button. Can
  // the score/Tally automatically pop up. This forces the user to
  // log a match with the score first.' Desktop opens with no sheet
  // (the page's score grid is already visible inline). 1024px
  // matches the rest of the app's desktop breakpoint.
  var [sheet, setSheet] = useState(function () {
    if (typeof window === "undefined") return null;
    return window.innerWidth < 1024 ? "score" : null;
  }); // 'score' | 'opp' | 'type' | 'completion' | 'details'

  // ── Submit + celebration ──────────────────────────────────────
  var [saving, setSaving] = useState(false);
  var [saveError, setSaveError] = useState("");
  var [celebration, setCelebration] = useState(null); // { won, score, opp, status }

  // ── Derived ───────────────────────────────────────────────────
  var completedSets = useMemo(function () {
    return sets.filter(function (s) { return s.a !== "" && s.b !== ""; });
  }, [sets]);

  var compactScore = completedSets
    .map(function (s) { return s.a + "–" + s.b; })
    .join(", ");

  var won = useMemo(function () {
    var aWins = 0, bWins = 0;
    sets.forEach(function (s) {
      if (s.a === "" || s.b === "") return;
      var na = Number(s.a), nb = Number(s.b);
      if (Number.isNaN(na) || Number.isNaN(nb) || na === nb) return;
      if (na > nb) aWins++; else bWins++;
    });
    if (aWins === 0 && bWins === 0) return null;
    if (aWins === bWins) return null; // tied — no clear winner yet
    return aWins > bWins;
  }, [sets]);

  // Eligible leagues for the picker — viewer is active in them and
  // they're active. Mode filtering happens at submit time (server
  // trigger validates league.mode vs match_type).
  var activeLeagues = useMemo(function () {
    return (myLeagues || []).filter(function (lg) {
      return lg && lg.status === "active" && lg.my_status === "active";
    });
  }, [myLeagues]);

  // Recent opponents: most-recent confirmed match per linked opponent.
  // We pull ranking_points from the friends list when available so the
  // rating estimate in the celebration can use it; falls back to null
  // (which surfaces "Pending" without a delta number).
  var friendRatingById = useMemo(function () {
    var by = {};
    (friends || []).forEach(function (f) {
      if (f && f.id && f.ranking_points != null) by[f.id] = f.ranking_points;
    });
    return by;
  }, [friends]);

  // Resolve "the actual opponent of this match from the viewer's POV".
  //
  // history rows come in three flavours (see normalizeMatch):
  //   own         — viewer = user_id, opponent = opponent_id
  //   isTagged    — submitter = user_id, viewer = opponent_id; the real
  //                 opponent (from viewer POV) is the submitter
  //   isThirdParty — neither party is the viewer (friends-feed)
  //
  // The legacy code keyed only on m.opponent_id and filtered out rows
  // where opponent_id === viewer, which silently dropped every tagged
  // match. Friends who only ever LOG matches against the viewer never
  // appeared in recents as a result. This helper returns null when
  // there's no viewer-relative opponent (third-party rows, or the
  // opponent slot is the viewer themselves).
  function viewerOpponentOf(m, myId) {
    if (!m) return null;
    if (m.isThirdParty) return null;
    if (m.isTagged) {
      // Real opponent is the submitter; only return it if it isn't the viewer
      if (!m.submitterId || m.submitterId === myId) return null;
      return {
        id:   m.submitterId,
        // For tagged rows, normalizeMatch overwrites friendName with the
        // submitter's actual display name, so prefer that over oppName
        // (which is the viewer's own name as typed by the submitter).
        name: m.friendName || "Player",
      };
    }
    if (!m.opponent_id || m.opponent_id === myId) return null;
    return {
      id:   m.opponent_id,
      name: m.opponentName || m.oppName || m.friendName || m.playerName || "Player",
    };
  }

  var recentOpponents = useMemo(function () {
    var seen = {};
    var out = [];
    var myId = authUser && authUser.id;
    (history || []).forEach(function (m) {
      var info = viewerOpponentOf(m, myId);
      if (!info) return;
      if (seen[info.id]) return;
      seen[info.id] = true;
      out.push({
        id:             info.id,
        name:           info.name,
        sub:            m.match_type === "ranked" ? "Played recently" : "Casual",
        ranking_points: friendRatingById[info.id] != null ? friendRatingById[info.id] : null,
      });
    });
    return out.slice(0, 6);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [history, authUser, friendRatingById]);

  // All players list = recents + friends, deduped by id. Carries
  // ranking_points so the celebration can show an estimated delta.
  // Defensive: never include the viewer themselves (would let you pick
  // yourself as opponent → match insert would fail server-side).
  var allPlayers = useMemo(function () {
    var byId = {};
    var myId = authUser && authUser.id;
    recentOpponents.forEach(function (p) {
      if (!p || !p.id || p.id === myId) return;
      byId[p.id] = p;
    });
    (friends || []).forEach(function (f) {
      if (!f || !f.id || f.id === myId || byId[f.id]) return;
      byId[f.id] = {
        id:             f.id,
        name:           f.name || "Player",
        sub:            (f.suburb || "Friend") + (f.skill ? " · " + f.skill : ""),
        ranking_points: f.ranking_points != null ? f.ranking_points : null,
      };
    });
    return Object.values(byId);
  }, [recentOpponents, friends, authUser]);

  // When opened from a league, filter the opponent lists to active
  // league members only. Otherwise the user could pick a non-member
  // opponent and the validate_match_league trigger would reject the
  // insert at submit time.
  var memberSet = useMemo(function () {
    if (!lockedLeague || !Array.isArray(lockedLeague.memberIds)) return null;
    var s = {};
    lockedLeague.memberIds.forEach(function (id) { s[id] = true; });
    return s;
  }, [lockedLeague]);
  var oppRecents  = memberSet ? recentOpponents.filter(function (p) { return memberSet[p.id]; }) : recentOpponents;
  var oppAllPlayers = memberSet ? allPlayers.filter(function (p) { return memberSet[p.id]; }) : allPlayers;

  // Submit gating — score + opponent + type all set.
  var ready = completedSets.length > 0 && !!opp && !!type && !saving
    && (type !== "league" || !!leagueId);

  // ── Handlers ──────────────────────────────────────────────────
  function editSet(i, side) {
    setActiveSet(i);
    setActiveSide(side);
    setSheet("score");
  }

  // (Page-level + Add set button is gone — adding sets now happens
  // inside the score sheet's mini preview "+" button. ScoreSheet
  // owns its own addSet helper.)

  function delSet(i) {
    if (sets.length <= 1) {
      setSets([{ a: "", b: "" }]);
      return;
    }
    var next = sets.filter(function (_, idx) { return idx !== i; });
    setSets(next);
    if (activeSet >= next.length) setActiveSet(next.length - 1);
  }

  // ── Submit ────────────────────────────────────────────────────
  async function handleSubmit() {
    if (!ready) return;
    setSaving(true);
    setSaveError("");

    // Build the legacy submitMatch payload from our state. The hook
    // takes scoreDraft.sets in {you, them} format — translate.
    // Tiebreak (set in 7-6 / 6-7 shape) carries `tieBreak: {a,b}`
    // which becomes `tieBreak: {you, them}`. The validator +
    // serializer downstream already handle the legacy shape.
    var draft = {
      sets:           sets.filter(function (s) { return s.a !== "" || s.b !== ""; })
                       .map(function (s) {
                         var out = { you: s.a, them: s.b };
                         if (s.tieBreak && (s.tieBreak.a !== "" || s.tieBreak.b !== "")) {
                           out.tieBreak = { you: s.tieBreak.a, them: s.tieBreak.b };
                         }
                         return out;
                       }),
      result:         won ? "win" : "loss",
      notes:          details.notes || "",
      date:           details.date,
      venue:          details.court || "",
      court:          "",
      // matchType MUST agree with the league's mode when filing into
      // a league — the server trigger validate_match_league rejects
      // (league.mode='casual' + match_type='ranked') and vice versa.
      // Resolution order: lockedLeague payload (router state from
      // "+ Log match" inside the league detail) → user-picked league
      // from activeLeagues. Fall back to "ranked" only when neither
      // resolution finds the league row, which shouldn't happen for
      // an actively selected league.
      matchType:      resolveMatchType(type, leagueId, lockedLeague, activeLeagues),
      completionType: completion,
      leagueId:       (type === "league" && leagueId) ? leagueId : null,
      inviteOpponent: false,
    };

    // scoreModal envelope — submitMatch reads scoreModal.casual to
    // pick the linked-opponent path. Always casual=true here; when
    // an opponent is selected (opp.id), submitMatch promotes the
    // row to ranked + pending_confirmation per our usual rules.
    var sm = {
      casual:    true,
      oppName:   opp ? opp.name : "",
      tournName: type === "casual" ? "Casual Match" : (type === "league" ? "League" : "Match"),
    };

    var res;
    try {
      res = await submitMatch({
        scoreModal:  sm,
        scoreDraft:  draft,
        oppName:     opp.name,
        opponentId:  opp.id,
      });
    } catch (e) {
      setSaving(false);
      setSaveError("Could not save — please try again.");
      return;
    }

    setSaving(false);
    if (res && res.error) {
      var msg = (typeof res.error === "string" ? res.error : null) || res.message || "Could not save match.";
      setSaveError(msg);
      if (toast) toast(msg, "error");
      return;
    }

    // Removed: belt-and-braces "Match logged" toast that used to
    // pop bottom-right alongside the celebration overlay. Per user
    // feedback the celebration card already states the outcome
    // (and the pending-confirmation case carries its own banner)
    // — the toast was redundant noise on top of the moment.

    // Estimate the rating delta the viewer can expect once the
    // opponent confirms. Same Elo math the server uses
    // (apply_match_outcome → calculateRatingChange) so the number
    // we show should match the server's eventual write within ±1
    // (rounding aside). Skips if we don't have both ratings or the
    // match isn't ranked — server is the source of truth, this is
    // just a UI hint while pending. Casual matches always show
    // null here; the celebration falls back to a plain status pill.
    var estDelta = estimateDelta({
      profile:    profile,
      opp:        opp,
      sets:       draft.sets,
      won:        won,
      isRanked:   draft.matchType === "ranked",
    });

    setCelebration({
      won:     won,
      score:   compactScore,
      opp:     opp,
      status:  (res && res.status) || "pending_confirmation",
      type:    type,
      delta:   estDelta,
      isRanked: draft.matchType === "ranked",
      matchId: res && res.matchId ? String(res.matchId) : null,
    });
  }

  function celebrationDone() {
    var matchId = celebration && celebration.matchId;
    var oppForFeedback = celebration && celebration.opp;
    setCelebration(null);
    navigate("/home");
    // Trust loop — once the user lands back home, surface the
    // PostMatchFeedbackCard so they can rate the opponent's
    // legitimacy / sportsmanship while the match is still fresh.
    // Casual matches or freetext (no opp.id) skip — feedback rows
    // need a reviewed_user_id and a real match_id.
    if (
      setPendingFeedbackMatch
      && matchId
      && oppForFeedback
      && oppForFeedback.id
    ) {
      // Tiny delay so the celebration's slide-down animation isn't
      // competing with the feedback card's slide-up.
      setTimeout(function () {
        setPendingFeedbackMatch({
          matchId:        matchId,
          reviewedUserId: oppForFeedback.id,
          reviewedName:   oppForFeedback.name,
        });
      }, 320);
    }
  }

  // ── Render ────────────────────────────────────────────────────
  var ctxLabel = labelForType(type, leagueId, activeLeagues);
  var completionLabel = labelForCompletion(completion);
  var detailsSummary = formatDetailsSummary(details);

  return (
    <div style={{
      background:    ED_TOK.bg,
      color:         ED_TOK.ink,
      fontFamily:    ED_TOK.sans,
      // Lock to the available viewport — page sits below the global
      // top mob nav (--cs-nav-h, ~52px + safe-area-top) and above the
      // fixed bottom tab bar (~80px + safe-area-bottom). Subtracting
      // both keeps the scoreboard + 4 detail rows + submit visible
      // without internal scroll on a typical 375x812 mobile.
      height:        "calc(100dvh - var(--cs-nav-h, 52px) - 80px - env(safe-area-inset-bottom, 0px))",
      display:       "flex",
      flexDirection: "column",
      // Kill iOS rubber-band on the page wrapper — without this,
      // Safari lets the user drag the whole page elastically even
      // when it fits the viewport exactly (the user-reported "Log
      // a match still scrolls on iOS"). overscroll-behavior:none
      // also stops the rubber-band from leaking up to the ancestor
      // when an inner section actually does need to scroll.
      overflow:           "hidden",
      overscrollBehavior: "none",
    }}>
      {/* No page-specific top bar — the global cs-mob-nav handles
          the title ("Log a match") via App.jsx's topBarTitle wiring.
          Users escape via the bottom tab bar. */}
      {/* Body is a flex column so the submit zone can use
          margin-top: auto and pin itself to the bottom of the
          available space, right above the global bottom tab bar.
          minHeight: 0 lets the inner overflow:auto behave when
          content actually overflows (e.g. 5 sets added).
          overscroll-behavior: contain prevents an iOS rubber-band
          drag from bleeding up to the page wrapper or the
          document body. */}
      <div style={{
        flex:               1,
        overflowY:          "auto",
        paddingBottom:      8,
        minHeight:          0,
        display:            "flex",
        flexDirection:      "column",
        overscrollBehavior: "contain",
      }}>
        {/* HERO — verdict pill + scoreboard */}
        <div style={{ padding: "14px 22px 16px" }}>
          <VerdictPill won={won} />
          <Scoreboard
            sets={sets}
            activeSet={activeSet}
            activeSide={activeSide}
            onEditCell={editSet}
            onDelSet={delSet}
          />
        </div>

        {/* "How it ended" through "Log match" is one group — the
            detail rows AND the submit zone share a wrapper with
            margin-top: auto so the whole bottom-of-page concern
            (configure + submit) reads as a single block pinned to
            the bottom of the body, with the scoreboard hero
            floating above with the leftover empty space between
            them. */}
        <div style={{
          marginTop:     "auto",
          display:       "flex",
          flexDirection: "column",
        }}>
          <div style={{ borderTop: "1px solid " + ED_TOK.line }}>
            <DetailRow
              label="How it ended"
              value={completionLabel}
              empty={false}
              onClick={function () { setSheet("completion"); }}
            />
            <DetailRow
              label="Opponent"
              value={opp ? opp.name : "Choose opponent"}
              empty={!opp}
              sub={opp ? opp.sub : null}
              onClick={function () { setSheet("opp"); }}
            />
            <DetailRow
              label="Type"
              value={ctxLabel || "League, casual, or tournament"}
              empty={!type}
              sub={subForType(type, leagueId, activeLeagues)}
              // When opened from a league, the Type row is locked —
              // tapping does nothing. Visually it still reads with
              // a chevron to keep the row rhythm consistent, but
              // it just shows the locked league name.
              onClick={lockedLeague ? function () {} : function () { setSheet("type"); }}
              locked={!!lockedLeague}
            />
            <DetailRow
              label="Details"
              value={detailsSummary || "Court, date, notes (optional)"}
              empty={!detailsSummary}
              sub={details.notes ? quote(details.notes, 48) : null}
              onClick={function () { setSheet("details"); }}
            />
          </div>

          {/* SUBMIT — sits at the very bottom of the bottom group. */}
          <div style={{
            padding:        "14px 22px 18px",
            display:        "flex",
            flexDirection:  "column",
            gap:            8,
          }}>
          <span style={{
            fontFamily:    ED_TOK.mono,
            fontSize:      10.5,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            color:         ready ? ED_TOK.ink : ED_TOK.muted,
            fontWeight:    600,
            textAlign:     "center",
          }}>
            {submitHint(ready, completedSets.length, opp, type, leagueId, saving)}
          </span>
          {saveError && (
            <span style={{
              fontFamily: ED_TOK.mono,
              fontSize:   11,
              color:      ED_TOK.loss,
              textAlign:  "center",
              letterSpacing: "0.04em",
            }}>
              {saveError}
            </span>
          )}
          <button
            onClick={handleSubmit}
            disabled={!ready}
            style={primaryBtn(ED_TOK, !ready)}>
            {saving ? "Saving…" : "Log match"}
            {!saving && (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2.2"
                strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12h14M13 6l6 6-6 6"/>
              </svg>
            )}
          </button>
          </div>{/* end submit zone */}
        </div>{/* end "How it ended → Log match" bottom group */}
      </div>{/* end body */}

      {/* SHEETS */}
      <BottomSheet open={sheet === "score"} title="Score" onClose={function () { setSheet(null); }}>
        <ScoreSheet
          sets={sets}
          setSets={setSets}
          mode={scoreMode}
          setMode={setScoreMode}
          activeSet={activeSet}
          setActiveSet={setActiveSet}
          activeSide={activeSide}
          setActiveSide={setActiveSide}
          onDone={function () { setSheet(null); }}
          // Validation context for the in-sheet Done button so the
          // user catches score-shape errors before tapping Log
          // match.
          matchType={type === "casual" ? "casual" : "ranked"}
          completionType={completion}
        />
      </BottomSheet>

      <BottomSheet open={sheet === "completion"} title="How it ended" onClose={function () { setSheet(null); }}>
        <CompletionSheet
          value={completion}
          setValue={setCompletion}
          onDone={function () { setSheet(null); }}
        />
      </BottomSheet>

      <BottomSheet open={sheet === "opp"} title="Opponent" onClose={function () { setSheet(null); }}>
        <OpponentSheet
          recents={oppRecents}
          allPlayers={oppAllPlayers}
          onPick={function (p) { setOpp(p); setSheet(null); }}
        />
      </BottomSheet>

      <BottomSheet open={sheet === "type"} title="Match type" onClose={function () { setSheet(null); }}>
        <TypeSheet
          value={type}
          setValue={setType}
          leagueId={leagueId}
          setLeagueId={setLeagueId}
          activeLeagues={activeLeagues}
          onDone={function () { setSheet(null); }}
          onCreateLeague={function () { setSheet(null); navigate("/tournaments/leagues"); }}
        />
      </BottomSheet>

      <BottomSheet open={sheet === "details"} title="Details" onClose={function () { setSheet(null); }}>
        <DetailsSheet
          details={details}
          setDetails={setDetails}
          onDone={function () { setSheet(null); }}
        />
      </BottomSheet>

      {/* CELEBRATION */}
      <MatchCelebration
        data={celebration}
        onDone={celebrationDone}
      />
    </div>
  );
}

// ── VerdictPill ──────────────────────────────────────────────────

function VerdictPill({ won }) {
  // No "Tap to score" empty state — the pill only shows once the
  // match has a clear winner. Keeps the top of the page calm when
  // the user first lands.
  if (won == null) return null;
  var bg    = won ? "#B8E6C2" : "#F0B5A8";
  var color = won ? "#1A4527" : "#5C2018";
  var label = won ? "● Win" : "● Loss";
  return (
    <div style={{
      fontFamily:    ED_TOK.mono,
      fontSize:      10.5,
      letterSpacing: "0.18em",
      textTransform: "uppercase",
      fontWeight:    700,
      marginBottom:  10,
    }}>
      <span style={{
        display:       "inline-flex",
        alignItems:    "center",
        gap:           6,
        padding:       "4px 10px",
        borderRadius:  999,
        background:    bg,
        color:         color,
      }}>
        {label}
      </span>
    </div>
  );
}

// ── Scoreboard (dark card) ──────────────────────────────────────

function Scoreboard({ sets, activeSet, activeSide, onEditCell, onDelSet }) {
  return (
    <div style={{
      borderRadius: 22,
      background:   ED_TOK.ink,
      color:        ED_TOK.bg,
      padding:      "20px 22px 22px",
      position:     "relative",
      overflow:     "hidden",
    }}>
      {/* Side headers */}
      <div style={{
        display:             "grid",
        gridTemplateColumns: "1fr auto 1fr",
        alignItems:          "center",
        fontFamily:          ED_TOK.mono,
        fontSize:            10.5,
        letterSpacing:       "0.18em",
        textTransform:       "uppercase",
        fontWeight:          700,
        marginBottom:        14,
      }}>
        <span style={{ textAlign: "left", color: ED_TOK.bg }}>You</span>
        <span style={{
          fontFamily:    ED_TOK.display,
          fontSize:      11,
          fontWeight:    500,
          letterSpacing: "0.1em",
          color:         "rgba(240, 233, 218, 0.4)",
          padding:       "0 10px",
        }}>vs</span>
        <span style={{ textAlign: "right", color: "rgba(240, 233, 218, 0.55)" }}>Opponent</span>
      </div>

      {/* Score rows — swipe left or right to delete (when there's
          more than one set). The user no longer has a visible "×"
          or "+ Add set" affordance; sets are added from inside the
          score sheet's mini preview, and deleted via swipe gesture. */}
      {sets.map(function (s, i) {
        var aN = Number(s.a), bN = Number(s.b);
        var aWins = s.a !== "" && s.b !== "" && aN > bN;
        var bWins = s.a !== "" && s.b !== "" && bN > aN;
        var aActive = activeSet === i && activeSide === "a";
        var bActive = activeSet === i && activeSide === "b";
        return (
          <SwipeableScoreRow key={i}
            index={i}
            isFirst={i === 0}
            canDelete={sets.length > 1}
            onDelete={function () { onDelSet(i); }}>
            <div style={{
              display:             "grid",
              gridTemplateColumns: "1fr auto 1fr",
              alignItems:          "center",
              gap:                 14,
              padding:             "6px 0",
            }}>
              <ScoreCell side="a" value={s.a} active={aActive} winner={aWins}
                onClick={function () { onEditCell(i, "a"); }}/>
              <span style={{
                display:        "inline-flex",
                flexDirection:  "column",
                alignItems:     "center",
                fontFamily:     ED_TOK.mono,
                fontSize:       9.5,
                fontWeight:     700,
                letterSpacing:  "0.18em",
                textTransform:  "uppercase",
                color:          "rgba(240, 233, 218, 0.4)",
                textAlign:      "center",
                whiteSpace:     "nowrap",
                lineHeight:     1.2,
              }}>
                <span>Set {i + 1}</span>
                {/* Tiebreak indicator — only renders when this set
                    is in 7-6 / 6-7 shape and has a recorded TB
                    score. Sits under the "Set N" label so the
                    main scoreboard stays calm. */}
                {isTbShape(s) && s.tieBreak && (s.tieBreak.a !== "" || s.tieBreak.b !== "") && (
                  <span style={{
                    marginTop:     2,
                    fontSize:      9,
                    letterSpacing: "0.04em",
                    color:         "rgba(240, 233, 218, 0.55)",
                    fontFamily:    ED_TOK.display,
                    fontWeight:    500,
                  }}>
                    Tb {s.tieBreak.a || "0"}–{s.tieBreak.b || "0"}
                  </span>
                )}
              </span>
              <ScoreCell side="b" value={s.b} active={bActive} winner={bWins}
                onClick={function () { onEditCell(i, "b"); }}/>
            </div>
          </SwipeableScoreRow>
        );
      })}
    </div>
  );
}

// ── SwipeableScoreRow ───────────────────────────────────────────
// Touch / mouse drag handler that lets the user dismiss a set row
// by swiping left or right. Threshold ≈ 40% of row width. Below the
// threshold the row snaps back; above it the row animates off and
// fires onDelete. Disabled when only one set remains (the canDelete
// flag) — the row stays interactive for tapping cells in that case.
function SwipeableScoreRow({ index, isFirst, canDelete, onDelete, children }) {
  var [dx, setDx] = useState(0);
  var [dragging, setDragging] = useState(false);
  var startX = useRef(0);
  var startY = useRef(0);
  var locked = useRef(null); // null | "x" | "y" — once decided, sticks
  var rowRef = useRef(null);

  function pointerDown(e) {
    if (!canDelete) return;
    var pt = e.touches ? e.touches[0] : e;
    startX.current = pt.clientX;
    startY.current = pt.clientY;
    locked.current = null;
    setDragging(true);
  }
  function pointerMove(e) {
    if (!dragging) return;
    var pt = e.touches ? e.touches[0] : e;
    var ddx = pt.clientX - startX.current;
    var ddy = pt.clientY - startY.current;
    if (locked.current == null) {
      if (Math.abs(ddx) < 6 && Math.abs(ddy) < 6) return;
      locked.current = Math.abs(ddx) > Math.abs(ddy) ? "x" : "y";
    }
    if (locked.current === "x") {
      // Allow horizontal scroll-like behaviour; cap at row width.
      var w = rowRef.current ? rowRef.current.clientWidth : 320;
      var capped = Math.max(-w, Math.min(w, ddx));
      setDx(capped);
      // Prevent vertical scroll while horizontally swiping.
      if (e.cancelable) e.preventDefault();
    }
  }
  function pointerEnd() {
    if (!dragging) return;
    setDragging(false);
    if (locked.current !== "x") { setDx(0); return; }
    var w = rowRef.current ? rowRef.current.clientWidth : 320;
    var threshold = w * 0.4;
    if (Math.abs(dx) > threshold) {
      // Animate off the screen, then delete.
      setDx(dx > 0 ? w : -w);
      setTimeout(function () { onDelete(); }, 180);
    } else {
      setDx(0);
    }
  }

  return (
    <div
      ref={rowRef}
      onTouchStart={pointerDown}
      onTouchMove={pointerMove}
      onTouchEnd={pointerEnd}
      onMouseDown={pointerDown}
      onMouseMove={dragging ? pointerMove : undefined}
      onMouseUp={pointerEnd}
      onMouseLeave={pointerEnd}
      style={{
        position:    "relative",
        borderTop:   isFirst ? "none" : "1px solid rgba(240, 233, 218, 0.08)",
        marginTop:   isFirst ? 0 : 4,
        paddingTop:  isFirst ? 0 : 4,
        transform:   "translateX(" + dx + "px)",
        opacity:     1 - Math.min(1, Math.abs(dx) / (rowRef.current?.clientWidth || 320)),
        transition:  dragging ? "none" : "transform 180ms cubic-bezier(0.22, 1, 0.36, 1), opacity 180ms",
        touchAction: canDelete ? "pan-y" : "auto",
        userSelect:  "none",
      }}>
      {children}
    </div>
  );
}

function ScoreCell({ side, value, active, winner, onClick }) {
  var color = winner
    ? "#B8E6C2"
    : (side === "a" ? ED_TOK.bg : "rgba(240, 233, 218, 0.55)");
  var weight = side === "a" ? 500 : 400;
  return (
    <span
      onClick={onClick}
      style={{
        display:       "inline-flex",
        alignItems:    "baseline",
        cursor:        "pointer",
        position:      "relative",
        justifyContent: side === "a" ? "flex-start" : "flex-end",
      }}>
      <span style={{
        fontFamily:     ED_TOK.display,
        fontSize:       64,
        fontWeight:     weight,
        letterSpacing:  "-0.05em",
        lineHeight:     0.85,
        color:          color,
        opacity:        value === "" ? 0.28 : 1,
        borderBottom:   "2px solid " + (active ? ED_TOK.accent : "transparent"),
        paddingBottom:  3,
        minWidth:       36,
        textAlign:      "center",
        transition:     "color 160ms, border-bottom-color 160ms",
      }}>
        {value === "" ? "0" : value}
      </span>
    </span>
  );
}

// ── DetailRow ────────────────────────────────────────────────────

function DetailRow({ label, value, sub, empty, onClick, locked }) {
  var [hover, setHover] = useState(false);
  return (
    <button
      onClick={onClick}
      disabled={locked}
      onMouseEnter={function () { if (!locked) setHover(true); }}
      onMouseLeave={function () { setHover(false); }}
      style={{
        display:        "flex",
        alignItems:     "center",
        gap:            12,
        padding:        "12px 20px",
        borderBottom:   "1px solid " + ED_TOK.line,
        background:     hover && !locked ? ED_TOK.bg2 : "transparent",
        border:         "none",
        borderLeft:     "none",
        borderRight:    "none",
        borderTop:      "none",
        width:          "100%",
        textAlign:      "left",
        cursor:         locked ? "default" : "pointer",
        color:          "inherit",
        transition:     "background 140ms",
        fontFamily:     "inherit",
      }}>
      <span style={{
        fontFamily:    ED_TOK.mono,
        fontSize:      10,
        letterSpacing: "0.12em",
        textTransform: "uppercase",
        color:         ED_TOK.muted,
        fontWeight:    600,
        width:         92,
        flex:          "0 0 auto",
        whiteSpace:    "nowrap",
      }}>
        {label}
      </span>
      <span style={{
        flex:          1,
        minWidth:      0,
        fontFamily:    ED_TOK.display,
        // 15px fits the long "League, casual, or tournament"
        // placeholder on a 375x812 viewport without truncation,
        // yet still reads as the editorial display face. Wider
        // viewports get a touch of extra breathing room.
        fontSize:      15,
        fontWeight:    500,
        letterSpacing: "-0.02em",
        color:         empty ? ED_TOK.muted : ED_TOK.ink,
        opacity:       empty ? 0.7 : 1,
        lineHeight:    1.25,
        overflow:      "hidden",
        textOverflow:  "ellipsis",
        whiteSpace:    "nowrap",
      }}>
        {value}
        {sub && (
          <small style={{
            display:       "block",
            fontFamily:    ED_TOK.mono,
            fontSize:      10.5,
            fontWeight:    500,
            letterSpacing: "0.04em",
            color:         ED_TOK.muted,
            marginTop:     2,
            overflow:      "hidden",
            textOverflow:  "ellipsis",
            whiteSpace:    "nowrap",
          }}>
            {sub}
          </small>
        )}
      </span>
      {/* Chevron hidden when row is locked — visually signals
          the row is read-only and not tappable. */}
      {locked ? (
        <span style={{
          color:         ED_TOK.muted,
          fontFamily:    ED_TOK.mono,
          fontSize:      9,
          fontWeight:    700,
          letterSpacing: "0.16em",
          textTransform: "uppercase",
          flex:          "0 0 auto",
        }}>Locked</span>
      ) : (
        <span style={{
          color:    ED_TOK.muted,
          fontSize: 18,
          flex:     "0 0 auto",
        }}>›</span>
      )}
    </button>
  );
}

// ── BottomSheet wrapper ─────────────────────────────────────────
//
// Auto-plays a slide-up animation on mount via the same .cs-sheet-
// panel CSS the legacy modal uses (defined in providers.jsx). We
// gate mount on `open` so the keyframe runs each time the sheet
// opens. Closing unmounts immediately (matches the rest of the
// app's modal close behaviour).

function BottomSheet({ open, title, onClose, children }) {
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
          padding:       "10px 22px calc(24px + env(safe-area-inset-bottom, 0px))",
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
          margin:       "0 auto 8px",
        }}/>
        <div style={{
          display:             "grid",
          gridTemplateColumns: "32px 1fr 32px",
          alignItems:          "center",
          padding:             "8px 0 14px",
        }}>
          <span/>
          <span style={{
            textAlign:     "center",
            fontFamily:    ED_TOK.mono,
            fontSize:      11,
            letterSpacing: "0.2em",
            textTransform: "uppercase",
            fontWeight:    700,
            color:         ED_TOK.ink,
          }}>
            {title}
          </span>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{
              width:        32, height: 32,
              borderRadius: "50%",
              background:   ED_TOK.bg2,
              border:       "none",
              cursor:       "pointer",
              display:      "grid",
              placeItems:   "center",
              color:        ED_TOK.ink,
              justifySelf:  "end",
            }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
              <path d="M6 6l12 12M18 6l-12 12"/>
            </svg>
          </button>
        </div>
        <div>{children}</div>
      </div>
    </>
  );
}

// ── ScoreSheet ───────────────────────────────────────────────────
// Pad mode: 0–9 keys, single-digit replaces + auto-advances. DEL
// erases. NEXT manually advances (You → Opp → next set; on the
// last cell it just dismisses the sheet).
// Tally mode: +/- per side, set selector at top.

function ScoreSheet({ sets, setSets, mode, setMode, activeSet, setActiveSet, activeSide, setActiveSide, onDone, matchType, completionType }) {
  // Validation error shown inline above the Done button. Cleared
  // automatically as the user edits scores so they get fresh
  // feedback after correcting.
  var [validationError, setValidationError] = useState("");
  useEffect(function () { setValidationError(""); }, [sets]);

  function handleDone() {
    var clean = (sets || []).filter(function (s) { return s.a !== "" || s.b !== ""; })
      .map(function (s) {
        var out = { you: s.a, them: s.b };
        if (s.tieBreak && (s.tieBreak.a !== "" || s.tieBreak.b !== "")) {
          out.tieBreak = { you: s.tieBreak.a, them: s.tieBreak.b };
        }
        return out;
      });
    if (!clean.length) {
      setValidationError("Add at least one set score.");
      return;
    }
    // Validate with the user's chosen match type / completion if
    // known; default to ranked + completed for the strictest check
    // when the user hasn't picked yet (catches the most score
    // shape errors). Time-limited / retired allows partials.
    var mt = matchType || "ranked";
    var ct = completionType || "completed";
    var allowPartial = mt === "casual" && ct !== "completed";
    var result = validateMatchScore(clean, {
      matchType:               mt,
      completionType:          ct,
      matchFormat:             null, // auto-derive from set count
      finalSetFormat:          "normal_set",
      allowPartialScores:      allowPartial,
      requireTiebreakDetails:  mt === "ranked" && ct === "completed",
      leagueMode:              null,
      leagueAllowPartial:      false,
    });
    if (!result.ok) {
      setValidationError(result.message || "That score isn't a valid tennis match.");
      return;
    }
    setValidationError("");
    onDone();
  }

  // Smart advance — picks the next field to focus based on what's
  // empty in the current set (so a user who taps Opp first and
  // types a digit lands on You afterwards, not the next set's
  // You). Order:
  //   main "a" empty?  → "a"
  //   main "b" empty?  → "b"
  //   set is 7-6 / 6-7 (tiebreak shape) and TB still partial?
  //                     → next empty TB cell (tba then tbb)
  //   otherwise → next set's "a"
  //
  // When there's nowhere left to advance to (last set, all cells
  // filled), advance is a no-op — the sheet stays open and the
  // user explicitly taps Done. Auto-closing on the last digit
  // was disorienting because the user couldn't review the
  // complete score before the sheet vanished.
  function advance() {
    var cur = sets[activeSet];
    if (!cur) return;
    if (cur.a === "" && activeSide !== "a") { setActiveSide("a"); return; }
    if (cur.b === "" && activeSide !== "b") { setActiveSide("b"); return; }
    if (isTbShape(cur)) {
      var tb = cur.tieBreak || { a: "", b: "" };
      if (tb.a === "" && activeSide !== "tba") { setActiveSide("tba"); return; }
      if (tb.b === "" && activeSide !== "tbb") { setActiveSide("tbb"); return; }
    }
    if (activeSet < sets.length - 1) {
      setActiveSet(activeSet + 1);
      setActiveSide("a");
      return;
    }
    // Nowhere to advance — stay where we are; user taps Done.
  }

  // Write the value of activeSide into the right cell. activeSide
  // can be "a"/"b" (main score) or "tba"/"tbb" (tiebreak score).
  // Side-effect: when the main score crosses the 7-6/6-7 line we
  // ensure tieBreak exists so its inputs render; when it crosses
  // back out, we drop the stale tieBreak.
  function updCell(val) {
    var next = sets.map(function (s) {
      return Object.assign({}, s, s.tieBreak ? { tieBreak: Object.assign({}, s.tieBreak) } : {});
    });
    var cur = next[activeSet];
    if (val === "del") {
      if (activeSide === "a" || activeSide === "b") {
        cur[activeSide] = (cur[activeSide] || "").slice(0, -1);
      } else {
        var tbk = activeSide === "tba" ? "a" : "b";
        if (cur.tieBreak) cur.tieBreak[tbk] = (cur.tieBreak[tbk] || "").slice(0, -1);
      }
      reconcileTieBreak(cur);
      setSets(next);
      return;
    }
    // Single-digit entry replaces + auto-advances after a tiny delay
    // so the user sees the digit land before the cursor moves.
    if (activeSide === "a" || activeSide === "b") {
      cur[activeSide] = val;
    } else {
      cur.tieBreak = cur.tieBreak || { a: "", b: "" };
      cur.tieBreak[activeSide === "tba" ? "a" : "b"] = val;
    }
    reconcileTieBreak(cur);
    setSets(next);
    setTimeout(advance, 90);
  }

  function tallyAdj(side, d) {
    var next = sets.map(function (s) {
      return Object.assign({}, s, s.tieBreak ? { tieBreak: Object.assign({}, s.tieBreak) } : {});
    });
    var v = parseInt(next[activeSet][side]) || 0;
    var nv = Math.max(0, v + d);
    next[activeSet][side] = nv === 0 ? "" : String(nv);
    reconcileTieBreak(next[activeSet]);
    setSets(next);
  }

  function addSet() {
    if (sets.length >= 5) return;
    setSets(sets.concat([{ a: "", b: "" }]));
    setActiveSet(sets.length);
    setActiveSide("a");
  }

  return (
    <div style={{ paddingBottom: 12 }}>
      <div style={{
        display:        "flex",
        justifyContent: "space-between",
        alignItems:     "center",
        marginBottom:   12,
      }}>
        <div style={{
          display:      "inline-flex",
          border:       "1px solid " + ED_TOK.line,
          borderRadius: 999,
          padding:      3,
        }}>
          <ModeToggleBtn label="Pad" on={mode === "pad"} onClick={function () { setMode("pad"); }}/>
          <ModeToggleBtn label="Tally" on={mode === "tally"} onClick={function () { setMode("tally"); }}/>
        </div>
        <span style={{
          fontFamily:    ED_TOK.mono,
          fontSize:      10.5,
          fontWeight:    700,
          letterSpacing: "0.16em",
          textTransform: "uppercase",
          color:         ED_TOK.muted,
        }}>
          Set {activeSet + 1} · {(
            activeSide === "a"   ? "You"    :
            activeSide === "b"   ? "Opp"    :
            activeSide === "tba" ? "Tb You" :
            activeSide === "tbb" ? "Tb Opp" :
            ""
          )}
        </span>
      </div>

      {mode === "pad" ? (
        <>
          {/* Mini score preview */}
          <div style={{
            background:   ED_TOK.bg2,
            borderRadius: 14,
            padding:      "16px 18px",
            display:      "flex",
            gap:          10,
            alignItems:   "baseline",
            flexWrap:     "wrap",
          }}>
            {sets.map(function (s, i) {
              var aOn = activeSet === i && activeSide === "a";
              var bOn = activeSet === i && activeSide === "b";
              return (
                <span key={i} style={{
                  display:    "inline-flex",
                  alignItems: "baseline",
                  gap:        4,
                  opacity:    activeSet === i ? 1 : 0.5,
                }}>
                  <span
                    onClick={function () { setActiveSet(i); setActiveSide("a"); }}
                    style={miniNumStyle(ED_TOK, aOn)}>
                    {s.a || "0"}
                  </span>
                  <span style={{
                    fontFamily: ED_TOK.display,
                    fontSize:   20,
                    color:      ED_TOK.muted,
                  }}>–</span>
                  <span
                    onClick={function () { setActiveSet(i); setActiveSide("b"); }}
                    style={miniNumStyle(ED_TOK, bOn)}>
                    {s.b || "0"}
                  </span>
                </span>
              );
            })}
            {sets.length < 5 && (
              <button
                onClick={addSet}
                style={{
                  width:        28, height: 28,
                  borderRadius: "50%",
                  border:       "1px dashed " + ED_TOK.lineStrong,
                  background:   "transparent",
                  color:        ED_TOK.muted,
                  cursor:       "pointer",
                  fontSize:     14,
                }}>
                +
              </button>
            )}
          </div>

          {/* Tiebreak strip — appears under the mini preview only
              when the active set is in 7-6/6-7 shape. Two small
              cells the user taps + types into via the same pad. */}
          {isTbShape(sets[activeSet]) && (
            <div style={{
              marginTop:    8,
              padding:      "10px 14px",
              background:   ED_TOK.bg2,
              borderRadius: 12,
              display:      "flex",
              alignItems:   "center",
              gap:          10,
            }}>
              <span style={{
                fontFamily:    ED_TOK.mono,
                fontSize:      9.5,
                fontWeight:    700,
                letterSpacing: "0.16em",
                textTransform: "uppercase",
                color:         ED_TOK.muted,
                flex:          "0 0 auto",
              }}>
                Tiebreak
              </span>
              <span style={{ display: "inline-flex", alignItems: "baseline", gap: 4 }}>
                <span
                  onClick={function () { setActiveSide("tba"); }}
                  style={miniTbStyle(ED_TOK, activeSide === "tba")}>
                  {(sets[activeSet].tieBreak && sets[activeSet].tieBreak.a) || "0"}
                </span>
                <span style={{ fontFamily: ED_TOK.display, fontSize: 14, color: ED_TOK.muted }}>–</span>
                <span
                  onClick={function () { setActiveSide("tbb"); }}
                  style={miniTbStyle(ED_TOK, activeSide === "tbb")}>
                  {(sets[activeSet].tieBreak && sets[activeSet].tieBreak.b) || "0"}
                </span>
              </span>
            </div>
          )}

          {/* Number pad */}
          <div style={{
            display:             "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap:                 8,
            marginTop:           12,
          }}>
            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(function (n) {
              return <PadKey key={n} onClick={function () { updCell(String(n)); }}>{n}</PadKey>;
            })}
            <PadKey variant="del" onClick={function () { updCell("del"); }}>DEL</PadKey>
            <PadKey onClick={function () { updCell("0"); }}>0</PadKey>
            <PadKey variant="ok" onClick={advance}>NEXT</PadKey>
          </div>
        </>
      ) : (
        <>
          {/* Set selector */}
          <div style={{
            display:        "flex",
            gap:            6,
            alignItems:     "center",
            justifyContent: "center",
            marginTop:      6,
          }}>
            {sets.map(function (_, i) {
              var on = activeSet === i;
              return (
                <button key={i}
                  onClick={function () { setActiveSet(i); }}
                  style={{
                    width:        28, height: 28,
                    borderRadius: 8,
                    border:       "1px solid " + (on ? ED_TOK.ink : ED_TOK.line),
                    background:   on ? ED_TOK.ink : "transparent",
                    color:        on ? ED_TOK.bg : ED_TOK.ink,
                    fontFamily:   ED_TOK.mono,
                    fontSize:     11,
                    fontWeight:   700,
                    cursor:       "pointer",
                  }}>{i + 1}</button>
              );
            })}
            {sets.length < 5 && (
              <button
                onClick={addSet}
                style={{
                  width:        28, height: 28,
                  borderRadius: 8,
                  border:       "1px dashed " + ED_TOK.lineStrong,
                  background:   "transparent",
                  color:        ED_TOK.muted,
                  fontFamily:   ED_TOK.mono,
                  fontSize:     11,
                  fontWeight:   700,
                  cursor:       "pointer",
                }}>+</button>
            )}
          </div>

          {/* Tally cards */}
          <div style={{
            display:             "grid",
            gridTemplateColumns: "1fr 1fr",
            gap:                 10,
            marginTop:           14,
          }}>
            <TallyCol label="You"      value={sets[activeSet]?.a || 0} onMinus={function(){ tallyAdj("a", -1); }} onPlus={function(){ tallyAdj("a", +1); }}/>
            <TallyCol label="Opponent" value={sets[activeSet]?.b || 0} onMinus={function(){ tallyAdj("b", -1); }} onPlus={function(){ tallyAdj("b", +1); }}/>
          </div>
        </>
      )}

      {/* Inline validation error — surfaces when the user taps
          Done with an invalid score (e.g. 9-3, or 7-6 without
          a tiebreak). Auto-clears as soon as the score changes
          so the next tap of Done re-checks against fresh state. */}
      {validationError && (
        <div style={{
          marginTop:    14,
          padding:      "12px 14px",
          background:   "rgba(195, 57, 43, 0.08)",
          border:       "1px solid rgba(195, 57, 43, 0.28)",
          borderRadius: 12,
          fontFamily:   ED_TOK.sans,
          fontSize:     13,
          color:        ED_TOK.loss,
          lineHeight:   1.45,
        }}>
          {validationError}
        </div>
      )}

      <button
        onClick={handleDone}
        style={Object.assign({}, primaryBtn(ED_TOK, false), { width: "100%", marginTop: 14 })}>
        Done
      </button>
    </div>
  );
}

function ModeToggleBtn({ label, on, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        background:    on ? ED_TOK.ink : "transparent",
        color:         on ? ED_TOK.bg : ED_TOK.ink2,
        border:        "none",
        padding:       "7px 12px",
        borderRadius:  999,
        fontFamily:    ED_TOK.mono,
        fontSize:      10.5,
        fontWeight:    700,
        letterSpacing: "0.14em",
        textTransform: "uppercase",
        cursor:        "pointer",
      }}>
      {label}
    </button>
  );
}

function PadKey({ children, onClick, variant }) {
  var ok = variant === "ok";
  var del = variant === "del";
  return (
    <button
      onClick={onClick}
      style={{
        height:       56,
        background:   ok ? ED_TOK.ink : ED_TOK.bg2,
        border:       "1px solid " + (ok ? ED_TOK.ink : ED_TOK.line),
        borderRadius: 14,
        fontFamily:   del || ok ? ED_TOK.mono : ED_TOK.display,
        fontSize:     del || ok ? 12 : 26,
        fontWeight:   ok ? 700 : 500,
        letterSpacing: del || ok ? "0.16em" : 0,
        textTransform: del || ok ? "uppercase" : "none",
        color:        ok ? ED_TOK.bg : ED_TOK.ink,
        cursor:       "pointer",
        transition:   "100ms",
      }}
      onMouseEnter={function (e) {
        if (ok) return;
        e.currentTarget.style.background = ED_TOK.ink;
        e.currentTarget.style.color = ED_TOK.bg;
      }}
      onMouseLeave={function (e) {
        if (ok) return;
        e.currentTarget.style.background = ED_TOK.bg2;
        e.currentTarget.style.color = ED_TOK.ink;
      }}>
      {children}
    </button>
  );
}

function TallyCol({ label, value, onMinus, onPlus }) {
  return (
    <div style={{
      background:    ED_TOK.bg2,
      border:        "1px solid " + ED_TOK.line,
      borderRadius:  18,
      padding:       18,
      textAlign:     "center",
      display:       "flex",
      flexDirection: "column",
      gap:           12,
    }}>
      <span style={{
        fontFamily:    ED_TOK.mono,
        fontSize:      10.5,
        fontWeight:    700,
        letterSpacing: "0.14em",
        textTransform: "uppercase",
        color:         ED_TOK.muted,
      }}>{label}</span>
      <span style={{
        fontFamily:    ED_TOK.display,
        fontSize:      80,
        fontWeight:    500,
        letterSpacing: "-0.05em",
        lineHeight:    0.9,
      }}>{value}</span>
      <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
        <TallyBtn onClick={onMinus}>−</TallyBtn>
        <TallyBtn onClick={onPlus}>+</TallyBtn>
      </div>
    </div>
  );
}

function TallyBtn({ children, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        width:        48, height: 48,
        borderRadius: "50%",
        background:   ED_TOK.bg,
        border:       "1px solid " + ED_TOK.lineStrong,
        fontSize:     22,
        cursor:       "pointer",
        color:        ED_TOK.ink,
      }}
      onMouseEnter={function (e) {
        e.currentTarget.style.background = ED_TOK.ink;
        e.currentTarget.style.color = ED_TOK.bg;
        e.currentTarget.style.borderColor = ED_TOK.ink;
      }}
      onMouseLeave={function (e) {
        e.currentTarget.style.background = ED_TOK.bg;
        e.currentTarget.style.color = ED_TOK.ink;
        e.currentTarget.style.borderColor = ED_TOK.lineStrong;
      }}>
      {children}
    </button>
  );
}

// ── CompletionSheet ──────────────────────────────────────────────

function CompletionSheet({ value, setValue, onDone }) {
  var items = [
    { id: "completed",    name: "Completed",    sub: "Match played to a normal finish" },
    { id: "time_limited", name: "Time-limited", sub: "Stopped early — partial scores OK (casual only)" },
    { id: "retired",      name: "Retired",      sub: "Someone retired — partial scores OK (casual only)" },
  ];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {items.map(function (it) {
        return (
          <ContextOption key={it.id}
            on={value === it.id}
            name={it.name}
            sub={it.sub}
            onClick={function () { setValue(it.id); onDone(); }}/>
        );
      })}
    </div>
  );
}

// ── OpponentSheet ────────────────────────────────────────────────

function OpponentSheet({ recents, allPlayers, onPick }) {
  var [q, setQ] = useState("");

  // Two pools when idle: "Recent" (recently played) + "Friends" (in
  // friends list but not in recents). Friends-only-never-played
  // showed as empty before — confusing if the user has friends in
  // the system but hasn't logged against them yet (Mdawg case).
  // When a query is typed, collapse to a single search-results list
  // over allPlayers (already de-duped).
  var recentIds = useMemo(function () {
    var s = {};
    (recents || []).forEach(function (p) { if (p && p.id) s[p.id] = true; });
    return s;
  }, [recents]);

  var friendsOnly = useMemo(function () {
    return (allPlayers || []).filter(function (p) {
      return p && p.id && !recentIds[p.id];
    });
  }, [allPlayers, recentIds]);

  var ql = q.trim().toLowerCase();
  var searchResults = ql
    ? (allPlayers || []).filter(function (p) {
        return p && p.name && p.name.toLowerCase().indexOf(ql) !== -1;
      })
    : [];

  return (
    <>
      <div style={{
        background:   ED_TOK.bg2,
        border:       "1px solid " + ED_TOK.line,
        borderRadius: 14,
        padding:      "14px 16px",
        display:      "flex",
        alignItems:   "center",
        gap:          10,
        margin:       "4px 0 14px",
      }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="2"
          style={{ color: ED_TOK.muted }}>
          <circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>
        </svg>
        <input
          autoFocus
          value={q}
          onChange={function (e) { setQ(e.target.value); }}
          placeholder="Search players or league members"
          style={{
            flex:       1,
            background: "transparent",
            border:     "none",
            outline:    "none",
            fontFamily: ED_TOK.sans,
            fontSize:   15,
            color:      ED_TOK.ink,
          }}/>
      </div>

      {ql ? (
        // ── Search results ──────────────────────────────────────
        <>
          <SectionMicro label={searchResults.length + " " + (searchResults.length === 1 ? "result" : "results")} />
          {searchResults.length === 0 ? (
            <SheetEmpty>No matches. Add by name from your friends list.</SheetEmpty>
          ) : (
            searchResults.map(function (p) {
              return (
                <OpponentRow key={p.id} player={p} onClick={function () { onPick(p); }}/>
              );
            })
          )}
        </>
      ) : (
        // ── Idle: Recent + Friends ──────────────────────────────
        <>
          {recents && recents.length > 0 && (
            <>
              <SectionMicro label="Recent" />
              {recents.map(function (p) {
                return (
                  <OpponentRow key={"r:" + p.id} player={p} onClick={function () { onPick(p); }}/>
                );
              })}
            </>
          )}
          {friendsOnly.length > 0 && (
            <>
              <SectionMicro label="Friends" topGap={recents && recents.length > 0} />
              {friendsOnly.map(function (p) {
                return (
                  <OpponentRow key={"f:" + p.id} player={p} onClick={function () { onPick(p); }}/>
                );
              })}
            </>
          )}
          {(!recents || recents.length === 0) && friendsOnly.length === 0 && (
            <SheetEmpty>No opponents yet — search by name.</SheetEmpty>
          )}
        </>
      )}
    </>
  );
}

// Mono uppercase eyebrow used between the Recent / Friends / Results
// sub-sections inside the opponent sheet. Kept local — the editorial
// MicroLabel imports cleanly but this variant takes a bit more vertical
// breathing room above when it follows another section.
function SectionMicro({ label, topGap }) {
  return (
    <div style={{
      fontFamily:    ED_TOK.mono,
      fontSize:      10.5,
      letterSpacing: "0.16em",
      textTransform: "uppercase",
      color:         ED_TOK.muted,
      fontWeight:    700,
      margin:        (topGap ? 18 : 6) + "px 0 4px",
    }}>
      {label}
    </div>
  );
}

function SheetEmpty({ children }) {
  return (
    <div style={{
      padding:    "16px 0",
      color:      ED_TOK.muted,
      fontFamily: ED_TOK.sans,
      fontSize:   14,
    }}>
      {children}
    </div>
  );
}

function OpponentRow({ player, onClick }) {
  var [hover, setHover] = useState(false);
  var initials = player.name.split(/\s+/).map(function (s) { return s[0] || ""; }).slice(0, 2).join("").toUpperCase();
  return (
    <button
      onClick={onClick}
      onMouseEnter={function () { setHover(true); }}
      onMouseLeave={function () { setHover(false); }}
      style={{
        display:        "flex",
        alignItems:     "center",
        gap:            14,
        padding:        hover ? "14px 22px" : "14px 0",
        margin:         hover ? "0 -22px" : 0,
        borderBottom:   "1px solid " + ED_TOK.line,
        background:     hover ? ED_TOK.bg2 : "transparent",
        border:         "none",
        borderTop:      "none",
        borderLeft:     "none",
        borderRight:    "none",
        textAlign:      "left",
        cursor:         "pointer",
        width:          hover ? "auto" : "100%",
        color:          "inherit",
        fontFamily:     "inherit",
        transition:     "background 140ms",
      }}>
      <span style={{
        width:        38, height: 38,
        borderRadius: "50%",
        background:   "linear-gradient(140deg, #C9A876, #8E6C3F)",
        display:      "grid",
        placeItems:   "center",
        fontFamily:   ED_TOK.mono,
        fontWeight:   700,
        fontSize:     12,
        color:        "#1A1410",
        flex:         "0 0 auto",
      }}>{initials || "?"}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontFamily:    ED_TOK.display,
          fontSize:      17,
          fontWeight:    600,
          letterSpacing: "-0.02em",
          lineHeight:    1.1,
        }}>{player.name}</div>
        <div style={{
          fontFamily: ED_TOK.mono,
          fontSize:   11,
          color:      ED_TOK.muted,
          marginTop:  2,
        }}>{player.sub || ""}</div>
      </div>
      <span style={{ color: ED_TOK.muted }}>›</span>
    </button>
  );
}

// ── TypeSheet ───────────────────────────────────────────────────

function TypeSheet({ value, setValue, leagueId, setLeagueId, activeLeagues, onDone, onCreateLeague }) {
  var hasLeagues = activeLeagues.length > 0;
  var items = [
    { id: "league",     name: "League",     sub: hasLeagues ? "Counts toward standings" : "Create one to log this" },
    { id: "casual",     name: "Casual",     sub: "Just for stats and history" },
    { id: "tournament", name: "Tournament", sub: "Round in an event" },
  ];

  function pick(id) {
    if (id === "league" && !hasLeagues) return;
    setValue(id);
    if (id !== "league") setLeagueId(null);
    if (id !== "league" || !leagueId) onDone();
    // For league with no pre-selection, leave the sheet open so the
    // user can pick which league.
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {items.map(function (it) {
        var disabled = it.id === "league" && !hasLeagues;
        return (
          <ContextOption key={it.id}
            on={value === it.id}
            disabled={disabled}
            name={it.name}
            sub={it.sub}
            onClick={function () { pick(it.id); }}/>
        );
      })}

      {/* League picker — appears under the row when League is selected */}
      {value === "league" && hasLeagues && (
        <div style={{
          marginTop:    6,
          display:      "flex",
          flexDirection: "column",
          gap:          8,
        }}>
          <span style={{
            fontFamily:    ED_TOK.mono,
            fontSize:      10.5,
            fontWeight:    700,
            letterSpacing: "0.16em",
            textTransform: "uppercase",
            color:         ED_TOK.muted,
          }}>
            Pick a league
          </span>
          {activeLeagues.map(function (lg) {
            return (
              <ContextOption key={lg.id}
                on={leagueId === lg.id}
                name={lg.name || "League"}
                sub={lg.mode === "casual" ? "Casual league" : "Ranked league"}
                onClick={function () {
                  setLeagueId(lg.id);
                  onDone();
                }}/>
            );
          })}
        </div>
      )}

      {/* Empty-state CTA when no leagues exist */}
      {!hasLeagues && (
        <div style={{
          marginTop:     14,
          padding:       20,
          border:        "1px dashed " + ED_TOK.lineStrong,
          borderRadius:  16,
          background:    ED_TOK.bg2,
          display:       "flex",
          flexDirection: "column",
          gap:           12,
          alignItems:    "flex-start",
        }}>
          <span style={{
            fontFamily:    ED_TOK.mono,
            fontSize:      10.5,
            fontWeight:    700,
            letterSpacing: "0.16em",
            textTransform: "uppercase",
            color:         ED_TOK.muted,
          }}>
            No league yet
          </span>
          <h3 style={{
            fontFamily:    ED_TOK.display,
            fontSize:      20,
            fontWeight:    600,
            letterSpacing: "-0.02em",
            margin:        0,
            lineHeight:    1.1,
          }}>
            Start a league with friends.
          </h3>
          <p style={{
            fontFamily: ED_TOK.sans,
            fontSize:   13.5,
            color:      ED_TOK.muted,
            margin:     0,
            lineHeight: 1.5,
          }}>
            A league lets you track standings and run a season together. Takes a minute.
          </p>
          <button
            onClick={onCreateLeague}
            style={{
              background:    ED_TOK.ink,
              color:         ED_TOK.bg,
              border:        "none",
              borderRadius:  999,
              padding:       "11px 18px",
              fontFamily:    ED_TOK.mono,
              fontSize:      11,
              letterSpacing: "0.16em",
              textTransform: "uppercase",
              fontWeight:    700,
              cursor:        "pointer",
            }}>
            Create league →
          </button>
        </div>
      )}
    </div>
  );
}

function ContextOption({ on, disabled, name, sub, onClick }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        display:       "flex",
        alignItems:    "center",
        gap:           14,
        padding:       "16px 18px",
        background:    on ? ED_TOK.ink : ED_TOK.bg2,
        border:        "1px solid " + (on ? ED_TOK.ink : ED_TOK.line),
        borderRadius:  16,
        cursor:        disabled ? "default" : "pointer",
        width:         "100%",
        textAlign:     "left",
        color:         on ? ED_TOK.bg : ED_TOK.ink,
        fontFamily:    "inherit",
        opacity:       disabled ? 0.55 : 1,
      }}>
      <div style={{ flex: 1 }}>
        <div style={{
          fontFamily:    ED_TOK.display,
          fontSize:      18,
          fontWeight:    600,
          letterSpacing: "-0.02em",
          lineHeight:    1.1,
        }}>
          {name}
        </div>
        <div style={{
          fontFamily: ED_TOK.mono,
          fontSize:   11,
          opacity:    0.7,
          marginTop:  3,
        }}>
          {sub}
        </div>
      </div>
    </button>
  );
}

// ── DetailsSheet ────────────────────────────────────────────────

function DetailsSheet({ details, setDetails, onDone }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <FieldGroup label="Court / location">
        <FieldInput
          placeholder="Rose Bay Tennis Club"
          value={details.court}
          onChange={function (e) { setDetails(Object.assign({}, details, { court: e.target.value })); }}
        />
      </FieldGroup>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <FieldGroup label="Date">
          <FieldInput
            type="date"
            value={details.date}
            onChange={function (e) { setDetails(Object.assign({}, details, { date: e.target.value })); }}
          />
        </FieldGroup>
        <FieldGroup label="Time">
          <FieldInput
            type="time"
            value={details.time}
            onChange={function (e) { setDetails(Object.assign({}, details, { time: e.target.value })); }}
          />
        </FieldGroup>
      </div>

      <FieldGroup label="Notes">
        <textarea
          placeholder="Windy day, came back from 1-4…"
          value={details.notes}
          onChange={function (e) { setDetails(Object.assign({}, details, { notes: e.target.value })); }}
          style={{
            background:    "transparent",
            border:        "none",
            borderBottom:  "1.5px solid " + ED_TOK.lineStrong,
            padding:       "12px 0",
            fontFamily:    ED_TOK.sans,
            fontSize:      16,
            letterSpacing: 0,
            lineHeight:    1.5,
            color:         ED_TOK.ink,
            outline:       "none",
            width:         "100%",
            resize:        "none",
            minHeight:     80,
          }}
          onFocus={function (e) { e.target.style.borderBottomColor = ED_TOK.ink; }}
          onBlur={function (e) { e.target.style.borderBottomColor = ED_TOK.lineStrong; }}
        />
      </FieldGroup>

      <button
        onClick={onDone}
        style={Object.assign({}, primaryBtn(ED_TOK, false), { marginTop: 6 })}>
        Save
      </button>
    </div>
  );
}

function FieldGroup({ label, children }) {
  return (
    <div>
      <div style={{
        fontFamily:    ED_TOK.mono,
        fontSize:      10.5,
        fontWeight:    700,
        letterSpacing: "0.16em",
        textTransform: "uppercase",
        color:         ED_TOK.muted,
        marginBottom:  -10,
      }}>
        {label}
      </div>
      {children}
    </div>
  );
}

function FieldInput(props) {
  return (
    <input
      {...props}
      style={{
        background:    "transparent",
        border:        "none",
        borderBottom:  "1.5px solid " + ED_TOK.lineStrong,
        padding:       "12px 0",
        fontFamily:    ED_TOK.display,
        fontSize:      22,
        fontWeight:    500,
        letterSpacing: "-0.02em",
        color:         ED_TOK.ink,
        outline:       "none",
        width:         "100%",
        marginTop:     14,
      }}
      onFocus={function (e) { e.target.style.borderBottomColor = ED_TOK.ink; }}
      onBlur={function (e)  { e.target.style.borderBottomColor = ED_TOK.lineStrong; }}
    />
  );
}

// ── MatchCelebration ────────────────────────────────────────────

function MatchCelebration({ data, onDone }) {
  // Slides up from the bottom on mount; unmounts when null.
  if (!data) return null;
  var won = data.won;
  var firstName = data.opp && data.opp.name ? data.opp.name.split(/\s+/)[0] : "your opponent";
  var pendingMsg = data.type === "casual" && data.status === "confirmed"
    ? "Logged. No rating impact for casual matches."
    : "We've sent this to " + firstName + " to confirm. Your rating updates once they say yes.";

  return (
    <div style={{
      position:       "fixed",
      inset:          0,
      background:     ED_TOK.ink,
      color:          ED_TOK.bg,
      zIndex:         300,
      display:        "flex",
      flexDirection:  "column",
      animation:      "csSheetIn 480ms cubic-bezier(0.22, 1, 0.36, 1) backwards",
      overflowY:      "auto",
    }}>
      <div style={{
        display:        "flex",
        justifyContent: "flex-end",
        padding:        "calc(14px + env(safe-area-inset-top, 0px)) 22px 0",
      }}>
        <button
          onClick={onDone}
          aria-label="Close"
          style={{
            width:        32, height: 32,
            borderRadius: "50%",
            background:   "rgba(240,233,218,0.1)",
            border:       "1px solid rgba(240,233,218,0.18)",
            color:        ED_TOK.bg,
            display:      "grid",
            placeItems:   "center",
            cursor:       "pointer",
            fontSize:     18,
            lineHeight:   0.8,
            fontFamily:   ED_TOK.display,
            paddingBottom: 3,
          }}>
          ×
        </button>
      </div>

      <div style={{
        flex:           1,
        padding:        "12px 22px 32px",
        display:        "flex",
        flexDirection:  "column",
        justifyContent: "center",
      }}>
        <div style={{
          fontFamily:    ED_TOK.mono,
          fontSize:      11,
          letterSpacing: "0.22em",
          textTransform: "uppercase",
          color:         "rgba(240,233,218,0.6)",
          fontWeight:    600,
          marginBottom:  14,
        }}>
          {data.status === "confirmed" ? "Match logged" : "Match logged · awaiting confirmation"}
        </div>
        <h1 style={{
          fontFamily:    ED_TOK.display,
          fontSize:      "clamp(64px, 22vw, 92px)",
          fontWeight:    500,
          letterSpacing: "-0.05em",
          lineHeight:    0.9,
          margin:        0,
          color:         won ? "#B8E6C2" : "#F0B5A8",
        }}>
          {won ? "Nice win." : "Tough one."}
        </h1>
        <p style={{
          fontFamily:    ED_TOK.display,
          fontSize:      26,
          fontWeight:    400,
          letterSpacing: "-0.02em",
          margin:        "18px 0 0",
          color:         "rgba(240,233,218,0.78)",
        }}>
          vs. {data.opp?.name || "—"}
        </p>
        <div style={{
          fontFamily:    ED_TOK.display,
          fontSize:      "clamp(40px, 14vw, 56px)",
          fontWeight:    500,
          letterSpacing: "-0.04em",
          margin:        "14px 0 30px",
          color:         ED_TOK.bg,
          lineHeight:    1,
        }}>
          {data.score}
        </div>
        {data.status === "pending_confirmation" && (
          <div style={{
            display:       "inline-flex",
            alignItems:    "baseline",
            gap:           8,
            padding:       "12px 18px",
            background:    "rgba(240,233,218,0.08)",
            borderRadius:  999,
            fontFamily:    ED_TOK.mono,
            fontSize:      12,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            color:         "rgba(240,233,218,0.85)",
            fontWeight:    600,
            alignSelf:     "flex-start",
          }}>
            <span>Pending</span>
            {data.delta != null ? (
              <span style={{
                fontFamily:    ED_TOK.display,
                fontSize:      22,
                fontWeight:    600,
                letterSpacing: "-0.02em",
                color:         data.delta >= 0 ? "#B8E6C2" : "#F0B5A8",
              }}>
                {data.delta >= 0 ? "+" : ""}{data.delta}
              </span>
            ) : (
              <span style={{
                fontFamily:    ED_TOK.display,
                fontSize:      14,
                fontWeight:    600,
                letterSpacing: "-0.02em",
                color:         "rgba(240,233,218,0.85)",
              }}>
                · awaiting confirmation
              </span>
            )}
          </div>
        )}
        {/* Rating-system caption — gives the user context for what
            the pending number means. Only shown for ranked matches
            with a known opponent rating. */}
        {data.isRanked && data.delta != null && (
          <p style={{
            marginTop:  14,
            fontFamily: ED_TOK.mono,
            fontSize:   10.5,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            color:      "rgba(240,233,218,0.55)",
            fontWeight: 600,
          }}>
            Estimated CourtSync Rating change
          </p>
        )}
        <p style={{
          marginTop:  26,
          fontFamily: ED_TOK.sans,
          fontSize:   13,
          color:      "rgba(240,233,218,0.55)",
          lineHeight: 1.5,
        }}>
          {pendingMsg}
        </p>
      </div>

      <div style={{
        display: "flex",
        gap:     10,
        padding: "14px 22px calc(28px + env(safe-area-inset-bottom, 0px))",
      }}>
        <button
          onClick={onDone}
          style={{
            flex:          1,
            background:    ED_TOK.bg,
            color:         ED_TOK.ink,
            border:        "none",
            borderRadius:  999,
            padding:       16,
            fontFamily:    ED_TOK.mono,
            fontSize:      12,
            letterSpacing: "0.16em",
            textTransform: "uppercase",
            fontWeight:    700,
            cursor:        "pointer",
          }}>
          Done
        </button>
      </div>
    </div>
  );
}

// ── helpers ─────────────────────────────────────────────────────

function primaryBtn(tok, disabled) {
  return {
    background:    tok.ink,
    color:         tok.bg,
    border:        "none",
    borderRadius:  999,
    padding:       18,
    fontFamily:    tok.mono,
    fontSize:      12,
    letterSpacing: "0.2em",
    textTransform: "uppercase",
    fontWeight:    700,
    cursor:        disabled ? "not-allowed" : "pointer",
    opacity:       disabled ? 0.3 : 1,
    transition:    "160ms",
    display:       "inline-flex",
    alignItems:    "center",
    justifyContent: "center",
    gap:           10,
    width:         "100%",
  };
}

function miniNumStyle(tok, on) {
  return {
    fontFamily:    tok.display,
    fontSize:      32,
    fontWeight:    500,
    letterSpacing: "-0.03em",
    color:         tok.ink,
    cursor:        "pointer",
    borderBottom:  "2px solid " + (on ? tok.accent : "transparent"),
  };
}

// Tiebreak cell — smaller / quieter than the main mini-preview
// numbers since the inner tiebreak score is a refinement, not the
// hero number.
function miniTbStyle(tok, on) {
  return {
    fontFamily:    tok.display,
    fontSize:      18,
    fontWeight:    500,
    letterSpacing: "-0.02em",
    color:         tok.ink,
    cursor:        "pointer",
    borderBottom:  "2px solid " + (on ? tok.accent : "transparent"),
    minWidth:      14,
    textAlign:     "center",
    paddingBottom: 1,
  };
}

function labelForType(type, leagueId, activeLeagues) {
  if (!type) return null;
  if (type === "casual") return "Casual match";
  if (type === "tournament") return "Tournament";
  if (type === "league") {
    if (!leagueId) return "League · pick one";
    var lg = activeLeagues.find(function (l) { return l.id === leagueId; });
    return lg ? "League · " + lg.name : "League";
  }
  return null;
}

function subForType(type, leagueId, activeLeagues) {
  if (type === "league" && leagueId) {
    var lg = activeLeagues.find(function (l) { return l.id === leagueId; });
    if (lg) return lg.mode === "casual" ? "Casual league standings" : "Ranked league standings";
  }
  if (type === "league" && !leagueId) return "Counts toward standings";
  if (type === "casual") return "Stats only";
  if (type === "tournament") return "Tournament round";
  return null;
}

// Resolve the match_type to send to the server based on the picked
// type / league. The server-side validate_match_league trigger
// rejects (league.mode='casual' + match_type='ranked') and the
// reverse, so the client MUST send the league's actual mode when
// filing into one. lockedLeague (router state from a "Log match"
// click inside the league detail view) is authoritative when
// present; otherwise we look the league up in the user's active
// leagues. As a last resort fall back to "ranked" for type==='league'
// — but if we hit that path the picker is in an inconsistent state.
function resolveMatchType(type, leagueId, lockedLeague, activeLeagues) {
  if (type === "casual") return "casual";
  if (type === "league" && leagueId) {
    if (lockedLeague && lockedLeague.id === leagueId && lockedLeague.mode) {
      return lockedLeague.mode === "casual" ? "casual" : "ranked";
    }
    var lg = (activeLeagues || []).find(function (l) { return l.id === leagueId; });
    if (lg && lg.mode) return lg.mode === "casual" ? "casual" : "ranked";
  }
  return "ranked";
}

function labelForCompletion(c) {
  if (c === "completed")    return "Completed";
  if (c === "time_limited") return "Time-limited";
  if (c === "retired")      return "Retired";
  return "Completed";
}

function submitHint(ready, completed, opp, type, leagueId, saving) {
  if (saving) return "Saving…";
  if (ready) return "Ready to log";
  if (completed === 0) return "Score, opponent, type";
  if (!opp) return "Pick an opponent";
  if (!type) return "Pick match type";
  if (type === "league" && !leagueId) return "Pick which league";
  return "Almost there";
}

function formatDetailsSummary(details) {
  var bits = [];
  if (details.court) bits.push(details.court);
  if (details.date) {
    var d = new Date(details.date + "T00:00");
    if (!isNaN(d.getTime())) {
      bits.push(d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" }));
    }
  }
  return bits.join(" · ");
}

function quote(text, n) {
  var t = (text || "").trim();
  if (!t) return null;
  if (t.length <= n) return "\"" + t + "\"";
  return "\"" + t.slice(0, n) + "…\"";
}

// ── Tiebreak helpers ────────────────────────────────────────────
// A set is in "tiebreak shape" when its main score is exactly
// 7-6 or 6-7 — that's the only valid main-score combo where a
// tiebreak inner score actually decided the set. We auto-init the
// tieBreak object when a set crosses INTO the shape so its
// inputs render, and drop it when the set crosses back out so
// stale TB digits don't persist on a re-edit.
function isTbShape(s) {
  if (!s) return false;
  var a = Number(s.a), b = Number(s.b);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
  return (a === 7 && b === 6) || (a === 6 && b === 7);
}

function reconcileTieBreak(set) {
  if (isTbShape(set)) {
    if (!set.tieBreak) set.tieBreak = { a: "", b: "" };
  } else {
    if (set.tieBreak) delete set.tieBreak;
  }
}

// ── Rating estimate ──────────────────────────────────────────────
// Returns the estimated viewer-side rating delta (a signed int) or
// null when we can't compute it (casual match, missing ratings,
// missing K-factor inputs). Mirrors the server's apply_match_outcome
// math so the number we show should match the server's eventual
// write within rounding tolerance.
function estimateDelta(args) {
  if (!args.isRanked) return null;
  var pr = args.profile && args.profile.ranking_points;
  var or = args.opp && args.opp.ranking_points;
  if (pr == null || or == null) return null;
  var k = getKFactor(
    (args.profile && args.profile.confirmed_ranked_match_count) || 0,
    args.profile && args.profile.rating_status
  );
  // The match-format weight downscales one-set / 2-of-3 matches
  // per the existing ratingSystem rules. translateSetsForWeight
  // converts the {a, b} state to the {you, them} shape the helper
  // expects.
  var setsForWeight = (args.sets || []).map(function (s) {
    return { you: s.you, them: s.them };
  });
  var weight = getMatchFormatWeight(setsForWeight);
  return calculateRatingChange(pr, or, args.won ? 1 : 0, { k: k, weight: weight });
}
