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
import { TopChrome, ScreenIn } from "./atoms.jsx";

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

export default function OnboardingFlow({ onComplete, auth, forceSignIn = false, onOpenProfile }) {
  // The auth controller is owned by App.jsx; it's passed in here so we
  // share one Supabase subscription / one set of authStep state. The
  // shape we use:
  //   auth.authUser            — null until SIGNED_IN
  //   auth.authStep            — "set-password" when PASSWORD_RECOVERY fires
  //   auth.setAuthStep         — to clear set-password after we update pw
  // We never need showAuth here (the legacy AuthModal stays mounted but
  // hidden whenever OnboardingFlow is on screen).

  const [stepIdx, setStepIdx] = useState(0);
  const [state, setState] = useState(INITIAL_STATE);
  // If forceSignIn is set (returning user), the SignIn screen is the
  // default view — they shouldn't re-walk the questionnaire.
  const [showSignIn, setShowSignIn] = useState(forceSignIn);
  const [busy, setBusy] = useState(false);
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

  const set = (patch) => setState((s) => ({ ...s, ...patch }));
  const next = () => setStepIdx((i) => Math.min(STEPS.length - 1, i + 1));
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
    if (!auth.authUser) {
      // Shouldn't happen — EmailPassword step gated; bail safely.
      try { localStorage.setItem(DONE_KEY, "1"); } catch (_) {}
      if (onComplete) onComplete();
      return;
    }
    setBusy(true);
    const fullName = `${(state.first || "").trim()} ${(state.last || "").trim()}`.trim();
    const init = avInitials(fullName || auth.authUser.email || "?");
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
      await upsertProfile(patch);
    } catch (e) {
      console.warn("[OnboardingFlow] final persist failed:", e && e.message);
    }
    setBusy(false);
    try {
      localStorage.setItem(DONE_KEY, "1");
      localStorage.removeItem(STORAGE_KEY);
    } catch (_) {}
    if (onComplete) onComplete();
  }

  // Render the right screen for the current step, with all wiring threaded
  // in. We pass the SAME (state, set, T) to every screen for consistency.
  const screen = useMemo(() => {
    const stepName = STEPS[stepIdx];
    const props = { state, set, T };
    if (stepName === "welcome") return <Welcome T={T} next={() => next()} onSignIn={() => setShowSignIn(true)} />;
    if (stepName === "name")    return <Name    {...props} next={() => next()} />;
    if (stepName === "email")   return <EmailPassword {...props} next={() => next()} />;
    if (stepName === "age")     return <Age     {...props} next={advanceFromAge} />;
    if (stepName === "level")   return <Level   {...props} next={advanceFromLevel} />;
    if (stepName === "intent")  return <Intent  {...props} next={advanceFromIntent} />;
    if (stepName === "zone")    return <Zone    {...props} next={advanceFromZone} />;
    if (stepName === "courts")  return <Courts  {...props} next={advanceFromCourts} />;
    if (stepName === "avail")   return <Availability {...props} next={advanceFromAvail} />;
    if (stepName === "aha")     return <Aha state={state} T={T} busy={busy} onFinish={finishOnboarding} onSkip={finishOnboarding} onOpenProfile={onOpenProfile} />;
    return null;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepIdx, state, busy]);

  // Sign-in path takes over the whole frame.
  if (showSignIn) {
    return (
      <Frame>
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
      <Frame>
        <SetPassword T={T} onDone={() => { auth.setAuthStep("choose"); }} />
      </Frame>
    );
  }

  return (
    <Frame>
      {!isWelcome && (
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

// Outer page frame — full viewport on mobile, centered card on desktop.
// We do NOT use the design's iOS device frame (it was a tweaks-panel
// preview affordance); the real product fills the screen on mobile and
// nests in a max-width card on desktop.
function Frame({ children }) {
  return (
    <div className="cs-onb-root" style={{
      minHeight: "100vh", width: "100%",
      background: T.bg,
      color: T.fg,
      display: "flex", alignItems: "stretch", justifyContent: "center",
    }}>
      <div className="cs-onb-card" style={{
        width: "100%", maxWidth: 460,
        minHeight: "100vh",
        display: "flex", flexDirection: "column",
        background: T.bg, color: T.fg,
        // Soft shadow only when there's room to "lift" the card off the
        // page background (desktop). On mobile the card fills the screen.
        boxShadow: typeof window !== "undefined" && window.innerWidth >= 600 ? "0 30px 80px rgba(0,0,0,0.06)" : "none",
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
