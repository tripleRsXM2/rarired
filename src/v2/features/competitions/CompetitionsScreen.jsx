// CompetitionsScreen.jsx — Tournaments + ladders hub for the v2
// BaselineApp shell. Faithful port of the design's `competitions.jsx`,
// trimmed only to the inline-style React + theme/accent props pattern
// the rest of v2 uses. Includes the inline create-flow (4-step wizard)
// and a per-tournament detail view with bracket / standings / matches
// tabs. No backend wiring — the seed arrays match the prototype.

import React from "react";
import { avColor } from "../../../lib/utils/avatar.js";

// Deterministic per-name avatar tint. Wraps the v1 avColor helper so
// the Players directory matches the rest of v1's chrome (same shade
// for the same player across PeopleTab, NewMessageScreen, etc.).
function colorForName(name) {
  return avColor(name || "Player");
}

export const SAMPLE_TOURNAMENTS = [
  {
    id: "t1", name: "Riverside Spring Open", kind: "bracket",
    status: "live", round: "Quarterfinal", mode: "elo",
    players: 16, joined: true, surface: "hard",
    nextMatch: { opp: "A. Volkov", when: "Today · 6:00pm", court: "Court 3" },
    starts: "May 4", ends: "May 11",
  },
  {
    id: "t2", name: "Westwood Box League · Div B", kind: "ladder",
    status: "live", round: "Week 3 of 8", mode: "elo",
    players: 8, joined: true, position: 3, surface: "hard",
    nextMatch: { opp: "L. Tanaka", when: "Sat · 10am", court: "Self-arrange" },
    starts: "Apr 20", ends: "Jun 15",
  },
  {
    id: "t3", name: "Saturday Friendlies · Marco", kind: "series",
    status: "live", round: "Match 4 of 10", mode: "casual",
    players: 2, joined: true,
    nextMatch: { opp: "M. Carter", when: "Sat · 9am", court: "Local park" },
    starts: "Apr 1", ends: "Aug 1",
  },
];

const OPEN_TOURNAMENTS = [
  { id: "o1", name: "Bayside Open · Spring",   kind: "bracket",    mode: "elo",    players: 32, spots: 6, starts: "May 18", surface: "clay",  fee: "Free" },
  { id: "o2", name: "Club Champs · Singles",   kind: "bracket",    mode: "elo",    players: 16, spots: 3, starts: "May 25", surface: "grass", fee: "$20"  },
  { id: "o3", name: "Casual Round Robin",      kind: "roundrobin", mode: "casual", players: 8,  spots: 4, starts: "May 11", surface: "hard",  fee: "Free" },
  { id: "o4", name: "Weekend Box · Beginners", kind: "ladder",     mode: "casual", players: 12, spots: 8, starts: "May 9",  surface: "hard",  fee: "Free" },
];

const KINDS = [
  { id: "bracket",    label: "Single elimination", desc: "Knockout bracket. One loss = out." },
  { id: "roundrobin", label: "Round robin",        desc: "Everyone plays everyone once." },
  { id: "ladder",     label: "Box ladder",         desc: "Climb up by challenging higher boxes." },
  { id: "groups",     label: "Groups + knockout",  desc: "Group stage, top advance to bracket." },
  { id: "series",     label: "Casual series",      desc: "Best-of-N matches with one opponent." },
];

const KIND_LABEL = { bracket: "Bracket", ladder: "Box ladder", roundrobin: "Round robin", series: "Series", groups: "Groups + KO" };

export default function CompetitionsScreen({
  theme, accent, court, onLog, competitions,
  // New props for the Players sub-tab. everyonePlayers + friends come
  // from BaselineApp via App.jsx (social.discoverPlayers + dms.friends
  // — same data the v2 NewMessageScreen uses). authUser identifies
  // the viewer so we can exclude them. onMessagePlayer / onInvitePlayer
  // are router callbacks: Message routes into v2 Messages with a
  // draft conv; Invite is a placeholder until the auto-emit widget
  // work on the widgets branch lands here.
  everyonePlayers, friends, authUser, onMessagePlayer, onInvitePlayer,
}) {
  const [view, setView] = React.useState("list");      // 'list' | 'create' | 'detail'
  const [activeTournament, setActiveTournament] = React.useState(null);

  // `competitions` is the live Supabase-backed list from
  // useV2Competitions — leagues the viewer is active in, reshaped to
  // the v2 tournament card schema. Falls back to the SAMPLE seed
  // while the fetch is in flight (or when the viewer is anonymous)
  // so the layout doesn't flash empty on first paint.
  const myList = (competitions && competitions.length > 0) ? competitions : SAMPLE_TOURNAMENTS;

  if (view === "create") {
    return <CreateTournamentScreen theme={theme} accent={accent} court={court} onBack={() => setView("list")} onCreate={() => setView("list")} />;
  }
  if (view === "detail" && activeTournament) {
    return <TournamentDetailScreen t={activeTournament} theme={theme} accent={accent} court={court} onBack={() => setView("list")} onLog={onLog || (() => {})} />;
  }
  return <CompetitionsList theme={theme} accent={accent} court={court}
    myList={myList}
    everyonePlayers={everyonePlayers}
    friends={friends}
    authUser={authUser}
    onMessagePlayer={onMessagePlayer}
    onInvitePlayer={onInvitePlayer}
    onOpen={(t) => { setActiveTournament(t); setView("detail"); }}
    onCreate={() => setView("create")} />;
}

function CompetitionsList({
  theme, accent, court, myList,
  everyonePlayers, friends, authUser,
  onMessagePlayer, onInvitePlayer,
  onOpen, onCreate,
}) {
  const [tab, setTab] = React.useState("mine");
  // Players-tab state.
  const [activePlayer, setActivePlayer] = React.useState(null);
  const [filterRange, setFilterRange] = React.useState("all");      // all | near | similar
  const [filterSurface, setFilterSurface] = React.useState("all");  // all | hard | grass | clay
  const [playerSearch, setPlayerSearch] = React.useState("");
  const meId = (authUser && authUser.id) || null;
  const myElo = 1184; // TODO: thread real rating from useV2Profile once available.

  // Build the player directory from real Supabase data. Friends first
  // (already-connected players take priority), then the rest of the
  // directory. Dedupe by id, exclude self. Each row gets a small
  // computed "match %" + initials/color for the card.
  const directoryPlayers = React.useMemo(function () {
    const seen = {};
    const out = [];
    function push(p, source) {
      if (!p || !p.id || p.id === meId || seen[p.id]) return;
      seen[p.id] = true;
      const name = p.name || "Player";
      const first = name.split(/\s+/)[0] || "";
      const last = name.split(/\s+/).slice(1).join(" ");
      const initials = (first[0] || "?") + (last[0] || "");
      out.push({
        id: p.id,
        name: name,
        handle: p.handle || (first ? "@" + first.toLowerCase().replace(/[^a-z0-9]/g, "") : ""),
        elo: p.ranking_points != null ? p.ranking_points : (p.elo != null ? p.elo : 1100),
        level: p.skill || "—",
        dist: p.suburb || "—",
        club: p.suburb || "",
        surfaces: ["hard"],     // not yet tracked in profiles
        activeNow: source === "friend",
        initials: initials.toUpperCase(),
        color: colorForName(name),
        avatar: p.avatar,
        avatar_url: p.avatar_url || null,
        recent: "—",
        mutual: [],
        avail: [],
        _raw: p,
      });
    }
    (friends || []).forEach(function (f) { push(f, "friend"); });
    (everyonePlayers || []).forEach(function (p) { push(p, "everyone"); });
    return out;
  }, [friends, everyonePlayers, meId]);

  const filteredPlayers = React.useMemo(function () {
    var ql = playerSearch.trim().toLowerCase();
    return directoryPlayers
      .filter(function (p) {
        if (filterRange === "similar" && Math.abs(p.elo - myElo) > 80) return false;
        if (filterSurface !== "all" && !p.surfaces.includes(filterSurface)) return false;
        if (ql && !(p.name + " " + p.handle + " " + p.club).toLowerCase().includes(ql)) return false;
        return true;
      })
      .sort(function (a, b) { return Math.abs(a.elo - myElo) - Math.abs(b.elo - myElo); });
  }, [directoryPlayers, playerSearch, filterRange, filterSurface]);
  // First card in the "Next up" hero — top of the list. We keep the
  // pattern from the design even when the list is empty: render
  // nothing for the hero in that case rather than a fake row.
  const next = (myList && myList[0]) || null;
  const hasNextMatch = next && next.nextMatch;
  return (
    <div style={{ width: "100%", height: "100%", overflowY: "auto", background: theme.bg, color: theme.ink, padding: "20px 18px 100px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
        <div>
          <div className="t-cap" style={{ color: theme.inkSoft }}>Play</div>
          <h1 className="t-serif" style={{ fontSize: 36, lineHeight: 1, margin: "6px 0 0", letterSpacing: "-0.02em" }}>
            {tab === "players" ? <>Find a<br/>match.</> : <>Tournaments<br/>&amp; ladders.</>}
          </h1>
        </div>
        <button onClick={onCreate} className="t-btn" style={{
          appearance: "none", border: 0, borderRadius: 999, padding: "10px 14px",
          background: theme.scoreBg, color: theme.scoreInk,
          fontFamily: "Inter", fontWeight: 600, fontSize: 12, letterSpacing: "0.03em",
          display: "flex", alignItems: "center", gap: 6, cursor: "pointer",
        }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg>
          New
        </button>
      </div>

      <div style={{ display: "flex", background: theme.chip, borderRadius: 10, padding: 3, marginBottom: 18 }}>
        {[["mine", `Mine · ${myList.length}`], ["open", `Open · ${OPEN_TOURNAMENTS.length}`], ["players", "Players"]].map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)} className="t-btn" style={{
            flex: 1, appearance: "none", border: 0, borderRadius: 8, padding: "8px 0",
            background: tab === id ? theme.bgRaised : "transparent",
            color: tab === id ? theme.ink : theme.inkSoft,
            fontFamily: "Inter", fontSize: 12, fontWeight: tab === id ? 700 : 500,
            boxShadow: tab === id ? "0 1px 3px rgba(0,0,0,0.08)" : "none",
            cursor: "pointer",
          }}>{label}</button>
        ))}
      </div>

      {tab === "mine" && (
        <>
          {/* "Next up" hero — only renders when the top league row
              carries an upcoming-match payload. Live Supabase leagues
              don't have one yet (the v1 next-opponent UI computes it
              client-side per detail-view), so this section will be
              hidden for live data until we surface a nextMatch hint
              from useV2Competitions. The sample seed always has one. */}
          {hasNextMatch && (
            <>
              <div className="t-cap" style={{ color: theme.inkSoft, margin: "0 4px 8px" }}>Next up</div>
              <button onClick={() => onOpen(next)} className="t-btn" style={{
                width: "100%", appearance: "none", border: 0, padding: 0, marginBottom: 22,
                borderRadius: 16, overflow: "hidden", background: court.surface, color: "#fbf6e9",
                textAlign: "left", boxShadow: "0 6px 18px rgba(0,0,0,0.12)", cursor: "pointer",
              }}>
                <div style={{ padding: "14px 16px 12px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span className="t-cap" style={{ color: "rgba(251,246,233,0.7)" }}>{next.round}</span>
                  <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 10, fontFamily: "Inter", color: accent, fontWeight: 600 }}>
                    <span style={{ width: 6, height: 6, borderRadius: "50%", background: accent }} className="t-pulse" />
                    LIVE
                  </span>
                </div>
                <div style={{ padding: "0 16px 14px" }}>
                  <div className="t-serif" style={{ fontSize: 22, lineHeight: 1.05, marginBottom: 10 }}>{next.name}</div>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <div>
                      <div style={{ fontSize: 11, color: "rgba(251,246,233,0.6)", fontFamily: "Inter", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 600 }}>vs</div>
                      <div style={{ fontSize: 18, fontFamily: "Inter", fontWeight: 600, marginTop: 2 }}>{next.nextMatch.opp}</div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: 13, fontFamily: "Inter", fontWeight: 600 }}>{next.nextMatch.when}</div>
                      <div style={{ fontSize: 11, color: "rgba(251,246,233,0.6)", marginTop: 2 }}>{next.nextMatch.court}</div>
                    </div>
                  </div>
                </div>
              </button>
            </>
          )}

          <div className="t-cap" style={{ color: theme.inkSoft, margin: "0 4px 8px" }}>Active</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {myList.length === 0 ? (
              <div style={{
                padding: "20px 16px", borderRadius: 14,
                background: theme.bgRaised, border: `0.5px solid ${theme.line}`,
                color: theme.inkSoft, fontFamily: "Inter", fontSize: 13, lineHeight: 1.5,
              }}>
                No leagues yet. Tap <em>New</em> to start a private season with friends.
              </div>
            ) : (
              myList.map((t) => (
                <TournamentCard key={t.id} t={t} theme={theme} accent={accent} onClick={() => onOpen(t)} />
              ))
            )}
          </div>

          <div className="t-cap" style={{ color: theme.inkSoft, margin: "24px 4px 8px" }}>Your standing</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
            <StatTile theme={theme} value="1,184" label="ELO" accent={accent} />
            <StatTile theme={theme} value="#42"   label="Club rank" />
            <StatTile theme={theme} value="3W·1L" label="Tour record" />
          </div>
        </>
      )}

      {tab === "open" && (
        <>
          <div className="t-cap" style={{ color: theme.inkSoft, margin: "0 4px 8px" }}>Open · joinable now</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {OPEN_TOURNAMENTS.map((t) => <OpenTournamentCard key={t.id} t={t} theme={theme} accent={accent} onClick={() => onOpen(t)} />)}
          </div>
        </>
      )}

      {tab === "players" && (
        <>
          {/* Search bar — pill shape matching the design. Filters
              names/handles/clubs in directoryPlayers (built from
              friends + everyonePlayers in BaselineApp). */}
          <div style={{
            background: theme.chip, borderRadius: 999, padding: "9px 14px", marginBottom: 12,
            display: "flex", alignItems: "center", gap: 8,
          }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={theme.inkSoft} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
            <input value={playerSearch} onChange={(e) => setPlayerSearch(e.target.value)} placeholder="Search players, clubs…" style={{
              flex: 1, appearance: "none", border: 0, background: "transparent", outline: "none",
              fontFamily: "Inter", fontSize: 13, color: theme.ink,
            }} />
          </div>

          {/* Filter chip row. Range cycles all → similar (±80 ELO) →
              all; Surface cycles all → hard → grass → clay. "Active
              now" / "Available weekends" are visual placeholders for
              now — backed data lands once we surface presence + free
              slots in the profile shape. */}
          <div className="t-noscroll" style={{ display: "flex", gap: 6, overflowX: "auto", marginBottom: 14, scrollbarWidth: "none" }}>
            <FilterChip
              label={`Range · ${filterRange === "all" ? "Any" : "±80 ELO"}`}
              active={filterRange !== "all"}
              theme={theme} accent={accent}
              onClick={() => setFilterRange(filterRange === "all" ? "similar" : "all")}
            />
            <FilterChip
              label={`Surface · ${filterSurface === "all" ? "Any" : filterSurface[0].toUpperCase() + filterSurface.slice(1)}`}
              active={filterSurface !== "all"}
              theme={theme} accent={accent}
              onClick={() => {
                const order = ["all", "hard", "grass", "clay"];
                setFilterSurface(order[(order.indexOf(filterSurface) + 1) % order.length]);
              }}
            />
            <FilterChip label="Active now" active={false} theme={theme} accent={accent} />
            <FilterChip label="Available weekends" active={false} theme={theme} accent={accent} />
          </div>

          <div className="t-cap" style={{ color: theme.inkSoft, margin: "0 4px 8px" }}>{filteredPlayers.length} players · sorted by skill match</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {filteredPlayers.map((p) => <PlayerCard key={p.id} p={p} myElo={myElo} theme={theme} accent={accent} onClick={() => setActivePlayer(p)} />)}
            {filteredPlayers.length === 0 && (
              <div style={{ textAlign: "center", color: theme.inkFaint, padding: "40px 20px", fontSize: 13 }}>
                {directoryPlayers.length === 0 ? "No players in your directory yet." : "No players match these filters."}
              </div>
            )}
          </div>
        </>
      )}

      {activePlayer && (
        <PlayerProfileSheet
          p={activePlayer}
          myElo={myElo}
          theme={theme}
          accent={accent}
          court={court}
          onClose={() => setActivePlayer(null)}
          onInvite={() => { setActivePlayer(null); onInvitePlayer && onInvitePlayer(activePlayer); }}
          onMessage={() => { setActivePlayer(null); onMessagePlayer && onMessagePlayer(activePlayer); }}
        />
      )}
    </div>
  );
}

function FilterChip({ label, active, theme, accent, onClick }) {
  return (
    <button onClick={onClick} className="t-btn" style={{
      appearance: "none", border: `1px solid ${active ? theme.ink : theme.line}`,
      background: active ? theme.ink : "transparent", color: active ? theme.bg : theme.ink,
      borderRadius: 999, padding: "6px 12px", flexShrink: 0,
      fontFamily: "Inter", fontSize: 11.5, fontWeight: 600, cursor: "pointer",
      whiteSpace: "nowrap",
    }}>{label}</button>
  );
}

function PlayerCard({ p, myElo, theme, accent, onClick }) {
  const eloGap = p.elo - myElo;
  const matchPct = Math.max(40, Math.round(100 - Math.abs(eloGap) * 0.4));
  return (
    <button onClick={onClick} className="t-btn" style={{
      width: "100%", appearance: "none", border: `0.5px solid ${theme.line}`,
      background: theme.bgRaised, color: theme.ink,
      borderRadius: 14, padding: "12px 14px", textAlign: "left", cursor: "pointer",
      display: "flex", alignItems: "center", gap: 12,
    }}>
      <div style={{ position: "relative", flexShrink: 0 }}>
        <div style={{
          width: 48, height: 48, borderRadius: "50%", background: p.color,
          display: "flex", alignItems: "center", justifyContent: "center",
          color: "#fbf6e9", fontFamily: "Inter", fontWeight: 600, fontSize: 16,
          overflow: "hidden",
        }}>
          {p.avatar_url
            ? <img src={p.avatar_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            : p.initials}
        </div>
        {p.activeNow && (
          <span style={{
            position: "absolute", right: -1, bottom: -1, width: 13, height: 13,
            borderRadius: "50%", background: accent, border: `2px solid ${theme.bgRaised}`,
          }} />
        )}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
          <span style={{ fontFamily: "Inter", fontWeight: 700, fontSize: 14, color: theme.ink }}>{p.name}</span>
          {p.handle && <span style={{ fontFamily: "JetBrains Mono", fontSize: 10, color: theme.inkFaint, fontWeight: 500 }}>{p.handle}</span>}
        </div>
        <div style={{ fontSize: 11, color: theme.inkSoft, marginTop: 2, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          <span>{p.level}</span>
          {p.dist && p.dist !== "—" && <><span style={{ color: theme.inkFaint }}>·</span><span>{p.dist}</span></>}
          {p.club && <><span style={{ color: theme.inkFaint }}>·</span><span>{p.club}</span></>}
        </div>
        {p.mutual && p.mutual.length > 0 && (
          <div style={{ fontSize: 10.5, color: accent, marginTop: 4, fontFamily: "Inter", fontWeight: 600 }}>{p.mutual[0]} ↗</div>
        )}
      </div>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 2, flexShrink: 0 }}>
        <div className="t-num" style={{ fontSize: 15, fontWeight: 700, color: theme.ink, letterSpacing: "-0.02em" }}>{p.elo}</div>
        <div style={{ fontSize: 9, color: theme.inkFaint, fontFamily: "Inter", fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase" }}>{matchPct}% match</div>
      </div>
    </button>
  );
}

function PlayerProfileSheet({ p, myElo, theme, accent, court, onClose, onInvite, onMessage }) {
  const recentParts = (p.recent || "—").split(" ");
  const recentTail = recentParts.pop();
  const recentHead = recentParts.join(" ");
  return (
    <div onClick={onClose} style={{
      position: "fixed", inset: 0, zIndex: 100,
      background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "flex-end", justifyContent: "center",
    }}>
      <div onClick={(e) => e.stopPropagation()} style={{
        width: "100%", maxWidth: 480, background: theme.bg, color: theme.ink,
        borderTopLeftRadius: 20, borderTopRightRadius: 20, overflow: "hidden",
        boxShadow: "0 -10px 30px rgba(0,0,0,0.22)",
        maxHeight: "88%", display: "flex", flexDirection: "column",
      }}>
        <div style={{ display: "flex", justifyContent: "center", padding: "8px 0 2px" }}>
          <div style={{ width: 36, height: 4, background: theme.line, borderRadius: 2 }} />
        </div>

        <div style={{ padding: "14px 22px 18px", background: court.surface, color: "#fbf6e9", position: "relative" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{
              width: 64, height: 64, borderRadius: "50%", background: p.color,
              display: "flex", alignItems: "center", justifyContent: "center",
              color: "#fbf6e9", fontFamily: "Inter", fontWeight: 600, fontSize: 22,
              border: "2px solid rgba(251,246,233,0.4)", flexShrink: 0, overflow: "hidden",
            }}>
              {p.avatar_url
                ? <img src={p.avatar_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                : p.initials}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="t-serif" style={{ fontSize: 24, lineHeight: 1.1, letterSpacing: "-0.01em" }}>{p.name}</div>
              {p.handle && <div style={{ fontSize: 12, fontFamily: "JetBrains Mono", color: "rgba(251,246,233,0.7)", marginTop: 2 }}>{p.handle}</div>}
              <div style={{ fontSize: 11, color: "rgba(251,246,233,0.7)", marginTop: 4, fontFamily: "Inter" }}>{p.level}{p.club ? ` · ${p.club}` : ""}</div>
            </div>
          </div>
        </div>

        <div style={{ padding: "14px 22px 8px", display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
          <ProfileStat theme={theme} accent={accent} label="ELO" value={String(p.elo)} sub={(p.elo - myElo >= 0 ? "+" : "") + (p.elo - myElo)} />
          <ProfileStat theme={theme} accent={accent} label="Distance" value={p.dist || "—"} />
          <ProfileStat theme={theme} accent={accent} label="Last result" value={recentTail} sub={recentHead} />
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "12px 22px 18px" }}>
          {p.surfaces && p.surfaces.length > 0 && (
            <>
              <div className="t-cap" style={{ color: theme.inkSoft, marginBottom: 6 }}>Plays on</div>
              <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
                {p.surfaces.map((s) => (
                  <span key={s} style={{
                    fontFamily: "Inter", fontSize: 11, fontWeight: 600,
                    background: theme.chip, color: theme.ink,
                    borderRadius: 6, padding: "4px 9px", textTransform: "capitalize",
                  }}>{s}</span>
                ))}
              </div>
            </>
          )}

          {p.avail && p.avail.length > 0 && (
            <>
              <div className="t-cap" style={{ color: theme.inkSoft, marginBottom: 6 }}>Usually free</div>
              <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
                {p.avail.map((a) => (
                  <span key={a} style={{
                    fontFamily: "Inter", fontSize: 11, fontWeight: 600,
                    background: theme.chip, color: theme.ink,
                    borderRadius: 6, padding: "4px 9px",
                  }}>{a}</span>
                ))}
              </div>
            </>
          )}

          {p.mutual && p.mutual.length > 0 && (
            <>
              <div className="t-cap" style={{ color: theme.inkSoft, marginBottom: 6 }}>Mutual</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 16 }}>
                {p.mutual.map((m) => (
                  <div key={m} style={{
                    display: "flex", alignItems: "center", gap: 8,
                    padding: "8px 10px", background: theme.bgRaised, border: `0.5px solid ${theme.line}`,
                    borderRadius: 10, fontFamily: "Inter", fontSize: 12, color: theme.ink,
                  }}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={accent} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4z"/></svg>
                    {m}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        <div style={{ padding: "12px 22px 28px", display: "flex", gap: 8, borderTop: `0.5px solid ${theme.line}` }}>
          <button onClick={onMessage} className="t-btn" style={{
            flex: 1, appearance: "none", border: `1px solid ${theme.line}`,
            background: theme.bgRaised, color: theme.ink,
            borderRadius: 12, padding: "13px", cursor: "pointer",
            fontFamily: "Inter", fontWeight: 600, fontSize: 13,
            display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
          }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
            Message
          </button>
          <button onClick={onInvite} className="t-btn" style={{
            flex: 2, appearance: "none", border: 0,
            background: accent, color: "#0f1410",
            borderRadius: 12, padding: "13px", cursor: "pointer",
            fontFamily: "Inter", fontWeight: 700, fontSize: 13, letterSpacing: "0.04em",
            display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
          }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>
            INVITE TO PLAY
          </button>
        </div>
      </div>
    </div>
  );
}

function ProfileStat({ theme, accent, label, value, sub }) {
  return (
    <div style={{ background: theme.bgRaised, border: `0.5px solid ${theme.line}`, borderRadius: 10, padding: "10px 12px" }}>
      <div className="t-num" style={{ fontSize: 18, fontWeight: 700, color: theme.ink, lineHeight: 1, letterSpacing: "-0.02em" }}>{value}</div>
      {sub && <div style={{ fontSize: 10, color: accent, marginTop: 4, fontFamily: "Inter", fontWeight: 600 }}>{sub}</div>}
      <div style={{ fontSize: 9, color: theme.inkSoft, marginTop: sub ? 2 : 4, textTransform: "uppercase", letterSpacing: "0.08em", fontFamily: "Inter", fontWeight: 600 }}>{label}</div>
    </div>
  );
}

function TournamentCard({ t, theme, accent, onClick }) {
  const kindLabel = KIND_LABEL[t.kind] || t.kind;
  return (
    <button onClick={onClick} className="t-btn" style={{
      appearance: "none", border: `0.5px solid ${theme.line}`,
      background: theme.bgRaised, color: theme.ink,
      borderRadius: 14, padding: "14px", textAlign: "left", cursor: "pointer",
      display: "flex", flexDirection: "column", gap: 10,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
            <span style={{ fontSize: 9, fontFamily: "Inter", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: theme.inkSoft }}>{kindLabel}</span>
            {t.mode === "elo"    && <span style={{ fontSize: 9, fontFamily: "JetBrains Mono", fontWeight: 700, padding: "2px 6px", borderRadius: 4, background: accent + "33", color: theme.ink }}>ELO</span>}
            {t.mode === "casual" && <span style={{ fontSize: 9, fontFamily: "Inter", fontWeight: 600, padding: "2px 6px", borderRadius: 4, background: theme.chip, color: theme.inkSoft }}>CASUAL</span>}
          </div>
          <div style={{ fontSize: 15, fontFamily: "Inter", fontWeight: 600, lineHeight: 1.2 }}>{t.name}</div>
          <div style={{ fontSize: 11, color: theme.inkSoft, marginTop: 4 }}>{t.round} · {t.players} players</div>
        </div>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ color: theme.inkFaint, flexShrink: 0, marginTop: 4 }}><path d="M9 6l6 6-6 6"/></svg>
      </div>
      {t.nextMatch && (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 10px", background: theme.chip, borderRadius: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ width: 5, height: 5, borderRadius: "50%", background: accent }} />
            <span style={{ fontSize: 11, fontFamily: "Inter", fontWeight: 500 }}>vs {t.nextMatch.opp}</span>
          </div>
          <span style={{ fontSize: 11, color: theme.inkSoft, fontFamily: "Inter" }}>{t.nextMatch.when}</span>
        </div>
      )}
    </button>
  );
}

function OpenTournamentCard({ t, theme, accent, onClick }) {
  const kindLabel = KIND_LABEL[t.kind] || t.kind;
  const filling = (t.players - t.spots) / t.players;
  return (
    <button onClick={onClick} className="t-btn" style={{
      appearance: "none", border: `0.5px solid ${theme.line}`,
      background: theme.bgRaised, color: theme.ink,
      borderRadius: 14, padding: "14px", textAlign: "left", cursor: "pointer",
      display: "flex", flexDirection: "column", gap: 10,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
            <span style={{ fontSize: 9, fontFamily: "Inter", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: theme.inkSoft }}>{kindLabel}</span>
            {t.mode === "elo" && <span style={{ fontSize: 9, fontFamily: "JetBrains Mono", fontWeight: 700, padding: "2px 6px", borderRadius: 4, background: accent + "33", color: theme.ink }}>ELO</span>}
            <span style={{ fontSize: 9, fontFamily: "Inter", fontWeight: 600, padding: "2px 6px", borderRadius: 4, background: theme.chip, color: theme.inkSoft }}>{t.fee}</span>
          </div>
          <div style={{ fontSize: 15, fontFamily: "Inter", fontWeight: 600, lineHeight: 1.2 }}>{t.name}</div>
          <div style={{ fontSize: 11, color: theme.inkSoft, marginTop: 4 }}>Starts {t.starts} · {t.surface}</div>
        </div>
      </div>
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 }}>
          <span style={{ fontSize: 10, fontFamily: "Inter", color: theme.inkSoft, textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 600 }}>{t.players - t.spots}/{t.players} joined</span>
          <span style={{ fontSize: 11, fontFamily: "Inter", fontWeight: 600, color: accent }}>{t.spots} spots →</span>
        </div>
        <div style={{ height: 4, borderRadius: 2, background: theme.chip, overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${filling * 100}%`, background: accent }} />
        </div>
      </div>
    </button>
  );
}

function StatTile({ theme, value, label, accent }) {
  return (
    <div style={{ background: theme.bgRaised, border: `0.5px solid ${theme.line}`, borderRadius: 12, padding: "12px" }}>
      <div className="t-num" style={{ fontSize: 20, fontWeight: 700, color: accent || theme.ink, lineHeight: 1, letterSpacing: "-0.03em" }}>{value}</div>
      <div style={{ fontSize: 9, color: theme.inkSoft, marginTop: 4, textTransform: "uppercase", letterSpacing: "0.08em", fontFamily: "Inter", fontWeight: 600 }}>{label}</div>
    </div>
  );
}

function CreateTournamentScreen({ theme, accent, court, onBack, onCreate }) {
  const [step, setStep] = React.useState(1);
  const [name, setName] = React.useState("Spring Open");
  const [kind, setKind] = React.useState("bracket");
  const [size, setSize] = React.useState(8);
  const [mode, setMode] = React.useState("elo");
  const [players, setPlayers] = React.useState(["You", "M. Carter", "A. Volkov", "L. Tanaka"]);
  const [newPlayer, setNewPlayer] = React.useState("");

  const addPlayer = () => {
    const n = newPlayer.trim();
    if (!n) return;
    setPlayers([...players, n]);
    setNewPlayer("");
  };
  const removePlayer = (i) => setPlayers(players.filter((_, idx) => idx !== i));
  const inputStyle = {
    appearance: "none", border: `1px solid ${theme.line}`, borderRadius: 10,
    background: theme.bgRaised, color: theme.ink, padding: "10px 12px",
    fontFamily: "Inter", fontSize: 13, outline: "none", width: "100%",
  };

  return (
    <div style={{ width: "100%", height: "100%", overflowY: "auto", background: theme.bg, color: theme.ink, padding: "14px 18px 100px", position: "relative" }}>
      <button onClick={onBack} className="t-btn" style={{
        appearance: "none", border: 0, background: "transparent", color: theme.inkSoft,
        fontFamily: "Inter", fontSize: 12, fontWeight: 600,
        display: "inline-flex", alignItems: "center", gap: 4, cursor: "pointer", marginBottom: 8,
      }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
        Back
      </button>
      <div style={{ display: "flex", gap: 6, marginBottom: 18 }}>
        {[1, 2, 3, 4].map((n) => (
          <div key={n} style={{ flex: 1, height: 3, borderRadius: 2, background: n <= step ? accent : theme.chip }} />
        ))}
      </div>

      <div className="t-cap" style={{ color: theme.inkSoft }}>Step {step} of 4</div>

      {step === 1 && (
        <>
          <h2 className="t-serif" style={{ fontSize: 32, lineHeight: 1.05, margin: "6px 0 18px", letterSpacing: "-0.02em" }}>Name your tournament.</h2>
          <FormField theme={theme} label="Tournament name">
            <input value={name} onChange={(e) => setName(e.target.value)} style={inputStyle} />
          </FormField>
          <FormField theme={theme} label="Format">
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 6 }}>
              {KINDS.map((k) => (
                <button key={k.id} onClick={() => setKind(k.id)} className="t-btn" style={{
                  appearance: "none", border: `1.5px solid ${kind === k.id ? accent : theme.line}`,
                  background: kind === k.id ? accent + "15" : theme.bgRaised,
                  color: theme.ink, borderRadius: 12, padding: "12px 14px",
                  textAlign: "left", cursor: "pointer",
                }}>
                  <div style={{ fontSize: 13, fontFamily: "Inter", fontWeight: 600 }}>{k.label}</div>
                  <div style={{ fontSize: 11, color: theme.inkSoft, marginTop: 2 }}>{k.desc}</div>
                </button>
              ))}
            </div>
          </FormField>
        </>
      )}

      {step === 2 && (
        <>
          <h2 className="t-serif" style={{ fontSize: 32, lineHeight: 1.05, margin: "6px 0 18px", letterSpacing: "-0.02em" }}>How many players?</h2>
          <FormField theme={theme} label="Size">
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6 }}>
              {[4, 8, 16, 32, 64].map((n) => (
                <button key={n} onClick={() => setSize(n)} className="t-btn" style={{
                  appearance: "none", border: `1.5px solid ${size === n ? accent : theme.line}`,
                  background: size === n ? accent + "20" : theme.bgRaised,
                  color: theme.ink, borderRadius: 999, padding: "8px 16px",
                  fontFamily: "JetBrains Mono", fontSize: 13, fontWeight: 700, cursor: "pointer",
                }}>{n}</button>
              ))}
            </div>
          </FormField>
          <FormField theme={theme} label="Scoring mode">
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 6 }}>
              <button onClick={() => setMode("elo")} className="t-btn" style={{
                appearance: "none", border: `1.5px solid ${mode === "elo" ? accent : theme.line}`,
                background: mode === "elo" ? accent + "15" : theme.bgRaised,
                color: theme.ink, borderRadius: 12, padding: "14px", textAlign: "left", cursor: "pointer",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                  <span className="t-num" style={{ fontSize: 11, fontWeight: 700, padding: "2px 6px", borderRadius: 4, background: accent + "33" }}>ELO</span>
                  <span style={{ fontSize: 13, fontFamily: "Inter", fontWeight: 700 }}>Official</span>
                </div>
                <div style={{ fontSize: 11, color: theme.inkSoft, lineHeight: 1.3 }}>Affects ratings &amp; club rank.</div>
              </button>
              <button onClick={() => setMode("casual")} className="t-btn" style={{
                appearance: "none", border: `1.5px solid ${mode === "casual" ? accent : theme.line}`,
                background: mode === "casual" ? accent + "15" : theme.bgRaised,
                color: theme.ink, borderRadius: 12, padding: "14px", textAlign: "left", cursor: "pointer",
              }}>
                <div style={{ fontSize: 13, fontFamily: "Inter", fontWeight: 700, marginBottom: 4 }}>Casual</div>
                <div style={{ fontSize: 11, color: theme.inkSoft, lineHeight: 1.3 }}>Just for fun &mdash; no rating impact.</div>
              </button>
            </div>
          </FormField>
        </>
      )}

      {step === 3 && (
        <>
          <h2 className="t-serif" style={{ fontSize: 32, lineHeight: 1.05, margin: "6px 0 18px", letterSpacing: "-0.02em" }}>Add players.</h2>
          <div style={{ marginBottom: 12, fontSize: 11, color: theme.inkSoft, fontFamily: "Inter" }}>{players.length} of {size} added</div>
          <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
            <input value={newPlayer} onChange={(e) => setNewPlayer(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addPlayer()} placeholder="Player name or @handle" style={{ ...inputStyle, flex: 1 }} />
            <button onClick={addPlayer} className="t-btn" style={{
              appearance: "none", border: 0, borderRadius: 10, padding: "0 16px",
              background: theme.scoreBg, color: theme.scoreInk,
              fontFamily: "Inter", fontWeight: 600, fontSize: 12, cursor: "pointer",
            }}>Add</button>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {players.map((p, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 12px", background: theme.bgRaised, border: `0.5px solid ${theme.line}`, borderRadius: 10 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ width: 24, height: 24, borderRadius: "50%", background: theme.chip, color: theme.ink, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontFamily: "JetBrains Mono", fontWeight: 700 }}>{i + 1}</div>
                  <span style={{ fontSize: 13, fontFamily: "Inter", fontWeight: 500 }}>{p}</span>
                </div>
                <button onClick={() => removePlayer(i)} className="t-btn" style={{ appearance: "none", border: 0, background: "transparent", color: theme.inkFaint, cursor: "pointer", padding: 4 }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="6" y1="6" x2="18" y2="18"/><line x1="6" y1="18" x2="18" y2="6"/></svg>
                </button>
              </div>
            ))}
          </div>
        </>
      )}

      {step === 4 && (
        <>
          <h2 className="t-serif" style={{ fontSize: 32, lineHeight: 1.05, margin: "6px 0 18px", letterSpacing: "-0.02em" }}>Review &amp; create.</h2>
          <div style={{ background: court.surface, color: "#fbf6e9", borderRadius: 14, padding: "16px", marginBottom: 14 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
              <span style={{ fontSize: 9, fontFamily: "Inter", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "rgba(251,246,233,0.7)" }}>{KINDS.find((k) => k.id === kind)?.label}</span>
              {mode === "elo" && <span className="t-num" style={{ fontSize: 9, fontWeight: 700, padding: "2px 6px", borderRadius: 4, background: accent, color: "#0f1410" }}>ELO</span>}
            </div>
            <div className="t-serif" style={{ fontSize: 26, lineHeight: 1.05 }}>{name}</div>
            <div style={{ fontSize: 12, color: "rgba(251,246,233,0.7)", marginTop: 6 }}>{size} players · {mode === "elo" ? "Official rating" : "Casual"} · {players.length} confirmed</div>
          </div>
          <Summary theme={theme} label="Format"        value={KINDS.find((k) => k.id === kind)?.label} />
          <Summary theme={theme} label="Size"          value={`${size} players`} />
          <Summary theme={theme} label="Mode"          value={mode === "elo" ? "Official ELO" : "Casual"} />
          <Summary theme={theme} label="Players added" value={`${players.length} / ${size}`} />
        </>
      )}

      <div style={{ display: "flex", gap: 8, marginTop: 24 }}>
        {step > 1 && (
          <button onClick={() => setStep(step - 1)} className="t-btn" style={{
            appearance: "none", border: `0.5px solid ${theme.line}`, borderRadius: 12,
            background: theme.bgRaised, color: theme.ink, padding: "14px 20px",
            fontFamily: "Inter", fontSize: 13, fontWeight: 600, cursor: "pointer",
          }}>Back</button>
        )}
        {step < 4 ? (
          <button onClick={() => setStep(step + 1)} className="t-btn" style={{
            flex: 1, appearance: "none", border: 0, borderRadius: 12,
            background: theme.scoreBg, color: theme.scoreInk, padding: "14px",
            fontFamily: "Inter", fontSize: 13, fontWeight: 700, cursor: "pointer",
          }}>Continue</button>
        ) : (
          <button onClick={() => onCreate({ name, kind, size, mode, players })} className="t-btn" style={{
            flex: 1, appearance: "none", border: 0, borderRadius: 12,
            background: accent, color: "#0f1410", padding: "14px",
            fontFamily: "Inter", fontSize: 13, fontWeight: 700, cursor: "pointer",
          }}>Create tournament</button>
        )}
      </div>
    </div>
  );
}

function FormField({ theme, label, children }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div className="t-cap" style={{ color: theme.inkSoft, marginBottom: 6 }}>{label}</div>
      {children}
    </div>
  );
}
function Summary({ theme, label, value }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", borderBottom: `0.5px solid ${theme.line}` }}>
      <span style={{ fontSize: 12, color: theme.inkSoft, fontFamily: "Inter" }}>{label}</span>
      <span style={{ fontSize: 13, fontFamily: "Inter", fontWeight: 600 }}>{value}</span>
    </div>
  );
}

function TournamentDetailScreen({ t, theme, accent, court, onBack, onLog }) {
  const [view, setView] = React.useState(t.kind === "ladder" || t.kind === "roundrobin" ? "standings" : "bracket");
  const views = [
    ...(t.kind === "bracket" || t.kind === "groups" ? [["bracket", "Bracket"]] : []),
    ["standings", "Standings"],
    ["matches",   "Matches"],
  ];
  return (
    <div style={{ width: "100%", height: "100%", overflowY: "auto", background: theme.bg, color: theme.ink }}>
      <div style={{ padding: "16px 18px 18px", background: court.surface, color: "#fbf6e9" }}>
        <button onClick={onBack} className="t-btn" style={{
          appearance: "none", border: 0, background: "transparent", color: "rgba(251,246,233,0.85)",
          fontFamily: "Inter", fontSize: 12, fontWeight: 600,
          display: "inline-flex", alignItems: "center", gap: 4, cursor: "pointer", marginBottom: 8,
        }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
          Back
        </button>
        <div style={{ fontSize: 9, fontFamily: "Inter", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "rgba(251,246,233,0.7)" }}>{KIND_LABEL[t.kind] || t.kind}</div>
        <div className="t-serif" style={{ fontSize: 28, lineHeight: 1.05, margin: "4px 0 6px", letterSpacing: "-0.01em" }}>{t.name}</div>
        <div style={{ fontSize: 12, color: "rgba(251,246,233,0.7)", fontFamily: "Inter" }}>{t.round} · {t.players} players</div>
        {t.nextMatch && (
          <div style={{ marginTop: 14, display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 12px", background: "rgba(255,255,255,0.10)", borderRadius: 10 }}>
            <div>
              <div style={{ fontSize: 9, color: "rgba(251,246,233,0.6)", textTransform: "uppercase", letterSpacing: "0.08em", fontFamily: "Inter", fontWeight: 600 }}>Next match</div>
              <div style={{ fontSize: 13, fontFamily: "Inter", fontWeight: 600, marginTop: 2 }}>vs {t.nextMatch.opp}</div>
              <div style={{ fontSize: 11, color: "rgba(251,246,233,0.65)" }}>{t.nextMatch.when}</div>
            </div>
            <button onClick={onLog} className="t-btn" style={{
              appearance: "none", border: 0, borderRadius: 999, padding: "8px 14px",
              background: accent, color: "#0f1410",
              fontFamily: "Inter", fontWeight: 700, fontSize: 11, letterSpacing: "0.04em",
              cursor: "pointer",
            }}>SCORE LIVE →</button>
          </div>
        )}
      </div>
      <div style={{ display: "flex", borderBottom: `0.5px solid ${theme.line}`, padding: "0 14px" }}>
        {views.map(([id, label]) => (
          <button key={id} onClick={() => setView(id)} className="t-btn" style={{
            appearance: "none", border: 0, background: "transparent",
            padding: "12px 14px", cursor: "pointer",
            color: view === id ? theme.ink : theme.inkSoft,
            fontFamily: "Inter", fontSize: 12, fontWeight: view === id ? 700 : 500,
            borderBottom: view === id ? `2px solid ${accent}` : "2px solid transparent",
          }}>{label}</button>
        ))}
      </div>
      <div style={{ padding: "16px 18px" }}>
        {view === "bracket"   && <BracketView theme={theme} accent={accent} />}
        {view === "standings" && <StandingsView theme={theme} accent={accent} />}
        {view === "matches"   && <MatchesView theme={theme} accent={accent} onLog={onLog} />}
      </div>
    </div>
  );
}

function BracketView({ theme, accent }) {
  const r1 = [["You", "B. Lin", 6, 4, 6, 3], ["A. Volkov", "D. Marin", 7, 6, 6, 4], ["L. Tanaka", "P. Solis", 6, 1, 6, 2], ["M. Carter", "R. Hassan", 6, 4, 7, 5]];
  const r2 = [["You", "A. Volkov", null, null, null, null], ["L. Tanaka", "M. Carter", null, null, null, null]];
  const r3 = [["?", "?", null, null, null, null]];
  return (
    <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" }} className="t-noscroll">
      <div style={{ display: "flex", gap: 18, minWidth: 600, paddingBottom: 8 }}>
        <BracketCol theme={theme} accent={accent} title="QF"    matches={r1} active={0} />
        <BracketCol theme={theme} accent={accent} title="SF"    matches={r2} pad={28} />
        <BracketCol theme={theme} accent={accent} title="Final" matches={r3} pad={94} />
      </div>
    </div>
  );
}
function BracketCol({ theme, accent, title, matches, pad = 0, active }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, paddingTop: pad, minWidth: 180, flexShrink: 0 }}>
      <div className="t-cap" style={{ color: theme.inkSoft, marginBottom: 4 }}>{title}</div>
      {matches.map((m, i) => {
        const [a, b, sa1, sb1, sa2, sb2] = m;
        const aWon = sa1 != null && (sa1 > sb1) && ((sa2 == null) || (sa2 > sb2));
        const bWon = sa1 != null && !aWon;
        const isActive = active === i;
        return (
          <div key={i} style={{
            background: theme.bgRaised, border: `${isActive ? 1.5 : 0.5}px solid ${isActive ? accent : theme.line}`,
            borderRadius: 8, overflow: "hidden",
          }}>
            <BracketRow name={a} won={aWon} sa={sa1} sb={sa2} theme={theme} />
            <div style={{ height: 0.5, background: theme.line }} />
            <BracketRow name={b} won={bWon} sa={sb1} sb={sb2} theme={theme} />
          </div>
        );
      })}
    </div>
  );
}
function BracketRow({ name, won, sa, sb, theme }) {
  const tbd = sa == null;
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 10px" }}>
      <span style={{ fontSize: 12, fontFamily: "Inter", fontWeight: won ? 700 : 500, color: tbd ? theme.inkFaint : theme.ink }}>{name}</span>
      <div style={{ display: "flex", gap: 8 }}>
        <span className="t-num" style={{ fontSize: 12, fontWeight: 600, color: tbd ? theme.inkFaint : theme.ink }}>{tbd ? "–" : sa}</span>
        <span className="t-num" style={{ fontSize: 12, fontWeight: 600, color: tbd ? theme.inkFaint : theme.ink }}>{tbd ? "–" : (sb ?? "")}</span>
      </div>
    </div>
  );
}
function StandingsView({ theme, accent }) {
  const rows = [
    { rank: 1, name: "A. Volkov",  w: 5, l: 1, pts: 15, you: false },
    { rank: 2, name: "M. Carter",  w: 4, l: 2, pts: 12, you: false },
    { rank: 3, name: "You",        w: 3, l: 2, pts: 9,  you: true  },
    { rank: 4, name: "L. Tanaka",  w: 3, l: 3, pts: 9,  you: false },
    { rank: 5, name: "D. Marin",   w: 2, l: 3, pts: 6,  you: false },
    { rank: 6, name: "P. Solis",   w: 2, l: 4, pts: 6,  you: false },
    { rank: 7, name: "B. Lin",     w: 1, l: 4, pts: 3,  you: false },
    { rank: 8, name: "R. Hassan",  w: 1, l: 5, pts: 3,  you: false },
  ];
  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "24px 1fr 36px 36px 48px", gap: 8, padding: "6px 10px", borderBottom: `0.5px solid ${theme.line}` }}>
        <span className="t-cap" style={{ color: theme.inkSoft }}>#</span>
        <span className="t-cap" style={{ color: theme.inkSoft }}>Player</span>
        <span className="t-cap" style={{ color: theme.inkSoft, textAlign: "right" }}>W</span>
        <span className="t-cap" style={{ color: theme.inkSoft, textAlign: "right" }}>L</span>
        <span className="t-cap" style={{ color: theme.inkSoft, textAlign: "right" }}>Pts</span>
      </div>
      {rows.map((r, i) => (
        <div key={i} style={{
          display: "grid", gridTemplateColumns: "24px 1fr 36px 36px 48px", gap: 8,
          padding: "10px", borderBottom: `0.5px solid ${theme.line}`,
          background: r.you ? accent + "18" : "transparent",
          alignItems: "center",
        }}>
          <span className="t-num" style={{ fontSize: 12, fontWeight: 700, color: r.rank <= 3 ? accent : theme.inkSoft }}>{r.rank}</span>
          <span style={{ fontSize: 13, fontFamily: "Inter", fontWeight: r.you ? 700 : 500 }}>{r.name}{r.you && <span style={{ color: theme.inkSoft, fontSize: 10, marginLeft: 6, fontWeight: 500 }}>· you</span>}</span>
          <span className="t-num" style={{ fontSize: 12, fontWeight: 600, textAlign: "right" }}>{r.w}</span>
          <span className="t-num" style={{ fontSize: 12, fontWeight: 600, textAlign: "right", color: theme.inkSoft }}>{r.l}</span>
          <span className="t-num" style={{ fontSize: 13, fontWeight: 700, textAlign: "right" }}>{r.pts}</span>
        </div>
      ))}
    </div>
  );
}
function MatchesView({ theme, accent, onLog }) {
  const matches = [
    { round: "QF", a: "You",       b: "B. Lin",    score: "6-4 6-3", when: "Mon · done", status: "done" },
    { round: "QF", a: "A. Volkov", b: "D. Marin",  score: "7-6 6-4", when: "Mon · done", status: "done" },
    { round: "SF", a: "You",       b: "A. Volkov", score: null,      when: "Today · 6pm", status: "next" },
    { round: "SF", a: "L. Tanaka", b: "M. Carter", score: null,      when: "Today · 8pm", status: "upcoming" },
    { round: "F",  a: "TBD",       b: "TBD",       score: null,      when: "Sun · 4pm",   status: "upcoming" },
  ];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {matches.map((m, i) => (
        <div key={i} style={{
          background: theme.bgRaised, border: `0.5px solid ${m.status === "next" ? accent : theme.line}`,
          borderRadius: 10, padding: "10px 12px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0, flex: 1 }}>
            <span style={{ width: 28, fontSize: 10, fontFamily: "JetBrains Mono", fontWeight: 700, color: theme.inkSoft, letterSpacing: "0.06em" }}>{m.round}</span>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13, fontFamily: "Inter", fontWeight: 600 }}>{m.a} <span style={{ color: theme.inkFaint }}>vs</span> {m.b}</div>
              <div style={{ fontSize: 11, color: theme.inkSoft }}>{m.when}{m.score && " · " + m.score}</div>
            </div>
          </div>
          {m.status === "next" && (
            <button onClick={onLog} className="t-btn" style={{
              appearance: "none", border: 0, borderRadius: 999, padding: "6px 12px",
              background: accent, color: "#0f1410",
              fontFamily: "Inter", fontWeight: 700, fontSize: 10, letterSpacing: "0.04em",
              cursor: "pointer", flexShrink: 0,
            }}>SCORE</button>
          )}
          {m.status === "done"     && <span style={{ fontSize: 10, color: theme.inkFaint, fontFamily: "Inter", fontWeight: 600, letterSpacing: "0.04em", textTransform: "uppercase" }}>Done</span>}
          {m.status === "upcoming" && <span style={{ fontSize: 10, color: theme.inkFaint, fontFamily: "Inter", fontWeight: 600, letterSpacing: "0.04em", textTransform: "uppercase" }}>Soon</span>}
        </div>
      ))}
    </div>
  );
}
