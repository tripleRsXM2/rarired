// MessagesScreen.jsx — Messenger-style inbox + thread for the v2 shell.
//
// History:
//   PR1 (Mdawg/v2-messages-wiring) wired the inbox + thread off V1's
//   useDMs hook. Widget bubbles existed visually but were never reached
//   because direct_messages had no kind/payload columns.
//
//   PR2/PR3 (Mdawg-v2-messages-widgets, this file):
//     • The schema migration 20260516_dm_structured_messages.sql adds
//       kind + payload columns. The msgToV2 adapter now passes those
//       through. The Bubble dispatcher branches on a derived
//       "widgetKindForView" (not the raw `kind`), because the same
//       row can render as either ScoreCard or ConfirmCard depending
//       on the viewer's role + the referenced match's current status.
//     • Inbox search now also surfaces friends + everyone the user
//       could start a new conversation with (Bug B).
//     • Top-right pencil opens a New Message overlay (Bug C).
//     • Widget buttons dispatch real actions via useMatchHistory +
//       useChallenges (PR3) and refresh on success.
//
// The three widget components (ScoreCardBubble / InviteCardBubble /
// ConfirmCardBubble) stay exactly as designed — render passthrough
// only. User feedback locked the visual design at PR2/PR3 time:
// "id like to keep the widgets presented in v2 exactly like they
//  are. just hook them up so they work correctly."

import React from "react";
import { convToV2, msgToV2, formatRelativeTime, matchToCardShape, challengeToCardShape } from "./v2MessageAdapter.js";
import { useMatchByIds } from "./useMatchByIds.js";
import { avColor, initials as deriveInitials } from "../../../lib/utils/avatar.js";

// Defensive empty-state values when dms is still loading or absent.
var EMPTY_CONVS = [];
var EMPTY_MSGS  = [];

// Gated debug logger for Bug A breadcrumbs. Flip `window.__cs_debug =
// true` in DevTools to capture the conv-open → loadThread → render
// path. No-op in normal usage.
function dbg() {
  if (typeof window !== "undefined" && window.__cs_debug) {
    try { console.log.apply(console, ["[v2-msgs]"].concat(Array.prototype.slice.call(arguments))); } catch (_) {}
  }
}

// Pick which widget (if any) to render for a structured DM, based on
// the viewer's role + the referenced entity's status. Returns one of
// 'score' | 'confirm' | 'invite' | null. null falls back to text bubble.
//
// Rules (locked by the brief):
//   kind='score':
//     viewer is OPPONENT + match.status === 'pending_confirmation'  → 'confirm'
//     viewer is SUBMITTER OR match.status in confirmed/voided/disputed → 'score'
//     fallback → 'score' (display-only)
//   kind='invite':
//     viewer is CHALLENGED + status === 'pending' → 'invite' (with buttons)
//     viewer is CHALLENGER OR status in accepted/declined → 'invite' (display-only)
function widgetKindForView(msg, match, challenge, meId) {
  if (!msg) return null;
  if (msg.kind === "score") {
    if (!match) return "score"; // still loading; render the display-only card
    var isOpponent = match.opponent_id === meId;
    if (isOpponent && match.status === "pending_confirmation") return "confirm";
    return "score";
  }
  if (msg.kind === "invite") {
    if (!challenge) return "invite"; // loading
    return "invite";
  }
  return null;
}

export default function MessagesScreen({
  theme, accent, isPhone = false,
  dms, authUser,
  matchHistory, challenges,
  everyonePlayers, viewerFriends,
}) {
  const [activeConvoId, setActiveConvoId] = React.useState(null);
  // Bug C — compose-new flow toggled by the pencil button. Renders an
  // overlay screen on top of the inbox while true.
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
  //
  // Bug A breadcrumb: log every branch so a stuck-on-empty thread
  // surfaces in DevTools when the user flips `window.__cs_debug = true`.
  React.useEffect(function () {
    if (!dms) { dbg("no-dms"); return; }
    if (activeConvoId) {
      var raw = (dms.conversations || []).find(function (c) { return c.id === activeConvoId; });
      dbg("activeConvoId=", activeConvoId, "rawFound=", !!raw, "currentActive=", dms.activeConv && dms.activeConv.id);
      if (raw && (!dms.activeConv || dms.activeConv.id !== activeConvoId)) {
        dbg("calling openConversation");
        var p = dms.openConversation(raw);
        if (p && typeof p.then === "function") {
          p.then(function () { dbg("openConversation resolved, threadMessages.length =", dms.threadMessages && dms.threadMessages.length); });
        }
      }
    } else if (dms.activeConv) {
      dbg("closing conversation");
      dms.closeConversation();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeConvoId, dms && dms.conversations]);

  // Bug C — when the user picks someone in the New Message overlay,
  // open (or draft) the conversation via the V1 hook and route to the
  // thread screen. openConversationWith returns once activeConv is set;
  // we sync our local activeConvoId to match.
  const onPickNewRecipient = React.useCallback(function (partner) {
    if (!dms || !partner || !partner.id) return;
    setComposing(false);
    dbg("compose-new pick", partner.id);
    Promise.resolve(dms.openConversationWith(partner, {})).then(function () {
      // After openConversationWith, dms.activeConv is the draft or an
      // existing conv. Pull its id and route to the thread.
      var cur = dms.activeConv;
      if (cur && cur.id) {
        setActiveConvoId(cur.id);
      } else {
        // Defensive — the draft may not yet be in conversations; if
        // openConversationWith failed, stay on inbox.
        dbg("compose-new: no activeConv after openConversationWith");
      }
    });
  }, [dms]);

  if (composing) {
    return (
      <NewMessageScreen
        theme={theme} accent={accent} isPhone={isPhone}
        viewerFriends={viewerFriends || []}
        everyonePlayers={everyonePlayers || []}
        onPick={onPickNewRecipient}
        onClose={function () { setComposing(false); }}
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
        matchHistory={matchHistory} challenges={challenges}
        onBack={function () { setActiveConvoId(null); }}
      />
    );
  }
  return (
    <Inbox
      theme={theme} accent={accent} isPhone={isPhone}
      conversations={conversations}
      loaded={!!(dms && dms.conversationsLoaded)}
      viewerFriends={viewerFriends || []}
      everyonePlayers={everyonePlayers || []}
      onOpen={function (id) { setActiveConvoId(id); }}
      onCompose={function () { setComposing(true); }}
      onPickNewRecipient={onPickNewRecipient}
    />
  );
}

function Inbox({ theme, accent, isPhone, conversations, loaded, viewerFriends, everyonePlayers, onOpen, onCompose, onPickNewRecipient }) {
  const [q, setQ] = React.useState("");
  const [tab, setTab] = React.useState("inbox");
  const filt = conversations.filter((c) => {
    if (tab === "groups" && c.type !== "group") return false;
    if (!q) return true;
    return (c.name + " " + (c.lastPreview || "")).toLowerCase().includes(q.toLowerCase());
  });

  // Bug B — when the user types and there are no matching convs (or
  // alongside matches if they want to start a fresh thread), surface
  // friends + everyone matching the query. Friends section first.
  const trimmedQ = q.trim().toLowerCase();
  const showNewPicker = trimmedQ.length >= 2;
  const friendMatches = showNewPicker
    ? viewerFriends.filter(function (f) {
        return (f.name || "").toLowerCase().includes(trimmedQ);
      }).slice(0, 8)
    : [];
  const everyoneMatches = showNewPicker
    ? everyonePlayers.filter(function (p) {
        return (p.name || "").toLowerCase().includes(trimmedQ)
          && !friendMatches.some(function (f) { return f.id === p.id; });
      }).slice(0, 12)
    : [];

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
        {filt.length === 0 && !showNewPicker && (
          <div style={{ textAlign: "center", color: theme.inkFaint, padding: "40px 20px", fontSize: 13 }}>
            {loaded
              ? (q || tab === "groups"
                  ? "No conversations match."
                  : "No conversations yet.")
              : "Loading…"}
          </div>
        )}

        {/* Bug B — start-a-new-message sections under the existing
            conversation matches. Friends first, then Everyone. */}
        {showNewPicker && (friendMatches.length > 0 || everyoneMatches.length > 0) && (
          <div style={{ marginTop: filt.length ? 12 : 0 }}>
            <div className="t-cap" style={{ color: theme.inkSoft, fontSize: 10, padding: "12px 14px 6px", letterSpacing: "0.12em", textTransform: "uppercase" }}>
              Start a new message
            </div>
            {friendMatches.length > 0 && (
              <div>
                <div style={{ fontSize: 10, color: theme.inkFaint, padding: "0 14px 4px", fontFamily: "Inter", fontWeight: 600 }}>Friends</div>
                {friendMatches.map(function (f) {
                  return <PlayerPickerRow key={"f-"+f.id} player={f} theme={theme} accent={accent} onPick={onPickNewRecipient} />;
                })}
              </div>
            )}
            {everyoneMatches.length > 0 && (
              <div style={{ marginTop: friendMatches.length ? 8 : 0 }}>
                <div style={{ fontSize: 10, color: theme.inkFaint, padding: "0 14px 4px", fontFamily: "Inter", fontWeight: 600 }}>Everyone</div>
                {everyoneMatches.map(function (p) {
                  return <PlayerPickerRow key={"e-"+p.id} player={p} theme={theme} accent={accent} onPick={onPickNewRecipient} />;
                })}
              </div>
            )}
          </div>
        )}

        {showNewPicker && filt.length === 0 && friendMatches.length === 0 && everyoneMatches.length === 0 && (
          <div style={{ textAlign: "center", color: theme.inkFaint, padding: "40px 20px", fontSize: 13 }}>
            No players match "{q}".
          </div>
        )}
      </div>
    </div>
  );
}

// PR2/3 — picker row used in both inbox search (Bug B) and the New
// Message overlay (Bug C). Mirrors ConvoRow chrome but flat: no unread
// badge, no activeNow dot, no last-message preview. Skill + suburb pill
// where available so the user can tell players apart at a glance.
function PlayerPickerRow({ player, theme, accent, onPick }) {
  if (!player) return null;
  var c = {
    name: player.name || "Player",
    initials: deriveInitials(player.name || "?"),
    color: avColor(player.name || "?"),
    activeNow: false,
  };
  var sub = [player.skill, player.suburb].filter(Boolean).join(" · ");
  return (
    <button onClick={function () { onPick(player); }} className="t-btn" style={{
      width: "100%", appearance: "none", border: 0, background: "transparent",
      padding: "8px 12px", borderRadius: 12, display: "flex", alignItems: "center", gap: 12,
      textAlign: "left", cursor: "pointer", color: theme.ink,
    }}>
      <Avatar size={40} c={c} />
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 1 }}>
        <span style={{ fontFamily: "Inter", fontSize: 14, fontWeight: 600, color: theme.ink, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.name}</span>
        {sub && (
          <span style={{ fontSize: 11.5, color: theme.inkSoft, fontFamily: "Inter", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{sub}</span>
        )}
      </div>
    </button>
  );
}

// Bug C — full-screen New Message overlay reached via the pencil
// button. Same picker rows as Bug B but no convo list, with a back
// chevron at the top instead of "Inbox" headline.
function NewMessageScreen({ theme, accent, isPhone, viewerFriends, everyonePlayers, onPick, onClose }) {
  const [q, setQ] = React.useState("");
  const trimmedQ = q.trim().toLowerCase();
  // Empty query → show all friends + cap of everyone, so the picker
  // isn't a blank slate when the user opens it without typing.
  const showFiltered = trimmedQ.length >= 1;
  const filteredFriends = showFiltered
    ? viewerFriends.filter(function (f) { return (f.name || "").toLowerCase().includes(trimmedQ); })
    : viewerFriends;
  const filteredEveryone = showFiltered
    ? everyonePlayers.filter(function (p) {
        return (p.name || "").toLowerCase().includes(trimmedQ)
          && !filteredFriends.some(function (f) { return f.id === p.id; });
      }).slice(0, 50)
    : everyonePlayers.slice(0, 20);

  return (
    <div style={{ height: "100%", background: theme.bg, color: theme.ink, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <div style={{ padding: isPhone ? "52px 12px 10px" : "14px 18px", display: "flex", alignItems: "center", gap: 10, borderBottom: `0.5px solid ${theme.line}`, flexShrink: 0 }}>
        <button onClick={onClose} className="t-btn" aria-label="Close" style={{
          width: 32, height: 32, appearance: "none", border: 0, background: "transparent",
          color: theme.ink, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer",
        }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="t-serif" style={{ fontFamily: "inherit", fontWeight: 700, fontSize: 18, color: theme.ink, letterSpacing: "-0.01em" }}>New message</div>
          <div style={{ fontFamily: "Inter", fontSize: 11, color: theme.inkSoft }}>Pick someone to start a conversation</div>
        </div>
      </div>

      <div style={{ padding: "12px 14px 6px", flexShrink: 0 }}>
        <div style={{ background: theme.chip, borderRadius: 999, display: "flex", alignItems: "center", gap: 8, padding: "9px 14px" }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={theme.inkSoft} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
          <input autoFocus value={q} onChange={function (e) { setQ(e.target.value); }} placeholder="Search by name…" style={{
            flex: 1, appearance: "none", border: 0, background: "transparent", outline: "none",
            fontFamily: "Inter", fontSize: 13, color: theme.ink,
          }} />
        </div>
      </div>

      <div className="t-noscroll" style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "4px 6px 100px" }}>
        {filteredFriends.length > 0 && (
          <div>
            <div style={{ fontSize: 10, color: theme.inkFaint, padding: "8px 14px 4px", fontFamily: "Inter", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase" }}>Friends</div>
            {filteredFriends.map(function (f) {
              return <PlayerPickerRow key={"nf-"+f.id} player={f} theme={theme} accent={accent} onPick={onPick} />;
            })}
          </div>
        )}
        {filteredEveryone.length > 0 && (
          <div style={{ marginTop: filteredFriends.length ? 8 : 0 }}>
            <div style={{ fontSize: 10, color: theme.inkFaint, padding: "8px 14px 4px", fontFamily: "Inter", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase" }}>Everyone</div>
            {filteredEveryone.map(function (p) {
              return <PlayerPickerRow key={"ne-"+p.id} player={p} theme={theme} accent={accent} onPick={onPick} />;
            })}
          </div>
        )}
        {filteredFriends.length === 0 && filteredEveryone.length === 0 && (
          <div style={{ textAlign: "center", color: theme.inkFaint, padding: "40px 20px", fontSize: 13 }}>
            {showFiltered ? ("No players match \"" + q + "\".") : "No players to message yet."}
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

function ThreadScreen({ theme, accent, convoId, conversations, dms, meId, matchHistory, challenges, onBack, isPhone }) {
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
  const [busy, setBusy] = React.useState({});
  const scrollRef = React.useRef(null);

  // Map V1 thread rows to V2 bubbles. The hook owns realtime; we just
  // project. If dms is null (defensive) we render an empty thread.
  const msgs = React.useMemo(function () {
    if (!dms || !Array.isArray(dms.threadMessages)) {
      dbg("ThreadScreen msgs memo: no threadMessages");
      return EMPTY_MSGS;
    }
    var mapped = dms.threadMessages
      .map(function (row) { return msgToV2(row, rawConv, meId); })
      .filter(Boolean);
    dbg("ThreadScreen msgs memo:", mapped.length, "rows");
    return mapped;
  }, [dms && dms.threadMessages, rawConv, meId]);

  // PR2 widget data sources — fetch the matches referenced by
  // kind='score' DMs (those rows may be the opponent's submissions
  // which useV2History doesn't load). useMatchHistory.history + the
  // viewer's own match-by-id cache cover the rest.
  const { matchById, refreshMatch } = useMatchByIds(msgs);
  // useMatchHistory's history list is keyed off the viewer's own
  // submissions + tagged-opponent matches. Build a quick id → row map
  // so the widget can prefer this row (it has up-to-date status the
  // hook may have just patched, vs the freshly-fetched copy).
  const localMatchById = React.useMemo(function () {
    var m = {};
    if (matchHistory && Array.isArray(matchHistory.history)) {
      matchHistory.history.forEach(function (row) { if (row && row.id) m[row.id] = row; });
    }
    return m;
  }, [matchHistory && matchHistory.history]);

  function lookupMatch(matchId) {
    if (!matchId) return null;
    return localMatchById[matchId] || matchById[matchId] || null;
  }
  function lookupChallenge(challengeId) {
    if (!challengeId || !challenges || !Array.isArray(challenges.challenges)) return null;
    return challenges.challenges.find(function (c) { return c.id === challengeId; }) || null;
  }

  React.useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [msgs.length]);

  const sending = !!(dms && dms.sending);
  const send = (text) => {
    if (!text || !text.trim()) return;
    if (!dms || !dms.sendMessage) return;
    setDraft("");
    var p = dms.sendMessage(text);
    if (p && typeof p.then === "function") {
      p.then(function () {
        if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      }).catch(function () { /* hook already restored state */ });
    }
  };

  // PR3 — widget action handlers. Each disables its buttons via the
  // shared `busy` map while the async call is in flight, then triggers
  // a refreshMatch so the widget swaps Confirm → Score on success.
  function onConfirmMatch(match) {
    if (!match || !matchHistory || !matchHistory.confirmOpponentMatch) return;
    var key = "m:" + match.id;
    setBusy(function (b) { return Object.assign({}, b, { [key]: true }); });
    matchHistory.confirmOpponentMatch(match).then(function (res) {
      if (!res || !res.error) refreshMatch(match.id);
      setBusy(function (b) { return Object.assign({}, b, { [key]: false }); });
    }).catch(function () {
      setBusy(function (b) { return Object.assign({}, b, { [key]: false }); });
    });
  }
  function onDisputeMatch(match) {
    if (!match || !matchHistory || !matchHistory.setDisputeModal) return;
    // Opens v1's dispute modal flow via the shared hook. v2 doesn't
    // render the modal itself — the surrounding app does — so the
    // widget just primes the state. If the app isn't wired to show
    // the modal in v2 yet, this still gets the user out of the
    // confirm path; they can finish disputing in v1.
    matchHistory.setDisputeModal({ open: true, match: match });
  }
  function onAcceptChallenge(challenge) {
    if (!challenge || !challenges || !challenges.acceptChallenge) return;
    var key = "c:" + challenge.id;
    setBusy(function (b) { return Object.assign({}, b, { [key]: true }); });
    challenges.acceptChallenge(challenge).then(function () {
      setBusy(function (b) { return Object.assign({}, b, { [key]: false }); });
    }).catch(function () {
      setBusy(function (b) { return Object.assign({}, b, { [key]: false }); });
    });
  }
  function onDeclineChallenge(challenge) {
    if (!challenge || !challenges || !challenges.declineChallenge) return;
    var key = "c:" + challenge.id;
    setBusy(function (b) { return Object.assign({}, b, { [key]: true }); });
    challenges.declineChallenge(challenge).then(function () {
      setBusy(function (b) { return Object.assign({}, b, { [key]: false }); });
    }).catch(function () {
      setBusy(function (b) { return Object.assign({}, b, { [key]: false }); });
    });
  }

  // Suggestion pills — keep the visual placeholder per PR1 spec.
  const suggestions = c.type === "group"
    ? ["Got it", "I'm in", "See you there"]
    : ["Sounds good", "On my way", "Thanks"];

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
          return (
            <Bubble
              key={m.id || i} m={m} c={c} theme={theme} accent={accent} last={last}
              meId={meId}
              lookupMatch={lookupMatch}
              lookupChallenge={lookupChallenge}
              busy={busy}
              onConfirmMatch={onConfirmMatch}
              onDisputeMatch={onDisputeMatch}
              onAcceptChallenge={onAcceptChallenge}
              onDeclineChallenge={onDeclineChallenge}
            />
          );
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

function Bubble({ m, c, theme, accent, last, meId, lookupMatch, lookupChallenge, busy, onConfirmMatch, onDisputeMatch, onAcceptChallenge, onDeclineChallenge }) {
  // PR2/PR3: branch on kind/payload. The kind column tells us the
  // message was emitted by the auto-emit path; the renderer then
  // decides which widget to display based on the viewer's role and
  // the referenced entity's status. Plain-text rows (kind === null)
  // fall through to the text bubble path exactly as before.
  if (m.kind === "score" && m.payload && m.payload.matchId) {
    var match = lookupMatch(m.payload.matchId);
    // Hydrate to the cards' set/sets shape using the viewer's frame.
    var scoreShape = match ? matchToCardShape(match, meId) : null;
    var w = widgetKindForView(m, match, null, meId);
    if (w === "confirm") {
      var busyKey = "m:" + (match && match.id);
      return (
        <ConfirmCardBubble
          m={Object.assign({}, m, { confirm: scoreShape })}
          theme={theme} accent={accent} c={c} last={last}
          busy={!!(busy && busy[busyKey])}
          onConfirm={function () { onConfirmMatch(match); }}
          onDispute={function () { onDisputeMatch(match); }}
        />
      );
    }
    // 'score' (display-only). Includes the case where match hasn't
    // resolved yet — render a thin skeleton with the fallback text so
    // the user sees something while the match-by-id fetch lands.
    return (
      <ScoreCardBubble
        m={Object.assign({}, m, { score: scoreShape || pendingScoreShape(m.text) })}
        theme={theme} accent={accent} c={c} last={last}
        statusLabel={match ? statusLabelFor(match.status) : null}
      />
    );
  }

  if (m.kind === "invite" && m.payload && m.payload.challengeId) {
    var challenge = lookupChallenge(m.payload.challengeId);
    var inviteShape = challenge ? challengeToCardShape(challenge, /* profileMap */ null) : pendingInviteShape();
    // Decide actionable vs display-only.
    var actionable = !!(challenge && challenge.status === "pending" && challenge.challenged_id === meId);
    var busyKeyC = challenge ? ("c:" + challenge.id) : null;
    return (
      <InviteCardBubble
        m={Object.assign({}, m, { invite: inviteShape })}
        theme={theme} accent={accent} c={c} last={last}
        actionable={actionable}
        statusLabel={challenge ? challengeStatusLabel(challenge.status) : null}
        busy={!!(busy && busyKeyC && busy[busyKeyC])}
        onAccept={function () { onAcceptChallenge(challenge); }}
        onDecline={function () { onDeclineChallenge(challenge); }}
      />
    );
  }

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

// Placeholder shapes used while a widget waits for its hydration data
// to land. Keeps the card chrome from collapsing on first render.
function pendingScoreShape(fallbackText) {
  return {
    surface: "Hard", duration: "",
    p1: "You", p2: "Player",
    sets: [],
  };
}
function pendingInviteShape() {
  return { round: "Match invite", date: "Time TBD", court: "Court TBD", vs: "Player" };
}
function statusLabelFor(status) {
  if (status === "confirmed")  return "Confirmed";
  if (status === "voided")     return "Voided";
  if (status === "disputed")   return "Disputed";
  if (status === "pending_confirmation") return "Awaiting confirmation";
  return null;
}
function challengeStatusLabel(status) {
  if (status === "accepted") return "Accepted";
  if (status === "declined") return "Declined";
  if (status === "completed") return "Completed";
  if (status === "expired")  return "Expired";
  return null;
}

function ScoreCardBubble({ m, theme, accent, c, last, statusLabel }) {
  const s = m.score;
  const sets = s && Array.isArray(s.sets) ? s.sets : [];
  const winner = sumSets(sets, 0) > sumSets(sets, 1) ? 0 : 1;
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 6, marginTop: last ? 4 : 1 }}>
      <div style={{ width: 24, flexShrink: 0 }}>
        {last && <div style={{ width: 24, height: 24, borderRadius: "50%", background: c.color, color: "#fbf6e9", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "Inter", fontWeight: 600, fontSize: 10 }}>{m.avatar || c.initials[0]}</div>}
      </div>
      <div style={{ maxWidth: "82%" }}>
        <div style={{ background: "#0f1410", color: "#e8e6df", borderRadius: 14, overflow: "hidden", minWidth: 240, border: `1px solid ${theme.line}` }}>
          <div style={{ padding: "8px 14px", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "0.5px solid rgba(255,255,255,0.08)" }}>
            <span className="t-cap" style={{ color: "rgba(232,230,223,0.6)", fontSize: 9.5 }}>FINAL · {s ? s.surface : "Hard"}</span>
            <span style={{ fontSize: 10, color: "rgba(232,230,223,0.5)", fontFamily: "Inter" }}>{statusLabel || (s ? s.duration : "")}</span>
          </div>
          <div style={{ padding: "12px 14px", display: "flex", flexDirection: "column", gap: 6 }}>
            <ScoreLine name={s ? s.p1 : "You"} sets={sets} side={0} winner={winner === 0} accent={accent} />
            <ScoreLine name={s ? s.p2 : "Player"} sets={sets} side={1} winner={winner === 1} accent={accent} />
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

function InviteCardBubble({ m, theme, accent, c, last, actionable, statusLabel, busy, onAccept, onDecline }) {
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
          {actionable ? (
            <div style={{ display: "flex", gap: 6 }}>
              <button onClick={onAccept} disabled={busy} className="t-btn" style={{ flex: 1, appearance: "none", border: 0, background: theme.ink, color: theme.bg, borderRadius: 8, padding: "8px 10px", cursor: busy ? "default" : "pointer", opacity: busy ? 0.6 : 1, fontFamily: "Inter", fontSize: 12, fontWeight: 600 }}>{busy ? "…" : "Accept"}</button>
              <button onClick={onDecline} disabled={busy} className="t-btn" style={{ flex: 1, appearance: "none", border: `1px solid ${theme.line}`, background: "transparent", color: theme.ink, borderRadius: 8, padding: "7px 10px", cursor: busy ? "default" : "pointer", opacity: busy ? 0.6 : 1, fontFamily: "Inter", fontSize: 12, fontWeight: 600 }}>{busy ? "…" : "Decline"}</button>
            </div>
          ) : (
            statusLabel && (
              <div style={{ display: "inline-block", padding: "4px 10px", borderRadius: 999, background: theme.chip, color: theme.inkSoft, fontFamily: "Inter", fontSize: 11, fontWeight: 600 }}>
                {statusLabel}
              </div>
            )
          )}
        </div>
      </div>
    </div>
  );
}

function ConfirmCardBubble({ m, theme, accent, c, last, busy, onConfirm, onDispute }) {
  const cf = m.confirm;
  const sets = cf && Array.isArray(cf.sets) ? cf.sets : [];
  const youWon = sumSets(sets, 0) > sumSets(sets, 1);
  const setStr = sets.map((s) => `${s[0]}-${s[1]}`).join(", ");
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 6, marginTop: last ? 4 : 1 }}>
      <div style={{ width: 24, flexShrink: 0 }}>
        {last && <div style={{ width: 24, height: 24, borderRadius: "50%", background: c.color, color: "#fbf6e9", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "Inter", fontWeight: 600, fontSize: 10 }}>{m.avatar || c.initials[0]}</div>}
      </div>
      <div style={{ maxWidth: "82%" }}>
        <div style={{ background: theme.bg, border: `1px solid ${theme.line}`, borderRadius: 14, padding: "12px 14px", minWidth: 240 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={accent} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
            <span className="t-cap" style={{ color: theme.inkSoft, fontSize: 9.5 }}>CONFIRM SCORE · {cf ? cf.league : "Casual"}</span>
          </div>
          <div style={{ fontFamily: "Inter", fontSize: 13, color: theme.ink, marginBottom: 2 }}>
            <span style={{ fontWeight: youWon ? 700 : 500 }}>{cf ? cf.p1 : "You"}</span>
            <span style={{ color: theme.inkFaint, margin: "0 6px" }}>vs</span>
            <span style={{ fontWeight: !youWon ? 700 : 500 }}>{cf ? cf.p2 : "Player"}</span>
          </div>
          <div className="t-num" style={{ fontFamily: "JetBrains Mono", fontSize: 18, fontWeight: 600, color: theme.ink, letterSpacing: "-0.01em", marginBottom: 12 }}>{setStr || "—"}</div>
          <div style={{ display: "flex", gap: 6 }}>
            <button onClick={onConfirm} disabled={busy} className="t-btn" style={{ flex: 1, appearance: "none", border: 0, background: accent, color: "#0f1410", borderRadius: 8, padding: "8px 10px", cursor: busy ? "default" : "pointer", opacity: busy ? 0.6 : 1, fontFamily: "Inter", fontSize: 12, fontWeight: 700 }}>{busy ? "…" : "Confirm"}</button>
            <button onClick={onDispute} disabled={busy} className="t-btn" style={{ flex: 1, appearance: "none", border: `1px solid ${theme.line}`, background: "transparent", color: theme.ink, borderRadius: 8, padding: "7px 10px", cursor: busy ? "default" : "pointer", opacity: busy ? 0.6 : 1, fontFamily: "Inter", fontSize: 12, fontWeight: 600 }}>{busy ? "…" : "Dispute"}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
