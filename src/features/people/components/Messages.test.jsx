// Messages.jsx — render + interaction smoke tests.
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import Messages from "./Messages.jsx";
import { makeTheme } from "../../../lib/theme.js";

var t = makeTheme("grass");

function makeDms(overrides) {
  var base = {
    conversations: [],
    requests: [],
    activeConv: null,
    threadMessages: [],
    reactions: {},
    threadLoading: false,
    msgDraft: "",
    setMsgDraft: vi.fn(),
    sending: false,
    replyTo: null,
    setReplyTo: vi.fn(),
    clearReplyTo: vi.fn(),
    editingId: null,
    editDraft: "",
    setEditDraft: vi.fn(),
    partnerLastReadAt: null,
    openConversation: vi.fn(),
    closeConversation: vi.fn(),
    sendMessage: vi.fn(),
    acceptRequest: vi.fn(),
    declineRequest: vi.fn(),
    toggleReaction: vi.fn(),
    startEdit: vi.fn(),
    cancelEdit: vi.fn(),
    submitEdit: vi.fn(),
    deleteMessage: vi.fn(),
    deleteConversation: vi.fn(),
  };
  return Object.assign(base, overrides || {});
}

var authUser = { id: "me-uid" };

describe("Messages — conversation list", function () {
  beforeEach(function () { localStorage.clear(); });

  it("renders empty state when no convs or requests", function () {
    render(<Messages t={t} authUser={authUser} dms={makeDms()} />);
    expect(screen.getByText(/No messages yet/i)).toBeInTheDocument();
  });

  it("renders request rows when present", function () {
    var dms = makeDms({
      requests: [{
        id: "r1", partner: { id: "p1", name: "Alex", avatar: "AL" },
        last_message_preview: "hey!",
      }],
    });
    render(<Messages t={t} authUser={authUser} dms={dms} />);
    expect(screen.getByText("Alex")).toBeInTheDocument();
    expect(screen.getByText(/wants to message you/i)).toBeInTheDocument();
    expect(screen.getByText(/"hey!"/)).toBeInTheDocument();
  });

  it("opens a conversation on tap", function () {
    var dms = makeDms({
      conversations: [{
        id: "c1", partner: { id: "p1", name: "Alex", avatar: "AL" },
        status: "accepted", last_message_preview: "hi", last_message_at: new Date().toISOString(),
        last_message_sender_id: "p1", hasUnread: false,
      }],
    });
    render(<Messages t={t} authUser={authUser} dms={dms} />);
    fireEvent.click(screen.getByText("Alex"));
    expect(dms.openConversation).toHaveBeenCalled();
  });
});

describe("Messages — thread view", function () {
  beforeEach(function () { localStorage.clear(); });

  var baseConv = {
    id: "c1", partner: { id: "p1", name: "Alex", avatar: "AL" },
    status: "accepted", requester_id: "me-uid",
    user1_id: "me-uid", user2_id: "p1",
    lastReadAt: new Date(Date.now() - 60000).toISOString(),
  };

  it("shows empty thread helper text when no messages", function () {
    var dms = makeDms({ activeConv: baseConv, threadMessages: [] });
    render(<Messages t={t} authUser={authUser} dms={dms} />);
    expect(screen.getByText(/Say hello/i)).toBeInTheDocument();
  });

  it("renders own + partner bubbles with correct alignment cues", function () {
    var dms = makeDms({
      activeConv: baseConv,
      threadMessages: [
        { id: "m1", sender_id: "me-uid", content: "hi", created_at: new Date().toISOString() },
        { id: "m2", sender_id: "p1",     content: "yo", created_at: new Date().toISOString() },
      ],
    });
    render(<Messages t={t} authUser={authUser} dms={dms} />);
    expect(screen.getByText("hi")).toBeInTheDocument();
    expect(screen.getByText("yo")).toBeInTheDocument();
  });

  it("send button disabled when draft empty", function () {
    var dms = makeDms({ activeConv: baseConv, msgDraft: "" });
    render(<Messages t={t} authUser={authUser} dms={dms} />);
    var btn = screen.getByRole("button", { name: /send message/i });
    expect(btn).toBeDisabled();
  });

  it("send button calls sendMessage on click", function () {
    var dms = makeDms({ activeConv: baseConv, msgDraft: "hello" });
    render(<Messages t={t} authUser={authUser} dms={dms} />);
    var btn = screen.getByRole("button", { name: /send message/i });
    fireEvent.click(btn);
    expect(dms.sendMessage).toHaveBeenCalled();
  });

  it("opens centered delete-confirmation when Delete Conversation tapped", function () {
    var dms = makeDms({ activeConv: baseConv });
    render(<Messages t={t} authUser={authUser} dms={dms} />);
    // Open settings sheet
    fireEvent.click(screen.getByLabelText(/conversation settings/i));
    fireEvent.click(screen.getByText(/Delete Conversation/i));
    var dialog = screen.getByRole("dialog", { name: /delete conversation/i });
    expect(dialog).toBeInTheDocument();
    // Check modal has centering flex layout
    expect(dialog).toHaveStyle({
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
    });
    // Confirm button wires through
    fireEvent.click(within(dialog).getByRole("button", { name: /^Delete$/ }));
    expect(dms.deleteConversation).toHaveBeenCalledWith("c1");
  });

  it("Cancel in delete-confirmation does NOT call deleteConversation", function () {
    var dms = makeDms({ activeConv: baseConv });
    render(<Messages t={t} authUser={authUser} dms={dms} />);
    fireEvent.click(screen.getByLabelText(/conversation settings/i));
    fireEvent.click(screen.getByText(/Delete Conversation/i));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: /cancel/i }));
    expect(dms.deleteConversation).not.toHaveBeenCalled();
  });

  it("emoji picker button opens picker", function () {
    var dms = makeDms({ activeConv: baseConv });
    render(<Messages t={t} authUser={authUser} dms={dms} />);
    fireEvent.click(screen.getByLabelText(/insert emoji/i));
    // Picker dialog has role=dialog and aria-label "Pick an emoji"
    expect(screen.getByRole("dialog", { name: /pick an emoji/i })).toBeInTheDocument();
  });

  // Regression: Rules-of-Hooks violation would throw on list → thread
  // transition. We re-render the same instance with activeConv flipping
  // from null to a real conversation — React will throw "Rendered more
  // hooks than during the previous render" if any hook is called after
  // an early return.
  it("does not crash when activeConv goes from null to set (hook stability)", function () {
    var dms = makeDms();
    var utils = render(<Messages t={t} authUser={authUser} dms={dms} />);
    expect(screen.getByText(/No messages yet/i)).toBeInTheDocument();

    var dms2 = makeDms({
      activeConv: baseConv,
      threadMessages: [
        { id: "m1", sender_id: "me-uid", content: "hi", created_at: new Date().toISOString() },
      ],
    });
    // Re-render the SAME root — this is what triggers the hook-count check.
    utils.rerender(<Messages t={t} authUser={authUser} dms={dms2} />);
    expect(screen.getByText("hi")).toBeInTheDocument();
  });

  // Regression: user reported left-click on own bubble didn't open the
  // action menu. Opens menu via simulated click on the bubble.
  it("left-click on own bubble opens the action menu", function () {
    var dms = makeDms({
      activeConv: baseConv,
      threadMessages: [
        { id: "m1", sender_id: "me-uid", content: "my message", created_at: new Date().toISOString() },
      ],
    });
    render(<Messages t={t} authUser={authUser} dms={dms} />);
    fireEvent.click(screen.getByText("my message"));
    // Menu has Reply + Copy + Delete for me + Unsend (it's mine).
    expect(screen.getByText("Reply")).toBeInTheDocument();
    expect(screen.getByText("Delete for me")).toBeInTheDocument();
    expect(screen.getByText("Unsend")).toBeInTheDocument();
  });

  it("left-click on partner bubble opens menu WITHOUT delete options", function () {
    var dms = makeDms({
      activeConv: baseConv,
      threadMessages: [
        { id: "m1", sender_id: "p1", content: "partner msg", created_at: new Date().toISOString() },
      ],
    });
    render(<Messages t={t} authUser={authUser} dms={dms} />);
    fireEvent.click(screen.getByText("partner msg"));
    expect(screen.getByText("Reply")).toBeInTheDocument();
    expect(screen.getByText("Copy")).toBeInTheDocument();
    // Delete options must NOT appear on someone else's message.
    expect(screen.queryByText("Delete for me")).toBeNull();
    expect(screen.queryByText("Unsend")).toBeNull();
  });

  // Regression: "+" on the reaction strip didn't open the emoji picker on
  // desktop. The click opens the picker anchored to the button.
  it("'+' button on the action menu opens the emoji picker", function () {
    var dms = makeDms({
      activeConv: baseConv,
      threadMessages: [
        { id: "m1", sender_id: "me-uid", content: "m", created_at: new Date().toISOString() },
      ],
    });
    render(<Messages t={t} authUser={authUser} dms={dms} />);
    fireEvent.click(screen.getByText("m"));
    fireEvent.click(screen.getByLabelText(/more reactions/i));
    expect(screen.getByRole("dialog", { name: /pick an emoji/i })).toBeInTheDocument();
  });

  // Regression: user reported the 😊 button in the input did nothing.
  it("input emoji (😊) button opens the emoji picker", function () {
    var dms = makeDms({ activeConv: baseConv, threadMessages: [] });
    render(<Messages t={t} authUser={authUser} dms={dms} />);
    fireEvent.click(screen.getByLabelText(/insert emoji/i));
    expect(screen.getByRole("dialog", { name: /pick an emoji/i })).toBeInTheDocument();
  });

  // Regression: picking an emoji from the input picker should insert it
  // via setMsgDraft — NOT close the picker without effect.
  it("picking an emoji from the input picker inserts into the draft", function () {
    var dms = makeDms({ activeConv: baseConv, threadMessages: [], msgDraft: "" });
    render(<Messages t={t} authUser={authUser} dms={dms} />);
    fireEvent.click(screen.getByLabelText(/insert emoji/i));
    // Pick a GRID button specifically. The category-tab buttons have an
    // aria-label ("Smileys", "People"...) which filters them out. Grid
    // glyph buttons have no aria-label and font-size:22.
    var picker = screen.getByRole("dialog", { name: /pick an emoji/i });
    var gridBtn = within(picker).getAllByRole("button").find(function (b) {
      return !b.hasAttribute("aria-label") && /\p{Extended_Pictographic}/u.test(b.textContent || "");
    });
    expect(gridBtn).toBeTruthy();
    fireEvent.click(gridBtn);
    expect(dms.setMsgDraft).toHaveBeenCalled();
  });
});
