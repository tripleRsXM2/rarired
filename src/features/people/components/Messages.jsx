// src/features/people/components/Messages.jsx
//
// DM surface — conversation list + thread view + input + context menu +
// delete-conv modal + emoji picker. Split across the same file for now,
// extracted helpers live in ../utils/messaging.js and the emoji set lives
// in ../utils/emojiData.js.

import { useRef, useEffect, useMemo, useState } from "react";
import { inputStyle } from "../../../lib/theme.js";
import { PresenceDot } from "./PresenceIndicator.jsx";
import { getPresence } from "../services/presenceService.js";
import PlayerAvatar from "../../../components/ui/PlayerAvatar.jsx";
import EmojiPicker from "./EmojiPicker.jsx";
import {
  formatMessageTime,
  previewify,
  computeUnreadDividerIdx,
  computeLastSeenByPartnerIdx,
  groupReactions,
  readHiddenMsgs,
  writeHiddenMsgs,
  filterHiddenMessages,
  computeContextMenuPos,
  validateDraft,
} from "../utils/messaging.js";

// Quick reactions shown first in the action menu. "+" opens the full picker.
var QUICK_REACTIONS = ["👍", "❤️", "😂", "😢", "🔥", "🎾"];
var EDIT_WINDOW_MS = 15 * 60 * 1000; // 15 min

// ── Inline SVG icons for the action menu. Match the rest of the app's
// nav-icon style (18px, 1.5 stroke, rounded caps). currentColor means the
// menu-item's text color drives the glyph. ────────────────────────────────

function IconReply(p)  { return (<svg width="16" height="16" viewBox="0 0 18 18" fill="none" aria-hidden="true" {...p}><path d="M7 5L3 9l4 4M3 9h7a4 4 0 0 1 4 4v1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>); }
function IconCopy(p)   { return (<svg width="16" height="16" viewBox="0 0 18 18" fill="none" aria-hidden="true" {...p}><rect x="5" y="5" width="10" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.5"/><path d="M3 13V3.5A1.5 1.5 0 0 1 4.5 2H12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>); }
function IconEdit(p)   { return (<svg width="16" height="16" viewBox="0 0 18 18" fill="none" aria-hidden="true" {...p}><path d="M12.5 2.5l3 3L6 15H3v-3l9.5-9.5z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/><path d="M11 4l3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>); }
function IconTrash(p)  { return (<svg width="16" height="16" viewBox="0 0 18 18" fill="none" aria-hidden="true" {...p}><path d="M3.5 5h11M7 5V3.5A1 1 0 0 1 8 2.5h2a1 1 0 0 1 1 1V5M5 5l.7 9.2a1 1 0 0 0 1 .8h4.6a1 1 0 0 0 1-.8L13 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/><path d="M7.5 8v4M10.5 8v4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>); }
function IconUnsend(p) { return (<svg width="16" height="16" viewBox="0 0 18 18" fill="none" aria-hidden="true" {...p}><circle cx="9" cy="9" r="6.5" stroke="currentColor" strokeWidth="1.5"/><path d="M5 13L13 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>); }

export default function Messages({ t, authUser, dms, openProfile }) {
  var [menuState, setMenuState] = useState(null);          // { message, rect }
  var [showSettings, setShowSettings] = useState(false);
  var [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  var [showInputEmoji, setShowInputEmoji] = useState(false);
  var [showReactionEmoji, setShowReactionEmoji] = useState(null); // anchor rect or null

  var touchTimer = useRef(null);
  var inputRef = useRef(null);
  var editInputRef = useRef(null);
  var messagesEndRef = useRef(null);
  var emojiBtnRef = useRef(null);
  var myId = authUser && authUser.id;

  // Hidden-for-me storage. Re-hydrated when the user changes (logout/login).
  var [hiddenIds, setHiddenIds] = useState(function () { return readHiddenMsgs(myId); });
  useEffect(function () { setHiddenIds(readHiddenMsgs(myId)); }, [myId]);

  function hideForMe(msgId) {
    setHiddenIds(function (prev) {
      var next = Object.assign({}, prev, { [msgId]: true });
      writeHiddenMsgs(myId, next);
      return next;
    });
    closeMenu();
  }

  // Auto-scroll thread to bottom when new messages arrive OR when the
  // mobile keyboard opens/closes (visualViewport height changes).
  useEffect(function () {
    if (dms.activeConv && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [dms.threadMessages.length, dms.activeConv && dms.activeConv.id]);

  useEffect(function () {
    if (!dms.activeConv || typeof window === "undefined") return;
    var vv = window.visualViewport;
    if (!vv) return;
    function onResize() {
      if (messagesEndRef.current) messagesEndRef.current.scrollIntoView({ behavior: "auto" });
    }
    vv.addEventListener("resize", onResize);
    return function () { vv.removeEventListener("resize", onResize); };
  }, [dms.activeConv && dms.activeConv.id]);

  useEffect(function () {
    if (dms.editingId && editInputRef.current) editInputRef.current.focus();
  }, [dms.editingId]);

  // Auto-grow the main message textarea up to 5 lines.
  function autoGrow(el) {
    if (!el) return;
    el.style.height = "auto";
    var max = 5 * 22 + 20; // ~5 lines at 14px/1.4 + padding
    el.style.height = Math.min(el.scrollHeight, max) + "px";
  }
  useEffect(function () { autoGrow(inputRef.current); }, [dms.msgDraft, dms.activeConv && dms.activeConv.id]);

  // IMPORTANT — every hook must be called before the conditional `return`
  // below. `visibleMessages` was a useMemo placed after the early-return
  // in the list view, which crashed the thread view the moment activeConv
  // went from null to a row (hook count changed). Hoisted here.
  var visibleMessages = useMemo(function () {
    return filterHiddenMessages(dms.threadMessages, hiddenIds);
  }, [dms.threadMessages, hiddenIds]);

  // ── Long-press / right-click context menu ────────────────────────────────

  // Ref-based flag used to suppress the synthesized `click` that fires
  // after a touchend on iOS/Android — otherwise a tap would trigger BOTH
  // the long-press menu AND the follow-up click-to-menu on the same bubble.
  var suppressClickRef = useRef(false);

  function handleTouchStart(e, msg) {
    var el = e.currentTarget;
    suppressClickRef.current = true;
    touchTimer.current = setTimeout(function () {
      setMenuState({ message: msg, rect: el.getBoundingClientRect() });
      if (navigator && navigator.vibrate) { try { navigator.vibrate(12); } catch (e) {} }
    }, 450);
  }
  function handleTouchEnd() {
    clearTimeout(touchTimer.current);
    // Release the click-suppression after the synthesized click has fired.
    setTimeout(function () { suppressClickRef.current = false; }, 350);
  }
  function handleContextMenu(e, msg) {
    e.preventDefault();
    setMenuState({ message: msg, rect: e.currentTarget.getBoundingClientRect() });
  }
  function handleBubbleClick(e, msg) {
    // On touch devices, skip — the long-press already handled interaction.
    if (suppressClickRef.current) return;
    // Desktop left-click opens the same action menu that right-click does.
    setMenuState({ message: msg, rect: e.currentTarget.getBoundingClientRect() });
  }
  function closeMenu() { setMenuState(null); }

  // ── Input actions ────────────────────────────────────────────────────────

  function trySend() {
    var v = validateDraft(dms.msgDraft);
    if (!v.ok) {
      if (v.reason === "too_long") dms.setMsgDraft(v.value);
      return;
    }
    dms.sendMessage(v.value);
  }

  function insertEmojiAtCursor(emoji) {
    var el = inputRef.current;
    if (!el) { dms.setMsgDraft((dms.msgDraft || "") + emoji); return; }
    var start = el.selectionStart != null ? el.selectionStart : (dms.msgDraft || "").length;
    var end = el.selectionEnd != null ? el.selectionEnd : start;
    var cur = dms.msgDraft || "";
    var next = cur.slice(0, start) + emoji + cur.slice(end);
    dms.setMsgDraft(next);
    // Restore focus + caret position after React re-renders.
    requestAnimationFrame(function () {
      if (!inputRef.current) return;
      inputRef.current.focus();
      var pos = start + emoji.length;
      try { inputRef.current.setSelectionRange(pos, pos); } catch (e) {}
      autoGrow(inputRef.current);
    });
  }

  // ── Conversation list (no active conv) ───────────────────────────────────

  if (!dms.activeConv) {
    var allEmpty = dms.conversations.length === 0 && dms.requests.length === 0;
    return (
      <div>
        {dms.requests.length > 0 && (
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: t.textTertiary, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 10 }}>
              Message Requests · {dms.requests.length}
            </div>
            {dms.requests.map(function (conv) {
              return (
                <div key={conv.id} style={{ background: t.accentSubtle, border: "1px solid " + t.accent, borderRadius: 14, padding: "14px", marginBottom: 10 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                    <PlayerAvatar name={conv.partner.name} avatar={conv.partner.avatar} avatarUrl={conv.partner.avatar_url} size={42} />
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: t.text }}>{conv.partner.name}</div>
                      <div style={{ fontSize: 12, color: t.textSecondary }}>wants to message you</div>
                    </div>
                  </div>
                  {conv.last_message_preview && (
                    <div style={{ fontSize: 13, color: t.textSecondary, background: t.bg, padding: "10px 12px", borderRadius: 8, marginBottom: 10, fontStyle: "italic", lineHeight: 1.4 }}>
                      "{conv.last_message_preview}"
                    </div>
                  )}
                  <div style={{ display: "flex", gap: 8 }}>
                    <button onClick={function () { dms.acceptRequest(conv.id); dms.openConversation(conv); }}
                      style={{ flex: 1, padding: "10px", borderRadius: 9, border: "none", background: t.accent, color: t.accentText, fontSize: 13, fontWeight: 700 }}>
                      Accept
                    </button>
                    <button onClick={function () { dms.declineRequest(conv.id); }}
                      style={{ flex: 1, padding: "10px", borderRadius: 9, border: "1px solid " + t.border, background: "transparent", color: t.textSecondary, fontSize: 13, fontWeight: 500 }}>
                      Decline
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {allEmpty ? (
          <div style={{ textAlign: "center", padding: "48px 20px" }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>💬</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: t.text, marginBottom: 6 }}>No messages yet</div>
            <div style={{ fontSize: 13, color: t.textSecondary }}>Go to Friends and tap Message to start a conversation.</div>
          </div>
        ) : (
          <div>
            {dms.conversations.length > 0 && (
              <div style={{ fontSize: 10, fontWeight: 700, color: t.textTertiary, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 10 }}>Recent</div>
            )}
            {dms.conversations.map(function (conv) {
              var hasUnread = conv.hasUnread;
              var isPending = conv.status === "pending";
              var isMe = conv.last_message_sender_id === myId;
              return (
                <button key={conv.id} onClick={function () { dms.openConversation(conv); }}
                  style={{ width: "100%", background: hasUnread ? t.accentSubtle : t.bgCard, border: "1px solid " + (hasUnread ? t.accent : t.border), borderRadius: 12, padding: "12px 14px", marginBottom: 8, display: "flex", gap: 12, alignItems: "center", cursor: "pointer", textAlign: "left" }}>
                  <div style={{ position: "relative", flexShrink: 0 }}>
                    <PlayerAvatar name={conv.partner.name} avatar={conv.partner.avatar} avatarUrl={conv.partner.avatar_url} size={44} />
                    <PresenceDot profile={conv.partner} t={t} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 2 }}>
                      <span style={{ fontSize: 14, fontWeight: hasUnread ? 700 : 600, color: t.text }}>{conv.partner.name}</span>
                      <span style={{ fontSize: 10, color: t.textTertiary, flexShrink: 0 }}>{formatMessageTime(conv.last_message_at)}</span>
                    </div>
                    <div style={{ fontSize: 12, color: hasUnread ? t.text : t.textSecondary, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: hasUnread ? 600 : 400 }}>
                      {isPending
                        ? <span style={{ color: t.orange }}>Request pending…</span>
                        : (isMe ? "You: " : "") + previewify(conv.last_message_preview, 80)}
                    </div>
                  </div>
                  {hasUnread && <div style={{ width: 9, height: 9, borderRadius: "50%", background: t.accent, flexShrink: 0 }} />}
                </button>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // ── Thread view ──────────────────────────────────────────────────────────

  var conv = dms.activeConv;
  var isPending = conv.status === "pending";
  var iAmSender = conv.requester_id === myId;
  var presence = getPresence(conv.partner);

  var unreadStartIdx = computeUnreadDividerIdx(dms.threadMessages, myId, conv.lastReadAt);
  var lastSeenByPartnerIdx = computeLastSeenByPartnerIdx(dms.threadMessages, myId, dms.partnerLastReadAt);

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "60vh" }}>

      {/* Settings bottom-sheet (gear icon) */}
      {showSettings && (
        <div style={{ position: "fixed", inset: 0, zIndex: 300, background: "rgba(0,0,0,0.55)" }}
          onClick={function () { setShowSettings(false); }}>
          <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, background: t.bgCard, borderRadius: "20px 20px 0 0", padding: "20px 20px calc(20px + env(safe-area-inset-bottom))" }}
            onClick={function (e) { e.stopPropagation(); }}>
            <div style={{ width: 32, height: 4, borderRadius: 2, background: t.border, margin: "0 auto 20px" }} />
            <div style={{ fontSize: 16, fontWeight: 700, color: t.text, marginBottom: 4 }}>{conv.partner.name}</div>
            <div style={{ fontSize: 12, color: t.textTertiary, marginBottom: 20 }}>Conversation settings</div>
            <button onClick={function () { setShowSettings(false); setShowDeleteConfirm(true); }}
              style={{ width: "100%", padding: "13px", borderRadius: 10, border: "1px solid " + t.red, background: "transparent", color: t.red, fontSize: 14, fontWeight: 600, marginBottom: 8 }}>
              Delete Conversation
            </button>
            <button onClick={function () { setShowSettings(false); }}
              style={{ width: "100%", padding: "13px", borderRadius: 10, border: "1px solid " + t.border, background: "transparent", color: t.textSecondary, fontSize: 14 }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Centered delete-conversation confirm (was a native window.confirm) */}
      {showDeleteConfirm && (
        <div
          role="dialog" aria-modal="true" aria-label="Delete conversation"
          onClick={function () { setShowDeleteConfirm(false); }}
          style={{
            position: "fixed", inset: 0, zIndex: 400,
            background: "rgba(0,0,0,0.55)",
            display: "flex", alignItems: "center", justifyContent: "center",
            padding: 16,
          }}>
          <div
            className="pop"
            onClick={function (e) { e.stopPropagation(); }}
            style={{
              width: "100%", maxWidth: 340,
              background: t.bgCard, border: "1px solid " + t.border,
              borderRadius: 14, overflow: "hidden",
              boxShadow: "0 20px 60px rgba(0,0,0,0.35)",
            }}>
            <div style={{ padding: "20px 20px 12px" }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: t.text, marginBottom: 6 }}>
                Delete conversation?
              </div>
              <div style={{ fontSize: 13, color: t.textSecondary, lineHeight: 1.5 }}>
                This removes the thread for both of you. Neither of you will see it again.
              </div>
            </div>
            <div style={{ padding: "0 20px 20px", display: "flex", gap: 8 }}>
              <button type="button"
                onClick={function () { setShowDeleteConfirm(false); }}
                style={{
                  flex: 1, padding: "11px", borderRadius: 8,
                  border: "1px solid " + t.border, background: "transparent",
                  color: t.text, fontSize: 13, fontWeight: 600, cursor: "pointer",
                }}>
                Cancel
              </button>
              <button type="button"
                onClick={function () {
                  setShowDeleteConfirm(false);
                  dms.deleteConversation(conv.id);
                }}
                style={{
                  flex: 1, padding: "11px", borderRadius: 8, border: "none",
                  background: t.red, color: "#fff",
                  fontSize: 13, fontWeight: 700, cursor: "pointer",
                }}>
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, paddingBottom: 12, marginBottom: 4, borderBottom: "1px solid " + t.border }}>
        <button onClick={function () { dms.closeConversation(); setMenuState(null); setShowSettings(false); setShowInputEmoji(false); }}
          style={{ background: "transparent", border: "none", color: t.accent, fontSize: 22, lineHeight: 1, padding: "0 6px 0 0", flexShrink: 0, cursor: "pointer" }}
          aria-label="Back">←</button>
        <div
          onClick={openProfile && conv.partner.id ? function () { openProfile(conv.partner.id); } : undefined}
          style={{ position: "relative", flexShrink: 0, cursor: openProfile && conv.partner.id ? "pointer" : "default" }}>
          <PlayerAvatar name={conv.partner.name} avatar={conv.partner.avatar} avatarUrl={conv.partner.avatar_url} size={36} />
          <PresenceDot profile={conv.partner} t={t} size={10} />
        </div>
        <div
          onClick={openProfile && conv.partner.id ? function () { openProfile(conv.partner.id); } : undefined}
          style={{ flex: 1, minWidth: 0, cursor: openProfile && conv.partner.id ? "pointer" : "default" }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: t.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{conv.partner.name}</div>
          {presence.label && <div style={{ fontSize: 11, color: presence.online ? t.green : t.textTertiary }}>{presence.label}</div>}
        </div>
        <button onClick={function () { setShowSettings(true); }}
          aria-label="Conversation settings"
          style={{ background: "transparent", border: "none", color: t.textTertiary, fontSize: 18, padding: "4px", flexShrink: 0, cursor: "pointer" }}>⚙️</button>
      </div>

      {/* Pending banner — sender-side */}
      {isPending && iAmSender && (
        <div style={{ background: t.accentSubtle, border: "1px solid " + t.accent, borderRadius: 10, padding: "10px 14px", marginBottom: 10, fontSize: 13, color: t.accent, textAlign: "center", lineHeight: 1.4 }}>
          Request sent — waiting for {conv.partner.name} to accept
        </div>
      )}

      {/* Messages */}
      <div style={{ flex: 1 }}>
        {dms.threadLoading ? (
          <div style={{ textAlign: "center", padding: "40px 0", color: t.textTertiary, fontSize: 13 }}>Loading…</div>
        ) : visibleMessages.length === 0 ? (
          <div style={{ textAlign: "center", padding: "40px 0" }}>
            <div style={{ fontSize: 28, marginBottom: 8 }}>💬</div>
            <div style={{ fontSize: 13, color: t.textTertiary }}>
              {isPending && !iAmSender ? "Accept to start chatting" : "Say hello!"}
            </div>
          </div>
        ) : (
          visibleMessages.map(function (msg, idx) {
            var mine = msg.sender_id === myId;
            var reactionGroups = groupReactions(dms.reactions[msg.id]);
            var isEditing = dms.editingId === msg.id;
            var showUnread = idx === unreadStartIdx;
            var replyMsg = msg.reply_to_id ? dms.threadMessages.find(function (m) { return m.id === msg.reply_to_id; }) : null;

            return (
              <div key={msg.id}>
                {showUnread && (
                  <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "16px 0 10px" }}>
                    <div style={{ flex: 1, height: 1, background: t.accent, opacity: 0.35 }} />
                    <span style={{ fontSize: 10, fontWeight: 800, color: t.accent, textTransform: "uppercase", letterSpacing: "0.1em", flexShrink: 0 }}>Unread Messages</span>
                    <div style={{ flex: 1, height: 1, background: t.accent, opacity: 0.35 }} />
                  </div>
                )}
                <div style={{ display: "flex", justifyContent: mine ? "flex-end" : "flex-start", marginBottom: 4 }}>
                  <div style={{ maxWidth: "75%" }}>
                    {replyMsg && (
                      <div style={{ background: t.bgTertiary, borderLeft: "3px solid " + t.accent, padding: "5px 10px", borderRadius: "6px 6px 0 0", fontSize: 11, color: t.textSecondary, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {replyMsg.deleted_at ? "Deleted message" : previewify(replyMsg.content, 120)}
                      </div>
                    )}
                    {isEditing ? (
                      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                        <input ref={editInputRef} value={dms.editDraft}
                          onChange={function (e) { dms.setEditDraft(e.target.value); }}
                          onKeyDown={function (e) { if (e.key === "Enter") dms.submitEdit(msg.id); if (e.key === "Escape") dms.cancelEdit(); }}
                          style={Object.assign({}, inputStyle(t), { fontSize: 16, padding: "8px 12px", borderRadius: 10, flex: 1 })} />
                        <button onClick={function () { dms.submitEdit(msg.id); }} style={{ padding: "8px 14px", borderRadius: 10, border: "none", background: t.accent, color: t.accentText, fontSize: 12, fontWeight: 700, flexShrink: 0, cursor: "pointer" }}>Save</button>
                        <button onClick={dms.cancelEdit} style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid " + t.border, background: "transparent", color: t.textSecondary, fontSize: 12, flexShrink: 0, cursor: "pointer" }}>✕</button>
                      </div>
                    ) : (
                      <div
                        onTouchStart={function (e) { handleTouchStart(e, msg); }}
                        onTouchEnd={handleTouchEnd}
                        onTouchMove={handleTouchEnd}
                        onClick={function (e) { handleBubbleClick(e, msg); }}
                        onContextMenu={function (e) { handleContextMenu(e, msg); }}
                        style={{
                          background: mine ? t.accent : t.bgCard,
                          color: mine ? t.accentText : t.text,
                          border: mine ? "none" : "1px solid " + t.border,
                          borderRadius: mine ? (replyMsg ? "0 16px 4px 16px" : "16px 16px 4px 16px") : (replyMsg ? "16px 0 16px 4px" : "16px 16px 16px 4px"),
                          padding: "9px 13px", fontSize: 14, lineHeight: 1.45,
                          wordBreak: "break-word", whiteSpace: "pre-wrap",
                          cursor: "pointer", userSelect: "none", WebkitUserSelect: "none",
                          WebkitTouchCallout: "none",
                          opacity: msg.deleted_at ? 0.5 : 1, fontStyle: msg.deleted_at ? "italic" : undefined,
                        }}>
                        {msg.deleted_at ? "Message deleted" : msg.content}
                        {msg.edited_at && !msg.deleted_at && (
                          <span style={{ fontSize: 9, opacity: 0.55, marginLeft: 6 }}>edited</span>
                        )}
                      </div>
                    )}
                    {Object.keys(reactionGroups).length > 0 && (
                      <div style={{ display: "flex", gap: 4, marginTop: 4, flexWrap: "wrap", justifyContent: mine ? "flex-end" : "flex-start" }}>
                        {Object.entries(reactionGroups).map(function ([emoji, users]) {
                          var iReacted = users.includes(myId);
                          return (
                            <button key={emoji} onClick={function () { dms.toggleReaction(msg.id, emoji); }}
                              style={{ padding: "2px 8px", borderRadius: 20, border: "1px solid " + (iReacted ? t.accent : t.border), background: iReacted ? t.accentSubtle : t.bgCard, fontSize: 12, cursor: "pointer", display: "flex", alignItems: "center", gap: 3 }}>
                              {emoji}<span style={{ fontSize: 10, color: t.textSecondary }}>{users.length}</span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                    <div style={{ fontSize: 10, color: t.textTertiary, marginTop: 3, textAlign: mine ? "right" : "left" }}>
                      {formatMessageTime(msg.created_at)}
                      {mine && idx === lastSeenByPartnerIdx && (
                        <span style={{ marginLeft: 6, color: t.accent, fontWeight: 600 }}>· Seen</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Context menu — positioned via pure helper */}
      {menuState && (() => {
        var pos = computeContextMenuPos(
          menuState.rect,
          window.innerWidth,
          window.innerHeight,
          200, 280
        );
        var isMine = menuState.message.sender_id === myId;
        var canEdit = isMine && !menuState.message.deleted_at &&
          (Date.now() - new Date(menuState.message.created_at)) < EDIT_WINDOW_MS;
        // Delete options are gated to OWN messages only — you can't remove
        // someone else's bubble from their device.
        var items = [
          { label: "Reply", icon: IconReply, show: true,
            action: function () { dms.setReplyTo(menuState.message); closeMenu(); setTimeout(function () { inputRef.current && inputRef.current.focus(); }, 50); } },
          { label: "Copy", icon: IconCopy, show: !menuState.message.deleted_at,
            action: function () { navigator.clipboard && navigator.clipboard.writeText(menuState.message.content); closeMenu(); } },
          { label: "Edit", icon: IconEdit, show: canEdit,
            action: function () { dms.startEdit(menuState.message); closeMenu(); } },
          { label: "Delete for me", icon: IconTrash, show: isMine && !menuState.message.deleted_at,
            action: function () { hideForMe(menuState.message.id); } },
          { label: "Unsend", icon: IconUnsend, show: isMine && !menuState.message.deleted_at, danger: true,
            action: function () { dms.deleteMessage(menuState.message.id); closeMenu(); } },
        ].filter(function (i) { return i.show; });
        return (
          <div style={{ position: "fixed", inset: 0, zIndex: 200 }} onClick={closeMenu}>
            <div style={{
              position: "fixed",
              top: pos.top, left: pos.left,
              background: t.bgCard, border: "1px solid " + t.border, borderRadius: 14,
              boxShadow: "0 8px 40px rgba(0,0,0,0.22)", overflow: "hidden", zIndex: 201, minWidth: 200,
            }} onClick={function (e) { e.stopPropagation(); }}>
              {/* Emoji reaction strip */}
              <div style={{ display: "flex", gap: 2, padding: "10px 12px", borderBottom: "1px solid " + t.border, justifyContent: "space-between", alignItems: "center" }}>
                {QUICK_REACTIONS.map(function (e) {
                  return (
                    <button key={e} onClick={function () { dms.toggleReaction(menuState.message.id, e); closeMenu(); }}
                      style={{ background: "transparent", border: "none", fontSize: 22, cursor: "pointer", padding: "0 2px", lineHeight: 1 }}>{e}</button>
                  );
                })}
                <button
                  onClick={function (e) {
                    // Open the full emoji picker anchored to this button.
                    var r = e.currentTarget.getBoundingClientRect();
                    var msgId = menuState.message.id;
                    closeMenu();
                    setShowReactionEmoji({ rect: r, messageId: msgId });
                  }}
                  aria-label="More reactions"
                  style={{
                    background: t.bgTertiary, border: "none",
                    width: 28, height: 28, borderRadius: "50%",
                    fontSize: 16, color: t.text, cursor: "pointer",
                    lineHeight: 1, padding: 0,
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>+</button>
              </div>
              {items.map(function (item) {
                var Icon = item.icon;
                return (
                  <button key={item.label} onClick={item.action}
                    style={{ display: "flex", alignItems: "center", gap: 12, width: "100%",
                      padding: "11px 14px", border: "none",
                      background: item.danger ? (t.redSubtle || "rgba(220,38,38,0.08)") : "transparent",
                      color: item.danger ? t.red : t.text,
                      fontSize: 14, fontWeight: item.danger ? 600 : 500,
                      textAlign: "left", cursor: "pointer",
                      borderTop: "1px solid " + t.border }}>
                    <span style={{ display: "inline-flex", flexShrink: 0 }}>{Icon ? <Icon/> : null}</span>
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* Reaction emoji picker (triggered by + on the context menu strip) */}
      {showReactionEmoji && (
        <EmojiPicker
          t={t}
          anchor={showReactionEmoji.rect}
          onPick={function (emoji) {
            dms.toggleReaction(showReactionEmoji.messageId, emoji);
            setShowReactionEmoji(null);
          }}
          onClose={function () { setShowReactionEmoji(null); }}
        />
      )}

      {/* Accept banner — recipient side */}
      {isPending && !iAmSender && (
        <div style={{ background: t.bgCard, border: "1px solid " + t.border, borderRadius: 12, padding: "12px", marginTop: 10 }}>
          <div style={{ fontSize: 13, color: t.textSecondary, marginBottom: 10, textAlign: "center" }}>Accept this request to reply</div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={function () { dms.acceptRequest(conv.id); }}
              style={{ flex: 1, padding: "10px", borderRadius: 9, border: "none", background: t.accent, color: t.accentText, fontSize: 13, fontWeight: 700 }}>
              Accept
            </button>
            <button onClick={function () { dms.declineRequest(conv.id); }}
              style={{ flex: 1, padding: "10px", borderRadius: 9, border: "1px solid " + t.border, background: "transparent", color: t.textSecondary, fontSize: 13 }}>
              Decline
            </button>
          </div>
        </div>
      )}

      {/* Reply preview */}
      {dms.replyTo && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", background: t.bgTertiary, borderTop: "2px solid " + t.accent, borderRadius: "8px 8px 0 0", marginTop: 6 }}>
          <div style={{ flex: 1, fontSize: 12, color: t.textSecondary, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            <span style={{ fontWeight: 700, color: t.accent, marginRight: 4 }}>Replying</span>
            {previewify(dms.replyTo.content, 140)}
          </div>
          <button onClick={dms.clearReplyTo} style={{ background: "transparent", border: "none", color: t.textTertiary, fontSize: 18, lineHeight: 1, padding: "0 2px", flexShrink: 0 }}>×</button>
        </div>
      )}

      {/* Input */}
      {(!isPending || iAmSender) && (
        <div style={{ display: "flex", gap: 8, alignItems: "flex-end", marginTop: dms.replyTo ? 0 : 8, paddingBottom: "env(safe-area-inset-bottom)" }}>
          <button
            ref={emojiBtnRef}
            type="button"
            onClick={function () { setShowInputEmoji(function (v) { return !v; }); }}
            aria-label="Insert emoji"
            style={{
              width: 38, height: 42, flexShrink: 0,
              background: "transparent", border: "1px solid " + t.border,
              borderRadius: 12, color: t.text, fontSize: 18, cursor: "pointer",
              padding: 0,
            }}>😊</button>
          <textarea
            ref={inputRef}
            rows={1}
            value={dms.msgDraft}
            placeholder={"Message " + conv.partner.name + "…"}
            onChange={function (e) { dms.setMsgDraft(e.target.value); autoGrow(e.target); }}
            onKeyDown={function (e) {
              // Desktop: Enter sends, Shift+Enter newlines. Mobile enters a newline
              // (the Send button is the action).
              var isMobile = typeof navigator !== "undefined" && /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);
              if (e.key === "Enter" && !e.shiftKey && !isMobile) { e.preventDefault(); trySend(); }
            }}
            style={Object.assign({}, inputStyle(t), {
              flex: 1, resize: "none", fontSize: 16, // 16 prevents iOS auto-zoom
              padding: "10px 14px", borderRadius: 12,
              minHeight: 42, maxHeight: 140, lineHeight: 1.4,
              overflow: "auto",
            })} />
          <button
            disabled={!dms.msgDraft.trim() || dms.sending}
            onClick={trySend}
            aria-label="Send message"
            style={{
              padding: "10px 16px", borderRadius: 12, border: "none",
              background: t.accent, color: t.accentText, fontSize: 13, fontWeight: 700,
              opacity: (!dms.msgDraft.trim() || dms.sending) ? 0.45 : 1,
              flexShrink: 0, height: 42, cursor: (!dms.msgDraft.trim() || dms.sending) ? "not-allowed" : "pointer",
            }}>
            {dms.sending ? "…" : "Send"}
          </button>
        </div>
      )}

      {/* Input emoji picker */}
      {showInputEmoji && emojiBtnRef.current && (
        <EmojiPicker
          t={t}
          anchor={emojiBtnRef.current.getBoundingClientRect()}
          onPick={insertEmojiAtCursor}
          onClose={function () { setShowInputEmoji(false); }}
        />
      )}
    </div>
  );
}
