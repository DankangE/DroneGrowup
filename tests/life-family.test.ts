import assert from 'node:assert/strict';
import { test } from 'node:test';
import { choose, derived, forecast, newGame, options, restore } from '../src/life/engine.ts';
import { advanceFamily, familyAchievementPoints, familyChoices, familyPopup, yearEndFamily } from '../src/life/family.ts';
import { ECONOMY_KEYS } from '../src/life/economy.ts';
import { FAMILY_KEYS as K, HOMES } from '../src/life/life-data.ts';
import { randInt } from '../src/life/move.ts';
import { WORLD } from '../src/life/world.ts';
import type { GameState, PlaceId } from '../src/life/types.ts';

function at(place: PlaceId = 'culture'): GameState {
  const state = choose(newGame(1), 'start:self').state;
  state.turn = 8; state.s.money = 10000; state.life = 1;
  state.board.pos = WORLD.find(node => node.kind === 'life' && node.place === place)!.id;
  state.board.step = 'space'; state.board.dice = [1, 1];
  return state;
}
function married(place: PlaceId = 'hospital'): GameState {
  const state = at(place); state.flags.push('partner');
  state.family.partnerAt = 0; state.family.marriedAt = 4;
  state.home = { map: 'B', tier: 4, deposit: 0 }; return state;
}
function spring(age: number, born = 0, pts = 0, stage: 0 | 1 | 2 | 3 = 0): GameState {
  const state = married(); state.turn = Math.ceil((born + age * 4) / 4) * 4;
  state.family.kids = [{ born, pts, stage }];
  state.board.step = 'spin'; state.board.dice = [];
  return state;
}
function frozen<T>(value: T): T {
  if (value && typeof value === 'object') { Object.values(value).forEach(frozen); Object.freeze(value); }
  return value;
}
function integers(value: unknown): void {
  if (typeof value === 'number') assert.ok(Number.isSafeInteger(value), String(value));
  else if (value && typeof value === 'object') Object.values(value).forEach(integers);
}
function saved(state: GameState): GameState {
  integers(state); const restored = restore(JSON.parse(JSON.stringify(state)));
  assert.deepEqual(restored, state); return restored!;
}
function checked(state: GameState, id: string) {
  const before = structuredClone(state), card = options(frozen(state)).find(row => row.id === id)!;
  assert.ok(card.enabled, `${id}: ${card.locks}`);
  const preview = forecast(state, id), next = choose(state, id);
  assert.deepEqual(state, before); assert.deepEqual(choose(saved(state), id), next);
  assert.deepEqual(next.result.deltas, preview.branches.find(row => row.id ===
    (next.result.roll ? next.result.roll.success ? 'success' : 'fail' : 'sure'))!.deltas);
  if (next.result.roll) {
    const rng = structuredClone(state), rolled = randInt(rng, 100);
    assert.equal(next.result.roll.value, rolled); assert.equal(next.state.rng, rng.rng);
    assert.equal(next.result.roll.chance, preview.chance); assert.equal(preview.chance, card.roll!.chance);
    assert.equal(next.result.roll.success, rolled < card.roll!.chance);
    assert.equal(card.roll!.staminaPct, 0);
    assert.equal(next.state.s.wins, state.s.wins); assert.equal(next.state.s.losses, state.s.losses);
  }
  saved(next.state); return next;
}

test('happiness starts at 100 and dating is local, costs 30 and uses exact reputation odds', () => {
  assert.equal(newGame(1).s.happy, 100);
  const outcomes = new Set<boolean>();
  for (const [rep, chance] of [[0, 45], [14, 45], [15, 46], [299, 64], [300, 65], [999, 65]]) {
    for (let seed = 1; seed <= 12; seed++) {
      const state = at(seed % 2 ? 'culture' : 'waterfront_park'); state.rng = seed;
      state.s.rep = rep; state.s.stamina = seed % 2 ? 0 : 100;
      const next = checked(state, 'date'), success = next.result.roll!.success; outcomes.add(success);
      assert.equal(next.result.roll!.chance, chance); assert.equal(next.state.s.money, state.s.money - 30);
      assert.equal(next.state.family.partnerAt, success ? state.turn : null);
      assert.equal(next.state.flags.includes('partner'), success);
      assert.equal(next.state.board.step, 'bonus'); assert.equal(next.state.turn, state.turn);
      if (success) {
        const retry = structuredClone(next.state); retry.board.step = 'space';
        assert.ok(!options(retry).some(row => row.id === 'date'));
      }
    }
  }
  assert.equal(outcomes.size, 2);
  assert.ok(!options(at('park')).some(row => row.id === 'date'));
  assert.ok(!options(married('culture')).some(row => row.id === 'date'));
  const poor = at(); poor.s.money = 29;
  assert.equal(options(poor).find(row => row.id === 'date')!.enabled, false);
  assert.throws(() => choose(poor, 'date'), /disabled/);
});

for (const [wedding, cost, happy, net, rep] of [[0, 300, 20, 0, 0], [1, 1200, 35, 10, 0], [2, 3500, 50, 20, 10]]) {
  test(`wedding ${wedding}: four-season wait, tier 2 housing, price and effects, spouse-mode continuation`, () => {
    for (const place of ['wedding', 'resort'] as const) {
      let state = at(place); state.family.partnerAt = 5; state.flags.push('partner');
      assert.ok(options(state).find(row => row.id === `wed:${wedding}`)!.locks.length >= 2);
      state.home = { map: 'A', tier: 2, deposit: 1500 };
      assert.equal(options(state).find(row => row.id === `wed:${wedding}`)!.enabled, false);
      state.turn = 9;
      const next = checked(state, `wed:${wedding}`).state;
      assert.equal(next.s.money, state.s.money - cost); assert.equal(next.s.happy, state.s.happy + happy);
      assert.equal(next.s.net, state.s.net + net); assert.equal(next.s.rep, state.s.rep + rep);
      assert.equal(next.family.marriedAt, 9); assert.equal(next.board.step, 'bonus');
      assert.deepEqual(options(next).map(row => row.id), ['dual:0', 'dual:1', 'skip']);
      for (const id of ['dual:0', 'dual:1', 'skip']) {
        const picked = checked(structuredClone(next), id).state;
        assert.equal(picked.family.dual, id === 'dual:1'); assert.equal(picked.turn, next.turn);
        assert.equal(picked.board.step, next.board.step); assert.equal(picked.s.acts, next.s.acts);
        assert.equal(familyPopup(picked), null);
      }
      state = structuredClone(state); state.s.money = cost - 1;
      assert.throws(() => choose(state, `wed:${wedding}`), /disabled/);
    }
  });
}

test('spouse modes can change on life tiles; dual income and family recovery use existing accounting', () => {
  for (const mode of [0, 1]) {
    const state = married('park'); state.s.stamina = 10;
    const next = checked(state, `dual:${mode}`).state;
    assert.equal(next.family.dual, mode === 1); assert.equal(next.board.step, 'bonus');
    assert.equal(derived(next).upkeep.lines.find(row => row.label === '맞벌이 수입')?.amount ?? 0, mode ? 80 : 0);
    assert.equal(choose(next, 'end').state.s.stamina, 10 + 20 + (mode ? 0 : 3), 'home is on another map');
  }
  const state = married(); state.board.step = 'bonus'; state.s.stamina = 10;
  assert.equal(choose(state, 'end').state.s.stamina, 39, 'local tier 4 recovery plus family focus');
  const single = at(); single.board.step = 'bonus'; single.s.stamina = 10;
  assert.equal(choose(single, 'end').state.s.stamina, 30);
});

test('birth enforces marriage, age <=45, housing occupancy and the lifetime cap of three', () => {
  for (const tier of [0, 1, 2, 3, 4, 5, 6]) for (let kids = 0; kids <= 3; kids++) {
    const state = married(); state.home!.tier = tier;
    state.family.kids = Array.from({ length: kids }, () => ({ born: 4, pts: 0, stage: 0 }));
    assert.equal(options(state).find(row => row.id === 'baby')!.enabled, kids < 3 && kids < HOMES[tier].kids);
  }
  const old = married(); old.turn = (46 - 19) * 4;
  assert.throws(() => choose(old, 'baby'), /disabled/);
  const single = at('hospital'); single.home = { map: 'B', tier: 4, deposit: 0 };
  assert.throws(() => choose(single, 'baby'), /disabled/);
  const state = married(); state.turn = (45 - 19) * 4 + 3;
  const born = checked(state, 'baby').state;
  assert.deepEqual(born.family.kids, [{ born: state.turn, pts: 0, stage: 0 }]);
  assert.equal(born.s.money, state.s.money - 150); assert.equal(born.s.happy, state.s.happy + 30);
  assert.equal(derived(born).upkeep.lines.find(row => row.label === '양육비')!.amount, -35);
  const freed = married(); freed.turn = 100; freed.home!.tier = 3;
  freed.family.kids = [{ born: 0, pts: 0, stage: 4 }];
  assert.ok(options(freed).find(row => row.id === 'baby')!.enabled);
  const poor = married(); poor.s.money = 149;
  assert.throws(() => choose(poor, 'baby'), /disabled/);
  assert.ok(!options(married('park')).some(row => row.id === 'baby'));
});

for (const [age, stage, kind] of [[7, 0, 'edu'], [13, 1, 'edu'], [16, 2, 'edu'], [20, 3, 'gift']] as const) {
  test(`age ${age}: popup opens on spring, for every birth season, and survives save/restore`, () => {
    for (let born = 0; born < 4; born++) {
      const due = spring(age, born, 0, stage), before = structuredClone(due);
      before.turn--; before.board.step = 'bonus'; before.board.dice = [1, 1];
      assert.equal(familyPopup(before), null);
      const next = choose(before, 'end').state;
      assert.equal(next.turn % 4, 0); assert.equal(Math.floor((next.turn - born) / 4), age);
      assert.deepEqual(options(next).map(row => row.id), [`${kind}:0`, `${kind}:1`, `${kind}:2`, 'skip']);
      const skipped = checked(next, 'skip').state;
      assert.equal(skipped.family.kids[0].stage, stage + 1); assert.equal(skipped.turn, next.turn);
      assert.equal(skipped.board.step, 'spin'); assert.equal(skipped.s.acts, 0);
      assert.equal(familyPopup(skipped), null); assert.ok(options(skipped).some(row => row.id === 'spin'));
      for (const offset of [1, 2, 3]) {
        const later = structuredClone(due); later.turn += offset; assert.equal(familyPopup(later), null);
      }
    }
  });
}

test('simultaneous children are processed once each; education and gift defaults remain free with zero cash', () => {
  let state = spring(20, 0, 0, 3); state.s.money = 0;
  state.family.kids.push({ born: 28, pts: 1, stage: 1 }, { born: 52, pts: 0, stage: 0 });
  for (const index of [0, 1, 2]) {
    assert.equal(familyPopup(state)!.kid, index);
    assert.ok(options(state).find(row => row.id === 'skip')!.enabled);
    assert.equal(options(state).find(row => row.id === (index === 0 ? 'gift:2' : 'edu:2'))!.enabled, false);
    state = checked(state, 'skip').state;
  }
  assert.deepEqual(state.family.kids.map(kid => kid.stage), [4, 2, 1]);
  assert.equal(familyPopup(state), null); assert.equal(state.turn, 80);
});

for (const [age, stage, cost] of [[7, 0, 800], [13, 1, 1500], [16, 2, 3000]] as const) {
  test(`education age ${age}: all choices, fee, point bounds, exact 60% RNG and forecasts`, () => {
    const outcomes = new Set<boolean>();
    for (const mode of [0, 1, 2]) for (let seed = 1; seed <= 12; seed++) {
      const state = spring(age, 0, 0, stage); state.rng = seed; state.s.stamina = seed % 2 ? 0 : 100;
      const result = checked(state, `edu:${mode}`), next = result.state;
      const success = result.result.roll?.success ?? false;
      if (mode === 2) { outcomes.add(success); assert.equal(result.result.roll!.chance, 60); }
      assert.equal(next.family.kids[0].pts, mode === 2 ? 2 + Number(success) : mode);
      assert.equal(next.family.kids[0].stage, stage + 1);
      assert.equal(next.s.money, state.s.money - (mode === 2 ? cost : 0));
      assert.equal(derived(next).upkeep.lines.find(row => row.label === '자녀 교육비')?.amount ?? 0, mode === 1 ? -20 : 0);
      assert.equal(next.turn, state.turn);
    }
    assert.equal(outcomes.size, 2);
    const capped = spring(age, 0, 8, stage);
    assert.equal(checked(capped, 'edu:2').state.family.kids[0].pts, 9);
  });
}

test('academy fees stack per child, persist until the next popup, renew or stop, and end at independence', () => {
  let state = spring(7); state.family.kids.push({ born: 0, pts: 0, stage: 0 });
  state = checked(state, 'edu:1').state; state = checked(state, 'edu:1').state;
  assert.equal(state.timers[ECONOMY_KEYS.education], 40);
  state.board.step = 'bonus'; state.board.dice = [1, 1];
  assert.equal(choose(state, 'end').state.board.ledger['자녀 교육비'], -40);
  state = structuredClone(state); state.turn = 51;
  assert.equal(advanceFamily(state).timers[ECONOMY_KEYS.education], 40);
  state.turn = 52; state.board.step = 'spin'; state.board.dice = []; state = advanceFamily(state);
  assert.equal(state.timers[ECONOMY_KEYS.education], 0);
  state = checked(state, 'edu:0').state; state = checked(state, 'edu:1').state;
  assert.equal(state.timers[ECONOMY_KEYS.education], 20);
  state = structuredClone(state); state.turn = 64; state = advanceFamily(state);
  state = checked(state, 'edu:1').state; state = checked(state, 'edu:0').state;
  assert.equal(state.timers[ECONOMY_KEYS.education], 20);
  state = structuredClone(state); state.turn = 80; state = advanceFamily(state);
  assert.equal(state.timers[ECONOMY_KEYS.education], 0);
  assert.equal(derived(state).upkeep.lines.find(row => row.label === '양육비'), undefined);
});

for (const pts of [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]) {
  test(`independence score ${pts}: correct bracket happiness, achievement and every support amount`, () => {
    for (const [mode, cost, extra] of [[0, 0, 0], [1, 500, 8], [2, 2000, 20]]) {
      const state = spring(20, 0, pts, 3), next = checked(state, `gift:${mode}`).state;
      assert.equal(next.s.happy - state.s.happy, (pts < 3 ? 20 : pts < 6 ? 40 : 70) + extra);
      assert.equal(next.s.money, state.s.money - cost); assert.equal(next.family.kids[0].stage, 4);
      assert.deepEqual(next.feats, ['kid_independent:0']);
      assert.equal(familyAchievementPoints(next), pts < 3 ? 200 : pts < 6 ? 500 : 1000);
      assert.equal(derived(next).familyAchievementPoints, familyAchievementPoints(next));
      assert.equal(familyPopup(next), null); assert.throws(() => choose(next, `gift:${mode}`), /not available/);
    }
  });
}

function year(): GameState {
  const state = at(); state.turn = 84; state.status = 'student'; state.s.happy = 100; return state;
}
function gain(state: GameState): number {
  const before = structuredClone(state), next = yearEndFamily(frozen(state));
  assert.deepEqual(state, before); assert.equal(next.rng, state.rng);
  assert.deepEqual(yearEndFamily(next), next); saved(next);
  return next.s.happy - state.s.happy;
}
test('every annual happiness lifestyle and home-tier row, independent of the current map', () => {
  for (const [life, expected] of [[0, -2], [1, 0], [2, 3], [3, 6]] as const) {
    const state = year(); state.life = life; assert.equal(gain(state), expected);
  }
  for (const [tier, expected] of [[0, 0], [1, 0], [2, 1], [3, 2], [4, 3], [5, 5], [6, 7]]) {
    const state = year(); state.home = { map: 'E', tier, deposit: 0 }; assert.equal(gain(state), expected);
  }
});
test('annual spouse, family focus, each dependent through age 19, and undersized-home penalty', () => {
  for (const [dual, expected] of [[true, 3], [false, 5]] as const) {
    const state = year(); state.family.marriedAt = 0; state.family.dual = dual;
    state.home = { map: 'B', tier: 4, deposit: 0 };
    assert.equal(gain(state), expected + 3);
  }
  for (const count of [1, 2, 3]) {
    const state = year(); state.home = { map: 'B', tier: 4, deposit: 0 };
    state.family.kids = Array.from({ length: count }, () => ({ born: 4, pts: 0, stage: 3 }));
    assert.equal(gain(state), 3 + count * 2, 'age 19 in closing winter, 20 at new spring');
  }
  const grown = year(); grown.family.kids = [{ born: 0, pts: 0, stage: 4 }]; assert.equal(gain(grown), 0);
  const cramped = year(); cramped.family.marriedAt = 0; cramped.family.dual = true;
  assert.equal(gain(cramped), 0, 'spouse +3 minus crowding 3');
  const small = year(); small.home = { map: 'B', tier: 3, deposit: 0 };
  small.family.kids = [{ born: 40, pts: 0, stage: 0 }, { born: 41, pts: 0, stage: 0 }];
  assert.equal(gain(small), 2 + 4 - 3);
});
test('annual exhaustion, debt, joblessness exclusions and retired resort residency rows', () => {
  for (let count = 0; count <= 4; count++) {
    const state = year(); state.timers[K.exhausted] = count; assert.equal(gain(state), count ? -count : 0);
  }
  const debtor = year(); debtor.s.debt = 1; assert.equal(gain(debtor), -2);
  for (const status of ['student', 'jobless', 'working', 'retired'] as const) {
    const state = year(); state.status = status; assert.equal(gain(state), status === 'jobless' ? -3 : 0);
  }
  const resort = year(); resort.status = 'retired'; resort.home = { map: 'F', tier: 1, deposit: 0 };
  assert.equal(gain(resort), 3, 'residency counts while visiting another map');
  const visiting = year(); visiting.status = 'retired'; visiting.board.pos = 'F-o2';
  assert.equal(gain(visiting), 0, 'visiting alone is not residency');
});
test('season close counts exhaustion before recovery, resets yearly, clamps happiness, includes last winter', () => {
  let state = at(); state.turn = 0; state.s.happy = 100;
  for (const stamina of [19, 20, 0, 19]) {
    state.board.step = 'bonus'; state.board.dice = [1, 1]; state.s.stamina = stamina;
    state = choose(state, 'end').state;
    assert.deepEqual(advanceFamily(state), state);
  }
  assert.equal(state.turn, 4); assert.equal(state.s.happy, 94, 'three exhausted seasons plus jobless');
  assert.equal(state.timers[K.lastExhausted], 3); assert.equal(state.timers[K.exhausted], 0);
  const high = year(); high.s.happy = 998; high.life = 3;
  assert.equal(yearEndFamily(high).s.happy, 999);
  const low = year(); low.s.happy = 1; low.life = 0;
  assert.equal(yearEndFamily(low).s.happy, 0);
  const last = at(); last.turn = 203; last.board.step = 'bonus'; last.s.capStamina = 80; last.s.stamina = 80;
  last.life = 3;
  const done = choose(last, 'end').state;
  assert.equal(done.phase, 'ended'); assert.equal(done.s.happy, 103); assert.equal(done.timers[K.year], 204);
  assert.deepEqual(advanceFamily(done), done); assert.deepEqual(familyChoices(done).choices, []);
});

test('local leisure uses integer 150% happiness for unmarried players; partnered singles qualify too', () => {
  for (const [id, cost, base, stamina] of [['camping', 200, 8, 10], ['domestic', 150, 8, 10], ['overseas', 600, 20, 20]] as const) {
    for (const spouse of [false, true]) {
      const state = spouse ? married('waterfront_park') : at('waterfront_park');
      state.family.partnerAt = 0; state.flags.push('partner'); state.s.stamina = 10;
      const next = checked(state, `leisure:${id}`).state;
      assert.equal(next.s.money, state.s.money - cost); assert.equal(next.s.happy - state.s.happy, spouse ? base : base * 150 / 100);
      assert.equal(next.s.stamina, 10 + stamina); assert.equal(next.board.step, 'bonus');
    }
  }
  assert.ok(!options(at('hospital')).some(row => row.id.startsWith('leisure:')));
  const capped = at('resort'); capped.s.happy = 998;
  assert.equal(checked(capped, 'leisure:overseas').state.s.happy, 999);
});
