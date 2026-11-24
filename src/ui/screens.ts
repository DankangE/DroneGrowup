import { ENDINGS, PLACES } from '../game/data.ts';
import { derived, endingInfo, num } from '../game/engine.ts';
import type { EndingId, GameState, PlaceId } from '../game/types.ts';
import type { Meta } from '../save.ts';
import { button, el, meter } from './dom.ts';
import { icon } from './icons.ts';
import type { IconName } from './icons.ts';
import { createScene } from './scene.ts';

export function brandHeader(onTitle?: () => void): HTMLElement {
  const header = el('header', 'app-header');
  const brand = onTitle ? button('', 'brand', onTitle, 'title') : el('div', 'brand');
  const mark = el('span', 'brand-mark');
  mark.append(icon('drone'));
  brand.append(mark, el('span', '', '파일럿 키우기'));
  header.append(brand, el('span', 'header-note', '당신의 다음 비행은?'));
  return header;
}

type TitleActions = { onNew: () => void; onContinue: () => void; onGallery: () => void; onRanking?: () => void; nickname?: string };

export function titleScreen(meta: Meta, saved: GameState | null, actions: TitleActions): HTMLElement {
  const screen = el('main', 'title-screen');
  const hero = el('div', 'title-hero');
  const art = el('div', 'title-world');
  const scene = createScene(new Set(Object.keys(PLACES) as PlaceId[]), 'airfield');
  const sticker = el('div', 'world-sticker');
  sticker.append(icon('drone'), el('strong', '', '나의 첫 비행'), el('span', '', '작은 드론, 커다란 가능성'));
  art.append(scene.element, sticker);
  const intro = el('section', 'title-intro');
  const eyebrow = el('p', 'eyebrow', '선택 한 번, 달라지는 내일');
  const title = el('h1', 'game-title');
  title.append(el('span', '', '파일럿'), el('span', 'title-second', '키우기'));
  const pitch = el('p', 'title-pitch', '스무 살 드론학과 학생에서,\n나만의 하늘을 가진 사람으로.');
  intro.append(eyebrow, title, pitch, el('p', 'title-description', '실력을 쌓고, 기회를 잡고, 운에 도전하세요.\n어떤 파일럿이 될지는 당신의 선택에 달렸어요.'));
  if (actions.nickname) intro.append(el('p', 'welcome-note', `${actions.nickname}님, 비행 준비 되셨나요?`));
  const controls = el('div', 'title-actions');
  if (saved) {
    const d = derived(saved);
    const resume = button('', 'primary continue-run', actions.onContinue, 'continue-run');
    const label = el('span');
    label.append(el('strong', '', '이어하기'), el('small', '', `${d.age}세 ${d.quarter}분기 · ${d.stageName}`));
    resume.append(label, icon('arrow'));
    controls.append(resume);
  }
  const start = button('새 게임', saved ? 'secondary full-width' : 'primary full-width', actions.onNew, 'new');
  start.append(icon('arrow'));
  controls.append(start);
  const gallery = button('', 'gallery-button', actions.onGallery, 'gallery');
  gallery.append(icon('book'), el('span', '', '엔딩 도감'), el('strong', '', `${meta.gallery.length} / ${ENDINGS.length}`), icon('arrow'));
  controls.append(gallery);
  if (actions.onRanking) controls.append(button('랭킹', 'secondary full-width', actions.onRanking));
  const record = el('div', 'title-record');
  record.append(icon('star'), el('span', '', '나의 최고 기록'), el('strong', '', `${num(meta.best)}점`));
  intro.append(controls, record);
  hero.append(art, intro);
  const guide = el('section', 'how-to');
  const steps = [
    ['01', '어디로 날아갈까요?', '마을의 장소를 눌러 이번 분기의 활동을 골라요.'],
    ['02', '실력에 행운을 더해요', '성공률과 두 가지 결과를 확인하고 도전해요.'],
    ['03', '나만의 엔딩을 만나요', '자금과 기체를 돌보며 11가지 삶을 발견해요.'],
  ];
  for (const [step, heading, description] of steps) {
    const item = el('div', 'guide-step');
    const copy = el('div');
    copy.append(el('h2', '', heading), el('p', '', description));
    item.append(el('span', 'step-number', step), copy);
    guide.append(item);
  }
  screen.append(hero, guide, el('p', 'title-footnote', '한 번의 선택이 한 분기 · 진행 상황은 자동으로 저장돼요'));
  return screen;
}

const endingHints: Record<EndingId, string> = {
  ceo: '기업 · 더 큰 하늘을 향해', chairman: '협회 · 함께 날아가는 사람들', academy: '교육 · 누군가의 첫 비행',
  solo: '독립 · 내 이름으로 쓴 계약서', debtor: '재정 · 균형을 잃은 비행', smallbiz: '기업 · 작은 회사의 큰 책임',
  director: '협회 · 업계의 목소리', instructor: '교육 · 조종기를 건네는 손', employee: '회사 · 꾸준함의 가치',
  pilot: '비행 · 현장에서 찾은 내 길', student: '시작 · 아직 끝나지 않은 꿈',
};
const endingIcons: Record<EndingId, IconName> = {
  ceo: 'flag', chairman: 'star', academy: 'book', solo: 'drone', debtor: 'coin', smallbiz: 'home',
  director: 'flag', instructor: 'book', employee: 'bag', pilot: 'drone', student: 'bolt',
};

export function galleryScreen(meta: Meta, onBack: () => void, onTitle: () => void): HTMLElement {
  const main = el('main', 'gallery-screen');
  const header = el('div', 'page-heading');
  const copy = el('div');
  copy.append(el('p', 'eyebrow', '당신이 지나온 하늘'), el('h1', '', '엔딩 도감'), el('p', 'muted', '선택이 모여 하나의 삶이 됩니다.'));
  const back = button('돌아가기', 'secondary', onBack);
  header.append(copy, back);
  const progress = el('div', 'gallery-progress');
  progress.append(el('span', '', '발견한 이야기'), el('strong', '', `${meta.gallery.length} / ${ENDINGS.length}`), meter(meta.gallery.length, ENDINGS.length, '발견한 엔딩'));
  const grid = el('div', 'gallery-grid');
  ENDINGS.forEach((ending, index) => {
    const found = meta.gallery.includes(ending.id);
    const card = el('article', `ending-card ${found ? 'found' : 'undiscovered'}${ending.main ? ' main-ending' : ''}`);
    const top = el('div', 'ending-card-top');
    top.append(el('span', 'ending-number', String(index + 1).padStart(2, '0')));
    if (ending.main) top.append(el('span', 'badge', '주요 엔딩'));
    const symbol = el('div', 'ending-symbol');
    symbol.append(icon(found ? endingIcons[ending.id] : 'lock'));
    card.append(top, symbol, el('h2', '', found ? ending.title : '???'), el('p', 'ending-hint', endingHints[ending.id]));
    card.append(el('p', 'ending-card-story', found ? ending.text : '아직 펼쳐지지 않은 이야기. 새로운 선택으로 이 페이지를 채워 보세요.'));
    if (found) {
      const discovered = el('span', 'discovered-label', '발견 완료');
      discovered.prepend(icon('check'));
      card.append(discovered);
    }
    grid.append(card);
  });
  main.append(header, progress, grid, button('타이틀', 'secondary gallery-home', onTitle, 'title'));
  return main;
}

export type EndingRecord = { firstTime: boolean; newBest: boolean };

export function endingScreen(state: GameState, record: EndingRecord, onRetry: () => void, onGallery: () => void, onTitle: () => void): HTMLElement {
  const main = el('main', 'ending-screen');
  if (!state.ending) return main;
  const ending = endingInfo(state.ending);
  const d = derived(state);
  const story = el('section', 'ending-story');
  story.append(el('p', 'eyebrow', '비행 일지 · 마지막 페이지'));
  const medal = el('div', `ending-medal ending-${ending.id}`);
  medal.append(icon(endingIcons[ending.id]));
  const badges = el('div', 'ending-badges');
  if (record.firstTime) badges.append(el('span', 'badge warm-badge', '새로운 엔딩 발견'));
  if (record.newBest) badges.append(el('span', 'badge', '최고 기록 경신'));
  story.append(medal, badges, el('h1', '', ending.title), el('p', 'ending-prose', ending.text));
  const report = el('section', 'ending-report');
  const score = el('div', 'final-score');
  score.append(el('span', '', '이번 비행의 점수'), el('strong', '', num(state.score)), el('span', '', '점'));
  const summary = el('dl', 'run-summary');
  for (const [label, value] of [
    ['마지막 비행', `${d.age}세 ${d.quarter}분기`], ['순자산', `${num(d.netWorth)}만원`],
    ['비행 횟수', `${num(state.s.flights)}회`], ['성공 / 실패', `${num(state.s.wins)} / ${num(state.s.losses)}`],
    ['추락', `${num(state.s.crashes)}회`], ['마지막 평판', num(state.s.rep)],
  ]) {
    const row = el('div');
    row.append(el('dt', '', label), el('dd', '', value));
    summary.append(row);
  }
  const controls = el('div', 'ending-actions');
  const retry = button('다시 하기', 'primary full-width', onRetry, 'retry');
  retry.append(icon('arrow'));
  controls.append(retry, button('엔딩 도감', 'secondary full-width', onGallery, 'gallery'), button('타이틀', 'text-button', onTitle, 'title'));
  report.append(score, summary, controls);
  main.append(story, report);
  return main;
}
