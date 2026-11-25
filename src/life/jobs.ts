// T04–T05: job entry and career transitions own detached copies.
import { FLAG_LABEL, RULES } from '../game/data.ts';
import { LIFE_RULES, STAT_LABEL, STAT_MAX, TEXT } from './life-data.ts';
import { randInt } from './move.ts';
import { JOB_CHOICES, JOB_RULES, JOB_TEXT, START_CHOICES, TRACKS } from './tracks.ts';
import { MAPS, WORLD } from './world.ts';
import { CAREER_KEYS as K, CAREER_RULES as C, CAREER_TEXT as CT, careerAge, careerIncome, careerTrack,
  jobConditionLocks, promotionView, rankLocks, retirementView, review, reviewNotice, specialView } from './career2.ts';
import type { RetirementMode } from './career2.ts';
import type { ActionDef, Choice, Effect, GameState, Stat, StatMap, TrackDef, TrackId, WorldNode } from './types.ts';
export { jobConditionLocks, review } from './career2.ts';

export type JobSource = 'tile' | 'event' | 'headhunter';
export type JobOffer = { track: TrackDef; rank: number; pay: number; locked: string[]; guidance: boolean };
export type JobChoice = { id: string; choice: Choice; locks: string[] };
const nodeAt = (state: GameState) => WORLD.find(node => node.id === state.board.pos)!;
const entries = (map?: StatMap) => Object.entries(map ?? {}) as [Stat, number][];
const sourceAt = (state: GameState): JobSource => state.timers[JOB_RULES.popup] === JOB_RULES.popupHeadhunter
  ? 'headhunter' : state.timers[JOB_RULES.popup] === JOB_RULES.popupEvent ? 'event' : 'tile';

export function entryRank(state: GameState, track: TrackDef, source: JobSource = sourceAt(state)): number {
  if (track.id === 'instructor' && state.flags.includes(K.coach)) return JOB_RULES.careerRank;
  const cap = Math.min(track.ranks.length - 1, source === 'headhunter'
    ? state.job.rank : JOB_RULES.careerRank);
  for (let rank = cap; rank > JOB_RULES.entryRank; rank--) {
    if (!rankLocks(state, track, rank).length) return rank;
  }
  return JOB_RULES.entryRank;
}

function entryLocks(state: GameState, track: TrackDef, source: JobSource): string[] {
  const coach = track.id === 'instructor' && state.flags.includes(K.coach);
  const locks = coach ? [] : jobConditionLocks(state, track.entry);
  const age = LIFE_RULES.startAge + Math.floor(state.turn / LIFE_RULES.seasons.length);
  const max = JOB_RULES.maxAge[track.id];
  if (max !== undefined && age > max) locks.push(JOB_TEXT.age(max));
  if (state.s.money < (track.entryFee ?? 0)) locks.push(TEXT.moneyLock(track.entryFee!));
  if (state.status === 'retired' && !coach) locks.push(JOB_TEXT.retired);
  if (state.flags.includes(K.switched) && !C.switchTracks.includes(track.id)) locks.push(CT.switchLock);
  const wait = JOB_RULES.wait - (state.turn - state.job.changedAt);
  if (source === 'tile' && state.job.changedAt >= 0 && wait > 0) locks.push(JOB_TEXT.wait(wait));
  return locks;
}

function onHiringMap(state: GameState, track: TrackDef, source: JobSource): boolean {
  const node = nodeAt(state);
  return (track.maps === 'any' || track.maps.includes(node.map))
    && (track.tier !== JOB_RULES.specialistTier || node.kind === 'jobfair' || source !== 'tile');
}

function offerFor(state: GameState, track: TrackDef, source: JobSource): JobOffer {
  const rank = entryRank(state, track, source), map = MAPS[nodeAt(state).map];
  const payPct = !map.payTracks?.track || map.payTracks.track.includes(track.id) ? map.payPct : LIFE_RULES.percent;
  return { track, rank, pay: Math.floor(track.ranks[rank].salary * payPct / LIFE_RULES.percent),
    locked: entryLocks(state, track, source), guidance: track.tier === JOB_RULES.guidanceTier };
}

/** Salary order is based on the offered rank's base salary; ties retain table order. */
export function jobOffers(state: GameState, source: JobSource = sourceAt(state)): JobOffer[] {
  const offers = TRACKS.filter(track => track.id !== state.track && onHiringMap(state, track, source))
    .map(track => offerFor(state, track, source))
    .sort((a, b) => b.track.ranks[b.rank].salary - a.track.ranks[a.rank].salary);
  return [
    ...offers.filter(offer => !offer.locked.length).slice(0, JOB_RULES.candidates),
    ...offers.filter(offer => offer.locked.length === 1).slice(0, JOB_RULES.locked),
  ];
}

export function entryChance(state: GameState, track: TrackDef): number | undefined {
  if (!track.entryRoll) return undefined;
  let chance = track.entryRoll.base;
  for (const mod of track.entryRoll.mods ?? []) {
    chance += Math.min(mod.cap, Math.max(0, Math.floor((state.s[mod.stat] - mod.over) / mod.per) * mod.pct));
  }
  return Math.max(RULES.chanceMin, Math.min(RULES.chanceMax, chance));
}

function enter(state: GameState, track: TrackDef, source: JobSource) {
  const rank = entryRank(state, track, source);
  state.status = 'working'; state.track = track.id;
  state.job = { rank, perf: JOB_RULES.entryPerf, tenure: 0, total: 0, warn: 0, changedAt: state.turn,
    tracks: [...new Set([...state.job.tracks, track.id])] };
  // v1 effects still read this alias; job.rank is the v2 authority.
  state.s.rank = Math.min(rank, STAT_MAX.rank!);
  clearCareer(state);
  delete state.timers[K.benefitUntil]; delete state.timers[K.pension];
  if (track.id === 'instructor' && rank >= JOB_RULES.careerRank && !state.flags.includes('examiner')) {
    state.flags.push('examiner');
  }
}

/** Attempt entry without consuming a season. Failed exams pay the fee and preserve the old job. */
export function hire(prev: GameState, trackId: TrackId, source: JobSource = sourceAt(prev)): GameState {
  const track = TRACKS.find(row => row.id === trackId);
  if (!track || prev.phase === 'ended' || prev.track === trackId || track.tier === JOB_RULES.guidanceTier
    || !onHiringMap(prev, track, source) || entryLocks(prev, track, source).length) {
    throw new Error(JOB_TEXT.badJob(trackId));
  }
  const state = structuredClone(prev), chance = entryChance(state, track);
  state.s.money -= track.entryFee ?? 0;
  if (chance === undefined || randInt(state, LIFE_RULES.percent) < chance) enter(state, track, source);
  return state;
}

/** Quitting never erases changedAt: quitting cannot bypass the four-season hiring wait. */
export function quit(prev: GameState): GameState {
  const state = structuredClone(prev);
  if (state.status !== 'working' || state.phase === 'ended') return state;
  state.status = 'jobless'; state.track = null; state.s.rank = 0;
  Object.assign(state.job, { rank: 0, perf: 0, tenure: 0, total: 0, warn: 0 });
  clearCareer(state);
  return state;
}

export function starting(state: GameState): boolean {
  return state.turn === 0 && state.board.pos === LIFE_RULES.startNode && state.board.step === 'spin'
    && state.phase === 'action' && !state.flags.includes(JOB_RULES.started);
}

/** Event authors can open an offer overlay and later resume the existing tile/event. */
export function openJobOffers(prev: GameState, source: Exclude<JobSource, 'tile'> = 'event'): GameState {
  const state = structuredClone(prev);
  if (state.phase !== 'ended') state.timers[JOB_RULES.popup] = source === 'headhunter'
    ? JOB_RULES.popupHeadhunter : JOB_RULES.popupEvent;
  return state;
}

export function afterStartPass(prev: GameState): GameState {
  const state = structuredClone(prev);
  if (state.board.step === 'space' && nodeAt(state).kind === 'jobfair') return state;
  if (state.status === 'jobless' || (state.status === 'student' && state.flags.includes(JOB_RULES.degree))) {
    state.timers[JOB_RULES.popup] = JOB_RULES.popupPassed;
  }
  return state;
}

export function advanceStudies(prev: GameState): GameState {
  const state = structuredClone(prev), until = state.timers[JOB_RULES.schoolUntil];
  if (state.status === 'student' && until !== undefined && state.turn >= until
    && !state.flags.includes(JOB_RULES.degree)) state.flags.push(JOB_RULES.degree);
  return state;
}

function nextConditions(track: TrackDef, rank: number): string {
  const next = track.ranks[rank + 1];
  if (!next) return JOB_TEXT.noNext;
  // Show every requirement, including satisfied requirements, on the career ladder card.
  const conditions = entries(next.need.min).map(([stat, min]) => JOB_TEXT.requirement(STAT_LABEL[stat], min));
  for (const flag of next.need.flags ?? []) conditions.push(TEXT.flagLock(JOB_TEXT.flag[flag] ?? FLAG_LABEL[flag] ?? flag));
  if (next.tenure) conditions.push(JOB_TEXT.tenure(next.tenure));
  return conditions.join(JOB_TEXT.conditionSeparator) || JOB_TEXT.noNeed;
}

export function jobChoices(state: GameState): { choices: JobChoice[]; exclusive: boolean } {
  if (state.phase === 'ended') return { choices: [], exclusive: false };
  if (starting(state)) return { exclusive: true, choices: Object.entries(START_CHOICES)
    .map(([id, choice]) => ({ id: `start:${id}`, choice, locks: [] })) };
  const retiring = retirementView(state);
  if (retiring.due && !retiring.racer && state.timers[K.deferred] !== state.turn + 1) return {
    exclusive: true, choices: [...retiring.modes.map(mode => ({
      id: `retire:${mode}`, locks: [], choice: {
        title: mode === 'pension' ? CT.pension : mode === 'rehire' ? CT.rehireTitle : CT.switch,
        desc: mode === 'rehire' ? CT.rehireDesc : CT.pensionDesc(retiring.severance, mode === 'pension' ? retiring.pension : 0)
          + (mode === 'switch' ? CT.switchDesc : ''),
        effect: { text: mode === 'pension' ? CT.pensionDone : mode === 'rehire' ? CT.rehireDone : CT.switchDone },
      },
    })), { id: 'job:none', locks: [], choice: { title: CT.continue, desc: CT.deferRetirement,
      effect: { text: CT.deferRetirement } } }],
  };
  const notice = reviewNotice(state);
  if (notice) return { exclusive: true, choices: [{ id: 'job:none', locks: [], choice: {
    title: CT.continue, desc: notice.text, effect: { text: CT.reviewed },
  } }] };
  const node = nodeAt(state), popup = state.timers[JOB_RULES.popup];
  const tile = state.phase === 'action' && state.board.step === 'space';
  const menu = popup !== undefined || (tile && node.kind === 'jobfair');
  const choices: JobChoice[] = menu ? jobOffers(state).map(offer => {
    const { track, rank, pay, locked, guidance } = offer;
    const ladder = track.ranks.map(row => JOB_TEXT.rung(row.title, row.salary)).join(JOB_TEXT.ladderSeparator);
    const effect = { text: JOB_TEXT.hired(track.name), status: 'working' as const, track: track.id,
      ...(track.id === 'instructor' && rank >= JOB_RULES.careerRank && { flag: 'examiner' }) };
    return { id: `job:${track.id}`, locks: guidance ? [...locked, JOB_TEXT.guidance] : locked,
      choice: { title: guidance ? JOB_TEXT.guideTitle(track.name) : JOB_TEXT.title(track.name, track.ranks[rank].title),
        desc: JOB_TEXT.card(ladder, track.ranks[rank].salary, pay, nextConditions(track, rank)),
        cost: track.entryFee,
        ...(track.entryRoll ? { roll: { ...track.entryRoll,
          success: { ...track.entryRoll.success, status: 'working' as const, track: track.id } } } : { effect }),
      } };
  }) : [];
  if (menu) choices.push({ id: 'job:none', choice: JOB_CHOICES.none, locks: [] });
  if (tile && (node.kind === 'jobfair' || node.kind === 'rankup') && state.status === 'working') {
    choices.push({ id: 'quit', choice: JOB_CHOICES.quit, locks: [] });
  }
  if (tile && node.kind === 'rankup' && state.status === 'working') {
    const promotion = promotionView(state);
    choices.push({ id: promotion.id, locks: promotion.locks, choice: { title: CT.promo,
      desc: CT.promoDesc(promotion.title, promotion.chance), roll: { base: promotion.chance,
        success: { text: CT.passed }, fail: { text: CT.failed } } } });
  }
  return { choices, exclusive: menu };
}

export const isJobChoice = (id: string) => id.startsWith('start:') || id.startsWith('job:') || id === 'quit'
  || id === 'promo' || id.startsWith('retire:');

/** Engine has already charged the fee; this branch executor also serves forecast without RNG. */
export function applyJobChoice(prev: GameState, id: string, success: boolean): GameState {
  let state = structuredClone(prev);
  if (id === 'job:none' && retirementView(state).due && state.timers[K.deferred] !== state.turn + 1) {
    state.timers[K.deferred] = state.turn + 1; return state;
  }
  if (id === 'job:none' && reviewNotice(state)) {
    delete state.timers[K.notice]; delete state.timers[K.noticeAt]; return state;
  }
  if (id.startsWith('retire:')) return retire(state, id.slice('retire:'.length) as RetirementMode);
  if (id === 'promo') {
    state = promotionResult(state, success); state.board.step = 'bonus'; return state;
  }
  if (id.startsWith('start:')) {
    state.flags.push(JOB_RULES.started);
    state.status = id === 'start:school' ? 'student' : 'jobless';
    if (id === 'start:school') state.timers[JOB_RULES.schoolUntil] = state.turn + JOB_RULES.studySeasons;
    if (id === 'start:self') state.timers[JOB_RULES.selfUntil] = state.turn + JOB_RULES.studySeasons;
    if (id === 'start:work') state.timers[JOB_RULES.popup] = JOB_RULES.popupStart;
    return state;
  }
  if (id === 'quit') state = quit(state);
  else if (id !== 'job:none' && success) enter(state, TRACKS.find(track => `job:${track.id}` === id)!, sourceAt(state));
  if (state.timers[JOB_RULES.popup] !== undefined) delete state.timers[JOB_RULES.popup];
  else state.board.step = 'bonus';
  return state;
}

/** Starting benefits affect returned choices; the UI never calculates their rewards. */
export function startingAction(state: GameState, action: ActionDef, tile: boolean): ActionDef {
  const school = state.status === 'student' && state.timers[JOB_RULES.schoolUntil] > state.turn
    && tile && nodeAt(state).kind === 'train' && nodeAt(state).map === 'A';
  const partTime = JOB_RULES.partTimeActions.some(id => id === action.id);
  const self = state.timers[JOB_RULES.selfUntil] > state.turn && partTime;
  const jobless = state.status === 'jobless' && action.when.status?.includes('student');
  if (!school && !self && !jobless) return action;
  const scale = (effect: Effect): Effect => ({ ...effect, add: Object.fromEntries(entries(effect.add).map(([stat, value]) =>
    [stat, value > 0 && ((school && JOB_RULES.studyStats.includes(stat)) || (self && stat === 'money'))
      ? Math.floor(value * (school ? JOB_RULES.studyPct : JOB_RULES.selfPct) / LIFE_RULES.percent) : value])) });
  return { ...action, ...(jobless && { when: { ...action.when, status: [...action.when.status!, 'jobless'] } }),
    ...(action.effect && { effect: scale(action.effect) }),
    ...(action.roll && { roll: { ...action.roll, success: scale(action.roll.success), fail: scale(action.roll.fail) } }) };
}

function clearCareer(state: GameState): void {
  for (const key of [K.retry, K.bonus, K.idle, K.worked, K.deferred]) delete state.timers[key];
  state.flags = state.flags.filter(flag => flag !== K.rehire);
}

function changeRank(state: GameState, rank: number): void {
  if (rank > state.job.rank) state.board.rankups += rank - state.job.rank;
  Object.assign(state.job, { rank, perf: JOB_RULES.entryPerf, tenure: 0, warn: 0 });
  state.s.rank = Math.min(rank, STAT_MAX.rank!);
  delete state.timers[K.retry];
  if (state.track === 'instructor' && rank >= JOB_RULES.careerRank && !state.flags.includes('examiner')) {
    state.flags.push('examiner');
  }
}

export type PerformanceSource = keyof typeof C.performance;
/** Action/event authors call this after resolving an outcome; no random numbers are consumed. */
export function performance(prev: GameState, source: PerformanceSource | number): GameState {
  const delta = typeof source === 'number' ? source : C.performance[source];
  if (!Number.isSafeInteger(delta)) throw new Error(CT.badPerformance);
  const state = structuredClone(prev);
  if (!careerTrack(state) || state.phase === 'ended') return state;
  state.job.perf = Math.max(C.perfMin, Math.min(C.perfMax, state.job.perf + delta));
  if (source === 'workSuccess' || source === 'workFailure') {
    state.timers[K.worked] = state.turn + 1;
    state.timers[K.idle] = 0;
  }
  return state;
}

/** Compatible with move.ts's injected stop predicate, including a prospective destination node. */
export function canPromote(state: GameState, node: WorldNode = nodeAt(state)): boolean {
  return promotionView(state, node).enabled;
}

function promotionResult(prev: GameState, success: boolean): GameState {
  const state = structuredClone(prev);
  delete state.timers[K.bonus];
  if (success) changeRank(state, state.job.rank + 1);
  else {
    state.job.perf = Math.max(C.perfMin, state.job.perf + C.failedPerf);
    state.timers[K.retry] = state.turn + C.retrySeasons;
  }
  return state;
}

/** Direct API and choose('promo') share the same exact odds and branch executor. */
export function promote(prev: GameState): GameState {
  if (!canPromote(prev)) throw new Error(CT.badPromotion);
  const state = structuredClone(prev), chance = promotionView(state).chance;
  return promotionResult(state, randInt(state, LIFE_RULES.percent) < chance);
}

export function special(prev: GameState): GameState {
  const state = structuredClone(prev);
  if (specialView(state).enabled) changeRank(state, state.job.rank + 1);
  return state;
}

/** Events may demote immediately; bottom-rank dismissal uses the same benefit grant as review. */
export function demote(prev: GameState): GameState {
  let state = structuredClone(prev);
  const track = careerTrack(state);
  if (!track || state.phase === 'ended') return state;
  if (state.job.rank > JOB_RULES.entryRank) changeRank(state, state.job.rank - 1);
  else if (track.salaried) {
    state = quit(state);
    state.timers[K.benefitUntil] = state.turn + C.benefitSeasons;
  }
  return state;
}

/** Called with the new spring turn. Repeated calls in the same year cannot pay twice. */
export function yearEndReview(prev: GameState): GameState {
  let state = structuredClone(prev);
  if (state.phase === 'ended' || state.turn === 0 || state.turn % LIFE_RULES.seasons.length !== LIFE_RULES.spring
    || state.timers[K.reviewed] === state.turn) return state;
  state.timers[K.reviewed] = state.turn;
  const completedAge = careerAge({ ...state, turn: state.turn - 1 });
  if (state.track === 'racer' && completedAge >= C.racerDeclineAge) state = performance(state, C.racerDecline);
  const evaluated = review(state), oldWarning = state.job.warn;
  if (evaluated.outcome === 'excellent') {
    state.s.money = Math.min(LIFE_RULES.statMax, state.s.money + evaluated.bonus);
    state.timers[K.bonus] = C.excellentBonus;
  }
  if (evaluated.outcome === 'warning') state.job.warn = 1;
  else if (evaluated.outcome === 'dismissal') state = demote(state);
  else if (evaluated.outcome === 'demotion' || evaluated.outcome === 'promotion') changeRank(state, evaluated.rank);
  else if (evaluated.clearWarning) state.job.warn = 0;
  if (evaluated.outcome !== 'none' && (evaluated.outcome !== 'normal' || oldWarning !== state.job.warn)) {
    state.timers[K.notice] = C.reviewOutcomes.indexOf(evaluated.outcome);
    state.timers[K.noticeAt] = state.turn;
    state.log.push({ turn: state.turn, text: CT.review[evaluated.outcome]
      + (evaluated.locks.length ? JOB_TEXT.conditionSeparator + CT.maintenance(evaluated.locks) : ''),
    tone: evaluated.outcome === 'excellent' || evaluated.outcome === 'promotion' ? 'good' : 'info' });
    if (state.log.length > LIFE_RULES.logMax) state.log.splice(0, state.log.length - LIFE_RULES.logMax);
  }
  return state;
}

/** Pension/benefit accrual is exposed separately in careerIncome for T06 accounting. */
export function advanceCareer(prev: GameState): GameState {
  let state = structuredClone(prev);
  if (state.phase === 'ended' || state.turn === 0 || state.timers[K.season] === state.turn) return state;
  state.timers[K.season] = state.turn;
  const income = careerIncome({ ...state, turn: state.turn - 1 });
  for (const [label, amount] of [[CT.benefitLabel, income.unemployment], [CT.pensionLabel, income.pension]] as const) {
    if (amount) state.board.ledger[label] = (state.board.ledger[label] ?? 0) + amount;
  }
  if (state.timers[K.benefitUntil] <= state.turn) delete state.timers[K.benefitUntil];
  if (careerTrack(state)) {
    state.job.tenure++; state.job.total++;
    state.timers[K.idle] = state.timers[K.worked] === state.turn ? 0 : (state.timers[K.idle] ?? 0) + 1;
    if (state.timers[K.idle] >= C.idleSeasons) state = performance(state, C.idlePerf);
    if (state.s.stamina < C.exhaustedBelow) state = performance(state, C.exhaustedPerf);
  }
  state = yearEndReview(state);
  const retiring = retirementView(state);
  if (retiring.due && (retiring.racer || state.flags.includes(K.rehire))) state = retire(state, 'pension');
  return state;
}

/** Rehire defers severance until final retirement; final pay includes the 60% contract rate. */
export function retire(prev: GameState, mode: RetirementMode = 'pension'): GameState {
  const view = retirementView(prev);
  if (prev.phase === 'ended' || !view.due || (view.racer ? mode !== 'pension' : !view.modes.includes(mode))) {
    throw new Error(CT.badRetirement);
  }
  let state = structuredClone(prev);
  if (mode === 'rehire') {
    state.flags.push(K.rehire); delete state.timers[K.retry]; delete state.timers[K.bonus];
    return state;
  }
  state = quit(state);
  state.s.money = Math.min(LIFE_RULES.statMax, state.s.money + view.severance);
  delete state.timers[K.benefitUntil]; delete state.timers[JOB_RULES.popup];
  if (mode === 'switch') {
    if (!state.flags.includes(K.switched)) state.flags.push(K.switched);
    state = openJobOffers(state);
  } else {
    state.status = 'retired'; state.timers[K.pension] = view.pension;
    if (view.racer && !state.flags.includes(K.coach)) state.flags.push(K.coach);
  }
  return state;
}
