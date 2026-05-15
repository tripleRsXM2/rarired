// MessagesScreen.jsx — Messenger-style inbox + thread for the v2 shell.
//
// PR1 of the v2-messages-wiring series: this screen used to render off
// a hardcoded MESSAGES_SEED. It now consumes V1's `useDMs` hook (mounted
// up in BaselineApp.jsx so authUser + friends + blockedUserIds are
// threaded in once). Visual structure is preserved — Inbox / ConvoRow /
// Avatar / ThreadScreen / Bubble all keep their seed-era shape; we just
// adapt the live data into that shape via v2MessageAdapter.js.
//
// What's intentionally NOT wired yet:
//   • Score / Invite / Confirm widget bubbles — the schema doesn't carry
//     a `kind` field yet (PR2 migration). The widget components stay in
//     place but never fire because no real row sets msg.kind.
//   • Reactions, reply-to, typing-indicator broadcast on send.
//   • Read-receipt visuals — V1 has the data, V2's prototype doesn't
//     render them.
//   • Suggestion pills under the composer — kept as a static fallback
//     so the visual rhythm doesn't change; not contextually wired.
//
// Two screens are exported:
//   <MessagesScreen> — outer router. Owns active conversation state.
//   (internal) Inbox + Thread — picked by `activeConvo`.

import React from "react";
import { convToV2, msgToV2, formatRelativeTime } from "./v2MessageAdapter.js";
import NewMessageScreen from "./NewMessageScreen.jsx";

// Defensive empty-state values when dms is still loading or absent.
var EMPTY_CONVS = [];
var EMPTY_MSGS  = [];

export default function MessagesScreen({ theme, accent, isPhone = false, dms, authUser, everyonePlayers }) {
  const [activeConvoId, setActiveConvoId] = React.useState(null);
  const [composing, setComposing] = React.useState(false);
  const meId = (authUser && authUser.id) || null;

  // Map V1's enriched conversation rows into the V2 shape the inbox UI
  // expects. Memoized on the inputs so we don't re-derive each render.
  const conversations = React.useMemo(function () {
    if (!dms || !Array.isArray(dms.conversations)) return EMPTY_CONVS;
    return dms.conversations
      .map(function (c) { return convToV2(c, meId, dms); })
      .filter(Boolean);
  }, [dms && dms.conversations, dms && dms.pinnedConvIds, dms && dms.typingConvs, meId]);

  // Auto-mirror activeConvoId into the V1 hook's activeConv (the hook
  // needs it to load thread messages + subscribe to realtime). We
  // resolve the raw v1 conv from the id and pass it to openConversation.
  // Closing returns us to the inbox.
  React.useEffect(function () {
    if (!dms) return;
    if (activeConvoId) {
      var raw = (dms.conversations || []).find(function (c) { return c.id === activeConvoId; });
      if (raw && (!dms.activeConv || dms.activeConv.id !== activeConvoId)) {
        dms.openConversation(raw);
      }
    } else if (dms.activeConv) {
      dms.closeConversation();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeConvoId, dms && dms.conversations]);

  // Pencil button → opens the NewMessageScreen overlay. The overlay
  // exposes onPickContact(convId, optionalDraftText) to route into a
  // thread, and onPickGroup(partners) to materialise a group conv via
  // useDMs.openConversationWith().
  async function onPickGroup(partners) {
    if (!dms || !partners || partners.length === 0) return { error: { message: "No partners selected" } };
    var arg = partners.length === 1 ? partners[0] : partners;
    var r = await dms.openConversationWith(arg);
    if (r && r.error) return { error: r.error };
    // openConversationWith puts the conv into dms.activeConv. Read the
    // id from there — works for both the draft (1:1) and freshly-
    // created group paths.
    var convId = dms.activeConv && dms.activeConv.id;
    return { convId: convId };
  }

  if (composing) {
    return (
      <NewMessageScreen
        theme={theme} accent={accent} isPhone={isPhone}
        conversations={dms && dms.conversations}
        friends={dms && dms.friends}
        everyonePlayers={everyonePlayers}
        meId={meId}
        onBack={function () { setComposing(false); }}
        onPickContact={async function (convId, draftText) {
          setComposing(false);
          if (convId) {
            setActiveConvoId(convId);
            if (draftText && draftText.trim() && dms) {
              // Defer a tick so openConversation effect fires first and
              // dms.activeConv lines up with the new conv id.
              setTimeout(function () {
                if (dms.sendMessage) dms.sendMessage(draftText.trim());
              }, 50);
            }
          }
        }}
        onPickGroup={onPickGroup}
      />
    );
  }

  if (activeConvoId) {
    return (
      <ThreadScreen
        theme={theme} accent={accent} isPhone={isPhone}
        convoId={activeConvoId}
        conversations={conversations}
        dms={dms} meId={meId}
        onBack={function () { setActiveConvoId(null); }}
      />
    );
  }
  return (
    <Inbox
      theme={theme} accent={accent} isPhone={isPhone}
      conversations={conversations}
      loaded={!!(dms && dms.conversationsLoaded)}
      onOpen={function (id) { setActiveConvoId(id); }}
      onCompose={function () { setComposing(true); }}
    />
  );
}

function Inbox({ theme, accent, isPhone, conversations, loaded, onOpen, onCompose }) {
  const [q, setQ] = React.useState("");
  const [tab, setTab] = React.useState("inbox");
  const filt = conversations.filter((c) => {
    if (tab === "groups" && c.type !== "group") return false;
    if (!q) return true;
    return (c.name + " " + (c.lastPreview || "")).toLowerCase().includes(q.toLowerCase());
  });

  return (
    <div style={{ height: "100%", background: theme.bg, color: theme.ink, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <div style={{ padding: isPhone ? "54px 18px 8px" : "24px 22px 10px", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <h1 className="t-serif" style={{ fontSize: isPhone ? 30 : 36, lineHeight: 1, margin: 0, letterSpacing: "-0.02em" }}>Inbox</h1>
          <button onClick={onCompose} className="t-btn" aria-label="New message" style={{
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
        {conversations.filter((c) => c.activeNow).map((c) => (
          <div key={c.id} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, minWidth: 56 }}>
            <div style={{ position: "relative" }}>
              <Avatar size={52} c={c} />
              <span style={{
                position: "absolute", right: 1, bottom: 1, width: 12, height: 12,
                borderRadius: "50%", background: accent, border: `2px solid ${theme.bg}`,
              }} />
            </div>
            <span style={{ fontSize: 11, fontFamily: "Inter", color: theme.inkSoft, maxWidth: 56, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{(c.name || "").split(" ")[0]}</span>
          </div>
        ))}
      </div>

      <div className="t-noscroll" style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "4px 6px 100px" }}>
        {filt.map((c) => <ConvoRow key={c.id} c={c} theme={theme} accent={accent} onOpen={() => onOpen(c.id)} />)}
        {filt.length === 0 && (
          <div style={{ textAlign: "center", color: theme.inkFaint, padding: "40px 20px", fontSize: 13 }}>
            {loaded
              ? (q || tab === "groups"
                  ? "No conversations match."
                  : "No conversations yet.")
              : "Loading…"}
          </div>
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

function ThreadScreen({ theme, accent, convoId, conversations, dms, meId, onBack, isPhone }) {
  // V2 conv shape (for header chrome). Fall back to a placeholder if
  // the conv row hasn't landed yet.
  const c = conversations.find((x) => x.id === convoId) || {
    id: convoId, type: "dm", name: "Conversation", initials: "?",
    color: "#777", activeNow: false, unread: 0, pinned: false,
    typing: false, lastTime: "", lastSender: "", lastPreview: "",
  };
  const rawConv = (dms && Array.isArray(dms.conversations))
    ? dms.conversations.find((x) => x.id === convoId)
    : null;
  const [draft, setDraft] = React.useState("");
  const scrollRef = React.useRef(null);

  // Map V1 thread rows to V2 bubbles. The hook owns realtime; we just
  // project. If dms is null (defensive) we render an empty thread.
  const msgs = React.useMemo(function () {
    if (!dms || !Array.isArray(dms.threadMessages)) return EMPTY_MSGS;
    return dms.threadMessages
      .map(function (row) { return msgToV2(row, rawConv, meId); })
      .filter(Boolean);
  }, [dms && dms.threadMessages, rawConv, meId]);

  React.useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [msgs.length]);

  const sending = !!(dms && dms.sending);
  const send = (text) => {
    if (!text || !text.trim()) return;
    if (!dms || !dms.sendMessage) return;
    setDraft("");
    // Fire-and-forget. useDMs handles optimistic UI + error rollback;
    // on failure it restores the draft state inside the hook (we
    // mirror that by not erroring out here).
    var p = dms.sendMessage(text);
    if (p && typeof p.then === "function") {
      p.then(function () {
        // Scroll-to-bottom after the realtime INSERT lands.
        if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      }).catch(function () { /* hook already restored state */ });
    }
  };

  // Suggestion pills — keep the visual placeholder per PR1 spec.
  // Generic strings; PR2/PR3 will swap to contextual (e.g. confirm
  // score / accept invite) once real widgets render.
  const suggestions = c.type === "group"
    ? ["Got it", "I'm in", "See you there"]
    : ["Sounds good", "On my way", "Thanks"];

  // Sub-header line. Use the v2 conv's activeNow/lastSender as a
  // shorthand; otherwise blank. The prototype showed contextual
  // sub-text like "Opponent · R16" but we don't have a category
  // metadata field yet — leave blank for non-active partners.
  const subLabel = c.activeNow
    ? "Active now"
    : (rawConv && rawConv.last_message_at ? "Active " + formatRelativeTime(rawConv.last_message_at) : "");

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
          <div style={{ fontFamily: "Inter", fontSize: 11, color: c.activeNow ? accent : theme.inkSoft }}>{subLabel}</div>
        </div>
      </div>

      <div ref={scrollRef} className="t-noscroll" style={{
        flex: 1, minHeight: 0, overflowY: "auto",
        padding: "14px 12px 8px", display: "flex", flexDirection: "column", gap: 4,
      }}>
        {(dms && dms.threadLoading && msgs.length === 0) && (
          <div style={{ textAlign: "center", color: theme.inkFaint, padding: "20px", fontSize: 12 }}>Loading…</div>
        )}
        {msgs.map((m, i) => {
          const next = msgs[i + 1];
          const last = !next || next.side !== m.side;
          return <Bubble key={m.id || i} m={m} c={c} theme={theme} accent={accent} last={last} />;
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
            disabled={sending}
            style={{ flex: 1, appearance: "none", border: 0, background: "transparent", outline: "none", fontFamily: "Inter", fontSize: 14, color: theme.ink }}
          />
        </div>
        {draft.trim() && (
          <button onClick={() => send(draft)} className="t-btn" aria-label="Send" disabled={sending} style={{
            width: 36, height: 36, borderRadius: "50%", appearance: "none", border: 0,
            background: accent, color: "#0f1410", cursor: sending ? "default" : "pointer", opacity: sending ? 0.6 : 1,
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
  // PR1: kind/payload widgets (score, invite, confirm) are deferred.
  // The schema doesn't carry a `kind` column yet — that's PR2. We keep
  // these branches in place but they'll never match a real DM until
  // the migration ships.
  if (m.kind === "score")   return <ScoreCardBubble m={m} theme={theme} accent={accent} c={c} last={last} />;
  if (m.kind === "invite")  return <InviteCardBubble m={m} theme={theme} accent={accent} c={c} last={last} />;
  if (m.kind === "confirm") return <ConfirmCardBubble m={m} theme={theme} accent={accent} c={c} last={last} />;
  const me = m.side === "me";
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 6, flexDirection: me ? "row-reverse" : "row", marginTop: last ? 4 : 1 }}>
      {!me && (
        <div style={{ width: 24, flexShrink: 0 }}>
          {last && (
            <div style={{ width: 24, height: 24, borderRadius: "50%", background: c.color, color: "#fbf6e9", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "Inter", fontWeight: 600, fontSize: 10 }}>{m.avatar || (c.initials && c.initials[0]) || "?"}</div>
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
