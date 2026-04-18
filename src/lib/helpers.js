import { AV_COLORS, ENTRY_FEES, PRIZES } from "./constants.js";

export function avColor(name) {
  return AV_COLORS[(name||"A").charCodeAt(0) % AV_COLORS.length];
}

export function initials(name) {
  return (name||"?").split(" ").map(function(w){return w[0];}).join("").slice(0,2).toUpperCase();
}

export function fmtDate(d) {
  return d.toLocaleDateString("en-AU",{weekday:"short",day:"numeric",month:"short"});
}

export function daysUntil(dateStr) {
  if(!dateStr) return null;
  var parts=dateStr.split("-");
  if(parts.length!==3) return null;
  var target=new Date(parseInt(parts[0]),parseInt(parts[1])-1,parseInt(parts[2]));
  var now=new Date(); now.setHours(0,0,0,0);
  return Math.ceil((target-now)/86400000);
}

export function netRevenue(size) {
  var rev=size*ENTRY_FEES[size], prize=PRIZES[size].value;
  var balls=(size-1)*3*2.67, stripe=size*(ENTRY_FEES[size]*0.0175+0.30);
  return Math.round(rev-prize-balls-stripe);
}

export function roundLabel(roundNum, size) {
  var m=size/Math.pow(2,roundNum);
  if(m===1) return "Final";
  if(m===2) return "Semifinals";
  if(m===4) return "Quarterfinals";
  return "Round of "+(m*2);
}

export function computeStandings(tournament) {
  var players={};
  (tournament.entrants||[]).forEach(function(e){
    players[e.id]=Object.assign({},e,{played:0,won:0,lost:0,pts:0});
  });
  (tournament.rounds||[]).forEach(function(r){
    if(r.type==="semi"||r.type==="final") return;
    (r.matches||[]).forEach(function(m){
      if(!m.winner||!m.p1||!m.p2) return;
      var wId=m.winner, lId=wId===m.p1.id?m.p2.id:m.p1.id;
      if(players[wId]){players[wId].played++;players[wId].won++;players[wId].pts+=3;}
      if(players[lId]){players[lId].played++;players[lId].lost++;}
    });
  });
  return Object.values(players).sort(function(a,b){return b.pts-a.pts||b.won-a.won;});
}

export function autoResolveBots(tournament, realUserId) {
  var t2=JSON.parse(JSON.stringify(tournament));
  function resolvePass() {
    var changed=false;
    t2.rounds=t2.rounds.map(function(r){
      return Object.assign({},r,{matches:r.matches.map(function(m){
        if(m.status==="complete"||!m.p1||!m.p2) return m;
        if(m.p1.id===realUserId||m.p2.id===realUserId) return m;
        changed=true;
        var winner=Math.random()>0.5?m.p1.id:m.p2.id;
        return Object.assign({},m,{winner:winner,status:"complete"});
      })});
    });
    return changed;
  }
  function checkLeagueComplete() {
    var leagueRounds=t2.rounds.filter(function(r){return r.type==="league";});
    if(!leagueRounds.length) return false;
    return leagueRounds.every(function(r){
      return r.matches.every(function(m){return m.status==="complete"||!m.p2;});
    });
  }
  function checkSemiComplete() {
    var sr=t2.rounds.find(function(r){return r.type==="semi";});
    return sr&&sr.matches.every(function(m){return m.status==="complete";});
  }
  for(var iter=0;iter<20;iter++){
    resolvePass();
    var hasSemi=t2.rounds.find(function(r){return r.type==="semi";});
    var hasFinal=t2.rounds.find(function(r){return r.type==="final";});
    if(checkLeagueComplete()&&!hasSemi){
      var standings=computeStandings(t2);
      var top4=standings.slice(0,4);
      if(top4.length>=2){
        var dl=new Date(); dl.setDate(dl.getDate()+(t2.deadlineDays||14));
        var dlStr=dl.toISOString().split("T")[0];
        t2.rounds.push({round:t2.rounds.length+1,type:"semi",matches:[
          {id:"sf1"+Date.now()+Math.random(),p1:top4[0],p2:top4[3]||null,winner:null,sets:[],status:"scheduled",deadline:dlStr,scheduledDate:"",scheduledTime:"",scheduledCourt:""},
          {id:"sf2"+Date.now()+Math.random(),p1:top4[1],p2:top4[2]||null,winner:null,sets:[],status:"scheduled",deadline:dlStr,scheduledDate:"",scheduledTime:"",scheduledCourt:""},
        ]});
      }
      continue;
    }
    if(checkSemiComplete()&&!hasFinal){
      var sr2=t2.rounds.find(function(r){return r.type==="semi";});
      var sf1=sr2.matches[0], sf2=sr2.matches[1];
      var w1=sf1.winner===sf1.p1.id?sf1.p1:sf1.p2;
      var w2=sf2&&sf2.winner?(sf2.winner===sf2.p1.id?sf2.p1:sf2.p2):null;
      var dl2=new Date(); dl2.setDate(dl2.getDate()+(t2.deadlineDays||14));
      t2.rounds.push({round:t2.rounds.length+1,type:"final",matches:[
        {id:"f1"+Date.now()+Math.random(),p1:w1,p2:w2,winner:null,sets:[],status:"scheduled",deadline:dl2.toISOString().split("T")[0],scheduledDate:"",scheduledTime:"",scheduledCourt:""}
      ]});
      continue;
    }
    var finalRound=t2.rounds.find(function(r){return r.type==="final";});
    if(finalRound&&finalRound.matches[0]&&finalRound.matches[0].status==="complete"){
      var fm=finalRound.matches[0];
      var champ=fm.winner===fm.p1.id?fm.p1:fm.p2;
      t2.status="completed";
      t2.winner=champ;
    }
    break;
  }
  return t2;
}
