// matches feature barrel — public entry points for the v2 matches
// namespace. Anything outside `src/v2/` should import from here, not
// reach into nested files.

export { default as V2MatchHome }       from "./pages/V2MatchHome.jsx";
export { default as V2LiveScoringPage } from "./pages/V2LiveScoringPage.jsx";
