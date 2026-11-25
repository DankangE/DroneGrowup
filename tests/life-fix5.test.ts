import assert from 'node:assert/strict';
import { test } from 'node:test';
import { choose, derived, forecast, newGame, options, reachable, restore } from '../src/life/flow.ts';
import { choose as step } from '../src/life/engine.ts';
import { CAREER_KEYS, review } from '../src/life/career2.ts';
import { advanceCareer, performance } from '../src/life/jobs.ts';
import { ENDING_RULES, FAMILY_KEYS, FAMILY_TEXT } from '../src/life/life-data.ts';
import { settlementSummary } from '../src/life/ending.ts';
import { EVENT_KEYS, effect } from '../src/life/events-a.ts';
import { josa } from '../src/life/text.ts';
import type { GameState } from '../src/life/types.ts';
import { WORLD } from '../src/life/world.ts';
import { hud } from '../src/ui2/hud.ts';
import { PLACE_GLYPHS, tileIcon } from '../src/ui2/icons.ts';
import { mountPopup } from '../src/ui2/popups/index.ts';
import { popupModel } from '../src/ui2/popups/model.ts';
import { endingModel } from '../src/ui2/popups/ending.ts';
import { placePopupSheet, resultPopups, sheetSpace } from '../src/ui2/popups/presentation.ts';
import { humanCopy } from '../src/ui2/popups/polish-model.ts';
import { action, controls, panelAt, TestNode, textOf, withDOM } from './life-popup2-dom-helper.ts';

const nodes = new Map(WORLD.map(node => [node.id, node]));
function at(pos = 'B-o18', turn = 1): GameState {
  const s = step(newGame(1), 'start:school').state;
  s.turn = turn; s.board.pos = pos; s.board.step = 'space'; s.board.dice = [1, 1];
  return s;
}

test('F5.1: one tile choice closes an empty bonus menu with the same accounting and one result', () => {
  const before = at('B-o18'), snapshot = structuredClone(before);
  const chosen = choose(before, 'skip');
  const intermediate = step(before, 'skip').state;
  assert.deepEqual(options(intermediate).filter(row => row.enabled).map(row => row.id), ['end']);
  const explicit = step(intermediate, 'end').state;
  for (const field of ['s', 'board', 'turn', 'rng', 'timers', 'family'] as const) assert.deepEqual(chosen.state[field], explicit[field]);
  assert.equal(chosen.state.turn, before.turn + 1); assert.equal(chosen.state.board.step, 'spin');
  assert.deepEqual(restore(chosen.state), chosen.state); assert.deepEqual(before, snapshot);
  assert.equal(forecast(before, 'skip').branches[0].endsSeason, true);
  const cards = resultPopups(before, chosen.state, chosen.result);
  assert.equal(cards.length, 1); assert.ok(cards[0].lines.some(line => line.includes('→')));
  assert.ok(chosen.result.season?.accrual.length);
});

test('F5.1: real extra work, event continuations and mandatory family choices survive automatic close', () => {
  const study = at('A-o1');
  const studied = choose(study, 'act:st_theory');
  assert.equal(studied.state.board.step, 'bonus'); assert.equal(studied.state.turn, study.turn);
  assert.ok(options(studied.state).some(row => row.enabled && row.id.startsWith('act:')));
  const wedding = at(WORLD.find(row => row.place === 'wedding')!.id, 8);
  wedding.family.partnerAt = 0; wedding.home = { map: 'A', tier: 3, deposit: 0 }; wedding.s.money = 3000;
  const married = choose(wedding, 'wed:0');
  assert.equal(married.state.turn, wedding.turn);
  assert.deepEqual(options(married.state).map(row => row.id), ['dual:0', 'dual:1', 'skip']);
  const dual = choose(married.state, 'dual:1');
  assert.equal(dual.state.family.dual, true); assert.equal(dual.state.turn, wedding.turn + 1);
  const proposal = at('A-o25', 8); proposal.family.partnerAt = 0; proposal.home = wedding.home;
  const invited = choose(proposal, 'family:event:proposal');
  assert.equal(invited.state.eventId, 'proposal'); assert.equal(invited.state.turn, proposal.turn);
  assert.equal(options(proposal).find(row => row.id === 'family:event:proposal')!.free, true);
  assert.equal(invited.state.s.acts, proposal.s.acts);
  const accepted = choose(invited.state, 'ev:0');
  assert.equal(accepted.state.timers[EVENT_KEYS.popup], 1);
  assert.ok(options(accepted.state).some(row => row.id === 'wed:0'));
});

test('F5.1: phone actions never close a season; rolled winter results retain one wheel and yearly hooks once', () => {
  const s = at(); s.board.step = 'bonus';
  assert.equal(choose(s, 'loan:100', 'phone').state.turn, s.turn);
  const winter = at('A-o0', 3); winter.phase = 'event'; winter.eventId = 'blind_date';
  const preview = forecast(winter, 'ev:0'), outcome = choose(winter, 'ev:0');
  assert.ok(preview.branches.every(branch => branch.endsSeason));
  assert.equal(outcome.state.turn, 4); assert.equal(outcome.state.timers[FAMILY_KEYS.year], 4);
  const cards = resultPopups(winter, outcome.state, outcome.result);
  assert.equal(cards.length, 1); assert.deepEqual(cards[0].roll, outcome.result.roll);
  assert.deepEqual(choose(winter, 'ev:0'), outcome);
});

// This policy starts from newGame and only uses offered choices and local reachable routes.
// No injected money, home, relationship, time or stats; all random events can be declined.
function familyPolicy(s: GameState): string {
  const offered = options(s).filter(row => row.enabled), find = (id: string) => offered.some(row => row.id === id) ? id : undefined;
  for (const id of ['start:work', 'job:service', 'job:none', 'date', 'family:event:blind_date',
    'family:event:proposal', 'family:event:baby_news', 'wed:0', 'dual:1', 'baby']) {
    if (find(id) && !(id === 'job:service' && s.status === 'working')) return id;
  }
  if (s.phase === 'event') return ['blind_date', 'proposal', 'baby_news'].includes(s.eventId!) && find('ev:0') ? 'ev:0' : 'skip';
  if ((s.home?.tier ?? 0) < 3) for (const id of ['home:buy:3', 'home:buy:3:mortgage', ...(s.home?.tier === 2 ? [] : ['home:rent:2'])]) if (find(id)) return id;
  if (find('promo')) return 'promo';
  if (find('spin')) return 'spin';
  if (offered.some(row => row.id.startsWith('go:'))) {
    const target = s.family.partnerAt === null ? 'life' : s.family.marriedAt === null && (s.home?.tier ?? 0) >= 2 ? 'life'
      : (s.home?.tier ?? 0) < 3 ? s.s.money >= (s.home?.tier === 2 ? 800 : 2200) ? 'estate' : 'job' : 'life';
    const matches = (id: string) => nodes.get(id)!.kind === target || target === 'life' && nodes.get(id)!.kind === 'start' && s.turn >= 12;
    const distance = (id: string) => {
      let frontier = [id], seen = new Set<string>();
      for (let n = 0; n < WORLD.length; n++) {
        if (frontier.some(id => matches(id))) return n;
        seen = new Set([...seen, ...frontier]);
        frontier = frontier.flatMap(id => nodes.get(id)!.next).filter(id => id.startsWith('A-') && !seen.has(id));
      }
      return WORLD.length;
    };
    const moves = reachable(s).filter(move => move.path.every(id => id.startsWith('A-')));
    const priority = (id: string) => { const n = nodes.get(id)!;
      return (matches(id) ? 100 : 0) + (n.kind === 'job' ? 30 : 0) + (['pay', 'start'].includes(n.kind) ? 20 : 0) - distance(id); };
    moves.sort((a, b) => priority(b.node) - priority(a.node));
    return `go:${moves[0].node}`;
  }
  return find('act:work_service') ?? offered.find(row => row.id.startsWith('act:') && !row.cost)?.id ?? find('end') ?? find('skip') ?? offered[0].id;
}
for (const seed of [1, 2, 3, 4, 5, 6, 11]) test(`F5.2: map A family policy seed ${seed} marries and has a child before 35`, () => {
  let state = newGame(seed), choices = 0;
  while (state.turn < 64 && !state.family.kids.length) {
    assert.ok(choices++ < 800); state = choose(state, familyPolicy(state)).state;
    assert.equal(state.board.pos[0], 'A'); assert.deepEqual(restore(state), state);
  }
  assert.ok(derived(state).age < 35); assert.equal(state.family.kids.length, 1);
  assert.ok(state.family.marriedAt! - state.family.partnerAt! >= 4);
  assert.ok(state.home!.tier >= 3); assert.equal(state.board.visited, 1);
});

for (const stage of ['date', 'wedding', 'baby'] as const) test(`F5.2: ${stage} hint moves once to the actual opportunity with its original rules`, () => {
  const s = step(newGame(1), 'start:self').state; s.turn = 16; s.s.money = 5000;
  if (stage !== 'date') { s.family.partnerAt = 8; s.home = { map: 'A', tier: 3, deposit: 0 }; }
  if (stage === 'baby') s.family.marriedAt = 12;
  const route = options(s).find(row => row.id.startsWith('family:go:'))!;
  assert.ok(route.enabled); assert.match(route.desc, /교통비 150만원/);
  const next = choose(s, route.id).state;
  assert.equal(next.board.pos, route.id.slice('family:go:'.length)); assert.equal(next.turn, s.turn);
  assert.equal(next.s.money, s.s.money - 150); assert.ok(!options(next).some(row => row.id.startsWith('family:go:')));
  assert.ok(options(next).some(row => row.id === (stage === 'wedding' ? 'wed:0' : stage) && row.enabled));
  assert.deepEqual(restore(next), next);
  if (stage === 'wedding') { s.home = null; assert.ok(!options(s).some(row => row.id.startsWith('family:go:'))); }
  if (stage === 'baby') { s.turn = (46 - 19) * 4; assert.ok(!options(s).some(row => row.id.startsWith('family:go:'))); }
});

test('F5.2: landing on the village start retains its eligible meeting invitation after settlement', () => {
  const s = at('A-o27', 16); s.status = 'working'; s.track = 'service'; s.board.step = 'pick';
  const landed = choose(s, 'go:A-o0');
  assert.equal(landed.state.turn, s.turn); assert.equal(landed.state.board.step, 'space');
  assert.ok(options(landed.state).some(row => row.id === 'family:event:blind_date' && row.enabled));
  const meeting = choose(landed.state, 'family:event:blind_date');
  assert.equal(meeting.state.eventId, 'blind_date'); assert.equal(meeting.state.turn, s.turn);
  assert.ok(options(meeting.state).some(row => !row.cost && row.enabled));
});

test('F5.3/4: HUD exposes debt and debt colour; every married life tile exposes both labelled modes', () => withDOM(() => {
  const s = at(); s.s.money = 1017; s.s.debt = 1176;
  const bands = hud(s, derived(s), options(s), () => {}), top = bands.top as unknown as TestNode;
  assert.match(textOf(top), /자금 1,017만.*빚 1,176만/s); assert.ok(top.querySelector('[data-debt-state=owing]'));
  for (const node of WORLD.filter(row => row.kind === 'life')) {
    s.board.pos = node.id; s.family.marriedAt = 0;
    const model = popupModel(s)!;
    assert.deepEqual(model.choices.filter(row => row.id.startsWith('dual:')).map(row => row.title), FAMILY_TEXT.dual);
    const root = new TestNode('main'); const chosen: string[] = [];
    mountPopup(root.element(), model, { choose: id => chosen.push(id), dismiss() {} });
    for (let page = 0; page < Math.ceil(model.choices.length / 3); page++) {
      for (const button of controls(root).filter(row => row.dataset.option?.startsWith('dual:'))) button.fire('click');
      const next = action(root, 'popup-page-next'); if (!next.disabled) next.fire('click');
    }
    assert.deepEqual(chosen.sort(), ['dual:0', 'dual:1']);
  }
}));

test('F5.5: batchim, no batchim and rieul particles work across all five pairs and rendered name templates', () => {
  for (const [name, expected] of [
    ['소형 아파트', ['를', '로', '는', '가', '와']], ['산업 벨트', ['를', '로', '는', '가', '와']],
    ['중고 경차', ['를', '로', '는', '가', '와']], ['새싹 마을', ['을', '로', '은', '이', '과']],
    ['항공 공원', ['을', '으로', '은', '이', '과']], ['드론', ['을', '으로', '은', '이', '과']],
  ] as const) for (const [index, pair] of (['을/를', '으로/로', '은/는', '이/가', '과/와'] as const).entries()) {
    assert.equal(josa(name, pair), name + expected[index]);
  }
  assert.equal(humanCopy('중고 경차을(를) 들였다.'), '중고 경차를 들였다.');
  const s = at('B-o7'); s.s.money = 10000;
  const transfers = popupModel(s)!.choices.filter(row => row.id.startsWith('express:'));
  assert.equal(new Set(transfers.map(row => row.title)).size, 6);
  assert.ok(transfers.some(row => row.title === '산업 벨트로 특급 이동'));
  assert.ok(!transfers.some(row => row.title.includes('본가')));
  assert.match(effect({}, { carRepair: 1 }).text, /차량 수리/);
  assert.doesNotMatch(effect({}, { carRepair: 1 }).text, /복구 1/);
});

test('F5.6: regular extra duties keep a qualified mechanic at rank 3 through age 46; repeated neglect still demotes with reasons', () => {
  let s = at('C-o2', 40); s.status = 'working'; s.track = 'mechanic';
  Object.assign(s.s, { theory: 90, skill: 150, xp: 420, rank: 3, stamina: 100 });
  s.job = { rank: 3, perf: 50, tenure: 12, total: 60, warn: 0, changedAt: 0, tracks: ['mechanic'] };
  while (derived(s).age < 47) {
    s = performance(s, 'extra'); s.turn++; s = advanceCareer(s);
    assert.equal(s.job.rank, 3); assert.equal(s.job.warn, 0); assert.equal(s.timers[CAREER_KEYS.idle], 0);
  }
  if (options(s).some(row => row.id === 'job:none')) s = choose(s, 'job:none').state;
  const bad = structuredClone(s); bad.turn = 115; bad.board.step = 'bonus'; bad.s.stamina = 100;
  bad.job.warn = 1; bad.job.perf = 20; bad.phase = 'action'; bad.eventId = null;
  assert.equal(review(bad).outcome, 'demotion');
  const down = choose(bad, 'end'), card = resultPopups(bad, down.state, down.result)[0];
  assert.equal(card.kind, 'demotion'); assert.match(card.lines.join(' '), /성과 20.*경고 기준.*직무 행동/);
  assert.equal(down.state.job.rank, 2);
});

test('F5.6: score components sum exactly with unchanged weights, including negative net worth', () => {
  for (const debt of [0, 100000]) {
    const s = at(); s.s.money = 1017; s.s.debt = debt; s.s.happy = 300;
    const summary = settlementSummary(s), c = summary.composition;
    assert.equal(c.wealth, Math.max(0, summary.netWorth)); assert.equal(c.happiness, 300 * 30);
    assert.equal(c.achievements, summary.featScore); assert.equal(summary.score, c.wealth + c.happiness + c.achievements);
    assert.equal(ENDING_RULES.happyPoints, 30); assert.equal(ENDING_RULES.featCap, 30000);
    assert.match(endingModel(s).lines.join(' '), /점수 구성 · 순자산.*행복.*업적.*결산 등급은 직급과 별개/);
  }
});

test('F5 small: town hall/library glyphs differ and an applied luck card has an original icon', () => withDOM(() => {
  assert.notEqual(PLACE_GLYPHS.library, PLACE_GLYPHS.village_hall);
  const a = tileIcon('train', 'library'), b = tileIcon('train', 'village_hall');
  assert.notEqual((a.firstElementChild as unknown as TestNode).attributes.d, (b.firstElementChild as unknown as TestNode).attributes.d);
  const s = at('A-o12'), root = new TestNode('main');
  mountPopup(root.element(), popupModel(s, { kind: 'luck', offered: [], lines: ['행운의 드론 우편이 도착했어요.'] })!, { choose() {}, dismiss() {} });
  assert.ok(root.querySelector('[data-tile-icon=luck]'));
}));

for (const height of [740, 844]) test(`F5 small: ${height}px middle-row pawn remains visible with a compact, paged sheet`, () => withDOM(() => {
  const browser = Object.getOwnPropertyDescriptor(globalThis, 'window');
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { innerWidth: 360, innerHeight: height } });
  const shell = new TestNode('main'); shell.classList.add('life2-shell');
  const host = new TestNode('section'), hud = new TestNode('header'), pawn = new TestNode('div'), nav = new TestNode('footer');
  hud.classList.add('life2-hud'); pawn.setAttribute('aria-current', 'location'); nav.classList.add('life2-bottom');
  shell.append(hud, pawn, nav, host);
  const rect = (node: TestNode, top: number, bottom: number) => Object.defineProperty(node, 'getBoundingClientRect', { value: () => ({ top, bottom }) });
  const pawnTop = Math.floor(height / 2); rect(hud, 6, 116); rect(pawn, pawnTop, pawnTop + 44); rect(nav, height - 50, height - 6);
  try {
    const available = sheetSpace(host.element())!; assert.ok(available < 390);
    mountPopup(host.element(), popupModel(newGame(1))!, { choose() {}, dismiss() {} });
    const panel = panelAt(host); assert.equal(panel.dataset.compact, ''); assert.equal(controls(panel).filter(row => row.dataset.option).length, 1);
    action(host, 'popup-page-next').fire('click'); assert.equal(controls(panelAt(host)).filter(row => row.dataset.option).length, 1);
    const sheet = new TestNode('section'), css = new Map<string, string>();
    sheet.style.setProperty = (key, value) => { css.set(key, value); };
    Object.defineProperty(sheet, 'getBoundingClientRect', { value: () => ({ height: Number.parseFloat(css.get('height') ?? '407') }) });
    placePopupSheet(host.element(), sheet.element());
    const top = Number.parseFloat(css.get('top')!), size = Number.parseFloat(css.get('height')!);
    assert.ok(size <= height * .55); assert.ok(top + size <= pawnTop - 6 || top >= pawnTop + 50);
    assert.ok(top >= 122 && top + size <= height - 56);
  } finally {
    if (browser) Object.defineProperty(globalThis, 'window', browser); else Reflect.deleteProperty(globalThis, 'window');
  }
}));
