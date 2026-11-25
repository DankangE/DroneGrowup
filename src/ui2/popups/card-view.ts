import { el } from '../../ui/dom.ts';
import { jobPortrait } from '../art.ts';
import { vectorArt } from '../art-svg.ts';
import { MOTION_ART } from '../motion-art.ts';
import { POLISH as P } from './polish-data.ts';
import type { DisplayRow, StageView } from './polish-model.ts';
import type { PopupModel } from './model.ts';

export function displayRows(rows: readonly DisplayRow[]) {
  const list = el('dl', 'life2-labelled-rows');
  for (const row of rows) {
    const item = el('div', 'life2-labelled-row');
    if (row.stat) { item.dataset.changedStat = row.stat; item.dataset.direction = row.direction; }
    item.append(el('dt', '', row.label), el('dd', '', row.value)); list.append(item);
  }
  return list;
}
export function stageBanner(stage: StageView) {
  const banner = el('div', 'life2-stage-banner'); banner.dataset.stageBanner = stage.name;
  const heading = el('div'); heading.append(el('strong', '', stage.name), el('span', '', P.remaining(stage.remaining)));
  const track = el('div', 'life2-stage-track'); track.setAttribute('role', 'progressbar');
  track.setAttribute('aria-label', P.flight); track.setAttribute('aria-valuemin', '0');
  track.setAttribute('aria-valuemax', String(stage.total)); track.setAttribute('aria-valuenow', String(stage.elapsed));
  const progress = el('div', 'life2-stage-progress'); progress.style.setProperty('--progress', `${stage.elapsed / stage.total * 100}%`);
  progress.append(vectorArt(MOTION_ART.drone, P.flight, 'life2-stage-drone')); track.append(progress); banner.append(heading, track);
  return banner;
}
export function cardHero(model: PopupModel) {
  const hero = el('div', 'life2-card-hero'); hero.dataset.card = model.kind;
  if (model.stage) hero.append(stageBanner(model.stage));
  const main = el('div', 'life2-card-heading');
  main.append(model.track ? jobPortrait(model.track) : vectorArt(MOTION_ART.drone, P.flight, 'life2-job-portrait'));
  const title = el('div'); title.append(el('strong', '', model.title));
  if (model.motion === 'rankup') {
    const burst = vectorArt(MOTION_ART.rays, model.title, 'life2-rank-rays'); burst.dataset.rankBurst = ''; main.append(burst);
  }
  main.append(title); hero.append(main); return hero;
}
