// Welcome — hero screen; first thing logged-out users see.
import { PrimaryButton, ScreenIn, BrandMark } from "../atoms.jsx";

export default function Welcome({ next, onSignIn, T }) {
  return (
    <ScreenIn k="s0">
      <div style={{ flex: 1, display: "flex", flexDirection: "column", padding: "20px 28px 28px", minHeight: 0 }}>
        {/* Brand mark */}
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <BrandMark T={T} size={28} />
          <span style={{ fontFamily: T.fontDisplay, fontWeight: 600, fontSize: 17, letterSpacing: "-0.01em", color: T.fg }}>
            CourtSync
          </span>
        </div>

        {/* Hero */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", gap: 16 }}>
          <CourtArt T={T} />
          <div style={{ fontFamily: T.font, fontSize: 12, fontWeight: 600, letterSpacing: "0.14em", textTransform: "uppercase", color: T.accent, marginTop: 8 }}>
            Welcome
          </div>
          <h1 style={{
            fontFamily: T.fontDisplay, fontWeight: 600, fontSize: 40, lineHeight: 1.0,
            letterSpacing: "-0.03em", margin: 0, color: T.fg,
          }}>
            Track your tennis.<br/>Find your level.<br/>Play better matches.
          </h1>
          <p style={{ fontFamily: T.font, fontSize: 16, lineHeight: 1.4, color: T.muted, margin: "4px 0 0", maxWidth: 320 }}>
            Built for players who want a real game, not just a hit.
          </p>
        </div>

        {/* CTA */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <PrimaryButton T={T} onClick={next}>Get started</PrimaryButton>
          <div style={{ textAlign: "center", fontFamily: T.font, fontSize: 13, color: T.muted }}>
            Already have an account?{" "}
            <button
              type="button"
              onClick={onSignIn}
              style={{
                appearance: "none", border: 0, background: "transparent", padding: 0, cursor: "pointer",
                color: T.fg, fontWeight: 500, fontFamily: T.font, fontSize: 13,
                textDecoration: "underline",
              }}
            >
              Sign in
            </button>
          </div>
        </div>
      </div>
    </ScreenIn>
  );
}

function CourtArt({ T }) {
  return (
    <svg viewBox="0 0 320 200" style={{ width: "100%", height: "auto", display: "block" }}>
      <defs>
        <linearGradient id="onbCourtGrad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={T.accent} stopOpacity="0.85"/>
          <stop offset="1" stopColor={T.accent} stopOpacity="0.55"/>
        </linearGradient>
      </defs>
      <rect x="20" y="30" width="280" height="140" rx="6" fill="url(#onbCourtGrad)" />
      <rect x="40" y="50" width="240" height="100" rx="2" fill="none" stroke={T.fg} strokeWidth="1.5"/>
      <line x1="160" y1="50" x2="160" y2="150" stroke={T.fg} strokeWidth="1.5"/>
      <line x1="40" y1="100" x2="280" y2="100" stroke={T.fg} strokeWidth="1.5" strokeDasharray="2 4"/>
      <line x1="80" y1="70" x2="240" y2="70" stroke={T.fg} strokeWidth="1.2" opacity="0.6"/>
      <line x1="80" y1="130" x2="240" y2="130" stroke={T.fg} strokeWidth="1.2" opacity="0.6"/>
      <line x1="80" y1="70" x2="80" y2="130" stroke={T.fg} strokeWidth="1.2" opacity="0.6"/>
      <line x1="240" y1="70" x2="240" y2="130" stroke={T.fg} strokeWidth="1.2" opacity="0.6"/>
      <circle cx="200" cy="85" r="5" fill={T.bg} stroke={T.fg} strokeWidth="0.8"/>
      <path d="M195 85 Q 200 81, 205 85" stroke={T.fg} strokeWidth="0.6" fill="none"/>
    </svg>
  );
}
