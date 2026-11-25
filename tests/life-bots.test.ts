import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { bankChoice, pickBot, POLICIES, POLICY_IDS } from '../src/life/bots.ts';
import { choose, newGame, options, reachable } from '../src/life/engine.ts';
import { LIFE_RULES } from '../src/life/life-data.ts';
import { rollDice } from '../src/life/move.ts';
import { AGES, cloneSimulationState, reportTables, runLife, simulate, TIME_MODEL } from '../scripts/simulate-life.ts';
import type { RunReport } from '../scripts/simulate-life.ts';
import { traceLife } from '../scripts/trace-life.ts';

const reports: RunReport[] = [];
for (const policy of POLICY_IDS) test(`${policy}: completes exactly 204 seasons and replays deterministically`, () => {
  const first = runLife(policy, 1), second = runLife(policy, 1);
  assert.equal(first.state.phase, 'ended'); assert.equal(first.state.turn, 204);
  assert.deepEqual(first, second); assert.equal(first.report.violations, 0);
  assert.ok(first.report.steps < LIFE_RULES.maxTurns * 32);
  assert.deepEqual(Object.keys(first.report.wealth).map(Number), AGES);
  assert.equal(first.report.maps.reduce((a,b) => a+b,0), 204);
  assert.ok(first.report.income >= 0 && first.report.spending >= 0);
  assert.ok(first.report.score <= Math.max(0, first.report.worth) + 59970);
  reports.push(first.report);
});

test('exactly the 16 §13.1 policies have distinct goals and appropriate starts', () => {
  assert.equal(POLICY_IDS.length, 16); assert.equal(new Set(POLICY_IDS).size, 16);
  const state = newGame(7), before = structuredClone(state), offered = options(state);
  const context = { phoneUsed:false, tried:[], salaryIncome:0, invested:0 };
  for (const id of POLICY_IDS.filter(id => id !== 'random')) {
    assert.equal(pickBot(id,state,offered,context).id, `start:${POLICIES[id].start}`);
    assert.ok(POLICIES[id].kinds.length > 0);
  }
  assert.deepEqual(state,before);
  assert.deepEqual(POLICIES.clerk_family.tracks,['clerk']); assert.equal(POLICIES.clerk_family.kids,2);
  assert.equal(POLICIES.clerk_family.home,4); assert.equal(POLICIES.service_frugal.life,0);
  assert.equal(POLICIES.engineer.map,'D'); assert.equal(POLICIES.employee.map,'E');
});

test('single roulette uses only the first eye before both manual and automatic travel; default stays pure', () => {
  let automatic = 0, manual = 0;
  for (let seed=1;seed<=36;seed++) {
    const state = choose(newGame(seed),'start:school').state, original = structuredClone(state);
    const probe = structuredClone(state), dice = rollDice(probe); probe.board.dice = [dice[0],dice[0]];
    const allowed = reachable(probe), result = choose(state,'spin','board',true);
    assert.deepEqual(state,original); assert.deepEqual(result.state.board.dice,[dice[0],dice[0]]);
    if (result.result.move) { automatic++; assert.equal(allowed.length,1); assert.equal(result.result.move.node,allowed[0].node); }
    else { manual++; assert.deepEqual(reachable(result.state).map(m=>m.node),allowed.map(m=>m.node)); }
  }
  assert.ok(automatic > 0 && manual > 0);
});

test('all policies also complete both counterfactuals; no-bank offers cannot use bank services', () => {
  for (const policy of POLICY_IDS) for (const experiment of ['single','no-bank'] as const) {
    const {state,report} = runLife(policy,2,experiment,{trace: step => {
      if (experiment === 'no-bank') assert.equal(bankChoice(step.option.id),false);
    }});
    assert.equal(state.turn,204); assert.equal(state.phase,'ended');
    if (experiment === 'no-bank') assert.equal(report.bankUses,0);
  }
});

test('omitting display logs preserves every rule-bearing field and every metric', () => {
  for (const policy of ['clerk_family','random'] as const) {
    const compact = runLife(policy,3), full = runLife(policy,3,'base',{keepLog:true});
    assert.ok(full.state.log.length > 0); full.state.log = [];
    assert.deepEqual(compact,full);
  }
});

test('stalls are bounded and identify policy, seed and season', () => {
  assert.throws(()=>runLife('clerk_family',1,'base',{stepLimit:1}),/stuck clerk_family\/1\/base turn=0/);
});

test('§2 time weights and every §13.2 area, career and ending are printed as tables', () => {
  assert.deepEqual(TIME_MODEL.map(row=>row.seconds),[1.5,3,2,4,6,3.5,2.4,6,8]);
  assert.ok(Math.abs(TIME_MODEL.reduce((n,row)=>n+row.seconds*row.frequency,0)-14.84)<.00001);
  const sample = reports.length ? reports : [runLife('clerk_family',1).report];
  const output = reportTables(sample,sample,sample);
  for (const area of ['완주','시간','이동','은행','자산','지출','직업','특구','행복','점수','엔딩','사건','갈림','상한']) assert.ok(output.includes(`| ${area} |`));
  assert.match(output,/\| engineer \|/); assert.match(output,/\| philanthropist \|/);
  assert.match(output,/첫 \d+판 \d+\/120종/); assert.match(output,/룰렛 한 개/); assert.match(output,/은행 금지/);
});

test('trace contains actual choices and is deterministic', () => {
  const first = traceLife('mechanic',1);
  assert.equal(first,traceLife('mechanic',1)); assert.match(first,/start:self/); assert.match(first,/"turn": 204/);
});

test('bad simulation input and trace arguments exit nonzero without opening ports', () => {
  const simulation = spawnSync(process.execPath,['scripts/simulate-life.ts'],{encoding:'utf8',env:{...process.env,SIM_RUNS:'invalid'}});
  assert.equal(simulation.status,1); assert.match(simulation.stderr,/SIM_RUNS must be a positive integer/);
  const trace = spawnSync(process.execPath,['scripts/trace-life.ts','unknown'],{encoding:'utf8'});
  assert.equal(trace.status,1); assert.match(trace.stderr,/Usage:/);
});


test('fast batch copy detaches every mutable field and matches native cloning', () => {
  const state = runLife('random',4,'base',{keepLog:true}).state;
  state.home = {map:'B',tier:4,deposit:0}; state.estates = [{map:'E',tier:3,paid:100}];
  state.holdings = [{id:'farm',level:1,paid:100}]; state.family.kids = [{born:0,pts:1,stage:1}];
  state.board.dice = [1,2]; state.board.ledger = {salary:1};
  const copy = cloneSimulationState(state); assert.deepEqual(copy,structuredClone(state));
  function detached(a: unknown,b: unknown): void {
    if (!a || typeof a !== 'object') return;
    assert.notEqual(a,b);
    for (const key of Object.keys(a)) detached((a as Record<string,unknown>)[key],(b as Record<string,unknown>)[key]);
  }
  detached(state,copy);
});

test('optimized worker results exactly match native engine runs, including both experiments', async () => {
  const result = await simulate(1,2); assert.deepEqual(result.failures,[]);
  assert.equal(result.base.length,16); assert.equal(result.single.length,16); assert.equal(result.noBank.length,16);
  for (const actual of [...result.base,...result.single,...result.noBank]) {
    assert.deepEqual(actual,runLife(actual.policy,actual.seed,actual.experiment).report);
  }
});

test('a second free popup exit in the same season never gets filtered out', () => {
  for (const [id,seed] of [['racer_creator',18],['bon_vivant',10],['random',17]] as const) {
    assert.equal(runLife(id,seed).state.turn,204);
  }
});
