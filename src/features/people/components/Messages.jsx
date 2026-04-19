// src/features/people/components/Messages.jsx
import { useRef, useEffect, useState } from "react";
import { avColor } from "../../../lib/utils/avatar.js";
import { inputStyle } from "../../../lib/theme.js";
import { PresenceDot } from "./PresenceIndicator.jsx";
import { getPresence } from "../services/presenceService.js";

var REACTIONS=["👍","❤️","😂","😢","🔥","🎾"];
var EDIT_WINDOW_MS=15*60*1000; // 15 min

function fmtTime(iso){
  if(!iso)return"";
  var d=new Date(iso),now=new Date(),diff=Math.floor((now-d)/1000);
  if(diff<60)return"now";
  if(diff<3600)return Math.floor(diff/60)+"m ago";
  if(d.toDateString()===now.toDateString())return d.toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"});
  return d.toLocaleDateString([],{day:"numeric",month:"short"});
}

export default function Messages({t,authUser,dms}){
  var [menuState,setMenuState]=useState(null);
  var [showSettings,setShowSettings]=useState(false);
  var touchTimer=useRef(null);
  var inputRef=useRef(null);
  var editInputRef=useRef(null);
  var messagesEndRef=useRef(null);
  var myId=authUser&&authUser.id;

  useEffect(function(){
    if(dms.activeConv&&messagesEndRef.current){
      messagesEndRef.current.scrollIntoView({behavior:"smooth"});
    }
  },[dms.threadMessages.length,dms.activeConv&&dms.activeConv.id]);

  useEffect(function(){
    if(dms.editingId&&editInputRef.current)editInputRef.current.focus();
  },[dms.editingId]);

  function handleTouchStart(e,msg){
    touchTimer.current=setTimeout(function(){
      var touch=e.touches[0];
      setMenuState({message:msg,x:touch.clientX,y:touch.clientY});
    },500);
  }
  function handleTouchEnd(){clearTimeout(touchTimer.current);}
  function handleContextMenu(e,msg){e.preventDefault();setMenuState({message:msg,x:e.clientX,y:e.clientY});}
  function closeMenu(){setMenuState(null);}

  // ── Conversation list ──────────────────────────────────────────────────────

  if(!dms.activeConv){
    var allEmpty=dms.conversations.length===0&&dms.requests.length===0;
    return (
      <div>
        {/* Requests section */}
        {dms.requests.length>0&&(
          <div style={{marginBottom:20}}>
            <div style={{fontSize:10,fontWeight:700,color:t.textTertiary,textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:10}}>
              Message Requests · {dms.requests.length}
            </div>
            {dms.requests.map(function(conv){
              return (
                <div key={conv.id} style={{background:t.accentSubtle,border:"1px solid "+t.accent,borderRadius:14,padding:"14px",marginBottom:10}}>
                  <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:10}}>
                    <div style={{width:42,height:42,borderRadius:"50%",background:avColor(conv.partner.name||"?"),display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,fontWeight:700,color:"#fff",flexShrink:0}}>
                      {(conv.partner.avatar||conv.partner.name||"?").slice(0,2).toUpperCase()}
                    </div>
                    <div>
                      <div style={{fontSize:14,fontWeight:700,color:t.text}}>{conv.partner.name}</div>
                      <div style={{fontSize:12,color:t.textSecondary}}>wants to message you</div>
                    </div>
                  </div>
                  {conv.last_message_preview&&(
                    <div style={{fontSize:13,color:t.textSecondary,background:t.bg,padding:"10px 12px",borderRadius:8,marginBottom:10,fontStyle:"italic",lineHeight:1.4}}>
                      "{conv.last_message_preview}"
                    </div>
                  )}
                  <div style={{display:"flex",gap:8}}>
                    <button onClick={function(){dms.acceptRequest(conv.id);dms.openConversation(conv);}}
                      style={{flex:1,padding:"10px",borderRadius:9,border:"none",background:t.accent,color:t.accentText,fontSize:13,fontWeight:700}}>
                      Accept
                    </button>
                    <button onClick={function(){dms.declineRequest(conv.id);}}
                      style={{flex:1,padding:"10px",borderRadius:9,border:"1px solid "+t.border,background:"transparent",color:t.textSecondary,fontSize:13,fontWeight:500}}>
                      Decline
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Conversations */}
        {allEmpty?(
          <div style={{textAlign:"center",padding:"48px 20px"}}>
            <div style={{fontSize:36,marginBottom:12}}>💬</div>
            <div style={{fontSize:16,fontWeight:700,color:t.text,marginBottom:6}}>No messages yet</div>
            <div style={{fontSize:13,color:t.textSecondary}}>Go to Friends and tap Message to start a conversation.</div>
          </div>
        ):(
          <div>
            {dms.conversations.length>0&&(
              <div style={{fontSize:10,fontWeight:700,color:t.textTertiary,textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:10}}>Recent</div>
            )}
            {dms.conversations.map(function(conv){
              var hasUnread=conv.hasUnread;
              var isPending=conv.status==='pending';
              var isMe=conv.last_message_sender_id===myId;
              return (
                <button key={conv.id} onClick={function(){dms.openConversation(conv);}}
                  style={{width:"100%",background:hasUnread?t.accentSubtle:t.bgCard,border:"1px solid "+(hasUnread?t.accent:t.border),borderRadius:12,padding:"12px 14px",marginBottom:8,display:"flex",gap:12,alignItems:"center",cursor:"pointer",textAlign:"left"}}>
                  <div style={{position:"relative",flexShrink:0}}>
                    <div style={{width:44,height:44,borderRadius:"50%",background:avColor(conv.partner.name||"?"),display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,fontWeight:700,color:"#fff"}}>
                      {(conv.partner.avatar||conv.partner.name||"?").slice(0,2).toUpperCase()}
                    </div>
                    <PresenceDot profile={conv.partner} t={t}/>
                  </div>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",marginBottom:2}}>
                      <span style={{fontSize:14,fontWeight:hasUnread?700:600,color:t.text}}>{conv.partner.name}</span>
                      <span style={{fontSize:10,color:t.textTertiary,flexShrink:0}}>{fmtTime(conv.last_message_at)}</span>
                    </div>
                    <div style={{fontSize:12,color:hasUnread?t.text:t.textSecondary,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",fontWeight:hasUnread?600:400}}>
                      {isPending
                        ?<span style={{color:t.orange}}>Request pending…</span>
                        :(isMe?"You: ":"")+( conv.last_message_preview||"")
                      }
                    </div>
                  </div>
                  {hasUnread&&<div style={{width:9,height:9,borderRadius:"50%",background:t.accent,flexShrink:0}}/>}
                </button>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // ── Thread view ────────────────────────────────────────────────────────────

  var conv=dms.activeConv;
  var myId2=myId;
  var isPending=conv.status==='pending';
  // After pair canonicalisation, requester_id is the source of truth for
  // "who initiated this conversation" (user1/user2 are now uuid-sorted).
  var iAmSender=conv.requester_id===myId2;
  var presence=getPresence(conv.partner);

  // UNREAD divider — first message from other person after my last read
  var unreadStartIdx=-1;
  if(conv.lastReadAt){
    for(var i=0;i<dms.threadMessages.length;i++){
      var m=dms.threadMessages[i];
      if(m.sender_id!==myId2&&new Date(m.created_at)>new Date(conv.lastReadAt)){
        unreadStartIdx=i;break;
      }
    }
  }

  return (
    <div style={{display:"flex",flexDirection:"column",minHeight:"60vh"}}>

      {/* Settings sheet */}
      {showSettings&&(
        <div style={{position:"fixed",inset:0,zIndex:300,background:"rgba(0,0,0,0.55)"}} onClick={function(){setShowSettings(false);}}>
          <div style={{position:"absolute",bottom:0,left:0,right:0,background:t.bgCard,borderRadius:"20px 20px 0 0",padding:"20px 20px calc(20px + env(safe-area-inset-bottom))"}} onClick={function(e){e.stopPropagation();}}>
            <div style={{width:32,height:4,borderRadius:2,background:t.border,margin:"0 auto 20px"}}/>
            <div style={{fontSize:16,fontWeight:700,color:t.text,marginBottom:4}}>{conv.partner.name}</div>
            <div style={{fontSize:12,color:t.textTertiary,marginBottom:20}}>Conversation settings</div>
            <button onClick={function(){dms.deleteConversation(conv.id);setShowSettings(false);}}
              style={{width:"100%",padding:"13px",borderRadius:10,border:"1px solid "+t.red,background:"transparent",color:t.red,fontSize:14,fontWeight:600,marginBottom:8}}>
              Delete Conversation
            </button>
            <button onClick={function(){setShowSettings(false);}}
              style={{width:"100%",padding:"13px",borderRadius:10,border:"1px solid "+t.border,background:"transparent",color:t.textSecondary,fontSize:14}}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Header */}
      <div style={{display:"flex",alignItems:"center",gap:10,paddingBottom:12,marginBottom:4,borderBottom:"1px solid "+t.border}}>
        <button onClick={function(){dms.closeConversation();setMenuState(null);setShowSettings(false);}}
          style={{background:"transparent",border:"none",color:t.accent,fontSize:22,lineHeight:1,padding:"0 6px 0 0",flexShrink:0}}>←</button>
        <div style={{position:"relative",flexShrink:0}}>
          <div style={{width:36,height:36,borderRadius:"50%",background:avColor(conv.partner.name||"?"),display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,fontWeight:700,color:"#fff"}}>
            {(conv.partner.avatar||conv.partner.name||"?").slice(0,2).toUpperCase()}
          </div>
          <PresenceDot profile={conv.partner} t={t} size={10}/>
        </div>
        <div style={{flex:1,minWidth:0}}>
          <div style={{fontSize:15,fontWeight:700,color:t.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{conv.partner.name}</div>
          {presence.label&&<div style={{fontSize:11,color:presence.online?t.green:t.textTertiary}}>{presence.label}</div>}
        </div>
        <button onClick={function(){setShowSettings(true);}}
          style={{background:"transparent",border:"none",color:t.textTertiary,fontSize:18,padding:"4px",flexShrink:0}}>⚙️</button>
      </div>

      {/* Pending banner — I sent the request */}
      {isPending&&iAmSender&&(
        <div style={{background:t.accentSubtle,border:"1px solid "+t.accent,borderRadius:10,padding:"10px 14px",marginBottom:10,fontSize:13,color:t.accent,textAlign:"center",lineHeight:1.4}}>
          Request sent — waiting for {conv.partner.name} to accept
        </div>
      )}

      {/* Messages */}
      <div style={{flex:1}}>
        {dms.threadLoading?(
          <div style={{textAlign:"center",padding:"40px 0",color:t.textTertiary,fontSize:13}}>Loading…</div>
        ):dms.threadMessages.length===0?(
          <div style={{textAlign:"center",padding:"40px 0"}}>
            <div style={{fontSize:28,marginBottom:8}}>💬</div>
            <div style={{fontSize:13,color:t.textTertiary}}>
              {isPending&&!iAmSender?"Accept to start chatting":"Say hello!"}
            </div>
          </div>
        ):(
          dms.threadMessages.map(function(msg,idx){
            var mine=msg.sender_id===myId2;
            var msgReactions=dms.reactions[msg.id]||[];
            var reactionGroups={};
            msgReactions.forEach(function(rx){if(!reactionGroups[rx.emoji])reactionGroups[rx.emoji]=[];reactionGroups[rx.emoji].push(rx.user_id);});
            var isEditing=dms.editingId===msg.id;
            var canEdit=mine&&!msg.deleted_at&&(Date.now()-new Date(msg.created_at))<EDIT_WINDOW_MS;
            var showUnread=idx===unreadStartIdx;
            var replyMsg=msg.reply_to_id?dms.threadMessages.find(function(m){return m.id===msg.reply_to_id;}):null;

            return (
              <div key={msg.id}>
                {showUnread&&(
                  <div style={{display:"flex",alignItems:"center",gap:8,margin:"16px 0 10px"}}>
                    <div style={{flex:1,height:1,background:t.accent,opacity:0.35}}/>
                    <span style={{fontSize:10,fontWeight:800,color:t.accent,textTransform:"uppercase",letterSpacing:"0.1em",flexShrink:0}}>Unread Messages</span>
                    <div style={{flex:1,height:1,background:t.accent,opacity:0.35}}/>
                  </div>
                )}
                <div style={{display:"flex",justifyContent:mine?"flex-end":"flex-start",marginBottom:4}}>
                  <div style={{maxWidth:"75%"}}>
                    {/* Reply preview */}
                    {replyMsg&&(
                      <div style={{background:t.bgTertiary,borderLeft:"3px solid "+t.accent,padding:"5px 10px",borderRadius:"6px 6px 0 0",fontSize:11,color:t.textSecondary,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                        {replyMsg.deleted_at?"Deleted message":replyMsg.content}
                      </div>
                    )}
                    {/* Bubble */}
                    {isEditing?(
                      <div style={{display:"flex",gap:6,alignItems:"center"}}>
                        <input ref={editInputRef} value={dms.editDraft}
                          onChange={function(e){dms.setEditDraft(e.target.value);}}
                          onKeyDown={function(e){if(e.key==="Enter")dms.submitEdit(msg.id);if(e.key==="Escape")dms.cancelEdit();}}
                          style={Object.assign({},inputStyle(t),{fontSize:14,padding:"8px 12px",borderRadius:10,flex:1})}/>
                        <button onClick={function(){dms.submitEdit(msg.id);}} style={{padding:"8px 14px",borderRadius:10,border:"none",background:t.accent,color:t.accentText,fontSize:12,fontWeight:700,flexShrink:0}}>Save</button>
                        <button onClick={dms.cancelEdit} style={{padding:"8px 10px",borderRadius:10,border:"1px solid "+t.border,background:"transparent",color:t.textSecondary,fontSize:12,flexShrink:0}}>✕</button>
                      </div>
                    ):(
                      <div
                        onTouchStart={function(e){handleTouchStart(e,msg);}}
                        onTouchEnd={handleTouchEnd}
                        onTouchMove={handleTouchEnd}
                        onContextMenu={function(e){handleContextMenu(e,msg);}}
                        style={{
                          background:mine?t.accent:t.bgCard,
                          color:mine?t.accentText:t.text,
                          border:mine?"none":"1px solid "+t.border,
                          borderRadius:mine?(replyMsg?"0 16px 4px 16px":"16px 16px 4px 16px"):(replyMsg?"16px 0 16px 4px":"16px 16px 16px 4px"),
                          padding:"9px 13px",fontSize:14,lineHeight:1.45,wordBreak:"break-word",
                          cursor:"pointer",userSelect:"none",
                          opacity:msg.deleted_at?0.5:1,fontStyle:msg.deleted_at?"italic":undefined,
                        }}>
                        {msg.deleted_at?"Message deleted":msg.content}
                        {msg.edited_at&&!msg.deleted_at&&(
                          <span style={{fontSize:9,opacity:0.55,marginLeft:6}}>edited</span>
                        )}
                      </div>
                    )}
                    {/* Reactions */}
                    {Object.keys(reactionGroups).length>0&&(
                      <div style={{display:"flex",gap:4,marginTop:4,flexWrap:"wrap",justifyContent:mine?"flex-end":"flex-start"}}>
                        {Object.entries(reactionGroups).map(function([emoji,users]){
                          var iReacted=users.includes(myId2);
                          return (
                            <button key={emoji} onClick={function(){dms.toggleReaction(msg.id,emoji);}}
                              style={{padding:"2px 8px",borderRadius:20,border:"1px solid "+(iReacted?t.accent:t.border),background:iReacted?t.accentSubtle:t.bgCard,fontSize:12,cursor:"pointer",display:"flex",alignItems:"center",gap:3}}>
                              {emoji}<span style={{fontSize:10,color:t.textSecondary}}>{users.length}</span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                    <div style={{fontSize:10,color:t.textTertiary,marginTop:3,textAlign:mine?"right":"left"}}>{fmtTime(msg.created_at)}</div>
                  </div>
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef}/>
      </div>

      {/* Context menu */}
      {menuState&&(
        <div style={{position:"fixed",inset:0,zIndex:200}} onClick={closeMenu}>
          <div style={{
            position:"fixed",
            top:Math.min(menuState.y,window.innerHeight-260),
            left:Math.max(8,Math.min(menuState.x-90,window.innerWidth-190)),
            background:t.bgCard,border:"1px solid "+t.border,borderRadius:14,
            boxShadow:"0 8px 40px rgba(0,0,0,0.22)",overflow:"hidden",zIndex:201,minWidth:170,
          }} onClick={function(e){e.stopPropagation();}}>
            {/* Emoji row */}
            <div style={{display:"flex",gap:2,padding:"10px 12px",borderBottom:"1px solid "+t.border,justifyContent:"space-between"}}>
              {REACTIONS.map(function(e){return(
                <button key={e} onClick={function(){dms.toggleReaction(menuState.message.id,e);closeMenu();}}
                  style={{background:"transparent",border:"none",fontSize:22,cursor:"pointer",padding:"0 2px",lineHeight:1}}>{e}</button>
              );})}
            </div>
            {[
              {label:"↩  Reply",show:true,action:function(){dms.setReplyTo(menuState.message);closeMenu();setTimeout(function(){inputRef.current&&inputRef.current.focus();},50);}},
              {label:"📋  Copy",show:!menuState.message.deleted_at,action:function(){navigator.clipboard.writeText(menuState.message.content);closeMenu();}},
              {label:"✏️  Edit",show:menuState.message.sender_id===myId2&&!menuState.message.deleted_at&&(Date.now()-new Date(menuState.message.created_at))<EDIT_WINDOW_MS,
                action:function(){dms.startEdit(menuState.message);closeMenu();}},
              {label:"🗑  Delete",show:menuState.message.sender_id===myId2&&!menuState.message.deleted_at,danger:true,
                action:function(){dms.deleteMessage(menuState.message.id);closeMenu();}},
            ].filter(function(i){return i.show;}).map(function(item){
              return (
                <button key={item.label} onClick={item.action}
                  style={{display:"block",width:"100%",padding:"12px 16px",border:"none",background:"transparent",
                    color:item.danger?t.red:t.text,fontSize:14,textAlign:"left",cursor:"pointer",borderTop:"1px solid "+t.border}}>
                  {item.label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Accept banner — I'm the recipient, conv is pending */}
      {isPending&&!iAmSender&&(
        <div style={{background:t.bgCard,border:"1px solid "+t.border,borderRadius:12,padding:"12px",marginTop:10}}>
          <div style={{fontSize:13,color:t.textSecondary,marginBottom:10,textAlign:"center"}}>Accept this request to reply</div>
          <div style={{display:"flex",gap:8}}>
            <button onClick={function(){dms.acceptRequest(conv.id);}}
              style={{flex:1,padding:"10px",borderRadius:9,border:"none",background:t.accent,color:t.accentText,fontSize:13,fontWeight:700}}>
              Accept
            </button>
            <button onClick={function(){dms.declineRequest(conv.id);}}
              style={{flex:1,padding:"10px",borderRadius:9,border:"1px solid "+t.border,background:"transparent",color:t.textSecondary,fontSize:13}}>
              Decline
            </button>
          </div>
        </div>
      )}

      {/* Reply preview bar */}
      {dms.replyTo&&(
        <div style={{display:"flex",alignItems:"center",gap:8,padding:"8px 12px",background:t.bgTertiary,borderTop:"2px solid "+t.accent,borderRadius:"8px 8px 0 0",marginTop:6}}>
          <div style={{flex:1,fontSize:12,color:t.textSecondary,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
            <span style={{fontWeight:700,color:t.accent,marginRight:4}}>Replying</span>
            {dms.replyTo.content}
          </div>
          <button onClick={dms.clearReplyTo} style={{background:"transparent",border:"none",color:t.textTertiary,fontSize:18,lineHeight:1,padding:"0 2px",flexShrink:0}}>×</button>
        </div>
      )}

      {/* Input — only shown when accepted, or I'm the pending sender */}
      {(!isPending||iAmSender)&&(
        <div style={{display:"flex",gap:8,alignItems:"flex-end",marginTop:dms.replyTo?0:8}}>
          <textarea
            ref={inputRef}
            rows={1}
            value={dms.msgDraft}
            placeholder={"Message "+conv.partner.name+"…"}
            onChange={function(e){dms.setMsgDraft(e.target.value);}}
            onKeyDown={function(e){
              if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();dms.sendMessage(dms.msgDraft);}
            }}
            style={Object.assign({},inputStyle(t),{flex:1,resize:"none",fontSize:14,padding:"10px 14px",borderRadius:12,minHeight:42,lineHeight:1.4})}/>
          <button
            disabled={!dms.msgDraft.trim()||dms.sending}
            onClick={function(){dms.sendMessage(dms.msgDraft);}}
            style={{padding:"10px 18px",borderRadius:12,border:"none",background:t.accent,color:t.accentText,fontSize:13,fontWeight:700,
              opacity:(!dms.msgDraft.trim()||dms.sending)?0.45:1,flexShrink:0,height:42}}>
            {dms.sending?"…":"Send"}
          </button>
        </div>
      )}
    </div>
  );
}
