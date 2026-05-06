// OnboardingFlow — replaces the launch-time auth experience for logged-out
// users with a 9-screen progressive flow:
//   Welcome → Name → EmailPassword → Age → Level → Intent → Zone → Courts → Availability → Aha
//
// Wiring rules:
//   • Auth: drives supabase.auth.signUp at the EmailPassword step (so the
//     remaining screens write to the real profile via upsertProfile).
//   • Profile: each screen advance writes a small patch through
//     upsertProfile so a partial-completion user still has the data they
//     entered. Final commit on Aha sets cs-onb-done.
//   • Persistence: state + step are mirrored to localStorage under cs-onb
//     so a refresh doesn't lose progress.
//   • Skin: a LOCAL theme tokens object T (light palette only) — does NOT
//     extend the app's `t` theme. Mounted via inline <link>/<style> so we
//     don't touch index.html.
//   • Returning users: if cs-onb-done is set in localStorage but the user
//     is logged out, render only the SignIn screen (the user has been
//     here before — don't make them re-walk the questionnaire).
//   • PASSWORD_RECOVERY: when the auth controller flips authStep to
//     "set-password", the SetPassword overlay renders on top of whatever
//     screen is active.
import { useEffect, useMemo, useRef, useState } from "react";
import { upsertProfile } from "../../../profile/services/profileService.js";
import { initials as avInitials } from "../../../../lib/utils/avatar.js";
import { TopChrome, ScreenIn, BrandMark } from "./atoms.jsx";

import Welcome        from "./screens/Welcome.jsx";
import Name           from "./screens/Name.jsx";
import EmailPassword  from "./screens/EmailPassword.jsx";
import Age            from "./screens/Age.jsx";
import Level          from "./screens/Level.jsx";
import Intent         from "./screens/Intent.jsx";
import Zone           from "./screens/Zone.jsx";
import Courts         from "./screens/Courts.jsx";
import Availability, { availChipsToProfileShape } from "./screens/Availability.jsx";
import Aha            from "./screens/Aha.jsx";
import SignIn         from "./screens/SignIn.jsx";
import SetPassword    from "./screens/SetPassword.jsx";
import VerifyEmail    from "./screens/VerifyEmail.jsx";

// ─────────────────────────────────────────────────────────────
// Local theme tokens — design source of truth (light only).
// Kept LOCAL on purpose. Don't extend the app theme system.
// ─────────────────────────────────────────────────────────────
const T = {
  bg:       "#FAFAF7",
  surface:  "#FFFFFF",
  surface2: "#F0EFEB",
  fg:       "#0A0A0A",
  muted:    "#787569",
  line:     "rgba(10,10,10,0.07)",
  line2:    "rgba(10,10,10,0.16)",
  // User feedback: 'the green colour is not working. make all the
  // green orange.' Swapped from the design's lime #DFFF3F to the
  // design's own swatch-palette orange #FF5A1F. One token drives
  // every accent surface — buttons, glyphs, dots, gradient stops,
  // pulses — across all 9 screens.
  accent:   "#FF5A1F",
  font:        "'Inter Tight', ui-sans-serif, system-ui, -apple-system, sans-serif",
  fontDisplay: "'Bricolage Grotesque', ui-sans-serif, system-ui, -apple-system, sans-serif",
};

const STEPS = ["welcome", "name", "email", "age", "level", "intent", "zone", "courts", "avail", "aha"];
const PROGRESS_STEPS = ["name", "email", "age", "level", "intent", "zone", "courts", "avail"];
const STORAGE_KEY = "cs-onb";
const DONE_KEY    = "cs-onb-done";
// User-started flag — set the moment they tap "Get started" on Welcome.
// App.jsx's gate uses this to keep the flow mounted across the
// signUp → SIGNED_IN re-render (auth.authUser flips truthy mid-flow).
// Without this guard, a Supabase project with email-confirmation
// disabled would unmount the flow at EmailPassword's success and
// leave the user in the half-onboarded main shell with default
// profile values. Stays set until cs-onb-done is set OR the user
// explicitly bails (we don't currently have a cancel path).
const STARTED_KEY = "cs-onb-started";

const INITIAL_STATE = {
  first: "", last: "",
  email: "", password: "",
  age: "",
  level: "", utr: "",
  intent: [],
  zone: "",
  courts: [],
  avail: [],
};

// Inject Google Fonts (Bricolage Grotesque + Inter Tight) + the screen-in
// keyframe + pulse keyframe once. Safe to call repeatedly — we keep an
// id-tagged <link>/<style> so React strict-mode double-mount is harmless.
function ensureFonts() {
  if (typeof document === "undefined") return;
  const linkId = "cs-onb-fonts";
  if (!document.getElementById(linkId)) {
    const preconnect1 = document.createElement("link");
    preconnect1.rel = "preconnect"; preconnect1.href = "https://fonts.googleapis.com"; preconnect1.id = linkId + "-pre1";
    document.head.appendChild(preconnect1);
    const preconnect2 = document.createElement("link");
    preconnect2.rel = "preconnect"; preconnect2.href = "https://fonts.gstatic.com"; preconnect2.crossOrigin = ""; preconnect2.id = linkId + "-pre2";
    document.head.appendChild(preconnect2);
    const link = document.createElement("link");
    link.id = linkId;
    link.rel = "stylesheet";
    link.href = "https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,500;12..96,600;12..96,700&family=Inter+Tight:wght@400;500;600;700&display=swap";
    document.head.appendChild(link);
  }
  const styleId = "cs-onb-style";
  if (!document.getElementById(styleId)) {
    const s = document.createElement("style");
    s.id = styleId;
    s.textContent = `
@keyframes csOnbScreenIn {
  from { opacity: 0; transform: translateY(8px); }
  to   { opacity: 1; transform: translateY(0); }
}
@keyframes csOnbPulseRing {
  0%   { transform: scale(0.8); opacity: 0.5; }
  100% { transform: scale(2.4); opacity: 0; }
}
.cs-screen-in { animation: csOnbScreenIn 320ms cubic-bezier(.2,.8,.2,1) both; }
.cs-onb-root { color: ${T.fg}; }
.cs-onb-card input::placeholder { color: ${T.muted}; opacity: 1; }
`;
    document.head.appendChild(s);
  }
}

export default function OnboardingFlow({ onComplete, auth, forceSignIn = false, onOpenProfile, refreshProfile }) {
  // The auth controller is owned by App.jsx; it's passed in here so we
  // share one Supabase subscription / one set of authStep state. The
  // shape we use:
  //   auth.authUser            — null until SIGNED_IN
  //   auth.authStep            — "set-password" when PASSWORD_RECOVERY fires
  //   auth.setAuthStep         — to clear set-password after we update pw
  // We never need showAuth here (the legacy AuthModal stays mounted but
  // hidden whenever OnboardingFlow is on screen).

  // Viewport-width tracker for the desktop layout (sticky top nav vs
  // mobile inline TopChrome).
  const wide = useIsWide();

  const [stepIdx, setStepIdx] = useState(0);
  const [state, setState] = useState(INITIAL_STATE);
  // If forceSignIn is set (returning user), the SignIn screen is the
  // default view — they shouldn't re-walk the questionnaire.
  const [showSignIn, setShowSignIn] = useState(forceSignIn);
  const [busy, setBusy] = useState(false);
  // Verify-email terminal screen. After Aha's CTA the user lands here
  // before being kicked to SignIn — gives them an explicit "check your
  // inbox" beat instead of dumping them into the app with an
  // unverified address. User feedback: 'when you get to the get
  // started or I'll explore on my own it gets stuck, it should go
  // back to a page: where it says verify your email + go back to login.'
  const [showVerifyEmail, setShowVerifyEmail] = useState(false);
  // Optimistic-signup error rollback: if the user clicks Continue on
  // EmailPassword and we advance immediately while signUp is still in
  // flight, we need a path back to that screen if the signUp errors
  // out (email already exists, weak password the client missed, etc.).
  // The error message is surfaced as a prop to EmailPassword.
  const [signupError, setSignupError] = useState("");
  function onSignupPending(promise, mapErr) {
    setSignupError("");
    promise.then((r) => {
      if (r && r.error) {
        setSignupError((mapErr || ((m) => m))(r.error.message));
        setStepIdx(STEPS.indexOf("email"));
      }
    }).catch((e) => {
      setSignupError((mapErr || ((m) => m))(e && e.message));
      setStepIdx(STEPS.indexOf("email"));
    });
  }
  const hydrated = useRef(false);

  useEffect(() => { ensureFonts(); }, []);

  // Hydrate from localStorage. Run once.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const j = JSON.parse(raw);
        if (j && j.state) setState((s) => ({ ...s, ...j.state, password: "" })); // never persist password
        if (j && typeof j.stepIdx === "number") setStepIdx(j.stepIdx);
      }
    } catch (_) {}
    hydrated.current = true;
  }, []);

  // Persist on change (post-hydration only).
  useEffect(() => {
    if (!hydrated.current) return;
    try {
      // Strip password before persisting; restoring an unencrypted password
      // is a bad idea on a shared device.
      const safeState = { ...state, password: "" };
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ state: safeState, stepIdx }));
    } catch (_) {}
  }, [state, stepIdx]);

  // App.jsx's coordRef.bootstrap() loads the profile when SIGNED_IN fires.
  // We rely on that — no need to re-load here. Each screen's persistPatch
  // call writes through to the same row regardless.

  // The Name screen runs BEFORE EmailPassword (i.e. before the user is
  // authed) so its persistPatch is a no-op. The moment SIGNED_IN flips
  // auth.authUser truthy, write the FULL initial profile with the name
  // overlaid — every NOT NULL column seeded so subsequent per-screen
  // persistPatch calls update specific fields without races.
  //
  // This races against useCurrentUser.loadProfile which ALSO wants to
  // create a default row on first SIGNED_IN. We win the race by being
  // wired directly to the auth.authUser dep here (synchronous on
  // re-render), and loadProfile's defaults-upsert is suppressed via
  // the `cs-onb-started` localStorage flag (see useCurrentUser:46).
  // Best-effort — failures don't block the flow; finishOnboarding's
  // final patch will re-attempt the comprehensive write.
  // Runs once per session because flushedRef tracks auth.authUser.id.
  const flushedRef = useRef(false);
  useEffect(() => {
    if (!auth.authUser || !auth.authUser.id) { flushedRef.current = false; return; }
    if (flushedRef.current) return;
    flushedRef.current = true;
    const fullName = `${(state.first || "").trim()} ${(state.last || "").trim()}`.trim();
    const fallback = (auth.authUser.email || "Player").split("@")[0];
    const displayName = fullName || fallback;
    const init = avInitials(displayName);
    // Single atomic upsert with every required column. Mirrors
    // defaultProfile() in profileService.js — keep these in sync.
    upsertProfile({
      id: auth.authUser.id,
      name: displayName,
      suburb: "",
      skill: "Intermediate 1",
      style: "All-Court",
      bio: "",
      avatar: init,
      avatar_url: null,
      availability: {},
      ranking_points: 1000,
      wins: 0, losses: 0, matches_played: 0,
      streak_count: 0, streak_type: null,
      home_zone: null,
    }).catch(() => {});
  }, [auth.authUser && auth.authUser.id, state.first, state.last]);

  const set = (patch) => setState((s) => ({ ...s, ...patch }));
  const next = () => {
    // First time we leave Welcome → mark the flow as in-progress so
    // App.jsx's gate keeps us mounted across the SIGNED_IN flip after
    // EmailPassword's signUp resolves. Idempotent — safe to call on
    // every advance; we only need it set once.
    try { localStorage.setItem(STARTED_KEY, "1"); } catch (_) {}
    setStepIdx((i) => Math.min(STEPS.length - 1, i + 1));
  };
  const back = () => setStepIdx((i) => Math.max(0, i - 1));

  // After certain screens, persist a tiny patch to profiles. Best-effort —
  // if the user isn't yet authenticated (pre-EmailPassword), we no-op and
  // wait for the final write at finishOnboarding.
  async function persistPatch(patch) {
    if (!auth.authUser || !auth.authUser.id) return;
    try {
      await upsertProfile({ id: auth.authUser.id, ...patch });
    } catch (e) {
      // Don't block the flow on a write hiccup. Final commit will retry.
      console.warn("[OnboardingFlow] partial persist failed:", e && e.message);
    }
  }

  // Step transitions wrap `next` and fan out side-effects.
  async function advanceFromAge() { await persistPatch({ age_bracket: state.age }); next(); }
  async function advanceFromLevel(){
    await persistPatch({ skill: state.level });
    try { if (state.utr) localStorage.setItem("cs-onb-utr", state.utr); } catch (_) {}
    next();
  }
  async function advanceFromIntent(){
    try { localStorage.setItem("cs-onb-intent", JSON.stringify(state.intent || [])); } catch (_) {}
    next();
  }
  async function advanceFromZone()  { await persistPatch({ home_zone: state.zone }); next(); }
  async function advanceFromCourts(){ await persistPatch({ played_courts: state.courts }); next(); }
  async function advanceFromAvail() { await persistPatch({ availability: availChipsToProfileShape(state.avail) }); next(); }

  async function finishOnboarding() {
    // Bail-safe path: if we somehow reached the finish CTA without a
    // signed-in user (email-confirmation-required project, signUp
    // pending, browser wiped session, etc.) we ALWAYS produce a
    // visible screen transition. Land on VerifyEmail directly — its
    // 'Back to sign in' button signs out (no-op if already unauth)
    // and shows the SignIn screen. User feedback: 'when I press get
    // started or I'll explore on my own, nothing happens. I thought
    // its supposed to take you to a different page'. The previous
    // bail called onComplete which navigated to /home — if the user
    // was already on /home (most common entry point) the URL didn't
    // change and the gate-flip felt invisible.
    if (!auth.authUser) {
      try {
        localStorage.setItem(DONE_KEY, "1");
        // Deliberately KEEP cs-onb (the typed state). On email-confirm-
        // required projects, auth.authUser is null all the way through
        // onboarding, so flushedRef and persistPatch never wrote anything
        // to the profile row. After the user confirms their email and
        // signs in, useCurrentUser.loadProfile picks up cs-onb and
        // replays every typed field (name, age, skill, zone, courts,
        // availability) into the profile, then clears the stash. User
        // feedback: 'after I login for the first time it says your
        // name. The name given at the onboarding should be used here.'
        localStorage.removeItem(STARTED_KEY);
      } catch (_) {}
      setShowVerifyEmail(true);
      return;
    }
    setBusy(true);
    const fullName = `${(state.first || "").trim()} ${(state.last || "").trim()}`.trim();
    const init = avInitials(fullName || auth.authUser.email || "?");
    // Comprehensive final patch — every onboarding field is included
    // so a user who skipped any earlier persistPatch (e.g. because
    // signup hadn't completed yet) still gets every field saved here.
    // Empty fields are omitted so we don't blank out values that were
    // populated by an earlier persistPatch call.
    const patch = {
      id: auth.authUser.id,
      ...(fullName ? { name: fullName } : {}),
      avatar: init,
      ...(state.age   ? { age_bracket:   state.age }   : {}),
      ...(state.level ? { skill:         state.level } : {}),
      ...(state.zone  ? { home_zone:     state.zone }  : {}),
      ...(state.courts && state.courts.length ? { played_courts: state.courts } : {}),
      ...(state.avail  && state.avail.length  ? { availability:  availChipsToProfileShape(state.avail) } : {}),
    };
    try {
      const r = await upsertProfile(patch);
      if (r && r.error) {
        console.warn("[OnboardingFlow] final persist returned error:", r.error.message);
      }
    } catch (e) {
      console.warn("[OnboardingFlow] final persist threw:", e && e.message);
    }
    // Refresh in-memory profile state so Settings reflects what the
    // user just typed. Without this, useCurrentUser.profile still
    // holds the bootstrap defaults written when SIGNED_IN fired
    // (loadProfile created a defaults row because the user was new).
    if (refreshProfile && auth.authUser && auth.authUser.id) {
      try { await refreshProfile(auth.authUser.id); } catch (_) {}
    }
    setBusy(false);
    try {
      localStorage.setItem(DONE_KEY, "1");
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(STARTED_KEY);
    } catch (_) {}
    // Land on the verify-email terminal screen instead of immediately
    // closing the flow. Two CTAs there: 'Back to sign in' (signs out,
    // shows SignIn) and 'Resend email'. When the user clicks back, we
    // keep them inside the OnboardingFlow shell (showSignIn=true) so
    // the existing render branch handles it cleanly.
    setShowVerifyEmail(true);
  }

  // Render the right screen for the current step, with all wiring threaded
  // in. We pass the SAME (state, set, T) to every screen for consistency.
  const screen = useMemo(() => {
    const stepName = STEPS[stepIdx];
    const props = { state, set, T };
    if (stepName === "welcome") return <Welcome T={T} next={() => next()} onSignIn={() => setShowSignIn(true)} />;
    if (stepName === "name")    return <Name    {...props} next={() => next()} />;
    if (stepName === "email")   return <EmailPassword {...props} next={() => next()} onSignupPending={onSignupPending} signupError={signupError} />;
    if (stepName === "age")     return <Age     {...props} next={advanceFromAge} />;
    if (stepName === "level")   return <Level   {...props} next={advanceFromLevel} />;
    if (stepName === "intent")  return <Intent  {...props} next={advanceFromIntent} />;
    if (stepName === "zone")    return <Zone    {...props} next={advanceFromZone} />;
    if (stepName === "courts")  return <Courts  {...props} next={advanceFromCourts} />;
    if (stepName === "avail")   return <Availability {...props} next={advanceFromAvail} />;
    if (stepName === "aha")     return <Aha state={state} T={T} busy={busy} onFinish={finishOnboarding} onSkip={finishOnboarding} onOpenProfile={onOpenProfile} viewerId={auth.authUser && auth.authUser.id} />;
    return null;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepIdx, state, busy, signupError, auth.authUser && auth.authUser.id]);

  // Helper: build the desktop top nav (or null on mobile / for views
  // where the brand-only top isn't useful). Brand-only on welcome /
  // signin / verify / set-password (no progress, no back); full nav
  // on the main flow steps.
  function deskNav(opts) {
    if (!wide) return null;
    return (
      <TopNavDesktop
        progressIdx={(opts && opts.progressIdx) != null ? opts.progressIdx : -1}
        total={(opts && opts.total) != null ? opts.total : 0}
        canBack={!!(opts && opts.canBack)}
        onBack={opts && opts.onBack}
      />
    );
  }

  // Verify-email terminal — takes over regardless of step. Reached
  // from finishOnboarding() after the final upsert succeeds. Two
  // outcomes: "Back to sign in" (signs out, shows SignIn screen),
  // "Resend email" (calls supabase.auth.resend).
  if (showVerifyEmail) {
    return (
      <Frame topNav={deskNav()}>
        <VerifyEmail
          T={T}
          email={(auth.authUser && auth.authUser.email) || state.email || ""}
          onBackToSignIn={() => {
            setShowVerifyEmail(false);
            setShowSignIn(true);
          }}
        />
      </Frame>
    );
  }

  // Sign-in path takes over the whole frame.
  if (showSignIn) {
    return (
      <Frame topNav={deskNav()}>
        {auth.authStep === "set-password"
          ? <SetPassword T={T} onDone={() => { auth.setAuthStep("choose"); }} />
          : (
            <SignIn
              T={T}
              // Returning users (forceSignIn) have nowhere to go "back"
              // to — they didn't enter via Welcome.
              onBack={forceSignIn ? null : () => setShowSignIn(false)}
              onCreateAccount={() => { setShowSignIn(false); setStepIdx(STEPS.indexOf("name")); }}
            />
          )
        }
      </Frame>
    );
  }

  const isWelcome = STEPS[stepIdx] === "welcome";
  const isAha = STEPS[stepIdx] === "aha";
  const progressIdx = PROGRESS_STEPS.indexOf(STEPS[stepIdx]);

  // PASSWORD_RECOVERY: takes over regardless of where the user is.
  if (auth.authStep === "set-password") {
    return (
      <Frame topNav={deskNav()}>
        <SetPassword T={T} onDone={() => { auth.setAuthStep("choose"); }} />
      </Frame>
    );
  }

  return (
    <Frame topNav={deskNav({ progressIdx: progressIdx, total: PROGRESS_STEPS.length, canBack: !isWelcome && !isAha, onBack: back })}>
      {/* Mobile-only: inline TopChrome. Desktop has its own sticky
          top nav (TopNavDesktop) and renders the screen directly
          without the inline back+progress strip. */}
      {!wide && !isWelcome && (
        <TopChrome
          step={Math.max(0, progressIdx)}
          total={PROGRESS_STEPS.length}
          kind={isAha ? "none" : "segmented"}
          onBack={back}
          T={T}
          hideBack={isAha}
        />
      )}
      <div style={{ flex: 1, position: "relative", minHeight: 0, display: "flex", flexDirection: "column" }}>
        <ScreenIn k={STEPS[stepIdx]}>
          {screen}
        </ScreenIn>
      </div>
    </Frame>
  );
}

// Outer page frame — two layouts via matchMedia (live, not mount-once):
//   • Mobile (<600px): full-screen card, edge-to-edge. The TopChrome
//     atom inside the screen handles back+progress.
//   • Desktop (≥600px): full-viewport page with a sticky top nav
//     (brand + segmented progress + step counter + back) and a
//     centered single-column content area below. Matches the design
//     handoff (CourtSync Onboarding Web.html) — left pane only; the
//     design's right "art" pane is intentionally dropped per user
//     ("just copy the screen left screen. The screen right screen
//     is not needed").
function useIsWide() {
  const [wide, setWide] = useState(function(){
    if (typeof window === "undefined") return false;
    return window.matchMedia && window.matchMedia("(min-width: 600px)").matches;
  });
  useEffect(function(){
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mql = window.matchMedia("(min-width: 600px)");
    const onChange = function(e){ setWide(e.matches); };
    if (mql.addEventListener) mql.addEventListener("change", onChange);
    else if (mql.addListener) mql.addListener(onChange);
    return function(){
      if (mql.removeEventListener) mql.removeEventListener("change", onChange);
      else if (mql.removeListener) mql.removeListener(onChange);
    };
  }, []);
  return wide;
}

// Desktop top nav — sticky, full viewport width. Brand on the left,
// progress segmented bar + step counter in the centre, back button
// on the right. Hidden when none of those slots have content.
function TopNavDesktop({ progressIdx = -1, total = 0, canBack = false, onBack }) {
  const showProgress = progressIdx >= 0 && total > 0;
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 24,
      padding: "20px 40px",
      borderBottom: `1px solid ${T.line}`,
      background: T.bg,
      position: "sticky", top: 0, zIndex: 10,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <BrandMark T={T} size={26}/>
        <span style={{
          fontFamily: T.fontDisplay, fontSize: 18, fontWeight: 700,
          letterSpacing: "-0.015em", color: T.fg,
        }}>CourtSync</span>
      </div>
      <div style={{ flex: 1 }}/>
      {showProgress && (
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{ display: "flex", gap: 4 }}>
            {Array.from({ length: total }).map(function(_, i){
              const filled = i <= progressIdx;
              return (
                <div key={i} style={{
                  width: filled ? 28 : 18, height: 4, borderRadius: 2,
                  background: filled ? T.fg : T.line2,
                  transition: "all 200ms cubic-bezier(.2,.8,.2,1)",
                }}/>
              );
            })}
          </div>
          <div style={{
            fontFamily: T.fontMono || "ui-monospace, monospace",
            fontSize: 12, fontWeight: 600, letterSpacing: "0.08em", color: T.muted,
          }}>
            {String(progressIdx + 1).padStart(2, "0")} / {String(total).padStart(2, "0")}
          </div>
        </div>
      )}
      {canBack && (
        <button type="button" onClick={onBack} style={{
          appearance: "none", cursor: "pointer",
          padding: "8px 14px", borderRadius: 999,
          background: "transparent", border: `1px solid ${T.line2}`, color: T.fg,
          fontFamily: T.font, fontSize: 13, fontWeight: 500,
          display: "inline-flex", alignItems: "center", gap: 6,
        }}>
          <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
            <path d="M8 2 L 4 6 L 8 10" stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          Back
        </button>
      )}
    </div>
  );
}

function Frame({ children, topNav }) {
  const wide = useIsWide();
  if (wide) {
    return (
      <div className="cs-onb-root" style={{
        minHeight: "100vh", width: "100%",
        background: T.bg, color: T.fg,
        display: "flex", flexDirection: "column",
      }}>
        {topNav}
        <div style={{
          flex: 1,
          display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "flex-start",
          padding: "40px 56px",
        }}>
          <div style={{
            width: "100%", maxWidth: 480,
            display: "flex", flexDirection: "column",
            minHeight: 540,
          }}>
            {children}
          </div>
        </div>
      </div>
    );
  }
  // Mobile: full-screen card.
  return (
    <div className="cs-onb-root" style={{
      minHeight: "100vh", width: "100%",
      background: T.bg, color: T.fg,
      display: "flex", flexDirection: "column",
    }}>
      <div className="cs-onb-card" style={{
        width: "100%", maxWidth: "none",
        minHeight: "100vh",
        display: "flex", flexDirection: "column",
        background: T.bg, color: T.fg,
        paddingTop:    "env(safe-area-inset-top, 0px)",
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
      }}>
        {children}
      </div>
    </div>
  );
}

// Helper for App.jsx to know whether the user has already completed
// onboarding once. Cheap — synchronous localStorage read.
export function didCompleteOnboarding() {
  try { return localStorage.getItem(DONE_KEY) === "1"; }
  catch (_) { return false; }
}
