import { WORLD } from './world.ts';
import type { Cond, GameState, MapId, Stat, WorldNode } from './types.ts';

const DIE_SIDES = 6;
const MIN_STEPS = 1;
const CAR_MINUS_LEVEL = 1;
const CAR_PLUS_LEVEL = 2;
const STEP_ADJUSTMENT = 1;
const CAR_TROUBLE = 'car_trouble';
const INVITE = 'invite';
const UNREACHABLE = 'Unreachable destination';
const RNG = { increment: 0x6d2b79f5, firstShift: 15, secondShift: 7, lastShift: 14,
  multiplier: 61, range: 4294967296 };
const MAP_INDEX: Record<MapId, number> = { A: 0, B: 1, C: 2, D: 3, E: 4, F: 5 };
const BY_ID = new Map(WORLD.map(node => [node.id, node]));

export type StopReason = 'review' | 'exam' | 'life';
/** canPromote stops on review tiles; stopFor names any other forced stop on the way. */
export type MoveOptions = { canPromote?: (state: GameState, node: WorldNode) => boolean;
  stopFor?: (state: GameState, node: WorldNode, spent: number) => StopReason | undefined };
// tolls[i] is the cumulative fare once path[i] is entered; fare === tolls.at(-1).
type Route = { node: string; steps: number; path: string[]; tolls: number[]; fare: number; via: string | null; invite?: true };
export type Move = Route & { passed: { pay: string[]; start: string[] }; stop?: string; stopReason?: StopReason };

/** The first intermediate tile that forces a stop. The origin and destination never do. */
export function firstStop(state: GameState, path: readonly string[], tolls: readonly number[], opts: MoveOptions):
  { stop: string; stopReason: StopReason } | undefined {
  for (const [index, id] of path.slice(0, -1).entries()) {
    const node = BY_ID.get(id)!;
    if (node.kind === 'rankup' && opts.canPromote?.(state, node)) return { stop: id, stopReason: 'review' };
    // stopFor sees the fares already paid on the way to this tile.
    const stopReason = opts.stopFor?.(state, node, tolls[index] ?? 0);
    if (stopReason) return { stop: id, stopReason };
  }
  return undefined;
}

// mulberry32, matching v1 without depending on its engine. Only integers enter state.
function nextRandom(state: GameState): number {
  state.rng = (state.rng + RNG.increment) >>> 0;
  let t = state.rng;
  t = Math.imul(t ^ (t >>> RNG.firstShift), t | 1);
  t ^= t + Math.imul(t ^ (t >>> RNG.secondShift), t | RNG.multiplier);
  return (t ^ (t >>> RNG.lastShift)) >>> 0;
}
/** Integer in 0..n-1; advances only rng on the caller's working copy. */
export const randInt = (state: GameState, n: number) => Math.floor((nextRandom(state) / RNG.range) * n);

/** Mutates only rng and board.dice on the caller's working copy. */
export function rollDice(state: GameState): [number, number] {
  const dice: [number, number] = [randInt(state, DIE_SIDES) + MIN_STEPS, randInt(state, DIE_SIDES) + MIN_STEPS];
  state.board.dice = dice;
  return dice;
}

export function carLevel(state: GameState): number {
  return state.timers[CAR_TROUBLE] > state.turn ? 0 : state.s.car;
}

/** The move is the sum of two roulettes. One die is the single-roulette counterfactual and a
 * one-step probe; three dice (the triple card) offer the sum of any two. A car shifts the sum by one. */
export function moveTotals(dice: readonly number[]): number[] {
  if (dice.length === 1) return [dice[0]];
  const totals = new Set<number>();
  for (let first = 0; first < dice.length; first++) {
    for (let second = first + 1; second < dice.length; second++) totals.add(dice[first] + dice[second]);
  }
  return [...totals];
}

export function stepsFor(dice: readonly number[], level: number): number[] {
  const steps = new Set<number>();
  for (const total of moveTotals(dice)) {
    steps.add(total);
    if (level >= CAR_MINUS_LEVEL) steps.add(Math.max(MIN_STEPS, total - STEP_ADJUSTMENT));
    if (level >= CAR_PLUS_LEVEL) steps.add(total + STEP_ADJUSTMENT);
  }
  return [...steps].sort((a, b) => a - b);
}

function meets(state: GameState, cond: Cond): boolean {
  return (!cond.status || cond.status.includes(state.status))
    && (!cond.track || (state.track !== null && cond.track.includes(state.track)))
    && Object.entries(cond.min ?? {}).every(([stat, min]) => (state.s[stat as Stat] ?? 0) >= min)
    && Object.entries(cond.max ?? {}).every(([stat, max]) => (state.s[stat as Stat] ?? 0) <= max)
    && (!cond.flags || cond.flags.every(flag => state.flags.includes(flag)))
    && (!cond.notFlags || cond.notFlags.every(flag => !state.flags.includes(flag)))
    && (!cond.any || cond.any.some(branch => meets(state, branch)));
}

function travelledPath(move: Route & { stop?: string }): string[] {
  return move.stop ? move.path.slice(0, move.path.indexOf(move.stop) + 1) : move.path;
}

/** Enumerates complete preview paths; forced stops only shorten actual travel. */
export function reachable(state: GameState, opts: MoveOptions = {}): Move[] {
  const steps = stepsFor(state.board.dice, carLevel(state));
  if (!steps.length) return [];
  const usable = new Set(steps);
  const limit = steps[steps.length - 1];
  const best = new Map<string, Route>();
  const withoutInvite = { ...state, flags: state.flags.filter(flag => flag !== INVITE) };

  function walk(route: Route): void {
    const node = BY_ID.get(route.node);
    if (!node) return;
    if (usable.has(route.steps)) {
      const previous = best.get(route.node);
      if (!previous || route.fare < previous.fare
        || (route.fare === previous.fare && route.steps < previous.steps)) best.set(route.node, route);
    }
    if (route.steps >= limit) return;
    function advance(to: string, fare: number, via: string | null, invite = route.invite): void {
      walk({ node: to, steps: route.steps + 1, path: [...route.path, to], tolls: [...route.tolls, fare], fare, via,
        ...(invite ? { invite } : {}) });
    }
    for (const to of node.next) advance(to, route.fare, route.via);
    for (const cross of node.cross ?? []) {
      const gateState = route.invite ? withoutInvite : state;
      if (cross.gate && !meets(gateState, cross.gate)) continue;
      const invite = !!cross.gate && gateState.flags.includes(INVITE);
      const fare = route.fare + (invite ? 0 : cross.fare);
      if (fare <= state.s.money) advance(cross.to, fare, node.id, invite || route.invite);
    }
  }
  walk({ node: state.board.pos, steps: 0, path: [], tolls: [], fare: 0, via: null });

  return [...best.values()].map(route => {
    const move: Move = { ...route, passed: { pay: [], start: [] }, ...firstStop(state, route.path, route.tolls, opts) };
    for (const id of travelledPath(move)) {
      const { kind } = BY_ID.get(id)!;
      if (kind === 'pay' || kind === 'start') move.passed[kind].push(id);
    }
    return move;
  }).sort((a, b) => a.steps - b.steps || (a.node < b.node ? -1 : a.node > b.node ? 1 : 0));
}

export function applyMove(state: GameState, nodeId: string, opts: MoveOptions = {}): { state: GameState; move: Move } {
  const move = reachable(state, opts).find(entry => entry.node === nodeId);
  if (!move) throw new Error(`${UNREACHABLE}: ${nodeId}`);
  const next = structuredClone(state);
  next.board.pos = move.stop ?? move.node;
  // A forced stop before a transfer means the later toll is never paid.
  next.s.money -= move.stop ? move.tolls[move.path.indexOf(move.stop)] : move.fare;
  next.board.visited |= 1 << MAP_INDEX[BY_ID.get(next.board.pos)!.map];
  // A preview can transfer after a promotion stop; only actual entry consumes an invite.
  const travelled = travelledPath(move);
  if (move.invite && travelled.some((id, index) => {
    const from = BY_ID.get(index === 0 ? state.board.pos : travelled[index - 1])!;
    return from.cross?.some(cross => cross.to === id && cross.gate);
  })) next.flags = next.flags.filter(flag => flag !== INVITE);
  return { state: next, move };
}
