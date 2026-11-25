// T05 read-only career rules and cards. Tables live here to keep this ticket's three-file boundary.
import { FLAG_LABEL } from './data.ts';
import { LIFE_RULES, STAT_LABEL, TEXT } from './life-data.ts';
import { JOB_RULES, JOB_TEXT, TRACKS } from './tracks.ts';
import { WORLD } from './world.ts';
import type { Cond, GameState, Stat, StatMap, TrackDef, TrackId, WorldNode } from './types.ts';

export const CAREER_RULES = {
  perfMin: 0, perfMax: 100, chanceMin: 30, chanceMax: 95, failedPerf: -10, retrySeasons: 4,
  excellent: 80, clearWarning: 50, excellentBonus: 10, idleSeasons: 4, idlePerf: -3,
  exhaustedBelow: 20, exhaustedPerf: -3,
  performance: { workSuccess: 8, workFailure: -4, extra: 5, contest: 6 },
  unemployment: 60, benefitSeasons: 4, retirementAge: 60, rehireAge: 65, rehirePct: 60,
  severanceDivisor: 8, racerAge: 45, racerDeclineAge: 40, racerDecline: -15,
  switchTracks: ['pilot', 'creator', 'solo', 'company', 'academy', 'director', 'service'] as readonly TrackId[],
  reviewOutcomes: ['excellent', 'normal', 'warning', 'demotion', 'dismissal', 'promotion', 'none'],
} as const;
export const CAREER_KEYS = {
  retry: 'career_retry', bonus: 'career_bonus', idle: 'career_idle', worked: 'career_worked',
  season: 'career_season', reviewed: 'career_reviewed', benefitUntil: 'career_benefit_until',
  pension: 'career_pension', rehire: 'career_rehire', switched: 'career_switched', coach: 'racer_coach',
  deferred: 'career_retirement_deferred', notice: 'career_review_notice', noticeAt: 'career_review_notice_at',
} as const;
export const CAREER_TEXT = {
  promo: '승급 심사', passed: '승급 심사를 통과했다.', failed: '승급 심사에 떨어졌다.',
  promoDesc: (title: string, chance: number) => `${title} 승급 확률 ${chance}%. 심사 비용 없음.`,
  noJob: '재직 중인 직업이 없습니다.', top: '최고 직급입니다.',
  map: '이 직업의 심사 지도가 아닙니다.', tile: '승급 심사 칸에서 신청할 수 있습니다.',
  retry: (seasons: number) => `다음 승급 심사까지 ${seasons}계절 남았습니다.`,
  rehire: '촉탁 재고용 중에는 승급할 수 없습니다.', retirement: '정년 선택을 먼저 마쳐야 합니다.',
  badPromotion: 'promotion not available', badRetirement: 'retirement not available',
  badPerformance: 'performance change must be an integer',
  lowPerf: (perf: number, min: number) => `성과 ${perf}: 경고 기준 ${min} 미만`,
  maintenance: (locks: string[]) => `유지 조건: ${locks.length ? locks.join(', ') + ' 미달' : '모두 충족'}`,
  review: { excellent: '우수', normal: '보통', warning: '경고', demotion: '좌천', dismissal: '해고',
    promotion: '승급', none: '평가 대상 아님' },
  pension: '은퇴하고 연금을 받는다', pensionDone: '퇴직금을 받고 은퇴했다.',
  rehireTitle: '촉탁으로 재고용된다', rehireDone: '촉탁으로 재고용되었다.',
  rehireDesc: '급여 60%, 승급 없이 65세까지 근무한다.',
  switch: '퇴직금을 받고 전향한다', switchDone: '새 직업을 찾기로 했다.',
  switchDesc: '프리랜서 · 창업 · 가게 직원으로 다시 시작한다.',
  pensionDesc: (severance: number, pension: number) => `퇴직금 ${severance}만원, 계절 연금 ${pension}만원.`,
  coach: '레이서에서 은퇴했다. 교관 1직급으로 전향할 수 있다.',
  switchLock: '전향 뒤에는 프리랜서 · 창업 · 가게 직원으로 시작할 수 있습니다.',
  benefitLabel: '실업 급여', pensionLabel: '연금', noRank: '직급 없음',
  continue: '그냥 지나간다', reviewed: '인사평가 내용을 확인했다.',
  deferRetirement: '이번 계절은 정년 결정을 미루고 그냥 지나간다.',
} as const;

const entries = (map?: StatMap) => Object.entries(map ?? {}) as [Stat, number][];
export const careerTrack = (state: GameState) => state.status === 'working'
  ? TRACKS.find(track => track.id === state.track) : undefined;
export const careerAge = (state: GameState) => LIFE_RULES.startAge + Math.floor(state.turn / LIFE_RULES.seasons.length);

/** Shared with T04: OR branches count as the cheapest missing alternative. */
export function jobConditionLocks(state: GameState, cond: Cond): string[] {
  const locks: string[] = [];
  if (cond.status && !cond.status.includes(state.status)) locks.push(TEXT.statusLock);
  if (cond.track && (!state.track || !cond.track.includes(state.track))) locks.push(TEXT.trackLock);
  for (const [stat, min] of entries(cond.min)) {
    if (state.s[stat] < min) locks.push(TEXT.minLock(STAT_LABEL[stat], min, state.s[stat]));
  }
  for (const [stat, max] of entries(cond.max)) {
    if (state.s[stat] > max) locks.push(TEXT.maxLock(STAT_LABEL[stat], max));
  }
  const label = (flag: string) => JOB_TEXT.flag[flag] ?? FLAG_LABEL[flag] ?? flag;
  for (const flag of cond.flags ?? []) if (!state.flags.includes(flag)) locks.push(TEXT.flagLock(label(flag)));
  for (const flag of cond.notFlags ?? []) if (state.flags.includes(flag)) locks.push(TEXT.notFlagLock(label(flag)));
  if (cond.any) {
    const alternatives = cond.any.map(branch => jobConditionLocks(state, branch)).sort((a, b) => a.length - b.length);
    if (!alternatives.length) locks.push(TEXT.anyLock);
    else if (alternatives[0].length) {
      const best = [...alternatives[0]];
      best[0] = JOB_TEXT.either(alternatives.map(parts => parts.join(JOB_TEXT.conditionSeparator)));
      locks.push(...best);
    }
  }
  return locks;
}

export function rankLocks(state: GameState, track: TrackDef, rank: number): string[] {
  // Only contest victories count for racers, not generic successful rolls.
  const subject = track.id === 'racer' ? { ...state, s: { ...state.s, wins: state.board.contests } } : state;
  return jobConditionLocks(subject, track.ranks[rank].need);
}

/** Base seasonal salary, before the map multiplier owned by T06. */
export function careerSalary(state: GameState): number {
  const track = careerTrack(state);
  if (!track) return 0;
  return Math.floor(track.ranks[state.job.rank].salary
    * (state.flags.includes(CAREER_KEYS.rehire) ? CAREER_RULES.rehirePct : LIFE_RULES.percent) / LIFE_RULES.percent);
}

export function careerIncome(state: GameState): { pension: number; unemployment: number } {
  return {
    pension: state.status === 'retired' ? state.timers[CAREER_KEYS.pension] ?? 0 : 0,
    unemployment: state.status === 'jobless' && state.timers[CAREER_KEYS.benefitUntil] > state.turn
      ? CAREER_RULES.unemployment : 0,
  };
}

export type RetirementMode = 'pension' | 'rehire' | 'switch';
export function retirementView(state: GameState) {
  const track = careerTrack(state), age = careerAge(state), salary = careerSalary(state);
  const rehire = state.flags.includes(CAREER_KEYS.rehire);
  const racer = track?.id === 'racer' && age >= CAREER_RULES.racerAge;
  const exempt = track?.id === 'service' && state.flags.includes(CAREER_KEYS.switched);
  const due = !!track && (racer || (track.salaried && !exempt
    && age >= (rehire ? CAREER_RULES.rehireAge : CAREER_RULES.retirementAge)));
  const modes: RetirementMode[] = !due || racer ? []
    : rehire || age >= CAREER_RULES.rehireAge ? ['pension', 'switch'] : ['pension', 'rehire', 'switch'];
  return { due, racer, modes, salary,
    severance: track?.salaried ? Math.floor(salary * state.job.total / CAREER_RULES.severanceDivisor) : 0,
    pension: Math.floor(salary * (track?.pensionPct ?? 0) / LIFE_RULES.percent),
    rehireSalary: Math.floor(salary * CAREER_RULES.rehirePct / LIFE_RULES.percent) };
}

export function promotionView(state: GameState, node: WorldNode = WORLD.find(row => row.id === state.board.pos)!) {
  const track = careerTrack(state), next = track?.ranks[state.job.rank + 1], locks: string[] = [];
  if (!track || state.phase === 'ended') locks.push(CAREER_TEXT.noJob);
  else {
    if (!next) locks.push(CAREER_TEXT.top);
    else {
      locks.push(...rankLocks(state, track, state.job.rank + 1));
      if (state.job.tenure < next.tenure) locks.push(JOB_TEXT.tenure(next.tenure));
    }
    if (track.maps !== 'any' && !track.maps.includes(node.map)) locks.push(CAREER_TEXT.map);
    if (node.kind !== 'rankup') locks.push(CAREER_TEXT.tile);
    if (state.flags.includes(CAREER_KEYS.rehire)) locks.push(CAREER_TEXT.rehire);
    if (retirementView(state).due) locks.push(CAREER_TEXT.retirement);
    const wait = (state.timers[CAREER_KEYS.retry] ?? 0) - state.turn;
    if (wait > 0) locks.push(CAREER_TEXT.retry(wait));
  }
  const chance = Math.max(CAREER_RULES.chanceMin, Math.min(CAREER_RULES.chanceMax,
    state.job.perf + (state.timers[CAREER_KEYS.bonus] ?? 0)));
  return { id: 'promo', title: next?.title ?? CAREER_TEXT.top, salary: next?.salary ?? 0, chance,
    enabled: !locks.length, locks };
}

export type ReviewOutcome = keyof typeof CAREER_TEXT.review;
export type Review = { outcome: ReviewOutcome; rank: number; bonus: number; locks: string[]; clearWarning: boolean };
/** Preview only; warning reasons take priority over high performance. Tenure is never maintenance. */
export function review(state: GameState): Review {
  const track = careerTrack(state);
  const result: Review = { outcome: 'none', rank: state.job.rank, bonus: 0, locks: [], clearWarning: false };
  if (!track || state.phase === 'ended') return result;
  result.locks = rankLocks(state, track, state.job.rank);
  if (!track.salaried) {
    let rank = track.ranks.length - 1;
    while (rank > JOB_RULES.entryRank && rankLocks(state, track, rank).length) rank--;
    if (rank > state.job.rank) return { ...result, rank, outcome: 'promotion', clearWarning: true };
    if (result.locks.length) return { ...result, outcome: state.job.warn ? 'demotion' : 'warning',
      rank: state.job.warn ? rank : state.job.rank };
    return { ...result, outcome: 'normal', clearWarning: true };
  }
  if (state.job.perf < track.warnBelow) result.locks.push(CAREER_TEXT.lowPerf(state.job.perf, track.warnBelow));
  if (result.locks.length) {
    result.outcome = !state.job.warn ? 'warning' : state.job.rank === JOB_RULES.entryRank ? 'dismissal' : 'demotion';
    if (result.outcome === 'demotion') result.rank--;
  } else {
    result.outcome = state.job.perf >= CAREER_RULES.excellent ? 'excellent' : 'normal';
    result.bonus = result.outcome === 'excellent' ? careerSalary(state) : 0;
    result.clearWarning = state.job.perf >= CAREER_RULES.clearWarning;
  }
  return result;
}

export function specialView(state: GameState) {
  const track = careerTrack(state), next = track?.ranks[state.job.rank + 1];
  const locks = track && next ? rankLocks(state, track, state.job.rank + 1) : [];
  return { enabled: !!next && state.phase !== 'ended' && !state.flags.includes(CAREER_KEYS.rehire)
    && !retirementView(state).due, rank: state.job.rank + 1,
    title: next?.title ?? CAREER_TEXT.top, salary: next?.salary ?? 0, locks, maintenance: CAREER_TEXT.maintenance(locks) };
}

export function reviewNotice(state: GameState): { title: string; text: string } | null {
  const outcome = CAREER_RULES.reviewOutcomes[state.timers[CAREER_KEYS.notice]];
  if (!outcome) return null;
  const title = CAREER_TEXT.review[outcome];
  const entry = [...state.log].reverse().find(row => row.turn === state.timers[CAREER_KEYS.noticeAt] && row.text.startsWith(title));
  return { title, text: entry?.text ?? title };
}

/** Detached snapshots for both the promotion card and its reverse demotion animation. */
export function rankChange(before: GameState, after: GameState) {
  if (before.track === after.track && before.status === after.status && before.job.rank === after.job.rank) return null;
  const snapshot = (state: GameState) => ({ track: state.track, rank: state.job.rank,
    title: careerTrack(state)?.ranks[state.job.rank].title ?? CAREER_TEXT.noRank, salary: careerSalary(state) });
  const from = snapshot(before), to = snapshot(after);
  const kind = after.status === 'retired' ? 'retirement' : after.status !== 'working' ? 'dismissal'
    : before.track !== after.track ? 'move'
    : after.job.rank > before.job.rank ? 'promotion' : 'demotion';
  return { kind, from, to, salaryDelta: to.salary - from.salary,
    maintenance: careerTrack(after) ? rankLocks(after, careerTrack(after)!, after.job.rank) : [] };
}
