// Smoke tests for the new 9-screen onboarding flow.
// We intentionally avoid driving the whole flow end-to-end — that would
// require mocking supabase, the auth controller, and the profile service.
// Instead we verify three things:
//   1. The Welcome screen renders for a logged-out viewer with no prior
//      onboarding completion.
//   2. The "Sign in" affordance toggles into the SignIn screen view.
//   3. didCompleteOnboarding() reads the cs-onb-done localStorage flag.
//
// These are the load-bearing decisions that App.jsx hangs its
// render-branch off of. The deeper screens have no logic worth a unit
// test — they're presentation that wraps the auth/profile services.
import React from "react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

// Mock the profile service so finishOnboarding's upsertProfile call is
// observable in the test runtime — we don't want to hit a real Supabase.
// The upsertProfile mock returns a resolved-no-error result so the
// finishOnboarding path proceeds to setting the done flag and firing
// onComplete, which is what we're verifying.
vi.mock("../../../profile/services/profileService.js", () => ({
  upsertProfile: vi.fn(() => Promise.resolve({ data: null, error: null })),
}));

// fetchPlayersInZone hits Supabase when the Aha screen mounts. Stub it
// to a fast empty resolution so the test renders the empty-state path
// without waiting on a network round-trip.
vi.mock("../../../map/services/mapService.js", () => ({
  fetchPlayersInZone: vi.fn(() => Promise.resolve({ data: [], error: null })),
}));

import OnboardingFlow, { didCompleteOnboarding } from "./OnboardingFlow.jsx";
import { upsertProfile } from "../../../profile/services/profileService.js";

function makeAuthStub(overrides) {
  return Object.assign({
    authUser: null,
    authInitialized: true,
    authStep: "choose",
    setAuthStep: () => {},
    showAuth: false,
    setShowAuth: () => {},
  }, overrides || {});
}

describe("OnboardingFlow", () => {
  beforeEach(() => {
    try { localStorage.clear(); } catch (_) {}
    upsertProfile.mockClear();
  });

  it("renders the Welcome screen on first mount", () => {
    render(<OnboardingFlow auth={makeAuthStub()} onComplete={() => {}} />);
    expect(screen.getByText(/Track your tennis/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: /get started/i })).toBeTruthy();
  });

  it("'Sign in' button on Welcome reveals the Sign in screen", () => {
    render(<OnboardingFlow auth={makeAuthStub()} onComplete={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /^sign in$/i }));
    // The SignIn screen shows the "Sign in to CourtSync" header.
    expect(screen.getByText(/sign in to courtsync/i)).toBeTruthy();
  });

  it("didCompleteOnboarding reads the cs-onb-done flag", () => {
    expect(didCompleteOnboarding()).toBe(false);
    localStorage.setItem("cs-onb-done", "1");
    expect(didCompleteOnboarding()).toBe(true);
  });

  it("'Get started' on Welcome sets the cs-onb-started flag", () => {
    render(<OnboardingFlow auth={makeAuthStub()} onComplete={() => {}} />);
    expect(localStorage.getItem("cs-onb-started")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /get started/i }));
    expect(localStorage.getItem("cs-onb-started")).toBe("1");
  });

  it("renders the SignIn-only variant when forceSignIn is true", () => {
    render(<OnboardingFlow auth={makeAuthStub()} onComplete={() => {}} forceSignIn={true} />);
    // No Welcome content — we land directly on SignIn.
    expect(screen.queryByText(/Track your tennis/i)).toBeNull();
    expect(screen.getByText(/sign in to courtsync/i)).toBeTruthy();
  });

  it("Avail's 'Find my players' CTA writes the comprehensive patch + closes the flow (authed)", async () => {
    // Aha was retired from the linear flow — Avail is now the last
    // step and its 'Find my players' button calls finishOnboarding
    // directly. For an authed user, finishOnboarding upserts every
    // collected field then fires onComplete (no VerifyEmail terminal).
    localStorage.setItem("cs-onb", JSON.stringify({
      stepIdx: 8, // "avail"
      state: {
        first: "Ada", last: "Lovelace",
        email: "ada@example.com", password: "",
        age: "25-34", level: "Intermediate 2", utr: "",
        intent: ["competitive"],
        zone: "inner-east",
        courts: ["Prince Alfred Park"],
        avail: ["wd-am", "we"],
      },
    }));
    const onComplete = vi.fn();
    const refreshProfile = vi.fn(() => Promise.resolve());
    render(
      <OnboardingFlow
        auth={makeAuthStub({ authUser: { id: "user-abc", email: "ada@example.com" } })}
        onComplete={onComplete}
        refreshProfile={refreshProfile}
      />
    );
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /find my players/i })).toBeTruthy();
    });
    fireEvent.click(screen.getByRole("button", { name: /find my players/i }));
    await waitFor(() => {
      expect(onComplete).toHaveBeenCalled();
    });
    // upsertProfile called with all collected fields.
    expect(upsertProfile).toHaveBeenCalled();
    const patch = upsertProfile.mock.calls[upsertProfile.mock.calls.length - 1][0];
    expect(patch.id).toBe("user-abc");
    expect(patch.name).toBe("Ada Lovelace");
    expect(patch.age_bracket).toBe("25-34");
    expect(patch.skill).toBe("Intermediate 2");
    expect(patch.home_zone).toBe("inner-east");
    expect(patch.played_courts).toEqual(["Prince Alfred Park"]);
    expect(patch.availability).toBeTruthy();
    expect(patch.availability.Mon).toContain("Morning");
    expect(patch.availability.Sat).toContain("Morning");
    // refreshProfile fires so Settings reflects the new values.
    expect(refreshProfile).toHaveBeenCalledWith("user-abc");
    // cs-onb-done flag set, in-progress + state cleared. find-players
    // flag set so the post-signin modal pops on /home once.
    expect(localStorage.getItem("cs-onb-done")).toBe("1");
    expect(localStorage.getItem("cs-onb")).toBeNull();
    expect(localStorage.getItem("cs-onb-started")).toBeNull();
    expect(localStorage.getItem("cs-find-players-pending")).toBe("1");
  });

  it("Avail CTA on UNAUTH user lands on VerifyEmail + flags find-players", async () => {
    // Email-confirm-required project: auth.authUser is null all the
    // way through onboarding. Avail's 'Find my players' tap fires
    // finishOnboarding which bails to VerifyEmail. cs-onb (typed
    // state) is KEPT so useCurrentUser.loadProfile replays it on
    // first signin.
    localStorage.setItem("cs-onb", JSON.stringify({
      stepIdx: 8,
      state: {
        first: "Ada", last: "Lovelace",
        email: "ada@example.com", password: "",
        age: "25-34", level: "Intermediate 2", utr: "", intent: [],
        zone: "inner-east", courts: [], avail: ["wd-am"],
      },
    }));
    const onComplete = vi.fn();
    render(
      <OnboardingFlow
        auth={makeAuthStub({ authUser: null })}
        onComplete={onComplete}
      />
    );
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /find my players/i })).toBeTruthy();
    });
    fireEvent.click(screen.getByRole("button", { name: /find my players/i }));
    await waitFor(() => {
      expect(screen.getByText(/verify your email/i)).toBeTruthy();
    });
    expect(localStorage.getItem("cs-onb-done")).toBe("1");
    expect(localStorage.getItem("cs-onb-started")).toBeNull();
    expect(localStorage.getItem("cs-onb")).not.toBeNull();
    expect(localStorage.getItem("cs-find-players-pending")).toBe("1");
    // onComplete is NOT called — VerifyEmail handles the next nav.
    expect(onComplete).not.toHaveBeenCalled();
  });

  it("Stale stepIdx=9 from old cs-onb stash gets clamped to last step", async () => {
    // Users who started onboarding before Aha was removed had stepIdx=9
    // (Aha) stashed. After hydration we now clamp to STEPS.length-1 (8,
    // i.e. Avail) so they land on a real screen.
    localStorage.setItem("cs-onb", JSON.stringify({
      stepIdx: 9,
      state: {
        first: "Ada", last: "Lovelace",
        email: "", password: "",
        age: "", level: "", utr: "", intent: [],
        zone: "inner-east", courts: [], avail: ["wd-am"],
      },
    }));
    render(
      <OnboardingFlow
        auth={makeAuthStub({ authUser: { id: "user-abc", email: "ada@example.com" } })}
        onComplete={vi.fn()}
      />
    );
    // Should render Avail (the new last step), not a blank screen.
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /find my players/i })).toBeTruthy();
    });
  });
});
