// Messages.jsx — group-conversation rendering.
//
// Phase-4 UI: inbox rows for groups render an avatar stack + composed
// title (no presence dot, no seen tick). Thread headers tap into a
// GroupDetailsDrawer instead of openProfile(). Composer placeholder
// reads "Message group…" when active conversation is a group.
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render as rtlRender, screen, fireEvent, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import MessagesRaw from "./Messages.jsx";
import { makeTheme } from "../../../lib/theme.js";

function render(ui) {
  return rtlRender(<MemoryRouter initialEntries={["/people/messages"]}>{ui}</MemoryRouter>);
}
var Messages = MessagesRaw;

var t = makeTheme("grass");

function makeDms(overrides) {
  var base = {
    conversations: [],
    requests: [],
    conversationsLoaded: true,
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
    pinnedConvIds: [],
    pinConversation: vi.fn(),
    unpinConversation: vi.fn(),
    mutedConvIds: [],
    muteConversation: vi.fn(),
    unmuteConversation: vi.fn(),
    typingConvs: {},
    notifyTyping: vi.fn(),
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

describe("Messages — group conversations", function () {
  beforeEach(function () { localStorage.clear(); });

  var groupParticipants = [
    { id: "me-uid", name: "Me",    avatar: "ME" },
    { id: "p-a",    name: "Alex",  avatar: "AL" },
    { id: "p-b",    name: "Brett", avatar: "BR" },
  ];

  var groupConv = {
    id: "g1",
    isGroup: true,
    is_group: true,
    participants: groupParticipants,
    partner: null,
    status: "accepted",
    last_message_preview: "doubles tomorrow?",
    last_message_at: new Date().toISOString(),
    last_message_sender_id: "p-a",
    hasUnread: false,
  };

  it("group inbox row renders the composed title and an avatar stack", function () {
    var dms = makeDms({ conversations: [groupConv] });
    render(<Messages t={t} authUser={authUser} dms={dms} />);
    // Title: 2 non-self participants → "Alex & Brett"
    expect(screen.getByText("Alex & Brett")).toBeInTheDocument();
    // The stack should show ONE avatar per non-self participant. PlayerAvatar
    // renders the initials inside the avatar shell, so each non-self
    // participant's initials should appear.
    var row = screen.getByText("Alex & Brett").closest("button");
    expect(within(row).getByText("AL")).toBeInTheDocument();
    expect(within(row).getByText("BR")).toBeInTheDocument();
  });

  it("group thread header opens a participant drawer with each member", function () {
    var dms = makeDms({ activeConv: groupConv, threadMessages: [] });
    render(<Messages t={t} authUser={authUser} dms={dms} />);
    // The header tap target has aria-label "Group details"
    var headerBtn = screen.getByLabelText(/group details/i);
    expect(headerBtn).toBeInTheDocument();
    expect(within(headerBtn).getByText("Alex & Brett")).toBeInTheDocument();
    fireEvent.click(headerBtn);
    // Drawer is a dialog with aria-label "Group details"
    var drawer = screen.getByRole("dialog", { name: /group details/i });
    expect(drawer).toBeInTheDocument();
    // Each participant rendered as a row inside the drawer, including self.
    expect(within(drawer).getByText(/^Me \(you\)$/)).toBeInTheDocument();
    expect(within(drawer).getByText(/^Alex$/)).toBeInTheDocument();
    expect(within(drawer).getByText(/^Brett$/)).toBeInTheDocument();
  });

  it("composer placeholder reads 'Message group…' for group threads", function () {
    var dms = makeDms({ activeConv: groupConv, threadMessages: [] });
    render(<Messages t={t} authUser={authUser} dms={dms} />);
    var textarea = screen.getByPlaceholderText(/message group…/i);
    expect(textarea).toBeInTheDocument();
  });
});
