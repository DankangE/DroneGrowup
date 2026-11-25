import { HOMES, HOME_RULES as R, HOME_TEXT as T, LIFE_RULES, STAT_MAX, TEXT } from './life-data.ts';
import { randInt } from './move.ts';
import { MAPS, WORLD } from './world.ts';
import type { Choice, GameState, MapId } from './types.ts';

type Property = { map: MapId; tier: number };
export type EstateOffer = Property & {
  id: string; action: 'rent' | 'buy' | 'sell' | 'move'; price: number; mortgage: number;
  income: number; residence: boolean; estateIndex: number; choice: Choice; locked: string[];
};
const nodeAt = (state: GameState) => WORLD.find(node => node.id === state.board.pos)!;
const owned = (home: Property | null) => !!home && home.tier >= R.ownedTier;
const refund = (state: GameState) => state.home && !owned(state.home) ? state.home.deposit : 0;
const same = (a: Property, b: Property) => a.map === b.map && a.tier === b.tier;
const available = (home: Property) => home.map !== R.unavailableMap
  && (home.tier !== R.penthouse.tier || home.map === R.penthouse.map);
const nameOf = (home: Property) => same(home, R.country) ? R.country.name : HOMES[home.tier].name;

/** Map and index are both integer percentages; floor only after multiplying both. */
export function homeValue(state: GameState, home: Property): number {
  const base = same(home, R.country) ? R.country.price : HOMES[home.tier]?.price ?? 0;
  return Math.floor(base * MAPS[home.map].homePct * state.s.homeIndex / LIFE_RULES.percent ** 2);
}
export const estateIncome = (state: GameState, home: Property) =>
  Math.floor(homeValue(state, home) * R.rentNumerator / R.rentDenominator);
export const rentalIncome = (state: GameState) => state.estates.reduce((sum, home) => sum + estateIncome(state, home), 0);

/** Only the occupied home grants recovery; owning a rental in this map is insufficient. */
export function homeRecovery(state: GameState) {
  return HOMES[state.home?.map === nodeAt(state).map ? state.home.tier : 0] ?? HOMES[0];
}

/** Called with the new spring turn, once per winter close, including the final winter. */
export function yearEndHome(prev: GameState): GameState {
  const state = structuredClone(prev);
  if (state.phase === 'ended' || !state.turn || state.turn % LIFE_RULES.seasons.length !== LIFE_RULES.spring
    || state.timers[R.indexAt] === state.turn) return state;
  const change = R.indexMinChange + randInt(state, R.indexMaxChange - R.indexMinChange + 1);
  state.s.homeIndex = Math.max(LIFE_RULES.minHomeIndex, Math.min(STAT_MAX.homeIndex!, state.s.homeIndex + change));
  state.timers[R.indexAt] = state.turn;
  return state;
}

/** Local estate trades; a start tile only transfers an existing rental residence. */
export function estateOffers(state: GameState): EstateOffer[] {
  if (state.phase !== 'action' || state.board.step !== 'space') return [];
  const node = nodeAt(state), map = node.map, out: EstateOffer[] = [];
  const add = (action: EstateOffer['action'], home: Property, price: number, moving = 0, returned = 0,
    mortgage = 0, residence = false, estateIndex = -1, locked: string[] = []) => {
    const income = action === 'buy' && !residence ? estateIncome(state, home) : 0;
    const balance = action === 'sell' ? price : returned + mortgage - price - moving;
    const name = nameOf(home), cost = Math.max(0, -balance);
    out.push({ ...home, id: `home:${action}:${home.tier}${mortgage ? ':mortgage' : ''}`,
      action, price, mortgage, income, residence, estateIndex,
      locked: [...locked, ...(state.s.money < cost ? [TEXT.moneyLock(cost)] : [])],
      choice: { title: mortgage ? T.mortgage(name) : T[action](name), cost,
        desc: T.details(price, moving, returned, mortgage, income),
        effect: { text: action === 'sell' ? T.sold : action === 'move' ? T.moved : residence ? T.occupied : T.rented,
          add: { money: Math.max(0, balance), debt: mortgage } } } });
  };
  const current = state.home;
  if (node.kind === 'start') {
    if (current && R.rentalTiers.includes(current.tier) && current.map !== map && available({ map, tier: current.tier })) {
      add('move', { map, tier: current.tier }, 0, R.moving, 0, 0, true);
    }
    return out;
  }
  if (node.kind !== 'estate' || map === R.unavailableMap) return out;
  for (const def of HOMES) {
    const home = { map, tier: def.tier };
    if (!def.tier || !available(home)) continue;
    if (R.rentalTiers.includes(def.tier)) {
      if (!current || !same(current, home)) add('rent', home, def.price, R.moving, refund(state), 0, true, -1,
        owned(current) && state.estates.length >= LIFE_RULES.maxHomes ? [T.maxEstates] : []);
    } else {
      const residence = !owned(current), price = homeValue(state, home);
      const count = state.estates.length + Number(owned(current));
      const locks = count >= R.maxOwned ? [T.maxOwned]
        : !residence && state.estates.length >= LIFE_RULES.maxHomes ? [T.maxEstates] : [];
      for (const mortgage of [0, Math.floor(price * R.mortgagePct / LIFE_RULES.percent)]) {
        add('buy', home, price, residence ? R.moving : 0, residence ? refund(state) : 0, mortgage, residence, -1, locks);
      }
    }
    // IDs identify a local tier; duplicate investments are sold/moved in acquisition order.
    const estateIndex = state.estates.findIndex(estate => same(estate, home));
    if (estateIndex >= 0) {
      add('sell', home, homeValue(state, home), 0, 0, 0, false, estateIndex);
      add('move', home, 0, R.moving, refund(state), 0, true, estateIndex);
    } else if (current && same(current, home)) {
      add('sell', home, owned(current) ? homeValue(state, current) : current.deposit, 0, 0, 0, true);
    }
  }
  return out;
}

/** Engine validates the offer and applies its displayed cash/debt effects before this asset update. */
export function applyHomeChoice(prev: GameState, offer: EstateOffer): GameState {
  const state = structuredClone(prev), old = state.home;
  if (offer.action === 'sell') {
    if (offer.estateIndex >= 0) state.estates.splice(offer.estateIndex, 1);
    else state.home = null;
  } else if (offer.action === 'buy' && !offer.residence) {
    state.estates.push({ map: offer.map, tier: offer.tier, paid: offer.price });
  } else {
    if (offer.estateIndex >= 0) state.estates.splice(offer.estateIndex, 1);
    if (owned(old)) state.estates.push({ map: old!.map, tier: old!.tier, paid: homeValue(state, old!) });
    const deposit = offer.action === 'move' && offer.estateIndex < 0 ? old!.deposit
      : R.rentalTiers.includes(offer.tier) ? HOMES[offer.tier].price : 0;
    state.home = { map: offer.map, tier: offer.tier, deposit };
  }
  return state;
}
