import { button, el } from '../../ui/dom.ts';
import { jobPortrait, placeArt } from '../art.ts';
import { COPY, PHONE_TABS } from './data.ts';
import type { PhoneTab } from './data.ts';
import { choicePage, shortTitle, textPages } from './model.ts';
import type { PopupModel } from './model.ts';
import { POPUP_STYLE } from './style.ts';
export { popupModel, popupKind, phoneChoices } from './model.ts';
export type { PopupContext, PopupModel } from './model.ts';
export type { PopupKind } from './data.ts';

export type PopupActions = {
  choose: (id: string) => void; dismiss: () => void;
  phoneTab?: (tab: PhoneTab) => PopupModel; returnFocus?: HTMLElement;
};

/** Mount in the shell's options slot; the caller owns choose(state, id) and subsequent rendering.
 * popupModel(state) handles current start/tile/event/job/bonus menus. For future engine views,
 * pass { kind, offered, previews, lines } explicitly; result views also accept choose().result.
 * Dismissal is presentation-only: the host must retain a way to reopen unresolved menus.
 * No speculative skip/promotion/review ids are sent to the engine.
 */
export function mountPopup(host: HTMLElement, initial: PopupModel, actions: PopupActions) {
  host.classList.add('life2-popup-host');
  let model = initial, page = 0, copyPage = 0, detail: string[] | undefined, tab: PhoneTab = 'all';
  let panel: HTMLElement, closed = false;
  const previousFocus = actions.returnFocus ?? (document.activeElement instanceof HTMLElement ? document.activeElement : undefined);
  function close() {
    if (closed) return;
    closed = true; host.replaceChildren(); previousFocus?.focus({ preventScroll: true }); actions.dismiss();
  }
  function render(focus = true) {
    panel = el('section', 'life2-popup'); panel.dataset.popup = model.kind; panel.dataset.phase = model.phase;
    panel.setAttribute('role', model.notification ? 'status' : 'dialog');
    panel.setAttribute('aria-label', model.title);
    if (model.fullscreen) panel.dataset.fullscreen = '';
    if (model.notification) panel.dataset.notification = '';
    if (detail) panel.dataset.details = '';
    const header = el('header', 'life2-popup-header'), title = el('h2', '', shortTitle(model.title));
    title.tabIndex = -1; title.title = model.title;
    header.append(title, button(COPY.exit, '', close, 'popup-close'));
    const copy = el('div', 'life2-popup-copy');
    const pages = textPages(detail ?? [model.title, ...model.lines]);
    copyPage = Math.min(copyPage, pages.length - 1);
    if (!detail) {
      if (model.roll) {
        const wheel = el('output', '', String(model.roll.value)); wheel.dataset.resultWheel = '';
        wheel.setAttribute('aria-label', `${model.roll.success ? COPY.success : COPY.fail} · ${COPY.roll(model.roll.value, model.roll.chance)}`);
        copy.append(wheel);
      } else copy.append(model.track && ['job', 'rankup', 'demotion', 'review'].includes(model.kind)
        ? jobPortrait(model.track) : placeArt(model.place));
    }
    const text = el('p', '', pages[copyPage]); text.setAttribute('aria-live', 'polite'); copy.append(text);
    if (pages.length > 1) copy.append(button(COPY.pages(copyPage, pages.length), '', () => {
      copyPage = (copyPage + 1) % pages.length; render();
    }, 'popup-text-next'));
    panel.append(header, copy);
    const footer = el('footer', 'life2-popup-footer');
    if (detail) {
      footer.append(button(COPY.back, '', () => { detail = undefined; copyPage = 0; render(); }, 'popup-back'));
    } else if (!model.notification) {
      const choices = choicePage(model.choices, page); page = choices.page;
      const list = el('div', 'life2-popup-list');
      for (const option of choices.items) {
        const row = el('div', 'life2-popup-row');
        const control = button('', 'life2-popup-choice', () => {
          if (!closed && option.enabled) actions.choose(option.id);
        });
        control.dataset.option = option.id; control.disabled = !option.enabled;
        control.setAttribute('aria-label', option.details.join('. '));
        control.append(el('strong', '', shortTitle(option.title)), el('small', '', option.summary));
        const info = button(COPY.details, '', () => { detail = option.details; copyPage = 0; render(); }, 'popup-details');
        info.setAttribute('aria-label', `${option.title} · ${COPY.details}`);
        row.append(control, info); list.append(row);
      }
      if (!choices.items.length) list.append(el('p', '', COPY.empty));
      panel.append(list);
      if (model.kind === 'phone' && actions.phoneTab) {
        footer.classList.add('life2-popup-tabs'); footer.setAttribute('role', 'tablist');
        for (const [id, label] of Object.entries(PHONE_TABS)) {
          const control = button(label, '', () => {
            tab = id as PhoneTab; model = actions.phoneTab!(tab); page = copyPage = 0; render();
          });
          control.dataset.tab = id; control.setAttribute('role', 'tab');
          control.setAttribute('aria-selected', String(id === tab)); footer.append(control);
        }
        // Phone categories must not displace the choice pager.
        header.insertBefore(button(COPY.pages(page, choices.count), '', () => {
          page = (page + 1) % choices.count; render();
        }, 'popup-page-next'), header.lastChild);
      } else {
        const previous = button(COPY.previous, '', () => { page--; render(); }, 'popup-page-prev');
        const next = button(COPY.next, '', () => { page++; render(); }, 'popup-page-next');
        previous.disabled = page === 0; next.disabled = page === choices.count - 1;
        footer.append(previous, el('span', '', COPY.pages(page, choices.count)), next);
      }
    }
    if (!model.notification) panel.append(footer);
    panel.addEventListener('keydown', event => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); }
      if (event.key !== 'Tab' || model.notification) return;
      const controls = [...panel.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];
      const first = controls[0], last = controls.at(-1);
      if (event.shiftKey && (document.activeElement === first || document.activeElement === title)) {
        event.preventDefault(); last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    });
    host.replaceChildren(el('style', '', POPUP_STYLE), panel);
    if (focus && !model.notification) (panel.querySelector('h2') ?? panel.querySelector('button'))?.focus({ preventScroll: true });
  }
  render();
  return { close, update(next: PopupModel) { if (!closed) { model = next; page = copyPage = 0; detail = undefined; render(); } } };
}
