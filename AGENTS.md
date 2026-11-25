# AGENTS.md — DroneGrowup (파일럿 키우기)

## What this is
Static browser game, Korean text, mobile first. Vite 5 + TypeScript strict, vanilla DOM + inline SVG.
No framework, no runtime dependencies (devDependencies only). Node 22+ runs .ts scripts and tests directly.
The v2 spec is docs/design/life-board.md. It is the source of truth for rules and numbers; do one ticket
from its section 14.3 per session and do not go beyond that ticket's scope.

## Git and PR rules
- Never merge a PR. Never push to main. Never force-push a shared branch. Never deploy.
- Work in your own worktree: `git worktree add ../.worktrees/dronegrowup-life-tNN -b feat/life-tNN-<slug> origin/main`.
  Do not edit files in another worktree or in the main checkout.
- One ticket = one branch = one PR against `main` (no other base; stacked PRs are not allowed).
  Start a ticket only when the tickets it depends on are merged into main. If told to bundle consecutive
  tickets, keep one commit per ticket in one PR.
- PR title: `life TNN: <ticket title>`. PR body: what changed, the acceptance checks with their output,
  anything you could not do. Do not include secrets or personal data.
- If a command is denied by a permission rule, stop that step and report the denial as it is.

## Engine rules (src/game and src/life)
- Pure functions only: no DOM, no Date, no Math.random, no floats in the state. Seeded RNG lives in the state.
- Money is an integer in 만원. A percentage is integer multiply then floor: Math.floor(x * pct / 100).
- Every number and every sentence lives in a data table (data.ts, world.ts, tracks.ts, life-data.ts, events-*.ts),
  not in engine code. The chance shown on a card is the chance that is rolled (clamped 5..95).
- Every event has one choice with no cost and no requirement. Every popup has a way out ("그냥 지나간다").
  A run can never get stuck.
- No choice of an event may be at least as good as another in every stat (npm run dominance).
- Every `need.min` on a graded stat is a GRADE_STEPS value.
- The UI renders what the engine returns (options, reachable, jobOffers, forecast) and calls choose(state, id).
  It never computes odds, pay, eligibility or endings.

## UI rules
- Nothing scrolls, on any screen at any size (390x844, 360x740, 1280x800, 1366x768). More content = tab or pager.
- Tap targets >= 44 px, text >= 11 px.
- Keep the hooks: data-option, data-pick, data-nav, data-tab, data-action, data-screen, data-phase,
  and the v2 hooks data-dest, data-map, data-popup.
- Strings from the server or from storage go into the DOM with textContent.
- Platform code stays inside `if (PLATFORM)`; the default build makes no network request.
- All names, text and art are original. Do not copy from other games.

## Before every PR
- `npm run verify` must pass (typecheck, build, tests, simulation, dominance, outcomes, playtests, layout).
- Also run the ticket's own commands listed in its "검증" line and paste their summary lines in the PR body.
- After changing a balance number: run the simulation and update the tables in docs/design.md.
- Tests: `tests/life-*.test.ts`, run by `npm test` (node --test). New rule = new test.
