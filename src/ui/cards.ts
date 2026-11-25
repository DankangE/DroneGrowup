import { GRADED_STATS, grade } from '../game/career.ts';
import { gradeBadge, rankLine } from './pieces.ts';
import { previewWheel } from './wheel.ts';
import { GRADE_STEPS, GRADES, PLACES, RULES, STAT_LABEL } from '../game/data.ts';
import { dateLabel, derived, forecast, num } from '../game/engine.ts';
import type { Forecast, GameState, OptionView, PlaceId, Stat } from '../game/types.ts';
import { button, el, meter, paginateRows } from './dom.ts';
import { icon, type IconName } from './icons.ts';
import { detailLabel, forecastLines, price, signed, statValue } from '../game/outcome-text.ts';
import { shortNames } from './scene.ts';

// Home choices charging this many 만원 upfront require a second tap.
export const CONFIRM_COST = 100;

export type Nav = 'home' | 'shop' | 'bank' | 'info' | 'log';
type Tab = 'all' | 'job' | 'action' | 'place';
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

export function createPanel(state: GameState, choices: OptionView[], choose: (id: string) => void, initial: Nav, onTitle: () => void) {
  const panel = el('section', 'panel');
  const caption = el('h2', 'window-title', '이번 칸에서 할 일');
  const body = el('div', 'panel-body');
  panel.append(caption, body);
  const nav = el('nav', 'nav-bar');
  nav.setAttribute('aria-label','게임 메뉴');
  let view = initial, tab: Tab = 'all', place: PlaceId | null = null;
  let infoTab = 'stats';
  let page = 0, picked = '';
  const navButtons = new Map<Nav, HTMLButtonElement>();
  const d = derived(state);
  const restMode = state.s.acts === 0 ? 'full' : 'light';
  const shop = choices.filter(o => o.kind === 'shop' || o.kind === 'repair');
  const bank = choices.filter(o => o.kind === 'bank');
  const statEntries: [string,string][] = [['순자산', num(d.netWorth) + '만원']];
  for (const stat of Object.keys(STAT_LABEL) as Stat[]) {
    if (stat === 'acts' || GRADED_STATS.includes(stat)) continue;
    if (state.s[stat]) statEntries.push([STAT_LABEL[stat], statValue(stat, state.s[stat])]);
  }
  for (const line of d.upkeep.lines) statEntries.push(['다음 계절 · ' + line.label, signed(line.amount) + '만원']);
  statEntries.push(['다음 계절 합계', signed(d.upkeep.total) + '만원']);
  const rest = choices.find(o => o.id === 'rest');
  const actions = choices.filter(o => !o.free && o.kind !== 'event' && o !== rest)
    .sort((a, b) => Number(b.enabled) - Number(a.enabled) || Number(a.kind === 'job') - Number(b.kind === 'job'));
  const logs = [...state.log].reverse();
  function reset() { page = 0; picked = ''; }
  function switchView(value: Nav) { view = value; tab = 'all'; infoTab = 'stats'; reset(); render(); }
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

  function optionCard(o: OptionView) {
    const f = preview(o);
    // A locked card opens a read-only detail (full forecast, disabled commit) so the player can see what it would do.
    const confirm = !o.enabled || o.cost >= CONFIRM_COST || f.branches.some(b => b.stage || b.end);
    const card = button('', 'option-card', () => {
      if (confirm) {
        picked = o.id;
        render();
        focusDetail();
      } else choose(o.id);
    });
    if (confirm) {
      card.dataset.pick = o.id;
      card.setAttribute('aria-expanded', String(o.id === picked));
    } else card.dataset.option = o.id;
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
    // A sure card's 확정 line already lists the money and stamina it costs, so only rolls and locked cards need the price line.
    if (o.roll || !o.enabled) card.append(el('small', 'option-price', o.roll?.staminaPct ? price(o) + ' · ' + staminaReason(o) : price(o)));
    card.append(outcomes(o, f));
    return card;
  }

  // A rest that ends the run (the last season, or a final overdue strike) asks for a second tap like any other ending.
  function restEnds(o: OptionView) {
    return preview(o).branches.some(b => b.end);
  }
  function takeRest(o: OptionView) {
    if (!o.enabled) return;
    if (!restEnds(o)) return choose(o.id);
    view = 'home';
    picked = o.id;
    render();
    focusDetail();
  }

  function restBar(o: OptionView) {
    const f = preview(o);
    // The outcome line beside the label carries the numbers (체력 +N · → 계절 종료).
    const label = !f.branches[0].deltas.stamina ? '계절 넘기기' : restMode === 'full' ? '푹 쉬기' : '쉬고 계절 넘기기';
    const ends = restEnds(o);
    const bar = button('', 'rest-bar', () => takeRest(o));
    bar.setAttribute('aria-keyshortcuts', 'R');
    if (ends) {
      bar.dataset.pick = o.id;
      bar.setAttribute('aria-expanded', String(o.id === picked));
    } else bar.dataset.option = o.id;
    bar.dataset.rest = restMode;
    bar.disabled = !o.enabled;
    bar.append(el('strong', '', label), outcomes(o, f));
    return bar;
  }

  function render() {
    const focusKey = panel.contains(document.activeElement) ? Object.entries((document.activeElement as HTMLElement).dataset)[0] : undefined;
    body.replaceChildren();
    for (const [key,b] of navButtons) b.setAttribute('aria-pressed',String(key === view));
    panel.dataset.view = view;
    const [,label,symbol] = navigation.find(([key]) => key === view)!;
    caption.replaceChildren(icon(symbol), view === 'home' ? '이번 칸에서 할 일' : label);
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
      const grid = el('div', 'option-grid');
      const cards = list.map(optionCard);
      body.append(grid);
      const bar = rest && restBar(rest);
      if (bar) body.append(bar);
      const style = getComputedStyle(body);
      const gap = parseFloat(style.rowGap);
      const room = body.getBoundingClientRect().bottom - parseFloat(style.paddingBottom)
        - grid.getBoundingClientRect().top - (bar ? bar.offsetHeight + gap : 0);
      // A long forecast can use the full row if a half-width card alone would overflow.
      grid.style.alignItems = 'start';
      grid.append(...cards);
      const wide = cards.filter(card => card.offsetHeight > room);
      grid.style.removeProperty('align-items');
      for (const card of wide) card.classList.add('full-row');
      grid.replaceChildren();
      const pages = paginateRows(grid, cards, 1, room);
      if (picked) {
        const selectedPage = pages.findIndex(items => items.some(card => card.dataset.pick === picked || card.dataset.option === picked));
        if (selectedPage >= 0) page = selectedPage;
      }
      pageControl(pages.length);
      const items = pages[page];
      items.slice(0, 9).forEach((card, index) => card.setAttribute('aria-keyshortcuts', String(index + 1)));
      grid.replaceChildren(...items);
      const current = rest && picked === rest.id ? rest : list.find(o => o.id === picked);
      if (current && body.querySelector(`[data-pick="${current.id}"]`)) {
        const detail = detailFor(current);
        grid.after(detail);
        if (grid.offsetHeight + detail.offsetHeight + gap > room) grid.remove();
        if (detail.offsetHeight > room) header.remove();
        // A long locked forecast on a short screen also borrows the rest bar's row until the player goes back.
        if (bar && current !== rest && body.scrollHeight > body.clientHeight + 1) bar.remove();
      }
      if (!cards.length) {
        grid.remove();
        if (body.querySelector('.detail')) {
          // The rest confirmation already fills the panel.
        } else if (tab === 'place' && place && choices.some(o => o.free && o.place === place)) {
          const bankHere = place === 'bank';
          const facility = empty(bankHere ? 'bank' : 'bag', PLACES[place].desc);
          facility.append(button(bankHere ? '은행 이용하기' : '상점 · 정비 이용하기', 'secondary', () => switchView(bankHere ? 'bank' : 'shop')));
          header.after(facility);
        } else if (state.phase !== 'event') {
          const message = tab === 'job' ? '이번 계절에 받은 일감이 없어요.' : '이곳에는 이번 계절 활동이 없어요.';
          header.after(empty('map', message));
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
          body.append(empty('bag', state.stage === 'student' ? '자격증을 취득하면 장비 상점이 열려요.' : '현재 이용할 업그레이드나 정비가 없어요.'));
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
          const summary = rankLine(state);
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
  return { panel, nav, fit: render, currentNav: () => view, rest() {
    if (rest) takeRest(rest);
  }, place(id: PlaceId) {
    place = id;
    view = 'home'; tab = 'place'; reset(); render();
  }, goal(id: string) {
    view = 'home'; tab = 'all'; picked = id;
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
