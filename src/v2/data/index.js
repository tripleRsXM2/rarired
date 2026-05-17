// src/v2/data/index.js
//
// Barrel for the v2 Supabase adapters. The v2 shell imports from this
// module only; individual files (useV2Profile / useV2History /
// useV2Competitions) stay internal. Same pattern v2/features/* uses
// for their public surface.

export { useV2Profile }      from "./useV2Profile.js";
export { useV2History }      from "./useV2History.js";
export { useV2Competitions } from "./useV2Competitions.js";
export { useV2Friends }      from "./useV2Friends.js";
export { logV2Match }        from "./logV2Match.js";
export { useV2PlayerProfile } from "./useV2PlayerProfile.js";
