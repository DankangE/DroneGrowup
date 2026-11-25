import test from 'node:test';
import assert from 'node:assert/strict';
import { ENDINGS } from '../src/game/data.ts';
import { derived, newGame } from '../src/life/engine.ts';
import { COPY, FULLSCREEN_POPUPS, LIFE_TABS, POPUP_DEFINITIONS, POPUP_GROUPS, POPUPS2 } from '../src/ui2/popups/data.ts';
import { ENDINGS2 } from '../src/ui2/popups/ending-data.ts';
import { collectionModel, endingModel } from '../src/ui2/popups/ending.ts';
import { fixtureOption, POPUP2_IDS, popup2Fixture } from '../src/ui2/popups/fixtures.ts';
import type { Popup2Kind } from '../src/ui2/popups/fixtures.ts';
import { choicePage, choiceSummary, phoneChoices, popupKind, popupModel } from '../src/ui2/popups/model.ts';

function freeze<T>(value: T): T {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}

test('§11.3 has all twenty popup groups, with rank cards grouped and bonus retained', () => {
  assert.deepEqual(POPUP_GROUPS, [['start'], ['space'], ['event'], ['result'], ['job'], ['rankup', 'demotion'],
    ['review'], ['shop'], ['estate'], ['wedding'], ['education'], ['biz'], ['fund'], ['luck'], ['transfer'],
    ['phone'], ['my-life'], ['year-end'], ['chapter'], ['retirement']]);
  assert.equal(POPUP_GROUPS.length, 20);
  assert.equal(new Set(POPUP_GROUPS.flat()).size, 21);
  assert.deepEqual(new Set(Object.keys(POPUP_DEFINITIONS)), new Set([...POPUP_GROUPS.flat(), 'bonus']));
});

for (const kind of Object.keys(POPUPS2) as Popup2Kind[]) {
  test(`${kind}: fixture views preserve offered ids, locks and forecasts without mutating state or RNG`, () => {
    const fixture = freeze(popup2Fixture(kind)), before = JSON.stringify(fixture);
    const model = popupModel(fixture.state, fixture.context)!;
    assert.equal(model.kind, kind); assert.equal(model.phase, POPUPS2[kind].phase);
    assert.equal(model.fullscreen, FULLSCREEN_POPUPS.includes(kind));
    assert.deepEqual(model.choices.map(row => row.id), POPUP2_IDS[kind]);
    for (const option of fixture.context.offered!) {
      const row = model.choices.find(row => row.id === option.id)!, preview = fixture.context.previews![option.id];
      assert.equal(row.enabled, option.enabled);
      assert.equal(row.summary, choiceSummary(option, preview));
      assert.ok(option.locks.every(lock => row.details.includes(lock)));
      assert.ok(row.details.some(line => line.includes('행복 +17')));
      assert.ok(row.details.some(line => line.includes('-123')));
    }
    const pages = Array.from({ length: choicePage(model.choices).count }, (_, i) => choicePage(model.choices, i));
    assert.ok(pages.every(page => page.items.length <= 3));
    assert.deepEqual(pages.flatMap(page => page.items.map(row => row.id)), POPUP2_IDS[kind]);
    assert.equal(JSON.stringify(fixture), before);
  });

  test(`${kind}: an unknown option remains a generic card and never reaches an unavailable engine resolver`, () => {
    const fixture = popup2Fixture(kind), offered = [fixtureOption('unreleased:<img src=x>', { cost: 543, tire: 9 })];
    const model = popupModel(freeze(fixture.state), { kind, offered: freeze(offered) })!;
    assert.equal(model.choices[0].id, offered[0].id);
    assert.equal(model.choices[0].summary, COPY.cost(543, 9));
  });
}

test('known option prefixes route all economic/family/retirement views, even event choices', () => {
  for (const kind of ['shop', 'estate', 'wedding', 'education', 'biz', 'fund', 'retirement'] as const) {
    const fixture = popup2Fixture(kind); fixture.state.board.pos = 'A-o0';
    if (kind === 'wedding' || kind === 'education') fixture.state.phase = 'event';
    for (const id of POPUP2_IDS[kind].filter(id => id !== 'skip')) {
      assert.equal(popupKind(fixture.state, [fixtureOption(id)]), kind, id);
    }
  }
  for (const id of ['gift:0', 'gift:1', 'gift:2']) assert.equal(popupKind(newGame(19), [fixtureOption(id)]), 'education');
});

test('luck/station routing uses tile context; unknown ids and movement destinations stay opaque', () => {
  for (const kind of ['luck', 'transfer'] as const) {
    const fixture = popup2Fixture(kind);
    assert.equal(popupKind(fixture.state, [fixtureOption('future:new')]), kind);
    fixture.state.board.step = 'pick'; assert.equal(popupKind(fixture.state, [fixtureOption('go:B-o1')]), undefined);
  }
  const fixture = popup2Fixture('transfer'), model = popupModel(fixture.state, fixture.context)!;
  assert.deepEqual(model.choices.map(row => row.destination), ['E-o0', 'B-o1', undefined]);
});

test('my life has exactly five tabs, includes raw family/assets/logs and accepts authoritative summary values', () => {
  const fixture = freeze(popup2Fixture('my-life'));
  const raw = popupModel(fixture.state, { kind: 'my-life', offered: [] })!;
  assert.deepEqual(raw.tabs!.map(tab => [tab.id, tab.title]), Object.entries(LIFE_TABS));
  assert.ok(raw.tabs![0].lines.includes('행복 512'));
  assert.ok(raw.tabs![1].lines.some(line => line.includes('엔지니어')));
  for (const kid of fixture.state.family.kids) assert.ok(raw.tabs![2].lines.some(line => line.includes(`출생 ${kid.born}계절`)));
  assert.ok(raw.tabs![3].lines.some(line => line.includes('<새 가게>')));
  assert.ok(raw.tabs![3].lines.some(line => line.includes('1234만')));
  assert.ok(raw.tabs![3].lines.includes(`순자산 ${derived(fixture.state).netWorth}만`));
  assert.ok(raw.tabs![4].lines.some(line => line.includes(fixture.state.log[0].text)));
  const supplied = popupModel(fixture.state, fixture.context)!;
  assert.ok(supplied.tabs![3].lines.includes('순자산 48231만'));
  assert.ok(supplied.tabs![3].lines.some(line => line.includes('1,337만')));
  assert.deepEqual(supplied.tabs![2].lines, ['기혼 · 맞벌이', '자녀 두 명', '도심 · 중형 아파트']);
});

test('mid-term summaries at 35/55 display all required fields and supplied next-period guidance', () => {
  for (const turn of [64, 144]) {
    const fixture = popup2Fixture('chapter'); fixture.state.turn = turn;
    const model = popupModel(freeze(fixture.state), fixture.context)!;
    for (const text of ['순자산 48231만', '엔지니어 · 책임 연구원', '자녀 두 명', '도심 · 중형 아파트',
      '행복 512', '업적 · 내 집 마련, 첫 승급']) assert.ok(model.lines.includes(text), text);
    assert.ok(model.lines.some(line => line.startsWith('다음 시기 · ')));
    assert.equal(model.fullscreen, true); assert.equal(model.choices.length, 0);
  }
});

test('retirement offers are engine-owned at 45/60, and response-free luck displays an applied result once', () => {
  for (const turn of [104, 164]) {
    const fixture = popup2Fixture('retirement'); fixture.state.turn = turn;
    const model = popupModel(freeze(fixture.state), fixture.context)!;
    assert.deepEqual(model.choices.map(row => row.id), ['retire:pension', 'retire:rehire', 'retire:switch']);
    assert.equal(model.phase, 'chapter'); assert.equal(model.fullscreen, true);
  }
  const fixture = freeze(popup2Fixture('luck')), before = JSON.stringify(fixture.state);
  const model = popupModel(fixture.state, fixture.context)!;
  assert.equal(model.title, '경품 당첨'); assert.equal(model.choices.length, 0);
  assert.ok(model.lines.some(line => line.includes('+300')));
  assert.equal(JSON.stringify(fixture.state), before);
});

test('phone bank accepts fund options and leaves provided fees unchanged', () => {
  const offered = ['fund:in:100', 'fund:out:100', 'fund:kind:2'].map(id => fixtureOption(id, { cost: 17 }));
  assert.deepEqual(phoneChoices(offered, 'bank'), offered);
  const model = popupModel(newGame(19), { kind: 'phone', offered })!;
  assert.ok(model.choices.every(row => row.summary === COPY.cost(17, 0)));
});

test('ENDINGS2 contains all 21 ids in §10 order and keeps the original eleven titles/text verbatim', () => {
  assert.deepEqual(ENDINGS2.map(row => row.id), ['debtor', 'philanthropist', 'ceo', 'chairman', 'academy', 'legend',
    'master', 'star', 'hero', 'tycoon', 'family', 'official', 'smallbiz', 'solo', 'director', 'instructor',
    'employee', 'pilot', 'freeman', 'worker', 'student']);
  for (const legacy of ENDINGS) {
    const row = ENDINGS2.find(row => row.id === legacy.id)!;
    assert.equal(row.title, legacy.title); assert.equal(row.text, legacy.text);
  }
  assert.ok(ENDINGS2.every(row => row.title && row.text && row.hint && row.art));
});

for (const ending of ENDINGS2) test(`ending ${ending.id}: displays the engine-selected id and score, without selecting or rescoring`, () => {
  const fixture = popup2Fixture('chapter'); fixture.state.phase = 'ended'; fixture.state.ending = ending.id;
  fixture.state.score = 123; fixture.state.s.money = -900000;
  const model = endingModel(freeze(fixture.state), { grade: 'S', featScore: 456, netWorth: 9876 });
  assert.equal(model.id, ending.id); assert.equal(model.title, ending.title);
  for (const text of ['최종 점수 123', '최종 성적 S', '업적 점수 456', '순자산 9876만', ending.text]) assert.ok(model.lines.includes(text));
});

test('collection includes every ending once, preserving saved unlocks and best scores without mutating metadata', () => {
  const meta = freeze({ gallery: ['worker', 'worker', 'ceo', 'future'], bestByEnding: { worker: 999, ceo: 0 } });
  const rows = collectionModel(meta);
  assert.equal(rows.length, 21); assert.equal(rows.filter(row => row.unlocked).length, 2);
  assert.equal(rows.find(row => row.id === 'worker')!.best, 999);
  assert.equal(rows.find(row => row.id === 'ceo')!.best, 0);
  assert.equal(endingModel(freeze(newGame(19))).ending, undefined);
});
