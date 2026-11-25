// §9.2 H. A villa uses the existing owned-home limits; succession reuses economy's valuation.
import { RULES } from './data.ts';
import { careerAge } from './career2.ts';
import { ECONOMY_RULES } from './economy.ts';
import { quit } from './jobs.ts';
import { answer, effect, gamble } from './events-a.ts';
import type { LifeEvent } from './events-a.ts';
import { eventAnswer, eventEffect, eventNetWorth, EVENT2_KEYS as K } from './events-e.ts';
import type { EventExtra2 } from './events-e.ts';
import { HOME_RULES, HOME_TEXT, LIFE_RULES } from './life-data.ts';
import type { GameState } from './types.ts';

export const LATE_RULES = { salePct: 110, villaPrice: 12000 } as const;
export function organizationValue(s: GameState): number {
  const work = s.track === 'company' ? Math.floor(s.s.value / RULES.company.worthDiv)
    : s.track === 'academy' ? s.s.level * RULES.academy.worthPerLevel : 0;
  return work + s.holdings.reduce((sum, h) => sum + Math.floor(h.paid * ECONOMY_RULES.liquidationPct / LIFE_RULES.percent), 0);
}
export const successionValue = (s: GameState) => Math.floor(organizationValue(s) * (s.timers[K.succession] ?? 0) / LIFE_RULES.percent);
export const EVENTS_H: LifeEvent[] = [
  { id: 'second_act', title: '인생 2막', text: '쌓아 온 경험을 다른 사람들과 나누어 달라는 제안이 왔다.', place: 'culture_center', when: {}, weight: 4, life: true,
    eligible: s => careerAge(s) >= 55, choices: [answer('강단에 선다', { teach: 20, money: 300 }),
      { ...answer('자문 계약', { money: 800 }), need: { min: { net: 100 } } }, answer('쉰다', { happy: 5 })] },
  { id: 'memoir', title: '회고록', text: '지난 시간을 글로 남겨 보자는 출판 제안을 받았다.', place: 'library', when: { min: { rep: 105 } }, weight: 2, life: true,
    eligible: s => careerAge(s) >= 60, choices: [gamble('출간', 50, effect({ money: 2000, rep: 10 }), effect({ happy: 5 }), 500), answer('블로그에 쓴다', { happy: 4 })] },
  { id: 'foundation', title: '재단 설립 권유', text: '다음 세대를 돕는 재단을 함께 세워 보자는 권유를 받았다.', place: 'city_hall', when: {}, weight: 2, life: true, once: true,
    eligible: s => eventNetWorth(s) >= 40000, choices: [answer('재단', { happy: 60, rep: 50 }, 30000, { points: 3000 }),
      answer('장학금', { happy: 15 }, 3000, { points: 300 }), answer('아직')] },
  { id: 'villa', title: '별장 매물', text: '바닷가 휴양지에 조용히 지낼 수 있는 집이 매물로 나왔다.', place: 'country_homes', when: {}, weight: 2, life: true,
    eligible: s => eventNetWorth(s) >= 30000, choices: [eventAnswer('산다', {}, 12000, { villa: 1 }), answer('한 철 빌린다', { happy: 10 }, 400), answer('지나간다')] },
  { id: 'cruise', title: '크루즈', text: '바다를 천천히 돌아보는 크루즈 여행 안내가 도착했다.', place: 'marina', when: {}, weight: 2, life: true,
    eligible: s => careerAge(s) >= 60, choices: [answer('크루즈', { happy: 35 }, 1800), answer('온천 여행', { happy: 8, stamina: 15 }, 200), answer('집에서')] },
  { id: 'successor', title: '후계자', text: '함께 일하던 사람들이 조직의 다음 주인을 이야기한다.', place: 'office', when: {}, weight: 3, life: true,
    eligible: s => careerAge(s) >= 65 && (s.track === 'company' || s.track === 'academy' || s.holdings.length > 0),
    choices: [eventAnswer('승계 준비', {}, 1000, { succession: 10 }),
      s => gamble('매각 협상', 55, eventEffect({ money: Math.floor(organizationValue(s) * LATE_RULES.salePct / LIFE_RULES.percent) }, { sellOrganization: 1 }), effect()), answer('현역 유지')] },
];
export function villaLocks(s: GameState): string[] {
  const owned = (s.home?.tier ?? 0) >= HOME_RULES.ownedTier;
  if (s.estates.length + Number(owned) >= HOME_RULES.maxOwned) return [HOME_TEXT.maxOwned];
  return owned && s.estates.length >= LIFE_RULES.maxHomes ? [HOME_TEXT.maxEstates] : [];
}
export function lateEventEffect(prev: GameState, extra: EventExtra2): GameState {
  let state = structuredClone(prev);
  if (extra.villa) {
    const { map, tier } = HOME_RULES.country;
    if ((state.home?.tier ?? 0) >= HOME_RULES.ownedTier) state.estates.push({ map, tier, paid: LATE_RULES.villaPrice });
    else {
      state.s.money += state.home?.deposit ?? 0;
      state.home = { map, tier, deposit: 0 };
    }
  }
  if (extra.succession) state.timers[K.succession] = extra.succession;
  if (extra.sellOrganization) {
    state.holdings = [];
    if (state.track === 'company' || state.track === 'academy') {
      state.s.value = 0; state.s.level = 0; state.s.staff = 0; state.s.contracts = 0; state.s.students = 0;
      state = quit(state);
    }
    delete state.timers[K.succession];
  }
  return state;
}
