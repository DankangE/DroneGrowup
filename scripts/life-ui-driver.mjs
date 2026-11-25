// T20 shared browser transport and bounded policy runner. Imports never open a port.
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { setTimeout as pause } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { build, preview } from 'vite';
import { chromium } from 'playwright-core';
import { choose, derived, forecast, newGame, options, reachable } from '../src/life/flow.ts';
import { rankChange } from '../src/life/career2.ts';
import { WORLD } from '../src/life/world.ts';
import { audit, keyboardActivate, pagingChecks } from './layout-check-life.mjs';
import { DESTINATION_PRIORITY, MAX_CHOICES_PER_SEASON, SEASONS, THINK_MS } from './life-check-data.mjs';
import { readingStep, choiceTiming } from './life-time-model.ts';

const nodes = new Map(WORLD.map(node => [node.id, node]));
export const mapOf = state => nodes.get(state.board.pos).map;
export const readState = page => page.evaluate(() => window.__life.state());

/** Simple work/train policy. Eligibility, routes, prices and odds come from engine views. */
export function pickLifeOption(state, { stayMap } = {}) {
  const offered = options(state).filter(option => option.enabled);
  const find = id => offered.find(option => option.id === id);
  if (find('start:work')) return 'start:work';
  if (find('promo')) return 'promo';
  if (state.status !== 'working') {
    const job = offered.find(option => option.id.startsWith('job:') && option.id !== 'job:none');
    if (job) return job.id;
  }
  if (find('job:none')) return 'job:none';
  if (find('spin')) return 'spin';
  if (offered.some(option => option.id.startsWith('go:'))) {
    const moves = reachable(state).filter(move => !stayMap ||
      move.path.every(id => nodes.get(id).map === stayMap));
    const score = move => (move.stop ? 100 : 0) + (DESTINATION_PRIORITY[nodes.get(move.node).kind] ?? 0);
    moves.sort((a, b) => score(b) - score(a) || a.fare - b.fare || a.steps - b.steps || a.node.localeCompare(b.node));
    assert.ok(moves.length, `no route remains on map ${stayMap}`);
    return `go:${moves[0].node}`;
  }
  // Events can relocate the pawn too. Timed runs only accept responses whose
  // forecast branches stay local; ordinary playtest choices keep their ordering.
  const event = offered.filter(option => option.id.startsWith('ev:') && (!stayMap ||
    forecast(state, option.id).branches.every(branch => !branch.effects ||
      nodes.get(branch.effects.position).map === stayMap))).sort((a, b) => a.cost - b.cost)[0];
  if (event) return event.id;
  for (const prefix of ['work', 'train', 'prep']) {
    const duty = find(`act:${prefix}_${state.track}`);
    if (duty) return duty.id;
  }
  const action = offered.filter(option => option.id.startsWith('act:')).sort((a, b) => a.cost - b.cost)[0];
  if (action) return action.id;
  const fallback = find('end') ?? find('skip') ?? offered.find(option => option.id !== 'quit');
  assert.ok(fallback, `policy stuck at turn ${state.turn} ${state.phase}/${state.board.step}`);
  return fallback.id;
}

/** Only timed/map checks use a fixture, once before playing; no state injection during a run. */
export function mapFixture(map, seed = 11) {
  assert.ok(nodes.has(`${map}-o0`), `unknown map ${map}`);
  let state = choose(newGame(seed), 'start:work').state;
  state = choose(state, pickLifeOption(state)).state;
  state.board.pos = `${map}-o0`;
  return state;
}

export async function withLifeBrowser(run) {
  const root = fileURLToPath(new URL('../', import.meta.url));
  await build({ root, logLevel: 'warn' });
  const server = await preview({ root, preview: { host: '127.0.0.1', port: 0 } });
  let browser;
  const failures = [];
  try {
    const base = server.resolvedUrls?.local[0];
    assert.ok(base, 'preview has a local URL');
    browser = await chromium.launch({ headless: process.env.HEADED !== '1',
      executablePath: process.env.CHROME_PATH, channel: process.env.CHROME_PATH ? undefined : 'chrome' });
    const open = async (size, seed = 11, motion = 'reduce') => {
      const [width, height] = size;
      const context = await browser.newContext({ viewport: { width, height }, reducedMotion: motion, locale: 'ko-KR' });
      const page = await context.newPage();
      page.setDefaultTimeout(10000);
      page.on('pageerror', error => failures.push(`${size}: ${error.message}`));
      page.on('console', message => { if (message.type() === 'error') failures.push(`${size}: ${message.text()}`); });
      page.on('request', request => {
        const url = new URL(request.url());
        if (url.protocol !== 'data:' && url.origin !== new URL(base).origin) failures.push(`outside request: ${url}`);
      });
      await page.goto(`${base}?debug=1&seed=${seed}`);
      await page.waitForFunction(() => window.__life);
      await page.evaluate(() => document.fonts.ready);
      assert.equal(await page.evaluate(() => window.__game === undefined), true, 'v1 is not mounted');
      assert.deepEqual(await readState(page), newGame(seed), 'real v2 starts from the URL seed');
      return page;
    };
    await run(open);
    assert.deepEqual(failures, [], 'console/page errors or outside requests');
  } finally {
    try { await browser?.close(); } finally { await server.close(); }
  }
}

export async function checkLifeView(page, state) {
  assert.deepEqual(await page.evaluate(audit), [], `layout at turn ${state.turn}`);
  assert.equal(await page.locator('[data-map]').getAttribute('data-map'), mapOf(state));
  assert.equal(await page.locator('[data-pawn]').getAttribute('data-pawn'), state.board.pos);
  assert.deepEqual(await page.locator('[data-space]').evaluateAll(tiles => tiles.map(tile => [tile.dataset.space, tile.dataset.kind])),
    WORLD.filter(node => node.map === mapOf(state)).map(node => [node.id, node.kind]));
  assert.ok((await page.locator('.life2-hud').textContent()).includes(derived(state).dateLabel));
  assert.deepEqual(await page.locator('[data-die]').allTextContents(), [0, 1].map(index => String(state.board.dice[index] ?? '—')));
  assert.deepEqual(await page.evaluate(() => window.__life.options()), options(state));
}

export function browserDriver(page, { keyboard = false, timed = false, auditPages = true } = {}) {
  let expectedResult;
  const waitMotion = () => page.waitForFunction(() => !document.querySelector(
    '.life2-bottom [data-action="stop-spin"], .life2-bottom [data-action="skip-move"]'));
  const activate = async control => {
    if (timed && await control.getAttribute('data-action') === 'popup-close') await pause(THINK_MS.result);
    if (keyboard) await keyboardActivate(page, control);
    else await control.click(); // Never dispatchEvent(), evaluate(choose), or force-click.
    await waitMotion(); // Natural animations, including automatic single-destination travel.
    // Timed runs retain the sheet entrance animation. Audit its settled box,
    // not its transient translateY (which can extend below the viewport).
    await page.locator('.life2-popup').evaluateAll(panels => Promise.all(panels.flatMap(panel =>
      panel.getAnimations().map(animation => animation.finished.catch(() => {})))));
  };
  const check = async name => {
    assert.deepEqual(await page.evaluate(audit), [], name);
    if (!expectedResult || !name.startsWith('after ')) return;
    const wheel = page.locator('[data-result-wheel]');
    assert.equal(await wheel.count(), Number(!!expectedResult.roll), 'roll result is displayed exactly when rolled');
    if (expectedResult.roll) {
      const { value, chance } = expectedResult.roll;
      assert.equal(await wheel.textContent(), String(value));
      assert.ok((await wheel.getAttribute('aria-label')).includes(`${chance}%`), 'result shows the rolled chance');
    }
  };
  const paging = pagingChecks(page, check, activate);
  return {
    state: () => readState(page),
    async take(state, id) {
      const next = choose(state, id);
      await checkLifeView(page, state);
      await paging.prepare(`before ${id}`);
      if (auditPages) await paging.checkPages(`turn ${state.turn} ${id}`);
      if (timed) {
        const panel = page.locator('.life2-popup');
        const popup = await panel.count() ? await panel.getAttribute('data-popup') : null;
        const step = readingStep(state, popup);
        await pause(THINK_MS[step]);
      }
      expectedResult = next.result;
      // Exercise direct board tiles; the pager supplies other-map destination badges.
      const tile = id.startsWith('go:') ? page.locator(`[data-space="${id.slice(3)}"][data-dest]`) : null;
      if (tile && await tile.count()) {
        await activate(tile);
        await paging.dismissResults(`after ${id}`);
      }
      else await paging.clickChoice(id);
      assert.deepEqual(await readState(page), next.state, `after ${id} on turn ${state.turn}: UI equals engine`);
      await checkLifeView(page, next.state);
      if (next.state.phase === 'action' && next.state.board.step === 'bonus') {
        assert.notDeepEqual(options(next.state).filter(row => row.enabled).map(row => row.id), ['end'],
          'interactive flow never exposes an empty extra-action confirmation');
      }
      return next.state;
    },
  };
}

/** Timing ends after dismissal of the final result, so the twelfth season is included. */
export async function playSeasons(driver, { seasons = SEASONS, stopAtRankup = false, stayMap,
  now = () => performance.now() } = {}) {
  assert.ok(Number.isInteger(seasons) && seasons > 0, 'positive integer season count');
  let state = await driver.state(), choices = 0, promotions = 0, lastAt = now();
  const initialTurn = state.turn, seasonTimes = [], modeledTimes = [];
  let modeledSeconds = 0;
  while (state.turn - initialTurn < seasons && !(stopAtRankup && promotions)) {
    assert.notEqual(state.phase, 'ended', 'run ended before its acceptance target');
    assert.ok(choices++ < (seasons + 1) * MAX_CHOICES_PER_SEASON, 'run did not advance: choice limit');
    if (stayMap) assert.equal(mapOf(state), stayMap, 'timed sample stays on its map');
    const before = state, id = pickLifeOption(state, { stayMap });
    const predicted = choose(before, id);
    modeledSeconds += choiceTiming(before, predicted.state, predicted.result).seconds;
    state = await driver.take(before, id);
    assert.notDeepEqual(state, before, `${id} must advance state`);
    if (stayMap) assert.equal(mapOf(state), stayMap, 'timed sample never transfers');
    if (rankChange(before, state)?.kind === 'promotion') promotions++;
    if (state.turn !== before.turn) {
      assert.equal(state.turn, before.turn + 1, 'each measured interval is exactly one season');
      const at = now(); seasonTimes.push((at - lastAt) / 1000); lastAt = at;
      modeledTimes.push(modeledSeconds); modeledSeconds = 0;
    }
  }
  assert.ok(promotions && stopAtRankup || seasonTimes.length === seasons, 'rank-up or requested seasons completed');
  return { state, choices, promotions, seasonTimes, modeledTimes };
}
