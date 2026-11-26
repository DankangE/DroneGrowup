# 파일럿 키우기 — life board UI spec

The life board is the default screen (`/?seed=11`). Existing `?life=1` links select the same client.
Rules and timings come from `docs/design/life-board.md` §§2 and 11. A fresh v2 run
opens its starting-choice popup directly. Play stays in `data-screen="play"`,
with a full-viewport illustrated drone town, wide 7×9 road board, floating HUD and list/detail overlays (PC-first). All four
supported sizes are checked: 1920×1080, 1536×864, 1366×768 and 1280×800.

The current renderer uses these hooks:

| Hook | Meaning |
| --- | --- |
| `#app[data-screen][data-phase]` | Screen and current presentation phase; animation may precede the next engine prompt |
| `[data-map="A..F"]` | Currently displayed map |
| `[data-space][data-kind]`, `[data-pawn]` | World tile id/kind and the pawn's current node |
| `[data-dest]` | Reachable tile button, or another map's destination in the option pager |
| `[data-path-preview]`, `[data-review-stop]` | Hover/focus route and early review stop |
| `[data-die="0|1"]` | The two wheel faces |
| `[data-action="spin|stop-spin|skip-move"]` | Start, stop the wheel, or finish movement |
| `[data-option]` | Engine choice id, disabled exactly when the engine disables it |
| `[data-action="page-prev|page-next"]` | Plain destination pager |
| `[data-popup]` | Mounted popup kind; result notifications use this hook too |
| `[data-action="popup-page-prev|popup-page-next"]` | Popup choices, at most six per PC page |
| `[data-action="popup-close|popup-reopen"]` | Dismiss a presentation or reopen an unresolved prompt |
| `[data-action="popup-details|popup-back|popup-text-next"]` | Choice details and fixed text pages |
| `[data-action="popup-confirm|popup-cancel"]` | Quit confirmation controls |
| `[data-result-wheel]` | Rolled value; accessible label also gives the chance and outcome |
| `[data-nav="life|phone"]`, `[data-tab]` | My-life/phone navigation and popup tabs |

`?debug=1` additionally exposes `window.__life.state()` and `.options()` as
read-only observations, and `.load(raw)` for validated layout/timing fixtures.
No debug API is exposed without that flag. Playtest never loads a fixture or
calls the browser engine directly: it clicks the default game screen.
Engine choices are applied independently in Node and compared with the browser
after each input. Result dismissal must leave the state unchanged.

| Command | Acceptance coverage |
| --- | --- |
| `npm run playtest:life` | Fresh seeds 1 and 11 at 1366×768, using real clicks until the first promotion or 12 completed seasons (three years); all choice pages, disabled options, results, pawn, dice, date and engine parity |
| `npm run layout:life` | Six maps × four sizes, movement/transfer/skip fixtures, all twenty §11.3 popup groups at each size, five life tabs and 21 ending/gallery entries |
| `npm run check:board -- keys` | Twelve seasons at each of the four sizes, using real Tab/Enter navigation, including local destination tiles, paging and result dismissal; zero mouse/focus fallbacks |
| `npm run check:board -- timed [1366x768]` | Twelve completed seasons on each of maps A–F with animations and reading pauses; prints each map's seconds per season and difference from 14.9 seconds |

All three default checks are in `npm run verify`; the longer `timed` measurement
is opt-in. Browser commands build and serve a local Vite preview and
use installed Chrome (`CHROME_PATH` may override its path; `HEADED=1` shows the
new playtest/board runners). They fail on page/console errors or external requests.
Layout assertions inspect actual boxes, clipping, scroll, 44px tap targets and
11px minimum text. Merely hiding overflow does not count as passing.

The policy takes an available job, prefers promotion/work/training, then an
affordable action or a free exit. It reads enabled engine options and reachable
routes; it does not reimplement eligibility or odds. The playtest's 12-season
fallback is the T20 interpretation of “at least a few years”; it does not claim
a 204-season lifetime or final-ending coverage from real play.

Timed runs load one working-character fixture at each map's start before the
clock starts, then stay on that map through real clicks. No fixture reloads or
animation skips occur during those twelve seasons. Reading pauses are 0.8s
before spinning (plus the real 0.7s animation), 3s for destinations, 4s for tile
choices, 3.5s for extras, 6s for events, 8s for large popups and 2.4s for results.
The final season's result dismissal is included. Output is measured wall time,
including browser/automation overhead, with the per-season samples printed.
It is a repeatable synthetic reading model, not a measured human study or a
pass/fail balance threshold; no balance numbers are changed by this check.

## Source and persistence

`src/main.ts` boots `src/ui2/app.ts`. Board, movement, HUD, popup and ending renderers live in
`src/ui2/`; `src/ui/dom.ts` and `src/ui/icons.ts` hold shared DOM/SVG helpers only.
`src/styles.css` supplies the base styles. The UI reads engine options, forecasts, routes, job offers
and summaries from `src/life/`; it never recomputes eligibility, prices, odds or endings.

`src/save.ts` saves each choice under `pilot-growup:run:v2`, and keeps 21 endings, scores, feats and
job history under `pilot-growup:meta:v2`. A stored run resumes on boot; the title also offers a continue control. Legacy runs
are discarded with a one-time notice; only known legacy endings and run count migrate.
With `VITE_NG_PLATFORM=1`, login precedes account-scoped saves and the client uses the separate
`pilotgrowup-v2` namespace. See [the platform contract](nalidagame-integration.md); server changes
are a separate order. Server/storage text is rendered using `textContent`.

Keep `data-option`, `data-pick`, `data-nav`, `data-tab`, `data-action`, `data-screen`, `data-phase`,
`data-dest`, `data-map` and `data-popup` hooks. Every popup has an exit, choices use paging,
and no screen or inner panel scrolls. Respect reduced motion and keyboard activation.

PC-first target sizes: 1920×1080, 1536×864, 1366×768, 1280×800. No scrolling at these sizes; below 900px only basic operation is required.
