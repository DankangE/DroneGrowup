// T16 shell: six maps at the same four sizes as layout-check.mjs, plus engine-driven choices.
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build, preview } from 'vite';
import { chromium } from 'playwright-core';
import { choose, derived, newGame, options } from '../src/life/engine.ts';
import { EVENTS } from '../src/life/compat.ts';
import { MAPS, WORLD } from '../src/life/world.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SIZES = [[390, 844], [360, 740], [1280, 800], [1366, 768]];

// Importable without building or opening a port so Node can regress the traversal.
export function pagingChecks(page, check) {
  const previous = page.locator('.life2-pager [data-action="page-prev"]');
  const next = page.locator('.life2-pager [data-action="page-next"]');
  const choices = page.locator('.life2-option-list [data-option]');
  const renderedOptions = nodes => nodes.map(node => ({ id: node.dataset.option, enabled: !node.disabled }));
  const engineOptions = () => page.evaluate(() => window.__life.options().map(({ id, enabled }) => ({ id, enabled })));
  const clickAndRender = async control => {
    const panel = await page.locator('.life2-options').elementHandle();
    assert.ok(panel, 'the life option panel is mounted');
    try {
      await control.click();
      // Both paging and choosing replace the panel. Wait for that render, even
      // when the new page has the same phase or number of options as the old one.
      await page.waitForFunction(oldPanel => !oldPanel.isConnected, panel);
    } finally { await panel.dispose(); }
  };
  const firstPage = async () => {
    let count = 0;
    while (await previous.isEnabled()) {
      assert.ok(count++ < 100, 'rewinding the pager terminates');
      await clickAndRender(previous);
    }
  };
  return {
    async checkPages(name) {
      // A prior audit leaves the pager at its end. Always include earlier pages
      // on repeated audits of the same state (e.g. after spin, then season play).
      await firstPage();
      const offered = await engineOptions();
      const expected = offered.filter(option => option.id !== 'spin');
      assert.deepEqual(await page.locator('.life2-bottom [data-option]').evaluateAll(renderedOptions),
        offered.filter(option => option.id === 'spin'), 'spin is handled by the plain footer button');
      const seen = [];
      const pages = Math.max(1, Math.ceil(expected.length / 2));
      for (let index = 0; index < pages; index++) {
        await check(`${name} page ${index + 1}`);
        const visible = await choices.evaluateAll(renderedOptions);
        assert.deepEqual(visible, expected.slice(index * 2, (index + 1) * 2),
          `${name} page ${index + 1}: two engine options in order, including disabled choices`);
        seen.push(...visible.map(option => option.id));
        assert.equal(await previous.isDisabled(), index === 0, 'previous stops at the first page');
        assert.equal(await next.isDisabled(), index === pages - 1, 'next stops at the last page');
        if (index < pages - 1) await clickAndRender(next);
      }
      assert.deepEqual(seen, expected.map(option => option.id), 'every engine option is reachable by paging');
    },
    async clickChoice(id) {
      assert.ok((await engineOptions()).some(option => option.id === id && option.enabled), `${id} is enabled`);
      const control = page.locator(id === 'spin' ? '.life2-bottom [data-option="spin"]'
        : `.life2-option-list [data-option="${id}"]`);
      if (id !== 'spin') {
        await firstPage();
        let count = 0;
        while (!(await control.count())) {
          assert.ok(count++ < 100, 'finding an option terminates');
          assert.equal(await next.isEnabled(), true, `${id} is reachable`);
          await clickAndRender(next);
        }
      }
      await clickAndRender(control);
    },
  };
}

// Runs in Chromium. Check actual boxes and clipping, not merely overflow:hidden on the root.
function audit() {
  const issues = [], vw = innerWidth, vh = innerHeight;
  const doc = document.scrollingElement;
  if (doc.scrollWidth > vw || doc.scrollHeight > vh) issues.push('document scrolls');
  for (const node of document.querySelectorAll('#app, #app *')) {
    if (!node.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) continue;
    if (node.closest('svg') && node.tagName.toLowerCase() !== 'svg') continue;
    const rect = node.getBoundingClientRect(), style = getComputedStyle(node);
    if (rect.width <= 1 || rect.height <= 1) continue;
    const label = `${node.tagName}.${node.getAttribute('class') ?? ''}`;
    if (rect.left < -1 || rect.top < -1 || rect.right > vw + 1 || rect.bottom > vh + 1) issues.push(`${label}: outside viewport`);
    if (['auto', 'scroll'].includes(style.overflowX) || ['auto', 'scroll'].includes(style.overflowY)) issues.push(`${label}: scroll container`);
    if (node.tagName.toLowerCase() !== 'svg' &&
      ((node.scrollWidth > node.clientWidth + 1 && ['hidden', 'clip'].includes(style.overflowX)) ||
       (node.scrollHeight > node.clientHeight + 1 && ['hidden', 'clip'].includes(style.overflowY)))) issues.push(`${label}: content clipped`);
    if (node.matches('button, [data-space]') && (rect.width < 43.99 || rect.height < 43.99)) issues.push(`${label}: smaller than 44px`);
    if (node.matches('[data-space]') && Math.abs(rect.width - rect.height) > .1) issues.push(`${label}: tile is not square`);
    if ([...node.childNodes].some(child => child.nodeType === 3 && child.textContent.trim()) && parseFloat(style.fontSize) < 11) issues.push(`${label}: text below 11px`);
    for (let parent = node.parentElement; parent; parent = parent.parentElement) {
      const box = parent.getBoundingClientRect(), css = getComputedStyle(parent);
      if ((css.overflowX !== 'visible' && (rect.left < box.left - 1 || rect.right > box.right + 1)) ||
          (css.overflowY !== 'visible' && (rect.top < box.top - 1 || rect.bottom > box.bottom + 1))) {
        issues.push(`${label}: clipped by ancestor`); break;
      }
    }
  }
  const tiles = [...document.querySelectorAll('[data-space]')].map(node => node.getBoundingClientRect());
  for (const [index, one] of tiles.entries()) for (const two of tiles.slice(index + 1)) {
    if (Math.min(one.right, two.right) > Math.max(one.left, two.left) + 1 &&
        Math.min(one.bottom, two.bottom) > Math.max(one.top, two.top) + 1) issues.push('tiles overlap');
  }
  const regions = ['.life2-hud', '.life2-board', '.life2-options', '.life2-bottom']
    .map(selector => document.querySelector(selector).getBoundingClientRect());
  for (const [index, one] of regions.entries()) for (const two of regions.slice(index + 1)) {
    if (Math.min(one.right, two.right) > Math.max(one.left, two.left) + 1 &&
        Math.min(one.bottom, two.bottom) > Math.max(one.top, two.top) + 1) issues.push('screen regions overlap');
  }
  return [...new Set(issues)];
}

async function main() {
  const shots = process.env.LAYOUT_SHOTS ? resolve(root, process.env.LAYOUT_SHOTS) : null;
  if (shots) mkdirSync(shots, { recursive: true });
  await build({ root, configFile: join(root, 'vite.config.ts'), logLevel: 'warn' });
  const server = await preview({ root, configFile: join(root, 'vite.config.ts'), preview: { port: 5299, strictPort: false } });
  let browser, views = 0, mapViews = 0, seasons = 0;
  const failures = [];
  try {
    const base = server.resolvedUrls?.local[0];
    assert.ok(base, 'preview has a local URL');
    browser = await chromium.launch({ executablePath: process.env.CHROME_PATH, channel: process.env.CHROME_PATH ? undefined : 'chrome' });
    for (const [width, height] of SIZES) {
      const context = await browser.newContext({ viewport: { width, height }, reducedMotion: 'reduce', locale: 'ko-KR' });
      try {
        const page = await context.newPage(), size = `${width}x${height}`;
        page.on('pageerror', error => failures.push(`${size}: ${error.message}`));
        page.on('request', request => {
          if (!request.url().startsWith(base) && !request.url().startsWith('data:')) {
            failures.push(`${size}: unexpected network request ${request.url()}`);
          }
        });
        const load = async state => page.evaluate(run => window.__life.load(run), state);
        const check = async name => {
          views++;
          for (const issue of await page.evaluate(audit)) failures.push(`${size} ${name}: ${issue}`);
        };
        const { checkPages, clickChoice } = pagingChecks(page, check);
        await page.goto(`${base}?life=1&seed=11&debug=1`);
        await page.waitForFunction(() => window.__life);
        await page.evaluate(() => document.fonts.ready);
        assert.deepEqual(await page.evaluate(() => window.__life.state()), newGame(11), 'life=1 starts exactly newGame(seed)');
        assert.equal(await page.evaluate(() => window.__game === undefined), true, 'v1 is not mounted');
        assert.equal(await page.locator('#app').getAttribute('data-screen'), 'play');
        for (const map of Object.keys(MAPS)) {
          const run = newGame(11); run.board.pos = `${map}-o0`;
          await load(run);
          assert.equal(await page.locator('[data-map]').getAttribute('data-map'), map);
          assert.deepEqual((await page.locator('[data-space]').evaluateAll(nodes => nodes.map(node => node.dataset.space))).sort(),
            WORLD.filter(node => node.map === map).map(node => node.id).sort(), 'every tile is rendered');
          assert.equal(await page.locator('[data-pawn]').count(), 1);
          assert.equal(await page.locator('[data-pawn]').getAttribute('data-pawn'), run.board.pos);
          assert.ok((await page.locator('.life2-hud').textContent()).includes(derived(run).dateLabel));
          assert.ok((await page.locator('.life2-hud').textContent()).includes(MAPS[map].name));
          await checkPages(`${map} spin`); mapViews++;
          if (shots) await page.screenshot({ path: join(shots, `${size}-${map}.png`) });
          await clickChoice('spin');
          let expected = choose(run, 'spin').state;
          assert.deepEqual(await page.evaluate(() => window.__life.state()), expected, 'spin calls the engine');
          await checkPages(`${map} after spin`);
          if (expected.board.step === 'pick') {
            const destination = options(expected).filter(option => option.enabled).at(-1).id;
            await clickChoice(destination); expected = choose(expected, destination).state;
            assert.deepEqual(await page.evaluate(() => window.__life.state()), expected, 'destination calls the engine');
          }
          assert.equal(await page.locator('[data-pawn]').getAttribute('data-pawn'), expected.board.pos);
          // Finish the first season through only the plain option buttons.
          for (let step = 0; expected.turn === 0 && step < 8; step++) {
            await checkPages(`${map} ${expected.phase}-${expected.board.step}`);
            const offered = options(expected).filter(option => option.enabled);
            const id = (offered.find(option => option.id === 'end' || option.id === 'skip') ?? offered.at(-1)).id;
            await clickChoice(id); expected = choose(expected, id).state;
            assert.deepEqual(await page.evaluate(() => window.__life.state()), expected);
          }
          assert.equal(expected.turn, 1, 'plain buttons finish a season'); seasons++;
          await check(`${map} next season`);
          for (const step of ['pick', 'space', 'bonus']) {
            const fixture = newGame(11);
            fixture.board.pos = step === 'pick' ? `${map}-o0` : WORLD.find(node => node.map === map && node.kind === 'train').id;
            fixture.board.step = step; fixture.board.dice = step === 'pick' ? [6, 6] : [1, 1];
            await load(fixture); await checkPages(`${map} ${step} menu`);
          }
        }
        const event = newGame(11); event.phase = 'event'; event.eventId = EVENTS[0].id;
        event.board.step = 'space'; event.board.dice = [1, 1];
        await load(event); await checkPages('event');
        await page.goto(`${base}?life=1&seed=11`);
        await page.locator('[data-map=A]').waitFor();
        assert.equal(await page.evaluate(() => window.__life === undefined), true, 'state loader is debug-only');
        await page.goto(`${base}?seed=11&debug=1`);
        await page.locator('[data-screen=title]').waitFor();
        assert.equal(await page.locator('.life2').count(), 0, 'default stays v1');
        assert.equal(await page.evaluate(() => window.__game.state().v), 1);
        console.log(`  ${size}: six maps, all options paged, six seasons completed`);
      } finally { await context.close(); }
    }
  } finally {
    try { await browser?.close(); }
    finally { await server.close(); }
  }
  assert.deepEqual(failures, [], failures.join('\n'));
  console.log(`layout:life OK: ${mapViews} map/size checks, ${views} views, ${seasons} seasons; tiles >=44px, text >=11px, no scroll`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
