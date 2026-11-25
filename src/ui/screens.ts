import { careerRank, GRADED_STATS } from '../game/career.ts';
import { chibi, rankLine, standingGrades } from './pieces.ts';
import { ENDINGS, RULES } from '../game/data.ts';
import { derived, endingInfo, finalRank, num } from '../game/engine.ts';
import type { EndingId, GameState } from '../game/types.ts';
import type { Meta } from '../save.ts';
import { button, countNumber, el, meter } from './dom.ts';
import { endingPortrait } from './art.ts';
import { portrait } from './images.ts';
import { icon, type IconName } from './icons.ts';
import coverUrl from '/art/cover.webp?url';

const endingHints: Record<EndingId, string> = {
  ceo: '기업 · 더 큰 하늘을 향해', chairman: '협회 · 함께 날아가는 사람들', academy: '교육 · 누군가의 첫 비행',
  solo: '독립 · 내 이름으로 쓴 계약서', debtor: '재정 · 균형을 잃은 비행', smallbiz: '기업 · 작은 회사의 큰 책임',
  director: '협회 · 업계의 목소리', instructor: '교육 · 조종기를 건네는 손', employee: '회사 · 꾸준함의 가치',
  pilot: '비행 · 현장에서 찾은 내 길', student: '시작 · 아직 끝나지 않은 꿈',
};
function pill(symbol: IconName, text: string) {
  const node = el('span','pill',text);
  node.prepend(icon(symbol));
  return node;
}
type TitleActions = { onNew: () => void; onContinue: () => void; onGallery: () => void; onRanking?: () => void; nickname?: string };
export function titleScreen(meta: Meta, saved: GameState | null, actions: TitleActions) {
  const main = el('main','title-screen frame');
  const cover = el('section','cover');
  cover.dataset.clipOk = '';
  const art = el('img', 'cover-image');
  art.src = coverUrl;
  art.alt = '';
  art.decoding = 'async';
  const copy = el('div','cover-copy');
  const tab = el('span','ribbon','드론 커리어 육성 게임');
  tab.prepend(icon('drone'));
  const title = el('h1','game-title');
  title.append(el('span','','파일럿'), document.createTextNode(' '), el('span','','키우기'));
  copy.append(tab,title,el('p','','작은 드론으로 시작하는 나만의 비행 인생'));
  cover.append(art, copy);
  const coverFoot = el('div','cover-foot');
  coverFoot.append(pill('sun',`${RULES.startAge}세부터 ${RULES.startAge + RULES.maxTurns / 4}세까지`),pill('flag',`${ENDINGS.length}가지 엔딩`));
  cover.append(coverFoot);
  const console = el('div','title-console');
  const guide = el('section','guide');
  guide.append(el('h2','section-heading','비행 안내'));
  for (const [symbol,title,body] of [
    ['map','주사위로 이동', '계절마다 주사위를 굴리고 갈림길에서 항로를 골라요.'],
    ['drone','칸 행동', '도착하면 체력 없이 행동하고, 남은 체력으로 한 번 더 해요.'],
    ['flag','월급날과 승급', '월급날엔 장부를 정산하고 승급 칸에선 다음 랭크에 도전해요.'],
  ] as const) {
    const row = el('div','guide-row');
    const mark = el('span','guide-icon');
    mark.append(icon(symbol));
    row.append(mark,el('strong','',title),el('span','',body));
    guide.append(row);
  }
  const controls = el('div','title-controls');
  const start = button('새 게임','primary start-game',actions.onNew,'new');
  start.prepend(icon('drone'));
  start.append(icon('arrow'));
  controls.append(start);
  if (saved) controls.append(button('이어하기 · ' + derived(saved).stageName,'secondary',actions.onContinue,'continue-run'));
  const gallery = button('', 'album-link', actions.onGallery,'gallery');
  gallery.append(icon('book'),el('b','','엔딩 도감'),el('span','',`${meta.gallery.length} / ${ENDINGS.length}`),icon('arrow'));
  controls.append(gallery);
  const record = el('div','records');
  record.append(pill('star',`최고 ${num(meta.best)}점`),pill('flag',`완주 ${num(meta.runs)}회`));
  controls.append(record);
  if (actions.onRanking) {
    const online = el('div','online');
    online.append(pill('drone',actions.nickname ?? ''),button('랭킹','secondary',actions.onRanking));
    controls.append(online);
  }
  console.append(guide,controls);
  main.append(cover,console);
  return main;
}

export function galleryScreen(meta: Meta, onTitle: () => void) {
  const main = el('main','gallery-screen frame');
  const head = el('header','window-title album-head');
  head.append(el('h1','','엔딩 도감'),pill('book',`${meta.gallery.length} / ${ENDINGS.length}`));
  const detail = el('section','album-detail');
  detail.setAttribute('aria-live','polite');
  const grid = el('div','album-grid');
  const select = (index: number) => {
    const ending = ENDINGS[index];
    const found = meta.gallery.includes(ending.id);
    const copy = el('div','album-story');
    copy.append(el('small','',ending.main ? '대표 엔딩' : '커리어 엔딩'),el('h2','',found ? ending.title : '???'),el('p','',found ? ending.text : endingHints[ending.id]));
    detail.replaceChildren(portrait(found ? endingPortrait(ending.id) : undefined, true),copy);
    [...grid.children].forEach((b,i) => b.setAttribute('aria-pressed', String(i === index)));
  };
  ENDINGS.forEach((ending,i) => {
    const found = meta.gallery.includes(ending.id);
    const tile = button('','tile',() => select(i));
    tile.setAttribute('aria-label',found ? ending.title : `미발견 엔딩 ${i + 1}`);
    tile.append(portrait(found ? endingPortrait(ending.id) : undefined, true),el('b','',found ? ending.title : '???'));
    grid.append(tile);
  });
  select(Math.max(0, ENDINGS.findIndex(e => meta.gallery.includes(e.id))));
  const body = el('div', 'album-body');
  body.append(meter(meta.gallery.length, ENDINGS.length, '발견한 엔딩'),detail,grid,button('타이틀','secondary',onTitle,'title'));
  main.append(head, body);
  return main;
}

export type EndingRecord = { firstTime: boolean; newBest: boolean };
export function endingScreen(state: GameState, record: EndingRecord, onRetry: () => void, onGallery: () => void, onTitle: () => void) {
  const ending = endingInfo(state.ending!);
  const main = el('main','ending-screen frame');
  const story = el('section','ending-story');
  const badges = el('div','records');
  if (record.firstTime) badges.append(pill('book','새 엔딩'));
  if (record.newBest) badges.append(pill('star',`최고 기록 ${num(state.score)}점`));
  const portraits = el('div', 'ending-portraits');
  portraits.append(portrait(endingPortrait(ending.id)), chibi(careerRank(state)));
  story.append(portraits);
  if (badges.childElementCount) story.append(badges);
  story.append(el('h1','',ending.title), el('p','',ending.text));
  const report = el('section','ending-report');
  const rank = finalRank(state);
  const summary = el('div', 'final-rank');
  summary.dataset.finalRank = '';
  summary.dataset.grade = rank.grade;
  summary.dataset.score = String(rank.total);
  const badge = el('b', 'final-badge', rank.grade);
  badge.dataset.grade = rank.grade;
  const heading = el('div', 'final-heading');
  heading.append(badge, el('h2', '', rank.gradeTitle));
  const score = el('div','score');
  const number = el('b');
  countNumber(number,0,rank.total,num);
  score.append(icon('star'),el('span','','최종 점수'),number,el('span','','점'));
  const { forks, contests, rankups, points } = rank.achievements;
  const breakdown = el('dl', 'score-breakdown');
  function line(label: string, value: string) {
    breakdown.append(el('dt', '', label), el('dd', '', value));
  }
  line('순자산', num(rank.netWorth) + '만원');
  line('엔딩 보너스', num(rank.endingBonus) + '점');
  line('업적', `갈림길 ${forks} · 대회 우승 ${contests} · 승급 ${rankups} = ${num(points)}점`);
  if (rank.early > 0) line('조기 달성 보너스', num(rank.early) + '점');
  if (rank.bonus < rank.endingBonus + points) line('보너스 상한', num(rank.bonus) + '점 적용');
  summary.append(heading, score, breakdown);
  const facts = el('dl','fact-grid');
  const d = derived(state);
  for (const [label,value] of [['나이', d.age + '세'],['순자산', num(d.netWorth) + '만원'],['비행', num(state.s.flights) + '회'],['성공',num(state.s.wins) + '회'],['실패',num(state.s.losses) + '회'],['추락',num(state.s.crashes) + '회']]) {
    const pair = el('div');
    pair.append(el('dt','',label),el('dd','',value));
    facts.append(pair);
  }
  const controls = el('div','ending-controls');
  controls.append(button('다시 하기','primary',onRetry,'retry'),button('엔딩 도감','secondary',onGallery,'gallery'),button('타이틀','secondary',onTitle,'title'));
  const details = el('div', 'run-facts');
  details.append(rankLine(state), facts, standingGrades(state, GRADED_STATS));
  const tabs = el('div', 'tabs ending-tabs');
  function select(showFacts: boolean) {
    summary.hidden = showFacts;
    details.hidden = !showFacts;
    rankTab.setAttribute('aria-pressed', String(!showFacts));
    factsTab.setAttribute('aria-pressed', String(showFacts));
  }
  const rankTab = button('최종 성적', '', () => select(false));
  const factsTab = button('비행 기록', '', () => select(true));
  rankTab.dataset.tab = 'final-rank';
  factsTab.dataset.tab = 'run-facts';
  tabs.append(rankTab, factsTab);
  select(false);
  report.append(tabs, summary, details, controls);
  const title = el('header', 'window-title');
  title.append(icon('flag'), '인생 결산');
  const body = el('div', 'ending-body');
  body.append(story, report);
  main.append(title, body);
  return main;
}
