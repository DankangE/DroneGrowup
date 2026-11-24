import { PLACES } from '../game/data.ts';
import type { PlaceId } from '../game/types.ts';
import { button, el, svg } from './dom.ts';


export const shortNames: Record<PlaceId, string> = {
  home: '자취방', school: '드론학과', airfield: '실습장', exam: '시험장', town: '시내', shop: '드론 상점',
  garage: '정비소', bank: '은행', farm: '농경지', site: '건설 현장', bridge: '대교', windfarm: '풍력 단지',
  studio: '촬영장', coast: '해안', office: '내 사무실', hq: '본사 사옥', academy: '교육원', assoc: '협회 회관',
};

const ink = '#3b5950';
type Group = SVGGElement;
function path(parent: SVGElement, d: string, fill = 'none', stroke = ink, width = 3) {
  parent.append(svg('path', { d, fill, stroke, 'stroke-width': width, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }));
}
function rect(parent: SVGElement, x: number, y: number, w: number, h: number, fill: string, radius = 3) {
  parent.append(svg('rect', { x, y, width: w, height: h, rx: radius, fill, stroke: ink, 'stroke-width': 2.5 }));
}
function circle(parent: SVGElement, x: number, y: number, r: number, fill: string, stroke = ink) {
  parent.append(svg('circle', { cx: x, cy: y, r, fill, stroke, 'stroke-width': 2.5 }));
}
function roof(parent: SVGElement, x: number, y: number, w: number, h: number, color: string) {
  rect(parent, x + 6, y + 7, w, h, '#91a28a');
  rect(parent, x, y, w, h, color);
  path(parent, `M${x + w / 2} ${y + 3}v${h - 6}`, 'none', '#ffffff66', 3);
  path(parent, `M${x + 3} ${y + 8}h${w - 6}M${x + 3} ${y + h - 8}h${w - 6}`, 'none', '#ffffff44', 2);
}

function building(id: PlaceId): Group {
  const group = svg('g', { class: `building building-${id}` });
  switch (id) {
    case 'school':
    case 'academy':
      rect(group, -49, -38, 98, 71, '#eee8ce', 6);
      rect(group, -22, -13, 45, 35, '#a4bd86');
      roof(group, -46, -38, 92, 25, id === 'school' ? '#d68c6f' : '#7aa49a');
      roof(group, -46, -17, 22, 46, id === 'school' ? '#d68c6f' : '#7aa49a');
      roof(group, 26, -17, 20, 46, id === 'school' ? '#d68c6f' : '#7aa49a');
      path(group, 'M-8 3H9M0-5v17', 'none', '#eae5c9', 3);
      break;
    case 'airfield':
    case 'exam':
      rect(group, -55, -34, 110, 66, '#aec496', 12);
      rect(group, -45, -18, 76, 32, '#7c8b7e');
      path(group, 'M-36-2h12m7 0h12m7 0h12', 'none', '#f8efd8', 3);
      path(group, 'M43 17v-41l21 6-21 6', '#db8763', ink, 2.5);
      if (id === 'exam') circle(group, -5, -2, 12, 'none', '#efe6cd');
      break;
    case 'windfarm':
      for (const [x, y] of [[-30, 0], [15, -19], [36, 18]]) {
        circle(group, x, y, 7, '#8aab7f', '#8aab7f');
        const blades = svg('g', { transform: `translate(${x} ${y})` });
        for (const angle of [0, 120, 240]) {
          const blade = svg('g', { transform: `rotate(${angle})` });
          path(blade, 'M0 0-3-29 3-24 4-3Z', '#fcf9e9', ink, 2);
          blades.append(blade);
        }
        circle(blades, 0, 0, 4, '#e8c68a');
        group.append(blades);
      }
      break;
    case 'farm':
      for (let i = 0; i < 3; i++) {
        rect(group, -44 + i * 30, -31, 26, 59, i === 1 ? '#c9ba77' : '#8faa6c');
        for (let j = 0; j < 5; j++) path(group, `M${-40 + i * 30} ${-23 + j * 10}h17`, 'none', '#e5daa1', 3);
      }
      roof(group, 36, -30, 20, 23, '#d78c6a');
      break;
    case 'bridge':
      rect(group, -41, -44, 82, 85, '#e0d7b9');
      rect(group, -27, -44, 54, 85, '#a1a49a');
      path(group, 'M0-36v13m0 10v13m0 10v13M-35-46v92M35-46v92', 'none', '#fbf3d9', 4);
      path(group, 'M-43-22h86M-43 26h86', 'none', ink, 5);
      break;
    case 'site':
      rect(group, -48, -37, 96, 70, '#d2bd91');
      rect(group, -31, -22, 48, 39, '#e5dbc1');
      path(group, 'M-31-2h48M-8-22v39', 'none', '#a4977b', 3);
      path(group, 'M28 30v-65M-23-28h81M28-35 55-28M28-35-20-28', 'none', '#b8793c', 5);
      circle(group, 28, -28, 5, '#eed18b');
      break;
    case 'coast':
      path(group, 'M-46-25q25-12 43 2t49 2', 'none', '#faf4de', 10);
      path(group, 'M-35 4q15-7 30 0m13 15q19-8 36 0', 'none', '#edf5df', 3);
      rect(group, -6, -38, 14, 39, '#e8b68b');
      path(group, 'M-23 12 0 6 23 12 0 23Z', '#fcf6dd', ink, 2);
      break;
    case 'bank':
    case 'assoc':
      rect(group, -41, -32, 82, 59, id === 'bank' ? '#e8cf92' : '#b9c8a5');
      for (let i = 0; i < 4; i++) rect(group, -30 + i * 18, 12, 9, 21, '#faf4db', 1);
      path(group, 'M-48-22 0-43 48-22Z', id === 'bank' ? '#e4bf76' : '#8faa85');
      rect(group, -43, 33, 86, 6, '#d6d0b5', 1);
      break;
    case 'shop':
      roof(group, -39, -29, 78, 50, '#e2b879');
      for (let i = 0; i < 6; i++) rect(group, -39 + i * 13, 14, 13, 16, i % 2 ? '#f3e8ce' : '#c7795c', 1);
      rect(group, -16, -20, 32, 25, '#f4e8c7');
      path(group, 'M-8-14 8-2M8-14-8-2', 'none', ink, 3);
      break;
    case 'garage':
      roof(group, -32, -28, 64, 51, '#8baca4');
      rect(group, -21, 9, 42, 18, '#e7e6d0');
      path(group, 'M-18 14h36m-36 6h36', 'none', '#8fa397', 2);
      circle(group, 18, -14, 7, '#dfe7d5');
      break;
    case 'hq':
      rect(group, -37, -44, 82, 85, '#8eaa9c', 6);
      roof(group, -42, -50, 78, 85, '#b0c8bc');
      rect(group, -29, -37, 52, 58, '#dce1ce');
      circle(group, -3, -7, 20, '#9aafa1');
      path(group, 'M-11-18v22M5-18v22M-11-7H5', 'none', '#f4eddb', 4);
      rect(group, 15, -42, 12, 12, '#7f9d8e');
      break;
    case 'studio':
      roof(group, -43, -30, 86, 57, '#a9a3ae');
      rect(group, -21, -17, 42, 29, '#dad2d0');
      path(group, 'M-11-9h15v16h-15Zm15 4 12-6V9L4 3Z', '#6f7e79');
      break;
    case 'town':
      roof(group, -42, -33, 35, 45, '#cd8c70');
      roof(group, 0, -38, 37, 42, '#d8bf7d');
      roof(group, -13, 9, 48, 25, '#8eaba3');
      rect(group, -34, -25, 15, 12, '#eedcba');
      break;
    case 'home':
    case 'office':
      roof(group, -34, -30, 68, 53, id === 'home' ? '#cb8b70' : '#90afa2');
      path(group, 'M-34-3h68M-34-30 0-3 34-30', 'none', '#f8e3bd', 2);
      rect(group, 15, -39, 11, 18, '#efdcbb');
      rect(group, -14, 21, 26, 12, '#e7d8b6');
      break;
  }
  return group;
}

function landscape(): SVGSVGElement {
  const art = svg('svg', { viewBox: '0 0 1000 1000', class: 'town-art', 'aria-hidden': 'true' });
  const defs = svg('defs');
  const pattern = svg('pattern', { id: 'map-grass', width: 42, height: 42, patternUnits: 'userSpaceOnUse' });
  path(pattern, 'M8 13l2-5m2 6 3-3M29 32l1-4', 'none', '#8ca47b', 1.5);
  defs.append(pattern);
  art.append(defs, svg('rect', { width: 1000, height: 1000, fill: '#d6dfba' }), svg('rect', { width: 1000, height: 1000, fill: 'url(#map-grass)', opacity: 0.35 }));
  path(art, 'M0 56Q125 5 218 43T422 34L440 0H0ZM0 350Q65 303 83 408T42 666L0 685Z', '#bccca6', 'none');
  path(art, 'M1000 570Q918 611 925 713T843 866Q804 926 820 1000H1000Z', '#e8d8af', 'none');
  path(art, 'M1000 603Q946 640 953 724T877 881Q837 936 852 1000H1000Z', '#a7cec5', 'none');
  path(art, 'M1000 680Q971 696 978 750T914 892M1000 834q-44 23-51 74m-44 65q29-42 65-40', 'none', '#dce9d3', 4);
  const river = 'M1020 438Q894 403 828 514T677 628Q568 598 551 721T404 894Q324 941 330 1030';
  path(art, river, 'none', '#c1d4b1', 82);
  path(art, river, 'none', '#a3c9bf', 66);
  path(art, river, 'none', '#c5e0cb', 3);
  const roads = ['M-20 360Q205 345 326 355T740 358Q816 360 980 230', 'M328-10Q304 198 328 355L365 580Q350 702 252 774L190 1010', 'M35 645 344 580 602 653 742 838 846 972', 'M116 841 252 774 441 712', 'M326 355 480 443 622 405 778 522', 'M421 163 527 262 640 145 739 243', 'M740 358 739 243 878 101'];
  for (const road of roads) path(art, road, 'none', '#b9bca1', 27);
  for (const road of roads) path(art, road, 'none', '#f2e9ce', 22);
  for (const road of roads) {
    art.append(svg('path', { d: road, fill: 'none', stroke: '#c8c3a9', 'stroke-width': 1.5, 'stroke-dasharray': '8 13' }));
  }
  for (const [x, y, s] of [[80, 120, 1.3], [120, 155, 1], [75, 230, 1], [260, 100, .8], [91, 420, 1], [125, 460, 1.2], [203, 450, .8], [210, 546, .8], [65, 730, 1.3], [215, 902, 1.2], [470, 890, 1.1], [490, 490, .8], [540, 530, 1.3], [610, 900, 1.2], [776, 932, 1], [935, 160, .8], [926, 353, 1.3], [707, 74, .8], [40, 910, 1.1], [452, 55, .8], [660, 503, 1], [726, 470, .7], [860, 610, 1]]) {
    const tree = svg('g', { transform: `translate(${x} ${y}) scale(${s})` });
    circle(tree, 5, 7, 21, '#a7bc91', 'none');
    path(tree, 'M0 29V-3', 'none', ink, 3);
    path(tree, 'M0-27Q-20-22-21-5T-1 12Q20 17 21-6T0-27Z', '#82a286', '#5c7d67', 2);
    path(tree, 'M0-16v23m0-7-8-6m8 0 8-7', 'none', '#a9c29b', 2);
    art.append(tree);
  }
  // Tiny cars, picnic blankets and crop rows make the map feel inhabited.
  rect(art, 263, 345, 25, 12, '#d59b73', 4);
  rect(art, 336, 489, 12, 25, '#6f9f9d', 4);
  rect(art, 691, 351, 23, 11, '#eee1ac', 4);
  for (let i = 0; i < 6; i++) path(art, `M${747 + i * 16} 55l-10 46`, 'none', '#b5bf8e', 6);
  return art;
}

export type Scene = { element: HTMLElement; move: (place: PlaceId) => void; select: (place: PlaceId | null) => void };

export function createScene(available: Set<PlaceId>, current: PlaceId, level: number, onPlace?: (id: PlaceId) => void): Scene {
  const element = el('div', 'scene');
  element.setAttribute('aria-label', '마을 비행 지도');
  const canvas = el('div', 'map-canvas');
  const art = landscape();
  art.setAttribute('preserveAspectRatio', 'none');
  canvas.append(art);
  const controls = new Map<PlaceId, HTMLButtonElement>();
  // Spread the landmarks over three flight lanes on a short phone map. Their
  // drawings keep their proportions while the terrain fills the available space.
  const lanes: PlaceId[][] = [
    ['school', 'airfield', 'academy', 'exam', 'assoc', 'windfarm'],
    ['bank', 'town', 'shop', 'garage', 'site', 'farm'],
    ['home', 'office', 'studio', 'bridge', 'hq', 'coast'],
  ];
  // Under a long choice summary use two lanes. Keep full touch widths for
  // active buildings and leave smaller plots for scenery-only landmarks.
  const byNorth = lanes.flat().sort((a, b) => PLACES[a].y - PLACES[b].y);
  const compact = new Map<PlaceId, { x: number; y: number; width: number }>();
  const activeIds = byNorth.filter(id => available.has(id));
  const scenery = byNorth.filter(id => !available.has(id));
  for (const lane of [0, 1]) {
    const half = (ids: PlaceId[]) => lane ? ids.slice(Math.ceil(ids.length / 2)) : ids.slice(0, Math.ceil(ids.length / 2));
    const sites = [...half(activeIds), ...half(scenery)].sort((a, b) => PLACES[a].x - PLACES[b].x);
    const width = (id: PlaceId) => available.has(id) ? 44 : 16;
    const total = sites.reduce((sum, id) => sum + width(id), 0);
    let left = 0;
    for (const id of sites) {
      const share = 100 * width(id) / total;
      compact.set(id, { x: left + share / 2, y: 25 + 50 * lane, width: share });
      left += share;
    }
  }
  function position(node: HTMLElement, id: PlaceId) {
    const plot = compact.get(id)!;
    node.style.setProperty('--cx', plot.x + '%');
    node.style.setProperty('--cy', plot.y + '%');
    node.style.setProperty('--cw', plot.width + '%');
    const row = lanes.findIndex(lane => lane.includes(id));
    node.style.setProperty('--x', PLACES[id].x + '%');
    node.style.setProperty('--y', PLACES[id].y + '%');
    node.style.setProperty('--mx', (lanes[row].indexOf(id) + .5) / 6 * 100 + '%');
    node.style.setProperty('--my', (row + .5) / 3 * 100 + '%');
  }
  for (const id of Object.keys(PLACES) as PlaceId[]) {
    const active = available.has(id) && !!onPlace;
    const site = active ? button('', 'map-place available', () => onPlace(id)) : el('div', 'map-place');
    position(site, id);
    const drawing = svg('svg', { viewBox: '-68 -54 136 108', class: 'landmark', 'aria-hidden': 'true' });
    drawing.append(building(id));
    site.append(drawing);
    if (site instanceof HTMLButtonElement) {
      site.setAttribute('aria-label', PLACES[id].name + ' 선택지 보기');
      site.append(el('span', 'place-label', shortNames[id]));
      controls.set(id, site);
    }
    canvas.append(site);
  }
  const drone = el('div', 'drone-position');
  drone.setAttribute('aria-hidden', 'true');
  const droneArt = svg('svg', { viewBox: '0 0 100 100', class: 'player-drone' });
  const droneBody = svg('g', { class: 'drone-hover' });
  path(droneBody, 'M25 25 75 75M75 25 25 75', 'none', '#264e42', 8);
  for (const [x, y] of [[25, 25], [75, 25], [25, 75], [75, 75]]) {
    circle(droneBody, x, y, 16, '#f5f1dd', '#33584c');
    const rotor = svg('g', { class: 'rotor', style: `transform-origin: ${x}px ${y}px` });
    path(rotor, `M${x - 12} ${y}q12-9 24 0-12 9-24 0Z`, '#658a79', 'none');
    droneBody.append(rotor);
    circle(droneBody, x, y, 3, '#d7a75a');
  }
  rect(droneBody, 37, 32, 26, 37, '#fffbed', 9);
  rect(droneBody, 43, 36, 14, 12, '#d8b46a', 4);
  circle(droneBody, 50, 61, 4, '#537c72');
  if (level > 0) rect(droneBody, 36, 53, 28, 8, '#e8a14a');
  if (level >= 2) circle(droneBody, 50, 65, 8, '#71bdb7');
  if (level >= 3) path(droneBody, 'M32 39v24m36-24v24', 'none', '#284c48', 5);
  if (level >= 4) rect(droneBody, 42, 27, 16, 9, '#e37943');
  drone.style.setProperty('--drone-scale', String(1 + .13 * level));
  droneArt.append(droneBody);
  drone.append(droneArt);
  canvas.append(drone);
  element.append(canvas);
  const move = (place: PlaceId) => position(drone, place);
  move(current);
  return { element, move, select: place => {
    controls.forEach((target, id) => {
      target.classList.toggle('selected', id === place);
      target.setAttribute('aria-pressed', String(id === place));
    });
  } };
}
