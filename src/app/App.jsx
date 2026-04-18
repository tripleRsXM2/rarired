// src/app/App.jsx
import { useState, useEffect, useRef } from "react";

import { makeTheme } from "../lib/theme.js";
import { avColor } from "../lib/helpers.js";
import { TABS } from "../lib/constants.js";
import { insertNotification } from "../features/notifications/services/notificationService.js";
import { markMatchTagStatus } from "../features/scoring/services/matchService.js";

import Providers from "./providers.jsx";

import { useAuthController } from "../features/auth/hooks/useAuthController.js";
import { useCurrentUser } from "../features/profile/hooks/useCurrentUser.js";
import { useMatchHistory } from "../features/scoring/hooks/useMatchHistory.js";
import { useSocialGraph } from "../features/people/hooks/useSocialGraph.js";
import { useDMs } from "../features/people/hooks/useDMs.js";
import { useNotifications } from "../features/notifications/hooks/useNotifications.js";
import { useTournamentManager } from "../features/tournaments/hooks/useTournamentManager.js";

import HomeTab from "../tabs/HomeTab.jsx";
import TournamentsTab from "../tabs/TournamentsTab.jsx";
import PeopleTab from "../tabs/PeopleTab.jsx";
import ProfileTab from "../tabs/ProfileTab.jsx";
import AdminTab from "../tabs/AdminTab.jsx";

import NotificationsPanel from "../components/social/NotificationsPanel.jsx";
import AuthModal from "../modals/AuthModal.jsx";
import OnboardingModal from "../modals/OnboardingModal.jsx";
import ScheduleModal from "../modals/ScheduleModal.jsx";
import ScoreModal from "../modals/ScoreModal.jsx";
import CommentModal from "../modals/CommentModal.jsx";
import DisputeModal from "../modals/DisputeModal.jsx";

export default function App(){
  var [dark,setDark]=useState(function(){var s=localStorage.getItem("theme");return s?s==="dark":true;});
  var t=makeTheme(dark);

  var [tab,setTab]=useState("home");
  var [profileTab,setProfileTab]=useState("overview");

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
  var matchHistory=useMatchHistory({ authUser:auth.authUser, sendNotification:insertNotification, bumpStats:currentUser.bumpMatchStats, refreshProfile:currentUser.refreshProfileUI });
  var social=useSocialGraph({ authUser:auth.authUser });
  var dms=useDMs({ authUser:auth.authUser });
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

  var myId=auth.authUser?auth.authUser.id:"local-user";

  // Wire up coordinator after all hooks are declared.
  useEffect(function(){
    coordRef.current={
      bootstrap: async function(supabaseUser, isFresh){
        var res=await currentUser.loadProfile(supabaseUser);
        auth.setAuthInitialized(true);
        await Promise.all([
          matchHistory.loadHistory(supabaseUser.id),
          social.loadSocial(supabaseUser.id, res.profile),
          notifications.loadNotifications(supabaseUser.id),
          dms.loadConversations(),
        ]);
        if(res.isNew&&isFresh)currentUser.triggerOnboarding();
      },
      reset: function(){
        // Match prior behavior: clear only auth; data rehydrates on next sign-in.
      },
    };
  });

  return (
    <Providers t={t} dark={dark}>
      <div style={{minHeight:"100vh",background:t.bg,color:t.text,paddingBottom:80}}>

        {/* Nav */}
        <nav style={{position:"sticky",top:0,zIndex:40,backdropFilter:"blur(24px)",WebkitBackdropFilter:"blur(24px)",background:t.navBg,borderBottom:"1px solid "+t.border}}>
          <div style={{maxWidth:680,margin:"0 auto",padding:"0 20px",height:52,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
            <div style={{display:"flex",alignItems:"center",gap:8}}>
              <div style={{width:26,height:26,borderRadius:4,background:t.accent,display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,fontWeight:800,color:t.accentText,letterSpacing:"-0.5px",flexShrink:0}}>CS</div>
              <span style={{fontSize:15,fontWeight:700,letterSpacing:"-0.5px",color:t.text}}>CourtSync</span>
            </div>
            <div style={{display:"flex",gap:6,alignItems:"center"}}>
              <button
                onClick={function(){setDark(function(d){var next=!d;localStorage.setItem("theme",next?"dark":"light");return next;});}}
                style={{background:"transparent",border:"1px solid "+t.border,borderRadius:t.r,padding:"4px 10px",fontSize:10,fontWeight:600,color:t.textSecondary,letterSpacing:"0.05em",textTransform:"uppercase"}}>
                {dark?"Light":"Dark"}
              </button>
              {auth.authUser&&(
                <button
                  onClick={function(){notifications.setShowNotifications(function(v){return!v;});if(!notifications.showNotifications)notifications.markNotificationsRead();}}
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
                    onClick={function(){setTab("profile");setProfileTab("overview");}}
                    style={{width:32,height:32,borderRadius:t.r,background:avColor(currentUser.profile.name),border:"none",fontSize:11,fontWeight:700,color:"#fff",letterSpacing:"-0.3px"}}>
                    {currentUser.profile.avatar}
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
            markNotificationsRead={notifications.markNotificationsRead}
            acceptMatchTag={notifications.acceptMatchTag}
            declineMatchTag={notifications.declineMatchTag}
            setTab={setTab} setPeopleTab={social.setPeopleTab}
            setShowNotifications={notifications.setShowNotifications}
          />
        )}

        {/* Tab bar */}
        <div style={{position:"fixed",bottom:0,left:0,right:0,zIndex:50,backdropFilter:"blur(24px)",WebkitBackdropFilter:"blur(24px)",background:t.tabBar,borderTop:"1px solid "+t.border}}>
          <div style={{maxWidth:680,margin:"0 auto",display:"flex",padding:"8px 0 calc(8px + env(safe-area-inset-bottom))"}}>
            {TABS.map(function(tb){
              var on=tab===tb.id;
              return (
                <button key={tb.id}
                  onClick={function(){setTab(tb.id);if(tb.id!=="tournaments")tournaments.setSelectedTournId(null);}}
                  style={{flex:1,background:"none",border:"none",display:"flex",flexDirection:"column",alignItems:"center",gap:5,padding:"4px 0",transition:"color 0.2s",color:on?t.accent:t.textSecondary}}>
                  <div style={{width:16,height:2,borderRadius:1,background:on?t.accent:"transparent",transition:"background 0.2s"}}/>
                  <span style={{fontSize:10,fontWeight:on?700:500,letterSpacing:"0.05em",textTransform:"uppercase"}}>{tb.label}</span>
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
            feedComments={matchHistory.feedComments} commentModal={matchHistory.commentModal}
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
            peopleTab={social.peopleTab} setPeopleTab={social.setPeopleTab}
            peopleSearch={social.peopleSearch} setPeopleSearch={social.setPeopleSearch}
            searchResults={social.searchResults} searchLoading={social.searchLoading}
            showSearchDrop={social.showSearchDrop} setShowSearchDrop={social.setShowSearchDrop}
            socialLoading={social.socialLoading} searchTimer={social.searchTimer}
            sendFriendRequest={social.sendFriendRequest} acceptRequest={social.acceptRequest}
            declineRequest={social.declineRequest} cancelRequest={social.cancelRequest}
            unfriend={social.unfriend} blockUser={social.blockUser} unblockUser={social.unblockUser}
            searchUsers={social.searchUsers}
            friendRelationLabel={social.friendRelationLabel} sentReq={social.sentReq} recvReq={social.recvReq}
            setShowAuth={auth.setShowAuth} setAuthMode={auth.setAuthMode} setAuthStep={auth.setAuthStep}
            dms={dms}
          />
        )}
        {tab==="profile"&&(
          <ProfileTab
            t={t} authUser={auth.authUser} profile={currentUser.profile} setProfile={currentUser.setProfile}
            profileDraft={currentUser.profileDraft} setProfileDraft={currentUser.setProfileDraft}
            history={matchHistory.history} receivedRequests={social.receivedRequests}
            profileTab={profileTab} setProfileTab={setProfileTab}
            editingAvail={currentUser.editingAvail} setEditingAvail={currentUser.setEditingAvail}
            availDraft={currentUser.availDraft} setAvailDraft={currentUser.setAvailDraft}
            setTab={setTab} setPeopleTab={social.setPeopleTab}
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
        <CommentModal
          t={t} authUser={auth.authUser} profile={currentUser.profile}
          commentModal={matchHistory.commentModal} setCommentModal={matchHistory.setCommentModal}
          commentDraft={matchHistory.commentDraft} setCommentDraft={matchHistory.setCommentDraft}
          feedComments={matchHistory.feedComments} setFeedComments={matchHistory.setFeedComments}
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
      </div>
    </Providers>
  );
}
