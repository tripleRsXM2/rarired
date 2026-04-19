import { supabase } from "../../../lib/supabase.js";
import PlayerAvatar from "../../../components/ui/PlayerAvatar.jsx";
import { ENTRY_FEES, PRIZES, SKILL_LEVELS } from "../../../lib/constants.js";
import { netRevenue } from "../../../lib/helpers.js";
import { inputStyle } from "../../../lib/theme.js";

export default function AdminTab({
  t, tournaments, setTournaments, adminTab, setAdminTab,
  newTourn, setNewTourn, myId, profile,
  seedTournament, generateDraw, recordResult,
  setSelectedTournId, setTab, setTournDetailTab,
}) {
  var iStyle=inputStyle(t);
  return (
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
            return (
              <div key={size} style={{flex:1,background:t.bgTertiary,borderRadius:8,padding:"10px",textAlign:"center"}}>
                <div style={{fontSize:10,color:t.textTertiary,marginBottom:2}}>{size} players</div>
                <div style={{fontSize:12,fontWeight:700,color:t.text}}>${ENTRY_FEES[size]}</div>
                <div style={{fontSize:11,color:t.accent,marginTop:1}}>~${netRevenue(size)} net</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Sub-tabs */}
      <div style={{display:"flex",gap:0,marginBottom:24,borderBottom:"1px solid "+t.border}}>
        {["tournaments","draws","results"].map(function(at){
          var on=adminTab===at;
          return (
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
              return (
                <div key={f.k} style={{marginBottom:10}}>
                  <label style={{fontSize:11,fontWeight:600,color:t.textSecondary,display:"block",marginBottom:4,letterSpacing:"0.04em",textTransform:"uppercase"}}>{f.l}</label>
                  <input type={f.type} value={newTourn[f.k]} placeholder={f.ph||""}
                    onChange={function(e){var v=e.target.value;setNewTourn(function(d){return Object.assign({},d,{[f.k]:v});});}}
                    style={iStyle}/>
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
                return (
                  <div key={f.k}>
                    <label style={{fontSize:11,fontWeight:600,color:t.textSecondary,display:"block",marginBottom:4,letterSpacing:"0.04em",textTransform:"uppercase"}}>{f.l}</label>
                    <select value={newTourn[f.k]}
                      onChange={function(e){var v=f.num?parseInt(e.target.value):e.target.value;setNewTourn(function(d){return Object.assign({},d,{[f.k]:v});});}}
                      style={Object.assign({},iStyle,{padding:"9px 10px",fontSize:12})}>
                      {f.opts.map(function(o){return <option key={o.v} value={o.v}>{o.l}</option>;})}
                    </select>
                  </div>
                );
              })}
            </div>
            <button
              onClick={function(){
                if(!newTourn.name) return;
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
              return (
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
              return (
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
                        return (
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
                    {full?"Generate draw":enough?"Generate draw ("+(t2.entrants||[]).length+" players)":"Need at least 4 entrants"}
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
            return (
              <div key={t2.id} style={{marginBottom:24}}>
                <div style={{fontSize:13,fontWeight:700,color:t.text,marginBottom:12}}>{t2.name}</div>
                {(t2.rounds||[]).map(function(r,ri){
                  var pending=(r.matches||[]).filter(function(m){return m.status!=="complete"&&m.p1&&m.p2;});
                  if(!pending.length) return null;
                  return (
                    <div key={ri} style={{marginBottom:12}}>
                      <div style={{fontSize:10,fontWeight:700,color:t.textTertiary,textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:8}}>
                        {r.type==="semi"?"Semifinals":r.type==="final"?"Final":"League Round "+r.round}
                      </div>
                      {pending.map(function(m){
                        return (
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
  );
}
