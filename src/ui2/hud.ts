import type { Derived, OptionView } from '../life/engine.ts';
import type { GameState } from '../life/types.ts';
import { MAPS, WORLD } from '../life/world.ts';
import { button, el } from '../ui/dom.ts';

export function hud(state: GameState, view: Derived, offered: OptionView[], choose: (id: string) => void) {
  const current = WORLD.find(node => node.id === state.board.pos)!;
  const top = el('header', 'life2-hud');
  const date = el('div', 'life2-date');
  date.append(el('h1', '', view.dateLabel), el('span', '', MAPS[current.map].name));
  const stats = el('div', 'life2-stats');
  stats.append(el('span', '', `자금 ${state.s.money.toLocaleString('ko-KR')}만`),
    el('span', '', `체력 ${state.s.stamina}/${view.capStamina}`), el('span', '', view.rankName || view.stageName));
  top.append(date, stats);
  const bottom = el('footer', 'life2-bottom');
  // These two services belong to T18/T19; reserve their band positions without adding rules.
  for (const [name, nav] of [['내 인생', 'life'], ['휴대폰', 'phone']]) {
    const reserved = button(name, 'life2-reserved', () => {});
    reserved.disabled = true;
    reserved.title = `${name} · 준비 중`;
    reserved.dataset.nav = nav;
    bottom.append(reserved);
  }
  const spin = offered.find(option => option.id === 'spin');
  const center = spin ? button(spin.title, 'life2-spin', () => choose(spin.id))
    : el('output', 'life2-dice', state.board.dice.join(' · ') || '— · —');
  if (spin) { center.dataset.option = spin.id; (center as HTMLButtonElement).disabled = !spin.enabled; }
  else center.setAttribute('aria-label', `주사위 ${state.board.dice.join(', ')}`);
  bottom.insertBefore(center, bottom.lastChild);
  return { top, bottom };
}
