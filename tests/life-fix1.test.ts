import assert from 'node:assert/strict';
import test from 'node:test';
import { grade, GRADED_STATS } from '../src/game/career.ts';
import { choose, currentEvent, forecast, newGame, options, reachable } from '../src/life/engine.ts';
import { EVENTS } from '../src/life/compat.ts';
import { MAPS, WORLD } from '../src/life/world.ts';
import { mountLife } from '../src/ui2/app.ts';
import { hud } from '../src/ui2/hud.ts';
import { derived } from '../src/life/engine.ts';
import { destinationDetails, PICK_STYLE } from '../src/ui2/pick.ts';
import { COPY } from '../src/ui2/popups/data.ts';
import { popupModel } from '../src/ui2/popups/model.ts';
import { action, controls, panelAt, TestNode, textOf, visible, withDOM } from './life-popup2-dom-helper.ts';

const started = () => choose(newGame(11), 'start:school').state;
function working(kind: 'rankup' | 'jobfair' = 'rankup') {
  const state = started(); state.status = 'working'; state.track = 'service';
  state.job.tracks = ['service']; state.job.tenure = state.job.total = 4; state.s.xp = 100;
  state.board.pos = WORLD.find(node => node.map === 'A' && node.kind === kind)!.id;
  state.board.step = 'space'; state.board.dice = [1, 1]; return state;
}
function app(run: (root: TestNode, api: NonNullable<Window['__life']>) => void) {
  withDOM(() => {
    const original = Object.getOwnPropertyDescriptor(globalThis, 'window');
    const browser = { matchMedia: () => ({ matches: true, addEventListener() {} }) } as unknown as Window;
    Object.defineProperty(globalThis, 'window', { configurable: true, value: browser });
    try {
      const root = new TestNode('main'); mountLife(root.element(), 11, true); run(root, browser.__life!);
    } finally {
      if (original) Object.defineProperty(globalThis, 'window', original); else Reflect.deleteProperty(globalThis, 'window');
    }
  });
}
function click(root: TestNode, id: string) {
  for (let page = 0; page < 30; page++) {
    const choice = visible(root).find(node => node.dataset.option === id);
    if (choice) { assert.equal(choice.disabled, false, id); choice.fire('click'); return; }
    const next = action(root, 'popup-page-next') ?? action(root, 'page-next');
    assert.ok(next && !next.disabled, `${id} has a reachable page`); next.fire('click');
  }
  assert.fail(`unreachable option ${id}`);
}
function readCopy(root: TestNode) {
  let copy = '';
  for (let page = 0; page < 100; page++) {
    copy += root.querySelector('.life2-popup-copy')!.querySelector('p')!.textContent;
    const next = action(root, 'popup-text-next');
    if (!next || next.textContent.split(' / ')[0] === next.textContent.split(' / ')[1]) return copy;
    next.fire('click');
  }
  assert.fail('text pages terminate');
}
const close = (root: TestNode) => action(root, 'popup-close').fire('click');

test('F1 actual app mounts all three start choices, neutral identity, and shared stat grades', () => app((root, api) => {
  assert.equal(panelAt(root).dataset.popup, 'start');
  assert.deepEqual(visible(root).map(node => node.dataset.option), ['start:school', 'start:work', 'start:self']);
  const top = root.querySelector('.life2-hud')!;
  assert.match(textOf(top), /진로 선택 전/); assert.doesNotMatch(textOf(top), /드론학과 학생/);
  assert.deepEqual(top.querySelectorAll('[data-grade]').map(node => node.dataset.grade), GRADED_STATS);
  for (const cell of top.querySelectorAll('[data-grade]')) {
    const stat = cell.dataset.grade as typeof GRADED_STATS[number];
    assert.ok(cell.textContent.endsWith(grade(stat, api.state().s[stat])!.letter));
  }
  click(root, 'start:self'); assert.deepEqual(api.state(), choose(newGame(11), 'start:self').state);
  assert.equal(panelAt(root).dataset.popup, 'result'); close(root);
  assert.match(textOf(root.querySelector('.life2-hud')!), /구직/);
}));

test('F1 an unresolved popup can close and reopen without choosing or consuming RNG', () => app((root, api) => {
  const before = api.state(); close(root);
  assert.equal(panelAt(root), undefined); assert.deepEqual(api.state(), before);
  action(root, 'popup-reopen').fire('click'); assert.equal(panelAt(root).dataset.popup, 'start');
  assert.deepEqual(api.state(), before);
}));

test('F1 tile descriptions and forecast branches are readable through real mounted detail pages', () => app((root, api) => {
  const state = choose(started(), 'spin').state; api.load(state);
  assert.equal(panelAt(root).dataset.popup, 'space');
  const option = options(state)[0], preview = forecast(state, option.id);
  assert.equal(visible(root)[0].querySelector('small')!.textContent, COPY.cost(preview.cost, preview.tire, preview.chance));
  action(root, 'popup-details').fire('click');
  const text = readCopy(root); assert.ok(text.includes(option.desc));
  for (const branch of preview.branches) assert.ok(text.includes(`${COPY.expected} · ${COPY[branch.id]}`));
  action(root, 'popup-back').fire('click');
  assert.equal(visible(root)[0].dataset.option, option.id); assert.deepEqual(api.state(), state);
}));

test('F1 actual event story, responses and roll result remain readable before continuing', () => app((root, api) => {
  const state = started(); state.phase = 'event'; state.eventId = EVENTS[0].id;
  state.board.step = 'space'; state.board.dice = [1, 1]; api.load(state);
  assert.equal(panelAt(root).dataset.popup, 'event'); assert.ok(readCopy(root).includes(currentEvent(state)!.text));
  const option = options(state).find(row => row.enabled && row.roll)!; assert.ok(option);
  const expected = choose(state, option.id); click(root, option.id);
  assert.equal(root.dataset.phase, 'result'); assert.equal(panelAt(root).dataset.popup, 'result');
  assert.equal(root.querySelector('[data-result-wheel]')!.textContent, String(expected.result.roll!.value));
  assert.ok(readCopy(root).includes(expected.result.text)); assert.deepEqual(api.state(), expected.state);
  close(root); assert.equal(panelAt(root).dataset.popup, 'bonus');
}));

test('F1 deterministic results display choose().result and dismissal never applies it twice', () => app((root, api) => {
  const expected = choose(newGame(11), 'start:school'); click(root, 'start:school');
  assert.equal(panelAt(root).dataset.notification, ''); assert.ok(readCopy(root).includes(expected.result.text));
  assert.equal(root.querySelector('[data-result-wheel]'), undefined); close(root);
  assert.deepEqual(api.state(), expected.state); assert.equal(root.dataset.phase, 'spin');
  api.load(newGame(42)); assert.equal(panelAt(root).dataset.popup, 'start');
}));

test('F1 rankup orders promotion, skip and quit on one page without changing engine choices', () => app((root, api) => {
  const state = working(), offered = options(state); api.load(state);
  assert.deepEqual(visible(root).map(node => node.dataset.option), ['promo', 'skip', 'quit']);
  assert.equal(action(root, 'popup-page-next').disabled, true);
  assert.deepEqual(api.options(), offered); assert.deepEqual(api.state(), state);
  const locked = working(); locked.s.xp = 0; api.load(locked);
  assert.equal(visible(root)[0].dataset.option, 'promo'); assert.equal(visible(root)[0].disabled, true);
  assert.equal(visible(root)[1].disabled, false, 'skip remains enabled when promotion is locked');
}));

for (const kind of ['rankup', 'jobfair'] as const) test(`F1 ${kind} quitting requires confirmation; cancel, Escape and exit are harmless`, () => app((root, api) => {
  const state = working(kind); api.load(state);
  click(root, 'quit'); assert.equal(panelAt(root).dataset.confirm, 'quit'); assert.deepEqual(api.state(), state);
  assert.match(textOf(panelAt(root)), /퇴사하고 구직자가 될까요/);
  action(root, 'popup-cancel').fire('click'); assert.deepEqual(api.state(), state);
  click(root, 'quit'); panelAt(root).fire('keydown', 'Escape'); assert.deepEqual(api.state(), state);
  assert.equal(panelAt(root).dataset.confirm, undefined);
  click(root, 'quit'); close(root); assert.deepEqual(api.state(), state);
  action(root, 'popup-reopen').fire('click'); click(root, 'quit'); action(root, 'popup-confirm').fire('click');
  assert.deepEqual(api.state(), choose(state, 'quit').state); assert.equal(panelAt(root).dataset.popup, 'result');
}));

test('F1 pick uses career-aware engine paths, marks review stops and lands at that stop', () => app((root, api) => {
  const state = working(), rankup = state.board.pos;
  state.board.pos = WORLD.find(node => node.map === 'A' && node.next.includes(rankup))!.id;
  state.board.step = 'pick'; state.board.dice = [4, 4]; api.load(state);
  const move = reachable(state).find(row => row.stop === rankup)!; assert.ok(move);
  const tile = root.querySelector(`[data-space="${move.node}"][data-dest]`)!;
  assert.equal(tile.dataset.reviewStop, rankup); assert.match(tile.attributes['aria-label'], /심사 정차/);
  tile.fire('click'); assert.deepEqual(api.state(), choose(state, `go:${move.node}`).state);
  assert.equal(api.state().board.pos, rankup); assert.equal(visible(root)[0].dataset.option, 'promo');
}));

test('F1 destination labels retain kind, omit zero tolls, and preview stays below opaque tiles', () => app((root, api) => {
  const state = choose(choose(newGame(1), 'start:school').state, 'spin').state; api.load(state);
  for (const move of reachable(state)) {
    const tile = root.querySelector(`[data-space="${move.node}"][data-dest]`)!;
    assert.match(tile.querySelector('.life2-tile-label')!.textContent, /\S+ \d/);
    assert.ok(!destinationDetails(move).includes('통행료 0만'));
    assert.ok(!tile.attributes['aria-label'].includes('통행료 0만'));
  }
  assert.match(PICK_STYLE, /\.life2-tile \{ z-index:1/);
  assert.match(PICK_STYLE, /\.life2-preview \{[^}]*z-index:0/);
  assert.ok(root.querySelector('[data-path-preview]')!.querySelectorAll('line').length > 0);
}));

test('F1 T21 new place art and job portraits are reachable from real tile and job popups', () => app((root, api) => {
  const state = started(); state.board.pos = WORLD.find(node => node.kind === 'station')!.id; state.board.step = 'space'; state.board.dice = [1, 1]; api.load(state);
  assert.ok(root.querySelector('[data-place-art]')); assert.equal(panelAt(root).dataset.popup, 'transfer');
  api.load(working('jobfair'));
  assert.equal(panelAt(root).dataset.popup, 'job'); assert.equal(root.querySelector('[data-job-portrait]')!.dataset.jobPortrait, 'service');
}));

test('F1 phone and my-life navigation mount T19 views and use engine service forecasts', () => app((root, api) => {
  api.load(started()); controls(root).find(node => node.dataset.nav === 'phone')!.fire('click');
  assert.equal(panelAt(root).dataset.popup, 'phone');
  assert.deepEqual(controls(root).filter(node => node.dataset.tab).map(node => node.dataset.tab), ['all', 'shop', 'repair', 'bank', 'retire']);
  const before = api.state(), service = options(before, 'phone').find(row => row.id === 'loan:100')!;
  click(root, service.id); assert.deepEqual(api.state(), choose(before, service.id).state);
  close(root); assert.equal(panelAt(root).dataset.popup, 'phone'); close(root);
  controls(root).find(node => node.dataset.nav === 'life')!.fire('click');
  assert.equal(panelAt(root).dataset.popup, 'my-life');
  assert.deepEqual(controls(root).filter(node => node.dataset.tab).map(node => node.dataset.tab), ['ability', 'career', 'family', 'assets', 'records']);
}));

test('F1 popup choices and Escape result exits finish a season on all six maps', () => app((root, api) => {
  for (const map of Object.keys(MAPS)) {
    const state = started(); state.board.pos = `${map}-o0`; api.load(state); click(root, 'spin');
    for (let step = 0; api.state().turn === 0 && step < 12; step++) {
      if (panelAt(root)?.dataset.popup === 'result') { panelAt(root).fire('keydown', 'Escape'); continue; }
      const offered = api.options().filter(row => row.enabled);
      const id = (offered.find(row => row.id === 'skip' || row.id === 'end') ?? offered[0]).id;
      const expected = choose(api.state(), id).state; click(root, id); assert.deepEqual(api.state(), expected);
    }
    assert.equal(api.state().turn, 1, map);
  }
}));

test('F1 roulette wording is consistent in engine text and accessible HUD output', () => withDOM(() => {
  const state = started(), spin = options(state).find(row => row.id === 'spin')!;
  for (const text of [spin.title, spin.desc, choose(state, 'spin').result.text]) {
    assert.match(text, /룰렛/); assert.doesNotMatch(text, /주사위/);
  }
  const bands = hud(state, derived(state), [], () => {});
  assert.match((bands.bottom as unknown as TestNode).querySelector('output')!.attributes['aria-label'], /룰렛/);
  assert.equal(popupModel(newGame(11))!.choices.length, 3);
}));
