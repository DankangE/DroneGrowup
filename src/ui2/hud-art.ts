import { path, vectorArt, type VectorArt } from './art-svg.ts';
import { svg } from '../ui/dom.ts';

// Original flight-jacket pilot: copper helmet, raised goggles and a radio collar.
// Paths only, no fonts, raster assets, resource IDs or network requests.
const PILOT: VectorArt = { viewBox: '0 0 64 64', paths: [
  path('M12 2h40q10 0 10 10v40q0 10-10 10H12Q2 62 2 52V12Q2 2 12 2Z', '#dcece9', '#527778'),
  path('M8 61v-6q2-13 17-15h14q15 2 17 15v6', '#426777', '#234554'),
  path('m25 40 7 10 7-10v-6H25Z', '#db9e78', '#684d42'),
  path('M17 23q0-16 15-16t15 16v7q-2 15-15 15T17 30Z', '#f0ba92', '#684d42'),
  path('M15 25v-7Q16 5 32 5t17 13v7l-7-5H22Z', '#bd7855', '#684d42'),
  path('M19 14h26v10H19Z', '#eaf6f3', '#234554'),
  path('M22 17h8v4h-8Zm12 0h8v4h-8Z', '#588f99', '#588f99', 1),
  path('M24 29v2m16-2v2m-12 6q4 3 8 0', 'none', '#684d42'),
  path('M15 25h4v10h-4Zm30 0h4v10h-4Z', '#426777', '#234554'),
  path('M48 34v5h-9', 'none', '#234554'),
  path('m20 46 6 10 6-6 6 6 6-10M32 51v10', 'none', '#b7d6cd'),
  path('M13 51h8v7h-8Zm33-4v10m-3-7h6', 'none', '#e6c38a'),
] };

export function pilotAvatar() {
  const avatar = vectorArt(PILOT, '고글과 무전기를 착용한 파일럿', 'life2-hud-avatar');
  avatar.dataset.hudAvatar = '';
  return avatar;
}

export function progressDrone() {
  const drone = svg('svg', { viewBox: '0 0 24 16', width: 18, height: 12,
    class: 'life2-progress-drone', 'aria-hidden': 'true', focusable: 'false',
    fill: '#fffaf0', stroke: '#234554', 'stroke-width': 1.5, 'stroke-linecap': 'round' });
  drone.append(svg('path', { d: 'm6 4 12 8M18 4 6 12M2 3h8m4 0h8M2 13h8m4 0h8' }),
    svg('path', { d: 'm9 5 3-2 3 2v6l-3 2-3-2Z', fill: '#c58259' }));
  return drone;
}
