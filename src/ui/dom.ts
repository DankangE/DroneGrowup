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

export function meter(value: number, max: number, label: string, className = ''): HTMLDivElement {
  const track = el('div', `meter ${className}`);
  track.setAttribute('role', 'progressbar');
  track.setAttribute('aria-label', label);
  track.setAttribute('aria-valuemin', '0');
  track.setAttribute('aria-valuemax', String(max));
  track.setAttribute('aria-valuenow', String(value));
  const fill = el('span');
  fill.style.width = `${Math.max(0, Math.min(100, value / max * 100))}%`;
  track.append(fill);
  return track;
}

export const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export function focusHeading(root: HTMLElement) {
  const heading = root.querySelector<HTMLElement>('h1, h2');
  if (heading) {
    heading.tabIndex = -1;
    heading.focus({ preventScroll: true });
  }
}

export function countNumber(node: HTMLElement, from: number, to: number, format: (n: number) => string, duration = 480) {
  node.textContent = format(to);
  if (from === to || reducedMotion()) return;
  const start = performance.now();
  function frame(now: number) {
    if (!node.isConnected) return;
    const progress = reducedMotion() ? 1 : Math.max(0, Math.min(1, (now - start) / duration));
    node.textContent = format(Math.round(from + (to - from) * (1 - (1 - progress) ** 3)));
    if (progress < 1) requestAnimationFrame(frame);
  }
  node.textContent = format(from);
  requestAnimationFrame(frame);
}

/** Pack whole rows using their wrapped heights at the current width. The caller
 * attaches the list before measuring and installs just the requested page afterwards. */
export function paginateRows(list: HTMLElement, items: HTMLElement[], columns: number, height: number): HTMLElement[][] {
  const pages: HTMLElement[][] = [[]];
  for (let i = 0; i < items.length; i += columns) {
    const row = items.slice(i, i + columns);
    list.append(...row);
    const current = pages[pages.length - 1];
    if (current.length && list.offsetHeight > height) {
      pages.push(row);
      list.replaceChildren(...row);
    } else current.push(...row);
  }
  return pages;
}
