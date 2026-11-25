import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ENDINGS } from '../src/life/data.ts';
import { CAREER_KEYS } from '../src/life/career2.ts';
import { achievementScore, canRetireEarly, endingFor, finalNetWorth, finish, recordAchievements,
  retireEarly, settlementSummary } from '../src/life/ending.ts';
import { choose, derived, forecast, newGame, options, restore } from '../src/life/engine.ts';
import { EVENT_KEYS } from '../src/life/events-a.ts';
import { EVENT2_KEYS } from '../src/life/events-e.ts';
import { ENDINGS2, ENDING_KEYS, ENDING_RULES, FEATS, LIFE_RULES, MAP_IDS } from '../src/life/life-data.ts';
import { TRACKS } from '../src/life/tracks.ts';
import { WORLD } from '../src/life/world.ts';
import type { EndingId, GameState, TrackId } from '../src/life/types.ts';
import { ENDINGS2 as UI_ENDINGS } from '../src/ui2/popups/ending-data.ts';
import { endingModel } from '../src/ui2/popups/ending.ts';
import { mountLife } from '../src/ui2/app.ts';
import { action, controls, TestNode, textOf, withDOM } from './life-popup2-dom-helper.ts';

function stateAt(turn = 204): GameState {
  const state = choose(newGame(1), 'start:self').state;
  state.turn = turn; state.status = 'jobless';
  Object.assign(state.s, { money: 0, happy: 0, stamina: 80, capStamina: 80 });
  return state;
}
function career(state: GameState, track: TrackId, top = false) {
  state.track = track; state.status = 'working'; state.job.tracks = [track];
  state.job.rank = top ? TRACKS.find(row => row.id === track)!.ranks.length - 1 : 0;
  state.s.rank = state.job.rank;
}
function kids(state: GameState, points = [0, 3]) {
  state.family.kids = points.map(pts => ({ born: 0, pts, stage: 4 }));
}
function freeze(value: unknown): void {
  if (!value || typeof value !== 'object') return;
  Object.values(value).forEach(freeze); Object.freeze(value);
}
function integers(value: unknown): void {
  if (typeof value === 'number') assert.ok(Number.isSafeInteger(value));
  else if (value && typeof value === 'object') Object.values(value).forEach(integers);
}
const cases: [EndingId, (s: GameState) => void][] = [
  ['debtor', s => { s.s.debt = 3001; s.feats.push('foundation', 'ceo'); }],
  ['philanthropist', s => { s.feats.push('foundation', 'ceo', 'chairman', 'academy'); }],
  ['ceo', s => { s.feats.push('ceo', 'chairman', 'academy', 'top:racer'); }],
  ['chairman', s => { s.feats.push('chairman', 'academy', 'top:racer'); }],
  ['academy', s => { s.feats.push('academy', 'top:racer'); }],
  ['legend', s => { s.feats.push('top:racer', 'top:engineer'); }],
  ['master', s => { s.feats.push('top:film', 'top:creator'); }],
  ['star', s => { s.feats.push('top:creator', 'top:rescue'); }],
  ['hero', s => { s.feats.push('top:rescue'); s.s.money = 100000; }],
  ['tycoon', s => { s.s.money = 100000; s.s.happy = 700; kids(s); }],
  ['family', s => { s.s.happy = 700; kids(s); s.feats.push('official'); }],
  ['official', s => { s.feats.push('official'); career(s, 'company'); }],
  ['smallbiz', s => { career(s, 'company'); s.job.tracks.unshift('solo'); s.s.happy = 500; }],
  ['solo', s => { s.job.tracks = ['solo']; s.s.happy = 500; }],
  ['director', s => { s.job.tracks = ['director']; s.s.happy = 500; }],
  ['instructor', s => { s.job.tracks = ['academy']; s.s.happy = 500; }],
  ['employee', s => { s.job.tracks = ['clerk']; s.s.happy = 500; }],
  ['pilot', s => { s.job.tracks = ['mechanic']; s.flags.push('licensed'); s.s.happy = 500; }],
  ['freeman', s => { s.job.tracks = ['service']; s.s.happy = 500; }],
  ['worker', s => { s.job.tracks = ['delivery']; s.s.happy = 499; }],
  ['student', () => {}],
];

for (const [index, [id, setup]] of cases.entries()) test(`§10 priority ${index + 1}/21: ${id} settles from its state`, () => {
  const state = stateAt(); setup(state);
  const before = structuredClone(state); freeze(state);
  assert.equal(endingFor(state).id, id);
  const final = finish(state);
  assert.equal(final.ending, id); assert.equal(final.phase, 'ended');
  assert.equal(final.score, settlementSummary(final).score);
  assert.deepEqual(finish(final), final, 'settlement is idempotent');
  assert.deepEqual(restore(JSON.parse(JSON.stringify(final))), final);
  assert.deepEqual(state, before); integers(final);
});

test('the shared catalog has the exact priority, ten new texts, and unchanged original eleven ids and texts', () => {
  assert.equal(ENDINGS2.length, 21); assert.equal(new Set(ENDINGS2.map(row => row.id)).size, 21);
  assert.deepEqual(ENDINGS2.map(row => row.id), cases.map(([id]) => id));
  assert.equal(UI_ENDINGS, ENDINGS2);
  for (const old of ENDINGS) {
    const row = ENDINGS2.find(row => row.id === old.id)!;
    assert.equal(row.title, old.title); assert.equal(row.text, old.text);
  }
  const additions = ENDINGS2.filter(row => !ENDINGS.some(old => old.id === row.id));
  assert.equal(additions.length, 10);
  assert.ok(additions.every(row => row.title && row.text.length > 30 && row.hint));
});

test('debtor, tycoon, family and happiness thresholds are exact; ledger counts in the threshold', () => {
  const state = stateAt(); state.s.debt = 3000;
  assert.equal(endingFor(state).id, 'student');
  state.board.ledger = { 미납: -1 }; assert.equal(endingFor(state).id, 'debtor');
  state.s.debt = 0; state.s.money = 100000;
  assert.equal(endingFor(state).id, 'student');
  state.board.ledger = {}; assert.equal(endingFor(state).id, 'tycoon');
  state.s.money = 0; state.s.happy = 700; kids(state, [0]);
  assert.equal(endingFor(state).id, 'freeman');
  kids(state); state.s.happy = 699; assert.equal(endingFor(state).id, 'freeman');
  state.s.happy = 700; assert.equal(endingFor(state).id, 'family');
  state.family.kids[1].stage = 3; assert.equal(endingFor(state).id, 'freeman');
  state.s.happy = 499; assert.equal(endingFor(state).id, 'student');
  state.s.happy = 500; assert.equal(endingFor(state).id, 'freeman');
});

for (const track of ['racer', 'engineer', 'inspector', 'film', 'atc', 'creator', 'rescue'] as const) {
  test(`${track}: highest rank creates a permanent ending and one 2,000-point feat`, () => {
    const state = stateAt(100); career(state, track, true);
    const remembered = recordAchievements(state);
    const left = structuredClone(remembered); left.track = null; left.status = 'jobless'; left.job.rank = 0;
    left.feats.push(ENDING_KEYS.top(track)); // Saved duplicates cannot award points twice.
    const expected = track === 'racer' ? 'legend' : track === 'creator' ? 'star' : track === 'rescue' ? 'hero' : 'master';
    assert.equal(endingFor(left).id, expected);
    assert.equal(achievementScore(left).rows.filter(row => row.id.startsWith('top:')).length, 1);
    assert.equal(achievementScore(left).rows.find(row => row.id === ENDING_KEYS.top(track))!.points, 2000);
    state.job.rank--; assert.notEqual(endingFor(state).id, expected);
  });
}

test('every last-job route uses the latest job, and pilot routes require the license', () => {
  for (const [track, id] of [['solo', 'solo'], ['director', 'director'], ['instructor', 'instructor'],
    ['academy', 'instructor'], ['employee', 'employee'], ['clerk', 'employee'],
    ['pilot', 'pilot'], ['mechanic', 'pilot'], ['delivery', 'pilot'], ['service', 'worker']] as const) {
    const state = stateAt(); state.job.tracks = ['director', track]; state.flags.push('licensed');
    assert.equal(endingFor(state).id, id, track);
    if (['mechanic', 'delivery', 'pilot'].includes(track)) {
      state.flags = []; assert.equal(endingFor(state).id, track === 'pilot' ? 'student' : 'worker');
    }
  }
  const state = stateAt(100); career(state, 'service'); state.job.tracks = ['service', 'clerk'];
  state.board.pos = WORLD.find(row => row.kind === 'jobfair')!.id; state.board.step = 'space'; state.board.dice = [1, 1];
  const quit = choose(state, 'quit').state;
  assert.equal(endingFor(quit).id, 'worker', 'returning to a prior track must not use unique-track insertion order');
  state.track = null; state.job.tracks = ['company']; assert.equal(endingFor(state).id, 'student', 'company must still exist');
});

test('net worth includes every §10 component with integer resale floors, then happiness and feats', () => {
  const state = stateAt(); career(state, 'company');
  Object.assign(state.s, { money: 10000, debt: 1234, drone: 3, gear: 2, car: 2, homeIndex: 103, value: 12345, happy: 17 });
  state.home = { map: 'A', tier: 3, deposit: 0 }; state.estates = [{ map: 'A', tier: 4, paid: 999 }];
  state.holdings = [{ id: 'drone_cafe', level: 1, paid: 1201 }]; state.fund.amount = 2345;
  state.board.ledger = { 급여: 77, 생활비: -99 };
  // A home multiplier is 70%; each item/shop/organization percentage floors independently.
  const worth = 10000 - 1234 + 562 + 187 + 437 + 4326 + 5768 + 840 + 2345 + 1234 + 77 - 99;
  assert.equal(finalNetWorth(state), worth);
  const final = finish(state);
  assert.equal(final.score, worth + 17 * 30 + 200 + 500);
  assert.equal(finalNetWorth(final), worth); assert.deepEqual(final.board.ledger, {});
  state.track = 'academy'; state.s.level = 3;
  assert.equal(finalNetWorth(state), worth - 1234 + 2700);
  state.track = null; state.home = { map: 'A', tier: 2, deposit: 1500 };
  assert.equal(finalNetWorth(state), worth - 1234 - 4326 + 1500);
});

test('event improvements and succession use existing valuation once, with succession added only at settlement', () => {
  const state = stateAt(); career(state, 'company'); state.s.value = 10000;
  state.timers[EVENT2_KEYS.succession] = 10;
  assert.equal(finalNetWorth(state), 1100); assert.equal(derived(state).netWorth, 1000);
  assert.equal(settlementSummary(finish(state)).netWorth, 1100);
  state.home = { map: 'A', tier: 3, deposit: 0 }; state.timers[`${EVENT_KEYS.homeValue}:A:3`] = 777;
  assert.equal(finalNetWorth(state), 1100 + 4200 + 777);
  assert.equal(derived(state).netWorth, 1000 + 4200 + 777);
});

test('negative worth floors only the asset score; debtor keeps happiness and achievements', () => {
  const state = stateAt(); state.s.debt = 4000; state.s.happy = 20; state.feats.push('ceo');
  const final = finish(state);
  assert.equal(final.ending, 'debtor'); assert.equal(final.score, 20 * 30 + 200 + 5000);
  assert.equal(final.s.debt, 4000);
});

test('every achievement row has the §10 points; counters, job tops and child bands are not generic wins', () => {
  const state = stateAt(); state.board.visited = 63; state.board.laps = 63;
  state.board.rankups = 2; state.board.contests = 3; state.s.wins = 999;
  state.job.tracks = ['service', 'clerk', 'pilot']; state.feats.push('top:service', 'top:clerk', 'ceo', 'chairman', 'academy');
  state.home = { map: 'A', tier: 3, deposit: 0 }; state.family.marriedAt = 0; kids(state, [0, 3, 6]);
  state.holdings = ['drone_cafe', 'drone_shop', 'farm'].map(id => ({ id, level: 1, paid: 0 }));
  const points = achievementScore(state), rows = new Map(points.rows.map(row => [row.id, row.points]));
  for (const map of MAP_IDS) { assert.equal(rows.get(`visit:${map}`), 200); assert.equal(rows.get(`lap:${map}`), 300); }
  for (const [id, amount] of Object.entries({ promotion: 600, contest: 450, 'top:service': 2000, 'top:clerk': 2000,
    three_jobs: 500, home: 500, marriage: 300, 'kid_independent:0': 200, 'kid_independent:1': 500,
    'kid_independent:2': 1000, three_shops: 500, ceo: 5000, chairman: 4000, academy: 3500, no_loan: 1000 })) {
    assert.equal(rows.get(id), amount, id);
  }
  assert.equal(points.total, 25050); assert.equal(points.capped, 25050);
  for (const [pts, expected] of [[0, 200], [2, 200], [3, 500], [5, 500], [6, 1000], [9, 1000]]) {
    kids(state, [pts]); assert.equal(achievementScore(state).rows.find(row => row.id === 'kid_independent:0')!.points, expected);
  }
});

test('the 30,000 feat cap applies once to the combined total and never caps net worth or happiness', () => {
  const state = stateAt(); state.board.rankups = 100; state.s.money = 200000; state.s.happy = 999;
  const points = achievementScore(state);
  assert.equal(points.total, 31200); assert.equal(points.capped, 30000);
  assert.equal(finish(state).score, 200000 + 999 * 30 + 30000);
  state.board.rankups = 96; state.board.contests = 0;
  assert.equal(achievementScore(state).total, 30000); assert.equal(achievementScore(state).capped, 30000);
  state.board.rankups--; assert.equal(achievementScore(state).capped, 29700);
});

for (const [score, grade] of [[0, 'D'], [19999, 'D'], [20000, 'C'], [39999, 'C'], [40000, 'B'],
  [69999, 'B'], [70000, 'A'], [119999, 'A'], [120000, 'S']] as const) {
  test(`final grade boundary ${score}: ${grade}`, () => {
    const state = stateAt(); state.board.visited = 0; state.feats = [];
    state.flags.push(ENDING_KEYS.borrowed); state.s.money = score;
    assert.equal(settlementSummary(state).score, score); assert.equal(settlementSummary(state).grade, grade);
  });
}

test('borrow then repay never earns no-loan; current debt and a final unpaid ledger also disqualify', () => {
  const state = stateAt(144); state.s.money = 2000;
  const borrowed = choose(state, 'loan:100', 'phone').state;
  const repaid = choose(borrowed, 'repay:100', 'phone').state;
  assert.equal(repaid.s.debt, 0); assert.ok(repaid.flags.includes(ENDING_KEYS.borrowed));
  assert.ok(!achievementScore(retireEarly(repaid)).rows.some(row => row.id === 'no_loan'));
  for (const useLedger of [false, true]) {
    const unpaid = stateAt();
    if (useLedger) unpaid.board.ledger = { 미납: -1 }; else unpaid.s.debt = 1;
    assert.ok(!achievementScore(finish(unpaid)).rows.some(row => row.id === 'no_loan'));
  }
  assert.ok(!achievementScore(state).rows.some(row => row.id === 'no_loan'), 'only a completed lifetime qualifies');
  assert.ok(achievementScore(retireEarly(state)).rows.some(row => row.id === 'no_loan'));
});

test('owning a home and three shops is remembered after selling; record collection is idempotent', () => {
  const state = stateAt(144); state.home = { map: 'A', tier: 3, deposit: 0 };
  state.holdings = ['drone_cafe', 'drone_shop', 'farm'].map(id => ({ id, level: 1, paid: 1000 }));
  const remembered = recordAchievements(state), sold = structuredClone(remembered);
  sold.home = null; sold.holdings = [];
  assert.deepEqual(recordAchievements(remembered), remembered);
  const rows = achievementScore(sold).rows;
  assert.equal(rows.find(row => row.id === 'home')!.points, 500);
  assert.equal(rows.find(row => row.id === 'three_shops')!.points, 500);
});

for (const [choice, id, points] of [[0, 'foundation', 3000], [1, 'scholarship', 300]] as const) {
  test(`foundation event choice ${choice}: ${id} persists and its ${points} points are counted once`, () => {
    const state = stateAt(160); state.s.money = 50000; state.phase = 'event'; state.eventId = 'foundation';
    const result = choose(state, `ev:${choice}`), preview = forecast(state, `ev:${choice}`).branches[0];
    assert.ok(result.state.feats.includes(id)); assert.equal(result.state.timers[EVENT_KEYS.points], points);
    assert.deepEqual(preview.effects?.feats, result.state.feats);
    const scores = achievementScore(result.state);
    assert.equal(scores.rows.find(row => row.id === id)?.points, points);
    assert.equal(scores.total, 200 + points); assert.ok(!scores.rows.some(row => row.id === 'event'));
    assert.equal(endingFor(result.state).id, choice ? 'student' : 'philanthropist');
    result.state.timers[EVENT_KEYS.points] += 300;
    assert.equal(achievementScore(result.state).total, 200 + points + 300, 'other event points survive');
  });
}

for (const [action, track, ending] of [['co_ipo', 'company', 'ceo'], ['dir_chair', 'director', 'chairman'],
  ['ac_accredit', 'academy', 'academy']] as const) {
  test(`${action}: success is a permanent feat and never an immediate ending`, () => {
    const state = stateAt(100); career(state, track); state.board.step = 'bonus'; state.board.dice = [1, 1];
    state.board.pos = WORLD.find(row => row.place === (action === 'co_ipo' ? 'bank' : 'assoc'))!.id;
    Object.assign(state.s, { money: 10000, support: 100, rank: 1, round: 2, staff: 6, value: 32000, level: 3, students: 30, rep: 150 });
    const preview = forecast(state, `act:${action}`);
    assert.ok(preview.branches.every(row => !row.end));
    let passed = false;
    for (let seed = 1; seed <= 80; seed++) {
      state.rng = seed; const next = choose(state, `act:${action}`);
      if (!next.result.roll?.success) { assert.ok(!next.state.feats.includes(ending)); continue; }
      assert.ok(next.state.feats.includes(ending)); assert.equal(next.state.ending, null);
      assert.ok(next.state.flags.includes(ENDING_RULES.achievementFlags[ending]));
      assert.equal(endingFor(next.state).id, ending); assert.equal(next.state.turn, 101); passed = true; break;
    }
    assert.ok(passed);
  });
}

test('public retirement qualifies only at statutory retirement, including a later career switch', () => {
  const state = stateAt(164); career(state, 'public'); state.job.total = 40;
  for (const mode of ['pension', 'rehire', 'switch']) {
    const retired = choose(state, `retire:${mode}`).state;
    assert.ok(retired.feats.includes('official'), mode); assert.equal(endingFor(retired).id, 'official');
  }
  state.turn = 144;
  assert.equal(endingFor(retireEarly(state)).id, 'student', '55-year-old public employee has not reached statutory retirement');
  state.turn = 183; state.flags.push(CAREER_KEYS.rehire); state.board.step = 'bonus'; state.board.dice = [1, 1];
  assert.ok(choose(state, 'end').state.feats.includes('official'), 'automatic age-65 retirement is recorded');
});

test('early retirement is offered only in the phone at a season start from 55 through 69', () => {
  for (const turn of [143, 144, 145, 203, 204]) {
    const state = stateAt(turn), eligible = turn >= 144 && turn < 204;
    assert.equal(canRetireEarly(state), eligible);
    assert.equal(options(state, 'phone').some(row => row.id === 'phone:retire'), eligible);
    assert.ok(!options(state).some(row => row.id === 'phone:retire'));
    if (!eligible) assert.throws(() => choose(state, 'phone:retire', 'phone'), /not available/);
  }
  for (const step of ['pick', 'space', 'bonus'] as const) {
    const state = stateAt(144); state.board.step = step;
    assert.equal(canRetireEarly(state), false); assert.throws(() => retireEarly(state), /not available/);
  }
  const state = stateAt(144); state.phase = 'event'; state.eventId = 'foundation';
  assert.equal(canRetireEarly(state), false);
  const final = retireEarly(stateAt(144));
  assert.deepEqual(options(final, 'phone'), []); assert.throws(() => retireEarly(final), /not available/);
  assert.throws(() => finish(stateAt(203)), /not available/);
});

for (const [turn, farm, pension, happiness] of [[144, 4200, 5850, 30], [145, 4090, 5780, 28], [203, 30, 70, 0]]) {
  test(`early retirement turn ${turn}: seasonal rent, pension and shops only, happiness for whole remaining years`, () => {
    const state = stateAt(turn); career(state, 'creator');
    Object.assign(state.s, { money: 1000, debt: 500, happy: 100, fans: 999, homeIndex: 100 });
    state.life = 3; state.family.marriedAt = 0; state.family.dual = true; state.fund.amount = 10000;
    state.timers[CAREER_KEYS.pension] = 17;
    state.estates = [{ map: 'A', tier: 3, paid: 6000 }];
    state.holdings = [{ id: 'farm', level: 1, paid: 2500 }, { id: 'pension', level: 1, paid: 4000 }];
    state.board.ledger = { 예전급여: 123, 예전생활비: -23 };
    const before = structuredClone(state); freeze(state);
    const preview = forecast(state, 'phone:retire', 'phone').branches[0], result = choose(state, 'phone:retire', 'phone');
    const final = result.state, expectedIncome = (204 - turn) * (17 + 50) + farm + pension;
    assert.equal(final.s.money, 1000 + 100 + expectedIncome); assert.equal(final.s.debt, 500);
    assert.equal(final.s.happy, 100 + happiness); assert.equal(final.turn, 204); assert.equal(final.phase, 'ended');
    assert.equal(final.timers[ENDING_KEYS.earlyAt], turn); assert.equal(final.status, 'retired');
    assert.equal(final.fund.amount, 10000); assert.equal(final.s.homeIndex, 100); assert.equal(final.rng, state.rng);
    assert.deepEqual(final.family, state.family); assert.deepEqual(final.board.ledger, {});
    assert.deepEqual(preview.deltas, result.result.deltas); assert.equal(preview.end, final.ending);
    assert.equal(preview.endsSeason, true); assert.equal(preview.effects?.turn, 204);
    assert.deepEqual(restore(JSON.parse(JSON.stringify(final))), final); assert.deepEqual(state, before); integers(final);
  });
}

test('early retirement grants no new pension or severance, caps happiness, and UI reads the real grade and feats', () => {
  const state = stateAt(144); career(state, 'public'); state.job.total = 100; state.s.happy = 990;
  const final = retireEarly(state);
  assert.equal(final.s.money, 0); assert.equal(final.s.happy, 999);
  assert.equal(final.timers[CAREER_KEYS.pension], undefined);
  const model = endingModel(final), summary = settlementSummary(final);
  for (const line of [`최종 점수 ${final.score}`, `최종 성적 ${summary.grade}`, `업적 점수 ${summary.featScore}`]) {
    assert.ok(model.lines.includes(line), line);
  }
  assert.equal(FEATS.foundation.points, 3000); assert.equal(ENDING_RULES.featCap, 30000);
  assert.equal(LIFE_RULES.maxTurns, 204);
});

test('early retirement respects existing remodeling rent, event franchises and the exact slump expiry', () => {
  const state = stateAt(200);
  state.estates = [{ map: 'A', tier: 3, paid: 6000 }];
  state.timers[`${EVENT_KEYS.homeValue}:A:3`] = 1000;
  state.holdings = [{ id: 'event_franchise:100', level: 2, paid: 4800 }];
  state.timers[`${EVENT_KEYS.shopUntil}:event_franchise:100`] = 202;
  const final = retireEarly(state);
  // Rental floor(5200 * 1.2%) = 62; franchise 135, halved/floored to 67 for two seasons.
  assert.equal(final.s.money, 4 * 62 + 2 * 67 + 2 * 135);
});

test('a ledger loan created and repaid during automatic liquidation still disqualifies no-loan', () => {
  const state = stateAt(200); state.board.step = 'bonus'; state.board.dice = [1, 1];
  state.board.ledger = { 미납: -65000 }; state.fund.amount = 100000; state.s.overdue = 3;
  const after = choose(state, 'end').state;
  assert.equal(after.s.debt, 0); assert.equal(after.fund.amount, 0);
  assert.ok(after.flags.includes(ENDING_KEYS.borrowed));
  assert.ok(!achievementScore(retireEarly(after)).rows.some(row => row.id === 'no_loan'));
});

test('large v2 scores follow the formula without the v1 cap and survive strict restore', () => {
  const state = stateAt(); state.s.money = 9000000; state.fund.amount = 9000000;
  const final = finish(state);
  assert.equal(final.score, 18001200);
  assert.deepEqual(restore(JSON.parse(JSON.stringify(final))), final);
  assert.equal(restore({ ...final, score: Number.MAX_SAFE_INTEGER + 1 }), null);
  assert.equal(restore({ ...final, score: final.score + 0.5 }), null);
});

test('the last racer review can earn legend just before automatic retirement without losing the feat', () => {
  const state = stateAt(103); career(state, 'racer'); state.job.rank = 2;
  state.s.rep = 180; state.s.skill = 330; state.board.contests = 20;
  state.board.step = 'bonus'; state.board.dice = [1, 1];
  const next = choose(state, 'end').state;
  assert.equal(next.status, 'retired'); assert.equal(next.track, null); assert.equal(next.board.rankups, 1);
  assert.ok(next.feats.includes('top:racer')); assert.equal(endingFor(next).id, 'legend');
});

test('a real start crossing awards the map lap once; express arrival only awards the visit', () => {
  const state = stateAt(100); state.board.pos = 'A-o27'; state.board.step = 'pick'; state.board.dice = [1, 1];
  const next = choose(state, 'go:A-o0').state;
  assert.equal(next.board.laps, 1); assert.ok(next.feats.includes('lap:A'));
  const ready = choose(next, 'job:none').state;
  ready.board.pos = 'A-o27'; ready.board.step = 'pick'; ready.board.dice = [1, 1];
  const twice = choose(ready, 'go:A-o0').state;
  assert.equal(achievementScore(twice).rows.filter(row => row.id === 'lap:A').length, 1);
  const express = stateAt(144); express.s.money = 1000;
  express.board.pos = WORLD.find(row => row.kind === 'station' && row.map === 'A')!.id;
  express.board.step = 'space'; express.board.dice = [1, 1];
  const arrived = choose(express, 'express:B-o0').state;
  assert.equal(arrived.board.visited, 3); assert.equal(arrived.board.laps, 0);
  assert.ok(arrived.feats.includes('visit:B')); assert.ok(!arrived.feats.includes('lap:B'));
});

test('success on an actual contest increments the 150-point counter; skipping it does not', () => {
  const state = stateAt(100); state.board.pos = WORLD.find(row => row.kind === 'contest')!.id;
  state.phase = 'event'; state.eventId = 'club'; state.board.step = 'space'; state.board.dice = [1, 1];
  state.s.money = 1000; state.s.skill = 900;
  const next = choose(state, 'ev:0'); assert.equal(next.result.roll?.success, true);
  assert.equal(next.state.board.contests, 1);
  assert.equal(achievementScore(next.state).rows.find(row => row.id === 'contest')?.points, 150);
  assert.equal(choose(state, 'skip').state.board.contests, 0);
});

for (const early of [false, true]) test(`${early ? 'phone retirement' : 'last season'} mounts the real ending, all 21 collection cards and restart`, () => {
  withDOM(() => {
    const original = Object.getOwnPropertyDescriptor(globalThis, 'window');
    const browser = { matchMedia: () => ({ matches: true, addEventListener() {} }) } as unknown as Window;
    Object.defineProperty(globalThis, 'window', { configurable: true, value: browser });
    try {
      const state = stateAt(early ? 144 : 203), root = new TestNode('main');
      state.s.happy = 600;
      if (!early) { state.board.step = 'bonus'; state.board.dice = [1, 1]; }
      mountLife(root.element(), 1, true); browser.__life!.load(state);
      const id = early ? 'phone:retire' : 'end';
      if (early) {
        root.querySelector('[data-nav=phone]')!.fire('click');
        root.querySelector('[data-tab=retire]')!.fire('click');
      }
      for (let page = 0; page < 10 && !controls(root).some(node => node.dataset.option === id); page++) {
        action(root, 'popup-page-next').fire('click');
      }
      controls(root).find(node => node.dataset.option === id)!.fire('click');
      if (early) {
        assert.equal(root.querySelector('[data-confirm=retire]')?.dataset.confirm, 'retire');
        assert.deepEqual(browser.__life!.state(), state); action(root, 'popup-confirm').fire('click');
        assert.equal(root.querySelector('[data-popup=retirement]')?.dataset.popup, 'retirement');
      }
      const final = browser.__life!.state();
      for (let n = 0; root.querySelector('[data-presentation]') && n < 8; n++) action(root, 'popup-close').fire('click');
      assert.deepEqual(final, choose(state, id, early ? 'phone' : 'board').state);
      assert.equal(root.dataset.screen, 'ending'); assert.ok(root.querySelector('.life2-ending-screen'));
      assert.match(textOf(root), /유유자적 자유인/);
      assert.ok(textOf(root).includes(`최종 점수 ${final.score}`));
      root.querySelector('[data-nav=gallery]')!.fire('click');
      assert.equal(root.dataset.screen, 'gallery');
      const cards: string[] = [], unlocked: string[] = [];
      for (let page = 0; page < 7; page++) {
        for (const card of root.querySelectorAll('[data-pick]')) {
          cards.push(card.dataset.pick); if (card.dataset.unlocked === 'true') unlocked.push(card.dataset.pick);
        }
        if (page < 6) action(root, 'gallery-page-next').fire('click');
      }
      assert.deepEqual(cards, ENDINGS2.map(row => row.id)); assert.deepEqual(unlocked, [final.ending]);
      root.querySelector('[data-nav=gallery-close]')!.fire('click');
      root.querySelector('[data-nav=title]')!.fire('click'); assert.equal(root.dataset.screen, 'title');
      action(root, 'new').fire('click');
      assert.equal(root.dataset.screen, 'play'); assert.deepEqual(browser.__life!.state(), newGame(1));
    } finally {
      if (original) Object.defineProperty(globalThis, 'window', original); else Reflect.deleteProperty(globalThis, 'window');
    }
  });
});
