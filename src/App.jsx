import { useState, useEffect } from "react";
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
const AV_COLORS    = ["#0071e3","#34c759","#ff9500","#ff3b30","#5856d6","#af52de","#ff2d55"];

function makeTheme(dark) {
  if (dark) return {
    bg:"#080f1c", bgCard:"#0d1a2e", bgTertiary:"#121f35", surfaceSolid:"#0d1a2e",
    border:"rgba(255,255,255,0.07)", borderStrong:"rgba(255,255,255,0.14)",
    text:"#e8f0ff", textSecondary:"#7a9cc4", textTertiary:"#304d70",
    accent:"#4d8ff7", accentText:"#fff", accentSubtle:"rgba(77,143,247,0.10)",
    green:"#32d74b", greenSubtle:"rgba(50,215,75,0.10)",
    red:"#ff453a", redSubtle:"rgba(255,69,58,0.10)",
    orange:"#ff9f0a", orangeSubtle:"rgba(255,159,10,0.10)",
    gold:"#ffd60a", goldSubtle:"rgba(255,214,10,0.12)",
    purple:"#bf5af2", purpleSubtle:"rgba(191,90,242,0.10)",
    inputBg:"#121f35", modalBg:"#0d1a2e",
    navBg:"rgba(8,15,28,0.94)", tabBar:"rgba(8,15,28,0.97)",
    qualified:"rgba(50,215,75,0.06)"
  };
  return {
    bg:"#f2f5fb", bgCard:"#ffffff", bgTertiary:"#e6ecf5", surfaceSolid:"#ffffff",
    border:"rgba(0,0,0,0.07)", borderStrong:"rgba(0,0,0,0.14)",
    text:"#0c1824", textSecondary:"#486280", textTertiary:"#9ab4cc",
    accent:"#1a6fe8", accentText:"#fff", accentSubtle:"rgba(26,111,232,0.08)",
    green:"#1c9e3e", greenSubtle:"rgba(28,158,62,0.08)",
    red:"#d32b1e", redSubtle:"rgba(211,43,30,0.08)",
    orange:"#d96800", orangeSubtle:"rgba(217,104,0,0.08)",
    gold:"#b8860b", goldSubtle:"rgba(184,134,11,0.10)",
    purple:"#7c3aed", purpleSubtle:"rgba(124,58,237,0.08)",
    inputBg:"#f2f5fb", modalBg:"#ffffff",
    navBg:"rgba(242,245,251,0.94)", tabBar:"rgba(242,245,251,0.97)",
    qualified:"rgba(28,158,62,0.05)"
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

function PlayerAvatar(props){
  var name=props.name,avatar=props.avatar,size=props.size||36;
  return(
    <div style={{width:size,height:size,borderRadius:"50%",flexShrink:0,
      background:avColor(name),display:"flex",alignItems:"center",
      justifyContent:"center",fontSize:Math.round(size*0.3),fontWeight:700,color:"#fff"}}>
      {avatar||initials(name)}
    </div>
  );
}

function Pill(props){
  var label=props.label,color=props.color,bg=props.bg;
  return(
    <span style={{display:"inline-flex",alignItems:"center",
      fontSize:11,fontWeight:700,color:color,
      background:bg||color+"1a",border:"1px solid "+color+"44",
      borderRadius:6,padding:"2px 8px",whiteSpace:"nowrap"}}>
      {label}
    </span>
  );
}

function FormatExplainer(props){
  var t=props.t;
  var steps=[
    {n:"5",title:"League",sub:"Matches each"},
    {n:"4",title:"Top 4",sub:"Qualify"},
    {n:"2",title:"Semis",sub:"1v4 · 2v3"},
    {n:"1",title:"Final",sub:"Champion"},
  ];
  return(
    <div style={{display:"flex",gap:6,overflowX:"auto",paddingBottom:2}}>
      {steps.map(function(s,i){
        return(
          <div key={i} style={{display:"flex",alignItems:"center",gap:6,flexShrink:0}}>
            <div style={{textAlign:"center",background:t.bgTertiary,border:"1px solid "+t.border,borderRadius:12,padding:"10px 12px",minWidth:72}}>
              <div style={{fontSize:20,fontWeight:800,color:t.accent,lineHeight:1}}>{s.n}</div>
              <div style={{fontSize:11,fontWeight:700,color:t.text,marginTop:3}}>{s.title}</div>
              <div style={{fontSize:10,color:t.textSecondary,marginTop:1}}>{s.sub}</div>
            </div>
            {i<steps.length-1&&<div style={{fontSize:12,color:t.textTertiary}}>→</div>}
          </div>
        );
      })}
    </div>
  );
}

function StandingsTable(props){
  var tournament=props.tournament,myId=props.myId,t=props.t;
  var rows=computeStandings(tournament);
  var qZone=Math.min(4,rows.length);
  var rankColors={1:t.gold,2:t.textSecondary,3:t.orange};
  if(!rows.length)return(
    <div style={{textAlign:"center",padding:"32px 0",color:t.textTertiary,fontSize:13}}>No matches played yet.</div>
  );
  return(
    <div>
      <div style={{background:t.bgCard,border:"1px solid "+t.border,borderRadius:16,overflow:"hidden"}}>
        <div style={{display:"grid",gridTemplateColumns:"28px 1fr 32px 32px 32px 40px",gap:6,padding:"8px 14px",background:t.bgTertiary,borderBottom:"1px solid "+t.border}}>
          {["#","Player","P","W","L","Pts"].map(function(h,hi){
            return<div key={h} style={{fontSize:10,fontWeight:700,color:t.textTertiary,textAlign:hi>1?"right":"left"}}>{h}</div>;
          })}
        </div>
        {rows.map(function(p,i){
          var rank=i+1,qualified=rank<=qZone,isMe=p.id===myId;
          return(
            <div key={p.id} style={{display:"grid",gridTemplateColumns:"28px 1fr 32px 32px 32px 40px",gap:6,
              padding:"10px 14px",borderBottom:i<rows.length-1?"1px solid "+t.border:"none",
              background:isMe?t.accentSubtle:qualified?t.qualified:"transparent"}}>
              <div style={{display:"flex",alignItems:"center",justifyContent:"center"}}>
                <span style={{fontSize:12,fontWeight:800,color:rankColors[rank]||t.textTertiary}}>{rank}</span>
              </div>
              <div style={{display:"flex",alignItems:"center",gap:7,minWidth:0}}>
                <PlayerAvatar name={p.name} avatar={p.avatar} size={24}/>
                <div style={{minWidth:0}}>
                  <div style={{fontSize:12,fontWeight:isMe?700:500,color:isMe?t.accent:t.text,
                    whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>
                    {p.name.split(" ")[0]}{isMe?" (you)":""}
                  </div>
                  {qualified&&<div style={{fontSize:9,color:t.green,fontWeight:700,letterSpacing:0.3}}>QUALIFIED</div>}
                </div>
              </div>
              {[p.played,p.won,p.lost].map(function(v,vi){
                return<div key={vi} style={{textAlign:"right",fontSize:12,color:t.textSecondary}}>{v}</div>;
              })}
              <div style={{textAlign:"right",fontSize:14,fontWeight:700,color:t.accent}}>{p.pts}</div>
            </div>
          );
        })}
      </div>
      <div style={{display:"flex",alignItems:"center",gap:6,marginTop:8,paddingLeft:2}}>
        <div style={{width:10,height:10,borderRadius:2,background:t.green+"44",border:"1px solid "+t.green+"66"}}/>
        <span style={{fontSize:11,color:t.textSecondary}}>Top {qZone} qualify for semifinals</span>
      </div>
    </div>
  );
}

function BracketView(props){
  var tournament=props.tournament,myId=props.myId,t=props.t;
  var isLeague=tournament.format==="league";
  var rounds=tournament.rounds||[];

  if(!isLeague){
    return(
      <div>
        {rounds.map(function(r,ri){
          return(
            <div key={ri} style={{marginBottom:20}}>
              <div style={{fontSize:12,fontWeight:700,color:t.accent,marginBottom:8}}>{roundLabel(r.round,tournament.size)}</div>
              <div style={{display:"flex",flexDirection:"column",gap:8}}>
                {(r.matches||[]).map(function(m){
                  var isMyMatch=(m.p1&&m.p1.id===myId)||(m.p2&&m.p2.id===myId);
                  return(
                    <div key={m.id} style={{background:t.bgCard,border:"1px solid "+(isMyMatch?t.accent+"55":t.border),borderRadius:12,overflow:"hidden"}}>
                      {[m.p1,m.p2].map(function(player,pi){
                        if(!player)return<div key={pi} style={{padding:"10px 14px",color:t.textTertiary,fontSize:12,fontStyle:"italic",borderBottom:pi===0?"1px solid "+t.border:"none"}}>TBD</div>;
                        var isWinner=m.winner===player.id,isLoser=m.winner&&!isWinner;
                        return(
                          <div key={pi} style={{padding:"10px 14px",display:"flex",alignItems:"center",gap:10,
                            borderBottom:pi===0?"1px solid "+t.border:"none",
                            opacity:isLoser?0.38:1,background:isWinner?t.greenSubtle:"transparent"}}>
                            <PlayerAvatar name={player.name} avatar={player.avatar} size={28}/>
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
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:12}}>
        {sfPairs.map(function(semi,si){
          return(
            <div key={si} style={{background:t.bgCard,border:"1px solid "+t.border,borderRadius:14,overflow:"hidden"}}>
              <div style={{padding:"6px 10px",background:t.bgTertiary,borderBottom:"1px solid "+t.border}}>
                <div style={{fontSize:9,fontWeight:700,color:t.textTertiary,textTransform:"uppercase",letterSpacing:0.5}}>{semi.label}</div>
              </div>
              {[semi.p1,semi.p2].map(function(player,pi){
                var isWinner=semi.match&&semi.match.winner&&player&&player.id===semi.match.winner;
                var isLoser=semi.match&&semi.match.winner&&player&&!isWinner;
                return(
                  <div key={pi} style={{padding:"9px 10px",display:"flex",alignItems:"center",gap:7,
                    borderBottom:pi===0?"1px solid "+t.border:"none",
                    opacity:isLoser?0.4:1,background:isWinner?t.greenSubtle:"transparent"}}>
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
      <div style={{background:"linear-gradient(135deg,#1a2a4a 0%,#0d1f38 100%)",border:"1px solid rgba(255,214,10,0.25)",borderRadius:14,overflow:"hidden"}}>
        <div style={{padding:"7px 14px",borderBottom:"1px solid rgba(255,214,10,0.15)",background:"rgba(255,214,10,0.06)"}}>
          <div style={{fontSize:10,fontWeight:700,color:"#ffd60a",textTransform:"uppercase",letterSpacing:0.8}}>Final</div>
        </div>
        {[0,1].map(function(pi){
          var player=finalMatch?(pi===0?finalMatch.p1:finalMatch.p2):null;
          var isWinner=finalMatch&&finalMatch.winner&&player&&player.id===finalMatch.winner;
          var isLoser=finalMatch&&finalMatch.winner&&player&&!isWinner;
          return(
            <div key={pi} style={{padding:"11px 14px",display:"flex",alignItems:"center",gap:10,
              borderBottom:pi===0?"1px solid rgba(255,255,255,0.07)":"none",opacity:isLoser?0.4:1}}>
              {player?(
                <>
                  <PlayerAvatar name={player.name} avatar={player.avatar} size={28}/>
                  <span style={{fontSize:13,fontWeight:isWinner?800:400,color:isWinner?"#ffd60a":"rgba(255,255,255,0.75)",flex:1}}>
                    {player.name}{player.id===myId?" (you)":""}
                  </span>
                  {isWinner&&<span style={{fontSize:18}}>🏆</span>}
                </>
              ):(
                <span style={{fontSize:12,color:"rgba(255,255,255,0.35)",fontStyle:"italic"}}>Winner of SF{pi+1}</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function App() {
  var [dark,setDark]=useState(true);
  var t=makeTheme(dark);

  useEffect(function(){
    var el=document.createElement("style");
    el.id="cs-css";
    el.textContent=[
      "*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}",
      "html,body{height:100%}",
      "body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;-webkit-font-smoothing:antialiased}",
      "@keyframes fadeUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}",
      "@keyframes pop{0%{transform:scale(.94);opacity:0}100%{transform:scale(1);opacity:1}}",
      "@keyframes slideUp{from{transform:translateY(100%);opacity:0}to{transform:translateY(0);opacity:1}}",
      "@keyframes glow{0%,100%{box-shadow:0 0 12px rgba(255,214,10,.3)}50%{box-shadow:0 0 28px rgba(255,214,10,.7)}}",
      ".fade-up{animation:fadeUp .3s ease both}",
      ".pop{animation:pop .22s cubic-bezier(.34,1.56,.64,1) both}",
      ".slide-up{animation:slideUp .3s ease both}",
      ".glow{animation:glow 2s ease-in-out infinite}",
      "button{cursor:pointer;font-family:inherit}",
      "::-webkit-scrollbar{width:0;height:0}",
      "input,select,textarea{font-family:inherit}",
    ].join("");
    document.head.appendChild(el);
    return function(){var o=document.getElementById("cs-css");if(o)o.remove();};
  },[]);

  useEffect(function(){
    supabase.auth.getSession().then(function(r){
      if(r.data.session)loadUserData(r.data.session.user);
    });
    var sub=supabase.auth.onAuthStateChange(function(_ev,session){
      if(session)loadUserData(session.user);else setAuthUser(null);
    });
    return function(){sub.data.subscription.unsubscribe();};
  },[]);

  useEffect(function(){
    supabase.from('tournaments').select('*').then(function(r){
      if(r.data&&r.data.length>0)setTournaments(r.data);
    });
  },[]);

  async function loadUserData(user){
    var init=initials(user.user_metadata.name||user.email);
    setAuthUser({id:user.id,name:user.user_metadata.name||user.email.split("@")[0],email:user.email,avatar:init});
    var r=await supabase.from('profiles').select('*').eq('id',user.id).single();
    if(r.data){
      setProfile(r.data);
    } else {
      var defaults={id:user.id,name:user.user_metadata.name||user.email.split("@")[0],suburb:"Sydney",skill:"Intermediate",style:"All-Court",bio:"",avatar:init,availability:{}};
      setProfile(defaults);
      await supabase.from('profiles').upsert(defaults);
    }
    var hr=await supabase.from('match_history').select('*').eq('user_id',user.id).order('created_at',{ascending:false});
    if(hr.data)setHistory(hr.data);
  }

  var [tab,setTab]=useState("home");
  var [authUser,setAuthUser]=useState(null);
  var [showAuth,setShowAuth]=useState(false);
  var [authMode,setAuthMode]=useState("login");
  var [authStep,setAuthStep]=useState("choose");
  var [authEmail,setAuthEmail]=useState("");
  var [authPassword,setAuthPassword]=useState("");
  var [authName,setAuthName]=useState("");
  var [authLoading,setAuthLoading]=useState(false);
  var [authError,setAuthError]=useState("");
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
  var [scheduleModal,setScheduleModal]=useState(null);
  var [scheduleDraft,setScheduleDraft]=useState({date:"",time:"6:00 PM",court:"Court 1"});
  var [scoreModal,setScoreModal]=useState(null);
  var [scoreDraft,setScoreDraft]=useState({sets:[{you:"",them:""}],result:"win",notes:""});
  var [adminTab,setAdminTab]=useState("tournaments");
  var [newTourn,setNewTourn]=useState({name:"",skill:"Intermediate",size:16,startDate:"",deadlineDays:14,format:"league",surface:"Hard Court"});

  var myId=authUser?authUser.id:"local-user";

  var requireAuth=function(cb){
    if(authUser)cb();else{setShowAuth(true);setAuthMode("login");setAuthStep("choose");}
  };

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
        } else {
          var matches=[];
          for(var k=0;k<entrants.length;k+=2){
            var dl2=new Date();dl2.setDate(dl2.getDate()+(t2.deadlineDays||14));
            matches.push({id:"m"+Date.now()+k,p1:entrants[k]||null,p2:entrants[k+1]||null,winner:null,sets:[],status:"scheduled",deadline:dl2.toISOString().split("T")[0],scheduledDate:"",scheduledTime:"",scheduledCourt:""});
          }
          updated=Object.assign({},t2,{status:"active",rounds:[{round:1,matches:matches}]});
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
          var fin2=Object.assign({},t2,{rounds:newRounds});
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
          var finE2=Object.assign({},t2,{rounds:newRounds});
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
    if(spotsLeft<=0&&(t2.waitlist||[]).length>0)return{label:"Waitlist Open",color:t.purple};
    if(spotsLeft<=0)return{label:"Full",color:t.red};
    if(spotsLeft<=4)return{label:spotsLeft+" spot"+(spotsLeft!==1?"s":"")+" left",color:t.orange};
    return{label:"Enrolling",color:t.orange};
  }

  var TABS=[
    {id:"home",label:"Home"},
    {id:"tournaments",label:"Compete"},
    {id:"scorebook",label:"Scores"},
    {id:"profile",label:"Profile"},
    {id:"admin",label:"Admin"},
  ];

  return (
    <div style={{minHeight:"100vh",background:t.bg,color:t.text,paddingBottom:84,fontFamily:"-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif"}}>

      {/* ── NAV ── */}
      <nav style={{position:"sticky",top:0,zIndex:40,backdropFilter:"blur(20px)",background:t.navBg,borderBottom:"1px solid "+t.border}}>
        <div style={{maxWidth:700,margin:"0 auto",padding:"0 20px",height:56,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <div style={{width:34,height:34,borderRadius:10,background:t.accent,display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,fontWeight:800,color:"#fff"}}>CS</div>
            <div>
              <div style={{fontSize:16,fontWeight:700,letterSpacing:"-0.4px",color:t.text,lineHeight:1}}>CourtSync</div>
              <div style={{fontSize:10,color:t.textSecondary,lineHeight:1}}>Sydney Tennis</div>
            </div>
          </div>
          <div style={{display:"flex",gap:8,alignItems:"center"}}>
            <button onClick={function(){setDark(function(d){return!d;});}} style={{background:"transparent",border:"1px solid "+t.border,borderRadius:8,padding:"5px 10px",fontSize:11,color:t.textSecondary}}>
              {dark?"Light":"Dark"}
            </button>
            {authUser
              ?<button onClick={function(){setTab("profile");}} style={{width:34,height:34,borderRadius:"50%",background:t.accent,border:"none",fontSize:12,fontWeight:800,color:"#fff"}}>{profile.avatar}</button>
              :<button onClick={function(){setShowAuth(true);setAuthMode("login");setAuthStep("choose");}} style={{background:t.accent,border:"none",borderRadius:9,padding:"7px 14px",fontSize:13,fontWeight:600,color:"#fff"}}>Log in</button>
            }
          </div>
        </div>
      </nav>

      {/* ── TAB BAR ── */}
      <div style={{position:"fixed",bottom:0,left:0,right:0,zIndex:50,backdropFilter:"blur(20px)",background:t.tabBar,borderTop:"1px solid "+t.border}}>
        <div style={{maxWidth:700,margin:"0 auto",display:"flex",padding:"8px 0 14px"}}>
          {TABS.map(function(tb){
            var on=tab===tb.id;
            return(
              <button key={tb.id} onClick={function(){setTab(tb.id);if(tb.id!=="tournaments")setSelectedTournId(null);}}
                style={{flex:1,background:"none",border:"none",display:"flex",flexDirection:"column",alignItems:"center",gap:3,color:on?t.accent:t.textTertiary,padding:"4px 0"}}>
                <div style={{width:28,height:3,borderRadius:2,background:on?t.accent:"transparent",marginBottom:2}}/>
                <span style={{fontSize:10,fontWeight:on?700:400}}>{tb.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── HOME TAB ── */}
      {tab==="home"&&(
        <div style={{maxWidth:700,margin:"0 auto",padding:"24px 20px"}}>
          <div style={{marginBottom:28}}>
            <h1 style={{fontSize:26,fontWeight:700,letterSpacing:"-0.7px",color:t.text,marginBottom:4}}>
              {authUser?"Hey, "+profile.name.split(" ")[0]+".":"Welcome to CourtSync."}
            </h1>
            <p style={{fontSize:14,color:t.textSecondary}}>Sydney tennis tournaments. Compete for real prizes.</p>
          </div>

          {authUser&&myTournaments.length>0&&(
            <div style={{marginBottom:24}}>
              <div style={{fontSize:11,fontWeight:700,color:t.textTertiary,textTransform:"uppercase",letterSpacing:0.8,marginBottom:12}}>My Tournaments</div>
              <div style={{display:"flex",flexDirection:"column",gap:10}}>
                {myTournaments.map(function(t2){
                  var entered=isEntered(t2.id),waitlisted=isWaitlisted(t2.id),wlP=waitlistPos(t2.id);
                  var prize=PRIZES[t2.size]||PRIZES[16];
                  var dl=daysUntil(t2.startDate);
                  return(
                    <div key={t2.id} className="fade-up" onClick={function(){setTab("tournaments");setSelectedTournId(t2.id);setTournDetailTab("overview");}}
                      style={{background:t.bgCard,border:"1px solid "+(entered?t.accent+"44":t.purple+"44"),borderRadius:16,padding:"14px 16px",cursor:"pointer",display:"flex",alignItems:"center",gap:14}}>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{display:"flex",gap:6,marginBottom:5,flexWrap:"wrap"}}>
                          {entered&&<Pill label="Confirmed" color={t.green}/>}
                          {waitlisted&&<Pill label={"Waitlist #"+wlP} color={t.purple}/>}
                          {t2.status==="active"&&<Pill label="Live" color={t.accent}/>}
                        </div>
                        <div style={{fontSize:14,fontWeight:600,color:t.text,marginBottom:2,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{t2.name}</div>
                        <div style={{fontSize:12,color:t.textSecondary}}>{prize.item} · {t2.skill}</div>
                      </div>
                      {dl!==null&&t2.status==="enrolling"&&(
                        <div style={{textAlign:"right",flexShrink:0}}>
                          <div style={{fontSize:16,fontWeight:700,color:t.orange}}>{dl}d</div>
                          <div style={{fontSize:10,color:t.textTertiary}}>to start</div>
                        </div>
                      )}
                      <div style={{color:t.textTertiary,fontSize:16}}>›</div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {myUpcoming.length>0&&(
            <div style={{marginBottom:24}}>
              <div style={{fontSize:11,fontWeight:700,color:t.textTertiary,textTransform:"uppercase",letterSpacing:0.8,marginBottom:12}}>Your Next Matches</div>
              <div style={{display:"flex",flexDirection:"column",gap:12}}>
                {myUpcoming.map(function(item){
                  var m=item.match,t2=item.tournament;
                  var dl=daysUntil(m.deadline),urgent=dl!==null&&dl<=3;
                  return(
                    <div key={m.id} className="fade-up" style={{background:t.bgCard,border:"2px solid "+(urgent?t.orange:t.accent)+"55",borderRadius:18,padding:"16px"}}>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:10}}>
                        <div>
                          <div style={{fontSize:10,fontWeight:700,color:t.accent,textTransform:"uppercase",letterSpacing:0.5,marginBottom:3}}>{t2.name+" · "+item.roundLabel}</div>
                          <div style={{fontSize:18,fontWeight:700,color:t.text}}>vs {item.opponent?item.opponent.name:"TBD"}</div>
                        </div>
                        {dl!==null&&<div style={{textAlign:"right",flexShrink:0}}>
                          <div style={{fontSize:13,fontWeight:700,color:urgent?t.orange:t.textSecondary}}>{dl===0?"Today":dl<0?"Overdue":dl+"d left"}</div>
                          <div style={{fontSize:10,color:t.textTertiary}}>deadline</div>
                        </div>}
                      </div>
                      <div style={{background:t.bgTertiary,borderRadius:10,padding:"9px 12px",marginBottom:10}}>
                        <div style={{fontSize:11,color:t.textSecondary,marginBottom:1}}>{PILOT_VENUE.name}</div>
                        {m.scheduledDate
                          ?<div style={{fontSize:12,color:t.accent,fontWeight:600}}>{m.scheduledDate+" · "+m.scheduledTime+" · "+m.scheduledCourt}</div>
                          :<div style={{fontSize:12,color:t.orange}}>Not yet scheduled — arrange with your opponent</div>
                        }
                      </div>
                      <div style={{display:"flex",gap:8}}>
                        <button onClick={function(){setScheduleModal({tournId:t2.id,roundIdx:item.roundIdx,matchId:m.id});setScheduleDraft({date:m.scheduledDate||"",time:m.scheduledTime||"6:00 PM",court:m.scheduledCourt||"Court 1"});}}
                          style={{flex:1,padding:"10px",borderRadius:10,border:"1px solid "+t.border,background:t.bgTertiary,color:t.text,fontSize:12,fontWeight:600}}>
                          {m.scheduledDate?"Edit time":"Schedule"}
                        </button>
                        <button onClick={function(){setScoreModal({oppName:item.opponent?item.opponent.name:"Opponent",tournName:t2.name,tournId:t2.id,roundIdx:item.roundIdx,matchId:m.id,winnerId1:myId,winnerId2:item.opponent?item.opponent.id:null});setScoreDraft({sets:[{you:"",them:""}],result:"win",notes:""}); }}
                          style={{flex:1,padding:"10px",borderRadius:10,border:"none",background:t.accent,color:"#fff",fontSize:12,fontWeight:600}}>
                          Log result
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {!authUser&&(
            <div style={{background:"linear-gradient(135deg,"+t.accent+"18 0%,transparent 100%)",border:"1px solid "+t.accent+"33",borderRadius:20,padding:"24px 20px",marginBottom:20}}>
              <div style={{fontSize:20,fontWeight:700,color:t.text,marginBottom:8}}>Start competing</div>
              <div style={{fontSize:14,color:t.textSecondary,lineHeight:1.6,marginBottom:20}}>Enter a skill bracket, play 5 league matches, qualify for semis, and compete for a brand new racket.</div>
              <div style={{display:"flex",gap:10}}>
                <button onClick={function(){setShowAuth(true);setAuthMode("signup");setAuthStep("choose");}}
                  style={{flex:1,padding:"13px",borderRadius:12,border:"none",background:t.accent,color:"#fff",fontSize:14,fontWeight:700}}>Sign up free</button>
                <button onClick={function(){setTab("tournaments");}}
                  style={{flex:1,padding:"13px",borderRadius:12,border:"1px solid "+t.border,background:"transparent",color:t.text,fontSize:14,fontWeight:600}}>Browse tournaments</button>
              </div>
            </div>
          )}

          <div style={{background:t.bgCard,border:"1px solid "+t.border,borderRadius:16,padding:"16px",marginBottom:12}}>
            <div style={{fontSize:11,fontWeight:700,color:t.textTertiary,textTransform:"uppercase",letterSpacing:0.6,marginBottom:10}}>Pilot Venue</div>
            <div style={{display:"flex",alignItems:"center",gap:14}}>
              <div style={{width:44,height:44,borderRadius:11,background:t.accent,display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,fontWeight:800,color:"#fff",flexShrink:0}}>SB</div>
              <div style={{flex:1}}>
                <div style={{fontSize:14,fontWeight:700,color:t.text,marginBottom:2}}>{PILOT_VENUE.name}</div>
                <div style={{fontSize:12,color:t.textSecondary}}>{PILOT_VENUE.address}</div>
                <div style={{fontSize:12,color:t.textSecondary}}>{PILOT_VENUE.courts.length} courts · {PILOT_VENUE.hours}</div>
              </div>
            </div>
          </div>

          <div style={{background:t.bgCard,border:"1px solid "+t.border,borderRadius:16,padding:"16px"}}>
            <div style={{fontSize:13,fontWeight:700,color:t.text,marginBottom:14}}>How it works</div>
            {[
              ["1","Join a tournament","Pay entry, choose your skill bracket."],
              ["2","League stage","Play 5 matches against other entrants."],
              ["3","Top 4 qualify","Points earned from wins determine your seed."],
              ["4","Semifinals & Final","Top 4 compete for the prize."],
              ["5","Win the prize","Champion takes home a brand new racket."],
            ].map(function(s){
              return(
                <div key={s[0]} style={{display:"flex",gap:12,marginBottom:10}}>
                  <div style={{width:24,height:24,borderRadius:"50%",background:t.accentSubtle,border:"1px solid "+t.accent+"44",display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:800,color:t.accent,flexShrink:0}}>{s[0]}</div>
                  <div><div style={{fontSize:13,fontWeight:600,color:t.text,marginBottom:1}}>{s[1]}</div><div style={{fontSize:12,color:t.textSecondary}}>{s[2]}</div></div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── TOURNAMENTS LIST ── */}
      {tab==="tournaments"&&!selectedTournId&&(
        <div style={{maxWidth:700,margin:"0 auto",padding:"24px 20px"}}>
          <div style={{marginBottom:20}}>
            <h1 style={{fontSize:26,fontWeight:700,letterSpacing:"-0.7px",color:t.text,marginBottom:4}}>Tournaments</h1>
            <p style={{fontSize:14,color:t.textSecondary}}>League format · Real umpires · Real prizes.</p>
          </div>
          <div style={{display:"flex",gap:6,marginBottom:20,overflowX:"auto",paddingBottom:2}}>
            {["All"].concat(SKILL_LEVELS).map(function(sk){
              return(
                <button key={sk} onClick={function(){setFilterSkill(sk);}}
                  style={{flexShrink:0,padding:"7px 14px",borderRadius:8,border:"none",background:filterSkill===sk?t.accent:t.bgTertiary,color:filterSkill===sk?"#fff":t.textSecondary,fontSize:12,fontWeight:filterSkill===sk?700:400}}>
                  {sk}
                </button>
              );
            })}
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:14}}>
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
                <div key={t2.id} className="fade-up" style={{background:t.bgCard,border:"1px solid "+(entered||waitlisted?t.accent+"55":t.border),borderRadius:20,overflow:"hidden",animationDelay:(i*0.06)+"s"}}>
                  <div style={{background:"linear-gradient(135deg,#0f2240 0%,#071628 100%)",padding:"16px 18px",display:"flex",alignItems:"center",gap:14}}>
                    <div style={{flex:1}}>
                      <div style={{fontSize:10,fontWeight:700,color:"rgba(255,214,10,0.8)",textTransform:"uppercase",letterSpacing:1,marginBottom:4}}>Prize</div>
                      <div style={{fontSize:17,fontWeight:800,color:"#fff",marginBottom:2}}>{prize.item}</div>
                      <div style={{fontSize:12,color:"rgba(255,255,255,0.5)"}}>Valued at A${prize.value}</div>
                    </div>
                    <div className="glow" style={{width:52,height:52,borderRadius:14,background:"rgba(255,214,10,0.12)",border:"2px solid rgba(255,214,10,0.35)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:26,flexShrink:0}}>🏆</div>
                  </div>
                  <div style={{padding:"14px 18px 0"}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:10}}>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{display:"flex",gap:5,marginBottom:7,flexWrap:"wrap"}}>
                          <Pill label={dSt.label} color={dSt.color}/>
                          <Pill label={t2.skill} color={t.textSecondary}/>
                          {t2.format==="league"&&<Pill label="League" color={t.accent}/>}
                          {entered&&<Pill label="Entered" color={t.green}/>}
                          {waitlisted&&<Pill label={"Waitlist #"+wlP} color={t.purple}/>}
                        </div>
                        <div style={{fontSize:18,fontWeight:700,color:t.text,marginBottom:3}}>{t2.name}</div>
                        <div style={{fontSize:12,color:t.textSecondary}}>{PILOT_VENUE.name} · {PILOT_VENUE.suburb}</div>
                        {t2.surface&&<div style={{fontSize:11,color:t.textTertiary,marginTop:1}}>{t2.surface}</div>}
                      </div>
                      <div style={{textAlign:"right",flexShrink:0,marginLeft:12}}>
                        <div style={{fontSize:22,fontWeight:800,color:t.accent}}>${fee}</div>
                        <div style={{fontSize:11,color:t.textTertiary}}>entry</div>
                        {dl!==null&&dl>0&&t2.status==="enrolling"&&<div style={{fontSize:11,color:t.orange,marginTop:2}}>starts in {dl}d</div>}
                      </div>
                    </div>
                    <div style={{display:"flex",gap:8,marginBottom:12}}>
                      {[{l:"Format",v:t2.format==="league"?"League":"Elimination"},{l:"Players",v:t2.size},{l:"Round time",v:(t2.deadlineDays||14)+"d"}].map(function(info){
                        return(
                          <div key={info.l} style={{flex:1,background:t.bgTertiary,borderRadius:8,padding:"7px 8px"}}>
                            <div style={{fontSize:10,color:t.textTertiary,marginBottom:1}}>{info.l}</div>
                            <div style={{fontSize:12,fontWeight:600,color:t.text}}>{info.v}</div>
                          </div>
                        );
                      })}
                    </div>
                    {t2.status==="enrolling"&&(
                      <div style={{marginBottom:12}}>
                        <div style={{display:"flex",justifyContent:"space-between",marginBottom:5}}>
                          <span style={{fontSize:12,color:t.textSecondary}}>{(t2.entrants||[]).length} of {t2.size} enrolled</span>
                          <span style={{fontSize:12,fontWeight:600,color:isFull?t.red:spotsLeft<=4?t.orange:t.accent}}>
                            {isFull?"Full":spotsLeft+" spot"+(spotsLeft!==1?"s":"")+" left"}
                          </span>
                        </div>
                        <div style={{height:6,background:t.bgTertiary,borderRadius:3,overflow:"hidden"}}>
                          <div style={{height:"100%",width:fillPct+"%",background:isFull?t.red:spotsLeft<=4?t.orange:t.accent,borderRadius:3,transition:"width 0.4s ease"}}/>
                        </div>
                        {(t2.waitlist||[]).length>0&&<div style={{fontSize:11,color:t.purple,marginTop:4}}>{(t2.waitlist||[]).length} on waitlist</div>}
                      </div>
                    )}
                    {t2.status==="completed"&&t2.winner&&(
                      <div style={{display:"flex",alignItems:"center",gap:10,padding:"10px 12px",background:t.goldSubtle,border:"1px solid "+t.gold+"33",borderRadius:10,marginBottom:12}}>
                        <PlayerAvatar name={t2.winner.name} avatar={t2.winner.avatar} size={32}/>
                        <div><div style={{fontSize:10,color:t.textTertiary}}>Winner</div><div style={{fontSize:13,fontWeight:700,color:t.text}}>{t2.winner.name}</div></div>
                        <div style={{marginLeft:"auto",fontSize:11,color:t.gold,fontWeight:600}}>{prize.item}</div>
                      </div>
                    )}
                  </div>
                  <div style={{padding:"0 18px 16px",display:"flex",gap:8,marginTop:4}}>
                    <button onClick={function(){setSelectedTournId(t2.id);setTournDetailTab("overview");}}
                      style={{flex:1,padding:"11px",borderRadius:11,border:"1px solid "+t.border,background:t.bgTertiary,color:t.text,fontSize:13,fontWeight:600}}>
                      View details
                    </button>
                    {t2.status==="enrolling"&&!entered&&!isFull&&(
                      <button onClick={function(){enterTournament(t2.id);}}
                        style={{flex:2,padding:"11px",borderRadius:11,border:"none",background:t.accent,color:"#fff",fontSize:14,fontWeight:700}}>
                        Enter · ${fee}
                      </button>
                    )}
                    {t2.status==="enrolling"&&!entered&&isFull&&!waitlisted&&(
                      <button onClick={function(){joinWaitlist(t2.id);}}
                        style={{flex:2,padding:"11px",borderRadius:11,border:"none",background:t.purple,color:"#fff",fontSize:14,fontWeight:700}}>
                        Join Waitlist
                      </button>
                    )}
                    {t2.status==="enrolling"&&entered&&(
                      <div style={{flex:2,textAlign:"center",fontSize:13,color:t.green,fontWeight:600,padding:"11px",border:"1px solid "+t.green+"44",borderRadius:11,background:t.greenSubtle}}>Enrolled ✓</div>
                    )}
                    {t2.status==="enrolling"&&waitlisted&&!entered&&(
                      <div style={{flex:2,textAlign:"center",fontSize:13,color:t.purple,fontWeight:600,padding:"11px",border:"1px solid "+t.purple+"44",borderRadius:11,background:t.purpleSubtle}}>Waitlisted #{wlP}</div>
                    )}
                    {t2.status==="active"&&entered&&(
                      <button onClick={function(){setSelectedTournId(t2.id);setTournDetailTab(t2.format==="league"?"standings":"draw");}}
                        style={{flex:2,padding:"11px",borderRadius:11,border:"none",background:t.accent,color:"#fff",fontSize:13,fontWeight:700}}>
                        {t2.format==="league"?"View standings":"My matches"}
                      </button>
                    )}
                    {t2.status==="active"&&!entered&&(
                      <div style={{flex:2,textAlign:"center",padding:"11px",fontSize:12,color:t.textTertiary}}>In progress</div>
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
          <div style={{maxWidth:700,margin:"0 auto",padding:"20px 20px"}}>
            <button onClick={function(){setSelectedTournId(null);}}
              style={{background:"none",border:"none",color:t.accent,fontSize:13,fontWeight:600,padding:0,marginBottom:14}}>← Back</button>
            <div style={{marginBottom:18}}>
              <div style={{display:"flex",gap:6,marginBottom:8,flexWrap:"wrap"}}>
                <Pill label={dSt.label} color={dSt.color}/>
                <Pill label={t2.skill} color={t.textSecondary}/>
                {isLeague&&<Pill label="League" color={t.accent}/>}
                {entered&&<Pill label="Enrolled" color={t.green}/>}
                {waitlisted&&<Pill label={"Waitlisted · #"+wlP} color={t.purple}/>}
              </div>
              <h1 style={{fontSize:24,fontWeight:700,letterSpacing:"-0.5px",color:t.text,marginBottom:4}}>{t2.name}</h1>
              <div style={{fontSize:14,color:t.textSecondary}}>Prize: {prize.item} (A${prize.value})</div>
            </div>
            <div style={{display:"flex",gap:2,marginBottom:20,background:t.bgTertiary,borderRadius:11,padding:3}}>
              {detailTabs.map(function(dtab){
                var on=tournDetailTab===dtab;
                return(
                  <button key={dtab} onClick={function(){setTournDetailTab(dtab);}}
                    style={{flex:1,padding:"8px 0",borderRadius:9,border:"none",background:on?t.bgCard:"transparent",color:on?t.accent:t.textTertiary,fontSize:12,fontWeight:on?700:400}}>
                    {dtLabels[dtab]}
                  </button>
                );
              })}
            </div>

            {tournDetailTab==="overview"&&(
              <div className="fade-up">
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
                      <div key={info.l} style={{background:t.bgCard,border:"1px solid "+t.border,borderRadius:11,padding:"11px 14px"}}>
                        <div style={{fontSize:10,color:t.textTertiary,marginBottom:3}}>{info.l}</div>
                        <div style={{fontSize:14,fontWeight:600,color:t.text}}>{info.v}</div>
                      </div>
                    );
                  })}
                </div>
                {isLeague&&(
                  <div style={{marginBottom:16}}>
                    <div style={{fontSize:11,fontWeight:700,color:t.textTertiary,textTransform:"uppercase",letterSpacing:0.6,marginBottom:10}}>Tournament Format</div>
                    <FormatExplainer t={t}/>
                  </div>
                )}
                <div style={{background:t.bgCard,border:"1px solid "+t.border,borderRadius:14,padding:"14px 16px",marginBottom:16}}>
                  <div style={{fontSize:11,fontWeight:700,color:t.textTertiary,textTransform:"uppercase",letterSpacing:0.6,marginBottom:8}}>Venue</div>
                  <div style={{fontSize:14,fontWeight:700,color:t.text,marginBottom:3}}>{PILOT_VENUE.name}</div>
                  <div style={{fontSize:12,color:t.textSecondary,marginBottom:6}}>{PILOT_VENUE.address} · {PILOT_VENUE.courts.length} courts</div>
                  <div style={{fontSize:12,color:t.textSecondary,marginBottom:8}}>Players book and pay court slots directly. New balls provided by CourtSync per match.</div>
                  <a href={PILOT_VENUE.url} target="_blank" rel="noopener noreferrer" style={{fontSize:12,color:t.accent,fontWeight:600,textDecoration:"none"}}>Book a court →</a>
                </div>
                {waitlisted&&wlP&&(
                  <div style={{background:t.purpleSubtle,border:"1px solid "+t.purple+"44",borderRadius:14,padding:"14px 16px",marginBottom:16}}>
                    <div style={{fontSize:13,fontWeight:700,color:t.purple,marginBottom:6}}>You're on the waitlist · #{wlP}</div>
                    <div style={{fontSize:13,color:t.textSecondary,lineHeight:1.6}}>
                      You'll be promoted automatically if a spot opens. We'll notify you when confirmed.
                      {(t2.waitlist||[]).length>1&&" There "+(((t2.waitlist||[]).length-1)===1?"is":"are")+" "+((t2.waitlist||[]).length-1)+" person"+(((t2.waitlist||[]).length-1)!==1?"s":"")+" ahead of you."}
                    </div>
                  </div>
                )}
                <div style={{background:t.bgCard,border:"1px solid "+t.border,borderRadius:14,padding:"14px 16px",marginBottom:16}}>
                  <div style={{fontSize:11,fontWeight:700,color:t.textTertiary,textTransform:"uppercase",letterSpacing:0.6,marginBottom:10}}>Rules & Format</div>
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
                      <div key={ri} style={{display:"flex",gap:10,marginBottom:7}}>
                        <div style={{width:4,height:4,borderRadius:"50%",background:t.accent,marginTop:7,flexShrink:0}}/>
                        <div style={{fontSize:13,color:t.textSecondary,lineHeight:1.5}}>{rule}</div>
                      </div>
                    );
                  })}
                </div>
                {t2.status==="enrolling"&&(
                  <div style={{background:t.bgCard,border:"1px solid "+t.border,borderRadius:14,overflow:"hidden",marginBottom:16}}>
                    <div style={{padding:"12px 16px",borderBottom:"1px solid "+t.border,display:"flex",justifyContent:"space-between"}}>
                      <span style={{fontSize:13,fontWeight:700,color:t.text}}>Confirmed players</span>
                      <span style={{fontSize:13,color:t.textSecondary}}>{(t2.entrants||[]).length}/{t2.size}</span>
                    </div>
                    {(t2.entrants||[]).length===0
                      ?<div style={{padding:"24px",textAlign:"center",color:t.textTertiary,fontSize:13}}>No entrants yet. Be the first!</div>
                      :(t2.entrants||[]).map(function(e,i){
                        return(
                          <div key={e.id} style={{padding:"10px 16px",borderBottom:i<(t2.entrants||[]).length-1?"1px solid "+t.border:"none",display:"flex",alignItems:"center",gap:12}}>
                            <PlayerAvatar name={e.name} avatar={e.avatar} size={30}/>
                            <div style={{flex:1}}>
                              <div style={{fontSize:13,color:t.text,fontWeight:e.id===myId?700:400}}>{e.name}{e.id===myId?" (you)":""}</div>
                              <div style={{fontSize:11,color:t.textTertiary}}>{e.skill}</div>
                            </div>
                          </div>
                        );
                      })
                    }
                    {(t2.waitlist||[]).length>0&&(
                      <div style={{padding:"10px 16px",borderTop:"1px solid "+t.border,background:t.purpleSubtle}}>
                        <div style={{fontSize:12,color:t.purple,fontWeight:600}}>{(t2.waitlist||[]).length} on waitlist</div>
                      </div>
                    )}
                  </div>
                )}
                <div style={{marginTop:8}}>
                  {t2.status==="enrolling"&&!entered&&!isFull&&!waitlisted&&(
                    <button onClick={function(){enterTournament(t2.id);}}
                      style={{width:"100%",padding:"15px",borderRadius:14,border:"none",background:t.accent,color:"#fff",fontSize:16,fontWeight:700}}>
                      Join Tournament · ${fee}
                    </button>
                  )}
                  {t2.status==="enrolling"&&!entered&&isFull&&!waitlisted&&(
                    <div>
                      <button onClick={function(){joinWaitlist(t2.id);}}
                        style={{width:"100%",padding:"15px",borderRadius:14,border:"none",background:t.purple,color:"#fff",fontSize:16,fontWeight:700,marginBottom:8}}>
                        Join Waitlist
                      </button>
                      <p style={{textAlign:"center",fontSize:12,color:t.textSecondary}}>Tournament is full. Join the waitlist to be notified if a spot opens.</p>
                    </div>
                  )}
                  {t2.status==="enrolling"&&entered&&(
                    <div style={{padding:"14px",borderRadius:14,border:"1px solid "+t.green+"55",background:t.greenSubtle,textAlign:"center"}}>
                      <div style={{fontSize:15,fontWeight:700,color:t.green,marginBottom:2}}>You're in!</div>
                      <div style={{fontSize:12,color:t.textSecondary}}>Draw will be generated when ready. You'll be notified.</div>
                    </div>
                  )}
                  {t2.status==="enrolling"&&waitlisted&&!entered&&(
                    <div style={{padding:"14px",borderRadius:14,border:"1px solid "+t.purple+"55",background:t.purpleSubtle,textAlign:"center"}}>
                      <div style={{fontSize:15,fontWeight:700,color:t.purple,marginBottom:2}}>Waitlisted · #{wlP}</div>
                      <div style={{fontSize:12,color:t.textSecondary}}>We'll notify you if a spot opens up.</div>
                    </div>
                  )}
                  {t2.status==="active"&&(
                    <button onClick={function(){setTournDetailTab(isLeague?"standings":"draw");}}
                      style={{width:"100%",padding:"15px",borderRadius:14,border:"none",background:t.accent,color:"#fff",fontSize:15,fontWeight:700}}>
                      {isLeague?"View Standings →":"View Draw →"}
                    </button>
                  )}
                </div>
                {t2.status==="completed"&&t2.winner&&(
                  <div className="pop" style={{background:"linear-gradient(135deg,#1a2d4a 0%,#0d1f35 100%)",border:"2px solid rgba(255,214,10,0.4)",borderRadius:18,padding:"24px",textAlign:"center",marginTop:16}}>
                    <div style={{fontSize:36,marginBottom:8}}>🏆</div>
                    <div style={{fontSize:10,color:"rgba(255,214,10,0.8)",fontWeight:700,textTransform:"uppercase",letterSpacing:1,marginBottom:6}}>Tournament Winner</div>
                    <div style={{fontSize:22,fontWeight:800,color:"#fff",marginBottom:4}}>{t2.winner.name}</div>
                    <div style={{fontSize:13,color:"rgba(255,255,255,0.6)"}}>{prize.item}</div>
                  </div>
                )}
              </div>
            )}

            {tournDetailTab==="standings"&&(
              <div className="fade-up">
                {t2.status==="active"||t2.status==="completed"
                  ?<StandingsTable tournament={t2} myId={myId} t={t}/>
                  :<div style={{textAlign:"center",padding:"60px 0",color:t.textTertiary,fontSize:13}}>Standings will appear once the tournament starts.</div>
                }
              </div>
            )}

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

            {tournDetailTab==="matches"&&(
              <div className="fade-up">
                {myMatches.length>0&&(
                  <div style={{marginBottom:20}}>
                    <div style={{fontSize:11,fontWeight:700,color:t.textTertiary,textTransform:"uppercase",letterSpacing:0.6,marginBottom:10}}>Your Matches</div>
                    <div style={{display:"flex",flexDirection:"column",gap:8}}>
                      {myMatches.map(function(item){
                        var m=item.match,dl2=daysUntil(m.deadline),urgent=dl2!==null&&dl2<=3&&m.status!=="complete";
                        return(
                          <div key={m.id} style={{background:t.bgCard,border:"2px solid "+(urgent?t.orange:t.accent)+"55",borderRadius:14,padding:"14px 16px"}}>
                            <div style={{display:"flex",justifyContent:"space-between",marginBottom:8}}>
                              <div style={{fontSize:11,fontWeight:600,color:t.accent}}>{item.roundLabel}</div>
                              {m.status==="complete"
                                ?<Pill label={m.winner===myId?"Won":"Lost"} color={m.winner===myId?t.green:t.red}/>
                                :dl2!==null&&<div style={{fontSize:12,color:urgent?t.orange:t.textSecondary}}>{dl2<0?"Overdue":dl2===0?"Due today":"Due in "+dl2+"d"}</div>
                              }
                            </div>
                            <div style={{fontSize:15,fontWeight:600,color:t.text,marginBottom:8}}>vs {item.opponent?item.opponent.name:"TBD"}</div>
                            {m.scheduledDate&&<div style={{fontSize:12,color:t.textSecondary,marginBottom:8}}>{m.scheduledDate+" · "+m.scheduledTime+" · "+m.scheduledCourt}</div>}
                            {m.status!=="complete"&&(
                              <div style={{display:"flex",gap:8}}>
                                <button onClick={function(){setScheduleModal({tournId:t2.id,roundIdx:item.roundIdx,matchId:m.id});setScheduleDraft({date:m.scheduledDate||"",time:m.scheduledTime||"6:00 PM",court:m.scheduledCourt||"Court 1"});}}
                                  style={{flex:1,padding:"9px",borderRadius:9,border:"1px solid "+t.border,background:t.bgTertiary,color:t.text,fontSize:12,fontWeight:600}}>
                                  {m.scheduledDate?"Edit":"Schedule"}
                                </button>
                                <button onClick={function(){setScoreModal({oppName:item.opponent?item.opponent.name:"Opponent",tournName:t2.name,tournId:t2.id,roundIdx:item.roundIdx,matchId:m.id,winnerId1:myId,winnerId2:item.opponent?item.opponent.id:null});setScoreDraft({sets:[{you:"",them:""}],result:"win",notes:""}); }}
                                  style={{flex:1,padding:"9px",borderRadius:9,border:"none",background:t.accent,color:"#fff",fontSize:12,fontWeight:600}}>
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
                      <div style={{fontSize:12,fontWeight:700,color:r.type==="semi"?t.purple:r.type==="final"?t.gold:t.accent,marginBottom:8}}>
                        {r.type==="semi"?"Semifinals":r.type==="final"?"Final":"League Round "+r.round}
                      </div>
                      <div style={{display:"flex",flexDirection:"column",gap:8}}>
                        {(r.matches||[]).map(function(m){
                          var isMyMatch=(m.p1&&m.p1.id===myId)||(m.p2&&m.p2.id===myId);
                          return(
                            <div key={m.id} style={{background:t.bgCard,border:"1px solid "+(isMyMatch?t.accent+"55":t.border),borderRadius:12,overflow:"hidden"}}>
                              {[m.p1,m.p2].map(function(player,pi){
                                if(!player)return<div key={pi} style={{padding:"10px 14px",color:t.textTertiary,fontSize:12,fontStyle:"italic",borderBottom:pi===0?"1px solid "+t.border:"none"}}>TBD</div>;
                                var isWinner=m.winner===player.id,isLoser=m.winner&&!isWinner;
                                return(
                                  <div key={pi} style={{padding:"10px 14px",display:"flex",alignItems:"center",gap:10,borderBottom:pi===0?"1px solid "+t.border:"none",opacity:isLoser?0.38:1,background:isWinner?t.greenSubtle:"transparent"}}>
                                    <PlayerAvatar name={player.name} avatar={player.avatar} size={28}/>
                                    <span style={{fontSize:13,fontWeight:isWinner||player.id===myId?700:400,color:player.id===myId?t.accent:t.text,flex:1}}>{player.name}{player.id===myId?" (you)":""}</span>
                                    {isWinner&&<span style={{fontSize:11,color:t.green,fontWeight:700}}>W</span>}
                                  </div>
                                );
                              })}
                              {m.scheduledDate&&m.status!=="complete"&&(
                                <div style={{padding:"6px 14px",background:t.bgTertiary,fontSize:11,color:t.textSecondary}}>{m.scheduledDate+" · "+m.scheduledTime+" · "+m.scheduledCourt}</div>
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

      {/* ── SCOREBOOK ── */}
      {tab==="scorebook"&&(
        <div style={{maxWidth:700,margin:"0 auto",padding:"24px 20px"}}>
          <h1 style={{fontSize:26,fontWeight:700,letterSpacing:"-0.7px",marginBottom:4,color:t.text}}>Scorebook</h1>
          <p style={{fontSize:14,color:t.textSecondary,marginBottom:22}}>Your match history.</p>
          {history.length===0
            ?<div style={{textAlign:"center",padding:"60px 0",color:t.textTertiary,fontSize:14}}>No matches logged yet.</div>
            :(
              <div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8,marginBottom:20}}>
                  {[
                    {l:"Played",v:history.length,c:t.text},
                    {l:"Won",v:history.filter(function(m){return m.result==="win";}).length,c:t.green},
                    {l:"Lost",v:history.filter(function(m){return m.result==="loss";}).length,c:t.red},
                    {l:"Win %",v:history.length?Math.round(history.filter(function(m){return m.result==="win";}).length/history.length*100)+"%":"0%",c:t.accent},
                  ].map(function(s){
                    return(
                      <div key={s.l} style={{background:t.bgCard,border:"1px solid "+t.border,borderRadius:14,padding:"14px 10px",textAlign:"center"}}>
                        <div style={{fontSize:22,fontWeight:800,color:s.c}}>{s.v}</div>
                        <div style={{fontSize:10,color:t.textTertiary,marginTop:3}}>{s.l}</div>
                      </div>
                    );
                  })}
                </div>
                <div style={{display:"flex",flexDirection:"column",gap:8}}>
                  {history.map(function(m){
                    var rc=m.result==="win"?t.green:t.red;
                    return(
                      <div key={m.id} className="fade-up" style={{background:t.bgCard,border:"1px solid "+t.border,borderRadius:16,padding:"14px 16px",display:"flex",gap:12,alignItems:"center"}}>
                        <div style={{width:38,height:38,borderRadius:11,background:rc+"1a",border:"1px solid "+rc+"44",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                          <span style={{fontSize:14,fontWeight:800,color:rc}}>{m.result==="win"?"W":"L"}</span>
                        </div>
                        <div style={{flex:1}}>
                          <div style={{fontSize:13,fontWeight:600,color:t.text}}>vs {m.oppName}</div>
                          <div style={{fontSize:11,color:t.textTertiary,marginTop:1}}>{m.tournName} · {m.date}</div>
                        </div>
                        <div style={{display:"flex",gap:4}}>
                          {(m.sets||[]).map(function(set,si){
                            return(
                              <div key={si} style={{background:t.bgTertiary,border:"1px solid "+t.border,borderRadius:6,padding:"3px 7px",textAlign:"center"}}>
                                <div style={{fontSize:12,fontWeight:700,color:t.text}}>{set.you}-{set.them}</div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )
          }
        </div>
      )}

      {/* ── PROFILE ── */}
      {tab==="profile"&&(
        <div style={{maxWidth:700,margin:"0 auto",padding:"24px 20px"}}>
          <h1 style={{fontSize:26,fontWeight:700,letterSpacing:"-0.7px",marginBottom:4,color:t.text}}>Profile</h1>
          <p style={{fontSize:14,color:t.textSecondary,marginBottom:22}}>Your player card.</p>
          {!editingProfile&&!editingAvail&&(
            <div>
              <div style={{background:t.bgCard,border:"1px solid "+t.border,borderRadius:20,padding:20,marginBottom:12}}>
                <div style={{display:"flex",gap:14,alignItems:"flex-start",marginBottom:16}}>
                  <div style={{width:56,height:56,borderRadius:"50%",background:t.accent,display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,fontWeight:700,color:"#fff",flexShrink:0}}>{profile.avatar}</div>
                  <div style={{flex:1}}>
                    <div style={{fontSize:19,fontWeight:700,color:t.text}}>{profile.name}</div>
                    <div style={{fontSize:13,color:t.textSecondary,marginTop:2}}>{profile.suburb}</div>
                    {profile.bio&&<p style={{fontSize:12,color:t.textSecondary,marginTop:6,lineHeight:1.5}}>{profile.bio}</p>}
                  </div>
                  <button onClick={function(){setProfileDraft(profile);setEditingProfile(true);}}
                    style={{padding:"8px 14px",borderRadius:9,border:"1px solid "+t.border,background:t.bgTertiary,color:t.text,fontSize:12,fontWeight:600}}>Edit</button>
                </div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8,marginBottom:12}}>
                  {[
                    {l:"Played",v:history.length},
                    {l:"Won",v:history.filter(function(m){return m.result==="win";}).length},
                    {l:"Win %",v:history.length?Math.round(history.filter(function(m){return m.result==="win";}).length/history.length*100)+"%":"0%"},
                  ].map(function(s){
                    return(
                      <div key={s.l} style={{background:t.bgTertiary,border:"1px solid "+t.border,borderRadius:10,padding:"10px",textAlign:"center"}}>
                        <div style={{fontSize:20,fontWeight:700,color:t.text}}>{s.v}</div>
                        <div style={{fontSize:10,color:t.textTertiary,marginTop:2}}>{s.l}</div>
                      </div>
                    );
                  })}
                </div>
                <div style={{display:"flex",gap:6}}>
                  <Pill label={profile.skill} color={t.accent}/>
                  <Pill label={profile.style} color={t.green}/>
                </div>
              </div>
              <div style={{background:t.bgCard,border:"1px solid "+t.border,borderRadius:20,overflow:"hidden",marginBottom:12}}>
                <div style={{padding:"12px 16px",borderBottom:"1px solid "+t.border,display:"flex",justifyContent:"space-between"}}>
                  <span style={{fontSize:13,fontWeight:700,color:t.text}}>Availability</span>
                  <button onClick={function(){setAvailDraft(profile.availability||{});setEditingAvail(true);}}
                    style={{fontSize:12,color:t.accent,background:"none",border:"none",fontWeight:600}}>Edit</button>
                </div>
                <div style={{padding:"12px 16px",display:"flex",flexDirection:"column",gap:6}}>
                  {DAYS_SHORT.filter(function(d){return((profile.availability||{})[d]||[]).length>0;}).length===0
                    ?<p style={{fontSize:13,color:t.textTertiary}}>No availability set.</p>
                    :DAYS_SHORT.filter(function(d){return((profile.availability||{})[d]||[]).length>0;}).map(function(day){
                      return(
                        <div key={day} style={{display:"flex",alignItems:"center",gap:8}}>
                          <span style={{fontSize:11,fontWeight:700,color:t.textSecondary,width:30}}>{day}</span>
                          <div style={{display:"flex",gap:4}}>
                            {((profile.availability||{})[day]||[]).map(function(b){
                              return<Pill key={b} label={b} color={t.accent}/>;
                            })}
                          </div>
                        </div>
                      );
                    })
                  }
                </div>
              </div>
              {authUser&&(
                <button onClick={function(){supabase.auth.signOut();}}
                  style={{width:"100%",padding:"12px",borderRadius:12,border:"1px solid "+t.red+"44",background:t.redSubtle,color:t.red,fontSize:13,fontWeight:600}}>
                  Sign out
                </button>
              )}
            </div>
          )}
          {editingAvail&&(
            <div className="fade-up" style={{background:t.bgCard,border:"1px solid "+t.border,borderRadius:20,overflow:"hidden"}}>
              <div style={{padding:"14px 16px",borderBottom:"1px solid "+t.border}}><div style={{fontSize:14,fontWeight:700,color:t.text}}>Edit Availability</div></div>
              <div style={{padding:"16px"}}>
                {DAYS_SHORT.map(function(day,di){
                  return(
                    <div key={day} style={{display:"flex",alignItems:"center",gap:10,paddingTop:di===0?0:12,paddingBottom:12,borderBottom:di<DAYS_SHORT.length-1?"1px solid "+t.border:"none"}}>
                      <span style={{fontSize:12,fontWeight:700,color:t.textSecondary,width:32,flexShrink:0}}>{day}</span>
                      <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
                        {TIME_BLOCKS.map(function(block){
                          var on=(availDraft[day]||[]).includes(block);
                          return(
                            <button key={block} onClick={function(){
                              var cur=availDraft[day]||[];
                              var next=on?cur.filter(function(b){return b!==block;}):cur.concat([block]);
                              setAvailDraft(function(d){return Object.assign({},d,{[day]:next});});
                            }}
                              style={{padding:"6px 11px",borderRadius:8,border:"1px solid "+(on?t.accent:t.border),background:on?t.accentSubtle:"transparent",color:on?t.accent:t.textTertiary,fontSize:11,fontWeight:on?600:400}}>
                              {block}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
              <div style={{padding:"0 16px 16px",display:"flex",gap:8}}>
                <button onClick={function(){setEditingAvail(false);}}
                  style={{flex:1,padding:"12px",borderRadius:12,border:"none",background:t.bgTertiary,color:t.text,fontSize:13,fontWeight:600}}>Cancel</button>
                <button onClick={function(){setProfile(function(p){return Object.assign({},p,{availability:availDraft});});setEditingAvail(false);}}
                  style={{flex:2,padding:"12px",borderRadius:12,border:"none",background:t.accent,color:"#fff",fontSize:13,fontWeight:600}}>Save</button>
              </div>
            </div>
          )}
          {editingProfile&&(
            <div className="fade-up" style={{background:t.bgCard,border:"1px solid "+t.border,borderRadius:20,padding:20}}>
              <div style={{fontSize:14,fontWeight:700,color:t.text,marginBottom:16}}>Edit Profile</div>
              {[{l:"Full name",k:"name",type:"text",ph:"Your name"},{l:"Suburb",k:"suburb",type:"text",ph:"e.g. Bondi"},{l:"Bio",k:"bio",type:"text",ph:"Short bio..."}].map(function(f){
                return(
                  <div key={f.k} style={{marginBottom:10}}>
                    <label style={{fontSize:11,fontWeight:600,color:t.textSecondary,display:"block",marginBottom:4}}>{f.l}</label>
                    <input type={f.type} value={profileDraft[f.k]||""} onChange={function(e){var v=e.target.value;setProfileDraft(function(d){return Object.assign({},d,{[f.k]:v});});}}
                      placeholder={f.ph} style={{width:"100%",padding:"11px 13px",borderRadius:10,border:"1px solid "+t.border,background:t.inputBg,color:t.text,fontSize:14}}/>
                  </div>
                );
              })}
              {[{l:"Skill level",k:"skill",opts:SKILL_LEVELS},{l:"Play style",k:"style",opts:PLAY_STYLES}].map(function(f){
                return(
                  <div key={f.k} style={{marginBottom:12}}>
                    <label style={{fontSize:11,fontWeight:600,color:t.textSecondary,display:"block",marginBottom:6}}>{f.l}</label>
                    <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
                      {f.opts.map(function(o){
                        return(
                          <button key={o} onClick={function(){setProfileDraft(function(d){return Object.assign({},d,{[f.k]:o});});}}
                            style={{padding:"7px 12px",borderRadius:8,border:"none",fontSize:12,background:profileDraft[f.k]===o?t.accent:t.bgTertiary,color:profileDraft[f.k]===o?"#fff":t.textSecondary,fontWeight:profileDraft[f.k]===o?600:400}}>
                            {o}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
              <div style={{display:"flex",gap:8,marginTop:6}}>
                <button onClick={function(){setEditingProfile(false);}}
                  style={{flex:1,padding:"12px",borderRadius:12,border:"none",background:t.bgTertiary,color:t.text,fontSize:13,fontWeight:600}}>Cancel</button>
                <button onClick={function(){
                  var init2=initials(profileDraft.name||"YN");
                  var nd=Object.assign({},profileDraft,{avatar:init2});
                  setProfile(nd);setEditingProfile(false);
                  if(authUser)supabase.from('profiles').upsert(Object.assign({},nd,{id:authUser.id}));
                }}
                  style={{flex:2,padding:"12px",borderRadius:12,border:"none",background:t.accent,color:"#fff",fontSize:13,fontWeight:600}}>Save</button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── ADMIN ── */}
      {tab==="admin"&&(
        <div style={{maxWidth:700,margin:"0 auto",padding:"24px 20px"}}>
          <h1 style={{fontSize:26,fontWeight:700,letterSpacing:"-0.7px",marginBottom:4,color:t.text}}>Admin</h1>
          <p style={{fontSize:14,color:t.textSecondary,marginBottom:18}}>Manage tournaments, draws and results.</p>
          <div style={{background:t.bgCard,border:"1px solid "+t.border,borderRadius:14,padding:"14px 16px",marginBottom:18}}>
            <div style={{fontSize:11,fontWeight:700,color:t.textTertiary,textTransform:"uppercase",letterSpacing:0.6,marginBottom:10}}>Economics (estimated)</div>
            <div style={{display:"flex",gap:8}}>
              {[8,16,32].map(function(size){
                return(
                  <div key={size} style={{flex:1,background:t.bgTertiary,borderRadius:10,padding:"10px",textAlign:"center"}}>
                    <div style={{fontSize:10,color:t.textTertiary,marginBottom:2}}>{size} players</div>
                    <div style={{fontSize:12,fontWeight:700,color:t.text}}>${ENTRY_FEES[size]}</div>
                    <div style={{fontSize:11,color:t.accent}}>~${netRevenue(size)} net</div>
                  </div>
                );
              })}
            </div>
          </div>
          <div style={{display:"flex",gap:2,marginBottom:20,background:t.bgTertiary,borderRadius:11,padding:3}}>
            {["tournaments","draws","results"].map(function(at){
              return(
                <button key={at} onClick={function(){setAdminTab(at);}}
                  style={{flex:1,padding:"8px 0",borderRadius:9,border:"none",background:adminTab===at?t.bgCard:"transparent",color:adminTab===at?t.accent:t.textTertiary,fontSize:12,fontWeight:adminTab===at?700:400,textTransform:"capitalize"}}>
                  {at}
                </button>
              );
            })}
          </div>
          {adminTab==="tournaments"&&(
            <div>
              <div style={{background:t.bgCard,border:"1px solid "+t.border,borderRadius:18,padding:18,marginBottom:14}}>
                <div style={{fontSize:13,fontWeight:700,color:t.text,marginBottom:14}}>Create Tournament</div>
                {[{l:"Name",k:"name",type:"text",ph:"e.g. Sydney Autumn Open"},{l:"Start date",k:"startDate",type:"date",ph:""}].map(function(f){
                  return(
                    <div key={f.k} style={{marginBottom:10}}>
                      <label style={{fontSize:11,fontWeight:600,color:t.textSecondary,display:"block",marginBottom:4}}>{f.l}</label>
                      <input type={f.type} value={newTourn[f.k]} onChange={function(e){var v=e.target.value;setNewTourn(function(d){return Object.assign({},d,{[f.k]:v});});}}
                        placeholder={f.ph||""} style={{width:"100%",padding:"10px 12px",borderRadius:9,border:"1px solid "+t.border,background:t.inputBg,color:t.text,fontSize:13}}/>
                    </div>
                  );
                })}
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:12}}>
                  {[
                    {l:"Skill",k:"skill",opts:SKILL_LEVELS.map(function(s){return{v:s,l:s};}),num:false},
                    {l:"Draw size",k:"size",opts:[{v:8,l:"8"},{v:16,l:"16"},{v:32,l:"32"}],num:true},
                    {l:"Format",k:"format",opts:[{v:"league",l:"League"},{v:"elimination",l:"Elimination"}],num:false},
                    {l:"Surface",k:"surface",opts:["Hard Court","Clay","Grass","Indoor Hard"].map(function(s){return{v:s,l:s};}),num:false},
                    {l:"Days/round",k:"deadlineDays",opts:[{v:7,l:"7 days"},{v:10,l:"10 days"},{v:14,l:"14 days"}],num:true},
                  ].map(function(f){
                    return(
                      <div key={f.k}>
                        <label style={{fontSize:11,fontWeight:600,color:t.textSecondary,display:"block",marginBottom:4}}>{f.l}</label>
                        <select value={newTourn[f.k]} onChange={function(e){var v=f.num?parseInt(e.target.value):e.target.value;setNewTourn(function(d){return Object.assign({},d,{[f.k]:v});});}}
                          style={{width:"100%",padding:"9px 10px",borderRadius:8,border:"1px solid "+t.border,background:t.inputBg,color:t.text,fontSize:12}}>
                          {f.opts.map(function(o){return<option key={o.v} value={o.v}>{o.l}</option>;})}
                        </select>
                      </div>
                    );
                  })}
                </div>
                <button onClick={function(){
                  if(!newTourn.name)return;
                  var nt={id:"t"+Date.now(),name:newTourn.name,skill:newTourn.skill,size:newTourn.size,status:"enrolling",format:newTourn.format||"league",surface:newTourn.surface||"Hard Court",entrants:[],waitlist:[],startDate:newTourn.startDate,deadlineDays:newTourn.deadlineDays,rounds:[],city:"Sydney"};
                  setTournaments(function(prev){return prev.concat([nt]);});
                  supabase.from('tournaments').insert(nt);
                  setNewTourn({name:"",skill:"Intermediate",size:16,startDate:"",deadlineDays:14,format:"league",surface:"Hard Court"});
                }}
                  style={{width:"100%",padding:"12px",borderRadius:11,border:"none",background:t.accent,color:"#fff",fontSize:14,fontWeight:700}}>
                  Create Tournament
                </button>
              </div>
              <div style={{display:"flex",flexDirection:"column",gap:8}}>
                {tournaments.map(function(t2){
                  var sc=t2.status==="active"?t.accent:t2.status==="enrolling"?t.orange:t.textTertiary;
                  return(
                    <div key={t2.id} style={{background:t.bgCard,border:"1px solid "+t.border,borderRadius:14,padding:"14px 16px"}}>
                      <div style={{display:"flex",alignItems:"flex-start",gap:10,marginBottom:6}}>
                        <div style={{flex:1}}>
                          <div style={{fontSize:14,fontWeight:700,color:t.text,marginBottom:2}}>{t2.name}</div>
                          <div style={{fontSize:12,color:t.textSecondary}}>{t2.skill+" · "+t2.size+" players · $"+(ENTRY_FEES[t2.size]||45)+" · "+(t2.entrants||[]).length+" enrolled"}</div>
                          {(t2.waitlist||[]).length>0&&<div style={{fontSize:11,color:t.purple,marginTop:1}}>{(t2.waitlist||[]).length+" on waitlist"}</div>}
                        </div>
                        <select value={t2.status} onChange={function(e){var v=e.target.value,id=t2.id;setTournaments(function(prev){return prev.map(function(x){if(x.id!==id)return x;var n=Object.assign({},x,{status:v});supabase.from('tournaments').upsert(n);return n;});});}}
                          style={{padding:"5px 8px",borderRadius:6,border:"1px solid "+sc,background:"transparent",color:sc,fontSize:11,fontWeight:600}}>
                          <option value="enrolling">Enrolling</option>
                          <option value="active">Active</option>
                          <option value="completed">Completed</option>
                        </select>
                      </div>
                      <button onClick={function(){setSelectedTournId(t2.id);setTab("tournaments");setTournDetailTab("overview");}}
                        style={{fontSize:12,color:t.accent,background:"none",border:"none",fontWeight:600,padding:0}}>View →</button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          {adminTab==="draws"&&(
            <div>
              <p style={{fontSize:13,color:t.textSecondary,marginBottom:14}}>Generate the draw to start the tournament. This locks enrollment and creates the match schedule.</p>
              {tournaments.filter(function(t2){return t2.status==="enrolling";}).length===0&&<div style={{textAlign:"center",padding:"30px",color:t.textTertiary,fontSize:13}}>No tournaments currently enrolling.</div>}
              <div style={{display:"flex",flexDirection:"column",gap:10}}>
                {tournaments.filter(function(t2){return t2.status==="enrolling";}).map(function(t2){
                  var enough=(t2.entrants||[]).length>=4;
                  var full=(t2.entrants||[]).length>=t2.size;
                  var fillPct2=Math.round((t2.entrants||[]).length/t2.size*100);
                  return(
                    <div key={t2.id} style={{background:t.bgCard,border:"1px solid "+t.border,borderRadius:14,padding:"14px 16px"}}>
                      <div style={{fontSize:13,fontWeight:700,color:t.text,marginBottom:3}}>{t2.name}</div>
                      <div style={{fontSize:12,color:t.textSecondary,marginBottom:10}}>{(t2.entrants||[]).length+" of "+t2.size+" enrolled · "+(t2.format==="league"?"League":"Elimination")}</div>
                      <div style={{height:5,background:t.bgTertiary,borderRadius:3,overflow:"hidden",marginBottom:10}}>
                        <div style={{height:"100%",width:fillPct2+"%",background:full?t.green:t.accent,borderRadius:3}}/>
                      </div>
                      {(t2.entrants||[]).length>0&&(
                        <div style={{display:"flex",flexWrap:"wrap",gap:5,marginBottom:10}}>
                          {(t2.entrants||[]).map(function(e){
                            return(
                              <div key={e.id} style={{display:"flex",alignItems:"center",gap:5,background:t.bgTertiary,border:"1px solid "+t.border,borderRadius:6,padding:"3px 8px"}}>
                                <PlayerAvatar name={e.name} avatar={e.avatar} size={18}/>
                                <span style={{fontSize:11,color:t.text}}>{e.name.split(" ")[0]}</span>
                              </div>
                            );
                          })}
                        </div>
                      )}
                      <button onClick={function(){if(enough)generateDraw(t2.id);}} disabled={!enough}
                        style={{width:"100%",padding:"10px",borderRadius:10,border:"none",background:enough?t.accent:t.bgTertiary,color:enough?"#fff":t.textTertiary,fontSize:13,fontWeight:700}}>
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
              <p style={{fontSize:13,color:t.textSecondary,marginBottom:14}}>Record results as the umpire. Winners advance automatically.</p>
              {tournaments.filter(function(t2){return t2.status==="active";}).length===0&&<div style={{textAlign:"center",padding:"30px",color:t.textTertiary,fontSize:13}}>No active tournaments.</div>}
              {tournaments.filter(function(t2){return t2.status==="active";}).map(function(t2){
                return(
                  <div key={t2.id} style={{marginBottom:22}}>
                    <div style={{fontSize:13,fontWeight:700,color:t.accent,marginBottom:10}}>{t2.name}</div>
                    {(t2.rounds||[]).map(function(r,ri){
                      var pending=(r.matches||[]).filter(function(m){return m.status!=="complete"&&m.p1&&m.p2;});
                      if(!pending.length)return null;
                      return(
                        <div key={ri} style={{marginBottom:12}}>
                          <div style={{fontSize:11,fontWeight:600,color:t.textSecondary,marginBottom:6}}>
                            {r.type==="semi"?"Semifinals":r.type==="final"?"Final":"League Round "+r.round}
                          </div>
                          {pending.map(function(m){
                            return(
                              <div key={m.id} style={{background:t.bgCard,border:"1px solid "+t.border,borderRadius:12,padding:"12px 14px",marginBottom:6}}>
                                <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}>
                                  <PlayerAvatar name={m.p1.name} avatar={m.p1.avatar} size={28}/>
                                  <span style={{fontSize:13,fontWeight:600,color:t.text}}>{m.p1.name}</span>
                                  <span style={{fontSize:11,color:t.textTertiary,margin:"0 4px"}}>vs</span>
                                  <PlayerAvatar name={m.p2.name} avatar={m.p2.avatar} size={28}/>
                                  <span style={{fontSize:13,fontWeight:600,color:t.text}}>{m.p2.name}</span>
                                </div>
                                {m.scheduledDate&&<div style={{fontSize:11,color:t.textTertiary,marginBottom:8}}>{m.scheduledDate+" · "+m.scheduledTime+" · "+m.scheduledCourt}</div>}
                                <div style={{display:"flex",gap:8}}>
                                  <button onClick={function(){recordResult(t2.id,ri,m.id,m.p1.id);}}
                                    style={{flex:1,padding:"9px",borderRadius:9,border:"1px solid "+t.border,background:t.bgTertiary,color:t.text,fontSize:12,fontWeight:600}}>
                                    {m.p1.name.split(" ")[0]} wins
                                  </button>
                                  <button onClick={function(){recordResult(t2.id,ri,m.id,m.p2.id);}}
                                    style={{flex:1,padding:"9px",borderRadius:9,border:"1px solid "+t.border,background:t.bgTertiary,color:t.text,fontSize:12,fontWeight:600}}>
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
        <div onClick={function(){setScheduleModal(null);}} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.55)",backdropFilter:"blur(14px)",display:"flex",alignItems:"flex-end",justifyContent:"center",zIndex:200}}>
          <div onClick={function(e){e.stopPropagation();}} className="slide-up" style={{background:t.modalBg,borderRadius:"22px 22px 0 0",padding:"24px 22px 48px",width:"100%",maxWidth:540}}>
            <h2 style={{fontSize:20,fontWeight:700,color:t.text,marginBottom:4}}>Schedule Match</h2>
            <p style={{fontSize:12,color:t.textSecondary,marginBottom:18}}>{PILOT_VENUE.name} · Players book own court</p>
            {[{l:"Date",k:"date",type:"date"},{l:"Time",k:"time",type:"text",ph:"e.g. 6:00 PM"},{l:"Court",k:"court",type:"text",ph:"e.g. Court 3"}].map(function(f){
              return(
                <div key={f.k} style={{marginBottom:12}}>
                  <label style={{fontSize:11,fontWeight:600,color:t.textSecondary,display:"block",marginBottom:5}}>{f.l}</label>
                  <input type={f.type} value={scheduleDraft[f.k]} onChange={function(e){var v=e.target.value;setScheduleDraft(function(d){return Object.assign({},d,{[f.k]:v});});}}
                    placeholder={f.ph||""} style={{width:"100%",padding:"12px 14px",borderRadius:11,border:"1px solid "+t.border,background:t.inputBg,color:t.text,fontSize:14}}/>
                </div>
              );
            })}
            <div style={{background:t.accentSubtle,border:"1px solid "+t.accent+"33",borderRadius:9,padding:"9px 12px",marginBottom:14}}>
              <a href={PILOT_VENUE.url} target="_blank" rel="noopener noreferrer" style={{fontSize:12,color:t.accent,fontWeight:600,textDecoration:"none"}}>Book at {PILOT_VENUE.name} →</a>
              <span style={{fontSize:12,color:t.green,marginLeft:10}}>New balls provided</span>
            </div>
            <div style={{display:"flex",gap:8}}>
              <button onClick={function(){setScheduleModal(null);}}
                style={{flex:1,padding:"12px",borderRadius:12,border:"none",background:t.bgTertiary,color:t.text,fontSize:13,fontWeight:600}}>Cancel</button>
              <button onClick={function(){scheduleMatch(scheduleModal.tournId,scheduleModal.roundIdx,scheduleModal.matchId,scheduleDraft.date,scheduleDraft.time,scheduleDraft.court);setScheduleModal(null);}}
                style={{flex:2,padding:"12px",borderRadius:12,border:"none",background:t.accent,color:"#fff",fontSize:13,fontWeight:700}}>Save</button>
            </div>
          </div>
        </div>
      )}

      {/* ── SCORE MODAL ── */}
      {scoreModal&&(
        <div onClick={function(){setScoreModal(null);}} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.55)",backdropFilter:"blur(14px)",display:"flex",alignItems:"flex-end",justifyContent:"center",zIndex:200}}>
          <div onClick={function(e){e.stopPropagation();}} className="slide-up" style={{background:t.modalBg,borderRadius:"22px 22px 0 0",padding:"24px 22px 48px",width:"100%",maxWidth:540}}>
            <h2 style={{fontSize:20,fontWeight:700,color:t.text,marginBottom:4}}>Log Result</h2>
            <p style={{fontSize:12,color:t.textSecondary,marginBottom:18}}>{"vs "+scoreModal.oppName+" · "+scoreModal.tournName}</p>
            <div style={{marginBottom:16}}>
              <label style={{fontSize:11,fontWeight:600,color:t.textSecondary,display:"block",marginBottom:8}}>Result</label>
              <div style={{display:"flex",gap:8}}>
                {[{id:"win",l:"Win",c:t.green},{id:"loss",l:"Loss",c:t.red}].map(function(r){
                  return(
                    <button key={r.id} onClick={function(){setScoreDraft(function(d){return Object.assign({},d,{result:r.id});});}}
                      style={{flex:1,padding:"12px",borderRadius:12,border:"2px solid "+(scoreDraft.result===r.id?r.c:t.border),background:scoreDraft.result===r.id?r.c+"22":"transparent",fontSize:15,fontWeight:scoreDraft.result===r.id?700:400,color:scoreDraft.result===r.id?r.c:t.textSecondary}}>
                      {r.l}
                    </button>
                  );
                })}
              </div>
            </div>
            <div style={{marginBottom:16}}>
              <div style={{display:"flex",justifyContent:"space-between",marginBottom:8}}>
                <label style={{fontSize:11,fontWeight:600,color:t.textSecondary}}>Sets</label>
                {scoreDraft.sets.length<5&&(
                  <button onClick={function(){setScoreDraft(function(d){return Object.assign({},d,{sets:d.sets.concat([{you:"",them:""}])});});}}
                    style={{background:"transparent",border:"1px solid "+t.accent+"55",borderRadius:6,padding:"2px 10px",fontSize:11,color:t.accent,fontWeight:600}}>+ Set</button>
                )}
              </div>
              {scoreDraft.sets.map(function(set,si){
                return(
                  <div key={si} style={{display:"grid",gridTemplateColumns:"72px 1fr 1fr 26px",gap:8,marginBottom:8,alignItems:"center"}}>
                    <span style={{fontSize:12,fontWeight:600,color:t.textSecondary}}>Set {si+1}</span>
                    {["you","them"].map(function(who){
                      return(
                        <input key={who} type="number" min="0" max="7" value={set[who]} onChange={function(e){var v=e.target.value;setScoreDraft(function(d){var ns=d.sets.map(function(ss,idx){return idx!==si?ss:Object.assign({},ss,{[who]:v});});return Object.assign({},d,{sets:ns});});}}
                          placeholder="0" style={{padding:"10px 0",textAlign:"center",borderRadius:9,border:"1px solid "+t.border,background:t.inputBg,color:t.text,fontSize:20,fontWeight:700,width:"100%"}}/>
                      );
                    })}
                    {scoreDraft.sets.length>1
                      ?<button onClick={function(){setScoreDraft(function(d){return Object.assign({},d,{sets:d.sets.filter(function(_,idx){return idx!==si;})});});}}
                          style={{background:"none",border:"none",color:t.textTertiary,fontSize:16,padding:0}}>×</button>
                      :<div/>
                    }
                  </div>
                );
              })}
            </div>
            <div style={{display:"flex",gap:8}}>
              <button onClick={function(){setScoreModal(null);}}
                style={{flex:1,padding:"12px",borderRadius:12,border:"none",background:t.bgTertiary,color:t.text,fontSize:13,fontWeight:600}}>Cancel</button>
              <button onClick={function(){
                var clean=scoreDraft.sets.filter(function(s){return s.you!==""||s.them!=="";});
                var nm={id:"h"+Date.now(),oppName:scoreModal.oppName,tournName:scoreModal.tournName,date:fmtDate(new Date()),sets:clean,result:scoreDraft.result,notes:""};
                setHistory(function(h){return[nm].concat(h);});
                if(authUser)supabase.from('match_history').insert(Object.assign({},nm,{user_id:authUser.id,match_date:nm.date}));
                if(scoreModal.winnerId1&&scoreModal.winnerId2){
                  var winnerId=scoreDraft.result==="win"?scoreModal.winnerId1:scoreModal.winnerId2;
                  recordResult(scoreModal.tournId,scoreModal.roundIdx,scoreModal.matchId,winnerId);
                }
                setScoreModal(null);
              }}
                style={{flex:2,padding:"12px",borderRadius:12,border:"none",background:t.accent,color:"#fff",fontSize:13,fontWeight:700}}>Save result</button>
            </div>
          </div>
        </div>
      )}

      {/* ── AUTH MODAL ── */}
      {showAuth&&(
        <div onClick={function(){setShowAuth(false);setAuthError("");setAuthStep("choose");}} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.6)",backdropFilter:"blur(16px)",display:"flex",alignItems:"flex-end",justifyContent:"center",zIndex:300}}>
          <div onClick={function(e){e.stopPropagation();}} className="slide-up" style={{background:t.modalBg,borderRadius:"26px 26px 0 0",padding:"28px 24px 48px",width:"100%",maxWidth:480}}>
            <div style={{textAlign:"center",marginBottom:24}}>
              <div style={{width:48,height:48,borderRadius:13,background:t.accent,display:"flex",alignItems:"center",justifyContent:"center",fontSize:15,fontWeight:800,color:"#fff",margin:"0 auto 12px"}}>CS</div>
              <h2 style={{fontSize:22,fontWeight:700,color:t.text,marginBottom:5}}>{authMode==="signup"?"Create account":"Welcome back"}</h2>
              <p style={{fontSize:13,color:t.textSecondary}}>Enter tournaments and compete for prizes.</p>
            </div>
            {authStep==="choose"&&(
              <div style={{display:"flex",flexDirection:"column",gap:10}}>
                <button onClick={function(){setAuthStep("email");}}
                  style={{width:"100%",padding:"14px",borderRadius:13,border:"1px solid "+t.border,background:"transparent",color:t.text,fontSize:14,fontWeight:600}}>Continue with Email</button>
                <p style={{textAlign:"center",fontSize:13,color:t.textSecondary,marginTop:4}}>
                  {authMode==="login"?"No account? ":"Have an account? "}
                  <button onClick={function(){setAuthMode(authMode==="login"?"signup":"login");setAuthError("");}}
                    style={{background:"none",border:"none",color:t.accent,fontWeight:600,fontSize:13}}>
                    {authMode==="login"?"Sign up":"Log in"}
                  </button>
                </p>
              </div>
            )}
            {authStep==="email"&&(
              <div className="fade-up">
                {authMode==="signup"&&(
                  <div style={{marginBottom:10}}>
                    <label style={{fontSize:11,fontWeight:600,color:t.textSecondary,display:"block",marginBottom:5}}>Full name</label>
                    <input value={authName} onChange={function(e){setAuthName(e.target.value);setAuthError("");}} placeholder="Your name"
                      style={{width:"100%",padding:"12px 14px",borderRadius:11,border:"1px solid "+(authError?t.red:t.border),background:t.inputBg,color:t.text,fontSize:14}}/>
                  </div>
                )}
                <div style={{marginBottom:10}}>
                  <label style={{fontSize:11,fontWeight:600,color:t.textSecondary,display:"block",marginBottom:5}}>Email</label>
                  <input type="email" value={authEmail} onChange={function(e){setAuthEmail(e.target.value);setAuthError("");}} placeholder="you@example.com"
                    style={{width:"100%",padding:"12px 14px",borderRadius:11,border:"1px solid "+(authError?t.red:t.border),background:t.inputBg,color:t.text,fontSize:14}}/>
                </div>
                <div style={{marginBottom:18}}>
                  <label style={{fontSize:11,fontWeight:600,color:t.textSecondary,display:"block",marginBottom:5}}>Password</label>
                  <input type="password" value={authPassword} onChange={function(e){setAuthPassword(e.target.value);setAuthError("");}} placeholder={authMode==="signup"?"Min 6 characters":"Your password"}
                    style={{width:"100%",padding:"12px 14px",borderRadius:11,border:"1px solid "+(authError?t.red:t.border),background:t.inputBg,color:t.text,fontSize:14}}/>
                </div>
                {authError&&<p style={{fontSize:12,color:t.red,marginBottom:10,textAlign:"center"}}>{authError}</p>}
                <button onClick={async function(){
                  if(!authEmail||!authPassword){setAuthError("Please fill in all fields.");return;}
                  if(authMode==="signup"&&!authName){setAuthError("Please enter your name.");return;}
                  setAuthLoading(true);setAuthError("");
                  var r=authMode==="signup"
                    ?await supabase.auth.signUp({email:authEmail,password:authPassword,options:{data:{name:authName}}})
                    :await supabase.auth.signInWithPassword({email:authEmail,password:authPassword});
                  setAuthLoading(false);
                  if(r.error){setAuthError(r.error.message);return;}
                  setShowAuth(false);setAuthStep("choose");setAuthEmail("");setAuthPassword("");setAuthName("");
                }} disabled={authLoading}
                  style={{width:"100%",padding:"13px",borderRadius:13,border:"none",background:t.accent,color:"#fff",fontSize:14,fontWeight:700,opacity:authLoading?0.7:1}}>
                  {authLoading?"Please wait...":authMode==="signup"?"Create account":"Log in"}
                </button>
                <button onClick={function(){setAuthStep("choose");setAuthError("");}}
                  style={{width:"100%",marginTop:8,padding:"10px",background:"none",border:"none",color:t.textSecondary,fontSize:12}}>Back</button>
              </div>
            )}
          </div>
        </div>
      )}

    </div>
  );
}
