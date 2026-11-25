// The board UI's read-only views: letter grades agree with the gates, the ladder is ordered, a rank-up reports
// what the engine pays, and none of it touches a run.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { POLICIES, botRandom, pick } from '../src/game/bots.ts';
import { GRADED_STATS, careerPerks, careerRank, grade, nextRanks, rankChange } from '../src/game/career.ts';
import { ACTIONS, CAREER, EVENTS, GRADES, GRADE_STEPS, RULES, STAGES, STAT_MAX } from '../src/game/data.ts';
import { actionViews, choose, derived, newGame } from '../src/game/engine.ts';
import type { Choice, GameState, Stage, Stat, StatMap } from '../src/game/types.ts';

function at(stage: Stage, stats: StatMap = {}, flags: string[] = []): GameState {
  const state = newGame(7);
  state.stage = stage;
  Object.assign(state.s, stats);
  state.flags = flags;
  return state;
}

test('grade tables rise, stay inside the stat range and leave G below the first step', () => {
  for (const stat of GRADED_STATS) {
    const steps = GRADE_STEPS[stat]!;
    assert.equal(steps.length, GRADES.length - 1, stat);
    for (let i = 1; i < steps.length; i++) assert.ok(steps[i] > steps[i - 1], `${stat} rises`);
    assert.ok(steps[0] > 0 && steps[steps.length - 1] <= (STAT_MAX[stat] ?? Infinity), `${stat} range`);
    assert.equal(grade(stat, 0)!.letter, 'G');
    assert.equal(grade(stat, steps[0] - 1)!.letter, 'G');
    assert.equal(grade(stat, steps[0])!.letter, 'F');
    assert.deepEqual(grade(stat, steps[6]), { letter: 'S', index: 7, from: steps[6], next: null });
  }
  assert.equal(grade('money', 500), null);
});

test('every gate on a graded stat sits on a grade step, so the grade and the gate agree', () => {
  const choices: Choice[] = [...ACTIONS, ...EVENTS.flatMap((e) => e.choices)];
  let gates = 0;
  for (const choice of choices) {
    for (const [stat, need] of Object.entries(choice.need?.min ?? {}) as [Stat, number][]) {
      const steps = GRADE_STEPS[stat];
      if (!steps) continue;
      gates += 1;
      assert.ok(steps.includes(need), `${choice.title}: ${stat} ${need} is not a grade step`);
      assert.ok(grade(stat, need - 1)!.index < grade(stat, need)!.index);
    }
  }
  assert.ok(gates >= 20);
  const s = RULES.stamina;
  assert.deepEqual([s.exhausted, s.tired, s.fresh].map((v) => grade('stamina', v)!.letter), ['F', 'E', 'A']);
});

test('the ladder: one rung per rank the engine knows, levels rising inside a career', () => {
  for (const stage of Object.keys(STAGES) as Stage[]) {
    const rungs = CAREER[stage];
    for (let i = 1; i < rungs.length; i++) assert.ok(rungs[i].level > rungs[i - 1].level, stage);
    if (STAGES[stage].ranks.length) assert.deepEqual(rungs.map((r) => r.title), STAGES[stage].ranks);
  }
  assert.deepEqual(careerRank(at('student')), { stage: 'student', field: '드론학과 학생', title: '드론학과 학생', level: 1, stars: 1, maxStars: 1 });
  assert.deepEqual(careerRank(at('employee', { rank: 2 })), { stage: 'employee', field: '드론 회사 직원', title: '과장', level: 5, stars: 3, maxStars: 4 });
  assert.equal(careerRank(at('instructor', {}, ['examiner'])).title, '실기평가 교관');
  assert.equal(careerRank(at('academy', { level: 3 })).stars, 3);
  assert.equal(careerRank(at('company', { round: 3 })).level, 8);
});

test('next ranks come from the offered options with their requirements, grades and odds', () => {
  const student = at('student', { theory: 95, skill: 40 });
  const [exam, ...rest] = nextRanks(student);
  assert.equal(rest.length, 0);
  const offered = actionViews(student).find((o) => o.id === 'st_exam')!;
  assert.equal(exam.optionId, 'st_exam');
  assert.equal(exam.rank.title, '프리랜서 파일럿');
  assert.equal(exam.chance, offered.roll!.chance);
  assert.equal(exam.enabled, offered.enabled);
  assert.deepEqual(exam.locks, offered.locks);
  assert.deepEqual(exam.requirements.map((r) => [r.stat, r.need, r.have, r.met, r.needGrade, r.haveGrade]), [
    ['theory', 90, 95, true, 'D', 'D'],
    ['skill', 90, 40, false, 'D', 'F'],
    ['money', 600, 60, false, undefined, undefined],
  ]);

  const pilot = at('pilot', { xp: 300, rep: 70, drone: 2, car: 1, money: 900 }, ['licensed', 'member']);
  assert.deepEqual(nextRanks(pilot).map((n) => [n.optionId, n.rank.title]), [
    ['emp_apply', '사원'], ['inst_course', '전속 교관'], ['solo_register', '1인 사업자'], ['assoc_run', '이사'],
  ]);
  assert.deepEqual(nextRanks(at('employee', { rank: 1 })).map((n) => n.rank.title), ['과장']);
  // Quitting is on offer too but leads down, so it is not a next rank.
  assert.ok(actionViews(at('employee')).some((o) => o.id === 'emp_quit'));
  assert.ok(!nextRanks(at('employee')).some((n) => n.optionId === 'emp_quit'));
  const company = at('company', { round: 2, staff: 8, value: 30000, money: 5000 });
  const ipo = nextRanks(company).find((n) => n.optionId === 'co_ipo')!;
  assert.deepEqual([ipo.rank.title, ipo.rank.ending, ipo.rank.level], ['거대 드론 기업 CEO', 'ceo', 9]);
  // The ladder is still readable while an event waits for its answer.
  assert.deepEqual(nextRanks({ ...student, phase: 'event', eventId: EVENTS[0].id }), nextRanks(student));
});

test('a rank change reports the new rank and what it pays, straight from the engine', () => {
  const before = at('employee', { xp: 500, rep: 60 });
  const after = structuredClone(before);
  after.s.rank = 1;
  const change = rankChange(before, after)!;
  assert.equal(change.kind, 'up');
  assert.deepEqual([change.from.title, change.to.title, change.to.stars], ['사원', '대리', 2]);
  const salary = (s: GameState) => derived(s).upkeep.lines.find((l) => l.label === '급여')!.amount;
  assert.deepEqual(change.perks.find((p) => p.id === 'income'), { id: 'income', label: '계절 수입', value: salary(after), unit: '만원', gain: salary(after) - salary(before) });
  assert.equal(change.perks.find((p) => p.id === 'income')!.gain, STAGES.employee.salaryPerRank);
  assert.equal(change.next[0].rank.title, '과장');

  const quit = rankChange(before, { ...structuredClone(before), stage: 'pilot' })!;
  assert.equal(quit.kind, 'move');
  assert.equal(quit.perks.find((p) => p.id === 'credit')!.gain, STAGES.pilot.credit - STAGES.employee.credit);
  assert.equal(rankChange(before, structuredClone(before)), null);
  assert.equal(careerPerks(at('solo')).find((p) => p.id === 'jobPct')!.value, 130);
});

test('reading the career views never changes a run', () => {
  for (const policy of ['ceo', 'chairman', 'academy']) {
    let state = newGame(1);
    const rand = botRandom(1);
    let ups = 0;
    for (let i = 0; i < 20000 && state.phase !== 'ended'; i++) {
      const frozen = JSON.stringify(state);
      nextRanks(state);
      careerPerks(state);
      const next = choose(state, pick(POLICIES[policy], state, rand)).state;
      assert.equal(JSON.stringify(state), frozen);
      const change = rankChange(state, next);
      if (change?.kind === 'up') ups += 1;
      if (change) assert.notDeepEqual([change.from.stage, change.from.level], [change.to.stage, change.to.level]);
      state = next;
    }
    assert.ok(ups >= 1, `${policy} climbed at least once`);
  }
});
