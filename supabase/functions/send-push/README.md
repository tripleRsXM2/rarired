# send-push (Supabase Edge Function)

Web Push fan-out for CourtSync. Two invocation modes:

| Mode | Body | Behaviour |
|---|---|---|
| **self test** | `{ "self_test": true, "payload": {...} }` | Sends the payload only to the caller's own enabled subscriptions. Powers the "Send test" button in Settings. |
| **notification** | `{ "notification_id": "<uuid>" }` | Looks up the row in `notifications`, derives a payload from `type` + `entity_id`, applies the recipient's per-category preferences, fans out to all of their enabled subscriptions. Idempotent via `notification_push_log`. |

## Auth model

- Always requires a valid Supabase JWT (the client SDK sends one automatically).
- For `notification_id`, the caller MUST be either the notification's `from_user_id` (cross-user emit path) or its `user_id` (self-notification path). Anything else returns `403 forbidden`. This is the gate that prevents a malicious user from triggering pushes for arbitrary notifications they didn't author or receive.
- Internally uses the `service_role` key to read across users (RLS would otherwise hide subscriptions and prefs the caller doesn't own).

## Env vars

Set via `supabase secrets set` (linked project):

```
VAPID_PUBLIC_KEY      # base64url, no padding
VAPID_PRIVATE_KEY     # base64url, no padding
VAPID_SUBJECT         # mailto:ops@courtsync.app  (or https URL)
```

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are injected automatically.

## Generating VAPID keys

```bash
deno run --allow-net --allow-read https://deno.land/x/web_push@v0.1.0/cli.ts generate
# OR locally with npx
npx web-push generate-vapid-keys
```

Push them as secrets:

```bash
SUPABASE_ACCESS_TOKEN="$(cat ~/.supabase/access-token)" \
  /tmp/supabase secrets set --linked \
    VAPID_PUBLIC_KEY=BLh… \
    VAPID_PRIVATE_KEY=Yh… \
    VAPID_SUBJECT=mailto:ops@courtsync.app
```

Set the **public** key as a Vercel env var (`VITE_VAPID_PUBLIC_KEY`) so the client can use it for `PushManager.subscribe`.

## Deploying

```bash
SUPABASE_ACCESS_TOKEN="$(cat ~/.supabase/access-token)" \
  /tmp/supabase functions deploy send-push --linked
```

## Stale-subscription pruning

When a push service returns 404 or 410 the subscription is permanently gone (user uninstalled, key rotation, browser data cleared). The function flips `enabled=false` and records `last_failure_at`. A periodic job to delete the disabled rows after N days is a future cleanup slice.
