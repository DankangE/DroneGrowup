// Strict JSON boundary, separated from play so neither v1 saves nor partial malformed states leak in.
import { RULES, STAT_LABEL as V1_STAT_LABEL } from './data.ts';
import { EVENTS } from './compat.ts';
import { CAREER_KEYS } from './career2.ts';
import { DIRECTOR_RULES } from './tracks.ts';
import { migrateCards, validCards } from './cards.ts';
import { DIAL_SETTINGS, ENDING_IDS, FUND_KINDS, HOLDING_LEVELS, INITIAL_STATE, KID_STAGES, LIFE_LEVELS, LIFE_RULES,
  LOG_TONES, MAP_IDS, PHASE_IDS, STAT_MAX, STATS, STATUS_IDS, STEP_IDS, TRACK_IDS } from './life-data.ts';
import { WORLD } from './world.ts';
import type { GameState } from './types.ts';

const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
  && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
const int = (value: unknown, min = 0, max = Number.MAX_SAFE_INTEGER): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= min && value <= max;
const oneOf = (value: unknown, values: readonly unknown[]) => values.includes(value);
const strings = (value: unknown): value is string[] => Array.isArray(value) && value.every(item => typeof item === 'string');
const integers = (value: unknown, min = 0) => record(value) && Object.values(value).every(item => int(item, min));
const nullableTurn = (value: unknown, turn: number) => value === null || int(value, 0, turn);

// Check every number, including unknown keys. Reject cycles, functions and non-JSON objects too.
function integerJSON(value: unknown, active = new Set<object>()): boolean {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isSafeInteger(value);
  if (!Array.isArray(value) && !record(value)) return false;
  if (active.has(value)) return false;
  active.add(value);
  const valid = Object.values(value).every(item => integerJSON(item, active));
  active.delete(value);
  return valid;
}

export function restore(raw: unknown): GameState | null {
  if (!record(raw) || !integerJSON(raw) || raw.v !== LIFE_RULES.version) return null;
  if (!int(raw.seed, 1, LIFE_RULES.uintMax) || !int(raw.rng, 0, LIFE_RULES.uintMax)
    || !int(raw.turn, 0, LIFE_RULES.maxTurns) || !int(raw.score, 0, RULES.score.max)
    || !oneOf(raw.status, STATUS_IDS) || !oneOf(raw.phase, PHASE_IDS)
    || !record(raw.s) || !record(raw.board) || !strings(raw.flags) || !Array.isArray(raw.log)) return null;
  // The original stats and board identity are required. New, unused v2 containers may be absent.
  if (Object.keys(V1_STAT_LABEL).some(stat => !int((raw.s as Record<string, unknown>)[stat]))) return null;
  if (!WORLD.some(node => node.id === (raw.board as Record<string, unknown>).pos)
    || !oneOf(raw.board.step, STEP_IDS)) return null;
  for (const key of ['job', 'family', 'fund'] as const) if (raw[key] !== undefined && !record(raw[key])) return null;
  const defaults = structuredClone(INITIAL_STATE);
  const state = Object.fromEntries(Object.keys(defaults).map(key =>
    [key, raw[key] === undefined ? defaults[key as keyof GameState] : raw[key]])) as GameState;
  state.s = { ...defaults.s, ...raw.s } as GameState['s'];
  state.board = { ...defaults.board, ...raw.board } as GameState['board'];
  state.job = { ...defaults.job, ...raw.job as object };
  state.family = { ...defaults.family, ...raw.family as object };
  state.fund = { ...defaults.fund, ...raw.fund as object };
  if (state.track !== null && !oneOf(state.track, TRACK_IDS)) return null;
  const age = LIFE_RULES.startAge + Math.floor(state.turn / LIFE_RULES.seasons.length);
  const cap = LIFE_RULES.staminaCaps.find(row => age >= row.minAge)!.cap;
  if (!Object.hasOwn(raw.s, 'capStamina')) state.s.capStamina = cap;
  for (const stat of STATS) if (!int(state.s[stat], 0, STAT_MAX[stat] ?? LIFE_RULES.statMax)) return null;
  if (state.s.homeIndex < LIFE_RULES.minHomeIndex || state.s.capStamina < LIFE_RULES.minCapStamina
    || state.s.capStamina > cap || state.s.stamina > state.s.capStamina) return null;

  const b = state.board;
  if (Object.hasOwn(raw.board, 'dial') && !DIAL_SETTINGS.some(row => row.id === b.dial)) return null;
  if (!Array.isArray(b.dice) || !oneOf(b.dice.length, LIFE_RULES.diceCounts)
    || !b.dice.every(die => int(die, 1, RULES.board.die))
    || (b.step === 'spin' ? b.dice.length !== 0 : b.dice.length === 0)
    || !integers(b.ledger, -LIFE_RULES.statMax * LIFE_RULES.maxTurns)
    || !record(b.lapAt) || !MAP_IDS.every(map => int(b.lapAt[map], -1, state.turn))
    || !int(b.visited, 1, LIFE_RULES.mapMask) || !int(b.laps, 0, LIFE_RULES.mapMask)
    || !int(b.contests) || !int(b.rankups)) return null;
  const job = state.job;
  if (!['rank', 'perf', 'tenure', 'total'].every(key => int(job[key as keyof typeof job]))
    || !int(job.warn, 0, 1) || !int(job.changedAt, -1, state.turn)
    || !Array.isArray(job.tracks) || !job.tracks.every(track => oneOf(track, TRACK_IDS))) return null;
  const homeShape = (home: unknown, price: 'deposit' | 'paid') => record(home)
    && oneOf(home.map, MAP_IDS) && int(home.tier) && int(home[price]);
  if (state.home !== null && !homeShape(state.home, 'deposit')) return null;
  if (!Array.isArray(state.estates) || state.estates.length > LIFE_RULES.maxHomes
    || !state.estates.every(estate => homeShape(estate, 'paid'))) return null;
  if (!Array.isArray(state.holdings) || state.holdings.length > LIFE_RULES.maxHoldings
    || !state.holdings.every(holding => record(holding) && typeof holding.id === 'string'
      && oneOf(holding.level, HOLDING_LEVELS) && int(holding.paid))) return null;
  const family = state.family;
  if (!nullableTurn(family.partnerAt, state.turn) || !nullableTurn(family.marriedAt, state.turn)
    || typeof family.dual !== 'boolean' || !Array.isArray(family.kids)
    || !family.kids.every(kid => record(kid) && int(kid.born, 0, state.turn) && int(kid.pts)
      && oneOf(kid.stage, KID_STAGES))) return null;
  if (!oneOf(state.fund.kind, FUND_KINDS) || !int(state.fund.amount) || !oneOf(state.life, LIFE_LEVELS)
    || !integers(state.timers) || !strings(state.feats) || !integers(state.seen)
    || !Object.values(state.seen).every(turn => turn <= state.turn)) return null;
  if (!state.log.every(entry => record(entry) && int(entry.turn, 0, state.turn)
    && typeof entry.text === 'string' && oneOf(entry.tone, LOG_TONES))) return null;
  if (state.phase === 'ended') {
    if (state.turn !== LIFE_RULES.maxTurns || !oneOf(state.ending, ENDING_IDS) || state.eventId !== null) return null;
  } else if (state.turn >= LIFE_RULES.maxTurns || state.ending !== null) return null;
  if (state.phase === 'event') {
    if (b.step !== 'space' || !EVENTS.some(event => event.id === state.eventId)) return null;
  } else if (state.eventId !== null) return null;
  // Earlier v2 saves did not record election dates. Start their term at the saved
  // season rather than guessing from job tenure, which annual reviews could reset.
  state.timers = { ...state.timers };
  if (state.status === 'working' && state.track === DIRECTOR_RULES.track
    && state.job.rank === DIRECTOR_RULES.chairRank && state.flags.includes('elected')) {
    state.timers[CAREER_KEYS.chairStarted] ??= state.turn;
  }
  const termStart = state.timers[CAREER_KEYS.chairStarted];
  if (termStart !== undefined && !int(termStart, 0, state.turn)) return null;
  if (!validCards(state)) return null;
  // Clone the validated shape: callers and future choose() calls own entirely separate graphs.
  return migrateCards(state);
}
