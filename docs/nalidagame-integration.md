# NalidaGame integration

The game ships with a client for nalidagame.online that is **off by default**. This document is what the
NalidaGame server side needs to register the game. Nothing has been changed in the NalidaGame repo.

## Client

- Build flag: `VITE_NG_PLATFORM=1 npm run build` turns it on. Optional `VITE_NG_API` (default
  `https://api.nalidagame.online`) and `VITE_NG_PORTAL` (default `https://nalidagame.online`).
- With the flag off (the default) the platform code is dead code after Vite's env replacement: no SDK script,
  no network request, localStorage only.
- With the flag on (`src/platform.ts`): loads `${API}/sdk/nalidagame.js`, calls `NalidaGame.init({ gameId:
  'pilotgrowup', ... })`, blocks the game behind a login / nickname gate, loads server progress once at boot,
  saves progress after every choice (debounced 1.5 s, one request at a time, read-merge-write with a retry on
  conflict), submits one play record per finished run and shows the top 20.
- Local copies on the platform build are stored per account (`pilot-growup:<name>:v1:u:<user id>`), so two
  accounts on one browser never share a run or a gallery. At boot the gallery and best score are merged; the
  run follows the newer side: if the server's `progressAt` is later than the one this browser last read or
  wrote, the server's run replaces the local one (also when it is `null`, a run finished elsewhere), otherwise
  the local run stays. Choices made offline on one device are dropped if another device saved after them.
  A page left open while another device saves does not overwrite that record: its next upload sees the newer
  `progressAt`, stops, and asks for a reload. Local changes that never reached the server (tab closed before
  the upload) are uploaded at the next boot.
  `npm run playtest:platform` checks these rules against a stand-in SDK.
- Nicknames and every other server string reach the DOM through `textContent` only. Numbers from the server
  are coerced to integers before display.

## games row

| field | value |
|---|---|
| id | `pilotgrowup` |
| title | `파일럿 키우기` |
| description | `드론학과 학생에서 시작해 선택과 운으로 커리어를 키우는 탑 뷰 선택 게임` |
| leaderboard order | score, descending (higher is better) |
| stage | a string: the ending id (see below), not a level number |
| play URL | where the flagged build is hosted (not decided here) |

## Progress (`PUT /progress`, last write wins on `progressAt`)

```jsonc
{
  "run": null | {                    // the unfinished run, or null between runs
    "v": 1,
    "seed": 123456789,               // uint32
    "rng": 987654321,                // uint32
    "turn": 17,                      // 0..120
    "stage": "pilot",                // student | pilot | employee | instructor | academy | solo | company | director
    "phase": "action",               // action | event  (an ended run is never stored)
    "s": { "money": 340, "debt": 300, "acts": 2, "...": 0 },   // integer stats; acts = 0..99 non-rest actions this season, defaults to 0 in older saves
    "flags": ["licensed"],           // subset of: licensed, examiner, member, tech
    "eventId": null,                 // string id of the waiting event, or null
    "seen": { "typhoon": 12 },       // event id -> turn it last fired
    "ending": null,
    "score": 0,
    "log": [{ "turn": 16, "text": "…", "tone": "good" }]   // at most 30 lines, text at most 300 chars
  },
  "meta": {
    "gallery": ["pilot", "debtor"],  // ending ids seen, no duplicates, at most 11
    "best": 3225,                    // 0..9_999_999
    "runs": 4                        // 0..99_999
  }
}
```

Suggested server validation: body is an object with exactly `run` and `meta`; total size under 32 KB;
`meta.gallery` only contains the eleven ending ids; `meta.best` and `meta.runs` are integers in range; `run`
is null or an object with `v === 1`, integer `turn` in 0..120 and a known `stage`. The client re-validates and
clamps everything it reads back (`restore` in `src/game/engine.ts`, `cleanProgress` in `src/save.ts`), so the
server check is about storage hygiene, not trust. Progress never feeds the leaderboard.

### Balance update: three new stats in `run.s` (server change needed)

The balance update adds three integer stats to `run.s`. Everything else in the progress shape, including
`"v": 1`, is unchanged, and the play record is unchanged.

| key | range | meaning |
|---|---|---|
| `stamina` | 0..100 | 체력, starts at 100 |
| `theory` | 0..999 | 이론 |
| `skill` | 0..999 | 조종 실력 |

What the merged hook (`apps/api/src/games/pilotgrowup.js`) does today: `cleanRun` copies only the keys in its
`STATS` list, so it accepts the new payload but silently drops these three. Nothing is rejected. The effect is
that a run loaded back from the server (another device, or cleared local storage) has no `stamina`, `theory`
or `skill`; the client then treats it like an old save and fills them in (`stamina` 100, `theory` and `skill`
= `max(floor(xp / 2), 30 once licensed)`), so the run continues but with reset stamina and estimated
training stats.

Needed in NalidaGame, one line:

- add `'stamina', 'theory', 'skill'` to `STATS` in `apps/api/src/games/pilotgrowup.js` (the existing
  `±STAT_LIMIT` clamp is enough; the client clamps to the ranges above on restore).

Not needed for these three stats: no `v` bump, no SQL change, no new `detail` keys. The seasons update
below does change `scorePlay` and the turn bounds; see [Seasons update](#seasons-update).

Old local saves (no such keys) are migrated the same way by `restore`; `tests/engine.test.ts` covers it.

## Play record (`POST /plays`)

```jsonc
{
  "stage": "ceo",          // ending id: ceo | chairman | academy | solo | debtor | smallbiz | director | instructor | employee | pilot | student
  "score": 20778,          // integer 0..9_999_999
  "cleared": true,         // false only for "debtor"
  "durationSec": 612,      // integer 0..86_400, wall-clock time of this session of the run
  "detail": {
    "turns": 64,           // integer 0..120
    "age": 36,             // integer 20..50
    "netWorth": 10828,     // integer -9_999_999..9_999_999
    "debt": 0,             // integer 0..9_999_999
    "wins": 41,            // integer 0..9_999  (rolls won)
    "losses": 19,          // integer 0..9_999
    "flights": 33,         // integer 0..9_999
    "crashes": 2           // integer 0..9_999
  }
}
```

Validation bounds the server hook should enforce (reject with 400 otherwise):

- every number is an integer inside the range above; `stage` is one of the eleven ids; no extra keys;
- `stage === "debtor"` ⇔ `cleared === false`, and then `score === 0`;
- `detail.turns === 120` unless `stage` is `ceo`, `chairman`, `academy` or `debtor` (the only endings that can
  come early); `detail.age === 20 + floor(turns / 4)`;
- `score <= max(0, netWorth) + 10_000 + (120 - turns) * 50` (the largest ending bonus plus the early bonus);
- `flights <= wins + losses`, `crashes <= min(flights, losses)`;
- a soft plausibility cap for review rather than rejection: `score > 400_000` (the simulation's maximum over
  3,300 bot runs is far below this).

The score is computed on the client from a seeded run; the server cannot replay it without the choice list,
so these are sanity bounds, the same level of trust as the other NalidaGame games. If replay verification is
wanted later, the run is deterministic: `seed` plus the ordered option ids reproduces it with the engine in
`src/game/` (pure TypeScript, no DOM).

## Not done here

- No NalidaGame PR: its open PR #5 touches the same API files. The games row and the two hooks above are the
  whole server-side change.
- No hosting decision for the flagged build, and no CORS / cookie origin entry for it.

## Seasons update

A run now lasts 120 seasons (age 20 to 50) instead of 72 quarters (age 20 to 38), and one season holds
several actions. `turn` is still the index of the three-month step, so `age = 20 + floor(turn / 4)` and the
season is `turn % 4` exactly as before; only the upper bound moved.

### What changed in the payloads

Progress (`PUT /progress`):

| field | before | now |
|---|---|---|
| `run.turn` | 0..72 | 0..120 |
| `run.s.acts` | absent | integer 0..99: actions taken in the current season, back to 0 when the season changes |
| `run.seen[*]`, `run.log[*].turn` | 0..72 | 0..120 |

Play record (`POST /plays`): same keys, wider values.

| field | before | now |
|---|---|---|
| `detail.turns` | 1..72 | 1..120 |
| `detail.age` | 20..38 | 20..50 |
| `detail.wins + detail.losses` | at most about 2 per turn | up to 7 per turn (six action rolls and one event roll) |
| `detail.flights` | at most 1 per turn | up to 5 per turn |
| `score` | simulation maximum 23,626 | simulation maximum 65,606 |

No new keys in `detail`, `"v"` stays 1, no SQL change.

### What must change in NalidaGame (`apps/api/src/games/pilotgrowup.js`)

1. `MAX_TURNS = 72` becomes `120`. Everything derived from it follows: the `cleanRun` clamps on `turn`,
   `seen` and log turns; `DETAIL_RANGE.turns` `[1, 120]`; the rule that endings other than `ceo`, `chairman`,
   `academy` and `debtor` need `turns === MAX_TURNS`; and the early bonus `(MAX_TURNS - turns) * 50`.
2. `DETAIL_RANGE.age` becomes `[20, 50]`. `age === 20 + floor(turns / 4)` is unchanged.
3. Add `'acts'` to `STATS` (together with `'stamina', 'theory', 'skill'` from the section above).
4. In `scorePlay`, loosen the two per-turn bounds: `wins + losses <= 2 * turns + 10` becomes
   `wins + losses <= 8 * turns + 10`, and `flights <= turns` becomes `flights <= 5 * turns`. The cheapest
   rolled action costs 15 stamina and the cheapest flight 20, against at most 100 stamina a season.
5. `MAX_SCORE = 150_000` can stay (the highest of 3,300 bot runs is 65,606). The comment beside it that
   mentions about 30,000 is out of date.
6. Re-record the test fixtures for the hook with a 120-season run.

Until NalidaGame has these changes: a finished run longer than 72 seasons is rejected by `scorePlay` (the
score is not recorded; the game itself keeps working), and a run reloaded from the server comes back with
`turn` clamped to 72 and without `acts`. So the flagged build should not be pointed at production NalidaGame
before the hook is updated.

### Old saves

A version 1 save from before this update loads as is: its quarter index is the season index, so the age and
season shown do not change, and a missing `acts` is read as 0. Requirements for licences and promotions were
tripled in the rebalance, so an old character is further from the next gate than it was; nothing is lost and
the run stays playable. `tests/engine.test.ts` covers the load.
