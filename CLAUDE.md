# DroneGrowup — 파일럿 키우기

A top-view career choice game with luck: a drone-school student grows into a pilot, employee, instructor,
association leader, solo operator or drone-company CEO over 72 quarters, and ends in one of 11 endings.
Static browser game, Korean text, mobile first.

## Stack

Vite 5 + TypeScript (strict), vanilla DOM and inline SVG, no framework and no runtime dependencies.
Node 22+ runs the `.ts` scripts and tests directly. Playwright-core drives installed Chrome for the playtest.

## Layout

- `src/game/` — the rules. Pure, DOM-free, seeded RNG kept in the state, money as integers (만원).
  - `data.ts` — every number and every sentence: rules, stages, places, items, actions, events, endings.
  - `engine.ts` — `newGame`, `options`, `choose`, `derived`, `restore`.
  - `bots.ts` — the policies the simulation plays with.
- `src/ui/`, `src/main.ts`, `src/styles.css`, `index.html` — the UI. It renders `options(state)` and calls
  `choose(state, id)`; it never computes odds, payouts or endings.
- `src/save.ts` — localStorage run save and the ending gallery / best score.
- `src/platform.ts` — nalidagame.online login, server save and leaderboard, behind `VITE_NG_PLATFORM=1`.
- `scripts/simulate.ts` — balance simulation, `scripts/trace.ts <policy> [seed]` — one bot run step by step,
  `scripts/playtest.mjs` — headless run through the real UI.
- `docs/design.md` (rules and the balance table), `docs/story-events.md` (story and event script),
  `docs/ui-spec.md` (UI contract and test hooks), `docs/nalidagame-integration.md` (server-side contract).

## Commands

- `npm run dev` — dev server (PORT env, default 5173).
- `npm run verify` — typecheck, build, unit tests, simulation, headless playtest. Run it before every PR.
- `npm run simulate` — 11 bot policies x 300 seeds; fails on a softlock, a run that does not end, or an
  ending outside 2%..30%. `SIM_RUNS=1000` for more seeds.
- `VITE_NG_PLATFORM=1 npm run build` — the nalidagame.online build.

## Rules

- Balance lives in `data.ts`. After changing a number, run `npm run simulate` and paste the new table into
  `docs/design.md`.
- The engine stays pure: no DOM, no `Date`, no `Math.random`, no floats in the state. The chance shown on a
  card is the chance that is rolled.
- Every event needs one choice with no cost and no requirement, and `rest` is always available, so a run can
  never get stuck. `tests/engine.test.ts` checks both.
- The UI keeps the `data-option`, `data-action`, `data-screen` and `data-phase` hooks from `docs/ui-spec.md`;
  the playtest depends on them.
- Strings from the server or from storage go into the DOM with `textContent`.
- The platform code must stay inside `if (PLATFORM)` so the default build makes no network request.
- All names, text and art are original. Do not copy from other games.
