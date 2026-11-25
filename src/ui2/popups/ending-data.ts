import { ENDINGS } from '../../game/data.ts';
import type { EndingId, PlaceId, TrackId } from '../../life/types.ts';

export type EndingCopy = { id: EndingId; title: string; text: string; hint: string;
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

// Display order and hints only (§10). T13 owns the predicates, priority and final score.
const ROWS: readonly [EndingId, string, EndingCopy['art']][] = [
  ['debtor', '순자산 −3,000만 미만', { file: 'ending-debtor' }],
  ['philanthropist', '재단 설립', { place: 'school' }],
  ['ceo', '상장 성공', { file: 'ending-ceo' }],
  ['chairman', '당선 경력', { file: 'ending-chairman' }],
  ['academy', '교육원 인가 성공', { file: 'ending-academy' }],
  ['legend', '레이서 최고 직급 경력', { track: 'racer' }],
  ['master', '엔지니어 · 점검 · 촬영 · 관제 중 최고 직급 경력', { track: 'engineer' }],
  ['star', '다이아 등급 경력', { track: 'creator' }],
  ['hero', '항공대장 경력', { track: 'rescue' }],
  ['tycoon', '순자산 100,000만 이상', { place: 'residence' }],
  ['family', '행복 700 이상 · 자녀 독립 2명 이상', { place: 'home' }],
  ['official', '공무원으로 정년', { track: 'public' }],
  ['smallbiz', '결산 때 법인 대표', { file: 'ending-smallbiz' }],
  ['solo', '결산 때 또는 마지막 직업이 1인 사업자', { file: 'ending-solo' }],
  ['director', '협회 임원 경력으로 마침', { file: 'ending-director' }],
  ['instructor', '마지막 직업이 교관 · 교육원', { file: 'ending-instructor' }],
  ['employee', '마지막 직업이 드론 회사 직원 · 사무직', { file: 'ending-employee' }],
  ['pilot', '마지막 직업이 파일럿 · 정비사 · 배송 기사 중 자격증 보유', { file: 'ending-pilot' }],
  ['freeman', '행복 500 이상', { place: 'promenade' }],
  ['worker', '마지막 직업이 가게 직원 · 배송 기사 · 정비사', { track: 'service' }],
  ['student', '그 밖의 인생', { file: 'ending-student' }],
];

/** Temporary presentation catalog until T13's ENDINGS2 is available; no engine data is changed. */
export const ENDINGS2: readonly EndingCopy[] = ROWS.map(([id, hint, art]) => {
  const copy = ENDINGS.find(row => row.id === id) ?? NEW_ENDINGS[id as keyof typeof NEW_ENDINGS];
  return { id, title: copy.title, text: copy.text, hint, art };
});

export const ENDING_COPY = {
  title: '인생 결산', gallery: '엔딩 모음', restart: '새 인생', home: '타이틀',
  discovered: '발견', locked: '미발견', unknown: '아직 엔딩이 없습니다.',
  score: (score: number) => `최종 점수 ${score}`,
  grade: (grade: string) => `최종 성적 ${grade}`,
  feats: (score: number) => `업적 점수 ${score}`,
  best: (score: number) => `최고 점수 ${score}`,
  count: (count: number, total: number) => `발견한 엔딩 ${count} / ${total}`,
} as const;

export const ENDING_STYLE = `
.life2 .life2-ending-screen { box-sizing:border-box; width:100%; height:100%; max-width:800px; margin:auto;
  display:grid; grid-template-rows:44px minmax(0,1fr) 44px; gap:12px; padding:12px;
  background:#fff6e0; color:#2b2440; font:600 13px/20px system-ui,sans-serif; }
.life2 .life2-ending-screen * { box-sizing:border-box; min-width:0; }
.life2 .life2-ending-screen h1 { font-size:20px; margin:0; }
.life2 .life2-ending-screen h2 { font-size:18px; margin:0; overflow-wrap:anywhere; }
.life2 .life2-ending-screen p { margin:0; overflow-wrap:anywhere; white-space:pre-wrap; }
.life2 .life2-ending-screen button { min-width:44px; min-height:44px; padding:6px;
  font:700 12px/18px system-ui,sans-serif; border:1px solid #80758b; border-radius:8px; color:inherit; background:#fff9eb; }
.life2 .life2-ending-screen button:focus-visible { outline:3px solid #6036b6; outline-offset:-3px; }
.life2 .life2-ending-content { display:grid; align-content:center; gap:12px; }
.life2 .life2-ending-art { display:flex; justify-content:center; }
.life2 .life2-ending-art img,.life2 .life2-ending-art svg { width:96px; height:96px; object-fit:contain; }
.life2 .life2-ending-copy { display:grid; gap:8px; }
.life2 .life2-ending-copy p { min-height:60px; }
.life2 .life2-ending-controls,.life2 .life2-ending-pager { display:flex; align-items:center; gap:8px; }
.life2 .life2-ending-controls button,.life2 .life2-ending-pager button { flex:1; }
.life2 .life2-ending-cards { display:grid; gap:8px; }
.life2 .life2-ending-card { text-align:left; display:grid; grid-template-columns:minmax(0,1fr) auto; gap:8px; }
`;
