import assert from 'node:assert/strict';
import test from 'node:test';
import { newGame } from '../src/life/engine.ts';
import type { Forecast, OptionView } from '../src/life/engine.ts';
import { choiceDetail } from '../src/ui2/choice-detail.ts';
import { COPY, LIFE_COPY } from '../src/ui2/popups/data.ts';
import { mountPopup, popupModel } from '../src/ui2/popups/index.ts';
import { POLISH as P } from '../src/ui2/popups/polish-data.ts';
import { action, assertTrustedSceneImages, panelAt, TestNode, textOf, visible, withDOM } from './life-popup2-dom-helper.ts';

const offered: OptionView[] = [
  { id: 'future:roll', kind: 'action', place: 'town', title: '비행 연습', desc: '새 코스에 도전해요.',
    enabled: true, locks: [], missing: [], cost: 99, tire: 99, free: false,
    roll: { chance: 95, staminaPct: 0, success: { text: '성공 이야기', add: { money: 999 } }, fail: { text: '실패 이야기', add: {} } } },
  { id: 'future:sure', kind: 'bank', place: 'town', title: '자금 받기', desc: '계좌를 확인해요.',
    enabled: true, locks: [], missing: [], cost: 0, tire: 0, free: true },
  { id: 'future:locked', kind: 'job', place: 'town', title: '지원하기', desc: '<img onerror="bad()"> 지원 조건',
    enabled: false, locks: ['경력 부족', '자금 부족'], missing: [], cost: 40, tire: 0, free: true },
];
const previews: Record<string, Forecast> = {
  'future:roll': { cost: 7, tire: 3, chance: 61, branches: [
    { id: 'success', deltas: { money: 23, skill: 4, stamina: -3, rep: 0 }, endsSeason: true, status: 'working',
      accrual: [{ label: '급여', amount: 70 }] },
    { id: 'fail', deltas: { money: -7, skill: 1 }, endsSeason: false },
    { id: 'crash', deltas: { stamina: -9 }, endsSeason: false },
  ] },
  'future:sure': { cost: 0, tire: 0, branches: [{ id: 'sure', deltas: { money: 120, rank: -1 }, status: 'retired', endsSeason: false }] },
  'future:locked': { cost: 40, tire: 0, chance: 48, branches: [] },
};
const model = () => popupModel(newGame(11), { kind: 'space', offered, previews })!;

function withPC(run: () => void) {
  withDOM(() => {
    const previous = Object.getOwnPropertyDescriptor(globalThis, 'window');
    Object.defineProperty(globalThis, 'window', { configurable: true, value: { innerWidth: 1366, innerHeight: 768 } });
    try { run(); } finally {
      if (previous) Object.defineProperty(globalThis, 'window', previous); else Reflect.deleteProperty(globalThis, 'window');
    }
  });
}

test('choice data formats supplied forecasts, signs, money units and notes without recomputing rules', () => {
  const before = JSON.stringify({ offered, previews });
  const choices = model().choices;
  assert.equal(choices[0].figure, '성공 61%');
  assert.deepEqual(choices[0].metrics, ['비용 7만', '체력 3', '성공 61%']);
  assert.deepEqual(choices[0].outcomes?.map(row => [row.label, row.tone]), [['성공', 'good'], ['실패', 'bad'], ['추락', 'bad']]);
  assert.deepEqual(choices[0].outcomes?.[0].chips.map(chip => chip.tone), ['good', 'good', 'bad', 'neutral']);
  assert.match(choices[0].outcomes![0].chips[0].text, /\+23만$/);
  assert.match(choices[0].outcomes![1].chips[0].text, /-7만$/);
  assert.deepEqual(choices[0].outcomes![0].notes, [LIFE_COPY.status.working, COPY.endsSeason, P.ledger, P.accrued, '급여 +70만']);
  assert.equal(choices[1].figure, '자금 +120만');
  assert.equal(choices[1].outcomes![0].label, '확정');
  assert.equal(choices[1].outcomes![0].chips.length, 1, 'non-working rank is omitted just as in the text details');
  assert.equal(choices[2].figure, '🔒 경력 부족');
  assert.deepEqual(choices[2].locks, offered[2].locks);
  assert.ok(choices[0].details.includes('성공: 성공 이야기'), 'the complete text fallback is preserved');
  assert.equal(JSON.stringify({ offered, previews }), before);
});

test('chip tones treat rising debt as bad and repayment as good, like the HUD', () => {
  const loan = { ...offered[1], id: 'future:loan' }, repay = { ...offered[1], id: 'future:repay' };
  const choices = popupModel(newGame(11), { kind: 'space', offered: [loan, repay], previews: {
    'future:loan': { cost: 0, tire: 0, branches: [{ id: 'sure', deltas: { money: 100, debt: 100 }, endsSeason: false }] },
    'future:repay': { cost: 0, tire: 0, branches: [{ id: 'sure', deltas: { money: -100, debt: -100 }, endsSeason: false }] },
  } })!.choices;
  assert.deepEqual(choices[0].outcomes![0].chips.map(chip => chip.tone), ['good', 'bad']);
  assert.deepEqual(choices[1].outcomes![0].chips.map(chip => chip.tone), ['bad', 'good']);
});

test('missing previews do not turn nominal option effects into forecast deltas', () => {
  const choice = popupModel(newGame(11), { kind: 'space', offered: [offered[0]] })!.choices[0];
  assert.equal(choice.figure, '성공 95%');
  assert.equal(choice.outcomes, undefined);
  const free = popupModel(newGame(11), { kind: 'space', offered: [offered[1]] })!.choices[0];
  assert.equal(free.figure, '비용 0만');
});

test('PC default inspector exposes every branch and ledger note before opening details', () => withPC(() => {
  const host = new TestNode('div');
  mountPopup(host.element(), model(), { choose() { assert.fail('inspection must not choose'); }, dismiss() {} });
  const pane = host.querySelector('.life2-choice-detail')!;
  assert.equal(panelAt(host).dataset.selector, '');
  assert.equal(panelAt(host).dataset.details, undefined);
  assert.equal(pane.querySelector('.life2-selected-description')!.textContent, offered[0].desc);
  assert.equal(pane.querySelector('.life2-chance')!.textContent, '성공 61%');
  assert.deepEqual(pane.querySelectorAll('.life2-outcome-label').map(node => node.textContent), ['성공', '실패', '추락']);
  for (const outcome of model().choices[0].outcomes!) {
    for (const chip of outcome.chips) assert.ok(textOf(pane).includes(chip.text));
    for (const note of outcome.notes) assert.ok(textOf(pane).includes(note));
  }
  assert.deepEqual(visible(host).map(row => row.querySelector('small')!.textContent), ['성공 61%', '자금 +120만', '🔒 경력 부족']);
  assert.equal(visible(host)[0].getAttribute('aria-label'), model().choices[0].details.join('. '));
  assert.ok(action(host, 'popup-details'));
}));

test('hover and keyboard refresh structured details including locks, while clicks still dispatch immediately', () => withPC(() => {
  const host = new TestNode('div'), chosen: string[] = [];
  mountPopup(host.element(), model(), { choose: id => chosen.push(id), dismiss() {} });
  const pane = host.querySelector('.life2-choice-detail')!, list = host.querySelector('.life2-popup-list')!;
  visible(host)[1].fire('mouseenter');
  assert.deepEqual(pane.querySelectorAll('.life2-outcome-label').map(node => node.textContent), ['확정']);
  assert.ok(textOf(pane).includes('은퇴'));
  list.fire('keydown', 'End');
  assert.ok(offered[2].locks.every(lock => textOf(pane.querySelector('.life2-choice-lock')!).includes(lock)));
  assert.equal(pane.querySelector('.life2-chance')!.textContent, '성공 48%', 'a locked roll retains its chance');
  assert.equal(pane.querySelector('.life2-selected-description')!.textContent, offered[2].desc);
  assertTrustedSceneImages(pane);
  visible(host)[2].fire('click'); assert.deepEqual(chosen, []);
  list.fire('keydown', 'Home'); list.fire('keydown', 'ArrowDown');
  assert.equal(pane.querySelector('h3')!.textContent, offered[1].title);
  list.fire('keydown', 'ArrowUp');
  assert.equal(pane.querySelector('h3')!.textContent, offered[0].title);
  visible(host)[1].fire('focus');
  assert.equal(pane.querySelector('h3')!.textContent, offered[1].title);
  visible(host)[1].fire('click'); assert.deepEqual(chosen, ['future:sure']);
  action(host, 'popup-details').fire('click');
  assert.equal(panelAt(host).dataset.details, '');
  action(host, 'popup-back').fire('click');
  assert.equal(panelAt(host).dataset.selector, '');
  assert.equal(visible(host).length, 3);
}));

test('overflow keeps branch previews and routes all original copy to the existing fallback', () => withDOM(() => {
  const inspector = choiceDetail('town', null, true), pane = inspector.pane as unknown as TestNode;
  const choice = model().choices[0], original = structuredClone(choice);
  let opened: string[] = [];
  inspector.update(choice, () => { opened = choice.details; });
  // Geometry double: intentionally small capacity, not a claim about browser layout.
  Object.defineProperty(pane, 'clientHeight', { value: 200 });
  Object.defineProperty(pane, 'scrollHeight', { get: () =>
    170 + 10 * (pane.querySelectorAll('.life2-outcome-note').length + pane.querySelectorAll('.life2-outcome-chip').length) });
  for (const row of pane.querySelectorAll('.life2-choice-outcome')) {
    Object.defineProperty(row, 'getBoundingClientRect', { value: () => ({ height: row.querySelectorAll('span').length * 10 }) });
  }
  inspector.fit();
  assert.equal(pane.querySelectorAll('.life2-outcome-label').length, 3);
  assert.equal(pane.querySelectorAll('.life2-outcome-chip').length, 3);
  assert.match(action(pane, 'popup-details').textContent, /더 보기/);
  action(pane, 'popup-details').fire('click');
  assert.deepEqual(opened, original.details);
  assert.deepEqual(choice, original, 'fitting changes presentation only');
}));
