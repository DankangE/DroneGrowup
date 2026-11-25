import assert from 'node:assert/strict';
import { test } from 'node:test';
import { choose, derived, forecast, newGame, options } from '../src/life/flow.ts';
import { EVENT_KEYS } from '../src/life/events-a.ts';
import type { GameState } from '../src/life/types.ts';
import { WORLD } from '../src/life/world.ts';
import { mountLife } from '../src/ui2/app.ts';
import { popupModel, textPages } from '../src/ui2/popups/model.ts';
import { POPUP_RULES } from '../src/ui2/popups/data.ts';
import { resultPopups } from '../src/ui2/popups/presentation.ts';
import { POPUP_STYLE } from '../src/ui2/popups/style.ts';
import { action, controls, dom, panelAt, TestNode, textOf, withDOM } from './life-popup2-dom-helper.ts';

function worker(rank = 0): GameState {
  const state = choose(newGame(1), 'start:self').state;
  state.status = 'working'; state.track = 'service'; state.turn = 3;
  state.job = { rank, perf: 26, tenure: 8, total: 8, warn: 0, changedAt: 0, tracks: ['service'] };
  Object.assign(state.s, { xp: 210, rank, stamina: 80, capStamina: 80 });
  state.board.pos = WORLD.find(node => node.map === 'A' && node.kind === 'rankup')!.id;
  state.board.step = 'bonus'; state.board.dice = [1, 1];
  return state;
}
function inApp(state: GameState, run: (root: TestNode, api: NonNullable<Window['__life']>) => void,
  browser = { matchMedia: () => ({ matches: true, addEventListener() {} }) } as unknown as Window) {
  withDOM(() => {
    const original = Object.getOwnPropertyDescriptor(globalThis, 'window');
    Object.defineProperty(globalThis, 'window', { configurable: true, value: browser });
    try {
      const root = new TestNode('main'); mountLife(root.element(), 1, true);
      browser.__life!.load(state); run(root, browser.__life!);
    } finally {
      if (original) Object.defineProperty(globalThis, 'window', original); else Reflect.deleteProperty(globalThis, 'window');
    }
  });
}
function pick(root: TestNode, id: string) {
  for (let page = 0; page < 30; page++) {
    const option = controls(root).find(node => node.dataset.option === id);
    if (option) { assert.equal(option.disabled, false, id); option.fire('click'); return; }
    const next = action(root, 'popup-page-next') ?? action(root, 'page-next');
    assert.ok(next && !next.disabled, `offered choice ${id} is reachable`); next.fire('click');
  }
  assert.fail(`missing ${id}`);
}
function dismissPresentations(root: TestNode): string[] {
  const kinds: string[] = [];
  while (panelAt(root)?.dataset.presentation !== undefined) {
    assert.ok(kinds.length < 10); kinds.push(panelAt(root).dataset.popup); action(root, 'popup-close').fire('click');
  }
  return kinds;
}

test('F3: a successful engine promotion mounts the fullscreen rank card with the actual roll', () => {
  const state = worker(); state.board.step = 'space'; state.job.perf = 95;
  const expected = choose(state, 'promo'); assert.equal(expected.result.roll?.success, true);
  inApp(state, (root, api) => {
    pick(root, 'promo'); assert.equal(panelAt(root).dataset.popup, 'rankup');
    assert.equal(panelAt(root).dataset.fullscreen, '');
    assert.equal(root.querySelector('[data-result-wheel]')!.textContent, String(expected.result.roll!.value));
    assert.match(textOf(root), /정직원/);
    let rankText = textOf(panelAt(root));
    const rankPages = Number(action(root, 'popup-text-next')?.textContent.split(' / ')[1] ?? 1);
    for (let i = 1; i < rankPages; i++) { action(root, 'popup-text-next').fire('click'); rankText += textOf(panelAt(root)); }
    assert.match(rankText, /알바 → 정직원/); assert.deepEqual(api.state(), expected.state);
    dismissPresentations(root); assert.notEqual(panelAt(root)?.dataset.popup, 'bonus');
    assert.deepEqual(api.state(), expected.state);
  });
});

test('F3: winter warning is on both the annual and review face; acknowledging uses job:none exactly once', () => {
  const state = worker();
  // Isolate the review: this spring's periodic life event has already been drawn.
  state.timers[EVENT_KEYS.lifeAt] = state.turn + 1;
  const expected = choose(state, 'end');
  assert.equal(expected.state.eventId, null);
  inApp(state, (root, api) => {
    pick(root, 'end'); assert.equal(panelAt(root).dataset.popup, 'year-end');
    assert.match(textOf(panelAt(root)), /성과 26: 경고 기준 30 미만/);
    action(root, 'popup-close').fire('click'); assert.equal(panelAt(root).dataset.popup, 'review');
    assert.match(textOf(panelAt(root)), /성과 26: 경고 기준 30 미만/);
    assert.deepEqual(api.state(), expected.state);
    pick(root, 'job:none'); dismissPresentations(root);
    assert.deepEqual(api.state(), choose(expected.state, 'job:none').state);
    assert.equal(panelAt(root), undefined);
  });
});

test('F3: a repeated warning mounts demotion, annual close and review without changing the engine twice', () => {
  const state = worker(1); state.job.warn = 1;
  const expected = choose(state, 'end'); assert.equal(expected.state.job.rank, 0);
  inApp(state, (root, api) => {
    pick(root, 'end'); assert.equal(panelAt(root).dataset.popup, 'demotion');
    assert.equal(panelAt(root).dataset.fullscreen, '');
    assert.deepEqual(dismissPresentations(root), ['demotion', 'year-end']);
    assert.equal(panelAt(root).dataset.popup, 'review'); assert.deepEqual(api.state(), expected.state);
  });
});

for (const turn of [63, 143]) test(`F3: crossing ${turn + 1} seasons shows one chapter card with engine net worth`, () => {
  const state = choose(newGame(1), 'start:self').state;
  state.turn = turn; state.s.capStamina = state.s.stamina = 80; state.board.step = 'bonus'; state.board.dice = [1, 1];
  const expected = choose(state, 'end');
  inApp(state, (root, api) => {
    pick(root, 'end');
    while (panelAt(root).dataset.popup !== 'chapter') action(root, 'popup-close').fire('click');
    assert.equal(panelAt(root).dataset.fullscreen, '');
    assert.match(textOf(root), new RegExp(`순자산 ${derived(expected.state).netWorth}만`));
    let chapterText = textOf(panelAt(root));
    const pages = Number(action(root, 'popup-text-next')?.textContent.split(' / ')[1] ?? 1);
    for (let i = 1; i < pages; i++) { action(root, 'popup-text-next').fire('click'); chapterText += textOf(panelAt(root)); }
    assert.match(chapterText, /다음 시기/);
    action(root, 'popup-close').fire('click'); assert.equal(panelAt(root), undefined);
    assert.deepEqual(api.state(), expected.state);
  });
});

test('F3: retirement wins routing over job:none, and forecasts describe severance and retired status', () => {
  const state = worker(1); state.turn = 164; state.job.perf = 50;
  const model = popupModel(state)!;
  assert.equal(model.kind, 'retirement'); assert.equal(model.fullscreen, true);
  assert.ok(model.choices.some(row => row.id === 'job:none'));
  const card = model.choices.find(row => row.id === 'retire:pension')!;
  assert.match(card.summary, /퇴직금/); assert.ok(card.details.includes('은퇴'));
  assert.doesNotMatch(card.details.join(' '), /직급 -1|비용 0만 · 체력 0/);
  inApp(state, (root, api) => {
    assert.equal(panelAt(root).dataset.popup, 'retirement'); pick(root, 'retire:pension');
    assert.equal(panelAt(root).dataset.popup, 'retirement');
    assert.deepEqual(api.state(), choose(state, 'retire:pension').state);
  });
});

for (const id of ['go:A-o12', 'spin']) test(`F3: no-choice luck after ${id} shows applied changes once`, () => {
  const state = choose(newGame(11), 'start:self').state;
  // Seed 11 spins a double four; both paths land on A-o12.
  state.board.pos = id === 'spin' ? 'A-o8' : 'A-o11';
  state.board.step = id === 'spin' ? 'spin' : 'pick'; state.board.dice = id === 'spin' ? [] : [1, 1];
  const expected = choose(state, id); assert.ok(expected.result.luck);
  assert.equal(expected.state.board.step, 'spin'); assert.equal(expected.state.turn, state.turn + 1);
  inApp(state, (root, api) => {
    if (id === 'spin') root.querySelector('.life2-wheel')!.fire('click'); else pick(root, id);
    assert.equal(panelAt(root).dataset.popup, 'luck');
    assert.equal(root.querySelector('h2')!.textContent, expected.result.luck!.title);
    assert.match(textOf(root), new RegExp(expected.result.luck!.text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    assert.deepEqual(api.state(), expected.state);
    action(root, 'popup-close').fire('click');
    assert.equal(panelAt(root), undefined);
    assert.deepEqual(api.state(), expected.state);
  });
});

test('F3: phone and life remain usable over pending results, with phone pricing and a resumable card', () => {
  const state = worker();
  inApp(state, (root, api) => {
    pick(root, 'end'); const afterClose = api.state();
    const bottom = root.querySelector('.life2-bottom')!, nav = bottom.querySelector('[data-nav=phone]')!;
    assert.equal(nav.disabled, false);
    const panel = panelAt(root), enabled = controls(panel).filter(control => !control.disabled);
    enabled.at(-1)!.focus();
    assert.equal(panel.fire('keydown', 'Tab'), false, 'Tab may leave the sheet for the bottom bar');
    nav.fire('click'); assert.equal(panelAt(root).dataset.popup, 'phone');
    controls(root).find(control => control.dataset.tab === 'bank')!.fire('click');
    const loan = options(afterClose, 'phone').find(option => option.id === 'loan:100')!;
    const expected = choose(afterClose, loan.id, 'phone');
    pick(root, loan.id); assert.deepEqual(api.state(), expected.state);
    assert.equal(panelAt(root).dataset.popup, 'result'); action(root, 'popup-close').fire('click');
    assert.equal(panelAt(root).dataset.popup, 'phone'); action(root, 'popup-close').fire('click');
    assert.equal(panelAt(root).dataset.popup, 'year-end');
    root.querySelector('[data-nav=life]')!.fire('click'); assert.equal(panelAt(root).dataset.popup, 'my-life');
    action(root, 'popup-close').fire('click'); assert.equal(panelAt(root).dataset.popup, 'year-end');
    const phone = root.querySelector('[data-nav=phone]')!; phone.focus();
    root.querySelector('.life2-bottom')!.fire('keydown', 'Tab');
    assert.equal(dom.activeElement, action(root, 'popup-close'));
  });
});

test('F3: close labels are presentation-only; the actual skip retains its wording and effect', () => {
  inApp(newGame(1), (root, api) => {
    assert.equal(action(root, 'popup-close').textContent, '닫기');
    action(root, 'popup-close').fire('click'); assert.deepEqual(api.state(), newGame(1));
    action(root, 'popup-reopen').fire('click'); assert.equal(panelAt(root).dataset.popup, 'start');
  });
  const state = worker(); state.board.step = 'space';
  inApp(state, (root, api) => {
    pick(root, 'skip'); assert.deepEqual(api.state(), choose(state, 'skip').state);
  });
});

test('F3: larger pages preserve text at sentence/word boundaries, including unbroken Unicode tokens', () => {
  const source = '첫 번째 문장입니다. 다음 문장의 단어들도 온전히 읽습니다. '.repeat(12);
  const pages = textPages([source]);
  assert.equal(pages.join(''), source); assert.ok(pages.every(page => page.length <= POPUP_RULES.textPage));
  assert.ok(pages.slice(0, -1).every(page => /\s$/.test(page)));
  assert.ok(textPages([source], POPUP_RULES.readingPage).length < pages.length / 2);
  const token = '🛩'.repeat(300); assert.equal(textPages([token]).join(''), token);
  assert.ok(textPages([token]).every(page => Array.from(page).length <= POPUP_RULES.textPage));
});

test('F3: ability uses compact v2 grades, assets use derived worth and records use larger pages', () => {
  const state = worker(); state.log = Array.from({ length: 30 }, (_, turn) => ({ turn, text: '이번 계절의 성과와 경험을 돌아본다.', tone: 'info' }));
  const model = popupModel(state, { kind: 'my-life', offered: [] })!, tabs = model.tabs!;
  assert.match(tabs[0].lines.join(' '), /경험치 E \(210\)/);
  assert.doesNotMatch(tabs[0].lines.join(' '), /기업 가치|수강생|투자 라운드/);
  assert.ok(textPages(tabs[0].lines, POPUP_RULES.readingPage).length <= 2);
  assert.ok(tabs[3].lines.includes(`순자산 ${derived(state).netWorth}만`));
  assert.ok(textPages(tabs[4].lines, POPUP_RULES.readingPage).length < 8);
  assert.match(tabs[4].lines[1], /^29계절/);
});

test('F3: start/loan summaries expose their engine money effect and cap drops are not negative recovery', () => {
  const start = popupModel(newGame(1))!;
  assert.match(start.choices.find(row => row.id === 'start:self')!.summary, /자금 \+300/);
  const state = worker(), loan = options(state, 'phone').find(row => row.id === 'loan:100')!;
  const model = popupModel(state, { kind: 'phone', offered: [loan], previews: { [loan.id]: forecast(state, loan.id, 'phone') } })!;
  assert.equal(model.choices[0].summary, '자금 +100만');
  const age = worker(); age.turn = 123; age.s.stamina = age.s.capStamina = 100;
  const outcome = choose(age, 'end'); assert.equal(outcome.result.season!.refill, -10);
  const copy = resultPopups(age, outcome.state, outcome.result).flatMap(row => row.lines).join(' ');
  assert.match(copy, /체력 상한 조정 -10/); assert.doesNotMatch(copy, /체력 회복 -10/);
});

// Supply measured rectangles to the mounted UI, without pretending this DOM double lays out CSS.
// 360x740: HUD 6..84, board 90..506 (nine 44.44px rows + eight 2px gaps), bottom bar 686..730.
function withSheetBoxes(run: (boxes: { hudBottom: number; bottomTop: number; pawnTop: number; pawnBottom: number;
  height: number }, styles: WeakMap<TestNode, Map<string, string>>) => void) {
  const boxes = { hudBottom: 84, bottomTop: 686, pawnTop: 506 - 400 / 9, pawnBottom: 506, height: 360 };
  const styles = new WeakMap<TestNode, Map<string, string>>(), createElement = dom.createElement;
  dom.createElement = tag => {
    const node = createElement(tag), css = new Map<string, string>(); styles.set(node, css);
    node.style.setProperty = (key, value) => { css.set(key, value); };
    Object.defineProperty(node, 'getBoundingClientRect', { value: () => {
      if (node.matches('[aria-current=location]')) return { top: boxes.pawnTop, bottom: boxes.pawnBottom };
      if (node.matches('.life2-hud')) return { top: 6, bottom: boxes.hudBottom };
      if (node.matches('.life2-bottom')) return { top: boxes.bottomTop, bottom: boxes.bottomTop + 44 };
      const top = Number.parseFloat(css.get('top') ?? '320'), height = Number.parseFloat(css.get('height') ?? String(boxes.height));
      return { top, bottom: top + height, height };
    } });
    return node;
  };
  try { run(boxes, styles); } finally { dom.createElement = createElement; }
}

test('F3: a three-choice start sheet clears the actual ninth row at 360x740, including after resize', () => {
  withSheetBoxes((boxes, styles) => {
    let resize: (() => void) | undefined;
    const browser = { innerWidth: 360, matchMedia: () => ({ matches: false, addEventListener() {} }),
      addEventListener: (type: string, listener: () => void) => { if (type === 'resize') resize = listener; } } as unknown as Window;
    inApp(newGame(1), (root, api) => {
      const check = (dock: string, top: number) => {
        const panel = panelAt(root);
        assert.equal(panel.dataset.dock, dock);
        assert.equal(styles.get(panel)!.get('top'), `${top}px`);
        assert.equal(styles.get(panel)!.get('bottom'), 'auto');
        assert.ok(top >= boxes.hudBottom + 6);
        assert.ok(top + boxes.height <= boxes.bottomTop - 6);
        assert.ok(top + boxes.height + 6 <= boxes.pawnTop || boxes.pawnBottom + 6 <= top);
        assert.equal(panel.querySelectorAll('[data-option]').length, 3);
      };
      check('top', 90);
      assert.ok(resize, 'the app recomputes mounted geometry on resize');
      // New live boxes put the pawn in the first row, where only the lower dock fits.
      Object.assign(boxes, { hudBottom: 96, bottomTop: 790, pawnTop: 130, pawnBottom: 178 });
      resize(); check('bottom', 424);
      // Move back to a low row with a different HUD boundary: no cached top coordinate.
      Object.assign(boxes, { hudBottom: 88, pawnTop: 500, pawnBottom: 548 });
      resize(); check('top', 94);
      assert.deepEqual(api.state(), newGame(1), 'placement never advances the engine');
    }, browser);
  });
});

test('F3/F5: sheet paging remeasures both edges and shrinks to keep the pawn and navigation clear', () => {
  withSheetBoxes((boxes, styles) => {
    const browser = { innerWidth: 360, innerHeight: 740, matchMedia: () => ({ matches: true, addEventListener() {} }) } as unknown as Window;
    inApp(newGame(1), root => {
      assert.equal(panelAt(root).dataset.dock, 'top');
      // Exactly six pixels on each side of the sheet is enough.
      Object.assign(boxes, { pawnTop: 456, pawnBottom: 500 });
      action(root, 'popup-details').fire('click');
      assert.equal(panelAt(root).dataset.dock, 'top');
      assert.equal(styles.get(panelAt(root))!.get('top'), '90px');
      Object.assign(boxes, { pawnTop: 270, pawnBottom: 314 });
      action(root, 'popup-back').fire('click');
      assert.equal(panelAt(root).dataset.dock, 'bottom');
      assert.equal(styles.get(panelAt(root))!.get('top'), '320px');
      // Neither side holds the original sheet: compact paging fits below the pawn.
      Object.assign(boxes, { pawnTop: 350, pawnBottom: 394, bottomTop: 700 });
      action(root, 'popup-details').fire('click');
      assert.equal(panelAt(root).dataset.dock, 'bottom');
      assert.equal(styles.get(panelAt(root))!.get('top'), '400px');
      assert.equal(styles.get(panelAt(root))!.get('height'), '294px');
    }, browser);
  });
});

test('F3: measured mobile docks stay opaque without moving into a tight pawn gap and retain the 55% cap', () => {
  const animation = /\.life2 \.life2-popup\[data-dock\]\s*\{\s*animation-name:([^;]+);/.exec(POPUP_STYLE)?.[1];
  assert.ok(animation);
  const keyframes = POPUP_STYLE.slice(POPUP_STYLE.indexOf(`@keyframes ${animation} `)).split('@')[1];
  assert.match(keyframes, /border-color:/);
  assert.doesNotMatch(keyframes, /opacity:/);
  assert.doesNotMatch(keyframes, /transform|translate|top:|bottom:/);
  assert.match(POPUP_STYLE, /height:min\(360px,55dvh\); max-height:55vh/);
});
