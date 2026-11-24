import { svg } from './dom.ts';

export type IconName = 'drone' | 'map' | 'bag' | 'book' | 'home' | 'arrow' | 'star' | 'coin' | 'bolt' | 'close' | 'check' | 'lock' | 'flag' | 'tool' | 'bank' | 'car' | 'sun';

const paths: Record<IconName, string> = {
  drone: 'M8 8 16 16M16 8 8 16M9 10h6v5H9zM7 4a3 3 0 1 0 0 6 3 3 0 0 0 0-6M17 4a3 3 0 1 0 0 6 3 3 0 0 0 0-6M7 14a3 3 0 1 0 0 6 3 3 0 0 0 0-6M17 14a3 3 0 1 0 0 6 3 3 0 0 0 0-6',
  map: 'm3 5 6-2 6 2 6-2v16l-6 2-6-2-6 2V5Zm6-2v16m6-14v16',
  bag: 'M5 7h14l1 14H4L5 7Zm3 0V6a4 4 0 0 1 8 0v1',
  book: 'M12 5C9 2 5 3 3 4v16c3-1 6-1 9 1 3-2 6-2 9-1V4c-3-1-6-1-9 1Zm0 0v16',
  home: 'm3 11 9-8 9 8M5 10v11h14V10M9 21v-7h6v7',
  arrow: 'M4 12h16m-6-6 6 6-6 6',
  star: 'm12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9L12 3Z',
  coin: 'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0ZM8 9l2 7 2-5 2 5 2-7M7 12h10',
  bolt: 'm13 2-9 12h7l-1 8 10-13h-8l1-7Z',
  close: 'm6 6 12 12M18 6 6 18',
  check: 'm5 12 4 4L19 6',
  lock: 'M6 10h12v11H6V10Zm3 0V6a3 3 0 0 1 6 0v4m-3 4v3',
  flag: 'M5 22V3c5-4 9 4 14 0v11c-5 4-9-4-14 0',
  tool: 'm14 6 4 4 4-4a7 7 0 0 1-9 9l-6 6-4-4 6-6a7 7 0 0 1 9-9l-4 4Z',
  bank: 'm3 8 9-5 9 5H3Zm2 3v7m7-7v7m7-7v7M3 21h18M3 18h18',
  car: 'm5 8 2-5h10l2 5M3 9h18v9H3V9Zm2 9v3m14-3v3M6 13h2m8 0h2',
  sun: 'M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0ZM12 2v2m0 16v2M2 12h2m16 0h2M5 5l1 1m12 12 1 1M5 19l1-1M18 6l1-1',
};

export function icon(name: IconName, className = ''): SVGSVGElement {
  const node = svg('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': 1.7, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true', class: `icon ${className}` });
  node.append(svg('path', { d: paths[name] }));
  return node;
}
