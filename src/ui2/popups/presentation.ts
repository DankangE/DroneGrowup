import { derived } from '../../life/engine.ts';
import type { Result } from '../../life/engine.ts';
import { rankChange, reviewNotice } from '../../life/career2.ts';
import { LIFE_RULES, STAT_LABEL } from '../../life/life-data.ts';
import type { GameState } from '../../life/types.ts';
import { CHAPTER_COPY, COPY, POPUP_RULES } from './data.ts';
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
  const queue: PopupModel[] = [];
  const add = (context: PopupContext) => queue.push({ ...popupModel(state, { offered: [], ...context })!, presentation: true });
  const change = rankChange(before, state);
  const rankCard = before.status === 'working' && change &&
    (change.kind === 'promotion' || change.kind === 'demotion' || (change.kind === 'dismissal' && result.optionId !== 'quit'
      && !result.optionId.startsWith('retire:')));
  const notice = reviewNotice(state);
  if (rankCard) add({ kind: change.kind === 'promotion' ? 'rankup' : 'demotion',
    title: change.kind === 'dismissal' ? notice?.title : undefined,
    result: result.season ? undefined : result,
    lines: [COPY.rankChange(change.from.title, change.to.title), COPY.salaryChange(change.from.salary, change.to.salary),
      ...change.maintenance, ...(notice ? [notice.text] : [])] });
  else if (change?.kind === 'retirement') add({ kind: 'retirement', title: COPY.retirement, result });
  else if (result.luck) add({ kind: 'luck', result });
  else if (result.optionId !== 'spin' && !result.optionId.startsWith('go:')) add({ kind: 'result', result });

  if (result.season) {
    const previous = derived(before), current = derived(state);
    if (current.season === LIFE_RULES.spring) {
      const lines = notice ? [notice.text] : [];
      for (const stat of ['happy', 'homeIndex', 'fans'] as const) {
        if (state.s[stat] !== before.s[stat]) lines.push(COPY.annualStat(STAT_LABEL[stat], before.s[stat], state.s[stat]));
      }
      if (state.fund.amount !== before.fund.amount) lines.push(COPY.fundChange(before.fund.amount, state.fund.amount));
      if (lines.length || rankCard) {
        // The annual card includes the close accounting; avoid a duplicate plain result.
        if (queue[0]?.kind === 'result') queue.shift();
        add({ kind: 'year-end', lines, result });
      }
    }
    if (current.period !== previous.period) add({ kind: 'chapter',
      summary: { netWorth: current.netWorth, nextPeriod: CHAPTER_COPY[current.period] ?? current.period } });
  }
  return queue;
}
