import { useState, useMemo, useEffect } from "react";
import { avColor } from "../../../lib/utils/avatar.js";
import { inputStyle } from "../../../lib/theme.js";
import { COURTS } from "../../map/data/courts.js";
import { fetchOpponentActiveLeagueIds } from "../../leagues/services/leagueService.js";
import { validateMatchScore, CODES as SCORE_CODES } from "../utils/tennisScoreValidation.js";
import MatchFinishMoment from "./MatchFinishMoment.jsx";

// Sort COURTS so venues in the viewer's own suburb float to the top, then
// same-zone (implicit "nearby" bucket from the map), then alphabetical. This
// keeps the dropdown useful when the list grows — the default cursor lands
// on the venues the viewer is most likely to actually play at.
function sortCourtsForViewer(viewerSuburb){
  var vs = (viewerSuburb || "").trim().toLowerCase();
  // derive the viewer's likely zone from their suburb so we can bump
  // same-zone courts above alphabetical order.
  var myZone = null;
  if(vs){
    var hit = COURTS.find(function(c){ return (c.suburb||"").toLowerCase() === vs; });
    if(hit) myZone = hit.zone;
  }
  return COURTS.slice().sort(function(a,b){
    var aSub = (a.suburb||"").toLowerCase();
    var bSub = (b.suburb||"").toLowerCase();
    var aTier = vs && aSub === vs ? 0 : (myZone && a.zone === myZone ? 1 : 2);
    var bTier = vs && bSub === vs ? 0 : (myZone && b.zone === myZone ? 1 : 2);
    if(aTier !== bTier) return aTier - bTier;
    return a.name.localeCompare(b.name);
  });
}

export default function ScoreModal({
  t, authUser, scoreModal, setScoreModal,
  scoreDraft, setScoreDraft,
  casualOppName, setCasualOppName,
  casualOppId, setCasualOppId,
  showOppDrop, setShowOppDrop,
  friends, suggestedPlayers,
  submitMatch, resubmitMatch, recordResult,
  // Module 6.7 — viewer's suburb drives the court-dropdown priority so
  // they see their local courts first. Optional; falls back to pure A→Z.
  viewerSuburb,
  // Module 7 — leagues the viewer is actively in. When the opponent is a
  // linked user we offer a league picker so this match can count toward
  // a shared leaderboard. See leagues-and-seasons.md.
  myLeagues,
}) {
  var iStyle=inputStyle(t);
  var [saving,setSaving]=useState(false);
  var [saveError,setSaveError]=useState("");
  // Track whether the user has been warned once about a result/sets mismatch.
  // We warn on first save attempt, let them correct or proceed on the second.
  // Retirement / incomplete matches are valid cases where sets don't predict
  // the stored winner — we don't want to hard-block.
  var [mismatchAck,setMismatchAck]=useState(false);
  // Slice 3 (design overhaul): finish-moment state. When non-null, the
  // modal swaps the form body for a brief acknowledgment card that
  // auto-dismisses after ~1.5s. Shape: { status, result, opponentName }.
  var [finish, setFinish] = useState(null);
  // Tennis-score-validation slice B: when ranked validation fails but
  // a casual time-limited save would pass, we hold the score-validator
  // diagnostic here so the user can tap "Save as casual time-limited"
  // explicitly. Shape: { code, message } | null.
  var [casualFallbackOffer, setCasualFallbackOffer] = useState(null);

  // Module 7.5: opponent's active league memberships (subset of viewer's
  // leagues). Refetched whenever the linked opponent changes — used by the
  // league selector below to show only leagues both players are members of.
  // MUST be declared above the early-return below so hook order is stable
  // across modal open/close cycles (rules of hooks).
  var [opponentLeagueIds, setOpponentLeagueIds] = useState(new Set());
  var isVerifiedForEffect = scoreModal ? (!!scoreModal.resubmit || !!casualOppId) : false;
  useEffect(function () {
    if (!scoreModal) { setOpponentLeagueIds(new Set()); return; }
    if (!isVerifiedForEffect || !casualOppId) { setOpponentLeagueIds(new Set()); return; }
    var candidateIds = (myLeagues || [])
      .filter(function (lg) { return lg.status === "active" && lg.my_status === "active"; })
      .map(function (lg) { return lg.id; });
    if (!candidateIds.length) { setOpponentLeagueIds(new Set()); return; }
    var alive = true;
    fetchOpponentActiveLeagueIds(casualOppId, candidateIds).then(function (r) {
      if (!alive) return;
      if (r.error) { setOpponentLeagueIds(new Set()); return; }
      setOpponentLeagueIds(new Set((r.data || []).map(function (m) { return m.league_id; })));
    });
    return function () { alive = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [casualOppId, isVerifiedForEffect, !!scoreModal, (myLeagues || []).length]);

  if(!scoreModal) return null;

  var isResubmit=!!scoreModal.resubmit;
  var isVerified=isResubmit?true:!!casualOppId;

  // Compute who the sets say won, in the submitter's frame:
  // "you" > "them" = submitter win. Returns "win" | "loss" | null (tied/empty).
  // Skip sets with blank / non-numeric scores on either side — Number("") is
  // 0, not NaN, so the old naive check counted "6-" as a 6-0 submitter win
  // and falsely triggered the mismatch warning on retirements.
  function winnerBySets(sets){
    if(!sets||!sets.length) return null;
    var ys=0, ts=0;
    sets.forEach(function(s){
      var yStr = s.you  == null ? "" : String(s.you).trim();
      var tStr = s.them == null ? "" : String(s.them).trim();
      if(yStr === "" || tStr === "") return;
      var y=Number(yStr), th=Number(tStr);
      if(Number.isNaN(y)||Number.isNaN(th)) return;
      if(y===th) return;
      if(y>th) ys++; else ts++;
    });
    if(ys===ts) return null;
    return ys>ts ? "win" : "loss";
  }

  // Build validator options from scoreDraft + scoreModal context.
  // `forceCasual` is set by the "Save as casual time-limited" CTA so
  // the explicit user-consent path shifts matchType + completionType
  // for THIS attempt only.
  function buildValidatorOptions(forceCasual) {
    var explicitMatchType = scoreDraft.matchType;
    var defaultMatchType  = (isVerified) ? 'ranked' : 'casual';
    var matchType = forceCasual ? 'casual' : (explicitMatchType || defaultMatchType);
    if (matchType === 'ranked' && !isVerified) matchType = 'casual';
    var leagueId = scoreDraft.leagueId || null;
    var league = leagueId
      ? (myLeagues || []).find(function (lg) { return lg.id === leagueId; })
      : null;
    return {
      matchType: matchType,
      completionType: forceCasual ? 'time_limited' : 'completed',
      // ScoreModal supports up to 5 sets in the UI today. Best-of-3 is
      // the dominant amateur format and matches the Elo + league
      // pipeline. When a league is tagged, defer to its match_format.
      matchFormat: (league && league.match_format) || 'best_of_3',
      finalSetFormat: (league && league.tiebreak_format === 'super_tiebreak_final')
        ? 'match_tiebreak' : 'normal_set',
      allowPartialScores: !!forceCasual,
      requireTiebreakDetails: false,
      leagueMode: league ? league.mode : null,
      leagueAllowPartial: false, // no league flag exists yet — open question in docs
    };
  }

  // Run the central validator + react accordingly. Returns true on pass.
  function runScoreValidation(forceCasual) {
    var clean = scoreDraft.sets.filter(function (s) { return s.you !== "" || s.them !== ""; });
    var ranked = buildValidatorOptions(false);
    var attempt = forceCasual ? buildValidatorOptions(true) : ranked;
    var rankedResult = validateMatchScore(clean, ranked);
    var attemptResult = forceCasual ? validateMatchScore(clean, attempt) : rankedResult;

    // Reset the casual-fallback offer at the start of each fresh attempt.
    setCasualFallbackOffer(null);

    if (attemptResult.ok) return true;

    // If we're attempting ranked and only the "ranked requires completed"
    // gate is failing, offer the explicit casual fallback path. Only
    // surfaces when matchType resolves to ranked AND the score would
    // pass under casual time-limited rules.
    if (!forceCasual && rankedResult.code === SCORE_CODES.RANKED_REQUIRES_COMPLETED) {
      var casualOpts = buildValidatorOptions(true);
      var casualResult = validateMatchScore(clean, casualOpts);
      if (casualResult.ok) {
        setCasualFallbackOffer({ code: rankedResult.code, message: rankedResult.message });
        setSaveError(rankedResult.message);
        return false;
      }
    }
    setSaveError(attemptResult.message);
    return false;
  }

  async function handleSave(opts){
    var forceCasual = !!(opts && opts.forceCasual);
    setSaveError("");
    var clean=scoreDraft.sets.filter(function(s){return s.you!==""||s.them!=="";});
    if(!clean.length){setSaveError("Add at least one set score.");return;}

    // Tennis score validation (slice B) — runs before the legacy
    // winnerBySets sanity check so format-level errors surface first.
    if (!runScoreValidation(forceCasual)) return;

    // Result-vs-sets sanity check. If the set scores clearly say the opposite
    // of what the user picked, warn once — they can correct it or tap Save
    // again to proceed (valid for retirements / incomplete matches).
    var whoWon=winnerBySets(clean);
    if(whoWon && whoWon!==scoreDraft.result && !mismatchAck){
      setMismatchAck(true);
      setSaveError(
        "Heads up — your set scores say you " + (whoWon==="win"?"won":"lost") +
        " but you picked " + (scoreDraft.result==="win"?"Win":"Loss") +
        ". Tap Save again to keep it, or fix the scores above."
      );
      return;
    }

    setSaving(true);

    if(isResubmit){
      var resubRes=await resubmitMatch(scoreModal.match, scoreDraft);
      setSaving(false);
      if(resubRes&&resubRes.error){
        setSaveError(typeof resubRes.error==='string'?resubRes.error:"Could not resubmit — please try again.");
        return;
      }
      // Slice 3: resubmit always lands as pending_confirmation — show
      // the finish moment so the user understands the next step.
      setFinish({
        status: "pending_confirmation",
        result: scoreDraft.result,
        opponentName: scoreModal.oppName || (scoreModal.match && scoreModal.match.oppName) || "your opponent",
      });
      return;
    }

    var oppName=scoreModal.casual?(casualOppName.trim()||"Unknown"):scoreModal.oppName;
    var opponentId=scoreModal.casual?casualOppId:(scoreModal.opponentId||null);

    // If the user chose the "Save as casual time-limited" path, force
    // matchType=casual on this submission so it doesn't try to count
    // toward Elo / can't accidentally pick up a ranked league tag.
    // submitMatch already demotes ranked-without-opponent to casual,
    // so we just override the explicit field on the draft for this call.
    var draftForSubmit = forceCasual
      ? Object.assign({}, scoreDraft, { matchType: 'casual', leagueId: null })
      : scoreDraft;

    var res=await submitMatch({
      scoreModal,
      scoreDraft: draftForSubmit,
      oppName,
      opponentId,
    });
    setSaving(false);

    if(res&&res.error){
      if(res.error==='duplicate'){
        setSaveError(res.message||"This match is already logged.");
      } else if(res.error!=='not_authenticated'){
        setSaveError(typeof res.error==='string'?res.error:"Could not save match — please try again.");
      }
      return;
    }

    // Tournament bracket recording (separate from stat/verification flow)
    if(scoreModal.winnerId1&&scoreModal.winnerId2){
      var winnerId=scoreDraft.result==="win"?scoreModal.winnerId1:scoreModal.winnerId2;
      recordResult(scoreModal.tournId,scoreModal.roundIdx,scoreModal.matchId,winnerId);
    }

    // Slice 3: pop into the finish moment. The card auto-dismisses
    // after ~1.5s (handled inside MatchFinishMoment), at which point
    // closeFromFinish() runs and the modal closes for real.
    setFinish({
      status: res && res.status ? res.status : "confirmed",
      result: scoreDraft.result,
      opponentName: oppName,
    });
  }

  function closeFromFinish() {
    setFinish(null);
    setScoreModal(null);
    setCasualOppName("");
    setCasualOppId(null);
  }

  // Slice 3: when the finish moment is up we deliberately swallow the
  // backdrop-click so the auto-dismiss timer is the only path to close.
  // This keeps the moment from feeling abrupt if the user taps too soon.
  function backdropClick() {
    if (finish) return;
    setScoreModal(null);
    if (!isResubmit) { setCasualOppName(""); setCasualOppId(null); }
  }

  return (
    <div
      onClick={backdropClick}
      style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.35)",backdropFilter:"blur(8px)",WebkitBackdropFilter:"blur(8px)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:200,padding:"0 16px"}}>
      <div
        onClick={function(e){e.stopPropagation();}}
        className="pop"
        style={{background:t.modalBg,border:"1px solid "+t.border,borderRadius:16,padding:"28px 24px",width:"100%",maxWidth:540,maxHeight:"92vh",overflowY:"auto"}}>
        {finish ? (
          <MatchFinishMoment
            t={t}
            status={finish.status}
            result={finish.result}
            opponentName={finish.opponentName}
            onClose={closeFromFinish}
          />
        ) : (
        <>
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

            {/* Match-type toggle — only shown when opponent is a linked
                friend (Module 7.5 product rule: friend → choose Ranked or
                Casual; freetext → casual auto, no toggle). Default Ranked. */}
            {casualOppName.trim() && isVerified && (function(){
              var effectiveMatchType = scoreDraft.matchType || 'ranked';
              function pick(mt){
                setScoreDraft(function(d){ return Object.assign({}, d, { matchType: mt }); });
              }
              var btn = function(mt, label, glyph){
                var on = effectiveMatchType === mt;
                var color = on
                  ? (mt === 'ranked' ? t.accent : t.textSecondary)
                  : t.textSecondary;
                var bg = on
                  ? (mt === 'ranked' ? t.accentSubtle : t.bgTertiary)
                  : 'transparent';
                var borderC = on
                  ? (mt === 'ranked' ? t.accent : t.border)
                  : t.border;
                return (
                  <button key={mt} type="button" onClick={function(){pick(mt);}}
                    style={{ flex: 1, padding: '8px 10px', borderRadius: 8, border: '1px solid ' + borderC, background: bg, color: color, fontSize: 12, fontWeight: on ? 700 : 500, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                    <span>{glyph}</span><span>{label}</span>
                  </button>
                );
              };
              return (
                <div style={{marginTop: 10}}>
                  <label style={{ fontSize: 10, fontWeight: 700, color: t.textSecondary, display: 'block', marginBottom: 6, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Match type</label>
                  <div style={{display:'flex',gap:8}}>
                    {btn('ranked', 'Ranked', '✓')}
                    {btn('casual', 'Casual', '○')}
                  </div>
                  <div style={{ fontSize: 10.5, color: t.textTertiary, marginTop: 6, lineHeight: 1.4 }}>
                    {effectiveMatchType === 'ranked'
                      ? 'Counts toward ELO — opponent will confirm to lock it in.'
                      : 'Logged for records only — no ELO or W/L impact.'}
                  </div>
                </div>
              );
            })()}
          </div>
          :(!isResubmit&&<p style={{fontSize:12,color:t.textSecondary,marginBottom:16}}>vs {scoreModal.oppName} · {scoreModal.tournName}</p>)
        }

        {/* League selector — Module 7.5 eligibility rule:
              1. league.status === 'active'
              2. viewer is an active member (lg.my_status === 'active')
              3. opponent is an active member (opponentLeagueIds set)
              4. league.mode === effective match type
            All four must be true; otherwise the league is hidden. If no
            league passes, the selector itself is hidden — no empty
            dropdown clutter. Backend trigger validates the same rules
            (defence in depth) so a forced payload is still rejected. */}
        {(function(){
          if (isResubmit) return null;
          if (!isVerified) return null;  // freetext opponent → can't league-tag
          var effectiveMatchType = scoreDraft.matchType || 'ranked';
          var eligible = (myLeagues || []).filter(function(lg){
            return lg.status === "active"
              && lg.my_status === "active"
              && lg.mode === effectiveMatchType
              && opponentLeagueIds.has(lg.id);
          });
          if (!eligible.length) return null;
          var currentId = scoreDraft.leagueId || "";
          // If the user previously picked a league but then changed match
          // type so it's no longer eligible, clear the stale pick.
          var pickIsStale = currentId && !eligible.some(function(lg){return lg.id === currentId;});
          if (pickIsStale && currentId) {
            // Clear stale league_id by mutating scoreDraft once on render —
            // safe because setScoreDraft batches and effective state is the
            // local value we just computed.
            setTimeout(function(){
              setScoreDraft(function(d){ return Object.assign({}, d, { leagueId: null }); });
            }, 0);
          }
          var prompt = effectiveMatchType === 'ranked'
            ? 'Count toward a ranked league?'
            : 'Count toward a casual league?';
          return (
            <div style={{marginBottom:16}}>
              <label style={{fontSize:10,fontWeight:700,color:t.textSecondary,display:"block",marginBottom:6,letterSpacing:"0.06em",textTransform:"uppercase"}}>
                {prompt}
              </label>
              <select
                value={pickIsStale ? "" : currentId}
                onChange={function(e){
                  var v = e.target.value || null;
                  setScoreDraft(function(d){ return Object.assign({}, d, { leagueId: v }); });
                }}
                style={Object.assign({},iStyle,{fontSize:13,marginBottom:0,appearance:"auto"})}>
                <option value="">No — just a {effectiveMatchType} match</option>
                {eligible.map(function(lg){
                  return <option key={lg.id} value={lg.id}>{lg.name}</option>;
                })}
              </select>
            </div>
          );
        })()}

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

        {/* Venue + Court
            Venue is a dropdown sourced from the same COURTS list as the Map
            — so map selection and log-match selection stay in sync. Sorted
            by viewer suburb first, then same-zone, then alphabetical.
            "Custom venue..." reveals a free-text input as a fallback for
            private clubs or courts we haven't catalogued yet. */}
        {(function(){
          var sortedCourts = sortCourtsForViewer(viewerSuburb);
          var currentVenue = scoreDraft.venue || "";
          var matchesKnownCourt = !!currentVenue && sortedCourts.some(function(c){ return c.name === currentVenue; });
          var isCustom = !!currentVenue && !matchesKnownCourt;

          // The <select> value is either the known court name, "__custom__"
          // when the user has typed a free-text venue, or "" for placeholder.
          var selectValue = matchesKnownCourt ? currentVenue : (isCustom ? "__custom__" : "");

          function handleSelect(e){
            var v = e.target.value;
            if(v === "__custom__"){
              // entering custom mode — keep whatever's already in venue (may be blank)
              setScoreDraft(function(d){ return Object.assign({}, d, { venue: d.venue || "" }); });
              return;
            }
            setScoreDraft(function(d){ return Object.assign({}, d, { venue: v }); });
          }

          return (
            <div style={{marginBottom:16}}>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                <div>
                  <label style={{fontSize:10,fontWeight:700,color:t.textSecondary,display:"block",marginBottom:6,letterSpacing:"0.06em",textTransform:"uppercase"}}>Venue</label>
                  <select
                    value={selectValue}
                    onChange={handleSelect}
                    style={Object.assign({},iStyle,{fontSize:13,marginBottom:0,appearance:"auto"})}>
                    <option value="">— Select court —</option>
                    {sortedCourts.map(function(c){
                      var isLocal = viewerSuburb && (c.suburb||"").toLowerCase() === (viewerSuburb||"").toLowerCase();
                      var label = isLocal ? (c.name + " · " + c.suburb + " ★") : (c.name + " · " + c.suburb);
                      return <option key={c.name} value={c.name}>{label}</option>;
                    })}
                    <option value="__custom__">Custom venue…</option>
                  </select>
                </div>
                <div>
                  <label style={{fontSize:10,fontWeight:700,color:t.textSecondary,display:"block",marginBottom:6,letterSpacing:"0.06em",textTransform:"uppercase"}}>Court</label>
                  <input value={scoreDraft.court||""} placeholder="e.g. Court 3"
                    onChange={function(e){setScoreDraft(function(d){return Object.assign({},d,{court:e.target.value});});}}
                    style={Object.assign({},iStyle,{fontSize:13,marginBottom:0})}/>
                </div>
              </div>

              {/* Free-text fallback — only when "Custom venue…" is picked */}
              {isCustom && (
                <div style={{marginTop:8}}>
                  <input value={currentVenue} placeholder="Type venue name"
                    autoFocus
                    onChange={function(e){setScoreDraft(function(d){return Object.assign({},d,{venue:e.target.value});});}}
                    style={Object.assign({},iStyle,{fontSize:13,marginBottom:0})}/>
                  <div style={{fontSize:10,color:t.textTertiary,marginTop:4,letterSpacing:"0.02em"}}>
                    Can't find your court? Type the venue name here.
                  </div>
                </div>
              )}
            </div>
          );
        })()}

        {/* Error */}
        {saveError&&(
          <div style={{marginBottom:12,padding:"10px 14px",borderRadius:8,background:t.redSubtle,border:"1px solid "+t.red+"44",fontSize:12,color:t.red,fontWeight:500}}>
            {saveError}
          </div>
        )}

        {/* Casual fallback — explicit user-consent path when ranked
            validation fails because the score is partial / time-limited
            but would pass under casual rules. NEVER auto-converts;
            user must tap to opt in. */}
        {casualFallbackOffer && (
          <div style={{marginBottom:12,padding:"10px 14px",borderRadius:8,background:t.orangeSubtle,border:"1px solid "+t.orange+"44",fontSize:12,color:t.text,display:"flex",alignItems:"center",justifyContent:"space-between",gap:10,flexWrap:"wrap"}}>
            <span style={{flex:1,minWidth:140}}>
              You can save this as a casual time-limited result instead. It won't affect rating.
            </span>
            <button
              onClick={function(){ setSaveError(""); setCasualFallbackOffer(null); handleSave({forceCasual: true}); }}
              disabled={saving}
              style={{flexShrink:0,padding:"7px 12px",borderRadius:6,border:"none",background:t.text,color:t.bg,fontSize:11,fontWeight:700,letterSpacing:"0.04em",textTransform:"uppercase",cursor:"pointer"}}>
              Save as casual
            </button>
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
            onClick={function(){ handleSave(); }}
            disabled={saving}
            style={{flex:2,padding:"12px",borderRadius:8,border:"none",background:saving?t.border:t.accent,color:"#fff",fontSize:13,fontWeight:600,opacity:saving?0.7:1}}>
            {saving?"Saving…":isResubmit?"Resubmit for confirmation":(isVerified&&scoreModal.casual?"Submit for confirmation":"Save result")}
          </button>
        </div>
        </>
        )}
      </div>
    </div>
  );
}
