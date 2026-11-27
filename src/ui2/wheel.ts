import { button, el } from '../ui/dom.ts';
import { progressDrone } from './hud-art.ts';

export const SPIN_MS = 700;
export const WHEEL_STYLE = `
.life2 .life2-wheel { display:flex; align-items:center; justify-content:center; gap:6px; padding:0 4px; }
.life2 .life2-wheel-face { position:relative; display:grid; place-items:center; width:30px; height:30px; border:2px solid #6c3ec4;
  border-radius:50%; background:#fff9eb; color:#3a2861; font:bold 18px/1 system-ui; }
.life2 .life2-wheel[data-rolling] .life2-wheel-face::before { content:''; position:absolute; inset:-3px;
  border:3px solid #6c3ec4; border-top-color:transparent; border-radius:50%;
  animation:life2-wheel-turn ${SPIN_MS}ms linear var(--spin-delay,0ms) both; }
.life2 .life2-roulette[data-spinning] .life2-roulette-disc {
  animation:life2-wheel-turn ${SPIN_MS}ms linear var(--spin-delay,0ms) both; }
.life2 .life2-spin-value { display:grid; place-items:center; }
.life2 .life2-spin-value > span { grid-area:1 / 1; }
.life2 .life2-roll-question { visibility:hidden; }
.life2 .life2-roll-question::before { content:'?'; }
.life2 :is([data-spinning],[data-rolling]) .life2-roll-question {
  animation:life2-wheel-question ${SPIN_MS}ms linear var(--spin-delay,0ms) both; }
.life2 :is([data-spinning],[data-rolling]) .life2-roll-value {
  animation:life2-wheel-number ${SPIN_MS}ms linear var(--spin-delay,0ms) both; }
.life2 [data-spinning] .life2-spin-total { animation-name:life2-wheel-total; }
/* Decorative sectors have no pointer or numbered wedges. The engine supplies both values. */
@keyframes life2-wheel-turn {
  0% { transform:rotate(0deg); animation-timing-function:cubic-bezier(.12,.8,.22,1); }
  80%,100% { transform:rotate(1080deg); }
}
@keyframes life2-wheel-question { 0%,54.99% { visibility:visible; } 55%,100% { visibility:hidden; } }
@keyframes life2-wheel-number {
  0%,54.99% { visibility:hidden; transform:scale(.8); }
  55% { visibility:visible; transform:scale(.8); }
  69% { transform:scale(1.08); }
  80%,100% { visibility:visible; transform:scale(1); }
}
@keyframes life2-wheel-total {
  0%,79.99% { visibility:hidden; transform:scale(.8); }
  80% { visibility:visible; transform:scale(.8); }
  92% { transform:scale(1.08); }
  100% { visibility:visible; transform:scale(1); }
}
@media(prefers-reduced-motion:reduce) {
  .life2 .life2-wheel-face::before,.life2 .life2-roulette-disc,.life2 .life2-spin-value > span,
  .life2 .life2-spin-total { animation:none!important; }
}
`;

export function diceDisplay(dice: readonly number[]) {
  const numbers = dice.join(dice.length === 2 ? ' + ' : ' · ') || 'GO!';
  const total = dice.length === 2 ? dice[0] + dice[1] : undefined;
  return { numbers, total, text: total === undefined ? numbers : `${numbers} = ${total}`,
    label: `룰렛 ${dice.join(', ')}${total === undefined ? '' : ` 합계 ${total}`}` };
}

function spinValue(value: string) {
  const face = el('span', 'life2-spin-value');
  face.append(el('span', 'life2-roll-question'), el('span', 'life2-roll-value', value));
  return face;
}

export function roulette(dice: readonly number[], spinning: boolean, remaining?: number, stop?: string) {
  const display = el('div', 'life2-roulette');
  display.setAttribute('aria-hidden', 'true');
  if (spinning) display.dataset.spinning = '';
  const hub = el('strong');
  const value = diceDisplay(dice);
  hub.append(spinValue(value.numbers));
  if (value.total !== undefined) hub.append(el('span', 'life2-roll-value life2-spin-total', ` = ${value.total}`));
  if (remaining !== undefined) hub.append(el('small', 'life2-remaining', `남은 걸음 ${remaining}`));
  // A forced stop says why the token stops short of the sum, on its own line under the count.
  if (remaining !== undefined && stop) hub.append(el('small', 'life2-remaining life2-stop-reason', stop));
  display.append(el('span', 'life2-roulette-disc'), hub);
  return display;
}

/** A single spin clock survives DOM replacement. Only the latest disc may complete it. */
export function spinMotion() {
  const started = performance.now();
  let display: HTMLElement | undefined, control: HTMLElement | undefined, complete: (() => void) | undefined;
  const elapsed = () => Math.max(0, performance.now() - started);
  function settle() {
    if (display) delete display.dataset.spinning;
    if (control) delete control.dataset.rolling;
  }
  return {
    elapsed, settle,
    mount(nextDisplay: HTMLElement, nextControl: HTMLElement) {
      display = nextDisplay; control = nextControl;
      const delay = `-${Math.min(SPIN_MS, elapsed())}ms`;
      display.style.setProperty('--spin-delay', delay);
      control.style.setProperty('--spin-delay', delay);
      const disc = display.querySelector<HTMLElement>('.life2-roulette-disc')!;
      disc.addEventListener('animationend', event => {
        if (display === nextDisplay && event.target === disc && event.animationName === 'life2-wheel-turn') complete?.();
      });
    },
    wait(advance: () => void) {
      let active = true;
      const finish = () => {
        if (!active) return;
        active = false; clearTimeout(timer); complete = undefined;
        settle(); advance();
      };
      // The spin clock owns the 700ms boundary (timing model and layout gate). The disc reaches its final
      // angle and shows the number at 80%, so ending on the clock never cuts the motion; a missing
      // animation event (hidden tab, removed node, motion preference) cannot trap the turn either.
      const timer = setTimeout(finish, Math.max(0, SPIN_MS - elapsed()));
      complete = finish;
      return () => { active = false; clearTimeout(timer); complete = undefined; };
    },
  };
}

export function wheel(dice: readonly number[], mode: 'ready' | 'spin' | 'idle' | 'move' | 'transfer', act: (event?: MouseEvent) => void) {
  const label = mode === 'ready' ? '룰렛 돌리기' : mode === 'spin' ? '멈추기' : mode === 'idle' ? '' : '건너뛰기';
  const control = mode === 'idle' ? el('output', 'life2-dice life2-wheel')
    : button('', 'life2-spin life2-wheel', (event?: MouseEvent) => {
      if ((event?.detail ?? 0) <= 1) act(event);
    }, mode === 'spin' ? 'stop-spin' : mode === 'ready' ? 'spin' : 'skip-move');
  if (mode === 'ready') control.dataset.option = 'spin';
  if (mode === 'spin') control.dataset.rolling = '';
  control.setAttribute('aria-label', mode === 'ready' ? `룰렛 두 개 ${label}` : [diceDisplay(dice).label, label].filter(Boolean).join(' '));
  for (let index = 0; index < 2; index++) {
    const value = String(dice[index] ?? '—');
    const face = el('span', 'life2-wheel-face', mode === 'spin' ? undefined : value);
    if (mode === 'spin') face.append(spinValue(value));
    face.dataset.die = String(index); face.setAttribute('aria-hidden', 'true'); control.append(face);
  }
  if (mode === 'ready') { const marker = progressDrone(); marker.classList.add('life2-menu-marker'); control.append(marker); }
  if (label) control.append(el('span', '', label));
  return control;
}
