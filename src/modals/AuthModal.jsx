import { supabase } from "../supabase.js";
import { inputStyle } from "../lib/theme.js";

export default function AuthModal({
  t, showAuth, setShowAuth,
  authMode, setAuthMode, authStep, setAuthStep,
  authEmail, setAuthEmail, authPassword, setAuthPassword,
  authName, setAuthName, authLoading, setAuthLoading,
  authNewPassword, setAuthNewPassword, authNewPassword2, setAuthNewPassword2,
  authError, setAuthError, authFieldErrors, setAuthFieldErrors,
  loadUserData,
}) {
  var iStyle=inputStyle(t);

  function validateEmail(email){return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());}
  function validatePassword(pw){return pw.length>=6;}
  function mapAuthError(msg){
    if(!msg) return "Something went wrong. Please try again.";
    if(msg.includes("Invalid login credentials")||msg.includes("invalid_credentials")) return "Incorrect email or password.";
    if(msg.includes("User already registered")||msg.includes("already been registered")) return "An account with this email already exists.";
    if(msg.includes("Email not confirmed")) return "Please check your email to confirm your account first.";
    if(msg.includes("Password should be at least")) return "Password must be at least 6 characters.";
    if(msg.includes("Unable to validate email")) return "Please enter a valid email address.";
    if(msg.includes("signup_disabled")) return "Sign ups are currently disabled. Contact support.";
    if(msg.includes("network")||msg.includes("fetch")) return "Connection error. Check your internet and try again.";
    return msg;
  }

  if(!showAuth) return null;
  return (
    <div
      onClick={function(){if(authStep==="set-password")return;setShowAuth(false);setAuthError("");setAuthFieldErrors({});setAuthStep("choose");}}
      style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.4)",backdropFilter:"blur(10px)",WebkitBackdropFilter:"blur(10px)",display:"flex",alignItems:"flex-end",justifyContent:"center",zIndex:300}}>
      <div
        onClick={function(e){e.stopPropagation();}}
        className="slide-up"
        style={{background:t.modalBg,borderTop:"1px solid "+t.border,borderRadius:"16px 16px 0 0",padding:"28px 24px 48px",width:"100%",maxWidth:480}}>
        <div style={{width:32,height:3,borderRadius:2,background:t.border,margin:"0 auto 24px"}}/>

        {authStep!=="forgot-sent"&&authStep!=="set-password"&&(
          <div style={{marginBottom:24}}>
            <div style={{width:36,height:36,borderRadius:9,background:t.accent,display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,fontWeight:800,color:"#fff",marginBottom:12}}>CS</div>
            <h2 style={{fontSize:22,fontWeight:700,color:t.text,marginBottom:4,letterSpacing:"-0.4px"}}>
              {authStep==="forgot"?"Reset password":authMode==="signup"?"Create account":"Welcome back"}
            </h2>
            <p style={{fontSize:13,color:t.textSecondary}}>
              {authStep==="forgot"?"We'll send a reset link to your email.":"Enter tournaments. Compete for prizes."}
            </p>
          </div>
        )}

        {/* Choose */}
        {authStep==="choose"&&(
          <div style={{display:"flex",flexDirection:"column",gap:10}}>
            <button
              onClick={function(){setAuthStep("email");setAuthError("");setAuthFieldErrors({});}}
              style={{width:"100%",padding:"14px",borderRadius:9,border:"1px solid "+t.border,background:"transparent",color:t.text,fontSize:14,fontWeight:500}}>
              Continue with Email
            </button>
            <p style={{textAlign:"center",fontSize:13,color:t.textSecondary,marginTop:4}}>
              {authMode==="login"?"No account? ":"Have an account? "}
              <button
                onClick={function(){setAuthMode(authMode==="login"?"signup":"login");setAuthError("");setAuthFieldErrors({});}}
                style={{background:"none",border:"none",color:t.accent,fontWeight:600,fontSize:13}}>
                {authMode==="login"?"Sign up":"Log in"}
              </button>
            </p>
          </div>
        )}

        {/* Email form */}
        {authStep==="email"&&(
          <div className="fade-up">
            {authMode==="signup"&&(
              <div style={{marginBottom:12}}>
                <label style={{fontSize:10,fontWeight:700,color:t.textSecondary,display:"block",marginBottom:5,letterSpacing:"0.06em",textTransform:"uppercase"}}>Full name</label>
                <input value={authName} placeholder="Your name"
                  onChange={function(e){setAuthName(e.target.value);setAuthFieldErrors(function(f){return Object.assign({},f,{name:null});});}}
                  style={Object.assign({},iStyle,{borderColor:authFieldErrors.name?t.red:t.border})}/>
                {authFieldErrors.name&&<div style={{fontSize:11,color:t.red,marginTop:4}}>{authFieldErrors.name}</div>}
              </div>
            )}
            <div style={{marginBottom:12}}>
              <label style={{fontSize:10,fontWeight:700,color:t.textSecondary,display:"block",marginBottom:5,letterSpacing:"0.06em",textTransform:"uppercase"}}>Email</label>
              <input type="email" value={authEmail} placeholder="you@example.com"
                onChange={function(e){setAuthEmail(e.target.value);setAuthFieldErrors(function(f){return Object.assign({},f,{email:null});});}}
                style={Object.assign({},iStyle,{borderColor:authFieldErrors.email?t.red:t.border})}/>
              {authFieldErrors.email&&<div style={{fontSize:11,color:t.red,marginTop:4}}>{authFieldErrors.email}</div>}
            </div>
            <div style={{marginBottom:6}}>
              <label style={{fontSize:10,fontWeight:700,color:t.textSecondary,display:"block",marginBottom:5,letterSpacing:"0.06em",textTransform:"uppercase"}}>Password</label>
              <input type="password" value={authPassword}
                placeholder={authMode==="signup"?"Min 6 characters":"Your password"}
                onChange={function(e){setAuthPassword(e.target.value);setAuthFieldErrors(function(f){return Object.assign({},f,{password:null});});}}
                style={Object.assign({},iStyle,{borderColor:authFieldErrors.password?t.red:t.border})}/>
              {authFieldErrors.password&&<div style={{fontSize:11,color:t.red,marginTop:4}}>{authFieldErrors.password}</div>}
            </div>
            {authMode==="login"&&(
              <div style={{textAlign:"right",marginBottom:18}}>
                <button
                  onClick={function(){setAuthStep("forgot");setAuthError("");setAuthFieldErrors({});}}
                  style={{background:"none",border:"none",color:t.accent,fontSize:12,fontWeight:500}}>
                  Forgot password?
                </button>
              </div>
            )}
            {authMode==="signup"&&<div style={{height:18}}/>}
            {authError&&<div style={{fontSize:12,color:t.red,marginBottom:12,padding:"10px 12px",background:t.redSubtle,border:"1px solid "+t.red+"33",borderRadius:7}}>{authError}</div>}
            <button
              disabled={authLoading}
              onClick={async function(){
                var fe={};
                if(authMode==="signup"&&!authName.trim()) fe.name="Please enter your name.";
                if(!authEmail.trim()) fe.email="Email is required.";
                else if(!validateEmail(authEmail)) fe.email="Please enter a valid email address.";
                if(!authPassword) fe.password="Password is required.";
                else if(authMode==="signup"&&!validatePassword(authPassword)) fe.password="Password must be at least 6 characters.";
                if(Object.keys(fe).length){setAuthFieldErrors(fe);return;}
                setAuthLoading(true);setAuthError("");setAuthFieldErrors({});
                var r=authMode==="signup"
                  ?await supabase.auth.signUp({email:authEmail.trim(),password:authPassword,options:{data:{name:authName.trim()}}})
                  :await supabase.auth.signInWithPassword({email:authEmail.trim(),password:authPassword});
                setAuthLoading(false);
                if(r.error){setAuthError(mapAuthError(r.error.message));return;}
                setShowAuth(false);setAuthStep("choose");setAuthEmail("");setAuthPassword("");setAuthName("");setAuthError("");setAuthFieldErrors({});
              }}
              style={{width:"100%",padding:"14px",borderRadius:9,border:"none",background:t.accent,color:"#fff",fontSize:14,fontWeight:600,opacity:authLoading?0.65:1}}>
              {authLoading?"Please wait…":authMode==="signup"?"Create account":"Log in"}
            </button>
            <button
              onClick={function(){setAuthStep("choose");setAuthError("");setAuthFieldErrors({});}}
              style={{width:"100%",marginTop:8,padding:"10px",background:"none",border:"none",color:t.textSecondary,fontSize:12}}>
              Back
            </button>
          </div>
        )}

        {/* Forgot */}
        {authStep==="forgot"&&(
          <div className="fade-up">
            <div style={{marginBottom:12}}>
              <label style={{fontSize:10,fontWeight:700,color:t.textSecondary,display:"block",marginBottom:5,letterSpacing:"0.06em",textTransform:"uppercase"}}>Email</label>
              <input type="email" value={authEmail} placeholder="you@example.com"
                onChange={function(e){setAuthEmail(e.target.value);setAuthError("");}}
                style={Object.assign({},iStyle,{borderColor:authError?t.red:t.border})}/>
            </div>
            {authError&&<div style={{fontSize:12,color:t.red,marginBottom:12,padding:"10px 12px",background:t.redSubtle,border:"1px solid "+t.red+"33",borderRadius:7}}>{authError}</div>}
            <button
              disabled={authLoading}
              onClick={async function(){
                if(!authEmail.trim()||!validateEmail(authEmail)){setAuthError("Please enter a valid email address.");return;}
                setAuthLoading(true);setAuthError("");
                var r=await supabase.auth.resetPasswordForEmail(authEmail.trim(),{redirectTo:window.location.origin});
                setAuthLoading(false);
                if(r.error){setAuthError(mapAuthError(r.error.message));return;}
                setAuthStep("forgot-sent");
              }}
              style={{width:"100%",padding:"14px",borderRadius:9,border:"none",background:t.accent,color:"#fff",fontSize:14,fontWeight:600,opacity:authLoading?0.65:1,marginBottom:8}}>
              {authLoading?"Sending…":"Send reset link"}
            </button>
            <button
              onClick={function(){setAuthStep("email");setAuthError("");}}
              style={{width:"100%",padding:"10px",background:"none",border:"none",color:t.textSecondary,fontSize:12}}>
              Back to login
            </button>
          </div>
        )}

        {/* Forgot sent */}
        {authStep==="forgot-sent"&&(
          <div className="fade-up" style={{textAlign:"center",padding:"12px 0 8px"}}>
            <div style={{width:52,height:52,borderRadius:"50%",background:t.greenSubtle,border:"1px solid "+t.green+"44",display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 16px",fontSize:22}}>✓</div>
            <h2 style={{fontSize:20,fontWeight:700,color:t.text,marginBottom:8,letterSpacing:"-0.3px"}}>Check your email</h2>
            <p style={{fontSize:14,color:t.textSecondary,lineHeight:1.6,marginBottom:24}}>
              We sent a reset link to <strong style={{color:t.text}}>{authEmail}</strong>. Check your inbox and follow the link.
            </p>
            <button
              onClick={function(){setShowAuth(false);setAuthStep("choose");setAuthEmail("");setAuthError("");}}
              style={{width:"100%",padding:"14px",borderRadius:9,border:"none",background:t.accent,color:"#fff",fontSize:14,fontWeight:600}}>
              Done
            </button>
          </div>
        )}

        {/* Set new password */}
        {authStep==="set-password"&&(
          <div className="fade-up">
            <div style={{width:36,height:36,borderRadius:9,background:t.accent,display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,fontWeight:800,color:"#fff",marginBottom:12}}>CS</div>
            <h2 style={{fontSize:22,fontWeight:700,color:t.text,marginBottom:4,letterSpacing:"-0.4px"}}>Set new password</h2>
            <p style={{fontSize:13,color:t.textSecondary,marginBottom:24}}>Choose a new password for your account.</p>
            <div style={{marginBottom:12}}>
              <label style={{fontSize:10,fontWeight:700,color:t.textSecondary,display:"block",marginBottom:5,letterSpacing:"0.06em",textTransform:"uppercase"}}>New password</label>
              <input type="password" value={authNewPassword} placeholder="Min 6 characters"
                onChange={function(e){setAuthNewPassword(e.target.value);setAuthFieldErrors(function(f){return Object.assign({},f,{np:null});});}}
                style={Object.assign({},iStyle,{borderColor:authFieldErrors.np?t.red:t.border})}/>
              {authFieldErrors.np&&<div style={{fontSize:11,color:t.red,marginTop:4}}>{authFieldErrors.np}</div>}
            </div>
            <div style={{marginBottom:20}}>
              <label style={{fontSize:10,fontWeight:700,color:t.textSecondary,display:"block",marginBottom:5,letterSpacing:"0.06em",textTransform:"uppercase"}}>Confirm password</label>
              <input type="password" value={authNewPassword2} placeholder="Repeat password"
                onChange={function(e){setAuthNewPassword2(e.target.value);setAuthFieldErrors(function(f){return Object.assign({},f,{np2:null});});}}
                style={Object.assign({},iStyle,{borderColor:authFieldErrors.np2?t.red:t.border})}/>
              {authFieldErrors.np2&&<div style={{fontSize:11,color:t.red,marginTop:4}}>{authFieldErrors.np2}</div>}
            </div>
            {authError&&<div style={{fontSize:12,color:t.red,marginBottom:12,padding:"10px 12px",background:t.redSubtle,border:"1px solid "+t.red+"33",borderRadius:7}}>{authError}</div>}
            <button
              disabled={authLoading}
              onClick={async function(){
                var fe={};
                if(!authNewPassword||authNewPassword.length<6) fe.np="Password must be at least 6 characters.";
                if(authNewPassword!==authNewPassword2) fe.np2="Passwords don't match.";
                if(Object.keys(fe).length){setAuthFieldErrors(fe);return;}
                setAuthLoading(true);setAuthError("");
                var r=await supabase.auth.updateUser({password:authNewPassword});
                setAuthLoading(false);
                if(r.error){setAuthError(mapAuthError(r.error.message));return;}
                setShowAuth(false);setAuthStep("choose");setAuthNewPassword("");setAuthNewPassword2("");setAuthError("");setAuthFieldErrors({});
              }}
              style={{width:"100%",padding:"14px",borderRadius:9,border:"none",background:t.accent,color:"#fff",fontSize:14,fontWeight:600,opacity:authLoading?0.65:1}}>
              {authLoading?"Updating…":"Update password"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
