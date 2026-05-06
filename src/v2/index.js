// v2 namespace barrel — re-exports the public entry points for every
// v2 feature. Keep this file as the only thing v1 (`src/app/App.jsx`)
// imports from `src/v2/`. Nothing inside `src/v2/` should ever import
// from `src/app/`, `src/features/`, or other v1 paths.

export * from "./features/matches/index.js";
