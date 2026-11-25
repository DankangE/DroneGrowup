import { josa } from './text.ts';
// T06: accounting and service choices. Local tables avoid edits to parallel tickets' data files.
import { ITEMS, RULES } from './data.ts';
import type { ItemKind, OptionKind, UpkeepLine } from './base-types.ts';
import { careerAge, careerIncome, careerSalary, careerTrack, CAREER_TEXT } from './career2.ts';
import { HOMES, HOME_RULES, LIFE_RULES } from './life-data.ts';
import { homeValue, rentalIncome } from './home.ts';
import { JOB_RULES } from './tracks.ts';
import { MAPS, WORLD } from './world.ts';
import type { Choice, GameState, MapId, PlaceId } from './types.ts';
export { homeValue } from './home.ts';

export const ECONOMY_RULES = {
  living: [25, 45, 90, 200], livingNames: ['검소', '보통', '여유', '호화'],
  spouse: 20, dual: 80, dualRaise: 10, dualYears: 5, dualMax: 160, child: 35, childUntil: 20,
  vehicle: [0, 5, 15, 30], graduateTuition: 150, graduateSeasons: 6,
  creditBase: 1000, creditSeasons: 8, assetCreditPct: 50, interestPct: 1,
  overduePct: 120, overdueSeasons: 4, liquidationPct: 70,
  lapSeasons: 8, lapPct: 20, lapAllowance: 30,
  shopPct: 85, streetResalePct: 60, phoneResalePct: 50, loans: [100, 500, 2000],
  items: ['drone', 'gear', 'car'] as readonly ItemKind[],
} as const;
// Integration slots for later family/business tickets.
export const ECONOMY_KEYS = {
  graduateUntil: 'economy_graduate_until', education: 'economy_education',
  shopIncome: 'economy_shop_income',
} as const;
export const ECONOMY_TEXT = {
  salary: '급여', allowance: '용돈', living: '생활비', housing: '주거비', lodging: '숙박비',
  spouse: '배우자 생활비', dual: '맞벌이 수입', child: '양육비', education: '자녀 교육비',
  vehicle: '차량 유지비', tuition: '등록금', graduate: '대학원 등록금', interest: '대출 이자',
  rent: '임대 수입', shop: '가게 수입', contracts: '고정 계약 수입', sales: '계약 매출',
  staff: '직원 급여', office: '사옥 운영비', lessons: '수강료 수입', teachers: '교관 급여', campus: '실습장 운영비',
  lap: '한 바퀴 수당', liquidation: '자산을 정리해 빚을 갚았다.',
  status: { student: '학생', jobless: '구직자', working: '재직 중', retired: '은퇴' },
  buy: (name: string) => `${name} 구입`, bought: (name: string) => `${josa(name, '을/를')} 들였다.`,
  sell: (name: string) => `${name} 판매`, sold: (name: string) => `${josa(name, '을/를')} 팔았다.`,
  price: (amount: number) => `${amount}만원. 계절을 사용하지 않는다.`,
  repair: '기체 정비', repaired: '모터와 프로펠러를 점검했다.',
  repairDesc: (condition: number) => `기체 상태 ${condition}% → 100%.`,
  loan: (amount: number) => `대출 ${amount}만원`, borrowed: (amount: number) => `${amount}만원을 빌렸다.`,
  loanDesc: (room: number) => `계절 이자 1%. 남은 한도 ${room}만원.`, creditLock: '신용 한도가 부족합니다.',
  repay: (amount: number) => `상환 ${amount}만원`, repaid: (amount: number) => `${amount}만원을 갚았다.`,
  lifestyle: (name: string) => `${name} 생활`, changed: (name: string) => `${name} 생활로 바꾸었다.`,
  livingDesc: (cost: number) => `기본 생활비 계절당 ${cost}만원. 현재 지도 배수를 적용한다.`,
  overdue: (count: number) => `대출 한도 초과 — 연체 경고 ${count}/4`,
} as const;
const R = ECONOMY_RULES, T = ECONOMY_TEXT, P = LIFE_RULES.percent;
const nodeAt = (state: GameState) => WORLD.find(node => node.id === state.board.pos)!;
const pct = (value: number, percent: number) => Math.floor(value * percent / P);
export const ledgerSum = (state: GameState) => Object.values(state.board.ledger).reduce((a, b) => a + b, 0);
const itemPrice = (state: GameState, kind: ItemKind) => ITEMS[kind].levels[state.s[kind] - 1]?.price ?? 0;

export function salary(state: GameState, map: MapId = nodeAt(state).map): number {
  const region = MAPS[map];
  const multiplier = !region.payTracks?.track || (state.track && region.payTracks.track.includes(state.track))
    ? region.payPct : P;
  return pct(careerSalary(state), multiplier);
}

/** Multiply both integral percentages before flooring: 235 × 175 × 130 / 100² = 534. */
export function flightPay(state: GameState, amount: number): number {
  const track = careerTrack(state), rankPct = track?.ranks[state.job.rank].jobPct ?? P;
  return Math.floor(amount * rankPct * (MAPS[nodeAt(state).map].flightPayPct ?? P) / (P * P));
}

export function assetValue(state: GameState): number {
  const home = state.home ? state.home.tier >= HOME_RULES.ownedTier ? homeValue(state, state.home) : state.home.deposit : 0;
  const items = R.items.reduce((sum, kind) => sum + pct(itemPrice(state, kind), R.phoneResalePct), 0);
  const shops = state.holdings.reduce((sum, holding) => sum + pct(holding.paid, R.liquidationPct), 0);
  const organization = state.track === 'company' ? Math.floor(state.s.value / RULES.company.worthDiv)
    : state.track === 'academy' ? state.s.level * RULES.academy.worthPerLevel : 0;
  return home + items + shops + organization + state.fund.amount
    + state.estates.reduce((sum, estate) => sum + homeValue(state, estate), 0);
}
export const creditLimit = (state: GameState) => R.creditBase + salary(state) * R.creditSeasons
  + pct(assetValue(state), R.assetCreditPct);
export const netWorth = (state: GameState) => state.s.money - state.s.debt + ledgerSum(state) + assetValue(state);

export function upkeepLines(state: GameState): UpkeepLine[] {
  const lines: UpkeepLine[] = [], s = state.s, map = nodeAt(state).map;
  const line = (label: string, amount: number) => { if (amount) lines.push({ label, amount }); };
  line(T.salary, salary(state));
  if (state.status === 'student') {
    line(T.allowance, JOB_RULES.allowance);
    if (state.turn < (state.timers[JOB_RULES.schoolUntil] ?? JOB_RULES.studySeasons)) line(T.tuition, -JOB_RULES.tuition);
  }
  const graduate = state.timers[ECONOMY_KEYS.graduateUntil];
  if (graduate > state.turn && state.turn >= graduate - R.graduateSeasons) line(T.graduate, -R.graduateTuition);
  const income = careerIncome(state);
  line(CAREER_TEXT.pensionLabel, income.pension); line(CAREER_TEXT.benefitLabel, income.unemployment);
  line(T.living, -pct(R.living[state.life], MAPS[map].livePct));
  if (state.home) line(T.housing, -(HOMES[state.home.tier]?.upkeep ?? 0));
  const hasHome = state.home && state.home.tier > 0;
  if (hasHome ? state.home!.map !== map : map !== HOME_RULES.familyMap || careerAge(state) > HOME_RULES.familyAge) {
    line(T.lodging, -HOME_RULES.lodging);
  }
  if (state.family.marriedAt !== null) {
    line(T.spouse, -R.spouse);
    if (state.family.dual) line(T.dual, Math.min(R.dualMax, R.dual + R.dualRaise
      * Math.floor((state.turn - state.family.marriedAt) / (R.dualYears * LIFE_RULES.seasons.length))));
  }
  line(T.child, -R.child * state.family.kids.filter(kid => state.turn - kid.born < R.childUntil * LIFE_RULES.seasons.length).length);
  line(T.education, -(state.timers[ECONOMY_KEYS.education] ?? 0));
  line(T.vehicle, -R.vehicle[s.car]);
  line(T.interest, -pct(s.debt, R.interestPct));
  line(T.rent, rentalIncome(state));
  line(T.shop, state.timers[ECONOMY_KEYS.shopIncome] ?? 0);
  if (state.status === 'working') {
    if (state.track === 'solo') line(T.contracts, s.contracts * RULES.solo.contractPay);
    if (state.track === 'company') {
      const c = RULES.company;
      line(T.sales, Math.min(s.contracts, s.staff * c.perStaff) * c.contractPay);
      line(T.staff, -s.staff * c.pay); line(T.office, -c.overhead);
    }
    if (state.track === 'academy') {
      const a = RULES.academy;
      line(T.lessons, Math.min(s.students, a.baseSeats + s.staff * a.seatsPerStaff) * a.tuition);
      line(T.teachers, -s.staff * a.pay); line(T.campus, -(a.overhead + s.level * a.overheadPerLevel));
    }
  }
  return lines;
}

/** One season, without advancing time. The engine lets T05 advanceCareer post pension/benefits. */
export function accrue(prev: GameState, includeCareerIncome = true): GameState {
  const state = structuredClone(prev);
  if (state.phase === 'ended') return state;
  for (const { label, amount } of upkeepLines(state)) {
    if (!includeCareerIncome && (label === CAREER_TEXT.pensionLabel || label === CAREER_TEXT.benefitLabel)) continue;
    state.board.ledger[label] = (state.board.ledger[label] ?? 0) + amount;
  }
  return state;
}

/** Clear accrued income/expenses exactly once, converting only a cash shortfall into debt. */
export function settle(prev: GameState): GameState {
  const state = structuredClone(prev), balance = state.s.money + ledgerSum(state);
  state.s.money = Math.min(LIFE_RULES.statMax, Math.max(0, balance));
  state.s.debt = Math.min(LIFE_RULES.statMax, state.s.debt + Math.max(0, -balance));
  state.board.ledger = {};
  return state;
}

export function passStart(prev: GameState, map: MapId): GameState {
  const state = structuredClone(prev), elapsed = state.turn - Math.max(0, state.board.lapAt[map]);
  if (elapsed > R.lapSeasons) {
    const bonus = state.status === 'student' || state.status === 'jobless' ? R.lapAllowance : pct(salary(state, map), R.lapPct);
    state.s.money = Math.min(LIFE_RULES.statMax, state.s.money + bonus);
  }
  state.board.lapAt[map] = state.turn;
  return state;
}

/** Sell only until debt is within the recalculated credit limit; the residence is protected. */
export function liquidate(prev: GameState): GameState {
  const state = settle(prev);
  const needed = () => state.s.debt > creditLimit(state);
  const repay = (value: number) => {
    const proceeds = pct(value, R.liquidationPct), paid = Math.min(state.s.debt, proceeds);
    state.s.debt -= paid; state.s.money = Math.min(LIFE_RULES.statMax, state.s.money + proceeds - paid);
  };
  while (needed() && state.holdings.length) repay(state.holdings.shift()!.paid);
  if (needed() && state.fund.amount) { repay(state.fund.amount); state.fund.amount = 0; }
  while (needed() && state.estates.length) repay(homeValue(state, state.estates.shift()!));
  for (const kind of R.items) if (needed() && state.s[kind]) {
    repay(itemPrice(state, kind)); state.s[kind] = 0;
    if (kind === 'drone') state.s.cond = 0;
  }
  state.s.overdue = 0;
  return state;
}

/** Call once per completed season, after all ledger contributors have posted. */
export function checkCredit(prev: GameState): GameState {
  const state = structuredClone(prev);
  const projected = state.s.debt + Math.max(0, -state.s.money - ledgerSum(state));
  state.s.overdue = projected * P > creditLimit(state) * R.overduePct ? state.s.overdue + 1 : 0;
  if (state.s.overdue < R.overdueSeasons) return state;
  const next = liquidate(state);
  next.log.push({ turn: next.turn, text: T.liquidation, tone: 'info' });
  next.log = next.log.slice(-LIFE_RULES.logMax);
  return next;
}

export type EconomyChoice = { id: string; kind: OptionKind; place: PlaceId; choice: Choice; free: boolean; locks?: string[] };
/** Phone choices are a separate view so opening it never changes the board/popup continuation. */
export function economyChoices(state: GameState, phone = false): EconomyChoice[] {
  if (state.phase === 'ended') return [];
  const node = nodeAt(state), street = state.phase === 'action' && state.board.step === 'space' && node.kind === 'shop';
  const out: EconomyChoice[] = [];
  const add = (id: string, kind: OptionKind, choice: Choice, free: boolean, locks?: string[]) =>
    out.push({ id, kind, place: node.place, choice, free, locks });
  if (phone || street) {
    for (const kind of R.items) {
      const next = ITEMS[kind].levels[state.s[kind]], current = ITEMS[kind].levels[state.s[kind] - 1];
      if (next) add(`buy:${kind}`, 'shop', { title: T.buy(next.name), desc: next.desc,
        cost: pct(next.price, street ? R.shopPct : P), effect: { text: T.bought(next.name),
          add: { [kind]: 1 }, ...(kind === 'drone' && { set: { cond: P } }) } }, !street);
      if (current) {
        const price = pct(current.price, street ? R.streetResalePct : R.phoneResalePct);
        add(`sell:${kind}`, 'shop', { title: T.sell(current.name), desc: T.price(price),
          effect: { text: T.sold(current.name), add: { money: price },
            set: { [kind]: 0, ...(kind === 'drone' && { cond: 0 }) } } }, !street);
      }
    }
  }
  if (phone) {
    if (state.s.drone && state.s.cond < P) add('repair', 'repair', { title: T.repair, desc: T.repairDesc(state.s.cond),
      cost: RULES.repairBase + state.s.drone * RULES.repairPerLevel, effect: { text: T.repaired, set: { cond: P } } }, true);
    const room = creditLimit(state) - state.s.debt;
    for (const amount of R.loans) add(`loan:${amount}`, 'bank', { title: T.loan(amount), desc: T.loanDesc(Math.max(0, room)),
      effect: { text: T.borrowed(amount), add: { money: amount, debt: amount } } }, true, room < amount ? [T.creditLock] : []);
    const payments = new Set([...R.loans.map(n => Math.min(n, state.s.debt)), Math.min(state.s.money, state.s.debt)]);
    for (const amount of payments) if (amount > 0) add(`repay:${amount}`, 'bank', { title: T.repay(amount),
      desc: T.price(amount), cost: amount, effect: { text: T.repaid(amount), add: { debt: -amount } } }, true);
  }
  if (!phone && state.phase === 'action' && state.board.step === 'space' && node.kind === 'life') {
    R.living.forEach((cost, level) => add(`lifestyle:${level}`, 'action', { title: T.lifestyle(R.livingNames[level]),
      desc: T.livingDesc(cost), effect: { text: T.changed(R.livingNames[level]) } }, false));
  }
  return out;
}

export function applyEconomyChoice(prev: GameState, id: string): GameState {
  const state = structuredClone(prev);
  if (id.startsWith('lifestyle:')) state.life = Number(id.slice('lifestyle:'.length)) as GameState['life'];
  return state;
}

export function economyView(state: GameState) {
  const track = careerTrack(state), lines = upkeepLines(state);
  return { creditLimit: creditLimit(state), netWorth: netWorth(state),
    stageName: track?.name ?? T.status[state.status], rankName: track?.ranks[state.job.rank].title ?? '',
    items: Object.fromEntries(R.items.map(kind => [kind, { level: state.s[kind],
      name: ITEMS[kind].levels[state.s[kind] - 1]?.name ?? ITEMS[kind].none }])) as Record<ItemKind, { level: number; name: string }>,
    upkeep: { lines, total: lines.reduce((sum, line) => sum + line.amount, 0) } };
}
