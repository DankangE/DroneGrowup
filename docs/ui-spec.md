# 파일럿 키우기 — UI spec

The UI is a thin layer over the rules in `src/game/`. It renders what the engine reports and sends back one
option id per tap. It never computes odds, payouts, requirements or endings itself.

## Files the UI owns

- `index.html` — one `<div id="app">`, `<html lang="ko">`, mobile viewport meta, loads `/src/main.ts`.
- `src/main.ts` — boot, screen switching, the `?debug=1` hook.
- `src/ui/*.ts` — screens and the top-view scene.
- `src/styles.css` — all styling.

Do not edit `src/game/*`, `src/save.ts`, `src/platform.ts`, `scripts/*`, `tests/*`, `package.json`. If the
engine lacks something the UI needs, leave a `TODO(engine):` note at the call site and work with what exists.

## Engine API (read `src/game/types.ts` for the exact shapes)

```ts
import { newGame, options, choose, derived, currentEvent, endingInfo, num } from './game/engine.ts';
import { PLACES, ITEMS, ENDINGS, STAGES, STAT_LABEL, RULES } from './game/data.ts';
```

- `newGame(seed)` → `GameState` (JSON-serialisable). Pick the seed with `crypto.getRandomValues` (or `?seed=N` in the URL).
- `options(state)` → `OptionView[]`: everything the player may look at now. Each has `id`, `kind`
  (`action | job | event | shop | repair | bank`), `place`, `title`, `desc`, `cost`, `free` (does not spend the
  quarter), `enabled`, `locks` (Korean reasons when disabled), and either `roll` (`chance` in %, `success` and
  `fail` outcomes with a ready-made Korean `summary`, optional `crashPct`) or `sure` (one outcome).
- `choose(state, optionId)` → `{ state, result }`. Pure: returns a new state. `result` has the roll
  (`chance`, `value` 0-99, `success`), `text`, `deltas` (stat changes), `crashed`, `notes`, `upkeep` (the
  quarter's income / cost lines when the turn advanced), `stageFrom` / `stageTo`, `eventId` (a random event
  now waits for a choice), `ended`.
- `state.phase`: `'action'` (pick what to do this quarter), `'event'` (answer `currentEvent(state)` with one of
  its `ev:N` options), `'ended'` (`state.ending`, `state.score`).
- `derived(state)` → age, quarter, turns left, credit limit, net worth, stage / rank names, item names, next upkeep.
- `PLACES[placeId]` → `{ name, x, y, desc }` with `x`, `y` in 0-100 map coordinates. `ENDINGS` lists all 11
  endings (`main: true` for the five headline ones).

## Persistence and platform (already written, just call them)

```ts
import { loadRun, saveRun, clearRun, loadMeta, recordEnding } from './save.ts';
import { PLATFORM, bootPlatform, nickname, runStatus, fetchLeaderboard, sessionOk, openNicknamePage } from './platform.ts';
```

- `loadRun()` on boot → offer "이어하기" when it returns a state. `saveRun(state)` after every `choose`.
  `clearRun()` when the player abandons a run. `recordEnding(state, durationSec)` exactly once when a run
  ends → `{ meta, firstTime, newBest }`. `loadMeta()` → `{ gallery: EndingId[], best, runs }` for the title
  screen and the ending gallery.
- `PLATFORM` is `false` in the default build. Every platform call site must be inside `if (PLATFORM) { ... }`
  so the bundler drops it: boot with `bootPlatform(appRoot, showTitle)` instead of calling `showTitle()`
  directly, show `nickname()` on the title, a "랭킹" button that renders `fetchLeaderboard()` rows, and the
  `runStatus.text` line on the ending screen (`runStatus.onChange = rerender`; show a "닉네임 설정" button
  calling `openNicknamePage()` when `runStatus.nicknameButton`). Call `sessionOk()` before starting or
  continuing a run and stop if it returns false.
- Anything that came from the server or from localStorage (nicknames, log text) goes into the DOM with
  `textContent`, never `innerHTML`.

## Screens

1. **Title** — game title "파일럿 키우기", one-line pitch, "새 게임", "이어하기" (only with a saved run),
   "엔딩 도감" (n / 11 found), best score. A short how-to-play (three lines).
2. **Play** — mobile-first, one column:
   - **HUD** (sticky top): age and quarter ("23세 2분기"), turns left as a thin progress bar, stage name +
     rank, 자금, 빚 (red when above the credit limit × 1.2 threshold is near: show `debt / creditLimit`),
     경험치, 평판, and the drone / gear / car levels with the drone condition as a small bar. A "상세" toggle
     opens the full stat sheet (every non-zero stat with its `STAT_LABEL`, net worth, next quarter's upkeep
     lines) and the recent log (`state.log`).
   - **Top-view scene** (탑 뷰): a bird's-eye map of the town drawn in SVG or canvas — roads, fields, water,
     and one building / site per `PLACES` entry at its `x`, `y`, each drawn as a simple top-down shape with a
     label (school with a courtyard, airfield with a runway and windsock, wind farm with three-blade
     turbines seen from above, bridge over a river, farm plots, construction site, coast line, bank, shop,
     garage, studio, office, HQ tower roof, academy, association hall, home). Places that have at least one
     option right now are highlighted and tappable; the others are dimmed. The player's drone (a small
     quadcopter seen from above, rotors spinning) hovers at the current place and flies to the tapped place
     (CSS / rAF tween, ~400 ms). Tapping a place filters the choice list to it. Original vector art only; no
     external images, fonts or libraries.
   - **Choice cards**: the options of the selected place (and an "전체" tab listing all, grouped by place).
     Each card: title, description, cost ("비용 300만원"), and
       - for a roll: a success-chance bar with the number ("성공 66%"), then two rows "성공: +200만원 · 평판 +3"
         and "실패: -150만원 · …" (use the `summary` strings), plus "추락 위험 25%" when `crashPct` is set;
       - for a sure outcome: its `summary`.
     Disabled cards stay visible, greyed, with their `locks` listed. Cards are at least 48 px tall, full
     width at 390 px, with a clear primary tap target. Free options (shop / repair / bank) are marked
     "분기 소모 없음" and get their own "상점 · 정비 · 은행" sheet reachable from a bottom bar.
   - **Result**: after `choose`, a modal sheet. For a roll: a luck animation (~900 ms; e.g. a dial / needle
     or a rolling number that lands on `result.roll.value` against the `chance` threshold), then
     성공 / 실패, `result.text`, the stat deltas as chips (+green / -red), `notes` (crash!), the quarter's
     upkeep lines, and a stage-change banner when `stageTo !== stageFrom`. One "계속" button. Respect
     `prefers-reduced-motion` (skip the animation).
   - **Event**: when `state.phase === 'event'`, show the event card (title, text, place on the map, its
     choices in the same card format) instead of the normal choice list. It must be answered.
3. **Ending** — ending title and text (`endingInfo`), score, a short run summary (age, net worth, flights,
   wins / losses, crashes), whether it is a new ending / new best, buttons "다시 하기", "엔딩 도감", "타이틀".
4. **Ending gallery** — all 11 endings as cards; found ones show title and text, the rest "???" with a hint
   of which career they belong to. The five `main` endings are marked.

## Rules for the build

- Korean for every player-facing string; identifiers in English.
- Works at 390 × 844 with no horizontal scroll and nothing under the notch / home bar (`env(safe-area-inset-*)`),
  and looks intentional at 1280 × 800 (map on the left, HUD + choices on the right).
- Vanilla TypeScript + DOM, no framework, no new dependencies. Strict TS: `npm run typecheck` must pass
  (`noUnusedLocals`, `verbatimModuleSyntax`: use `import type` for types, and keep the `.ts` extension in
  relative imports).
- Stable hooks for the headless playtest:
  - every tappable option: `<button data-option="<id>" ...>` (disabled ones have the `disabled` attribute),
  - the result sheet's continue button: `data-action="continue"`,
  - title buttons: `data-action="new" | "continue-run" | "gallery" | "title" | "retry"`,
  - the root element carries `data-screen="title | play | ending | gallery"` and, on the play screen,
    `data-phase="action | event | result"`,
  - with `?debug=1` in the URL only: `window.__game = { state: () => GameState, options: () => OptionView[] }`.
- All options must be reachable without the map (the "전체" tab), so the game is playable with a keyboard
  and a screen reader: real `<button>`s, visible focus, `aria-live="polite"` on the result text.
- No `console.error` in normal play. No network requests in the default build.
