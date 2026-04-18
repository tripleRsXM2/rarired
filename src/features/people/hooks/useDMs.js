// src/features/people/hooks/useDMs.js
import { useState, useEffect, useRef } from "react";
import { supabase } from "../../../supabase.js";
import * as D from "../services/dmService.js";
import { fetchProfilesByIds } from "../services/socialService.js";

export function useDMs(opts){
  var authUser=(opts&&opts.authUser)||null;

  var [conversations,setConversations]=useState([]);
  var [activeThread,setActiveThread]=useState(null);
  var [threadMessages,setThreadMessages]=useState([]);
  var [threadLoading,setThreadLoading]=useState(false);
  var [msgDraft,setMsgDraft]=useState("");
  var [sending,setSending]=useState(false);

  // Keep a ref so the realtime handler always sees the current thread
  // without needing to be re-subscribed every time it changes.
  var activeThreadRef=useRef(null);

  async function loadConversations(){
    if(!authUser)return;
    var r=await D.fetchAllMessages(authUser.id);
    var msgs=r.data||[];
    var seenIds={};var partnerIds=[];
    msgs.forEach(function(m){
      var pid=m.sender_id===authUser.id?m.receiver_id:m.sender_id;
      if(!seenIds[pid]){seenIds[pid]=true;partnerIds.push(pid);}
    });
    var partnerMap={};
    if(partnerIds.length){
      var pr=await fetchProfilesByIds(partnerIds,'id,name,avatar,skill,suburb');
      (pr.data||[]).forEach(function(p){partnerMap[p.id]=p;});
    }
    var seenConvo={};var convos=[];
    msgs.forEach(function(m){
      var pid=m.sender_id===authUser.id?m.receiver_id:m.sender_id;
      if(!seenConvo[pid]){
        seenConvo[pid]=true;
        var partner=partnerMap[pid]||{id:pid,name:"Player",avatar:"PL"};
        var unread=msgs.filter(function(x){return x.sender_id===pid&&x.receiver_id===authUser.id&&!x.read_at;}).length;
        convos.push({partner,lastMessage:m,unread});
      }
    });
    setConversations(convos);
  }

  async function openThread(partner){
    if(!authUser)return;
    activeThreadRef.current=partner;
    setActiveThread(partner);
    setThreadLoading(true);
    var r=await D.fetchThread(authUser.id,partner.id);
    setThreadMessages(r.data||[]);
    setThreadLoading(false);
    D.markThreadRead(authUser.id,partner.id);
    setConversations(function(c){return c.map(function(cv){
      return cv.partner.id===partner.id?Object.assign({},cv,{unread:0}):cv;
    });});
  }

  async function sendDM(content){
    if(!content.trim()||!activeThread||!authUser||sending)return;
    setSending(true);
    var r=await D.sendMessage(authUser.id,activeThread.id,content.trim());
    if(!r.error&&r.data){
      var msg=r.data;
      setThreadMessages(function(m){return m.concat([msg]);});
      setConversations(function(c){
        var exists=c.some(function(cv){return cv.partner.id===activeThread.id;});
        if(exists)return c.map(function(cv){return cv.partner.id===activeThread.id?Object.assign({},cv,{lastMessage:msg}):cv;});
        return [{partner:activeThread,lastMessage:msg,unread:0}].concat(c);
      });
    }
    setSending(false);
  }

  function closeThread(){
    activeThreadRef.current=null;
    setActiveThread(null);
    setThreadMessages([]);
    setMsgDraft("");
  }

  function resetDMs(){
    activeThreadRef.current=null;
    setConversations([]);setActiveThread(null);setThreadMessages([]);setMsgDraft("");
  }

  function totalUnread(){return conversations.reduce(function(s,c){return s+(c.unread||0);},0);}

  // Realtime — subscribe once per logged-in user, listen for incoming messages.
  useEffect(function(){
    if(!authUser)return;

    var channel=supabase
      .channel('dms:'+authUser.id)
      .on('postgres_changes',{
        event:'INSERT',schema:'public',table:'direct_messages',
        filter:'receiver_id=eq.'+authUser.id,
      },async function(payload){
        var msg=payload.new;
        var senderId=msg.sender_id;
        var thread=activeThreadRef.current;

        // Append to open thread immediately + mark read
        if(thread&&thread.id===senderId){
          setThreadMessages(function(m){return m.concat([msg]);});
          D.markThreadRead(authUser.id,senderId);
        }

        // Update conversation list
        setConversations(function(c){
          var isActive=thread&&thread.id===senderId;
          var exists=c.some(function(cv){return cv.partner.id===senderId;});
          if(exists){
            return c.map(function(cv){
              if(cv.partner.id!==senderId)return cv;
              return Object.assign({},cv,{
                lastMessage:msg,
                unread:isActive?0:(cv.unread||0)+1,
              });
            });
          }
          // First message from this person — fetch their profile async
          fetchProfilesByIds([senderId],'id,name,avatar,skill,suburb').then(function(pr){
            var partner=(pr.data&&pr.data[0])||{id:senderId,name:"Player",avatar:"PL"};
            setConversations(function(prev){
              return [{partner,lastMessage:msg,unread:isActive?0:1}].concat(prev);
            });
          });
          return c;
        });
      })
      .subscribe();

    return function(){supabase.removeChannel(channel);};
  },[authUser&&authUser.id]);

  return {
    conversations,activeThread,threadMessages,threadLoading,
    msgDraft,setMsgDraft,sending,
    loadConversations,openThread,sendDM,closeThread,resetDMs,totalUnread,
  };
}
