// src/features/leagues/components/CreateLeagueModal.jsx
//
// Centred dialog for creating a new private league. Restyled to the
// Editorial Tennis palette so it sits in the same realm as LogMatch /
// MatchComposer / ProfileScreen — cream paper, espresso ink, mono
// uppercase microlabels, hairline section dividers, ink-on-cream
// primary CTA. Single screen, no wizards. Invites happen after
// creation from the league detail view.

import { useState } from "react";
import { createPortal } from "react-dom";
import { ED_TOK } from "../../home/components/EditorialScreen.jsx";

var MATCH_FORMATS = [
  { id: "best_of_3", label: "Best of 3" },
  { id: "one_set",   label: "One set" },
];
var TIEBREAK_FORMATS = [
  { id: "standard",              label: "Standard tiebreak" },
  { id: "super_tiebreak_final",  label: "Super tiebreak final set" },
];
var MAX_MATCHES_OPTIONS = [
  // Short labels — three pills must fit on a 375px viewport, and
  // breaking words mid-character (Unlimite-d, opponen-t) reads worse
  // than a snappy abbreviation.
  { id: null, label: "Unlimited" },
  { id: 1,    label: "1 per opp." },
  { id: 2,    label: "2 per opp." },
];

// ── Editorial atoms — local to this modal ───────────────────────────

// Uppercase mono section eyebrow. Same letter-spacing / weight as the
// FieldGroup label in LogMatchPage so the two surfaces read as part of
// the same family.
function Microlabel({ children, style }) {
  return (
    <div style={Object.assign({
      fontFamily:    ED_TOK.mono,
      fontSize:      10.5,
      fontWeight:    700,
      letterSpacing: "0.16em",
      textTransform: "uppercase",
      color:         ED_TOK.muted,
      marginBottom:  10,
    }, style || {})}>
      {children}
    </div>
  );
}

// Editorial line input — transparent body, hairline bottom border,
// display font for the value so each entry feels like a typeset card,
// not a form widget. Mirrors LogMatchPage's FieldInput.
function LineInput(props) {
  var size = props.size || "lg";
  var fontSize = size === "sm" ? 16 : 22;
  var rest = Object.assign({}, props);
  delete rest.size;
  return (
    <input
      {...rest}
      style={Object.assign({
        background:    "transparent",
        border:        "none",
        borderBottom:  "1.5px solid " + ED_TOK.lineStrong,
        padding:       "10px 0",
        fontFamily:    size === "sm" ? ED_TOK.sans : ED_TOK.display,
        fontSize:      fontSize,
        fontWeight:    500,
        letterSpacing: size === "sm" ? 0 : "-0.02em",
        color:         ED_TOK.ink,
        outline:       "none",
        width:         "100%",
      }, props.style || {})}
      onFocus={function (e) { e.target.style.borderBottomColor = ED_TOK.ink; }}
      onBlur={function (e)  { e.target.style.borderBottomColor = ED_TOK.lineStrong; }}
    />
  );
}

// Segmented option pill — same vocabulary as the LogMatchPage chips:
// rounded 999, ink fill when active, hairline outline when inactive,
// mono uppercase microlabel beneath an optional larger label.
function OptionPill({ on, label, hint, onClick, flex }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        flex:           flex == null ? 1 : flex,
        padding:        hint ? "12px 14px" : "13px 14px",
        borderRadius:   999,
        border:         "1px solid " + (on ? ED_TOK.ink : ED_TOK.lineStrong),
        background:     on ? ED_TOK.ink : "transparent",
        color:          on ? ED_TOK.bg  : ED_TOK.ink,
        cursor:         "pointer",
        textAlign:      "center",
        transition:     "background 140ms ease, color 140ms ease, border-color 140ms ease",
        display:        "flex",
        flexDirection:  "column",
        alignItems:     "center",
        justifyContent: "center",
        gap:            hint ? 3 : 0,
        minWidth:       0,
      }}>
      <span style={{
        fontFamily:    ED_TOK.sans,
        fontSize:      13,
        fontWeight:    600,
        letterSpacing: "-0.005em",
        // Allow multi-word labels (e.g. "Standard tiebreak") to wrap
        // onto a second line at word boundaries. overflowWrap (not
        // wordBreak:break-word) keeps single words intact — we don't
        // want "Unlimited" rendering as "Unlimite-d".
        whiteSpace:    "normal",
        overflowWrap:  "normal",
        lineHeight:    1.2,
        textAlign:     "center",
        maxWidth:      "100%",
      }}>{label}</span>
      {hint && (
        <span style={{
          fontFamily:    ED_TOK.mono,
          fontSize:      9.5,
          fontWeight:    600,
          letterSpacing: "0.10em",
          textTransform: "uppercase",
          color:         on ? "rgba(240,233,218,0.7)" : ED_TOK.muted,
        }}>{hint}</span>
      )}
    </button>
  );
}

function HairlineDivider() {
  return <div style={{ height: 1, background: ED_TOK.line, margin: "22px 0" }}/>;
}

// ── Modal body ──────────────────────────────────────────────────────

export default function CreateLeagueModal({ t, onClose, createLeague, onCreated, toast }) {
  // t is still threaded in for any legacy callers, but the visuals are
  // owned by ED_TOK now — the editorial palette is the source of truth.
  void t;

  var [name, setName]                                   = useState("");
  var [description, setDescription]                     = useState("");
  var [startDate, setStartDate]                         = useState("");
  var [endDate, setEndDate]                             = useState("");
  var [maxMembers, setMaxMembers]                       = useState("");
  // Module 7.5: leagues now have a mode — 'ranked' (Elo-bearing matches)
  // or 'casual' (per-league standings only, no global Elo). The
  // validate_match_league trigger enforces that league matches must have
  // a matching match_type, so this choice can't be changed after creation.
  var [mode, setMode]                                   = useState("ranked");
  var [matchFormat, setMatchFormat]                     = useState("best_of_3");
  var [tiebreakFormat, setTiebreakFormat]               = useState("standard");
  var [maxMatchesPerOpponent, setMaxMatchesPerOpponent] = useState(null);
  var [winPoints, setWinPoints]                         = useState(3);
  var [lossPoints, setLossPoints]                       = useState(0);
  var [saving, setSaving]                               = useState(false);
  var [error, setError]                                 = useState("");

  function report(msg) { if (toast) toast(msg, "error"); else setError(msg); }

  async function handleSubmit() {
    setError("");
    if (!name.trim()) { setError("Give your league a name."); return; }
    if (endDate && startDate && endDate < startDate) {
      setError("End date must be on or after the start date."); return;
    }

    setSaving(true);
    var r = await createLeague({
      name: name.trim(),
      description: description.trim() || null,
      start_date: startDate || null,
      end_date:   endDate || null,
      max_members: maxMembers ? parseInt(maxMembers, 10) : null,
      mode: mode,
      match_format: matchFormat,
      tiebreak_format: tiebreakFormat,
      max_matches_per_opponent: maxMatchesPerOpponent,
      win_points:  winPoints,
      loss_points: lossPoints,
      draw_points: 0,
    });
    setSaving(false);
    if (r && r.error) {
      report((r.error && r.error.message) || "Could not create league — please try again.");
      return;
    }
    if (onCreated) onCreated(r.data /* = new league_id */);
    onClose();
  }

  // Rendered via createPortal to document.body because the People tab
  // wraps its content in a `.fade-up` div whose `transform` creates a
  // CSS containing block for position:fixed descendants — that's what
  // was pushing the modal off-center when it lived inside the tab.
  // Portaling out escapes the transformed ancestor.
  return createPortal((
    <div
      onClick={onClose}
      style={{
        position:       "fixed",
        inset:          0,
        background:     "rgba(20, 17, 14, 0.55)",
        backdropFilter: "blur(8px)",
        WebkitBackdropFilter: "blur(8px)",
        display:        "flex",
        alignItems:     "center",
        justifyContent: "center",
        zIndex:         200,
        padding:        "0 16px",
      }}>
      <div
        onClick={function (e) { e.stopPropagation(); }}
        className="pop"
        style={{
          background:    ED_TOK.bg,
          color:         ED_TOK.ink,
          fontFamily:    ED_TOK.sans,
          border:        "1px solid " + ED_TOK.line,
          borderRadius:  20,
          padding:       "30px 24px",
          width:         "100%",
          maxWidth:      540,
          maxHeight:     "92vh",
          // Lock scroll to the vertical axis. overflowX:hidden kills any
          // accidental horizontal pan / rubber-band; overscrollBehavior:
          // contain stops flick momentum from bubbling to the page.
          // touchAction:pan-y tells iOS this region is vertical-only so
          // it doesn't escalate gestures to body-level scrolling.
          overflowY:     "auto",
          overflowX:     "hidden",
          overscrollBehavior:      "contain",
          WebkitOverflowScrolling: "touch",
          touchAction:   "pan-y",
          boxShadow:     "0 24px 80px rgba(20,17,14,0.35)",
        }}>

        {/* Hero header — kicker microlabel + display title + body lede.
            Same composition as the LogMatchPage hero band. */}
        <Microlabel style={{ marginBottom: 8 }}>New league</Microlabel>
        <h2 style={{
          fontFamily:    ED_TOK.display,
          fontSize:      "clamp(28px, 7vw, 36px)",
          fontWeight:    600,
          letterSpacing: "-0.025em",
          lineHeight:    1.0,
          color:         ED_TOK.ink,
          margin:        "0 0 10px",
        }}>
          Start a season
        </h2>
        <p style={{
          fontSize:   13.5,
          lineHeight: 1.5,
          color:      ED_TOK.ink2,
          margin:     "0 0 22px",
        }}>
          Private season with your friends. Invite members after you create it.
        </p>

        <HairlineDivider/>

        {/* Name */}
        <Microlabel>Name</Microlabel>
        <LineInput
          autoFocus
          value={name}
          placeholder="e.g. Sunday Crew Autumn"
          onChange={function (e) { setName(e.target.value); }}
        />

        {/* Description — borderless, no underline. The textarea body
            sits on its own without the field-bottom rule that lined
            inputs get; the explicit HairlineDivider below opens the
            next section. Two stacked hairlines (textarea border-bottom
            + section divider) read as a visual stutter on screen. */}
        <div style={{ marginTop: 22 }}/>
        <Microlabel>Description (optional)</Microlabel>
        <textarea
          value={description}
          placeholder="A short note so friends know what this league is."
          rows={2}
          onChange={function (e) { setDescription(e.target.value); }}
          style={{
            background:    "transparent",
            border:        "none",
            padding:       "0",
            fontFamily:    ED_TOK.sans,
            fontSize:      15,
            lineHeight:    1.5,
            color:         ED_TOK.ink,
            outline:       "none",
            width:         "100%",
            resize:        "none",
          }}
        />

        <HairlineDivider/>

        {/* Mode */}
        <Microlabel>Mode</Microlabel>
        <div style={{ display: "flex", gap: 10 }}>
          <OptionPill
            on={mode === "ranked"}
            label="Ranked"
            hint="Counts toward Elo + W/L"
            onClick={function () { setMode("ranked"); }}
          />
          <OptionPill
            on={mode === "casual"}
            label="Casual"
            hint="League standings only"
            onClick={function () { setMode("casual"); }}
          />
        </div>
        <p style={{
          fontFamily:    ED_TOK.sans,
          fontSize:      11.5,
          lineHeight:    1.5,
          color:         ED_TOK.muted,
          margin:        "10px 0 0",
        }}>
          Locked at creation. Ranked leagues only accept ranked matches; casual leagues only accept casual matches.
        </p>

        <HairlineDivider/>

        {/* Dates */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, minWidth: 0 }}>
          <div style={{ minWidth: 0 }}>
            <Microlabel>Start</Microlabel>
            <LineInput
              type="date"
              size="sm"
              value={startDate}
              onChange={function (e) { setStartDate(e.target.value); }}
            />
          </div>
          <div style={{ minWidth: 0 }}>
            <Microlabel>End</Microlabel>
            <LineInput
              type="date"
              size="sm"
              value={endDate}
              onChange={function (e) { setEndDate(e.target.value); }}
            />
          </div>
        </div>

        <div style={{ marginTop: 22 }}/>
        <Microlabel>Max members</Microlabel>
        <LineInput
          type="number"
          min="2"
          size="sm"
          value={maxMembers}
          placeholder="—"
          onChange={function (e) { setMaxMembers(e.target.value); }}
        />

        <HairlineDivider/>

        {/* Match format */}
        <Microlabel>Match format</Microlabel>
        <div style={{ display: "flex", gap: 10 }}>
          {MATCH_FORMATS.map(function (o) {
            return (
              <OptionPill
                key={o.id}
                on={matchFormat === o.id}
                label={o.label}
                onClick={function () { setMatchFormat(o.id); }}
              />
            );
          })}
        </div>

        {/* Tiebreak */}
        <div style={{ marginTop: 22 }}/>
        <Microlabel>Tiebreak</Microlabel>
        <div style={{ display: "flex", gap: 10 }}>
          {TIEBREAK_FORMATS.map(function (o) {
            return (
              <OptionPill
                key={o.id}
                on={tiebreakFormat === o.id}
                label={o.label}
                onClick={function () { setTiebreakFormat(o.id); }}
              />
            );
          })}
        </div>

        {/* Max matches per opponent */}
        <div style={{ marginTop: 22 }}/>
        <Microlabel>Max matches per opponent</Microlabel>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {MAX_MATCHES_OPTIONS.map(function (o) {
            return (
              <OptionPill
                key={String(o.id)}
                on={maxMatchesPerOpponent === o.id}
                label={o.label}
                onClick={function () { setMaxMatchesPerOpponent(o.id); }}
                flex="1 1 calc(33% - 7px)"
              />
            );
          })}
        </div>

        <HairlineDivider/>

        {/* Points */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, minWidth: 0 }}>
          <div style={{ minWidth: 0 }}>
            <Microlabel>Win points</Microlabel>
            <LineInput
              type="number"
              min="0"
              size="sm"
              value={winPoints}
              onChange={function (e) { setWinPoints(parseInt(e.target.value || "0", 10)); }}
            />
          </div>
          <div style={{ minWidth: 0 }}>
            <Microlabel>Loss points</Microlabel>
            <LineInput
              type="number"
              min="0"
              size="sm"
              value={lossPoints}
              onChange={function (e) { setLossPoints(parseInt(e.target.value || "0", 10)); }}
            />
          </div>
        </div>

        {/* Error */}
        {error && (
          <div style={{
            marginTop:    20,
            padding:      "12px 14px",
            borderRadius: 12,
            background:   "rgba(195, 57, 43, 0.10)",
            border:       "1px solid rgba(195, 57, 43, 0.30)",
            fontFamily:   ED_TOK.sans,
            fontSize:     13,
            lineHeight:   1.4,
            color:        ED_TOK.loss,
          }}>
            {error}
          </div>
        )}

        {/* Actions — Cancel hairline pill + Create league ink-on-cream
            primary, both 999-radius mono uppercase per LogMatchPage's
            primaryBtn vocabulary. */}
        <div style={{ display: "flex", gap: 10, marginTop: 28 }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              flex:           1,
              padding:        "16px 18px",
              borderRadius:   999,
              border:         "1px solid " + ED_TOK.lineStrong,
              background:     "transparent",
              color:          ED_TOK.ink,
              fontFamily:     ED_TOK.mono,
              fontSize:       11.5,
              fontWeight:     700,
              letterSpacing:  "0.18em",
              textTransform:  "uppercase",
              cursor:         "pointer",
              transition:     "background 140ms ease, border-color 140ms ease",
            }}>
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={saving}
            style={{
              flex:           2,
              padding:        "16px 18px",
              borderRadius:   999,
              border:         "1px solid " + ED_TOK.ink,
              background:     ED_TOK.ink,
              color:          ED_TOK.bg,
              fontFamily:     ED_TOK.mono,
              fontSize:       11.5,
              fontWeight:     700,
              letterSpacing:  "0.18em",
              textTransform:  "uppercase",
              cursor:         saving ? "not-allowed" : "pointer",
              opacity:        saving ? 0.5 : 1,
              transition:     "opacity 140ms ease",
            }}>
            {saving ? "Creating…" : "Create league"}
          </button>
        </div>
      </div>
    </div>
  ), document.body);
}
