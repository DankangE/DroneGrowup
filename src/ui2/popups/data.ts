export const POPUP_RULES = { pageSize: 3, sheetPercent: 55, textPage: 36, titleLength: 18 } as const;
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
export type PopupKind = keyof typeof POPUPS;
export const PHONE_TABS = { all: '전체', shop: '상점', repair: '정비', bank: '은행', retire: '조기 은퇴' } as const;
export type PhoneTab = keyof typeof PHONE_TABS;
export const COPY = {
  exit: '그냥 지나간다', previous: '이전', next: '다음', details: '상세', back: '목록',
  empty: '지금 가능한 선택지가 없습니다.', success: '성공', fail: '실패', sure: '확정', crash: '추락',
  expected: '예상 결과', locked: '잠김', noChange: '변화 없음', endsSeason: '계절 마감',
  pages: (page: number, count: number) => `${page + 1} / ${count}`,
  cost: (cost: number, tire: number, chance?: number) =>
    `비용 ${cost}만 · 체력 ${tire}${chance === undefined ? '' : ` · 성공 ${chance}%`}`,
  roll: (value: number, chance: number) => `굴림 ${value} · 성공 확률 ${chance}%`,
  delta: (name: string, value: number) => `${name} ${value > 0 ? '+' : ''}${value}`,
  review: (perf: number, tenure: number, warn: number) => `성과 ${perf} · 재직 ${tenure}계절 · 경고 ${warn}`,
  refill: (value: number) => `체력 회복 ${value}`,
} as const;
