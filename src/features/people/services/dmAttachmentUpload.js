// src/features/people/services/dmAttachmentUpload.js
//
// Uploads a File into the public `dm-attachments` storage bucket under the
// uploader's own folder, and returns the public URL. Path convention:
// "<uid>/<ts>-<safe_name>" — leading segment MUST equal auth.uid() per the
// storage RLS policy.
//
// Returns { url, error }. The caller then sends a DM whose content is
// "[img]<url>" — the client treats that sentinel as an image bubble.

import { supabase } from "../../../lib/supabase.js";

var BUCKET = "dm-attachments";
export var MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024; // 5 MB, matches bucket limit

function sanitizeName(n) {
  return (n || "file").toLowerCase().replace(/[^a-z0-9.]+/g, "-").slice(0, 60);
}

export async function uploadDMAttachment(userId, file) {
  if (!userId) return { url: null, error: new Error("not signed in") };
  if (!file)   return { url: null, error: new Error("no file") };

  if (!/^image\//.test(file.type || "")) {
    return { url: null, error: new Error("Only image files are allowed.") };
  }
  if (file.size > MAX_ATTACHMENT_BYTES) {
    return { url: null, error: new Error("Image too large — max 5 MB.") };
  }

  var ext = (file.name.split(".").pop() || "jpg").toLowerCase();
  var path = userId + "/" + Date.now() + "-" + sanitizeName(file.name);

  var up = await supabase.storage.from(BUCKET).upload(path, file, {
    cacheControl: "3600",
    upsert: false,
    contentType: file.type || ("image/" + ext),
  });
  if (up.error) return { url: null, error: up.error };

  var pub = supabase.storage.from(BUCKET).getPublicUrl(path);
  var url = pub && pub.data && pub.data.publicUrl;
  if (!url) return { url: null, error: new Error("could not derive public URL") };

  return { url: url, error: null };
}

// Sentinel parsing helpers — used by the Messages renderer.
export var IMG_PREFIX = "[img]";

export function isImageMessageContent(content) {
  if (!content) return false;
  return String(content).trim().indexOf(IMG_PREFIX) === 0;
}

export function extractImageUrl(content) {
  if (!isImageMessageContent(content)) return null;
  return String(content).trim().slice(IMG_PREFIX.length);
}
