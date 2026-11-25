import './styles.css';
import { rankChange } from './game/career.ts';
import type { RankChange } from './game/career.ts';
import { flightBoard } from './ui/board.ts';
import { ENDINGS } from './game/data.ts';
import { boardView, choose, currentEvent, newGame, num, options } from './game/engine.ts';
import type { GameState, OptionView } from './game/types.ts';
import { clearRun, loadMeta, loadRun, recordEnding, saveRun } from './save.ts';
import { PLATFORM, bootPlatform, fetchLeaderboard, nickname, openNicknamePage, runStatus, sessionOk } from './platform.ts';
import { createPanel, pager, type Nav } from './ui/cards.ts';
import { button, el, focusHeading, paginateRows } from './ui/dom.ts';
import { hud } from './ui/hud.ts';
import { endingScreen, galleryScreen, titleScreen } from './ui/screens.ts';
import type { EndingRecord } from './ui/screens.ts';
import { closeSheet, confirmNewRun, createSheet, refreshModalBackground, settleNotice, showEvent, showLadder, showRankCard, showResult } from './ui/sheets.ts';

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
let lastFace = state.board.roll;
let rankStop = false;
let activeBoard: ReturnType<typeof flightBoard> | undefined;
let gradeNumbers = false;
let startedAt = performance.now();
let endingRecord: EndingRecord | null = null;
let choosing = false;
let activePanel: ReturnType<typeof createPanel> | undefined;
let onRankingResize: (() => void) | undefined;

function fitView() {
  if (activePanel?.panel.isConnected) {
    activePanel.fit();
    refreshModalBackground();
  }
  if (PLATFORM) onRankingResize?.();
}
window.addEventListener('resize', fitView);
document.fonts.addEventListener('loadingdone', fitView);

if (params.get('debug') === '1') {
  window.__game = { state: () => structuredClone(state), options: () => options(state) };
}

function setScreen(screen: 'title' | 'play' | 'ending' | 'gallery', content: HTMLElement) {
  closeSheet();
  root.dataset.screen = screen;
  delete root.dataset.phase;
  root.replaceChildren(content);
  activePanel = undefined;
  activeBoard = undefined;
  focusHeading(content);
}

function showTitle() {
  choosing = false;
  const actions = { onNew: requestNew, onContinue: continueRun, onGallery: openGallery, nickname: '', onRanking: undefined as (() => void) | undefined };
  if (PLATFORM) {
    actions.nickname = nickname();
    actions.onRanking = showRanking;
  }
  setScreen('title', titleScreen(loadMeta(), loadRun(), actions));
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
  choosing = false;
  lastFace = state.board.roll;
  rankStop = false;
  renderPlay('home');
}

function renderPlay(nav: Nav, previous?: GameState, change?: RankChange | null) {
  const choices = options(state);
  const event = currentEvent(state);
  const view = boardView(state);
  const spin = choices.some(o => o.id === 'spin' && o.enabled) ? () => takeOption('spin') : undefined;
  const board = flightBoard(state, view, lastFace, spin);
  const panel = createPanel(state, choices, takeOption, nav, showTitle, view, board.highlight, rankStop);
  const ui = hud(state, choices, gradeNumbers, numbers => {
    gradeNumbers = numbers;
    panel.fit();
  }, () => showLadder(root, state, panel.goal), previous);
  const shell = el('main', 'flight-deck');
  shell.append(ui.status, board.board, ui.ladder, panel.panel, panel.nav);
  setScreen('play', shell);
  activePanel = panel;
  activeBoard = board;
  root.dataset.phase = change ? 'rankup' : state.phase;
  panel.fit();
  if (spin && nav === 'home' && !change) board.board.focus({ preventScroll: true });
  const resume = () => {
    choosing = false;
    root.dataset.phase = state.phase;
    if (event) showEvent(root, event, state, choices, takeOption);
  };
  if (change) showRankCard(root, change, resume);
  else resume();
}

// A held Enter must not run through a confirmation: the first press opens it and moves focus to its commit button.
const typing = (event: KeyboardEvent) =>
  event.target instanceof HTMLElement && (event.target.isContentEditable || event.target.matches('input, textarea, select'));
document.addEventListener('keydown', event => {
  if (event.repeat && (event.key === 'Enter' || event.key === ' ') && !typing(event)) event.preventDefault();
}, true);

document.addEventListener('keydown', event => {
  if (typing(event) || event.defaultPrevented || event.isComposing || event.ctrlKey || event.metaKey || event.altKey
    || root.dataset.phase !== 'action' || root.querySelector('dialog[open]')) return;
  const spinKey = event.key.toLowerCase() === 's' || (event.key === ' ' &&
    (document.activeElement === document.body || document.activeElement === activeBoard?.board));
  if (spinKey && state.board.step === 'spin') {
    event.preventDefault();
    if (!event.repeat) void takeOption('spin');
    return;
  }
  if (activePanel?.currentNav() !== 'home') return;
  const panel = activePanel.panel;
  let target: HTMLButtonElement | null | undefined;
  if (/^[1-9]$/.test(event.key)) {
    target = panel.querySelectorAll<HTMLButtonElement>('.option-card, .route-card')[Number(event.key) - 1];
  } else if (state.board.step === 'bonus' && ['r', 'e'].includes(event.key.toLowerCase())) {
    event.preventDefault();
    if (!event.repeat) void takeOption('end');
    return;
  }
  if (target) {
    event.preventDefault();
    if (!event.repeat) target.click();
  }
});

async function takeOption(id: string) {
  if (choosing || state.phase === 'ended') return;
  if (PLATFORM) { if (!sessionOk()) return; }
  const option = options(state).find(o => o.id === id);
  if (!option?.enabled) return;
  choosing = true;
  closeSheet();
  // The next choice retires the previous settlement notice; each notice belongs to one choice.
  root.querySelector('[data-settle]')?.remove();
  const previous = state;
  const nav = activePanel?.currentNav() ?? 'home';
  const next = choose(state, id);
  state = next.state;
  saveRun(state);
  if (state.phase === 'ended' && !endingRecord) {
    // TODO(engine): GameState has no elapsed-time field; resumed runs count the current session's duration.
    endingRecord = recordEnding(state, Math.max(1, Math.round((performance.now() - startedAt) / 1000)));
  }
  const { result } = next;
  if (result.move && activeBoard) {
    lastFace = result.move.roll;
    rankStop = result.move.stop === 'rankup';
    root.dataset.phase = 'move';
    root.querySelector<HTMLElement>('.flight-deck')!.inert = true;
    await activeBoard.move(result.move, id === 'spin');
  } else if (!option.free) rankStop = false;
  const resume = () => {
    const change = rankChange(previous, state);
    if (state.phase === 'ended') {
      if (change) {
        root.dataset.phase = 'rankup';
        showRankCard(root, change, showEnding);
      } else showEnding();
    } else renderPlay(option.free ? nav : 'home', previous, change);
  };
  const boardOption = option.kind === 'board';
  const shown = !boardOption || !!(result.upkeep || result.season || result.notes.length);
  // Settlements and sure outcomes need no answer, so they ride over the next prompt as a notice. A luck roll,
  // a crash, a new stage or flag keeps the sheet, and so does a next screen that is itself a popup (event,
  // rank card) or the ending, which would hide the notice.
  const quiet = boardOption || (!result.roll && !result.crashed && !result.flag && result.stageTo === result.stageFrom);
  const popupNext = state.phase !== 'action' || !!rankChange(previous, state);
  if (shown && (!quiet || popupNext)) {
    root.dataset.phase = 'result';
    showResult(root, result, previous, resume, boardOption);
  } else {
    resume();
    if (shown) activeBoard?.notice(settleNotice(result, previous, boardOption));
    else if (result.restGain !== undefined) activeBoard?.toast(result.restGain);
  }
}

function openGallery() {
  setScreen('gallery', galleryScreen(loadMeta(), showTitle));
}

function showEnding() {
  setScreen('ending', endingScreen(state, endingRecord ?? { firstTime: false, newBest: false }, requestNew, openGallery, showTitle));
  refreshEndingStatus();
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
      if (!rows.length) return;
      let page = 0;
      const render = () => {
        if (!sheet.dialog.isConnected) { onRankingResize = undefined; return; }
        const list = el('ol', 'leaderboard');
        sheet.body.replaceChildren(list);
        const items = rows.map(row => {
          const item = el('li', row.me ? 'is-me' : '');
          const player = el('div');
          player.append(el('strong', '', row.nickname), el('small', '', ENDINGS.find(e => e.id === row.ending)?.title ?? '비행 기록'));
          item.append(el('span', '', row.rank === null ? '—' : num(row.rank) + '위'), player, el('strong', '', row.score === null ? '—' : num(row.score) + '점'));
          return item;
        });
        const band = sheet.dialog.querySelector<HTMLElement>('.sheet-header')!;
        // Leave space for the viewport margins, card padding and pager.
        const pages = paginateRows(list, items, 1, root.clientHeight - band.offsetHeight - 120);
        page = Math.min(page, pages.length - 1);
        list.replaceChildren(...pages[page]);
        sheet.body.append(pager(page, pages.length, i => { page = i; render(); }));
      };
      onRankingResize = render;
      render();
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
