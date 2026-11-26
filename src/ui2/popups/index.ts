import { tileIcon } from '../icons.ts';
import { choiceDetail, highlightChoices } from '../choice-detail.ts';
import { button, el } from '../../ui/dom.ts';
import { jobPortrait, placeArt } from '../art.ts';
import { COPY, PHONE_TABS, POPUP_RULES, SETTINGS_COPY } from './data.ts';
import type { LifeTab, PhoneTab } from './data.ts';
import { choicePage, shortTitle, textPages } from './model.ts';
import type { PopupModel } from './model.ts';
import { placePopupSheet, sheetSpace } from './presentation.ts';
import { cardHero, displayRows, stageBanner } from './card-view.ts';
import { itemPages, labelledRows } from './polish-model.ts';
import { POLISH as P } from './polish-data.ts';
import { POLISH_STYLE } from './polish-style.ts';
import { POPUP_STYLE } from './style.ts';
export { popupModel, popupKind, phoneChoices } from './model.ts';
export type { PopupContext, PopupModel } from './model.ts';
export type { PopupKind } from './data.ts';
export type { LifeSummaryView } from './life-model.ts';
export { mountEnding, mountEndingCollection, endingModel, collectionModel } from './ending.ts';

export type PopupActions = {
  choose: (id: string) => void; dismiss: () => void;
  phoneTab?: (tab: PhoneTab) => PopupModel; returnFocus?: HTMLElement; navigation?: HTMLElement;
  settings?: { tilt: () => boolean; toggleTilt: () => void };
};

/** Mount in the shell's options slot; the caller owns choose(state, id) and subsequent rendering.
 * popupModel(state) handles current start/tile/event/job/bonus menus. For future engine views,
 * pass { kind, offered, previews, lines } explicitly; result views also accept choose().result.
 * Dismissal is presentation-only: the host must retain a way to reopen unresolved menus.
 * No speculative skip/promotion/review ids are sent to the engine.
 */
export function mountPopup(host: HTMLElement, initial: PopupModel, actions: PopupActions) {
  host.classList.add('life2-popup-host');
  // Apply the popup shell geometry before measuring compact mode, so the first
  // page and later pages use the same available space and choice page size.
  const style = el('style', '', POPUP_STYLE + POLISH_STYLE); host.append(style);
  let model = initial, page = 0, copyPage = 0, detail: string[] | undefined, tab: PhoneTab = 'all';
  let lifeTab: LifeTab = 'ability', confirming: string | undefined, motionSkipped = false;
  const stopMotion = () => { if (!panel?.dataset.animating) return false; delete panel.dataset.animating; motionSkipped = true; return true; };
  let panel: HTMLElement, closed = false;
  const previousFocus = actions.returnFocus ?? (document.activeElement instanceof HTMLElement ? document.activeElement : undefined);
  function close() {
    if (closed) return;
    closed = true; actions.navigation?.removeEventListener?.('keydown', handleKeys); host.replaceChildren(); previousFocus?.focus({ preventScroll: true }); actions.dismiss();
  }
  function render(focus = true) {
    const space = sheetSpace(host) ?? Infinity;
    const compact = !model.fullscreen && space < 390;
    const tight = compact && space < 260;
    panel = el('section', 'life2-popup');
    if (compact) panel.dataset.compact = ''; panel.dataset.popup = model.kind; panel.dataset.phase = model.phase;
    if (tight) panel.dataset.tight = '';
    panel.setAttribute('role', model.notification ? 'status' : 'dialog');
    panel.setAttribute('aria-label', model.title);
    if (model.fullscreen) panel.dataset.fullscreen = '';
    if (model.notification) panel.dataset.notification = '';
    if (model.presentation) panel.dataset.presentation = '';
    if (detail || confirming) panel.dataset.details = '';
    if (confirming) panel.dataset.confirm = confirming === 'quit' ? 'quit' : 'retire';
    const card = model.fullscreen && !detail && !confirming;
    if (card) panel.dataset.card = model.kind;
    if (model.motion && !motionSkipped) {
      panel.dataset.motion = model.motion;
      if (typeof window !== 'undefined' && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) panel.dataset.animating = 'true';
    }
    panel.addEventListener('animationend', event => {
      if (['life2-rank-burst', 'life2-rank-drop', 'life2-drone-arrival'].includes(event.animationName)) stopMotion();
    });
    panel.addEventListener('click', () => { stopMotion(); });
    const header = el('header', 'life2-popup-header'), title = el('h2', '', shortTitle(confirming ? confirming === 'quit' ? COPY.quitTitle : P.retireTitle : model.title));
    title.tabIndex = -1; title.title = model.title;
    header.append(title, button(COPY.exit, '', close, 'popup-close'));
    const copy = el('div', 'life2-popup-copy');
    const selectedTab = model.tabs?.find(item => item.id === lifeTab) ?? model.tabs?.[0];
    const reading = !model.choices.length;
    if (reading && !detail && !confirming) panel.dataset.reading = '';
    const structured = !detail && !confirming && (model.rows || selectedTab || model.accounting);
    const summary = structured && (selectedTab?.id === 'ability' || model.kind === 'result');
    if (summary) panel.dataset.summary = '';
    const rows = selectedTab ? labelledRows(selectedTab.lines) : (card && model.kind !== 'chapter') || model.kind === 'result'
      ? [...(model.rows ?? []), ...labelledRows(model.lines)] : [...labelledRows(model.lines), ...(model.rows ?? [])];
    const rowLimit = summary ? tight ? 36 : 60 : tight ? 45 : P.rowLimit;
    const rowCount = summary ? !reading ? 1 : selectedTab?.id === 'ability' && !compact ? 11 : tight && model.roll ? 2 : 3
      : model.roll || compact ? 1 : card && !reading ? 2 : P.rowCount;
    const rowPages: { rows: typeof rows; heading?: string }[] = itemPages(rows.flatMap(row => textPages([row.value], rowLimit)
      .map(value => ({ ...row, value }))), row => row.label.length + row.value.length,
      summary ? rowCount * rowLimit : card ? 150 : model.roll ? 70 : P.rowLimit, rowCount).map(rows => ({ rows }));
    if (model.accounting && !selectedTab) {
      const accounts = model.accounting.flatMap(section =>
        itemPages([{ label: P.timing, value: section.timing }, ...section.rows].flatMap(row =>
          textPages([row.value], rowLimit).map(value => ({ ...row, value }))), row => row.label.length + row.value.length,
        P.rowLimit, tight ? 1 : P.rowCount).map(rows => ({ rows, heading: section.title })));
      // A review or luck card leads with its decision/story; ordinary results lead with payment timing.
      if (model.kind === 'result') rowPages.unshift(...accounts); else rowPages.push(...accounts);
    }
    const pages = structured ? rowPages : textPages(confirming ? [confirming === 'quit' ? COPY.quitQuestion : P.retireQuestion]
      : detail ?? model.lines, compact ? reading || detail || confirming ? tight ? 45 : 90 : tight ? 16 : 24 : model.notification || (reading && model.roll) ? POPUP_RULES.resultPage
        : reading || detail ? POPUP_RULES.readingPage : P.choiceTextPage);
    copyPage = Math.min(copyPage, pages.length - 1);
    if (!detail && !confirming) {
      if (model.roll) {
        const wheel = el('output', '', String(model.roll.value)); wheel.dataset.resultWheel = '';
        wheel.setAttribute('aria-label', `${model.roll.success ? COPY.success : COPY.fail} · ${COPY.roll(model.roll.value, model.roll.chance)}`);
        copy.append(wheel);
      } else if (model.kind === 'luck') copy.append(tileIcon('luck'));
      else if (!reading && !card) copy.append(model.track && ['job', 'review'].includes(model.kind)
        ? jobPortrait(model.track) : placeArt(model.place));
    }
    if (selectedTab?.id === 'settings' && actions.settings) {
      const settings = actions.settings;
      const toggle = button('', '', () => {
        settings.toggleTilt(); render(false);
        panel.querySelector<HTMLElement>('[data-action="toggle-tilt"]')?.focus({ preventScroll: true });
      }, 'toggle-tilt');
      toggle.setAttribute('role', 'switch'); toggle.setAttribute('aria-checked', String(settings.tilt()));
      toggle.setAttribute('aria-label', SETTINGS_COPY.tilt);
      toggle.textContent = `${SETTINGS_COPY.tilt} · ${settings.tilt() ? SETTINGS_COPY.on : SETTINGS_COPY.off}`;
      copy.append(toggle);
    } else if (structured) {
      const current = rowPages[copyPage];
      if (current.heading) {
        const section = el('section', 'life2-accounting'); section.dataset.accounting = '';
        section.append(el('h3', '', current.heading), displayRows(current.rows)); copy.append(section);
      } else copy.append(displayRows(current.rows));
    }
    else {
      const text = el('p', '', (pages as string[])[copyPage]); text.setAttribute('aria-live', 'polite'); copy.append(text);
    }
    if (pages.length > 1) {
      const nextText = button(COPY.pages(copyPage, pages.length), '', () => {
        copyPage = (copyPage + 1) % pages.length; render();
      }, 'popup-text-next');
      if (tight) header.insertBefore(nextText, header.lastChild); else copy.append(nextText);
    }
    panel.append(header);
    if (card && reading) panel.append(cardHero(model));
    else if (model.stage && !detail && !confirming) { panel.append(stageBanner(model.stage)); panel.dataset.stage = ''; }
    panel.append(copy);
    const footer = el('footer', 'life2-popup-footer');
    if (confirming) {
      footer.append(button(COPY.cancel, '', () => { confirming = undefined; render(); }, 'popup-cancel'),
        button(confirming === 'quit' ? COPY.quitConfirm : P.retireConfirm, '', () => {
          if (!closed && confirming) { const id = confirming; confirming = undefined; actions.choose(id); }
        }, 'popup-confirm'));
    } else if (detail) {
      footer.append(button(COPY.back, '', () => { detail = undefined; copyPage = 0; render(); }, 'popup-back'));
    } else if (!model.notification) {
      const choices = choicePage(model.choices, page, compact ? 1 : 6); page = choices.page;
      const list = el('div', 'life2-popup-list');
      const inspector = choiceDetail(model.place, model.track);
      for (const option of choices.items) {
        const row = el('div', 'life2-popup-row');
        const control = button('', 'life2-popup-choice', () => {
          if (closed || !option.enabled) return;
          if (/^(quit|phone:retire|early-retire|retire:early)$/.test(option.id)) { confirming = option.id; copyPage = 0; render(); }
          else actions.choose(option.id);
        });
        control.dataset.option = option.id; control.disabled = !option.enabled;
        if (option.destination) control.dataset.dest = option.destination;
        control.setAttribute('aria-label', option.details.join('. '));
        control.append(el('strong', '', shortTitle(option.title)), el('small', '', option.summary));
        row.append(control); list.append(row);
      }
      if (!reading) {
        panel.append(list, inspector.pane);
        const description = el('p', 'life2-selected-description');
        description.setAttribute('aria-live', 'polite'); copy.append(description);
        highlightChoices(list, id => {
          const option = choices.items.find(item => item.id === id)!;
          inspector.update(option, () => { detail = option.details; copyPage = 0; render(); });
          description.textContent = textPages([option.details[1] ?? option.summary], 85)[0];
        });
      }
      if (selectedTab) {
        copy.dataset.tabPanel = selectedTab.id; copy.setAttribute('role', 'tabpanel');
        copy.setAttribute('aria-label', selectedTab.title);
        footer.classList.add('life2-popup-tabs'); footer.setAttribute('role', 'tablist');
        for (const item of model.tabs!) {
          const control = button(item.title, '', () => { lifeTab = item.id; copyPage = 0; render(); });
          control.dataset.tab = item.id; control.setAttribute('role', 'tab');
          control.setAttribute('aria-selected', String(item.id === selectedTab.id)); footer.append(control);
        }
        if (choices.count > 1) header.insertBefore(button(COPY.pages(page, choices.count), '', () => {
          page = (page + 1) % choices.count; render();
        }, 'popup-page-next'), header.lastChild);
      } else if (model.kind === 'phone' && actions.phoneTab) {
        footer.classList.add('life2-popup-tabs'); footer.setAttribute('role', 'tablist');
        for (const [id, label] of Object.entries(PHONE_TABS)) {
          const control = button(label, '', () => {
            tab = id as PhoneTab; model = actions.phoneTab!(tab); page = copyPage = 0; render();
          });
          control.dataset.tab = id; control.setAttribute('role', 'tab');
          control.setAttribute('aria-selected', String(id === tab)); footer.append(control);
        }
        // Phone categories must not displace the choice pager.
        const pageControl = button(COPY.pages(page, choices.count), '', () => {
          page = (page + 1) % choices.count; render();
        }, 'popup-page-next');
        if (choices.count === 1) pageControl.dataset.singlePage = '';
        header.insertBefore(pageControl, header.lastChild);
      } else if (reading) {
        footer.append(button(COPY.exit, '', close, 'popup-continue'));
      } else {
        const previous = button(COPY.previous, '', () => { page--; render(); }, 'popup-page-prev');
        const next = button(COPY.next, '', () => { page++; render(); }, 'popup-page-next');
        previous.disabled = page === 0; next.disabled = page === choices.count - 1;
        footer.append(previous, el('span', '', COPY.pages(page, choices.count)), next);
        if (choices.count === 1) footer.dataset.singlePage = '';
      }
    }
    if (model.kind === 'my-life' && selectedTab?.id === 'ability' && !detail && !confirming) {
      panel.dataset.overview = '';
      const overview = el('aside', 'life2-life-overview');
      for (const id of ['career', 'family', 'assets']) {
        const section = model.tabs?.find(item => item.id === id);
        if (!section) continue;
        const column = el('section', 'life2-life-column');
        column.append(el('h3', '', section.title));
        for (const line of section.lines.slice(0, 3)) column.append(el('p', '', line));
        overview.append(column);
      }
      panel.append(overview);
    }
    if ((reading && model.kind !== 'my-life') || detail || confirming) {
      if (!card) {
        const scene = choiceDetail(model.place, model.track);
        scene.update({ id: model.kind, title: model.title, summary: '', details: [], enabled: true });
        const resultWheel = copy.querySelector<HTMLElement>('[data-result-wheel]');
        if (resultWheel) scene.scene.append(resultWheel);
        panel.append(scene.pane);
      }
    }
    if (!model.notification) panel.append(footer);
    panel.addEventListener('keydown', handleKeys);
    host.replaceChildren(style, panel);
    placePopupSheet(host, panel);
    if (focus && !model.notification) (panel.querySelector('h2') ?? panel.querySelector('button'))?.focus({ preventScroll: true });
  }
  function handleKeys(event: KeyboardEvent) {
    if (closed) return;
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation();
      if (stopMotion()) return;
      if (confirming) { confirming = undefined; render(); } else close(); }
    if (event.key !== 'Tab' || model.notification) return;
    const controls = [...panel.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'),
      ...(actions.navigation?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? [])];
    const first = controls[0], last = controls.at(-1);
    if (event.shiftKey && (document.activeElement === first || document.activeElement === panel.querySelector('h2'))) {
      event.preventDefault(); last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  }
  actions.navigation?.addEventListener('keydown', handleKeys);
  render();
  return { close, update(next: PopupModel) { if (!closed) { model = next; page = copyPage = 0; detail = undefined; confirming = undefined; render(); } } };
}
