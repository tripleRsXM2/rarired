// NewMessageScreen — ported from the Anthropic Design "tennis score
// sheet logger and timer" handoff (screens-messages.jsx → NewMessageScreen).
//
// Visual structure preserved verbatim (header, To: chip input, sectioned
// contact directory, scroll list, shortcut row, send composer). The
// design's seed data is replaced with real Supabase data:
//   - Recent: counterparties of the viewer's latest 1:1 conversations
//   - Friends: viewer's accepted friend graph
//   - Everyone: full directory of non-friends (RLS-bounded by
//     profiles policy)
//   - Groups: viewer's existing group threads
//
// Multi-select pathway:
//   - exactly 1 contact → dms.openConversationWith(partner) → 1:1 draft
//     conv → set activeConvoId to draft.id → MessagesScreen routes
//     into ThreadScreen
//   - 2+ contacts → dms.openConversationWith([partners]) → group conv
//     created via create_group_conversation RPC → same routing
//
// Shortcut row (Match invite / Send score / Confirm score / GIF) is
// rendered as visual-only for now. The auto-emit hooks in submitMatch
// + sendChallenge land widget cards into threads automatically; the
// shortcut buttons here are reserved for PR3 work on the widgets branch.

import React from "react";
import { avColor, initials as deriveInitials } from "../../../lib/utils/avatar.js";
import { convTitle } from "./v2MessageAdapter.js";

// Color helper — same deterministic per-name color used elsewhere.
function avatarColor(name) {
  return avColor(name || "?");
}
function avatarInitials(name) {
  return deriveInitials(name || "?");
}

function Avatar({ size = 40, c }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: "50%", background: c.color,
      display: "flex", alignItems: "center", justifyContent: "center",
      color: "#fbf6e9", fontFamily: "Inter", fontWeight: 600, fontSize: size * 0.36,
      flexShrink: 0, letterSpacing: "0.02em",
      overflow: "hidden",
    }}>
      {c.avatar_url
        ? <img src={c.avatar_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }}/>
        : c.initials}
    </div>
  );
}

export default function NewMessageScreen({
  theme, accent, onBack, onPickContact, isPhone = true,
  // Real-data props
  conversations,         // V1 dms.conversations (already enriched)
  friends,               // V1 useDMs friends (or v2Friends.friends)
  everyonePlayers,       // social.discoverPlayers — full non-friend directory
  meId,                  // viewer's user id
  onPickGroup,           // (partnerArray) => Promise — caller does dms.openConversationWith([...]) and returns the new conv id
}) {
  const [q, setQ] = React.useState("");
  const [selected, setSelected] = React.useState([]);
  const [draft, setDraft] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState("");

  // ── Build the directory from real data ──────────────────────────
  const directory = React.useMemo(function () {
    var blockedConvCounterparties = {}; // id → in-directory flag, dedupe across sections
    var dedupe = function (id) { return !!blockedConvCounterparties[id]; };
    var mark = function (id) { blockedConvCounterparties[id] = true; };

    var sections = [];

    // Recent — non-self counterparties from accepted 1:1 conversations,
    // sorted by last_message_at desc. Limit 6 to keep the section tight.
    var recent = (conversations || [])
      .filter(function (c) { return !c.isGroup && c.partner && c.partner.id && c.partner.id !== meId; })
      .slice(0, 6)
      .map(function (c) {
        return {
          id: c.partner.id,
          name: c.partner.name || "Player",
          sub: (c.partner.skill || c.partner.suburb || "Recent"),
          initials: avatarInitials(c.partner.name),
          color: avatarColor(c.partner.name),
          avatar_url: c.partner.avatar_url || null,
          activeNow: false,
        };
      });
    recent.forEach(function (r) { mark(r.id); });
    if (recent.length) sections.push({ section: "Recent", contacts: recent });

    // Friends — accepted friend graph, excluding anyone already in Recent.
    var friendsList = (friends || [])
      .filter(function (f) { return f && f.id && f.id !== meId && !dedupe(f.id); })
      .map(function (f) {
        return {
          id: f.id,
          name: f.name || "Player",
          sub: f.skill || f.suburb || "Friend",
          initials: avatarInitials(f.name),
          color: avatarColor(f.name),
          avatar_url: f.avatar_url || null,
          activeNow: false,
        };
      });
    friendsList.forEach(function (f) { mark(f.id); });
    if (friendsList.length) sections.push({ section: "Friends", contacts: friendsList });

    // Everyone — directory-wide non-friends, excluding everyone already
    // surfaced above. Same data the Discover tab + opponent picker use.
    var everyone = (everyonePlayers || [])
      .filter(function (p) { return p && p.id && p.id !== meId && !dedupe(p.id); })
      .map(function (p) {
        return {
          id: p.id,
          name: p.name || "Player",
          sub: p.skill || p.suburb || "On CourtSync",
          initials: avatarInitials(p.name),
          color: avatarColor(p.name),
          avatar_url: p.avatar_url || null,
          activeNow: false,
        };
      });
    if (everyone.length) sections.push({ section: "Everyone", contacts: everyone });

    // Groups — existing group threads. Tapping a group routes into
    // that group's existing thread (doesn't allow adding-to or
    // creating-similar; that's a separate flow we don't model yet).
    var groups = (conversations || [])
      .filter(function (c) { return c.isGroup; })
      .map(function (c) {
        var name = convTitle(c, meId);
        return {
          id: c.id,
          name: name,
          sub: ((c.participants || []).length) + " members",
          initials: avatarInitials(name),
          color: avatarColor(name),
          avatar_url: null,
          isGroup: true,
          // Mark the convId so the picker knows tapping = open existing
          _existingConvId: c.id,
        };
      });
    if (groups.length) sections.push({ section: "Groups", contacts: groups });

    return sections;
  }, [conversations, friends, everyonePlayers, meId]);

  // ── Filter by query ─────────────────────────────────────────────
  const filtered = React.useMemo(function () {
    if (!q.trim()) return directory;
    var ql = q.toLowerCase();
    return directory
      .map(function (s) {
        return Object.assign({}, s, {
          contacts: s.contacts.filter(function (c) {
            return (c.name + " " + (c.sub || "")).toLowerCase().indexOf(ql) >= 0;
          }),
        });
      })
      .filter(function (s) { return s.contacts.length > 0; });
  }, [q, directory]);

  const toggleSelected = function (c) {
    setErr("");
    // Tapping an existing group jumps straight in — single-tap routing
    if (c.isGroup && c._existingConvId) {
      if (onPickContact) onPickContact(c._existingConvId);
      return;
    }
    setSelected(function (prev) {
      return prev.find(function (x) { return x.id === c.id; })
        ? prev.filter(function (x) { return x.id !== c.id; })
        : prev.concat([c]);
    });
  };

  const removeSelected = function (id) {
    setSelected(function (prev) { return prev.filter(function (c) { return c.id !== id; }); });
  };

  const canSend = selected.length > 0 && draft.trim().length > 0 && !busy;

  const submit = async function () {
    if (!canSend) return;
    setBusy(true);
    setErr("");
    try {
      var convId;
      var partners;
      if (selected.length === 1) {
        // 1:1 — open or start a draft conv with this partner.
        var single = selected[0];
        partners = [{ id: single.id, name: single.name, avatar_url: single.avatar_url }];
      } else {
        // 2+ — find-or-create a group conversation via the
        // create_group_conversation RPC. The RPC dedupes by exact
        // participant set on un-named groups, so picking the same
        // members again reuses the existing thread.
        partners = selected.map(function (s) {
          return { id: s.id, name: s.name, avatar_url: s.avatar_url };
        });
      }
      var rg = onPickGroup ? await onPickGroup(partners) : null;
      if (rg && rg.error) {
        if (rg.error.code === "block_conflict") {
          setErr("That group can't be created right now. Try messaging them individually instead.");
        } else {
          setErr(rg.error.message || "Couldn't start that conversation.");
        }
        setBusy(false);
        return;
      }
      convId = rg && rg.convId;
      // Route into the thread + send the draft text in one go. The
      // parent handler awaits both, so by the time we close the
      // composer the message has landed (no flash of empty thread).
      if (convId && onPickContact) {
        await onPickContact(convId, draft.trim());
      }
    } catch (e) {
      setErr((e && e.message) || "Couldn't start that conversation.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{
      height: "100%", background: theme.bg, color: theme.ink,
      display: "flex", flexDirection: "column", overflow: "hidden",
    }}>
      {/* Header */}
      <div style={{
        padding: isPhone ? "52px 14px 10px" : "14px 18px",
        display: "flex", alignItems: "center", gap: 10,
        borderBottom: `0.5px solid ${theme.line}`, flexShrink: 0,
      }}>
        <button onClick={onBack} className="t-btn" aria-label="Back" style={{
          width: 32, height: 32, appearance: "none", border: 0, background: "transparent",
          color: theme.ink, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer",
        }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m15 18-6-6 6-6"/>
          </svg>
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: "Inter", fontWeight: 700, fontSize: 15, color: theme.ink }}>New message</div>
          {selected.length > 1 && (
            <div style={{ fontFamily: "Inter", fontSize: 11, color: theme.inkSoft, marginTop: 1 }}>
              {selected.length} recipients · group chat
            </div>
          )}
        </div>
      </div>

      {/* To: chip input */}
      <div style={{
        padding: "10px 14px", borderBottom: `0.5px solid ${theme.line}`,
        display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center", flexShrink: 0,
      }}>
        <span style={{ fontFamily: "Inter", fontSize: 12, color: theme.inkSoft, fontWeight: 600, marginRight: 2 }}>To:</span>
        {selected.map(function (c) {
          return (
            <span key={c.id} style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              background: accent + "22", color: theme.ink,
              border: `1px solid ${accent}`, borderRadius: 999,
              padding: "3px 4px 3px 10px", fontFamily: "Inter", fontSize: 12, fontWeight: 600,
            }}>
              {c.name}
              <button onClick={function () { removeSelected(c.id); }} className="t-btn" aria-label="Remove" style={{
                width: 18, height: 18, borderRadius: "50%", appearance: "none", border: 0,
                background: theme.ink, color: theme.bg,
                display: "inline-flex", alignItems: "center", justifyContent: "center", cursor: "pointer",
              }}>
                <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
                  <line x1="6" y1="6" x2="18" y2="18"/><line x1="6" y1="18" x2="18" y2="6"/>
                </svg>
              </button>
            </span>
          );
        })}
        <input
          value={q}
          onChange={function (e) { setQ(e.target.value); }}
          placeholder={selected.length === 0 ? "Type a name…" : "Add more…"}
          autoFocus
          style={{
            flex: 1, minWidth: 100,
            appearance: "none", border: 0, background: "transparent", outline: "none",
            fontFamily: "Inter", fontSize: 13, color: theme.ink, padding: "4px 2px",
          }}
        />
      </div>

      {/* Directory list */}
      <div className="t-noscroll" style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "4px 0 8px" }}>
        {filtered.map(function (s) {
          return (
            <div key={s.section} style={{ marginBottom: 10 }}>
              <div className="t-cap" style={{ color: theme.inkSoft, padding: "10px 18px 6px" }}>{s.section}</div>
              {s.contacts.map(function (c) {
                var isSel = !!selected.find(function (x) { return x.id === c.id; });
                return (
                  <button key={c.id} onClick={function () { toggleSelected(c); }} className="t-btn" style={{
                    width: "100%", appearance: "none", border: 0,
                    background: isSel ? theme.chip : "transparent",
                    padding: "8px 14px", display: "flex", alignItems: "center", gap: 12,
                    cursor: "pointer", textAlign: "left", color: theme.ink,
                  }}>
                    <div style={{ position: "relative" }}>
                      <Avatar size={40} c={c} />
                      {c.activeNow && (
                        <span style={{
                          position: "absolute", right: -1, bottom: -1, width: 10, height: 10,
                          borderRadius: "50%", background: accent, border: `2px solid ${theme.bg}`,
                        }} />
                      )}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontFamily: "Inter", fontSize: 14, fontWeight: 600, color: theme.ink, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.name}</div>
                      <div style={{ fontFamily: "Inter", fontSize: 11, color: theme.inkSoft, marginTop: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.sub}</div>
                    </div>
                    {/* Groups jump straight in; 1:1s get a select circle */}
                    {!c.isGroup && (
                      <div style={{
                        width: 22, height: 22, borderRadius: "50%",
                        border: `1.5px solid ${isSel ? accent : theme.lineStrong}`,
                        background: isSel ? accent : "transparent",
                        display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                      }}>
                        {isSel && (
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#0f1410" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M5 12l5 5L20 7"/>
                          </svg>
                        )}
                      </div>
                    )}
                    {c.isGroup && (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={theme.inkSoft} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="m9 18 6-6-6-6"/>
                      </svg>
                    )}
                  </button>
                );
              })}
            </div>
          );
        })}
        {filtered.length === 0 && (
          <div style={{ textAlign: "center", color: theme.inkFaint, padding: "40px 20px", fontSize: 13 }}>
            {q.trim() ? "No contacts match." : "No contacts yet."}
          </div>
        )}
      </div>

      {/* Error strip */}
      {err && (
        <div style={{
          padding: "8px 14px", background: "#3a1818", color: "#ffb4b4",
          fontFamily: "Inter", fontSize: 12, borderTop: `0.5px solid ${theme.line}`,
        }}>
          {err}
        </div>
      )}

      {/* Composer */}
      <div style={{
        flexShrink: 0, padding: isPhone ? "8px 10px 92px" : "8px 14px 14px",
        display: "flex", alignItems: "flex-end", gap: 8,
        background: theme.bg,
      }}>
        <div style={{
          flex: 1, background: theme.chip, borderRadius: 22, padding: "8px 14px",
          display: "flex", alignItems: "center", gap: 8, minHeight: 36,
        }}>
          <input
            value={draft}
            onChange={function (e) { setDraft(e.target.value); }}
            onKeyDown={function (e) { if (e.key === "Enter") submit(); }}
            placeholder={selected.length === 0 ? "Pick someone to message…" : "Aa"}
            disabled={selected.length === 0 || busy}
            style={{
              flex: 1, appearance: "none", border: 0, background: "transparent", outline: "none",
              fontFamily: "Inter", fontSize: 14, color: theme.ink, opacity: selected.length === 0 ? 0.5 : 1,
            }}
          />
        </div>
        <button onClick={submit} disabled={!canSend} className="t-btn" aria-label="Send" style={{
          width: 36, height: 36, borderRadius: "50%", appearance: "none", border: 0,
          background: canSend ? accent : theme.chip, color: canSend ? "#0f1410" : theme.inkFaint,
          cursor: canSend ? "pointer" : "default", opacity: canSend ? 1 : 0.6,
          display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
          transition: "background .15s, opacity .15s",
        }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m22 2-7 20-4-9-9-4 20-7z"/>
          </svg>
        </button>
      </div>
    </div>
  );
}
