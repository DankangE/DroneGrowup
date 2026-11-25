// Fixed careers and spending, not a board-policy simulation (T14). All amounts are 만원.
import { pathToFileURL } from 'node:url';
import { ACTIONS, RULES } from '../src/game/data.ts';
import { careerAge } from '../src/life/career2.ts';
import { accrue, ECONOMY_KEYS as K, flightPay, homeValue, netWorth, settle } from '../src/life/economy.ts';
import { newGame } from '../src/life/engine.ts';
import { retire } from '../src/life/jobs.ts';
import { LIFE_RULES } from '../src/life/life-data.ts';
import { JOB_RULES } from '../src/life/tracks.ts';
import type { GameState, MapId, TrackId } from '../src/life/types.ts';

type Phase = { age: number; track: TrackId; rank: number; map: MapId; life: GameState['life'];
  contracts?: number; staff?: number; flight?: { action: string; every: number } };
type Purchase = { age: number; cost?: number; home?: { map: MapId; tier: number };
  shop?: { id: string; price: number; income: number }; equipment?: Partial<Pick<GameState['s'], 'drone' | 'gear' | 'car'>> };
type Life = { id: string; name: string; targets: number[]; school: boolean; partTime: boolean;
  phases: Phase[]; purchases: Purchase[]; marriage?: number; children?: number[]; graduate?: number };
export const CHECKPOINTS = [30, 45, 60, 70];
export const TOLERANCE = 25;
export const CASHFLOW_LIVES: Life[] = [
  { id: 'clerk', name: '사무직 · 결혼 · 자녀 둘', targets: [3000, 14000, 33000, 42000], school: true, partTime: true,
    phases: [
      { age: 22, track: 'clerk', rank: 0, map: 'B', life: 1 },
      { age: 26, track: 'clerk', rank: 1, map: 'B', life: 1 },
      { age: 32, track: 'clerk', rank: 2, map: 'B', life: 1 },
      { age: 39, track: 'clerk', rank: 3, map: 'B', life: 1 },
      { age: 55, track: 'clerk', rank: 4, map: 'B', life: 1 },
    ], marriage: 27, children: [28, 31], purchases: [
      { age: 27, home: { map: 'B', tier: 2 }, cost: 1200 },
      { age: 35, cost: 1500 }, { age: 38, cost: 1500 }, { age: 45, home: { map: 'B', tier: 4 } },
    ] },
  { id: 'service', name: '가게 직원 → 점장 · 가게 둘', targets: [1800, 9000, 22000, 30000], school: true, partTime: false,
    phases: [
      { age: 22, track: 'service', rank: 0, map: 'A', life: 0 },
      { age: 28, track: 'service', rank: 1, map: 'B', life: 0 },
      { age: 40, track: 'service', rank: 2, map: 'B', life: 0 },
      { age: 55, track: 'service', rank: 3, map: 'B', life: 0 },
    ], purchases: [
      { age: 28, home: { map: 'B', tier: 1 }, shop: { id: 'drone_cafe', price: 1200, income: 35 } },
      { age: 38, shop: { id: 'drone_shop', price: 3000, income: 80 } },
      { age: 48, home: { map: 'B', tier: 3 } },
    ] },
  { id: 'company', name: '파일럿 → 1인 사업 → 비상장 법인', targets: [2500, 20000, 55000, 80000], school: true, partTime: true,
    phases: [
      { age: 22, track: 'pilot', rank: 0, map: 'C', life: 0, flight: { action: 'job_survey', every: 2 } },
      { age: 30, track: 'solo', rank: 0, map: 'C', life: 1, contracts: 6 },
      { age: 38, track: 'company', rank: 0, map: 'E', life: 1, contracts: 12, staff: 6 },
      { age: 48, track: 'company', rank: 1, map: 'E', life: 1, contracts: 16, staff: 8 },
      { age: 58, track: 'company', rank: 2, map: 'E', life: 1, contracts: 20, staff: 10 },
    ], purchases: [
      { age: 22, cost: 1475, equipment: { drone: 2, gear: 2, car: 1 } },
      { age: 30, cost: 200 }, { age: 38, cost: 1500 },
      { age: 40, cost: 2750, equipment: { drone: 3, gear: 3 } },
      { age: 50, cost: 5775, equipment: { drone: 5, car: 2 } },
    ] },
  { id: 'engineer', name: '엔지니어 · 특구 · 여유 생활', targets: [4000, 26000, 60000, 75000], school: true, partTime: true,
    phases: [
      { age: 23, track: 'engineer', rank: 0, map: 'D', life: 2 },
      { age: 29, track: 'engineer', rank: 1, map: 'D', life: 2 },
      { age: 35, track: 'engineer', rank: 2, map: 'D', life: 2 },
      { age: 43, track: 'engineer', rank: 3, map: 'D', life: 2 },
      { age: 53, track: 'engineer', rank: 4, map: 'D', life: 2 },
    ], graduate: 28, purchases: [{ age: 53, home: { map: 'E', tier: 5 } }] },
];
const actionPay = (id: string) => {
  const action = ACTIONS.find(action => action.id === id)!;
  return (action.roll?.success ?? action.effect)?.add?.money ?? 0;
};

export type CashflowRow = { id: string; name: string; age: number; actual: number; target: number; pass: boolean };
export function runLife(life: Life): CashflowRow[] {
  let state = newGame(1);
  state.status = life.school ? 'student' : 'jobless';
  state.flags.push(JOB_RULES.started);
  state.timers[JOB_RULES.schoolUntil] = JOB_RULES.studySeasons;
  const rows: CashflowRow[] = [];
  while (state.turn < LIFE_RULES.maxTurns) {
    const age = careerAge(state), spring = state.turn % LIFE_RULES.seasons.length === LIFE_RULES.spring;
    const phase = life.phases.filter(phase => phase.age <= age).at(-1);
    if (phase && state.status !== 'retired') {
      if (state.track !== phase.track) state.job.total = 0;
      state.status = 'working'; state.track = phase.track; state.job.rank = phase.rank;
      state.board.pos = `${phase.map}-o0`; state.life = phase.life;
      state.s.contracts = phase.contracts ?? 0; state.s.staff = phase.staff ?? 0;
    }
    if (spring && age === 60 && state.track && state.track !== 'company' && state.track !== 'solo') {
      state = retire(state, 'pension');
      state.family.dual = false; // The fixed spouse schedule retires at the same time.
    }
    if (spring) {
      if (age === life.marriage) { state.family.marriedAt = state.turn; state.family.dual = true; }
      if (life.children?.includes(age)) state.family.kids.push({ born: state.turn, pts: 0, stage: 0 });
      if (age === life.graduate) state.timers[K.graduateUntil] = state.turn + 6;
      for (const purchase of life.purchases.filter(purchase => purchase.age === age)) {
        state.s.money -= purchase.cost ?? 0;
        if (purchase.home) {
          if (state.home) state.s.money += state.home.deposit;
          const value = purchase.home.tier === 1 ? 0 : purchase.home.tier === 2 ? 1500 : homeValue(state, purchase.home);
          state.s.money -= value;
          state.home = { ...purchase.home, deposit: purchase.home.tier < 3 ? value : 0 };
        }
        if (purchase.shop) {
          state.s.money -= purchase.shop.price;
          state.holdings.push({ id: purchase.shop.id, level: 1, paid: purchase.shop.price });
          state.timers[K.shopIncome] = (state.timers[K.shopIncome] ?? 0) + purchase.shop.income;
        }
        Object.assign(state.s, purchase.equipment);
      }
      state = settle(state);
    }
    if (state.status === 'student' && life.partTime && spring) state.s.money += actionPay('st_parttime');
    if (phase?.flight && state.turn % phase.flight.every === 0) {
      // Fixed successful work schedule, with one maintenance bill per flight; no random best-case rolls.
      state.s.money += flightPay(state, actionPay(phase.flight.action)) - RULES.repairBase - state.s.drone * RULES.repairPerLevel;
    }
    state = settle(accrue(state));
    if (state.status === 'working') state.job.total++;
    if (state.track === 'company') state.s.value += Math.min(state.s.contracts, state.s.staff * RULES.company.perStaff)
      * RULES.company.valuePerContract;
    state.turn++;
    const checkpoint = CHECKPOINTS.indexOf(careerAge(state));
    if (checkpoint >= 0 && state.turn % LIFE_RULES.seasons.length === 0) {
      const actual = netWorth(state), target = life.targets[checkpoint];
      rows.push({ id: life.id, name: life.name, age: CHECKPOINTS[checkpoint], actual, target,
        pass: Math.abs(actual - target) * 100 <= target * TOLERANCE });
    }
  }
  return rows;
}

export const cashflows = () => CASHFLOW_LIVES.flatMap(runLife);
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.log('T06 고정 일정 현금흐름 (만원): 집·가족·가게 일정, 고정 직급/성공 일감, 60세 정년. 목표 ±25%.');
  for (const life of CASHFLOW_LIVES) console.log(`${life.name}: 직급 ${life.phases.map(p => `${p.age}세 ${p.track}/${p.rank}`).join(', ')}`);
  const rows = cashflows();
  console.table(rows.map(row => ({ 인생: row.name, 나이: row.age, 순자산: row.actual, 목표: row.target, 결과: row.pass ? 'PASS' : 'FAIL' })));
  const passed = rows.filter(row => row.pass).length;
  console.log(`life cashflow: ${passed}/${rows.length} checkpoints within ±${TOLERANCE}%`);
  if (passed !== rows.length) process.exitCode = 1;
}
