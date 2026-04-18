// src/features/tournaments/hooks/useTournamentManager.js
import { useState, useEffect } from "react";
import * as T from "../services/tournamentService.js";
import { BOT_PLAYERS } from "../../../lib/constants.js";
import { buildLeagueDraw, buildKnockoutDraw, applyResultToTournament, applySchedule } from "../utils/bracketUtils.js";

export function useTournamentManager(opts){
  var themeTokens=opts&&opts.themeTokens;
  var profile=opts&&opts.profile;
  var myId=(opts&&opts.myId)||"local-user";
  var requireAuth=(opts&&opts.requireAuth)||function(cb){cb();};

  var [tournaments,setTournaments]=useState([]);
  var [selectedTournId,setSelectedTournId]=useState(null);
  var [tournDetailTab,setTournDetailTab]=useState("overview");
  var [filterSkill,setFilterSkill]=useState("All");
  var [adminTab,setAdminTab]=useState("tournaments");
  var [newTourn,setNewTourn]=useState({name:"",skill:"Intermediate",size:16,startDate:"",deadlineDays:14,format:"league",surface:"Hard Court"});
  var [scheduleModal,setScheduleModal]=useState(null);
  var [scheduleDraft,setScheduleDraft]=useState({date:"",time:"6:00 PM",court:"Court 1"});

  useEffect(function(){
    T.fetchAllTournaments().then(function(r){
      if(r.data&&r.data.length>0)setTournaments(r.data);
    });
  },[]);

  var isEntered=function(tournId){var x=tournaments.find(function(z){return z.id===tournId;});return x?(x.entrants||[]).some(function(e){return e.id===myId;}):false;};
  var isWaitlisted=function(tournId){var x=tournaments.find(function(z){return z.id===tournId;});return x?(x.waitlist||[]).some(function(e){return e.id===myId;}):false;};
  var waitlistPos=function(tournId){var x=tournaments.find(function(z){return z.id===tournId;});if(!x)return null;var idx=(x.waitlist||[]).findIndex(function(e){return e.id===myId;});return idx>=0?idx+1:null;};

  function tournStatus(t2){
    var tk=themeTokens||{};
    if(t2.status==="completed")return{label:"Completed",color:tk.textTertiary};
    if(t2.status==="active")return{label:"Live",color:tk.green};
    var spotsLeft=t2.size-(t2.entrants||[]).length;
    if(spotsLeft<=0&&(t2.waitlist||[]).length>0)return{label:"Waitlist",color:tk.purple};
    if(spotsLeft<=0)return{label:"Full",color:tk.red};
    if(spotsLeft<=4)return{label:spotsLeft+" left",color:tk.orange};
    return{label:"Open",color:tk.green};
  }

  var enterTournament=function(tournId){
    requireAuth(function(){
      setTournaments(function(prev){return prev.map(function(t2){
        if(t2.id!==tournId||(t2.entrants||[]).some(function(e){return e.id===myId;}))return t2;
        var newE={id:myId,name:profile.name,avatar:profile.avatar||"YN",skill:profile.skill};
        var updated=Object.assign({},t2,{entrants:(t2.entrants||[]).concat([newE])});
        T.upsertTournament(updated);return updated;
      });});
    });
  };
  var joinWaitlist=function(tournId){
    requireAuth(function(){
      setTournaments(function(prev){return prev.map(function(t2){
        if(t2.id!==tournId)return t2;
        var wl=t2.waitlist||[];
        if(wl.some(function(e){return e.id===myId;}))return t2;
        var newE={id:myId,name:profile.name,avatar:profile.avatar||"YN",skill:profile.skill,position:wl.length+1};
        var updated=Object.assign({},t2,{waitlist:wl.concat([newE])});
        T.upsertTournament(updated);return updated;
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
        T.upsertTournament(updated);return updated;
      });});
    });
  };
  var generateDraw=function(tournId){
    setTournaments(function(prev){return prev.map(function(t2){
      if(t2.id!==tournId)return t2;
      var deadlineDays=t2.deadlineDays||14;
      var updated=t2.format==="league"
        ? buildLeagueDraw(t2,myId,deadlineDays)
        : buildKnockoutDraw(t2,myId,deadlineDays);
      T.upsertTournament(updated);return updated;
    });});
  };
  var recordResult=function(tournId,roundIdx,matchId,winnerId){
    setTournaments(function(prev){return prev.map(function(t2){
      if(t2.id!==tournId)return t2;
      var updated=applyResultToTournament(t2,roundIdx,matchId,winnerId,myId);
      T.upsertTournament(updated);return updated;
    });});
  };
  var scheduleMatch=function(tournId,roundIdx,matchId,date,time,court){
    setTournaments(function(prev){return prev.map(function(t2){
      if(t2.id!==tournId)return t2;
      var updated=applySchedule(t2,roundIdx,matchId,date,time,court);
      T.upsertTournament(updated);return updated;
    });});
  };

  return {
    tournaments, setTournaments,
    selectedTournId, setSelectedTournId,
    tournDetailTab, setTournDetailTab,
    filterSkill, setFilterSkill,
    adminTab, setAdminTab, newTourn, setNewTourn,
    scheduleModal, setScheduleModal, scheduleDraft, setScheduleDraft,
    isEntered, isWaitlisted, waitlistPos, tournStatus,
    enterTournament, joinWaitlist, seedTournament, generateDraw,
    recordResult, scheduleMatch,
  };
}
