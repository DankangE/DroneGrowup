import { baseOptionId, dialNotch } from '../src/life/dial.ts';
// §13.2 gates fail closed, including missing/stale T24 timing measurements.
import { writeFileSync } from 'node:fs';
import { GRADE_STEPS } from '../src/life/data.ts';
import { availableParallelism } from 'node:os';
import { pathToFileURL } from 'node:url';
import { isMainThread, parentPort, Worker, workerData } from 'node:worker_threads';
import { BOT_LIMITS, bankChoice, phoneWanted, pickBot, POLICIES, POLICY_IDS, worthwhilePhone } from '../src/life/bots.ts';
import type { BotContext, PolicyId } from '../src/life/bots.ts';
import { CAREER_KEYS } from '../src/life/career2.ts';
import { ECONOMY_TEXT } from '../src/life/economy.ts';
import { finalNetWorth, settlementSummary } from '../src/life/ending.ts';
import { ALL_EVENTS, choose, emptyBonus, newGame, options } from '../src/life/engine.ts';
import { choose as interactiveChoose } from '../src/life/flow.ts';
import type { OptionView, Result } from '../src/life/engine.ts';
import { ENDINGS2, ENDING_KEYS, ENDING_RULES, LIFE_RULES, MAP_IDS } from '../src/life/life-data.ts';
import { TRACKS } from '../src/life/tracks.ts';
import type { GameState, MapId } from '../src/life/types.ts';

import { TIME_MODEL, choiceTiming, timingCounts } from './life-time-model.ts';
import { readCalibration } from './life-time-calibration.ts';
export { TIME_MODEL } from './life-time-model.ts';
export const AGES = [25, 30, 40, 50, 60, 70];
const TARGETS = [1200, 3500, 12000, 28000, 45000, 55000];
const C = { runs: 300, coverageRuns: 3000, minute: 60, percent: 100, scoreCap: 59970, workers: 8 };
export type Experiment = 'base' | 'single' | 'no-bank' | 'no-cards';
export type TraceStep = { before: GameState; after: GameState; option: OptionView; result: Result; menu: 'board' | 'phone' };
export type RunReport = {
  dialCounts: Record<'safe' | 'mid' | 'bold', number>; flightRolls: number; flightSuccesses: number; flightCrashes: number;
  policy: PolicyId; seed: number; experiment: Experiment; turn: number; steps: number; score: number; worth: number;
  happy: number; meanHappy: number; feat: number; grade: string; ending: string; noLoan: boolean; debtSeasons: number;
  income: number; spending: number; cashHeavy: boolean; firstJob: number | null; top: boolean; demoted: boolean;
  dismissed: boolean; specials: number; jobs: string[]; maps: number[]; visited: number; choices: number; forks: number;
  noCar: number; seconds: number[]; activities: Record<string, number>; wealth: Record<string, number>;
  events: Record<string, number>; cardUses: Record<string, number>; promotions: { cohort: 'specialist' | 'ordinary'; rank: number; seasons: number }[];
  earlyS: boolean; zone: Record<string, { income: number; seasons: number }>; bankUses: number; violations: number; rerolls: number; skipped: number;
};
const counts = timingCounts;
const periodAt = (turn: number) => LIFE_RULES.periods.findIndex(p => LIFE_RULES.startAge + Math.floor(turn / LIFE_RULES.seasons.length) <= p.maxAge);
const planned = (r: RunReport) => r.policy !== 'random' && r.policy !== 'drifter';
const sum = (ns: number[]) => ns.reduce((a, b) => a + b, 0);
const mean = (ns: number[]) => ns.length ? sum(ns) / ns.length : NaN;
const median = (ns: number[]) => { const a = [...ns].sort((a,b) => a-b); return a.length ? (a[Math.floor((a.length-1)/2)] + a[Math.floor(a.length/2)]) / 2 : NaN; };
const round = (n: number) => Number.isFinite(n) ? n.toFixed(2) : 'N/A';
const percent = (n: number, d: number) => d && Number.isFinite(n / d) ? round(C.percent * n / d) + '%' : 'N/A';
const rate = (rows: RunReport[], predicate: (r: RunReport) => boolean) => percent(rows.filter(predicate).length, rows.length);

/** Real choose() loop, with one optional phone service per season and a bounded progress guard. */
export function runLife(policy: PolicyId, seed: number, experiment: Experiment = 'base',
  config: { trace?: (step: TraceStep) => void; keepLog?: boolean; stepLimit?: number; dial?: 'mid' } = {}): { state: GameState; report: RunReport } {
  let state = newGame(seed), seasonSteps = 0, phoneUsed = false, tried: string[] = [], salaryIncome = 0, invested = 0;
  let spin = 0, tile = 0, bonus = 0, rerolls = 0, happySum = 0, promotionAt = 0, seasonNet = 0;
  const report: RunReport = { dialCounts: { safe: 0, mid: 0, bold: 0 }, flightRolls: 0, flightSuccesses: 0, flightCrashes: 0, policy, seed, experiment, turn: 0, steps: 0, score: 0, worth: 0, happy: 0, meanHappy: 0,
    feat: 0, grade: '', ending: '', noLoan: true, debtSeasons: 0, income: 0, spending: 0, cashHeavy: false,
    firstJob: null, top: false, demoted: false, dismissed: false, specials: 0, jobs: [], maps: MAP_IDS.map(() => 0),
    visited: 0, choices: 0, forks: 0, noCar: 0, seconds: LIFE_RULES.periods.map(() => 0), activities: counts(),
    wealth: {}, events: {}, cardUses: {}, promotions: [], earlyS: false, zone: {}, bankUses: 0, violations: 0, rerolls: 0, skipped: 0 };
  while (state.phase !== 'ended') {
    if (++seasonSteps > (config.stepLimit ?? BOT_LIMITS.stepsPerSeason)) throw new Error(`stuck ${policy}/${seed}/${experiment} turn=${state.turn} ${state.board.step}`);
    const before = state, context: BotContext = { phoneUsed, tried, noBank: experiment === 'no-bank', noCards: experiment === 'no-cards', dial: config.dial ?? (process.env.SIM_DIAL === 'mid' ? 'mid' : undefined), salaryIncome, invested };
    let menu: 'board' | 'phone' = 'board', offered: OptionView[] = [];
    if (phoneWanted(policy, state, context)) {
      phoneUsed = true;
      const phone = options(state, 'phone').filter(o => o.enabled && o.id !== ENDING_RULES.earlyId && !(context.noBank && bankChoice(o.id)));
      if (phone.length) {
        const candidate = pickBot(policy, state, phone, context);
        if (worthwhilePhone(policy, state, candidate, context)) { offered = [candidate]; menu = 'phone'; }
      }
    }
    if (!offered.length) offered = options(state);
    const option = pickBot(policy, state, offered, context), id = baseOptionId(option.id);
    const moves = before.board.step === 'pick' && id.startsWith('go:') ? offered.filter(o => o.id.startsWith('go:')).length : 0;
    const next = choose(state, option.id, menu, experiment === 'single'); state = next.state;
    if (state.turn < (45 - LIFE_RULES.startAge) * LIFE_RULES.seasons.length) {
      report.earlyS ||= Object.entries(GRADE_STEPS).some(([stat, steps]) => stat !== 'stamina' && state.s[stat as keyof typeof state.s] >= steps.at(-1)!);
    }
    const result = next.result, elapsed = state.turn - before.turn;
    if (id.startsWith('card:use:')) { const card = id.slice('card:use:'.length); report.cardUses[card] = (report.cardUses[card] ?? 0) + 1; }
    if (result.roll?.ticks) {
      report.dialCounts[dialNotch(option.id)!]++; report.flightRolls++;
      report.flightSuccesses += Number(result.roll.success); report.flightCrashes += Number(result.crashed);
    }
    if (bankChoice(id)) report.bankUses++;
    if (id.startsWith('fund:in:')) invested += Number(id.split(':')[2]);
    if (id.startsWith('home:buy:') && before.home && before.home.tier >= 3) invested += option.cost;
    tried.push(id); report.steps++;
    // Bots retain their single-step engine semantics. Price presentation as the
    // interactive F5 transaction: collapse only the otherwise empty end menu.
    const timed = menu === 'board' && emptyBonus(state, context.dial !== 'mid') ? interactiveChoose(before, option.id, menu, experiment === 'single') : next;
    const activity = id === 'end' && emptyBonus(before, context.dial !== 'mid') ? counts()
      : choiceTiming(before, timed.state, timed.result, options(before, menu), menu).counts;
    if (id === 'spin' || id === 'card:use:shortcut' && before.board.step === 'spin') spin++;
    if (id === 'card:use:again') { rerolls++; report.rerolls++; }
    if (id === 'spin' || moves) {
      // Auto-travel has one destination. Pick menus count once when the destination is chosen.
      const count = moves || (state.board.step !== 'pick' ? 1 : 0);
      if (count && before.s.car === 0) { report.noCar++; report.choices += count; if (count >= 2) report.forks++; }
    }
    const answering = before.phase === 'event' && /^(ev:|skip$)/.test(id) && before.eventId !== state.eventId;
    if (result.eventId) report.events[result.eventId] = (report.events[result.eventId] ?? 0) + 1;
    if (!option.free && !result.move && id !== 'spin' && !/^(job:|retire:|start:|quit$)/.test(id)) {
      if (before.board.step === 'space') tile++;
      if (before.board.step === 'bonus' && id !== 'end') bonus++;
    }
    const period = Math.max(0, periodAt(before.turn));
    for (const row of TIME_MODEL) { report.activities[row.id] += activity[row.id]; report.seconds[period] += activity[row.id] * row.seconds; }
    // Ledger flow = closing balance - opening balance + cash postings. Count accrual once, not again on payday.
    const labels = new Set([...Object.keys(before.board.ledger), ...Object.keys(state.board.ledger)]);
    for (const line of result.upkeep?.lines ?? []) labels.add(line.label);
    let netIncome = 0;
    for (const label of labels) {
      const flow = (state.board.ledger[label] ?? 0) - (before.board.ledger[label] ?? 0)
        + (result.upkeep?.lines.filter(line => line.label === label).reduce((n,line) => n + line.amount, 0) ?? 0);
      netIncome += flow; if (flow > 0) report.income += flow;
      if (label === ECONOMY_TEXT.salary) salaryIncome += Math.max(0, flow);
      if (([ECONOMY_TEXT.spouse, ECONOMY_TEXT.child, ECONOMY_TEXT.education, ECONOMY_TEXT.housing] as string[]).includes(label)) report.spending += Math.max(0, -flow);
    }
    const capital = /^(loan:|repay:|fund:|home:|sell:|biz:sell:)/.test(id);
    const cashGain = state.s.money - before.s.money + option.cost - (result.upkeep?.total ?? 0);
    if (!capital) report.income += Math.max(0, cashGain);
    seasonNet += netIncome + (capital ? 0 : cashGain - option.cost);
    if (!id.startsWith('fund:')) report.income += Math.max(0, state.fund.amount - before.fund.amount);
    if (/^(home:(buy|rent|move):|biz:(buy|up):|wed:|baby$|edu:|gift:|leisure:|date$)/.test(id)
      || (answering && ['foundation','kid_wedding','golden_wedding'].includes(before.eventId!))) report.spending += option.cost;
    if (before.track === state.track && state.job.rank < before.job.rank) report.demoted = true;
    if (state.timers[CAREER_KEYS.benefitUntil] > before.turn && state.timers[CAREER_KEYS.benefitUntil] !== before.timers[CAREER_KEYS.benefitUntil]
      || (answering && before.eventId === 'layoff' && result.roll?.success === false)) report.dismissed = true;
    const promoted = state.board.rankups - before.board.rankups;
    if (before.track !== state.track) promotionAt = state.turn;
    else if (promoted > 0) {
      const track = TRACKS.find(t => t.id === state.track);
      const specialist = track?.tier === 3 && before.board.pos[0] === 'D';
      if (specialist || (track?.salaried && track.tier < 3)) report.promotions.push({
        cohort: specialist ? 'specialist' : 'ordinary', rank: before.job.rank, seasons: state.turn - promotionAt });
      promotionAt = state.turn;
    }
    if (state.job.rank < before.job.rank) promotionAt = state.turn;
    if (promoted > 0 && (id === 'luck:promote' || answering)) report.specials += promoted;
    if (state.status === 'working' && report.firstJob === null) report.firstJob = LIFE_RULES.startAge + Math.floor(state.turn / LIFE_RULES.seasons.length);
    if (elapsed) {
      report.violations += Number((spin - rerolls !== 1 && !result.effects && id !== ENDING_RULES.earlyId) || tile > 1 || bonus > 1);
      report.skipped += Math.max(0, elapsed - 1); report.debtSeasons += state.s.debt > 0 ? elapsed : 0;
      happySum += state.s.happy * elapsed;
      const map = before.board.pos[0] as MapId; report.maps[MAP_IDS.indexOf(map)] += elapsed;
      const zone = report.zone[map] ??= { income: 0, seasons: 0 }; zone.income += seasonNet; zone.seasons += elapsed;
      for (const age of AGES) { const turn = (age - LIFE_RULES.startAge) * LIFE_RULES.seasons.length;
        if (before.turn < turn && state.turn >= turn) report.wealth[age] = finalNetWorth(state); }
      seasonSteps = 0; phoneUsed = false; tried = []; spin = tile = bonus = rerolls = 0; seasonNet = 0;
    }
    config.trace?.({ before, after: state, option, result, menu });
    // Log is display history; keep it for trace/debug or omit it for cheap batch copies.
    if (!config.keepLog) state.log = [];
  }
  if (state.turn !== LIFE_RULES.maxTurns) throw new Error(`incomplete ${policy}/${seed}: ${state.turn}`);
  const summary = settlementSummary(state), target = POLICIES[policy].tracks.at(-1);
  Object.assign(report, { turn: state.turn, score: state.score, worth: summary.netWorth, happy: state.s.happy,
    meanHappy: happySum / state.turn, feat: summary.featScore, grade: summary.grade, ending: state.ending,
    noLoan: !state.flags.includes(ENDING_KEYS.borrowed), jobs: state.job.tracks,
    top: target ? state.feats.includes(ENDING_KEYS.top(target)) : false,
    cashHeavy: summary.netWorth > 0 && state.s.money * 100 > summary.netWorth * 70,
    visited: MAP_IDS.filter((_,i) => state.board.visited & (1 << i)).length });
  return { state, report };
}

export function table(title: string, headers: string[], rows: (string | number)[][]): string {
  return `${title}\n| ${headers.join(' | ')} |\n| ${headers.map(() => '---').join(' | ')} |\n${rows.map(row => `| ${row.join(' | ')} |`).join('\n')}\n`;
}
export function reportTables(base: RunReport[], single: RunReport[], noBank: RunReport[], noCards: RunReport[] = []): string {
  const planners = base.filter(planned), notRandom = base.filter(r => r.policy !== 'random');
  const avg = (rows: RunReport[], get: (r: RunReport) => number) => mean(rows.map(get));
  const ratio = (rows: RunReport[], a: (r: RunReport) => number, b: (r: RunReport) => number) => percent(sum(rows.map(a)), sum(rows.map(b)));
  const eventTotals = Object.fromEntries(ALL_EVENTS.map(e => [e.id, sum(base.map(r => r.events[e.id] ?? 0))]));
  const coverage = [...base].sort((a,b) => a.seed-b.seed || POLICY_IDS.indexOf(a.policy)-POLICY_IDS.indexOf(b.policy)).slice(0,C.coverageRuns);
  const missing = ALL_EVENTS.filter(e => !coverage.some(r => r.events[e.id])).map(e => e.id);
  const scores = POLICY_IDS.map(id => avg(base.filter(r => r.policy === id), r => r.score));
  const promotionRows = TRACKS.flatMap(t => t.ranks.slice(0,-1).map((_,i) => i)).filter((n,i,a) => a.indexOf(n) === i).map(rank => {
    const rows = base.flatMap(r => r.promotions).filter(p => p.rank === rank);
    const spec = rows.filter(r => r.cohort === 'specialist'), normal = rows.filter(r => r.cohort === 'ordinary');
    return [rank, spec.length, round(mean(spec.map(p => p.seasons))), normal.length, round(mean(normal.map(p => p.seasons))),
      percent(mean(spec.map(p => p.seasons)), mean(normal.map(p => p.seasons)))];
  });
  const zoneMean = (map: string) => sum(base.map(r => r.zone[map]?.income ?? 0)) / sum(base.map(r => r.zone[map]?.seasons ?? 0));
  const sections = [table('정책별 기본 규칙', ['정책','완주','모형 분(보정 전)','순자산 중앙','점수 평균','행복 평균/최종','무대출','목표 최고직급','선택지출/수입'],
    POLICY_IDS.map(id => { const rs = base.filter(r => r.policy === id); return [id,rs.length,round(avg(rs,r=>sum(r.seconds)/C.minute)),
      round(median(rs.map(r=>r.worth))),round(avg(rs,r=>r.score)),`${round(avg(rs,r=>r.meanHappy))}/${round(avg(rs,r=>r.happy))}`,
      rate(rs,r=>r.noLoan),rate(rs,r=>r.top),ratio(rs,r=>r.spending,r=>r.income)]; })),
    table('§13.2 전체 지표 (세부 실패 판정은 아래 표)', ['영역','측정','기준'], [
      ['완주',`${base.length}/${base.length}; 행동한도 위반 ${sum(base.map(r=>r.violations))}; 행운 재돌림 ${sum(base.map(r=>r.rerolls))}; 사건 생략 ${sum(base.map(r=>r.skipped))}계절`,'204계절; 돌림1/칸≤1/추가≤1 (행운·사건 예외 별도)'],
      ['시간',`순수 모형(보정 전) ${round(avg(base,r=>sum(r.seconds)/C.minute))}분; 시기 ${LIFE_RULES.periods.map((_,i)=>round(avg(base,r=>r.seconds[i]/C.minute))).join('/')}`,'전체45–55; 정책40–60; 시기16/20/14 ±4분'],
      ['이동',`무차량 선택지 ${round(sum(base.map(r=>r.choices))/sum(base.map(r=>r.noCar)))}; ≥2 ${ratio(base,r=>r.forks,r=>r.noCar)}; 지도 중앙 ${median(base.map(r=>r.visited))}; 비집중 정책 최장체류 ${percent(Math.max(...base.filter(r=>!('focus' in POLICIES[r.policy])).map(r=>Math.max(...r.maps)/r.turn)),1)}`,'≥2.2; ≥85%; ≥4지도; ≤60%'],
      ['은행',`계획 무대출 ${rate(planners,r=>r.noLoan)}; 부채계절 ${ratio(planners,r=>r.debtSeasons,r=>r.turn)}; 은행금지 점수하락 ${percent(avg(base,r=>r.score)-avg(noBank,r=>r.score),avg(base,r=>r.score))}; 비무작위 빚쟁이 ${rate(notRandom,r=>r.ending==='debtor')}`,'≥90%; ≤10%; ≤10%; ≤3%'],
      ['자산','아래 연령별 표 (계획형)','각 목표 ±30%'],
      ['지출',`전체 ${ratio(base,r=>r.spending,r=>r.income)}; clerk_family ${ratio(base.filter(r=>r.policy==='clerk_family'),r=>r.spending,r=>r.income)}; 현금>순자산70% ${rate(base,r=>r.cashHeavy)}`,'≥30%; ≥45%; ≤20%'],
      ['직업',`첫직업 중앙 ${median(base.flatMap(r=>r.firstJob===null?[]:[r.firstJob]))}세 (미취업 ${base.filter(r=>r.firstJob===null).length}); 좌천 ${rate(base,r=>r.demoted)}; 해고 ${rate(base,r=>r.dismissed)}; 특진 ${round(avg(base,r=>r.specials))}/판`,'≤22세; 최고직급30–70%; 좌천10–30%; 해고2–10%; 특진0.3–1.0; 19직업≥2%'],
      ['특구',`동일 직급 승급간격: 아래 표; D/B 순수입 ${round(zoneMean('D'))}/${round(zoneMean('B'))}; 차이 ${percent(zoneMean('D')-zoneMean('B'),Math.abs(zoneMean('B')))}`,'승급55–70%; 순수입 −10~+25%'],
      ['행복',`${round(avg(base,r=>r.meanHappy))}; 가족 ${round(avg(base.filter(r=>r.policy==='clerk_family'),r=>r.meanHappy))}; 검소 ${round(avg(base.filter(r=>r.policy==='service_frugal'),r=>r.meanHappy))}`,'판평균300–700; 가족≥600; 검소≤350'],
      ['점수',`행복 ${ratio(base,r=>r.happy*ENDING_RULES.happyPoints,r=>r.score)}; 업적 ${ratio(base,r=>r.feat,r=>r.score)}; 정책최고/중앙 ${round(Math.max(...scores)/median(scores))}; 계획S ${rate(planners,r=>r.grade==='S')}`,'15–35%; 10–20%; ≤3배; 5–10%'],
      ['엔딩','아래 21종 표','각1.5–20%; 빚쟁이0–3%'],
      ['사건',`${round(avg(base,r=>sum(Object.values(r.events))))}/판; 최대 사건별 판평균 ${round(Math.max(...Object.values(eventTotals))/base.length)}; 첫 ${coverage.length}판 ${ALL_EVENTS.length-missing.length}/${ALL_EVENTS.length}종`,'35–55/판; 동일사건 평균≤2.5; 3000판 120종'],
      ['갈림',`기본 ${round(avg(base,r=>r.score))}; 한개 ${round(avg(single,r=>r.score))}; 상승 ${percent(avg(base,r=>r.score)-avg(single,r=>r.score),avg(single,r=>r.score))}`,'5–20%'],
      ['상한',`최고점 ${Math.max(...base.map(r=>r.score))}; 초과 ${base.filter(r=>r.score>Math.max(0,r.worth)+C.scoreCap).length}판`,'max(0,순자산)+59,970 (T15 범위 문서에 기록)'],
    ]),
    table('연령별 계획형 순자산 (만원)', ['나이','표본','중앙값','목표'], AGES.map((age,i)=>[age,planners.filter(r=>r.wealth[age]!==undefined).length,round(median(planners.map(r=>r.wealth[age]))),TARGETS[i]])),
    table('직업 경험률', ['직업','경험 판','비율'], TRACKS.map(t=>[t.id,base.filter(r=>r.jobs.includes(t.id)).length,rate(base,r=>r.jobs.includes(t.id))])),
    table('같은 출발 직급의 승급 간격 (계절, 완결된 승급만)', ['직급','D 전문 표본','D 평균','일반 표본','일반 평균','비율'], promotionRows),
    table('21종 엔딩', ['엔딩','판','비율'], ENDINGS2.map(e=>[e.id,base.filter(r=>r.ending===e.id).length,rate(base,r=>r.ending===e.id)])),
    table('강제 실험', ['실험','완주','점수 평균','은행 사용'], [base,single,noBank,...(noCards.length ? [noCards] : [])].map((rs,i)=>[['기본','룰렛 한 개','은행 금지','카드 금지'][i],rs.length,round(avg(rs,r=>r.score)),sum(rs.map(r=>r.bankUses))])),
    table('T24 공통 시간 모형 (브라우저 보정 전)', ['단계','초','시뮬레이션 빈도'],TIME_MODEL.map(t=>[t.id,t.seconds,round(sum(base.map(r=>r.activities[t.id]))/sum(base.map(r=>r.turn)))])),
    table('사건 커버리지', ['표본','미등장 ID'], [[coverage.length,missing.join(', ') || '없음']]),
  ];
  return sections.join('\n');
}

export type Criterion = { id: string; area: string; value: number; min: number; max: number;
  unit: string; status: 'PASS' | 'FAIL'; within: boolean; detail: string };
/** Nonfinite observations and empty cohorts never silently pass. Bounds are inclusive, before rounding. */
export function criterion(id: string, area: string, value: number, min: number, max: number,
  unit = '', detail = ''): Criterion {
  const within = Number.isFinite(value) && value >= min && value <= max;
  return { id, area, value, min, max, unit, within, detail, status: within ? 'PASS' : 'FAIL' };
}
export function evaluateCriteria(out: Batch, runs = C.runs, timing = readCalibration()): Criterion[] {
  const { base, single, noBank, noCards } = out, all = [...base, ...single, ...noBank, ...noCards];
  const planners = base.filter(planned), notRandom = base.filter(r => r.policy !== 'random');
  const avg = (rows: RunReport[], get: (r: RunReport) => number) => mean(rows.map(get));
  const pct = (n: number, d: number) => d > 0 ? 100 * n / d : NaN;
  const share = (rows: RunReport[], test: (r: RunReport) => boolean) => pct(rows.filter(test).length, rows.length);
  const ratio = (rows: RunReport[], a: (r: RunReport) => number, b: (r: RunReport) => number) => pct(sum(rows.map(a)),sum(rows.map(b)));
  const family = base.filter(r=>r.policy==='clerk_family'), frugal = base.filter(r=>r.policy==='service_frugal');
  const checks: Criterion[] = [];
  const add = (...args: Parameters<typeof criterion>) => checks.push(criterion(...args));
  for (const [name, rows] of [['base',base],['single',single],['no-bank',noBank],['no-cards',noCards]] as const) {
    const valid = rows.length === runs * POLICY_IDS.length && POLICY_IDS.every(policy => {
      const seeds = rows.filter(r=>r.policy===policy).map(r=>r.seed);
      return seeds.length === runs && new Set(seeds).size === runs && seeds.every(seed=>Number.isInteger(seed) && seed>=1 && seed<=runs);
    });
    add(`complete:${name}`, '완주', Number(valid), 1, 1, '', `${rows.length}/${runs * POLICY_IDS.length}`);
  }
  add('complete:turns', '완주', all.filter(r=>r.turn!==LIFE_RULES.maxTurns).length, 0, 0, '판');
  add('complete:stalls', '완주', out.failures.length, 0, 0, '', out.failures.join('; '));
  add('complete:actions', '완주', sum(all.map(r=>r.violations)), 0, 0);
  add('cards:forbidden', '카드', sum(noCards.flatMap(r=>Object.values(r.cardUses))), 0, 0);
  add('bank:forbidden', '은행', sum(noBank.map(r=>r.bankUses)), 0, 0);
  const time = (id: string, raw: number, min: number, max: number) => {
    const value = timing.factor === null ? NaN : raw * timing.factor;
    add(id, '시간', value, min, max, '분', `${timing.detail}; 순수 모형 ${round(raw)}분`);
  };
  time('time:all', avg(base,r=>sum(r.seconds)/60), 45, 55);
  for (const policy of POLICY_IDS) time(`time:${policy}`, avg(base.filter(r=>r.policy===policy),r=>sum(r.seconds)/60),40,60);
  [16,20,14].forEach((target,i)=>time(`time:period${i}`,avg(base,r=>r.seconds[i]/60),target-4,target+4));
  add('move:choices', '이동', sum(base.map(r=>r.choices))/sum(base.map(r=>r.noCar)), 2.2, Infinity);
  add('move:forks', '이동', ratio(base,r=>r.forks,r=>r.noCar), 85, 100, '%');
  add('move:maps', '이동', median(base.map(r=>r.visited)), 4, 6);
  add('move:residence', '이동', Math.max(...base.filter(r=>!('focus' in POLICIES[r.policy])).map(r=>100*Math.max(...r.maps)/r.turn)),0,60,'%');
  add('bank:no-loan', '은행', share(planners,r=>r.noLoan),90,100,'%');
  add('bank:debt-seasons', '은행', ratio(planners,r=>r.debtSeasons,r=>r.turn),0,10,'%');
  add('bank:score-loss', '은행', pct(avg(base,r=>r.score)-avg(noBank,r=>r.score),avg(base,r=>r.score)),-Infinity,10,'%');
  add('bank:debtor', '은행', share(notRandom,r=>r.ending==='debtor'),0,3,'%');
  add('wealth:samples', '자산', planners.filter(r=>AGES.some(age=>!Number.isFinite(r.wealth[age]))).length,0,0,'판');
  AGES.forEach((age,i)=>add(`wealth:${age}`, '자산', median(planners.map(r=>r.wealth[age])),TARGETS[i]*.7,TARGETS[i]*1.3,'만원',
    `${planners.filter(r=>Number.isFinite(r.wealth[age])).length}/${planners.length} samples`));
  add('spend:all', '지출', ratio(base,r=>r.spending,r=>r.income),30,Infinity,'%');
  add('spend:family', '지출', ratio(family,r=>r.spending,r=>r.income),45,Infinity,'%');
  add('spend:cash', '지출', share(base,r=>r.cashHeavy),0,20,'%');
  // Never-employed runs sort after employed runs rather than disappearing from the median.
  add('career:first', '직업', median(base.map(r=>r.firstJob??Infinity)),-Infinity,22,'세');
  for (const policy of POLICY_IDS.filter(id=>POLICIES[id].tracks.length)) {
    add(`career:top:${policy}`, '직업',share(base.filter(r=>r.policy===policy),r=>r.top),30,70,'%');
  }
  add('career:demoted', '직업',share(base,r=>r.demoted),10,30,'%');
  add('career:dismissed', '직업',share(base,r=>r.dismissed),2,10,'%');
  add('career:special', '직업',avg(base,r=>r.specials),.3,1,'회/판');
  for (const track of TRACKS) add(`career:seen:${track.id}`, '직업',share(base,r=>r.jobs.includes(track.id)),2,100,'%');
  // Only ranks with a next rank in BOTH groups have a meaningful comparison; missing samples fail.
  const sharedRanks = Math.min(Math.max(...TRACKS.filter(t=>t.tier===3).map(t=>t.ranks.length)),
    Math.max(...TRACKS.filter(t=>t.salaried&&t.tier<3).map(t=>t.ranks.length)))-1;
  const promotions = base.flatMap(r=>r.promotions);
  for (let rank=0;rank<sharedRanks;rank++) {
    const spec = promotions.filter(p=>p.rank===rank&&p.cohort==='specialist');
    const normal = promotions.filter(p=>p.rank===rank&&p.cohort==='ordinary');
    add(`zone:promotion:${rank}`, '특구',pct(mean(spec.map(p=>p.seasons)),mean(normal.map(p=>p.seasons))),55,70,'%',`D n=${spec.length}; ordinary n=${normal.length}`);
  }
  const zoneMean = (map: string) => sum(base.map(r=>r.zone[map]?.income??0))/sum(base.map(r=>r.zone[map]?.seasons??0));
  add('zone:income', '특구',pct(zoneMean('D')-zoneMean('B'),Math.abs(zoneMean('B'))),-10,25,'%');
  add('happy:all', '행복',avg(base,r=>r.meanHappy),300,700);
  add('happy:family', '행복',avg(family,r=>r.meanHappy),600,Infinity);
  add('happy:frugal', '행복',avg(frugal,r=>r.meanHappy),0,350);
  add('score:happy', '점수',ratio(base,r=>r.happy*ENDING_RULES.happyPoints,r=>r.score),15,35,'%');
  add('score:feats', '점수',ratio(base,r=>r.feat,r=>r.score),10,20,'%');
  const scores = POLICY_IDS.map(id=>avg(base.filter(r=>r.policy===id),r=>r.score));
  add('score:policy', '점수',Math.max(...scores)/median(scores),0,3,'배');
  add('score:S', '점수',share(planners,r=>r.grade==='S'),5,10,'%');
  for (const ending of ENDINGS2) add(`ending:${ending.id}`, '엔딩',share(base,r=>r.ending===ending.id),ending.id==='debtor'?0:1.5,ending.id==='debtor'?3:20,'%');
  add('event:count', '사건',avg(base,r=>sum(Object.values(r.events))),35,55,'회/판');
  const totals = ALL_EVENTS.map(e=>({id:e.id,n:sum(base.map(r=>r.events[e.id]??0))})).sort((a,b)=>b.n-a.n);
  add('event:repeat', '사건',totals[0].n/base.length,0,2.5,'회/판',totals[0].id);
  const coverage = [...base].sort((a,b)=>a.seed-b.seed||POLICY_IDS.indexOf(a.policy)-POLICY_IDS.indexOf(b.policy)).slice(0,C.coverageRuns);
  const missing = ALL_EVENTS.filter(e=>!coverage.some(r=>r.events[e.id])).map(e=>e.id);
  add('event:sample', '사건',coverage.length,C.coverageRuns,C.coverageRuns,'판');
  add('event:coverage', '사건',ALL_EVENTS.length-missing.length,120,120,'종',missing.join(', '));
  add('fork:gain', '갈림',pct(avg(base,r=>r.score)-avg(single,r=>r.score),avg(single,r=>r.score)),5,20,'%');
  add('score:cap', '상한',all.filter(r=>!Number.isSafeInteger(r.score)||r.score<0||r.score>Math.max(0,r.worth)+C.scoreCap).length,0,0,'판',
    `base max=${Math.max(...base.map(r=>r.score))}; all max=${Math.max(...all.map(r=>r.score))}`);
  return checks;
}
export function criteriaTable(checks: Criterion[]): string {
  const bound = (n: number) => n===Infinity?'∞':n===-Infinity?'−∞':round(n);
  return table('§13.2 기준별 판정', ['영역','ID','판정','값','범위','근거'],checks.map(c=>[
    c.area,c.id,c.status,round(c.value)+c.unit,
    `${bound(c.min)}..${bound(c.max)}${c.unit}`,c.detail]));
}

export type Batch = { base: RunReport[]; single: RunReport[]; noBank: RunReport[]; noCards: RunReport[]; failures: string[] };
function batch(policy: PolicyId, runs: number): Batch {
  const out: Batch = { base: [], single: [], noBank: [], noCards: [], failures: [] };
  for (let seed = 1; seed <= runs; seed++) {
    try {
      const base = runLife(policy,seed).report; out.base.push(base);
      out.single.push(runLife(policy,seed,'single').report);
      out.noCards.push(runLife(policy,seed,'no-cards').report);
      // Identical deterministic path when no bank choice occurred: do not simulate it twice.
      out.noBank.push(base.bankUses || policy === 'random' ? runLife(policy,seed,'no-bank').report : { ...base, experiment: 'no-bank' });
    } catch (error) { out.failures.push(`${policy}/${seed}: ${String(error)}`); }
  }
  return out;
}
/** Worker threads for SIM_WORKERS (unset or empty = 8), never more than the core count. */
export function workerCount(setting: string | undefined, cores = availableParallelism()): number {
  const requested = Number(setting || C.workers);
  if (!Number.isSafeInteger(requested) || requested < 1) throw new Error('SIM_WORKERS must be a positive integer');
  return Math.min(requested, cores);
}
export async function simulate(runs: number, workers = workerCount(undefined), policies: PolicyId[] = POLICY_IDS): Promise<Batch> {
  if (!Number.isSafeInteger(runs) || runs < 1) throw new Error('SIM_RUNS must be a positive integer');
  if (!Number.isSafeInteger(workers) || workers < 1) throw new Error('workers must be a positive integer');
  if (!policies.length || new Set(policies).size !== policies.length || policies.some(p => !POLICY_IDS.includes(p))) throw new Error('invalid SIM_POLICIES');
  const output: Batch = { base: [], single: [], noBank: [], noCards: [], failures: [] }, pending = [...policies];
  await Promise.all(Array.from({length: Math.min(workers,policies.length)}, async () => {
    const worker = new Worker(new URL(import.meta.url), { workerData: true });
    try {
      while (pending.length) {
        const policy = pending.shift()!;
        const data = await new Promise<Batch>((resolve,reject) => {
          const cleanup = () => { worker.off('message',message); worker.off('error',error); worker.off('exit',exit); };
          const message = (data: Batch) => { cleanup(); resolve(data); }, error = (e: Error) => { cleanup(); reject(e); };
          const exit = (code: number) => error(new Error(`worker exited ${code}: ${policy}`));
          worker.once('message',message); worker.once('error',error); worker.once('exit',exit); worker.postMessage({policy,runs});
        });
        for (const key of ['base','single','noBank','noCards','failures'] as const) (output[key] as unknown[]).push(...data[key]);
        console.error(`life simulation: ${policy} ${data.base.length}/${runs}, failures=${data.failures.length}`);
      }
    } finally { await worker.terminate(); }
  }));
  for (const rows of [output.base, output.single, output.noBank, output.noCards]) rows.sort((a,b) => POLICY_IDS.indexOf(a.policy)-POLICY_IDS.indexOf(b.policy) || a.seed-b.seed);
  return output;
}
// Worker-local, schema-specific deep copy. Every nested mutable state field is copied;
// other values/transfer requests retain native structuredClone semantics. The browser is untouched.
export function cloneSimulationState(s: GameState): GameState {
  return { ...s, s: { ...s.s }, board: { ...s.board, dice: [...s.board.dice], ledger: { ...s.board.ledger }, lapAt: { ...s.board.lapAt } },
    job: { ...s.job, tracks: [...s.job.tracks] }, home: s.home && { ...s.home }, estates: s.estates.map(e=>({...e})),
    holdings: s.holdings.map(h=>({...h})), hand: s.hand.map(h=>({...h})), family: { ...s.family, kids: s.family.kids.map(k=>({...k})) }, fund: { ...s.fund },
    timers: { ...s.timers }, flags: [...s.flags], feats: [...s.feats], seen: { ...s.seen }, log: s.log.map(l=>({...l})) };
}
if (!isMainThread && workerData) {
  const nativeClone = globalThis.structuredClone;
  globalThis.structuredClone = <T>(value: T, options?: StructuredSerializeOptions): T => {
    if (!options && value && typeof value === 'object' && 'v' in value && value.v === LIFE_RULES.version
      && 'board' in value && 'job' in value && 's' in value) return cloneSimulationState(value as unknown as GameState) as T;
    return nativeClone(value, options);
  };
}
if (!isMainThread && workerData) parentPort!.on('message', ({policy,runs}) => parentPort!.postMessage(batch(policy,runs)));
if (isMainThread && process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const started = performance.now();
  try {
    const runs = Number(process.env.SIM_RUNS ?? C.runs);
    const policies = (process.env.SIM_POLICIES ? process.env.SIM_POLICIES.split(',') : undefined) as PolicyId[] | undefined;
    const out = await simulate(runs, workerCount(process.env.SIM_WORKERS), policies);
    const criteria = evaluateCriteria(out, runs);
    console.log('T24 hard gates; timing fails without a current six-map browser measurement. Planned = all except drifter/random. No-bank blocks loans, repayments and mortgages; automatic shortfall debt remains an engine obligation. Income excludes capital transfers; spending includes housing/family upkeep. Promotion intervals are observational, not matched cohorts.');
    console.log(reportTables(out.base,out.single,out.noBank,out.noCards));
    console.log(criteriaTable(criteria));
    const cardCounts: Record<string, number> = {};
    for (const run of out.base) for (const [id, n] of Object.entries(run.cardUses)) cardCounts[id] = (cardCounts[id] ?? 0) + n;
    console.log(`held-card uses (source frequency differs): ${JSON.stringify(cardCounts)}`);
    for (const policy of policies ?? POLICY_IDS) {
      const rows = out.base.filter(row => row.policy === policy), rolls = sum(rows.map(row => row.flightRolls));
      const notches = Object.fromEntries(['safe', 'mid', 'bold'].map(notch => [notch,
        sum(rows.map(row => row.dialCounts[notch as keyof RunReport['dialCounts']]))]));
      console.log(`dial ${policy}: ${JSON.stringify(notches)}, flight success=${percent(sum(rows.map(row => row.flightSuccesses)), rolls)}, crash=${percent(sum(rows.map(row => row.flightCrashes)), rolls)} (${rolls} rolls)`);
    }
    console.log(`Before age 45, any graded ability at S (excluding stamina): ${rate(out.base,r=>r.earlyS)}; §13.3 action ability gains are globally scaled to 85%.`);
    if (process.env.SIM_REPORT) writeFileSync(process.env.SIM_REPORT, JSON.stringify({ ...out, criteria }));
    for (const failure of out.failures) console.error(failure);
    const complete = out.base.length === runs*POLICY_IDS.length && out.single.length === out.base.length && out.noBank.length === out.base.length && out.noCards.length === out.base.length;
    console.log(`life simulation: ${out.base.length}/${runs*POLICY_IDS.length} base, ${out.single.length} single, ${out.noBank.length} no-bank, ${out.noCards.length} no-cards; stuck/crashes=${out.failures.length}; elapsed=${round((performance.now()-started)/1000)}s`);
    const failed = criteria.filter(c => c.status === 'FAIL');
    console.log(`life balance: ${criteria.filter(c=>c.status==='PASS').length} passed, ${failed.length} failed, timing measured-backed (missing/stale = FAIL)`);
    if (!complete || out.failures.length || failed.length) process.exitCode = 1;
  } catch (error) { console.error(error); process.exitCode = 1; }
}
