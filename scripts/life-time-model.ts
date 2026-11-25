import type { Result, OptionView } from '../src/life/engine.ts';
import { options } from '../src/life/engine.ts';
import type { GameState } from '../src/life/types.ts';
import { WORLD } from '../src/life/world.ts';
import { movementFrames, STEP_MS } from '../src/ui2/move.ts';
import { SPIN_MS } from '../src/ui2/wheel.ts';
import { TRANSFER_MS } from '../src/ui2/transfer.ts';
import { popupKind } from '../src/ui2/popups/model.ts';
import { resultPopups } from '../src/ui2/popups/presentation.ts';
import { POLISH } from '../src/ui2/popups/polish-data.ts';
import { POPUP_RULES } from '../src/ui2/popups/data.ts';
import { LARGE_POPUPS, THINK_MS } from './life-time-data.ts';

export const TIME_MODEL = [
  ...Object.entries(THINK_MS).map(([id, ms]) => ({ id, seconds: ms / 1000 })),
  { id: 'wheel', seconds: SPIN_MS / 1000 }, { id: 'move', seconds: STEP_MS / 1000 },
  { id: 'transfer', seconds: TRANSFER_MS / 1000 }, { id: 'callout', seconds: POLISH.calloutMs / 1000 },
  { id: 'sheet', seconds: POPUP_RULES.enterMs / 1000 },
];
export const timingCounts = (): Record<string, number> => Object.fromEntries(TIME_MODEL.map(row => [row.id, 0]));
export function readingStep(state: GameState, popup?: string | null): keyof typeof THINK_MS {
  return popup && LARGE_POPUPS.includes(popup) ? 'large' : state.phase === 'event' ? 'event' : state.board.step;
}

/** Count the same choices, actual route frames and acknowledgements as the UI.
 * No fixed per-season frequency: F5's removed confirmations contribute zero.
 * Browser/paging overhead is calibrated separately against the identical trace.
 */
export function choiceTiming(before: GameState, after: GameState, result: Result,
  offered: readonly OptionView[] = options(before), menu: 'board' | 'phone' = 'board') {
  const counts = timingCounts();
  counts[readingStep(before, menu === 'phone' ? 'phone' : popupKind(before, offered))]++;
  for (const frame of movementFrames(before.board.pos, result, result.optionId === 'spin')) {
    counts[frame.phase === 'spin' ? 'wheel' : frame.phase]++;
  }
  if (result.move && POLISH.calloutKinds.includes(WORLD.find(node => node.id === after.board.pos)!.kind)) counts.callout++;
  const cards = resultPopups(before, after, result);
  counts.result = cards.length;
  counts.sheet = cards.length + Number(!!popupKind(after, options(after))) + Number(menu === 'phone');
  return { counts, seconds: TIME_MODEL.reduce((sum, row) => sum + row.seconds * counts[row.id], 0) };
}
