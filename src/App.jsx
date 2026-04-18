import { useState, useEffect, useRef } from "react";
import { supabase } from './supabase.js';

const PILOT_VENUE = {
  id:"sydney-boys", name:"Sydney Boys High School", suburb:"Moore Park",
  address:"556 Cleveland St, Moore Park",
  url:"https://www.tennisvenues.com.au/booking/sydney-boys-high-school",
  courts:["Court 1","Court 2","Court 3","Court 4"], hours:"6am–11pm"
};
const ENTRY_FEES = { 8:39, 16:45, 32:39 };
const PRIZES = {
  8:{item:"Babolat Pure Drive Lite",value:159},
  16:{item:"Wilson Clash 100 v2",value:419},
  32:{item:"Head Speed Pro 2024",value:499}
};
const SKILL_LEVELS = ["Beginner","Intermediate","Advanced","Competitive"];
const PLAY_STYLES  = ["Baseline","Serve and Volley","All-Court","Defensive"];
const DAYS_SHORT   = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];
const TIME_BLOCKS  = ["Morning","Afternoon","Evening","Late"];
const AV_COLORS    = ["#4A90E2","#3D9970","#E67E22","#E74C3C","#8E44AD","#2980B9","#D35400"];

const BOT_PLAYERS = [
  {id:"bot-1",  name:"Alex Chen",     avatar:"AC", skill:"Intermediate"},
  {id:"bot-2",  name:"Jordan Smith",  avatar:"JS", skill:"Intermediate"},
  {id:"bot-3",  name:"Sam Williams",  avatar:"SW", skill:"Intermediate"},
  {id:"bot-4",  name:"Riley Brown",   avatar:"RB", skill:"Intermediate"},
  {id:"bot-5",  name:"Morgan Davis",  avatar:"MD", skill:"Intermediate"},
  {id:"bot-6",  name:"Taylor Wilson", avatar:"TW", skill:"Intermediate"},
  {id:"bot-7",  name:"Casey Moore",   avatar:"CM", skill:"Intermediate"},
  {id:"bot-8",  name:"Jamie Taylor",  avatar:"JT", skill:"Intermediate"},
  {id:"bot-9",  name:"Drew Anderson", avatar:"DA", skill:"Intermediate"},
  {id:"bot-10", name:"Quinn Thomas",  avatar:"QT", skill:"Intermediate"},
  {id:"bot-11", name:"Blake Jackson", avatar:"BJ", skill:"Intermediate"},
  {id:"bot-12", name:"Reese White",   avatar:"RW", skill:"Intermediate"},
  {id:"bot-13", name:"Avery Harris",  avatar:"AH", skill:"Intermediate"},
  {id:"bot-14", name:"Parker Martin", avatar:"PM", skill:"Intermediate"},
  {id:"bot-15", name:"Skyler Lee",    avatar:"SL", skill:"Intermediate"},
];

function makeTheme(dark) {
  if (dark) return {
    bg:"#1C1C1C", bgCard:"#242424", bgTertiary:"#2E2E2E", surfaceSolid:"#242424",
    border:"#2A2A2A", borderStrong:"#383838",
    text:"#EDEDED", textSecondary:"#A0A0A0", textTertiary:"#666666",
    accent:"#4A90E2", accentText:"#FFFFFF", accentSubtle:"rgba(74,144,226,0.12)",
    green:"#3D9970", greenSubtle:"rgba(61,153,112,0.12)",
    red:"#E74C3C", redSubtle:"rgba(231,76,60,0.12)",
    orange:"#E67E22", orangeSubtle:"rgba(230,126,34,0.12)",
    gold:"#F39C12", goldSubtle:"rgba(243,156,18,0.12)",
    purple:"#8E44AD", purpleSubtle:"rgba(142,68,173,0.12)",
    inputBg:"#2E2E2E", modalBg:"#242424",
    navBg:"rgba(28,28,28,0.97)", tabBar:"rgba(28,28,28,0.97)",
    qualified:"rgba(61,153,112,0.07)"
  };
  return {
    bg:"#F5F6F6", bgCard:"#FFFFFF", bgTertiary:"#F0F2F2", surfaceSolid:"#FFFFFF",
    border:"#E6E8E8", borderStrong:"#D0D4D4",
    text:"#424242", textSecondary:"#6B6B6B", textTertiary:"#9E9E9E",
    accent:"#4A90E2", accentText:"#FFFFFF", accentSubtle:"rgba(74,144,226,0.08)",
    green:"#3D9970", greenSubtle:"rgba(61,153,112,0.08)",
    red:"#E74C3C", redSubtle:"rgba(231,76,60,0.08)",
    orange:"#E67E22", orangeSubtle:"rgba(230,126,34,0.08)",
    gold:"#F39C12", goldSubtle:"rgba(243,156,18,0.08)",
    purple:"#8E44AD", purpleSubtle:"rgba(142,68,173,0.08)",
    inputBg:"#F5F6F6", modalBg:"#FFFFFF",
    navBg:"rgba(245,246,246,0.97)", tabBar:"rgba(245,246,246,0.97)",
    qualified:"rgba(61,153,112,0.06)"
  };
}

function avColor(name){return AV_COLORS[(name||"A").charCodeAt(0)%AV_COLORS.length];}
function initials(name){return(name||"?").split(" ").map(function(w){return w[0];}).join("").slice(0,2).toUpperCase();}
function fmtDate(d){return d.toLocaleDateString("en-AU",{weekday:"short",day:"numeric",month:"short"});}
function daysUntil(dateStr){
  if(!dateStr)return null;
  var parts=dateStr.split("-");
  if(parts.length!==3)return null;
  var target=new Date(parseInt(parts[0]),parseInt(parts[1])-1,parseInt(parts[2]));
  var now=new Date();now.setHours(0,0,0,0);
  return Math.ceil((target-now)/86400000);
}
function netRevenue(size){
  var rev=size*ENTRY_FEES[size],prize=PRIZES[size].value;
  var balls=(size-1)*3*2.67,stripe=size*(ENTRY_FEES[size]*0.0175+0.30);
  return Math.round(rev-prize-balls-stripe);
}
function roundLabel(roundNum,size){
  var m=size/Math.pow(2,roundNum);
  if(m===1)return"Final";if(m===2)return"Semifinals";if(m===4)return"Quarterfinals";
  return"Round of "+(m*2);
}

function autoResolveBots(tournament, realUserId) {
  var t2 = JSON.parse(JSON.stringify(tournament));
  function resolvePass() {
    var changed = false;
    t2.rounds = t2.rounds.map(function(r) {
      return Object.assign({}, r, { matches: r.matches.map(function(m) {
        if (m.status === "complete" || !m.p1 || !m.p2) return m;
        if (m.p1.id === realUserId || m.p2.id === realUserId) return m;
        changed = true;
        var winner = Math.random() > 0.5 ? m.p1.id : m.p2.id;
        return Object.assign({}, m, { winner: winner, status: "complete" });
      })});
    });
    return changed;
  }
  function checkLeagueComplete() {
    var leagueRounds = t2.rounds.filter(function(r) { return r.type === "league"; });
    if (!leagueRounds.length) return false;
    return leagueRounds.every(function(r) {
      return r.matches.every(function(m) { return m.status === "complete" || !m.p2; });
    });
  }
  function checkSemiComplete() {
    var sr = t2.rounds.find(function(r) { return r.type === "semi"; });
    return sr && sr.matches.every(function(m) { return m.status === "complete"; });
  }
  for (var iter = 0; iter < 20; iter++) {
    resolvePass();
    var hasSemi = t2.rounds.find(function(r) { return r.type === "semi"; });
    var hasFinal = t2.rounds.find(function(r) { return r.type === "final"; });
    if (checkLeagueComplete() && !hasSemi) {
      var standings = computeStandings(t2);
      var top4 = standings.slice(0, 4);
      if (top4.length >= 2) {
        var dl = new Date(); dl.setDate(dl.getDate() + (t2.deadlineDays || 14));
        var dlStr = dl.toISOString().split("T")[0];
        t2.rounds.push({ round: t2.rounds.length + 1, type: "semi", matches: [
          { id: "sf1"+Date.now()+Math.random(), p1: top4[0], p2: top4[3] || null, winner: null, sets: [], status: "scheduled", deadline: dlStr, scheduledDate: "", scheduledTime: "", scheduledCourt: "" },
          { id: "sf2"+Date.now()+Math.random(), p1: top4[1], p2: top4[2] || null, winner: null, sets: [], status: "scheduled", deadline: dlStr, scheduledDate: "", scheduledTime: "", scheduledCourt: "" },
        ]});
      }
      continue;
    }
    if (checkSemiComplete() && !hasFinal) {
      var sr = t2.rounds.find(function(r) { return r.type === "semi"; });
      var sf1 = sr.matches[0], sf2 = sr.matches[1];
      var w1 = sf1.winner === sf1.p1.id ? sf1.p1 : sf1.p2;
      var w2 = sf2 && sf2.winner ? (sf2.winner === sf2.p1.id ? sf2.p1 : sf2.p2) : null;
      var dl2 = new Date(); dl2.setDate(dl2.getDate() + (t2.deadlineDays || 14));
      t2.rounds.push({ round: t2.rounds.length + 1, type: "final", matches: [
        { id: "f1"+Date.now()+Math.random(), p1: w1, p2: w2, winner: null, sets: [], status: "scheduled", deadline: dl2.toISOString().split("T")[0], scheduledDate: "", scheduledTime: "", scheduledCourt: "" }
      ]});
      continue;
    }
    var finalRound = t2.rounds.find(function(r) { return r.type === "final"; });
    if (finalRound && finalRound.matches[0] && finalRound.matches[0].status === "complete") {
      var fm = finalRound.matches[0];
      var champ = fm.winner === fm.p1.id ? fm.p1 : fm.p2;
      t2.status = "completed";
      t2.winner = champ;
    }
    break;
  }
  return t2;
}

function computeStandings(tournament){
  var players={};
  (tournament.entrants||[]).forEach(function(e){
    players[e.id]=Object.assign({},e,{played:0,won:0,lost:0,pts:0});
  });
  (tournament.rounds||[]).forEach(function(r){
    if(r.type==="semi"||r.type==="final")return;
    (r.matches||[]).forEach(function(m){
      if(!m.winner||!m.p1||!m.p2)return;
      var wId=m.winner,lId=wId===m.p1.id?m.p2.id:m.p1.id;
      if(players[wId]){players[wId].played++;players[wId].won++;players[wId].pts+=3;}
      if(players[lId]){players[lId].played++;players[lId].lost++;}
    });
  });
  return Object.values(players).sort(function(a,b){return b.pts-a.pts||b.won-a.won;});
}

function PlayerAvatar({name, avatar, size=36}){
  return(
    <div style={{
      width:size, height:size, borderRadius:"50%", flexShrink:0,
      background:avColor(name), display:"flex", alignItems:"center",
      justifyContent:"center", fontSize:Math.round(size*0.33), fontWeight:700, color:"#fff",
      letterSpacing:"-0.5px"
    }}>
      {avatar||initials(name)}
    </div>
  );
}

function Pill({label, color, bg}){
  return(
    <span style={{
      display:"inline-flex", alignItems:"center",
      fontSize:10, fontWeight:700, color:color,
      background:bg||color+"18", border:"1px solid "+color+"30",
      borderRadius:4, padding:"2px 7px", whiteSpace:"nowrap",
      letterSpacing:"0.04em", textTransform:"uppercase"
    }}>
      {label}
    </span>
  );
}

function FormatExplainer({t}){
  var steps=[
    {n:"5",title:"League",sub:"Matches each"},
    {n:"4",title:"Top 4",sub:"Qualify"},
    {n:"2",title:"Semis",sub:"1v4 · 2v3"},
    {n:"1",title:"Final",sub:"Champion"},
  ];
  return(
    <div style={{display:"flex",gap:8,overflowX:"auto",paddingBottom:2}}>
      {steps.map(function(s,i){
        return(
          <div key={i} style={{display:"flex",alignItems:"center",gap:8,flexShrink:0}}>
            <div style={{
              textAlign:"center", background:t.bgTertiary,
              border:"1px solid "+t.border, borderRadius:8,
              padding:"10px 14px", minWidth:68
            }}>
              <div style={{fontSize:20,fontWeight:800,color:t.accent,lineHeight:1}}>{s.n}</div>
              <div style={{fontSize:11,fontWeight:600,color:t.text,marginTop:3}}>{s.title}</div>
              <div style={{fontSize:10,color:t.textTertiary,marginTop:1}}>{s.sub}</div>
            </div>
            {i<steps.length-1&&<div style={{fontSize:11,color:t.textTertiary}}>→</div>}
          </div>
        );
      })}
    </div>
  );
}

function StandingsTable({tournament, myId, t}){
  var rows=computeStandings(tournament);
  var qZone=Math.min(4,rows.length);
  if(!rows.length)return(
    <div style={{textAlign:"center",padding:"40px 0",color:t.textTertiary,fontSize:13}}>No matches played yet.</div>
  );
  return(
    <div>
      <div style={{background:t.bgCard,border:"1px solid "+t.border,borderRadius:10,overflow:"hidden"}}>
        <div style={{
          display:"grid", gridTemplateColumns:"28px 1fr 32px 32px 32px 40px",
          gap:8, padding:"8px 16px",
          borderBottom:"1px solid "+t.border
        }}>
          {["#","Player","P","W","L","Pts"].map(function(h,hi){
            return<div key={h} style={{fontSize:10,fontWeight:700,color:t.textTertiary,textAlign:hi>1?"right":"left",letterSpacing:"0.05em"}}>{h}</div>;
          })}
        </div>
        {rows.map(function(p,i){
          var rank=i+1, qualified=rank<=qZone, isMe=p.id===myId;
          var rankColor=rank===1?t.gold:rank===2?t.textSecondary:rank===3?t.orange:t.textTertiary;
          return(
            <div key={p.id} style={{
              display:"grid", gridTemplateColumns:"28px 1fr 32px 32px 32px 40px",
              gap:8, padding:"11px 16px",
              borderBottom:i<rows.length-1?"1px solid "+t.border:"none",
              background:isMe?t.accentSubtle:qualified?t.qualified:"transparent",
              borderLeft:isMe?"2px solid "+t.accent:qualified?"2px solid "+t.green+"44":"2px solid transparent"
            }}>
              <div style={{display:"flex",alignItems:"center",justifyContent:"center"}}>
                <span style={{fontSize:12,fontWeight:800,color:rankColor}}>{rank}</span>
              </div>
              <div style={{display:"flex",alignItems:"center",gap:8,minWidth:0}}>
                <PlayerAvatar name={p.name} avatar={p.avatar} size={24}/>
                <div style={{minWidth:0}}>
                  <div style={{
                    fontSize:13,fontWeight:isMe?700:500,
                    color:isMe?t.accent:t.text,
                    whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"
                  }}>
                    {p.name.split(" ")[0]}{isMe?" (you)":""}
                  </div>
                  {qualified&&<div style={{fontSize:9,color:t.green,fontWeight:700,letterSpacing:"0.05em"}}>QUALIFIED</div>}
                </div>
              </div>
              {[p.played,p.won,p.lost].map(function(v,vi){
                return<div key={vi} style={{textAlign:"right",fontSize:12,color:t.textSecondary,fontVariantNumeric:"tabular-nums"}}>{v}</div>;
              })}
              <div style={{textAlign:"right",fontSize:14,fontWeight:700,color:t.accent,fontVariantNumeric:"tabular-nums"}}>{p.pts}</div>
            </div>
          );
        })}
      </div>
      <div style={{display:"flex",alignItems:"center",gap:6,marginTop:8,paddingLeft:2}}>
        <div style={{width:8,height:8,borderRadius:2,background:t.green+"50",border:"1px solid "+t.green+"60"}}/>
        <span style={{fontSize:11,color:t.textTertiary}}>Top {qZone} qualify for semifinals</span>
      </div>
    </div>
  );
}

function BracketView({tournament, myId, t}){
  var isLeague=tournament.format==="league";
  var rounds=tournament.rounds||[];

  if(!isLeague){
    return(
      <div>
        {rounds.map(function(r,ri){
          return(
            <div key={ri} style={{marginBottom:24}}>
              <div style={{fontSize:11,fontWeight:700,color:t.textTertiary,letterSpacing:"0.06em",textTransform:"uppercase",marginBottom:10}}>{roundLabel(r.round,tournament.size)}</div>
              <div style={{display:"flex",flexDirection:"column",gap:8}}>
                {(r.matches||[]).map(function(m){
                  var isMyMatch=(m.p1&&m.p1.id===myId)||(m.p2&&m.p2.id===myId);
                  return(
                    <div key={m.id} style={{
                      background:t.bgCard,
                      border:"1px solid "+(isMyMatch?t.accent+"55":t.border),
                      borderLeft:"3px solid "+(isMyMatch?t.accent:t.border),
                      borderRadius:8, overflow:"hidden"
                    }}>
                      {[m.p1,m.p2].map(function(player,pi){
                        if(!player)return<div key={pi} style={{padding:"10px 14px",color:t.textTertiary,fontSize:12,fontStyle:"italic",borderBottom:pi===0?"1px solid "+t.border:"none"}}>TBD</div>;
                        var isWinner=m.winner===player.id,isLoser=m.winner&&!isWinner;
                        return(
                          <div key={pi} style={{
                            padding:"10px 14px",display:"flex",alignItems:"center",gap:10,
                            borderBottom:pi===0?"1px solid "+t.border:"none",
                            opacity:isLoser?0.4:1,
                            background:isWinner?t.greenSubtle:"transparent"
                          }}>
                            <PlayerAvatar name={player.name} avatar={player.avatar} size={26}/>
                            <span style={{fontSize:13,fontWeight:isWinner||player.id===myId?700:400,color:player.id===myId?t.accent:t.text,flex:1}}>
                              {player.name}{player.id===myId?" (you)":""}
                            </span>
                            {isWinner&&<span style={{fontSize:11,color:t.green,fontWeight:700}}>W</span>}
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  var semiR=rounds.find(function(r){return r.type==="semi";});
  var finalR=rounds.find(function(r){return r.type==="final";});
  var standings=computeStandings(tournament);
  var top4=standings.slice(0,4);
  var seedLabels=["1st","4th","2nd","3rd"];
  var sfPairs=[
    {label:"SF · 1st vs 4th",p1:semiR&&semiR.matches[0]?semiR.matches[0].p1:top4[0],p2:semiR&&semiR.matches[0]?semiR.matches[0].p2:top4[3],match:semiR?semiR.matches[0]:null},
    {label:"SF · 2nd vs 3rd",p1:semiR&&semiR.matches[1]?semiR.matches[1].p1:top4[1],p2:semiR&&semiR.matches[1]?semiR.matches[1].p2:top4[2],match:semiR?semiR.matches[1]:null},
  ];
  var finalMatch=finalR&&finalR.matches[0]?finalR.matches[0]:null;

  return(
    <div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:12}}>
        {sfPairs.map(function(semi,si){
          return(
            <div key={si} style={{background:t.bgCard,border:"1px solid "+t.border,borderRadius:10,overflow:"hidden"}}>
              <div style={{padding:"6px 12px",background:t.bgTertiary,borderBottom:"1px solid "+t.border}}>
                <div style={{fontSize:9,fontWeight:700,color:t.textTertiary,textTransform:"uppercase",letterSpacing:"0.06em"}}>{semi.label}</div>
              </div>
              {[semi.p1,semi.p2].map(function(player,pi){
                var isWinner=semi.match&&semi.match.winner&&player&&player.id===semi.match.winner;
                var isLoser=semi.match&&semi.match.winner&&player&&!isWinner;
                return(
                  <div key={pi} style={{
                    padding:"9px 12px",display:"flex",alignItems:"center",gap:7,
                    borderBottom:pi===0?"1px solid "+t.border:"none",
                    opacity:isLoser?0.4:1,
                    background:isWinner?t.greenSubtle:"transparent"
                  }}>
                    {player?(
                      <>
                        <PlayerAvatar name={player.name} avatar={player.avatar} size={22}/>
                        <span style={{fontSize:11,fontWeight:isWinner?700:400,color:isWinner?t.green:player.id===myId?t.accent:t.text,flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                          {player.name.split(" ")[0]}{player.id===myId?" (you)":""}
                        </span>
                        {!semiR&&<span style={{fontSize:9,color:t.textTertiary,flexShrink:0}}>{seedLabels[si*2+pi]}</span>}
                        {isWinner&&<span style={{fontSize:9,color:t.green,fontWeight:700}}>W</span>}
                      </>
                    ):(
                      <span style={{fontSize:11,color:t.textTertiary,fontStyle:"italic"}}>TBD</span>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>

      {/* Final — clean, no gradient */}
      <div style={{background:t.bgCard,border:"1px solid "+t.border,borderLeft:"3px solid "+t.gold,borderRadius:10,overflow:"hidden"}}>
        <div style={{padding:"7px 14px",borderBottom:"1px solid "+t.border,display:"flex",alignItems:"center",gap:8}}>
          <div style={{fontSize:9,fontWeight:700,color:t.gold,textTransform:"uppercase",letterSpacing:"0.06em"}}>Final</div>
          {finalMatch&&finalMatch.status==="complete"&&<div style={{fontSize:9,color:t.textTertiary}}>·</div>}
          {finalMatch&&finalMatch.status==="complete"&&<div style={{fontSize:9,color:t.textTertiary}}>Completed</div>}
        </div>
        {[0,1].map(function(pi){
          var player=finalMatch?(pi===0?finalMatch.p1:finalMatch.p2):null;
          var isWinner=finalMatch&&finalMatch.winner&&player&&player.id===finalMatch.winner;
          var isLoser=finalMatch&&finalMatch.winner&&player&&!isWinner;
          return(
            <div key={pi} style={{
              padding:"12px 14px",display:"flex",alignItems:"center",gap:10,
              borderBottom:pi===0?"1px solid "+t.border:"none",
              opacity:isLoser?0.4:1,
              background:isWinner?t.goldSubtle:"transparent"
            }}>
              {player?(
                <>
                  <PlayerAvatar name={player.name} avatar={player.avatar} size={28}/>
                  <span style={{fontSize:13,fontWeight:isWinner?800:400,color:isWinner?t.gold:t.text,flex:1}}>
                    {player.name}{player.id===myId?" (you)":""}
                  </span>
                  {isWinner&&<span style={{fontSize:13,color:t.gold,fontWeight:700}}>Champion</span>}
                </>
              ):(
                <span style={{fontSize:12,color:t.textTertiary,fontStyle:"italic"}}>Winner of SF{pi+1}</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function App() {
  var [dark,setDark]=useState(function(){return localStorage.getItem("theme")==="dark";});
  var t=makeTheme(dark);

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

  useEffect(function(){
    supabase.from('tournaments').select('*').then(function(r){
      if(r.data&&r.data.length>0)setTournaments(r.data);
    });
  },[]);

  async function loadUserData(user,isNewSignIn){
    var init=initials(user.user_metadata.name||user.email);
    setAuthUser({id:user.id,name:user.user_metadata.name||user.email.split("@")[0],email:user.email,avatar:init});
    var r=await supabase.from('profiles').select('*').eq('id',user.id).single();
    var isNewUser=!r.data;
    if(r.data){
      setProfile(r.data);
      setProfileDraft(r.data);
    } else {
      var defaults={id:user.id,name:user.user_metadata.name||user.email.split("@")[0],suburb:"",skill:"Intermediate",style:"All-Court",bio:"",avatar:init,availability:{},ranking_points:1000,wins:0,losses:0,matches_played:0,streak_count:0,streak_type:null};
      setProfile(defaults);
      setProfileDraft(defaults);
      await supabase.from('profiles').upsert(defaults);
    }
    // Own matches
    var hr=await supabase.from('match_history').select('*').eq('user_id',user.id).order('created_at',{ascending:false});
    // Accepted tagged matches (logged by a friend who tagged this user)
    var tr=await supabase.from('match_history').select('*').eq('tagged_user_id',user.id).eq('tag_status','accepted').order('created_at',{ascending:false});
    function normMatch(m,isTagged){
      var ownerResult=m.result||"loss";
      return {
        id:m.id,
        oppName:m.opp_name||"Unknown",
        tournName:m.tourn_name||"",
        date:m.match_date?new Date(m.match_date).toLocaleDateString("en-AU",{day:"numeric",month:"short",year:"numeric"}):"",
        sets:m.sets||[],
        // For tagged matches, invert result (owner won = friend lost)
        result:isTagged?(ownerResult==="win"?"loss":"win"):ownerResult,
        notes:m.notes||"",
        tagged_user_id:m.tagged_user_id||null,
        tag_status:m.tag_status||null,
        isTagged:isTagged
      };
    }
    var ownNorm=(hr.data||[]).map(function(m){return normMatch(m,false);});
    var taggedNorm=(tr.data||[]).map(function(m){return normMatch(m,true);});
    // Merge and sort by match_date descending
    var normalizedHistory=ownNorm.concat(taggedNorm).sort(function(a,b){return b.date<a.date?-1:1;});
    var matchIds=normalizedHistory.map(function(m){return m.id;});
    setHistory(normalizedHistory);

    if(matchIds.length){
      // Load which matches the current user has liked
      var lr=await supabase.from('feed_likes').select('match_id').eq('user_id',user.id).in('match_id',matchIds);
      if(lr.data){
        var likedMap={};
        lr.data.forEach(function(l){likedMap[l.match_id]=true;});
        setFeedLikes(likedMap);
      }
      // Load total like counts
      var lcr=await supabase.from('feed_likes').select('match_id').in('match_id',matchIds);
      if(lcr.data){
        var countMap={};
        lcr.data.forEach(function(l){countMap[l.match_id]=(countMap[l.match_id]||0)+1;});
        setFeedLikeCounts(countMap);
      }
      // Load comments + author names
      var cr=await supabase.from('feed_comments').select('id,match_id,user_id,body,created_at').in('match_id',matchIds).order('created_at',{ascending:true});
      if(cr.data&&cr.data.length){
        var uids=[...new Set(cr.data.map(function(c){return c.user_id;}))];
        var pr=await supabase.from('profiles').select('id,name,avatar').in('id',uids);
        var nameMap={};
        (pr.data||[]).forEach(function(p){nameMap[p.id]={name:p.name,avatar:p.avatar};});
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
    // Load social graph
    var profileForSocial=r.data||defaults;
    loadSocialData(user.id,profileForSocial);
    // Show onboarding for brand-new users
    if(isNewUser&&isNewSignIn){
      setOnboardDraft({skill:"Intermediate",style:"All-Court",suburb:""});
      setOnboardStep(1);
      setShowOnboarding(true);
    }
  }

  // Validation helpers
  function validateEmail(email){return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());}
  function validatePassword(pw){return pw.length>=6;}
  function mapAuthError(msg){
    if(!msg)return"Something went wrong. Please try again.";
    if(msg.includes("Invalid login credentials")||msg.includes("invalid_credentials"))return"Incorrect email or password.";
    if(msg.includes("User already registered")||msg.includes("already been registered"))return"An account with this email already exists.";
    if(msg.includes("Email not confirmed"))return"Please check your email to confirm your account first.";
    if(msg.includes("Password should be at least"))return"Password must be at least 6 characters.";
    if(msg.includes("Unable to validate email"))return"Please enter a valid email address.";
    if(msg.includes("signup_disabled"))return"Sign ups are currently disabled. Contact support.";
    if(msg.includes("network")||msg.includes("fetch"))return"Connection error. Check your internet and try again.";
    return msg;
  }

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
  var [editingProfile,setEditingProfile]=useState(false);
  var [editingAvail,setEditingAvail]=useState(false);
  var [profileDraft,setProfileDraft]=useState(profile);
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

  // Social graph
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

  var requireAuth=function(cb){
    if(authUser)cb();else{setShowAuth(true);setAuthMode("login");setAuthStep("choose");}
  };

  // ── SOCIAL GRAPH ──────────────────────────────────────────────────────────

  async function loadSocialData(userId,userProfile){
    try{
      // All friend requests involving this user
      var fr=await supabase.from('friend_requests').select('*').or('sender_id.eq.'+userId+',receiver_id.eq.'+userId);
      var allReqs=fr.data||[];
      var accepted=allReqs.filter(function(r){return r.status==='accepted';});
      var sentPend=allReqs.filter(function(r){return r.status==='pending'&&r.sender_id===userId;});
      var recvPend=allReqs.filter(function(r){return r.status==='pending'&&r.receiver_id===userId;});

      // Collect all other user IDs to fetch profiles for
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

      setFriends(accepted.map(function(r){
        var oid=r.sender_id===userId?r.receiver_id:r.sender_id;
        return Object.assign({requestId:r.id},pMap[oid]||{id:oid,name:"Player"});
      }));
      setSentRequests(sentPend.map(function(r){
        return Object.assign({requestId:r.id},pMap[r.receiver_id]||{id:r.receiver_id,name:"Player"});
      }));
      setReceivedRequests(recvPend.map(function(r){
        return Object.assign({requestId:r.id},pMap[r.sender_id]||{id:r.sender_id,name:"Player"});
      }));

      // Blocked users
      var bl=await supabase.from('blocks').select('blocked_id').eq('blocker_id',userId);
      var blockedIds=(bl.data||[]).map(function(b){return b.blocked_id;});
      if(blockedIds.length){
        var bpr=await supabase.from('profiles').select('id,name,avatar,suburb').in('id',blockedIds);
        setBlockedUsers(bpr.data||[]);
      } else {setBlockedUsers([]);}

      // Notifications (last 20)
      var nr=await supabase.from('notifications').select('*').eq('user_id',userId).order('created_at',{ascending:false}).limit(20);
      if(nr.data&&nr.data.length){
        var fromIds=[...new Set(nr.data.map(function(n){return n.from_user_id;}).filter(Boolean))];
        var fpr=fromIds.length?await supabase.from('profiles').select('id,name,avatar').in('id',fromIds):{data:[]};
        var fpMap={};(fpr.data||[]).forEach(function(p){fpMap[p.id]=p;});
        setNotifications(nr.data.map(function(n){
          var fp=fpMap[n.from_user_id]||{};
          return Object.assign({},n,{fromName:fp.name||"Someone",fromAvatar:fp.avatar||"?"});
        }));
      } else {setNotifications([]);}

      // Suggested: same suburb/skill, not friends, not blocked, not self
      var friendIds=accepted.map(function(r){return r.sender_id===userId?r.receiver_id:r.sender_id;});
      var excludeIds=[userId,...friendIds,...blockedIds];
      var sq=await supabase.from('profiles').select('id,name,avatar,skill,suburb,ranking_points,matches_played')
        .neq('id',userId)
        .eq('suburb',userProfile.suburb||"Sydney")
        .not('id','in','('+excludeIds.join(',')+')')
        .limit(6);
      setSuggestedPlayers(sq.data||[]);
    } catch(e){console.error('loadSocialData',e);}
  }

  function isFriend(uid){return friends.some(function(f){return f.id===uid;});}
  function sentReq(uid){return sentRequests.find(function(r){return r.id===uid;});}
  function recvReq(uid){return receivedRequests.find(function(r){return r.id===uid;});}
  function isBlocked(uid){return blockedUsers.some(function(b){return b.id===uid;});}
  function unreadCount(){return notifications.filter(function(n){return!n.read;}).length;}

  function friendRelationLabel(uid){
    if(isFriend(uid))return"friends";
    if(sentReq(uid))return"sent";
    if(recvReq(uid))return"received";
    if(isBlocked(uid))return"blocked";
    return"none";
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
    // Unfriend if needed
    if(isFriend(target.id)){await unfriend(target);}
    // Cancel any pending requests both ways
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
    var r=await supabase.from('profiles')
      .select('id,name,avatar,skill,suburb,ranking_points,matches_played,wins,privacy')
      .ilike('name','%'+q+'%')
      .neq('id',authUser.id)
      .limit(10);
    if(r.error){setSearchLoading(false);return;}
    var blockedIds=blockedUsers.map(function(b){return b.id;});
    var filtered=(r.data||[]).filter(function(u){return!blockedIds.includes(u.id);});
    setSearchResults(filtered);
    setShowSearchDrop(true);
    setSearchLoading(false);
  }

  async function deleteMatch(m){
    if(!authUser)return;
    // If a friend accepted this match, notify them it's been removed
    if(m.tagged_user_id&&m.tag_status==='accepted'){
      await supabase.from('notifications').insert({user_id:m.tagged_user_id,type:'match_deleted',from_user_id:authUser.id,match_id:m.id});
    }
    await supabase.from('match_history').delete().eq('id',m.id).eq('user_id',authUser.id);
    setHistory(function(h){return h.filter(function(x){return x.id!==m.id;});});
  }

  async function removeTaggedMatch(m){
    // Friend removes an accepted tagged match from their own feed
    await supabase.from('match_history').update({tag_status:'declined'}).eq('id',m.id);
    setHistory(function(h){return h.filter(function(x){return x.id!==m.id;});});
  }

  async function acceptMatchTag(n){
    await supabase.from('match_history').update({tag_status:'accepted'}).eq('id',n.match_id);
    await supabase.from('notifications').update({read:true}).eq('id',n.id);
    setNotifications(function(ns){return ns.map(function(x){return x.id===n.id?Object.assign({},x,{tag_status:'accepted',read:true}):x;});});
    // Load the tagged match and add to feed with inverted result
    var mr=await supabase.from('match_history').select('*').eq('id',n.match_id).single();
    if(mr.data){
      var m=mr.data;
      var ownerResult=m.result||"loss";
      var friendResult=ownerResult==="win"?"loss":"win";
      var nm={id:m.id,oppName:m.opp_name||"Unknown",tournName:m.tourn_name||"",date:m.match_date?new Date(m.match_date).toLocaleDateString("en-AU",{day:"numeric",month:"short",year:"numeric"}):"",sets:m.sets||[],result:friendResult,notes:m.notes||"",isTagged:true,tagged_user_id:m.tagged_user_id,tag_status:'accepted'};
      setHistory(function(h){return h.some(function(x){return x.id===m.id;})?h:[nm].concat(h);});
      // Update friend's stats
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
    await supabase.from('notifications').update({read:true}).eq('id',n.id);
    setNotifications(function(ns){return ns.map(function(x){return x.id===n.id?Object.assign({},x,{tag_status:'declined',read:true}):x;});});
  }

  function notifLabel(n){
    if(n.type==='friend_request')return n.fromName+' sent you a friend request';
    if(n.type==='request_accepted')return n.fromName+' accepted your friend request';
    if(n.type==='match_tag')return n.fromName+' tagged you in a match';
    if(n.type==='match_deleted')return n.fromName+' removed a match from your feed';
    if(n.type==='like')return n.fromName+' liked your match';
    if(n.type==='comment')return n.fromName+' commented on your match';
    return'New notification';
  }

  // ─────────────────────────────────────────────────────────────────────────

  var isEntered=function(tournId){
    var t2=tournaments.find(function(x){return x.id===tournId;});
    return t2?(t2.entrants||[]).some(function(e){return e.id===myId;}):false;
  };
  var isWaitlisted=function(tournId){
    var t2=tournaments.find(function(x){return x.id===tournId;});
    return t2?(t2.waitlist||[]).some(function(e){return e.id===myId;}):false;
  };
  var waitlistPos=function(tournId){
    var t2=tournaments.find(function(x){return x.id===tournId;});
    if(!t2)return null;
    var idx=(t2.waitlist||[]).findIndex(function(e){return e.id===myId;});
    return idx>=0?idx+1:null;
  };

  var enterTournament=function(tournId){
    requireAuth(function(){
      setTournaments(function(prev){
        return prev.map(function(t2){
          if(t2.id!==tournId||(t2.entrants||[]).some(function(e){return e.id===myId;}))return t2;
          var newE={id:myId,name:profile.name,avatar:profile.avatar||"YN",skill:profile.skill};
          var updated=Object.assign({},t2,{entrants:(t2.entrants||[]).concat([newE])});
          supabase.from('tournaments').upsert(updated);
          return updated;
        });
      });
    });
  };

  var joinWaitlist=function(tournId){
    requireAuth(function(){
      setTournaments(function(prev){
        return prev.map(function(t2){
          if(t2.id!==tournId)return t2;
          var wl=t2.waitlist||[];
          if(wl.some(function(e){return e.id===myId;}))return t2;
          var newE={id:myId,name:profile.name,avatar:profile.avatar||"YN",skill:profile.skill,position:wl.length+1};
          var updated=Object.assign({},t2,{waitlist:wl.concat([newE])});
          supabase.from('tournaments').upsert(updated);
          return updated;
        });
      });
    });
  };

  var seedTournament=function(tournId){
    requireAuth(function(){
      setTournaments(function(prev){
        return prev.map(function(t2){
          if(t2.id!==tournId)return t2;
          var existing=(t2.entrants||[]).map(function(e){return e.id;});
          var me={id:myId,name:profile.name,avatar:profile.avatar||"YN",skill:profile.skill};
          var toAdd=BOT_PLAYERS.filter(function(b){return!existing.includes(b.id);}).slice(0,15);
          var allEntrants=(t2.entrants||[]).concat(toAdd);
          if(!existing.includes(myId))allEntrants=[me].concat(toAdd);
          allEntrants=allEntrants.slice(0,t2.size);
          var updated=Object.assign({},t2,{entrants:allEntrants});
          supabase.from('tournaments').upsert(updated);
          return updated;
        });
      });
    });
  };

  var generateDraw=function(tournId){
    setTournaments(function(prev){
      return prev.map(function(t2){
        if(t2.id!==tournId)return t2;
        var entrants=t2.entrants.slice();
        for(var i=entrants.length-1;i>0;i--){
          var j=Math.floor(Math.random()*(i+1));
          var tmp=entrants[i];entrants[i]=entrants[j];entrants[j]=tmp;
        }
        var updated;
        if(t2.format==="league"){
          var allPairs=[];
          for(var a=0;a<entrants.length;a++){
            for(var b=a+1;b<entrants.length;b++){allPairs.push([entrants[a],entrants[b]]);}
          }
          for(var ip=allPairs.length-1;ip>0;ip--){
            var jp=Math.floor(Math.random()*(ip+1));
            var tp=allPairs[ip];allPairs[ip]=allPairs[jp];allPairs[jp]=tp;
          }
          var matchesPerRound=Math.max(1,Math.floor(entrants.length/2));
          var leagueRounds=5;
          var newRounds=[];
          for(var ri=0;ri<leagueRounds;ri++){
            var roundPairs=allPairs.slice(ri*matchesPerRound,(ri+1)*matchesPerRound);
            if(!roundPairs.length)break;
            var dl=new Date();dl.setDate(dl.getDate()+(ri+1)*(t2.deadlineDays||14));
            var dlStr=dl.toISOString().split("T")[0];
            newRounds.push({round:ri+1,type:"league",matches:roundPairs.map(function(pair,ki){
              return{id:"m"+Date.now()+ri+ki,p1:pair[0],p2:pair[1],winner:null,sets:[],status:"scheduled",deadline:dlStr,scheduledDate:"",scheduledTime:"",scheduledCourt:""};
            })});
          }
          updated=Object.assign({},t2,{status:"active",rounds:newRounds});
          updated=autoResolveBots(updated,myId);
        } else {
          var matches=[];
          for(var k=0;k<entrants.length;k+=2){
            var dl2=new Date();dl2.setDate(dl2.getDate()+(t2.deadlineDays||14));
            matches.push({id:"m"+Date.now()+k,p1:entrants[k]||null,p2:entrants[k+1]||null,winner:null,sets:[],status:"scheduled",deadline:dl2.toISOString().split("T")[0],scheduledDate:"",scheduledTime:"",scheduledCourt:""});
          }
          updated=Object.assign({},t2,{status:"active",rounds:[{round:1,matches:matches}]});
          updated=autoResolveBots(updated,myId);
        }
        supabase.from('tournaments').upsert(updated);
        return updated;
      });
    });
  };

  var recordResult=function(tournId,roundIdx,matchId,winnerId){
    setTournaments(function(prev){
      return prev.map(function(t2){
        if(t2.id!==tournId)return t2;
        var newRounds=t2.rounds.map(function(r,ri){
          if(ri!==roundIdx)return r;
          return{round:r.round,type:r.type,matches:r.matches.map(function(m){
            if(m.id!==matchId)return m;
            return Object.assign({},m,{winner:winnerId,status:"complete"});
          })};
        });
        if(t2.format==="league"){
          var leagueRounds=newRounds.filter(function(r){return r.type==="league";});
          var allLeagueDone=leagueRounds.every(function(r){return r.matches.every(function(m){return m.status==="complete"||!m.p2;});});
          var hasSemi=newRounds.find(function(r){return r.type==="semi";});
          if(allLeagueDone&&!hasSemi){
            var tempT=Object.assign({},t2,{rounds:newRounds});
            var standings=computeStandings(tempT);
            var top4=standings.slice(0,4);
            if(top4.length>=2){
              var dl=new Date();dl.setDate(dl.getDate()+(t2.deadlineDays||14));
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
              var dl3=new Date();dl3.setDate(dl3.getDate()+(t2.deadlineDays||14));
              newRounds=newRounds.concat([{round:newRounds.length+1,type:"final",matches:[
                {id:"f1"+Date.now(),p1:w1,p2:w2,winner:null,sets:[],status:"scheduled",deadline:dl3.toISOString().split("T")[0],scheduledDate:"",scheduledTime:"",scheduledCourt:""}
              ]}]);
            }
            var finalRound=newRounds.find(function(r){return r.type==="final";});
            if(finalRound&&finalRound.matches[0]&&finalRound.matches[0].status==="complete"){
              var fm=finalRound.matches[0];
              var champ=fm.winner===fm.p1.id?fm.p1:fm.p2;
              var fin=Object.assign({},t2,{rounds:newRounds,status:"completed",winner:champ});
              supabase.from('tournaments').upsert(fin);
              return fin;
            }
          }
          var fin2=autoResolveBots(Object.assign({},t2,{rounds:newRounds}),myId);
          supabase.from('tournaments').upsert(fin2);
          return fin2;
        } else {
          var cur=newRounds[newRounds.length-1];
          var allDone=cur.matches.every(function(m){return m.status==="complete"||!m.p2;});
          if(allDone){
            var winners=cur.matches.filter(function(m){return m.winner;}).map(function(m){return m.p1&&m.p1.id===m.winner?m.p1:m.p2;}).filter(Boolean);
            if(winners.length>1){
              var nextMatches=[];
              for(var ni=0;ni<winners.length;ni+=2){
                var dlE=new Date();dlE.setDate(dlE.getDate()+(t2.deadlineDays||14));
                nextMatches.push({id:"m"+Date.now()+ni,p1:winners[ni],p2:winners[ni+1]||null,winner:null,sets:[],status:"scheduled",deadline:dlE.toISOString().split("T")[0],scheduledDate:"",scheduledTime:"",scheduledCourt:""});
              }
              newRounds=newRounds.concat([{round:cur.round+1,matches:nextMatches}]);
            } else if(winners.length===1){
              var finE=Object.assign({},t2,{status:"completed",rounds:newRounds,winner:winners[0]});
              supabase.from('tournaments').upsert(finE);
              return finE;
            }
          }
          var finE2=autoResolveBots(Object.assign({},t2,{rounds:newRounds}),myId);
          supabase.from('tournaments').upsert(finE2);
          return finE2;
        }
      });
    });
  };

  var scheduleMatch=function(tournId,roundIdx,matchId,date,time,court){
    setTournaments(function(prev){
      return prev.map(function(t2){
        if(t2.id!==tournId)return t2;
        var newRounds=t2.rounds.map(function(r,ri){
          if(ri!==roundIdx)return r;
          return{round:r.round,type:r.type,matches:r.matches.map(function(m){
            if(m.id!==matchId)return m;
            return Object.assign({},m,{scheduledDate:date,scheduledTime:time,scheduledCourt:court});
          })};
        });
        var updated=Object.assign({},t2,{rounds:newRounds});
        supabase.from('tournaments').upsert(updated);
        return updated;
      });
    });
  };

  var myUpcoming=[];
  tournaments.forEach(function(t2){
    if(t2.status!=="active")return;
    (t2.rounds||[]).forEach(function(r,ri){
      (r.matches||[]).forEach(function(m){
        if(m.status==="complete")return;
        var isMe=(m.p1&&m.p1.id===myId)||(m.p2&&m.p2.id===myId);
        if(!isMe)return;
        var opp=m.p1&&m.p1.id===myId?m.p2:m.p1;
        var label=r.type==="semi"?"Semifinal":r.type==="final"?"Final":t2.format==="league"?"League Rd "+r.round:roundLabel(r.round,t2.size);
        myUpcoming.push({match:m,tournament:t2,roundIdx:ri,roundLabel:label,opponent:opp});
      });
    });
  });

  var myTournaments=tournaments.filter(function(t2){
    return(t2.entrants||[]).some(function(e){return e.id===myId;})||(t2.waitlist||[]).some(function(e){return e.id===myId;});
  });

  function tournStatus(t2){
    if(t2.status==="completed")return{label:"Completed",color:t.textTertiary};
    if(t2.status==="active")return{label:"Live",color:t.green};
    var spotsLeft=t2.size-(t2.entrants||[]).length;
    if(spotsLeft<=0&&(t2.waitlist||[]).length>0)return{label:"Waitlist",color:t.purple};
    if(spotsLeft<=0)return{label:"Full",color:t.red};
    if(spotsLeft<=4)return{label:spotsLeft+" left",color:t.orange};
    return{label:"Open",color:t.green};
  }

  var TABS=[
    {id:"home",        label:"Feed"},
    {id:"tournaments", label:"Compete"},
    {id:"people",      label:"People"},
    {id:"profile",     label:"Profile"},
    {id:"admin",       label:"Admin"},
  ];

  // Shared input style
  var inputStyle={
    width:"100%", padding:"11px 14px",
    borderRadius:8, border:"1px solid "+t.border,
    background:t.inputBg, color:t.text, fontSize:14,
    transition:"border-color 0.15s"
  };

  // Shared primary button
  var btnPrimary={
    padding:"13px", borderRadius:9, border:"none",
    background:t.accent, color:t.accentText,
    fontSize:14, fontWeight:600, width:"100%"
  };

  // Shared secondary button
  var btnSecondary={
    padding:"13px", borderRadius:9,
    border:"1px solid "+t.border, background:"transparent",
    color:t.text, fontSize:14, fontWeight:500, width:"100%"
  };

  return (
    <div style={{minHeight:"100vh",background:t.bg,color:t.text,paddingBottom:88,fontFamily:"-apple-system,BlinkMacSystemFont,'Helvetica Neue',sans-serif"}}>

      {/* ── NAV ── */}
      <nav style={{
        position:"sticky", top:0, zIndex:40,
        backdropFilter:"blur(20px)", WebkitBackdropFilter:"blur(20px)",
        background:t.navBg, borderBottom:"1px solid "+t.border
      }}>
        <div style={{maxWidth:680,margin:"0 auto",padding:"0 20px",height:54,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <div style={{
              width:30, height:30, borderRadius:8,
              background:t.accent, display:"flex", alignItems:"center",
              justifyContent:"center", fontSize:11, fontWeight:800, color:"#fff",
              letterSpacing:"-0.5px"
            }}>CS</div>
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

      {/* ── NOTIFICATIONS PANEL ── */}
      {showNotifications&&authUser&&(
        <div style={{position:"fixed",inset:0,zIndex:45}} onClick={function(){setShowNotifications(false);}}>
          <div
            onClick={function(e){e.stopPropagation();}}
            style={{
              position:"absolute",top:58,right:12,width:320,maxWidth:"calc(100vw - 24px)",
              background:t.modalBg,border:"1px solid "+t.border,borderRadius:14,
              boxShadow:"0 8px 32px rgba(0,0,0,0.14)",overflow:"hidden",maxHeight:480
            }}>
            <div style={{padding:"14px 16px",borderBottom:"1px solid "+t.border,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <span style={{fontSize:14,fontWeight:700,color:t.text}}>Notifications</span>
              {notifications.some(function(n){return!n.read;})&&(
                <button onClick={markNotificationsRead} style={{background:"none",border:"none",color:t.accent,fontSize:12,fontWeight:600}}>Mark all read</button>
              )}
            </div>
            <div style={{overflowY:"auto",maxHeight:400}}>
              {notifications.length===0
                ?<div style={{padding:"28px 20px",textAlign:"center",color:t.textTertiary,fontSize:13}}>No notifications yet</div>
                :notifications.map(function(n){
                  var timeStr=new Date(n.created_at).toLocaleDateString("en-AU",{day:"numeric",month:"short"});
                  return(
                    <div key={n.id} style={{
                      padding:"12px 16px",borderBottom:"1px solid "+t.border,
                      background:n.read?"transparent":t.accentSubtle,
                      display:"flex",gap:10,alignItems:"flex-start"
                    }}>
                      <div style={{width:34,height:34,borderRadius:"50%",background:avColor(n.fromName||"?"),display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:700,color:"#fff",flexShrink:0}}>
                        {(n.fromAvatar||"?").slice(0,2).toUpperCase()}
                      </div>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontSize:13,color:t.text,lineHeight:1.4}}>{notifLabel(n)}</div>
                        <div style={{fontSize:11,color:t.textTertiary,marginTop:2}}>{timeStr}</div>
                        {n.type==='match_tag'&&!n.tag_status&&(
                          <div style={{display:"flex",gap:6,marginTop:8}}>
                            <button onMouseDown={function(){acceptMatchTag(n);}}
                              style={{padding:"5px 12px",borderRadius:6,border:"none",background:t.accent,color:"#fff",fontSize:12,fontWeight:600,cursor:"pointer"}}>
                              Accept
                            </button>
                            <button onMouseDown={function(){declineMatchTag(n);}}
                              style={{padding:"5px 12px",borderRadius:6,border:"1px solid "+t.border,background:"transparent",color:t.textSecondary,fontSize:12,fontWeight:500,cursor:"pointer"}}>
                              Decline
                            </button>
                          </div>
                        )}
                        {n.type==='match_tag'&&n.tag_status==='accepted'&&<div style={{fontSize:11,color:t.green,marginTop:4,fontWeight:600}}>✓ Added to your feed</div>}
                        {n.type==='match_tag'&&n.tag_status==='declined'&&<div style={{fontSize:11,color:t.textTertiary,marginTop:4}}>Declined</div>}
                      </div>
                      {!n.read&&!n.tag_status&&<div style={{width:7,height:7,borderRadius:"50%",background:t.accent,flexShrink:0,marginTop:4}}/>}
                    </div>
                  );
                })
              }
            </div>
            {notifications.length>0&&(
              <div style={{padding:"10px 16px",borderTop:"1px solid "+t.border}}>
                <button
                  onClick={function(){setTab("people");setPeopleTab("requests");setShowNotifications(false);}}
                  style={{background:"none",border:"none",color:t.accent,fontSize:12,fontWeight:600}}>
                  View friend requests →
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── TAB BAR ── */}
      <div style={{
        position:"fixed", bottom:0, left:0, right:0, zIndex:50,
        backdropFilter:"blur(20px)", WebkitBackdropFilter:"blur(20px)",
        background:t.tabBar, borderTop:"1px solid "+t.border
      }}>
        <div style={{maxWidth:680,margin:"0 auto",display:"flex",padding:"10px 0 16px"}}>
          {TABS.map(function(tb){
            var on=tab===tb.id;
            return(
              <button key={tb.id}
                onClick={function(){setTab(tb.id);if(tb.id!=="tournaments")setSelectedTournId(null);}}
                style={{
                  flex:1, background:"none", border:"none",
                  display:"flex", flexDirection:"column", alignItems:"center", gap:4,
                  color:on?t.accent:t.textTertiary, padding:"2px 0"
                }}>
                <div style={{
                  width:4, height:4, borderRadius:"50%",
                  background:on?t.accent:"transparent",
                  marginBottom:1, transition:"background 0.15s"
                }}/>
                <span style={{fontSize:10,fontWeight:on?700:400,letterSpacing:on?"0":"0"}}>{tb.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── HOME TAB ── */}
      {tab==="home"&&(function(){
        // Demo feed cards shown to guests
        var DEMO_FEED=[
          {id:"demo-1",oppName:"Alex Chen",tournName:"Summer Open",date:"Today",sets:[{you:6,them:3},{you:6,them:4}],result:"win",playerName:"Jordan Smith",playerAvatar:"JS",isOwn:false},
          {id:"demo-2",oppName:"Sam Williams",tournName:"Casual Match",date:"Yesterday",sets:[{you:4,them:6},{you:3,them:6}],result:"loss",playerName:"Riley Brown",playerAvatar:"RB",isOwn:false},
          {id:"demo-3",oppName:"Morgan Davis",tournName:"Moore Park Open",date:"Mon",sets:[{you:7,them:5},{you:6,them:3}],result:"win",playerName:"Casey Moore",playerAvatar:"CM",isOwn:false},
        ];

        function timeAgo(dateStr){
          if(!dateStr)return"";
          if(dateStr==="Today")return"Today";
          if(dateStr==="Yesterday")return"Yesterday";
          return dateStr;
        }

        function FeedCard(props){
          var m=props.m,isOwn=props.isOwn,pName=props.pName,pAvatar=props.pAvatar,demo=props.demo,onDelete=props.onDelete,onRemove=props.onRemove;
          var isWin=m.result==="win";
          var scoreStr=(m.sets||[]).map(function(s){return s.you+"-"+s.them;}).join("  ");
          var liked=!!feedLikes[m.id];
          var likeCount=feedLikeCounts[m.id]||0;
          var comments=feedComments[m.id]||[];
          return(
            <div style={{background:t.bgCard,border:"1px solid "+t.border,borderRadius:12,overflow:"hidden",marginBottom:12}}>
              {/* Card header */}
              <div style={{padding:"14px 16px 12px",display:"flex",gap:11,alignItems:"center"}}>
                <div style={{
                  width:40,height:40,borderRadius:"50%",flexShrink:0,
                  background:avColor(pName),
                  display:"flex",alignItems:"center",justifyContent:"center",
                  fontSize:13,fontWeight:700,color:"#fff"
                }}>{pAvatar}</div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:14,fontWeight:700,color:t.text,lineHeight:1.2}}>{pName}{isOwn&&<span style={{fontSize:11,color:t.textTertiary,fontWeight:400}}> · You</span>}</div>
                  <div style={{fontSize:11,color:t.textTertiary,marginTop:1}}>{timeAgo(m.date)}</div>
                </div>
                {isOwn&&onDelete&&(
                  <button onClick={function(){if(window.confirm("Delete this match?"))onDelete(m);}}
                    style={{background:"none",border:"none",color:t.textTertiary,fontSize:16,padding:"4px 6px",cursor:"pointer",lineHeight:1}}
                    title="Delete match">✕</button>
                )}
                {m.isTagged&&onRemove&&(
                  <button onClick={function(){if(window.confirm("Remove from your feed?"))onRemove(m);}}
                    style={{background:"none",border:"none",color:t.textTertiary,fontSize:16,padding:"4px 6px",cursor:"pointer",lineHeight:1}}
                    title="Remove from feed">✕</button>
                )}
                {m.tournName&&m.tournName!=="Casual Match"&&(
                  <span style={{fontSize:10,fontWeight:700,color:t.accent,background:t.accentSubtle,padding:"3px 8px",borderRadius:20,flexShrink:0}}>{m.tournName}</span>
                )}
                {m.tournName==="Casual Match"&&(
                  <span style={{fontSize:10,fontWeight:600,color:t.textTertiary,background:t.bgTertiary,padding:"3px 8px",borderRadius:20,flexShrink:0}}>Casual</span>
                )}
              </div>

              {/* Match result block */}
              <div style={{
                margin:"0 12px 12px",
                background:isWin?t.greenSubtle:t.redSubtle,
                border:"1px solid "+(isWin?t.green:t.red)+"33",
                borderRadius:10,padding:"14px 16px"
              }}>
                <div style={{fontSize:11,fontWeight:700,color:isWin?t.green:t.red,textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:4}}>
                  {isWin?"Victory":"Defeat"}
                </div>
                <div style={{fontSize:18,fontWeight:800,color:t.text,letterSpacing:"-0.3px",marginBottom:2}}>
                  vs {m.oppName}
                </div>
                {scoreStr&&(
                  <div style={{fontSize:22,fontWeight:800,color:isWin?t.green:t.red,fontVariantNumeric:"tabular-nums",letterSpacing:"-0.5px"}}>
                    {scoreStr}
                  </div>
                )}
              </div>

              {/* Actions */}
              {!demo&&(
                <div style={{borderTop:"1px solid "+t.border,display:"flex"}}>
                  <button
                    onClick={async function(){
                      if(!authUser)return;
                      var nowLiked=!liked;
                      setFeedLikes(function(l){var n=Object.assign({},l);n[m.id]=nowLiked;return n;});
                      setFeedLikeCounts(function(c){var n=Object.assign({},c);n[m.id]=Math.max(0,(n[m.id]||0)+(nowLiked?1:-1));return n;});
                      if(nowLiked){
                        await supabase.from('feed_likes').insert({match_id:m.id,user_id:authUser.id});
                      } else {
                        await supabase.from('feed_likes').delete().eq('match_id',m.id).eq('user_id',authUser.id);
                      }
                    }}
                    style={{flex:1,padding:"11px 8px",border:"none",borderRight:"1px solid "+t.border,background:"transparent",color:liked?t.accent:t.textSecondary,fontSize:12,fontWeight:liked?700:500,display:"flex",alignItems:"center",justifyContent:"center",gap:5,cursor:"pointer"}}>
                    <span style={{fontSize:15}}>👍</span>{liked?"Liked":"Like"}{likeCount>0?" · "+likeCount:""}</button>
                  <button
                    onClick={function(){setCommentModal(m.id);setCommentDraft("");}}
                    style={{flex:1,padding:"11px 8px",border:"none",borderRight:"1px solid "+t.border,background:"transparent",color:t.textSecondary,fontSize:12,fontWeight:500,display:"flex",alignItems:"center",justifyContent:"center",gap:5,cursor:"pointer"}}>
                    <span style={{fontSize:15}}>💬</span>Comment{comments.length>0?" ("+comments.length+")":""}
                  </button>
                  <button
                    onClick={function(){if(navigator.share){navigator.share({title:"Match result",text:pName+(isWin?" won ":" lost ")+"vs "+m.oppName+" "+scoreStr});}}}
                    style={{flex:1,padding:"11px 8px",border:"none",background:"transparent",color:t.textSecondary,fontSize:12,fontWeight:500,display:"flex",alignItems:"center",justifyContent:"center",gap:5,cursor:"pointer"}}>
                    <span style={{fontSize:15}}>↗</span>Share
                  </button>
                </div>
              )}
              {demo&&(
                <div style={{borderTop:"1px solid "+t.border,padding:"10px 16px",display:"flex",gap:16}}>
                  {["👍 Like","💬 Comment","↗ Share"].map(function(a){return<span key={a} style={{fontSize:12,color:t.textTertiary,fontWeight:500}}>{a}</span>;})}
                </div>
              )}

              {/* Comments preview */}
              {comments.length>0&&(
                <div style={{borderTop:"1px solid "+t.border,padding:"10px 16px",display:"flex",flexDirection:"column",gap:6}}>
                  {comments.slice(-2).map(function(c){
                    return(
                      <div key={c.id} style={{display:"flex",gap:8,alignItems:"flex-start"}}>
                        <div style={{width:24,height:24,borderRadius:"50%",background:avColor(c.author),display:"flex",alignItems:"center",justifyContent:"center",fontSize:9,fontWeight:700,color:"#fff",flexShrink:0}}>{c.author.slice(0,2).toUpperCase()}</div>
                        <div style={{flex:1}}>
                          <span style={{fontSize:12,fontWeight:700,color:t.text}}>{c.author} </span>
                          <span style={{fontSize:12,color:t.textSecondary}}>{c.text}</span>
                        </div>
                      </div>
                    );
                  })}
                  {comments.length>2&&<button onClick={function(){setCommentModal(m.id);}} style={{background:"none",border:"none",color:t.accent,fontSize:11,fontWeight:600,textAlign:"left",padding:0}}>View all {comments.length} comments</button>}
                </div>
              )}
            </div>
          );
        }

        if(!authUser){
          return(
            <div style={{maxWidth:680,margin:"0 auto"}}>
              {/* Guest header */}
              <div style={{padding:"28px 20px 20px"}}>
                <div style={{fontSize:26,fontWeight:800,color:t.text,letterSpacing:"-0.5px",marginBottom:6}}>Sydney Tennis.</div>
                <div style={{fontSize:14,color:t.textSecondary,lineHeight:1.5,marginBottom:20}}>See how your friends are playing. Track your wins. Own your suburbs.</div>
                <div style={{display:"flex",gap:10,marginBottom:28}}>
                  <button
                    onClick={function(){setShowAuth(true);setAuthMode("signup");setAuthStep("choose");}}
                    style={{flex:1,padding:"13px",borderRadius:9,border:"none",background:t.accent,color:"#fff",fontSize:14,fontWeight:700}}>
                    Join free
                  </button>
                  <button
                    onClick={function(){setShowAuth(true);setAuthMode("login");setAuthStep("choose");}}
                    style={{flex:1,padding:"13px",borderRadius:9,border:"1px solid "+t.border,background:"transparent",color:t.text,fontSize:14,fontWeight:500}}>
                    Log in
                  </button>
                </div>
              </div>
              {/* Demo feed — blurred CTA overlay */}
              <div style={{position:"relative",padding:"0 20px 40px"}}>
                <div style={{fontSize:10,fontWeight:700,color:t.textTertiary,textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:12}}>Recent activity</div>
                <div style={{filter:"blur(3px)",pointerEvents:"none",userSelect:"none"}}>
                  {DEMO_FEED.map(function(m){
                    return<FeedCard key={m.id} m={m} isOwn={false} pName={m.playerName} pAvatar={m.playerAvatar} demo={true}/>;
                  })}
                </div>
                <div style={{
                  position:"absolute",top:"40%",left:"50%",transform:"translate(-50%,-50%)",
                  textAlign:"center",background:t.bgCard,border:"1px solid "+t.border,
                  borderRadius:14,padding:"20px 24px",boxShadow:"0 8px 32px rgba(0,0,0,0.08)",
                  width:"calc(100% - 80px)",maxWidth:320
                }}>
                  <div style={{fontSize:20,marginBottom:8}}>🎾</div>
                  <div style={{fontSize:15,fontWeight:700,color:t.text,marginBottom:6}}>Your community feed</div>
                  <div style={{fontSize:13,color:t.textSecondary,lineHeight:1.5,marginBottom:16}}>Sign up to see matches from players you follow and share your own results.</div>
                  <button
                    onClick={function(){setShowAuth(true);setAuthMode("signup");setAuthStep("choose");}}
                    style={{width:"100%",padding:"12px",borderRadius:8,border:"none",background:t.accent,color:"#fff",fontSize:13,fontWeight:700}}>
                    Get started
                  </button>
                </div>
              </div>
            </div>
          );
        }

        // Logged-in feed
        return(
          <div style={{maxWidth:680,margin:"0 auto"}}>
            {/* Feed header */}
            <div style={{padding:"24px 20px 0",display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16}}>
              <div>
                <div style={{fontSize:22,fontWeight:800,color:t.text,letterSpacing:"-0.5px"}}>Feed</div>
                <div style={{fontSize:12,color:t.textTertiary,marginTop:1}}>{history.length} match{history.length!==1?"es":""} logged</div>
              </div>
              <button
                onClick={function(){setCasualOppName("");setScoreModal({casual:true,oppName:"",tournName:"Casual Match"});setScoreDraft({sets:[{you:"",them:""}],result:"win",notes:"",date:new Date().toISOString().slice(0,10)}); }}
                style={{padding:"9px 16px",borderRadius:9,border:"none",background:t.accent,color:"#fff",fontSize:13,fontWeight:700,display:"flex",alignItems:"center",gap:6}}>
                + Log match
              </button>
            </div>

            {/* Filter pills */}
            <div style={{display:"flex",gap:6,padding:"0 20px 16px"}}>
              <span style={{fontSize:12,fontWeight:700,color:t.accent,background:t.accentSubtle,padding:"5px 14px",borderRadius:20}}>Everyone</span>
              <span style={{fontSize:12,fontWeight:500,color:t.textTertiary,background:t.bgCard,border:"1px solid "+t.border,padding:"5px 14px",borderRadius:20,opacity:0.6}}>Friends</span>
            </div>

            {/* Feed */}
            <div style={{padding:"0 20px 100px"}}>
              {history.length===0
                ?<div style={{background:t.bgCard,border:"1px solid "+t.border,borderRadius:12,padding:"40px 24px",textAlign:"center"}}>
                  <div style={{fontSize:40,marginBottom:12}}>🎾</div>
                  <div style={{fontSize:17,fontWeight:700,color:t.text,marginBottom:8}}>Nothing here yet</div>
                  <div style={{fontSize:13,color:t.textSecondary,lineHeight:1.6,marginBottom:24}}>Log your first match and it'll show up in your feed. Your friends' matches will appear here too.</div>
                  <button
                    onClick={function(){setCasualOppName("");setScoreModal({casual:true,oppName:"",tournName:"Casual Match"});setScoreDraft({sets:[{you:"",them:""}],result:"win",notes:"",date:new Date().toISOString().slice(0,10)}); }}
                    style={{padding:"13px 28px",borderRadius:9,border:"none",background:t.accent,color:"#fff",fontSize:14,fontWeight:700}}>
                    Log your first match
                  </button>
                </div>
                :history.map(function(m){
                  var isOwn=!m.isTagged;
                  return<FeedCard key={m.id} m={m} isOwn={isOwn} pName={isOwn?profile.name:(m.friendName||m.oppName)} pAvatar={isOwn?profile.avatar:""} demo={false} onDelete={isOwn?deleteMatch:null} onRemove={m.isTagged?removeTaggedMatch:null}/>;
                })
              }

              {/* Find friends nudge */}
              {history.length>0&&(
                <div style={{background:t.bgCard,border:"1px solid "+t.border,borderRadius:12,padding:"18px 20px",textAlign:"center",marginTop:4}}>
                  <div style={{fontSize:14,fontWeight:700,color:t.text,marginBottom:4}}>Find players to follow</div>
                  <div style={{fontSize:12,color:t.textSecondary,marginBottom:14}}>See your friends' matches in your feed when the community grows.</div>
                  <span style={{fontSize:12,fontWeight:600,color:t.textTertiary,background:t.bgTertiary,border:"1px solid "+t.border,padding:"7px 16px",borderRadius:8}}>Coming soon</span>
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* ── TOURNAMENTS LIST ── */}
      {tab==="tournaments"&&!selectedTournId&&(
        <div style={{maxWidth:680,margin:"0 auto",padding:"32px 20px"}}>
          <div style={{marginBottom:24}}>
            <h1 style={{fontSize:28,fontWeight:700,letterSpacing:"-0.6px",color:t.text,marginBottom:6}}>Tournaments</h1>
            <p style={{fontSize:15,color:t.textSecondary}}>League format · Umpired matches · Real prizes.</p>
          </div>

          {/* Skill filter */}
          <div style={{display:"flex",gap:6,marginBottom:24,overflowX:"auto",paddingBottom:2}}>
            {["All"].concat(SKILL_LEVELS).map(function(sk){
              var on=filterSkill===sk;
              return(
                <button key={sk}
                  onClick={function(){setFilterSkill(sk);}}
                  style={{
                    flexShrink:0, padding:"6px 14px", borderRadius:6,
                    border:"1px solid "+(on?t.accent:t.border),
                    background:on?t.accentSubtle:"transparent",
                    color:on?t.accent:t.textSecondary,
                    fontSize:12, fontWeight:on?600:400
                  }}>
                  {sk}
                </button>
              );
            })}
          </div>

          <div style={{display:"flex",flexDirection:"column",gap:12}}>
            {tournaments.filter(function(t2){return filterSkill==="All"||t2.skill===filterSkill;}).map(function(t2,i){
              var entered=isEntered(t2.id),waitlisted=isWaitlisted(t2.id),wlP=waitlistPos(t2.id);
              var fee=ENTRY_FEES[t2.size]||45;
              var prize=PRIZES[t2.size]||PRIZES[16];
              var spotsLeft=t2.size-(t2.entrants||[]).length;
              var fillPct=Math.round(((t2.entrants||[]).length/t2.size)*100);
              var dl=daysUntil(t2.startDate);
              var dSt=tournStatus(t2);
              var isFull=spotsLeft<=0;
              return(
                <div key={t2.id} className="fade-up"
                  style={{
                    background:t.bgCard, border:"1px solid "+t.border,
                    borderLeft:"3px solid "+(entered?t.green:waitlisted?t.purple:dSt.color),
                    borderRadius:10, overflow:"hidden",
                    animationDelay:(i*0.05)+"s"
                  }}>

                  {/* Card header */}
                  <div style={{padding:"16px 18px 12px"}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{display:"flex",gap:5,marginBottom:8,flexWrap:"wrap"}}>
                          <Pill label={dSt.label} color={dSt.color}/>
                          <Pill label={t2.skill} color={t.textTertiary}/>
                          {t2.format==="league"&&<Pill label="League" color={t.accent}/>}
                          {entered&&<Pill label="Enrolled" color={t.green}/>}
                          {waitlisted&&<Pill label={"Waitlist #"+wlP} color={t.purple}/>}
                        </div>
                        <div style={{fontSize:18,fontWeight:700,color:t.text,marginBottom:3,letterSpacing:"-0.3px"}}>{t2.name}</div>
                        <div style={{fontSize:12,color:t.textSecondary}}>{PILOT_VENUE.name} · {PILOT_VENUE.suburb}{t2.surface?" · "+t2.surface:""}</div>
                      </div>
                      <div style={{textAlign:"right",flexShrink:0,marginLeft:16}}>
                        <div style={{fontSize:22,fontWeight:800,color:t.accent,fontVariantNumeric:"tabular-nums",letterSpacing:"-0.5px"}}>${fee}</div>
                        <div style={{fontSize:10,color:t.textTertiary}}>entry</div>
                        {dl!==null&&dl>0&&t2.status==="enrolling"&&<div style={{fontSize:11,color:t.orange,marginTop:3}}>starts in {dl}d</div>}
                      </div>
                    </div>
                  </div>

                  {/* Prize row */}
                  <div style={{
                    padding:"10px 18px", display:"flex", alignItems:"center",
                    justifyContent:"space-between",
                    borderTop:"1px solid "+t.border, borderBottom:"1px solid "+t.border
                  }}>
                    <div>
                      <div style={{fontSize:10,color:t.textTertiary,marginBottom:1,fontWeight:600,letterSpacing:"0.04em"}}>PRIZE</div>
                      <div style={{fontSize:14,fontWeight:600,color:t.text}}>{prize.item}</div>
                    </div>
                    <div style={{fontSize:15,fontWeight:700,color:t.gold}}>A${prize.value}</div>
                  </div>

                  {/* Stats row */}
                  <div style={{padding:"10px 18px",display:"flex",gap:20,borderBottom:"1px solid "+t.border}}>
                    {[
                      {l:"Format",v:t2.format==="league"?"League":"Knockout"},
                      {l:"Players",v:t2.size},
                      {l:"Round",v:(t2.deadlineDays||14)+"d"},
                    ].map(function(info){
                      return(
                        <div key={info.l}>
                          <div style={{fontSize:10,color:t.textTertiary,marginBottom:1}}>{info.l}</div>
                          <div style={{fontSize:12,fontWeight:600,color:t.textSecondary}}>{info.v}</div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Progress bar */}
                  {t2.status==="enrolling"&&(
                    <div style={{padding:"10px 18px",borderBottom:"1px solid "+t.border}}>
                      <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}>
                        <span style={{fontSize:11,color:t.textSecondary}}>{(t2.entrants||[]).length} of {t2.size} enrolled</span>
                        <span style={{fontSize:11,fontWeight:600,color:isFull?t.red:spotsLeft<=4?t.orange:t.textSecondary}}>
                          {isFull?"Full":spotsLeft+" left"}
                        </span>
                      </div>
                      <div style={{height:3,background:t.bgTertiary,borderRadius:2,overflow:"hidden"}}>
                        <div style={{height:"100%",width:fillPct+"%",background:isFull?t.red:spotsLeft<=4?t.orange:t.accent,borderRadius:2,transition:"width 0.4s ease"}}/>
                      </div>
                      {(t2.waitlist||[]).length>0&&<div style={{fontSize:11,color:t.purple,marginTop:5}}>{(t2.waitlist||[]).length} on waitlist</div>}
                    </div>
                  )}

                  {/* Winner banner */}
                  {t2.status==="completed"&&t2.winner&&(
                    <div style={{
                      padding:"10px 18px", display:"flex", alignItems:"center", gap:10,
                      background:t.goldSubtle, borderBottom:"1px solid "+t.border
                    }}>
                      <PlayerAvatar name={t2.winner.name} avatar={t2.winner.avatar} size={28}/>
                      <div>
                        <div style={{fontSize:10,color:t.textTertiary,fontWeight:600,letterSpacing:"0.04em"}}>WINNER</div>
                        <div style={{fontSize:13,fontWeight:700,color:t.text}}>{t2.winner.name}</div>
                      </div>
                      <div style={{marginLeft:"auto",fontSize:11,color:t.gold,fontWeight:600}}>{prize.item}</div>
                    </div>
                  )}

                  {/* CTA row */}
                  <div style={{padding:"12px 18px",display:"flex",gap:8}}>
                    <button
                      onClick={function(){setSelectedTournId(t2.id);setTournDetailTab("overview");}}
                      style={{flex:1,padding:"10px",borderRadius:8,border:"1px solid "+t.border,background:"transparent",color:t.text,fontSize:12,fontWeight:500}}>
                      View
                    </button>
                    {t2.status==="enrolling"&&!entered&&!isFull&&(
                      <button
                        onClick={function(){enterTournament(t2.id);}}
                        style={{flex:2,padding:"10px",borderRadius:8,border:"none",background:t.accent,color:"#fff",fontSize:13,fontWeight:600}}>
                        Enter · ${fee}
                      </button>
                    )}
                    {t2.status==="enrolling"&&!entered&&isFull&&!waitlisted&&(
                      <button
                        onClick={function(){joinWaitlist(t2.id);}}
                        style={{flex:2,padding:"10px",borderRadius:8,border:"none",background:t.purple,color:"#fff",fontSize:13,fontWeight:600}}>
                        Join Waitlist
                      </button>
                    )}
                    {t2.status==="enrolling"&&entered&&(
                      <div style={{flex:2,textAlign:"center",fontSize:12,color:t.green,fontWeight:600,padding:"10px",border:"1px solid "+t.green+"44",borderRadius:8,background:t.greenSubtle}}>Enrolled ✓</div>
                    )}
                    {t2.status==="enrolling"&&waitlisted&&!entered&&(
                      <div style={{flex:2,textAlign:"center",fontSize:12,color:t.purple,fontWeight:600,padding:"10px",border:"1px solid "+t.purple+"44",borderRadius:8,background:t.purpleSubtle}}>Waitlisted #{wlP}</div>
                    )}
                    {t2.status==="active"&&entered&&(
                      <button
                        onClick={function(){setSelectedTournId(t2.id);setTournDetailTab(t2.format==="league"?"standings":"draw");}}
                        style={{flex:2,padding:"10px",borderRadius:8,border:"none",background:t.accent,color:"#fff",fontSize:12,fontWeight:600}}>
                        {t2.format==="league"?"Standings":"My matches"}
                      </button>
                    )}
                    {t2.status==="active"&&!entered&&(
                      <div style={{flex:2,textAlign:"center",padding:"10px",fontSize:12,color:t.textTertiary}}>In progress</div>
                    )}
                  </div>
                </div>
              );
            })}
            {tournaments.filter(function(t2){return filterSkill==="All"||t2.skill===filterSkill;}).length===0&&(
              <div style={{textAlign:"center",padding:"60px 0",color:t.textTertiary,fontSize:14}}>No tournaments found.</div>
            )}
          </div>
        </div>
      )}

      {/* ── TOURNAMENT DETAIL ── */}
      {tab==="tournaments"&&selectedTournId&&(function(){
        var t2=tournaments.find(function(x){return x.id===selectedTournId;});
        if(!t2)return null;
        var prize=PRIZES[t2.size]||PRIZES[16];
        var entered=isEntered(t2.id),waitlisted=isWaitlisted(t2.id),wlP=waitlistPos(t2.id);
        var fee=ENTRY_FEES[t2.size]||45;
        var spotsLeft=t2.size-(t2.entrants||[]).length;
        var isFull=spotsLeft<=0;
        var dSt=tournStatus(t2);
        var dl=daysUntil(t2.startDate);
        var isLeague=t2.format==="league";
        var detailTabs=isLeague?["overview","standings","bracket","matches"]:["overview","draw"];
        var dtLabels={overview:"Overview",standings:"Standings",bracket:"Bracket",draw:"Draw",matches:"Matches"};
        var myMatches=[];
        (t2.rounds||[]).forEach(function(r,ri){
          (r.matches||[]).forEach(function(m){
            var isMe=(m.p1&&m.p1.id===myId)||(m.p2&&m.p2.id===myId);
            if(!isMe)return;
            var opp=m.p1&&m.p1.id===myId?m.p2:m.p1;
            var lbl=r.type==="semi"?"Semifinal":r.type==="final"?"Final":"League Round "+r.round;
            myMatches.push({match:m,roundIdx:ri,roundLabel:lbl,opponent:opp});
          });
        });
        return(
          <div style={{maxWidth:680,margin:"0 auto",padding:"24px 20px"}}>
            <button
              onClick={function(){setSelectedTournId(null);}}
              style={{background:"none",border:"none",color:t.accent,fontSize:13,fontWeight:600,padding:"0 0 16px",display:"block"}}>
              ← Back
            </button>

            {/* Detail header */}
            <div style={{marginBottom:20}}>
              <div style={{display:"flex",gap:5,marginBottom:10,flexWrap:"wrap"}}>
                <Pill label={dSt.label} color={dSt.color}/>
                <Pill label={t2.skill} color={t.textTertiary}/>
                {isLeague&&<Pill label="League" color={t.accent}/>}
                {entered&&<Pill label="Enrolled" color={t.green}/>}
                {waitlisted&&<Pill label={"Waitlist #"+wlP} color={t.purple}/>}
              </div>
              <h1 style={{fontSize:24,fontWeight:700,letterSpacing:"-0.5px",color:t.text,marginBottom:4}}>{t2.name}</h1>
              <div style={{fontSize:14,color:t.textSecondary}}>{prize.item} — A${prize.value}</div>
            </div>

            {/* Sub-tabs */}
            <div style={{
              display:"flex", gap:0, marginBottom:24,
              borderBottom:"1px solid "+t.border
            }}>
              {detailTabs.map(function(dtab){
                var on=tournDetailTab===dtab;
                return(
                  <button key={dtab}
                    onClick={function(){setTournDetailTab(dtab);}}
                    style={{
                      flex:1, padding:"10px 0", border:"none",
                      background:"transparent",
                      color:on?t.accent:t.textTertiary,
                      fontSize:12, fontWeight:on?700:400,
                      borderBottom:"2px solid "+(on?t.accent:"transparent"),
                      marginBottom:"-1px"
                    }}>
                    {dtLabels[dtab]}
                  </button>
                );
              })}
            </div>

            {/* Overview */}
            {tournDetailTab==="overview"&&(
              <div className="fade-up">
                {/* Stats grid */}
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:16}}>
                  {[
                    {l:"Entry fee",v:"$"+fee},
                    {l:"Max players",v:t2.size},
                    {l:"Enrolled",v:(t2.entrants||[]).length+"/"+t2.size},
                    {l:"Round time",v:(t2.deadlineDays||14)+" days"},
                    t2.surface?{l:"Surface",v:t2.surface}:null,
                    t2.startDate?{l:"Start date",v:t2.startDate}:null,
                  ].filter(Boolean).map(function(info){
                    return(
                      <div key={info.l} style={{
                        background:t.bgCard, border:"1px solid "+t.border,
                        borderRadius:8, padding:"11px 14px"
                      }}>
                        <div style={{fontSize:10,color:t.textTertiary,marginBottom:3,fontWeight:600,letterSpacing:"0.04em",textTransform:"uppercase"}}>{info.l}</div>
                        <div style={{fontSize:14,fontWeight:600,color:t.text}}>{info.v}</div>
                      </div>
                    );
                  })}
                </div>

                {/* Format explainer */}
                {isLeague&&(
                  <div style={{marginBottom:16}}>
                    <div style={{fontSize:10,fontWeight:700,color:t.textTertiary,textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:10}}>Format</div>
                    <FormatExplainer t={t}/>
                  </div>
                )}

                {/* Venue */}
                <div style={{background:t.bgCard,border:"1px solid "+t.border,borderRadius:10,padding:"14px 16px",marginBottom:12}}>
                  <div style={{fontSize:10,fontWeight:700,color:t.textTertiary,textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:8}}>Venue</div>
                  <div style={{fontSize:14,fontWeight:600,color:t.text,marginBottom:2}}>{PILOT_VENUE.name}</div>
                  <div style={{fontSize:12,color:t.textSecondary,marginBottom:5}}>{PILOT_VENUE.address} · {PILOT_VENUE.courts.length} courts</div>
                  <div style={{fontSize:12,color:t.textSecondary,marginBottom:8}}>Players book and pay court slots directly. New balls provided by CourtSync per match.</div>
                  <a href={PILOT_VENUE.url} target="_blank" rel="noopener noreferrer"
                    style={{fontSize:12,color:t.accent,fontWeight:600,textDecoration:"none"}}>
                    Book a court →
                  </a>
                </div>

                {/* Waitlist notice */}
                {waitlisted&&wlP&&(
                  <div style={{background:t.purpleSubtle,border:"1px solid "+t.purple+"44",borderLeft:"3px solid "+t.purple,borderRadius:10,padding:"14px 16px",marginBottom:12}}>
                    <div style={{fontSize:13,fontWeight:700,color:t.purple,marginBottom:4}}>Waitlisted · #{wlP}</div>
                    <div style={{fontSize:13,color:t.textSecondary,lineHeight:1.6}}>
                      You'll be promoted automatically if a spot opens.
                      {(t2.waitlist||[]).length>1&&" "+((t2.waitlist||[]).length-1)+" person"+(((t2.waitlist||[]).length-1)!==1?"s":"")+" ahead of you."}
                    </div>
                  </div>
                )}

                {/* Rules */}
                <div style={{background:t.bgCard,border:"1px solid "+t.border,borderRadius:10,padding:"14px 16px",marginBottom:12}}>
                  <div style={{fontSize:10,fontWeight:700,color:t.textTertiary,textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:10}}>Rules</div>
                  {[
                    isLeague?"Each player plays 5 league matches against different opponents.":"Single elimination draw.",
                    isLeague?"Top 4 players by points qualify for the semifinals.":null,
                    isLeague?"Semifinals: 1st vs 4th, 2nd vs 3rd. Winners meet in the Final.":null,
                    "Best of 3 sets per match.",
                    "An umpire attends every match.",
                    "New CourtSync balls provided for each match.",
                    "Players arrange court time and pay venue fees directly.",
                    "Match must be completed within the deadline or may be forfeited.",
                  ].filter(Boolean).map(function(rule,ri){
                    return(
                      <div key={ri} style={{display:"flex",gap:10,marginBottom:8}}>
                        <div style={{width:3,height:3,borderRadius:"50%",background:t.textTertiary,marginTop:8,flexShrink:0}}/>
                        <div style={{fontSize:13,color:t.textSecondary,lineHeight:1.5}}>{rule}</div>
                      </div>
                    );
                  })}
                </div>

                {/* Players list */}
                {t2.status==="enrolling"&&(
                  <div style={{background:t.bgCard,border:"1px solid "+t.border,borderRadius:10,overflow:"hidden",marginBottom:12}}>
                    <div style={{padding:"12px 16px",borderBottom:"1px solid "+t.border,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                      <span style={{fontSize:13,fontWeight:600,color:t.text}}>Players</span>
                      <span style={{fontSize:12,color:t.textTertiary}}>{(t2.entrants||[]).length}/{t2.size}</span>
                    </div>
                    {(t2.entrants||[]).length===0
                      ?<div style={{padding:"24px",textAlign:"center",color:t.textTertiary,fontSize:13}}>No entrants yet. Be the first.</div>
                      :(t2.entrants||[]).map(function(e,i){
                        return(
                          <div key={e.id} style={{
                            padding:"10px 16px",
                            borderBottom:i<(t2.entrants||[]).length-1?"1px solid "+t.border:"none",
                            display:"flex", alignItems:"center", gap:12
                          }}>
                            <PlayerAvatar name={e.name} avatar={e.avatar} size={28}/>
                            <div style={{flex:1}}>
                              <div style={{fontSize:13,color:e.id===myId?t.accent:t.text,fontWeight:e.id===myId?700:400}}>
                                {e.name}{e.id===myId?" (you)":""}
                              </div>
                              <div style={{fontSize:11,color:t.textTertiary}}>{e.skill}</div>
                            </div>
                          </div>
                        );
                      })
                    }
                    {(t2.waitlist||[]).length>0&&(
                      <div style={{padding:"8px 16px",borderTop:"1px solid "+t.border,background:t.purpleSubtle}}>
                        <div style={{fontSize:11,color:t.purple,fontWeight:600}}>{(t2.waitlist||[]).length} on waitlist</div>
                      </div>
                    )}
                  </div>
                )}

                {/* Main CTA */}
                <div style={{marginTop:8}}>
                  {t2.status==="enrolling"&&!entered&&!isFull&&!waitlisted&&(
                    <button
                      onClick={function(){enterTournament(t2.id);}}
                      style={{width:"100%",padding:"14px",borderRadius:9,border:"none",background:t.accent,color:"#fff",fontSize:15,fontWeight:700}}>
                      Join Tournament · ${fee}
                    </button>
                  )}
                  {t2.status==="enrolling"&&!entered&&isFull&&!waitlisted&&(
                    <div>
                      <button
                        onClick={function(){joinWaitlist(t2.id);}}
                        style={{width:"100%",padding:"14px",borderRadius:9,border:"none",background:t.purple,color:"#fff",fontSize:15,fontWeight:600,marginBottom:8}}>
                        Join Waitlist
                      </button>
                      <p style={{textAlign:"center",fontSize:12,color:t.textSecondary}}>Tournament is full. Join the waitlist to be notified if a spot opens.</p>
                    </div>
                  )}
                  {t2.status==="enrolling"&&entered&&(
                    <div style={{padding:"14px",borderRadius:10,border:"1px solid "+t.green+"44",background:t.greenSubtle,textAlign:"center"}}>
                      <div style={{fontSize:15,fontWeight:700,color:t.green,marginBottom:2}}>You're in</div>
                      <div style={{fontSize:12,color:t.textSecondary}}>Draw will be generated when ready.</div>
                    </div>
                  )}
                  {t2.status==="enrolling"&&waitlisted&&!entered&&(
                    <div style={{padding:"14px",borderRadius:10,border:"1px solid "+t.purple+"44",background:t.purpleSubtle,textAlign:"center"}}>
                      <div style={{fontSize:15,fontWeight:700,color:t.purple,marginBottom:2}}>Waitlisted · #{wlP}</div>
                      <div style={{fontSize:12,color:t.textSecondary}}>We'll notify you if a spot opens.</div>
                    </div>
                  )}
                  {t2.status==="active"&&(
                    <button
                      onClick={function(){setTournDetailTab(isLeague?"standings":"draw");}}
                      style={{width:"100%",padding:"14px",borderRadius:9,border:"none",background:t.accent,color:"#fff",fontSize:14,fontWeight:600}}>
                      {isLeague?"View Standings →":"View Draw →"}
                    </button>
                  )}
                </div>

                {/* Winner display */}
                {t2.status==="completed"&&t2.winner&&(
                  <div className="pop" style={{
                    background:t.goldSubtle, border:"1px solid "+t.gold+"44",
                    borderLeft:"3px solid "+t.gold,
                    borderRadius:10, padding:"20px", textAlign:"center", marginTop:16
                  }}>
                    <div style={{fontSize:11,color:t.gold,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:8}}>Tournament Winner</div>
                    <div style={{fontSize:22,fontWeight:800,color:t.text,marginBottom:4,letterSpacing:"-0.4px"}}>{t2.winner.name}</div>
                    <div style={{fontSize:13,color:t.textSecondary}}>{prize.item}</div>
                  </div>
                )}
              </div>
            )}

            {/* Standings */}
            {tournDetailTab==="standings"&&(
              <div className="fade-up">
                {t2.status==="active"||t2.status==="completed"
                  ?<StandingsTable tournament={t2} myId={myId} t={t}/>
                  :<div style={{textAlign:"center",padding:"60px 0",color:t.textTertiary,fontSize:13}}>Standings will appear once the tournament starts.</div>
                }
              </div>
            )}

            {/* Bracket / Draw */}
            {(tournDetailTab==="bracket"||tournDetailTab==="draw")&&(
              <div className="fade-up">
                {(t2.status==="active"||t2.status==="completed")&&(t2.rounds||[]).length>0
                  ?<BracketView tournament={t2} myId={myId} t={t}/>
                  :<div style={{textAlign:"center",padding:"60px 0",color:t.textTertiary,fontSize:13}}>
                    {t2.status==="enrolling"?"Bracket will appear once the tournament starts.":"No draw generated yet."}
                  </div>
                }
              </div>
            )}

            {/* Matches */}
            {tournDetailTab==="matches"&&(
              <div className="fade-up">
                {myMatches.length>0&&(
                  <div style={{marginBottom:24}}>
                    <div style={{fontSize:11,fontWeight:700,color:t.textTertiary,textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:12}}>Your Matches</div>
                    <div style={{display:"flex",flexDirection:"column",gap:8}}>
                      {myMatches.map(function(item){
                        var m=item.match,dl2=daysUntil(m.deadline),urgent=dl2!==null&&dl2<=3&&m.status!=="complete";
                        return(
                          <div key={m.id} style={{
                            background:t.bgCard,
                            border:"1px solid "+t.border,
                            borderLeft:"3px solid "+(m.status==="complete"?(m.winner===myId?t.green:t.red):urgent?t.orange:t.accent),
                            borderRadius:10, padding:"14px 16px"
                          }}>
                            <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}>
                              <div style={{fontSize:10,fontWeight:700,color:t.textTertiary,textTransform:"uppercase",letterSpacing:"0.06em"}}>{item.roundLabel}</div>
                              {m.status==="complete"
                                ?<Pill label={m.winner===myId?"Won":"Lost"} color={m.winner===myId?t.green:t.red}/>
                                :dl2!==null&&<div style={{fontSize:12,color:urgent?t.orange:t.textSecondary}}>{dl2<0?"Overdue":dl2===0?"Due today":"Due in "+dl2+"d"}</div>
                              }
                            </div>
                            <div style={{fontSize:15,fontWeight:600,color:t.text,marginBottom:8}}>vs {item.opponent?item.opponent.name:"TBD"}</div>
                            {m.scheduledDate&&<div style={{fontSize:12,color:t.textSecondary,marginBottom:8}}>{m.scheduledDate} · {m.scheduledTime} · {m.scheduledCourt}</div>}
                            {m.status!=="complete"&&(
                              <div style={{display:"flex",gap:8}}>
                                <button
                                  onClick={function(){setScheduleModal({tournId:t2.id,roundIdx:item.roundIdx,matchId:m.id});setScheduleDraft({date:m.scheduledDate||"",time:m.scheduledTime||"6:00 PM",court:m.scheduledCourt||"Court 1"});}}
                                  style={{flex:1,padding:"9px",borderRadius:8,border:"1px solid "+t.border,background:"transparent",color:t.text,fontSize:12,fontWeight:500}}>
                                  {m.scheduledDate?"Edit":"Schedule"}
                                </button>
                                <button
                                  onClick={function(){setScoreModal({oppName:item.opponent?item.opponent.name:"Opponent",tournName:t2.name,tournId:t2.id,roundIdx:item.roundIdx,matchId:m.id,winnerId1:myId,winnerId2:item.opponent?item.opponent.id:null});setScoreDraft({sets:[{you:"",them:""}],result:"win",notes:"",date:new Date().toISOString().slice(0,10)}); }}
                                  style={{flex:1,padding:"9px",borderRadius:8,border:"none",background:t.accent,color:"#fff",fontSize:12,fontWeight:600}}>
                                  Log result
                                </button>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
                {(t2.rounds||[]).map(function(r,ri){
                  return(
                    <div key={ri} style={{marginBottom:20}}>
                      <div style={{
                        fontSize:11,fontWeight:700,letterSpacing:"0.06em",textTransform:"uppercase",marginBottom:10,
                        color:r.type==="semi"?t.purple:r.type==="final"?t.gold:t.textTertiary
                      }}>
                        {r.type==="semi"?"Semifinals":r.type==="final"?"Final":"League Round "+r.round}
                      </div>
                      <div style={{display:"flex",flexDirection:"column",gap:8}}>
                        {(r.matches||[]).map(function(m){
                          var isMyMatch=(m.p1&&m.p1.id===myId)||(m.p2&&m.p2.id===myId);
                          return(
                            <div key={m.id} style={{
                              background:t.bgCard,
                              border:"1px solid "+(isMyMatch?t.accent+"55":t.border),
                              borderLeft:"3px solid "+(isMyMatch?t.accent:t.border),
                              borderRadius:8, overflow:"hidden"
                            }}>
                              {[m.p1,m.p2].map(function(player,pi){
                                if(!player)return<div key={pi} style={{padding:"10px 14px",color:t.textTertiary,fontSize:12,fontStyle:"italic",borderBottom:pi===0?"1px solid "+t.border:"none"}}>TBD</div>;
                                var isWinner=m.winner===player.id,isLoser=m.winner&&!isWinner;
                                return(
                                  <div key={pi} style={{
                                    padding:"10px 14px",display:"flex",alignItems:"center",gap:10,
                                    borderBottom:pi===0?"1px solid "+t.border:"none",
                                    opacity:isLoser?0.4:1,
                                    background:isWinner?t.greenSubtle:"transparent"
                                  }}>
                                    <PlayerAvatar name={player.name} avatar={player.avatar} size={26}/>
                                    <span style={{fontSize:13,fontWeight:isWinner||player.id===myId?700:400,color:player.id===myId?t.accent:t.text,flex:1}}>
                                      {player.name}{player.id===myId?" (you)":""}
                                    </span>
                                    {isWinner&&<span style={{fontSize:11,color:t.green,fontWeight:700}}>W</span>}
                                  </div>
                                );
                              })}
                              {m.scheduledDate&&m.status!=="complete"&&(
                                <div style={{padding:"6px 14px",background:t.bgTertiary,fontSize:11,color:t.textSecondary,borderTop:"1px solid "+t.border}}>
                                  {m.scheduledDate} · {m.scheduledTime} · {m.scheduledCourt}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })()}

      {/* ── PEOPLE ── */}
      {tab==="people"&&(function(){
        if(!authUser)return(
          <div style={{maxWidth:680,margin:"0 auto",padding:"60px 20px",textAlign:"center"}}>
            <div style={{fontSize:32,marginBottom:12}}>🎾</div>
            <div style={{fontSize:18,fontWeight:700,color:t.text,marginBottom:8}}>Find your people</div>
            <div style={{fontSize:14,color:t.textSecondary,marginBottom:24}}>Connect with other players, follow their results, and build your tennis community.</div>
            <button onClick={function(){setShowAuth(true);setAuthMode("signup");setAuthStep("choose");}} style={{padding:"13px 28px",borderRadius:9,border:"none",background:t.accent,color:"#fff",fontSize:14,fontWeight:700}}>Join free</button>
          </div>
        );

        function PlayerCard(props){
          var u=props.u,rel=friendRelationLabel(u.id),loading=!!socialLoading[u.id];
          var wr=u.matches_played?Math.round((u.wins||0)/u.matches_played*100):null;
          return(
            <div style={{background:t.bgCard,border:"1px solid "+t.border,borderRadius:12,padding:"14px 16px",marginBottom:8,display:"flex",gap:12,alignItems:"center"}}>
              <div style={{width:44,height:44,borderRadius:"50%",background:avColor(u.name||"?"),display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,fontWeight:700,color:"#fff",flexShrink:0}}>
                {(u.avatar||(u.name||"?").slice(0,2)).slice(0,2).toUpperCase()}
              </div>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:14,fontWeight:700,color:t.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{u.name}</div>
                <div style={{fontSize:11,color:t.textSecondary,marginTop:1}}>
                  {u.suburb&&<span>{u.suburb}</span>}
                  {u.skill&&<span>{u.suburb?" · ":""}{u.skill}</span>}
                  {wr!==null&&<span> · {wr}% wins</span>}
                </div>
                {u.ranking_points!=null&&<div style={{fontSize:10,color:t.textTertiary,marginTop:1}}>{u.ranking_points} pts · {u.matches_played||0} matches</div>}
              </div>
              <div style={{display:"flex",flexDirection:"column",gap:5,flexShrink:0}}>
                {rel==="none"&&(
                  <button disabled={loading} onClick={function(){sendFriendRequest(u);}}
                    style={{padding:"6px 14px",borderRadius:8,border:"none",background:t.accent,color:"#fff",fontSize:12,fontWeight:600,opacity:loading?0.6:1}}>
                    {loading?"…":"Add"}
                  </button>
                )}
                {rel==="sent"&&(
                  <button disabled={loading} onClick={function(){var r=sentReq(u.id);if(r)cancelRequest(r);}}
                    style={{padding:"6px 14px",borderRadius:8,border:"1px solid "+t.border,background:"transparent",color:t.textSecondary,fontSize:12,fontWeight:500,opacity:loading?0.6:1}}>
                    {loading?"…":"Pending"}
                  </button>
                )}
                {rel==="received"&&(
                  <div style={{display:"flex",gap:5}}>
                    <button disabled={loading} onClick={function(){var r=recvReq(u.id);if(r)acceptRequest(r);}}
                      style={{padding:"6px 12px",borderRadius:8,border:"none",background:t.green,color:"#fff",fontSize:12,fontWeight:600,opacity:loading?0.6:1}}>
                      {loading?"…":"Accept"}
                    </button>
                    <button disabled={loading} onClick={function(){var r=recvReq(u.id);if(r)declineRequest(r);}}
                      style={{padding:"6px 10px",borderRadius:8,border:"1px solid "+t.border,background:"transparent",color:t.textSecondary,fontSize:12,opacity:loading?0.6:1}}>
                      ✕
                    </button>
                  </div>
                )}
                {rel==="friends"&&(
                  <button disabled={loading} onClick={function(){if(window.confirm("Unfriend "+u.name+"?"))unfriend(u);}}
                    style={{padding:"6px 14px",borderRadius:8,border:"1px solid "+t.border,background:"transparent",color:t.textSecondary,fontSize:12,fontWeight:500,opacity:loading?0.6:1}}>
                    {loading?"…":"Friends ✓"}
                  </button>
                )}
                <button onClick={function(){blockUser(u);}}
                  style={{padding:"4px 10px",borderRadius:7,border:"1px solid "+t.border,background:"transparent",color:t.textTertiary,fontSize:10,fontWeight:500}}>
                  Block
                </button>
              </div>
            </div>
          );
        }

        return(
          <div style={{maxWidth:680,margin:"0 auto"}}>
            {/* Search */}
            <div style={{padding:"20px 20px 0"}}>
              <div style={{position:"relative",marginBottom:16}}>
                <span style={{position:"absolute",left:12,top:"50%",transform:"translateY(-50%)",fontSize:15,pointerEvents:"none"}}>🔍</span>
                <input
                  value={peopleSearch}
                  placeholder="Search players by name…"
                  onChange={function(e){
                    var q=e.target.value;setPeopleSearch(q);
                    clearTimeout(searchTimer.current);
                    if(!q.trim()){setSearchResults([]);setSearchLoading(false);setShowSearchDrop(false);return;}
                    setSearchLoading(true);
                    setShowSearchDrop(true);
                    searchTimer.current=setTimeout(function(){searchUsers(q);},400);
                  }}
                  onFocus={function(){if(searchResults.length>0)setShowSearchDrop(true);}}
                  onBlur={function(){setTimeout(function(){setShowSearchDrop(false);},180);}}
                  style={Object.assign({},inputStyle,{paddingLeft:38,fontSize:14})}/>
                {searchLoading&&<span style={{position:"absolute",right:12,top:"50%",transform:"translateY(-50%)",fontSize:11,color:t.textTertiary}}>…</span>}

                {/* Floating dropdown */}
                {showSearchDrop&&peopleSearch.trim()&&(
                  <div style={{position:"absolute",top:"calc(100% + 6px)",left:0,right:0,background:t.card,borderRadius:12,boxShadow:"0 8px 32px rgba(0,0,0,0.13)",border:"1px solid "+t.border,zIndex:200,overflow:"hidden",maxHeight:320,overflowY:"auto"}}>
                    {searchLoading
                      ?<div style={{padding:"18px 16px",textAlign:"center",color:t.textTertiary,fontSize:13}}>Searching…</div>
                      :searchResults.length===0
                      ?<div style={{padding:"18px 16px",textAlign:"center",color:t.textTertiary,fontSize:13}}>No players found for "{peopleSearch}"</div>
                      :searchResults.map(function(u){
                        var isFriend=friends.some(function(f){return f.id===u.id;});
                        var isPending=sentRequests.some(function(r){return r.id===u.id;});
                        var isReceived=receivedRequests.some(function(r){return r.id===u.id;});
                        return(
                          <div key={u.id} style={{display:"flex",alignItems:"center",gap:12,padding:"10px 16px",borderBottom:"1px solid "+t.border,cursor:"default"}}>
                            <div style={{width:36,height:36,borderRadius:"50%",background:t.accentSubtle,display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,flexShrink:0,overflow:"hidden"}}>
                              {u.avatar?<img src={u.avatar} alt="" style={{width:"100%",height:"100%",objectFit:"cover"}}/>:"🎾"}
                            </div>
                            <div style={{flex:1,minWidth:0}}>
                              <div style={{fontSize:14,fontWeight:600,color:t.text,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{u.name}</div>
                              <div style={{fontSize:11,color:t.textTertiary}}>{[u.suburb,u.skill].filter(Boolean).join(" · ")}</div>
                            </div>
                            {isFriend
                              ?<span style={{fontSize:11,color:t.accent,fontWeight:600}}>Friends</span>
                              :isReceived
                                ?<button onMouseDown={function(){acceptRequest(u.id);setShowSearchDrop(false);}} style={{fontSize:11,padding:"4px 10px",borderRadius:6,border:"none",background:t.accent,color:"#fff",fontWeight:600,cursor:"pointer"}}>Accept</button>
                                :isPending
                                  ?<button onMouseDown={function(){cancelRequest(u.id);}} style={{fontSize:11,padding:"4px 10px",borderRadius:6,border:"1px solid "+t.border,background:"transparent",color:t.textSecondary,fontWeight:600,cursor:"pointer"}}>Pending</button>
                                  :<button onMouseDown={function(){sendFriendRequest(u.id);}} style={{fontSize:11,padding:"4px 10px",borderRadius:6,border:"none",background:t.accent,color:"#fff",fontWeight:600,cursor:"pointer"}}>Add</button>
                            }
                          </div>
                        );
                      })
                    }
                  </div>
                )}
              </div>
            </div>

            {/* Sub-tabs — always visible */}
            <div>
                <div style={{display:"flex",borderBottom:"1px solid "+t.border,padding:"0 20px"}}>
                  {[
                    {id:"friends",label:"Friends",count:friends.length},
                    {id:"requests",label:"Requests",count:receivedRequests.length+sentRequests.length},
                    {id:"suggested",label:"Suggested",count:null},
                    {id:"blocked",label:"Blocked",count:blockedUsers.length||null},
                  ].map(function(tb){
                    var on=peopleTab===tb.id;
                    return(
                      <button key={tb.id} onClick={function(){setPeopleTab(tb.id);}}
                        style={{padding:"10px 0",marginRight:20,border:"none",background:"transparent",color:on?t.accent:t.textTertiary,fontSize:13,fontWeight:on?700:400,borderBottom:"2px solid "+(on?t.accent:"transparent"),marginBottom:"-1px",display:"flex",gap:5,alignItems:"center"}}>
                        {tb.label}
                        {tb.count>0&&<span style={{fontSize:10,fontWeight:800,color:on?t.accent:t.textTertiary,background:on?t.accentSubtle:t.bgTertiary,padding:"1px 6px",borderRadius:10}}>{tb.count}</span>}
                      </button>
                    );
                  })}
                </div>

                <div style={{padding:"16px 20px 100px"}} className="fade-up">

                  {/* Friends tab */}
                  {peopleTab==="friends"&&(
                    friends.length===0
                      ?<div style={{textAlign:"center",padding:"48px 20px"}}>
                        <div style={{fontSize:36,marginBottom:12}}>🤝</div>
                        <div style={{fontSize:16,fontWeight:700,color:t.text,marginBottom:6}}>No friends yet</div>
                        <div style={{fontSize:13,color:t.textSecondary,marginBottom:20}}>Search for players above or check Suggested players.</div>
                        <button onClick={function(){setPeopleTab("suggested");}} style={{padding:"10px 20px",borderRadius:8,border:"none",background:t.accent,color:"#fff",fontSize:13,fontWeight:600}}>See suggestions</button>
                      </div>
                      :<div>
                        <div style={{fontSize:10,fontWeight:700,color:t.textTertiary,textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:12}}>{friends.length} friend{friends.length!==1?"s":""}</div>
                        {friends.map(function(u){return<PlayerCard key={u.id} u={u}/>;})}</div>
                  )}

                  {/* Requests tab */}
                  {peopleTab==="requests"&&(
                    receivedRequests.length===0&&sentRequests.length===0
                      ?<div style={{textAlign:"center",padding:"48px 20px"}}>
                        <div style={{fontSize:36,marginBottom:12}}>📬</div>
                        <div style={{fontSize:16,fontWeight:700,color:t.text,marginBottom:6}}>No pending requests</div>
                        <div style={{fontSize:13,color:t.textSecondary}}>When someone adds you, it'll show up here.</div>
                      </div>
                      :<div>
                        {receivedRequests.length>0&&(
                          <div style={{marginBottom:20}}>
                            <div style={{fontSize:10,fontWeight:700,color:t.textTertiary,textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:12}}>Received · {receivedRequests.length}</div>
                            {receivedRequests.map(function(u){
                              var loading=!!socialLoading[u.id];
                              return(
                                <div key={u.id} style={{background:t.bgCard,border:"1px solid "+t.border,borderLeft:"3px solid "+t.accent,borderRadius:12,padding:"14px 16px",marginBottom:8,display:"flex",gap:12,alignItems:"center"}}>
                                  <div style={{width:44,height:44,borderRadius:"50%",background:avColor(u.name||"?"),display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,fontWeight:700,color:"#fff",flexShrink:0}}>
                                    {(u.avatar||"?").slice(0,2).toUpperCase()}
                                  </div>
                                  <div style={{flex:1}}>
                                    <div style={{fontSize:14,fontWeight:700,color:t.text}}>{u.name}</div>
                                    <div style={{fontSize:11,color:t.textSecondary,marginTop:1}}>{u.suburb} {u.skill&&"· "+u.skill}</div>
                                  </div>
                                  <div style={{display:"flex",gap:6}}>
                                    <button disabled={loading} onClick={function(){acceptRequest(u);}}
                                      style={{padding:"8px 16px",borderRadius:8,border:"none",background:t.green,color:"#fff",fontSize:13,fontWeight:600,opacity:loading?0.6:1}}>
                                      {loading?"…":"Accept"}
                                    </button>
                                    <button disabled={loading} onClick={function(){declineRequest(u);}}
                                      style={{padding:"8px 12px",borderRadius:8,border:"1px solid "+t.border,background:"transparent",color:t.textSecondary,fontSize:13,opacity:loading?0.6:1}}>
                                      Decline
                                    </button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                        {sentRequests.length>0&&(
                          <div>
                            <div style={{fontSize:10,fontWeight:700,color:t.textTertiary,textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:12}}>Sent · {sentRequests.length}</div>
                            {sentRequests.map(function(u){
                              var loading=!!socialLoading[u.id];
                              return(
                                <div key={u.id} style={{background:t.bgCard,border:"1px solid "+t.border,borderRadius:12,padding:"14px 16px",marginBottom:8,display:"flex",gap:12,alignItems:"center"}}>
                                  <div style={{width:44,height:44,borderRadius:"50%",background:avColor(u.name||"?"),display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,fontWeight:700,color:"#fff",flexShrink:0}}>
                                    {(u.avatar||"?").slice(0,2).toUpperCase()}
                                  </div>
                                  <div style={{flex:1}}>
                                    <div style={{fontSize:14,fontWeight:700,color:t.text}}>{u.name}</div>
                                    <div style={{fontSize:11,color:t.textSecondary,marginTop:1}}>{u.suburb} {u.skill&&"· "+u.skill}</div>
                                    <div style={{fontSize:11,color:t.textTertiary,marginTop:2}}>Request pending</div>
                                  </div>
                                  <button disabled={loading} onClick={function(){cancelRequest(u);}}
                                    style={{padding:"7px 14px",borderRadius:8,border:"1px solid "+t.border,background:"transparent",color:t.textSecondary,fontSize:12,fontWeight:500,opacity:loading?0.6:1}}>
                                    {loading?"…":"Cancel"}
                                  </button>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                  )}

                  {/* Suggested tab */}
                  {peopleTab==="suggested"&&(
                    <div>
                      <div style={{fontSize:10,fontWeight:700,color:t.textTertiary,textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:4}}>Players near you</div>
                      <div style={{fontSize:12,color:t.textSecondary,marginBottom:14}}>Same suburb or skill level as you.</div>
                      {suggestedPlayers.length===0
                        ?<div style={{textAlign:"center",padding:"40px 20px"}}>
                          <div style={{fontSize:32,marginBottom:10}}>🎾</div>
                          <div style={{fontSize:14,fontWeight:600,color:t.text,marginBottom:6}}>No suggestions yet</div>
                          <div style={{fontSize:13,color:t.textSecondary}}>As more players join your area, they'll appear here.</div>
                        </div>
                        :suggestedPlayers.map(function(u){return<PlayerCard key={u.id} u={u}/>;})
                      }
                      {/* Invite via share link */}
                      <div style={{background:t.bgCard,border:"1px solid "+t.border,borderRadius:12,padding:"16px",marginTop:16,textAlign:"center"}}>
                        <div style={{fontSize:14,fontWeight:700,color:t.text,marginBottom:4}}>Invite friends</div>
                        <div style={{fontSize:12,color:t.textSecondary,marginBottom:14}}>Share CourtSync with people you play with.</div>
                        <button
                          onClick={function(){
                            var url="https://rarired.vercel.app";
                            if(navigator.share){navigator.share({title:"Join CourtSync",text:"Track your tennis matches and compete in tournaments.",url:url});}
                            else{navigator.clipboard.writeText(url);alert("Link copied!");};
                          }}
                          style={{padding:"10px 24px",borderRadius:8,border:"none",background:t.accent,color:"#fff",fontSize:13,fontWeight:600}}>
                          Share invite link
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Blocked tab */}
                  {peopleTab==="blocked"&&(
                    blockedUsers.length===0
                      ?<div style={{textAlign:"center",padding:"48px 20px"}}>
                        <div style={{fontSize:13,color:t.textTertiary}}>You haven't blocked anyone.</div>
                      </div>
                      :<div>
                        <div style={{fontSize:10,fontWeight:700,color:t.textTertiary,textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:12}}>{blockedUsers.length} blocked</div>
                        {blockedUsers.map(function(u){
                          return(
                            <div key={u.id} style={{background:t.bgCard,border:"1px solid "+t.border,borderRadius:12,padding:"14px 16px",marginBottom:8,display:"flex",gap:12,alignItems:"center"}}>
                              <div style={{width:44,height:44,borderRadius:"50%",background:t.bgTertiary,border:"1px solid "+t.border,display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,fontWeight:700,color:t.textTertiary,flexShrink:0}}>
                                {(u.avatar||"?").slice(0,2).toUpperCase()}
                              </div>
                              <div style={{flex:1}}>
                                <div style={{fontSize:14,fontWeight:600,color:t.textSecondary}}>{u.name}</div>
                                {u.suburb&&<div style={{fontSize:11,color:t.textTertiary,marginTop:1}}>{u.suburb}</div>}
                              </div>
                              <button onClick={function(){unblockUser(u);}}
                                style={{padding:"7px 14px",borderRadius:8,border:"1px solid "+t.border,background:"transparent",color:t.accent,fontSize:12,fontWeight:600}}>
                                Unblock
                              </button>
                            </div>
                          );
                        })}
                      </div>
                  )}
                </div>
              </div>
            </div>
        );
      })()}

      {/* ── PROFILE ── */}
      {tab==="profile"&&(function(){
        // Prefer stored stats from Supabase; fall back to computing from local history
        var wins=profile.wins!=null?profile.wins:history.filter(function(m){return m.result==="win";}).length;
        var losses=profile.losses!=null?profile.losses:history.length-wins;
        var played=profile.matches_played!=null?profile.matches_played:history.length;
        var winRate=played?Math.round(wins/played*100):0;
        var rankPts=profile.ranking_points!=null?profile.ranking_points:Math.max(0,1000+wins*15-losses*10);
        var streakCount=profile.streak_count!=null?profile.streak_count:0;
        var streakType=profile.streak_type!=null?profile.streak_type:null;
        if(profile.streak_count==null&&history.length){
          streakType=history[0].result;
          for(var si=0;si<history.length;si++){if(history[si].result===streakType)streakCount++;else break;}
        }
        var streakLabel=streakCount===0?"—":streakCount+(streakType==="win"?" W":" L");

        // Achievements
        var BADGES=[
          {id:"first",label:"First Match",desc:"Play your first match",icon:"🎾",unlocked:history.length>=1},
          {id:"win1",label:"First Win",desc:"Win your first match",icon:"🏆",unlocked:wins>=1},
          {id:"hat",label:"Hat Trick",desc:"Win 3 matches",icon:"🔥",unlocked:wins>=3},
          {id:"ded",label:"Dedicated",desc:"Play 10 matches",icon:"💪",unlocked:played>=10},
          {id:"sharp",label:"Sharp",desc:"70%+ win rate (5+ matches)",icon:"⚡",unlocked:played>=5&&winRate>=70},
          {id:"fire",label:"On Fire",desc:"3-match win streak",icon:"🚀",unlocked:streakType==="win"&&streakCount>=3},
          {id:"beast",label:"Unstoppable",desc:"5-match win streak",icon:"👑",unlocked:streakType==="win"&&streakCount>=5},
          {id:"vet",label:"Veteran",desc:"Play 25 matches",icon:"🎖️",unlocked:played>=25},
        ];
        var unlockedCount=BADGES.filter(function(b){return b.unlocked;}).length;

        return(
        <div style={{maxWidth:680,margin:"0 auto"}}>

          {/* ── HERO HEADER ── */}
          <div style={{padding:"28px 20px 0",background:t.bg}}>
            <div style={{display:"flex",alignItems:"flex-start",gap:16,marginBottom:20}}>
              {/* Avatar */}
              <div style={{
                width:72,height:72,borderRadius:"50%",flexShrink:0,
                background:avColor(profile.name),
                display:"flex",alignItems:"center",justifyContent:"center",
                fontSize:24,fontWeight:800,color:"#fff",
                boxShadow:"0 0 0 3px "+t.bg+", 0 0 0 5px "+avColor(profile.name)+"44"
              }}>{profile.avatar}</div>
              <div style={{flex:1,paddingTop:4}}>
                <div style={{fontSize:22,fontWeight:800,color:t.text,letterSpacing:"-0.5px",lineHeight:1.1}}>{profile.name}</div>
                {profile.suburb&&<div style={{fontSize:13,color:t.textSecondary,marginTop:3}}>{profile.suburb}</div>}
                <div style={{display:"flex",gap:6,marginTop:8,flexWrap:"wrap"}}>
                  <span style={{fontSize:11,fontWeight:700,color:t.accent,background:t.accentSubtle,padding:"3px 9px",borderRadius:20,letterSpacing:"0.02em"}}>{profile.skill}</span>
                  <span style={{fontSize:11,fontWeight:600,color:t.green,background:t.greenSubtle,padding:"3px 9px",borderRadius:20}}>{profile.style}</span>
                </div>
              </div>
              <button
                onClick={function(){setProfileDraft(profile);setEditingProfile(true);setProfileTab("settings");}}
                style={{padding:"7px 14px",borderRadius:8,border:"1px solid "+t.border,background:"transparent",color:t.text,fontSize:12,fontWeight:600,flexShrink:0,marginTop:4}}>
                Edit
              </button>
            </div>
            {profile.bio&&<p style={{fontSize:13,color:t.textSecondary,lineHeight:1.6,marginBottom:16,marginTop:-8}}>{profile.bio}</p>}

            {/* Ranking pts bar */}
            <div style={{background:t.bgCard,border:"1px solid "+t.border,borderRadius:10,padding:"12px 16px",marginBottom:16,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div>
                <div style={{fontSize:10,fontWeight:700,color:t.textTertiary,textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:2}}>Ranking Points</div>
                <div style={{fontSize:26,fontWeight:800,color:t.text,letterSpacing:"-0.5px",fontVariantNumeric:"tabular-nums"}}>{rankPts.toLocaleString()}</div>
              </div>
              <div style={{textAlign:"right"}}>
                <div style={{fontSize:10,fontWeight:700,color:t.textTertiary,textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:2}}>Achievements</div>
                <div style={{fontSize:26,fontWeight:800,color:t.gold,letterSpacing:"-0.5px"}}>{unlockedCount}<span style={{fontSize:13,color:t.textTertiary,fontWeight:500}}>/{BADGES.length}</span></div>
              </div>
            </div>

            {/* 4-stat strip */}
            <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8,marginBottom:20}}>
              {[
                {l:"Matches",v:history.length,c:t.text},
                {l:"Wins",v:wins,c:t.green},
                {l:"Win %",v:history.length?winRate+"%":"—",c:t.accent},
                {l:"Streak",v:streakLabel,c:streakType==="win"?t.green:streakType==="loss"?t.red:t.textTertiary},
              ].map(function(s){
                return(
                  <div key={s.l} style={{background:t.bgCard,border:"1px solid "+t.border,borderRadius:10,padding:"12px 8px",textAlign:"center"}}>
                    <div style={{fontSize:20,fontWeight:800,color:s.c,fontVariantNumeric:"tabular-nums",letterSpacing:"-0.3px"}}>{s.v}</div>
                    <div style={{fontSize:9,color:t.textTertiary,marginTop:3,fontWeight:700,letterSpacing:"0.07em",textTransform:"uppercase"}}>{s.l}</div>
                  </div>
                );
              })}
            </div>

            {/* Sub-tabs */}
            <div style={{display:"flex",borderBottom:"1px solid "+t.border,marginLeft:-20,marginRight:-20,paddingLeft:20}}>
              {["overview","matches","achievements","settings"].map(function(pt){
                var on=profileTab===pt;
                return(
                  <button key={pt}
                    onClick={function(){setProfileTab(pt);setEditingProfile(false);setEditingAvail(false);if(pt==="settings")setProfileDraft(profile);}}
                    style={{
                      padding:"10px 16px",border:"none",background:"transparent",
                      color:on?t.accent:t.textTertiary,
                      fontSize:12,fontWeight:on?700:500,
                      borderBottom:"2px solid "+(on?t.accent:"transparent"),
                      marginBottom:"-1px",textTransform:"capitalize",letterSpacing:"0.01em"
                    }}>
                    {pt}
                  </button>
                );
              })}
            </div>
          </div>

          {/* ── OVERVIEW TAB ── */}
          {profileTab==="overview"&&(
            <div style={{padding:"20px 20px 100px"}} className="fade-up">

              {/* Quick stats 2×2 */}
              <div style={{fontSize:10,fontWeight:700,color:t.textTertiary,textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:10}}>Performance</div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:24}}>
                {[
                  {l:"Total Played",v:history.length,sub:"all time",c:t.text},
                  {l:"Total Wins",v:wins,sub:"all time",c:t.green},
                  {l:"Total Losses",v:losses,sub:"all time",c:t.red},
                  {l:"Win Rate",v:history.length?winRate+"%":"—",sub:history.length?"from "+history.length+" matches":"no matches yet",c:t.accent},
                ].map(function(s){
                  return(
                    <div key={s.l} style={{background:t.bgCard,border:"1px solid "+t.border,borderLeft:"3px solid "+s.c,borderRadius:10,padding:"14px 16px"}}>
                      <div style={{fontSize:28,fontWeight:800,color:s.c,fontVariantNumeric:"tabular-nums",letterSpacing:"-0.5px"}}>{s.v}</div>
                      <div style={{fontSize:12,fontWeight:600,color:t.text,marginTop:2}}>{s.l}</div>
                      <div style={{fontSize:11,color:t.textTertiary,marginTop:1}}>{s.sub}</div>
                    </div>
                  );
                })}
              </div>

              {/* Recent matches preview */}
              <div style={{fontSize:10,fontWeight:700,color:t.textTertiary,textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:10,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <span>Recent Matches</span>
                {history.length>3&&<button onClick={function(){setProfileTab("matches");}} style={{background:"none",border:"none",color:t.accent,fontSize:11,fontWeight:600}}>See all</button>}
              </div>
              {history.length===0
                ?<div style={{background:t.bgCard,border:"1px solid "+t.border,borderRadius:10,padding:"28px 20px",textAlign:"center"}}>
                  <div style={{fontSize:28,marginBottom:8}}>🎾</div>
                  <div style={{fontSize:14,fontWeight:600,color:t.text,marginBottom:4}}>No matches yet</div>
                  <div style={{fontSize:13,color:t.textTertiary}}>Enter a tournament or log a match to get started.</div>
                </div>
                :history.slice(0,3).map(function(m){
                  var isWin=m.result==="win";
                  var scoreStr=(m.sets||[]).map(function(s){return s.you+"-"+s.them;}).join(", ");
                  return(
                    <div key={m.id} style={{
                      background:t.bgCard,border:"1px solid "+t.border,
                      borderLeft:"3px solid "+(isWin?t.green:t.red),
                      borderRadius:10,padding:"14px 16px",marginBottom:8,
                      display:"flex",alignItems:"center",gap:12
                    }}>
                      <div style={{
                        width:36,height:36,borderRadius:"50%",flexShrink:0,
                        background:isWin?t.greenSubtle:t.redSubtle,
                        display:"flex",alignItems:"center",justifyContent:"center",
                        fontSize:14,fontWeight:800,
                        color:isWin?t.green:t.red
                      }}>{isWin?"W":"L"}</div>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontSize:14,fontWeight:600,color:t.text,marginBottom:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>vs {m.oppName||"Unknown"}</div>
                        <div style={{fontSize:12,color:t.textSecondary}}>{scoreStr||"No score"}{m.tournName?" · "+m.tournName:""}</div>
                      </div>
                      <div style={{fontSize:11,color:t.textTertiary,flexShrink:0,textAlign:"right"}}>
                        {m.date||""}
                      </div>
                    </div>
                  );
                })
              }

              {/* Top badges preview */}
              {unlockedCount>0&&(
                <div style={{marginTop:24}}>
                  <div style={{fontSize:10,fontWeight:700,color:t.textTertiary,textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:10,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                    <span>Achievements</span>
                    <button onClick={function(){setProfileTab("achievements");}} style={{background:"none",border:"none",color:t.accent,fontSize:11,fontWeight:600}}>See all</button>
                  </div>
                  <div style={{display:"flex",gap:8,overflowX:"auto",paddingBottom:4}}>
                    {BADGES.filter(function(b){return b.unlocked;}).map(function(b){
                      return(
                        <div key={b.id} style={{
                          background:t.bgCard,border:"1px solid "+t.border,
                          borderRadius:10,padding:"12px",textAlign:"center",
                          minWidth:80,flexShrink:0
                        }}>
                          <div style={{fontSize:24,marginBottom:4}}>{b.icon}</div>
                          <div style={{fontSize:10,fontWeight:700,color:t.text,lineHeight:1.2}}>{b.label}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Availability preview */}
              <div style={{marginTop:24}}>
                <div style={{fontSize:10,fontWeight:700,color:t.textTertiary,textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:10,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <span>Availability</span>
                  <button onClick={function(){setProfileTab("settings");setEditingAvail(true);}} style={{background:"none",border:"none",color:t.accent,fontSize:11,fontWeight:600}}>Edit</button>
                </div>
                <div style={{background:t.bgCard,border:"1px solid "+t.border,borderRadius:10,padding:"14px 16px"}}>
                  {DAYS_SHORT.filter(function(d){return((profile.availability||{})[d]||[]).length>0;}).length===0
                    ?<p style={{fontSize:13,color:t.textTertiary,margin:0}}>No availability set yet.</p>
                    :<div style={{display:"flex",flexDirection:"column",gap:8}}>
                      {DAYS_SHORT.filter(function(d){return((profile.availability||{})[d]||[]).length>0;}).map(function(day){
                        return(
                          <div key={day} style={{display:"flex",alignItems:"center",gap:10}}>
                            <span style={{fontSize:11,fontWeight:700,color:t.textSecondary,width:30,flexShrink:0}}>{day}</span>
                            <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
                              {((profile.availability||{})[day]||[]).map(function(b){
                                return<span key={b} style={{fontSize:10,fontWeight:600,color:t.accent,background:t.accentSubtle,padding:"2px 8px",borderRadius:20}}>{b}</span>;
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  }
                </div>
              </div>
            </div>
          )}

          {/* ── MATCHES TAB ── */}
          {profileTab==="matches"&&(
            <div style={{padding:"20px 20px 100px"}} className="fade-up">
              <div style={{fontSize:10,fontWeight:700,color:t.textTertiary,textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:12}}>
                Match History · {history.length} {history.length===1?"match":"matches"}
              </div>
              {history.length===0
                ?<div style={{background:t.bgCard,border:"1px solid "+t.border,borderRadius:10,padding:"40px 20px",textAlign:"center"}}>
                  <div style={{fontSize:36,marginBottom:12}}>🎾</div>
                  <div style={{fontSize:15,fontWeight:700,color:t.text,marginBottom:6}}>No matches yet</div>
                  <div style={{fontSize:13,color:t.textTertiary,lineHeight:1.5}}>Complete a tournament match and log your score to see your history here.</div>
                </div>
                :history.map(function(m,mi){
                  var isWin=m.result==="win";
                  var scoreStr=(m.sets||[]).map(function(s){return s.you+"-"+s.them;}).join(", ");
                  return(
                    <div key={m.id} style={{
                      background:t.bgCard,border:"1px solid "+t.border,
                      borderLeft:"3px solid "+(isWin?t.green:t.red),
                      borderRadius:10,padding:"16px",marginBottom:8
                    }}>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:8}}>
                        <div style={{display:"flex",alignItems:"center",gap:10}}>
                          <div style={{
                            width:32,height:32,borderRadius:"50%",
                            background:isWin?t.greenSubtle:t.redSubtle,
                            display:"flex",alignItems:"center",justifyContent:"center",
                            fontSize:12,fontWeight:800,color:isWin?t.green:t.red,flexShrink:0
                          }}>{isWin?"W":"L"}</div>
                          <div>
                            <div style={{fontSize:14,fontWeight:700,color:t.text}}>vs {m.oppName||"Unknown"}</div>
                            <div style={{fontSize:11,color:isWin?t.green:t.red,fontWeight:600,marginTop:1}}>{isWin?"Victory":"Defeat"}</div>
                          </div>
                        </div>
                        <div style={{fontSize:11,color:t.textTertiary,textAlign:"right"}}>
                          <div>{m.date||""}</div>
                          {m.tournName&&<div style={{fontSize:10,marginTop:2,color:t.accent,fontWeight:600}}>{m.tournName}</div>}
                        </div>
                      </div>
                      {scoreStr&&(
                        <div style={{background:t.bgTertiary,border:"1px solid "+t.border,borderRadius:7,padding:"8px 12px",display:"inline-block"}}>
                          <span style={{fontSize:11,fontWeight:600,color:t.textSecondary,letterSpacing:"0.04em"}}>SCORE </span>
                          <span style={{fontSize:14,fontWeight:800,color:t.text,fontVariantNumeric:"tabular-nums"}}>{scoreStr}</span>
                        </div>
                      )}
                    </div>
                  );
                })
              }
            </div>
          )}

          {/* ── ACHIEVEMENTS TAB ── */}
          {profileTab==="achievements"&&(
            <div style={{padding:"20px 20px 100px"}} className="fade-up">
              <div style={{fontSize:10,fontWeight:700,color:t.textTertiary,textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:4}}>
                Badges
              </div>
              <div style={{fontSize:13,color:t.textSecondary,marginBottom:16}}>{unlockedCount} of {BADGES.length} unlocked</div>

              {/* Progress bar */}
              <div style={{background:t.bgTertiary,borderRadius:4,height:4,marginBottom:24,overflow:"hidden"}}>
                <div style={{height:"100%",width:(unlockedCount/BADGES.length*100)+"%",background:t.gold,borderRadius:4,transition:"width 0.5s ease"}}/>
              </div>

              <div style={{display:"flex",flexDirection:"column",gap:8}}>
                {BADGES.map(function(b){
                  return(
                    <div key={b.id} style={{
                      background:t.bgCard,border:"1px solid "+t.border,
                      borderLeft:"3px solid "+(b.unlocked?t.gold:t.border),
                      borderRadius:10,padding:"14px 16px",
                      display:"flex",alignItems:"center",gap:14,
                      opacity:b.unlocked?1:0.5
                    }}>
                      <div style={{
                        width:44,height:44,borderRadius:12,flexShrink:0,
                        background:b.unlocked?t.goldSubtle:t.bgTertiary,
                        display:"flex",alignItems:"center",justifyContent:"center",
                        fontSize:22,
                        filter:b.unlocked?"none":"grayscale(1)"
                      }}>{b.icon}</div>
                      <div style={{flex:1}}>
                        <div style={{fontSize:14,fontWeight:700,color:t.text}}>{b.label}</div>
                        <div style={{fontSize:12,color:t.textSecondary,marginTop:2}}>{b.desc}</div>
                      </div>
                      {b.unlocked&&<div style={{fontSize:11,fontWeight:700,color:t.gold,flexShrink:0}}>Unlocked</div>}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── SETTINGS TAB ── */}
          {profileTab==="settings"&&(
            <div style={{padding:"20px 20px 100px"}} className="fade-up">

              {/* Edit Profile form */}
              {!editingAvail&&(
                <div style={{background:t.bgCard,border:"1px solid "+t.border,borderRadius:10,padding:20,marginBottom:12}}>
                  <div style={{fontSize:13,fontWeight:700,color:t.text,marginBottom:16}}>Edit Profile</div>
                  {[{l:"Full name",k:"name",type:"text",ph:"Your name"},{l:"Suburb",k:"suburb",type:"text",ph:"e.g. Bondi"},{l:"Bio",k:"bio",type:"text",ph:"Short bio..."}].map(function(f){
                    return(
                      <div key={f.k} style={{marginBottom:10}}>
                        <label style={{fontSize:10,fontWeight:700,color:t.textSecondary,display:"block",marginBottom:4,letterSpacing:"0.06em",textTransform:"uppercase"}}>{f.l}</label>
                        <input type={f.type} value={profileDraft[f.k]||""} placeholder={f.ph}
                          onChange={function(e){var v=e.target.value;setProfileDraft(function(d){return Object.assign({},d,{[f.k]:v});});}}
                          style={inputStyle}/>
                      </div>
                    );
                  })}
                  {[{l:"Skill level",k:"skill",opts:SKILL_LEVELS},{l:"Play style",k:"style",opts:PLAY_STYLES}].map(function(f){
                    return(
                      <div key={f.k} style={{marginBottom:12}}>
                        <label style={{fontSize:10,fontWeight:700,color:t.textSecondary,display:"block",marginBottom:6,letterSpacing:"0.06em",textTransform:"uppercase"}}>{f.l}</label>
                        <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
                          {f.opts.map(function(o){
                            var on=profileDraft[f.k]===o;
                            return(
                              <button key={o}
                                onClick={function(){setProfileDraft(function(d){return Object.assign({},d,{[f.k]:o});});}}
                                style={{padding:"7px 12px",borderRadius:7,border:"1px solid "+(on?t.accent:t.border),background:on?t.accentSubtle:"transparent",color:on?t.accent:t.textSecondary,fontSize:12,fontWeight:on?600:400}}>
                                {o}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                  <button
                    onClick={async function(){
                      var init2=initials(profileDraft.name||"YN");
                      var nd=Object.assign({},profileDraft,{avatar:init2});
                      setProfile(nd);
                      if(authUser){
                        var res=await supabase.from('profiles').upsert({
                          id:authUser.id,
                          name:nd.name||"",
                          suburb:nd.suburb||"",
                          bio:nd.bio||"",
                          skill:nd.skill||"Intermediate",
                          style:nd.style||"All-Court",
                          avatar:nd.avatar||"",
                          availability:nd.availability||{}
                        },{onConflict:'id'});
                        if(res.error)console.error('Profile save error:',res.error);
                      }
                    }}
                    style={{width:"100%",padding:"12px",borderRadius:8,border:"none",background:t.accent,color:"#fff",fontSize:13,fontWeight:600,marginTop:4}}>
                    Save changes
                  </button>
                </div>
              )}

              {/* Availability editor */}
              <div style={{background:t.bgCard,border:"1px solid "+t.border,borderRadius:10,overflow:"hidden",marginBottom:12}}>
                <div style={{padding:"14px 16px",borderBottom:"1px solid "+t.border,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <span style={{fontSize:13,fontWeight:700,color:t.text}}>Availability</span>
                  <button
                    onClick={function(){setAvailDraft(profile.availability||{});setEditingAvail(!editingAvail);}}
                    style={{fontSize:12,color:t.accent,background:"none",border:"none",fontWeight:600}}>
                    {editingAvail?"Done":"Edit"}
                  </button>
                </div>
                {editingAvail?(
                  <div style={{padding:"16px"}}>
                    {DAYS_SHORT.map(function(day,di){
                      return(
                        <div key={day} style={{display:"flex",alignItems:"center",gap:10,paddingTop:di===0?0:12,paddingBottom:12,borderBottom:di<DAYS_SHORT.length-1?"1px solid "+t.border:"none"}}>
                          <span style={{fontSize:12,fontWeight:700,color:t.textSecondary,width:32,flexShrink:0}}>{day}</span>
                          <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
                            {TIME_BLOCKS.map(function(block){
                              var on=(availDraft[day]||[]).includes(block);
                              return(
                                <button key={block}
                                  onClick={function(){
                                    var cur=availDraft[day]||[];
                                    var next=on?cur.filter(function(b){return b!==block;}):cur.concat([block]);
                                    setAvailDraft(function(d){return Object.assign({},d,{[day]:next});});
                                  }}
                                  style={{padding:"6px 11px",borderRadius:7,border:"1px solid "+(on?t.accent:t.border),background:on?t.accentSubtle:"transparent",color:on?t.accent:t.textTertiary,fontSize:11,fontWeight:on?600:400}}>
                                  {block}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                    <button
                      onClick={async function(){
                        setProfile(function(p){return Object.assign({},p,{availability:availDraft});});
                        setEditingAvail(false);
                        if(authUser){
                          var res=await supabase.from('profiles').upsert({id:authUser.id,availability:availDraft},{onConflict:'id'});
                          if(res.error)console.error('Availability save error:',res.error);
                        }
                      }}
                      style={{width:"100%",marginTop:12,padding:"12px",borderRadius:8,border:"none",background:t.accent,color:"#fff",fontSize:13,fontWeight:600}}>
                      Save availability
                    </button>
                  </div>
                ):(
                  <div style={{padding:"14px 16px"}}>
                    {DAYS_SHORT.filter(function(d){return((profile.availability||{})[d]||[]).length>0;}).length===0
                      ?<p style={{fontSize:13,color:t.textTertiary,margin:0}}>No availability set.</p>
                      :DAYS_SHORT.filter(function(d){return((profile.availability||{})[d]||[]).length>0;}).map(function(day){
                        return(
                          <div key={day} style={{display:"flex",alignItems:"center",gap:10,marginBottom:6}}>
                            <span style={{fontSize:11,fontWeight:700,color:t.textSecondary,width:30}}>{day}</span>
                            <div style={{display:"flex",gap:4}}>
                              {((profile.availability||{})[day]||[]).map(function(b){
                                return<span key={b} style={{fontSize:10,fontWeight:600,color:t.accent,background:t.accentSubtle,padding:"2px 8px",borderRadius:20}}>{b}</span>;
                              })}
                            </div>
                          </div>
                        );
                      })
                    }
                  </div>
                )}
              </div>

              {/* Privacy */}
              <div style={{background:t.bgCard,border:"1px solid "+t.border,borderRadius:10,overflow:"hidden",marginBottom:12}}>
                <div style={{padding:"14px 16px",borderBottom:"1px solid "+t.border}}>
                  <div style={{fontSize:13,fontWeight:700,color:t.text,marginBottom:2}}>Profile Privacy</div>
                  <div style={{fontSize:11,color:t.textTertiary}}>Controls who can see your profile and matches.</div>
                </div>
                <div style={{padding:"14px 16px",display:"flex",gap:6,flexWrap:"wrap"}}>
                  {[{v:"public",l:"Public",d:"Everyone"},{v:"friends",l:"Friends only",d:"Only friends"},{v:"private",l:"Private",d:"Only you"}].map(function(opt){
                    var on=(profile.privacy||"public")===opt.v;
                    return(
                      <button key={opt.v}
                        onClick={function(){
                          var nd=Object.assign({},profile,{privacy:opt.v});
                          setProfile(nd);
                          if(authUser)supabase.from('profiles').upsert({id:authUser.id,privacy:opt.v},{onConflict:'id'});
                        }}
                        style={{flex:1,padding:"10px 8px",borderRadius:9,border:"1px solid "+(on?t.accent:t.border),background:on?t.accentSubtle:"transparent",color:on?t.accent:t.textSecondary,fontSize:12,fontWeight:on?700:400,textAlign:"center"}}>
                        <div>{opt.l}</div>
                        <div style={{fontSize:10,opacity:0.7,marginTop:1}}>{opt.d}</div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Account */}
              {authUser&&(
                <div style={{background:t.bgCard,border:"1px solid "+t.border,borderRadius:10,overflow:"hidden",marginBottom:12}}>
                  <div style={{padding:"14px 16px",borderBottom:"1px solid "+t.border}}>
                    <div style={{fontSize:10,fontWeight:700,color:t.textTertiary,textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:2}}>Account</div>
                    <div style={{fontSize:14,color:t.text,fontWeight:500}}>{authUser.email}</div>
                  </div>
                  <button onClick={function(){setTab("people");setPeopleTab("requests");}} style={{width:"100%",padding:"12px 16px",border:"none",borderBottom:"1px solid "+t.border,background:"transparent",color:t.text,fontSize:13,fontWeight:500,textAlign:"left",cursor:"pointer",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                    <span>Friend requests</span>
                    <span style={{fontSize:12,color:receivedRequests.length>0?t.accent:t.textTertiary}}>{receivedRequests.length>0?receivedRequests.length+" pending":"›"}</span>
                  </button>
                  <button
                    onClick={function(){supabase.auth.signOut();}}
                    style={{width:"100%",padding:"14px 16px",border:"none",background:"transparent",color:t.red,fontSize:13,fontWeight:600,textAlign:"left",cursor:"pointer"}}>
                    Sign out
                  </button>
                </div>
              )}
            </div>
          )}

        </div>
        );
      })()}

      {/* ── ADMIN ── */}
      {tab==="admin"&&(
        <div style={{maxWidth:680,margin:"0 auto",padding:"32px 20px"}}>
          <div style={{marginBottom:24}}>
            <h1 style={{fontSize:28,fontWeight:700,letterSpacing:"-0.6px",color:t.text,marginBottom:6}}>Admin</h1>
            <p style={{fontSize:15,color:t.textSecondary}}>Manage tournaments, draws and results.</p>
          </div>

          {/* Economics */}
          <div style={{background:t.bgCard,border:"1px solid "+t.border,borderRadius:10,padding:"14px 16px",marginBottom:20}}>
            <div style={{fontSize:10,fontWeight:700,color:t.textTertiary,textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:10}}>Revenue Estimate</div>
            <div style={{display:"flex",gap:8}}>
              {[8,16,32].map(function(size){
                return(
                  <div key={size} style={{flex:1,background:t.bgTertiary,borderRadius:8,padding:"10px",textAlign:"center"}}>
                    <div style={{fontSize:10,color:t.textTertiary,marginBottom:2}}>{size} players</div>
                    <div style={{fontSize:12,fontWeight:700,color:t.text}}>${ENTRY_FEES[size]}</div>
                    <div style={{fontSize:11,color:t.accent,marginTop:1}}>~${netRevenue(size)} net</div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Admin sub-tabs */}
          <div style={{display:"flex",gap:0,marginBottom:24,borderBottom:"1px solid "+t.border}}>
            {["tournaments","draws","results"].map(function(at){
              var on=adminTab===at;
              return(
                <button key={at}
                  onClick={function(){setAdminTab(at);}}
                  style={{
                    flex:1,padding:"10px 0",border:"none",
                    background:"transparent",
                    color:on?t.accent:t.textTertiary,
                    fontSize:12,fontWeight:on?700:400,
                    borderBottom:"2px solid "+(on?t.accent:"transparent"),
                    marginBottom:"-1px",
                    textTransform:"capitalize"
                  }}>
                  {at}
                </button>
              );
            })}
          </div>

          {adminTab==="tournaments"&&(
            <div>
              {/* Create form */}
              <div style={{background:t.bgCard,border:"1px solid "+t.border,borderRadius:10,padding:18,marginBottom:14}}>
                <div style={{fontSize:13,fontWeight:700,color:t.text,marginBottom:16}}>Create Tournament</div>
                {[{l:"Name",k:"name",type:"text",ph:"e.g. Sydney Autumn Open"},{l:"Start date",k:"startDate",type:"date",ph:""}].map(function(f){
                  return(
                    <div key={f.k} style={{marginBottom:10}}>
                      <label style={{fontSize:11,fontWeight:600,color:t.textSecondary,display:"block",marginBottom:4,letterSpacing:"0.04em",textTransform:"uppercase"}}>{f.l}</label>
                      <input type={f.type} value={newTourn[f.k]} placeholder={f.ph||""}
                        onChange={function(e){var v=e.target.value;setNewTourn(function(d){return Object.assign({},d,{[f.k]:v});});}}
                        style={inputStyle}/>
                    </div>
                  );
                })}
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:14}}>
                  {[
                    {l:"Skill",k:"skill",opts:SKILL_LEVELS.map(function(s){return{v:s,l:s};}),num:false},
                    {l:"Draw size",k:"size",opts:[{v:8,l:"8"},{v:16,l:"16"},{v:32,l:"32"}],num:true},
                    {l:"Format",k:"format",opts:[{v:"league",l:"League"},{v:"elimination",l:"Elimination"}],num:false},
                    {l:"Surface",k:"surface",opts:["Hard Court","Clay","Grass","Indoor Hard"].map(function(s){return{v:s,l:s};}),num:false},
                    {l:"Days/round",k:"deadlineDays",opts:[{v:7,l:"7 days"},{v:10,l:"10 days"},{v:14,l:"14 days"}],num:true},
                  ].map(function(f){
                    return(
                      <div key={f.k}>
                        <label style={{fontSize:11,fontWeight:600,color:t.textSecondary,display:"block",marginBottom:4,letterSpacing:"0.04em",textTransform:"uppercase"}}>{f.l}</label>
                        <select value={newTourn[f.k]}
                          onChange={function(e){var v=f.num?parseInt(e.target.value):e.target.value;setNewTourn(function(d){return Object.assign({},d,{[f.k]:v});});}}
                          style={Object.assign({},inputStyle,{padding:"9px 10px",fontSize:12})}>
                          {f.opts.map(function(o){return<option key={o.v} value={o.v}>{o.l}</option>;})}
                        </select>
                      </div>
                    );
                  })}
                </div>
                <button
                  onClick={function(){
                    if(!newTourn.name)return;
                    var nt={id:"t"+Date.now(),name:newTourn.name,skill:newTourn.skill,size:newTourn.size,status:"enrolling",format:newTourn.format||"league",surface:newTourn.surface||"Hard Court",entrants:[],waitlist:[],startDate:newTourn.startDate,deadlineDays:newTourn.deadlineDays,rounds:[],city:"Sydney"};
                    setTournaments(function(prev){return prev.concat([nt]);});
                    supabase.from('tournaments').insert(nt);
                    setNewTourn({name:"",skill:"Intermediate",size:16,startDate:"",deadlineDays:14,format:"league",surface:"Hard Court"});
                  }}
                  style={{width:"100%",padding:"12px",borderRadius:8,border:"none",background:t.accent,color:"#fff",fontSize:14,fontWeight:600}}>
                  Create Tournament
                </button>
              </div>

              {/* Tournament list */}
              <div style={{display:"flex",flexDirection:"column",gap:8}}>
                {tournaments.map(function(t2){
                  var sc=t2.status==="active"?t.accent:t2.status==="enrolling"?t.orange:t.textTertiary;
                  return(
                    <div key={t2.id} style={{background:t.bgCard,border:"1px solid "+t.border,borderLeft:"3px solid "+sc,borderRadius:10,padding:"14px 16px"}}>
                      <div style={{display:"flex",alignItems:"flex-start",gap:10,marginBottom:6}}>
                        <div style={{flex:1}}>
                          <div style={{fontSize:14,fontWeight:700,color:t.text,marginBottom:2}}>{t2.name}</div>
                          <div style={{fontSize:12,color:t.textSecondary}}>
                            {t2.skill} · {t2.size} players · ${(ENTRY_FEES[t2.size]||45)} · {(t2.entrants||[]).length} enrolled
                          </div>
                          {(t2.waitlist||[]).length>0&&<div style={{fontSize:11,color:t.purple,marginTop:1}}>{(t2.waitlist||[]).length} on waitlist</div>}
                        </div>
                        <select value={t2.status}
                          onChange={function(e){var v=e.target.value,id=t2.id;setTournaments(function(prev){return prev.map(function(x){if(x.id!==id)return x;var n=Object.assign({},x,{status:v});supabase.from('tournaments').upsert(n);return n;});});}}
                          style={{padding:"5px 8px",borderRadius:6,border:"1px solid "+t.border,background:t.inputBg,color:t.text,fontSize:11}}>
                          <option value="enrolling">Enrolling</option>
                          <option value="active">Active</option>
                          <option value="completed">Completed</option>
                        </select>
                      </div>
                      <button
                        onClick={function(){setSelectedTournId(t2.id);setTab("tournaments");setTournDetailTab("overview");}}
                        style={{fontSize:12,color:t.accent,background:"none",border:"none",fontWeight:600,padding:0}}>
                        View →
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {adminTab==="draws"&&(
            <div>
              <p style={{fontSize:13,color:t.textSecondary,marginBottom:16,lineHeight:1.6}}>Generate the draw to start the tournament. This locks enrollment and creates the match schedule.</p>
              {tournaments.filter(function(t2){return t2.status==="enrolling";}).length===0&&(
                <div style={{textAlign:"center",padding:"40px",color:t.textTertiary,fontSize:13}}>No tournaments currently enrolling.</div>
              )}
              <div style={{display:"flex",flexDirection:"column",gap:10}}>
                {tournaments.filter(function(t2){return t2.status==="enrolling";}).map(function(t2){
                  var enough=(t2.entrants||[]).length>=4;
                  var full=(t2.entrants||[]).length>=t2.size;
                  var fillPct2=Math.round((t2.entrants||[]).length/t2.size*100);
                  return(
                    <div key={t2.id} style={{background:t.bgCard,border:"1px solid "+t.border,borderRadius:10,padding:"14px 16px"}}>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
                        <div style={{fontSize:13,fontWeight:700,color:t.text}}>{t2.name}</div>
                        {(t2.entrants||[]).length<t2.size&&(
                          <button
                            onClick={function(){seedTournament(t2.id);}}
                            style={{padding:"5px 12px",borderRadius:7,border:"1px solid "+t.purple+"55",background:t.purpleSubtle,color:t.purple,fontSize:11,fontWeight:700}}>
                            + Seed players
                          </button>
                        )}
                      </div>
                      <div style={{fontSize:12,color:t.textSecondary,marginBottom:10}}>{(t2.entrants||[]).length} of {t2.size} enrolled · {t2.format==="league"?"League":"Elimination"}</div>
                      <div style={{height:3,background:t.bgTertiary,borderRadius:2,overflow:"hidden",marginBottom:10}}>
                        <div style={{height:"100%",width:fillPct2+"%",background:full?t.green:t.accent,borderRadius:2}}/>
                      </div>
                      {(t2.entrants||[]).length>0&&(
                        <div style={{display:"flex",flexWrap:"wrap",gap:5,marginBottom:10}}>
                          {(t2.entrants||[]).map(function(e){
                            return(
                              <div key={e.id} style={{display:"flex",alignItems:"center",gap:4,background:t.bgTertiary,border:"1px solid "+t.border,borderRadius:5,padding:"2px 8px"}}>
                                <PlayerAvatar name={e.name} avatar={e.avatar} size={16}/>
                                <span style={{fontSize:11,color:t.text}}>{e.name.split(" ")[0]}</span>
                              </div>
                            );
                          })}
                        </div>
                      )}
                      <button
                        onClick={function(){if(enough)generateDraw(t2.id);}} disabled={!enough}
                        style={{
                          width:"100%",padding:"10px",borderRadius:8,border:"none",
                          background:enough?t.accent:t.bgTertiary,
                          color:enough?"#fff":t.textTertiary,
                          fontSize:13,fontWeight:600
                        }}>
                        {full?"Generate draw":enough?"Generate draw ("+( t2.entrants||[]).length+" players)":"Need at least 4 entrants"}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {adminTab==="results"&&(
            <div>
              <p style={{fontSize:13,color:t.textSecondary,marginBottom:16,lineHeight:1.6}}>Record results as the umpire. Winners advance automatically.</p>
              {tournaments.filter(function(t2){return t2.status==="active";}).length===0&&(
                <div style={{textAlign:"center",padding:"40px",color:t.textTertiary,fontSize:13}}>No active tournaments.</div>
              )}
              {tournaments.filter(function(t2){return t2.status==="active";}).map(function(t2){
                return(
                  <div key={t2.id} style={{marginBottom:24}}>
                    <div style={{fontSize:13,fontWeight:700,color:t.text,marginBottom:12}}>{t2.name}</div>
                    {(t2.rounds||[]).map(function(r,ri){
                      var pending=(r.matches||[]).filter(function(m){return m.status!=="complete"&&m.p1&&m.p2;});
                      if(!pending.length)return null;
                      return(
                        <div key={ri} style={{marginBottom:12}}>
                          <div style={{fontSize:10,fontWeight:700,color:t.textTertiary,textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:8}}>
                            {r.type==="semi"?"Semifinals":r.type==="final"?"Final":"League Round "+r.round}
                          </div>
                          {pending.map(function(m){
                            return(
                              <div key={m.id} style={{background:t.bgCard,border:"1px solid "+t.border,borderRadius:10,padding:"12px 14px",marginBottom:6}}>
                                <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}>
                                  <PlayerAvatar name={m.p1.name} avatar={m.p1.avatar} size={26}/>
                                  <span style={{fontSize:13,fontWeight:600,color:t.text}}>{m.p1.name}</span>
                                  <span style={{fontSize:11,color:t.textTertiary,margin:"0 4px"}}>vs</span>
                                  <PlayerAvatar name={m.p2.name} avatar={m.p2.avatar} size={26}/>
                                  <span style={{fontSize:13,fontWeight:600,color:t.text}}>{m.p2.name}</span>
                                </div>
                                {m.scheduledDate&&<div style={{fontSize:11,color:t.textTertiary,marginBottom:8}}>{m.scheduledDate} · {m.scheduledTime} · {m.scheduledCourt}</div>}
                                <div style={{display:"flex",gap:8}}>
                                  <button
                                    onClick={function(){recordResult(t2.id,ri,m.id,m.p1.id);}}
                                    style={{flex:1,padding:"9px",borderRadius:8,border:"1px solid "+t.border,background:"transparent",color:t.text,fontSize:12,fontWeight:500}}>
                                    {m.p1.name.split(" ")[0]} wins
                                  </button>
                                  <button
                                    onClick={function(){recordResult(t2.id,ri,m.id,m.p2.id);}}
                                    style={{flex:1,padding:"9px",borderRadius:8,border:"1px solid "+t.border,background:"transparent",color:t.text,fontSize:12,fontWeight:500}}>
                                    {m.p2.name.split(" ")[0]} wins
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── SCHEDULE MODAL ── */}
      {scheduleModal&&(
        <div
          onClick={function(){setScheduleModal(null);}}
          style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.35)",backdropFilter:"blur(8px)",WebkitBackdropFilter:"blur(8px)",display:"flex",alignItems:"flex-end",justifyContent:"center",zIndex:200}}>
          <div
            onClick={function(e){e.stopPropagation();}}
            className="slide-up"
            style={{background:t.modalBg,borderTop:"1px solid "+t.border,borderRadius:"16px 16px 0 0",padding:"24px 22px 48px",width:"100%",maxWidth:540}}>
            <div style={{width:32,height:3,borderRadius:2,background:t.border,margin:"0 auto 20px"}}/>
            <h2 style={{fontSize:18,fontWeight:700,color:t.text,marginBottom:4,letterSpacing:"-0.3px"}}>Schedule Match</h2>
            <p style={{fontSize:12,color:t.textSecondary,marginBottom:20}}>{PILOT_VENUE.name} · Players book own court</p>
            {[{l:"Date",k:"date",type:"date"},{l:"Time",k:"time",type:"text",ph:"e.g. 6:00 PM"},{l:"Court",k:"court",type:"text",ph:"e.g. Court 3"}].map(function(f){
              return(
                <div key={f.k} style={{marginBottom:12}}>
                  <label style={{fontSize:10,fontWeight:700,color:t.textSecondary,display:"block",marginBottom:5,letterSpacing:"0.06em",textTransform:"uppercase"}}>{f.l}</label>
                  <input type={f.type} value={scheduleDraft[f.k]} placeholder={f.ph||""}
                    onChange={function(e){var v=e.target.value;setScheduleDraft(function(d){return Object.assign({},d,{[f.k]:v});});}}
                    style={inputStyle}/>
                </div>
              );
            })}
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16,padding:"9px 0"}}>
              <a href={PILOT_VENUE.url} target="_blank" rel="noopener noreferrer"
                style={{fontSize:12,color:t.accent,fontWeight:600,textDecoration:"none"}}>
                Book at {PILOT_VENUE.name} →
              </a>
              <span style={{fontSize:12,color:t.green}}>New balls provided</span>
            </div>
            <div style={{display:"flex",gap:8}}>
              <button
                onClick={function(){setScheduleModal(null);}}
                style={{flex:1,padding:"12px",borderRadius:8,border:"1px solid "+t.border,background:"transparent",color:t.text,fontSize:13,fontWeight:500}}>
                Cancel
              </button>
              <button
                onClick={function(){scheduleMatch(scheduleModal.tournId,scheduleModal.roundIdx,scheduleModal.matchId,scheduleDraft.date,scheduleDraft.time,scheduleDraft.court);setScheduleModal(null);}}
                style={{flex:2,padding:"12px",borderRadius:8,border:"none",background:t.accent,color:"#fff",fontSize:13,fontWeight:600}}>
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── SCORE MODAL ── */}
      {scoreModal&&(
        <div
          onClick={function(){setScoreModal(null);}}
          style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.35)",backdropFilter:"blur(8px)",WebkitBackdropFilter:"blur(8px)",display:"flex",alignItems:"flex-end",justifyContent:"center",zIndex:200}}>
          <div
            onClick={function(e){e.stopPropagation();}}
            className="slide-up"
            style={{background:t.modalBg,borderTop:"1px solid "+t.border,borderRadius:"16px 16px 0 0",padding:"24px 22px 48px",width:"100%",maxWidth:540,maxHeight:"92vh",overflowY:"auto"}}>
            <div style={{width:32,height:3,borderRadius:2,background:t.border,margin:"0 auto 20px"}}/>
            <h2 style={{fontSize:18,fontWeight:700,color:t.text,marginBottom:16,letterSpacing:"-0.3px"}}>Log Result</h2>
            {scoreModal.casual
              ?<div style={{marginBottom:16}}>
                  <label style={{fontSize:10,fontWeight:700,color:t.textSecondary,display:"block",marginBottom:6,letterSpacing:"0.06em",textTransform:"uppercase"}}>Opponent</label>
                  <div style={{position:"relative"}}>
                    <input value={casualOppName} placeholder="Type a name…"
                      onChange={function(e){setCasualOppName(e.target.value);setShowOppDrop(true);}}
                      onFocus={function(){setShowOppDrop(true);}}
                      onBlur={function(){setTimeout(function(){setShowOppDrop(false);},180);}}
                      style={Object.assign({},inputStyle,{fontSize:14,marginBottom:0})}/>
                    {showOppDrop&&(function(){
                      var q=(casualOppName||"").trim().toLowerCase();
                      var all=friends.concat(suggestedPlayers.filter(function(s){return!friends.some(function(f){return f.id===s.id;});}));
                      var hits=q?all.filter(function(u){return u.name&&u.name.toLowerCase().includes(q);}):friends.slice(0,6);
                      if(!hits.length)return null;
                      return(
                        <div style={{position:"absolute",top:"calc(100% + 4px)",left:0,right:0,background:t.card,border:"1px solid "+t.border,borderRadius:10,boxShadow:"0 8px 28px rgba(0,0,0,0.14)",zIndex:400,overflow:"hidden"}}>
                          {hits.map(function(u){
                            return(
                              <div key={u.id} onMouseDown={function(){setCasualOppName(u.name);setShowOppDrop(false);}}
                                style={{display:"flex",alignItems:"center",gap:10,padding:"10px 14px",cursor:"pointer",borderBottom:"1px solid "+t.border,background:"transparent"}}>
                                <div style={{width:30,height:30,borderRadius:"50%",background:t.accentSubtle,display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,overflow:"hidden",flexShrink:0}}>
                                  {u.avatar?<img src={u.avatar} alt="" style={{width:"100%",height:"100%",objectFit:"cover"}}/>:"🎾"}
                                </div>
                                <div style={{flex:1}}>
                                  <div style={{fontSize:13,fontWeight:600,color:t.text}}>{u.name}</div>
                                  {u.skill&&<div style={{fontSize:11,color:t.textTertiary}}>{u.skill}</div>}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      );
                    })()}
                  </div>
                </div>
              :<p style={{fontSize:12,color:t.textSecondary,marginBottom:16}}>vs {scoreModal.oppName} · {scoreModal.tournName}</p>
            }
            <div style={{marginBottom:16}}>
              <label style={{fontSize:10,fontWeight:700,color:t.textSecondary,display:"block",marginBottom:6,letterSpacing:"0.06em",textTransform:"uppercase"}}>Date</label>
              <input type="date" value={scoreDraft.date}
                onChange={function(e){setScoreDraft(function(d){return Object.assign({},d,{date:e.target.value});});}}
                style={Object.assign({},inputStyle,{fontSize:14,marginBottom:0})}/>
            </div>
            <div style={{marginBottom:16}}>
              <label style={{fontSize:10,fontWeight:700,color:t.textSecondary,display:"block",marginBottom:8,letterSpacing:"0.06em",textTransform:"uppercase"}}>Result</label>
              <div style={{display:"flex",gap:8}}>
                {[{id:"win",l:"Win",c:t.green},{id:"loss",l:"Loss",c:t.red}].map(function(r){
                  var on=scoreDraft.result===r.id;
                  return(
                    <button key={r.id}
                      onClick={function(){setScoreDraft(function(d){return Object.assign({},d,{result:r.id});});}}
                      style={{
                        flex:1,padding:"12px",borderRadius:9,
                        border:"1px solid "+(on?r.c:t.border),
                        background:on?r.c+"18":"transparent",
                        fontSize:15,fontWeight:on?700:400,
                        color:on?r.c:t.textSecondary
                      }}>
                      {r.l}
                    </button>
                  );
                })}
              </div>
            </div>
            <div style={{marginBottom:16}}>
              <div style={{display:"flex",justifyContent:"space-between",marginBottom:8,alignItems:"center"}}>
                <label style={{fontSize:10,fontWeight:700,color:t.textSecondary,letterSpacing:"0.06em",textTransform:"uppercase"}}>Sets</label>
                {scoreDraft.sets.length<5&&(
                  <button
                    onClick={function(){setScoreDraft(function(d){return Object.assign({},d,{sets:d.sets.concat([{you:"",them:""}])});});}}
                    style={{background:"transparent",border:"1px solid "+t.border,borderRadius:6,padding:"3px 10px",fontSize:11,color:t.textSecondary,fontWeight:500}}>
                    + Set
                  </button>
                )}
              </div>
              {scoreDraft.sets.map(function(set,si){
                return(
                  <div key={si} style={{display:"grid",gridTemplateColumns:"60px 1fr 1fr 24px",gap:8,marginBottom:8,alignItems:"center"}}>
                    <span style={{fontSize:12,fontWeight:500,color:t.textSecondary}}>Set {si+1}</span>
                    {["you","them"].map(function(who){
                      return(
                        <input key={who} type="number" min="0" max="7" value={set[who]} placeholder="0"
                          onChange={function(e){var v=e.target.value;setScoreDraft(function(d){var ns=d.sets.map(function(ss,idx){return idx!==si?ss:Object.assign({},ss,{[who]:v});});return Object.assign({},d,{sets:ns});});}}
                          style={{padding:"10px 0",textAlign:"center",borderRadius:8,border:"1px solid "+t.border,background:t.inputBg,color:t.text,fontSize:20,fontWeight:700,width:"100%",fontVariantNumeric:"tabular-nums"}}/>
                      );
                    })}
                    {scoreDraft.sets.length>1
                      ?<button
                          onClick={function(){setScoreDraft(function(d){return Object.assign({},d,{sets:d.sets.filter(function(_,idx){return idx!==si;})});});}}
                          style={{background:"none",border:"none",color:t.textTertiary,fontSize:16,padding:0}}>×</button>
                      :<div/>
                    }
                  </div>
                );
              })}
            </div>
            <div style={{display:"flex",gap:8}}>
              <button
                onClick={function(){setScoreModal(null);}}
                style={{flex:1,padding:"12px",borderRadius:8,border:"1px solid "+t.border,background:"transparent",color:t.text,fontSize:13,fontWeight:500}}>
                Cancel
              </button>
              <button
                onClick={async function(){
                  var clean=scoreDraft.sets.filter(function(s){return s.you!==""||s.them!=="";});
                  var resolvedOpp=scoreModal.casual?(casualOppName.trim()||"Unknown"):scoreModal.oppName;
                  var matchDate=scoreDraft.date||new Date().toISOString().slice(0,10);
                  var localId="local-"+Date.now();
                  var nm={id:localId,oppName:resolvedOpp,tournName:scoreModal.casual?"Casual Match":scoreModal.tournName,date:matchDate,sets:clean,result:scoreDraft.result,notes:""};
                  var newHistory=[nm].concat(history);
                  setHistory(newHistory);
                  if(authUser){
                    var ins=await supabase.from('match_history').insert({
                      opp_name:resolvedOpp,
                      tourn_name:nm.tournName,
                      sets:clean,
                      result:nm.result,
                      notes:"",
                      user_id:authUser.id,
                      match_date:nm.date
                    }).select('id').single();
                    if(ins.error){
                      console.error('match_history insert failed:',ins.error);
                      alert('Save failed: '+ins.error.message+'\nCode: '+ins.error.code);
                    } else {
                      var matchId=ins.data.id;
                      // Replace local temp id with real Supabase id
                      setHistory(function(h){return h.map(function(m){return m.id===localId?Object.assign({},m,{id:matchId}):m;});});
                      // If opponent is a friend, tag them and notify
                      var taggedFriend=friends.find(function(f){return f.name&&f.name.toLowerCase()===resolvedOpp.toLowerCase();});
                      if(taggedFriend){
                        await supabase.from('match_history').update({tagged_user_id:taggedFriend.id}).eq('id',matchId);
                        await supabase.from('notifications').insert({user_id:taggedFriend.id,type:'match_tag',from_user_id:authUser.id,match_id:matchId});
                      }
                      // Only update stats if the row actually saved
                      var newWins=newHistory.filter(function(m){return m.result==="win";}).length;
                      var newLosses=newHistory.length-newWins;
                      var newPts=Math.max(0,1000+newWins*15-newLosses*10);
                      var sc=0,st=null;
                      if(newHistory.length){st=newHistory[0].result;for(var si=0;si<newHistory.length;si++){if(newHistory[si].result===st)sc++;else break;}}
                      await supabase.from('profiles').upsert({id:authUser.id,ranking_points:newPts,wins:newWins,losses:newLosses,matches_played:newHistory.length,streak_count:sc,streak_type:st},{onConflict:'id'});
                      setProfile(function(p){return Object.assign({},p,{ranking_points:newPts,wins:newWins,losses:newLosses,matches_played:newHistory.length,streak_count:sc,streak_type:st});});
                    }
                  }
                  if(scoreModal.winnerId1&&scoreModal.winnerId2){
                    var winnerId=scoreDraft.result==="win"?scoreModal.winnerId1:scoreModal.winnerId2;
                    recordResult(scoreModal.tournId,scoreModal.roundIdx,scoreModal.matchId,winnerId);
                  }
                  setScoreModal(null);setCasualOppName("");
                }}
                style={{flex:2,padding:"12px",borderRadius:8,border:"none",background:t.accent,color:"#fff",fontSize:13,fontWeight:600}}>
                Save result
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── COMMENT MODAL ── */}
      {commentModal&&(
        <div
          onClick={function(){setCommentModal(null);}}
          style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.4)",backdropFilter:"blur(10px)",WebkitBackdropFilter:"blur(10px)",display:"flex",alignItems:"flex-end",justifyContent:"center",zIndex:250}}>
          <div
            onClick={function(e){e.stopPropagation();}}
            className="slide-up"
            style={{background:t.modalBg,borderTop:"1px solid "+t.border,borderRadius:"16px 16px 0 0",padding:"20px 20px 48px",width:"100%",maxWidth:540,maxHeight:"70vh",display:"flex",flexDirection:"column"}}>
            <div style={{width:32,height:3,borderRadius:2,background:t.border,margin:"0 auto 16px"}}/>
            <div style={{fontSize:14,fontWeight:700,color:t.text,marginBottom:16}}>Comments</div>
            {/* Comment list */}
            <div style={{flex:1,overflowY:"auto",marginBottom:16,display:"flex",flexDirection:"column",gap:12}}>
              {(feedComments[commentModal]||[]).length===0
                ?<div style={{textAlign:"center",padding:"24px 0"}}>
                  <div style={{fontSize:13,color:t.textTertiary}}>No comments yet. Be first.</div>
                </div>
                :(feedComments[commentModal]||[]).map(function(c){
                  return(
                    <div key={c.id} style={{display:"flex",gap:10,alignItems:"flex-start"}}>
                      <div style={{width:32,height:32,borderRadius:"50%",background:avColor(c.author),display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,fontWeight:700,color:"#fff",flexShrink:0}}>{c.author.slice(0,2).toUpperCase()}</div>
                      <div style={{flex:1,background:t.bgTertiary,borderRadius:10,padding:"8px 12px"}}>
                        <div style={{fontSize:12,fontWeight:700,color:t.text,marginBottom:2}}>{c.author}</div>
                        <div style={{fontSize:13,color:t.textSecondary,lineHeight:1.4}}>{c.text}</div>
                      </div>
                    </div>
                  );
                })
              }
            </div>
            {/* Comment input */}
            <div style={{display:"flex",gap:10,alignItems:"center"}}>
              <div style={{width:32,height:32,borderRadius:"50%",background:avColor(profile.name),display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,fontWeight:700,color:"#fff",flexShrink:0}}>{profile.avatar}</div>
              <input
                value={commentDraft}
                placeholder="Add a comment…"
                onChange={function(e){setCommentDraft(e.target.value);}}
                onKeyDown={function(e){if(e.key==="Enter")document.getElementById("comment-post-btn").click();}}
                style={Object.assign({},inputStyle,{flex:1,fontSize:13,padding:"9px 14px"})}/>
              <button
                id="comment-post-btn"
                onClick={async function(){
                  if(!commentDraft.trim()||!authUser)return;
                  var text=commentDraft.trim();
                  setCommentDraft("");
                  // Optimistic update
                  var tempId="c"+Date.now();
                  var c={id:tempId,author:profile.name,avatar:profile.avatar,text:text,ts:Date.now()};
                  setFeedComments(function(fc){var cur=fc[commentModal]||[];return Object.assign({},fc,{[commentModal]:cur.concat([c])});});
                  // Persist to Supabase
                  var res=await supabase.from('feed_comments').insert({match_id:commentModal,user_id:authUser.id,body:text}).select('id').single();
                  // Replace temp id with real id
                  if(res.data){
                    setFeedComments(function(fc){
                      var cur=(fc[commentModal]||[]).map(function(x){return x.id===tempId?Object.assign({},x,{id:res.data.id}):x;});
                      return Object.assign({},fc,{[commentModal]:cur});
                    });
                  }
                }}
                style={{padding:"9px 16px",borderRadius:8,border:"none",background:t.accent,color:"#fff",fontSize:13,fontWeight:600,flexShrink:0}}>
                Post
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── AUTH MODAL ── */}
      {showAuth&&(
        <div
          onClick={function(){if(authStep==="set-password")return;setShowAuth(false);setAuthError("");setAuthFieldErrors({});setAuthStep("choose");}}
          style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.4)",backdropFilter:"blur(10px)",WebkitBackdropFilter:"blur(10px)",display:"flex",alignItems:"flex-end",justifyContent:"center",zIndex:300}}>
          <div
            onClick={function(e){e.stopPropagation();}}
            className="slide-up"
            style={{background:t.modalBg,borderTop:"1px solid "+t.border,borderRadius:"16px 16px 0 0",padding:"28px 24px 48px",width:"100%",maxWidth:480}}>
            <div style={{width:32,height:3,borderRadius:2,background:t.border,margin:"0 auto 24px"}}/>

            {/* Header — hidden on forgot-sent */}
            {authStep!=="forgot-sent"&&authStep!=="set-password"&&(
              <div style={{marginBottom:24}}>
                <div style={{width:36,height:36,borderRadius:9,background:t.accent,display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,fontWeight:800,color:"#fff",marginBottom:12}}>CS</div>
                <h2 style={{fontSize:22,fontWeight:700,color:t.text,marginBottom:4,letterSpacing:"-0.4px"}}>
                  {authStep==="forgot"?"Reset password":authMode==="signup"?"Create account":"Welcome back"}
                </h2>
                <p style={{fontSize:13,color:t.textSecondary}}>
                  {authStep==="forgot"?"We'll send a reset link to your email.":"Enter tournaments. Compete for prizes."}
                </p>
              </div>
            )}

            {/* ── CHOOSE ── */}
            {authStep==="choose"&&(
              <div style={{display:"flex",flexDirection:"column",gap:10}}>
                <button
                  onClick={function(){setAuthStep("email");setAuthError("");setAuthFieldErrors({});}}
                  style={{width:"100%",padding:"14px",borderRadius:9,border:"1px solid "+t.border,background:"transparent",color:t.text,fontSize:14,fontWeight:500}}>
                  Continue with Email
                </button>
                <p style={{textAlign:"center",fontSize:13,color:t.textSecondary,marginTop:4}}>
                  {authMode==="login"?"No account? ":"Have an account? "}
                  <button
                    onClick={function(){setAuthMode(authMode==="login"?"signup":"login");setAuthError("");setAuthFieldErrors({});}}
                    style={{background:"none",border:"none",color:t.accent,fontWeight:600,fontSize:13}}>
                    {authMode==="login"?"Sign up":"Log in"}
                  </button>
                </p>
              </div>
            )}

            {/* ── EMAIL FORM ── */}
            {authStep==="email"&&(
              <div className="fade-up">
                {authMode==="signup"&&(
                  <div style={{marginBottom:12}}>
                    <label style={{fontSize:10,fontWeight:700,color:t.textSecondary,display:"block",marginBottom:5,letterSpacing:"0.06em",textTransform:"uppercase"}}>Full name</label>
                    <input value={authName} placeholder="Your name"
                      onChange={function(e){setAuthName(e.target.value);setAuthFieldErrors(function(f){return Object.assign({},f,{name:null});});}}
                      style={Object.assign({},inputStyle,{borderColor:authFieldErrors.name?t.red:t.border})}/>
                    {authFieldErrors.name&&<div style={{fontSize:11,color:t.red,marginTop:4}}>{authFieldErrors.name}</div>}
                  </div>
                )}
                <div style={{marginBottom:12}}>
                  <label style={{fontSize:10,fontWeight:700,color:t.textSecondary,display:"block",marginBottom:5,letterSpacing:"0.06em",textTransform:"uppercase"}}>Email</label>
                  <input type="email" value={authEmail} placeholder="you@example.com"
                    onChange={function(e){setAuthEmail(e.target.value);setAuthFieldErrors(function(f){return Object.assign({},f,{email:null});});}}
                    style={Object.assign({},inputStyle,{borderColor:authFieldErrors.email?t.red:t.border})}/>
                  {authFieldErrors.email&&<div style={{fontSize:11,color:t.red,marginTop:4}}>{authFieldErrors.email}</div>}
                </div>
                <div style={{marginBottom:6}}>
                  <label style={{fontSize:10,fontWeight:700,color:t.textSecondary,display:"block",marginBottom:5,letterSpacing:"0.06em",textTransform:"uppercase"}}>Password</label>
                  <input type="password" value={authPassword}
                    placeholder={authMode==="signup"?"Min 6 characters":"Your password"}
                    onChange={function(e){setAuthPassword(e.target.value);setAuthFieldErrors(function(f){return Object.assign({},f,{password:null});});}}
                    style={Object.assign({},inputStyle,{borderColor:authFieldErrors.password?t.red:t.border})}/>
                  {authFieldErrors.password&&<div style={{fontSize:11,color:t.red,marginTop:4}}>{authFieldErrors.password}</div>}
                </div>
                {authMode==="login"&&(
                  <div style={{textAlign:"right",marginBottom:18}}>
                    <button
                      onClick={function(){setAuthStep("forgot");setAuthError("");setAuthFieldErrors({});}}
                      style={{background:"none",border:"none",color:t.accent,fontSize:12,fontWeight:500}}>
                      Forgot password?
                    </button>
                  </div>
                )}
                {authMode==="signup"&&<div style={{height:18}}/>}
                {authError&&<div style={{fontSize:12,color:t.red,marginBottom:12,padding:"10px 12px",background:t.redSubtle,border:"1px solid "+t.red+"33",borderRadius:7}}>{authError}</div>}
                <button
                  disabled={authLoading}
                  onClick={async function(){
                    // Field-level validation
                    var fe={};
                    if(authMode==="signup"&&!authName.trim())fe.name="Please enter your name.";
                    if(!authEmail.trim())fe.email="Email is required.";
                    else if(!validateEmail(authEmail))fe.email="Please enter a valid email address.";
                    if(!authPassword)fe.password="Password is required.";
                    else if(authMode==="signup"&&!validatePassword(authPassword))fe.password="Password must be at least 6 characters.";
                    if(Object.keys(fe).length){setAuthFieldErrors(fe);return;}
                    setAuthLoading(true);setAuthError("");setAuthFieldErrors({});
                    var r=authMode==="signup"
                      ?await supabase.auth.signUp({email:authEmail.trim(),password:authPassword,options:{data:{name:authName.trim()}}})
                      :await supabase.auth.signInWithPassword({email:authEmail.trim(),password:authPassword});
                    setAuthLoading(false);
                    if(r.error){setAuthError(mapAuthError(r.error.message));return;}
                    setShowAuth(false);setAuthStep("choose");setAuthEmail("");setAuthPassword("");setAuthName("");setAuthError("");setAuthFieldErrors({});
                  }}
                  style={{width:"100%",padding:"14px",borderRadius:9,border:"none",background:t.accent,color:"#fff",fontSize:14,fontWeight:600,opacity:authLoading?0.65:1}}>
                  {authLoading?"Please wait…":authMode==="signup"?"Create account":"Log in"}
                </button>
                <button
                  onClick={function(){setAuthStep("choose");setAuthError("");setAuthFieldErrors({});}}
                  style={{width:"100%",marginTop:8,padding:"10px",background:"none",border:"none",color:t.textSecondary,fontSize:12}}>
                  Back
                </button>
              </div>
            )}

            {/* ── FORGOT PASSWORD ── */}
            {authStep==="forgot"&&(
              <div className="fade-up">
                <div style={{marginBottom:12}}>
                  <label style={{fontSize:10,fontWeight:700,color:t.textSecondary,display:"block",marginBottom:5,letterSpacing:"0.06em",textTransform:"uppercase"}}>Email</label>
                  <input type="email" value={authEmail} placeholder="you@example.com"
                    onChange={function(e){setAuthEmail(e.target.value);setAuthError("");}}
                    style={Object.assign({},inputStyle,{borderColor:authError?t.red:t.border})}/>
                </div>
                {authError&&<div style={{fontSize:12,color:t.red,marginBottom:12,padding:"10px 12px",background:t.redSubtle,border:"1px solid "+t.red+"33",borderRadius:7}}>{authError}</div>}
                <button
                  disabled={authLoading}
                  onClick={async function(){
                    if(!authEmail.trim()||!validateEmail(authEmail)){setAuthError("Please enter a valid email address.");return;}
                    setAuthLoading(true);setAuthError("");
                    var r=await supabase.auth.resetPasswordForEmail(authEmail.trim(),{redirectTo:window.location.origin});
                    setAuthLoading(false);
                    if(r.error){setAuthError(mapAuthError(r.error.message));return;}
                    setAuthStep("forgot-sent");
                  }}
                  style={{width:"100%",padding:"14px",borderRadius:9,border:"none",background:t.accent,color:"#fff",fontSize:14,fontWeight:600,opacity:authLoading?0.65:1,marginBottom:8}}>
                  {authLoading?"Sending…":"Send reset link"}
                </button>
                <button
                  onClick={function(){setAuthStep("email");setAuthError("");}}
                  style={{width:"100%",padding:"10px",background:"none",border:"none",color:t.textSecondary,fontSize:12}}>
                  Back to login
                </button>
              </div>
            )}

            {/* ── FORGOT SENT ── */}
            {authStep==="forgot-sent"&&(
              <div className="fade-up" style={{textAlign:"center",padding:"12px 0 8px"}}>
                <div style={{width:52,height:52,borderRadius:"50%",background:t.greenSubtle,border:"1px solid "+t.green+"44",display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 16px",fontSize:22}}>✓</div>
                <h2 style={{fontSize:20,fontWeight:700,color:t.text,marginBottom:8,letterSpacing:"-0.3px"}}>Check your email</h2>
                <p style={{fontSize:14,color:t.textSecondary,lineHeight:1.6,marginBottom:24}}>
                  We sent a reset link to <strong style={{color:t.text}}>{authEmail}</strong>. Check your inbox and follow the link.
                </p>
                <button
                  onClick={function(){setShowAuth(false);setAuthStep("choose");setAuthEmail("");setAuthError("");}}
                  style={{width:"100%",padding:"14px",borderRadius:9,border:"none",background:t.accent,color:"#fff",fontSize:14,fontWeight:600}}>
                  Done
                </button>
              </div>
            )}

            {/* ── SET NEW PASSWORD (recovery flow) ── */}
            {authStep==="set-password"&&(
              <div className="fade-up">
                <div style={{width:36,height:36,borderRadius:9,background:t.accent,display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,fontWeight:800,color:"#fff",marginBottom:12}}>CS</div>
                <h2 style={{fontSize:22,fontWeight:700,color:t.text,marginBottom:4,letterSpacing:"-0.4px"}}>Set new password</h2>
                <p style={{fontSize:13,color:t.textSecondary,marginBottom:24}}>Choose a new password for your account.</p>
                <div style={{marginBottom:12}}>
                  <label style={{fontSize:10,fontWeight:700,color:t.textSecondary,display:"block",marginBottom:5,letterSpacing:"0.06em",textTransform:"uppercase"}}>New password</label>
                  <input type="password" value={authNewPassword} placeholder="Min 6 characters"
                    onChange={function(e){setAuthNewPassword(e.target.value);setAuthFieldErrors(function(f){return Object.assign({},f,{np:null});});}}
                    style={Object.assign({},inputStyle,{borderColor:authFieldErrors.np?t.red:t.border})}/>
                  {authFieldErrors.np&&<div style={{fontSize:11,color:t.red,marginTop:4}}>{authFieldErrors.np}</div>}
                </div>
                <div style={{marginBottom:20}}>
                  <label style={{fontSize:10,fontWeight:700,color:t.textSecondary,display:"block",marginBottom:5,letterSpacing:"0.06em",textTransform:"uppercase"}}>Confirm password</label>
                  <input type="password" value={authNewPassword2} placeholder="Repeat password"
                    onChange={function(e){setAuthNewPassword2(e.target.value);setAuthFieldErrors(function(f){return Object.assign({},f,{np2:null});});}}
                    style={Object.assign({},inputStyle,{borderColor:authFieldErrors.np2?t.red:t.border})}/>
                  {authFieldErrors.np2&&<div style={{fontSize:11,color:t.red,marginTop:4}}>{authFieldErrors.np2}</div>}
                </div>
                {authError&&<div style={{fontSize:12,color:t.red,marginBottom:12,padding:"10px 12px",background:t.redSubtle,border:"1px solid "+t.red+"33",borderRadius:7}}>{authError}</div>}
                <button
                  disabled={authLoading}
                  onClick={async function(){
                    var fe={};
                    if(!authNewPassword||authNewPassword.length<6)fe.np="Password must be at least 6 characters.";
                    if(authNewPassword!==authNewPassword2)fe.np2="Passwords don't match.";
                    if(Object.keys(fe).length){setAuthFieldErrors(fe);return;}
                    setAuthLoading(true);setAuthError("");
                    var r=await supabase.auth.updateUser({password:authNewPassword});
                    setAuthLoading(false);
                    if(r.error){setAuthError(mapAuthError(r.error.message));return;}
                    setShowAuth(false);setAuthStep("choose");setAuthNewPassword("");setAuthNewPassword2("");setAuthError("");setAuthFieldErrors({});
                  }}
                  style={{width:"100%",padding:"14px",borderRadius:9,border:"none",background:t.accent,color:"#fff",fontSize:14,fontWeight:600,opacity:authLoading?0.65:1}}>
                  {authLoading?"Updating…":"Update password"}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── ONBOARDING MODAL ── */}
      {showOnboarding&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",backdropFilter:"blur(12px)",WebkitBackdropFilter:"blur(12px)",display:"flex",alignItems:"flex-end",justifyContent:"center",zIndex:400}}>
          <div className="slide-up" style={{background:t.modalBg,borderTop:"1px solid "+t.border,borderRadius:"16px 16px 0 0",padding:"28px 24px 48px",width:"100%",maxWidth:480}}>
            <div style={{width:32,height:3,borderRadius:2,background:t.border,margin:"0 auto 28px"}}/>

            {/* Step indicator */}
            <div style={{display:"flex",gap:6,justifyContent:"center",marginBottom:24}}>
              {[1,2].map(function(s){
                return<div key={s} style={{width:s===onboardStep?20:6,height:6,borderRadius:3,background:s===onboardStep?t.accent:t.border,transition:"width 0.2s ease"}}/>;
              })}
            </div>

            {onboardStep===1&&(
              <div className="fade-up">
                <h2 style={{fontSize:22,fontWeight:700,color:t.text,marginBottom:6,letterSpacing:"-0.4px"}}>Your game, your way.</h2>
                <p style={{fontSize:13,color:t.textSecondary,marginBottom:24,lineHeight:1.6}}>Tell us your level and style so we can match you to the right tournaments.</p>

                <div style={{marginBottom:20}}>
                  <label style={{fontSize:10,fontWeight:700,color:t.textSecondary,display:"block",marginBottom:8,letterSpacing:"0.06em",textTransform:"uppercase"}}>Skill level</label>
                  <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                    {SKILL_LEVELS.map(function(s){
                      var on=onboardDraft.skill===s;
                      return(
                        <button key={s} onClick={function(){setOnboardDraft(function(d){return Object.assign({},d,{skill:s});});}}
                          style={{padding:"9px 16px",borderRadius:8,border:"1px solid "+(on?t.accent:t.border),background:on?t.accentSubtle:"transparent",color:on?t.accent:t.textSecondary,fontSize:13,fontWeight:on?600:400}}>
                          {s}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div style={{marginBottom:28}}>
                  <label style={{fontSize:10,fontWeight:700,color:t.textSecondary,display:"block",marginBottom:8,letterSpacing:"0.06em",textTransform:"uppercase"}}>Play style</label>
                  <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                    {PLAY_STYLES.map(function(s){
                      var on=onboardDraft.style===s;
                      return(
                        <button key={s} onClick={function(){setOnboardDraft(function(d){return Object.assign({},d,{style:s});});}}
                          style={{padding:"9px 16px",borderRadius:8,border:"1px solid "+(on?t.accent:t.border),background:on?t.accentSubtle:"transparent",color:on?t.accent:t.textSecondary,fontSize:13,fontWeight:on?600:400}}>
                          {s}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <button
                  onClick={function(){setOnboardStep(2);}}
                  style={{width:"100%",padding:"14px",borderRadius:9,border:"none",background:t.accent,color:"#fff",fontSize:14,fontWeight:600}}>
                  Next →
                </button>
              </div>
            )}

            {onboardStep===2&&(
              <div className="fade-up">
                <h2 style={{fontSize:22,fontWeight:700,color:t.text,marginBottom:6,letterSpacing:"-0.4px"}}>Where do you play?</h2>
                <p style={{fontSize:13,color:t.textSecondary,marginBottom:24,lineHeight:1.6}}>Helps us surface local tournaments near you.</p>

                <div style={{marginBottom:16}}>
                  <label style={{fontSize:10,fontWeight:700,color:t.textSecondary,display:"block",marginBottom:5,letterSpacing:"0.06em",textTransform:"uppercase"}}>Suburb</label>
                  <input value={onboardDraft.suburb} placeholder="e.g. Bondi, Newtown, Parramatta"
                    onChange={function(e){var v=e.target.value;setOnboardDraft(function(d){return Object.assign({},d,{suburb:v});});}}
                    style={inputStyle}/>
                </div>

                <div style={{marginBottom:28}}>
                  <label style={{fontSize:10,fontWeight:700,color:t.textSecondary,display:"block",marginBottom:5,letterSpacing:"0.06em",textTransform:"uppercase"}}>Short bio <span style={{color:t.textTertiary,fontWeight:400,textTransform:"none"}}>(optional)</span></label>
                  <input value={onboardDraft.bio||""} placeholder="e.g. Weekend warrior, ex-uni player…"
                    onChange={function(e){var v=e.target.value;setOnboardDraft(function(d){return Object.assign({},d,{bio:v});});}}
                    style={inputStyle}/>
                </div>

                <button
                  onClick={async function(){
                    var updated=Object.assign({},profile,{skill:onboardDraft.skill,style:onboardDraft.style,suburb:onboardDraft.suburb||"Sydney",bio:onboardDraft.bio||""});
                    setProfile(updated);
                    setProfileDraft(updated);
                    if(authUser){
                      var res=await supabase.from('profiles').upsert({
                        id:authUser.id,
                        name:updated.name||"",
                        suburb:updated.suburb||"",
                        bio:updated.bio||"",
                        skill:updated.skill||"Intermediate",
                        style:updated.style||"All-Court",
                        avatar:updated.avatar||""
                      },{onConflict:'id'});
                      if(res.error)console.error('Onboarding save error:',res.error);
                    }
                    setShowOnboarding(false);
                  }}
                  style={{width:"100%",padding:"14px",borderRadius:9,border:"none",background:t.accent,color:"#fff",fontSize:14,fontWeight:600,marginBottom:8}}>
                  Get started
                </button>
                <button
                  onClick={function(){setOnboardStep(1);}}
                  style={{width:"100%",padding:"10px",background:"none",border:"none",color:t.textSecondary,fontSize:12}}>
                  Back
                </button>
              </div>
            )}
          </div>
        </div>
      )}

    </div>
  );
}
