import { careerRank, GRADED_STATS, grade } from '../game/career.ts';
import { gradeBadge, rankLine } from './pieces.ts';
import { previewWheel } from './wheel.ts';
import { GRADE_STEPS, GRADES, PLACES, RULES, STAT_LABEL } from '../game/data.ts';
import { boardView, dateLabel, derived, forecast, num } from '../game/engine.ts';
import type { Forecast, GameState, OptionView, PlaceId, Stat } from '../game/types.ts';
import { button, el, meter, paginateRows } from './dom.ts';
import { icon, type IconName } from './icons.ts';
import { detailLabel, forecastLines, price, signed, statValue } from '../game/outcome-text.ts';
import { routeLanes } from './board.ts';
import { fieldScene } from './scene.ts';

// Home choices charging this many 만원 upfront require a second tap.
export const CONFIRM_COST = 100;

export type Nav = 'home' | 'shop' | 'bank' | 'info' | 'log';
const navigation: [Nav, string, IconName][] = [['home','홈','home'], ['shop','상점','bag'], ['bank','은행','bank'], ['info','내 정보','drone'], ['log','기록','book']];
const symbols: Record<PlaceId,IconName> = { home:'home', school:'book', airfield:'drone', exam:'flag', town:'bag', shop:'bag', garage:'tool', bank:'bank', farm:'sun', site:'tool', bridge:'map', windfarm:'bolt', studio:'drone', coast:'map', office:'home', hq:'bank', academy:'book', assoc:'flag' };
function staminaReason(o: OptionView) {
  const pct = o.roll?.staminaPct;
  if (!pct) return '';
  const reason = pct > 0 ? '체력 여유' : pct === -RULES.stamina.exhaustedPenalty ? '탈진' : '피로';
  return `${reason} ${signed(pct)}%p`;
}
export function outcomes(o: OptionView, f: Forecast) {
  const body = el('span', 'outcomes');
  if (o.roll?.staminaPct) body.append(el('span', 'stamina-reason', staminaReason(o)));
  const classes = { upfront: 'upfront', success: 'success', sure: 'success', fail: 'failure', crash: 'risk' };
  for (const line of forecastLines(f)) body.append(el('span', classes[line.id], line.text));
  if (o.locks.length) body.append(el('span', 'lock-reasons', o.locks.join(' · ')));
  return body;
}
export function commitButton(o: OptionView, label: string, onChoose: (id: string) => void) {
  const action = button(label, 'primary', () => onChoose(o.id));
  action.dataset.option = o.id;
  action.disabled = !o.enabled;
  action.setAttribute('aria-label', o.title + ' · ' + label);
  action.append(icon(o.enabled ? 'arrow' : 'lock'));
  return action;
}
export function pager(page: number, total: number, change: (page: number) => void) {
  const bar = el('div', 'pager');
  for (const step of [-1, 1]) {
    const action = step < 0 ? 'page-prev' : 'page-next';
    const b = button('', 'page-arrow', () => {
      const owner = b === document.activeElement ? b.closest('.panel, dialog') : null;
      change(page + step);
      const next = owner?.querySelector<HTMLButtonElement>(`[data-action="${action}"]:enabled`)
        ?? owner?.querySelector<HTMLButtonElement>('.pager button:enabled');
      next?.focus({ preventScroll: true });
    }, action);
    b.setAttribute('aria-label', step < 0 ? '이전 페이지' : '다음 페이지');
    b.disabled = step < 0 ? page === 0 : page >= total - 1;
    b.append(icon('arrow'));
    if (step > 0) bar.append(el('span', '', `${page + 1} / ${total}`));
    bar.append(b);
  }
  return bar;
}

// A short full-width row can leave two long flight forecasts side by side. Measure both
// widths, then pack the largest prefix that fits without changing the choices' reading order.
function choicePages(grid: HTMLElement, cards: HTMLButtonElement[], room: number) {
  if (!cards.length) return [[]];
  grid.style.alignItems = 'start';
  grid.append(...cards);
  const narrow = cards.map(card => card.offsetHeight);
  for (const card of cards) card.classList.add('full-row');
  const wide = cards.map(card => card.offsetHeight);
  const gap = parseFloat(getComputedStyle(grid).rowGap);
  grid.replaceChildren();
  grid.style.removeProperty('align-items');

  const pages: HTMLButtonElement[][] = [];
  for (let start = 0; start < cards.length;) {
    const heights = [0];
    const rowSizes = [0];
    let count = 0;
    for (let end = start; end < cards.length; end++) {
      const single = heights[count] + wide[end] + (count ? gap : 0);
      const pair = count ? heights[count - 1] + Math.max(narrow[end - 1], narrow[end]) + (count > 1 ? gap : 0) : Infinity;
      const height = Math.min(single, pair);
      if (count && height > room) break;
      heights.push(height);
      rowSizes.push(pair <= single ? 2 : 1);
      count++;
    }
    for (let length = count; length > 0; length -= rowSizes[length]) {
      if (rowSizes[length] === 2) {
        cards[start + length - 1].classList.remove('full-row');
        cards[start + length - 2].classList.remove('full-row');
      }
    }
    pages.push(cards.slice(start, start + count));
    start += count;
  }
  return pages;
}

export function createPanel(state: GameState, choices: OptionView[], choose: (id: string) => void, initial: Nav, onTitle: () => void,
  board: ReturnType<typeof boardView>, highlight: (lane?: number) => void, rankStop: boolean) {
  const panel = el('section', 'panel');
  const caption = el('h2', 'window-title', '이번 칸에서 할 일');
  const body = el('div', 'panel-body');
  panel.append(caption, body);
  const nav = el('nav', 'nav-bar');
  nav.setAttribute('aria-label','게임 메뉴');
  let view = initial;
  let infoTab = 'stats';
  let page = 0, picked = '';
  const navButtons = new Map<Nav, HTMLButtonElement>();
  const d = derived(state);
  const node = board.nodes[board.pos];
  const routes = choices.filter(o => o.id.startsWith('route:'));
  const spin = choices.find(o => o.id === 'spin');
  const pass = choices.find(o => o.id === 'skip' || o.id === 'end');
  // TODO(engine): Fork prompts offer only routes. Services appear as soon as options() includes them.
  const shop = choices.filter(o => o.kind === 'shop' || o.kind === 'repair');
  const bank = choices.filter(o => o.kind === 'bank');
  const statEntries: [string,string][] = [['순자산', num(d.netWorth) + '만원']];
  for (const stat of Object.keys(STAT_LABEL) as Stat[]) {
    if (stat === 'acts' || GRADED_STATS.includes(stat)) continue;
    if (state.s[stat]) statEntries.push([STAT_LABEL[stat], statValue(stat, state.s[stat])]);
  }
  for (const line of d.upkeep.lines) statEntries.push(['다음 계절 · ' + line.label, signed(line.amount) + '만원']);
  statEntries.push(['다음 계절 합계', signed(d.upkeep.total) + '만원']);
  const actions = choices.filter(o => o.kind === 'action' || o.kind === 'job')
    .sort((a, b) => Number(b.enabled) - Number(a.enabled) || Number(a.kind === 'job') - Number(b.kind === 'job'));
  const logs = [...state.log].reverse();
  function reset() { page = 0; picked = ''; }
  function switchView(value: Nav) { highlight(); view = value; infoTab = 'stats'; reset(); render(); }
  for (const [key, label, symbol] of navigation) {
    const b = button('', '', () => switchView(key));
    b.dataset.nav = key;
    b.append(icon(symbol), el('span','',label));
    if ((key === 'shop' ? shop : key === 'bank' ? bank : []).some(o => o.enabled)) b.classList.add('notice');
    nav.append(b);
    navButtons.set(key,b);
  }
  // The pager measures and re-renders rows repeatedly for this one immutable state.
  const previews = new Map<string, Forecast>();
  function preview(o: OptionView) {
    let f = previews.get(o.id);
    if (!f) {
      f = forecast(state, o.id);
      previews.set(o.id, f);
    }
    return f;
  }
  function detailFor(o: OptionView) {
    const detail = el('article', 'detail');
    const head = el('div', 'detail-head');
    head.append(el('small', '', PLACES[o.place].name), el('h2', '', o.title));
    const f = preview(o);
    const commit = commitButton(o, detailLabel(o.title, f), choose);
    if (o.roll) head.append(previewWheel(o.roll.chance));
    const back = button('선택지로', 'secondary', () => {
      picked = '';
      render();
      panel.querySelector<HTMLButtonElement>(`[data-pick="${o.id}"]`)?.focus();
    }, 'back-to-options');
    const controls = el('div', 'detail-controls');
    controls.append(back, commit);
    detail.append(head, el('p', 'desc', o.desc), outcomes(o, f), controls);
    return detail;
  }

  function focusDetail() {
    const commit = panel.querySelector<HTMLButtonElement>('.detail [data-option]:enabled');
    (commit ?? panel.querySelector<HTMLButtonElement>('[data-action="back-to-options"]'))?.focus();
  }

  function requireDetail(card: HTMLButtonElement, id: string) {
    delete card.dataset.option;
    card.dataset.pick = id;
    card.setAttribute('aria-expanded', String(id === picked));
  }

  function optionCard(o: OptionView) {
    const f = preview(o);
    // A locked card opens a read-only detail (full forecast, disabled commit) so the player can see what it would do.
    const confirm = !o.enabled || o.cost >= CONFIRM_COST || f.branches.some(b => b.stage || b.end);
    const card = button('', 'option-card', () => {
      if (card.dataset.pick) {
        picked = o.id;
        render();
        focusDetail();
      } else choose(o.id);
    });
    if (confirm) requireDetail(card, o.id);
    else card.dataset.option = o.id;
    card.classList.toggle('locked', !o.enabled);
    const head = el('span', 'option-head');
    head.append(icon(symbols[o.place]), el('strong', '', o.title));
    if (o.roll) {
      const odds = el('b', 'odds', o.roll.chance + '%');
      odds.dataset.wheelPreview = '';
      odds.dataset.chance = String(o.roll.chance);
      odds.style.setProperty('--chance', o.roll.chance + '%');
      head.append(odds);
    }
    card.append(head);
    if (o.roll || o.tire || !o.enabled) card.append(el('small', 'option-price', o.roll?.staminaPct ? price(o) + ' · ' + staminaReason(o) : price(o)));
    const forecastBody = outcomes(o, f);
    card.title = [o.title, ...Array.from(forecastBody.children, line => line.textContent)].join('\n');
    card.append(forecastBody);
    return card;
  }

  function boardButton(o: OptionView, className: string) {
    const control = button(o.title, className, () => choose(o.id));
    control.dataset.option = o.id;
    control.disabled = !o.enabled;
    return control;
  }

  function spinPrompt(o: OptionView) {
    const preview = fieldScene(node.place, state);
    preview.classList.add('departure');
    preview.append(el('b', 'place-label', PLACES[node.place].name));
    const prompt = el('div', 'spin-prompt');
    const hint = el('p');
    hint.append(el('span', 'departure-from', PLACES[node.place].name + '에서 출발 · '), `주사위 눈만큼 1~${RULES.board.die}칸`);
    prompt.append(preview, hint);
    const roll = boardButton(o, 'primary spin-button');
    roll.prepend(icon('compass'));
    roll.setAttribute('aria-keyshortcuts', 'S Space');
    prompt.append(roll);
    return prompt;
  }

  function forkPrompt() {
    const prompt = el('div', 'fork-prompt');
    if (state.board.left) prompt.append(el('b', 'remaining', `남은 ${state.board.left}칸`));
    const lanes = routeLanes(board, node);
    routes.forEach((o, index) => {
      const card = boardButton(o, 'route-card');
      card.setAttribute('aria-keyshortcuts', String(index + 1));
      card.replaceChildren(el('strong', '', o.title), icon('arrow'));
      const chips = el('span', 'route-chips');
      for (const stop of lanes[index]) {
        const chip = el('span', '', stop.label);
        chip.dataset.kind = stop.kind;
        chips.append(chip);
      }
      card.append(chips);
      for (const event of ['focus', 'pointerenter']) card.addEventListener(event, () => highlight(index));
      for (const event of ['blur', 'pointerleave']) card.addEventListener(event, () => highlight());
      prompt.append(card);
    });
    return prompt;
  }

  function render() {
    const focusKey = panel.contains(document.activeElement) ? Object.entries((document.activeElement as HTMLElement).dataset)[0] : undefined;
    body.replaceChildren();
    delete panel.dataset.fork;
    delete panel.dataset.bonus;
    delete panel.dataset.spaceCard;
    for (const [key,b] of navButtons) b.setAttribute('aria-pressed',String(key === view));
    panel.dataset.view = view;
    const [,label,symbol] = navigation.find(([key]) => key === view)!;
    caption.replaceChildren(icon(symbol), view === 'home' ? '이번 칸에서 할 일' : label);
    const header = el('div', 'panel-head');
    body.append(header);
    function pageControl(total: number, container = header) {
      page = Math.min(page, total - 1);
      if (total > 1 || container === header) container.append(pager(page, total, i => { page = i; picked = ''; render(); }));
    }
    function pagedGrid(grid: HTMLElement, items: HTMLElement[], columns: number) {
      body.append(grid);
      const style = getComputedStyle(body);
      const bottom = parseFloat(style.paddingBottom) + parseFloat(style.borderBottomWidth);
      const room = body.getBoundingClientRect().bottom - grid.getBoundingClientRect().top - bottom;
      const pages = paginateRows(grid, items, columns, room);
      pageControl(pages.length);
      grid.replaceChildren(...pages[page]);
    }
    if (view === 'home') {
      if (state.phase !== 'action') {
        header.remove();
        caption.textContent = state.phase === 'event' ? '사건 카드' : '인생 결산';
      } else if (spin) {
        caption.replaceChildren(icon('compass'), '이번 계절의 출발');
        header.replaceWith(spinPrompt(spin));
      } else if (routes.length) {
        caption.replaceChildren(icon('map'), '갈림길 · 어느 길로 갈까?');
        panel.dataset.fork = '';
        header.replaceWith(forkPrompt());
      } else if (pass) {
        const bonus = pass.id === 'end';
        if (bonus) panel.dataset.bonus = '';
        else panel.dataset.spaceCard = node.kind;
        caption.replaceChildren(icon(symbols[node.place]), bonus
          ? `추가 행동 하나 · ${PLACES[node.place].name} · 체력 ${state.s.stamina}` : `${node.label} 칸 · ${PLACES[node.place].name}`);
        if (bonus) header.remove();
        else {
          header.className = 'step-intro';
          if (window.matchMedia('(min-width: 900px)').matches) header.append(fieldScene(node.place, state));
          const copy = el('div', '', '도착한 칸의 행동은 체력 없이 바로 한다');
          if (rankStop) copy.append(el('b', 'rank-stop', '승급 칸에서 멈췄다'));
          header.append(copy);
        }
        const grid = el('div', 'option-grid');
        const cards = actions.map(optionCard);
        const bar = boardButton(pass, 'step-bar');
        if (bonus) {
          bar.append(el('small', '', `체력 +${RULES.seasonRefill} 회복 후 다음 계절`));
          bar.setAttribute('aria-keyshortcuts', 'E R');
        }
        const controls = el('div', 'step-controls');
        controls.append(bar);
        body.append(grid, controls);
        const style = getComputedStyle(body);
        const gap = parseFloat(style.rowGap);
        const room = body.getBoundingClientRect().bottom - parseFloat(style.paddingBottom)
          - grid.getBoundingClientRect().top - controls.offsetHeight - gap;
        const pages = choicePages(grid, cards, room);
        if (picked) {
          const selectedPage = pages.findIndex(items => items.some(card => card.dataset.pick === picked || card.dataset.option === picked));
          if (selectedPage >= 0) page = selectedPage;
        }
        pageControl(pages.length, controls);
        const items = pages[page];
        items.slice(0, 9).forEach((card, index) => card.setAttribute('aria-keyshortcuts', String(index + 1)));
        grid.replaceChildren(...items);
        for (const card of items) {
          if (card.dataset.option && [...card.querySelectorAll('.outcomes > span')].some(line => line.scrollWidth > line.clientWidth)) {
            requireDetail(card, card.dataset.option);
          }
        }
        const current = actions.find(o => o.id === picked);
        if (current && body.querySelector(`[data-pick="${current.id}"]`)) {
          const detail = detailFor(current);
          grid.after(detail);
          if (grid.offsetHeight + detail.offsetHeight + gap > room) grid.remove();
          if (detail.offsetHeight > room) header.remove();
          if (body.scrollHeight > body.clientHeight + 1) controls.remove();
        }
      }
    } else {
      if (view === 'shop' || view === 'bank') {
        const list = view === 'shop' ? shop : bank;
        const note = el('div','service-note','계절 소모 없음');
        note.prepend(icon('check'));
        if (view === 'bank') {
          const balance = el('div', 'bank-balance');
          balance.append(el('b','',`빚 ${num(state.s.debt)} / ${num(d.creditLimit)}만원`),meter(state.s.debt,d.creditLimit,'대출 한도'));
          body.append(balance);
        }
        header.append(note);
        const grid = el('div','service-grid');
        const cards = list.map(o => {
          const card = el('article','service-card' + (o.enabled ? '' : ' locked'));
          const symbol = o.kind === 'bank' ? 'bank' : o.id === 'buy:car' ? 'car' : o.id === 'buy:drone' ? 'drone' : 'tool';
          card.append(icon(symbol), el('h3','',o.title), el('p','desc',o.desc));
          card.append(outcomes(o, preview(o)));
          card.append(commitButton(o, o.kind === 'bank' && !o.cost ? o.title : price(o),choose));
          return card;
        });
        if (cards.length) pagedGrid(grid, cards, 2);
        else {
          pageControl(1);
          const message = routes.length ? '항로를 고른 뒤 이용할 수 있어요.'
            : view === 'bank' ? '현재 이용할 은행 업무가 없어요.'
            : state.stage === 'student' ? '자격증을 취득하면 장비 상점이 열려요.' : '현재 이용할 업그레이드나 정비가 없어요.';
          body.append(empty(view === 'bank' ? 'bank' : 'bag', message));
        }
      } else if (view === 'info') {
        const tabs = el('div', 'tabs');
        for (const [key, name] of [['stats','능력'], ['money','살림'], ['grades','등급표']]) {
          const tabButton = button(name, '', () => { infoTab = key; reset(); render(); });
          tabButton.dataset.tab = key;
          tabButton.setAttribute('aria-pressed', String(infoTab === key));
          tabs.append(tabButton);
        }
        header.append(tabs);
        if (infoTab === 'stats') {
          const summary = rankLine(careerRank(state));
          summary.append(button('타이틀', 'return-title', onTitle, 'title'));
          body.append(summary);
          const rows = GRADED_STATS.filter(stat => state.s[stat] || ['stamina','theory','skill'].includes(stat)).map(stat => {
            const value = state.s[stat];
            const held = grade(stat, value)!;
            const row = el('div', 'stat-row');
            row.append(gradeBadge(state, stat), el('b', '', STAT_LABEL[stat]), el('strong', '', num(value)));
            row.append(el('small', '', held.next === null ? '최고 등급' : `다음 ${GRADES[held.index + 1]}까지 ${num(held.next - value)}`));
            row.append(held.next === null ? meter(1, 1, '최고 등급') : meter(value - held.from, held.next - held.from, '다음 등급까지'));
            return row;
          });
          pagedGrid(el('div', 'stat-list'), rows, 1);
        } else if (infoTab === 'grades') {
          const rows = GRADED_STATS.map(stat => {
            const row = el('div', 'threshold-row');
            row.append(el('b', '', STAT_LABEL[stat]), gradeBadge(state, stat));
            const held = grade(stat, state.s[stat])!;
            GRADE_STEPS[stat]!.forEach((v, i) => {
              const cell = el('span', held.index === i + 1 ? 'held' : '');
              cell.append(el('b', '', GRADES[i + 1]), el('small', '', num(v)));
              row.append(cell);
            });
            return row;
          });
          pagedGrid(el('div', 'grade-table'), rows, 1);
        } else {
          const facts = statEntries.map(([label, value]) => {
            const pair = el('div');
            pair.append(el('dt', '', label), el('dd', '', value));
            return pair;
          });
          pagedGrid(el('dl', 'fact-grid'), facts, 2);
        }
      } else {
        header.append(el('span', 'log-count', `최근 기록 ${logs.length}건`));
        const entries = logs.map(entry => {
          const row = el('li', entry.tone);
          row.append(el('b', '', dateLabel(entry.turn)), el('p', '', entry.text));
          return row;
        });
        pagedGrid(el('ol', 'journal'), entries, 1);
        if (!logs.length) body.append(empty('book', '첫 선택을 마치면 비행 기록이 쌓여요.'));
      }
    }
    if (focusKey) {
      const [key,value] = focusKey;
      const same = [...panel.querySelectorAll<HTMLButtonElement>('button:enabled')].find(b => b.dataset[key] === value);
      same?.focus({ preventScroll: true });
    }
  }
  return { panel, nav, fit: render, currentNav: () => view, goal(id: string) {
    view = 'home'; picked = id;
    render();
    if (panel.querySelector('.detail')) focusDetail();
    else panel.querySelector<HTMLButtonElement>(`[data-option="${id}"]`)?.focus({ preventScroll: true });
  }};
}
function empty(symbol: IconName, text: string) {
  const note = el('div','empty');
  note.append(icon(symbol),el('p','',text));
  return note;
}
