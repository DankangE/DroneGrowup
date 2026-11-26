type Bounds = Pick<DOMRect, 'left' | 'top' | 'right' | 'bottom'>;
type Size = Pick<DOMRect, 'width' | 'height'>;

/** Prefer the road gap toward the garden. On narrow boards, slide along the
 * tile edge into an empty garden cell, including around corners/junctions.
 * All candidates remain adjacent and clear of the entire tile rectangles.
 */
export function pawnPosition(tile: Bounds, occupied: readonly Bounds[], board: Bounds, size: Size) {
  const gap = 3, { width, height } = size;
  const centerX = (tile.left + tile.right - width) / 2;
  const centerY = (tile.top + tile.bottom - height) / 2;
  const xs = [centerX, tile.left, tile.right - width, board.left, board.right - width,
    ...occupied.flatMap(box => [box.right + gap, box.left - width - gap])];
  const ys = [centerY, tile.top, tile.bottom - height, board.top, board.bottom - height,
    ...occupied.flatMap(box => [box.bottom + gap, box.top - height - gap])];
  const sides = tile.left + tile.right < board.left + board.right
    ? ['right', 'left', 'bottom', 'top'] : ['left', 'right', 'bottom', 'top'];
  for (const side of sides) {
    const candidates = side === 'left' || side === 'right'
      ? ys.map(top => ({ left: side === 'right' ? tile.right + gap : tile.left - width - gap, top }))
      : xs.map(left => ({ left, top: side === 'bottom' ? tile.bottom + gap : tile.top - height - gap }));
    candidates.sort((a, b) => Math.hypot(a.left - centerX, a.top - centerY) - Math.hypot(b.left - centerX, b.top - centerY));
    for (const { left, top } of candidates) {
      const right = left + width, bottom = top + height;
      if (left < board.left || right > board.right || top < board.top || bottom > board.bottom) continue;
      if (Math.hypot(Math.max(tile.left - right, left - tile.right, 0),
        Math.max(tile.top - bottom, top - tile.bottom, 0)) > 8) continue;
      // Allow only floating-point noise at the three-pixel clearance boundary.
      if (occupied.some(box => right > box.left - gap + .01 && left < box.right + gap - .01
        && bottom > box.top - gap + .01 && top < box.bottom + gap - .01)) continue;
      return { left, top };
    }
  }
  return undefined;
}

/** Run after the final shell layout, also on resize and each movement frame.
 * The pawn stays a child of its displayed tile, preserving hooks and meaning.
 */
export function positionPawn(frame: HTMLElement): void {
  if (window.innerWidth < 900) return;
  const pawn = frame.querySelector<HTMLElement>('[data-pawn]');
  const tile = pawn?.closest<HTMLElement>('[data-space]');
  const board = frame.querySelector<HTMLElement>('[data-map]');
  if (!pawn || !tile || !board?.offsetWidth) return;
  const bounds = tile.getBoundingClientRect();
  const occupied = [...board.querySelectorAll('[data-space], .life2-glyph, .life2-tile-label, .life2-fare')]
    .map(node => node.getBoundingClientRect());
  const position = pawnPosition(bounds, occupied, board.getBoundingClientRect(), pawn.getBoundingClientRect());
  if (!position) return;
  // Absolute children use the tile's padding edge, not its outer border edge.
  pawn.style.setProperty('--pawn-x', `${position.left - bounds.left - tile.clientLeft}px`);
  pawn.style.setProperty('--pawn-y', `${position.top - bounds.top - tile.clientTop}px`);
}
