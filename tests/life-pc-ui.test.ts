import { runInNewContext } from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';
import { choose, newGame, options } from '../src/life/engine.ts';
import { mountPopup, phoneChoices, popupModel } from '../src/ui2/popups/index.ts';
import { careerRows } from '../src/ui2/popups/polish-model.ts';
import { POLISH as P } from '../src/ui2/popups/polish-data.ts';
import { action, controls, dom, panelAt, TestNode, textOf, visible, withDOM } from './life-popup2-dom-helper.ts';

test('single-page phone tabs omit the pager and wrap Tab to a visible control', () => withDOM(() => {
  const state = choose(newGame(1), 'start:self').state;
  const model = popupModel(state, { kind: 'phone', offered: phoneChoices(options(state, 'phone'), 'repair'), lines: [] })!;
  const host = new TestNode('div');
  mountPopup(host.element(), model, { choose() { assert.fail('focus must not choose'); }, dismiss() {}, phoneTab: () => model });
  assert.equal(action(host, 'popup-page-next'), undefined);
  const enabled = controls(host).filter(control => !control.disabled), panel = panelAt(host);
  assert.equal(enabled[0], action(host, 'popup-close'));
  assert.equal(panel.fire('keydown', 'Tab', true), true);
  assert.equal(dom.activeElement, enabled.at(-1));
  assert.equal(panel.fire('keydown', 'Tab'), true);
  assert.equal(dom.activeElement, action(host, 'popup-close'));
  assert.equal(panel.fire('keydown', 'Tab'), false, 'normal Tab can advance past close');
  assert.equal(panel.fire('keydown', 'Tab', true), true);
  assert.equal(dom.activeElement, enabled.at(-1));
}));

test('cashless phone shop has a keyboard entry point and every locked row can be inspected without activation', () => withDOM(() => {
  const state = choose(newGame(1), 'start:self').state; state.s.money = 0;
  const offered = phoneChoices(options(state, 'phone'), 'shop');
  assert.ok(offered.length > 1 && offered.every(option => !option.enabled));
  const host = new TestNode('div'), taken: string[] = [];
  mountPopup(host.element(), popupModel(state, { kind: 'phone', offered })!, { choose: id => taken.push(id), dismiss() {} });
  const list = host.querySelector('.life2-popup-list')!, rows = visible(host);
  assert.equal(list.getAttribute('tabindex'), '0');
  list.focus(); assert.equal(dom.activeElement, list);
  for (let i = 0; i < rows.length; i++) {
    assert.equal(list.fire('keydown', i ? 'ArrowDown' : 'Home'), true);
    const row = rows[i];
    assert.equal(row.getAttribute('aria-current'), 'true');
    assert.equal(dom.activeElement, row.parentElement);
    assert.equal(host.querySelector('h3')!.textContent, offered[i].title);
    assert.ok(offered[i].locks.every(lock => textOf(host.querySelector('.life2-choice-detail')!).includes(lock)));
    assert.equal(row.disabled, true);
    row.fire('keydown', 'Enter'); row.fire('keydown', ' '); row.fire('click');
    dom.activeElement.fire('keydown', 'Enter'); dom.activeElement.fire('keydown', ' ');
  }
  list.fire('keydown', 'End'); assert.equal(rows.at(-1)!.getAttribute('aria-current'), 'true');
  list.fire('keydown', 'ArrowUp'); assert.equal(rows.at(-2)!.getAttribute('aria-current'), 'true');
  list.fire('keydown', 'Home'); assert.equal(rows[0].getAttribute('aria-current'), 'true');
  assert.deepEqual(taken, []);
}));

test('retirement without a career uses the existing no-career description for the current rank', () => {
  const state = newGame(11); state.status = 'retired';
  assert.equal(state.track, null);
  assert.equal(careerRows(state).find(row => row.label === P.current)!.value, P.noCareer);
  assert.ok(!careerRows(state).some(row => row.value === P.retirement));
});

test('PC hover and arrow selection update details, include locked rows, and dispatch only on activation', () => withDOM(() => {
  const state = choose(newGame(1), 'start:school').state;
  const base = options(newGame(1))[0];
  const offered = Array.from({ length: 8 }, (_, i) => ({ ...base, id: `future:${i}`,
    title: `선택 ${i}`, desc: `설명 ${i}`, enabled: i !== 1, locks: i === 1 ? ['경력 부족'] : [] }));
  const host = new TestNode('div'), taken: string[] = [];
  mountPopup(host.element(), popupModel(state, { kind: 'space', offered })!, { choose: id => taken.push(id), dismiss() {} });
  const list = host.querySelector('.life2-popup-list')!;
  assert.equal(visible(host).length, 6);
  assert.equal(visible(host)[0].getAttribute('aria-current'), 'true');
  visible(host)[3].fire('mouseenter');
  assert.equal(host.querySelector('h3')!.textContent, '선택 3');
  assert.deepEqual(taken, []);
  list.fire('keydown', 'Home'); list.fire('keydown', 'ArrowDown');
  assert.equal(visible(host)[1].getAttribute('aria-current'), 'true');
  assert.ok(textOf(host.querySelector('.life2-choice-detail')!).includes('경력 부족'));
  visible(host)[1].fire('click'); assert.deepEqual(taken, []);
  list.fire('keydown', 'ArrowDown'); visible(host)[2].fire('click');
  assert.deepEqual(taken, ['future:2']);
  action(host, 'popup-page-next').fire('click');
  assert.deepEqual(visible(host).map(node => node.dataset.option), ['future:6', 'future:7']);
  action(host, 'popup-page-prev').fire('click');
  assert.equal(visible(host)[0].dataset.option, 'future:0');
}));

const { auditPawn, auditPopupContent } = await import(new URL('../scripts/layout-check-life.mjs', import.meta.url).href);
test('pawn audit rejects neighboring icons/labels, its own label, escaped artwork and an invisible marker', () => {
  const rect = (left: number, top: number, width: number, height: number) => ({ left, top, right:left + width, bottom:top + height, width, height });
  const node = (kind: string, box: ReturnType<typeof rect>) => ({ box, shown:true,
    checkVisibility() { return this.shown; }, getBoundingClientRect() { return this.box; },
    matches: (selector: string) => selector === kind, classList: { contains: (value: string) => kind === `.${value}` } });
  const label = node('.life2-tile-label', rect(20, 85, 30, 14)), icon = node('.life2-glyph', rect(20, 55, 28, 28));
  const neighborLabel = node('.life2-tile-label', rect(20, 33, 30, 14)), neighborIcon = node('.life2-glyph', rect(20, 3, 28, 28));
  const tile = { ...node('tile', rect(0, 50, 70, 51)), dataset:{ space:'A-o0' },
    querySelector: () => label, querySelectorAll: () => [icon, label] };
  const neighbor = { ...node('tile', rect(0, 0, 70, 51)), dataset:{ space:'A-o1' },
    querySelectorAll: () => [neighborIcon, neighborLabel] };
  const sprite = node('svg', rect(20, 54, 28, 22));
  const pawn = { ...node('pawn', rect(16, 52, 38, 28)), closest: () => tile, querySelectorAll: () => [sprite] };
  const document = { querySelector: () => pawn, querySelectorAll: () => [tile, neighbor] };
  const check = () => Array.from(runInNewContext(`(${auditPawn.toString()})()`, { document }));
  assert.deepEqual(check(), []);
  pawn.box = rect(16, -16, 38, 61);
  assert.ok(check().includes('pawn covers A-o1 icon'));
  assert.ok(check().includes('pawn covers A-o1 label'));
  assert.ok(check().includes('pawn artwork extends outside its tile'));
  pawn.box = rect(16, 65, 38, 28); assert.ok(check().includes('pawn covers A-o0 label'));
  pawn.box = rect(16, 52, 38, 28); sprite.box = rect(20, 33, 28, 22);
  assert.ok(check().includes('pawn covers A-o1 label'), 'painted child bounds also count');
  sprite.box = rect(20, 54, 28, 22); pawn.shown = false;
  assert.ok(check().includes('pawn is hidden or too small'));
  pawn.shown = true; pawn.box = rect(16, 52, 10, 10);
  assert.ok(check().includes('pawn is hidden or too small'));
  pawn.box = rect(16, 52, 38, 28); label.shown = false;
  assert.ok(check().includes('current tile label is hidden'));
});

test('popup audit rejects hidden story copy, title, choices and description, and translucent backing', () => {
  const node = (className: string) => ({ className, textContent: '필수 내용', shown: true,
    checkVisibility() { return this.shown; }, getBoundingClientRect: () => ({ width: 100, height: 44 }) });
  const title = node('title'), story = node('story'), choice = node('choice'), description = node('description'), details = node('details');
  const panel = { matches: () => true, hasAttribute: () => false,
    querySelector: (selector: string) => ({ h2: title, '[data-option]': choice,
      '.life2-selected-description': description, '[data-action=popup-details]': details })[selector],
    querySelectorAll: () => [story, choice, description] };
  const paint = { opacity: '1', backgroundColor: 'rgb(23, 47, 64)' };
  const check = () => Array.from(runInNewContext(`(${auditPopupContent.toString()})(panel)`, { panel, getComputedStyle: () => paint }));
  assert.deepEqual(check(), []);
  for (const item of [title, story, choice, description, details]) {
    item.shown = false; assert.ok(check().length, `${item.className} is required`); item.shown = true;
  }
  paint.backgroundColor = 'rgba(23, 47, 64, 0.99)'; assert.ok(check().includes('popup sheet is translucent'));
  paint.backgroundColor = 'rgb(23, 47, 64)'; paint.opacity = '0.99'; assert.ok(check().includes('popup sheet is translucent'));
});
