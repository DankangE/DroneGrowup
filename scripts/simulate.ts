// Balance simulation: every bot policy x many seeds through the real engine.
// Fails (exit 1) on a softlock, an unreachable ending, or an ending share outside the allowed band.
//   npm run simulate            # 300 seeds per policy
//   SIM_RUNS=2000 npm run simulate
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import * as data from '../src/game/data.ts';
import { POLICIES, pick, botRandom } from '../src/game/bots.ts';
import { choose, newGame, options } from '../src/game/engine.ts';
import type { EndingId } from '../src/game/types.ts';

const runs = Number(process.env.SIM_RUNS ?? 300);
const MIN_SHARE = 2;
const MAX_SHARE = 30;
const MAX_STEPS = 20_000;
const MIN_PLANNER_FULL_RESTS = 1;
const MAX_PLANNER_FULL_REST_PCT = 35;
const MAX_SCORE = 100_000;
const MIN_ACTIONS_PER_SEASON = 1.0;
const MAX_ACTIONS_PER_SEASON = 4.0;
const ACTION_SECONDS = 6;
const REST_SECONDS = 3;
const EVENT_SECONDS = 8;
const FREE_SECONDS = 4;

if (process.env.SIM_TUNE) {
  const tuning = await import(pathToFileURL(resolve(process.env.SIM_TUNE)).href);
  await tuning.default(data);
}
const { ENDINGS, RULES } = data;
const names = Object.keys(POLICIES);
const table: Record<string, Record<string, number>> = {};
const scores: Record<string, number[]> = {};
const turns: Record<string, number[]> = {};
const problems: string[] = [];
const newCounts = () => ({ seasons: 0, actions: 0, full: 0, light: 0, auto: 0, events: 0, free: 0, decisions: 0 });
const activity: Record<string, ReturnType<typeof newCounts>> = {};
const distribution = [0, 0, 0, 0, 0, 0];
const minutes: number[] = [];
let highest = 0;
let total = 0;

for (const name of names) {
  table[name] = {};
  const counts = activity[name] = newCounts();
  for (let seed = 1; seed <= runs; seed++) {
    let state = newGame(seed * 7919 + names.indexOf(name));
    const rand = botRandom(seed);
    let steps = 0, seconds = 0;
    while (state.phase !== 'ended') {
      const open = options(state).filter((o) => o.enabled);
      if (!open.length || (state.phase === 'action' && !open.some((o) => !o.free))) { problems.push(`softlock: ${name} seed ${seed} turn ${state.turn}`); break; }
      if (++steps > MAX_STEPS) { problems.push(`no end: ${name} seed ${seed}`); break; }
      const id = pick(POLICIES[name], state, rand);
      const option = open.find(o => o.id === id);
      if (!option) { problems.push(`softlock: ${name} seed ${seed} picked disabled ${id}`); break; }
      const { state: next, result } = choose(state, id);
      counts.decisions++;
      if (option.kind === 'event') {
        counts.events++;
        seconds += EVENT_SECONDS;
      } else if (option.free) {
        counts.free++;
        seconds += FREE_SECONDS;
      } else if (id !== 'rest') {
        counts.actions++;
        seconds += ACTION_SECONDS;
      }
      if (result.season) {
        if (result.season.auto) counts.auto++;
        else if (state.s.acts === 0) counts.full++;
        else counts.light++;
        seconds += REST_SECONDS;
      }
      if (next.turn > state.turn) {
        counts.seasons++;
        distribution[Math.min(5, state.s.acts + Number(id !== 'rest'))]++;
      }
      state = next;
    }
    if (state.phase !== 'ended') continue;
    if (state.turn > RULES.maxTurns) problems.push(`over the turn limit: ${name} seed ${seed}`);
    if (!Number.isInteger(state.score) || state.score < 0) problems.push(`bad score ${state.score}: ${name} seed ${seed}`);
    minutes.push(seconds / 60);
    const id = state.ending as EndingId;
    table[name][id] = (table[name][id] ?? 0) + 1;
    (scores[id] ??= []).push(state.score);
    (turns[id] ??= []).push(state.turn);
    highest = Math.max(highest, state.score);
    total++;
  }
}

const pct = (n: number, of: number) => ((n * 100) / of).toFixed(1).padStart(5) + '%';
console.log(`\n파일럿 키우기 balance simulation: ${names.length} policies x ${runs} seeds = ${total} runs\n`);
console.log('ending'.padEnd(12) + 'share'.padStart(7) + 'runs'.padStart(7) + '  median score   max score  median age  title');
for (const e of ENDINGS) {
  const n = names.reduce((sum, p) => sum + (table[p][e.id] ?? 0), 0);
  const sc = (scores[e.id] ?? []).sort((a, b) => a - b);
  const tn = (turns[e.id] ?? []).sort((a, b) => a - b);
  const age = n ? RULES.startAge + Math.floor(tn[tn.length >> 1] / 4) : '—';
  console.log(e.id.padEnd(12) + pct(n, total).padStart(7) + String(n).padStart(7)
    + String(sc[sc.length >> 1] ?? '—').padStart(14) + String(sc.at(-1) ?? '—').padStart(12) + String(age).padStart(12) + '  ' + e.title);
  const share = (n * 100) / total;
  if (share < MIN_SHARE) problems.push(`ending ${e.id} is at ${share.toFixed(1)}% (< ${MIN_SHARE}%)`);
  if (share > MAX_SHARE) problems.push(`ending ${e.id} is at ${share.toFixed(1)}% (> ${MAX_SHARE}%)`);
}
console.log('\nper policy (% of that policy\'s runs)\n' + 'policy'.padEnd(11) + ENDINGS.map((e) => e.id.slice(0, 8).padStart(9)).join(''));
for (const p of names) console.log(p.padEnd(11) + ENDINGS.map((e) => (((table[p][e.id] ?? 0) * 100) / runs).toFixed(0).padStart(9)).join(''));
console.log('\npolicy       seasons actions   full  light   auto events   free  acts/season  full share  decisions/run');
for (const name of names) {
  const c = activity[name];
  const fullPct = c.full * 100 / c.seasons;
  console.log(name.padEnd(11) + [c.seasons, c.actions, c.full, c.light, c.auto, c.events, c.free].map(n => String(n).padStart(7)).join('')
    + (c.actions / c.seasons).toFixed(2).padStart(13) + pct(c.full, c.seasons).padStart(12) + (c.decisions / runs).toFixed(1).padStart(15));
  if (POLICIES[name].style === 'planner' && (c.full < MIN_PLANNER_FULL_RESTS || fullPct > MAX_PLANNER_FULL_REST_PCT)) {
    problems.push(`planner ${name} took ${c.full} full rests in ${c.seasons} seasons`);
  }
}

const seasonCount = distribution.reduce((sum, n) => sum + n, 0);
const meanActions = Object.values(activity).reduce((sum, c) => sum + c.actions, 0) / seasonCount;
minutes.sort((a, b) => a - b);
const mid = Math.floor(minutes.length / 2);
const medianMinutes = minutes.length % 2 ? minutes[mid] : (minutes[mid - 1] + minutes[mid]) / 2;
console.log('\nactions per season: ' + distribution.map((n, i) => `${i === 5 ? '5+' : i}: ${pct(n, seasonCount).trim()}`).join(' | '));
console.log(`mean actions per season: ${meanActions.toFixed(2)}`);
console.log(`estimated minutes per run: mean ${(minutes.reduce((sum, n) => sum + n, 0) / total).toFixed(2)}, median ${medianMinutes.toFixed(2)}`);
console.log(`highest score: ${highest}`);
if (highest > MAX_SCORE) problems.push(`highest score ${highest} exceeds ${MAX_SCORE}`);
if (meanActions < MIN_ACTIONS_PER_SEASON || meanActions > MAX_ACTIONS_PER_SEASON) problems.push(`overall mean actions per season: ${meanActions}`);

const limits = `no softlocks, all runs end within ${MAX_STEPS} steps and ${RULES.maxTurns} seasons, ending shares ${MIN_SHARE}..${MAX_SHARE}%, planners ≥${MIN_PLANNER_FULL_RESTS} full rest and ≤${MAX_PLANNER_FULL_REST_PCT}% full-rest seasons, score ≤${MAX_SCORE}, actions/season ${MIN_ACTIONS_PER_SEASON}..${MAX_ACTIONS_PER_SEASON}`;
if (problems.length) {
  console.error('\nFAILED\n' + [...new Set(problems)].join('\n'));
  process.exitCode = 1;
} else {
  console.log(`\nOK: ${limits}.`);
}
