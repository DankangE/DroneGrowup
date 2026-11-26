// T09: shops, funds and luck. Public transitions return detached state; tables live in life-data.
import { RULES } from './data.ts';
import { CARDS, CARD_TEXT, cappedChanceBonus, grantCard, offeredCard } from './cards.ts';
import { careerTrack, specialView } from './career2.ts';
import { ECONOMY_KEYS } from './economy.ts';
import type { EconomyChoice } from './economy.ts';
import { performance, special } from './jobs.ts';
import { ASSET_KEYS as K, ASSET_RULES as R, ASSET_TEXT as T, BOARD_CHOICES,
  FUNDS, LIFE_RULES, LUCK, SHOPS } from './life-data.ts';
import type { ShopDef } from './life-data.ts';
import { applyMove, carLevel, firstStop, randInt, reachable, rollDice, stepsFor } from './move.ts';
import type { Move, MoveOptions } from './move.ts';
import { WORLD } from './world.ts';
import type { Choice, Effect, GameState, SpaceKind } from './types.ts';

const P = LIFE_RULES.percent;
const pct = (n: number, percent: number) => Math.floor(n * percent / P);
const nodeAt = (state: GameState) => WORLD.find(node => node.id === state.board.pos)!;
const shopFor = (id: string) => SHOPS.find(shop => shop.id === id);
const removeFlag = (state: GameState, flag: string) => { state.flags = state.flags.filter(value => value !== flag); };
const price = (state: GameState, shop: ShopDef) => pct(shop.price, shop.indexed ? state.s.homeIndex : P);
export function shopIncome(state: GameState, id: string, level: number = state.holdings.find(row => row.id === id)?.level ?? 1): number {
  const shop = shopFor(id);
  if (!shop) return 0;
  return Math.floor(shop.income[state.turn % LIFE_RULES.seasons.length]
    * (P + (level - 1) * R.incomeStepPct) * (shop.indexed ? state.s.homeIndex : P) / (P * P));
}

/** Feed the T06 accounting slot from current holdings, including after sales/liquidation. */
export function withShopIncome(prev: GameState): GameState {
  const state = structuredClone(prev), income = state.holdings.reduce((sum, row) => sum + shopIncome(state, row.id), 0);
  if (income) state.timers[ECONOMY_KEYS.shopIncome] = income;
  else delete state.timers[ECONOMY_KEYS.shopIncome];
  return state;
}

const couponPurchase = (state: GameState, id: string) => state.phase === 'action' && state.board.step === 'space'
  && ((nodeAt(state).kind === 'shop' && id.startsWith('buy:')) || id.startsWith('biz:buy:'));
/** Existing street discount, then owned-shop discount, then the one-use coupon; floor each price. */
export function discountedChoice(state: GameState, id: string, choice: Choice, tileAction = true): Choice {
  let cost = choice.cost ?? 0;
  if (id === 'buy:drone' || id === 'buy:gear') {
    const discount = Math.max(0, ...state.holdings.map(row => shopFor(row.id)?.equipmentDiscount ?? 0));
    cost = pct(cost, P - discount);
  }
  if (tileAction && couponPurchase(state, id) && state.flags.includes(K.coupon)) cost = pct(cost, P - R.couponPct);
  const shop = id.startsWith('biz:buy:') ? shopFor(id.split(':')[2]) : undefined;
  return { ...choice, cost, ...(shop && { desc: T.shop(cost, shopIncome(state, shop.id)) }) };
}
export const luckChanceBonus = (state: GameState, id: string, dialBonus = 0) => cappedChanceBonus(
  (state.flags.includes(K.dream) ? R.dreamPct : 0)
  + (id === 'promo' && state.flags.includes(K.benefactor) ? R.benefactorPct : 0), dialBonus);

/** Only actual purchases/skill rolls consume these flags, never views, dice or annual returns. */
export function consumeLuck(prev: GameState, id: string, rolled: boolean, tileAction = true): GameState {
  const state = structuredClone(prev);
  if (tileAction && couponPurchase(state, id)) removeFlag(state, K.coupon);
  if (rolled) {
    removeFlag(state, K.dream);
    if (id === 'promo') removeFlag(state, K.benefactor);
  }
  return state;
}

export function assetChoices(state: GameState, phone = false): EconomyChoice[] {
  if (state.phase === 'ended') return [];
  const node = nodeAt(state), out: EconomyChoice[] = [];
  const tile = state.phase === 'action' && state.board.step === 'space';
  const add = (id: string, choice: Choice, locks: string[] = []) =>
    out.push({ id, choice, locks, place: node.place, kind: 'action', free: phone });
  if (!phone && tile && node.kind === 'biz') for (const shop of SHOPS) {
    if (shop.map !== node.map || shop.place !== node.place) continue;
    const holding = state.holdings.find(row => row.id === shop.id);
    if (!holding) {
      const cost = price(state, shop);
      add(`biz:buy:${shop.id}`, { title: T.buy(shop.name), desc: T.shop(cost, shopIncome(state, shop.id)), cost,
        effect: { text: T.bought } }, state.holdings.length >= LIFE_RULES.maxHoldings ? [T.capacity] : []);
    } else {
      const cost = pct(shop.price, R.upgradePct), sale = pct(holding.paid, R.resalePct);
      add(`biz:up:${shop.id}`, { title: T.up(shop.name), desc: T.shop(cost, shopIncome(state, shop.id, holding.level + 1)),
        cost, effect: { text: T.upgraded } }, holding.level >= R.maxLevel ? [T.level] : []);
      add(`biz:sell:${shop.id}`, { title: T.sell(shop.name), desc: T.shop(sale, 0), effect: { text: T.sold, add: { money: sale } } });
      add(`biz:check:${shop.id}`, { title: T.check(shop.name), desc: T.shop(0, shopIncome(state, shop.id)),
        effect: { text: T.checked, add: { money: shopIncome(state, shop.id) } } });
    }
  }
  if (phone || (tile && node.kind === 'invest')) {
    const fee = (n: number) => phone ? pct(n, R.phoneFeePct) : 0;
    let max = Math.floor(state.s.money * P / (P + (phone ? R.phoneFeePct : 0)));
    if (max + 1 + fee(max + 1) <= state.s.money) max++;
    for (const amount of new Set([...R.fundAmounts, max])) if (amount > 0) {
      add(`fund:in:${amount}`, { title: T.deposit(amount), desc: T.fundFee(fee(amount)), cost: amount + fee(amount),
        effect: { text: T.deposited } });
    }
    for (const amount of new Set([...R.fundAmounts, state.fund.amount])) if (amount > 0) {
      add(`fund:out:${amount}`, { title: T.withdraw(amount), desc: T.fundFee(fee(amount)),
        effect: { text: T.withdrawn, add: { money: amount - fee(amount) } } }, amount > state.fund.amount ? [T.fundShort] : []);
    }
    for (const fund of FUNDS) if (fund.kind !== state.fund.kind) {
      add(`fund:kind:${fund.kind}`, { title: T.kind(fund.name), desc: fund.desc + T.fundFee(fee(state.fund.amount)),
        cost: fee(state.fund.amount), effect: { text: T.changed } });
    }
  }
  return out;
}

export function assetPopup(state: GameState): EconomyChoice[] | null {
  if (state.phase === 'ended' || !state.timers[K.popup]) return null;
  const place = nodeAt(state).place;
  const row = (id: string, choice: Choice, locks: string[] = []): EconomyChoice =>
    ({ id, choice, locks, place, kind: 'board', free: false });
  const choices = state.timers[K.popup] === K.shortcut ? shortcutMoves(state).map(move => {
    const kind = WORLD.find(node => node.id === move.node)!.kind;
    return row(`luck:shortcut:${kind}`, { title: T.shortcut(T.kinds[kind]), desc: T.shortcutDone, effect: { text: T.shortcutDone } });
  }) : [row('luck:promote', { title: T.promotion, desc: specialView(state).maintenance, effect: { text: T.promoted } },
    specialView(state).enabled ? [] : [specialView(state).title]),
  row('luck:wait', { title: T.wait, desc: T.waited, effect: { text: T.waited, add: { rep: R.waitRep } } })];
  return [...choices, row('skip', BOARD_CHOICES.skip)];
}

/** Engine has validated the exposed choice and charged the displayed price. */
export function applyAssetChoice(prev: GameState, id: string, cost: number): GameState {
  let state = structuredClone(prev);
  const [group, action, value] = id.split(':');
  if (group === 'biz') {
    const holding = state.holdings.find(row => row.id === value);
    if (action === 'buy') state.holdings.push({ id: value, level: 1, paid: cost });
    else if (action === 'up' && holding) { holding.level = (holding.level + 1) as typeof holding.level; holding.paid += cost; }
    else if (action === 'sell') state.holdings = state.holdings.filter(row => row.id !== value);
  } else if (group === 'fund') {
    const n = Number(value);
    if (action === 'in') state.fund.amount += n;
    else if (action === 'out') state.fund.amount -= n;
    else if (action === 'kind') state.fund.kind = n as GameState['fund']['kind'];
  } else if (group === 'luck') {
    if (action === 'promote') { state = special(state); state.job.perf = R.promotionPerf; }
    else if (action === 'wait') state = performance(state, R.waitPerf);
  }
  if (group === 'luck' || id === 'skip') delete state.timers[K.popup];
  return withShopIncome(state);
}

/** Called after winter advances to spring, at most once for each year, including turn 204. */
export function fundYearEnd(prev: GameState): GameState {
  const state = structuredClone(prev);
  if (!state.turn || state.turn % LIFE_RULES.seasons.length || state.timers[K.fundYear] === state.turn) return state;
  state.timers[K.fundYear] = state.turn;
  if (!state.fund.amount) return state;
  const fund = FUNDS[state.fund.kind];
  const rate = fund.chance === P || randInt(state, P) < fund.chance ? fund.gain : fund.loss;
  const delta = pct(state.fund.amount, rate);
  state.fund.amount += delta;
  state.log.push({ turn: state.turn, text: T.fundYear(fund.name, delta), tone: delta >= 0 ? 'good' : 'bad' });
  state.log = state.log.slice(-LIFE_RULES.logMax);
  return state;
}

export function drawLuck(prev: GameState): { state: GameState; card: typeof LUCK[number]; effect: Effect } {
  let state = structuredClone(prev);
  const pool = LUCK.filter((_, index) => index !== state.timers[K.lastLuck]);
  const card = pool[randInt(state, pool.length)];
  state.timers[K.lastLuck] = LUCK.indexOf(card);
  state.board.step = 'bonus';
  if (CARDS.some(held => held.id === card.id)) {
    state = grantCard(state, card.id);
    const text = offeredCard(state) ? CARD_TEXT.offered(card.title) : CARD_TEXT.stored(card.title);
    return { state, card: { ...card, text }, effect: { text } };
  }
  const salaried = careerTrack(state)?.salaried;
  if (card.action === 'promotion' && salaried) { state.timers[K.popup] = K.promotion; state.board.step = 'space'; }
  if (card.action === 'demotion' && salaried) state = performance(state, R.demotionPerf);
  return { state, card, effect: { text: card.text, flag: card.flag, add: card.add ?? (!salaried ? card.fallback : undefined) } };
}

export function rollAssetDice(prev: GameState): GameState {
  const state = structuredClone(prev);
  const dice = rollDice(state);
  if (state.flags.includes(K.triple)) {
    state.board.dice = [...dice, randInt(state, RULES.board.die) + R.singleStep];
    removeFlag(state, K.triple);
  }
  return state;
}

const bestMoves = (moves: Move[]): Move[] => {
  const best = new Map<string, Move>();
  for (const move of moves) {
    const old = best.get(move.node);
    if (!old || move.fare < old.fare || (move.fare === old.fare && move.steps < old.steps)) best.set(move.node, move);
  }
  return [...best.values()].sort((a, b) => a.steps - b.steps || a.node.localeCompare(b.node));
};
function route(path: string[], tolls: number[], via: string | null, state: GameState, opts: MoveOptions): Move {
  const forced = firstStop(state, path, tolls, opts);
  const travelled = forced ? path.slice(0, path.indexOf(forced.stop) + 1) : path;
  return { node: path.at(-1)!, steps: path.length, path, tolls, fare: tolls.at(-1) ?? 0, via,
    ...forced, passed: {
      pay: travelled.filter(id => WORLD.find(node => node.id === id)!.kind === 'pay'),
      start: travelled.filter(id => WORLD.find(node => node.id === id)!.kind === 'start'),
    } };
}

/** Reuse T02 for every edge; only the first transfer's payment changes. Gate checks stay in T02. */
function ticketEdges(state: GameState): { state: GameState; move: Move }[] {
  const probe = structuredClone(state);
  probe.board.dice = [R.singleStep]; probe.s.car = 0;
  probe.s.money = LIFE_RULES.statMax;
  return reachable(probe).flatMap(move => {
    const waived = !!move.via && state.flags.includes(K.transfer), fare = waived ? 0 : move.fare;
    if (fare > state.s.money) return [];
    const next = applyMove(probe, move.node).state;
    next.s.money = state.s.money - fare; next.s.car = state.s.car; next.board.dice = state.board.dice;
    if (waived) removeFlag(next, K.transfer);
    return [{ state: next, move: { ...move, fare, tolls: [fare] } }];
  });
}

export function assetReachable(state: GameState, opts: MoveOptions = {}): Move[] {
  if (!state.flags.includes(K.transfer)) return reachable(state, opts);
  const steps = stepsFor(state.board.dice, carLevel(state));
  const limit = Math.max(0, ...steps), moves: Move[] = [];
  function walk(current: GameState, path: string[], tolls: number[], via: string | null) {
    if (steps.includes(path.length)) moves.push(route(path, tolls, via, state, opts));
    if (path.length >= limit) return;
    for (const edge of ticketEdges(current)) walk(edge.state, [...path, edge.move.node],
      [...tolls, (tolls.at(-1) ?? 0) + edge.move.fare], edge.move.via ?? via);
  }
  walk(state, [], [], null);
  return bestMoves(moves);
}

export function applyAssetMove(prev: GameState, destination: string, opts: MoveOptions = {}): { state: GameState; move: Move } {
  if (!prev.flags.includes(K.transfer)) return applyMove(prev, destination, opts);
  const move = assetReachable(prev, opts).find(row => row.node === destination);
  if (!move) throw new Error(`${T.badMove}: ${destination}`);
  let state = structuredClone(prev);
  const path = move.stop ? move.path.slice(0, move.path.indexOf(move.stop) + 1) : move.path;
  for (const id of path) state = ticketEdges(state).find(edge => edge.move.node === id)!.state;
  return { state, move };
}

/** Directed breadth-first search, within this map; ties follow the world's next-edge order. */
export function shortcutMoves(state: GameState): Move[] {
  const origin = nodeAt(state), seen = new Set<string>(), kinds = new Set<SpaceKind>(), moves: Move[] = [];
  const queue = origin.next.map(id => [id]);
  for (let index = 0; index < queue.length; index++) {
    const path = queue[index], node = WORLD.find(row => row.id === path.at(-1))!;
    if (seen.has(node.id) || node.map !== origin.map) continue;
    seen.add(node.id);
    if (!kinds.has(node.kind)) { kinds.add(node.kind); moves.push(route(path, path.map(() => 0), null, state, {})); }
    for (const id of node.next) queue.push([...path, id]);
  }
  return moves;
}
