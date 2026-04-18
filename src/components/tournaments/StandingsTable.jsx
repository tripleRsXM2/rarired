import PlayerAvatar from "../common/PlayerAvatar.jsx";
import { computeStandings } from "../../lib/helpers.js";

export default function StandingsTable({tournament, myId, t}) {
  var rows=computeStandings(tournament);
  var qZone=Math.min(4,rows.length);
  if(!rows.length) return (
    <div style={{textAlign:"center",padding:"40px 0",color:t.textTertiary,fontSize:13}}>No matches played yet.</div>
  );
  return (
    <div>
      <div style={{background:t.bgCard,border:"1px solid "+t.border,borderRadius:10,overflow:"hidden"}}>
        <div style={{
          display:"grid", gridTemplateColumns:"28px 1fr 32px 32px 32px 40px",
          gap:8, padding:"8px 16px",
          borderBottom:"1px solid "+t.border
        }}>
          {["#","Player","P","W","L","Pts"].map(function(h,hi){
            return <div key={h} style={{fontSize:10,fontWeight:700,color:t.textTertiary,textAlign:hi>1?"right":"left",letterSpacing:"0.05em"}}>{h}</div>;
          })}
        </div>
        {rows.map(function(p,i){
          var rank=i+1, qualified=rank<=qZone, isMe=p.id===myId;
          var rankColor=rank===1?t.gold:rank===2?t.textSecondary:rank===3?t.orange:t.textTertiary;
          return (
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
                return <div key={vi} style={{textAlign:"right",fontSize:12,color:t.textSecondary,fontVariantNumeric:"tabular-nums"}}>{v}</div>;
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
