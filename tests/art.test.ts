// Shipped raster files and v2 inline drawings cover every supported place, job and tile kind.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, statSync } from 'node:fs';
import { EVENTS, ENDING_IDS, PLACES, STAGES } from '../src/game/data.ts';
import { newGame } from '../src/game/engine.ts';
import type { PlaceId, Stage } from '../src/game/types.ts';
import { SCENE_IDS, SPEAKER_IDS, STAGE_PLACE, eventSpeaker, sceneId } from '../src/ui/art.ts';
import type { PlaceId as LifePlaceId, SpaceKind, TrackId } from '../src/life/types.ts';
import { PLACES as LIFE_PLACES, WORLD, MAPS } from '../src/life/world.ts';
import { newGame as newLife } from '../src/life/engine.ts';
import { board } from '../src/ui2/board.ts';
import { LEGACY_TILE_ICONS, NEW_TILE_PATHS, tileIcon } from '../src/ui2/icons.ts';
import { NEW_PLACE_TILES } from '../src/ui2/place-tiles.ts';
import { JOB_NAMES, NEW_JOB_PORTRAITS } from '../src/ui2/job-portraits.ts';
import { jobAsset, jobPortrait, LEGACY_JOB_PORTRAITS, LEGACY_PLACE_SCENES, placeArt, placeAsset } from '../src/ui2/art.ts';
import type { VectorArt } from '../src/ui2/art-svg.ts';
import { MOTION_ART } from '../src/ui2/motion-art.ts';
import { vectorArt } from '../src/ui2/art-svg.ts';

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

test('v2 has exactly the eight new tile icons and covers every world kind', () => {
  assert.deepEqual(Object.keys(NEW_TILE_PATHS).sort(), ['jobfair', 'shop', 'estate', 'life', 'biz', 'luck', 'station', 'invest'].sort());
  assert.equal(new Set(Object.values(NEW_TILE_PATHS)).size, 8, 'each new kind has a distinct silhouette');
  assert.deepEqual([...Object.keys(NEW_TILE_PATHS), ...Object.keys(LEGACY_TILE_ICONS)].sort(),
    [...new Set(WORLD.map(node => node.kind))].sort());
});

test('all 71 new places have tiles and all existing places keep shipped scenes', () => {
  const added = Object.keys(LIFE_PLACES).filter(id => !(id in PLACES));
  assert.equal(added.length, 71);
  assert.deepEqual(Object.keys(NEW_PLACE_TILES).sort(), added.sort());
  assert.equal(new Set(Object.values(NEW_PLACE_TILES).map(art => JSON.stringify(art))).size, added.length,
    'every named place has its own drawing, even when building parts are shared');
  assert.deepEqual(Object.keys(LEGACY_PLACE_SCENES).sort(), Object.keys(PLACES).sort());
  for (const id of Object.keys(LIFE_PLACES) as LifePlaceId[]) {
    const art = placeAsset(id);
    if (id in PLACES) {
      assert.equal(art.kind, 'raster');
      if (art.kind === 'raster') within(art.file, 300_000);
    } else {
      assert.equal(art.kind, 'vector');
      if (art.kind === 'vector') assert.equal(art.drawing, NEW_PLACE_TILES[id as keyof typeof NEW_PLACE_TILES]);
    }
  }
  for (const node of WORLD) assert.ok(placeAsset(node.place), node.id);
});

// T04's tracks.ts is not a dependency of this ticket. These ids come from §6.1.
const TRACK_IDS: TrackId[] = ['service', 'delivery', 'mechanic', 'clerk', 'pilot', 'employee', 'instructor',
  'public', 'rescue', 'creator', 'engineer', 'inspector', 'film', 'atc', 'racer', 'solo', 'company', 'academy', 'director'];
test('eleven new job portraits plus eight reused portraits cover all 19 careers', () => {
  assert.deepEqual(Object.keys(NEW_JOB_PORTRAITS).sort(),
    ['service', 'delivery', 'clerk', 'public', 'rescue', 'creator', 'engineer', 'inspector', 'film', 'atc', 'racer'].sort());
  assert.equal(new Set(Object.values(NEW_JOB_PORTRAITS).map(art => JSON.stringify(art))).size, 11);
  assert.deepEqual([...Object.keys(NEW_JOB_PORTRAITS), ...Object.keys(LEGACY_JOB_PORTRAITS)].sort(), [...TRACK_IDS].sort());
  assert.deepEqual(Object.keys(JOB_NAMES).sort(), [...TRACK_IDS].sort());
  for (const track of TRACK_IDS) {
    const art = jobAsset(track);
    if (track in NEW_JOB_PORTRAITS) {
      assert.equal(art.kind, 'vector');
      if (art.kind === 'vector') assert.equal(art.drawing, NEW_JOB_PORTRAITS[track as keyof typeof NEW_JOB_PORTRAITS]);
    } else {
      assert.equal(art.kind, 'raster');
      if (art.kind === 'raster') within(art.file, 60_000);
    }
  }
});

function checkDrawing(name: string, art: VectorArt, limit: number) {
  assert.equal(art.viewBox, '0 0 128 128', name);
  assert.ok(art.paths.length > 3, `${name}: nonempty layered drawing`);
  assert.ok(Buffer.byteLength(JSON.stringify(art)) <= limit, `${name}: inline byte budget`);
  for (const part of art.paths) {
    assert.match(part.d, /^[Mm][\d\s.,+\-MmLlHhVvCcSsQqTtAaZz]+$/, `${name}: path data only`);
    for (const color of [part.fill, part.stroke]) {
      if (color !== undefined) assert.match(color, /^(none|#[0-9a-f]{6})$/, `${name}: local solid colors only`);
    }
    assert.ok(Number.isFinite(part.width) && part.width! > 0, `${name}: visible finite stroke`);
  }
}
test('new inline assets stay small and contain only local vector data', () => {
  for (const [id, d] of Object.entries(NEW_TILE_PATHS)) {
    assert.match(d, /^[Mm][\d\s.,+\-MmLlHhVvCcSsQqTtAaZz]+$/, id);
    assert.ok(Buffer.byteLength(d) <= 1_000, id);
  }
  for (const [id, art] of Object.entries(NEW_PLACE_TILES)) checkDrawing(id, art, 6_000);
  for (const [id, art] of Object.entries(NEW_JOB_PORTRAITS)) checkDrawing(id, art, 8_000);
});

// A small DOM double exercises the real renderers without adding a runtime or test dependency.
class ArtNode {
  tagName: string;
  namespaceURI: string | null;
  attributes: Record<string, string> = {};
  dataset: Record<string, string> = {};
  style: Record<string, unknown> = { setProperty: (key: string, value: string) => { this.style[key] = value; } };
  children: ArtNode[] = [];
  className = '';
  textContent = '';
  alt = '';
  src = '';
  title = '';
  constructor(tag: string, namespace: string | null = null) { this.tagName = tag; this.namespaceURI = namespace; }
  setAttribute(key: string, value: string) { this.attributes[key] = value; }
  append(...nodes: ArtNode[]) { this.children.push(...nodes); }
  get firstElementChild() { return this.children[0]; }
}
function withArtDOM(run: () => void) {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'document', { configurable: true, value: {
    createElement: (tag: string) => new ArtNode(tag),
    createElementNS: (namespace: string, tag: string) => new ArtNode(tag, namespace),
  } });
  try { run(); } finally {
    if (previous) Object.defineProperty(globalThis, 'document', previous);
    else Reflect.deleteProperty(globalThis, 'document');
  }
}
const drawn = (node: SVGSVGElement | HTMLImageElement | HTMLElement) => node as unknown as ArtNode;

test('icons render in the existing 22px box and remain decorative and non-interactive', () => withArtDOM(() => {
  for (const kind of [...new Set(WORLD.map(node => node.kind))] as SpaceKind[]) {
    const node = drawn(tileIcon(kind));
    assert.equal(node.namespaceURI, 'http://www.w3.org/2000/svg');
    assert.equal(node.attributes.viewBox, '0 0 24 24');
    assert.equal(node.attributes['aria-hidden'], 'true');
    assert.equal(node.attributes.focusable, 'false');
    assert.equal(node.style.width, '22px');
    assert.equal(node.style.height, '22px');
    assert.equal(node.style.pointerEvents, 'none');
    assert.equal(node.dataset.tileIcon, kind);
    assert.ok(node.firstElementChild.attributes.d, kind);
  }
}));

test('place and job renderers return named SVGs or local raster images with stable hooks', () => withArtDOM(() => {
  const check = (node: ArtNode, label: string, art: ReturnType<typeof placeAsset>) => {
    if (art.kind === 'vector') {
      assert.equal(node.tagName, 'svg');
      assert.equal(node.attributes['aria-label'], label);
      assert.equal(node.attributes.role, 'img');
      assert.equal(node.attributes.focusable, 'false');
      assert.equal(node.children.length, art.drawing.paths.length);
      for (const [index, child] of node.children.entries()) {
        assert.equal(child.tagName, 'path');
        assert.equal(child.attributes.d, art.drawing.paths[index].d);
      }
    } else {
      assert.equal(node.tagName, 'img');
      assert.equal(node.alt, label);
      assert.equal(node.src, `/art/${art.file}.webp`);
    }
  };
  for (const id of Object.keys(LIFE_PLACES) as LifePlaceId[]) {
    const node = drawn(placeArt(id));
    assert.equal(node.dataset.placeArt, id);
    check(node, LIFE_PLACES[id].name, placeAsset(id));
  }
  for (const id of TRACK_IDS) {
    const node = drawn(jobPortrait(id));
    assert.equal(node.dataset.jobPortrait, id);
    check(node, JOB_NAMES[id], jobAsset(id));
  }
  const label = '<img src=x onerror=alert(1)>';
  const node = drawn(vectorArt(NEW_PLACE_TILES.library, label, 'test'));
  assert.equal(node.attributes['aria-label'], label, 'labels are attributes, never parsed markup');
  assert.ok(node.children.every(child => child.tagName === 'path'));
}));

test('all six boards use kind icons while preserving all 212 tile names and pawn hooks', () => withArtDOM(() => {
  for (const map of Object.keys(MAPS)) {
    const state = newLife(1); state.board.pos = `${map}-o0`;
    const grid = drawn(board(state)).children[0];
    assert.equal(grid.dataset.map, map);
    const tiles = grid.children.filter(node => node.dataset.space);
    const expected = WORLD.filter(node => node.map === map);
    assert.deepEqual(tiles.map(node => node.dataset.space), expected.map(node => node.id));
    for (const [index, tile] of tiles.entries()) {
      const world = expected[index];
      assert.equal(tile.dataset.kind, world.kind);
      assert.equal(tile.children[0].dataset.tileIcon, world.kind);
      assert.ok(tile.attributes['aria-label'].includes(LIFE_PLACES[world.place].name));
      assert.ok(tile.children[1].textContent, 'visible Korean kind label is retained');
    }
    const pawns = tiles.flatMap(tile => tile.children.filter(node => node.dataset.pawn));
    assert.equal(pawns.length, 1);
    assert.equal(pawns[0].dataset.pawn, state.board.pos);
  }
}));


test('F4 drone and promotion rays use distinct, bounded original path data', () => {
  assert.deepEqual(Object.keys(MOTION_ART), ['drone', 'rays']);
  assert.notDeepEqual(MOTION_ART.drone.paths, MOTION_ART.rays.paths);
  for (const [id, art] of Object.entries(MOTION_ART)) checkDrawing(id, art, 4_000);
});

test('F4 motion assets render accessible local SVGs without external resources', () => withArtDOM(() => {
  for (const [id, art] of Object.entries(MOTION_ART)) {
    const node = drawn(vectorArt(art, id === 'drone' ? '인생 비행 항로' : '승급', `life2-${id}`));
    assert.equal(node.attributes.role, 'img'); assert.ok(node.attributes['aria-label']);
    assert.equal(node.children.length, art.paths.length);
    assert.ok(node.children.every(child => child.tagName === 'path' && !child.attributes.href));
  }
}));
