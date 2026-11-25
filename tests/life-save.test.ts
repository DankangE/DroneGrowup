import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, test } from 'node:test';
import { ENDING_IDS as V1_ENDINGS } from '../src/life/data.ts';
import { choose, newGame, options } from '../src/life/engine.ts';
import { finish, finalNetWorth, retireEarly } from '../src/life/ending.ts';
import { ENDING_IDS, TRACK_IDS } from '../src/life/life-data.ts';
import { adoptLifeServerProgress, cleanLifeMeta, cleanLifeProgress, loadLifeMeta, loadLifeRun,
  localLifeProgress, markSynced, mergeLifeMeta, migrateLifeSave, recordLifeEnding, saveLifeRun,
  syncedAt, V1_NOTICE } from '../src/save.ts';
import { PLATFORM, playOf } from '../src/platform.ts';
import { mountLife } from '../src/ui2/app.ts';
import { action, TestNode, textOf, withDOM } from './life-popup2-dom-helper.ts';

// Snapshot produced by the removed client's newGame(1), kept only to test save migration.
const legacyRun = JSON.parse(readFileSync(new URL('./fixtures/legacy-run.json', import.meta.url), 'utf8'));
const classicGame = (seed: number) => ({ ...structuredClone(legacyRun), seed, rng: seed });
const RUN = 'pilot-growup:run:v2', META = 'pilot-growup:meta:v2';
const OLD_RUN = 'pilot-growup:run:v1', OLD_META = 'pilot-growup:meta:v1';
const storage = new Map<string, string>();
const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
const put = (key: string, value: unknown) => storage.set(key, JSON.stringify(value));
const get = (key: string) => JSON.parse(storage.get(key) ?? 'null');
beforeEach(() => {
  storage.clear();
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => { storage.set(key, value); },
    removeItem: (key: string) => { storage.delete(key); },
  } });
});
afterEach(() => {
  if (original) Object.defineProperty(globalThis, 'localStorage', original);
  else Reflect.deleteProperty(globalThis, 'localStorage');
});

test('§12.2 discards v1 run with one notice, carries all 11 endings and run count, resets scores', () => {
  const old = { gallery: V1_ENDINGS, best: 999999, runs: 42 };
  put(OLD_META, old); put(OLD_RUN, classicGame(7));
  assert.equal(migrateLifeSave(), true);
  assert.equal(V1_NOTICE, '이전 버전의 판은 이어 할 수 없습니다');
  assert.equal(get(OLD_RUN), null); assert.equal(loadLifeRun(), null);
  assert.deepEqual(loadLifeMeta(), cleanLifeMeta({ gallery: V1_ENDINGS, runs: 42 }));
  assert.deepEqual(get(OLD_META), old, 'legacy meta remains intact');
  assert.equal(migrateLifeSave(), false);
  assert.equal(loadLifeMeta().runs, 42, 'migration is idempotent');
});

test('migration without a v1 run is silent and does not import the v1 best score', () => {
  put(OLD_META, { gallery: ['pilot', 'pilot', 'unknown'], best: 1000000, runs: 3 });
  assert.equal(migrateLifeSave(), false);
  assert.deepEqual(loadLifeMeta(), cleanLifeMeta({ gallery: ['pilot'], runs: 3 }));
});

test('existing v2 progress survives migration; collections union and counters use the larger value once', () => {
  const run = newGame(22); put(RUN, run);
  put(META, { gallery: ['family'], best: 200, runs: 9, bestByEnding: { family: 200 }, feats: ['home'], jobs: ['clerk'] });
  put(OLD_META, { gallery: ['pilot'], best: 900000, runs: 12 }); put(OLD_RUN, classicGame(1));
  assert.equal(migrateLifeSave(), true); assert.deepEqual(loadLifeRun(), run);
  assert.deepEqual(loadLifeMeta(), cleanLifeMeta({ gallery: ['family', 'pilot'], best: 200, runs: 12,
    bestByEnding: { family: 200 }, feats: ['home'], jobs: ['clerk'] }));
  put(OLD_META, { gallery: ['ceo'], best: 999999, runs: 99 }); migrateLifeSave();
  assert.equal(loadLifeMeta().runs, 12, 'the same legacy store is not imported again');
});

test('v2 rejects legacy saves and replay preserves RNG and every structured field', () => {
  const classic = classicGame(8); put(OLD_RUN, classic);
  let state = newGame(9);
  for (const id of ['start:school', 'spin']) {
    state = choose(state, id).state; saveLifeRun(state);
    assert.deepEqual(get(RUN), state); assert.deepEqual(loadLifeRun(), state);
  }
  assert.deepEqual(get(OLD_RUN), classic);
  const next = options(state).find(option => option.enabled)!.id;
  assert.deepEqual(choose(loadLifeRun()!, next), choose(state, next));
  assert.equal(cleanLifeProgress({ run: classic }).run, null);
  put(RUN, classic); assert.equal(loadLifeRun(), null);
});

test('all 21 endings, job history, feats and per-ending best scores persist across finished runs', () => {
  const state = newGame(4); state.turn = 204;
  state.job.tracks = [...TRACK_IDS]; state.feats = ['home', 'visit:A', 'top:clerk', 'kid_0'];
  const ended = finish(state);
  for (const ending of ENDING_IDS) recordLifeEnding({ ...ended, ending }, 5);
  const meta = loadLifeMeta();
  assert.deepEqual(meta.gallery, ENDING_IDS); assert.equal(meta.runs, 21);
  assert.deepEqual(meta.jobs, TRACK_IDS); assert.deepEqual(meta.feats, ended.feats);
  assert.equal(meta.best, ended.score); assert.equal(Object.keys(meta.bestByEnding).length, 21);
  recordLifeEnding({ ...ended, score: ended.score + 100 }, 5);
  recordLifeEnding({ ...ended, score: 0 }, 5);
  assert.equal(loadLifeMeta().bestByEnding[ended.ending!], ended.score + 100);
  assert.equal(loadLifeMeta().runs, 23); assert.equal(get(RUN), null);
  assert.equal(cleanLifeProgress({ run: ended }).run, null);
});

test('recording an unfinished run is harmless; saving an ended run clears only v2 run', () => {
  put(OLD_RUN, classicGame(1)); saveLifeRun(newGame(2));
  assert.deepEqual(recordLifeEnding(newGame(2), 0), cleanLifeMeta(null));
  assert.equal(loadLifeRun()!.seed, 2);
  const state = newGame(2); state.turn = 204; saveLifeRun(finish(state));
  assert.equal(loadLifeRun(), null); assert.equal(get(OLD_RUN)!.seed, 1);
});

test('untrusted meta is bounded, deduplicated and copied; v2 scores have no v1 cap', () => {
  const meta = cleanLifeMeta({ gallery: ['family', 'family', '<img>', 'future'], best: 12000000, runs: Infinity,
    jobs: ['clerk', 'clerk', 'future'], feats: ['visit:A', 'visit:A', '<img>'],
    bestByEnding: { family: 12000000, worker: -3.5, future: 90 } });
  assert.deepEqual(meta, { gallery: ['family'], best: 12000000, runs: 0, jobs: ['clerk'], feats: ['visit:A'],
    bestByEnding: { family: 12000000, worker: 0 } });
  const merged = mergeLifeMeta(meta, { best: 100, runs: 5, gallery: ['worker'], bestByEnding: { family: 3, worker: 100 } });
  assert.equal(merged.best, 12000000); assert.equal(merged.bestByEnding.family, 12000000);
  assert.equal(merged.bestByEnding.worker, 100); merged.feats.push('home'); assert.equal(meta.feats.length, 1);
});

test('corrupt or blocked storage cannot interrupt play or erase legacy meta before a successful migration', () => {
  storage.set(RUN, '{'); storage.set(META, '{');
  assert.equal(loadLifeRun(), null); assert.deepEqual(loadLifeMeta(), cleanLifeMeta(null));
  put(OLD_META, { gallery: ['pilot'], runs: 3, best: 500 });
  const set = localStorage.setItem;
  localStorage.setItem = () => { throw new Error('quota'); };
  assert.doesNotThrow(() => { migrateLifeSave(); saveLifeRun(newGame(1)); });
  localStorage.setItem = set; migrateLifeSave(); assert.equal(loadLifeMeta().runs, 3);
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, get() { throw new Error('blocked'); } });
  assert.doesNotThrow(() => { migrateLifeSave(); saveLifeRun(newGame(1)); loadLifeRun(); loadLifeMeta(); });
});

test('platform play payload uses v2 ages, score and final assets', () => {
  assert.equal(PLATFORM, false);
  const state = newGame(1); state.turn = 204; state.s.money = 9000000;
  state.home = { map: 'E', tier: 6, deposit: 60000 }; state.fund = { kind: 1, amount: 9000000 };
  const ended = finish(state), play = playOf(ended, 8.7);
  assert.equal(play.detail.turns, 204); assert.equal(play.detail.age, 70);
  assert.equal(play.detail.netWorth, finalNetWorth(ended)); assert.equal(play.score, ended.score);
  assert.ok(play.score > 9999999); assert.equal(play.durationSec, 8);
  const early = choose(newGame(2), 'start:school').state; early.turn = 144;
  assert.equal(playOf(retireEarly(early), 10).detail.turns, 204, 'engine settles early retirement at age 70');
  const debtor = newGame(3); debtor.turn = 204; debtor.s.debt = 4000;
  const debtPlay = playOf(finish(debtor), 2); assert.equal(debtPlay.cleared, false); assert.ok(debtPlay.score > 0);
});

test('v2 UI autosaves a choice, restores it on remount, and shows the v1 notice only on its title', () => withDOM(() => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const browser = { matchMedia: () => ({ matches: true, addEventListener() {} }) } as unknown as Window;
  Object.defineProperty(globalThis, 'window', { configurable: true, value: browser });
  try {
    put(OLD_RUN, classicGame(1)); put(OLD_META, { gallery: ['pilot'], runs: 2, best: 500 });
    let root = new TestNode('main'); mountLife(root.element(), 7, true);
    assert.equal(root.dataset.screen, 'title'); assert.ok(textOf(root).includes(V1_NOTICE));
    action(root, 'new').fire('click'); root.querySelector('[data-option="start:school"]')!.fire('click');
    const saved = choose(newGame(7), 'start:school').state;
    assert.deepEqual(loadLifeRun(), saved);
    root = new TestNode('main'); mountLife(root.element(), 999, true);
    assert.equal(root.dataset.screen, 'play'); assert.ok(!textOf(root).includes(V1_NOTICE));
    assert.deepEqual(browser.__life!.state(), saved);
    const last = structuredClone(saved); last.turn = 203; last.board.step = 'bonus'; last.board.dice = [1, 1];
    last.s.capStamina = last.s.stamina = 80;
    browser.__life!.load(last); root.querySelector('[data-option="end"]')!.fire('click');
    assert.equal(root.dataset.screen, 'ending'); assert.equal(loadLifeMeta().runs, 3);
    action(root, 'gallery').fire('click'); action(root, 'gallery-close').fire('click');
    assert.equal(loadLifeMeta().runs, 3, 'rerendering an ending does not count or submit it twice');
    action(root, 'title').fire('click'); action(root, 'gallery').fire('click');
    assert.equal(root.dataset.screen, 'gallery'); assert.equal(loadLifeRun(), null);
  } finally {
    if (previous) Object.defineProperty(globalThis, 'window', previous); else Reflect.deleteProperty(globalThis, 'window');
  }
}));

test('account scopes isolate migration, metadata and sync stamps; newer server null retires an old local run', () => {
  put(OLD_RUN, classicGame(1)); put(OLD_META, { gallery: ['ceo'], runs: 90 });
  put(`${OLD_META}:u:a`, { gallery: ['pilot'], runs: 4, best: 800 }); put(`${OLD_RUN}:u:a`, classicGame(2));
  const server = { run: newGame(10), meta: cleanLifeMeta({ gallery: ['family'], best: 300 }) };
  adoptLifeServerProgress(server, 'a', 10); assert.equal(migrateLifeSave(), true);
  assert.equal(loadLifeRun()!.seed, 10); assert.equal(loadLifeMeta().runs, 4);
  assert.ok(!loadLifeMeta().gallery.includes('ceo')); assert.ok(storage.has(OLD_RUN));
  saveLifeRun(newGame(11)); adoptLifeServerProgress(server, 'a', 10);
  assert.equal(loadLifeRun()!.seed, 11, 'unsent local choice survives an unchanged server');
  adoptLifeServerProgress({ ...server, run: null }, 'a', 11); assert.equal(loadLifeRun(), null);
  markSynced(99, 1); assert.equal(syncedAt(1), 99); assert.equal(syncedAt(2), 11);
  assert.equal(syncedAt(), 11, 'the default sync marker now belongs to v2');
  markSynced(12); assert.equal(syncedAt(2), 12); assert.equal(syncedAt(1), 99);
  adoptLifeServerProgress(cleanLifeProgress(null), 'b', 0); migrateLifeSave();
  assert.deepEqual(localLifeProgress(), cleanLifeProgress(null));
  assert.equal(syncedAt(2), 0); assert.equal(syncedAt(1), 0); assert.equal(syncedAt(), 0);
});
