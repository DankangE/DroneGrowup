// §9.2 B. Periodic life draws include personal home/leisure/health rows; market rows remain tile events.
import { cardReward } from './cards.ts';
import { careerAge, careerSalary, careerTrack } from './career2.ts';
import { salary } from './economy.ts';
import { estateOffers, homeValue } from './home.ts';
import { HOME_RULES, LIFE_RULES, STAT_MAX, TEXT } from './life-data.ts';
import { WORLD } from './world.ts';
import { answer, effect, EVENT_KEYS as K, EVENT_RULES as R, EVENT_TEXT as T, gamble } from './events-a.ts';
import type { EventExtra, LifeEvent } from './events-a.ts';
import type { GameState } from './types.ts';

export const EVENTS_B: LifeEvent[] = [
  { id: 'rent_hike', title: '월세 인상', text: '집주인이 다음 계약의 월세를 올리겠다고 연락했다.', place: 'home', when: {}, weight: 5, life: true,
    eligible: s => s.home?.tier === 1, choices: [answer('받아들인다', {}, 0, { rent: 5 }), answer('이사', { stamina: -10 }, 80, { rentReset: 1 }),
      gamble('협상', 50, effect(), effect({}, { rent: 8 }))] },
  { id: 'jeonse_alarm', title: '전세 사기 경보', text: '이웃의 보증금 피해 소식에 계약서를 다시 살펴본다.', place: 'home', when: {}, weight: 2, life: true,
    eligible: s => s.home?.tier === 2, choices: [answer('보증 보험', {}, 60), gamble('그냥 둔다', 85, effect(), effect({}, { deposit: -600 }))] },
  { id: 'housing_boom', title: '부동산 호황', text: '매물이 빠르게 사라지며 동네 집값이 들썩인다.', place: 'estate', when: {}, weight: 3,
    eligible: s => careerAge(s) >= 25, initial: { homeIndex: 15 }, choices: [answer('지금 산다', {}, 0, { popup: 'estate' }), answer('지켜본다')] },
  { id: 'housing_bust', title: '부동산 침체', text: '급매 안내가 늘고 집값 지수가 내려갔다.', place: 'estate', when: {}, weight: 3,
    eligible: s => careerAge(s) >= 25, initial: { homeIndex: -12 }, choices: [answer('급매를 찾는다', {}, 0, { popup: 'bargain' }), answer('지켜본다')] },
  { id: 'remodel', title: '리모델링', text: '오래된 집을 손보면 생활이 더 편해질 것 같다.', place: 'home', when: {}, weight: 4, life: true,
    eligible: s => (s.home?.tier ?? 0) >= HOME_RULES.ownedTier, choices: [answer('전체', { happy: 12 }, 800, { homeValue: 600 }),
      answer('부분', { happy: 5 }, 250, { homeValue: 150 }), answer('안 한다')] },
  { id: 'noise', title: '층간 소음', text: '윗집에서 늦은 밤까지 소리가 이어진다.', place: 'home', when: {}, weight: 4, life: true,
    eligible: s => (s.home?.tier ?? 0) >= 3 && !(s.home?.map === 'F' && s.home.tier === 5), choices: [
      gamble('찾아간다', 55, effect({ net: 5 }), effect({ happy: -6 })), answer('매트', { happy: 2 }, 40), answer('참는다', { stamina: -8 })] },
  { id: 'car_trouble', title: '차량 고장', text: '차에서 낯선 소리가 나더니 시동이 잘 걸리지 않는다.', place: 'garage', when: { min: { car: 1 } }, weight: 2, life: true,
    choices: [s => answer('수리', {}, 60 * s.s.car, { carRepair: 1 }), answer('방치', {}, 0, { carWait: 4 })] },
  { id: 'hobby', title: '취미 권유', text: '친구가 주말을 함께 보낼 새로운 취미를 권한다.', place: 'park', when: {}, weight: 1, life: true,
    choices: [cardReward(answer('캠핑 장비', { happy: 8, stamina: 10 }, 200), 'field_patch'),
      cardReward(answer('FPV 동호회', { skill: 6, net: 5 }, 120), 'stick_drill'), answer('집에서 쉰다', { stamina: 10 })] },
  { id: 'world_trip', title: '세계 일주 특가', text: '언젠가 가 보고 싶었던 여행 상품이 눈에 들어왔다.', place: 'airport', when: { min: { money: 3000 } }, weight: 2, life: true,
    choices: [cardReward(answer('떠난다', { happy: 45, stamina: 30 }, 2500, { perf: -15 }), 'route_notes'),
      cardReward(answer('한 달 살기', { happy: 15 }, 700), 'peer_intro'), answer('다음에')] },
  { id: 'luxury_sale', title: '명품 세일', text: '도심 쇼윈도에 큰 할인 안내가 붙었다.', place: 'department_store', when: {}, weight: 3,
    eligible: s => ['B', 'E'].includes(s.board.pos[0]), choices: [answer('산다', { happy: 6, rep: 4 }, 500), answer('구경만', { happy: 1 })] },
  { id: 'tax_refund', title: '연말정산 환급', text: '연말정산에서 돌려받을 금액이 확정됐다.', place: 'office', when: {}, weight: 4,
    eligible: s => !!careerTrack(s)?.salaried, choices: [s => answer('받는다', { money: Math.floor(careerSalary(s) * 50 / 100) }),
      s => answer('기부금으로 돌린다', { money: Math.floor(careerSalary(s) * 20 / 100), rep: 5 })] },
  { id: 'health_check', title: '건강 검진 권유', text: '건강검진 안내장을 보고 몸 상태를 돌아본다.', place: 'hospital', when: {}, weight: 1, life: true,
    eligible: s => careerAge(s) >= 35, choices: [answer('정밀 검진', { stamina: 5 }, 150, { healthWait: 8 }),
      gamble('기본 검진', 80, effect(), effect({ stamina: -15 }))] },
];

type Property = NonNullable<GameState['home']> | GameState['estates'][number];
const valueKey = (home: Pick<Property, 'map' | 'tier'>) => `${K.homeValue}:${home.map}:${home.tier}`;
export const improvement = (state: GameState, home: Pick<Property, 'map' | 'tier'>) => state.timers[valueKey(home)] ?? 0;
export function improvementWorth(state: GameState): number {
  const properties = [...(state.home ? [state.home] : []), ...state.estates];
  return [...new Set(properties.map(valueKey))].reduce((sum, key) => sum + (state.timers[key] ?? 0), 0);
}
export function homeEventEffect(prev: GameState, extra: EventExtra): GameState {
  const state = structuredClone(prev);
  if (extra.rent) state.timers[K.rent] = (state.timers[K.rent] ?? 0) + extra.rent;
  if (extra.rentReset) delete state.timers[K.rent];
  if (extra.deposit && state.home) state.home.deposit = Math.max(0, state.home.deposit + extra.deposit);
  if (extra.homeValue && state.home) {
    const key = valueKey(state.home); state.timers[key] = (state.timers[key] ?? 0) + extra.homeValue;
  }
  if (extra.carWait) state.timers[K.carUntil] = state.turn + extra.carWait;
  if (extra.carRepair) delete state.timers[K.carUntil];
  if (extra.healthWait) state.timers[K.healthyUntil] = state.turn + extra.healthWait;
  return state;
}
/** Remote popup changes only the offer context, never the player's physical location. */
export function eventEstateOffers(state: GameState, remote = false, bargain = false) {
  const map = state.board.pos[0], node = WORLD.find(row => row.map === map && row.kind === 'estate');
  const context: GameState = remote && node ? { ...state, phase: 'action', board: { ...state.board, pos: node.id, step: 'space' } } : state;
  return (remote && !node ? [] : estateOffers(context)).map(original => {
    const offer = structuredClone(original);
    if (offer.action === 'sell') {
      const bonus = improvement(state, offer); offer.price += bonus;
      offer.choice.effect!.add!.money = (offer.choice.effect!.add!.money ?? 0) + bonus;
    }
    if (bargain && offer.action === 'buy') {
      const saving = offer.price - Math.floor(offer.price * (LIFE_RULES.percent - R.discountPct) / LIFE_RULES.percent);
      const oldLoan = offer.mortgage; offer.price -= saving;
      if (oldLoan) offer.mortgage = Math.floor(offer.price * HOME_RULES.mortgagePct / LIFE_RULES.percent);
      const balance = (offer.choice.effect!.add!.money ?? 0) - (offer.choice.cost ?? 0) + saving + offer.mortgage - oldLoan;
      offer.choice.cost = Math.max(0, -balance);
      offer.choice.effect!.add = { money: Math.max(0, balance), debt: offer.mortgage };
      offer.locked = offer.locked.filter(lock => lock !== TEXT.moneyLock(original.choice.cost ?? 0));
      if (state.s.money < offer.choice.cost) offer.locked.push(TEXT.moneyLock(offer.choice.cost));
    }
    offer.choice.desc += ` ${T.estate}: ${offer.price}.`;
    return offer;
  });
}
export function afterEventHome(prev: GameState, offer: ReturnType<typeof eventEstateOffers>[number]): GameState {
  const state = structuredClone(prev);
  if (offer.action === 'sell') delete state.timers[valueKey(offer)];
  if (offer.residence) delete state.timers[K.rent];
  return state;
}
export const eventCarState = (state: GameState): GameState => state.timers[K.carUntil] > state.turn
  ? { ...state, s: { ...state.s, car: 0 } } : state;

/** Event adjustments are separate ledger lines; the base economy's salary stays authoritative. */
export function householdEventLines(state: GameState): { label: string; amount: number }[] {
  const lines: { label: string; amount: number }[] = [{ label: T.dog, amount: state.timers[K.dog] ? -R.dogCost : 0 },
    { label: T.rent, amount: state.home?.tier === 1 ? -(state.timers[K.rent] ?? 0) : 0 }];
  const pay = salary(state), strike = state.timers[K.strikeAt] === state.turn;
  lines.push({ label: T.salary, amount: strike ? -pay : state.timers[K.salaryUntil] > state.turn
    ? Math.floor(pay * R.halfPct / LIFE_RULES.percent) - pay : 0 });
  const seen = new Set<string>();
  const rent = state.estates.reduce((sum, home) => {
    const key = valueKey(home);
    if (seen.has(key) || (state.home && valueKey(state.home) === key)) return sum;
    seen.add(key);
    const base = homeValue(state, home), bonus = improvement(state, home);
    return sum + Math.floor((base + bonus) * HOME_RULES.rentNumerator / HOME_RULES.rentDenominator)
      - Math.floor(base * HOME_RULES.rentNumerator / HOME_RULES.rentDenominator);
  }, 0);
  lines.push({ label: T.improvedRent, amount: rent });
  return lines.filter(line => line.amount);
}
export function eventYearEnd(prev: GameState): GameState {
  const state = structuredClone(prev);
  if (state.turn && state.turn % LIFE_RULES.seasons.length === 0 && state.timers[K.annual] !== state.turn) {
    if (state.timers[K.dog]) state.s.happy = Math.min(STAT_MAX.happy!, state.s.happy + R.dogHappy);
    state.timers[K.annual] = state.turn;
  }
  return state;
}
