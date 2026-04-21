import { useRef, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { avColor } from "../../../lib/utils/avatar.js";
import { inputStyle } from "../../../lib/theme.js";
import Messages from "../components/Messages.jsx";
import { PresenceDot, PresenceLabel } from "../components/PresenceIndicator.jsx";
import { track } from "../../../lib/analytics.js";
import ChallengesPanel from "../../challenges/components/ChallengesPanel.jsx";

function fmtMsgTime(iso){
  if(!iso)return"";
  var d=new Date(iso);
  var now=new Date();
  var sameDay=d.toDateString()===now.toDateString();
  if(sameDay)return d.toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"});
  return d.toLocaleDateString([],{day:"numeric",month:"short"});
}

// ── PlayerCard ────────────────────────────────────────────────────────────────
function PlayerCard({u, t, socialLoading, friendRelationLabel, sentReq, recvReq,
  sendFriendRequest, cancelRequest, acceptRequest, declineRequest, unfriend, blockUser,
  onMessage, openProfile, openChallenge}) {
  var rel=friendRelationLabel(u.id), loading=!!socialLoading[u.id];
  var wr=u.matches_played?Math.round((u.wins||0)/u.matches_played*100):null;
  function goToProfile(){ if(openProfile) openProfile(u.id); }
  var clickable=!!openProfile;
  return (
    <div style={{background:t.bgCard,border:"1px solid "+t.border,borderRadius:12,padding:"14px 16px",marginBottom:8,display:"flex",gap:12,alignItems:"center"}}>
      <div
        onClick={clickable?goToProfile:undefined}
        style={{position:"relative",flexShrink:0,cursor:clickable?"pointer":"default"}}>
        <div style={{width:44,height:44,borderRadius:"50%",background:avColor(u.name||"?"),display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,fontWeight:700,color:"#fff"}}>
          {(u.avatar||(u.name||"?").slice(0,2)).slice(0,2).toUpperCase()}
        </div>
        <PresenceDot profile={u} t={t}/>
      </div>
      <div
        onClick={clickable?goToProfile:undefined}
        style={{flex:1,minWidth:0,cursor:clickable?"pointer":"default"}}>
        <div style={{display:"flex",alignItems:"center",gap:8,minWidth:0}}>
          <div style={{fontSize:14,fontWeight:700,color:t.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{u.name}</div>
          <PresenceLabel profile={u} t={t} style={{flexShrink:0}}/>
        </div>
        <div style={{fontSize:11,color:t.textSecondary,marginTop:1}}>
          {u.suburb&&<span>{u.suburb}</span>}
          {u.skill&&<span>{u.suburb?" · ":""}{u.skill}</span>}
          {wr!==null&&<span> · {wr}% wins</span>}
        </div>
        {u.ranking_points!=null&&<div style={{fontSize:10,color:t.textTertiary,marginTop:1}}>{u.ranking_points} pts · {u.matches_played||0} matches</div>}
      </div>
      <div style={{display:"flex",flexDirection:"column",gap:5,flexShrink:0}}>
        {onMessage&&(
          <button onClick={function(){onMessage(u);}}
            style={{padding:"6px 12px",borderRadius:8,border:"1px solid "+t.accent,background:"transparent",color:t.accent,fontSize:12,fontWeight:600}}>
            Message
          </button>
        )}
        {rel==="none"&&(
          <button disabled={loading} onClick={function(){sendFriendRequest(u);}}
            style={{padding:"6px 14px",borderRadius:8,border:"none",background:t.accent,color:"#fff",fontSize:12,fontWeight:600,opacity:loading?0.6:1}}>
            {loading?"…":"Add"}
          </button>
        )}
        {rel==="sent"&&(
          <button disabled={loading} onClick={function(){var r=sentReq(u.id);if(r)cancelRequest(r);}}
            style={{padding:"6px 14px",borderRadius:8,border:"1px solid "+t.border,background:"transparent",color:t.textSecondary,fontSize:12,fontWeight:500,opacity:loading?0.6:1}}>
            {loading?"…":"Pending"}
          </button>
        )}
        {rel==="received"&&(
          <div style={{display:"flex",gap:5}}>
            <button disabled={loading} onClick={function(){var r=recvReq(u.id);if(r)acceptRequest(r);}}
              style={{padding:"6px 12px",borderRadius:8,border:"none",background:t.green,color:"#fff",fontSize:12,fontWeight:600,opacity:loading?0.6:1}}>
              {loading?"…":"Accept"}
            </button>
            <button disabled={loading} onClick={function(){var r=recvReq(u.id);if(r)declineRequest(r);}}
              style={{padding:"6px 10px",borderRadius:8,border:"1px solid "+t.border,background:"transparent",color:t.textSecondary,fontSize:12,opacity:loading?0.6:1}}>
              ✕
            </button>
          </div>
        )}
        {rel==="friends"&&openChallenge&&(
          <button onClick={function(){openChallenge(u,"profile");}}
            style={{padding:"6px 12px",borderRadius:8,border:"1px solid "+t.accent,background:t.accentSubtle,color:t.accent,fontSize:11,fontWeight:700,letterSpacing:"0.02em"}}>
            🔁 Challenge
          </button>
        )}
        {rel==="friends"&&(
          <button disabled={loading} onClick={function(){if(window.confirm("Unfriend "+u.name+"?"))unfriend(u);}}
            style={{padding:"6px 14px",borderRadius:8,border:"1px solid "+t.border,background:"transparent",color:t.textSecondary,fontSize:12,fontWeight:500,opacity:loading?0.6:1}}>
            {loading?"…":"Friends ✓"}
          </button>
        )}
        <button onClick={function(){blockUser(u);}}
          style={{padding:"4px 10px",borderRadius:7,border:"1px solid "+t.border,background:"transparent",color:t.textTertiary,fontSize:10,fontWeight:500}}>
          Block
        </button>
      </div>
    </div>
  );
}

// ── PeopleTab ─────────────────────────────────────────────────────────────────
export default function PeopleTab({
  t, authUser, friends, sentRequests, receivedRequests,
  blockedUsers, suggestedPlayers,
  playedOpponents, sameSkillPlayers,
  peopleSearch, setPeopleSearch,
  searchResults, setSearchResults, searchLoading, showSearchDrop, setShowSearchDrop,
  socialLoading, searchTimer,
  sendFriendRequest, acceptRequest, declineRequest, cancelRequest,
  unfriend, blockUser, unblockUser, searchUsers,
  friendRelationLabel, sentReq, recvReq,
  setShowAuth, setAuthMode, setAuthStep,
  dms,
  openProfile,
  challenges,
  openChallenge,
  openConvertToMatch,
  toast,
}) {
  var location=useLocation();
  var navigate=useNavigate();

  // Derive active sub-tab from URL: /people/messages → "messages"
  // Module 4: 'challenges' is the new coordination inbox.
  var validPeopleTabs=["messages","friends","requests","challenges","suggested","blocked"];
  var pathParts=location.pathname.split("/").filter(Boolean);
  var peopleTab=(pathParts[1]&&validPeopleTabs.includes(pathParts[1]))?pathParts[1]:"friends";

  function setPeopleTab(newTab){
    navigate("/people/"+newTab);
    if(newTab!=="messages"&&dms)dms.closeConversation();
  }

  var messagesEndRef=useRef(null);

  useEffect(function(){
    if(dms&&dms.activeConv&&messagesEndRef.current){
      messagesEndRef.current.scrollIntoView({behavior:"smooth"});
    }
  },[dms&&dms.threadMessages&&dms.threadMessages.length, dms&&dms.activeConv]);

  // Module 3.5: Discover tab view. Section counts are snapshotted at view time
  // so we can measure whether empty-states correlate with drop-off.
  useEffect(function(){
    if(peopleTab!=="suggested"||!authUser) return;
    track("discover_tab_viewed",{
      played_opponents_count: (playedOpponents||[]).length,
      suburb_suggestions_count: (suggestedPlayers||[]).length,
      skill_suggestions_count: (sameSkillPlayers||[]).length,
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[peopleTab,authUser&&authUser.id]);

  if(!authUser) return (
    <div style={{maxWidth:680,margin:"0 auto",padding:"60px 20px",textAlign:"center"}}>
      <div style={{fontSize:32,marginBottom:12}}>🎾</div>
      <div style={{fontSize:18,fontWeight:700,color:t.text,marginBottom:8}}>Find your people</div>
      <div style={{fontSize:14,color:t.textSecondary,marginBottom:24}}>Connect with other players, follow their results, and build your tennis community.</div>
      <button onClick={function(){setShowAuth(true);setAuthMode("signup");setAuthStep("choose");}}
        style={{padding:"13px 28px",borderRadius:9,border:"none",background:t.accent,color:"#fff",fontSize:14,fontWeight:700}}>
        Join free
      </button>
    </div>
  );

  var cardProps={t,socialLoading,friendRelationLabel,sentReq,recvReq,sendFriendRequest,cancelRequest,acceptRequest,declineRequest,unfriend,blockUser,openProfile,openChallenge};
  var iStyle=inputStyle(t);
  var dmUnread=dms?dms.totalUnread():0;
  var dmBadge=(dms?(dms.requests||[]).length:0)+(dms&&dms.conversations?dms.conversations.filter(function(c){return c.hasUnread;}).length:0);

  // Works for both friends (bypasses request gate via useDMs friendship
  // override) and non-friends (creates a normal DM request).
  function handleMessage(u){
    navigate("/people/messages");
    if(dms)dms.openOrStartConversation(u);
  }

  return (
    <div style={{maxWidth:680,margin:"0 auto"}}>
      {/* Search */}
      <div style={{padding:"20px 20px 0"}}>
        <div style={{position:"relative",marginBottom:16}}>
          <span style={{position:"absolute",left:12,top:"50%",transform:"translateY(-50%)",fontSize:15,pointerEvents:"none"}}>🔍</span>
          <input
            value={peopleSearch}
            placeholder="Search players by name…"
            onChange={function(e){
              var q=e.target.value; setPeopleSearch(q);
              clearTimeout(searchTimer.current);
              if(!q.trim()){setSearchResults&&setSearchResults([]);setShowSearchDrop(false);return;}
              setShowSearchDrop(true);
              searchTimer.current=setTimeout(function(){searchUsers(q);},400);
            }}
            onFocus={function(){if(searchResults.length>0)setShowSearchDrop(true);}}
            onBlur={function(){setTimeout(function(){setShowSearchDrop(false);},180);}}
            style={Object.assign({},iStyle,{paddingLeft:38,fontSize:14})}/>
          {searchLoading&&<span style={{position:"absolute",right:12,top:"50%",transform:"translateY(-50%)",fontSize:11,color:t.textTertiary}}>…</span>}

          {showSearchDrop&&peopleSearch.trim()&&(
            <div style={{position:"absolute",top:"calc(100% + 6px)",left:0,right:0,background:t.bgCard,borderRadius:12,boxShadow:"0 8px 32px rgba(0,0,0,0.13)",border:"1px solid "+t.border,zIndex:200,overflow:"hidden",maxHeight:320,overflowY:"auto"}}>
              {searchLoading
                ?<div style={{padding:"18px 16px",textAlign:"center",color:t.textTertiary,fontSize:13}}>Searching…</div>
                :searchResults.length===0
                ?<div style={{padding:"18px 16px",textAlign:"center",color:t.textTertiary,fontSize:13}}>No players found for "{peopleSearch}"</div>
                :searchResults.map(function(u){
                  var isFriendU=friends.some(function(f){return f.id===u.id;});
                  var isPending=sentRequests.some(function(r){return r.id===u.id;});
                  var isReceived=receivedRequests.some(function(r){return r.id===u.id;});
                  function goToThisProfile(){
                    if(!openProfile) return;
                    setShowSearchDrop(false);
                    openProfile(u.id);
                  }
                  var rowClickable=!!openProfile;
                  return (
                    <div key={u.id} style={{display:"flex",alignItems:"center",gap:12,padding:"10px 16px",borderBottom:"1px solid "+t.border}}>
                      <div onMouseDown={rowClickable?goToThisProfile:undefined}
                        style={{position:"relative",flexShrink:0,cursor:rowClickable?"pointer":"default"}}>
                        <div style={{width:36,height:36,borderRadius:"50%",background:t.accentSubtle,display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,overflow:"hidden"}}>
                          {u.avatar?<img src={u.avatar} alt="" style={{width:"100%",height:"100%",objectFit:"cover"}}/>:"🎾"}
                        </div>
                        <PresenceDot profile={u} t={t} size={9}/>
                      </div>
                      <div onMouseDown={rowClickable?goToThisProfile:undefined}
                        style={{flex:1,minWidth:0,cursor:rowClickable?"pointer":"default"}}>
                        <div style={{fontSize:14,fontWeight:600,color:t.text,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{u.name}</div>
                        <div style={{fontSize:11,color:t.textTertiary}}>{[u.suburb,u.skill].filter(Boolean).join(" · ")}</div>
                      </div>
                      {isFriendU
                        ?<span style={{fontSize:11,color:t.accent,fontWeight:600}}>Friends</span>
                        :isReceived
                          ?<button onMouseDown={function(){var r=recvReq(u.id);if(r)acceptRequest(r);setShowSearchDrop(false);}} style={{fontSize:11,padding:"4px 10px",borderRadius:6,border:"none",background:t.accent,color:"#fff",fontWeight:600,cursor:"pointer"}}>Accept</button>
                          :isPending
                            ?<button onMouseDown={function(){var r=sentReq(u.id);if(r)cancelRequest(r);}} style={{fontSize:11,padding:"4px 10px",borderRadius:6,border:"1px solid "+t.border,background:"transparent",color:t.textSecondary,fontWeight:600,cursor:"pointer"}}>Pending</button>
                            :<button onMouseDown={function(){sendFriendRequest(u);}} style={{fontSize:11,padding:"4px 10px",borderRadius:6,border:"none",background:t.accent,color:"#fff",fontWeight:600,cursor:"pointer"}}>Add</button>
                      }
                    </div>
                  );
                })
              }
            </div>
          )}
        </div>
      </div>

      {/* Sub-tabs */}
      <div>
        <div style={{display:"flex",borderBottom:"1px solid "+t.border,padding:"0 20px",overflowX:"auto"}}>
          {(function(){
            var chCounts = (challenges && challenges.counts) ? challenges.counts() : {incoming:0,outgoing:0,accepted:0};
            var chBadge = chCounts.incoming + chCounts.accepted; // bold sections
            return [
              {id:"messages",label:"Messages",count:dmBadge||null},
              {id:"friends",label:"Friends",count:friends.length},
              {id:"requests",label:"Requests",count:receivedRequests.length+sentRequests.length},
              {id:"challenges",label:"Challenges",count:chBadge||null},
              {id:"suggested",label:"Discover",count:null},
              {id:"blocked",label:"Blocked",count:blockedUsers.length||null},
            ];
          })().map(function(tb){
            var on=peopleTab===tb.id;
            return (
              <button key={tb.id} onClick={function(){setPeopleTab(tb.id);if(tb.id!=="messages"&&dms)dms.closeConversation();}}
                style={{padding:"10px 0",marginRight:20,border:"none",background:"transparent",color:on?t.accent:t.textTertiary,fontSize:13,fontWeight:on?700:400,borderBottom:"2px solid "+(on?t.accent:"transparent"),marginBottom:"-1px",display:"flex",gap:5,alignItems:"center",flexShrink:0}}>
                {tb.label}
                {tb.count>0&&<span style={{fontSize:10,fontWeight:800,color:on?t.accent:t.textTertiary,background:on?t.accentSubtle:t.bgTertiary,padding:"1px 6px",borderRadius:10}}>{tb.count}</span>}
              </button>
            );
          })}
        </div>

        <div style={{padding:"16px 20px 100px"}} className="fade-up">

          {/* Messages */}
          {peopleTab==="messages"&&dms&&(
            <Messages t={t} authUser={authUser} dms={dms} openProfile={openProfile}/>
          )}

          {/* Friends */}
          {peopleTab==="friends"&&(
            friends.length===0
              ?<div style={{textAlign:"center",padding:"48px 20px"}}>
                <div style={{fontSize:36,marginBottom:12}}>🤝</div>
                <div style={{fontSize:16,fontWeight:700,color:t.text,marginBottom:6}}>No friends yet</div>
                <div style={{fontSize:13,color:t.textSecondary,marginBottom:20}}>Search for players above or check Suggested players.</div>
                <button onClick={function(){setPeopleTab("suggested");}} style={{padding:"10px 20px",borderRadius:8,border:"none",background:t.accent,color:"#fff",fontSize:13,fontWeight:600}}>See suggestions</button>
              </div>
              :<div>
                <div style={{fontSize:10,fontWeight:700,color:t.textTertiary,textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:12}}>{friends.length} friend{friends.length!==1?"s":""}</div>
                {friends.map(function(u){return <PlayerCard key={u.id} u={u} {...cardProps} onMessage={handleMessage}/>;})}</div>
          )}

          {/* Requests */}
          {peopleTab==="requests"&&(
            receivedRequests.length===0&&sentRequests.length===0
              ?<div style={{textAlign:"center",padding:"48px 20px"}}>
                <div style={{fontSize:36,marginBottom:12}}>📬</div>
                <div style={{fontSize:16,fontWeight:700,color:t.text,marginBottom:6}}>No pending requests</div>
                <div style={{fontSize:13,color:t.textSecondary}}>When someone adds you, it'll show up here.</div>
              </div>
              :<div>
                {receivedRequests.length>0&&(
                  <div style={{marginBottom:20}}>
                    <div style={{fontSize:10,fontWeight:700,color:t.textTertiary,textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:12}}>Received · {receivedRequests.length}</div>
                    {receivedRequests.map(function(u){
                      var loading=!!socialLoading[u.id];
                      return (
                        <div key={u.id} style={{background:t.bgCard,border:"1px solid "+t.border,borderLeft:"3px solid "+t.accent,borderRadius:12,padding:"14px 16px",marginBottom:8,display:"flex",gap:12,alignItems:"center"}}>
                          <div
                            onClick={openProfile?function(){openProfile(u.id);}:undefined}
                            style={{width:44,height:44,borderRadius:"50%",background:avColor(u.name||"?"),display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,fontWeight:700,color:"#fff",flexShrink:0,cursor:openProfile?"pointer":"default"}}>
                            {(u.avatar||"?").slice(0,2).toUpperCase()}
                          </div>
                          <div
                            onClick={openProfile?function(){openProfile(u.id);}:undefined}
                            style={{flex:1,cursor:openProfile?"pointer":"default"}}>
                            <div style={{fontSize:14,fontWeight:700,color:t.text}}>{u.name}</div>
                            <div style={{fontSize:11,color:t.textSecondary,marginTop:1}}>{u.suburb} {u.skill&&"· "+u.skill}</div>
                          </div>
                          <div style={{display:"flex",gap:6}}>
                            <button onClick={function(){handleMessage(u);}}
                              style={{padding:"8px 12px",borderRadius:8,border:"1px solid "+t.accent,background:"transparent",color:t.accent,fontSize:12,fontWeight:600}}>
                              Message
                            </button>
                            <button disabled={loading} onClick={function(){acceptRequest(u);}}
                              style={{padding:"8px 16px",borderRadius:8,border:"none",background:t.green,color:"#fff",fontSize:13,fontWeight:600,opacity:loading?0.6:1}}>
                              {loading?"…":"Accept"}
                            </button>
                            <button disabled={loading} onClick={function(){declineRequest(u);}}
                              style={{padding:"8px 12px",borderRadius:8,border:"1px solid "+t.border,background:"transparent",color:t.textSecondary,fontSize:13,opacity:loading?0.6:1}}>
                              Decline
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
                {sentRequests.length>0&&(
                  <div>
                    <div style={{fontSize:10,fontWeight:700,color:t.textTertiary,textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:12}}>Sent · {sentRequests.length}</div>
                    {sentRequests.map(function(u){
                      var loading=!!socialLoading[u.id];
                      return (
                        <div key={u.id} style={{background:t.bgCard,border:"1px solid "+t.border,borderRadius:12,padding:"14px 16px",marginBottom:8,display:"flex",gap:12,alignItems:"center"}}>
                          <div
                            onClick={openProfile?function(){openProfile(u.id);}:undefined}
                            style={{width:44,height:44,borderRadius:"50%",background:avColor(u.name||"?"),display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,fontWeight:700,color:"#fff",flexShrink:0,cursor:openProfile?"pointer":"default"}}>
                            {(u.avatar||"?").slice(0,2).toUpperCase()}
                          </div>
                          <div
                            onClick={openProfile?function(){openProfile(u.id);}:undefined}
                            style={{flex:1,cursor:openProfile?"pointer":"default"}}>
                            <div style={{fontSize:14,fontWeight:700,color:t.text}}>{u.name}</div>
                            <div style={{fontSize:11,color:t.textSecondary,marginTop:1}}>{u.suburb} {u.skill&&"· "+u.skill}</div>
                            <div style={{fontSize:11,color:t.textTertiary,marginTop:2}}>Request pending</div>
                          </div>
                          <div style={{display:"flex",gap:6,flexShrink:0}}>
                            <button onClick={function(){handleMessage(u);}}
                              style={{padding:"7px 12px",borderRadius:8,border:"1px solid "+t.accent,background:"transparent",color:t.accent,fontSize:12,fontWeight:600}}>
                              Message
                            </button>
                            <button disabled={loading} onClick={function(){cancelRequest(u);}}
                              style={{padding:"7px 14px",borderRadius:8,border:"1px solid "+t.border,background:"transparent",color:t.textSecondary,fontSize:12,fontWeight:500,opacity:loading?0.6:1}}>
                              {loading?"…":"Cancel"}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
          )}

          {/* Challenges — coordination inbox (Module 4). */}
          {peopleTab==="challenges"&&challenges&&(
            <ChallengesPanel
              t={t} authUser={authUser}
              challenges={challenges.challenges}
              profileMap={challenges.profileMap}
              loading={challenges.loading}
              openProfile={openProfile}
              acceptChallenge={challenges.acceptChallenge}
              declineChallenge={challenges.declineChallenge}
              cancelChallenge={challenges.cancelChallenge}
              onLogConvertedMatch={openConvertToMatch}
              toast={toast}
            />
          )}

          {/* Discover — 3 sections: people you've played, near you, similar
              skill. Empty state only when all three are empty; otherwise show
              whichever sections have data. */}
          {peopleTab==="suggested"&&(function(){
            var playedArr = playedOpponents || [];
            var suburbArr = suggestedPlayers || [];
            var skillArr  = sameSkillPlayers || [];
            var allEmpty  = !playedArr.length && !suburbArr.length && !skillArr.length;
            return (
              <div>
                {allEmpty&&(
                  <div style={{textAlign:"center",padding:"40px 20px"}}>
                    <div style={{fontSize:32,marginBottom:10}}>🎾</div>
                    <div style={{fontSize:14,fontWeight:600,color:t.text,marginBottom:6}}>No suggestions yet</div>
                    <div style={{fontSize:13,color:t.textSecondary}}>Log a match or check back as more players join your area.</div>
                  </div>
                )}

                {playedArr.length>0&&(
                  <div style={{marginBottom:24}}>
                    <div style={{fontSize:10,fontWeight:700,color:t.textTertiary,textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:4}}>People you've played</div>
                    <div style={{fontSize:12,color:t.textSecondary,marginBottom:12}}>Opponents from confirmed matches — add them to your friends.</div>
                    {playedArr.map(function(u){return <PlayerCard key={u.id} u={u} {...cardProps} onMessage={handleMessage}/>;})}
                  </div>
                )}

                {suburbArr.length>0&&(
                  <div style={{marginBottom:24}}>
                    <div style={{fontSize:10,fontWeight:700,color:t.textTertiary,textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:4}}>Players near you</div>
                    <div style={{fontSize:12,color:t.textSecondary,marginBottom:12}}>Same suburb as your profile.</div>
                    {suburbArr.map(function(u){return <PlayerCard key={u.id} u={u} {...cardProps} onMessage={handleMessage}/>;})}
                  </div>
                )}

                {skillArr.length>0&&(
                  <div style={{marginBottom:24}}>
                    <div style={{fontSize:10,fontWeight:700,color:t.textTertiary,textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:4}}>Similar skill level</div>
                    <div style={{fontSize:12,color:t.textSecondary,marginBottom:12}}>Players with the same declared level as you.</div>
                    {skillArr.map(function(u){return <PlayerCard key={u.id} u={u} {...cardProps} onMessage={handleMessage}/>;})}
                  </div>
                )}

                <div style={{background:t.bgCard,border:"1px solid "+t.border,borderRadius:12,padding:"16px",marginTop:16,textAlign:"center"}}>
                  <div style={{fontSize:14,fontWeight:700,color:t.text,marginBottom:4}}>Invite friends</div>
                  <div style={{fontSize:12,color:t.textSecondary,marginBottom:14}}>Share CourtSync with people you play with.</div>
                  <button
                    onClick={function(){
                      var url="https://rarired.vercel.app";
                      if(navigator.share){navigator.share({title:"Join CourtSync",text:"Track your tennis matches and compete in tournaments.",url:url});}
                      else{navigator.clipboard.writeText(url);alert("Link copied!");}
                    }}
                    style={{padding:"10px 24px",borderRadius:8,border:"none",background:t.accent,color:"#fff",fontSize:13,fontWeight:600}}>
                    Share invite link
                  </button>
                </div>
              </div>
            );
          })()}

          {/* Blocked */}
          {peopleTab==="blocked"&&(
            blockedUsers.length===0
              ?<div style={{textAlign:"center",padding:"48px 20px"}}>
                <div style={{fontSize:13,color:t.textTertiary}}>You haven't blocked anyone.</div>
              </div>
              :<div>
                <div style={{fontSize:10,fontWeight:700,color:t.textTertiary,textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:12}}>{blockedUsers.length} blocked</div>
                {blockedUsers.map(function(u){
                  return (
                    <div key={u.id} style={{background:t.bgCard,border:"1px solid "+t.border,borderRadius:12,padding:"14px 16px",marginBottom:8,display:"flex",gap:12,alignItems:"center"}}>
                      <div style={{width:44,height:44,borderRadius:"50%",background:t.bgTertiary,border:"1px solid "+t.border,display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,fontWeight:700,color:t.textTertiary,flexShrink:0}}>
                        {(u.avatar||"?").slice(0,2).toUpperCase()}
                      </div>
                      <div style={{flex:1}}>
                        <div style={{fontSize:14,fontWeight:600,color:t.textSecondary}}>{u.name}</div>
                        {u.suburb&&<div style={{fontSize:11,color:t.textTertiary,marginTop:1}}>{u.suburb}</div>}
                      </div>
                      <button onClick={function(){unblockUser(u);}}
                        style={{padding:"7px 14px",borderRadius:8,border:"1px solid "+t.border,background:"transparent",color:t.accent,fontSize:12,fontWeight:600}}>
                        Unblock
                      </button>
                    </div>
                  );
                })}
              </div>
          )}
        </div>
      </div>
    </div>
  );
}
