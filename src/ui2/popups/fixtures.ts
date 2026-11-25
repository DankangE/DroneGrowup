// Isolated T19 examples shared by Node tests and the reviewer entry, never imported by the game.
import { choose, newGame } from '../../life/engine.ts';
import type { Forecast, OptionView, Result } from '../../life/engine.ts';
import type { GameState } from '../../life/types.ts';
import { WORLD } from '../../life/world.ts';
import { POPUPS2 } from './data.ts';
import type { PopupContext } from './model.ts';
import type { LifeSummaryView } from './life-model.ts';

export type Popup2Kind = keyof typeof POPUPS2;
export const POPUP2_IDS: Record<Popup2Kind, readonly string[]> = {
  shop: ['buy:drone', 'buy:gear', 'buy:car', 'sell:drone', 'sell:gear', 'sell:car', 'skip'],
  estate: ['home:rent:1', 'home:rent:2', 'home:buy:3', 'home:buy:4', 'home:buy:6', 'home:sell:3', 'home:move:2', 'skip'],
  wedding: ['wed:0', 'wed:1', 'wed:2', 'skip'],
  education: ['edu:0', 'edu:1', 'edu:2', 'skip'],
  biz: ['biz:buy:cafe', 'biz:up:cafe', 'biz:sell:cafe', 'biz:check:cafe', 'skip'],
  fund: ['fund:in:100', 'fund:out:100', 'fund:kind:0', 'fund:kind:1', 'fund:kind:2', 'skip'],
  // The spec has no option-id contract for these two kinds; exercise generic ids explicitly.
  luck: [], transfer: ['future:express:E-o0', 'future:transfer:B-o1', 'skip'],
  'my-life': [], chapter: [], retirement: ['retire:pension', 'retire:rehire', 'retire:switch'],
};
const LABELS: Record<string, string> = {
  'buy:drone': '드론 구매', 'buy:gear': '장비 구매', 'buy:car': '차량 구매',
  'sell:drone': '드론 판매', 'sell:gear': '장비 판매', 'sell:car': '차량 판매',
  'home:rent:1': '월세 원룸', 'home:rent:2': '전세 빌라', 'home:buy:3': '소형 아파트 구매',
  'home:buy:4': '중형 아파트 구매', 'home:buy:6': '펜트하우스 구매', 'home:sell:3': '소형 아파트 판매',
  'home:move:2': '전세 빌라 이사', 'wed:0': '작은 결혼식', 'wed:1': '예식장', 'wed:2': '호화 예식',
  'edu:0': '학교에 맡긴다', 'edu:1': '학원', 'edu:2': '특기 교육',
  'biz:buy:cafe': '드론 카페 구매', 'biz:up:cafe': '가게 확장', 'biz:sell:cafe': '가게 판매',
  'biz:check:cafe': '매출 점검', 'fund:in:100': '펀드에 넣는다', 'fund:out:100': '펀드에서 뺀다',
  'fund:kind:0': '안정형', 'fund:kind:1': '성장형', 'fund:kind:2': '모험형',
  'future:express:E-o0': '신도시로 특급 이동', 'future:transfer:B-o1': '도심으로 환승',
  'retire:pension': '연금을 받으며 은퇴', 'retire:rehire': '촉탁 재고용', 'retire:switch': '새 직업으로 전향',
  skip: '그냥 지나간다',
};
export const SUMMARY_FIXTURE: LifeSummaryView = {
  netWorth: 48231, career: '엔지니어 · 책임 연구원',
  family: ['기혼 · 맞벌이', '자녀 두 명'], home: ['도심 · 중형 아파트'],
  assets: ['드론 카페 · 현재 평가액 1,337만', '임대 주택 · 현재 평가액 15,432만'],
  feats: ['내 집 마련', '첫 승급'], nextPeriod: '중년기 · 승진과 가족의 성장을 준비합니다.',
};

export function fixtureOption(id: string, extra: Partial<OptionView> = {}): OptionView {
  return { id, kind: 'board', place: 'town', title: LABELS[id] ?? id,
    desc: '조회 결과로 받은 선택입니다. <저장된 글> ' + '긴 설명도 쪽을 넘겨 끝까지 읽습니다. '.repeat(8),
    cost: 0, tire: 0, enabled: true, free: false, locks: [], missing: [], ...extra };
}

export function popup2Fixture(kind: Popup2Kind): { state: GameState; context: PopupContext } {
  const state = choose(newGame(19), 'start:work').state;
  state.turn = kind === 'retirement' ? 164 : 64;
  state.status = 'working'; state.track = 'engineer'; state.job.rank = 2;
  state.job.perf = 73; state.job.tenure = 13; state.job.tracks = ['service', 'engineer'];
  state.board.step = 'space';
  const tile = { shop: 'shop', estate: 'estate', biz: 'biz', fund: 'invest', luck: 'luck', transfer: 'station' } as const;
  if (kind in tile) state.board.pos = WORLD.find(node => node.kind === tile[kind as keyof typeof tile])!.id;
  state.s.money = 17001; state.s.debt = 420; state.s.happy = 512;
  state.home = { map: 'B', tier: 4, deposit: 0 };
  state.estates = [{ map: 'E', tier: 3, paid: 7000 }];
  state.holdings = [{ id: '<새 가게>', level: 2, paid: 1920 }];
  state.fund = { kind: 1, amount: 1234 };
  state.family = { partnerAt: 12, marriedAt: 20, dual: true,
    kids: [{ born: 24, pts: 3, stage: 1 }, { born: 32, pts: 1, stage: 0 }] };
  state.feats = ['내 집 마련', '첫 승급'];
  state.log = [{ turn: 63, text: '<img src=x onerror=bad()> 가족과 보낸 하루', tone: 'info' }];
  const offered = POPUP2_IDS[kind].map((id, index) => fixtureOption(id, {
    cost: id === 'skip' ? 0 : index * 37, enabled: index !== 2,
    locks: index === 2 ? ['엔진이 제공한 잠금 사유'] : [],
  }));
  const previews: Record<string, Forecast> = Object.fromEntries(offered.map(option => [option.id, {
    cost: option.cost, tire: 7, chance: 67,
    branches: [{ id: 'success', deltas: { happy: 17, money: -123 }, endsSeason: false },
      { id: 'fail', deltas: { happy: -2 }, endsSeason: false }],
  }]));
  const result: Result = { optionId: 'fixture:luck', title: '경품 당첨', place: 'lottery', free: true,
    text: '추첨 결과를 받았습니다.', deltas: { money: 300 }, notes: [], crashed: false,
    statusFrom: state.status, statusTo: state.status, trackFrom: state.track, trackTo: state.track };
  return { state, context: { kind, offered, previews, summary: SUMMARY_FIXTURE,
    ...(kind === 'transfer' && { destinations: { 'future:express:E-o0': 'E-o0', 'future:transfer:B-o1': 'B-o1' } }),
    lines: [POPUPS2[kind].title, '엔진 조회값을 표시하는 화면 예시입니다.'],
    ...(kind === 'luck' && { result, title: result.title }) } };
}
