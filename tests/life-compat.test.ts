import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ACTIONS as V1_ACTIONS, EVENTS as V1_EVENTS, STAGE_IDS } from '../src/life/data.ts';
import type { Cond as V1Cond, Stage } from '../src/life/base-types.ts';

const before = structuredClone({ actions: V1_ACTIONS, events: V1_EVENTS });
const { ACTIONS, EVENTS, STAGE_TO_TRACKS, condFor } = await import('../src/life/compat.ts');

test('section 6.7 maps every v1 stage, with student represented only as a status', () => {
  assert.deepEqual(STAGE_TO_TRACKS, {
    student: [], pilot: ['pilot'], employee: ['employee'], instructor: ['instructor'],
    academy: ['academy'], solo: ['solo'], company: ['company'], director: ['director'],
  });
  assert.deepEqual(Object.keys(STAGE_TO_TRACKS).sort(), [...STAGE_IDS].sort());
  for (const stage of [...STAGE_IDS] as Stage[]) {
    assert.deepEqual(condFor({ stage: [stage] }),
      stage === 'student' ? { status: ['student'] } : { track: [stage] });
  }
});

test('absent, empty, repeated and mixed stage gates preserve their meaning', () => {
  assert.deepEqual(condFor(), {});
  assert.deepEqual(condFor({}), {});
  assert.deepEqual(condFor({ stage: [] }), { track: [] }); // No eligible career, not an unrestricted gate.
  assert.deepEqual(condFor({ stage: ['pilot', 'solo', 'pilot'] }), { track: ['pilot', 'solo'] });
  assert.deepEqual(condFor({ stage: ['student', 'student'] }), { status: ['student'] });
  assert.deepEqual(condFor({ stage: ['student', 'employee', 'pilot'], min: { xp: 270 } }), {
    min: { xp: 270 }, any: [{ status: ['student'] }, { track: ['employee', 'pilot'] }],
  });
});

test('conversion preserves and copies stat bounds and qualification flags', () => {
  const cond: V1Cond = { stage: ['instructor'], min: { teach: 105, theory: 180, rank: 0 },
    max: { rank: 1 }, flags: ['licensed'], notFlags: ['examiner'] };
  const snapshot = structuredClone(cond);
  Object.freeze(cond.stage); Object.freeze(cond.min); Object.freeze(cond.max);
  Object.freeze(cond.flags); Object.freeze(cond.notFlags); Object.freeze(cond);
  const converted = condFor(cond);
  assert.deepEqual(converted, { track: ['instructor'], min: cond.min, max: cond.max,
    flags: cond.flags, notFlags: cond.notFlags });
  converted.min!.teach = 0; converted.max!.rank = 9;
  converted.flags!.push('changed'); converted.notFlags!.push('changed'); converted.track!.push('pilot');
  assert.deepEqual(cond, snapshot);
  const { stage: _stage, ...unrestricted } = snapshot;
  assert.deepEqual(condFor(unrestricted), unrestricted);
});

// Reverse only the documented renames so the entire adapted tables can be compared with v1.
function asV1(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(asV1);
  if (!value || typeof value !== 'object') return value;
  assert.ok(!('stage' in value), 'no legacy stage key anywhere in the v2 action/event tables');
  const { track, status, ...rest } = value as Record<string, unknown>;
  const result: Record<string, unknown> = Object.fromEntries(Object.entries(rest).map(([key, item]) => [key, asV1(item)]));
  if (track !== undefined) result.stage = track;
  if (Array.isArray(status)) {
    assert.deepEqual(status, ['student']);
    assert.equal(track, undefined);
    result.stage = ['student'];
  } else if (status !== undefined) {
    assert.equal(status, track === null ? 'student' : 'working');
    assert.ok(track === null || typeof track === 'string');
    result.stage = track ?? 'student';
  }
  return result;
}

function assertDetached(copy: unknown, source: unknown) {
  if (!copy || !source || typeof copy !== 'object' || typeof source !== 'object') return;
  assert.notEqual(copy, source, 'v2 must not share mutable data with v1');
  for (const key of Object.keys(source)) {
    assertDetached((copy as Record<string, unknown>)[key], (source as Record<string, unknown>)[key]);
  }
}

test('all action/event conditions and effects are adapted, preserving every other value', () => {
  assert.deepEqual(asV1(ACTIONS), V1_ACTIONS);
  assert.deepEqual(asV1(EVENTS), V1_EVENTS);
  for (const [index, action] of ACTIONS.entries()) {
    assert.deepEqual(action.when, condFor(V1_ACTIONS[index].when));
    assert.deepEqual(action.need, V1_ACTIONS[index].need ? condFor(V1_ACTIONS[index].need) : undefined);
  }
  for (const [index, event] of EVENTS.entries()) {
    assert.deepEqual(event.when, condFor(V1_EVENTS[index].when));
    for (const [i, choice] of event.choices.entries()) {
      const need = V1_EVENTS[index].choices[i].need;
      assert.deepEqual(choice.need, need ? condFor(need) : undefined);
    }
    assert.ok(event.choices.some(choice => !choice.cost && !choice.need), `${event.id}: free exit preserved`);
  }
});

test('adapting tables neither mutates nor retains mutable references to v1', () => {
  assert.deepEqual({ actions: V1_ACTIONS, events: V1_EVENTS }, before);
  assertDetached(ACTIONS, V1_ACTIONS);
  assertDetached(EVENTS, V1_EVENTS);
});
