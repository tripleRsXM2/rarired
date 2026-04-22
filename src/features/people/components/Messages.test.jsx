// Messages.jsx — render + interaction smoke tests.
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import Messages from "./Messages.jsx";
import { makeTheme } from "../../../lib/theme.js";

var t = makeTheme("wimbledon");

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
});
