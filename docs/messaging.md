# Messaging (Direct Messages)

## Purpose

Reference doc for the DM system. One page; anyone on the team should be able
to onboard from here without reading the hook.

Messaging is **lightweight coordination**, per `product-principles.md`. Not
a generic chat platform. DMs exist to let two friends agree on a rematch or
trade a quick note. Everything here is scoped to 1-to-1.

## Current State

### DB tables

| Table | Purpose | Ownership |
|---|---|---|
| `conversations` | One row per canonical pair. `pair_key` is the uuid-sorted `userA:userB` string, unique-indexed. Columns: `id, user1_id, user2_id, pair_key, requester_id, status ('pending'|'accepted'|'declined'), declined_at, request_cooldown_until, last_message_at, last_message_preview, last_message_sender_id, created_at` | Created via `get_or_create_conversation` RPC only. |
| `direct_messages` | Every message. Columns: `id, conversation_id, sender_id, content, reply_to_id (nullable), edited_at, deleted_at, created_at` | Inserted by client (RLS-scoped to `sender_id = auth.uid()`). |
| `message_reads` | Per-user-per-conv `last_read_at`. Written via `mark_conversation_read` RPC. | Security-definer RPC; client cannot write directly. |
| `message_reactions` | `{id, message_id, user_id, emoji}`. Unique (message_id, user_id, emoji). | Client inserts/deletes with RLS. |

### Migrations (the important ones)

- `dm_canonical_conversation.sql` — `get_or_create_conversation(other_id)` RPC + `pair_key` unique index. Guarantees exactly one canonical conversation per pair.
- `dm_friendship_override.sql` — schema support for friends-bypass-request-gate rule.
- `message_reads_participant_select.sql` — RLS: partner can `SELECT` read rows for "Seen" receipts.
- `notification_upsert_rpc.sql` — `upsert_message_notification` RPC + partial unique index on `notifications (user_id, entity_id) where type='message'`. Collapses N new messages in a conv to one tray row.

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
- **Delete for me** — hides the message from my view only. Stored client-side in `localStorage` under `cs_hidden_msgs_<uid>`. Available on own messages only (per Mdawg decision, 2026-04-22).
- **Unsend** — soft-deletes in DB (`deleted_at` timestamp). Both parties see "Message deleted" in the thread. Available on own messages only.
- **Other person's messages** — no delete options in the action menu.

### Edit window
Own, non-deleted messages are editable for 15 minutes after send.

## Open questions / tracked follow-ups

- **Pinned conversations** — Relay design has a Pinned section. Requires a `conversations.pinned_by_user1 bool` + `pinned_by_user2 bool` migration. Product decision pending.
- **Out-of-order realtime delivery** — current list uses append-order, not re-sort-by-created_at. Hasn't caused a visible bug in practice. Tracked for a later fix.
- **Multi-device own-reads sync** — if I read in tab A, tab B's list row doesn't clear until a realtime event from the partner fires. Nice-to-have.
- **Message search** — not built. Punt.
- **Typing indicators** — not built. Punt.

## Last Updated By Module
- v0 — 2026-04-23, Phase 1 of the messaging integration plan. Inventory of shipped state.
