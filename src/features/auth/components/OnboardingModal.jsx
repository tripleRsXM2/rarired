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
import SkillLevelPicker from "../../rating/components/SkillLevelPicker.jsx";
import { LOCK_WARNING } from "../../rating/copy.js";
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
          width: "100%", padding: "14px", borderRadius: 10, border: "none",
          background: disabled ? t.border : t.accent, color: "#fff",
          fontSize: 11, fontWeight: 800,
          letterSpacing: "0.12em", textTransform: "uppercase",
          cursor: disabled ? "not-allowed" : "pointer",
          marginBottom: 8,
        }}>
        {label}
      </button>
    );
  }
  function secondaryBtn(label, onClick) {
    return (
      <button onClick={onClick}
        style={{
          width: "100%", padding: "10px", background: "none", border: "none",
          color: t.textTertiary,
          fontSize: 10, fontWeight: 800,
          letterSpacing: "0.12em", textTransform: "uppercase",
          cursor: "pointer",
        }}>
        {label}
      </button>
    );
  }
  // Shared style for the field labels.
  var labelStyle = {
    fontSize: 10, fontWeight: 800, color: t.textSecondary,
    display: "block", marginBottom: 8,
    letterSpacing: "0.12em", textTransform: "uppercase",
  };
  // Step eyebrow (STEP X / 3) above each step's display title.
  function stepEyebrow(n) {
    return (
      <div style={{
        fontSize: 9, fontWeight: 800, letterSpacing: "0.16em",
        textTransform: "uppercase", color: t.textTertiary,
        marginBottom: 8,
      }}>Step {n} / 3</div>
    );
  }
  // Display title style — 26/800/-0.8px tight for tabloid feel.
  var titleStyle = {
    fontSize: 26, fontWeight: 800, color: t.text,
    margin: 0, marginBottom: 6,
    letterSpacing: "-0.8px", lineHeight: 1.05,
  };
  var subtitleStyle = {
    fontSize: 13, color: t.textSecondary,
    margin: 0, marginBottom: 22,
    lineHeight: 1.55, letterSpacing: "-0.1px",
  };

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
      // 1. Upsert the user-writable profile fields. Skill is included
      //    here so the row exists with the right starting value before
      //    initialize_rating runs (the RPC also sets skill so this is
      //    redundant but harmless on first run; on a returning user
      //    re-running onboarding without rating, the upsert keeps
      //    skill aligned with whatever they re-pick — the rating RPC
      //    will reject the re-init with "already initialized" and the
      //    skill change will be blocked by the locked-columns guard if
      //    they've already played a confirmed match).
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

      // 2. Initialize the CourtSync Rating. SECURITY DEFINER RPC reads
      //    auth.uid() server-side, validates skill, snaps initial_rating
      //    + ranking_points to the spec's band start. Errors with
      //    "rating already initialized" if the user re-runs onboarding
      //    after a previous completion — that's expected and we just
      //    keep going (their existing rating is still correct).
      if (updated.skill) {
        var initRes = await supabase.rpc("initialize_rating", { p_skill: updated.skill });
        if (initRes.error) {
          var msg = initRes.error.message || "";
          if (msg.indexOf("already initialized") < 0) {
            // Real failure (network, RLS, unknown skill, etc.) — log so
            // we can spot pattern but don't block the flow; user lands
            // on Home with their pre-rating-module state intact.
            console.error("Onboarding initialize_rating error:", initRes.error);
          }
        } else {
          if (track) track("calibration_started", { starting_skill: updated.skill });
        }
      }

      if (!res.error) {
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
            {stepEyebrow(1)}
            <h2 style={titleStyle}>Your game, your level.</h2>
            <p style={subtitleStyle}>
              Pick honest — we use this to match you with players at the right level, not to show off.
            </p>

            <div style={{ marginBottom: 18 }}>
              <SkillLevelPicker
                t={t}
                value={onboardDraft.skill || ""}
                onChange={function (s) {
                  setOnboardDraft(function (d) { return Object.assign({}, d, { skill: s }); });
                }}
                showLockWarning
              />
            </div>

            <div style={{ marginBottom: 24 }}>
              <label style={labelStyle}>Play style</label>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {PLAY_STYLES.map(function (s) {
                  var on = onboardDraft.style === s;
                  return (
                    <button key={s}
                      onClick={function () { setOnboardDraft(function (d) { return Object.assign({}, d, { style: s }); }); }}
                      style={{
                        padding: "9px 14px", borderRadius: 6,
                        border: "1px solid " + (on ? t.text : t.border),
                        background: "transparent",
                        color: on ? t.text : t.textTertiary,
                        fontSize: 10, fontWeight: 800,
                        letterSpacing: "0.12em", textTransform: "uppercase",
                        cursor: "pointer",
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
            {stepEyebrow(2)}
            <h2 style={titleStyle}>Where + when.</h2>
            <p style={subtitleStyle}>
              Home zone maps you to the right slice of Sydney. Availability helps us surface people whose week overlaps yours.
            </p>

            <div style={{ marginBottom: 20 }}>
              <label style={labelStyle}>Home zone</label>
              <select value={localZone} onChange={function (e) { setLocalZone(e.target.value); }}
                style={Object.assign({}, iStyle)}>
                <option value="">Pick your home zone…</option>
                {ZONES.map(function (z) { return <option key={z.id} value={z.id}>{z.num} · {z.name}</option>; })}
              </select>
            </div>

            <div style={{ marginBottom: 24 }}>
              <label style={labelStyle}>When are you usually free?</label>
              <AvailabilityChips t={t} value={localAvail} onChange={setLocalAvail}/>
            </div>

            {primaryBtn("Next →", function () { setOnboardStep(3); }, !localZone)}
            {secondaryBtn("← Back", function () { setOnboardStep(1); })}
          </div>
        )}

        {/* ─── Step 3: courts + bio ─── */}
        {onboardStep === 3 && (
          <div className="fade-up">
            {stepEyebrow(3)}
            <h2 style={titleStyle}>Your courts.</h2>
            <p style={subtitleStyle}>
              Which courts do you actually play at? Pick up to 8 — this drives who shows up when someone taps a court on the map.
            </p>

            <div style={{ marginBottom: 20 }}>
              <CourtsPicker t={t} value={localCourts} onChange={setLocalCourts}/>
            </div>

            <div style={{ marginBottom: 24 }}>
              <label style={labelStyle}>
                Short bio <span style={{ color: t.textTertiary, fontWeight: 600, letterSpacing: "0.06em" }}>· optional</span>
              </label>
              <input value={onboardDraft.bio || ""} placeholder="e.g. Weekend warrior, ex-uni player…"
                onChange={function (e) { var v = e.target.value; setOnboardDraft(function (d) { return Object.assign({}, d, { bio: v }); }); }}
                style={iStyle}/>
            </div>

            {primaryBtn("Get started", finish)}
            {secondaryBtn("← Back", function () { setOnboardStep(2); })}
          </div>
        )}
      </div>
    </div>
  );
}
