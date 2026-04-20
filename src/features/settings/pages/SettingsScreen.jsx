// src/screens/SettingsScreen.jsx
//
// Full-screen settings overlay — accessed by tapping the avatar in the top bar.
// IG-style: slides in from the right, sticky header with back arrow.
//
// Owns all account/preferences content that was previously buried in ProfileTab.

import { useNavigate } from "react-router-dom";
import { supabase } from "../../../lib/supabase.js";
import { initials } from "../../../lib/utils/avatar.js";
import { avColor } from "../../../lib/utils/avatar.js";
import { inputStyle } from "../../../lib/theme.js";
import { SKILL_LEVELS, PLAY_STYLES, DAYS_SHORT, TIME_BLOCKS } from "../../../lib/constants/domain.js";

export default function SettingsScreen({
  t, authUser, profile, setProfile,
  profileDraft, setProfileDraft,
  editingAvail, setEditingAvail,
  availDraft, setAvailDraft,
  receivedRequests,
  onClose,
}) {
  var navigate=useNavigate();
  var iStyle = inputStyle(t);

  return (
    <div
      className="slide-in-right"
      style={{
        position:"fixed", inset:0, zIndex:80,
        background:t.bg, overflowY:"auto",
        display:"flex", flexDirection:"column",
      }}>

      {/* Sticky header */}
      <div style={{
        position:"sticky", top:0, zIndex:10,
        backdropFilter:"blur(24px)", WebkitBackdropFilter:"blur(24px)",
        background:t.navBg, borderBottom:"1px solid "+t.border,
        display:"flex", alignItems:"center", gap:12,
        padding:"0 16px", height:52, flexShrink:0,
      }}>
        <button
          onClick={onClose}
          aria-label="Back"
          style={{
            background:"transparent", border:"none",
            color:t.accent, fontSize:22, lineHeight:1,
            padding:"0 8px 0 0", flexShrink:0,
          }}>
          ←
        </button>
        <span style={{flex:1, fontSize:17, fontWeight:700, color:t.text, letterSpacing:"-0.3px"}}>
          Settings
        </span>
        {/* Avatar — decorative, reminds user whose settings they're in */}
        <div style={{
          width:32, height:32, borderRadius:"50%",
          background:avColor(profile.name), flexShrink:0,
          display:"flex", alignItems:"center", justifyContent:"center",
          fontSize:11, fontWeight:700, color:"#fff",
        }}>
          {profile.avatar}
        </div>
      </div>

      {/* Content */}
      <div style={{padding:"20px 20px 100px", maxWidth:680, margin:"0 auto", width:"100%"}}>

        {/* ── Edit Profile ───────────────────────────────────────────────────── */}
        {!editingAvail&&(
          <div style={{background:t.bgCard, border:"1px solid "+t.border, borderRadius:12, padding:20, marginBottom:12}}>
            <div style={{fontSize:13, fontWeight:700, color:t.text, marginBottom:16}}>Edit Profile</div>
            {[
              {l:"Full name",  k:"name",   type:"text", ph:"Your name"},
              {l:"Suburb",     k:"suburb", type:"text", ph:"e.g. Bondi"},
              {l:"Bio",        k:"bio",    type:"text", ph:"Short bio..."},
            ].map(function(f){
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
                  var res=await supabase.from("profiles").upsert({
                    id:authUser.id,
                    name:nd.name||"",
                    suburb:nd.suburb||"",
                    bio:nd.bio||"",
                    skill:nd.skill||"Intermediate",
                    style:nd.style||"All-Court",
                    avatar:nd.avatar||"",
                    availability:nd.availability||{},
                  },{onConflict:"id"});
                  if(res.error)console.error("Profile save error:",res.error);
                }
              }}
              style={{width:"100%",padding:"12px",borderRadius:8,border:"none",background:t.accent,color:"#fff",fontSize:13,fontWeight:600,marginTop:4}}>
              Save changes
            </button>
          </div>
        )}

        {/* ── Availability ───────────────────────────────────────────────────── */}
        <div style={{background:t.bgCard,border:"1px solid "+t.border,borderRadius:12,overflow:"hidden",marginBottom:12}}>
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
                    var res=await supabase.from("profiles").upsert({id:authUser.id,availability:availDraft},{onConflict:"id"});
                    if(res.error)console.error("Availability save error:",res.error);
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

        {/* ── Profile Privacy ────────────────────────────────────────────────── */}
        <div style={{background:t.bgCard,border:"1px solid "+t.border,borderRadius:12,overflow:"hidden",marginBottom:12}}>
          <div style={{padding:"14px 16px",borderBottom:"1px solid "+t.border}}>
            <div style={{fontSize:13,fontWeight:700,color:t.text,marginBottom:2}}>Profile Privacy</div>
            <div style={{fontSize:11,color:t.textTertiary}}>Controls who can see your profile and matches.</div>
          </div>
          <div style={{padding:"14px 16px",display:"flex",gap:6,flexWrap:"wrap"}}>
            {[
              {v:"public",  l:"Public",       d:"Everyone"},
              {v:"friends", l:"Friends only", d:"Only friends"},
              {v:"private", l:"Private",      d:"Only you"},
            ].map(function(opt){
              var on=(profile.privacy||"public")===opt.v;
              return (
                <button key={opt.v}
                  onClick={function(){
                    var nd=Object.assign({},profile,{privacy:opt.v});
                    setProfile(nd);
                    if(authUser)supabase.from("profiles").upsert({id:authUser.id,privacy:opt.v},{onConflict:"id"});
                  }}
                  style={{flex:1,padding:"10px 8px",borderRadius:9,border:"1px solid "+(on?t.accent:t.border),background:on?t.accentSubtle:"transparent",color:on?t.accent:t.textSecondary,fontSize:12,fontWeight:on?700:400,textAlign:"center"}}>
                  <div>{opt.l}</div>
                  <div style={{fontSize:10,opacity:0.7,marginTop:1}}>{opt.d}</div>
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Presence ───────────────────────────────────────────────────────── */}
        <div style={{background:t.bgCard,border:"1px solid "+t.border,borderRadius:12,overflow:"hidden",marginBottom:12}}>
          <div style={{padding:"14px 16px",borderBottom:"1px solid "+t.border}}>
            <div style={{fontSize:13,fontWeight:700,color:t.text,marginBottom:2}}>Presence</div>
            <div style={{fontSize:11,color:t.textTertiary}}>Control whether others can see when you're active.</div>
          </div>
          {[
            {k:"show_online_status", l:"Show online status", d:"Green dot when you're active now."},
            {k:"show_last_seen",     l:"Show last seen",     d:'Lets others see "Last seen 5m ago" etc.'},
          ].map(function(opt,i){
            var on=profile[opt.k]!==false;
            return (
              <div key={opt.k} style={{padding:"12px 16px",display:"flex",alignItems:"center",gap:12,borderTop:i===0?"none":"1px solid "+t.border}}>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:13,fontWeight:600,color:t.text}}>{opt.l}</div>
                  <div style={{fontSize:11,color:t.textTertiary,marginTop:2}}>{opt.d}</div>
                </div>
                <button
                  onClick={function(){
                    var next=!on;
                    var nd=Object.assign({},profile,{[opt.k]:next});
                    setProfile(nd);
                    if(authUser)supabase.from("profiles").upsert({id:authUser.id,[opt.k]:next},{onConflict:"id"}).then(function(r){if(r.error)console.error("Presence save error:",r.error);});
                  }}
                  aria-label={(on?"Disable ":"Enable ")+opt.l}
                  style={{
                    width:42, height:24, borderRadius:14, border:"none", cursor:"pointer",
                    background:on?t.green:t.border,
                    position:"relative", flexShrink:0, transition:"background 0.15s",
                  }}>
                  <span style={{
                    position:"absolute", top:2, left:on?20:2,
                    width:20, height:20, borderRadius:"50%", background:"#fff",
                    transition:"left 0.15s", boxShadow:"0 1px 3px rgba(0,0,0,0.25)",
                  }}/>
                </button>
              </div>
            );
          })}
        </div>

        {/* ── Account ────────────────────────────────────────────────────────── */}
        {authUser&&(
          <div style={{background:t.bgCard,border:"1px solid "+t.border,borderRadius:12,overflow:"hidden",marginBottom:12}}>
            <div style={{padding:"14px 16px",borderBottom:"1px solid "+t.border}}>
              <div style={{fontSize:10,fontWeight:700,color:t.textTertiary,textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:2}}>Account</div>
              <div style={{fontSize:14,color:t.text,fontWeight:500}}>{authUser.email}</div>
            </div>
            <button
              onClick={function(){onClose();navigate("/people/requests");}}
              style={{width:"100%",padding:"12px 16px",border:"none",borderBottom:"1px solid "+t.border,background:"transparent",color:t.text,fontSize:13,fontWeight:500,textAlign:"left",cursor:"pointer",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <span>Friend requests</span>
              <span style={{fontSize:12,color:receivedRequests.length>0?t.accent:t.textTertiary}}>
                {receivedRequests.length>0?receivedRequests.length+" pending":"›"}
              </span>
            </button>
            <button
              onClick={function(){supabase.auth.signOut();onClose();}}
              style={{width:"100%",padding:"14px 16px",border:"none",background:"transparent",color:t.red,fontSize:13,fontWeight:600,textAlign:"left",cursor:"pointer"}}>
              Sign out
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
