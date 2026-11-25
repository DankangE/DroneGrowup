import { POLISH as P } from './polish-data.ts';
import { careerRows, educationBody, graduateCost, humanCopy, stageView, visibleOptions } from './polish-model.ts';
import type { DisplayRow, StageView } from './polish-model.ts';
import { currentEvent, forecast, options } from '../../life/engine.ts';
import type { Forecast, OptionView, Result } from '../../life/engine.ts';
import { STAT_LABEL } from '../../life/life-data.ts';
import { reviewNotice } from '../../life/career2.ts';
import type { GameState, PlaceId, Stat, StatMap, Status, TrackId } from '../../life/types.ts';
import { PLACES, WORLD } from '../../life/world.ts';
import { COPY, FULLSCREEN_POPUPS, LIFE_COPY, POPUP_DEFINITIONS, POPUP_RULES } from './data.ts';
import type { PhoneTab, PopupKind } from './data.ts';
import { chapterLines, lifeTabs } from './life-model.ts';
import type { LifeSummaryView, LifeTabModel } from './life-model.ts';

export type PopupChoice = { id: string; title: string; enabled: boolean; summary: string; details: string[]; destination?: string };
export type PopupModel = {
  kind: PopupKind; phase: string; title: string; lines: string[]; choices: PopupChoice[];
  place: PlaceId; track: TrackId | null; fullscreen: boolean; notification: boolean;
  roll?: Result['roll'];
  tabs?: LifeTabModel[];
  presentation?: boolean;
  rows?: DisplayRow[]; stage?: StageView; motion?: 'rankup' | 'demotion' | 'stage';
};
export type PopupContext = {
  kind?: PopupKind; offered?: readonly OptionView[]; previews?: Readonly<Record<string, Forecast>>;
  result?: Result; title?: string; lines?: readonly string[];
  summary?: LifeSummaryView; before?: GameState; rows?: DisplayRow[]; stage?: StageView;
  destinations?: Readonly<Record<string, string>>;
};

/** Presentation routing only. Unknown ids remain ordinary engine choices. */
export function popupKind(state: GameState, offered: readonly OptionView[]): PopupKind | undefined {
  if (state.phase === 'ended') return undefined;
  if (offered.some(option => option.id.startsWith('start:'))) return 'start';
  if (offered.some(option => /^retire:(pension|rehire|switch)$/.test(option.id))) return 'retirement';
  if (offered.some(option => option.id === 'job:none') && reviewNotice(state)) return 'review';
  if (offered.some(option => option.id.startsWith('job:'))) return 'job';
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

/** Prefer sentence/line boundaries, then whitespace. Only an overlong unbroken token is split. */
export function textPages(lines: readonly string[], limit: number = POPUP_RULES.textPage): string[] {
  const pages: string[] = [];
  let rest = Array.from(lines.filter(Boolean).join(' · ').replace(/\s+/gu, ' '));
  while (rest.length > limit) {
    const window = rest.slice(0, limit).join('');
    const sentence = [...window.matchAll(/(?:[.!?。！？]\s+| · )/gu)].at(-1);
    const word = [...window.matchAll(/\s+/gu)].at(-1);
    const boundary = sentence ?? word;
    const end = boundary ? Array.from(window.slice(0, boundary.index! + boundary[0].length)).length : limit;
    pages.push(rest.slice(0, end).join('').replace(/ · $/, '')); rest = rest.slice(end);
  }
  pages.push(rest.join(''));
  return pages;
}
export const shortTitle = (title: string) => Array.from(title).length <= POPUP_RULES.titleLength ? title
  : `${Array.from(title).slice(0, POPUP_RULES.titleLength - 1).join('')}…`;
const deltas = (values: StatMap, status?: Status) => Object.entries(values)
  .filter(([stat]) => stat !== 'rank' || !status || status === 'working')
  .map(([stat, value]) => COPY.delta(STAT_LABEL[stat as Stat], value!)).join(' · ');

export function choiceSummary(option: OptionView, preview?: Forecast): string {
  if (/^(phone:retire|early-retire|retire:early)$/.test(option.id)) return preview?.branches[0]?.deltas.money === undefined ? P.retireFace : P.retireBalance(preview.branches[0].deltas.money);
  if (option.id === 'graduate:enroll') return graduateCost();
  const cost = preview?.cost ?? option.cost, tire = preview?.tire ?? option.tire;
  const chance = preview?.chance ?? option.roll?.chance;
  const money = preview?.branches.length === 1 ? preview.branches[0].deltas.money : undefined;
  if (/^(start:|retire:)/.test(option.id)) return option.desc.split(/(?<=[.!?])\s*/u)[0];
  if (money !== undefined && money !== -cost) return [COPY.moneyEffect(money),
    ...(tire ? [COPY.staminaCost(tire)] : []), ...(chance === undefined ? [] : [COPY.chance(chance)])].join(' · ');
  return COPY.cost(cost, tire, chance);
}
function choiceModel(option: OptionView, preview?: Forecast): PopupChoice {
  const summary = choiceSummary(option, preview);
  const locks = option.locks.map(humanCopy);
  const details = [option.title, option.desc, summary, ...locks];
  if (preview) for (const branch of preview.branches) {
    details.push(`${COPY.expected} · ${COPY[branch.id]}: ${deltas(branch.deltas, branch.status) || COPY.noChange}`);
    if (branch.status) details.push(LIFE_COPY.status[branch.status]);
    if (branch.endsSeason) details.push(COPY.endsSeason);
    for (const line of branch.accrual ?? []) details.push(COPY.delta(line.label, line.amount));
  }
  if (option.sure) details.push(option.sure.text);
  if (option.roll) details.push(`${COPY.success}: ${option.roll.success.text}`, `${COPY.fail}: ${option.roll.fail.text}`);
  return { id: option.id, title: humanCopy(option.title), enabled: option.enabled, summary: !option.enabled && locks.length ? option.id === 'express:D-o0' && option.locks.some(lock => lock.includes('invite'))
      ? P.zoneLock : locks[0] : summary, details: details.map(humanCopy) };
}

/** No eligibility, salary or review rules here: everything displayed comes from engine views/state. */
export function popupModel(state: GameState, context: PopupContext = {}): PopupModel | undefined {
  const offered = context.offered ?? options(state), kind = context.kind ?? popupKind(state, offered);
  if (!kind) return undefined;
  const event = kind === 'event' ? currentEvent(state) : null, result = context.result;
  const place = event?.place ?? result?.place ?? WORLD.find(node => node.id === state.board.pos)!.place;
  const education = kind === 'education' ? educationBody(state) : undefined;
  const title = context.title ?? education?.title ?? result?.luck?.title ?? (kind === 'event' ? event?.title : kind === 'result' ? result?.title : undefined)
    ?? POPUP_DEFINITIONS[kind].title;
  const notice = kind === 'review' ? reviewNotice(state) : null;
  const lines = [...(context.lines ?? (notice ? [notice.text] : event ? [event.text] : result ? [] : [education?.body ?? PLACES[place].name]))];
  if (kind === 'chapter' || kind === 'retirement') lines.push(...chapterLines(state, context.summary));
  if (kind === 'review' || kind === 'rankup' || kind === 'demotion') {
    lines.push(COPY.review(state.job.perf, state.job.tenure, state.job.warn));
  }
  if (result) {
    lines.push(result.luck?.text ?? result.text, ...(!context.rows ? [deltas(result.deltas, result.statusTo),
      deltas(result.settle?.deltas ?? {}, result.statusTo)] : []), ...result.notes.filter(note => note !== result.luck?.text));
    if (result.roll) lines.push(result.roll.success ? COPY.success : COPY.fail, COPY.roll(result.roll.value, result.roll.chance));
    if (result.season) lines.push(`${result.season.from} → ${result.season.to}`, COPY.refill(result.season.refill));
    for (const line of result.upkeep?.lines ?? result.season?.accrual ?? []) lines.push(COPY.delta(line.label, line.amount));
  }
  // A caller supplying future option ids also supplies their previews, if available.
  // Never ask the current engine to resolve an id it does not know yet.
  const visible = kind === 'result' ? [] : kind === 'phone' ? phoneChoices(offered, 'all')
    : visibleOptions(state, offered, kind === 'wedding').sort((a, b) => choiceOrder(a.id) - choiceOrder(b.id));
  const choices = visible.map(option => ({ ...choiceModel(option,
    context.previews?.[option.id] ?? (context.offered === undefined ? forecast(state, option.id) : undefined)),
    ...(context.destinations?.[option.id] && { destination: context.destinations[option.id] }) }));
  if (kind === 'review') for (const choice of choices) if (choice.id === 'job:none') {
    choice.title = P.acknowledge; choice.summary = P.acknowledged; choice.details = [P.acknowledge, P.acknowledged];
  }
  const card = FULLSCREEN_POPUPS.includes(kind);
  return { kind, phase: POPUP_DEFINITIONS[kind].phase, title: humanCopy(title), lines: [...new Set(lines.filter(Boolean).map(humanCopy))], choices, place, track: state.track ?? context.before?.track ?? state.job.tracks.at(-1) ?? null,
    ...(card && { rows: context.rows ?? careerRows(state, context.before) }),
    ...(!card && context.rows && { rows: context.rows }),
    ...((kind === 'chapter' || context.stage) && { stage: context.stage ?? stageView(state) }),
    fullscreen: FULLSCREEN_POPUPS.includes(kind), notification: kind === 'result' && !result?.roll,
    ...(kind === 'my-life' && { tabs: lifeTabs(state, context.summary) }),
    ...(result?.roll && { roll: { ...result.roll } }) };
}

// Presentation order only: promotion first, quitting last, stable order for all other choices.
const choiceOrder = (id: string) => id === 'promo' ? -1 : id === 'quit' ? 1 : 0;

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
