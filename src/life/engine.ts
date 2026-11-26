import { baseOptionId, dialNotch, dialTicks } from './dial.ts';
import type { DialTicks } from './dial.ts';
import type { DialNotch } from './life-data.ts';
// T03: one spin, one tile choice and at most one extra action per season.
// Public operations are pure; mutation below is confined to their private working copies.
import { FLAG_LABEL, RULES } from './data.ts';
import type { BranchId, Derived as V1Derived, Forecast as V1Forecast,
  OptionKind, OptionView as V1OptionView, OutcomeView as V1OutcomeView,
  Result as V1Result } from './base-types.ts';
import { CONTEST_EVENTS } from './data.ts';
import { ACTIONS, EVENTS } from './compat.ts';
import { CAREER_KEYS, CAREER_TEXT, promotionView, retirementView } from './career2.ts';
import { applyAssetChoice, applyAssetMove, assetPopup, assetReachable, consumeLuck,
  discountedChoice, drawLuck, luckChanceBonus, rollAssetDice, shortcutMoves } from './assets.ts';
import { accrue, applyEconomyChoice, checkCredit, economyChoices, economyView, ECONOMY_TEXT,
  flightPay, ledgerSum, passStart, settle as settleLedger } from './economy.ts';
import { canRetireEarly, finish, recordAchievements, recordEndingEffect, retireEarly } from './ending.ts';
import { advanceCareer, advanceStudies, afterStartPass, applyJobChoice, canPromote, isJobChoice,
  contestPrize, creatorIncome, electionWin, entryRank, performance, review, specialistChoices, startingAction } from './jobs.ts';
import { applyHomeChoice, homeRecovery, yearEndHome } from './home.ts';
import type { EstateOffer } from './home.ts';
import { advanceFamily, applyFamilyChoice, familyAchievementPoints, familyChoices, familyRecovery, familyVisit } from './family.ts';
import { CREATOR_VIDEO, JOB_RULES, SPECIAL_RULES as S, SPECIAL_TEXT as ST, TRACKS, TRACK_PREP, TRACK_TRAIN, TRACK_WORK } from './tracks.ts';
import { BOARD_CHOICES, CAREER_ACTIONS, DIAL_SETTINGS, DIAL_TEXT, DIAL_ZERO_TIRE_BOLD, ENDING_KEYS, ENDING_RULES, ENDING_TEXT, FAMILY_RULES, FAMILY_TEXT, INITIAL_STATE, LIFE_RULES, MAP_IDS, SETTLEMENT_KINDS,
  SPACE_MENU, STOP_RULES, STAT_LABEL, STAT_MAX, STATS, TEXT, WEDDINGS } from './life-data.ts';
import { answer, childFor, EVENTS_A, EVENT_KEYS as EK, EVENT_RULES as ER, EVENT_TEXT as ET,
  familyEventEffect, materialize } from './events-a.ts';
import type { LifeChoice, LifeEffect } from './events-a.ts';
import { afterEventHome, eventCarState, eventEstateOffers, eventYearEnd, EVENTS_B,
  homeEventEffect, householdEventLines, improvementWorth } from './events-b.ts';
import { careerEventEffect, EVENTS_C } from './events-c.ts';
import { afterEventAsset, businessEventEffect, eventAssetChoices, eventIncomeState, EVENTS_D } from './events-d.ts';
import { afterFundEvent, beginFinanceEvent, EVENT2_KEYS as E2K, eventFundYearEnd, EVENTS_E,
  financeEventEffect, fundEventChoices } from './events-e.ts';
import type { EventExtra2 } from './events-e.ts';
import { closeEventHealth, eventFlightPenalty, eventRecovery, EVENTS_F, healthEventEffect } from './events-f.ts';
import { eventJobChoices, EVENTS_G, travelEventEffect } from './events-g.ts';
import { EVENTS_H, lateEventEffect, villaLocks } from './events-h.ts';
import { randInt } from './move.ts';
import type { Move, StopReason } from './move.ts';
import { PLACES, WORLD } from './world.ts';
import type { ActionDef, Choice, Cond, Effect, EndingId, GameState, PlaceId, Stat, StatMap, Status, TrackId, WorldNode } from './types.ts';
import { restore as restoreBase } from './restore.ts';
import { applyCardChoice, cardChoice, cardGainText, CARD_KEYS, CARD_TEXT, grantCard, offeredCard } from './cards.ts';
export { cards } from './cards.ts';
export { jobOffers } from './jobs.ts';
export { settlementSummary } from './ending.ts';
export const estateOffers = eventEstateOffers;
export const LIFE_EVENTS = [...EVENTS_A, ...EVENTS_B, ...EVENTS_C, ...EVENTS_D, ...EVENTS_E, ...EVENTS_F, ...EVENTS_G, ...EVENTS_H];
export const ALL_EVENTS = [...EVENTS, ...LIFE_EVENTS];
type EventState = Pick<GameState, 'job' | 'home' | 'estates' | 'holdings' | 'family' | 'timers' | 'flags' | 'feats'
  | 'fund' | 'turn' | 'board' | 'phase' | 'eventId' | 'seen' | 'hand'> & { position: string };
const eventState = (s: GameState): EventState => structuredClone({ job: s.job, home: s.home, estates: s.estates,
  holdings: s.holdings, family: s.family, timers: s.timers, flags: s.flags, feats: s.feats, position: s.board.pos,
  fund: s.fund, turn: s.turn, board: s.board, phase: s.phase, eventId: s.eventId, seen: s.seen, hand: s.hand });
/** Validate new event saves through the existing strict boundary, including every nested integer. */
export function restore(raw: unknown): GameState | null {
  // v2 has no total-score cap. Retain the strict legacy shape checks without its v1 score ceiling.
  if (raw && typeof raw === 'object' && 'phase' in raw && raw.phase === 'ended' && 'score' in raw
    && typeof raw.score === 'number' && Number.isSafeInteger(raw.score) && raw.score > RULES.score.max) {
    const restored = restoreBase({ ...raw, score: 0 });
    if (restored) restored.score = raw.score;
    return restored;
  }
  if (raw && typeof raw === 'object' && 'phase' in raw && raw.phase === 'event' && 'eventId' in raw
    && LIFE_EVENTS.some(event => event.id === raw.eventId)) {
    const restored = restoreBase({ ...raw, phase: 'action', eventId: null });
    if (!restored || !['space', 'spin'].includes(restored.board.step)) return null;
    restored.phase = 'event'; restored.eventId = raw.eventId as string; return restored;
  }
  return restoreBase(raw);
}

// Retain the v1 view contracts while widening their vocabulary to v2 places and stats.
type OutcomeView = Omit<V1OutcomeView, 'add' | 'stage' | 'end'> & {
  add: StatMap; status?: Status; track?: TrackId | null;
};
export type OptionView = Omit<V1OptionView, 'place' | 'missing' | 'roll' | 'sure'> & {
  place: PlaceId; missing: { stat: Stat; need: number }[];
  roll?: { chance: number; staminaPct: number; success: OutcomeView; fail: OutcomeView; crashPct?: number; ticks?: DialTicks };
  sure?: OutcomeView;
  noEffect?: boolean;
  dial?: { selected: DialNotch; spare: number; settings: {
    notch: DialNotch; id: string; label: string; enabled: boolean; noEffect: boolean; locks: string[];
    missing: OptionView['missing']; chance: number; crashPct: number; ticks: DialTicks;
    tire: number; success: OutcomeView;
  }[] };
};
export type Result = Omit<V1Result, 'place' | 'move' | 'deltas' | 'settle' | 'stageFrom' | 'stageTo' | 'ended' | 'roll'> & {
  roll?: NonNullable<V1Result['roll']> & { crashPct?: number; ticks?: DialTicks };
  place: PlaceId; move?: Move; deltas: StatMap; settle?: { deltas: StatMap };
  review?: ReturnType<typeof review>;
  luck?: { id: string; title: string; text: string };
  effects?: EventState;
  statusFrom: Status; statusTo: Status; trackFrom: TrackId | null; trackTo: TrackId | null; ended?: EndingId;
};
export type Forecast = Omit<V1Forecast, 'branches'> & {
  ticks?: DialTicks;
  branches: (Omit<V1Forecast['branches'][number], 'deltas' | 'stage' | 'end'> & {
    deltas: StatMap; status?: Status; track?: TrackId | null; end?: EndingId;
    effects?: EventState;
  })[];
};
export type Derived = V1Derived & { period: string; remainingSeasons: number; capStamina: number; familyAchievementPoints: number };

const BY_ID = new Map(WORLD.map(node => [node.id, node]));
const nodeAt = (state: GameState) => BY_ID.get(state.board.pos)!;
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const entries = (map?: StatMap) => Object.entries(map ?? {}) as [Stat, number][];
const ageAt = (turn: number) => LIFE_RULES.startAge + Math.floor(turn / LIFE_RULES.seasons.length);
const seasonAt = (turn: number) => turn % LIFE_RULES.seasons.length;
const ageCap = (turn: number) => LIFE_RULES.staminaCaps.find(row => ageAt(turn) >= row.minAge)!.cap;
const dateLabel = (turn: number) => TEXT.date(ageAt(turn), LIFE_RULES.seasons[seasonAt(turn)]);

/** Engine previews and actual travel use the same forced-stop predicates. */
export const reachable = (state: GameState): Move[] => assetReachable(eventCarState(state), { canPromote, stopFor });

export function newGame(seed: number): GameState {
  const state = structuredClone(INITIAL_STATE);
  state.seed = state.rng = (Math.floor(Number(seed)) >>> 0) || LIFE_RULES.defaultSeed;
  state.s.money = JOB_RULES.startMoney;
  return state;
}

export function derived(state: GameState): Derived {
  const age = ageAt(state.turn);
  const period = LIFE_RULES.periods.find(row => age <= row.maxAge) ?? LIFE_RULES.periods.at(-1)!;
  const economy = economyView(eventIncomeState(state)), advertising = creatorIncome(state);
  const eventLines = householdEventLines(state);
  economy.upkeep.lines.push(...eventLines); economy.upkeep.total += eventLines.reduce((sum, line) => sum + line.amount, 0);
  economy.netWorth += improvementWorth(state);
  if (advertising) {
    economy.upkeep.lines.push({ label: ST.creatorIncome, amount: advertising });
    economy.upkeep.total += advertising;
  }
  return { ...economy, age, season: seasonAt(state.turn),
    seasonName: LIFE_RULES.seasons[seasonAt(state.turn)], dateLabel: dateLabel(state.turn), period: period.name,
    remainingSeasons: Math.max(0, LIFE_RULES.maxTurns - state.turn),
    capStamina: Math.min(ageCap(state.turn), state.s.capStamina), familyAchievementPoints: familyAchievementPoints(state) };
}

/** Called with the new turn, including the terminal 70-year-old spring. */
export const yearEnd = (state: GameState) => eventYearEnd(eventFundYearEnd(state));
export function lifeEvent(prev: GameState): GameState {
  const state = structuredClone(prev);
  if (!state.turn || state.turn >= LIFE_RULES.maxTurns || state.phase !== 'action'
    || seasonAt(state.turn) !== LIFE_RULES.spring || ageAt(state.turn) % LIFE_RULES.lifeEventYears
    || state.timers[EK.lifeAt] === state.turn) return state;
  state.timers[EK.lifeAt] = state.turn;
  const event = pickEvent(state, false, true);
  if (event) beginEvent(state, event.id);
  return state;
}
export const HOOKS = { yearEnd, lifeEvent };

function setStat(state: GameState, stat: Stat, value: number) {
  const max = stat === 'stamina' ? Math.min(ageCap(state.turn), state.s.capStamina)
    : STAT_MAX[stat] ?? LIFE_RULES.statMax;
  state.s[stat] = clamp(Math.trunc(value), stat === 'money' ? -LIFE_RULES.statMax
    : stat === 'homeIndex' ? LIFE_RULES.minHomeIndex : stat === 'capStamina' ? LIFE_RULES.minCapStamina : 0, max);
  if (stat === 'capStamina') state.s.stamina = Math.min(state.s.stamina, state.s.capStamina);
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
export const currentEvent = (state: GameState) => {
  const event = LIFE_EVENTS.find(row => row.id === state.eventId);
  return event ? materialize(event, state) : EVENTS.find(row => row.id === state.eventId) ?? null;
};

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

function outcome(state: GameState, effect: Effect, flight = false, prize = false): OutcomeView {
  const add = { ...effect.add };
  if (add.money && add.money > 0) {
    if (prize) add.money = contestPrize(state, add.money);
    else if (flight) add.money = flightPay(state.track === 'racer' ? { ...state, track: null } : state, add.money);
  }
  return { text: effect.text, add,
    ...(effect.status && effect.status !== state.status && { status: effect.status }),
    ...(effect.track !== undefined && effect.track !== state.track && { track: effect.track }) };
}

type Resolved = { kind: OptionKind; place: PlaceId; choice: LifeChoice; flight: boolean; free?: boolean;
  jobLocks?: string[]; home?: EstateOffer; family?: boolean; eventPopup?: boolean; life?: boolean; card?: boolean };
// §13.3: scale positive ability gains once, before study/zone multipliers. Costs and losses stay intact.
function balanceAction(action: ActionDef): ActionDef {
  const effect = (row: Effect): Effect => ({ ...row, ...(row.add && { add: Object.fromEntries(
    entries(row.add).map(([stat, value]) => [stat, value > 0 && LIFE_RULES.actionGainStats.includes(stat)
      ? Math.floor(value * LIFE_RULES.actionGainPct / LIFE_RULES.percent) : value])) }) });
  return { ...action, ...(action.effect && { effect: effect(action.effect) }),
    ...(action.roll && { roll: { ...action.roll, success: effect(action.roll.success), fail: effect(action.roll.fail) } }) };
}
const BALANCED_ACTIONS = [...TRACK_WORK, ...TRACK_TRAIN, ...TRACK_PREP, CREATOR_VIDEO, ...ACTIONS].map(balanceAction);
const EXAM_ACTION = BALANCED_ACTIONS.find(action => action.id === STOP_RULES.examAction)!;
function view(state: GameState, id: string, r: Resolved, notch: DialNotch = 'mid', withDial = true): OptionView {
  const dial = !!r.choice.roll && r.flight;
  const baseSetting = DIAL_SETTINGS.find(row => row.id === notch)!;
  const setting = notch === 'bold' && (r.choice.tire ?? 0) === 0
    ? { ...baseSetting, ...DIAL_ZERO_TIRE_BOLD } : baseSetting;
  const { kind, place, flight } = r, choice = discountedChoice(state, id, r.choice, !r.free);
  const { locks, missing } = unmet(state, choice.need);
  locks.push(...(r.jobLocks ?? []));
  const cost = choice.cost ?? 0, tire = Math.max(0, (choice.tire ?? 0) + (dial ? setting.tire : 0));
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
    if (flight) chance += flightOdds(state, choice).bonus - eventFlightPenalty(state);
    chance += luckChanceBonus(state, id, dial ? setting.chanceDelta : 0);
    option.roll = { chance: clamp(chance, RULES.chanceMin, RULES.chanceMax), staminaPct,
      success: outcome(state, choice.roll.success, flight,
        kind === 'event' && nodeAt(state).kind === 'contest' && CONTEST_EVENTS.includes(state.eventId!)),
      fail: outcome(state, choice.roll.fail),
      ...(dial && { crashPct: clamp(flightOdds(state, choice).crashPct + setting.crashDelta, 0, LIFE_RULES.percent) }) };
    if (dial) {
      option.roll.ticks = dialTicks(option.roll.chance, option.roll.crashPct!);
      const midTicks = notch === 'mid' ? option.roll.ticks : view(state, id, r, 'mid', false).roll!.ticks!;
      option.noEffect = notch !== 'mid' && option.roll.ticks.success === midTicks.success
        && option.roll.ticks.fail === midTicks.fail && option.roll.ticks.crash === midTicks.crash;
      if (option.noEffect) { option.enabled = false; locks.push(DIAL_TEXT.noEffect); }
      const money = option.roll.success.add.money;
      if (money && money > 0) option.roll.success.add.money = Math.floor(money * setting.payPct / LIFE_RULES.percent);
    }
    if (id === 'promo') option.desc = CAREER_TEXT.promoDesc(promotionView(state).title, option.roll.chance);
  } else if (choice.effect) option.sure = outcome(state, choice.effect);
  if (dial && withDial) {
    const settings = DIAL_SETTINGS.map(row => {
      const v = row.id === notch ? option : view(state, id, r, row.id, false), roll = v.roll!;
      return { notch: row.id, id: `${id}@${row.id}`, label: row.label, enabled: v.enabled, noEffect: v.noEffect!, locks: v.locks,
        missing: v.missing, chance: roll.chance, crashPct: roll.crashPct!, ticks: roll.ticks!, tire: v.tire, success: roll.success };
    });
    option.dial = { selected: settings.find(row => row.notch === state.board.dial && row.enabled)?.notch ?? 'mid',
      spare: Math.max(0, state.s.drone - (choice.need?.min?.drone ?? 1)), settings };
  }
  return option;
}

/** Exam site: the licence exam is enabled there after the fares paid on the way. Local life tile: a
 * marriage or birth step is open. */
function stopFor(prev: GameState, node: WorldNode, spent: number): StopReason | undefined {
  // An extra-move card skips the tile on the first move, so a stop there would offer nothing.
  if (prev.timers[CARD_KEYS.again] === prev.turn) return undefined;
  const exam = EXAM_ACTION, state = spent ? { ...prev, s: { ...prev.s, money: prev.s.money - spent } } : prev;
  if (node.place === exam.place && state.status === 'student' && met(state, exam.when)
    && view(state, `act:${exam.id}`, { kind: 'action', place: exam.place, choice: exam, flight: false }).enabled) return 'exam';
  if (node.map === FAMILY_RULES.localMap && node.kind === 'life' && node.place === FAMILY_RULES.localPlace
    && EVENTS_A.some(event => STOP_RULES.familyEvents.includes(event.id) && event.eligible?.(state))) return 'life';
  return undefined;
}

/** A local invitation retains the existing event's requirements, costs and opt-out. */
function localFamilyEvents(state: GameState) {
  const node = nodeAt(state);
  if (state.phase !== 'action' || state.board.step !== 'space' || node.map !== FAMILY_RULES.localMap
    || !(node.kind === 'start' || node.kind === 'life' && node.place === FAMILY_RULES.localPlace)) return [];
  return EVENTS_A.filter(event => FAMILY_RULES.localEvents.includes(event.id) && event.eligible?.(state));
}

function resolve(state: GameState, interactive = false): Map<string, Resolved> {
  const choices = new Map<string, Resolved>();
  if (state.phase === 'ended') return choices;
  const node = nodeAt(state);
  const board = (id: string, choice: Choice) => choices.set(id, { kind: 'board', place: node.place, choice, flight: false });
  if (offeredCard(state)) {
    choices.set('skip', { kind: 'board', place: node.place, choice: cardChoice(state, 'skip')!.choice,
      flight: false, free: true, card: true });
    return choices;
  }
  if (state.timers[E2K.fundPopup] !== undefined) {
    for (const { id, locks, ...service } of fundEventChoices(state)) choices.set(id, {
      ...service, free: true, flight: false, jobLocks: locks, eventPopup: true });
    choices.set('skip', { kind: 'board', place: node.place, choice: BOARD_CHOICES.skip,
      free: true, flight: false, eventPopup: true });
    return choices;
  }
  const eventPopup = EK.popupIds[(state.timers[EK.popup] ?? 0) - 1];
  if (eventPopup) {
    const add = (id: string, choice: LifeChoice, extra: Partial<Resolved> = {}) => choices.set(id, {
      kind: 'action', place: node.place, choice, flight: false, free: true, jobLocks: [], eventPopup: true, ...extra });
    if (eventPopup === 'wedding') WEDDINGS.forEach((row, i) => add(`wed:${i}`, answer(row.title, row.add, row.cost), { family: true }));
    if (eventPopup === 'estate' || eventPopup === 'bargain') for (const home of eventEstateOffers(state, true, eventPopup === 'bargain')) {
      add(home.id, home.choice, { home, jobLocks: home.locked });
    }
    if (eventPopup === 'retire') ET.retire.forEach((title, i) => add(`event:retire:${i}`, answer(title,
      { money: Math.floor(retirementView(state).severance * ER.retirePct / LIFE_RULES.percent) }, 0, { quit: i ? 'retired' : 'jobless' })));
    if (eventPopup === 'franchise') add('event:franchise', answer(ET.franchise, {}, ER.bargainPrice, { franchise: ER.bargainPrice }));
    add('skip', BOARD_CHOICES.skip); return choices;
  }
  const popup = assetPopup(state);
  if (popup) {
    for (const { id, locks, ...service } of popup) choices.set(id, { ...service, flight: false, jobLocks: locks });
    return choices;
  }
  const jobs = eventJobChoices(state);
  for (const { id, choice, locks } of jobs.choices) {
    choices.set(id, { kind: 'board', place: node.place,
      choice: id === 'job:none' && state.timers[EK.headhunter] !== undefined ? { ...choice, title: BOARD_CHOICES.skip.title } : choice,
      flight: false, jobLocks: locks, eventPopup: state.timers[E2K.jobs] !== undefined });
  }
  if (jobs.exclusive) return choices;
  const family = familyChoices(state.phase === 'event' && state.board.step === 'spin' ? { ...state, phase: 'action' } : state);
  if (family.exclusive) choices.clear();
  for (const { id, choice, locks } of family.choices) {
    choices.set(id, { kind: 'action', place: node.place, choice, flight: false,
      jobLocks: locks, family: true, free: family.exclusive });
  }
  if (family.exclusive) return choices;
  if (state.phase === 'event') {
    choices.clear();
    const event = currentEvent(state), life = LIFE_EVENTS.some(row => row.id === state.eventId);
    event?.choices.forEach((choice, i) => choices.set(`ev:${i}`, { kind: 'event', place: event.place,
      choice, flight: false, life, free: state.board.step === 'spin', ...(life && {
        jobLocks: ((choice.effect as LifeEffect | undefined)?.extra as EventExtra2 | undefined)?.villa ? villaLocks(state) : [] }) }));
    choices.set('skip', { kind: 'board', place: node.place, choice: BOARD_CHOICES.skip, flight: false,
      life, free: state.board.step === 'spin' }); return choices;
  }
  for (const event of localFamilyEvents(state)) choices.set(`family:event:${event.id}`, {
    kind: 'board', place: node.place, flight: false, free: true, life: true,
    choice: { title: FAMILY_TEXT.localEvent[event.id], desc: FAMILY_TEXT.localDesc, effect: { text: FAMILY_TEXT.localDesc } },
  });
  for (const { id, choice, locks } of specialistChoices(state)) {
    choices.set(id, { kind: 'action', place: node.place, choice, flight: false, jobLocks: locks });
  }
  for (const home of estateOffers(state)) {
    choices.set(home.id, { kind: 'action', place: node.place, choice: home.choice,
      flight: false, jobLocks: home.locked, home });
  }
  for (const { id, locks, ...service } of [...economyChoices(state), ...eventAssetChoices(state)]) {
    choices.set(id, { ...service, flight: false, jobLocks: locks });
  }
  if (state.board.step === 'spin') {
    board('spin', BOARD_CHOICES.spin);
    const visit = interactive ? familyVisit(state) : null;
    if (visit) choices.set(visit.id, { kind: 'board', place: node.place, choice: visit.choice, flight: false });
  }
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
    for (const original of BALANCED_ACTIONS) {
      const recording = original.id === S.videoId;
      if (!(recording ? tile && node.kind === 'job'
        : tile ? SPACE_MENU[node.kind]?.includes(original.id) : original.place === node.place)) continue;
      const action = startingAction(state, original, tile);
      if (!met(state, action.when)) continue;
      if (SPACE_MENU.rankup?.includes(action.id) && (!tile || canPromote(state))) continue;
      const id = `act:${action.id}`, resolved: Resolved = { kind: action.flight ? 'job' : 'action', place: action.place,
        choice: tile ? { ...action, tire: 0 } : action, flight: !!action.flight };
      if (!tile && state.s.stamina < (action.tire ?? 0)
        && !(action.flight && action.roll && view(state, id, resolved).dial!.settings.some(row => row.enabled))) continue;
      choices.set(id, resolved);
    }
    board(tile ? 'skip' : 'end', tile ? BOARD_CHOICES.skip : BOARD_CHOICES.end);
  }
  return choices;
}

export function options(state: GameState, menu: 'board' | 'phone' = 'board', interactive = false): OptionView[] {
  if (menu === 'phone') return phoneServices(state).map(({ id, locks, ...service }) =>
    view(state, id, { ...service, flight: false, jobLocks: locks }));
  return [...resolve(state, interactive)].map(([id, r]) => view(state, id, r));
}

/** Count dial-only notches only for callers that can offer them. */
export function emptyBonus(state: GameState, includeDial = false): boolean {
  if (state.phase !== 'action' || state.board.step !== 'bonus') return false;
  const enabled = options(state).filter(option => option.enabled || includeDial && option.dial?.settings.some(row => row.enabled));
  return enabled.length === 1 && enabled[0].id === 'end';
}

function phoneServices(state: GameState): ReturnType<typeof economyChoices> {
  return [...economyChoices(state, true), ...eventAssetChoices(state, true), ...(canRetireEarly(state)
    ? [{ id: ENDING_RULES.earlyId, kind: 'action' as const, place: nodeAt(state).place, choice: ENDING_TEXT.early, free: true }] : [])];
}

function resolveOption(state: GameState, fullId: string, menu: 'board' | 'phone', interactive = false) {
  const id = baseOptionId(fullId), notch = dialNotch(fullId);
  if (!notch) throw new Error(TEXT.unavailable(fullId));
  if (menu === 'board' && (id.startsWith('card:') || id === 'skip' && offeredCard(state))) {
    const card = cardChoice(state, id);
    if (!card || fullId !== id) throw new Error(TEXT.unavailable(fullId));
    const r: Resolved = { kind: 'board', place: nodeAt(state).place, choice: card.choice,
      jobLocks: card.locks, flight: false, free: true, card: true };
    return { r, v: view(state, id, r) };
  }
  let r = menu === 'board' ? resolve(state, interactive).get(id) : undefined;
  if (!r) {
    const service = phoneServices(state).find(choice => choice.id === id);
    if (service) r = { ...service, flight: false, jobLocks: service.locks };
  }
  if (!r || fullId !== id && !(r.choice.roll && r.flight)) throw new Error(TEXT.unavailable(fullId));
  return { r, v: { ...view(state, id, r, notch), id: fullId } };
}

function diff(before: GameState['s'], after: GameState['s']): StatMap {
  return Object.fromEntries(STATS.filter(stat => after[stat] !== before[stat]).map(stat => [stat, after[stat] - before[stat]]));
}

function payLedger(state: GameState, result: Result) {
  const lines = Object.entries(state.board.ledger).map(([label, amount]) => ({ label, amount }));
  const before = state.s.money - state.s.debt, total = ledgerSum(state);
  const paidState = recordAchievements(state, settleLedger(state));
  Object.assign(state, paidState);
  const applied = state.s.money - state.s.debt - before;
  if (applied !== total) lines.push({ label: TEXT.balanceAdjustment, amount: applied - total });
  state.board.ledger = {};
  const paid = result.upkeep ??= { lines: [], total: 0 };
  paid.lines.push(...lines); paid.total += applied;
}

function endSeason(state: GameState, result: Result, runHooks: boolean, drawLife = true): GameState {
  const from = dateLabel(state.turn), { upkeep } = derived(state);
  const recovery = eventRecovery(state);
  state = closeEventHealth(state);
  const eventLines = householdEventLines(state);
  state = accrue(eventIncomeState(state), false);
  for (const { label, amount } of eventLines) state.board.ledger[label] = (state.board.ledger[label] ?? 0) + amount;
  const advertising = creatorIncome(state);
  if (advertising) state.board.ledger[ST.creatorIncome] = (state.board.ledger[ST.creatorIncome] ?? 0) + advertising;
  if (state.status === 'working' && state.track === 'academy') {
    const a = RULES.academy, seated = Math.min(state.s.students, a.baseSeats + state.s.staff * a.seatsPerStaff);
    setStat(state, 'students', seated - Math.max(1, Math.floor(seated / a.leaveDiv)));
  }
  if (state.status === 'working' && state.track === 'company') {
    const c = RULES.company;
    const growth = state.flags.includes('listed') ? Math.floor(state.s.value * c.listedGrowthPct / LIFE_RULES.percent) : 0;
    setStat(state, 'value', state.s.value + growth + Math.min(state.s.contracts, state.s.staff * c.perStaff) * c.valuePerContract);
  }
  state.turn++;
  // Career close includes yearEndReview at spring and age-based retirement, before stamina refill.
  state = recordAchievements(state, advanceCareer(advanceStudies(state)));
  state = yearEndHome(state);
  const beforeCredit = state.s.overdue;
  state = recordAchievements(state, checkCredit(state));
  if (state.s.overdue) result.notes.push(ECONOMY_TEXT.overdue(state.s.overdue));
  else if (beforeCredit && state.log.at(-1)?.turn === state.turn
    && state.log.at(-1)?.text === ECONOMY_TEXT.liquidation) {
    // Liquidation can create and fully repay a ledger shortfall inside one accounting operation.
    if (!state.flags.includes(ENDING_KEYS.borrowed)) state.flags.push(ENDING_KEYS.borrowed);
    result.notes.push(ECONOMY_TEXT.liquidation);
  }
  state = advanceFamily(state);
  state.phase = 'action'; state.eventId = null;
  state.board.step = 'spin'; state.board.dice = [];
  if (runHooks && seasonAt(state.turn) === LIFE_RULES.spring) {
    state = HOOKS.yearEnd(state);
    if (drawLife && ageAt(state.turn) % LIFE_RULES.lifeEventYears === 0) state = HOOKS.lifeEvent(state);
  }
  state.s.capStamina = Math.min(state.s.capStamina, ageCap(state.turn));
  const beforeRefill = state.s.stamina;
  setStat(state, 'stamina', beforeRefill + homeRecovery(state).recovery + familyRecovery(state) + recovery);
  state.s.acts = 0;
  if (state.eventId) result.eventId = state.eventId;
  result.season = { from, to: dateLabel(state.turn), refill: state.s.stamina - beforeRefill, accrual: upkeep.lines };
  // Debts and career goals never end a run before the lifetime settlement.
  if (state.turn >= LIFE_RULES.maxTurns) {
    payLedger(state, result);
    state = finish(state);
    result.ended = state.ending!;
  }
  return state;
}

export function eventCandidates(state: GameState, contest = false, life = false) {
  const available = ALL_EVENTS.filter(event => (met(state, event.when)
    || (contest && state.status === 'working' && state.track === 'racer' && event.id === S.racerContest))
    && (!life || ('life' in event && event.life))
    && (!('eligible' in event) || !event.eligible || event.eligible(state))
    && (!('once' in event) || !event.once || state.seen[event.id] === undefined)
    && (!(ER.healthyEvents as readonly string[]).includes(event.id) || !(state.timers[EK.healthyUntil] > state.turn))
    && (state.seen[event.id] === undefined || state.turn - state.seen[event.id] >= ER.cooldown));
  const themed = contest ? available.filter(event => CONTEST_EVENTS.includes(event.id)) : [];
  return themed.length ? themed : available;
}
function pickEvent(state: GameState, contest: boolean, life = false) {
  const pool = eventCandidates(state, contest, life);
  if (!pool.length) return null;
  let pick = randInt(state, pool.reduce((sum, event) => sum + event.weight, 0));
  for (const event of pool) { pick -= event.weight; if (pick < 0) return event; }
  return null;
}

function beginEvent(state: GameState, id: string) {
  state.phase = 'event'; state.eventId = id; state.seen[id] = state.turn;
  Object.assign(state, beginFinanceEvent(state, id));
  const event = LIFE_EVENTS.find(row => row.id === id);
  if (event?.initial) applyEffect(state, { text: event.text }, event.initial);
  if (id === 'kid_wedding') {
    const kid = childFor(state, ER.weddingAge, true);
    if (kid >= 0) { state.timers[EK.kid] = kid; state.timers[EK.weddingSeen(kid)] = state.turn; }
  }
}

function land(state: GameState, result: Result): GameState {
  const node = nodeAt(state);
  state.board.step = 'space';
  if (node.kind === 'rankup' && state.status === 'working') {
    result.review = review(state);
    result.notes.push(CAREER_TEXT.review[result.review.outcome], ...result.review.locks);
  } else if (SETTLEMENT_KINDS.includes(node.kind)) {
    payLedger(state, result);
    result.notes.push(TEXT.settled);
    if (!estateOffers(state).length && !localFamilyEvents(state).length) state.board.step = 'bonus';
  } else if (node.kind === 'rest') {
    const before = state.s.stamina;
    setStat(state, 'stamina', before + homeRecovery(state).rest);
    result.restGain = state.s.stamina - before;
    result.notes.push(TEXT.rested); state.board.step = 'bonus';
  } else if (node.kind === 'luck') {
    const drawn = drawLuck(state);
    state = drawn.state;
    applyEffect(state, drawn.effect, drawn.effect.add ?? {});
    result.luck = { id: drawn.card.id, title: drawn.card.title, text: drawn.card.text };
    result.notes.push(TEXT.log(drawn.card.title, drawn.card.text));
    state.log.push({ turn: state.turn, text: TEXT.log(drawn.card.title, drawn.card.text), tone: 'info' });
  } else if (node.kind === 'event' || node.kind === 'contest') {
    const event = pickEvent(state, node.kind === 'contest');
    if (event) {
      beginEvent(state, event.id); result.eventId = event.id;
    }
  }
  return state;
}

function travel(state: GameState, destination: string, result: Result): GameState {
  const applied = applyAssetMove(eventCarState(state), destination, { canPromote, stopFor });
  applied.state.s.car = state.s.car;
  return arrive(applied.state, applied.move, result, state.board.pos);
}

function arrive(state: GameState, move: Move, result: Result, origin: string): GameState {
  result.move = move;
  const path = move.path.slice(0, move.path.indexOf(state.board.pos) + 1);
  for (const id of path) state.board.visited |= 1 << MAP_IDS.indexOf(BY_ID.get(id)!.map);
  // applyMove includes arrivals in passed; ledger clearing makes arrival settlement idempotent.
  for (const kind of SETTLEMENT_KINDS) {
    for (const _node of move.passed[kind as 'pay' | 'start']) payLedger(state, result);
  }
  for (const id of move.passed.start) {
    const map = BY_ID.get(id)!.map, from = path[path.indexOf(id) - 1] ?? origin;
    if (move.steps > 0 && BY_ID.get(from)!.map === map) state.board.laps |= 1 << MAP_IDS.indexOf(map);
    const before = state.s.money;
    state = passStart(state, BY_ID.get(id)!.map);
    const amount = state.s.money - before;
    if (amount) {
      const paid = result.upkeep ??= { lines: [], total: 0 };
      paid.lines.push({ label: ECONOMY_TEXT.lap, amount }); paid.total += amount;
    }
  }
  if (state.timers[CARD_KEYS.again] === state.turn) {
    // A card armed before rolling gives two moves but only the final tile action.
    delete state.timers[CARD_KEYS.again]; state.board.step = 'spin'; state.board.dice = [];
    result.notes.push(CARD_TEXT.again);
  } else state = land(state, result);
  if (move.passed.start.length) state = afterStartPass(state);
  return state;
}

/** Express travel lands on a start tile: settle once, then use only the destination's bonus slot. */
function express(state: GameState, destination: string, result: Result): GameState {
  const origin = state.board.pos, node = BY_ID.get(destination)!;
  state.board.pos = destination;
  state.board.visited |= 1 << MAP_IDS.indexOf(node.map);
  if (node.map === S.map) state.flags = state.flags.filter(flag => flag !== S.invite);
  state = arrive(state, { node: destination, steps: 0, path: [destination], tolls: [S.expressFare],
    fare: S.expressFare, via: origin, passed: { pay: [], start: [destination] } }, result, origin);
  state.board.step = 'bonus';
  return state;
}

function applyEffect(state: GameState, effect: Effect, add: StatMap): string | undefined {
  for (const [stat, value] of entries(add)) setStat(state, stat, state.s[stat] + value);
  for (const [stat, value] of entries(effect.set)) setStat(state, stat, value);
  const flag = effect.flag && !state.flags.includes(effect.flag) ? effect.flag : undefined;
  if (flag) state.flags.push(flag);
  if (effect.flag === FAMILY_RULES.partner && state.family.partnerAt === null) state.family.partnerAt = state.turn;
  if (effect.status) state.status = effect.status;
  if (effect.track !== undefined && effect.track !== state.track) {
    state.track = effect.track;
    const track = TRACKS.find(row => row.id === state.track);
    const rank = track ? entryRank(state, track, 'tile') : JOB_RULES.entryRank;
    state.job = { rank, perf: JOB_RULES.entryPerf, tenure: 0, total: 0, warn: 0, changedAt: state.turn,
      tracks: track ? [...new Set([...state.job.tracks, track.id])] : [...state.job.tracks] };
    state.s.rank = Math.min(rank, STAT_MAX.rank!);
    for (const key of [CAREER_KEYS.retry, CAREER_KEYS.bonus, CAREER_KEYS.idle, CAREER_KEYS.worked,
      CAREER_KEYS.deferred, CAREER_KEYS.benefitUntil, CAREER_KEYS.pension, CAREER_KEYS.chairStarted, JOB_RULES.retirementBase]) delete state.timers[key];
    state.flags = state.flags.filter(flag => flag !== CAREER_KEYS.rehire);
  }
  // Imported v1 achievement endings cannot shorten the T03 lifetime either.
  settle(state);
  return flag;
}

function play(state: GameState, r: Resolved, v: OptionView, branch: BranchId, runHooks: boolean, singleDie = false, automatic = false): { state: GameState; result: Result } {
  const id = baseOptionId(v.id);
  const history = state;
  state = recordAchievements(state);
  const before = { ...state.s }, success = branch === 'success', crashed = branch === 'crash';
  const side = success ? 'success' : 'fail';
  const effect = branch === 'sure' ? r.choice.effect! : r.choice.roll![side];
  const eventBefore = state.eventId, stepBefore = state.board.step, hunterBonus = state.timers[EK.headhunter];
  const outcome = branch === 'sure' ? v.sure! : v.roll![side];
  const shortcut = id.startsWith('luck:shortcut:') ? shortcutMoves(state)
    .find(move => BY_ID.get(move.node)!.kind === id.split(':')[2]) : undefined;
  const result: Result = { optionId: v.id, title: v.title, place: v.place, free: v.free, text: effect.text,
    deltas: {}, crashed, notes: [], statusFrom: state.status, statusTo: state.status, trackFrom: state.track, trackTo: state.track };
  if (v.roll?.ticks) state.board.dial = dialNotch(v.id)!;
  state.s.money -= v.cost; state.s.stamina = Math.max(0, state.s.stamina - v.tire);
  if (r.card) state = applyCardChoice(state, id);
  state = consumeLuck(state, id, !!v.roll, !v.free);
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
  const job = isJobChoice(id);
  const flag = applyEffect(state, job ? { ...effect, status: undefined, track: undefined } : effect, outcome.add);
  if (job) {
    const oldTrack = state.track;
    state = applyJobChoice(state, id, branch === 'sure' || success);
    if (id.startsWith('job:')) delete state.timers[E2K.jobs];
    if (hunterBonus !== undefined && id.startsWith('job:')) {
      if (oldTrack !== state.track) setStat(state, 'money', state.s.money + hunterBonus);
      delete state.timers[EK.headhunter];
    }
  }
  else if (id.startsWith('act:')) {
    if (success) state = electionWin(state, id.slice('act:'.length));
    if (id === `act:${S.videoId}` && success) randInt(state, S.fanMax - S.fanMin + 1);
    if (state.board.step === 'space' && nodeAt(state).kind === 'job') {
      state = performance(state, branch === 'sure' || success ? 'workSuccess' : 'workFailure');
    } else if (state.board.step === 'bonus' && CAREER_ACTIONS.includes(id.slice('act:'.length))) {
      state = performance(state, 'extra');
    }
  }
  if (id.startsWith('lifestyle:')) state = applyEconomyChoice(state, id);
  if (r.home) state = afterEventHome(applyHomeChoice(state, r.home), r.home);
  if (!r.card && (/^(biz:|fund:|luck:)/.test(id) || id === 'skip')) {
    state = afterEventAsset(applyAssetChoice(state, id, v.cost), id, v.cost);
    state = afterFundEvent(state, id);
  }
  if (r.family) {
    const phase = state.phase;
    state = applyFamilyChoice({ ...state, phase: 'action' }, id, branch === 'sure' || success); state.phase = phase;
  }
  if (r.eventPopup) delete state.timers[EK.popup];
  const extra = (effect as LifeEffect).extra as EventExtra2 | undefined;
  if (extra) {
    state = businessEventEffect(careerEventEffect(homeEventEffect(familyEventEffect(state, extra), extra), extra), extra);
    state = lateEventEffect(travelEventEffect(healthEventEffect(financeEventEffect(state, extra), extra), extra), extra);
    if (extra.popup && extra.popup !== 'headhunter') state.timers[EK.popup] = EK.popupIds.indexOf(extra.popup) + 1;
  }
  state = recordAchievements(history, recordEndingEffect(state, effect.end, eventBefore, extra?.points));
  if (flag) result.flag = flag;
  if (!v.free && (r.kind !== 'board' || id === 'skip')) state.s.acts++;
  if (extra?.skipSeasons) {
    // Forecast runs these exact closes on its detached copy, including seeded annual accounting.
    for (let i = 0; i < extra.skipSeasons && state.turn < LIFE_RULES.maxTurns; i++) {
      state = endSeason(state, result, true, i === extra.skipSeasons - 1);
    }
  }
  if (id === ENDING_RULES.earlyId) {
    state = retireEarly(state); result.ended = state.ending!;
    result.season = { from: dateLabel(history.turn), to: dateLabel(state.turn), refill: 0, accrual: [] };
  }
  result.deltas = diff(before, state.s);
  const afterOption = { ...state.s };
  state.log.push({ turn: state.turn, text: TEXT.log(v.title, result.text), tone: branch === 'sure' ? 'info' : success ? 'good' : 'bad' });
  if (extra?.skipSeasons || job || (v.free && !r.life)) {
    // jobs.ts owns popup continuation; entry never consumes the extra action or a season.
  } else if (shortcut) {
    state.board.pos = shortcut.node;
    state = arrive(state, shortcut, result, history.board.pos);
  } else if (id.startsWith('family:event:')) {
    beginEvent(state, id.slice('family:event:'.length)); result.eventId = state.eventId!;
  } else if (id.startsWith('family:go:')) {
    // Consume the ordinary spin, then use this season's tile and bonus at the invited destination.
    state = rollAssetDice(state);
    const destination = id.slice('family:go:'.length), origin = state.board.pos;
    state.board.pos = destination;
    state = arrive(state, { node: destination, steps: 0, path: [destination], tolls: [S.expressFare],
      fare: S.expressFare, via: origin, passed: { pay: [], start: [] } }, result, origin);
  } else if (id === 'spin') {
    state = rollAssetDice(state); state.board.step = 'pick';
    // T14 counterfactual: preserve RNG consumption, move by the first roulette alone before auto-travel.
    if (singleDie) state.board.dice = [state.board.dice[0]!];
    const moves = reachable(state);
    if (moves.length === 1) state = travel(state, moves[0].node, result);
    else if (!moves.length) state = land(state, result);
  } else if (id.startsWith('go:')) state = travel(state, id.slice('go:'.length), result);
  else if (id.startsWith('express:')) state = express(state, id.slice('express:'.length), result);
  else if (state.phase === 'event') {
    if (stepBefore !== 'spin' && CONTEST_EVENTS.includes(eventBefore!) && nodeAt(state).kind === 'contest' && success) {
      state.board.contests++;
      state = performance(state, 'contest');
    }
    state.phase = 'action'; state.eventId = null; state.board.step = stepBefore === 'spin' ? 'spin' : 'bonus';
    delete state.timers[EK.kid];
  } else if (state.board.step === 'bonus') state = endSeason(state, result, runHooks);
  else state.board.step = 'bonus';
  // Empty extra-action menus are an automatic close, never another confirmation.
  // Resolve all pending family/job/event choices first; disabled activities cannot block a close.
  if (effect.grantCard) {
    state = grantCard(state, effect.grantCard);
    result.notes.push(cardGainText(state, effect.grantCard));
  }
  if (automatic && !r.card && emptyBonus(state)) state = endSeason(state, result, runHooks);
  state = recordAchievements(state);
  result.statusTo = state.status; result.trackTo = state.track;
  const settlement = diff(afterOption, state.s);
  if (Object.keys(settlement).length || result.season || result.upkeep || result.restGain !== undefined) result.settle = { deltas: settlement };
  if (state.log.length > LIFE_RULES.logMax) state.log.splice(0, state.log.length - LIFE_RULES.logMax);
  state = eventIncomeState(state);
  if (r.card || effect.grantCard || r.life || r.eventPopup || hunterBonus !== undefined || id === ENDING_RULES.earlyId) result.effects = eventState(state);
  return { state, result };
}

export function choose(prev: GameState, optionId: string, menu: 'board' | 'phone' = 'board', singleDie = false, automatic = false): { state: GameState; result: Result } {
  const { r, v } = resolveOption(prev, optionId, menu, automatic);
  if (!v.enabled) throw new Error(TEXT.disabled(optionId, v.locks));
  const state = structuredClone(prev);
  let branch: BranchId = 'sure', roll: Result['roll'];
  if (v.roll) {
    const value = randInt(state, LIFE_RULES.percent), success = value < v.roll.chance;
    roll = { chance: v.roll.chance, value, success, ...(v.roll.ticks && { ticks: v.roll.ticks, crashPct: v.roll.crashPct }) };
    branch = success ? 'success' : 'fail';
    if (v.roll.ticks) {
      if (value >= v.roll.ticks.success + v.roll.ticks.fail) branch = 'crash';
    } else if (!success && r.flight && randInt(state, LIFE_RULES.percent) < (v.roll.crashPct ?? 0)) branch = 'crash';
  }
  const played = play(state, r, v, branch, true, singleDie, automatic);
  if (roll) played.result.roll = roll;
  return played;
}

/** Previews share the same branch executor; neither RNG nor hooks on the live run are touched. */
export function forecast(prev: GameState, optionId: string, menu: 'board' | 'phone' = 'board', automatic = false): Forecast {
  const { r, v } = resolveOption(prev, optionId, menu, automatic);
  const ids: BranchId[] = v.roll ? ['success', 'fail'] : ['sure'];
  if (v.roll?.ticks ? v.roll.ticks.crash > 0 : v.roll?.crashPct) ids.push('crash');
  if (v.roll?.ticks?.fail === 0) ids.splice(ids.indexOf('fail'), 1);
  const branches = ids.map((id): Forecast['branches'][number] => {
    const state = structuredClone(prev);
    state.s.money = Math.max(state.s.money, v.cost);
    const { result } = play(state, r, v, id, false, false, automatic);
    return { id, deltas: result.deltas, endsSeason: !!result.season,
      ...(result.season && { accrual: result.season.accrual }), ...(result.flag && { flag: result.flag }),
      ...(result.statusTo !== result.statusFrom && { status: result.statusTo }),
      ...(result.trackTo !== result.trackFrom && { track: result.trackTo }), ...(result.ended && { end: result.ended }),
      ...(result.effects && { effects: result.effects }) };
  });
  return { cost: v.cost, tire: v.tire, branches, ...(v.roll?.ticks && { ticks: v.roll.ticks }),
    ...(optionId === 'spin' && { die: RULES.board.die }),
    ...(v.roll && { chance: v.roll.chance }), ...(v.roll?.crashPct !== undefined && { crashPct: v.roll.crashPct }) };
}
