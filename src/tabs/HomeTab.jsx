import { supabase } from "../supabase.js";
import { avColor } from "../lib/helpers.js";

// ── FeedCard ─────────────────────────────────────────────────────────────────
function FeedCard({m, isOwn, pName, pAvatar, demo, onDelete, onRemove,
  t, authUser, feedLikes, feedLikeCounts, feedComments,
  setFeedLikes, setFeedLikeCounts, setCommentModal, setCommentDraft,
  confirmOpponentMatch, disputeOpponentMatch, requestMatchCorrection}) {

  var isWin=m.result==="win";
  var scoreStr=(m.sets||[]).map(function(s){return s.you+"-"+s.them;}).join("  ");
  var liked=!!feedLikes[m.id];
  var likeCount=feedLikeCounts[m.id]||0;
  var comments=feedComments[m.id]||[];

  var status=m.status||"confirmed";
  var isExpired=status==="expired";
  var isPending=status==="pending_confirmation";
  var isDisputed=status==="disputed";
  var isOpponentView=isPending&&m.isTagged; // current user is the opponent waiting to confirm

  function timeAgo(dateStr){
    if(!dateStr) return "";
    if(dateStr==="Today") return "Today";
    if(dateStr==="Yesterday") return "Yesterday";
    return dateStr;
  }

  function handleDispute(){
    var reason=window.prompt("Reason for dispute (optional):")||"";
    disputeOpponentMatch(m, reason);
  }
  function handleCorrection(){
    var reason=window.prompt("What needs to be corrected?")||"";
    requestMatchCorrection(m, reason);
  }

  return (
    <div style={{background:t.bgCard,border:"1px solid "+t.border,borderRadius:t.r2,overflow:"hidden",marginBottom:10,opacity:isExpired?0.5:1}}>
      {/* Card header */}
      <div style={{padding:"14px 16px 10px",display:"flex",gap:10,alignItems:"center"}}>
        <div style={{
          width:36,height:36,borderRadius:t.r,flexShrink:0,
          background:avColor(pName),
          display:"flex",alignItems:"center",justifyContent:"center",
          fontSize:12,fontWeight:700,color:"#fff",letterSpacing:"-0.3px"
        }}>{pAvatar}</div>
        <div style={{flex:1,minWidth:0}}>
          <div style={{fontSize:13,fontWeight:700,color:t.text,letterSpacing:"-0.2px"}}>{pName}{isOwn&&<span style={{fontSize:10,color:t.textSecondary,fontWeight:500}}> · You</span>}</div>
          <div style={{fontSize:10,color:t.textSecondary,marginTop:1,letterSpacing:"0.02em"}}>{timeAgo(m.date)}</div>
        </div>

        {/* Tournament badge */}
        {m.tournName&&m.tournName!=="Casual Match"&&(
          <span style={{fontSize:9,fontWeight:700,color:t.accent,background:t.accentSubtle,padding:"3px 8px",borderRadius:20,letterSpacing:"0.06em",textTransform:"uppercase",flexShrink:0}}>{m.tournName}</span>
        )}
        {m.tournName==="Casual Match"&&(
          <span style={{fontSize:9,fontWeight:600,color:t.textSecondary,background:t.bgTertiary,padding:"3px 8px",borderRadius:20,letterSpacing:"0.06em",textTransform:"uppercase",flexShrink:0}}>Casual</span>
        )}

        {/* Status badges */}
        {isPending&&!isOpponentView&&(
          <span style={{fontSize:9,fontWeight:700,color:t.orange,background:t.orangeSubtle,padding:"3px 8px",borderRadius:20,letterSpacing:"0.06em",textTransform:"uppercase",flexShrink:0}}>Pending</span>
        )}
        {isDisputed&&(
          <span style={{fontSize:9,fontWeight:700,color:t.red,background:t.redSubtle,padding:"3px 8px",borderRadius:20,letterSpacing:"0.06em",textTransform:"uppercase",flexShrink:0}}>Disputed</span>
        )}
        {isExpired&&(
          <span style={{fontSize:9,fontWeight:700,color:t.textTertiary,background:t.bgTertiary,padding:"3px 8px",borderRadius:20,letterSpacing:"0.06em",textTransform:"uppercase",flexShrink:0}}>Unverified</span>
        )}

        {/* Delete / remove buttons */}
        {isOwn&&onDelete&&status!=="disputed"&&(
          <button onClick={function(){if(window.confirm("Delete this match?"))onDelete(m);}}
            style={{background:"none",border:"none",color:t.textTertiary,fontSize:14,padding:"4px 4px",cursor:"pointer",lineHeight:1,flexShrink:0}}>✕</button>
        )}
        {m.isTagged&&onRemove&&status==="confirmed"&&(
          <button onClick={function(){if(window.confirm("Remove from your feed?"))onRemove(m);}}
            style={{background:"none",border:"none",color:t.textTertiary,fontSize:14,padding:"4px 4px",cursor:"pointer",lineHeight:1,flexShrink:0}}>✕</button>
        )}
      </div>

      {/* Match result block */}
      <div style={{margin:"0 12px 12px",borderRadius:t.r,border:"1px solid "+(isWin?t.green:t.red)+"28",background:isWin?t.greenSubtle:t.redSubtle,padding:"16px"}}>
        <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:8}}>
          <div>
            <div style={{fontSize:9,fontWeight:700,color:isWin?t.green:t.red,textTransform:"uppercase",letterSpacing:"0.12em",marginBottom:6}}>
              {isWin?"Victory":"Defeat"}
            </div>
            <div style={{fontSize:22,fontWeight:700,color:t.text,letterSpacing:"-0.5px",lineHeight:1.1}}>
              vs {m.oppName}
            </div>
          </div>
          {scoreStr&&(
            <div style={{fontSize:28,fontWeight:700,color:isWin?t.green:t.red,fontVariantNumeric:"tabular-nums",letterSpacing:"-1px",lineHeight:1,flexShrink:0}}>
              {scoreStr}
            </div>
          )}
        </div>
      </div>

      {/* Pending — awaiting submitter view */}
      {isPending&&!isOpponentView&&(
        <div style={{borderTop:"1px solid "+t.border,padding:"10px 16px",display:"flex",alignItems:"center",gap:8}}>
          <span style={{fontSize:12,color:t.orange}}>⏳</span>
          <span style={{fontSize:12,color:t.textSecondary}}>Awaiting opponent confirmation — stats not counted yet</span>
        </div>
      )}

      {/* Pending — opponent action buttons */}
      {isOpponentView&&!demo&&(
        <div style={{borderTop:"1px solid "+t.border,padding:"12px 16px",display:"flex",gap:8,flexWrap:"wrap"}}>
          <div style={{fontSize:11,color:t.textSecondary,width:"100%",marginBottom:6,fontWeight:500}}>
            {pName} logged this match — does it look right?
          </div>
          <button
            onClick={function(){confirmOpponentMatch(m);}}
            style={{flex:1,padding:"9px 8px",borderRadius:8,border:"none",background:t.green,color:"#fff",fontSize:12,fontWeight:700,minWidth:80}}>
            ✓ Confirm
          </button>
          <button
            onClick={handleCorrection}
            style={{flex:1,padding:"9px 8px",borderRadius:8,border:"1px solid "+t.border,background:"transparent",color:t.text,fontSize:12,fontWeight:500,minWidth:80}}>
            Request edit
          </button>
          <button
            onClick={handleDispute}
            style={{flex:1,padding:"9px 8px",borderRadius:8,border:"1px solid "+t.red+"44",background:t.redSubtle,color:t.red,fontSize:12,fontWeight:600,minWidth:80}}>
            Dispute
          </button>
        </div>
      )}

      {/* Disputed notice */}
      {isDisputed&&(
        <div style={{borderTop:"1px solid "+t.border,padding:"10px 16px",display:"flex",alignItems:"center",gap:8}}>
          <span style={{fontSize:12,color:t.red}}>⚠</span>
          <span style={{fontSize:12,color:t.textSecondary}}>Under review — stats on hold until resolved</span>
        </div>
      )}

      {/* Expired notice */}
      {isExpired&&(
        <div style={{borderTop:"1px solid "+t.border,padding:"10px 16px",display:"flex",alignItems:"center",gap:8}}>
          <span style={{fontSize:12,color:t.textTertiary}}>⏱</span>
          <span style={{fontSize:12,color:t.textTertiary}}>Confirmation window expired — does not count</span>
        </div>
      )}

      {/* Standard actions — only for confirmed matches */}
      {status==="confirmed"&&!demo&&(
        <div style={{borderTop:"1px solid "+t.border,display:"flex"}}>
          <button
            onClick={async function(){
              if(!authUser) return;
              var nowLiked=!liked;
              setFeedLikes(function(l){var n=Object.assign({},l);n[m.id]=nowLiked;return n;});
              setFeedLikeCounts(function(c){var n=Object.assign({},c);n[m.id]=Math.max(0,(n[m.id]||0)+(nowLiked?1:-1));return n;});
              if(nowLiked){
                await supabase.from('feed_likes').insert({match_id:m.id,user_id:authUser.id});
              } else {
                await supabase.from('feed_likes').delete().eq('match_id',m.id).eq('user_id',authUser.id);
              }
            }}
            style={{flex:1,padding:"10px 8px",border:"none",borderRight:"1px solid "+t.border,background:"transparent",color:liked?t.accent:t.textSecondary,fontSize:11,fontWeight:liked?700:500,display:"flex",alignItems:"center",justifyContent:"center",gap:4,cursor:"pointer",letterSpacing:"0.02em"}}>
            <span style={{fontSize:13}}>👍</span>{liked?"Liked":"Like"}{likeCount>0?" · "+likeCount:""}
          </button>
          <button
            onClick={function(){setCommentModal(m.id);setCommentDraft("");}}
            style={{flex:1,padding:"10px 8px",border:"none",borderRight:"1px solid "+t.border,background:"transparent",color:t.textSecondary,fontSize:11,fontWeight:500,display:"flex",alignItems:"center",justifyContent:"center",gap:4,cursor:"pointer",letterSpacing:"0.02em"}}>
            <span style={{fontSize:13}}>💬</span>Comment{comments.length>0?" ("+comments.length+")":""}
          </button>
          <button
            onClick={function(){if(navigator.share){navigator.share({title:"Match result",text:pName+(isWin?" won ":" lost ")+"vs "+m.oppName+" "+scoreStr});}}}
            style={{flex:1,padding:"10px 8px",border:"none",background:"transparent",color:t.textSecondary,fontSize:11,fontWeight:500,display:"flex",alignItems:"center",justifyContent:"center",gap:4,cursor:"pointer",letterSpacing:"0.02em"}}>
            <span style={{fontSize:13}}>↗</span>Share
          </button>
        </div>
      )}
      {demo&&(
        <div style={{borderTop:"1px solid "+t.border,padding:"10px 16px",display:"flex",gap:16}}>
          {["👍 Like","💬 Comment","↗ Share"].map(function(a){return <span key={a} style={{fontSize:11,color:t.textTertiary,fontWeight:500,letterSpacing:"0.02em"}}>{a}</span>;})}
        </div>
      )}

      {/* Comments preview — only on confirmed */}
      {status==="confirmed"&&comments.length>0&&(
        <div style={{borderTop:"1px solid "+t.border,padding:"10px 16px",display:"flex",flexDirection:"column",gap:6}}>
          {comments.slice(-2).map(function(c){
            return (
              <div key={c.id} style={{display:"flex",gap:8,alignItems:"flex-start"}}>
                <div style={{width:24,height:24,borderRadius:"50%",background:avColor(c.author),display:"flex",alignItems:"center",justifyContent:"center",fontSize:9,fontWeight:700,color:"#fff",flexShrink:0}}>{c.author.slice(0,2).toUpperCase()}</div>
                <div style={{flex:1}}>
                  <span style={{fontSize:12,fontWeight:700,color:t.text}}>{c.author} </span>
                  <span style={{fontSize:12,color:t.textSecondary}}>{c.text}</span>
                </div>
              </div>
            );
          })}
          {comments.length>2&&<button onClick={function(){setCommentModal(m.id);}} style={{background:"none",border:"none",color:t.accent,fontSize:11,fontWeight:600,textAlign:"left",padding:0}}>View all {comments.length} comments</button>}
        </div>
      )}
    </div>
  );
}

// ── HomeTab ───────────────────────────────────────────────────────────────────
export default function HomeTab({
  t, authUser, profile, history,
  feedLikes, setFeedLikes, feedLikeCounts, setFeedLikeCounts,
  feedComments, commentModal, setCommentModal, commentDraft, setCommentDraft,
  setShowAuth, setAuthMode, setAuthStep,
  setCasualOppName, setScoreModal, setScoreDraft,
  deleteMatch, removeTaggedMatch,
  confirmOpponentMatch, disputeOpponentMatch, requestMatchCorrection,
}) {
  var DEMO_FEED=[
    {id:"demo-1",oppName:"Alex Chen",tournName:"Summer Open",date:"Today",sets:[{you:6,them:3},{you:6,them:4}],result:"win",playerName:"Jordan Smith",playerAvatar:"JS",isOwn:false,status:"confirmed"},
    {id:"demo-2",oppName:"Sam Williams",tournName:"Casual Match",date:"Yesterday",sets:[{you:4,them:6},{you:3,them:6}],result:"loss",playerName:"Riley Brown",playerAvatar:"RB",isOwn:false,status:"confirmed"},
    {id:"demo-3",oppName:"Morgan Davis",tournName:"Moore Park Open",date:"Mon",sets:[{you:7,them:5},{you:6,them:3}],result:"win",playerName:"Casey Moore",playerAvatar:"CM",isOwn:false,status:"confirmed"},
  ];

  var feedCardProps={t,authUser,feedLikes,feedLikeCounts,feedComments,setFeedLikes,setFeedLikeCounts,setCommentModal,setCommentDraft,confirmOpponentMatch,disputeOpponentMatch,requestMatchCorrection};

  if(!authUser) {
    return (
      <div style={{maxWidth:680,margin:"0 auto"}}>
        <div style={{padding:"28px 20px 20px"}}>
          <div style={{fontSize:26,fontWeight:800,color:t.text,letterSpacing:"-0.5px",marginBottom:6}}>Sydney Tennis.</div>
          <div style={{fontSize:14,color:t.textSecondary,lineHeight:1.5,marginBottom:20}}>See how your friends are playing. Track your wins. Own your suburbs.</div>
          <div style={{display:"flex",gap:10,marginBottom:28}}>
            <button
              onClick={function(){setShowAuth(true);setAuthMode("signup");setAuthStep("choose");}}
              style={{flex:1,padding:"13px",borderRadius:9,border:"none",background:t.accent,color:"#fff",fontSize:14,fontWeight:700}}>
              Join free
            </button>
            <button
              onClick={function(){setShowAuth(true);setAuthMode("login");setAuthStep("choose");}}
              style={{flex:1,padding:"13px",borderRadius:9,border:"1px solid "+t.border,background:"transparent",color:t.text,fontSize:14,fontWeight:500}}>
              Log in
            </button>
          </div>
        </div>
        <div style={{position:"relative",padding:"0 20px 40px"}}>
          <div style={{fontSize:10,fontWeight:700,color:t.textTertiary,textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:12}}>Recent activity</div>
          <div style={{filter:"blur(3px)",pointerEvents:"none",userSelect:"none"}}>
            {DEMO_FEED.map(function(m){
              return <FeedCard key={m.id} m={m} isOwn={false} pName={m.playerName} pAvatar={m.playerAvatar} demo={true} {...feedCardProps}/>;
            })}
          </div>
          <div style={{
            position:"absolute",top:"40%",left:"50%",transform:"translate(-50%,-50%)",
            textAlign:"center",background:t.bgCard,border:"1px solid "+t.border,
            borderRadius:14,padding:"20px 24px",boxShadow:"0 8px 32px rgba(0,0,0,0.08)",
            width:"calc(100% - 80px)",maxWidth:320
          }}>
            <div style={{fontSize:20,marginBottom:8}}>🎾</div>
            <div style={{fontSize:15,fontWeight:700,color:t.text,marginBottom:6}}>Your community feed</div>
            <div style={{fontSize:13,color:t.textSecondary,lineHeight:1.5,marginBottom:16}}>Sign up to see matches from players you follow and share your own results.</div>
            <button
              onClick={function(){setShowAuth(true);setAuthMode("signup");setAuthStep("choose");}}
              style={{width:"100%",padding:"12px",borderRadius:8,border:"none",background:t.accent,color:"#fff",fontSize:13,fontWeight:700}}>
              Get started
            </button>
          </div>
        </div>
      </div>
    );
  }

  function openLogMatch() {
    setCasualOppName("");
    setScoreModal({casual:true,oppName:"",tournName:"Casual Match"});
    setScoreDraft({sets:[{you:"",them:""}],result:"win",notes:"",date:new Date().toISOString().slice(0,10)});
  }

  return (
    <div style={{maxWidth:680,margin:"0 auto"}}>
      <div style={{padding:"24px 20px 0",display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16}}>
        <div>
          <div style={{fontSize:22,fontWeight:800,color:t.text,letterSpacing:"-0.5px"}}>Feed</div>
          <div style={{fontSize:12,color:t.textTertiary,marginTop:1}}>{history.length} match{history.length!==1?"es":""} logged</div>
        </div>
        <button
          onClick={openLogMatch}
          style={{padding:"9px 16px",borderRadius:9,border:"none",background:t.accent,color:"#fff",fontSize:13,fontWeight:700,display:"flex",alignItems:"center",gap:6}}>
          + Log match
        </button>
      </div>

      <div style={{display:"flex",gap:6,padding:"0 20px 16px"}}>
        <span style={{fontSize:12,fontWeight:700,color:t.accent,background:t.accentSubtle,padding:"5px 14px",borderRadius:20}}>Everyone</span>
        <span style={{fontSize:12,fontWeight:500,color:t.textTertiary,background:t.bgCard,border:"1px solid "+t.border,padding:"5px 14px",borderRadius:20,opacity:0.6}}>Friends</span>
      </div>

      <div style={{padding:"0 20px 100px"}}>
        {history.length===0
          ?<div style={{background:t.bgCard,border:"1px solid "+t.border,borderRadius:12,padding:"40px 24px",textAlign:"center"}}>
            <div style={{fontSize:40,marginBottom:12}}>🎾</div>
            <div style={{fontSize:17,fontWeight:700,color:t.text,marginBottom:8}}>Nothing here yet</div>
            <div style={{fontSize:13,color:t.textSecondary,lineHeight:1.6,marginBottom:24}}>Log your first match and it'll show up in your feed. Your friends' matches will appear here too.</div>
            <button onClick={openLogMatch} style={{padding:"13px 28px",borderRadius:9,border:"none",background:t.accent,color:"#fff",fontSize:14,fontWeight:700}}>
              Log your first match
            </button>
          </div>
          :history.map(function(m){
            var isOwn=!m.isTagged;
            return <FeedCard key={m.id} m={m} isOwn={isOwn} pName={isOwn?profile.name:(m.friendName||m.oppName)} pAvatar={isOwn?profile.avatar:""} demo={false} onDelete={isOwn?deleteMatch:null} onRemove={m.isTagged?removeTaggedMatch:null} {...feedCardProps}/>;
          })
        }
        {history.length>0&&(
          <div style={{background:t.bgCard,border:"1px solid "+t.border,borderRadius:12,padding:"18px 20px",textAlign:"center",marginTop:4}}>
            <div style={{fontSize:14,fontWeight:700,color:t.text,marginBottom:4}}>Find players to follow</div>
            <div style={{fontSize:12,color:t.textSecondary,marginBottom:14}}>See your friends' matches in your feed when the community grows.</div>
            <span style={{fontSize:12,fontWeight:600,color:t.textTertiary,background:t.bgTertiary,border:"1px solid "+t.border,padding:"7px 16px",borderRadius:8}}>Coming soon</span>
          </div>
        )}
      </div>
    </div>
  );
}
