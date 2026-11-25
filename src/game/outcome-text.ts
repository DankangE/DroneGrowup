// Korean outcome copy shared by the cards, the result sheet and the executable text check.
import { grade } from './career.ts';
import { FLAG_LABEL, STAGES, STAT_LABEL } from './data.ts';
import { endingInfo, num } from './engine.ts';
import type { BranchForecast, BranchId, Forecast, GameState, Result, Stat, StatMap } from './types.ts';

export const BOOKKEEPING: ReadonlySet<Stat> = new Set(['acts', 'flights', 'crashes', 'wins', 'losses', 'overdue']);
const stats = Object.keys(STAT_LABEL) as Stat[];
const visible = stats.filter(k => !BOOKKEEPING.has(k));
const unit = (k: Stat) => ['money', 'debt', 'value'].includes(k) ? '만원' : ['support', 'cond'].includes(k) ? '%' : '';
export const statValue = (k: Stat, value: number) => num(value) + unit(k);
export const signed = (value: number) => (value > 0 ? '+' : '') + num(value);
export const token = (k: Stat, value: number) => STAT_LABEL[k] + ' ' + (value >= 0 ? '+' : '') + statValue(k, value);

const statByLabel = new Map(stats.map(k => [STAT_LABEL[k], k]));
const tokenPattern = new RegExp(`(${[...statByLabel.keys()].join('|')}) ([+-][\\d,]+)(만원|%)?`, 'g');
export function parseTokens(text: string): StatMap {
  const parsed: StatMap = {};
  for (const [, label, amount, suffix] of text.matchAll(tokenPattern)) {
    const k = statByLabel.get(label)!;
    if ((suffix ?? '') !== unit(k)) throw new Error(`Unexpected unit in ${label} ${amount}${suffix ?? ''}`);
    parsed[k] = (parsed[k] ?? 0) + Number(amount.replaceAll(',', ''));
  }
  return parsed;
}

type Markers = Pick<BranchForecast, 'flag' | 'stage' | 'end'>;
function markers({ flag, stage, end }: Markers) {
  const parts: string[] = [];
  if (flag) parts.push((FLAG_LABEL[flag] ?? flag) + ' 획득');
  if (stage) parts.push('→ ' + STAGES[stage].name);
  if (end) parts.push('엔딩: ' + endingInfo(end).title);
  return parts;
}

export function price({ cost, tire }: Pick<Forecast, 'cost' | 'tire'>) {
  return (cost ? statValue('money', cost) : '무료') + (tire ? ' · ' + token('stamina', -tire) : '');
}

export const restGain = (f: Forecast) => token('stamina', f.branches[0].deltas.stamina ?? 0);

export function detailLabel(title: string, f: Forecast, rest?: 'light' | 'full') {
  if (rest) return [title, restGain(f), ...(rest === 'full' ? ['계절 전체'] : [])].join(' · ');
  return (f.chance === undefined ? '실행' : `룰렛 돌리기 · ${f.chance}%`) + ' · ' + price(f);
}

export type ForecastLine = { id: 'upfront' | BranchId; text: string };
export function forecastLines(f: Forecast): ForecastLine[] {
  const lines: ForecastLine[] = [];
  const upfront: StatMap = {};
  if (f.chance !== undefined && (f.cost || f.tire)) {
    if (f.cost) upfront.money = -f.cost;
    if (f.tire) upfront.stamina = -f.tire;
    const fees = visible.filter(k => upfront[k]).map(k => token(k, upfront[k]!));
    lines.push({ id: 'upfront', text: '선불 · ' + fees.join(' · ') + ' (성공·실패 무관)' });
  }
  const fail = f.branches.find(b => b.id === 'fail');
  for (const b of f.branches) {
    const base = b.id === 'crash' ? fail : undefined;
    const parts: string[] = [];
    for (const k of visible) {
      const delta = b.deltas[k] ?? 0;
      const value = delta - (upfront[k] ?? 0);
      if (base ? delta !== (base.deltas[k] ?? 0) : value !== 0) parts.push(token(k, value));
    }
    parts.push(...markers({ flag: b.flag !== base?.flag ? b.flag : undefined,
      stage: b.stage !== base?.stage ? b.stage : undefined, end: b.end !== base?.end ? b.end : undefined }));
    if (!parts.length) parts.push('변화 없음');
    if (b.endsSeason) parts.push('→ 계절 종료');
    const label = { sure: '확정', success: '성공', fail: '실패', crash: `추락 시(${f.crashPct}%)` }[b.id];
    if (base) parts.unshift('실패 수치 대체');
    lines.push({ id: b.id, text: label + ': ' + parts.join(' · ') });
  }
  return lines;
}

export function resultChips(result: Result, before: GameState) {
  return visible.filter(k => result.deltas[k]).map(k => {
    const delta = result.deltas[k]!;
    const from = grade(k, before.s[k]);
    const to = grade(k, before.s[k] + delta);
    const suffix = from && to && from.letter !== to.letter ? ` · ${from.letter} → ${to.letter}` : '';
    return { text: token(k, delta) + suffix, positive: k === 'debt' ? delta < 0 : delta > 0 };
  });
}

export const resultMarkers = (r: Result) => markers({ flag: r.flag,
  stage: r.stageTo !== r.stageFrom ? r.stageTo : undefined, end: r.ended });

export function settlementText(result: Result) {
  if (!result.settle || !result.season || !result.upkeep) return;
  const { from, to, auto, rest, refill } = result.season;
  const { lines, total } = result.upkeep;
  const { deltas } = result.settle;
  // Voluntary rest was the option itself and already has a chip. Wind-down belongs to settlement.
  const recovery = (auto && rest ? `휴식 +${rest} · ` : '') + `계절 회복 +${refill}`;
  const ledger = (lines.length <= 3 ? lines : [{ label: '합계', amount: total }])
    .map(l => l.label + ' ' + signed(l.amount) + '만원');
  const other = visible.filter(k => k !== 'stamina' && k !== 'money' && deltas[k]).map(k => token(k, deltas[k]!));
  return { date: from.replace(' · ', ' ') + ' → ' + to.replace(' · ', ' '), recovery, ledger, other };
}
