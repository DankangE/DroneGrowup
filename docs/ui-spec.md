# 파일럿 키우기 — UI spec

The UI is a thin layer over the rules in `src/game/`. It renders what the engine reports and sends back one
option id per tap. It never computes odds, payouts, requirements, grades, ranks or endings itself.

The game looks and plays like a life-sim board game on a table (direction B in `docs/ui-direction-options.md`):
a piece walks a looping year board, a rank card with a banner celebrates every step up the career ladder,
stats read as letter grades G to S, and every roll is a wheel whose wedges are the real odds.
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
import { newGame, options, forecast, choose, derived, dateLabel, currentEvent, endingInfo, num, staminaBand } from './game/engine.ts';
import { GRADED_STATS, grade, careerRank, careerPerks, nextRanks, rankChange } from './game/career.ts';
import { PLACES, ITEMS, ENDINGS, STAGES, STAT_LABEL, RULES, GRADES, GRADE_STEPS, CAREER } from './game/data.ts';
```

- `newGame(seed)` → `GameState` (JSON-serialisable). Pick the seed with `crypto.getRandomValues` (or `?seed=N` in the URL).
- `options(state)` → `OptionView[]`: everything the player may look at now. Each has `id`, `kind`
  (`action | job | event | shop | repair | bank`), `place`, `title`, `desc`, `cost`, `tire`, `free` (uses no stamina and leaves the season and its action count intact), `enabled`, `locks` (Korean reasons when disabled), and either `roll` (`chance` in %, signed `staminaPct` in percentage points, `success` and
  `fail` outcomes with pay-scaled `add`, optional `crashPct`) or `sure` (one outcome).
- `forecast(state, optionId)` runs every possible branch on its own copy, including for a locked option.
  Its `deltas` include fees, stamina, wear, sets, stat caps and cash shortfalls converted to debt.
  Each branch includes the newly acquired flag, changed stage, ending and season-end marker when applicable.
  `src/game/outcome-text.ts` formats the preview, chips and settlement ledger.
- `choose(state, optionId)` → `{ state, result }`. Pure: returns a new state. `result` has the roll
  (`chance`, `value` 0-99, `success`; success means `value < chance`), `text`, `deltas` (the option itself), `settle?.deltas` (subsequent season settlement), `flag` (newly acquired), `crashed`, `notes`, `upkeep` (the
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
  (the board's scene window, sunburst rays, floating number pops); mark those elements with `data-clip-ok`. A single line of text may
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
card on the table: three short how-to lines (a year is one lap of the board, several actions per season and
both rests, grades and rank-ups) as icon rows and the controls:
"새 게임" (large gold primary), "이어하기" (only with a saved run), "엔딩 도감 n / 11", best score and run count as
small stat pills. Platform build: nickname pill and a "랭킹" button; the leaderboard opens as a centred card
with paged rows.

### 2. Play (`data-screen="play"`, `data-phase="action | event | result | rankup"`)

On phones five regions stack: player plate, board, career strip, action card, bottom tabs. At widths of
900 px and above the board and career strip fill the left column and the 420 px action card the right one;
the player plate spans the top and the tabs sit in the plate's row or under the action card.

1. **Player plate.** Left: the chibi head token, the rank title from `careerRank` with its stars
   (`stars` filled of `maxStars`) and a round level badge (`Lv` + `level`). Middle: the date
   (`dateLabel`), “계절 행동 N회” (`data-acts`) and the lap “N / 30바퀴” (age − 19). Right: 자금 and 빚 / 한도 as two
   chunky coin pills; debt near or over the limit turns coral. They keep the count-up and floating change pops.
   Second row, the **grade strip** (`data-grades`): 체력 as a short meter with its number (it is a budget the
   player spends, so the number always shows) plus its grade badge and the band word 쌩쌩 / 지침 / 탈진 outside
   the normal band; then a grade badge each for 이론, 조종, 경험, 평판 and the stage's specialty (교육 경력 for
   instructor and academy, 사업 감각 for solo and company, 인맥 for pilot and employee, 지지율 for director), then
   드론 / 장비 / 차량 levels as small item chips. The whole strip is one button (`data-action="grades"`,
   `aria-pressed`): a tap flips every badge to the exact number and “다음 등급까지 N” (`data-grades="numbers"`),
   another tap flips back (`data-grades="letters"`). Each badge carries `data-stat` and `data-grade="<letter>"`.
2. **Board** (`data-board`). One lap is one year. A rounded-rectangle track of 16 spaces runs clockwise around
   the scene window: the four corner spaces are the season starts (top-left 봄, top-right 여름, bottom-right
   가을, bottom-left 겨울; larger, in the season colour, with the season name and a small icon), and three
   action spaces follow each corner along its side. Spaces carry `data-space="<season 0..3>-<step 0..3>"`.
   The piece (`data-token`, `data-season`, `data-step`) is the chibi head token with a small pointer. It
   stands on the corner at the start of a season and moves one space per action taken this season
   (`step = min(state.s.acts, 3)`; from the fourth action on it stays on the last space and shows “×N”).
   Spaces already walked this season show a footprint stamp; the current season's side is lit and the other
   three are muted. When the season ends the piece hops to the next corner; passing the 봄 corner shows
   “한 살 더!” for a moment. The 봄 corner carries the age.
   The **scene window** inside the track shows what the stage showed before: 현장 (the place and
   career-specific art from `sceneArt(place, state)` over the drawn tile fallback, with a solid place plate)
   or 지도 (the SVG town map; choosing an available landmark moves the drone and opens that place's
   actions). Two 44 px buttons on the window's corner switch between them and the choice persists.
   The run opens at the pending event's place, or the career stage's home place from `STAGE_PLACE`.
   The board only presents the calendar and the action count; it adds no rule of its own.
3. **Career strip** (`data-ladder`). A row: the current rung as a small card (title, stars), an arrow, and
   the first entry of `nextRanks(state)` as “다음 랭크 ▶ <title>” with one badge per requirement
   (`<label> <needGrade>` for a graded stat, “자금 600” or the flag's name otherwise; met ones carry a tick
   and full colour, unmet ones are hollow) and “도전 가능” when it is enabled. “+N” marks further next ranks.
   Without a next rank the strip reads “50세에 은퇴”. The strip is one button (`data-action="ladder"`): it
   opens the **career ladder card**, a centred card with one page per next rank (pager): target title, level
   and stars, each requirement as grade and number (“이론 D · 90 이상 · 지금 95”), the price, the stamina
   cost, the odds (“성공 55%” or “확정”), the engine's `locks` while locked, and a primary button
   “이 도전 보기” (`data-action="ladder-go"`) that closes the card and opens that challenge in 홈.
   “닫기” is `data-action="close"`.
4. **Action card.** Its header names the active tab, “이번 칸에서 할 일” for 홈. The cream body holds the
   selected tab's controls and a measured page of content.
   - **홈** — the season’s actions (options with `free === false`). A tab row: "전체", "일감" (kind `job`),
     "활동" (kind `action`), and "장소: <name>" when a place is selected on the map; the pager sits at the right
     end of the tab row ("1 / 4" between "이전" and "다음" icon buttons). The chosen view switch and an
     enabled pager arrow keep keyboard focus after a view or page change.
     - Compare option cards in two columns on phones and as many columns as fit on desktop. Pages are
       measured at the current width and height. Enabled options come first, with activities grouped before jobs within each group. Each card shows its place
       icon, title, odds for a roll ("66%" with a small wheel), the price line from `price` and the stamina
       modifier for a roll or a locked card (a sure card's 확정 line already lists them), the `forecastLines`
       branch lines, and a locked card's reasons instead of its lines.
       선불 applies on every branch, 추락 시 replaces the listed failure changes, and 계절 종료 marks wind-down.
     - Tap an ordinary card to commit immediately. A choice costing at least `CONFIRM_COST` (100만원)
       upfront, or with a forecast branch that changes stage or ends the run, opens an inline confirmation.
       It shows the title, description, preview wheel for a roll, full outcomes, and the gold commit button
       labelled by `detailLabel`. “선택지로” returns to the same grid page. The strip uses the grid's space
       when both cannot fit together. A locked card always opens this strip read-only: full outcomes, its
       reasons, and a disabled commit button, so the player can see what the choice would do.
     - The separate rest bar ends the season in one tap (R). Before the first action it reads “푹 쉬기”,
       afterwards “쉬고 계절 넘기기”, each beside its forecast line. In the last season, where rest ends the
       run, it opens the confirmation strip instead (`data-pick="rest"`).
     - Keys 1-9 press the cards on the current page, R the rest bar. Shortcuts are ignored while typing in a
       field, and a held Enter or Space does not repeat through a confirmation.
       The gain is the actual capped recovery from `restGain`. At zero gain the label is “계절 넘기기”.
       No choice is selected by default.
     - With 홈 open and no sheet, 1–9 activate the corresponding visible card in reading order and R rests.
       Opening a confirmation focuses its commit button when enabled, so Enter confirms.
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
  “사건 카드”: the header band names the place, a framed
  portrait from `eventPortrait(event.id)` sits beside the title and the inset event text (a CSS silhouette
  fills the frame when the file is unavailable), then one compact line of the player's standing (자금, 빚 / 한도,
  체력 number, and the grade badges of the grade strip), then the event's choices (two at most) as large
  buttons. Each button carries the
  choice title, cost, for a roll the preview wheel with "성공 66%", and the same up-front and branch lines as the action detail.
  A nonzero stamina modifier appears on the same reason line as in the action detail. Disabled choices show their locks.
- **Result** (`data-phase="result"`): after `choose`.
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
  - Then, for every result: a banner 성공! / 실패 (or “확정” for a sure outcome), `result.text`, the non-bookkeeping option deltas as chips (+mint / -coral; a graded stat that changed grade shows “D → C”), `notes` (추락!), the season change when present
  (`data-season-change`: “24세 봄 → 24세 여름”, 휴식 +N for automatic rest and 계절 회복 +N). Voluntary rest is in the option chips.
  The “계절 결산” ledger shows each entry or 합계 above three entries, plus tokens for any new debt,
  lost students, company growth or other visible settlement change. Auto wind-down includes the engine’s note. One "계속" button (`data-action="continue"`).
- **Rank card** (`data-phase="rankup"`): after "계속" on a result whose `rankChange(before, after)` is not
  null and whose run has not ended. It covers the screen (`data-rank-card`, `data-kind="up | move"`,
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

An “인생 결산” card on the table: the framed portrait from
`endingPortrait(id)` with the chibi of the final stage beside it, title and text (`endingInfo`), the final
rank (title, level, stars), the score counting up, a 3 x 2 grid of run
facts (age, net worth, flights, wins, losses, crashes), the final grade badges, "새 엔딩" / "최고 기록" stamps, and the buttons "다시
하기" (primary), "엔딩 도감", "타이틀". Platform build: the `runStatus.text` line and the "닉네임 설정" button
fit on the same screen.

### 4. Ending gallery (`data-screen="gallery"`)

An album card with a header band, discovery meter and fixed detail panel on top (title, text, "대표 엔딩" mark for `main`; "???" and a career hint for
an ending not found yet) and all 11 endings as tiles in a grid below (3 columns on a phone, 6 on desktop).
Tapping a tile shows it in the detail panel. Found tiles show lazy-loaded, asynchronously decoded portrait thumbnails and the title. Undiscovered
tiles and details use a dark CSS silhouette and never request that ending’s portrait. A neutral silhouette
fills any discovered portrait frame whose art is unavailable. A "타이틀" button. No scroll with all 11 found.

## Growth and feedback

- **The piece and the rank card** carry the growth: the chibi changes outfit with the career stage, the
  plate's stars and level badge follow `careerRank`, and the badge pulses when the rank changes.
- **The drone on the map** is drawn larger and better equipped as the drone level rises.
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
    `data-phase="action | event | result | rankup"`;
  - title / ending buttons: `data-action="new | continue-run | gallery | title | retry"`;
  - the 체력 meter carries both `data-stamina` and `data-stamina-band` with value `fresh | normal | tired | exhausted`.
    Tired, exhausted and insufficient stamina for every offered activity trigger warning colours;
  - the date panel carries a `data-acts="<count>"` indicator. The rest bar carries `data-rest="full | light"` and `data-option="rest"`, or `data-pick="rest"` when its forecast ends the run (the confirmation's commit button then carries `data-option="rest"`);
  - `data-season-change` identifies the result’s date and recovery block;
  - the board: `data-board`, `data-space`, and `data-token` with `data-season` and `data-step`;
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
    attribute when the engine reports it as not enabled. In 홈 this is the ordinary card, the rest bar, or the commit
    button in a confirmation strip; in 상점 / 은행 and in the event card it is the card's own button;
  - the result card's and the rank card's button: `data-action="continue"`;
  - with `?debug=1` in the URL only: `window.__game = { state: () => GameState, options: () => OptionView[] }`.
- Every option the engine offers is reachable through those hooks without the map, so the game is playable
  with a keyboard and a screen reader: real `<button>`s, visible focus, `aria-live="polite"` on the result text.
  The wheel is decoration for a screen reader: the odds and the outcome are also plain text.
- No `console.error` in normal play. The default build requests only its own assets.
- `npm run layout` (the no-scroll check) and `npm run playtest` must pass. The playtest also checks that the
  wheel shows the option's chance and stops on the engine's rolled value, that the piece stands on the space
  the state implies, that a badge's grade is `grade(stat, value)`, and that a rank card appears exactly when
  `rankChange` reports one.
