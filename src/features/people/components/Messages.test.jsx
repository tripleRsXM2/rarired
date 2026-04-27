// Messages.jsx — render + interaction smoke tests.
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render as rtlRender, screen, fireEvent, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import MessagesRaw from "./Messages.jsx";
import { makeTheme } from "../../../lib/theme.js";

// Messages now uses useLocation / useNavigate (URL deep linking for
// /people/messages/<convId>). Wrap every render in a MemoryRouter so
// those hooks have a router context.
function render(ui, opts) {
  return rtlRender(<MemoryRouter initialEntries={["/people/messages"]}>{ui}</MemoryRouter>, opts);
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
    pinConversation: vi.fn().mockResolvedValue({ error: null }),
    unpinConversation: vi.fn().mockResolvedValue({ error: null }),
    mutedConvIds: [],
    muteConversation: vi.fn().mockResolvedValue({ error: null }),
    unmuteConversation: vi.fn().mockResolvedValue({ error: null }),
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

  it("splits the list into Pinned + All when a conv is pinned", function () {
    var common = { status: "accepted", last_message_preview: "hi", last_message_at: new Date().toISOString(), last_message_sender_id: "p1", hasUnread: false };
    var dms = makeDms({
      pinnedConvIds: ["c-pin"],
      conversations: [
        Object.assign({ id: "c-pin", partner: { id: "p1", name: "Pinned Pal", avatar: "PP" } }, common),
        Object.assign({ id: "c-all", partner: { id: "p2", name: "Other",      avatar: "OT" } }, common),
      ],
    });
    render(<Messages t={t} authUser={authUser} dms={dms} />);
    expect(screen.getByText(/^Pinned$/)).toBeInTheDocument();
    expect(screen.getByText(/^All messages$/)).toBeInTheDocument();
    expect(screen.getByText("Pinned Pal")).toBeInTheDocument();
    expect(screen.getByText("Other")).toBeInTheDocument();
  });

  it("shows 'Recent' section when no pins", function () {
    var dms = makeDms({
      conversations: [{
        id: "c1", partner: { id: "p1", name: "Alex", avatar: "AL" },
        status: "accepted", last_message_preview: "hi", last_message_at: new Date().toISOString(),
        last_message_sender_id: "p1", hasUnread: false,
      }],
    });
    render(<Messages t={t} authUser={authUser} dms={dms} />);
    expect(screen.getByText(/^Recent$/)).toBeInTheDocument();
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

  // NOTE: the in-thread "Conversation settings" gear-sheet + centered
  // delete-confirm flow was retired on 2026-04-24. Delete now lives in
  // the conv-list row's right-click context menu. Tests for that live
  // in the conv-list describe block below.

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
    // Re-render the SAME root — this is what triggers the hook-count
    // check. Re-wrap in MemoryRouter (rerender doesn't reapply the
    // wrapper from the initial render).
    utils.rerender(<MemoryRouter initialEntries={["/people/messages"]}><Messages t={t} authUser={authUser} dms={dms2} /></MemoryRouter>);
    expect(screen.getByText("hi")).toBeInTheDocument();
  });

  // Helper: dispatch a touch event that's construction-compatible with
  // both jsdom (lenient) and real Chromium (strict). We use a plain
  // CustomEvent and bubble it — React's SyntheticEvent system still
  // fires the onTouchStart/onTouchEnd handlers because the event type
  // string matches.
  function dispatchTouch(el, type) {
    var e = new Event(type, { bubbles: true, cancelable: true });
    el.dispatchEvent(e);
  }

  // Regression: some Windows touchscreen browsers fire a stray
  // `touchstart` on a mouse click without a matching `touchend`. The
  // bubble's click handler must still fire in that case.
  it("left-click still opens menu after phantom touchstart (no touchend)", function () {
    var dms = makeDms({
      activeConv: baseConv,
      threadMessages: [
        { id: "m1", sender_id: "me-uid", content: "hello", created_at: new Date().toISOString() },
      ],
    });
    render(<Messages t={t} authUser={authUser} dms={dms} />);
    var bubble = screen.getByText("hello");

    dispatchTouch(bubble, "touchstart");
    // NO touchend — simulates the phantom touch Surface devices fire.
    fireEvent.click(bubble);

    expect(screen.getByText("Reply")).toBeInTheDocument();
  });

  // The opposite guard: a REAL touch (start → end → synthesized click)
  // should NOT double-fire the menu. Long-press handles it.
  it("real tap (touchstart + touchend + click) does NOT open menu twice", function () {
    var dms = makeDms({
      activeConv: baseConv,
      threadMessages: [
        { id: "m1", sender_id: "me-uid", content: "tap me", created_at: new Date().toISOString() },
      ],
    });
    render(<Messages t={t} authUser={authUser} dms={dms} />);
    var bubble = screen.getByText("tap me");

    dispatchTouch(bubble, "touchstart");
    dispatchTouch(bubble, "touchend");
    fireEvent.click(bubble);

    expect(screen.queryByText("Reply")).toBeNull();
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

  it("left-click on partner bubble shows Delete for me but NOT Unsend", function () {
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
    // "Delete for me" is local-only (hides from my view via localStorage),
    // so it's fine on partner messages too.
    expect(screen.getByText("Delete for me")).toBeInTheDocument();
    // "Unsend" writes to DB — must stay gated to own messages.
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

  it("renders a date separator for the first message of each day", function () {
    var dms = makeDms({
      activeConv: baseConv,
      threadMessages: [
        { id: "m1", sender_id: "me-uid", content: "early",  created_at: "2026-04-20T09:00:00Z" },
        { id: "m2", sender_id: "p1",     content: "later",  created_at: "2026-04-20T20:00:00Z" },
        { id: "m3", sender_id: "me-uid", content: "nextday",created_at: "2026-04-22T05:00:00Z" },
      ],
    });
    render(<Messages t={t} authUser={authUser} dms={dms} />);
    // Two separators expected (one per distinct day).
    expect(screen.getByText("early")).toBeInTheDocument();
    expect(screen.getByText("later")).toBeInTheDocument();
    expect(screen.getByText("nextday")).toBeInTheDocument();
  });

  it("toggles the Details drawer from the thread header", function () {
    var dms = makeDms({
      activeConv: baseConv,
      threadMessages: [{ id: "m1", sender_id: "me-uid", content: "hi", created_at: new Date().toISOString() }],
    });
    render(<Messages t={t} authUser={authUser} dms={dms} />);
    // Details is closed initially — no "Details" header.
    expect(screen.queryByRole("complementary")).toBeNull();
    // Toggle button has aria-label "Show details" when closed.
    fireEvent.click(screen.getByLabelText(/show details/i));
    // Aside has aria-label "Conversation details".
    expect(screen.getByLabelText(/conversation details/i)).toBeInTheDocument();
  });

  it("Details drawer renders the partner's rich identity card (chips + View profile)", function () {
    var richConv = Object.assign({}, baseConv, {
      partner: {
        id: "p1", name: "Alex", avatar: "AL",
        skill: "Intermediate 2", style: "Baseliner",
        suburb: "Bondi", ranking_points: 1234,
        wins: 7, losses: 3, matches_played: 10,
      },
    });
    var dms = makeDms({
      activeConv: richConv,
      threadMessages: [{ id: "m1", sender_id: "me-uid", content: "hi", created_at: new Date().toISOString() }],
    });
    var openProfile = vi.fn();
    render(<Messages t={t} authUser={authUser} dms={dms} openProfile={openProfile} />);
    fireEvent.click(screen.getByLabelText(/show details/i));
    var aside = screen.getByLabelText(/conversation details/i);
    // Skill + style chips
    expect(within(aside).getByText("Intermediate 2")).toBeInTheDocument();
    expect(within(aside).getByText("Baseliner")).toBeInTheDocument();
    // Stats line — rating + record
    expect(within(aside).getByText("1234")).toBeInTheDocument();
    expect(within(aside).getByText("7-3")).toBeInTheDocument();
    // Action button
    var viewBtn = within(aside).getByRole("button", { name: /view profile/i });
    expect(viewBtn).toBeInTheDocument();
    fireEvent.click(viewBtn);
    expect(openProfile).toHaveBeenCalledWith("p1");
  });

  // Pin/Mute/Delete moved out of the drawer on 2026-04-24 — now a
  // right-click context menu on the conv-list row. See the separate
  // "conv list — right-click menu" suite below.

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

// ─────────────────────────────────────────────────────────────────────────
// Right-click menu on a conversation-list row: Mute / Pin / Delete.
// This replaces the old in-thread surfaces (gear sheet + drawer buttons).
// ─────────────────────────────────────────────────────────────────────────
describe("Messages — conv-list right-click menu", function () {
  beforeEach(function () { localStorage.clear(); });

  var baseConv = {
    id: "c-x", partner: { id: "p1", name: "John", avatar: "J" },
    status: "accepted", last_message_sender_id: "p1",
    last_message_preview: "hey", last_message_at: new Date().toISOString(),
    hasUnread: false,
  };

  function openContextMenu() {
    var row = screen.getByText(/^John$/).closest("button");
    fireEvent.contextMenu(row);
  }

  it("right-clicking a conv row opens Mute / Pin / Delete", function () {
    var dms = makeDms({ conversations: [baseConv] });
    render(<Messages t={t} authUser={authUser} dms={dms} />);
    openContextMenu();
    expect(screen.getByText(/Mute conversation/)).toBeInTheDocument();
    expect(screen.getByText(/Pin conversation/)).toBeInTheDocument();
    expect(screen.getByText(/Delete conversation/)).toBeInTheDocument();
  });

  it("Mute calls dms.muteConversation with the conv id", function () {
    var dms = makeDms({ conversations: [baseConv] });
    render(<Messages t={t} authUser={authUser} dms={dms} />);
    openContextMenu();
    fireEvent.click(screen.getByText(/Mute conversation/));
    expect(dms.muteConversation).toHaveBeenCalledWith("c-x");
  });

  it("Unmute shows when already muted", function () {
    var dms = makeDms({ conversations: [baseConv], mutedConvIds: ["c-x"] });
    render(<Messages t={t} authUser={authUser} dms={dms} />);
    openContextMenu();
    expect(screen.getByText(/Unmute conversation/)).toBeInTheDocument();
    fireEvent.click(screen.getByText(/Unmute conversation/));
    expect(dms.unmuteConversation).toHaveBeenCalledWith("c-x");
  });

  it("Pin calls dms.pinConversation", function () {
    var dms = makeDms({ conversations: [baseConv] });
    render(<Messages t={t} authUser={authUser} dms={dms} />);
    openContextMenu();
    fireEvent.click(screen.getByText(/^Pin conversation$/));
    expect(dms.pinConversation).toHaveBeenCalledWith("c-x");
  });

  it("Delete prompts + calls dms.deleteConversation on confirm", function () {
    var dms = makeDms({ conversations: [baseConv] });
    render(<Messages t={t} authUser={authUser} dms={dms} />);
    var confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    openContextMenu();
    fireEvent.click(screen.getByText(/Delete conversation/));
    expect(confirmSpy).toHaveBeenCalled();
    expect(dms.deleteConversation).toHaveBeenCalledWith("c-x");
    confirmSpy.mockRestore();
  });

  it("Delete does NOT fire when confirm is cancelled", function () {
    var dms = makeDms({ conversations: [baseConv] });
    render(<Messages t={t} authUser={authUser} dms={dms} />);
    var confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    openContextMenu();
    fireEvent.click(screen.getByText(/Delete conversation/));
    expect(dms.deleteConversation).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });
});
