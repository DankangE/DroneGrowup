import { PLACES, STAT_LABEL } from '../game/data.ts';
import { derived, num } from '../game/engine.ts';
import type { GameState, OptionView, PlaceId, Stat } from '../game/types.ts';
import { button, el, meter, paginateRows } from './dom.ts';
import { icon, type IconName } from './icons.ts';
import { signed, statValue } from './hud.ts';
import { shortNames } from './scene.ts';

export type Nav = 'home' | 'shop' | 'bank' | 'info' | 'log';
type Tab = 'all' | 'job' | 'action' | 'place';
const navigation: [Nav, string, IconName][] = [['home','홈','home'], ['shop','상점','bag'], ['bank','은행','bank'], ['info','내 정보','drone'], ['log','기록','book']];
const symbols: Record<PlaceId,IconName> = { home:'home', school:'book', airfield:'drone', exam:'flag', town:'bag', shop:'bag', garage:'tool', bank:'bank', farm:'sun', site:'tool', bridge:'map', windfarm:'bolt', studio:'drone', coast:'map', office:'home', hq:'bank', academy:'book', assoc:'flag' };
export const price = (o: OptionView) => o.cost ? num(o.cost) + '만원' : '무료';
export function outcomes(o: OptionView) {
  const body = el('span', 'outcomes');
  if (o.roll) {
    body.append(el('span', 'success', '성공: ' + o.roll.success.summary), el('span', 'failure', '실패: ' + o.roll.fail.summary));
    if (o.roll.crashPct !== undefined) body.append(el('span', 'risk', `실패 시 추락 위험 ${o.roll.crashPct}%`));
  } else if (o.sure) body.append(el('span', 'success', '확정 · ' + o.sure.summary));
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
    const b = button('', 'page-arrow', () => change(page + step), step < 0 ? 'page-prev' : 'page-next');
    b.setAttribute('aria-label', step < 0 ? '이전 페이지' : '다음 페이지');
    b.disabled = step < 0 ? page === 0 : page >= total - 1;
    b.append(icon('arrow'));
    if (step > 0) bar.append(el('span', '', `${page + 1} / ${total}`));
    bar.append(b);
  }
  return bar;
}

export function createPanel(state: GameState, choices: OptionView[], choose: (id: string) => void, initial: Nav, onTitle: () => void) {
  const panel = el('section', 'panel');
  const caption = el('h2', 'window-title', '이번 분기 할 일');
  const body = el('div', 'panel-body');
  panel.append(caption, body);
  const nav = el('nav', 'nav-bar');
  nav.setAttribute('aria-label','게임 메뉴');
  let view = initial, tab: Tab = 'all', place: PlaceId | null = null;
  let page = 0, picked = '';
  const navButtons = new Map<Nav, HTMLButtonElement>();
  const d = derived(state);
  const shop = choices.filter(o => o.kind === 'shop' || o.kind === 'repair');
  const bank = choices.filter(o => o.kind === 'bank');
  const statEntries: [string,string][] = [['순자산', num(d.netWorth) + '만원']];
  for (const stat of Object.keys(STAT_LABEL) as Stat[]) {
    if (state.s[stat]) statEntries.push([STAT_LABEL[stat], statValue(stat, state.s[stat])]);
  }
  for (const line of d.upkeep.lines) statEntries.push(['다음 분기 · ' + line.label, signed(line.amount) + '만원']);
  statEntries.push(['다음 분기 합계', signed(d.upkeep.total) + '만원']);
  const actions = choices.filter(o => !o.free && o.kind !== 'event');
  const logs = [...state.log].reverse();
  function reset() { page = 0; picked = ''; }
  function switchView(value: Nav) { view = value; tab = 'all'; reset(); render(); }
  for (const [key, label, symbol] of navigation) {
    const b = button('', '', () => switchView(key));
    b.dataset.nav = key;
    b.append(icon(symbol), el('span','',label));
    if ((key === 'shop' ? shop : key === 'bank' ? bank : []).some(o => o.enabled)) b.classList.add('notice');
    nav.append(b);
    navButtons.set(key,b);
  }
  function detailFor(o: OptionView) {
    const detail = el('article', 'detail');
    const head = el('div', 'detail-head');
    head.append(el('small', '', PLACES[o.place].name), el('h2', '', o.title));
    detail.append(head, el('p', 'desc', o.desc), outcomes(o), commitButton(o, '실행 · ' + price(o), choose));
    return detail;
  }

  function pickRow(o: OptionView, selected: boolean) {
    const row = button('', 'pick-row' + (o.enabled ? '' : ' locked'), () => { picked = o.id; render(); });
    row.dataset.pick = o.id;
    row.setAttribute('aria-pressed', String(selected));
    const patch = el('span', 'row-icon');
    patch.append(icon(o.enabled ? symbols[o.place] : 'lock'));
    row.append(patch, el('strong', '', o.title), el('small', 'row-price', price(o)),
      el('b', o.roll ? 'odds' : 'odds sure', o.roll ? o.roll.chance + '%' : '확정'));
    return row;
  }

  const sizes = new Map<OptionView, { row: number; detail: number }>();
  let listRoom = 0, rowGap = 0;
  function pageHeight(items: OptionView[]) {
    let rows = 0, detail = 0;
    for (const item of items) {
      const size = sizes.get(item)!;
      rows += size.row;
      detail = Math.max(detail, size.detail);
    }
    return rows + Math.max(0, items.length - 1) * rowGap + detail;
  }
  function actionPages(list: OptionView[], room = listRoom) {
    const pages: OptionView[][] = [[]];
    for (const item of list) {
      const last = pages[pages.length - 1];
      if (last.length >= 6 || (last.length && pageHeight([...last, item]) > room)) pages.push([item]);
      else last.push(item);
    }
    return pages;
  }

  function fit() {
    body.replaceChildren();
    panel.style.height = '';
    const desktop = matchMedia('(min-width: 900px)').matches;
    const deck = panel.parentElement!;
    const scene = deck.querySelector<HTMLElement>('.scene')!;
    const mapReserve = Math.max(200, Math.min(320, 200 + (deck.clientHeight - 740) * .8));
    const budget = panel.clientHeight + (desktop ? 0 : scene.clientHeight - mapReserve);
    const style = getComputedStyle(body);
    const chrome = panel.offsetHeight - body.clientHeight;
    const frame = chrome + 44 + parseFloat(style.paddingTop) + parseFloat(style.paddingBottom) + 2 * parseFloat(style.rowGap);

    // Measure at the real column width. A long locked choice only reduces
    // capacity on the page containing it.
    const probe = el('div', 'panel-probe');
    const rows = el('div', 'action-rows');
    const samples = actions.map(option => ({ option, row: pickRow(option, false), detail: detailFor(option) }));
    rows.append(...samples.map(sample => sample.row));
    probe.append(rows, ...samples.map(sample => sample.detail));
    body.append(probe);
    rowGap = parseFloat(getComputedStyle(rows).rowGap);
    for (const { option, row, detail } of samples) {
      sizes.set(option, { row: row.getBoundingClientRect().height, detail: detail.getBoundingClientRect().height });
    }
    probe.remove();

    listRoom = Math.floor(budget - frame);
    if (!desktop) {
      // All five views share the height of the first full home page. Allow
      // enough room to select even the longest single detail on a later page.
      const first = actionPages(actions)[0];
      const needed = Math.max(pageHeight(first), ...actions.map(o => pageHeight([o])));
      listRoom = actions.length ? Math.ceil(needed) : listRoom;
      panel.style.height = (frame + listRoom) + 'px';
    }
    render();
  }
  function render() {
    const focusKey = panel.contains(document.activeElement) ? Object.entries((document.activeElement as HTMLElement).dataset)[0] : undefined;
    body.replaceChildren();
    for (const [key,b] of navButtons) b.setAttribute('aria-pressed',String(key === view));
    panel.dataset.view = view;
    const [,label,symbol] = navigation.find(([key]) => key === view)!;
    caption.replaceChildren(icon(symbol), view === 'home' ? '이번 분기 할 일' : label);
    const header = el('div', 'panel-head');
    body.append(header);
    function pageControl(total: number) {
      page = Math.min(page, total - 1);
      header.append(pager(page, total, i => { page = i; picked = ''; render(); }));
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
      const tabs = el('div','tabs');
      for (const [key,label] of [['all','전체'],['job','일감'],['action','활동'],['place', place ? '장소: ' + shortNames[place] : '']] as const) {
        if (!label) continue;
        const b = button(label, '', () => { tab = key; reset(); render(); });
        b.dataset.tab = key;
        if (key === 'all') b.dataset.action = 'all';
        b.setAttribute('aria-pressed',String(key === tab));
        tabs.append(b);
      }
      header.append(tabs);
      const list = actions.filter(o => tab === 'all' || (tab === 'place' ? o.place === place : o.kind === tab));
      const pages = actionPages(list);
      if (picked) {
        const selectedPage = pages.findIndex(items => items.some(o => o.id === picked));
        if (selectedPage >= 0) page = selectedPage;
      }
      pageControl(pages.length);
      const items = pages[page];
      const current = items.find(o => o.id === picked) ?? items.find(o => o.enabled) ?? items[0];
      if (current) {
        picked = current.id;
        const rows = el('div', 'action-rows');
        rows.append(...items.map(o => pickRow(o, o === current)));
        body.append(rows, detailFor(current));
      } else if (tab === 'place' && place && choices.some(o => o.free && o.place === place)) {
        const bankHere = place === 'bank';
        const facility = empty(bankHere ? 'bank' : 'bag', PLACES[place].desc);
        facility.append(button(bankHere ? '은행 이용하기' : '상점 · 정비 이용하기', 'secondary', () => switchView(bankHere ? 'bank' : 'shop')));
        body.append(facility);
      } else if (state.phase !== 'event') {
        const message = tab === 'job' ? '이번 분기에 받은 일감이 없어요.' : '이곳에는 이번 분기 활동이 없어요.';
        body.append(empty('map', message));
      }
    } else {
      if (view === 'shop' || view === 'bank') {
        const list = view === 'shop' ? shop : bank;
        const note = el('div','service-note','분기 소모 없음');
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
          if (o.locks.length) card.append(el('p','lock-reasons',o.locks[0]));
          card.append(commitButton(o, o.kind === 'bank' && !o.cost ? o.title : price(o),choose));
          return card;
        });
        if (cards.length) pagedGrid(grid, cards, 2);
        else {
          pageControl(1);
          body.append(empty('bag', state.stage === 'student' ? '자격증을 취득하면 장비 상점이 열려요.' : '현재 이용할 업그레이드나 정비가 없어요.'));
        }
      } else if (view === 'info') {
        header.append(button('타이틀', 'return-title', onTitle, 'title'));
        const facts = statEntries.map(([label, value]) => {
          const pair = el('div');
          pair.append(el('dt', '', label), el('dd', '', value));
          return pair;
        });
        pagedGrid(el('dl', 'fact-grid'), facts, 2);
      } else {
        header.append(el('span', 'log-count', `최근 기록 ${logs.length}건`));
        const entries = logs.map(entry => {
          const row = el('li', entry.tone);
          row.append(el('b', '', `${entry.turn + 1}분기`), el('p', '', entry.text));
          return row;
        });
        pagedGrid(el('ol', 'journal'), entries, 1);
        if (!logs.length) body.append(empty('book', '첫 선택을 마치면 비행 기록이 쌓여요.'));
      }
    }
    if (focusKey) {
      const [key,value] = focusKey;
      [...panel.querySelectorAll('button')].find(b => b.dataset[key] === value && !b.disabled)?.focus({preventScroll:true});
    }
  }
  return { panel, nav, fit, currentNav: () => view, place(id: PlaceId) {
    place = id;
    view = 'home'; tab = 'place'; reset(); render();
  }, goal(id: string) {
    view = 'home'; tab = 'all'; picked = id;
    render();
    panel.querySelector<HTMLButtonElement>('[aria-pressed="true"][data-pick]')?.focus({preventScroll:true});
  }};
}
function empty(symbol: IconName, text: string) {
  const note = el('div','empty');
  note.append(icon(symbol),el('p','',text));
  return note;
}
