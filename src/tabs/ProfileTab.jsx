import { supabase } from "../supabase.js";
import { initials } from "../lib/helpers.js";
import { SKILL_LEVELS, PLAY_STYLES, DAYS_SHORT, TIME_BLOCKS } from "../lib/constants.js";
import { inputStyle } from "../lib/theme.js";
import { avColor } from "../lib/helpers.js";

export default function ProfileTab({
  t, authUser, profile, setProfile, profileDraft, setProfileDraft,
  history, receivedRequests,
  profileTab, setProfileTab,
  editingAvail, setEditingAvail,
  availDraft, setAvailDraft,
  setTab, setPeopleTab,
}) {
  var wins=profile.wins!=null?profile.wins:history.filter(function(m){return m.result==="win";}).length;
  var losses=profile.losses!=null?profile.losses:history.length-wins;
  var played=profile.matches_played!=null?profile.matches_played:history.length;
  var winRate=played?Math.round(wins/played*100):0;
  var rankPts=profile.ranking_points!=null?profile.ranking_points:Math.max(0,1000+wins*15-losses*10);
  var streakCount=profile.streak_count!=null?profile.streak_count:0;
  var streakType=profile.streak_type!=null?profile.streak_type:null;
  if(profile.streak_count==null&&history.length){
    streakType=history[0].result;
    for(var si=0;si<history.length;si++){if(history[si].result===streakType)streakCount++;else break;}
  }
  var streakLabel=streakCount===0?"—":streakCount+(streakType==="win"?" W":" L");

  var BADGES=[
    {id:"first",label:"First Match",desc:"Play your first match",icon:"🎾",unlocked:history.length>=1},
    {id:"win1",label:"First Win",desc:"Win your first match",icon:"🏆",unlocked:wins>=1},
    {id:"hat",label:"Hat Trick",desc:"Win 3 matches",icon:"🔥",unlocked:wins>=3},
    {id:"ded",label:"Dedicated",desc:"Play 10 matches",icon:"💪",unlocked:played>=10},
    {id:"sharp",label:"Sharp",desc:"70%+ win rate (5+ matches)",icon:"⚡",unlocked:played>=5&&winRate>=70},
    {id:"fire",label:"On Fire",desc:"3-match win streak",icon:"🚀",unlocked:streakType==="win"&&streakCount>=3},
    {id:"beast",label:"Unstoppable",desc:"5-match win streak",icon:"👑",unlocked:streakType==="win"&&streakCount>=5},
    {id:"vet",label:"Veteran",desc:"Play 25 matches",icon:"🎖️",unlocked:played>=25},
  ];
  var unlockedCount=BADGES.filter(function(b){return b.unlocked;}).length;
  var iStyle=inputStyle(t);

  return (
    <div style={{maxWidth:680,margin:"0 auto"}}>

      {/* Hero header */}
      <div style={{padding:"28px 20px 0",background:t.bg}}>
        <div style={{display:"flex",alignItems:"flex-start",gap:16,marginBottom:20}}>
          <div style={{
            width:72,height:72,borderRadius:"50%",flexShrink:0,
            background:avColor(profile.name),
            display:"flex",alignItems:"center",justifyContent:"center",
            fontSize:24,fontWeight:800,color:"#fff",
            boxShadow:"0 0 0 3px "+t.bg+", 0 0 0 5px "+avColor(profile.name)+"44"
          }}>{profile.avatar}</div>
          <div style={{flex:1,paddingTop:4}}>
            <div style={{fontSize:22,fontWeight:800,color:t.text,letterSpacing:"-0.5px",lineHeight:1.1}}>{profile.name}</div>
            {profile.suburb&&<div style={{fontSize:13,color:t.textSecondary,marginTop:3}}>{profile.suburb}</div>}
            <div style={{display:"flex",gap:6,marginTop:8,flexWrap:"wrap"}}>
              <span style={{fontSize:11,fontWeight:700,color:t.accent,background:t.accentSubtle,padding:"3px 9px",borderRadius:20,letterSpacing:"0.02em"}}>{profile.skill}</span>
              <span style={{fontSize:11,fontWeight:600,color:t.green,background:t.greenSubtle,padding:"3px 9px",borderRadius:20}}>{profile.style}</span>
            </div>
          </div>
          <button
            onClick={function(){setProfileDraft(profile);setProfileTab("settings");}}
            style={{padding:"7px 14px",borderRadius:8,border:"1px solid "+t.border,background:"transparent",color:t.text,fontSize:12,fontWeight:600,flexShrink:0,marginTop:4}}>
            Edit
          </button>
        </div>
        {profile.bio&&<p style={{fontSize:13,color:t.textSecondary,lineHeight:1.6,marginBottom:16,marginTop:-8}}>{profile.bio}</p>}

        <div style={{background:t.bgCard,border:"1px solid "+t.border,borderRadius:10,padding:"12px 16px",marginBottom:16,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div>
            <div style={{fontSize:10,fontWeight:700,color:t.textTertiary,textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:2}}>Ranking Points</div>
            <div style={{fontSize:26,fontWeight:800,color:t.text,letterSpacing:"-0.5px",fontVariantNumeric:"tabular-nums"}}>{rankPts.toLocaleString()}</div>
          </div>
          <div style={{textAlign:"right"}}>
            <div style={{fontSize:10,fontWeight:700,color:t.textTertiary,textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:2}}>Achievements</div>
            <div style={{fontSize:26,fontWeight:800,color:t.gold,letterSpacing:"-0.5px"}}>{unlockedCount}<span style={{fontSize:13,color:t.textTertiary,fontWeight:500}}>/{BADGES.length}</span></div>
          </div>
        </div>

        <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8,marginBottom:20}}>
          {[
            {l:"Matches",v:history.length,c:t.text},
            {l:"Wins",v:wins,c:t.green},
            {l:"Win %",v:history.length?winRate+"%":"—",c:t.accent},
            {l:"Streak",v:streakLabel,c:streakType==="win"?t.green:streakType==="loss"?t.red:t.textTertiary},
          ].map(function(s){
            return (
              <div key={s.l} style={{background:t.bgCard,border:"1px solid "+t.border,borderRadius:10,padding:"12px 8px",textAlign:"center"}}>
                <div style={{fontSize:20,fontWeight:800,color:s.c,fontVariantNumeric:"tabular-nums",letterSpacing:"-0.3px"}}>{s.v}</div>
                <div style={{fontSize:9,color:t.textTertiary,marginTop:3,fontWeight:700,letterSpacing:"0.07em",textTransform:"uppercase"}}>{s.l}</div>
              </div>
            );
          })}
        </div>

        <div style={{display:"flex",borderBottom:"1px solid "+t.border,marginLeft:-20,marginRight:-20,paddingLeft:20}}>
          {["overview","matches","achievements","settings"].map(function(pt){
            var on=profileTab===pt;
            return (
              <button key={pt}
                onClick={function(){setProfileTab(pt);setEditingAvail(false);if(pt==="settings")setProfileDraft(profile);}}
                style={{
                  padding:"10px 16px",border:"none",background:"transparent",
                  color:on?t.accent:t.textTertiary,
                  fontSize:12,fontWeight:on?700:500,
                  borderBottom:"2px solid "+(on?t.accent:"transparent"),
                  marginBottom:"-1px",textTransform:"capitalize",letterSpacing:"0.01em"
                }}>
                {pt}
              </button>
            );
          })}
        </div>
      </div>

      {/* Overview */}
      {profileTab==="overview"&&(
        <div style={{padding:"20px 20px 100px"}} className="fade-up">
          <div style={{fontSize:10,fontWeight:700,color:t.textTertiary,textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:10}}>Performance</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:24}}>
            {[
              {l:"Total Played",v:history.length,sub:"all time",c:t.text},
              {l:"Total Wins",v:wins,sub:"all time",c:t.green},
              {l:"Total Losses",v:losses,sub:"all time",c:t.red},
              {l:"Win Rate",v:history.length?winRate+"%":"—",sub:history.length?"from "+history.length+" matches":"no matches yet",c:t.accent},
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
                <div key={m.id} style={{
                  background:t.bgCard,border:"1px solid "+t.border,
                  borderLeft:"3px solid "+(isWin?t.green:t.red),
                  borderRadius:10,padding:"14px 16px",marginBottom:8,
                  display:"flex",alignItems:"center",gap:12
                }}>
                  <div style={{
                    width:36,height:36,borderRadius:"50%",flexShrink:0,
                    background:isWin?t.greenSubtle:t.redSubtle,
                    display:"flex",alignItems:"center",justifyContent:"center",
                    fontSize:14,fontWeight:800,
                    color:isWin?t.green:t.red
                  }}>{isWin?"W":"L"}</div>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:14,fontWeight:600,color:t.text,marginBottom:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>vs {m.oppName||"Unknown"}</div>
                    <div style={{fontSize:12,color:t.textSecondary}}>{scoreStr||"No score"}{m.tournName?" · "+m.tournName:""}</div>
                  </div>
                  <div style={{fontSize:11,color:t.textTertiary,flexShrink:0,textAlign:"right"}}>{m.date||""}</div>
                </div>
              );
            })
          }

          {unlockedCount>0&&(
            <div style={{marginTop:24}}>
              <div style={{fontSize:10,fontWeight:700,color:t.textTertiary,textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:10,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <span>Achievements</span>
                <button onClick={function(){setProfileTab("achievements");}} style={{background:"none",border:"none",color:t.accent,fontSize:11,fontWeight:600}}>See all</button>
              </div>
              <div style={{display:"flex",gap:8,overflowX:"auto",paddingBottom:4}}>
                {BADGES.filter(function(b){return b.unlocked;}).map(function(b){
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

          <div style={{marginTop:24}}>
            <div style={{fontSize:10,fontWeight:700,color:t.textTertiary,textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:10,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <span>Availability</span>
              <button onClick={function(){setProfileTab("settings");setEditingAvail(true);}} style={{background:"none",border:"none",color:t.accent,fontSize:11,fontWeight:600}}>Edit</button>
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

      {/* Matches */}
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
                      <div style={{
                        width:32,height:32,borderRadius:"50%",
                        background:isWin?t.greenSubtle:t.redSubtle,
                        display:"flex",alignItems:"center",justifyContent:"center",
                        fontSize:12,fontWeight:800,color:isWin?t.green:t.red,flexShrink:0
                      }}>{isWin?"W":"L"}</div>
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

      {/* Achievements */}
      {profileTab==="achievements"&&(
        <div style={{padding:"20px 20px 100px"}} className="fade-up">
          <div style={{fontSize:10,fontWeight:700,color:t.textTertiary,textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:4}}>Badges</div>
          <div style={{fontSize:13,color:t.textSecondary,marginBottom:16}}>{unlockedCount} of {BADGES.length} unlocked</div>
          <div style={{background:t.bgTertiary,borderRadius:4,height:4,marginBottom:24,overflow:"hidden"}}>
            <div style={{height:"100%",width:(unlockedCount/BADGES.length*100)+"%",background:t.gold,borderRadius:4,transition:"width 0.5s ease"}}/>
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:8}}>
            {BADGES.map(function(b){
              return (
                <div key={b.id} style={{
                  background:t.bgCard,border:"1px solid "+t.border,
                  borderLeft:"3px solid "+(b.unlocked?t.gold:t.border),
                  borderRadius:10,padding:"14px 16px",
                  display:"flex",alignItems:"center",gap:14,
                  opacity:b.unlocked?1:0.5
                }}>
                  <div style={{
                    width:44,height:44,borderRadius:12,flexShrink:0,
                    background:b.unlocked?t.goldSubtle:t.bgTertiary,
                    display:"flex",alignItems:"center",justifyContent:"center",
                    fontSize:22,
                    filter:b.unlocked?"none":"grayscale(1)"
                  }}>{b.icon}</div>
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

      {/* Settings */}
      {profileTab==="settings"&&(
        <div style={{padding:"20px 20px 100px"}} className="fade-up">
          {!editingAvail&&(
            <div style={{background:t.bgCard,border:"1px solid "+t.border,borderRadius:10,padding:20,marginBottom:12}}>
              <div style={{fontSize:13,fontWeight:700,color:t.text,marginBottom:16}}>Edit Profile</div>
              {[{l:"Full name",k:"name",type:"text",ph:"Your name"},{l:"Suburb",k:"suburb",type:"text",ph:"e.g. Bondi"},{l:"Bio",k:"bio",type:"text",ph:"Short bio..."}].map(function(f){
                return (
                  <div key={f.k} style={{marginBottom:10}}>
                    <label style={{fontSize:10,fontWeight:700,color:t.textSecondary,display:"block",marginBottom:4,letterSpacing:"0.06em",textTransform:"uppercase"}}>{f.l}</label>
                    <input type={f.type} value={profileDraft[f.k]||""} placeholder={f.ph}
                      onChange={function(e){var v=e.target.value;setProfileDraft(function(d){return Object.assign({},d,{[f.k]:v});});}}
                      style={iStyle}/>
                  </div>
                );
              })}
              {[{l:"Skill level",k:"skill",opts:SKILL_LEVELS},{l:"Play style",k:"style",opts:PLAY_STYLES}].map(function(f){
                return (
                  <div key={f.k} style={{marginBottom:12}}>
                    <label style={{fontSize:10,fontWeight:700,color:t.textSecondary,display:"block",marginBottom:6,letterSpacing:"0.06em",textTransform:"uppercase"}}>{f.l}</label>
                    <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
                      {f.opts.map(function(o){
                        var on=profileDraft[f.k]===o;
                        return (
                          <button key={o}
                            onClick={function(){setProfileDraft(function(d){return Object.assign({},d,{[f.k]:o});});}}
                            style={{padding:"7px 12px",borderRadius:7,border:"1px solid "+(on?t.accent:t.border),background:on?t.accentSubtle:"transparent",color:on?t.accent:t.textSecondary,fontSize:12,fontWeight:on?600:400}}>
                            {o}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
              <button
                onClick={async function(){
                  var init2=initials(profileDraft.name||"YN");
                  var nd=Object.assign({},profileDraft,{avatar:init2});
                  setProfile(nd);
                  if(authUser){
                    var res=await supabase.from('profiles').upsert({
                      id:authUser.id,
                      name:nd.name||"",
                      suburb:nd.suburb||"",
                      bio:nd.bio||"",
                      skill:nd.skill||"Intermediate",
                      style:nd.style||"All-Court",
                      avatar:nd.avatar||"",
                      availability:nd.availability||{}
                    },{onConflict:'id'});
                    if(res.error)console.error('Profile save error:',res.error);
                  }
                }}
                style={{width:"100%",padding:"12px",borderRadius:8,border:"none",background:t.accent,color:"#fff",fontSize:13,fontWeight:600,marginTop:4}}>
                Save changes
              </button>
            </div>
          )}

          {/* Availability editor */}
          <div style={{background:t.bgCard,border:"1px solid "+t.border,borderRadius:10,overflow:"hidden",marginBottom:12}}>
            <div style={{padding:"14px 16px",borderBottom:"1px solid "+t.border,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <span style={{fontSize:13,fontWeight:700,color:t.text}}>Availability</span>
              <button
                onClick={function(){setAvailDraft(profile.availability||{});setEditingAvail(!editingAvail);}}
                style={{fontSize:12,color:t.accent,background:"none",border:"none",fontWeight:600}}>
                {editingAvail?"Done":"Edit"}
              </button>
            </div>
            {editingAvail?(
              <div style={{padding:"16px"}}>
                {DAYS_SHORT.map(function(day,di){
                  return (
                    <div key={day} style={{display:"flex",alignItems:"center",gap:10,paddingTop:di===0?0:12,paddingBottom:12,borderBottom:di<DAYS_SHORT.length-1?"1px solid "+t.border:"none"}}>
                      <span style={{fontSize:12,fontWeight:700,color:t.textSecondary,width:32,flexShrink:0}}>{day}</span>
                      <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
                        {TIME_BLOCKS.map(function(block){
                          var on=(availDraft[day]||[]).includes(block);
                          return (
                            <button key={block}
                              onClick={function(){
                                var cur=availDraft[day]||[];
                                var next=on?cur.filter(function(b){return b!==block;}):cur.concat([block]);
                                setAvailDraft(function(d){return Object.assign({},d,{[day]:next});});
                              }}
                              style={{padding:"6px 11px",borderRadius:7,border:"1px solid "+(on?t.accent:t.border),background:on?t.accentSubtle:"transparent",color:on?t.accent:t.textTertiary,fontSize:11,fontWeight:on?600:400}}>
                              {block}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
                <button
                  onClick={async function(){
                    setProfile(function(p){return Object.assign({},p,{availability:availDraft});});
                    setEditingAvail(false);
                    if(authUser){
                      var res=await supabase.from('profiles').upsert({id:authUser.id,availability:availDraft},{onConflict:'id'});
                      if(res.error)console.error('Availability save error:',res.error);
                    }
                  }}
                  style={{width:"100%",marginTop:12,padding:"12px",borderRadius:8,border:"none",background:t.accent,color:"#fff",fontSize:13,fontWeight:600}}>
                  Save availability
                </button>
              </div>
            ):(
              <div style={{padding:"14px 16px"}}>
                {DAYS_SHORT.filter(function(d){return((profile.availability||{})[d]||[]).length>0;}).length===0
                  ?<p style={{fontSize:13,color:t.textTertiary,margin:0}}>No availability set.</p>
                  :DAYS_SHORT.filter(function(d){return((profile.availability||{})[d]||[]).length>0;}).map(function(day){
                    return (
                      <div key={day} style={{display:"flex",alignItems:"center",gap:10,marginBottom:6}}>
                        <span style={{fontSize:11,fontWeight:700,color:t.textSecondary,width:30}}>{day}</span>
                        <div style={{display:"flex",gap:4}}>
                          {((profile.availability||{})[day]||[]).map(function(b){
                            return <span key={b} style={{fontSize:10,fontWeight:600,color:t.accent,background:t.accentSubtle,padding:"2px 8px",borderRadius:20}}>{b}</span>;
                          })}
                        </div>
                      </div>
                    );
                  })
                }
              </div>
            )}
          </div>

          {/* Privacy */}
          <div style={{background:t.bgCard,border:"1px solid "+t.border,borderRadius:10,overflow:"hidden",marginBottom:12}}>
            <div style={{padding:"14px 16px",borderBottom:"1px solid "+t.border}}>
              <div style={{fontSize:13,fontWeight:700,color:t.text,marginBottom:2}}>Profile Privacy</div>
              <div style={{fontSize:11,color:t.textTertiary}}>Controls who can see your profile and matches.</div>
            </div>
            <div style={{padding:"14px 16px",display:"flex",gap:6,flexWrap:"wrap"}}>
              {[{v:"public",l:"Public",d:"Everyone"},{v:"friends",l:"Friends only",d:"Only friends"},{v:"private",l:"Private",d:"Only you"}].map(function(opt){
                var on=(profile.privacy||"public")===opt.v;
                return (
                  <button key={opt.v}
                    onClick={function(){
                      var nd=Object.assign({},profile,{privacy:opt.v});
                      setProfile(nd);
                      if(authUser)supabase.from('profiles').upsert({id:authUser.id,privacy:opt.v},{onConflict:'id'});
                    }}
                    style={{flex:1,padding:"10px 8px",borderRadius:9,border:"1px solid "+(on?t.accent:t.border),background:on?t.accentSubtle:"transparent",color:on?t.accent:t.textSecondary,fontSize:12,fontWeight:on?700:400,textAlign:"center"}}>
                    <div>{opt.l}</div>
                    <div style={{fontSize:10,opacity:0.7,marginTop:1}}>{opt.d}</div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Account */}
          {authUser&&(
            <div style={{background:t.bgCard,border:"1px solid "+t.border,borderRadius:10,overflow:"hidden",marginBottom:12}}>
              <div style={{padding:"14px 16px",borderBottom:"1px solid "+t.border}}>
                <div style={{fontSize:10,fontWeight:700,color:t.textTertiary,textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:2}}>Account</div>
                <div style={{fontSize:14,color:t.text,fontWeight:500}}>{authUser.email}</div>
              </div>
              <button onClick={function(){setTab("people");setPeopleTab("requests");}}
                style={{width:"100%",padding:"12px 16px",border:"none",borderBottom:"1px solid "+t.border,background:"transparent",color:t.text,fontSize:13,fontWeight:500,textAlign:"left",cursor:"pointer",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <span>Friend requests</span>
                <span style={{fontSize:12,color:receivedRequests.length>0?t.accent:t.textTertiary}}>{receivedRequests.length>0?receivedRequests.length+" pending":"›"}</span>
              </button>
              <button
                onClick={function(){supabase.auth.signOut();}}
                style={{width:"100%",padding:"14px 16px",border:"none",background:"transparent",color:t.red,fontSize:13,fontWeight:600,textAlign:"left",cursor:"pointer"}}>
                Sign out
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
