// src/features/people/utils/dmTemplates.js
//
// Prefilled message templates for DMs that open from the map (a court
// tap / a player row). Each template takes a venue string + an optional
// when-string and returns a ready-to-send message. Four AU-casual
// options the user can cycle through, plus "(custom)" which is just a
// blank slate.
//
// Why 4 and not 10: too many choices = analysis paralysis on a composer
// that's already got a send button staring at you. Four covers tone
// range from "casual hit" to "short & direct" and that's enough.
//
// No emoji baked in — user can add them after tapping a template.

export var DM_TEMPLATES = [
  { id: "casual",   label: "Casual",
    build: function (v, w) {
      return "Keen for a hit at " + v + (w ? " " + w : "") + "? I'll book once you're in.";
    } },
  { id: "neutral",  label: "Neutral",
    build: function (v, w) {
      return "Up for a match at " + v + (w ? " on " + w : "") + "? Let me know.";
    } },
  { id: "question", label: "Question",
    build: function (v, w) {
      return (w ? w + " at " + v : "A hit at " + v) + " — you free?";
    } },
  { id: "tight",    label: "Tight",
    build: function (v, w) {
      return "Hit at " + v + (w ? ", " + w : "") + "?";
    } },
  { id: "custom",   label: "Custom",
    build: function () { return ""; } },
];

// Combine a date ("YYYY-MM-DD") + a time ("HH:MM") into a compact chat
// string: "Sat 10:00 am". Falls back gracefully if anything's missing.
export function formatSlotForChat(dateIso, timeStr) {
  if (!dateIso) return "";
  var dt = new Date(dateIso + "T" + (timeStr || "18:00") + ":00");
  if (isNaN(dt.getTime())) return dateIso + (timeStr ? " " + timeStr : "");
  var day  = dt.toLocaleDateString("en-AU", { weekday: "short" });
  var time = dt.toLocaleTimeString("en-AU",
    { hour: "numeric", minute: "2-digit", hour12: true }).toLowerCase().replace(" ", "\u00A0");
  return day + " " + time;
}

// Produce a draft string from (venue, dateIso, timeStr, templateId).
// Used by usePacts' openConversationWith helper and by the composer's
// template-picker click handler.
export function buildDraftFromTemplate(templateId, venue, dateIso, timeStr) {
  var tmpl = DM_TEMPLATES.find(function (x) { return x.id === templateId; }) || DM_TEMPLATES[0];
  var whenStr = formatSlotForChat(dateIso, timeStr);
  return tmpl.build(venue || "", whenStr);
}

// Bounds check — keeps the composer from firing draft dates beyond the
// operator booking window. Returns { ok: boolean, hint: string } where
// hint is UX copy to render inline ("soft" warnings don't block send).
export function validateSlotDate(dateIso) {
  if (!dateIso) return { ok: true, hint: null };
  var now = new Date();
  var chosen = new Date(dateIso + "T12:00:00");
  if (isNaN(chosen.getTime())) return { ok: true, hint: null };
  var deltaDays = Math.round((chosen - now) / (24 * 3600 * 1000));
  if (deltaDays < 0)  return { ok: false, hint: "That date is in the past." };
  if (deltaDays < 2)  return { ok: true,  hint: "Tight timeline — partner has less than 48h to agree." };
  if (deltaDays > 14) return { ok: true,  hint: "Bookings usually open 7–14 days ahead — check the court first." };
  if (deltaDays > 8)  return { ok: true,  hint: "Most courts only open bookings ~7 days ahead — check availability." };
  return { ok: true, hint: null };
}
