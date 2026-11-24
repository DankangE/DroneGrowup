# 파일럿 키우기 — UI spec

The UI is a thin layer over the rules in `src/game/`. It renders what the engine reports and sends back one
option id per tap. It never computes odds, payouts, requirements or endings itself.

The game runs inside a fixed steel-blue tycoon window. The toolbar and status bar span its width, with
the stage and action window between them. **Nothing scrolls, anywhere.**

## Files the UI owns

- `index.html` — one `<div id="app">`, `<html lang="ko">`, mobile viewport meta, loads `/src/main.ts`.
- `src/main.ts` — boot, screen switching, the `?debug=1` hook.
- `src/ui/*.ts` — screens and the top-view scene.
- `src/styles.css` — all styling.

Do not edit `src/game/*`, `src/save.ts`, `src/platform.ts`, `scripts/*`, `tests/*`, `package.json`. If the
engine lacks something the UI needs, leave a `TODO(engine):` note at the call site and work with what exists.

## Engine API (read `src/game/types.ts` for the exact shapes)

```ts
import { newGame, options, choose, derived, dateLabel, currentEvent, endingInfo, num } from './game/engine.ts';
import { PLACES, ITEMS, ENDINGS, STAGES, STAT_LABEL, RULES } from './game/data.ts';
```

- `newGame(seed)` → `GameState` (JSON-serialisable). Pick the seed with `crypto.getRandomValues` (or `?seed=N` in the URL).
- `options(state)` → `OptionView[]`: everything the player may look at now. Each has `id`, `kind`
  (`action | job | event | shop | repair | bank`), `place`, `title`, `desc`, `cost`, `tire`, `free` (uses no stamina and leaves the season and its action count intact), `enabled`, `locks` (Korean reasons when disabled), and either `roll` (`chance` in %, signed `staminaPct` in percentage points, `success` and
  `fail` outcomes with a ready-made Korean `summary`, optional `crashPct`) or `sure` (one outcome).
- `choose(state, optionId)` → `{ state, result }`. Pure: returns a new state. `result` has the roll
  (`chance`, `value` 0-99, `success`), `text`, `deltas` (stat changes), `crashed`, `notes`, `upkeep` (the
  season’s income / cost lines on a season change), `stageFrom` / `stageTo`, `eventId` (a random event
  now waits for a choice), `ended`.
- `state.phase`: `'action'` (pick what to do this season), `'event'` (answer `currentEvent(state)` with one of
  its `ev:N` options), `'ended'` (`state.ending`, `state.score`).
- `derived(state)` → age, `season` (0..3), `seasonName` (봄, 여름, 가을, 겨울), `dateLabel` (e.g. “24세 · 봄”), credit limit, net worth, stage / rank names, item names, next upkeep.
- `dateLabel(turn)` formats the date of any log entry. The calendar starts at 20 and advances one year every four seasons.
- `result.season?: { from: string; to: string; rest: number; refill: number; auto: boolean }` accompanies the season ledger.
  The dates are formatted labels, `rest` is the awarded rest and `refill` is the actual seasonal recovery after the stamina cap.
  Early achievement endings still increment the calendar for scoring and skip the seasonal settlement.
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
how-to lines about multiple actions, both rests and the +30 seasonal recovery as icon rows and the following controls:
"새 게임" (large primary), "이어하기" (only with a saved run), "엔딩 도감 n / 11", best score and run count as
small stat pills. Platform build: nickname pill and a "랭킹" button; the leaderboard opens as a centred popup
with paged rows.

### 2. Play (`data-screen="play"`, `data-phase="action | event | result"`)

On phones the four regions stack vertically. At widths of 900 px and above, the stage and the 420 px
action window share the middle row. The toolbar and status bar span both columns.

1. **Top icon toolbar.** Five bevelled buttons switch between 홈, 상점, 은행, 내 정보 and 기록. The active
   button looks pressed. A dot marks 상점 or 은행 when an option there is enabled. The 현장 / 지도 buttons
   switch the stage view independently. All seven controls are at least 44 px square.
2. **Stage.** The run opens at the pending event's place, or the career stage's home place from
   `STAGE_PLACE`. 현장 shows the place and career-specific art from `sceneArt(place, state)`. A dark
   isometric tile grid and the place's map landmark sit beneath it during loading or if the image is
   unavailable. A solid plate identifies the place. 지도 shows the SVG town map. Choosing an available
   landmark moves the drone and opens that place's actions. The view persists across play-screen renders.
   The raised goal plate stays above the scene. The first instrument is the 체력 meter (0–100). It shows 쌩쌩, 지침 or 탈진 outside the normal band
   and uses warning colours for 지침 and 탈진. The following instruments show 이론, 조종, 경험, 평판,
   the stage's active specialty, equipment levels and drone condition.
3. **Action window.** The pinstriped navy title bar names the active view, including “이번 계절 할 일”
   for 홈. The cream body contains the selected tab's controls and a measured page of content.
   - **홈** — the season’s actions (options with `free === false`). A tab row: "전체", "일감" (kind `job`),
     "활동" (kind `action`), and "장소: <name>" when a place is selected on the map; the pager sits at the right
     end of the tab row ("1 / 4" between "이전" and "다음" icon buttons). Below it a list of compact rows
     (up to six per page, each at least 44 px tall): place icon, title, cost, and the chance as a percentage ("66%")
     or "확정" for a sure outcome. Rows alternate pale backgrounds. The selected row uses white text on navy,
     and locked rows carry a lock icon. Below the list a **detail strip**
     for the picked row: title, description, for a roll "성공: …" and "실패: …" (the `summary` strings) and
     "추락 위험 25%" when `crashPct` is set, for a sure outcome its `summary`, for a disabled option its
     `locks`; and one large primary button "실행" with the cost on it. The first enabled row of a page is
     picked by default. Rows and the detail button show the up-front stamina cost beside the price
     (무료 · 체력 -14). For a nonzero stamina modifier the row and detail show 체력 여유 +4%p,
     피로 -8%p or 탈진 -20%p. The detail keeps the crash risk and lock reasons visible together.
     Rest stays available in every action phase. Its button reads “푹 쉰다 · 체력 +60 · 계절 전체” before the
     first action and “쉬고 계절 넘기기 · 체력 +20” afterwards. Either rest ends the season.
   - **상점** — `shop` and `repair` options as upgrade cards (a grid, paged if needed): item icon, title,
     effect / description, and the price as the button label. Marked "계절 소모 없음". Locked cards are
     dimmed and show the first lock reason.
   - **은행** — `bank` options as cards in the same style, above them a debt gauge (`debt / creditLimit`).
   - **내 정보** — every non-zero stat except `acts` with its `STAT_LABEL` as a compact grid, net worth, and the next
     season’s upkeep lines. 체력, 이론 and 조종 실력 are listed even at zero. Paged if it does not fit.
   - **기록** — the recent log (`state.log`), newest first, paged.
4. **Bottom status bar.** At the left, the career emblem accompanies the stage name and rank. The middle
   shows `dateLabel` and “이번 계절 행동 N회” from `state.s.acts`. Two sunken LCD readouts on
   the right show 자금 in 만원 and 빚 / 한도. Debt near or over the limit turns the readout red. The
   readouts stack on narrow screens and retain the count-up and floating change animations.

Event, result, confirmation and ranking popups share a centred steel-blue window with a two-pixel bevel,
a pinstriped blue title bar with white text, and a cream inset body. Each fits inside the viewport.

- **Event** (`data-phase="event"`): shown as soon as `state.phase === 'event'`; it must be answered. A framed
  portrait from `eventPortrait(event.id)` sits beside the eight-column **현재 상태** chart (a labelled
  `<dl>`). A CSS silhouette fills the frame when the file is unavailable. The chart reads 자금, 신용, 체력, 이론, 조종, 경험, 평판, 기체 in order, wrapping to two rows on narrow phones. 자금, 이론, 조종, 경험 and 평판 show
  their actual values, each scaled to the smallest enclosing step of a fixed 50, 100, 200, 500, …
  ladder capped at the stat maximum. 신용 shows remaining credit divided by the limit, 기체 shows
  condition (0% without a drone), and 체력 shows points out of 100. Each column has
  its value or percentage above the bar and a name below. Below are the place name,
  inset event text and the event's choices (two at most) as large buttons. Each button carries the
  choice title, cost, the chance ("성공 66%") with a small bar, and the success / fail (or sure) summaries.
  A nonzero stamina modifier appears on the same reason line as in the action detail. Disabled choices show their locks.
- **Result** (`data-phase="result"`): after `choose`. For a roll: the luck animation (about 900 ms; a gauge
  with the success zone marked and a needle or rolling number landing on `result.roll.value`), then
  성공 / 실패, `result.text`, the stat deltas, including 체력, as chips (+green / -red), `notes` (추락!), the season change when present
  (“24세 봄 → 24세 여름”, 휴식 +N when positive and 계절 회복 +N), then the “계절 결산” ledger with one
  line per entry or a total when there are many. Auto wind-down includes the engine’s note. The sheet also shows a stage-up banner when
  `stageTo !== stageFrom`. One "계속" button. With `prefers-reduced-motion` the animation is skipped.

### 3. Ending (`data-screen="ending"`)

A pinstriped “비행 경력 결산” window with a cream body holds the framed portrait from
`endingPortrait(id)`, title and text (`endingInfo`), the score counting up, a 3 x 2 grid of run
facts (age, net worth, flights, wins, losses, crashes), "새 엔딩" / "최고 기록" badges, and the buttons "다시
하기" (primary), "엔딩 도감", "타이틀". Platform build: the `runStatus.text` line and the "닉네임 설정" button
fit on the same screen.

### 4. Ending gallery (`data-screen="gallery"`)

A bevelled album window with a navy title bar, discovery meter and fixed detail panel on top (title, text, "대표 엔딩" mark for `main`; "???" and a career hint for
an ending not found yet) and all 11 endings as tiles in a grid below (3 columns on a phone, 6 on desktop).
Tapping a tile shows it in the detail panel. Found tiles show lazy-loaded, asynchronously decoded portrait thumbnails and the title. Undiscovered
tiles and details use a dark CSS silhouette and never request that ending’s portrait. A neutral silhouette
fills any discovered portrait frame whose art is unavailable. A "타이틀" button. No scroll with all 11 found.

## Growth and feedback

- **Career emblem**: an original SVG badge in the bottom status bar that gains a tier per career stage (wings, stars,
  a crown for the top stages) and shows the rank. It pulses when the stage changes.
- **The drone on the map** is drawn larger and better equipped as the drone level rises.
- **Goal chip**: the next goal is the first option, in the engine's order, whose outcome moves the career to
  another stage (its `roll.success` or `sure` outcome carries the stage change; use the structured field in
  `OptionView`, not the Korean text). The chip shows "다음 목표 · <title>" and, when it is locked, its first
  lock reason; when it is enabled, "도전 가능". Tapping it shows that option in the 홈 list. Without such
  an option the chip shows “50세에 은퇴”.
- **Numbers move**: when a result is confirmed, the changed readouts and gauges count / fill to the new value
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
  - the 체력 pill carries both `data-stamina` and `data-stamina-band` with value `fresh | normal | tired | exhausted`.
    Tired, exhausted and insufficient stamina for every offered activity trigger warning colours;
  - the date panel carries a `data-acts="<count>"` indicator. Rest rows and the `data-option="rest"` button carry `data-rest="full | light"`;
  - `data-season-change` identifies the result’s date and recovery block;
  - top toolbar navigation buttons: `data-nav="home | shop | bank | info | log"`;
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
- No `console.error` in normal play. The default build requests only its own assets.
- `npm run layout` (the no-scroll check) and `npm run playtest` must pass.
