// Read the same Korean strings as the player. Check them against actual seeded choices, including
// the second (crash) draw and the separate season ledger. Expected coverage comes from the tables.
import { isDeepStrictEqual } from 'node:util';
import { POLICIES, botRandom, pick } from '../src/game/bots.ts';
import { ACTIONS, BOARD, BOARD_PLACES, SPACE_MENU, ENDINGS, EVENTS, FLAG_LABEL, LOAN_STEPS, STAGES, STAT_LABEL, STAT_MAX } from '../src/game/data.ts';
import { choose, forecast, newGame, options } from '../src/game/engine.ts';
import { BOOKKEEPING, forecastLines, parseTokens, resultChips, resultMarkers, settlementText, token } from '../src/game/outcome-text.ts';
import type { BranchId, Choice, Cond, GameState, OptionView, Result, Stat, StatMap } from '../src/game/types.ts';

const stats = Object.keys(STAT_LABEL) as Stat[];
// The counters the player never sees as outcome numbers, listed here on purpose: a stat added to the
// renderer's set by mistake (say, debt) must fail this check instead of vanishing from both sides.
const HIDDEN: Stat[] = ['acts', 'flights', 'crashes', 'wins', 'losses', 'overdue'];
if (!isDeepStrictEqual([...BOOKKEEPING].sort(), [...HIDDEN].sort())) {
  throw new Error('outcome-text BOOKKEEPING changed: ' + [...BOOKKEEPING].join(', '));
}
const expected = new Map<string, BranchId[]>();
const covered = new Set<string>();
const failures = new Set<string>();
let cases = 0;
let mismatches = 0;

function branches(rolled: boolean, flight: boolean): BranchId[] {
  if (!rolled) return ['sure'];
  return flight ? ['success', 'fail', 'crash'] : ['success', 'fail'];
}
for (const a of ACTIONS) {
  for (const step of ['space', 'bonus']) expected.set(step + ':' + a.id, branches(!!a.roll, !!a.flight));
}
for (const e of EVENTS) e.choices.forEach((c, i) => expected.set(`event:${e.id} choice ${i}`, branches(!!c.roll, false)));
for (const id of ['skip', 'end', 'route:0', 'route:1', 'spin', 'repair', 'buy:drone', 'buy:gear', 'buy:car', ...LOAN_STEPS.map(n => 'loan:' + n),
  'repay:' + LOAN_STEPS[0], 'repay:all']) expected.set(id, ['sure']);

function equal(where: string, claimed: unknown, actual: unknown) {
  if (isDeepStrictEqual(claimed, actual)) return;
  mismatches++;
  failures.add(`${where}: claimed ${JSON.stringify(claimed)} actual ${JSON.stringify(actual)}`);
}
function statDiff(where: string, claim: StatMap, actual: StatMap) {
  if (stats.some(k => (claim[k] ?? 0) !== (BOOKKEEPING.has(k) ? 0 : actual[k] ?? 0))) {
    equal(where, claim, Object.fromEntries(stats.filter(k => !BOOKKEEPING.has(k) && actual[k]).map(k => [k, actual[k]])));
  }
}
function choiceKey(state: GameState, o: OptionView) {
  if (state.phase === 'event') return `event:${state.eventId} choice ${o.id.slice(3)}`;
  return o.kind === 'action' || o.kind === 'job' ? state.board.step + ':' + o.id : o.id;
}
function readMarkers(text: string) {
  const parts = text.split(' · ');
  return parts.filter(t => t.endsWith(' 획득') || t.startsWith('→ ') && t !== '→ 계절 종료' || t.startsWith('엔딩: '));
}
function checkSettlement(where: string, r: Result) {
  const settle = r.settle?.deltas ?? {};
  const sheet = settlementText(r);
  equal(where + ' settlement block', !!sheet, !!r.season || !!r.upkeep || r.restGain !== undefined);
  if (sheet) {
    const recovery = [...sheet.recovery.matchAll(/(?:휴식|계절 회복) \+(\d+)/g)].reduce((n, m) => n + Number(m[1]), 0);
    const lines = sheet.ledger.map(line => {
      const match = /^(.+) ([+-]?[\d,]+)만원$/.exec(line);
      return { label: match?.[1], amount: Number(match?.[2].replaceAll(',', '')) };
    });
    equal(where + ' pay lines', lines, r.upkeep?.lines ?? []);
    const ledger = lines.reduce((n, line) => n + line.amount, 0);
    const shown = parseTokens(sheet.other.join(' · '));
    statDiff(where + ' settlement extras', shown, { ...settle, stamina: 0, money: 0 });
    equal(where + ' upkeep', ledger, r.upkeep?.total ?? 0);
    equal(where + ' funded upkeep', ledger, (settle.money ?? 0) - (settle.debt ?? 0));
    statDiff(where + ' settlement', { ...shown, stamina: recovery, money: ledger + (shown.debt ?? 0) }, settle);
  }
}

function inspect(before: GameState, o: OptionView, force = false) {
  const key = choiceKey(before, o);
  const f = forecast(before, o.id);
  const lines = forecastLines(f);
  const text = (id: BranchId | 'upfront') => lines.find(l => l.id === id)?.text ?? '';
  equal(key + ' branches', f.branches.map(b => b.id), expected.get(key));
  equal(key + ' odds', [f.chance, f.crashPct], [o.roll?.chance, o.roll?.crashPct]);
  equal(key + ' price', [f.cost, f.tire], [o.cost, o.tire]);
  const fee = parseTokens(text('upfront'));
  const fees: StatMap = {};
  if (o.roll && o.cost) fees.money = -o.cost;
  if (o.roll && o.tire) fees.stamina = -o.tire;
  equal(key + ' upfront', fee, fees);
  if (o.roll && (o.cost || o.tire)) equal(key + ' unconditional payment', text('upfront').includes('성공·실패 무관'), true);

  const claims = new Map<BranchId, StatMap>();
  for (const b of f.branches) {
    const body = text(b.id);
    const label = { sure: '확정', success: '성공', fail: '실패', crash: `추락 시(실패 중 ${o.roll?.crashPct}%)` }[b.id];
    equal(key + ' label', body.startsWith(label + ': '), true);
    const numbers = parseTokens(body);
    if (b.id === 'crash') {
      const fail = f.branches.find(v => v.id === 'fail')!;
      const replaced = stats.filter(k => !BOOKKEEPING.has(k) && (b.deltas[k] ?? 0) !== (fail.deltas[k] ?? 0));
      equal(key + ' crash replacements', Object.keys(numbers).sort(), replaced.sort());
    }
    const changes = b.id === 'crash' ? { ...parseTokens(text('fail')), ...numbers } : numbers;
    for (const k of stats) if (fee[k]) changes[k] = (changes[k] ?? 0) + fee[k]!;
    statDiff(key + ' ' + b.id + ' preview', changes, b.deltas);
    claims.set(b.id, changes);
  }
  if (o.kind === 'action' || o.kind === 'job') {
    const action = ACTIONS.find(a => a.id === o.id)!;
    equal(key + ' tire by step', o.tire, before.board.step === 'space' ? 0 : action.tire);
  }
  if (o.id === 'spin') equal(key + ' die', f.die, 6);
  if (!o.enabled) return;

  const played = new Set<BranchId>();
  const play = (rng: number) => {
    const { state: after, result: r } = choose({ ...before, rng }, o.id);
    const id = r.crashed ? 'crash' : r.roll ? r.roll.success ? 'success' : 'fail' : 'sure';
    const where = key + ' ' + id;
    played.add(id);
    covered.add(where);
    equal(where + ' rolled odds', f.chance, r.roll?.chance);
    cases++;
    const b = f.branches.find(branch => branch.id === id);
    if (!b) return equal(where + ' branch', f.branches.map(x => x.id), id);
    equal(where + ' forecast', b.deltas, r.deltas);
    statDiff(where, claims.get(id)!, r.deltas);
    statDiff(where + ' chips', parseTokens(resultChips(r, before).map(c => c.text).join(' · ')), r.deltas);

    const flag = after.flags.find(v => !before.flags.includes(v));
    const stage = before.stage !== after.stage ? after.stage : undefined;
    const end = after.ending ?? undefined;
    const marks = [];
    if (flag) marks.push((FLAG_LABEL[flag] ?? flag) + ' 획득');
    if (stage) marks.push('→ ' + STAGES[stage].name);
    if (end) marks.push('엔딩: ' + ENDINGS.find(e => e.id === end)!.title);
    const displayed = text(id).split(': ').slice(1).join(': ');
    let previewMarks = readMarkers(displayed);
    if (id === 'crash') {
      const inherited = readMarkers(text('fail').slice('실패: '.length));
      // A different crash ending replaces the failed flight's ending just as a changed stat does.
      previewMarks = [...inherited.filter(m => !(m.startsWith('엔딩: ') && previewMarks.some(s => s.startsWith('엔딩: ')))), ...previewMarks];
    }
    equal(where + ' markers', previewMarks, marks);
    equal(where + ' result markers', resultMarkers(r), marks);
    equal(where + ' metadata', [b.flag, b.stage, b.end], [flag, stage, end]);
    equal(where + ' ended season', b.endsSeason, !!r.season || !!r.ended);
    equal(where + ' season marker', displayed.includes('→ 계절 종료'), !!r.season || !!r.ended);
    equal(where + ' season advanced', after.turn !== before.turn, !!r.season || !!r.ended);
    equal(where + ' accrual forecast', b.accrual, r.season?.accrual);
    const ledger = { ...before.board.ledger };
    if (r.move?.path.some(at => BOARD.nodes[at].kind === 'pay')) {
      for (const key of Object.keys(ledger)) delete ledger[key];
    }
    for (const line of r.season?.accrual ?? []) ledger[line.label] = (ledger[line.label] ?? 0) + line.amount;
    equal(where + ' closing ledger', after.board.ledger, r.ended ? {} : ledger);

    checkSettlement(where, r);
    const settle = r.settle?.deltas ?? {};
    for (const k of stats) {
      const total = (r.deltas[k] ?? 0) + (settle[k] ?? 0);
      if (total !== after.s[k] - before.s[k]) equal(where + ' total ' + k, total, after.s[k] - before.s[k]);
    }
  };
  play(before.rng);
  if (force) {
    const wanted = expected.get(key)!;
    for (let rng = 0; rng < 2000 && played.size < wanted.length; rng++) play(rng);
    equal(key + ' forced branches', [...played].sort(), [...wanted].sort());
  }
}

// Price every offered choice, even locked ones, while the policy decides how the actual run moves on.
for (const policy of Object.keys(POLICIES)) {
  for (const seed of [1, 7, 13]) {
    const random = botRandom(seed);
    let state = newGame(seed * 7919);
    while (state.phase !== 'ended') {
      for (const o of options(state)) inspect(state, o);
      state = choose(state, pick(POLICIES[policy], state, random)).state;
    }
  }
}

// Construct eligible states even for rare events and late-career choices. Use real RNG draws to
// fill coverage gaps (never inject a branch into choose).
function fixture(when: Cond, choice?: Choice) {
  const state = newGame(1);
  state.s.money = Math.max(2000, choice?.cost ?? 0);
  for (const cond of [when, choice?.need]) {
    if (!cond) continue;
    if (cond.stage) state.stage = cond.stage[0];
    Object.assign(state.s, cond.min);
    for (const [k, max] of Object.entries(cond.max ?? {}) as [Stat, number][]) state.s[k] = Math.min(state.s[k], max);
    state.flags.push(...(cond.flags ?? []));
  }
  if (!when.stage && state.flags.includes('licensed')) state.stage = 'pilot';
  if (state.stage !== 'student' && !state.flags.includes('licensed')) state.flags.push('licensed');
  return state;
}
function exercise(state: GameState, id: string) {
  const o = options(state).find(v => v.id === id);
  if (!o?.enabled) return equal(`fixture ${state.eventId ?? state.stage} ${id}`, o?.locks ?? 'not offered', 'enabled');
  inspect(state, o, true);
}
for (const a of ACTIONS) {
  const state = fixture(a.when, a);
  state.board.step = 'space';
  const menu = Object.entries(SPACE_MENU).find(([, ids]) => ids.includes(a.id));
  state.board.pos = BOARD.nodes.find(n => n.kind === menu?.[0])!.id;
  exercise(state, a.id);
  state.board.step = 'bonus';
  state.board.pos = BOARD_PLACES[state.stage].indexOf(a.place);
  exercise(state, a.id);
}
for (const e of EVENTS) {
  e.choices.forEach((choice, i) => {
    const state = fixture(e.when, choice);
    state.phase = 'event';
    state.eventId = e.id;
    exercise(state, 'ev:' + i);
  });
}
const pilot = fixture({ stage: ['pilot'], min: { drone: 1, cond: 70, debt: 200, acts: 1 } });
for (const o of options(pilot).filter(o => o.free)) inspect(pilot, o, true);
exercise(pilot, 'spin');
pilot.board.step = 'space';
pilot.board.pos = 3;
exercise(pilot, 'route:0');
exercise(pilot, 'route:1');
pilot.board.pos = 2;
exercise(pilot, 'skip');
exercise(pilot, 'job_event');

// Closing a capped debt, paying at timeout, and organization changes on a season end.
for (const state of [fixture({}), fixture({ stage: ['company'], min: { contracts: 4, staff: 2 } }),
  fixture({ stage: ['academy'], min: { students: 16, staff: 1 } })]) {
  if (state.stage === 'student') Object.assign(state.s, { debt: STAT_MAX.debt!, money: 0, stamina: 99 });
  state.board.step = 'bonus';
  state.turn = 119;
  exercise(state, 'end');
}

const sample = Object.fromEntries(stats.map((k, i) => [k, (i - 1) * 1234]));
equal('token round trip', parseTokens(stats.map(k => token(k, sample[k])).join(' · ')), sample);

const pairs = [...expected].flatMap(([key, ids]) => ids.map(id => key + ' ' + id));
const missed = pairs.filter(p => !covered.has(p));
if (missed.length) console.error('Unexercised branches:\n' + missed.join('\n'));
for (const failure of failures) console.error(failure);
console.log(`outcomes: ${expected.size} choices, ${pairs.length - missed.length}/${pairs.length} choice/branch pairs, ${cases} cases compared, ${mismatches} mismatches`);
if (mismatches || missed.length) process.exitCode = 1;
