import assert from 'node:assert/strict';
import { LEGACY_PLACE_SCENES, LEGACY_JOB_PORTRAITS } from '../src/ui2/art.ts';
// DOM-only assertions; this double deliberately does not claim to measure browser layout.
export class TestNode {
  className = ''; textContent = ''; disabled = false;
  parentElement?: TestNode;
  style = { setProperty: (_key: string, _value: string) => {} };
  get firstElementChild() { return this.children[0]; }
  get childNodes() { return [...this.children]; }
  dataset: Record<string, string> = {}; attributes: Record<string, string> = {};
  children: TestNode[] = []; listeners: Record<string, ((event: KeyboardEvent) => void)[]> = {};
  classList = { add: (value: string) => { this.className += ` ${value}`; } };
  readonly tagName: string;
  constructor(tagName: string) {
    this.tagName = tagName;
    const self = this;
    Object.defineProperty(this.attributes, Symbol.iterator, { value: function* () {
      const entries = { ...self.attributes, class: self.className,
        ...Object.fromEntries(Object.entries(self.dataset).map(([key, value]) =>
          [`data-${key.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`)}`, value])) };
      for (const [name, value] of Object.entries(entries)) yield { name, value };
    } });
  }
  get lastChild() { return this.children.at(-1); }
  getAttribute(key: string) { return this.attributes[key] ?? null; }
  setAttribute(key: string, value: string) {
    this.attributes[key] = value;
    if (key === 'class') this.className = value;
    if (key.startsWith('data-')) this.dataset[key.slice(5).replace(/-([a-z])/g, (_match, letter: string) => letter.toUpperCase())] = value;
  }
  append(...nodes: TestNode[]) {
    for (const node of nodes) { node.remove(); node.parentElement = this; this.children.push(node); }
  }
  remove() {
    if (this.parentElement) this.parentElement.children = this.parentElement.children.filter(node => node !== this);
    this.parentElement = undefined;
  }
  replaceChildren(...nodes: TestNode[]) {
    for (const child of [...this.children]) child.remove();
    this.append(...nodes);
  }
  replaceWith(node: TestNode) {
    const parent = this.parentElement!; parent.insertBefore(node, this); this.remove();
  }
  insertBefore(node: TestNode, before: TestNode) {
    node.remove(); node.parentElement = this; this.children.splice(this.children.indexOf(before), 0, node);
  }
  contains(node: TestNode): boolean { return node === this || this.children.some(child => child.contains(node)); }
  closest(selector: string): TestNode | undefined {
    return this.matches(selector) ? this : this.parentElement?.closest(selector);
  }
  matches(selector: string): boolean {
    if (selector.includes(',')) return selector.split(',').some(part => this.matches(part.trim()));
    if (selector === '*') return true;
    if (selector.endsWith(':not(:disabled)')) return !this.disabled && this.matches(selector.replace(':not(:disabled)', ''));
    const tag = /^[a-z][a-z0-9]*/.exec(selector)?.[0];
    if (tag && tag !== this.tagName) return false;
    for (const [, name] of selector.matchAll(/\.([\w-]+)/g)) if (!this.className.split(/\s+/).includes(name)) return false;
    for (const [, name, value] of selector.matchAll(/\[([\w-]+)(?:="?([^"\]]+)"?)?\]/g)) {
      const key = name.slice(5).replace(/-([a-z])/g, (_match, letter: string) => letter.toUpperCase());
      const actual = name.startsWith('data-') ? this.dataset[key] : this.attributes[name];
      if (actual === undefined || (value !== undefined && value !== actual)) return false;
    }
    return true;
  }
  addEventListener(type: string, listener: (event: KeyboardEvent) => void) { (this.listeners[type] ??= []).push(listener); }
  querySelectorAll(selector: string): TestNode[] {
    return this.children.flatMap(child => [child, ...child.querySelectorAll('*')]).filter(node =>
      node.matches(selector));
  }
  querySelector(selector: string) { return this.querySelectorAll(selector)[0]; }
  focus() { dom.activeElement = this; }
  fire(type: string, key = '', shiftKey = false) {
    let prevented = false;
    const event = { key, shiftKey, target: this, preventDefault() { prevented = true; }, stopPropagation() {} } as unknown as KeyboardEvent;
    for (const listener of this.listeners[type] ?? []) listener(event);
    return prevented;
  }
  element() { return this as unknown as HTMLElement; }
}
export const dom = { activeElement: new TestNode('button'), createElement: (tag: string) => new TestNode(tag),
  createElementNS: (_namespace: string, tag: string) => new TestNode(tag) };
export function withDOM(run: () => void) {
  const originals = ['document', 'HTMLElement'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)] as const);
  Object.defineProperty(globalThis, 'document', { configurable: true, value: dom });
  Object.defineProperty(globalThis, 'HTMLElement', { configurable: true, value: TestNode });
  try { run(); } finally {
    for (const [key, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key);
    }
  }
}
export const controls = (host: TestNode) => host.querySelectorAll('button');
export const action = (host: TestNode, id: string) => controls(host).find(node => node.dataset.action === id)!;
export const visible = (host: TestNode) => controls(host).filter(node => node.dataset.option);
export const panelAt = (host: TestNode) => host.querySelectorAll('section').find(node => node.dataset.popup)!;
export const textOf = (host: TestNode): string => [host, ...host.querySelectorAll('*')].map(node => node.textContent).join(' ');

/** Copy must never become markup; only renderer-owned, shipped artwork is allowed. */
export function assertTrustedSceneImages(host: TestNode) {
  const sets = { 'life2-place-art': Object.values(LEGACY_PLACE_SCENES),
    'life2-job-portrait': Object.values(LEGACY_JOB_PORTRAITS) };
  for (const image of host.querySelectorAll('img')) {
    const files = sets[image.className as keyof typeof sets];
    assert.ok(files, `untrusted image class: ${image.className}`);
    const src = (image as TestNode & { src?: string }).src;
    assert.ok(files.some(file => src === `/art/${file}.webp`), `untrusted image source: ${src}`);
    assert.ok(Object.keys(image.attributes).every(name => !/^on/i.test(name)), 'no inline event handlers');
  }
}
