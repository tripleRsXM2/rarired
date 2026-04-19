// src/features/people/hooks/useDMs.js
import { useState, useEffect, useRef } from "react";
import { supabase } from "../../../lib/supabase.js";
import * as D from "../services/dmService.js";
import { fetchProfilesByIds } from "../services/socialService.js";
import { insertNotification, upsertMessageNotification } from "../../notifications/services/notificationService.js";

export function useDMs(opts){
  var authUser=(opts&&opts.authUser)||null;
  var friends=(opts&&opts.friends)||[];

  var [conversations,setConversations]=useState([]);  // accepted + pending-outgoing
  var [requests,setRequests]=useState([]);             // pending incoming
  var [activeConv,setActiveConv]=useState(null);
  var [threadMessages,setThreadMessages]=useState([]);
  var [reactions,setReactions]=useState({});           // {messageId: [{id,emoji,user_id}]}
  var [threadLoading,setThreadLoading]=useState(false);
  var [msgDraft,setMsgDraft]=useState("");
  var [sending,setSending]=useState(false);
  var [replyTo,setReplyTo]=useState(null);
  var [editingId,setEditingId]=useState(null);
  var [editDraft,setEditDraft]=useState("");

  var activeConvRef=useRef(null);

  // Friendship override: keep an always-current ref of friend ids so async
  // realtime callbacks see the latest list without re-subscribing. Friendship
  // bypasses the DM request gate entirely — friends always share a normal,
  // accepted conversation.
  var friendIdsRef=useRef([]);
  friendIdsRef.current=friends.map(function(f){return f.id;});
  function isFriendId(uid){return friendIdsRef.current.indexOf(uid)>=0;}

  // ── Load ────────────────────────────────────────────────────────────────────

  async function loadConversations(){
    if(!authUser)return;
    var uid=authUser.id;
    var r=await D.fetchConversations(uid);
    var all=r.data||[];

    // Friendship override — collapse any pending conversation whose partner is
    // already a friend up to "accepted". Handles legacy rows from before the
    // friendship-bypass rule existed and races where the DB-side RPC didn't
    // catch the friendship at insert time.
    var fIds=friendIdsRef.current;
    if(fIds.length){
      var toUpgrade=all.filter(function(c){
        if(c.status!=='pending')return false;
        var pid=c.user1_id===uid?c.user2_id:c.user1_id;
        return fIds.indexOf(pid)>=0;
      });
      if(toUpgrade.length){
        await Promise.all(toUpgrade.map(function(c){
          return D.updateConversationStatus(c.id,'accepted');
        }));
        var upgraded={};toUpgrade.forEach(function(c){upgraded[c.id]=true;});
        all=all.map(function(c){return upgraded[c.id]?Object.assign({},c,{status:'accepted'}):c;});
      }
    }

    var accepted=all.filter(function(c){return c.status==='accepted';});
    // Pending direction is determined by requester_id (the originator), NOT by
    // user1/user2 column ordering — those are now canonicalised by uuid order.
    var pendingOut=all.filter(function(c){return c.status==='pending'&&c.requester_id===uid;});
    var pendingIn=all.filter(function(c){return c.status==='pending'&&c.requester_id!==uid;});

    var partnerIds=[...new Set(all.map(function(c){return c.user1_id===uid?c.user2_id:c.user1_id;}))];
    var partnerMap={};
    if(partnerIds.length){
      var pr=await fetchProfilesByIds(partnerIds,'id,name,avatar,skill,suburb,last_active,show_online_status,show_last_seen');
      (pr.data||[]).forEach(function(p){partnerMap[p.id]=p;});
    }

    var convIds=accepted.map(function(c){return c.id;});
    var readMap={};
    if(convIds.length){
      var rr=await D.fetchReads(uid,convIds);
      (rr.data||[]).forEach(function(r){readMap[r.conversation_id]=r.last_read_at;});
    }

    function enrich(c){
      var pid=c.user1_id===uid?c.user2_id:c.user1_id;
      var partner=partnerMap[pid]||{id:pid,name:"Player",avatar:"PL"};
      var lastRead=readMap[c.id];
      var hasUnread=c.status==='accepted'&&c.last_message_sender_id!==uid&&
        (!lastRead||new Date(c.last_message_at)>new Date(lastRead));
      return Object.assign({},c,{partner,hasUnread,lastReadAt:lastRead});
    }

    setConversations(accepted.concat(pendingOut).map(enrich));
    setRequests(pendingIn.map(enrich));
  }

  // ── Open ────────────────────────────────────────────────────────────────────

  async function _loadThread(conv){
    setThreadLoading(true);
    setThreadMessages([]);
    setReactions({});
    var r=await D.fetchThread(conv.id);
    var msgs=r.data||[];
    setThreadMessages(msgs);
    if(msgs.length){
      var rr=await D.fetchReactions(msgs.map(function(m){return m.id;}));
      var rMap={};
      (rr.data||[]).forEach(function(rx){if(!rMap[rx.message_id])rMap[rx.message_id]=[];rMap[rx.message_id].push(rx);});
      setReactions(rMap);
    }
    setThreadLoading(false);
  }

  async function openConversation(conv){
    if(!authUser)return;
    var uid=authUser.id;
    setActiveConv(conv);
    activeConvRef.current=conv;
    await _loadThread(conv);
    if(conv.status==='accepted'){
      D.upsertRead(uid,conv.id);
      D.updatePresence(uid);
      setConversations(function(cs){return cs.map(function(c){
        return c.id===conv.id?Object.assign({},c,{hasUnread:false,lastReadAt:new Date().toISOString()}):c;
      });});
    }
  }

  async function openOrStartConversation(partner){
    if(!authUser)return;
    var uid=authUser.id;

    // Atomic get-or-create via RPC. Guarantees one canonical conversation
    // per pair regardless of races between the two users' clients.
    var r=await D.getOrCreateConversation(partner.id);
    if(r.error||!r.data){
      console.error('[useDMs] getOrCreateConversation failed:',r.error);
      return;
    }
    var row=r.data;

    // Friendship override — friends never go through the DM request gate.
    // If the RPC returned a pending row but we're already friends, force
    // it to "accepted" before any UI/state branches read row.status.
    if(row.status==='pending'&&isFriendId(partner.id)){
      var ur=await D.updateConversationStatus(row.id,'accepted');
      row=(ur&&ur.data)?ur.data:Object.assign({},row,{status:'accepted'});
    }

    // Declined cooldown: do NOT auto-reset; require the cooldown to expire.
    // (Friends bypass this too — they're handled above.)
    if(row.status==='declined'){
      if(row.request_cooldown_until&&new Date(row.request_cooldown_until)>new Date()){
        alert("You can't message "+partner.name+" right now. Try again later.");
        return;
      }
      // Cooldown elapsed — reopen as a fresh pending request from us.
      await D.updateConversationStatus(row.id,'pending');
      row=Object.assign({},row,{status:'pending',requester_id:uid});
    }

    var conv=Object.assign({},row,{partner,hasUnread:false});
    setActiveConv(conv);
    activeConvRef.current=conv;

    // "New pending request" only applies to non-friend, sender-side, never-
    // touched conversations. Friends auto-accepted above will fall to the else.
    var isNewPending=row.requester_id===uid&&row.status==='pending'&&!row.last_message_at;

    if(isNewPending){
      setThreadMessages([]);
      setConversations(function(cs){
        if(cs.some(function(c){return c.id===conv.id;}))return cs;
        return cs.concat([conv]);
      });
      insertNotification({user_id:partner.id,type:'message_request',from_user_id:uid,entity_id:conv.id});
    } else {
      await _loadThread(conv);
      if(row.status==='accepted'){
        D.upsertRead(uid,row.id);
        // Move out of requests if it was sitting there, and ensure it lives in
        // the conversations list (covers first-open of a friend auto-accept).
        setRequests(function(rs){return rs.filter(function(x){return x.id!==conv.id;});});
        setConversations(function(cs){
          if(cs.some(function(c){return c.id===conv.id;})){
            return cs.map(function(c){return c.id===conv.id?Object.assign({},c,{hasUnread:false,status:'accepted'}):c;});
          }
          return [conv].concat(cs);
        });
      }
    }
  }

  function closeConversation(){
    setActiveConv(null);
    activeConvRef.current=null;
    setThreadMessages([]);
    setReactions({});
    setMsgDraft("");
    setReplyTo(null);
    setEditingId(null);
  }

  // ── Send ────────────────────────────────────────────────────────────────────

  async function sendMessage(content){
    if(!content.trim()||!activeConv||!authUser||sending)return;
    var uid=authUser.id;
    var conv=activeConvRef.current;
    setSending(true);
    setMsgDraft("");
    var r=await D.sendMessage(conv.id,uid,content.trim(),replyTo?replyTo.id:null);
    if(!r.error&&r.data){
      var msg=r.data;
      setThreadMessages(function(ms){return ms.concat([msg]);});
      var preview=content.trim().slice(0,80);
      D.updateConversationLastMessage(conv.id,preview,uid);
      // Notify the other participant — one notification per conversation
      // (upsert deletes any existing unread message notification first).
      var partnerId=conv.user1_id===uid?conv.user2_id:conv.user1_id;
      console.debug('[sendMessage] notif → partnerId:',partnerId,'status:',conv.status);
      if(conv.status==='accepted'&&partnerId){
        upsertMessageNotification({
          user_id:partnerId,
          type:'message',
          from_user_id:uid,
          entity_id:conv.id,
          metadata:{preview:preview.slice(0,60)},
        }).then(function(nr){
          if(nr&&nr.error)console.error('[sendMessage] notification failed:',nr.error);
          else console.debug('[sendMessage] notification sent OK');
        }).catch(function(e){console.error('[sendMessage] notification threw:',e);});
      }
      setConversations(function(cs){
        var updated=Object.assign({},conv,{
          last_message_preview:preview,
          last_message_at:msg.created_at,
          last_message_sender_id:uid,
          hasUnread:false,
        });
        if(cs.some(function(c){return c.id===conv.id;}))
          return cs.map(function(c){return c.id===conv.id?updated:c;});
        return cs.concat([updated]);
      });
    }
    setReplyTo(null);
    setSending(false);
  }

  // ── Requests ────────────────────────────────────────────────────────────────

  async function acceptRequest(convId){
    if(!authUser)return;
    var uid=authUser.id;
    var r=await D.updateConversationStatus(convId,'accepted');
    if(!r.error&&r.data){
      var req=requests.find(function(c){return c.id===convId;});
      if(req){
        var enriched=Object.assign({},r.data,{partner:req.partner,hasUnread:true});
        setConversations(function(cs){return [enriched].concat(cs);});
        setRequests(function(rs){return rs.filter(function(c){return c.id!==convId;});});
        insertNotification({user_id:req.partner.id,type:'message_request_accepted',from_user_id:uid});
        if(activeConvRef.current&&activeConvRef.current.id===convId){
          setActiveConv(function(ac){return Object.assign({},ac,{status:'accepted'});});
          activeConvRef.current=Object.assign({},activeConvRef.current,{status:'accepted'});
        }
      }
    }
  }

  async function declineRequest(convId){
    var cooldown=new Date();
    cooldown.setDate(cooldown.getDate()+7);
    await D.declineConversation(convId,cooldown.toISOString());
    setRequests(function(rs){return rs.filter(function(c){return c.id!==convId;});});
    if(activeConvRef.current&&activeConvRef.current.id===convId)closeConversation();
  }

  // ── Reactions ───────────────────────────────────────────────────────────────

  async function toggleReaction(messageId,emoji){
    if(!authUser)return;
    var uid=authUser.id;
    var existing=(reactions[messageId]||[]).find(function(r){return r.user_id===uid&&r.emoji===emoji;});
    if(existing){
      await D.removeReaction(messageId,uid,emoji);
      setReactions(function(rs){
        return Object.assign({},rs,{[messageId]:(rs[messageId]||[]).filter(function(r){return!(r.user_id===uid&&r.emoji===emoji);})});
      });
    } else {
      var r=await D.addReaction(messageId,uid,emoji);
      if(!r.error&&r.data){
        setReactions(function(rs){return Object.assign({},rs,{[messageId]:(rs[messageId]||[]).concat([r.data])});});
      }
    }
  }

  // ── Edit / Delete ───────────────────────────────────────────────────────────

  function startEdit(msg){setEditingId(msg.id);setEditDraft(msg.content);}
  function cancelEdit(){setEditingId(null);setEditDraft("");}
  async function submitEdit(messageId){
    if(!editDraft.trim())return;
    var r=await D.editMessage(messageId,editDraft.trim());
    if(!r.error&&r.data)setThreadMessages(function(ms){return ms.map(function(m){return m.id===messageId?r.data:m;});});
    setEditingId(null);setEditDraft("");
  }

  async function deleteMessage(messageId){
    if(!window.confirm("Delete this message?"))return;
    await D.softDeleteMessage(messageId);
    setThreadMessages(function(ms){return ms.map(function(m){
      return m.id===messageId?Object.assign({},m,{deleted_at:new Date().toISOString()}):m;
    });});
  }

  // ── Settings ────────────────────────────────────────────────────────────────

  async function deleteConversation(convId){
    if(!window.confirm("Delete this conversation for everyone?"))return;
    await D.deleteConversation(convId);
    setConversations(function(cs){return cs.filter(function(c){return c.id!==convId;});});
    closeConversation();
  }

  // ── Realtime ────────────────────────────────────────────────────────────────

  useEffect(function(){
    if(!authUser)return;
    var uid=authUser.id;

    // Incoming-request realtime — must subscribe to BOTH halves because
    // user1/user2 are now canonicalised by uuid order, so the receiver may
    // sit in either column. We then filter client-side by requester_id.
    async function handleInsert(payload){
      var conv=payload.new;
      // Ignore inserts I made myself (already in local state) and only
      // surface those that arrived for me from the other side.
      if(conv.requester_id===uid)return;
      if(conv.user1_id!==uid&&conv.user2_id!==uid)return;
      var partnerId=conv.user1_id===uid?conv.user2_id:conv.user1_id;
      var pr=await fetchProfilesByIds([partnerId],'id,name,avatar,skill,suburb,last_active,show_online_status,show_last_seen');
      var partner=(pr.data&&pr.data[0])||{id:partnerId,name:"Player",avatar:"PL"};

      // Friendship override — a friend reaching out is never a "request".
      // Auto-accept and add straight to conversations, skipping the approval UI.
      if(conv.status==='pending'&&isFriendId(partnerId)){
        await D.updateConversationStatus(conv.id,'accepted');
        var acceptedConv=Object.assign({},conv,{status:'accepted',partner,hasUnread:!!conv.last_message_at});
        setConversations(function(cs){
          if(cs.some(function(c){return c.id===conv.id;}))return cs;
          return [acceptedConv].concat(cs);
        });
        return;
      }

      var enriched=Object.assign({},conv,{partner});
      setRequests(function(rs){
        if(rs.some(function(r){return r.id===conv.id;}))return rs;
        return [enriched].concat(rs);
      });
    }

    var convChannel=supabase.channel('convs:'+uid)
      .on('postgres_changes',{event:'INSERT',schema:'public',table:'conversations',filter:'user1_id=eq.'+uid},handleInsert)
      .on('postgres_changes',{event:'INSERT',schema:'public',table:'conversations',filter:'user2_id=eq.'+uid},handleInsert)
      .on('postgres_changes',{event:'UPDATE',schema:'public',table:'conversations'},
        function(payload){
          var conv=payload.new;
          if(conv.user1_id!==uid&&conv.user2_id!==uid)return;
          if(conv.status==='accepted'){
            setRequests(function(rs){return rs.filter(function(r){return r.id!==conv.id;});});
            if(activeConvRef.current&&activeConvRef.current.id===conv.id){
              setActiveConv(function(ac){return Object.assign({},ac,{status:'accepted'});});
              activeConvRef.current=Object.assign({},activeConvRef.current,{status:'accepted'});
            }
          }
          setConversations(function(cs){return cs.map(function(c){
            if(c.id!==conv.id)return c;
            var hasUnread=conv.status==='accepted'&&conv.last_message_sender_id!==uid&&
              (!c.lastReadAt||new Date(conv.last_message_at)>new Date(c.lastReadAt));
            return Object.assign({},c,{
              last_message_preview:conv.last_message_preview,
              last_message_at:conv.last_message_at,
              last_message_sender_id:conv.last_message_sender_id,
              status:conv.status,
              hasUnread,
            });
          });});
        }
      )
      .subscribe();

    return function(){supabase.removeChannel(convChannel);};
  },[authUser&&authUser.id]);

  // Messages realtime — scoped to active conversation
  useEffect(function(){
    if(!authUser||!activeConv)return;
    var uid=authUser.id;
    var convId=activeConv.id;

    var msgChannel=supabase.channel('msgs:'+convId)
      .on('postgres_changes',{event:'INSERT',schema:'public',table:'direct_messages',filter:'conversation_id=eq.'+convId},
        function(payload){
          var msg=payload.new;
          if(msg.sender_id===uid)return;
          setThreadMessages(function(ms){
            if(ms.some(function(m){return m.id===msg.id;}))return ms;
            return ms.concat([msg]);
          });
          D.upsertRead(uid,convId);
          setConversations(function(cs){return cs.map(function(c){
            return c.id===convId?Object.assign({},c,{hasUnread:false}):c;
          });});
        }
      )
      .on('postgres_changes',{event:'UPDATE',schema:'public',table:'direct_messages',filter:'conversation_id=eq.'+convId},
        function(payload){
          var msg=payload.new;
          setThreadMessages(function(ms){return ms.map(function(m){return m.id===msg.id?msg:m;});});
        }
      )
      .subscribe();

    return function(){supabase.removeChannel(msgChannel);};
  },[authUser&&authUser.id,activeConv&&activeConv.id]);

  // Reactions realtime
  useEffect(function(){
    if(!authUser||!activeConv||!threadMessages.length)return;
    var msgIds=threadMessages.map(function(m){return m.id;});

    var rxChannel=supabase.channel('rx:'+activeConv.id)
      .on('postgres_changes',{event:'INSERT',schema:'public',table:'message_reactions'},
        function(payload){
          var rx=payload.new;
          if(!msgIds.includes(rx.message_id))return;
          setReactions(function(rs){
            var cur=rs[rx.message_id]||[];
            if(cur.some(function(r){return r.id===rx.id;}))return rs;
            return Object.assign({},rs,{[rx.message_id]:cur.concat([rx])});
          });
        }
      )
      .on('postgres_changes',{event:'DELETE',schema:'public',table:'message_reactions'},
        function(payload){
          var rx=payload.old;
          setReactions(function(rs){
            return Object.assign({},rs,{[rx.message_id]:(rs[rx.message_id]||[]).filter(function(r){return r.id!==rx.id;})});
          });
        }
      )
      .subscribe();

    return function(){supabase.removeChannel(rxChannel);};
  },[authUser&&authUser.id,activeConv&&activeConv.id,threadMessages.length]);

  function resetDMs(){
    setConversations([]);setRequests([]);setActiveConv(null);
    setThreadMessages([]);setReactions({});setMsgDraft("");
    setReplyTo(null);setEditingId(null);
    activeConvRef.current=null;
  }

  function totalUnread(){
    return conversations.reduce(function(s,c){return s+(c.hasUnread?1:0);},0)+requests.length;
  }

  return {
    conversations,requests,activeConv,threadMessages,reactions,
    threadLoading,msgDraft,setMsgDraft,sending,
    replyTo,setReplyTo,clearReplyTo:function(){setReplyTo(null);},
    editingId,editDraft,setEditDraft,
    loadConversations,openConversation,openOrStartConversation,closeConversation,
    sendMessage,acceptRequest,declineRequest,
    toggleReaction,startEdit,cancelEdit,submitEdit,deleteMessage,
    deleteConversation,resetDMs,totalUnread,
  };
}
