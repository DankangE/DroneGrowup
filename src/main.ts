import './styles.css';
import { ENDINGS, PLACES } from './game/data.ts';
import { choose, currentEvent, newGame, num, options } from './game/engine.ts';
import type { GameState, OptionView, PlaceId } from './game/types.ts';
import { clearRun, loadMeta, loadRun, recordEnding, saveRun } from './save.ts';
import { PLATFORM, bootPlatform, fetchLeaderboard, nickname, openNicknamePage, runStatus, sessionOk } from './platform.ts';
import { placeOptions } from './ui/cards.ts';
import { button, el, focusHeading } from './ui/dom.ts';
import { createHud, statDetails } from './ui/hud.ts';
import { icon } from './ui/icons.ts';
import { createScene } from './ui/scene.ts';
import type { Scene } from './ui/scene.ts';
import { brandHeader, endingScreen, galleryScreen, titleScreen } from './ui/screens.ts';
import type { EndingRecord } from './ui/screens.ts';
import { closeSheet, confirmNewRun, createSheet, serviceSummary, showResult, showServices } from './ui/sheets.ts';

declare global {
  interface Window {
    __game?: { state: () => GameState; options: () => OptionView[] };
  }
}

const root = document.querySelector<HTMLDivElement>('#app')!;
const params = new URLSearchParams(location.search);
function seed(): number {
  const value = params.get('seed');
  if (value !== null && /^\d+$/.test(value) && Number.isSafeInteger(Number(value))) return Number(value);
  return crypto.getRandomValues(new Uint32Array(1))[0];
}

let state = loadRun() ?? newGame(seed());
let selectedPlace: PlaceId | null = null;
let dronePlace: PlaceId = 'school';
let scene: Scene | null = null;
let choicesPanel: HTMLElement | null = null;
let startedAt = performance.now();
let endingRecord: EndingRecord | null = null;
let choosing = false;
let galleryReturn: () => void = showTitle;

if (params.get('debug') === '1') {
  window.__game = { state: () => structuredClone(state), options: () => options(state) };
}

function setScreen(screen: 'title' | 'play' | 'ending' | 'gallery', content: HTMLElement) {
  closeSheet();
  root.dataset.screen = screen;
  delete root.dataset.phase;
  root.replaceChildren(content);
  scene = null;
  choicesPanel = null;
}

function goTop() {
  window.scrollTo({ top: 0, behavior: 'instant' });
  focusHeading(root);
}

function showTitle() {
  choosing = false;
  const shell = el('div', 'app-shell');
  const actions = { onNew: requestNew, onContinue: continueRun, onGallery: () => openGallery(showTitle), nickname: '', onRanking: undefined as (() => void) | undefined };
  if (PLATFORM) {
    actions.nickname = nickname();
    actions.onRanking = showRanking;
  }
  shell.append(brandHeader(), titleScreen(loadMeta(), loadRun(), actions));
  setScreen('title', shell);
  goTop();
}

function requestNew() {
  if (PLATFORM) { if (!sessionOk()) return; }
  if (loadRun()) confirmNewRun(root, startNew);
  else startNew();
}

function startNew() {
  if (PLATFORM) { if (!sessionOk()) return; }
  clearRun();
  state = newGame(seed());
  saveRun(state);
  startRun();
}

function continueRun() {
  if (PLATFORM) { if (!sessionOk()) return; }
  const saved = loadRun();
  if (!saved) { showTitle(); return; }
  state = saved;
  startRun();
}

function startRun() {
  startedAt = performance.now();
  endingRecord = null;
  selectedPlace = null;
  choosing = false;
  dronePlace = currentEvent(state)?.place ?? 'school';
  renderPlay();
  goTop();
}

function selectPlace(place: PlaceId | null) {
  if (choosing || state.phase !== 'action') return;
  const restoreTabFocus = choicesPanel?.contains(document.activeElement);
  selectedPlace = place;
  if (place) {
    dronePlace = place;
    scene?.move(place);
  }
  scene?.select(place);
  renderChoices();
  if (restoreTabFocus) choicesPanel?.querySelector<HTMLButtonElement>(`[data-place-filter="${place ?? 'all'}"]`)?.focus({ preventScroll: true });
}

function renderChoices() {
  if (!choicesPanel) return;
  const choices = options(state);
  const event = currentEvent(state);
  choicesPanel.replaceChildren();
  if (state.phase === 'event' && event) {
    const notice = el('div', 'event-card');
    notice.append(el('p', 'eyebrow', `새로운 소식 · ${PLACES[event.place].name}`), el('h2', '', event.title), el('p', '', event.text), el('span', 'badge warm-badge', '이 이야기에 답한 뒤 계속할 수 있어요'));
    choicesPanel.append(notice, placeOptions(choices, null, takeOption));
    return;
  }
  const header = el('div', 'choices-heading');
  const copy = el('div');
  copy.append(el('p', 'eyebrow', '이번 분기, 나의 선택'), el('h1', '', selectedPlace ? PLACES[selectedPlace].name : '어디로 날아볼까요?'));
  header.append(copy, el('span', 'choice-total', `${choices.filter((choice) => choice.enabled && (!selectedPlace || choice.place === selectedPlace)).length}개 가능`));
  const tabs = el('div', 'place-tabs');
  tabs.setAttribute('aria-label', '장소별 선택지');
  const all = button('전체', selectedPlace === null ? 'active' : '', () => selectPlace(null));
  all.setAttribute('aria-pressed', String(selectedPlace === null));
  all.dataset.action = 'all';
  all.dataset.placeFilter = 'all';
  tabs.append(all);
  for (const place of [...new Set(choices.map((choice) => choice.place))]) {
    const tab = button(PLACES[place].name, selectedPlace === place ? 'active' : '', () => selectPlace(place));
    tab.dataset.placeFilter = place;
    tab.setAttribute('aria-pressed', String(selectedPlace === place));
    tabs.append(tab);
  }
  choicesPanel.append(header, tabs);
  if (selectedPlace) choicesPanel.append(el('p', 'place-description', PLACES[selectedPlace].desc));
  choicesPanel.append(placeOptions(choices, selectedPlace, takeOption));
}

function showDetails() {
  const sheet = createSheet(root, '나의 파일럿 수첩');
  sheet.body.append(statDetails(state));
  sheet.open();
}

function renderPlay() {
  if (state.phase === 'ended') { showEnding(); return; }
  const choices = options(state);
  const places = new Set(choices.map((choice) => choice.place));
  if (selectedPlace && !places.has(selectedPlace)) selectedPlace = null;
  const event = currentEvent(state);
  if (state.phase === 'event' && event) dronePlace = event.place;
  const shell = el('div', 'app-shell play-shell');
  const header = brandHeader(showTitle);
  const layout = el('main', 'play-layout');
  const mapArea = el('div', 'map-area');
  const sceneView = createScene(places, dronePlace, state.phase === 'event' ? () => {
    choicesPanel?.scrollIntoView({ behavior: 'instant', block: 'start' });
    if (choicesPanel) focusHeading(choicesPanel);
  } : selectPlace);
  sceneView.select(state.phase === 'event' ? event?.place ?? null : selectedPlace);
  const mapNote = el('div', 'map-note');
  mapNote.append(icon('drone'), el('div'));
  mapNote.lastElementChild!.append(el('strong', '', state.phase === 'event' ? '잠깐, 새로운 소식이 있어요' : '작은 선택도 비행의 일부니까'), el('p', '', state.phase === 'event' ? '도착한 이야기에 답하고 다음 비행을 준비하세요.' : '차근차근 경험을 쌓아 나만의 길을 찾아보세요.'));
  mapArea.append(sceneView.element, mapNote);
  const hud = createHud(state, showDetails);
  const panel = el('section', 'choices-panel');
  panel.id = 'choices';
  const nav = el('nav', 'bottom-nav');
  nav.setAttribute('aria-label', '게임 메뉴');
  const mapButton = button('마을 지도', 'active', () => {
    mapArea.scrollIntoView({ behavior: 'instant', block: 'start' });
    const target = mapArea.querySelector<HTMLButtonElement>('button:not(:disabled)');
    target?.focus({ preventScroll: true });
  });
  mapButton.prepend(icon('map'));
  const services = button('상점 · 정비 · 은행', '', () => showServices(root, state, options(state), takeOption));
  services.prepend(icon('bag'));
  services.disabled = state.phase === 'event';
  services.setAttribute('aria-label', state.phase === 'event' ? '이벤트에 답한 뒤 상점 · 정비 · 은행 이용 가능' : '상점 · 정비 · 은행');
  services.dataset.action = 'services';
  const journal = button('엔딩 도감', '', () => openGallery(renderPlay), 'gallery');
  journal.prepend(icon('book'));
  nav.append(mapButton, services, journal);
  const upkeep = el('p', 'quarter-forecast', serviceSummary(state));
  layout.append(mapArea, hud, panel);
  shell.append(header, layout, upkeep, nav);
  setScreen('play', shell);
  root.dataset.phase = state.phase;
  scene = sceneView;
  choicesPanel = panel;
  renderChoices();
}

function takeOption(id: string) {
  if (choosing || state.phase === 'ended') return;
  if (PLATFORM) { if (!sessionOk()) return; }
  const option = options(state).find((item) => item.id === id);
  if (!option?.enabled) return;
  choosing = true;
  dronePlace = option.place;
  scene?.move(option.place);
  const next = choose(state, id);
  state = next.state;
  saveRun(state);
  if (state.phase === 'ended' && !endingRecord) {
    // TODO(engine): GameState has no elapsed-time field; resumed runs count the current session's duration.
    endingRecord = recordEnding(state, Math.max(1, Math.round((performance.now() - startedAt) / 1000)));
  }
  root.dataset.phase = 'result';
  showResult(root, next.result, () => {
    choosing = false;
    if (state.phase === 'ended') { showEnding(); return; }
    renderPlay();
    // Keep the next decision in view, including a mandatory event after an ordinary action.
    choicesPanel?.scrollIntoView({ behavior: 'instant', block: 'start' });
    if (choicesPanel) focusHeading(choicesPanel);
  });
}

function openGallery(onBack: () => void) {
  galleryReturn = onBack;
  const shell = el('div', 'app-shell');
  shell.append(brandHeader(showTitle), galleryScreen(loadMeta(), () => { galleryReturn(); goTop(); }, showTitle));
  setScreen('gallery', shell);
  goTop();
}

function showEnding() {
  const shell = el('div', 'app-shell');
  shell.append(brandHeader(showTitle), endingScreen(state, endingRecord ?? { firstTime: false, newBest: false }, requestNew, () => openGallery(showEnding), showTitle));
  setScreen('ending', shell);
  refreshEndingStatus();
  goTop();
}

function refreshEndingStatus() {
  if (PLATFORM) {
    if (root.dataset.screen !== 'ending') return;
    const report = root.querySelector('.ending-report');
    if (!report) return;
    report.querySelector('.platform-status')?.remove();
    const status = el('div', 'platform-status');
    status.setAttribute('aria-live', 'polite');
    status.append(el('p', '', runStatus.text));
    if (runStatus.nicknameButton) status.append(button('닉네임 설정', 'secondary', () => {
      if (PLATFORM) openNicknamePage();
    }));
    report.append(status);
  }
}

function showRanking() {
  if (PLATFORM) {
    const sheet = createSheet(root, '파일럿 랭킹');
    sheet.body.append(el('p', 'muted', '기록을 불러오고 있어요…'));
    sheet.open();
    void fetchLeaderboard().then((rows) => {
      if (!sheet.dialog.isConnected) return;
      sheet.body.replaceChildren();
      if (!rows.length) sheet.body.append(el('p', 'empty-state', '아직 등록된 비행 기록이 없어요. 첫 기록을 남겨 보세요.'));
      const list = el('ol', 'leaderboard');
      for (const row of rows) {
        const item = el('li', row.me ? 'is-me' : '');
        const player = el('div');
        player.append(el('strong', '', row.nickname), el('span', '', ENDINGS.find((ending) => ending.id === row.ending)?.title ?? '비행 기록'));
        item.append(el('span', 'board-rank', row.rank === null ? '—' : `${num(row.rank)}위`), player, el('strong', '', row.score === null ? '—' : `${num(row.score)}점`));
        list.append(item);
      }
      sheet.body.append(list);
    }).catch(() => {
      if (!sheet.dialog.isConnected) return;
      sheet.body.replaceChildren(el('p', 'empty-state', '랭킹을 불러오지 못했어요. 잠시 뒤 다시 시도해 주세요.'), button('다시 시도', 'secondary full-width', showRanking));
    });
  }
}

if (PLATFORM) {
  runStatus.onChange = refreshEndingStatus;
  bootPlatform(root, showTitle);
} else showTitle();
