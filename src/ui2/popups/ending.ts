import type { GameState } from '../../life/types.ts';
import { settlementSummary } from '../../life/engine.ts';
import { button, el } from '../../ui/dom.ts';
import { jobPortrait, placeArt } from '../art.ts';
import { COPY } from './data.ts';
import { ENDINGS2, ENDING_COPY as E, ENDING_STYLE } from './ending-data.ts';
import type { EndingCopy } from './ending-data.ts';
import { chapterLines } from './life-model.ts';
import type { LifeSummaryView } from './life-model.ts';
import { choicePage, textPages } from './model.ts';

export type EndingSummary = LifeSummaryView & { grade?: string; featScore?: number };
export type EndingCollection = { gallery: readonly string[]; bestByEnding?: Readonly<Record<string, number>> };
export type EndingActions = { title: () => void; restart: () => void; collection: () => void };

/** The selected ending and score are authoritative state fields, even for unusual fixtures. */
export function endingModel(state: GameState, summary: EndingSummary = {}) {
  const ending = ENDINGS2.find(row => row.id === state.ending);
  const details = { ...settlementSummary(state), ...summary };
  return { id: state.ending, title: ending?.title ?? state.ending ?? E.unknown, ending,
    lines: [E.score(state.score), E.grade(details.grade), E.feats(details.featScore),
      ...(ending ? [ending.text] : []), ...chapterLines(state, details)] };
}

export function collectionModel(meta: EndingCollection) {
  return ENDINGS2.map(ending => ({ ...ending, unlocked: meta.gallery.includes(ending.id),
    best: meta.bestByEnding?.[ending.id] }));
}

function art(ending: EndingCopy): HTMLElement {
  const holder = el('div', 'life2-ending-art'), asset = ending.art;
  if ('file' in asset) {
    const image = el('img'); image.src = `${import.meta.env?.BASE_URL ?? '/'}art/${asset.file}.webp`;
    image.alt = ending.title; holder.append(image);
  } else holder.append('track' in asset ? jobPortrait(asset.track) : placeArt(asset.place));
  return holder;
}

function pagedCopy(lines: readonly string[]) {
  const holder = el('div', 'life2-ending-copy'), pages = textPages(lines); let page = 0;
  const text = el('p', '', pages[0]); text.setAttribute('aria-live', 'polite'); holder.append(text);
  if (pages.length > 1) {
    const next = button(COPY.pages(page, pages.length), '', () => {
      page = (page + 1) % pages.length; text.textContent = pages[page]; next.textContent = COPY.pages(page, pages.length);
    }, 'ending-text-next');
    holder.append(next);
  }
  return holder;
}

function screen(host: HTMLElement, name: 'ending' | 'gallery', title: string, content: HTMLElement, controls: HTMLElement) {
  host.classList.add('life2'); host.dataset.screen = name; host.dataset.phase = 'chapter';
  const main = el('main', 'life2-ending-screen'), heading = el('h1', '', title); heading.tabIndex = -1;
  main.append(heading, content, controls); host.replaceChildren(el('style', '', ENDING_STYLE), main);
  heading.focus({ preventScroll: true });
}

function nav(label: string, id: string, callback: () => void) {
  const control = button(label, '', callback, id); control.dataset.nav = id; return control;
}

export function mountEnding(host: HTMLElement, state: GameState, actions: EndingActions, summary: EndingSummary = {}) {
  const model = endingModel(state, summary), content = el('section', 'life2-ending-content');
  content.dataset.ending = model.id ?? '';
  if (model.ending) content.append(art(model.ending));
  content.append(el('h2', '', model.title), pagedCopy(model.lines));
  const controls = el('nav', 'life2-ending-controls');
  controls.append(nav(E.home, 'title', actions.title), nav(E.gallery, 'gallery', actions.collection),
    nav(E.restart, 'restart', actions.restart));
  screen(host, 'ending', E.title, content, controls);
}

/** Twenty-one cards, three per page. Locked cards reveal only their discovery hint. */
export function mountEndingCollection(host: HTMLElement, meta: EndingCollection, onBack: () => void) {
  const rows = collectionModel(meta); let page = 0, selected: string | undefined;
  function render() {
    const content = el('section', 'life2-ending-content'), controls = el('nav', 'life2-ending-controls');
    const item = rows.find(row => row.id === selected);
    if (item) {
      content.dataset.ending = item.id;
      if (item.unlocked) content.append(art(item));
      content.append(el('h2', '', item.title), pagedCopy(item.unlocked
        ? [item.text, ...(item.best === undefined ? [] : [E.best(item.best)])] : [E.locked, item.hint]));
      controls.append(nav(COPY.back, 'gallery-back', () => { selected = undefined; render(); }));
    } else {
      content.append(el('p', '', E.count(rows.filter(row => row.unlocked).length, rows.length)));
      const cards = el('div', 'life2-ending-cards'), slice = choicePage(rows, page); page = slice.page;
      for (const ending of slice.items) {
        const control = button('', 'life2-ending-card', () => { selected = ending.id; render(); });
        control.dataset.pick = ending.id; control.dataset.ending = ending.id;
        control.dataset.unlocked = String(ending.unlocked);
        control.append(el('strong', '', ending.title), el('span', '', ending.unlocked ? E.discovered : E.locked));
        cards.append(control);
      }
      const pager = el('nav', 'life2-ending-pager');
      const previous = button(COPY.previous, '', () => { page--; render(); }, 'gallery-page-prev');
      const next = button(COPY.next, '', () => { page++; render(); }, 'gallery-page-next');
      previous.disabled = page === 0; next.disabled = page === slice.count - 1;
      pager.append(previous, el('span', '', COPY.pages(page, slice.count)), next); content.append(cards, pager);
    }
    controls.append(nav(COPY.exit, 'gallery-close', onBack));
    screen(host, 'gallery', E.gallery, content, controls);
  }
  render();
}
