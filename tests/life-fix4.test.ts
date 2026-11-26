import assert from 'node:assert/strict';
import { test } from 'node:test';
import { choose, derived, newGame, options } from '../src/life/flow.ts';
import { rankChange } from '../src/life/career2.ts';
import { ECONOMY_KEYS } from '../src/life/economy.ts';
import { FAMILY_KEYS } from '../src/life/life-data.ts';
import { WORLD } from '../src/life/world.ts';
import { mountLife } from '../src/ui2/app.ts';
import { hud } from '../src/ui2/hud.ts';
import { mountPopup } from '../src/ui2/popups/index.ts';
import { popupModel, textPages } from '../src/ui2/popups/model.ts';
import { resultPopups } from '../src/ui2/popups/presentation.ts';
import { childLabel, featLabels, humanCopy, itemPages, stageView, statChanges } from '../src/ui2/popups/polish-model.ts';
import { POLISH as P } from '../src/ui2/popups/polish-data.ts';
import { POLISH_STYLE } from '../src/ui2/popups/polish-style.ts';
import { endingModel, mountEnding } from '../src/ui2/popups/ending.ts';
import { action, controls, panelAt, TestNode, textOf, withDOM } from './life-popup2-dom-helper.ts';

function worker(rank = 0) {
  const s = choose(newGame(1), 'start:self').state;
  s.status = 'working'; s.track = 'service'; s.turn = 3;
  s.job = { rank, perf: 95, tenure: 8, total: 8, warn: 0, changedAt: 0, tracks: ['service'] };
  s.s.xp = 210; s.s.rank = rank; s.board.step = 'space'; s.board.dice = [1, 1];
  s.board.pos = 'A-o9'; return s;
}
function browserDOM(run: (browser: Window) => void, reduced = true) {
  withDOM(() => {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'window');
    const browser = { matchMedia: () => ({ matches: reduced, addEventListener() {} }) } as unknown as Window;
    Object.defineProperty(globalThis, 'window', { configurable: true, value: browser });
    try { run(browser); } finally {
      if (descriptor) Object.defineProperty(globalThis, 'window', descriptor); else Reflect.deleteProperty(globalThis, 'window');
    }
  });
}
function allCopy(host: TestNode) {
  const count = Number(action(host, 'popup-text-next')?.textContent.split(' / ')[1] ?? 1);
  let text = '';
  for (let i = 0; i < count; i++) {
    text += textOf(panelAt(host)); action(host, 'popup-text-next')?.fire('click');
  }
  return text;
}
const mount = (host: TestNode, model: NonNullable<ReturnType<typeof popupModel>>) =>
  mountPopup(host.element(), model, { choose() {}, dismiss() {} });

for (const demotion of [false, true]) test(`F4 A1/B2: ${demotion ? 'demotion' : 'promotion'} card has portrait, real pay delta, next rank and requirements`, () => {
  const s = worker(demotion ? 1 : 0);
  if (demotion) { s.job.warn = 1; s.job.perf = 20; s.board.step = 'bonus'; }
  const outcome = choose(s, demotion ? 'end' : 'promo'), change = rankChange(s, outcome.state)!;
  const model = resultPopups(s, outcome.state, outcome.result)[0];
  assert.equal(model.kind, demotion ? 'demotion' : 'rankup');
  assert.ok(model.rows!.some(row => row.value === P.pay(change.to.salary, change.salaryDelta)));
  assert.ok(model.rows!.some(row => row.label === P.next));
  assert.ok(model.rows!.some(row => row.label === P.requirements && /등급|재직/.test(row.value)));
  browserDOM(() => {
    const root = new TestNode('div'); mount(root, model);
    assert.equal(root.querySelector('[data-job-portrait]')!.dataset.jobPortrait, 'service');
    assert.ok(allCopy(root).includes(P.pay(change.to.salary, change.salaryDelta)));
    assert.equal(!!root.querySelector('[data-rank-burst]'), !demotion);
  });
});

test('F4 A1: dismissal, quit and voluntary buyout use a neutral career card', () => {
  const s = worker(); s.job.warn = 1; s.job.perf = 20; s.board.step = 'bonus';
  const outcome = choose(s, 'end');
  for (const id of ['end', 'quit', 'event:retire:0']) {
    const model = resultPopups(s, outcome.state, { ...outcome.result, optionId: id })[0];
    assert.equal(model.kind, 'review'); assert.equal(model.fullscreen, true);
    assert.notEqual(model.title, '좌천'); assert.equal(model.motion, undefined);
    assert.equal(model.track, 'service');
  }
});

for (const turn of [64, 144]) test(`F4 A1/B1: chapter ${turn} has a portrait and the correct period progress`, () => browserDOM(() => {
  const s = worker(); s.turn = turn;
  const model = popupModel(s, { kind: 'chapter', offered: [] })!, root = new TestNode('div'); mount(root, model);
  const stage = stageView(s); assert.equal(stage.remaining, turn === 64 ? 80 : 60);
  assert.ok(root.querySelector('[data-job-portrait]')); assert.ok(textOf(root).includes(`이 시기 ${stage.remaining}개 계절 남음`));
  const progress = root.querySelector('[role=progressbar]')!;
  assert.equal(progress.attributes['aria-valuenow'], '0'); assert.equal(progress.attributes['aria-valuemax'], String(stage.total));
}));

test('F4 A2/A7: chapter, records and ending show Korean achievements; third child is a named child, never three awards', () => {
  const s = worker(); s.turn = 144; s.feats = ['visit:A', 'lap:B', 'kid_independent:2'];
  s.family.kids = [{ born: 20, pts: 0, stage: 4 }, { born: 24, pts: 0, stage: 4 }, { born: 28, pts: 6, stage: 4 }];
  const labels = featLabels(s).join(' '); assert.match(labels, /지도 첫 방문 · 새싹 마을/);
  assert.match(labels, /지도 첫 완주 · 도심/); assert.match(labels, /자녀 독립 · 노을/);
  const texts = [popupModel(s, { kind: 'chapter', offered: [] })!.lines.join(' '),
    popupModel(s, { kind: 'my-life', offered: [] })!.tabs![4].lines.join(' '), endingModel(s).lines.join(' ')];
  for (const text of texts) { assert.match(text, /자녀 독립 · 노을/); assert.doesNotMatch(text, /visit:|lap:|kid_independent:|자녀 독립 · 3회/); }
});

for (const [age, stage] of [[7, 0], [13, 1], [16, 2], [20, 3]] as const) test(`F4 A3: ${age}-year-old child's education/independence names the correct sibling`, () => {
  const s = worker(); s.turn = 120; s.board.step = 'spin'; s.board.dice = [];
  s.family.kids = [{ born: 0, pts: 1, stage: 4 }, { born: 120 - age * 4, pts: 3, stage }];
  const model = popupModel(s)!;
  assert.equal(model.title, age === 20 ? '자녀 독립' : '자녀 교육');
  assert.ok(model.lines[0].includes(`바람 · ${age}세`));
  assert.ok(popupModel(s, { kind: 'my-life', offered: [] })!.tabs![2].lines.includes(childLabel(s, 1)));
  assert.ok(endingModel(s).lines.includes(childLabel(s, 1)));
  assert.doesNotMatch(model.lines.join(' '), /출생|교육 단계/);
});

test('F4 A4: early retirement cancels without mutation, confirms once, shows retirement then ending', () => browserDOM(browser => {
  const s = worker(); s.turn = 144; s.board.step = 'spin'; s.board.dice = []; s.board.ledger = { 생활비: -78 }; s.s.stamina = s.s.capStamina = 80;
  const root = new TestNode('main'); mountLife(root.element(), 1, true); browser.__life!.load(s);
  root.querySelector('[data-nav=phone]')!.fire('click'); root.querySelector('[data-tab=retire]')!.fire('click');
  assert.match(textOf(panelAt(root)), /은퇴 정산 -78만 · 기존 장부 포함/);
  const select = () => root.querySelector('[data-option="phone:retire"]')!.fire('click');
  select(); assert.equal(panelAt(root).dataset.confirm, 'retire'); assert.deepEqual(browser.__life!.state(), s);
  action(root, 'popup-cancel').fire('click'); assert.deepEqual(browser.__life!.state(), s);
  select(); panelAt(root).fire('keydown', 'Escape'); assert.deepEqual(browser.__life!.state(), s);
  assert.equal(panelAt(root).dataset.confirm, undefined);
  select(); const confirm = action(root, 'popup-confirm'); confirm.fire('click'); confirm.fire('click');
  const expected = choose(s, 'phone:retire', 'phone').state;
  assert.deepEqual(browser.__life!.state(), expected); assert.equal(panelAt(root).dataset.popup, 'retirement');
  assert.equal(root.dataset.screen, 'play'); action(root, 'popup-close').fire('click');
  assert.equal(root.dataset.screen, 'ending'); assert.deepEqual(browser.__life!.state(), expected);
}));

test('F4 A5/A8: zone D explains its lock on face and detail; destination particles are correct', () => {
  const s = worker(); s.board.pos = 'B-o7'; s.flags = [];
  const model = popupModel(s)!, card = model.choices.find(row => row.id === 'express:D-o0')!;
  assert.equal(card.enabled, false); assert.equal(card.summary, P.zoneLock);
  assert.match(card.details.join(' '), /특구 초청장/); assert.doesNotMatch(card.details.join(' '), /invite/);
  assert.equal(card.title, '전문가 특구로 특급 이동');
  assert.equal(model.choices.find(row => row.id === 'express:A-o0')!.title, '새싹 마을로 특급 이동');
});

test('F4 A6: graduate tuition, enrollment and actual completion are visible exactly once', () => {
  const s = worker(); s.board.pos = 'D-o4'; s.flags.push('degree');
  assert.match(popupModel(s)!.choices.find(row => row.id === 'graduate:enroll')!.summary, /150만 × 6계절/);
  const enrolled = choose(s, 'graduate:enroll').state;
  assert.match(popupModel(enrolled, { kind: 'my-life', offered: [] })!.tabs![1].lines.join(' '), /대학원 · 이수 중 · 5계절 남음/);
  if (options(enrolled).some(row => row.id === 'job:none')) Object.assign(enrolled, choose(enrolled, 'job:none').state);
  enrolled.turn = enrolled.timers[ECONOMY_KEYS.graduateUntil] - 1; enrolled.board.step = 'bonus'; enrolled.board.dice = [1, 1]; enrolled.phase = 'action'; enrolled.eventId = null;
  const complete = choose(enrolled, 'end'); assert.ok(complete.state.flags.includes('master'));
  const cards = resultPopups(enrolled, complete.state, complete.result);
  assert.equal(cards.filter(card => card.title === P.graduateTitle).length, 1);
  assert.match(cards.find(card => card.title === P.graduateTitle)!.lines.join(' '), /석사 학위를 받았다/);
  assert.match(popupModel(complete.state, { kind: 'my-life', offered: [] })!.tabs![1].lines.join(' '), /석사 취득/);
});

test('F4 A7: ending pages contain complete items, including long stories and individual achievements', () => browserDOM(() => {
  const s = worker(); s.phase = 'ended'; s.ending = 'family'; s.score = 123;
  const root = new TestNode('div'), model = endingModel(s); mountEnding(root.element(), s, { title() {}, restart() {}, collection() {} });
  const stats = root.querySelectorAll('.life2-ending-stat').map(stat => `${stat.querySelector('span')!.textContent} ${stat.querySelector('strong')!.textContent}`);
  assert.deepEqual(stats.slice(0, 2).reverse(), model.lines.slice(0, 2), 'score and grade stay complete in their stat tiles');
  const pages = itemPages(model.lines.slice(2), line => line.length, P.endingLimit), seen = stats.slice(0, 2).reverse();
  for (const page of pages) {
    const text = root.querySelector('p')!.textContent; assert.equal(text, page.join('\n')); seen.push(...page);
    assert.ok(!text.endsWith(' · ')); assert.doesNotMatch(text, /최종 점수|최종 성적/);
    action(root, 'ending-text-next')?.fire('click');
  }
  assert.deepEqual(seen, model.lines);
  assert.ok(model.lines.every(line => stats.includes(line) || pages.some(page => page.includes(line))));
}));

test('F4 A8: wedding face shows lock reasons and all lifestyle choices; family mode remains reachable', () => {
  const s = worker(); s.turn = 4; s.family.partnerAt = 0; s.board.pos = 'B-o23';
  s.board.pos = WORLD.find(node => node.place === 'wedding')!.id;
  const wedding = popupModel(s)!; assert.equal(wedding.kind, 'wedding');
  assert.ok(wedding.choices.some(row => row.id.startsWith('lifestyle:')));
  assert.match(wedding.choices.find(row => row.id === 'wed:0')!.summary, /전세 빌라/);
  s.family.marriedAt = 3; s.timers[FAMILY_KEYS.dual] = 3;
  assert.ok(popupModel(s)!.choices.some(row => row.id === 'dual:1'));
  const chosen = choose(s, 'dual:1').state; chosen.board.step = 'space'; chosen.board.pos = WORLD.find(node => node.place === 'hospital')!.id;
  assert.deepEqual(popupModel(chosen)!.choices.filter(row => row.id.startsWith('dual:')).map(row => row.title), ['가정 중심', '맞벌이']);
});

test('F4 A8: review acknowledgement is 확인; annual changes and lucky copy are not repeated', () => {
  const s = worker(); s.job.perf = 20; s.board.step = 'bonus';
  const annual = choose(s, 'end'), card = resultPopups(s, annual.state, annual.result).find(row => row.kind === 'year-end')!;
  assert.equal(card.rows!.filter(row => row.stat === 'happy').length, 1);
  assert.ok(!card.lines.some(line => /행복 [+-]/.test(line)));
  const review = popupModel(annual.state, { kind: 'review' })!.choices.find(row => row.id === 'job:none')!;
  assert.equal(review.title, '확인'); assert.doesNotMatch(review.summary, /비용|지나간다/);
  const lucky = choose(newGame(1), 'start:self').state; lucky.board.pos = 'A-o7';
  const outcome = choose(lucky, 'spin'), queue = resultPopups(lucky, outcome.state, outcome.result);
  const luck = queue.find(row => row.kind === 'luck')!;
  assert.equal(luck.lines.filter(line => line === outcome.result.luck!.text).length, 1);
  assert.ok(luck.lines.includes(P.settle(outcome.result.upkeep!.total))); assert.equal(queue.length, 1);
  assert.equal(humanCopy('비행한다..'), '비행한다.');
  assert.ok(textPages(['첫 항로', '두 번째 항로'.repeat(30)]).every(page => !page.endsWith(' · ')));
});

test('F4 A9/A10/B3: opaque sheets, labelled empty states and changed HUD/result chips', () => browserDOM(() => {
  const before = worker(), after = structuredClone(before); after.s.skill = 50;
  const changes = statChanges(before, after), row = changes.find(row => row.stat === 'skill')!;
  assert.equal(row.value, 'G → E등급 · 점수 0 → 50');
  const bands = hud(after, derived(after), options(after), () => {}, undefined, before);
  const chip = (bands.top as unknown as TestNode).querySelector('[data-changed-stat=skill]')!;
  assert.ok(chip); assert.ok(!chip.querySelector('.life2-stat-tick')); assert.ok(bands.top.querySelector('.life2-change-strip'));
  const root = new TestNode('div'); mount(root, popupModel(after, { kind: 'result', offered: [], lines: [], rows: changes })!);
  assert.equal(root.querySelector('[data-changed-stat=skill]')!.querySelector('dd')!.textContent, row.value);
  mount(root, popupModel(newGame(1), { kind: 'my-life', offered: [] })!);
  controls(root).find(node => node.dataset.tab === 'family')!.fire('click'); assert.ok(root.querySelector('dl'));
  assert.match(allCopy(root), /부동산 칸/);
  assert.match(POLISH_STYLE, /data-popup=my-life\].*background:#fff6e0/);
  assert.match(POLISH_STYLE, /life2-shell:has\(\.life2-popup-host\).*0 44px/);
}));

test('F4 B1/B2: stage and rank animation stop on click/Escape; reduced motion disables all four effects', () => {
  const s = worker(), outcome = choose(s, 'promo'), model = resultPopups(s, outcome.state, outcome.result)[0];
  for (const reduced of [false, true]) browserDOM(() => {
    const root = new TestNode('div'); let dismissed = 0;
    mountPopup(root.element(), model, { choose() { assert.fail(); }, dismiss() { dismissed++; } });
    assert.equal(panelAt(root).dataset.animating, reduced ? undefined : 'true');
    panelAt(root).fire('keydown', 'Escape'); assert.equal(dismissed, reduced ? 1 : 0);
    if (!reduced) { assert.equal(panelAt(root).dataset.animating, undefined); panelAt(root).fire('keydown', 'Escape'); assert.equal(dismissed, 1); }
    mount(root, model); panelAt(root).fire('click'); assert.equal(panelAt(root).dataset.animating, undefined);
  }, reduced);
  assert.equal(P.rankMs, 800); assert.equal(P.calloutMs, 600);
  const reduced = POLISH_STYLE.slice(POLISH_STYLE.indexOf('@media(prefers-reduced-motion:reduce)'));
  for (const selector of ['data-changed-stat', 'life2-card-heading', 'life2-stage-drone', 'life2-tile-callout']) assert.ok(reduced.includes(selector));
  assert.match(reduced, /animation:none!important/);
});

test('F4 B4: landing callout reuses the tile icon for 600ms and can be skipped without replaying the engine', ctx => {
  ctx.mock.timers.enable({ apis: ['setTimeout'] });
  browserDOM(browser => {
    const s = choose(newGame(11), 'start:self').state; s.board.pos = 'A-o10'; s.board.step = 'pick'; s.board.dice = [1, 1];
    const root = new TestNode('main'); mountLife(root.element(), 11, true); browser.__life!.load(s);
    root.querySelector('[data-option="go:A-o12"]')!.fire('click'); ctx.mock.timers.tick(250); ctx.mock.timers.tick(250);
    const callout = root.querySelector('[data-tile-callout=luck]')!; assert.ok(callout.querySelector('[data-tile-icon=luck]'));
    assert.match(textOf(callout), /복권|행운/); ctx.mock.timers.tick(599); assert.ok(root.querySelector('[data-tile-callout]'));
    root.fire('keydown', 'Escape'); assert.equal(root.querySelector('[data-tile-callout]'), undefined);
    assert.deepEqual(browser.__life!.state(), choose(s, 'go:A-o12').state); ctx.mock.timers.tick(1);
    assert.equal(panelAt(root).dataset.popup, 'luck');
    browser.__life!.load(s); root.querySelector('[data-option="go:A-o12"]')!.fire('click');
    ctx.mock.timers.tick(250); ctx.mock.timers.tick(250); assert.ok(root.querySelector('[data-tile-callout]'));
    ctx.mock.timers.tick(600); assert.equal(root.querySelector('[data-tile-callout]'), undefined);
    assert.equal(panelAt(root).dataset.popup, 'luck');
    assert.deepEqual(browser.__life!.state(), choose(s, 'go:A-o12').state);
  }, false);
});


for (const kind of ['event', 'contest', 'rankup'] as const) test(`F4 B4: ${kind} landing uses its existing icon and tile name`, ctx => {
  ctx.mock.timers.enable({ apis: ['setTimeout'] });
  browserDOM(browser => {
    const s = choose(newGame(11), 'start:self').state;
    const tile = WORLD.find(node => node.map === 'A' && node.kind === kind)!;
    const before = WORLD.find(node => node.map === 'A' && node.next.includes(tile.id))!.id;
    s.board.pos = WORLD.find(node => node.map === 'A' && node.next.includes(before))!.id;
    s.board.step = 'pick'; s.board.dice = [1, 1];
    const root = new TestNode('main'); mountLife(root.element(), 11, true); browser.__life!.load(s);
    root.querySelector(`[data-space="${tile.id}"][data-dest]`)!.fire('click'); ctx.mock.timers.tick(250); ctx.mock.timers.tick(250);
    const callout = root.querySelector(`[data-tile-callout=${kind}]`)!;
    assert.ok(callout.querySelector(`[data-tile-icon=${kind}]`));
    root.fire('keydown', 'Escape'); assert.deepEqual(browser.__life!.state(), choose(s, `go:${tile.id}`).state);
  }, false);
});
