// T11–T12: nominal expectations AND worst outcomes, including costs and persistent event effects.
// Like v1, distinct qualifications/popups/relocations are incomparable rather than assigned invented prices.
import { pathToFileURL } from 'node:url';
import { RULES } from '../src/game/data.ts';
import { ALL_EVENTS, LIFE_EVENTS, newGame } from '../src/life/engine.ts';
import { materialize, EVENT_RULES } from '../src/life/events-a.ts';
import type { LifeChoice, LifeEffect } from '../src/life/events-a.ts';
import { STATS } from '../src/life/life-data.ts';
import type { GameState } from '../src/life/types.ts';

// §9.2 exceptions: headhunter opt-out; scam at low theory; audit counsel at high net worth.
// These compare expectation AND worst case, not just the lucky branch. Preserve published numbers.
export const SPEC_EXCEPTIONS = ['headhunter:1>2', 'invest_scam:0>1', 'tax_audit2:0>1'];
const bad = new Set(['debt', 'crashes', 'overdue', 'losses', 'rent', 'carWait', 'salaryWait', 'strike', 'shopWait', 'warn',
  'fundOut', 'wristWait', 'careWait']);
const clamp = (n: number) => Math.max(RULES.chanceMin, Math.min(RULES.chanceMax, n));
type Point = { expected: Record<string, number>; worst: Record<string, number>; tokens: string };
function vector(choice: LifeChoice, effect: LifeEffect) {
  const values: Record<string, number> = { ...effect.add };
  values.money = (values.money ?? 0) - (choice.cost ?? 0);
  values.stamina = (values.stamina ?? 0) - (choice.tire ?? 0);
  const tokens = Object.entries(effect.set ?? {}).map(([key, n]) => `set:${key}:${n}`);
  if (effect.flag) tokens.push(`flag:${effect.flag}`);
  if (effect.status) tokens.push(`status:${effect.status}`);
  if (effect.track) tokens.push(`track:${effect.track}`);
  for (const [key, value] of Object.entries(effect.extra ?? {})) {
    if (['popup', 'move', 'quit', 'perfSet', 'promote', 'demote', 'sellShop', 'franchise', 'kidWedding',
      'fundPopup', 'jobPopup', 'skipSeasons', 'villa', 'sellOrganization'].includes(key)) {
      tokens.push(`${key}:${value}`);
    } else if (key === 'dog') {
      values.dogExpense = -EVENT_RULES.dogCost; values.dogHappy = EVENT_RULES.dogHappy;
    } else values[key] = Number(value);
  }
  for (const key of Object.keys(values)) if (bad.has(key)) values[key] = -values[key];
  return { values, tokens };
}
function profile(choice: LifeChoice, chance: number): Point {
  const branches = choice.roll ? [[chance, choice.roll.success], [100 - chance, choice.roll.fail]] as const
    : [[100, choice.effect!]] as const;
  const outcomes = branches.map(([probability, effect]) => ({ probability, ...vector(choice, effect) }));
  const keys = [...new Set([...STATS, ...outcomes.flatMap(row => Object.keys(row.values))])];
  const expected: Record<string, number> = {}, worst: Record<string, number> = {}, tokens: Record<string, number> = {};
  for (const key of keys) {
    expected[key] = outcomes.reduce((sum, row) => sum + row.probability * (row.values[key] ?? 0), 0);
    worst[key] = Math.min(...outcomes.map(row => row.values[key] ?? 0));
  }
  for (const row of outcomes) for (const token of row.tokens) tokens[token] = (tokens[token] ?? 0) + row.probability;
  return { expected, worst, tokens: JSON.stringify(Object.entries(tokens).sort()) };
}
export function dominates(a: Point, b: Point): boolean {
  if (a.tokens !== b.tokens) return false;
  const keys = [...new Set([...Object.keys(a.expected), ...Object.keys(b.expected)])];
  return keys.every(k => (a.expected[k] ?? 0) >= (b.expected[k] ?? 0) && (a.worst[k] ?? 0) >= (b.worst[k] ?? 0))
    && keys.some(k => (a.expected[k] ?? 0) > (b.expected[k] ?? 0) || (a.worst[k] ?? 0) > (b.worst[k] ?? 0));
}
export function checkChoices(id: string, choices: LifeChoice[], legacy = false): string[] {
  const findings = new Set<string>();
  for (const offset of [0, 1, 2]) {
    const views = choices.map(choice => {
      const roll = choice.roll;
      const base = roll?.base ?? 100;
      const bonus = offset === 0 ? (legacy ? -RULES.stamina.exhaustedPenalty : 0)
        : offset === 2 ? (roll?.mods ?? []).reduce((sum, mod) => sum + mod.cap, 0) + (legacy ? RULES.stamina.freshBonus : 0) : 0;
      return profile(choice, roll ? clamp(base + bonus) : 100);
    });
    for (const [i, a] of views.entries()) for (const [j, b] of views.entries()) {
      if (i !== j && dominates(a, b)) findings.add(`${id}:${i}>${j}`);
    }
  }
  return [...findings];
}
export function dominanceReport() {
  const findings = new Set<string>(), missing: string[] = [];
  let responses = 0;
  for (const event of ALL_EVENTS) {
    const modern = LIFE_EVENTS.find(row => row.id === event.id);
    const samples: GameState[] = [0, 50, 100].map(perf => {
      const s = newGame(1); s.status = 'working'; s.track = 'clerk';
      s.turn = 84; s.job.rank = 1; s.job.perf = perf;
      s.s.car = 2; s.s.gear = perf === 100 ? 3 : 1; s.s.capStamina = 100;
      s.s.money = 40000; s.s.value = 20000; s.s.level = 2; s.s.stamina = perf;
      s.s.theory = perf === 100 ? 320 : 0; s.fund = { kind: 1, amount: 1001 };
      s.holdings = [{ id: 'farm', level: 1, paid: 2500 }];
      return s;
    });
    for (const [index, state] of samples.entries()) {
      const choices = modern ? materialize(modern, state).choices : event.choices as LifeChoice[];
      if (!index) responses += choices.length;
      if (!choices.some(choice => !choice.cost && !choice.tire && !choice.need)) missing.push(event.id);
      checkChoices(event.id, choices, !modern).forEach(pair => findings.add(pair));
    }
  }
  return { events: ALL_EVENTS.length, responses, missing: [...new Set(missing)],
    exceptions: [...findings].filter(pair => SPEC_EXCEPTIONS.includes(pair)),
    dominated: [...findings].filter(pair => !SPEC_EXCEPTIONS.includes(pair)) };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const report = dominanceReport();
  console.log(`life dominance: ${report.events} events, ${report.responses} responses, ${report.missing.length} missing free exits, ${report.dominated.length} unapproved dominated pairs, ${report.exceptions.length} explicit spec exception(s)`);
  for (const pair of [...report.dominated, ...report.exceptions]) console.log(`  ${report.exceptions.includes(pair) ? 'SPEC EXCEPTION' : 'DOMINATED'} ${pair}`);
  if (report.missing.length || report.dominated.length) process.exitCode = 1;
}
