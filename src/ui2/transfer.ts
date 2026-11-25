import type { MapId } from '../life/types.ts';
import { MAPS } from '../life/world.ts';
import { el } from '../ui/dom.ts';

export const TRANSFER_MS = 600;
export const TRANSFER_STYLE = `
.life2 .life2-board-frame { position:relative; }
.life2 .life2-transfer { position:absolute; inset:0; z-index:4; display:grid; place-content:center; gap:12px;
  padding:12px; background:#fff9ebee; pointer-events:none; }
.life2 .life2-map-overview { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:12px; }
.life2 .life2-map-overview span { padding:12px 6px; border:1px solid #80758b; border-radius:8px; font-size:12px; }
.life2 .life2-map-overview [data-from] { animation:life2-map-out ${TRANSFER_MS}ms both; }
.life2 .life2-map-overview [data-to] { animation:life2-map-in ${TRANSFER_MS}ms both; background:#c5efdf; }
.life2[data-phase=transfer] .life2-board { animation:life2-map-out ${TRANSFER_MS}ms both; }
@keyframes life2-map-out { to { transform:scale(.65); opacity:.35; } }
@keyframes life2-map-in { from { transform:scale(.65); opacity:.35; } to { transform:scale(1); opacity:1; } }
@media(prefers-reduced-motion:reduce) { .life2 .life2-transfer *, .life2[data-phase=transfer] .life2-board { animation:none!important; } }
`;

export function transfer(from: MapId, to: MapId): HTMLElement {
  const overlay = el('div', 'life2-transfer');
  overlay.setAttribute('role', 'status');
  overlay.append(el('strong', '', `${MAPS[from].name} → ${MAPS[to].name}`));
  const overview = el('div', 'life2-map-overview');
  for (const id of Object.keys(MAPS) as MapId[]) {
    const item = el('span', '', `${id} · ${MAPS[id].name}`);
    if (id === from) item.dataset.from = id;
    if (id === to) item.dataset.to = id;
    overview.append(item);
  }
  overlay.append(overview);
  return overlay;
}
