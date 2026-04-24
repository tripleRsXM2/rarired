// src/lib/constants/ui.js
// Shared UI-layer constants (avatar palette, top-level tab list).

export const AV_COLORS = ["#4A90E2","#3D9970","#E67E22","#E74C3C","#8E44AD","#2980B9","#D35400"];

// Phase 0 of the map-pivot: Tindis removed from the primary nav but
// the /tindis route still resolves in App.jsx so existing notification
// deep-links, bookmarks, and shared URLs don't 404 mid-pivot. The DB
// schema (match_pacts + RLS + RPCs) stays — see product-principles.md v6.
export const TABS = [
  {id:"home",        label:"Feed"},
  {id:"map",         label:"Map"},
  {id:"tournaments", label:"Compete"},
  {id:"people",      label:"People"},
  {id:"profile",     label:"Profile"},
  {id:"admin",       label:"Admin"},
];
