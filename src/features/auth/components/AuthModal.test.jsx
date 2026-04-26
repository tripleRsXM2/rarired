// AuthModal.jsx — backdrop dismissal guard.
//
// Repro of the bug user reported: when you select text in the email
// or password input and overshoot the card while dragging, releasing
// the mouse outside the card used to close the whole modal because
// onClick fires on mouseup. The fix is mousedown+mouseup tracking
// — the modal should only dismiss when BOTH mousedown and mouseup
// land on the backdrop.
import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import AuthModal from "./AuthModal.jsx";
import { makeTheme } from "../../../lib/theme.js";

function makeProps(overrides) {
  var t = makeTheme("grass");
  var base = {
    t: t,
    showAuth: true,
    setShowAuth: vi.fn(),
    authMode: "login",
    setAuthMode: vi.fn(),
    authStep: "email",
    setAuthStep: vi.fn(),
    authEmail: "user@example.com",
    setAuthEmail: vi.fn(),
    authPassword: "hunter22",
    setAuthPassword: vi.fn(),
    authName: "",
    setAuthName: vi.fn(),
    authLoading: false,
    setAuthLoading: vi.fn(),
    authNewPassword: "",
    setAuthNewPassword: vi.fn(),
    authNewPassword2: "",
    setAuthNewPassword2: vi.fn(),
    authError: "",
    setAuthError: vi.fn(),
    authFieldErrors: {},
    setAuthFieldErrors: vi.fn(),
    loadUserData: vi.fn(),
  };
  return Object.assign(base, overrides || {});
}

describe("AuthModal backdrop dismissal", function () {
  it("closes when both mousedown and mouseup happen on the backdrop", function () {
    var props = makeProps();
    render(<AuthModal {...props} />);
    var emailInput = screen.getByPlaceholderText(/you@example.com/i);
    // The backdrop is the input's grandparent's furthest ancestor.
    // Walk up until we find an element with position:fixed inset:0.
    var backdrop = emailInput.closest("div[style*='position: fixed']");
    // Sanity check we actually got the backdrop (not the card).
    expect(backdrop).toBeTruthy();

    fireEvent.mouseDown(backdrop, { target: backdrop });
    fireEvent.mouseUp(backdrop, { target: backdrop });

    expect(props.setShowAuth).toHaveBeenCalledWith(false);
  });

  it("does NOT close when mousedown starts inside the card and mouseup lands on the backdrop", function () {
    // This is the bug the user reported — drag-selecting text in the
    // input and releasing on the backdrop must NOT dismiss the modal.
    var props = makeProps();
    render(<AuthModal {...props} />);
    var emailInput = screen.getByPlaceholderText(/you@example.com/i);
    var backdrop = emailInput.closest("div[style*='position: fixed']");

    // mousedown inside (on the input), mouseup on the backdrop.
    fireEvent.mouseDown(emailInput);
    fireEvent.mouseUp(backdrop, { target: backdrop });

    expect(props.setShowAuth).not.toHaveBeenCalled();
  });

  it("does NOT close when mousedown starts on the backdrop but mouseup lands inside the card", function () {
    var props = makeProps();
    render(<AuthModal {...props} />);
    var emailInput = screen.getByPlaceholderText(/you@example.com/i);
    var backdrop = emailInput.closest("div[style*='position: fixed']");

    fireEvent.mouseDown(backdrop, { target: backdrop });
    // mouseup bubbles from inside; backdrop's handler runs but
    // currentTarget !== target, so it should NOT close.
    fireEvent.mouseUp(emailInput);

    expect(props.setShowAuth).not.toHaveBeenCalled();
  });
});
