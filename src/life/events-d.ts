// §9.2 D. Shop events target the first holding, consistently in preview and execution.
import { ASSET_RULES, ASSET_TEXT, LIFE_RULES, STAT_MAX, TEXT } from './life-data.ts';
import { assetChoices, shopIncome, withShopIncome } from './assets.ts';
import { ECONOMY_KEYS } from './economy.ts';
import { answer, effect, EVENT_KEYS as K, EVENT_RULES as R, EVENT_TEXT as T, gamble } from './events-a.ts';
import type { EventExtra, LifeChoice, LifeEvent } from './events-a.ts';
import type { GameState } from './types.ts';
import { WORLD } from './world.ts';

const flying = (s: GameState) => s.status === 'working' && R.flightTracks.some(track => track === s.track);
const shop = (s: GameState) => s.holdings.length > 0;
const owned = (s: GameState) => s.holdings[0];
const slumpKey = (id: string) => `${K.shopUntil}:${id}`;
const eventFranchise = (id: string) => id.startsWith(K.franchise + ':');
export const EVENTS_D: LifeEvent[] = [
  { id: 'viral', title: '영상 대박', text: '올린 영상이 예상보다 훨씬 많은 관심을 받았다.', place: 'studio', when: { any: [{ track: ['creator'] }, { min: { drone: 4 } }] }, weight: 3,
    choices: [gamble('후속편', 60, effect({ fans: 60, money: 400 }), effect({ fans: 10 }), 100), answer('광고 수락', { money: 600, fans: -10 }), answer('쉬어 간다', { fans: 15 })] },
  { id: 'gear_sponsor', title: '장비 협찬', text: '장비 업체에서 활동을 지원하겠다는 제안이 왔다.', place: 'shop', when: { min: { rep: 105 } }, weight: 3,
    eligible: flying, choices: [s => answer('받는다', s.s.gear < STAT_MAX.gear! ? { gear: 1, rep: -3 } : { money: 300, rep: -3 }), answer('거절', { rep: 5 })] },
  { id: 'big_order', title: '대형 수주', text: '혼자 감당하기 어려울 만큼 큰 의뢰가 들어왔다.', place: 'office', when: { track: ['solo', 'company'] }, weight: 4,
    choices: [gamble('인력을 붙인다', 65, effect({ contracts: 2, value: 800 }), effect({ rep: -8 }), 500),
      gamble('혼자 한다', 45, effect({ stamina: -30, money: 1200 }), effect({ stamina: -30, rep: -4 })), answer('양보', { net: 8 })] },
  { id: 'shop_hit', title: '가게 대박', text: '가게에 손님이 몰리면서 매출이 크게 늘었다.', place: 'mall', when: {}, weight: 4,
    eligible: shop, choices: [answer('확장 준비', {}, 0, { shopDiscount: 30 }), s => answer('현금 회수', { money: annualShopIncome(s, owned(s).id) })] },
  { id: 'shop_slump', title: '상권 침체', text: '가게 주변 유동 인구가 줄어 매출이 걱정된다.', place: 'mall', when: {}, weight: 4,
    eligible: shop, choices: [answer('새 단장', {}, 300), answer('버틴다', {}, 0, { shopWait: 4 }),
      s => answer('판다', { money: Math.floor(owned(s).paid * ASSET_RULES.resalePct / LIFE_RULES.percent) }, 0, { sellShop: 1 })] },
  { id: 'franchise', title: '프랜차이즈 제안', text: '새 지점을 맡아 운영해 달라는 가맹 제안을 받았다.', place: 'waterfront_mall', when: { min: { biz: 105, money: 3000 } }, weight: 2,
    eligible: s => s.holdings.length <= 3, choices: [answer('가맹', {}, 3000, { franchise: 3000 }),
      gamble('조건 협상', 30, effect({}, { popup: 'franchise' }), effect(), 0, [{ stat: 'biz', over: 0, per: 5, pct: 1, cap: 100 }]), answer('거절')] },
  { id: 'partner_exit', title: '동업자 이탈', text: '동업자가 회사를 떠나겠다고 지분 정리를 요청했다.', place: 'office', when: { track: ['company'] }, weight: 2,
    choices: [answer('지분 매입', { value: 1500 }, 1000), gamble('소송', 50, effect({ money: 800 }), effect({ rep: -10 }), 300), answer('보내 준다', { staff: -1, value: -600 })] },
  { id: 'gov_project', title: '국책 과제', text: '새로운 기술 개발 과제의 참여 기업을 모집한다.', place: 'lab', when: { track: ['company', 'engineer', 'academy'], min: { rep: 105 } }, weight: 3,
    choices: [gamble('지원', 50, effect({ money: 2500, rep: 10 }), effect(), 200, [{ stat: 'rep', over: 0, per: 10, pct: 1, cap: 20 }]), answer('컨소시엄 참여', { money: 500 })] },
  { id: 'export_deal', title: '수출 상담', text: '해외 거래처가 제품에 관심을 보이며 상담을 요청했다.', place: 'port', when: { track: ['company'], min: { value: 20000 } }, weight: 2,
    choices: [gamble('출장', 55, effect({ value: 6000, money: 2000 }), effect({ value: 500 }), 800), gamble('화상 상담', 30, effect({ value: 3000 }), effect())] },
  { id: 'patent', title: '특허 분쟁', text: '개발한 기술의 권리를 두고 분쟁이 생겼다.', place: 'office', when: { flags: ['tech'] }, weight: 2,
    choices: [gamble('소송', 60, effect({ money: 5000 }), effect(), 1200), answer('합의', { money: 800 })] },
  { id: 'drone_show', title: '드론 쇼 의뢰', text: '행사장에서 드론 공연을 맡아 달라는 연락이 왔다.', place: 'airfield', when: { min: { drone: 3 } }, weight: 4,
    eligible: flying, choices: [gamble('수락', 40, effect({ stamina: -20, money: 700, rep: 8 }), effect({ stamina: -20, rep: -6, cond: -30 }), 0,
      [{ stat: 'skill', over: 0, per: 10, pct: 1, cap: 35 }]), answer('하청', { money: 150 })] },
  { id: 'bad_review', title: '악성 후기', text: '사실과 다른 후기가 퍼지면서 고객들이 질문을 보내 온다.', place: 'office', when: {}, weight: 4,
    eligible: s => s.track === 'solo' || s.track === 'creator' || shop(s), choices: [answer('사과문', { rep: -3 }),
      gamble('반박', 50, effect({ rep: 8 }), effect({ rep: -12 })), answer('법적 대응', { rep: 2 }, 200)] },
];

export function eventShopIncome(state: GameState, id: string, level = state.holdings.find(h => h.id === id)?.level ?? 1): number {
  const income = eventFranchise(id) ? Math.floor(R.franchiseIncome * (LIFE_RULES.percent + (level - 1) * ASSET_RULES.incomeStepPct) / LIFE_RULES.percent)
    : shopIncome(state, id, level);
  return state.timers[slumpKey(id)] > state.turn ? Math.floor(income * R.halfPct / LIFE_RULES.percent) : income;
}
function annualShopIncome(state: GameState, id: string): number {
  return LIFE_RULES.seasons.reduce((sum, _, i) => sum + eventShopIncome({ ...state, turn: state.turn + i }, id), 0);
}
export function eventIncomeState(prev: GameState): GameState {
  const state = withShopIncome(prev);
  state.timers[ECONOMY_KEYS.shopIncome] = state.holdings.reduce((sum, h) => sum + eventShopIncome(state, h.id, h.level), 0);
  if (!state.timers[ECONOMY_KEYS.shopIncome]) delete state.timers[ECONOMY_KEYS.shopIncome];
  return state;
}
export function businessEventEffect(prev: GameState, extra: EventExtra): GameState {
  const state = structuredClone(prev);
  if (extra.shopDiscount) state.timers[K.shopDiscount] = extra.shopDiscount;
  if (extra.shopWait && owned(state)) state.timers[slumpKey(owned(state).id)] = state.turn + extra.shopWait;
  if (extra.sellShop) { const sold = state.holdings.shift(); if (sold) delete state.timers[slumpKey(sold.id)]; }
  if (extra.franchise) state.holdings.push({ id: `${K.franchise}:${state.turn}`, level: 1, paid: extra.franchise });
  return state;
}
export function eventAssetChoices(state: GameState, phone = false) {
  const choices = assetChoices(state, phone);
  for (const row of choices) if (row.id.startsWith('biz:check:')) {
    const id = row.id.slice('biz:check:'.length);
    row.choice = answer(row.choice.title, { money: eventShopIncome(state, id) });
  }
  if (!phone && state.phase === 'action' && state.board.step === 'space'
    && WORLD.some(node => node.id === state.board.pos && node.kind === 'biz' && node.map === 'E')) {
    for (const holding of state.holdings.filter(h => eventFranchise(h.id))) {
      const cost = Math.floor(R.franchisePrice * ASSET_RULES.upgradePct / LIFE_RULES.percent);
      const add = (action: string, choice: LifeChoice, locks: string[] = []) => choices.push({
        id: `biz:${action}:${holding.id}`, choice, locks, place: 'waterfront_mall', kind: 'action', free: false });
      add('up', answer(ASSET_TEXT.up(T.franchise), {}, cost), holding.level >= ASSET_RULES.maxLevel ? [ASSET_TEXT.level] : []);
      add('sell', answer(ASSET_TEXT.sell(T.franchise), { money: Math.floor(holding.paid * ASSET_RULES.resalePct / LIFE_RULES.percent) }));
      add('check', answer(ASSET_TEXT.check(T.franchise), { money: eventShopIncome(state, holding.id) }));
    }
  }
  for (const row of choices) if (row.id.startsWith('biz:up:') && state.timers[K.shopDiscount]) {
    const oldCost = row.choice.cost ?? 0;
    row.choice = { ...row.choice, cost: Math.floor(oldCost * (LIFE_RULES.percent - state.timers[K.shopDiscount]) / LIFE_RULES.percent) };
    row.choice.desc = ASSET_TEXT.shop(row.choice.cost!, eventShopIncome(state, row.id.slice('biz:up:'.length)));
    row.locks = (row.locks ?? []).filter(lock => lock !== TEXT.moneyLock(oldCost));
  }
  return choices;
}
/** Extend the existing asset executor for distinct, event-acquired franchise holdings. */
export function afterEventAsset(prev: GameState, id: string, cost: number): GameState {
  const state = structuredClone(prev), [group, action, ...tail] = id.split(':'), key = tail.join(':');
  if (group !== 'biz') return state;
  if (action === 'up') delete state.timers[K.shopDiscount];
  if (action === 'sell') delete state.timers[slumpKey(key)];
  if (!eventFranchise(key)) return state;
  const holding = state.holdings.find(row => row.id === key);
  if (holding && action === 'up') { holding.level = (holding.level + 1) as typeof holding.level; holding.paid += cost; }
  if (action === 'sell') state.holdings = state.holdings.filter(row => row.id !== key);
  return state;
}
