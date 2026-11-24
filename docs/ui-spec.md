# 파일럿 키우기 — UI spec

The UI is a thin layer over the rules in `src/game/`. It renders what the engine reports and sends back one
option id per tap. It never computes odds, payouts, requirements or endings itself.

The layout follows the patterns in `docs/ui-references.md` (idle / raising game home screens): one fixed
screen with a resource bar, a stage, an action panel and a bottom tab bar. **Nothing scrolls, anywhere.**

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

## The no-scroll rule

- The app root is exactly the viewport: `height: 100dvh` (with a `100vh` fallback), `overflow: hidden`,
  padded by `env(safe-area-inset-*)`. Every screen is a grid or flex column whose rows add up to that height.
- No element may use `overflow: auto | scroll`. Long content is split into pages (a pager) or tabs.
- No element may cut its content off. `overflow: hidden` is only for decoration that is meant to be clipped
  (the map stage, floating number pops); mark those elements with `data-clip-ok`. A single line of text may
  use `text-overflow: ellipsis` only where the full text is shown elsewhere on the same view.
- Supported sizes, each checked by `npm run layout`: 390 x 844, 360 x 740, 1280 x 800, 1366 x 768. The layout
  must also hold together between them (fluid, not four hard-coded sizes).
- Page size (rows per page) is derived from the room that is there (measure, or a height media query), so a
  shorter viewport shows fewer rows per page instead of overflowing.
- Buttons and other tap targets are at least 44 x 44 px. Text is at least 11 px (12 px or more for anything
  the player must read to decide). Everything is readable at 360 px wide.

## Screens

### 1. Title (`data-screen="title"`)

The cover fills the upper part of the screen with the five-character key visual. Phones crop to the centre
three characters. The two-word “파일럿 키우기” heading uses the local Bagel Fat One font, outlined and tilted
over the lower artwork alongside the ribbon, one-line pitch and two pills. The console holds three short
how-to lines as icon rows and the following controls:
"새 게임" (large primary), "이어하기" (only with a saved run), "엔딩 도감 n / 11", best score and run count as
small stat pills. Platform build: nickname pill and a "랭킹" button; the leaderboard opens as a centred popup
with paged rows.

### 2. Play (`data-screen="play"`, `data-phase="action | event | result"`)

Phone (portrait), top to bottom:

1. **Top bar** (about 52 px). Left: the career emblem (see Growth) with the stage name and rank. Right:
   resource pills with an icon: 자금, 빚 (`debt / creditLimit`; red when debt is near or over the limit).
2. **Time strip** (about 24 px). "23세 2분기", a thin progress bar of the 72 quarters, "남은 54분기".
3. **Stage** (takes all remaining height, `data-clip-ok`). The bevelled header holds the goal chip and two
   pressed-state buttons, "현장" and "지도". The initial 현장 view fills the stage with isometric place art and
   a short place-name plate. This sample uses the office image for every place. 지도 shows the SVG town map.
   Tapping an available place flies the drone there and selects its "장소" tab. The selected view persists
   across play-screen renders. Both views keep:
   - top: the **goal chip** "다음 목표" (see Growth),
   - bottom: a **stat strip**: gauges for 경험치 and 평판, the career stat that matters in this stage when
     it is above zero, and chips for the drone (level + condition bar), gear and car levels.
4. **Panel** (fixed height; its content depends on the bottom tab):
   - **홈** — the quarter's actions (options with `free === false`). A tab row: "전체", "일감" (kind `job`),
     "활동" (kind `action`), and "장소: <name>" when a place is selected on the map; the pager sits at the right
     end of the tab row ("1 / 4" between "이전" and "다음" icon buttons). Below it a list of compact rows
     (4 to 6 per page, at least 44 px each): place icon, title, cost, and the chance as a small badge ("66%")
     or "확정" for a sure outcome; disabled rows are dimmed with a lock icon. Below the list a **detail strip**
     for the picked row: title, description, for a roll "성공: …" and "실패: …" (the `summary` strings) and
     "추락 위험 25%" when `crashPct` is set, for a sure outcome its `summary`, for a disabled option its
     `locks`; and one large primary button "실행" with the cost on it. The first enabled row of a page is
     picked by default.
   - **상점** — `shop` and `repair` options as upgrade cards (a grid, paged if needed): item icon, title,
     effect / description, and the price as the button label. Marked "분기 소모 없음". Locked cards are
     dimmed and show the first lock reason.
   - **은행** — `bank` options as cards in the same style, above them a debt gauge (`debt / creditLimit`).
   - **내 정보** — every non-zero stat with its `STAT_LABEL` as a compact grid, net worth, and the next
     quarter's upkeep lines. Paged if it does not fit.
   - **기록** — the recent log (`state.log`), newest first, paged.
5. **Bottom tab bar** (about 56 px + safe area): 홈, 상점, 은행, 내 정보, 기록, each an icon over a label.
   The active tab is marked. A dot on 상점 / 은행 when one of its options is enabled.

Event, result, confirmation and ranking popups share a centred steel-blue window with a two-pixel bevel,
a pinstriped blue title bar with white text, and a cream inset body. Each fits inside the viewport.

- **Event** (`data-phase="event"`): shown as soon as `state.phase === 'event'`; it must be answered. A framed
  portrait sits beside a five-bar chart of current experience, reputation, drone, gear and car levels,
  scaled to their engine maxima. All sample events use the senior portrait. Below are the place name,
  inset event text and the event's choices (two at most) as large buttons. Each button carries the
  choice title, cost, the chance ("성공 66%") with a small bar, and the success / fail (or sure) summaries.
  Disabled choices show their locks.
- **Result** (`data-phase="result"`): after `choose`. For a roll: the luck animation (about 900 ms; a gauge
  with the success zone marked and a needle or rolling number landing on `result.roll.value`), then
  성공 / 실패, `result.text`, the stat deltas as chips (+green / -red), `notes` (추락!), the quarter's
  upkeep as one compact line per entry or a single total when there are many, and a stage-up banner when
  `stageTo !== stageFrom`. One "계속" button. With `prefers-reduced-motion` the animation is skipped.

Desktop (width 900 px and up): the same pieces in two columns. Left: the stage, as large as the height
allows. Right (about 420 px): top bar, time strip, panel and the tab bar at its bottom. The stat strip and
goal chip stay on the stage. Popups stay centred and at most 480 px wide. The tab bar must never cover the
panel or a card (the old 1280 px overlap).

### 3. Ending (`data-screen="ending"`)

One screen: the ending emblem, title and text (`endingInfo`), the score counting up, a 3 x 2 grid of run
facts (age, net worth, flights, wins, losses, crashes), "새 엔딩" / "최고 기록" badges, and the buttons "다시
하기" (primary), "엔딩 도감", "타이틀". Platform build: the `runStatus.text` line and the "닉네임 설정" button
fit on the same screen.

### 4. Ending gallery (`data-screen="gallery"`)

An album: a fixed detail panel on top (title, text, "대표 엔딩" mark for `main`; "???" and a career hint for
an ending not found yet) and all 11 endings as tiles in a grid below (3 columns on a phone, 6 on desktop).
Tapping a tile shows it in the detail panel. Found tiles show an emblem and the title, the rest a dark
silhouette. A "타이틀" button. No scroll with all 11 found.

## Growth and feedback

- **Career emblem**: an original SVG badge in the top bar that gains a tier per career stage (wings, stars,
  a crown for the top stages) and shows the rank. It pulses when the stage changes.
- **The drone on the map** is drawn larger and better equipped as the drone level rises.
- **Goal chip**: the next goal is the first option, in the engine's order, whose outcome moves the career to
  another stage (its `roll.success` or `sure` outcome carries the stage change; use the structured field in
  `OptionView`, not the Korean text). The chip shows "다음 목표 · <title>" and, when it is locked, its first
  lock reason; when it is enabled, "도전 가능". Tapping it shows that option in the 홈 list. Without such
  an option the chip shows the quarters left until retirement.
- **Numbers move**: when a result is confirmed, the changed pills and gauges count / fill to the new value
  and a small "+200" / "-150" pop floats up from them. Popups scale in. The primary button has a pressed
  state. All of it is off under `prefers-reduced-motion: reduce`.

## Rules for the build

- Korean for every player-facing string; identifiers in English.
- Vanilla TypeScript + DOM, no framework, no new dependencies. No images or fonts loaded from other hosts;
  art lives in `public/art`, fonts in `public/fonts`. Strict TS:
  `npm run typecheck` must pass (`noUnusedLocals`, `verbatimModuleSyntax`: use `import type` for types, and
  keep the `.ts` extension in relative imports).
- Stable hooks for the headless scripts (`scripts/ui-driver.mjs`, `playtest.mjs`, `layout-check.mjs`):
  - the root element carries `data-screen="title | play | ending | gallery"` and, on the play screen,
    `data-phase="action | event | result"`;
  - title / ending buttons: `data-action="new | continue-run | gallery | title | retry"`;
  - bottom tab bar buttons: `data-nav="home | shop | bank | info | log"`;
  - tab rows inside a view: `data-tab="<name>"`; choosing a tab or a nav entry shows its first page;
  - pagers: `data-action="page-prev"` and `data-action="page-next"`, with the `disabled` attribute at the ends;
  - a list row that only selects an option: `data-pick="<option id>"`;
  - the button that commits an option (calls `choose`): `data-option="<option id>"`, with the `disabled`
    attribute when the engine reports it as not enabled. In the 홈 panel that is the detail strip's "실행"
    button for the picked row; in 상점 / 은행 and in the event popup it is the card's own button;
  - the result popup's button: `data-action="continue"`;
  - with `?debug=1` in the URL only: `window.__game = { state: () => GameState, options: () => OptionView[] }`.
- Every option the engine offers is reachable through those hooks without the map, so the game is playable
  with a keyboard and a screen reader: real `<button>`s, visible focus, `aria-live="polite"` on the result text.
- No `console.error` in normal play. No network requests in the default build.
- `npm run layout` (the no-scroll check) and `npm run playtest` must pass.
