import { derived } from '../../life/engine.ts';
import type { Result } from '../../life/engine.ts';
import { rankChange, reviewNotice } from '../../life/career2.ts';
import { LIFE_RULES } from '../../life/life-data.ts';
import type { GameState } from '../../life/types.ts';
import { CHAPTER_COPY, COPY, POPUP_RULES } from './data.ts';
import { SPECIAL_RULES, SPECIAL_TEXT } from '../../life/tracks.ts';
import { POLISH as P } from './polish-data.ts';
import { careerRows, stageView, statChanges } from './polish-model.ts';
import { popupModel } from './model.ts';
import type { PopupContext, PopupModel } from './model.ts';

/** Measure after mounting: both docks use the live board and navigation boxes.
 * The app remounts on resize; popup paging also calls this after each render.
 */
export function placePopupSheet(host: HTMLElement, panel: HTMLElement): void {
  if (panel.dataset.fullscreen !== undefined || typeof panel.getBoundingClientRect !== 'function'
    || !(window.innerWidth < 900)) return;
  const shell = host.closest('.life2-shell');
  const pawn = shell?.querySelector('[aria-current=location]')?.getBoundingClientRect();
  const hud = shell?.querySelector('.life2-hud')?.getBoundingClientRect();
  const navigation = shell?.querySelector('.life2-bottom')?.getBoundingClientRect();
  if (!pawn || !hud || !navigation) return;
  const height = panel.getBoundingClientRect().height, gap = POPUP_RULES.dockGap;
  const top = hud.bottom + gap, bottom = navigation.top - gap - height;
  const fitsAbove = top + height + gap <= pawn.top;
  const fitsBelow = pawn.bottom + gap <= bottom;
  const dock = !fitsBelow && fitsAbove ? 'top' : 'bottom';
  panel.dataset.dock = dock;
  panel.style.setProperty('top', `${dock === 'top' ? top : bottom}px`);
  panel.style.setProperty('bottom', 'auto');
}

/** Acknowledgements of completed transitions, separate from the engine's pending choices.
 * Only compare snapshots/use engine views: do not reroll, apply reviews or calculate pay here.
 */
export function resultPopups(before: GameState, state: GameState, result: Result): PopupModel[] {
  if (state.phase === 'ended' && result.optionId !== 'phone:retire') return [];
  const queue: PopupModel[] = [], changes = statChanges(before, state);
  const add = (context: PopupContext, motion?: PopupModel['motion']) => queue.push({
    ...popupModel(state, { offered: [], before, ...context })!, presentation: true, ...(motion && { motion }) });
  const change = rankChange(before, state), notice = reviewNotice(state);
  const rankCard = before.status === 'working' && change && ['promotion', 'demotion'].includes(change.kind);
  if (rankCard) add({ kind: change.kind === 'promotion' ? 'rankup' : 'demotion',
    rows: careerRows(state, before), ...(!result.season && { result }), lines: [COPY.rankChange(change.from.title, change.to.title)],
  }, change.kind === 'promotion' ? 'rankup' : 'demotion');
  else if (change?.kind === 'retirement' || result.optionId === 'phone:retire') add({
    kind: 'retirement', title: P.retirement, rows: [...careerRows(state, before), ...changes], lines: [result.text] });
  else if (before.status === 'working' && change?.kind === 'dismissal') { add({ kind: 'review',
    title: result.optionId.startsWith('event:retire:') ? P.buyout : result.optionId === 'quit' ? P.departure : P.dismissal,
    rows: [...careerRows(state, before), ...changes], lines: [result.text] });
    queue.at(-1)!.fullscreen = true;
  } else if (result.luck) {
    add({ kind: 'luck', title: result.luck.title, lines: [result.luck.text],
      rows: changes.filter(row => !result.upkeep || !['money', 'debt'].includes(row.stat!)) });
    // The applied lucky card and any payday on the route are separate records.
    if (result.upkeep) add({ kind: 'result', title: P.record, lines: [P.settle(result.upkeep.total)],
      rows: result.upkeep.lines.map(line => ({ label: line.label, value: P.pay(line.amount) })) });
  } else if (result.optionId !== 'spin' && !result.optionId.startsWith('go:')) add({ kind: 'result', result, rows: changes });

  if (result.season && state.phase !== 'ended') {
    const previous = derived(before), current = derived(state);
    if (current.season === LIFE_RULES.spring && (changes.length || notice || rankCard)) {
      if (queue[0]?.kind === 'result') queue.shift();
      const lines = notice ? [notice.text] : [];
      if (result.season.refill < 0) lines.push(COPY.refill(result.season.refill));
      const annual = [...changes];
      if (state.fund.amount !== before.fund.amount) annual.push({ label: '펀드', value: `${before.fund.amount}만 → ${state.fund.amount}만` });
      for (const line of result.season.accrual ?? []) annual.push({ label: line.label, value: P.pay(line.amount) });
      add({ kind: 'year-end', lines, rows: annual });
    }
    if (current.period !== previous.period) add({ kind: 'chapter', lines: [],
      summary: { netWorth: current.netWorth, nextPeriod: CHAPTER_COPY[current.period] ?? current.period } }, 'stage');
  }
  if (!before.flags.includes(SPECIAL_RULES.master) && state.flags.includes(SPECIAL_RULES.master)) {
    add({ kind: 'result', title: P.graduateTitle, lines: [SPECIAL_TEXT.graduated], rows: [{ label: P.graduate, value: P.master }] });
  }
  if (!queue.some(model => model.stage) && (result.optionId.startsWith('start:') || stageView(before).name !== stageView(state).name) && state.phase !== 'ended') {
    if (queue[0]) { queue[0].stage = stageView(state); queue[0].motion ??= 'stage'; }
  }
  return queue;
}
