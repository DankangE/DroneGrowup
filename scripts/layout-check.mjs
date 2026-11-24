// No-scroll layout check: opens every screen of the game in Chrome at four viewport sizes and fails when
// anything does not fit.
//
// A view fails when
//   - the page scrolls (document.scrollingElement is taller or wider than the viewport),
//   - a visible element reaches outside the viewport,
//   - an element scrolls inside (overflow auto / scroll with more content than room),
//   - an element cuts its content off (overflow hidden with more content than room; mark deliberate clipping,
//     such as the map stage, with data-clip-ok),
//   - a button is smaller than a fingertip (44 px), or text is smaller than 11 px.
// Every tab ([data-tab]) and every pager page ([data-action="page-next"]) of a view is visited.
//
//   npm run layout                              check only
//   LAYOUT_SHOTS=docs/screenshots/after npm run layout     also write one screenshot per view and size
//   LAYOUT_REPORT_ONLY=1 npm run layout         print the problems, exit 0
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build, preview } from 'vite';
import { chromium } from 'playwright-core';
import { POLICIES, botRandom, pick } from '../src/game/bots.ts';
import { ENDING_IDS } from '../src/game/data.ts';
import { choose, newGame, options } from '../src/game/engine.ts';
import { eachTabAndPage, revealOption } from './ui-driver.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SIZES = [[390, 844], [360, 740], [1280, 800], [1366, 768]];
const MIN_TAP = 44;
const MIN_FONT = 11;
const RUN_KEY = 'pilot-growup:run:v1';
const META_KEY = 'pilot-growup:meta:v1';
const shotDir = process.env.LAYOUT_SHOTS ? resolve(root, process.env.LAYOUT_SHOTS) : null;
const reportOnly = process.env.LAYOUT_REPORT_ONLY === '1';
if (shotDir) mkdirSync(shotDir, { recursive: true });

// ---- the game states to look at, found by letting the bots play in Node
const start = newGame(11);
let busiest = start; // action phase with the most options on offer
let event = null; // event phase with the most choices
let stageUp = null; // a luck roll whose result changes the career stage (the fullest result sheet)
let anyRoll = null;
let lastStep = null; // the choice that ends a run
for (const [policy, seed] of [['pilot', 3], ['employee', 5], ['gambler', 2], ['instructor', 7], ['ceo', 1], ['chairman', 4]]) {
  let state = newGame(seed);
  const rand = botRandom(seed);
  while (state.phase !== 'ended') {
    const offered = options(state);
    if (state.phase === 'action' && offered.length > options(busiest).length) busiest = state;
    if (state.phase === 'event' && (!event || offered.length > options(event).length)) event = state;
    const id = pick(POLICIES[policy], state, rand);
    const option = offered.find((o) => o.id === id);
    const next = choose(state, id);
    if (option.roll && state.phase === 'action') {
      anyRoll ??= { state, option };
      if (!stageUp && next.result.stageTo !== next.result.stageFrom && next.state.phase !== 'ended') stageUp = { state, option };
    }
    if (next.state.phase === 'ended' && !lastStep) lastStep = { state, option };
    state = next.state;
  }
}
const rollStep = stageUp ?? anyRoll;
assert.ok(event && rollStep && lastStep, 'the bot runs reach an event, a luck roll and an ending');

await build({ root, configFile: join(root, 'vite.config.ts'), logLevel: 'warn' });
const server = await preview({ root, configFile: join(root, 'vite.config.ts'), preview: { port: 5298, strictPort: false } });
const base = server.resolvedUrls.local[0];
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH, channel: process.env.CHROME_PATH ? undefined : 'chrome' });

/** Runs in the page: every layout problem of what is on screen now. */
function audit({ minTap, minFont }) {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const problems = [];
  const label = (el) => `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''}${[...el.classList].slice(0, 2).map((c) => `.${c}`).join('')}`;
  const page = document.scrollingElement;
  if (page.scrollHeight > vh) problems.push(`page scrolls: content ${page.scrollHeight}px tall, viewport ${vh}px`);
  if (page.scrollWidth > vw) problems.push(`page scrolls sideways: content ${page.scrollWidth}px wide, viewport ${vw}px`);
  const clips = (value) => value !== 'visible';
  for (const el of document.body.querySelectorAll('*')) {
    if (el.closest('svg') && el.tagName.toLowerCase() !== 'svg') continue;
    if (el.closest('[data-layout-ignore]')) continue;
    if (!el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) continue;
    const box = el.getBoundingClientRect();
    if (box.width <= 1 || box.height <= 1) continue;
    const style = getComputedStyle(el);
    // The part of the element that can be seen: its box cut by every clipping ancestor below <body>.
    let { left, top, right, bottom } = box;
    for (let up = el.parentElement; up && up !== document.body; up = up.parentElement) {
      const s = getComputedStyle(up);
      const b = up.getBoundingClientRect();
      if (clips(s.overflowX)) { left = Math.max(left, b.left); right = Math.min(right, b.right); }
      if (clips(s.overflowY)) { top = Math.max(top, b.top); bottom = Math.min(bottom, b.bottom); }
    }
    if (right - left <= 1 || bottom - top <= 1) continue;
    if (left < -1 || top < -1 || right > vw + 1 || bottom > vh + 1) {
      problems.push(`${label(el)} is outside the viewport: x ${Math.round(left)}..${Math.round(right)}, y ${Math.round(top)}..${Math.round(bottom)}`);
    }
    const tall = el.scrollHeight > el.clientHeight + 1;
    const wide = el.scrollWidth > el.clientWidth + 1;
    const scrolls = (v) => v === 'auto' || v === 'scroll';
    if ((tall && scrolls(style.overflowY)) || (wide && scrolls(style.overflowX))) {
      problems.push(`${label(el)} scrolls inside: content ${el.scrollWidth}x${el.scrollHeight}, room ${el.clientWidth}x${el.clientHeight}`);
    }
    const cut = (v) => v === 'hidden' || v === 'clip';
    if (!el.hasAttribute('data-clip-ok') && el.tagName.toLowerCase() !== 'svg'
      && ((tall && cut(style.overflowY)) || (wide && cut(style.overflowX) && style.textOverflow !== 'ellipsis'))) {
      problems.push(`${label(el)} cuts its content off: content ${el.scrollWidth}x${el.scrollHeight}, room ${el.clientWidth}x${el.clientHeight}`);
    }
    if (el.matches('button, a[href], [role="button"], input, select') && (box.height < minTap - 0.5 || box.width < minTap - 0.5)) {
      problems.push(`${label(el)} "${(el.textContent ?? '').trim().slice(0, 12)}" is a ${Math.round(box.width)}x${Math.round(box.height)} tap target (min ${minTap})`);
    }
    const ownText = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
    if (ownText && parseFloat(style.fontSize) < minFont) problems.push(`${label(el)} "${el.textContent.trim().slice(0, 12)}" has ${style.fontSize} text (min ${minFont}px)`);
  }
  return [...new Set(problems)];
}

const failures = [];
let viewCount = 0;

for (const [width, height] of SIZES) {
  const size = `${width}x${height}`;
  const context = await browser.newContext({ viewport: { width, height }, reducedMotion: 'reduce', deviceScaleFactor: 1, hasTouch: width < 600, locale: 'ko-KR' });
  const page = await context.newPage();
  const screenIs = (name) => page.waitForFunction((n) => document.querySelector(`[data-screen="${n}"]`), name, { timeout: 8000 });

  /** Audits what is on screen, on every tab and page of it, and writes the screenshot of the first one. */
  const check = async (view) => {
    let first = true;
    await eachTabAndPage(page, async (tab, index) => {
      await page.waitForTimeout(120);
      const where = `${size} ${view}${tab ? ` tab ${tab}` : ''}${index ? ` page ${index + 1}` : ''}`;
      viewCount++;
      for (const problem of await page.evaluate(audit, { minTap: MIN_TAP, minFont: MIN_FONT })) failures.push(`${where}: ${problem}`);
      if (first && shotDir) await page.screenshot({ path: join(shotDir, `${size}-${view}.png`) });
      first = false;
    });
  };
  /** Fresh page with this saved run and record; lands on the title. */
  const load = async (run, meta) => {
    await page.goto(`${base}?debug=1`);
    await page.evaluate(([runKey, metaKey, r, m]) => {
      localStorage.clear();
      if (r) localStorage.setItem(runKey, JSON.stringify(r));
      if (m) localStorage.setItem(metaKey, JSON.stringify(m));
    }, [RUN_KEY, META_KEY, run, meta]);
    await page.reload();
    await screenIs('title');
  };
  const resume = async (run) => {
    await load(run, null);
    await page.locator('[data-action="continue-run"]').click();
    await screenIs('play');
  };
  /** Opens one of the play screen's sheets if this UI has it. */
  const open = async (action) => {
    const button = page.locator(`[data-action="${action}"]:visible`).first();
    if (!(await button.count())) return false;
    await button.click();
    return true;
  };
  const playViews = async (name, run) => {
    await resume(run);
    await check(name);
    for (const sheet of ['all', 'services', 'details']) {
      await resume(run);
      if (await open(sheet)) await check(`${name}-${sheet}`);
    }
  };
  const tap = async ({ option }) => (await revealOption(page, option)).click();

  try {
    await load(null, null);
    await check('title');
    await load(busiest, { gallery: ENDING_IDS, best: 9999999, runs: 99 });
    await check('title-saved');

    await playViews('play-start', start);
    await playViews('play-busy', busiest);
    await resume(event);
    await check('play-event');

    await resume(rollStep.state);
    await tap(rollStep);
    await page.locator('[data-action="continue"]').waitFor({ state: 'visible', timeout: 8000 });
    await check('play-result');

    await resume(lastStep.state);
    await tap(lastStep);
    await page.locator('[data-action="continue"]').waitFor({ state: 'visible', timeout: 8000 });
    await check('play-last-result');
    await page.locator('[data-action="continue"]').click();
    await screenIs('ending');
    await check('ending');
    await page.locator('[data-action="gallery"]:visible').first().click();
    await screenIs('gallery');
    await check('gallery-one');

    await load(null, { gallery: ENDING_IDS, best: 9999999, runs: 99 });
    await page.locator('[data-action="gallery"]:visible').first().click();
    await screenIs('gallery');
    await check('gallery-full');
  } catch (error) {
    failures.push(`${size}: could not walk the screens: ${error.message.split('\n')[0]}`);
  }
  await context.close();
}

await browser.close();
await new Promise((done) => server.httpServer.close(done));

for (const [width, height] of SIZES) {
  const size = `${width}x${height}`;
  const count = failures.filter((f) => f.startsWith(size)).length;
  console.log(`  ${size}: ${count ? `${count} problems` : 'fits, no scroll'}`);
}
if (failures.length) {
  console.log(failures.join('\n'));
  if (!reportOnly) {
    console.error(`layout check FAILED: ${failures.length} problems in ${viewCount} views`);
    process.exit(1);
  }
} else {
  console.log(`layout check OK: ${viewCount} views at ${SIZES.length} sizes fit without scrolling`);
}
