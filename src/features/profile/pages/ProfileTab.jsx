// src/tabs/ProfileTab.jsx
//
// Public-facing profile view: stats, match history, achievements, availability.
// Settings have been moved to SettingsScreen (accessible via top-bar avatar).

import { useEffect } from "react";
import { avColor, avatarUrl, displayLocation } from "../../../lib/utils/avatar.js";
import { PresenceDot } from "../../people/components/PresenceIndicator.jsx";
import { DAYS_SHORT } from "../../../lib/constants/domain.js";
import {
  computeRecentForm,
  computeMostPlayed,
  formatConfirmedBadge,
  provisionalLabel,
  computeConfirmationRate,
} from "../utils/profileStats.js";
import { track } from "../../../lib/analytics.js";
import { NAV_ICONS } from "../../../lib/constants/navIcons.jsx";

// ── ProfileMatchRow ──────────────────────────────────────────────────────────
// Compact version of the feed scoreboard for use inside the profile (Recent
// Matches + Matches tab). Same typography + winner-from-sets derivation as
// FeedCard, minus the social footer / action blocks. Header row shows
// opponent, date, tournament pill, and a tiny result chip on the right.
//
// Clicking the row opens the rematch composer (Module 4) — reinforces the
// core loop "played → rematch" without forcing the user to navigate to the
// opponent's profile first. Only enabled when we have a real opponent user
// (i.e. the match was between linked accounts, not a typed-in name) and an
// openChallenge handler is passed in.
function ProfileMatchRow({ m, t, profile, openChallenge }) {
  var sets = m.sets || [];
  // Viewer's scores are s.you for own matches; for tagged matches the row is
  // still rendered from the viewer's POV — normalizeMatch already flips
  // `result` but leaves sets in the submitter's frame, so we compute which
  // side the viewer is on.
  var viewerIsSubmitter = !m.isTagged;
  // Set-count winner derivation (trust the board, not the stored result).
  // Blank/non-numeric scores MUST be skipped — Number("") is 0, not NaN, so
  // a naive "isNaN" check counts "6-" incomplete sets as 6-0 wins and
  // flips the arrow on retirement / in-progress matches.
  var ys = 0, ts = 0;
  sets.forEach(function (s) {
    var yStr = s.you == null ? "" : String(s.you).trim();
    var tStr = s.them == null ? "" : String(s.them).trim();
    if (yStr === "" || tStr === "") return;
    var y = Number(yStr), th = Number(tStr);
    if (Number.isNaN(y) || Number.isNaN(th)) return;
    if (y === th) return;
    if (y > th) ys++; else ts++;
  });
  var isWinStored = m.result === "win";
  var viewerWins = ys !== ts
    ? (viewerIsSubmitter ? ys > ts : ts > ys)
    : isWinStored;
  var viewerName = (profile && profile.name) || "You";
  // For tagged rows, m.oppName is actually the viewer's OWN name (it's
  // what the submitter typed for their opponent — which is the viewer).
  // The real opponent from the viewer's POV is the submitter — we pick it
  // up from the enriched friendName (loadHistory participant fetch).
  var opponentDisplay = m.isTagged
    ? (m.friendName || "Opponent")
    : (opponentDisplay);
  var rows = [
    {
      name: viewerName,
      isWinner: viewerWins,
      scores: viewerIsSubmitter ? sets.map(function(s){return s.you;}) : sets.map(function(s){return s.them;}),
      oppScores: viewerIsSubmitter ? sets.map(function(s){return s.them;}) : sets.map(function(s){return s.you;}),
    },
    {
      name: opponentDisplay,
      isWinner: !viewerWins,
      scores: viewerIsSubmitter ? sets.map(function(s){return s.them;}) : sets.map(function(s){return s.you;}),
      oppScores: viewerIsSubmitter ? sets.map(function(s){return s.you;}) : sets.map(function(s){return s.them;}),
    },
  ];

  // Opponent user id from viewer POV. If viewer submitted the match, opponent
  // is m.opponent_id. If the match was tagged to the viewer, the "opponent"
  // is the submitter. Falls back to null for un-linked (typed-name) matches.
  var opponentUserId = m.isTagged ? m.submitterId : m.opponent_id;
  var canRematch = !!openChallenge && !!opponentUserId;
  function handleRematch(e) {
    if (e) e.stopPropagation();
    if (!canRematch) return;
    openChallenge(
      { id: opponentUserId, name: opponentDisplay, suburb: m.venue || "", skill: "" },
      "rematch",
      m
    );
  }

  return (
    <div
      onClick={canRematch ? handleRematch : undefined}
      title={canRematch ? "Rematch " + (opponentDisplay) : undefined}
      style={{
        background: t.bgCard,
        border: "1px solid " + t.border,
        borderRadius: 0,
        marginBottom: 8,
        overflow: "hidden",
        cursor: canRematch ? "pointer" : "default",
      }}>
      {/* Header: opponent + date + tourn + result chip */}
      <div style={{ display: "flex", alignItems: "center", padding: "10px 14px", gap: 10 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: t.text, letterSpacing: "-0.1px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            vs {opponentDisplay}
          </div>
          <div style={{ fontSize: 10.5, color: t.textTertiary, marginTop: 2, letterSpacing: "0.01em", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {[m.date, m.tournName && m.tournName !== "Casual Match" ? m.tournName : (m.tournName === "Casual Match" ? "Casual" : null), m.venue].filter(Boolean).join(" · ")}
          </div>
        </div>
        {m.status === "confirmed" && (
          <span style={{
            fontSize: 9, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase",
            color: viewerWins ? t.green : t.red,
            background: viewerWins ? t.greenSubtle : t.redSubtle,
            padding: "2px 7px", borderRadius: 20, flexShrink: 0,
          }}>{viewerWins ? "Won" : "Lost"}</span>
        )}
        {m.status !== "confirmed" && (
          <span style={{
            fontSize: 9, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase",
            color: t.textTertiary, background: t.bgTertiary,
            padding: "2px 7px", borderRadius: 20, flexShrink: 0,
          }}>
            {m.status === "pending_confirmation" ? "Pending" :
             m.status === "disputed" ? "Disputed" :
             m.status === "pending_reconfirmation" ? "Re-proposed" :
             m.status === "voided" ? "Voided" :
             m.status === "expired" ? "Unverified" : m.status}
          </span>
        )}
        {canRematch && (
          <span
            onClick={handleRematch}
            title={"Rematch " + (opponentDisplay)}
            style={{
              flexShrink: 0, display: "flex", alignItems: "center",
              color: t.textTertiary, padding: 2,
            }}>
            {NAV_ICONS.rematch(14)}
          </span>
        )}
      </div>

      {/* Scoreboard — same compact style as feed card */}
      {sets.length > 0 && (
        <>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", padding: "0 14px", borderTop: "1px solid " + t.border }}>
            <div style={{ display: "flex", alignItems: "center" }}>
              {sets.map(function (_, i) {
                return (
                  <div key={i} style={{ width: 24, textAlign: "center", fontSize: 8, fontWeight: 600, color: t.textTertiary, letterSpacing: "0.04em", padding: "4px 0" }}>
                    S{i + 1}
                  </div>
                );
              })}
              <div style={{ width: 16 }} />
            </div>
          </div>
          {rows.map(function (row, ri) {
            return (
              <div key={ri} style={{
                display: "flex", alignItems: "center",
                padding: "6px 14px",
                borderTop: "1px solid " + t.border,
              }}>
                <div style={{
                  flex: 1, minWidth: 0,
                  fontSize: 13,
                  fontWeight: row.isWinner ? 600 : 400,
                  color: row.isWinner ? t.text : t.textSecondary,
                  letterSpacing: "-0.1px",
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", paddingRight: 8,
                }}>{row.name}</div>
                {row.scores.map(function (score, i) {
                  var opp = row.oppScores[i];
                  var wonSet = (score !== "" && score !== undefined && opp !== "" && opp !== undefined)
                    ? Number(score) > Number(opp) : false;
                  return (
                    <div key={i} style={{
                      width: 24, textAlign: "center",
                      fontSize: 14, fontWeight: wonSet ? 600 : 400,
                      color: wonSet ? t.text : t.textTertiary,
                      fontVariantNumeric: "tabular-nums", letterSpacing: "-0.2px", lineHeight: 1,
                    }}>
                      {score !== undefined && score !== "" ? score : "–"}
                    </div>
                  );
                })}
                <div style={{ width: 16, textAlign: "center" }}>
                  {row.isWinner && (
                    <span style={{ fontSize: 9, color: t.green, fontWeight: 600 }}>◀</span>
                  )}
                </div>
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}

var BADGES=[
  {id:"first", label:"First Match",   desc:"Play your first match",             icon:"🎾", check:function(w,p){return p>=1;}},
  {id:"win1",  label:"First Win",     desc:"Win your first match",              icon:"🏆", check:function(w){return w>=1;}},
  {id:"hat",   label:"Hat Trick",     desc:"Win 3 matches",                     icon:"🔥", check:function(w){return w>=3;}},
  {id:"ded",   label:"Dedicated",     desc:"Play 10 matches",                   icon:"💪", check:function(w,p){return p>=10;}},
  {id:"sharp", label:"Sharp",         desc:"70%+ win rate (5+ matches)",        icon:"⚡", check:function(w,p){return p>=5&&p>0&&Math.round(w/p*100)>=70;}},
  {id:"fire",  label:"On Fire",       desc:"3-match win streak",                icon:"🚀", check:function(w,p,sc,st){return st==="win"&&sc>=3;}},
  {id:"beast", label:"Unstoppable",   desc:"5-match win streak",                icon:"👑", check:function(w,p,sc,st){return st==="win"&&sc>=5;}},
  {id:"vet",   label:"Veteran",       desc:"Play 25 matches",                   icon:"🎖️",check:function(w,p){return p>=25;}},
];

export default function ProfileTab({
  t, authUser, profile,
  history,
  profileTab, setProfileTab,
  onOpenSettings,
  openProfile,
  // Module 4: rematch from match history — clicking a match row opens the
  // challenge composer in rematch mode (prefills venue/court from the match).
  openChallenge,
  // Module 7: active leagues the viewer is a member of + a deep-link to the
  // Leagues sub-tab so the profile page reinforces league identity/retention.
  myLeagues,
  onOpenLeagues,
}) {
  var wins    = profile.wins         != null ? profile.wins         : history.filter(function(m){return m.result==="win";}).length;
  var losses  = profile.losses       != null ? profile.losses       : history.length - wins;
  var played  = profile.matches_played != null ? profile.matches_played : history.length;
  var winRate = played ? Math.round(wins/played*100) : 0;
  var rankPts = profile.ranking_points != null ? profile.ranking_points : Math.max(0,1000+wins*15-losses*10);

  var streakCount = profile.streak_count != null ? profile.streak_count : 0;
  var streakType  = profile.streak_type  != null ? profile.streak_type  : null;
  if(profile.streak_count == null && history.length){
    streakType = history[0].result;
    for(var si=0;si<history.length;si++){if(history[si].result===streakType)streakCount++;else break;}
  }
  var streakLabel = streakCount===0 ? "—" : streakCount+(streakType==="win"?" W":" L");

  var badges = BADGES.map(function(b){
    return Object.assign({},b,{unlocked:b.check(wins,played,streakCount,streakType)});
  });
  var unlockedCount = badges.filter(function(b){return b.unlocked;}).length;

  // Module 1 additions — derived identity signals.
  var recentForm = computeRecentForm(history, 5);
  var myId = authUser && authUser.id;
  var mostPlayed = computeMostPlayed(history, myId, 5);
  var confirmedBadge = formatConfirmedBadge(profile);
  // Module 5 additions — provisional rating + confirmation-rate trust signal.
  var provLabel = provisionalLabel(profile);
  var confRate = computeConfirmationRate(history);

  // Module 3.5: self-view analytics. Fires once per profile-id load.
  useEffect(function () {
    if (!profile || !profile.id) return;
    track("profile_viewed", { target_user_id: profile.id, is_self: true });
  }, [profile && profile.id]);

  return (
    <div style={{maxWidth:680,margin:"0 auto"}}>

      {/* ── Hero header ──────────────────────────────────────────────────────── */}
      <div style={{padding:"28px 20px 0",background:t.bg}}>
        <div style={{display:"flex",alignItems:"flex-start",gap:16,marginBottom:20}}>
          <div style={{ position: "relative", flexShrink: 0 }}>
            {(function(){
              var url = avatarUrl(profile);
              if(url){
                return (
                  <img src={url} alt={profile.name}
                    style={{
                      width:72,height:72,borderRadius:"50%",objectFit:"cover",
                      boxShadow:"0 0 0 3px "+t.bg+", 0 0 0 5px "+avColor(profile.name)+"44",
                      background:"#eee",
                    }}/>
                );
              }
              return (
                <div style={{
                  width:72,height:72,borderRadius:"50%",
                  background:avColor(profile.name),
                  display:"flex",alignItems:"center",justifyContent:"center",
                  fontSize:24,fontWeight:800,color:"#fff",
                  boxShadow:"0 0 0 3px "+t.bg+", 0 0 0 5px "+avColor(profile.name)+"44",
                }}>{profile.avatar}</div>
              );
            })()}
            {/* Own presence — bypass privacy so the user always sees
                their own "online" dot regardless of visibility settings. */}
            <PresenceDot profile={profile} t={t} viewerIsSelf={true} size={16} />
          </div>
          <div style={{flex:1,paddingTop:4}}>
            <div style={{fontSize:22,fontWeight:800,color:t.text,letterSpacing:"-0.5px",lineHeight:1.1}}>{profile.name}</div>
            {displayLocation(profile)&&<div style={{fontSize:13,color:t.textSecondary,marginTop:3}}>{displayLocation(profile)}</div>}
            <div style={{display:"flex",gap:6,marginTop:8,flexWrap:"wrap"}}>
              <span style={{fontSize:11,fontWeight:700,color:t.accent,background:t.accentSubtle,padding:"3px 9px",borderRadius:20,letterSpacing:"0.02em"}}>{profile.skill}</span>
              <span style={{fontSize:11,fontWeight:600,color:t.green,background:t.greenSubtle,padding:"3px 9px",borderRadius:20}}>{profile.style}</span>
            </div>
          </div>
          {/* "Edit profile" shortcut — opens Settings. Transparent chrome, SVG icon. */}
          {authUser&&(
            <button
              onClick={onOpenSettings}
              title="Edit profile"
              style={{
                padding:"6px 10px",
                border:"1px solid "+t.border,background:"transparent",color:t.textSecondary,
                fontSize:12,fontWeight:600,flexShrink:0,marginTop:4,
                display:"inline-flex",alignItems:"center",gap:6,
                cursor:"pointer",
              }}>
              <span style={{display:"flex",alignItems:"center"}}>{NAV_ICONS.edit(13)}</span>
              Edit
            </button>
          )}
        </div>
        {profile.bio&&<p style={{fontSize:13,color:t.textSecondary,lineHeight:1.6,marginBottom:16,marginTop:-8}}>{profile.bio}</p>}

        {/* Trust + rating-state pills row (Modules 1 + 5 stack here) */}
        {(confirmedBadge||provLabel||confRate)&&(
          <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:14}}>
            {confirmedBadge&&(
              <span style={{
                display:"inline-flex",alignItems:"center",gap:6,
                padding:"5px 10px",borderRadius:20,
                background:t.greenSubtle,color:t.green,
                border:"1px solid "+t.green+"33",
                fontSize:11,fontWeight:700,letterSpacing:"0.02em",
              }}>
                <span>✓</span><span>{confirmedBadge}</span>
              </span>
            )}
            {provLabel&&(
              <span style={{
                display:"inline-flex",alignItems:"center",gap:6,
                padding:"5px 10px",borderRadius:20,
                background:t.orangeSubtle,color:t.orange,
                border:"1px solid "+t.orange+"33",
                fontSize:11,fontWeight:700,letterSpacing:"0.02em",
              }}>
                <span>⚖</span><span>{provLabel}</span>
              </span>
            )}
            {confRate&&(
              <span style={{
                display:"inline-flex",alignItems:"center",gap:6,
                padding:"5px 10px",borderRadius:20,
                background:t.bgTertiary,color:t.textSecondary,
                border:"1px solid "+t.border,
                fontSize:11,fontWeight:700,letterSpacing:"0.02em",
              }}
              title={confRate.total + " ranked matches resolved (confirmed + voided + expired)"}>
                <span>{confRate.pct}%</span><span style={{fontWeight:500}}>confirmed</span>
              </span>
            )}
          </div>
        )}
        {/* Recent form chips — sharp squares to match feed chrome */}
        {recentForm.length>0&&(
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:14}}>
            <span style={{fontSize:9,fontWeight:700,color:t.textTertiary,textTransform:"uppercase",letterSpacing:"0.07em"}}>Recent form</span>
            <div style={{display:"flex",gap:3}}>
              {recentForm.map(function(r,i){
                var isW=r==="W";
                return (
                  <span key={i} style={{
                    width:18,height:18,borderRadius:0,
                    display:"flex",alignItems:"center",justifyContent:"center",
                    fontSize:10,fontWeight:700,
                    color:isW?t.green:t.red,
                    background:isW?t.greenSubtle:t.redSubtle,
                    border:"1px solid "+(isW?t.green:t.red)+"33",
                  }}>{r}</span>
                );
              })}
            </div>
          </div>
        )}

        {/* Rank + achievements summary — sharp corners, tighter typography */}
        <div style={{background:t.bgCard,border:"1px solid "+t.border,borderRadius:0,padding:"12px 14px",marginBottom:12,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div>
            <div style={{fontSize:9,fontWeight:700,color:t.textTertiary,textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:2}}>Ranking Points</div>
            <div style={{fontSize:22,fontWeight:800,color:t.text,letterSpacing:"-0.4px",fontVariantNumeric:"tabular-nums",lineHeight:1.1}}>{rankPts.toLocaleString()}</div>
          </div>
          <div style={{textAlign:"right"}}>
            <div style={{fontSize:9,fontWeight:700,color:t.textTertiary,textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:2}}>Achievements</div>
            <div style={{fontSize:22,fontWeight:800,color:t.gold,letterSpacing:"-0.4px",lineHeight:1.1}}>
              {unlockedCount}<span style={{fontSize:12,color:t.textTertiary,fontWeight:500}}>/{badges.length}</span>
            </div>
          </div>
        </div>

        {/* Quick stats strip — 4-col, sharp corners, Strava label/value rhythm */}
        <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:0,marginBottom:18,background:t.bgCard,border:"1px solid "+t.border}}>
          {[
            {l:"Matches",v:history.length,                              c:t.text},
            {l:"Wins",   v:wins,                                        c:t.green},
            {l:"Win %",  v:history.length?winRate+"%":"—",              c:t.accent},
            {l:"Streak", v:streakLabel, c:streakType==="win"?t.green:streakType==="loss"?t.red:t.textTertiary},
          ].map(function(s,i){
            return (
              <div key={s.l} style={{padding:"10px 8px",textAlign:"center",borderLeft:i===0?"none":"1px solid "+t.border}}>
                <div style={{fontSize:9,color:t.textTertiary,fontWeight:700,letterSpacing:"0.06em",textTransform:"uppercase",marginBottom:3}}>{s.l}</div>
                <div style={{fontSize:14,fontWeight:700,color:s.c,fontVariantNumeric:"tabular-nums",letterSpacing:"-0.2px",lineHeight:1.1}}>{s.v}</div>
              </div>
            );
          })}
        </div>

        {/* Sub-tabs: overview / matches / achievements only */}
        <div style={{display:"flex",borderBottom:"1px solid "+t.border,marginLeft:-20,marginRight:-20,paddingLeft:20}}>
          {["overview","matches","achievements"].map(function(pt){
            var on=profileTab===pt;
            return (
              <button key={pt}
                onClick={function(){setProfileTab(pt);}}
                style={{
                  padding:"10px 16px",border:"none",background:"transparent",
                  color:on?t.accent:t.textTertiary,
                  fontSize:12,fontWeight:on?700:500,
                  borderBottom:"2px solid "+(on?t.accent:"transparent"),
                  marginBottom:"-1px",textTransform:"capitalize",letterSpacing:"0.01em",
                }}>
                {pt}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Overview ─────────────────────────────────────────────────────────── */}
      {profileTab==="overview"&&(
        <div style={{padding:"20px 20px 100px"}} className="fade-up">
          <div style={{fontSize:10,fontWeight:700,color:t.textTertiary,textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:10}}>Performance</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:0,marginBottom:24,background:t.bgCard,border:"1px solid "+t.border}}>
            {[
              {l:"Total Played", v:history.length,                                   sub:"all time",                                                        c:t.text},
              {l:"Total Wins",   v:wins,                                              sub:"all time",                                                        c:t.green},
              {l:"Total Losses", v:losses,                                            sub:"all time",                                                        c:t.red},
              {l:"Win Rate",     v:history.length?winRate+"%":"—", sub:history.length?"from "+history.length+" matches":"no matches yet", c:t.accent},
            ].map(function(s,i){
              return (
                <div key={s.l} style={{
                  padding:"14px 16px",
                  borderLeft:i%2===1?"1px solid "+t.border:"none",
                  borderTop:i>=2?"1px solid "+t.border:"none",
                }}>
                  <div style={{fontSize:9,color:t.textTertiary,fontWeight:700,letterSpacing:"0.07em",textTransform:"uppercase",marginBottom:4}}>{s.l}</div>
                  <div style={{fontSize:22,fontWeight:800,color:s.c,fontVariantNumeric:"tabular-nums",letterSpacing:"-0.4px",lineHeight:1.1}}>{s.v}</div>
                  <div style={{fontSize:10,color:t.textTertiary,marginTop:3,letterSpacing:"0.01em"}}>{s.sub}</div>
                </div>
              );
            })}
          </div>

          {/* Recent matches */}
          <div style={{fontSize:10,fontWeight:700,color:t.textTertiary,textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:10,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <span>Recent Matches</span>
            {history.length>3&&<button onClick={function(){setProfileTab("matches");}} style={{background:"none",border:"none",color:t.accent,fontSize:11,fontWeight:600}}>See all</button>}
          </div>
          {history.length===0
            ?<div style={{background:t.bgCard,border:"1px solid "+t.border,borderRadius:0,padding:"28px 20px",textAlign:"center"}}>
              <div style={{fontSize:28,marginBottom:8}}>🎾</div>
              <div style={{fontSize:14,fontWeight:600,color:t.text,marginBottom:4}}>No matches yet</div>
              <div style={{fontSize:13,color:t.textTertiary}}>Enter a tournament or log a match to get started.</div>
            </div>
            :history.slice(0,3).map(function(m){
              return <ProfileMatchRow key={m.id} m={m} t={t} profile={profile} openChallenge={openChallenge} />;
            })
          }

          {/* Most-played opponents — identity check: "I've played these
              people consistently". Each chip is clickable when the opponent
              is a real user (opponent_id present), taking the viewer into
              that player's public profile. */}
          {mostPlayed.length>0&&(
            <div style={{marginTop:24}}>
              <div style={{fontSize:10,fontWeight:700,color:t.textTertiary,textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:10}}>Most played</div>
              <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                {mostPlayed.map(function(o,i){
                  var clickable = !!o.opponentId && !!openProfile;
                  return (
                    <div key={i}
                      onClick={clickable ? function(){openProfile(o.opponentId);} : undefined}
                      style={{
                        display:"flex",alignItems:"center",gap:8,
                        background:t.bgCard,border:"1px solid "+t.border,
                        borderRadius:0,padding:"8px 12px 8px 8px",
                        cursor:clickable?"pointer":"default",
                      }}>
                      <div style={{
                        width:28,height:28,borderRadius:"50%",flexShrink:0,
                        background:avColor(o.opponentName),
                        display:"flex",alignItems:"center",justifyContent:"center",
                        fontSize:10,fontWeight:700,color:"#fff",
                      }}>{(o.opponentName||"?").slice(0,2).toUpperCase()}</div>
                      <div>
                        <div style={{fontSize:12,fontWeight:600,color:t.text,lineHeight:1.1}}>{o.opponentName}</div>
                        <div style={{fontSize:10,color:t.textTertiary,marginTop:2,letterSpacing:"0.02em"}}>
                          <span style={{color:t.green,fontWeight:700}}>{o.wins}</span>
                          <span style={{margin:"0 3px"}}>–</span>
                          <span style={{color:t.red,fontWeight:700}}>{o.losses}</span>
                          <span style={{marginLeft:6}}>· {o.plays} played</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Your leagues — active private seasons with friends (Module 7).
              Rank is pulled lazily from league standings in the Leagues tab;
              on the profile page we just show the league name + tap through. */}
          {(function(){
            var activeLeagues = (myLeagues||[]).filter(function(lg){
              return lg.status === "active" && lg.my_status === "active";
            });
            if (!activeLeagues.length) return null;
            return (
              <div style={{marginTop:24}}>
                <div style={{fontSize:10,fontWeight:700,color:t.textTertiary,textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:10,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <span>Your leagues</span>
                  {onOpenLeagues&&(
                    <button onClick={onOpenLeagues} style={{background:"none",border:"none",color:t.accent,fontSize:11,fontWeight:600,cursor:"pointer"}}>
                      See all
                    </button>
                  )}
                </div>
                <div style={{background:t.bgCard,border:"1px solid "+t.border}}>
                  {activeLeagues.slice(0,4).map(function(lg, i){
                    return (
                      <div key={lg.id}
                        onClick={onOpenLeagues||undefined}
                        style={{
                          display:"flex",alignItems:"center",gap:10,
                          padding:"10px 14px",
                          borderTop: i===0 ? "none" : "1px solid "+t.border,
                          cursor: onOpenLeagues ? "pointer" : "default",
                        }}>
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{fontSize:13,fontWeight:700,color:t.text,letterSpacing:"-0.1px",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                            {lg.name}
                          </div>
                          <div style={{fontSize:10.5,color:t.textTertiary,marginTop:2,letterSpacing:"0.01em",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                            {(lg.match_format==="one_set"?"One set":"Best of 3")}
                            {lg.max_matches_per_opponent ? " · max "+lg.max_matches_per_opponent+" vs each" : ""}
                            {lg.end_date ? " · ends "+lg.end_date : ""}
                          </div>
                        </div>
                        <span style={{color:t.textTertiary,flexShrink:0,display:"flex",alignItems:"center"}}>
                          <svg width="14" height="14" viewBox="0 0 18 18" fill="none">
                            <path d="M7 4l5 5-5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}

          {/* Achievements preview */}
          {unlockedCount>0&&(
            <div style={{marginTop:24}}>
              <div style={{fontSize:10,fontWeight:700,color:t.textTertiary,textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:10,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <span>Achievements</span>
                <button onClick={function(){setProfileTab("achievements");}} style={{background:"none",border:"none",color:t.accent,fontSize:11,fontWeight:600}}>See all</button>
              </div>
              <div style={{display:"flex",gap:8,overflowX:"auto",paddingBottom:4}}>
                {badges.filter(function(b){return b.unlocked;}).map(function(b){
                  return (
                    <div key={b.id} style={{background:t.bgCard,border:"1px solid "+t.border,borderRadius:0,padding:"12px",textAlign:"center",minWidth:80,flexShrink:0}}>
                      <div style={{fontSize:22,marginBottom:4}}>{b.icon}</div>
                      <div style={{fontSize:9,fontWeight:700,color:t.text,lineHeight:1.2,textTransform:"uppercase",letterSpacing:"0.04em"}}>{b.label}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Availability (read-only, Edit link opens Settings) */}
          <div style={{marginTop:24}}>
            <div style={{fontSize:10,fontWeight:700,color:t.textTertiary,textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:10,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <span>Availability</span>
              {authUser&&<button onClick={onOpenSettings} style={{background:"none",border:"none",color:t.accent,fontSize:11,fontWeight:600}}>Edit</button>}
            </div>
            <div style={{background:t.bgCard,border:"1px solid "+t.border,borderRadius:0,padding:"14px 16px"}}>
              {DAYS_SHORT.filter(function(d){return((profile.availability||{})[d]||[]).length>0;}).length===0
                ?<p style={{fontSize:13,color:t.textTertiary,margin:0}}>No availability set yet.</p>
                :<div style={{display:"flex",flexDirection:"column",gap:8}}>
                  {DAYS_SHORT.filter(function(d){return((profile.availability||{})[d]||[]).length>0;}).map(function(day){
                    return (
                      <div key={day} style={{display:"flex",alignItems:"center",gap:10}}>
                        <span style={{fontSize:10,fontWeight:700,color:t.textSecondary,width:30,flexShrink:0,textTransform:"uppercase",letterSpacing:"0.06em"}}>{day}</span>
                        <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
                          {((profile.availability||{})[day]||[]).map(function(b){
                            return <span key={b} style={{fontSize:10,fontWeight:600,color:t.accent,background:t.accentSubtle,border:"1px solid "+t.accent+"33",padding:"2px 8px",borderRadius:0}}>{b}</span>;
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              }
            </div>
          </div>
        </div>
      )}

      {/* ── Matches ──────────────────────────────────────────────────────────── */}
      {profileTab==="matches"&&(
        <div style={{padding:"20px 20px 100px"}} className="fade-up">
          <div style={{fontSize:10,fontWeight:700,color:t.textTertiary,textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:12}}>
            Match History · {history.length} {history.length===1?"match":"matches"}
          </div>
          {history.length===0
            ?<div style={{background:t.bgCard,border:"1px solid "+t.border,borderRadius:0,padding:"40px 20px",textAlign:"center"}}>
              <div style={{fontSize:36,marginBottom:12}}>🎾</div>
              <div style={{fontSize:15,fontWeight:700,color:t.text,marginBottom:6}}>No matches yet</div>
              <div style={{fontSize:13,color:t.textTertiary,lineHeight:1.5}}>Complete a tournament match and log your score to see your history here.</div>
            </div>
            :history.map(function(m){
              return <ProfileMatchRow key={m.id} m={m} t={t} profile={profile} openChallenge={openChallenge} />;
            })
          }
        </div>
      )}

      {/* ── Achievements ─────────────────────────────────────────────────────── */}
      {profileTab==="achievements"&&(
        <div style={{padding:"20px 20px 100px"}} className="fade-up">
          <div style={{fontSize:10,fontWeight:700,color:t.textTertiary,textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:4}}>Badges</div>
          <div style={{fontSize:13,color:t.textSecondary,marginBottom:14}}>{unlockedCount} of {badges.length} unlocked</div>
          <div style={{background:t.bgTertiary,borderRadius:0,height:3,marginBottom:20,overflow:"hidden"}}>
            <div style={{height:"100%",width:(unlockedCount/badges.length*100)+"%",background:t.gold,transition:"width 0.5s ease"}}/>
          </div>
          <div style={{background:t.bgCard,border:"1px solid "+t.border}}>
            {badges.map(function(b,i){
              return (
                <div key={b.id} style={{
                  borderTop:i===0?"none":"1px solid "+t.border,
                  padding:"12px 14px",display:"flex",alignItems:"center",gap:12,
                  opacity:b.unlocked?1:0.45,
                }}>
                  <div style={{
                    width:36,height:36,borderRadius:0,flexShrink:0,
                    background:b.unlocked?t.goldSubtle:t.bgTertiary,
                    border:"1px solid "+(b.unlocked?t.gold+"33":t.border),
                    display:"flex",alignItems:"center",justifyContent:"center",
                    fontSize:18,filter:b.unlocked?"none":"grayscale(1)",
                  }}>
                    {b.icon}
                  </div>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:13,fontWeight:700,color:t.text,letterSpacing:"-0.1px"}}>{b.label}</div>
                    <div style={{fontSize:11,color:t.textTertiary,marginTop:2}}>{b.desc}</div>
                  </div>
                  {b.unlocked&&(
                    <span style={{
                      fontSize:9,fontWeight:700,color:t.gold,flexShrink:0,
                      textTransform:"uppercase",letterSpacing:"0.06em",
                      background:t.goldSubtle,border:"1px solid "+t.gold+"33",
                      padding:"2px 7px",borderRadius:20,
                    }}>Unlocked</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
