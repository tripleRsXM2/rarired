// src/app/App.jsx
import { useState, useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { makeTheme, normaliseThemeId, THEME_IDS } from "../lib/theme.js";
import { avColor } from "../lib/utils/avatar.js";
import { TABS } from "../lib/constants/ui.js";
import { NAV_ICONS } from "../lib/constants/navIcons.jsx";
import { insertNotification, deleteNotification } from "../features/notifications/services/notificationService.js";
import { markMatchTagStatus } from "../features/scoring/services/matchService.js";
import { createGroupConversation, sendMessage as dmSendMessage } from "../features/people/services/dmService.js";
import { track } from "../lib/analytics.js";

import Providers from "./providers.jsx";
import Sidebar from "./Sidebar.jsx";
import ServiceHealthBanner from "../components/ui/ServiceHealthBanner.jsx";
import RightPanel from "../features/home/components/RightPanel.jsx";

import { useAuthController } from "../features/auth/hooks/useAuthController.js";
import { useCurrentUser } from "../features/profile/hooks/useCurrentUser.js";
import { useMatchHistory } from "../features/scoring/hooks/useMatchHistory.js";
import { useSocialGraph } from "../features/people/hooks/useSocialGraph.js";
import { useDMs } from "../features/people/hooks/useDMs.js";
import { usePresenceHeartbeat } from "../features/people/hooks/usePresenceHeartbeat.js";
import { useNotifications } from "../features/notifications/hooks/useNotifications.js";
import { useTournamentManager } from "../features/tournaments/hooks/useTournamentManager.js";
import { useChallenges } from "../features/challenges/hooks/useChallenges.js";
import { useLeagues } from "../features/leagues/hooks/useLeagues.js";
// usePacts hook retired alongside the Tindis match-pact feature.

import HomeTab from "../features/home/pages/HomeTab.jsx";
import TournamentsTab from "../features/tournaments/pages/TournamentsTab.jsx";
import CompeteHub      from "../features/tournaments/pages/CompeteHub.jsx";
import PeopleTab from "../features/people/pages/PeopleTab.jsx";
import ProfileTab from "../features/profile/pages/ProfileTab.jsx";
import PlayerProfileView from "../features/profile/pages/PlayerProfileView.jsx";
import AdminTab from "../features/admin/pages/AdminTab.jsx";
import MapTab from "../features/map/pages/MapTab.jsx";
// PactsTab retired — Tindis was removed before launch. Routes
// landing on /tindis fall through to the home tab now.
import { setHomeZone } from "../features/map/services/mapService.js";
import SettingsScreen from "../features/settings/pages/SettingsScreen.jsx";

import NotificationsPanel from "../features/notifications/components/NotificationsPanel.jsx";
import ActionReviewDrawer from "../features/notifications/components/ActionReviewDrawer.jsx";
import AuthModal from "../features/auth/components/AuthModal.jsx";
import InviteMatchPage from "../features/scoring/pages/InviteMatchPage.jsx";
import { parseInvitePath } from "../features/scoring/utils/inviteUrl.js";
import ComposeMessageModal from "../features/people/components/ComposeMessageModal.jsx";
import OnboardingModal from "../features/auth/components/OnboardingModal.jsx";
import ScheduleModal from "../features/tournaments/components/ScheduleModal.jsx";
import ScoreModal from "../features/scoring/components/ScoreModal.jsx";
// CommentModal retired — replaced by FeedInteractionsModal (Kudos + Comments
// tabs) which lives under HomeTab. matchHistory.commentModal state is kept
// for any legacy caller and is harmless if set.
import DisputeModal from "../features/scoring/components/DisputeModal.jsx";
import ChallengeModal from "../features/challenges/components/ChallengeModal.jsx";
import { useToasts, ToastStack } from "../components/ui/Toast.jsx";
// Module 10 Slice 2 — private post-match feedback prompt.
// Mounts at App-level after the opponent confirms a match so the
// truth loop is complete before we ask "how was it?".
import PostMatchFeedbackCard, { feedbackCardWasDismissed }
  from "../features/trust/components/PostMatchFeedbackCard.jsx";

export default function App(){
  // Theme bootstrap — migrate any legacy id ("wimbledon" → "grass", etc.)
  // on load so old localStorage doesn't keep us on a renamed theme forever.
  var [theme,setTheme]=useState(function(){
    var s=localStorage.getItem("theme");
    var next=normaliseThemeId(s);
    if(s!==next) localStorage.setItem("theme",next);
    return next;
  });
  var t=makeTheme(theme);
  function applyTheme(name){
    if(!THEME_IDS.includes(name)) return;
    localStorage.setItem("theme",name);
    setTheme(name);
  }

  // Module 6: app-wide toast emitter. Replaces window.alert() everywhere.
  // toast(msg, 'error'|'success'|'info').
  var toastSystem=useToasts();
  var toast=toastSystem.emit;

  var location=useLocation();
  var navigate=useNavigate();

  // Derive active top-level tab from the URL path.
  // 'tindis' removed from validTabs after the pact feature was
  // retired pre-launch. Old deep links land here, fail validation,
  // and default-redirect to the home tab below.
  var validTabs=["home","map","tournaments","people","profile","admin"];
  var pathParts=location.pathname.split("/").filter(Boolean);
  var tab=(pathParts[0]&&validTabs.includes(pathParts[0]))?pathParts[0]:"home";

  // /profile/<userId> → public profile view. Empty second segment or a match
  // with the signed-in user's id falls back to the own-profile ProfileTab.
  var profilePathId = (pathParts[0]==="profile"&&pathParts[1])?pathParts[1]:null;

  // Navigate to a top-level tab. Switching to "people" lands on /people/messages,
  // switching to "tournaments" (Compete) lands on the new CompeteHub at
  // /tournaments (Module 13 Slice 1). The deeper /tournaments/list,
  // /tournaments/challenges, and /tournaments/leagues routes still
  // resolve to TournamentsTab below — direct deep-links and in-page
  // navigation are unchanged.
  function setTab(x){
    if(x==="people") navigate("/people/messages");
    else if(x==="tournaments") navigate("/tournaments");
    else navigate("/"+x);
  }

  // Open another player's profile. If it's the signed-in user, go to the
  // own-profile tab instead so editing affordances remain available.
  function openProfile(userId){
    if(!userId) return;
    if(auth.authUser&&userId===auth.authUser.id) navigate("/profile");
    else navigate("/profile/"+userId);
  }

  // ── Map tab — home-zone handlers ──────────────────────────────────────────
  // Persist profile.home_zone to Supabase and mirror into local profile state
  // so the map pin + settings UI update without a refresh.
  async function applyHomeZone(zoneId){
    if(!auth.authUser) return;
    var r = await setHomeZone(auth.authUser.id, zoneId);
    if(r.error){ toast((r.error && r.error.message) || "Could not set home zone", "error"); return; }
    currentUser.setProfile(function(p){ return Object.assign({}, p, {home_zone: zoneId}); });
  }
  function clearHomeZone(){ applyHomeZone(null); }

  // Redirect bare "/" to /home on first load.
  useEffect(function(){
    if(location.pathname==="/"||location.pathname==="")navigate("/home",{replace:true});
  },[]);

  var [profileTab,setProfileTab]=useState("overview");
  var [showSettings,setShowSettings]=useState(false);

  // Coordinator ref — lets useAuthController callbacks reach feature hooks
  // that are declared after it without stale closures.
  var coordRef=useRef({});

  // Auth first (owns session lifecycle). Callbacks read from coordRef at event time.
  var auth=useAuthController({
    onSessionRestored:function(u){if(coordRef.current.bootstrap)coordRef.current.bootstrap(u,false);},
    onFreshSignIn:function(u){if(coordRef.current.bootstrap)coordRef.current.bootstrap(u,true);},
    onSignOut:function(){if(coordRef.current.reset)coordRef.current.reset();},
  });

  var currentUser=useCurrentUser();
  var matchHistory=useMatchHistory({
    authUser:auth.authUser,
    profile:currentUser.profile,
    sendNotification:insertNotification,
    bumpStats:currentUser.bumpMatchStats,
    refreshProfile:currentUser.refreshProfileUI,
    // Module 4: when a logged match was sourced from an accepted challenge,
    // mark that challenge row 'completed' and link the match_id.
    onMatchLoggedFromChallenge: function(challengeId, matchId){
      if(coordRef.current.markChallengeAsConverted)
        coordRef.current.markChallengeAsConverted(challengeId, matchId);
    },
  });
  var social=useSocialGraph({ authUser:auth.authUser });
  // Pass friends list so DM logic can bypass the request gate for friends.
  var dms=useDMs({
    authUser:auth.authUser,
    friends:social.friends,
    blockedUserIds: (social.blockedUsers || []).map(function(b){return b.id;}),
  });
  usePresenceHeartbeat(auth.authUser);
  var notifications=useNotifications({
    authUser:auth.authUser,
    updateMatchTagStatus:markMatchTagStatus,
    onMatchTagAccepted:function(matchRow){
      // useNotifications.acceptMatchTag now routes through the SECURITY
      // DEFINER RPC confirm_match_and_update_stats, which:
      //   • transitions match_history.status → 'confirmed'
      //   • runs apply_match_outcome (real ELO + stats) atomically
      // so the stats are already correct server-side by the time we get
      // here. Client only needs to (a) splice the confirmed row into
      // local history, (b) re-read the profile to pick up new values.
      //
      // The old bumpMatchStats path is superseded — keeping the function
      // around in useCurrentUser is harmless but its callers should now
      // route through the canonical confirmation RPC instead.
      matchHistory.applyAcceptedTagMatch(matchRow);
      if(auth.authUser)currentUser.refreshProfileUI(auth.authUser.id);
      setTab("home");
    },
  });
  var tournaments=useTournamentManager({
    themeTokens:t,
    profile:currentUser.profile,
    myId:auth.authUser?auth.authUser.id:"local-user",
    requireAuth:auth.requireAuth,
  });
  var challenges=useChallenges({ authUser:auth.authUser });
  var leagues=useLeagues({ authUser:auth.authUser });
  // var pacts = ... — retired with Tindis.

  var myId=auth.authUser?auth.authUser.id:"local-user";

  // Wire up coordinator after all hooks are declared.
  useEffect(function(){
    coordRef.current={
      bootstrap: async function(supabaseUser, isFresh){
        var res=await currentUser.loadProfile(supabaseUser);
        auth.setAuthInitialized(true);
        // Module 3.5: fresh sign-in splits into signup-completed vs login-completed
        // based on whether loadProfile just created the row.
        if(isFresh){
          track(res.isNew?"auth_signup_completed":"auth_login_completed",{});
        }
        await Promise.all([
          matchHistory.loadHistory(supabaseUser.id),
          social.loadSocial(supabaseUser.id, res.profile),
          notifications.loadNotifications(supabaseUser.id),
          // Pass user.id explicitly — bootstrap fires before the
          // SIGNED_IN render lands, so the hook's authUser closure can
          // still be null at this moment. Other loaders already do
          // this; dms was the lone outlier and that's why /people/messages
          // could stay stuck on the skeleton after a hard refresh.
          dms.loadConversations(supabaseUser.id),
          challenges.loadChallenges(supabaseUser.id),
        ]);
        if(res.isNew&&isFresh)currentUser.triggerOnboarding();
      },
      reset: function(){
        // Sign-out reset: clear every per-user cache in memory so the next
        // session starts clean (no prior user's profile, match history,
        // social graph, DMs, notifications, or challenges bleeding through).
        // Also drop the transient UI state that's tied to a signed-in session
        // (profile sub-tab, open Settings sheet, open review drawer). Theme
        // is deliberately preserved — it's a device preference, not per-user.
        currentUser.resetProfile();
        matchHistory.resetHistory();
        social.resetSocial();
        dms.resetDMs();
        notifications.resetNotifications();
        challenges.resetChallenges();
        leagues.resetLeagues();
        setProfileTab("overview");
        setShowSettings(false);
        setReviewDrawer(null);
      },
      // Module 4: bridges the useMatchHistory→useChallenges call from inside a
      // coordRef so we don't have to re-order the hook declarations.
      markChallengeAsConverted: function(challengeId, matchId){
        if(challenges&&challenges.markChallengeAsConverted)
          challenges.markChallengeAsConverted(challengeId, matchId);
      },
    };
  });

  // Module 2 — refresh Discover "People you've played" whenever the relevant
  // inputs change. Cheap (≤8 profile rows fetched) and self-healing: adding a
  // friend moves them out of the section automatically.
  useEffect(function(){
    if(!auth.authUser) return;
    social.loadPlayedOpponents(matchHistory.history);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[
    auth.authUser&&auth.authUser.id,
    matchHistory.history.length,
    social.friends.length,
    social.sentRequests.length,
    social.receivedRequests.length,
    social.blockedUsers.length,
  ]);

  // Opens a conversation from the notifications panel. Prefers lookup by
  // entity_id (conversation_id), falls back to the sender's user id for
  // legacy notifications created before entity_id was being stored.
  function openConvById(convId, fromUserId){
    var all=[].concat(dms.conversations||[], dms.requests||[]);
    var found=null;
    if(convId) found=all.find(function(c){return c.id===convId;});
    if(!found&&fromUserId){
      found=all.find(function(c){return c.partner&&c.partner.id===fromUserId;});
    }
    if(found) dms.openConversation(found);
    navigate("/people/messages");
  }

  // Auto-dismiss tray rows related to an opened DM conversation:
  //   • `message`                  — collapsed-per-conv unread row
  //   • `message_request_accepted` — "X accepted your request" row
  //     (the original sender sees this; opening the conv means they've
  //     clearly seen the acceptance, so the row is now stale)
  //
  // We match by entity_id === conv.id (canonical) and, for legacy rows
  // without entity_id, fall back to from_user_id === partner.
  // `message_request` rows are deliberately NOT dismissed here — the
  // recipient still has to accept/decline before they become stale.
  useEffect(function(){
    var conv=dms.activeConv;
    if(!conv||conv.status!=='accepted')return;
    var partnerId=conv.partner&&conv.partner.id;
    var DISMISSIBLE_TYPES={ message:1, message_request_accepted:1 };
    var matches=notifications.notifications.filter(function(n){
      if(!DISMISSIBLE_TYPES[n.type])return false;
      if(n.entity_id===conv.id)return true;
      if(!n.entity_id&&partnerId&&n.from_user_id===partnerId)return true;
      return false;
    });
    if(!matches.length)return;
    matches.forEach(function(n){deleteNotification(n.id);});
    var ids={};matches.forEach(function(n){ids[n.id]=true;});
    notifications.setNotifications(function(ns){
      return ns.filter(function(n){return!ids[n.id];});
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[dms.activeConv&&dms.activeConv.id]);

  // Close the NotificationsPanel whenever a conversation thread opens.
  // The panel is a position:fixed 380px right-side overlay with a
  // full-viewport click-outside scrim (z:45). On desktop the overlay
  // sits exactly on top of where the DM thread renders, which swallows
  // clicks on bubbles / action menus / emoji button. "One drawer at a
  // time": opening a thread implicitly dismisses the panel.
  useEffect(function(){
    if(dms.activeConv) notifications.setShowNotifications(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[dms.activeConv&&dms.activeConv.id]);

  // Auto-dismiss any "friend_request" notifications from senders who are
  // already friends — happens once the request is accepted (from requests tab,
  // settings, or notifications panel), making the notification stale.
  useEffect(function(){
    if(!social.friends.length||!notifications.notifications.length)return;
    var friendIds={};
    social.friends.forEach(function(f){friendIds[f.id]=true;});
    var stale=notifications.notifications.filter(function(n){
      return n.type==='friend_request'&&friendIds[n.from_user_id];
    });
    if(!stale.length)return;
    stale.forEach(function(n){deleteNotification(n.id);});
    var staleIds={};stale.forEach(function(n){staleIds[n.id]=true;});
    notifications.setNotifications(function(ns){
      return ns.filter(function(n){return!staleIds[n.id];});
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[social.friends.length, notifications.notifications.length]);

  function openLogMatch(){
    matchHistory.setCasualOppName("");
    matchHistory.setScoreModal({casual:true,oppName:"",tournName:"Casual Match"});
    matchHistory.setScoreDraft({sets:[{you:"",them:""}],result:"win",notes:"",date:new Date().toISOString().slice(0,10),venue:"",court:""});
  }

  // Open the Log Match flow locked to a specific league. Used by
  // LeaguesPanel's per-league "+ Log match" button. Three locks:
  //
  //   1. The opponent picker is restricted to active members of
  //      this league only (memberIds passed by the caller). This
  //      is enforced inside ScoreModal by filtering `friends` and
  //      clearing `suggestedPlayers` when scoreModal.lockedLeague
  //      is present.
  //
  //   2. The league selector inside MatchComposer is replaced by a
  //      read-only chip — the user can't change which league this
  //      match files into, and can't drop it to "No Competition".
  //
  //   3. matchType is locked to the league's mode so the match
  //      files as ranked/casual matching the league. validate_match_league
  //      enforces this server-side too.
  //
  // Always opens in `casual:true` mode (the score-modal path that
  // renders the OpponentPicker). casual:false is the verified
  // resubmit flow which expects a linked opponent already known.
  function openLogMatchInLeague(league, memberIds){
    if(!league||!league.id) { openLogMatch(); return; }
    var mode = league.mode === "casual" ? "casual" : "ranked";
    matchHistory.setCasualOppName("");
    matchHistory.setScoreModal({
      casual:    true,
      oppName:   "",
      tournName: mode === "casual" ? "Casual Match" : "",
      // Lock context — read by ScoreModal + MatchComposer to
      // restrict opponent picker, lock the league selector, and
      // hide the match-type picker.
      lockedLeague: {
        id:        league.id,
        name:      league.name,
        mode:      mode,
        memberIds: Array.isArray(memberIds) ? memberIds.slice() : [],
      },
    });
    matchHistory.setScoreDraft({
      sets:           [{you:"",them:""}],
      result:         "win",
      notes:          "",
      date:           new Date().toISOString().slice(0,10),
      venue:          "",
      court:          "",
      matchType:      mode,
      completionType: "completed",
      leagueId:       league.id,
    });
  }

  // Module 4: composer entry points.
  // openChallenge(targetUser, source, sourceMatch?) — used by profile & feed-card
  // "Challenge"/"Rematch" CTAs. For rematch we prefill venue/court from the source.
  function openChallenge(targetUser, source, sourceMatch){
    if(!auth.authUser){auth.openLogin();return;}
    if(!targetUser||!targetUser.id||targetUser.id===auth.authUser.id) return;
    challenges.openComposer(targetUser, source||"profile", sourceMatch&&sourceMatch.id);
    if(source==="rematch"&&sourceMatch){
      challenges.setDraft({
        message:"",
        venue: sourceMatch.venue||"",
        court: sourceMatch.court||"",
        proposed_at:"",
      });
    }
  }

  // openConvertToMatch(challenge, partnerProfile) — opens ScoreModal prefilled
  // for an accepted challenge. On successful submit, useMatchHistory will mark
  // the challenge as completed via the sourceChallengeId on the modal context.
  function openConvertToMatch(challenge, partnerProfile){
    if(!challenge||!partnerProfile) return;
    matchHistory.setCasualOppName(partnerProfile.name||"");
    matchHistory.setCasualOppId(partnerProfile.id||null);
    matchHistory.setScoreModal({
      casual:true,
      oppName:partnerProfile.name||"",
      opponentId:partnerProfile.id||null,
      tournName:"Ranked",
      sourceChallengeId: challenge.id,
    });
    matchHistory.setScoreDraft({
      sets:[{you:"",them:""}], result:"win", notes:"",
      date:new Date().toISOString().slice(0,10),
      venue: challenge.venue||"",
      court: challenge.court||"",
    });
  }

  // Module 10 Slice 2 — pending post-match feedback prompt. Shape:
  //   { matchId, reviewedUserId, reviewedName }
  // Set after the viewer (acting as opponent) confirms a match. Cleared
  // on submit, skip, or sessionStorage cooldown. Only ever set for
  // matches where opponent_id is linked (no freetext) — RPC-side
  // eligibility blocks the rest.
  var [pendingFeedbackMatch,setPendingFeedbackMatch]=useState(null);

  // Wraps useMatchHistory.confirmOpponentMatch. On success, queues the
  // feedback prompt for the just-confirmed match (unless the user has
  // already dismissed feedback for this match in this tab session).
  // Same return shape as the underlying call so existing callers keep
  // working.
  async function confirmOpponentMatchAndAskFeedback(match){
    var r = await matchHistory.confirmOpponentMatch(match);
    if (r && !r.error && match && match.id) {
      var oppId = match.submitterId
        || (match.isTagged ? match.user_id : match.opponent_id);
      var oppName = match.friendName || match.oppName || "your opponent";
      // Only mount if there's a real linked party AND the user hasn't
      // dismissed feedback for this match already.
      if (oppId && !feedbackCardWasDismissed(match.id)) {
        setPendingFeedbackMatch({
          matchId: String(match.id),
          reviewedUserId: oppId,
          reviewedName: oppName,
        });
      }
    }
    return r;
  }

  // ── In-context notification review drawer ────────────────────────────────
  var [reviewDrawer,setReviewDrawer]=useState(null); // { match, notifId, notifType, fromName }

  // Phase 2 polish — inline compose modal triggered from the map. Keeps
  // users on the map while they pick a template + date/time and fire off
  // a first DM. Shape: { partner, venue, date, time, zoneId, courtName }
  // or null. Set by MapTab's onMessagePlayer; consumed by the
  // ComposeMessageModal we render below the routes.
  var [composeTarget,setComposeTarget]=useState(null);

  // Play Match wizard direct-send (Option A — background send).
  // - 1 partner  → existing 1:1 flow via useDMs.
  // - 2+ partners → single group conversation via create_group_conversation
  //   RPC + one message insert. Avoids fanning N DMs and keeps the wizard's
  //   "doubles invite" semantics in one thread everyone shares.
  async function onPlayMatchSend(partners, ctx){
    if(!Array.isArray(partners) || !partners.length || !dms) return;
    var draft = (ctx && ctx.draft) || "";
    if(!draft) return;
    var slot = (ctx && (ctx.venue || ctx.date || ctx.time))
      ? { venue: ctx.venue, date: ctx.date || "", time: ctx.time || "" }
      : null;
    var viewAction = {
      label: "View →",
      onClick: function(){ navigate("/people/messages"); },
    };

    if(partners.length === 1){
      var p = partners[0];
      if(!p || !p.id){ toast("Couldn't send invite — try again", "error"); return; }
      try {
        var opened = await dms.openConversationWith(p, { slot: slot, draft: draft });
        if(opened && opened.error){ toast("Couldn't send invite — try again", "error"); return; }
        var sent = await dms.sendMessage(draft);
        if(sent && sent.error){ toast("Couldn't send invite — try again", "error"); return; }
      } catch(_){ toast("Couldn't send invite — try again", "error"); return; }
      toast("Invite sent ✓", "success", { action: viewAction });
      return;
    }

    // Group invite (partners.length >= 2).
    var otherIds = partners.filter(function(p){ return p && p.id; }).map(function(p){ return p.id; });
    if(!otherIds.length){ toast("Couldn't send invite — try again", "error"); return; }
    try {
      var g = await createGroupConversation(otherIds);
      if(g.error){
        if(g.error.code === 'block_conflict'){
          toast("That group can't be created right now. Try messaging them individually instead.", "error");
        } else {
          toast("Couldn't send invite — try again", "error");
        }
        return;
      }
      var convId = g.data;
      var meId = auth.authUser && auth.authUser.id;
      if(!convId || !meId){ toast("Couldn't send invite — try again", "error"); return; }
      var s = await dmSendMessage(convId, meId, draft, null);
      if(s && s.error){ toast("Couldn't send invite — try again", "error"); return; }
    } catch(_){ toast("Couldn't send invite — try again", "error"); return; }

    track("group_conversation_created", {
      source: "doubles_invite",
      participant_count: partners.length + 1,
    });
    toast("Group invite sent ✓", "success", { action: viewAction });
  }

  // Notif types that always carry a proposal — stale local match needs a DB refresh.
  var PROPOSAL_NOTIF_TYPES=new Set(['match_disputed','match_correction_requested','match_counter_proposed']);

  async function openReviewDrawer(n){
    var matchId=n.match_id;
    if(!matchId)return;
    var match=matchHistory.history.find(function(m){return String(m.id)===String(matchId);});
    if(!match){
      // Not in local history yet — reload then navigate to feed as fallback.
      if(auth.authUser)matchHistory.loadHistory(auth.authUser.id);
      return;
    }
    // If the notification requires a proposal but the local copy doesn't have one
    // yet (realtime notification arrived before the history was reloaded), fetch a
    // fresh row from DB so the drawer has accurate data to display.
    if(PROPOSAL_NOTIF_TYPES.has(n.type)&&!match.currentProposal){
      var fresh=await matchHistory.refreshSingleMatch(String(matchId),match.isTagged);
      if(fresh) match=fresh;
    }
    setReviewDrawer({match,notifId:n.id,notifType:n.type,fromName:n.fromName||"Someone"});
    notifications.setShowNotifications(false);
  }

  // Secondary entry point: open the Review drawer directly from a match row
  // (e.g. RightPanel "Needs your action" pending-action chip). Derives the
  // appropriate notifType from the match status + isTagged so the drawer
  // picks the right Accept action (confirm vs acceptCorrection).
  function openReviewForMatch(match){
    if(!match) return;
    var notifType =
      match.status === "pending_confirmation" ? "match_tag"
      : match.status === "pending_reconfirmation" ? "match_counter_proposed"
      : match.status === "disputed" ? "match_disputed"
      : null;
    if(!notifType) return;
    // fromName is the OTHER party — if we're the tagged user, it's the submitter
    // (best effort from normalizeMatch's enrichment: friendName || oppName).
    var fromName = match.isTagged
      ? (match.friendName || match.oppName || "Someone")
      : (match.oppName || "Someone");
    setReviewDrawer({ match: match, notifId: null, notifType: notifType, fromName: fromName });
  }

  // Module 3: fires a `comment` notification to every match participant
  // except the commenter. A match has up to two real people (submitter +
  // opponent) — either of them commenting should reach the other; a third
  // party commenting reaches both. Keeps the modal thin — all lookup +
  // participant logic lives here.
  function notifyMatchOwnerOfComment(matchId){
    if(!auth.authUser) return;
    var match=matchHistory.history.find(function(m){return String(m.id)===String(matchId);});
    if(!match) return;
    var toNotify=[match.submitterId, match.opponent_id].filter(function(uid,i,arr){
      return uid && uid!==auth.authUser.id && arr.indexOf(uid)===i;
    });
    toNotify.forEach(function(uid){
      insertNotification({
        user_id:      uid,
        type:         "comment",
        from_user_id: auth.authUser.id,
        match_id:     match.id,
      });
    });
  }

  function openCounterPropose(match){
    // Opens the existing DisputeModal in counter mode — reuse existing UX.
    matchHistory.setDisputeModal({match,mode:'counter'});
    matchHistory.setDisputeDraft({
      reasonCode:'',reasonDetail:'',
      sets:(match.currentProposal&&match.currentProposal.sets)||match.sets||[{you:'',them:''}],
      result:match.result,
      date:match.rawDate||new Date().toISOString().slice(0,10),
      venue:match.venue||'',court:match.court||'',
    });
  }

  // Module-fix: parallel helper for the match_tag → Dispute path from the
  // Review drawer. Opens the DisputeModal in 'dispute' mode (first-round),
  // prefilling from the logged match.
  function openDisputeFromTag(match){
    matchHistory.setDisputeModal({match,mode:'dispute'});
    matchHistory.setDisputeDraft({
      reasonCode:'', reasonDetail:'',
      sets: match.sets && match.sets.length ? match.sets : [{you:'',them:''}],
      result: match.result,
      date: match.rawDate || new Date().toISOString().slice(0,10),
      venue: match.venue || '', court: match.court || '',
    });
  }

  // ── Module 9: opponent-invite landing page ────────────────────────────
  // /invite/match/<token> short-circuits the regular shell. The page
  // handles its own auth-redirect via the AuthModal hook so we render
  // it for both logged-in and logged-out users. parseInvitePath
  // validates the token shape so a bogus URL falls through to /home.
  var invitePath = parseInvitePath(location.pathname);
  if (invitePath) {
    return (
      <Providers t={t} theme={theme}>
        <ServiceHealthBanner/>
        <InviteMatchPage
          t={t}
          token={invitePath}
          authUser={auth.authUser}
          openAuth={function (opts) {
            // The opts.next contains the invite URL we want to come
            // back to. Stash it for AuthModal + open the modal.
            try { sessionStorage.setItem("cs_auth_next", (opts && opts.next) || (location.pathname + location.search)); } catch (_) {}
            auth.setShowAuth(true);
          }}
        />
        {auth.showAuth && (
          <AuthModal
            t={t}
            showAuth={auth.showAuth} setShowAuth={auth.setShowAuth}
            authMode={auth.authMode} setAuthMode={auth.setAuthMode}
            authStep={auth.authStep} setAuthStep={auth.setAuthStep}
            authEmail={auth.authEmail} setAuthEmail={auth.setAuthEmail}
            authPassword={auth.authPassword} setAuthPassword={auth.setAuthPassword}
            authName={auth.authName} setAuthName={auth.setAuthName}
            authLoading={auth.authLoading} setAuthLoading={auth.setAuthLoading}
            authNewPassword={auth.authNewPassword} setAuthNewPassword={auth.setAuthNewPassword}
            authNewPassword2={auth.authNewPassword2} setAuthNewPassword2={auth.setAuthNewPassword2}
            authError={auth.authError} setAuthError={auth.setAuthError}
            authFieldErrors={auth.authFieldErrors} setAuthFieldErrors={auth.setAuthFieldErrors}
          />
        )}
      </Providers>
    );
  }

  return (
    <Providers t={t} theme={theme}>
      {/* Service-health banner — sits above the shell, only renders
          when supabase API is degraded/down. See lib/healthMonitor
          for the state machine + lib/supabase for the wrapped fetch
          that feeds it. */}
      <ServiceHealthBanner/>
      {/* ── 3-column shell: sidebar | center | right ──────────────────────── */}
      <div className="cs-shell" style={{color:t.text}}>

        {/* LEFT SIDEBAR — desktop only, controlled by .cs-sidebar-col CSS */}
        <div className="cs-sidebar-col">
          <Sidebar
            t={t} tab={tab} setTab={setTab}
            profile={currentUser.profile} authUser={auth.authUser}
            unreadCount={notifications.unreadCount()}
            dmUnreadCount={dms.totalUnread()}
            showNotifications={notifications.showNotifications}
            setShowNotifications={notifications.setShowNotifications}
            markSeen={notifications.markSeen}
            onOpenSettings={function(){currentUser.setProfileDraft(currentUser.profile);setShowSettings(true);}}
            openLogin={auth.openLogin}
          />
        </div>

        {/* CENTER COLUMN */}
        <div className={"cs-center-col cs-outer-pad" + (tab==="map" ? " cs-center-col-map" : "")}>

          {/* MOBILE top nav — hidden on desktop via .cs-mob-nav CSS.
              paddingTop:env(safe-area-inset-top) keeps content below
              the iOS status bar / Dynamic Island when the PWA runs in
              standalone mode (apple-mobile-web-app-status-bar-style is
              "black-translucent", which paints page content behind the
              system bar by design — without this padding the CS logo
              and bell sit under the clock). The --cs-nav-h CSS variable
              bakes the same inset, so .cs-map-frame + any other layout
              math stays consistent on notched devices. */}
          <nav className="cs-mob-nav" style={{position:"sticky",top:0,zIndex:40,backdropFilter:"blur(24px)",WebkitBackdropFilter:"blur(24px)",background:t.navBg,borderBottom:"1px solid "+t.border,paddingTop:"env(safe-area-inset-top, 0px)"}}>
            {/* No maxWidth cap — content stretches edge-to-edge.
                User feedback: 'when resizing the window, court sync
                symbol at the top + profile picture/bell don't stick
                to the side, there is a little gap sometimes.' Cap
                used to be 680px which left a gutter on viewports
                between 720px and 1023px (mobile-nav range). */}
            <div style={{width:"100%",padding:"0 16px",height:52,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
              <div style={{display:"flex",alignItems:"center",gap:8}}>
                <div style={{width:26,height:26,borderRadius:4,background:t.accent,display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,fontWeight:800,color:t.accentText,letterSpacing:"-0.5px",flexShrink:0}}>CS</div>
                <span style={{fontSize:15,fontWeight:700,letterSpacing:"-0.5px",color:t.text}}>CourtSync</span>
              </div>
              <div style={{display:"flex",gap:6,alignItems:"center"}}>
                {auth.authUser&&(
                  <button
                    onClick={function(){notifications.setShowNotifications(function(v){return!v;});if(!notifications.showNotifications)notifications.markSeen();}}
                    title="Notifications"
                    style={{
                      position:"relative",width:32,height:32,
                      background:"transparent",border:"none",padding:0,
                      display:"flex",alignItems:"center",justifyContent:"center",
                      color:notifications.unreadCount()>0?t.accent:t.textSecondary,
                      transition:"color 0.15s",cursor:"pointer",
                    }}>
                    {NAV_ICONS.notifications(18)}
                    {notifications.unreadCount()>0&&(
                      <div style={{position:"absolute",top:-2,right:-2,minWidth:14,height:14,padding:"0 3px",borderRadius:8,background:t.accent,border:"2px solid "+t.bg,display:"flex",alignItems:"center",justifyContent:"center",fontSize:8,fontWeight:800,color:t.accentText,letterSpacing:"-0.02em"}}>
                        {notifications.unreadCount()>9?"9+":notifications.unreadCount()}
                      </div>
                    )}
                  </button>
                )}
                {auth.authUser
                  ?<button
                      onClick={function(){currentUser.setProfileDraft(currentUser.profile);setShowSettings(true);}}
                      title="Settings"
                      style={{width:32,height:32,borderRadius:"50%",border:"none",padding:0,background:"transparent",overflow:"hidden"}}>
                      {currentUser.profile.avatar_url
                        ? <img src={currentUser.profile.avatar_url} alt="" style={{width:32,height:32,objectFit:"cover",display:"block",borderRadius:"50%"}}/>
                        : <div style={{width:32,height:32,borderRadius:"50%",background:avColor(currentUser.profile.name),display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:700,color:"#fff",letterSpacing:"-0.3px"}}>{currentUser.profile.avatar}</div>}
                    </button>
                  :<button
                      onClick={auth.openLogin}
                      style={{background:t.accent,border:"none",borderRadius:t.r,padding:"7px 16px",fontSize:12,fontWeight:700,color:t.accentText,letterSpacing:"0.02em"}}>
                      Log in
                    </button>
                }
              </div>
            </div>
          </nav>

          {/* Notifications panel */}
          {notifications.showNotifications&&auth.authUser&&(
            <NotificationsPanel
              t={t} notifications={notifications.notifications}
              markAllRead={notifications.markAllRead}
              markOneRead={notifications.markOneRead}
              dismissNotification={notifications.dismissNotification}
              dismissNotifications={notifications.dismissNotifications}
              acceptMatchTag={notifications.acceptMatchTag}
              declineMatchTag={notifications.declineMatchTag}
              onAcceptFriendRequest={function(n){
                // Build the req shape acceptRequest expects, then dismiss notif
                social.acceptRequest({id:n.from_user_id,requestId:n.entity_id,name:n.fromName,avatar:n.fromAvatar});
                notifications.dismissNotification(n.id);
              }}
              onDeclineFriendRequest={function(n){
                social.declineRequest({id:n.from_user_id,requestId:n.entity_id});
                notifications.dismissNotification(n.id);
              }}
              onReviewMatch={openReviewDrawer}
              setShowNotifications={notifications.setShowNotifications}
              refreshHistory={auth.authUser?function(){matchHistory.loadHistory(auth.authUser.id);}:null}
              openConvById={openConvById}
              openProfile={openProfile}
            />
          )}

          {/* MOBILE bottom tab bar — icons only (hidden on desktop via CSS). */}
          <div className="cs-mob-tabs" style={{position:"fixed",bottom:0,left:0,right:0,zIndex:50,backdropFilter:"blur(24px)",WebkitBackdropFilter:"blur(24px)",background:t.tabBar,borderTop:"1px solid "+t.border}}>
            {/* No maxWidth cap (same fix as the top nav) — bar
                stretches edge-to-edge so the icons distribute
                evenly across any mobile viewport. */}
            <div style={{width:"100%",display:"flex",padding:"6px 0 calc(6px + env(safe-area-inset-bottom))"}}>
              {TABS.map(function(tb){
                var on=tab===tb.id;
                var Icon=NAV_ICONS[tb.id];
                // Instagram-style red badge on the People tab for unread
                // DMs + pending message requests.
                var showDmBadge = tb.id === "people" && dms && dms.totalUnread() > 0;
                var dmCount = showDmBadge ? dms.totalUnread() : 0;
                return (
                  <button key={tb.id}
                    onClick={function(){setTab(tb.id);if(tb.id!=="tournaments")tournaments.setSelectedTournId(null);}}
                    aria-label={tb.label}
                    style={{flex:1,background:"none",border:"none",display:"flex",flexDirection:"column",alignItems:"center",gap:3,padding:"6px 0",transition:"color 0.2s",color:on?t.accent:t.textSecondary,cursor:"pointer"}}>
                    <div style={{width:18,height:2,borderRadius:1,background:on?t.accent:"transparent",transition:"background 0.2s"}}/>
                    <span style={{ position:"relative", display:"flex" }}>
                      {Icon ? Icon(22) : null}
                      {showDmBadge && (
                        <span style={{
                          position:"absolute", top:-4, right:-8,
                          minWidth:14, height:14, borderRadius:7,
                          background: t.red || "#ef4444", color:"#fff",
                          fontSize:9, fontWeight:800,
                          padding:"0 4px", lineHeight:"14px", textAlign:"center",
                        }}>{dmCount > 9 ? "9+" : dmCount}</span>
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Tab content. (Tindis retired; old deep-links bounce
              through validTabs above and land on home.) */}
          {tab==="home"&&(
            <HomeTab
              t={t} authUser={auth.authUser} profile={currentUser.profile} history={matchHistory.history}
              feedLikes={matchHistory.feedLikes} setFeedLikes={matchHistory.setFeedLikes}
              feedLikeCounts={matchHistory.feedLikeCounts} setFeedLikeCounts={matchHistory.setFeedLikeCounts}
              feedComments={matchHistory.feedComments} setFeedComments={matchHistory.setFeedComments} commentModal={matchHistory.commentModal}
              setCommentModal={matchHistory.setCommentModal}
              commentDraft={matchHistory.commentDraft} setCommentDraft={matchHistory.setCommentDraft}
              setShowAuth={auth.setShowAuth} setAuthMode={auth.setAuthMode} setAuthStep={auth.setAuthStep}
              setCasualOppName={matchHistory.setCasualOppName}
              setScoreModal={matchHistory.setScoreModal} setScoreDraft={matchHistory.setScoreDraft}
              setDisputeModal={matchHistory.setDisputeModal} setDisputeDraft={matchHistory.setDisputeDraft}
              deleteMatch={matchHistory.deleteMatch} removeTaggedMatch={matchHistory.removeTaggedMatch}
              resubmitMatch={matchHistory.resubmitMatch}
              confirmOpponentMatch={confirmOpponentMatchAndAskFeedback}
              acceptCorrection={matchHistory.acceptCorrection}
              voidMatchAction={matchHistory.voidMatchAction}
              openProfile={openProfile}
              friends={social.friends}
              playedOpponents={social.playedOpponents}
              suggestedPlayers={social.suggestedPlayers}
              sendFriendRequest={social.sendFriendRequest}
              cancelRequest={social.cancelRequest}
              acceptRequest={social.acceptRequest}
              sentReq={social.sentReq}
              recvReq={social.recvReq}
              friendRelationLabel={social.friendRelationLabel}
              socialLoading={social.socialLoading}
              onGoToDiscover={function(){navigate("/people/suggested");}}
              openChallenge={openChallenge}
              toast={toast}
              pendingFreshCount={matchHistory.pendingFreshCount}
              refreshFeed={matchHistory.refreshFeed}
              notifyMatchOwnerOfComment={notifyMatchOwnerOfComment}
              /* Module 4 — next-challenge banner + deep-link into Challenges tab */
              challengesList={challenges.challenges}
              challengesProfileMap={challenges.profileMap}
              onLogConvertedMatch={openConvertToMatch}
              goToChallengesTab={function(){navigate("/tournaments/challenges");}}
              /* HomeNextAction's urgency CTA: open ActionReviewDrawer
                 instead of doing a fragile scroll-to-feed-card. Same
                 handler FeedCard's "Review" button uses. */
              onReviewMatch={openReviewForMatch}
              /* Module 7 — simple id→name index for league pills on feed cards */
              leaguesIndex={(leagues.leagues||[]).reduce(function(acc,lg){acc[lg.id]=lg.name;return acc;},{})}
              onOpenLeague={function(id){ navigate("/tournaments/leagues?id=" + id); }}
              /* Slice 1 (design overhaul) — Home Leagues strip */
              myLeagues={leagues.leagues}
              leagueDetailCache={leagues.detailCache}
              loadLeagueDetail={leagues.loadLeagueDetail}
            />
          )}
          {tab==="map"&&(
            <MapTab
              t={t} theme={theme}
              authUser={auth.authUser}
              profile={currentUser.profile}
              onSetHomeZone={applyHomeZone}
              onClearHomeZone={clearHomeZone}
              onOpenProfile={openProfile}
              openChallenge={openChallenge}
              blockedUserIds={(social.blockedUsers || []).map(function(b){return b.id;})}
              onPlayMatchSend={onPlayMatchSend}
              onMessagePlayer={function(partnerOrPartners, slotOpts){
                // Accepts either a single partner (legacy call path) or
                // an array of partners (new zone-panel multi-select,
                // up to 3 for doubles). Normalize to an array and open
                // the inline ComposeMessageModal.
                var partners = Array.isArray(partnerOrPartners)
                  ? partnerOrPartners
                  : (partnerOrPartners && partnerOrPartners.id ? [partnerOrPartners] : []);
                if(!partners.length) return;
                setComposeTarget({
                  partners:   partners,
                  venue:      (slotOpts && slotOpts.venue) || "",
                  date:       (slotOpts && slotOpts.date)  || "",
                  time:       (slotOpts && slotOpts.time)  || "",
                  courtName:  (slotOpts && slotOpts.courtName) || (slotOpts && slotOpts.venue) || null,
                  zoneId:     (slotOpts && slotOpts.zoneId) || null,
                });
              }}
            />
          )}
          {tab==="tournaments"&&(
            // Module 13 Slice 1 — `/tournaments` (no segment) renders
            // the new CompeteHub. Any deeper segment
            // (`/tournaments/list|challenges|leagues`) keeps rendering
            // the existing TournamentsTab so deep-links from
            // notifications, feed cards, and profile callouts stay
            // unchanged.
            !pathParts[1] ? (
              <CompeteHub
                t={t} authUser={auth.authUser}
                challenges={challenges}
                leagues={leagues}
                /* Slice 2: pass the full tournaments hook bundle so
                   the hub can read isEntered / tournStatus for the
                   Active now predicate, navigate to a tournament
                   detail via setSelectedTournId, and surface entered
                   tournaments in the active list. */
                tournaments={tournaments}
                /* Slice 3: viewer's match history powers the rematch
                   suggestion + the league next-opponent picker.
                   openChallenge is the App-level composer launcher
                   the hub fires from the Rematch CTA. */
                history={matchHistory.history}
                openChallenge={openChallenge}
                toast={toast}
              />
            ) : (
              <TournamentsTab
                t={t} myId={myId} authUser={auth.authUser}
                /* LeaguesPanel uses this to open the score modal
                   with the current league pre-selected when the
                   user taps "Log match" inside league detail. */
                openLogMatchInLeague={openLogMatchInLeague}
                tournaments={tournaments.tournaments}
                selectedTournId={tournaments.selectedTournId} setSelectedTournId={tournaments.setSelectedTournId}
                tournDetailTab={tournaments.tournDetailTab} setTournDetailTab={tournaments.setTournDetailTab}
                filterSkill={tournaments.filterSkill} setFilterSkill={tournaments.setFilterSkill}
                isEntered={tournaments.isEntered} isWaitlisted={tournaments.isWaitlisted} waitlistPos={tournaments.waitlistPos}
                enterTournament={tournaments.enterTournament} joinWaitlist={tournaments.joinWaitlist}
                tournStatus={tournaments.tournStatus}
                setScheduleModal={tournaments.setScheduleModal} setScheduleDraft={tournaments.setScheduleDraft}
                setScoreModal={matchHistory.setScoreModal} setScoreDraft={matchHistory.setScoreDraft}
                /* Sub-tabs — Challenges + Leagues moved out of People. */
                challenges={challenges}
                leagues={leagues}
                friends={social.friends}
                openProfile={openProfile}
                openChallenge={openChallenge}
                openConvertToMatch={openConvertToMatch}
                toast={toast}
                /* Slice 4 (design overhaul) — Leagues retention surfaces
                   (next opponent / rivalry / standings deltas) read the
                   viewer's match history filtered by league_id. */
                history={matchHistory.history}
              />
            )
        )}
        {tab==="people"&&(
          <PeopleTab
            t={t} authUser={auth.authUser} friends={social.friends}
            sentRequests={social.sentRequests} receivedRequests={social.receivedRequests}
            blockedUsers={social.blockedUsers} suggestedPlayers={social.suggestedPlayers}
            playedOpponents={social.playedOpponents} sameSkillPlayers={social.sameSkillPlayers}
            peopleSearch={social.peopleSearch} setPeopleSearch={social.setPeopleSearch}
            searchResults={social.searchResults} setSearchResults={social.setSearchResults} searchLoading={social.searchLoading}
            showSearchDrop={social.showSearchDrop} setShowSearchDrop={social.setShowSearchDrop}
            socialLoading={social.socialLoading} searchTimer={social.searchTimer}
            sendFriendRequest={social.sendFriendRequest} acceptRequest={social.acceptRequest}
            declineRequest={social.declineRequest} cancelRequest={social.cancelRequest}
            unfriend={social.unfriend} blockUser={social.blockUser} unblockUser={social.unblockUser}
            searchUsers={social.searchUsers}
            friendRelationLabel={social.friendRelationLabel} sentReq={social.sentReq} recvReq={social.recvReq}
            setShowAuth={auth.setShowAuth} setAuthMode={auth.setAuthMode} setAuthStep={auth.setAuthStep}
            dms={dms}
            openProfile={openProfile}
            challenges={challenges}
            openChallenge={openChallenge}
            openConvertToMatch={openConvertToMatch}
            leagues={leagues}
            toast={toast}
          />
        )}
        {tab==="profile"&&profilePathId&&(!auth.authUser||profilePathId!==auth.authUser.id)&&(
          <PlayerProfileView
            t={t}
            authUser={auth.authUser}
            userId={profilePathId}
            viewerHistory={matchHistory.history}
            onBack={function(){navigate(-1);}}
            openChallenge={openChallenge}
            blockUser={social.blockUser}
          />
        )}
        {tab==="profile"&&(!profilePathId||(auth.authUser&&profilePathId===auth.authUser.id))&&(
          <ProfileTab
            t={t} authUser={auth.authUser} profile={currentUser.profile}
            history={matchHistory.history}
            profileTab={profileTab} setProfileTab={setProfileTab}
            onOpenSettings={function(){currentUser.setProfileDraft(currentUser.profile);setShowSettings(true);}}
            openProfile={openProfile}
            openChallenge={openChallenge}
            myLeagues={leagues.leagues}
            leagueDetailCache={leagues.detailCache}
            loadLeagueDetail={leagues.loadLeagueDetail}
            onOpenLeague={function(id){ navigate("/tournaments/leagues?id=" + id); }}
            onOpenLeagues={function(){navigate("/tournaments/leagues");}}
          />
        )}
        {tab==="admin"&&(
          // Admin tab is gated on profiles.is_admin. Non-admins get
          // bounced to /home — this is cosmetic; DB RLS on tournaments
          // is the real boundary (tournaments_admin_write policy).
          currentUser.profile && currentUser.profile.is_admin ? (
            <AdminTab
              t={t} tournaments={tournaments.tournaments} setTournaments={tournaments.setTournaments}
              adminTab={tournaments.adminTab} setAdminTab={tournaments.setAdminTab}
              newTourn={tournaments.newTourn} setNewTourn={tournaments.setNewTourn}
              myId={myId} profile={currentUser.profile}
              seedTournament={tournaments.seedTournament} generateDraw={tournaments.generateDraw}
              recordResult={tournaments.recordResult}
              setSelectedTournId={tournaments.setSelectedTournId} setTab={setTab}
              setTournDetailTab={tournaments.setTournDetailTab}
            />
          ) : (
            <div style={{maxWidth:680,margin:"60px auto",padding:"40px 20px",textAlign:"center"}}>
              <div style={{fontSize:18,fontWeight:700,color:t.text,marginBottom:8}}>Not found</div>
              <div style={{fontSize:13,color:t.textSecondary}}>This page is admin-only.</div>
            </div>
          )
        )}

        </div>{/* end .cs-center-col */}

        {/* RIGHT PANEL — large desktop only, home tab only, controlled by .cs-right-col CSS */}
        {tab==="home"&&(
          <div className="cs-right-col">
            <RightPanel
              t={t} authUser={auth.authUser}
              history={matchHistory.history}
              onLogMatch={openLogMatch}
              openProfile={openProfile}
              viewerSuburb={currentUser.profile && currentUser.profile.suburb}
              onReviewMatch={openReviewForMatch}
            />
          </div>
        )}

      </div>{/* end .cs-shell */}

      {/* Settings screen (IG-style slide-in from avatar) */}
      {showSettings&&auth.authUser&&(
        <SettingsScreen
          t={t} authUser={auth.authUser}
          theme={theme} setTheme={applyTheme}
          profile={currentUser.profile} setProfile={currentUser.setProfile}
          profileDraft={currentUser.profileDraft} setProfileDraft={currentUser.setProfileDraft}
          profileLoaded={currentUser.profileLoaded}
          editingAvail={currentUser.editingAvail} setEditingAvail={currentUser.setEditingAvail}
          availDraft={currentUser.availDraft} setAvailDraft={currentUser.setAvailDraft}
          receivedRequests={social.receivedRequests}
          toast={toast}
          /* Module 9.2 — sign-out funnels through the auth controller's
             cleanup helper (disablePush → supabase.auth.signOut) so a
             logged-out browser doesn't keep the previous user's push
             subscription alive on a shared device. */
          signOutAndCleanup={auth.signOutAndCleanup}
          onClose={function(){setShowSettings(false);currentUser.setEditingAvail(false);}}
        />
      )}

      {/* Modals */}
      <ScheduleModal
          t={t} scheduleModal={tournaments.scheduleModal} setScheduleModal={tournaments.setScheduleModal}
          scheduleDraft={tournaments.scheduleDraft} setScheduleDraft={tournaments.setScheduleDraft}
          scheduleMatch={tournaments.scheduleMatch}
        />
        <ScoreModal
          t={t} authUser={auth.authUser} scoreModal={matchHistory.scoreModal} setScoreModal={matchHistory.setScoreModal}
          scoreDraft={matchHistory.scoreDraft} setScoreDraft={matchHistory.setScoreDraft}
          casualOppName={matchHistory.casualOppName} setCasualOppName={matchHistory.setCasualOppName}
          casualOppId={matchHistory.casualOppId} setCasualOppId={matchHistory.setCasualOppId}
          showOppDrop={matchHistory.showOppDrop} setShowOppDrop={matchHistory.setShowOppDrop}
          friends={social.friends} suggestedPlayers={social.suggestedPlayers}
          submitMatch={matchHistory.submitMatch} resubmitMatch={matchHistory.resubmitMatch}
          recordResult={tournaments.recordResult}
          viewerSuburb={currentUser.profile&&currentUser.profile.suburb}
          viewerProfile={currentUser.profile}
          myLeagues={leagues.leagues}
        />
        <DisputeModal
          t={t}
          disputeModal={matchHistory.disputeModal} setDisputeModal={matchHistory.setDisputeModal}
          disputeDraft={matchHistory.disputeDraft} setDisputeDraft={matchHistory.setDisputeDraft}
          disputeWithProposal={matchHistory.disputeWithProposal}
          counterPropose={matchHistory.counterPropose}
          voidMatchAction={matchHistory.voidMatchAction}
        />
        {/* In-context review drawer — opened from notification tray */}
        {reviewDrawer&&auth.authUser&&(
          <ActionReviewDrawer
            t={t}
            match={reviewDrawer.match}
            notifType={reviewDrawer.notifType}
            fromName={reviewDrawer.fromName}
            onClose={function(){setReviewDrawer(null);}}
            onDismissNotif={function(){
              if(reviewDrawer.notifId)notifications.dismissNotification(reviewDrawer.notifId);
            }}
            acceptCorrection={matchHistory.acceptCorrection}
            confirmOpponentMatch={confirmOpponentMatchAndAskFeedback}
            onCounter={function(match){
              setReviewDrawer(null);
              // match_tag → first-round dispute; everything else → counter-propose.
              if(reviewDrawer && reviewDrawer.notifType === "match_tag") openDisputeFromTag(match);
              else openCounterPropose(match);
            }}
            voidMatchAction={matchHistory.voidMatchAction}
          />
        )}
        {/* CommentModal retired — FeedInteractionsModal (mounted inside
            HomeTab) now owns the comment list + composer as the Comments tab. */}
        <ChallengeModal
          t={t}
          composer={challenges.composer}
          draft={challenges.draft}
          setDraft={challenges.setDraft}
          loading={challenges.loading}
          onSend={async function(){
            var res=await challenges.sendChallenge();
            if(res&&res.error)toast(res.error,"error");
          }}
          onClose={challenges.closeComposer}
        />
        {composeTarget && (
          <ComposeMessageModal
            t={t}
            partners={composeTarget.partners}
            dms={dms}
            initialVenue={composeTarget.venue}
            initialDate={composeTarget.date}
            initialTime={composeTarget.time}
            contextZoneId={composeTarget.zoneId}
            contextCourtName={composeTarget.courtName}
            onClose={function () { setComposeTarget(null); }}
            onSent={function (n) {
              var partners = (composeTarget && composeTarget.partners) || [];
              var msg = partners.length === 1
                ? ("Message sent to " + (partners[0].name || "player"))
                : ("Sent to " + (n || partners.length) + " players");
              setComposeTarget(null);
              if (toast) toast(msg, "success");
            }}
            onViewConv={function () {
              setComposeTarget(null);
              navigate("/people/messages");
            }}
          />
        )}
        <AuthModal
          t={t} showAuth={auth.showAuth} setShowAuth={auth.setShowAuth}
          authMode={auth.authMode} setAuthMode={auth.setAuthMode}
          authStep={auth.authStep} setAuthStep={auth.setAuthStep}
          authEmail={auth.authEmail} setAuthEmail={auth.setAuthEmail}
          authPassword={auth.authPassword} setAuthPassword={auth.setAuthPassword}
          authName={auth.authName} setAuthName={auth.setAuthName}
          authLoading={auth.authLoading} setAuthLoading={auth.setAuthLoading}
          authNewPassword={auth.authNewPassword} setAuthNewPassword={auth.setAuthNewPassword}
          authNewPassword2={auth.authNewPassword2} setAuthNewPassword2={auth.setAuthNewPassword2}
          authError={auth.authError} setAuthError={auth.setAuthError}
          authFieldErrors={auth.authFieldErrors} setAuthFieldErrors={auth.setAuthFieldErrors}
        />
        <OnboardingModal
          t={t} authUser={auth.authUser}
          showOnboarding={currentUser.showOnboarding} setShowOnboarding={currentUser.setShowOnboarding}
          profile={currentUser.profile} setProfile={currentUser.setProfile} setProfileDraft={currentUser.setProfileDraft}
          onboardStep={currentUser.onboardStep} setOnboardStep={currentUser.setOnboardStep}
          onboardDraft={currentUser.onboardDraft} setOnboardDraft={currentUser.setOnboardDraft}
        />
        <ToastStack t={t} toasts={toastSystem.toasts} dismiss={toastSystem.dismiss} />

        {/* Module 10 Slice 2 — private post-match feedback prompt.
            Mounts at the App root so it floats over any tab. Only set
            after a successful confirmOpponentMatch on a linked-opponent
            match. Auto-dismisses on submit / skip / sessionStorage cooldown. */}
        {pendingFeedbackMatch && auth.authUser && (
          <PostMatchFeedbackCard
            t={t}
            matchId={pendingFeedbackMatch.matchId}
            reviewedUserId={pendingFeedbackMatch.reviewedUserId}
            reviewedName={pendingFeedbackMatch.reviewedName}
            toast={toast}
            onClose={function () { setPendingFeedbackMatch(null); }}
          />
        )}
    </Providers>
  );
}
