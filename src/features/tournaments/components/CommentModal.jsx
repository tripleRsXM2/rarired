import { supabase } from "../../../lib/supabase.js";
import { avColor } from "../../../lib/helpers.js";
import { inputStyle } from "../../../lib/theme.js";

export default function CommentModal({
  t, authUser, profile,
  commentModal, setCommentModal,
  commentDraft, setCommentDraft,
  feedComments, setFeedComments,
}) {
  var iStyle=inputStyle(t);
  if(!commentModal) return null;
  return (
    <div
      onClick={function(){setCommentModal(null);}}
      style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.4)",backdropFilter:"blur(10px)",WebkitBackdropFilter:"blur(10px)",display:"flex",alignItems:"flex-end",justifyContent:"center",zIndex:250}}>
      <div
        onClick={function(e){e.stopPropagation();}}
        className="slide-up"
        style={{background:t.modalBg,borderTop:"1px solid "+t.border,borderRadius:"16px 16px 0 0",padding:"20px 20px 48px",width:"100%",maxWidth:540,maxHeight:"70vh",display:"flex",flexDirection:"column"}}>
        <div style={{width:32,height:3,borderRadius:2,background:t.border,margin:"0 auto 16px"}}/>
        <div style={{fontSize:14,fontWeight:700,color:t.text,marginBottom:16}}>Comments</div>

        <div style={{flex:1,overflowY:"auto",marginBottom:16,display:"flex",flexDirection:"column",gap:12}}>
          {(feedComments[commentModal]||[]).length===0
            ?<div style={{textAlign:"center",padding:"24px 0"}}>
              <div style={{fontSize:13,color:t.textTertiary}}>No comments yet. Be first.</div>
            </div>
            :(feedComments[commentModal]||[]).map(function(c){
              return (
                <div key={c.id} style={{display:"flex",gap:10,alignItems:"flex-start"}}>
                  <div style={{width:32,height:32,borderRadius:"50%",background:avColor(c.author),display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,fontWeight:700,color:"#fff",flexShrink:0}}>{c.author.slice(0,2).toUpperCase()}</div>
                  <div style={{flex:1,background:t.bgTertiary,borderRadius:10,padding:"8px 12px"}}>
                    <div style={{fontSize:12,fontWeight:700,color:t.text,marginBottom:2}}>{c.author}</div>
                    <div style={{fontSize:13,color:t.textSecondary,lineHeight:1.4}}>{c.text}</div>
                  </div>
                </div>
              );
            })
          }
        </div>

        <div style={{display:"flex",gap:10,alignItems:"center"}}>
          <div style={{width:32,height:32,borderRadius:"50%",background:avColor(profile.name),display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,fontWeight:700,color:"#fff",flexShrink:0}}>{profile.avatar}</div>
          <input
            value={commentDraft}
            placeholder="Add a comment…"
            onChange={function(e){setCommentDraft(e.target.value);}}
            onKeyDown={function(e){if(e.key==="Enter")document.getElementById("comment-post-btn").click();}}
            style={Object.assign({},iStyle,{flex:1,fontSize:13,padding:"9px 14px"})}/>
          <button
            id="comment-post-btn"
            onClick={async function(){
              if(!commentDraft.trim()||!authUser) return;
              var text=commentDraft.trim();
              setCommentDraft("");
              var tempId="c"+Date.now();
              var c={id:tempId,author:profile.name,avatar:profile.avatar,text:text,ts:Date.now()};
              setFeedComments(function(fc){var cur=fc[commentModal]||[];return Object.assign({},fc,{[commentModal]:cur.concat([c])});});
              var res=await supabase.from('feed_comments').insert({match_id:commentModal,user_id:authUser.id,body:text}).select('id').single();
              if(res.data){
                setFeedComments(function(fc){
                  var cur=(fc[commentModal]||[]).map(function(x){return x.id===tempId?Object.assign({},x,{id:res.data.id}):x;});
                  return Object.assign({},fc,{[commentModal]:cur});
                });
              }
            }}
            style={{padding:"9px 16px",borderRadius:8,border:"none",background:t.accent,color:"#fff",fontSize:13,fontWeight:600,flexShrink:0}}>
            Post
          </button>
        </div>
      </div>
    </div>
  );
}
