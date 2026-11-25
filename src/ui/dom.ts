export function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export function button(text: string, className: string, onClick: () => void, action?: string): HTMLButtonElement {
  const node = el('button', className, text);
  node.type = 'button';
  if (action) node.dataset.action = action;
  node.addEventListener('click', onClick);
  return node;
}

export function svg<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number> = {}): SVGElementTagNameMap[K] {
  const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
  return node;
}

export const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
