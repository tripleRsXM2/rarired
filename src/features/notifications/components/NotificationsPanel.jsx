import { useNavigate } from "react-router-dom";
import { avColor } from "../../../lib/utils/avatar.js";

export default function NotificationsPanel({
  t, notifications, markNotificationsRead, acceptMatchTag, declineMatchTag,
  setShowNotifications, refreshHistory,
}) {
  var navigate=useNavigate();
  function notifLabel(n) {
    if(n.type==='friend_request') return n.fromName+' sent you a friend request';
    if(n.type==='request_accepted') return n.fromName+' accepted your friend request';
    if(n.type==='message_request') return n.fromName+' wants to message you';
    if(n.type==='message_request_accepted') return n.fromName+' accepted your message request';
    if(n.type==='message') return n.fromName+' sent you a message';
    if(n.type==='match_tag') return n.fromName+' tagged you in a match — confirm or dispute';
    if(n.type==='match_confirmed') return n.fromName+' confirmed your match result ✓';
    if(n.type==='match_disputed') return n.fromName+' disputed your match — under review';
    if(n.type==='match_correction_requested') return n.fromName+' requested a correction on your match';
    if(n.type==='match_deleted') return n.fromName+' removed a match from your feed';
    if(n.type==='match_reminder') return 'A pending match expires in less than 24h — check your feed';
    if(n.type==='match_counter_proposed') return n.fromName+' counter-proposed a correction — review in feed';
    if(n.type==='match_voided') return n.fromName+' voided a disputed match';
    if(n.type==='like') return n.fromName+' liked your match';
    if(n.type==='comment') return n.fromName+' commented on your match';
    return 'New notification';
  }

  return (
    <div style={{position:"fixed",inset:0,zIndex:45}} onClick={function(){setShowNotifications(false);}}>
      <div
        onClick={function(e){e.stopPropagation();}}
        style={{
          position:"absolute",top:58,right:12,width:320,maxWidth:"calc(100vw - 24px)",
          background:t.modalBg,border:"1px solid "+t.border,borderRadius:14,
          boxShadow:"0 8px 32px rgba(0,0,0,0.14)",overflow:"hidden",maxHeight:480
        }}>
        <div style={{padding:"14px 16px",borderBottom:"1px solid "+t.border,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <span style={{fontSize:14,fontWeight:700,color:t.text}}>Notifications</span>
          {notifications.some(function(n){return!n.read;})&&(
            <button onClick={markNotificationsRead} style={{background:"none",border:"none",color:t.accent,fontSize:12,fontWeight:600}}>Mark all read</button>
          )}
        </div>
        <div style={{overflowY:"auto",maxHeight:400}}>
          {notifications.length===0
            ?<div style={{padding:"28px 20px",textAlign:"center",color:t.textTertiary,fontSize:13}}>No notifications yet</div>
            :notifications.map(function(n){
              var timeStr=new Date(n.created_at).toLocaleDateString("en-AU",{day:"numeric",month:"short"});
              return (
                <div key={n.id} style={{
                  padding:"12px 16px",borderBottom:"1px solid "+t.border,
                  background:n.read?"transparent":t.accentSubtle,
                  display:"flex",gap:10,alignItems:"flex-start"
                }}>
                  <div style={{width:34,height:34,borderRadius:"50%",background:avColor(n.fromName||"?"),display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:700,color:"#fff",flexShrink:0}}>
                    {(n.fromAvatar||"?").slice(0,2).toUpperCase()}
                  </div>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:13,color:t.text,lineHeight:1.4}}>{notifLabel(n)}</div>
                    <div style={{fontSize:11,color:t.textTertiary,marginTop:2}}>{timeStr}</div>

                    {/* friend_request: go to requests tab */}
                    {n.type==='friend_request'&&(
                      <button
                        onClick={function(){navigate("/people/requests");setShowNotifications(false);}}
                        style={{marginTop:6,padding:"4px 10px",borderRadius:6,border:"1px solid "+t.accent,background:"transparent",color:t.accent,fontSize:11,fontWeight:600,cursor:"pointer"}}>
                        View request →
                      </button>
                    )}

                    {/* message / message_request / message_request_accepted: go to messages tab */}
                    {(n.type==='message'||n.type==='message_request'||n.type==='message_request_accepted')&&(
                      <div>
                        {n.type==='message'&&n.metadata&&n.metadata.preview&&(
                          <div style={{fontSize:12,color:t.textSecondary,marginTop:4,fontStyle:"italic",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                            "{n.metadata.preview}"
                          </div>
                        )}
                        <button
                          onClick={function(){navigate("/people/messages");setShowNotifications(false);}}
                          style={{marginTop:6,padding:"4px 10px",borderRadius:6,border:"1px solid "+t.accent,background:"transparent",color:t.accent,fontSize:11,fontWeight:600,cursor:"pointer"}}>
                          View message →
                        </button>
                      </div>
                    )}

                    {/* match_tag: confirm/dispute actions (check feed instead) */}
                    {n.type==='match_tag'&&!n.tag_status&&(
                      <div style={{display:"flex",gap:6,marginTop:8}}>
                        <button onMouseDown={function(){acceptMatchTag(n);}}
                          style={{padding:"5px 12px",borderRadius:6,border:"none",background:t.green,color:"#fff",fontSize:12,fontWeight:600,cursor:"pointer"}}>
                          Confirm
                        </button>
                        <button onMouseDown={function(){declineMatchTag(n);}}
                          style={{padding:"5px 12px",borderRadius:6,border:"1px solid "+t.border,background:"transparent",color:t.textSecondary,fontSize:12,fontWeight:500,cursor:"pointer"}}>
                          Decline
                        </button>
                      </div>
                    )}
                    {n.type==='match_tag'&&n.tag_status==='accepted'&&<div style={{fontSize:11,color:t.green,marginTop:4,fontWeight:600}}>✓ Confirmed</div>}
                    {n.type==='match_tag'&&n.tag_status==='declined'&&<div style={{fontSize:11,color:t.textTertiary,marginTop:4}}>Declined</div>}

                    {/* match_confirmed: positive feedback */}
                    {n.type==='match_confirmed'&&(
                      <div style={{fontSize:11,color:t.green,marginTop:4,fontWeight:600}}>Stats updated</div>
                    )}

                    {/* match_reminder: direct to feed */}
                    {n.type==='match_reminder'&&(
                      <button
                        onClick={function(){navigate("/home");setShowNotifications(false);}}
                        style={{marginTop:6,padding:"4px 10px",borderRadius:6,border:"1px solid "+t.orange,background:t.orangeSubtle,color:t.orange,fontSize:11,fontWeight:600,cursor:"pointer"}}>
                        View in feed →
                      </button>
                    )}

                    {/* match_disputed / counter / correction: direct to feed + refresh */}
                    {(n.type==='match_disputed'||n.type==='match_correction_requested'||n.type==='match_counter_proposed'||n.type==='match_voided')&&(
                      <button
                        onClick={function(){if(refreshHistory)refreshHistory();navigate("/home");setShowNotifications(false);}}
                        style={{marginTop:6,padding:"4px 10px",borderRadius:6,border:"1px solid "+t.border,background:"transparent",color:t.accent,fontSize:11,fontWeight:600,cursor:"pointer"}}>
                        View in feed →
                      </button>
                    )}
                  </div>
                  {!n.read&&<div style={{width:7,height:7,borderRadius:"50%",background:t.accent,flexShrink:0,marginTop:4}}/>}
                </div>
              );
            })
          }
        </div>
        {notifications.length>0&&(
          <div style={{padding:"10px 16px",borderTop:"1px solid "+t.border}}>
            <button
              onClick={function(){navigate("/people/requests");setShowNotifications(false);}}
              style={{background:"none",border:"none",color:t.accent,fontSize:12,fontWeight:600}}>
              View friend requests →
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
