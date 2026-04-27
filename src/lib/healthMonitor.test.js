// healthMonitor — passive Supabase API tracker.
//
// Verifies the state machine fires at the right thresholds so the
// banner doesn't false-positive on a single 500 and doesn't sleep
// through a real PGRST002 storm.

import { describe, it, expect, beforeEach } from "vitest";
import {
  recordFailure,
  recordSuccess,
  getStatus,
  subscribe,
  _reset,
} from "./healthMonitor.js";

describe("healthMonitor", function(){
  beforeEach(function(){ _reset(); });

  it("starts healthy", function(){
    expect(getStatus().state).toBe("healthy");
  });

  it("a single 500 doesn't trip — could be a flake", function(){
    recordFailure({ status: 500, kind: "http" });
    expect(getStatus().state).toBe("healthy");
  });

  it("two failures → degraded", function(){
    recordFailure({ status: 503 });
    recordFailure({ status: 503 });
    expect(getStatus().state).toBe("degraded");
  });

  it("four failures → down", function(){
    for(var i=0;i<4;i++) recordFailure({ status: 503 });
    expect(getStatus().state).toBe("down");
  });

  it("storm window: 3 quick requests with 50%+ failure rate → down", function(){
    recordFailure({ status: 503 });
    recordFailure({ status: 503 });
    recordSuccess();
    expect(getStatus().state).toBe("down");
  });

  it("a clean success cycle keeps us healthy", function(){
    for(var i=0;i<5;i++) recordSuccess();
    expect(getStatus().state).toBe("healthy");
  });

  it("subscribe() fires immediately with current state", function(){
    var seen = null;
    var off = subscribe(function(s){ seen = s; });
    expect(seen).not.toBe(null);
    expect(seen.state).toBe("healthy");
    off();
  });

  it("subscribe() fires on transitions", function(){
    var seen = [];
    var off = subscribe(function(s){ seen.push(s.state); });
    recordFailure({ status: 503 });
    recordFailure({ status: 503 });
    off();
    // initial 'healthy' + one update per failure
    expect(seen).toContain("degraded");
  });

  it("getStatus exposes lastError on 5xx", function(){
    recordFailure({ status: 503, message: "PGRST002" });
    var s = getStatus();
    expect(s.lastError).toBeTruthy();
    expect(s.lastError.status).toBe(503);
    expect(s.lastError.message).toBe("PGRST002");
  });

  it("a 5xx lastError clears after a successful response", function(){
    recordFailure({ status: 503 });
    expect(getStatus().lastError).toBeTruthy();
    recordSuccess();
    expect(getStatus().lastError).toBe(null);
  });
});
