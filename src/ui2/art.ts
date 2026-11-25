// v2 art entry points. Popup tickets can render these without importing v1 game state.
import type { PlaceId as V1PlaceId } from '../life/base-types.ts';
import type { PlaceId, TrackId } from '../life/types.ts';
import { PLACES } from '../life/world.ts';
import { el } from '../ui/dom.ts';
import type { VectorArt } from './art-svg.ts';
import { vectorArt } from './art-svg.ts';
import { JOB_NAMES, NEW_JOB_PORTRAITS } from './job-portraits.ts';
import { NEW_PLACE_TILES } from './place-tiles.ts';

export type LifeArt = { kind: 'vector'; drawing: VectorArt } | { kind: 'raster'; file: string };

// Existing locations retain their shipped scenes (§11.1); no assets are renamed or copied.
export const LEGACY_PLACE_SCENES: Record<V1PlaceId, string> = {
  home: 'scene-home', school: 'scene-school', airfield: 'scene-airfield', exam: 'scene-airfield',
  town: 'scene-town', shop: 'scene-shop', garage: 'scene-garage', bank: 'scene-bank',
  farm: 'scene-farm', site: 'scene-site', bridge: 'scene-bridge', windfarm: 'scene-windfarm',
  studio: 'scene-studio', coast: 'scene-coast', office: 'scene-solo', hq: 'scene-hq',
  academy: 'scene-academy', assoc: 'scene-assoc',
};
export const LEGACY_JOB_PORTRAITS: Record<Exclude<TrackId, keyof typeof NEW_JOB_PORTRAITS>, string> = {
  mechanic: 'portrait-mechanic', pilot: 'ending-pilot', employee: 'ending-employee',
  instructor: 'ending-instructor', solo: 'ending-solo', company: 'ending-ceo',
  academy: 'ending-academy', director: 'ending-director',
};

export function placeAsset(place: PlaceId): LifeArt {
  return place in NEW_PLACE_TILES
    ? { kind: 'vector', drawing: NEW_PLACE_TILES[place as keyof typeof NEW_PLACE_TILES] }
    : { kind: 'raster', file: LEGACY_PLACE_SCENES[place as V1PlaceId] };
}

export function jobAsset(track: TrackId): LifeArt {
  return track in NEW_JOB_PORTRAITS
    ? { kind: 'vector', drawing: NEW_JOB_PORTRAITS[track as keyof typeof NEW_JOB_PORTRAITS] }
    : { kind: 'raster', file: LEGACY_JOB_PORTRAITS[track as keyof typeof LEGACY_JOB_PORTRAITS] };
}

function renderArt(asset: LifeArt, label: string, className: string): SVGSVGElement | HTMLImageElement {
  if (asset.kind === 'vector') return vectorArt(asset.drawing, label, className);
  const image = el('img', className);
  image.src = `${import.meta.env?.BASE_URL ?? '/'}art/${asset.file}.webp`;
  image.alt = label;
  image.decoding = 'async';
  return image;
}

export function placeArt(place: PlaceId): SVGSVGElement | HTMLImageElement {
  const node = renderArt(placeAsset(place), PLACES[place].name, 'life2-place-art');
  node.dataset.placeArt = place;
  return node;
}

export function jobPortrait(track: TrackId): SVGSVGElement | HTMLImageElement {
  const node = renderArt(jobAsset(track), JOB_NAMES[track], 'life2-job-portrait');
  node.dataset.jobPortrait = track;
  return node;
}
