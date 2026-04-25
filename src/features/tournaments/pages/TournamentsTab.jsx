import { useState } from "react";
import { createPortal } from "react-dom";
import { useLocation, useNavigate } from "react-router-dom";
import Pill from "../../../components/ui/Pill.jsx";
import PlayerAvatar from "../../../components/ui/PlayerAvatar.jsx";
import FormatExplainer from "../components/FormatExplainer.jsx";
import StandingsTable from "../components/StandingsTable.jsx";
import BracketView from "../components/BracketView.jsx";
import ChallengesPanel from "../../challenges/components/ChallengesPanel.jsx";
import LeaguesPanel from "../../leagues/components/LeaguesPanel.jsx";
import PlayerProfileView from "../../profile/pages/PlayerProfileView.jsx";
import { PILOT_VENUE, ENTRY_FEES, PRIZES } from "../constants.js";
import { SKILL_LEVELS } from "../../../lib/constants/domain.js";
import { daysUntil } from "../../../lib/utils/dates.js";

// ── Tournament list ───────────────────────────────────────────────────────────
function TournamentList({
  t, myId, tournaments, filterSkill, setFilterSkill,
  setSelectedTournId, setTournDetailTab,
  isEntered, isWaitlisted, waitlistPos, enterTournament, joinWaitlist, tournStatus,
}) {
  return (
    <div style={{maxWidth:680,margin:"0 auto",padding:"32px 20px"}}>
      <div style={{marginBottom:24}}>
        <h1 style={{fontSize:28,fontWeight:700,letterSpacing:"-0.6px",color:t.text,marginBottom:6}}>Tournaments</h1>
        <p style={{fontSize:15,color:t.textSecondary}}>League format · Umpired matches · Real prizes.</p>
      </div>

      <div style={{display:"flex",gap:6,marginBottom:24,overflowX:"auto",paddingBottom:2}}>
        {["All"].concat(SKILL_LEVELS).map(function(sk){
          var on=filterSkill===sk;
          return (
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
          var entered=isEntered(t2.id), waitlisted=isWaitlisted(t2.id), wlP=waitlistPos(t2.id);
          var fee=ENTRY_FEES[t2.size]||45;
          var prize=PRIZES[t2.size]||PRIZES[16];
          var spotsLeft=t2.size-(t2.entrants||[]).length;
          var fillPct=Math.round(((t2.entrants||[]).length/t2.size)*100);
          var dl=daysUntil(t2.startDate);
          var dSt=tournStatus(t2);
          var isFull=spotsLeft<=0;
          return (
            <div key={t2.id} className="fade-up"
              style={{
                background:t.bgCard, border:"1px solid "+t.border,
                borderLeft:"3px solid "+(entered?t.green:waitlisted?t.purple:dSt.color),
                borderRadius:10, overflow:"hidden",
                animationDelay:(i*0.05)+"s"
              }}>
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

              <div style={{padding:"10px 18px",display:"flex",gap:20,borderBottom:"1px solid "+t.border}}>
                {[
                  {l:"Format",v:t2.format==="league"?"League":"Knockout"},
                  {l:"Players",v:t2.size},
                  {l:"Round",v:(t2.deadlineDays||14)+"d"},
                ].map(function(info){
                  return (
                    <div key={info.l}>
                      <div style={{fontSize:10,color:t.textTertiary,marginBottom:1}}>{info.l}</div>
                      <div style={{fontSize:12,fontWeight:600,color:t.textSecondary}}>{info.v}</div>
                    </div>
                  );
                })}
              </div>

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

              <div style={{padding:"12px 18px",display:"flex",gap:8}}>
                <button
                  onClick={function(){setSelectedTournId(t2.id);setTournDetailTab("overview");}}
                  style={{flex:1,padding:"10px",borderRadius:8,border:"1px solid "+t.border,background:"transparent",color:t.text,fontSize:12,fontWeight:500}}>
                  View
                </button>
                {t2.status==="enrolling"&&!entered&&!isFull&&(
                  <button onClick={function(){enterTournament(t2.id);}}
                    style={{flex:2,padding:"10px",borderRadius:8,border:"none",background:t.accent,color:"#fff",fontSize:13,fontWeight:600}}>
                    Enter · ${fee}
                  </button>
                )}
                {t2.status==="enrolling"&&!entered&&isFull&&!waitlisted&&(
                  <button onClick={function(){joinWaitlist(t2.id);}}
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
  );
}

// ── Tournament detail ─────────────────────────────────────────────────────────
function TournamentDetail({
  t, myId, tournaments, selectedTournId, setSelectedTournId,
  tournDetailTab, setTournDetailTab,
  isEntered, isWaitlisted, waitlistPos, enterTournament, joinWaitlist, tournStatus,
  setScheduleModal, setScheduleDraft, setScoreModal, setScoreDraft,
}) {
  var t2=tournaments.find(function(x){return x.id===selectedTournId;});
  if(!t2) return null;
  var prize=PRIZES[t2.size]||PRIZES[16];
  var entered=isEntered(t2.id), waitlisted=isWaitlisted(t2.id), wlP=waitlistPos(t2.id);
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
      if(!isMe) return;
      var opp=m.p1&&m.p1.id===myId?m.p2:m.p1;
      var lbl=r.type==="semi"?"Semifinal":r.type==="final"?"Final":"League Round "+r.round;
      myMatches.push({match:m,roundIdx:ri,roundLabel:lbl,opponent:opp});
    });
  });

  return (
    <div style={{maxWidth:680,margin:"0 auto",padding:"24px 20px"}}>
      <button
        onClick={function(){setSelectedTournId(null);}}
        style={{background:"none",border:"none",color:t.accent,fontSize:13,fontWeight:600,padding:"0 0 16px",display:"block"}}>
        ← Back
      </button>

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

      <div style={{display:"flex",gap:0,marginBottom:24,borderBottom:"1px solid "+t.border}}>
        {detailTabs.map(function(dtab){
          var on=tournDetailTab===dtab;
          return (
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
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:16}}>
            {[
              {l:"Entry fee",v:"$"+fee},
              {l:"Max players",v:t2.size},
              {l:"Enrolled",v:(t2.entrants||[]).length+"/"+t2.size},
              {l:"Round time",v:(t2.deadlineDays||14)+" days"},
              t2.surface?{l:"Surface",v:t2.surface}:null,
              t2.startDate?{l:"Start date",v:t2.startDate}:null,
            ].filter(Boolean).map(function(info){
              return (
                <div key={info.l} style={{background:t.bgCard,border:"1px solid "+t.border,borderRadius:8,padding:"11px 14px"}}>
                  <div style={{fontSize:10,color:t.textTertiary,marginBottom:3,fontWeight:600,letterSpacing:"0.04em",textTransform:"uppercase"}}>{info.l}</div>
                  <div style={{fontSize:14,fontWeight:600,color:t.text}}>{info.v}</div>
                </div>
              );
            })}
          </div>

          {isLeague&&(
            <div style={{marginBottom:16}}>
              <div style={{fontSize:10,fontWeight:700,color:t.textTertiary,textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:10}}>Format</div>
              <FormatExplainer t={t}/>
            </div>
          )}

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

          {waitlisted&&wlP&&(
            <div style={{background:t.purpleSubtle,border:"1px solid "+t.purple+"44",borderLeft:"3px solid "+t.purple,borderRadius:10,padding:"14px 16px",marginBottom:12}}>
              <div style={{fontSize:13,fontWeight:700,color:t.purple,marginBottom:4}}>Waitlisted · #{wlP}</div>
              <div style={{fontSize:13,color:t.textSecondary,lineHeight:1.6}}>
                You'll be promoted automatically if a spot opens.
                {(t2.waitlist||[]).length>1&&" "+((t2.waitlist||[]).length-1)+" person"+(((t2.waitlist||[]).length-1)!==1?"s":"")+" ahead of you."}
              </div>
            </div>
          )}

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
              return (
                <div key={ri} style={{display:"flex",gap:10,marginBottom:8}}>
                  <div style={{width:3,height:3,borderRadius:"50%",background:t.textTertiary,marginTop:8,flexShrink:0}}/>
                  <div style={{fontSize:13,color:t.textSecondary,lineHeight:1.5}}>{rule}</div>
                </div>
              );
            })}
          </div>

          {t2.status==="enrolling"&&(
            <div style={{background:t.bgCard,border:"1px solid "+t.border,borderRadius:10,overflow:"hidden",marginBottom:12}}>
              <div style={{padding:"12px 16px",borderBottom:"1px solid "+t.border,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <span style={{fontSize:13,fontWeight:600,color:t.text}}>Players</span>
                <span style={{fontSize:12,color:t.textTertiary}}>{(t2.entrants||[]).length}/{t2.size}</span>
              </div>
              {(t2.entrants||[]).length===0
                ?<div style={{padding:"24px",textAlign:"center",color:t.textTertiary,fontSize:13}}>No entrants yet. Be the first.</div>
                :(t2.entrants||[]).map(function(e,i){
                  return (
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

          <div style={{marginTop:8}}>
            {t2.status==="enrolling"&&!entered&&!isFull&&!waitlisted&&(
              <button onClick={function(){enterTournament(t2.id);}}
                style={{width:"100%",padding:"14px",borderRadius:9,border:"none",background:t.accent,color:"#fff",fontSize:15,fontWeight:700}}>
                Join Tournament · ${fee}
              </button>
            )}
            {t2.status==="enrolling"&&!entered&&isFull&&!waitlisted&&(
              <div>
                <button onClick={function(){joinWaitlist(t2.id);}}
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
              <button onClick={function(){setTournDetailTab(isLeague?"standings":"draw");}}
                style={{width:"100%",padding:"14px",borderRadius:9,border:"none",background:t.accent,color:"#fff",fontSize:14,fontWeight:600}}>
                {isLeague?"View Standings →":"View Draw →"}
              </button>
            )}
          </div>

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
                  var m=item.match, dl2=daysUntil(m.deadline), urgent=dl2!==null&&dl2<=3&&m.status!=="complete";
                  return (
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
                            onClick={function(){setScoreModal({oppName:item.opponent?item.opponent.name:"Opponent",tournName:t2.name,tournId:t2.id,roundIdx:item.roundIdx,matchId:m.id,winnerId1:myId,winnerId2:item.opponent?item.opponent.id:null});setScoreDraft({sets:[{you:"",them:""}],result:"win",notes:"",date:new Date().toISOString().slice(0,10)});}}
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
            return (
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
}

// ── TournamentsTab (router) ───────────────────────────────────────────────────
//
// The "Compete" nav entry now owns three sibling sections:
//   /tournaments/list       — Tournaments list + detail (legacy default)
//   /tournaments/challenges — Coordination inbox (was /people/challenges)
//   /tournaments/leagues    — Friend seasons (was /people/leagues)
//
// All three live in this page because they share the same competitive
// intent and removed the People tab's bloat. The URL is the source of
// truth for the sub-tab so deep links keep working.

var VALID_COMPETE_TABS = ["list", "challenges", "leagues"];

export default function TournamentsTab(props) {
  var location = useLocation();
  var navigate = useNavigate();

  // Player-profile overlay — opened when a user taps a challenger/league
  // partner/etc. inside the Compete tab. Avoids navigating to /profile/<id>
  // which would flip the sidebar to the "Profile" item (user reported
  // that's misleading because Profile is meant to be *their* card).
  var [profilePreviewId, setProfilePreviewId] = useState(null);
  function openProfilePreview(userId) {
    if (!userId) return;
    if (props.authUser && userId === props.authUser.id) {
      // Our own — take them to their actual Profile tab.
      navigate("/profile");
      return;
    }
    setProfilePreviewId(userId);
  }

  var pathParts = location.pathname.split("/").filter(Boolean);
  var sub = pathParts[1] && VALID_COMPETE_TABS.indexOf(pathParts[1]) >= 0 ? pathParts[1] : "list";

  // Tournament detail view: /tournaments/list with a selectedTournId
  // still renders the detail (unchanged legacy behaviour).
  if (sub === "list" && props.selectedTournId) return <TournamentDetail {...props}/>;

  var t = props.t;

  function setSub(newSub) {
    // Clear any drilled-into tournament detail when changing sub-tabs.
    if (props.setSelectedTournId) props.setSelectedTournId(null);
    navigate("/tournaments/" + newSub);
  }

  var challenges = props.challenges;
  var leagues    = props.leagues;
  var friends    = props.friends || [];

  var chCounts   = (challenges && challenges.counts) ? challenges.counts() : { incoming: 0, outgoing: 0, accepted: 0 };
  var chBadge    = chCounts.incoming + chCounts.accepted;
  var lgBadge    = (leagues && leagues.counts) ? leagues.counts().pendingInvites : 0;

  var tabs = [
    { id: "list",       label: "Tournaments", count: null },
    { id: "challenges", label: "Challenges",  count: chBadge || null },
    { id: "leagues",    label: "Leagues",     count: lgBadge || null },
  ];

  return (
    <div>
      {/* Sub-tab bar — matches the People tab's visual style. */}
      <div style={{ display: "flex", borderBottom: "1px solid " + t.border, padding: "0 20px", overflowX: "auto" }}>
        {tabs.map(function (tb) {
          var on = sub === tb.id;
          return (
            <button key={tb.id} onClick={function () { setSub(tb.id); }}
              style={{
                padding: "10px 0", marginRight: 20, border: "none", background: "transparent",
                color: on ? t.accent : t.textTertiary, fontSize: 13, fontWeight: on ? 700 : 400,
                borderBottom: "2px solid " + (on ? t.accent : "transparent"),
                marginBottom: "-1px", display: "flex", gap: 5, alignItems: "center", flexShrink: 0,
                cursor: "pointer",
              }}>
              {tb.label}
              {tb.count > 0 && (
                <span style={{ fontSize: 10, fontWeight: 800, color: on ? t.accent : t.textTertiary,
                  background: on ? t.accentSubtle : t.bgTertiary, padding: "1px 6px", borderRadius: 10 }}>
                  {tb.count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {sub === "list"       && <TournamentList {...props}/>}

      {sub === "challenges" && challenges && (
        <div style={{ padding: "16px 20px 100px" }} className="fade-up">
          <ChallengesPanel
            t={t} authUser={props.authUser}
            challenges={challenges.challenges}
            profileMap={challenges.profileMap}
            loading={challenges.loading}
            openProfile={openProfilePreview}
            acceptChallenge={challenges.acceptChallenge}
            declineChallenge={challenges.declineChallenge}
            cancelChallenge={challenges.cancelChallenge}
            onLogConvertedMatch={props.openConvertToMatch}
            toast={props.toast}
            friends={friends}
            openChallenge={props.openChallenge}
          />
        </div>
      )}

      {profilePreviewId && createPortal((
        <div onClick={function(){ setProfilePreviewId(null); }}
          style={{
            position:"fixed", inset:0, zIndex:500,
            background:"rgba(0,0,0,0.72)",
            display:"flex", alignItems:"flex-start", justifyContent:"center",
            padding:"5vh 16px", overflowY:"auto"
          }}>
          <div onClick={function(e){ e.stopPropagation(); }}
            style={{
              background:t.bgCard, borderRadius:16, width:"100%",
              maxWidth:680, overflow:"hidden",
              boxShadow:"0 20px 80px rgba(0,0,0,0.4)"
            }}>
            <PlayerProfileView
              t={t}
              authUser={props.authUser}
              userId={profilePreviewId}
              onBack={function(){ setProfilePreviewId(null); }}
              openChallenge={props.openChallenge}
            />
          </div>
        </div>
      ), document.body)}

      {sub === "leagues" && leagues && (
        <div style={{ padding: "16px 20px 100px" }} className="fade-up">
          <LeaguesPanel
            t={t} authUser={props.authUser}
            leagues={leagues.leagues}
            profileMap={leagues.profileMap}
            detailCache={leagues.detailCache}
            loadLeagueDetail={leagues.loadLeagueDetail}
            createLeague={leagues.createLeague}
            inviteToLeague={leagues.inviteToLeague}
            respondToInvite={leagues.respondToInvite}
            removeMember={leagues.removeMember}
            archiveLeague={leagues.archiveLeague}
            friends={friends}
            openProfile={openProfilePreview}
            toast={props.toast}
            /* Slice 4 — viewer's history (for league-scoped H2H +
               next-opponent suggestion) and challenge composer. */
            history={props.history}
            openChallenge={props.openChallenge}
          />
        </div>
      )}
    </div>
  );
}
