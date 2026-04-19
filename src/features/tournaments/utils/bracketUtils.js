// src/features/tournaments/utils/bracketUtils.js
// Pure tournament logic — takes a tournament, returns a new tournament.
import { autoResolveBots, computeStandings } from "./tournamentMath.js";

function shuffle(arr){
  var a=arr.slice();
  for(var i=a.length-1;i>0;i--){var j=Math.floor(Math.random()*(i+1));var tmp=a[i];a[i]=a[j];a[j]=tmp;}
  return a;
}

export function buildLeagueDraw(t, myId, deadlineDays){
  var entrants=shuffle(t.entrants||[]);
  var allPairs=[];
  for(var a=0;a<entrants.length;a++){for(var b=a+1;b<entrants.length;b++){allPairs.push([entrants[a],entrants[b]]);}}
  allPairs=shuffle(allPairs);
  var matchesPerRound=Math.max(1,Math.floor(entrants.length/2));
  var leagueRounds=5;
  var newRounds=[];
  for(var ri=0;ri<leagueRounds;ri++){
    var roundPairs=allPairs.slice(ri*matchesPerRound,(ri+1)*matchesPerRound);
    if(!roundPairs.length)break;
    var dl=new Date();dl.setDate(dl.getDate()+(ri+1)*deadlineDays);
    var dlStr=dl.toISOString().split("T")[0];
    newRounds.push({round:ri+1,type:"league",matches:roundPairs.map(function(pair,ki){
      return {id:"m"+Date.now()+ri+ki,p1:pair[0],p2:pair[1],winner:null,sets:[],status:"scheduled",deadline:dlStr,scheduledDate:"",scheduledTime:"",scheduledCourt:""};
    })});
  }
  var updated=Object.assign({},t,{status:"active",rounds:newRounds});
  return autoResolveBots(updated,myId);
}

export function buildKnockoutDraw(t, myId, deadlineDays){
  var entrants=shuffle(t.entrants||[]);
  var matches=[];
  for(var k=0;k<entrants.length;k+=2){
    var dl2=new Date();dl2.setDate(dl2.getDate()+deadlineDays);
    matches.push({id:"m"+Date.now()+k,p1:entrants[k]||null,p2:entrants[k+1]||null,winner:null,sets:[],status:"scheduled",deadline:dl2.toISOString().split("T")[0],scheduledDate:"",scheduledTime:"",scheduledCourt:""});
  }
  var updated=Object.assign({},t,{status:"active",rounds:[{round:1,matches:matches}]});
  return autoResolveBots(updated,myId);
}

export function applyResultToTournament(t, roundIdx, matchId, winnerId, myId){
  var newRounds=t.rounds.map(function(r,ri){
    if(ri!==roundIdx)return r;
    return {round:r.round,type:r.type,matches:r.matches.map(function(m){if(m.id!==matchId)return m;return Object.assign({},m,{winner:winnerId,status:"complete"});})};
  });
  var deadlineDays=t.deadlineDays||14;

  if(t.format==="league"){
    var leagueRounds=newRounds.filter(function(r){return r.type==="league";});
    var allLeagueDone=leagueRounds.every(function(r){return r.matches.every(function(m){return m.status==="complete"||!m.p2;});});
    var hasSemi=newRounds.find(function(r){return r.type==="semi";});
    if(allLeagueDone&&!hasSemi){
      var tempT=Object.assign({},t,{rounds:newRounds});
      var standings=computeStandings(tempT);
      var top4=standings.slice(0,4);
      if(top4.length>=2){
        var dl=new Date();dl.setDate(dl.getDate()+deadlineDays);
        var dlStr=dl.toISOString().split("T")[0];
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
        var dl3=new Date();dl3.setDate(dl3.getDate()+deadlineDays);
        newRounds=newRounds.concat([{round:newRounds.length+1,type:"final",matches:[{id:"f1"+Date.now(),p1:w1,p2:w2,winner:null,sets:[],status:"scheduled",deadline:dl3.toISOString().split("T")[0],scheduledDate:"",scheduledTime:"",scheduledCourt:""}]}]);
      }
      var finalRound=newRounds.find(function(r){return r.type==="final";});
      if(finalRound&&finalRound.matches[0]&&finalRound.matches[0].status==="complete"){
        var fm=finalRound.matches[0];
        var champ=fm.winner===fm.p1.id?fm.p1:fm.p2;
        return Object.assign({},t,{rounds:newRounds,status:"completed",winner:champ});
      }
    }
    return autoResolveBots(Object.assign({},t,{rounds:newRounds}),myId);
  } else {
    var cur=newRounds[newRounds.length-1];
    var allDone=cur.matches.every(function(m){return m.status==="complete"||!m.p2;});
    if(allDone){
      var winners=cur.matches.filter(function(m){return m.winner;}).map(function(m){return m.p1&&m.p1.id===m.winner?m.p1:m.p2;}).filter(Boolean);
      if(winners.length>1){
        var nextMatches=[];
        for(var ni=0;ni<winners.length;ni+=2){
          var dlE=new Date();dlE.setDate(dlE.getDate()+deadlineDays);
          nextMatches.push({id:"m"+Date.now()+ni,p1:winners[ni],p2:winners[ni+1]||null,winner:null,sets:[],status:"scheduled",deadline:dlE.toISOString().split("T")[0],scheduledDate:"",scheduledTime:"",scheduledCourt:""});
        }
        newRounds=newRounds.concat([{round:cur.round+1,matches:nextMatches}]);
      } else if(winners.length===1){
        return Object.assign({},t,{status:"completed",rounds:newRounds,winner:winners[0]});
      }
    }
    return autoResolveBots(Object.assign({},t,{rounds:newRounds}),myId);
  }
}

export function applySchedule(t, roundIdx, matchId, date, time, court){
  var newRounds=t.rounds.map(function(r,ri){
    if(ri!==roundIdx)return r;
    return {round:r.round,type:r.type,matches:r.matches.map(function(m){if(m.id!==matchId)return m;return Object.assign({},m,{scheduledDate:date,scheduledTime:time,scheduledCourt:court});})};
  });
  return Object.assign({},t,{rounds:newRounds});
}
