// T15: compare public forecasts with real seeded choices, including every event response branch.
import { cardChoice, CARDS, grantCard } from '../src/life/cards.ts';
import { isDeepStrictEqual } from 'node:util';
import { pathToFileURL } from 'node:url';
import { ALL_EVENTS, choose, eventCandidates, forecast, newGame, options } from '../src/life/engine.ts';
import type { OptionView } from '../src/life/engine.ts';
import { ACTIONS, EVENTS } from '../src/life/compat.ts';
import { EVENT_KEYS as K, materialize } from '../src/life/events-a.ts';
import { EVENT2_KEYS as K2 } from '../src/life/events-e.ts';
import { ENDINGS2, ENDING_RULES, LIFE_RULES, SPACE_MENU, STATS } from '../src/life/life-data.ts';
import { CREATOR_VIDEO, TRACK_PREP, TRACK_TRAIN, TRACK_WORK } from '../src/life/tracks.ts';
import { WORLD } from '../src/life/world.ts';
import { settlementSummary } from '../src/life/ending.ts';
import { POLICY_IDS } from '../src/life/bots.ts';
import { runLife } from './simulate-life.ts';
import type { Cond, GameState } from '../src/life/types.ts';

// Rare family/retirement events need coherent eligibility, not just large stats.
export function eventFixture(id: string): GameState {
  const s = choose(newGame(17), 'start:self').state;
  s.turn = 84; s.phase = 'event'; s.eventId = id;
  s.board.pos = 'B-o5'; s.board.step = 'space'; s.board.dice = [1, 1];
  s.status = 'working'; s.track = 'clerk'; s.job = { rank: 2, perf: 85, tenure: 44, total: 44, warn: 0, changedAt: 0, tracks: ['clerk'] };
  Object.assign(s.s, { money: 100000, happy: 100, stamina: 70, net: 150, rep: 150, xp: 480, biz: 150,
    skill: 270, drone: 4, gear: 1, car: 2, staff: 3, value: 20000, rank: 2, fans: 100 });
  s.flags.push('licensed', 'tech', 'partner'); s.home = { map: 'B', tier: 4, deposit: 0 };
  s.family = { partnerAt: 4, marriedAt: 8, dual: false, kids: [{ born: 44, pts: 2, stage: 1 }] };
  s.holdings = [{ id: 'drone_cafe', level: 1, paid: 1200 }];
  if (['blind_date', 'old_friend', 'proposal'].includes(id)) s.family.marriedAt = null;
  if (['blind_date', 'old_friend'].includes(id)) { s.family.partnerAt = null; s.flags = s.flags.filter(f => f !== 'partner'); }
  if (id === 'kid_teen') s.family.kids[0].born = 24;
  if (['kid_wedding', 'grandchild'].includes(id)) {
    s.turn = 148; s.s.capStamina = 90; s.family.kids[0].born = 20; s.family.kids[0].stage = 4;
    if (id === 'grandchild') s.timers[K.married(0)] = 140;
  }
  if (id === 'rent_hike') s.home.tier = 1;
  if (id === 'jeonse_alarm') { s.home.tier = 2; s.home.deposit = 1500; }
  if (id === 'hq_call') s.board.pos = 'A-o5';
  if (id === 'mentor') { s.job.rank = 1; s.s.rank = 1; }
  if (id === 'audit_note') s.job.perf = 39;
  if (id === 'early_retire') { s.turn = 132; s.s.capStamina = 90; }
  if (['gear_sponsor', 'drone_show'].includes(id)) s.track = 'pilot';
  if (['big_order', 'partner_exit', 'gov_project', 'export_deal'].includes(id)) s.track = 'company';
  if (['crash', 'bull'].includes(id)) s.fund = { kind: 1, amount: 1001 };
  if (id === 'burnout') s.timers[K2.lowStamina] = 2;
  if (['wrist', 'field_call'].includes(id)) s.track = 'pilot';
  if (['illness', 'parents_care'].includes(id)) s.turn = 104;
  if (id === 'holiday') s.turn = 85;
  if (['fast_track', 'd_scout'].includes(id)) { s.board.pos = 'D-o5'; s.s.theory = 240; }
  if (id === 'fast_track') s.track = 'engineer';
  if (['second_act', 'memoir', 'cruise', 'successor'].includes(id)) {
    s.turn = id === 'successor' ? 184 : id === 'second_act' ? 144 : 164;
    s.s.capStamina = s.turn >= 164 ? 80 : 90; s.status = 'retired'; s.track = null;
    s.family.kids[0].stage = 4;
  }
  const legacy = EVENTS.find(row => row.id === id);
  if (legacy) {
    const meet = (cond: Cond) => {
      if (cond.status) s.status = cond.status[0]; if (cond.track) s.track = cond.track[0];
      Object.assign(s.s, cond.min, cond.max); s.flags = [...new Set([...s.flags, ...cond.flags ?? []])].filter(f => !cond.notFlags?.includes(f));
      if (cond.any) meet(cond.any[0]);
    };
    meet(legacy.when); s.job.rank = s.s.rank = 0;
  }
  return s;
}

function meet(state: GameState, cond?: Cond): void {
  if (!cond) return;
  if (cond.status) state.status=cond.status[0];
  if (cond.track) { state.track=cond.track[0]; state.status='working'; state.job.tracks=[state.track]; }
  Object.assign(state.s,cond.min,cond.max);
  state.flags=[...new Set([...state.flags,...cond.flags??[]])].filter(f=>!cond.notFlags?.includes(f));
  if (cond.any) meet(state,cond.any[0]);
}
export function checkOutcome(before: GameState, option: OptionView, menu: 'board' | 'phone' = 'board',
  force = true): { branches: string[]; failures: string[]; cases: number } {
  const original=structuredClone(before), failures: string[]=[], covered=new Set<string>(); let cases=0;
  const preview=forecast(before,option.id,menu);
  const equal=(name:string,a:unknown,b:unknown)=>{if(!isDeepStrictEqual(a,b)) failures.push(`${name}: ${JSON.stringify(a)} != ${JSON.stringify(b)}`);};
  equal('price',[preview.cost,preview.tire],[option.cost,option.tire]);
  equal('odds',preview.chance,option.roll?.chance);
  const wanted=preview.branches.map(b=>b.id).filter(id=>id!=='crash'||(option.roll?.crashPct??0)>0);
  for(let seed=0;seed<(force?4096:1)&&covered.size<wanted.length;seed++) {
    const state={...before,rng:force?seed:before.rng}, result=choose(state,option.id,menu);
    const actual=result.result, branch=actual.crashed?'crash':actual.roll?(actual.roll.success?'success':'fail'):'sure';
    if(covered.has(branch)) continue;
    covered.add(branch);cases++;
    // Preview stochastic ancillary effects (e.g. video fans) using the same RNG as choose.
    const expected=forecast(state,option.id,menu).branches.find(b=>b.id===branch);
    if(!expected){failures.push(`missing forecast branch ${branch}`);continue;}
    equal(`${branch} odds`,actual.roll?.chance,preview.chance);
    equal(`${branch} deltas`,actual.deltas,expected.deltas);
    if(expected.effects) equal(`${branch} persistent effects`,actual.effects,expected.effects);
    equal(`${branch} ends season`,!!actual.season,expected.endsSeason);
    equal(`${branch} accrual`,actual.season?.accrual,expected.accrual);
    for(const stat of STATS) equal(`${branch} total ${stat}`,result.state.s[stat]-state.s[stat],
      (actual.deltas[stat]??0)+(actual.settle?.deltas[stat]??0));
    if(Object.values(result.state.s).some(n=>!Number.isSafeInteger(n))) failures.push('noninteger stat');
  }
  if(force) equal('branch coverage',[...covered].sort(),[...wanted].sort());
  equal('input mutation',before,original);
  return {branches:[...covered],failures,cases};
}
export function outcomeReport() {
  const failures:string[]=[], coverage=new Set<string>(); let cases=0, choices=0;
  const inspect=(key:string,state:GameState,id:string,menu:'board'|'phone'='board',force=true)=>{
    const card=id.startsWith('card:')?cardChoice(state,id):null;
    const option: OptionView | undefined=card ? { id,kind:'board',place:WORLD.find(n=>n.id===state.board.pos)!.place,
      title:card.choice.title,desc:card.choice.desc,cost:0,tire:0,free:true,enabled:!card.locks.length,locks:card.locks,missing:[],
      sure:{text:card.choice.effect!.text,add:card.choice.effect!.add??{}} } : options(state,menu).find(o=>o.id===id);
    if(!option?.enabled){failures.push(`${key}: unavailable ${option?.locks.join(', ')??id}`);return;}
    const result=checkOutcome(state,option,menu,force);choices++;cases+=result.cases;
    result.branches.forEach(branch=>coverage.add(`${key}/${branch}`));
    failures.push(...result.failures.map(f=>`${key}: ${f}`));
  };
  for(const event of ALL_EVENTS) {
    const state=eventFixture(event.id);
    if(!eventCandidates(state).some(e=>e.id===event.id)) failures.push(`${event.id}: ineligible fixture`);
    materialize(event,state).choices.forEach((_,i)=>inspect(`event:${event.id}:${i}`,state,`ev:${i}`));
    const poor=structuredClone(state);poor.s.money=0;poor.s.stamina=0;
    if(!options(poor).some(o=>o.id.startsWith('ev:')&&o.enabled&&!o.cost&&!o.tire)) failures.push(`${event.id}: no free response`);
  }
  for(const action of [...ACTIONS,...TRACK_WORK,...TRACK_TRAIN,...TRACK_PREP,CREATOR_VIDEO]) {
    const state=choose(newGame(1),'start:self').state;state.turn=40;
    Object.assign(state.s,{money:1000000,stamina:80,cond:80,drone:4,gear:3,car:2});
    meet(state,action.when);meet(state,action.need);state.job.rank=state.s.rank;
    const tile=Object.entries(SPACE_MENU).find(([,ids])=>ids.includes(action.id))?.[0];
    const variants=action===CREATOR_VIDEO?['space']:action.id.startsWith('prep_')?['space']:['space','bonus'];
    for(const step of variants) {
      if(step==='space'&&!tile&&action!==CREATOR_VIDEO) continue;
      const node=WORLD.find(n=>step==='space'?n.kind===(action===CREATOR_VIDEO?'job':tile):n.place===action.place);
      if(!node){failures.push(`action:${action.id}:${step}: missing location`);continue;}
      state.board.pos=node.id;state.board.step=step as 'space'|'bonus';
      inspect(`action:${action.id}:${step}`,state,`act:${action.id}`);
    }
  }
  for (const card of CARDS) {
    const state = grantCard(choose(newGame(1), 'start:self').state, card.id);
    state.s.drone = 1; state.s.cond = 50;
    inspect(`card:${card.id}:use`, state, `card:use:${card.id}`);
    inspect(`card:${card.id}:drop`, state, `card:drop:${card.id}`);
  }
  // Actual service/board choices retain context (discounts, job popups, year end and retirement).
  const sampled=new Set<string>();
  for(const policy of POLICY_IDS) {
    const {state}=runLife(policy,1,'base',{trace:step=>{
      const key=`run:${step.before.eventId??step.before.track??step.before.status}:${step.before.board.step}:${step.option.id}`;
      if(sampled.has(key)||step.option.id==='spin'||step.option.id.startsWith('go:')) return;
      sampled.add(key);inspect(key,step.before,step.option.id,step.menu,false);
    }});
    const summary=settlementSummary(state);
    if(state.phase!=='ended'||state.turn!==LIFE_RULES.maxTurns||!ENDINGS2.some(e=>e.id===state.ending)
      ||state.score!==summary.score||summary.featScore>ENDING_RULES.featCap
      ||state.score>Math.max(0,summary.netWorth)+59970) failures.push(`${policy}: invalid settlement`);
  }
  return {events:ALL_EVENTS.length,choices,branches:coverage.size,cases,failures};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) {
  const report=outcomeReport();
  report.failures.forEach(f=>console.error(f));
  console.log(`life outcomes: ${report.events} events, ${report.choices} choices, ${report.branches} branches, ${report.cases} cases, ${report.failures.length} failures`);
  if(report.failures.length) process.exitCode=1;
}
