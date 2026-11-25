import { STAT_LABEL } from '../../life/life-data.ts';
import { derived } from '../../life/engine.ts';
import { grade } from '../../game/career.ts';
import { TRACKS } from '../../life/tracks.ts';
import type { GameState } from '../../life/types.ts';
import { MAPS } from '../../life/world.ts';
import { ABILITY_STATS, COPY, LIFE_COPY as L, LIFE_TABS } from './data.ts';
import type { LifeTab } from './data.ts';

/** Optional read-only lifeSummary output. No valuation, pay or ending rules live in the UI. */
export type LifeSummaryView = {
  netWorth?: number; career?: string; family?: readonly string[]; home?: readonly string[];
  assets?: readonly string[]; feats?: readonly string[]; nextPeriod?: string;
};
export type LifeTabModel = { id: LifeTab; title: string; lines: string[] };

export function lifeTabs(state: GameState, summary: LifeSummaryView = {}): LifeTabModel[] {
  const track = TRACKS.find(row => row.id === state.track);
  const career = summary.career ?? [L.status[state.status], track?.name,
    track?.ranks[state.job.rank]?.title].filter(Boolean).join(' · ');
  const family = summary.family ?? [state.family.marriedAt !== null ? L.married
    : state.family.partnerAt !== null ? L.partner : L.noPartner,
    ...(state.family.marriedAt !== null ? [state.family.dual ? L.dual : L.singleIncome] : []),
    ...(state.family.kids.length ? state.family.kids.map((kid, index) => L.kid(index, kid.born, kid.pts, kid.stage)) : [L.noKids])];
  const home = summary.home ?? [state.home ? L.home(MAPS[state.home.map].name, state.home.tier, state.home.deposit) : L.noHome];
  const owned = summary.assets ?? [
    ...state.estates.map(estate => L.estate(MAPS[estate.map].name, estate.tier, estate.paid)),
    ...state.holdings.map(shop => L.shop(shop.id, shop.level, shop.paid)),
  ];
  const feats = summary.feats ?? state.feats;
  const content: Record<LifeTab, string[]> = {
    ability: [L.field('체력', `${state.s.stamina}/${derived(state).capStamina}`), L.field(STAT_LABEL.happy, state.s.happy),
      ...ABILITY_STATS.map(stat => L.grade(STAT_LABEL[stat], grade(stat, state.s[stat])!.letter, state.s[stat])),
      L.field(STAT_LABEL.fans, state.s.fans)],
    career: [career, COPY.review(state.job.perf, state.job.tenure, state.job.warn),
      ...state.job.tracks.map(id => TRACKS.find(row => row.id === id)?.name ?? id)],
    family: [...family, ...home],
    assets: [L.money('순자산', summary.netWorth ?? derived(state).netWorth),
      L.money('현금', state.s.money), L.money('빚', state.s.debt), L.money(L.funds[state.fund.kind], state.fund.amount),
      L.field('생활 수준', L.levels[state.life]), ...(owned.length ? owned : [L.noAssets]),
      ...Object.entries(state.board.ledger).map(([label, amount]) => L.money(label, amount))],
    records: [feats.length ? L.feats(feats) : L.noFeats,
      ...(state.log.length ? [...state.log].reverse().map(row => L.record(row.turn, row.text)) : [L.noRecords])],
  };
  return (Object.keys(LIFE_TABS) as LifeTab[]).map(id => ({ id, title: LIFE_TABS[id], lines: content[id] }));
}

export function chapterLines(state: GameState, summary: LifeSummaryView = {}): string[] {
  const tabs = lifeTabs(state, summary), feats = summary.feats ?? state.feats;
  return [L.money('순자산', summary.netWorth ?? derived(state).netWorth),
    tabs[1].lines[0], ...tabs[2].lines, L.field(STAT_LABEL.happy, state.s.happy),
    feats.length ? L.feats(feats) : L.noFeats, ...(summary.nextPeriod ? [L.next(summary.nextPeriod)] : [])];
}
