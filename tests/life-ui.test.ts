import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
import { choose, newGame, options, restore } from '../src/life/flow.ts';
import { EVENTS } from '../src/life/compat.ts';
import type { GameState } from '../src/life/types.ts';
import { MAPS, WORLD } from '../src/life/world.ts';
import { GRID, gridCell } from '../src/ui2/board.ts';
import { mountLife } from '../src/ui2/app.ts';
import { action, panelAt, TestNode, withDOM } from './life-popup2-dom-helper.ts';

test('board places all 212 tiles in their original appendix A grid cells on all six maps', () => {
  const spec = readFileSync(new URL('../docs/design/life-board.md', import.meta.url), 'utf8');
  const appendix = spec.slice(spec.indexOf('## 부록 A. 칸 표'));
  const expected = new Map(appendix.split('\n').filter(line => /^\| [A-F]-\w+ \|/.test(line)).map(line => {
    const [id, xy] = line.split('|').slice(1).map(cell => cell.trim());
    const [x, y] = xy.split(',').map(Number);
    return [id, { column: x + 1, row: y + 1 }];
  }));
  assert.equal(expected.size, 212);
  for (const node of WORLD) assert.deepEqual(gridCell(node), expected.get(node.id), node.id);
});

test('grid placement handles all 63 floored percentage centers without collisions or mutation', () => {
  assert.deepEqual(GRID, { columns: 7, rows: 9 });
  const cells = new Set<string>();
  for (let row = 1; row <= 9; row++) for (let column = 1; column <= 7; column++) {
    const point = Object.freeze({ x: Math.floor((column - .5) * 100 / 7), y: Math.floor((row - .5) * 100 / 9) });
    const cell = gridCell(point);
    assert.deepEqual(cell, { column, row });
    cells.add(`${cell.column},${cell.row}`);
  }
  assert.equal(cells.size, 63);
});

// Mount the current UI without Vite/Chromium. Only the Playwright transport is
// doubled: clicks render on waitForFunction, catching stale reads and waits for
// the wrong node (popup paging keeps the options host connected).
const { pagingChecks } = await import(new URL('../scripts/layout-check-life.mjs', import.meta.url).href);
type TestPanel = { isConnected: boolean; dispose: () => Promise<void> };
class PagingPage {
  root = new TestNode('main');
  browser = { matchMedia: () => ({ matches: true, addEventListener() {} }) } as unknown as Window;
  api: NonNullable<Window['__life']>;
  pending?: () => void;
  popupRenders = 0;
  shellRenders = 0;
  constructor(state: GameState) {
    this.inDOM(() => mountLife(this.root.element(), 11, true));
    this.api = this.browser.__life!;
    this.inDOM(() => this.api.load(state));
  }
  inDOM(run: () => void) {
    withDOM(() => {
      const original = Object.getOwnPropertyDescriptor(globalThis, 'window');
      Object.defineProperty(globalThis, 'window', { configurable: true, value: this.browser });
      try { run(); } finally {
        if (original) Object.defineProperty(globalThis, 'window', original); else Reflect.deleteProperty(globalThis, 'window');
      }
    });
  }
  get state() { return this.api.state(); }
  get index() {
    const pager = this.root.querySelector('.life2-popup-footer') ?? this.root.querySelector('.life2-pager');
    return Number(pager?.querySelector('span')?.textContent.split(' / ')[0] ?? 1) - 1;
  }
  visible() {
    const panel = panelAt(this.root) ?? this.root.querySelector('.life2-option-list')!;
    return panel.querySelectorAll('[data-option]').map(node => ({ id: node.dataset.option, enabled: !node.disabled }));
  }
  async evaluate(fn: () => unknown) {
    return structuredClone(runInNewContext(`(${fn.toString()})()`, { window: this.browser }));
  }
  async waitForFunction(fn: (oldPanel: TestPanel) => boolean, oldPanel: TestPanel) {
    assert.ok(this.pending, 'a click scheduled a render');
    const host = this.root.querySelector('.life2-options')!;
    this.pending(); this.pending = undefined;
    assert.equal(fn(oldPanel), true, 'waits for the old popup or plain panel to detach');
    if (this.root.contains(host)) this.popupRenders++; else this.shellRenders++;
  }
  locator(selector: string) {
    const nodes = () => selector.split(' ').reduce((parents, part) => parents.flatMap(node => node.querySelectorAll(part)), [this.root]);
    const single = () => { const found = nodes(); assert.equal(found.length, 1, selector); return found[0]; };
    return {
      isEnabled: async () => !single().disabled,
      isDisabled: async () => single().disabled,
      count: async () => nodes().length,
      evaluateAll: async (fn: (nodes: TestNode[]) => unknown) => fn(nodes()),
      evaluate: async (fn: (node: TestNode) => unknown) => fn(single()),
      getAttribute: async (name: string) => {
        const node = single();
        return name.startsWith('data-') ? node.dataset[name.slice(5).replace(/-([a-z])/g, (_match, letter: string) => letter.toUpperCase())] ?? null
          : node.attributes[name] ?? null;
      },
      elementHandle: async () => {
        const node = single(), root = this.root;
        return { get isConnected() { return root.contains(node); }, dispose: async () => {} };
      },
      click: async () => {
        const node = single(); assert.equal(node.disabled, false, `${selector} is enabled`);
        assert.equal(this.pending, undefined, 'the last render was awaited');
        this.pending = () => this.inDOM(() => node.fire('click'));
      },
    };
  }
}

function estatePagingState() {
  const state = choose(newGame(11), 'start:school').state;
  state.board.pos = 'A-o24'; state.board.step = 'space'; state.board.dice = [1, 1]; state.s.money = 1000;
  return state;
}

test('life layout traverses nine popup choices twice and rewinds without replacing the shell', async () => {
  const state = estatePagingState(), ids = options(state).map(option => option.id);
  assert.equal(ids.length, 9);
  assert.ok(options(state).some(option => !option.enabled), 'includes locked choices');
  const page = new PagingPage(state), seen: string[][] = [];
  const { checkPages } = pagingChecks(page, async () => { seen.push(page.visible().map(option => option.id)); });
  await checkPages('estate'); assert.equal(page.index, 1);
  await checkPages('estate again');
  assert.deepEqual(seen, [ids.slice(0, 6), ids.slice(6), ids.slice(0, 6), ids.slice(6)]);
  assert.equal(page.popupRenders, 3, 'next, rewind, next replace only the popup');
  assert.equal(page.shellRenders, 0);
  assert.deepEqual(page.state, state);
});

test('life layout choice lookup rewinds to an earlier popup page before choosing', async () => {
  const state = estatePagingState(), page = new PagingPage(state);
  const { checkPages, clickChoice } = pagingChecks(page, async () => {});
  await checkPages('before choice'); assert.equal(page.index, 1);
  await assert.rejects(clickChoice('home:buy:5'), /is enabled/);
  await clickChoice('home:rent:1');
  assert.deepEqual(page.state, choose(state, 'home:rent:1').state);
  assert.ok(page.popupRenders >= 2, 'both forward paging and rewind occurred');
  assert.equal(page.index, 0); assert.equal(page.pending, undefined);
});

test('life layout traverses plain destination pages and rewinds before choosing', async () => {
  const state = choose(newGame(1), 'start:school').state;
  state.board.pos = 'B-o2'; state.board.step = 'pick'; state.board.dice = [6, 6]; state.s.car = 2;
  const page = new PagingPage(state), seen: string[][] = [];
  const { checkPages, clickChoice } = pagingChecks(page, async () => { seen.push(page.visible().map(option => option.id)); });
  assert.equal(panelAt(page.root), undefined);
  const ids = options(state).map(option => option.id); assert.equal(ids.length, 9);
  await checkPages('destinations'); assert.equal(page.index, 1);
  await checkPages('destinations again');
  assert.deepEqual(seen, [ids.slice(0, 6), ids.slice(6), ids.slice(0, 6), ids.slice(6)]);
  assert.equal(page.shellRenders, 3, 'next, rewind, next replace the plain shell');
  assert.equal(page.popupRenders, 0);
  await clickChoice(ids[0]); assert.deepEqual(page.state, choose(state, ids[0]).state);
  assert.ok(page.shellRenders >= 5, 'rewind and choosing each render the shell');
});

test('life layout reopens dismissed choices and dismisses an already mounted result before auditing', async () => {
  const page = new PagingPage(newGame(11)), checked: string[] = [];
  const { checkPages } = pagingChecks(page, async (name: string) => { checked.push(name); });
  page.inDOM(() => action(page.root, 'popup-close').fire('click'));
  assert.equal(panelAt(page.root), undefined);
  await checkPages('reopened');
  assert.equal(panelAt(page.root).dataset.popup, 'start'); assert.deepEqual(page.state, newGame(11));
  page.inDOM(() => page.root.querySelector('[data-option="start:school"]')!.fire('click'));
  assert.equal(panelAt(page.root).dataset.popup, 'result');
  await checkPages('ready');
  assert.ok(checked.includes('ready result 1'));
  assert.equal(panelAt(page.root), undefined);
  assert.deepEqual(page.state, choose(newGame(11), 'start:school').state);
});

test('life layout spins through the wheel without relying on its data-option hook', async () => {
  const state = choose(newGame(11), 'start:school').state, page = new PagingPage(state);
  delete page.root.querySelector('.life2-wheel')!.dataset.option;
  const { checkPages, clickChoice } = pagingChecks(page, async () => {});
  await checkPages('wheel'); await clickChoice('spin');
  assert.deepEqual(page.state, choose(state, 'spin').state);
});

test('life layout rejects missing engine choices, duplicate choices and incorrect enabled states', async () => {
  const missing = new PagingPage(newGame(11));
  missing.root.querySelector('[data-option="start:self"]')!.remove();
  await assert.rejects(pagingChecks(missing, async () => {}).checkPages('missing'), /every engine option is reachable/);
  const duplicate = new PagingPage(newGame(11));
  duplicate.root.querySelector('[data-option="start:self"]')!.dataset.option = 'start:school';
  await assert.rejects(pagingChecks(duplicate, async () => {}).checkPages('duplicate'), /appears only once/);
  const locked = new PagingPage(newGame(11));
  locked.root.querySelector('[data-option="start:self"]')!.disabled = true;
  await assert.rejects(pagingChecks(locked, async () => {}).checkPages('locked'), /matches the engine/);
});

test('life layout allows presentation ordering and confirms quit before acknowledging its result', async () => {
  const state = choose(newGame(11), 'start:school').state;
  state.status = 'working'; state.track = 'service'; state.job.tracks = ['service'];
  state.job.tenure = state.job.total = 4; state.s.xp = 100;
  state.board.pos = WORLD.find(node => node.map === 'A' && node.kind === 'rankup')!.id;
  state.board.step = 'space'; state.board.dice = [1, 1];
  const page = new PagingPage(state), checked: string[] = [];
  assert.deepEqual(page.visible().map(option => option.id), ['promo', 'skip', 'quit']);
  assert.notDeepEqual(page.visible().map(option => option.id), options(state).map(option => option.id));
  const { checkPages, clickChoice } = pagingChecks(page, async (name: string) => { checked.push(name); });
  await checkPages('rankup'); await clickChoice('quit');
  assert.ok(checked.includes('quit confirmation')); assert.ok(checked.includes('after quit result 1'));
  assert.deepEqual(page.state, choose(state, 'quit').state);
  assert.notEqual(panelAt(page.root)?.dataset.popup, 'result');
});

test('life layout audits rolled results and resumes the next choices without repeating the action', async () => {
  const state = choose(newGame(11), 'start:school').state;
  state.phase = 'event'; state.eventId = EVENTS[0].id; state.board.step = 'space'; state.board.dice = [1, 1];
  const id = options(state).find(option => option.enabled && option.roll)!.id, expected = choose(state, id);
  const page = new PagingPage(state), rolls: string[] = [];
  const { checkPages, clickChoice } = pagingChecks(page, async () => {
    const roll = page.root.querySelector('[data-result-wheel]'); if (roll) rolls.push(roll.textContent);
  });
  await clickChoice(id);
  assert.deepEqual(rolls, [String(expected.result.roll!.value)]);
  assert.deepEqual(page.state, expected.state);
  assert.equal(panelAt(page.root), undefined);
  await checkPages('next season');
  assert.deepEqual(page.state, expected.state);
  assert.equal(page.state.turn, 1); assert.notEqual(panelAt(page.root)?.dataset.popup, 'result');
});

test('life layout fixtures restore, page every option, and finish a season on all six maps', async () => {
  const startPage = new PagingPage(newGame(11));
  const startChecks = pagingChecks(startPage, async () => {});
  await startChecks.checkPages('start choices');
  assert.equal(startPage.index, 0, 'all three start choices fit on one popup page');
  await assert.rejects(startChecks.clickChoice('spin'), /spin is enabled/);
  await startChecks.clickChoice('start:school');
  const started = choose(newGame(11), 'start:school').state;
  assert.deepEqual(startPage.state, started, 'start choice calls the engine');
  assert.equal(startPage.index, 0);
  await startChecks.checkPages('ready to spin');
  for (const map of Object.keys(MAPS)) {
    const run = structuredClone(started); run.board.pos = `${map}-o0`;
    assert.deepEqual(restore(run), run);
    const page = new PagingPage(run);
    const { checkPages, clickChoice } = pagingChecks(page, async () => {});
    await checkPages(`${map} spin`);
    await clickChoice('spin');
    let expected = choose(run, 'spin').state;
    assert.deepEqual(page.state, expected);
    await checkPages(`${map} after spin`);
    if (expected.board.step === 'pick') {
      const id = options(expected).filter(option => option.enabled).at(-1)!.id;
      await clickChoice(id); expected = choose(expected, id).state;
      assert.deepEqual(page.state, expected);
    }
    for (let step = 0; expected.turn === 0 && step < 8; step++) {
      await checkPages(`${map} season`);
      const offered = options(expected).filter(option => option.enabled);
      const id = (offered.find(option => option.id === 'end' || option.id === 'skip') ?? offered.at(-1))!.id;
      await clickChoice(id); expected = choose(expected, id).state;
      assert.deepEqual(page.state, expected);
    }
    assert.equal(expected.turn, 1);
    for (const step of ['pick', 'space', 'bonus'] as const) {
      const fixture = structuredClone(started);
      fixture.board.pos = step === 'pick' ? `${map}-o0` : WORLD.find(node => node.map === map && node.kind === 'train')!.id;
      fixture.board.step = step; fixture.board.dice = step === 'pick' ? [6, 6] : [1, 1];
      assert.deepEqual(restore(fixture), fixture);
      await pagingChecks(new PagingPage(fixture), async () => {}).checkPages(`${map} ${step}`);
    }
  }
  const event = structuredClone(started); event.phase = 'event'; event.eventId = EVENTS[0].id;
  event.board.step = 'space'; event.board.dice = [1, 1];
  assert.deepEqual(restore(event), event);
  const checks = pagingChecks(new PagingPage(event), async () => {});
  await checks.checkPages('event'); await checks.checkPages('event again');
});

test('bottom navigation highlights only the open menu and clears on dismissal', () => {
  const page = new PagingPage(choose(newGame(11), 'start:school').state);
  const selected = () => ['life', 'phone'].filter(nav => page.root.querySelector(`[data-nav="${nav}"]`)!.getAttribute('aria-pressed') === 'true');
  assert.deepEqual(selected(), []);
  page.inDOM(() => page.root.querySelector('[data-nav="life"]')!.fire('click'));
  assert.deepEqual(selected(), ['life']);
  page.inDOM(() => page.root.querySelector('[data-nav="phone"]')!.fire('click'));
  assert.deepEqual(selected(), ['phone']);
  page.inDOM(() => action(page.root, 'popup-close').fire('click'));
  assert.deepEqual(selected(), []);
});
