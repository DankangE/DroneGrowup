import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { GRADE_STEPS } from '../src/life/data.ts';
import { MAPS, PLACES, WORLD } from '../src/life/world.ts';
import type { Cond, MapId, PlaceId, SpaceKind, Stat, StatMap } from '../src/life/types.ts';

const mapIds: MapId[] = ['A', 'B', 'C', 'D', 'E', 'F'];
const byId = new Map(WORLD.map(node => [node.id, node]));
const nodesIn = (map: MapId) => WORLD.filter(node => node.map === map);
// Recover the original grid cell from its floored percentage center, not pixel distance.
const grid = (node: { x: number; y: number }) => ({
  col: Math.floor(node.x * 7 / 100), row: Math.floor(node.y * 9 / 100),
});

const kindNames: Record<SpaceKind, string> = {
  start: '출발', pay: '월급날', train: '배움', job: '일감', contest: '대회 · 시험', event: '사건',
  rest: '휴식', rankup: '승급 심사', jobfair: '취업 · 이직', shop: '상점가', estate: '부동산',
  life: '생활', biz: '상가', luck: '행운', station: '환승', invest: '투자',
};
const kinds = Object.keys(kindNames) as SpaceKind[];
const expectedSizes: Record<MapId, number> = { A: 33, B: 44, C: 39, D: 23, E: 38, F: 35 };
// §3.1 column order, including every zero column.
const expectedKinds: Record<MapId, number[]> = {
  A: [1, 2, 8, 5, 2, 3, 3, 2, 2, 1, 1, 1, 0, 1, 1, 0],
  B: [1, 3, 4, 6, 2, 4, 3, 3, 3, 2, 3, 4, 2, 2, 2, 0],
  C: [1, 2, 3, 12, 3, 5, 3, 3, 1, 1, 1, 0, 1, 1, 2, 0],
  D: [1, 1, 5, 3, 3, 2, 1, 4, 1, 1, 0, 0, 0, 0, 1, 0],
  E: [1, 2, 3, 6, 2, 4, 2, 2, 1, 1, 2, 2, 3, 2, 2, 3],
  F: [1, 2, 3, 4, 2, 4, 4, 1, 1, 0, 2, 6, 2, 2, 1, 0],
};
const claimedForks: Record<MapId, number> = { A: 2, B: 6, C: 5, D: 2, E: 4, F: 2 };
const specialGate: Cond = {
  any: [
    { flags: ['licensed'], any: [
      { min: { theory: 150 } }, { min: { skill: 150 } }, { min: { xp: 420 } },
      { min: { rep: 105 } }, { min: { teach: 150 } }, { min: { biz: 150 } }, { min: { net: 150 } },
    ] },
    { flags: ['invite'] },
  ],
};

test('WORLD preserves all 212 appendix A rows, including names, coordinates and edge order', () => {
  // Parse the source of truth only in this test; production imports a literal table.
  const spec = readFileSync(new URL('../docs/design/life-board.md', import.meta.url), 'utf8');
  const appendix = spec.slice(spec.indexOf('## 부록 A. 칸 표'));
  const rows = appendix.split('\n').filter(line => /^\| [A-F]-\w+ \|/.test(line))
    .map(line => line.split('|').slice(1, -1).map(cell => cell.trim()));
  assert.equal(rows.length, 212);
  assert.equal(WORLD.length, 212);
  const actual = WORLD.map(node => {
    const { col, row } = grid(node);
    return [node.id, `${col},${row}`, kindNames[node.kind], PLACES[node.place].name,
      node.next.map(id => id.slice(2)).join(' / '), (node.cross ?? []).map(edge => edge.to).join(', ')];
  });
  assert.deepEqual(actual, rows);
});

test('node ids are unique and every map has exactly one start at its o0', () => {
  assert.equal(byId.size, 212);
  assert.deepEqual(Object.keys(MAPS), mapIds);
  for (const node of WORLD) {
    assert.ok(mapIds.includes(node.map), node.id);
    assert.match(node.id, new RegExp(`^${node.map}-[a-z]\\d+$`));
  }
  for (const map of mapIds) {
    const nodes = nodesIn(map);
    assert.equal(nodes.length, expectedSizes[map], map);
    assert.deepEqual(nodes.filter(node => node.kind === 'start').map(node => node.id), [`${map}-o0`]);
  }
});

test('coordinates are unique within each map and use integer, floored cell-center percentages', () => {
  for (const map of mapIds) {
    const coordinates = new Set<string>();
    for (const node of nodesIn(map)) {
      assert.ok(Number.isSafeInteger(node.x) && Number.isSafeInteger(node.y), node.id);
      assert.ok(node.x > 0 && node.x < 100 && node.y > 0 && node.y < 100, node.id);
      const { col, row } = grid(node);
      assert.equal(node.x, Math.floor((col + 0.5) / 7 * 100), node.id);
      assert.equal(node.y, Math.floor((row + 0.5) / 9 * 100), node.id);
      const key = `${col},${row}`;
      assert.ok(!coordinates.has(key), `${map}: duplicate grid coordinate ${key}`);
      coordinates.add(key);
    }
  }
});

test('every next edge exists, stays in its map and joins orthogonally adjacent grid cells', () => {
  for (const node of WORLD) {
    assert.equal(new Set(node.next).size, node.next.length, `${node.id}: repeated next edge`);
    for (const id of node.next) {
      const target = byId.get(id);
      assert.ok(target, `${node.id} -> ${id}: missing destination`);
      assert.equal(target.map, node.map, `${node.id} -> ${id}: use cross for map transfers`);
      const from = grid(node), to = grid(target);
      assert.equal(Math.abs(from.col - to.col) + Math.abs(from.row - to.row), 1, `${node.id} -> ${id}`);
    }
  }
});

test('no node is a dead end and every node is reachable from its own map o0 without transfers', () => {
  for (const node of WORLD) {
    const outgoing = [...node.next, ...(node.cross ?? []).map(edge => edge.to)];
    assert.ok(outgoing.length > 0, `${node.id}: dead end`);
    for (const id of outgoing) assert.ok(byId.has(id), `${node.id} -> ${id}: missing destination`);
    // Every station also has a free local exit, even if its transfers are locked or unaffordable.
    assert.ok(node.next.length > 0, `${node.id}: must not require a transfer to leave`);
  }
  for (const map of mapIds) {
    const seen = new Set<string>();
    const pending = [`${map}-o0`];
    while (pending.length) {
      const id = pending.pop()!;
      if (seen.has(id)) continue;
      seen.add(id);
      const node = byId.get(id);
      assert.ok(node, id);
      assert.equal(node.map, map);
      pending.push(...node.next);
    }
    assert.deepEqual([...seen].sort(), nodesIn(map).map(node => node.id).sort(), map);
  }
});

for (const map of mapIds) {
  test(`${map}: all 16 kind counts match section 3.1`, () => {
    const counts = kinds.map(kind => nodesIn(map).filter(node => node.kind === kind).length);
    assert.deepEqual(counts, expectedKinds[map], `${map}: ${kinds.join(', ')}`);
  });
}

test('global kind totals match all 16 section 3.1 columns', () => {
  assert.deepEqual(kinds.map(kind => WORLD.filter(node => node.kind === kind).length),
    [6, 12, 26, 36, 14, 22, 16, 15, 9, 6, 9, 13, 8, 8, 9, 3]);
});

test('forks: 12 nodes with next >= 2, and with the 9 transfer stations 21 as in section 3.1 (2/6/5/2/4/2)', () => {
  // Section 3.1 counts a transfer station as a fork; appendix A lists transfers in their own column.
  const appendixForks: Record<MapId, string[]> = {
    A: ['A-o4'], B: ['B-o11', 'B-o25', 'B-i2', 'B-i8'], C: ['C-o4', 'C-o11', 'C-v3'],
    D: ['D-o3'], E: ['E-o5', 'E-o20'], F: ['F-o11'],
  };
  for (const map of mapIds) {
    assert.deepEqual(nodesIn(map).filter(node => node.next.length >= 2).map(node => node.id), appendixForks[map]);
    assert.equal(nodesIn(map).filter(node => node.next.length + (node.cross?.length ?? 0) >= 2).length,
      claimedForks[map], map);
  }
  assert.equal(WORLD.filter(node => node.next.length >= 2).length, 12);
  assert.equal(WORLD.filter(node => node.next.length + (node.cross?.length ?? 0) >= 2).length, 21);
});

test('exactly 9 transfer nodes have the section 3.2 destinations, fares and destination gates', () => {
  const transfers = WORLD.filter(node => node.cross?.length);
  assert.equal(transfers.length, 9);
  assert.deepEqual(transfers.map(node => node.id), WORLD.filter(node => node.kind === 'station').map(node => node.id));
  assert.deepEqual(Object.fromEntries(transfers.map(node => [node.id, node.cross])), {
    'A-o13': [{ to: 'B-o1', fare: 10 }],
    'B-o7': [{ to: 'A-o1', fare: 10 }, { to: 'C-o1', fare: 10 }, { to: 'E-o1', fare: 30 }],
    'B-o21': [{ to: 'D-o1', fare: 300, gate: specialGate }, { to: 'F-o1', fare: 30 }],
    'C-o13': [{ to: 'B-o1', fare: 10 }],
    'C-o21': [{ to: 'D-o1', fare: 300, gate: specialGate }],
    'D-o9': [{ to: 'B-o1', fare: 10 }, { to: 'C-o1', fare: 10 }],
    'E-o13': [{ to: 'B-o1', fare: 10 }],
    'E-o21': [{ to: 'F-o1', fare: 30 }],
    'F-o13': [{ to: 'B-o1', fare: 10 }, { to: 'E-o1', fare: 30 }],
  });
  for (const node of transfers) for (const edge of node.cross!) {
    const destination = byId.get(edge.to);
    assert.ok(destination, edge.to);
    assert.notEqual(destination.map, node.map);
    assert.equal(edge.to, `${destination.map}-o1`);
    assert.notEqual(destination.kind, 'start', 'a transfer must bypass start');
    assert.equal(edge.fare, MAPS[destination.map].fareIn);
    assert.ok(Number.isSafeInteger(edge.fare) && edge.fare > 0);
    assert.deepEqual(edge.gate, MAPS[destination.map].gate);
  }
});

test('MAPS encodes section 3.1 multipliers, section 3.2 entry tolls and section 8.1 house prices', () => {
  assert.deepEqual(MAPS, {
    A: { name: '새싹 마을', payPct: 90, livePct: 100, homePct: 70, fareIn: 10 },
    B: { name: '도심', payPct: 110, livePct: 130, homePct: 100, fareIn: 10 },
    C: { name: '산업 벨트', payPct: 100, flightPayPct: 130, livePct: 90, homePct: 70, fareIn: 10 },
    D: { name: '전문가 특구', payPct: 150, payTracks: { track: ['engineer', 'inspector', 'film', 'atc', 'racer'] },
      livePct: 180, homePct: 100, gate: specialGate, fareIn: 300 },
    E: { name: '항구 신도시', payPct: 130, payTracks: { track: ['clerk', 'employee', 'solo', 'company', 'academy'] },
      livePct: 160, homePct: 130, fareIn: 30 },
    F: { name: '바닷가 휴양지', payPct: 80, livePct: 120, homePct: 80, fareIn: 30 },
  });
});

// Test-only interpreter for the flags/min/any subset, to exercise the gate's Boolean grouping.
function gateMatches(cond: Cond, stats: StatMap, flags: string[]): boolean {
  return (!cond.flags || cond.flags.every(flag => flags.includes(flag)))
    && Object.entries(cond.min ?? {}).every(([stat, min]) => (stats[stat as Stat] ?? 0) >= min)
    && (!cond.any || cond.any.some(branch => gateMatches(branch, stats, flags)));
}

test('D entry requires licensed AND any of seven grade-C stats, OR invite alone', () => {
  const gate = MAPS.D.gate!;
  assert.deepEqual(gate, specialGate);
  const thresholds: StatMap = { theory: 150, skill: 150, xp: 420, rep: 105, teach: 150, biz: 150, net: 150 };
  assert.equal(gateMatches(gate, {}, []), false);
  assert.equal(gateMatches(gate, {}, ['licensed']), false);
  assert.equal(gateMatches(gate, {}, ['invite']), true);
  assert.equal(gateMatches(gate, {}, ['licensed', 'invite']), true);
  for (const [stat, value] of Object.entries(thresholds)) {
    assert.equal(value, GRADE_STEPS[stat as keyof typeof GRADE_STEPS]![3], `${stat}: C threshold`);
    assert.equal(gateMatches(gate, { [stat]: value - 1 }, ['licensed']), false, `${stat}: below C`);
    assert.equal(gateMatches(gate, { [stat]: value }, ['licensed']), true, `${stat}: exactly C`);
    assert.equal(gateMatches(gate, { [stat]: value + 1 }, ['licensed']), true, `${stat}: above C`);
    assert.equal(gateMatches(gate, { [stat]: value }, []), false, `${stat}: no license`);
  }
  assert.equal(gateMatches(gate, { stamina: 100, support: 100, money: 100_000, fans: 999 }, ['licensed']), false);
  const belowAll = Object.fromEntries(Object.entries(thresholds).map(([stat, value]) => [stat, value - 1]));
  assert.equal(gateMatches(gate, belowAll, ['licensed']), false);
});

test('all 89 appendix places have distinct Korean names and shared v1 locations keep their ids', () => {
  const places = new Set(WORLD.map(node => node.place));
  assert.equal(places.size, 89);
  assert.deepEqual([...places].sort(), Object.keys(PLACES).sort());
  assert.equal(new Set(Object.values(PLACES).map(place => place.name)).size, 89);
  const shared: Partial<Record<PlaceId, string>> = {
    school: '강의동', airfield: '비행 실습장', exam: '자격 시험장', garage: '정비소', farm: '농경지',
    site: '건설 현장', bridge: '대교', windfarm: '풍력발전 단지', coast: '해안', studio: '촬영 세트장',
    office: '내 사무실', hq: '본사 사옥', academy: '드론 교육원', assoc: '협회 회관',
    home: '본가', town: '읍내', bank: '은행 본점', shop: '드론 상점',
  };
  for (const [id, name] of Object.entries(shared)) assert.equal(PLACES[id as PlaceId].name, name, id);
  for (const [id, place] of Object.entries(PLACES)) {
    assert.match(id, /^[a-z]+(?:_[a-z]+)*$/);
    assert.match(place.name, /[가-힣]/, id);
  }
});
