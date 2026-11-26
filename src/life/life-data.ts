import { josa } from './text.ts';
// Life calendar, defaults and copy; shared catalog values are in data.ts.
import { ENDINGS, RULES, SPACE_MENU as V1_SPACE_MENU, STAT_LABEL as V1_STAT_LABEL,
  STAT_MAX as V1_STAT_MAX } from './data.ts';
import { ACTIONS } from './compat.ts';
import { TRACK_PREP, TRACK_TRAIN, TRACK_WORK } from './tracks.ts';
import type { Choice, EndingId, GameState, MapId, PlaceId, SpaceKind, Stat, StatMap, TrackId } from './types.ts';

export const LIFE_RULES = {
  version: 2,
  maxTurns: 204,
  startAge: 19,
  seasons: ['봄', '여름', '가을', '겨울'],
  periods: [
    { name: '청년기', minAge: 19, maxAge: 34, seasons: 64 },
    { name: '중년기', minAge: 35, maxAge: 54, seasons: 80 },
    { name: '장년기', minAge: 55, maxAge: 69, seasons: 60 },
  ],
  staminaCaps: [{ minAge: 60, cap: 80 }, { minAge: 50, cap: 90 }, { minAge: 19, cap: 100 }],
  lifeEventYears: 2,
  spring: 0,
  restGain: 60,
  eventCooldown: RULES.eventCooldown,
  start: { ...RULES.start, happy: 100, fans: 0, homeIndex: 100, capStamina: 100 },
  startNode: 'A-o0',
  percent: 100,
  actionGainPct: 85,
  actionGainStats: ['theory', 'skill', 'xp', 'rep', 'teach', 'biz', 'net', 'support'] as readonly Stat[],
  uintMax: 0xffffffff,
  defaultSeed: 1,
  statMax: 9_000_000,
  logMax: 30,
  diceCounts: [0, 2, 3],
  mapMask: 63,
  minCapStamina: 60,
  minHomeIndex: 60,
  maxHomes: 3,
  maxHoldings: 4,
} as const;

export const STAT_LABEL: Record<Stat, string> = {
  ...V1_STAT_LABEL, happy: '행복', fans: '팬', homeIndex: '집값 지수', capStamina: '체력 상한',
};
export const STAT_MAX: Partial<Record<Stat, number>> = {
  ...V1_STAT_MAX, happy: 999, fans: 999, homeIndex: 200, capStamina: 100,
};
export const STATS = Object.keys(STAT_LABEL) as Stat[];
export const MAP_IDS: MapId[] = ['A', 'B', 'C', 'D', 'E', 'F'];
export const TRACK_IDS: TrackId[] = ['service', 'delivery', 'mechanic', 'clerk', 'pilot', 'employee',
  'instructor', 'public', 'rescue', 'creator', 'engineer', 'inspector', 'film', 'atc', 'racer',
  'solo', 'company', 'academy', 'director'];
export const STATUS_IDS = ['student', 'jobless', 'working', 'retired'];
export const PHASE_IDS = ['action', 'event', 'ended'];
export const STEP_IDS = ['spin', 'pick', 'space', 'bonus'];
export const LOG_TONES = ['good', 'bad', 'info'];
export const FUND_KINDS = [0, 1, 2];
export const LIFE_LEVELS = [0, 1, 2, 3];
export const KID_STAGES = [0, 1, 2, 3, 4];
export const HOLDING_LEVELS = [1, 2, 3];

// §8.1. Rental deposits are fixed; owned homes use map and annual index multipliers.
export const HOMES = [
  { tier: 0, name: '본가 / 숙소', price: 0, upkeep: 0, rest: 60, recovery: 20, happy: 0, adults: 1, kids: 0 },
  { tier: 1, name: '월세 원룸', price: 0, upkeep: 25, rest: 60, recovery: 20, happy: 0, adults: 1, kids: 0 },
  { tier: 2, name: '전세 빌라', price: 1500, upkeep: 5, rest: 65, recovery: 22, happy: 1, adults: 2, kids: 0 },
  { tier: 3, name: '소형 아파트', price: 6000, upkeep: 10, rest: 70, recovery: 24, happy: 2, adults: 2, kids: 1 },
  { tier: 4, name: '중형 아파트', price: 8000, upkeep: 20, rest: 75, recovery: 26, happy: 3, adults: 2, kids: 3 },
  { tier: 5, name: '대형 아파트', price: 32000, upkeep: 35, rest: 80, recovery: 28, happy: 5, adults: 2, kids: 3 },
  { tier: 6, name: '펜트하우스', price: 60000, upkeep: 60, rest: 85, recovery: 30, happy: 7, adults: 2, kids: 3 },
] as const;
export const HOME_RULES = {
  rentalTiers: [1, 2] as readonly number[], ownedTier: 3, maxOwned: 4, moving: 80,
  country: { map: 'F', tier: 5, price: 12000, name: '전원주택' },
  penthouse: { map: 'E', tier: 6 }, unavailableMap: 'D',
  familyMap: 'A', familyAge: 29, lodging: 20,
  rentNumerator: 12, rentDenominator: 1000, mortgagePct: 50,
  indexMinChange: -4, indexMaxChange: 6, indexAt: 'home_index_at',
} as const;
export const HOME_TEXT = {
  rent: (name: string) => `${name} 구하기`, buy: (name: string) => `${name} 사기`,
  mortgage: (name: string) => `${name} 사기 · 담보 대출 50%`,
  sell: (name: string) => `${name} 팔기 / 계약 끝내기`, move: (name: string) => `${josa(name, '으로/로')} 이사`,
  details: (price: number, moving: number, refund: number, loan: number, income: number) =>
    `값 ${price}만원 · 이사 ${moving}만원 · 보증금 반환 ${refund}만원 · 담보 대출 ${loan}만원 · 임대 수입 계절당 ${income}만원.`,
  occupied: '거주할 집을 마련했다.', rented: '추가 주택을 세놓았다.', sold: '집을 팔거나 임대 계약을 끝냈다.',
  moved: '거주지를 옮겼다.', maxOwned: '집은 최대 4채까지 보유할 수 있습니다.',
  maxEstates: '세놓은 집은 최대 3채입니다. 먼저 한 채를 팔아 주세요.',
} as const;

// §8.2–8.4. Leisure reuses the camping/domestic/overseas rows of §9.2.
export const WEDDINGS = [
  { title: '작은 결혼식', cost: 300, add: { happy: 20 } },
  { title: '예식장', cost: 1200, add: { happy: 35, net: 10 } },
  { title: '호화 예식', cost: 3500, add: { happy: 50, net: 20, rep: 10 } },
] satisfies { title: string; cost: number; add: StatMap }[];
export const EDU = [
  { age: 7, title: '특기 교육', cost: 800 },
  { age: 13, title: '특목 준비', cost: 1500 },
  { age: 16, title: '유학', cost: 3000 },
] as const;
export const INDEPENDENCE = [
  { min: 0, happy: 20, points: 200 }, { min: 3, happy: 40, points: 500 },
  { min: 6, happy: 70, points: 1000 },
] as const;
export const GIFTS = [
  { cost: 0, happy: 0 }, { cost: 500, happy: 8 }, { cost: 2000, happy: 20 },
] as const;
export const HAPPY_YEAR = {
  living: [-2, 0, 3, 6], spouse: 3, homeFocus: 2, child: 2, exhausted: -1,
  debt: -2, jobless: -3, retiredResort: 3, crowded: -3,
} as const;
export const FAMILY_RULES = {
  partner: 'partner', dateCost: 30, dateChance: 45, repPer: 15, repCap: 20, wait: 4,
  marriageTier: 2, babyCost: 150, babyHappy: 30, babyMaxAge: 45, maxKids: 3,
  independentAge: 20, independentStage: 4, schoolFee: 20, schoolPoints: 1,
  specialPoints: 2, extraPoints: 1, educationChance: 60, maxPoints: 9,
  focusRecovery: 3, singlePct: 150, exhaustedBelow: 20, resortMap: 'F',
  localMap: 'A', localPlace: 'park',
  localEvents: ['blind_date', 'proposal', 'baby_news'] as readonly string[],
  datePlaces: ['park', 'culture', 'waterfront_park'] as readonly string[],
  weddingPlaces: ['wedding', 'resort'] as readonly string[], babyPlace: 'hospital',
  feat: (kid: number) => `kid_independent:${kid}`,
} as const;
/** Forced stops on the way (like the review stop): a student ready for the licence exam stops at
 * the exam site, and an open marriage or birth step stops at the first map's local life tile. */
export const STOP_RULES = {
  examAction: 'st_exam', familyEvents: ['proposal', 'baby_news'] as readonly string[],
} as const;
export const FAMILY_KEYS = {
  dual: 'family_choose_dual', season: 'family_season', year: 'family_year',
  exhausted: 'family_exhausted', lastExhausted: 'family_last_exhausted',
  school: (kid: number) => `family_school:${kid}`,
} as const;
export const LEISURE = [
  { id: 'camping', title: '캠핑 취미', cost: 200, happy: 8, stamina: 10,
    places: ['park', 'culture', 'waterfront_park', 'golf'] },
  { id: 'domestic', title: '국내 여행', cost: 150, happy: 8, stamina: 10,
    places: ['waterfront_park', 'resort'] },
  { id: 'overseas', title: '해외 여행', cost: 600, happy: 20, stamina: 20,
    places: ['waterfront_park', 'resort'] },
] as const;
export const FAMILY_TEXT = {
  localEvent: { blind_date: '드론 동호회의 만남 주선', proposal: '함께 날 미래 이야기', baby_news: '우리 집 작은 비행사 소식' } as Record<string, string>,
  localDesc: '드론을 접고 함께 날 미래를 이야기해요. 다음 카드에서 마음을 정할 수 있어요.',
  visit: (map: string, place: string) => `${map} · ${josa(place, '으로/로')} 이동`,
  visitDesc: (reason: string, fare: number) => `${reason} 이번 계절의 룰렛 대신 바로 이동한다. 교통비 ${fare}만원.`,
  visitReasons: { date: '드론 산책 모임에서 인연을 만나 보세요.', wedding: '함께 날 약속을 할 때예요. 예식장 거리에 결혼식이 열려 있어요.', baby: '작은 비행사를 맞이할 자리가 생겼어요. 종합 병원에서 가족 소식을 확인하세요.' },
  date: '드론 산책 소개팅', dateDesc: '비용 30만원. 기본 45%, 평판 15마다 +1%p(최대 +20).',
  partner: '새로운 인연을 만났다.', missed: '서로의 다음 인연을 응원했다.',
  wedding: '결혼식을 올렸다.', weddingDesc: (cost: number, happy: number) => `비용 ${cost}만원 · 행복 +${happy}.`,
  wait: '인연이 생긴 뒤 4계절이 지나야 합니다.', home: '전세 빌라 이상의 보금자리가 필요합니다. 부동산 칸에서 구할 수 있어요.',
  dual: ['가정 중심', '맞벌이'], dualDesc: ['연말 행복 +2 · 계절 회복 +3.', '계절 수입 +80부터.'],
  dualDone: '부부의 생활 방식을 정했다.', baby: '아이 맞이하기', babyDone: '새 식구를 맞이했다.',
  babyDesc: '비용 150만원 · 행복 +30.', married: '기혼일 때 가능합니다.',
  age: '45세까지만 아이를 맞이할 수 있습니다.', capacity: '집의 자녀 정원 또는 최대 3명에 도달했습니다.',
  school: '학교에 맡긴다', academy: '학원', educationDone: '아이의 교육 방향을 정했다.',
  specialDone: '교육을 통해 아이의 재능이 자랐다.', educationDesc: (kid: number, age: number, cost: number, points: number) =>
    `${kid + 1}번째 자녀 · ${age}세. 비용 ${cost}만원 · 장래 +${points}.`,
  academyDesc: '다음 교육 팝업까지 계절당 20만원 · 장래 +1.', specialDesc: '60% 확률로 장래 +1 추가.',
  gift: (cost: number) => `독립 지원금 ${cost}만원`, independent: '자녀가 독립했다.',
  giftDesc: (kid: number, happy: number, points: number) => `${kid + 1}번째 자녀 · 행복 +${happy} · 업적 ${points}점.`,
  leisureDone: '여가를 즐기며 재충전했다.', leisureDesc: (cost: number, happy: number, stamina: number) =>
    `비용 ${cost}만원 · 행복 +${happy} · 체력 +${stamina}.`,
} as const;

const actionIds = new Set(ACTIONS.map(action => action.id));
export const SPACE_MENU: Partial<Record<SpaceKind, string[]>> = {
  train: [...TRACK_TRAIN.map(action => action.id), ...V1_SPACE_MENU.train.filter(id => actionIds.has(id))],
  job: [...TRACK_WORK.map(action => action.id), ...V1_SPACE_MENU.job.filter(id => actionIds.has(id))],
  rankup: TRACK_PREP.map(action => action.id),
  contest: [], event: [], rest: [], start: [], pay: [],
};
// Job duties also earn performance when selected in the extra-action slot.
export const CAREER_ACTIONS = [...SPACE_MENU.job!, 'pi_assist', 'ac_teach', 'dir_forum', 'assoc_volunteer'];
export const SETTLEMENT_KINDS: SpaceKind[] = ['pay', 'start'];

export const BOARD_CHOICES: Record<'spin' | 'skip' | 'end', Choice> = {
  spin: { title: '룰렛 돌리기', desc: '룰렛 두 개를 돌려 나온 수를 더한 만큼 간다.', effect: { text: '룰렛을 돌렸다.' } },
  skip: { title: '그냥 지나간다', desc: '이번 칸의 행동을 건너뛴다.', effect: { text: '이번 칸을 그냥 지나갔다.' } },
  end: { title: '계절 마치기', desc: '이번 계절을 마무리한다.', effect: { text: '이번 계절을 마무리했다.' } },
};
export const TEXT = {
  date: (age: number, season: string) => `${age}세 · ${season}`,
  goTitle: (place: string, steps: number) => `${place} · ${steps}걸음`,
  goDesc: (fare: number) => `이곳으로 이동한다. 통행료 ${fare}만원.`,
  arrived: (place: string) => `${place}에 도착했다.`,
  settled: '쌓인 장부를 정산했다.',
  rested: '쉬면서 체력을 회복했다.',
  statusLock: '지금 신분으로는 할 수 없음',
  trackLock: '지금 직업으로는 할 수 없음',
  anyLock: '필요한 조건 중 하나를 충족해야 함',
  minLock: (stat: string, need: number, now: number) => `${stat} ${need} 이상 필요 (현재 ${now})`,
  maxLock: (stat: string, most: number) => `${stat} ${most} 이하일 때만 가능`,
  flagLock: (flag: string) => `${flag} 필요`,
  notFlagLock: (flag: string) => `이미 ${flag} 보유`,
  moneyLock: (cost: number) => `자금 부족 (${cost}만원 필요)`,
  tireLock: (tire: number, now: number) => `체력 부족 (${tire} 필요, 현재 ${now})`,
  unavailable: (id: string) => `option not available: ${id}`,
  disabled: (id: string, locks: string[]) => `option disabled: ${id} (${locks.join(', ')})`,
  crash: '기체가 추락해 크게 부서졌다. 드론 등급이 한 단계 내려갔다.',
  lost: '기체가 추락해 전손됐다. 드론을 잃었다.',
  balanceAdjustment: '잔액 한도 조정',
  overdue: (strikes: number) => `대출 한도 초과 — 연체 경고 ${strikes}/${RULES.overdueStrikes}`,
  log: (title: string, text: string) => `${title} — ${text}`,
  finished: '70세 봄, 인생의 결산을 마쳤다.',
};

export const INITIAL_STATE: GameState = {
  v: LIFE_RULES.version, seed: LIFE_RULES.defaultSeed, rng: LIFE_RULES.defaultSeed,
  turn: 0, status: 'student', track: null, phase: 'action',
  board: { pos: LIFE_RULES.startNode, step: 'spin', dice: [], ledger: {},
    lapAt: { A: -1, B: -1, C: -1, D: -1, E: -1, F: -1 }, visited: 1, laps: 0, contests: 0, rankups: 0 },
  s: { ...Object.fromEntries(STATS.map(stat => [stat, 0])), ...LIFE_RULES.start } as Record<Stat, number>,
  job: { rank: 0, perf: 0, tenure: 0, total: 0, warn: 0, changedAt: -1, tracks: [] },
  home: null, estates: [], holdings: [], hand: [],
  family: { partnerAt: null, marriedAt: null, dual: false, kids: [] },
  fund: { kind: 0, amount: 0 }, life: 0, timers: {}, flags: [], feats: [],
  eventId: null, seen: {}, ending: null, score: 0, log: [],
};

// T09 tables: §§8.5–8.6 and 9.3. Income tuples are spring, summer, autumn, winter.
export type ShopDef = { id: string; name: string; map: MapId; place: PlaceId; price: number;
  income: readonly number[]; indexed?: boolean; equipmentDiscount?: number };
export const SHOPS: readonly ShopDef[] = [
  { id: 'drone_cafe', name: '드론 카페', map: 'B', place: 'mall', price: 1200, income: [35, 35, 35, 35] },
  { id: 'drone_shop', name: '드론 숍', map: 'B', place: 'mall', price: 3000, income: [80, 80, 80, 80], equipmentDiscount: 10 },
  { id: 'farm', name: '방제 농장', map: 'C', place: 'logistics', price: 2500, income: [110, 110, 30, 30] },
  { id: 'waterfront_cafe', name: '수변 카페', map: 'E', place: 'waterfront_mall', price: 2000, income: [60, 60, 60, 60] },
  { id: 'franchise', name: '프랜차이즈 지점', map: 'E', place: 'waterfront_mall', price: 5000, income: [130, 130, 130, 130] },
  { id: 'building', name: '임대 빌딩', map: 'E', place: 'waterfront_mall', price: 25000, income: [600, 600, 600, 600], indexed: true },
  { id: 'pension', name: '펜션', map: 'F', place: 'pension', price: 4000, income: [70, 180, 70, 70] },
];
export const FUNDS = [
  { kind: 0, name: '안정형', chance: 100, gain: 4, loss: 4, desc: '연말 수익 +4%.' },
  { kind: 1, name: '성장형', chance: 60, gain: 14, loss: -8, desc: '연말 60% 확률 +14%, 40% 확률 −8%.' },
  { kind: 2, name: '모험형', chance: 45, gain: 35, loss: -20, desc: '연말 45% 확률 +35%, 55% 확률 −20%.' },
] as const;
export const ASSET_RULES = {
  upgradePct: 60, incomeStepPct: 50, resalePct: 70, maxLevel: 3, phoneFeePct: 2,
  fundAmounts: [100, 500, 2000], couponPct: 20, benefactorPct: 10, dreamPct: 20,
  demotionPerf: -15, promotionPerf: 60, waitPerf: 10, waitRep: 3,
  singleStep: 1,
} as const;
export const ASSET_KEYS = {
  lastLuck: 'asset_last_luck', popup: 'asset_popup', shortcut: 1, promotion: 2,
  triple: 'card_active_triple', transfer: 'card_active_transfer', benefactor: 'card_active_benefactor',
  coupon: 'card_active_discount', dream: 'card_active_dream', fundYear: 'asset_fund_year',
} as const;
export type LuckDef = { id: string; title: string; text: string; add?: StatMap; flag?: string;
  action?: 'again' | 'shortcut' | 'promotion' | 'demotion'; fallback?: StatMap };
export const LUCK: readonly LuckDef[] = [
  { id: 'prize', title: '경품 당첨', text: '경품으로 300만원을 받았다.', add: { money: 300 } },
  { id: 'refund', title: '세금 환급', text: '세금 150만원을 돌려받았다.', add: { money: 150 } },
  { id: 'parking', title: '주차 위반', text: '주차 위반으로 80만원을 냈다.', add: { money: -80 } },
  { id: 'wedding_gift', title: '축의금', text: '축의금 100만원을 내고 인맥이 5 늘었다.', add: { money: -100, net: 5 } },
  { id: 'again', title: '한 번 더', text: '이번 계절에 한 번 더 돌린다.', action: 'again' },
  { id: 'triple', title: '세 개의 룰렛', text: '다음 이동에서 룰렛 세 개 중 두 개를 골라 더한 만큼 간다.', flag: ASSET_KEYS.triple },
  { id: 'transfer', title: '무료 환승권', text: '다음 환승은 통행료가 없다. 특구 진입 조건은 필요하다.', flag: ASSET_KEYS.transfer },
  { id: 'shortcut', title: '지름길', text: '이 지도에서 원하는 칸 종류를 골라 가장 가까운 칸으로 간다.', action: 'shortcut' },
  { id: 'promotion', title: '발탁', text: '급여 직군은 특별 승진 제안을 받는다. 그 밖에는 평판 +8.', action: 'promotion', fallback: { rep: 8 } },
  { id: 'demotion', title: '한직 발령', text: '급여 직군은 성과 −15. 그 밖에는 평판 −5.', action: 'demotion', fallback: { rep: -5 } },
  { id: 'tonic', title: '보약', text: '보약을 먹어 체력을 30 회복했다.', add: { stamina: 30 } },
  { id: 'cold', title: '감기', text: '감기로 체력이 20 줄었다.', add: { stamina: -20 } },
  { id: 'benefactor', title: '은인', text: '인맥 +10, 다음 승급 심사 성공률 +10%p.', add: { net: 10 }, flag: ASSET_KEYS.benefactor },
  { id: 'rumor', title: '구설수', text: '구설수로 평판이 8 줄었다.', add: { rep: -8 } },
  { id: 'discount', title: '단골 할인', text: '다음 상점가 또는 상가 구매가 20% 할인된다.', flag: ASSET_KEYS.coupon },
  { id: 'dream', title: '돼지꿈', text: '다음 성공 여부 굴림의 성공률 +20%p.', flag: ASSET_KEYS.dream },
];
export const ASSET_TEXT = {
  buy: (name: string) => `${name} 구입`, up: (name: string) => `${name} 확장`,
  sell: (name: string) => `${name} 매각`, check: (name: string) => `${name} 매출 점검`,
  bought: '가게를 구입했다.', upgraded: '가게를 한 단계 확장했다.', sold: '가게를 매각했다.', checked: '이번 계절 수입을 한 번 더 받았다.',
  shop: (cost: number, income: number) => `${cost}만원. 이번 계절 수입 ${income}만원.`,
  capacity: '가게는 최대 4곳까지 보유할 수 있습니다.', level: '이미 최대 3단계입니다.',
  deposit: (n: number) => `펀드에 ${n}만원 넣기`, withdraw: (n: number) => `펀드에서 ${n}만원 빼기`,
  kind: (name: string) => `${josa(name, '으로/로')} 변경`, deposited: '펀드에 돈을 넣었다.', withdrawn: '펀드에서 돈을 뺐다.', changed: '펀드 유형을 바꾸었다.',
  fundFee: (fee: number) => `수수료 ${fee}만원.`, fundShort: '펀드 잔액이 부족합니다.',
  fundYear: (name: string, delta: number) => `${name} 연말 수익 ${delta}만원.`,
  shortcut: (name: string) => `${name} 칸으로 지름길`, shortcutDone: '지름길로 이동했다.',
  promotion: '특별 승진을 받는다', promoted: '특별 승진으로 직급이 올랐다.',
  wait: '정식 심사를 기다린다', waited: '정식 심사를 준비하며 성과와 평판을 높였다.',
  badMove: 'Unreachable destination',
  kinds: { start: '출발', pay: '월급날', train: '배움', job: '일감', contest: '대회 · 시험', event: '사건',
    rest: '휴식', rankup: '승급 심사', jobfair: '취업 · 이직', shop: '상점가', estate: '부동산',
    life: '생활', biz: '상가', luck: '행운', station: '환승', invest: '투자' } satisfies Record<SpaceKind, string>,
} as const;

// §10: priority, copy and settlement values are shared by the engine and UI.
export type EndingCondition = { worthBelow: number } | { worthAtLeast: number } | { feat: string }
  | { tops: readonly TrackId[] } | { happy: number; independent?: number }
  | { current: readonly TrackId[] } | { last: readonly TrackId[]; flag?: string } | { fallback: true };
export type EndingDef = { id: EndingId; title: string; text: string; hint: string; rule: EndingCondition;
  art: { file: string } | { track: TrackId } | { place: PlaceId } };

const NEW_ENDINGS = {
  philanthropist: { title: '하늘에 길을 낸 사람',
    text: '첫 장학증서를 받은 학생이 실습장으로 달려간다. 당신의 이름을 단 재단보다, 그 아이가 오래 날 수 있는 하늘이 더 자랑스럽다.' },
  legend: { title: '전설의 레이서',
    text: '결승선 위로 기체가 지나가자 관중석이 일어선다. 기록판에서 내려온 뒤에도 후배들은 당신이 남긴 비행선을 연습한다.' },
  master: { title: '전문직 명장',
    text: '어려운 일이 생기면 동료들은 당신의 작업대부터 찾는다. 오래 쌓은 솜씨는 이제 다음 사람의 손끝으로 이어진다.' },
  star: { title: '스타 크리에이터',
    text: '작은 방에서 시작한 방송이 수많은 사람의 일상이 됐다. 카메라를 켜기 전, 오늘 처음 찾아올 한 사람에게 건넬 인사를 고른다.' },
  hero: { title: '구조 영웅',
    text: '구조를 마친 기체가 조용히 내려앉는다. 누군가 무사히 집으로 돌아갔다는 소식이, 진열장 속 어떤 표창보다 반갑다.' },
  tycoon: { title: '자산가',
    text: '집과 가게가 저마다의 불을 밝히는 저녁이다. 오래 적어 온 장부를 덮고, 내일부터는 조금 더 천천히 걸어 보기로 한다.' },
  family: { title: '다복한 집',
    text: '독립한 아이들이 저녁을 먹으러 찾아왔다. 식탁에 의자를 하나 더 놓으며, 함께 보낸 평범한 날들이 가장 큰 재산임을 느낀다.' },
  official: { title: '정년 퇴임 공직자',
    text: '마지막 결재를 마치고 책상을 비운다. 후임에게 넘긴 서류마다 시민들의 일상이 담겨 있다. 내일 아침에는 알람 없이 일어나도 된다.' },
  freeman: { title: '유유자적 자유인',
    text: '바람이 좋은 날에는 기체를 띄우고, 비가 오면 창가에서 쉰다. 남의 일정표 대신 오늘의 마음을 따라 사는 법을 배웠다.' },
  worker: { title: '성실한 생활인',
    text: '하루 일을 마치고 익숙한 길로 돌아온다. 요란한 기록은 없어도 당신이 지킨 약속 덕분에 누군가의 하루가 편안했다.' },
} as const;

const ENDING_ROWS: readonly [EndingId, string, EndingDef['art'], EndingCondition][] = [
  ['debtor', '순자산 −3,000만 미만', { file: 'ending-debtor' }, { worthBelow: -3000 }],
  ['philanthropist', '재단 설립', { place: 'school' }, { feat: 'foundation' }],
  ['ceo', '상장 성공', { file: 'ending-ceo' }, { feat: 'ceo' }],
  ['chairman', '당선 경력', { file: 'ending-chairman' }, { feat: 'chairman' }],
  ['academy', '교육원 인가 성공', { file: 'ending-academy' }, { feat: 'academy' }],
  ['legend', '레이서 최고 직급 경력', { track: 'racer' }, { tops: ['racer'] }],
  ['master', '엔지니어 · 점검 · 촬영 · 관제 중 최고 직급 경력', { track: 'engineer' }, { tops: ['engineer', 'inspector', 'film', 'atc'] }],
  ['star', '다이아 등급 경력', { track: 'creator' }, { tops: ['creator'] }],
  ['hero', '항공대장 경력', { track: 'rescue' }, { tops: ['rescue'] }],
  ['tycoon', '순자산 100,000만 이상', { place: 'residence' }, { worthAtLeast: 100000 }],
  ['family', '행복 700 이상 · 자녀 독립 2명 이상', { place: 'home' }, { happy: 700, independent: 2 }],
  ['official', '공무원으로 정년', { track: 'public' }, { feat: 'official' }],
  ['smallbiz', '결산 때 법인 대표', { file: 'ending-smallbiz' }, { current: ['company'] }],
  ['solo', '결산 때 또는 마지막 직업이 1인 사업자', { file: 'ending-solo' }, { last: ['solo'] }],
  ['director', '협회 임원 경력으로 마침', { file: 'ending-director' }, { last: ['director'] }],
  ['instructor', '마지막 직업이 교관 · 교육원', { file: 'ending-instructor' }, { last: ['instructor', 'academy'] }],
  ['employee', '마지막 직업이 드론 회사 직원 · 사무직', { file: 'ending-employee' }, { last: ['employee', 'clerk'] }],
  ['pilot', '마지막 직업이 파일럿 · 정비사 · 배송 기사 중 자격증 보유', { file: 'ending-pilot' }, { last: ['pilot', 'mechanic', 'delivery'], flag: 'licensed' }],
  ['freeman', '행복 500 이상', { place: 'promenade' }, { happy: 500 }],
  ['worker', '마지막 직업이 가게 직원 · 배송 기사 · 정비사', { track: 'service' }, { last: ['service', 'delivery', 'mechanic'] }],
  ['student', '그 밖의 인생', { file: 'ending-student' }, { fallback: true }],
];

export const ENDINGS2: readonly EndingDef[] = ENDING_ROWS.map(([id, hint, art, rule]) => {
  const copy = ENDINGS.find(row => row.id === id) ?? NEW_ENDINGS[id as keyof typeof NEW_ENDINGS];
  return { id, title: copy.title, text: copy.text, hint, art, rule };
});
export const ENDING_IDS = ENDINGS2.map(ending => ending.id);

export const FEATS = {
  visit: { title: '지도 첫 방문', points: 200 }, lap: { title: '지도 첫 완주', points: 300 },
  promotion: { title: '승급', points: 300 }, contest: { title: '대회 성공', points: 150 },
  top: { title: '직업 최고 직급', points: 2000 },
  three_jobs: { title: '서로 다른 직업 세 개', points: 500, count: 3 },
  home: { title: '내 집 마련', points: 500 }, marriage: { title: '결혼', points: 300 },
  independent: { title: '자녀 독립', levels: INDEPENDENCE },
  three_shops: { title: '가게 세 곳 보유', points: 500, count: 3 },
  ceo: { title: '상장', points: 5000 }, chairman: { title: '총협회장 당선', points: 4000 },
  academy: { title: '교육원 인가', points: 3500 },
  scholarship: { title: '장학금', points: 300 }, foundation: { title: '재단', points: 3000 },
  no_loan: { title: '대출 없이 완주', points: 1000 },
  event: { title: '사건 업적', points: 1 },
} as const;
export const ENDING_RULES = {
  happyPoints: 30, featCap: 30000, earlyAge: 55, happyPerYear: 2,
  grades: [{ grade: 'S', min: 120000 }, { grade: 'A', min: 70000 }, { grade: 'B', min: 40000 },
    { grade: 'C', min: 20000 }, { grade: 'D', min: 0 }],
  historyFeats: ['three_jobs', 'home', 'marriage', 'three_shops', 'ceo', 'chairman', 'academy'] as const,
  achievementEndings: ['ceo', 'chairman', 'academy'] as readonly string[],
  achievementFlags: { ceo: 'listed', chairman: 'elected', academy: 'accredited' } as Readonly<Record<string, string>>,
  earlyId: 'phone:retire', foundationEvent: 'foundation',
} as const;
export const ENDING_KEYS = {
  borrowed: 'ending_borrowed', lastTrack: 'ending_last_track', earlyAt: 'ending_early_at',
  top: (track: TrackId) => `top:${track}`, visit: (map: MapId) => `visit:${map}`, lap: (map: MapId) => `lap:${map}`,
} as const;
export const ENDING_TEXT = {
  early: { title: '은퇴하고 여생을 보낸다',
    desc: '70세까지 남은 계절의 연금·임대·가게 수입만 더한다. 남은 1년마다 행복 +2.',
    effect: { text: '일을 내려놓고 여생을 보낸 뒤 인생의 결산을 마쳤다.' } } satisfies Choice,
  unavailable: 'early retirement not available', tooSoon: 'settlement not available',
  counted: (title: string, count: number) => `${title} · ${count}회`,
  named: (title: string, name: string) => `${title} · ${name}`,
} as const;

// UX3a: owner-confirmed starting values; balance measurement belongs to UX3b.
export type DialNotch = 'safe' | 'mid' | 'bold';
export type DialSetting = { id: DialNotch; label: string; chanceDelta: number; crashDelta: number; payPct: number; tire: number };
export const DIAL_BONUS_CAP = 30;
export const DIAL_SETTINGS: readonly DialSetting[] = [
  { id: 'safe', label: '안정', chanceDelta: 10, crashDelta: -10, payPct: 85, tire: 2 },
  { id: 'mid', label: '보통', chanceDelta: 0, crashDelta: 0, payPct: 100, tire: 0 },
  { id: 'bold', label: '대담', chanceDelta: -10, crashDelta: 10, payPct: 120, tire: -2 },
];
// Tile actions keep their base tire of zero; compensate only bold's lost stamina saving.
export const DIAL_ZERO_TIRE_BOLD = { chanceDelta: -5, crashDelta: 10, payPct: 126 } as const;
export const DIAL_TEXT = { noEffect: '보통 눈금과 성공·실패·추락 칸 수가 같아 선택할 수 없습니다.' } as const;
export const DIAL_RISK_PROFILES = {
  cautious: { spare: 2, condition: 85, stamina: 60, chance: 80, preferred: 'mid' },
  balanced: { spare: 1, condition: 65, stamina: 40, chance: 65, preferred: 'mid' },
  daring: { spare: 0, condition: 45, stamina: 20, chance: 45, preferred: 'bold' },
} as const;
export const BOT_DIAL_PROFILES = {
  clerk_family: 'cautious', service_frugal: 'balanced', mechanic: 'balanced', official: 'cautious',
  pilot: 'balanced', employee: 'cautious', instructor_academy: 'cautious', solo_ceo: 'daring',
  chairman: 'cautious', engineer: 'balanced', specialist_field: 'balanced', racer_creator: 'daring',
  investor: 'cautious', bon_vivant: 'balanced', drifter: 'daring', random: 'daring',
} as const;
