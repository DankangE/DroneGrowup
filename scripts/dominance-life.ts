// T11–T12: nominal expectations AND worst outcomes, including costs and persistent event effects.
// Like v1, distinct qualifications/popups/relocations are incomparable rather than assigned invented prices.
import { pathToFileURL } from 'node:url';
import { RULES } from '../src/life/data.ts';
import { ALL_EVENTS, LIFE_EVENTS, newGame, choose, options, forecast } from '../src/life/engine.ts';
import { materialize, EVENT_RULES } from '../src/life/events-a.ts';
import type { LifeChoice, LifeEffect } from '../src/life/events-a.ts';
import { CARDS, CARD_KEYS, grantCard } from '../src/life/cards.ts';
import { WORLD } from '../src/life/world.ts';
import { STATS, ASSET_KEYS, DIAL_SETTINGS } from '../src/life/life-data.ts';
import { ACTIONS } from '../src/life/compat.ts';
import { CREATOR_VIDEO, TRACK_PREP, TRACK_TRAIN, TRACK_WORK } from '../src/life/tracks.ts';
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
  if (effect.grantCard) tokens.push(`card:${effect.grantCard}`);
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
/** Held inventory, free slots and the seasonal use budget are real resources.
 * Dropping is a capacity tradeoff; using a card cannot be compared as a free stat gain. */
export function cardDominanceReport() {
  const dominated: string[] = [];
  for (const card of CARDS) {
    const state = grantCard(choose(newGame(1), 'start:self').state, card.id);
    state.s.drone = 1; state.s.cond = 50;
    const states = [state, choose(state, `card:use:${card.id}`).state, choose(state, `card:drop:${card.id}`).state];
    const points: Point[] = states.map(s => {
      const values: Record<string, number> = { ...s.s, hand: s.hand.length,
        slots: 3 - s.hand.length, useBudget: s.timers[CARD_KEYS.usedAt] === s.turn ? 0 : 1 };
      for (const key of Object.keys(values)) if (bad.has(key)) values[key] = -values[key];
      return { expected: values, worst: values,
        tokens: JSON.stringify({ flags: s.flags, step: s.board.step, again: s.timers[CARD_KEYS.again], popup: s.timers.asset_popup }) };
    });
    for (const [i, a] of points.entries()) for (const [j, b] of points.entries()) {
      if (i !== j && dominates(a, b)) dominated.push(`${card.id}:${['hold','use','drop'][i]}>${['hold','use','drop'][j]}`);
    }
  }
  return { cards: CARDS.length, dominated };
}
const dialActionIds = [...new Set([...ACTIONS, ...TRACK_WORK, ...TRACK_TRAIN, ...TRACK_PREP, CREATOR_VIDEO]
  .filter(action => action.flight && action.roll).map(action => `act:${action.id}`))];
/** An enabled notch counts only when it participates in an actual pair comparison. */
export function dialCoverageFailures(samples: number, pairs: number, compared: Readonly<Record<string, number>>): string[] {
  const failures: string[] = [];
  if (samples === 0) failures.push('no dial samples');
  if (pairs === 0) failures.push('no dial pairs');
  for (const id of dialActionIds) for (const row of DIAL_SETTINGS) {
    const key = `${id}@${row.id}`;
    if (!(compared[key] > 0)) failures.push(`${key}: never enabled and compared`);
  }
  return failures;
}
/** Compare actual integer wedges and forecast deltas, including cap/rounding cases.
 * Keep all stat axes: score-relevant gains must never disappear into a cash-only proxy. */
export function dialDominanceReport() {
  const dominated = new Set<string>(), groups: Record<string, number> = {}, compared: Record<string, number> = {};
  let pairs = 0, samples = 0;
  for (const track of ['pilot', 'employee', 'racer'] as const)
    for (const skill of [30, 150, 1000]) for (const cond of [20, 70]) for (const stamina of [20, 80])
      for (const dream of [false, true]) for (const step of ['space', 'bonus'] as const) {
    const state = choose(newGame(1), 'start:self').state;
    state.status = 'working'; state.track = track; state.flags.push('licensed');
    if (dream) state.flags.push(ASSET_KEYS.dream);
    Object.assign(state.s, { money: 100000, drone: 4, gear: 3, car: 2, skill, cond, stamina, rep: 150 });
    state.board.pos = WORLD.find(n => step === 'space' ? n.kind === 'job' : n.place === 'town')!.id;
    state.board.step = step; state.board.dice = [1, 1];
    for (const option of options(state)) {
      if (!option.dial) continue;
      samples++;
      const profiles = option.dial.settings.filter(row => row.enabled).map(row => {
        const preview = forecast(state, row.id), expected: Record<string, number> = {};
        for (const stat of STATS) expected[stat] = preview.branches.reduce((sum, branch) => sum
          + (branch.id === 'sure' ? 100 : row.ticks[branch.id]) * (branch.deltas[stat] ?? 0), 0)
          * (bad.has(stat) ? -1 : 1);
        expected.staminaCost = -row.tire; expected.crashRisk = -row.ticks.crash;
        return { row, expected };
      });
      for (const a of profiles) for (const b of profiles) {
        if (a === b) continue; pairs++;
        compared[a.row.id] = (compared[a.row.id] ?? 0) + 1;
        if (Object.keys(a.expected).every(key => a.expected[key] >= b.expected[key])) {
          const finding = `${option.id}@${a.row.notch}>${b.row.notch}: skill=${skill}, condition=${cond}, stamina=${stamina}, dream=${dream}, ${step}; chance=${a.row.chance}/${b.row.chance}, crash=${a.row.ticks.crash}/${b.row.ticks.crash}, tire=${a.row.tire}/${b.row.tire}`;
          if (!dominated.has(finding)) {
            const equalTicks = a.row.ticks.success === b.row.ticks.success && a.row.ticks.fail === b.row.ticks.fail
              && a.row.ticks.crash === b.row.ticks.crash;
            const cause = a.row.chance === 95 && b.row.chance === 95 && equalTicks
              ? 'odds clamped at 95 so ticks equal' : a.row.tire === 0 && b.row.tire === 0
                ? 'stamina clamp at 0' : 'other';
            const group = `${a.row.notch}>${b.row.notch}: ${cause}`;
            groups[group] = (groups[group] ?? 0) + 1;
            dominated.add(finding);
          }
        }
      }
    }
  }
  return { samples, pairs, dominated: [...dominated], groups, compared,
    coverageFailures: dialCoverageFailures(samples, pairs, compared) };
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
  const report = dominanceReport(), held = cardDominanceReport(), dial = dialDominanceReport();
  console.log(`life dominance: ${report.events} events, ${report.responses} responses, ${report.missing.length} missing free exits, ${report.dominated.length} unapproved dominated pairs, ${report.exceptions.length} explicit spec exception(s)`);
  for (const pair of [...report.dominated, ...report.exceptions]) console.log(`  ${report.exceptions.includes(pair) ? 'SPEC EXCEPTION' : 'DOMINATED'} ${pair}`);
  console.log(`held-card dominance: ${held.cards} cards, hold/use/drop with inventory and season budget, ${held.dominated.length} dominated pairs`);
  for (const pair of held.dominated) console.log(`  CARD DOMINATED ${pair}`);
  console.log(`dial dominance: ${dial.samples} samples, ${dial.pairs} ordered pairs, ${dial.dominated.length} dominated cases`);
  console.log(`dial dominance groups: ${JSON.stringify(dial.groups)}`);
  console.log(`dial coverage: ${Object.keys(dial.compared).length} action/notch combinations compared, ${dial.coverageFailures.length} failures`);
  for (const failure of dial.coverageFailures) console.log(`  DIAL COVERAGE ${failure}`);
  for (const pair of dial.dominated) console.log(`  DIAL DOMINATED ${pair}`);
  if (report.missing.length || report.dominated.length || held.dominated.length || dial.dominated.length || dial.coverageFailures.length) process.exitCode = 1;
}
