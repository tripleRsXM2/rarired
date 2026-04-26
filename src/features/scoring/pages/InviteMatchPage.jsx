// src/features/scoring/pages/InviteMatchPage.jsx
//
// Module 9 — invite landing page at /invite/match/:token.
//
// Handles every invite state the spec calls out:
//   • not_found / invalid token
//   • expired / revoked / declined
//   • claimed (by someone else, or by current user)
//   • pending + logged out → safe preview + "Sign in to claim"
//   • pending + logged in as the logger → "Share with your opponent"
//   • pending + logged in as a third party → Claim / This wasn't me
//
// Auth-redirect: the page reads ?next= from the URL on mount; the
// AuthModal preserves the value through sign-in/up so a logged-out
// recipient lands back here after auth without re-pasting the link.
//
// Claim does NOT auto-confirm. After successful claim we route the
// user to /home and let the existing ActionReviewDrawer handle the
// confirm/dispute action — no parallel review UI in this module.

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  previewMatchInvite,
  claimMatchInvite,
  declineMatchInvite,
} from "../services/inviteService.js";
import { formatMatchScore } from "../utils/tennisScoreValidation.js";
import { track } from "../../../lib/analytics.js";

export default function InviteMatchPage({ t, token, authUser, openAuth }) {
  var navigate = useNavigate();
  var [loading, setLoading] = useState(true);
  var [preview, setPreview] = useState(null);
  var [error,   setError]   = useState("");
  var [busy,    setBusy]    = useState(false);

  // Load preview on mount + whenever auth state changes (so the
  // caller_is_logger flag refreshes after sign-in).
  useEffect(function () {
    var alive = true;
    setLoading(true);
    previewMatchInvite(token).then(function (r) {
      if (!alive) return;
      setLoading(false);
      if (r.error) {
        setError(r.error.message || "Couldn't load this invite.");
        return;
      }
      setPreview(r.data || null);
      if (r.data && (r.data.status === "pending" || r.data.status === "claimed")) {
        if (track) track("opponent_invite_opened", { status: r.data.status });
      }
    });
    return function () { alive = false; };
  }, [token, authUser && authUser.id]);

  async function handleClaim() {
    if (!authUser) {
      openAuthForReturn();
      return;
    }
    setBusy(true); setError("");
    var r = await claimMatchInvite(token);
    setBusy(false);
    if (r.error) {
      setError(r.error.message || "Couldn't claim this invite.");
      return;
    }
    if (track) track("opponent_invite_claimed", { match_id: r.data && r.data.match_id });
    // Land on the feed with the match id highlighted so the existing
    // ActionReviewDrawer (Confirm / Dispute / Not my match) takes over.
    var matchId = r.data && r.data.match_id;
    if (matchId) {
      navigate("/home", { state: { highlightMatchId: matchId } });
    } else {
      navigate("/home");
    }
  }

  async function handleDecline() {
    if (!authUser) {
      openAuthForReturn();
      return;
    }
    if (!window.confirm("Mark this invite as 'not me'? The match won't be attached to your profile.")) return;
    setBusy(true); setError("");
    var r = await declineMatchInvite(token);
    setBusy(false);
    if (r.error) {
      setError(r.error.message || "Couldn't decline this invite.");
      return;
    }
    if (track) track("opponent_invite_declined", {});
    setPreview(Object.assign({}, preview || {}, { status: "declined" }));
  }

  function openAuthForReturn() {
    // Stash the invite URL so AuthModal's success handler can come
    // back here after sign-in. Both URL ?next= and sessionStorage are
    // populated — sessionStorage covers magic-link / email-verify
    // flows where the URL gets clobbered by the auth provider.
    var here = window.location.pathname + window.location.search;
    try { sessionStorage.setItem("cs_auth_next", here); } catch (_) {}
    if (openAuth) {
      openAuth({ next: here });
    } else {
      navigate("/?next=" + encodeURIComponent(here));
    }
  }

  // ─── Render branches ────────────────────────────────────────────────

  if (loading) {
    return (
      <Layout t={t}>
        <Eyebrow t={t}>Loading invite…</Eyebrow>
      </Layout>
    );
  }

  if (error || !preview) {
    return (
      <Layout t={t}>
        <Eyebrow t={t} color={t.red}>Couldn't load</Eyebrow>
        <Title t={t}>Something went wrong.</Title>
        <Body t={t}>{error || "Try opening the link again."}</Body>
        <PrimaryBtn t={t} onClick={function () { navigate("/home"); }}>
          Go to CourtSync
        </PrimaryBtn>
      </Layout>
    );
  }

  var status = preview.status;

  if (status === "not_found") {
    return (
      <Layout t={t}>
        <Eyebrow t={t} color={t.textTertiary}>Invite not found</Eyebrow>
        <Title t={t}>This link doesn't go anywhere.</Title>
        <Body t={t}>
          Double-check the link or ask the person who sent it to share a fresh one.
        </Body>
        <PrimaryBtn t={t} onClick={function () { navigate("/home"); }}>Go to CourtSync</PrimaryBtn>
      </Layout>
    );
  }

  if (status === "expired" || status === "revoked" || status === "declined") {
    var headlineMap = {
      expired:  "This invite expired.",
      revoked:  "This invite was withdrawn.",
      declined: "You marked this invite as 'not me'.",
    };
    var bodyMap = {
      expired:  "Ask the person who sent it to log a new invite.",
      revoked:  "The person who sent it pulled back the link.",
      declined: "The match won't be attached to your profile.",
    };
    return (
      <Layout t={t}>
        <Eyebrow t={t} color={t.textTertiary}>{status.toUpperCase()}</Eyebrow>
        <Title t={t}>{headlineMap[status]}</Title>
        <Body t={t}>{bodyMap[status]}</Body>
        <PrimaryBtn t={t} onClick={function () { navigate("/home"); }}>Go to CourtSync</PrimaryBtn>
      </Layout>
    );
  }

  if (status === "claimed") {
    return (
      <Layout t={t}>
        <Eyebrow t={t} color={t.green}>Already claimed</Eyebrow>
        <Title t={t}>This invite has been claimed.</Title>
        {preview.caller_is_claimer ? (
          <Body t={t}>You already claimed this. Confirm or dispute it from your feed.</Body>
        ) : (
          <Body t={t}>Someone has already linked their CourtSync account to this match.</Body>
        )}
        <PrimaryBtn t={t} onClick={function () {
          var matchId = preview.match_id;
          if (matchId && preview.caller_is_claimer) {
            navigate("/home", { state: { highlightMatchId: matchId } });
          } else {
            navigate("/home");
          }
        }}>
          Go to feed
        </PrimaryBtn>
      </Layout>
    );
  }

  // status === 'pending'
  var matchScore = formatMatchScore(preview.sets || []);
  var matchDate  = preview.match_date
    ? new Date(preview.match_date).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })
    : null;

  // Logger viewing their own invite
  if (preview.caller_is_logger) {
    return (
      <Layout t={t}>
        <Eyebrow t={t} color={t.orange}>Awaiting opponent</Eyebrow>
        <Title t={t}>You logged this match.</Title>
        <PreviewSummary t={t} preview={preview} score={matchScore} date={matchDate} />
        <Body t={t}>
          Send the link to your opponent — they'll need to sign in and confirm or dispute the result before it affects your rating.
        </Body>
        <PrimaryBtn t={t} onClick={function () { navigate("/home"); }}>
          Back to feed
        </PrimaryBtn>
      </Layout>
    );
  }

  // pending + logged out OR pending + third-party logged-in user
  return (
    <Layout t={t}>
      <Eyebrow t={t} color={t.orange}>Match invite</Eyebrow>
      <Title t={t}>
        {preview.logger_name || "Someone"} logged a match with you.
      </Title>
      <PreviewSummary t={t} preview={preview} score={matchScore} date={matchDate} />

      {!authUser ? (
        <>
          <Body t={t}>
            Sign in or create a free account to claim and confirm this match.
          </Body>
          <PrimaryBtn t={t} onClick={openAuthForReturn} disabled={busy}>
            Sign in to claim
          </PrimaryBtn>
        </>
      ) : (
        <>
          <Body t={t}>
            Tap claim to attach this match to your profile, then confirm or dispute the result on the next screen.
          </Body>
          <PrimaryBtn t={t} onClick={handleClaim} disabled={busy}>
            {busy ? "Working…" : "Claim and review"}
          </PrimaryBtn>
          <SecondaryBtn t={t} onClick={handleDecline} disabled={busy}>
            This wasn't me
          </SecondaryBtn>
        </>
      )}
    </Layout>
  );
}

// ─── Layout primitives ────────────────────────────────────────────────

function Layout({ t, children }) {
  return (
    <div style={{
      minHeight: "100vh",
      background: t.bg,
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: "clamp(24px, 5vw, 48px) clamp(20px, 4vw, 32px)",
    }}>
      <div style={{
        width: "100%", maxWidth: 480,
        background: t.modalBg,
        border: "1px solid " + t.border,
        borderRadius: 14,
        padding: "32px 28px",
      }}>
        {children}
      </div>
    </div>
  );
}

function Eyebrow({ t, color, children }) {
  return (
    <div style={{
      fontSize: 9, fontWeight: 800, letterSpacing: "0.16em",
      textTransform: "uppercase",
      color: color || t.textTertiary,
      marginBottom: 8,
    }}>{children}</div>
  );
}

function Title({ t, children }) {
  return (
    <h1 style={{
      fontSize: 22, fontWeight: 800, color: t.text,
      margin: 0, marginBottom: 14,
      letterSpacing: "-0.6px", lineHeight: 1.1,
    }}>{children}</h1>
  );
}

function Body({ t, children }) {
  return (
    <p style={{
      fontSize: 13, color: t.textSecondary,
      lineHeight: 1.55, letterSpacing: "-0.1px",
      margin: 0, marginBottom: 18,
    }}>{children}</p>
  );
}

function PrimaryBtn({ t, onClick, disabled, children }) {
  return (
    <button onClick={onClick} disabled={disabled}
      style={{
        width: "100%", padding: "13px",
        borderRadius: 10, border: "none",
        background: disabled ? t.border : t.accent, color: "#fff",
        fontSize: 11, fontWeight: 800,
        letterSpacing: "0.12em", textTransform: "uppercase",
        cursor: disabled ? "not-allowed" : "pointer",
        marginBottom: 8,
      }}>
      {children}
    </button>
  );
}

function SecondaryBtn({ t, onClick, disabled, children }) {
  return (
    <button onClick={onClick} disabled={disabled}
      style={{
        width: "100%", padding: "13px",
        borderRadius: 10,
        border: "1px solid " + t.border, background: "transparent",
        color: t.textSecondary,
        fontSize: 11, fontWeight: 800,
        letterSpacing: "0.12em", textTransform: "uppercase",
        cursor: disabled ? "not-allowed" : "pointer",
      }}>
      {children}
    </button>
  );
}

function PreviewSummary({ t, preview, score, date }) {
  var name = preview.invited_name || "you";
  var who  = preview.logger_name || "Someone";
  var resultText;
  if (preview.result === "win") resultText = who + " won";
  else if (preview.result === "loss") resultText = name + " won";
  else resultText = null;

  return (
    <div style={{
      paddingTop: 14, paddingBottom: 14, marginBottom: 18,
      borderTop: "1px solid " + t.border,
      borderBottom: "1px solid " + t.border,
    }}>
      <div style={{
        fontSize: 9, fontWeight: 800, letterSpacing: "0.16em",
        textTransform: "uppercase", color: t.textTertiary,
        marginBottom: 8,
      }}>Match summary</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {date && <Row t={t} label="Date"  value={date} />}
        {score && <Row t={t} label="Score" value={score} mono />}
        {resultText && <Row t={t} label="Result" value={resultText} />}
        {(preview.venue || preview.court) && (
          <Row t={t} label="Venue" value={[preview.venue, preview.court].filter(Boolean).join(" · ")} />
        )}
        <Row t={t} label="Logged by" value={who} />
        <Row t={t} label="Listed as" value={name} />
      </div>
    </div>
  );
}

function Row({ t, label, value, mono }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
      <span style={{
        fontSize: 9, fontWeight: 800, letterSpacing: "0.16em",
        textTransform: "uppercase", color: t.textTertiary,
        width: 80, flexShrink: 0,
      }}>{label}</span>
      <span style={{
        flex: 1,
        fontSize: 13, color: t.text, letterSpacing: "-0.1px",
        fontVariantNumeric: mono ? "tabular-nums" : "normal",
      }}>{value}</span>
    </div>
  );
}
