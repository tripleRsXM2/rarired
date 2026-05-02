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
        <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
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
          <PresenceLabel profile={u} t={t} style={{ flexShrink: 0 }}/>
        </div>
        {/* Stats stripped per design ask — the row now shows name +
            presence only. Suburb / skill / wins / rating points all
            still live on the friend's full profile (tap to open). */}
      </div>

      <div style={{
        display:        "flex",
        alignItems:     "center",
        gap:            6,
        flexShrink:     0,
        position:       "relative",
      }}>
        {onMessage && (
          <PillButton variant="ghost" onClick={function () { onMessage(u); }}>
            Message
          </PillButton>
        )}
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
        {rel === "friends" && openChallenge && (
          <PillButton
            variant="ghost"
            onClick={function () { openChallenge(u, "profile"); }}
            iconLeft={NAV_ICONS.rematch(13)}>
            Challenge
          </PillButton>
        )}

        {rel === "friends" ? (
          <div style={{ position: "relative" }}>
            <button
              onClick={function (e) { e.stopPropagation(); setMenuOpen(!menuOpen); }}
              aria-label="More actions"
              title="More actions"
              style={{
                width:        30,
                height:       30,
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
                  minWidth:     160,
                  background:   ED_TOK.bg,
                  border:       "1px solid " + ED_TOK.line,
                  borderRadius: 12,
                  boxShadow:    "0 12px 28px rgba(42, 32, 26, 0.18)",
                  overflow:     "hidden",
                  zIndex:       60,
                }}>
                  <button disabled={loading}
                    onClick={function () {
                      setMenuOpen(false);
                      if (window.confirm("Unfriend " + u.name + "?")) unfriend(u);
                    }}
                    style={menuItemStyle(ED_TOK.ink)}>
                    Unfriend
                  </button>
                  <div style={{ height: 1, background: ED_TOK.line }}/>
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
        ) : (
          <button
            onClick={function () { blockUser(u); }}
            style={{
              padding:       "5px 10px",
              borderRadius:  999,
              border:        "1px solid " + ED_TOK.line,
              background:    "transparent",
              color:         ED_TOK.muted,
              fontFamily:    ED_TOK.mono,
              fontSize:      9.5,
              fontWeight:    700,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              cursor:        "pointer",
            }}>
            Block
          </button>
        )}
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

  // Lock document-level scroll while a chat thread is open. The
  // messages list owns its own internal overflow:auto and the input
  // footer is sticky-pinned to the bottom — anything happening at
  // the document layer (iOS rubber-band, ancestor scrollers, stray
  // overflow from any sibling) just produces phantom drift in the
  // thread. Toggle html + body overflow:hidden + position:fixed for
  // the duration of the takeover; restore on exit.
  useEffect(function () {
    if (!threadActive) return;
    if (typeof document === "undefined") return;
    var html = document.documentElement;
    var body = document.body;
    var prevHtmlOverflow = html.style.overflow;
    var prevBodyOverflow = body.style.overflow;
    var prevBodyPosition = body.style.position;
    var prevBodyWidth    = body.style.width;
    html.style.overflow = "hidden";
    body.style.overflow = "hidden";
    // position:fixed + width:100% guards against iOS Safari scrolling
    // the body anyway when content is visually below the viewport
    // (the dvh-vs-svh inconsistency on the address-bar transition).
    body.style.position = "fixed";
    body.style.width    = "100%";
    return function () {
      html.style.overflow = prevHtmlOverflow;
      body.style.overflow = prevBodyOverflow;
      body.style.position = prevBodyPosition;
      body.style.width    = prevBodyWidth;
    };
  }, [threadActive]);

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

  return (
    <div style={{
      background:    ED_TOK.bg,
      color:         ED_TOK.ink,
      fontFamily:    ED_TOK.sans,
      // minHeight = available viewport minus the global top mob nav
      // AND the bottom tab bar. Hardcoded "100dvh - 64px" was wrong:
      // on a notched iPhone the actual top nav is ~99px (52 + safe-
      // area-inset-top) and the tab bar is ~78px, so the wrapper was
      // sized 113px taller than the available space. Combined with
      // the cs-mob-nav above it, total page height exceeded 100dvh
      // by ~35px, forcing the page to scroll even when content fit.
      // Using --cs-nav-h + --cs-tab-h keeps the wrapper exactly the
      // size of the available viewport — no scroll on short lists.
      //
      // When the chat thread takes over (threadActive), drop the
      // minHeight + paddingBottom entirely — cs-dm-root sizes itself
      // and the input bar handles env(safe-area-inset-bottom).
      minHeight:     threadActive ? undefined : "calc(100dvh - var(--cs-nav-h, 0px) - var(--cs-tab-h, 0px))",
      paddingBottom: threadActive ? 0 : 96,
    }}>
      {/* Hero block removed — the global top mob nav already labels
          this surface ("Friends"), and the redundant count was
          competing with the search bar for the eye. */}

      {/* Sticky chrome — search + sub-tabs stay pinned to the top of
          the viewport (just under the global top mob nav) while the
          list below scrolls. Single sticky wrapper so search and
          sub-tabs move as one block; background paints over scrolling
          content so nothing bleeds through.
          Hidden when a Messages thread is open on mobile — the
          conversation header is then the page's actual top, so the
          search + sub-tabs would just be redundant chrome above it. */}
      {!threadActive && (
      <div style={{
        position:   "sticky",
        top:        "var(--cs-nav-h, 0px)",
        // z-index needs to clear AvatarStack (which sets zIndex:10-idx
        // on stacked group avatars in the conv list rows below) so a
        // group conv's avatar pile doesn't bleed through the sticky
        // chrome when the list scrolls under it. 20 is comfortably
        // above the 10-cap on AvatarStack and below the modal scrim
        // tier (200+).
        zIndex:     20,
        background: ED_TOK.bg,
      }}>

      {/* Search — editorial pill input, replaces the boxed legacy
          search bar. The dropdown floats below it as a flat panel. */}
      <div style={{ padding: "20px 22px 14px", position: "relative" }}>
        <div style={{
          display:      "flex",
          alignItems:   "center",
          gap:          10,
          background:   ED_TOK.bg2,
          border:       "1px solid " + ED_TOK.line,
          borderRadius: 14,
          padding:      "12px 14px",
        }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2"
            style={{ color: ED_TOK.muted }}>
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
              background: "transparent",
              border:     "none",
              outline:    "none",
              fontFamily: ED_TOK.sans,
              fontSize:   14.5,
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

      {/* Sub-tabs — mono uppercase chip row. Each chip sizes to its
          full label (no auto-shrink), and the row scrolls horizontally
          when the total exceeds the viewport. The legacy flex:1 1 0 +
          min-width:0 layout fit all five into one line by truncating
          each label to "MESSAG…" / "REQUES…" — readable on a 320px
          phone but unreadable as labels. Single-line + horizontal
          scroll is the standard mobile pattern (iOS Mail, Slack,
          Twitter) and was already in use earlier in this page's
          legacy version (overflowX:auto on the chip container). */}
      <div style={{ padding: "0 22px 6px" }}>
        <div style={{
          display:        "flex",
          gap:            6,
          paddingBottom:  10,
          borderBottom:   "1px solid " + ED_TOK.line,
          overflowX:      "auto",
          overflowY:      "hidden",
          // Hide the scrollbar on Firefox / old Safari while keeping
          // the row scrollable. WebKit scrollbar styling is global
          // (see providers.jsx ::-webkit-scrollbar { width:0 }).
          scrollbarWidth: "none",
          // Inertial scroll on iOS so the chip row swipes smoothly.
          WebkitOverflowScrolling: "touch",
        }}>
          {[
            { id: "messages",  label: "Messages",  count: dmBadge || null },
            { id: "friends",   label: "Friends",   count: friends.length },
            { id: "requests",  label: "Requests",  count: receivedRequests.length + sentRequests.length },
            { id: "suggested", label: "Discover",  count: null },
            { id: "blocked",   label: "Blocked",   count: blockedUsers.length || null },
          ].map(function (tb) {
            var on = peopleTab === tb.id;
            return (
              <button key={tb.id}
                onClick={function () { setPeopleTab(tb.id); if (tb.id !== "messages" && dms) dms.closeConversation(); }}
                style={{
                  flex:          "0 0 auto",   // size to label, no shrink
                  padding:       "8px 14px",
                  borderRadius:  999,
                  border:        "1px solid " + (on ? ED_TOK.ink : ED_TOK.line),
                  background:    on ? ED_TOK.ink : "transparent",
                  color:         on ? ED_TOK.bg : ED_TOK.ink,
                  fontFamily:    ED_TOK.mono,
                  fontSize:      10,
                  fontWeight:    700,
                  letterSpacing: "0.14em",
                  textTransform: "uppercase",
                  cursor:        "pointer",
                  display:       "inline-flex",
                  alignItems:    "center",
                  justifyContent:"center",
                  gap:           6,
                  whiteSpace:    "nowrap",
                  transition:    "background 140ms ease, color 140ms ease, border-color 140ms ease",
                }}>
                <span>{tb.label}</span>
                {tb.count > 0 && (
                  <span style={{
                    fontSize:          9,
                    fontWeight:        700,
                    color:             on ? ED_TOK.bg : ED_TOK.muted,
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
        style={peopleTab === "messages" && dms ? { padding: 0 } : { padding: "16px 22px 16px" }}>
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

        {/* Discover */}
        {peopleTab === "suggested" && (function () {
          var playedArr = playedOpponents || [];
          var suburbArr = suggestedPlayers || [];
          var skillArr  = sameSkillPlayers  || [];
          var allEmpty  = !playedArr.length && !suburbArr.length && !skillArr.length;
          return (
            <div>
              {allEmpty && (
                <EmptyState
                  title="No suggestions yet"
                  body="Log a match or check back as more players join your area."
                />
              )}
              {playedArr.length > 0 && (
                <DiscoverSection
                  label={"People you've played · " + playedArr.length}
                  hint="Opponents from confirmed matches — add them to your friends.">
                  {playedArr.map(function (u) {
                    return <PlayerCard key={u.id} u={u} {...cardProps} onMessage={handleMessage}/>;
                  })}
                </DiscoverSection>
              )}
              {suburbArr.length > 0 && (
                <DiscoverSection
                  label={"Players near you · " + suburbArr.length}
                  hint="Same suburb as your profile.">
                  {suburbArr.map(function (u) {
                    return <PlayerCard key={u.id} u={u} {...cardProps} onMessage={handleMessage}/>;
                  })}
                </DiscoverSection>
              )}
              {skillArr.length > 0 && (
                <DiscoverSection
                  label={"Similar skill level · " + skillArr.length}
                  hint="Players with the same declared level as you.">
                  {skillArr.map(function (u) {
                    return <PlayerCard key={u.id} u={u} {...cardProps} onMessage={handleMessage}/>;
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
