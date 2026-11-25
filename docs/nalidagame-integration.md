# NalidaGame integration — life board v2

This is the client contract for §12.2–12.3 of [life-board.md](design/life-board.md).
NalidaGame registration and validation changes are a separate order. This ticket changes no server
storage or NalidaGame repository files; it does not deploy or register a leaderboard.

## Client and namespaces

- `VITE_NG_PLATFORM=1 npm run build` enables the SDK. Optional `VITE_NG_API` and `VITE_NG_PORTAL`
  default to `https://api.nalidagame.online` and `https://nalidagame.online`.
- The default build uses localStorage only: no SDK load or platform request.
- The default entry runs v2; `?life=1` remains a compatible link.
- **New v2 game/leaderboard id: `pilotgrowup-v2`.** The SDK namespaces progress, plays and rankings by
  `init({ gameId })`, so v2 uses this new id for all three. Register it separately with title
  `파일럿 키우기`, descending score order and ending ids as `stage`. The old server namespace `pilotgrowup` remains separate.
  This id is a client contract, not a claim that the server registration already exists.
- Platform login and nickname are required before v2 loads any account save. SDK loads from
  `${API}/sdk/nalidagame.js`. Server strings are rendered with `textContent`.
- Every committed choice saves locally immediately and queues a server save (1.5 s debounce).
  A finished run records its collection and submits one play; rendering the ending again submits nothing.
- At boot, merge collection fields by union and scores/run count by maximum. If server `progressAt`
  exceeds this browser's last sync marker, adopt its run, including `null` when another device finished.
  Otherwise keep the local run and upload unsent choices. A stale open tab stops uploading when it
  discovers a newer server stamp. Sync markers are versioned and account-scoped.
- Run duration is the elapsed time in the current visit; it is not accumulated across reloads.

## Local migration (§12.2)

Standalone keys are `pilot-growup:run:v2` and `pilot-growup:meta:v2`. Platform keys append
`:u:<encodeURIComponent(userId)>`; neither another account nor standalone storage is imported.

On entering v2, discard the scoped v1 run and show `이전 버전의 판은 이어 할 수 없습니다` on a title
screen once. The player can start a new life or continue an existing v2 save. No v1 state is converted.
Copy the 11 known v1 endings and run count into v2; the initial best score is zero, with empty feats,
jobs and per-ending scores. Retain v1 meta as an unchanged migration backup. A scoped
`pilot-growup:migrated:v2` marker prevents repeated imports. A failed meta write leaves migration retryable.

If v2 meta already exists, preserve its scores, union galleries, and use the larger run count (rather than
adding two possibly overlapping records). This is the chosen interpretation of the unspecified collision
case. Sync timestamps live at `pilot-growup:synced:v2` with the same account suffix.
Server-side transfer of old account meta into the new namespace belongs to the separate server order;
the v2 client never reads or overwrites the old server namespace. Locally cached v1 meta can migrate now.

## Required server changes (§12.3)

The server game hook currently associated with `apps/api/src/games/pilotgrowup.js` needs a v2 contract
registered under `pilotgrowup-v2`, while keeping the old registration usable during the transition.

| Item | v1 | v2 |
| --- | --- | --- |
| `run.v` | 1 | 2; discard v1 runs |
| `run.turn`, `detail.turns` | 0–120 | 0–204 |
| `detail.age` | 20–50; `20 + floor(turns / 4)` | 19–70; `19 + floor(turns / 4)` |
| `run.stage` | Eight stages | Removed; `status` has four values, `track` has 19 or null |
| `run.s` | Existing stats | Add `happy`, `fans`, `homeIndex`, `capStamina` |
| `run.board`, `job`, `home`, `estates`, `holdings`, `family`, `fund`, `life`, `timers`, `feats` | Board packed into `seen` | Accept native structured fields in `cleanRun`; no `packBoard`; `seen` turn bound increases from 120 to 204 |
| Ending ids, `meta.gallery` | 11 | 21 |
| Early endings | CEO, chairman, academy, debtor | Only early retirement from age 55 (`turns >= 144`); otherwise `turns === 204` |
| Score upper bound | `max(0, netWorth) + 10000 + (120 - turns) * 50`; review at 400000 | `max(0, netWorth) + 999 * 30 + 30000`; review at twice the simulation maximum |
| `wins + losses`, `flights` | Per-turn allowances 8, 5 | Unchanged: `wins + losses <= 8 * turns + 10`, `flights <= 5 * turns` |
| Request body | 32 KB | Unchanged; typical state approximately 4–6 KB |
| Leaderboard | `pilotgrowup` | Separate `pilotgrowup-v2`; never mix v1 scores |

T15 round 2 (2026-11-26): 16 policies × seeds 1–300, each under base, single-roulette, and no-bank
rules, observed a maximum score of **238061** (all three experiments) and zero formula-cap violations.
Twice this observed maximum is **476122**, the proposed v2 review threshold. This is a measured
review threshold, not a mathematical maximum; balance acceptance still has 41 failing criteria.
See [the balance report](life-balance-report.md). No server threshold was changed.

## Progress (`PUT /progress`, last write wins on `progressAt`)

```ts
{
  run: GameStateV2 | null, // unfinished state; phase action/event, never ended
  meta: {
    gallery: EndingId[],  // known ids, unique, at most 21
    best: number,        // nonnegative safe integer; no v1 score cap
    runs: number,        // integer 0..99999
    feats: string[],      // unique ids, at most 200; 1..80 ASCII word/colon/hyphen characters
    jobs: TrackId[],      // known ids, unique, at most 19
    bestByEnding: Partial<Record<EndingId, number>> // nonnegative safe integers
  }
}
```

The authoritative run shape is §12.1 and `src/life/types.ts`; validation/restore is in
`src/life/restore.ts` and `src/life/engine.ts`. Keep seed/RNG, board dice and ledger, career history,
family, property, investments, timers and feats intact. All numbers are integers. New stats have ranges
`happy/fans: 0..999`, `homeIndex: 60..200`, `capStamina: 60..100` (also subject to the age cap).
`status` is `student | jobless | working | retired`. Known tracks are:

`service, delivery, mechanic, clerk, pilot, employee, instructor, public, rescue, creator, engineer,
inspector, film, atc, racer, solo, company, academy, director`.

The v2 client sends `board` directly and never encodes `_b.*` entries in `seen`. The classic client
and its board-packing helper were removed in T23. A legacy cleaner must not process the v2 namespace:
it would silently drop the new fields. Progress never feeds the leaderboard.

## Play record (`POST /plays`)

The envelope remains `{ stage, score, cleared, durationSec, detail }`. `stage` is the ending id;
`cleared` is false only for `debtor`. `durationSec` is an integer in 0..86400. Detail retains these keys:

| Field | v2 contract |
| --- | --- |
| `turns` | Integer 0..204; finished runs follow the retirement rule above |
| `age` | `19 + floor(turns / 4)`, integer 19..70 |
| `netWorth` | Safe integer from `finalNetWorth`, including improvements and succession value |
| `debt` | Integer 0..9999999 |
| `wins`, `losses`, `flights`, `crashes` | Integers 0..9999 plus per-turn limits above |
| `score` (envelope) | Nonnegative safe integer under the formula bound; no v1 9999999 cap |

The current engine advances early retirement through passive income to turn 204 before settlement,
so its submitted `detail.turns` is 204 and age is 70 even when retirement was chosen at 55.
The original retirement turn remains in `run.timers.ending_early_at`; no new play detail field is added.
A debtor can retain happiness and feat points: **do not enforce the v1 `debtor => score === 0` rule**.
Retain the existing `flights <= wins + losses` and `crashes <= losses` sanity checks.

The 21 ending ids are `ceo, chairman, academy, solo, debtor, smallbiz, director, instructor, employee,
pilot, student, philanthropist, legend, master, star, hero, tycoon, family, official, freeman, worker`.
The source table is `ENDING_IDS` in `src/life/life-data.ts`.

## Checks and handoff

`tests/life-save.test.ts` covers local migration, version/account isolation, deterministic restore,
collections, blocked/corrupt storage, legacy migration, v2 payloads and UI save/restore/ending wiring.
`npm run playtest:platform` builds the platform client against a local stand-in SDK. It checks native
v2 state upload, account isolation, newer server state/null, stale tabs, unsent choices, one ending
submission to `pilotgrowup-v2`, and both the default URL and compatible `?life=1` entry. It makes no production API requests.

The PM runs that port-based playtest. Server registration, server migration/validation, a measured
review threshold, hosting and deployment remain separate work.
