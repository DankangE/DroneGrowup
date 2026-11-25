import assert from 'node:assert/strict';
import { test } from 'node:test';
import { GRADED_STATS, grade } from '../src/life/grades.ts';
import { ACTIONS, EVENTS, GRADES, GRADE_STEPS, RULES, STAT_MAX, PLACES, SPACE_MENU } from '../src/life/data.ts';
import type { Choice, Stat } from '../src/life/base-types.ts';

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


test('source action and event tables are consistent and always offer a free response', () => {
  const ids = ACTIONS.map(a => a.id);
  assert.equal(new Set(ids).size, ids.length, 'action ids are unique');
  assert.equal(new Set(EVENTS.map(e => e.id)).size, EVENTS.length, 'event ids are unique');
  for (const menu of Object.values(SPACE_MENU)) assert.equal(new Set(menu).size, menu.length);
  for (const action of ACTIONS) {
    assert.ok(action.place in PLACES, action.id);
    assert.ok((action.tire ?? 0) > 0, action.id);
  }
  for (const event of EVENTS) {
    assert.ok(event.place in PLACES, event.id);
    assert.ok(event.choices.length >= 2, event.id);
    assert.ok(event.choices.every(choice => choice.tire === undefined), event.id);
    assert.ok(event.choices.some(choice => !choice.cost && !choice.need), `${event.id} has a choice that is always open`);
  }
});
