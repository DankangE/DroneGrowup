# DroneGrowup — 파일럿 키우기

A Korean, PC-first life board game (phones: not a design constraint, must not crash): start at age 19, play 204 seasons across six maps and
212 spaces, and settle at age 70. There are 19 careers, 120 events and 21 endings. Each season
has one spin, at most one tile action and one extra action. The life board is the default entry;
existing `?life=1` URLs remain valid. Rules and numbers: `docs/design/life-board.md`.

## Stack and layout

Vite 5 + strict TypeScript, vanilla DOM and inline SVG, no framework or runtime dependencies.
Node 22.18+ runs TypeScript scripts/tests directly. Browser checks use Playwright-core and installed Chrome.

- `src/life/` — pure engine, seeded RNG, integer state and money in 만원.
  `data.ts` owns shared action/event/item/grade/flight tables; `compat.ts` adapts catalog stage gates
  to status/track gates. `base-types.ts` holds catalog/view vocabulary; `types.ts` owns the v2 state.
  `life-data.ts`, `world.ts`, `tracks.ts` and `events-*.ts` own life rules and text.
  `engine.ts` exposes choices, forecasts, routes and summaries; `grades.ts` exposes display grades.
- `src/ui2/` — board, HUD, movement, popups, endings and local art. `src/ui/` holds shared DOM/icons only.
  `src/main.ts` boots the game; `src/styles.css` and `index.html` provide its shell.
- `src/save.ts` — v2 local saves and metadata, with legacy collection migration and run-discard notice.
- `src/platform.ts` — optional login/save/leaderboard client behind `VITE_NG_PLATFORM=1`.
  It uses the new `pilotgrowup-v2` namespace. NalidaGame server changes are outside this repository.
- `docs/design.md` and `docs/life-balance-report.md` — measured balance and outstanding criteria.
  `docs/story-events.md`, `docs/ui-spec.md`, `docs/art-pipeline.md`, `docs/nalidagame-integration.md`
  document story, UI, shared art and the platform contract.

## Commands

- `npm run typecheck`, `npm test`, `npx vite build` — static checks, unit tests and default bundle.
- `npm run verify` — typecheck, Vite build, tests and the v2 gates listed in package.json.
  Any balance failure stays a failure; do not weaken a criterion to pass conversion.
- `npm run simulate:life` — 16 policies × 300 seeds with single-roulette and no-bank experiments;
  enforces §13.2. `SIM_RUNS`, `SIM_POLICIES` and `SIM_REPORT` support diagnostic runs.
- `npm run dominance:life` — all 120 events, free exits and response dominance; preserves published exceptions.
- `npm run outcomes:life` — forecast/result parity for all events and their branches.
- `npm run cashflow:life` — §7.5 fixed household cashflow scenarios.
- `npm run playtest:life`, `npm run layout:life`, `npm run check:board -- keys` — real default-URL
  inputs, six maps × four sizes, all popups, keyboard navigation, no scroll, 44px targets and 11px text.
- `npm run check:board -- timed [390x844]` — twelve seasons per map with reading pauses (T24 calibration).
- `npm run playtest:platform` — v2 account saves and separate leaderboard against a local SDK stand-in.
- `node scripts/trace-life.ts <policy> [seed]` — one deterministic bot run.
- `npm run dev` / `npm run preview` — local Vite server. Browser gates also open a local preview port.
- `VITE_NG_PLATFORM=1 npm run build` — optional platform client bundle.

## Working rules

Follow `AGENTS.md`; implement only the requested ticket from spec §14.3. No merge, main push or deployment.
Balance changes require simulation and an updated `docs/design.md`. Preserve `GRADE_STEPS`.
The engine has no DOM, Date, Math.random or floating-point state. Displayed odds are the rolled odds.
Every event has a cost-free, requirement-free choice, every popup an exit, and no run may get stuck.
The UI renders engine views and calls `choose`; retain the hooks in `docs/ui-spec.md`.
Nothing scrolls at 390×844, 360×740, 1280×800 or 1366×768. Use tabs/pagers for additional content.
Render untrusted text with `textContent`. Keep platform calls inside `if (PLATFORM)` so the default
build makes no platform request. All names, text and art are original.
