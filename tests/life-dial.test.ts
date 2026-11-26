import assert from 'node:assert/strict';
import test from 'node:test';
import { ALL_EVENTS, currentEvent, choose, forecast, newGame, options, restore } from '../src/life/engine.ts';
import { choose as automaticChoose, forecast as automaticForecast } from '../src/life/flow.ts';
import { ACTIONS } from '../src/life/compat.ts';
import { CONTEST_EVENTS, RULES } from '../src/life/data.ts';
import { ASSET_KEYS, BOT_DIAL_PROFILES, DIAL_BONUS_CAP, DIAL_SETTINGS } from '../src/life/life-data.ts';
import { cappedChanceBonus } from '../src/life/cards.ts';
import { luckChanceBonus } from '../src/life/assets.ts';
import { pickBot, POLICY_IDS } from '../src/life/bots.ts';
import { randInt } from '../src/life/move.ts';
import { WORLD } from '../src/life/world.ts';
import { contestPrize } from '../src/life/jobs.ts';
import { eventFixture } from '../scripts/outcome-check-life.ts';
import { CREATOR_VIDEO, SPECIAL_RULES, TRACK_PREP, TRACK_TRAIN, TRACK_WORK } from '../src/life/tracks.ts';
import type { Choice, Cond, Effect } from '../src/life/types.ts';
import { flightPay } from '../src/life/economy.ts';
import { eventFlightPenalty } from '../src/life/events-f.ts';
import { cloneSimulationState } from '../scripts/simulate-life.ts';

const clamp = (n: number) => Math.min(95, Math.max(5, n));
function ready() {
  const s = choose(newGame(9), 'start:self').state;
  s.status = 'working'; s.track = 'pilot'; s.flags.push('licensed');
  s.board.pos = WORLD.find(n => n.kind === 'job')!.id; s.board.step = 'space'; s.board.dice = [1, 1];
  Object.assign(s.s, { money: 10000, stamina: 60, drone: 4, gear: 3, car: 2, skill: 150, rep: 150, cond: 70 });
  return s;
}
const get = (s: ReturnType<typeof ready>, id = 'act:job_event') => options(s).find(o => o.id === id)!;
const context = { phoneUsed: true, tried: [], salaryIncome: 0, invested: 0, noCards: true };

test('middle keeps old flight formula; lists and bare IDs remain stable, settings are integer data', () => {
  for (const stamina of [10, 30, 60, 90]) for (const cond of [10, 40, 90]) {
    const s = ready(); s.s.stamina = stamina; s.s.cond = cond;
    for (const v of options(s).filter(o => o.dial)) {
      const a = ACTIONS.find(a => `act:${a.id}` === v.id)!, r = RULES;
      const staminaBonus = stamina >= r.stamina.fresh ? r.stamina.freshBonus : stamina < r.stamina.exhausted
        ? -r.stamina.exhaustedPenalty : stamina < r.stamina.tired ? -r.stamina.tiredPenalty : 0;
      const mods = (a.roll!.mods ?? []).reduce((sum, m) => sum + Math.min(m.cap, Math.max(0, Math.floor((s.s[m.stat] - m.over) / m.per) * m.pct)), 0);
      const spare = Math.min(r.flight.spareLevelCap, Math.max(0, s.s.drone - (a.need?.min?.drone ?? 1)) * r.flight.spareLevelPct);
      const penalty = cond < r.flight.badCond ? r.flight.badCondPenalty : cond < r.flight.lowCond ? r.flight.lowCondPenalty : 0;
      assert.equal(v.roll!.chance, clamp(a.roll!.base + staminaBonus + mods + spare - penalty - eventFlightPenalty(s)));
      const f = r.flight;
      const crash = Math.max(0, Math.min(100, f.crashPct + (cond < f.lowCond ? f.crashLowCondPct : 0)
        - Math.min(f.skillCrashCap, Math.floor(s.s.skill / f.skillPer))
        + (stamina < r.stamina.exhausted ? r.stamina.exhaustedCrashPct : 0)));
      assert.equal(v.roll!.crashPct, crash); assert.equal(v.tire, 0);
      assert.equal(v.roll!.success.add.money, flightPay(s, a.roll!.success.add!.money!));
      if (v.enabled) {
        const bare = choose(s, v.id), mid = choose(s, `${v.id}@mid`);
        assert.deepEqual(bare.state, mid.state);
        assert.deepEqual(bare.result, { ...mid.result, optionId: v.id });
      }
      assert.deepEqual(forecast(s, v.id), forecast(s, `${v.id}@mid`));
      assert.equal(v.dial!.selected, 'mid'); assert.ok(!v.id.includes('@'));
    }
  }
  for (const row of DIAL_SETTINGS) for (const key of ['chanceDelta', 'crashDelta', 'payPct', 'tire'] as const) assert.ok(Number.isInteger(row[key]));
});

test('dial and active luck share +30 cap, negative adjustments survive, clamp happens last', () => {
  assert.equal(DIAL_BONUS_CAP, 30); assert.equal(cappedChanceBonus(50, 10), 30); assert.equal(cappedChanceBonus(0, -10), -10);
  const s = ready(); s.flags.push(ASSET_KEYS.dream, ASSET_KEYS.benefactor);
  assert.equal(luckChanceBonus(s, 'promo', 10), 30);
  assert.equal(luckChanceBonus(s, 'act:job_event', 10), 30);
  s.s.skill = 1000; s.s.stamina = 100;
  const v = get(s), bold = v.dial!.settings.find(row => row.notch === 'bold')!;
  assert.equal(v.roll!.chance, 95); assert.equal(bold.chance, 95, 'do not subtract from an already clamped middle chance');
  const result = choose(s, bold.id);
  assert.ok(!result.state.flags.includes(ASSET_KEYS.dream));
  assert.ok(result.state.flags.includes(ASSET_KEYS.benefactor), 'promotion-only card remains armed');
});

test('one draw: every one of the 100 ticks matches the displayed wedges and forecast', () => {
  const s = ready(); s.s.skill = 30; s.s.drone = 1; s.s.cond = 30;
  const original = structuredClone(s);
  const v = get(s), seeds = new Map<number, number>();
  for (let seed = 0; seeds.size < 100 && seed < 20000; seed++) {
    const probe = { ...s, rng: seed }, value = randInt(probe, 100); seeds.set(value, seed);
  }
  assert.equal(seeds.size, 100);
  for (const row of v.dial!.settings) {
    const counts = { success: 0, fail: 0, crash: 0 };
    assert.equal(row.ticks.success + row.ticks.fail + row.ticks.crash, 100);
    for (const [value, seed] of seeds) {
      const before = { ...s, rng: seed }, probe = { ...before }; randInt(probe, 100);
      const played = choose(before, row.id), actual = played.result;
      const branch = actual.crashed ? 'crash' : actual.roll!.success ? 'success' : 'fail'; counts[branch]++;
      assert.equal(actual.roll!.value, value); assert.equal(played.state.rng, probe.rng, 'exactly one draw');
      assert.deepEqual(actual.roll!.ticks, row.ticks);
      assert.deepEqual(actual.deltas, forecast(before, row.id).branches.find(b => b.id === branch)!.deltas);
      assert.equal(played.state.board.dial, row.notch);
    }
    assert.deepEqual(counts, row.ticks);
  }
  assert.deepEqual(s, original);
});

test('zero-tick crash is absent even when conditional crash probability is positive', () => {
  const s = ready(); s.s.skill = 1000; s.s.stamina = 100;
  const row = get(s).dial!.settings.find(row => row.notch === 'safe')!;
  assert.ok(row.crashPct > 0); assert.equal(row.ticks.crash, 0);
  assert.ok(!forecast(s, row.id).branches.some(b => b.id === 'crash'));
});

test('success pay scales after flight pay; losses stay intact', () => {
  const s = ready(), v = get(s), a = ACTIONS.find(a => a.id === 'job_event')!;
  for (const row of v.dial!.settings) {
    const setting = DIAL_SETTINGS.find(d => d.id === row.notch)!;
    assert.equal(row.success.add.money, Math.floor(flightPay(s, a.roll!.success.add!.money!) * setting.payPct / 100));
    assert.deepEqual(forecast(s, row.id).branches.find(b => b.id === 'fail')!.deltas.money, -15);
  }

});

test('tire deltas lock only unaffordable notches and never become negative', () => {
  const s = ready(); s.s.stamina = 1;
  const v = get(s); assert.equal(v.tire, 0);
  assert.deepEqual(v.dial!.settings.map(row => [row.notch, row.tire, row.enabled]), [['safe', 2, false], ['mid', 0, true], ['bold', 0, true]]);
  assert.throws(() => choose(s, `${v.id}@safe`), /disabled/);
  assert.doesNotThrow(() => choose(s, `${v.id}@bold`));
  s.board.step = 'bonus'; s.board.pos = WORLD.find(n => n.place === 'town')!.id; s.s.stamina = 20;
  assert.deepEqual(get(s).dial!.settings.map(row => row.tire), [22, 20, 18]);
});

test('suffix validation rejects non-flight, phone, malformed IDs; non-dial draws are unchanged', () => {
  const s = ready();
  for (const id of ['skip@safe', 'skip@mid', 'act:job_event@wat', 'act:job_event@mid@bold']) {
    assert.throws(() => choose(s, id), /not available/); assert.throws(() => forecast(s, id), /not available/);
  }
  const service = options(s, 'phone').find(o => o.enabled)!;
  assert.throws(() => choose(s, `${service.id}@mid`, 'phone'), /not available/);
  const n = choose(newGame(1), 'start:self').state; n.status = 'working'; n.track = 'clerk'; n.flags.push('degree');
  n.board.pos = WORLD.find(node => node.kind === 'rankup' && node.map === 'B')!.id; n.board.step = 'space'; n.board.dice = [1, 1];
  n.job.tenure = 100; n.job.perf = 100; n.s.money = 10000; n.s.xp = n.s.net = n.s.biz = 1000;
  const promo = options(n).find(o => o.id === 'promo'); assert.ok(promo?.enabled);
  assert.equal(promo.dial, undefined); assert.equal(promo.roll!.ticks, undefined);
  assert.throws(() => choose(n, 'promo@bold'), /not available/);
  const probe = structuredClone(n), value = randInt(probe, 100), played = choose(n, 'promo');
  assert.equal(played.result.roll!.value, value); assert.equal(played.state.rng, probe.rng);
});

test('remembered notch is additive v2 state; bare IDs still choose middle; flow and restore work', () => {
  const s = ready(), original = structuredClone(s);
  assert.ok(restore(JSON.parse(JSON.stringify(s)))); assert.equal(s.board.dial, undefined);
  for (const row of DIAL_SETTINGS) {
    s.board.dial = row.id;
    assert.equal(restore(JSON.parse(JSON.stringify(s)))!.board.dial, row.id);
    assert.equal(cloneSimulationState(s).board.dial, row.id);
    assert.equal(get(s).dial!.selected, row.id);
    const next = automaticChoose(s, `act:job_event@${row.id}`);
    const branch = next.result.crashed ? 'crash' : next.result.roll!.success ? 'success' : 'fail';
    assert.deepEqual(next.result.deltas, automaticForecast(s, `act:job_event@${row.id}`).branches.find(b => b.id === branch)!.deltas);
    assert.equal(next.result.optionId, `act:job_event@${row.id}`);
    assert.equal(choose(s, 'act:job_event').state.board.dial, 'mid');
  }
  for (const dial of ['bad', '', null, 0, {}, true]) assert.equal(restore({ ...original, board: { ...original.board, dial } }), null);
  assert.equal(original.v, 2);
});

test('all sixteen policies select deterministic enabled notches; profiles differ and middle can be forced', () => {
  const s = ready(), v = get(s), chosen = new Set<string>();
  assert.equal(Object.keys(BOT_DIAL_PROFILES).length, 16);
  for (const policy of POLICY_IDS) {
    const pick = pickBot(policy, s, [v], context); chosen.add(pick.id);
    assert.ok(v.dial!.settings.some(row => row.id === pick.id && row.enabled));
    assert.deepEqual(pickBot(policy, s, [v], context), pick);
    assert.deepEqual(pickBot(policy, s, [{ ...v, id: `${v.id}@mid` }], context), pick);
    assert.equal(pickBot(policy, s, [v], { ...context, dial: 'mid' }).id, `${v.id}@mid`);
    s.s.stamina = 1; const low = get(s), lowPick = pickBot(policy, s, [low], context);
    assert.ok(low.dial!.settings.some(row => row.id === lowPick.id && row.enabled)); s.s.stamina = 60;
  }
  assert.ok(chosen.size > 1);
});


test('all non-dial event and action rolls preserve draws, odds, flights and condition', () => {
  let rolls = 0;
  const contests = new Set<string>();
  const check = (state: ReturnType<typeof ready>, id: string, roll: NonNullable<Choice['roll']>) => {
    const option = get(state, id); if (!option?.enabled || !option.roll) return;
    rolls++;
    assert.equal(option.dial, undefined, id); assert.equal(option.roll.ticks, undefined, id);
    assert.equal(option.roll.crashPct, undefined, id);
    const chance = clamp(roll.base + option.roll.staminaPct + luckChanceBonus(state, id)
      + (roll.mods ?? []).reduce((sum, m) => sum + Math.min(m.cap, Math.max(0, Math.floor((state.s[m.stat] - m.over) / m.per) * m.pct)), 0));
    assert.equal(option.roll.chance, chance, id);
    assert.throws(() => choose(state, `${id}@mid`), /not available/);
    const seen = new Set<boolean>();
    for (let seed = 0; seed < 4096 && seen.size < 2; seed++) {
      const before = { ...state, rng: seed }, probe = { ...before }, value = randInt(probe, 100);
      const success = value < chance; if (seen.has(success)) continue; seen.add(success);
      if (id === `act:${SPECIAL_RULES.videoId}` && success) randInt(probe, SPECIAL_RULES.fanMax - SPECIAL_RULES.fanMin + 1);
      const played = choose(before, id);
      const effect: Effect = success ? roll.success : roll.fail;
      assert.equal(played.result.roll!.value, value, id); assert.equal(played.result.roll!.success, success, id);
      assert.equal(played.state.rng, probe.rng, `${state.eventId ?? id}: draw count`);
      assert.equal(played.result.crashed, false, id);
      assert.equal(played.state.s.flights, before.s.flights + (effect.add?.flights ?? 0), id);
      assert.equal(played.state.s.cond, effect.set?.cond ?? Math.min(100, Math.max(0, before.s.cond + (effect.add?.cond ?? 0))), id);
      if (state.eventId && CONTEST_EVENTS.includes(state.eventId)) {
        contests.add(state.eventId);
        assert.equal(played.state.board.contests, state.board.contests + Number(success));
        assert.equal(played.state.eventId, null);
      }
    }
    assert.equal(seen.size, 2, id);
  };
  for (const event of ALL_EVENTS) {
    const state = eventFixture(event.id);
    if (CONTEST_EVENTS.includes(event.id)) state.board.pos = WORLD.find(n => n.kind === 'contest')!.id;
    currentEvent(state)!.choices.forEach((choice, i) => {
      if (choice.roll) check(state, `ev:${i}`, choice.roll);
    });
  }
  const meet = (state: ReturnType<typeof ready>, cond?: Cond): void => {
    if (!cond) return;
    if (cond.status) state.status = cond.status[0];
    if (cond.track) state.track = cond.track[0];
    Object.assign(state.s, cond.min, cond.max);
    state.flags = [...new Set([...state.flags, ...cond.flags ?? []])].filter(f => !cond.notFlags?.includes(f));
    if (cond.any) meet(state, cond.any[0]);
  };
  for (const action of [...ACTIONS, ...TRACK_WORK, ...TRACK_TRAIN, ...TRACK_PREP, CREATOR_VIDEO]) {
    if (action.flight || !action.roll) continue;
    const state = ready(); meet(state, action.when); meet(state, action.need);
    state.board.step = action === CREATOR_VIDEO ? 'space' : 'bonus';
    state.board.pos = WORLD.find(n => action === CREATOR_VIDEO ? n.kind === 'job' : n.place === action.place)!.id;
    check(state, `act:${action.id}`, action.roll);
  }
  assert.ok(rolls > 40);
  assert.deepEqual([...contests].sort(), [...CONTEST_EVENTS].sort());
  const club = eventFixture('club'); club.track = 'racer'; club.job.rank = 2;
  club.board.pos = WORLD.find(n => n.kind === 'contest')!.id;
  assert.equal(get(club, 'ev:0').roll!.success.add.money, contestPrize(club, 40));
});
