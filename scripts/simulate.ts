// Play real choices. Time in seconds (SECONDS), measured with `npm run check:board -- timed`: a spin with its walk,
// a fork pick, a landed-space and a bonus decision, an event answer, an explicit end and a free service each cost
// one prompt; a result sheet (roll, crash, flag or stage change) costs a read. Settlements are notices: no wait.
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import * as data from '../src/game/data.ts';
import { POLICIES, pick, botRandom } from '../src/game/bots.ts';
import { choose, finalRank, netWorth, newGame, options } from '../src/game/engine.ts';
import type { SpaceKind, Stage } from '../src/game/types.ts';
import { MAX_ROUTE_GAP, forkBalance } from './fork-balance.ts';

if (process.env.SIM_TUNE) {
  const tuning = await import(pathToFileURL(resolve(process.env.SIM_TUNE)).href);
  await tuning.default(data);
}
const { BOARD, ENDINGS, RULES } = data;
const runs = Number(process.env.SIM_RUNS ?? 300);
const names = Object.keys(POLICIES);
const problems = new Set<string>();
const ages = [25, 30, 35, 40, 45, 50];
const wealth = ages.map((): number[] => []);
const plannerWealth = ages.map((): number[] => []);
const finances = new Map<string, { cash: number[]; debt: number[] }>();
const landings = new Map<SpaceKind, number>();
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
function median(xs: number[]) {
  const sorted = [...xs].sort((a, b) => a - b);
  return (sorted[Math.floor((xs.length - 1) / 2)] + sorted[Math.floor(xs.length / 2)]) / 2;
}
const pct = (n: number, total: number) => (100 * n / total).toFixed(1) + '%';
const row = (...values: (string | number)[]) => console.log(values.join('\t'));
const counts = () => ({
  seasons: 0, spins: 0, space: 0, offeredSpace: 0, offeredBonus: 0, playableBonus: 0,
  bonus: 0, events: 0, pays: 0, routes: [[0, 0], [0, 0]],
});
const activity = names.map(counts);
const all = counts();
const SECONDS = { spin: 2.5, fork: 2.5, space: 4, event: 6, bonus: 3.5, end: 1, free: 3, sheet: 2.4 };
const maxima = { turns: 0, rollsOver: -Infinity, flightsOver: -Infinity, acts: 0, score: 0, scoreOver: -Infinity };

function run(name: string, seed: number, forced?: number) {
  const policy = POLICIES[name];
  const index = names.indexOf(name);
  let state = newGame(seed * 7919 + index);
  const rand = botRandom(seed);
  const c = forced === undefined ? activity[index] : counts();
  let seconds = 0, space = 0, bonus = 0, spins = 0, steps = 0;
  let sawBonus = false;
  while (state.phase !== 'ended') {
    if (++steps > 20000) throw new Error(`no end: ${name} seed ${seed}`);
    const opts = options(state);
    if (!opts.some(o => o.enabled && !o.free)) throw new Error(`softlock: ${name} seed ${seed}`);
    const id = forced !== undefined && opts[0].id.startsWith('route:') ? 'route:' + forced : pick(policy, state, rand);
    const o = opts.find(option => option.id === id && option.enabled);
    if (!o) throw new Error(`unplayable: ${name} seed ${seed} picked ${id}`);
    const { state: next, result } = choose(state, id);
    const step = state.board.step;
    if (!o.free && (state.phase === 'event' || (step === 'space' && !id.startsWith('route:')))) c.offeredSpace++;
    // A money-locked menu can open before a loan makes its first action playable.
    if (!sawBonus && state.phase === 'action' && step === 'bonus') {
      sawBonus = true;
      c.offeredBonus++;
      if (opts.some(o => o.enabled && (o.kind === 'action' || o.kind === 'job'))) c.playableBonus++;
    }
    if (o.free) seconds += SECONDS.free;
    else if (id === 'spin') { spins++; c.spins++; seconds += SECONDS.spin; }
    else if (state.phase === 'event') { space++; c.space++; c.events++; seconds += SECONDS.event; }
    else if (id.startsWith('route:')) {
      c.routes[BOARD.forks.findIndex(f => f.at === state.board.pos)][Number(id.slice(6))]++;
      seconds += step === 'fork' ? SECONDS.fork : SECONDS.space;
    } else if (step === 'space') {
      if (id !== 'skip') { space++; c.space++; }
      seconds += SECONDS.space;
    } else if (id === 'end') seconds += SECONDS.end;
    else { bonus++; c.bonus++; seconds += SECONDS.bonus; }
    if (!o.free && o.kind !== 'board' && (result.roll || result.crashed || result.flag || result.stageTo !== result.stageFrom)) seconds += SECONDS.sheet;
    if (result.move) {
      if (forced === undefined && result.move.stop !== 'fork') {
        const kind = BOARD.nodes[result.move.landed].kind;
        landings.set(kind, (landings.get(kind) ?? 0) + 1);
      }
    }
    if (result.upkeep) {
      const paySpaces = result.move?.path.filter(at => BOARD.nodes[at].kind === 'pay').length ?? 0;
      // A final cash-out also settles the ledger. A final spin can both cross payday and close a season.
      const settlements = paySpaces + Number(!!result.ended && (!!result.season || paySpaces === 0));
      c.pays += settlements;
    }
    maxima.acts = Math.max(maxima.acts, space + bonus, next.s.acts);
    if (space > 1 || bonus > 1 || spins > 1) throw new Error(`season limit: ${name} seed ${seed} turn ${state.turn}`);
    if (next.turn !== state.turn) {
      if (spins !== 1 || next.turn !== state.turn + 1) throw new Error('expected one spin per season');
      c.seasons++;
      space = bonus = spins = 0;
      sawBonus = false;
      const ageIndex = ages.findIndex(age => next.turn === (age - RULES.startAge) * RULES.seasons.length);
      if (ageIndex >= 0 && forced === undefined) {
        wealth[ageIndex].push(netWorth(next));
        if (policy.style === 'planner') plannerWealth[ageIndex].push(netWorth(next));
        if (ageIndex < 2) {
          const key = ages[ageIndex] + '/' + next.stage;
          const sample = finances.get(key) ?? { cash: [], debt: [] };
          sample.cash.push(next.s.money);
          sample.debt.push(next.s.debt);
          finances.set(key, sample);
        }
      }
    }
    state = next;
  }
  const rank = finalRank(state);
  maxima.turns = Math.max(maxima.turns, state.turn);
  maxima.rollsOver = Math.max(maxima.rollsOver, state.s.wins + state.s.losses - (8 * state.turn + 10));
  maxima.flightsOver = Math.max(maxima.flightsOver, state.s.flights - 5 * state.turn);
  maxima.score = Math.max(maxima.score, state.score);
  maxima.scoreOver = Math.max(maxima.scoreOver, state.score - (Math.max(0, rank.netWorth) + 10000 + (120 - state.turn) * 50));
  if (!Number.isInteger(state.score) || state.score !== rank.total) throw new Error('invalid final score');
  return { name, ending: state.ending!, score: state.score, turn: state.turn, minutes: seconds / 60,
    ...rank.achievements, credited: state.ending === 'debtor' ? 0 : rank.bonus - rank.endingBonus };
}

const results = names.flatMap(name => Array.from({ length: runs }, (_, i) => run(name, i + 1)));
console.log(`\n${results.length} runs (${names.length} policies × ${runs} seeds)\n`);
row('ending', 'share', 'runs', 'median score', 'max score', 'median age');
for (const { id } of ENDINGS) {
  const group = results.filter(r => r.ending === id);
  const share = group.length / results.length;
  row(id, pct(group.length, results.length), group.length, group.length ? median(group.map(r => r.score)) : '—',
    group.length ? Math.max(...group.map(r => r.score)) : '—', group.length ? median(group.map(r => 20 + Math.floor(r.turn / 4))) : '—');
  if (share < 0.02 || share > 0.30) problems.add(`ending share ${id} ${pct(group.length, results.length)} (range 2..30%)`);
}
row('\npolicy (%)', ...ENDINGS.map(e => e.id), 'goal share');
for (const name of names) {
  const shares = ENDINGS.map(e => results.filter(r => r.name === name && r.ending === e.id).length);
  row(name, ...shares.map(n => (100 * n / runs).toFixed(1)), POLICIES[name].style === 'planner'
    ? pct(shares[ENDINGS.findIndex(e => e.id === name)], runs) : '—');
}

row('\npolicy', 'spins/s', 'acts/s', 'bonus/s', 'events/s', 'pay/s', 'fork 1 A/B %', 'fork 2 A/B %', 'mean seasons', 'mean minutes');
for (const [i, c] of activity.entries()) {
  for (const key of ['spins','seasons','space','offeredSpace','offeredBonus','playableBonus','bonus','events','pays'] as const) all[key] += c[key];
  for (const [j, pair] of c.routes.entries()) pair.forEach((n, k) => all.routes[j][k] += n);
  // Full rest is gone. Gate each planner on the fraction of seasons in which it takes a bonus action.
  if (POLICIES[names[i]].style === 'planner' && (c.bonus / c.seasons < 0.30 || c.bonus / c.seasons > 0.95)) {
    problems.add(`planner bonus share ${names[i]} ${pct(c.bonus, c.seasons)} (range 30..95%)`);
  }
}
for (const [i, c] of [...activity, all].entries()) {
  const group = names[i] ? results.filter(r => r.name === names[i]) : results;
  row(names[i] ?? 'overall', ...[c.spins, c.space + c.bonus, c.bonus, c.events, c.pays].map(n => (n / c.seasons).toFixed(3)),
    ...c.routes.map(pair => pair.map(n => pct(n, pair[0] + pair[1])).join('/')),
    mean(group.map(r => r.turn)).toFixed(1), mean(group.map(r => r.minutes)).toFixed(2));
}
const actions = (all.space + all.bonus) / all.seasons;
if (actions < 1 || actions > 2) problems.add(`mean actions/season ${actions.toFixed(3)} (range 1..2)`);
const minutes = results.map(r => r.minutes);
if (mean(minutes) < 18 || mean(minutes) > 27) problems.add('mean minutes outside 18..27');
row('\nminutes/run (mean, median)', mean(minutes).toFixed(2), median(minutes).toFixed(2));
row('age', 'runs reaching age', 'mean net worth', 'median net worth', 'planner runs', 'planner median');
ages.forEach((age, i) => row(age, wealth[i].length, mean(wealth[i]).toFixed(1), median(wealth[i]), plannerWealth[i].length, median(plannerWealth[i])));
row('\nage', 'stage', 'runs', 'median cash', 'median debt');
for (const age of ages.slice(0, 2)) for (const stage of Object.keys(data.STAGES) as Stage[]) {
  const sample = finances.get(age + '/' + stage);
  row(age, stage, sample?.cash.length ?? 0, sample ? median(sample.cash) : '—', sample ? median(sample.debt) : '—');
}
row('\nlanding', 'count', 'share');
for (const [kind, count] of [...landings].sort()) row(kind, count, pct(count, all.spins));
row('\nspace taken/offered', 'bonus offered/spin', 'bonus playable on arrival/spin', 'bonus taken/spin', 'bonus taken/offered');
row(pct(all.space, all.offeredSpace), pct(all.offeredBonus, all.spins), pct(all.playableBonus, all.spins),
  pct(all.bonus, all.spins), pct(all.bonus, all.offeredBonus));
row('\nmean forks', 'mean routes', 'mean contests', 'mean rankups', 'mean achievement points', 'credited share of score');
row(...(['forks','routes','contests','rankups','points'] as const).map(k => mean(results.map(r => r[k])).toFixed(2)),
  pct(mean(results.map(r => r.credited)), mean(results.map(r => r.score))));

const forcedRuns = Number(process.env.SIM_FORCED_RUNS ?? 300);
row(`\nforced route (${forcedRuns} seeds per route)`, 'A mean score', 'A goal share', 'B mean score', 'B goal share', 'better', 'gap');
const routeScores: { a: number; b: number }[] = [];
for (const name of names.filter(n => POLICIES[n].style === 'planner')) {
  const [a,b] = [0,1].map(route => {
    const group = Array.from({ length: forcedRuns }, (_, i) => run(name, i + 1, route));
    return { score: mean(group.map(r => r.score)), goals: group.filter(r => r.ending === name).length };
  });
  row(name, a.score.toFixed(1), pct(a.goals, forcedRuns), b.score.toFixed(1), pct(b.goals, forcedRuns),
    a.score > b.score ? 'A' : 'B', pct(Math.max(a.score, b.score) - Math.min(a.score, b.score), Math.min(a.score, b.score)));
  routeScores.push({ a: a.score, b: b.score });
}
const balance = forkBalance(routeScores);
row('planners with higher mean score', balance.aWins, '—', balance.bWins, '—', 'worst gap', pct(balance.worstGap, 1));
if (!balance.passed) problems.add(`each route needs a higher mean score for at least two planners, and no planner may gain more than ${pct(MAX_ROUTE_GAP, 1)} from one route (worst ${pct(balance.worstGap, 1)})`);
row('\nAPI maxima (including forced runs)', ...Object.keys(maxima));
row('observed', ...Object.values(maxima));
row('limit', 120, 0, 0, 2, 340000, 0);
if (maxima.turns > 120 || maxima.rollsOver > 0 || maxima.flightsOver > 0 || maxima.acts > 2 ||
    maxima.score > 340000 || maxima.scoreOver > 0) problems.add('API limit exceeded');
if (maxima.score > 100000) problems.add(`highest score ${maxima.score} exceeds 100000`);
if (problems.size) {
  console.error('\nFAILED\n' + [...problems].join('\n'));
  process.exitCode = 1;
} else console.log('\nAll gates passed.');
