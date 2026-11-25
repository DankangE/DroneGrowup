import { el } from './dom.ts';

// An image that fails to load removes itself, so the drawn fallback behind it (SVG building, empty frame) shows.
// tests/art.test.ts checks that every file the game names is in public/art.
export function artImage(url: string, lazy = false) {
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
