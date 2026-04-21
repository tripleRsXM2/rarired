// src/tabs/ProfileTab.jsx
//
// Public-facing profile view: stats, match history, achievements, availability.
// Settings have been moved to SettingsScreen (accessible via top-bar avatar).

import { useEffect } from "react";
import { avColor, avatarUrl, displayLocation } from "../../../lib/utils/avatar.js";
import { DAYS_SHORT } from "../../../lib/constants/domain.js";
import {
  computeRecentForm,
  computeMostPlayed,
  formatConfirmedBadge,
  provisionalLabel,
  computeConfirmationRate,
} from "../utils/profileStats.js";
import { track } from "../../../lib/analytics.js";

var BADGES=[
  {id:"first", label:"First Match",   desc:"Play your first match",             icon:"🎾", check:function(w,p){return p>=1;}},
  {id:"win1",  label:"First Win",     desc:"Win your first match",              icon:"🏆", check:function(w){return w>=1;}},
  {id:"hat",   label:"Hat Trick",     desc:"Win 3 matches",                     icon:"🔥", check:function(w){return w>=3;}},
  {id:"ded",   label:"Dedicated",     desc:"Play 10 matches",                   icon:"💪", check:function(w,p){return p>=10;}},
  {id:"sharp", label:"Sharp",         desc:"70%+ win rate (5+ matches)",        icon:"⚡", check:function(w,p){return p>=5&&p>0&&Math.round(w/p*100)>=70;}},
  {id:"fire",  label:"On Fire",       desc:"3-match win streak",                icon:"🚀", check:function(w,p,sc,st){return st==="win"&&sc>=3;}},
  {id:"beast", label:"Unstoppable",   desc:"5-match win streak",                icon:"👑", check:function(w,p,sc,st){return st==="win"&&sc>=5;}},
  {id:"vet",   label:"Veteran",       desc:"Play 25 matches",                   icon:"🎖️",check:function(w,p){return p>=25;}},
];

export default function ProfileTab({
  t, authUser, profile,
  history,
  profileTab, setProfileTab,
  onOpenSettings,
  openProfile,
}) {
  var wins    = profile.wins         != null ? profile.wins         : history.filter(function(m){return m.result==="win";}).length;
  var losses  = profile.losses       != null ? profile.losses       : history.length - wins;
  var played  = profile.matches_played != null ? profile.matches_played : history.length;
  var winRate = played ? Math.round(wins/played*100) : 0;
  var rankPts = profile.ranking_points != null ? profile.ranking_points : Math.max(0,1000+wins*15-losses*10);

  var streakCount = profile.streak_count != null ? profile.streak_count : 0;
  var streakType  = profile.streak_type  != null ? profile.streak_type  : null;
  if(profile.streak_count == null && history.length){
    streakType = history[0].result;
    for(var si=0;si<history.length;si++){if(history[si].result===streakType)streakCount++;else break;}
  }
  var streakLabel = streakCount===0 ? "—" : streakCount+(streakType==="win"?" W":" L");

  var badges = BADGES.map(function(b){
    return Object.assign({},b,{unlocked:b.check(wins,played,streakCount,streakType)});
  });
  var unlockedCount = badges.filter(function(b){return b.unlocked;}).length;

  // Module 1 additions — derived identity signals.
  var recentForm = computeRecentForm(history, 5);
  var myId = authUser && authUser.id;
  var mostPlayed = computeMostPlayed(history, myId, 5);
  var confirmedBadge = formatConfirmedBadge(profile);
  // Module 5 additions — provisional rating + confirmation-rate trust signal.
  var provLabel = provisionalLabel(profile);
  var confRate = computeConfirmationRate(history);

  // Module 3.5: self-view analytics. Fires once per profile-id load.
  useEffect(function () {
    if (!profile || !profile.id) return;
    track("profile_viewed", { target_user_id: profile.id, is_self: true });
  }, [profile && profile.id]);

  return (
    <div style={{maxWidth:680,margin:"0 auto"}}>

      {/* ── Hero header ──────────────────────────────────────────────────────── */}
      <div style={{padding:"28px 20px 0",background:t.bg}}>
        <div style={{display:"flex",alignItems:"flex-start",gap:16,marginBottom:20}}>
          {(function(){
            var url = avatarUrl(profile);
            if(url){
              return (
                <img src={url} alt={profile.name}
                  style={{
                    width:72,height:72,borderRadius:"50%",objectFit:"cover",flexShrink:0,
                    boxShadow:"0 0 0 3px "+t.bg+", 0 0 0 5px "+avColor(profile.name)+"44",
                    background:"#eee",
                  }}/>
              );
            }
            return (
              <div style={{
                width:72,height:72,borderRadius:"50%",flexShrink:0,
                background:avColor(profile.name),
                display:"flex",alignItems:"center",justifyContent:"center",
                fontSize:24,fontWeight:800,color:"#fff",
                boxShadow:"0 0 0 3px "+t.bg+", 0 0 0 5px "+avColor(profile.name)+"44",
              }}>{profile.avatar}</div>
            );
          })()}
          <div style={{flex:1,paddingTop:4}}>
            <div style={{fontSize:22,fontWeight:800,color:t.text,letterSpacing:"-0.5px",lineHeight:1.1}}>{profile.name}</div>
            {displayLocation(profile)&&<div style={{fontSize:13,color:t.textSecondary,marginTop:3}}>{displayLocation(profile)}</div>}
            <div style={{display:"flex",gap:6,marginTop:8,flexWrap:"wrap"}}>
              <span style={{fontSize:11,fontWeight:700,color:t.accent,background:t.accentSubtle,padding:"3px 9px",borderRadius:20,letterSpacing:"0.02em"}}>{profile.skill}</span>
              <span style={{fontSize:11,fontWeight:600,color:t.green,background:t.greenSubtle,padding:"3px 9px",borderRadius:20}}>{profile.style}</span>
            </div>
          </div>
          {/* "Edit profile" shortcut — opens Settings */}
          {authUser&&(
            <button
              onClick={onOpenSettings}
              style={{padding:"7px 14px",borderRadius:8,border:"1px solid "+t.border,background:"transparent",color:t.text,fontSize:12,fontWeight:600,flexShrink:0,marginTop:4}}>
              Edit
            </button>
          )}
        </div>
        {profile.bio&&<p style={{fontSize:13,color:t.textSecondary,lineHeight:1.6,marginBottom:16,marginTop:-8}}>{profile.bio}</p>}

        {/* Trust + rating-state pills row (Modules 1 + 5 stack here) */}
        {(confirmedBadge||provLabel||confRate)&&(
          <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:14}}>
            {confirmedBadge&&(
              <span style={{
                display:"inline-flex",alignItems:"center",gap:6,
                padding:"5px 10px",borderRadius:20,
                background:t.greenSubtle,color:t.green,
                border:"1px solid "+t.green+"33",
                fontSize:11,fontWeight:700,letterSpacing:"0.02em",
              }}>
                <span>✓</span><span>{confirmedBadge}</span>
              </span>
            )}
            {provLabel&&(
              <span style={{
                display:"inline-flex",alignItems:"center",gap:6,
                padding:"5px 10px",borderRadius:20,
                background:t.orangeSubtle,color:t.orange,
                border:"1px solid "+t.orange+"33",
                fontSize:11,fontWeight:700,letterSpacing:"0.02em",
              }}>
                <span>⚖</span><span>{provLabel}</span>
              </span>
            )}
            {confRate&&(
              <span style={{
                display:"inline-flex",alignItems:"center",gap:6,
                padding:"5px 10px",borderRadius:20,
                background:t.bgTertiary,color:t.textSecondary,
                border:"1px solid "+t.border,
                fontSize:11,fontWeight:700,letterSpacing:"0.02em",
              }}
              title={confRate.total + " ranked matches resolved (confirmed + voided + expired)"}>
                <span>{confRate.pct}%</span><span style={{fontWeight:500}}>confirmed</span>
              </span>
            )}
          </div>
        )}
        {/* Recent form chips (last 5 confirmed, most recent first) */}
        {recentForm.length>0&&(
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:14}}>
            <span style={{fontSize:10,fontWeight:700,color:t.textTertiary,textTransform:"uppercase",letterSpacing:"0.07em"}}>Recent form</span>
            <div style={{display:"flex",gap:4}}>
              {recentForm.map(function(r,i){
                var isW=r==="W";
                return (
                  <span key={i} style={{
                    width:20,height:20,borderRadius:6,
                    display:"flex",alignItems:"center",justifyContent:"center",
                    fontSize:10,fontWeight:800,
                    color:isW?t.green:t.red,
                    background:isW?t.greenSubtle:t.redSubtle,
                    border:"1px solid "+(isW?t.green:t.red)+"33",
                  }}>{r}</span>
                );
              })}
            </div>
          </div>
        )}

        {/* Rank + achievements summary */}
        <div style={{background:t.bgCard,border:"1px solid "+t.border,borderRadius:10,padding:"12px 16px",marginBottom:16,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div>
            <div style={{fontSize:10,fontWeight:700,color:t.textTertiary,textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:2}}>Ranking Points</div>
            <div style={{fontSize:26,fontWeight:800,color:t.text,letterSpacing:"-0.5px",fontVariantNumeric:"tabular-nums"}}>{rankPts.toLocaleString()}</div>
          </div>
          <div style={{textAlign:"right"}}>
            <div style={{fontSize:10,fontWeight:700,color:t.textTertiary,textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:2}}>Achievements</div>
            <div style={{fontSize:26,fontWeight:800,color:t.gold,letterSpacing:"-0.5px"}}>
              {unlockedCount}<span style={{fontSize:13,color:t.textTertiary,fontWeight:500}}>/{badges.length}</span>
            </div>
          </div>
        </div>

        {/* Quick stats bar */}
        <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8,marginBottom:20}}>
          {[
            {l:"Matches",v:history.length,                                          c:t.text},
            {l:"Wins",   v:wins,                                                    c:t.green},
            {l:"Win %",  v:history.length?winRate+"%":"—",                          c:t.accent},
            {l:"Streak", v:streakLabel, c:streakType==="win"?t.green:streakType==="loss"?t.red:t.textTertiary},
          ].map(function(s){
            return (
              <div key={s.l} style={{background:t.bgCard,border:"1px solid "+t.border,borderRadius:10,padding:"12px 8px",textAlign:"center"}}>
                <div style={{fontSize:20,fontWeight:800,color:s.c,fontVariantNumeric:"tabular-nums",letterSpacing:"-0.3px"}}>{s.v}</div>
                <div style={{fontSize:9,color:t.textTertiary,marginTop:3,fontWeight:700,letterSpacing:"0.07em",textTransform:"uppercase"}}>{s.l}</div>
              </div>
            );
          })}
        </div>

        {/* Sub-tabs: overview / matches / achievements only */}
        <div style={{display:"flex",borderBottom:"1px solid "+t.border,marginLeft:-20,marginRight:-20,paddingLeft:20}}>
          {["overview","matches","achievements"].map(function(pt){
            var on=profileTab===pt;
            return (
              <button key={pt}
                onClick={function(){setProfileTab(pt);}}
                style={{
                  padding:"10px 16px",border:"none",background:"transparent",
                  color:on?t.accent:t.textTertiary,
                  fontSize:12,fontWeight:on?700:500,
                  borderBottom:"2px solid "+(on?t.accent:"transparent"),
                  marginBottom:"-1px",textTransform:"capitalize",letterSpacing:"0.01em",
                }}>
                {pt}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Overview ─────────────────────────────────────────────────────────── */}
      {profileTab==="overview"&&(
        <div style={{padding:"20px 20px 100px"}} className="fade-up">
          <div style={{fontSize:10,fontWeight:700,color:t.textTertiary,textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:10}}>Performance</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:24}}>
            {[
              {l:"Total Played", v:history.length,                                   sub:"all time",                                                        c:t.text},
              {l:"Total Wins",   v:wins,                                              sub:"all time",                                                        c:t.green},
              {l:"Total Losses", v:losses,                                            sub:"all time",                                                        c:t.red},
              {l:"Win Rate",     v:history.length?winRate+"%":"—", sub:history.length?"from "+history.length+" matches":"no matches yet", c:t.accent},
            ].map(function(s){
              return (
                <div key={s.l} style={{background:t.bgCard,border:"1px solid "+t.border,borderLeft:"3px solid "+s.c,borderRadius:10,padding:"14px 16px"}}>
                  <div style={{fontSize:28,fontWeight:800,color:s.c,fontVariantNumeric:"tabular-nums",letterSpacing:"-0.5px"}}>{s.v}</div>
                  <div style={{fontSize:12,fontWeight:600,color:t.text,marginTop:2}}>{s.l}</div>
                  <div style={{fontSize:11,color:t.textTertiary,marginTop:1}}>{s.sub}</div>
                </div>
              );
            })}
          </div>

          {/* Recent matches */}
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
              return (
                <div key={m.id} style={{background:t.bgCard,border:"1px solid "+t.border,borderLeft:"3px solid "+(isWin?t.green:t.red),borderRadius:10,padding:"14px 16px",marginBottom:8,display:"flex",alignItems:"center",gap:12}}>
                  <div style={{width:36,height:36,borderRadius:"50%",flexShrink:0,background:isWin?t.greenSubtle:t.redSubtle,display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,fontWeight:800,color:isWin?t.green:t.red}}>
                    {isWin?"W":"L"}
                  </div>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:14,fontWeight:600,color:t.text,marginBottom:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>vs {m.oppName||"Unknown"}</div>
                    <div style={{fontSize:12,color:t.textSecondary}}>{scoreStr||"No score"}{m.tournName?" · "+m.tournName:""}</div>
                  </div>
                  <div style={{fontSize:11,color:t.textTertiary,flexShrink:0,textAlign:"right"}}>{m.date||""}</div>
                </div>
              );
            })
          }

          {/* Most-played opponents — identity check: "I've played these
              people consistently". Each chip is clickable when the opponent
              is a real user (opponent_id present), taking the viewer into
              that player's public profile. */}
          {mostPlayed.length>0&&(
            <div style={{marginTop:24}}>
              <div style={{fontSize:10,fontWeight:700,color:t.textTertiary,textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:10}}>Most played</div>
              <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                {mostPlayed.map(function(o,i){
                  var clickable = !!o.opponentId && !!openProfile;
                  return (
                    <div key={i}
                      onClick={clickable ? function(){openProfile(o.opponentId);} : undefined}
                      style={{
                        display:"flex",alignItems:"center",gap:8,
                        background:t.bgCard,border:"1px solid "+t.border,
                        borderRadius:10,padding:"8px 12px 8px 8px",
                        cursor:clickable?"pointer":"default",
                      }}>
                      <div style={{
                        width:28,height:28,borderRadius:"50%",flexShrink:0,
                        background:avColor(o.opponentName),
                        display:"flex",alignItems:"center",justifyContent:"center",
                        fontSize:10,fontWeight:700,color:"#fff",
                      }}>{(o.opponentName||"?").slice(0,2).toUpperCase()}</div>
                      <div>
                        <div style={{fontSize:12,fontWeight:600,color:t.text,lineHeight:1.1}}>{o.opponentName}</div>
                        <div style={{fontSize:10,color:t.textTertiary,marginTop:2,letterSpacing:"0.02em"}}>
                          <span style={{color:t.green,fontWeight:700}}>{o.wins}</span>
                          <span style={{margin:"0 3px"}}>–</span>
                          <span style={{color:t.red,fontWeight:700}}>{o.losses}</span>
                          <span style={{marginLeft:6}}>· {o.plays} played</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Achievements preview */}
          {unlockedCount>0&&(
            <div style={{marginTop:24}}>
              <div style={{fontSize:10,fontWeight:700,color:t.textTertiary,textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:10,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <span>Achievements</span>
                <button onClick={function(){setProfileTab("achievements");}} style={{background:"none",border:"none",color:t.accent,fontSize:11,fontWeight:600}}>See all</button>
              </div>
              <div style={{display:"flex",gap:8,overflowX:"auto",paddingBottom:4}}>
                {badges.filter(function(b){return b.unlocked;}).map(function(b){
                  return (
                    <div key={b.id} style={{background:t.bgCard,border:"1px solid "+t.border,borderRadius:10,padding:"12px",textAlign:"center",minWidth:80,flexShrink:0}}>
                      <div style={{fontSize:24,marginBottom:4}}>{b.icon}</div>
                      <div style={{fontSize:10,fontWeight:700,color:t.text,lineHeight:1.2}}>{b.label}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Availability (read-only, Edit link opens Settings) */}
          <div style={{marginTop:24}}>
            <div style={{fontSize:10,fontWeight:700,color:t.textTertiary,textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:10,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <span>Availability</span>
              {authUser&&<button onClick={onOpenSettings} style={{background:"none",border:"none",color:t.accent,fontSize:11,fontWeight:600}}>Edit</button>}
            </div>
            <div style={{background:t.bgCard,border:"1px solid "+t.border,borderRadius:10,padding:"14px 16px"}}>
              {DAYS_SHORT.filter(function(d){return((profile.availability||{})[d]||[]).length>0;}).length===0
                ?<p style={{fontSize:13,color:t.textTertiary,margin:0}}>No availability set yet.</p>
                :<div style={{display:"flex",flexDirection:"column",gap:8}}>
                  {DAYS_SHORT.filter(function(d){return((profile.availability||{})[d]||[]).length>0;}).map(function(day){
                    return (
                      <div key={day} style={{display:"flex",alignItems:"center",gap:10}}>
                        <span style={{fontSize:11,fontWeight:700,color:t.textSecondary,width:30,flexShrink:0}}>{day}</span>
                        <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
                          {((profile.availability||{})[day]||[]).map(function(b){
                            return <span key={b} style={{fontSize:10,fontWeight:600,color:t.accent,background:t.accentSubtle,padding:"2px 8px",borderRadius:20}}>{b}</span>;
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

      {/* ── Matches ──────────────────────────────────────────────────────────── */}
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
            :history.map(function(m){
              var isWin=m.result==="win";
              var scoreStr=(m.sets||[]).map(function(s){return s.you+"-"+s.them;}).join(", ");
              return (
                <div key={m.id} style={{background:t.bgCard,border:"1px solid "+t.border,borderLeft:"3px solid "+(isWin?t.green:t.red),borderRadius:10,padding:"16px",marginBottom:8}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:8}}>
                    <div style={{display:"flex",alignItems:"center",gap:10}}>
                      <div style={{width:32,height:32,borderRadius:"50%",background:isWin?t.greenSubtle:t.redSubtle,display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,fontWeight:800,color:isWin?t.green:t.red,flexShrink:0}}>
                        {isWin?"W":"L"}
                      </div>
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

      {/* ── Achievements ─────────────────────────────────────────────────────── */}
      {profileTab==="achievements"&&(
        <div style={{padding:"20px 20px 100px"}} className="fade-up">
          <div style={{fontSize:10,fontWeight:700,color:t.textTertiary,textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:4}}>Badges</div>
          <div style={{fontSize:13,color:t.textSecondary,marginBottom:16}}>{unlockedCount} of {badges.length} unlocked</div>
          <div style={{background:t.bgTertiary,borderRadius:4,height:4,marginBottom:24,overflow:"hidden"}}>
            <div style={{height:"100%",width:(unlockedCount/badges.length*100)+"%",background:t.gold,borderRadius:4,transition:"width 0.5s ease"}}/>
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:8}}>
            {badges.map(function(b){
              return (
                <div key={b.id} style={{background:t.bgCard,border:"1px solid "+t.border,borderLeft:"3px solid "+(b.unlocked?t.gold:t.border),borderRadius:10,padding:"14px 16px",display:"flex",alignItems:"center",gap:14,opacity:b.unlocked?1:0.5}}>
                  <div style={{width:44,height:44,borderRadius:12,flexShrink:0,background:b.unlocked?t.goldSubtle:t.bgTertiary,display:"flex",alignItems:"center",justifyContent:"center",fontSize:22,filter:b.unlocked?"none":"grayscale(1)"}}>
                    {b.icon}
                  </div>
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
    </div>
  );
}
