// §9.2 A, in specification order. Shared event vocabulary is local to T11's files.
import { careerAge } from './career2.ts';
import { applyFamilyChoice } from './family.ts';
import { FAMILY_KEYS, FAMILY_RULES, HOMES, LIFE_RULES, STAT_LABEL } from './life-data.ts';
import type { ChanceMod, Choice, Effect, EventDef, GameState, StatMap } from './types.ts';

export type EventExtra = {
  popup?: 'wedding' | 'estate' | 'bargain' | 'headhunter' | 'retire' | 'franchise';
  baby?: number; kidPoints?: number; kidWedding?: number; points?: number; dog?: number;
  rent?: number; rentReset?: number; deposit?: number; homeValue?: number; carWait?: number; carRepair?: number; healthWait?: number;
  perf?: number; perfSet?: number; promote?: number; demote?: number; warn?: number;
  move?: string; quit?: 'jobless' | 'retired'; salaryWait?: number; strike?: number;
  shopDiscount?: number; shopWait?: number; sellShop?: number; franchise?: number;
};
export type LifeEffect = Effect & { extra?: EventExtra };
export type LifeChoice = Omit<Choice, 'effect' | 'roll'> & {
  effect?: LifeEffect; roll?: { base: number; mods?: ChanceMod[]; success: LifeEffect; fail: LifeEffect };
};
export type LifeEvent = Omit<EventDef, 'choices'> & {
  choices: (LifeChoice | ((state: GameState) => LifeChoice))[];
  eligible?: (state: GameState) => boolean; once?: boolean; life?: boolean; initial?: StatMap;
};
export const EVENT_RULES = {
  cooldown: 24, halfPct: 50, retirePct: 150, discountPct: 5, shopDiscountPct: 30,
  dogCost: 5, dogHappy: 2, franchiseIncome: 90, franchisePrice: 3000, bargainPrice: 2200,
  headhunterPct: 200, weddingPoints: 300, teenAge: [13, 18], talentAge: [7, 15], weddingAge: [28, 200],
  healthyEvents: ['illness'], flightTracks: ['pilot', 'employee', 'instructor', 'rescue', 'creator', 'inspector', 'film', 'racer', 'solo', 'company', 'academy'],
} as const;
export const EVENT_KEYS = {
  popup: 'event_popup', lifeAt: 'event_life_at', dog: 'event_dog',
  rent: 'event_rent', homeValue: 'event_home_value', carUntil: 'event_car_until', healthyUntil: 'event_healthy_until',
  salaryUntil: 'event_salary_until', strikeAt: 'event_strike_at', shopUntil: 'event_shop_until',
  shopDiscount: 'event_shop_discount', franchise: 'event_franchise', points: 'event_points',
  kid: 'event_kid', headhunter: 'event_headhunter', annual: 'event_annual',
  married: (kid: number) => `event_kid_married:${kid}`,
  weddingSeen: (kid: number) => `event_kid_wedding:${kid}`,
  popupIds: ['wedding', 'estate', 'bargain', 'headhunter', 'retire', 'franchise'],
} as const;
export const EVENT_TEXT = {
  unchanged: '변화 없음.', success: '성공', fail: '실패', divider: ' · ',
  cost: (n: number) => `비용 ${n}만원. `, chance: (n: number) => `기본 확률 ${n}%. `,
  dog: '반려견 생활비', rent: '월세 인상분', salary: '사건 급여 조정', improvedRent: '리모델링 임대 수입',
  carRepaired: '차량 수리를 마쳐 이동 보너스를 다시 쓸 수 있다.',
  estate: '이번 거래의 주택 가격', retire: ['구직자로 새 출발', '은퇴한다'], franchise: '협상한 조건으로 가맹',
  fullStamina: '체력을 상한까지 회복한다.', partner: '인연이 생겼다.',
  values: { wedding: '결혼식', estate: '부동산', bargain: '주택 매입 5% 할인', headhunter: '같은 직급 인정, 이직 시 급여 2회분',
    retire: '퇴직금 150%, 구직자 또는 은퇴 선택', franchise: '2,200만원에 가맹', jobless: '구직자', retired: '은퇴',
    'B-o0': '도심 출발 칸', 'C-o0': '산업 벨트 출발 칸' } as Record<string, string>,
  extra: { popup: '후속 선택', baby: '자녀', kidPoints: '자녀 장래', kidWedding: '자녀 결혼', points: '업적',
    dog: '반려견 입양 (생활비 +5/계절, 행복 +2/년)', rent: '계절 월세', rentReset: '인상 전 월세로 새 계약', deposit: '보증금', homeValue: '집 가치',
    carWait: '차량 이동 보정 중단 계절', carRepair: '차량 이동 보정 복구', healthWait: '질병 예방 계절', perf: '성과', perfSet: '성과 설정',
    promote: '승급', demote: '좌천', warn: '경고', move: '이동', quit: '퇴직 후 신분',
    salaryWait: '급여 50% 계절', strike: '이번 계절 급여 제외', shopDiscount: '다음 확장 할인 %',
    shopWait: '가게 수입 50% 계절', sellShop: '가게 매각', franchise: '프랜차이즈 가입' },
} as const;
export const effect = (add: StatMap = {}, extra: EventExtra = {}): LifeEffect => ({
  add, extra, text: [...Object.entries(add).map(([key, n]) => `${STAT_LABEL[key as keyof StatMap]} ${n! >= 0 ? '+' : ''}${n}`),
    ...Object.entries(extra).map(([key, n]) => key === 'carRepair' ? EVENT_TEXT.carRepaired
      : `${EVENT_TEXT.extra[key as keyof EventExtra]} ${typeof n === 'string' ? EVENT_TEXT.values[n] ?? n : n}`)]
    .join(EVENT_TEXT.divider) || EVENT_TEXT.unchanged,
});
export function answer(title: string, add: StatMap = {}, cost = 0, extra: EventExtra = {}): LifeChoice {
  const outcome = effect(add, extra);
  return { title, desc: (cost ? EVENT_TEXT.cost(cost) : '') + outcome.text, cost, effect: outcome };
}
export function gamble(title: string, base: number, success: LifeEffect, fail: LifeEffect,
  cost = 0, mods?: ChanceMod[]): LifeChoice {
  return { title, desc: (cost ? EVENT_TEXT.cost(cost) : '') + EVENT_TEXT.chance(base)
    + `${EVENT_TEXT.success}: ${success.text} / ${EVENT_TEXT.fail}: ${fail.text}`,
  cost, roll: { base, success, fail, ...(mods && { mods }) } };
}
const partner = (add: StatMap): LifeEffect => ({ ...effect(add), flag: FAMILY_RULES.partner,
  text: `${EVENT_TEXT.partner} ${effect(add).text}` });
export const materialize = (event: LifeEvent, state: GameState) => ({ ...event,
  choices: event.choices.map(choice => typeof choice === 'function' ? choice(state) : choice) });
const single = (s: GameState) => s.family.marriedAt === null;
const unpaired = (s: GameState) => single(s) && s.family.partnerAt === null && !s.flags.includes(FAMILY_RULES.partner);
export function childFor(s: GameState, ages: readonly number[], unwedded = false): number {
  return s.family.kids.findIndex((kid, i) => {
    const age = Math.floor((s.turn - kid.born) / LIFE_RULES.seasons.length);
    return age >= ages[0] && age <= ages[1] && (!unwedded || (s.timers[EVENT_KEYS.married(i)] === undefined
      && s.timers[EVENT_KEYS.weddingSeen(i)] === undefined));
  });
}
export const EVENTS_A: LifeEvent[] = [
  { id: 'blind_date', title: '소개팅 주선', text: '친구가 잘 맞을 것 같은 사람을 소개해 주겠다고 한다.', place: 'culture', when: {}, weight: 6, life: true,
    eligible: s => unpaired(s) && careerAge(s) >= 22, choices: [
      gamble('나간다', 45, partner({ happy: 10 }), effect({ happy: -2 }), 30,
        [{ stat: 'rep', over: 0, per: 15, pct: 1, cap: 20 }]), answer('다음에', { stamina: 5 })] },
  { id: 'old_friend', title: '동창의 고백', text: '오랜 친구가 조심스럽게 마음을 전한다.', place: 'culture', when: { min: { net: 30 } }, weight: 4, life: true,
    eligible: unpaired, choices: [{ title: '받아들인다', desc: partner({ happy: 8, stamina: -5 }).text,
      effect: partner({ happy: 8, stamina: -5 }) }, answer('친구로 남는다', { net: 6 })] },
  { id: 'proposal', title: '프로포즈', text: '함께 살아갈 미래에 관해 이야기할 때가 왔다.', place: 'wedding', when: {}, weight: 8, life: true,
    eligible: s => single(s) && s.family.partnerAt !== null && s.turn - s.family.partnerAt >= 4 && (s.home?.tier ?? 0) >= 2,
    choices: [answer('청혼한다', {}, 0, { popup: 'wedding' }), answer('조금 더 만난다', { happy: 3 })] },
  { id: 'baby_news', title: '아이 소식', text: '우리 집에 새로운 식구를 맞이할 준비를 한다.', place: 'hospital', when: {}, weight: 6, life: true,
    eligible: s => !single(s) && careerAge(s) <= 45 && s.family.kids.length < FAMILY_RULES.maxKids
      && s.family.kids.filter(k => s.turn - k.born < FAMILY_RULES.independentAge * LIFE_RULES.seasons.length).length < (HOMES[s.home?.tier ?? 0]?.kids ?? 0),
    choices: [answer('맞이한다', { happy: 30, stamina: -10 }, 150, { baby: 1 }), answer('아직은', { happy: -3 })] },
  { id: 'parents_60', title: '부모님 환갑', text: '부모님의 환갑을 어떻게 기념할지 가족이 모였다.', place: 'home', when: {}, weight: 3, life: true, once: true,
    eligible: s => careerAge(s) >= 30 && careerAge(s) <= 45, choices: [answer('잔치', { happy: 15, net: 8 }, 400), answer('여행을 보내 드린다', { happy: 25 }, 900), answer('마음만', { happy: -2 })] },
  { id: 'couple_crisis', title: '부부의 위기', text: '바쁜 일상에 서로의 마음을 살필 시간이 부족했다.', place: 'home', when: {}, weight: 4, life: true,
    eligible: s => !single(s) && (s.job.perf >= 70 || (s.timers[FAMILY_KEYS.lastExhausted] ?? 0) >= 2), choices: [
      answer('함께 여행', { happy: 12 }, 300), gamble('대화한다', 60, effect({ happy: 6 }), effect({ happy: -10 }))] },
  { id: 'kid_talent', title: '아이의 재능', text: '아이가 좋아하는 일에서 눈에 띄는 재능을 보인다.', place: 'home', when: {}, weight: 5, life: true,
    eligible: s => childFor(s, EVENT_RULES.talentAge) >= 0, choices: [answer('레슨', { happy: 4 }, 250, { kidPoints: 1 }),
      gamble('대회에 내보낸다', 50, effect({ happy: 8 }, { kidPoints: 1 }), effect({ happy: -2 }), 80), answer('지켜본다', { happy: 1 })] },
  { id: 'kid_teen', title: '사춘기', text: '아이가 혼자 있고 싶다며 방문을 닫았다.', place: 'home', when: {}, weight: 4, life: true,
    eligible: s => childFor(s, EVENT_RULES.teenAge) >= 0, choices: [answer('시간을 낸다', { stamina: -20, happy: 8 }, 0, { perf: -5 }), answer('용돈', { happy: 2 }, 100), answer('그냥 둔다', { happy: -6 })] },
  { id: 'family_trip', title: '가족 여행', text: '가족이 달력을 펴 놓고 여행 이야기를 나눈다.', place: 'home', when: {}, weight: 5, life: true,
    eligible: s => !single(s), choices: [answer('해외', { happy: 20, stamina: 20 }, 600), answer('국내', { happy: 8, stamina: 10 }, 150), answer('집에서 쉰다', { stamina: 15 })] },
  { id: 'kid_wedding', title: '자녀 결혼', text: '자녀가 평생 함께할 사람을 소개한다.', place: 'wedding', when: {}, weight: 10, life: true,
    eligible: s => childFor(s, EVENT_RULES.weddingAge, true) >= 0, choices: [answer('집을 보탠다', { happy: 30 }, 3000, { kidWedding: 1, points: 300 }),
      answer('예식비', { happy: 15 }, 1000, { kidWedding: 1 }), answer('축하만', { happy: 3 }, 0, { kidWedding: 1 })] },
  { id: 'grandchild', title: '손주', text: '자녀의 집에서 반가운 새 식구 소식이 왔다.', place: 'home', when: {}, weight: 5, life: true,
    eligible: s => s.family.kids.some((_, i) => s.timers[EVENT_KEYS.married(i)] !== undefined), choices: [answer('돌잔치', { happy: 15 }, 300), answer('안아 준다', { happy: 8 })] },
  { id: 'stray_dog', title: '유기견', text: '집으로 돌아오는 길에 주인을 잃은 개를 만났다.', place: 'park', when: {}, weight: 3, life: true, once: true,
    choices: [answer('입양', {}, 0, { dog: 1 }), answer('임시 보호', { happy: 5 }, 50), answer('지나친다')] },
];

/** Detached family updates; monetary/stat effects have already been applied by the engine. */
export function familyEventEffect(prev: GameState, extra: EventExtra): GameState {
  let state = structuredClone(prev);
  if (extra.baby) state = applyFamilyChoice(state, 'baby', true);
  if (extra.kidPoints) {
    const kid = state.family.kids[childFor(state, EVENT_RULES.talentAge)];
    if (kid) kid.pts = Math.min(FAMILY_RULES.maxPoints, kid.pts + extra.kidPoints);
  }
  if (extra.kidWedding) {
    const kid = state.timers[EVENT_KEYS.kid] ?? childFor(state, EVENT_RULES.weddingAge, true);
    if (kid >= 0) state.timers[EVENT_KEYS.married(kid)] = state.turn;
  }
  if (extra.points) state.timers[EVENT_KEYS.points] = (state.timers[EVENT_KEYS.points] ?? 0) + extra.points;
  if (extra.dog) state.timers[EVENT_KEYS.dog] = extra.dog;
  return state;
}
