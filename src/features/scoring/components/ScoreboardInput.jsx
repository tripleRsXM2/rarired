// src/features/scoring/components/ScoreboardInput.jsx
//
// The hero of the redesigned Log Match composer. Players as ROWS,
// sets as COLUMNS — i.e. an actual scoreboard, not a vertical list of
// "Set 1: [you][them]" rows.
//
//                  SET 1   SET 2   SET 3   +SET
//         YOU       [6]     [4]     [7]
//         OPP       [3]     [6]     [6]
//         TB         -       -      7-3      ← only if any set is 7-6/6-7
//
// Behaviour:
//   - Tap any cell to enter that set's score for that player. Inputs are
//     numeric / inputMode=numeric so mobile pulls up the number pad.
//   - "+ SET" hairline button on the right adds another set (max 5).
//   - "×" mini-button above each column removes that set (only when
//     >1 set total).
//   - When ANY set in the array hits a 7-6 or 6-7 shape, a tiebreak
//     sub-row appears beneath. Cells align to set columns; non-tb sets
//     show a hairline dash. Editing a tb cell writes into
//     sets[i].tieBreak.{you|them}. Stale tieBreak values are dropped
//     the moment the parent set leaves tb shape (handled in the parent
//     setSets() update — we keep this component pure and just emit the
//     new sets array).
//
// Slice 1 — purely a presentational/structural lift. Validator,
// completion-type, league selector etc. all stay in ScoreModal.

export default function ScoreboardInput({
  t,
  sets,             // array of { you, them, tieBreak?: { you, them } }
  onSetsChange,     // (nextSets) => void
  youLabel = "You",
  oppLabel = "Opp",
}) {
  var maxSets = 5;
  var canAdd = sets.length < maxSets;
  var canRemove = sets.length > 1;

  // Any tiebreak shape in the array? Drives whether the tb sub-row renders.
  var anyTbShape = sets.some(function (s) {
    var y = Number(String(s.you ?? "").trim());
    var x = Number(String(s.them ?? "").trim());
    return Number.isFinite(y) && Number.isFinite(x)
      && ((y === 7 && x === 6) || (y === 6 && x === 7));
  });

  // Grid columns: [player-label][set...][add-button|nothing]
  var setCols = sets.map(function () { return "1fr"; }).join(" ");
  var gridTemplate = "56px " + setCols + (canAdd ? " 44px" : "");

  function setAt(idx, who, val) {
    var ns = sets.map(function (s, i) {
      if (i !== idx) return s;
      var next = Object.assign({}, s, { [who]: val });
      // Drop stale tieBreak when the set leaves tb shape.
      var ny = Number(String(next.you ?? "").trim());
      var nt = Number(String(next.them ?? "").trim());
      var stillTb = Number.isFinite(ny) && Number.isFinite(nt)
        && ((ny === 7 && nt === 6) || (ny === 6 && nt === 7));
      if (!stillTb && next.tieBreak) {
        next = Object.assign({}, next);
        delete next.tieBreak;
      }
      return next;
    });
    onSetsChange(ns);
  }

  function setTbAt(idx, who, val) {
    var ns = sets.map(function (s, i) {
      if (i !== idx) return s;
      var nextTb = Object.assign({}, s.tieBreak || {});
      nextTb[who] = val;
      return Object.assign({}, s, { tieBreak: nextTb });
    });
    onSetsChange(ns);
  }

  function removeSet(idx) {
    if (!canRemove) return;
    onSetsChange(sets.filter(function (_, i) { return i !== idx; }));
  }

  function addSet() {
    if (!canAdd) return;
    onSetsChange(sets.concat([{ you: "", them: "" }]));
  }

  // Eyebrow row — column headers.
  var headerRow = (
    <div style={{
      display: "grid", gridTemplateColumns: gridTemplate,
      gap: 6, marginBottom: 6, alignItems: "center",
    }}>
      <div/>
      {sets.map(function (_, i) {
        return (
          <div key={i} style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "0 2px",
          }}>
            <span style={{
              fontSize: 9, fontWeight: 800,
              color: t.textTertiary, letterSpacing: "0.16em",
              textTransform: "uppercase",
            }}>
              Set {i + 1}
            </span>
            {canRemove && (
              <button type="button"
                onClick={function () { removeSet(i); }}
                aria-label={"Remove set " + (i + 1)}
                style={{
                  background: "transparent", border: "none",
                  color: t.textTertiary, fontSize: 14,
                  padding: 0, cursor: "pointer",
                  lineHeight: 1,
                }}>
                ×
              </button>
            )}
          </div>
        );
      })}
      {canAdd && <div/>}
    </div>
  );

  // Player row builder — used for both YOU and OPP rows.
  function playerRow(who, label) {
    return (
      <div style={{
        display: "grid", gridTemplateColumns: gridTemplate,
        gap: 6, alignItems: "center", marginBottom: 8,
      }}>
        <span style={{
          fontSize: 10, fontWeight: 800,
          color: t.textSecondary, letterSpacing: "0.14em",
          textTransform: "uppercase",
        }}>
          {label}
        </span>
        {sets.map(function (s, i) {
          return (
            <input key={i}
              type="number" inputMode="numeric" pattern="[0-9]*" min="0"
              value={s[who] ?? ""}
              placeholder="–"
              onChange={function (e) { setAt(i, who, e.target.value); }}
              style={{
                padding:        "10px 0",
                textAlign:      "center",
                borderRadius:   0,
                border:         "none",
                borderBottom:   "1px solid " + t.border,
                background:     "transparent",
                color:          t.text,
                fontSize:       22,
                fontWeight:     700,
                width:          "100%",
                fontVariantNumeric: "tabular-nums",
                outline:        "none",
              }}
              onFocus={function (e) { e.target.style.borderBottomColor = t.text; }}
              onBlur={function (e)  { e.target.style.borderBottomColor = t.border; }}/>
          );
        })}
        {/* Right rail: only renders on the YOU row (top) — we put the
            "+ Set" button here so it sits at the corner, level with the
            scoreboard's first row. The OPP row leaves it blank. */}
        {canAdd && (
          who === "you"
            ? (
              <button type="button"
                onClick={addSet}
                aria-label="Add set"
                style={{
                  alignSelf:    "stretch",
                  background:   "transparent",
                  border:       "none",
                  borderBottom: "1px solid " + t.border,
                  borderRadius: 0,
                  color:        t.textTertiary,
                  fontSize:     18,
                  fontWeight:   400,
                  cursor:       "pointer",
                  padding:      0,
                  lineHeight:   1,
                  transition:   "color 0.15s, border-bottom-color 0.15s",
                }}
                onMouseEnter={function (e) {
                  e.currentTarget.style.color = t.text;
                  e.currentTarget.style.borderBottomColor = t.text;
                }}
                onMouseLeave={function (e) {
                  e.currentTarget.style.color = t.textTertiary;
                  e.currentTarget.style.borderBottomColor = t.border;
                }}>
                +
              </button>
            )
            : <div/>
        )}
      </div>
    );
  }

  // Tiebreak sub-row — only renders when at least one set has tb shape.
  var tbRow = anyTbShape ? (
    <div style={{
      display: "grid", gridTemplateColumns: gridTemplate,
      gap: 6, alignItems: "center", marginTop: 4,
    }}>
      <span style={{
        fontSize: 9, fontWeight: 800,
        color: t.textTertiary, letterSpacing: "0.16em",
        textTransform: "uppercase",
      }}>
        Tiebreak
      </span>
      {sets.map(function (s, i) {
        var y = Number(String(s.you ?? "").trim());
        var x = Number(String(s.them ?? "").trim());
        var isTb = Number.isFinite(y) && Number.isFinite(x)
          && ((y === 7 && x === 6) || (y === 6 && x === 7));
        if (!isTb) {
          return (
            <div key={i} style={{
              fontSize: 14, fontWeight: 400,
              color: t.textTertiary,
              textAlign: "center",
              padding: "6px 0",
            }}>
              –
            </div>
          );
        }
        var tbY = (s.tieBreak && s.tieBreak.you  != null) ? s.tieBreak.you  : "";
        var tbT = (s.tieBreak && s.tieBreak.them != null) ? s.tieBreak.them : "";
        return (
          <div key={i} style={{
            display: "grid", gridTemplateColumns: "1fr 8px 1fr",
            gap: 2, alignItems: "center",
          }}>
            <input
              type="number" inputMode="numeric" pattern="[0-9]*" min="0"
              value={tbY}
              placeholder={y === 7 ? "7" : "0–5"}
              onChange={function (e) { setTbAt(i, "you", e.target.value); }}
              style={{
                padding:        "4px 0",
                textAlign:      "center",
                borderRadius:   0,
                border:         "none",
                borderBottom:   "1px solid " + t.border,
                background:     "transparent",
                color:          t.text,
                fontSize:       12,
                fontWeight:     600,
                width:          "100%",
                fontVariantNumeric: "tabular-nums",
                outline:        "none",
              }}
              onFocus={function (e) { e.target.style.borderBottomColor = t.text; }}
              onBlur={function (e)  { e.target.style.borderBottomColor = t.border; }}/>
            <span style={{
              fontSize: 11, color: t.textTertiary,
              textAlign: "center",
            }}>–</span>
            <input
              type="number" inputMode="numeric" pattern="[0-9]*" min="0"
              value={tbT}
              placeholder={x === 7 ? "7" : "0–5"}
              onChange={function (e) { setTbAt(i, "them", e.target.value); }}
              style={{
                padding:        "4px 0",
                textAlign:      "center",
                borderRadius:   0,
                border:         "none",
                borderBottom:   "1px solid " + t.border,
                background:     "transparent",
                color:          t.text,
                fontSize:       12,
                fontWeight:     600,
                width:          "100%",
                fontVariantNumeric: "tabular-nums",
                outline:        "none",
              }}
              onFocus={function (e) { e.target.style.borderBottomColor = t.text; }}
              onBlur={function (e)  { e.target.style.borderBottomColor = t.border; }}/>
          </div>
        );
      })}
      {canAdd && <div/>}
    </div>
  ) : null;

  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{
        fontSize: 9, fontWeight: 800,
        color: t.textTertiary, letterSpacing: "0.16em",
        textTransform: "uppercase",
        marginBottom: 10,
      }}>
        Scoreboard
      </div>

      {headerRow}
      {playerRow("you",  youLabel)}
      {playerRow("them", oppLabel)}
      {tbRow}
    </div>
  );
}
