// Every number and every line of story text of 파일럿 키우기. Money is in 만원, always integers.
// The rules that read these tables are in engine.ts; docs/design.md explains the intent behind the numbers.
import type { ActionDef, ChanceMod, EndingDef, EndingId, EventDef, ItemKind, ItemLevel, PlaceId, Stage, Stat } from './types.ts';

export const RULES = {
  maxTurns: 120, // 30 years, four seasons per year
  startAge: 20,
  seasons: ['봄', '여름', '가을', '겨울'],
  rest: { full: 60, light: 20 },
  seasonRefill: 30,
  start: { money: 60, cond: 100, stamina: 100 } as Partial<Record<Stat, number>>,
  /** 체력 0..100. Every roll (actions and events) reads it; the card shows the chance after it. */
  stamina: {
    fresh: 80, freshBonus: 4, // at or above `fresh`: +4%p
    tired: 40, tiredPenalty: 8, // below `tired`: -8%p
    exhausted: 20, exhaustedPenalty: 20, exhaustedCrashPct: 15, // below `exhausted`: -20%p, and failed flights crash more often
  },
  interestPct: 2, // of debt, per turn, rounded up
  eventChancePct: 38,
  eventCooldown: 8,
  chanceMin: 5,
  chanceMax: 95,
  /** Debt above creditLimit * overduePct / 100 at the end of a turn is a strike; `overdueStrikes` in a row = 빚쟁이. */
  overduePct: 120,
  overdueStrikes: 3,
  /** A run that ends with net worth below this is the 빚쟁이 ending whatever the career. */
  debtorNetWorth: -1500,
  flight: {
    wear: 12, // drone condition lost per flight
    failWear: 15, // more on a failed flight that did not crash
    lowCond: 50, lowCondPenalty: 10,
    badCond: 25, badCondPenalty: 25,
    spareLevelPct: 4, spareLevelCap: 8, // bonus per drone level above the job's requirement
    crashPct: 25, crashLowCondPct: 20, // chance a failed flight wrecks the drone (one level down)
    skillPer: 10, skillCrashCap: 10, // -1%p crash chance per `skillPer` 조종 실력, up to the cap
    crashCond: 70,
  },
  repairBase: 10,
  repairPerLevel: 10,
  itemResalePct: 50,
  score: { turnBonus: 50, max: 9_999_999 },
  academy: { tuition: 22, baseSeats: 8, seatsPerStaff: 8, pay: 70, overhead: 60, overheadPerLevel: 30, leaveDiv: 8, worthPerLevel: 900, timeoutLevel: 3 },
  solo: { contractPay: 30 },
  examinerPay: 40,
  company: { perStaff: 2, contractPay: 90, pay: 75, overhead: 90, valuePerContract: 15, worthDiv: 10, timeoutValue: 60000 },
};

export const STAGES: Record<Stage, { name: string; living: number; salary: number; salaryPerRank: number; credit: number; jobPct: number; ranks: string[]; timeout: EndingId }> = {
  student: { name: '드론학과 학생', living: 25, salary: 0, salaryPerRank: 0, credit: 800, jobPct: 100, ranks: [], timeout: 'student' },
  pilot: { name: '프리랜서 파일럿', living: 25, salary: 0, salaryPerRank: 0, credit: 1500, jobPct: 100, ranks: [], timeout: 'pilot' },
  employee: { name: '드론 회사 직원', living: 25, salary: 95, salaryPerRank: 35, credit: 2500, jobPct: 70, ranks: ['사원', '대리', '과장', '팀장'], timeout: 'employee' },
  instructor: { name: '드론 교관', living: 25, salary: 60, salaryPerRank: 0, credit: 2200, jobPct: 100, ranks: [], timeout: 'instructor' },
  academy: { name: '드론 교육원 운영', living: 40, salary: 0, salaryPerRank: 0, credit: 5000, jobPct: 100, ranks: [], timeout: 'instructor' },
  solo: { name: '드론 1인 사업자', living: 35, salary: 0, salaryPerRank: 0, credit: 3000, jobPct: 130, ranks: [], timeout: 'solo' },
  company: { name: '드론 법인 대표', living: 40, salary: 0, salaryPerRank: 0, credit: 8000, jobPct: 100, ranks: [], timeout: 'smallbiz' },
  director: { name: '파일럿 협회 임원', living: 35, salary: 80, salaryPerRank: 60, credit: 3000, jobPct: 100, ranks: ['이사', '부회장'], timeout: 'director' },
};

export const STAT_LABEL: Record<Stat, string> = {
  money: '자금', debt: '빚', stamina: '체력', theory: '이론', skill: '조종 실력', xp: '경험치', rep: '평판', biz: '사업 감각', teach: '교육 경력', net: '인맥',
  drone: '드론 등급', gear: '장비 등급', car: '차량 등급', cond: '기체 상태',
  rank: '직급', staff: '직원', contracts: '고정 계약', value: '기업 가치', round: '투자 라운드', students: '수강생', level: '교육원 규모', support: '지지율',
  acts: '계절 행동', overdue: '연체', flights: '비행', crashes: '추락', wins: '성공', losses: '실패',
};

/** Upper bounds; every stat is also kept at 0 or above. */
export const STAT_MAX: Partial<Record<Stat, number>> = {
  acts: 99, stamina: 100, theory: 999, skill: 999, drone: 5, gear: 3, car: 3, cond: 100, rank: 3, staff: 12, round: 3, level: 3, support: 100, students: 200, contracts: 30,
  xp: 9999, rep: 999, biz: 999, teach: 999, net: 999, value: 9_000_000, money: 9_000_000, debt: 9_000_000,
};

export const PLACES: Record<PlaceId, { name: string; x: number; y: number; desc: string }> = {
  home: { name: '자취방', x: 12, y: 84, desc: '쉬면서 다음 계절을 준비하는 곳' },
  school: { name: '드론학과 강의동', x: 20, y: 22, desc: '이론과 시뮬레이터 수업' },
  airfield: { name: '비행 실습장', x: 42, y: 16, desc: '풍향계가 도는 잔디 활주로' },
  exam: { name: '자격 시험장', x: 64, y: 14, desc: '초경량비행장치 실기 시험장' },
  town: { name: '시내', x: 30, y: 52, desc: '알바와 행사가 있는 번화가' },
  shop: { name: '드론 상점', x: 48, y: 44, desc: '기체 · 장비 · 차량' },
  garage: { name: '정비소', x: 62, y: 40, desc: '기체 점검과 수리' },
  bank: { name: '은행', x: 16, y: 62, desc: '대출과 상환' },
  farm: { name: '농경지', x: 84, y: 30, desc: '방제 비행 현장' },
  site: { name: '건설 현장', x: 78, y: 52, desc: '측량 · 공정 촬영' },
  bridge: { name: '대교', x: 60, y: 66, desc: '교량 · 시설물 점검' },
  windfarm: { name: '풍력발전 단지', x: 88, y: 10, desc: '블레이드 근접 점검' },
  studio: { name: '촬영 세트장', x: 44, y: 70, desc: '방송 · 영화 항공 촬영' },
  coast: { name: '해안', x: 88, y: 78, desc: '수색 · 재난 지원' },
  office: { name: '내 사무실', x: 30, y: 78, desc: '1인 사업의 본거지' },
  hq: { name: '본사 사옥', x: 70, y: 84, desc: '직원과 계약이 모이는 곳' },
  academy: { name: '드론 교육원', x: 52, y: 26, desc: '교육생을 길러내는 곳' },
  assoc: { name: '파일럿 협회 회관', x: 74, y: 24, desc: '업계의 목소리가 모이는 곳' },
};

export const ITEMS: Record<ItemKind, { label: string; none: string; levels: ItemLevel[] }> = {
  drone: {
    label: '드론', none: '기체 없음',
    levels: [
      { name: '입문 촬영 드론', price: 200, desc: '행사 · 홍보 촬영을 받을 수 있다' },
      { name: '중형 방제 드론', price: 500, desc: '방제와 측량 일거리가 열린다' },
      { name: '산업용 점검 드론', price: 1125, desc: '교량 · 풍력발전기 점검이 열린다' },
      { name: '시네마 드론', price: 2500, desc: '방송 · 영화 촬영이 열린다' },
      { name: '대형 특수 드론', price: 5500, desc: '모든 비행의 성공률이 오른다' },
    ],
  },
  gear: {
    label: '장비', none: '장비 없음',
    levels: [
      { name: '예비 배터리 · 조종기 세트', price: 100, desc: '홍보 영상을 찍을 수 있다' },
      { name: '열화상 카메라 · 짐벌', price: 375, desc: '측량 · 점검 일거리가 열린다' },
      { name: '라이다 · RTK 측위 장비', price: 1000, desc: '방송 촬영이 열린다' },
    ],
  },
  car: {
    label: '차량', none: '뚜벅이',
    levels: [
      { name: '중고 경차', price: 300, desc: '교외 현장에 갈 수 있다' },
      { name: 'SUV', price: 875, desc: '풍력발전 단지 · 해안까지 간다' },
      { name: '작업용 밴', price: 2250, desc: '장비를 통째로 싣고 다닌다' },
    ],
  },
};

export const LOAN_STEPS = [100, 500];

export const FLAG_LABEL: Record<string, string> = {
  licensed: '조종자 자격증', examiner: '실기평가조종자 자격', member: '협회 정회원', tech: '자체 기체 기술',
};

/** Flight jobs: +1%p per 5 조종 실력 above the job's level, up to +10%p. */
const skillMod = (over: number): ChanceMod => ({ stat: 'skill', over, per: 5, pct: 1, cap: 10 });
const mod = (stat: Stat, over: number, per: number, cap: number): ChanceMod => ({ stat, over, per, pct: 1, cap });

const LICENSED: Stage[] = ['pilot', 'employee', 'instructor', 'solo'];
const FLYERS: Stage[] = ['pilot', 'solo', 'company'];

export const WIND_DOWN_NOTE = '체력이 바닥났다. 남은 계절은 쉬면서 보냈다.';
export const REST_LIGHT = {
  title: '쉬고 계절 넘기기',
  get desc() { return `남은 계절을 쉬며 보낸다. 체력 +${RULES.rest.light}.`; },
  effect: { text: '조종기를 내려놓고 남은 계절을 쉬었다.', add: { get stamina() { return RULES.rest.light; } } },
};

export const ACTIONS: ActionDef[] = [
  // ------------------------------------------------------------ 어디서나
  { id: 'rest', place: 'home', when: {}, title: '푹 쉰다', get desc() { return `이번 계절을 통째로 쉰다. 체력 +${RULES.rest.full}.`; },
    effect: { text: '밀린 잠을 자고, 하늘을 올려다봤다. 몸이 가벼워졌다.', add: { get stamina() { return RULES.rest.full; } } } },
  { id: 'self_study', place: 'home', when: { stage: [...LICENSED, 'academy', 'company', 'director'] }, tire: 15, title: '항공법 · 기상 독학', desc: '개정된 법규와 기상 자료를 혼자 읽는다. 시험과 서류에 쓰인다.',
    effect: { text: '개정 항공안전법에 밑줄을 그었다.', add: { theory: 7 } } },

  // ------------------------------------------------------------ 학생
  { id: 'st_theory', place: 'school', when: { stage: ['student'] }, tire: 15, title: '이론 수업', desc: '항공법 · 기상 · 비행 원리.',
    effect: { text: '항공법 조문이 조금씩 눈에 들어온다.', add: { theory: 10, xp: 5 } } },
  { id: 'st_sim', place: 'school', when: { stage: ['student'] }, tire: 20, title: '시뮬레이터 훈련', desc: '실습비를 내고 가상 비행 시간을 채운다.', cost: 25,
    effect: { text: '화면 속 기체가 처음으로 정지 비행에 성공했다.', add: { skill: 8, theory: 2, xp: 6 } } },
  { id: 'st_flight', place: 'airfield', when: { stage: ['student'] }, tire: 25, title: '실기 비행 훈련', desc: '학교 기체로 원주 비행과 비상 착륙을 연습한다.',
    roll: { base: 70, mods: [{ stat: 'skill', over: 30, per: 3, pct: 1, cap: 15 }],
      success: { text: '교수님이 고개를 끄덕였다. 손끝에 감이 붙는다.', add: { skill: 12, xp: 12 } },
      fail: { text: '착륙에서 프로펠러를 부러뜨렸다. 변상하고 다시.', add: { skill: 4, xp: 5, money: -20 } } } },
  { id: 'st_parttime', place: 'town', when: { stage: ['student'] }, tire: 40, title: '편의점 알바', desc: '비행과는 상관없지만 생활비가 된다.',
    effect: { text: '새벽 근무를 버텼다.', add: { money: 70 } } },
  { id: 'st_assist', place: 'town', when: { stage: ['student'] }, need: { min: { skill: 45 } }, tire: 30, title: '촬영 보조 알바', desc: '선배 파일럿의 현장을 따라다닌다.',
    effect: { text: '배터리를 나르며 현장을 눈에 담았다.', add: { money: 55, xp: 5, skill: 2 } } },
  { id: 'st_exam', place: 'exam', when: { stage: ['student'] }, need: { min: { theory: 90, skill: 90 } }, cost: 600, tire: 30, title: '조종자 자격증 과정 · 실기 시험', desc: '전문교육기관 수강료와 응시료. 대부분 빚을 내서 치른다.',
    roll: { base: 50, mods: [{ stat: 'theory', over: 90, per: 2, pct: 1, cap: 20 }, { stat: 'skill', over: 90, per: 2, pct: 1, cap: 20 }],
      success: { text: '합격! 조종자 증명서에 내 이름이 찍혔다. 이제 프리랜서 파일럿이다.', add: { xp: 20, rep: 3 }, stage: 'pilot', flag: 'licensed' },
      fail: { text: '측풍에 밀려 실격. 수강료는 돌아오지 않는다.', add: { xp: 6, skill: 3 } } } },

  // ------------------------------------------------------------ 프리랜서 일거리 (비행)
  { id: 'job_event', place: 'town', flight: true, when: { stage: FLYERS }, need: { min: { drone: 1 } }, tire: 20, title: '행사 · 웨딩 촬영', desc: '가장 흔한 일거리. 단가는 낮다.',
    roll: { base: 90, mods: [skillMod(90)],
      success: { text: '신랑 신부 머리 위로 멋진 원샷을 남겼다.', add: { money: 60, xp: 5, skill: 2, rep: 1 } },
      fail: { text: '하객 쪽으로 기체가 밀렸다. 사과하고 환불했다.', add: { money: -15, xp: 2, skill: 1 } } } },
  { id: 'job_promo', place: 'town', flight: true, when: { stage: FLYERS }, need: { min: { drone: 1, gear: 1 } }, tire: 20, title: '부동산 홍보 영상', desc: '단지 전경과 조망을 담는다.',
    roll: { base: 85, mods: [skillMod(120)],
      success: { text: '분양 사무소가 영상을 마음에 들어 했다.', add: { money: 85, xp: 6, skill: 2, rep: 1 } },
      fail: { text: '역광에 영상이 다 날아갔다. 재촬영 비용은 내 몫.', add: { money: -25, xp: 2, skill: 1 } } } },
  { id: 'job_spray', place: 'farm', flight: true, when: { stage: FLYERS }, need: { min: { drone: 2, car: 1 } }, tire: 25, title: '농약 방제', desc: '새벽 논 위를 낮게 난다.',
    roll: { base: 80, mods: [skillMod(150)],
      success: { text: '이장님이 내년에도 부르겠다고 했다.', add: { money: 115, xp: 8, skill: 2, rep: 1 } },
      fail: { text: '약제가 옆 밭으로 날렸다. 피해를 물어줬다.', add: { money: -50, xp: 3, skill: 1 } } } },
  { id: 'job_survey', place: 'site', flight: true, when: { stage: FLYERS }, need: { min: { drone: 2, gear: 2 } }, tire: 25, title: '건설 현장 측량', desc: '정사영상과 토공량 산출.',
    roll: { base: 76, mods: [skillMod(180)],
      success: { text: '오차 3cm. 현장 소장이 다음 공정도 맡겼다.', add: { money: 140, xp: 9, skill: 3, rep: 2 } },
      fail: { text: '기준점을 잘못 잡았다. 재측량에 위약금까지.', add: { money: -70, xp: 3, skill: 1 } } } },
  { id: 'job_bridge', place: 'bridge', flight: true, when: { stage: FLYERS }, need: { min: { drone: 3, gear: 2, car: 1 } }, tire: 25, title: '교량 · 시설물 점검', desc: '교각 아래 GPS 음영 구간을 비행한다.',
    roll: { base: 72, mods: [skillMod(225)],
      success: { text: '균열 세 곳을 찾아냈다. 보고서가 그대로 채택됐다.', add: { money: 170, xp: 10, skill: 3, rep: 2 } },
      fail: { text: '교각 아래에서 신호가 끊겼다. 재점검 비용을 떠안았다.', add: { money: -100, xp: 4, skill: 1 } } } },
  { id: 'job_wind', place: 'windfarm', flight: true, when: { stage: FLYERS }, need: { min: { drone: 3, gear: 2, car: 2 } }, tire: 35, title: '풍력발전기 블레이드 점검', desc: '돌풍 속에서 80m 블레이드에 바짝 붙는다. 크게 벌거나 크게 잃는다.',
    roll: { base: 66, mods: [skillMod(270)],
      success: { text: '블레이드 끝 손상을 선명하게 담았다. 발전사가 흡족해했다.', add: { money: 250, xp: 12, skill: 4, rep: 3 } },
      fail: { text: '돌풍에 휘말려 블레이드를 건드렸다. 배상금을 물었다.', add: { money: -150, xp: 4, skill: 1, rep: -1 } } } },
  { id: 'job_rescue', place: 'coast', flight: true, when: { stage: FLYERS }, need: { min: { drone: 3, car: 2 } }, tire: 35, title: '해안 수색 · 재난 지원', desc: '돈보다 이름이 남는 공공 임무.',
    roll: { base: 68, mods: [skillMod(240)],
      success: { text: '실종자를 열화상으로 찾아냈다. 뉴스에 내 기체가 나왔다.', add: { money: 110, xp: 12, skill: 4, rep: 6, net: 3 } },
      fail: { text: '해무에 기체를 띄우지 못했다. 출동비만 날렸다.', add: { money: -60, xp: 4, skill: 1 } } } },
  { id: 'job_film', place: 'studio', flight: true, when: { stage: FLYERS }, need: { min: { drone: 4, gear: 3, rep: 105 } }, tire: 30, title: '방송 · 영화 항공 촬영', desc: '감독의 한 컷을 위해 하루 종일 같은 선을 난다.',
    roll: { base: 60, mods: [skillMod(330)],
      success: { text: '엔딩 크레딧에 이름이 올라갔다.', add: { money: 400, xp: 14, skill: 4, rep: 5 } },
      fail: { text: '세트 조명을 건드렸다. 촬영이 하루 밀렸고 위약금을 냈다.', add: { money: -200, xp: 5, skill: 1, rep: -2 } } } },

  // ------------------------------------------------------------ 프리랜서 (비행 외)
  { id: 'pi_repair_gig', place: 'garage', when: { stage: ['pilot'] }, tire: 25, title: '드론 수리 · 조립 알바', desc: '기체가 없어도 할 수 있는 일.',
    effect: { text: '남의 기체를 고치며 구조를 익혔다.', add: { money: 40, xp: 3, theory: 2 } } },
  { id: 'pi_assist', place: 'academy', when: { stage: ['pilot'] }, need: { min: { xp: 210 } }, tire: 20, title: '교육원 보조 강사', desc: '주말마다 교육생의 조종기를 잡아 준다.',
    effect: { text: '가르치는 일이 생각보다 잘 맞는다.', add: { money: 45, teach: 5, xp: 2, theory: 2 } } },
  { id: 'pi_study', place: 'home', when: { stage: ['pilot', 'employee'] }, cost: 50, tire: 15, title: '창업 · 세무 강의 수강', desc: '견적서와 세금계산서부터 배운다.',
    effect: { text: '단가를 계산하는 법을 알게 됐다.', add: { biz: 6, theory: 3 } } },
  { id: 'pi_meetup', place: 'town', when: { stage: ['pilot', 'solo', 'company'] }, cost: 50, tire: 20, title: '드론 박람회 · 업계 모임', desc: '명함을 돌리고 얼굴을 알린다.',
    effect: { text: '명함 스무 장이 사라지고 연락처 스무 개가 생겼다.', add: { net: 5, rep: 1, biz: 1 } } },
  { id: 'emp_apply', place: 'town', when: { stage: ['pilot'] }, need: { min: { xp: 270 } }, tire: 20, title: '드론 회사 입사 지원', desc: '월급이 나오는 안정적인 길. 대신 성장 폭은 작다.',
    roll: { base: 55, mods: [mod('rep', 0, 2, 25)],
      success: { text: '합격 통보. 다음 계절부터 사원증을 목에 건다.', stage: 'employee', set: { rank: 0 } },
      fail: { text: '최종 면접에서 떨어졌다.', add: { rep: -1 } } } },
  { id: 'inst_course', place: 'academy', when: { stage: ['pilot'] }, need: { min: { xp: 480, theory: 150 } }, cost: 500, tire: 30, title: '지도조종자(교관) 과정', desc: '비행 경력을 채우고 교관 자격에 도전한다.',
    roll: { base: 58, mods: [mod('teach', 0, 1, 25), mod('theory', 150, 4, 10)],
      success: { text: '교관 자격 취득. 교육원과 전속 계약을 맺었다.', stage: 'instructor', add: { teach: 5 } },
      fail: { text: '구술 평가에서 막혔다.', add: { teach: 3 } } } },
  { id: 'solo_register', place: 'office', when: { stage: ['pilot'] }, need: { min: { rep: 60, drone: 2, car: 1 } }, cost: 200, tire: 15, title: '1인 사업자 등록', desc: '사업자등록증을 내고 직접 계약을 받는다. 일거리 수입 +30%.',
    effect: { text: '사업자등록증이 나왔다. 상호는 한참 고민했다.', stage: 'solo', add: { biz: 3 } } },

  // ------------------------------------------------------------ 직장인
  { id: 'emp_work', place: 'hq', when: { stage: ['employee'] }, tire: 20, title: '성실 근무', desc: '맡은 비행과 보고서를 빈틈없이 해낸다.',
    effect: { text: '계절 평가에서 좋은 점수를 받았다.', add: { xp: 5, rep: 1, money: 15, skill: 2, theory: 1 } } },
  { id: 'emp_overtime', place: 'hq', when: { stage: ['employee'] }, tire: 40, title: '야근 · 특근', desc: '수당은 정직하다.',
    effect: { text: '수당이 통장에 찍혔다. 눈 밑은 어두워졌다.', add: { money: 50, xp: 2 } } },
  { id: 'emp_side', place: 'town', flight: true, when: { stage: ['employee'] }, need: { min: { drone: 1 } }, tire: 25, title: '주말 부업 촬영', desc: '내 드론으로 몰래 뛰는 주말 일거리.',
    roll: { base: 85, mods: [skillMod(120)],
      success: { text: '주말 이틀로 용돈을 벌었다.', add: { money: 80, xp: 4, skill: 2 } },
      fail: { text: '촬영을 망쳐 환불했다.', add: { money: -30 } } } },
  { id: 'emp_promo1', place: 'hq', when: { stage: ['employee'], max: { rank: 0 } }, need: { min: { xp: 420 } }, tire: 25, title: '대리 승진 심사', desc: '통과하면 계절 급여가 오른다.',
    roll: { base: 55, mods: [mod('rep', 30, 2, 20)],
      success: { text: '대리로 승진했다.', add: { rank: 1, rep: 2 } }, fail: { text: '이번에는 누락됐다.', add: { xp: 3, rep: -1 } } } },
  { id: 'emp_promo2', place: 'hq', when: { stage: ['employee'], min: { rank: 1 }, max: { rank: 1 } }, need: { min: { xp: 630, rep: 75 } }, tire: 25, title: '과장 승진 심사', desc: '실적과 평판을 함께 본다.',
    roll: { base: 48, mods: [mod('rep', 75, 2, 20)],
      success: { text: '과장으로 승진했다.', add: { rank: 1, rep: 3 } }, fail: { text: '승진 대상에서 밀렸다.', add: { xp: 3, rep: -1 } } } },
  { id: 'emp_promo3', place: 'hq', when: { stage: ['employee'], min: { rank: 2 }, max: { rank: 2 } }, need: { min: { xp: 870, rep: 120 } }, tire: 25, title: '팀장 승진 심사', desc: '비행팀 전체를 맡는 자리.',
    roll: { base: 42, mods: [mod('rep', 120, 2, 20)],
      success: { text: '비행운영팀 팀장이 됐다.', add: { rank: 1, rep: 4 } }, fail: { text: '외부 영입 인사가 그 자리에 앉았다.', add: { xp: 3, rep: -2 } } } },
  { id: 'emp_quit', place: 'hq', when: { stage: ['employee'] }, tire: 10, title: '퇴사하고 프리랜서로', desc: '월급을 내려놓고 다시 현장으로 나간다.',
    effect: { text: '사원증을 반납했다. 퇴직금이 들어왔다.', stage: 'pilot', add: { money: 120 }, set: { rank: 0 } } },

  // ------------------------------------------------------------ 교관
  { id: 'inst_teach', place: 'academy', when: { stage: ['instructor'] }, tire: 25, title: '교육생 지도', desc: '하루 여덟 시간, 같은 말을 다르게 설명한다.',
    effect: { text: '담당 교육생이 실기를 한 번에 붙었다.', add: { money: 50, teach: 6, rep: 1, xp: 2, theory: 2, skill: 1 } } },
  { id: 'inst_examiner', place: 'exam', when: { stage: ['instructor'], notFlags: ['examiner'] }, need: { min: { teach: 105, theory: 180 } }, cost: 300, tire: 25, title: '실기평가조종자 시험', desc: '교육원을 세우려면 필요한 상위 자격. 급여도 오른다.',
    roll: { base: 50, mods: [mod('teach', 105, 2, 25), mod('theory', 180, 4, 10)],
      success: { text: '실기평가조종자 자격을 땄다. 이제 시험관 자리에 앉는다.', flag: 'examiner', add: { rep: 4 } },
      fail: { text: '평가 기준 구술에서 떨어졌다.', add: { teach: 2 } } } },
  { id: 'academy_found', place: 'academy', when: { stage: ['instructor'] }, need: { flags: ['examiner'], min: { teach: 240, rep: 105 } }, cost: 4500, tire: 15, title: '드론 교육원 설립', desc: '실습장 임대와 기체 구입. 대부분 대출로 시작한다.',
    effect: { text: '간판을 걸었다. 첫 기수 교육생 열 명이 등록했다.', stage: 'academy', set: { students: 10, staff: 1, level: 1 } } },
  { id: 'inst_quit', place: 'academy', when: { stage: ['instructor'] }, tire: 10, title: '교관을 그만두고 프리랜서로', desc: '다시 현장 비행으로 돌아간다.',
    effect: { text: '마지막 수업을 마치고 조종기를 챙겼다.', stage: 'pilot' } },

  // ------------------------------------------------------------ 교육원
  { id: 'ac_teach', place: 'academy', when: { stage: ['academy'] }, tire: 25, title: '원장 직강', desc: '직접 조종기를 잡고 가르친다.',
    effect: { text: '원장이 직접 가르친다는 소문이 났다.', add: { money: 40, teach: 3, rep: 2, students: 1 } } },
  { id: 'ac_ad', place: 'town', when: { stage: ['academy'] }, cost: 150, tire: 15, title: '수강생 모집 광고', desc: '설명회를 열고 전단을 돌린다.',
    roll: { base: 70, mods: [mod('rep', 90, 3, 15)],
      success: { text: '설명회 자리가 모자랐다.', add: { students: 8 } }, fail: { text: '비 오는 날이라 몇 명만 왔다.', add: { students: 2 } } } },
  { id: 'ac_hire', place: 'academy', when: { stage: ['academy'] }, need: { max: { staff: 5 } }, cost: 200, tire: 10, title: '교관 채용', desc: '교관 한 명당 수용 인원이 8명 늘고 계절 급여가 나간다.',
    effect: { text: '새 교관이 출근했다.', add: { staff: 1 } } },
  { id: 'ac_expand', place: 'academy', when: { stage: ['academy'], max: { level: 1 } }, need: { min: { students: 16 } }, cost: 2000, tire: 15, title: '제2 실습장 증설', desc: '교육원 규모 2단계. 운영비도 함께 오른다.',
    effect: { text: '제2 실습장에 풍향계를 세웠다.', add: { level: 1, rep: 3 } } },
  { id: 'ac_expand2', place: 'academy', when: { stage: ['academy'], min: { level: 2 }, max: { level: 2 } }, need: { min: { students: 28, staff: 3 } }, cost: 3750, tire: 15, title: '종합 교육센터 신축', desc: '교육원 규모 3단계. 전문교육기관 인가의 조건이다.',
    effect: { text: '강의동과 격납고를 갖춘 교육센터가 문을 열었다.', add: { level: 1, rep: 5 } } },
  { id: 'ac_accredit', place: 'assoc', when: { stage: ['academy'] }, need: { min: { level: 3, students: 30, staff: 3, rep: 150 } }, cost: 1000, tire: 30, title: '국가지정 전문교육기관 인가 신청', desc: '통과하면 이 지역 파일럿은 모두 여기서 나온다.',
    roll: { base: 35, mods: [mod('teach', 240, 4, 15), mod('rep', 150, 3, 15)],
      success: { text: '인가 통지서가 도착했다. 교육원 현판 옆에 지정 번호가 붙었다.', end: 'academy' },
      fail: { text: '현장 실사에서 보완 요구가 나왔다. 소문을 들은 교육생 몇이 떠났다.', add: { rep: -3, students: -5 } } } },

  // ------------------------------------------------------------ 1인 사업자
  { id: 'solo_sales', place: 'office', when: { stage: ['solo'] }, need: { max: { contracts: 4 } }, cost: 50, tire: 20, title: '단골 계약 영업', desc: '고정 계약 한 건마다 계절 30만원이 들어온다 (최대 5건).',
    roll: { base: 50, mods: [mod('biz', 0, 2, 30)],
      success: { text: '계절 정기 촬영 계약서에 도장을 받았다.', add: { contracts: 1, biz: 2 } }, fail: { text: '견적만 받아 가고 연락이 없다.', add: { biz: 1 } } } },
  { id: 'solo_study', place: 'office', when: { stage: ['solo'] }, cost: 50, tire: 15, title: '세무 · 계약 공부', desc: '부가세 신고를 혼자 해 본다.',
    effect: { text: '장부가 처음으로 맞아떨어졌다.', add: { biz: 7 } } },
  { id: 'corp_found', place: 'hq', when: { stage: ['solo'] }, need: { min: { biz: 105, rep: 105, drone: 3, gear: 2 } }, cost: 2500, tire: 15, title: '법인 설립', desc: '직원을 뽑고 회사를 키운다. 급여와 임대료가 매 계절 나간다.',
    effect: { text: '법인 등기를 마쳤다. 첫 직원과 악수했다.', stage: 'company', set: { staff: 1, value: 1000 } } },

  // ------------------------------------------------------------ 법인
  { id: 'co_hire', place: 'hq', when: { stage: ['company'] }, need: { max: { staff: 11 } }, cost: 200, tire: 10, title: '파일럿 채용', desc: '직원 한 명이 계약 2건을 맡는다. 계절 급여 75만원.',
    effect: { text: '새 파일럿이 입사했다.', add: { staff: 1 } } },
  { id: 'co_sales', place: 'hq', when: { stage: ['company'] }, tire: 25, title: '영업 · 수주', desc: '계약 한 건마다 계절 90만원 (직원이 맡을 수 있을 때).',
    roll: { base: 55, mods: [mod('biz', 90, 3, 25)],
      success: { text: '연간 점검 계약을 따냈다.', add: { contracts: 1, value: 175, biz: 1 } }, fail: { text: '제안서가 2순위로 밀렸다.', add: { money: -30 } } } },
  { id: 'co_bid', place: 'assoc', when: { stage: ['company'] }, need: { min: { staff: 3 } }, cost: 300, tire: 25, title: '공공 입찰 참여', desc: '지자체 드론 사업. 따내면 계약 3건이 한 번에 들어온다.',
    roll: { base: 40, mods: [mod('rep', 120, 3, 25)],
      success: { text: '낙찰! 군청 방제 · 측량 사업을 통째로 맡았다.', add: { contracts: 3, value: 600, rep: 4 } }, fail: { text: '0.3점 차이로 떨어졌다.', add: { biz: 1 } } } },
  { id: 'co_rnd', place: 'hq', when: { stage: ['company'] }, cost: 1500, tire: 20, title: '자체 기체 연구개발', desc: '성공하면 기업 가치가 크게 뛴다.',
    roll: { base: 45, mods: [mod('biz', 120, 4, 20), mod('theory', 150, 5, 10)],
      success: { text: '자체 설계 기체가 인증 비행을 통과했다.', add: { value: 1000, rep: 3 }, flag: 'tech' }, fail: { text: '시제기가 시험 비행에서 추락했다.', add: { value: 75 } } } },
  { id: 'co_ir', place: 'bank', when: { stage: ['company'], max: { round: 2 } }, need: { min: { value: 5000 } }, tire: 30, title: '투자 유치 (IR)', desc: '투자자 앞에서 발표한다. 성공하면 자금과 기업 가치가 함께 뛴다.',
    roll: { base: 42, mods: [mod('net', 60, 2, 25), mod('value', 5000, 2000, 10)],
      success: { text: '투자 계약 체결. 통장 자릿수가 바뀌었다.', add: { money: 3000, value: 1750, round: 1 } }, fail: { text: '"조금 더 지켜보겠다"는 답이 돌아왔다.', add: { rep: -1 } } } },
  { id: 'co_ipo', place: 'bank', when: { stage: ['company'] }, need: { min: { round: 2, staff: 8, value: 30000 } }, cost: 2000, tire: 35, title: '상장(IPO) 추진', desc: '거대 드론 기업으로 가는 마지막 관문.',
    roll: { base: 56, mods: [mod('rep', 180, 2, 20)],
      success: { text: '상장 첫날, 전광판에 회사 이름이 떴다.', end: 'ceo' }, fail: { text: '예비 심사에서 반려됐다. 시장의 눈이 차가워졌다.', add: { value: -4000, rep: -3 } } } },

  // ------------------------------------------------------------ 협회
  { id: 'assoc_join', place: 'assoc', when: { stage: LICENSED, notFlags: ['member'] }, cost: 100, tire: 10, title: '파일럿 협회 가입', desc: '회비를 내고 정회원이 된다. 임원 선거에 나갈 자격이 생긴다.',
    effect: { text: '회원증과 배지를 받았다.', flag: 'member', add: { net: 3 } } },
  { id: 'assoc_volunteer', place: 'assoc', when: { stage: LICENSED, flags: ['member'] }, tire: 25, title: '협회 봉사 · 안전 교육 지원', desc: '돈은 안 되지만 사람이 남는다.',
    effect: { text: '행사장 뒷정리까지 하고 나니 다들 이름을 기억한다.', add: { net: 8, rep: 2 } } },
  { id: 'assoc_run', place: 'assoc', when: { stage: LICENSED, flags: ['member'] }, need: { min: { net: 150, rep: 120 } }, cost: 375, tire: 30, title: '협회 이사 선거 출마', desc: '당선되면 현업을 접고 협회 일을 맡는다.',
    roll: { base: 45, mods: [mod('net', 150, 2, 30)],
      success: { text: '이사로 선출됐다. 회관에 내 자리가 생겼다.', stage: 'director', set: { rank: 0, support: 20 } },
      fail: { text: '몇 표 차이로 낙선했다.', add: { net: 3 } } } },
  { id: 'dir_forum', place: 'assoc', when: { stage: ['director'] }, tire: 20, title: '정책 간담회', desc: '회원들의 불만을 듣고 정리한다.',
    effect: { text: '밤늦게까지 이야기를 들었다.', add: { support: 5, net: 3 } } },
  { id: 'dir_campaign', place: 'town', when: { stage: ['director'] }, cost: 150, tire: 20, title: '안전 비행 캠페인', desc: '사비를 들여 전국에 포스터를 붙인다.',
    effect: { text: '캠페인 영상이 꽤 퍼졌다.', add: { support: 7, rep: 3 } } },
  { id: 'dir_tour', place: 'coast', when: { stage: ['director'] }, tire: 35, title: '지역 지부 순회', desc: '지부마다 분위기가 다르다.',
    roll: { base: 60, mods: [mod('net', 120, 3, 20)],
      success: { text: '지부장들이 지지를 약속했다.', add: { support: 13, net: 2 } }, fail: { text: '냉랭한 지부에서 시간만 보냈다.', add: { support: 2 } } } },
  { id: 'dir_vice', place: 'assoc', when: { stage: ['director'], max: { rank: 0 } }, need: { min: { support: 60 } }, cost: 500, tire: 30, title: '부회장 선거 출마', desc: '회장으로 가는 디딤돌.',
    roll: { base: 45, mods: [mod('support', 60, 1, 25)],
      success: { text: '부회장으로 선출됐다.', add: { rank: 1, rep: 5 } }, fail: { text: '현 집행부 후보에게 밀렸다.', add: { support: -8 } } } },
  { id: 'dir_chair', place: 'assoc', when: { stage: ['director'], min: { rank: 1 } }, need: { min: { support: 75 } }, cost: 1125, tire: 35, title: '총협회장 선거 출마', desc: '전국 파일럿의 대표를 뽑는 선거.',
    roll: { base: 34, mods: [mod('support', 75, 1, 20)],
      success: { text: '개표 결과, 과반 득표. 전국 파일럿의 대표가 됐다.', end: 'chairman' }, fail: { text: '결선 투표에서 졌다. 지지층이 흩어졌다.', add: { support: -30 } } } },
];

export const EVENTS: EventDef[] = [
  // ------------------------------------------------------------ 장비
  { id: 'neglect', place: 'garage', weight: 60, when: { min: { drone: 1 }, max: { cond: 34 }, flags: ['licensed'] }, title: '정비 경고등',
    text: '한동안 점검을 미룬 기체에서 모터 소음이 난다. 다음 일정은 내일이다.',
    choices: [
      { title: '일정을 미루고 정비한다', desc: '정비소에 맡긴다.', cost: 50, effect: { text: '베어링과 프로펠러를 갈았다. 새것처럼 조용하다.', set: { cond: 100 } } },
      { title: '그냥 띄운다', desc: '괜찮겠지.', roll: { base: 45,
        success: { text: '아슬아슬하게 버텼다.' },
        fail: { text: '비행 중 모터가 멈췄다. 기체가 논바닥에 처박혔다.', add: { drone: -1, crashes: 1 }, set: { cond: 60 } } } },
    ] },
  { id: 'typhoon', place: 'home', weight: 8, when: { min: { drone: 1 }, flags: ['licensed'] }, title: '태풍 예보',
    text: '주말에 태풍이 올라온다. 기체와 장비를 둘 곳이 마땅치 않다.',
    choices: [
      { title: '격납 창고를 빌린다', desc: '안전하게 보관한다.', cost: 20, effect: { text: '창고 문을 잠그고 발 뻗고 잤다.', add: { stamina: 10 } } },
      { title: '베란다에 둔다', desc: '설마 거기까지 비가 들이칠까.', roll: { base: 60,
        success: { text: '태풍이 비껴갔다.' }, fail: { text: '창이 깨지며 기체가 빗물을 뒤집어썼다. 밤새 물을 퍼냈다.', add: { cond: -40, stamina: -15 } } } },
    ] },
  { id: 'used_deal', place: 'shop', weight: 7, when: { stage: ['pilot', 'solo'], min: { drone: 1 }, max: { drone: 3 } }, title: '중고 기체 급매',
    text: '폐업하는 업체가 한 등급 위 기체를 헐값에 내놨다. 시운전은 안 된다고 한다.',
    choices: [
      { title: '산다', desc: '상태는 복불복.', cost: 150, roll: { base: 55,
        success: { text: '멀쩡한 기체였다. 횡재했다.', add: { drone: 1 }, set: { cond: 90 } },
        fail: { text: '메인보드가 침수된 기체였다. 부품값도 안 나온다.' } } },
      { title: '지나친다', desc: '그 돈으로 지금 기체를 손본다.', effect: { text: '매물은 다음 날 사라졌다. 대신 내 기체의 프로펠러를 갈았다.', add: { cond: 15 } } },
    ] },
  { id: 'theft', place: 'town', weight: 6, when: { min: { gear: 1 }, flags: ['licensed'] }, title: '장비 가방 분실',
    text: '현장에서 돌아와 보니 장비 가방이 없다. CCTV에 누군가 들고 가는 모습이 찍혔다.',
    choices: [
      { title: '사례금을 걸고 찾는다', desc: '확실하게 되찾는다.', cost: 40, effect: { text: '사례금을 주고 가방을 돌려받았다.' } },
      { title: '신고하고 기다린다', desc: '경찰이 찾아 줄지도 모른다.', roll: { base: 40,
        success: { text: '이틀 뒤 파출소에서 연락이 왔다.', add: { stamina: -5 } }, fail: { text: '끝내 돌아오지 않았다. 장비를 다시 사야 한다.', add: { gear: -1, stamina: -10 } } } },
    ] },
  { id: 'bird', place: 'farm', weight: 7, when: { stage: FLYERS, min: { drone: 1 } }, title: '조류 충돌',
    text: '비행 중 까치 떼가 기체로 달려든다. 프로펠러 하나가 흔들린다.',
    choices: [
      { title: '수동으로 착륙시킨다', desc: '실력을 믿는다.', roll: { base: 45, mods: [{ stat: 'skill', over: 40, per: 4, pct: 1, cap: 25 }],
        success: { text: '흔들리는 기체를 살살 달래 내렸다.', add: { skill: 5, xp: 4 } },
        fail: { text: '자세를 잃고 추락했다. 기체가 크게 부서졌다.', add: { drone: -1, crashes: 1 }, set: { cond: 60 } } } },
      { title: '즉시 비상 착륙', desc: '기체는 긁히지만 확실하다.', effect: { text: '풀밭에 거칠게 내려앉혔다.', add: { cond: -25 } } },
    ] },
  // ------------------------------------------------------------ 학생
  { id: 'scholarship', place: 'school', weight: 10, when: { stage: ['student'] }, title: '드론 영상 공모전',
    text: '학과 게시판에 장학 공모전 공고가 붙었다. 마감은 이번 주.',
    choices: [
      { title: '밤새워 출품한다', desc: '장학금을 노린다. 떨어지면 몸만 축난다.', roll: { base: 35, mods: [mod('skill', 0, 2, 25)],
        success: { text: '우수상! 장학금이 들어왔다. 며칠은 꾸벅꾸벅 졸았다.', add: { money: 120, rep: 2, xp: 4, stamina: -15 } },
        fail: { text: '입상은 못 했다. 밤샘 여파로 한 주 내내 수업을 놓쳤다.', add: { stamina: -40, theory: -3 } } } },
      { title: '수업에 집중한다', desc: '무리하지 않고 진도를 챙긴다.', effect: { text: '공모전 대신 항공법 요약 노트를 완성했다.', add: { theory: 8 } } },
    ] },
  { id: 'senior', place: 'town', weight: 10, when: { stage: ['student'] }, title: '선배의 연락',
    text: '졸업한 선배가 주말 촬영 현장에 사람이 모자란다고 한다.',
    choices: [
      { title: '따라간다', desc: '용돈과 현장 경험.', effect: { text: '현장 밥은 맛있었고 일당은 짭짤했다.', add: { money: 50, xp: 5, skill: 2, stamina: -15 } } },
      { title: '과제를 한다', desc: '학점도 중요하다.', effect: { text: '비행 계획서 과제를 꼼꼼히 냈다.', add: { theory: 8, xp: 2 } } },
    ] },
  { id: 'club', place: 'airfield', weight: 10, when: { stage: ['student'] }, title: '동아리 레이싱 대회',
    text: '드론 동아리가 교내 레이싱 대회에 나갈 사람을 찾는다.',
    choices: [
      { title: '출전한다', desc: '상금과 이름값, 아니면 수리비.', roll: { base: 45, mods: [mod('skill', 0, 2, 25)],
        success: { text: '결승선을 1등으로 통과했다.', add: { money: 40, skill: 8, xp: 5, rep: 3, stamina: -10 } }, fail: { text: '게이트에 부딪혀 기체가 박살났다. 수리비를 내고 손목도 삐었다.', add: { money: -30, skill: 2, stamina: -25 } } } },
      { title: '관전한다', desc: '쉬면서 보는 것도 공부다.', effect: { text: '관중석에서 선수들의 손놀림을 눈에 담았다.', add: { theory: 3, stamina: 10 } } },
    ] },
  { id: 'cram', place: 'exam', weight: 8, when: { stage: ['student'] }, title: '"2주 완성" 속성반 전단',
    text: '시험장 앞에서 자격증 속성반 전단을 받았다. 합격 보장이라고 한다.',
    choices: [
      { title: '등록한다', desc: '진짜면 대박, 아니면 사기.', cost: 60, roll: { base: 30,
        success: { text: '의외로 제대로 된 강사였다. 실력이 확 늘었다.', add: { theory: 14, skill: 10, xp: 6 } }, fail: { text: '첫 수업 이후 학원 문이 닫혀 있다. 환불받으러 다니느라 진이 빠졌다.', add: { stamina: -10 } } } },
      { title: '버린다', desc: '지름길은 없다. 혼자 복습한다.', effect: { text: '전단을 접어 종이비행기를 만들고, 기출 문제를 한 번 더 풀었다.', add: { theory: 3 } } },
    ] },
  // ------------------------------------------------------------ 파일럿 · 사업자
  { id: 'illegal', place: 'town', weight: 9, when: { stage: ['pilot', 'solo'], min: { drone: 1 } }, title: '수상한 의뢰',
    text: '비행 금지 구역 안쪽을 찍어 달라는 의뢰가 왔다. 허가는 "알아서" 하라고 하고, 단가는 평소의 세 배다.',
    choices: [
      { title: '몰래 찍는다', desc: '걸리지만 않으면.', roll: { base: 55,
        success: { text: '아무 일 없이 끝났다. 찜찜하지만 돈은 들어왔다.', add: { money: 260 } },
        fail: { text: '단속에 걸렸다. 과태료를 내고 이름이 오르내렸다.', add: { money: -100, rep: -8 } } } },
      { title: '거절한다', desc: '자격증이 더 소중하다.', effect: { text: '거절했다는 이야기가 좋게 돌았다.', add: { rep: 2 } } },
    ] },
  { id: 'regular', place: 'town', weight: 9, when: { stage: ['pilot', 'solo'], min: { rep: 12 } }, title: '단골의 소개',
    text: '지난번 고객이 지인을 소개해 주겠다고 한다.',
    choices: [
      { title: '바로 일을 받는다', desc: '간단한 촬영 한 건.', effect: { text: '소개로 온 일은 깎자는 말이 없다.', add: { money: 60, rep: 2, stamina: -10 } } },
      { title: '식사 자리를 만든다', desc: '사람을 남긴다.', effect: { text: '명함 여러 장을 받았다.', add: { net: 5, rep: 1 } } },
    ] },
  { id: 'grant', place: 'bank', weight: 8, when: { stage: ['pilot', 'solo', 'company'] }, title: '청년 드론 창업 지원사업',
    text: '지자체에서 장비 구입비 지원사업 공고가 났다. 사업계획서를 써야 한다.',
    choices: [
      { title: '지원한다', desc: '서류가 관건.', roll: { base: 40, mods: [mod('biz', 0, 2, 30)],
        success: { text: '선정됐다. 지원금이 입금됐다.', add: { money: 300, biz: 2, stamina: -15 } }, fail: { text: '서류에서 탈락했다. 2주 밤샘이 헛수고가 됐다.', add: { biz: 1, stamina: -25 } } } },
      { title: '넘긴다', desc: '서류 쓸 시간에 비행 연습을 한다.', effect: { text: '공고문을 닫고 기체를 들고 나갔다.', add: { skill: 4 } } },
    ] },
  { id: 'expo', place: 'town', weight: 7, when: { stage: [...LICENSED, 'company', 'academy', 'director'] }, title: '드론 박람회 초청',
    text: '국내 최대 드론 박람회에서 부스 자리가 하나 났다고 한다.',
    choices: [
      { title: '부스를 낸다', desc: '참가비를 내고 얼굴을 알린다.', cost: 60, roll: { base: 60,
        success: { text: '부스 앞에 줄이 섰다. 현장 계약도 나왔다.', add: { money: 110, rep: 5, net: 5, stamina: -15 } }, fail: { text: '구석 자리라 한산했다. 사흘을 서서 보냈다.', add: { net: 2, stamina: -20 } } } },
      { title: '관람만 한다', desc: '신기술 세미나를 듣고 인사만 나눈다.', effect: { text: '신형 기체와 규제 동향 세미나를 실컷 들었다.', add: { net: 1, theory: 4 } } },
    ] },
  { id: 'friend', place: 'home', weight: 5, when: {}, title: '친구의 부탁',
    text: '오랜 친구가 급하게 돈을 빌려 달라고 한다. 다음 계절에 꼭 갚겠다고 한다.',
    choices: [
      { title: '빌려준다', desc: '돌아올 수도, 아닐 수도.', cost: 50, roll: { base: 55,
        success: { text: '약속대로 이자까지 얹어 돌려받았다.', add: { money: 75, net: 3 } }, fail: { text: '친구는 연락이 뜸해졌다.', add: { net: 1 } } } },
      { title: '거절한다', desc: '내 코가 석 자다.', effect: { text: '미안하다고 답장을 보냈다. 친구는 한동안 말이 없었다.', add: { net: -1 } } },
    ] },
  // ------------------------------------------------------------ 직장인
  { id: 'restructure', place: 'hq', weight: 8, when: { stage: ['employee'] }, title: '구조조정 소문',
    text: '회사가 비행팀을 줄인다는 소문이 돈다. 희망퇴직 공고가 붙었다.',
    choices: [
      { title: '버틴다', desc: '남으면 그대로, 밀리면 해고.', roll: { base: 65, mods: [mod('rank', 0, 1, 20), mod('rep', 0, 4, 10)],
        success: { text: '명단에서 빠졌다. 팀에 남았다.', add: { rep: 2 } },
        fail: { text: '해고 통보를 받았다. 위로금을 들고 다시 프리랜서가 됐다.', add: { money: 120 }, set: { rank: 0 }, stage: 'pilot' } } },
      { title: '희망퇴직한다', desc: '위로금을 받고 나간다.', effect: { text: '위로금을 받고 회사를 나왔다.', add: { money: 260 }, set: { rank: 0 }, stage: 'pilot' } },
    ] },
  { id: 'scout', place: 'hq', weight: 8, when: { stage: ['employee'], min: { rep: 15 }, max: { rank: 2 } }, title: '경쟁사의 스카우트',
    text: '경쟁사 팀장이 한 직급 위 자리를 제안했다.',
    choices: [
      { title: '옮긴다', desc: '잘 풀리면 승진, 꼬이면 평판만 깎인다.', roll: { base: 60,
        success: { text: '새 회사에서 한 직급 올라 시작했다.', add: { rank: 1 } }, fail: { text: '제안이 흐지부지됐고 소문만 남았다.', add: { rep: -4 } } } },
      { title: '남는다', desc: '의리를 지킨다.', effect: { text: '팀장이 고맙다고 했다.', add: { rep: 2 } } },
    ] },
  { id: 'taskforce', place: 'hq', weight: 8, when: { stage: ['employee'] }, title: '신사업 TF 모집',
    text: '회사가 드론 배송 신사업 TF를 꾸린다. 일은 두 배다.',
    choices: [
      { title: '자원한다', desc: '성과가 나면 크게 배운다.', roll: { base: 55,
        success: { text: '시범 사업이 성공했다. 사업을 보는 눈이 생겼다.', add: { xp: 10, biz: 7, rep: 3, stamina: -20 } }, fail: { text: 'TF는 석 달 만에 해체됐다. 야근만 남았고 책임론이 돌았다.', add: { biz: 2, rep: -2, stamina: -35 } } } },
      { title: '사양한다', desc: '본업에 집중하고 칼퇴한다.', effect: { text: '평소처럼 비행 일지를 쓰고, 퇴근 후에는 법규집을 폈다.', add: { theory: 4, stamina: 10 } } },
    ] },
  // ------------------------------------------------------------ 교관 · 교육원
  { id: 'trainee_crash', place: 'academy', weight: 9, when: { stage: ['instructor', 'academy'] }, title: '교육생 기체 추락',
    text: '교육생이 조종 미숙으로 실습 기체를 펜스에 박았다. 교육생은 얼어붙어 있다.',
    choices: [
      { title: '내 책임으로 수습한다', desc: '수리비를 내가 낸다.', cost: 50, effect: { text: '교육생은 그날 이후 누구보다 열심히 한다.', add: { rep: 4, teach: 2 } } },
      { title: '보험으로 처리한다', desc: '심사가 까다롭다.', roll: { base: 60,
        success: { text: '보험 처리가 깔끔하게 끝났다. 약관을 읽다 보니 규정에 밝아졌다.', add: { theory: 2 } }, fail: { text: '면책 사유에 걸렸고, 책임을 떠넘겼다는 말이 돌았다.', add: { rep: -5, money: -40 } } } },
    ] },
  { id: 'best_instructor', place: 'assoc', weight: 8, when: { stage: ['instructor'] }, title: '우수 교관 표창 후보',
    text: '협회에서 올해의 우수 교관 후보로 추천됐다는 연락이 왔다.',
    choices: [
      { title: '공적서를 낸다', desc: '경력이 말해 줄 것이다.', roll: { base: 45, mods: [mod('teach', 20, 2, 30)],
        success: { text: '표창과 상금을 받았다.', add: { money: 80, rep: 8, stamina: -10 } }, fail: { text: '다음 기회로 밀렸다. 공적서에 쏟은 몇 주가 아깝다.', add: { stamina: -20 } } } },
      { title: '후배에게 양보한다', desc: '사람을 얻는다.', effect: { text: '후배가 평생 잊지 않겠다고 했다.', add: { net: 5 } } },
    ] },
  { id: 'rival_academy', place: 'academy', weight: 9, when: { stage: ['academy'] }, title: '옆 동네 저가 교육원',
    text: '차로 10분 거리에 수강료 반값을 내건 교육원이 문을 열었다.',
    choices: [
      { title: '수강료를 내린다', desc: '확실하게 붙잡는다.', cost: 80, effect: { text: '교육생이 빠져나가지 않았다.', add: { students: 4 } } },
      { title: '합격률로 승부한다', desc: '통하면 이름이 난다.', roll: { base: 50, mods: [mod('teach', 60, 4, 20)],
        success: { text: '"비싸도 붙는 곳"이라는 입소문이 났다.', add: { students: 4, rep: 4 } }, fail: { text: '교육생 몇 명이 옮겨 갔다.', add: { students: -5 } } } },
    ] },
  { id: 'inspection', place: 'academy', weight: 8, when: { stage: ['academy'] }, title: '교육원 안전 점검',
    text: '다음 주에 관할 기관의 불시 안전 점검이 나온다는 귀띔을 받았다.',
    choices: [
      { title: '시설을 보강한다', desc: '안전망과 소화기를 새로 단다.', cost: 120, effect: { text: '점검관이 모범 사례로 사진을 찍어 갔다.', add: { rep: 4 } } },
      { title: '서류만 맞춘다', desc: '넘어가면 다행.', roll: { base: 55,
        success: { text: '서류 확인만 하고 돌아갔다.' }, fail: { text: '안전망 미비로 과태료와 시정 명령을 받았다.', add: { money: -150, rep: -6 } } } },
    ] },
  // ------------------------------------------------------------ 사업
  { id: 'tax', place: 'office', weight: 9, when: { stage: ['solo', 'company'] }, title: '세무조사 통지',
    text: '세무서에서 지난 2년 치 장부를 보겠다는 통지가 왔다.',
    choices: [
      { title: '세무사에게 맡긴다', desc: '수임료를 내고 깔끔하게 끝낸다.', cost: 80, effect: { text: '추징 없이 끝났다. 장부 정리법도 배웠다.', add: { biz: 2 } } },
      { title: '직접 대응한다', desc: '장부에 자신이 있다면.', roll: { base: 45, mods: [mod('biz', 20, 2, 35)],
        success: { text: '소명 자료가 그대로 받아들여졌다.', add: { biz: 6 } }, fail: { text: '누락된 매출이 나왔다. 가산세를 냈다.', add: { money: -200, biz: 1 } } } },
    ] },
  { id: 'subcontract', place: 'hq', weight: 9, when: { stage: ['solo', 'company'] }, title: '대기업의 하청 제안',
    text: '대기업 계열사가 물량을 통째로 맡기겠다고 한다. 단가표는 계약 후에 준다고 한다.',
    choices: [
      { title: '받는다', desc: '물량은 크지만 단가는 모른다.', roll: { base: 62,
        success: { text: '물량이 쏟아졌고 대금도 제때 들어왔다.', add: { money: 250, contracts: 1, rep: 2 } },
        fail: { text: '단가가 원가 아래였다. 계약 기간 내내 손해를 봤다.', add: { money: -110, rep: -2 } } } },
      { title: '거절한다', desc: '내 단가는 내가 정한다.', effect: { text: '단가를 지켰다는 소문이 났다.', add: { rep: 1, biz: 1 } } },
    ] },
  { id: 'key_staff', place: 'hq', weight: 9, when: { stage: ['company'], min: { staff: 2 } }, title: '에이스의 사직서',
    text: '가장 잘 나는 파일럿이 경쟁사 제안을 받았다며 사직서를 들고 왔다.',
    choices: [
      { title: '연봉을 올려 붙잡는다', desc: '사람이 회사다.', cost: 150, effect: { text: '그는 사직서를 찢었다.', add: { rep: 1 } } },
      { title: '보내 준다', desc: '고객이 따라 나갈 수도 있다.', roll: { base: 50,
        success: { text: '인수인계가 잘 끝났다.', add: { staff: -1 } }, fail: { text: '담당하던 고객사가 그를 따라갔다.', add: { staff: -1, contracts: -1 } } } },
    ] },
  { id: 'angel', place: 'bank', weight: 8, when: { stage: ['company'], max: { round: 0 } }, title: '엔젤 투자자의 제안',
    text: '업계 선배가 지분을 받고 초기 자금을 넣겠다고 한다.',
    choices: [
      { title: '투자를 받는다', desc: '자금과 기업 가치가 오른다.', effect: { text: '통장에 투자금이 들어왔다. 이제 혼자만의 회사가 아니다.', add: { money: 1000, value: 2000, net: 4 } } },
      { title: '지분을 지킨다', desc: '아직은 내 힘으로.', effect: { text: '정중히 거절했다. 조언은 얻었다.', add: { biz: 4 } } },
    ] },
  { id: 'dumping', place: 'hq', weight: 8, when: { stage: ['solo', 'company'], min: { contracts: 1 } }, title: '경쟁사의 덤핑',
    text: '경쟁 업체가 내 고객사에 반값 견적을 넣었다.',
    choices: [
      { title: '가격을 맞춘다', desc: '손해를 보고 지킨다.', cost: 90, effect: { text: '계약은 지켰다. 이번 계절은 남는 게 없다. 원가 계산은 확실히 배웠다.', add: { biz: 2 } } },
      { title: '품질로 설득한다', desc: '통하면 신뢰, 아니면 계약 해지.', roll: { base: 55, mods: [mod('rep', 40, 3, 20)],
        success: { text: '고객사가 "싼 게 비지떡"이라며 남았다.', add: { rep: 4 } }, fail: { text: '계약 하나가 넘어갔다.', add: { contracts: -1 } } } },
    ] },
  // ------------------------------------------------------------ 협회
  { id: 'hearing', place: 'assoc', weight: 10, when: { stage: ['director'] }, title: '드론 규제 공청회',
    text: '야간 비행 규제 강화안 공청회에서 협회 대표로 발언하게 됐다.',
    choices: [
      { title: '강하게 반대한다', desc: '회원들은 환호하거나, 등을 돌린다.', roll: { base: 50, mods: [mod('rep', 30, 3, 20)],
        success: { text: '발언 영상이 회원들 사이에 퍼졌다.', add: { support: 14, rep: 5 } }, fail: { text: '말실수가 기사 제목이 됐다.', add: { support: -6, rep: -1 } } } },
      { title: '절충안을 낸다', desc: '무난하게 넘어간다.', effect: { text: '양쪽 모두 고개를 끄덕였다.', add: { support: 4, net: 2 } } },
    ] },
  { id: 'audit', place: 'assoc', weight: 9, when: { stage: ['director'] }, title: '협회 회계 의혹',
    text: '전임 집행부 시절의 회계 의혹이 불거졌다. 내 이름도 결재란에 있다.',
    choices: [
      { title: '자료를 모두 공개한다', desc: '감사 비용은 사비로.', cost: 50, effect: { text: '공개 감사에서 문제가 없다는 결론이 났다.', add: { support: 4, rep: 2 } } },
      { title: '조용히 넘긴다', desc: '잠잠해지길 기다린다.', roll: { base: 50,
        success: { text: '다른 뉴스에 묻혔다.' }, fail: { text: '은폐 의혹으로 번졌다.', add: { support: -15, rep: -5 } } } },
    ] },
  { id: 'advisor', place: 'assoc', weight: 6, when: { stage: ['director', 'academy', 'company'], min: { rep: 45 } }, title: '정부 자문위원 위촉',
    text: '국토부 드론 정책 자문위원으로 와 달라는 공문이 왔다.',
    choices: [
      { title: '수락한다', desc: '시간은 들지만 이름이 난다.', effect: { text: '회의록에 내 발언이 실렸다.', add: { rep: 6, net: 6, support: 5, stamina: -20 } } },
      { title: '사양한다', desc: '본업이 먼저다.', effect: { text: '정중히 사양했다.', add: { biz: 2, teach: 2, theory: 3 } } },
    ] },
];

export const ENDINGS: EndingDef[] = [
  { id: 'ceo', main: true, bonus: 10000, title: '거대 드론 기업 CEO',
    text: '강의실 맨 뒷자리에서 졸던 학생은, 이제 수백 대의 기체가 뜨고 내리는 회사의 대표다. 사옥 옥상 이착륙장에서 첫 기체를 꺼내 보며 웃는다.' },
  { id: 'chairman', main: true, bonus: 8000, title: '파일럿 총협회장',
    text: '전국의 파일럿이 당신의 이름으로 한 표를 던졌다. 이제 하늘의 규칙을 정하는 자리에서, 처음 조종기를 잡던 날을 떠올린다.' },
  { id: 'academy', main: true, bonus: 7000, title: '드론 교육원장',
    text: '국가지정 전문교육기관 현판 아래로 매년 수백 명의 파일럿이 졸업한다. 그들의 첫 비행에는 언제나 당신의 목소리가 있다.' },
  { id: 'solo', main: true, bonus: 3000, title: '드론 1인 사업자',
    text: '직원도 사옥도 없지만 일정표는 석 달 뒤까지 차 있다. 밴 한 대와 기체 몇 대, 그리고 내 이름으로 된 계약서. 이만하면 충분하다.' },
  { id: 'debtor', main: true, bonus: 0, title: '빚쟁이',
    text: '독촉 문자가 하루에 열 통씩 온다. 기체도 차도 넘어갔다. 하늘은 여전히 파랗지만, 지금은 올려다볼 여유가 없다.' },
  { id: 'smallbiz', main: false, bonus: 2500, title: '중소 드론업체 사장',
    text: '회사는 크지 않지만 월급날을 한 번도 어긴 적이 없다. 거대 기업은 못 됐어도, 직원들의 점심값은 늘 사장이 낸다.' },
  { id: 'director', main: false, bonus: 2500, title: '협회 이사',
    text: '회장 자리에는 닿지 못했다. 그래도 회관 복도에서 마주치는 파일럿들은 모두 당신에게 먼저 인사한다.' },
  { id: 'instructor', main: false, bonus: 1500, title: '드론 교관',
    text: '오늘도 실습장에서 같은 말을 한다. "스틱은 부드럽게." 내 손을 거쳐 간 교육생들이 하늘 어딘가를 날고 있다.' },
  { id: 'employee', main: false, bonus: 1200, title: '드론 회사 직장인',
    text: '월급은 제때 나오고 주말에는 쉰다. 큰 모험은 없었지만, 꾸준히 날았다. 나쁘지 않은 비행이었다.' },
  { id: 'pilot', main: false, bonus: 1000, title: '일반 파일럿',
    text: '일거리를 찾아 전국을 돌았다. 대단한 성공은 아니어도, 조종기를 잡으면 여전히 가슴이 뛴다.' },
  { id: 'student', main: false, bonus: 0, title: '만년 수강생',
    text: '자격증은 끝내 따지 못했다. 그래도 드론 이야기만 나오면 누구보다 아는 게 많다. 언젠가는, 정말 언젠가는.' },
];

export const ENDING_IDS: EndingId[] = ENDINGS.map((e) => e.id);
