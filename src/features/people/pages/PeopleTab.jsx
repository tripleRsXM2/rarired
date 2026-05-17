// src/features/people/pages/PeopleTab.jsx
//
// Editorial Tennis pass — same realm as Activity / Profile / League
// detail. Cream paper background, JetBrains-Mono microlabels, Sora
// for body, Space Grotesk display for the hero count. Lists are
// flat hairline-separated rows (no boxed cards). Sub-tabs are mono
// uppercase pill chips (single line, same chip language Activity
// uses for All / Ranked / Casual / League / Tournament).
//
// Messages tab body is left to the Messages component — it owns its
// own two-pane chat layout. We only paint the page chrome around
// it (hero, search, sub-tabs).
//
// Behaviour preserved verbatim from the legacy version:
//   - URL-driven sub-tab (/people/<id>)
//   - Search dropdown with debounce + add-from-results
//   - PlayerCard with relation-aware action set (Add / Pending /
//     Accept-Decline / Challenge)
//   - Overflow ⋯ for friends (Unfriend / Block) vs inline Block
//     button for non-friends
//   - Discover sub-sections (Played / Near you / Similar skill)
//   - Invite-friends callout, Blocked tab

import { useRef, useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import Messages from "../components/Messages.jsx";
import { PresenceDot, PresenceLabel } from "../components/PresenceIndicator.jsx";
import { track } from "../../../lib/analytics.js";
import { NAV_ICONS } from "../../../lib/constants/navIcons.jsx";
import PlayerAvatar from "../../../components/ui/PlayerAvatar.jsx";
import { ED_TOK } from "../../home/components/EditorialScreen.jsx";

// ── PlayerCard — flat hairline row ─────────────────────────────────
function PlayerCard({
  u, t, socialLoading, friendRelationLabel, sentReq, recvReq,
  sendFriendRequest, cancelRequest, acceptRequest, declineRequest,
  unfriend, blockUser, onMessage, openProfile, openChallenge,
  // Optional match-reason metadata from the Discover ranker.
  // Shape: { sameSkill, sameZone, sharedCourts: [...] }. When set,
  // small explanatory tags render under the name so the user knows
  // why this player is being suggested.
  matchReasons,
}) {
  var rel = friendRelationLabel(u.id);
  var loading = !!socialLoading[u.id];
  var [menuOpen, setMenuOpen] = useState(false);
  function goToProfile() { if (openProfile) openProfile(u.id); }
  var clickable = !!openProfile;

  return (
    <div style={{
      display:        "flex",
      alignItems:     "center",
      gap:            12,
      padding:        "14px 4px",
      borderBottom:   "1px solid " + ED_TOK.line,
      fontFamily:     ED_TOK.sans,
    }}>
      <div
        onClick={clickable ? goToProfile : undefined}
        style={{ position: "relative", flexShrink: 0, cursor: clickable ? "pointer" : "default" }}>
        <PlayerAvatar name={u.name} avatar={u.avatar} profile={u} size={44}/>
        <PresenceDot profile={u} t={t}/>
      </div>

      <div
        onClick={clickable ? goToProfile : undefined}
        style={{ flex: 1, minWidth: 0, cursor: clickable ? "pointer" : "default" }}>
        {/* Name — single line with ellipsis truncation. */}
        <div style={{
          fontSize:      14.5,
          fontWeight:    600,
          color:         ED_TOK.ink,
          letterSpacing: "-0.005em",
          overflow:      "hidden",
          textOverflow:  "ellipsis",
          whiteSpace:    "nowrap",
        }}>
          {u.name}
        </div>
        {/* Presence label on its OWN sub-line so a long
            "Last seen yesterday at 10:34 PM" string can't push the
            action buttons (Message / Challenge / ⋯) sideways or
            overlap them. Pattern matches WhatsApp / Messenger
            inbox rows. Truncates with ellipsis if the line is
            still wider than the column. */}
        <div style={{
          marginTop:     3,
          minWidth:      0,
          overflow:      "hidden",
          textOverflow:  "ellipsis",
          whiteSpace:    "nowrap",
        }}>
          <PresenceLabel profile={u} t={t}/>
        </div>
        {/* Match-reason tags — only render when the Discover ranker
            provides reasons. Compact, neutral chips with a tiny
            accent dot for sameSkill (the strongest signal). The
            `> 0` keeps the guard a proper boolean — otherwise the
            sharedCourts.length=0 branch makes the && chain evaluate
            to literal 0, which React renders as the text '0' under
            every card. Classic JSX gotcha. */}
        {matchReasons && (matchReasons.sameSkill || matchReasons.sameZone || (matchReasons.sharedCourts && matchReasons.sharedCourts.length > 0)) && (
          <div style={{
            marginTop: 6, display: "flex", flexWrap: "wrap", gap: 4,
            fontSize: 10, fontWeight: 700, letterSpacing: "0.06em",
            textTransform: "uppercase", color: ED_TOK.ink2,
          }}>
            {matchReasons.sameSkill && (
              <span style={{
                display: "inline-flex", alignItems: "center", gap: 4,
                padding: "2px 7px", borderRadius: 999,
                background: ED_TOK.bg2, color: ED_TOK.ink,
                border: "1px solid " + ED_TOK.line,
              }}>
                <span style={{
                  width: 5, height: 5, borderRadius: "50%",
                  background: t && t.accent ? t.accent : "#FF5A1F",
                }}/>
                Same level
              </span>
            )}
            {matchReasons.sameZone && (
              <span style={{
                padding: "2px 7px", borderRadius: 999,
                background: ED_TOK.bg2, color: ED_TOK.ink2,
                border: "1px solid " + ED_TOK.line,
              }}>Same zone</span>
            )}
            {matchReasons.sharedCourts && matchReasons.sharedCourts.length > 0 && (
              <span style={{
                padding: "2px 7px", borderRadius: 999,
                background: ED_TOK.bg2, color: ED_TOK.ink2,
                border: "1px solid " + ED_TOK.line,
              }}>
                {matchReasons.sharedCourts.length === 1
                  ? "1 shared court"
                  : matchReasons.sharedCourts.length + " shared courts"}
              </span>
            )}
          </div>
        )}
      </div>

      <div style={{
        display:        "flex",
        alignItems:     "center",
        gap:            6,
        flexShrink:     0,
        position:       "relative",
      }}>
        {/* Relation-specific primary affordance — only the inline
            actions that depend on the friend-request state stay
            visible on the row. Message + Challenge moved into the
            ⋯ menu below so a long row doesn't overflow on narrow
            viewports (was overlapping the presence label). */}
        {rel === "none" && (
          <PillButton variant="solid" disabled={loading} onClick={function () { sendFriendRequest(u); }}>
            {loading ? "…" : "Add"}
          </PillButton>
        )}
        {rel === "sent" && (
          <PillButton variant="muted" disabled={loading}
            onClick={function () { var r = sentReq(u.id); if (r) cancelRequest(r); }}>
            {loading ? "…" : "Pending"}
          </PillButton>
        )}
        {rel === "received" && (
          <>
            <PillButton variant="solid" disabled={loading}
              onClick={function () { var r = recvReq(u.id); if (r) acceptRequest(r); }}>
              {loading ? "…" : "Accept"}
            </PillButton>
            <PillButton variant="ghost" disabled={loading}
              onClick={function () { var r = recvReq(u.id); if (r) declineRequest(r); }}>
              ✕
            </PillButton>
          </>
        )}

        {/* Overflow menu — Message + Challenge live here for any
            relation (so the row stays compact). Friends also get
            Unfriend + Block; non-friends get Block only. */}
        <div style={{ position: "relative" }}>
          <button
            onClick={function (e) { e.stopPropagation(); setMenuOpen(!menuOpen); }}
            aria-label="More actions"
            title="More actions"
            style={{
              width:        32,
              height:       32,
              padding:      0,
              borderRadius: "50%",
              border:       "1px solid " + ED_TOK.line,
              background:   "transparent",
              color:        ED_TOK.muted,
              fontSize:     16,
              fontWeight:   700,
              lineHeight:   1,
              cursor:       "pointer",
            }}>⋯</button>
          {menuOpen && (
            <>
              <div
                onClick={function () { setMenuOpen(false); }}
                style={{ position: "fixed", inset: 0, zIndex: 50 }}/>
              <div style={{
                position:     "absolute",
                right:        0,
                top:          "calc(100% + 6px)",
                minWidth:     180,
                background:   ED_TOK.bg,
                border:       "1px solid " + ED_TOK.line,
                borderRadius: 12,
                boxShadow:    "0 12px 28px rgba(42, 32, 26, 0.18)",
                overflow:     "hidden",
                zIndex:       60,
              }}>
                {onMessage && (
                  <>
                    <button disabled={loading}
                      onClick={function () { setMenuOpen(false); onMessage(u); }}
                      style={menuItemStyle(ED_TOK.ink)}>
                      Message
                    </button>
                    <div style={{ height: 1, background: ED_TOK.line }}/>
                  </>
                )}
                {openChallenge && (
                  <>
                    <button disabled={loading}
                      onClick={function () { setMenuOpen(false); openChallenge(u, "profile"); }}
                      style={menuItemStyle(ED_TOK.ink)}>
                      Challenge
                    </button>
                    <div style={{ height: 1, background: ED_TOK.line }}/>
                  </>
                )}
                {rel === "friends" && (
                  <>
                    <button disabled={loading}
                      onClick={function () {
                        setMenuOpen(false);
                        if (window.confirm("Unfriend " + u.name + "?")) unfriend(u);
                      }}
                      style={menuItemStyle(ED_TOK.ink)}>
                      Unfriend
                    </button>
                    <div style={{ height: 1, background: ED_TOK.line }}/>
                  </>
                )}
                <button disabled={loading}
                  onClick={function () {
                    setMenuOpen(false);
                    if (window.confirm("Block " + u.name + "? They won't be able to message you and will disappear from your map and discovery surfaces.")) blockUser(u);
                  }}
                  style={menuItemStyle(ED_TOK.loss)}>
                  Block
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function menuItemStyle(color) {
  return {
    display:    "block",
    width:      "100%",
    padding:    "12px 16px",
    border:     "none",
    background: "transparent",
    color:      color,
    fontFamily: ED_TOK.sans,
    fontSize:   13.5,
    fontWeight: 600,
    textAlign:  "left",
    cursor:     "pointer",
  };
}

// ── PillButton — three variants tuned to Activity's chip language ──
function PillButton({ variant, onClick, disabled, children, iconLeft }) {
  var base = {
    display:       "inline-flex",
    alignItems:    "center",
    gap:           6,
    padding:       "7px 12px",
    borderRadius:  999,
    fontFamily:    ED_TOK.mono,
    fontSize:      10,
    fontWeight:    700,
    letterSpacing: "0.14em",
    textTransform: "uppercase",
    cursor:        disabled ? "default" : "pointer",
    opacity:       disabled ? 0.6 : 1,
    whiteSpace:    "nowrap",
    transition:    "background 140ms ease, color 140ms ease",
  };
  var styles = base;
  if (variant === "solid") {
    styles = Object.assign({}, base, {
      border:     "1px solid " + ED_TOK.ink,
      background: ED_TOK.ink,
      color:      ED_TOK.bg,
    });
  } else if (variant === "ghost") {
    styles = Object.assign({}, base, {
      border:     "1px solid " + ED_TOK.lineStrong,
      background: "transparent",
      color:      ED_TOK.ink,
    });
  } else if (variant === "muted") {
    styles = Object.assign({}, base, {
      border:     "1px solid " + ED_TOK.line,
      background: "transparent",
      color:      ED_TOK.muted,
    });
  }
  return (
    <button onClick={onClick} disabled={disabled} style={styles}>
      {iconLeft && <span style={{ display: "flex", alignItems: "center" }}>{iconLeft}</span>}
      {children}
    </button>
  );
}

// ── PeopleTab ─────────────────────────────────────────────────────
export default function PeopleTab({
  t, authUser, friends, sentRequests, receivedRequests,
  blockedUsers, suggestedPlayers,
  playedOpponents, sameSkillPlayers,
  discoverPlayers, discoverLoading,
  peopleSearch, setPeopleSearch,
  searchResults, setSearchResults, searchLoading, showSearchDrop, setShowSearchDrop,
  socialLoading, searchTimer,
  sendFriendRequest, acceptRequest, declineRequest, cancelRequest,
  unfriend, blockUser, unblockUser, searchUsers,
  friendRelationLabel, sentReq, recvReq,
  setShowAuth, setAuthMode, setAuthStep,
  dms,
  openProfile,
  challenges,            // eslint-disable-line no-unused-vars — kept for back-compat parity
  openChallenge,
  openConvertToMatch,    // eslint-disable-line no-unused-vars
  leagues,               // eslint-disable-line no-unused-vars
  toast,
  // Lets us collapse the global "Friends" top mob nav while a
  // Messages thread is open on mobile (single-pane). The thread
  // owns its own header; stacking the global nav above it is
  // redundant chrome.
  setHideTopMobNav,
  // Same idea for the bottom tab bar — the chat thread is a
  // full-screen takeover and the input bar lives at the page's
  // actual bottom edge.
  setHideBottomTabBar,
}) {
  var location = useLocation();
  var navigate = useNavigate();

  var validPeopleTabs = ["messages", "friends", "requests", "suggested", "blocked"];
  var pathParts = location.pathname.split("/").filter(Boolean);
  var peopleTab = (pathParts[1] && validPeopleTabs.includes(pathParts[1])) ? pathParts[1] : "messages";

  function setPeopleTab(newTab) {
    navigate("/people/" + newTab);
    if (newTab !== "messages" && dms) dms.closeConversation();
  }

  var messagesEndRef = useRef(null);
  useEffect(function () {
    if (dms && dms.activeConv && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [dms && dms.threadMessages && dms.threadMessages.length, dms && dms.activeConv]);

  useEffect(function () {
    if (peopleTab !== "suggested" || !authUser) return;
    track("discover_tab_viewed", {
      played_opponents_count:    (playedOpponents || []).length,
      suburb_suggestions_count:  (suggestedPlayers || []).length,
      skill_suggestions_count:   (sameSkillPlayers || []).length,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [peopleTab, authUser && authUser.id]);

  // When a Messages thread is open on mobile (single-pane), hide the
  // global top mob nav AND the page-level sticky chrome (search +
  // sub-tabs). The conversation owns the full screen; same takeover
  // pattern LeaguesPanel uses for league detail.
  //
  // Two flags drive the layout:
  //   - global nav: setHideTopMobNav(true) — App.jsx hides cs-mob-nav
  //   - local chrome: threadActive — we render the sticky search+
  //     sub-tabs only when this is false.
  var threadActive = peopleTab === "messages" && !!(dms && dms.activeConv);
  useEffect(function () {
    if (setHideTopMobNav)    setHideTopMobNav(threadActive);
    if (setHideBottomTabBar) setHideBottomTabBar(threadActive);
    return function () {
      if (setHideTopMobNav)    setHideTopMobNav(false);
      if (setHideBottomTabBar) setHideBottomTabBar(false);
    };
  }, [threadActive, setHideTopMobNav, setHideBottomTabBar]);

  // Document-level overflow lock for the Messages view. iOS Safari
  // still permits rubber-band scroll on the document even when
  // descendants have overflow:hidden — that's why the chrome bar
  // appeared to "unlock" on touch even though our flex column
  // layout pins it. Setting html + body overflow:hidden defangs
  // that without the side effects of position:fixed (which earlier
  // broke scroll-position retention, fought the iOS keyboard, and
  // created new viewports for position:fixed descendants).
  //
  // Active for the entire Messages view (conv list AND thread).
  // Cleanup restores previous values on unmount / tab switch.
  useEffect(function () {
    if (!messagesView) return;
    if (typeof document === "undefined") return;
    var html = document.documentElement;
    var body = document.body;
    var prevHtmlOverflow = html.style.overflow;
    var prevBodyOverflow = body.style.overflow;
    var prevScrollY = window.scrollY || 0;
    html.style.overflow = "hidden";
    body.style.overflow = "hidden";
    // Pin the document to scrollTop=0. overflow:hidden locks the
    // CURRENT scroll position; if the user scrolled the document
    // before opening the thread (or auto-scrolled to a focused
    // input), the existing offset would persist and yank the chat
    // header above the visible viewport. Force reset.
    window.scrollTo(0, 0);
    return function () {
      html.style.overflow = prevHtmlOverflow;
      body.style.overflow = prevBodyOverflow;
      // Restore scroll on the way out so the user lands where they
      // were on the previous page (Friends list, etc.).
      window.scrollTo(0, prevScrollY);
    };
  }, [messagesView]);

  // Visual viewport tracking — when the iOS keyboard opens, the
  // visual viewport shrinks while the layout viewport (and 100dvh)
  // stays at full screen. That's what produces the cream gap below
  // the input bar: iOS auto-scrolls the focused textarea to the top
  // of the visible band, then the rest of the layout (which extends
  // behind the keyboard) shows through as empty cream above it.
  //
  // Fix: write the keyboard offset (window.innerHeight − vv.height)
  // to a CSS var, and have the messagesView outer wrapper subtract
  // it from its height. The thread column shrinks with the keyboard,
  // the sticky input footer naturally rises with it, and there's no
  // dead band between input and keyboard.
  //
  // visualViewport "scroll" fires on iOS during the rubber-band
  // tween that follows focus — listening to both events keeps the
  // offset in sync through the whole transition.
  useEffect(function () {
    if (!messagesView) return;
    if (typeof window === "undefined" || !window.visualViewport) return;
    var vv = window.visualViewport;
    var html = document.documentElement;
    function syncKbOffset() {
      var kb = Math.max(0, Math.round(window.innerHeight - vv.height));
      html.style.setProperty("--cs-kb-offset", kb + "px");
    }
    syncKbOffset();
    vv.addEventListener("resize", syncKbOffset);
    vv.addEventListener("scroll", syncKbOffset);
    return function () {
      vv.removeEventListener("resize", syncKbOffset);
      vv.removeEventListener("scroll", syncKbOffset);
      html.style.removeProperty("--cs-kb-offset");
    };
  }, [messagesView]);

  if (!authUser) {
    return (
      <div style={{
        background: ED_TOK.bg,
        color:      ED_TOK.ink,
        fontFamily: ED_TOK.sans,
        minHeight:  "calc(100dvh - 64px)",
        padding:    "60px 24px",
        textAlign:  "center",
      }}>
        <div style={{
          fontFamily:    ED_TOK.display,
          fontSize:      "clamp(36px, 9vw, 48px)",
          fontWeight:    600,
          letterSpacing: "-0.03em",
          lineHeight:    1.0,
          color:         ED_TOK.ink,
          marginBottom:  14,
        }}>
          Find your people
        </div>
        <div style={{
          fontSize:   14,
          lineHeight: 1.55,
          color:      ED_TOK.ink2,
          maxWidth:   360,
          margin:     "0 auto 24px",
        }}>
          Connect with other players, follow their results, and build your tennis community.
        </div>
        <button
          onClick={function () { setShowAuth(true); setAuthMode("signup"); setAuthStep("choose"); }}
          style={{
            padding:       "13px 28px",
            borderRadius:  999,
            border:        "1px solid " + ED_TOK.ink,
            background:    ED_TOK.ink,
            color:         ED_TOK.bg,
            fontFamily:    ED_TOK.mono,
            fontSize:      11.5,
            fontWeight:    700,
            letterSpacing: "0.16em",
            textTransform: "uppercase",
            cursor:        "pointer",
          }}>
          Join free
        </button>
      </div>
    );
  }

  var cardProps = {
    t, socialLoading, friendRelationLabel, sentReq, recvReq,
    sendFriendRequest, cancelRequest, acceptRequest, declineRequest,
    unfriend, blockUser, openProfile, openChallenge,
  };
  var dmBadge = (dms ? (dms.requests || []).length : 0)
              + (dms && dms.conversations ? dms.conversations.filter(function (c) { return c.hasUnread; }).length : 0);

  async function handleMessage(u) {
    if (!dms) return;
    navigate("/people/messages");
    var r = await dms.openOrStartConversation(u);
    if (r && r.error && toast) toast(r.error, "error");
  }

  // Whether the Messages component owns the body of the page (conv
  // list view OR an open thread). On those routes the layout is a
  // height-locked flex column: sticky chrome at top (search + sub
  // tabs when no thread, hidden during thread), Messages fills the
  // rest with its own internal scrolling. Locking height + overflow
  // here is what makes "list shorter than viewport doesn't scroll"
  // and "long list scrolls inside the list pane only" both work.
  var messagesView = peopleTab === "messages" && !!dms;

  return (
    <div style={{
      background:    ED_TOK.bg,
      color:         ED_TOK.ink,
      fontFamily:    ED_TOK.sans,
      // Two layout modes:
      //   - Messages view (conv list or thread): height-LOCKED flex
      //     column, overflow:hidden. Internal scroll lives inside
      //     the Messages component (list pane / thread). Document
      //     never scrolls.
      //   - Other tabs (Friends, Requests, Discover, Blocked):
      //     content-sized with a minHeight floor matching the
      //     available viewport so short lists don't force scroll
      //     but long lists still scroll the document naturally.
      ...(messagesView
        ? {
            // --cs-kb-offset is set by the visualViewport effect above
            // when the iOS keyboard is open. Subtracting it shrinks the
            // outer column with the keyboard, so the sticky input footer
            // rises with it instead of leaving a cream gap below.
            height:        "calc(100dvh - var(--cs-nav-h, 0px) - var(--cs-tab-h, 0px) - var(--cs-kb-offset, 0px))",
            overflow:      "hidden",
            display:       "flex",
            flexDirection: "column",
          }
        : {
            minHeight:     "calc(100dvh - var(--cs-nav-h, 0px) - var(--cs-tab-h, 0px))",
            paddingBottom: 96,
          }),
    }}>
      {/* Hero block removed — the global top mob nav already labels
          this surface ("Friends"), and the redundant count was
          competing with the search bar for the eye. */}

      {/* Page chrome — search + sub-tabs sit at the top of the
          flex column. NOT position:sticky any more: the height-
          locked outer wrapper already keeps the chrome in its
          natural top slot via the flex column flow. position:
          sticky inside an overflow:hidden ancestor was cascading
          oddly on iOS Safari — sometimes sticking the chrome to
          the top of the conv-list-pane's scroll context and
          overlapping the first row.
          flexShrink:0 + zIndex:20 retained:
            - flexShrink:0 so the chrome doesn't get squeezed when
              the inner flex:1 child wants more space
            - zIndex:20 so any portaled / fixed descendant of a row
              (avatar stack with z-index 10) can't bleed over the
              chrome during scroll
          Hidden entirely when a Messages thread is open — the
          conversation header is then the page's actual top. */}
      {!threadActive && (
      <div style={{
        flexShrink: 0,
        position:   "relative",
        zIndex:     20,
        background: ED_TOK.bg,
      }}>

      {/* Search — compact editorial input. The dropdown floats below
          it as a flat panel. */}
      <div style={{ padding: "12px 22px 10px", position: "relative" }}>
        <div style={{
          display:      "flex",
          alignItems:   "center",
          gap:          8,
          background:   ED_TOK.bg2,
          border:       "1px solid " + ED_TOK.line,
          borderRadius: 10,
          padding:      "7px 11px",
        }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2"
            style={{ color: ED_TOK.muted, flexShrink: 0 }}>
            <circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>
          </svg>
          <input
            value={peopleSearch}
            placeholder="Search players by name…"
            onChange={function (e) {
              var q = e.target.value;
              setPeopleSearch(q);
              clearTimeout(searchTimer.current);
              if (!q.trim()) { setSearchResults && setSearchResults([]); setShowSearchDrop(false); return; }
              setShowSearchDrop(true);
              searchTimer.current = setTimeout(function () { searchUsers(q); }, 400);
            }}
            onFocus={function () { if (searchResults.length > 0) setShowSearchDrop(true); }}
            onBlur={function () { setTimeout(function () { setShowSearchDrop(false); }, 180); }}
            style={{
              flex:       1,
              minWidth:   0,
              background: "transparent",
              border:     "none",
              outline:    "none",
              fontFamily: ED_TOK.sans,
              fontSize:   13,
              color:      ED_TOK.ink,
            }}/>
          {searchLoading && (
            <span style={{
              fontFamily:    ED_TOK.mono,
              fontSize:      10,
              color:         ED_TOK.muted,
              letterSpacing: "0.16em",
              textTransform: "uppercase",
            }}>…</span>
          )}
        </div>

        {showSearchDrop && peopleSearch.trim() && (
          <div style={{
            position:   "absolute",
            top:        "calc(100% - 4px)",
            left:       22,
            right:      22,
            background: ED_TOK.bg,
            border:     "1px solid " + ED_TOK.line,
            borderRadius: 14,
            boxShadow:  "0 12px 28px rgba(42, 32, 26, 0.16)",
            overflow:   "hidden",
            maxHeight:  340,
            overflowY:  "auto",
            zIndex:     200,
          }}>
            {searchLoading ? (
              <SheetEmpty>Searching…</SheetEmpty>
            ) : searchResults.length === 0 ? (
              <SheetEmpty>No players found for &ldquo;{peopleSearch}&rdquo;</SheetEmpty>
            ) : (
              searchResults.map(function (u) {
                var isFriendU  = friends.some(function (f) { return f.id === u.id; });
                var isPending  = sentRequests.some(function (r) { return r.id === u.id; });
                var isReceived = receivedRequests.some(function (r) { return r.id === u.id; });
                function goToThisProfile() {
                  if (!openProfile) return;
                  setShowSearchDrop(false);
                  openProfile(u.id);
                }
                var rowClickable = !!openProfile;
                return (
                  <div key={u.id} style={{
                    display:      "flex",
                    alignItems:   "center",
                    gap:          12,
                    padding:      "12px 16px",
                    borderBottom: "1px solid " + ED_TOK.line,
                  }}>
                    <div onMouseDown={rowClickable ? goToThisProfile : undefined}
                      style={{ position: "relative", flexShrink: 0, cursor: rowClickable ? "pointer" : "default" }}>
                      <PlayerAvatar name={u.name} avatar={u.avatar} profile={u} size={36}/>
                      <PresenceDot profile={u} t={t} size={9}/>
                    </div>
                    <div onMouseDown={rowClickable ? goToThisProfile : undefined}
                      style={{ flex: 1, minWidth: 0, cursor: rowClickable ? "pointer" : "default" }}>
                      <div style={{
                        fontSize:      14,
                        fontWeight:    600,
                        color:         ED_TOK.ink,
                        whiteSpace:    "nowrap",
                        overflow:      "hidden",
                        textOverflow:  "ellipsis",
                        letterSpacing: "-0.005em",
                      }}>{u.name}</div>
                      <div style={{
                        fontFamily:    ED_TOK.mono,
                        fontSize:      11,
                        color:         ED_TOK.muted,
                        letterSpacing: "0.04em",
                        marginTop:     2,
                      }}>
                        {[u.suburb, u.skill].filter(Boolean).join(" · ")}
                      </div>
                    </div>
                    {isFriendU ? (
                      <span style={{
                        fontFamily:    ED_TOK.mono,
                        fontSize:      10,
                        fontWeight:    700,
                        color:         ED_TOK.accent,
                        letterSpacing: "0.14em",
                        textTransform: "uppercase",
                      }}>Friends</span>
                    ) : isReceived ? (
                      <PillButton variant="solid"
                        onClick={function () { var r = recvReq(u.id); if (r) acceptRequest(r); setShowSearchDrop(false); }}>
                        Accept
                      </PillButton>
                    ) : isPending ? (
                      <PillButton variant="muted"
                        onClick={function () { var r = sentReq(u.id); if (r) cancelRequest(r); }}>
                        Pending
                      </PillButton>
                    ) : (
                      <PillButton variant="solid"
                        onClick={function () { sendFriendRequest(u); }}>
                        Add
                      </PillButton>
                    )}
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>

      {/* Sub-tabs — plain mono uppercase text (no pill chrome). Active
          tab reads in ink, the rest in muted. Order: Messages,
          Discover, Requests. */}
      <div style={{ padding: "0 22px 6px" }}>
        <div style={{
          display:        "flex",
          gap:            22,
          paddingBottom:  10,
          borderBottom:   "1px solid " + ED_TOK.line,
        }}>
          {[
            { id: "messages",  label: "Messages",  count: dmBadge || null },
            { id: "suggested", label: "Discover",  count: null },
            { id: "requests",  label: "Requests",  count: receivedRequests.length + sentRequests.length },
          ].map(function (tb) {
            var on = peopleTab === tb.id;
            return (
              <button key={tb.id}
                onClick={function () { setPeopleTab(tb.id); if (tb.id !== "messages" && dms) dms.closeConversation(); }}
                style={{
                  flex:          "0 0 auto",
                  padding:       0,
                  border:        "none",
                  background:    "transparent",
                  color:         on ? ED_TOK.ink : ED_TOK.muted,
                  fontFamily:    ED_TOK.mono,
                  fontSize:      11,
                  fontWeight:    700,
                  letterSpacing: "0.12em",
                  textTransform: "uppercase",
                  cursor:        "pointer",
                  display:       "inline-flex",
                  alignItems:    "center",
                  gap:           5,
                  whiteSpace:    "nowrap",
                  transition:    "color 140ms ease",
                }}>
                <span>{tb.label}</span>
                {tb.count > 0 && (
                  <span style={{
                    fontSize:          9,
                    fontWeight:        700,
                    color:             ED_TOK.muted,
                    letterSpacing:     "0.04em",
                    fontVariantNumeric:"tabular-nums",
                  }}>·{tb.count}</span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      </div>
      )}{/* /sticky chrome wrapper (search + sub-tabs) */}

      <div
        style={peopleTab === "messages" && dms ? {
          // Messages view body — flex item that takes remaining
          // space inside the height-locked outer flex column. Its
          // child (Messages → cs-dm-root) flexes to fill via flex:1
          // / minHeight:0; overflow:hidden contains any layout slip
          // so the document layer can never scroll.
          padding:       0,
          flex:          1,
          minHeight:     0,
          overflow:      "hidden",
          display:       "flex",
          flexDirection: "column",
        } : { padding: "16px 22px 16px" }}>
        {/* Messages — owns its own layout. */}
        {peopleTab === "messages" && dms && (
          <Messages t={t} authUser={authUser} dms={dms} openProfile={openProfile}/>
        )}

        {/* Friends */}
        {peopleTab === "friends" && (
          friends.length === 0 ? (
            <EmptyState
              title="No friends yet"
              body="Search for players above or check Discover for suggestions."
              cta={{ label: "See suggestions", onClick: function () { setPeopleTab("suggested"); } }}
            />
          ) : (
            <div>
              <SectionHead label={"Friends · " + friends.length}/>
              {friends.map(function (u) {
                return <PlayerCard key={u.id} u={u} {...cardProps} onMessage={handleMessage}/>;
              })}
            </div>
          )
        )}

        {/* Requests */}
        {peopleTab === "requests" && (
          (receivedRequests.length === 0 && sentRequests.length === 0) ? (
            <EmptyState
              title="No pending requests"
              body="When someone adds you, it'll show up here."
            />
          ) : (
            <div>
              {receivedRequests.length > 0 && (
                <div style={{ marginBottom: 26 }}>
                  <SectionHead label={"Received · " + receivedRequests.length}/>
                  {receivedRequests.map(function (u) {
                    var loading = !!socialLoading[u.id];
                    return (
                      <RequestRow
                        key={u.id} u={u} loading={loading} openProfile={openProfile}
                        onMessage={handleMessage}
                        primary={{ label: loading ? "…" : "Accept", onClick: function () { acceptRequest(u); }, variant: "solid" }}
                        secondary={{ label: "Decline", onClick: function () { declineRequest(u); }, variant: "ghost" }}
                        accent
                      />
                    );
                  })}
                </div>
              )}
              {sentRequests.length > 0 && (
                <div>
                  <SectionHead label={"Sent · " + sentRequests.length}/>
                  {sentRequests.map(function (u) {
                    var loading = !!socialLoading[u.id];
                    return (
                      <RequestRow
                        key={u.id} u={u} loading={loading} openProfile={openProfile}
                        meta="Request pending"
                        onMessage={handleMessage}
                        primary={{ label: loading ? "…" : "Cancel", onClick: function () { cancelRequest(u); }, variant: "muted" }}
                      />
                    );
                  })}
                </div>
              )}
            </div>
          )
        )}

        {/* Discover — single ranked list of all non-friends, prioritized
            by same skill (100pts) → same zone (60pts) → shared courts
            (25pts each, cap 3). User feedback: 'Discover — can it just
            show everyone you are not a friend with? Categorize them
            in priority by same level, same zone, same saved courts.' */}
        {peopleTab === "suggested" && (function () {
          var discArr = discoverPlayers || [];
          return (
            <div>
              {discoverLoading && discArr.length === 0 && (
                <div style={{ padding: "60px 20px", textAlign: "center", color: ED_TOK.ink2, fontSize: 13 }}>
                  Loading players…
                </div>
              )}
              {!discoverLoading && discArr.length === 0 && (
                <EmptyState
                  title="No suggestions yet"
                  body="Log a match or check back as more players join."
                />
              )}
              {discArr.length > 0 && (
                <DiscoverSection
                  label={"People you can play · " + discArr.length}
                  hint="Ranked by same level, same zone, then shared courts.">
                  {discArr.map(function (u) {
                    return (
                      <PlayerCard
                        key={u.id}
                        u={u}
                        {...cardProps}
                        onMessage={handleMessage}
                        matchReasons={u._matchReasons}/>
                    );
                  })}
                </DiscoverSection>
              )}

              {/* Invite friends — flat editorial callout. */}
              <div style={{
                marginTop:     30,
                padding:       "20px 18px",
                background:    ED_TOK.bg2,
                border:        "1px solid " + ED_TOK.line,
                borderRadius:  16,
                textAlign:     "center",
              }}>
                <div style={{
                  fontFamily:    ED_TOK.display,
                  fontSize:      18,
                  fontWeight:    600,
                  letterSpacing: "-0.015em",
                  color:         ED_TOK.ink,
                  marginBottom:  4,
                }}>
                  Invite friends
                </div>
                <div style={{
                  fontSize:   13,
                  color:      ED_TOK.ink2,
                  lineHeight: 1.5,
                  marginBottom: 14,
                }}>
                  Share CourtSync with people you play with.
                </div>
                <button
                  onClick={function () {
                    var url = "https://rarired.vercel.app";
                    if (navigator.share) navigator.share({ title: "Join CourtSync", text: "Track your tennis matches and compete in tournaments.", url: url });
                    else { navigator.clipboard.writeText(url); alert("Link copied!"); }
                  }}
                  style={{
                    padding:       "10px 20px",
                    borderRadius:  999,
                    border:        "1px solid " + ED_TOK.ink,
                    background:    ED_TOK.ink,
                    color:         ED_TOK.bg,
                    fontFamily:    ED_TOK.mono,
                    fontSize:      11,
                    fontWeight:    700,
                    letterSpacing: "0.16em",
                    textTransform: "uppercase",
                    cursor:        "pointer",
                  }}>
                  Share invite link
                </button>
              </div>
            </div>
          );
        })()}

        {/* Blocked */}
        {peopleTab === "blocked" && (
          blockedUsers.length === 0 ? (
            <EmptyState
              title="No blocked players"
              body="Players you block won't appear in search, suggestions, or your map."
            />
          ) : (
            <div>
              <SectionHead label={"Blocked · " + blockedUsers.length}/>
              {blockedUsers.map(function (u) {
                return (
                  <div key={u.id} style={{
                    display:      "flex",
                    alignItems:   "center",
                    gap:          12,
                    padding:      "14px 4px",
                    borderBottom: "1px solid " + ED_TOK.line,
                    fontFamily:   ED_TOK.sans,
                  }}>
                    <div style={{
                      width:           44,
                      height:          44,
                      borderRadius:    "50%",
                      background:      ED_TOK.bg2,
                      border:          "1px solid " + ED_TOK.line,
                      display:         "flex",
                      alignItems:      "center",
                      justifyContent:  "center",
                      fontFamily:      ED_TOK.mono,
                      fontSize:        13,
                      fontWeight:      700,
                      color:           ED_TOK.muted,
                      flexShrink:      0,
                    }}>
                      {(u.avatar || u.name || "?").slice(0, 2).toUpperCase()}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{
                        fontSize:      14,
                        fontWeight:    600,
                        color:         ED_TOK.ink2,
                        letterSpacing: "-0.005em",
                      }}>{u.name}</div>
                      {u.suburb && (
                        <div style={{
                          fontFamily:    ED_TOK.mono,
                          fontSize:      11,
                          color:         ED_TOK.muted,
                          marginTop:     3,
                          letterSpacing: "0.04em",
                        }}>{u.suburb}</div>
                      )}
                    </div>
                    <PillButton variant="ghost" onClick={function () { unblockUser(u); }}>
                      Unblock
                    </PillButton>
                  </div>
                );
              })}
            </div>
          )
        )}
      </div>
    </div>
  );
}

// ── Editorial helpers ─────────────────────────────────────────────

function MicroEyebrow({ label }) {
  return (
    <div style={{
      fontFamily:    ED_TOK.mono,
      fontSize:      10.5,
      fontWeight:    700,
      letterSpacing: "0.16em",
      textTransform: "uppercase",
      color:         ED_TOK.muted,
    }}>
      {label}
    </div>
  );
}

function SectionHead({ label }) {
  return (
    <div style={{
      fontFamily:    ED_TOK.mono,
      fontSize:      10,
      fontWeight:    700,
      color:         ED_TOK.muted,
      textTransform: "uppercase",
      letterSpacing: "0.14em",
      marginBottom:  4,
      paddingTop:    4,
    }}>
      {label}
    </div>
  );
}

function DiscoverSection({ label, hint, children }) {
  return (
    <div style={{ marginBottom: 26 }}>
      <SectionHead label={label}/>
      <div style={{
        fontSize:   12.5,
        color:      ED_TOK.ink2,
        marginBottom: 8,
        lineHeight: 1.5,
      }}>
        {hint}
      </div>
      {children}
    </div>
  );
}

function SheetEmpty({ children }) {
  return (
    <div style={{
      padding:       "20px 18px",
      textAlign:     "center",
      fontFamily:    ED_TOK.sans,
      fontSize:      13,
      color:         ED_TOK.muted,
    }}>
      {children}
    </div>
  );
}

function EmptyState({ title, body, cta }) {
  return (
    <div style={{ textAlign: "center", padding: "48px 18px 24px" }}>
      <div style={{
        fontFamily:    ED_TOK.display,
        fontSize:      "clamp(22px, 5vw, 28px)",
        fontWeight:    600,
        letterSpacing: "-0.02em",
        color:         ED_TOK.ink,
        marginBottom:  8,
      }}>
        {title}
      </div>
      <div style={{
        fontSize:   13.5,
        color:      ED_TOK.ink2,
        lineHeight: 1.55,
        marginBottom: cta ? 18 : 0,
        maxWidth:   360,
        margin:     cta ? "0 auto 18px" : "0 auto",
      }}>
        {body}
      </div>
      {cta && (
        <button onClick={cta.onClick} style={{
          padding:       "10px 20px",
          borderRadius:  999,
          border:        "1px solid " + ED_TOK.ink,
          background:    ED_TOK.ink,
          color:         ED_TOK.bg,
          fontFamily:    ED_TOK.mono,
          fontSize:      11,
          fontWeight:    700,
          letterSpacing: "0.16em",
          textTransform: "uppercase",
          cursor:        "pointer",
        }}>
          {cta.label}
        </button>
      )}
    </div>
  );
}

// Request row — flat hairline, accent-tagged when it's an incoming
// request (visual call-out without a heavy border-left bar).
function RequestRow({ u, loading, openProfile, onMessage, meta, primary, secondary, accent }) {
  return (
    <div style={{
      display:      "flex",
      alignItems:   "center",
      gap:          12,
      padding:      "14px 4px",
      borderBottom: "1px solid " + ED_TOK.line,
      fontFamily:   ED_TOK.sans,
      position:     "relative",
    }}>
      {accent && (
        <span style={{
          position:     "absolute",
          left:         -12,
          top:          18,
          bottom:       18,
          width:        3,
          borderRadius: 2,
          background:   ED_TOK.accent,
        }}/>
      )}
      <div
        onClick={openProfile ? function () { openProfile(u.id); } : undefined}
        style={{ flexShrink: 0, cursor: openProfile ? "pointer" : "default" }}>
        <PlayerAvatar name={u.name} avatar={u.avatar} profile={u} size={44}/>
      </div>
      <div
        onClick={openProfile ? function () { openProfile(u.id); } : undefined}
        style={{ flex: 1, minWidth: 0, cursor: openProfile ? "pointer" : "default" }}>
        <div style={{
          fontSize:      14.5,
          fontWeight:    600,
          color:         ED_TOK.ink,
          letterSpacing: "-0.005em",
        }}>{u.name}</div>
        <div style={{
          fontFamily:    ED_TOK.mono,
          fontSize:      11,
          color:         ED_TOK.muted,
          marginTop:     4,
          letterSpacing: "0.04em",
        }}>
          {[u.suburb, u.skill].filter(Boolean).join(" · ") || (meta || "")}
        </div>
        {meta && (u.suburb || u.skill) && (
          <div style={{
            fontFamily:    ED_TOK.mono,
            fontSize:      10,
            color:         ED_TOK.muted,
            marginTop:     3,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
          }}>
            {meta}
          </div>
        )}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
        {onMessage && (
          <PillButton variant="ghost" onClick={function () { onMessage(u); }}>
            Message
          </PillButton>
        )}
        {primary && (
          <PillButton variant={primary.variant || "solid"} disabled={loading} onClick={primary.onClick}>
            {primary.label}
          </PillButton>
        )}
        {secondary && (
          <PillButton variant={secondary.variant || "ghost"} disabled={loading} onClick={secondary.onClick}>
            {secondary.label}
          </PillButton>
        )}
      </div>
    </div>
  );
}
