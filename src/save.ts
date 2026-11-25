// Where a run and the player's record live between visits: localStorage always, plus the nalidagame.online
// account when the platform flag is on (src/platform.ts). The UI only talks to this file.
import { ENDING_IDS } from './game/data.ts';
import { restore } from './game/engine.ts';
import type { EndingId, GameState } from './game/types.ts';
import { ENDING_IDS as LIFE_ENDINGS, TRACK_IDS } from './life/life-data.ts';
import { restore as restoreLife } from './life/engine.ts';
import type { EndingId as LifeEnding, GameState as LifeState, TrackId } from './life/types.ts';
import { PLATFORM, pushProgress, submitRun } from './platform.ts';

// On the platform build every key carries the account id, so two accounts on one browser never share a run or
// a gallery, and nothing is read from the standalone keys. Until the login is known the scope is 'none'.
let scope = PLATFORM ? ':u:none' : '';
const key = (name: 'run' | 'meta' | 'synced' | 'migrated', version = 1) => `pilot-growup:${name}:v${version}${scope}`;
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
    return true;
  } catch { return false; /* blocked storage must not prevent playing */ }
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

export const loadMeta = (): Meta => cleanMeta(read(key('meta')));

/** The unfinished run to continue, or null. */
export function loadRun(): GameState | null {
  const run = restore(read(key('run')));
  return run && run.phase !== 'ended' ? run : null;
}

/** Call after every choice. A finished run is not kept (use `recordEnding` for that). */
export function saveRun(state: GameState) {
  const run = state.phase === 'ended' ? null : state;
  write(key('run'), run);
  if (PLATFORM) pushProgress({ run, meta: loadMeta() });
}

export function clearRun() {
  write(key('run'), null);
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
  write(key('meta'), meta);
  write(key('run'), null);
  if (PLATFORM) {
    pushProgress({ run: null, meta });
    submitRun(state, durationSec);
  }
  return { meta, firstTime, newBest };
}

/** The server's `progressAt` this browser last read or wrote for this account; 0 when it never synced. */
export const markSynced = (progressAt: number, version = 1) => write(key('synced', version), int(progressAt, Number.MAX_SAFE_INTEGER));
export const syncedAt = (version = 1) => int(read(key('synced', version)), Number.MAX_SAFE_INTEGER);

/** The local record as it would be uploaded. */
export const localProgress = (): Progress => ({ run: loadRun(), meta: loadMeta() });

/**
 * Platform boot hands over the server copy for the logged-in account. The gallery and best score are merged.
 * The run follows the newer side: if the server record changed since this browser last synced (another device
 * played on, or finished the run), the server's run replaces the local one, also when it is null. Otherwise
 * the local run stays, because it is the same or has choices that were not uploaded yet.
 */
export function adoptServerProgress(server: Progress, userId: string, progressAt: number) {
  scope = `:u:${encodeURIComponent(userId)}`;
  write(key('meta'), mergeMeta(loadMeta(), server.meta));
  if (progressAt > syncedAt()) {
    write(key('run'), server.run);
    markSynced(progressAt);
  }
}

export type LifeMeta = { gallery: LifeEnding[]; best: number; runs: number; feats: string[];
  jobs: TrackId[]; bestByEnding: Partial<Record<LifeEnding, number>> };
export type LifeProgress = { run: LifeState | null; meta: LifeMeta };
export const V1_NOTICE = '이전 버전의 판은 이어 할 수 없습니다';
const object = (raw: unknown): Record<string, unknown> => raw && typeof raw === 'object' && !Array.isArray(raw)
  ? raw as Record<string, unknown> : {};
const strings = (raw: unknown): string[] => Array.isArray(raw)
  ? [...new Set(raw.filter((id): id is string => typeof id === 'string' && /^[\w:-]{1,80}$/.test(id)))].slice(0, 200) : [];

export function cleanLifeMeta(raw: unknown): LifeMeta {
  const d = object(raw), bests = object(d.bestByEnding);
  return { gallery: LIFE_ENDINGS.filter(id => strings(d.gallery).includes(id)), best: int(d.best, Number.MAX_SAFE_INTEGER),
    runs: int(d.runs, 99_999), feats: strings(d.feats), jobs: TRACK_IDS.filter(id => strings(d.jobs).includes(id)),
    bestByEnding: Object.fromEntries(LIFE_ENDINGS.filter(id => Object.hasOwn(bests, id))
      .map(id => [id, int(bests[id], Number.MAX_SAFE_INTEGER)])) };
}
export function mergeLifeMeta(left: unknown, right: unknown): LifeMeta {
  const a = cleanLifeMeta(left), b = cleanLifeMeta(right);
  return cleanLifeMeta({ gallery: [...a.gallery, ...b.gallery], best: Math.max(a.best, b.best), runs: Math.max(a.runs, b.runs),
    feats: [...a.feats, ...b.feats], jobs: [...a.jobs, ...b.jobs],
    bestByEnding: Object.fromEntries([...new Set([...Object.keys(a.bestByEnding), ...Object.keys(b.bestByEnding)])]
      .map(id => [id, Math.max(a.bestByEnding[id as LifeEnding] ?? 0, b.bestByEnding[id as LifeEnding] ?? 0)])) });
}
export function cleanLifeProgress(raw: unknown): LifeProgress {
  const d = object(raw), run = restoreLife(d.run);
  return { run: run?.phase !== 'ended' ? run : null, meta: cleanLifeMeta(d.meta) };
}
export const loadLifeMeta = () => cleanLifeMeta(read(key('meta', 2)));
export const loadLifeRun = () => cleanLifeProgress({ run: read(key('run', 2)) }).run;
export const localLifeProgress = (): LifeProgress => ({ run: loadLifeRun(), meta: loadLifeMeta() });

/** Called at the v2 entry screen, after account selection. Retain v1 meta for the classic client. */
export function migrateLifeSave(): boolean {
  const legacy = read(key('meta'));
  let changed = false;
  if (legacy !== null && !read(key('migrated', 2))) {
    const { gallery, runs } = cleanMeta(legacy);
    changed = write(key('meta', 2), mergeLifeMeta(loadLifeMeta(), { gallery, runs }));
    if (changed) write(key('migrated', 2), true);
  }
  const notice = read(key('run')) !== null;
  if (notice) write(key('run'), null);
  if (PLATFORM) { if (changed || notice) pushProgress(localLifeProgress()); }
  return notice;
}
export function saveLifeRun(state: LifeState) {
  const run = state.phase === 'ended' ? null : state;
  write(key('run', 2), run);
  if (PLATFORM) pushProgress({ run, meta: loadLifeMeta() });
}
export function recordLifeEnding(state: LifeState, durationSec: number) {
  const before = loadLifeMeta(), ending = state.ending;
  if (state.phase !== 'ended' || !ending) return before;
  const meta = mergeLifeMeta(before, { gallery: [ending], best: state.score, runs: before.runs + 1,
    feats: state.feats, jobs: state.job.tracks, bestByEnding: { [ending]: state.score } });
  write(key('meta', 2), meta); write(key('run', 2), null);
  if (PLATFORM) { pushProgress({ run: null, meta }); submitRun(state, durationSec); }
  return meta;
}
export function adoptLifeServerProgress(server: LifeProgress, userId: string, progressAt: number) {
  scope = `:u:${encodeURIComponent(userId)}`;
  write(key('meta', 2), mergeLifeMeta(loadLifeMeta(), server.meta));
  if (progressAt > syncedAt(2)) { write(key('run', 2), server.run); markSynced(progressAt, 2); }
}
