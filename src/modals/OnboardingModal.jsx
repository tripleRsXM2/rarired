import { supabase } from "../supabase.js";
import { SKILL_LEVELS, PLAY_STYLES } from "../lib/constants.js";
import { inputStyle } from "../lib/theme.js";

export default function OnboardingModal({
  t, authUser, showOnboarding, setShowOnboarding,
  profile, setProfile, setProfileDraft,
  onboardStep, setOnboardStep, onboardDraft, setOnboardDraft,
}) {
  var iStyle=inputStyle(t);
  if(!showOnboarding) return null;
  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",backdropFilter:"blur(12px)",WebkitBackdropFilter:"blur(12px)",display:"flex",alignItems:"flex-end",justifyContent:"center",zIndex:400}}>
      <div className="slide-up" style={{background:t.modalBg,borderTop:"1px solid "+t.border,borderRadius:"16px 16px 0 0",padding:"28px 24px 48px",width:"100%",maxWidth:480}}>
        <div style={{width:32,height:3,borderRadius:2,background:t.border,margin:"0 auto 28px"}}/>

        <div style={{display:"flex",gap:6,justifyContent:"center",marginBottom:24}}>
          {[1,2].map(function(s){
            return <div key={s} style={{width:s===onboardStep?20:6,height:6,borderRadius:3,background:s===onboardStep?t.accent:t.border,transition:"width 0.2s ease"}}/>;
          })}
        </div>

        {onboardStep===1&&(
          <div className="fade-up">
            <h2 style={{fontSize:22,fontWeight:700,color:t.text,marginBottom:6,letterSpacing:"-0.4px"}}>Your game, your way.</h2>
            <p style={{fontSize:13,color:t.textSecondary,marginBottom:24,lineHeight:1.6}}>Tell us your level and style so we can match you to the right tournaments.</p>

            <div style={{marginBottom:20}}>
              <label style={{fontSize:10,fontWeight:700,color:t.textSecondary,display:"block",marginBottom:8,letterSpacing:"0.06em",textTransform:"uppercase"}}>Skill level</label>
              <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                {SKILL_LEVELS.map(function(s){
                  var on=onboardDraft.skill===s;
                  return (
                    <button key={s} onClick={function(){setOnboardDraft(function(d){return Object.assign({},d,{skill:s});});}}
                      style={{padding:"9px 16px",borderRadius:8,border:"1px solid "+(on?t.accent:t.border),background:on?t.accentSubtle:"transparent",color:on?t.accent:t.textSecondary,fontSize:13,fontWeight:on?600:400}}>
                      {s}
                    </button>
                  );
                })}
              </div>
            </div>

            <div style={{marginBottom:28}}>
              <label style={{fontSize:10,fontWeight:700,color:t.textSecondary,display:"block",marginBottom:8,letterSpacing:"0.06em",textTransform:"uppercase"}}>Play style</label>
              <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                {PLAY_STYLES.map(function(s){
                  var on=onboardDraft.style===s;
                  return (
                    <button key={s} onClick={function(){setOnboardDraft(function(d){return Object.assign({},d,{style:s});});}}
                      style={{padding:"9px 16px",borderRadius:8,border:"1px solid "+(on?t.accent:t.border),background:on?t.accentSubtle:"transparent",color:on?t.accent:t.textSecondary,fontSize:13,fontWeight:on?600:400}}>
                      {s}
                    </button>
                  );
                })}
              </div>
            </div>

            <button
              onClick={function(){setOnboardStep(2);}}
              style={{width:"100%",padding:"14px",borderRadius:9,border:"none",background:t.accent,color:"#fff",fontSize:14,fontWeight:600}}>
              Next →
            </button>
          </div>
        )}

        {onboardStep===2&&(
          <div className="fade-up">
            <h2 style={{fontSize:22,fontWeight:700,color:t.text,marginBottom:6,letterSpacing:"-0.4px"}}>Where do you play?</h2>
            <p style={{fontSize:13,color:t.textSecondary,marginBottom:24,lineHeight:1.6}}>Helps us surface local tournaments near you.</p>

            <div style={{marginBottom:16}}>
              <label style={{fontSize:10,fontWeight:700,color:t.textSecondary,display:"block",marginBottom:5,letterSpacing:"0.06em",textTransform:"uppercase"}}>Suburb</label>
              <input value={onboardDraft.suburb} placeholder="e.g. Bondi, Newtown, Parramatta"
                onChange={function(e){var v=e.target.value;setOnboardDraft(function(d){return Object.assign({},d,{suburb:v});});}}
                style={iStyle}/>
            </div>

            <div style={{marginBottom:28}}>
              <label style={{fontSize:10,fontWeight:700,color:t.textSecondary,display:"block",marginBottom:5,letterSpacing:"0.06em",textTransform:"uppercase"}}>Short bio <span style={{color:t.textTertiary,fontWeight:400,textTransform:"none"}}>(optional)</span></label>
              <input value={onboardDraft.bio||""} placeholder="e.g. Weekend warrior, ex-uni player…"
                onChange={function(e){var v=e.target.value;setOnboardDraft(function(d){return Object.assign({},d,{bio:v});});}}
                style={iStyle}/>
            </div>

            <button
              onClick={async function(){
                var updated=Object.assign({},profile,{skill:onboardDraft.skill,style:onboardDraft.style,suburb:onboardDraft.suburb||"Sydney",bio:onboardDraft.bio||""});
                setProfile(updated);
                setProfileDraft(updated);
                if(authUser){
                  var res=await supabase.from('profiles').upsert({
                    id:authUser.id,
                    name:updated.name||"",
                    suburb:updated.suburb||"",
                    bio:updated.bio||"",
                    skill:updated.skill||"Intermediate",
                    style:updated.style||"All-Court",
                    avatar:updated.avatar||""
                  },{onConflict:'id'});
                  if(res.error) console.error('Onboarding save error:',res.error);
                }
                setShowOnboarding(false);
              }}
              style={{width:"100%",padding:"14px",borderRadius:9,border:"none",background:t.accent,color:"#fff",fontSize:14,fontWeight:600,marginBottom:8}}>
              Get started
            </button>
            <button
              onClick={function(){setOnboardStep(1);}}
              style={{width:"100%",padding:"10px",background:"none",border:"none",color:t.textSecondary,fontSize:12}}>
              Back
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
