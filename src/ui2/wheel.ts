import { button, el } from '../ui/dom.ts';
import { progressDrone } from './hud-art.ts';

export const SPIN_MS = 700;
export const WHEEL_STYLE = `
.life2 .life2-wheel { display:flex; align-items:center; justify-content:center; gap:6px; padding:0 4px; }
.life2 .life2-wheel-face { display:grid; place-items:center; width:30px; height:30px; border:2px solid #6c3ec4;
  border-radius:50%; background:#fff9eb; color:#3a2861; font:bold 18px/1 system-ui; }
.life2 .life2-wheel[data-rolling] .life2-wheel-face { animation:life2-roll ${SPIN_MS}ms linear infinite; }
@keyframes life2-roll { to { transform:rotate(360deg); } }
@media(prefers-reduced-motion:reduce) { .life2 .life2-wheel-face { animation:none!important; } }
`;

export function wheel(dice: readonly number[], mode: 'ready' | 'spin' | 'idle' | 'move' | 'transfer', act: () => void) {
  const label = mode === 'ready' ? '룰렛 돌리기' : mode === 'spin' ? '멈추기' : mode === 'idle' ? '' : '건너뛰기';
  const control = mode === 'idle' ? el('output', 'life2-dice life2-wheel')
    : button('', 'life2-spin life2-wheel', act, mode === 'spin' ? 'stop-spin' : mode === 'ready' ? 'spin' : 'skip-move');
  if (mode === 'ready') control.dataset.option = 'spin';
  if (mode === 'spin') control.dataset.rolling = '';
  control.setAttribute('aria-label', mode === 'idle' ? `룰렛 ${dice.join(', ')}` : `룰렛 두 개 ${label}`);
  for (let index = 0; index < 2; index++) {
    const face = el('span', 'life2-wheel-face', mode === 'spin' ? '?' : String(dice[index] ?? '—'));
    face.dataset.die = String(index); face.setAttribute('aria-hidden', 'true'); control.append(face);
  }
  if (mode === 'ready') { const marker = progressDrone(); marker.classList.add('life2-menu-marker'); control.append(marker); }
  if (label) control.append(el('span', '', label));
  return control;
}
