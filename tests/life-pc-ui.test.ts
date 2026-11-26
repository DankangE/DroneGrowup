import test from 'node:test';
import assert from 'node:assert/strict';
import { choose, newGame, options } from '../src/life/engine.ts';
import { mountPopup, popupModel } from '../src/ui2/popups/index.ts';
import { action, TestNode, textOf, visible, withDOM } from './life-popup2-dom-helper.ts';

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
