// Playtest of the nalidagame.online build (VITE_NG_PLATFORM=1) against a stand-in SDK, in headless Chrome.
// The real SDK is replaced by a stub whose "server" lives in this Node process, so no request leaves the machine.
//
// Checks the save rules that only exist on the platform build:
//   - choices are uploaded to the logged-in account;
//   - a second account on the same browser sees neither the first account's run nor its gallery;
//   - when another device moved the account's run forward, this browser continues from the server's run;
//   - when another device finished the run, this browser does not offer it again;
//   - a page left open does not overwrite a record another device saved after it;
//   - a choice whose upload never left is uploaded at the next boot.
//
//   npm run playtest:platform
import assert from 'node:assert/strict';
import { isDeepStrictEqual } from 'node:util';
import { pagingChecks } from './layout-check-life.mjs';
import { pickLifeOption } from './life-ui-driver.mjs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build, preview } from 'vite';
import { chromium } from 'playwright-core';
import { choose, newGame, restore } from '../src/life/flow.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
// node_modules may be shared with another worktree; build artifacts belong to this one.
const outDir = join(root, 'dist/platform');
const configFile = join(root, 'vite.config.ts');
process.env.VITE_NG_PLATFORM = '1';
process.env.VITE_NG_API = 'http://sdk.invalid';
process.env.VITE_NG_PORTAL = 'http://portal.invalid';
await build({ root, configFile, logLevel: 'warn', build: { outDir, emptyOutDir: true } });
const server = await preview({ root, configFile, build: { outDir }, preview: { port: 5399, strictPort: false } });
const base = server.resolvedUrls.local[0];

// The stand-in server accepts only the separate life-board namespace.
const records = {}, plays = [], namespaces = [];
const meta = (extra = {}) => ({ gallery: [], best: 0, runs: 0, feats: [], jobs: [], bestByEnding: {}, ...extra });
const accountRecords = id => { assert.equal(id, 'pilotgrowup-v2'); return records; };
let current = 'user-a';
const api = {
  init: ({ gameId }) => { assert.equal(gameId, 'pilotgrowup-v2'); namespaces.push(gameId); },
  submit: ({ gameId, play }) => { plays.push({ gameId, play }); return {}; },
  me: () => ({ id: current, loginId: current, nickname: `닉 ${current}` }),
  get: ({ gameId }) => accountRecords(gameId)[current] ?? { data: null, progressAt: 0 },
  put: ({ gameId, data, progressAt }) => {
    const records = accountRecords(gameId);
    if (progressAt <= (records[current]?.progressAt ?? 0)) return { conflict: true };
    if (data.run) {
      assert.equal(data.run.v, 2);
      assert.deepEqual(restore(data.run), data.run, 'v2 structured state survives the contract');
      assert.ok(!Object.keys(data.run.seen).some(key => key.startsWith('_b.')), 'v2 never packs the board');
    }
    records[current] = { data, progressAt };
    return { data, progressAt };
  },
};

const browser = await chromium.launch({
  headless: process.env.HEADED !== '1',
  executablePath: process.env.CHROME_PATH,
  channel: process.env.CHROME_PATH ? undefined : 'chrome',
});
const errors = [];
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce', locale: 'ko-KR' });
  await context.exposeFunction('__srv', (op, arg) => api[op](arg));
  await context.addInitScript(() => {
    window.NalidaGame = {
      init: ({ gameId }) => {
        const srv = (op, arg = {}) => window.__srv(op, { ...arg, gameId });
        void srv('init');
        return {
          me: () => srv('me'), redirectToLogin() {}, redirectToNickname() {},
          progress: { get: () => srv('get'), put: (data, progressAt) => srv('put', { data, progressAt }) },
          plays: { submit: play => srv('submit', { play }) },
          leaderboard: async () => ({ entries: [], me: null }), onChange() {},
        };
      },
    };
  });
  const page = await context.newPage();
  page.on('pageerror', (e) => errors.push(`pageerror: ${e}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console.error: ${m.text()}`); });
  page.on('request', (r) => { if (!r.url().startsWith(base) && !r.url().startsWith('data:')) errors.push(`outside request: ${r.url()}`); });

  const open = async () => {
    await page.goto(`${base}?debug=1&seed=21`);
    await page.waitForFunction(() => window.__life && document.querySelector('[data-screen="play"]'));
  };
  const pageState = () => page.evaluate(() => window.__life.state());
  const nextOption = state => ({ id: pickLifeOption(state) });
  const controls = pagingChecks(page, async () => {});
  const step = async (id) => {
    const before = await pageState();
    const option = id ? { id } : nextOption(before);
    await controls.clickChoice(option.id);
    assert.deepEqual(await pageState(), choose(before, option.id).state, 'one click committed exactly one choice');
  };
  const uploaded = async expected => {
    for (let i = 0; i < 80; i++) {
      if (isDeepStrictEqual(restore(records[current]?.data?.run), expected)) return;
      await page.waitForTimeout(100);
    }
    assert.deepEqual(restore(records[current]?.data?.run), expected, 'the exact mid-season save reached the server');
  };

  // ---- account A plays three choices; they reach A's server record
  await open();
  assert.deepEqual(await pageState(), newGame(21));
  let expected = await pageState();
  for (let i = 0; i < 3; i++) {
    expected = choose(expected, nextOption(expected).id).state;
    await step();
  }
  const local = await pageState();
  assert.deepEqual(local, expected, 'three board decisions advanced the local run');
  await uploaded(local);
  assert.deepEqual(restore(records['user-a'].data.run), local, "the server holds account A's run");
  const keys = await page.evaluate(() => Object.keys(localStorage));
  assert.ok(keys.length > 0 && keys.every((k) => k.includes(':u:user-a')), `every key is scoped to the account: ${keys}`);

  // ---- account B on the same browser sees none of it
  records['user-a'].data.meta = meta({ gallery: ['pilot'], best: 1234, runs: 1 });
  current = 'user-b';
  await open();
  assert.deepEqual(await pageState(), newGame(21), "account B is not offered account A's run");
  await step();
  await uploaded(await pageState());
  assert.deepEqual(records['user-b'].data.meta, meta(), "account B's record has none of A's gallery");
  assert.notDeepEqual(records['user-b'].data.run, records['user-a'].data.run);

  // ---- account A again, after another device played one more choice
  current = 'user-a';
  let ahead = restore(records['user-a'].data.run);
  ahead = choose(ahead, nextOption(ahead).id).state;
  assert.notDeepEqual(ahead, local, 'another device advanced the board');
  records['user-a'] = { data: { run: ahead, meta: records['user-a'].data.meta }, progressAt: records['user-a'].progressAt + 60_000 };
  await open();
  assert.deepEqual(await pageState(), ahead, 'the newer run from the server replaces the older local one');
  assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('pilot-growup:meta:v2:u:user-a'))), meta({ gallery: ['pilot'], best: 1234, runs: 1 }));

  // ---- another device finished the run: it is not offered again here
  records['user-a'] = { data: { run: null, meta: records['user-a'].data.meta }, progressAt: records['user-a'].progressAt + 60_000 };
  await open();
  assert.deepEqual(await pageState(), newGame(21), 'a run finished elsewhere is not resurrected');

  // ---- a local run that is not older than the server copy survives a reload
  await step();
  const mine = await pageState();
  await uploaded(mine);
  await open();
  assert.deepEqual(await pageState(), mine);

  // ---- a page left open while another device finishes the run: its next choice does not overwrite the server
  const theirs = { data: { run: null, meta: meta({ gallery: ['pilot', 'solo'], best: 5000, runs: 2 }) }, progressAt: records['user-a'].progressAt + 60_000 };
  records['user-a'] = theirs;
  await step();
  await page.waitForTimeout(3000);
  assert.deepEqual(records['user-a'], theirs, 'a stale page does not overwrite a newer server record');
  await open();
  assert.deepEqual(await pageState(), newGame(21));

  // ---- a choice whose upload never left (tab closed inside the debounce) is uploaded at the next boot
  await step();
  await uploaded(await pageState());
  await step();
  const unsent = await pageState();
  await open(); // immediately: the 1.5 s debounce has not fired
  await uploaded(unsent);
  assert.deepEqual(restore(records['user-a'].data.run), unsent, 'the unsent choice is uploaded after the reload');

  // ---- ending writes the collection and posts exactly once, to the new leaderboard
  const last = choose(newGame(21), 'start:school').state;
  last.turn = 203; last.board.step = 'bonus'; last.board.dice = [1, 1];
  last.s.capStamina = last.s.stamina = 80;
  await page.evaluate(run => window.__life.load(run), last);
  await step('end');
  for (let i = 0; i < 80 && plays.length === 0; i++) await page.waitForTimeout(100);
  assert.equal(plays.length, 1); assert.equal(plays[0].gameId, 'pilotgrowup-v2');
  const ended = await pageState();
  assert.equal(plays[0].play.stage, ended.ending); assert.equal(plays[0].play.score, ended.score);
  assert.equal(plays[0].play.detail.turns, 204); assert.equal(plays[0].play.detail.age, 70);
  await page.locator('[data-action="gallery"]').click();
  await page.locator('[data-action="gallery-close"]').click();
  assert.equal(plays.length, 1);
  await uploaded(null);
  assert.ok(records[current].data.meta.gallery.includes(ended.ending));
  assert.equal(records[current].data.meta.bestByEnding[ended.ending], ended.score);
  assert.ok(namespaces.every(id => id === 'pilotgrowup-v2'));

  // ---- old opt-in links mount the same v2 client and namespace
  await page.goto(`${base}?life=1&debug=1&seed=21`);
  await page.locator('[data-screen="play"]').waitFor();
  assert.equal(namespaces.at(-1), 'pilotgrowup-v2');
  assert.equal(await page.locator('.life2').count(), 1);
  assert.equal(await page.evaluate(() => window.__life.state().v), 2);
  assert.ok(namespaces.every(id => id === 'pilotgrowup-v2'));
  assert.deepEqual(errors, [], 'console errors, page errors or outside requests');
  console.log('platform v2 playtest OK: native board, separate leaderboard, ending submitted once, legacy query compatibility, account scoping, newer server run adopted, finished run not resurrected, stale page does not overwrite, unsent choice re-uploaded');
} finally {
  await browser.close();
  await new Promise((done) => server.httpServer.close(done));
}
