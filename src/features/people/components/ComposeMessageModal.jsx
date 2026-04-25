// src/features/people/components/ComposeMessageModal.jsx
//
// Pop-up composer used by the map-centric matchmaking flow. Triggered
// when the user taps Message on a player row inside CourtInfoCard or
// ZoneSidePanel: instead of yanking them to /people/messages (which
// left the template picker as a tiny strip that was easy to miss),
// this modal surfaces the full compose experience inline so the user
// never leaves the map.
//
// On Send:
//   • opens (or reuses) the conversation via dms.openConversationWith
//   • fires dms.sendMessage with the interpolated draft
//   • closes the modal; caller handles toast / nav
//
// No new DB shape — we're reusing the DM composer contracts from Phase 1b.

import { useEffect, useRef, useState } from "react";
import PlayerAvatar from "../../../components/ui/PlayerAvatar.jsx";
import {
  DM_TEMPLATES,
  buildDraftFromTemplate,
  validateSlotDate,
} from "../utils/dmTemplates.js";
import { track } from "../../../lib/analytics.js";

export default function ComposeMessageModal({
  t, partners, partner, dms,
  initialVenue, initialDate, initialTime,
  onClose, onSent, onViewConv,
  // Analytics context — zone / court so we can attribute sends to
  // their map origin. Optional.
  contextZoneId, contextCourtName,
}) {
  // Unify the single-partner and partners[] call paths. Callers can pass
  // either `partner` (one) or `partners` (array) — we normalise to an
  // array internally so the Send path can iterate. Keeps legacy call
  // sites working while the new selection flow sends doubles invites
  // through as a batch.
  var recipients = partners && partners.length ? partners : (partner ? [partner] : []);
  var [venue, setVenue]    = useState(initialVenue || "");
  var [date, setDate]      = useState(initialDate || "");
  var [time, setTime]      = useState(initialTime || "");
  var [templateId, setTemplateId] = useState("casual");
  var [draft, setDraft]    = useState(function () {
    return buildDraftFromTemplate("casual", initialVenue || "", initialDate || "", initialTime || "");
  });
  var [sending, setSending] = useState(false);
  var [error, setError]     = useState("");

  // Re-interpolate the draft whenever venue/date/time/template changes —
  // unless the user has typed a "custom" override. The custom template
  // parks editing under the textarea and leaves the rest alone.
  useEffect(function () {
    if (templateId === "custom") return;
    setDraft(buildDraftFromTemplate(templateId, venue, date, time));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templateId, venue, date, time]);

  var validation = validateSlotDate(date);
  var canSend = !!draft.trim() && !sending && validation.ok;

  async function handleSend() {
    if (!canSend || !recipients.length || !dms) return;
    setError("");
    setSending(true);

    // Each recipient gets the same interpolated draft, fired as its own
    // 1-on-1 DM (we don't have group conversations yet). For the caller's
    // happy path (single partner) this is one round-trip; for a doubles
    // invite to 3 partners it's three. We iterate serially so a
    // mid-batch failure leaves partial state the user can see rather
    // than nuking everything.
    var failed = [];
    for (var i = 0; i < recipients.length; i++) {
      var p = recipients[i];
      if (!p || !p.id) continue;
      var opened = await dms.openConversationWith(p, {
        slot: (venue || date || time) ? { venue: venue, date: date, time: time } : null,
        draft: draft,
      });
      if (opened && opened.error) { failed.push({ p: p, err: opened.error }); continue; }
      try {
        await dms.sendMessage(draft);
      } catch (e) {
        failed.push({ p: p, err: "send_failed" });
        continue;
      }
      track("dm_sent_from_map", {
        target_user_id: p.id,
        court_name: contextCourtName || null,
        zone_id:    contextZoneId || null,
        template_id: templateId,
        has_date: !!date,
        has_time: !!time,
        batch_size: recipients.length,
      });
    }

    setSending(false);
    if (failed.length === recipients.length) {
      setError("Couldn't send. Try again.");
      return;
    }
    if (failed.length) {
      setError("Sent to " + (recipients.length - failed.length) + " of " + recipients.length + ". Retry the rest?");
      return;
    }
    if (onSent) onSent(recipients.length);
  }

  var inputStyle = {
    padding: "9px 11px", borderRadius: 8,
    border: "1px solid " + t.border, background: t.inputBg, color: t.text,
    fontSize: 13, fontWeight: 500, boxSizing: "border-box",
  };

  // Backdrop dismiss — track that the mousedown started on the
  // backdrop too, otherwise drag-selecting text inside the textarea
  // and releasing on the backdrop fires a click on the common
  // ancestor (this backdrop) → onClose runs → user's typed message
  // disappears. Only close if the click genuinely started on the
  // dim area.
  var backdropDownRef = useRef(false);

  return (
    <div
      onMouseDown={function(e){ backdropDownRef.current = e.target === e.currentTarget; }}
      onClick={function(e){
        if(backdropDownRef.current && e.target === e.currentTarget) onClose();
        backdropDownRef.current = false;
      }}
      style={{
        position: "fixed", inset: 0, zIndex: 800,
        background: "rgba(0,0,0,0.5)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 16,
      }}>
      <div onClick={function (e) { e.stopPropagation(); }}
        className="pop"
        style={{
          width: "100%", maxWidth: 480, maxHeight: "92vh", overflowY: "auto",
          background: t.modalBg, border: "1px solid " + t.border,
          borderRadius: 14, boxShadow: "0 20px 60px rgba(0,0,0,0.4)",
          padding: "18px 18px 16px",
        }}>
        {/* Header — one recipient or a stack of up to 3 */}
        <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 14 }}>
          {recipients.length === 1 ? (
            <PlayerAvatar name={recipients[0].name} avatar={recipients[0].avatar} avatarUrl={recipients[0].avatar_url} size={36}/>
          ) : (
            <div style={{ display: "flex" }}>
              {recipients.slice(0, 3).map(function (p, i) {
                return (
                  <div key={p.id} style={{ marginLeft: i === 0 ? 0 : -10, zIndex: 10 - i, borderRadius: "50%", boxShadow: "0 0 0 2px " + t.modalBg }}>
                    <PlayerAvatar name={p.name} avatar={p.avatar} avatarUrl={p.avatar_url} size={30}/>
                  </div>
                );
              })}
            </div>
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 10, letterSpacing: "0.1em", color: t.textTertiary, textTransform: "uppercase" }}>
              {recipients.length > 1 ? ("New message · " + recipients.length + " people") : "New message to"}
            </div>
            <div style={{ fontSize: 15, fontWeight: 700, color: t.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {recipients.length
                ? recipients.map(function (p) { return p.name || "Player"; }).join(", ")
                : "Player"}
            </div>
            {recipients.length > 1 && (
              <div style={{ fontSize: 10, color: t.textTertiary, marginTop: 2 }}>
                Each gets the same message in their own thread.
              </div>
            )}
          </div>
          <button onClick={onClose}
            style={{ background: "none", border: "none", color: t.textTertiary, fontSize: 22, lineHeight: 1, padding: 4, cursor: "pointer" }}>
            ×
          </button>
        </div>

        {/* Venue + date + time. Venue pre-filled from the court tap; user
            can type a different one (e.g. "Prince Alfred or Moore Park").
            Date + time are optional — a blank pair sends a plain ping
            without a proposed slot. */}
        <div style={{ marginBottom: 10 }}>
          <label style={{ fontSize: 10, fontWeight: 700, color: t.textTertiary, letterSpacing: "0.12em", textTransform: "uppercase" }}>Venue</label>
          <input value={venue}
            onChange={function (e) { setVenue(e.target.value); }}
            placeholder="e.g. Prince Alfred Park"
            style={Object.assign({}, inputStyle, { width: "100%", marginTop: 5 })}/>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
          <div>
            <label style={{ fontSize: 10, fontWeight: 700, color: t.textTertiary, letterSpacing: "0.12em", textTransform: "uppercase" }}>
              Date <span style={{ fontWeight: 400, color: t.textTertiary, textTransform: "none" }}>(optional)</span>
            </label>
            <input type="date" value={date}
              onChange={function (e) { setDate(e.target.value); }}
              style={Object.assign({}, inputStyle, { width: "100%", marginTop: 5 })}/>
          </div>
          <div>
            <label style={{ fontSize: 10, fontWeight: 700, color: t.textTertiary, letterSpacing: "0.12em", textTransform: "uppercase" }}>
              Time <span style={{ fontWeight: 400, color: t.textTertiary, textTransform: "none" }}>(optional)</span>
            </label>
            <input type="time" value={time}
              onChange={function (e) { setTime(e.target.value); }}
              style={Object.assign({}, inputStyle, { width: "100%", marginTop: 5 })}/>
          </div>
        </div>

        {validation.hint && (
          <div style={{
            fontSize: 11, color: validation.ok ? t.textTertiary : t.red,
            marginBottom: 10, lineHeight: 1.4,
            padding: "6px 10px", borderRadius: 6,
            background: validation.ok ? "transparent" : (t.redSubtle || "rgba(220,38,38,0.08)"),
            border: validation.ok ? "none" : "1px solid " + t.red + "44",
          }}>
            {validation.hint}
          </div>
        )}

        {/* Template chips — tap to swap the draft tone. "Custom" hands
            editing back to the user without overwriting. */}
        <div style={{ marginBottom: 10 }}>
          <label style={{ fontSize: 10, fontWeight: 700, color: t.textTertiary, letterSpacing: "0.12em", textTransform: "uppercase", display: "block", marginBottom: 6 }}>
            Tone
          </label>
          <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
            {DM_TEMPLATES.map(function (tmpl) {
              var on = templateId === tmpl.id;
              return (
                <button key={tmpl.id}
                  onClick={function () { setTemplateId(tmpl.id); }}
                  style={{
                    padding: "5px 11px", borderRadius: 14,
                    border: "1px solid " + (on ? t.accent : t.border),
                    background: on ? t.accentSubtle : "transparent",
                    color: on ? t.accent : t.textSecondary,
                    fontSize: 11, fontWeight: on ? 700 : 500, cursor: "pointer",
                  }}>
                  {tmpl.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Draft textarea — always editable; template changes rewrite it
            unless the user picked Custom. */}
        <div style={{ marginBottom: 10 }}>
          <label style={{ fontSize: 10, fontWeight: 700, color: t.textTertiary, letterSpacing: "0.12em", textTransform: "uppercase" }}>Message</label>
          <textarea value={draft}
            onChange={function (e) { setDraft(e.target.value.slice(0, 500)); }}
            rows={4}
            placeholder={"Write a message to " + ((partner && partner.name) || "your partner") + "…"}
            style={Object.assign({}, inputStyle, { width: "100%", marginTop: 5, resize: "vertical", minHeight: 90, fontFamily: "inherit", lineHeight: 1.4 })}/>
        </div>

        {error && (
          <div style={{ padding: "8px 11px", borderRadius: 6, background: (t.redSubtle || "rgba(220,38,38,0.08)"), border: "1px solid " + t.red + "44", color: t.red, fontSize: 12, marginBottom: 10 }}>
            {error}
          </div>
        )}

        {/* Actions */}
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={onClose}
            style={{ flex: 1, padding: "11px", borderRadius: 8, border: "1px solid " + t.border, background: "transparent", color: t.text, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
            Cancel
          </button>
          <button onClick={handleSend} disabled={!canSend}
            style={{ flex: 2, padding: "11px", borderRadius: 8, border: "none", background: canSend ? t.accent : t.border, color: t.accentText, fontSize: 13, fontWeight: 700, cursor: canSend ? "pointer" : "not-allowed", letterSpacing: "-0.01em" }}>
            {sending ? "Sending…" : "Send"}
          </button>
        </div>

        {/* After-send affordance: a small link so the user can jump
            into the thread if they want to follow up. Rendered only
            when the host supplies a handler — optional. */}
        {onViewConv && (
          <button onClick={onViewConv}
            style={{ width: "100%", marginTop: 8, padding: "7px", background: "transparent", border: "none", color: t.textTertiary, fontSize: 11, cursor: "pointer" }}>
            Or open the conversation →
          </button>
        )}
      </div>
    </div>
  );
}
