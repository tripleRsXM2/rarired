// MessagesScreen.jsx — Messenger-style inbox + thread for the v2 shell.
// Faithful port of the design's `screens-messages.jsx`. Single file
// because the inbox + thread share the seed data and avatar atom; no
// reason to spread them across modules until a real backend lands.
//
// Two screens are exported:
//   <MessagesScreen> — outer router. Owns active conversation state.
//   (internal) Inbox + Thread — picked by `activeConvo`.

import React from "react";

const MESSAGES_SEED = [
  {
    id: "tg-riverside", type: "group", name: "Riverside Spring Open", sub: "12 members",
    initials: "RO", color: "#3a7d5c", activeNow: false, unread: 2, pinned: true,
    lastTime: "11:42", lastSender: "Org · Maya", lastPreview: "Draw is up. R16 starts Sat 9am.",
    activity: [
      { from: "Maya · Org", text: "Hey all — R16 draw is live on the bracket page.", t: "11:40", side: "them", avatar: "M" },
      { from: "Maya · Org", text: "Saturday 9am sharp at Riverside Court 3.", t: "11:42", side: "them", avatar: "M", kind: "invite", invite: { date: "Sat May 9 · 9:00 AM", court: "Riverside · Court 3", vs: "A. Volkov", round: "R16" } },
    ],
  },
  {
    id: "dm-volkov", type: "dm", name: "A. Volkov", sub: "Opponent · R16",
    initials: "AV", color: "#c66b3d", activeNow: true, unread: 1, typing: true,
    lastTime: "10:58", lastSender: "A. Volkov", lastPreview: "Sounds good — see you on 3.",
    activity: [
      { from: "A. Volkov", text: "Saw the draw — we're up first round, court 3?", t: "10:54", side: "them", avatar: "A" },
      { from: "me", text: "Yep, 9am. Bring some sun, the forecast looks gross.", t: "10:55", side: "me", read: true },
      { from: "A. Volkov", text: "Sounds good — see you on 3.", t: "10:58", side: "them", avatar: "A", reactions: ["TB"] },
    ],
  },
  {
    id: "dm-coach", type: "dm", name: "Coach Daniel", sub: "Coach",
    initials: "CD", color: "#2a4f7d", activeNow: true, unread: 0,
    lastTime: "9:20", lastSender: "me", lastPreview: "You: nice, will work on the second serve toss this week",
    activity: [
      { from: "Coach Daniel", text: "Watched the Park match clips. Couple of notes:", t: "9:14", side: "them", avatar: "D" },
      { from: "Coach Daniel", text: "1) toss is drifting back on second serve\n2) nice cross-court forehand depth — keep that\n3) more first-serve %, you were 48%", t: "9:15", side: "them", avatar: "D" },
      { from: "me", text: "nice, will work on the second serve toss this week", t: "9:20", side: "me", read: true },
    ],
  },
  {
    id: "dm-park-confirm", type: "dm", name: "J. Park", sub: "Westwood Box League",
    initials: "JP", color: "#7d4f2a", activeNow: false, unread: 1,
    lastTime: "Yesterday", lastSender: "J. Park", lastPreview: "Sent a score to confirm: 4-6, 3-6",
    activity: [
      { from: "me", text: "gg, well played out there", t: "Yesterday 5:14 PM", side: "me", read: true },
      { from: "J. Park", text: "You too — that breaker was tight. Logging the result now.", t: "Yesterday 5:18 PM", side: "them", avatar: "J" },
      { from: "J. Park", text: "", t: "Yesterday 5:19 PM", side: "them", avatar: "J", kind: "confirm", confirm: { p1: "You", p2: "J. Park", sets: [[4, 6], [3, 6]], status: "pending", league: "Westwood Box League · Wk 4" } },
    ],
  },
  {
    id: "tg-westwood", type: "group", name: "Westwood Box · D2", sub: "6 players",
    initials: "WB", color: "#5a3a7d", activeNow: false, unread: 0,
    lastTime: "Yesterday", lastSender: "L. Tanaka", lastPreview: "L. Tanaka shared a result",
    activity: [
      { from: "L. Tanaka", text: "Got the W vs M. Carter, finally", t: "Yesterday 8:02 PM", side: "them", avatar: "L" },
      { from: "L. Tanaka", text: "", t: "Yesterday 8:03 PM", side: "them", avatar: "L", kind: "score", score: { p1: "L. Tanaka", p2: "M. Carter", sets: [[7, 5], [6, 4]], duration: "1h 38m", surface: "Hard" } },
      { from: "me", text: "huge", t: "Yesterday 8:09 PM", side: "me", read: true },
    ],
  },
  {
    id: "dm-carter", type: "dm", name: "M. Carter", sub: "Hitting partner",
    initials: "MC", color: "#7d2a4f", activeNow: false, unread: 0,
    lastTime: "Mon", lastSender: "M. Carter", lastPreview: "tues 7am? riverside?",
    activity: [
      { from: "M. Carter", text: "tues 7am? riverside?", t: "Mon 9:40 PM", side: "them", avatar: "M" },
      { from: "M. Carter", text: "", t: "Mon 9:40 PM", side: "them", avatar: "M", kind: "invite", invite: { date: "Tue · 7:00 AM", court: "Riverside · Court 1", vs: "Hit + drill", round: "Practice" } },
    ],
  },
  {
    id: "tg-saturday", type: "group", name: "Sat morning crew", sub: "8 members",
    initials: "SC", color: "#7d6a2a", activeNow: false, unread: 0,
    lastTime: "Sun", lastSender: "Priya", lastPreview: "Priya: anyone for doubles next sat?",
    activity: [
      { from: "Priya", text: "anyone for doubles next sat?", t: "Sun 6:14 PM", side: "them", avatar: "P" },
      { from: "Sam",   text: "in", t: "Sun 6:15 PM", side: "them", avatar: "S" },
      { from: "me",    text: "down — 8am or 9am?", t: "Sun 6:18 PM", side: "me", read: true },
    ],
  },
  {
    id: "dm-organizer", type: "dm", name: "Riverside Org", sub: "Maya · Tournament desk",
    initials: "RM", color: "#3a7d5c", activeNow: false, unread: 0,
    lastTime: "Apr 30", lastSender: "Maya", lastPreview: "Confirmed your registration for Spring Open.",
    activity: [
      { from: "Maya", text: "Confirmed your registration for Spring Open.", t: "Apr 30", side: "them", avatar: "M" },
      { from: "Maya", text: "Entry fee receipt coming via email. GL!",       t: "Apr 30", side: "them", avatar: "M" },
    ],
  },
];

export default function MessagesScreen({ theme, accent, isPhone = false }) {
  const [activeConvo, setActiveConvo] = React.useState(null);
  if (activeConvo) {
    return <ThreadScreen theme={theme} accent={accent} convoId={activeConvo} onBack={() => setActiveConvo(null)} isPhone={isPhone} />;
  }
  return <Inbox theme={theme} accent={accent} onOpen={(id) => setActiveConvo(id)} isPhone={isPhone} />;
}

function Inbox({ theme, accent, onOpen, isPhone }) {
  const [q, setQ] = React.useState("");
  const [tab, setTab] = React.useState("inbox");
  const filt = MESSAGES_SEED.filter((c) => {
    if (tab === "groups" && c.type !== "group") return false;
    if (!q) return true;
    return (c.name + " " + (c.lastPreview || "")).toLowerCase().includes(q.toLowerCase());
  });

  return (
    <div style={{ height: "100%", background: theme.bg, color: theme.ink, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <div style={{ padding: isPhone ? "54px 18px 8px" : "24px 22px 10px", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <h1 className="t-serif" style={{ fontSize: isPhone ? 30 : 36, lineHeight: 1, margin: 0, letterSpacing: "-0.02em" }}>Inbox</h1>
          <button className="t-btn" aria-label="New message" style={{
            width: 36, height: 36, borderRadius: "50%", appearance: "none",
            border: 0, background: theme.chip, color: theme.ink,
            display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer",
          }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
          </button>
        </div>
        <div style={{ marginTop: 12, background: theme.chip, borderRadius: 999, display: "flex", alignItems: "center", gap: 8, padding: "9px 14px" }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={theme.inkSoft} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search players, tournaments…" style={{
            flex: 1, appearance: "none", border: 0, background: "transparent", outline: "none",
            fontFamily: "Inter", fontSize: 13, color: theme.ink,
          }} />
        </div>
        <div style={{ display: "flex", gap: 6, marginTop: 12 }}>
          {[{ id: "inbox", label: "All" }, { id: "groups", label: "Tournaments" }].map((tt) => {
            const active = tab === tt.id;
            return (
              <button key={tt.id} onClick={() => setTab(tt.id)} className="t-btn" style={{
                appearance: "none", border: `1px solid ${active ? theme.ink : theme.line}`,
                background: active ? theme.ink : "transparent",
                color: active ? theme.bg : theme.inkSoft,
                borderRadius: 999, padding: "5px 13px",
                fontFamily: "Inter", fontSize: 12, fontWeight: 600, cursor: "pointer",
              }}>{tt.label}</button>
            );
          })}
        </div>
      </div>

      <div className="t-noscroll" style={{ flexShrink: 0, padding: "10px 14px 4px", display: "flex", gap: 14, overflowX: "auto", scrollbarWidth: "none" }}>
        {MESSAGES_SEED.filter((c) => c.activeNow).map((c) => (
          <div key={c.id} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, minWidth: 56 }}>
            <div style={{ position: "relative" }}>
              <Avatar size={52} c={c} />
              <span style={{
                position: "absolute", right: 1, bottom: 1, width: 12, height: 12,
                borderRadius: "50%", background: accent, border: `2px solid ${theme.bg}`,
              }} />
            </div>
            <span style={{ fontSize: 11, fontFamily: "Inter", color: theme.inkSoft, maxWidth: 56, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name.split(" ")[0]}</span>
          </div>
        ))}
      </div>

      <div className="t-noscroll" style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "4px 6px 100px" }}>
        {filt.map((c) => <ConvoRow key={c.id} c={c} theme={theme} accent={accent} onOpen={() => onOpen(c.id)} />)}
        {filt.length === 0 && (
          <div style={{ textAlign: "center", color: theme.inkFaint, padding: "40px 20px", fontSize: 13 }}>No conversations match.</div>
        )}
      </div>
    </div>
  );
}

function Avatar({ size = 44, c }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: "50%", background: c.color,
      display: "flex", alignItems: "center", justifyContent: "center",
      color: "#fbf6e9", fontFamily: "Inter", fontWeight: 600, fontSize: size * 0.36,
      flexShrink: 0, letterSpacing: "0.02em",
    }}>{c.initials}</div>
  );
}

function ConvoRow({ c, theme, accent, onOpen }) {
  const unread = c.unread > 0;
  return (
    <button onClick={onOpen} className="t-btn" style={{
      width: "100%", appearance: "none", border: 0, background: "transparent",
      padding: "10px 12px", borderRadius: 12, display: "flex", alignItems: "center", gap: 12,
      textAlign: "left", cursor: "pointer", color: theme.ink,
    }}>
      <div style={{ position: "relative", flexShrink: 0 }}>
        <Avatar size={48} c={c} />
        {c.activeNow && (
          <span style={{ position: "absolute", right: 0, bottom: 0, width: 12, height: 12, borderRadius: "50%", background: accent, border: `2px solid ${theme.bg}` }} />
        )}
      </div>
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
          <span style={{ fontFamily: "Inter", fontSize: 14, fontWeight: unread ? 700 : 600, color: theme.ink, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.name}</span>
          <span style={{ fontSize: 11, fontFamily: "Inter", flexShrink: 0, color: unread ? accent : theme.inkFaint, fontWeight: unread ? 600 : 500 }}>{c.lastTime}</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{
            flex: 1, minWidth: 0, fontFamily: "Inter", fontSize: 12.5, lineHeight: 1.35,
            color: unread ? theme.ink : theme.inkSoft, fontWeight: unread ? 500 : 400,
            whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
          }}>
            {c.typing ? <span style={{ color: accent, fontStyle: "italic" }}>typing…</span> : c.lastPreview}
          </span>
          {unread && (
            <span style={{
              minWidth: 18, height: 18, borderRadius: 999, background: accent,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontFamily: "Inter", fontWeight: 700, fontSize: 10.5, color: "#0f1410",
              padding: "0 6px",
            }}>{c.unread}</span>
          )}
        </div>
      </div>
    </button>
  );
}

function ThreadScreen({ theme, accent, convoId, onBack, isPhone }) {
  const c = MESSAGES_SEED.find((x) => x.id === convoId) || MESSAGES_SEED[0];
  const [draft, setDraft] = React.useState("");
  const [msgs, setMsgs] = React.useState(c.activity);
  const scrollRef = React.useRef(null);

  React.useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [msgs.length]);

  const send = (text) => {
    if (!text.trim()) return;
    setMsgs((m) => [...m, { from: "me", text, t: "now", side: "me", read: false }]);
    setDraft("");
  };

  const suggestions = c.type === "group"
    ? ["Got it", "I'm in", "See you there"]
    : c.id === "dm-volkov" ? ["Good luck!", "Court 3, 9am", "On my way"]
    : c.id === "dm-coach"  ? ["Will do", "Got it", "Send the clip?"]
    : ["Sounds good", "On my way", "Thanks"];

  return (
    <div style={{ height: "100%", background: theme.bg, color: theme.ink, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <div style={{ padding: isPhone ? "52px 12px 10px" : "14px 18px", display: "flex", alignItems: "center", gap: 10, borderBottom: `0.5px solid ${theme.line}`, flexShrink: 0 }}>
        <button onClick={onBack} className="t-btn" aria-label="Back" style={{
          width: 32, height: 32, appearance: "none", border: 0, background: "transparent",
          color: theme.ink, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer",
        }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
        </button>
        <div style={{ position: "relative" }}>
          <Avatar size={36} c={c} />
          {c.activeNow && (
            <span style={{ position: "absolute", right: -1, bottom: -1, width: 10, height: 10, borderRadius: "50%", background: accent, border: `2px solid ${theme.bg}` }} />
          )}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: "Inter", fontWeight: 700, fontSize: 14, color: theme.ink, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.name}</div>
          <div style={{ fontFamily: "Inter", fontSize: 11, color: c.activeNow ? accent : theme.inkSoft }}>{c.activeNow ? "Active now" : c.sub}</div>
        </div>
      </div>

      <div ref={scrollRef} className="t-noscroll" style={{
        flex: 1, minHeight: 0, overflowY: "auto",
        padding: "14px 12px 8px", display: "flex", flexDirection: "column", gap: 4,
      }}>
        {msgs.map((m, i) => {
          const next = msgs[i + 1];
          const last = !next || next.side !== m.side;
          return <Bubble key={i} m={m} c={c} theme={theme} accent={accent} last={last} />;
        })}
      </div>

      <div className="t-noscroll" style={{ flexShrink: 0, padding: "4px 12px 8px", display: "flex", gap: 6, overflowX: "auto", scrollbarWidth: "none" }}>
        {suggestions.map((s) => (
          <button key={s} onClick={() => send(s)} className="t-btn" style={{
            appearance: "none", border: `1px solid ${theme.line}`,
            background: theme.bg, color: theme.ink,
            borderRadius: 999, padding: "7px 13px", flexShrink: 0,
            fontFamily: "Inter", fontSize: 12, fontWeight: 500, cursor: "pointer",
          }}>{s}</button>
        ))}
      </div>

      <div style={{ flexShrink: 0, padding: isPhone ? "8px 10px 92px" : "8px 14px 14px", display: "flex", alignItems: "flex-end", gap: 8, borderTop: `0.5px solid ${theme.line}` }}>
        <div style={{ flex: 1, background: theme.chip, borderRadius: 22, padding: "8px 14px", display: "flex", alignItems: "center", gap: 8, minHeight: 36 }}>
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") send(draft); }}
            placeholder="Aa"
            style={{ flex: 1, appearance: "none", border: 0, background: "transparent", outline: "none", fontFamily: "Inter", fontSize: 14, color: theme.ink }}
          />
        </div>
        {draft.trim() && (
          <button onClick={() => send(draft)} className="t-btn" aria-label="Send" style={{
            width: 36, height: 36, borderRadius: "50%", appearance: "none", border: 0,
            background: accent, color: "#0f1410", cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
          }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="m22 2-7 20-4-9-9-4 20-7z"/></svg>
          </button>
        )}
      </div>
    </div>
  );
}

function Bubble({ m, c, theme, accent, last }) {
  if (m.kind === "score")   return <ScoreCardBubble m={m} theme={theme} accent={accent} c={c} last={last} />;
  if (m.kind === "invite")  return <InviteCardBubble m={m} theme={theme} accent={accent} c={c} last={last} />;
  if (m.kind === "confirm") return <ConfirmCardBubble m={m} theme={theme} accent={accent} c={c} last={last} />;
  const me = m.side === "me";
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 6, flexDirection: me ? "row-reverse" : "row", marginTop: last ? 4 : 1 }}>
      {!me && (
        <div style={{ width: 24, flexShrink: 0 }}>
          {last && (
            <div style={{ width: 24, height: 24, borderRadius: "50%", background: c.color, color: "#fbf6e9", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "Inter", fontWeight: 600, fontSize: 10 }}>{m.avatar || c.initials[0]}</div>
          )}
        </div>
      )}
      <div style={{ maxWidth: "76%", display: "flex", flexDirection: "column", alignItems: me ? "flex-end" : "flex-start", position: "relative" }}>
        {!me && c.type === "group" && last && (
          <span style={{ fontSize: 10, color: theme.inkFaint, fontFamily: "Inter", fontWeight: 500, padding: "0 12px 2px" }}>{m.from}</span>
        )}
        <div style={{
          background: me ? accent : theme.chip,
          color: me ? "#0f1410" : theme.ink,
          padding: "8px 13px",
          borderRadius: bubbleRadius(me),
          fontFamily: "Inter", fontSize: 14, lineHeight: 1.35,
          whiteSpace: "pre-wrap", wordBreak: "break-word",
          fontWeight: me ? 500 : 400,
        }}>{m.text}</div>
      </div>
    </div>
  );
}
function bubbleRadius(me) { return me ? "18px 18px 4px 18px" : "18px 18px 18px 4px"; }

function sumSets(sets, side) { return sets.reduce((acc, s) => acc + (s[side] > s[1 - side] ? 1 : 0), 0); }

function ScoreCardBubble({ m, theme, accent, c, last }) {
  const s = m.score;
  const winner = sumSets(s.sets, 0) > sumSets(s.sets, 1) ? 0 : 1;
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 6, marginTop: last ? 4 : 1 }}>
      <div style={{ width: 24, flexShrink: 0 }}>
        {last && <div style={{ width: 24, height: 24, borderRadius: "50%", background: c.color, color: "#fbf6e9", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "Inter", fontWeight: 600, fontSize: 10 }}>{m.avatar || c.initials[0]}</div>}
      </div>
      <div style={{ maxWidth: "82%" }}>
        <div style={{ background: "#0f1410", color: "#e8e6df", borderRadius: 14, overflow: "hidden", minWidth: 240, border: `1px solid ${theme.line}` }}>
          <div style={{ padding: "8px 14px", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "0.5px solid rgba(255,255,255,0.08)" }}>
            <span className="t-cap" style={{ color: "rgba(232,230,223,0.6)", fontSize: 9.5 }}>FINAL · {s.surface}</span>
            <span style={{ fontSize: 10, color: "rgba(232,230,223,0.5)", fontFamily: "Inter" }}>{s.duration}</span>
          </div>
          <div style={{ padding: "12px 14px", display: "flex", flexDirection: "column", gap: 6 }}>
            <ScoreLine name={s.p1} sets={s.sets} side={0} winner={winner === 0} accent={accent} />
            <ScoreLine name={s.p2} sets={s.sets} side={1} winner={winner === 1} accent={accent} />
          </div>
        </div>
      </div>
    </div>
  );
}
function ScoreLine({ name, sets, side, winner, accent }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 18, alignItems: "center" }}>
      <span style={{
        fontFamily: "Inter", fontSize: 13, fontWeight: winner ? 700 : 500,
        color: winner ? "#e8e6df" : "rgba(232,230,223,0.6)",
        whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
        display: "flex", alignItems: "center", gap: 6,
      }}>
        {winner && <span style={{ width: 5, height: 5, borderRadius: "50%", background: accent }} />}
        {name}
      </span>
      <div className="t-num" style={{ display: "flex", gap: 12 }}>
        {sets.map((set, i) => (
          <span key={i} style={{
            fontSize: 18, fontWeight: 600, letterSpacing: "-0.02em",
            color: set[side] > set[1 - side] ? "#e8e6df" : "rgba(232,230,223,0.45)",
            minWidth: 12, textAlign: "center",
          }}>{set[side]}</span>
        ))}
      </div>
    </div>
  );
}

function InviteCardBubble({ m, theme, accent, c, last }) {
  const inv = m.invite;
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 6, marginTop: last ? 4 : 1 }}>
      <div style={{ width: 24, flexShrink: 0 }}>
        {last && <div style={{ width: 24, height: 24, borderRadius: "50%", background: c.color, color: "#fbf6e9", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "Inter", fontWeight: 600, fontSize: 10 }}>{m.avatar || c.initials[0]}</div>}
      </div>
      <div style={{ maxWidth: "82%" }}>
        <div style={{ background: theme.bg, border: `1.5px solid ${theme.ink}`, borderRadius: 14, padding: "12px 14px", minWidth: 240 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={accent} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>
            <span className="t-cap" style={{ color: theme.inkSoft, fontSize: 9.5 }}>MATCH INVITE · {inv.round}</span>
          </div>
          <div style={{ fontFamily: "Inter", fontWeight: 700, fontSize: 15, color: theme.ink, marginBottom: 2 }}>{inv.date}</div>
          <div style={{ fontFamily: "Inter", fontSize: 12.5, color: theme.inkSoft, marginBottom: 10 }}>{inv.court}</div>
          <div style={{ fontFamily: "Inter", fontSize: 12, color: theme.inkSoft, paddingTop: 8, borderTop: `0.5px solid ${theme.line}`, marginBottom: 10 }}>
            vs <span style={{ color: theme.ink, fontWeight: 600 }}>{inv.vs}</span>
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <button className="t-btn" style={{ flex: 1, appearance: "none", border: 0, background: theme.ink, color: theme.bg, borderRadius: 8, padding: "8px 10px", cursor: "pointer", fontFamily: "Inter", fontSize: 12, fontWeight: 600 }}>Accept</button>
            <button className="t-btn" style={{ flex: 1, appearance: "none", border: `1px solid ${theme.line}`, background: "transparent", color: theme.ink, borderRadius: 8, padding: "7px 10px", cursor: "pointer", fontFamily: "Inter", fontSize: 12, fontWeight: 600 }}>Reschedule</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ConfirmCardBubble({ m, theme, accent, c, last }) {
  const cf = m.confirm;
  const youWon = sumSets(cf.sets, 0) > sumSets(cf.sets, 1);
  const setStr = cf.sets.map((s) => `${s[0]}-${s[1]}`).join(", ");
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 6, marginTop: last ? 4 : 1 }}>
      <div style={{ width: 24, flexShrink: 0 }}>
        {last && <div style={{ width: 24, height: 24, borderRadius: "50%", background: c.color, color: "#fbf6e9", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "Inter", fontWeight: 600, fontSize: 10 }}>{m.avatar || c.initials[0]}</div>}
      </div>
      <div style={{ maxWidth: "82%" }}>
        <div style={{ background: theme.bg, border: `1px solid ${theme.line}`, borderRadius: 14, padding: "12px 14px", minWidth: 240 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={accent} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
            <span className="t-cap" style={{ color: theme.inkSoft, fontSize: 9.5 }}>CONFIRM SCORE · {cf.league}</span>
          </div>
          <div style={{ fontFamily: "Inter", fontSize: 13, color: theme.ink, marginBottom: 2 }}>
            <span style={{ fontWeight: youWon ? 700 : 500 }}>{cf.p1}</span>
            <span style={{ color: theme.inkFaint, margin: "0 6px" }}>vs</span>
            <span style={{ fontWeight: !youWon ? 700 : 500 }}>{cf.p2}</span>
          </div>
          <div className="t-num" style={{ fontFamily: "JetBrains Mono", fontSize: 18, fontWeight: 600, color: theme.ink, letterSpacing: "-0.01em", marginBottom: 12 }}>{setStr}</div>
          <div style={{ display: "flex", gap: 6 }}>
            <button className="t-btn" style={{ flex: 1, appearance: "none", border: 0, background: accent, color: "#0f1410", borderRadius: 8, padding: "8px 10px", cursor: "pointer", fontFamily: "Inter", fontSize: 12, fontWeight: 700 }}>Confirm</button>
            <button className="t-btn" style={{ flex: 1, appearance: "none", border: `1px solid ${theme.line}`, background: "transparent", color: theme.ink, borderRadius: 8, padding: "7px 10px", cursor: "pointer", fontFamily: "Inter", fontSize: 12, fontWeight: 600 }}>Dispute</button>
          </div>
        </div>
      </div>
    </div>
  );
}
