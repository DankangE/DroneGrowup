# 파일럿 키우기 — UI spec

The UI is a thin layer over the rules in `src/game/`. It renders what the engine reports and sends back one
option id per tap. It never computes odds, payouts, requirements, grades, ranks or endings itself.

The game looks and plays like a life-sim board game on a table (direction B in `docs/ui-direction-options.md`):
a piece walks a branching flight course, a rank card with a banner celebrates every step up the career ladder,
stats read as letter grades G to S, and the movement roulette has six equal wedges and the outcome wheel shows the actual odds.
**Nothing scrolls, anywhere.** Mechanics and mood only are borrowed from the genre: no name, character, board
layout, art, wording or logo of any published game is used.

## Files the UI owns

- `index.html` — one `<div id="app">`, `<html lang="ko">`, mobile viewport meta, loads `/src/main.ts`.
- `src/main.ts` — boot, screen switching, the `?debug=1` hook.
- `src/ui/*.ts` — screens, the board, the wheel, the rank card.
- `src/styles.css` — all styling.

The UI does not edit `src/game/*`, `src/save.ts`, `src/platform.ts`. If the engine lacks something the UI needs,
leave a `TODO(engine):` note at the call site and work with what exists.

## Engine API (read `src/game/types.ts` and `src/game/career.ts` for the exact shapes)

```ts
import { newGame, boardView, finalRank, options, forecast, choose, derived, dateLabel, currentEvent, endingInfo, num, staminaBand } from './game/engine.ts';
import { GRADED_STATS, grade, careerRank, careerPerks, nextRanks, rankChange } from './game/career.ts';
import { PLACES, ITEMS, ENDINGS, STAGES, STAT_LABEL, RULES, GRADES, GRADE_STEPS, CAREER } from './game/data.ts';
```

- `newGame(seed)` → `GameState` (JSON-serialisable). Pick the seed with `crypto.getRandomValues` (or `?seed=N` in the URL).
- `options(state)` → `OptionView[]`: everything the player may look at now. Each has `id`, `kind`
  (`board | action | job | event | shop | repair | bank`), `place`, `title`, `desc`, `cost`, `tire`, `free` (uses no stamina and leaves the season and its action count intact), `enabled`, `locks` (Korean reasons when disabled), and either `roll` (`chance` in %, signed `staminaPct` in percentage points, `success` and
  `fail` outcomes with pay-scaled `add`, optional `crashPct`) or `sure` (one outcome).
- `forecast(state, optionId)` runs every possible branch on its own copy, including for a locked option.
  Its `deltas` include fees, stamina, wear, sets, stat caps and cash shortfalls converted to debt.
  Each branch includes the newly acquired flag, changed stage, ending and season-end marker when applicable.
  `src/game/outcome-text.ts` formats the preview, chips and settlement ledger.
- `choose(state, optionId)` → `{ state, result }`. Pure: returns a new state. `result` has the roll
  (`chance`, `value` 0-99, `success`; success means `value < chance`), `text`, `deltas` (the option itself), `settle?.deltas` (landing and seasonal settlement), `flag` (newly acquired), `crashed`, `notes`, `upkeep` (the
  paid ledger lines and total), `stageFrom` / `stageTo`, `eventId` (a landing event
  now waits for a choice), `ended`.
- `state.phase`: `'action'` (pick what to do this season), `'event'` (answer `currentEvent(state)` with one of
  its `ev:N` options), `'ended'` (`state.ending`, `state.score`).
- `derived(state)` → age, `season` (0..3), `seasonName` (봄, 여름, 가을, 겨울), `dateLabel` (e.g. “24세 · 봄”), credit limit, net worth, stage / rank names, item names, next upkeep.
- `dateLabel(turn)` formats the date of any log entry. The calendar starts at 20 and advances one year every four seasons.
- `boardView(state)` supplies each node’s id, coordinates, edges, kind, label, place and route name, the piece position, board step and reachable spaces for faces 1–6.
- `result.move` supplies the rolled face, path, landing and optional fork or rank-up stop. A route choice can continue the path.
- `result.season` supplies the formatted dates, capped stamina refill and newly accrued ledger lines. `result.upkeep` supplies the balance paid on a pay space or at the end of the run. `result.restGain` is the actual stamina gained on landing.
- `finalRank(state)` supplies the final grade, title, total and complete score breakdown.
- `grade(stat, value)` → `{ letter, index 0..7, from, next }` or `null` for a stat without grades.
  `GRADED_STATS` are 체력, 이론, 조종 실력, 경험치, 평판, 교육 경력, 사업 감각, 인맥 and 지지율. The steps are
  `GRADE_STEPS` in `data.ts` (table in `docs/design.md`). Every `need.min` gate on a graded stat is a grade
  step, so a held grade at or above the asked grade always means the gate is met.
- `careerRank(state)` → `{ stage, field, title, level, stars, maxStars }`: the rung the run stands on.
- `nextRanks(state)` → the higher rungs on offer now, in the engine's order: `{ optionId, action, place, rank,
  cost, tire, chance?, enabled, locks, requirements: { label, met, stat?, need?, have?, needGrade?, haveGrade? }[] }`.
  A rung that is an achievement ending has `rank.ending`. Works while an event is waiting.
- `careerPerks(state)` → `계절 수입`, `신용 한도`, `일감 단가` as `{ id, label, value, unit }`.
- `rankChange(before, after)` → `null`, or `{ kind: 'up' | 'move', from, to, perks (with `gain`), next }` for the
  two states around one `choose`.

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
  (chibi portraits, sunburst rays, floating number pops); mark those elements with `data-clip-ok`. A single line of text may
  use `text-overflow: ellipsis` only where the full text is shown elsewhere on the same view.
- Supported sizes, each checked by `npm run layout`: 390 x 844, 360 x 740, 1280 x 800, 1366 x 768. The layout
  must also hold together between them (fluid, not four hard-coded sizes).
- Page size (rows per page) is derived from the room that is there (measure, or a height media query), so a
  shorter viewport shows fewer rows per page instead of overflowing.
- Buttons and other tap targets are at least 44 x 44 px. Text is at least 11 px (12 px or more for anything
  the player must read to decide). Everything is readable at 360 px wide.

## Look

A game table seen from above, drawn with the cover's sticker language so the title, the chibi figures and the
board belong together.

- **Table**: a soft sky-to-lavender background with a faint repeating pattern of small drones, stars and
  propellers (inline SVG or CSS, low contrast). No steel-blue window chrome anywhere.
- **Pieces of card**: every panel is a piece of thick card: cream face `#fff6e0`, a 3 px ink outline
  `#2b2440`, 16 to 20 px corners, and a hard offset shadow (`0 4px 0` ink) instead of a blur. Pressed buttons
  drop by the shadow's height.
- **Colour**: ink `#2b2440`; gold `#ffc93c` for the primary button, stars and the S grade; season colours
  spring `#ff9fb8`, summer `#5cc98f`, autumn `#ffa94d`, winter `#6fb7ff`; success mint `#2fbf8f`, fail coral
  `#f0564a`. Grade badges: G grey, F slate, E teal, D green, C yellow-green, B orange, A coral, S gold with a
  sheen. Grade colour is never the only signal: the letter is always printed.
- **Lettering**: fixed banner words and all digits and grade letters use the local `Bagel Fat One` subset
  (`public/fonts/bagel-fat-one-display.woff2`; glyphs: digits, A to Z, `!?+-%.,·:/~×` and the Hangul of
  파일럿 키우기 랭크 업 승급 성공 실패 진로 변경 새 출발 봄 여름 가을 겨울 추락 룰렛 확정 결산 인생 생일 한 살 더 세 등급 다음
  계속 엔딩 돌려라 대성공 아깝다). Text that comes from the data tables stays in the system font, bold.
- **Chibi player**: `chibiArt(state.stage)` (`public/art/chibi-<stage>.webp`, 384 x 384, flat cream
  `#fdf5e6` background, the figure fills the middle 45% of the width). Shown full-body on the rank card and
  the ending, and cropped to the head in a round cream token for the board piece and the player plate. When
  the image is unavailable the career emblem SVG takes its place.
- Motion is short and bouncy (pieces hop, cards pop in, numbers count). All of it is off, or reduced to a
  150 ms fade, under `prefers-reduced-motion: reduce`.

## Screens

### 1. Title (`data-screen="title"`)

The cover fills the upper part of the screen with the five-character key visual. Phones crop to the centre
three characters. The two-word “파일럿 키우기” heading uses the local Bagel Fat One font, outlined and tilted
over the lower artwork alongside the ribbon, one-line pitch and two pills. The console below is a piece of
card on the table: three icon rows explain moving by die, a free landing action followed by one optional stamina action, and pay settlements and promotion. The controls include
"새 게임" (large gold primary), "이어하기" (only with a saved run), "엔딩 도감 n / 11", best score and run count as
small stat pills. Platform build: nickname pill and a "랭킹" button; the leaderboard opens as a centred card
with paged rows.

### 2. Play (`data-screen="play"`, `data-phase="action | move | event | result | rankup"`)

On phones the player plate, board, career strip, action card and bottom tabs stack vertically. The board uses
26% of the available deck height, bounded to 180–245 px, across every step and tab. The panel gets the remaining height. At widths of
900 px and above the board and career strip fill the left column and the 420 px action card the right one;
the player plate spans the top and the tabs sit in the plate's row or under the action card.

1. **Player plate.** The chibi head, career title, stars and level identify the player. The life track
   (`data-life-track`, `data-age`, `data-turn`) groups the current date and four season dots on the left. A bar
   between small 20 and 50 end ticks fills to `state.turn / RULES.maxTurns`. The right edge reads “N / 30년”.
   Money and debt pills show the balance and credit limit.
   Second row, the **grade strip** (`data-grades`): 체력 as a short meter with its number (it is a budget the
   player spends, so the number always shows) plus its grade badge and the band word 쌩쌩 / 지침 / 탈진 outside
   the normal band; then a grade badge each for 이론, 조종, 경험, 평판 and the stage's specialty (교육 경력 for
   instructor and academy, 사업 감각 for solo and company, 인맥 for pilot and employee, 지지율 for director), then
   드론 / 장비 / 차량 levels as small item chips. The whole strip is one button (`data-action="grades"`,
   `aria-pressed`): a tap flips every badge to the exact number and “다음 등급까지 N” (`data-grades="numbers"`),
   another tap flips back (`data-grades="letters"`). Each badge carries `data-stat` and `data-grade="<letter>"`.
2. **Flight course.** The board (`data-board`, `data-step`) positions all 22 `boardView` nodes at their
   percentage coordinates. Every edge is drawn beneath the cards. The outer ring uses solid rails and the
   two detours use dashes. Spaces carry `data-space="<id>"` and `data-kind` and show their kind label.
   Wider boards also show place and route names. The chibi token (`data-token`, `data-pos`) stands on its
   current space. A light outline marks reachable spaces in the spin step. The two lanes out of the current
   fork are outlined, and focusing or hovering a route card emphasizes that lane.
   The central six-face roulette (`data-roulette`) has a fixed pointer. Tapping it or 주사위 굴리기 calls
   `choose(state, 'spin')` and saves the returned state immediately. During `data-phase="move"` the
   die spins for 700 ms and stops on the engine face, then the token hops along the returned path
   at 160 ms per space. A tap or key finishes the current stage. Reduced motion shows the destination
   immediately. During animation the first key press stops the roulette and a fresh press skips the walk
   to the engine’s landing space. The disc exposes `data-spin="spinning | done"` and the stopped `data-face`.
3. **Career strip** (`data-ladder`). A row: the current rung as a small card (title, stars), an arrow, and
   the first entry of `nextRanks(state)` as “다음 랭크 ▶ <title>” with one badge per requirement
   (`<label> <needGrade>` for a graded stat, “자금 600” or the flag's name otherwise; met ones carry a tick
   and full colour, unmet ones are hollow) and “도전 가능” when it is enabled. “+N” marks further next ranks.
   Without a next rank the strip reads “50세에 은퇴”. The strip is one button (`data-action="ladder"`): it
   opens the **career ladder card**, a centred card with one page per next rank (pager): target title, level
   and stars, each requirement as grade and number (“이론 D · 90 이상 · 지금 95”), the price, the stamina
   cost, the odds (“성공 55%” or “확정”), the engine's `locks` while locked, and a primary button
   “이 도전 보기” (`data-action="ladder-go"`) that opens that challenge in 홈 when offered on the current step. Other rungs show their requirements.
   “닫기” is `data-action="close"`.
4. **Step panel.** 홈 presents the current step. The other navigation entries retain their own paged views.
   - **Spin.** The departure place's scene, labelled with the place name, fills the room above
     `주사위 눈만큼 1~6칸` at every width. The gold 주사위 굴리기 button (`data-option="spin"`) occupies its own row
     at least 52 px high. During the spin step S rolls from any tab when a sheet is closed. Space rolls when the body
     or the board has focus. Focused buttons keep their native Space activation.
   - **Fork.** A mid-move stop or a fork landing shows 갈림길 · 어느 길로 갈까? (`data-fork`). Two route
     cards (`data-option="route:0"`, `data-option="route:1"`) show the engine titles and three space chips
     along each path before the join. A mid-move stop shows remaining steps. Keys 1 and 2 choose a route.
   - **Space.** On a train, job or rank-up space, `data-space-card="<kind>"` identifies the panel. The header
     names the space and place, explains the free stamina cost and shows a gold note after a forced promotion
     stop. A secondary 그냥 지나간다 button (`data-option="skip"`) passes the landing action.
   - **Bonus.** The single heading `추가 행동 하나 · <place> · 체력 N` (`data-bonus`) introduces the landed place’s actions at the displayed
     stamina costs. 계절 마치기 (`data-option="end"`, E or R) shows the next season’s refill from `RULES.seasonRefill`.
     When the cards leave at least 96 px of the panel empty, a place scene with the stamina meter
     (`data-bonus-aside`) fills it. With nothing affordable the engine ends the season without the step.
   - **Space and bonus choices.**
     - Compare option cards in two columns, with a full-width card where that fits more choices. Pages use the
       measured room above the skip or end button. Multiple pages have arrows beside that button. When enough choices
       are offered the first phone page holds at least four at 390 × 844 and three at 360 × 740.
       Enabled options come first, with activities grouped before jobs within each group. Each card shows its place
       icon, title, odds for a roll ("66%" with a small wheel), the price line from `price` and the stamina
       modifier for a roll or a locked card (a sure card's 확정 line already lists them), the `forecastLines`
       branch lines, and a locked card's reasons instead of its lines. On phones each visible branch or lock line
       uses one line with an ellipsis when needed. The card’s title attribute includes the full forecast and locks.
       선불 applies on every branch, 추락 시 replaces the listed failure changes, and 계절 종료 marks wind-down.
     - An ordinary card commits in one tap when its lines fit. If a forecast or lock line is truncated on
       the rendered grid page, the first tap opens the inline detail. Choices costing at least
       `CONFIRM_COST` (100만원) upfront or with a branch that changes stage or ends the run also open it.
       The card carries `data-pick` and the commit button carries `data-option` for the same choice.
       The detail shows the title, description, preview wheel for a roll, full outcomes, and the gold commit button
       labelled by `detailLabel`. “선택지로” returns to the same grid page. The strip uses the grid's space
       when both cannot fit together. A locked card always opens this strip read-only: full outcomes, its
       reasons, and a disabled commit button, so the player can see what the choice would do.
     - Keys 1–9 press the visible cards in reading order. Opening the detail focuses its enabled commit
       button so Enter confirms the choice.
       Held keys cannot repeat through a confirmation. Shortcuts yield to typing and open sheets.
   - **상점** — `shop` and `repair` options as upgrade cards (a grid, paged if needed): item icon, title,
     description, full sure forecast, and the price as the button label. Marked "계절 소모 없음". Locked cards are
     dimmed and show the first lock reason.
   - **은행** — `bank` options as cards in the same style, above them a debt gauge (`debt / creditLimit`).
   - **내 정보** — tabs “능력” (`data-tab="stats"`), “살림” (`data-tab="money"`) and “등급표” (`data-tab="grades"`).
     능력: one row per graded stat that is above zero, with 체력, 이론 and 조종 실력 always listed: label, grade
     badge, the exact number, and a bar from this grade's first value to the next grade's with “다음 <letter>까지 N”
     (“최고 등급” at S). The current rank (title, level, stars) heads the page. 살림: the remaining non-zero stats
     except `acts`, net worth, and the next season’s upkeep lines. 등급표: the `GRADE_STEPS` table, one row per
     stat with the first value of F to S, the held grade marked. Each is paged if it does not fit.
   - **기록** — the recent log (`state.log`), newest first, paged.
5. **Bottom tabs.** Five chunky buttons switch between 홈, 상점, 은행, 내 정보 and 기록 (`data-nav`). The
   active one is raised and gold. A dot marks 상점 or 은행 when an option there is enabled. All are at least
   44 px square.

Event, result, rank, ladder, confirmation and ranking cards share one centred card style (cream face, ink
outline, coloured header band) over the dimmed table. Each fits inside the viewport.

- **Event** (`data-phase="event"`): shown as soon as `state.phase === 'event'`; it must be answered. An
  “사건 카드”: the header band names the place and adds 대회 when `state.board.contest` is set, a framed
  portrait from `eventPortrait(event.id)` sits beside the title and the inset event text (a CSS silhouette
  fills the frame when the file is unavailable), then one compact line of the player's standing (자금, 빚 / 한도,
  체력 number, and the grade badges of the grade strip), then the event's choices (two at most) as large
  buttons. Each button carries the
  choice title, cost, for a roll the preview wheel with "성공 66%", and the same up-front and branch lines as the action detail.
  A nonzero stamina modifier appears on the same reason line as in the action detail. Disabled choices show their locks.
- **Result** (`data-phase="result"`). A roll, a crash, a flag or a career-stage change shows the result sheet
  with 계속 focused, so Enter or Space confirms. After board movement a paid ledger is 월급날 정산 (`data-pay`), and a
  board option with a season change or notes is 계절 마감 when there is no payment. A sure outcome and these board
  settlements appear as a settlement notice (`data-settle`, `role="status"`) at the bottom of the board for 4.5 s
  while the next prompt is already playable: title, 정산 합계, the date and recovery line (`data-season-change`),
  the same delta chips and markers as the sheet, the ledger lines and notes. When an event, a rank card or the
  ending follows, the full sheet opens instead so the change is read before the popup. Other board choices go
  directly to the next prompt. A rest gain alone appears for two seconds over the board (`data-toast`,
  `aria-live="polite"`). Reduced motion keeps the notice still.
  - For a roll, the **wheel** (`data-wheel`, with `data-chance`, `data-value` and, once it has stopped,
    `data-outcome="success | fail"`): a disc of 100 equal ticks whose success wedge spans exactly
    `chance` ticks from the top clockwise (mint, “성공”) and whose fail wedge is the rest (coral, “실패”).
    “성공 확률 66%” stays printed above it the whole time. A fixed pointer sits at the top; the disc turns
    (three or more turns over 700 ms, ease-out) and stops with the pointer over the middle of tick
    `result.roll.value`, the number the engine rolled. The stop point is never moved to look closer than it
    was. The card carries `data-spin="spinning"` while it turns and `data-spin="done"` after; the "계속" button
    is disabled until then. Clicking anywhere on the result sheet or pressing any key finishes the spin
    immediately. Revealing the result focuses “계속”, so Enter continues. With `prefers-reduced-motion` the disc appears already stopped on the same tick and
    fades in for 150 ms. The crash roll is a second, separate roll of the engine and is reported as a note,
    not drawn on the wheel.
  - Action, service and event results show the option title, success, failure or 확정, the option text, delta chips, grade changes and notes.
    The season block (`data-season-change`) shows both dates, actual refill and amounts entered in the
    ledger. A pay settlement prints every paid line and the engine total. Settlement text also reports
    rest gains and other stat changes. 계속 (`data-action="continue"`) opens the next step or card.
- **Rank card** (`data-phase="rankup"`): after "계속" on a result whose `rankChange(before, after)` is not
  null. It covers the screen (`data-rank-card`, `data-kind="up | move"`,
  `data-rank-title`, `data-rank-level`).
  - `up`: sunburst rays behind (`data-clip-ok`), and the banner “랭크 업!” in the display font, gold with an
    ink outline, tilted, overlapping the card's top edge.
  - `move` (퇴사, 해고, 전직 to the same or a lower level): no rays, a blue banner “새 출발”.
  - The card: on the left the full-body chibi of the new stage on its cream panel; on the right the field
    (`to.field`, small), the title (`to.title`, large), the level as a big display-font number with the
    stars under it; one row per perk whose value or gain is not zero (“계절 수입 130만원” with “+35만원” in
    mint or “-35만원” in coral beneath; 신용 한도; 일감 단가 in %); “다음 랭크 ▶ <next title>” with the
    requirement badges of the career strip; and the unlock line “<action> · 성공 55%” (or “확정”), followed by
    the first lock when it is locked. Further next ranks are reachable with the card's pager. Without a next
    rank the line reads “50세 은퇴까지 이 자리를 지킨다”.
  - One "계속" button (`data-action="continue"`) returns to the board (or to the waiting event).
  Every value on the card comes from `rankChange`; the UI formats numbers only.

### 3. Ending (`data-screen="ending"`)

The 인생 결산 card keeps the ending portrait and chibi, ending title and story, new-ending and best-score
stamps, and 다시 하기, 엔딩 도감 and 타이틀 controls. The 최종 성적 tab (`data-final-rank`,
`data-grade`, `data-score`) shows the grade badge, grade title and counting score from `finalRank(state)`.
The breakdown uses 12 px text on phones and 14 px on desktop. It shows net worth, ending bonus, distinct named routes
completed (완주한 길: each stage's four routes count once, so passing the same fork again adds nothing), contest wins, promotions and their points. A positive early-achievement bonus adds a 조기 달성 보너스 row.
When the cap applies, its applied amount is printed. 비행 기록 shows
the career rank, run facts and final stat grades. The platform status and nickname controls share this screen.

### 4. Ending gallery (`data-screen="gallery"`)

An album card with a header band, discovery meter and fixed detail panel on top (title, text, "대표 엔딩" mark for `main`; "???" and a career hint for
an ending not found yet) and all 11 endings as tiles in a grid below (3 columns on a phone, 6 on desktop).
Tapping a tile shows it in the detail panel. Found tiles show lazy-loaded, asynchronously decoded portrait thumbnails and the title. Undiscovered
tiles and details use a dark CSS silhouette and never request that ending’s portrait. A neutral silhouette
fills any discovered portrait frame whose art is unavailable. A "타이틀" button. No scroll with all 11 found.

## Growth and feedback

- **The piece and the rank card** carry the growth: the chibi changes outfit with the career stage, the
  plate's stars and level badge follow `careerRank`, and the badge pulses when the rank changes.
- **Numbers move**: when a result is confirmed, the changed readouts and gauges count / fill to the new value
  and a small "+200" / "-150" pop floats up from them; a grade badge that changed letter flips. Cards pop in.
  The primary button has a pressed state. All of it is off under `prefers-reduced-motion: reduce`.

## Rules for the build

- Korean for every player-facing string; identifiers in English.
- Vanilla TypeScript + DOM, no framework, no new dependencies. No images or fonts loaded from other hosts;
  art lives in `public/art`, fonts in `public/fonts`. Strict TS:
  `npm run typecheck` must pass (`noUnusedLocals`, `verbatimModuleSyntax`: use `import type` for types, and
  keep the `.ts` extension in relative imports).
- Stable hooks for the headless scripts (`scripts/ui-driver.mjs`, `playtest.mjs`, `layout-check.mjs`):
  - the root element carries `data-screen="title | play | ending | gallery"` and, on the play screen,
    `data-phase="action | move | event | result | rankup"`;
  - title / ending buttons: `data-action="new | continue-run | gallery | title | retry"`;
  - the 체력 meter carries both `data-stamina` and `data-stamina-band` with value `fresh | normal | tired | exhausted`.
    Tired, exhausted and insufficient stamina for every offered activity trigger warning colours;
  - time and board: `data-life-track`, `data-age`, `data-turn`, `data-board` / `data-step`,
    `data-space` / `data-kind`, and `data-token` / `data-pos`;
  - movement: `data-roulette` / `data-face` / `data-spin`, `data-phase="move"`;
  - steps: `data-fork`, `data-space-card`, `data-bonus`, `data-option="spin|route:N|skip|end"`;
  - settlement: `data-settle`, `data-pay`, `data-toast`, `data-season-change`;
  - ending: `data-final-rank` / `data-grade` / `data-score`;
  - grades: `data-grades="letters | numbers"` on the strip, `data-action="grades"` to flip it, and
    `data-stat` + `data-grade` on every badge;
  - the career strip `data-ladder` with `data-action="ladder"`, and in its card `data-action="ladder-go"` and `data-action="close"`;
  - wheels: `data-wheel-preview` and `data-wheel`, each with `data-chance`; the result wheel also has
    `data-value`, `data-outcome`, and the card `data-spin="spinning | done"`;
  - the rank card: `data-rank-card`, `data-kind`, `data-rank-title`, `data-rank-level`;
  - bottom tab buttons: `data-nav="home | shop | bank | info | log"`;
  - tab rows inside a view: `data-tab="<name>"`; choosing a tab or a nav entry shows its first page;
  - pagers: `data-action="page-prev"` and `data-action="page-next"`, with the `disabled` attribute at the ends;
  - a home card opening an inline confirmation: `data-pick="<option id>"`;
  - the inline confirmation’s return button: `data-action="back-to-options"`;
  - the button that commits an option (calls `choose`): `data-option="<option id>"`, with the `disabled`
    attribute when the engine reports it as not enabled. In 홈 this is a board choice, ordinary card, or the commit
    button in a confirmation strip; in 상점 / 은행 and in the event card it is the card's own button;
  - the result card's and the rank card's button: `data-action="continue"`;
  - with `?debug=1` in the URL only: `window.__game = { state: () => GameState, options: () => OptionView[] }`.
- Every option the engine offers is reachable through those hooks, so the game is playable
  with a keyboard and a screen reader: real `<button>`s, visible focus, `aria-live="polite"` on the result text.
  The wheel is decoration for a screen reader: the odds and the outcome are also plain text.
- No `console.error` in normal play. The default build requests only its own assets.
- `npm run layout` (the no-scroll check) and `npm run playtest` must pass. The playtest also checks that the
  wheel shows the option's chance and stops on the engine's rolled value, that the piece stands on the space
  the state implies, that a badge's grade is `grade(stat, value)`, and that a rank card appears exactly when
  `rankChange` reports one.
