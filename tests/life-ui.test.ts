import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
import { choose, newGame, options, restore } from '../src/life/engine.ts';
import { EVENTS } from '../src/life/compat.ts';
import type { GameState } from '../src/life/types.ts';
import { MAPS, WORLD } from '../src/life/world.ts';
import { GRID, gridCell } from '../src/ui2/board.ts';

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

// Exercise the real check helpers without starting Vite or Chromium. This narrow
// page double delays each render until waitForFunction, catching stale-page reads.
const { pagingChecks } = await import(new URL('../scripts/layout-check-life.mjs', import.meta.url).href);
type TestPanel = { isConnected: boolean; dispose: () => Promise<void> };
type TestOption = { dataset: { option: string }; disabled: boolean };
const panel = (): TestPanel => ({ isConnected: true, dispose: async () => {} });
class PagingPage {
  state: GameState;
  index = 0;
  currentPanel = panel();
  pending?: () => void;
  constructor(state: GameState) { this.state = structuredClone(state); }
  visible() { return options(this.state).filter(option => option.id !== 'spin').slice(this.index * 2, (this.index + 1) * 2); }
  async evaluate(fn: () => unknown) {
    return structuredClone(runInNewContext(`(${fn.toString()})()`, { window: { __life: { options: () => options(this.state) } } }));
  }
  async waitForFunction(fn: (oldPanel: TestPanel) => boolean, oldPanel: TestPanel) {
    assert.ok(this.pending, 'a click scheduled a render');
    this.pending(); this.pending = undefined;
    assert.equal(fn(oldPanel), true, 'waits for the old panel to detach');
  }
  locator(selector: string) {
    const direction = selector === '.life2-pager [data-action="page-prev"]' ? -1
      : selector === '.life2-pager [data-action="page-next"]' ? 1 : 0;
    const id = /\[data-option="([^"]+)"\]/.exec(selector)?.[1];
    assert.ok(direction || selector === '.life2-options' ||
      /^\.life2-(option-list|bottom) \[data-option(?:="[^"]+")?\]$/.test(selector), selector);
    const nodes = (): TestOption[] => {
      const offered = selector.startsWith('.life2-bottom') ? options(this.state).filter(option => option.id === 'spin') : this.visible();
      return offered.filter(option => !id || option.id === id).map(option => ({ dataset: { option: option.id }, disabled: !option.enabled }));
    };
    const disabled = () => direction === -1 ? this.index === 0 : direction === 1
      ? (this.index + 1) * 2 >= options(this.state).filter(option => option.id !== 'spin').length
      : nodes()[0]?.disabled;
    return {
      isEnabled: async () => !disabled(),
      isDisabled: async () => disabled(),
      count: async () => nodes().length,
      evaluateAll: async (fn: (nodes: TestOption[]) => unknown) => fn(nodes()),
      elementHandle: async () => { assert.equal(selector, '.life2-options'); return this.currentPanel; },
      click: async () => {
        assert.equal(disabled(), false, `${selector} is enabled`);
        assert.equal(this.pending, undefined, 'the last render was awaited');
        this.pending = () => {
          if (direction) this.index += direction;
          else { assert.ok(id); this.state = choose(this.state, id).state; this.index = 0; }
          this.currentPanel.isConnected = false;
          this.currentPanel = panel();
        };
      },
    };
  }
}

test('life layout paging can audit the same four-option state twice from the last page', async () => {
  const state = choose(newGame(11), 'spin').state;
  state.s.money = 0;
  assert.deepEqual(options(state).map(option => option.id), ['act:st_theory', 'act:st_sim', 'act:st_flight', 'skip']);
  assert.ok(options(state).some(option => !option.enabled), 'the fixture includes disabled options');
  const page = new PagingPage(state), seen: string[][] = [];
  const { checkPages } = pagingChecks(page, async () => { seen.push(page.visible().map(option => option.id)); });
  await checkPages('after spin');
  assert.equal(page.index, 1);
  await checkPages('same season');
  assert.deepEqual(seen, [
    ['act:st_theory', 'act:st_sim'], ['act:st_flight', 'skip'],
    ['act:st_theory', 'act:st_sim'], ['act:st_flight', 'skip'],
  ]);
  assert.deepEqual(page.state, state, 'paging never changes the game');
});

test('life layout choice lookup rewinds to an earlier page and waits for the resulting state', async () => {
  const state = choose(newGame(11), 'spin').state;
  state.s.money = 0;
  const page = new PagingPage(state);
  const { checkPages, clickChoice } = pagingChecks(page, async () => {});
  await checkPages('before choice');
  await assert.rejects(clickChoice('act:st_sim'), /is enabled/);
  await clickChoice('act:st_theory');
  assert.deepEqual(page.state, choose(state, 'act:st_theory').state);
  assert.equal(page.index, 0);
  assert.equal(page.pending, undefined);
});

test('life layout fixtures restore, page every option, and finish a season on all six maps', async () => {
  for (const map of Object.keys(MAPS)) {
    const run = newGame(11); run.board.pos = `${map}-o0`;
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
      const fixture = newGame(11);
      fixture.board.pos = step === 'pick' ? `${map}-o0` : WORLD.find(node => node.map === map && node.kind === 'train')!.id;
      fixture.board.step = step; fixture.board.dice = step === 'pick' ? [6, 6] : [1, 1];
      assert.deepEqual(restore(fixture), fixture);
      await pagingChecks(new PagingPage(fixture), async () => {}).checkPages(`${map} ${step}`);
    }
  }
  const event = newGame(11); event.phase = 'event'; event.eventId = EVENTS[0].id;
  event.board.step = 'space'; event.board.dice = [1, 1];
  assert.deepEqual(restore(event), event);
  const checks = pagingChecks(new PagingPage(event), async () => {});
  await checks.checkPages('event'); await checks.checkPages('event again');
});
