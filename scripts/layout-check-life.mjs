// T16/T17: six maps, engine choices, keyboard seasons and deterministic motion checks.
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build, preview } from 'vite';
import { chromium } from 'playwright-core';
import { choose, derived, newGame, options } from '../src/life/engine.ts';
import { EVENTS } from '../src/life/compat.ts';
import { MAPS, WORLD } from '../src/life/world.ts';
import { reachable } from '../src/life/move.ts';
import { destinationDetails } from '../src/ui2/pick.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SIZES = [[390, 844], [360, 740], [1280, 800], [1366, 768]];

// Importable without building or opening a port so Node can regress the traversal.
export function pagingChecks(page, check, activate = control => control.click()) {
  const popupSelector = '.life2-popup[data-popup]';
  const popup = page.locator(popupSelector);
  const wheel = page.locator('.life2-bottom .life2-wheel');
  const renderedOptions = nodes => nodes.map(node => ({ id: node.dataset.option, enabled: !node.disabled }));
  const engineOptions = () => page.evaluate(() => window.__life.options().map(({ id, enabled }) => ({ id, enabled })));
  const actual = () => page.evaluate(() => window.__life.state());
  const controls = async () => {
    const inPopup = await popup.count() > 0;
    const prefix = inPopup ? popupSelector : '.life2-pager';
    const action = inPopup ? 'popup-page' : 'page';
    return {
      previous: page.locator(`${prefix} [data-action="${action}-prev"]`),
      next: page.locator(`${prefix} [data-action="${action}-next"]`),
      choices: inPopup ? `${popupSelector} [data-option]` : '.life2-option-list [data-option]',
    };
  };
  const clickAndRender = async control => {
    const panel = await (await popup.count() ? popup : page.locator('.life2-options')).elementHandle();
    assert.ok(panel, 'the life option panel is mounted');
    try {
      await activate(control);
      // Popup paging/details replace only the inner popup; choosing and plain
      // paging replace the whole shell. Either operation detaches this handle.
      await page.waitForFunction(oldPanel => !oldPanel.isConnected, panel);
    } finally { await panel.dispose(); }
  };
  const dismissResults = async name => {
    let count = 0;
    while (await popup.count() && (await popup.getAttribute('data-popup') === 'result'
      || await popup.getAttribute('data-presentation') !== null)) {
      assert.ok(count++ < 100, 'result dismissal terminates');
      await check(`${name} result ${count}`);
      const before = await actual();
      const close = page.locator(`${popupSelector} [data-action="popup-close"]`);
      assert.equal(await close.count(), 1, 'a result has a way to continue');
      await clickAndRender(close);
      assert.deepEqual(await actual(), before, 'dismissing a result never chooses again');
    }
  };
  const prepare = async name => {
    await dismissResults(name);
    const reopen = page.locator('.life2-option-list [data-action="popup-reopen"]');
    if (!await popup.count() && await reopen.count()) {
      const before = await actual();
      await clickAndRender(reopen);
      assert.deepEqual(await actual(), before, 'reopening choices does not change the engine state');
    }
  };
  const firstPage = async () => {
    const { previous, next } = await controls();
    assert.equal(await previous.count(), 1, 'the current choice view has a previous-page control');
    assert.equal(await next.count(), 1, 'the current choice view has a next-page control');
    let count = 0;
    while (await previous.isEnabled()) {
      assert.ok(count++ < 100, 'rewinding the pager terminates');
      await clickAndRender(previous);
    }
    return controls();
  };
  return {
    async checkPages(name) {
      await prepare(name);
      // A prior audit leaves the pager at its end. Always include earlier pages
      // on repeated audits of the same state (e.g. after spin, then season play).
      const { previous, next, choices } = await firstPage();
      const offered = await engineOptions();
      const expected = offered.filter(option => option.id !== 'spin');
      assert.equal(await wheel.count(), 1, 'the bottom bar contains one wheel');
      assert.equal(await wheel.evaluate(node => node.matches('button:not(:disabled)')),
        offered.some(option => option.id === 'spin' && option.enabled), 'spin is available through the wheel exactly when offered');
      const seen = [];
      for (let index = 0; ; index++) {
        assert.ok(index < 100, 'auditing pages terminates');
        await check(`${name} page ${index + 1}`);
        // Read each rendered page: popup and plain views use different page
        // sizes, and presentation may reorder engine choices (e.g. promo/quit).
        const visible = await page.locator(choices).evaluateAll(renderedOptions);
        for (const option of visible) {
          assert.deepEqual(option, expected.find(row => row.id === option.id), `${name}: ${option.id} matches the engine`);
          assert.ok(!seen.some(row => row.id === option.id), `${name}: ${option.id} appears only once`);
          seen.push(option);
        }
        assert.equal(await previous.isDisabled(), index === 0, 'previous stops at the first page');
        if (await next.isDisabled()) break;
        assert.ok(visible.length > 0, 'a non-final page contains choices');
        await clickAndRender(next);
      }
      const byId = (a, b) => a.id.localeCompare(b.id);
      assert.deepEqual(seen.sort(byId), expected.sort(byId), `${name}: every engine option is reachable by paging, including disabled choices`);
    },
    async clickChoice(id) {
      await prepare(`before ${id}`);
      assert.ok((await engineOptions()).some(option => option.id === id && option.enabled), `${id} is enabled`);
      let control = wheel;
      if (id === 'spin') {
        assert.equal(await wheel.evaluate(node => node.matches('button:not(:disabled)')), true, 'spin has an active wheel');
      } else {
        const { next, choices } = await firstPage();
        control = page.locator(`${choices}[data-option="${id}"]`);
        let count = 0;
        while (!(await control.count())) {
          assert.ok(count++ < 100, 'finding an option terminates');
          assert.equal(await next.isEnabled(), true, `${id} is reachable`);
          await clickAndRender(next);
        }
      }
      await clickAndRender(control);
      // Quitting opens a confirmation before it calls choose().
      if (id === 'quit' && await popup.count() && await popup.getAttribute('data-confirm') === 'quit') {
        await check('quit confirmation');
        await clickAndRender(page.locator(`${popupSelector} [data-action="popup-confirm"]`));
      }
      await dismissResults(`after ${id}`);
    },
  };
}

// Real Tab navigation only: no locator.focus(), DOM focus(), or mouse fallback.
export async function keyboardActivate(page, control, key = 'Enter') {
  assert.equal(await control.isEnabled(), true, 'keyboard target is enabled');
  let tabs = 0;
  while (!(await control.evaluate(node => node === document.activeElement))) {
    assert.ok(tabs++ < 250, 'keyboard target is reachable by Tab');
    await page.keyboard.press('Tab');
  }
  await page.keyboard.press(key);
}

async function movementChecks(page, load, check) {
  const phase = () => page.locator('#app').getAttribute('data-phase');
  const pawn = () => page.locator('[data-pawn]').getAttribute('data-pawn');
  const actual = () => page.evaluate(() => window.__life.state());
  const press = (selector, key) => keyboardActivate(page, page.locator(selector), key);
  const keys = pagingChecks(page, check, control => keyboardActivate(page, control));
  const startRun = async seed => {
    const run = newGame(seed); await load(run);
    await keys.checkPages('keyboard start choices');
    await keys.clickChoice('start:school');
    const started = choose(run, 'start:school').state;
    assert.deepEqual(await actual(), started, 'keyboard start choice matches engine');
    return started;
  };
  const fixture = (pos, dice) => {
    const run = choose(newGame(1), 'start:school').state;
    run.board.pos = pos; run.board.dice = dice; run.board.step = 'pick'; return run;
  };
  // This entire season, including the destination tile and paged actions, uses only keys.
  let expected = await startRun(1);
  assert.equal(await page.locator('[data-die]').count(), 2);
  await keys.clickChoice('spin'); expected = choose(expected, 'spin').state;
  assert.equal(await phase(), 'pick');
  assert.deepEqual(await page.locator('[data-die]').allTextContents(), expected.board.dice.map(String));
  const moves = reachable(expected);
  for (const move of moves) {
    const tile = page.locator(`[data-space="${move.node}"][data-dest="${move.node}"]`);
    assert.equal(await tile.count(), 1, 'each local reachable tile is selectable');
    assert.ok((await tile.getAttribute('aria-label')).includes(destinationDetails(move)));
  }
  assert.equal(await page.locator('[data-path-preview] line').count(), moves[0].steps);
  await press(`[data-space="${moves[0].node}"][data-dest]`, 'Space');
  expected = choose(expected, `go:${moves[0].node}`).state;
  for (let step = 0; expected.turn === 0 && step < 8; step++) {
    await keys.checkPages('keyboard season');
    const offered = options(expected).filter(option => option.enabled);
    const id = (offered.find(option => option.id === 'end' || option.id === 'skip') ?? offered.at(-1)).id;
    await keys.clickChoice(id); expected = choose(expected, id).state;
    assert.deepEqual(await actual(), expected, 'keyboard choice matches engine');
  }
  assert.equal(expected.turn, 1, 'keyboard alone completes a season');
  await check('keyboard next season');
  const single = await startRun(11); await keys.clickChoice('spin');
  assert.deepEqual(await actual(), choose(single, 'spin').state);
  assert.equal(await phase(), 'space', 'reduced motion is instant; one destination never shows pick');
  assert.equal(await page.locator('[data-dest]').count(), 0);

  // Freeze browser timers so exact boundaries are reliable even on slow CI workers.
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.clock.install({ time: 0 }); await page.clock.pauseAt(1000);
  await startRun(1); await press('.life2-bottom .life2-wheel');
  assert.equal(await phase(), 'spin'); await check('rolling wheels');
  await page.clock.runFor(699); assert.equal(await phase(), 'spin');
  await page.clock.runFor(1); assert.equal(await phase(), 'pick'); await check('pick after 700ms');
  const target = page.locator('[data-space="A-o4"][data-dest]');
  await target.hover();
  assert.equal(await page.locator('[data-path-preview]').getAttribute('data-path-preview'), 'A-o4');
  assert.equal(await page.locator('[data-path-preview] line').count(), 4);

  const earlyStopped = await startRun(11);
  await page.evaluate(() => {
    window.__lifePhases = [];
    window.__lifePhaseObserver = new MutationObserver(records => window.__lifePhases.push(...records.map(record => record.oldValue)));
    window.__lifePhaseObserver.observe(document.querySelector('#app'), { attributes: true, attributeFilter: ['data-phase'], attributeOldValue: true });
  });
  await press('.life2-bottom .life2-wheel'); await page.keyboard.press('Enter'); // stop wheels early
  assert.equal(await phase(), 'move'); assert.equal(await pawn(), 'A-o1');
  await page.keyboard.press('Escape'); assert.equal(await phase(), 'space');
  assert.equal(await pawn(), 'A-o4');
  assert.equal(await page.evaluate(() => { window.__lifePhaseObserver.disconnect(); return window.__lifePhases.includes('pick'); }), false);
  await page.clock.runFor(2000);
  assert.deepEqual(await actual(), choose(earlyStopped, 'spin').state, 'skip never rolls or applies movement twice');

  const paid = fixture('A-o10', [2, 2]); paid.board.ledger = { wage: 125, expense: -20 };
  await load(paid); await press('[data-space="A-o12"][data-dest]');
  assert.equal(await phase(), 'move'); assert.equal(await pawn(), 'A-o11');
  assert.equal(await page.locator('[data-payment]').getAttribute('data-payment'), '105'); await check('salary while moving');
  await page.clock.runFor(249); assert.equal(await pawn(), 'A-o11');
  await page.clock.runFor(1); assert.equal(await pawn(), 'A-o12');
  await page.clock.runFor(250);
  assert.deepEqual(await actual(), choose(paid, 'go:A-o12').state);

  const crossing = fixture('A-o11', [4, 4]);
  await load(crossing); await keys.checkPages('transfer destinations');
  assert.equal(await page.locator('.life2-transfer-badge[data-dest="B-o2"]').count(), 1);
  await keys.clickChoice('go:B-o2'); await page.clock.runFor(500);
  assert.equal(await phase(), 'transfer');
  assert.equal(await page.locator('[data-map]').getAttribute('data-map'), 'A');
  assert.equal(await page.locator('.life2-map-overview span').count(), 6); await check('transfer overview');
  await page.clock.runFor(599); assert.equal(await phase(), 'transfer');
  await page.clock.runFor(1); assert.equal(await phase(), 'move'); assert.equal(await pawn(), 'B-o1');
  assert.equal(await page.locator('[data-map]').getAttribute('data-map'), 'B'); await check('arrival map');
  await page.clock.runFor(500); assert.equal(await pawn(), 'B-o2');
  assert.deepEqual(await actual(), choose(crossing, 'go:B-o2').state);

  const immediate = fixture('A-o13', [1, 1]);
  for (const reduce of [false, true]) {
    await load(immediate); await keys.clickChoice('go:B-o1'); assert.equal(await phase(), 'transfer');
    if (reduce) await page.emulateMedia({ reducedMotion: 'reduce' });
    else await page.keyboard.press('Space');
    await page.waitForFunction(() => document.querySelector('#app').dataset.phase !== 'transfer');
    await page.clock.runFor(2000);
    assert.deepEqual(await actual(), choose(immediate, 'go:B-o1').state);
    assert.equal(await pawn(), 'B-o1', 'skip and reduced-motion changes finish immediately');
  }
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await startRun(1); await press('.life2-bottom .life2-wheel');
  await load(newGame(42)); await page.clock.runFor(2000);
  assert.deepEqual(await actual(), newGame(42), 'loading cancels stale animation callbacks');
  await page.emulateMedia({ reducedMotion: 'reduce' });
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
    if (!node.closest('[inert]') && node.matches('button, [data-space]') && (rect.width < 43.99 || rect.height < 43.99)) issues.push(`${label}: smaller than 44px`);
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
  const popup = document.querySelector('.life2-popup');
  if (popup) {
    const sheet = popup.getBoundingClientRect();
    if (vw < 900 && !popup.hasAttribute('data-fullscreen') && sheet.height > vh * .55 + 1) issues.push('sheet exceeds 55%');
    for (const node of popup.querySelectorAll('p, button, h2')) {
      const box = node.getBoundingClientRect();
      if (box.top < sheet.top - 1 || box.bottom > sheet.bottom + 1 || box.left < sheet.left - 1 || box.right > sheet.right + 1)
        issues.push('popup content outside sheet');
      if (node.scrollHeight > node.clientHeight + 1 || node.scrollWidth > node.clientWidth + 1) issues.push('popup text overflows');
    }
    for (const control of document.querySelectorAll('.life2-bottom button')) {
      const box = control.getBoundingClientRect(), hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
      if (!control.contains(hit)) issues.push('popup covers bottom navigation');
    }
    if (vw < 900 && !popup.hasAttribute('data-fullscreen')) {
      const pawn = document.querySelector('[aria-current=location]').getBoundingClientRect();
      const hud = document.querySelector('.life2-hud').getBoundingClientRect();
      const bottom = document.querySelector('.life2-bottom').getBoundingClientRect();
      const fitsAbove = hud.bottom + 6 + sheet.height + 6 <= pawn.top;
      const fitsBelow = pawn.bottom + 6 <= bottom.top - 6 - sheet.height;
      if ((fitsAbove || fitsBelow) && pawn.bottom > sheet.top && pawn.top < sheet.bottom) issues.push('sheet hides a pawn row that could remain visible');
    }
  }
  return [...new Set(issues)];
}

// F3 regressions exercise mounted engine transitions, not just named popup fixtures.
async function fix3Checks(page, load, check) {
  const popup = () => page.locator('.life2-popup');
  const close = () => page.locator('[data-action=popup-close]').click();
  const select = async id => {
    for (let index = 0; index < 30; index++) {
      const option = page.locator(`[data-option="${id}"]`);
      if (await option.count()) { await option.click(); return; }
      const next = page.locator('[data-action=popup-page-next]');
      assert.ok(await next.count() && await next.isEnabled(), `${id} is reachable`); await next.click();
    }
    assert.fail(`missing ${id}`);
  };
  const worker = (rank = 0) => {
    const run = choose(newGame(1), 'start:self').state;
    run.turn = 3; run.status = 'working'; run.track = 'service';
    run.job = { rank, perf: 26, tenure: 8, total: 8, warn: 0, changedAt: 0, tracks: ['service'] };
    Object.assign(run.s, { xp: 210, rank, stamina: 80, capStamina: 80 });
    run.board.pos = WORLD.find(node => node.map === 'A' && node.kind === 'rankup').id;
    run.board.step = 'bonus'; run.board.dice = [1, 1]; return run;
  };
  const expect = async kind => {
    assert.equal(await popup().getAttribute('data-popup'), kind); await check(`F3 ${kind}`);
    assert.equal(await page.locator('[data-action=popup-close]').textContent(), '닫기');
  };
  const promotion = worker(); promotion.board.step = 'space'; promotion.job.perf = 95;
  await load(promotion); await select('promo'); await expect('rankup');
  const warning = worker(); await load(warning); await select('end'); await expect('year-end');
  assert.match(await popup().locator('p').textContent(), /성과 26: 경고 기준 30 미만/);
  // Navigation must work above a pending result and return to that same result.
  await keyboardActivate(page, page.locator('[data-nav=phone]')); await expect('phone'); await close(); await expect('year-end');
  await page.locator('[data-nav=life]').click(); await expect('my-life');
  for (const tab of ['ability', 'career', 'family', 'assets', 'records']) {
    await page.locator(`[data-tab=${tab}]`).click(); await check(`F3 life ${tab}`);
  }
  await close(); await close(); await expect('review');
  assert.match(await popup().locator('p').textContent(), /성과 26: 경고 기준 30 미만/);
  const demotion = worker(1); demotion.job.warn = 1;
  await load(demotion); await select('end'); await expect('demotion');
  for (const turn of [63, 143]) {
    const run = worker(); run.status = 'jobless'; run.track = null; run.turn = turn;
    await load(run); await select('end');
    for (let count = 0; await popup().getAttribute('data-popup') !== 'chapter'; count++) {
      assert.ok(count < 5); await close();
    }
    await expect('chapter');
  }
  const retirement = worker(1); retirement.turn = 164;
  await load(retirement); await expect('retirement');
  for (const id of ['go:A-o12', 'spin']) {
    const run = choose(newGame(11), 'start:self').state;
    run.board.pos = id === 'spin' ? 'A-o8' : 'A-o11';
    run.board.step = id === 'spin' ? 'spin' : 'pick'; run.board.dice = id === 'spin' ? [] : [1, 1];
    await load(run);
    if (id === 'spin') await page.locator('.life2-wheel').click(); else await page.locator('[data-space="A-o12"][data-dest]').click();
    await expect('luck'); await close(); await expect('bonus');
  }
  // Low pawn rows exercise top docking at each phone size.
  for (const node of WORLD.filter(node => node.map === 'A' && node.y >= 70)) {
    const run = worker(); run.board.pos = node.id;
    await load(run); await page.locator('[data-nav=phone]').click(); await check(`F3 pawn ${node.id}`);
  }
  console.log('  F3: live rank/review/year/chapter/retirement/luck popups, main-face warning, bottom navigation and pawn rows checked');
}

// T18 isolated popup section: no changes to the existing map/movement fixtures.
async function popupChecks(page, base) {
  await page.goto(`${base}src/ui2/popups/layout.html`);
  await page.waitForFunction(() => window.__popupFixture);
  for (const kind of await page.evaluate(() => window.__popupFixture.kinds)) {
    const model = await page.evaluate(kind => window.__popupFixture.show(kind), kind);
    const popup = page.locator('[data-popup]');
    assert.equal(await popup.getAttribute('data-popup'), kind);
    const seen = [];
    do {
      assert.deepEqual(await popup.evaluate(panel => {
        const issues = [], box = panel.getBoundingClientRect();
        if (innerHeight > innerWidth && !panel.hasAttribute('data-fullscreen') && box.height > innerHeight * .55 + 1) issues.push('sheet exceeds 55%');
        if (panel.querySelectorAll('[data-option]').length > 3) issues.push('more than three choices');
        for (const node of [panel, ...panel.querySelectorAll('*')]) {
          if (node.closest('svg')) continue;
          const rect = node.getBoundingClientRect(), css = getComputedStyle(node);
          if (rect.left < box.left - 1 || rect.right > box.right + 1 || rect.top < box.top - 1 || rect.bottom > box.bottom + 1) issues.push('popup content outside sheet');
          if (node.matches('button') && (rect.width < 44 || rect.height < 44)) issues.push('tap target below 44px');
          if (['auto', 'scroll'].includes(css.overflowY) || node.scrollHeight > node.clientHeight + 1 || node.scrollWidth > node.clientWidth + 1) issues.push('popup content overflows');
          if (parseFloat(css.fontSize) < 11) issues.push('text below 11px');
        }
        return [...new Set(issues)];
      }), [], `${kind}: popup layout`);
      seen.push(...await popup.locator('[data-option]').evaluateAll(nodes => nodes.map(node => node.dataset.option)));
      if (seen.length >= model.choices.length) break;
      await popup.locator('[data-action="popup-page-next"]').click();
    } while (seen.length < model.choices.length);
    assert.deepEqual(seen, model.choices.map(choice => choice.id), `${kind}: every choice paged`);
    await page.evaluate(kind => window.__popupFixture.show(kind), kind);
    if (model.choices.length) {
      await popup.locator('[data-option]').first().press('Enter');
      assert.equal(await page.evaluate(() => window.__popupFixture.taken()), model.choices[0].id);
      await popup.locator('[data-action="popup-details"]').first().click();
      assert.equal(await popup.getAttribute('data-details'), '');
      await popup.locator('[data-action="popup-text-next"]').click();
      await popup.locator('[data-action="popup-back"]').click();
    }
    if (kind === 'result') assert.equal(await popup.locator('[data-result-wheel]').textContent(), '43');
    await page.keyboard.press('Escape');
    assert.equal(await page.evaluate(() => window.__popupFixture.closed()), true, `${kind}: Escape exits`);
  }
  await page.evaluate(() => window.__popupFixture.show('result', true));
  assert.equal(await page.locator('[data-notification]').count(), 1);
  assert.equal(await page.locator('[data-result-wheel]').count(), 0);
  console.log('  T18: 11 popup kinds, three choices per page, portrait sheets <=55%, keyboard exit checked');
}

// T19 isolated popup group: fixture-only engine views, plus the separate ending/gallery screens.
async function popup2Checks(page, base) {
  await page.goto(`${base}src/ui2/popups/layout.html`);
  await page.waitForFunction(() => window.__popup2Fixture);
  const audit = async selector => assert.deepEqual(await page.locator(selector).evaluate(panel => {
    const issues = [], box = panel.getBoundingClientRect();
    if (panel.dataset.popup && innerHeight > innerWidth && !panel.hasAttribute('data-fullscreen') && box.height > innerHeight * .55 + 1) issues.push('sheet exceeds 55%');
    if (panel.querySelectorAll('[data-option]').length > 3) issues.push('more than three choices');
    for (const node of [panel, ...panel.querySelectorAll('*')]) {
      if (node.closest('svg')) continue;
      const rect = node.getBoundingClientRect(), css = getComputedStyle(node);
      if (rect.left < box.left - 1 || rect.right > box.right + 1 || rect.top < box.top - 1 || rect.bottom > box.bottom + 1) issues.push('content outside panel');
      if (node.matches('button') && (rect.width < 44 || rect.height < 44)) issues.push('tap target below 44px');
      if (['auto', 'scroll'].includes(css.overflowY) || node.scrollHeight > node.clientHeight + 1 || node.scrollWidth > node.clientWidth + 1) issues.push('content overflows');
      if (parseFloat(css.fontSize) < 11) issues.push('text below 11px');
    }
    return [...new Set(issues)];
  }), [], `${selector}: T19 layout`);
  for (const kind of await page.evaluate(() => window.__popup2Fixture.kinds)) {
    const model = await page.evaluate(kind => window.__popup2Fixture.show(kind), kind), seen = [];
    const popup = page.locator('[data-popup]');
    assert.equal(await popup.getAttribute('data-popup'), kind);
    do {
      await audit('[data-popup]');
      seen.push(...await popup.locator('[data-option]').evaluateAll(nodes => nodes.map(node => node.dataset.option)));
      if (seen.length >= model.choices.length) break;
      await popup.locator('[data-action="popup-page-next"]').click();
    } while (seen.length < model.choices.length);
    assert.deepEqual(seen, model.choices.map(choice => choice.id));
    await page.evaluate(kind => window.__popup2Fixture.show(kind), kind);
    if (model.choices.length) {
      await popup.locator('[data-option]').first().press('Enter');
      assert.equal(await page.evaluate(() => window.__popup2Fixture.taken()), model.choices[0].id);
      await popup.locator('[data-action="popup-details"]').first().click(); await audit('[data-popup]');
      await popup.locator('[data-action="popup-text-next"]').click(); await audit('[data-popup]');
      await popup.locator('[data-action="popup-back"]').click();
    }
    for (const tab of model.tabs ?? []) { await popup.locator(`[data-tab="${tab.id}"]`).click(); await audit('[data-popup]'); }
    await page.keyboard.press('Escape'); assert.equal(await page.evaluate(() => window.__popup2Fixture.closed()), true);
  }
  for (let index = 0; index < 21; index++) {
    await page.evaluate(index => window.__popup2Fixture.ending(index), index); await audit('.life2-ending-screen');
  }
  await page.evaluate(() => window.__popup2Fixture.collection());
  const seen = [];
  for (let index = 0; index < 7; index++) {
    await audit('.life2-ending-screen');
    seen.push(...await page.locator('[data-pick]').evaluateAll(nodes => nodes.map(node => node.dataset.pick)));
    await page.locator('[data-pick]').first().click(); await audit('.life2-ending-screen');
    await page.locator('[data-nav="gallery-back"]').click();
    if (index < 6) await page.locator('[data-action="gallery-page-next"]').click();
  }
  assert.equal(new Set(seen).size, 21);
  console.log('  T19: 11 popup kinds, five life tabs, 21 endings and collection pages checked');
}

async function main() {
  const shots = process.env.LAYOUT_SHOTS ? resolve(root, process.env.LAYOUT_SHOTS) : null;
  if (shots) mkdirSync(shots, { recursive: true });
  await build({ root, configFile: join(root, 'vite.config.ts'), logLevel: 'warn' });
  await build({ root, configFile: join(root, 'vite.config.ts'), logLevel: 'warn',
    build: { emptyOutDir: false, rollupOptions: { input: join(root, 'src/ui2/popups/layout.html') } } });
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
        await checkPages('start choices');
        await clickChoice('start:school');
        const started = choose(newGame(11), 'start:school').state;
        assert.deepEqual(await page.evaluate(() => window.__life.state()), started, 'start choice calls the engine');
        for (const map of Object.keys(MAPS)) {
          const run = structuredClone(started); run.board.pos = `${map}-o0`;
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
          // Finish through the current choice view, acknowledging each result
          // before the next engine choice (including the final season result).
          for (let step = 0; expected.turn === 0 && step < 8; step++) {
            await checkPages(`${map} ${expected.phase}-${expected.board.step}`);
            const offered = options(expected).filter(option => option.enabled);
            const id = (offered.find(option => option.id === 'end' || option.id === 'skip') ?? offered.at(-1)).id;
            await clickChoice(id); expected = choose(expected, id).state;
            assert.deepEqual(await page.evaluate(() => window.__life.state()), expected);
          }
          assert.equal(expected.turn, 1, 'choice controls finish a season'); seasons++;
          await check(`${map} next season`);
          for (const step of ['pick', 'space', 'bonus']) {
            const fixture = structuredClone(started);
            fixture.board.pos = step === 'pick' ? `${map}-o0` : WORLD.find(node => node.map === map && node.kind === 'train').id;
            fixture.board.step = step; fixture.board.dice = step === 'pick' ? [6, 6] : [1, 1];
            await load(fixture); await checkPages(`${map} ${step} menu`);
          }
        }
        await movementChecks(page, load, check); seasons++;
        const event = structuredClone(started); event.phase = 'event'; event.eventId = EVENTS[0].id;
        event.board.step = 'space'; event.board.dice = [1, 1];
        await load(event); await checkPages('event');
        await fix3Checks(page, load, check);
        await popupChecks(page, base);
        await popup2Checks(page, base);
        await page.goto(`${base}?life=1&seed=11`);
        await page.locator('[data-map=A]').waitFor();
        assert.equal(await page.evaluate(() => window.__life === undefined), true, 'state loader is debug-only');
        await page.goto(`${base}?seed=11&debug=1`);
        await page.locator('[data-screen=title]').waitFor();
        assert.equal(await page.locator('.life2').count(), 0, 'default stays v1');
        assert.equal(await page.evaluate(() => window.__game.state().v), 1);
        console.log(`  ${size}: six maps, seven seasons (one keyboard-only), spin/pick/move/transfer timing and skips checked`);
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
