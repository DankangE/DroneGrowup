// §10 settlement and §2 early retirement. All public operations own detached copies.
import { CAREER_KEYS, careerIncome } from './career2.ts';
import { ledgerSum, netWorth, settle } from './economy.ts';
import { householdEventLines, improvementWorth } from './events-b.ts';
import { EVENT_KEYS, EVENT_TEXT } from './events-a.ts';
import { eventShopIncome } from './events-d.ts';
import { successionValue } from './events-h.ts';
import { rentalIncome } from './home.ts';
import { retirementView } from './jobs.ts';
import { ENDINGS2, ENDING_KEYS as K, ENDING_RULES as R, ENDING_TEXT as T, FAMILY_RULES,
  FEATS, HOME_RULES, LIFE_RULES, MAP_IDS, STAT_MAX, TEXT, TRACK_IDS } from './life-data.ts';
import { TRACKS } from './tracks.ts';
import { MAPS } from './world.ts';
import type { EndingCondition, EndingDef } from './life-data.ts';
import type { GameState } from './types.ts';

const has = (s: GameState, feat: string) => s.feats.includes(feat) || s.flags.includes(feat);
const remember = (s: GameState, feat: string) => { if (!s.feats.includes(feat)) s.feats.push(feat); };
const lastTrack = (s: GameState) => s.track ?? TRACK_IDS[(s.timers[K.lastTrack] ?? 0) - 1] ?? s.job.tracks.at(-1);

/** Remember milestones before a sale, demotion, career change or retirement erases their evidence. */
export function recordAchievements(prev: GameState, next: GameState = prev): GameState {
  const state = structuredClone(next);
  state.feats = [...new Set([...prev.feats, ...state.feats])];
  for (const snapshot of [prev, next]) {
    for (const [i, map] of MAP_IDS.entries()) {
      if (snapshot.board.visited & (1 << i)) remember(state, K.visit(map));
      if (snapshot.board.laps & (1 << i)) remember(state, K.lap(map));
    }
    if (snapshot.s.debt > 0) state.flags = [...new Set([...state.flags, K.borrowed])];
    if (snapshot.status === 'working' && snapshot.track) {
      state.timers[K.lastTrack] = TRACK_IDS.indexOf(snapshot.track) + 1;
      if (!state.job.tracks.includes(snapshot.track)) state.job.tracks.push(snapshot.track);
      const track = TRACKS.find(row => row.id === snapshot.track)!;
      if (snapshot.job.rank === track.ranks.length - 1) remember(state, K.top(track.id));
    }
    if ((snapshot.home?.tier ?? 0) >= HOME_RULES.ownedTier || snapshot.estates.length) remember(state, 'home');
    if (snapshot.family.marriedAt !== null) remember(state, 'marriage');
    if (new Set(snapshot.holdings.map(row => row.id)).size >= FEATS.three_shops.count) remember(state, 'three_shops');
    snapshot.family.kids.forEach((kid, index) => {
      if (kid.stage === FAMILY_RULES.independentStage) remember(state, FAMILY_RULES.feat(index));
    });
  }
  if (prev.flags.includes(K.borrowed)) state.flags = [...new Set([...state.flags, K.borrowed])];
  if (new Set(state.job.tracks).size >= FEATS.three_jobs.count) remember(state, 'three_jobs');
  for (const [id, flag] of Object.entries(R.achievementFlags)) if (state.flags.includes(flag)) remember(state, id);
  // A racer can earn the highest annual rank and retire in the very same close.
  const promotions = next.board.rankups - prev.board.rankups;
  if (prev.status === 'working' && prev.track && promotions > 0 && prev.track !== next.track
    && prev.job.rank + promotions === TRACKS.find(row => row.id === prev.track)!.ranks.length - 1) {
    remember(state, K.top(prev.track));
  }
  if (prev.track === 'public' && prev.status === 'working' && retirementView(prev).due
    && (next.status === 'retired' || next.flags.includes(CAREER_KEYS.rehire) || next.flags.includes(CAREER_KEYS.switched))) {
    remember(state, 'official');
  }
  return state;
}

/** Imported v1 goal effects are achievements, never immediate endings. Donation points already live in event_points. */
export function recordEndingEffect(prev: GameState, ending?: string, eventId?: string | null, points?: number): GameState {
  const state = structuredClone(prev);
  if (ending && R.achievementEndings.includes(ending)) {
    remember(state, ending);
    const flag = R.achievementFlags[ending];
    if (!state.flags.includes(flag)) state.flags.push(flag);
  }
  if (eventId === R.foundationEvent) {
    if (points === FEATS.foundation.points) remember(state, 'foundation');
    if (points === FEATS.scholarship.points) remember(state, 'scholarship');
  }
  return state;
}

export const finalNetWorth = (state: GameState) => netWorth(state) + improvementWorth(state) + successionValue(state);
export type FeatScore = { id: string; title: string; points: number };

export function achievementScore(prev: GameState) {
  const state = recordAchievements(prev), rows: FeatScore[] = [];
  const add = (id: string, title: string, points: number) => { if (points) rows.push({ id, title, points }); };
  for (const map of MAP_IDS) {
    if (has(state, K.visit(map))) add(K.visit(map), T.named(FEATS.visit.title, MAPS[map].name), FEATS.visit.points);
    if (has(state, K.lap(map))) add(K.lap(map), T.named(FEATS.lap.title, MAPS[map].name), FEATS.lap.points);
  }
  add('promotion', T.counted(FEATS.promotion.title, state.board.rankups), state.board.rankups * FEATS.promotion.points);
  add('contest', T.counted(FEATS.contest.title, state.board.contests), state.board.contests * FEATS.contest.points);
  for (const track of TRACKS) if (has(state, K.top(track.id))) {
    add(K.top(track.id), T.named(FEATS.top.title, track.name), FEATS.top.points);
  }
  for (const id of R.historyFeats) if (has(state, id)) add(id, FEATS[id].title, FEATS[id].points);
  state.family.kids.forEach((kid, index) => {
    if (has(state, FAMILY_RULES.feat(index))) {
      const points = [...FEATS.independent.levels].reverse().find(row => kid.pts >= row.min)!.points;
      add(FAMILY_RULES.feat(index), T.counted(FEATS.independent.title, index + 1), points);
    }
  });
  let donations = 0;
  for (const id of ['foundation', 'scholarship'] as const) if (has(state, id)) {
    add(id, FEATS[id].title, FEATS[id].points); donations += FEATS[id].points;
  }
  add('event', FEATS.event.title, Math.max(0, (state.timers[EVENT_KEYS.points] ?? 0) - donations));
  if ((state.phase === 'ended' || state.turn === LIFE_RULES.maxTurns) && !state.flags.includes(K.borrowed)
    && state.s.debt === 0 && state.s.money + ledgerSum(state) >= 0) add('no_loan', FEATS.no_loan.title, FEATS.no_loan.points);
  const total = rows.reduce((sum, row) => sum + row.points, 0);
  return { rows, total, capped: Math.min(R.featCap, total) };
}

function matches(state: GameState, rule: EndingCondition, worth: number): boolean {
  if ('worthBelow' in rule) return worth < rule.worthBelow;
  if ('worthAtLeast' in rule) return worth >= rule.worthAtLeast;
  if ('feat' in rule) return has(state, rule.feat);
  if ('tops' in rule) return rule.tops.some(track => has(state, K.top(track)));
  if ('happy' in rule) return state.s.happy >= rule.happy && state.family.kids
    .filter((kid, i) => kid.stage === FAMILY_RULES.independentStage || has(state, FAMILY_RULES.feat(i))).length >= (rule.independent ?? 0);
  if ('current' in rule) return state.track !== null && rule.current.includes(state.track);
  if ('last' in rule) {
    const track = lastTrack(state);
    return !!track && rule.last.includes(track) && (!rule.flag || state.flags.includes(rule.flag));
  }
  return rule.fallback;
}

export function endingFor(prev: GameState): EndingDef {
  const state = recordAchievements(prev), worth = finalNetWorth(state);
  return ENDINGS2.find(row => matches(state, row.rule, worth))!;
}

/** Read-only scoring also supplies the UI's grade and achievement names. */
export function settlementSummary(state: GameState) {
  const netWorth = finalNetWorth(state), achievements = achievementScore(state);
  const composition = { wealth: Math.max(0, netWorth), happiness: state.s.happy * R.happyPoints, achievements: achievements.capped };
  const score = composition.wealth + composition.happiness + composition.achievements;
  return { netWorth, score, composition, grade: R.grades.find(row => score >= row.min)!.grade,
    featScore: achievements.capped, feats: achievements.rows.map(row => row.title) };
}

export function finish(prev: GameState): GameState {
  if (prev.phase === 'ended') return structuredClone(prev);
  if (prev.turn < LIFE_RULES.maxTurns) throw new Error(T.tooSoon);
  let state = recordAchievements(prev, settle(prev));
  state.phase = 'ended'; state.eventId = null; state.board.step = 'spin'; state.board.dice = [];
  state.ending = endingFor(state).id;
  if (achievementScore(state).rows.some(row => row.id === 'no_loan')) remember(state, 'no_loan');
  state.score = settlementSummary(state).score;
  state.log.push({ turn: state.turn, text: state.timers[K.earlyAt] === undefined ? TEXT.finished : T.early.effect.text, tone: 'info' });
  state.log = state.log.slice(-LIFE_RULES.logMax);
  return state;
}

export const canRetireEarly = (state: GameState) => state.phase === 'action' && state.board.step === 'spin'
  && state.turn >= (R.earlyAge - LIFE_RULES.startAge) * LIFE_RULES.seasons.length && state.turn < LIFE_RULES.maxTurns;

/** No seasonal hooks, wages, interest, expenses or RNG: only the three specified passive incomes. */
export function retireEarly(prev: GameState): GameState {
  if (!canRetireEarly(prev)) throw new Error(T.unavailable);
  let state = recordAchievements(prev);
  const remaining = LIFE_RULES.maxTurns - state.turn, pension = careerIncome({ ...state, status: 'retired' }).pension;
  state.timers[K.earlyAt] = state.turn;
  state.status = 'retired';
  let income = 0;
  for (; state.turn < LIFE_RULES.maxTurns; state.turn++) {
    income += pension + rentalIncome(state)
      + (householdEventLines(state).find(line => line.label === EVENT_TEXT.improvedRent)?.amount ?? 0)
      + state.holdings.reduce((sum, shop) => sum + eventShopIncome(state, shop.id, shop.level), 0);
  }
  // Post once to the ledger so existing shortfalls, limits and settlement still follow the shared accounting rules.
  state.board.ledger[T.early.title] = (state.board.ledger[T.early.title] ?? 0) + income;
  state.s.happy = Math.min(STAT_MAX.happy!, state.s.happy + Math.floor(remaining / LIFE_RULES.seasons.length) * R.happyPerYear);
  state.s.capStamina = Math.min(state.s.capStamina, LIFE_RULES.staminaCaps[0].cap);
  state.s.stamina = Math.min(state.s.stamina, state.s.capStamina); state.s.acts = 0;
  return finish(state);
}
