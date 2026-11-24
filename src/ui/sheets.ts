import { careerRank, grade, nextRanks } from '../game/career.ts';
import type { NextRank, RankChange } from '../game/career.ts';
import { chibi, requirements, standingGrades, stars } from './pieces.ts';
import { previewWheel, resultWheel } from './wheel.ts';
import { PLACES, STAT_LABEL } from '../game/data.ts';
import type { EventDef, GameState, OptionView, Result, Stat } from '../game/types.ts';
import { commitButton, outcomes, pager, price } from './cards.ts';
import { button, el } from './dom.ts';
import { icon } from './icons.ts';
import { signed, statValue } from './hud.ts';
import { derived, num } from '../game/engine.ts';
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

export function showResult(root: HTMLElement, result: Result, previous: GameState, state: GameState, onContinue: () => void) {
  const sheet = createSheet(root, '이번 선택의 결과', false);
  sheet.dialog.classList.add('result-sheet');
  if (result.season && result.roll) sheet.dialog.classList.add('settlement-roll');
  const place = el('p', 'eyebrow', `${PLACES[result.place].name} · ${result.free ? '계절 소모 없음' : '나의 이야기'}`);
  sheet.body.append(place, el('h3', 'result-title', result.title));
  const live = el('div', 'result-live');
  live.setAttribute('aria-live', 'polite');
  live.setAttribute('aria-atomic', 'true');
  const reveal = el('div', 'result-details');
  const continueButton = button('계속', 'primary full-width', () => { sheet.close(); onContinue(); }, 'continue');
  continueButton.append(icon('arrow'));
  const showDetails = () => {
    if (!sheet.dialog.isConnected) return;
    live.replaceChildren(el('p', `result-status ${result.roll?.success === false ? 'negative' : 'positive'}`, result.roll ? result.roll.success ? '성공!' : '실패' : '확정'), el('p', 'result-text', result.text));
    const chips = el('div', 'delta-chips');
    for (const [stat, value] of Object.entries(result.deltas) as [Stat, number][]) {
      if (!value || stat === 'acts') continue;
      const beneficial = stat === 'debt' ? value < 0 : value > 0;
      const oldGrade = grade(stat, previous.s[stat]);
      const newGrade = grade(stat, state.s[stat]);
      const change = oldGrade && newGrade && oldGrade.letter !== newGrade.letter ? ` · ${oldGrade.letter} → ${newGrade.letter}` : '';
      chips.append(el('span', `delta-chip ${beneficial ? 'positive' : 'negative'}`, `${STAT_LABEL[stat]} ${value > 0 ? '+' : ''}${statValue(stat, value)}${change}`));
    }
    reveal.append(chips);
    if (result.crashed) reveal.append(el('p', 'crash-banner', '기체 추락! 정비와 장비 상태를 확인하세요.'));
    for (const note of result.notes) reveal.append(el('p', 'result-note', note));
    if (result.season) {
      const { from, to, rest, refill } = result.season;
      const change = el('div', 'ledger');
      change.dataset.seasonChange = '';
      change.append(el('b', '', `${from.replace(' · ', ' ')} → ${to.replace(' · ', ' ')}`));
      const gains = [rest > 0 ? `휴식 +${rest}` : '', `계절 회복 +${refill}`].filter(Boolean);
      change.append(el('p', '', gains.join(' · ')));
      reveal.append(change);
    }
    if (result.upkeep) {
      const ledger = el('div', 'ledger');
      const {lines, total} = result.upkeep;
      ledger.append(el('b', '', '계절 결산'));
      for (const line of lines.length <= 3 ? lines : [{ label: '합계', amount: total }]) {
        ledger.append(el('p', '', line.label + ' ' + signed(line.amount) + '만원'));
      }
      reveal.append(ledger);
    }
    if (result.eventId) reveal.append(el('p', 'event-notice', '새로운 소식이 도착했어요. 계속해서 확인해 보세요.'));
    sheet.dialog.dataset.spin = 'done';
    continueButton.disabled = false;
  };
  const wheel = result.roll && resultWheel(result.roll);
  if (wheel) {
    sheet.dialog.dataset.spin = 'spinning';
    continueButton.disabled = true;
    sheet.body.append(wheel.machine);
  }
  sheet.body.append(live, reveal, continueButton);
  sheet.open();
  if (wheel) wheel.spin(showDetails);
  else showDetails();
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
    answer.append(outcomes(o));
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
  sheet.body.append(el('p', 'eyebrow', `현재 · ${current.title} · Lv ${current.level}`));
  if (ranks.length) rankPages(sheet, ranks, target => {
    const detail = el('div', 'ladder-detail');
    const head = el('div', 'rank-line');
    head.append(el('h3', '', target.rank.title), el('span', 'level', 'Lv ' + target.rank.level), stars(target.rank));
    const goButton = button('이 도전 보기', 'primary', () => { sheet.close(); go(target.optionId); }, 'ladder-go');
    detail.append(head, requirements(target.requirements, true),
      el('b', '', `${target.action} · ${chanceLine(target)}`),
      el('span', '', `비용 ${num(target.cost)}만원 · 체력 -${target.tire}`));
    if (target.locks.length) detail.append(el('p', 'lock-reasons', target.locks.join(' · ')));
    detail.append(goButton);
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
  const level = el('b', 'rank-level', 'Lv ' + to.level);
  level.dataset.rankLevel = String(to.level);
  copy.append(el('small', '', to.field), title, level, stars(to));
  hero.append(chibi(to), copy);
  sheet.body.append(hero);
  const perks = el('dl', 'rank-perks');
  for (const perk of change.perks) {
    if (!perk.value && !perk.gain) continue;
    const row = el('div');
    const amount = el('dd', '', num(perk.value) + perk.unit);
    amount.append(el('small', perk.gain < 0 ? 'negative' : 'positive', (perk.gain ? signed(perk.gain) : '±0') + perk.unit));
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
