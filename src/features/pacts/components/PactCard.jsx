// src/features/pacts/components/PactCard.jsx
//
// One pact row. Adapts its CTA to the pact's state + the viewer's side:
//
//   proposed (other party's turn)   → "Waiting for their reply" + Cancel
//   proposed (your turn)            → Agree / Decline
//   confirmed                        → Book this (both agreed)
//   booked                           → Split details + Paid ✓ toggles
//   played                           → score summary link-out
//   cancelled / expired              → greyed, history only
//
// Money (if `total_cost_cents` set): shows the per-side share and,
// when a partner has a payment_handle, a launch button for their wallet
// (Venmo / PayPal.me) or a copy-to-clipboard fallback (PayID / Beem / Zelle).

import { useState } from "react";
import PlayerAvatar from "../../../components/ui/PlayerAvatar.jsx";
import { computeShares, buildPaymentLinks } from "../services/pactService.js";

function formatDate(iso) {
  if (!iso) return "";
  var d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-AU", {
    weekday: "short", day: "numeric", month: "short",
    hour: "numeric", minute: "2-digit",
  });
}

function formatDollars(cents) {
  if (cents == null) return null;
  return "$" + (cents / 100).toFixed(cents % 100 === 0 ? 0 : 2);
}

var STATUS_META = {
  proposed:  { label: "Proposed",  color: "orange",      bg: "orangeSubtle" },
  confirmed: { label: "Confirmed", color: "green",       bg: "greenSubtle"  },
  booked:    { label: "Booked",    color: "accent",      bg: "accentSubtle" },
  played:    { label: "Played",    color: "textTertiary",bg: "bgTertiary"   },
  cancelled: { label: "Cancelled", color: "textTertiary",bg: "bgTertiary"   },
  expired:   { label: "Expired",   color: "textTertiary",bg: "bgTertiary"   },
};

export default function PactCard({
  t, authUser, pact, profileMap,
  onAgree, onBook, onCancel, onSetPaid,
  onOpenProfile, rowAnchor,
}) {
  var isProposer = pact.proposer_id === authUser.id;
  var meSide = isProposer ? "proposer" : "partner";
  var otherId = isProposer ? pact.partner_id : pact.proposer_id;
  var other = otherId ? (profileMap[otherId] || { id: otherId, name: "Player" }) : null;
  var otherPaymentHandle = other && other.payment_handle;
  var otherPaymentMethod = other && other.payment_method;

  var iAgreed    = isProposer ? pact.proposer_agreed : pact.partner_agreed;
  var theyAgreed = isProposer ? pact.partner_agreed  : pact.proposer_agreed;
  var iPaid      = isProposer ? pact.proposer_paid   : pact.partner_paid;
  var theyPaid   = isProposer ? pact.partner_paid    : pact.proposer_paid;

  var shares = computeShares(pact.total_cost_cents, pact.split_mode,
    pact.proposer_share_cents, pact.partner_share_cents);
  var myShare    = isProposer ? shares.a : shares.b;
  var theirShare = isProposer ? shares.b : shares.a;

  var [expanded, setExpanded] = useState(pact.status === "booked" || pact.status === "confirmed");
  var [bookingForm, setBookingForm] = useState(null); // { booking_ref, total_cost_cents }

  var meta = STATUS_META[pact.status] || STATUS_META.proposed;
  var pillColor = t[meta.color] || t.textTertiary;
  var pillBg    = t[meta.bg]    || t.bgTertiary;

  function requestPayment() {
    var links = buildPaymentLinks(myShare, otherPaymentHandle, otherPaymentMethod, "Tennis · " + (pact.venue || ""));
    if (links.primary) {
      window.open(links.primary, "_blank");
    } else {
      // Copy the handle + amount to clipboard and notify.
      try { navigator.clipboard.writeText(links.copyText); } catch (e) {}
      if (typeof window !== "undefined" && window.alert) window.alert("Copied: " + links.copyText);
    }
  }

  function handleBookConfirm() {
    if (!bookingForm) { setBookingForm({ booking_ref: "", total_cost: (pact.total_cost_cents != null ? (pact.total_cost_cents / 100) : "") }); return; }
    var cents = null;
    if (bookingForm.total_cost !== "" && bookingForm.total_cost != null) {
      var n = Number(bookingForm.total_cost);
      if (isFinite(n) && n >= 0) cents = Math.round(n * 100);
    }
    onBook(pact, {
      booking_ref: bookingForm.booking_ref ? bookingForm.booking_ref.trim() : null,
      total_cost_cents: cents != null ? cents : pact.total_cost_cents,
    });
    setBookingForm(null);
  }

  var isTerminal = pact.status === "cancelled" || pact.status === "expired" || pact.status === "played";

  return (
    <div {...(rowAnchor || {})} className="fade-up" style={{
      background: t.bgCard, border: "1px solid " + t.border,
      borderLeft: "3px solid " + pillColor,
      borderRadius: 10, padding: "14px 16px", marginBottom: 10,
      opacity: isTerminal ? 0.78 : 1,
    }}>
      {/* Header — partner + pill + when */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
        <button onClick={function () { if (other && onOpenProfile) onOpenProfile(other.id); }}
          style={{ background: "transparent", border: "none", cursor: other ? "pointer" : "default", padding: 0 }}>
          {other
            ? <PlayerAvatar name={other.name} avatar={other.avatar} avatarUrl={other.avatar_url} size={36}/>
            : <div style={{ width: 36, height: 36, borderRadius: "50%", background: t.bgTertiary, display: "flex", alignItems: "center", justifyContent: "center", color: t.textTertiary, fontSize: 18 }}>?</div>
          }
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: t.text }}>
              {other ? other.name : "Open — unclaimed"}
            </div>
            <span style={{
              fontSize: 9, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase",
              color: pillColor, background: pillBg, padding: "2px 8px", borderRadius: 20,
            }}>{meta.label}</span>
          </div>
          <div style={{ fontSize: 12, color: t.textSecondary, marginTop: 3 }}>
            {pact.venue}{pact.court ? " · Court " + pact.court : ""}
          </div>
          <div style={{ fontSize: 11, color: t.textTertiary, marginTop: 2 }}>
            {formatDate(pact.scheduled_at)}
          </div>
        </div>
        {/* Expand chevron — only when there's more to show */}
        <button onClick={function () { setExpanded(!expanded); }}
          style={{ background: "transparent", border: "none", color: t.textTertiary, fontSize: 14, cursor: "pointer", padding: 4 }}
          aria-label="toggle">
          {expanded ? "▲" : "▼"}
        </button>
      </div>

      {pact.message && expanded && (
        <div style={{ marginTop: 10, padding: "8px 10px", background: t.bgTertiary, borderRadius: 6, fontSize: 12, color: t.textSecondary, fontStyle: "italic", lineHeight: 1.45 }}>
          "{pact.message}"
        </div>
      )}

      {/* Agreement indicators — who's tapped yes */}
      {(pact.status === "proposed" || pact.status === "confirmed") && expanded && (
        <div style={{ display: "flex", gap: 12, marginTop: 10, fontSize: 11 }}>
          <span style={{ color: iAgreed ? t.green : t.textTertiary }}>
            {iAgreed ? "✓ You agreed" : "○ Your turn"}
          </span>
          <span style={{ color: theyAgreed ? t.green : t.textTertiary }}>
            {theyAgreed ? "✓ They agreed" : "○ Awaiting them"}
          </span>
        </div>
      )}

      {/* Booking info when booked */}
      {pact.status === "booked" && expanded && (
        <div style={{ marginTop: 12, padding: "10px 12px", background: t.bgTertiary, borderRadius: 8 }}>
          <div style={{ fontSize: 11, color: t.textTertiary, marginBottom: 4 }}>
            Booked by {pact.booked_by === authUser.id ? "you" : (other && other.name) || "partner"}
            {pact.booking_ref ? (" · Ref " + pact.booking_ref) : ""}
          </div>
          {pact.total_cost_cents != null && (
            <div style={{ fontSize: 12, color: t.text, fontWeight: 600 }}>
              Total {formatDollars(pact.total_cost_cents)}
              <span style={{ color: t.textSecondary, fontWeight: 400 }}>
                {" · You owe "}{formatDollars(myShare)}{" · "}
                {other ? other.name : "Partner"}{" owes "}{formatDollars(theirShare)}
              </span>
            </div>
          )}

          {/* Paid toggles */}
          {pact.total_cost_cents != null && (
            <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
              <button onClick={function () { onSetPaid(pact, !iPaid); }}
                style={{
                  padding: "6px 12px", borderRadius: 6, border: "1px solid " + (iPaid ? t.green : t.border),
                  background: iPaid ? t.greenSubtle : "transparent",
                  color: iPaid ? t.green : t.textSecondary, fontSize: 11, fontWeight: 700, cursor: "pointer",
                }}>
                {iPaid ? "✓ You paid" : "Mark yourself paid"}
              </button>
              <span style={{ padding: "6px 12px", borderRadius: 6, border: "1px solid " + t.border, background: "transparent", color: theyPaid ? t.green : t.textTertiary, fontSize: 11, fontWeight: 600 }}>
                {theyPaid ? "✓ They paid" : "Waiting on them"}
              </span>
              {/* Payment launcher — only when we owe them and they have a handle */}
              {myShare > 0 && otherPaymentHandle && (
                <button onClick={requestPayment}
                  style={{ padding: "6px 12px", borderRadius: 6, border: "1px solid " + t.accent, background: t.accent, color: t.accentText, fontSize: 11, fontWeight: 700, cursor: "pointer", letterSpacing: "-0.01em" }}>
                  Pay {other ? other.name.split(" ")[0] : "partner"} {formatDollars(myShare)}
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* CTAs — state + side dependent */}
      {expanded && !isTerminal && (
        <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
          {pact.status === "proposed" && !iAgreed && (
            <button onClick={function () { onAgree(pact); }}
              style={{ padding: "8px 14px", borderRadius: 6, border: "none", background: t.accent, color: t.accentText, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
              Agree
            </button>
          )}
          {pact.status === "confirmed" && !bookingForm && (
            <button onClick={handleBookConfirm}
              style={{ padding: "8px 14px", borderRadius: 6, border: "none", background: t.accent, color: t.accentText, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
              I booked it
            </button>
          )}
          {bookingForm && (
            <div style={{ flexBasis: "100%", display: "grid", gridTemplateColumns: "1.5fr 1fr auto", gap: 8 }}>
              <input value={bookingForm.booking_ref}
                onChange={function (e) { setBookingForm(Object.assign({}, bookingForm, { booking_ref: e.target.value })); }}
                placeholder="Booking ref (optional)"
                style={{ padding: "8px 10px", borderRadius: 6, border: "1px solid " + t.border, background: t.inputBg, color: t.text, fontSize: 12 }}/>
              <input type="number" value={bookingForm.total_cost}
                onChange={function (e) { setBookingForm(Object.assign({}, bookingForm, { total_cost: e.target.value })); }}
                placeholder="Total $"
                style={{ padding: "8px 10px", borderRadius: 6, border: "1px solid " + t.border, background: t.inputBg, color: t.text, fontSize: 12 }}/>
              <button onClick={handleBookConfirm}
                style={{ padding: "8px 14px", borderRadius: 6, border: "none", background: t.accent, color: t.accentText, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                Save
              </button>
            </div>
          )}
          {(pact.status === "proposed" || pact.status === "confirmed") && (
            <button onClick={function () { onCancel(pact); }}
              style={{ padding: "8px 14px", borderRadius: 6, border: "1px solid " + t.border, background: "transparent", color: t.textSecondary, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
              Cancel pact
            </button>
          )}
          {pact.status === "booked" && (
            <button onClick={function () { onCancel(pact); }}
              style={{ padding: "8px 14px", borderRadius: 6, border: "1px solid " + t.border, background: "transparent", color: t.textTertiary, fontSize: 11, fontWeight: 500, cursor: "pointer" }}>
              Cancel
            </button>
          )}
        </div>
      )}
    </div>
  );
}
