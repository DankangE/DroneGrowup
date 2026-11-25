// Compare the published choices at three common chance settings, independently of a run or a bot.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { ACTIONS, EVENTS, RULES, STAGES, STAT_LABEL } from '../src/game/data.ts';
import type { ActionDef, Choice, Cond, Effect, Stage, Stat, StatMap } from '../src/game/types.ts';

const stats = (Object.keys(STAT_LABEL) as Stat[]).filter(stat => stat !== 'acts');
const stages = Object.keys(STAGES) as Stage[];
const bad = new Set<Stat>(['debt', 'crashes', 'overdue', 'losses']);
const points = ['하한', '기본', '상한'];
const entries = (map?: StatMap) => Object.entries(map ?? {}) as [Stat, number][];
const clamp = (pct: number) => Math.max(RULES.chanceMin, Math.min(RULES.chanceMax, pct));

function outcome(choice: Choice, effect: Effect, flight: boolean, failed: boolean) {
  // Hundredths preserve the fractional drone loss. Chances are integer percentages,
  // so token probabilities and both comparisons below use exact integer arithmetic.
  const vector = stats.map(stat => {
    let value = (effect.add?.[stat] ?? 0) * 100;
    if (stat === 'money') value -= (choice.cost ?? 0) * 100;
    if (stat === 'stamina') value -= (choice.tire ?? 0) * 100;
    if (flight && stat === 'cond') value -= (RULES.flight.wear + (failed ? RULES.flight.failWear : 0)) * 100;
    if (flight && failed && stat === 'drone') value -= RULES.flight.crashPct;
    return bad.has(stat) ? -value : value;
  });
  const tokens = entries(effect.set).map(([k, v]) => `set:${k}=${v}`);
  if (effect.flag) tokens.push('flag:' + effect.flag);
  if (effect.stage) tokens.push('stage:' + effect.stage);
  if (effect.end) tokens.push('end:' + effect.end);
  return { vector, tokens };
}

function profile(choice: Choice, flight = false) {
  const { roll } = choice;
  const chances = roll ? [
    roll.base - RULES.stamina.exhaustedPenalty, roll.base,
    roll.base + (roll.mods ?? []).reduce((sum, mod) => sum + mod.cap, 0)
      + RULES.stamina.freshBonus + (flight ? RULES.flight.spareLevelCap : 0),
  ].map(clamp) : [100, 100, 100];
  const outcomes = roll
    ? [outcome(choice, roll.success, flight, false), outcome(choice, roll.fail, flight, true)]
    : [outcome(choice, choice.effect!, flight, false)];
  const values = chances.map(chance => {
    const expected = stats.map(() => 0);
    const worst = stats.map(() => Infinity);
    const tokens = new Map<string, number>();
    for (const [i, branch] of outcomes.entries()) {
      const probability = i === 0 ? chance : 100 - chance;
      for (const [j, value] of branch.vector.entries()) {
        expected[j] += probability * value;
        worst[j] = Math.min(worst[j], value);
      }
      for (const token of branch.tokens) tokens.set(token, (tokens.get(token) ?? 0) + probability);
    }
    return { expected, worst, tokens };
  });
  const empty = !choice.cost && !choice.tire && outcomes.every(o => !o.vector.some(Boolean) && !o.tokens.length);
  return { choice, chances, values, empty };
}
type Profile = ReturnType<typeof profile>;
type Point = Profile['values'][number];

function dominates(a: Point, b: Point) {
  if (a.tokens.size !== b.tokens.size) return false;
  for (const [token, probability] of a.tokens) if (b.tokens.get(token) !== probability) return false;
  let strict = false;
  for (let i = 0; i < stats.length; i++) {
    if (a.expected[i] < b.expected[i] || a.worst[i] < b.worst[i]) return false;
    if (a.expected[i] > b.expected[i] || a.worst[i] > b.worst[i]) strict = true;
  }
  return strict;
}

function requirements(action: ActionDef) {
  const min: StatMap = {}, max: StatMap = {};
  const flags = new Set<string>(), notFlags = new Set<string>();
  for (const cond of [action.when, action.need ?? {}] as Cond[]) {
    for (const [k, v] of entries(cond.min)) min[k] = Math.max(min[k] ?? 0, v);
    for (const [k, v] of entries(cond.max)) max[k] = Math.min(max[k] ?? Infinity, v);
    for (const flag of cond.flags ?? []) flags.add(flag);
    for (const flag of cond.notFlags ?? []) notFlags.add(flag);
  }
  return { stages: action.when.stage ?? stages, min, max, flags, notFlags };
}
type Requirements = ReturnType<typeof requirements>;

function noHarder(a: Requirements, b: Requirements) {
  return a.stages.some(stage => b.stages.includes(stage))
    && entries(a.min).every(([k, v]) => v <= (b.min[k] ?? 0))
    && entries(a.max).every(([k, v]) => v >= (b.max[k] ?? Infinity))
    && [...a.flags].every(f => b.flags.has(f))
    && [...a.notFlags].every(f => b.notFlags.has(f));
}

let checked = 0;
const dominated: string[] = [];
const empty: string[] = [];
const tables: string[] = [];

function compare(label: string, a: Profile, b: Profile) {
  checked++;
  const at = points.filter((_, i) => dominates(a.values[i], b.values[i]));
  if (at.length) dominated.push(`${label} · ${a.choice.title} → ${b.choice.title} (${at.join(', ')})`);
}

function statList(vector: number[], divisor: number) {
  return vector.flatMap((v, i) => {
    if (!v) return [];
    const value = v / divisor;
    return [`${STAT_LABEL[stats[i]]} ${value > 0 ? '+' : ''}${value.toFixed(1)}`];
  }).join(' · ') || '—';
}

function table(title: string, profiles: Profile[]) {
  tables.push('', '## ' + title, '',
    '| 선택 | 비용(만원) | 체력 소모 | 성공률(하한 / 기본 / 상한) | 기본 기대값 | 능력치별 최악 | 기본 결과 표식 |',
    '|---|---:|---:|---|---|---|---|');
  for (const { choice, chances, values, empty: isEmpty } of profiles) {
    const { expected, worst, tokens } = values[1];
    if (isEmpty) empty.push(`${title} · ${choice.title}`);
    const markers = [...tokens].map(([token, pct]) => `${token} ${pct}%`).join(' · ') || '—';
    tables.push(`| ${choice.title} | ${choice.cost ?? 0} | ${choice.tire ?? 0} | ${chances.map(p => p + '%').join(' / ')} | ${statList(expected, 10000)} | ${statList(worst, 100)} | ${markers} |`);
  }
}

for (const event of EVENTS) {
  const profiles = event.choices.map(choice => profile(choice));
  for (const a of profiles) for (const b of profiles) if (a !== b) compare(event.title, a, b);
  table('이벤트 · ' + event.title, profiles);
}
const actions = ACTIONS.map(action => ({ view: profile(action, action.flight), req: requirements(action) }));
const groups = new Map<string, Profile[]>();
for (const a of actions) {
  for (const b of actions) if (a !== b && noHarder(a.req, b.req)) compare('행동', a.view, b.view);
  const group = a.req.stages.length === stages.length ? '모든 단계'
    : stages.filter(stage => a.req.stages.includes(stage)).map(stage => STAGES[stage].name).join(' · ');
  if (!groups.has(group)) groups.set(group, []);
  groups.get(group)!.push(a.view);
}
for (const [group, profiles] of groups) table('행동 · ' + group, profiles);

const summary = `비교한 순서쌍 ${checked}개 · 우위가 있는 쌍 ${dominated.length}개 · 효과 없는 선택 ${empty.length}개`;
const findings = [...dominated.map(s => '- 우위 ' + s), ...empty.map(s => '- 효과 없음 ' + s)];
const report = ['# 선택지 균형 보고서', '', summary, '', ...findings, '',
  '화살표는 우위 선택에서 열위 선택을 가리킨다. 기대값과 최악값에는 비용, 체력 소모, 비행 마모와 실패 시 평균 기체 손실을 포함한다. 빚·추락·연체·실패는 감소할수록 양수다.',
  ...tables, ''].join('\n');
const path = new URL('../docs/balance-report.md', import.meta.url);
console.log([summary, ...findings].join('\n'));
if (process.argv.includes('--write')) {
  writeFileSync(path, report);
} else {
  const stale = !existsSync(path) || readFileSync(path, 'utf8') !== report;
  if (stale) console.error('보고서 갱신 필요 · npm run dominance -- --write');
  if (stale || findings.length) process.exitCode = 1;
}
