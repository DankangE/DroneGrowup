import { svg } from '../ui/dom.ts';

// Original vector town. All coordinates are presentation-only; WORLD owns the route.
const PALETTES = [
  ['#80d64b', '#b4ed70', '#ff6d64', '#32b9e8'],
  ['#60cba4', '#9fe5bf', '#f763a4', '#7568ee'],
  ['#9cc94b', '#d9e779', '#f39638', '#318ed7'],
  ['#62c3bb', '#b0e7c1', '#7957dc', '#30c9e3'],
  ['#49b777', '#a4dd76', '#ffb52e', '#ed6aa0'],
  ['#d2d26a', '#f1e6a0', '#f47556', '#29abc4'],
];
export function townScene(map = 'A', className = 'life2-town'): SVGSVGElement {
  const index = Math.max(0, 'ABCDEF'.indexOf(map));
  const [grass, light, roof, accent] = PALETTES[index];
  const scene = svg('svg', { viewBox: '0 0 1600 900', preserveAspectRatio: 'xMidYMid slice', class: className, 'aria-hidden': 'true' });
  const add = <K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>, parent: SVGElement = scene) => {
    const node = svg(tag, attrs); parent.append(node); return node;
  };
  add('rect', { width: 1600, height: 900, fill: grass });
  for (let n = 0; n < 100; n++) add('path', { d: `M${(n * 173) % 1600} ${(n * 89) % 900}l8 -4 8 4 -8 4z`, fill: light, opacity: .55 });
  // Broad town avenues, with curb shoulders and interrupted lane paint.
  for (const d of ['M-80 170L1660 70', 'M-60 810L1660 790', 'M230 -90L390 990', 'M1490 -60L1540 960', 'M320 490L1660 470']) {
    add('path', { d, fill: 'none', stroke: '#e6ecce', 'stroke-width': 67 });
    add('path', { d, fill: 'none', stroke: '#476477', 'stroke-width': 54 });
    add('path', { d, fill: 'none', stroke: '#fff8c4', 'stroke-width': 3, 'stroke-dasharray': '24 23' });
  }
  add('ellipse', { cx: 1100, cy: 365, rx: 176, ry: 65, fill: '#e7f4ac' });
  add('ellipse', { cx: 1100, cy: 358, rx: 160, ry: 53, fill: '#22bcdb' });
  for (let n = 0; n < 6; n++) add('path', { d: `M${990+n*31} ${340+n%2*20}q16 -6 30 0`, stroke: '#b7fcff', 'stroke-width': 3, fill: 'none' });
  const tree = (x: number, y: number, pink = false, scale = 1) => {
    const g = add('g', { transform: `translate(${x} ${y}) scale(${scale})` });
    add('ellipse', { cx: 10, cy: 20, rx: 30, ry: 10, fill: '#24674d', opacity: .22 }, g);
    add('path', { d: 'M-5 20L-3 -23H7L9 20Z', fill: '#9a663c' }, g);
    add('circle', { cy: -31, r: 27, fill: pink ? '#d648a0' : '#209d55' }, g);
    add('circle', { cx: -11, cy: -38, r: 21, fill: pink ? '#ff83c8' : '#51ce65' }, g);
    add('circle', { cx: 10, cy: -46, r: 22, fill: pink ? '#ffa9dd' : '#89e55b' }, g);
  };
  const building = (x: number, y: number, w: number, h: number, colour: string) => {
    const g = add('g', { transform: `translate(${x} ${y})` });
    add('ellipse', { cx: w/2+18, cy: 12, rx: w*.7, ry: 22, fill: '#27644c', opacity: .22 }, g);
    add('path', { d: `M0 0V-${h}H${w}V0Z`, fill: '#fff4d0', stroke: '#38616d', 'stroke-width': 2 }, g);
    add('path', { d: `M${w} 0l26 -20V-${h+20}l-26 20Z`, fill: '#dfb985' }, g);
    add('path', { d: `M-12 -${h}L${w/2} -${h+43}L${w+13} -${h}Z`, fill: colour, stroke: '#fff6cf', 'stroke-width': 3 }, g);
    add('path', { d: `M${w/2} -${h+43}l26 -18 ${w/2+13} 43 -26 18Z`, fill: colour, opacity: .8 }, g);
    for (let row = 0; row < Math.max(1, Math.floor(h/45)); row++) for (let col = 0; col < 3; col++) {
      add('rect', { x: 10+col*(w-20)/3, y: -h+15+row*36, width: (w-35)/3, height: 20, rx: 3, fill: '#4dbbde', stroke: '#fff', 'stroke-width': 3 }, g);
    }
    add('rect', { x: w/2-10, y: -30, width: 20, height: 30, rx: 3, fill: '#366279' }, g);
  };
  // Infield neighbourhoods: skyline, drone hangars and a waterfront garden.
  building(640, 382, 95, 89, roof); building(790, 404, 100, 125, accent);
  building(1245, 390, 105, 80, roof); building(1350, 431, 70, 130, accent);
  building(690, 685, 115, 85, accent); building(870, 695, 85, 110, roof);
  building(1110, 680, 130, 95, roof); building(1315, 703, 75, 70, accent);
  building(45, 365, 115, 110, roof); building(130, 550, 90, 85, accent);
  building(510, 165, 110, 90, roof); building(1010, 160, 130, 115, accent);
  for (let n = 0; n < 36; n++) {
    const x = n < 12 ? 460+n*91 : n < 24 ? 510+(n-12)*83 : 35+(n-24)*130;
    const y = n < 12 ? 445+(n%3)*9 : n < 24 ? 735+(n%2)*10 : 220+(n%3)*22;
    tree(x, y, (n+index)%4 === 0, .65+(n%3)*.16);
  }
  for (const [x,y] of [[1015,650],[570,350],[1300,135]]) {
    add('ellipse', { cx:x, cy:y, rx:57, ry:27, fill:'#294f69', stroke:'#fff6cc', 'stroke-width':5 });
    add('ellipse', { cx:x, cy:y, rx:44, ry:19, fill:'none', stroke:'#ffd847', 'stroke-width':3 });
    add('path', { d:`M${x-15} ${y-10}v20m30 -20v20m-30 -10h30`, stroke:'#fff', 'stroke-width':5 });
  }
  // Six distinct landmarks: village beacon, campus, cranes, towers, race gates, lighthouse.
  const landmark = add('g', { transform: 'translate(1110 240)' });
  if (index === 0 || index === 5) {
    add('path', { d:'M-20 0L-12 -125H12L20 0Z', fill:'#fff5d7', stroke:accent, 'stroke-width':6 }, landmark);
    add('path', { d:'M-24 -125L0 -153L24 -125Z', fill:roof }, landmark);
    add('circle', { cy:-112, r:10, fill:'#ffe44b' }, landmark);
    add('ellipse', { cy:4, rx:40, ry:12, fill:accent }, landmark);
  } else if (index === 2) {
    add('path', { d:'M-30 0V-140H100M-75 -115H95M80 -140V-45', fill:'none', stroke:'#ffb527', 'stroke-width':10 }, landmark);
    add('path', { d:'M70 -45h20v25H70Z', fill:roof }, landmark);
  } else if (index === 4) {
    for (let n=0;n<3;n++) add('ellipse', { cx:n*55-55, cy:-35-n*12, rx:30, ry:50, fill:'none', stroke:n%2?roof:'#ffd33d', 'stroke-width':10 }, landmark);
  } else {
    for (let n=0;n<3;n++) building(990+n*75, 240, 55, 110+n*25, n%2?roof:accent);
  }
  for (let n=0;n<14;n++) {
    const x=500+(n*79)%940, y=420+(n%3)*143;
    add('ellipse',{cx:x+4,cy:y+13,rx:8,ry:4,fill:'#225c4c',opacity:.25});
    add('path',{d:`M${x-4} ${y+8}l-2 8m10 -8l2 8`,stroke:'#284859','stroke-width':4});
    add('rect',{x:x-6,y:y-6,width:12,height:17,rx:5,fill:n%2?roof:accent});
    add('circle',{cx:x,cy:y-10,r:6,fill:'#ffcf9b'});
  }
  for (const [x,y,s] of [[460,220,1],[1260,520,.8],[1460,250,.7],[900,100,.8]]) {
    const g=add('g',{transform:`translate(${x} ${y}) scale(${s})`,class:'life2-town-drone'});
    add('ellipse',{cy:55,rx:36,ry:10,fill:'#22614e',opacity:.18},g);
    add('path',{d:'M-29 -13L29 13M29 -13L-29 13',stroke:'#173a54','stroke-width':8},g);
    for(const [cx,cy] of [[-31,-15],[31,-15],[-31,15],[31,15]]) add('ellipse',{cx,cy,rx:17,ry:6,fill:'#e8fbff',stroke:accent,'stroke-width':4},g);
    add('rect',{x:-17,y:-13,width:34,height:28,rx:12,fill:'#ffe65a',stroke:'#173a54','stroke-width':3},g);
    add('rect',{x:-10,y:-6,width:20,height:10,rx:5,fill:'#173a54'},g);
    add('circle',{cx:-4,cy:-2,r:2,fill:'#65efff'},g);add('circle',{cx:4,cy:-2,r:2,fill:'#65efff'},g);
  }
  return scene;
}


/** Neighbourhoods share the route's coordinate system and stay inside both loops. */
export function boardInfields(map: string): SVGSVGElement {
  const scene = svg('svg', { viewBox: '0 0 700 900', preserveAspectRatio: 'none',
    class: 'life2-infields', 'aria-hidden': 'true' });
  const roof = PALETTES[Math.max(0, 'ABCDEF'.indexOf(map))][2];
  for (const top of [130, 530]) {
    scene.append(svg('rect', { x:105, y:top, width:490, height:240, rx:36, fill:'#65bf53' }));
    scene.append(svg('path', { d:`M125 ${top+185}H575`, stroke:'#e7efb4', 'stroke-width':28 }));
    scene.append(svg('path', { d:`M125 ${top+185}H575`, stroke:'#718a83', 'stroke-width':18 }));
    for (let i=0;i<5;i++) {
      const x=135+i*87, y=top+135, h=65+(i%2)*22;
      scene.append(svg('path', { d:`M${x} ${y}v-${h}h46v${h}z`, fill:'#fff3cf', stroke:'#346577', 'stroke-width':2 }));
      scene.append(svg('path', { d:`M${x+46} ${y}l13 -12v-${h}l-13 12z`, fill:'#d9ac77' }));
      scene.append(svg('path', { d:`M${x-5} ${y-h}l28 -25 30 25z`, fill:i%2?'#28bade':roof, stroke:'#fff', 'stroke-width':2 }));
      for (let row=0;row<2;row++) for(let col=0;col<2;col++) scene.append(svg('rect', {
        x:x+7+col*19,y:y-h+12+row*23,width:13,height:16,rx:2,fill:'#45b5db',stroke:'#fff','stroke-width':2 }));
      scene.append(svg('rect', {x:x+18,y:y-19,width:12,height:19,rx:3,fill:'#315f73'}));
    }
    for(let i=0;i<11;i++) {
      const x=123+i*45, y=top+220;
      scene.append(svg('path',{d:`M${x} ${y}v-22`,stroke:'#97704c','stroke-width':6}));
      scene.append(svg('circle',{cx:x,cy:y-29,r:15,fill:i%4?'#139454':'#ee73af'}));
      scene.append(svg('circle',{cx:x-5,cy:y-35,r:11,fill:i%4?'#b1ed69':'#ffb6da'}));
    }
  }
  return scene;
}

/** Original town festival: drone flight ribbons and deterministic confetti. */
export function celebrationScene(): SVGSVGElement {
  const scene = townScene('E');
  for (let n = 0; n < 70; n++) {
    const x = (n * 227 + 43) % 1600, y = (n * 137 + 19) % 900;
    scene.append(svg('rect', { x, y, width: 8, height: 19, rx: 2,
      fill: ['#fff5b5', '#ff628d', '#42eff2', '#ffdd35'][n % 4], transform: `rotate(${n * 31} ${x} ${y})` }));
  }
  return scene;
}
