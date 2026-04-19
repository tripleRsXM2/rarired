import PlayerAvatar from "../../../components/ui/PlayerAvatar.jsx";
import { computeStandings, roundLabel } from "../../../lib/helpers.js";

export default function BracketView({tournament, myId, t}) {
  var isLeague=tournament.format==="league";
  var rounds=tournament.rounds||[];

  if(!isLeague) {
    return (
      <div>
        {rounds.map(function(r,ri){
          return (
            <div key={ri} style={{marginBottom:24}}>
              <div style={{fontSize:11,fontWeight:700,color:t.textTertiary,letterSpacing:"0.06em",textTransform:"uppercase",marginBottom:10}}>{roundLabel(r.round,tournament.size)}</div>
              <div style={{display:"flex",flexDirection:"column",gap:8}}>
                {(r.matches||[]).map(function(m){
                  var isMyMatch=(m.p1&&m.p1.id===myId)||(m.p2&&m.p2.id===myId);
                  return (
                    <div key={m.id} style={{
                      background:t.bgCard,
                      border:"1px solid "+(isMyMatch?t.accent+"55":t.border),
                      borderLeft:"3px solid "+(isMyMatch?t.accent:t.border),
                      borderRadius:8, overflow:"hidden"
                    }}>
                      {[m.p1,m.p2].map(function(player,pi){
                        if(!player) return <div key={pi} style={{padding:"10px 14px",color:t.textTertiary,fontSize:12,fontStyle:"italic",borderBottom:pi===0?"1px solid "+t.border:"none"}}>TBD</div>;
                        var isWinner=m.winner===player.id, isLoser=m.winner&&!isWinner;
                        return (
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

  return (
    <div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:12}}>
        {sfPairs.map(function(semi,si){
          return (
            <div key={si} style={{background:t.bgCard,border:"1px solid "+t.border,borderRadius:10,overflow:"hidden"}}>
              <div style={{padding:"6px 12px",background:t.bgTertiary,borderBottom:"1px solid "+t.border}}>
                <div style={{fontSize:9,fontWeight:700,color:t.textTertiary,textTransform:"uppercase",letterSpacing:"0.06em"}}>{semi.label}</div>
              </div>
              {[semi.p1,semi.p2].map(function(player,pi){
                var isWinner=semi.match&&semi.match.winner&&player&&player.id===semi.match.winner;
                var isLoser=semi.match&&semi.match.winner&&player&&!isWinner;
                return (
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
          return (
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
