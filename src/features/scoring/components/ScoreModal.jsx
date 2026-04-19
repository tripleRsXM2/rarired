import { useState } from "react";
import { avColor } from "../../../lib/helpers.js";
import { inputStyle } from "../../../lib/theme.js";

export default function ScoreModal({
  t, authUser, scoreModal, setScoreModal,
  scoreDraft, setScoreDraft,
  casualOppName, setCasualOppName,
  casualOppId, setCasualOppId,
  showOppDrop, setShowOppDrop,
  friends, suggestedPlayers,
  submitMatch, resubmitMatch, recordResult,
}) {
  var iStyle=inputStyle(t);
  var [saving,setSaving]=useState(false);
  var [saveError,setSaveError]=useState("");

  if(!scoreModal) return null;

  var isResubmit=!!scoreModal.resubmit;
  var isVerified=isResubmit?true:!!casualOppId;

  async function handleSave(){
    setSaveError("");
    var clean=scoreDraft.sets.filter(function(s){return s.you!==""||s.them!=="";});
    if(!clean.length){setSaveError("Add at least one set score.");return;}

    setSaving(true);

    if(isResubmit){
      var res=await resubmitMatch(scoreModal.match, scoreDraft);
      setSaving(false);
      if(res&&res.error){setSaveError("Failed to resubmit. Try again.");return;}
      setScoreModal(null);
      return;
    }

    var oppName=scoreModal.casual?(casualOppName.trim()||"Unknown"):scoreModal.oppName;
    var opponentId=scoreModal.casual?casualOppId:(scoreModal.opponentId||null);

    var res=await submitMatch({
      scoreModal,
      scoreDraft,
      oppName,
      opponentId,
    });
    setSaving(false);

    if(res&&res.error){
      if(res.error==='duplicate'){
        setSaveError("This match is already logged.");
      } else if(res.error!=='not_authenticated'){
        setSaveError("Failed to save. Try again.");
      }
      return;
    }

    // Tournament bracket recording (separate from stat/verification flow)
    if(scoreModal.winnerId1&&scoreModal.winnerId2){
      var winnerId=scoreDraft.result==="win"?scoreModal.winnerId1:scoreModal.winnerId2;
      recordResult(scoreModal.tournId,scoreModal.roundIdx,scoreModal.matchId,winnerId);
    }

    setScoreModal(null);
    setCasualOppName("");
    setCasualOppId(null);
  }

  return (
    <div
      onClick={function(){setScoreModal(null);if(!isResubmit){setCasualOppName("");setCasualOppId(null);}}}
      style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.35)",backdropFilter:"blur(8px)",WebkitBackdropFilter:"blur(8px)",display:"flex",alignItems:"flex-end",justifyContent:"center",zIndex:200}}>
      <div
        onClick={function(e){e.stopPropagation();}}
        className="slide-up"
        style={{background:t.modalBg,borderTop:"1px solid "+t.border,borderRadius:"16px 16px 0 0",padding:"24px 22px 48px",width:"100%",maxWidth:540,maxHeight:"92vh",overflowY:"auto"}}>
        <div style={{width:32,height:3,borderRadius:2,background:t.border,margin:"0 auto 20px"}}/>
        <h2 style={{fontSize:18,fontWeight:700,color:t.text,marginBottom:16,letterSpacing:"-0.3px"}}>{isResubmit?"Edit & Resubmit":"Log Result"}</h2>

        {/* Resubmit mode: locked opponent */}
        {isResubmit&&(
          <div style={{marginBottom:16,padding:"10px 14px",borderRadius:8,background:t.bgTertiary,border:"1px solid "+t.border}}>
            <div style={{fontSize:10,fontWeight:700,color:t.textTertiary,textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:3}}>Opponent</div>
            <div style={{fontSize:14,fontWeight:600,color:t.text}}>{scoreModal.oppName}</div>
            <div style={{fontSize:11,color:t.textSecondary,marginTop:2}}>Corrected result will be sent to your opponent to confirm again</div>
          </div>
        )}

        {/* Opponent field — new match only */}
        {!isResubmit&&scoreModal.casual
          ?<div style={{marginBottom:16}}>
            <label style={{fontSize:10,fontWeight:700,color:t.textSecondary,display:"block",marginBottom:6,letterSpacing:"0.06em",textTransform:"uppercase"}}>Opponent</label>
            <div style={{position:"relative"}}>
              <input value={casualOppName} placeholder="Type a name…"
                onChange={function(e){
                  setCasualOppName(e.target.value);
                  setCasualOppId(null); // clear selection if they retype
                  setShowOppDrop(true);
                }}
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
                        <div key={u.id}
                          onMouseDown={function(){
                            setCasualOppName(u.name);
                            setCasualOppId(u.id);
                            setShowOppDrop(false);
                          }}
                          style={{display:"flex",alignItems:"center",gap:10,padding:"10px 14px",cursor:"pointer",borderBottom:"1px solid "+t.border}}>
                          <div style={{width:30,height:30,borderRadius:"50%",background:avColor(u.name),display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:700,color:"#fff",flexShrink:0}}>
                            {(u.avatar&&u.avatar.length<=2)?u.avatar:(u.name||"?").slice(0,2).toUpperCase()}
                          </div>
                          <div style={{flex:1}}>
                            <div style={{fontSize:13,fontWeight:600,color:t.text}}>{u.name}</div>
                            {u.skill&&<div style={{fontSize:11,color:t.textTertiary}}>{u.skill}</div>}
                          </div>
                          <span style={{fontSize:9,fontWeight:700,color:t.accent,letterSpacing:"0.05em",textTransform:"uppercase"}}>Verified</span>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </div>

            {/* Verification mode indicator */}
            {casualOppName.trim()&&(
              <div style={{marginTop:8,padding:"8px 12px",borderRadius:8,border:"1px solid "+(isVerified?t.accent:t.border),background:isVerified?t.accentSubtle:t.bgTertiary,display:"flex",alignItems:"center",gap:8}}>
                <span style={{fontSize:13}}>{isVerified?"✓":"○"}</span>
                <div>
                  <div style={{fontSize:11,fontWeight:700,color:isVerified?t.accent:t.textSecondary}}>
                    {isVerified?"Verified match":"Casual match"}
                  </div>
                  <div style={{fontSize:10,color:t.textTertiary,marginTop:1}}>
                    {isVerified
                      ?"Opponent will confirm — stats update after they accept"
                      :"Logged for records only — does not affect ELO or W/L"}
                  </div>
                </div>
              </div>
            )}
          </div>
          :(!isResubmit&&<p style={{fontSize:12,color:t.textSecondary,marginBottom:16}}>vs {scoreModal.oppName} · {scoreModal.tournName}</p>)
        }

        {/* Date */}
        <div style={{marginBottom:16}}>
          <label style={{fontSize:10,fontWeight:700,color:t.textSecondary,display:"block",marginBottom:6,letterSpacing:"0.06em",textTransform:"uppercase"}}>Date</label>
          <input type="date" value={scoreDraft.date}
            onChange={function(e){setScoreDraft(function(d){return Object.assign({},d,{date:e.target.value});});}}
            style={Object.assign({},iStyle,{fontSize:14,marginBottom:0})}/>
        </div>

        {/* Result */}
        <div style={{marginBottom:16}}>
          <label style={{fontSize:10,fontWeight:700,color:t.textSecondary,display:"block",marginBottom:8,letterSpacing:"0.06em",textTransform:"uppercase"}}>Result</label>
          <div style={{display:"flex",gap:8}}>
            {[{id:"win",l:"Win",c:t.green},{id:"loss",l:"Loss",c:t.red}].map(function(r){
              var on=scoreDraft.result===r.id;
              return (
                <button key={r.id}
                  onClick={function(){setScoreDraft(function(d){return Object.assign({},d,{result:r.id});});}}
                  style={{flex:1,padding:"12px",borderRadius:9,border:"1px solid "+(on?r.c:t.border),background:on?r.c+"18":"transparent",fontSize:15,fontWeight:on?700:400,color:on?r.c:t.textSecondary}}>
                  {r.l}
                </button>
              );
            })}
          </div>
        </div>

        {/* Sets */}
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
                  ?<button onClick={function(){setScoreDraft(function(d){return Object.assign({},d,{sets:d.sets.filter(function(_,idx){return idx!==si;})});});}} style={{background:"none",border:"none",color:t.textTertiary,fontSize:16,padding:0}}>×</button>
                  :<div/>
                }
              </div>
            );
          })}
        </div>

        {/* Venue + Court */}
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:16}}>
          <div>
            <label style={{fontSize:10,fontWeight:700,color:t.textSecondary,display:"block",marginBottom:6,letterSpacing:"0.06em",textTransform:"uppercase"}}>Venue</label>
            <input value={scoreDraft.venue||""} placeholder="e.g. Moore Park"
              onChange={function(e){setScoreDraft(function(d){return Object.assign({},d,{venue:e.target.value});});}}
              style={Object.assign({},iStyle,{fontSize:13,marginBottom:0})}/>
          </div>
          <div>
            <label style={{fontSize:10,fontWeight:700,color:t.textSecondary,display:"block",marginBottom:6,letterSpacing:"0.06em",textTransform:"uppercase"}}>Court</label>
            <input value={scoreDraft.court||""} placeholder="e.g. Court 3"
              onChange={function(e){setScoreDraft(function(d){return Object.assign({},d,{court:e.target.value});});}}
              style={Object.assign({},iStyle,{fontSize:13,marginBottom:0})}/>
          </div>
        </div>

        {/* Error */}
        {saveError&&(
          <div style={{marginBottom:12,padding:"10px 14px",borderRadius:8,background:t.redSubtle,border:"1px solid "+t.red+"44",fontSize:12,color:t.red,fontWeight:500}}>
            {saveError}
          </div>
        )}

        {/* Actions */}
        <div style={{display:"flex",gap:8}}>
          <button
            onClick={function(){setScoreModal(null);if(!isResubmit){setCasualOppName("");setCasualOppId(null);}}}
            style={{flex:1,padding:"12px",borderRadius:8,border:"1px solid "+t.border,background:"transparent",color:t.text,fontSize:13,fontWeight:500}}>
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            style={{flex:2,padding:"12px",borderRadius:8,border:"none",background:saving?t.border:t.accent,color:"#fff",fontSize:13,fontWeight:600,opacity:saving?0.7:1}}>
            {saving?"Saving…":isResubmit?"Resubmit for confirmation":(isVerified&&scoreModal.casual?"Submit for confirmation":"Save result")}
          </button>
        </div>
      </div>
    </div>
  );
}
