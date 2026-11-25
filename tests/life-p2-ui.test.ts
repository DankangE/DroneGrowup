import assert from 'node:assert/strict';
import { test } from 'node:test';
import { newGame } from '../src/life/engine.ts';
import { finish } from '../src/life/ending.ts';
import { mountLife } from '../src/ui2/app.ts';
import { action, controls, dom, TestNode, textOf, withDOM } from './life-popup2-dom-helper.ts';

function inApp(seed: number | undefined, run: (root: TestNode, api: NonNullable<Window['__life']>, resize: () => void) => void) {
  withDOM(() => {
    let resize: () => void = () => assert.fail('resize listener missing');
    const browser = { matchMedia: () => ({ matches: true, addEventListener() {} }),
      addEventListener: (type: string, listener: () => void) => { if (type === 'resize') resize = listener; } } as unknown as Window;
    const keys = ['window', 'localStorage', 'crypto'] as const;
    const originals = keys.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)] as const);
    const storage = new Map<string, string>();
    Object.defineProperty(globalThis, 'window', { configurable: true, value: browser });
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
      getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
    } });
    // Even an entropy collision must not replay the immediately preceding ordinary run.
    Object.defineProperty(globalThis, 'crypto', { configurable: true, value: {
      getRandomValues: (values: Uint32Array) => { values[0] = 42; return values; },
    } });
    try {
      const root = new TestNode('main'); mountLife(root.element(), seed, true); run(root, browser.__life!, () => resize());
    } finally {
      for (const [key, descriptor] of originals) {
        if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key);
      }
    }
  });
}
const ended = () => { const state = newGame(1); state.turn = 204; state.s.capStamina = 80; state.s.stamina = 80; return finish(state); };

for (const seed of [undefined, 11]) test(`P2.7: ${seed === undefined ? 'ordinary restarts get fresh seeds' : 'explicit seeds replay deterministically'}`, () => {
  inApp(seed, (root, api) => {
    const initial = api.state(); api.load(ended()); action(root, 'restart').fire('click'); const restarted = api.state();
    api.load(ended()); action(root, 'title').fire('click'); action(root, 'new').fire('click'); const fresh = api.state();
    if (seed === undefined) {
      assert.equal(new Set([initial.seed, restarted.seed, fresh.seed]).size, 3);
    } else {
      assert.deepEqual(initial, restarted); assert.deepEqual(initial, fresh);
    }
  });
});

for (const origin of ['title', 'ending']) test(`P2.8: gallery opened from ${origin} retains page, selection and focus on resize`, () => {
  inApp(11, (root, api, resize) => {
    api.load(ended()); if (origin === 'title') action(root, 'title').fire('click');
    action(root, 'gallery').fire('click'); action(root, 'gallery-page-next').fire('click');
    const card = controls(root).find(node => node.dataset.pick)!; const picked = card.dataset.pick;
    card.focus(); resize(); assert.equal(root.dataset.screen, 'gallery'); assert.equal(dom.activeElement, card);
    assert.equal(controls(root).find(node => node.dataset.pick)!.dataset.pick, picked);
    card.fire('click'); const detail = root.querySelector('section')!, text = textOf(root);
    resize(); assert.equal(root.dataset.screen, 'gallery'); assert.equal(root.querySelector('section'), detail);
    assert.equal(textOf(root), text); assert.equal(detail.dataset.ending, picked);
    action(root, 'gallery-back').fire('click'); assert.equal(controls(root).find(node => node.dataset.pick)!.dataset.pick, picked);
    action(root, 'gallery-close').fire('click'); assert.equal(root.dataset.screen, origin);
  });
});
