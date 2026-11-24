// Rules of 파일럿 키우기: pure functions over a JSON-serialisable GameState. No DOM, no Date, no Math.random;
// all luck comes from the seeded generator stored in the state, so a seed plus a list of choices replays a run.
import { ACTIONS, ENDINGS, EVENTS, FLAG_LABEL, ITEMS, LOAN_STEPS, REST_LIGHT, RULES, STAGES, STAT_LABEL, STAT_MAX, WIND_DOWN_NOTE } from './data.ts';
import type {
  ActionDef, Choice, Cond, Derived, Effect, EndingDef, EndingId, EventDef, GameState, ItemKind, OptionKind, OptionView,
  OutcomeView, PlaceId, Result, Stage, Stat, StatMap, UpkeepLine,
} from './types.ts';

const STATS = Object.keys(STAT_LABEL) as Stat[];
const ITEM_KINDS: ItemKind[] = ['drone', 'gear', 'car'];
const HIDDEN_IN_SUMMARY: Stat[] = ['acts', 'flights', 'crashes', 'wins', 'losses', 'overdue'];
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

export function newGame(seed: number): GameState {
  const s = Object.fromEntries(STATS.map((k) => [k, 0])) as Record<Stat, number>;
  Object.assign(s, RULES.start);
  const clean = (Math.floor(Number(seed)) >>> 0) || 1;
  return { v: 1, seed: clean, rng: clean, turn: 0, stage: 'student', phase: 'action', s, flags: [], eventId: null, seen: {}, ending: null, score: 0, log: [] };
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
  if (effect.flag && !state.flags.includes(effect.flag)) state.flags.push(effect.flag);
  if (effect.stage) state.stage = effect.stage;
  settle(state);
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
export const netWorth = (state: GameState) => state.s.money - state.s.debt + itemValue(state) + orgWorth(state);
const academySeats = (state: GameState) => RULES.academy.baseSeats + state.s.staff * RULES.academy.seatsPerStaff;

/** Money that moves at the end of a turn, as labelled lines (income positive). */
function upkeepLines(state: GameState): UpkeepLine[] {
  const st = STAGES[state.stage];
  const s = state.s;
  const lines: UpkeepLine[] = [];
  const line = (label: string, amount: number) => { if (amount !== 0) lines.push({ label, amount }); };
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
const won = (n: number) => `${n > 0 ? '+' : ''}${num(n)}만원`;

function summarize(add: StatMap, effect: Effect): string {
  const parts: string[] = [];
  if (add.money) parts.push(won(add.money));
  for (const [k, v] of entries(add)) {
    if (k === 'money' || v === 0 || HIDDEN_IN_SUMMARY.includes(k)) continue;
    parts.push(`${STAT_LABEL[k]} ${v > 0 ? '+' : ''}${num(v)}`);
  }
  if (effect.set?.cond === 100) parts.push('기체 상태 회복');
  if (effect.flag) parts.push(`${FLAG_LABEL[effect.flag] ?? effect.flag} 획득`);
  if (effect.stage) parts.push(`→ ${STAGES[effect.stage].name}`);
  if (effect.end) parts.push(`엔딩: ${endingInfo(effect.end).title}`);
  return parts.join(' · ') || '변화 없음';
}

function outcome(state: GameState, effect: Effect, payPct: number): OutcomeView {
  const add: StatMap = { ...effect.add };
  if (add.money && add.money > 0 && payPct !== 100) add.money = Math.floor((add.money * payPct) / 100);
  return { text: effect.text, add, summary: summarize(add, effect), stage: effect.stage !== state.stage ? effect.stage : undefined, end: effect.end };
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

function resolve(state: GameState): Map<string, Resolved> {
  const map = new Map<string, Resolved>();
  if (state.phase === 'event') {
    const ev = currentEvent(state);
    ev?.choices.forEach((choice, i) => map.set(`ev:${i}`, { kind: 'event', place: ev.place, choice, flight: false }));
  } else if (state.phase === 'action') {
    for (const a of ACTIONS as ActionDef[]) {
      if (!met(state, a.when)) continue;
      const choice = a.id === 'rest' && state.s.acts > 0 ? REST_LIGHT : a;
      map.set(a.id, { kind: a.flight ? 'job' : 'action', place: a.place, choice, flight: a.flight === true });
    }
    for (const f of freeChoices(state)) map.set(f.id, { kind: f.kind, place: f.place, choice: f.choice, flight: false });
  }
  return map;
}

/** Everything the player may look at right now; disabled entries carry the reasons. Empty only when the run has ended. */
export function options(state: GameState): OptionView[] {
  return [...resolve(state)].map(([id, r]) => view(state, id, r.kind, r.place, r.choice, r.flight));
}

// ---------------------------------------------------------------- playing a choice

function finish(state: GameState, ending: EndingId, early: boolean) {
  const info = endingInfo(ending);
  const bonus = info.bonus + (early ? Math.max(0, RULES.maxTurns - state.turn) * RULES.score.turnBonus : 0);
  state.phase = 'ended';
  state.eventId = null;
  state.ending = ending;
  // A debtor scores nothing, even when three overdue strikes came with assets still on the books.
  state.score = ending === 'debtor' ? 0 : clamp(Math.max(0, netWorth(state)) + bonus, 0, RULES.score.max);
  state.log.push({ turn: state.turn, text: `엔딩 — ${info.title}`, tone: ending === 'debtor' ? 'bad' : 'good' });
}

function timeoutEnding(state: GameState): EndingId {
  if (netWorth(state) < RULES.debtorNetWorth) return 'debtor';
  if (state.stage === 'academy' && state.s.level >= RULES.academy.timeoutLevel) return 'academy';
  if (state.stage === 'company' && state.s.value >= RULES.company.timeoutValue) return 'ceo';
  return STAGES[state.stage].timeout;
}

function pickEvent(state: GameState): EventDef | null {
  if (randInt(state, 100) >= RULES.eventChancePct) return null;
  const pool = EVENTS.filter((e) => met(state, e.when) && (state.seen[e.id] === undefined || state.turn - state.seen[e.id] >= RULES.eventCooldown));
  let pick = randInt(state, pool.reduce((sum, e) => sum + e.weight, 0));
  for (const e of pool) {
    pick -= e.weight;
    if (pick < 0) return e;
  }
  return null;
}

/** Settle the season before recovering stamina and rolling the next season's event. */
function endSeason(state: GameState, result: Result, rest: number, auto: boolean) {
  const from = dateLabel(state.turn);
  const lines = upkeepLines(state);
  const total = lines.reduce((sum, l) => sum + l.amount, 0);
  result.upkeep = { lines, total };
  state.s.money += total;
  settle(state);
  if (state.stage === 'academy') {
    const seated = Math.min(state.s.students, academySeats(state));
    setStat(state, 'students', seated - Math.max(1, Math.floor(seated / RULES.academy.leaveDiv)));
  }
  if (state.stage === 'company') {
    const c = RULES.company;
    setStat(state, 'value', state.s.value + Math.min(state.s.contracts, state.s.staff * c.perStaff) * c.valuePerContract);
  }
  const over = state.s.debt * 100 > creditLimit(state) * RULES.overduePct;
  state.s.overdue = over ? state.s.overdue + 1 : 0;
  if (over) result.notes.push(`대출 한도 초과 — 연체 경고 ${state.s.overdue}/${RULES.overdueStrikes}`);
  state.turn += 1;
  state.s.acts = 0;
  result.season = { from, to: dateLabel(state.turn), rest, refill: 0, auto };
  if (state.s.overdue >= RULES.overdueStrikes) return finish(state, 'debtor', false);
  if (state.turn >= RULES.maxTurns) return finish(state, timeoutEnding(state), false);
  const beforeRefill = state.s.stamina;
  setStat(state, 'stamina', beforeRefill + RULES.seasonRefill);
  result.season.refill = state.s.stamina - beforeRefill;
  const ev = pickEvent(state);
  if (ev) {
    state.phase = 'event';
    state.eventId = ev.id;
    state.seen[ev.id] = state.turn;
    result.eventId = ev.id;
  }
}

/** Plays one option on a copy of the state. Throws when the option is not offered or is disabled. */
export function choose(prev: GameState, optionId: string): { state: GameState; result: Result } {
  const r = resolve(prev).get(optionId);
  if (!r) throw new Error(`option not available: ${optionId}`);
  const v = view(prev, optionId, r.kind, r.place, r.choice, r.flight);
  if (!v.enabled) throw new Error(`option disabled: ${optionId} (${v.locks.join(', ')})`);

  const state: GameState = structuredClone(prev);
  const s = state.s;
  const before = { ...s };
  const result: Result = { optionId, title: v.title, place: v.place, free: v.free, text: '', deltas: {}, crashed: false, notes: [], stageFrom: prev.stage, stageTo: prev.stage };
  let picked: { effect: Effect; view: OutcomeView };

  s.money -= v.cost;
  s.stamina -= v.tire;
  if (r.choice.roll && v.roll) {
    const value = randInt(state, 100);
    const success = value < v.roll.chance;
    result.roll = { chance: v.roll.chance, value, success };
    s[success ? 'wins' : 'losses'] += 1;
    picked = success ? { effect: r.choice.roll.success, view: v.roll.success } : { effect: r.choice.roll.fail, view: v.roll.fail };
    if (r.flight) {
      const f = RULES.flight;
      s.flights += 1;
      setStat(state, 'cond', s.cond - f.wear);
      if (!success && randInt(state, 100) < (v.roll.crashPct ?? 0)) {
        result.crashed = true;
        s.crashes += 1;
        setStat(state, 'drone', s.drone - 1);
        s.cond = f.crashCond;
        result.notes.push(s.drone > 0 ? '기체가 추락해 크게 부서졌다. 드론 등급이 한 단계 내려갔다.' : '기체가 추락해 전손됐다. 드론을 잃었다.');
      } else if (!success) setStat(state, 'cond', s.cond - f.failWear);
    }
  } else {
    picked = { effect: r.choice.effect!, view: v.sure! };
  }
  applyEffect(state, picked.effect, picked.view.add);
  result.text = picked.effect.text;
  result.stageTo = state.stage;
  for (const k of STATS) if (s[k] !== before[k]) result.deltas[k] = s[k] - before[k];
  state.log.push({ turn: state.turn, text: `${v.title} — ${result.text}`, tone: result.roll ? (result.roll.success ? 'good' : 'bad') : 'info' });
  for (const note of result.notes) state.log.push({ turn: state.turn, text: note, tone: 'bad' });

  if (state.phase === 'event') {
    state.phase = 'action';
    state.eventId = null;
  } else if (optionId === 'rest') {
    endSeason(state, result, picked.view.add.stamina!, false);
  } else if (!v.free) {
    setStat(state, 'acts', s.acts + 1);
    if (picked.effect.end) {
      state.turn += 1;
      finish(state, picked.effect.end, true);
    } else if (!ACTIONS.some(a => a.id !== 'rest' && (a.tire ?? 0) <= s.stamina && met(state, a.when))) {
      setStat(state, 'stamina', s.stamina + RULES.rest.light);
      result.notes.push(WIND_DOWN_NOTE);
      state.log.push({ turn: state.turn, text: WIND_DOWN_NOTE, tone: 'info' });
      endSeason(state, result, RULES.rest.light, true);
    }
  }
  if (state.ending) result.ended = state.ending;
  if (state.log.length > LOG_MAX) state.log.splice(0, state.log.length - LOG_MAX);
  return { state, result };
}

// ---------------------------------------------------------------- saves

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
