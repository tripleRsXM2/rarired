// src/features/profile/services/avatarUpload.js
//
// Uploads a File into the public `avatars` storage bucket under the user's
// own folder, and returns the public URL. Path convention: "<uid>/<ts>-<safe_name>"
// — the leading segment must equal auth.uid() per the storage RLS policy.
//
// Returns { url, error }. The caller is responsible for writing the URL back
// onto profiles.avatar_url (use profileService.upsertProfile).

import { supabase } from "../../../lib/supabase.js";

var BUCKET = "avatars";

function sanitizeName(n){
  return (n||"file").toLowerCase().replace(/[^a-z0-9.]+/g,"-").slice(0,60);
}

export async function uploadAvatar(userId, file){
  if(!userId) return { url:null, error:new Error("not signed in") };
  if(!file)   return { url:null, error:new Error("no file") };

  // Size guard — matches the bucket's file_size_limit (5 MB). Bigger than that
  // is a waste of upload + bandwidth for an avatar anyway.
  if(file.size > 5 * 1024 * 1024){
    return { url:null, error:new Error("Image too large — max 5 MB") };
  }

  var ext = (file.name.split(".").pop()||"jpg").toLowerCase();
  var path = userId + "/" + Date.now() + "-" + sanitizeName(file.name);

  var up = await supabase.storage.from(BUCKET).upload(path, file, {
    cacheControl: "3600",
    upsert: false,
    contentType: file.type || ("image/" + ext),
  });
  if(up.error) return { url:null, error:up.error };

  var pub = supabase.storage.from(BUCKET).getPublicUrl(path);
  var url = pub && pub.data && pub.data.publicUrl;
  if(!url) return { url:null, error:new Error("could not derive public URL") };

  return { url:url, error:null };
}

// Best-effort deletion of an old avatar by full public URL — used when the
// user uploads a replacement. Non-fatal if it fails (file may already be
// cleaned up, or we may not have permission in edge cases).
export async function deleteAvatarByUrl(urlStr){
  if(!urlStr) return { error:null };
  // Public URL shape: https://<project>.supabase.co/storage/v1/object/public/avatars/<path>
  var marker = "/object/public/" + BUCKET + "/";
  var ix = urlStr.indexOf(marker);
  if(ix === -1) return { error:null };
  var path = urlStr.slice(ix + marker.length);
  var r = await supabase.storage.from(BUCKET).remove([path]);
  return { error: r.error || null };
}
