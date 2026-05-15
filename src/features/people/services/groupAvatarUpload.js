// src/features/people/services/groupAvatarUpload.js
//
// Uploads a File into the public `group-avatars` storage bucket under
// the conversation's own folder (path convention: `<conv_id>/<random>.<ext>`).
// Storage RLS gates writes by participant membership: a non-member's
// upload to that folder is rejected by the policy (see migration
// 20260516_group_avatars.sql).
//
// Returns { url, path, error } — the `url` is the public URL suitable
// for direct rendering via <img src=…>. The caller then persists it
// via setConversationAvatar (which goes through the
// set_conversation_avatar RPC and double-checks the URL points at
// this bucket).
//
// File-size + mime checks happen client-side AND bucket-side:
//   client → instant feedback, no wasted bandwidth on rejects.
//   bucket → defence in depth, can't be bypassed by a custom client.

import { supabase } from "../../../lib/supabase.js";

var BUCKET = "group-avatars";

// 2 MB — matches the bucket's file_size_limit. Avatars are typically
// well under 200 KB; this is a generous ceiling that still rules out
// "user dragged in a 10 MB DSLR photo by accident".
export var MAX_AVATAR_BYTES = 2 * 1024 * 1024;

// Mime allow-list — matches the bucket's allowed_mime_types. We
// could rely solely on the bucket check, but rejecting client-side
// gives instant feedback + lets us surface a friendlier error
// message than the raw Supabase response.
var ALLOWED_MIMES = {
  "image/jpeg": "jpg",
  "image/png":  "png",
  "image/webp": "webp",
  "image/gif":  "gif",
};

function ext(file) {
  if (file.type && ALLOWED_MIMES[file.type]) return ALLOWED_MIMES[file.type];
  // Fall back to file name extension as a last resort. The bucket
  // mime check will still reject if it's wrong.
  var n = (file.name || "").toLowerCase();
  var dot = n.lastIndexOf(".");
  if (dot < 0) return "jpg";
  return n.slice(dot + 1) || "jpg";
}

function randomId() {
  // Crypto-quality random suffix so two simultaneous uploads from
  // the same conv can't collide. crypto.randomUUID is available in
  // every browser CourtSync supports; fall back to Math.random for
  // ancient runtimes (won't happen in practice).
  try {
    if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  } catch (_) {}
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

// Upload an image file to the conversation's avatar folder. Returns
// { url, path, error }. On success the URL is a permanent public URL
// (bucket is public-read) that the caller can persist via
// setConversationAvatar.
export async function uploadGroupAvatar(convId, file) {
  if (!convId) return { url: null, path: null, error: new Error("missing conversation id") };
  if (!file)   return { url: null, path: null, error: new Error("no file") };

  if (!ALLOWED_MIMES[file.type || ""]) {
    return { url: null, path: null, error: new Error("Only JPG / PNG / WebP / GIF are supported.") };
  }
  if (file.size > MAX_AVATAR_BYTES) {
    var mb = (MAX_AVATAR_BYTES / (1024 * 1024)).toFixed(0);
    return { url: null, path: null, error: new Error("Image too large — max " + mb + " MB.") };
  }

  var path = convId + "/" + randomId() + "." + ext(file);
  var up = await supabase.storage.from(BUCKET).upload(path, file, {
    cacheControl: "3600",
    upsert: false,
    contentType: file.type,
  });
  if (up.error) return { url: null, path: null, error: up.error };

  // Bucket is public-read so we can hand out the permanent public URL.
  // Cache-bust query string ensures the <img> re-fetches after an
  // avatar swap (browsers love to cache the same path forever).
  var pub = supabase.storage.from(BUCKET).getPublicUrl(path);
  var url = pub && pub.data && pub.data.publicUrl;
  if (!url) return { url: null, path: path, error: new Error("Could not resolve public URL") };
  return { url: url + "?v=" + Date.now(), path: path, error: null };
}

// Delete a previously-uploaded avatar. Caller is responsible for
// clearing conversations.avatar_url separately (or via
// setConversationAvatar(convId, null)). Storage RLS gates the delete
// by participant membership.
export async function deleteGroupAvatarByPath(path) {
  if (!path) return { error: new Error("no path") };
  var r = await supabase.storage.from(BUCKET).remove([path]);
  if (r.error) return { error: r.error };
  return { error: null };
}
