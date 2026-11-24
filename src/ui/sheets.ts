import { ITEMS, PLACES, STAGES, STAT_LABEL } from '../game/data.ts';
import { derived, num } from '../game/engine.ts';
import type { GameState, ItemKind, OptionView, PlaceId, Result, Stat } from '../game/types.ts';
import { optionCard } from './cards.ts';
import { button, el, reducedMotion } from './dom.ts';
import { icon } from './icons.ts';
import { signed, statValue, upkeepList } from './hud.ts';

type Sheet = { dialog: HTMLDialogElement; body: HTMLElement; close: () => void; open: () => void };
let activeSheet: Sheet | null = null;
let sheetId = 0;

export function closeSheet() {
  activeSheet?.close();
}

export function createSheet(root: HTMLElement, title: string, dismissible = true): Sheet {
  closeSheet();
  const previous = document.activeElement;
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
  const sheet = { dialog, body, close, open: () => {
    document.body.classList.add('sheet-open');
    dialog.showModal();
    // Focus the title first so a long result or stat sheet opens at its beginning.
    heading.tabIndex = -1;
    heading.focus({ preventScroll: true });
  } };
  activeSheet = sheet;
  return sheet;
}

export function showServices(root: HTMLElement, state: GameState, choices: OptionView[], onChoose: (id: string) => void) {
  const sheet = createSheet(root, '비행을 위한 준비');
  sheet.dialog.classList.add('services-sheet');
  sheet.body.append(el('p', 'sheet-intro', '장비를 갖추고, 기체를 돌보고, 다음 비행을 준비하세요. 분기는 지나가지 않아요.'));
  const d = derived(state);
  const balance = el('div', 'service-balance');
  balance.append(icon('coin'), el('span', '', '사용 가능한 자금'), el('strong', '', `${num(state.s.money)}만원`));
  sheet.body.append(balance);
  const tabs = el('div', 'segmented-tabs');
  tabs.setAttribute('aria-label', '시설 선택');
  const content = el('div', 'service-content');
  const buttons = new Map<PlaceId, HTMLButtonElement>();
  const render = (place: PlaceId) => {
    buttons.forEach((tab, id) => {
      tab.classList.toggle('active', id === place);
      tab.setAttribute('aria-pressed', String(id === place));
    });
    content.replaceChildren();
    if (place === 'shop') {
      const inventory = el('div', 'inventory');
      for (const kind of ['drone', 'gear', 'car'] as ItemKind[]) {
        const row = el('div');
        row.append(el('span', '', ITEMS[kind].label), el('strong', '', d.items[kind].name));
        inventory.append(row);
      }
      content.append(inventory);
    }
    const list = choices.filter((option) => option.free && option.place === place);
    if (!list.length) {
      const message = place === 'garage' ? (state.s.drone ? '기체 상태가 완벽해요. 다음 비행을 기다리고 있어요.' : '아직 정비할 기체가 없어요. 자격증을 딴 뒤 첫 드론을 만나 보세요.') : state.stage === 'student' ? '자격증 취득 후 드론과 장비를 구입할 수 있어요.' : '모든 장비를 최고 단계까지 갖췄어요!';
      content.append(el('p', 'empty-state', message));
    }
    for (const option of list) content.append(optionCard(option, (id) => { sheet.close(); onChoose(id); }));
  };
  for (const [place, label] of [['shop', '상점'], ['garage', '정비'], ['bank', '은행']] as [PlaceId, string][]) {
    const tab = button(label, '', () => render(place));
    tab.prepend(icon(place === 'shop' ? 'bag' : place === 'garage' ? 'tool' : 'bank'));
    buttons.set(place, tab);
    tabs.append(tab);
  }
  sheet.body.append(tabs, content);
  render('shop');
  sheet.open();
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
      if (!value || ['flights', 'wins', 'losses', 'crashes', 'overdue'].includes(stat)) continue; // counters, not rewards
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
      reveal.append(el('h3', 'subheading', '이번 분기 결산'), upkeepList(result.upkeep.lines, result.upkeep.total));
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
      const progress = reducedMotion() ? 1 : Math.min(1, (now - started) / 900);
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

export function serviceSummary(state: GameState): string {
  const d = derived(state);
  return `다음 분기 예상 수입 · 지출 ${signed(d.upkeep.total)}만원`;
}
