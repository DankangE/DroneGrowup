import test from 'node:test';
import assert from 'node:assert/strict';
import { LIFE_TABS, POPUPS2, POPUP_GROUPS, POPUP_DEFINITIONS } from '../src/ui2/popups/data.ts';
import { ENDINGS2 } from '../src/ui2/popups/ending-data.ts';
import { mountEnding, mountEndingCollection } from '../src/ui2/popups/ending.ts';
import { fixtureOption, popup2Fixture } from '../src/ui2/popups/fixtures.ts';
import type { Popup2Kind } from '../src/ui2/popups/fixtures.ts';
import { mountPopup, popupModel } from '../src/ui2/popups/index.ts';
import { action, controls, dom, panelAt, TestNode, textOf, visible, withDOM } from './life-popup2-dom-helper.ts';

for (const kind of Object.keys(POPUPS2) as Popup2Kind[]) test(`${kind}: data-popup, 3-card pages, exact dispatch, locks, text details and keyboard exit`, () => withDOM(() => {
  const fixture = popup2Fixture(kind), model = popupModel(fixture.state, fixture.context)!;
  const host = new TestNode('div'), opener = new TestNode('button'); opener.focus();
  let dismissed = 0; const chosen: string[] = [], seen: string[] = [];
  const mounted = mountPopup(host.element(), model, { choose: id => chosen.push(id), dismiss: () => { dismissed++; } });
  assert.equal(panelAt(host).dataset.popup, kind); assert.equal(panelAt(host).dataset.phase, POPUPS2[kind].phase);
  assert.equal(panelAt(host).dataset.fullscreen === '', kind === 'chapter' || kind === 'retirement');
  do {
    const items = visible(host); assert.ok(items.length <= 3);
    for (const item of items) {
      seen.push(item.dataset.option); const count = chosen.length; item.fire('click');
      if (item.disabled) assert.equal(chosen.length, count);
      else assert.equal(chosen.at(-1), item.dataset.option);
    }
    if (seen.length >= model.choices.length) break;
    action(host, 'popup-page-next').fire('click');
  } while (seen.length < model.choices.length);
  assert.deepEqual(seen, model.choices.map(row => row.id));
  if (model.choices.length) {
    action(host, 'popup-details').fire('click');
    assert.equal(panelAt(host).dataset.details, '');
    assert.equal(host.querySelectorAll('img').length, 0);
    const before = textOf(host); action(host, 'popup-text-next').fire('click'); assert.notEqual(textOf(host), before);
    action(host, 'popup-back').fire('click');
  }
  const count = chosen.length;
  assert.equal(panelAt(host).fire('keydown', 'Escape'), true); mounted.close();
  assert.equal(dismissed, 1); assert.equal(chosen.length, count); assert.equal(dom.activeElement, opener);
}));

for (const group of POPUP_GROUPS) test(`§11.3 ${group.join('/')}: every implementation has a hook and a free presentation exit`, () => withDOM(() => {
  for (const kind of group) {
    const fixture = popup2Fixture('chapter'), host = new TestNode('div'); let dismissed = 0;
    const model = popupModel(fixture.state, { kind, offered: [] })!;
    mountPopup(host.element(), model, { choose() { assert.fail('dismiss must not dispatch an engine choice'); }, dismiss() { dismissed++; } });
    assert.equal(panelAt(host).dataset.popup, kind);
    assert.equal(panelAt(host).dataset.phase, POPUP_DEFINITIONS[kind].phase);
    assert.equal(action(host, 'popup-close').textContent, '닫기');
    action(host, 'popup-close').fire('click'); assert.equal(dismissed, 1);
  }
}));

test('my-life tabs expose all five bodies, paginate complete untrusted records as text and restore focus', () => withDOM(() => {
  const fixture = popup2Fixture('my-life'), host = new TestNode('div'), model = popupModel(fixture.state, fixture.context)!;
  mountPopup(host.element(), model, { choose() { assert.fail(); }, dismiss() {} });
  assert.deepEqual(controls(host).filter(node => node.dataset.tab).map(node => node.dataset.tab), Object.keys(LIFE_TABS));
  for (const tab of model.tabs!) {
    controls(host).find(node => node.dataset.tab === tab.id)!.fire('click');
    const selected = controls(host).filter(node => node.attributes['aria-selected'] === 'true');
    assert.equal(selected.length, 1); assert.equal(selected[0].dataset.tab, tab.id);
    assert.ok(host.querySelectorAll('div').some(node => node.dataset.tabPanel === tab.id));
    const pages = Number(action(host, 'popup-text-next')?.textContent.split(' / ')[1] ?? 1);
    const rows: string[] = [];
    for (let page = 0; page < pages; page++) {
      for (const row of host.querySelectorAll('dl').flatMap(list => list.children)) {
        const label = row.querySelector('dt')!.textContent, value = row.querySelector('dd')!.textContent;
        rows.push(label === '안내' ? value : `${label} · ${value}`);
      }
      action(host, 'popup-text-next')?.fire('click');
    }
    for (const line of tab.lines) assert.ok(rows.some(row => row === line || row.replace(' · ', ' ') === line), line);
  }
  assert.equal(host.querySelectorAll('img').some(node => textOf(node).includes('onerror')), false);
  const enabled = controls(host).filter(node => !node.disabled);
  panelAt(host).fire('keydown', 'Tab', true); assert.equal(dom.activeElement, enabled.at(-1));
  panelAt(host).fire('keydown', 'Tab'); assert.equal(dom.activeElement, enabled[0]);
}));

test('my-life retains paging for future action ids; transfer retains supplied destination hooks', () => withDOM(() => {
  const host = new TestNode('div'), fixture = popup2Fixture('my-life');
  const model = popupModel(fixture.state, { kind: 'my-life', offered: Array.from({ length: 5 }, (_, i) => fixtureOption(`future:${i}`)) })!;
  mountPopup(host.element(), model, { choose() {}, dismiss() {} });
  action(host, 'popup-page-next').fire('click');
  assert.deepEqual(visible(host).map(node => node.dataset.option), ['future:3', 'future:4']);
  const transfer = popup2Fixture('transfer');
  mountPopup(host.element(), popupModel(transfer.state, transfer.context)!, { choose() {}, dismiss() {} });
  assert.deepEqual(visible(host).map(node => node.dataset.dest), ['E-o0', 'B-o1', undefined]);
}));

test('ending screen renders each of the 21 selections, paged score/story and all navigation hooks', () => withDOM(() => {
  const host = new TestNode('div'), fixture = popup2Fixture('chapter'), visits: string[] = [];
  fixture.state.phase = 'ended'; fixture.state.score = 56789;
  for (const ending of ENDINGS2) {
    fixture.state.ending = ending.id;
    mountEnding(host.element(), fixture.state, { title: () => visits.push('title'), restart: () => visits.push('restart'),
      collection: () => visits.push('gallery') }, { grade: 'A', netWorth: 12345 });
    assert.equal(host.dataset.screen, 'ending'); assert.equal(host.querySelector('section')!.dataset.ending, ending.id);
    assert.equal(host.querySelector('h2')!.textContent, ending.title);
    assert.equal(dom.activeElement.tagName, 'h1');
    assert.ok(textOf(host).includes('최종 점수 56789')); assert.ok(textOf(host).includes('최종 성적 A'));
    action(host, 'ending-text-next').fire('click');
    for (const id of ['title', 'gallery', 'restart']) {
      assert.equal(action(host, id).dataset.nav, id); action(host, id).fire('click'); assert.equal(visits.at(-1), id);
    }
  }
}));

test('collection pages every ending, reveals saved stories/best scores and restores the selected page', () => withDOM(() => {
  const host = new TestNode('div'), ids: string[] = []; let closed = 0;
  mountEndingCollection(host.element(), { gallery: ['debtor', 'family', 'worker', 'worker', 'future'],
    bestByEnding: { family: 12345 } }, () => { closed++; });
  assert.equal(host.dataset.screen, 'gallery'); assert.ok(textOf(host).includes('3 / 21'));
  for (let page = 0; page < 7; page++) {
    const cards = controls(host).filter(node => node.dataset.pick); assert.equal(cards.length, 3);
    ids.push(...cards.map(node => node.dataset.pick));
    const first = cards[0].dataset.pick, unlocked = cards[0].dataset.unlocked === 'true'; cards[0].fire('click');
    assert.equal(host.querySelector('section')!.dataset.ending, first);
    assert.equal(Boolean(host.querySelectorAll('img').length || host.querySelectorAll('svg').length), unlocked);
    if (!unlocked) assert.ok(textOf(host).includes('미발견'));
    action(host, 'gallery-back').fire('click');
    assert.equal(controls(host).find(node => node.dataset.pick)!.dataset.pick, first);
    if (page < 6) action(host, 'gallery-page-next').fire('click');
  }
  assert.deepEqual(ids, ENDINGS2.map(row => row.id)); assert.equal(action(host, 'gallery-page-next').disabled, true);
  for (let i = 0; i < 3; i++) action(host, 'gallery-page-prev').fire('click');
  controls(host).find(node => node.dataset.pick === 'family')!.fire('click');
  let text = textOf(host);
  for (let i = 0; i < 6; i++) { action(host, 'ending-text-next')?.fire('click'); text += textOf(host); }
  assert.ok(text.includes('최고 점수 12345'));
  action(host, 'gallery-close').fire('click'); assert.equal(closed, 1);
}));
