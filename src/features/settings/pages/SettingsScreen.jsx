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
import { SKILL_LEVELS, SKILL_HINTS, PLAY_STYLES, DAYS_SHORT, TIME_BLOCKS } from "../../../lib/constants/domain.js";
import AvailabilityChips from "../../../components/ui/AvailabilityChips.jsx";
import CourtsPicker from "../../../components/ui/CourtsPicker.jsx";
import { ZONES } from "../../map/data/zones.js";
import { setHomeZone } from "../../map/services/mapService.js";
import PlayerAvatar from "../../../components/ui/PlayerAvatar.jsx";
import { uploadAvatar, deleteAvatarByUrl } from "../../profile/services/avatarUpload.js";
import { THEME_OPTIONS } from "../../../lib/theme.js";
import { track } from "../../../lib/analytics.js";
import { useEffect } from "react";

export default function SettingsScreen({
  t, authUser, profile, setProfile,
  theme, setTheme,
  profileDraft, setProfileDraft,
  // profileLoaded — has loadProfile() resolved with real data?
  // Save is gated on this so a stale draft (sourced from
  // INITIAL_PROFILE while fetchProfile is still in flight) can never
  // overwrite populated DB columns. See useCurrentUser.profileLoaded
  // for the post-mortem on why this guard exists.
  profileLoaded,
  editingAvail, setEditingAvail,
  availDraft, setAvailDraft,
  receivedRequests,
  onClose,
  // App-level toast emitter — fires on Save success so the user gets
  // visible confirmation rather than a silent button press.
  toast,
}) {
  var navigate=useNavigate();

  // Late-arrival fix: if the user opened Settings before fetchProfile
  // resolved, profileDraft was snapshotted from INITIAL_PROFILE. Once
  // the real profile arrives, re-snapshot it into the draft as long as
  // the user hasn't started editing. We detect "user started editing"
  // by checking whether the draft already matches the live profile by
  // identity — if it differs, leave it alone (the user typed something).
  useEffect(function () {
    if (!profileLoaded || !profile || !profile.id) return;
    if (profileDraft && profileDraft.id === profile.id) return;
    setProfileDraft(profile);
  }, [profileLoaded, profile && profile.id]);
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

        {/* ── Edit Profile ─────────────────────────────────────────────────────
            User feedback: previously the Edit Profile card collapsed when
            availability went into edit mode, which felt like the page had
            reset. Show it always; availability editor expands in place
            below. */}
        {(
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
                  <label style={{fontSize:10,fontWeight:700,color:t.textSecondary,display:"block",marginBottom:4,letterSpacing:"0.12em",textTransform:"uppercase"}}>{f.l}</label>
                  <input type={f.type} value={profileDraft[f.k]||""} placeholder={f.ph}
                    onChange={function(e){var v=e.target.value;setProfileDraft(function(d){return Object.assign({},d,{[f.k]:v});});}}
                    style={iStyle}/>
                </div>
              );
            })}

            {/* Home zone — writes LIVE, not through the Save button, so the
                map + settings dropdown always agree. Reads from `profile`
                (source of truth), not from the draft. */}
            <div style={{marginBottom:10}}>
              <label style={{fontSize:10,fontWeight:700,color:t.textSecondary,display:"block",marginBottom:4,letterSpacing:"0.12em",textTransform:"uppercase"}}>Home zone</label>
              <div style={{position:"relative"}}>
                <select
                  disabled={!profileLoaded}
                  value={profile.home_zone||""}
                  onChange={async function(e){
                    if(!profileLoaded) return; // guard against stale write
                    var nextVal = e.target.value || null;
                    var prev = profile.home_zone||null;
                    if(nextVal===prev) return;
                    setProfile(function(p){return Object.assign({},p,{home_zone:nextVal});});
                    setProfileDraft(function(d){return Object.assign({},d,{home_zone:nextVal});});
                    if(authUser){
                      var r = await setHomeZone(authUser.id, nextVal);
                      if(r.error){
                        setProfile(function(p){return Object.assign({},p,{home_zone:prev});});
                        setProfileDraft(function(d){return Object.assign({},d,{home_zone:prev});});
                        console.error("Home zone save error:", r.error);
                      } else {
                        if(nextVal) track("home_zone_set",     { zone_id: nextVal, from: "settings" });
                        else        track("home_zone_cleared", { zone_id: prev,    from: "settings" });
                      }
                    }
                  }}
                  style={Object.assign({},iStyle,{appearance:"none",WebkitAppearance:"none",MozAppearance:"none",paddingRight:32})}>
                  <option value="">Select your home zone…</option>
                  {ZONES.map(function(z){
                    return <option key={z.id} value={z.id}>{z.name}</option>;
                  })}
                </select>
                {/* SVG chevron — replaces the old CSS-gradient hack that
                    could render as two giant overlapping triangles mid
                    theme-swap. */}
                <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"
                  style={{position:"absolute",right:12,top:"50%",transform:"translateY(-50%)",pointerEvents:"none",color:t.textSecondary}}>
                  <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
            </div>
            {/* Payment handle — opt-in. Fills the Tindis split deep-links.
                We never receive or transmit money; the handle is purely a
                reminder string rendered back to the partner when they owe. */}
            <div style={{marginBottom:12}}>
              <label style={{fontSize:10,fontWeight:700,color:t.textSecondary,display:"block",marginBottom:6,letterSpacing:"0.12em",textTransform:"uppercase"}}>
                Payment handle (for Tindis)
              </label>
              <div style={{display:"grid",gridTemplateColumns:"1.2fr 2fr",gap:8}}>
                <select
                  value={profileDraft.payment_method||""}
                  onChange={function(e){setProfileDraft(function(d){return Object.assign({},d,{payment_method:e.target.value||null});});}}
                  style={iStyle}>
                  <option value="">None</option>
                  <option value="payid">PayID (AU)</option>
                  <option value="beem">Beem It (AU)</option>
                  <option value="paypal">PayPal.me</option>
                  <option value="venmo">Venmo</option>
                  <option value="zelle">Zelle</option>
                  <option value="other">Other</option>
                </select>
                <input
                  value={profileDraft.payment_handle||""}
                  onChange={function(e){setProfileDraft(function(d){return Object.assign({},d,{payment_handle:e.target.value});});}}
                  placeholder={profileDraft.payment_method==="payid"?"email or phone":(profileDraft.payment_method==="paypal"?"paypal.me username":"handle")}
                  style={iStyle}/>
              </div>
              <div style={{fontSize:10,color:t.textTertiary,marginTop:6,lineHeight:1.4}}>
                CourtSync never sees or processes payments. This just opens your wallet app when a partner owes you after a pact.
              </div>
            </div>
            {/* Skill level — stacked list so SKILL_HINTS sits below each rung.
                Module 7.7: locked once a confirmed ranked match has been
                recorded (profile.skill_level_locked = true, set server-side
                by apply_match_outcome). When locked, picker disabled with a
                lock-explanation hairline strip + info icon for the full
                rules. */}
            {(function(){
              var locked = !!(profile && profile.skill_level_locked);
              return (
                <div style={{marginBottom:12}}>
                  <div style={{display:"flex",alignItems:"baseline",justifyContent:"space-between",marginBottom:6}}>
                    <label style={{fontSize:10,fontWeight:700,color:t.textSecondary,letterSpacing:"0.12em",textTransform:"uppercase"}}>Skill level</label>
                    {locked && (
                      <span style={{
                        fontSize:9,fontWeight:800,letterSpacing:"0.16em",
                        textTransform:"uppercase",color:t.textTertiary,
                      }}>
                        Locked
                      </span>
                    )}
                  </div>
                  <div style={{display:"flex",flexDirection:"column",gap:6,opacity:locked?0.55:1}}>
                    {SKILL_LEVELS.map(function(s){
                      var on=profileDraft.skill===s;
                      return (
                        <button key={s}
                          disabled={locked}
                          onClick={function(){
                            if(locked) return;
                            setProfileDraft(function(d){return Object.assign({},d,{skill:s});});
                          }}
                          style={{textAlign:"left",padding:"8px 12px",borderRadius:8,border:"1px solid "+(on?t.accent:t.border),background:on?t.accentSubtle:"transparent",color:on?t.accent:t.text,cursor:locked?"not-allowed":"pointer",display:"flex",flexDirection:"column",gap:2}}>
                          <span style={{fontSize:12,fontWeight:on?700:600}}>{s}</span>
                          <span style={{fontSize:10.5,color:on?t.accent:t.textTertiary,fontWeight:400,lineHeight:1.35}}>
                            {SKILL_HINTS[s]||""}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                  {locked && (
                    <div style={{
                      marginTop:10,
                      paddingTop:10,paddingBottom:10,
                      borderTop:"1px solid "+t.border,
                      display:"flex",gap:10,alignItems:"baseline",
                    }}>
                      <span style={{
                        fontSize:9,fontWeight:800,letterSpacing:"0.16em",
                        textTransform:"uppercase",color:t.textTertiary,flexShrink:0,
                      }}>
                        Why locked
                      </span>
                      <span style={{
                        fontSize:11.5,color:t.textSecondary,
                        lineHeight:1.5,letterSpacing:"-0.1px",
                      }}>
                        Your starting level locked when you played your first confirmed ranked match. Your displayed level still moves with your CourtSync Rating.
                      </span>
                    </div>
                  )}
                </div>
              );
            })()}
            {/* Play style — still chips; these don't need per-option copy. */}
            <div style={{marginBottom:12}}>
              <label style={{fontSize:10,fontWeight:700,color:t.textSecondary,display:"block",marginBottom:6,letterSpacing:"0.12em",textTransform:"uppercase"}}>Play style</label>
              <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
                {PLAY_STYLES.map(function(o){
                  var on=profileDraft.style===o;
                  return (
                    <button key={o}
                      onClick={function(){setProfileDraft(function(d){return Object.assign({},d,{style:o});});}}
                      style={{padding:"7px 12px",borderRadius:7,border:"1px solid "+(on?t.accent:t.border),background:on?t.accentSubtle:"transparent",color:on?t.accent:t.textSecondary,fontSize:12,fontWeight:on?600:400}}>
                      {o}
                    </button>
                  );
                })}
              </div>
            </div>
            {/* Courts I play at — drives the sorted player list on
                CourtInfoCard in Phase 2. Capped at 8 client-side; value
                rides into the same upsert below. */}
            <div style={{marginBottom:12}}>
              <label style={{fontSize:10,fontWeight:700,color:t.textSecondary,display:"block",marginBottom:6,letterSpacing:"0.12em",textTransform:"uppercase"}}>Courts I play at</label>
              <CourtsPicker t={t}
                value={profileDraft.played_courts||[]}
                onChange={function(next){setProfileDraft(function(d){return Object.assign({},d,{played_courts:next});});}}/>
            </div>
            <button
              disabled={!profileLoaded}
              title={!profileLoaded ? "Loading your profile — try again in a moment" : ""}
              onClick={async function(){
                // Hard guard against the stale-draft stomp: never write
                // when the live profile hasn't finished loading.
                if (!profileLoaded) return;
                var init2=initials(profileDraft.name||"YN");
                // Merge order matters. Start from the CURRENT profile
                // (which holds the live presence toggles + home_zone +
                // server-owned stat columns) and overlay only the form
                // fields the draft actually owns. Previously we did
                // Object.assign({}, profileDraft, ...) which stomped
                // show_online_status / show_last_seen back to whatever
                // they were when the modal opened, masking the toggle
                // the user just flipped. DB was correct; the UI was
                // drifting until the next page reload.
                var nd=Object.assign({},profile,{
                  name:         profileDraft.name,
                  bio:          profileDraft.bio,
                  skill:        profileDraft.skill,
                  style:        profileDraft.style,
                  avatar_url:   profileDraft.avatar_url,
                  availability: profileDraft.availability,
                  played_courts: profileDraft.played_courts || [],
                  payment_handle: profileDraft.payment_handle || null,
                  payment_method: profileDraft.payment_method || null,
                  avatar:       init2,
                });
                setProfile(nd);
                if(authUser){
                  // home_zone is written live (see dropdown above), so we
                  // deliberately leave it out of this upsert — otherwise a
                  // stale draft would overwrite a zone the user just set
                  // from the Map side panel.
                  // Module 7.7: skill is omitted from the upsert when
                  // skill_level_locked=true, so the locked-columns guard
                  // never sees a write attempt on it.
                  var payload = {
                    id:authUser.id,
                    name:nd.name||"",
                    bio:nd.bio||"",
                    style:nd.style||"All-Court",
                    avatar:nd.avatar||"",
                    avatar_url:nd.avatar_url||null,
                    availability:nd.availability||{},
                    played_courts: nd.played_courts || [],
                    payment_handle: nd.payment_handle,
                    payment_method: nd.payment_method,
                  };
                  if (!profile.skill_level_locked) {
                    payload.skill = nd.skill || "Intermediate 1";
                  }
                  var res=await supabase.from("profiles").upsert(payload, { onConflict: "id" });
                  if(res.error){
                    console.error("Profile save error:",res.error);
                    if(toast) toast("Couldn't save — try again.", "error");
                  } else {
                    setProfileDraft(nd); // keep the draft in sync with the saved row
                    if(nd.payment_handle) track("payment_handle_added", { method: nd.payment_method || "unknown" });
                    if(toast) toast("Profile saved", "success");
                  }
                }
              }}
              style={{
                width:"100%",padding:"12px",borderRadius:8,border:"none",
                background: profileLoaded ? t.accent : t.border,
                color:"#fff",fontSize:13,fontWeight:600,marginTop:4,
                cursor: profileLoaded ? "pointer" : "not-allowed",
                opacity: profileLoaded ? 1 : 0.65,
              }}>
              {profileLoaded ? "Save changes" : "Loading…"}
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
              {/* Presets + optional 7×4 grid — same AvailabilityChips
                  component the onboarding flow uses, so the two surfaces
                  read identically. Grid starts expanded here because
                  users hitting Settings are usually editing precisely. */}
              <AvailabilityChips t={t}
                value={availDraft}
                initiallyExpanded={true}
                onChange={setAvailDraft}/>
              <button
                disabled={!profileLoaded}
                onClick={async function(){
                  if(!profileLoaded) return;
                  setProfile(function(p){return Object.assign({},p,{availability:availDraft});});
                  setProfileDraft(function(d){return Object.assign({},d,{availability:availDraft});});
                  setEditingAvail(false);
                  if(authUser){
                    var res=await supabase.from("profiles").upsert({id:authUser.id,availability:availDraft},{onConflict:"id"});
                    if(res.error){
                      console.error("Availability save error:",res.error);
                      if(toast) toast("Couldn't save — try again.", "error");
                    } else {
                      if(toast) toast("Availability saved", "success");
                    }
                  }
                }}
                style={{
                  width:"100%",marginTop:14,padding:"12px",borderRadius:8,border:"none",
                  background: profileLoaded ? t.accent : t.border,
                  color:"#fff",fontSize:13,fontWeight:600,
                  cursor: profileLoaded ? "pointer" : "not-allowed",
                  opacity: profileLoaded ? 1 : 0.65,
                }}>
                {profileLoaded ? "Save availability" : "Loading…"}
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


        {/* ── Appearance — compact row of colour circles ───────────────────── */}
        {(function(){
          var current = THEME_OPTIONS.find(function(o){return o.id===theme;}) || THEME_OPTIONS[0];
          return (
            <div style={{background:t.bgCard,border:"1px solid "+t.border,borderRadius:12,padding:"14px 16px",marginBottom:12,
              display:"flex",alignItems:"center",gap:14}}>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:13,fontWeight:700,color:t.text}}>Appearance</div>
                <div style={{fontSize:11,color:t.textTertiary,marginTop:2}}>{current.label}</div>
              </div>
              <div style={{display:"flex",gap:10,flexShrink:0}}>
                {THEME_OPTIONS.map(function(opt){
                  var on=theme===opt.id;
                  return (
                    <button key={opt.id}
                      type="button"
                      aria-label={opt.label}
                      aria-pressed={on}
                      title={opt.label}
                      onClick={function(){setTheme(opt.id);}}
                      style={{
                        width:30, height:30, borderRadius:"50%",
                        padding:0, cursor:"pointer",
                        border:on?("2px solid "+t.text):("1px solid "+t.border),
                        background:"conic-gradient("+opt.swatch+" 0 50%,"+opt.bg+" 50% 100%)",
                        boxShadow: on ? ("0 0 0 2px "+t.bgCard+" inset") : "none",
                        flexShrink:0,
                      }}/>
                  );
                })}
              </div>
            </div>
          );
        })()}

        {/* ── Account ────────────────────────────────────────────────────────── */}
        {authUser&&(
          <div style={{background:t.bgCard,border:"1px solid "+t.border,borderRadius:12,overflow:"hidden",marginBottom:12}}>
            <div style={{padding:"14px 16px",borderBottom:"1px solid "+t.border}}>
              <div style={{fontSize:10,fontWeight:700,color:t.textTertiary,textTransform:"uppercase",letterSpacing:"0.12em",marginBottom:2}}>Account</div>
              <div style={{fontSize:14,color:t.text,fontWeight:500}}>{authUser.email}</div>
            </div>
            {/* Friend requests row removed — duplicates the People tab.
                Direct your inbox to /people/requests if you want it. */}
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
