// src/screens/SettingsScreen.jsx
//
// Full-screen settings overlay — accessed by tapping the avatar in the top bar.
// IG-style: slides in from the right, sticky header with back arrow.
//
// Owns all account/preferences content that was previously buried in ProfileTab.

import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../../../lib/supabase.js";
import { initials } from "../../../lib/utils/avatar.js";
import { avColor } from "../../../lib/utils/avatar.js";
import { inputStyle } from "../../../lib/theme.js";
import { SKILL_LEVELS, PLAY_STYLES, DAYS_SHORT, TIME_BLOCKS } from "../../../lib/constants/domain.js";
import { ZONES } from "../../map/data/zones.js";
import PlayerAvatar from "../../../components/ui/PlayerAvatar.jsx";
import { uploadAvatar, deleteAvatarByUrl } from "../../profile/services/avatarUpload.js";

var THEME_OPTIONS = [
  {id:"wimbledon",    label:"Wimbledon",       swatch:"#006F4A", bg:"#F0F2EA"},
  {id:"ao",          label:"Australian Open",  swatch:"#3B82F6", bg:"#111827"},
  {id:"french-open", label:"French Open",      swatch:"#E0783B", bg:"#EEE0CA"},
  {id:"us-open",     label:"US Open",          swatch:"#FFC72C", bg:"#002566"},
];

export default function SettingsScreen({
  t, authUser, profile, setProfile,
  theme, setTheme,
  profileDraft, setProfileDraft,
  editingAvail, setEditingAvail,
  availDraft, setAvailDraft,
  receivedRequests,
  onClose,
}) {
  var navigate=useNavigate();
  var iStyle = inputStyle(t);

  // ── Avatar upload state ────────────────────────────────────────────────────
  var fileInputRef = useRef(null);
  var [uploadState,setUploadState] = useState({ busy:false, error:null });
  var [avatarMenuOpen,setAvatarMenuOpen] = useState(false);

  async function pickAvatarFile(e){
    var f = e.target.files && e.target.files[0];
    e.target.value = ""; // reset so picking the same file re-fires onChange
    if(!f || !authUser) return;
    setUploadState({ busy:true, error:null });
    var r = await uploadAvatar(authUser.id, f);
    if(r.error){ setUploadState({ busy:false, error:r.error.message||"Upload failed" }); return; }
    // Write back to profile + mirror locally so the chrome updates instantly.
    var prevUrl = profile.avatar_url || null;
    var nd = Object.assign({}, profile, { avatar_url: r.url });
    setProfile(nd);
    setProfileDraft(function(d){return Object.assign({},d,{avatar_url:r.url});});
    var save = await supabase.from("profiles").update({ avatar_url: r.url }).eq("id", authUser.id);
    if(save.error){
      setProfile(profile); // rollback
      setUploadState({ busy:false, error:save.error.message });
      return;
    }
    // Best-effort: delete the old image to keep the bucket tidy.
    if(prevUrl) deleteAvatarByUrl(prevUrl);
    setUploadState({ busy:false, error:null });
  }

  async function removeAvatar(){
    if(!authUser) return;
    var prevUrl = profile.avatar_url || null;
    var nd = Object.assign({}, profile, { avatar_url: null });
    setProfile(nd);
    setProfileDraft(function(d){return Object.assign({},d,{avatar_url:null});});
    var save = await supabase.from("profiles").update({ avatar_url: null }).eq("id", authUser.id);
    if(save.error){
      setProfile(profile);
      setUploadState({ busy:false, error:save.error.message });
      return;
    }
    if(prevUrl) deleteAvatarByUrl(prevUrl);
  }

  return (
    <div
      className="slide-in-right"
      style={{
        position:"fixed", inset:0, zIndex:2000,
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
        <PlayerAvatar
          name={profile.name} avatar={profile.avatar}
          avatarUrl={profile.avatar_url}
          size={32}
        />
      </div>

      {/* Content */}
      <div style={{padding:"20px 20px 100px", maxWidth:680, margin:"0 auto", width:"100%"}}>

        {/* ── Edit Profile ───────────────────────────────────────────────────── */}
        {!editingAvail&&(
          <div style={{background:t.bgCard, border:"1px solid "+t.border, borderRadius:12, padding:20, marginBottom:12}}>
            <div style={{fontSize:13, fontWeight:700, color:t.text, marginBottom:16}}>Edit Profile</div>

            {/* Avatar — camera badge in the corner. If a photo exists, camera
                opens a small menu (Change / Remove). If not, it opens the picker
                directly. */}
            <div style={{display:"flex",alignItems:"center",gap:16,marginBottom:18,position:"relative"}}>
              <div style={{position:"relative",width:84,height:84,flexShrink:0}}>
                <PlayerAvatar
                  name={profileDraft.name||profile.name}
                  avatar={profileDraft.avatar||profile.avatar}
                  avatarUrl={profileDraft.avatar_url||profile.avatar_url}
                  size={84}
                />
                {uploadState.busy&&(
                  <div style={{
                    position:"absolute",inset:0,borderRadius:"50%",
                    background:"rgba(0,0,0,0.55)",color:"#fff",
                    display:"flex",alignItems:"center",justifyContent:"center",
                    fontSize:12,fontWeight:700,
                  }}>…</div>
                )}
                <input ref={fileInputRef} type="file" accept="image/*"
                  onChange={pickAvatarFile} style={{display:"none"}}/>
                <button type="button"
                  disabled={uploadState.busy||!authUser}
                  onClick={function(){
                    if(profile.avatar_url){
                      setAvatarMenuOpen(function(v){return!v;});
                    } else {
                      fileInputRef.current && fileInputRef.current.click();
                    }
                  }}
                  aria-label="Change photo"
                  style={{
                    position:"absolute",right:-2,bottom:-2,
                    width:28,height:28,borderRadius:"50%",
                    background:t.accent,color:t.accentText,border:"2px solid "+t.bgCard,
                    display:"flex",alignItems:"center",justifyContent:"center",
                    padding:0, cursor: uploadState.busy?"not-allowed":"pointer",
                    boxShadow:"0 1px 3px rgba(0,0,0,0.25)",
                  }}>
                  {/* Camera glyph */}
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
                    <circle cx="12" cy="13" r="4"/>
                  </svg>
                </button>

                {/* Pop-up menu when a photo exists */}
                {avatarMenuOpen && profile.avatar_url && (
                  <>
                    <div onClick={function(){setAvatarMenuOpen(false);}}
                      style={{position:"fixed",inset:0,zIndex:10}}/>
                    <div style={{
                      position:"absolute",left:"100%",marginLeft:8,top:"50%",transform:"translateY(-20%)",
                      background:t.bgCard,border:"1px solid "+t.border,borderRadius:10,
                      boxShadow:"0 8px 24px rgba(0,0,0,0.18)",overflow:"hidden",zIndex:20,minWidth:150,
                    }}>
                      <button type="button"
                        onClick={function(){
                          setAvatarMenuOpen(false);
                          fileInputRef.current && fileInputRef.current.click();
                        }}
                        style={{display:"block",width:"100%",padding:"10px 14px",border:"none",
                          background:"transparent",color:t.text,fontSize:13,textAlign:"left",cursor:"pointer"}}>
                        Change photo
                      </button>
                      <button type="button"
                        onClick={function(){ setAvatarMenuOpen(false); removeAvatar(); }}
                        style={{display:"block",width:"100%",padding:"10px 14px",border:"none",
                          borderTop:"1px solid "+t.border,background:"transparent",color:t.red,
                          fontSize:13,textAlign:"left",cursor:"pointer",fontWeight:500}}>
                        Remove photo
                      </button>
                    </div>
                  </>
                )}
              </div>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:13,fontWeight:600,color:t.text}}>Profile photo</div>
                {uploadState.error&&(
                  <div style={{fontSize:11,color:t.red,marginTop:4}}>{uploadState.error}</div>
                )}
              </div>
            </div>

            {[
              {l:"Full name",  k:"name",   type:"text", ph:"Your name"},
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

            {/* Home zone — replaces the old freetext Suburb input. */}
            <div style={{marginBottom:10}}>
              <label style={{fontSize:10,fontWeight:700,color:t.textSecondary,display:"block",marginBottom:4,letterSpacing:"0.06em",textTransform:"uppercase"}}>Home zone</label>
              <select
                value={profileDraft.home_zone||""}
                onChange={function(e){
                  var v=e.target.value||null;
                  setProfileDraft(function(d){return Object.assign({},d,{home_zone:v});});
                }}
                style={Object.assign({},iStyle,{appearance:"none",WebkitAppearance:"none",paddingRight:28,
                  backgroundImage:"linear-gradient(45deg,transparent 50%,"+t.textSecondary+" 50%),linear-gradient(135deg,"+t.textSecondary+" 50%,transparent 50%)",
                  backgroundPosition:"calc(100% - 14px) 50%, calc(100% - 9px) 50%",
                  backgroundSize:"5px 5px, 5px 5px",
                  backgroundRepeat:"no-repeat",
                })}>
                <option value="">Select your home zone…</option>
                {ZONES.map(function(z){
                  return <option key={z.id} value={z.id}>{z.name}</option>;
                })}
              </select>
            </div>
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
                    bio:nd.bio||"",
                    skill:nd.skill||"Intermediate",
                    style:nd.style||"All-Court",
                    avatar:nd.avatar||"",
                    avatar_url:nd.avatar_url||null,
                    home_zone:nd.home_zone||null,
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


        {/* ── Appearance ─────────────────────────────────────────────────────── */}
        <div style={{background:t.bgCard,border:"1px solid "+t.border,borderRadius:12,overflow:"hidden",marginBottom:12}}>
          <div style={{padding:"14px 16px",borderBottom:"1px solid "+t.border}}>
            <div style={{fontSize:13,fontWeight:700,color:t.text,marginBottom:2}}>Appearance</div>
            <div style={{fontSize:11,color:t.textTertiary}}>Choose your court theme.</div>
          </div>
          <div style={{padding:"14px 16px",display:"flex",flexDirection:"column",gap:8}}>
            {THEME_OPTIONS.map(function(opt){
              var on=theme===opt.id;
              return (
                <button key={opt.id}
                  onClick={function(){setTheme(opt.id);}}
                  style={{
                    display:"flex",alignItems:"center",gap:12,padding:"10px 12px",
                    borderRadius:9,border:"1px solid "+(on?t.accent:t.border),
                    background:on?t.accentSubtle:"transparent",
                    cursor:"pointer",textAlign:"left",
                  }}>
                  <div style={{
                    width:28,height:28,borderRadius:7,flexShrink:0,overflow:"hidden",
                    border:"1px solid "+t.border,display:"flex",
                  }}>
                    <div style={{flex:1,background:opt.bg}}/>
                    <div style={{width:10,background:opt.swatch}}/>
                  </div>
                  <span style={{fontSize:13,fontWeight:on?600:400,color:on?t.accent:t.text}}>{opt.label}</span>
                  {on&&<span style={{marginLeft:"auto",fontSize:13,color:t.accent}}>✓</span>}
                </button>
              );
            })}
          </div>
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
