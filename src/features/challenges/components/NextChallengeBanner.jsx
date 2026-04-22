// src/features/challenges/components/NextChallengeBanner.jsx
//
// Strava-style single-row banner at the top of the Feed showing the
// viewer's *next* accepted challenge — the one they actually need to
// turn up for. Intentionally shows only ONE challenge; the full list
// lives in the People → Challenges tab.
//
// CTA is "Log Scores" (not "Accept"/"Decline") because accepted
// challenges have already been mutually agreed — the remaining action
// is to convert the challenge into a logged match after you've played.
// Tapping Log Scores opens ScoreModal prefilled from the challenge.
//
// Visibility rules:
//   • status === "accepted" (already agreed)
//   • proposed_at within the next 14 days (or no proposed_at — shown anyway)
//   • not dismissed in this session (local state only, resets on reload)

import { useState } from "react";
import { avColor } from "../../../lib/utils/avatar.js";
import { NAV_ICONS } from "../../../lib/constants/navIcons.jsx";

function fmtShortWhen(iso){
  if(!iso) return null;
  var d = new Date(iso);
  if(isNaN(d.getTime())) return null;
  var now = new Date();
  var sameDay = d.toDateString() === now.toDateString();
  var tomorrow = new Date(now); tomorrow.setDate(now.getDate()+1);
  var isTomorrow = d.toDateString() === tomorrow.toDateString();
  var hm = d.toLocaleTimeString("en-AU", { hour:"numeric", minute:"2-digit" });
  if(sameDay)    return "Today · " + hm;
  if(isTomorrow) return "Tomorrow · " + hm;
  return d.toLocaleDateString("en-AU", { weekday:"short", day:"numeric", month:"short" }) + " · " + hm;
}

function pickNext(challenges, authUserId){
  if(!challenges || !challenges.length) return null;
  var FOURTEEN_DAYS = 14 * 24 * 60 * 60 * 1000;
  var now = Date.now();
  var upcoming = challenges.filter(function(c){
    if(c.status !== "accepted") return false;
    if(c.challenger_id !== authUserId && c.challenged_id !== authUserId) return false;
    if(!c.proposed_at) return true; // no date = show anyway, user needs to coordinate
    var ts = new Date(c.proposed_at).getTime();
    if(isNaN(ts)) return true;
    return ts >= now - 3*60*60*1000 && ts <= now + FOURTEEN_DAYS; // -3h buffer for "in-progress" matches
  });
  upcoming.sort(function(a,b){
    // dated challenges first (soonest wins); undated after (newest-created first)
    var ad = a.proposed_at ? new Date(a.proposed_at).getTime() : Infinity;
    var bd = b.proposed_at ? new Date(b.proposed_at).getTime() : Infinity;
    if(ad !== bd) return ad - bd;
    return (new Date(b.created_at||0)).getTime() - (new Date(a.created_at||0)).getTime();
  });
  return upcoming[0] || null;
}

export default function NextChallengeBanner({
  t, authUser, challenges, profileMap,
  onLogScores,       // (challenge, partnerProfile) => void
  onOpenChallenges,  // () => void  — deep-link into the full Challenges tab
}){
  var [dismissed, setDismissed] = useState(false);
  if(!authUser || dismissed) return null;

  var next = pickNext(challenges, authUser.id);
  if(!next) return null;

  var partnerId = next.challenger_id === authUser.id ? next.challenged_id : next.challenger_id;
  var partner = (profileMap && profileMap[partnerId]) || { id: partnerId, name: "Player" };
  var whenLabel = fmtShortWhen(next.proposed_at);
  var whereLabel = [next.venue, next.court].filter(Boolean).join(" · ");

  return (
    <div style={{
      background: t.accentSubtle,
      border: "1px solid " + t.accent + "55",
      borderLeft: "3px solid " + t.accent,
      borderRadius: 0,
      padding: "10px 14px",
      marginBottom: 14,
      display: "flex", alignItems: "center", gap: 12,
    }}>
      {/* Partner avatar — small, reinforces who you're playing */}
      <div style={{
        width: 32, height: 32, borderRadius: "50%", flexShrink: 0,
        background: avColor(partner.name),
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 11, fontWeight: 700, color: "#fff", letterSpacing: "-0.2px",
      }}>
        {((partner.avatar && partner.avatar.length<=2) ? partner.avatar : (partner.name||"?").slice(0,2).toUpperCase())}
      </div>

      {/* Copy — one line on desktop, wraps cleanly on narrow screens */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 9, fontWeight: 700, color: t.accent, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 2 }}>
          Next challenge
        </div>
        <div style={{ fontSize: 13, fontWeight: 600, color: t.text, letterSpacing: "-0.1px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          vs {partner.name || "Player"}
        </div>
        {(whenLabel || whereLabel) && (
          <div style={{ fontSize: 10.5, color: t.textSecondary, marginTop: 1, letterSpacing: "0.01em", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {[whenLabel, whereLabel].filter(Boolean).join(" · ")}
          </div>
        )}
      </div>

      {/* Primary CTA — "Log Scores" opens the ScoreModal prefilled from the
          challenge. Intentionally bold because this IS the action on this
          card (same friction model as a Strava "Log ride" quick-action). */}
      <button
        onClick={function(){ if(onLogScores) onLogScores(next, partner); }}
        style={{
          flexShrink: 0, padding: "7px 12px", borderRadius: 0,
          border: "none", background: t.accent, color: "#fff",
          fontSize: 11, fontWeight: 700, letterSpacing: "0.03em", textTransform: "uppercase",
          cursor: "pointer",
        }}>
        Log scores
      </button>

      {/* Secondary: open the full Challenges tab (where cancel/details live) */}
      {onOpenChallenges && (
        <button
          onClick={onOpenChallenges}
          title="Open Challenges"
          aria-label="Open Challenges"
          style={{
            flexShrink: 0, padding: 4, borderRadius: 0, background: "transparent",
            border: "1px solid " + t.accent + "55", color: t.accent,
            cursor: "pointer", display: "inline-flex", alignItems: "center", lineHeight: 0,
          }}>
          {NAV_ICONS.tournaments(13)}
        </button>
      )}

      {/* Dismiss for this session */}
      <button
        onClick={function(){ setDismissed(true); }}
        title="Dismiss"
        aria-label="Dismiss"
        style={{
          flexShrink: 0, padding: 4, borderRadius: 0, background: "transparent",
          border: "none", color: t.textTertiary,
          cursor: "pointer", display: "inline-flex", alignItems: "center", lineHeight: 0,
        }}>
        {NAV_ICONS.x(12)}
      </button>
    </div>
  );
}
