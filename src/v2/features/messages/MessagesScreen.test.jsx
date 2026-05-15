// MessagesScreen.test.jsx — PR2/PR3 widget wiring sanity tests.
//
// Bug A (Mdawg-v2-messages-widgets brief): "old messages aren't appearing
// in the V2 thread view". e2e probe confirms the DB rows are there;
// these tests prove the render path renders them given a healthy
// useDMs return shape. If this passes but the production user still
// sees empty threads, the issue is upstream (auth, conversations fetch,
// data shape) — flip `window.__cs_debug = true` in DevTools to surface
// the gated console breadcrumbs in MessagesScreen.

import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import MessagesScreen from "./MessagesScreen.jsx";

// Minimal theme used by the V2 chrome — any string values keep the
// stylesheet happy without requiring the real theme tokens.
var THEME = {
  bg: "#fff", ink: "#000", inkSoft: "#666", inkFaint: "#999",
  chip: "#eee", line: "#ddd",
};
var ACCENT = "#abc123";

// Stable shapes for the test users.
var ME = { id: "me-uid", email: "me@x.com" };
var ALEX = { id: "alex-uid", name: "Alex Roe", avatar: "AL" };

function makeDms(over) {
  var base = {
    conversations: [
      {
        id: "c-1", isGroup: false, status: "accepted",
        partner: ALEX,
        participants: [{ id: ME.id, name: "You" }, ALEX],
        user1_id: ME.id, user2_id: ALEX.id,
        last_message_at: new Date().toISOString(),
        last_message_preview: "hi from alex",
        last_message_sender_id: ALEX.id,
        hasUnread: false,
      },
    ],
    conversationsLoaded: true,
    activeConv: null,
    threadMessages: [],
    threadLoading: false,
    sending: false,
    pinnedConvIds: [],
    typingConvs: {},
    openConversation: vi.fn(),
    closeConversation: vi.fn(),
    sendMessage: vi.fn().mockResolvedValue({ data: {} }),
    openConversationWith: vi.fn().mockResolvedValue({ error: null }),
  };
  return Object.assign(base, over || {});
}

describe("MessagesScreen — Bug A render path", () => {
  it("renders the inbox row from useDMs.conversations", () => {
    var dms = makeDms();
    render(<MessagesScreen theme={THEME} accent={ACCENT} dms={dms} authUser={ME} />);
    expect(screen.getByText(/Inbox/)).toBeTruthy();
    expect(screen.getByText("Alex Roe")).toBeTruthy();
  });

  it("opens a conversation and renders thread messages", async () => {
    var msgs = [
      { id: "m-1", conversation_id: "c-1", sender_id: ALEX.id, content: "hey there", created_at: new Date().toISOString() },
      { id: "m-2", conversation_id: "c-1", sender_id: ME.id, content: "yo", created_at: new Date().toISOString() },
    ];
    // Two-phase dms: first call (inbox) has no activeConv; after
    // openConversation fires we want the thread render to see the
    // messages. We mutate the same object inside the openConversation
    // mock so the React component re-render via state still wires
    // up against the latest threadMessages.
    var dms = makeDms();
    dms.openConversation = vi.fn(function (conv) {
      dms.activeConv = conv;
      dms.threadMessages = msgs;
      return Promise.resolve();
    });
    var { rerender } = render(<MessagesScreen theme={THEME} accent={ACCENT} dms={dms} authUser={ME} />);
    fireEvent.click(screen.getByText("Alex Roe"));
    // The effect calls openConversation and the parent re-renders
    // with the dms mutation. Wait for the messages to land.
    await waitFor(function () { expect(dms.openConversation).toHaveBeenCalled(); });
    rerender(<MessagesScreen theme={THEME} accent={ACCENT} dms={dms} authUser={ME} />);
    await waitFor(function () {
      expect(screen.getByText("hey there")).toBeTruthy();
      expect(screen.getByText("yo")).toBeTruthy();
    });
  });
});

describe("MessagesScreen — Bug B + C compose flow", () => {
  it("clicking the pencil renders the New Message overlay", () => {
    var dms = makeDms();
    render(<MessagesScreen
      theme={THEME} accent={ACCENT}
      dms={dms} authUser={ME}
      viewerFriends={[{ id: "f-1", name: "Friend One" }]}
      everyonePlayers={[{ id: "e-1", name: "Everyone One" }]}
    />);
    fireEvent.click(screen.getByLabelText("New message"));
    expect(screen.getByText(/New message/)).toBeTruthy();
    expect(screen.getByText("Friend One")).toBeTruthy();
    expect(screen.getByText("Everyone One")).toBeTruthy();
  });

  it("Bug B — typing in inbox search surfaces friends to start a new convo", () => {
    var dms = makeDms({ conversations: [] }); // no convs match
    render(<MessagesScreen
      theme={THEME} accent={ACCENT}
      dms={dms} authUser={ME}
      viewerFriends={[{ id: "f-1", name: "Alex Roe" }]}
      everyonePlayers={[{ id: "e-1", name: "Alex Stranger" }]}
    />);
    fireEvent.change(screen.getByPlaceholderText(/Search players/), { target: { value: "Alex" } });
    expect(screen.getByText(/Start a new message/)).toBeTruthy();
    expect(screen.getByText("Alex Roe")).toBeTruthy();
    expect(screen.getByText("Alex Stranger")).toBeTruthy();
  });
});

describe("MessagesScreen — PR2/PR3 widget renderer", () => {
  it("renders a ConfirmCard for kind=score when viewer is pending opponent", async () => {
    var matchId = "match-1";
    var msgs = [{
      id: "m-w-1", conversation_id: "c-1", sender_id: ALEX.id,
      content: "Match logged: 6-2 6-3", created_at: new Date().toISOString(),
      kind: "score", payload: { matchId: matchId, status: "pending_confirmation" },
    }];
    var match = {
      id: matchId, user_id: ALEX.id, opponent_id: ME.id,
      opp_name: "Mdawg", sets: [{ you: 6, them: 2 }, { you: 6, them: 3 }],
      status: "pending_confirmation", match_type: "ranked", league_id: null,
      court: "Hard", venue: "Local",
    };
    // Pre-seed matchHistory.history so MessagesScreen's local lookup
    // resolves without hitting Supabase.
    var matchHistory = {
      history: [match],
      confirmOpponentMatch: vi.fn().mockResolvedValue({ error: null }),
      setDisputeModal: vi.fn(),
    };
    var dms = makeDms();
    dms.openConversation = vi.fn(function (conv) {
      dms.activeConv = conv;
      dms.threadMessages = msgs;
      return Promise.resolve();
    });
    var challenges = { challenges: [] };
    var { rerender } = render(<MessagesScreen
      theme={THEME} accent={ACCENT}
      dms={dms} authUser={ME}
      matchHistory={matchHistory} challenges={challenges}
    />);
    fireEvent.click(screen.getByText("Alex Roe"));
    await waitFor(function () { expect(dms.openConversation).toHaveBeenCalled(); });
    rerender(<MessagesScreen
      theme={THEME} accent={ACCENT}
      dms={dms} authUser={ME}
      matchHistory={matchHistory} challenges={challenges}
    />);
    await waitFor(function () {
      expect(screen.getByText(/CONFIRM SCORE/)).toBeTruthy();
    });
    fireEvent.click(screen.getByText("Confirm"));
    expect(matchHistory.confirmOpponentMatch).toHaveBeenCalledWith(match);
  });

  it("renders an InviteCard with Accept/Decline for kind=invite when viewer is the challenged", async () => {
    var challengeId = "ch-1";
    var msgs = [{
      id: "m-w-2", conversation_id: "c-1", sender_id: ALEX.id,
      content: "Sent you a match invite", created_at: new Date().toISOString(),
      kind: "invite", payload: { challengeId: challengeId },
    }];
    var challenge = {
      id: challengeId, challenger_id: ALEX.id, challenged_id: ME.id,
      status: "pending", venue: "Park", court: "Court 2",
      proposed_at: null, created_at: new Date().toISOString(),
    };
    var challenges = {
      challenges: [challenge],
      acceptChallenge: vi.fn().mockResolvedValue({ error: null }),
      declineChallenge: vi.fn().mockResolvedValue({ error: null }),
    };
    var dms = makeDms();
    dms.openConversation = vi.fn(function (conv) {
      dms.activeConv = conv;
      dms.threadMessages = msgs;
      return Promise.resolve();
    });
    var { rerender } = render(<MessagesScreen
      theme={THEME} accent={ACCENT}
      dms={dms} authUser={ME}
      challenges={challenges}
    />);
    fireEvent.click(screen.getByText("Alex Roe"));
    await waitFor(function () { expect(dms.openConversation).toHaveBeenCalled(); });
    rerender(<MessagesScreen
      theme={THEME} accent={ACCENT}
      dms={dms} authUser={ME}
      challenges={challenges}
    />);
    await waitFor(function () {
      expect(screen.getByText(/MATCH INVITE/)).toBeTruthy();
      expect(screen.getByText("Accept")).toBeTruthy();
      expect(screen.getByText("Decline")).toBeTruthy();
    });
    fireEvent.click(screen.getByText("Accept"));
    expect(challenges.acceptChallenge).toHaveBeenCalledWith(challenge);
  });
});
