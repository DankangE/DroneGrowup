// Automated playtest: builds the game, serves it with Vite preview in-process and plays whole runs in Chrome
// through the real UI (clicks on the buttons a player taps), at a 390 px phone viewport.
//
// A bot policy from src/game/bots.ts decides each choice from the state the page reports; the same choice is
// applied to the engine here in Node, and after every click the page's state must equal the engine's. So the
// test fails if the UI shows, hides or resolves anything differently from the rules.
//
// Fails on: a console error or page error, a request to another origin, horizontal scroll at 390 px, a
// choice button smaller than a fingertip, fewer than three different endings, a save that does not survive
// a reload. Screenshots go to docs/screenshots/playtest/ (not committed; the committed before / after sets come
// from scripts/layout-check.mjs).
//
//   npm run playtest
//   CHROME_PATH=/path/to/chrome npm run playtest
//   HEADED=1 npm run playtest
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build, preview } from 'vite';
import { chromium } from 'playwright-core';
import { POLICIES, botRandom, pick } from '../src/game/bots.ts';
import { choose, options } from '../src/game/engine.ts';
import { revealOption } from './ui-driver.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const shots = join(root, 'docs/screenshots/playtest');
mkdirSync(shots, { recursive: true });

// policy, seed: chosen so the four runs end in four different careers (checked below, not assumed).
const RUNS = [['pilot', 3], ['employee', 5], ['gambler', 2], ['instructor', 7]];
const MIN_ENDINGS = 3;
const PHONE = { width: 390, height: 844 };
const MIN_TAP = 44;

const configFile = join(root, 'vite.config.ts');
await build({ root, configFile, logLevel: 'warn' });
const server = await preview({ root, configFile, preview: { port: 5299, strictPort: false } });
const base = server.resolvedUrls.local[0];
const browser = await chromium.launch({
  headless: process.env.HEADED !== '1',
  executablePath: process.env.CHROME_PATH,
  channel: process.env.CHROME_PATH ? undefined : 'chrome',
});

const errors = [];
async function openPage(viewport, reducedMotion) {
  const context = await browser.newContext({ viewport, reducedMotion, deviceScaleFactor: 2, hasTouch: viewport.width < 600, locale: 'ko-KR' });
  const page = await context.newPage();
  page.on('pageerror', (e) => errors.push(`pageerror: ${e}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console.error: ${m.text()}`); });
  page.on('request', (r) => { if (!r.url().startsWith(base) && !r.url().startsWith('data:')) errors.push(`outside request: ${r.url()}`); });
  return page;
}

const shot = async (page, name) => {
  const file = join(shots, `${name}.png`);
  await page.screenshot({ path: file });
  console.log('  screenshot', file);
};
const screen = (page) => page.evaluate(() => document.querySelector('[data-screen]')?.getAttribute('data-screen'));
const phase = (page) => page.evaluate(() => document.querySelector('[data-screen]')?.getAttribute('data-phase'));
const pageState = (page) => page.evaluate(() => window.__game.state());

async function noSideScroll(page, where) {
  const { scroll, inner } = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, inner: window.innerWidth }));
  assert.ok(scroll <= inner, `${where}: page is ${scroll}px wide in a ${inner}px viewport (horizontal scroll)`);
}

/** Every visible choice button is at least a fingertip tall and inside the viewport's width. */
async function tappable(page, where) {
  const bad = await page.evaluate((min) => [...document.querySelectorAll('[data-option], [data-pick]')]
    .map((b) => ({ id: b.getAttribute('data-option') ?? b.getAttribute('data-pick'), r: b.getBoundingClientRect() }))
    .filter(({ r }) => r.width > 0 && (r.height < min || r.left < 0 || r.right > window.innerWidth + 0.5))
    .map(({ id, r }) => `${id} ${Math.round(r.width)}x${Math.round(r.height)} at x=${Math.round(r.left)}`), MIN_TAP);
  assert.deepEqual(bad, [], `${where}: choice buttons too small or off-screen`);
}

/** Taps the button of one option the way a player reaches it (tabs, pages, bottom navigation). */
async function tapOption(page, option) {
  const target = await revealOption(page, option);
  assert.equal(await target.isDisabled(), false, `${option.id} is enabled in the engine but disabled in the UI`);
  await target.click();
}

/** Plays one whole run through the UI with a bot policy. Returns the ending id. */
async function playRun(page, policy, seed, { shotsAt = {}, reloadAt = -1 } = {}) {
  await page.goto(`${base}?debug=1&seed=${seed}`);
  await page.evaluate(() => { localStorage.removeItem('pilot-growup:run:v1'); });
  await page.reload();
  await page.locator('[data-action="new"]').click();
  await page.waitForFunction(() => document.querySelector('[data-screen="play"]'));
  let state = await pageState(page);
  assert.equal(state.seed, seed, 'the ?seed= parameter starts that run');
  const rand = botRandom(seed);
  let clicks = 0;
  let reloaded = false;
  while (state.phase !== 'ended') {
    assert.ok(clicks++ < 20000, 'run did not end');
    const shown = await page.evaluate(() => window.__game.options().map((o) => `${o.id}:${o.enabled}`));
    assert.deepEqual(shown, options(state).map((o) => `${o.id}:${o.enabled}`), 'the page offers what the engine offers');
    if (state.turn === reloadAt && !reloaded && state.phase === 'action' && state.s.acts > 0) {
      // Leave mid-season and come back: the title offers 이어하기 and the run continues from the same state.
      reloaded = true;
      await page.reload();
      await page.locator('[data-action="continue-run"]').click();
      await page.waitForFunction(() => document.querySelector('[data-screen="play"]'));
      assert.deepEqual(await pageState(page), state, 'the saved run continues exactly where it stopped');
    }
    const id = pick(POLICIES[policy], state, rand);
    const option = options(state).find((o) => o.id === id);
    const next = choose(state, id);
    if (state.phase === 'action') assert.equal(await page.locator('[data-acts]').getAttribute('data-acts'), String(state.s.acts));
    for (const [name, at] of Object.entries(shotsAt)) {
      if (at === 'event' ? state.phase === 'event' : at === 'roll' ? !!option.roll && option.kind === 'job' : state.turn === at && state.phase === 'action') {
        if (at === 0) await shot(page, `${name}-map`);
        await noSideScroll(page, name);
        await tappable(page, name);
        await shot(page, name);
        if (at === 'roll') {
          await tapOption(page, option);
          await page.locator('[data-action="continue"]').waitFor({ state: 'visible', timeout: 8000 });
          await page.waitForTimeout(2200); // let the luck roll land before the picture
          await noSideScroll(page, `${name}-result`);
          await shot(page, `${name}-result`);
          delete shotsAt[name];
          await page.locator('[data-action="continue"]').click();
          state = next.state;
        }
        delete shotsAt[name];
      }
    }
    if (state !== next.state) {
      await tapOption(page, option);
      const go = page.locator('[data-action="continue"]');
      await go.waitFor({ state: 'visible', timeout: 8000 });
      assert.equal(await phase(page), 'result');
      await page.waitForFunction(() => document.querySelector('[data-action="continue"]:enabled'));
      assert.equal(await page.locator('[data-season-change]').count(), Number(!!next.result.season));
      assert.equal(await page.getByText('계절 결산', { exact: true }).count(), Number(!!next.result.upkeep));
      await go.click();
      state = next.state;
    }
    assert.deepEqual(await pageState(page), state, `after ${id} on turn ${state.turn} the page state equals the engine state`);
  }
  await page.waitForFunction(() => document.querySelector('[data-screen="ending"]'));
  assert.equal(reloadAt < 0 || reloaded, true, 'the reload check ran');
  return state;
}

try {
  // ---- phone: title, a run with the animation on, screenshots of every screen
  const phone = await openPage(PHONE, 'no-preference');
  await phone.goto(`${base}?debug=1`);
  await phone.evaluate(() => localStorage.clear());
  await phone.reload();
  assert.equal(await screen(phone), 'title');
  assert.equal(await phone.locator('[data-action="continue-run"]').count(), 0, 'no 이어하기 without a saved run');
  await noSideScroll(phone, 'title');
  await shot(phone, '390-title');

  const endings = [];
  const first = await playRun(phone, ...RUNS[0], { shotsAt: { '390-play-student': 0, '390-play-event': 'event', '390-play-jobs': 'roll' }, reloadAt: 9 });
  endings.push(first.ending);
  await noSideScroll(phone, 'ending');
  await shot(phone, '390-ending');
  await phone.waitForFunction(score => document.querySelector('.score b')?.textContent?.replaceAll(',', '') === String(score), first.score);
  const text = await phone.locator('[data-screen="ending"]').innerText();
  assert.ok(text.includes(String(first.score).replace(/\B(?=(\d{3})+(?!\d))/g, ',')) || text.includes(String(first.score)), 'the ending screen shows the score');
  await phone.locator('[data-action="gallery"]').first().click();
  assert.equal(await screen(phone), 'gallery');
  await noSideScroll(phone, 'gallery');
  await shot(phone, '390-gallery');
  await phone.reload();
  assert.equal(await screen(phone), 'title');
  assert.equal(await phone.locator('[data-action="continue-run"]').count(), 0, 'a finished run is not offered again');
  const meta = await phone.evaluate(() => JSON.parse(localStorage.getItem('pilot-growup:meta:v1')));
  assert.deepEqual(meta, { gallery: [first.ending], best: first.score, runs: 1 });
  await phone.context().close();

  // ---- phone, reduced motion: more runs to different endings
  const quick = await openPage(PHONE, 'reduce');
  for (const [policy, seed] of RUNS.slice(1)) {
    const end = await playRun(quick, policy, seed);
    endings.push(end.ending);
    console.log(`  ${policy} seed ${seed}: ${end.ending}, score ${end.score}, turn ${end.turn}`);
  }
  await noSideScroll(quick, 'ending');
  await quick.locator('[data-action="retry"]').first().click();
  await quick.waitForFunction(() => document.querySelector('[data-screen="play"]'));
  await quick.context().close();
  const distinct = new Set(endings);
  console.log(`  endings reached through the UI: ${[...distinct].join(', ')}`);
  assert.ok(distinct.size >= MIN_ENDINGS, `only ${distinct.size} different endings: ${endings.join(', ')}`);

  // ---- desktop layout
  const desk = await openPage({ width: 1280, height: 800 }, 'reduce');
  await desk.goto(`${base}?debug=1&seed=11`);
  await desk.locator('[data-action="new"]').click();
  await desk.waitForFunction(() => document.querySelector('[data-screen="play"]'));
  await noSideScroll(desk, 'desktop play');
  await shot(desk, '1280-play');
  await desk.context().close();

  assert.deepEqual(errors, [], 'console errors, page errors or outside requests');
  console.log(`playtest OK: ${RUNS.length} runs through the UI, ${distinct.size} different endings, no console errors`);
} finally {
  await browser.close();
  await new Promise((done) => server.httpServer.close(done));
}
