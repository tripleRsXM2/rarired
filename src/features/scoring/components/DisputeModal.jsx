// src/features/scoring/components/DisputeModal.jsx
import { useState } from "react";
import { inputStyle } from "../../../lib/theme.js";
import { validateMatchScore } from "../utils/tennisScoreValidation.js";

var REASONS=[
  {code:'wrong_score',  label:'Score is wrong'},
  {code:'wrong_winner', label:'Winner is wrong'},
  {code:'wrong_date',   label:'Date is wrong'},
  {code:'wrong_venue',  label:'Venue or court is wrong'},
  {code:'not_my_match', label:"I didn't play this match"},
  {code:'other',        label:'Other'},
];

// Compute who the sets say won. Skip blanks / NaN. Returns
// "win" | "loss" | null. Mirrors ScoreModal.winnerBySets exactly so
// the dispute path enforces the same "result vs sets" consistency
// check users see when logging a fresh match.
function winnerBySets(sets){
  if (!sets || !sets.length) return null;
  var ys = 0, ts = 0;
  sets.forEach(function (s) {
    var yStr = s.you  == null ? "" : String(s.you).trim();
    var tStr = s.them == null ? "" : String(s.them).trim();
    if (yStr === "" || tStr === "") return;
    var y = Number(yStr), th = Number(tStr);
    if (Number.isNaN(y) || Number.isNaN(th)) return;
    if (y === th) return;
    if (y > th) ys++; else ts++;
  });
  if (ys === ts) return null;
  return ys > ts ? "win" : "loss";
}

export default function DisputeModal({
  t, disputeModal, setDisputeModal,
  disputeDraft, setDisputeDraft,
  disputeWithProposal, counterPropose, voidMatchAction,
}){
  var iStyle=inputStyle(t);
  var [saving,setSaving]=useState(false);
  var [error,setError]=useState('');
  // Mismatch-acknowledgement gate. Same pattern ScoreModal uses:
  // when the picked result disagrees with what the sets say, show
  // "Heads up — …" and require a second tap to override. Reset to
  // false whenever scores OR the result picker change.
  var [mismatchAck, setMismatchAck] = useState(false);

  if(!disputeModal) return null;

  var match=disputeModal.match;
  var isCounter=disputeModal.mode==='counter';
  var isNotMyMatch=disputeDraft.reasonCode==='not_my_match';
  // At revision 3 (max), the person who is counter-proposing will push to round 4 — auto-void instead
  var wouldAutoVoid=isCounter&&(match.revisionCount||0)>=3;

  function setDraft(key, val){
    // Any draft change resets the mismatch ack so a stale "tap again
    // to keep" gate from a previous score combo can't slip through.
    setMismatchAck(false);
    setDisputeDraft(function(d){return Object.assign({},d,{[key]:val});});
  }

  // Build validator options that mirror the original match's mode +
  // league context — disputes inherit the original match's
  // match_type and league rules. Falls back to ranked+completed
  // (the strictest) when those aren't known.
  function buildDisputeValidatorOptions(){
    var matchType = match && match.match_type ? match.match_type : 'ranked';
    return {
      matchType: matchType,
      // Disputes always replace the match end-to-end with a corrected
      // version. We require a valid completed match — no
      // "time_limited / unfinished" partial proposals.
      completionType: 'completed',
      matchFormat: null,
      finalSetFormat: 'normal_set',
      allowPartialScores: false,
      requireTiebreakDetails: matchType === 'ranked',
      leagueMode: null,
      leagueAllowPartial: false,
    };
  }

  async function handleSubmit(){
    setError('');
    if(!disputeDraft.reasonCode){setError('Please select a reason.');return;}

    // Void shortcuts — no score validation needed.
    if(isNotMyMatch||wouldAutoVoid){
      setSaving(true);
      var voidRes=await voidMatchAction(match, isNotMyMatch?'not_my_match':'max_revisions');
      setSaving(false);
      if(!voidRes||voidRes.error){
        setError(voidRes&&voidRes.error?voidRes.error:'Could not void match — please try again.');
        return;
      }
      setDisputeModal(null);
      return;
    }

    var clean=disputeDraft.sets.filter(function(s){return s.you!==''||s.them!=='';});
    if(!clean.length){setError('Add at least one set score.');return;}

    // Score-pattern validation. Catches set patterns that aren't
    // valid completed sets (e.g. 5-4, 6-6) and matches that don't
    // resolve to a winner under the format rules. The original
    // submission path runs the same validator; the dispute path
    // used to skip it entirely, which let users submit
    // contradictory scores like "3-6, 4-6" + "I won".
    var v = validateMatchScore(clean, buildDisputeValidatorOptions());
    if (!v.ok) {
      setError(v.message || 'Score is not valid. Check the set scores above.');
      return;
    }

    // Result-vs-sets consistency. Same one-tap-override pattern
    // ScoreModal uses: if the user's picked result doesn't match
    // who actually won the sets, show a heads-up and require a
    // second tap. Prevents the exact reported bug (winner has
    // losing scores) without blocking edge cases the user might
    // genuinely intend.
    var whoWon = winnerBySets(clean);
    if (whoWon && whoWon !== disputeDraft.result && !mismatchAck) {
      setMismatchAck(true);
      setError(
        "Heads up — your set scores say you " + (whoWon === "win" ? "won" : "lost") +
        " but you picked " + (disputeDraft.result === "win" ? "I won" : "I lost") +
        ". Tap Submit again to keep it, or fix the scores above."
      );
      return;
    }

    setSaving(true);
    var proposal={sets:clean,result:disputeDraft.result,date:disputeDraft.date,venue:disputeDraft.venue,court:disputeDraft.court};
    var propRes=isCounter
      ?await counterPropose(match,disputeDraft.reasonCode,disputeDraft.reasonDetail,proposal)
      :await disputeWithProposal(match,disputeDraft.reasonCode,disputeDraft.reasonDetail,proposal);
    setSaving(false);
    if(propRes&&propRes.error){
      setError(typeof propRes.error==='string'?propRes.error:(propRes.error?.message||'Failed to submit. Try again.'));
      return;
    }
    setDisputeModal(null);
  }

  return (
    <div
      onClick={function(){setDisputeModal(null);}}
      style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.45)',backdropFilter:'blur(8px)',WebkitBackdropFilter:'blur(8px)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:200,padding:16}}>
      <div
        onClick={function(e){e.stopPropagation();}}
        className="pop"
        style={{background:t.modalBg,border:'1px solid '+t.border,borderRadius:16,padding:'22px 22px 24px',width:'100%',maxWidth:540,maxHeight:'90vh',overflowY:'auto',boxShadow:'0 20px 50px rgba(0,0,0,0.35)'}}>
        <h2 style={{fontSize:18,fontWeight:700,color:t.text,marginBottom:4,letterSpacing:'-0.3px'}}>
          {isCounter?'Counter-propose':'Dispute Match'}
        </h2>
        <p style={{fontSize:12,color:t.textSecondary,marginBottom:20}}>
          {isCounter
            ?'Propose your corrected version. Round '+(match.revisionCount||0)+' of 3 — after 3 the match is voided.'
            :"Tell us what's wrong and submit the correct version."}
        </p>

        {/* Reason picker */}
        <label style={{fontSize:10,fontWeight:700,color:t.textSecondary,display:'block',marginBottom:8,letterSpacing:'0.06em',textTransform:'uppercase'}}>Reason</label>
        <div style={{display:'flex',flexDirection:'column',gap:6,marginBottom:16}}>
          {REASONS.map(function(r){
            var on=disputeDraft.reasonCode===r.code;
            return (
              <button key={r.code}
                onClick={function(){setDraft('reasonCode',r.code);}}
                style={{textAlign:'left',padding:'10px 14px',borderRadius:8,border:'1px solid '+(on?t.accent:t.border),background:on?t.accentSubtle:'transparent',color:on?t.accent:t.text,fontSize:13,fontWeight:on?600:400,cursor:'pointer'}}>
                {r.label}
              </button>
            );
          })}
        </div>

        {/* Void-only shortcut for not_my_match */}
        {isNotMyMatch&&(
          <div style={{marginBottom:16,padding:'10px 14px',borderRadius:8,background:t.redSubtle,border:'1px solid '+t.red+'44'}}>
            <div style={{fontSize:12,color:t.red,fontWeight:600}}>This will void the match immediately.</div>
            <div style={{fontSize:11,color:t.textSecondary,marginTop:2}}>Use only if this match was logged against you by mistake.</div>
          </div>
        )}

        {/* Auto-void warning */}
        {wouldAutoVoid&&(
          <div style={{marginBottom:16,padding:'10px 14px',borderRadius:8,background:t.orangeSubtle,border:'1px solid '+t.orange+'44'}}>
            <div style={{fontSize:12,color:t.orange,fontWeight:600}}>Maximum rounds reached — this will void the match.</div>
          </div>
        )}

        {/* Correction form — shown before detail textarea so it's visible before keyboard opens */}
        {disputeDraft.reasonCode&&!isNotMyMatch&&!wouldAutoVoid&&(
          <>
            {/* Result */}
            <div style={{marginBottom:16}}>
              <label style={{fontSize:10,fontWeight:700,color:t.textSecondary,display:'block',marginBottom:8,letterSpacing:'0.06em',textTransform:'uppercase'}}>Correct result</label>
              <div style={{display:'flex',gap:8}}>
                {[{id:'win',l:'I won',c:t.green},{id:'loss',l:'I lost',c:t.red}].map(function(r){
                  var on=disputeDraft.result===r.id;
                  return (
                    <button key={r.id}
                      onClick={function(){setDraft('result',r.id);}}
                      style={{flex:1,padding:'11px',borderRadius:9,border:'1px solid '+(on?r.c:t.border),background:on?r.c+'18':'transparent',fontSize:14,fontWeight:on?700:400,color:on?r.c:t.textSecondary}}>
                      {r.l}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Sets */}
            <div style={{marginBottom:16}}>
              <div style={{display:'flex',justifyContent:'space-between',marginBottom:8,alignItems:'center'}}>
                <label style={{fontSize:10,fontWeight:700,color:t.textSecondary,letterSpacing:'0.06em',textTransform:'uppercase'}}>Correct score</label>
                {disputeDraft.sets.length<5&&(
                  <button
                    onClick={function(){setMismatchAck(false);setDisputeDraft(function(d){return Object.assign({},d,{sets:d.sets.concat([{you:'',them:''}])});});}}
                    style={{background:'transparent',border:'1px solid '+t.border,borderRadius:6,padding:'3px 10px',fontSize:11,color:t.textSecondary,fontWeight:500}}>
                    + Set
                  </button>
                )}
              </div>
              {/* Column headers — make it unambiguous which column
                  is whose so users can't enter their score in the
                  opponent's column by accident. Same YOU / THEM
                  framing the Log Match flow uses. */}
              <div style={{
                display:'grid',gridTemplateColumns:'60px 1fr 1fr 24px',
                gap:8,alignItems:'center',
                fontSize:9,fontWeight:800,letterSpacing:'0.16em',
                textTransform:'uppercase',color:t.textTertiary,
                marginBottom:6,
              }}>
                <span/>
                <span style={{textAlign:'center'}}>You</span>
                <span style={{textAlign:'center'}}>Them</span>
                <span/>
              </div>
              {disputeDraft.sets.map(function(set,si){
                // Same tiebreak-reveal pattern as ScoreModal — show the
                // inline tiebreak inputs only on a 7-6 / 6-7 set, drop
                // any stale tieBreak field when the set score moves
                // away from a tiebreak shape.
                var yNum = Number(String(set.you ?? '').trim());
                var tNum = Number(String(set.them ?? '').trim());
                var isTbShape = Number.isFinite(yNum) && Number.isFinite(tNum)
                  && ((yNum === 7 && tNum === 6) || (yNum === 6 && tNum === 7));
                return (
                  <div key={si} style={{ marginBottom: 8 }}>
                    <div style={{display:'grid',gridTemplateColumns:'60px 1fr 1fr 24px',gap:8,alignItems:'center'}}>
                      <span style={{fontSize:12,fontWeight:500,color:t.textSecondary}}>Set {si+1}</span>
                      {['you','them'].map(function(who){
                        return (
                          <input key={who} type="number" inputMode="numeric" pattern="[0-9]*" min="0" value={set[who]} placeholder="0"
                            onChange={function(e){
                              var v=e.target.value;
                              // Reset the mismatch ack so a stale
                              // "tap again to keep" gate from a
                              // previous score combo can't bypass
                              // the consistency check.
                              setMismatchAck(false);
                              setDisputeDraft(function(d){
                                var ns=d.sets.map(function(ss,idx){
                                  if (idx!==si) return ss;
                                  var next = Object.assign({}, ss, { [who]: v });
                                  var ny = Number(String(next.you ?? '').trim());
                                  var nt = Number(String(next.them ?? '').trim());
                                  var stillTb = Number.isFinite(ny) && Number.isFinite(nt)
                                    && ((ny === 7 && nt === 6) || (ny === 6 && nt === 7));
                                  if (!stillTb && next.tieBreak) {
                                    next = Object.assign({}, next);
                                    delete next.tieBreak;
                                  }
                                  return next;
                                });
                                return Object.assign({},d,{sets:ns});
                              });
                            }}
                            style={{padding:'10px 0',textAlign:'center',borderRadius:8,border:'1px solid '+t.border,background:t.inputBg,color:t.text,fontSize:20,fontWeight:700,width:'100%',fontVariantNumeric:'tabular-nums'}}/>
                        );
                      })}
                      {disputeDraft.sets.length>1
                        ?<button onClick={function(){setMismatchAck(false);setDisputeDraft(function(d){return Object.assign({},d,{sets:d.sets.filter(function(_,idx){return idx!==si;})});});}} style={{background:'none',border:'none',color:t.textTertiary,fontSize:16,padding:0}}>×</button>
                        :<div/>
                      }
                    </div>

                    {isTbShape && (
                      <div style={{display:'grid',gridTemplateColumns:'60px 1fr 1fr 24px',gap:8,marginTop:6,alignItems:'center'}}>
                        <span style={{fontSize:9,fontWeight:800,letterSpacing:'0.16em',textTransform:'uppercase',color:t.textTertiary}}>Tiebreak</span>
                        {['you','them'].map(function(who){
                          var tbVal = (set.tieBreak && set.tieBreak[who] != null) ? set.tieBreak[who] : '';
                          return (
                            <input key={who} type="number" inputMode="numeric" pattern="[0-9]*" min="0"
                              value={tbVal}
                              placeholder={who === (yNum === 7 ? 'you' : 'them') ? '7' : '0-5'}
                              onChange={function(e){
                                var v = e.target.value;
                                setMismatchAck(false);
                                setDisputeDraft(function(d){
                                  var ns = d.sets.map(function(ss, idx){
                                    if (idx !== si) return ss;
                                    var nextTb = Object.assign({}, ss.tieBreak || {});
                                    nextTb[who] = v;
                                    return Object.assign({}, ss, { tieBreak: nextTb });
                                  });
                                  return Object.assign({}, d, { sets: ns });
                                });
                              }}
                              style={{padding:'7px 0',textAlign:'center',borderRadius:6,border:'1px solid '+t.border,background:t.inputBg,color:t.text,fontSize:14,fontWeight:600,width:'100%',fontVariantNumeric:'tabular-nums'}}/>
                          );
                        })}
                        <div/>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Date */}
            <div style={{marginBottom:12}}>
              <label style={{fontSize:10,fontWeight:700,color:t.textSecondary,display:'block',marginBottom:6,letterSpacing:'0.06em',textTransform:'uppercase'}}>Correct date</label>
              <input type="date" value={disputeDraft.date}
                onChange={function(e){setDraft('date',e.target.value);}}
                style={Object.assign({},iStyle,{fontSize:14,marginBottom:0})}/>
            </div>

            {/* Venue + Court */}
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginBottom:16}}>
              <div>
                <label style={{fontSize:10,fontWeight:700,color:t.textSecondary,display:'block',marginBottom:6,letterSpacing:'0.06em',textTransform:'uppercase'}}>Venue</label>
                <input value={disputeDraft.venue} placeholder="e.g. Moore Park"
                  onChange={function(e){setDraft('venue',e.target.value);}}
                  style={Object.assign({},iStyle,{fontSize:13,marginBottom:0})}/>
              </div>
              <div>
                <label style={{fontSize:10,fontWeight:700,color:t.textSecondary,display:'block',marginBottom:6,letterSpacing:'0.06em',textTransform:'uppercase'}}>Court</label>
                <input value={disputeDraft.court} placeholder="e.g. Court 3"
                  onChange={function(e){setDraft('court',e.target.value);}}
                  style={Object.assign({},iStyle,{fontSize:13,marginBottom:0})}/>
              </div>
            </div>

            {/* Detail text — last so keyboard doesn't hide form above */}
            <div style={{marginBottom:16}}>
              <label style={{fontSize:10,fontWeight:700,color:t.textSecondary,display:'block',marginBottom:6,letterSpacing:'0.06em',textTransform:'uppercase'}}>Detail (optional)</label>
              <textarea
                value={disputeDraft.reasonDetail}
                onChange={function(e){setDraft('reasonDetail',e.target.value);}}
                placeholder="Briefly explain..."
                rows={2}
                style={Object.assign({},iStyle,{fontSize:13,resize:'none',marginBottom:0})}/>
            </div>
          </>
        )}

        {/* Error */}
        {error&&(
          <div style={{marginBottom:12,padding:'10px 14px',borderRadius:8,background:t.redSubtle,border:'1px solid '+t.red+'44',fontSize:12,color:t.red}}>
            {error}
          </div>
        )}

        {/* Actions */}
        <div style={{display:'flex',gap:8}}>
          <button
            onClick={function(){setDisputeModal(null);}}
            style={{flex:1,padding:'12px',borderRadius:8,border:'1px solid '+t.border,background:'transparent',color:t.text,fontSize:13,fontWeight:500}}>
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving}
            style={{flex:2,padding:'12px',borderRadius:8,border:'none',background:saving?t.border:(isNotMyMatch||wouldAutoVoid?t.red:t.orange),color:'#fff',fontSize:13,fontWeight:600,opacity:saving?0.7:1}}>
            {saving?'Submitting…':isNotMyMatch?'Void match':wouldAutoVoid?'Void match (max rounds)':isCounter?'Submit counter':'Submit dispute'}
          </button>
        </div>
      </div>
    </div>
  );
}
