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
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import OnboardingFlow, { didCompleteOnboarding } from "./OnboardingFlow.jsx";

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
});
