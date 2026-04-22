// src/features/leagues/components/LeaguesPanel.jsx
//
// The People → Leagues sub-tab. Two modes:
//   • LIST  — shows every league the viewer is in (or invited to) + a
//             "New league" CTA + inline Accept/Decline for pending invites
//   • DETAIL — drill-down into one league: standings table, members list
//             with owner controls, recent activity strip, rules summary
//
// State is local (no router nesting for V1 to keep the diff contained).
// Detail view is opened by selecting a league id; back = null it.

import { useState, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { useLocation, useNavigate } from "react-router-dom";
import PlayerAvatar from "../../../components/ui/PlayerAvatar.jsx";
import { NAV_ICONS } from "../../../lib/constants/navIcons.jsx";
import CreateLeagueModal from "./CreateLeagueModal.jsx";

export default function LeaguesPanel({
  t, authUser,
  leagues,
  profileMap,
  detailCache,
  loadLeagueDetail,
  createLeague,
  inviteToLeague,
  respondToInvite,
  removeMember,
  archiveLeague,
  friends,
  openProfile,
  toast,
}) {
  var [selectedId, setSelectedId]   = useState(null);
  var [showCreate, setShowCreate]   = useState(false);

  var location = useLocation();
  var navigate = useNavigate();

  function report(msg) { if (toast) toast(msg, "error"); else window.alert(msg); }

  // Deep-link: a feed-card league pill navigates to "/people/leagues?id=<uuid>".
  // Auto-select the requested league on mount / URL change, then strip the
  // query param so refreshing doesn't keep reopening it.
  useEffect(function () {
    var params = new URLSearchParams(location.search);
    var urlId = params.get("id");
    if (urlId && urlId !== selectedId) {
      setSelectedId(urlId);
      // Clean the URL so back/refresh doesn't fight the user
      navigate("/people/leagues", { replace: true });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.search]);

  // Load detail lazily when a league is opened
  useEffect(function () {
    if (selectedId && loadLeagueDetail) loadLeagueDetail(selectedId);
  }, [selectedId, loadLeagueDetail]);

  var selectedLeague = useMemo(function () {
    return (leagues || []).find(function (l) { return l.id === selectedId; });
  }, [leagues, selectedId]);

  // ── DETAIL VIEW ────────────────────────────────────────────────────────────
  if (selectedLeague) {
    return (
      <LeagueDetailView
        t={t} authUser={authUser}
        league={selectedLeague}
        detail={detailCache[selectedId]}
        profileMap={profileMap}
        onBack={function () { setSelectedId(null); }}
        onInvite={inviteToLeague}
        onRemove={removeMember}
        onArchive={archiveLeague}
        onRespond={respondToInvite}
        friends={friends}
        openProfile={openProfile}
        toast={toast}
      />
    );
  }

  // ── LIST VIEW ──────────────────────────────────────────────────────────────
  if (!leagues || leagues.length === 0) {
    return (
      <div>
        <ListHeader t={t} onNew={function () { setShowCreate(true); }} />
        <div style={{ textAlign: "center", padding: "40px 20px", background: t.bgCard, border: "1px solid " + t.border, borderRadius: 0 }}>
          <div style={{ fontSize: 32, marginBottom: 10 }}>🎾</div>
          <div style={{ fontSize: 15, fontWeight: 700, color: t.text, marginBottom: 6 }}>No leagues yet</div>
          <div style={{ fontSize: 13, color: t.textSecondary, lineHeight: 1.5, maxWidth: 320, margin: "0 auto 14px" }}>
            Start a private season with your friends. Log matches, climb the standings,
            bragging rights.
          </div>
          <button
            onClick={function () { setShowCreate(true); }}
            style={{ padding: "10px 20px", borderRadius: 0, border: "none", background: t.accent, color: "#fff", fontSize: 13, fontWeight: 700, letterSpacing: "0.02em", cursor: "pointer" }}>
            + Create league
          </button>
        </div>

        {showCreate && (
          <CreateLeagueModal
            t={t} onClose={function () { setShowCreate(false); }}
            createLeague={createLeague}
            onCreated={function (newId) { setSelectedId(newId); }}
            toast={toast}
          />
        )}
      </div>
    );
  }

  return (
    <div>
      <ListHeader t={t} onNew={function () { setShowCreate(true); }} />
      {leagues.map(function (lg) {
        return (
          <LeagueRow
            key={lg.id}
            t={t}
            league={lg}
            authUser={authUser}
            onOpen={function () { setSelectedId(lg.id); }}
            onRespond={respondToInvite}
            toast={toast}
          />
        );
      })}

      {showCreate && (
        <CreateLeagueModal
          t={t} onClose={function () { setShowCreate(false); }}
          createLeague={createLeague}
          onCreated={function (newId) { setSelectedId(newId); }}
          toast={toast}
        />
      )}
    </div>
  );
}

// ── ListHeader ────────────────────────────────────────────────────────────────
function ListHeader({ t, onNew }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
      <div>
        <div style={{ fontSize: 10, fontWeight: 700, color: t.textTertiary, textTransform: "uppercase", letterSpacing: "0.07em" }}>
          Your leagues
        </div>
        <div style={{ fontSize: 11, color: t.textSecondary, marginTop: 2 }}>
          Private seasons with friends.
        </div>
      </div>
      <button onClick={onNew}
        style={{ padding: "8px 14px", borderRadius: 0, border: "none", background: t.accent, color: "#fff", fontSize: 12, fontWeight: 700, letterSpacing: "0.03em", cursor: "pointer" }}>
        + New
      </button>
    </div>
  );
}

// ── LeagueRow ─────────────────────────────────────────────────────────────────
function LeagueRow({ t, league, authUser, onOpen, onRespond, toast }) {
  var pending = league.my_status === "invited";
  var [busy, setBusy] = useState(false);

  async function handleAccept(e) {
    e.stopPropagation();
    setBusy(true);
    var r = await onRespond(league.id, true);
    setBusy(false);
    if (r && r.error) { (toast ? toast(r.error.message || "Could not accept.", "error") : window.alert("Could not accept.")); }
  }
  async function handleDecline(e) {
    e.stopPropagation();
    if (!window.confirm("Decline invitation to " + league.name + "?")) return;
    setBusy(true);
    var r = await onRespond(league.id, false);
    setBusy(false);
    if (r && r.error) { (toast ? toast(r.error.message || "Could not decline.", "error") : window.alert("Could not decline.")); }
  }

  var statusColor = league.status === "active"    ? t.green
                   : league.status === "completed" ? t.orange
                   : t.textTertiary;

  return (
    <div
      onClick={pending ? undefined : onOpen}
      style={{
        background: t.bgCard,
        border: pending ? "2px solid " + t.orange : "1px solid " + t.border,
        borderRadius: 0, padding: "12px 14px", marginBottom: 8,
        cursor: pending ? "default" : "pointer",
        transition: "border-color 0.15s",
      }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: t.text, letterSpacing: "-0.15px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {league.name}
            </div>
            <span style={{ fontSize: 9, fontWeight: 700, color: statusColor, textTransform: "uppercase", letterSpacing: "0.06em" }}>
              {league.status}
            </span>
          </div>
          {league.description && (
            <div style={{ fontSize: 11, color: t.textSecondary, marginBottom: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {league.description}
            </div>
          )}
          <div style={{ fontSize: 10.5, color: t.textTertiary, letterSpacing: "0.01em" }}>
            {formatMatchFormat(league.match_format)}
            {league.max_matches_per_opponent ? " · max " + league.max_matches_per_opponent + " vs each" : ""}
            {league.start_date || league.end_date
              ? " · " + [league.start_date, league.end_date].filter(Boolean).join(" → ")
              : ""}
          </div>
        </div>
        {!pending && (
          <div style={{ color: t.textTertiary, flexShrink: 0, display: "flex", alignItems: "center" }}>
            {/* chevron-right glyph to signal "tap to open" */}
            <svg width="16" height="16" viewBox="0 0 18 18" fill="none">
              <path d="M7 4l5 5-5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
        )}
      </div>

      {/* Pending-invite inline CTAs */}
      {pending && (
        <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
          <button onClick={handleAccept} disabled={busy}
            style={{ flex: 1, padding: "9px 10px", borderRadius: 0, border: "none", background: t.green, color: "#fff", fontSize: 12, fontWeight: 700, letterSpacing: "0.03em", cursor: "pointer", opacity: busy ? 0.6 : 1, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
            <span style={{ display: "flex", alignItems: "center" }}>{NAV_ICONS.check(13)}</span>
            Accept invite
          </button>
          <button onClick={handleDecline} disabled={busy}
            style={{ flex: 1, padding: "9px 10px", borderRadius: 0, border: "1px solid " + t.red, background: "transparent", color: t.red, fontSize: 12, fontWeight: 600, letterSpacing: "0.03em", cursor: "pointer", opacity: busy ? 0.6 : 1, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
            <span style={{ display: "flex", alignItems: "center" }}>{NAV_ICONS.x(13)}</span>
            Decline
          </button>
        </div>
      )}
    </div>
  );
}

function formatMatchFormat(mf) {
  if (mf === "one_set") return "One set";
  if (mf === "best_of_3") return "Best of 3";
  return mf;
}

// ── LeagueDetailView ──────────────────────────────────────────────────────────
function LeagueDetailView({
  t, authUser, league, detail, profileMap,
  onBack, onInvite, onRemove, onArchive, onRespond,
  friends, openProfile, toast,
}) {
  var [inviteOpen, setInviteOpen] = useState(false);
  var myMembership = (detail && detail.members || []).find(function (m) { return m.user_id === authUser.id; });
  var iAmOwner = !!myMembership && myMembership.role === "owner";

  function report(msg) { if (toast) toast(msg, "error"); else window.alert(msg); }

  async function handleArchive() {
    if (!window.confirm("Archive this league? No new matches will be accepted.")) return;
    var r = await onArchive(league.id);
    if (r && r.error) report(r.error.message || "Could not archive.");
  }

  return (
    <div>
      {/* Header + back */}
      <button onClick={onBack}
        style={{ padding: "6px 12px", background: "transparent", border: "1px solid " + t.border, borderRadius: 0, color: t.textSecondary, fontSize: 12, fontWeight: 600, cursor: "pointer", marginBottom: 12 }}>
        ← Back to leagues
      </button>

      <div style={{ background: t.bgCard, border: "1px solid " + t.border, borderRadius: 0, padding: "14px 16px", marginBottom: 14 }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: t.text, letterSpacing: "-0.4px" }}>{league.name}</div>
            {league.description && (
              <div style={{ fontSize: 12, color: t.textSecondary, marginTop: 4 }}>{league.description}</div>
            )}
          </div>
          <span style={{
            fontSize: 9, fontWeight: 700, color: league.status === "active" ? t.green : t.textTertiary,
            background: league.status === "active" ? t.greenSubtle : t.bgTertiary,
            padding: "3px 8px", borderRadius: 20, letterSpacing: "0.06em", textTransform: "uppercase", flexShrink: 0,
          }}>{league.status}</span>
        </div>

        {/* Rules summary — inline under the name */}
        <div style={{ fontSize: 10.5, color: t.textTertiary, marginTop: 8, letterSpacing: "0.01em", lineHeight: 1.5 }}>
          {formatMatchFormat(league.match_format)}
          · {formatTiebreak(league.tiebreak_format)}
          · {league.win_points}pt win / {league.loss_points}pt loss
          {league.max_matches_per_opponent ? " · max " + league.max_matches_per_opponent + " vs each opponent" : " · unlimited matches"}
          {league.start_date || league.end_date
            ? " · " + [league.start_date, league.end_date].filter(Boolean).join(" → ")
            : ""}
        </div>

        {/* Owner actions */}
        {iAmOwner && league.status === "active" && (
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <button onClick={function () { setInviteOpen(true); }}
              style={{ padding: "7px 12px", borderRadius: 0, border: "1px solid " + t.accent, background: "transparent", color: t.accent, fontSize: 11, fontWeight: 700, letterSpacing: "0.03em", textTransform: "uppercase", cursor: "pointer" }}>
              + Invite member
            </button>
            <button onClick={handleArchive}
              style={{ padding: "7px 12px", borderRadius: 0, border: "1px solid " + t.border, background: "transparent", color: t.textSecondary, fontSize: 11, fontWeight: 600, letterSpacing: "0.03em", textTransform: "uppercase", cursor: "pointer" }}>
              Archive season
            </button>
          </div>
        )}
      </div>

      {/* Standings table */}
      <StandingsTable t={t} detail={detail} profileMap={profileMap} openProfile={openProfile} />

      {/* Members list */}
      <MembersList
        t={t} authUser={authUser}
        detail={detail} profileMap={profileMap}
        iAmOwner={iAmOwner} leagueId={league.id}
        onRemove={onRemove}
        openProfile={openProfile}
        toast={toast}
      />

      {/* Recent activity */}
      <RecentActivityList t={t} detail={detail} profileMap={profileMap} />

      {/* Invite modal */}
      {inviteOpen && (
        <InviteMembersModal
          t={t}
          league={league}
          detail={detail}
          friends={friends || []}
          onClose={function () { setInviteOpen(false); }}
          onInvite={onInvite}
          toast={toast}
        />
      )}
    </div>
  );
}

function formatTiebreak(tb) {
  if (tb === "super_tiebreak_final") return "super tiebreak final";
  return "standard tiebreak";
}

// ── StandingsTable ────────────────────────────────────────────────────────────
function StandingsTable({ t, detail, profileMap, openProfile }) {
  var rows = detail && detail.standings || [];
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: t.textTertiary, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 8 }}>
        Standings
      </div>
      <div style={{ background: t.bgCard, border: "1px solid " + t.border, borderRadius: 0, overflow: "hidden" }}>
        {/* Header */}
        <div style={{ display: "grid", gridTemplateColumns: "30px 1fr 36px 36px 40px 42px", gap: 4, padding: "8px 12px", borderBottom: "1px solid " + t.border, background: t.bgTertiary, fontSize: 9, fontWeight: 700, color: t.textTertiary, textTransform: "uppercase", letterSpacing: "0.06em" }}>
          <span>#</span>
          <span>Player</span>
          <span style={{ textAlign: "center" }}>MP</span>
          <span style={{ textAlign: "center" }}>W-L</span>
          <span style={{ textAlign: "center" }}>SD</span>
          <span style={{ textAlign: "right" }}>PTS</span>
        </div>
        {rows.length === 0 && (
          <div style={{ padding: "18px 14px", fontSize: 12, color: t.textTertiary, textAlign: "center" }}>
            No confirmed matches yet. Log one to kick things off.
          </div>
        )}
        {rows.map(function (row, i) {
          var p = profileMap[row.user_id] || { id: row.user_id, name: "Player" };
          var clickable = !!openProfile;
          return (
            <div key={row.user_id}
              onClick={clickable ? function () { openProfile(p.id); } : undefined}
              style={{
                display: "grid", gridTemplateColumns: "30px 1fr 36px 36px 40px 42px", gap: 4,
                alignItems: "center", padding: "8px 12px",
                borderTop: i === 0 ? "none" : "1px solid " + t.border,
                cursor: clickable ? "pointer" : "default",
                fontSize: 12, color: t.text,
              }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: row.rank <= 3 ? t.gold : t.textTertiary, fontVariantNumeric: "tabular-nums" }}>
                {row.rank || "—"}
              </span>
              <span style={{ display: "flex", alignItems: "center", gap: 7, minWidth: 0 }}>
                <PlayerAvatar name={p.name} avatar={p.avatar} profile={p} size={22}/>
                <span style={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {p.name}
                </span>
              </span>
              <span style={{ textAlign: "center", fontVariantNumeric: "tabular-nums" }}>{row.played}</span>
              <span style={{ textAlign: "center", fontVariantNumeric: "tabular-nums" }}>
                <span style={{ color: t.green }}>{row.wins}</span>-<span style={{ color: t.red }}>{row.losses}</span>
              </span>
              <span style={{ textAlign: "center", fontVariantNumeric: "tabular-nums", color: row.set_difference > 0 ? t.green : row.set_difference < 0 ? t.red : t.textTertiary }}>
                {row.set_difference > 0 ? "+" : ""}{row.set_difference}
              </span>
              <span style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", fontWeight: 700, color: t.text }}>
                {row.points}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── MembersList ──────────────────────────────────────────────────────────────
function MembersList({ t, authUser, detail, profileMap, iAmOwner, leagueId, onRemove, openProfile, toast }) {
  var rows = detail && detail.members || [];
  var active  = rows.filter(function (m) { return m.status === "active"; });
  var invited = rows.filter(function (m) { return m.status === "invited"; });
  var declined = rows.filter(function (m) { return m.status === "declined" || m.status === "removed"; });

  function report(msg) { if (toast) toast(msg, "error"); else window.alert(msg); }

  async function handleRemove(userId, name) {
    if (!window.confirm("Remove " + (name || "this member") + " from the league?")) return;
    var r = await onRemove(leagueId, userId);
    if (r && r.error) report(r.error.message || "Could not remove.");
  }

  function Row({ m, showRemove }) {
    var p = profileMap[m.user_id] || { id: m.user_id, name: "Player" };
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", borderTop: "1px solid " + t.border }}>
        <div onClick={openProfile ? function () { openProfile(p.id); } : undefined}
          style={{ cursor: openProfile ? "pointer" : "default", flexShrink: 0 }}>
          <PlayerAvatar name={p.name} avatar={p.avatar} profile={p} size={28}/>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: t.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {p.name}
            {m.role === "owner" && <span style={{ marginLeft: 6, fontSize: 9, color: t.accent, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase" }}>Owner</span>}
          </div>
          {m.status !== "active" && (
            <div style={{ fontSize: 10, color: t.textTertiary, marginTop: 1, letterSpacing: "0.02em" }}>
              {m.status}
            </div>
          )}
        </div>
        {showRemove && m.role !== "owner" && m.user_id !== authUser.id && (
          <button onClick={function () { handleRemove(m.user_id, p.name); }}
            style={{ padding: "4px", borderRadius: 0, background: "transparent", border: "1px solid " + t.border, color: t.textSecondary, cursor: "pointer", display: "inline-flex", alignItems: "center", lineHeight: 0 }}
            title="Remove member">
            <svg width="12" height="12" viewBox="0 0 18 18" fill="none">
              <path d="M4 4l10 10M14 4L4 14" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"/>
            </svg>
          </button>
        )}
      </div>
    );
  }

  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: t.textTertiary, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 8 }}>
        Members · {active.length}
      </div>
      <div style={{ background: t.bgCard, border: "1px solid " + t.border, borderRadius: 0 }}>
        {active.map(function (m) { return <Row key={m.id} m={m} showRemove={iAmOwner} />; })}
        {invited.length > 0 && (
          <>
            <div style={{ padding: "6px 12px", borderTop: "1px solid " + t.border, background: t.bgTertiary, fontSize: 9, fontWeight: 700, color: t.textTertiary, textTransform: "uppercase", letterSpacing: "0.06em" }}>
              Invited · {invited.length}
            </div>
            {invited.map(function (m) { return <Row key={m.id} m={m} showRemove={false} />; })}
          </>
        )}
        {declined.length > 0 && iAmOwner && (
          <>
            <div style={{ padding: "6px 12px", borderTop: "1px solid " + t.border, background: t.bgTertiary, fontSize: 9, fontWeight: 700, color: t.textTertiary, textTransform: "uppercase", letterSpacing: "0.06em" }}>
              Inactive · {declined.length}
            </div>
            {declined.map(function (m) { return <Row key={m.id} m={m} showRemove={false} />; })}
          </>
        )}
      </div>
    </div>
  );
}

// ── RecentActivityList ───────────────────────────────────────────────────────
function RecentActivityList({ t, detail, profileMap }) {
  var rows = detail && detail.recent || [];
  if (!rows.length) return null;

  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: t.textTertiary, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 8 }}>
        Recent activity
      </div>
      <div style={{ background: t.bgCard, border: "1px solid " + t.border, borderRadius: 0 }}>
        {rows.map(function (m, i) {
          var submitter = profileMap[m.user_id] || { name: "Player" };
          var opponent  = profileMap[m.opponent_id] || { name: m.opp_name || "Player" };
          var submitterWon = m.result === "win";
          var winner = submitterWon ? submitter : opponent;
          var loser  = submitterWon ? opponent  : submitter;
          var score = (m.sets || []).map(function (s) { return s.you + "-" + s.them; }).join("  ");
          var dateStr = m.confirmed_at ? new Date(m.confirmed_at).toLocaleDateString("en-AU", { day: "numeric", month: "short" }) : "";
          return (
            <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", borderTop: i === 0 ? "none" : "1px solid " + t.border }}>
              <div style={{ flex: 1, minWidth: 0, fontSize: 12, color: t.text }}>
                <span style={{ fontWeight: 700 }}>{winner.name}</span>
                <span style={{ color: t.textSecondary, fontWeight: 400 }}> def. </span>
                <span>{loser.name}</span>
                <span style={{ color: t.textTertiary, fontWeight: 400, marginLeft: 6, fontVariantNumeric: "tabular-nums" }}>{score}</span>
              </div>
              <span style={{ fontSize: 10, color: t.textTertiary, flexShrink: 0 }}>{dateStr}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── InviteMembersModal — friends-first picker ────────────────────────────────
function InviteMembersModal({ t, league, detail, friends, onClose, onInvite, toast }) {
  var existingMemberIds = useMemo(function () {
    var set = new Set();
    (detail && detail.members || []).forEach(function (m) { set.add(m.user_id); });
    return set;
  }, [detail]);

  var [busy, setBusy]       = useState({});
  var [invited, setInvited] = useState({}); // local echo

  var eligible = (friends || []).filter(function (f) {
    return !existingMemberIds.has(f.id) && !invited[f.id];
  });

  async function handleInvite(friend) {
    setBusy(function (b) { var n = Object.assign({}, b); n[friend.id] = true; return n; });
    var r = await onInvite(league.id, friend.id);
    setBusy(function (b) { var n = Object.assign({}, b); delete n[friend.id]; return n; });
    if (r && r.error) {
      (toast ? toast((r.error && r.error.message) || "Could not send invite.", "error") : window.alert("Could not send invite."));
      return;
    }
    setInvited(function (v) { var n = Object.assign({}, v); n[friend.id] = true; return n; });
  }

  // Same portal fix as CreateLeagueModal — the People tab wraps its content
  // in a .fade-up div whose transform creates a CSS containing block that
  // breaks position:fixed children. Portaling out escapes that.
  return createPortal((
    <div
      onClick={onClose}
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200, padding: "0 16px" }}>
      <div
        onClick={function (e) { e.stopPropagation(); }}
        className="pop"
        style={{ background: t.modalBg, border: "1px solid " + t.border, borderRadius: 16, padding: "20px 20px 22px", width: "100%", maxWidth: 460, maxHeight: "80vh", overflowY: "auto", boxShadow: "0 20px 50px rgba(0,0,0,0.35)" }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, color: t.text, marginBottom: 4, letterSpacing: "-0.2px" }}>
          Invite to {league.name}
        </h2>
        <p style={{ fontSize: 12, color: t.textSecondary, marginBottom: 14 }}>
          Invites are private. Invitees get a notification and choose whether to join.
        </p>

        {eligible.length === 0 && (
          <div style={{ padding: "20px 14px", fontSize: 12, color: t.textTertiary, textAlign: "center" }}>
            {friends && friends.length === 0
              ? "Add friends first — then you can invite them to a league."
              : "All your friends are already in this league."}
          </div>
        )}

        {eligible.map(function (f) {
          return (
            <div key={f.id} style={{
              display: "flex", alignItems: "center", gap: 10,
              padding: "10px 12px", borderTop: "1px solid " + t.border,
            }}>
              <PlayerAvatar name={f.name} avatar={f.avatar} profile={f} size={32}/>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: t.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.name}</div>
                {(f.suburb || f.skill) && (
                  <div style={{ fontSize: 10.5, color: t.textTertiary, marginTop: 1 }}>
                    {[f.suburb, f.skill].filter(Boolean).join(" · ")}
                  </div>
                )}
              </div>
              <button
                onClick={function () { handleInvite(f); }}
                disabled={!!busy[f.id]}
                style={{ padding: "7px 12px", borderRadius: 0, border: "none", background: t.accent, color: "#fff", fontSize: 11, fontWeight: 700, letterSpacing: "0.03em", textTransform: "uppercase", cursor: "pointer", opacity: busy[f.id] ? 0.6 : 1 }}>
                {busy[f.id] ? "…" : "Invite"}
              </button>
            </div>
          );
        })}

        <div style={{ marginTop: 16, textAlign: "right" }}>
          <button onClick={onClose}
            style={{ padding: "8px 14px", borderRadius: 8, border: "1px solid " + t.border, background: "transparent", color: t.text, fontSize: 12, fontWeight: 500, cursor: "pointer" }}>
            Done
          </button>
        </div>
      </div>
    </div>
  ), document.body);
}
