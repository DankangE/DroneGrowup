import { grade, GRADED_STATS } from '../life/grades.ts';
import { STAT_LABEL } from '../life/life-data.ts';
import type { Derived, OptionView } from '../life/engine.ts';
import type { GameState } from '../life/types.ts';
import { MAPS, WORLD } from '../life/world.ts';
import { statChanges } from './popups/polish-model.ts';
import { button, el } from '../ui/dom.ts';

export const HUD_STYLE = `
.life2 .life2-shell { grid-template-rows:110px minmax(412px,1fr) 136px 44px; }
.life2 .life2-bottom { position:relative; z-index:11; }
.life2 .life2-hud { gap:2px; }
.life2 .life2-funds { display:flex; justify-content:space-between; gap:6px; font-size:12px; line-height:16px; }
.life2 [data-debt-state=owing] .life2-debt { color:#9b323b; font-weight:800; }
.life2 .life2-options[data-single-page] { grid-template-rows:18px minmax(0,1fr); }
.life2 .life2-pager[hidden] { display:none; }
.life2 .life2-change-strip { height:14px; font-size:11px; line-height:14px; white-space:nowrap; }
.life2 .life2-stats { font-size:11px; line-height:14px; }

.life2 .life2-grades { display:grid; grid-template-columns:repeat(5,minmax(0,1fr)); gap:1px 3px; font-size:11px; line-height:12px; }
@media (min-width:900px) {
  .life2 .life2-shell { grid-template-rows:138px minmax(0,1fr) 44px; }
  .life2 .life2-hud { gap:4px; }
}
`;
const GRADE_NAMES = { skill: '조종', xp: '경험', teach: '교육', biz: '사업', support: '지지' };

export function hud(state: GameState, view: Derived, offered: OptionView[], choose: (id: string) => void,
  open?: (menu: 'my-life' | 'phone') => void, before?: GameState) {
  const changes = before ? statChanges(before, state) : [];
  const mark = (cell: HTMLElement, stat: string) => {
    const change = changes.find(row => row.stat === stat);
    if (change) { cell.dataset.changedStat = stat; cell.dataset.direction = change.direction;
      cell.setAttribute('aria-label', `${change.label} ${change.value}`); }
    return cell;
  };
  const current = WORLD.find(node => node.id === state.board.pos)!;
  const top = el('header', 'life2-hud');
  const date = el('div', 'life2-date');
  date.append(el('h1', '', view.dateLabel), el('span', '', MAPS[current.map].name));
  const stats = el('div', 'life2-stats');
  const funds = el('div', 'life2-funds'); funds.dataset.debtState = state.s.debt > 0 ? 'owing' : 'clear';
  funds.append(mark(el('span', '', `자금 ${state.s.money.toLocaleString('ko-KR')}만`), 'money'),
    mark(el('span', 'life2-debt', `빚 ${state.s.debt.toLocaleString('ko-KR')}만`), 'debt'));
  stats.append(
    mark(el('span', '', `체력 ${state.s.stamina}/${view.capStamina}`), 'stamina'), el('span', '', offered.some(option => option.id.startsWith('start:')) ? '진로 선택 전' : view.rankName || view.stageName));
  const grades = el('div', 'life2-grades'); grades.setAttribute('aria-label', '능력치 등급');
  for (const stat of GRADED_STATS) {
    const letter = grade(stat, state.s[stat])!.letter;
    const cell = el('span', '', `${GRADE_NAMES[stat as keyof typeof GRADE_NAMES] ?? STAT_LABEL[stat]} ${letter}`);
    cell.dataset.grade = stat; cell.setAttribute('aria-label', `${STAT_LABEL[stat]} ${letter}등급`); grades.append(mark(cell, stat));
  }
  const ticks = el('div', 'life2-change-strip'); ticks.setAttribute('aria-live', 'polite');
  const changed = changes.filter(row => ['money', 'debt'].includes(row.stat!));
  ticks.textContent = changed.map(row => { const delta = state.s[row.stat!] - before!.s[row.stat!];
    return `${row.label} ${delta > 0 ? '+' : ''}${delta}만`; }).join(' · ');
  top.append(el('style', '', HUD_STYLE), date, funds, stats, grades, ticks);
  const bottom = el('footer', 'life2-bottom');
  // Navigation opens presentation views; engine options still own every service.
  for (const [name, nav] of [['내 인생', 'life'], ['휴대폰', 'phone']]) {
    const reserved = button(name, 'life2-reserved', () => open?.(nav === 'life' ? 'my-life' : 'phone'));
    reserved.disabled = !open;
    reserved.dataset.nav = nav;
    bottom.append(reserved);
  }
  const spin = offered.find(option => option.id === 'spin');
  const center = spin ? button(spin.title, 'life2-spin', () => choose(spin.id))
    : el('output', 'life2-dice', state.board.dice.join(' · ') || '— · —');
  if (spin) { center.dataset.option = spin.id; (center as HTMLButtonElement).disabled = !spin.enabled; }
  else center.setAttribute('aria-label', `룰렛 ${state.board.dice.join(', ')}`);
  bottom.insertBefore(center, bottom.lastChild);
  return { top, bottom };
}
