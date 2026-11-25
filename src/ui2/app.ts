import { choose, derived, forecast, newGame, options, restore } from '../life/engine.ts';
import type { OptionView } from '../life/engine.ts';
import type { GameState } from '../life/types.ts';
import { PLACES, WORLD } from '../life/world.ts';
import { button, el } from '../ui/dom.ts';
import { board } from './board.ts';
import { hud } from './hud.ts';

const PAGE_SIZE = 2;
const PHASE_LABEL = { spin: '이번 계절', pick: '갈 곳 고르기', space: '이곳에서 할 일',
  bonus: '추가 행동', event: '사건', chapter: '인생 결산' } as const;

declare global {
  interface Window {
    __life?: { state: () => GameState; options: () => OptionView[]; load: (raw: unknown) => void };
  }
}

export function mountLife(root: HTMLElement, seed: number, debug = false): void {
  let state = newGame(seed), page = 0;
  root.classList.add('life2');
  function takeOption(id: string) {
    if (!options(state).some(option => option.id === id && option.enabled)) return;
    state = choose(state, id).state;
    page = 0;
    render(true);
  }
  function render(focus = false) {
    const offered = options(state), view = derived(state);
    const phase = state.phase === 'action' ? state.board.step : state.phase === 'ended' ? 'chapter' : 'event';
    root.dataset.screen = state.phase === 'ended' ? 'ending' : 'play';
    root.dataset.phase = phase;
    const shell = el('main', 'life2-shell'), bands = hud(state, view, offered, takeOption);
    const panel = el('section', 'life2-options');
    const heading = el('h2', '', PHASE_LABEL[phase]);
    heading.tabIndex = -1;
    panel.setAttribute('aria-label', PHASE_LABEL[phase]);
    const list = el('div', 'life2-option-list');
    const choices = offered.filter(option => option.id !== 'spin');
    const pages = Math.max(1, Math.ceil(choices.length / PAGE_SIZE));
    page = Math.min(page, pages - 1);
    for (const option of choices.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)) {
      const preview = forecast(state, option.id);
      const control = button('', 'life2-option', () => takeOption(option.id));
      control.dataset.option = option.id;
      if (option.id.startsWith('go:')) control.dataset.dest = option.id.slice(3);
      control.disabled = !option.enabled;
      control.title = [option.desc, ...option.locks].join(' ');
      control.setAttribute('aria-label', `${option.title}. ${control.title}`);
      control.append(el('strong', '', option.title), el('small', '',
        `비용 ${preview.cost}만 · 체력 ${preview.tire}${preview.chance === undefined ? '' : ` · 성공 ${preview.chance}%`}`));
      list.append(control);
    }
    if (!choices.length) {
      const node = WORLD.find(node => node.id === state.board.pos)!;
      list.append(el('strong', '', PLACES[node.place].name),
        el('p', '', offered[0]?.desc ?? state.log.at(-1)?.text ?? PHASE_LABEL[phase]));
    }
    const pager = el('div', 'life2-pager');
    const previous = button('이전', '', () => { page--; render(true); }, 'page-prev');
    const next = button('다음', '', () => { page++; render(true); }, 'page-next');
    previous.disabled = page === 0; next.disabled = page === pages - 1;
    pager.append(previous, el('span', '', `${page + 1} / ${pages}`), next);
    panel.append(heading, list, pager);
    shell.append(bands.top, board(state), panel, bands.bottom);
    root.replaceChildren(shell);
    if (focus) heading.focus({ preventScroll: true });
  }
  if (debug) window.__life = {
    state: () => structuredClone(state), options: () => options(state),
    load(raw) {
      const loaded = restore(raw);
      if (!loaded) throw new Error('Invalid life layout fixture');
      state = loaded; page = 0; render();
    },
  };
  render();
}
