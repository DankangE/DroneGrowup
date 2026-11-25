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
import { finishChoice, revealOption } from './ui-driver.mjs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build, preview } from 'vite';
import { chromium } from 'playwright-core';
import { choose, options, restore } from '../src/game/engine.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'node_modules/.cache/dist-platform');
const configFile = join(root, 'vite.config.ts');
process.env.VITE_NG_PLATFORM = '1';
process.env.VITE_NG_API = 'http://sdk.invalid';
process.env.VITE_NG_PORTAL = 'http://portal.invalid';
await build({ root, configFile, logLevel: 'warn', build: { outDir, emptyOutDir: true } });
const server = await preview({ root, configFile, build: { outDir }, preview: { port: 5399, strictPort: false } });
const base = server.resolvedUrls.local[0];

// The stand-in server: one progress record per account.
const records = {}; // userId -> { data, progressAt }
let current = 'user-a';
const api = {
  me: () => ({ id: current, loginId: current, nickname: `닉 ${current}` }),
  get: () => records[current] ?? { data: null, progressAt: 0 },
  put: ({ data, progressAt }) => {
    if (progressAt <= (records[current]?.progressAt ?? 0)) return { conflict: true };
    // Like the platform cleaner, keep known run fields and the packed board in seen.
    if (data.run) delete data.run.board;
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
    const srv = (op, arg) => window.__srv(op, arg);
    window.NalidaGame = {
      init: () => ({
        me: () => srv('me'),
        redirectToLogin() {},
        redirectToNickname() {},
        progress: { get: () => srv('get'), put: (data, progressAt) => srv('put', { data, progressAt }) },
        plays: { submit: async () => ({}) },
        leaderboard: async () => ({ entries: [], me: null }),
        onChange() {},
      }),
    };
  });
  const page = await context.newPage();
  page.on('pageerror', (e) => errors.push(`pageerror: ${e}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console.error: ${m.text()}`); });
  page.on('request', (r) => { if (!r.url().startsWith(base) && !r.url().startsWith('data:')) errors.push(`outside request: ${r.url()}`); });

  const open = async () => {
    await page.goto(`${base}?debug=1&seed=21`);
    await page.waitForFunction(() => document.querySelector('[data-screen="title"]'));
  };
  const hasContinue = async () => (await page.locator('[data-action="continue-run"]').count()) > 0;
  const pageState = () => page.evaluate(() => window.__game.state());
  const nextOption = state => options(state).find(o => !o.free && o.enabled);
  const step = async () => {
    const before = await pageState();
    const option = nextOption(before);
    await (await revealOption(page, option)).click();
    await finishChoice(page);
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
  assert.equal(await hasContinue(), false);
  await page.locator('[data-action="new"]').click();
  await page.waitForFunction(() => document.querySelector('[data-screen="play"]'));
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
  records['user-a'].data.meta = { gallery: ['pilot'], best: 1234, runs: 1 };
  current = 'user-b';
  await open();
  assert.equal(await hasContinue(), false, "account B is not offered account A's run");
  await page.locator('[data-action="new"]').click();
  await page.waitForFunction(() => document.querySelector('[data-screen="play"]'));
  await step();
  await uploaded(await pageState());
  assert.deepEqual(records['user-b'].data.meta, { gallery: [], best: 0, runs: 0 }, "account B's record has none of A's gallery");
  assert.notDeepEqual(records['user-b'].data.run, records['user-a'].data.run);

  // ---- account A again, after another device played one more choice
  current = 'user-a';
  let ahead = restore(records['user-a'].data.run);
  ahead = choose(ahead, nextOption(ahead).id).state;
  assert.notDeepEqual(ahead, local, 'another device advanced the board');
  records['user-a'] = { data: { run: ahead, meta: records['user-a'].data.meta }, progressAt: records['user-a'].progressAt + 60_000 };
  await open();
  assert.equal(await hasContinue(), true);
  await page.locator('[data-action="continue-run"]').click();
  await page.waitForFunction(() => document.querySelector('[data-screen="play"]'));
  assert.deepEqual(await pageState(), ahead, 'the newer run from the server replaces the older local one');
  assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('pilot-growup:meta:v1:u:user-a'))), { gallery: ['pilot'], best: 1234, runs: 1 });

  // ---- another device finished the run: it is not offered again here
  records['user-a'] = { data: { run: null, meta: records['user-a'].data.meta }, progressAt: records['user-a'].progressAt + 60_000 };
  await open();
  assert.equal(await hasContinue(), false, 'a run finished elsewhere is not resurrected');

  // ---- a local run that is not older than the server copy survives a reload
  await page.locator('[data-action="new"]').click();
  await page.waitForFunction(() => document.querySelector('[data-screen="play"]'));
  await step();
  const mine = await pageState();
  await uploaded(mine);
  await open();
  await page.locator('[data-action="continue-run"]').click();
  await page.waitForFunction(() => document.querySelector('[data-screen="play"]'));
  assert.deepEqual(await pageState(), mine);

  // ---- a page left open while another device finishes the run: its next choice does not overwrite the server
  const theirs = { data: { run: null, meta: { gallery: ['pilot', 'solo'], best: 5000, runs: 2 } }, progressAt: records['user-a'].progressAt + 60_000 };
  records['user-a'] = theirs;
  await step();
  await page.waitForTimeout(3000);
  assert.deepEqual(records['user-a'], theirs, 'a stale page does not overwrite a newer server record');
  await open();
  assert.equal(await hasContinue(), false);

  // ---- a choice whose upload never left (tab closed inside the debounce) is uploaded at the next boot
  await page.locator('[data-action="new"]').click();
  await page.waitForFunction(() => document.querySelector('[data-screen="play"]'));
  await step();
  await uploaded(await pageState());
  await step();
  const unsent = await pageState();
  await open(); // immediately: the 1.5 s debounce has not fired
  await uploaded(unsent);
  assert.deepEqual(restore(records['user-a'].data.run), unsent, 'the unsent choice is uploaded after the reload');

  assert.deepEqual(errors, [], 'console errors, page errors or outside requests');
  console.log('platform playtest OK: account scoping, newer server run adopted, finished run not resurrected, stale page does not overwrite, unsent choice re-uploaded');
} finally {
  await browser.close();
  await new Promise((done) => server.httpServer.close(done));
}
