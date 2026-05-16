// LiveSetupCard.jsx — empty-state for the Live Scoring tab when there
// is no in-progress match. User feedback: "The default should be one
// set 0-0. test should be You vs Choose opponent."
//
// Visual:
//   • A small mock scoreboard preview (You vs Choose opponent, 1 set
//     0-0) so the user immediately understands what they're setting up.
//   • The OpponentSheet picker reused from QuickLogScreen — friends
//     list + free-text fallback. Tapping the opponent row opens it.
//   • A format chip row (defaults to Bo3; Bo5 / Pro 8 / TB10 also
//     available so the user can pick before committing).
//   • Primary "Start match" button. Disabled until an opponent is
//     chosen so we don't accidentally create an unowned live match.
//
// Once Start fires, the parent calls `onStart({ opponent, format })`
// which builds the live match, persists it, and routes into the
// existing live-scoring chrome.

import React from "react";
import { Eyebrow, ServeDot } from "./atoms.jsx";
import { OpponentSheet } from "./QuickLogScreen.jsx";

// Format chip options shown in the setup card. "Free play" is the
// no-format mode — games still work normally but sets never
// auto-close and the match never auto-ends; the user owns set
// boundaries via the End-set button and ends the match via Save.
var FORMAT_LABELS = [
  { id: "bo3",       label: "Bo3" },
  { id: "bo3_super", label: "Bo3 · super TB" },
  { id: "bo5",       label: "Bo5" },
  { id: "pro8",      label: "Pro 8" },
  { id: "tb10",      label: "10-pt TB" },
  { id: "freeplay",  label: "Free play" },
];

export default function LiveSetupCard({
  theme, accent, court,
  viewerName, friends,
  onStart,             // ({ opponent, format }) => void
  isPhone = false,
}) {
  var [opponent, setOpponent] = React.useState(null);
  var [format, setFormat]     = React.useState("bo3");
  var [sheetOpen, setSheetOpen] = React.useState(false);

  var youLabel = "You";                       // matches the Quick-log convention
  var oppLabel = opponent ? opponent.name : "Choose opponent";

  function handleStart() {
    if (!opponent) { setSheetOpen(true); return; }
    if (typeof onStart === "function") onStart({ opponent: opponent, format: format });
  }

  return (
    <div style={{
      width: "100%", height: "100%", background: theme.bg, color: theme.ink,
      display: "flex", flexDirection: "column", overflow: "hidden", position: "relative",
    }}>
      <div style={{ padding: isPhone ? "22px 18px 8px" : "26px 32px 8px" }}>
        <Eyebrow color={theme.inkSoft}>Live scoring</Eyebrow>
        <h1 className="t-serif" style={{
          fontSize: isPhone ? 30 : 38, lineHeight: 1.05,
          margin: "6px 0 0", letterSpacing: "-0.02em",
        }}>
          Set up the <em>match</em>.
        </h1>
        <p style={{
          marginTop: 8, marginBottom: 0,
          fontFamily: "Inter", fontSize: 13, color: theme.inkSoft,
          maxWidth: 480, lineHeight: 1.5,
        }}>
          Pick an opponent and a format, then tap Start to begin live scoring. Your in-progress match is saved on this device until you finish or reset.
        </p>
      </div>

      {/* Mock scoreboard — same dark-glass language as Quick-log's
          scoreboard so the user sees the same visual language across
          both match-entry paths. */}
      <div style={{ padding: isPhone ? "16px 16px 4px" : "20px 32px 4px" }}>
        <div style={{
          background: "rgba(15,20,16,0.92)",
          backdropFilter: "blur(12px)",
          color: "#fbf6e9",
          borderRadius: 14, overflow: "hidden",
          border: "1px solid rgba(251,246,233,0.10)",
          boxShadow: "0 6px 18px rgba(0,0,0,0.18)",
          maxWidth: 520,
        }}>
          <div style={{
            display: "grid",
            gridTemplateColumns: "minmax(140px, 1fr) 44px",
            padding: "8px 14px 10px",
            alignItems: "center",
            rowGap: 2, columnGap: 6,
          }}>
            <div className="t-cap" style={{ color: "rgba(251,246,233,0.45)", letterSpacing: "0.14em" }}>Player</div>
            <div className="t-cap" style={{ color: accent, letterSpacing: "0.14em", textAlign: "center", fontWeight: 700 }}>1</div>

            <div style={{ gridColumn: "1 / span 2", height: 1, background: "rgba(251,246,233,0.12)", margin: "6px 0" }} />

            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 0", minWidth: 0 }}>
              <ServeDot active color={accent} size={9} />
              <span style={{
                fontFamily: "Inter", fontWeight: 600, fontSize: 16, color: "#fbf6e9",
                whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
              }}>{youLabel}</span>
            </div>
            <span className="t-num" style={{
              fontFamily: "JetBrains Mono", fontVariantNumeric: "tabular-nums",
              fontSize: 20, fontWeight: 600, color: "rgba(251,246,233,0.5)",
              textAlign: "center",
            }}>0</span>

            <div style={{ gridColumn: "1 / span 2", height: 1, background: "rgba(251,246,233,0.12)" }} />

            <button
              type="button"
              onClick={() => setSheetOpen(true)}
              className="t-btn"
              style={{
                appearance: "none", background: "transparent", border: 0,
                padding: "6px 0", cursor: "pointer", textAlign: "left",
                display: "flex", alignItems: "center", gap: 10, minWidth: 0,
              }}>
              <ServeDot active={false} color={accent} size={9} />
              <span style={{
                fontFamily: "Inter", fontWeight: 600, fontSize: 16,
                color: opponent ? "#fbf6e9" : accent,
                whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                borderBottom: opponent
                  ? "1px dashed rgba(251,246,233,0.25)"
                  : ("1px dashed " + accent),
                paddingBottom: 1,
              }}>{oppLabel}</span>
            </button>
            <span className="t-num" style={{
              fontFamily: "JetBrains Mono", fontVariantNumeric: "tabular-nums",
              fontSize: 20, fontWeight: 600, color: "rgba(251,246,233,0.5)",
              textAlign: "center",
            }}>0</span>
          </div>
        </div>
      </div>

      {/* Format chip row */}
      <div style={{ padding: isPhone ? "16px 16px 4px" : "20px 32px 4px" }}>
        <div className="t-cap" style={{ color: theme.inkSoft, marginBottom: 8 }}>Format</div>
        <div className="t-noscroll" style={{
          display: "flex", gap: 6, overflowX: "auto", paddingBottom: 4,
          scrollbarWidth: "none",
        }}>
          {FORMAT_LABELS.map(function (f) {
            var on = format === f.id;
            return (
              <button key={f.id} onClick={function () { setFormat(f.id); }} className="t-btn" style={{
                appearance: "none", border: "1px solid " + (on ? theme.ink : theme.line),
                background: on ? theme.ink : "transparent",
                color: on ? theme.bg : theme.ink,
                borderRadius: 999, padding: "6px 12px", flexShrink: 0,
                fontFamily: "Inter", fontSize: 11.5, fontWeight: 600, cursor: "pointer",
                whiteSpace: "nowrap",
              }}>{f.label}</button>
            );
          })}
        </div>
      </div>

      <div style={{ flex: 1 }} />

      {/* Primary action */}
      <div style={{ padding: isPhone ? "12px 16px 20px" : "20px 32px 28px" }}>
        <button onClick={handleStart} className="t-btn" style={{
          width: "100%", maxWidth: 520,
          appearance: "none", border: 0, padding: "16px",
          borderRadius: 14,
          background: opponent ? accent : theme.chip,
          color: opponent ? "#0f1410" : theme.inkSoft,
          fontFamily: "Inter", fontWeight: 700, fontSize: 15, letterSpacing: "0.02em",
          cursor: opponent ? "pointer" : "default",
          display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
        }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <polygon points="5 3 19 12 5 21 5 3" />
          </svg>
          {opponent ? "Start match" : "Choose an opponent to start"}
        </button>
      </div>

      {sheetOpen && (
        <OpponentSheet
          theme={theme} accent={accent}
          friends={friends || []}
          onPick={function (o) { setOpponent(o); setSheetOpen(false); }}
          onClose={function () { setSheetOpen(false); }}
        />
      )}
    </div>
  );
}
