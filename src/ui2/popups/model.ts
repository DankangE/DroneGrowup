import { currentEvent, forecast, options } from '../../life/engine.ts';
import type { Forecast, OptionView, Result } from '../../life/engine.ts';
import { STAT_LABEL } from '../../life/life-data.ts';
import type { GameState, PlaceId, Stat, StatMap, TrackId } from '../../life/types.ts';
import { PLACES, WORLD } from '../../life/world.ts';
import { COPY, FULLSCREEN_POPUPS, POPUP_DEFINITIONS, POPUP_RULES } from './data.ts';
import type { PhoneTab, PopupKind } from './data.ts';
import { chapterLines, lifeTabs } from './life-model.ts';
import type { LifeSummaryView, LifeTabModel } from './life-model.ts';

export type PopupChoice = { id: string; title: string; enabled: boolean; summary: string; details: string[]; destination?: string };
export type PopupModel = {
  kind: PopupKind; phase: string; title: string; lines: string[]; choices: PopupChoice[];
  place: PlaceId; track: TrackId | null; fullscreen: boolean; notification: boolean;
  roll?: Result['roll'];
  tabs?: LifeTabModel[];
};
export type PopupContext = {
  kind?: PopupKind; offered?: readonly OptionView[]; previews?: Readonly<Record<string, Forecast>>;
  result?: Result; title?: string; lines?: readonly string[];
  summary?: LifeSummaryView;
  destinations?: Readonly<Record<string, string>>;
};

/** Presentation routing only. Unknown ids remain ordinary engine choices. */
export function popupKind(state: GameState, offered: readonly OptionView[]): PopupKind | undefined {
  if (state.phase === 'ended') return undefined;
  if (offered.some(option => option.id.startsWith('start:'))) return 'start';
  if (offered.some(option => option.id.startsWith('job:'))) return 'job';
  if (offered.some(option => /^retire:(pension|rehire|switch)$/.test(option.id))) return 'retirement';
  if (offered.some(option => /^wed:/.test(option.id))) return 'wedding';
  if (offered.some(option => /^(edu|gift):/.test(option.id))) return 'education';
  if (offered.some(option => /^home:/.test(option.id))) return 'estate';
  if (offered.some(option => /^biz:/.test(option.id))) return 'biz';
  if (offered.some(option => /^fund:/.test(option.id))) return 'fund';
  if (offered.some(option => /^(buy|sell):/.test(option.id))) return 'shop';
  if (state.phase === 'event') return 'event';
  // Luck/express ids are not specified yet: route by the tile, keep all offered ids unchanged.
  if (state.board.step === 'space') {
    const kind = WORLD.find(node => node.id === state.board.pos)?.kind;
    if (kind === 'luck') return 'luck';
    if (kind === 'station') return 'transfer';
    if (kind === 'shop' || kind === 'estate' || kind === 'biz') return kind;
    if (kind === 'invest') return 'fund';
  }
  if (state.board.step === 'space') return 'space';
  if (state.board.step === 'bonus') return 'bonus';
  return undefined;
}

export function choicePage<T>(items: readonly T[], requested = 0) {
  const count = Math.max(1, Math.ceil(items.length / POPUP_RULES.pageSize));
  const page = Number.isFinite(requested) ? Math.max(0, Math.min(count - 1, Math.trunc(requested))) : 0;
  return { page, count, items: items.slice(page * POPUP_RULES.pageSize, (page + 1) * POPUP_RULES.pageSize) };
}

/** Fixed text pages keep even long stored text readable without scrolling or HTML. */
export function textPages(lines: readonly string[]): string[] {
  const text = Array.from(lines.filter(Boolean).join(' · ').replace(/\s+/gu, ' '));
  return Array.from({ length: Math.max(1, Math.ceil(text.length / POPUP_RULES.textPage)) }, (_, index) =>
    text.slice(index * POPUP_RULES.textPage, (index + 1) * POPUP_RULES.textPage).join(''));
}
export const shortTitle = (title: string) => Array.from(title).length <= POPUP_RULES.titleLength ? title
  : `${Array.from(title).slice(0, POPUP_RULES.titleLength - 1).join('')}…`;
const deltas = (values: StatMap) => Object.entries(values)
  .map(([stat, value]) => COPY.delta(STAT_LABEL[stat as Stat], value!)).join(' · ');

function choiceModel(option: OptionView, preview?: Forecast): PopupChoice {
  const summary = COPY.cost(preview?.cost ?? option.cost, preview?.tire ?? option.tire,
    preview?.chance ?? option.roll?.chance);
  const details = [option.title, option.desc, summary, ...option.locks];
  if (preview) for (const branch of preview.branches) {
    details.push(`${COPY.expected} · ${COPY[branch.id]}: ${deltas(branch.deltas) || COPY.noChange}`);
    if (branch.endsSeason) details.push(COPY.endsSeason);
    for (const line of branch.accrual ?? []) details.push(COPY.delta(line.label, line.amount));
  }
  if (option.sure) details.push(option.sure.text);
  if (option.roll) details.push(`${COPY.success}: ${option.roll.success.text}`, `${COPY.fail}: ${option.roll.fail.text}`);
  return { id: option.id, title: option.title, enabled: option.enabled, summary, details };
}

/** No eligibility, salary or review rules here: everything displayed comes from engine views/state. */
export function popupModel(state: GameState, context: PopupContext = {}): PopupModel | undefined {
  const offered = context.offered ?? options(state), kind = context.kind ?? popupKind(state, offered);
  if (!kind) return undefined;
  const event = kind === 'event' ? currentEvent(state) : null, result = context.result;
  const place = event?.place ?? result?.place ?? WORLD.find(node => node.id === state.board.pos)!.place;
  const title = context.title ?? (kind === 'event' ? event?.title : kind === 'result' ? result?.title : undefined)
    ?? POPUP_DEFINITIONS[kind].title;
  const lines = [...(context.lines ?? (event ? [event.text] : [PLACES[place].name]))];
  if (kind === 'chapter' || kind === 'retirement') lines.push(...chapterLines(state, context.summary));
  if (kind === 'review' || kind === 'rankup' || kind === 'demotion') {
    lines.push(COPY.review(state.job.perf, state.job.tenure, state.job.warn));
  }
  if (result) {
    lines.push(result.text, deltas(result.deltas), ...result.notes);
    if (result.roll) lines.push(result.roll.success ? COPY.success : COPY.fail, COPY.roll(result.roll.value, result.roll.chance));
    if (result.season) lines.push(`${result.season.from} → ${result.season.to}`, COPY.refill(result.season.refill));
    for (const line of result.upkeep?.lines ?? result.season?.accrual ?? []) lines.push(COPY.delta(line.label, line.amount));
  }
  // A caller supplying future option ids also supplies their previews, if available.
  // Never ask the current engine to resolve an id it does not know yet.
  const visible = kind === 'result' ? [] : kind === 'phone' ? phoneChoices(offered, 'all') : offered;
  const choices = visible.map(option => ({ ...choiceModel(option,
    context.previews?.[option.id] ?? (context.offered === undefined ? forecast(state, option.id) : undefined)),
    ...(context.destinations?.[option.id] && { destination: context.destinations[option.id] }) }));
  return { kind, phase: POPUP_DEFINITIONS[kind].phase, title, lines: lines.filter(Boolean), choices, place, track: state.track,
    fullscreen: FULLSCREEN_POPUPS.includes(kind), notification: kind === 'result' && !result?.roll,
    ...(kind === 'my-life' && { tabs: lifeTabs(state, context.summary) }),
    ...(result?.roll && { roll: { ...result.roll } }) };
}

export function phoneChoices(offered: readonly OptionView[], tab: PhoneTab): OptionView[] {
  const category = (option: OptionView): PhoneTab | undefined => {
    if (option.kind === 'shop' || /^(buy|sell):/.test(option.id)) return 'shop';
    if (option.kind === 'repair' || option.id === 'repair') return 'repair';
    if (option.kind === 'bank' || /^(loan|repay|fund):/.test(option.id)) return 'bank';
    if (/^(phone:retire|early-retire|retire:early)$/.test(option.id)) return 'retire';
    return undefined;
  };
  return offered.filter(option => {
    const group = category(option);
    return group ? tab === 'all' || tab === group : tab === 'all' && option.id.startsWith('phone:');
  });
}
