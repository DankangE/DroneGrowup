import assert from 'node:assert/strict';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
import { choose, newGame, options } from '../src/life/flow.ts';
import type { GameState } from '../src/life/types.ts';
import { WORLD } from '../src/life/world.ts';
import { mountLife } from '../src/ui2/app.ts';
import { groundPoint, TILT, uprightTile } from '../src/ui2/board.ts';
import { COPY } from '../src/ui2/popups/data.ts';
import { mountPopup, popupModel } from '../src/ui2/popups/index.ts';
import { POLISH as P } from '../src/ui2/popups/polish-data.ts';
import { statChanges } from '../src/ui2/popups/polish-model.ts';
import { resultPopups } from '../src/ui2/popups/presentation.ts';
import { action, panelAt, TestNode, textOf, withDOM } from './life-popup2-dom-helper.ts';

const { SIZES } = await import(new URL('../scripts/life-check-data.mjs', import.meta.url).href);
const { audit } = await import(new URL('../scripts/layout-check-life.mjs', import.meta.url).href);
const started = () => choose(newGame(11), 'start:school').state;
function bonus(pos = 'A-o1') {
  const state = started(); state.board.pos = pos; state.board.step = 'bonus'; state.board.dice = [1, 1]; return state;
}

// Geometry doubles only select the compact presentation; the PM's browser audit
// measures actual pixels, scrolling, occlusion and native keyboard hit targets.
function app(run: (root: TestNode, api: NonNullable<Window['__life']>) => void) {
  withDOM(() => {
    const previous = Object.getOwnPropertyDescriptor(globalThis, 'window');
    const bounds = Object.getOwnPropertyDescriptor(TestNode.prototype, 'getBoundingClientRect');
    const browser = { innerWidth: 500, innerHeight: 679,
      matchMedia: () => ({ matches: true, addEventListener() {} }) } as unknown as Window;
    Object.defineProperty(globalThis, 'window', { configurable: true, value: browser });
    Object.defineProperty(TestNode.prototype, 'getBoundingClientRect', { configurable: true, value(this: TestNode) {
      if (this.className.includes('life2-hud')) return { top: 6, bottom: 66 };
      if (this.className.includes('life2-bottom')) return { top: 625, bottom: 669 };
      if (this.attributes['aria-current']) return { top: 320, bottom: 370 };
      return { top: 375, bottom: 620, height: 245 };
    } });
    try { const root = new TestNode('main'); mountLife(root.element(), 11, true); run(root, browser.__life!); }
    finally {
      if (previous) Object.defineProperty(globalThis, 'window', previous); else Reflect.deleteProperty(globalThis, 'window');
      if (bounds) Object.defineProperty(TestNode.prototype, 'getBoundingClientRect', bounds);
      else Reflect.deleteProperty(TestNode.prototype, 'getBoundingClientRect');
    }
  });
}

test('T25: layout covers all four PC sizes and rejects clipping or offscreen turn controls', () => {
  for (const size of [[1920, 1080], [1536, 864], [1366, 768], [1280, 800]]) {
    assert.ok(SIZES.some((row: number[]) => row.join() === size.join()));
  }
  const box = (top: number, bottom: number) => ({ top, bottom, left: 0, right: 1280, width: 1280, height: bottom - top });
  const nodes = new Map([
    ['.life2-board-frame', box(0, 800)], ['.life2-hud', box(6, 66)], ['.life2-board', { ...box(72, 509), right: 896, width: 896 }], ['.life2-options', box(515, 619)],
    ['.life2-bottom', box(625, 669)], ['.life2-bottom .life2-wheel', box(625, 669)],
    ['[data-action=end-season]', box(625, 669)],
  ].map(([key, rect]) => [key, { getBoundingClientRect: () => rect, checkVisibility: () => true }]));
  const root = { tagName: 'DIV', getAttribute: () => 'life2', getBoundingClientRect: () => box(0, 800),
    checkVisibility: () => true, closest: () => null, matches: () => false, childNodes: [], parentElement: null,
    scrollWidth: 1280, clientWidth: 1280, scrollHeight: 800, clientHeight: 800 };
  const context = { innerWidth: 1280, innerHeight: 800,
    getComputedStyle: () => ({ overflowX: 'hidden', overflowY: 'hidden' }), document: {
    scrollingElement: { scrollWidth: 1280, scrollHeight: 800 },
    querySelector: (selector: string) => nodes.get(selector),
    querySelectorAll: (selector: string) => selector === '#app, #app *' ? [root] : [],
  } };
  const check = () => Array.from(runInNewContext(`(${audit.toString()})()`, context));
  assert.deepEqual(check(), []);
  // An overflow-hidden app can conceal overflowing text without document scroll
  // or an offscreen button. Keep rejecting that independently of viewport boxes.
  root.scrollHeight = 900;
  assert.ok(check().includes('DIV.life2: content clipped'));
  root.scrollHeight = 800;
  for (const selector of ['.life2-bottom', '.life2-bottom .life2-wheel', '[data-action=end-season]']) {
    const old = nodes.get(selector)!;
    nodes.set(selector, { ...old, getBoundingClientRect: () => box(780, 824) });
    assert.ok(check().includes(`${selector}: not fully inside viewport`)); nodes.set(selector, old);
  }
});

test('T25: projected paths stay on the ground and meet upright tile centers at the stronger tilt', () => {
  const angle = TILT.degrees * Math.PI / 180, sin = Math.sin(angle), cos = Math.cos(angle);
  assert.ok(TILT.degrees > 28);
  for (const cell of [44, 48, 72]) for (let row = -4; row <= 4; row++) for (let col = -3; col <= 3; col++) {
    const x = col * (cell + 2), y = row * (cell + 2), path = groundPoint(x, y);
    const projection = 1 / (1 - path.y * sin / TILT.perspective);
    assert.ok(Math.abs(path.x * projection - x) < 1e-9);
    assert.ok(Math.abs(path.y * cos * projection - y) < 1e-9);
    const tile = uprightTile(x, y, cell);
    assert.ok(tile.dz - cell / 2 * tile.scale * sin > 0, 'even the lowest tile corner is above every ground path');
  }
});

for (const mode of ['open', 'closed', 'my-life', 'phone'] as const) {
  test(`T25: permanent end uses the engine from ${mode}, independently of compact choice paging`, () => app((root, api) => {
    const state = bonus(); api.load(state);
    assert.equal(panelAt(root).dataset.compact, '');
    let pages = 0;
    do {
      assert.ok(action(root, 'end-season')); pages++;
      const next = action(root, 'popup-page-next'); if (next.disabled) break; next.fire('click');
    } while (pages < 20);
    assert.equal(pages, options(state).length);
    action(root, 'popup-close').fire('click');
    assert.ok(action(root, 'popup-reopen')); assert.ok(action(root, 'end-season'));
    action(root, 'popup-reopen').fire('click'); assert.equal(panelAt(root).dataset.popup, 'bonus');
    if (mode === 'closed') action(root, 'popup-close').fire('click');
    if (mode === 'my-life' || mode === 'phone') root.querySelector(`[data-nav=${mode === 'my-life' ? 'life' : 'phone'}]`)!.fire('click');
    action(root, 'end-season').fire('click');
    assert.deepEqual(api.state(), choose(state, 'end').state);
    assert.equal(action(root, 'end-season'), undefined);
  }));
}

test('T25: end remains usable over a completed result; a pending exclusive job choice must still resolve', () => app((root, api) => {
  const state = bonus(); state.board.step = 'space'; api.load(state);
  root.querySelector('[data-option="act:st_theory"]')!.fire('click');
  assert.equal(panelAt(root).dataset.popup, 'result');
  const before = api.state(); assert.ok(options(before).some(option => option.id === 'end'));
  action(root, 'end-season').fire('click'); assert.deepEqual(api.state(), choose(before, 'end').state);
  const job = bonus(WORLD.find(node => node.map === 'A' && node.kind === 'jobfair')!.id);
  job.board.step = 'space'; api.load(job);
  assert.equal(panelAt(root).dataset.popup, 'job'); assert.equal(action(root, 'end-season'), undefined);
  action(root, 'popup-close').fire('click'); assert.ok(action(root, 'popup-reopen'));
  action(root, 'popup-reopen').fire('click'); assert.equal(panelAt(root).dataset.popup, 'job');
  assert.deepEqual(api.state(), job);
}));

test('T25: accounting copy distinguishes accrual from payment and renders its own heading', () => {
  const before = bonus(), closed = choose(before, 'end');
  assert.equal(closed.state.s.money, 500);
  assert.deepEqual(closed.state.board.ledger, { 용돈: 80, 등록금: -50, 생활비: -25 });
  const model = resultPopups(before, closed.state, closed.result)[0];
  assert.equal(model.accounting![0].title, P.ledger); assert.equal(model.accounting![0].timing, P.accrued);
  assert.deepEqual(model.accounting![0].rows.map(row => row.value), ['80만', '-50만', '-25만']);
  withDOM(() => {
    const host = new TestNode('div'); mountPopup(host.element(), model, { choose() { assert.fail(); }, dismiss() {} });
    assert.equal(host.querySelector('h3')!.textContent, P.ledger);
    assert.ok(textOf(host).includes(P.accrued));
  });
  const pick = structuredClone(closed.state); pick.board.pos = 'A-o10'; pick.board.step = 'pick'; pick.board.dice = [2, 2];
  const paid = choose(pick, 'go:A-o12'); assert.equal(paid.state.s.money, 505);
  const paidModel = popupModel(paid.state, { kind: 'result', offered: [], result: paid.result })!;
  assert.equal(paidModel.accounting![0].title, P.record); assert.equal(paidModel.accounting![0].timing, P.paid);
});

test('T25: grade points, period units and actual stamina cost/recovery are explicit without changing rules', () => {
  const before = bonus('A-o2'), after = structuredClone(before); after.s.skill = 10;
  assert.equal(statChanges(before, after).find(row => row.stat === 'skill')!.value, 'G등급 · 점수 0 → 10');
  assert.equal(P.remaining(64), '이 시기 64개 계절 남음');
  const option = options(before).find(row => row.id === 'act:st_parttime')!;
  const outcome = choose(before, option.id);
  assert.equal(option.tire, 40); assert.equal(outcome.result.deltas.stamina, -40); assert.equal(outcome.result.season!.refill, 20);
  assert.equal(outcome.state.s.stamina, 80);
  const row = resultPopups(before, outcome.state, outcome.result)[0].rows!.find(row => row.stat === 'stamina')!;
  assert.equal(row.value, '100 → 80 (행동 -40, 계절 회복 +20)');
});

test('T25: abilities show eleven rows at once when space allows; compact pages group rows and retain destination guidance', () => {
  withDOM(() => {
    const host = new TestNode('div');
    mountPopup(host.element(), popupModel(started(), { kind: 'my-life', offered: [] })!, { choose() {}, dismiss() {} });
    assert.equal(host.querySelectorAll('dd').length, 11); assert.equal(action(host, 'popup-text-next'), undefined);
  });
  app((root, api) => {
    api.load(started()); root.querySelector('[data-nav=life]')!.fire('click');
    assert.equal(root.querySelectorAll('dd').length, 3); assert.ok(action(root, 'popup-text-next'));
    const state: GameState = started(); state.board.step = 'pick'; state.board.dice = [6, 6]; api.load(state);
    const prompt = root.querySelector('[data-pick-prompt]')!; assert.equal(prompt.textContent, COPY.pickDestination);
    root.querySelector('[data-space][data-dest]')!.fire('focus');
    assert.equal(root.querySelector('.life2-options')!.querySelector('h2')!.textContent, COPY.pickDestination);
    assert.deepEqual(api.state(), state);
  });
});
