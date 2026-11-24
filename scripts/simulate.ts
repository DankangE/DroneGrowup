// Balance simulation: every bot policy x many seeds through the real engine.
// Fails (exit 1) on a softlock, an unreachable ending, or an ending share outside the allowed band.
//   npm run simulate            # 300 seeds per policy
//   SIM_RUNS=2000 npm run simulate
//   SIM_VERBOSE=1 npm run simulate   # adds the per-policy breakdown
import { ENDINGS, RULES } from '../src/game/data.ts';
import { POLICIES, pick, botRandom } from '../src/game/bots.ts';
import { choose, newGame, options } from '../src/game/engine.ts';
import type { EndingId } from '../src/game/types.ts';

const runs = Number(process.env.SIM_RUNS ?? 300);
const MIN_SHARE = 2;
const MAX_SHARE = 30;
const names = Object.keys(POLICIES);
const table: Record<string, Record<string, number>> = {};
const scores: Record<string, number[]> = {};
const turns: Record<string, number[]> = {};
const problems: string[] = [];
let total = 0;

for (const name of names) {
  table[name] = {};
  for (let seed = 1; seed <= runs; seed++) {
    let state = newGame(seed * 7919 + names.indexOf(name));
    const rand = botRandom(seed);
    let steps = 0;
    while (state.phase !== 'ended') {
      const open = options(state).filter((o) => o.enabled);
      if (!open.length || (state.phase === 'action' && !open.some((o) => !o.free))) { problems.push(`softlock: ${name} seed ${seed} turn ${state.turn}`); break; }
      if (++steps > 3000) { problems.push(`no end: ${name} seed ${seed}`); break; }
      state = choose(state, pick(POLICIES[name], state, rand)).state;
    }
    if (state.phase !== 'ended') continue;
    if (state.turn > RULES.maxTurns) problems.push(`over the turn limit: ${name} seed ${seed}`);
    if (!Number.isInteger(state.score) || state.score < 0) problems.push(`bad score ${state.score}: ${name} seed ${seed}`);
    const id = state.ending as EndingId;
    table[name][id] = (table[name][id] ?? 0) + 1;
    (scores[id] ??= []).push(state.score);
    (turns[id] ??= []).push(state.turn);
    total++;
  }
}

const pct = (n: number, of: number) => ((n * 100) / of).toFixed(1).padStart(5) + '%';
console.log(`\n파일럿 키우기 balance simulation: ${names.length} policies x ${runs} seeds = ${total} runs\n`);
console.log('ending'.padEnd(12) + 'share'.padStart(7) + 'runs'.padStart(7) + '  median score   max score  median age  title');
for (const e of ENDINGS) {
  const n = names.reduce((sum, p) => sum + (table[p][e.id] ?? 0), 0);
  const sc = (scores[e.id] ?? [0]).sort((a, b) => a - b);
  const tn = (turns[e.id] ?? [0]).sort((a, b) => a - b);
  console.log(e.id.padEnd(12) + pct(n, total).padStart(7) + String(n).padStart(7) + String(sc[sc.length >> 1]).padStart(14) + String(sc[sc.length - 1]).padStart(12) + String(RULES.startAge + Math.floor(tn[tn.length >> 1] / 4)).padStart(12) + '  ' + e.title);
  const share = (n * 100) / total;
  if (share < MIN_SHARE) problems.push(`ending ${e.id} is at ${share.toFixed(1)}% (< ${MIN_SHARE}%)`);
  if (share > MAX_SHARE) problems.push(`ending ${e.id} is at ${share.toFixed(1)}% (> ${MAX_SHARE}%)`);
}
if (process.env.SIM_VERBOSE === '1') {
  console.log('\nper policy (% of that policy\'s runs)\n' + 'policy'.padEnd(11) + ENDINGS.map((e) => e.id.slice(0, 8).padStart(9)).join(''));
  for (const p of names) console.log(p.padEnd(11) + ENDINGS.map((e) => (((table[p][e.id] ?? 0) * 100) / runs).toFixed(0).padStart(9)).join(''));
}
if (problems.length) {
  console.error('\nFAILED\n' + [...new Set(problems)].slice(0, 20).join('\n'));
  process.exit(1);
}
console.log(`\nOK: no softlocks, every run ended within ${RULES.maxTurns} turns, every ending between ${MIN_SHARE}% and ${MAX_SHARE}%.`);
