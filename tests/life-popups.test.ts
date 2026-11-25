import test from 'node:test';
import assert from 'node:assert/strict';
import { choose, currentEvent, forecast, newGame, options } from '../src/life/engine.ts';
import type { Forecast, OptionView, Result } from '../src/life/engine.ts';
import { EVENTS } from '../src/life/compat.ts';
import { COPY, POPUPS, POPUP_RULES } from '../src/ui2/popups/data.ts';
import { choicePage, choiceSummary, phoneChoices, popupKind, popupModel, shortTitle, textPages } from '../src/ui2/popups/model.ts';
import { POPUP_STYLE } from '../src/ui2/popups/style.ts';

const started = () => choose(newGame(11), 'start:school').state;
function frozen<T>(value: T): T {
  if (value && typeof value === 'object') { Object.values(value).forEach(frozen); Object.freeze(value); }
  return value;
}
const option = (id: string, extra: Partial<OptionView> = {}): OptionView =>
  ({ ...options(newGame(11))[0], id, title: id, ...extra });
const result = (rolled: boolean): Result => ({
  ...choose(newGame(11), 'start:school').result, title: '바람을 읽다', text: '새로운 경험을 쌓았다.',
  deltas: { money: -35, skill: 8 }, notes: ['정비를 마쳤다.'],
  ...(rolled ? { roll: { value: 43, chance: 71, success: true } } : {}),
});

test('popup pages contain three choices, preserve order/locks and cover all eight job candidates', () => {
  const offered = frozen(Array.from({ length: 8 }, (_, index) => option(`job:future-${index}`, {
    enabled: index < 6, locks: index < 6 ? [] : ['학력 부족'],
  })));
  const model = popupModel(frozen(started()), { offered })!;
  assert.equal(model.kind, 'job');
  const pages = [0, 1, 2].map(index => choicePage(model.choices, index));
  assert.deepEqual(pages.map(page => page.items.length), [3, 3, 2]);
  assert.deepEqual(pages.flatMap(page => page.items.map(choice => choice.id)), offered.map(choice => choice.id));
  assert.deepEqual(pages[2].items.map(choice => choice.enabled), [false, false]);
  assert.ok(pages[2].items.every(choice => choice.details.includes('학력 부족')));
});

test('empty, exact, short and invalid page requests always resolve to a valid page', () => {
  for (const length of [0, 1, 2, 3, 4, 6, 7]) {
    const items = frozen(Array.from({ length }, (_, i) => i));
    const first = choicePage(items, -3), last = choicePage(items, 99);
    assert.equal(first.page, 0); assert.equal(last.page, last.count - 1);
    assert.ok(first.items.length <= 3 && last.items.length <= 3);
    assert.equal(choicePage(items, NaN).page, 0); assert.equal(choicePage(items, Infinity).page, 0);
  }
  assert.equal(choicePage([0, 1, 2, 3], 1.8).page, 1);
});

test('start shows all three engine choices on one page without changing state or RNG', () => {
  const state = frozen(newGame(42)), before = JSON.stringify(state), model = popupModel(state)!;
  assert.equal(model.kind, 'start'); assert.equal(choicePage(model.choices).count, 1);
  assert.deepEqual(model.choices.map(choice => choice.id), options(state).map(choice => choice.id));
  assert.equal(JSON.stringify(state), before);
});

test('space cards show exact engine forecasts, including branch deltas and locked choices', () => {
  const state = choose(started(), 'spin').state; state.s.money = 0;
  const model = popupModel(frozen(state))!;
  assert.equal(model.kind, 'space');
  for (const view of options(state)) {
    const card = model.choices.find(choice => choice.id === view.id)!, preview = forecast(state, view.id);
    assert.equal(card.enabled, view.enabled);
    assert.equal(card.summary, choiceSummary(view, preview));
    assert.ok(preview.branches.every(branch => card.details.some(line => line.startsWith(`${COPY.expected} · ${COPY[branch.id]}`))));
  }
  assert.ok(model.choices.some(choice => !choice.enabled));
  assert.ok(model.choices.some(choice => choice.id === 'skip' && choice.enabled));
});

test('event model uses the current engine event illustration, text and response ids', () => {
  const state = started(); state.phase = 'event'; state.eventId = EVENTS[0].id;
  const event = currentEvent(state)!, model = popupModel(frozen(state))!;
  assert.equal(model.kind, 'event'); assert.equal(model.title, event.title);
  assert.equal(model.place, event.place); assert.ok(model.lines.includes(event.text));
  assert.deepEqual(model.choices.map(choice => choice.id), options(state).map(choice => choice.id));
  assert.ok(model.choices.some(choice => choice.id === 'skip' && choice.enabled));
});

test('bonus includes the engine end-season option even when it is on the last page', () => {
  const state = started(); state.board.step = 'bonus';
  const model = popupModel(frozen(state))!;
  assert.equal(model.kind, 'bonus'); assert.ok(model.choices.some(choice => choice.id === 'end' && choice.enabled));
});

test('spin, pick and ending remain outside T18 auto-routing', () => {
  const state = started(); assert.equal(popupModel(state), undefined);
  state.board.step = 'pick'; state.board.dice = [2, 2]; assert.equal(popupModel(state), undefined);
  state.phase = 'ended'; assert.equal(popupKind(state, []), undefined);
});

for (const kind of Object.keys(POPUPS) as (keyof typeof POPUPS)[]) test(`${kind} has a named model and generic future option support`, () => {
  const state = frozen(started()), offered = frozen([option(kind === 'phone' ? 'phone:future' : 'future:ack')]);
  const model = popupModel(state, { kind, offered, lines: ['엔진이 제공한 내용'] })!;
  assert.equal(model.kind, kind); assert.equal(model.phase, POPUPS[kind].phase);
  assert.ok(model.lines.includes('엔진이 제공한 내용'));
  assert.deepEqual(model.choices.map(choice => choice.id), kind === 'result' ? [] : offered.map(choice => choice.id));
  assert.equal(model.fullscreen, kind === 'rankup' || kind === 'demotion');
});

test('future promotion and review options use supplied views without resolving missing engine ids', () => {
  const state = started(); state.job.perf = 61; state.job.tenure = 7; state.job.warn = 1;
  const supplied: Forecast = { cost: 42, tire: 3, chance: 77, branches: [{ id: 'success', deltas: { happy: 8 }, endsSeason: false }] };
  const model = popupModel(frozen(state), { kind: 'review', offered: frozen([option('promo:future')]),
    previews: frozen({ 'promo:future': supplied }) })!;
  assert.equal(model.choices[0].summary, COPY.cost(42, 3, 77));
  assert.ok(model.choices[0].details.some(line => line.includes('행복 +8')));
  assert.ok(model.lines.includes(COPY.review(61, 7, 1)));
});

test('rolled results preserve the actual roll; deterministic results are board notifications', () => {
  for (const rolled of [true, false]) {
    const engineResult = frozen(result(rolled)), model = popupModel(started(), { kind: 'result', result: engineResult })!;
    assert.deepEqual(model.roll, engineResult.roll); assert.equal(model.notification, !rolled);
    assert.equal(model.choices.length, 0); assert.ok(model.lines.includes(engineResult.text));
    assert.ok(model.lines.some(line => line.includes('-35') && line.includes('+8')));
  }
});

test('year-end renders supplied changes and engine accounting without deriving annual rules', () => {
  const engineResult = result(false);
  engineResult.season = { from: '겨울', to: '봄', refill: 17, accrual: [{ label: '생활비', amount: -42 }] };
  const model = popupModel(started(), { kind: 'year-end', result: frozen(engineResult), offered: [], lines: ['승진 심사 대기'] })!;
  for (const line of ['승진 심사 대기', '겨울 → 봄', '체력 회복 17', '생활비 -42']) assert.ok(model.lines.includes(line));
});

test('phone tabs show only offered services, preserve disabled services and tolerate new phone ids', () => {
  const offered = frozen(['buy:drone', 'sell:gear', 'repair', 'loan:100', 'repay:100', 'retire:early', 'phone:future', 'act:train', 'retire:pension']
    .map(id => option(id, { enabled: id !== 'buy:drone', locks: id === 'buy:drone' ? ['자금 부족'] : [] })));
  assert.deepEqual(phoneChoices(offered, 'all').map(row => row.id), offered.slice(0, 7).map(row => row.id));
  for (const [tab, ids] of [['shop', ['buy:drone', 'sell:gear']], ['repair', ['repair']], ['bank', ['loan:100', 'repay:100']],
    ['retire', ['retire:early']]] as const) assert.deepEqual(phoneChoices(offered, tab).map(row => row.id), ids);
  assert.equal(phoneChoices(offered, 'shop')[0].enabled, false);
  assert.equal(popupModel(newGame(1), { kind: 'phone' })!.choices.length, 0);
});

test('long and untrusted copy stays plain text, fully recoverable across bounded Unicode pages', () => {
  const source = '<img src=x onerror=alert(1)> ' + '긴 글 🛩️ '.repeat(80);
  const pages = textPages([source]);
  assert.equal(pages.join(''), source); assert.ok(pages.every(page => Array.from(page).length <= POPUP_RULES.textPage));
  assert.deepEqual(textPages([]), ['']); assert.equal(textPages(['첫 줄\n다음 줄']).join(''), '첫 줄 다음 줄');
  assert.equal(shortTitle('제목'), '제목'); assert.equal(Array.from(shortTitle(source)).length, POPUP_RULES.titleLength);
});

test('portrait sheets declare the 55 percent cap; fullscreen is limited to rank cards', () => {
  assert.equal(POPUP_RULES.sheetPercent, 55);
  assert.match(POPUP_STYLE, /height:min\(360px,55dvh\); max-height:55vh/);
  assert.doesNotMatch(POPUP_STYLE, /overflow\s*:\s*(auto|scroll|hidden)/);
  assert.ok(POPUP_STYLE.includes('min-height:44px'));
});
