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

  it("finishOnboarding writes a comprehensive profile patch + flags + onComplete", async () => {
    // Hydrate the flow at the Aha step with a fully-populated state so
    // we can verify finishOnboarding's final patch contains every field.
    localStorage.setItem("cs-onb", JSON.stringify({
      stepIdx: 9, // "aha"
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
    // Aha screen has two CTAs that both call finishOnboarding.
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /get started/i })).toBeTruthy();
    });
    fireEvent.click(screen.getByRole("button", { name: /get started/i }));
    await waitFor(() => {
      expect(onComplete).toHaveBeenCalled();
    });
    // upsertProfile should have been called with all collected fields.
    expect(upsertProfile).toHaveBeenCalled();
    const patch = upsertProfile.mock.calls[upsertProfile.mock.calls.length - 1][0];
    expect(patch.id).toBe("user-abc");
    expect(patch.name).toBe("Ada Lovelace");
    expect(patch.age_bracket).toBe("25-34");
    expect(patch.skill).toBe("Intermediate 2");
    expect(patch.home_zone).toBe("inner-east");
    expect(patch.played_courts).toEqual(["Prince Alfred Park"]);
    // availability is the chip→day-shape conversion.
    expect(patch.availability).toBeTruthy();
    expect(patch.availability.Mon).toContain("Morning");
    expect(patch.availability.Sat).toContain("Morning");
    // refreshProfile should fire so Settings reflects the new values.
    expect(refreshProfile).toHaveBeenCalledWith("user-abc");
    // cs-onb-done flag set, transient keys cleared.
    expect(localStorage.getItem("cs-onb-done")).toBe("1");
    expect(localStorage.getItem("cs-onb")).toBeNull();
    expect(localStorage.getItem("cs-onb-started")).toBeNull();
  });

  it("'I'll explore on my own' fires onComplete + flips the done flag", async () => {
    localStorage.setItem("cs-onb", JSON.stringify({
      stepIdx: 9,
      state: {
        first: "Ada", last: "Lovelace",
        email: "", password: "",
        age: "", level: "", utr: "", intent: [],
        zone: "inner-east", courts: [], avail: [],
      },
    }));
    const onComplete = vi.fn();
    render(
      <OnboardingFlow
        auth={makeAuthStub({ authUser: { id: "user-abc", email: "ada@example.com" } })}
        onComplete={onComplete}
      />
    );
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /explore on my own/i })).toBeTruthy();
    });
    fireEvent.click(screen.getByRole("button", { name: /explore on my own/i }));
    await waitFor(() => { expect(onComplete).toHaveBeenCalled(); });
    expect(localStorage.getItem("cs-onb-done")).toBe("1");
  });
});
