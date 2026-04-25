// src/features/rating/copy.js
//
// Centralised copy for the rating info modal + the lock warning. Lives
// here so the explanation can evolve in one place rather than being
// hard-coded in 5 components.
//
// Naming reminder: this is "CourtSync Rating", NOT UTR or any official
// federation ranking. Don't introduce "official", "federation", or
// "rating governing body" language anywhere in this file.

// Lock warning shown above the "Confirm" button on the onboarding
// skill picker.
export const LOCK_WARNING =
  "Your starting skill level sets your initial CourtSync Rating. Once locked, you won't be able to change it manually. Your rating and level will still update naturally through confirmed ranked matches.";

// Modal title.
export const MODAL_TITLE = "How CourtSync Rating works";

// Section list. One entry per section in the modal. Each section has
// an `eyebrow` (ALL-CAPS tag for the section), a `title` (display-
// type heading), and a `body` array (rendered as paragraphs / bullet
// lists). Bullets render when an item is an array.
export const RATING_INFO_SECTIONS = [
  {
    id: "starting-level",
    eyebrow: "01",
    title: "Your starting level",
    body: [
      "You choose a starting skill level when setting up your profile. This sets your initial CourtSync Rating.",
      "Once locked, your starting level can't be manually changed — but your current displayed level can still move up or down based on confirmed ranked results.",
    ],
  },
  {
    id: "skill-levels",
    eyebrow: "02",
    title: "Skill levels",
    body: [
      "These six levels are based on your current rating band. As your rating changes, your displayed level can change too.",
      [
        "Beginner 1",
        "Beginner 2",
        "Intermediate 1",
        "Intermediate 2",
        "Advanced 1",
        "Advanced 2",
      ],
    ],
  },
  {
    id: "calibration",
    eyebrow: "03",
    title: "Calibration",
    body: [
      "Your first 5 confirmed ranked matches are calibration matches.",
      "During calibration, your rating can move faster than normal. This helps correct your starting level if you self-assessed too high or too low.",
      "After 5 confirmed ranked matches, your rating becomes Established.",
    ],
  },
  {
    id: "what-affects",
    eyebrow: "04",
    title: "What affects your rating",
    body: [
      "Only confirmed ranked matches with a valid completed score affect your CourtSync Rating.",
      [
        "Ranked match type",
        "Completed (not time-limited or retired)",
        "Valid tennis score",
        "Confirmed by your opponent",
      ],
    ],
  },
  {
    id: "what-doesnt",
    eyebrow: "05",
    title: "What doesn't affect your rating",
    body: [
      "Casual, time-limited, disputed, pending, voided, or expired matches do not change your rating.",
      [
        "Casual matches",
        "Time-limited or unfinished scores like 5-3",
        "Pending matches (waiting on confirmation)",
        "Disputed matches",
        "Voided or expired matches",
        "Social-league matches (unless the league is set to ranked)",
      ],
    ],
  },
  {
    id: "move-up",
    eyebrow: "06",
    title: "How you move up",
    body: [
      "You move up by winning confirmed ranked matches, especially against stronger or similarly-rated players.",
      "During calibration, strong results can move you up faster — your K-factor is higher while we're still learning your level.",
      "If your rating crosses the next skill band, your displayed level advances.",
    ],
  },
  {
    id: "move-down",
    eyebrow: "07",
    title: "How you move down",
    body: [
      "You can move down if your confirmed ranked results lower your rating.",
      "CourtSync uses a small buffer so your level doesn't bounce after one unlucky result. Demotion is based on rating evidence, not a single match.",
    ],
  },
  {
    id: "status",
    eyebrow: "08",
    title: "Provisional vs Established",
    body: [
      "Provisional means CourtSync is still learning your level — fewer than 5 confirmed ranked matches played.",
      "Established means you have enough confirmed ranked results for a more stable rating. From here, your rating moves at a slower, more measured pace.",
    ],
  },
  {
    id: "leagues",
    eyebrow: "09",
    title: "League matches",
    body: [
      "Competitive (ranked) league matches affect rating just like any other ranked match — once they're confirmed.",
      "Social (casual) league matches count toward the league's own standings but do not affect your global CourtSync Rating.",
    ],
  },
  {
    id: "opponent-strength",
    eyebrow: "10",
    title: "Opponent strength",
    body: [
      "Your rating change depends on who you play. Beating a higher-rated player usually moves you up more, while beating a much lower-rated player moves you less.",
      "Losing to a lower-rated player can cost more than losing to a stronger player. The bigger the upset, the bigger the rating swing.",
    ],
  },
];
