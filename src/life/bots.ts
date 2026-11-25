// §13.1. Local policy tables keep T14 inside its file boundary; no balance values are changed.
import { ACTIONS } from './compat.ts';
import { currentEvent, met } from './engine.ts';
import type { OptionView } from './engine.ts';
import type { LifeEffect } from './events-a.ts';
import { FAMILY_RULES, LIFE_RULES, MAP_IDS, SPACE_MENU } from './life-data.ts';
import { randInt } from './move.ts';
import { TRACKS } from './tracks.ts';
import { MAPS, WORLD } from './world.ts';
import type { Cond, GameState, MapId, SpaceKind, Stat, TrackId } from './types.ts';

type Policy = { start: 'school' | 'work' | 'self'; tracks: TrackId[]; map: MapId; focus?: boolean;
  kinds: SpaceKind[]; stats: Stat[]; home: number; life: GameState['life']; kids?: number; shops?: boolean;
  actions?: string[]; invest?: boolean; luxury?: boolean; wander?: boolean; random?: boolean };
export const POLICIES = {
  clerk_family: { start: 'school', tracks: ['clerk'], map: 'B', kinds: ['life','estate','train','job','rankup'], stats: ['xp','net','biz'], home: 4, life: 1, kids: 2 },
  service_frugal: { start: 'work', tracks: ['service'], map: 'B', kinds: ['biz','job','train','rankup'], stats: ['xp','net','biz'], home: 3, life: 0, shops: true },
  mechanic: { start: 'self', tracks: ['mechanic'], map: 'C', focus: true, kinds: ['train','job','rankup','estate'], stats: ['skill','xp','theory'], home: 3, life: 1 },
  official: { start: 'school', tracks: ['public'], map: 'B', focus: true, kinds: ['train','jobfair','rankup','job'], stats: ['theory','xp','net'], home: 3, life: 1 },
  pilot: { start: 'school', tracks: ['pilot'], map: 'C', focus: true, kinds: ['job','contest','train','shop'], stats: ['skill','rep','flights'], home: 3, life: 1 },
  employee: { start: 'school', tracks: ['pilot','employee'], map: 'E', focus: true, kinds: ['train','job','rankup','estate'], stats: ['xp','biz','rep'], home: 4, life: 1 },
  instructor_academy: { start: 'school', tracks: ['pilot','instructor','academy'], map: 'B', kinds: ['train','job','rankup','station'], stats: ['teach','rep','net','students','staff','level'], home: 3, life: 1, actions: ['inst_examiner','academy_found','ac_expand','ac_expand2','ac_accredit'] },
  solo_ceo: { start: 'school', tracks: ['pilot','solo','company'], map: 'E', kinds: ['job','train','rankup','shop'], stats: ['biz','rep','net','contracts','staff','value','round'], home: 4, life: 1, actions: ['solo_register','corp_found','co_ir','co_ipo'] },
  chairman: { start: 'school', tracks: ['pilot','director'], map: 'B', kinds: ['train','job','rankup','life'], stats: ['net','rep','support'], home: 3, life: 1, actions: ['assoc_join','assoc_run','dir_vice','dir_chair'] },
  engineer: { start: 'school', tracks: ['engineer'], map: 'D', focus: true, kinds: ['train','rankup','job','station'], stats: ['theory','xp','biz'], home: 3, life: 2 },
  specialist_field: { start: 'school', tracks: ['pilot','inspector','film'], map: 'D', focus: true, kinds: ['train','job','shop','rankup'], stats: ['skill','rep','xp'], home: 3, life: 1 },
  racer_creator: { start: 'school', tracks: ['racer','creator'], map: 'D', focus: true, kinds: ['train','contest','job','rankup'], stats: ['skill','rep','fans'], home: 3, life: 1 },
  investor: { start: 'work', tracks: ['service','clerk','employee'], map: 'E', kinds: ['invest','estate','job','rankup'], stats: ['xp','biz','net'], home: 3, life: 1, invest: true },
  bon_vivant: { start: 'work', tracks: ['service','clerk'], map: 'F', kinds: ['life','rest','event','station'], stats: ['happy','net'], home: 4, life: 2, luxury: true },
  drifter: { start: 'self', tracks: [], map: 'B', kinds: ['station','jobfair','event','luck'], stats: ['xp','skill','theory'], home: 1, life: 1, wander: true },
  random: { start: 'self', tracks: [], map: 'A', kinds: [], stats: [], home: 0, life: 0, random: true },
} satisfies Record<string, Policy>;
export type PolicyId = keyof typeof POLICIES;
export const POLICY_IDS = Object.keys(POLICIES) as PolicyId[];
const R = { reserve: 200, rich: 8000, priority: 1200, good: 240, goalMap: 90, newMap: 25, kind: 18, workPerf: 80,
  need: 12, stat: 4, moneyDiv: 12, lowMoney: 800, stamina: 35, repair: 60, travel: 40, distance: 30,
  investPct: 50, maxPhone: 1, reject: -100000, defaultScore: 1, cashWeight: 3,
  equipment: { drone: 3, gear: 2, car: 1 }, text: { noOption: 'bot has no enabled continuation' } } as const;
export const BOT_LIMITS = { stepsPerSeason: 32, maxPhone: R.maxPhone } as const;
const nodes = new Map(WORLD.map(n => [n.id, n]));
const distances = new Map<MapId, Map<string, number>>();
for (const map of MAP_IDS) {
  const distance = new Map(WORLD.filter(n => n.map === map).map(n => [n.id, 0]));
  for (let pass = 0; pass < WORLD.length; pass++) for (const node of WORLD) {
    const next = [...node.next, ...(node.cross?.map(c => c.to) ?? [])];
    const best = Math.min(...next.map(id => distance.get(id) ?? WORLD.length)) + 1;
    if (best < (distance.get(node.id) ?? WORLD.length)) distance.set(node.id, best);
  }
  distances.set(map, distance);
}
const actions = new Map(ACTIONS.map(a => [`act:${a.id}`, a]));
export type BotContext = { phoneUsed: boolean; tried: readonly string[]; noBank?: boolean; salaryIncome: number; invested: number };
export const bankChoice = (id: string) => /^(loan:|repay:)/.test(id) || id.endsWith(':mortgage');
export function targetTracks(id: PolicyId, state: GameState): TrackId[] {
  if (id === 'racer_creator') return state.turn < (45 - LIFE_RULES.startAge) * LIFE_RULES.seasons.length ? ['racer'] : ['creator'];
  return POLICIES[id].tracks;
}
function desiredMap(p: Policy, s: GameState): MapId {
  if (s.status === 'student' && !s.flags.includes('degree')) return 'A';
  if ((p.tracks.includes('pilot') || p.map === 'D') && !s.flags.includes('licensed')) return 'A';
  if (p.map === 'D' && !met(s, MAPS.D.gate)) return 'A';
  if (s.status === 'retired') return 'F';
  if (p.tracks.includes('company') && !s.flags.includes('listed')) return 'B';
  if (p.wander || (!p.focus && s.turn % R.travel < LIFE_RULES.seasons.length)) {
    return MAP_IDS[Math.floor(s.turn / R.travel) % MAP_IDS.length];
  }
  return p.map;
}
function needs(condition: Cond | undefined, state: GameState): Stat[] {
  return Object.entries(condition?.min ?? {}).filter(([key, min]) => state.s[key as Stat] < min).map(([key]) => key as Stat)
    .concat(condition?.any?.flatMap(c => needs(c, state)) ?? []);
}
/** Integer expected gains from the offered odds, without forecasting/cloning entire futures. */
function utility(p: Policy, s: GameState, o: OptionView, needed: Stat[]): number {
  const weight = (stat: Stat) => stat === 'money' ? (s.s.money < R.lowMoney ? R.cashWeight : 1)
    : stat === 'stamina' ? (s.s.stamina < R.stamina ? R.stat : 0)
    : needed.includes(stat) ? R.need : p.stats.includes(stat) ? R.stat : 1;
  const value = (add: OptionView['sure']) => Object.entries(add?.add ?? {}).reduce((sum, [stat, n]) =>
    sum + n * weight(stat as Stat) / (stat === 'money' ? R.moneyDiv : 1), 0);
  return Math.floor((o.roll ? (value(o.roll.success) * o.roll.chance + value(o.roll.fail) * (LIFE_RULES.percent - o.roll.chance))
    / LIFE_RULES.percent : value(o.sure)) - o.cost / R.moneyDiv - o.tire);
}
export function pickBot(id: PolicyId, s: GameState, offered: readonly OptionView[], context: BotContext): OptionView {
  const p: Policy = POLICIES[id], tracks = targetTracks(id, s);
  const usable = offered.filter(o => o.enabled && !(context.noBank && bankChoice(o.id))
    && !(context.tried.includes(o.id) && (o.free || o.id.startsWith('job:')) && !['job:none','skip','end'].includes(o.id)));
  if (!usable.length) throw new Error(R.text.noOption);
  if (p.random) return usable[randInt({ ...s }, usable.length)];
  const target = TRACKS.find(t => t.id === tracks.at(-1));
  const current = TRACKS.find(t => t.id === s.track), needed = [...needs(target?.entry, s),
    ...needs(current?.ranks[s.job.rank + 1]?.need, s)];
  const license = (tracks.includes('pilot') || p.map === 'D') && !s.flags.includes('licensed');
  const exam = actions.get('act:st_exam')!;
  if (license) needed.push(...needs(exam.need, s));
  const poor = s.s.money < (license ? (exam.cost ?? 0) + R.reserve : R.lowMoney);
  const map = desiredMap(p, s), currentGoal = tracks.indexOf(s.track!);
  const ready = [...(p.actions ?? []).map(id => actions.get(`act:${id}`)!), ...(license ? [exam] : [])]
    .filter(a => a && met(s, a.when) && met(s, a.need) && s.s.money >= (a.cost ?? 0)
      && !(a.effect?.end && s.feats.includes(a.effect.end)) && !(a.roll?.success.end && s.feats.includes(a.roll.success.end)));
  const hireable = TRACKS.filter(t => t.tier < 4 && tracks.indexOf(t.id) > currentGoal && met(s, t.entry));
  const choice = (o: OptionView): number => {
    const key = o.id, parts = key.split(':');
    if (key.startsWith('go:') || key.startsWith('express:')) {
      const node = nodes.get(parts[1])!, priority = p.kinds.indexOf(node.kind);
      return (s.board.pos[0] !== map ? R.priority - (distances.get(map)!.get(node.id) ?? WORLD.length) * R.distance : 0)
        + (node.map === map ? R.goalMap : 0) + (!(s.board.visited & (1 << MAP_IDS.indexOf(node.map))) ? R.newMap : 0)
        + (priority < 0 ? 0 : (p.kinds.length - priority) * R.kind)
        + (node.kind === 'jobfair' && hireable.some(t => t.maps === 'any' || t.maps.includes(node.map)) ? R.priority : 0)
        + (ready.some(a => a.place === node.place || SPACE_MENU[node.kind]?.includes(a.id)) ? R.priority : 0)
        + (node.kind === 'job' && (poor || needed.includes('flights') || (s.status === 'working' && s.job.perf < R.workPerf)) ? R.priority : 0)
        + (node.kind === 'train' && !poor && ((s.status === 'student' && !s.flags.includes('degree')) || needed.length) ? R.good : 0)
        + (p.kids && s.family.partnerAt === null && FAMILY_RULES.datePlaces.includes(node.place) ? R.priority : 0)
        + (p.kids && node.kind === 'estate' && (s.home?.tier ?? 0) < p.home ? R.good : 0)
        + (p.kids && node.place === FAMILY_RULES.babyPlace && s.family.marriedAt !== null && s.family.kids.length < p.kids ? R.priority : 0)
        + (p.kids && FAMILY_RULES.weddingPlaces.includes(node.place) && s.family.partnerAt !== null && s.family.marriedAt === null ? R.priority : 0)
        + (node.kind === 'rankup' && s.status === 'working' && !needed.length ? R.good : 0);
    }
    if (key.startsWith('start:')) return parts[1] === p.start ? R.priority : R.reject;
    if (key === 'quit' || /^(sell:|biz:sell:|home:sell:|fund:out:|event:retire:)/.test(key)) return R.reject;
    if (key.startsWith('job:') && key !== 'job:none') {
      const pos = tracks.indexOf(parts[1] as TrackId);
      return p.wander ? R.priority : pos >= 0 && pos >= currentGoal ? R.priority + pos
        : s.status === 'jobless' && !s.track ? R.good : R.reject;
    }
    if (key === 'promo' || key === 'luck:promote') return R.priority;
    if (key.startsWith('retire:')) return key === 'retire:pension' ? R.priority : R.reject;
    if (key === 'graduate:enroll') return id === 'engineer' ? R.priority : R.reject;
    if (key.startsWith('lifestyle:')) return Number(parts[1]) === (s.status === 'student' ? 0 : p.luxury && s.s.money > R.rich ? 3 : p.life)
      && Number(parts[1]) !== s.life ? R.good : R.reject;
    if (key === 'date') return p.kids ? R.priority : R.reject;
    if (key.startsWith('wed:')) return p.kids && parts[1] === '1' ? R.priority : R.reject;
    if (key === 'dual:1' || key === 'edu:1' || key === 'gift:1') return R.good;
    if (key === 'baby') return s.family.kids.length < (p.kids ?? 0) ? R.priority : R.reject;
    if (key.startsWith('home:')) {
      const tier = Number(parts[2]), owned = (s.home?.tier ?? 0) >= p.home;
      if (parts[1] === 'buy' && !p.invest && s.estates.some(e => e.tier === tier)) return R.reject;
      if ((key.endsWith(':mortgage') && !p.kids) || s.s.money - o.cost < R.reserve) return R.reject;
      if (parts[1] === 'move') return tier === p.home && (s.home?.tier !== tier || s.home.map !== map) ? R.priority : R.reject;
      return (tier === p.home && (!owned || p.invest)) || (p.kids && !s.home && tier === 2) ? R.priority : R.reject;
    }
    if (key.startsWith('biz:')) return p.shops && s.s.money - o.cost >= R.reserve ? R.priority : R.reject;
    if (key.startsWith('fund:')) {
      if (!p.invest || parts[1] !== 'in') return R.reject;
      const budget = Math.floor(context.salaryIncome * R.investPct / LIFE_RULES.percent) - context.invested;
      return o.cost <= budget && s.s.money - o.cost >= R.reserve ? R.good + o.cost : R.reject;
    }
    if (key.startsWith('leisure:')) return p.luxury || p.kids ? R.good + utility(p, s, o, needed) : R.reject;
    if (key.startsWith('buy:')) {
      const kind = parts[1] as keyof typeof R.equipment;
      return s.s[kind] < R.equipment[kind] && tracks.some(t => !['clerk','service','public','mechanic','engineer'].includes(t))
        && s.s.money - o.cost >= R.reserve ? R.good : R.reject;
    }
    if (key === 'repair') return s.s.cond < R.repair ? R.good : R.reject;
    if (key.startsWith('repay:')) return s.s.money - o.cost >= R.reserve ? R.good + o.cost : R.reject;
    if (key.startsWith('loan:')) return R.reject;
    if (poor && ['act:st_parttime','act:st_assist'].includes(key)) return R.priority + utility(p, s, o, needed);
    const action = actions.get(key), outcome = action?.effect ?? action?.roll?.success;
    if (outcome?.track && !tracks.includes(outcome.track) && !(license && outcome.flag === 'licensed')) return R.reject;
    if (p.actions?.includes(parts[1]) || (outcome?.flag === 'licensed' && !s.flags.includes('licensed') && (tracks.includes('pilot') || p.map === 'D'))) return R.priority;
    if (key === 'act:creator_video') return R.priority;
    const event = key.startsWith('ev:') ? currentEvent(s)?.choices[Number(parts[1])] : undefined;
    if (event && (event.effect as LifeEffect | undefined)?.extra?.promote) return R.priority;
    return R.defaultScore + utility(p, s, o, needed)
      + (key.startsWith('act:work_') && s.job.perf < R.repair ? R.good : 0);
  };
  let best = usable[0], score = choice(best);
  for (const option of usable.slice(1)) { const next = choice(option); if (next > score) { best = option; score = next; } }
  return best;
}
/** Optional phone action once per season; leave board popups in control of their own continuation. */
export function phoneWanted(id: PolicyId, s: GameState, c: BotContext): boolean {
  return !c.phoneUsed && s.phase === 'action' && s.board.step === 'spin' &&
    ((POLICIES[id] as Policy).random || s.s.debt > 0 || s.s.drone > 0 || ('invest' in POLICIES[id])
      || targetTracks(id, s).some(t => ['pilot','creator','inspector','film','solo','company','racer'].includes(t)));
}
export function worthwhilePhone(id: PolicyId, s: GameState, o: OptionView, c: BotContext): boolean {
  // A free exit participates in scoring so a phone menu never forces a needless purchase.
  const exit = { ...o, id: 'end', cost: 0, tire: 0, sure: { text: '', add: {} }, roll: undefined };
  return pickBot(id, s, [o, exit], c).id !== 'end';
}
