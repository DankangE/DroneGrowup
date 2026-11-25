// Repo-owned vector data only. No markup parsing, fonts, external images or SVG resource ids.
import { svg } from '../ui/dom.ts';

export type ArtPath = { d: string; fill: string; stroke?: string; width?: number };
export type VectorArt = { viewBox: string; paths: readonly ArtPath[] };
export const INK = '#3b5950';
export const path = (d: string, fill = 'none', stroke = INK, width = 2): ArtPath => ({ d, fill, stroke, width });

/** Labels are real text attributes; the drawing never contains generated lettering. */
export function vectorArt(art: VectorArt, label: string, className: string): SVGSVGElement {
  const node = svg('svg', { viewBox: art.viewBox, role: 'img', 'aria-label': label,
    width: 128, height: 128, focusable: 'false', class: className,
    'stroke-linecap': 'round', 'stroke-linejoin': 'round' });
  for (const part of art.paths) node.append(svg('path', {
    d: part.d, fill: part.fill, stroke: part.stroke ?? INK, 'stroke-width': part.width ?? 2,
  }));
  return node;
}
