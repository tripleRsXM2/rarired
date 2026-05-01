// src/features/auth/components/onboarding/atoms.jsx
//
// Shared visual atoms for the new onboarding flow. All components take a `T`
// theme-tokens object (see OnboardingFlow.jsx for the locked palette) so the
// onboarding skin stays isolated from the app's main theme system. We use
// inline styles only — no CSS class dependencies — and SVG line-art icons
// per the project's no-emoji-as-icon rule.
import { useState, forwardRef } from "react";

// Primary CTA — black pill with white text. Press/hover micro-animations
// match the design source (transform 180ms cubic-bezier(.2,.8,.2,1)).
export function PrimaryButton({ children, disabled, onClick, T, full = true, secondary = false, type = "button" }) {
  const [hover, setHover] = useState(false);
  const [press, setPress] = useState(false);
  const bg = secondary ? T.surface2 : T.fg;
  const fg = secondary ? T.fg : T.bg;
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => { setHover(false); setPress(false); }}
      onMouseDown={() => setPress(true)}
      onMouseUp={() => setPress(false)}
      style={{
        appearance: "none", border: 0, cursor: disabled ? "default" : "pointer",
        width: full ? "100%" : "auto",
        padding: "18px 24px",
        background: disabled ? T.muted : bg,
        color: disabled ? T.bg : fg,
        fontFamily: T.font, fontSize: 17, fontWeight: 600, letterSpacing: "-0.01em",
        borderRadius: 999,
        transition: "transform 180ms cubic-bezier(.2,.8,.2,1), opacity 180ms, background 180ms",
        transform: press && !disabled ? "scale(0.97)" : hover && !disabled ? "scale(1.02)" : "scale(1)",
        opacity: disabled ? 0.55 : 1,
      }}
    >
      {children}
    </button>
  );
}

export function GhostButton({ children, onClick, T, type = "button" }) {
  return (
    <button
      type={type}
      onClick={onClick}
      style={{
        appearance: "none", border: 0, background: "transparent",
        color: T.muted, cursor: "pointer",
        fontFamily: T.font, fontSize: 15, fontWeight: 500,
        padding: "10px 12px",
      }}
    >
      {children}
    </button>
  );
}

// Underline-style large input. Used for first/last name and (in a smaller
// variant via fontSize prop) numeric UTR.
export const BigInput = forwardRef(function BigInput(
  { value, onChange, placeholder, T, type = "text", autoComplete, fontSize = 28, ariaLabel },
  ref,
) {
  const [focus, setFocus] = useState(false);
  return (
    <div style={{
      borderBottom: `1.5px solid ${focus ? T.fg : T.line}`,
      transition: "border-color 200ms",
      paddingBottom: 6,
    }}>
      <input
        ref={ref}
        type={type}
        value={value}
        placeholder={placeholder}
        autoComplete={autoComplete}
        aria-label={ariaLabel || placeholder}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setFocus(true)}
        onBlur={() => setFocus(false)}
        style={{
          width: "100%", appearance: "none", border: 0, outline: 0, background: "transparent",
          fontFamily: T.fontDisplay, fontSize: fontSize, fontWeight: 500, letterSpacing: "-0.02em",
          color: T.fg, padding: "8px 0",
        }}
      />
    </div>
  );
});

// Title block at top of most screens — eyebrow (small caps), display title,
// optional muted subtitle.
export function ScreenHeader({ eyebrow, title, subtitle, T }) {
  return (
    <div style={{ paddingTop: 8 }}>
      {eyebrow && (
        <div style={{
          fontFamily: T.font, fontSize: 12, fontWeight: 600, letterSpacing: "0.14em",
          textTransform: "uppercase", color: T.accent, marginBottom: 14,
        }}>{eyebrow}</div>
      )}
      <h1 style={{
        fontFamily: T.fontDisplay, fontWeight: 600, fontSize: 34, lineHeight: 1.08,
        letterSpacing: "-0.025em", margin: 0, color: T.fg,
      }}>{title}</h1>
      {subtitle && (
        <p style={{
          fontFamily: T.font, fontSize: 16, lineHeight: 1.4, color: T.muted,
          margin: "12px 0 0", maxWidth: 340,
        }}>{subtitle}</p>
      )}
    </div>
  );
}

// Soft entrance — applies on key change. Uses CSS animation defined in
// OnboardingFlow.jsx via injected style block.
export function ScreenIn({ children, k }) {
  return (
    <div
      key={k}
      className="cs-screen-in"
      style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}
    >
      {children}
    </div>
  );
}

// Top chrome — back button + brand label + segmented progress bar.
export function TopChrome({ step, total, kind = "segmented", onBack, T, hideBack }) {
  return (
    <div style={{ padding: "8px 0 12px", display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 18px", height: 40 }}>
        {!hideBack ? (
          <button
            type="button"
            onClick={onBack}
            aria-label="Back"
            style={{
              appearance: "none", border: 0, background: "transparent", cursor: "pointer",
              width: 40, height: 40, borderRadius: 999, display: "flex", alignItems: "center", justifyContent: "center",
            }}
          >
            <svg width="18" height="18" viewBox="0 0 18 18">
              <path d="M11 4 L 6 9 L 11 14" stroke={T.fg} strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        ) : <div style={{ width: 40 }}/>}
        <div style={{ fontFamily: T.font, fontSize: 12, fontWeight: 600, letterSpacing: "0.18em", textTransform: "uppercase", color: T.muted }}>
          CourtSync
        </div>
        <div style={{ width: 40 }}/>
      </div>
      <Progress step={step} total={total} kind={kind} T={T}/>
    </div>
  );
}

export function Progress({ step, total, kind, T }) {
  if (kind === "none") return <div style={{ height: 4 }}/>;
  if (kind === "segmented") {
    return (
      <div style={{ display: "flex", gap: 4, padding: "0 28px" }}>
        {Array.from({ length: total }).map((_, i) => (
          <div key={i} style={{ flex: 1, height: 3, borderRadius: 2, background: T.line2, overflow: "hidden" }}>
            <div style={{
              height: "100%",
              width: i <= step ? "100%" : "0%",
              background: T.fg,
              transition: "width 420ms cubic-bezier(.2,.8,.2,1)",
            }}/>
          </div>
        ))}
      </div>
    );
  }
  // Fallback (filling bar).
  const pct = ((step + 1) / total) * 100;
  return (
    <div style={{ padding: "0 28px" }}>
      <div style={{ height: 3, background: T.line2, borderRadius: 2, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${pct}%`, background: T.fg, transition: "width 480ms cubic-bezier(.2,.8,.2,1)" }}/>
      </div>
    </div>
  );
}

// Hairline error strip (re-used by EmailPassword + SignIn). Mirrors AuthModal's
// editorial 0.16em uppercase eyebrow + body copy pattern.
export function ErrorStrip({ msg, T }) {
  if (!msg) return null;
  return (
    <div style={{
      marginTop: 12, marginBottom: 4,
      paddingTop: 10, paddingBottom: 10,
      borderTop: `1px solid ${T.line2}`,
      display: "flex", gap: 10, alignItems: "baseline",
    }}>
      <span style={{
        fontSize: 9, fontWeight: 700, letterSpacing: "0.16em",
        textTransform: "uppercase", color: "#E11D48", flexShrink: 0,
        fontFamily: T.font,
      }}>Error</span>
      <span style={{
        fontSize: 13, color: T.fg,
        lineHeight: 1.4, fontFamily: T.font,
      }}>{msg}</span>
    </div>
  );
}

// Brand mark used on Welcome screen.
export function BrandMark({ T, size = 32 }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: 999,
      background: T.accent, display: "flex", alignItems: "center", justifyContent: "center",
      boxShadow: `0 0 0 1px ${T.fg}`,
    }}>
      <svg width={size * 0.55} height={size * 0.55} viewBox="0 0 16 16" fill="none">
        <path d="M2 8 C 4 4, 12 4, 14 8 C 12 12, 4 12, 2 8 Z" stroke={T.fg} strokeWidth="1.2" fill="none"/>
        <path d="M2.5 6.5 Q 8 9, 13.5 6.5" stroke={T.fg} strokeWidth="0.9" fill="none" strokeLinecap="round"/>
      </svg>
    </div>
  );
}
