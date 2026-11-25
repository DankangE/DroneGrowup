import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { GRADE_STEPS } from '../src/life/data.ts';
import { POLICY_IDS } from '../src/life/bots.ts';
import { ALL_EVENTS, choose, forecast, newGame, options } from '../src/life/engine.ts';
import { LIFE_RULES } from '../src/life/life-data.ts';
import { TRACK_TRAIN } from '../src/life/tracks.ts';
import { WORLD } from '../src/life/world.ts';
import { AGES, criterion, criteriaTable, evaluateCriteria, runLife } from '../scripts/simulate-life.ts';
import type { Batch, RunReport } from '../scripts/simulate-life.ts';
import { checkOutcome, eventFixture, outcomeReport } from '../scripts/outcome-check-life.ts';

const template = runLife('service_frugal', 1).report;
function sample(runs = 1): Batch {
  const base = POLICY_IDS.flatMap(policy => Array.from({ length: runs }, (_, i): RunReport => ({
    ...structuredClone(template), policy, seed: i + 1, events: {}, wealth: Object.fromEntries(AGES.map(age => [age, 1000])),
  })));
  return { base, single: base.map(r => ({ ...structuredClone(r), experiment: 'single' })),
    noBank: base.map(r => ({ ...structuredClone(r), experiment: 'no-bank', bankUses: 0 })), failures: [] };
}
const check = (out: Batch, id: string, runs = 1) => evaluateCriteria(out, runs).find(c => c.id === id)!;

test('every hard gate uses inclusive raw bounds, rejects nonfinite values and fails immediately outside its bounds', () => {
  const rows = evaluateCriteria(sample(), 1);
  assert.ok(rows.length >= 120); assert.equal(new Set(rows.map(c => c.id)).size, rows.length);
  for (const row of rows.filter(c => c.status !== 'ESTIMATE')) {
    for (const n of [NaN, Infinity, -Infinity]) assert.equal(criterion(row.id, row.area, n, row.min, row.max).status, 'FAIL');
    if (Number.isFinite(row.min)) {
      assert.equal(criterion(row.id, row.area, row.min, row.min, row.max).status, 'PASS');
      assert.equal(criterion(row.id, row.area, row.min - 1e-7, row.min, row.max).status, 'FAIL');
    }
    if (Number.isFinite(row.max)) {
      assert.equal(criterion(row.id, row.area, row.max, row.min, row.max).status, 'PASS');
      assert.equal(criterion(row.id, row.area, row.max + 1e-7, row.min, row.max).status, 'FAIL');
    }
  }
  for (const [id, min, max] of [
    ['move:choices', 2.2, Infinity], ['move:forks', 85, 100], ['move:maps', 4, 6], ['move:residence', 0, 60],
    ['bank:no-loan', 90, 100], ['bank:debt-seasons', 0, 10], ['bank:debtor', 0, 3],
    ['spend:all', 30, Infinity], ['spend:family', 45, Infinity], ['spend:cash', 0, 20],
    ['career:demoted', 10, 30], ['career:dismissed', 2, 10], ['career:special', .3, 1],
    ['zone:promotion:0', 55, 70], ['zone:income', -10, 25], ['happy:all', 300, 700],
    ['happy:family', 600, Infinity], ['happy:frugal', 0, 350], ['score:happy', 15, 35],
    ['score:feats', 10, 20], ['score:S', 5, 10], ['ending:debtor', 0, 3], ['ending:hero', 1.5, 20],
    ['event:count', 35, 55], ['event:repeat', 0, 2.5], ['event:coverage', 120, 120], ['fork:gain', 5, 20],
  ] as const) assert.deepEqual([check(sample(), id).min, check(sample(), id).max], [min, max], id);
});

test('all 14 areas, target policies, 19 careers and 21 endings have separate gates; only time is deferred', () => {
  const rows = evaluateCriteria(sample(), 1);
  assert.equal(new Set(rows.map(c => c.area)).size, 14);
  assert.equal(rows.filter(c => c.id.startsWith('career:seen:')).length, 19);
  assert.equal(rows.filter(c => c.id.startsWith('career:top:')).length, 14);
  assert.equal(rows.filter(c => c.id.startsWith('ending:')).length, 21);
  assert.equal(rows.filter(c => c.status === 'ESTIMATE').length, 20);
  assert.ok(rows.filter(c => c.status === 'ESTIMATE').every(c => c.area === '시간'));
  assert.match(criteriaTable(rows), /ESTIMATE/); assert.match(criteriaTable(rows), /FAIL/);
});

test('completion checks sample identities, all experiments, action limits, forbidden banking and crashes', () => {
  const out = sample(); assert.equal(check(out, 'complete:base').status, 'PASS');
  out.base[0].policy = 'random'; assert.equal(check(out, 'complete:base').status, 'FAIL');
  out.single[0].turn = 203; assert.equal(check(out, 'complete:turns').status, 'FAIL');
  out.single[0].violations = 1; assert.equal(check(out, 'complete:actions').status, 'FAIL');
  out.noBank[0].bankUses = 1; assert.equal(check(out, 'bank:forbidden').status, 'FAIL');
  out.failures.push('stuck'); assert.equal(check(out, 'complete:stalls').status, 'FAIL');
});

test('planner cohort, missing wealth, target progression and counterfactual score cap cannot be hidden by averages', () => {
  const out = sample(); out.base.forEach(r => { r.noLoan = true; r.firstJob = 21; r.top = false; });
  out.base.find(r => r.policy === 'random')!.noLoan = false;
  assert.equal(check(out, 'bank:no-loan').value, 100);
  delete out.base[0].wealth[25]; assert.equal(check(out, 'wealth:samples').status, 'FAIL');
  out.base.forEach(r => { r.firstJob = null; }); assert.equal(check(out, 'career:first').status, 'FAIL');
  assert.equal(check(out, 'career:top:pilot').status, 'FAIL');
  out.noBank[0].score = Math.max(0, out.noBank[0].worth) + 59971;
  assert.equal(check(out, 'score:cap').value, 1);
  out.base.forEach(r => { r.promotions = []; });
  assert.equal(check(out, 'zone:promotion:3').status, 'FAIL');
});

test('event coverage is confined to the first 3000 seed-interleaved runs, never the whole batch', () => {
  const out = sample(200);
  out.base.forEach(r => { r.events = Object.fromEntries(ALL_EVENTS.slice(1).map(e => [e.id, 1])); });
  out.base.find(r => r.seed === 200)!.events[ALL_EVENTS[0].id] = 1;
  assert.equal(check(out, 'event:sample', 200).status, 'PASS');
  assert.equal(check(out, 'event:coverage', 200).value, 119);
  out.base[0].events[ALL_EVENTS[0].id] = 1;
  assert.equal(check(out, 'event:coverage', 200).status, 'PASS');
  assert.equal(check(sample(), 'event:sample').status, 'FAIL');
});

test('85% ability gain scales once in the engine, floors integers and keeps thresholds and source tables intact', () => {
  const state = choose(newGame(1), 'start:self').state;
  state.turn = 40; state.status = 'working'; state.track = 'clerk'; state.board.step = 'space';
  state.board.pos = WORLD.find(n => n.map === 'B' && n.kind === 'train')!.id;
  const table = TRACK_TRAIN.find(a => a.id === 'train_clerk')!, original = structuredClone(table);
  const grades = structuredClone(GRADE_STEPS), before = structuredClone(state);
  const preview = forecast(state, 'act:train_clerk'), result = choose(state, 'act:train_clerk');
  assert.equal(LIFE_RULES.actionGainPct, 85);
  assert.deepEqual(preview.branches[0].deltas, { xp: 10, net: 5, biz: 4, acts: 1 });
  assert.deepEqual(result.result.deltas, preview.branches[0].deltas);
  assert.deepEqual(table, original); assert.deepEqual(state, before); assert.deepEqual(GRADE_STEPS, grades);
});

test('outcome audit exercises all 120 events, seeded success/failure/crash branches, actions and live service contexts', () => {
  const report = outcomeReport();
  assert.equal(report.events, 120); assert.ok(report.branches > 1000); assert.deepEqual(report.failures, []);
});

test('outcome audit rejects mismatched displayed odds and costs', () => {
  const state = eventFixture('blind_date'), option = options(state).find(o => o.id === 'ev:0')!;
  const wrong = { ...option, cost: option.cost + 1, roll: { ...option.roll!, chance: 96 } };
  const result = checkOutcome(state, wrong);
  assert.ok(result.failures.some(f => f.startsWith('price:')));
  assert.ok(result.failures.some(f => f.startsWith('odds:')));
});

test('CLI exits nonzero for unmet balance gates even when every sampled game completes', () => {
  const result = spawnSync(process.execPath, ['scripts/simulate-life.ts'], {
    encoding: 'utf8', env: { ...process.env, SIM_RUNS: '1', SIM_POLICIES: '', SIM_REPORT: '' },
  });
  assert.equal(result.status, 1); assert.match(result.stdout, /stuck\/crashes=0/);
  assert.match(result.stdout, /life balance: .* failed,/); assert.match(result.stdout, /event:sample.*FAIL/);
});

for (const [track, action, next] of [['pilot', 'solo_register', 'solo'], ['solo', 'corp_found', 'company'], ['instructor', 'academy_found', 'academy']] as const) {
  test(`direct ${action} transition resets old seniority and reuses entry rank rules`, () => {
    const state = choose(newGame(3), 'start:self').state;
    state.status = 'working'; state.track = track; state.turn = 60; state.board.step = 'bonus';
    state.board.pos = WORLD.find(n => n.place === (action === 'solo_register' ? 'office' : action === 'corp_found' ? 'hq' : 'academy'))!.id;
    Object.assign(state.s, { money: 10000, stamina: 100, rep: 105, biz: 105, teach: 210, drone: 3, gear: 2, car: 1, rank: 3 });
    state.flags.push('licensed', 'examiner');
    Object.assign(state.job, { rank: track === 'pilot' ? 4 : 2, tenure: 60, total: 100, warn: 1, tracks: [track] });
    state.timers.career_retry = 99; state.timers.career_bonus = 10;
    const before = structuredClone(state), preview = forecast(state, `act:${action}`), result = choose(state, `act:${action}`);
    assert.deepEqual(state, before); assert.equal(result.state.track, next);
    assert.equal(result.state.job.rank, 0); assert.equal(result.state.s.rank, 0);
    assert.equal(result.state.job.total, 1); assert.equal(result.state.job.warn, 0);
    assert.equal(result.state.job.changedAt, 60); assert.deepEqual(result.state.job.tracks, [track, next]);
    assert.equal(result.state.timers.career_retry, undefined); assert.equal(result.state.timers.career_bonus, undefined);
    assert.deepEqual(result.result.deltas, preview.branches[0].deltas);
    assert.equal(result.state.turn, 61);
  });
}
