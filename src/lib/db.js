// src/lib/db.js
// Shared Supabase utilities used across multiple features.
import { supabase } from "../supabase.js";

export function fetchProfilesByIds(ids, fields){
  return supabase.from('profiles').select(fields||'id,name,avatar').in('id',ids);
}
