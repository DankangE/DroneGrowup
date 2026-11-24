import { PLACES, RULES, STAGES, STAT_LABEL, STAT_MAX } from '../game/data.ts';
import type { EventDef, GameState, OptionView, Result, Stat } from '../game/types.ts';
import { commitButton, outcomes, price } from './cards.ts';
import { button, el, meter, reducedMotion } from './dom.ts';
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
    const dismiss = button('', 'icon-button', close);
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

export function showResult(root: HTMLElement, result: Result, onContinue: () => void) {
  const sheet = createSheet(root, '이번 선택의 결과', false);
  sheet.dialog.classList.add('result-sheet');
  const place = el('p', 'eyebrow', `${PLACES[result.place].name} · ${result.free ? '분기 소모 없음' : '나의 이야기'}`);
  sheet.body.append(place, el('h3', 'result-title', result.title));
  const live = el('div', 'result-live');
  live.setAttribute('aria-live', 'polite');
  live.setAttribute('aria-atomic', 'true');
  const reveal = el('div', 'result-details');
  const continueButton = button('계속', 'primary full-width', () => { sheet.close(); onContinue(); }, 'continue');
  continueButton.append(icon('arrow'));
  const showDetails = () => {
    if (!sheet.dialog.isConnected) return;
    live.replaceChildren(el('p', `result-status ${result.roll?.success === false ? 'negative' : 'positive'}`, result.roll ? result.roll.success ? '성공! 잘 날았어요.' : '실패, 그래도 경험은 남아요.' : '선택을 마쳤어요.'), el('p', 'result-text', result.text));
    const chips = el('div', 'delta-chips');
    for (const [stat, value] of Object.entries(result.deltas) as [Stat, number][]) {
      if (!value) continue;
      const beneficial = stat === 'debt' ? value < 0 : value > 0;
      chips.append(el('span', `delta-chip ${beneficial ? 'positive' : 'negative'}`, `${STAT_LABEL[stat]} ${value > 0 ? '+' : ''}${statValue(stat, value)}`));
    }
    reveal.append(chips);
    if (result.crashed) reveal.append(el('p', 'crash-banner', '기체 추락! 정비와 장비 상태를 확인하세요.'));
    for (const note of result.notes) reveal.append(el('p', 'result-note', note));
    if (result.stageTo !== result.stageFrom) {
      const stage = el('div', 'stage-banner');
      stage.append(icon('flag'), el('span', '', `${STAGES[result.stageFrom].name} → ${STAGES[result.stageTo].name}`), el('strong', '', '새로운 비행이 시작됩니다!'));
      reveal.append(stage);
    }
    if (result.upkeep) {
      const ledger = el('div', 'ledger');
      const {lines, total} = result.upkeep;
      ledger.append(el('b', '', '이번 분기 결산'));
      for (const line of lines.length <= 3 ? lines : [{ label: '합계', amount: total }]) {
        ledger.append(el('p', '', line.label + ' ' + signed(line.amount) + '만원'));
      }
      reveal.append(ledger);
    }
    if (result.eventId) reveal.append(el('p', 'event-notice', '새로운 소식이 도착했어요. 계속해서 확인해 보세요.'));
    continueButton.disabled = false;
  };
  let rollNumber: HTMLElement | null = null;
  let needle: HTMLElement | null = null;
  if (result.roll) {
    const roll = result.roll;
    const machine = el('div', 'luck-machine');
    const dial = el('div', 'luck-dial');
    dial.style.setProperty('--chance', `${roll.chance}%`);
    const core = el('div', 'dial-core');
    core.append(el('span', '', '행운의 숫자'));
    rollNumber = el('strong', 'roll-number', '00');
    core.append(rollNumber);
    needle = el('div', 'dial-needle');
    needle.append(el('span'));
    dial.append(core, needle);
    machine.append(dial, el('p', 'roll-rule', `0–99 중 ${roll.chance} 미만이면 성공`), el('p', 'roll-odds', `성공 확률 ${roll.chance}%`));
    sheet.body.append(machine);
    continueButton.disabled = true;
    live.append(el('p', 'rolling-label', '두근두근, 바람은 누구의 편일까요?'));
  }
  sheet.body.append(live, reveal, continueButton);
  sheet.open();
  if (result.roll && rollNumber && needle) {
    const roll = result.roll;
    const number = rollNumber;
    const pointer = needle;
    const started = performance.now();
    const animate = (now: number) => {
      if (!sheet.dialog.isConnected) return;
      const progress = reducedMotion() ? 1 : Math.max(0, Math.min(1, (now - started) / 900));
      const eased = 1 - Math.pow(1 - progress, 3);
      const degrees = eased * (1080 + roll.value / 100 * 360);
      number.textContent = progress < 1 ? String(Math.floor(degrees / 3.6) % 100).padStart(2, '0') : String(roll.value).padStart(2, '0');
      pointer.style.transform = `rotate(${degrees}deg)`;
      if (progress < 1) requestAnimationFrame(animate);
      else {
        number.classList.add(roll.success ? 'positive' : 'negative');
        sheet.dialog.classList.add(roll.success ? 'roll-success' : 'roll-failure');
        showDetails();
      }
    };
    if (reducedMotion()) animate(started);
    else requestAnimationFrame(animate);
  } else showDetails();
}

export function confirmNewRun(root: HTMLElement, onConfirm: () => void) {
  const sheet = createSheet(root, '새로운 비행을 시작할까요?');
  sheet.body.append(el('p', 'sheet-intro', '진행 중인 비행은 새 이야기로 바뀝니다. 발견한 엔딩과 최고 기록은 간직할 수 있어요.'));
  sheet.body.append(button('새 게임 시작', 'primary full-width', () => { sheet.close(); onConfirm(); }), button('이어서 고민하기', 'secondary full-width', sheet.close));
  sheet.open();
}

function eventProfile(event: EventDef, state: GameState) {
  const profile = el('div', 'event-profile');
  const chartBox = el('section', 'chart-box');
  chartBox.append(el('h3', '', '현재 상태'));
  const chart = el('dl', 'event-chart');
  chart.setAttribute('aria-label', '현재 상태');
  const { creditLimit, turnsLeft } = derived(state);
  const { money, debt, xp, rep, drone, cond } = state.s;
  const steps = [50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000, 50000, 100000, 200000, 500000, 1000000, 2000000, 5000000];
  const scale = (value: number, max: number) => Math.min(steps.find(step => step >= value) ?? max, max);
  for (const [stat, label, value, max, share] of [
    ['money', '자금', money, scale(money, STAT_MAX.money!), false],
    ['credit', '신용', Math.max(0, creditLimit - debt), creditLimit, true],
    ['xp', '경험', xp, scale(xp, STAT_MAX.xp!), false],
    ['rep', '평판', rep, scale(rep, STAT_MAX.rep!), false],
    ['cond', '기체', drone ? cond : 0, 100, true],
    ['time', '시간', turnsLeft, RULES.maxTurns, true],
  ] as const) {
    const column = el('div', 'chart-column chart-' + stat);
    const track = el('span', 'chart-track');
    track.setAttribute('aria-hidden', 'true');
    const fill = el('i');
    const percent = Math.max(0, Math.min(100, value / max * 100));
    fill.style.height = percent + '%';
    track.append(fill);
    const reading = el('dd', '', share ? Math.round(percent) + '%' : num(value));
    reading.append(track);
    column.append(el('dt', '', label), reading);
    chart.append(column);
  }
  chartBox.append(chart);
  profile.append(portrait(eventPortrait(event.id)), chartBox);
  return profile;
}

export function showEvent(root: HTMLElement, event: EventDef, state: GameState, choices: OptionView[], choose: (id: string) => void) {
  const sheet = createSheet(root, event.title, false);
  sheet.dialog.classList.add('event-sheet');
  const place = el('p','eyebrow',PLACES[event.place].name + ' · 이벤트');
  place.prepend(icon('flag'));
  sheet.body.append(eventProfile(event, state), place, el('p','event-text',event.text));
  const answers = el('div','event-choices');
  for (const o of choices) {
    const answer = commitButton(o, '', choose);
    answer.className = 'answer';
    answer.removeAttribute('aria-label');
    answer.replaceChildren(el('strong','',o.title),el('small','',price(o)));
    if (o.roll) answer.append(el('b','',`성공 ${o.roll.chance}%`),meter(o.roll.chance,100,'성공 확률'));
    answer.append(outcomes(o));
    answers.append(answer);
  }
  sheet.body.append(answers);
  sheet.open();
}
