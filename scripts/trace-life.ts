// Usage: node scripts/trace-life.ts [policy] [seed] [base|single|no-bank]
import { pathToFileURL } from 'node:url';
import { POLICY_IDS } from '../src/life/bots.ts';
import type { PolicyId } from '../src/life/bots.ts';
import { runLife, table } from './simulate-life.ts';
import type { Experiment } from './simulate-life.ts';
export function traceLife(policy: PolicyId, seed: number, experiment: Experiment = 'base'): string {
  const rows: (string|number)[][] = [];
  const { report } = runLife(policy,seed,experiment,{keepLog:true,trace: ({before,after,option,result,menu}) => {
    rows.push([before.turn,before.board.pos,`${before.phase}/${before.board.step}`,menu,option.id,
      result.roll ? `${result.roll.value}<${result.roll.chance}:${result.roll.success}` : '',
      after.turn,after.board.pos,after.track ?? after.status,after.job.rank,after.s.money,after.s.debt,after.s.happy]);
  }});
  return table(`${policy} seed=${seed} experiment=${experiment}`,['계절','출발','단계','메뉴','선택','굴림','다음계절','도착','직업','직급','현금','빚','행복'],rows)
    + JSON.stringify(report,null,2);
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const policy = process.argv[2] ?? 'clerk_family', seed = Number(process.argv[3] ?? 1), experiment = process.argv[4] ?? 'base';
    if (!POLICY_IDS.includes(policy as PolicyId) || !Number.isSafeInteger(seed) || seed < 1
      || !['base','single','no-bank'].includes(experiment)) throw new Error('Usage: trace-life.ts [policy] [positive seed] [base|single|no-bank]');
    console.log(traceLife(policy as PolicyId,seed,experiment as Experiment));
  } catch (error) { console.error(error); process.exitCode = 1; }
}
