// Bot players for the balance simulation (scripts/simulate.ts), the unit tests and the headless playtest
// (which asks a bot what to tap next and then taps the real button). They only read what a player sees:
// the option views, plus the public chance modifiers in data.ts.
import { ACTIONS } from './data.ts';
import { options } from './engine.ts';
import type { GameState, ItemKind, OptionView, Stat } from './types.ts';

export type Policy = {
  /** Option ids in priority order; the first one currently on offer is what the bot works towards. */
  goals: string[];
  /** Takes loans for goal costs. */
  borrow: boolean;
  /** Highest item levels it buys for flight jobs. */
  items: Record<ItemKind, number>;
  /** Keeps training the stat behind a luck roll until the shown chance reaches this. */
  minChance: number;
  style: 'planner' | 'gambler' | 'drifter' | 'random';
};

const plan = (goals: string[], items: [number, number, number], extra: Partial<Policy> = {}): Policy =>
  ({ goals, borrow: true, items: { drone: items[0], gear: items[1], car: items[2] }, minChance: 60, style: 'planner', ...extra });

export const POLICIES: Record<string, Policy> = {
  ceo: plan(['co_ipo', 'corp_found', 'solo_register', 'st_exam'], [4, 3, 2]),
  chairman: plan(['dir_chair', 'dir_vice', 'assoc_run', 'assoc_join', 'st_exam'], [2, 1, 1]),
  academy: plan(['ac_accredit', 'inst_examiner', 'academy_found', 'inst_course', 'st_exam'], [1, 1, 0]),
  solo: plan(['solo_sales', 'solo_register', 'st_exam'], [4, 3, 2]),
  employee: plan(['emp_promo3', 'emp_promo2', 'emp_promo1', 'emp_apply', 'st_exam'], [1, 1, 0]),
  instructor: plan(['inst_examiner', 'inst_course', 'st_exam'], [1, 1, 0]),
  pilot: plan(['st_exam'], [3, 2, 2]),
  gambler: plan(['co_ipo', 'corp_found', 'solo_register', 'st_exam'], [5, 3, 3], { minChance: 0, style: 'gambler' }),
  drifter: plan([], [0, 0, 0], { borrow: false, style: 'drifter' }),
  random: plan([], [0, 0, 0], { style: 'random' }),
};

/** Expected change of one stat from an option, cost not included. */
function ev(o: OptionView, stat: Stat): number {
  if (o.roll) return ((o.roll.success.add[stat] ?? 0) * o.roll.chance + (o.roll.fail.add[stat] ?? 0) * (100 - o.roll.chance)) / 100;
  return o.sure?.add[stat] ?? 0;
}
const moneyEv = (o: OptionView) => ev(o, 'money') - o.cost;

const WORTH: Partial<Record<Stat, number>> = {
  rep: 8, net: 8, biz: 8, teach: 8, xp: 4, support: 10, students: 10, drone: 150, gear: 100, cond: 1, contracts: 60, staff: 60, value: 0.1, rank: 100,
};

function eventValue(o: OptionView): number {
  let v = moneyEv(o);
  for (const [stat, w] of Object.entries(WORTH) as [Stat, number][]) v += ev(o, stat) * w;
  const leaves = (x: { stage?: string } | undefined, weight: number) => (x?.stage ? weight : 0);
  return v - 500 * (leaves(o.sure, 1) + leaves(o.roll?.success, (o.roll?.chance ?? 0) / 100) + leaves(o.roll?.fail, 1 - (o.roll?.chance ?? 0) / 100));
}

const best = <T>(list: T[], score: (x: T) => number): T | undefined =>
  list.reduce<T | undefined>((top, x) => (top === undefined || score(x) > score(top) ? x : top), undefined);

/** The option id this policy plays next. `rand` returns a float in [0, 1) and is the bot's own luck, not the game's. */
export function pick(policy: Policy, state: GameState, rand: () => number): string {
  const opts = options(state);
  const on = opts.filter((o) => o.enabled);
  const byId = new Map(opts.map((o) => [o.id, o]));
  const anyOf = (list: OptionView[]) => list[Math.floor(rand() * list.length)].id;
  const turn = on.filter((o) => !o.free);

  if (policy.style === 'random') return anyOf(on);
  if (state.phase === 'event') {
    if (policy.style === 'drifter') return anyOf(on);
    if (policy.style === 'gambler') return (on.find((o) => o.roll) ?? on[0]).id;
    return best(on, eventValue)!.id;
  }
  if (policy.style === 'drifter') return anyOf(turn);

  const s = state.s;
  const enabled = (id: string) => byId.get(id)?.enabled === true;
  const room = () => (enabled('loan:500') ? 'loan:500' : enabled('loan:100') ? 'loan:100' : null);
  const earn = (saving: boolean): string => {
    if (!saving && s.debt > 0 && s.money >= 250 && enabled('repay:100')) return 'repay:100';
    const jobs = turn.filter((o) => o.id !== 'emp_quit' && o.id !== 'inst_quit');
    if (policy.style === 'gambler') return best(jobs, (o) => o.roll?.success.add.money ?? moneyEv(o))!.id;
    return best(jobs, moneyEv)!.id;
  };
  /** Covers a cost: borrow when the policy allows it and there is room, otherwise work for it. */
  const fund = (): string => (policy.borrow ? room() : null) ?? earn(true);
  /** Works towards an option: plays it when it is ready, otherwise goes after what it still lacks. */
  const pursue = (o: OptionView, depth: number): string | null => {
    if (o.enabled) {
      const mod = ACTIONS.find((a) => a.id === o.id)?.roll?.mods?.[0];
      if (o.roll && mod && o.roll.chance < policy.minChance && s[mod.stat] < mod.over + (mod.per * mod.cap) / mod.pct) {
        const trainer = best(turn.filter((t) => t.id !== o.id && ev(t, mod.stat) > 0), (t) => ev(t, mod.stat));
        if (trainer) return trainer.id;
      }
      return o.id;
    }
    const lack = o.missing[0];
    if (!lack || depth > 3) return null;
    if (lack.stat === 'money') return fund();
    const givers = opts.filter((g) => g.id !== o.id && g.kind !== 'bank' && ev(g, lack.stat) > 0);
    const ready = best(givers.filter((g) => g.enabled), (g) => ev(g, lack.stat) - g.cost / 1000);
    if (ready) return ready.id;
    const next = best(givers, (g) => ev(g, lack.stat));
    return next ? pursue(next, depth + 1) : null;
  };

  if (policy.style !== 'gambler' && s.cond < 60 && enabled('repair')) return 'repair';
  const flies = opts.some((o) => o.kind === 'job');
  if (flies && s.drone === 0 && policy.items.drone > 0) return pursue(byId.get('buy:drone')!, 0) ?? earn(true);
  // A company or an academy that loses money every quarter fixes that before it chases anything else.
  if (state.stage === 'company' && policy.style !== 'gambler') {
    if (s.contracts >= s.staff * 2 && enabled('co_hire')) return 'co_hire';
    if (s.contracts < 6 && s.money < 700) return 'co_sales';
  }
  if (state.stage === 'academy') {
    if (s.students >= 8 + s.staff * 8 - 2 && enabled('ac_hire')) return 'ac_hire';
    if (s.students < 26 && s.money < 300 && enabled('ac_ad')) return 'ac_ad';
  }
  if (s.money < 40 && s.debt > 0 && policy.style !== 'gambler') return earn(true);

  const goal = policy.goals.map((id) => byId.get(id)).find((o) => o !== undefined);
  const step = goal ? pursue(goal, 0) : null;
  if (step) return step;

  if (flies) {
    for (const kind of ['drone', 'gear', 'car'] as ItemKind[]) {
      const buy = byId.get(`buy:${kind}`);
      if (!buy || s[kind] >= policy.items[kind]) continue;
      if (buy.enabled && (policy.style === 'gambler' || s.money >= buy.cost + 60)) return buy.id;
      if (policy.style === 'gambler' && room()) return room()!;
    }
  }
  return earn(false);
}

/** Small deterministic float generator for the bots (kept apart from the game's own seeded luck). */
export function botRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x9e3779b9) >>> 0;
    let t = a ^ (a >>> 16);
    t = Math.imul(t, 0x21f0aaad);
    t ^= t >>> 15;
    t = Math.imul(t, 0x735a2d97);
    return ((t ^ (t >>> 15)) >>> 0) / 4294967296;
  };
}

/** Plays a whole run. Throws on a softlock (no enabled option, or a run that does not end). */
export function playRun(policy: Policy, state: GameState, step: (s: GameState, id: string) => GameState, seed: number): GameState {
  const rand = botRandom(seed);
  for (let i = 0; i < 3000 && state.phase !== 'ended'; i++) state = step(state, pick(policy, state, rand));
  if (state.phase !== 'ended') throw new Error('run did not end');
  return state;
}
