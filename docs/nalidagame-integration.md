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
    "turn": 17,                      // 0..72
    "stage": "pilot",                // student | pilot | employee | instructor | academy | solo | company | director
    "phase": "action",               // action | event  (an ended run is never stored)
    "s": { "money": 340, "debt": 300, "...": 0 },   // integer stats, see below
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
is null or an object with `v === 1`, integer `turn` in 0..72 and a known `stage`. The client re-validates and
clamps everything it reads back (`restore` in `src/game/engine.ts`, `cleanProgress` in `src/save.ts`), so the
server check is about storage hygiene, not trust. Progress never feeds the leaderboard.

## Play record (`POST /plays`)

```jsonc
{
  "stage": "ceo",          // ending id: ceo | chairman | academy | solo | debtor | smallbiz | director | instructor | employee | pilot | student
  "score": 20778,          // integer 0..9_999_999
  "cleared": true,         // false only for "debtor"
  "durationSec": 612,      // integer 0..86_400, wall-clock time of this session of the run
  "detail": {
    "turns": 64,           // integer 1..72
    "age": 36,             // integer 20..38
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
- `detail.turns === 72` unless `stage` is `ceo`, `chairman`, `academy` or `debtor` (the only endings that can
  come early); `detail.age === 20 + floor(turns / 4)`;
- `score <= max(0, netWorth) + 10_000 + (72 - turns) * 50` (the largest ending bonus plus the early bonus);
- `wins + losses <= 2 * turns + 10`, `flights <= turns`, `crashes <= losses`;
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
