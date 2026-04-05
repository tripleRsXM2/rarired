{\rtf1\ansi\ansicpg1252\cocoartf2868
\cocoatextscaling0\cocoaplatform0{\fonttbl\f0\fmodern\fcharset0 CourierNewPSMT;}
{\colortbl;\red255\green255\blue255;\red0\green0\blue0;}
{\*\expandedcolortbl;;\cssrgb\c0\c0\c0;}
\paperw11900\paperh16840\margl1440\margr1440\vieww11520\viewh8400\viewkind0
\pard\tx560\tx1120\tx1680\tx2240\tx2800\tx3360\tx3920\tx4480\tx5040\tx5600\tx6160\tx6720\pardirnatural\partightenfactor0

\f0\fs19\fsmilli9600 \cf2 import \{ useState, useEffect, useRef \} from "react";\
\
const PILOT_VENUE = \{ id: "sydney-boys", name: "Sydney Boys High School", suburb: "Moore Park", address: "556 Cleveland St, Moore Park", url: "[https://www.tennisvenues.com.au/booking/sydney-boys-high-school](https://www.tennisvenues.com.au/booking/sydney-boys-high-school)", courts: ["Court 1","Court 2","Court 3","Court 4"], hours: "6am-11pm", emoji: "SB" \};\
\
const ENTRY_FEES = \{ 8: 39, 16: 45, 32: 39 \};\
const PRIZES = \{\
8:  \{ item: "Babolat Pure Drive Lite", value: 159, img: "BD" \},\
16: \{ item: "Wilson Clash 100 v2", value: 419, img: "WC" \},\
32: \{ item: "Head Speed Pro 2024", value: 499, img: "HS" \},\
\};\
const BALLS_PER_MATCH = 3;\
const BALL_COST = 2.67;\
\
const SKILL_LEVELS = ["Beginner","Intermediate","Advanced","Competitive"];\
const PLAY_STYLES = ["Baseline","Serve and Volley","All-Court","Defensive"];\
const DAYS_SHORT = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];\
const TIME_BLOCKS = ["Morning","Afternoon","Evening","Late"];\
const AV_COLORS = ["#0071e3","#34c759","#ff9500","#ff3b30","#5856d6","#af52de","#ff2d55"];\
\
function makeTheme(dark) \{\
if (dark) return \{ bg: "#0d1f1f", bgTertiary: "#1a3333", surfaceSolid: "#162b2b", border: "rgba(255,255,255,0.1)", text: "#f0f0ee", textSecondary: "#8fa8a8", textTertiary: "#4a6666", accent: "#4ecdc4", accentText: "#0d1f1f", accentSubtle: "rgba(78,205,196,0.15)", green: "#4ecdc4", greenSubtle: "rgba(78,205,196,0.12)", red: "#ff6b6b", redSubtle: "rgba(255,107,107,0.12)", orange: "#ff9500", orangeSubtle: "rgba(255,149,0,0.12)", gold: "#ffd700", inputBg: "#1a3333", modalBg: "#162b2b", navBg: "rgba(13,31,31,0.92)", tabBar: "rgba(13,31,31,0.97)" \};\
return \{ bg: "#f7f4ef", bgTertiary: "#eeebe4", surfaceSolid: "#ffffff", border: "rgba(0,0,0,0.08)", text: "#1a2424", textSecondary: "#5a7070", textTertiary: "#a0b4b4", accent: "#2a9d8f", accentText: "#ffffff", accentSubtle: "rgba(42,157,143,0.1)", green: "#2a9d8f", greenSubtle: "rgba(42,157,143,0.1)", red: "#e55353", redSubtle: "rgba(229,83,83,0.1)", orange: "#e07b00", orangeSubtle: "rgba(224,123,0,0.1)", gold: "#b8960c", inputBg: "#f7f4ef", modalBg: "#ffffff", navBg: "rgba(247,244,239,0.92)", tabBar: "rgba(247,244,239,0.97)" \};\
\}\
\
function avColor(name) \{ return AV_COLORS[(name || "A").charCodeAt(0) % AV_COLORS.length]; \}\
function fmtShort(d) \{ return d.toLocaleDateString("en-AU", \{ weekday: "short", day: "numeric", month: "short" \}); \}\
function daysUntil(dateStr) \{\
if (!dateStr) return null;\
var parts = dateStr.split("-");\
if (parts.length !== 3) return null;\
var target = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));\
var now = new Date(); now.setHours(0,0,0,0);\
return Math.ceil((target - now) / 86400000);\
\}\
function totalRounds(size) \{ return Math.log2(size); \}\
function roundLabel(roundNum, size) \{\
var matchesInRound = size / Math.pow(2, roundNum);\
if (matchesInRound === 1) return "Final";\
if (matchesInRound === 2) return "Semifinals";\
if (matchesInRound === 4) return "Quarterfinals";\
return "Round of " + (matchesInRound * 2);\
\}\
function matchesInRound(roundNum, size) \{ return size / Math.pow(2, roundNum); \}\
function netRevenue(size) \{\
var rev = size * ENTRY_FEES[size];\
var prize = PRIZES[size].value;\
var numMatches = size - 1;\
var balls = numMatches * BALLS_PER_MATCH * BALL_COST;\
var stripe = size * (ENTRY_FEES[size] * 0.0175 + 0.30);\
return Math.round(rev - prize - balls - stripe);\
\}\
\
export default function App() \{\
var [dark, setDark] = useState(true);\
var t = makeTheme(dark);\
\
useEffect(function() \{\
var el = document.createElement("style");\
el.id = "cs-css";\
el.textContent = ["*,*::before,*::after\{box-sizing:border-box;margin:0;padding:0\}","html,body\{height:100%\}","body\{font-family:-apple-system,sans-serif;-webkit-font-smoothing:antialiased\}","@keyframes fadeUp\{from\{opacity:0;transform:translateY(10px)\}to\{opacity:1;transform:translateY(0)\}\}","@keyframes shimmer\{0%,100%\{opacity:1\}50%\{opacity:.35\}\}","@keyframes pop\{0%\{transform:scale(.94);opacity:0\}100%\{transform:scale(1);opacity:1\}\}","@keyframes slideUp\{from\{transform:translateY(100%);opacity:0\}to\{transform:translateY(0);opacity:1\}\}","@keyframes glow\{0%,100%\{box-shadow:0 0 12px rgba(255,215,0,.3)\}50%\{box-shadow:0 0 28px rgba(255,215,0,.7)\}\}", ".fade-up\{animation:fadeUp .3s ease both\}",".shimmer\{animation:shimmer 1.6s ease-in-out infinite\}",".pop\{animation:pop .22s cubic-bezier(.34,1.56,.64,1) both\}",".slide-up\{animation:slideUp .3s ease both\}",".glow\{animation:glow 2s ease-in-out infinite\}","button\{cursor:pointer;font-family:inherit\}","::-webkit-scrollbar\{width:0\}","input,select,textarea\{font-family:inherit\}"].join("");\
document.head.appendChild(el);\
return function() \{ var o = document.getElementById("cs-css"); if (o) o.remove(); \};\
\}, []);\
\
var [tab, setTab] = useState("home");\
var [authUser, setAuthUser] = useState(null);\
var [showAuth, setShowAuth] = useState(false);\
var [authMode, setAuthMode] = useState("login");\
var [authStep, setAuthStep] = useState("choose");\
var [authEmail, setAuthEmail] = useState("");\
var [authPassword, setAuthPassword] = useState("");\
var [authName, setAuthName] = useState("");\
var [authLoading, setAuthLoading] = useState(false);\
var [authError, setAuthError] = useState("");\
\
var [profile, setProfile] = useState(\{ name: "Your Name", suburb: "Sydney", skill: "Intermediate", style: "All-Court", bio: "", avatar: "YN", availability: \{\} \});\
var [editingProfile, setEditingProfile] = useState(false);\
var [editingAvail, setEditingAvail] = useState(false);\
var [profileDraft, setProfileDraft] = useState(profile);\
var [availDraft, setAvailDraft] = useState(\{\});\
\
var [tournaments, setTournaments] = useState([\
\{ id: "t1", name: "Sydney Spring Open", skill: "Intermediate", size: 16, status: "enrolling", entrants: [], startDate: "2026-05-10", deadlineDays: 14, rounds: [], city: "Sydney" \},\
\{ id: "t2", name: "Moore Park Beginner Cup", skill: "Beginner", size: 8, status: "enrolling", entrants: [], startDate: "2026-04-26", deadlineDays: 14, rounds: [], city: "Sydney" \},\
\{ id: "t3", name: "Eastern Suburbs Open", skill: "Advanced", size: 32, status: "enrolling", entrants: [], startDate: "2026-05-24", deadlineDays: 14, rounds: [], city: "Sydney" \},\
]);\
var [selectedTournId, setSelectedTournId] = useState(null);\
var [filterSkill, setFilterSkill] = useState("All");\
var [history, setHistory] = useState([]);\
var [scheduleModal, setScheduleModal] = useState(null);\
var [scheduleDraft, setScheduleDraft] = useState(\{ date: "", time: "6:00 PM", court: "Court 1" \});\
var [scoreModal, setScoreModal] = useState(null);\
var [scoreDraft, setScoreDraft] = useState(\{ sets: [\{you:"",them:""\}], result: "win", notes: "" \});\
var [adminTab, setAdminTab] = useState("tournaments");\
var [newTourn, setNewTourn] = useState(\{ name: "", skill: "Intermediate", size: 16, startDate: "", deadlineDays: 14 \});\
\
var myId = authUser ? authUser.id : "local-user";\
\
var requireAuth = function(cb) \{\
if (authUser) cb(); else \{ setShowAuth(true); setAuthMode("login"); setAuthStep("choose"); \}\
\};\
\
var enterTournament = function(tournId) \{\
requireAuth(function() \{\
setTournaments(function(prev) \{\
return prev.map(function(t2) \{\
if (t2.id !== tournId || t2.entrants.some(function(e) \{ return e.id === myId; \})) return t2;\
var newE = \{ id: myId, name: profile.name, avatar: profile.avatar || "YN", skill: profile.skill \};\
var updated = \{\};\
Object.keys(t2).forEach(function(k) \{ updated[k] = t2[k]; \});\
updated.entrants = t2.entrants.concat([newE]);\
return updated;\
\});\
\});\
\});\
\};\
\
var isEntered = function(tournId) \{\
var t2 = tournaments.find(function(x) \{ return x.id === tournId; \});\
return t2 ? t2.entrants.some(function(e) \{ return e.id === myId; \}) : false;\
\};\
\
var generateDraw = function(tournId) \{\
setTournaments(function(prev) \{\
return prev.map(function(t2) \{\
if (t2.id !== tournId) return t2;\
var entrants = t2.entrants.slice();\
for (var i = entrants.length - 1; i > 0; i--) \{\
var j = Math.floor(Math.random() * (i + 1));\
var tmp = entrants[i]; entrants[i] = entrants[j]; entrants[j] = tmp;\
\}\
var matches = [];\
for (var k = 0; k < entrants.length; k += 2) \{\
var dl = new Date(); dl.setDate(dl.getDate() + t2.deadlineDays);\
matches.push(\{ id: "m" + Date.now() + k, p1: entrants[k] || null, p2: entrants[k + 1] || null, winner: null, sets: [], status: "scheduled", deadline: dl.toISOString().split("T")[0], scheduledDate: "", scheduledTime: "", scheduledCourt: "" \});\
\}\
var updated = \{\}; Object.keys(t2).forEach(function(k) \{ updated[k] = t2[k]; \});\
updated.status = "active";\
updated.rounds = [\{ round: 1, matches: matches \}];\
return updated;\
\});\
\});\
\};\
\
var recordResult = function(tournId, roundIdx, matchId, winnerId) \{\
setTournaments(function(prev) \{\
return prev.map(function(t2) \{\
if (t2.id !== tournId) return t2;\
var newRounds = t2.rounds.map(function(r, ri) \{\
if (ri !== roundIdx) return r;\
return \{ round: r.round, matches: r.matches.map(function(m) \{\
if (m.id !== matchId) return m;\
var updated = \{\}; Object.keys(m).forEach(function(k) \{ updated[k] = m[k]; \});\
updated.winner = winnerId; updated.status = "complete";\
return updated;\
\})\};\
\});\
var cur = newRounds[newRounds.length - 1];\
var allDone = cur.matches.every(function(m) \{ return m.status === "complete" || !m.p2; \});\
if (allDone) \{\
var winners = cur.matches.filter(function(m) \{ return m.winner; \}).map(function(m) \{\
return m.p1 && m.p1.id === m.winner ? m.p1 : m.p2;\
\}).filter(Boolean);\
if (winners.length > 1) \{\
var nextMatches = [];\
for (var i = 0; i < winners.length; i += 2) \{\
var dl = new Date(); dl.setDate(dl.getDate() + t2.deadlineDays);\
nextMatches.push(\{ id: "m" + Date.now() + i, p1: winners[i], p2: winners[i + 1] || null, winner: null, sets: [], status: "scheduled", deadline: dl.toISOString().split("T")[0], scheduledDate: "", scheduledTime: "", scheduledCourt: "" \});\
\}\
newRounds = newRounds.concat([\{ round: cur.round + 1, matches: nextMatches \}]);\
\} else if (winners.length === 1) \{\
var fin = \{\}; Object.keys(t2).forEach(function(k) \{ fin[k] = t2[k]; \});\
fin.status = "completed"; fin.rounds = newRounds; fin.winner = winners[0];\
return fin;\
\}\
\}\
var fin2 = \{\}; Object.keys(t2).forEach(function(k) \{ fin2[k] = t2[k]; \});\
fin2.rounds = newRounds;\
return fin2;\
\});\
\});\
\};\
\
var scheduleMatch = function(tournId, roundIdx, matchId, date, time, court) \{\
setTournaments(function(prev) \{\
return prev.map(function(t2) \{\
if (t2.id !== tournId) return t2;\
var updated = \{\}; Object.keys(t2).forEach(function(k) \{ updated[k] = t2[k]; \});\
updated.rounds = t2.rounds.map(function(r, ri) \{\
if (ri !== roundIdx) return r;\
return \{ round: r.round, matches: r.matches.map(function(m) \{\
if (m.id !== matchId) return m;\
var mu = \{\}; Object.keys(m).forEach(function(k) \{ mu[k] = m[k]; \});\
mu.scheduledDate = date; mu.scheduledTime = time; mu.scheduledCourt = court;\
return mu;\
\})\};\
\});\
return updated;\
\});\
\});\
\};\
\
var myUpcoming = [];\
tournaments.forEach(function(t2) \{\
if (t2.status !== "active") return;\
t2.rounds.forEach(function(r, ri) \{\
r.matches.forEach(function(m) \{\
if (m.status === "complete") return;\
var isMe = (m.p1 && m.p1.id === myId) || (m.p2 && m.p2.id === myId);\
if (!isMe) return;\
var opp = (m.p1 && m.p1.id === myId) ? m.p2 : m.p1;\
myUpcoming.push(\{ match: m, tournament: t2, roundIdx: ri, roundLabel: roundLabel(r.round, t2.size), opponent: opp \});\
\});\
\});\
\});\
\
return (\
<div style=\{\{ minHeight: "100vh", background: t.bg, color: t.text, paddingBottom: 84, fontFamily: "-apple-system,sans-serif" \}\}>\
\
  <nav style=\{\{ position: "sticky", top: 0, zIndex: 40, backdropFilter: "blur(24px)", background: t.navBg, borderBottom: "1px solid " + t.border \}\}>\
    <div style=\{\{ maxWidth: 640, margin: "0 auto", padding: "0 20px", height: 56, display: "flex", alignItems: "center", justifyContent: "space-between" \}\}>\
      <div style=\{\{ display: "flex", alignItems: "center", gap: 10 \}\}>\
        <div style=\{\{ width: 32, height: 32, borderRadius: 9, background: t.accent, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 800, color: t.accentText \}\}>CS</div>\
        <span style=\{\{ fontSize: 18, fontWeight: 700, letterSpacing: "-0.5px", color: t.text \}\}>CourtSync</span>\
        <span style=\{\{ fontSize: 11, fontWeight: 600, color: t.accent, background: t.accentSubtle, border: "1px solid " + t.accent + "44", borderRadius: 5, padding: "2px 7px" \}\}>Sydney</span>\
      </div>\
      <div style=\{\{ display: "flex", gap: 8, alignItems: "center" \}\}>\
        <button onClick=\{function() \{ setDark(function(d) \{ return !d; \}); \}\} style=\{\{ background: "transparent", border: "1px solid " + t.border, borderRadius: 9, padding: "5px 10px", fontSize: 12, color: t.textSecondary \}\}>\{dark ? "Light" : "Dark"\}</button>\
        \{authUser\
          ? <button onClick=\{function() \{ setAuthUser(null); \}\} style=\{\{ width: 32, height: 32, borderRadius: "50%", background: t.accent, border: "none", fontSize: 11, fontWeight: 800, color: t.accentText, cursor: "pointer" \}\} title="Tap to sign out">\{profile.avatar\}</button>\
          : <button onClick=\{function() \{ setShowAuth(true); setAuthMode("login"); setAuthStep("choose"); \}\} style=\{\{ background: "transparent", border: "1px solid " + t.accent, borderRadius: 9, padding: "5px 12px", fontSize: 12, fontWeight: 600, color: t.accent, cursor: "pointer" \}\}>Log in</button>\
        \}\
      </div>\
    </div>\
  </nav>\
\
  <div style=\{\{ position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 50, backdropFilter: "blur(24px)", background: t.tabBar, borderTop: "1px solid " + t.border \}\}>\
    <div style=\{\{ maxWidth: 640, margin: "0 auto", display: "flex", padding: "8px 0 14px" \}\}>\
      \{[\{id:"home",label:"Home"\},\{id:"tournaments",label:"Compete"\},\{id:"scorebook",label:"Scores"\},\{id:"profile",label:"Profile"\},\{id:"admin",label:"Admin"\}].map(function(tb) \{\
        var on = tab === tb.id;\
        return (\
          <button key=\{tb.id\} onClick=\{function() \{ setTab(tb.id); if (tb.id !== "tournaments") setSelectedTournId(null); \}\} style=\{\{ flex: 1, background: "none", border: "none", display: "flex", flexDirection: "column", alignItems: "center", gap: 4, color: on ? t.accent : t.textTertiary, cursor: "pointer", padding: "4px 0" \}\}>\
            <div style=\{\{ width: 24, height: 3, borderRadius: 2, background: on ? t.accent : "transparent" \}\} />\
            <span style=\{\{ fontSize: 11, fontWeight: on ? 700 : 400 \}\}>\{tb.label\}</span>\
          </button>\
        );\
      \})\}\
    </div>\
  </div>\
\
  \{tab === "home" && (\
    <div style=\{\{ maxWidth: 640, margin: "0 auto", padding: "24px 20px" \}\}>\
      <div style=\{\{ marginBottom: 24 \}\}>\
        <h1 style=\{\{ fontSize: 28, fontWeight: 700, letterSpacing: "-0.8px", color: t.text, marginBottom: 4 \}\}>\{authUser ? "Welcome back, " + profile.name.split(" ")[0] + "." : "Welcome to CourtSync."\}</h1>\
        <p style=\{\{ fontSize: 14, color: t.textSecondary \}\}>Sydney tennis tournaments. Enter. Compete. Win a racket.</p>\
      </div>\
\
      \{myUpcoming.length > 0 && (\
        <div style=\{\{ marginBottom: 24 \}\}>\
          <div style=\{\{ fontSize: 12, fontWeight: 700, color: t.textTertiary, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 12 \}\}>Your Next Matches</div>\
          <div style=\{\{ display: "flex", flexDirection: "column", gap: 12 \}\}>\
            \{myUpcoming.map(function(item, idx) \{\
              var m = item.match; var t2 = item.tournament;\
              var dl = daysUntil(m.deadline);\
              var urgent = dl !== null && dl <= 3;\
              return (\
                <div key=\{m.id\} className="fade-up" style=\{\{ background: t.surfaceSolid, border: "2px solid " + (urgent ? t.orange : t.accent) + "66", borderRadius: 20, padding: "18px 18px 16px" \}\}>\
                  <div style=\{\{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 \}\}>\
                    <div>\
                      <div style=\{\{ fontSize: 11, fontWeight: 700, color: t.accent, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 4 \}\}>\{t2.name + " - " + item.roundLabel\}</div>\
                      <div style=\{\{ fontSize: 20, fontWeight: 700, color: t.text \}\}>\{"vs " + (item.opponent ? item.opponent.name : "TBD")\}</div>\
                    </div>\
                    \{dl !== null && <div style=\{\{ textAlign: "right", flexShrink: 0 \}\}><div style=\{\{ fontSize: 14, fontWeight: 700, color: urgent ? t.orange : t.textSecondary \}\}>\{dl === 0 ? "Today" : dl < 0 ? "Overdue" : dl + "d left"\}</div><div style=\{\{ fontSize: 11, color: t.textTertiary \}\}>deadline</div></div>\}\
                  </div>\
                  <div style=\{\{ background: t.bgTertiary, border: "1px solid " + t.border, borderRadius: 12, padding: "10px 14px", marginBottom: 12 \}\}>\
                    <div style=\{\{ fontSize: 12, color: t.textSecondary, marginBottom: 2 \}\}>\{PILOT_VENUE.name\}</div>\
                    \{m.scheduledDate\
                      ? <div style=\{\{ fontSize: 13, color: t.accent, fontWeight: 600 \}\}>\{m.scheduledDate + " at " + m.scheduledTime + " - " + m.scheduledCourt\}</div>\
                      : <div style=\{\{ fontSize: 12, color: t.orange \}\}>Not yet scheduled - arrange with your opponent</div>\
                    \}\
                    <a href=\{PILOT_VENUE.url\} target="_blank" rel="noopener noreferrer" style=\{\{ fontSize: 12, color: t.accent, textDecoration: "none", fontWeight: 600, display: "inline-block", marginTop: 4 \}\}>Book court at venue</a>\
                    <span style=\{\{ fontSize: 12, color: t.green, marginLeft: 10 \}\}>New balls provided</span>\
                  </div>\
                  <div style=\{\{ display: "flex", gap: 8 \}\}>\
                    <button onClick=\{function() \{ setScheduleModal(\{ tournId: t2.id, roundIdx: item.roundIdx, matchId: m.id \}); setScheduleDraft(\{ date: m.scheduledDate || "", time: m.scheduledTime || "6:00 PM", court: m.scheduledCourt || "Court 1" \}); \}\} style=\{\{ flex: 1, padding: "11px", borderRadius: 12, border: "1px solid " + t.border, background: t.bgTertiary, color: t.text, fontSize: 13, fontWeight: 600, cursor: "pointer" \}\}>\{m.scheduledDate ? "Edit schedule" : "Schedule"\}</button>\
                    <button onClick=\{function() \{ setScoreModal(\{ oppName: item.opponent ? item.opponent.name : "Opponent", tournName: t2.name, tournId: t2.id, roundIdx: item.roundIdx, matchId: m.id, winnerId1: myId, winnerId2: item.opponent ? item.opponent.id : null \}); setScoreDraft(\{ sets: [\{you:"",them:""\}], result: "win", notes: "" \}); \}\} style=\{\{ flex: 1, padding: "11px", borderRadius: 12, border: "none", background: t.accent, color: t.accentText, fontSize: 13, fontWeight: 600, cursor: "pointer" \}\}>Log result</button>\
                  </div>\
                </div>\
              );\
            \})\}\
          </div>\
        </div>\
      )\}\
\
      \{myUpcoming.length === 0 && !authUser && (\
        <div style=\{\{ background: t.accentSubtle, border: "1px solid " + t.accent + "33", borderRadius: 20, padding: "26px 22px", marginBottom: 20 \}\}>\
          <div style=\{\{ fontSize: 19, fontWeight: 700, color: t.text, marginBottom: 8 \}\}>Start competing</div>\
          <div style=\{\{ fontSize: 14, color: t.textSecondary, lineHeight: 1.6, marginBottom: 20 \}\}>Enter a skill bracket, get drawn against an opponent, arrange your court time, and compete for a brand new racket.</div>\
          <div style=\{\{ display: "flex", gap: 10 \}\}>\
            <button onClick=\{function() \{ setShowAuth(true); setAuthMode("signup"); setAuthStep("choose"); \}\} style=\{\{ flex: 1, padding: "13px", borderRadius: 13, border: "none", background: t.accent, color: t.accentText, fontSize: 14, fontWeight: 700, cursor: "pointer" \}\}>Sign up free</button>\
            <button onClick=\{function() \{ setTab("tournaments"); \}\} style=\{\{ flex: 1, padding: "13px", borderRadius: 13, border: "1px solid " + t.border, background: "transparent", color: t.text, fontSize: 14, fontWeight: 600, cursor: "pointer" \}\}>Browse tournaments</button>\
          </div>\
        </div>\
      )\}\
\
      \{myUpcoming.length === 0 && authUser && (\
        <div style=\{\{ background: t.surfaceSolid, border: "1px solid " + t.border, borderRadius: 20, padding: "28px 22px", textAlign: "center", marginBottom: 20 \}\}>\
          <div style=\{\{ fontSize: 14, color: t.textSecondary, marginBottom: 18 \}\}>You have no active matches. Enter a tournament to get started.</div>\
          <button onClick=\{function() \{ setTab("tournaments"); \}\} style=\{\{ padding: "12px 28px", borderRadius: 13, border: "none", background: t.accent, color: t.accentText, fontSize: 14, fontWeight: 700, cursor: "pointer" \}\}>Browse tournaments</button>\
        </div>\
      )\}\
\
      \{/* Pilot venue info */\}\
      <div style=\{\{ background: t.surfaceSolid, border: "1px solid " + t.border, borderRadius: 20, padding: "18px 20px", marginBottom: 16 \}\}>\
        <div style=\{\{ fontSize: 12, fontWeight: 700, color: t.textSecondary, marginBottom: 10 \}\}>Pilot Venue</div>\
        <div style=\{\{ display: "flex", alignItems: "center", gap: 14 \}\}>\
          <div style=\{\{ width: 44, height: 44, borderRadius: 11, background: t.accent, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 800, color: t.accentText, flexShrink: 0 \}\}>SB</div>\
          <div style=\{\{ flex: 1 \}\}>\
            <div style=\{\{ fontSize: 14, fontWeight: 700, color: t.text, marginBottom: 2 \}\}>\{PILOT_VENUE.name\}</div>\
            <div style=\{\{ fontSize: 12, color: t.textSecondary \}\}>\{PILOT_VENUE.address\}</div>\
            <div style=\{\{ fontSize: 12, color: t.textSecondary \}\}>\{PILOT_VENUE.courts.length + " courts - " + PILOT_VENUE.hours\}</div>\
          </div>\
        </div>\
      </div>\
\
      \{/* How it works */\}\
      <div style=\{\{ background: t.surfaceSolid, border: "1px solid " + t.border, borderRadius: 20, padding: "18px 20px" \}\}>\
        <div style=\{\{ fontSize: 14, fontWeight: 700, color: t.text, marginBottom: 14 \}\}>How it works</div>\
        \{[["1","Pay entry fee","Choose your skill bracket and pay to enter."],["2","Get drawn","CourtSync randomly draws you against an opponent."],["3","Book your court","Arrange a time with your opponent and book at Sydney Boys."],["4","Play","An umpire attends every match. New balls provided by CourtSync."],["5","Win the prize","Win every round. Take home a brand new racket."]].map(function(s) \{\
          return (\
            <div key=\{s[0]\} style=\{\{ display: "flex", gap: 14, marginBottom: 12 \}\}>\
              <div style=\{\{ width: 26, height: 26, borderRadius: "50%", background: t.accentSubtle, border: "1px solid " + t.accent + "44", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 800, color: t.accent, flexShrink: 0 \}\}>\{s[0]\}</div>\
              <div><div style=\{\{ fontSize: 13, fontWeight: 700, color: t.text, marginBottom: 1 \}\}>\{s[1]\}</div><div style=\{\{ fontSize: 12, color: t.textSecondary \}\}>\{s[2]\}</div></div>\
            </div>\
          );\
        \})\}\
      </div>\
    </div>\
  )\}\
\
  \{tab === "tournaments" && !selectedTournId && (\
    <div style=\{\{ maxWidth: 640, margin: "0 auto", padding: "24px 20px" \}\}>\
      <h1 style=\{\{ fontSize: 30, fontWeight: 700, letterSpacing: "-0.8px", marginBottom: 4, color: t.text \}\}>Tournaments</h1>\
      <p style=\{\{ fontSize: 14, color: t.textSecondary, marginBottom: 20 \}\}>Single elimination. Real umpires. Real prizes.</p>\
\
      <div style=\{\{ display: "flex", gap: 6, marginBottom: 20, overflowX: "auto", paddingBottom: 2 \}\}>\
        \{["All"].concat(SKILL_LEVELS).map(function(sk) \{\
          return <button key=\{sk\} onClick=\{function() \{ setFilterSkill(sk); \}\} style=\{\{ flexShrink: 0, padding: "7px 16px", borderRadius: 9, border: "none", background: filterSkill === sk ? t.accent : t.bgTertiary, color: filterSkill === sk ? t.accentText : t.textSecondary, fontSize: 13, fontWeight: filterSkill === sk ? 700 : 400, cursor: "pointer" \}\}>\{sk\}</button>;\
        \})\}\
      </div>\
\
      <div style=\{\{ display: "flex", flexDirection: "column", gap: 16 \}\}>\
        \{tournaments.filter(function(t2) \{ return filterSkill === "All" || t2.skill === filterSkill; \}).map(function(t2, i) \{\
          var entered = isEntered(t2.id);\
          var fee = ENTRY_FEES[t2.size] || 45;\
          var prize = PRIZES[t2.size] || PRIZES[16];\
          var spotsLeft = t2.size - t2.entrants.length;\
          var fillPct = Math.round((t2.entrants.length / t2.size) * 100);\
          var dl = daysUntil(t2.startDate);\
          var statusColor = t2.status === "active" ? t.accent : t2.status === "enrolling" ? t.orange : t.textTertiary;\
          var statusLabel = t2.status === "active" ? "Live" : t2.status === "enrolling" ? "Enrolling" : "Completed";\
\
          return (\
            <div key=\{t2.id\} className="fade-up" style=\{\{ background: t.surfaceSolid, border: "1px solid " + (entered ? t.accent + "55" : t.border), borderRadius: 22, overflow: "hidden", animationDelay: (i * 0.07) + "s" \}\}>\
\
              \{/* Prize hero banner */\}\
              <div style=\{\{ background: "linear-gradient(135deg, #1a3a2a 0%, #0d2a20 100%)", padding: "20px 22px 16px", display: "flex", alignItems: "center", gap: 16 \}\}>\
                <div style=\{\{ flex: 1 \}\}>\
                  <div style=\{\{ fontSize: 11, fontWeight: 700, color: t.accent, textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 \}\}>Prize</div>\
                  <div style=\{\{ fontSize: 20, fontWeight: 800, color: "#ffffff", marginBottom: 3 \}\}>\{prize.item\}</div>\
                  <div style=\{\{ fontSize: 13, color: "rgba(255,255,255,0.6)" \}\}>\{"Valued at A$" + prize.value\}</div>\
                </div>\
                <div className="glow" style=\{\{ width: 64, height: 64, borderRadius: 16, background: "rgba(255,215,0,0.15)", border: "2px solid rgba(255,215,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 \}\}>\
                  <div style=\{\{ fontSize: 28 \}\}>\{"R"\}</div>\
                </div>\
              </div>\
\
              <div style=\{\{ padding: "16px 22px 0" \}\}>\
                <div style=\{\{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 \}\}>\
                  <div>\
                    <div style=\{\{ display: "flex", gap: 6, marginBottom: 6, flexWrap: "wrap" \}\}>\
                      <span style=\{\{ fontSize: 11, fontWeight: 700, color: statusColor, background: statusColor + "18", border: "1px solid " + statusColor + "44", borderRadius: 5, padding: "2px 8px" \}\}>\{statusLabel\}</span>\
                      <span style=\{\{ fontSize: 11, color: t.textTertiary, background: t.bgTertiary, border: "1px solid " + t.border, borderRadius: 5, padding: "2px 8px" \}\}>\{t2.skill\}</span>\
                      <span style=\{\{ fontSize: 11, color: t.textTertiary, background: t.bgTertiary, border: "1px solid " + t.border, borderRadius: 5, padding: "2px 8px" \}\}>\{t2.size + " players"\}</span>\
                      <span style=\{\{ fontSize: 11, color: t.green, background: t.greenSubtle, border: "1px solid " + t.green + "44", borderRadius: 5, padding: "2px 8px" \}\}>Balls incl.</span>\
                      \{entered && <span style=\{\{ fontSize: 11, fontWeight: 700, color: t.green, background: t.greenSubtle, border: "1px solid " + t.green + "44", borderRadius: 5, padding: "2px 8px" \}\}>Entered</span>\}\
                    </div>\
                    <div style=\{\{ fontSize: 20, fontWeight: 700, color: t.text, marginBottom: 4 \}\}>\{t2.name\}</div>\
                    <div style=\{\{ fontSize: 12, color: t.textSecondary \}\}>\{PILOT_VENUE.name + " - " + PILOT_VENUE.suburb\}</div>\
                  </div>\
                  <div style=\{\{ textAlign: "right", flexShrink: 0, marginLeft: 12 \}\}>\
                    <div style=\{\{ fontSize: 26, fontWeight: 800, color: t.accent \}\}>\{"$" + fee\}</div>\
                    <div style=\{\{ fontSize: 11, color: t.textTertiary \}\}>entry fee</div>\
                    \{dl !== null && dl > 0 && <div style=\{\{ fontSize: 11, color: t.orange, marginTop: 2 \}\}>\{"starts in " + dl + "d"\}</div>\}\
                  </div>\
                </div>\
\
                \{/* Format info */\}\
                <div style=\{\{ display: "flex", gap: 8, marginBottom: 14 \}\}>\
                  \{[\{l:"Format",v:"Single elimination"\},\{l:"Rounds",v:totalRounds(t2.size) + " rounds"\},\{l:"Per round",v:t2.deadlineDays + " days"\}].map(function(info) \{\
                    return <div key=\{info.l\} style=\{\{ flex: 1, background: t.bgTertiary, border: "1px solid " + t.border, borderRadius: 9, padding: "8px 10px" \}\}><div style=\{\{ fontSize: 10, color: t.textTertiary, marginBottom: 2 \}\}>\{info.l\}</div><div style=\{\{ fontSize: 12, fontWeight: 600, color: t.text \}\}>\{info.v\}</div></div>;\
                  \})\}\
                </div>\
\
                \{/* Progress bar */\}\
                \{t2.status === "enrolling" && (\
                  <div style=\{\{ marginBottom: 14 \}\}>\
                    <div style=\{\{ display: "flex", justifyContent: "space-between", marginBottom: 6 \}\}>\
                      <span style=\{\{ fontSize: 12, color: t.textSecondary \}\}>\{t2.entrants.length + " of " + t2.size + " enrolled"\}</span>\
                      <span style=\{\{ fontSize: 12, color: spotsLeft <= 4 ? t.orange : t.accent, fontWeight: 600 \}\}>\{spotsLeft + " spot" + (spotsLeft !== 1 ? "s" : "") + " left"\}</span>\
                    </div>\
                    <div style=\{\{ height: 7, background: t.bgTertiary, borderRadius: 4, overflow: "hidden" \}\}>\
                      <div style=\{\{ height: "100%", width: fillPct + "%", background: spotsLeft <= 4 ? t.orange : t.accent, borderRadius: 4 \}\} />\
                    </div>\
                  </div>\
                )\}\
\
                \{t2.status === "completed" && t2.winner && (\
                  <div style=\{\{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", background: t.accentSubtle, border: "1px solid " + t.accent + "33", borderRadius: 12, marginBottom: 14 \}\}>\
                    <div style=\{\{ width: 36, height: 36, borderRadius: "50%", background: avColor(t2.winner.name), display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, color: "#fff" \}\}>\{t2.winner.avatar\}</div>\
                    <div><div style=\{\{ fontSize: 11, color: t.textTertiary \}\}>Winner</div><div style=\{\{ fontSize: 14, fontWeight: 700, color: t.text \}\}>\{t2.winner.name\}</div></div>\
                    <div style=\{\{ marginLeft: "auto", fontSize: 12, color: t.accent, fontWeight: 600 \}\}>\{prize.item\}</div>\
                  </div>\
                )\}\
              </div>\
\
              <div style=\{\{ padding: "0 22px 20px", display: "flex", gap: 8 \}\}>\
                <button onClick=\{function() \{ setSelectedTournId(t2.id); \}\} style=\{\{ flex: 1, padding: "12px", borderRadius: 13, border: "1px solid " + t.border, background: t.bgTertiary, color: t.text, fontSize: 13, fontWeight: 600, cursor: "pointer" \}\}>View draw</button>\
                \{t2.status === "enrolling" && !entered && (\
                  <button onClick=\{function() \{ enterTournament(t2.id); \}\} style=\{\{ flex: 2, padding: "12px", borderRadius: 13, border: "none", background: t.accent, color: t.accentText, fontSize: 15, fontWeight: 700, cursor: "pointer" \}\}>\{"Enter - $" + fee\}</button>\
                )\}\
                \{t2.status === "enrolling" && entered && (\
                  <div style=\{\{ flex: 2, textAlign: "center", fontSize: 13, color: t.green, fontWeight: 600, padding: "12px", border: "1px solid " + t.green + "44", borderRadius: 13, background: t.greenSubtle \}\}>Enrolled</div>\
                )\}\
                \{t2.status === "active" && entered && (\
                  <button onClick=\{function() \{ setSelectedTournId(t2.id); \}\} style=\{\{ flex: 2, padding: "12px", borderRadius: 13, border: "none", background: t.accent, color: t.accentText, fontSize: 14, fontWeight: 700, cursor: "pointer" \}\}>My matches</button>\
                )\}\
                \{t2.status === "active" && !entered && (\
                  <div style=\{\{ flex: 2, textAlign: "center", fontSize: 13, color: t.textTertiary, padding: "12px" \}\}>In progress</div>\
                )\}\
              </div>\
            </div>\
          );\
        \})\}\
      </div>\
    </div>\
  )\}\
\
  \{tab === "tournaments" && selectedTournId && (function() \{\
    var t2 = tournaments.find(function(x) \{ return x.id === selectedTournId; \});\
    if (!t2) return null;\
    var prize = PRIZES[t2.size] || PRIZES[16];\
    var entered = isEntered(t2.id);\
\
    return (\
      <div style=\{\{ maxWidth: 640, margin: "0 auto", padding: "24px 20px" \}\}>\
        <button onClick=\{function() \{ setSelectedTournId(null); \}\} style=\{\{ background: "none", border: "none", color: t.accent, fontSize: 13, fontWeight: 600, cursor: "pointer", marginBottom: 16, padding: 0 \}\}>\{"< Back"\}</button>\
\
        <div style=\{\{ marginBottom: 20 \}\}>\
          <div style=\{\{ fontSize: 11, fontWeight: 700, color: t.accent, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 4 \}\}>\{t2.skill\}</div>\
          <h1 style=\{\{ fontSize: 26, fontWeight: 700, color: t.text, marginBottom: 6 \}\}>\{t2.name\}</h1>\
          <div style=\{\{ fontSize: 14, color: t.textSecondary \}\}>\{"Prize: " + prize.item\}</div>\
        </div>\
\
        \{/* Venue */\}\
        <div style=\{\{ background: t.surfaceSolid, border: "1px solid " + t.border, borderRadius: 16, padding: "14px 18px", marginBottom: 16 \}\}>\
          <div style=\{\{ fontSize: 12, fontWeight: 700, color: t.textSecondary, marginBottom: 6 \}\}>Venue</div>\
          <div style=\{\{ fontSize: 14, fontWeight: 600, color: t.text, marginBottom: 3 \}\}>\{PILOT_VENUE.name\}</div>\
          <div style=\{\{ fontSize: 12, color: t.textSecondary, marginBottom: 8 \}\}>Players book and pay their own court slot directly with the venue. New balls provided by CourtSync for each match.</div>\
          <a href=\{PILOT_VENUE.url\} target="_blank" rel="noopener noreferrer" style=\{\{ fontSize: 12, color: t.accent, fontWeight: 600, textDecoration: "none" \}\}>Book at venue</a>\
        </div>\
\
        \{/* Entrants list - shown when enrolling */\}\
        \{t2.status === "enrolling" && (\
          <div style=\{\{ background: t.surfaceSolid, border: "1px solid " + t.border, borderRadius: 16, overflow: "hidden", marginBottom: 16 \}\}>\
            <div style=\{\{ padding: "12px 18px", borderBottom: "1px solid " + t.border, display: "flex", justifyContent: "space-between" \}\}>\
              <span style=\{\{ fontSize: 13, fontWeight: 700, color: t.text \}\}>Entrants</span>\
              <span style=\{\{ fontSize: 13, color: t.textSecondary \}\}>\{t2.entrants.length + "/" + t2.size\}</span>\
            </div>\
            \{t2.entrants.length === 0\
              ? <div style=\{\{ padding: "24px", textAlign: "center", color: t.textTertiary, fontSize: 13 \}\}>No entrants yet. Be the first!</div>\
              : t2.entrants.map(function(e, i) \{\
                  return (\
                    <div key=\{e.id\} style=\{\{ padding: "11px 18px", borderBottom: i < t2.entrants.length - 1 ? "1px solid " + t.border : "none", display: "flex", alignItems: "center", gap: 12 \}\}>\
                      <div style=\{\{ width: 30, height: 30, borderRadius: "50%", background: avColor(e.name), display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700, color: "#fff" \}\}>\{e.avatar\}</div>\
                      <span style=\{\{ fontSize: 14, color: t.text, fontWeight: e.id === myId ? 700 : 400 \}\}>\{e.name + (e.id === myId ? " (you)" : "")\}</span>\
                    </div>\
                  );\
                \})\
            \}\
          </div>\
        )\}\
\
        \{/* Live bracket */\}\
        \{(t2.status === "active" || t2.status === "completed") && t2.rounds.length > 0 && (\
          <div>\
            <div style=\{\{ fontSize: 13, fontWeight: 700, color: t.textSecondary, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 14 \}\}>Draw</div>\
\
            \{t2.rounds.map(function(r, ri) \{\
              return (\
                <div key=\{ri\} style=\{\{ marginBottom: 24 \}\}>\
                  <div style=\{\{ fontSize: 13, fontWeight: 700, color: t.accent, marginBottom: 10 \}\}>\{roundLabel(r.round, t2.size)\}</div>\
                  <div style=\{\{ display: "flex", flexDirection: "column", gap: 10 \}\}>\
                    \{r.matches.map(function(m) \{\
                      var isMyMatch = (m.p1 && m.p1.id === myId) || (m.p2 && m.p2.id === myId);\
                      var dl = daysUntil(m.deadline);\
                      var urgent = dl !== null && dl <= 3 && m.status !== "complete";\
                      return (\
                        <div key=\{m.id\} style=\{\{ background: t.surfaceSolid, border: "2px solid " + (isMyMatch ? (urgent ? t.orange : t.accent) : t.border), borderRadius: 16, overflow: "hidden" \}\}>\
                          \{isMyMatch && <div style=\{\{ background: urgent ? t.orange : t.accent, padding: "4px 14px", fontSize: 10, fontWeight: 700, color: urgent ? "#fff" : t.accentText, textTransform: "uppercase", letterSpacing: 0.6 \}\}>\{urgent ? "Deadline soon - " + dl + " days left" : "Your match"\}</div>\}\
                          \{[m.p1, m.p2].map(function(player, pi) \{\
                            if (!player) return <div key=\{pi\} style=\{\{ padding: "14px 16px", borderBottom: pi === 0 ? "1px solid " + t.border : "none", color: t.textTertiary, fontSize: 13, fontStyle: "italic", display: "flex", alignItems: "center", gap: 10 \}\}><div style=\{\{ width: 32, height: 32, borderRadius: "50%", background: t.bgTertiary, flexShrink: 0 \}\} /><span>TBD</span></div>;\
                            var isWinner = m.winner === player.id;\
                            var isLoser = m.winner && !isWinner;\
                            var isMe = player.id === myId;\
                            return (\
                              <div key=\{pi\} style=\{\{ padding: "12px 16px", borderBottom: pi === 0 ? "1px solid " + t.border : "none", display: "flex", alignItems: "center", gap: 12, opacity: isLoser ? 0.38 : 1, background: isWinner ? t.accentSubtle : "transparent" \}\}>\
                                <div style=\{\{ width: 34, height: 34, borderRadius: "50%", background: avColor(player.name), display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, color: "#fff", flexShrink: 0 \}\}>\{player.avatar\}</div>\
                                <span style=\{\{ fontSize: 14, fontWeight: isWinner || isMe ? 700 : 400, color: isMe ? t.accent : t.text, flex: 1 \}\}>\{player.name + (isMe ? " (you)" : "")\}</span>\
                                \{isWinner && <span style=\{\{ fontSize: 12, fontWeight: 700, color: t.green, background: t.greenSubtle, borderRadius: 5, padding: "2px 8px" \}\}>W</span>\}\
                                \{m.sets && m.sets.length > 0 && (\
                                  <div style=\{\{ display: "flex", gap: 4 \}\}>\
                                    \{m.sets.map(function(set, si) \{\
                                      var sc = pi === 0 ? set.you : set.them;\
                                      var op = pi === 0 ? set.them : set.you;\
                                      var won = parseInt(sc) > parseInt(op);\
                                      return <span key=\{si\} style=\{\{ fontSize: 12, fontWeight: won ? 700 : 400, color: won ? t.green : t.textTertiary, background: t.bgTertiary, borderRadius: 5, padding: "2px 7px" \}\}>\{sc\}</span>;\
                                    \})\}\
                                  </div>\
                                )\}\
                              </div>\
                            );\
                          \})\}\
                          \{(m.scheduledDate || m.deadline) && m.status !== "complete" && (\
                            <div style=\{\{ padding: "8px 16px", background: t.bgTertiary, fontSize: 11, color: t.textSecondary, display: "flex", justifyContent: "space-between" \}\}>\
                              <span>\{m.scheduledDate ? m.scheduledDate + " - " + m.scheduledTime + " - " + m.scheduledCourt : "Not yet scheduled"\}</span>\
                              \{m.deadline && <span style=\{\{ color: urgent ? t.orange : t.textTertiary \}\}>\{"Due " + m.deadline\}</span>\}\
                            </div>\
                          )\}\
                          \{isMyMatch && m.status !== "complete" && (\
                            <div style=\{\{ padding: "10px 16px", borderTop: "1px solid " + t.border \}\}>\
                              <button onClick=\{function() \{ setScheduleModal(\{ tournId: t2.id, roundIdx: ri, matchId: m.id \}); setScheduleDraft(\{ date: m.scheduledDate || "", time: m.scheduledTime || "6:00 PM", court: m.scheduledCourt || "Court 1" \}); \}\} style=\{\{ width: "100%", padding: "9px", borderRadius: 10, border: "1px solid " + t.border, background: t.bgTertiary, color: t.text, fontSize: 12, fontWeight: 600, cursor: "pointer" \}\}>\
                                \{m.scheduledDate ? "Edit schedule" : "Schedule match"\}\
                              </button>\
                            </div>\
                          )\}\
                        </div>\
                      );\
                    \})\}\
                  </div>\
                </div>\
              );\
            \})\}\
          </div>\
        )\}\
\
        \{t2.status === "completed" && t2.winner && (\
          <div className="pop" style=\{\{ background: "linear-gradient(135deg, #1a3a2a 0%, #0d2a20 100%)", border: "2px solid rgba(255,215,0,0.4)", borderRadius: 20, padding: "28px", textAlign: "center", marginTop: 16 \}\}>\
            <div style=\{\{ fontSize: 36, marginBottom: 10 \}\}>R</div>\
            <div style=\{\{ fontSize: 11, color: "rgba(255,215,0,0.8)", fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 \}\}>Tournament Winner</div>\
            <div style=\{\{ fontSize: 24, fontWeight: 800, color: "#ffffff", marginBottom: 6 \}\}>\{t2.winner.name\}</div>\
            <div style=\{\{ fontSize: 14, color: "rgba(255,255,255,0.7)" \}\}>\{prize.item\}</div>\
          </div>\
        )\}\
      </div>\
    );\
  \})()\}\
\
  \{tab === "scorebook" && (\
    <div style=\{\{ maxWidth: 640, margin: "0 auto", padding: "24px 20px" \}\}>\
      <h1 style=\{\{ fontSize: 30, fontWeight: 700, letterSpacing: "-0.8px", marginBottom: 4, color: t.text \}\}>Scorebook</h1>\
      <p style=\{\{ fontSize: 14, color: t.textSecondary, marginBottom: 22 \}\}>Your tournament match history.</p>\
      \{history.length === 0\
        ? <div style=\{\{ textAlign: "center", padding: "60px 0", color: t.textTertiary, fontSize: 14 \}\}>No matches logged yet.</div>\
        : (\
          <div>\
            <div style=\{\{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10, marginBottom: 20 \}\}>\
              \{[\{l:"Played",v:history.length,c:t.text\},\{l:"Won",v:history.filter(function(m)\{return m.result==="win";\}).length,c:t.green\},\{l:"Lost",v:history.filter(function(m)\{return m.result==="loss";\}).length,c:t.red\},\{l:"Win %",v:history.length?Math.round(history.filter(function(m)\{return m.result==="win";\}).length/history.length*100)+"%":"0%",c:t.accent\}].map(function(s) \{\
                return <div key=\{s.l\} style=\{\{ background: t.surfaceSolid, border: "1px solid " + t.border, borderRadius: 16, padding: "14px 10px", textAlign: "center" \}\}><div style=\{\{ fontSize: 22, fontWeight: 800, color: s.c \}\}>\{s.v\}</div><div style=\{\{ fontSize: 11, color: t.textTertiary, marginTop: 3 \}\}>\{s.l\}</div></div>;\
              \})\}\
            </div>\
            <div style=\{\{ display: "flex", flexDirection: "column", gap: 10 \}\}>\
              \{history.map(function(m, i) \{\
                var rc = m.result === "win" ? t.green : t.red;\
                return (\
                  <div key=\{m.id\} className="fade-up" style=\{\{ background: t.surfaceSolid, border: "1px solid " + t.border, borderRadius: 18, padding: "14px 18px", display: "flex", gap: 14, alignItems: "center" \}\}>\
                    <div style=\{\{ width: 40, height: 40, borderRadius: 12, background: rc + "22", border: "1px solid " + rc + "55", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 \}\}>\
                      <span style=\{\{ fontSize: 15, fontWeight: 800, color: rc \}\}>\{m.result === "win" ? "W" : "L"\}</span>\
                    </div>\
                    <div style=\{\{ flex: 1 \}\}>\
                      <div style=\{\{ fontSize: 14, fontWeight: 600, color: t.text \}\}>\{"vs " + m.oppName\}</div>\
                      <div style=\{\{ fontSize: 12, color: t.textTertiary, marginTop: 1 \}\}>\{m.tournName + " - " + m.date\}</div>\
                    </div>\
                    <div style=\{\{ display: "flex", gap: 4 \}\}>\
                      \{m.sets.map(function(set, si) \{ return <div key=\{si\} style=\{\{ background: t.bgTertiary, border: "1px solid " + t.border, borderRadius: 6, padding: "3px 7px", textAlign: "center" \}\}><div style=\{\{ fontSize: 12, fontWeight: 700, color: t.text \}\}>\{set.you + "-" + set.them\}</div></div>; \})\}\
                    </div>\
                  </div>\
                );\
              \})\}\
            </div>\
          </div>\
        )\
      \}\
    </div>\
  )\}\
\
  \{tab === "profile" && (\
    <div style=\{\{ maxWidth: 640, margin: "0 auto", padding: "24px 20px" \}\}>\
      <h1 style=\{\{ fontSize: 30, fontWeight: 700, letterSpacing: "-0.8px", marginBottom: 4, color: t.text \}\}>Profile</h1>\
      <p style=\{\{ fontSize: 14, color: t.textSecondary, marginBottom: 22 \}\}>Your player card.</p>\
      \{!editingProfile && !editingAvail && (\
        <div>\
          <div style=\{\{ background: t.surfaceSolid, border: "1px solid " + t.border, borderRadius: 20, padding: 24, marginBottom: 14 \}\}>\
            <div style=\{\{ display: "flex", gap: 16, alignItems: "flex-start", marginBottom: 18 \}\}>\
              <div style=\{\{ width: 58, height: 58, borderRadius: "50%", background: t.accent, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, fontWeight: 700, color: t.accentText, flexShrink: 0 \}\}>\{profile.avatar\}</div>\
              <div style=\{\{ flex: 1 \}\}>\
                <div style=\{\{ fontSize: 20, fontWeight: 700, color: t.text \}\}>\{profile.name\}</div>\
                <div style=\{\{ fontSize: 14, color: t.textSecondary, marginTop: 2 \}\}>\{profile.suburb\}</div>\
                \{profile.bio ? <p style=\{\{ fontSize: 13, color: t.textSecondary, marginTop: 6, lineHeight: 1.5 \}\}>\{profile.bio\}</p> : null\}\
              </div>\
              <button onClick=\{function() \{ setProfileDraft(profile); setEditingProfile(true); \}\} style=\{\{ padding: "9px 16px", borderRadius: 11, border: "1px solid " + t.border, background: t.bgTertiary, color: t.text, fontSize: 13, fontWeight: 600, cursor: "pointer" \}\}>Edit</button>\
            </div>\
            <div style=\{\{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10, marginBottom: 14 \}\}>\
              \{[\{l:"Played",v:history.length\},\{l:"Won",v:history.filter(function(m)\{return m.result==="win";\}).length\},\{l:"Lost",v:history.filter(function(m)\{return m.result==="loss";\}).length\}].map(function(s) \{\
                return <div key=\{s.l\} style=\{\{ background: t.bgTertiary, border: "1px solid " + t.border, borderRadius: 11, padding: "11px", textAlign: "center" \}\}><div style=\{\{ fontSize: 22, fontWeight: 700, color: t.text \}\}>\{s.v\}</div><div style=\{\{ fontSize: 11, color: t.textTertiary, marginTop: 2 \}\}>\{s.l\}</div></div>;\
              \})\}\
            </div>\
            <div style=\{\{ display: "flex", gap: 8 \}\}>\
              <span style=\{\{ fontSize: 13, fontWeight: 500, color: t.accent, background: t.accentSubtle, border: "1px solid " + t.accent + "44", borderRadius: 8, padding: "5px 12px" \}\}>\{profile.skill\}</span>\
              <span style=\{\{ fontSize: 13, fontWeight: 500, color: t.green, background: t.greenSubtle, border: "1px solid " + t.green + "44", borderRadius: 8, padding: "5px 12px" \}\}>\{profile.style\}</span>\
            </div>\
          </div>\
          <div style=\{\{ background: t.surfaceSolid, border: "1px solid " + t.border, borderRadius: 20, overflow: "hidden" \}\}>\
            <div style=\{\{ padding: "13px 18px", borderBottom: "1px solid " + t.border, display: "flex", justifyContent: "space-between" \}\}>\
              <span style=\{\{ fontSize: 14, fontWeight: 700, color: t.text \}\}>Availability</span>\
              <button onClick=\{function() \{ setAvailDraft(profile.availability || \{\}); setEditingAvail(true); \}\} style=\{\{ fontSize: 12, color: t.accent, background: "none", border: "none", fontWeight: 600, cursor: "pointer" \}\}>Edit</button>\
            </div>\
            <div style=\{\{ padding: "12px 18px", display: "flex", flexDirection: "column", gap: 8 \}\}>\
              \{DAYS_SHORT.filter(function(d) \{ return ((profile.availability||\{\})[d]||[]).length>0; \}).length === 0\
                ? <p style=\{\{ fontSize: 13, color: t.textTertiary \}\}>No availability set.</p>\
                : DAYS_SHORT.filter(function(d) \{ return ((profile.availability||\{\})[d]||[]).length>0; \}).map(function(day) \{\
                    return <div key=\{day\} style=\{\{ display: "flex", alignItems: "center", gap: 10 \}\}><span style=\{\{ fontSize: 12, fontWeight: 700, color: t.textSecondary, width: 32 \}\}>\{day\}</span><div style=\{\{ display: "flex", gap: 5 \}\}>\{((profile.availability||\{\})[day]||[]).map(function(b)\{return<span key=\{b\} style=\{\{fontSize:11,color:t.accent,background:t.accentSubtle,border:"1px solid "+t.accent+"44",borderRadius:6,padding:"3px 8px"\}\}>\{b\}</span>;\})\}</div></div>;\
                  \})\
              \}\
            </div>\
          </div>\
        </div>\
      )\}\
      \{editingAvail && (\
        <div className="fade-up" style=\{\{ background: t.surfaceSolid, border: "1px solid " + t.border, borderRadius: 20, overflow: "hidden" \}\}>\
          <div style=\{\{ padding: "15px 18px", borderBottom: "1px solid " + t.border \}\}><div style=\{\{ fontSize: 15, fontWeight: 700, color: t.text \}\}>Edit Availability</div></div>\
          <div style=\{\{ padding: "16px 18px" \}\}>\
            \{DAYS_SHORT.map(function(day, di) \{\
              return (\
                <div key=\{day\} style=\{\{ display: "flex", alignItems: "center", gap: 12, paddingTop: di===0?0:14, paddingBottom: 14, borderBottom: di<DAYS_SHORT.length-1?"1px solid "+t.border:"none" \}\}>\
                  <span style=\{\{ fontSize: 13, fontWeight: 700, color: t.textSecondary, width: 34, flexShrink: 0 \}\}>\{day\}</span>\
                  <div style=\{\{ display: "flex", gap: 6, flexWrap: "wrap" \}\}>\
                    \{TIME_BLOCKS.map(function(block) \{\
                      var on = (availDraft[day]||[]).includes(block);\
                      return <button key=\{block\} onClick=\{function()\{var cur=availDraft[day]||[];var next=on?cur.filter(function(b)\{return b!==block;\}):cur.concat([block]);setAvailDraft(function(d)\{var n=\{\};Object.keys(d).forEach(function(k)\{n[k]=d[k];\});n[day]=next;return n;\});\}\} style=\{\{padding:"7px 12px",borderRadius:9,border:"1px solid "+(on?t.accent:t.border),background:on?t.accentSubtle:"transparent",color:on?t.accent:t.textTertiary,fontSize:12,fontWeight:on?600:400,cursor:"pointer"\}\}>\{block\}</button>;\
                    \})\}\
                  </div>\
                </div>\
              );\
            \})\}\
          </div>\
          <div style=\{\{ padding: "0 18px 18px", display: "flex", gap: 10 \}\}>\
            <button onClick=\{function()\{setEditingAvail(false);\}\} style=\{\{flex:1,padding:"13px",borderRadius:13,border:"none",background:t.bgTertiary,color:t.text,fontSize:14,fontWeight:600,cursor:"pointer"\}\}>Cancel</button>\
            <button onClick=\{function()\{var avl=\{\};Object.keys(availDraft).forEach(function(k)\{avl[k]=availDraft[k];\});setProfile(function(p)\{var n=\{\};Object.keys(p).forEach(function(k)\{n[k]=p[k];\});n.availability=avl;return n;\});setEditingAvail(false);\}\} style=\{\{flex:2,padding:"13px",borderRadius:13,border:"none",background:t.accent,color:t.accentText,fontSize:14,fontWeight:600,cursor:"pointer"\}\}>Save</button>\
          </div>\
        </div>\
      )\}\
      \{editingProfile && (\
        <div className="fade-up" style=\{\{ background: t.surfaceSolid, border: "1px solid " + t.border, borderRadius: 20, padding: 24 \}\}>\
          <div style=\{\{ fontSize: 15, fontWeight: 700, color: t.text, marginBottom: 18 \}\}>Edit Profile</div>\
          \{[\{l:"Full name",k:"name",type:"text",ph:"Your name"\},\{l:"Suburb",k:"suburb",type:"text",ph:"e.g. Bondi"\},\{l:"Bio",k:"bio",type:"text",ph:"Short bio..."\}].map(function(f)\{\
            return <div key=\{f.k\} style=\{\{marginBottom:12\}\}><label style=\{\{fontSize:12,fontWeight:600,color:t.textSecondary,display:"block",marginBottom:4\}\}>\{f.l\}</label><input type=\{f.type\} value=\{profileDraft[f.k]||""\} onChange=\{function(e)\{var v=e.target.value;var k=f.k;setProfileDraft(function(d)\{var n=\{\};Object.keys(d).forEach(function(k2)\{n[k2]=d[k2];\});n[k]=v;return n;\});\}\} placeholder=\{f.ph\} style=\{\{width:"100%",padding:"11px 13px",borderRadius:10,border:"1px solid "+t.border,background:t.inputBg,color:t.text,fontSize:14\}\} /></div>;\
          \})\}\
          \{[\{l:"Skill level",k:"skill",opts:SKILL_LEVELS\},\{l:"Play style",k:"style",opts:PLAY_STYLES\}].map(function(f)\{\
            return <div key=\{f.k\} style=\{\{marginBottom:14\}\}><label style=\{\{fontSize:12,fontWeight:600,color:t.textSecondary,display:"block",marginBottom:8\}\}>\{f.l\}</label><div style=\{\{display:"flex",gap:6,flexWrap:"wrap"\}\}>\{f.opts.map(function(o)\{return<button key=\{o\} onClick=\{function()\{var k=f.k;setProfileDraft(function(d)\{var n=\{\};Object.keys(d).forEach(function(k2)\{n[k2]=d[k2];\});n[k]=o;return n;\});\}\} style=\{\{padding:"8px 14px",borderRadius:9,border:"none",fontSize:13,background:profileDraft[f.k]===o?t.accent:t.bgTertiary,color:profileDraft[f.k]===o?t.accentText:t.textSecondary,fontWeight:profileDraft[f.k]===o?600:400,cursor:"pointer"\}\}>\{o\}</button>;\})\}</div></div>;\
          \})\}\
          <div style=\{\{ display: "flex", gap: 10, marginTop: 8 \}\}>\
            <button onClick=\{function()\{setEditingProfile(false);\}\} style=\{\{flex:1,padding:"13px",borderRadius:13,border:"none",background:t.bgTertiary,color:t.text,fontSize:14,fontWeight:600,cursor:"pointer"\}\}>Cancel</button>\
            <button onClick=\{function()\{var init=(profileDraft.name||"YN").split(" ").map(function(w)\{return w[0];\}).join("").slice(0,2).toUpperCase();var nd=\{\};Object.keys(profileDraft).forEach(function(k)\{nd[k]=profileDraft[k];\});nd.avatar=init;setProfile(nd);setEditingProfile(false);\}\} style=\{\{flex:2,padding:"13px",borderRadius:13,border:"none",background:t.accent,color:t.accentText,fontSize:14,fontWeight:600,cursor:"pointer"\}\}>Save</button>\
          </div>\
        </div>\
      )\}\
    </div>\
  )\}\
\
  \{tab === "admin" && (\
    <div style=\{\{ maxWidth: 640, margin: "0 auto", padding: "24px 20px" \}\}>\
      <h1 style=\{\{ fontSize: 30, fontWeight: 700, letterSpacing: "-0.8px", marginBottom: 4, color: t.text \}\}>Admin</h1>\
      <p style=\{\{ fontSize: 14, color: t.textSecondary, marginBottom: 20 \}\}>Manage tournaments, draws and results.</p>\
\
      \{/* Economics summary */\}\
      <div style=\{\{ background: t.surfaceSolid, border: "1px solid " + t.border, borderRadius: 16, padding: "14px 18px", marginBottom: 20 \}\}>\
        <div style=\{\{ fontSize: 12, fontWeight: 700, color: t.textSecondary, marginBottom: 10 \}\}>Economics per tournament (estimated)</div>\
        <div style=\{\{ display: "flex", gap: 10 \}\}>\
          \{[8,16,32].map(function(size) \{\
            var net = netRevenue(size);\
            return (\
              <div key=\{size\} style=\{\{ flex: 1, background: t.bgTertiary, border: "1px solid " + t.border, borderRadius: 10, padding: "10px 12px", textAlign: "center" \}\}>\
                <div style=\{\{ fontSize: 11, color: t.textTertiary, marginBottom: 3 \}\}>\{size + " players"\}</div>\
                <div style=\{\{ fontSize: 13, fontWeight: 700, color: t.text \}\}>\{"$" + ENTRY_FEES[size] + " entry"\}</div>\
                <div style=\{\{ fontSize: 12, color: t.accent, marginTop: 2 \}\}>\{"~$" + net + " net"\}</div>\
                <div style=\{\{ fontSize: 10, color: t.textTertiary, marginTop: 1 \}\}>\{"Prize: $" + PRIZES[size].value\}</div>\
              </div>\
            );\
          \})\}\
        </div>\
      </div>\
\
      <div style=\{\{ display: "flex", gap: 6, marginBottom: 22, background: t.bgTertiary, border: "1px solid " + t.border, borderRadius: 12, padding: 4 \}\}>\
        \{["tournaments","draws","results"].map(function(at) \{\
          return <button key=\{at\} onClick=\{function()\{setAdminTab(at);\}\} style=\{\{flex:1,padding:"9px 0",borderRadius:9,border:"none",background:adminTab===at?t.surfaceSolid:"transparent",color:adminTab===at?t.accent:t.textTertiary,fontSize:13,fontWeight:adminTab===at?700:400,cursor:"pointer",textTransform:"capitalize"\}\}>\{at\}</button>;\
        \})\}\
      </div>\
\
      \{adminTab === "tournaments" && (\
        <div>\
          <div style=\{\{ background: t.surfaceSolid, border: "1px solid " + t.border, borderRadius: 20, padding: 20, marginBottom: 16 \}\}>\
            <div style=\{\{ fontSize: 13, fontWeight: 700, color: t.text, marginBottom: 16 \}\}>Create Tournament</div>\
            \{[\{l:"Name",k:"name",type:"text",ph:"e.g. Sydney Autumn Open"\},\{l:"Start date",k:"startDate",type:"date",ph:""\}].map(function(f)\{\
              return <div key=\{f.k\} style=\{\{marginBottom:10\}\}><label style=\{\{fontSize:11,fontWeight:600,color:t.textSecondary,display:"block",marginBottom:4\}\}>\{f.l\}</label><input type=\{f.type\} value=\{newTourn[f.k]\} onChange=\{function(e)\{var v=e.target.value;var k=f.k;setNewTourn(function(d)\{var n=\{\};Object.keys(d).forEach(function(k2)\{n[k2]=d[k2];\});n[k]=v;return n;\});\}\} placeholder=\{f.ph||""\} style=\{\{width:"100%",padding:"10px 12px",borderRadius:10,border:"1px solid "+t.border,background:t.inputBg,color:t.text,fontSize:13\}\} /></div>;\
            \})\}\
            <div style=\{\{ display: "flex", gap: 10, marginBottom: 16 \}\}>\
              \{[\{l:"Skill",k:"skill",opts:SKILL_LEVELS.map(function(s)\{return\{v:s,l:s\};\}),num:false\},\{l:"Draw size",k:"size",opts:[\{v:8,l:"8 - $39"\},\{v:16,l:"16 - $45"\},\{v:32,l:"32 - $39"\}],num:true\},\{l:"Days/round",k:"deadlineDays",opts:[\{v:7,l:"7d"\},\{v:10,l:"10d"\},\{v:14,l:"14d"\}],num:true\}].map(function(f)\{\
                return <div key=\{f.k\} style=\{\{flex:1\}\}><label style=\{\{fontSize:11,fontWeight:600,color:t.textSecondary,display:"block",marginBottom:4\}\}>\{f.l\}</label><select value=\{newTourn[f.k]\} onChange=\{function(e)\{var v=f.num?parseInt(e.target.value):e.target.value;var k=f.k;setNewTourn(function(d)\{var n=\{\};Object.keys(d).forEach(function(k2)\{n[k2]=d[k2];\});n[k]=v;return n;\});\}\} style=\{\{width:"100%",padding:"9px 10px",borderRadius:9,border:"1px solid "+t.border,background:t.inputBg,color:t.text,fontSize:12\}\}>\{f.opts.map(function(o)\{return<option key=\{o.v\} value=\{o.v\}>\{o.l\}</option>;\})\}</select></div>;\
              \})\}\
            </div>\
            <button onClick=\{function()\{\
              if (!newTourn.name) return;\
              var nt = \{ id: "t"+Date.now(), name: newTourn.name, skill: newTourn.skill, size: newTourn.size, status: "enrolling", entrants: [], startDate: newTourn.startDate, deadlineDays: newTourn.deadlineDays, rounds: [], city: "Sydney" \};\
              setTournaments(function(prev)\{return prev.concat([nt]);\});\
              setNewTourn(\{name:"",skill:"Intermediate",size:16,startDate:"",deadlineDays:14\});\
            \}\} style=\{\{width:"100%",padding:"12px",borderRadius:12,border:"none",background:t.accent,color:t.accentText,fontSize:14,fontWeight:700,cursor:"pointer"\}\}>Create Tournament</button>\
          </div>\
\
          <div style=\{\{ display: "flex", flexDirection: "column", gap: 10 \}\}>\
            \{tournaments.map(function(t2) \{\
              var sc = t2.status==="active"?t.accent:t2.status==="enrolling"?t.orange:t.textTertiary;\
              var fee = ENTRY_FEES[t2.size]||45;\
              var revenue = t2.entrants.length * fee;\
              return (\
                <div key=\{t2.id\} style=\{\{ background: t.surfaceSolid, border: "1px solid " + t.border, borderRadius: 16, padding: "14px 18px" \}\}>\
                  <div style=\{\{ display: "flex", alignItems: "flex-start", gap: 12, marginBottom: 8 \}\}>\
                    <div style=\{\{ flex: 1 \}\}>\
                      <div style=\{\{ fontSize: 14, fontWeight: 700, color: t.text, marginBottom: 2 \}\}>\{t2.name\}</div>\
                      <div style=\{\{ fontSize: 12, color: t.textSecondary \}\}>\{t2.skill + " - " + t2.size + " players - $" + fee + " entry - " + t2.entrants.length + " enrolled"\}</div>\
                      <div style=\{\{ fontSize: 12, color: t.accent, marginTop: 2 \}\}>\{"Revenue so far: $" + revenue\}</div>\
                    </div>\
                    <select value=\{t2.status\} onChange=\{function(e)\{var v=e.target.value;var id=t2.id;setTournaments(function(prev)\{return prev.map(function(x)\{if(x.id!==id)return x;var n=\{\};Object.keys(x).forEach(function(k)\{n[k]=x[k];\});n.status=v;return n;\});\});\}\} style=\{\{padding:"5px 8px",borderRadius:7,border:"1px solid "+sc,background:"transparent",color:sc,fontSize:12,fontWeight:600,cursor:"pointer"\}\}>\
                      <option value="enrolling">Enrolling</option>\
                      <option value="active">Active</option>\
                      <option value="completed">Completed</option>\
                    </select>\
                  </div>\
                  <button onClick=\{function()\{setSelectedTournId(t2.id);setTab("tournaments");\}\} style=\{\{fontSize:12,color:t.accent,background:"none",border:"none",fontWeight:600,cursor:"pointer",padding:0\}\}>View draw</button>\
                </div>\
              );\
            \})\}\
          </div>\
        </div>\
      )\}\
\
      \{adminTab === "draws" && (\
        <div>\
          <p style=\{\{ fontSize: 13, color: t.textSecondary, marginBottom: 16 \}\}>Generate the draw once you are ready to start. This shuffles entrants into Round 1 matches and activates the tournament.</p>\
          \{tournaments.filter(function(t2)\{return t2.status==="enrolling";\}).length === 0 && <div style=\{\{textAlign:"center",padding:"30px",color:t.textTertiary,fontSize:13\}\}>No tournaments currently enrolling.</div>\}\
          <div style=\{\{ display: "flex", flexDirection: "column", gap: 10 \}\}>\
            \{tournaments.filter(function(t2)\{return t2.status==="enrolling";\}).map(function(t2) \{\
              var enough = t2.entrants.length >= 4;\
              var full = t2.entrants.length >= t2.size;\
              return (\
                <div key=\{t2.id\} style=\{\{ background: t.surfaceSolid, border: "1px solid " + t.border, borderRadius: 16, padding: "16px 18px" \}\}>\
                  <div style=\{\{ fontSize: 14, fontWeight: 700, color: t.text, marginBottom: 4 \}\}>\{t2.name\}</div>\
                  <div style=\{\{ fontSize: 12, color: t.textSecondary, marginBottom: 12 \}\}>\{t2.entrants.length + " of " + t2.size + " enrolled"\}</div>\
                  <div style=\{\{ height: 6, background: t.bgTertiary, borderRadius: 3, overflow: "hidden", marginBottom: 12 \}\}>\
                    <div style=\{\{ height: "100%", width: Math.round(t2.entrants.length/t2.size*100)+"%", background: full?t.green:t.accent, borderRadius: 3 \}\} />\
                  </div>\
                  \{t2.entrants.length > 0 && (\
                    <div style=\{\{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 \}\}>\
                      \{t2.entrants.map(function(e) \{\
                        return (\
                          <div key=\{e.id\} style=\{\{ display: "flex", alignItems: "center", gap: 6, background: t.bgTertiary, border: "1px solid " + t.border, borderRadius: 8, padding: "5px 10px" \}\}>\
                            <div style=\{\{ width: 22, height: 22, borderRadius: "50%", background: avColor(e.name), display: "flex", alignItems: "center", justifyContent: "center", fontSize: 8, fontWeight: 700, color: "#fff" \}\}>\{e.avatar\}</div>\
                            <span style=\{\{ fontSize: 12, color: t.text \}\}>\{e.name\}</span>\
                          </div>\
                        );\
                      \})\}\
                    </div>\
                  )\}\
                  <button onClick=\{function()\{if(enough)generateDraw(t2.id);\}\} disabled=\{!enough\} style=\{\{width:"100%",padding:"11px",borderRadius:12,border:"none",background:enough?t.accent:t.bgTertiary,color:enough?t.accentText:t.textTertiary,fontSize:13,fontWeight:700,cursor:enough?"pointer":"default"\}\}>\
                    \{full?"Generate draw (full)":enough?"Generate draw ("+t2.entrants.length+" players)":"Need at least 4 entrants"\}\
                  </button>\
                </div>\
              );\
            \})\}\
          </div>\
        </div>\
      )\}\
\
      \{adminTab === "results" && (\
        <div>\
          <p style=\{\{ fontSize: 13, color: t.textSecondary, marginBottom: 16 \}\}>Record results as the umpire. Winners automatically advance.</p>\
          \{tournaments.filter(function(t2)\{return t2.status==="active";\}).length===0 && <div style=\{\{textAlign:"center",padding:"30px",color:t.textTertiary,fontSize:13\}\}>No active tournaments.</div>\}\
          \{tournaments.filter(function(t2)\{return t2.status==="active";\}).map(function(t2) \{\
            return (\
              <div key=\{t2.id\} style=\{\{ marginBottom: 24 \}\}>\
                <div style=\{\{ fontSize: 13, fontWeight: 700, color: t.accent, marginBottom: 12 \}\}>\{t2.name\}</div>\
                \{t2.rounds.map(function(r, ri) \{\
                  var pending = r.matches.filter(function(m)\{return m.status!=="complete"&&m.p1&&m.p2;\});\
                  if (!pending.length) return null;\
                  return (\
                    <div key=\{ri\} style=\{\{ marginBottom: 14 \}\}>\
                      <div style=\{\{ fontSize: 12, fontWeight: 600, color: t.textSecondary, marginBottom: 8 \}\}>\{roundLabel(r.round, t2.size)\}</div>\
                      \{pending.map(function(m) \{\
                        return (\
                          <div key=\{m.id\} style=\{\{ background: t.surfaceSolid, border: "1px solid " + t.border, borderRadius: 14, padding: "14px 16px", marginBottom: 8 \}\}>\
                            <div style=\{\{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 \}\}>\
                              <div style=\{\{ width: 32, height: 32, borderRadius: "50%", background: avColor(m.p1.name), display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700, color: "#fff" \}\}>\{m.p1.avatar\}</div>\
                              <span style=\{\{ fontSize: 14, fontWeight: 600, color: t.text \}\}>\{m.p1.name\}</span>\
                              <span style=\{\{ fontSize: 12, color: t.textTertiary, margin: "0 4px" \}\}>vs</span>\
                              <div style=\{\{ width: 32, height: 32, borderRadius: "50%", background: avColor(m.p2.name), display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700, color: "#fff" \}\}>\{m.p2.avatar\}</div>\
                              <span style=\{\{ fontSize: 14, fontWeight: 600, color: t.text \}\}>\{m.p2.name\}</span>\
                            </div>\
                            \{m.scheduledDate && <div style=\{\{ fontSize: 11, color: t.textTertiary, marginBottom: 10 \}\}>\{m.scheduledDate + " - " + m.scheduledTime + " - " + m.scheduledCourt\}</div>\}\
                            <div style=\{\{ display: "flex", gap: 8 \}\}>\
                              <button onClick=\{function()\{recordResult(t2.id,ri,m.id,m.p1.id);\}\} style=\{\{flex:1,padding:"10px",borderRadius:10,border:"1px solid "+t.border,background:t.bgTertiary,color:t.text,fontSize:13,fontWeight:600,cursor:"pointer"\}\}>\{m.p1.name.split(" ")[0] + " wins"\}</button>\
                              <button onClick=\{function()\{recordResult(t2.id,ri,m.id,m.p2.id);\}\} style=\{\{flex:1,padding:"10px",borderRadius:10,border:"1px solid "+t.border,background:t.bgTertiary,color:t.text,fontSize:13,fontWeight:600,cursor:"pointer"\}\}>\{m.p2.name.split(" ")[0] + " wins"\}</button>\
                            </div>\
                          </div>\
                        );\
                      \})\}\
                    </div>\
                  );\
                \})\}\
              </div>\
            );\
          \})\}\
        </div>\
      )\}\
    </div>\
  )\}\
\
  \{scheduleModal && (\
    <div onClick=\{function()\{setScheduleModal(null);\}\} style=\{\{position:"fixed",inset:0,background:"rgba(0,0,0,0.55)",backdropFilter:"blur(14px)",display:"flex",alignItems:"flex-end",justifyContent:"center",zIndex:200\}\}>\
      <div onClick=\{function(e)\{e.stopPropagation();\}\} className="slide-up" style=\{\{background:t.modalBg,borderRadius:"24px 24px 0 0",padding:"28px 24px 52px",width:"100%",maxWidth:540\}\}>\
        <h2 style=\{\{fontSize:22,fontWeight:700,color:t.text,marginBottom:6\}\}>Schedule Match</h2>\
        <p style=\{\{fontSize:13,color:t.textSecondary,marginBottom:20\}\}>\{PILOT_VENUE.name + " - players book own court"\}</p>\
        \{[\{l:"Date",k:"date",type:"date"\},\{l:"Time",k:"time",type:"text",ph:"e.g. 6:00 PM"\},\{l:"Court",k:"court",type:"text",ph:"e.g. Court 3"\}].map(function(f)\{\
          return <div key=\{f.k\} style=\{\{marginBottom:14\}\}><label style=\{\{fontSize:12,fontWeight:600,color:t.textSecondary,display:"block",marginBottom:6\}\}>\{f.l\}</label><input type=\{f.type\} value=\{scheduleDraft[f.k]\} onChange=\{function(e)\{var v=e.target.value;var k=f.k;setScheduleDraft(function(d)\{var n=\{\};Object.keys(d).forEach(function(k2)\{n[k2]=d[k2];\});n[k]=v;return n;\});\}\} placeholder=\{f.ph||""\} style=\{\{width:"100%",padding:"13px 16px",borderRadius:12,border:"1px solid "+t.border,background:t.inputBg,color:t.text,fontSize:15\}\} /></div>;\
        \})\}\
        <div style=\{\{ background: t.accentSubtle, border: "1px solid " + t.accent + "33", borderRadius: 10, padding: "10px 14px", marginBottom: 16 \}\}>\
          <a href=\{PILOT_VENUE.url\} target="_blank" rel="noopener noreferrer" style=\{\{fontSize:12,color:t.accent,fontWeight:600,textDecoration:"none"\}\}>\{"Book your court at " + PILOT_VENUE.name\}</a>\
          <span style=\{\{ fontSize: 12, color: t.green, marginLeft: 10 \}\}>New balls provided</span>\
        </div>\
        <div style=\{\{display:"flex",gap:10\}\}>\
          <button onClick=\{function()\{setScheduleModal(null);\}\} style=\{\{flex:1,padding:"13px",borderRadius:13,border:"none",background:t.bgTertiary,color:t.text,fontSize:14,fontWeight:600,cursor:"pointer"\}\}>Cancel</button>\
          <button onClick=\{function()\{scheduleMatch(scheduleModal.tournId,scheduleModal.roundIdx,scheduleModal.matchId,scheduleDraft.date,scheduleDraft.time,scheduleDraft.court);setScheduleModal(null);\}\} style=\{\{flex:2,padding:"13px",borderRadius:13,border:"none",background:t.accent,color:t.accentText,fontSize:14,fontWeight:700,cursor:"pointer"\}\}>Save</button>\
        </div>\
      </div>\
    </div>\
  )\}\
\
  \{scoreModal && (\
    <div onClick=\{function()\{setScoreModal(null);\}\} style=\{\{position:"fixed",inset:0,background:"rgba(0,0,0,0.55)",backdropFilter:"blur(14px)",display:"flex",alignItems:"flex-end",justifyContent:"center",zIndex:200\}\}>\
      <div onClick=\{function(e)\{e.stopPropagation();\}\} className="slide-up" style=\{\{background:t.modalBg,borderRadius:"24px 24px 0 0",padding:"28px 24px 52px",width:"100%",maxWidth:540\}\}>\
        <h2 style=\{\{fontSize:22,fontWeight:700,color:t.text,marginBottom:4\}\}>Log Result</h2>\
        <p style=\{\{fontSize:13,color:t.textSecondary,marginBottom:20\}\}>\{"vs " + scoreModal.oppName + " - " + scoreModal.tournName\}</p>\
        <div style=\{\{marginBottom:18\}\}>\
          <label style=\{\{fontSize:12,fontWeight:600,color:t.textSecondary,display:"block",marginBottom:10\}\}>Result</label>\
          <div style=\{\{display:"flex",gap:8\}\}>\
            \{[\{id:"win",l:"Win",c:t.green\},\{id:"loss",l:"Loss",c:t.red\}].map(function(r)\{\
              return <button key=\{r.id\} onClick=\{function()\{setScoreDraft(function(d)\{var n=\{\};Object.keys(d).forEach(function(k)\{n[k]=d[k];\});n.result=r.id;return n;\});\}\} style=\{\{flex:1,padding:"13px",borderRadius:13,border:"2px solid "+(scoreDraft.result===r.id?r.c:t.border),background:scoreDraft.result===r.id?r.c+"22":"transparent",fontSize:15,fontWeight:scoreDraft.result===r.id?700:400,color:scoreDraft.result===r.id?r.c:t.textSecondary,cursor:"pointer"\}\}>\{r.l\}</button>;\
            \})\}\
          </div>\
        </div>\
        <div style=\{\{marginBottom:18\}\}>\
          <div style=\{\{display:"flex",justifyContent:"space-between",marginBottom:10\}\}>\
            <label style=\{\{fontSize:12,fontWeight:600,color:t.textSecondary\}\}>Sets</label>\
            \{scoreDraft.sets.length<5&&<button onClick=\{function()\{setScoreDraft(function(d)\{var n=\{\};Object.keys(d).forEach(function(k)\{n[k]=d[k];\});n.sets=d.sets.concat([\{you:"",them:""\}]);return n;\});\}\} style=\{\{background:"transparent",border:"1px solid "+t.accent+"66",borderRadius:7,padding:"3px 11px",fontSize:11,color:t.accent,fontWeight:600,cursor:"pointer"\}\}>+ Set</button>\}\
          </div>\
          \{scoreDraft.sets.map(function(set,si)\{\
            return (\
              <div key=\{si\} style=\{\{display:"grid",gridTemplateColumns:"80px 1fr 1fr 28px",gap:8,marginBottom:8,alignItems:"center"\}\}>\
                <span style=\{\{fontSize:13,fontWeight:600,color:t.textSecondary\}\}>\{"Set " + (si+1)\}</span>\
                \{["you","them"].map(function(who)\{\
                  return <input key=\{who\} type="number" min="0" max="7" value=\{set[who]\} onChange=\{function(e)\{var v=e.target.value;setScoreDraft(function(d)\{var ns=d.sets.map(function(ss,idx)\{if(idx!==si)return ss;var nu=\{\};Object.keys(ss).forEach(function(k)\{nu[k]=ss[k];\});nu[who]=v;return nu;\});var n=\{\};Object.keys(d).forEach(function(k)\{n[k]=d[k];\});n.sets=ns;return n;\});\}\} placeholder="0" style=\{\{padding:"11px 0",textAlign:"center",borderRadius:10,border:"1px solid "+t.border,background:t.inputBg,color:t.text,fontSize:22,fontWeight:700,width:"100%"\}\} />;\
                \})\}\
                \{scoreDraft.sets.length>1?<button onClick=\{function()\{setScoreDraft(function(d)\{var n=\{\};Object.keys(d).forEach(function(k)\{n[k]=d[k];\});n.sets=d.sets.filter(function(_,idx)\{return idx!==si;\});return n;\});\}\} style=\{\{background:"none",border:"none",color:t.textTertiary,fontSize:16,padding:0,cursor:"pointer"\}\}>x</button>:<div/>\}\
              </div>\
            );\
          \})\}\
        </div>\
        <div style=\{\{display:"flex",gap:10\}\}>\
          <button onClick=\{function()\{setScoreModal(null);\}\} style=\{\{flex:1,padding:"13px",borderRadius:13,border:"none",background:t.bgTertiary,color:t.text,fontSize:14,fontWeight:600,cursor:"pointer"\}\}>Cancel</button>\
          <button onClick=\{function()\{\
            var clean=scoreDraft.sets.filter(function(s)\{return s.you!==""||s.them!=="";\});\
            var nm=\{id:Date.now(),oppName:scoreModal.oppName,tournName:scoreModal.tournName,date:fmtShort(new Date()),sets:clean,result:scoreDraft.result,notes:""\};\
            setHistory(function(h)\{return[nm].concat(h);\});\
            if(scoreModal.winnerId1&&scoreModal.winnerId2)\{\
              var winnerId=scoreDraft.result==="win"?scoreModal.winnerId1:scoreModal.winnerId2;\
              recordResult(scoreModal.tournId,scoreModal.roundIdx,scoreModal.matchId,winnerId);\
            \}\
            setScoreModal(null);\
          \}\} style=\{\{flex:2,padding:"13px",borderRadius:13,border:"none",background:t.accent,color:t.accentText,fontSize:14,fontWeight:700,cursor:"pointer"\}\}>Save result</button>\
        </div>\
      </div>\
    </div>\
  )\}\
\
  \{showAuth && (\
    <div onClick=\{function()\{setShowAuth(false);setAuthError("");setAuthStep("choose");\}\} style=\{\{position:"fixed",inset:0,background:"rgba(0,0,0,0.6)",backdropFilter:"blur(16px)",display:"flex",alignItems:"flex-end",justifyContent:"center",zIndex:300\}\}>\
      <div onClick=\{function(e)\{e.stopPropagation();\}\} className="slide-up" style=\{\{background:t.modalBg,borderRadius:"28px 28px 0 0",padding:"32px 28px 52px",width:"100%",maxWidth:480\}\}>\
        <div style=\{\{textAlign:"center",marginBottom:28\}\}>\
          <div style=\{\{width:52,height:52,borderRadius:14,background:t.accent,display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,fontWeight:800,color:t.accentText,margin:"0 auto 14px"\}\}>CS</div>\
          <h2 style=\{\{fontSize:24,fontWeight:700,color:t.text,marginBottom:6\}\}>\{authMode==="signup"?"Create account":"Welcome back"\}</h2>\
          <p style=\{\{fontSize:14,color:t.textSecondary\}\}>Enter tournaments and compete for prizes.</p>\
        </div>\
        \{authStep==="choose"&&(\
          <div style=\{\{display:"flex",flexDirection:"column",gap:10\}\}>\
            <button onClick=\{function()\{setAuthStep("email");\}\} style=\{\{width:"100%",padding:"14px",borderRadius:14,border:"1px solid "+t.border,background:"transparent",color:t.text,fontSize:15,fontWeight:600,cursor:"pointer"\}\}>Continue with Email</button>\
            <p style=\{\{textAlign:"center",fontSize:13,color:t.textSecondary,marginTop:6\}\}>\
              \{authMode==="login"?"No account? ":"Have an account? "\}\
              <button onClick=\{function()\{setAuthMode(authMode==="login"?"signup":"login");setAuthError("");\}\} style=\{\{background:"none",border:"none",color:t.accent,fontWeight:600,fontSize:13,cursor:"pointer"\}\}>\{authMode==="login"?"Sign up":"Log in"\}</button>\
            </p>\
          </div>\
        )\}\
        \{authStep==="email"&&(\
          <div className="fade-up">\
            \{authMode==="signup"&&<div style=\{\{marginBottom:12\}\}><label style=\{\{fontSize:12,fontWeight:600,color:t.textSecondary,display:"block",marginBottom:6\}\}>Full name</label><input value=\{authName\} onChange=\{function(e)\{setAuthName(e.target.value);setAuthError("");\}\} placeholder="Your name" style=\{\{width:"100%",padding:"13px 16px",borderRadius:12,border:"1px solid "+(authError?t.red:t.border),background:t.inputBg,color:t.text,fontSize:15\}\} /></div>\}\
            <div style=\{\{marginBottom:12\}\}><label style=\{\{fontSize:12,fontWeight:600,color:t.textSecondary,display:"block",marginBottom:6\}\}>Email</label><input type="email" value=\{authEmail\} onChange=\{function(e)\{setAuthEmail(e.target.value);setAuthError("");\}\} placeholder="you@example.com" style=\{\{width:"100%",padding:"13px 16px",borderRadius:12,border:"1px solid "+(authError?t.red:t.border),background:t.inputBg,color:t.text,fontSize:15\}\} /></div>\
            <div style=\{\{marginBottom:20\}\}><label style=\{\{fontSize:12,fontWeight:600,color:t.textSecondary,display:"block",marginBottom:6\}\}>Password</label><input type="password" value=\{authPassword\} onChange=\{function(e)\{setAuthPassword(e.target.value);setAuthError("");\}\} placeholder=\{authMode==="signup"?"Min 6 characters":"Your password"\} style=\{\{width:"100%",padding:"13px 16px",borderRadius:12,border:"1px solid "+(authError?t.red:t.border),background:t.inputBg,color:t.text,fontSize:15\}\} /></div>\
            \{authError&&<p style=\{\{fontSize:13,color:t.red,marginBottom:12,textAlign:"center"\}\}>\{authError\}</p>\}\
            <button onClick=\{function()\{\
              if(!authEmail||!authPassword)\{setAuthError("Please fill in all fields.");return;\}\
              if(authMode==="signup"&&!authName)\{setAuthError("Please enter your name.");return;\}\
              setAuthLoading(true);\
              setTimeout(function()\{\
                var init=(authName||authEmail).split(" ").map(function(w)\{return w[0];\}).join("").slice(0,2).toUpperCase();\
                setAuthUser(\{id:"u"+Date.now(),name:authName||authEmail.split("@")[0],email:authEmail,avatar:init\});\
                setProfile(function(p)\{var n=\{\};Object.keys(p).forEach(function(k)\{n[k]=p[k];\});n.name=authName||p.name;n.avatar=init;return n;\});\
                setAuthLoading(false);setShowAuth(false);setAuthStep("choose");setAuthEmail("");setAuthPassword("");setAuthName("");\
              \},900);\
            \}\} disabled=\{authLoading\} style=\{\{width:"100%",padding:"14px",borderRadius:14,border:"none",background:t.accent,color:t.accentText,fontSize:15,fontWeight:700,cursor:authLoading?"default":"pointer",opacity:authLoading?0.7:1\}\}>\
              \{authLoading?"Please wait...":(authMode==="signup"?"Create account":"Log in")\}\
            </button>\
            <button onClick=\{function()\{setAuthStep("choose");setAuthError("");\}\} style=\{\{width:"100%",marginTop:10,padding:"10px",background:"none",border:"none",color:t.textSecondary,fontSize:13,cursor:"pointer"\}\}>Back</button>\
          </div>\
        )\}\
      </div>\
    </div>\
  )\}\
\
</div>\
);\
\}}