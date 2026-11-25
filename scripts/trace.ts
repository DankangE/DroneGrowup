// Prints one bot run step by step, for balance debugging.
//   node scripts/trace.ts <policy> [seed]
import { POLICIES, pick, botRandom } from '../src/game/bots.ts';
import { choose, dateLabel, newGame } from '../src/game/engine.ts';

const [name = 'ceo', seedArg = '1'] = process.argv.slice(2);
const policy = POLICIES[name];
if (!policy) throw new Error(`unknown policy ${name}; one of ${Object.keys(POLICIES).join(', ')}`);
let state = newGame(Number(seedArg));
const rand = botRandom(Number(seedArg));
for (let i = 0; i < 20000 && state.phase !== 'ended'; i++) {
  const id = pick(policy, state, rand);
  const { state: next, result } = choose(state, id);
  const s = next.s;
  const roll = result.roll ? (result.roll.success ? ` ok@${result.roll.chance}` : ` FAIL@${result.roll.chance}`) : '';
  console.log(
    `${dateLabel(state.turn)} ${state.stage.padEnd(10)} ${id.padEnd(16)}${roll.padEnd(9)} acts ${s.acts} stamina ${s.stamina} money ${s.money} debt ${s.debt} xp ${s.xp} rep ${s.rep} biz ${s.biz} teach ${s.teach} net ${s.net}` +
    ` d${s.drone}g${s.gear}c${s.car} cond ${s.cond} staff ${s.staff} con ${s.contracts} val ${s.value} stu ${s.students} lv ${s.level} sup ${s.support} od ${s.overdue}`,
  );
  state = next;
}
console.log(`=> ${state.ending} score ${state.score} at turn ${state.turn}`);
