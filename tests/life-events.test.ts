import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { GRADE_STEPS } from '../src/life/data.ts';
import { ALL_EVENTS, choose, currentEvent, derived, eventCandidates, forecast, LIFE_EVENTS, lifeEvent,
  newGame, options, reachable, restore, yearEnd } from '../src/life/engine.ts';
import { answer, effect, EVENTS_A, EVENT_KEYS as K, gamble, materialize } from '../src/life/events-a.ts';
import { EVENTS_B, eventCarState, eventEstateOffers } from '../src/life/events-b.ts';
import { EVENTS_C } from '../src/life/events-c.ts';
import { EVENTS_D, eventShopIncome } from '../src/life/events-d.ts';
import { EVENTS_E, EVENT2_KEYS as K2, eventAnswer, eventEffect } from '../src/life/events-e.ts';
import { EVENTS_F, eventRecovery } from '../src/life/events-f.ts';
import { EVENTS_G } from '../src/life/events-g.ts';
import { EVENTS_H, organizationValue, successionValue } from '../src/life/events-h.ts';
import { EVENTS } from '../src/life/compat.ts';
import { familyChoices } from '../src/life/family.ts';
import { achievementScore } from '../src/life/ending.ts';
import { careerSalary } from '../src/life/career2.ts';
import { ASSET_KEYS, STATS } from '../src/life/life-data.ts';
import { JOB_RULES } from '../src/life/tracks.ts';
import { randInt } from '../src/life/move.ts';
import { WORLD } from '../src/life/world.ts';
import { checkChoices, dominanceReport } from '../scripts/dominance-life.ts';
import type { Cond, GameState } from '../src/life/types.ts';

function fixture(id: string): GameState {
  const s = choose(newGame(17), 'start:self').state;
  s.turn = 84; s.phase = 'event'; s.eventId = id;
  s.board.pos = 'B-o5'; s.board.step = 'space'; s.board.dice = [1, 1];
  s.status = 'working'; s.track = 'clerk'; s.job = { rank: 2, perf: 85, tenure: 44, total: 44, warn: 0, changedAt: 0, tracks: ['clerk'] };
  Object.assign(s.s, { money: 100000, happy: 100, stamina: 70, net: 150, rep: 150, xp: 480, biz: 150,
    skill: 270, drone: 4, gear: 1, car: 2, staff: 3, value: 20000, rank: 2, fans: 100 });
  s.flags.push('licensed', 'tech', 'partner'); s.home = { map: 'B', tier: 4, deposit: 0 };
  s.family = { partnerAt: 4, marriedAt: 8, dual: false, kids: [{ born: 44, pts: 2, stage: 1 }] };
  s.holdings = [{ id: 'drone_cafe', level: 1, paid: 1200 }];
  if (['blind_date', 'old_friend', 'proposal'].includes(id)) s.family.marriedAt = null;
  if (['blind_date', 'old_friend'].includes(id)) { s.family.partnerAt = null; s.flags = s.flags.filter(f => f !== 'partner'); }
  if (id === 'kid_teen') s.family.kids[0].born = 24;
  if (['kid_wedding', 'grandchild'].includes(id)) {
    s.turn = 148; s.s.capStamina = 90; s.family.kids[0].born = 20; s.family.kids[0].stage = 4;
    if (id === 'grandchild') s.timers[K.married(0)] = 140;
  }
  if (id === 'rent_hike') s.home.tier = 1;
  if (id === 'jeonse_alarm') { s.home.tier = 2; s.home.deposit = 1500; }
  if (id === 'hq_call') s.board.pos = 'A-o5';
  if (id === 'mentor') { s.job.rank = 1; s.s.rank = 1; }
  if (id === 'audit_note') s.job.perf = 39;
  if (id === 'early_retire') { s.turn = 132; s.s.capStamina = 90; }
  if (['gear_sponsor', 'drone_show'].includes(id)) s.track = 'pilot';
  if (['big_order', 'partner_exit', 'gov_project', 'export_deal'].includes(id)) s.track = 'company';
  if (['crash', 'bull'].includes(id)) s.fund = { kind: 1, amount: 1001 };
  if (id === 'burnout') s.timers[K2.lowStamina] = 2;
  if (['wrist', 'field_call'].includes(id)) s.track = 'pilot';
  if (['illness', 'parents_care'].includes(id)) s.turn = 104;
  if (id === 'holiday') s.turn = 85;
  if (['fast_track', 'd_scout'].includes(id)) { s.board.pos = 'D-o5'; s.s.theory = 240; }
  if (id === 'fast_track') s.track = 'engineer';
  if (['second_act', 'memoir', 'cruise', 'successor'].includes(id)) {
    s.turn = id === 'successor' ? 184 : id === 'second_act' ? 144 : 164;
    s.s.capStamina = s.turn >= 164 ? 80 : 90; s.status = 'retired'; s.track = null;
    s.family.kids[0].stage = 4;
  }
  const legacy = EVENTS.find(row => row.id === id);
  if (legacy) {
    const meet = (cond: Cond) => {
      if (cond.status) s.status = cond.status[0]; if (cond.track) s.track = cond.track[0];
      Object.assign(s.s, cond.min, cond.max); s.flags = [...new Set([...s.flags, ...cond.flags ?? []])].filter(f => !cond.notFlags?.includes(f));
      if (cond.any) meet(cond.any[0]);
    };
    meet(legacy.when); s.job.rank = s.s.rank = 0;
  }
  return s;
}
function integers(value: unknown): void {
  if (typeof value === 'number') assert.ok(Number.isSafeInteger(value));
  else if (value && typeof value === 'object') Object.values(value).forEach(integers);
}
function freeze<T>(value: T): T {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value;
}
function branchState(s: GameState, id: string, branch: 'sure' | 'success' | 'fail'): GameState {
  if (branch === 'sure') return s;
  const chance = options(s).find(o => o.id === id)!.roll!.chance;
  for (let seed = 1; seed < 10000; seed++) {
    const probe = { ...s, rng: seed };
    if ((randInt(probe, 100) < chance) === (branch === 'success')) return { ...s, rng: seed };
  }
  throw new Error('unreachable branch');
}
function act(s: GameState, id: string, branch: 'sure' | 'success' | 'fail' = 'sure') {
  const before = branchState(s, id, branch), copy = structuredClone(before);
  const view = options(freeze(before)).find(o => o.id === id)!;
  assert.ok(view?.enabled, `${s.eventId}/${id}: ${view?.locks}`);
  const preview = forecast(before, id), expected = preview.branches.find(b => b.id === branch)!;
  const actual = choose(before, id);
  assert.deepEqual(actual.result.deltas, expected.deltas);
  assert.deepEqual(actual.result.effects, expected.effects);
  assert.equal(actual.result.statusTo, expected.status ?? before.status);
  assert.equal(actual.result.trackTo, expected.track === undefined ? before.track : expected.track);
  if (view.roll) { assert.equal(actual.result.roll!.chance, preview.chance); assert.equal(actual.result.roll!.success, branch === 'success'); }
  const after = actual.state;
  for (const stat of STATS) assert.equal(after.s[stat] - before.s[stat], (actual.result.deltas[stat] ?? 0) + (actual.result.settle?.deltas[stat] ?? 0), stat);
  integers(after); assert.deepEqual(before, copy);
  const saved = restore(JSON.parse(JSON.stringify(before)));
  assert.ok(saved, `${s.eventId}/${id} restore`); assert.deepEqual(choose(saved, id), actual);
  return actual;
}

test('A–H have exactly 82 rows plus 38 unchanged legacy events, unique ids, grade gates and free responses', () => {
  assert.deepEqual([EVENTS_A, EVENTS_B, EVENTS_C, EVENTS_D, EVENTS_E, EVENTS_F, EVENTS_G, EVENTS_H].map(rows => rows.length), [12, 12, 14, 12, 10, 8, 8, 6]);
  assert.equal(new Set(ALL_EVENTS.map(row => row.id)).size, 120); assert.equal(EVENTS.length, 38);
  for (const row of LIFE_EVENTS) {
    assert.ok(row.title && row.text && row.weight > 0);
    for (const [stat, min] of Object.entries(row.when.min ?? {})) {
      const grades = GRADE_STEPS[stat as keyof typeof GRADE_STEPS]; if (grades) assert.ok(grades.includes(min!));
    }
    const choices = materialize(row, fixture(row.id)).choices;
    for (const choice of choices) for (const [stat, min] of Object.entries(choice.need?.min ?? {})) {
      const grades = GRADE_STEPS[stat as keyof typeof GRADE_STEPS]; if (grades) assert.ok(grades.includes(min!));
    }
    assert.ok(choices.some(c => !c.cost && !c.tire && !c.need), row.id);
  }
});

for (const row of ALL_EVENTS) {
  test(`${row.id}: eligible, every response and both roll branches match forecast and replay`, () => {
    const s = fixture(row.id);
    assert.ok(eventCandidates(s).some(event => event.id === row.id), row.id);
    assert.equal(currentEvent(s)?.title, row.title);
    for (const [i, choice] of materialize(row, s).choices.entries()) {
      for (const branch of choice.roll ? ['success', 'fail'] as const : ['sure'] as const) act(structuredClone(s), `ev:${i}`, branch);
    }
    const poor = structuredClone(s); poor.s.money = 0; poor.s.stamina = 0;
    assert.ok(options(poor).some(o => o.id.startsWith('ev:') && !o.cost && !o.tire && o.enabled));
    assert.equal(choose(poor, 'skip').state.phase, 'action');
  });
}

test('weighted event tile and contest fallback include all eligible rows; cooldown is exactly 24', () => {
  const s = fixture('hobby'); s.phase = 'action'; s.eventId = null; s.board.pos = 'A-o4'; s.board.step = 'pick'; s.board.dice = [1, 1];
  const pool = eventCandidates(s), probe = structuredClone(s);
  let n = randInt(probe, pool.reduce((sum, e) => sum + e.weight, 0));
  const expected = pool.find(e => (n -= e.weight) < 0)!;
  const drawn = choose(s, 'go:A-o5').state;
  assert.equal(drawn.eventId, expected.id); assert.equal(drawn.rng, probe.rng);
  s.seen = Object.fromEntries(ALL_EVENTS.map(e => [e.id, s.turn]));
  assert.deepEqual(eventCandidates(s), []);
  s.turn += 23; assert.deepEqual(eventCandidates(s), []);
  s.turn++; assert.ok(eventCandidates(s).some(e => e.id === 'hobby'));
  assert.ok(!eventCandidates(s).some(e => e.id === 'stray_dog'));
});

test('life draws occur in even-age springs, preserve the spin, consume one RNG draw, and never fire at 70', () => {
  for (const turn of [0, 1, 4, 8, 12, 196, 200, 204]) {
    const s = choose(newGame(33), 'start:self').state; s.turn = turn; s.s.capStamina = turn >= 164 ? 80 : turn >= 124 ? 90 : 100; s.s.stamina = 50;
    const before = structuredClone(s), next = lifeEvent(freeze(s)), fires = turn > 0 && turn < 204 && turn % 8 === 4;
    assert.equal(next.phase === 'event', fires); assert.equal(next.board.step, 'spin'); assert.deepEqual(next.board.dice, []);
    assert.deepEqual(s, before); assert.deepEqual(lifeEvent(next), next);
    if (fires) {
      assert.ok([...EVENTS_A, ...EVENTS_B.filter(e => e.life), ...EVENTS_F, ...EVENTS_H].some(e => e.id === next.eventId));
      const expected = structuredClone(before), pool = eventCandidates(before, false, true);
      randInt(expected, pool.reduce((n, e) => n + e.weight, 0)); assert.equal(next.rng, expected.rng);
      const resumed = choose(next, 'skip').state;
      assert.equal(resumed.s.acts, s.s.acts); assert.equal(resumed.turn, turn); assert.equal(resumed.board.step, 'spin');
      assert.ok(options(resumed).some(o => o.id === 'spin')); assert.deepEqual(restore(next), next);
    }
  }
});

test('winter close exposes its life event instead of erasing it; an empty pool leaves the RNG alone', () => {
  const s = choose(newGame(4), 'start:self').state; s.turn = 3; s.board.step = 'bonus'; s.board.dice = [1, 1];
  const next = choose(s, 'end'); assert.equal(next.state.phase, 'event'); assert.equal(next.result.eventId, next.state.eventId);
  const empty = fixture('hobby'); empty.phase = 'action'; empty.eventId = null; empty.board.step = 'spin'; empty.board.dice = [];
  empty.seen = Object.fromEntries(ALL_EVENTS.map(e => [e.id, empty.turn]));
  assert.equal(lifeEvent(empty).rng, empty.rng); assert.equal(lifeEvent(empty).eventId, null);
});

test('periodic life events wait behind retirement and child education without losing the pending event', () => {
  const s = fixture('hobby'); s.turn = 164; s.s.capStamina = 80; s.board.step = 'spin'; s.board.dice = [];
  assert.ok(options(s).some(o => o.id === 'retire:pension'));
  let next = choose(s, 'retire:pension').state;
  assert.equal(next.eventId, 'hobby'); assert.equal(next.phase, 'event');
  while (options(next).some(o => o.id.startsWith('edu:') || o.id.startsWith('gift:'))) next = choose(next, 'skip').state;
  assert.ok(options(next).some(o => o.id === 'ev:0'));
  const child = fixture('hobby'); child.board.step = 'spin'; child.board.dice = [];
  child.family.kids = [{ born: child.turn - 28, pts: 0, stage: 0 }];
  assert.ok(options(child).some(o => o.id === 'edu:0'));
  assert.equal(choose(child, 'edu:0').state.eventId, 'hobby');
});

test('event probabilities use the printed formula, clamp 5..95, ignore stamina and consume luck only on a roll', () => {
  for (const [id, index, chance] of [['blind_date', 0, 55], ['gov_project', 0, 65], ['drone_show', 0, 67], ['franchise', 1, 60]] as const) {
    for (const stamina of [0, 100]) {
      const s = fixture(id); s.s.stamina = stamina;
      assert.equal(options(s).find(o => o.id === `ev:${index}`)!.roll!.chance, chance);
    }
  }
  for (const [perf, expected] of [[0, 5], [100, 95]]) {
    const s = fixture('layoff'); s.job.perf = perf;
    assert.equal(options(s).find(o => o.id === 'ev:1')!.roll!.chance, expected);
  }
  const lucky = fixture('blind_date'); lucky.flags.push(ASSET_KEYS.dream);
  const next = act(lucky, 'ev:0', 'fail'); assert.equal(next.result.roll!.chance, 75);
  assert.ok(!next.state.flags.includes(ASSET_KEYS.dream));
});

test('family responses create partners/children, target the eligible child, cap talent and record wedding achievements', () => {
  const date = act(fixture('blind_date'), 'ev:0', 'success').state;
  assert.equal(date.family.partnerAt, date.turn); assert.equal(date.s.happy, 110);
  assert.equal(act(fixture('old_friend'), 'ev:0').state.family.partnerAt, 84);
  const baby = act(fixture('baby_news'), 'ev:0').state;
  assert.deepEqual(baby.family.kids.at(-1), { born: 84, pts: 0, stage: 0 }); assert.equal(baby.s.happy, 130);
  const talent = fixture('kid_talent'); talent.family.kids.unshift({ born: 0, pts: 2, stage: 4 }); talent.family.kids[1].pts = 9;
  const trained = act(talent, 'ev:0').state; assert.deepEqual(trained.family.kids.map(k => k.pts), [2, 9]);
  const wedding = act(fixture('kid_wedding'), 'ev:0').state;
  assert.equal(wedding.timers[K.married(0)], 148); assert.equal(wedding.timers[K.points], 300);
  assert.ok(!eventCandidates(wedding).some(e => e.id === 'kid_wedding'));
  assert.ok(eventCandidates(wedding).some(e => e.id === 'grandchild'));
});

test('all three wedding popup prices apply existing marriage/dual setup and every nested popup has an exit', () => {
  const proposal = act(fixture('proposal'), 'ev:0').state;
  assert.deepEqual(options(proposal).map(o => o.cost), [300, 1200, 3500, 0]);
  for (const i of [0, 1, 2]) {
    const married = act(structuredClone(proposal), `wed:${i}`).state;
    assert.equal(married.family.marriedAt, married.turn); assert.ok(familyChoices(married).exclusive);
    assert.equal(choose(married, 'skip').state.family.dual, false);
  }
  for (const [id, index, branch] of [['proposal', 0, 'sure'], ['housing_boom', 0, 'sure'], ['housing_bust', 0, 'sure'],
    ['franchise', 1, 'success'], ['early_retire', 0, 'sure'], ['headhunter', 0, 'sure']] as const) {
    const opened = act(fixture(id), `ev:${index}`, branch).state;
    const exit = options(opened).find(o => o.title === '그냥 지나간다' && o.enabled)!; assert.ok(exit, id);
    const closed = choose(opened, exit.id).state; assert.equal(closed.turn, opened.turn); assert.equal(closed.phase, 'action');
  }
});

test('rent, lost deposit, remodel value and car breakdown have lasting, bounded effects', () => {
  const rented = act(fixture('rent_hike'), 'ev:0').state;
  assert.equal(derived(rented).upkeep.lines.find(l => l.label === '월세 인상분')!.amount, -5);
  rented.phase = 'event'; rented.eventId = 'rent_hike'; rented.board.step = 'space';
  assert.equal(act(rented, 'ev:1').state.timers[K.rent], undefined);
  const deposit = act(fixture('jeonse_alarm'), 'ev:1', 'fail').state; assert.equal(deposit.home!.deposit, 900);
  const house = fixture('remodel'), next = act(house, 'ev:0').state;
  assert.equal(derived(next).netWorth - derived(house).netWorth, -200);
  const sale = eventEstateOffers({ ...next, board: { ...next.board, pos: 'B-o7', step: 'space' } }, true).find(o => o.action === 'sell')!;
  assert.ok(sale); assert.equal(sale.price, 8600);
  const car = act(fixture('car_trouble'), 'ev:1').state;
  car.board.pos = 'A-o0'; car.board.step = 'pick'; car.board.dice = [3, 4];
  assert.equal(eventCarState(car).s.car, 0); assert.equal(car.s.car, 2);
  assert.deepEqual(reachable(car), reachable({ ...car, s: { ...car.s, car: 0 } }));
  const moved = choose(car, `go:${reachable(car)[0].node}`).state; assert.equal(moved.s.car, 2);
  car.turn += 4; assert.equal(eventCarState(car).s.car, 2);
});

test('housing index changes once on draw even when skipped; bargain popup discounts one purchase by 5%', () => {
  for (const [id, change] of [['housing_boom', 15], ['housing_bust', -12]] as const) {
    const s = fixture(id); s.phase = 'action'; s.eventId = null; s.board.pos = 'A-o4'; s.board.step = 'pick'; s.board.dice = [1, 1];
    s.seen = Object.fromEntries(ALL_EVENTS.filter(e => e.id !== id).map(e => [e.id, s.turn]));
    const drawn = choose(s, 'go:A-o5').state; assert.equal(drawn.eventId, id); assert.equal(drawn.s.homeIndex, 100 + change);
    assert.equal(choose(drawn, 'skip').state.s.homeIndex, 100 + change);
  }
  const open = act(fixture('housing_bust'), 'ev:0').state;
  const bought = act(open, 'home:buy:3').state;
  assert.equal(bought.s.money, open.s.money - 5700); assert.equal(bought.estates.at(-1)!.paid, 5700);
  assert.equal(bought.board.pos, open.board.pos); assert.equal(bought.timers[K.popup], undefined);
});

test('dog cost accrues every season; annual happiness and health protection timers survive saves', () => {
  const dog = act(fixture('stray_dog'), 'ev:0').state;
  assert.equal(derived(dog).upkeep.lines.find(l => l.label === '반려견 생활비')!.amount, -5);
  dog.turn = 85; const close = choose(dog, 'end').state;
  assert.equal(close.board.ledger['반려견 생활비'], -5);
  const annual = yearEnd({ ...dog, turn: 88 }); assert.equal(annual.s.happy, dog.s.happy + 2);
  assert.deepEqual(yearEnd(annual), annual);
  const healthy = act(fixture('health_check'), 'ev:0').state;
  assert.equal(healthy.timers[K.healthyUntil], healthy.turn + 8); assert.deepEqual(restore(healthy), healthy);
});

test('promotion, demotion, performance, warning, forced relocation and retirement use career state', () => {
  const promoted = act(fixture('special_promo'), 'ev:0').state;
  assert.equal(promoted.job.rank, 3); assert.equal(promoted.job.perf, 60);
  const parachute = act(fixture('parachute'), 'ev:0').state; assert.equal(parachute.job.rank, 3); assert.equal(parachute.job.perf, 40);
  assert.equal(act(fixture('team_fault'), 'ev:1', 'fail').state.job.rank, 1);
  assert.equal(act(fixture('audit_note'), 'ev:0').state.job.warn, 1);
  for (const [id, destination, bit] of [['posting', 'C-o0', 4], ['hq_call', 'B-o0', 2]] as const) {
    const next = act(fixture(id), 'ev:0').state; assert.equal(next.board.pos, destination); assert.ok(next.board.visited & bit);
    assert.deepEqual(next.board.ledger, {}); assert.equal(next.board.step, 'bonus');
  }
  const laid = fixture('layoff'), pay = careerSalary(laid);
  assert.equal(act(laid, 'ev:0').state.s.money, laid.s.money + pay * 8);
  const fired = act(fixture('layoff'), 'ev:1', 'fail').state; assert.equal(fired.status, 'jobless'); assert.equal(fired.track, null);
  const retire = fixture('early_retire'), open = act(retire, 'ev:0').state;
  for (const i of [0, 1]) {
    const next = act(structuredClone(open), `event:retire:${i}`).state;
    assert.equal(next.s.money, retire.s.money + Math.floor(Math.floor(careerSalary(retire) * 44 / 8) * 150 / 100));
    assert.equal(next.status, i ? 'retired' : 'jobless'); assert.equal(next.ending, null);
  }
});

test('strike removes only this season salary; sabbatical halves exactly two salary accruals', () => {
  const strike = act(fixture('strike'), 'ev:0', 'fail').state;
  const lines = derived(strike).upkeep.lines;
  assert.equal(lines.find(l => l.label === '급여')!.amount + lines.find(l => l.label === '사건 급여 조정')!.amount, 0);
  assert.ok(!derived({ ...strike, turn: strike.turn + 1 }).upkeep.lines.some(l => l.label === '사건 급여 조정'));
  const holiday = act(fixture('sabbatical'), 'ev:0').state;
  assert.equal(holiday.s.stamina, holiday.s.capStamina);
  for (const i of [0, 1, 2]) {
    const at = { ...holiday, turn: holiday.turn + i }, rows = derived(at).upkeep.lines;
    const pay = rows.find(l => l.label === '급여')!.amount, adjustment = rows.find(l => l.label === '사건 급여 조정')?.amount ?? 0;
    assert.equal(pay + adjustment, i < 2 ? Math.floor(pay / 2) : pay);
  }
});

test('shop rewards target first holding, discount one expansion, slump four seasons and sell at 70%', () => {
  const s = fixture('shop_hit'); s.holdings = [{ id: 'farm', level: 1, paid: 2500 }];
  assert.equal(act(s, 'ev:1').state.s.money - s.s.money, 280);
  const discount = act(fixture('shop_hit'), 'ev:0').state;
  discount.board.pos = WORLD.find(n => n.map === 'B' && n.kind === 'biz')!.id; discount.board.step = 'space';
  const upgraded = act(discount, 'biz:up:drone_cafe').state;
  assert.equal(discount.s.money - upgraded.s.money, 504); assert.equal(upgraded.timers[K.shopDiscount], undefined);
  const slump = act(fixture('shop_slump'), 'ev:1').state;
  for (const offset of [0, 3, 4]) assert.equal(eventShopIncome({ ...slump, turn: slump.turn + offset }, 'drone_cafe'), offset < 4 ? 17 : 35);
  const sold = act(fixture('shop_slump'), 'ev:2').state; assert.equal(sold.holdings.length, 0); assert.equal(sold.s.money, 100840);
});

test('franchise negotiation is free, purchase costs 2200/3000 and creates distinct manageable shops earning 90', () => {
  for (const negotiated of [false, true]) {
    const s = fixture('franchise');
    const open = act(s, negotiated ? 'ev:1' : 'ev:0', negotiated ? 'success' : 'sure').state;
    const bought = negotiated ? act(open, 'event:franchise').state : open;
    const holding = bought.holdings.at(-1)!;
    assert.equal(holding.paid, negotiated ? 2200 : 3000); assert.equal(eventShopIncome(bought, holding.id), 90);
    bought.board.pos = WORLD.find(n => n.map === 'E' && n.kind === 'biz')!.id; bought.board.step = 'space';
    const upgraded = act(bought, `biz:up:${holding.id}`).state;
    assert.equal(eventShopIncome(upgraded, holding.id), 135);
    upgraded.board.step = 'space'; const sold = act(upgraded, `biz:sell:${holding.id}`).state;
    assert.ok(!sold.holdings.some(h => h.id === holding.id));
  }
});

test('sponsor max equipment pays 300 and business/drones apply exact unscaled rewards and losses', () => {
  const sponsor = fixture('gear_sponsor'); sponsor.s.gear = 3;
  assert.equal(act(sponsor, 'ev:0').state.s.money, 100300);
  const order = act(fixture('big_order'), 'ev:0', 'success').state;
  assert.equal(order.s.contracts, 2); assert.equal(order.s.value, 20800); assert.equal(order.s.money, 99500);
  const project = act(fixture('gov_project'), 'ev:0', 'success').state; assert.equal(project.s.money, 102300);
  const show = act(fixture('drone_show'), 'ev:0', 'success').state; assert.equal(show.s.money, 100700);
  const failure = act(fixture('drone_show'), 'ev:0', 'fail').state;
  assert.equal(failure.s.cond, 70); assert.equal(failure.s.stamina, 50); assert.equal(failure.s.flights, 0);
});

test('dominance catches planted numeric/ongoing dominance and preserves only the disclosed spec exception', () => {
  const report = dominanceReport(); assert.equal(report.events, 120); assert.equal(report.responses, 272);
  assert.deepEqual(report.missing, []); assert.deepEqual(report.dominated, []);
  assert.deepEqual(report.exceptions, ['headhunter:1>2', 'invest_scam:0>1', 'tax_audit2:0>1']);
  assert.deepEqual(checkChoices('bad', [answer('A', { happy: 5 }), answer('B', { happy: 2 })]), ['bad:0>1']);
  assert.deepEqual(checkChoices('rent', [answer('A', {}, 0, { rent: 5 }), answer('B', {}, 0, { rent: 8 })]), ['rent:0>1']);
  assert.deepEqual(checkChoices('risk', [answer('A', { money: 5 }), gamble('B', 60, effect({ money: 20 }), effect({ money: -10 }))]), []);
});

const exclusions: [string, (s: GameState) => void][] = [
  ['blind_date', s => { s.turn = 8; }], ['old_friend', s => { s.s.net = 29; }],
  ['proposal', s => { s.family.partnerAt = s.turn - 3; }], ['proposal', s => { s.home!.tier = 1; }],
  ['baby_news', s => { s.turn = 108; }], ['baby_news', s => { s.home!.tier = 2; }],
  ['baby_news', s => { s.family.kids = Array.from({ length: 3 }, () => ({ born: 0, pts: 0, stage: 4 })); }],
  ['parents_60', s => { s.turn = 40; }], ['parents_60', s => { s.turn = 108; }],
  ['couple_crisis', s => { s.job.perf = 69; }], ['kid_talent', s => { s.family.kids[0].born = s.turn - 24; }],
  ['kid_teen', s => { s.family.kids[0].born = s.turn - 76; }], ['family_trip', s => { s.family.marriedAt = null; }],
  ['kid_wedding', s => { s.family.kids[0].born = s.turn - 108; }], ['grandchild', s => { s.timers = {}; }],
  ['rent_hike', s => { s.home!.tier = 2; }], ['jeonse_alarm', s => { s.home!.tier = 1; }],
  ['housing_boom', s => { s.turn = 20; }], ['housing_bust', s => { s.turn = 20; }],
  ['remodel', s => { s.home!.tier = 2; }], ['noise', s => { s.home = { map: 'F', tier: 5, deposit: 0 }; }],
  ['car_trouble', s => { s.s.car = 0; }], ['world_trip', s => { s.s.money = 2999; }],
  ['luxury_sale', s => { s.board.pos = 'A-o5'; }], ['tax_refund', s => { s.track = 'creator'; }],
  ['health_check', s => { s.turn = 60; }], ['special_promo', s => { s.job.perf = 79; }],
  ['special_promo', s => { s.job.rank = 4; }], ['parachute', s => { s.s.net = 149; }],
  ['team_fault', s => { s.job.rank = 0; }], ['posting', s => { s.board.pos = 'A-o5'; }],
  ['hq_call', s => { s.board.pos = 'B-o5'; }], ['headhunter', s => { s.s.xp = 419; }],
  ['headhunter', s => { s.job.rank = 1; }], ['layoff', s => { s.track = 'public'; }],
  ['layoff', s => { s.turn = 60; }], ['overtime_rush', s => { s.track = 'creator'; }],
  ['mentor', s => { s.job.rank = 2; }], ['strike', s => { s.track = 'public'; }],
  ['best_staff', s => { s.job.perf = 84; }], ['audit_note', s => { s.job.perf = 40; }],
  ['sabbatical', s => { s.job.total = 39; }], ['early_retire', s => { s.turn = 120; }],
  ['viral', s => { s.s.drone = 3; }], ['gear_sponsor', s => { s.s.rep = 104; }],
  ['big_order', s => { s.track = 'clerk'; }], ['shop_hit', s => { s.holdings = []; }],
  ['shop_slump', s => { s.holdings = []; }], ['franchise', s => { s.s.biz = 104; }],
  ['franchise', s => { s.holdings = Array.from({ length: 4 }, () => ({ id: 'farm', level: 1, paid: 2500 })); }],
  ['partner_exit', s => { s.track = 'solo'; }], ['gov_project', s => { s.s.rep = 104; }],
  ['export_deal', s => { s.s.value = 19999; }], ['patent', s => { s.flags = []; }],
  ['drone_show', s => { s.s.drone = 2; }], ['bad_review', s => { s.holdings = []; }],
];
test('eligibility excludes every unmet age, grade, map, family, job and capacity boundary', () => {
  for (const [id, invalidate] of exclusions) {
    const s = fixture(id); invalidate(s); assert.ok(!eventCandidates(s).some(e => e.id === id), id);
  }
  const tired = fixture('couple_crisis'); tired.job.perf = 0; tired.timers.family_last_exhausted = 2;
  assert.ok(eventCandidates(tired).some(e => e.id === 'couple_crisis'));
  const creator = fixture('viral'); creator.track = 'creator'; creator.s.drone = 0;
  assert.ok(eventCandidates(creator).some(e => e.id === 'viral'));
});

test('one-time events and each child wedding stay consumed after decline, reload and cooldown', () => {
  for (const id of ['parents_60', 'stray_dog', 'sabbatical']) {
    const s = fixture(id); s.seen[id] = s.turn - 24;
    assert.ok(!eventCandidates(s).some(e => e.id === id)); assert.deepEqual(restore(s), s);
  }
  let s = fixture('kid_wedding'); s.phase = 'action'; s.eventId = null;
  s.board.pos = 'A-o4'; s.board.step = 'pick'; s.board.dice = [1, 1];
  s.family.kids.push({ born: 24, pts: 0, stage: 4 });
  s.seen = Object.fromEntries(ALL_EVENTS.filter(e => e.id !== 'kid_wedding').map(e => [e.id, s.turn]));
  const drawn = choose(s, 'go:A-o5').state; assert.equal(drawn.timers[K.kid], 0);
  s = choose(drawn, 'skip').state; assert.equal(s.timers[K.weddingSeen(0)], 148);
  assert.equal(s.timers[K.married(0)], undefined); s.turn += 24; s.s.capStamina = 80;
  s.status = 'retired'; s.track = null;
  s.board.pos = 'A-o4'; s.board.step = 'pick'; s.board.dice = [1, 1];
  s.seen = Object.fromEntries(ALL_EVENTS.filter(e => e.id !== 'kid_wedding').map(e => [e.id, s.turn]));
  const second = choose(restore(s)!, 'go:A-o5').state; assert.equal(second.timers[K.kid], 1);
  const married = choose(second, 'ev:2').state; assert.equal(married.timers[K.married(1)], 172);
  married.turn += 24; assert.ok(!eventCandidates(married).some(e => e.id === 'kid_wedding'));
});

test('headhunter pays two original-rank salaries once on completed same-rank entry, never on decline/failure', () => {
  const s = fixture('headhunter'); s.s.theory = 180;
  const open = act(s, 'ev:0').state, pay = careerSalary(s) * 2;
  const hired = act(structuredClone(open), 'job:service').state;
  assert.equal(hired.job.rank, 2); assert.equal(hired.s.money - open.s.money, pay);
  assert.equal(hired.timers[K.headhunter], undefined); assert.equal(hired.turn, open.turn);
  const declined = act(structuredClone(open), 'job:none').state; assert.equal(declined.s.money, open.s.money);
  const failed = act(structuredClone(open), 'job:public', 'fail').state;
  assert.equal(failed.s.money, open.s.money - 50); assert.equal(failed.track, 'clerk');
  assert.equal(failed.timers[K.headhunter], undefined);
});

test('housing index bounds survive initial market shocks and renovated rentals earn the extra 1.2%', () => {
  for (const [id, index, expected] of [['housing_boom', 195, 200], ['housing_bust', 60, 60]] as const) {
    const s = fixture(id); s.s.homeIndex = index; s.phase = 'action'; s.eventId = null;
    s.board.pos = 'A-o4'; s.board.step = 'pick'; s.board.dice = [1, 1];
    s.seen = Object.fromEntries(ALL_EVENTS.filter(e => e.id !== id).map(e => [e.id, s.turn]));
    const next = choose(s, 'go:A-o5').state; assert.equal(next.s.homeIndex, expected); assert.deepEqual(restore(next), next);
  }
  const s = act(fixture('remodel'), 'ev:0').state;
  s.board.pos = WORLD.find(n => n.map === 'B' && n.kind === 'estate')!.id; s.board.step = 'space';
  const moved = act(s, 'home:rent:1').state;
  assert.equal(derived(moved).upkeep.lines.find(l => l.label === '리모델링 임대 수입')!.amount, 7);
});

test('ordinary events drawn on contest tiles get neither racer prize multipliers nor contest wins', () => {
  const s = fixture('drone_show'); s.track = 'racer'; s.job.rank = 3; s.s.rank = 3;
  s.board.pos = WORLD.find(n => n.kind === 'contest')!.id;
  const result = act(s, 'ev:0', 'success');
  assert.equal(result.state.s.money - s.s.money, 700); assert.equal(result.state.board.contests, s.board.contests);
});

function drawOnly(s: GameState, id: string): GameState {
  const tile = WORLD.find(n => n.map === s.board.pos[0] && n.kind === 'event')!;
  s.phase = 'action'; s.eventId = null; s.board.step = 'pick'; s.board.dice = [1, 1]; s.s.car = 2;
  s.board.pos = WORLD.find(n => n.next.includes(tile.id))!.id;
  s.seen = Object.fromEntries(ALL_EVENTS.filter(e => e.id !== id).map(e => [e.id, s.turn]));
  const drawn = choose(s, `go:${tile.id}`).state;
  assert.equal(drawn.eventId, id); assert.deepEqual(restore(drawn), drawn);
  return drawn;
}

test('every one of the 120 events is actually drawn from a reachable tile with seeded replay', () => {
  const drawn = new Set<string>();
  for (const row of ALL_EVENTS) drawn.add(drawOnly(fixture(row.id), row.id).eventId!);
  assert.equal(drawn.size, 120);
});

test('all 82 new titles, bodies and response wordings are documented; v1 still has its 38 rows', () => {
  const doc = readFileSync(new URL('../docs/story-events.md', import.meta.url), 'utf8');
  const [legacy, modern] = doc.split('## v2 인생 보드');
  assert.equal((legacy.match(/^\| \*\*/gm) ?? []).length, 38);
  assert.equal((modern.match(/^\| `/gm) ?? []).length, 82);
  for (const row of LIFE_EVENTS) {
    const line = modern.split('\n').find(line => line.startsWith(`| \`${row.id}\` |`))!;
    assert.ok(line?.includes(row.title), row.id); assert.ok(line.includes(row.text), row.id);
    for (const choice of materialize(row, fixture(row.id)).choices) assert.ok(line.includes(choice.title), `${row.id}/${choice.title}`);
  }
});

test('every F/H event can be the biennial life draw and resumes its untouched spin after every response', () => {
  for (const row of [...EVENTS_F, ...EVENTS_H]) {
    const s = fixture(row.id); s.family.kids = [];
    while (s.turn % 8 !== 4) s.turn++;
    s.phase = 'action'; s.eventId = null; s.board.step = 'spin'; s.board.dice = [];
    s.seen = Object.fromEntries(ALL_EVENTS.filter(e => e.id !== row.id).map(e => [e.id, s.turn]));
    const drawn = lifeEvent(s); assert.equal(drawn.eventId, row.id); assert.deepEqual(restore(drawn), drawn);
    for (const [index, choice] of materialize(row, drawn).choices.entries()) {
      for (const branch of choice.roll ? ['success', 'fail'] as const : ['sure'] as const) {
        const next = act(structuredClone(drawn), `ev:${index}`, branch).state;
        assert.equal(next.turn, drawn.turn); assert.equal(next.board.step, 'spin');
        assert.deepEqual(next.board.dice, []); assert.equal(next.s.acts, drawn.s.acts);
      }
    }
  }
});

const excluded2: [string, (s: GameState) => void][] = [
  ['stock_tip', s => { s.s.money = 499; }], ['coin_fever', s => { s.s.money = 999; }],
  ['coin_fever', s => { s.timers[K2.coins] = 2; }], ['invest_scam', s => { s.s.money = 1999; }],
  ['inheritance', s => { s.turn = 83; }], ['crash', s => { s.fund.amount = 0; }], ['bull', s => { s.fund.amount = 0; }],
  ['donation', s => { s.s.money = 999; }], ['tax_audit2', s => { s.s.debt = 200000; }],
  ['burnout', s => { s.timers[K2.lowStamina] = 1; }], ['wrist', s => { s.track = 'clerk'; }],
  ['illness', s => { s.turn = 103; }], ['illness', s => { s.timers[K.healthyUntil] = s.turn + 1; }],
  ['parents_care', s => { s.turn = 103; }], ['parents_care', s => { s.turn = 168; }],
  ['car_accident', s => { s.s.car = 0; }], ['midlife', s => { s.turn = 83; }], ['midlife', s => { s.turn = 128; }],
  ['invite_d', s => { s.board.pos = 'D-o0'; }], ['invite_d', s => { for (const key of ['theory', 'skill', 'xp', 'rep', 'teach', 'biz', 'net', 'support'] as const) s.s[key] = 0; }],
  ['field_call', s => { s.board.pos = 'C-o0'; }], ['field_call', s => { s.track = 'clerk'; }],
  ['abroad', s => { s.job.perf = 69; }], ['abroad', s => { s.track = 'pilot'; }],
  ['expo_e', s => { s.s.biz = 59; }], ['expo_e', s => { s.board.pos = 'E-o0'; }],
  ['holiday', s => { s.turn = 84; }], ['hometown', s => { s.turn = 43; }], ['hometown', s => { s.board.pos = 'A-o0'; }],
  ['fast_track', s => { s.track = 'clerk'; }], ['fast_track', s => { s.board.pos = 'B-o0'; }],
  ['d_scout', s => { s.track = 'engineer'; }], ['d_scout', s => { s.board.pos = 'B-o0'; }],
  ['d_scout', s => { s.flags = []; s.s.theory = 0; s.s.skill = 0; }],
  ['second_act', s => { s.turn = 143; }], ['memoir', s => { s.turn = 163; }], ['memoir', s => { s.s.rep = 104; }],
  ['foundation', s => { s.s.debt = 200000; }], ['villa', s => { s.s.debt = 200000; }],
  ['cruise', s => { s.turn = 163; }], ['successor', s => { s.turn = 183; }], ['successor', s => { s.holdings = []; }],
];
test('E–H enforce each money, age, map, career, season, health and asset gate', () => {
  for (const [id, change] of excluded2) {
    const s = fixture(id); assert.ok(eventCandidates(s).some(e => e.id === id), id);
    change(s); assert.ok(!eventCandidates(s).some(e => e.id === id), id);
  }
  const s = fixture('second_act'); s.s.net = 99; assert.equal(options(s).find(o => o.id === 'ev:1')!.enabled, false);
  s.s.net = 100; assert.equal(options(s).find(o => o.id === 'ev:1')!.enabled, true);
});

test('coin sightings stop at two, once-only events stop at one, and other E–H events wait 24 seasons', () => {
  let coin = drawOnly(fixture('coin_fever'), 'coin_fever'); assert.equal(coin.timers[K2.coins], 1);
  coin = choose(coin, 'skip').state; coin.turn += 24;
  coin = drawOnly(coin, 'coin_fever'); assert.equal(coin.timers[K2.coins], 2);
  coin = choose(coin, 'ev:1').state; coin.turn += 24;
  assert.ok(!eventCandidates(coin).some(e => e.id === 'coin_fever'));
  for (const row of [...EVENTS_E, ...EVENTS_F, ...EVENTS_G, ...EVENTS_H]) {
    const s = fixture(row.id); s.seen[row.id] = s.turn;
    s.turn += 23; assert.ok(!eventCandidates(s).some(e => e.id === row.id), row.id);
    s.turn++;
    // Eligibility may independently expire (season, age or career); the universal rows establish the boundary.
    if (row.once) assert.ok(!eventCandidates(s).some(e => e.id === row.id), row.id);
    else if (['lotto', 'wallet', 'fitness', 'marathon'].includes(row.id)) assert.ok(eventCandidates(s).some(e => e.id === row.id));
  }
});

test('E money outcomes keep the exact costs, gains, fractional tax and chance formulas', () => {
  for (const [id, index, success, failure] of [['lotto', 0, 2990, -10], ['stock_tip', 0, 800, -350],
    ['stock_tip', 1, 160, -70], ['coin_fever', 0, 3000, -800], ['invest_scam', 1, 0, -1500]] as const) {
    const s = fixture(id);
    assert.equal(act(s, `ev:${index}`, 'success').state.s.money - s.s.money, success);
    assert.equal(act(s, `ev:${index}`, 'fail').state.s.money - s.s.money, failure);
  }
  const s = fixture('tax_audit2'); s.s.money += 17;
  assert.equal(act(s, 'ev:1', 'fail').state.s.money - s.s.money, -Math.floor(derived(s).netWorth * 3 / 100));
  for (const [theory, chance] of [[0, 55], [149, 69], [300, 85], [999, 85]]) {
    const scam = fixture('invest_scam'); scam.s.theory = theory;
    assert.equal(options(scam).find(o => o.id === 'ev:1')!.roll!.chance, chance);
  }
  const lucky = fixture('invest_scam'); lucky.s.theory = 300; lucky.flags.push(ASSET_KEYS.dream);
  assert.equal(act(lucky, 'ev:1', 'success').result.roll!.chance, 95);
});

test('fund shocks apply once before responses, withdrawals are exact and preview includes fund balances', () => {
  for (const [id, shocked] of [['crash', 800], ['bull', 1121]] as const) {
    const s = drawOnly(fixture(id), id); assert.equal(s.fund.amount, shocked);
    assert.equal(choose(s, 'skip').state.fund.amount, shocked);
    assert.equal(restore(s)!.fund.amount, shocked);
    const out = act(s, id === 'crash' ? 'ev:1' : 'ev:0');
    const amount = id === 'crash' ? shocked : 560;
    assert.equal(out.state.fund.amount, shocked - amount); assert.equal(out.state.s.money - s.s.money, amount);
  }
});

test('fund popup reuses deposit/withdraw/type choices, exits freely and grants a one-year bonus only on deposit', () => {
  const open = act(drawOnly(fixture('crash'), 'crash'), 'ev:0').state;
  assert.equal(options(open).find(o => o.id === 'skip')!.title, '그냥 지나간다');
  for (const option of options(open).filter(o => o.enabled)) act(structuredClone(open), option.id);
  const skipped = act(structuredClone(open), 'skip').state;
  assert.equal(skipped.turn, open.turn); assert.equal(skipped.timers[K2.fundBonus], undefined);
  assert.equal(act(structuredClone(open), 'fund:out:100').state.timers[K2.fundBonus], undefined);
  const deposit = act(structuredClone(open), 'fund:in:100').state;
  assert.equal(deposit.s.money, open.s.money - 100); assert.equal(deposit.fund.amount, open.fund.amount + 100);
  assert.equal(deposit.timers[K2.fundBonus], 15); assert.equal(deposit.timers[K2.fundPopup], undefined);
  for (const kind of [0, 1, 2] as const) for (const rng of [1, 10000]) {
    const s = structuredClone(deposit); s.turn = 88; s.fund = { kind, amount: 1007 }; s.rng = rng;
    const preview = structuredClone(s), chance = [100, 60, 45][kind];
    const win = chance === 100 || randInt(preview, 100) < chance;
    const rate = win ? [4, 14, 35][kind] : [4, -8, -20][kind];
    const next = yearEnd(s); assert.equal(next.fund.amount, 1007 + Math.floor(1007 * (rate + 15) / 100));
    assert.equal(next.rng, preview.rng); assert.equal(next.timers[K2.fundBonus], undefined); assert.deepEqual(yearEnd(next), next);
  }
  const empty = structuredClone(deposit); empty.turn = 88; empty.fund.amount = 0;
  const expired = yearEnd(empty); assert.equal(expired.timers[K2.fundBonus], undefined); assert.equal(expired.rng, empty.rng);
});

test('health clocks use pre-refill closing stamina, reset consecutive burnout, and expire recovery effects exactly', () => {
  const close = (s: GameState) => { s.phase = 'action'; s.eventId = null; s.board.step = 'bonus'; return choose(s, 'end').state; };
  let s = fixture('burnout'); delete s.timers[K2.lowStamina]; s.s.stamina = 39;
  s = close(s); assert.equal(s.timers[K2.lowStamina], 1); s.s.stamina = 39;
  s = close(s); assert.equal(s.timers[K2.lowStamina], 2); assert.ok(eventCandidates(s).some(e => e.id === 'burnout'));
  s.s.stamina = 40; s = close(s); assert.equal(s.timers[K2.lowStamina], 0);
  for (const [id, option, duration, gain] of [['parents_care', 'ev:1', 4, -10], ['fitness', 'ev:0', 8, 5]] as const) {
    const health = act(fixture(id), option).state;
    for (let n = 0; n <= duration; n++) assert.equal(eventRecovery({ ...health, turn: health.turn + n }), n < duration ? gain : 0);
    const ordinary = structuredClone(health); delete ordinary.timers[K2.careUntil]; delete ordinary.timers[K2.fitnessUntil];
    health.s.stamina = ordinary.s.stamina = 0;
    assert.equal(close(health).s.stamina - close(ordinary).s.stamina, gain);
  }
});

test('wrist changes real flight odds for four seasons; illness clamps current stamina and the permanent cap', () => {
  const s = act(fixture('wrist'), 'ev:1').state; s.board.pos = 'B-o2'; s.board.step = 'bonus';
  const action = WORLD.find(n => n.place === 'farm')!; s.board.pos = action.id; s.s.stamina = 70; s.s.skill = 90; s.s.drone = 2;
  const plain = structuredClone(s); delete plain.timers[K2.wristUntil];
  const flight = options(plain).find(o => o.roll?.crashPct !== undefined)!; assert.ok(flight);
  assert.equal(options(s).find(o => o.id === flight.id)!.roll!.chance, flight.roll!.chance - 10);
  s.turn += 4; assert.equal(options(s).find(o => o.id === flight.id)!.roll!.chance, flight.roll!.chance);
  for (const [cap, option, expected] of [[100, 'ev:1', 95], [65, 'ev:1', 60], [65, 'ev:2', 60]] as const) {
    const ill = fixture('illness'); ill.s.capStamina = ill.s.stamina = cap;
    const next = act(ill, option).state;
    assert.equal(next.s.capStamina, expected); assert.equal(next.s.stamina, expected); assert.deepEqual(restore(next), next);
  }
  for (const [stamina, chance] of [[59, 40], [60, 70]]) {
    const race = fixture('marathon'); race.s.stamina = stamina;
    assert.equal(options(race).find(o => o.id === 'ev:0')!.roll!.chance, chance);
  }
});

test('travel moves to the specified start without tolls/laps and both job popups can exit or hire', () => {
  for (const [id, pos, money] of [['invite_d', 'D-o0', 0], ['field_call', 'C-o0', 250], ['expo_e', 'E-o0', 0],
    ['holiday', 'F-o0', -100], ['hometown', 'A-o0', 0]] as const) {
    const s = fixture(id), next = act(s, 'ev:0').state;
    assert.equal(next.board.pos, pos); assert.equal(next.s.money - s.s.money, money);
    assert.deepEqual(next.board.lapAt, s.board.lapAt); assert.equal(next.board.laps, s.board.laps);
    assert.ok(next.board.visited & (1 << 'ABCDEF'.indexOf(pos[0])));
  }
  const invitation = act(fixture('invite_d'), 'ev:1').state; assert.ok(invitation.flags.includes('invite'));
  for (const id of ['midlife', 'd_scout']) {
    const s = fixture(id); s.job.changedAt = s.turn;
    const open = act(s, 'ev:0').state, list = options(open);
    assert.equal(list.find(o => o.id === 'job:none')!.title, '그냥 지나간다');
    assert.equal(act(structuredClone(open), 'job:none').state.turn, open.turn);
    const hire = list.find(o => o.enabled && o.id !== 'job:none')!; assert.ok(hire);
    const hired = act(structuredClone(open), hire.id, hire.roll ? 'success' : 'sure').state;
    assert.equal(hired.timers[JOB_RULES.popup], undefined); assert.equal(hired.timers[K2.jobs], undefined);
    if (id === 'd_scout') assert.ok(list.every(o => ['job:engineer', 'job:inspector', 'job:film', 'job:atc', 'job:racer', 'job:none'].includes(o.id)));
  }
});

test('abroad closes exactly two paid seasons, including seeded year-end changes and the terminal turn', () => {
  for (const turn of [84, 86, 87, 202, 203]) {
    const s = fixture('abroad'); s.turn = turn;
    if (turn >= 164) { s.track = 'company'; s.s.capStamina = 80; }
    s.fund = { kind: 2, amount: 1007 };
    const next = act(s, 'ev:0').state;
    assert.equal(next.turn, Math.min(204, turn + 2)); assert.deepEqual(restore(next), next);
    if (turn === 84) { assert.equal(next.board.ledger['급여'], Math.floor(careerSalary(s) * 110 / 100) * 2); assert.equal(next.s.theory, s.s.theory + 40); }
    if (turn >= 202) assert.equal(next.phase, 'ended');
  }
});

test('fast track awards the specified primary skill and tenure, sports car sets tier three', () => {
  for (const [track, stat] of [['engineer', 'theory'], ['inspector', 'skill'], ['film', 'skill'], ['atc', 'theory'], ['racer', 'skill']] as const) {
    const s = fixture('fast_track'); s.track = track;
    const next = act(s, 'ev:0').state;
    assert.equal(next.s[stat] - s.s[stat], 30); assert.equal(next.job.tenure - s.job.tenure, 4);
    assert.equal(next.s.money - s.s.money, -600); assert.equal(next.s.stamina - s.s.stamina, -30);
  }
  const car = act(fixture('midlife'), 'ev:1').state; assert.equal(car.s.car, 3);
});

test('foundation awards persist; villa respects residence, deposit refunds and the existing property limit', () => {
  for (const [choice, money, points, happy, rep] of [[0, -30000, 3000, 60, 50], [1, -3000, 300, 15, 0]]) {
    const s = fixture('foundation'), next = act(s, `ev:${choice}`).state;
    assert.equal(next.s.money - s.s.money, money); assert.equal(next.timers[K.points], points);
    assert.equal(next.s.happy - s.s.happy, happy); assert.equal(next.s.rep - s.s.rep, rep);
  }
  const s = fixture('villa'), owned = act(structuredClone(s), 'ev:0').state;
  assert.deepEqual(owned.estates, [{ map: 'F', tier: 5, paid: 12000 }]); assert.deepEqual(owned.home, s.home);
  s.home = { map: 'A', tier: 2, deposit: 1500 };
  const residence = act(structuredClone(s), 'ev:0').state;
  assert.deepEqual(residence.home, { map: 'F', tier: 5, deposit: 0 }); assert.equal(residence.s.money - s.s.money, -10500);
  s.home.tier = 3; s.estates = Array.from({ length: 3 }, () => ({ map: 'B' as const, tier: 3, paid: 6000 }));
  assert.equal(options(s).find(o => o.id === 'ev:0')!.enabled, false); assert.ok(options(s).find(o => o.id === 'ev:2')!.enabled);
});

test('successor preparation counts at settlement only and sale converts/removes every valued organization', () => {
  for (const track of ['company', 'academy', null] as const) {
    const s = fixture('successor'); s.track = track; s.status = track ? 'working' : 'retired'; s.s.level = 3;
    const value = organizationValue(s), prepared = act(s, 'ev:0').state;
    assert.equal(successionValue(prepared), Math.floor(value * 10 / 100));
    assert.equal(derived(prepared).netWorth, derived(s).netWorth - 1000);
    const sold = act(s, 'ev:1', 'success').state;
    assert.equal(sold.s.money - s.s.money, Math.floor(value * 110 / 100)); assert.equal(organizationValue(sold), 0);
    assert.deepEqual(sold.holdings, []); if (track) assert.equal(sold.status, 'jobless');
    const failed = act(s, 'ev:1', 'fail').state; assert.equal(organizationValue(failed), value);
  }
  const s = act(fixture('successor'), 'ev:0').state; s.turn = 203; s.phase = 'action'; s.eventId = null; s.board.step = 'bonus';
  const next = choose(s, 'end').state;
  assert.equal(next.score, Math.max(0, derived(next).netWorth + successionValue(next))
    + next.s.happy * 30 + achievementScore(next).capped);
});

test('dominance understands new ongoing costs, withdrawals and indivisible popup/sale effects', () => {
  assert.deepEqual(checkChoices('wrist', [eventAnswer('A', {}, 0, { wristWait: 2 }), eventAnswer('B', {}, 0, { wristWait: 4 })]), ['wrist:0>1']);
  assert.deepEqual(checkChoices('fund', [eventAnswer('A', { money: 100 }, 0, { fundOut: 100 }), answer('B')]), []);
  assert.deepEqual(checkChoices('sale', [gamble('A', 55, eventEffect({ money: 500 }, { sellOrganization: 1 }), effect()), answer('B')]), []);
});
