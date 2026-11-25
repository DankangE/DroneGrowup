// T03: one spin, one tile choice and at most one extra action per season.
// Public operations are pure; mutation below is confined to their private working copies.
import { FLAG_LABEL, RULES } from '../game/data.ts';
import type { BranchId, Derived as V1Derived, Forecast as V1Forecast,
  OptionKind, OptionView as V1OptionView, OutcomeView as V1OutcomeView,
  Result as V1Result } from '../game/types.ts';
import { CONTEST_EVENTS } from '../game/data.ts';
import { ACTIONS, EVENTS } from './compat.ts';
import { CAREER_TEXT } from './career2.ts';
import { accrue, applyEconomyChoice, checkCredit, economyChoices, economyView, ECONOMY_TEXT,
  flightPay, ledgerSum, passStart, settle as settleLedger } from './economy.ts';
import { advanceCareer, advanceStudies, afterStartPass, applyJobChoice, canPromote, isJobChoice,
  jobChoices, performance, review, startingAction } from './jobs.ts';
import { JOB_RULES, TRACK_PREP, TRACK_TRAIN, TRACK_WORK } from './tracks.ts';
import { BOARD_CHOICES, CAREER_ACTIONS, INITIAL_STATE, LIFE_RULES, SETTLEMENT_KINDS,
  SPACE_MENU, STAT_LABEL, STAT_MAX, STATS, TEXT } from './life-data.ts';
import { applyMove, randInt, reachable as reachableMoves, rollDice } from './move.ts';
import type { Move } from './move.ts';
import { PLACES, WORLD } from './world.ts';
import type { Choice, Cond, Effect, EndingId, GameState, PlaceId, Stat, StatMap, Status, TrackId } from './types.ts';
export { restore } from './restore.ts';
export { jobOffers } from './jobs.ts';

// Retain the v1 view contracts while widening their vocabulary to v2 places and stats.
type OutcomeView = Omit<V1OutcomeView, 'add' | 'stage' | 'end'> & {
  add: StatMap; status?: Status; track?: TrackId | null;
};
export type OptionView = Omit<V1OptionView, 'place' | 'missing' | 'roll' | 'sure'> & {
  place: PlaceId; missing: { stat: Stat; need: number }[];
  roll?: { chance: number; staminaPct: number; success: OutcomeView; fail: OutcomeView; crashPct?: number };
  sure?: OutcomeView;
};
export type Result = Omit<V1Result, 'place' | 'move' | 'deltas' | 'settle' | 'stageFrom' | 'stageTo' | 'ended'> & {
  place: PlaceId; move?: Move; deltas: StatMap; settle?: { deltas: StatMap };
  review?: ReturnType<typeof review>;
  statusFrom: Status; statusTo: Status; trackFrom: TrackId | null; trackTo: TrackId | null; ended?: EndingId;
};
export type Forecast = Omit<V1Forecast, 'branches'> & {
  branches: (Omit<V1Forecast['branches'][number], 'deltas' | 'stage' | 'end'> & {
    deltas: StatMap; status?: Status; track?: TrackId | null; end?: EndingId;
  })[];
};
export type Derived = V1Derived & { period: string; remainingSeasons: number; capStamina: number };

const BY_ID = new Map(WORLD.map(node => [node.id, node]));
const nodeAt = (state: GameState) => BY_ID.get(state.board.pos)!;
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const entries = (map?: StatMap) => Object.entries(map ?? {}) as [Stat, number][];
const ageAt = (turn: number) => LIFE_RULES.startAge + Math.floor(turn / LIFE_RULES.seasons.length);
const seasonAt = (turn: number) => turn % LIFE_RULES.seasons.length;
const ageCap = (turn: number) => LIFE_RULES.staminaCaps.find(row => ageAt(turn) >= row.minAge)!.cap;
const dateLabel = (turn: number) => TEXT.date(ageAt(turn), LIFE_RULES.seasons[seasonAt(turn)]);

/** Engine previews and actual travel use the same career stop predicate. */
export const reachable = (state: GameState): Move[] => reachableMoves(state, { canPromote });

export function newGame(seed: number): GameState {
  const state = structuredClone(INITIAL_STATE);
  state.seed = state.rng = (Math.floor(Number(seed)) >>> 0) || LIFE_RULES.defaultSeed;
  state.s.money = JOB_RULES.startMoney;
  return state;
}

export function derived(state: GameState): Derived {
  const age = ageAt(state.turn);
  const period = LIFE_RULES.periods.find(row => age <= row.maxAge) ?? LIFE_RULES.periods.at(-1)!;
  return { ...economyView(state), age, season: seasonAt(state.turn),
    seasonName: LIFE_RULES.seasons[seasonAt(state.turn)], dateLabel: dateLabel(state.turn), period: period.name,
    remainingSeasons: Math.max(0, LIFE_RULES.maxTurns - state.turn),
    capStamina: Math.min(ageCap(state.turn), state.s.capStamina) };
}

/** Empty extension points. Called with the new turn, including the terminal 70-year-old spring. */
export const yearEnd = (state: GameState): GameState => state;
export const lifeEvent = (state: GameState): GameState => state;
export const HOOKS = { yearEnd, lifeEvent };

function setStat(state: GameState, stat: Stat, value: number) {
  const max = stat === 'stamina' ? Math.min(ageCap(state.turn), state.s.capStamina)
    : STAT_MAX[stat] ?? LIFE_RULES.statMax;
  state.s[stat] = clamp(Math.trunc(value), stat === 'money' ? -LIFE_RULES.statMax : 0, max);
}

function settle(state: GameState) {
  if (state.s.money >= 0) return;
  setStat(state, 'debt', state.s.debt - state.s.money);
  state.s.money = 0;
}

function unmet(state: GameState, cond?: Cond): Pick<OptionView, 'locks' | 'missing'> {
  const locks: string[] = [], missing: OptionView['missing'] = [];
  if (!cond) return { locks, missing };
  if (cond.status && !cond.status.includes(state.status)) locks.push(TEXT.statusLock);
  if (cond.track && (!state.track || !cond.track.includes(state.track))) locks.push(TEXT.trackLock);
  for (const [stat, need] of entries(cond.min)) if (state.s[stat] < need) {
    locks.push(TEXT.minLock(STAT_LABEL[stat], need, state.s[stat])); missing.push({ stat, need });
  }
  for (const [stat, most] of entries(cond.max)) if (state.s[stat] > most) locks.push(TEXT.maxLock(STAT_LABEL[stat], most));
  for (const flag of cond.flags ?? []) if (!state.flags.includes(flag)) locks.push(TEXT.flagLock(FLAG_LABEL[flag] ?? flag));
  for (const flag of cond.notFlags ?? []) if (state.flags.includes(flag)) locks.push(TEXT.notFlagLock(FLAG_LABEL[flag] ?? flag));
  if (cond.any && !cond.any.some(branch => met(state, branch))) locks.push(TEXT.anyLock);
  return { locks, missing };
}
export const met = (state: GameState, cond?: Cond): boolean => unmet(state, cond).locks.length === 0;
export const currentEvent = (state: GameState) => EVENTS.find(event => event.id === state.eventId) ?? null;

function staminaBonus(state: GameState): number {
  const { stamina } = state.s, r = RULES.stamina;
  if (stamina >= r.fresh) return r.freshBonus;
  if (stamina < r.exhausted) return -r.exhaustedPenalty;
  return stamina < r.tired ? -r.tiredPenalty : 0;
}

function flightOdds(state: GameState, choice: Choice) {
  const f = RULES.flight, s = state.s;
  const spare = Math.max(0, s.drone - (choice.need?.min?.drone ?? 1));
  const penalty = s.cond < f.badCond ? f.badCondPenalty : s.cond < f.lowCond ? f.lowCondPenalty : 0;
  const crash = f.crashPct + (s.cond < f.lowCond ? f.crashLowCondPct : 0)
    - Math.min(f.skillCrashCap, Math.floor(s.skill / f.skillPer))
    + (s.stamina < RULES.stamina.exhausted ? RULES.stamina.exhaustedCrashPct : 0);
  return { bonus: Math.min(f.spareLevelCap, spare * f.spareLevelPct) - penalty,
    crashPct: clamp(crash, 0, LIFE_RULES.percent) };
}

function outcome(state: GameState, effect: Effect, flight = false): OutcomeView {
  const add = { ...effect.add };
  if (flight && add.money && add.money > 0) add.money = flightPay(state, add.money);
  return { text: effect.text, add,
    ...(effect.status && effect.status !== state.status && { status: effect.status }),
    ...(effect.track !== undefined && effect.track !== state.track && { track: effect.track }) };
}

type Resolved = { kind: OptionKind; place: PlaceId; choice: Choice; flight: boolean; free?: boolean; jobLocks?: string[] };
function view(state: GameState, id: string, r: Resolved): OptionView {
  const { choice, kind, place, flight } = r;
  const { locks, missing } = unmet(state, choice.need);
  locks.push(...(r.jobLocks ?? []));
  const cost = choice.cost ?? 0, tire = choice.tire ?? 0;
  if (state.s.money < cost) {
    if (!locks.includes(TEXT.moneyLock(cost))) locks.push(TEXT.moneyLock(cost));
    missing.push({ stat: 'money', need: cost });
  }
  if (state.s.stamina < tire) { locks.push(TEXT.tireLock(tire, state.s.stamina)); missing.push({ stat: 'stamina', need: tire }); }
  const option: OptionView = { id, kind, place, title: choice.title, desc: choice.desc, free: r.free ?? false,
    cost, tire, enabled: !locks.length, locks, missing };
  if (choice.roll) {
    const staminaPct = r.jobLocks ? 0 : staminaBonus(state);
    let chance = choice.roll.base + staminaPct;
    for (const mod of choice.roll.mods ?? []) {
      chance += clamp(Math.floor((state.s[mod.stat] - mod.over) / mod.per) * mod.pct, 0, mod.cap);
    }
    if (flight) chance += flightOdds(state, choice).bonus;
    option.roll = { chance: clamp(chance, RULES.chanceMin, RULES.chanceMax), staminaPct,
      success: outcome(state, choice.roll.success, flight),
      fail: outcome(state, choice.roll.fail),
      ...(flight && { crashPct: flightOdds(state, choice).crashPct }) };
  } else if (choice.effect) option.sure = outcome(state, choice.effect);
  return option;
}

function resolve(state: GameState): Map<string, Resolved> {
  const choices = new Map<string, Resolved>();
  if (state.phase === 'ended') return choices;
  const node = nodeAt(state);
  const board = (id: string, choice: Choice) => choices.set(id, { kind: 'board', place: node.place, choice, flight: false });
  const jobs = jobChoices(state);
  for (const { id, choice, locks } of jobs.choices) {
    choices.set(id, { kind: 'board', place: node.place, choice, flight: false, jobLocks: locks });
  }
  if (jobs.exclusive) return choices;
  for (const { id, locks, ...service } of economyChoices(state)) {
    choices.set(id, { ...service, flight: false, jobLocks: locks });
  }
  if (state.phase === 'event') {
    currentEvent(state)?.choices.forEach((choice, index) => choices.set(`ev:${index}`,
      { kind: 'event', place: currentEvent(state)!.place, choice, flight: false }));
    board('skip', BOARD_CHOICES.skip);
  } else if (state.board.step === 'spin') board('spin', BOARD_CHOICES.spin);
  else if (state.board.step === 'pick') {
    for (const move of reachable(state)) {
      const place = BY_ID.get(move.node)!.place;
      choices.set(`go:${move.node}`, { kind: 'board', place, flight: false, choice: {
        title: TEXT.goTitle(PLACES[place].name, move.steps), desc: TEXT.goDesc(move.fare),
        effect: { text: TEXT.arrived(PLACES[place].name) },
      } });
    }
    // Corrupt/obsolete paths cannot trap a loaded game; skipping still consumes the tile slot.
    if (!choices.size) board('skip', BOARD_CHOICES.skip);
  } else {
    const tile = state.board.step === 'space';
    // Match v1 SPACE_MENU: tile menus use kind + when; extras use the actual place + when.
    for (const original of [...TRACK_WORK, ...TRACK_TRAIN, ...TRACK_PREP, ...ACTIONS]) {
      const action = startingAction(state, original, tile);
      if (!(tile ? SPACE_MENU[node.kind]?.includes(action.id) : action.place === node.place)
        || !met(state, action.when) || (!tile && state.s.stamina < (action.tire ?? 0))) continue;
      if (SPACE_MENU.rankup?.includes(action.id) && (!tile || canPromote(state))) continue;
      choices.set(`act:${action.id}`, { kind: action.flight ? 'job' : 'action', place: action.place,
        choice: tile ? { ...action, tire: 0 } : action, flight: !!action.flight });
    }
    board(tile ? 'skip' : 'end', tile ? BOARD_CHOICES.skip : BOARD_CHOICES.end);
  }
  return choices;
}

export function options(state: GameState, menu: 'board' | 'phone' = 'board'): OptionView[] {
  if (menu === 'phone') return economyChoices(state, true).map(({ id, locks, ...service }) =>
    view(state, id, { ...service, flight: false, jobLocks: locks }));
  return [...resolve(state)].map(([id, r]) => view(state, id, r));
}

function resolveOption(state: GameState, id: string) {
  let r = resolve(state).get(id);
  if (!r) {
    const service = economyChoices(state, true).find(choice => choice.id === id);
    if (service) r = { ...service, flight: false, jobLocks: service.locks };
  }
  if (!r) throw new Error(TEXT.unavailable(id));
  return { r, v: view(state, id, r) };
}

function diff(before: GameState['s'], after: GameState['s']): StatMap {
  return Object.fromEntries(STATS.filter(stat => after[stat] !== before[stat]).map(stat => [stat, after[stat] - before[stat]]));
}

function payLedger(state: GameState, result: Result) {
  const lines = Object.entries(state.board.ledger).map(([label, amount]) => ({ label, amount }));
  const before = state.s.money - state.s.debt, total = ledgerSum(state);
  const paidState = settleLedger(state);
  state.s = paidState.s; state.board.ledger = paidState.board.ledger;
  const applied = state.s.money - state.s.debt - before;
  if (applied !== total) lines.push({ label: TEXT.balanceAdjustment, amount: applied - total });
  state.board.ledger = {};
  const paid = result.upkeep ??= { lines: [], total: 0 };
  paid.lines.push(...lines); paid.total += applied;
}

function endSeason(state: GameState, result: Result, runHooks: boolean): GameState {
  const from = dateLabel(state.turn), { upkeep } = derived(state);
  state = accrue(state, false);
  if (state.status === 'working' && state.track === 'academy') {
    const a = RULES.academy, seated = Math.min(state.s.students, a.baseSeats + state.s.staff * a.seatsPerStaff);
    setStat(state, 'students', seated - Math.max(1, Math.floor(seated / a.leaveDiv)));
  }
  if (state.status === 'working' && state.track === 'company') {
    const c = RULES.company;
    setStat(state, 'value', state.s.value + Math.min(state.s.contracts, state.s.staff * c.perStaff) * c.valuePerContract);
  }
  state.turn++;
  // Career close includes yearEndReview at spring and age-based retirement, before stamina refill.
  state = advanceCareer(advanceStudies(state));
  const beforeCredit = state.s.overdue;
  state = checkCredit(state);
  if (state.s.overdue) result.notes.push(ECONOMY_TEXT.overdue(state.s.overdue));
  else if (beforeCredit && state.log.at(-1)?.turn === state.turn
    && state.log.at(-1)?.text === ECONOMY_TEXT.liquidation) result.notes.push(ECONOMY_TEXT.liquidation);
  if (runHooks && seasonAt(state.turn) === LIFE_RULES.spring) {
    state = HOOKS.yearEnd(state);
    if (ageAt(state.turn) % LIFE_RULES.lifeEventYears === 0) state = HOOKS.lifeEvent(state);
  }
  state.s.capStamina = Math.min(state.s.capStamina, ageCap(state.turn));
  const beforeRefill = state.s.stamina;
  setStat(state, 'stamina', beforeRefill + RULES.seasonRefill);
  state.s.acts = 0;
  state.phase = 'action'; state.eventId = null;
  state.board.step = 'spin'; state.board.dice = [];
  result.season = { from, to: dateLabel(state.turn), refill: state.s.stamina - beforeRefill, accrual: upkeep.lines };
  // T03 always runs 204 seasons: overdue strikes are counted, never an early ending.
  if (state.turn >= LIFE_RULES.maxTurns) {
    payLedger(state, result);
    const worth = derived(state).netWorth;
    state.phase = 'ended';
    state.ending = worth < RULES.debtorNetWorth ? 'debtor' : LIFE_RULES.timeoutEnding;
    state.score = state.ending === 'debtor' ? 0 : clamp(worth, 0, RULES.score.max);
    state.log.push({ turn: state.turn, text: TEXT.finished, tone: 'info' });
    result.ended = state.ending;
  }
  return state;
}

function pickEvent(state: GameState, contest: boolean) {
  const available = EVENTS.filter(event => met(state, event.when)
    && (state.seen[event.id] === undefined || state.turn - state.seen[event.id] >= LIFE_RULES.eventCooldown));
  const themed = contest ? available.filter(event => CONTEST_EVENTS.includes(event.id)) : [];
  const pool = themed.length ? themed : available;
  if (!pool.length) return null;
  let pick = randInt(state, pool.reduce((sum, event) => sum + event.weight, 0));
  for (const event of pool) { pick -= event.weight; if (pick < 0) return event; }
  return null;
}

function land(state: GameState, result: Result) {
  const node = nodeAt(state);
  state.board.step = 'space';
  if (node.kind === 'rankup' && state.status === 'working') {
    result.review = review(state);
    result.notes.push(CAREER_TEXT.review[result.review.outcome], ...result.review.locks);
  } else if (SETTLEMENT_KINDS.includes(node.kind)) {
    payLedger(state, result);
    result.notes.push(TEXT.settled); state.board.step = 'bonus';
  } else if (node.kind === 'rest') {
    const before = state.s.stamina;
    setStat(state, 'stamina', before + LIFE_RULES.restGain);
    result.restGain = state.s.stamina - before;
    result.notes.push(TEXT.rested); state.board.step = 'bonus';
  } else if (node.kind === 'event' || node.kind === 'contest') {
    const event = pickEvent(state, node.kind === 'contest');
    if (event) {
      state.phase = 'event'; state.eventId = result.eventId = event.id;
      state.seen[event.id] = state.turn;
    }
  }
}

function travel(state: GameState, destination: string, result: Result): GameState {
  const applied = applyMove(state, destination, { canPromote });
  state = applied.state; result.move = applied.move;
  // applyMove includes arrivals in passed; ledger clearing makes arrival settlement idempotent.
  for (const kind of SETTLEMENT_KINDS) {
    for (const _node of applied.move.passed[kind as 'pay' | 'start']) payLedger(state, result);
  }
  for (const id of applied.move.passed.start) {
    const before = state.s.money;
    state = passStart(state, BY_ID.get(id)!.map);
    const amount = state.s.money - before;
    if (amount) {
      const paid = result.upkeep ??= { lines: [], total: 0 };
      paid.lines.push({ label: ECONOMY_TEXT.lap, amount }); paid.total += amount;
    }
  }
  land(state, result);
  if (applied.move.passed.start.length) state = afterStartPass(state);
  return state;
}

function applyEffect(state: GameState, effect: Effect, add: StatMap): string | undefined {
  for (const [stat, value] of entries(add)) setStat(state, stat, state.s[stat] + value);
  for (const [stat, value] of entries(effect.set)) setStat(state, stat, value);
  const flag = effect.flag && !state.flags.includes(effect.flag) ? effect.flag : undefined;
  if (flag) state.flags.push(flag);
  if (effect.status) state.status = effect.status;
  if (effect.track !== undefined) state.track = effect.track;
  // Imported v1 achievement endings cannot shorten the T03 lifetime either.
  settle(state);
  return flag;
}

function play(state: GameState, r: Resolved, v: OptionView, branch: BranchId, runHooks: boolean): { state: GameState; result: Result } {
  const before = { ...state.s }, success = branch === 'success', crashed = branch === 'crash';
  const side = success ? 'success' : 'fail';
  const effect = branch === 'sure' ? r.choice.effect! : r.choice.roll![side];
  const outcome = branch === 'sure' ? v.sure! : v.roll![side];
  const result: Result = { optionId: v.id, title: v.title, place: v.place, free: v.free, text: effect.text,
    deltas: {}, crashed, notes: [], statusFrom: state.status, statusTo: state.status, trackFrom: state.track, trackTo: state.track };
  state.s.money -= v.cost; state.s.stamina = Math.max(0, state.s.stamina - v.tire);
  if (branch !== 'sure' && !r.jobLocks) {
    setStat(state, success ? 'wins' : 'losses', state.s[success ? 'wins' : 'losses'] + 1);
    if (r.flight) {
      const f = RULES.flight;
      setStat(state, 'flights', state.s.flights + 1); setStat(state, 'cond', state.s.cond - f.wear);
      if (crashed) {
        setStat(state, 'crashes', state.s.crashes + 1); setStat(state, 'drone', state.s.drone - 1);
        state.s.cond = f.crashCond;
        result.notes.push(state.s.drone > 0 ? TEXT.crash : TEXT.lost);
      } else if (!success) setStat(state, 'cond', state.s.cond - f.failWear);
    }
  }
  const job = isJobChoice(v.id);
  const flag = applyEffect(state, job ? { ...effect, status: undefined, track: undefined } : effect, outcome.add);
  if (job) state = applyJobChoice(state, v.id, branch === 'sure' || success);
  else if (v.id.startsWith('act:')) {
    if (state.board.step === 'space' && nodeAt(state).kind === 'job') {
      state = performance(state, branch === 'sure' || success ? 'workSuccess' : 'workFailure');
    } else if (state.board.step === 'bonus' && CAREER_ACTIONS.includes(v.id.slice('act:'.length))) {
      state = performance(state, 'extra');
    }
  }
  if (v.id.startsWith('lifestyle:')) state = applyEconomyChoice(state, v.id);
  if (flag) result.flag = flag;
  if (!v.free && (r.kind !== 'board' || v.id === 'skip')) state.s.acts++;
  result.deltas = diff(before, state.s);
  const afterOption = { ...state.s };
  state.log.push({ turn: state.turn, text: TEXT.log(v.title, result.text), tone: branch === 'sure' ? 'info' : success ? 'good' : 'bad' });
  if (job || v.free) {
    // jobs.ts owns popup continuation; entry never consumes the extra action or a season.
  } else if (v.id === 'spin') {
    rollDice(state); state.board.step = 'pick';
    const moves = reachable(state);
    if (moves.length === 1) state = travel(state, moves[0].node, result);
    else if (!moves.length) land(state, result);
  } else if (v.id.startsWith('go:')) state = travel(state, v.id.slice('go:'.length), result);
  else if (state.phase === 'event') {
    if (nodeAt(state).kind === 'contest' && success) {
      state.board.contests++;
      state = performance(state, 'contest');
    }
    state.phase = 'action'; state.eventId = null; state.board.step = 'bonus';
  } else if (state.board.step === 'bonus') state = endSeason(state, result, runHooks);
  else state.board.step = 'bonus';
  result.statusTo = state.status; result.trackTo = state.track;
  const settlement = diff(afterOption, state.s);
  if (Object.keys(settlement).length || result.season || result.upkeep || result.restGain !== undefined) result.settle = { deltas: settlement };
  if (state.log.length > LIFE_RULES.logMax) state.log.splice(0, state.log.length - LIFE_RULES.logMax);
  return { state, result };
}

export function choose(prev: GameState, optionId: string): { state: GameState; result: Result } {
  const { r, v } = resolveOption(prev, optionId);
  if (!v.enabled) throw new Error(TEXT.disabled(optionId, v.locks));
  const state = structuredClone(prev);
  let branch: BranchId = 'sure', roll: Result['roll'];
  if (v.roll) {
    const value = randInt(state, LIFE_RULES.percent), success = value < v.roll.chance;
    roll = { chance: v.roll.chance, value, success };
    branch = success ? 'success' : 'fail';
    if (!success && r.flight && randInt(state, LIFE_RULES.percent) < (v.roll.crashPct ?? 0)) branch = 'crash';
  }
  const played = play(state, r, v, branch, true);
  if (roll) played.result.roll = roll;
  return played;
}

/** Previews share the same branch executor; neither RNG nor hooks on the live run are touched. */
export function forecast(prev: GameState, optionId: string): Forecast {
  const { r, v } = resolveOption(prev, optionId);
  const ids: BranchId[] = v.roll ? ['success', 'fail'] : ['sure'];
  if (v.roll?.crashPct) ids.push('crash');
  const branches = ids.map((id): Forecast['branches'][number] => {
    const state = structuredClone(prev);
    state.s.money = Math.max(state.s.money, v.cost);
    const { result } = play(state, r, v, id, false);
    return { id, deltas: result.deltas, endsSeason: !!result.season,
      ...(result.season && { accrual: result.season.accrual }), ...(result.flag && { flag: result.flag }),
      ...(result.statusTo !== result.statusFrom && { status: result.statusTo }),
      ...(result.trackTo !== result.trackFrom && { track: result.trackTo }), ...(result.ended && { end: result.ended }) };
  });
  return { cost: v.cost, tire: v.tire, branches,
    ...(optionId === 'spin' && { die: RULES.board.die }),
    ...(v.roll && { chance: v.roll.chance }), ...(v.roll?.crashPct !== undefined && { crashPct: v.roll.crashPct }) };
}
