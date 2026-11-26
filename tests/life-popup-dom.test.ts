import test from 'node:test';
import assert from 'node:assert/strict';
import { newGame, options } from '../src/life/engine.ts';
import { POPUPS } from '../src/ui2/popups/data.ts';
import type { PopupKind } from '../src/ui2/popups/data.ts';
import { assertTrustedSceneImages } from './life-popup2-dom-helper.ts';
import { mountPopup, popupModel } from '../src/ui2/popups/index.ts';

import { TestNode as Node, dom, withDOM } from './life-popup2-dom-helper.ts';
const panelAt = (host: Node) => host.querySelector('section')!;
const controls = (host: Node) => host.querySelectorAll('button');
const action = (host: Node, id: string) => controls(host).find(node => node.dataset.action === id)!;
function fixture(kind: PopupKind = 'space') {
  const base = options(newGame(11))[0];
  return popupModel(newGame(11), { kind, offered: Array.from({ length: 7 }, (_, index) => ({ ...base,
    id: kind === 'phone' ? `phone:future-${index}` : `future:${index}`, title: `새 선택 ${index}`, enabled: index < 5,
    desc: '<img onerror="bad()"> 긴 설명 '.repeat(12), locks: index < 5 ? [] : ['경력 부족'],
  })) })!;
}

test('every T18 renderer has data-popup and an unconditional presentation-only exit', () => withDOM(() => {
  for (const kind of Object.keys(POPUPS) as (keyof typeof POPUPS)[]) {
    const host = new Node('div'), opener = new Node('button'); opener.focus();
    let dismissed = 0, chosen = 0;
    const control = mountPopup(host as unknown as HTMLElement, fixture(kind), {
      choose: () => { chosen++; }, dismiss: () => { dismissed++; },
    });
    assert.equal(panelAt(host).dataset.popup, kind);
    assert.equal(panelAt(host).dataset.phase, POPUPS[kind].phase);
    action(host, 'popup-close').fire('click'); control.close();
    assert.equal(dismissed, 1); assert.equal(chosen, 0); assert.equal(dom.activeElement, opener);
    assert.equal(host.children.length, 0);
  }
}));

test('renderer pages 6/1, dispatches exact ids and keeps disabled choices non-actionable', () => withDOM(() => {
  const host = new Node('div'), chosen: string[] = [];
  mountPopup(host as unknown as HTMLElement, fixture(), { choose: id => chosen.push(id), dismiss() {} });
  const visible = () => controls(host).filter(node => node.dataset.option);
  assert.deepEqual(visible().map(node => node.dataset.option), ['future:0', 'future:1', 'future:2', 'future:3', 'future:4', 'future:5']);
  visible()[0].fire('click'); assert.deepEqual(chosen, ['future:0']);
  assert.equal(visible()[5].disabled, true); visible()[5].fire('click'); assert.equal(chosen.length, 1);
  action(host, 'popup-page-next').fire('click'); assert.equal(visible().length, 1);
  assert.equal(action(host, 'popup-page-next').disabled, true);
  action(host, 'popup-page-prev').fire('click'); assert.equal(visible()[0].dataset.option, 'future:0');
}));

test('details page all stored copy as text and return to the same choice page', () => withDOM(() => {
  const host = new Node('div');
  mountPopup(host as unknown as HTMLElement, fixture(), { choose() {}, dismiss() {} });
  action(host, 'popup-page-next').fire('click'); action(host, 'popup-details').fire('click');
  assert.equal(panelAt(host).dataset.details, ''); assertTrustedSceneImages(host);
  const first = host.querySelector('p')!.textContent;
  action(host, 'popup-text-next').fire('click'); assert.notEqual(host.querySelector('p')!.textContent, first);
  action(host, 'popup-back').fire('click');
  assert.equal(controls(host).find(node => node.dataset.option)!.dataset.option, 'future:6');
}));

test('keyboard focus wraps within the sheet and Escape restores the opener', () => withDOM(() => {
  const host = new Node('div'), opener = new Node('button'); opener.focus();
  mountPopup(host as unknown as HTMLElement, fixture(), { choose() {}, dismiss() {} });
  const panel = panelAt(host), enabled = controls(host).filter(node => !node.disabled);
  assert.equal(dom.activeElement.tagName, 'h2'); assert.equal(panel.fire('keydown', 'Tab', true), true);
  assert.equal(dom.activeElement, enabled.at(-1)); assert.equal(panel.fire('keydown', 'Tab'), true);
  assert.equal(dom.activeElement, enabled[0]); assert.equal(panel.fire('keydown', 'Escape'), true);
  assert.equal(dom.activeElement, opener);
}));

test('phone keeps its title and exposes all service tabs without losing choice pagination', () => withDOM(() => {
  const host = new Node('div'), tabs: string[] = [];
  mountPopup(host as unknown as HTMLElement, fixture('phone'), { choose() {}, dismiss() {},
    phoneTab: tab => { tabs.push(tab); return fixture('phone'); } });
  assert.equal(host.querySelector('h2')!.textContent, '휴대폰');
  assert.equal(controls(host).filter(node => node.dataset.option).length, 6);
  assert.equal(controls(host).filter(node => node.dataset.tab).length, 5);
  controls(host).find(node => node.dataset.tab === 'bank')!.fire('click'); assert.deepEqual(tabs, ['bank']);
  action(host, 'popup-page-next').fire('click');
  assert.equal(controls(host).find(node => node.dataset.option)!.dataset.option, 'phone:future-6');
}));
