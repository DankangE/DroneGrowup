// Rules of 파일럿 키우기: pure functions over a JSON-serialisable GameState. No DOM, no Date, no Math.random;
// all luck comes from the seeded generator stored in the state, so a seed plus a list of choices replays a run.
import { careerRank } from './rank.ts';
import { BOARD, BOARD_PLACES, SPACE_LABEL, SPACE_MENU, ROUTE_NAMES, RANKUP_STOPS, UPKEEP_LABELS, FINAL_GRADES, CONTEST_EVENTS, ACTIONS, ENDINGS, EVENTS, FLAG_LABEL, ITEMS, LOAN_STEPS, RULES, STAGES, STAT_LABEL, STAT_MAX } from './data.ts';
import type {
  ActionDef, BoardState, BranchForecast, BranchId, Choice, Cond, Derived, Effect, EndingDef, EndingId, EventDef, Forecast, GameState, ItemKind, OptionKind, OptionView,
  OutcomeView, PlaceId, Result, Stage, Stat, StatMap, UpkeepLine,
} from './types.ts';

const STATS = Object.keys(STAT_LABEL) as Stat[];
const ITEM_KINDS: ItemKind[] = ['drone', 'gear', 'car'];
const LOG_MAX = 30;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const entries = (m: StatMap | undefined) => Object.entries(m ?? {}) as [Stat, number][];

// ---------------------------------------------------------------- seeded luck (mulberry32)

function nextRandom(state: GameState): number {
  state.rng = (state.rng + 0x6d2b79f5) >>> 0;
  let t = state.rng;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return (t ^ (t >>> 14)) >>> 0;
}
/** Integer in 0..n-1. */
const randInt = (state: GameState, n: number) => Math.floor((nextRandom(state) / 4294967296) * n);

// ---------------------------------------------------------------- state

function initialBoard(): BoardState {
  return { pos: BOARD.start, step: 'spin', left: 0, route: -1, roll: 0, contest: false, ledger: {}, forks: 0, contests: 0, rankups: 0 };
}

export function newGame(seed: number): GameState {
  const s = Object.fromEntries(STATS.map((k) => [k, 0])) as Record<Stat, number>;
  Object.assign(s, RULES.start);
  const clean = (Math.floor(Number(seed)) >>> 0) || 1;
  return { v: 1, board: initialBoard(), seed: clean, rng: clean, turn: 0, stage: 'student', phase: 'action', s, flags: [], eventId: null, seen: {}, ending: null, score: 0, log: [] };
}

function setStat(state: GameState, stat: Stat, value: number) {
  state.s[stat] = clamp(Math.trunc(value), stat === 'money' ? -Infinity : 0, STAT_MAX[stat] ?? 9_000_000);
}

/** Money never stays negative: a shortfall becomes debt on the spot. */
function settle(state: GameState) {
  if (state.s.money < 0) {
    setStat(state, 'debt', state.s.debt - state.s.money);
    state.s.money = 0;
  }
}

function applyEffect(state: GameState, effect: Effect, add: StatMap) {
  for (const [k, v] of entries(add)) setStat(state, k, state.s[k] + v);
  for (const [k, v] of entries(effect.set)) setStat(state, k, v);
  const flag = effect.flag && !state.flags.includes(effect.flag) ? effect.flag : undefined;
  if (flag) state.flags.push(flag);
  if (effect.stage) state.stage = effect.stage;
  settle(state);
  return flag;
}

const itemValue = (state: GameState) => ITEM_KINDS.reduce((sum, kind) => {
  const level = state.s[kind];
  return sum + (level > 0 ? Math.floor((ITEMS[kind].levels[level - 1].price * RULES.itemResalePct) / 100) : 0);
}, 0);

function orgWorth(state: GameState) {
  if (state.stage === 'academy') return state.s.level * RULES.academy.worthPerLevel;
  if (state.stage === 'company') return Math.floor(state.s.value / RULES.company.worthDiv);
  return 0;
}

export const creditLimit = (state: GameState) => STAGES[state.stage].credit + itemValue(state);
const ledgerSum = (state: GameState) => Object.values(state.board.ledger).reduce((sum, amount) => sum + amount, 0);
export const netWorth = (state: GameState) => state.s.money - state.s.debt + itemValue(state) + orgWorth(state) + ledgerSum(state);
const academySeats = (state: GameState) => RULES.academy.baseSeats + state.s.staff * RULES.academy.seatsPerStaff;

/** Upkeep accrued at the end of a season, as labelled lines (income positive). */
function upkeepLines(state: GameState): UpkeepLine[] {
  const st = STAGES[state.stage];
  const s = state.s;
  const lines: UpkeepLine[] = [];
  const line = (label: typeof UPKEEP_LABELS[number], amount: number) => { if (amount !== 0) lines.push({ label, amount }); };
  line('급여', st.salary + st.salaryPerRank * s.rank);
  if (state.stage === 'instructor' && state.flags.includes('examiner')) line('평가관 수당', RULES.examinerPay);
  if (state.stage === 'solo') line('고정 계약 수입', s.contracts * RULES.solo.contractPay);
  if (state.stage === 'company') {
    const c = RULES.company;
    line('계약 매출', Math.min(s.contracts, s.staff * c.perStaff) * c.contractPay);
    line('직원 급여', -s.staff * c.pay);
    line('사옥 운영비', -c.overhead);
  }
  if (state.stage === 'academy') {
    const a = RULES.academy;
    line('수강료 수입', Math.min(s.students, academySeats(state)) * a.tuition);
    line('교관 급여', -s.staff * a.pay);
    line('실습장 운영비', -(a.overhead + s.level * a.overheadPerLevel));
  }
  line('생활비', -st.living);
  line('대출 이자', -Math.ceil((s.debt * RULES.interestPct) / 100));
  return lines;
}

const ageAt = (turn: number) => RULES.startAge + Math.floor(turn / RULES.seasons.length);
const seasonAt = (turn: number) => turn % RULES.seasons.length;
export const dateLabel = (turn: number) => `${ageAt(turn)}세 · ${RULES.seasons[seasonAt(turn)]}`;

export function derived(state: GameState): Derived {
  const lines = upkeepLines(state);
  const st = STAGES[state.stage];
  const items = Object.fromEntries(ITEM_KINDS.map((kind) => {
    const level = state.s[kind];
    return [kind, { level, name: level > 0 ? ITEMS[kind].levels[level - 1].name : ITEMS[kind].none }];
  })) as Derived['items'];
  return {
    age: ageAt(state.turn),
    season: seasonAt(state.turn),
    seasonName: RULES.seasons[seasonAt(state.turn)],
    dateLabel: dateLabel(state.turn),
    creditLimit: creditLimit(state),
    netWorth: netWorth(state),
    stageName: st.name,
    rankName: st.ranks[state.s.rank] ?? '',
    items,
    upkeep: { lines, total: lines.reduce((sum, l) => sum + l.amount, 0) },
  };
}

export const currentEvent = (state: GameState): EventDef | null => EVENTS.find((e) => e.id === state.eventId) ?? null;
export const endingInfo = (id: EndingId): EndingDef => ENDINGS.find((e) => e.id === id)!;

// ---------------------------------------------------------------- conditions and views

function unmet(state: GameState, cond: Cond | undefined): { locks: string[]; missing: OptionView['missing'] } {
  const locks: string[] = [];
  const missing: OptionView['missing'] = [];
  if (!cond) return { locks, missing };
  if (cond.stage && !cond.stage.includes(state.stage)) locks.push('지금 신분으로는 할 수 없음');
  for (const [k, need] of entries(cond.min)) {
    if (state.s[k] < need) {
      locks.push(`${STAT_LABEL[k]} ${need} 이상 필요 (현재 ${state.s[k]})`);
      missing.push({ stat: k, need });
    }
  }
  for (const [k, most] of entries(cond.max)) if (state.s[k] > most) locks.push(`${STAT_LABEL[k]} ${most} 이하일 때만 가능`);
  for (const f of cond.flags ?? []) if (!state.flags.includes(f)) locks.push(`${FLAG_LABEL[f] ?? f} 필요`);
  for (const f of cond.notFlags ?? []) if (state.flags.includes(f)) locks.push(`이미 ${FLAG_LABEL[f] ?? f} 보유`);
  return { locks, missing };
}
const met = (state: GameState, cond: Cond | undefined) => unmet(state, cond).locks.length === 0;

/** 12345 -> "12,345" (hand-rolled: toLocaleString is slow enough to dominate the simulation). */
export const num = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

function outcome(state: GameState, effect: Effect, payPct: number): OutcomeView {
  const add: StatMap = { ...effect.add };
  if (add.money && add.money > 0 && payPct !== 100) add.money = Math.floor((add.money * payPct) / 100);
  return { text: effect.text, add, stage: effect.stage !== state.stage ? effect.stage : undefined, end: effect.end };
}

export function staminaBand(state: GameState): 'fresh' | 'normal' | 'tired' | 'exhausted' {
  const stamina = state.s.stamina;
  if (stamina >= RULES.stamina.fresh) return 'fresh';
  if (stamina < RULES.stamina.exhausted) return 'exhausted';
  if (stamina < RULES.stamina.tired) return 'tired';
  return 'normal';
}

function staminaBonus(state: GameState) {
  switch (staminaBand(state)) {
    case 'fresh': return RULES.stamina.freshBonus;
    case 'normal': return 0;
    case 'tired': return -RULES.stamina.tiredPenalty;
    case 'exhausted': return -RULES.stamina.exhaustedPenalty;
  }
}

function flightOdds(state: GameState, choice: Choice): { bonus: number; crashPct: number } {
  const f = RULES.flight;
  const cond = state.s.cond;
  const spare = Math.max(0, state.s.drone - (choice.need?.min?.drone ?? 1));
  const penalty = cond < f.badCond ? f.badCondPenalty : cond < f.lowCond ? f.lowCondPenalty : 0;
  const crash = f.crashPct + (cond < f.lowCond ? f.crashLowCondPct : 0)
    - Math.min(f.skillCrashCap, Math.floor(state.s.skill / f.skillPer))
    + (staminaBand(state) === 'exhausted' ? RULES.stamina.exhaustedCrashPct : 0);
  return { bonus: Math.min(f.spareLevelCap, spare * f.spareLevelPct) - penalty, crashPct: clamp(crash, 0, 100) };
}

function chanceOf(state: GameState, choice: Choice, flight: boolean, staminaPct: number): number {
  const roll = choice.roll!;
  let chance = roll.base + staminaPct;
  for (const m of roll.mods ?? []) chance += clamp(Math.floor((state.s[m.stat] - m.over) / m.per) * m.pct, 0, m.cap);
  if (flight) chance += flightOdds(state, choice).bonus;
  return clamp(chance, RULES.chanceMin, RULES.chanceMax);
}

function view(state: GameState, id: string, kind: OptionKind, place: PlaceId, choice: Choice, flight: boolean): OptionView {
  const { locks, missing } = unmet(state, choice.need);
  const cost = choice.cost ?? 0;
  if (state.s.money < cost) {
    locks.push(`자금 부족 (${num(cost)}만원 필요)`);
    missing.push({ stat: 'money', need: cost });
  }
  const tire = kind === 'action' || kind === 'job' ? choice.tire ?? 0 : 0;
  if (state.s.stamina < tire) {
    locks.push(`체력 부족 (${tire} 필요, 현재 ${state.s.stamina})`);
    missing.push({ stat: 'stamina', need: tire });
  }
  const payPct = flight ? STAGES[state.stage].jobPct : 100;
  const o: OptionView = { id, kind, place, title: choice.title, desc: choice.desc, free: kind === 'shop' || kind === 'repair' || kind === 'bank', cost, tire, enabled: locks.length === 0, locks, missing };
  if (choice.roll) {
    const staminaPct = staminaBonus(state);
    o.roll = { staminaPct, chance: chanceOf(state, choice, flight, staminaPct), success: outcome(state, choice.roll.success, payPct), fail: outcome(state, choice.roll.fail, 100) };
    if (flight) o.roll.crashPct = flightOdds(state, choice).crashPct;
  } else if (choice.effect) o.sure = outcome(state, choice.effect, 100);
  return o;
}

const repairCost = (state: GameState) => RULES.repairBase + state.s.drone * RULES.repairPerLevel;

/** Shop, garage and bank entries are choices built from the tables, so they resolve through the same path as actions. */
function freeChoices(state: GameState): { id: string; kind: OptionKind; place: PlaceId; choice: Choice }[] {
  const out: { id: string; kind: OptionKind; place: PlaceId; choice: Choice }[] = [];
  const s = state.s;
  if (state.stage !== 'student') {
    for (const kind of ITEM_KINDS) {
      const next = ITEMS[kind].levels[s[kind]];
      if (!next) continue;
      out.push({ id: `buy:${kind}`, kind: 'shop', place: 'shop', choice: {
        title: `${ITEMS[kind].label} Lv${s[kind] + 1} · ${next.name}`, desc: next.desc, cost: next.price,
        effect: { text: `${next.name}을(를) 들였다.`, add: { [kind]: 1 }, set: kind === 'drone' ? { cond: 100 } : undefined },
      } });
    }
    if (s.drone > 0 && s.cond < 100) {
      out.push({ id: 'repair', kind: 'repair', place: 'garage', choice: {
        title: '기체 정비', desc: `기체 상태 ${s.cond}% → 100%. 미루면 성공률이 떨어지고 추락 위험이 커진다.`, cost: repairCost(state),
        effect: { text: '모터와 프로펠러를 점검하고 펌웨어를 올렸다.', set: { cond: 100 } },
      } });
    }
  }
  const room = creditLimit(state) - s.debt;
  for (const amount of LOAN_STEPS) {
    out.push({ id: `loan:${amount}`, kind: 'bank', place: 'bank', choice: {
      title: `대출 ${amount}만원`, desc: `계절 이자 ${RULES.interestPct}%. 남은 한도 ${num(Math.max(0, room))}만원.`,
      need: room >= amount ? undefined : { max: { debt: Math.max(0, creditLimit(state) - amount) } },
      effect: { text: `${amount}만원을 빌렸다.`, add: { money: amount, debt: amount } },
    } });
  }
  if (s.debt > 0) {
    for (const amount of [LOAN_STEPS[0], Math.min(s.debt, s.money)]) {
      const pay = Math.min(amount, s.debt);
      if (pay <= 0 || (amount !== LOAN_STEPS[0] && pay <= LOAN_STEPS[0])) continue;
      out.push({ id: amount === LOAN_STEPS[0] ? `repay:${amount}` : 'repay:all', kind: 'bank', place: 'bank', choice: {
        title: `상환 ${num(pay)}만원`, desc: `남은 빚 ${num(s.debt)}만원.`, cost: pay,
        effect: { text: `${pay}만원을 갚았다.`, add: { debt: -pay } },
      } });
    }
  }
  return out;
}

type Resolved = { kind: OptionKind; place: PlaceId; choice: Choice; flight: boolean };

const placeAt = (state: GameState) => BOARD_PLACES[state.stage][state.board.pos];
const nodeAt = (state: GameState) => BOARD.nodes[state.board.pos];
const forkIndex = (pos: number) => BOARD.forks.findIndex(f => f.at === pos);

export function boardView(state: GameState) {
  const { pos, route, step } = state.board;
  const routeNames: string[] = [];
  for (const [i, fork] of BOARD.forks.entries()) {
    for (const [j, first] of fork.routes.entries()) {
      for (let at = first; at !== fork.join; at = BOARD.nodes[at].next[0]) routeNames[at] = ROUTE_NAMES[state.stage][i][j];
    }
  }
  const nodes = BOARD.nodes.map(node => ({ ...node, next: [...node.next], place: BOARD_PLACES[state.stage][node.id],
    label: SPACE_LABEL[node.kind], routeName: routeNames[node.id] }));
  const reachable: Record<number, number[]> = {};
  let frontier = [pos];
  for (let face = 1; face <= RULES.board.die; face++) {
    frontier = [...new Set(frontier.flatMap(at => face === 1 && route >= 0 ? [nodes[at].next[route]] : nodes[at].next))];
    reachable[face] = frontier;
  }
  return { nodes, pos, step, reachable };
}

function actionKind(a: ActionDef) { return a.flight ? 'job' : 'action'; }

export function actionViews(state: GameState): OptionView[] {
  return ACTIONS.filter(a => met(state, a.when)).map(a => view(state, a.id, actionKind(a), a.place, a, !!a.flight));
}

function menuActions(state: GameState, step: 'space' | 'bonus') {
  const kind = nodeAt(state).kind;
  const ids = kind === 'train' || kind === 'job' || kind === 'rankup' ? SPACE_MENU[kind] : [];
  return ACTIONS.filter(a => (step === 'space' ? ids.includes(a.id) : a.place === placeAt(state)) && met(state, a.when));
}

// Keep a money-only lock visible so the player can borrow before making the choice.
function hasMenu(state: GameState, step: 'space' | 'bonus') {
  return menuActions(state, step).some(a => met(state, a.need) && (step === 'space' || state.s.stamina >= (a.tire ?? 0)));
}

function resolve(state: GameState): Map<string, Resolved> {
  const map = new Map<string, Resolved>();
  if (state.phase === 'event') {
    const ev = currentEvent(state);
    ev?.choices.forEach((choice, i) => map.set(`ev:${i}`, { kind: 'event', place: ev.place, choice, flight: false }));
  }
  if (state.phase !== 'action') return map;
  const { step, pos } = state.board;
  const boardOption = (id: string, title: string, desc: string) => map.set(id, {
    kind: 'board', place: placeAt(state), choice: { title, desc, effect: { text: desc } }, flight: false,
  });
  if (step === 'fork' || (step === 'space' && nodeAt(state).kind === 'fork')) {
    ROUTE_NAMES[state.stage][forkIndex(pos)].forEach((name, i) => boardOption('route:' + i, name, name + '로 향한다.'));
    return map;
  }
  if (step === 'spin') boardOption('spin', '주사위 굴리기', '주사위 눈만큼 이동한다.');
  else {
    for (const a of menuActions(state, step)) {
      map.set(a.id, { kind: actionKind(a), place: a.place, choice: step === 'space' ? { ...a, tire: 0 } : a, flight: !!a.flight });
    }
    if (step === 'space') boardOption('skip', '그냥 지나간다', '이번 칸의 행동을 건너뛴다.');
    else boardOption('end', '계절 마치기', '이번 계절을 마무리한다.');
  }
  for (const f of freeChoices(state)) map.set(f.id, { ...f, flight: false });
  return map;
}

/** Everything the player may look at right now; disabled entries carry the reasons. Empty only when the run has ended. */
export function options(state: GameState): OptionView[] {
  return [...resolve(state)].map(([id, r]) => view(state, id, r.kind, r.place, r.choice, r.flight));
}

// ---------------------------------------------------------------- playing a choice

export function finalRank(state: GameState) {
  const { forks, contests, rankups } = state.board;
  const weights = RULES.board.achievement;
  const points = forks * weights.fork + contests * weights.contest + rankups * weights.rankup;
  const worth = netWorth(state);
  const endingBonus = state.ending ? endingInfo(state.ending).bonus : 0;
  const bonus = Math.min(RULES.board.bonusCap, endingBonus + points);
  const early = state.ending && state.ending !== 'debtor' ? (RULES.maxTurns - state.turn) * RULES.score.turnBonus : 0;
  const total = state.ending === 'debtor' ? 0 : clamp(Math.max(0, worth) + bonus + early, 0, RULES.score.max);
  const { grade, title: gradeTitle } = FINAL_GRADES.find(g => total >= g.from)!;
  return { netWorth: worth, endingBonus, achievements: { forks, contests, rankups, points }, bonus, early, total, grade, gradeTitle };
}

function payLedger(state: GameState, result: Result) {
  const lines = Object.entries(state.board.ledger).map(([label, amount]) => ({ label, amount }));
  const balance = state.s.money - state.s.debt;
  const total = ledgerSum(state);
  setStat(state, 'money', state.s.money + total);
  settle(state);
  const applied = state.s.money - state.s.debt - balance;
  if (applied !== total) lines.push({ label: '잔액 한도 조정', amount: applied - total });
  state.board.ledger = {};
  const paid = result.upkeep ??= { lines: [], total: 0 };
  paid.lines.push(...lines);
  paid.total += applied;
}

function finish(state: GameState, ending: EndingId, result: Result) {
  if (Object.keys(state.board.ledger).length) payLedger(state, result);
  state.phase = 'ended';
  state.eventId = null;
  state.ending = ending;
  state.score = finalRank(state).total;
  state.log.push({ turn: state.turn, text: `엔딩 — ${endingInfo(ending).title}`, tone: ending === 'debtor' ? 'bad' : 'good' });
}

function timeoutEnding(state: GameState): EndingId {
  if (netWorth(state) < RULES.debtorNetWorth) return 'debtor';
  if (state.stage === 'academy' && state.s.level >= RULES.academy.timeoutLevel) return 'academy';
  if (state.stage === 'company' && state.s.value >= RULES.company.timeoutValue) return 'ceo';
  return STAGES[state.stage].timeout;
}

function pickEvent(state: GameState, contest: boolean): EventDef | null {
  const available = EVENTS.filter((e) => met(state, e.when) && (state.seen[e.id] === undefined || state.turn - state.seen[e.id] >= RULES.eventCooldown));
  const themed = contest ? available.filter(e => CONTEST_EVENTS.includes(e.id)) : [];
  const pool = themed.length ? themed : available;
  if (!pool.length) return null;
  let pick = randInt(state, pool.reduce((sum, e) => sum + e.weight, 0));
  for (const e of pool) {
    pick -= e.weight;
    if (pick < 0) return e;
  }
  return null;
}

function endSeason(state: GameState, result: Result) {
  const from = dateLabel(state.turn);
  const accrual = upkeepLines(state);
  for (const { label, amount } of accrual) state.board.ledger[label] = (state.board.ledger[label] ?? 0) + amount;
  if (state.stage === 'academy') {
    const seated = Math.min(state.s.students, academySeats(state));
    setStat(state, 'students', seated - Math.max(1, Math.floor(seated / RULES.academy.leaveDiv)));
  }
  if (state.stage === 'company') {
    const c = RULES.company;
    setStat(state, 'value', state.s.value + Math.min(state.s.contracts, state.s.staff * c.perStaff) * c.valuePerContract);
  }
  const over = (state.s.debt + Math.max(0, -ledgerSum(state))) * 100 > creditLimit(state) * RULES.overduePct;
  state.s.overdue = over ? state.s.overdue + 1 : 0;
  if (over) result.notes.push(`대출 한도 초과 — 연체 경고 ${state.s.overdue}/${RULES.overdueStrikes}`);
  state.turn += 1;
  state.s.acts = 0;
  const beforeRefill = state.s.stamina;
  setStat(state, 'stamina', beforeRefill + RULES.seasonRefill);
  result.season = { from, to: dateLabel(state.turn), refill: state.s.stamina - beforeRefill, accrual };
  Object.assign(state.board, { step: 'spin', roll: 0, left: 0, contest: false });
  if (state.s.overdue >= RULES.overdueStrikes) finish(state, 'debtor', result);
  else if (state.turn >= RULES.maxTurns) finish(state, timeoutEnding(state), result);
}

function enterBonus(state: GameState, result: Result) {
  state.board.step = 'bonus';
  if (!hasMenu(state, 'bonus')) endSeason(state, result);
}

function land(state: GameState, result: Result) {
  const kind = nodeAt(state).kind;
  if (kind === 'event' || kind === 'contest') {
    const ev = pickEvent(state, kind === 'contest');
    if (ev) {
      state.board.contest = kind === 'contest';
      state.board.step = 'bonus';
      state.phase = 'event';
      result.eventId = state.eventId = ev.id;
      state.seen[ev.id] = state.turn;
      return;
    }
  } else if (kind === 'rest') {
    const before = state.s.stamina;
    setStat(state, 'stamina', before + RULES.board.restGain);
    result.restGain = state.s.stamina - before;
  } else if (kind === 'fork' || (kind !== 'pay' && hasMenu(state, 'space'))) {
    state.board.step = 'space';
    return;
  }
  enterBonus(state, result);
}

const stops = ACTIONS.filter(a => RANKUP_STOPS.includes(a.id));
function move(state: GameState, result: Result, steps: number) {
  const b = state.board;
  const movement: NonNullable<Result['move']> = { roll: b.roll, path: [], landed: b.pos };
  result.move = movement;
  b.left = 0;
  while (steps > 0) {
    const node = nodeAt(state);
    if (node.kind === 'fork' && b.route === -1) {
      b.step = 'fork';
      b.left = steps;
      movement.stop = 'fork';
      return;
    }
    b.pos = node.next[node.kind === 'fork' ? b.route : 0];
    b.route = -1;
    steps--;
    movement.path.push(b.pos);
    movement.landed = b.pos;
    if (nodeAt(state).kind === 'pay') payLedger(state, result);
    if (BOARD.forks.some(f => f.join === b.pos)) b.forks++;
    if (steps && nodeAt(state).kind === 'rankup' && stops.some(a => met(state, a.when) && met(state, a.need))) {
      movement.stop = 'rankup';
      result.notes.push('승급에 도전할 수 있어 이곳에 멈췄다.');
      break;
    }
  }
  land(state, result);
}

function playBoardOption(state: GameState, id: string, result: Result) {
  const b = state.board;
  if (id === 'spin') {
    b.roll = randInt(state, RULES.board.die) + 1;
    move(state, result, b.roll);
  } else if (id === 'end') endSeason(state, result);
  else if (id.startsWith('route:')) {
    b.route = Number(id.slice(6));
    if (b.step === 'fork') move(state, result, b.left);
    else enterBonus(state, result);
  } else enterBonus(state, result);
}

function resolveOption(state: GameState, id: string) {
  const r = resolve(state).get(id);
  if (!r) throw new Error(`option not available: ${id}`);
  return { r, v: view(state, id, r.kind, r.place, r.choice, r.flight) };
}

function diff(before: GameState['s'], after: GameState['s']): StatMap {
  const deltas: StatMap = {};
  for (const k of STATS) if (after[k] !== before[k]) deltas[k] = after[k] - before[k];
  return deltas;
}

/** Both callers supply a private state and the view priced at the original stamina/condition. */
function applyBranch(state: GameState, before: GameState['s'], r: Resolved, v: OptionView, branch: BranchId): Result {
  const s = state.s;
  const success = branch === 'success';
  const crashed = branch === 'crash';
  const side = success ? 'success' : 'fail';
  const effect = branch === 'sure' ? r.choice.effect! : r.choice.roll![side];
  const outcome = branch === 'sure' ? v.sure! : v.roll![side];
  const result: Result = { optionId: v.id, title: v.title, place: v.place, free: v.free, text: effect.text,
    deltas: {}, crashed, notes: [], stageFrom: state.stage, stageTo: state.stage };

  s.money -= v.cost;
  s.stamina = Math.max(0, s.stamina - v.tire);
  if (branch !== 'sure') {
    s[success ? 'wins' : 'losses'] += 1;
    if (r.flight) {
      const f = RULES.flight;
      s.flights += 1;
      setStat(state, 'cond', s.cond - f.wear);
      if (crashed) {
        s.crashes += 1;
        setStat(state, 'drone', s.drone - 1);
        s.cond = f.crashCond;
        result.notes.push(s.drone > 0 ? '기체가 추락해 크게 부서졌다. 드론 등급이 한 단계 내려갔다.' : '기체가 추락해 전손됐다. 드론을 잃었다.');
      } else if (!success) setStat(state, 'cond', s.cond - f.failWear);
    }
  }
  const level = careerRank(state).level;
  const flag = applyEffect(state, effect, outcome.add);
  if (careerRank(state).level > level) state.board.rankups++;
  if (flag) result.flag = flag;
  result.stageTo = state.stage;
  state.log.push({ turn: state.turn, text: `${v.title} — ${result.text}`, tone: branch === 'sure' ? 'info' : success ? 'good' : 'bad' });
  for (const note of result.notes) state.log.push({ turn: state.turn, text: note, tone: 'bad' });

  if (r.kind !== 'board' && !v.free) s.acts++;
  result.deltas = diff(before, s);
  const afterOption = { ...s };
  if (r.kind === 'board') playBoardOption(state, v.id, result);
  else if (state.phase === 'event') {
    if (state.board.contest && success) state.board.contests++;
    state.board.contest = false;
    state.phase = 'action';
    state.eventId = null;
    enterBonus(state, result);
  } else if (!v.free) {
    if (effect.end) {
      state.turn++;
      finish(state, effect.end, result);
    } else if (state.board.step === 'bonus') endSeason(state, result);
    else enterBonus(state, result);
  }
  if (result.season || result.upkeep || result.restGain !== undefined) result.settle = { deltas: diff(afterOption, s) };
  if (state.ending) result.ended = state.ending;
  if (state.log.length > LOG_MAX) state.log.splice(0, state.log.length - LOG_MAX);
  return result;
}

function copyState(state: GameState): GameState {
  return { ...state, board: { ...state.board, ledger: { ...state.board.ledger } }, s: { ...state.s },
    log: state.log.map(entry => ({ ...entry })), flags: [...state.flags], seen: { ...state.seen } };
}

/** Plays one option on a copy of the state. Throws when the option is not offered or is disabled. */
export function choose(prev: GameState, optionId: string): { state: GameState; result: Result } {
  const { r, v } = resolveOption(prev, optionId);
  if (!v.enabled) throw new Error(`option disabled: ${optionId} (${v.locks.join(', ')})`);
  const state = copyState(prev);
  let branch: BranchId = 'sure';
  let roll: Result['roll'];
  if (v.roll) {
    const value = randInt(state, 100);
    const success = value < v.roll.chance;
    roll = { chance: v.roll.chance, value, success };
    branch = success ? 'success' : 'fail';
    if (!success && r.flight && randInt(state, 100) < (v.roll.crashPct ?? 0)) branch = 'crash';
  }
  const result = applyBranch(state, prev.s, r, v, branch);
  if (roll) result.roll = roll;
  return { state, result };
}

/** Preview even locked choices. Any season/event RNG draws happen on the branch's private copy. */
export function forecast(prev: GameState, optionId: string): Forecast {
  const { r, v } = resolveOption(prev, optionId);
  const ids: BranchId[] = v.roll ? ['success', 'fail'] : ['sure'];
  if (v.roll?.crashPct) ids.push('crash');
  // A locked option the player cannot afford is previewed as if the price were in hand,
  // so the lines show the price and not a loan that choose() would never grant.
  const before = prev.s.money < v.cost ? { ...prev.s, money: v.cost } : prev.s;
  const branches = ids.map((id): BranchForecast => {
    const state = copyState(prev);
    state.s.money = before.money;
    const result = applyBranch(state, before, r, v, id);
    const branch: BranchForecast = { id, deltas: result.deltas, endsSeason: !!result.season || !!result.ended };
    if (result.season) branch.accrual = result.season.accrual;
    if (result.flag) branch.flag = result.flag;
    if (result.stageTo !== result.stageFrom) branch.stage = result.stageTo;
    if (result.ended) branch.end = result.ended;
    return branch;
  });
  const f: Forecast = { cost: v.cost, tire: v.tire, branches };
  if (optionId === 'spin') f.die = RULES.board.die;
  if (v.roll) f.chance = v.roll.chance;
  if (v.roll?.crashPct !== undefined) f.crashPct = v.roll.crashPct;
  return f;
}

// ---------------------------------------------------------------- saves

const ledgerLabels = new Set<string>(UPKEEP_LABELS);

function restoreBoard(raw: unknown): BoardState {
  const board = initialBoard();
  if (!raw || typeof raw !== 'object') return board;
  const data = raw as Partial<BoardState>;
  const inRange = (value: unknown, min: number, max: number): value is number =>
    typeof value === 'number' && Number.isSafeInteger(value) && value >= min && value <= max;
  if (inRange(data.pos, 0, BOARD.nodes.length - 1)) board.pos = data.pos;
  const kind = BOARD.nodes[board.pos].kind;
  if (inRange(data.roll, 1, RULES.board.die)) {
    if (data.step === 'bonus' || (data.step === 'space' && ['train', 'job', 'rankup', 'fork'].includes(kind))) {
      board.step = data.step;
    } else if (kind === 'fork' && data.step === 'fork' && inRange(data.left, 1, data.roll)) {
      board.step = 'fork';
      board.left = data.left;
    }
    if (board.step !== 'spin') board.roll = data.roll;
  }
  if (kind === 'fork' && (board.step === 'spin' || board.step === 'bonus') && inRange(data.route, 0, 1)) {
    board.route = data.route;
  }
  board.contest = kind === 'contest' && data.contest === true;
  for (const key of ['forks', 'contests', 'rankups'] as const) {
    if (inRange(data[key], 0, RULES.maxTurns * 2)) board[key] = data[key];
  }
  if (data.ledger && typeof data.ledger === 'object') {
    for (const [label, amount] of Object.entries(data.ledger)) {
      if (ledgerLabels.has(label) && Number.isSafeInteger(amount) && Math.abs(amount) <= 9_000_000 * RULES.maxTurns) board.ledger[label] = amount;
    }
  }
  return board;
}

const STAGE_IDS = Object.keys(STAGES) as Stage[];

/** Rebuilds a state from untrusted JSON (localStorage). Null when it is not a save this version can continue. */
export function restore(raw: unknown): GameState | null {
  if (!raw || typeof raw !== 'object') return null;
  const d = raw as Partial<GameState> & { s?: Record<string, unknown>; seen?: Record<string, unknown> };
  const int = (x: unknown) => typeof x === 'number' && Number.isInteger(x);
  if (d.v !== 1 || !int(d.seed) || !int(d.rng) || !int(d.turn) || !int(d.score)) return null;
  if (!STAGE_IDS.includes(d.stage as Stage) || !['action', 'event', 'ended'].includes(d.phase as string)) return null;
  if (!d.s || typeof d.s !== 'object' || !Array.isArray(d.flags) || !Array.isArray(d.log)) return null;
  const state = newGame(d.seed!);
  state.rng = d.rng! >>> 0;
  state.turn = clamp(d.turn!, 0, RULES.maxTurns);
  state.stage = d.stage!;
  for (const k of STATS) {
    let value = d.s[k];
    if (!Object.hasOwn(d.s, k)) {
      if (k === 'stamina' || k === 'acts') value = state.s[k];
      if (k === 'theory' || k === 'skill') {
        if (!int(d.s.xp)) return null;
        value = Math.max(Math.floor(d.s.xp / 2), state.stage === 'student' ? 0 : 30);
      }
    }
    if (!int(value)) return null;
    setStat(state, k, value);
  }
  settle(state);
  state.board = restoreBoard(d.board);
  if (d.phase !== 'ended') {
    const behindChoice = d.phase === 'action' && state.board.step === 'bonus';
    state.s.acts = behindChoice ? Math.min(1, state.s.acts) : 0;
  }
  if (d.phase !== 'event') state.board.contest = false;
  state.flags = d.flags.filter((f) => typeof f === 'string' && f in FLAG_LABEL);
  for (const e of EVENTS) {
    const at = d.seen?.[e.id];
    if (int(at)) state.seen[e.id] = at as number;
  }
  state.log = d.log
    .filter((l) => l && typeof l.text === 'string' && int(l.turn))
    .slice(-LOG_MAX)
    .map((l) => ({ turn: l.turn, text: l.text.slice(0, 300), tone: l.tone === 'good' || l.tone === 'bad' ? l.tone : 'info' }));
  const ending = ENDINGS.find((e) => e.id === d.ending);
  if (d.phase === 'ended') {
    if (!ending) return null;
    state.phase = 'ended';
    state.ending = ending.id;
    state.score = clamp(d.score!, 0, RULES.score.max);
  } else if (d.phase === 'event') {
    const ev = EVENTS.find((e) => e.id === d.eventId);
    if (!ev) return null;
    state.phase = 'event';
    state.eventId = ev.id;
  }
  return state;
}
