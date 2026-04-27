// src/lib/healthMonitor.js
//
// Passive Supabase-API health tracker. Records every fetch result
// against the project URL and exposes a status the UI can subscribe
// to so a 'service unavailable, reconnecting...' banner can render
// the moment things go sideways.
//
// Trade-off chosen deliberately: we DO NOT actively cancel/throttle
// requests when health degrades. False-negative trips would lock
// users out of an actually-working backend, which is worse than the
// retry storm we'd be preventing. The banner gives the user agency
// (refresh / wait), the monitor gives us telemetry.
//
// State machine:
//   healthy   — last 30s clean OR < 2 failures
//   degraded  — 2-3 failures in 30s OR most recent request was 5xx
//   down      — 4+ failures in 30s OR sustained 5xx ratio >= 50% in last 10s
//
// Exposes:
//   recordFailure({ url, status, kind })  — wrapper-fetch reports here
//   recordSuccess(url)                    — wrapper-fetch reports here
//   getStatus()                           — { state, recentFailures, lastError }
//   subscribe(fn)                         — returns unsubscribe()

var WINDOW_MS = 30_000;        // rolling history window
var DOWN_FAILS = 4;            // failures in window → 'down'
var DEGRADED_FAILS = 2;        // failures in window → 'degraded'
var STORM_WINDOW_MS = 10_000;  // recent storm window
var STORM_RATIO = 0.5;         // 5xx-ratio over storm window → 'down'

var events = [];               // {t, ok, status, kind}
var listeners = new Set();
var lastError = null;          // { status, message, t }

function pruneOld(){
  var now = Date.now();
  // Keep events within the larger window.
  var keepFrom = now - WINDOW_MS;
  events = events.filter(function(e){ return e.t >= keepFrom; });
}

function deriveState(){
  pruneOld();
  var now = Date.now();
  var inWindow = events;
  var fails = inWindow.filter(function(e){ return !e.ok; }).length;

  // Storm check — if recent (10s) hit-rate of 5xx is >= 50% with at
  // least 3 requests, escalate to 'down' even if total failures
  // haven't crossed DOWN_FAILS yet. Catches a rapid-fire outage
  // before the rolling counter catches up.
  var stormFrom = now - STORM_WINDOW_MS;
  var stormRequests = inWindow.filter(function(e){ return e.t >= stormFrom; });
  if(stormRequests.length >= 3){
    var stormFails = stormRequests.filter(function(e){ return !e.ok; }).length;
    if(stormFails / stormRequests.length >= STORM_RATIO) return "down";
  }

  if(fails >= DOWN_FAILS) return "down";
  if(fails >= DEGRADED_FAILS) return "degraded";
  return "healthy";
}

function emit(){
  var snap = getStatus();
  listeners.forEach(function(fn){
    try { fn(snap); } catch(_){}
  });
}

export function recordFailure(info){
  events.push({
    t: Date.now(),
    ok: false,
    status: info && info.status,
    kind: (info && info.kind) || "http",
  });
  lastError = {
    status: info && info.status,
    message: (info && info.message) || "request failed",
    t: Date.now(),
  };
  emit();
}

export function recordSuccess(){
  events.push({ t: Date.now(), ok: true });
  // Successful response clears 'lastError' if it was a 5xx — a
  // genuine app-level 4xx (auth/RLS) is a different error class
  // and the banner shouldn't be holding onto stale outage state.
  if(lastError && lastError.status >= 500) lastError = null;
  emit();
}

export function getStatus(){
  return {
    state: deriveState(),
    recentFailures: events.filter(function(e){ return !e.ok; }).length,
    lastError: lastError,
  };
}

export function subscribe(fn){
  listeners.add(fn);
  // Fire once immediately so subscribers don't have to wait for the
  // next event to render.
  try { fn(getStatus()); } catch(_){}
  return function(){ listeners.delete(fn); };
}

// Test seam — let test code reset between cases.
export function _reset(){
  events = [];
  lastError = null;
  emit();
}
