import { grade, GRADED_STATS } from '../game/career.ts';
import { STAT_LABEL } from '../life/life-data.ts';
import type { Derived, OptionView } from '../life/engine.ts';
import type { GameState } from '../life/types.ts';
import { MAPS, WORLD } from '../life/world.ts';
import { button, el } from '../ui/dom.ts';

export const HUD_STYLE = `
.life2 .life2-shell { grid-template-rows:78px minmax(412px,1fr) 168px 44px; }
.life2 .life2-hud { gap:2px; }
.life2 .life2-grades { display:grid; grid-template-columns:repeat(5,minmax(0,1fr)); gap:1px 3px; font-size:11px; line-height:12px; }
@media (min-width:900px) {
  .life2 .life2-shell { grid-template-rows:138px minmax(0,1fr) 44px; }
  .life2 .life2-hud { gap:6px; }
}
`;
const GRADE_NAMES = { skill: '조종', xp: '경험', teach: '교육', biz: '사업', support: '지지' };

export function hud(state: GameState, view: Derived, offered: OptionView[], choose: (id: string) => void,
  open?: (menu: 'my-life' | 'phone') => void) {
  const current = WORLD.find(node => node.id === state.board.pos)!;
  const top = el('header', 'life2-hud');
  const date = el('div', 'life2-date');
  date.append(el('h1', '', view.dateLabel), el('span', '', MAPS[current.map].name));
  const stats = el('div', 'life2-stats');
  stats.append(el('span', '', `자금 ${state.s.money.toLocaleString('ko-KR')}만`),
    el('span', '', `체력 ${state.s.stamina}/${view.capStamina}`), el('span', '', offered.some(option => option.id.startsWith('start:')) ? '진로 선택 전' : view.rankName || view.stageName));
  const grades = el('div', 'life2-grades'); grades.setAttribute('aria-label', '능력치 등급');
  for (const stat of GRADED_STATS) {
    const letter = grade(stat, state.s[stat])!.letter;
    const cell = el('span', '', `${GRADE_NAMES[stat as keyof typeof GRADE_NAMES] ?? STAT_LABEL[stat]} ${letter}`);
    cell.dataset.grade = stat; cell.setAttribute('aria-label', `${STAT_LABEL[stat]} ${letter}등급`); grades.append(cell);
  }
  top.append(el('style', '', HUD_STYLE), date, stats, grades);
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
