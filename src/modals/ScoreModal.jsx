import { supabase } from "../supabase.js";
import { avColor } from "../lib/helpers.js";
import { inputStyle } from "../lib/theme.js";

export default function ScoreModal({
  t, authUser, scoreModal, setScoreModal,
  scoreDraft, setScoreDraft,
  casualOppName, setCasualOppName,
  showOppDrop, setShowOppDrop,
  friends, suggestedPlayers,
  history, setHistory, profile, setProfile,
  recordResult,
}) {
  var iStyle=inputStyle(t);
  if(!scoreModal) return null;
  return (
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
                style={Object.assign({},iStyle,{fontSize:14,marginBottom:0})}/>
              {showOppDrop&&(function(){
                var q=(casualOppName||"").trim().toLowerCase();
                var all=friends.concat(suggestedPlayers.filter(function(s){return!friends.some(function(f){return f.id===s.id;});}));
                var hits=q?all.filter(function(u){return u.name&&u.name.toLowerCase().includes(q);}):friends.slice(0,6);
                if(!hits.length) return null;
                return (
                  <div style={{position:"absolute",top:"calc(100% + 4px)",left:0,right:0,background:t.bgCard,border:"1px solid "+t.border,borderRadius:10,boxShadow:"0 8px 28px rgba(0,0,0,0.14)",zIndex:400,overflow:"hidden"}}>
                    {hits.map(function(u){
                      return (
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
            style={Object.assign({},iStyle,{fontSize:14,marginBottom:0})}/>
        </div>

        <div style={{marginBottom:16}}>
          <label style={{fontSize:10,fontWeight:700,color:t.textSecondary,display:"block",marginBottom:8,letterSpacing:"0.06em",textTransform:"uppercase"}}>Result</label>
          <div style={{display:"flex",gap:8}}>
            {[{id:"win",l:"Win",c:t.green},{id:"loss",l:"Loss",c:t.red}].map(function(r){
              var on=scoreDraft.result===r.id;
              return (
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
            return (
              <div key={si} style={{display:"grid",gridTemplateColumns:"60px 1fr 1fr 24px",gap:8,marginBottom:8,alignItems:"center"}}>
                <span style={{fontSize:12,fontWeight:500,color:t.textSecondary}}>Set {si+1}</span>
                {["you","them"].map(function(who){
                  return (
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
                  setHistory(function(h){return h.map(function(m){return m.id===localId?Object.assign({},m,{id:matchId}):m;});});
                  var taggedFriend=friends.find(function(f){return f.name&&f.name.toLowerCase()===resolvedOpp.toLowerCase();});
                  if(taggedFriend){
                    await supabase.from('match_history').update({tagged_user_id:taggedFriend.id}).eq('id',matchId);
                    await supabase.from('notifications').insert({user_id:taggedFriend.id,type:'match_tag',from_user_id:authUser.id,match_id:matchId});
                  }
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
  );
}
