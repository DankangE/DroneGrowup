// DOM-only assertions; this double deliberately does not claim to measure browser layout.
export class TestNode {
  className = ''; textContent = ''; disabled = false;
  dataset: Record<string, string> = {}; attributes: Record<string, string> = {};
  children: TestNode[] = []; listeners: Record<string, ((event: KeyboardEvent) => void)[]> = {};
  classList = { add: (value: string) => { this.className += ` ${value}`; } };
  readonly tagName: string;
  constructor(tagName: string) { this.tagName = tagName; }
  get lastChild() { return this.children.at(-1); }
  setAttribute(key: string, value: string) { this.attributes[key] = value; }
  append(...nodes: TestNode[]) { this.children.push(...nodes); }
  replaceChildren(...nodes: TestNode[]) { this.children = nodes; }
  insertBefore(node: TestNode, before: TestNode) { this.children.splice(this.children.indexOf(before), 0, node); }
  addEventListener(type: string, listener: (event: KeyboardEvent) => void) { (this.listeners[type] ??= []).push(listener); }
  querySelectorAll(selector: string): TestNode[] {
    return this.children.flatMap(child => [child, ...child.querySelectorAll('*')]).filter(node =>
      selector === '*' || (selector === 'button:not(:disabled)' ? node.tagName === 'button' && !node.disabled : node.tagName === selector));
  }
  querySelector(selector: string) { return this.querySelectorAll(selector)[0]; }
  focus() { dom.activeElement = this; }
  fire(type: string, key = '', shiftKey = false) {
    let prevented = false;
    const event = { key, shiftKey, preventDefault() { prevented = true; }, stopPropagation() {} } as KeyboardEvent;
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
