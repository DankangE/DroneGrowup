import assert from 'node:assert/strict';
import test from 'node:test';
import { choose, newGame, options } from '../src/life/engine.ts';
import { PHONE_TABS } from '../src/ui2/popups/data.ts';
import { mountPopup, phoneChoices, popupModel } from '../src/ui2/popups/index.ts';
import type { PopupModel } from '../src/ui2/popups/model.ts';
import { POLISH_STYLE } from '../src/ui2/popups/polish-style.ts';
import { action, controls, panelAt, TestNode, visible, withDOM } from './life-popup2-dom-helper.ts';

// Same state and eight choices as layout.html's T18 fixture, including two locks.
const state = choose(newGame(11), 'start:school').state;
const base = options(newGame(11))[0];
const offered = ['buy:drone', 'repair', 'loan:100', 'retire:early',
  'phone:future-1', 'phone:future-2', 'phone:future-3', 'phone:future-4'].map((id, index) => ({
  ...base, id, title: `선택 ${index + 1} · 새로운 길을 향해 나아가는 이야기`,
  desc: '<저장된 내용> ' + '긴 설명과 예상 결과를 쪽 넘김으로 모두 읽습니다. '.repeat(10),
  enabled: index < 6, locks: index < 6 ? [] : ['조건이 아직 모자랍니다.'],
}));

function withSheet(width: number, height: number, middle: boolean, run: (host: TestNode) => void) {
  withDOM(() => {
    const browser = Object.getOwnPropertyDescriptor(globalThis, 'window');
    Object.defineProperty(globalThis, 'window', { configurable: true, value: { innerWidth: width, innerHeight: height } });
    const shell = new TestNode('main'), host = new TestNode('section'); shell.className = 'life2-shell';
    const hud = new TestNode('header'), pawn = new TestNode('div'), nav = new TestNode('footer');
    hud.className = 'life2-hud'; pawn.setAttribute('aria-current', 'location'); nav.className = 'life2-bottom';
    shell.append(hud, pawn, host, nav);
    Object.defineProperty(hud, 'getBoundingClientRect', { value: () => ({ top: 6, bottom: 116 }) });
    Object.defineProperty(nav, 'getBoundingClientRect', { value: () => ({ top: height - 54, bottom: height - 10 }) });
    Object.defineProperty(pawn, 'getBoundingClientRect', { value: () => {
      // Geometry double, not a browser layout assertion. From styles.css/HUD_STYLE:
      // A-o0 occupies row 9; POLISH_STYLE removes the 136px options row.
      // At 360x740 this changes sheetSpace from ~365.56px to the 407px cap.
      const styled = host.querySelectorAll('style').some(node => node.textContent.includes(POLISH_STYLE));
      const top = middle ? height / 2 : width === 360 ? styled ? 574 : 493.56 : styled ? 641 : 573;
      const cell = width === 360 ? styled ? 48 : 44.44 : 52.29;
      return { top, bottom: top + cell };
    } });
    try { run(host); } finally {
      if (browser) Object.defineProperty(globalThis, 'window', browser); else Reflect.deleteProperty(globalThis, 'window');
    }
  });
}

const ids = (host: TestNode) => visible(host).map(node => node.dataset.option);
function readText(host: TestNode) {
  const next = action(host, 'popup-text-next');
  const count = next ? Number(next.textContent.split(' / ')[1]) : 1;
  const choices = ids(host);
  for (let page = 0; page < count; page++) {
    const textNext = action(host, 'popup-text-next');
    if (textNext) {
      assert.equal(controls(host).filter(node => node.dataset.action === 'popup-text-next').length, 1);
      assert.notEqual(textNext, action(host, 'popup-page-next'));
      textNext.fire('click');
      assert.deepEqual(ids(host), choices, 'text paging preserves the visible choices');
    }
  }
}

function readChoices(host: TestNode, model: PopupModel, size?: number) {
  const seen: string[] = [];
  do {
    readText(host);
    if (size) assert.equal(visible(host).length, Math.min(size, model.choices.length - seen.length));
    seen.push(...ids(host));
    if (seen.length >= model.choices.length) break;
    const next = action(host, 'popup-page-next');
    assert.ok(next && !next.disabled, `${model.kind}: next disabled after ${seen.length}/${model.choices.length} choices: ${seen.join(', ')}`);
    assert.equal(controls(host).filter(node => node.dataset.action === 'popup-page-next').length, 1);
    next.fire('click');
  } while (seen.length < model.choices.length);
  assert.deepEqual(seen, model.choices.map(choice => choice.id));
}

for (const [width, height] of [[390, 844], [360, 740], [1280, 800], [1366, 768]]) {
  test(`F5 pager: fresh layout.html start at ${width}x${height} reaches all eight choices`, () => {
    withSheet(width, height, false, host => {
      const model = popupModel(state, { kind: 'start', offered })!;
      mountPopup(host.element(), model, { choose() {}, dismiss() {} });
      // Match popupChecks: read text, collect choices, then click only while more remain.
      readChoices(host, model);
      assert.equal(action(host, 'popup-page-next').disabled, true);
      assert.equal(panelAt(host).dataset.compact, undefined);
    });
  });
}

for (const [width, height] of [[390, 844], [360, 740]]) for (const kind of ['start', 'phone', 'my-life'] as const) {
  test(`F5 pager: compact ${kind} at ${width}x${height} keeps choices, text and details independent`, () => {
    withSheet(width, height, true, host => {
      const model = popupModel(state, { kind, offered, lines: ['긴 본문을 여러 쪽으로 나누어 읽습니다. '.repeat(8)] })!;
      mountPopup(host.element(), model, { choose() {}, dismiss() {},
        ...(kind === 'phone' && { phoneTab: tab => popupModel(state, { kind, offered: phoneChoices(offered, tab) })! }),
      });
      assert.equal(panelAt(host).dataset.compact, '');
      assert.ok(action(host, 'popup-text-next'));
      readChoices(host, model, 1);
      const last = ids(host);
      action(host, 'popup-details').fire('click'); readText(host);
      assert.equal(action(host, 'popup-page-next'), undefined, 'details only have a text pager');
      action(host, 'popup-back').fire('click'); assert.deepEqual(ids(host), last);
      if (kind === 'start') {
        assert.equal(action(host, 'popup-page-next').disabled, true);
        for (let page = model.choices.length - 2; page >= 0; page--) {
          assert.equal(action(host, 'popup-page-prev').disabled, false);
          action(host, 'popup-page-prev').fire('click'); assert.deepEqual(ids(host), [model.choices[page].id]);
        }
        assert.equal(action(host, 'popup-page-prev').disabled, true);
      } else {
        action(host, 'popup-page-next').fire('click'); assert.deepEqual(ids(host), [model.choices[0].id]);
      }
      if (kind === 'phone') for (const tab of Object.keys(PHONE_TABS) as (keyof typeof PHONE_TABS)[]) {
        controls(host).find(node => node.dataset.tab === tab)!.fire('click');
        readChoices(host, popupModel(state, { kind, offered: phoneChoices(offered, tab) })!, 1);
      }
    });
  });
}
