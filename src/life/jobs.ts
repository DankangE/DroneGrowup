// T04: offers and entry only. Public state transitions own detached copies.
import { FLAG_LABEL, RULES } from '../game/data.ts';
import { LIFE_RULES, STAT_LABEL, STAT_MAX, TEXT } from './life-data.ts';
import { randInt } from './move.ts';
import { JOB_CHOICES, JOB_RULES, JOB_TEXT, START_CHOICES, TRACKS } from './tracks.ts';
import { MAPS, WORLD } from './world.ts';
import type { ActionDef, Choice, Cond, Effect, GameState, Stat, StatMap, TrackDef, TrackId } from './types.ts';

export type JobSource = 'tile' | 'event' | 'headhunter';
export type JobOffer = { track: TrackDef; rank: number; pay: number; locked: string[]; guidance: boolean };
export type JobChoice = { id: string; choice: Choice; locks: string[] };
const nodeAt = (state: GameState) => WORLD.find(node => node.id === state.board.pos)!;
const entries = (map?: StatMap) => Object.entries(map ?? {}) as [Stat, number][];
const sourceAt = (state: GameState): JobSource => state.timers[JOB_RULES.popup] === JOB_RULES.popupHeadhunter
  ? 'headhunter' : state.timers[JOB_RULES.popup] === JOB_RULES.popupEvent ? 'event' : 'tile';

/** OR alternatives count as their cheapest missing branch, never as two AND gates. */
export function jobConditionLocks(state: GameState, cond: Cond): string[] {
  const locks: string[] = [];
  if (cond.status && !cond.status.includes(state.status)) locks.push(TEXT.statusLock);
  if (cond.track && (!state.track || !cond.track.includes(state.track))) locks.push(TEXT.trackLock);
  for (const [stat, min] of entries(cond.min)) {
    if (state.s[stat] < min) locks.push(TEXT.minLock(STAT_LABEL[stat], min, state.s[stat]));
  }
  for (const [stat, max] of entries(cond.max)) {
    if (state.s[stat] > max) locks.push(TEXT.maxLock(STAT_LABEL[stat], max));
  }
  const label = (flag: string) => JOB_TEXT.flag[flag] ?? FLAG_LABEL[flag] ?? flag;
  for (const flag of cond.flags ?? []) if (!state.flags.includes(flag)) locks.push(TEXT.flagLock(label(flag)));
  for (const flag of cond.notFlags ?? []) if (state.flags.includes(flag)) locks.push(TEXT.notFlagLock(label(flag)));
  if (cond.any) {
    const alternatives = cond.any.map(branch => jobConditionLocks(state, branch)).sort((a, b) => a.length - b.length);
    if (!alternatives.length) locks.push(TEXT.anyLock);
    else if (alternatives[0].length) {
      const best = [...alternatives[0]];
      best[0] = JOB_TEXT.either(alternatives.map(parts => parts.join(JOB_TEXT.conditionSeparator)));
      locks.push(...best);
    }
  }
  return locks;
}

function rankLocks(state: GameState, track: TrackDef, rank: number) {
  // v1 wins counts every successful roll; the racer ladder requires actual contest victories.
  const subject = track.id === 'racer' ? { ...state, s: { ...state.s, wins: state.board.contests } } : state;
  return jobConditionLocks(subject, track.ranks[rank].need);
}

export function entryRank(state: GameState, track: TrackDef, source: JobSource = sourceAt(state)): number {
  const cap = Math.min(track.ranks.length - 1, source === 'headhunter'
    ? state.job.rank : JOB_RULES.careerRank);
  for (let rank = cap; rank > JOB_RULES.entryRank; rank--) {
    if (!rankLocks(state, track, rank).length) return rank;
  }
  return JOB_RULES.entryRank;
}

function entryLocks(state: GameState, track: TrackDef, source: JobSource): string[] {
  const locks = jobConditionLocks(state, track.entry);
  const age = LIFE_RULES.startAge + Math.floor(state.turn / LIFE_RULES.seasons.length);
  const max = JOB_RULES.maxAge[track.id];
  if (max !== undefined && age > max) locks.push(JOB_TEXT.age(max));
  if (state.s.money < (track.entryFee ?? 0)) locks.push(TEXT.moneyLock(track.entryFee!));
  if (state.status === 'retired') locks.push(JOB_TEXT.retired);
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
  return { choices, exclusive: menu };
}

export const isJobChoice = (id: string) => id.startsWith('start:') || id.startsWith('job:') || id === 'quit';

/** Engine has already charged the fee; this branch executor also serves forecast without RNG. */
export function applyJobChoice(prev: GameState, id: string, success: boolean): GameState {
  let state = structuredClone(prev);
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
