// T21: original 24px line drawings; the eight existing kinds reuse v1's icon vocabulary.
import type { SpaceKind } from '../life/types.ts';
import { svg } from '../ui/dom.ts';
import { icon } from '../ui/icons.ts';
import type { IconName } from '../ui/icons.ts';

export const NEW_TILE_PATHS = {
  // Briefcase and two directions: employment / changing jobs.
  jobfair: 'M3 8h18v12H3zM8 8V4h8v4M3 12h18M6 16h5l-2-2m9 2h-5l2 2',
  // Two shopping bags, distinct from the owned storefront below.
  shop: 'M3 8h10l1 13H2zM6 8V6a2 2 0 0 1 4 0v2M15 10h6l1 11h-6M16 10V8a2 2 0 0 1 4 0v2',
  estate: 'M2 11 10 3l8 8M4 10v11h9M8 21v-7h4M20 14a3 3 0 1 1-6 0 3 3 0 0 1 6 0ZM17 17v5m0-2h3',
  life: 'M12 21 3 12C-1 5 8 1 12 7c4-6 13-2 9 5ZM7 13h3l2-4 2 7 2-3h3',
  biz: 'M3 9 5 3h14l2 6M3 9v3q2 3 5 0 4 3 8 0 3 3 5 0V9ZM4 14v7h16v-7M8 21v-6h5v6M9 3l-1 6m7-6 1 6',
  luck: 'M12 12C0 13 1 2 7 3c4 0 5 5 5 9Zm0 0c-1-12 10-11 9-5 0 4-5 5-9 5Zm0 0c12-1 11 10 5 9-4 0-5-5-5-9Zm0 0C0 11 1 22 7 21c4 0 5-5 5-9Zm0 0-2 10',
  station: 'M2 7h19l-4-4m4 4-4 4M22 17H3l4-4m-4 4 4 4M4 3v2m16 14v2',
  invest: 'M3 3v18h19M7 18v-4m5 4v-7m5 7V9M6 10l5-4 4 1 6-5m-5 0h5v5',
} as const satisfies Partial<Record<SpaceKind, string>>;

export type NewTileKind = keyof typeof NEW_TILE_PATHS;
export const LEGACY_TILE_ICONS: Record<Exclude<SpaceKind, NewTileKind>, IconName> = {
  start: 'flag', pay: 'coin', train: 'book', job: 'drone',
  contest: 'star', event: 'bolt', rest: 'sun', rankup: 'arrow',
};

/** Decorative: board.ts retains the visible Korean label and the tile's accessible name. */
export function tileIcon(kind: SpaceKind): SVGSVGElement {
  let node: SVGSVGElement;
  if (kind in NEW_TILE_PATHS) {
    node = svg('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor',
      'stroke-width': 1.7, 'stroke-linecap': 'round', 'stroke-linejoin': 'round',
      'aria-hidden': 'true', class: 'life2-glyph' });
    node.append(svg('path', { d: NEW_TILE_PATHS[kind as NewTileKind] }));
  } else {
    node = icon(LEGACY_TILE_ICONS[kind as keyof typeof LEGACY_TILE_ICONS], 'life2-glyph');
    if (kind === 'rankup') node.firstElementChild!.setAttribute('transform', 'rotate(-90 12 12)');
  }
  // Match the old glyph's 22px line box without changing shared styles or tile geometry.
  node.style.width = '22px';
  node.style.height = '22px';
  node.style.pointerEvents = 'none';
  node.setAttribute('focusable', 'false');
  node.dataset.tileIcon = kind;
  return node;
}
