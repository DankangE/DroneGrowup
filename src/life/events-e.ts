// §9.2 E. T12 extends T11's extra effects without changing its shared tables.
import { assetChoices, fundYearEnd } from './assets.ts';
import { careerAge } from './career2.ts';
import { netWorth } from './economy.ts';
import { improvementWorth } from './events-b.ts';
import { answer, effect, EVENT_TEXT, gamble } from './events-a.ts';
import type { EventExtra, LifeChoice, LifeEffect, LifeEvent } from './events-a.ts';
import { ASSET_KEYS, ASSET_TEXT, FUNDS, LIFE_RULES, STAT_LABEL } from './life-data.ts';
import { randInt } from './move.ts';
import type { GameState, Stat, StatMap } from './types.ts';

export type EventExtra2 = EventExtra & {
  fundOut?: number; fundPopup?: number; fundBonus?: number;
  wristWait?: number; careWait?: number; fitnessWait?: number;
  jobPopup?: number; skipSeasons?: number; tenure?: number; villa?: number;
  succession?: number; sellOrganization?: number;
};
export const EVENT2_KEYS = {
  coins: 'event_coin_count', fundPopup: 'event_fund_popup', fundBonus: 'event_fund_bonus',
  lowStamina: 'event_low_stamina', wristUntil: 'event_wrist_until', careUntil: 'event_care_until',
  fitnessUntil: 'event_fitness_until', jobs: 'event_jobs', succession: 'event_succession',
} as const;
export const FINANCE_RULES = { coinLimit: 2, fundNode: 'E-o3', shocks: { crash: -20, bull: 12 } } as const;
const EXTRA_TEXT = {
  fundOut: (n: number) => `펀드 ${n}만원 인출`, fundPopup: () => '펀드 선택 창을 연다',
  fundBonus: (n: number) => `추가 입금 시 다음 연말 펀드 수익률 +${n}%p`,
  wristWait: (n: number) => `${n}계절 동안 비행 성공률 −10%p`, careWait: (n: number) => `${n}계절 동안 계절 회복 −10`,
  fitnessWait: (n: number) => `${n}계절 동안 계절 회복 +5`,
  jobPopup: (n: number) => n === 1 ? '이직 대기 없이 직업을 선택한다' : '전문직 일자리를 살펴본다',
  skipSeasons: (n: number) => `급여를 받으며 ${n}계절을 건너뛴다`, tenure: (n: number) => `재직 ${n}계절 추가 인정`,
  villa: () => '휴양지 5등급 집을 소유한다', succession: (n: number) => `결산 조직 가치 +${n}%`, sellOrganization: () => '조직을 매각한다',
} as const;
const MOVE_TEXT: Record<string, string> = { 'A-o0': '새싹 마을 출발 칸', 'D-o0': '특구 출발 칸',
  'E-o0': '신도시 출발 칸', 'F-o0': '휴양지 출발 칸' };
/** The original helper still formats every T11 effect; only T12 vocabulary is added here. */
export function eventEffect(add: StatMap = {}, extra: EventExtra2 = {}, set: StatMap = {}): LifeEffect & { extra: EventExtra2 } {
  const base = effect(add, Object.fromEntries(Object.entries(extra).filter(([key]) => key in EVENT_TEXT.extra)));
  if (extra.move && MOVE_TEXT[extra.move]) base.text = base.text.replace(extra.move, MOVE_TEXT[extra.move]);
  const text = [Object.keys(add).length || Object.keys(base.extra!).length ? base.text : '',
    ...Object.entries(extra).filter(([key]) => key in EXTRA_TEXT).map(([key, n]) => EXTRA_TEXT[key as keyof typeof EXTRA_TEXT](Number(n))),
    ...Object.entries(set).map(([key, n]) => `${STAT_LABEL[key as Stat]} → ${n}`)].filter(Boolean).join(EVENT_TEXT.divider);
  return { ...base, extra, set, text: text || EVENT_TEXT.unchanged };
}
export function eventAnswer(title: string, add: StatMap = {}, cost = 0, extra: EventExtra2 = {}, set: StatMap = {}): LifeChoice {
  const outcome = eventEffect(add, extra, set);
  return { title, desc: (cost ? EVENT_TEXT.cost(cost) : '') + outcome.text, cost, effect: outcome };
}
export const eventNetWorth = (s: GameState) => netWorth(s) + improvementWorth(s);
const withdraw = (title: string, amount: number) => eventAnswer(title, { money: amount }, 0, { fundOut: amount });
export const EVENTS_E: LifeEvent[] = [
  { id: 'lotto', title: '복권', text: '가게 앞에서 이번 주 복권 판매 안내를 보았다.', place: 'lottery', when: {}, weight: 3,
    choices: [gamble('산다', 5, effect({ money: 3000 }), effect(), 10), answer('안 산다')] },
  { id: 'stock_tip', title: '지인의 추천 종목', text: '지인이 관심 있게 지켜본 종목을 추천한다.', place: 'securities', when: { min: { money: 500 } }, weight: 4,
    choices: [gamble('크게', 45, effect({ money: 1300 }), effect({ money: 150 }), 500),
      gamble('조금', 45, effect({ money: 260 }), effect({ money: 30 }), 100), answer('사양')] },
  { id: 'coin_fever', title: '코인 광풍', text: '어디를 가나 급등한 코인 이야기가 들린다.', place: 'securities', when: { min: { money: 1000 } }, weight: 2,
    eligible: s => (s.timers[EVENT2_KEYS.coins] ?? 0) < FINANCE_RULES.coinLimit,
    choices: [gamble('넣는다', 30, effect({ money: 4000 }), effect({ money: 200 }), 1000), answer('구경')] },
  { id: 'invest_scam', title: '투자 사기', text: '수익을 보장한다는 투자 설명이 어딘가 수상하다.', place: 'invest_hall', when: { min: { money: 2000 } }, weight: 2,
    choices: [answer('신고', { rep: 5 }), gamble('들어 본다', 55, effect({ rep: 8 }), effect({ money: -1500 }), 0,
      [{ stat: 'theory', over: 0, per: 10, pct: 1, cap: 30 }])] },
  { id: 'inheritance', title: '뜻밖의 유산', text: '가족에게서 예상하지 못한 유산에 관한 연락이 왔다.', place: 'home', when: {}, weight: 2, once: true,
    eligible: s => careerAge(s) >= 40, choices: [answer('받는다', { money: 3000 }), answer('형제에게 양보', { happy: 20, net: 10 })] },
  { id: 'crash', title: '금융 위기', text: '금융시장 불안으로 보유 펀드의 가치가 20% 떨어졌다.', place: 'securities', when: {}, weight: 2,
    eligible: s => s.fund.amount > 0, choices: [eventAnswer('더 넣는다', {}, 0, { fundPopup: 1, fundBonus: 15 }),
      s => withdraw('전부 뺀다', s.fund.amount), answer('버틴다')] },
  { id: 'bull', title: '대세 상승', text: '시장의 상승세를 타고 보유 펀드의 가치가 12% 올랐다.', place: 'securities', when: {}, weight: 3,
    eligible: s => s.fund.amount > 0, choices: [s => withdraw('절반을 뺀다', Math.floor(s.fund.amount / 2)), answer('둔다')] },
  { id: 'wallet', title: '주운 지갑', text: '길가에 떨어진 지갑 안에 현금과 연락처가 있다.', place: 'park', when: {}, weight: 3,
    choices: [answer('돌려준다', { rep: 6, happy: 3 }), answer('가진다', { money: 80, happy: -3 })] },
  { id: 'donation', title: '기부 요청', text: '지역 이웃을 돕는 모금에 참여해 달라는 요청을 받았다.', place: 'village_hall', when: { min: { money: 1000 } }, weight: 4,
    choices: [answer('큰 기부', { rep: 15, happy: 10 }, 1000), answer('작은 기부', { rep: 3, happy: 2 }, 100), answer('다음에')] },
  { id: 'tax_audit2', title: '세무 조사', text: '보유 자산에 관한 자료를 제출해 달라는 안내가 왔다.', place: 'city_hall', when: {}, weight: 2,
    eligible: s => eventNetWorth(s) >= 20000, choices: [answer('세무사', {}, 300),
      s => gamble('직접 대응', 60, effect(), effect({ money: -Math.floor(eventNetWorth(s) * 3 / 100) }))] },
];

/** Shocks and occurrence limits happen at draw time, even when the player skips. */
export function beginFinanceEvent(prev: GameState, id: string): GameState {
  const state = structuredClone(prev), shock = FINANCE_RULES.shocks[id as keyof typeof FINANCE_RULES.shocks];
  if (shock !== undefined) state.fund.amount += Math.floor(state.fund.amount * shock / LIFE_RULES.percent);
  if (id === 'coin_fever') state.timers[EVENT2_KEYS.coins] = (state.timers[EVENT2_KEYS.coins] ?? 0) + 1;
  return state;
}
export function financeEventEffect(prev: GameState, extra: EventExtra2): GameState {
  const state = structuredClone(prev);
  if (extra.fundOut) state.fund.amount = Math.max(0, state.fund.amount - extra.fundOut);
  if (extra.fundPopup) state.timers[EVENT2_KEYS.fundPopup] = extra.fundBonus ?? 0;
  return state;
}
export function fundEventChoices(state: GameState) {
  // Reuse the existing investment tile's fee-free menu without relocating the player.
  const context: GameState = { ...state, phase: 'action', board: { ...state.board, pos: FINANCE_RULES.fundNode, step: 'space' } };
  return assetChoices(context).filter(row => row.id.startsWith('fund:'));
}
export function afterFundEvent(prev: GameState, id: string): GameState {
  const state = structuredClone(prev);
  if (state.timers[EVENT2_KEYS.fundPopup] === undefined) return state;
  if (id.startsWith('fund:in:')) state.timers[EVENT2_KEYS.fundBonus] = state.timers[EVENT2_KEYS.fundPopup];
  if (id.startsWith('fund:') || id === 'skip') delete state.timers[EVENT2_KEYS.fundPopup];
  return state;
}
export function eventFundYearEnd(prev: GameState): GameState {
  const state = fundYearEnd(prev), bonus = prev.timers[EVENT2_KEYS.fundBonus];
  if (state.timers[ASSET_KEYS.fundYear] === prev.timers[ASSET_KEYS.fundYear] || bonus === undefined) return state;
  if (prev.fund.amount) {
    const fund = FUNDS[prev.fund.kind], probe = { ...prev };
    const rate = fund.chance === LIFE_RULES.percent || randInt(probe, LIFE_RULES.percent) < fund.chance ? fund.gain : fund.loss;
    const delta = Math.floor(prev.fund.amount * (rate + bonus) / LIFE_RULES.percent);
    state.fund.amount = prev.fund.amount + delta;
    state.log[state.log.length - 1] = { turn: state.turn, text: ASSET_TEXT.fundYear(fund.name, delta), tone: delta >= 0 ? 'good' : 'bad' };
  }
  delete state.timers[EVENT2_KEYS.fundBonus];
  return state;
}
