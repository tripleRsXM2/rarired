// src/features/home/components/FeedInteractionsModal.jsx
//
// Strava-style Kudos / Comments list modal. Centred dialog (matches the
// ScoreModal / ChallengeModal / ReviewDrawer chrome).
//
// Why this exists: the feed card needs to reinforce CourtSync as a graph,
// not just a bulletin board. Every person who interacts with a match should
// be one tap away from adding them as a friend or opening their profile.
//
// Triggers (from HomeTab):
//   - tap "N likes"     → open on kudos tab
//   - tap "M comments"  → open on comments tab
//   - tap 💬 icon       → open on comments tab
//   - tap 👍 icon       → still just toggles the like (not this modal)

import { useEffect, useState } from "react";
import { supabase } from "../../../lib/supabase.js";
import { avColor } from "../../../lib/utils/avatar.js";
import { inputStyle } from "../../../lib/theme.js";
import { fetchMatchLikers } from "../services/feedService.js";

function Avatar({ profile, size }) {
  var s = size || 40;
  if (profile && profile.avatar_url) {
    return (
      <div style={{
        width: s, height: s, borderRadius: "50%", overflow: "hidden",
        flexShrink: 0, background: "#eee",
      }}>
        <img src={profile.avatar_url} alt="" style={{ width: s, height: s, objectFit: "cover", display: "block" }}/>
      </div>
    );
  }
  var name = (profile && profile.name) || "?";
  return (
    <div style={{
      width: s, height: s, borderRadius: "50%", flexShrink: 0,
      background: avColor(name),
      display: "flex", alignItems: "center", justifyContent: "center",
      fontSize: s * 0.32, fontWeight: 700, color: "#fff",
    }}>
      {name.slice(0, 2).toUpperCase()}
    </div>
  );
}

function RelationButton({ t, u, viewerId, friendRelationLabel, sendFriendRequest, cancelRequest, sentReq, recvReq, acceptRequest, socialLoading }) {
  if (!viewerId || u.id === viewerId) return null; // no button on self
  var rel = friendRelationLabel ? friendRelationLabel(u.id) : "none";
  var loading = !!(socialLoading && socialLoading[u.id]);
  var base = {
    padding: "6px 14px", borderRadius: 8,
    fontSize: 12, fontWeight: 700, letterSpacing: "0.01em",
    border: "1px solid " + t.accent, background: "transparent", color: t.accent,
    cursor: "pointer", opacity: loading ? 0.6 : 1,
    whiteSpace: "nowrap",
  };
  if (rel === "friends") {
    return <span style={Object.assign({}, base, { border: "1px solid " + t.border, color: t.textSecondary, fontWeight: 500, cursor: "default" })}>Friends ✓</span>;
  }
  if (rel === "sent") {
    return (
      <button disabled={loading} onClick={function () { var r = sentReq && sentReq(u.id); if (r) cancelRequest(r); }}
        style={Object.assign({}, base, { border: "1px solid " + t.border, color: t.textSecondary, fontWeight: 500 })}>
        {loading ? "…" : "Pending"}
      </button>
    );
  }
  if (rel === "received") {
    return (
      <button disabled={loading} onClick={function () { var r = recvReq && recvReq(u.id); if (r) acceptRequest(r); }}
        style={Object.assign({}, base, { border: "none", background: t.accent, color: "#fff" })}>
        {loading ? "…" : "Accept"}
      </button>
    );
  }
  // rel === "none"
  return (
    <button disabled={loading || !sendFriendRequest} onClick={function () { sendFriendRequest && sendFriendRequest(u); }}
      style={Object.assign({}, base, { border: "none", background: t.accent, color: "#fff" })}>
      {loading ? "…" : "Follow"}
    </button>
  );
}

export default function FeedInteractionsModal({
  t, modal, onClose,
  authUser, profile,
  // comments data + actions (replaces old CommentModal)
  feedComments, setFeedComments,
  commentDraft, setCommentDraft,
  onCommentPosted,
  // friend-graph actions
  openProfile,
  friendRelationLabel, sendFriendRequest, cancelRequest, acceptRequest,
  sentReq, recvReq, socialLoading,
  // optional: like state so Give Kudos works from inside the modal
  liked, onToggleLike,
}) {
  var [tab, setTab] = useState("kudos");
  var [likers, setLikers] = useState(null); // null = not loaded
  var [likersLoading, setLikersLoading] = useState(false);
  var iStyle = inputStyle(t);

  // Sync tab to the caller's requested tab each time modal opens with a new match.
  useEffect(function () {
    if (!modal) return;
    setTab(modal.tab || "kudos");
  }, [modal && modal.matchId, modal && modal.tab]);

  // Load likers on open + whenever the match changes.
  useEffect(function () {
    if (!modal || !modal.matchId) return;
    setLikers(null); setLikersLoading(true);
    fetchMatchLikers(modal.matchId).then(function (r) {
      setLikers(r.data || []);
      setLikersLoading(false);
    });
  }, [modal && modal.matchId]);

  if (!modal) return null;
  var comments = (feedComments && feedComments[modal.matchId]) || [];

  async function postComment() {
    var text = (commentDraft || "").trim();
    if (!text || !authUser) return;
    setCommentDraft("");
    var tempId = "c" + Date.now();
    var c = { id: tempId, author: profile.name, avatar: profile.avatar, text: text, ts: Date.now() };
    setFeedComments(function (fc) { var cur = fc[modal.matchId] || []; return Object.assign({}, fc, { [modal.matchId]: cur.concat([c]) }); });
    var res = await supabase.from("feed_comments").insert({ match_id: modal.matchId, user_id: authUser.id, body: text }).select("id").single();
    if (res.data) {
      setFeedComments(function (fc) {
        var cur = (fc[modal.matchId] || []).map(function (x) { return x.id === tempId ? Object.assign({}, x, { id: res.data.id }) : x; });
        return Object.assign({}, fc, { [modal.matchId]: cur });
      });
      if (onCommentPosted) onCommentPosted(modal.matchId);
    }
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 220,
        background: "rgba(0,0,0,0.45)",
        backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: "0 16px",
      }}
    >
      <div
        onClick={function (e) { e.stopPropagation(); }}
        className="pop"
        style={{
          background: t.modalBg, border: "1px solid " + t.border,
          borderRadius: 0, width: "100%", maxWidth: 520,
          maxHeight: "86vh", display: "flex", flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {/* Header: close button + tab pills */}
        <div style={{ display: "flex", alignItems: "center", padding: "10px 12px", borderBottom: "1px solid " + t.border }}>
          <div style={{ display: "flex", gap: 4, flex: 1 }}>
            {[
              { id: "kudos",    label: "Kudos",    count: likers ? likers.length : null },
              { id: "comments", label: "Comments", count: comments.length },
            ].map(function (tb) {
              var on = tab === tb.id;
              return (
                <button key={tb.id} onClick={function () { setTab(tb.id); }}
                  style={{
                    padding: "8px 14px", border: "none",
                    background: on ? t.accentSubtle : "transparent",
                    color: on ? t.accent : t.textSecondary,
                    fontSize: 13, fontWeight: on ? 700 : 500,
                    cursor: "pointer", letterSpacing: "-0.1px",
                    borderRadius: 0,
                  }}>
                  {tb.label}{tb.count !== null && tb.count !== undefined ? " (" + tb.count + ")" : ""}
                </button>
              );
            })}
          </div>
          <button onClick={onClose}
            style={{ background: "none", border: "none", color: t.textTertiary, fontSize: 20, padding: "4px 8px", lineHeight: 1, cursor: "pointer" }}>×</button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: "auto" }}>
          {tab === "kudos" && (
            <div style={{ padding: "4px 0" }}>
              {likersLoading && (
                <div style={{ padding: "24px 16px", textAlign: "center", color: t.textTertiary, fontSize: 13 }}>Loading…</div>
              )}
              {!likersLoading && likers && likers.length === 0 && (
                <div style={{ padding: "36px 16px", textAlign: "center" }}>
                  <div style={{ fontSize: 28, marginBottom: 8 }}>👍</div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: t.text, marginBottom: 4 }}>No kudos yet</div>
                  <div style={{ fontSize: 12, color: t.textTertiary }}>Be the first to give kudos!</div>
                  {onToggleLike && authUser && !liked && (
                    <button onClick={onToggleLike}
                      style={{ marginTop: 14, padding: "10px 22px", borderRadius: 8, border: "none", background: t.accent, color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                      Give kudos
                    </button>
                  )}
                </div>
              )}
              {!likersLoading && likers && likers.length > 0 && likers.map(function (row) {
                var u = row.profile;
                var canOpen = !!openProfile && !!u.id;
                return (
                  <div key={u.id}
                    style={{
                      display: "flex", alignItems: "center", gap: 12,
                      padding: "12px 16px",
                      borderBottom: "1px solid " + t.border,
                    }}>
                    <div onClick={canOpen ? function () { onClose(); openProfile(u.id); } : undefined}
                      style={{ cursor: canOpen ? "pointer" : "default", flexShrink: 0 }}>
                      <Avatar profile={u} size={40}/>
                    </div>
                    <div onClick={canOpen ? function () { onClose(); openProfile(u.id); } : undefined}
                      style={{ flex: 1, minWidth: 0, cursor: canOpen ? "pointer" : "default" }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: t.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{u.name}</div>
                      <div style={{ fontSize: 12, color: t.textTertiary, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {[u.suburb, u.skill].filter(Boolean).join(" · ") || "New player"}
                      </div>
                    </div>
                    <RelationButton
                      t={t} u={u}
                      viewerId={authUser && authUser.id}
                      friendRelationLabel={friendRelationLabel}
                      sendFriendRequest={sendFriendRequest}
                      cancelRequest={cancelRequest}
                      acceptRequest={acceptRequest}
                      sentReq={sentReq}
                      recvReq={recvReq}
                      socialLoading={socialLoading}
                    />
                  </div>
                );
              })}
            </div>
          )}

          {tab === "comments" && (
            <div style={{ padding: "4px 0" }}>
              {comments.length === 0 && (
                <div style={{ padding: "36px 16px", textAlign: "center" }}>
                  <div style={{ fontSize: 28, marginBottom: 8 }}>💬</div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: t.text, marginBottom: 4 }}>No comments yet</div>
                  <div style={{ fontSize: 12, color: t.textTertiary }}>Start the conversation.</div>
                </div>
              )}
              {comments.map(function (c) {
                return (
                  <div key={c.id} style={{
                    display: "flex", gap: 10, alignItems: "flex-start",
                    padding: "10px 16px",
                    borderBottom: "1px solid " + t.border,
                  }}>
                    <div style={{
                      width: 32, height: 32, borderRadius: "50%",
                      background: avColor(c.author || "?"),
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 11, fontWeight: 700, color: "#fff", flexShrink: 0,
                    }}>{(c.author || "?").slice(0, 2).toUpperCase()}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: t.text }}>{c.author}</div>
                      <div style={{ fontSize: 13, color: t.textSecondary, lineHeight: 1.45, marginTop: 1 }}>{c.text}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer — comment composer (only when comments tab + signed in) */}
        {tab === "comments" && authUser && (
          <div style={{ padding: "10px 12px", borderTop: "1px solid " + t.border, display: "flex", gap: 8, alignItems: "center" }}>
            <div style={{ width: 28, height: 28, borderRadius: "50%", background: avColor(profile && profile.name), display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700, color: "#fff", flexShrink: 0 }}>
              {(profile && profile.avatar) || ((profile && profile.name) || "?").slice(0, 2).toUpperCase()}
            </div>
            <input
              value={commentDraft}
              placeholder="Add a comment…"
              onChange={function (e) { setCommentDraft(e.target.value); }}
              onKeyDown={function (e) { if (e.key === "Enter") postComment(); }}
              style={Object.assign({}, iStyle, { flex: 1, fontSize: 13, padding: "8px 12px", marginBottom: 0 })}
            />
            <button onClick={postComment}
              style={{ padding: "8px 14px", border: "none", background: t.accent, color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer", flexShrink: 0 }}>
              Post
            </button>
          </div>
        )}

        {/* Footer — Give Kudos CTA (kudos tab, if viewer hasn't liked yet) */}
        {tab === "kudos" && authUser && !liked && onToggleLike && likers && likers.length > 0 && (
          <div style={{ padding: "10px 12px", borderTop: "1px solid " + t.border }}>
            <button onClick={onToggleLike}
              style={{ width: "100%", padding: "10px", border: "none", background: t.accent, color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
              Give kudos
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
