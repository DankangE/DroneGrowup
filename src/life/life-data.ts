// T03's calendar, defaults and copy. Unchanged economic/balance values stay in v1 data.
import { ENDINGS, RULES, SPACE_MENU as V1_SPACE_MENU, STAT_LABEL as V1_STAT_LABEL,
  STAT_MAX as V1_STAT_MAX } from '../game/data.ts';
import type { BoardState as V1BoardState } from '../game/types.ts';
import { ACTIONS } from './compat.ts';
import { TRACK_PREP, TRACK_TRAIN, TRACK_WORK } from './tracks.ts';
import type { Choice, GameState, MapId, SpaceKind, Stat, StatMap, TrackId } from './types.ts';

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
  timeoutEnding: 'worker',
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
export const ENDING_IDS = [...ENDINGS.map(ending => ending.id), 'philanthropist', 'legend', 'master',
  'star', 'hero', 'tycoon', 'family', 'official', 'freeman', 'worker'];
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
  { tier: 4, name: '중형 아파트', price: 15000, upkeep: 20, rest: 75, recovery: 26, happy: 3, adults: 2, kids: 3 },
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
  sell: (name: string) => `${name} 팔기 / 계약 끝내기`, move: (name: string) => `${name}으로 이사`,
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
  datePlaces: ['culture', 'waterfront_park'] as readonly string[],
  weddingPlaces: ['wedding', 'resort'] as readonly string[], babyPlace: 'hospital',
  feat: (kid: number) => `kid_independent:${kid}`,
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
  date: '소개팅', dateDesc: '비용 30만원. 기본 45%, 평판 15마다 +1%p(최대 +20).',
  partner: '새로운 인연을 만났다.', missed: '서로의 다음 인연을 응원했다.',
  wedding: '결혼식을 올렸다.', weddingDesc: (cost: number, happy: number) => `비용 ${cost}만원 · 행복 +${happy}.`,
  wait: '인연이 생긴 뒤 4계절이 지나야 합니다.', home: '결혼하려면 등급 2 이상의 집이 필요합니다.',
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
  spin: { title: '주사위 굴리기', desc: '두 주사위를 굴리고 갈 곳을 고른다.', effect: { text: '주사위를 굴렸다.' } },
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
  home: null, estates: [], holdings: [],
  family: { partnerAt: null, marriedAt: null, dual: false, kids: [] },
  fund: { kind: 0, amount: 0 }, life: 0, timers: {}, flags: [], feats: [],
  eventId: null, seen: {}, ending: null, score: 0, log: [],
};

// Only ledger is read by v1 derived(). No v1 turn, movement or ending logic is used.
export const ACCOUNTING_BOARD: V1BoardState = {
  pos: 0, step: 'spin', left: 0, route: -1, roll: 0, contest: false,
  ledger: {}, forks: 0, routes: 0, contests: 0, rankups: 0,
};
