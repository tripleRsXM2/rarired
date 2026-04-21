// src/app/App.jsx
import { useState, useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { makeTheme } from "../lib/theme.js";
import { avColor } from "../lib/utils/avatar.js";
import { TABS } from "../lib/constants/ui.js";
import { NAV_ICONS } from "../lib/constants/navIcons.jsx";
import { insertNotification, deleteNotification } from "../features/notifications/services/notificationService.js";
import { markMatchTagStatus } from "../features/scoring/services/matchService.js";
import { track } from "../lib/analytics.js";

import Providers from "./providers.jsx";
import Sidebar from "./Sidebar.jsx";
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

import HomeTab from "../features/home/pages/HomeTab.jsx";
import TournamentsTab from "../features/tournaments/pages/TournamentsTab.jsx";
import PeopleTab from "../features/people/pages/PeopleTab.jsx";
import ProfileTab from "../features/profile/pages/ProfileTab.jsx";
import PlayerProfileView from "../features/profile/pages/PlayerProfileView.jsx";
import AdminTab from "../features/admin/pages/AdminTab.jsx";
import MapTab from "../features/map/pages/MapTab.jsx";
import { setHomeZone } from "../features/map/services/mapService.js";
import SettingsScreen from "../features/settings/pages/SettingsScreen.jsx";

import NotificationsPanel from "../features/notifications/components/NotificationsPanel.jsx";
import ActionReviewDrawer from "../features/notifications/components/ActionReviewDrawer.jsx";
import AuthModal from "../features/auth/components/AuthModal.jsx";
import OnboardingModal from "../features/auth/components/OnboardingModal.jsx";
import ScheduleModal from "../features/tournaments/components/ScheduleModal.jsx";
import ScoreModal from "../features/scoring/components/ScoreModal.jsx";
// CommentModal retired — replaced by FeedInteractionsModal (Kudos + Comments
// tabs) which lives under HomeTab. matchHistory.commentModal state is kept
// for any legacy caller and is harmless if set.
import DisputeModal from "../features/scoring/components/DisputeModal.jsx";
import ChallengeModal from "../features/challenges/components/ChallengeModal.jsx";
import { useToasts, ToastStack } from "../components/ui/Toast.jsx";

export default function App(){
  var VALID_THEMES=['wimbledon','ao','french-open','us-open'];
  var [theme,setTheme]=useState(function(){var s=localStorage.getItem("theme");return s&&VALID_THEMES.includes(s)?s:'wimbledon';});
  var t=makeTheme(theme);
  function applyTheme(name){localStorage.setItem("theme",name);setTheme(name);}

  // Module 6: app-wide toast emitter. Replaces window.alert() everywhere.
  // toast(msg, 'error'|'success'|'info').
  var toastSystem=useToasts();
  var toast=toastSystem.emit;

  var location=useLocation();
  var navigate=useNavigate();

  // Derive active top-level tab from the URL path.
  var validTabs=["home","map","tournaments","people","profile","admin"];
  var pathParts=location.pathname.split("/").filter(Boolean);
  var tab=(pathParts[0]&&validTabs.includes(pathParts[0]))?pathParts[0]:"home";

  // /profile/<userId> → public profile view. Empty second segment or a match
  // with the signed-in user's id falls back to the own-profile ProfileTab.
  var profilePathId = (pathParts[0]==="profile"&&pathParts[1])?pathParts[1]:null;

  // Navigate to a top-level tab. Switching to "people" lands on /people/friends.
  function setTab(x){
    if(x==="people") navigate("/people/friends");
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
    if(r.error){ alert(r.error.message||"Could not set home zone"); return; }
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
  var dms=useDMs({ authUser:auth.authUser, friends:social.friends });
  usePresenceHeartbeat(auth.authUser);
  var notifications=useNotifications({
    authUser:auth.authUser,
    updateMatchTagStatus:markMatchTagStatus,
    onMatchTagAccepted:function(matchRow){
      var friendResult=matchHistory.applyAcceptedTagMatch(matchRow);
      if(auth.authUser)currentUser.bumpMatchStats(auth.authUser.id, friendResult);
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
          dms.loadConversations(),
          challenges.loadChallenges(supabaseUser.id),
        ]);
        if(res.isNew&&isFresh)currentUser.triggerOnboarding();
      },
      reset: function(){
        // Match prior behavior: clear only auth; data rehydrates on next sign-in.
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

  // Auto-dismiss "new message" notifications when the user opens that
  // conversation. Matches the canonical row (entity_id === conv.id) AND any
  // legacy rows from the same partner (entity_id null, from before that
  // column was saved), so old stacked notifications also clear.
  useEffect(function(){
    var conv=dms.activeConv;
    if(!conv||conv.status!=='accepted')return;
    var partnerId=conv.partner&&conv.partner.id;
    var matches=notifications.notifications.filter(function(n){
      if(n.type!=='message')return false;
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

  // ── In-context notification review drawer ────────────────────────────────
  var [reviewDrawer,setReviewDrawer]=useState(null); // { match, notifId, notifType, fromName }

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

  return (
    <Providers t={t} theme={theme}>
      {/* ── 3-column shell: sidebar | center | right ──────────────────────── */}
      <div className="cs-shell" style={{color:t.text}}>

        {/* LEFT SIDEBAR — desktop only, controlled by .cs-sidebar-col CSS */}
        <div className="cs-sidebar-col">
          <Sidebar
            t={t} tab={tab} setTab={setTab}
            profile={currentUser.profile} authUser={auth.authUser}
            unreadCount={notifications.unreadCount()}
            showNotifications={notifications.showNotifications}
            setShowNotifications={notifications.setShowNotifications}
            markSeen={notifications.markSeen}
            onOpenSettings={function(){currentUser.setProfileDraft(currentUser.profile);setShowSettings(true);}}
            openLogin={auth.openLogin}
          />
        </div>

        {/* CENTER COLUMN */}
        <div className={"cs-center-col cs-outer-pad" + (tab==="map" ? " cs-center-col-map" : "")}>

          {/* MOBILE top nav — hidden on desktop via .cs-mob-nav CSS */}
          <nav className="cs-mob-nav" style={{position:"sticky",top:0,zIndex:40,backdropFilter:"blur(24px)",WebkitBackdropFilter:"blur(24px)",background:t.navBg,borderBottom:"1px solid "+t.border}}>
            <div style={{maxWidth:680,margin:"0 auto",padding:"0 20px",height:52,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
              <div style={{display:"flex",alignItems:"center",gap:8}}>
                <div style={{width:26,height:26,borderRadius:4,background:t.accent,display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,fontWeight:800,color:t.accentText,letterSpacing:"-0.5px",flexShrink:0}}>CS</div>
                <span style={{fontSize:15,fontWeight:700,letterSpacing:"-0.5px",color:t.text}}>CourtSync</span>
              </div>
              <div style={{display:"flex",gap:6,alignItems:"center"}}>
                {auth.authUser&&(
                  <button
                    onClick={function(){notifications.setShowNotifications(function(v){return!v;});if(!notifications.showNotifications)notifications.markSeen();}}
                    style={{position:"relative",width:32,height:32,borderRadius:t.r,background:notifications.unreadCount()>0?t.accentSubtle:"transparent",border:"1px solid "+(notifications.unreadCount()>0?t.accent:t.border),display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,transition:"all 0.2s"}}>
                    🔔
                    {notifications.unreadCount()>0&&(
                      <div style={{position:"absolute",top:-4,right:-4,width:15,height:15,borderRadius:"50%",background:t.accent,border:"2px solid "+t.bg,display:"flex",alignItems:"center",justifyContent:"center",fontSize:7,fontWeight:800,color:t.accentText}}>
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
            <div style={{maxWidth:680,margin:"0 auto",display:"flex",padding:"6px 0 calc(6px + env(safe-area-inset-bottom))"}}>
              {TABS.map(function(tb){
                var on=tab===tb.id;
                var Icon=NAV_ICONS[tb.id];
                return (
                  <button key={tb.id}
                    onClick={function(){setTab(tb.id);if(tb.id!=="tournaments")tournaments.setSelectedTournId(null);}}
                    aria-label={tb.label}
                    style={{flex:1,background:"none",border:"none",display:"flex",flexDirection:"column",alignItems:"center",gap:3,padding:"6px 0",transition:"color 0.2s",color:on?t.accent:t.textSecondary,cursor:"pointer"}}>
                    <div style={{width:18,height:2,borderRadius:1,background:on?t.accent:"transparent",transition:"background 0.2s"}}/>
                    {Icon ? Icon(22) : null}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Tab content */}
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
              confirmOpponentMatch={matchHistory.confirmOpponentMatch}
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
            />
          )}
          {tab==="tournaments"&&(
          <TournamentsTab
            t={t} myId={myId} tournaments={tournaments.tournaments}
            selectedTournId={tournaments.selectedTournId} setSelectedTournId={tournaments.setSelectedTournId}
            tournDetailTab={tournaments.tournDetailTab} setTournDetailTab={tournaments.setTournDetailTab}
            filterSkill={tournaments.filterSkill} setFilterSkill={tournaments.setFilterSkill}
            isEntered={tournaments.isEntered} isWaitlisted={tournaments.isWaitlisted} waitlistPos={tournaments.waitlistPos}
            enterTournament={tournaments.enterTournament} joinWaitlist={tournaments.joinWaitlist}
            tournStatus={tournaments.tournStatus}
            setScheduleModal={tournaments.setScheduleModal} setScheduleDraft={tournaments.setScheduleDraft}
            setScoreModal={matchHistory.setScoreModal} setScoreDraft={matchHistory.setScoreDraft}
          />
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
          />
        )}
        {tab==="profile"&&(!profilePathId||(auth.authUser&&profilePathId===auth.authUser.id))&&(
          <ProfileTab
            t={t} authUser={auth.authUser} profile={currentUser.profile}
            history={matchHistory.history}
            profileTab={profileTab} setProfileTab={setProfileTab}
            onOpenSettings={function(){currentUser.setProfileDraft(currentUser.profile);setShowSettings(true);}}
            openProfile={openProfile}
          />
        )}
        {tab==="admin"&&(
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
          editingAvail={currentUser.editingAvail} setEditingAvail={currentUser.setEditingAvail}
          availDraft={currentUser.availDraft} setAvailDraft={currentUser.setAvailDraft}
          receivedRequests={social.receivedRequests}
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
            confirmOpponentMatch={matchHistory.confirmOpponentMatch}
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
    </Providers>
  );
}
