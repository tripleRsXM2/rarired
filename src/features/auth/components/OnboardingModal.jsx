// src/features/auth/components/OnboardingModal.jsx
//
// First-run flow for a fresh sign-up. Three short steps, each self-
// contained so if the user bails we've still captured something useful:
//
//   Step 1 — Skill + play style. Skill picker surfaces SKILL_HINTS so
//            self-assessment on the new 6-rung ladder is honest.
//
//   Step 2 — Home zone + availability. Drops the free-text suburb
//            input (deprecated in product-principles v2.3 — zones are
//            the authoritative location model now). Availability is
//            set via the preset chip cloud; power users expand the
//            grid.
//
//   Step 3 — Courts they actually play at (up to 8) + optional bio.
//            This + availability is what drives the map-centric
//            matchmaking that Phase 2 lights up.
//
// Everything here writes straight to profiles.* on "Get started".

import { useState } from "react";
import { supabase } from "../../../lib/supabase.js";
import { SKILL_LEVELS, SKILL_HINTS, PLAY_STYLES } from "../../../lib/constants/domain.js";
import { inputStyle } from "../../../lib/theme.js";
import { ZONES } from "../../map/data/zones.js";
import AvailabilityChips from "../../../components/ui/AvailabilityChips.jsx";
import CourtsPicker from "../../../components/ui/CourtsPicker.jsx";
import { track } from "../../../lib/analytics.js";

var TOTAL_STEPS = 3;

export default function OnboardingModal({
  t, authUser, showOnboarding, setShowOnboarding,
  profile, setProfile, setProfileDraft,
  onboardStep, setOnboardStep, onboardDraft, setOnboardDraft,
}) {
  var iStyle = inputStyle(t);
  // Lazily initialise the extended draft fields the first time this
  // modal opens — keeps the shape stable without mutating the parent's
  // onboardDraft state eagerly.
  var [localAvail, setLocalAvail] = useState(onboardDraft.availability || {});
  var [localCourts, setLocalCourts] = useState(onboardDraft.played_courts || []);
  var [localZone, setLocalZone] = useState(onboardDraft.home_zone || (profile && profile.home_zone) || "");

  if (!showOnboarding) return null;

  function primaryBtn(label, onClick, disabled) {
    return (
      <button onClick={onClick} disabled={!!disabled}
        style={{
          width: "100%", padding: "14px", borderRadius: 9, border: "none",
          background: disabled ? t.border : t.accent, color: "#fff",
          fontSize: 14, fontWeight: 600, cursor: disabled ? "not-allowed" : "pointer",
          marginBottom: 8,
        }}>
        {label}
      </button>
    );
  }
  function secondaryBtn(label, onClick) {
    return (
      <button onClick={onClick}
        style={{ width: "100%", padding: "10px", background: "none", border: "none", color: t.textSecondary, fontSize: 12, cursor: "pointer" }}>
        {label}
      </button>
    );
  }

  async function finish() {
    var updated = Object.assign({}, profile, {
      skill:          onboardDraft.skill,
      style:          onboardDraft.style,
      home_zone:      localZone || null,
      availability:   localAvail,
      played_courts:  localCourts,
      bio:            onboardDraft.bio || "",
    });
    setProfile(updated);
    setProfileDraft(updated);
    if (authUser) {
      var res = await supabase.from("profiles").upsert({
        id: authUser.id,
        name:          updated.name || "",
        bio:           updated.bio || "",
        skill:         updated.skill || "Intermediate 1",
        style:         updated.style || "All-Court",
        avatar:        updated.avatar || "",
        home_zone:     updated.home_zone || null,
        availability:  updated.availability || {},
        played_courts: updated.played_courts || [],
      }, { onConflict: "id" });
      if (res.error) console.error("Onboarding save error:", res.error);
      else {
        // Fire-and-forget instrumentation — we want to know which
        // fields new users bothered to fill out. No PII leaves the
        // client; counts + booleans only.
        track("onboarding_completed", {
          skill:           updated.skill || null,
          style:           updated.style || null,
          has_home_zone:   !!updated.home_zone,
          availability_slots: Object.keys(updated.availability || {})
                              .reduce(function (n, d) { return n + (updated.availability[d] || []).length; }, 0),
          played_courts_count: (updated.played_courts || []).length,
          has_bio:         !!(updated.bio && updated.bio.trim()),
        });
      }
    }
    setShowOnboarding(false);
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 400 }}>
      <div className="slide-up" style={{ background: t.modalBg, borderTop: "1px solid " + t.border, borderRadius: "16px 16px 0 0", padding: "28px 24px 40px", width: "100%", maxWidth: 520, maxHeight: "92vh", overflowY: "auto" }}>
        <div style={{ width: 32, height: 3, borderRadius: 2, background: t.border, margin: "0 auto 24px" }}/>

        {/* Progress dots */}
        <div style={{ display: "flex", gap: 6, justifyContent: "center", marginBottom: 22 }}>
          {[1, 2, 3].map(function (s) {
            return <div key={s} style={{ width: s === onboardStep ? 20 : 6, height: 6, borderRadius: 3, background: s === onboardStep ? t.accent : t.border, transition: "width 0.2s ease" }}/>;
          })}
        </div>

        {/* ─── Step 1: skill + style ─── */}
        {onboardStep === 1 && (
          <div className="fade-up">
            <h2 style={{ fontSize: 22, fontWeight: 700, color: t.text, marginBottom: 6, letterSpacing: "-0.4px" }}>Your game, your level.</h2>
            <p style={{ fontSize: 13, color: t.textSecondary, marginBottom: 22, lineHeight: 1.55 }}>
              Pick honest — we use this to match you with players at the right level, not to show off.
            </p>

            <div style={{ marginBottom: 20 }}>
              <label style={{ fontSize: 10, fontWeight: 700, color: t.textSecondary, display: "block", marginBottom: 8, letterSpacing: "0.06em", textTransform: "uppercase" }}>Skill level</label>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {SKILL_LEVELS.map(function (s) {
                  var on = onboardDraft.skill === s;
                  return (
                    <button key={s}
                      onClick={function () { setOnboardDraft(function (d) { return Object.assign({}, d, { skill: s }); }); }}
                      style={{
                        textAlign: "left", padding: "10px 14px", borderRadius: 10,
                        border: "1px solid " + (on ? t.accent : t.border),
                        background: on ? t.accentSubtle : "transparent",
                        color: on ? t.accent : t.text,
                        cursor: "pointer", display: "flex", flexDirection: "column", gap: 2,
                      }}>
                      <span style={{ fontSize: 13, fontWeight: on ? 700 : 600 }}>{s}</span>
                      <span style={{ fontSize: 11, color: on ? t.accent : t.textTertiary, fontWeight: 400 }}>
                        {SKILL_HINTS[s] || ""}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div style={{ marginBottom: 22 }}>
              <label style={{ fontSize: 10, fontWeight: 700, color: t.textSecondary, display: "block", marginBottom: 8, letterSpacing: "0.06em", textTransform: "uppercase" }}>Play style</label>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {PLAY_STYLES.map(function (s) {
                  var on = onboardDraft.style === s;
                  return (
                    <button key={s}
                      onClick={function () { setOnboardDraft(function (d) { return Object.assign({}, d, { style: s }); }); }}
                      style={{
                        padding: "8px 14px", borderRadius: 8,
                        border: "1px solid " + (on ? t.accent : t.border),
                        background: on ? t.accentSubtle : "transparent",
                        color: on ? t.accent : t.textSecondary,
                        fontSize: 13, fontWeight: on ? 700 : 500, cursor: "pointer",
                      }}>{s}</button>
                  );
                })}
              </div>
            </div>

            {primaryBtn("Next →", function () { setOnboardStep(2); }, !onboardDraft.skill || !onboardDraft.style)}
          </div>
        )}

        {/* ─── Step 2: home zone + availability ─── */}
        {onboardStep === 2 && (
          <div className="fade-up">
            <h2 style={{ fontSize: 22, fontWeight: 700, color: t.text, marginBottom: 6, letterSpacing: "-0.4px" }}>Where + when.</h2>
            <p style={{ fontSize: 13, color: t.textSecondary, marginBottom: 20, lineHeight: 1.55 }}>
              Home zone maps you to the right slice of Sydney. Availability helps us surface people whose week overlaps yours.
            </p>

            <div style={{ marginBottom: 18 }}>
              <label style={{ fontSize: 10, fontWeight: 700, color: t.textSecondary, display: "block", marginBottom: 8, letterSpacing: "0.06em", textTransform: "uppercase" }}>Home zone</label>
              <select value={localZone} onChange={function (e) { setLocalZone(e.target.value); }}
                style={Object.assign({}, iStyle)}>
                <option value="">Pick your home zone…</option>
                {ZONES.map(function (z) { return <option key={z.id} value={z.id}>{z.num} · {z.name}</option>; })}
              </select>
            </div>

            <div style={{ marginBottom: 22 }}>
              <label style={{ fontSize: 10, fontWeight: 700, color: t.textSecondary, display: "block", marginBottom: 8, letterSpacing: "0.06em", textTransform: "uppercase" }}>When are you usually free?</label>
              <AvailabilityChips t={t} value={localAvail} onChange={setLocalAvail}/>
            </div>

            {primaryBtn("Next →", function () { setOnboardStep(3); }, !localZone)}
            {secondaryBtn("Back", function () { setOnboardStep(1); })}
          </div>
        )}

        {/* ─── Step 3: courts + bio ─── */}
        {onboardStep === 3 && (
          <div className="fade-up">
            <h2 style={{ fontSize: 22, fontWeight: 700, color: t.text, marginBottom: 6, letterSpacing: "-0.4px" }}>Your courts.</h2>
            <p style={{ fontSize: 13, color: t.textSecondary, marginBottom: 20, lineHeight: 1.55 }}>
              Which courts do you actually play at? Pick up to 8 — this drives who shows up when someone taps a court on the map.
            </p>

            <div style={{ marginBottom: 18 }}>
              <CourtsPicker t={t} value={localCourts} onChange={setLocalCourts}/>
            </div>

            <div style={{ marginBottom: 22 }}>
              <label style={{ fontSize: 10, fontWeight: 700, color: t.textSecondary, display: "block", marginBottom: 6, letterSpacing: "0.06em", textTransform: "uppercase" }}>
                Short bio <span style={{ color: t.textTertiary, fontWeight: 400, textTransform: "none" }}>(optional)</span>
              </label>
              <input value={onboardDraft.bio || ""} placeholder="e.g. Weekend warrior, ex-uni player…"
                onChange={function (e) { var v = e.target.value; setOnboardDraft(function (d) { return Object.assign({}, d, { bio: v }); }); }}
                style={iStyle}/>
            </div>

            {primaryBtn("Get started", finish)}
            {secondaryBtn("Back", function () { setOnboardStep(2); })}
          </div>
        )}
      </div>
    </div>
  );
}
