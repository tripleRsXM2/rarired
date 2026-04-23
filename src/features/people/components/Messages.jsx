// src/features/people/components/Messages.jsx
//
// DM surface — conversation list + thread view + input + context menu +
// delete-conv modal + emoji picker. Split across the same file for now,
// extracted helpers live in ../utils/messaging.js and the emoji set lives
// in ../utils/emojiData.js.

import { useRef, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

// ── Viewport hook ────────────────────────────────────────────────────────
// Tracks viewport width and returns {isDesktop, sidebarW, rightPanelW}.
// Breakpoints mirror the `.cs-sidebar-col` / `.cs-right-col` media queries
// in providers.jsx so the Messages two-pane layout can sit flush against
// both chrome edges without overlapping them.
function useDMViewport() {
  var [w, setW] = useState(function () {
    return typeof window !== "undefined" ? window.innerWidth : 1024;
  });
  useEffect(function () {
    if (typeof window === "undefined") return;
    function onResize() { setW(window.innerWidth); }
    window.addEventListener("resize", onResize);
    return function () { window.removeEventListener("resize", onResize); };
  }, []);
  var isDesktop   = w >= 1024;
  var sidebarW    = !isDesktop ? 0 : (w >= 1200 ? 220 : 64);
  var rightPanelW = w >= 1440 ? 292 : 0;
  return { isDesktop: isDesktop, sidebarW: sidebarW, rightPanelW: rightPanelW, width: w };
}
import { inputStyle } from "../../../lib/theme.js";
import { PresenceDot } from "./PresenceIndicator.jsx";
import { getPresence } from "../services/presenceService.js";
import PlayerAvatar from "../../../components/ui/PlayerAvatar.jsx";
import EmojiPicker from "./EmojiPicker.jsx";
import DetailsDrawer from "./DetailsDrawer.jsx";
import { uploadDMAttachment, IMG_PREFIX, isImageMessageContent, extractImageUrl, MAX_ATTACHMENT_BYTES } from "../services/dmAttachmentUpload.js";
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
  dateSeparatorLabel,
  computeDateSeparatorIds,
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
// Tiny filled pin glyph used on the pinned-row indicator. Rotated 45° so
// it reads "pinned" at 12px.
function IconPin(p) {
  return (
    <svg width="12" height="12" viewBox="0 0 18 18" fill="currentColor" aria-hidden="true" {...p}>
      <path d="M9 1.5a1 1 0 0 0-1 1v4.2L5.4 9.3a1 1 0 0 0-.4.8v1a1 1 0 0 0 1 1h2.5v4a.5.5 0 0 0 1 0v-4H12a1 1 0 0 0 1-1v-1a1 1 0 0 0-.4-.8L10 6.7V2.5a1 1 0 0 0-1-1z"/>
    </svg>
  );
}
// Right-drawer toggle — three small horizontal lines on a panel.
function IconPanelRight(p) {
  return (
    <svg width="16" height="16" viewBox="0 0 18 18" fill="none" aria-hidden="true" {...p}>
      <rect x="2" y="3" width="14" height="12" rx="1.5" stroke="currentColor" strokeWidth="1.5"/>
      <path d="M11 3v12" stroke="currentColor" strokeWidth="1.5"/>
    </svg>
  );
}
function IconPaperclip(p) {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true" {...p}>
      <path d="M13.5 8.5L8 14a3 3 0 1 1-4.2-4.3l6.5-6.5a2 2 0 1 1 2.8 2.9L6.8 12.4a1 1 0 1 1-1.4-1.4l5.8-5.8"
        stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

export default function Messages({ t, authUser, dms, openProfile }) {
  var [menuState, setMenuState] = useState(null);          // { message, rect }
  var [showSettings, setShowSettings] = useState(false);
  var [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  var [showDetails, setShowDetails] = useState(false);
  // Null when closed; a DOMRect when open. Capturing the rect at click
  // time (instead of reading through a ref at render time) avoids the
  // race where a just-mounted ref is still null, which made the picker
  // fail to open in some conversations.
  var [showInputEmoji, setShowInputEmoji] = useState(null);
  var [showReactionEmoji, setShowReactionEmoji] = useState(null); // anchor rect or null

  var touchTimer = useRef(null);
  var inputRef = useRef(null);
  var editInputRef = useRef(null);
  var messagesEndRef = useRef(null);
  var emojiBtnRef = useRef(null);
  var fileInputRef = useRef(null);
  var myId = authUser && authUser.id;
  var [uploading, setUploading] = useState(false);
  var [uploadError, setUploadError] = useState(null);
  var [lightboxUrl, setLightboxUrl] = useState(null);

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

  // Message ids that should render a date-separator row ABOVE them (first
  // message of each calendar day). Kept in sync with visibleMessages so
  // hidden messages don't create orphan separators.
  var dateSeparatorIds = useMemo(function () {
    return computeDateSeparatorIds(visibleMessages);
  }, [visibleMessages]);

  // ── Long-press / right-click context menu ────────────────────────────────

  // Click-suppression for touch devices. iOS/Android fire the sequence
  // touchstart → touchend → synthesized click; we only want the long-press
  // menu to open (if threshold met), not a follow-up click-menu on the
  // same bubble. BUT some Windows touchscreen laptops (Surface et al.)
  // fire a stray touchstart without a matching touchend — so we can't
  // use a boolean flag (it would stick forever). Instead we track START
  // and END timestamps and only suppress when BOTH have fired recently —
  // i.e. a real completed tap, not a phantom touchstart.
  var touchRef = useRef({ start: 0, end: 0 });

  function handleTouchStart(e, msg) {
    var el = e.currentTarget;
    touchRef.current = { start: Date.now(), end: 0 };
    touchTimer.current = setTimeout(function () {
      setMenuState({ message: msg, rect: el.getBoundingClientRect() });
      if (navigator && navigator.vibrate) { try { navigator.vibrate(12); } catch (e) {} }
    }, 450);
  }
  function handleTouchEnd() {
    touchRef.current.end = Date.now();
    clearTimeout(touchTimer.current);
  }
  function handleContextMenu(e, msg) {
    e.preventDefault();
    setMenuState({ message: msg, rect: e.currentTarget.getBoundingClientRect() });
  }
  function handleBubbleClick(e, msg) {
    // Only suppress when a FULL touch interaction (start + end both seen)
    // happened within the last 800ms. That's the iOS/Android synthesized
    // click case. A touchstart-only (Windows phantom) leaves end=0 and
    // falls through, so mouse clicks keep working.
    var ti = touchRef.current;
    if (ti.end > 0 && Date.now() - ti.start < 800) return;
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

  // ── Image attachment ─────────────────────────────────────────────────────

  function pickImageFile() {
    setUploadError(null);
    if (fileInputRef.current) fileInputRef.current.click();
  }

  async function onImageFilePicked(e) {
    var file = e.target.files && e.target.files[0];
    // Reset so selecting the same file again re-fires onChange.
    e.target.value = "";
    if (!file) return;
    setUploading(true);
    setUploadError(null);
    var res = await uploadDMAttachment(myId, file);
    setUploading(false);
    if (res.error) {
      setUploadError(res.error.message || "Upload failed.");
      return;
    }
    // Send as an image message — content uses the [img] sentinel so the
    // renderer shows an <img> bubble instead of text. Preserve whatever
    // the user was typing in the text draft; sendMessage() clears it, so
    // snapshot + restore on the next microtask.
    var savedDraft = dms.msgDraft;
    dms.sendMessage(IMG_PREFIX + res.url);
    if (savedDraft) {
      setTimeout(function () { dms.setMsgDraft(savedDraft); }, 0);
    }
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

  // ── Conversation list pane ────────────────────────────────────────────────
  //
  // Relay-inspired flat rows: no per-row card borders, just a hover/active
  // background and a left accent strip on the selected conversation. Each
  // row shows partner name, last message preview (with "You: " prefix for
  // own messages), time on the right, and either an unread count pill or a
  // tiny "✓ Seen" hint when my last message has been read by the partner.

  var viewport = useDMViewport();
  var isDesktopDM = viewport.isDesktop;

  function renderConvRow(conv, isPinnedFlag) {
    var hasUnread = conv.hasUnread;
    var isPending = conv.status === "pending";
    var isMeLast = conv.last_message_sender_id === myId;
    var isActive = dms.activeConv && dms.activeConv.id === conv.id;
    var seenByPartner = conv.lastMsgSeenByPartner;
    var preview = isPending
      ? "Request pending…"
      : (isMeLast ? "You: " : "") + previewify(conv.last_message_preview, 80);
    return (
      <button key={conv.id} onClick={function () { dms.openConversation(conv); }}
        style={{
          width: "100%",
          background: isActive ? t.accentSubtle : "transparent",
          border: "none",
          borderLeft: "3px solid " + (isActive ? t.accent : "transparent"),
          padding: "10px 14px",
          display: "flex", gap: 12, alignItems: "center",
          cursor: "pointer", textAlign: "left",
          transition: "background 0.12s ease",
        }}
        onMouseEnter={function (e) { if (!isActive) e.currentTarget.style.background = t.bgTertiary; }}
        onMouseLeave={function (e) { if (!isActive) e.currentTarget.style.background = "transparent"; }}>
        <div style={{ position: "relative", flexShrink: 0 }}>
          <PlayerAvatar name={conv.partner.name} avatar={conv.partner.avatar} avatarUrl={conv.partner.avatar_url} size={42} />
          <PresenceDot profile={conv.partner} t={t} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
            <span style={{
              fontSize: 14, fontWeight: hasUnread ? 700 : 600,
              color: t.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            }}>{conv.partner.name}</span>
            {isPinnedFlag && <span style={{ color: t.textTertiary, display: "inline-flex", flexShrink: 0 }}><IconPin/></span>}
            <span style={{ flex: 1 }}/>
            <span style={{
              fontSize: 11, flexShrink: 0,
              color: hasUnread ? t.accent : t.textTertiary,
              fontWeight: hasUnread ? 600 : 400,
            }}>{formatMessageTime(conv.last_message_at)}</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 2 }}>
            <span style={{
              flex: 1, minWidth: 0,
              fontSize: 13, color: hasUnread ? t.text : t.textSecondary,
              fontWeight: hasUnread ? 500 : 400,
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            }}>{preview}</span>
            {/* Seen / sent indicator — only on rows where MY last message is
                newest. Single tick = sent, double tick = seen. Matches
                WhatsApp's convention so users read it instantly. */}
            {isMeLast && !hasUnread && !isPending && (
              <span
                title={seenByPartner ? "Seen" : "Sent"}
                style={{
                  flexShrink: 0, display: "inline-flex", alignItems: "center",
                  color: seenByPartner ? t.accent : t.textTertiary,
                  fontSize: 11, lineHeight: 1,
                }}>
                {seenByPartner ? "✓✓" : "✓"}
              </span>
            )}
            {hasUnread && (
              <span style={{
                background: t.accent, color: "#fff",
                fontSize: 10, fontWeight: 700,
                minWidth: 18, height: 18, borderRadius: 9,
                padding: "0 6px", display: "inline-flex", alignItems: "center", justifyContent: "center",
                flexShrink: 0,
              }}>{conv.unread_count || ""}</span>
            )}
          </div>
        </div>
      </button>
    );
  }

  function renderConvList() {
    var allEmpty = dms.conversations.length === 0 && dms.requests.length === 0;

    // Distinguish "still fetching" from "fetched and empty" so a fresh
    // mount doesn't flash the empty-state card before the real list
    // lands (user-reported: "sometimes messages don't show on mobile").
    if (!dms.conversationsLoaded && allEmpty) {
      return (
        <div style={{ padding: "48px 20px", textAlign: "center", color: t.textTertiary, fontSize: 13 }}>
          Loading messages…
        </div>
      );
    }

    // Split pinned vs all. Pending-out convs never pin.
    var pinnedSet = {};
    (dms.pinnedConvIds || []).forEach(function (id) { pinnedSet[id] = true; });
    var pinned = (dms.pinnedConvIds || [])
      .map(function (id) { return dms.conversations.find(function (c) { return c.id === id; }); })
      .filter(Boolean);
    var others = dms.conversations.filter(function (c) { return !pinnedSet[c.id]; });

    function sectionHeader(label) {
      return (
        <div style={{ padding: "12px 14px 4px", fontSize: 11, fontWeight: 700, color: t.textTertiary, textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</div>
      );
    }

    return (
      <div>
        {dms.requests.length > 0 && (
          <div style={{ marginBottom: 10 }}>
            <div style={{ padding: "12px 14px 6px", fontSize: 11, fontWeight: 700, color: t.textTertiary, textTransform: "uppercase", letterSpacing: "0.06em" }}>
              Message Requests · {dms.requests.length}
            </div>
            <div style={{ padding: "0 10px" }}>
              {dms.requests.map(function (conv) {
                return (
                  <div key={conv.id} style={{ background: t.accentSubtle, border: "1px solid " + t.accent, borderRadius: 12, padding: 12, marginBottom: 8 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                      <PlayerAvatar name={conv.partner.name} avatar={conv.partner.avatar} avatarUrl={conv.partner.avatar_url} size={38} />
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 14, fontWeight: 700, color: t.text }}>{conv.partner.name}</div>
                        <div style={{ fontSize: 12, color: t.textSecondary }}>wants to message you</div>
                      </div>
                    </div>
                    {conv.last_message_preview && (
                      <div style={{ fontSize: 12, color: t.textSecondary, background: t.bg, padding: "8px 10px", borderRadius: 8, marginBottom: 10, fontStyle: "italic", lineHeight: 1.4 }}>
                        "{conv.last_message_preview}"
                      </div>
                    )}
                    <div style={{ display: "flex", gap: 6 }}>
                      <button onClick={function () { dms.acceptRequest(conv.id); dms.openConversation(conv); }}
                        style={{ flex: 1, padding: "8px", borderRadius: 8, border: "none", background: t.accent, color: t.accentText, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                        Accept
                      </button>
                      <button onClick={function () { dms.declineRequest(conv.id); }}
                        style={{ flex: 1, padding: "8px", borderRadius: 8, border: "1px solid " + t.border, background: "transparent", color: t.textSecondary, fontSize: 12, fontWeight: 500, cursor: "pointer" }}>
                        Decline
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {allEmpty && dms.conversationsLoaded ? (
          <div style={{ textAlign: "center", padding: "48px 20px" }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>💬</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: t.text, marginBottom: 6 }}>No messages yet</div>
            <div style={{ fontSize: 13, color: t.textSecondary }}>Go to Friends and tap Message to start a conversation.</div>
          </div>
        ) : (
          <div>
            {pinned.length > 0 && sectionHeader("Pinned")}
            {pinned.map(function (c) { return renderConvRow(c, true); })}
            {others.length > 0 && sectionHeader(pinned.length ? "All messages" : "Recent")}
            {others.map(function (c) { return renderConvRow(c, false); })}
          </div>
        )}
      </div>
    );
  }

  // ── Desktop empty state (shown in thread pane when no conv is open) ─────

  function renderDesktopEmptyState() {
    return (
      <div style={{
        flex: 1, display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center",
        background: t.bg, padding: 40, textAlign: "center",
      }}>
        <div style={{
          width: 88, height: 88, borderRadius: 22,
          background: t.accentSubtle,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 40, marginBottom: 18,
        }}>💬</div>
        <div style={{ fontSize: 18, fontWeight: 700, color: t.text }}>Your messages</div>
        <div style={{ fontSize: 13, color: t.textSecondary, marginTop: 6, maxWidth: 320 }}>
          Pick a conversation on the left to open the thread, or start a new one from the Friends tab.
        </div>
      </div>
    );
  }

  // ── Thread view ──────────────────────────────────────────────────────────

  var conv = dms.activeConv;
  // Two-pane only applies when we have room to break out of the 680px
  // reading column. Otherwise fall back to the mobile-style list-OR-
  // thread stack so the content still fits the column.
  var twoPane = twoPaneEligible;
  var showList = twoPane || !conv;
  var showThreadPane = twoPane || conv;

  // Short-circuit when neither pane applies (shouldn't happen — included
  // so the layout below can assume at least one column renders).
  if (!showList && !showThreadPane) return null;

  var isPending = conv && conv.status === "pending";
  var iAmSender = conv && conv.requester_id === myId;
  var presence = conv ? getPresence(conv.partner) : { online: false, hidden: true };

  var unreadStartIdx = conv ? computeUnreadDividerIdx(dms.threadMessages, myId, conv.lastReadAt) : -1;
  var lastSeenByPartnerIdx = computeLastSeenByPartnerIdx(dms.threadMessages, myId, dms.partnerLastReadAt);

  // Anchor the pane to the viewport so the input bar hugs the bottom of
  // the visible area regardless of message count. On desktop, the list
  // pane and the thread pane are siblings inside this flex row — list
  // fixed 320px, thread fills the rest. On mobile one column shows at a
  // time. Global --cs-nav-h / --cs-tab-h are 0 on desktop.
  // On desktop the thread pane stays pinned to where the rest of the
  // app's 680px reading column lives (Friends list, Discover, etc. —
  // visually consistent across tabs). The conversation list pane pokes
  // out to the left of that column. The list pane width adapts to the
  // available space left of the reading column, clamped 160–280px so
  // it's always a usable list even on narrower desktops. When the
  // viewport is so cramped that we have <160px of left-space, we let
  // the list overlap slightly — still better than hiding the thread.
  var MAX_LIST_W = 280;
  var MIN_LIST_W = 160;
  var availableW = viewport.width - viewport.sidebarW - viewport.rightPanelW;
  var listRoom = Math.max(0, Math.floor((availableW - 680) / 2) - 8);
  var LIST_W = Math.max(MIN_LIST_W, Math.min(MAX_LIST_W, listRoom));
  // Two-pane on any desktop width. On mobile (<1024) we still fall back
  // to the single-column list-or-thread stack.
  var twoPaneEligible = isDesktopDM;
  var breakoutStyle = twoPaneEligible
    ? {
        position: "relative",
        width: (LIST_W + 680) + "px",
        marginLeft: "-" + LIST_W + "px",
      }
    : {};
  return (
    <div className="cs-dm-root" style={Object.assign({
      display: "flex",
      height: "calc(100dvh - var(--cs-nav-h) - var(--cs-tab-h) - 140px)",
      minHeight: 420,
    }, breakoutStyle)}>
      {/* ── List pane ─────────────────────────────────────────────────── */}
      {showList && (
        <div className="cs-dm-list-pane" style={{
          width: twoPane ? LIST_W : "100%",
          flexShrink: 0, minWidth: 0,
          background: twoPane ? t.bgCard : "transparent",
          borderRight: twoPane ? "1px solid " + t.border : "none",
          overflowY: "auto",
        }}>
          {renderConvList()}
        </div>
      )}

      {/* ── Thread pane (or desktop empty state) ──────────────────────── */}
      {showThreadPane && !conv && renderDesktopEmptyState()}
      {showThreadPane && conv && (<>
      <div style={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 0 }}>

      {/* Conversation settings. Desktop: centered modal with a modest
          width. Mobile: bottom-sheet with a grab handle. Decided via a
          viewport-width check captured once on open — good enough for
          the two layouts we care about. */}
      {showSettings && createPortal((
        <div
          style={{
            position: "fixed", inset: 0, zIndex: 300,
            background: "rgba(0,0,0,0.55)",
            display: "flex",
            // Desktop: center. Mobile: align to bottom so the sheet sits there.
            alignItems: (typeof window !== "undefined" && window.innerWidth >= 700) ? "center" : "flex-end",
            justifyContent: "center",
            padding: (typeof window !== "undefined" && window.innerWidth >= 700) ? 16 : 0,
          }}
          onClick={function () { setShowSettings(false); }}>
          <div
            onClick={function (e) { e.stopPropagation(); }}
            style={(typeof window !== "undefined" && window.innerWidth >= 700)
              ? {
                  // Desktop modal
                  width: "100%", maxWidth: 360,
                  background: t.bgCard, border: "1px solid " + t.border,
                  borderRadius: 14, padding: "20px",
                  boxShadow: "0 20px 60px rgba(0,0,0,0.35)",
                }
              : {
                  // Mobile bottom sheet
                  width: "100%",
                  background: t.bgCard,
                  borderRadius: "20px 20px 0 0",
                  padding: "20px 20px calc(20px + env(safe-area-inset-bottom))",
                }
            }>
            {!(typeof window !== "undefined" && window.innerWidth >= 700) && (
              <div style={{ width: 32, height: 4, borderRadius: 2, background: t.border, margin: "0 auto 20px" }} />
            )}
            <div style={{ fontSize: 16, fontWeight: 700, color: t.text, marginBottom: 4 }}>{conv.partner.name}</div>
            <div style={{ fontSize: 12, color: t.textTertiary, marginBottom: 20 }}>Conversation settings</div>
            <button onClick={function () { setShowSettings(false); setShowDeleteConfirm(true); }}
              style={{ width: "100%", padding: "13px", borderRadius: 10, border: "1px solid " + t.red, background: "transparent", color: t.red, fontSize: 14, fontWeight: 600, marginBottom: 8, cursor: "pointer" }}>
              Delete Conversation
            </button>
            <button onClick={function () { setShowSettings(false); }}
              style={{ width: "100%", padding: "13px", borderRadius: 10, border: "1px solid " + t.border, background: "transparent", color: t.textSecondary, fontSize: 14, cursor: "pointer" }}>
              Cancel
            </button>
          </div>
        </div>
      ), document.body)}

      {/* Centered delete-conversation confirm (was a native window.confirm).
          Portaled to document.body so position:fixed centering is relative
          to the actual viewport, not the .fade-up transformed ancestor. */}
      {showDeleteConfirm && createPortal((
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
      ), document.body)}

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, paddingBottom: 12, marginBottom: 4, borderBottom: "1px solid " + t.border }}>
        <button onClick={function () { dms.closeConversation(); setMenuState(null); setShowSettings(false); setShowInputEmoji(null); }}
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
        {/* Details drawer toggle — desktop-only (hidden below 1024px via
            .cs-dm-details-btn; the drawer itself would eat mobile width). */}
        <button
          type="button"
          onClick={function () { setShowDetails(function (v) { return !v; }); }}
          aria-label={showDetails ? "Hide details" : "Show details"}
          className="cs-dm-details-btn"
          style={{
            background: showDetails ? t.accentSubtle : "transparent",
            border: "none", color: showDetails ? t.accent : t.textTertiary,
            width: 32, height: 32, borderRadius: 8,
            display: "none", alignItems: "center", justifyContent: "center",
            padding: 0, flexShrink: 0, cursor: "pointer",
          }}>
          <IconPanelRight/>
        </button>
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

      {/* Messages — scroll region. flex:1 fills between the fixed-height
          header (above) and the fixed-height input footer (below). */}
      <div style={{ flex: 1, overflowY: "auto", minHeight: 0, paddingRight: 4 }}>
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
            var showDateSep = dateSeparatorIds.has(msg.id);
            var replyMsg = msg.reply_to_id ? dms.threadMessages.find(function (m) { return m.id === msg.reply_to_id; }) : null;
            // Breathing room between bubbles. 2px when this message is
            // from the same sender as the previous one (tight group),
            // 10px when the speaker changes. First-of-day separators and
            // the unread divider above already add their own margin.
            var prev = visibleMessages[idx - 1];
            var sameSender = prev && prev.sender_id === msg.sender_id && !showDateSep && !showUnread;
            var rowMargin = sameSender ? 2 : 10;

            return (
              <div key={msg.id}>
                {showDateSep && (
                  <div style={{ display: "flex", alignItems: "center", gap: 10, margin: idx === 0 ? "4px 0 10px" : "18px 0 10px" }}>
                    <div style={{ flex: 1, height: 1, background: t.border }} />
                    <span style={{ fontSize: 10, fontWeight: 700, color: t.textTertiary, textTransform: "uppercase", letterSpacing: "0.08em", flexShrink: 0 }}>
                      {dateSeparatorLabel(msg.created_at)}
                    </span>
                    <div style={{ flex: 1, height: 1, background: t.border }} />
                  </div>
                )}
                {showUnread && (
                  <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "16px 0 10px" }}>
                    <div style={{ flex: 1, height: 1, background: t.accent, opacity: 0.35 }} />
                    <span style={{ fontSize: 10, fontWeight: 800, color: t.accent, textTransform: "uppercase", letterSpacing: "0.1em", flexShrink: 0 }}>Unread Messages</span>
                    <div style={{ flex: 1, height: 1, background: t.accent, opacity: 0.35 }} />
                  </div>
                )}
                <div style={{ display: "flex", justifyContent: mine ? "flex-end" : "flex-start", marginBottom: rowMargin }}>
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
                    ) : (() => {
                      var isImg = !msg.deleted_at && isImageMessageContent(msg.content);
                      var imgUrl = isImg ? extractImageUrl(msg.content) : null;
                      var bubbleStyle = isImg ? {
                        // Image bubble — no background/padding so the image
                        // reads as the whole surface. Keep rounded corners
                        // + tail to match text bubbles.
                        background: "transparent",
                        padding: 0,
                        border: mine ? "none" : "1px solid " + t.border,
                        borderRadius: mine ? (replyMsg ? "0 16px 4px 16px" : "16px 16px 4px 16px") : (replyMsg ? "16px 0 16px 4px" : "16px 16px 16px 4px"),
                        overflow: "hidden",
                        cursor: "pointer", userSelect: "none", WebkitUserSelect: "none",
                        WebkitTouchCallout: "none",
                        maxWidth: 260,
                      } : {
                        background: mine ? t.accent : t.bgCard,
                        color: mine ? t.accentText : t.text,
                        border: mine ? "none" : "1px solid " + t.border,
                        borderRadius: mine ? (replyMsg ? "0 16px 4px 16px" : "16px 16px 4px 16px") : (replyMsg ? "16px 0 16px 4px" : "16px 16px 16px 4px"),
                        padding: "9px 13px", fontSize: 14, lineHeight: 1.45,
                        wordBreak: "break-word", whiteSpace: "pre-wrap",
                        cursor: "pointer", userSelect: "none", WebkitUserSelect: "none",
                        WebkitTouchCallout: "none",
                        opacity: msg.deleted_at ? 0.5 : 1, fontStyle: msg.deleted_at ? "italic" : undefined,
                      };
                      return (
                        <div
                          onTouchStart={function (e) { handleTouchStart(e, msg); }}
                          onTouchEnd={handleTouchEnd}
                          onTouchMove={handleTouchEnd}
                          onClick={function (e) {
                            if (isImg && imgUrl) {
                              // On image bubbles, a plain left-click opens
                              // the lightbox. Long-press / right-click still
                              // open the action menu via onContextMenu.
                              setLightboxUrl(imgUrl);
                              return;
                            }
                            handleBubbleClick(e, msg);
                          }}
                          onContextMenu={function (e) { handleContextMenu(e, msg); }}
                          style={bubbleStyle}>
                          {msg.deleted_at
                            ? "Message deleted"
                            : isImg
                              ? <img
                                  src={imgUrl}
                                  alt=""
                                  loading="lazy"
                                  style={{ display: "block", maxWidth: "100%", maxHeight: 320, objectFit: "cover" }}
                                />
                              : msg.content}
                          {msg.edited_at && !msg.deleted_at && !isImg && (
                            <span style={{ fontSize: 9, opacity: 0.55, marginLeft: 6 }}>edited</span>
                          )}
                        </div>
                      );
                    })()}
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
        // "Delete for me" is available on ANY message (own or partner's) —
        // it's a local hide, stored in localStorage, so it only affects my
        // view. "Unsend" is own-only (soft-deletes in DB for both parties).
        var items = [
          { label: "Reply", icon: IconReply, show: true,
            action: function () { dms.setReplyTo(menuState.message); closeMenu(); setTimeout(function () { inputRef.current && inputRef.current.focus(); }, 50); } },
          { label: "Copy", icon: IconCopy, show: !menuState.message.deleted_at && !isImageMessageContent(menuState.message.content),
            action: function () { navigator.clipboard && navigator.clipboard.writeText(menuState.message.content); closeMenu(); } },
          { label: "Edit", icon: IconEdit, show: canEdit,
            action: function () { dms.startEdit(menuState.message); closeMenu(); } },
          { label: "Delete for me", icon: IconTrash, show: !menuState.message.deleted_at,
            action: function () { hideForMe(menuState.message.id); } },
          { label: "Unsend", icon: IconUnsend, show: isMine && !menuState.message.deleted_at, danger: true,
            action: function () { dms.deleteMessage(menuState.message.id); closeMenu(); } },
        ].filter(function (i) { return i.show; });
        // Portal to document.body — the People tab wraps its content in
        // a .fade-up div with a CSS transform, which creates a containing
        // block for position:fixed descendants and offsets their
        // viewport-relative coords. Portaling escapes that ancestor so
        // the menu sits exactly where computeContextMenuPos says.
        return createPortal((
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
        ), document.body);
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

      {/* Input footer — non-shrinking row at the bottom of the flex
          column. The messages area above owns the scroll, so this stays
          pinned to the viewport bottom naturally without position:sticky. */}
      <div style={{
        flexShrink: 0,
        background: t.bg,
        paddingTop: 8,
      }}>
      {/* Reply preview */}
      {dms.replyTo && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", background: t.bgTertiary, borderTop: "2px solid " + t.accent, borderRadius: "8px 8px 0 0" }}>
          <div style={{ flex: 1, fontSize: 12, color: t.textSecondary, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            <span style={{ fontWeight: 700, color: t.accent, marginRight: 4 }}>Replying</span>
            {previewify(dms.replyTo.content, 140)}
          </div>
          <button onClick={dms.clearReplyTo} style={{ background: "transparent", border: "none", color: t.textTertiary, fontSize: 18, lineHeight: 1, padding: "0 2px", flexShrink: 0 }}>×</button>
        </div>
      )}

      {/* Upload-error toast — small inline strip above input, disappears
          when the user next successfully picks a file or types. */}
      {uploadError && (
        <div style={{ padding: "6px 10px", background: (t.redSubtle || "rgba(220,38,38,0.1)"), color: t.red, fontSize: 12, borderRadius: 8, marginBottom: 6 }}>
          {uploadError}
        </div>
      )}

      {/* Hidden file input driven by the paperclip button. */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        style={{ display: "none" }}
        onChange={onImageFilePicked}
      />

      {/* Input */}
      {(!isPending || iAmSender) && (
        <div style={{ display: "flex", gap: 8, alignItems: "flex-end", marginTop: dms.replyTo ? 0 : 0, paddingBottom: "env(safe-area-inset-bottom)" }}>
          <button
            ref={emojiBtnRef}
            type="button"
            onClick={function (e) {
              // Capture the rect synchronously — React's pooled event can
              // null currentTarget by the time the setState callback runs.
              var rect = e.currentTarget.getBoundingClientRect();
              setShowInputEmoji(function (prev) { return prev ? null : rect; });
            }}
            aria-label="Insert emoji"
            style={{
              width: 38, height: 42, flexShrink: 0,
              background: "transparent", border: "1px solid " + t.border,
              borderRadius: 12, color: t.text, fontSize: 18, cursor: "pointer",
              padding: 0,
            }}>😊</button>
          <button
            type="button"
            disabled={uploading}
            onClick={pickImageFile}
            aria-label="Attach image"
            style={{
              width: 38, height: 42, flexShrink: 0,
              background: "transparent", border: "1px solid " + t.border,
              borderRadius: 12, color: uploading ? t.textTertiary : t.text,
              cursor: uploading ? "wait" : "pointer",
              padding: 0, display: "flex", alignItems: "center", justifyContent: "center",
            }}>
            {uploading ? <span style={{ fontSize: 11 }}>…</span> : <IconPaperclip/>}
          </button>
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
      {showInputEmoji && (
        <EmojiPicker
          t={t}
          anchor={showInputEmoji}
          onPick={insertEmojiAtCursor}
          onClose={function () { setShowInputEmoji(null); }}
        />
      )}
      </div>{/* /sticky input region */}
      </div>{/* /thread column */}

      {/* Details drawer (desktop only per .cs-dm-details-btn media query;
          the toggle button is hidden on mobile so the drawer can't open). */}
      {showDetails && (
        <DetailsDrawer
          t={t} conv={conv}
          isPinned={(dms.pinnedConvIds || []).indexOf(conv.id) >= 0}
          onPin={function () { dms.pinConversation && dms.pinConversation(conv.id); }}
          onUnpin={function () { dms.unpinConversation && dms.unpinConversation(conv.id); }}
          onOpenProfile={openProfile}
          onClose={function () { setShowDetails(false); }}
        />
      )}

      {/* Image lightbox — full-viewport dark overlay, click anywhere to
          dismiss. Portaled for the same containing-block reason as the
          other overlays. */}
      {lightboxUrl && createPortal((
        <div
          role="dialog" aria-label="Image preview" aria-modal="true"
          onClick={function () { setLightboxUrl(null); }}
          style={{
            position: "fixed", inset: 0, zIndex: 500,
            background: "rgba(0,0,0,0.85)",
            display: "flex", alignItems: "center", justifyContent: "center",
            padding: 16, cursor: "zoom-out",
          }}>
          <img
            src={lightboxUrl}
            alt=""
            style={{ maxWidth: "100%", maxHeight: "100%", display: "block", objectFit: "contain" }}
            onClick={function (e) { e.stopPropagation(); }}
          />
        </div>
      ), document.body)}
      </>)}{/* /showThreadPane && conv */}
    </div>
  );
}
