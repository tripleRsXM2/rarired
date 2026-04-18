// src/features/tournaments/services/tournamentService.js
import { supabase } from "../../../supabase.js";

export function fetchAllTournaments(){
  return supabase.from('tournaments').select('*');
}
export function upsertTournament(t){
  return supabase.from('tournaments').upsert(t);
}
