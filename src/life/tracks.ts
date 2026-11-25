// Career and F2 action tables: life-board.md §§5–6. Percentages stay integral.
import { ACTIONS as V1_ACTIONS } from '../game/data.ts';
import type { ActionDef, Choice, Cond, PlaceId, Stat, StatMap, TrackDef, TrackId } from './types.ts';

const need = (id: string): Cond => structuredClone(V1_ACTIONS.find(action => action.id === id)!.need!);
const rank = (title: string, salary: number, condition: Cond = {}, tenure = 0, jobPct?: number): TrackDef['ranks'][number] =>
  ({ title, salary, need: condition, tenure, ...(jobPct !== undefined && { jobPct }) });
const salaried = { salaried: true, warnBelow: 30, pensionPct: 30 };
const independent = { salaried: false, warnBelow: 30, pensionPct: 0 };

export const TRACKS: TrackDef[] = [
  { id: 'service', name: '가게 직원', tier: 1, maps: ['A', 'B', 'F'], ...salaried, entry: {}, ranks: [
    rank('알바', 70), rank('정직원', 110, { min: { xp: 100 } }, 4),
    rank('매니저', 160, { min: { xp: 210, net: 30 } }, 8),
    rank('점장', 230, { min: { xp: 420, net: 60, biz: 30 } }, 12),
  ] },
  { id: 'delivery', name: '배송 기사', tier: 1, maps: ['A', 'C', 'E'], ...salaried, entry: { min: { car: 1 } }, ranks: [
    rank('배송 기사', 90), rank('조장', 195, { min: { xp: 100 } }, 4),
    rank('물류 주임', 277, { min: { xp: 210, biz: 30 } }, 8),
    rank('센터장', 405, { min: { xp: 420, biz: 60, net: 60 } }, 12),
  ] },
  { id: 'mechanic', name: '드론 정비사', tier: 1, maps: ['A', 'C'], ...salaried, entry: { min: { theory: 30 } }, ranks: [
    rank('정비 보조', 100), rank('정비사', 225, { min: { skill: 45, theory: 60 } }, 4),
    rank('선임 정비사', 315, { min: { skill: 90, xp: 210 } }, 8),
    rank('정비 팀장', 435, { min: { skill: 150, xp: 420 } }, 12),
    rank('정비 명장', 600, { min: { skill: 270, xp: 630, rep: 75 } }, 16),
  ] },
  { id: 'clerk', name: '사무직', tier: 1, maps: ['B', 'E'], ...salaried,
    entry: { any: [{ min: { theory: 60 } }, { flags: ['degree'] }] }, ranks: [
      rank('사원', 110), rank('대리', 160, { min: { xp: 210 } }, 6),
      rank('과장', 230, { min: { xp: 420, net: 60 } }, 10),
      rank('부장', 330, { min: { xp: 480, net: 150, biz: 105 } }, 14),
      rank('임원', 480, { min: { xp: 870, net: 260, biz: 200 } }, 16),
    ] },
  { id: 'pilot', name: '프리랜서 파일럿', tier: 2, maps: 'any', ...independent, entry: { flags: ['licensed'] }, ranks: [
    rank('신입', 0, {}, 0, 100), rank('지명 파일럿', 0, { min: { rep: 60, flights: 30 } }, 0, 115),
    rank('베테랑', 0, { min: { rep: 105, flights: 80 } }, 0, 130),
    rank('에이스', 0, { min: { rep: 150, skill: 225, flights: 150 } }, 0, 150),
    rank('마스터', 0, { min: { rep: 180, skill: 330, flights: 250 } }, 0, 175),
  ] },
  { id: 'employee', name: '드론 회사 직원', tier: 2, maps: ['B', 'E'], ...salaried,
    entry: { flags: ['licensed'], min: { xp: 270 } }, ranks: [
      rank('사원', 130), rank('대리', 270, need('emp_promo1'), 6),
      rank('과장', 375, need('emp_promo2'), 10), rank('팀장', 510, need('emp_promo3'), 14),
      rank('본부장', 690, { min: { xp: 630, biz: 150, net: 150 } }, 8),
      rank('임원', 930, { min: { xp: 870, biz: 260, rep: 120 } }, 8),
    ] },
  { id: 'instructor', name: '드론 교관', tier: 2, maps: ['A', 'B'], ...salaried,
    entry: { flags: ['licensed'], min: { xp: 270, theory: 90 } }, ranks: [
      rank('전속 교관', 120), rank('실기평가 교관', 270, need('inst_examiner'), 6),
      rank('수석 교관', 390, { min: { teach: 240, rep: 105 } }, 12),
      rank('교육 본부장', 525, { min: { teach: 300, rep: 150, net: 100 } }, 16),
    ] },
  { id: 'public', name: '항공안전 공무원', tier: 2, maps: ['B'], ...salaried, warnBelow: 20, pensionPct: 50,
    entry: { min: { theory: 150 } }, entryFee: 50,
    entryRoll: { base: 45, mods: [{ stat: 'theory', over: 150, per: 5, pct: 1, cap: 30 }],
      success: { text: '필기시험에 합격해 항공안전 공무원이 되었다.' }, fail: { text: '필기시험에 불합격했다.' } }, ranks: [
      rank('주무관', 115), rank('주사', 225, { min: { xp: 210 } }, 10),
      rank('사무관', 300, { min: { xp: 420, theory: 180 } }, 14),
      rank('서기관', 405, { min: { xp: 480, net: 100 } }, 16),
      rank('국장', 540, { min: { xp: 630, net: 200, rep: 105 } }, 16),
    ] },
  { id: 'rescue', name: '소방 드론 대원', tier: 2, maps: ['C'], ...salaried,
    entry: { flags: ['licensed'], min: { skill: 150 } }, ranks: [
      rank('대원', 140), rank('반장', 285, { min: { skill: 225, xp: 420 } }, 8),
      rank('대장', 390, { min: { skill: 270, rep: 105 } }, 12),
      rank('항공대장', 540, { min: { skill: 330, rep: 150, net: 100 } }, 16),
    ] },
  { id: 'creator', name: '드론 크리에이터', tier: 2, maps: 'any', ...independent,
    entry: { min: { drone: 1, gear: 1 } }, ranks: [
      rank('새내기', 0), rank('실버', 0, { min: { fans: 100 } }),
      rank('골드', 0, { min: { fans: 300 } }), rank('다이아', 0, { min: { fans: 600 } }),
    ] },
  { id: 'engineer', name: '드론 개발 엔지니어', tier: 3, maps: ['D'], ...salaried,
    entry: { min: { theory: 180 }, flags: ['degree'] }, ranks: [
      rank('연구원', 200), rank('선임 연구원', 280, { min: { theory: 240, xp: 420 } }, 8),
      rank('책임 연구원', 390, { min: { theory: 320, xp: 480 }, flags: ['master'] }, 12),
      rank('수석 연구원', 540, { min: { xp: 630, rep: 105 } }, 12),
      rank('기술 총괄', 760, { min: { xp: 870, biz: 150, rep: 150 } }, 16),
    ] },
  { id: 'inspector', name: '산업 점검 전문가', tier: 3, maps: ['D'], ...salaried,
    entry: { flags: ['licensed'], min: { skill: 225, drone: 3, gear: 2 } }, ranks: [
      rank('점검원', 190), rank('선임 점검원', 270, { min: { skill: 270, xp: 420 } }, 8),
      rank('수석 점검원', 380, { min: { skill: 330, xp: 630, gear: 3 } }, 12),
      rank('기술 이사', 520, { min: { xp: 870, rep: 120, net: 150 } }, 16),
    ] },
  { id: 'film', name: '항공 촬영 감독', tier: 3, maps: ['D'], ...salaried,
    entry: { flags: ['licensed'], min: { skill: 225, rep: 105, drone: 4 } }, ranks: [
      rank('촬영 기사', 180), rank('촬영 감독', 270, { min: { skill: 270, rep: 120 } }, 8),
      rank('책임 감독', 400, { min: { rep: 150, net: 150, gear: 3 } }, 12),
      rank('총감독', 600, { min: { rep: 180, net: 260 } }, 16),
    ] },
  { id: 'atc', name: '드론 관제사', tier: 3, maps: ['D'], ...salaried,
    entry: { flags: ['licensed'], min: { theory: 180 } }, ranks: [
      rank('관제사', 170), rank('선임 관제사', 240, { min: { theory: 240, xp: 420 } }, 8),
      rank('관제 팀장', 330, { min: { xp: 480, net: 100 } }, 12),
      rank('관제 센터장', 450, { min: { xp: 630, net: 200, rep: 105 } }, 16),
    ] },
  { id: 'racer', name: '프로 드론 레이서', tier: 3, maps: ['D'], ...independent,
    entry: { min: { skill: 270 } }, entryRoll: {
      base: 40, mods: [{ stat: 'skill', over: 270, per: 5, pct: 1, cap: 30 }],
      success: { text: '입단 테스트에 합격해 프로 드론 레이서가 되었다.' }, fail: { text: '입단 테스트를 통과하지 못했다.' },
    }, ranks: [
      rank('루키', 100, {}, 0, 100), rank('프로', 220, { min: { skill: 330, wins: 5 } }, 0, 150),
      rank('챔피언', 450, { min: { rep: 150, wins: 12 } }, 0, 200),
      rank('레전드', 800, { min: { rep: 180, wins: 20 } }, 0, 300),
    ] },
  { id: 'solo', name: '1인 사업자', tier: 4, maps: 'any', ...independent,
    entry: need('solo_register'), entryFee: 200, ranks: [
      rank('1인 사업자', 0), rank('지역 대표 사업자', 0, { min: { contracts: 6, rep: 105 } }),
      rank('전국구 사업자', 0, { min: { contracts: 12, rep: 150 } }),
    ] },
  { id: 'company', name: '법인 대표', tier: 4, maps: 'any', ...independent,
    entry: need('corp_found'), entryFee: 1500, ranks: [
      rank('창업 대표', 0), rank('1차 투자', 0, { min: { round: 1 } }),
      rank('2차 투자', 0, { min: { round: 2 } }), rank('상장 준비', 0, need('co_ipo')),
      rank('상장사 대표', 0, { flags: ['listed'] }),
    ] },
  { id: 'academy', name: '교육원 원장', tier: 4, maps: 'any', ...independent,
    entry: need('academy_found'), entryFee: 2800, ranks: [
      rank('원장', 0), rank('제2 실습장', 0, need('ac_expand')),
      rank('종합 교육센터', 0, need('ac_expand2')), rank('국가지정 교육원장', 0, { flags: ['accredited'] }),
    ] },
  { id: 'director', name: '협회 임원', tier: 4, maps: 'any', ...independent,
    entry: { ...need('assoc_run'), flags: ['member'] }, entryFee: 375,
    entryRoll: structuredClone(V1_ACTIONS.find(action => action.id === 'assoc_run')!.roll!), ranks: [
      rank('이사', 80), rank('부회장', 140, need('dir_vice')), rank('총협회장', 400, need('dir_chair')),
    ] },
];

// Basic duties never require personal equipment or cash. Salary is paid by seasonal accounting.
// Training/preparation gains are comparable to the imported study actions, without their fees.
const PRACTICE: Record<TrackId, { place: PlaceId; title: string; add: StatMap }> = {
  service: { place: 'town', title: '매장 운영 연습', add: { xp: 8, net: 2, biz: 2 } },
  delivery: { place: 'logistics', title: '배송 동선 연습', add: { xp: 8, biz: 3, net: 1 } },
  mechanic: { place: 'garage', title: '정비 실습', add: { skill: 7, theory: 5, xp: 8, rep: 2 } },
  clerk: { place: 'office', title: '사무 실무 연습', add: { xp: 12, net: 6, biz: 5 } },
  pilot: { place: 'airfield', title: '비행 절차 연습', add: { skill: 12, theory: 4, rep: 5 } },
  employee: { place: 'hq', title: '업무 보고 연습', add: { xp: 14, biz: 10, rep: 4, net: 4 } },
  instructor: { place: 'academy', title: '수업 진행 연습', add: { teach: 6, theory: 4, rep: 2 } },
  public: { place: 'city_hall', title: '항공안전 행정 연습', add: { xp: 12, theory: 4, net: 5, rep: 3 } },
  rescue: { place: 'fire_base', title: '구조 절차 연습', add: { skill: 9, xp: 10, rep: 4, net: 3 } },
  creator: { place: 'studio', title: '영상 구성 연습', add: { skill: 4, biz: 4, rep: 4 } },
  engineer: { place: 'lab', title: '기체 설계 연습', add: { theory: 6, xp: 12, biz: 4, rep: 4 } },
  inspector: { place: 'bridge', title: '시설 점검 연습', add: { skill: 9, xp: 10, rep: 4, net: 3 } },
  film: { place: 'studio', title: '촬영 동선 연습', add: { skill: 6, rep: 6, net: 6 } },
  atc: { place: 'airport', title: '관제 상황 연습', add: { theory: 6, xp: 12, net: 5, rep: 3 } },
  racer: { place: 'raceway', title: '코너 주행 연습', add: { skill: 8, rep: 4 } },
  solo: { place: 'office', title: '견적과 계약 연습', add: { biz: 6, rep: 4, net: 2 } },
  company: { place: 'hq', title: '조직 운영 연습', add: { biz: 6, net: 4, rep: 2 } },
  academy: { place: 'academy', title: '교육과정 설계 연습', add: { teach: 6, rep: 4, biz: 2 } },
  director: { place: 'assoc', title: '회의 진행 연습', add: { net: 6, rep: 4, support: 2 } },
};
export const TRACK_WORK: ActionDef[] = TRACKS.map(track => ({
  id: `work_${track.id}`, place: PRACTICE[track.id].place, when: { status: ['working'], track: [track.id] },
  title: '근무', desc: `${track.name}의 기본 업무. 일감 칸은 성공하면 성과 +8, 실패하면 −4. 추가 행동은 성과 +5.`, tire: 20,
  roll: { base: 80, success: { text: '맡은 업무를 마쳤다.', add: track.id === 'service' ? { xp: 5, rep: 1 } : { xp: 10, rep: 3 } },
    fail: { text: '업무를 마치지 못해 보완할 점을 정리했다.', add: { xp: 2 } } },
}));
export const TRACK_TRAIN: ActionDef[] = TRACKS.map(track => ({
  id: `train_${track.id}`, place: PRACTICE[track.id].place, when: { status: ['working'], track: [track.id] },
  title: PRACTICE[track.id].title, desc: `${track.name}의 직무 능력을 익힌다.`, tire: 20,
  effect: { text: '직무 연습을 마치고 배운 내용을 정리했다.', add: PRACTICE[track.id].add },
}));
export const TRACK_PREP: ActionDef[] = TRACK_TRAIN.map(action => ({
  ...action, id: action.id.replace('train_', 'prep_'), title: '다음 직급 준비',
  desc: '승급 심사를 받을 수 없어 직무 능력을 연습한다.',
}));

export const JOB_RULES = {
  candidates: 6, locked: 2, wait: 4, entryRank: 0, careerRank: 1, entryPerf: 50,
  specialistTier: 3, guidanceTier: 4, startMoney: 500, studySeasons: 8, studyPct: 150, selfPct: 120,
  selfMoney: 300, tuition: 50, allowance: 80, deliveryAllowance: 30,
  creatorAdPct: [100, 120, 150, 200],
  maxAge: { public: 40, rescue: 40, racer: 35 } as Partial<Record<TrackId, number>>,
  studyStats: ['theory', 'skill', 'xp', 'rep', 'teach', 'biz', 'net'] as Stat[],
  partTimeActions: ['st_parttime', 'st_assist'],
  started: 'life_started', schoolUntil: 'school_until', selfUntil: 'self_until',
  popup: 'job_offer', popupStart: 1, popupPassed: 2, popupEvent: 3, popupHeadhunter: 4,
  degree: 'degree', retirementBase: 'career_retirement_base', retirementDeferralSeasons: 1,
} as const;

export const START_CHOICES: Record<'school' | 'work' | 'self', Choice> = {
  school: { title: '드론학과 진학', desc: '8계절 동안 등록금 50, 용돈 80. 새싹 마을 배움 효과 150%. 8계절 뒤 졸업장.',
    effect: { text: '드론학과에 진학했다.', status: 'student' } },
  work: { title: '바로 취업', desc: '구직자로 시작하고 지금 일자리 카드를 살펴본다.',
    effect: { text: '일자리 센터에서 첫 직업을 찾는다.', status: 'jobless' } },
  self: { title: '독학과 아르바이트', desc: '자금 +300. 8계절 동안 아르바이트 보수 120%. 용돈 없음.',
    effect: { text: '독학과 아르바이트로 출발했다.', status: 'jobless', add: { money: JOB_RULES.selfMoney } } },
};
export const JOB_CHOICES = {
  none: { title: '지금은 고르지 않는다', desc: '그냥 지나간다. 다음 기회에 일자리를 고른다.',
    effect: { text: '이번에는 직업을 고르지 않았다.' } },
  quit: { title: '퇴사하고 구직자가 된다', desc: '지금 직업을 그만둔다. 이직 대기 기간은 유지된다.',
    effect: { text: '퇴사하고 구직자가 되었다.', status: 'jobless', track: null } },
} satisfies Record<string, Choice>;
export const JOB_TEXT = {
  deferRetirement: '한 계절만 정년 결정을 미룬다. 다음 계절에는 자동으로 은퇴하고 연금을 받는다.',
  age: (max: number) => `${max}세 이하일 때 입사할 수 있습니다.`,
  wait: (seasons: number) => `이직까지 ${seasons}계절을 기다려야 합니다.`,
  retired: '은퇴 신분으로는 입사할 수 없습니다.',
  map: '이 지도에서는 입사할 수 없습니다.', same: '이미 재직 중인 직업입니다.',
  guidance: '창업 안내: 해당 장소에서 등록 · 설립 · 출마 행동을 선택하세요.',
  flag: { degree: '졸업장', master: '석사', listed: '상장 성공', accredited: '교육원 인가' } as Record<string, string>,
  either: (parts: string[]) => parts.join(' 또는 '),
  hired: (name: string) => `${name} 직업으로 새로 출발했다.`,
  title: (name: string, rank: string) => `${name} · ${rank}`,
  guideTitle: (name: string) => `${name} · 창업 안내`,
  card: (ladder: string, salary: number, pay: number, next: string) =>
    `${ladder}. 첫 급여 ${salary}만원, 현재 지도 실수령 ${pay}만원. 다음 직급: ${next}`,
  rung: (title: string, pay: number) => `${title} ${pay}만원`,
  ladderSeparator: ' → ', conditionSeparator: ', ', noNext: '최고 직급', noNeed: '추가 조건 없음',
  tenure: (seasons: number) => `재직 ${seasons}계절`,
  requirement: (stat: string, min: number) => `${stat} ${min} 이상`,
  badJob: (id: string) => `job not available: ${id}`,
};

// T10: specialist benefits and activities (§§3.2, 6.1, 6.3). Tuition uses T06's table.
export const SPECIAL_RULES = {
  map: 'D', tenure: 2, ordinaryTenure: 1, trainingPct: 150,
  graduateId: 'graduate:enroll', master: 'master', graduatePlace: 'grad_school',
  videoId: 'creator_video', fanMin: 8, fanMax: 20, fanRetentionPct: 97,
  expressFare: 150, invite: 'invite', racerContest: 'club',
} as const;
export const SPECIAL_TEXT = {
  graduateTitle: '대학원 등록',
  graduateDesc: '6계절 동안 계절당 등록금 150만원. 직업과 지역을 유지할 필요 없이 이수하면 석사를 받는다.',
  graduateDone: '대학원 과정을 시작했다.', graduateBusy: '이미 대학원 과정을 이수 중입니다.',
  graduated: '대학원 6계절 과정을 마치고 석사 학위를 받았다.',
  creatorIncome: '구독자 광고 수입',
  expressTitle: (name: string) => `${name}으로 특급 이동`,
  expressDesc: '150만원을 내고 출발 칸으로 이동한다. 정산 뒤 추가 행동은 도착한 곳에서 한다.',
  expressDone: (name: string) => `${name} 출발 칸에 도착했다.`,
} as const;
// Use the basic duty's success chance. Fan growth is sampled from the saved RNG in jobs.ts.
export const CREATOR_VIDEO: ActionDef = {
  id: SPECIAL_RULES.videoId, place: 'studio', when: { status: ['working'], track: ['creator'] },
  title: '영상 촬영', desc: '영상 공개에 성공하면 구독자 8~20명. 매년 구독자의 3%가 떠난다.',
  roll: { base: TRACK_WORK.find(action => action.id === 'work_creator')!.roll!.base,
    success: { text: '새 영상을 공개해 구독자가 늘었다.' }, fail: { text: '촬영을 마치지 못해 다음 영상을 준비했다.' } },
};
