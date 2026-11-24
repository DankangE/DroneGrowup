import { el } from './dom.ts';

// Vite expands the filenames at build time. Checking the inventory makes a
// partial art release render silently, even on a host with strict 404s.
declare const __SHIPPED_ART__: string[];
const shipped = new Set(__SHIPPED_ART__);

export function artImage(url: string, lazy = false) {
  if (!shipped.has(url.slice(url.lastIndexOf('/') + 1))) return null;
  const image = el('img');
  image.alt = '';
  image.decoding = 'async';
  if (lazy) image.loading = 'lazy';
  image.addEventListener('error', () => image.remove(), { once: true });
  image.src = url;
  return image;
}

export function portrait(url?: string, lazy = false) {
  const frame = el('span', 'portrait-frame' + (url ? '' : ' undiscovered'));
  frame.setAttribute('aria-hidden', 'true');
  const image = url && artImage(url, lazy);
  if (image) frame.append(image);
  return frame;
}
