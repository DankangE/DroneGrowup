import { runInNewContext } from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';
import { choose, newGame, options } from '../src/life/engine.ts';
import { WORLD } from '../src/life/world.ts';
import { board, gridCell } from '../src/ui2/board.ts';
import { pawnPosition, positionPawn } from '../src/ui2/pawn.ts';
import { mountPopup, phoneChoices, popupModel } from '../src/ui2/popups/index.ts';
import { careerRows } from '../src/ui2/popups/polish-model.ts';
import { POLISH as P } from '../src/ui2/popups/polish-data.ts';
import { action, controls, dom, panelAt, TestNode, textOf, visible, withDOM } from './life-popup2-dom-helper.ts';

test('single-page phone tabs omit the pager and wrap Tab to a visible control', () => withDOM(() => {
  const state = choose(newGame(1), 'start:self').state;
  const model = popupModel(state, { kind: 'phone', offered: phoneChoices(options(state, 'phone'), 'repair'), lines: [] })!;
  const host = new TestNode('div');
  mountPopup(host.element(), model, { choose() { assert.fail('focus must not choose'); }, dismiss() {}, phoneTab: () => model });
  assert.equal(action(host, 'popup-page-next'), undefined);
  const enabled = controls(host).filter(control => !control.disabled), panel = panelAt(host);
  assert.equal(enabled[0], action(host, 'popup-close'));
  assert.equal(panel.fire('keydown', 'Tab', true), true);
  assert.equal(dom.activeElement, enabled.at(-1));
  assert.equal(panel.fire('keydown', 'Tab'), true);
  assert.equal(dom.activeElement, action(host, 'popup-close'));
  assert.equal(panel.fire('keydown', 'Tab'), false, 'normal Tab can advance past close');
  assert.equal(panel.fire('keydown', 'Tab', true), true);
  assert.equal(dom.activeElement, enabled.at(-1));
}));

test('cashless phone shop has a keyboard entry point and every locked row can be inspected without activation', () => withDOM(() => {
  const state = choose(newGame(1), 'start:self').state; state.s.money = 0;
  const offered = phoneChoices(options(state, 'phone'), 'shop');
  assert.ok(offered.length > 1 && offered.every(option => !option.enabled));
  const host = new TestNode('div'), taken: string[] = [];
  mountPopup(host.element(), popupModel(state, { kind: 'phone', offered })!, { choose: id => taken.push(id), dismiss() {} });
  const list = host.querySelector('.life2-popup-list')!, rows = visible(host);
  assert.equal(list.getAttribute('tabindex'), '0');
  list.focus(); assert.equal(dom.activeElement, list);
  for (let i = 0; i < rows.length; i++) {
    assert.equal(list.fire('keydown', i ? 'ArrowDown' : 'Home'), true);
    const row = rows[i];
    assert.equal(row.getAttribute('aria-current'), 'true');
    assert.equal(dom.activeElement, row.parentElement);
    assert.equal(host.querySelector('h3')!.textContent, offered[i].title);
    assert.ok(offered[i].locks.every(lock => textOf(host.querySelector('.life2-choice-detail')!).includes(lock)));
    assert.equal(row.disabled, true);
    row.fire('keydown', 'Enter'); row.fire('keydown', ' '); row.fire('click');
    dom.activeElement.fire('keydown', 'Enter'); dom.activeElement.fire('keydown', ' ');
  }
  list.fire('keydown', 'End'); assert.equal(rows.at(-1)!.getAttribute('aria-current'), 'true');
  list.fire('keydown', 'ArrowUp'); assert.equal(rows.at(-2)!.getAttribute('aria-current'), 'true');
  list.fire('keydown', 'Home'); assert.equal(rows[0].getAttribute('aria-current'), 'true');
  assert.deepEqual(taken, []);
}));

test('retirement without a career uses the existing no-career description for the current rank', () => {
  const state = newGame(11); state.status = 'retired';
  assert.equal(state.track, null);
  assert.equal(careerRows(state).find(row => row.label === P.current)!.value, P.noCareer);
  assert.ok(!careerRows(state).some(row => row.value === P.retirement));
});

test('PC hover and arrow selection update details, include locked rows, and dispatch only on activation', () => withDOM(() => {
  const state = choose(newGame(1), 'start:school').state;
  const base = options(newGame(1))[0];
  const offered = Array.from({ length: 8 }, (_, i) => ({ ...base, id: `future:${i}`,
    title: `선택 ${i}`, desc: `설명 ${i}`, enabled: i !== 1, locks: i === 1 ? ['경력 부족'] : [] }));
  const host = new TestNode('div'), taken: string[] = [];
  mountPopup(host.element(), popupModel(state, { kind: 'space', offered })!, { choose: id => taken.push(id), dismiss() {} });
  const list = host.querySelector('.life2-popup-list')!;
  assert.equal(visible(host).length, 6);
  assert.equal(visible(host)[0].getAttribute('aria-current'), 'true');
  visible(host)[3].fire('mouseenter');
  assert.equal(host.querySelector('h3')!.textContent, '선택 3');
  assert.deepEqual(taken, []);
  list.fire('keydown', 'Home'); list.fire('keydown', 'ArrowDown');
  assert.equal(visible(host)[1].getAttribute('aria-current'), 'true');
  assert.ok(textOf(host.querySelector('.life2-choice-detail')!).includes('경력 부족'));
  visible(host)[1].fire('click'); assert.deepEqual(taken, []);
  list.fire('keydown', 'ArrowDown'); visible(host)[2].fire('click');
  assert.deepEqual(taken, ['future:2']);
  action(host, 'popup-page-next').fire('click');
  assert.deepEqual(visible(host).map(node => node.dataset.option), ['future:6', 'future:7']);
  action(host, 'popup-page-prev').fire('click');
  assert.equal(visible(host)[0].dataset.option, 'future:0');
}));

const { auditPawn, auditPopupContent } = await import(new URL('../scripts/layout-check-life.mjs', import.meta.url).href);
const rect = (left: number, top: number, width: number, height: number) => ({ left, top, right:left + width, bottom:top + height, width, height });
test('pawn audit requires 48px, adjacency, visible tile content and no covered icons or labels', () => {
  const node = (kind: string, box: ReturnType<typeof rect>) => ({ box, shown:true,
    checkVisibility() { return this.shown; }, getBoundingClientRect() { return this.box; },
    matches: (selector: string) => selector === kind, classList: { contains: (value: string) => kind === `.${value}` } });
  const label = node('.life2-tile-label', rect(110, 138, 50, 14)), icon = node('.life2-glyph', rect(120, 104, 28, 28));
  const neighborLabel = node('.life2-tile-label', rect(260, 138, 50, 14)), neighborIcon = node('.life2-glyph', rect(270, 104, 28, 28));
  const tile = { ...node('tile', rect(100, 100, 70, 54)), dataset:{ space:'A-o0' },
    querySelector: (selector: string) => selector === '.life2-glyph' ? icon : label, querySelectorAll: () => [icon, label] };
  const neighbor = { ...node('tile', rect(250, 100, 70, 54)), dataset:{ space:'A-o1' },
    querySelectorAll: () => [neighborIcon, neighborLabel] };
  const garden = node('board', rect(0, 0, 500, 350));
  const sprite = node('svg', rect(179, 103, 36, 36));
  const pawn = { ...node('pawn', rect(173, 103, 48, 48)),
    closest: (selector: string) => selector === '[data-space]' ? tile : garden, querySelectorAll: () => [sprite] };
  const document = { querySelector: () => pawn, querySelectorAll: () => [tile, neighbor] };
  const check = () => Array.from(runInNewContext(`(${auditPawn.toString()})()`, { document }));
  assert.deepEqual(check(), []);
  // Touching and eight-pixel gaps on every side are allowed, including diagonals.
  for (const [x, y] of [[170, 103], [178, 103], [44, 103], [110, 44], [110, 162], [175, 159]]) {
    pawn.box = rect(x, y, 48, 48); assert.deepEqual(check(), []);
  }
  for (const [x, y] of [[178.01, 103], [176, 160]]) {
    pawn.box = rect(x, y, 48, 48); assert.ok(check().includes('pawn is not adjacent to current tile'));
  }
  pawn.box = rect(250, 100, 48, 54);
  assert.ok(check().includes('pawn covers A-o1 icon'));
  assert.ok(check().includes('pawn covers A-o1 label'));
  pawn.box = rect(110, 102, 48, 54);
  assert.ok(check().includes('pawn covers A-o0 icon'));
  assert.ok(check().includes('pawn covers A-o0 label'));
  pawn.box = rect(173, 103, 48, 48); sprite.box = neighborLabel.box;
  assert.ok(check().includes('pawn covers A-o1 label'), 'painted child bounds also count');
  sprite.box = rect(490, 103, 36, 36);
  assert.ok(check().includes('pawn artwork extends outside board'));
  sprite.box = rect(179, 103, 36, 36); sprite.shown = false;
  assert.ok(check().includes('pawn artwork is hidden'));
  sprite.shown = true; pawn.shown = false;
  assert.ok(check().includes('pawn is hidden or too small'));
  pawn.shown = true;
  for (const [width, height] of [[47.99, 48], [48, 47.99]]) {
    pawn.box = rect(173, 103, width, height); assert.ok(check().includes('pawn is hidden or too small'));
  }
  pawn.box = rect(173, 103, 48, 48); label.shown = false;
  assert.ok(check().includes('current tile label is hidden'));
  label.shown = true; icon.shown = false;
  assert.ok(check().includes('current tile icon is hidden'));
});

test('PC pawn placement clears every A–F tile in normal and destination board geometry', () => {
  // Layout fixtures match the PC grid; actual CSS/paint is checked by layout:life.
  for (const [width, height] of [[1920, 1080], [1536, 864], [1366, 768], [1280, 800]]) {
    for (const picking of [false, true]) for (const map of 'ABCDEF') {
      const bounds = rect(width * (picking ? .25 : .26), height * .35, width * (picking ? .42 : .7), height * .62);
      const column = (bounds.width - 12) / 7, row = (bounds.height - 16) / 9;
      const tileWidth = Math.min(column, height * .09), size = Math.max(48, Math.min(72, height / 16));
      const nodes = WORLD.filter(node => node.map === map);
      const tiles = nodes.map(node => {
        const cell = gridCell(node);
        return rect(bounds.left + (cell.column - 1) * (column + 2) + (column - tileWidth) / 2,
          bounds.top + (cell.row - 1) * (row + 2), tileWidth, row);
      });
      for (const [index, tile] of tiles.entries()) {
        const context = `${width}x${height} ${picking ? 'pick' : 'normal'} ${nodes[index].id}`;
        const position = pawnPosition(tile, tiles, bounds, { width: size, height: size });
        assert.ok(position, context);
        const pawn = rect(position.left, position.top, size, size);
        assert.ok(pawn.width >= 48 && pawn.height >= 48, context);
        assert.ok(pawn.left >= bounds.left && pawn.right <= bounds.right && pawn.top >= bounds.top && pawn.bottom <= bounds.bottom, context);
        assert.ok(Math.hypot(Math.max(tile.left - pawn.right, pawn.left - tile.right, 0),
          Math.max(tile.top - pawn.bottom, pawn.top - tile.bottom, 0)) <= 8, context);
        for (const other of tiles) assert.ok(pawn.right <= other.left || pawn.left >= other.right
          || pawn.bottom <= other.top || pawn.top >= other.bottom, `${context}: no tile covered`);
        // A-o0 must remain directly inside the left column's garden at all sizes.
        if (nodes[index].id === 'A-o0') assert.ok(pawn.left > tile.right && pawn.bottom <= tile.bottom, context);
      }
    }
  }
});

test('each movement position keeps its own tile icon, avatar, drone and location highlight', () => withDOM(() => {
  const state = newGame(1);
  for (const node of WORLD) {
    const frame = board(state, node.id) as unknown as TestNode;
    const pawn = frame.querySelector('[data-pawn]')!;
    const tile = pawn.closest('[data-space]')!;
    assert.equal(pawn.dataset.pawn, node.id);
    assert.equal(tile.dataset.space, node.id);
    assert.equal(tile.getAttribute('aria-current'), 'location');
    assert.ok(tile.querySelector('.life2-glyph'));
    assert.ok(tile.querySelector('.life2-tile-label'));
    assert.ok(pawn.querySelector('.life2-hud-avatar'));
    assert.ok(pawn.querySelector('.life2-progress-drone'));
  }
}));

test('DOM placement uses the displayed tile padding edge and recomputes after resize', () => {
  let boardBounds = rect(0, 0, 500, 350), tileBounds = rect(100, 100, 70, 54);
  const properties: Record<string, string> = {};
  const tile = { getBoundingClientRect: () => tileBounds, clientLeft: 3, clientTop: 3 };
  const pawn = { closest: () => tile, getBoundingClientRect: () => rect(0, 0, 48, 48),
    style: { setProperty: (key: string, value: string) => { properties[key] = value; } } };
  const grid = { offsetWidth: 500, getBoundingClientRect: () => boardBounds, querySelectorAll: () => [tile] };
  const frame = { querySelector: (selector: string) => selector === '[data-pawn]' ? pawn : grid };
  const place = () => runInNewContext(`(${positionPawn.toString()})(frame)`, {
    window: { innerWidth: 1366 }, frame, pawnPosition,
  });
  place(); assert.equal(properties['--pawn-x'], '70px'); assert.equal(properties['--pawn-y'], '0px');
  boardBounds = rect(0, 0, 300, 350); tileBounds = rect(200, 100, 70, 54);
  place(); assert.equal(properties['--pawn-x'], '-54px'); assert.equal(properties['--pawn-y'], '0px');
});

test('popup audit rejects hidden story copy, title, choices and description, and translucent backing', () => {
  const node = (className: string) => ({ className, textContent: '필수 내용', shown: true,
    checkVisibility() { return this.shown; }, getBoundingClientRect: () => ({ width: 100, height: 44 }) });
  const title = node('title'), story = node('story'), choice = node('choice'), description = node('description'), details = node('details');
  const panel = { matches: () => true, hasAttribute: () => false,
    querySelector: (selector: string) => ({ h2: title, '[data-option]': choice,
      '.life2-selected-description': description, '[data-action=popup-details]': details })[selector],
    querySelectorAll: () => [story, choice, description] };
  const paint = { opacity: '1', backgroundColor: 'rgb(23, 47, 64)' };
  const check = () => Array.from(runInNewContext(`(${auditPopupContent.toString()})(panel)`, { panel, getComputedStyle: () => paint }));
  assert.deepEqual(check(), []);
  for (const item of [title, story, choice, description, details]) {
    item.shown = false; assert.ok(check().length, `${item.className} is required`); item.shown = true;
  }
  paint.backgroundColor = 'rgba(23, 47, 64, 0.99)'; assert.ok(check().includes('popup sheet is translucent'));
  paint.backgroundColor = 'rgb(23, 47, 64)'; paint.opacity = '0.99'; assert.ok(check().includes('popup sheet is translucent'));
});
