// Where a run and the player's record live between visits: localStorage always, plus the nalidagame.online
// account when the platform flag is on (src/platform.ts). The UI only talks to this file.
import { ENDING_IDS } from './game/data.ts';
import { restore } from './game/engine.ts';
import type { EndingId, GameState } from './game/types.ts';
import { PLATFORM, pushProgress, submitRun } from './platform.ts';

const RUN_KEY = 'pilot-growup:run:v1';
const META_KEY = 'pilot-growup:meta:v1';
const SCORE_MAX = 9_999_999;

/** What survives a finished run: which endings were seen, the best score, how many runs ended. */
export type Meta = { gallery: EndingId[]; best: number; runs: number };
/** The whole record as stored on the server: `run` is the unfinished run or null. */
export type Progress = { run: GameState | null; meta: Meta };

const read = (key: string): unknown => {
  try {
    return JSON.parse(localStorage.getItem(key) ?? 'null');
  } catch {
    return null; // private mode, blocked storage or a damaged entry: start clean
  }
};
const write = (key: string, value: unknown) => {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch { /* storage full or blocked: the run still plays, it just does not persist */ }
};

const int = (v: unknown, max: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(0, Math.floor(v))) : 0);

/** Untrusted JSON (localStorage or the server) -> a Meta with only known endings and bounded integers. */
export function cleanMeta(raw: unknown): Meta {
  const d = (raw && typeof raw === 'object' ? raw : {}) as { gallery?: unknown; best?: unknown; runs?: unknown };
  const seen = Array.isArray(d.gallery) ? d.gallery : [];
  return { gallery: ENDING_IDS.filter((id) => seen.includes(id)), best: int(d.best, SCORE_MAX), runs: int(d.runs, 99_999) };
}

export const mergeMeta = (a: Meta, b: Meta): Meta => ({
  gallery: ENDING_IDS.filter((id) => a.gallery.includes(id) || b.gallery.includes(id)),
  best: Math.max(a.best, b.best),
  runs: Math.max(a.runs, b.runs),
});

/** Untrusted JSON -> Progress. A finished or unreadable run is dropped. */
export function cleanProgress(raw: unknown): Progress {
  const d = (raw && typeof raw === 'object' ? raw : {}) as { run?: unknown; meta?: unknown };
  const run = restore(d.run);
  return { run: run && run.phase !== 'ended' ? run : null, meta: cleanMeta(d.meta) };
}

export const loadMeta = (): Meta => cleanMeta(read(META_KEY));

/** The unfinished run to continue, or null. */
export function loadRun(): GameState | null {
  const run = restore(read(RUN_KEY));
  return run && run.phase !== 'ended' ? run : null;
}

/** Call after every choice. A finished run is not kept (use `recordEnding` for that). */
export function saveRun(state: GameState) {
  const run = state.phase === 'ended' ? null : state;
  write(RUN_KEY, run);
  if (PLATFORM) pushProgress({ run, meta: loadMeta() });
}

export function clearRun() {
  write(RUN_KEY, null);
  if (PLATFORM) pushProgress({ run: null, meta: loadMeta() });
}

/** Call once when a run ends: updates the gallery / best / run count, clears the saved run, posts the score. */
export function recordEnding(state: GameState, durationSec: number): { meta: Meta; firstTime: boolean; newBest: boolean } {
  const before = loadMeta();
  const ending = state.ending;
  if (state.phase !== 'ended' || !ending) return { meta: before, firstTime: false, newBest: false };
  const firstTime = !before.gallery.includes(ending);
  const newBest = state.score > before.best;
  const meta = mergeMeta(before, { gallery: [ending], best: int(state.score, SCORE_MAX), runs: before.runs + 1 });
  write(META_KEY, meta);
  write(RUN_KEY, null);
  if (PLATFORM) {
    pushProgress({ run: null, meta });
    submitRun(state, durationSec);
  }
  return { meta, firstTime, newBest };
}

/** Platform boot hands over the server copy: the gallery and best score are merged, a server run wins over none. */
export function adoptServerProgress(server: Progress) {
  const meta = mergeMeta(loadMeta(), server.meta);
  write(META_KEY, meta);
  if (server.run && !loadRun()) write(RUN_KEY, server.run);
}
