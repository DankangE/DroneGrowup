// §13.1. Goal-directed policies; decisions use only the current public state and offered odds.
import { ACTIONS } from './compat.ts';
import { currentEvent, met } from './engine.ts';
import type { OptionView } from './engine.ts';
import type { LifeEffect } from './events-a.ts';
import { FAMILY_RULES, HOMES, LEISURE, LIFE_RULES, MAP_IDS, SHOPS, SPACE_MENU } from './life-data.ts';
import { jobOffers } from './jobs.ts';
import { randInt } from './move.ts';
import { TRACKS, TRACK_TRAIN, TRACK_WORK, TRACK_PREP, JOB_RULES } from './tracks.ts';
import { ledgerSum, upkeepLines } from './economy.ts';
import { CAREER_KEYS, rankLocks } from './career2.ts';
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
  investor: { start: 'school', tracks: ['service','clerk','employee'], map: 'E', kinds: ['invest','estate','job','rankup'], stats: ['xp','biz','net'], home: 3, life: 1, invest: true },
  bon_vivant: { start: 'school', tracks: ['service','clerk'], map: 'F', kinds: ['life','rest','event','station'], stats: ['happy','net'], home: 4, life: 2, luxury: true },
  drifter: { start: 'school', tracks: [], map: 'B', kinds: ['station','jobfair','event','luck'], stats: ['xp','skill','theory'], home: 1, life: 1, wander: true },
  random: { start: 'self', tracks: [], map: 'A', kinds: [], stats: [], home: 0, life: 0, random: true },
} satisfies Record<string, Policy>;
export type PolicyId = keyof typeof POLICIES;
export const POLICY_IDS = Object.keys(POLICIES) as PolicyId[];
const R = { reserve: 200, rich: 8000, priority: 1200, good: 240, goalMap: 90, newMap: 25, kind: 18, workPerf: 80,
  need: 30, stat: 5, moneyDiv: 12, lowMoney: 800, stamina: 35, repair: 60, travel: 40, distance: 30,
  investPct: 50, cashReserve: 1200, happy: 12, tireDiv: 5, careerPlace: 600, training: 700, promotion: 1600, leisure: 850, tourStart: 120, tourLength: 16, maxPhone: 1, reject: -100000, defaultScore: 1, cashWeight: 3,
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
const placeDistances = new Map<string, Map<string, number>>();
function toPlace(place: string, kind?: SpaceKind): Map<string, number> {
  const key = `${place}:${kind ?? ''}`;
  const cached = placeDistances.get(key); if (cached) return cached;
  const distance = new Map(WORLD.filter(n => n.place === place && (!kind || n.kind === kind)).map(n => [n.id, 0]));
  for (let pass = 0; pass < WORLD.length; pass++) for (const node of WORLD) {
    const best = Math.min(...[...node.next, ...(node.cross?.map(c => c.to) ?? [])].map(id => distance.get(id) ?? WORLD.length)) + 1;
    if (best < (distance.get(node.id) ?? WORLD.length)) distance.set(node.id, best);
  }
  placeDistances.set(key, distance); return distance;
}
const actions = new Map([...ACTIONS, ...TRACK_TRAIN, ...TRACK_WORK, ...TRACK_PREP].map(a => [`act:${a.id}`, a]));
export type BotContext = { phoneUsed: boolean; tried: readonly string[]; noBank?: boolean; salaryIncome: number; invested: number };
export const bankChoice = (id: string) => /^(loan:|repay:)/.test(id) || id.endsWith(':mortgage');
export function targetTracks(id: PolicyId, state: GameState): TrackId[] {
  if (id === 'racer_creator') return state.turn < (45 - LIFE_RULES.startAge) * LIFE_RULES.seasons.length ? ['pilot', 'racer'] : ['creator'];
  // A roving career still needs a concrete qualification plan before changing jobs.
  if (id === 'drifter') return state.turn < 100 ? ['pilot', 'rescue'] : state.turn < 156 ? ['atc'] : ['delivery', 'creator'];
  return POLICIES[id].tracks;
}
function desiredMap(p: Policy, s: GameState, tracks: TrackId[]): MapId {
  if (s.status === 'student' && !s.flags.includes('degree')) return 'A';
  if (!s.flags.includes('licensed') && (tracks.includes('pilot') || tracks.includes('employee') || p.map === 'D' || p.wander)) return 'A';
  if (p.wander) return !s.flags.includes('licensed') || s.status === 'jobless' && s.s.theory < 180 ? 'A' : s.turn < 100 ? 'C' : s.turn < 156 && met(s, MAPS.D.gate) ? 'D' : MAP_IDS[Math.floor(s.turn / R.tourLength) % MAP_IDS.length];
  // Complete a sustained tour late in life instead of cancelling travel after four seasons.
  if (!p.focus && s.turn >= R.tourStart) {
    const tour: MapId[] = ['C', 'E', 'A', 'B', 'F', 'C'];
    return tour[Math.min(tour.length - 1, Math.floor((s.turn - R.tourStart) / R.tourLength))];
  }
  if (s.status === 'retired') return 'F';
  if (p.luxury && !s.job.tracks.includes('clerk')) return 'B';
  if (tracks.includes('employee') && s.track !== 'employee' && s.flags.includes('licensed')) return 'B';
  if (p.map === 'D' && !met(s, MAPS.D.gate)) return s.flags.includes('licensed') ? 'C' : 'A';
  if (p.map === 'D' && s.track === 'pilot' && !tracks.some(id => { const t = TRACKS.find(t => t.id === id)!; return t.tier === 3 && met(s, t.entry); })) return 'A';
  if (p.map === 'D' && !s.home && s.s.money > 8000) return 'C';
  if (s.track === 'pilot' && s.s.drone < 1 && tracks.includes('pilot') && (tracks.length === 1 || tracks.includes('company') || tracks.includes('inspector'))) return 'A';
  if (s.track === 'academy' && !s.flags.includes('accredited')) return 'B';
  if (tracks.includes('company') && !s.flags.includes('listed')) return s.track === 'solo' && s.s.contracts >= 4 && s.s.money < 6000 ? 'C' : 'B';
  return p.map;
}
function needs(condition: Cond | undefined, state: GameState): Stat[] {
  const direct = Object.entries(condition?.min ?? {}).filter(([key, min]) => state.s[key as Stat] < min).map(([key]) => key as Stat);
  const alternatives = condition?.any?.filter(c => !met(state, c)).map(c => needs(c, state));
  return direct.concat(condition?.any?.some(c => met(state, c)) ? [] : alternatives?.sort((a,b) => a.length-b.length)[0] ?? []);
}
/** Price risk against cash already committed in the ledger and several seasons of expenses. */
function reserve(s: GameState): number {
  const deficit = Math.max(0, -upkeepLines(s).reduce((sum, row) => sum + row.amount, 0));
  return R.reserve + Math.max(0, -ledgerSum(s)) + deficit * JOB_RULES.wait;
}
/** Integer expected gains, capped at useful stat targets; no hidden RNG or future states. */
function utility(p: Policy, s: GameState, o: OptionView, needed: Stat[]): number {
  const weight = (stat: Stat) => stat === 'money' ? (s.s.money < R.lowMoney ? R.cashWeight : 1)
    : stat === 'stamina' ? (s.s.stamina < R.stamina ? R.stat : 0)
    : stat === 'happy' ? (p.shops ? 1 : s.s.happy < (p.kids ? 950 : 700) ? R.happy : 1)
    : needed.includes(stat) ? R.need : p.stats.includes(stat) ? R.stat : 2;
  const value = (add: OptionView['sure']) => Object.entries(add?.add ?? {}).reduce((sum, [stat, n]) =>
    sum + n * weight(stat as Stat) / (stat === 'money' ? R.moneyDiv : 1), 0);
  return Math.floor((o.roll ? (value(o.roll.success) * o.roll.chance + value(o.roll.fail) * (LIFE_RULES.percent - o.roll.chance))
    / LIFE_RULES.percent : value(o.sure)) - o.cost / R.moneyDiv - o.tire / R.tireDiv);
}
export function pickBot(id: PolicyId, s: GameState, offered: readonly OptionView[], context: BotContext): OptionView {
  const p: Policy = POLICIES[id], tracks = targetTracks(id, s);
  const usable = offered.filter(o => o.enabled && !(context.noBank && bankChoice(o.id))
    && !(context.tried.includes(o.id) && (o.free || o.id.startsWith('job:')) && !['job:none','skip','end'].includes(o.id)));
  if (!usable.length) throw new Error(R.text.noOption);
  if (p.random) {
    // Random decisions share a solvency guard; neither experiment may borrow to fund a roll.
    let safe = usable.filter(o => !bankChoice(o.id) && o.id !== 'quit' && !o.id.endsWith('_quit')
      && (!o.id.startsWith('lifestyle:') || Number(o.id.split(':')[1]) <= (s.s.money > R.rich ? 2 : 0))
      && (!o.cost || o.cost <= s.s.money - reserve(s)));
    const jobs = safe.filter(o => o.id.startsWith('job:') && o.id !== 'job:none'
      && TRACKS.some(t => `job:${t.id}` === o.id && t.salaried));
    if (s.status !== 'working' && jobs.length) safe = jobs;
    const earnings = safe.filter(o => ['act:st_parttime','act:st_assist','act:pi_repair_gig'].includes(o.id));
    if (s.s.money < R.lowMoney && earnings.length) safe = earnings;
    if (s.turn >= R.tourStart && safe.some(o => o.id.startsWith('go:'))) {
      const map = desiredMap(p, s, []), distance = distances.get(map)!;
      const best = Math.min(...safe.filter(o => o.id.startsWith('go:')).map(o => distance.get(o.id.slice(3)) ?? WORLD.length));
      safe = safe.filter(o => o.id.startsWith('go:') && (distance.get(o.id.slice(3)) ?? WORLD.length) === best);
    }
    return (safe.length ? safe : usable)[randInt({ ...s }, safe.length || usable.length)];
  }
  const target = TRACKS.find(t => t.id === (tracks.find(t => !s.job.tracks.includes(t)) ?? tracks.at(-1)));
  const current = TRACKS.find(t => t.id === s.track);
  const license = !s.flags.includes('licensed') && (tracks.includes('pilot') || tracks.includes('employee') || p.map === 'D' || p.wander);
  const exam = actions.get('act:st_exam')!;
  const currentGoal = tracks.indexOf(s.track!);
  const nextActions = (p.actions ?? []).map(id => actions.get(`act:${id}`)!).filter(a => a && met(s, a.when));
  const needed = [...needs(target?.entry, s), ...(target?.id === s.track ? needs(current?.ranks[s.job.rank + 1]?.need, s) : []),
    ...needs(current?.ranks[s.job.rank]?.need, s), ...nextActions.flatMap(a => needs(a.need, s))];
  if (license) { needed.length = 0; needed.push(...needs(exam.need, s)); }
  if (s.status === 'student' && !license && !needed.length) needed.push('theory');
  // Prepare the whole ladder, while retaining extra urgency for the next promotion.
  const future = current?.ranks.at(-1)?.need;
  const growth: Policy = { ...p, stats: [...new Set([...p.stats, ...needs(future, s)])] };
  if (!license && (!target || target.id === s.track)) needed.push(...needs(future, s));
  const cashReserve = reserve(s) + (['academy','company'].includes(s.track!) ? 1000 : 0), spendable = s.s.money - cashReserve;
  const poor = (s.status === 'working' && !current?.salaried && spendable < R.reserve) || spendable < 0 || (license && met(s, exam.need) && spendable < (exam.cost ?? 0));
  const map = desiredMap(p, s, tracks);
  const ready = [...nextActions, ...(license && (id !== 'engineer' || s.flags.includes('degree')) ? [exam] : [])]
    .filter(a => (met(s, a.when) || s.status === 'jobless' && a.when.status?.includes('student')) && met(s, a.need) && spendable >= (a.cost ?? 0) + (['corp_found','academy_found'].includes(a.id) ? 3000 : a.id === 'solo_register' ? 500 : 0)
      && !(a.effect?.end && s.feats.includes(a.effect.end)) && !(a.roll?.success.end && s.feats.includes(a.roll.success.end)));
  const hiringNode = WORLD.find(n => n.map === map && n.kind === 'jobfair')!;
  const hireable = license && s.status !== 'student' ? [] : jobOffers({ ...s, board: { ...s.board, pos: hiringNode.id, step: 'space' } })
    .filter(o => !o.guidance && !o.locked.length && tracks.indexOf(o.track.id) > currentGoal).map(o => o.track);
  const careerActions = [...actions.values()].filter(a => (met(s, a.when) || s.status === 'jobless' && a.when.status?.includes('student')) && met(s, a.need));
  const trainUseful = careerActions.some(a => SPACE_MENU.train?.includes(a.id) && Object.keys(a.effect?.add ?? a.roll?.success.add ?? {}).some(stat => needed.includes(stat as Stat)));
  const nextRank = current?.ranks[s.job.rank + 1];
  const promotable = s.status === 'working' && nextRank && !rankLocks(s, current!, s.job.rank + 1).length
    && s.job.tenure >= nextRank.tenure && (s.timers[CAREER_KEYS.retry] ?? 0) <= s.turn;
  const homeBudget = (HOMES[p.home]?.price ?? 0) * MAPS[map].homePct * s.s.homeIndex / 10000;
  const wantsHome = p.home >= 3 && (s.home?.tier ?? 0) < p.home && spendable >= homeBudget;
  const wantsLeisure = s.status !== 'student' && !p.shops && spendable > (p.kids && (s.home?.tier ?? 0) < p.home ? homeBudget + R.lowMoney : R.lowMoney) && s.s.happy < (p.kids ? 950 : 700);
  const companyAction = s.track === 'company' && s.flags.includes('listed') || s.track === 'academy' && s.flags.includes('accredited') ? 'ac_teach' : s.track === 'solo' && s.s.contracts < 5 ? 'solo_sales'
    : s.track === 'company' ? s.s.contracts < Math.max(4, s.s.staff * 2) ? 'co_sales'
      : s.s.staff < 6 ? 'co_hire' : s.s.round < 2 && s.s.value >= 5000 ? 'co_ir' : s.s.value < 32000 ? 'co_sales' : 'co_ipo'
    : s.track === 'academy' ? s.s.students < (s.s.level === 1 ? 16 : 30) ? 'ac_ad'
      : s.s.staff < 3 ? 'ac_hire' : s.s.level === 1 ? 'ac_expand' : s.s.level === 2 ? 'ac_expand2' : 'ac_accredit' : '';
  const hirePlace = hireable.some(t => t.maps === 'any' || t.maps.includes(map))
    ? WORLD.find(n => n.map === map && n.kind === 'jobfair')?.place : undefined;
  const mission = hirePlace ?? (license && s.status !== 'working' && met(s, exam.need) && spendable >= (exam.cost ?? 0) ? exam.place
    : companyAction ? actions.get(`act:${companyAction}`)?.place
    : ready[0]?.place
    ?? (p.kids && s.status === 'working' && s.family.partnerAt === null ? 'culture'
      : p.kids && s.family.partnerAt !== null && s.family.marriedAt === null && (s.home?.tier ?? 0) >= 2 ? 'wedding'
      : p.kids && s.family.marriedAt !== null && s.family.kids.length < p.kids && (s.home?.tier ?? 0) >= p.home
        && s.turn < (FAMILY_RULES.babyMaxAge - LIFE_RULES.startAge) * 4 ? 'hospital' : undefined));
  const choice = (o: OptionView): number => {
    const key = o.id, parts = key.split(':');
    if (key.startsWith('go:') || key.startsWith('express:')) {
      const node = nodes.get(parts[1])!, priority = p.kinds.indexOf(node.kind);
      if (key.startsWith('express:') && (node.map !== map || node.map === s.board.pos[0] || o.cost > spendable)) return R.reject;
      if (s.board.pos[0] !== map) return R.priority * 10 - (distances.get(map)!.get(node.id) ?? WORLD.length) * R.priority
        + (node.map === map ? R.priority : 0);
      if (mission && WORLD.some(n => n.map === map && n.place === mission)) {
        return R.priority * 10 - (toPlace(mission, mission === hirePlace ? 'jobfair' : undefined).get(node.id) ?? WORLD.length) * R.priority;
      }
      if (node.map !== map) return R.reject / 2;
      const careerBonus = careerActions.some(a => a.place === node.place &&
        Object.entries(a.effect?.add ?? a.roll?.success.add ?? {}).some(([stat,n]) => n > 0 && needed.includes(stat as Stat)));
      const route = s.board.pos[0] !== map ? R.priority - (distances.get(map)!.get(node.id) ?? WORLD.length) * R.distance : 0;
      return route + (node.map === map ? R.goalMap : 0)
        + (!(s.board.visited & (1 << MAP_IDS.indexOf(node.map))) ? R.newMap : 0)
        + (priority < 0 ? 0 : (p.kinds.length - priority) * R.kind)
        + (careerBonus ? R.careerPlace : 0)
        + (node.kind === 'jobfair' && (hireable.some(t => t.maps === 'any' || t.maps.includes(node.map))
          || (!s.track && (!license || s.status !== 'student') && (s.status !== 'student' || s.flags.includes('degree')))) ? R.promotion : 0)
        + (ready.some(a => a.place === node.place || SPACE_MENU[node.kind]?.includes(a.id)) ? R.priority : 0)
        + (companyAction && actions.get(`act:${companyAction}`)?.place === node.place ? R.promotion * 2 : 0)
        + (node.kind === 'job' && (poor || needed.includes('flights') || s.track === 'creator'
          || (current?.salaried && s.job.perf < R.workPerf)) ? R.training : 0)
        + (node.kind === 'train' && !poor && trainUseful ? R.training : 0)
        + (p.kids && s.status === 'working' && s.family.partnerAt === null && FAMILY_RULES.datePlaces.includes(node.place) ? R.priority : 0)
        + (node.kind === 'estate' && (wantsHome || (p.kids && !s.home && spendable > HOMES[2].price)) ? R.priority : 0)
        + (p.kids && node.place === FAMILY_RULES.babyPlace && s.family.marriedAt !== null && s.family.kids.length < p.kids
          && (s.home?.tier ?? 0) >= p.home && s.turn <= (FAMILY_RULES.babyMaxAge - LIFE_RULES.startAge) * 4 ? R.priority : 0)
        + (p.kids && FAMILY_RULES.weddingPlaces.includes(node.place) && (s.home?.tier ?? 0) >= 2
          && s.family.partnerAt !== null && s.family.marriedAt === null ? R.priority : 0)
        + (license && s.status === 'working' && s.s.money >= 1800 && ['rankup','jobfair'].includes(node.kind) ? R.promotion * 3 : 0)
        + (node.kind === 'rankup' && promotable && (current?.maps === 'any' || current?.maps.includes(node.map)) ? R.promotion : 0)
        + (id === 'engineer' && node.place === 'grad_school' && !s.flags.includes('master')
          && s.timers.economy_graduate_until === undefined && spendable > 1000 ? R.priority : 0)
        + (s.track === 'racer' && node.kind === 'contest' ? R.promotion : 0)
        + (s.track === 'creator' && node.kind === 'job' ? R.priority : 0)
        + (wantsLeisure && node.kind === 'life' && LEISURE.some(l => (l.places as readonly string[]).includes(node.place)) ? R.leisure : 0)
        + (node.kind === 'biz' && (p.shops || spendable > R.rich) && SHOPS.some(shop => shop.map === node.map
          && shop.place === node.place && shop.price <= spendable && !s.holdings.some(h => h.id === shop.id)) ? R.priority : 0);
    }
    if (key.startsWith('start:')) return parts[1] === p.start ? R.priority : R.reject;
    if (key === 'quit' && p.wander && s.turn >= 100 && s.turn < 156 && s.track === 'rescue') return R.promotion * 2;
    if (key === 'quit' && license && s.status === 'working' && s.s.money >= 1800) return R.promotion * 2;
    if (key === 'quit' || key.endsWith('_quit') || /^(sell:|biz:sell:|home:sell:|fund:out:|event:retire:)/.test(key)) return R.reject;
    if (key.startsWith('job:') && key !== 'job:none') {
      if (s.status === 'student' && !s.flags.includes('degree')) return R.reject;
      const pos = tracks.indexOf(parts[1] as TrackId);
      if (license && s.status === 'student' && parts[1] === 'mechanic') return R.promotion * 2;
      return !(license && s.status === 'jobless') && pos >= 0 && pos >= currentGoal ? R.promotion + pos
        : !s.track && s.status === 'student' && (s.status !== 'student' || s.flags.includes('degree')) ? R.priority : R.reject;
    }
    if (key === 'promo' || key === 'luck:promote') return R.promotion;
    if (key.startsWith('retire:')) return key === 'retire:pension' ? R.priority : R.reject;
    if (key === 'graduate:enroll') return id === 'engineer' && spendable > 1000 ? R.priority : R.reject;
    if (key.startsWith('lifestyle:')) return Number(parts[1]) === (s.status === 'student' || spendable < R.lowMoney || s.status === 'working' && !current?.salaried && s.s.contracts < 4 && s.s.fans < 200 && s.track !== 'director' ? 0 : p.luxury && spendable > R.rich ? 3 : p.life)
      && Number(parts[1]) !== s.life ? R.good : R.reject;
    if (s.track === 'academy' && key === 'act:ac_ad' && s.s.money >= o.cost + 200 && s.s.students < 32) return R.promotion;
    if (key === 'date') return p.kids && o.cost <= spendable ? R.priority : R.reject;
    if (key.startsWith('wed:')) return p.kids && o.cost <= spendable ? R.priority - o.cost : R.reject;
    if (key === 'dual:1') return !s.family.dual ? R.priority : R.reject;
    if (key === 'dual:0') return R.reject;
    if (key.startsWith('edu:') || key.startsWith('gift:')) return o.cost <= spendable ? R.good + Number(parts[1]) : R.reject;
    if (key === 'baby') return s.family.kids.length < (p.kids ?? 0) ? R.priority : R.reject;
    if (key.startsWith('home:')) {
      const tier = Number(parts[2]), owned = (s.home?.tier ?? 0) >= p.home;
      if (parts[1] === 'buy' && !p.invest && s.estates.some(e => e.tier === tier)) return R.reject;
      if (key.endsWith(':mortgage') || o.cost > spendable) return R.reject;
      if (parts[1] === 'move') return tier === p.home && s.home?.tier !== tier ? R.priority : R.reject;
      return (tier === p.home && (!owned || p.invest && s.estates.length < 3)) || (p.kids && !s.home && tier === 2) ? R.priority + tier : R.reject;
    }
    if (key.startsWith('biz:')) return (p.shops || spendable > R.rich) && o.cost <= spendable
      ? (parts[1] === 'check' ? R.good : R.priority) : R.reject;
    if (key.startsWith('fund:')) {
      if (parts[1] === 'out') return spendable < 0 ? R.priority + o.sure!.add!.money! : R.reject;
      if (parts[1] !== 'in' || license || s.track === 'company' || s.track === 'academy' || s.s.debt || (!p.invest && spendable < R.rich * 2)) return R.reject;
      const budget = Math.floor(context.salaryIncome * R.investPct / LIFE_RULES.percent) - context.invested;
      return o.cost <= (p.invest ? budget : spendable - (s.turn > 140 ? 32000 : R.rich)) && o.cost <= spendable - R.cashReserve ? R.good + o.cost : R.reject;
    }
    if (key.startsWith('leisure:')) return wantsLeisure && o.cost <= spendable ? R.leisure + utility(growth, s, o, needed) : R.reject;
    if (key.startsWith('buy:')) {
      if (s.status !== 'working' || license) return R.reject;
      if (parts[1] === 'car' && (s.s.car < 1 && spendable > 500 || s.s.car < 2 && spendable > 1800)) return R.promotion;
      if (parts[1] === 'drone' && s.s.drone === 0 && ['pilot','solo','company','creator','racer'].includes(s.track!) && ['pilot','solo_ceo','specialist_field','racer_creator'].includes(id)
        && s.s.money + Math.min(0, ledgerSum(s)) - o.cost >= 100) return R.promotion;
      if (s.s.drone === 0 && parts[1] !== 'car') return R.reject;
      const kind = parts[1] as keyof typeof R.equipment;
      const flying = id === 'pilot' || id === 'solo_ceo' || id === 'specialist_field';
      const baseline = flying ? R.equipment[kind] : kind === 'car' ? 1 : s.track === 'creator' ? 1 : 0;
      const goal = Math.max(baseline, ...[target?.entry, current?.ranks[s.job.rank + 1]?.need].map(c => c?.min?.[kind] ?? 0));
      return s.s[kind] < goal && tracks.some(t => !['clerk','service','public','mechanic','engineer'].includes(t))
        && o.cost <= spendable ? R.priority : R.reject;
    }
    if (key === 'repair') return s.s.cond < R.repair && o.cost <= spendable ? R.priority : R.reject;
    if (key.startsWith('repay:')) return o.cost <= spendable ? R.promotion + o.cost : R.reject;
    if (key.startsWith('loan:')) return R.reject;
    const loss = Math.min(0, o.sure?.add?.money ?? 0, o.roll?.success.add?.money ?? 0, o.roll?.fail.add?.money ?? 0);
    if (key.startsWith('ev:') && o.cost - loss > spendable && o.cost - loss > 0) return R.reject;
    if (o.cost > spendable && o.cost > 0 && !(['act:ac_ad','act:solo_sales'].includes(key) && s.s.money >= o.cost + 100)) return R.reject;
    if (poor && ['act:st_parttime','act:st_assist','act:pi_repair_gig','act:pi_assist'].includes(key)) return R.priority + utility(growth, s, o, needed);
    const action = actions.get(key), outcome = action?.effect ?? action?.roll?.success;
    if (outcome?.track && (tracks.indexOf(outcome.track) < currentGoal || !tracks.includes(outcome.track)) && !(license && outcome.flag === 'licensed')) return R.reject;
    if (outcome?.end && s.feats.includes(outcome.end)) return R.reject;
    if (key === `act:${companyAction}`) return R.promotion;
    if (s.track === 'academy' && key === 'act:ac_teach') return R.priority;
    if (s.track === 'company' && key === 'act:co_sales') return R.priority;
    if (['act:co_hire','act:ac_hire','act:co_rnd'].includes(key)) return R.reject;
    if (outcome?.flag === 'licensed' && license) return id === 'engineer' && !s.flags.includes('degree') ? R.reject : R.promotion * 2;
    if (key === 'act:solo_register' && spendable - o.cost < 500) return R.reject;
    if (['act:corp_found','act:academy_found'].includes(key) && spendable - o.cost < 3000) return R.reject;
    if (p.actions?.includes(parts[1])) return R.priority;
    if (key === 'act:creator_video') return R.promotion;
    const event = key.startsWith('ev:') ? currentEvent(s)?.choices[Number(parts[1])] : undefined;
    const effect = event?.effect as LifeEffect | undefined;
    if (effect?.extra?.quit || (effect?.extra as { sellOrganization?: number } | undefined)?.sellOrganization || effect?.extra?.popup === 'retire') return R.reject;
    if (effect?.extra?.promote) return R.priority;
    if (event && s.eventId === 'foundation') return o.cost <= spendable ? R.priority + o.cost : R.reject;
    if (effect?.extra?.baby && s.family.kids.length >= (p.kids ?? 0)) return R.reject;
    const performance = effect?.extra?.perf ?? 0;
    const eventBonus = (effect?.extra?.kidWedding ? R.good : 0) + (effect?.extra?.dog && !p.shops ? R.good : 0)
      + (effect?.extra?.popup === 'wedding' && p.kids ? R.priority : 0);
    return R.defaultScore + utility(growth, s, o, needed) + eventBonus
      + (action?.flight && (poor || needed.includes('flights')) ? R.training : 0)
      + performance * (s.job.perf < R.workPerf ? R.stat : 1)
      + (key.startsWith('act:work_') && current?.salaried && s.job.perf < R.repair ? R.training : 0);

  };
  let best = usable[0], score = choice(best);
  for (const option of usable.slice(1)) { const next = choice(option); if (next > score) { best = option; score = next; } }
  return best;
}
/** Optional phone action once per season; leave board popups in control of their own continuation. */
export function phoneWanted(id: PolicyId, s: GameState, c: BotContext): boolean {
  return s.flags.includes(JOB_RULES.started) && !c.phoneUsed && s.phase === 'action' && s.board.step === 'spin' &&
    ((POLICIES[id] as Policy).random || s.s.debt > 0 || s.s.drone > 0 || s.fund.amount > 0 || s.status === 'working' && s.s.car < 2 && s.s.money > 1000 || s.s.money > R.rich * 2 || ('invest' in POLICIES[id])
      || targetTracks(id, s).some(t => ['pilot','creator','inspector','film','solo','company','racer'].includes(t)));
}
export function worthwhilePhone(id: PolicyId, s: GameState, o: OptionView, c: BotContext): boolean {
  // A free exit participates in scoring so a phone menu never forces a needless purchase.
  const exit = { ...o, id: 'end', cost: 0, tire: 0, sure: { text: '', add: {} }, roll: undefined };
  return pickBot(id, s, [o, exit], c).id !== 'end';
}
