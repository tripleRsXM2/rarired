import { useState, useEffect, useRef } from "react";
import { supabase } from './supabase.js';

import { makeTheme } from "./lib/theme.js";
import { initials, avColor, autoResolveBots, computeStandings } from "./lib/helpers.js";
import { TABS, BOT_PLAYERS } from "./lib/constants.js";

import HomeTab from "./tabs/HomeTab.jsx";
import TournamentsTab from "./tabs/TournamentsTab.jsx";
import PeopleTab from "./tabs/PeopleTab.jsx";
import ProfileTab from "./tabs/ProfileTab.jsx";
import AdminTab from "./tabs/AdminTab.jsx";

import NotificationsPanel from "./components/social/NotificationsPanel.jsx";
import AuthModal from "./modals/AuthModal.jsx";
import OnboardingModal from "./modals/OnboardingModal.jsx";
import ScheduleModal from "./modals/ScheduleModal.jsx";
import ScoreModal from "./modals/ScoreModal.jsx";
import CommentModal from "./modals/CommentModal.jsx";

export default function App() {
  var [dark,setDark]=useState(function(){return localStorage.getItem("theme")==="dark";});
  var t=makeTheme(dark);

  // ── Global CSS ──────────────────────────────────────────────────────────────
  useEffect(function(){
    var el=document.createElement("style");
    el.id="cs-css";
    el.textContent=[
      "*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}",
      "html,body{height:100%}",
      "body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;-webkit-font-smoothing:antialiased}",
      "@keyframes fadeUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}",
      "@keyframes pop{0%{transform:scale(.96);opacity:0}100%{transform:scale(1);opacity:1}}",
      "@keyframes slideUp{from{transform:translateY(100%);opacity:0}to{transform:translateY(0);opacity:1}}",
      ".fade-up{animation:fadeUp .25s ease both}",
      ".pop{animation:pop .2s ease both}",
      ".slide-up{animation:slideUp .28s ease both}",
      "button{cursor:pointer;font-family:inherit}",
      "::-webkit-scrollbar{width:0;height:0}",
      "input,select,textarea{font-family:inherit}",
      "input:focus,select:focus,textarea:focus{outline:none}",
    ].join("");
    document.head.appendChild(el);
    return function(){var o=document.getElementById("cs-css");if(o)o.remove();};
  },[]);

  // ── Auth init ───────────────────────────────────────────────────────────────
  useEffect(function(){
    supabase.auth.getSession().then(function(r){
      if(r.data.session)loadUserData(r.data.session.user,false);
      else setAuthInitialized(true);
    });
    var sub=supabase.auth.onAuthStateChange(function(ev,session){
      if(ev==="PASSWORD_RECOVERY"){
        setAuthNewPassword("");setAuthNewPassword2("");
        setAuthStep("set-password");setShowAuth(true);
        return;
      }
      if(session)loadUserData(session.user,ev==="SIGNED_IN");
      else{setAuthUser(null);setAuthInitialized(true);}
    });
    return function(){sub.data.subscription.unsubscribe();};
  },[]);

  // ── Load tournaments ────────────────────────────────────────────────────────
  useEffect(function(){
    supabase.from('tournaments').select('*').then(function(r){
      if(r.data&&r.data.length>0)setTournaments(r.data);
    });
  },[]);

  // ── State ───────────────────────────────────────────────────────────────────
  var [tab,setTab]=useState("home");
  var [authUser,setAuthUser]=useState(null);
  var [authInitialized,setAuthInitialized]=useState(false);
  var [showAuth,setShowAuth]=useState(false);
  var [authMode,setAuthMode]=useState("login");
  var [authStep,setAuthStep]=useState("choose");
  var [authEmail,setAuthEmail]=useState("");
  var [authPassword,setAuthPassword]=useState("");
  var [authName,setAuthName]=useState("");
  var [authLoading,setAuthLoading]=useState(false);
  var [authNewPassword,setAuthNewPassword]=useState("");
  var [authNewPassword2,setAuthNewPassword2]=useState("");
  var [authError,setAuthError]=useState("");
  var [authFieldErrors,setAuthFieldErrors]=useState({});
  var [showOnboarding,setShowOnboarding]=useState(false);
  var [onboardStep,setOnboardStep]=useState(1);
  var [onboardDraft,setOnboardDraft]=useState({skill:"Intermediate",style:"All-Court",suburb:""});
  var [profile,setProfile]=useState({name:"Your Name",suburb:"Sydney",skill:"Intermediate",style:"All-Court",bio:"",avatar:"YN",availability:{}});
  var [profileDraft,setProfileDraft]=useState(profile);
  var [editingAvail,setEditingAvail]=useState(false);
  var [availDraft,setAvailDraft]=useState({});
  var [tournaments,setTournaments]=useState([]);
  var [selectedTournId,setSelectedTournId]=useState(null);
  var [tournDetailTab,setTournDetailTab]=useState("overview");
  var [filterSkill,setFilterSkill]=useState("All");
  var [history,setHistory]=useState([]);
  var [profileTab,setProfileTab]=useState("overview");
  var [feedLikes,setFeedLikes]=useState({});
  var [feedLikeCounts,setFeedLikeCounts]=useState({});
  var [feedComments,setFeedComments]=useState({});
  var [commentModal,setCommentModal]=useState(null);
  var [commentDraft,setCommentDraft]=useState("");
  var [casualOppName,setCasualOppName]=useState("");
  var [showOppDrop,setShowOppDrop]=useState(false);
  var [scheduleModal,setScheduleModal]=useState(null);
  var [scheduleDraft,setScheduleDraft]=useState({date:"",time:"6:00 PM",court:"Court 1"});
  var [scoreModal,setScoreModal]=useState(null);
  var [scoreDraft,setScoreDraft]=useState({sets:[{you:"",them:""}],result:"win",notes:"",date:""});
  var [adminTab,setAdminTab]=useState("tournaments");
  var [newTourn,setNewTourn]=useState({name:"",skill:"Intermediate",size:16,startDate:"",deadlineDays:14,format:"league",surface:"Hard Court"});

  // Social
  var [friends,setFriends]=useState([]);
  var [sentRequests,setSentRequests]=useState([]);
  var [receivedRequests,setReceivedRequests]=useState([]);
  var [blockedUsers,setBlockedUsers]=useState([]);
  var [notifications,setNotifications]=useState([]);
  var [showNotifications,setShowNotifications]=useState(false);
  var [peopleTab,setPeopleTab]=useState("friends");
  var [peopleSearch,setPeopleSearch]=useState("");
  var [searchResults,setSearchResults]=useState([]);
  var [searchLoading,setSearchLoading]=useState(false);
  var [showSearchDrop,setShowSearchDrop]=useState(false);
  var [suggestedPlayers,setSuggestedPlayers]=useState([]);
  var [socialLoading,setSocialLoading]=useState({});
  var searchTimer=useRef(null);

  var myId=authUser?authUser.id:"local-user";

  function requireAuth(cb){
    if(authUser)cb();else{setShowAuth(true);setAuthMode("login");setAuthStep("choose");}
  }

  // ── Load user data ──────────────────────────────────────────────────────────
  async function loadUserData(user,isNewSignIn){
    var init=initials(user.user_metadata.name||user.email);
    setAuthUser({id:user.id,name:user.user_metadata.name||user.email.split("@")[0],email:user.email,avatar:init});
    var r=await supabase.from('profiles').select('*').eq('id',user.id).single();
    var isNewUser=!r.data;
    var defaults={id:user.id,name:user.user_metadata.name||user.email.split("@")[0],suburb:"",skill:"Intermediate",style:"All-Court",bio:"",avatar:init,availability:{},ranking_points:1000,wins:0,losses:0,matches_played:0,streak_count:0,streak_type:null};
    if(r.data){
      setProfile(r.data);setProfileDraft(r.data);
    } else {
      setProfile(defaults);setProfileDraft(defaults);
      await supabase.from('profiles').upsert(defaults);
    }
    var hr=await supabase.from('match_history').select('*').eq('user_id',user.id).order('created_at',{ascending:false});
    var tr=await supabase.from('match_history').select('*').eq('tagged_user_id',user.id).eq('tag_status','accepted').order('created_at',{ascending:false});
    function normMatch(m,isTagged){
      var ownerResult=m.result||"loss";
      return {
        id:m.id,
        oppName:m.opp_name||"Unknown",
        tournName:m.tourn_name||"",
        date:m.match_date?new Date(m.match_date).toLocaleDateString("en-AU",{day:"numeric",month:"short",year:"numeric"}):"",
        sets:m.sets||[],
        result:isTagged?(ownerResult==="win"?"loss":"win"):ownerResult,
        notes:m.notes||"",
        tagged_user_id:m.tagged_user_id||null,
        tag_status:m.tag_status||null,
        isTagged:isTagged
      };
    }
    var ownNorm=(hr.data||[]).map(function(m){return normMatch(m,false);});
    var taggedNorm=(tr.data||[]).map(function(m){return normMatch(m,true);});
    var normalizedHistory=ownNorm.concat(taggedNorm).sort(function(a,b){return b.date<a.date?-1:1;});
    var matchIds=normalizedHistory.map(function(m){return m.id;});
    setHistory(normalizedHistory);
    if(matchIds.length){
      var lr=await supabase.from('feed_likes').select('match_id').eq('user_id',user.id).in('match_id',matchIds);
      if(lr.data){var likedMap={};lr.data.forEach(function(l){likedMap[l.match_id]=true;});setFeedLikes(likedMap);}
      var lcr=await supabase.from('feed_likes').select('match_id').in('match_id',matchIds);
      if(lcr.data){var countMap={};lcr.data.forEach(function(l){countMap[l.match_id]=(countMap[l.match_id]||0)+1;});setFeedLikeCounts(countMap);}
      var cr=await supabase.from('feed_comments').select('id,match_id,user_id,body,created_at').in('match_id',matchIds).order('created_at',{ascending:true});
      if(cr.data&&cr.data.length){
        var uids=[...new Set(cr.data.map(function(c){return c.user_id;}))];
        var pr=await supabase.from('profiles').select('id,name,avatar').in('id',uids);
        var nameMap={};(pr.data||[]).forEach(function(p){nameMap[p.id]={name:p.name,avatar:p.avatar};});
        var grouped={};
        cr.data.forEach(function(c){
          var author=nameMap[c.user_id]||{name:"Player",avatar:"?"};
          if(!grouped[c.match_id])grouped[c.match_id]=[];
          grouped[c.match_id].push({id:c.id,author:author.name,avatar:author.avatar,text:c.body,ts:new Date(c.created_at).getTime()});
        });
        setFeedComments(grouped);
      }
    }
    setAuthInitialized(true);
    loadSocialData(user.id,r.data||defaults);
    if(isNewUser&&isNewSignIn){
      setOnboardDraft({skill:"Intermediate",style:"All-Court",suburb:""});
      setOnboardStep(1);
      setShowOnboarding(true);
    }
  }

  // ── Social graph ────────────────────────────────────────────────────────────
  async function loadSocialData(userId,userProfile){
    try{
      var fr=await supabase.from('friend_requests').select('*').or('sender_id.eq.'+userId+',receiver_id.eq.'+userId);
      var allReqs=fr.data||[];
      var accepted=allReqs.filter(function(r){return r.status==='accepted';});
      var sentPend=allReqs.filter(function(r){return r.status==='pending'&&r.sender_id===userId;});
      var recvPend=allReqs.filter(function(r){return r.status==='pending'&&r.receiver_id===userId;});
      var otherIds=[...new Set([
        ...accepted.map(function(r){return r.sender_id===userId?r.receiver_id:r.sender_id;}),
        ...sentPend.map(function(r){return r.receiver_id;}),
        ...recvPend.map(function(r){return r.sender_id;}),
      ])].filter(function(id){return id&&id!==userId;});
      var pMap={};
      if(otherIds.length){
        var pr=await supabase.from('profiles').select('id,name,avatar,skill,suburb,ranking_points,wins,losses,matches_played,privacy').in('id',otherIds);
        (pr.data||[]).forEach(function(p){pMap[p.id]=p;});
      }
      setFriends(accepted.map(function(r){var oid=r.sender_id===userId?r.receiver_id:r.sender_id;return Object.assign({requestId:r.id},pMap[oid]||{id:oid,name:"Player"});}));
      setSentRequests(sentPend.map(function(r){return Object.assign({requestId:r.id},pMap[r.receiver_id]||{id:r.receiver_id,name:"Player"});}));
      setReceivedRequests(recvPend.map(function(r){return Object.assign({requestId:r.id},pMap[r.sender_id]||{id:r.sender_id,name:"Player"});}));
      var bl=await supabase.from('blocks').select('blocked_id').eq('blocker_id',userId);
      var blockedIds=(bl.data||[]).map(function(b){return b.blocked_id;});
      if(blockedIds.length){var bpr=await supabase.from('profiles').select('id,name,avatar,suburb').in('id',blockedIds);setBlockedUsers(bpr.data||[]);}
      else{setBlockedUsers([]);}
      var nr=await supabase.from('notifications').select('*').eq('user_id',userId).order('created_at',{ascending:false}).limit(20);
      if(nr.data&&nr.data.length){
        var fromIds=[...new Set(nr.data.map(function(n){return n.from_user_id;}).filter(Boolean))];
        var fpr=fromIds.length?await supabase.from('profiles').select('id,name,avatar').in('id',fromIds):{data:[]};
        var fpMap={};(fpr.data||[]).forEach(function(p){fpMap[p.id]=p;});
        setNotifications(nr.data.map(function(n){var fp=fpMap[n.from_user_id]||{};return Object.assign({},n,{fromName:fp.name||"Someone",fromAvatar:fp.avatar||"?"});}));
      } else {setNotifications([]);}
      var friendIds=accepted.map(function(r){return r.sender_id===userId?r.receiver_id:r.sender_id;});
      var excludeIds=[userId,...friendIds,...blockedIds];
      var sq=await supabase.from('profiles').select('id,name,avatar,skill,suburb,ranking_points,matches_played')
        .neq('id',userId).eq('suburb',userProfile.suburb||"Sydney")
        .not('id','in','('+excludeIds.join(',')+')')
        .limit(6);
      setSuggestedPlayers(sq.data||[]);
    }catch(e){console.error('loadSocialData',e);}
  }

  function isFriend(uid){return friends.some(function(f){return f.id===uid;});}
  function sentReq(uid){return sentRequests.find(function(r){return r.id===uid;});}
  function recvReq(uid){return receivedRequests.find(function(r){return r.id===uid;});}
  function isBlocked(uid){return blockedUsers.some(function(b){return b.id===uid;});}
  function unreadCount(){return notifications.filter(function(n){return!n.read;}).length;}
  function friendRelationLabel(uid){
    if(isFriend(uid))return"friends";if(sentReq(uid))return"sent";
    if(recvReq(uid))return"received";if(isBlocked(uid))return"blocked";return"none";
  }

  async function sendFriendRequest(target){
    if(!authUser||isFriend(target.id)||sentReq(target.id)||isBlocked(target.id))return;
    setSocialLoading(function(l){return Object.assign({},l,{[target.id]:true});});
    var r=await supabase.from('friend_requests').insert({sender_id:authUser.id,receiver_id:target.id}).select('id').single();
    if(!r.error){
      setSentRequests(function(s){return s.concat([Object.assign({requestId:r.data.id},target)]);});
      await supabase.from('notifications').insert({user_id:target.id,type:'friend_request',from_user_id:authUser.id});
    }
    setSocialLoading(function(l){return Object.assign({},l,{[target.id]:false});});
  }
  async function acceptRequest(req){
    setSocialLoading(function(l){return Object.assign({},l,{[req.id]:true});});
    await supabase.from('friend_requests').update({status:'accepted',updated_at:new Date().toISOString()}).eq('id',req.requestId);
    setReceivedRequests(function(r){return r.filter(function(x){return x.requestId!==req.requestId;});});
    setFriends(function(f){return f.concat([req]);});
    await supabase.from('notifications').insert({user_id:req.id,type:'request_accepted',from_user_id:authUser.id});
    setSocialLoading(function(l){return Object.assign({},l,{[req.id]:false});});
  }
  async function declineRequest(req){
    setSocialLoading(function(l){return Object.assign({},l,{[req.id]:true});});
    await supabase.from('friend_requests').update({status:'declined',updated_at:new Date().toISOString()}).eq('id',req.requestId);
    setReceivedRequests(function(r){return r.filter(function(x){return x.requestId!==req.requestId;});});
    setSocialLoading(function(l){return Object.assign({},l,{[req.id]:false});});
  }
  async function cancelRequest(req){
    setSocialLoading(function(l){return Object.assign({},l,{[req.id]:true});});
    await supabase.from('friend_requests').delete().eq('id',req.requestId);
    setSentRequests(function(s){return s.filter(function(x){return x.requestId!==req.requestId;});});
    setSocialLoading(function(l){return Object.assign({},l,{[req.id]:false});});
  }
  async function unfriend(target){
    setSocialLoading(function(l){return Object.assign({},l,{[target.id]:true});});
    await supabase.from('friend_requests').delete()
      .or('and(sender_id.eq.'+authUser.id+',receiver_id.eq.'+target.id+'),and(sender_id.eq.'+target.id+',receiver_id.eq.'+authUser.id+')');
    setFriends(function(f){return f.filter(function(x){return x.id!==target.id;});});
    setSocialLoading(function(l){return Object.assign({},l,{[target.id]:false});});
  }
  async function blockUser(target){
    setSocialLoading(function(l){return Object.assign({},l,{[target.id]:true});});
    if(isFriend(target.id)){await unfriend(target);}
    var sr=sentReq(target.id);if(sr)await cancelRequest(sr);
    var rr=recvReq(target.id);if(rr)await declineRequest(rr);
    await supabase.from('blocks').insert({blocker_id:authUser.id,blocked_id:target.id});
    setBlockedUsers(function(b){return b.concat([target]);});
    setSearchResults(function(r){return r.filter(function(x){return x.id!==target.id;});});
    setSuggestedPlayers(function(s){return s.filter(function(x){return x.id!==target.id;});});
    setSocialLoading(function(l){return Object.assign({},l,{[target.id]:false});});
  }
  async function unblockUser(target){
    await supabase.from('blocks').delete().eq('blocker_id',authUser.id).eq('blocked_id',target.id);
    setBlockedUsers(function(b){return b.filter(function(x){return x.id!==target.id;});});
  }
  async function markNotificationsRead(){
    var unread=notifications.filter(function(n){return!n.read;});
    if(!unread.length||!authUser)return;
    await supabase.from('notifications').update({read:true}).eq('user_id',authUser.id).eq('read',false);
    setNotifications(function(ns){return ns.map(function(n){return Object.assign({},n,{read:true});});});
  }
  async function searchUsers(query){
    if(!query.trim()||!authUser){setSearchResults([]);setSearchLoading(false);setShowSearchDrop(false);return;}
    var q=query.trim();
    var r=await supabase.from('profiles').select('id,name,avatar,skill,suburb,ranking_points,matches_played,wins,privacy').ilike('name','%'+q+'%').neq('id',authUser.id).limit(10);
    if(r.error){setSearchLoading(false);return;}
    var blockedIds=blockedUsers.map(function(b){return b.id;});
    setSearchResults((r.data||[]).filter(function(u){return!blockedIds.includes(u.id);}));
    setShowSearchDrop(true);setSearchLoading(false);
  }
  async function deleteMatch(m){
    if(!authUser)return;
    if(m.tagged_user_id&&m.tag_status==='accepted'){
      await supabase.from('notifications').insert({user_id:m.tagged_user_id,type:'match_deleted',from_user_id:authUser.id,match_id:m.id});
    }
    await supabase.from('match_history').delete().eq('id',m.id).eq('user_id',authUser.id);
    setHistory(function(h){return h.filter(function(x){return x.id!==m.id;});});
  }
  async function removeTaggedMatch(m){
    await supabase.from('match_history').update({tag_status:'declined'}).eq('id',m.id);
    setHistory(function(h){return h.filter(function(x){return x.id!==m.id;});});
  }
  async function acceptMatchTag(n){
    var mr=await supabase.from('match_history').update({tag_status:'accepted'}).eq('id',n.match_id).select('*').single();
    await supabase.from('notifications').delete().eq('id',n.id);
    setNotifications(function(ns){return ns.filter(function(x){return x.id!==n.id;});});
    setShowNotifications(false);setTab("home");
    if(mr.error){console.error('[accept] failed:',mr.error);return;}
    if(mr.data){
      var m=mr.data;
      var ownerResult=m.result||"loss";
      var friendResult=ownerResult==="win"?"loss":"win";
      var nm={id:m.id,oppName:m.opp_name||"Unknown",tournName:m.tourn_name||"",date:m.match_date?new Date(m.match_date).toLocaleDateString("en-AU",{day:"numeric",month:"short",year:"numeric"}):"",sets:m.sets||[],result:friendResult,notes:m.notes||"",isTagged:true,tagged_user_id:m.tagged_user_id,tag_status:'accepted'};
      setHistory(function(h){return h.some(function(x){return x.id===m.id;})?h:[nm].concat(h);});
      setProfile(function(p){
        var newWins=(p.wins||0)+(friendResult==="win"?1:0);
        var newLosses=(p.losses||0)+(friendResult==="loss"?1:0);
        var newPlayed=(p.matches_played||0)+1;
        var newPts=Math.max(0,1000+newWins*15-newLosses*10);
        supabase.from('profiles').upsert({id:authUser.id,wins:newWins,losses:newLosses,matches_played:newPlayed,ranking_points:newPts},{onConflict:'id'});
        return Object.assign({},p,{wins:newWins,losses:newLosses,matches_played:newPlayed,ranking_points:newPts});
      });
    }
  }
  async function declineMatchTag(n){
    await supabase.from('match_history').update({tag_status:'declined'}).eq('id',n.match_id);
    await supabase.from('notifications').delete().eq('id',n.id);
    setNotifications(function(ns){return ns.filter(function(x){return x.id!==n.id;});});
  }

  // ── Tournament helpers ──────────────────────────────────────────────────────
  var isEntered=function(tournId){var t2=tournaments.find(function(x){return x.id===tournId;});return t2?(t2.entrants||[]).some(function(e){return e.id===myId;}):false;};
  var isWaitlisted=function(tournId){var t2=tournaments.find(function(x){return x.id===tournId;});return t2?(t2.waitlist||[]).some(function(e){return e.id===myId;}):false;};
  var waitlistPos=function(tournId){var t2=tournaments.find(function(x){return x.id===tournId;});if(!t2)return null;var idx=(t2.waitlist||[]).findIndex(function(e){return e.id===myId;});return idx>=0?idx+1:null;};
  function tournStatus(t2){
    if(t2.status==="completed")return{label:"Completed",color:t.textTertiary};
    if(t2.status==="active")return{label:"Live",color:t.green};
    var spotsLeft=t2.size-(t2.entrants||[]).length;
    if(spotsLeft<=0&&(t2.waitlist||[]).length>0)return{label:"Waitlist",color:t.purple};
    if(spotsLeft<=0)return{label:"Full",color:t.red};
    if(spotsLeft<=4)return{label:spotsLeft+" left",color:t.orange};
    return{label:"Open",color:t.green};
  }
  var enterTournament=function(tournId){
    requireAuth(function(){
      setTournaments(function(prev){return prev.map(function(t2){
        if(t2.id!==tournId||(t2.entrants||[]).some(function(e){return e.id===myId;}))return t2;
        var newE={id:myId,name:profile.name,avatar:profile.avatar||"YN",skill:profile.skill};
        var updated=Object.assign({},t2,{entrants:(t2.entrants||[]).concat([newE])});
        supabase.from('tournaments').upsert(updated);return updated;
      });});
    });
  };
  var joinWaitlist=function(tournId){
    requireAuth(function(){
      setTournaments(function(prev){return prev.map(function(t2){
        if(t2.id!==tournId)return t2;var wl=t2.waitlist||[];
        if(wl.some(function(e){return e.id===myId;}))return t2;
        var newE={id:myId,name:profile.name,avatar:profile.avatar||"YN",skill:profile.skill,position:wl.length+1};
        var updated=Object.assign({},t2,{waitlist:wl.concat([newE])});
        supabase.from('tournaments').upsert(updated);return updated;
      });});
    });
  };
  var seedTournament=function(tournId){
    requireAuth(function(){
      setTournaments(function(prev){return prev.map(function(t2){
        if(t2.id!==tournId)return t2;
        var existing=(t2.entrants||[]).map(function(e){return e.id;});
        var me={id:myId,name:profile.name,avatar:profile.avatar||"YN",skill:profile.skill};
        var toAdd=BOT_PLAYERS.filter(function(b){return!existing.includes(b.id);}).slice(0,15);
        var allEntrants=(t2.entrants||[]).concat(toAdd);
        if(!existing.includes(myId))allEntrants=[me].concat(toAdd);
        allEntrants=allEntrants.slice(0,t2.size);
        var updated=Object.assign({},t2,{entrants:allEntrants});
        supabase.from('tournaments').upsert(updated);return updated;
      });});
    });
  };
  var generateDraw=function(tournId){
    setTournaments(function(prev){return prev.map(function(t2){
      if(t2.id!==tournId)return t2;
      var entrants=t2.entrants.slice();
      for(var i=entrants.length-1;i>0;i--){var j=Math.floor(Math.random()*(i+1));var tmp=entrants[i];entrants[i]=entrants[j];entrants[j]=tmp;}
      var updated;
      if(t2.format==="league"){
        var allPairs=[];
        for(var a=0;a<entrants.length;a++){for(var b=a+1;b<entrants.length;b++){allPairs.push([entrants[a],entrants[b]]);}}
        for(var ip=allPairs.length-1;ip>0;ip--){var jp=Math.floor(Math.random()*(ip+1));var tp=allPairs[ip];allPairs[ip]=allPairs[jp];allPairs[jp]=tp;}
        var matchesPerRound=Math.max(1,Math.floor(entrants.length/2));var leagueRounds=5;var newRounds=[];
        for(var ri=0;ri<leagueRounds;ri++){
          var roundPairs=allPairs.slice(ri*matchesPerRound,(ri+1)*matchesPerRound);if(!roundPairs.length)break;
          var dl=new Date();dl.setDate(dl.getDate()+(ri+1)*(t2.deadlineDays||14));var dlStr=dl.toISOString().split("T")[0];
          newRounds.push({round:ri+1,type:"league",matches:roundPairs.map(function(pair,ki){return{id:"m"+Date.now()+ri+ki,p1:pair[0],p2:pair[1],winner:null,sets:[],status:"scheduled",deadline:dlStr,scheduledDate:"",scheduledTime:"",scheduledCourt:""};})});
        }
        updated=Object.assign({},t2,{status:"active",rounds:newRounds});updated=autoResolveBots(updated,myId);
      } else {
        var matches=[];
        for(var k=0;k<entrants.length;k+=2){var dl2=new Date();dl2.setDate(dl2.getDate()+(t2.deadlineDays||14));matches.push({id:"m"+Date.now()+k,p1:entrants[k]||null,p2:entrants[k+1]||null,winner:null,sets:[],status:"scheduled",deadline:dl2.toISOString().split("T")[0],scheduledDate:"",scheduledTime:"",scheduledCourt:""});}
        updated=Object.assign({},t2,{status:"active",rounds:[{round:1,matches:matches}]});updated=autoResolveBots(updated,myId);
      }
      supabase.from('tournaments').upsert(updated);return updated;
    });});
  };
  var recordResult=function(tournId,roundIdx,matchId,winnerId){
    setTournaments(function(prev){return prev.map(function(t2){
      if(t2.id!==tournId)return t2;
      var newRounds=t2.rounds.map(function(r,ri){
        if(ri!==roundIdx)return r;
        return{round:r.round,type:r.type,matches:r.matches.map(function(m){if(m.id!==matchId)return m;return Object.assign({},m,{winner:winnerId,status:"complete"});})};
      });
      if(t2.format==="league"){
        var leagueRounds=newRounds.filter(function(r){return r.type==="league";});
        var allLeagueDone=leagueRounds.every(function(r){return r.matches.every(function(m){return m.status==="complete"||!m.p2;});});
        var hasSemi=newRounds.find(function(r){return r.type==="semi";});
        if(allLeagueDone&&!hasSemi){
          var tempT=Object.assign({},t2,{rounds:newRounds});
          var standings=computeStandings(tempT);var top4=standings.slice(0,4);
          if(top4.length>=2){
            var dl=new Date();dl.setDate(dl.getDate()+(t2.deadlineDays||14));var dlStr=dl.toISOString().split("T")[0];
            newRounds=newRounds.concat([{round:leagueRounds.length+1,type:"semi",matches:[
              {id:"sf1"+Date.now(),p1:top4[0],p2:top4[3]||null,winner:null,sets:[],status:"scheduled",deadline:dlStr,scheduledDate:"",scheduledTime:"",scheduledCourt:""},
              {id:"sf2"+Date.now(),p1:top4[1],p2:top4[2]||null,winner:null,sets:[],status:"scheduled",deadline:dlStr,scheduledDate:"",scheduledTime:"",scheduledCourt:""},
            ]}]);
          }
        }
        var semiRound=newRounds.find(function(r){return r.type==="semi";});
        if(semiRound){
          var semiDone=semiRound.matches.every(function(m){return m.status==="complete";});
          var hasFinal=newRounds.find(function(r){return r.type==="final";});
          if(semiDone&&!hasFinal){
            var sf1=semiRound.matches[0],sf2=semiRound.matches[1];
            var w1=sf1.winner===sf1.p1.id?sf1.p1:sf1.p2;
            var w2=sf2&&sf2.winner?(sf2.winner===sf2.p1.id?sf2.p1:sf2.p2):null;
            var dl3=new Date();dl3.setDate(dl3.getDate()+(t2.deadlineDays||14));
            newRounds=newRounds.concat([{round:newRounds.length+1,type:"final",matches:[{id:"f1"+Date.now(),p1:w1,p2:w2,winner:null,sets:[],status:"scheduled",deadline:dl3.toISOString().split("T")[0],scheduledDate:"",scheduledTime:"",scheduledCourt:""}]}]);
          }
          var finalRound=newRounds.find(function(r){return r.type==="final";});
          if(finalRound&&finalRound.matches[0]&&finalRound.matches[0].status==="complete"){
            var fm=finalRound.matches[0];var champ=fm.winner===fm.p1.id?fm.p1:fm.p2;
            var fin=Object.assign({},t2,{rounds:newRounds,status:"completed",winner:champ});supabase.from('tournaments').upsert(fin);return fin;
          }
        }
        var fin2=autoResolveBots(Object.assign({},t2,{rounds:newRounds}),myId);supabase.from('tournaments').upsert(fin2);return fin2;
      } else {
        var cur=newRounds[newRounds.length-1];
        var allDone=cur.matches.every(function(m){return m.status==="complete"||!m.p2;});
        if(allDone){
          var winners=cur.matches.filter(function(m){return m.winner;}).map(function(m){return m.p1&&m.p1.id===m.winner?m.p1:m.p2;}).filter(Boolean);
          if(winners.length>1){
            var nextMatches=[];
            for(var ni=0;ni<winners.length;ni+=2){var dlE=new Date();dlE.setDate(dlE.getDate()+(t2.deadlineDays||14));nextMatches.push({id:"m"+Date.now()+ni,p1:winners[ni],p2:winners[ni+1]||null,winner:null,sets:[],status:"scheduled",deadline:dlE.toISOString().split("T")[0],scheduledDate:"",scheduledTime:"",scheduledCourt:""});}
            newRounds=newRounds.concat([{round:cur.round+1,matches:nextMatches}]);
          } else if(winners.length===1){var finE=Object.assign({},t2,{status:"completed",rounds:newRounds,winner:winners[0]});supabase.from('tournaments').upsert(finE);return finE;}
        }
        var finE2=autoResolveBots(Object.assign({},t2,{rounds:newRounds}),myId);supabase.from('tournaments').upsert(finE2);return finE2;
      }
    });});
  };
  var scheduleMatch=function(tournId,roundIdx,matchId,date,time,court){
    setTournaments(function(prev){return prev.map(function(t2){
      if(t2.id!==tournId)return t2;
      var newRounds=t2.rounds.map(function(r,ri){
        if(ri!==roundIdx)return r;
        return{round:r.round,type:r.type,matches:r.matches.map(function(m){if(m.id!==matchId)return m;return Object.assign({},m,{scheduledDate:date,scheduledTime:time,scheduledCourt:court});})};
      });
      var updated=Object.assign({},t2,{rounds:newRounds});supabase.from('tournaments').upsert(updated);return updated;
    });});
  };

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div style={{minHeight:"100vh",background:t.bg,color:t.text,paddingBottom:88,fontFamily:"-apple-system,BlinkMacSystemFont,'Helvetica Neue',sans-serif"}}>

      {/* Nav */}
      <nav style={{position:"sticky",top:0,zIndex:40,backdropFilter:"blur(20px)",WebkitBackdropFilter:"blur(20px)",background:t.navBg,borderBottom:"1px solid "+t.border}}>
        <div style={{maxWidth:680,margin:"0 auto",padding:"0 20px",height:54,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <div style={{width:30,height:30,borderRadius:8,background:t.accent,display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:800,color:"#fff",letterSpacing:"-0.5px"}}>CS</div>
            <span style={{fontSize:16,fontWeight:700,letterSpacing:"-0.4px",color:t.text}}>CourtSync</span>
          </div>
          <div style={{display:"flex",gap:8,alignItems:"center"}}>
            <button
              onClick={function(){setDark(function(d){var next=!d;localStorage.setItem("theme",next?"dark":"light");return next;});}}
              style={{background:"transparent",border:"1px solid "+t.border,borderRadius:7,padding:"5px 10px",fontSize:11,color:t.textSecondary,fontWeight:500}}>
              {dark?"Light":"Dark"}
            </button>
            {authUser&&(
              <button
                onClick={function(){setShowNotifications(function(v){return!v;});if(!showNotifications)markNotificationsRead();}}
                style={{position:"relative",width:34,height:34,borderRadius:"50%",background:unreadCount()>0?t.accentSubtle:t.bgTertiary,border:"1px solid "+(unreadCount()>0?t.accent:t.border),display:"flex",alignItems:"center",justifyContent:"center",fontSize:16}}>
                🔔
                {unreadCount()>0&&(
                  <div style={{position:"absolute",top:-3,right:-3,width:16,height:16,borderRadius:"50%",background:t.red,border:"2px solid "+t.bg,display:"flex",alignItems:"center",justifyContent:"center",fontSize:8,fontWeight:800,color:"#fff"}}>
                    {unreadCount()>9?"9+":unreadCount()}
                  </div>
                )}
              </button>
            )}
            {authUser
              ?<button
                  onClick={function(){setTab("profile");setProfileTab("overview");}}
                  style={{width:32,height:32,borderRadius:"50%",background:avColor(profile.name),border:"none",fontSize:11,fontWeight:700,color:"#fff"}}>
                  {profile.avatar}
                </button>
              :<button
                  onClick={function(){setShowAuth(true);setAuthMode("login");setAuthStep("choose");}}
                  style={{background:t.accent,border:"none",borderRadius:8,padding:"7px 16px",fontSize:13,fontWeight:600,color:"#fff"}}>
                  Log in
                </button>
            }
          </div>
        </div>
      </nav>

      {/* Notifications panel */}
      {showNotifications&&authUser&&(
        <NotificationsPanel
          t={t} notifications={notifications}
          markNotificationsRead={markNotificationsRead}
          acceptMatchTag={acceptMatchTag} declineMatchTag={declineMatchTag}
          setTab={setTab} setPeopleTab={setPeopleTab}
          setShowNotifications={setShowNotifications}
        />
      )}

      {/* Tab bar */}
      <div style={{position:"fixed",bottom:0,left:0,right:0,zIndex:50,backdropFilter:"blur(20px)",WebkitBackdropFilter:"blur(20px)",background:t.tabBar,borderTop:"1px solid "+t.border}}>
        <div style={{maxWidth:680,margin:"0 auto",display:"flex",padding:"10px 0 16px"}}>
          {TABS.map(function(tb){
            var on=tab===tb.id;
            return (
              <button key={tb.id}
                onClick={function(){setTab(tb.id);if(tb.id!=="tournaments")setSelectedTournId(null);}}
                style={{flex:1,background:"none",border:"none",display:"flex",flexDirection:"column",alignItems:"center",gap:4,color:on?t.accent:t.textTertiary,padding:"2px 0"}}>
                <div style={{width:4,height:4,borderRadius:"50%",background:on?t.accent:"transparent",marginBottom:1,transition:"background 0.15s"}}/>
                <span style={{fontSize:10,fontWeight:on?700:400}}>{tb.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Tab content */}
      {tab==="home"&&(
        <HomeTab
          t={t} authUser={authUser} profile={profile} history={history}
          feedLikes={feedLikes} setFeedLikes={setFeedLikes}
          feedLikeCounts={feedLikeCounts} setFeedLikeCounts={setFeedLikeCounts}
          feedComments={feedComments} commentModal={commentModal}
          setCommentModal={setCommentModal} commentDraft={commentDraft} setCommentDraft={setCommentDraft}
          setShowAuth={setShowAuth} setAuthMode={setAuthMode} setAuthStep={setAuthStep}
          setCasualOppName={setCasualOppName} setScoreModal={setScoreModal} setScoreDraft={setScoreDraft}
          deleteMatch={deleteMatch} removeTaggedMatch={removeTaggedMatch}
        />
      )}
      {tab==="tournaments"&&(
        <TournamentsTab
          t={t} myId={myId} tournaments={tournaments}
          selectedTournId={selectedTournId} setSelectedTournId={setSelectedTournId}
          tournDetailTab={tournDetailTab} setTournDetailTab={setTournDetailTab}
          filterSkill={filterSkill} setFilterSkill={setFilterSkill}
          isEntered={isEntered} isWaitlisted={isWaitlisted} waitlistPos={waitlistPos}
          enterTournament={enterTournament} joinWaitlist={joinWaitlist} tournStatus={tournStatus}
          setScheduleModal={setScheduleModal} setScheduleDraft={setScheduleDraft}
          setScoreModal={setScoreModal} setScoreDraft={setScoreDraft}
        />
      )}
      {tab==="people"&&(
        <PeopleTab
          t={t} authUser={authUser} friends={friends}
          sentRequests={sentRequests} receivedRequests={receivedRequests}
          blockedUsers={blockedUsers} suggestedPlayers={suggestedPlayers}
          peopleTab={peopleTab} setPeopleTab={setPeopleTab}
          peopleSearch={peopleSearch} setPeopleSearch={setPeopleSearch}
          searchResults={searchResults} searchLoading={searchLoading}
          showSearchDrop={showSearchDrop} setShowSearchDrop={setShowSearchDrop}
          socialLoading={socialLoading} searchTimer={searchTimer}
          sendFriendRequest={sendFriendRequest} acceptRequest={acceptRequest}
          declineRequest={declineRequest} cancelRequest={cancelRequest}
          unfriend={unfriend} blockUser={blockUser} unblockUser={unblockUser}
          searchUsers={searchUsers}
          friendRelationLabel={friendRelationLabel} sentReq={sentReq} recvReq={recvReq}
          setShowAuth={setShowAuth} setAuthMode={setAuthMode} setAuthStep={setAuthStep}
        />
      )}
      {tab==="profile"&&(
        <ProfileTab
          t={t} authUser={authUser} profile={profile} setProfile={setProfile}
          profileDraft={profileDraft} setProfileDraft={setProfileDraft}
          history={history} receivedRequests={receivedRequests}
          profileTab={profileTab} setProfileTab={setProfileTab}
          editingAvail={editingAvail} setEditingAvail={setEditingAvail}
          availDraft={availDraft} setAvailDraft={setAvailDraft}
          setTab={setTab} setPeopleTab={setPeopleTab}
        />
      )}
      {tab==="admin"&&(
        <AdminTab
          t={t} tournaments={tournaments} setTournaments={setTournaments}
          adminTab={adminTab} setAdminTab={setAdminTab}
          newTourn={newTourn} setNewTourn={setNewTourn}
          myId={myId} profile={profile}
          seedTournament={seedTournament} generateDraw={generateDraw} recordResult={recordResult}
          setSelectedTournId={setSelectedTournId} setTab={setTab} setTournDetailTab={setTournDetailTab}
        />
      )}

      {/* Modals */}
      <ScheduleModal
        t={t} scheduleModal={scheduleModal} setScheduleModal={setScheduleModal}
        scheduleDraft={scheduleDraft} setScheduleDraft={setScheduleDraft}
        scheduleMatch={scheduleMatch}
      />
      <ScoreModal
        t={t} authUser={authUser} scoreModal={scoreModal} setScoreModal={setScoreModal}
        scoreDraft={scoreDraft} setScoreDraft={setScoreDraft}
        casualOppName={casualOppName} setCasualOppName={setCasualOppName}
        showOppDrop={showOppDrop} setShowOppDrop={setShowOppDrop}
        friends={friends} suggestedPlayers={suggestedPlayers}
        history={history} setHistory={setHistory}
        profile={profile} setProfile={setProfile}
        recordResult={recordResult}
      />
      <CommentModal
        t={t} authUser={authUser} profile={profile}
        commentModal={commentModal} setCommentModal={setCommentModal}
        commentDraft={commentDraft} setCommentDraft={setCommentDraft}
        feedComments={feedComments} setFeedComments={setFeedComments}
      />
      <AuthModal
        t={t} showAuth={showAuth} setShowAuth={setShowAuth}
        authMode={authMode} setAuthMode={setAuthMode}
        authStep={authStep} setAuthStep={setAuthStep}
        authEmail={authEmail} setAuthEmail={setAuthEmail}
        authPassword={authPassword} setAuthPassword={setAuthPassword}
        authName={authName} setAuthName={setAuthName}
        authLoading={authLoading} setAuthLoading={setAuthLoading}
        authNewPassword={authNewPassword} setAuthNewPassword={setAuthNewPassword}
        authNewPassword2={authNewPassword2} setAuthNewPassword2={setAuthNewPassword2}
        authError={authError} setAuthError={setAuthError}
        authFieldErrors={authFieldErrors} setAuthFieldErrors={setAuthFieldErrors}
      />
      <OnboardingModal
        t={t} authUser={authUser}
        showOnboarding={showOnboarding} setShowOnboarding={setShowOnboarding}
        profile={profile} setProfile={setProfile} setProfileDraft={setProfileDraft}
        onboardStep={onboardStep} setOnboardStep={setOnboardStep}
        onboardDraft={onboardDraft} setOnboardDraft={setOnboardDraft}
      />
    </div>
  );
}
