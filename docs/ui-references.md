# 파일럿 키우기 — UI references

What the UI borrows from published game interfaces, and where each idea was seen. Only layout and interaction
patterns are taken. No art, names, text or colours are copied; everything in the game is drawn for it.

## Sources (checked 2026-11-24)

| Site | Result |
| --- | --- |
| https://gameui.matme.info/blog | Read. The `放置` (idle) tag lists 6 pages of idle and raising games with full screenshot sets. This is the main source. |
| https://interfaceingame.com | Read. No idle or mobile category; used for management-sim decision popups (simulation genre list). |
| https://www.gameuidatabase.com | Blocked: HTTP 403 for automated fetches. Not used. |
| https://gameui.net | Blocked: the page is an empty script shell, and a headless browser gets HTTP 403 "Bot identity could not be verified". Not used. |

Screens studied:

- A. Portrait idle raising game, home / reward / album screens: https://gameui.matme.info/blog/archives/122169
- B. Portrait idle shop-keeper game, home / notice popup / collection / reward box: https://gameui.matme.info/blog/archives/117902
- C. Portrait idle RPG, home / offline reward / login bonus / settings popup: https://gameui.matme.info/blog/archives/126503
- D. Idle raising RPG, lucky wheel / summon / shop tabs: https://gameui.matme.info/blog/archives/116956
- E. Management sim, two-way decision overlay: https://interfaceingame.com/screenshots/frostpunk-choose-our-path/
- F. Management sim, event popup with rewards and two answers: https://interfaceingame.com/screenshots/frostpunk-lost-expedition/
- Tag index for more idle games: https://gameui.matme.info/blog/archives/tag/%e6%94%be%e7%bd%ae

## Patterns adopted

1. **One fixed screen: resource bar on top, stage in the middle, action panel below, tab bar at the bottom.**
   Seen in A, B and C: the home screen never scrolls; the bottom tab bar swaps what the lower panel shows
   and the stage stays. Fit: our old UI was a long page (map, then HUD, then a card list). The game is a loop
   of one choice per quarter, so everything for that choice has to be on screen at once.

2. **Persistent resource pills in the top bar.** A, B and C keep the currencies as small rounded pills with
   an icon at the top right, and the player's level / name at the top left. Fit: 자금 and 빚 decide every
   choice here, and 나이 · 분기 is the clock. They sit in the top bar with the career stage emblem on the left.

3. **A central stage that shows the growth.** A and B put the character and its place in the middle and
   the place changes as the player progresses; A adds a small stage-progress track ("1-3" with dots) above it.
   Fit: the top-view town map is our stage. The player's drone on the map grows with the drone level, the
   career emblem gains a tier per stage, and a progress track shows how far the 72 quarters have run.

4. **A mission chip that names the next goal.** A shows one mission strip just above the action area
   ("clear 1-1", with a reward icon). Fit: the next goal is the option that moves the career to the next stage;
   the chip shows its title and what is still missing, and a tap jumps to it.

5. **Compact rows plus one big primary button.** A's upgrade row (level, name, cost button) and D's lucky-wheel
   screen (one large "Spin" button with the cost on it) keep lists dense and give the commit action one obvious
   place. Fit: up to 18 actions are on offer. A row shows icon, title, cost and chance; picking a row fills a
   detail strip (success / fail outcomes) with one large "실행" button. Lists are paged, never scrolled.

6. **Upgrade cards with level, effect and a cost button.** A's bottom upgrade cards and D's shop grid: each
   card is one thing to buy, the price is the button label, locked cards are dimmed with a lock. Fit: the
   상점 tab (drone, gear, car, repair) and the 은행 tab (borrow, repay) become such cards, marked
   "분기 소모 없음".

7. **Centred popup with a title band and at most two answer buttons.** B's notice popup and C's reward popup
   use a header band, a short body and one or two buttons side by side; E and F do the same for decisions in a
   management sim, F listing the gains above the buttons. Fit: random events (two choices at most) and the
   result of a choice become centred popups over the dimmed stage, with the odds and outcomes on each answer
   and the stat changes as reward chips.

8. **Album grid for the collection.** A's album and B's collection book show found entries as tiles and
   missing ones as dark silhouettes, with the detail of the selected tile in a fixed panel. Fit: the 11 endings
   fit a 3 x 4 grid on a phone; tapping a tile shows its text above the grid, so the gallery needs no scroll.

9. **Gauges and counting numbers.** Level and time gauges in B (reward box timer bar) and C (stage bar under
   the player name), and the gain popups in all four idle games. Fit: 경험치, 평판 and drone condition are
   gauges; money and stat changes count up and float a "+200" pop when a result is confirmed.
