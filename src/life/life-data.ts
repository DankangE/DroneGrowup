// T03's calendar, defaults and copy. Unchanged economic/balance values stay in v1 data.
import { ENDINGS, RULES, SPACE_MENU as V1_SPACE_MENU, STAT_LABEL as V1_STAT_LABEL,
  STAT_MAX as V1_STAT_MAX } from '../game/data.ts';
import type { BoardState as V1BoardState } from '../game/types.ts';
import { ACTIONS } from './compat.ts';
import type { Choice, GameState, MapId, SpaceKind, Stat, TrackId } from './types.ts';

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
  start: { ...RULES.start, happy: 0, fans: 0, homeIndex: 100, capStamina: 100 },
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

const actionIds = new Set(ACTIONS.map(action => action.id));
export const SPACE_MENU: Partial<Record<SpaceKind, string[]>> = {
  train: V1_SPACE_MENU.train.filter(id => actionIds.has(id)),
  job: V1_SPACE_MENU.job.filter(id => actionIds.has(id)),
  contest: [], event: [], rest: [], start: [], pay: [],
};
// Existing paid duties earn performance when selected in the extra-action slot.
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
