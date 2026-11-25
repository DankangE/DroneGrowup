export const POPUP_RULES = { pageSize: 3, sheetPercent: 55, textPage: 72, readingPage: 240, resultPage: 180, titleLength: 18,
  notificationHeight: 240, dockGap: 6, enterMs: 180 } as const;
export const ABILITY_STATS = ['skill', 'theory', 'xp', 'rep', 'net', 'teach', 'biz', 'support'] as const;
export const CHAPTER_COPY: Record<string, string> = {
  중년기: '직업의 성장과 가족, 주거 계획을 돌아봅니다.',
  장년기: '은퇴 뒤의 수입과 생활을 준비합니다.',
};
export const POPUPS = {
  start: { title: '첫걸음 고르기', phase: 'space' },
  space: { title: '이곳에서 할 일', phase: 'space' },
  event: { title: '사건', phase: 'event' },
  result: { title: '행동 결과', phase: 'result' },
  job: { title: '직업 고르기', phase: 'space' },
  rankup: { title: '승급', phase: 'rankup' },
  demotion: { title: '좌천', phase: 'rankup' },
  review: { title: '인사평가', phase: 'space' },
  'year-end': { title: '연말 정리', phase: 'close' },
  phone: { title: '휴대폰', phase: 'space' },
  bonus: { title: '추가 행동', phase: 'bonus' },
} as const;
// Keep the T18 fixture group stable; the combined registry is used by the renderer.
export const POPUPS2 = {
  shop: { title: '상점', phase: 'space' },
  estate: { title: '부동산', phase: 'space' },
  wedding: { title: '결혼식', phase: 'event' },
  education: { title: '자녀 교육', phase: 'event' },
  biz: { title: '가게', phase: 'space' },
  fund: { title: '펀드', phase: 'space' },
  luck: { title: '행운 카드', phase: 'event' },
  transfer: { title: '환승 · 특급 이동', phase: 'space' },
  'my-life': { title: '내 인생', phase: 'space' },
  chapter: { title: '중간 결산', phase: 'chapter' },
  retirement: { title: '정년', phase: 'chapter' },
} as const;
export const POPUP_DEFINITIONS = { ...POPUPS, ...POPUPS2 };
export type PopupKind = keyof typeof POPUP_DEFINITIONS;
export const FULLSCREEN_POPUPS: readonly PopupKind[] = ['rankup', 'demotion', 'chapter', 'retirement'];
// §11.3 counts rankup/demotion together; bonus is a phase, outside its twenty-item list.
export const POPUP_GROUPS: readonly (readonly PopupKind[])[] = [
  ['start'], ['space'], ['event'], ['result'], ['job'], ['rankup', 'demotion'], ['review'],
  ['shop'], ['estate'], ['wedding'], ['education'], ['biz'], ['fund'], ['luck'], ['transfer'],
  ['phone'], ['my-life'], ['year-end'], ['chapter'], ['retirement'],
];
export const LIFE_TABS = { ability: '능력', career: '직업', family: '가족과 집', assets: '자산', records: '기록', settings: '설정' } as const;
export const SETTINGS_COPY = { tilt: '기울임 보기', on: '켜짐', off: '꺼짐', body: '보드를 기울여 봅니다. 설정은 이 브라우저에 저장돼요.' } as const;
export type LifeTab = keyof typeof LIFE_TABS;
export const LIFE_COPY = {
  status: { student: '학생', jobless: '구직 중', working: '재직 중', retired: '은퇴' },
  funds: ['안정형', '성장형', '모험형'], levels: ['검소', '보통', '여유', '호화'],
  noHome: '아직 내 보금자리가 없어요. 부동산 칸에서 착륙할 집을 찾아보세요.', noPartner: '함께 날 인연을 기다려요. 생활 칸에서 만남을 시작해 보세요.', partner: '교제 중', married: '기혼',
  dual: '맞벌이', singleIncome: '가정 중심', noKids: '아직 작은 비행사는 없어요. 가족이 생기면 이곳에 기록돼요.', noAssets: '아직 수입 거점이 없어요. 상가·부동산 칸을 살펴보세요.',
  noRecords: '첫 비행 기록을 기다려요. 룰렛을 돌려 출발해 보세요.', noFeats: '첫 훈장을 기다려요. 새로운 지도를 방문해 보세요.',
  grade: (label: string, letter: string, value: number) => `${label} ${letter} (${value})`,
  field: (label: string, value: string | number) => `${label} ${value}`,
  money: (label: string, value: number) => `${label} ${value}만`,
  home: (map: string, tier: number, deposit: number) => `${map} · 집 등급 ${tier} · 보증금 ${deposit}만`,
  estate: (map: string, tier: number, paid: number) => `임대 주택 · ${map} · 등급 ${tier} · 매입액 ${paid}만`,
  shop: (id: string, level: number, paid: number) => `${id} · ${level}단계 · 투자액 ${paid}만`,
  record: (turn: number, text: string) => `${turn}계절 · ${text}`,
  feats: (names: readonly string[]) => `업적 · ${names.join(', ')}`,
  next: (text: string) => `다음 시기 · ${text}`,
} as const;
export const PHONE_TABS = { all: '전체', shop: '상점', repair: '정비', bank: '은행', retire: '조기 은퇴' } as const;
export type PhoneTab = keyof typeof PHONE_TABS;
export const COPY = {
  exit: '닫기', reopen: '다시 열기',
  pickDestination: '빛나는 도착 칸을 고르세요',
  quitTitle: '퇴사 확인', quitQuestion: '퇴사하고 구직자가 될까요?', quitConfirm: '퇴사한다', cancel: '취소', previous: '이전', next: '다음', details: '상세', back: '목록',
  empty: '지금 가능한 선택지가 없습니다.', success: '성공', fail: '실패', sure: '확정', crash: '추락',
  expected: '예상 결과', locked: '잠김', noChange: '변화 없음', endsSeason: '계절 마감',
  pages: (page: number, count: number) => `${page + 1} / ${count}`,
  cost: (cost: number, tire: number, chance?: number) =>
    `비용 ${cost}만 · 체력 ${tire}${chance === undefined ? '' : ` · 성공 ${chance}%`}`,
  roll: (value: number, chance: number) => `굴림 ${value} · 성공 확률 ${chance}%`,
  delta: (name: string, value: number) => `${name} ${value > 0 ? '+' : ''}${value}`,
  moneyEffect: (value: number) => `자금 ${value > 0 ? '+' : ''}${value}만`,
  staminaCost: (value: number) => `체력 -${value}`,
  chance: (value: number) => `성공 ${value}%`,
  rankChange: (from: string, to: string) => `${from} → ${to}`,
  salaryChange: (from: number, to: number) => `계절 급여 ${from}만 → ${to}만`,
  fundChange: (from: number, to: number) => `펀드 ${from}만 → ${to}만`,
  annualStat: (label: string, from: number, to: number) => `${label} ${from} → ${to}`,
  retirement: '은퇴',
  review: (perf: number, tenure: number, warn: number) => `성과 ${perf} · 재직 ${tenure}계절 · 경고 ${warn}`,
  refill: (value: number) => value < 0 ? `체력 상한 조정 ${value}` : `체력 회복 ${value}`,
} as const;
