import { ACTIONS as V1_ACTIONS, EVENTS as V1_EVENTS } from '../game/data.ts';
import type { Choice as V1Choice, Cond as V1Cond, Effect as V1Effect, Stage } from '../game/types.ts';
import type { ActionDef, Choice, Cond, Effect, EventDef, TrackId } from './types.ts';

// Section 6.7: student is a status, so it has no corresponding track.
export const STAGE_TO_TRACKS: Readonly<Record<Stage, readonly TrackId[]>> = {
  student: [], pilot: ['pilot'], employee: ['employee'], instructor: ['instructor'],
  academy: ['academy'], solo: ['solo'], company: ['company'], director: ['director'],
};

/** Convert a v1 gate without changing its thresholds, flags or OR semantics. */
export function condFor(cond: V1Cond = {}): Cond {
  const { stage, ...rest } = structuredClone(cond);
  if (!stage) return rest;
  const track = [...new Set(stage.flatMap(id => STAGE_TO_TRACKS[id]))];
  if (!stage.includes('student')) return { ...rest, track };
  if (!track.length) return { ...rest, status: ['student'] };
  return { ...rest, any: [{ status: ['student'] }, { track }] };
}

function effectFor(effect: V1Effect): Effect {
  const { stage, ...rest } = structuredClone(effect);
  if (!stage) return rest;
  return stage === 'student'
    ? { ...rest, status: 'student', track: null }
    : { ...rest, status: 'working', track: stage };
}

function choiceFor(choice: V1Choice): Choice {
  const { need, effect, roll, ...rest } = structuredClone(choice);
  return {
    ...rest,
    ...(need && { need: condFor(need) }),
    ...(effect && { effect: effectFor(effect) }),
    ...(roll && { roll: { ...roll, success: effectFor(roll.success), fail: effectFor(roll.fail) } }),
  };
}

// Adapt copies at the v2 boundary. v1 data and the default game stay untouched.
export const ACTIONS: ActionDef[] = V1_ACTIONS.map(({ when, id, place, flight, ...choice }) => ({
  ...choiceFor(choice), id, place, when: condFor(when), ...(flight !== undefined && { flight }),
}));
export const EVENTS: EventDef[] = V1_EVENTS.map(({ when, choices, ...event }) => ({
  ...event, when: condFor(when), choices: choices.map(choiceFor),
}));
