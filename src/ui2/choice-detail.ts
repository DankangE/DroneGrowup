import { button, el, svg } from '../ui/dom.ts';
import type { PlaceId, TrackId } from '../life/types.ts';
import { TRACKS } from '../life/tracks.ts';
import { placeArt, placeAsset } from './art.ts';
import { NEW_JOB_PORTRAITS } from './job-portraits.ts';
import { vectorArt } from './art-svg.ts';
import { COPY } from './popups/data.ts';
import { textPages } from './popups/model.ts';
import type { PopupChoice } from './popups/model.ts';

export type DetailChoice = PopupChoice;
/** The complete copy stays in details; previews never rely on CSS clipping. */
export function choicePreview(text: string, limit: number): string {
  const pages = textPages([text], limit);
  return pages[0] + (pages.length > 1 ? '…' : '');
}
export function choiceDetail(place: PlaceId, track: TrackId | null = null, inline = false) {
  const pane = el('aside', 'life2-choice-detail');
  pane.setAttribute('aria-label', '선택 정보');
  if (inline) pane.dataset.inlineDetails = '';
  const scene = el('div', 'life2-choice-scene');
  const heading = el('h3'), metrics = el('div', 'life2-choice-metrics');
  const status = el('p', 'life2-choice-lock');
  const description = el('p', 'life2-selected-description');
  const outcomes = el('div', 'life2-choice-outcomes');
  outcomes.setAttribute('aria-label', COPY.expected);
  description.setAttribute('aria-live', 'polite');
  pane.append(scene, heading, metrics);
  if (inline) pane.append(description);
  pane.append(status);
  if (inline) pane.append(outcomes);
  let overflow = false;
  let moreButton: HTMLButtonElement | undefined;
  let extras: { node: HTMLElement; row: HTMLElement; marker: HTMLElement }[] = [];
  function preview(text: string, limit: number) {
    const short = choicePreview(text, limit);
    if (short !== text) overflow = true;
    return short;
  }
  /** Exceptionally large forecasts use the existing complete-text pager, never scrolling.
   * Keep every branch label and its first delta visible while trimming overflow only. */
  function fit() {
    if (!inline || !pane.clientHeight || !moreButton) return;
    while (pane.scrollHeight > pane.clientHeight + 1 && extras.length) {
      const largest = extras.reduce((a, b) => a.row.getBoundingClientRect().height >= b.row.getBoundingClientRect().height ? a : b);
      const extra = extras.filter(item => item.row === largest.row).at(-1)!;
      extra.node.remove(); extra.marker.textContent = '…';
      extras = extras.filter(item => item !== extra); overflow = true;
    }
    moreButton.textContent = overflow ? COPY.moreDetails : COPY.choiceDetails;
  }
  function update(choice: DetailChoice, more?: () => void) {
    overflow = false; extras = [];
    const candidate = choice.id.split(':')[1];
    const portrait = TRACKS.find(item => item.id === candidate)?.id ?? track;
    scene.replaceChildren(detailScene(place, portrait));
    heading.textContent = inline ? preview(choice.title, 48) : choice.title;
    heading.title = choice.title;
    metrics.replaceChildren(...(inline && choice.metrics ? choice.metrics : choice.summary.split(' · '))
      .map(value => el('span', /%/.test(value) ? 'life2-chance' : '', value)));
    status.textContent = choice.enabled ? '' : inline ? '' : choice.summary;
    status.hidden = choice.enabled;
    if (inline) {
      description.textContent = preview(choice.desc ?? choice.details[1] ?? choice.summary, 85);
      const locks = choice.enabled ? [] : choice.locks?.length ? choice.locks : [choice.summary];
      const lockMarker = el('span', 'life2-outcome-overflow');
      status.replaceChildren(...locks.map((lock, index) => {
        const node = el('span', '', preview(lock, 55));
        if (index) extras.push({ node, row: status, marker: lockMarker });
        return node;
      }), lockMarker);
      outcomes.replaceChildren(...(choice.outcomes ?? []).map(outcome => {
        const row = el('section', 'life2-choice-outcome');
        const label = el('strong', 'life2-outcome-label', outcome.label); label.dataset.tone = outcome.tone;
        const values = el('div', 'life2-outcome-values');
        const marker = el('span', 'life2-outcome-overflow');
        for (const [index, chip] of outcome.chips.entries()) {
          const node = el('span', 'life2-outcome-chip', chip.text); node.dataset.tone = chip.tone;
          values.append(node);
          if (index) extras.push({ node, row, marker });
        }
        if (!outcome.chips.length) values.append(el('span', 'life2-outcome-chip', COPY.noChange));
        const notes = el('div', 'life2-outcome-notes');
        row.append(label, values, notes);
        for (const note of outcome.notes) {
          const node = el('span', 'life2-outcome-note', preview(note, 110)); notes.append(node);
          extras.push({ node, row, marker });
        }
        values.append(marker);
        return row;
      }));
    }
    pane.querySelector('[data-action="popup-details"]')?.remove();
    moreButton = more ? button(overflow ? COPY.moreDetails : COPY.choiceDetails, '', more, 'popup-details') : undefined;
    if (moreButton) pane.append(moreButton);
    fit();
  }
  return { pane, scene, update, fit };
}

/** Highlight is presentation state only. Clicking the original option still chooses immediately. */
export function highlightChoices(list: HTMLElement, select: (id: string) => void) {
  const controls = [...list.querySelectorAll<HTMLButtonElement>('[data-option]')];
  // A locked page still needs a Tab entry point for arrow-key inspection.
  // Keep the original buttons disabled so inspection cannot choose an option.
  if (controls.length && controls.every(control => control.disabled)) list.setAttribute('tabindex', '0');
  const highlight = (control: HTMLButtonElement) => {
    for (const item of controls) item.setAttribute('aria-current', String(item === control));
    select(control.dataset.option!);
  };
  for (const control of controls) {
    const row = control.parentElement!;
    control.addEventListener('mouseenter', () => highlight(control));
    row.addEventListener('focus', () => highlight(control));
    control.addEventListener('focus', () => highlight(control));
  }
  list.addEventListener('keydown', event => {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const current = Math.max(0, controls.findIndex(item => item.getAttribute('aria-current') === 'true'));
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? controls.length - 1
      : (current + (event.key === 'ArrowDown' ? 1 : controls.length - 1)) % controls.length;
    const target = controls[next];
    if (!target) return;
    highlight(target);
    if (target.disabled) { target.parentElement!.tabIndex = -1; target.parentElement!.focus(); }
    else target.focus();
  });
  if (controls[0]) highlight(controls[0]);
}


/** One scene: the existing vector building and a transparent standing character. */
function detailScene(place: PlaceId, track: TrackId | null): SVGSVGElement | HTMLImageElement {
  const asset = placeAsset(place);
  if (asset.kind === 'raster') return placeArt(place);
  const scene = svg('svg', { viewBox:'0 0 640 360', preserveAspectRatio:'xMidYMid meet',
    class:'life2-place-art', role:'img', 'aria-label':'마을에서 만난 파일럿' });
  scene.dataset.placeArt = place;
  scene.append(svg('rect',{width:640,height:360,fill:'#64cfe4'}),
    svg('circle',{cx:530,cy:60,r:35,fill:'#fff2ad'}),
    svg('path',{d:'M0 190Q160 85 340 185T640 155V360H0Z',fill:'#8ad56b'}),
    svg('path',{d:'M0 280Q300 200 640 290V360H0Z',fill:'#e4d5a3'}));
  const building = vectorArt({...asset.drawing, paths:asset.drawing.paths.slice(3)}, '', 'life2-scene-building');
  building.setAttribute('x','35'); building.setAttribute('y','10');
  building.setAttribute('width','360'); building.setAttribute('height','315');
  scene.append(building);
  for(const x of [25,565,610]) scene.append(svg('path',{d:`M${x} 280v-75`,stroke:'#8e6742','stroke-width':12}),
    svg('circle',{cx:x,cy:190,r:34,fill:'#219e66'}),svg('circle',{cx:x-10,cy:178,r:25,fill:'#b1e965'}));
  if(track) {
    const portrait = NEW_JOB_PORTRAITS[track as keyof typeof NEW_JOB_PORTRAITS] ?? NEW_JOB_PORTRAITS.engineer;
    const person = svg('g', {transform:'translate(365 90) scale(1.55)'});
    scene.append(svg('ellipse',{cx:465,cy:337,rx:65,ry:12,fill:'#5d7358',opacity:.25}));
    person.append(svg('path',{d:'M43 116h41l-3 39H66l-3-27-4 27H44Z',fill:'#304d69',stroke:'#294657','stroke-width':2}),
      svg('path',{d:'M43 151h17v8H37q-3-8 6-8m23 0h17l7 8H66Z',fill:'#fff4d7',stroke:'#294657','stroke-width':2}));
    const bust = vectorArt({...portrait,paths:portrait.paths.slice(2)}, '', 'life2-scene-character');
    bust.dataset.jobPortrait = track;
    person.append(bust); scene.append(person);
  }
  return scene;
}
