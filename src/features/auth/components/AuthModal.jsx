import { supabase } from "../../../lib/supabase.js";
import { inputStyle } from "../../../lib/theme.js";

// Editorial AuthModal. Same flow + same supabase calls as before — only
// the visual language changed: 0.12em ALL-CAPS labels, 800-weight display
// titles, hairline error strip, ALL-CAPS uppercase action buttons. Matches
// the rest of the redesigned product.

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

  // Editorial style helpers — used by every form step below.
  var labelStyle = {
    fontSize: 10, fontWeight: 800, color: t.textSecondary,
    display: "block", marginBottom: 6,
    letterSpacing: "0.12em", textTransform: "uppercase",
  };
  var fieldErrorStyle = {
    fontSize: 9, fontWeight: 800, letterSpacing: "0.12em",
    textTransform: "uppercase", color: t.red,
    marginTop: 5,
  };
  var primaryBtn = {
    width: "100%", padding: "14px", borderRadius: 10, border: "none",
    background: t.accent, color: "#fff",
    fontSize: 11, fontWeight: 800,
    letterSpacing: "0.12em", textTransform: "uppercase",
    cursor: "pointer",
  };
  var ghostBtn = {
    background: "none", border: "none",
    color: t.text,
    fontSize: 10, fontWeight: 800,
    letterSpacing: "0.12em", textTransform: "uppercase",
    borderBottom: "1px solid " + t.text,
    padding: "0 0 2px 0",
    cursor: "pointer",
  };

  function ErrorStrip({ msg }) {
    if (!msg) return null;
    return (
      <div style={{
        marginBottom: 14,
        paddingTop: 10, paddingBottom: 10,
        borderTop: "1px solid " + t.border,
        display: "flex", gap: 10, alignItems: "baseline",
      }}>
        <span style={{
          fontSize: 9, fontWeight: 800, letterSpacing: "0.16em",
          textTransform: "uppercase", color: t.red, flexShrink: 0,
        }}>Error</span>
        <span style={{
          fontSize: 12, color: t.text,
          lineHeight: 1.4, letterSpacing: "-0.1px",
        }}>{msg}</span>
      </div>
    );
  }

  return (
    <div
      onClick={function(){if(authStep==="set-password")return;setShowAuth(false);setAuthError("");setAuthFieldErrors({});setAuthStep("choose");}}
      style={{
        position:"fixed",inset:0,
        background:"rgba(0,0,0,0.4)",
        backdropFilter:"blur(10px)",WebkitBackdropFilter:"blur(10px)",
        display:"flex",alignItems:"center",justifyContent:"center",
        padding:"16px 16px calc(16px + env(safe-area-inset-bottom, 0px))",
        zIndex:300,
      }}>
      <div
        onClick={function(e){e.stopPropagation();}}
        className="pop"
        style={{
          background:t.modalBg,border:"1px solid "+t.border,borderRadius:14,
          padding:"26px 22px 28px",
          width:"100%",maxWidth:440,
          maxHeight:"calc(100dvh - 32px)",overflowY:"auto",
          boxShadow:"0 20px 60px rgba(0,0,0,0.35)",
        }}>

        {authStep!=="forgot-sent"&&authStep!=="set-password"&&(
          <div style={{marginBottom:22}}>
            <div style={{
              width:36,height:36,borderRadius:9,background:t.accent,
              display:"flex",alignItems:"center",justifyContent:"center",
              fontSize:13,fontWeight:800,color:"#fff",marginBottom:14,
              letterSpacing:"0.04em",
            }}>CS</div>
            <div style={{
              fontSize:9,fontWeight:800,letterSpacing:"0.16em",
              textTransform:"uppercase",color:t.textTertiary,marginBottom:6,
            }}>
              {authStep==="forgot"?"Reset":authMode==="signup"?"Create account":"Welcome back"}
            </div>
            <h2 style={{
              fontSize:26,fontWeight:800,color:t.text,
              margin:0,marginBottom:6,letterSpacing:"-0.8px",lineHeight:1.05,
            }}>
              {authStep==="forgot"?"Reset password":authMode==="signup"?"Join CourtSync":"Welcome back"}
            </h2>
            <p style={{
              fontSize:13,color:t.textSecondary,margin:0,
              lineHeight:1.5,letterSpacing:"-0.1px",
            }}>
              {authStep==="forgot"?"We'll send a reset link to your email.":"Enter tournaments. Compete for prizes."}
            </p>
          </div>
        )}

        {/* Choose */}
        {authStep==="choose"&&(
          <div style={{display:"flex",flexDirection:"column",gap:12}}>
            <button
              onClick={function(){setAuthStep("email");setAuthError("");setAuthFieldErrors({});}}
              style={{
                width:"100%",padding:"14px",borderRadius:10,
                border:"1px solid "+t.border,background:"transparent",
                color:t.text,
                fontSize:11,fontWeight:800,
                letterSpacing:"0.12em",textTransform:"uppercase",
                cursor:"pointer",
              }}>
              Continue with email
            </button>
            <p style={{
              textAlign:"center",fontSize:13,color:t.textSecondary,
              marginTop:8,letterSpacing:"-0.1px",
            }}>
              {authMode==="login"?"No account? ":"Have an account? "}
              <button
                onClick={function(){setAuthMode(authMode==="login"?"signup":"login");setAuthError("");setAuthFieldErrors({});}}
                style={Object.assign({}, ghostBtn, { marginLeft: 4 })}>
                {authMode==="login"?"Sign up":"Log in"}
              </button>
            </p>
          </div>
        )}

        {/* Email form */}
        {authStep==="email"&&(
          <div className="fade-up">
            {authMode==="signup"&&(
              <div style={{marginBottom:14}}>
                <label style={labelStyle}>Full name</label>
                <input value={authName} placeholder="Your name"
                  onChange={function(e){setAuthName(e.target.value);setAuthFieldErrors(function(f){return Object.assign({},f,{name:null});});}}
                  style={Object.assign({},iStyle,{borderColor:authFieldErrors.name?t.red:t.border})}/>
                {authFieldErrors.name&&<div style={fieldErrorStyle}>{authFieldErrors.name}</div>}
              </div>
            )}
            <div style={{marginBottom:14}}>
              <label style={labelStyle}>Email</label>
              <input type="email" value={authEmail} placeholder="you@example.com"
                onChange={function(e){setAuthEmail(e.target.value);setAuthFieldErrors(function(f){return Object.assign({},f,{email:null});});}}
                style={Object.assign({},iStyle,{borderColor:authFieldErrors.email?t.red:t.border})}/>
              {authFieldErrors.email&&<div style={fieldErrorStyle}>{authFieldErrors.email}</div>}
            </div>
            <div style={{marginBottom:6}}>
              <label style={labelStyle}>Password</label>
              <input type="password" value={authPassword}
                placeholder={authMode==="signup"?"Min 6 characters":"Your password"}
                onChange={function(e){setAuthPassword(e.target.value);setAuthFieldErrors(function(f){return Object.assign({},f,{password:null});});}}
                style={Object.assign({},iStyle,{borderColor:authFieldErrors.password?t.red:t.border})}/>
              {authFieldErrors.password&&<div style={fieldErrorStyle}>{authFieldErrors.password}</div>}
            </div>
            {authMode==="login"&&(
              <div style={{textAlign:"right",marginBottom:18,marginTop:8}}>
                <button
                  onClick={function(){setAuthStep("forgot");setAuthError("");setAuthFieldErrors({});}}
                  style={{
                    background:"none",border:"none",
                    color:t.textSecondary,
                    fontSize:10,fontWeight:800,
                    letterSpacing:"0.12em",textTransform:"uppercase",
                    borderBottom:"1px solid "+t.textSecondary,
                    padding:"0 0 2px 0",cursor:"pointer",
                  }}>
                  Forgot password?
                </button>
              </div>
            )}
            {authMode==="signup"&&<div style={{height:18}}/>}
            <ErrorStrip msg={authError}/>
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
              style={Object.assign({}, primaryBtn, { opacity: authLoading?0.65:1 })}>
              {authLoading?"Please wait…":authMode==="signup"?"Create account":"Log in"}
            </button>
            <button
              onClick={function(){setAuthStep("choose");setAuthError("");setAuthFieldErrors({});}}
              style={{
                width:"100%",marginTop:12,padding:"6px",
                background:"none",border:"none",
                color:t.textTertiary,
                fontSize:10,fontWeight:800,
                letterSpacing:"0.12em",textTransform:"uppercase",
                cursor:"pointer",
              }}>
              ← Back
            </button>
          </div>
        )}

        {/* Forgot */}
        {authStep==="forgot"&&(
          <div className="fade-up">
            <div style={{marginBottom:14}}>
              <label style={labelStyle}>Email</label>
              <input type="email" value={authEmail} placeholder="you@example.com"
                onChange={function(e){setAuthEmail(e.target.value);setAuthError("");}}
                style={Object.assign({},iStyle,{borderColor:authError?t.red:t.border})}/>
            </div>
            <ErrorStrip msg={authError}/>
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
              style={Object.assign({}, primaryBtn, { opacity: authLoading?0.65:1, marginBottom: 10 })}>
              {authLoading?"Sending…":"Send reset link"}
            </button>
            <button
              onClick={function(){setAuthStep("email");setAuthError("");}}
              style={{
                width:"100%",padding:"6px",
                background:"none",border:"none",
                color:t.textTertiary,
                fontSize:10,fontWeight:800,
                letterSpacing:"0.12em",textTransform:"uppercase",
                cursor:"pointer",
              }}>
              ← Back to login
            </button>
          </div>
        )}

        {/* Forgot sent */}
        {authStep==="forgot-sent"&&(
          <div className="fade-up" style={{textAlign:"center",padding:"12px 0 8px"}}>
            <div style={{
              width:52,height:52,borderRadius:"50%",
              background:t.greenSubtle,border:"1px solid "+t.green+"44",
              display:"flex",alignItems:"center",justifyContent:"center",
              margin:"0 auto 16px",fontSize:24,color:t.green,fontWeight:800,
            }}>✓</div>
            <div style={{
              fontSize:9,fontWeight:800,letterSpacing:"0.16em",
              textTransform:"uppercase",color:t.textTertiary,marginBottom:8,
            }}>Sent</div>
            <h2 style={{
              fontSize:22,fontWeight:800,color:t.text,
              margin:0,marginBottom:10,letterSpacing:"-0.6px",lineHeight:1.05,
            }}>Check your email</h2>
            <p style={{
              fontSize:13,color:t.textSecondary,
              lineHeight:1.6,marginBottom:24,letterSpacing:"-0.1px",
            }}>
              We sent a reset link to <strong style={{color:t.text}}>{authEmail}</strong>. Check your inbox and follow the link.
            </p>
            <button
              onClick={function(){setShowAuth(false);setAuthStep("choose");setAuthEmail("");setAuthError("");}}
              style={primaryBtn}>
              Done
            </button>
          </div>
        )}

        {/* Set new password */}
        {authStep==="set-password"&&(
          <div className="fade-up">
            <div style={{
              width:36,height:36,borderRadius:9,background:t.accent,
              display:"flex",alignItems:"center",justifyContent:"center",
              fontSize:13,fontWeight:800,color:"#fff",marginBottom:14,
              letterSpacing:"0.04em",
            }}>CS</div>
            <div style={{
              fontSize:9,fontWeight:800,letterSpacing:"0.16em",
              textTransform:"uppercase",color:t.textTertiary,marginBottom:6,
            }}>Set password</div>
            <h2 style={{
              fontSize:26,fontWeight:800,color:t.text,
              margin:0,marginBottom:6,letterSpacing:"-0.8px",lineHeight:1.05,
            }}>New password</h2>
            <p style={{
              fontSize:13,color:t.textSecondary,
              margin:0,marginBottom:22,lineHeight:1.5,letterSpacing:"-0.1px",
            }}>Choose a new password for your account.</p>
            <div style={{marginBottom:14}}>
              <label style={labelStyle}>New password</label>
              <input type="password" value={authNewPassword} placeholder="Min 6 characters"
                onChange={function(e){setAuthNewPassword(e.target.value);setAuthFieldErrors(function(f){return Object.assign({},f,{np:null});});}}
                style={Object.assign({},iStyle,{borderColor:authFieldErrors.np?t.red:t.border})}/>
              {authFieldErrors.np&&<div style={fieldErrorStyle}>{authFieldErrors.np}</div>}
            </div>
            <div style={{marginBottom:20}}>
              <label style={labelStyle}>Confirm password</label>
              <input type="password" value={authNewPassword2} placeholder="Repeat password"
                onChange={function(e){setAuthNewPassword2(e.target.value);setAuthFieldErrors(function(f){return Object.assign({},f,{np2:null});});}}
                style={Object.assign({},iStyle,{borderColor:authFieldErrors.np2?t.red:t.border})}/>
              {authFieldErrors.np2&&<div style={fieldErrorStyle}>{authFieldErrors.np2}</div>}
            </div>
            <ErrorStrip msg={authError}/>
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
              style={Object.assign({}, primaryBtn, { opacity: authLoading?0.65:1 })}>
              {authLoading?"Updating…":"Update password"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
