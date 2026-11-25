// Board play (방식 C) check in installed Chrome, driven by the keyboard the way a player would.
//
//   node scripts/board-c-check.mjs shots   — board, fork, pay settlement, bonus step and ending at 390x844 and
//                                             1366x768 into docs/screenshots/board-c/
//   node scripts/board-c-check.mjs keys    — at 390x844, 360x740, 1280x800 and 1366x768: plays 8 seasons with
//                                             keys only (S/Space, 1-2, 1-9, E, Tab+Enter) and checks every
//                                             screen for page or inner scroll
//   node scripts/board-c-check.mjs timed   — one run of 16 seasons at 390x844 with animations on and a human
//                                             reading pause before every input; prints seconds per season
//
// A bot policy decides; the input is a key press wherever the UI offers one. Mouse fallbacks are counted.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build, preview } from 'vite';
import { chromium } from 'playwright-core';
import { POLICIES, botRandom, pick } from '../src/game/bots.ts';
import { choose, options } from '../src/game/engine.ts';
import { revealOption } from './ui-driver.mjs';

const mode = process.argv[2] ?? 'keys';
const root = fileURLToPath(new URL('../', import.meta.url));
const output = join(root, 'docs/screenshots/board-c');
// Pause before each input in the timed run (ms): reading the prompt, then pressing.
const THINK = { spin: 1200, fork: 2500, space: 4000, bonus: 3500, event: 6000, shop: 3000, result: 2200, pay: 2200, rank: 2500 };

await build({ root, logLevel: 'warn' });
const server = await preview({ root, preview: { host: '127.0.0.1', port: 0 } });
const base = server.resolvedUrls.local[0];
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH, channel: process.env.CHROME_PATH ? undefined : 'chrome' });
const notes = [];
const sleep = ms => new Promise(done => setTimeout(done, ms));
// Wall time per label in the timed run: think:<prompt> is the human pause, wait:<what> is the UI.
const spent = {};
async function track(label, work) {
  const at = Date.now();
  try { return await work; } finally { spent[label] = (spent[label] ?? 0) + Date.now() - at; }
}

async function open(width, height, motion) {
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1, locale: 'ko-KR', reducedMotion: motion });
  const page = await context.newPage();
  page.on('pageerror', e => notes.push(`pageerror ${width}x${height}: ${e}`));
  page.on('console', m => { if (m.type() === 'error') notes.push(`console.error ${width}x${height}: ${m.text()}`); });
  return page;
}

const readState = page => page.evaluate(() => window.__game.state());
const phase = page => page.evaluate(() => document.querySelector('[data-screen]')?.dataset.phase ?? document.querySelector('[data-screen]')?.dataset.screen);

/** Page scroll or any element whose content overflows a scroll container. */
const scrollProblems = page => page.evaluate(() => {
  const out = [];
  const doc = document.documentElement;
  if (doc.scrollHeight > innerHeight + 1 || doc.scrollWidth > innerWidth + 1) out.push(`page ${doc.scrollWidth}x${doc.scrollHeight}`);
  for (const el of document.querySelectorAll('*')) {
    const style = getComputedStyle(el);
    if (!/(auto|scroll)/.test(style.overflowY + style.overflowX)) continue;
    if (el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1) out.push(`${el.tagName.toLowerCase()}.${el.className} ${el.scrollWidth}x${el.scrollHeight} in ${el.clientWidth}x${el.clientHeight}`);
  }
  return out;
});

async function tabTo(page, selector) {
  for (let i = 0; i < 40; i++) {
    if (await page.evaluate(s => document.activeElement?.matches(s), selector)) return true;
    await page.keyboard.press('Tab');
  }
  return false;
}

/** Waits through movement, result sheets and rank cards until the next prompt. Calls `seen(kind)` before input. */
async function settle(page, think, seen) {
  for (let guard = 0; guard < 50; guard++) {
    const now = await phase(page);
    if (now === 'move') { await track('wait:move', page.locator('[data-phase="move"]').waitFor({ state: 'detached', timeout: 20000 })); continue; }
    if (now === 'result') {
      const go = page.locator('[data-phase="result"] dialog [data-action="continue"]');
      await track('wait:result', (async () => {
        await go.waitFor({ state: 'visible', timeout: 15000 });
        await page.waitForFunction(() => document.activeElement?.matches('[data-action="continue"]'), null, { timeout: 5000 });
      })());
      const kind = await page.locator('dialog[data-pay]').count() ? 'pay' : 'result';
      await seen(kind);
      await think(kind === 'pay' ? 'pay' : 'result');
      await page.keyboard.press('Enter');
      await track('wait:close', go.waitFor({ state: 'detached', timeout: 5000 }));
      continue;
    }
    if (now === 'rankup') {
      await seen('rank');
      await think('rank');
      if (!await tabTo(page, '[data-rank-card] [data-action="continue"]')) notes.push('rank card: Tab never reached 계속');
      await page.keyboard.press('Enter');
      await page.locator('[data-rank-card]').waitFor({ state: 'detached', timeout: 5000 });
      continue;
    }
    if (now === 'event' && !await page.locator('[data-phase="event"] dialog[open]').count()) { await sleep(50); continue; }
    if (now === 'action' || now === 'event' || now === 'ending') {
      // A settlement notice needs no input; it only counts as seen (the pay screenshot).
      if (await page.locator('[data-settle][data-pay]').count()) await seen('pay');
      return now;
    }
    await sleep(50);
  }
  throw new Error('UI did not settle');
}

let mouse = 0;
/** Presses the key for one option. Returns once the engine state changed. */
async function act(page, state, option, think) {
  const before = JSON.stringify(state);
  const id = option.id;
  const step = state.phase === 'event' ? 'event' : ['shop', 'repair', 'bank'].includes(option.kind) ? 'shop' : id === 'spin' ? 'spin' : state.board.step;
  await think(step);
  const press = async () => {
    if (step === 'event' || id === 'skip') {
      if (!await tabTo(page, `[data-option="${id}"]`)) throw new Error(`Tab never reached ${id}`);
      await page.keyboard.press('Enter');
    } else if (id === 'spin') await page.keyboard.press(Math.random() < 0.5 ? 's' : 'S');
    else if (id.startsWith('route:')) await page.keyboard.press(String(Number(id.slice(6)) + 1));
    else if (id === 'end') await page.keyboard.press('e');
    else if (step === 'shop') {
      // Shop, repair and bank: Tab to the bottom tab, Enter, Tab to the card, Enter (and Enter on its commit button).
      const nav = option.kind === 'bank' ? 'bank' : 'shop';
      const card = `[data-option="${id}"], [data-pick="${id}"]`;
      if (!await tabTo(page, `[data-nav="${nav}"]`)) throw new Error(`Tab never reached ${nav}`);
      await page.keyboard.press('Enter');
      if (!await tabTo(page, card)) {
        mouse++;
        await (await revealOption(page, option)).click();
        return;
      }
      const pick = await page.evaluate(() => !!document.activeElement?.dataset.pick);
      await page.keyboard.press('Enter');
      if (pick) {
        await page.waitForFunction(id => document.activeElement?.dataset.option === id, id, { timeout: 3000 });
        await page.keyboard.press('Enter');
      }
    } else {
      // A service leaves its tab open; the number keys work on the home tab.
      if (await page.locator('[data-nav="home"][aria-pressed="false"]').count()) {
        if (!await tabTo(page, '[data-nav="home"]')) throw new Error('Tab never reached home');
        await page.keyboard.press('Enter');
      }
      const index = await page.evaluate(id => [...document.querySelectorAll('[data-screen="play"] .option-card, [data-screen="play"] .route-card')]
        .findIndex(card => card.dataset.option === id || card.dataset.pick === id), id);
      if (index < 0 || index > 8) {
        mouse++;
        await (await revealOption(page, option)).click();
        return;
      }
      // A confirmation card opens its detail first; a direct card commits (and the next step may show the same card).
      const confirm = await page.locator(`[data-screen="play"] [data-pick="${id}"]`).count();
      await page.keyboard.press(String(index + 1));
      const commit = page.locator(`.detail [data-option="${id}"]`);
      if (confirm) {
        await commit.waitFor({ state: 'visible', timeout: 3000 });
        await page.waitForFunction(id => document.activeElement?.dataset.option === id, id, { timeout: 3000 });
        await page.keyboard.press('Enter');
      }
    }
  };
  // Space spins only when the body or the board has focus. Use it on spins with the board focused.
  if (id === 'spin' && await page.evaluate(() => document.activeElement?.matches('[data-board]'))) await page.keyboard.press(' ');
  else await press();
  const changed = await track('wait:input', (async () => {
    for (let i = 0; i < 60; i++) {
      if (JSON.stringify(await readState(page)) !== before) return true;
      await sleep(50);
    }
    return false;
  })());
  if (changed) return;
  notes.push(`input for ${id} at turn ${state.turn} (${step}) did nothing after 3 s; pressed again`);
  await press();
}

async function play(page, { policy = 'pilot', seed = 3, seasons = Infinity, think = async () => {}, seen = async () => {}, stop } = {}) {
  await page.goto(`${base}?debug=1&seed=${seed}`);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.locator('[data-action="new"]').focus();
  await page.keyboard.press('Enter');
  await page.locator('[data-screen="play"]').waitFor();
  const random = botRandom(seed);
  const start = Date.now();
  const seasonTimes = [];
  let state = await readState(page);
  let lastTurn = state.turn, lastAt = start;
  while (state.phase !== 'ended' && state.turn < seasons) {
    const where = await settle(page, think, kind => seen(kind, state));
    state = await readState(page);
    if (state.turn !== lastTurn) {
      seasonTimes.push((Date.now() - lastAt) / 1000);
      if (process.env.PROGRESS) console.log(`  season ${lastTurn} took ${seasonTimes.at(-1).toFixed(1)} s`);
      lastTurn = state.turn; lastAt = Date.now();
    }
    if (process.env.PROGRESS) console.log(`  t=${((Date.now() - start) / 1000).toFixed(1)} turn ${state.turn} ${state.phase}/${state.board.step}`);
    if (where === 'ending' || state.phase === 'ended' || state.turn >= seasons) break;
    await seen(state.phase === 'event' ? 'event' : state.board.step, state);
    if (stop && await stop(state)) return { state, random, seasonTimes };
    const id = pick(POLICIES[policy], state, random);
    await act(page, state, options(state).find(o => o.id === id), think);
    state = await readState(page);
  }
  return { state, random, seasonTimes, total: (Date.now() - start) / 1000 };
}

async function shots() {
  await mkdir(output, { recursive: true });
  for (const [width, height, suffix] of [[390, 844, 'phone'], [1366, 768, 'desktop']]) {
    const page = await open(width, height, 'reduce');
    const shot = async name => {
      await page.evaluate(async () => { await document.fonts.ready; await Promise.all(Array.from(document.images, i => i.decode().catch(() => {}))); });
      await page.screenshot({ path: join(output, `${name}-${suffix}.png`) });
    };
    const want = new Set(['board', 'fork', 'pay', 'bonus']);
    const seen = async kind => {
      const name = kind === 'spin' ? 'board' : kind;
      if (!want.has(name)) return;
      // The first spin is the empty start; take the board after a few seasons so the piece has moved.
      if (name === 'board' && (await readState(page)).turn < 3) return;
      want.delete(name);
      await shot(name);
    };
    const { state, random } = await play(page, { seed: 3, seen, stop: async () => want.size === 0 });
    assert.equal(want.size, 0, `missing ${[...want]}`);
    // Fast-forward in the engine to the last choice, load that save and make the final choice in the UI.
    let s = state, finalChoice;
    for (;;) {
      const id = pick(POLICIES.pilot, s, random);
      const next = choose(s, id).state;
      if (next.phase === 'ended') { finalChoice = options(s).find(o => o.id === id); break; }
      s = next;
    }
    await page.evaluate(saved => localStorage.setItem('pilot-growup:run:v1', JSON.stringify(saved)), s);
    await page.reload();
    await page.locator('[data-action="continue-run"]').click();
    await act(page, s, finalChoice, async () => {});
    await settle(page, async () => {}, async () => {});
    await page.locator('[data-screen="ending"] [data-final-rank]').waitFor();
    await shot('ending');
    await page.context().close();
  }
  console.log(`10 screenshots in ${output}`);
}

async function keys() {
  for (const [width, height] of [[390, 844], [360, 740], [1280, 800], [1366, 768]]) {
    const page = await open(width, height, 'reduce');
    const problems = new Set();
    const kinds = new Set();
    const seen = async kind => {
      kinds.add(kind);
      for (const p of await scrollProblems(page)) problems.add(`${kind}: ${p}`);
    };
    mouse = 0;
    const stop = async state => state.turn >= 8 && state.phase === 'action' && !await page.locator('dialog[open]').count();
    for (const [policy, seed] of [['pilot', 3], ['ceo', 5]]) await play(page, { policy, seed, seen, stop });
    // The sheets: grades strip, career ladder, then Escape.
    for (const action of ['grades', 'ladder']) {
      if (!await tabTo(page, `[data-action="${action}"]`)) { problems.add(`Tab never reached ${action}`); continue; }
      await page.keyboard.press('Enter');
      await sleep(200);
      for (const p of await scrollProblems(page)) problems.add(`${action}: ${p}`);
      if (action === 'ladder') {
        await page.keyboard.press('Escape');
        await sleep(200);
        if (await page.locator('dialog[open]').count()) problems.add('ladder card did not close on Escape');
      } else await page.keyboard.press('Enter');
    }
    console.log(`${width}x${height}: kinds ${[...kinds].join(',')}; mouse fallbacks ${mouse}; scroll ${problems.size ? [...problems].join(' | ') : 'none'}`);
    await page.context().close();
  }
}

async function timed() {
  const [width, height] = (process.argv[3] ?? '390x844').split('x').map(Number);
  const page = await open(width, height, 'no-preference');
  const think = async step => track('think:' + step, sleep(THINK[step] ?? 2000));
  const counts = {};
  const seen = async kind => { counts[kind] = (counts[kind] ?? 0) + 1; };
  mouse = 0;
  const seasons = Number(process.env.TIMED_SEASONS ?? 16);
  const { seasonTimes, state } = await play(page, { policy: process.env.TIMED_POLICY ?? 'pilot', seed: 11, seasons, think, seen });
  const total = seasonTimes.reduce((a, b) => a + b, 0);
  const per = total / seasonTimes.length;
  console.log(`timed ${width}x${height}: ${seasonTimes.length} seasons (to turn ${state.turn}), ${total.toFixed(1)} s, ${per.toFixed(1)} s/season`);
  console.log(`  per season: ${seasonTimes.map(t => t.toFixed(1)).join(' ')}`);
  console.log(`  prompts seen: ${JSON.stringify(counts)}; mouse fallbacks ${mouse}`);
  const accounted = Object.values(spent).reduce((a, b) => a + b, 0);
  console.log('  s/season by label: ' + Object.entries(spent).sort((a, b) => b[1] - a[1])
    .map(([label, ms]) => `${label} ${(ms / 1000 / seasonTimes.length).toFixed(2)}`).join(', ')
    + `, other ${((total * 1000 - accounted) / 1000 / seasonTimes.length).toFixed(2)}`);
  console.log(`  extrapolated: ${(per * 104.8 / 60).toFixed(1)} min for the sim's mean 104.8 seasons, ${(per * 120 / 60).toFixed(1)} min for 120`);
  await page.context().close();
}

try {
  if (mode === 'shots') await shots();
  else if (mode === 'timed') await timed();
  else await keys();
  if (notes.length) console.log('notes:\n  ' + notes.join('\n  '));
} finally {
  await browser.close();
  await new Promise(done => server.httpServer.close(done));
}
