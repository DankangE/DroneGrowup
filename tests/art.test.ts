// Every image the UI can ask for exists in public/art and stays web-sized, and every place, event and ending
// resolves to one of them.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, statSync } from 'node:fs';
import { EVENTS, ENDING_IDS, PLACES, STAGES } from '../src/game/data.ts';
import { newGame } from '../src/game/engine.ts';
import type { PlaceId, Stage } from '../src/game/types.ts';
import { SCENE_IDS, SPEAKER_IDS, STAGE_PLACE, eventSpeaker, sceneId } from '../src/ui/art.ts';

const path = (name: string) => new URL(`../public/art/${name}.webp`, import.meta.url);
function within(name: string, limit: number) {
  assert.ok(existsSync(path(name)), `${name}.webp is missing`);
  assert.ok(statSync(path(name)).size <= limit, `${name}.webp is over ${limit} bytes`);
}

test('art files exist and fit their budgets', () => {
  within('cover', 400_000);
  for (const id of SCENE_IDS) within('scene-' + id, 300_000);
  for (const id of SPEAKER_IDS) within('portrait-' + id, 60_000);
  for (const id of ENDING_IDS) within('ending-' + id, 60_000);
  for (const stage of Object.keys(STAGES)) within('chibi-' + stage, 60_000);
});

test('every place at every stage has a scene, and the company visibly grows', () => {
  const stages = Object.keys(STAGES) as Stage[];
  for (const stage of stages) {
    const state = { ...newGame(1), stage };
    for (const place of Object.keys(PLACES) as PlaceId[]) assert.ok(SCENE_IDS.includes(sceneId(place, state)), `${place} / ${stage}`);
    assert.ok(PLACES[STAGE_PLACE[stage]]);
  }
  const at = (stage: Stage, staff: number, round: number) => {
    const state = newGame(1);
    return sceneId(stage === 'solo' ? 'office' : 'hq', { ...state, stage, s: { ...state.s, staff, round } });
  };
  assert.deepEqual([at('solo', 0, 0), at('company', 1, 0), at('company', 6, 0), at('company', 2, 2)], ['solo', 'office', 'hq', 'hq']);
});

test('every event has a speaker portrait of its own choosing', () => {
  for (const event of EVENTS) assert.ok(SPEAKER_IDS.includes(eventSpeaker(event.id)), event.id);
  assert.ok(new Set(EVENTS.map((e) => eventSpeaker(e.id))).size >= 10);
});
