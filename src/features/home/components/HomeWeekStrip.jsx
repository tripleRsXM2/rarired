// src/features/home/components/HomeWeekStrip.jsx
//
// Visual reset v2: a borderless three-stat row that summarises the
// viewer's last 7 days. Lives between the Hero and the League band
// on Home. No card. No internal frames. Three large numbers separated
// by vertical hairlines.
//
// Numbers shown:
//   1. Matches played this week (confirmed)
//   2. Wins this week
//   3. Form delta — net win/loss balance, e.g. "+2" or "-1"
//
// Per docs/design-direction.md → Visual reset (v2): "borderless by
// default; large numbers, small labels".

function thisWeek(history) {
  var oneWeekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  return (history || []).filter(function (m) {
    if (m.status !== "confirmed") return false;
    // Exclude third-party rows (friend-vs-friend matches surfaced from
    // fetch_friends_matches). They live in `history` for feed display
    // but are NOT the viewer's matches and would inflate "your week".
    if (m.isThirdParty) return false;
    var d = m.rawDate ? new Date(m.rawDate).getTime() : 0;
    return d >= oneWeekAgo;
  });
}

function Stat({ t, value, label, isLast, color }) {
  return (
    <div style={{
      flex: 1,
      minWidth: 0,
      padding: "0 4px",
      borderRight: isLast ? "none" : "1px solid " + t.border,
      textAlign: "center",
    }}>
      <div style={{
        fontSize: "clamp(34px, 5.5vw, 48px)",
        fontWeight: 800,
        color: color || t.text,
        letterSpacing: "-0.025em",
        lineHeight: 1,
        fontVariantNumeric: "tabular-nums",
      }}>
        {value}
      </div>
      <div style={{
        marginTop: 10,
        fontSize: 10,
        fontWeight: 700,
        color: t.textTertiary,
        letterSpacing: "0.12em",
        textTransform: "uppercase",
      }}>
        {label}
      </div>
    </div>
  );
}

export default function HomeWeekStrip({ t, history }) {
  var rows = thisWeek(history);
  if (!rows.length) return null;

  var played = rows.length;
  var wins   = rows.filter(function (m) { return m.result === "win"; }).length;
  var losses = played - wins;
  var delta  = wins - losses;

  var deltaColor = delta > 0 ? t.green : delta < 0 ? t.red : t.textTertiary;
  var deltaLabel = (delta > 0 ? "+" : "") + delta;

  return (
    <div className="cs-home-week-strip" style={{
      display: "flex",
      alignItems: "stretch",
      paddingTop: 4,
    }}>
      <Stat t={t} value={played} label="Played" />
      <Stat t={t} value={wins}   label="Wins" color={t.text} />
      <Stat t={t} value={deltaLabel} label="Form" color={deltaColor} isLast />
    </div>
  );
}
