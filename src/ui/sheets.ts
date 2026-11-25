import { careerRank, nextRanks } from '../game/career.ts';
import type { NextRank, RankChange } from '../game/career.ts';
import { chibi, requirements, standingGrades, stars } from './pieces.ts';
import { previewWheel, resultWheel } from './wheel.ts';
import { PLACES } from '../game/data.ts';
import type { EventDef, GameState, OptionView, Result } from '../game/types.ts';
import { commitButton, outcomes, pager } from './cards.ts';
import { button, el } from './dom.ts';
import { icon } from './icons.ts';
import { price, resultChips, resultMarkers, settlementText, signed } from '../game/outcome-text.ts';
import { derived, forecast, num, options } from '../game/engine.ts';
import { eventPortrait } from './art.ts';
import { portrait } from './images.ts';

type Sheet = { dialog: HTMLDialogElement; body: HTMLElement; close: () => void; open: () => void; disableBackground: () => void };
let activeSheet: Sheet | null = null;
let sheetId = 0;

export function closeSheet() {
  activeSheet?.close();
}

export function refreshModalBackground() {
  activeSheet?.disableBackground();
}

export function createSheet(root: HTMLElement, title: string, dismissible = true): Sheet {
  closeSheet();
  const previous = document.activeElement;
  // Modal background controls are also disabled for non-pointer input and pagers.
  const behind = new Set<HTMLButtonElement>();
  function disableBackground() {
    for (const target of root.querySelectorAll<HTMLButtonElement>('button:enabled')) {
      if (target.closest('dialog')) continue;
      behind.add(target);
      target.disabled = true;
    }
  }
  disableBackground();
  const dialog = el('dialog', 'sheet');
  const header = el('div', 'sheet-header');
  const heading = el('h2', '', title);
  heading.id = `sheet-heading-${++sheetId}`;
  dialog.setAttribute('aria-labelledby', heading.id);
  header.append(heading);
  const body = el('div', 'sheet-body');
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    dialog.close();
    dialog.remove();
    for (const target of behind) target.disabled = false;
    document.body.classList.remove('sheet-open');
    if (activeSheet?.dialog === dialog) activeSheet = null;
    if (previous instanceof HTMLElement && previous.isConnected) previous.focus({ preventScroll: true });
  };
  if (dismissible) {
    const dismiss = button('', 'icon-button', close, 'close');
    dismiss.setAttribute('aria-label', '닫기');
    dismiss.append(icon('close'));
    header.append(dismiss);
  }
  dialog.addEventListener('cancel', (event) => {
    event.preventDefault();
    if (dismissible) close();
  });
  dialog.addEventListener('click', (event) => {
    if (!dismissible || event.target !== dialog) return;
    const bounds = dialog.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) close();
  });
  dialog.append(header, body);
  root.append(dialog);
  const sheet = { dialog, body, close, disableBackground, open: () => {
    document.body.classList.add('sheet-open');
    dialog.showModal();
    // Announce the popup before its actions receive keyboard focus.
    heading.tabIndex = -1;
    heading.focus({ preventScroll: true });
  } };
  activeSheet = sheet;
  return sheet;
}

export function showResult(root: HTMLElement, result: Result, previous: GameState, onContinue: () => void, boardOption: boolean) {
  const title = boardOption ? (result.upkeep ? '월급날 정산' : '계절 마감') : '이번 선택의 결과';
  const sheet = createSheet(root, title, false);
  if (boardOption && result.upkeep) sheet.dialog.dataset.pay = '';
  sheet.dialog.classList.add('result-sheet');
  if ((result.season || result.upkeep) && result.roll) sheet.dialog.classList.add('settlement-roll');
  if (!boardOption) {
    const place = el('p', 'eyebrow', `${PLACES[result.place].name} · ${result.free ? '계절 소모 없음' : '나의 이야기'}`);
    sheet.body.append(place, el('h3', 'result-title', result.title));
  }
  const live = el('div', 'result-live');
  live.setAttribute('aria-live', 'polite');
  live.setAttribute('aria-atomic', 'true');
  const reveal = el('div', 'result-details');
  const continueButton = button('계속', 'primary full-width', () => { sheet.close(); onContinue(); }, 'continue');
  continueButton.append(icon('arrow'));
  const skipInput = new AbortController();
  const showDetails = () => {
    skipInput.abort();
    if (!sheet.dialog.isConnected) return;
    if (!boardOption) {
      live.replaceChildren(el('p', `result-status ${result.roll?.success === false ? 'negative' : 'positive'}`, result.roll ? result.roll.success ? '성공!' : '실패' : '확정'), el('p', 'result-text', result.text));
    } else if (result.move) {
      live.textContent = `주사위 ${result.move.roll} · ${result.move.path.length}칸 이동`;
    }
    const chips = el('div', 'delta-chips');
    for (const chip of resultChips(result, previous)) {
      chips.append(el('span', `delta-chip ${chip.positive ? 'positive' : 'negative'}`, chip.text));
    }
    for (const text of resultMarkers(result)) chips.append(el('span', 'delta-chip', text));
    if (chips.childElementCount) reveal.append(chips);
    if (result.crashed) reveal.append(el('p', 'crash-banner', '기체 추락! 정비와 장비 상태를 확인하세요.'));
    const notes = result.notes.map(note => el('p', 'result-note', note));
    if (!boardOption) reveal.append(...notes);
    const settlement = settlementText(result);
    if (settlement) {
      const change = el('div', 'ledger');
      if (result.season) change.dataset.seasonChange = '';
      if (result.season || settlement.recovery) {
        change.append(el('b', '', settlement.date), el('p', '', settlement.recovery));
        reveal.append(change);
      }
      if (result.season?.accrual.length) {
        const accrual = el('small', 'accrual', '장부에 기록 · ' + result.season.accrual.map(
          line => line.label + ' ' + signed(line.amount) + '만원').join(' · '));
        change.append(accrual);
      }
      if (result.upkeep) {
        const ledger = el('div', 'ledger');
        ledger.append(el('b', '', '정산 합계 ' + signed(result.upkeep.total) + '만원'));
        for (const line of settlement.ledger) ledger.append(el('p', '', line));
        reveal.append(ledger);
      }
      if (settlement.other.length) reveal.append(el('p', 'settle-other', settlement.other.join(' · ')));
    }
    if (boardOption) reveal.append(...notes);
    else if (result.eventId) reveal.append(el('p', 'event-notice', '새로운 소식이 도착했어요. 계속해서 확인해 보세요.'));
    sheet.dialog.dataset.spin = 'done';
    continueButton.disabled = false;
    continueButton.focus({ preventScroll: true });
  };
  const wheel = result.roll && resultWheel(result.roll);
  if (wheel) {
    sheet.dialog.dataset.spin = 'spinning';
    continueButton.disabled = true;
    sheet.body.append(wheel.machine);
  }
  if (!boardOption || result.move) sheet.body.append(live);
  sheet.body.append(reveal, continueButton);
  sheet.open();
  if (!wheel) { showDetails(); return; }
  const animation = wheel.spin(showDetails);
  if (animation) {
    const skip = (event: Event) => {
      event.preventDefault();
      event.stopPropagation();
      animation.finish();
    };
    const listener = { capture: true, signal: skipInput.signal };
    sheet.dialog.addEventListener('click', skip, listener);
    document.addEventListener('keydown', skip, listener);
  }
}

export function confirmNewRun(root: HTMLElement, onConfirm: () => void) {
  const sheet = createSheet(root, '새로운 비행을 시작할까요?');
  sheet.body.append(el('p', 'sheet-intro', '진행 중인 비행은 새 이야기로 바뀝니다. 발견한 엔딩과 최고 기록은 간직할 수 있어요.'));
  sheet.body.append(button('새 게임 시작', 'primary full-width', () => { sheet.close(); onConfirm(); }), button('이어서 고민하기', 'secondary full-width', sheet.close));
  sheet.open();
}

export function showEvent(root: HTMLElement, event: EventDef, state: GameState, choices: OptionView[], choose: (id: string) => void) {
  const sheet = createSheet(root, '사건 카드 · ' + PLACES[event.place].name, false);
  sheet.dialog.classList.add('event-sheet');
  if (state.board.contest) sheet.dialog.querySelector('.sheet-header')!.append(el('b', 'contest-tag', '대회'));
  const profile = el('div', 'event-profile');
  const story = el('div', 'event-story');
  story.append(el('h3', '', event.title), el('p', 'event-text', event.text));
  profile.append(portrait(eventPortrait(event.id)), story);
  const standing = el('div', 'event-standing');
  standing.append(el('b', '', `자금 ${num(state.s.money)}만원 · 빚 ${num(state.s.debt)} / ${num(derived(state).creditLimit)} · 체력 ${state.s.stamina}`), standingGrades(state));
  sheet.body.append(profile, standing);
  const answers = el('div','event-choices');
  for (const o of choices) {
    const answer = commitButton(o, '', choose);
    answer.className = 'answer';
    answer.removeAttribute('aria-label');
    answer.replaceChildren(el('strong','',o.title), el('small','',price(o)));
    if (o.roll) answer.append(previewWheel(o.roll.chance));
    answer.append(outcomes(o, forecast(state, o.id)));
    answers.append(answer);
  }
  sheet.body.append(answers);
  sheet.open();
}

function rankPages(sheet: Sheet, ranks: NextRank[], draw: (r: NextRank) => HTMLElement) {
  const content = el('section', 'rank-pages');
  sheet.body.append(content);
  const render = (page: number) => {
    content.replaceChildren(draw(ranks[page]));
    if (ranks.length > 1) content.append(pager(page, ranks.length, render));
  };
  render(0);
}

const chanceLine = (r: NextRank) => r.chance === undefined ? '확정' : '성공 ' + r.chance + '%';

export function showLadder(root: HTMLElement, state: GameState, go: (id: string) => void) {
  const sheet = createSheet(root, '커리어 사다리');
  const ranks = nextRanks(state);
  const current = careerRank(state);
  const available = options(state);
  sheet.body.append(el('p', 'eyebrow', `현재 · ${current.title} · Lv ${current.level}`));
  if (ranks.length) rankPages(sheet, ranks, target => {
    const detail = el('div', 'ladder-detail');
    const head = el('div', 'rank-line');
    head.append(el('h3', '', target.rank.title), el('span', 'level', 'Lv ' + target.rank.level), stars(target.rank));
    const offered = available.find(o => o.id === target.optionId);
    const goButton = button('이 도전 보기', 'primary', () => { sheet.close(); go(target.optionId); }, 'ladder-go');
    detail.append(head, requirements(target.requirements, true),
      el('b', '', `${target.action} · ${chanceLine(target)}`),
      el('span', '', '비용 ' + price(offered ?? target)));
    const locks = offered?.locks ?? target.locks;
    if (locks.length) detail.append(el('p', 'lock-reasons', locks.join(' · ')));
    if (offered) detail.append(goButton);
    else detail.append(el('small', 'muted', '이 도전이 열리는 칸에서 선택할 수 있어요.'));
    return detail;
  });
  else sheet.body.append(el('h3', '', '50세에 은퇴'));
  sheet.open();
}

export function showRankCard(root: HTMLElement, change: RankChange, onContinue: () => void) {
  const up = change.kind === 'up';
  const sheet = createSheet(root, up ? '랭크 업!' : '새 출발', false);
  sheet.dialog.classList.add('rank-card');
  sheet.dialog.dataset.rankCard = '';
  sheet.dialog.dataset.kind = change.kind;
  if (up) {
    const rays = el('div', 'rank-rays');
    rays.dataset.clipOk = '';
    sheet.dialog.prepend(rays);
  }
  const hero = el('div', 'rank-hero');
  const copy = el('div', 'rank-copy');
  const { to } = change;
  const title = el('h3', '', to.title);
  title.dataset.rankTitle = to.title;
  const level = el('b', 'rank-level');
  level.append(el('small', '', 'Lv'), String(to.level));
  level.dataset.rankLevel = String(to.level);
  if (to.field !== to.title) copy.append(el('small', '', to.field));
  copy.append(title, stars(to));
  hero.append(chibi(to), level, copy);
  sheet.body.append(hero);
  const perks = el('dl', 'rank-perks');
  for (const perk of change.perks) {
    if (!perk.value && !perk.gain) continue;
    const row = el('div');
    const amount = el('dd', '', num(perk.value) + perk.unit);
    if (perk.gain) amount.append(el('small', perk.gain < 0 ? 'negative' : 'positive', signed(perk.gain) + perk.unit));
    row.append(el('dt', '', perk.label), amount);
    perks.append(row);
  }
  sheet.body.append(perks);
  if (change.next.length) rankPages(sheet, change.next, r => {
    const target = el('div', 'rank-next');
    target.append(el('strong', '', '다음 랭크 ▶ ' + r.rank.title), requirements(r.requirements), el('b', '', r.action + ' · ' + chanceLine(r)));
    if (r.locks.length) target.append(el('small', 'lock-reasons', r.locks[0]));
    return target;
  });
  else sheet.body.append(el('p', '', '50세 은퇴까지 이 자리를 지킨다'));
  sheet.body.append(button('계속', 'primary', () => { sheet.close(); onContinue(); }, 'continue'));
  sheet.open();
}
