import { ECONOMY_KEYS } from './economy.ts';
import { BOARD_CHOICES, EDU, FAMILY_KEYS as K, FAMILY_RULES as R, FAMILY_TEXT as T, GIFTS,
  HAPPY_YEAR as H, HOMES, INDEPENDENCE, LEISURE, LIFE_RULES, STAT_MAX, WEDDINGS } from './life-data.ts';
import { MAPS, PLACES, WORLD } from './world.ts';
import { SPECIAL_RULES } from './tracks.ts';
import type { Choice, GameState } from './types.ts';

type Kid = GameState['family']['kids'][number];
type FamilyChoice = { id: string; choice: Choice; locks: string[] };
const seasons = LIFE_RULES.seasons.length;
// Use elapsed seasons, as the existing childcare ledger does; milestones open at the first spring of that age.
const kidAge = (turn: number, kid: Kid) => Math.floor((turn - kid.born) / seasons);
const dependents = (state: GameState, turn = state.turn) =>
  state.family.kids.filter(kid => kidAge(turn, kid) < R.independentAge).length;
const independent = (kid: Kid) => [...INDEPENDENCE].reverse().find(row => kid.pts >= row.min)!;
const happy = (state: GameState, amount: number) => {
  state.s.happy = Math.max(0, Math.min(STAT_MAX.happy!, state.s.happy + amount));
};

export const familyRecovery = (state: GameState) =>
  state.family.marriedAt !== null && !state.family.dual ? R.focusRecovery : 0;
export const familyAchievementPoints = (state: GameState) => state.family.kids.reduce((sum, kid, index) =>
  sum + (state.feats.includes(R.feat(index)) ? independent(kid).points : 0), 0);

export function familyPopup(state: GameState): { kind: 'dual' | 'edu' | 'gift'; kid: number } | null {
  if (state.phase !== 'action') return null;
  if (state.timers[K.dual] !== undefined) return { kind: 'dual', kid: -1 };
  if (state.board.step !== 'spin' || state.turn % seasons !== LIFE_RULES.spring) return null;
  const kid = state.family.kids.findIndex(child => child.stage < R.independentStage
    && kidAge(state.turn, child) >= (EDU.at(child.stage)?.age ?? R.independentAge));
  return kid < 0 ? null : { kind: state.family.kids[kid].stage < EDU.length ? 'edu' : 'gift', kid };
}

/** Exclusive family cards preserve the interrupted board slot and always have a free default. */
export function familyChoices(state: GameState): { choices: FamilyChoice[]; exclusive: boolean } {
  const choices: FamilyChoice[] = [], popup = familyPopup(state);
  const add = (id: string, choice: Choice, locks: string[] = []) => choices.push({ id, choice, locks });
  const dual = () => T.dual.forEach((title, mode) => add(`dual:${mode}`, {
    title, desc: T.dualDesc[mode], effect: { text: T.dualDone },
  }));
  if (popup) {
    if (popup.kind === 'dual') dual();
    else if (popup.kind === 'edu') {
      const row = EDU.at(state.family.kids[popup.kid].stage)!;
      add('edu:0', { title: T.school, desc: T.educationDesc(popup.kid, row.age, 0, 0),
        effect: { text: T.educationDone } });
      add('edu:1', { title: T.academy, desc: T.academyDesc, effect: { text: T.educationDone } });
      add('edu:2', { title: row.title, desc: T.educationDesc(popup.kid, row.age, row.cost, R.specialPoints)
        + T.specialDesc, cost: row.cost, roll: { base: R.educationChance,
          success: { text: T.specialDone }, fail: { text: T.educationDone } } });
    } else {
      const reward = independent(state.family.kids[popup.kid]);
      GIFTS.forEach((gift, index) => add(`gift:${index}`, { title: T.gift(gift.cost), cost: gift.cost,
        desc: T.giftDesc(popup.kid, reward.happy + gift.happy, reward.points),
        effect: { text: T.independent, add: { happy: reward.happy + gift.happy } } }));
    }
    const fallback = choices[0].choice;
    add('skip', { ...fallback, title: BOARD_CHOICES.skip.title });
    return { choices, exclusive: true };
  }
  const node = WORLD.find(node => node.id === state.board.pos)!;
  if (state.phase !== 'action' || state.board.step !== 'space' || node.kind !== 'life') return { choices, exclusive: false };
  if (state.family.marriedAt !== null) dual();
  else {
    if (!state.flags.includes(R.partner) && state.family.partnerAt === null && R.datePlaces.includes(node.place)) {
      add('date', { title: T.date, desc: T.dateDesc, cost: R.dateCost,
        roll: { base: R.dateChance, mods: [{ stat: 'rep', over: 0, per: R.repPer, pct: 1, cap: R.repCap }],
          success: { text: T.partner, flag: R.partner }, fail: { text: T.missed } } });
    }
    if (state.family.partnerAt !== null && R.weddingPlaces.includes(node.place)) {
      const locks = [...(state.turn - state.family.partnerAt < R.wait ? [T.wait] : []),
        ...((state.home?.tier ?? 0) < R.marriageTier ? [T.home] : [])];
      WEDDINGS.forEach((row, index) => add(`wed:${index}`, { title: row.title, cost: row.cost,
        desc: T.weddingDesc(row.cost, row.add.happy), effect: { text: T.wedding, add: row.add } }, locks));
    }
  }
  if (node.place === R.babyPlace) {
    const locks = [...(state.family.marriedAt === null ? [T.married] : []),
      ...(LIFE_RULES.startAge + Math.floor(state.turn / seasons) > R.babyMaxAge ? [T.age] : []),
      ...(state.family.kids.length >= R.maxKids || dependents(state) >= (HOMES[state.home?.tier ?? 0]?.kids ?? 0)
        ? [T.capacity] : [])];
    add('baby', { title: T.baby, desc: T.babyDesc, cost: R.babyCost,
      effect: { text: T.babyDone, add: { happy: R.babyHappy } } }, locks);
  }
  for (const row of LEISURE) if ((row.places as readonly string[]).includes(node.place)) {
    const gain = Math.floor(row.happy * (state.family.marriedAt === null ? R.singlePct : LIFE_RULES.percent) / LIFE_RULES.percent);
    add(`leisure:${row.id}`, { title: row.title, cost: row.cost, desc: T.leisureDesc(row.cost, gain, row.stamina),
      effect: { text: T.leisureDone, add: { happy: gain, stamina: row.stamina } } });
  }
  return { choices, exclusive: false };
}

function syncEducation(state: GameState) {
  let fee = 0;
  state.family.kids.forEach((kid, index) => {
    const key = K.school(index), nextAge = EDU.at(kid.stage)?.age ?? R.independentAge;
    if (kid.stage >= R.independentStage || (state.turn % seasons === LIFE_RULES.spring
      && kidAge(state.turn, kid) >= nextAge)) delete state.timers[key];
    fee += state.timers[key] ?? 0;
  });
  state.timers[ECONOMY_KEYS.education] = fee;
}

/** The engine has already applied the displayed fee, flag and stat effect. */
export function applyFamilyChoice(prev: GameState, originalId: string, success: boolean): GameState {
  const state = structuredClone(prev), popup = familyPopup(state);
  const id = originalId === 'skip' && popup ? `${popup.kind}:0` : originalId;
  if (id === 'date' && success) state.family.partnerAt = state.turn;
  else if (id.startsWith('wed:')) {
    state.family.marriedAt = state.turn; state.timers[K.dual] = state.turn;
  } else if (id.startsWith('dual:')) {
    state.family.dual = id === 'dual:1'; delete state.timers[K.dual];
  } else if (id === 'baby') state.family.kids.push({ born: state.turn, pts: 0, stage: 0 });
  else if (popup && popup.kind !== 'dual') {
    const kid = state.family.kids[popup.kid];
    if (id.startsWith('edu:')) {
      const points = id === 'edu:1' ? R.schoolPoints : id === 'edu:2' ? R.specialPoints + (success ? R.extraPoints : 0) : 0;
      kid.pts = Math.min(R.maxPoints, kid.pts + points);
      kid.stage = (kid.stage + 1) as Kid['stage'];
      if (id === 'edu:1') state.timers[K.school(popup.kid)] = R.schoolFee;
      else delete state.timers[K.school(popup.kid)];
    } else if (id.startsWith('gift:')) {
      kid.stage = R.independentStage;
      if (!state.feats.includes(R.feat(popup.kid))) state.feats.push(R.feat(popup.kid));
    }
    syncEducation(state);
  }
  return state;
}

/** New spring turn, but happiness for dependent children belongs to the closing winter. */
export function yearEndFamily(prev: GameState): GameState {
  const state = structuredClone(prev);
  if (state.phase === 'ended' || !state.turn || state.turn % seasons !== LIFE_RULES.spring
    || state.timers[K.year] === state.turn) return state;
  const married = state.family.marriedAt !== null, kids = dependents(state, state.turn - 1);
  const home = HOMES[state.home?.tier ?? 0] ?? HOMES[0];
  const crowded = Number(married) + 1 > home.adults || kids > home.kids;
  happy(state, H.living[state.life] + home.happy + (married ? H.spouse + (state.family.dual ? 0 : H.homeFocus) : 0)
    + kids * H.child + (state.timers[K.exhausted] ?? 0) * H.exhausted + (state.s.debt ? H.debt : 0)
    + (state.status === 'jobless' ? H.jobless : 0)
    + (state.status === 'retired' && state.home?.map === R.resortMap ? H.retiredResort : 0) + (crowded ? H.crowded : 0));
  state.timers[K.lastExhausted] = state.timers[K.exhausted] ?? 0;
  state.timers[K.exhausted] = 0; state.timers[K.year] = state.turn;
  return state;
}

/** Called once after advancing the turn and before refilling stamina. */
export function advanceFamily(prev: GameState): GameState {
  const state = structuredClone(prev);
  if (state.phase === 'ended' || !state.turn || state.timers[K.season] === state.turn) return state;
  state.timers[K.season] = state.turn;
  if (state.s.stamina < R.exhaustedBelow) state.timers[K.exhausted] = (state.timers[K.exhausted] ?? 0) + 1;
  syncEducation(state);
  return yearEndFamily(state);
}

/** One optional family destination at season start. A visit replaces this season's spin. */
export function familyVisit(state: GameState): FamilyChoice | null {
  if (state.phase !== 'action' || state.board.step !== 'spin' || familyPopup(state)) return null;
  const kind = state.family.marriedAt !== null ? 'baby' : state.family.partnerAt !== null ? 'wedding' : 'date';
  const target = WORLD.find(node => node.map !== state.board.pos[0] && node.kind === 'life'
    && (kind === 'baby' ? node.place === R.babyPlace : kind === 'wedding'
      ? R.weddingPlaces.includes(node.place) : R.datePlaces.includes(node.place)));
  if (!target) return null;
  const at = { ...state, board: { ...state.board, step: 'space' as const, pos: target.id } };
  const activity = familyChoices(at).choices.find(row => row.id === kind || (kind === 'wedding' && row.id === 'wed:0'));
  if (!activity || activity.locks.length) return null;
  return { id: `family:go:${target.id}`, locks: [], choice: {
    title: T.visit(MAPS[target.map].name, PLACES[target.place].name),
    desc: T.visitDesc(T.visitReasons[kind], SPECIAL_RULES.expressFare), cost: SPECIAL_RULES.expressFare,
    effect: { text: T.visitReasons[kind] },
  } };
}
