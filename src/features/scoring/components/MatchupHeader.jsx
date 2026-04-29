// src/features/scoring/components/MatchupHeader.jsx
//
// Editorial "you VS opponent" hero shown at the top of the redesigned
// Log Match composer. Replaces the old free-floating "vs <oppName>"
// caption — the matchup framing is now the FIRST thing the user sees,
// before any inputs, so the form reads as a match composition rather
// than a generic data-entry form.
//
// Layout: two columns (you on the left, opp on the right) with a tiny
// "VS" sigil between them, sitting under an ALL-CAPS eyebrow. Hairline
// border below to mark the end of the header.
//
// The opponent slot is RENDER-PROP friendly: callers can pass an
// `oppSlot` ReactNode to swap the right side for an OpponentPicker
// (casual + freetext flow). When oppSlot is omitted we render a simple
// chip showing the linked-opp avatar + name (resubmit / verified flow).
//
// Slice 1 of the Log-Match redesign — purely presentational. State /
// validation / submit logic stay in ScoreModal.

import PlayerAvatar from "../../../components/ui/PlayerAvatar.jsx";

export default function MatchupHeader({
  t,
  // Viewer side. `name` is required; `profile` powers the avatar URL.
  youName,
  youProfile,
  // Linked opponent (resubmit or verified path). Optional — when null
  // the right side falls back to either `oppSlot` or a placeholder.
  oppName,
  oppProfile,
  // Render-prop override for the right column. When provided we render
  // it instead of the linked-opp chip — used by the casual+freetext
  // path to embed an OpponentPicker inside the matchup framing.
  oppSlot,
  // Subtitle line beneath the "MATCHUP" eyebrow. Optional; surfaces
  // tournament name / source-challenge context when present.
  subtitle,
}) {
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{
        display: "flex", alignItems: "baseline", justifyContent: "space-between",
        marginBottom: 12,
      }}>
        <span style={{
          fontSize: 9, fontWeight: 800,
          color: t.textTertiary, letterSpacing: "0.16em",
          textTransform: "uppercase",
        }}>
          Matchup
        </span>
        {subtitle && (
          <span style={{
            fontSize: 11, color: t.textTertiary,
            letterSpacing: "-0.1px",
          }}>
            {subtitle}
          </span>
        )}
      </div>

      <div style={{
        display: "grid",
        gridTemplateColumns: "1fr auto 1fr",
        alignItems: "center",
        gap: 10,
      }}>
        {/* You */}
        <div style={{
          display: "flex", alignItems: "center", gap: 10,
          minWidth: 0,
        }}>
          <PlayerAvatar
            name={youName}
            avatarUrl={youProfile && youProfile.avatar_url}
            profile={youProfile}
            size={36}
          />
          <div style={{ minWidth: 0 }}>
            <div style={{
              fontSize: 9, fontWeight: 800,
              color: t.textTertiary, letterSpacing: "0.16em",
              textTransform: "uppercase",
            }}>
              You
            </div>
            <div style={{
              fontSize: 14, fontWeight: 700, color: t.text,
              letterSpacing: "-0.2px",
              whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
            }}>
              {youName || "You"}
            </div>
          </div>
        </div>

        {/* VS sigil — minimal, lowercase, no padding so it sits as a
            thin junction between the two columns rather than a
            visible block between them. */}
        <div style={{
          fontSize: 11,
          fontStyle: "italic",
          color: t.textTertiary,
          letterSpacing: "-0.1px",
        }}>
          vs
        </div>

        {/* Opponent — slot wins if provided, otherwise a chip-display
            (linked opponent), otherwise a "pick opponent" placeholder. */}
        <div style={{ minWidth: 0 }}>
          {oppSlot ? (
            oppSlot
          ) : oppName ? (
            <div style={{
              display: "flex", alignItems: "center", gap: 10,
              minWidth: 0, justifyContent: "flex-end",
            }}>
              <div style={{ minWidth: 0, textAlign: "right" }}>
                <div style={{
                  fontSize: 9, fontWeight: 800,
                  color: t.textTertiary, letterSpacing: "0.16em",
                  textTransform: "uppercase",
                }}>
                  Opponent
                </div>
                <div style={{
                  fontSize: 14, fontWeight: 700, color: t.text,
                  letterSpacing: "-0.2px",
                  whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                }}>
                  {oppName}
                </div>
              </div>
              <PlayerAvatar
                name={oppName}
                avatarUrl={oppProfile && oppProfile.avatar_url}
                profile={oppProfile}
                size={36}
              />
            </div>
          ) : (
            <div style={{
              fontSize: 12, color: t.textTertiary,
              textAlign: "right",
              fontStyle: "italic",
            }}>
              Pick opponent →
            </div>
          )}
        </div>
      </div>

      {/* No divider — the matchup section flows into the scoreboard
          via the SCOREBOARD eyebrow below. Removing the hairline
          stops the section reading as a closed-off "box". */}
    </div>
  );
}
