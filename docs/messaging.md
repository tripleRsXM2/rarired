# Messaging (Direct Messages)

## Purpose

Reference doc for the DM system. One page; anyone on the team should be able
to onboard from here without reading the hook.

Messaging is **lightweight coordination**, per `product-principles.md`. Not
a generic chat platform. DMs exist to let two friends agree on a rematch or
trade a quick note. As of phase 4 (April 2026) DMs also support **small
group conversations** (≥3 participants) for the doubles-invite flow — see
the Groups section below for scope, schema, and v1 limitations.

## Current State

### DB tables

| Table | Purpose | Ownership |
|---|---|---|
| `conversations` | One row per canonical pair. `pair_key` is the uuid-sorted `userA:userB` string, unique-indexed. Columns: `id, user1_id, user2_id, pair_key, requester_id, status ('pending'|'accepted'|'declined'), declined_at, request_cooldown_until, last_message_at, last_message_preview, last_message_sender_id, created_at` | Created via `get_or_create_conversation` RPC only. |
| `direct_messages` | Every message. Columns: `id, conversation_id, sender_id, content, reply_to_id (nullable), edited_at, deleted_at, created_at` | Inserted by client (RLS-scoped to `sender_id = auth.uid()`). |
| `message_reads` | Per-user-per-conv `last_read_at`. Written via `mark_conversation_read` RPC. | Security-definer RPC; client cannot write directly. |
| `message_reactions` | `{id, message_id, user_id, emoji}`. Unique (message_id, user_id, emoji). | Client inserts/deletes with RLS. |
| `conversation_pins` | `{user_id, conversation_id, pinned_at}` (compound PK). Per-user pin. | Client inserts/deletes with RLS (`user_id = auth.uid()`). |
| `conversation_participants` | `{conversation_id, user_id, joined_at}` (compound PK). One row per (conv, member) for **groups**. 1:1 convs do NOT use this table — they continue to live off `user1_id` / `user2_id`. | Inserted by `create_group_conversation` RPC; client SELECTs filtered by `user_id = auth.uid()` and the conv-membership join. |
| `conversations.is_group` | Boolean column added in phase 1. `false` for canonical 1:1, `true` for doubles/group threads. | Set by `create_group_conversation` RPC only. |
| Storage bucket `dm-attachments` | Public read, per-user-folder write. 5 MB limit, image mimes only. Image DMs store the public URL inside `direct_messages.content` via `[img]` sentinel. | Upload via `uploadDMAttachment(userId, file)`. |

### Migrations (the important ones)

- `dm_canonical_conversation.sql` — `get_or_create_conversation(other_id)` RPC + `pair_key` unique index. Guarantees exactly one canonical conversation per pair.
- `dm_friendship_override.sql` — schema support for friends-bypass-request-gate rule.
- `message_reads_participant_select.sql` — RLS: partner can `SELECT` read rows for "Seen" receipts.
- `notification_upsert_rpc.sql` — `upsert_message_notification` RPC + partial unique index on `notifications (user_id, entity_id) where type='message'`. Collapses N new messages in a conv to one tray row.
- `20260423_conversation_pins.sql` — `conversation_pins` table (per-user pins), RLS (owner-only), realtime publication, `REPLICA IDENTITY FULL` so DELETE events carry the conversation_id back to the client.

### RPCs called by the client

| RPC | From | Purpose |
|---|---|---|
| `get_or_create_conversation(other_id)` | `useDMs.openOrStartConversation` | Returns canonical conv row, creating if needed. Race-safe. |
| `mark_conversation_read(p_conversation_id)` | `useDMs.openConversation` + realtime INSERT handler | Writes `message_reads.last_read_at = now()` for the caller. |
| `upsert_message_notification(p_user_id, p_from_user_id, p_entity_id, p_metadata)` | `useDMs.sendMessage` | Inserts or updates the single "you have unread messages" tray row for the recipient. |

### Realtime channels

Defined in `useDMs.js`. All four subscribe on mount, unsubscribe on unmount.

| Channel | Filter | What it drives |
|---|---|---|
| `convs:<uid>` | `conversations` INSERT `user1_id=uid`, INSERT `user2_id=uid`, UPDATE | New incoming request; friend-auto-accept; list-row updates (preview, timestamp, status). |
| `msgs:<convId>` | `direct_messages` INSERT/UPDATE `conversation_id=convId` | Live thread render; dedupe by id via `appendMessageIfNew`; call `mark_conversation_read` when message is from partner. |
| `reads:<convId>` | `message_reads` INSERT/UPDATE `conversation_id=convId` | Partner's `last_read_at` for the "Seen" receipt on my sent messages. |
| `rx:<convId>` | `message_reactions` INSERT/DELETE (filtered client-side to current thread's message ids) | Live reaction add/remove; dedupes optimistic placeholders by (user_id, emoji) pair. |
| `pins:<uid>` | `conversation_pins` INSERT/DELETE `user_id=uid` | Multi-device pin sync — pinning on tab A immediately moves the conv on tab B. |
| `participants:<uid>` | `conversation_participants` INSERT `user_id=uid` | Late-join sync for groups — when I'm added to a group conversation by another client, my inbox hydrates the new conv (and refetches its participants) without a full reload. 1:1 convs skip this channel entirely. |

### Notification types that touch messaging

| Type | Trigger | Recipient | Storage |
|---|---|---|---|
| `message_request` | First `openOrStartConversation` between non-friends | Recipient | `notifications` row via `insertNotification` |
| `message_request_accepted` | Recipient accepts | Original sender | `notifications` row via `insertNotification` |
| `message` | Every new message in an accepted conv | Partner | `notifications` row via `upsert_message_notification` RPC (collapsed per conv) |

Auto-dismiss rules (enforced in `App.jsx`):
- Opening a conv whose `entity_id` matches a `message` tray row → dismiss.
- Opening a conv whose `from_user_id` matches a legacy `message` tray row with null `entity_id` → dismiss.
- Accepting a friend request → dismiss any `friend_request` tray rows from the same user.

## Client surface

`src/features/people/hooks/useDMs.js` exports a single hook that returns:

```
{
  // state
  conversations, requests, activeConv, threadMessages, reactions,
  threadLoading, msgDraft, sending, replyTo, editingId, editDraft,
  partnerLastReadAt,

  // state setters
  setMsgDraft, setReplyTo, clearReplyTo, setEditDraft,

  // actions
  loadConversations, openConversation, openOrStartConversation, closeConversation,
  sendMessage, acceptRequest, declineRequest,
  toggleReaction, startEdit, cancelEdit, submitEdit, deleteMessage,
  deleteConversation, resetDMs, totalUnread,
}
```

Components should render from the state fields and call the actions. They
must not reach into Supabase themselves.

### Derived state only

- `totalUnread()` — reduces over `conversations` + `requests`. **Never stored.**
- `conv.hasUnread` — derived from `last_message_sender_id` vs me + `last_message_at` vs `lastReadAt`.

## Product rules

### Friends bypass the request gate
If the receiver is already a friend of the sender, a pending conversation is
auto-upgraded to accepted (both in `loadConversations` and in the convs
realtime INSERT handler). A friend messaging a friend never requires approval.

### Non-friend first message = request
If not friends, the first conversation stays `pending` until the recipient
taps Accept. During that state:
- Sender sees "Request sent — waiting for X to accept."
- Recipient sees the conversation only in the Requests section (not the main list) + an Accept/Decline banner inside the thread.

### Declined convs have a cooldown
`request_cooldown_until` is set 7 days out when a request is declined. The
sender cannot re-request during that window.

### Delete semantics
- **Delete for me** — hides the message from my view only. Stored client-side in `localStorage` under `cs_hidden_msgs_<uid>`. Available on **any non-deleted message** (own or partner's) — it's local-only so it can't affect the other user (rule updated 2026-04-23 per Mdawg; previously own-only).
- **Unsend** — soft-deletes in DB (`deleted_at` timestamp). Both parties see "Message deleted" in the thread. Available on own messages only.
- **Other person's messages** — only "Delete for me" (hide locally). No "Unsend" — you can't modify the other user's DB state.

### Edit window
Own, non-deleted messages are editable for 15 minutes after send.

### Image attachments
- Users can attach an image via the paperclip icon in the input bar. Accepted types: `image/png,image/jpeg,image/webp,image/gif`. Max size: **5 MB**.
- Uploaded to the public `dm-attachments` Supabase Storage bucket under `<uid>/<ts>-<safe_name>`. RLS: anyone can read (public bucket); only the uploader can write to their own folder.
- Image messages store the public URL in `direct_messages.content` with a `[img]` sentinel prefix. The renderer detects the prefix and shows an `<img>` bubble instead of text. Keeps the DB schema unchanged.
- Tapping an image bubble opens a full-screen lightbox. Long-press / right-click opens the normal action menu (Reply / Delete for me / Unsend).
- Conversation-list preview renders "📷 Photo" for image messages.
- **GIFs as animated images are supported** (image/gif). A Giphy-style in-app search is NOT built — punted.

## Groups

Group conversations are the doubles-invite flow's home: instead of fan-out
1:1 DMs (one thread per partner), the inviter and all confirmed partners
share a single thread. Scope is intentionally narrow for v1.

### Schema

- `conversations.is_group boolean default false` — discriminator. 1:1 convs leave this `false` and use the legacy `user1_id` / `user2_id` columns; groups set it `true` and live off `conversation_participants`.
- `conversation_participants(conversation_id, user_id, joined_at)` — compound-PK membership table. RLS lets each user `SELECT` only the rows they belong to.
- `pair_key` is a generated column on `conversations` and is `NULL` for groups (the canonical-pair uniqueness constraint applies to 1:1 only).

### RPCs

- `create_group_conversation(p_participant_ids uuid[])` — `SECURITY DEFINER`. Inserts the `conversations` row with `is_group=true`, then a `conversation_participants` row per id (caller automatically included). Refuses to create the conv if **any** pair of participants has an active block (`blocks` table) — see Block-conflict policy below. Returns the new `conversation_id`.
- `fetch_group_conversation(p_conversation_id uuid)` — `SECURITY DEFINER`. Returns the conv row + participants array. Used by `useDMs` to hydrate a freshly-created or freshly-joined group.

### Rendering rules

- Inbox row + thread header use `convTitle(conv, me)` — non-self participants, capped at two names + "& N others" (e.g. *"Alex & Brett"*, *"Alex, Brett & 1 other"*).
- Avatars use the `<AvatarStack>` primitive (`Messages.jsx`): up to 3 overlapping circles, leftmost on top, with a 2px ring in `t.bgCard` so each avatar lifts cleanly off the previous one.
- Tapping a group thread header opens `<GroupDetailsDrawer>` (slide-up sheet on mobile, right-anchored panel on desktop). It lists every participant with a chevron that calls `openProfile(p.id)`. Self gets no chevron. **No "leave group" button in v1.**
- 1:1 rendering is unchanged.

### Block-conflict policy

A group can only be created if no two participants currently block each other. `create_group_conversation` checks this server-side and refuses with a structured error; the doubles-invite flow surfaces the refusal copy *"That group can't be created right now. Try messaging them individually instead."* (see `notification-taxonomy.md`).

**Caveat — post-creation blocks**: if user A blocks user B *after* the group already exists, the group is **not** auto-dissolved. A's outgoing messages will fail RLS (the existing `blocks`-aware insert policy still applies), but the thread stays visible to both. Documented limitation; revisit if it bites.

### v1 scope (deliberate omissions)

- No typing indicators inside group threads — `notifyTyping` is gated on `activeConv.isGroup`.
- No per-message Seen receipts — would require per-participant read tracking. Hidden in groups.
- No "leave group" / "delete conversation" affordance for groups in the conv-list right-click menu.
- No `message_request*` flow — groups bypass the request gate (you're not asking permission to talk; you're being added).
- No member add/remove UI after creation. Groups are created once with a fixed roster.

## Open questions / tracked follow-ups

- **Out-of-order realtime delivery** — current list uses append-order, not re-sort-by-created_at. Hasn't caused a visible bug in practice. Tracked for a later fix.
- **Multi-device own-reads sync** — if I read in tab A, tab B's list row doesn't clear until a realtime event from the partner fires. Nice-to-have.
- **Message search** — not built. Punt.
- **Typing indicators** — not built. Punt.

## Last Updated By Module
- v0 — 2026-04-23, Phase 1 of the messaging integration plan. Inventory of shipped state.
- v1 — 2026-04-23, Phase 5 UI polish: pinned conversations (new `conversation_pins` table + realtime + UI section), tighter conversation rows, unread accent ring, in-thread date separators, optional desktop-only details drawer (pin toggle + "View profile" shortcut).
- v2 — 2026-04-27, Group conversations phase 4: UI for `is_group` + `conversation_participants` (avatar stack, composed title, group-details drawer, gated typing/seen/delete). Phases 1-3 (migration + service + hook) shipped earlier; phase 4 is the rendering layer.
