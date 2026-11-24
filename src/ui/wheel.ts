import { el, reducedMotion } from './dom.ts';
import type { Result } from '../game/types.ts';

function wheel(chance: number, preview: boolean) {
  const face = el('span', preview ? 'wheel preview' : 'wheel');
  face.dataset.chance = String(chance);
  face.setAttribute('aria-hidden', 'true');
  const disc = el('span', 'wheel-disc');
  disc.style.setProperty('--chance', chance + '%');
  const hub = el('b', 'wheel-hub', preview ? '✦' : '·');
  face.append(disc, hub);
  return { face, disc, hub };
}

export function previewWheel(chance: number) {
  const { face } = wheel(chance, true);
  face.dataset.wheelPreview = '';
  const preview = el('span', 'wheel-preview');
  preview.append(face, el('b', '', `성공 ${chance}%`));
  return preview;
}

export function resultWheel(roll: NonNullable<Result['roll']>) {
  const { face, disc, hub } = wheel(roll.chance, false);
  face.dataset.wheel = '';
  face.dataset.value = String(roll.value);
  const machine = el('div', 'wheel-machine');
  const legend = el('div', 'wheel-legend');
  legend.append(el('span', 'success', '● 성공'), el('span', 'failure', '● 실패'));
  machine.append(el('strong', '', `성공 확률 ${roll.chance}%`), face, legend);
  function spin(done: () => void) {
    const stop = `rotate(${-1080 - (roll.value + .5) * 3.6}deg)`;
    disc.style.transform = stop;
    const finish = () => {
      face.dataset.outcome = roll.success ? 'success' : 'fail';
      hub.textContent = String(roll.value).padStart(2, '0');
      done();
    };
    if (reducedMotion()) finish();
    else {
      const turning = disc.animate([{ transform: 'rotate(0deg)' }, { transform: stop }], { duration: 1600, easing: 'cubic-bezier(.16,.69,.18,1)' });
      turning.onfinish = finish;
    }
  }
  return { machine, spin };
}
