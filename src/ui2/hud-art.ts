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
  path('m22 46 10 6 10-6M32 52v9', 'none', '#b7d6cd', 3),
] };

export function pilotAvatar() {
  const avatar = vectorArt(PILOT, '고글과 무전기를 착용한 파일럿', 'life2-hud-avatar');
  avatar.dataset.hudAvatar = '';
  return avatar;
}

export function progressDrone() {
  // Front-on courier: two broad rotors, a bright cargo body and one landing skid.
  const drone = svg('svg', { viewBox: '0 0 28 18', width: 28, height: 18,
    class: 'life2-progress-drone', 'aria-hidden': 'true', focusable: 'false',
    fill: '#ffdc68', stroke: '#102c40', 'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' });
  drone.append(svg('path', { d: 'M2 3h8m8 0h8M6 3v5h16V3', fill: 'none' }),
    svg('path', { d: 'M9 6h10v7H9ZM10 14v2h8v-2' }),
    svg('path', { d: 'M12 9h4', stroke: '#102c40' }));
  return drone;
}

export function creditCoin() {
  const coin = svg('svg', { viewBox: '0 0 20 20', width: 16, height: 16,
    class: 'life2-credit-coin', 'aria-hidden': 'true', focusable: 'false' });
  coin.append(svg('path', { d: 'M10 1a9 9 0 1 1 0 18 9 9 0 0 1 0-18Z',
    fill: '#ffdc68', stroke: '#9b641e', 'stroke-width': 1.5 }),
  svg('path', { d: 'M4 6h4m4 0h4M6 6v4h8V6M8 9h4v5H8Z',
    fill: '#fff1b6', stroke: '#66431c', 'stroke-width': 1.5, 'stroke-linecap': 'round' }));
  return coin;
}
