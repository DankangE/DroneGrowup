// §9.2 F. Durations include the current season's close and expire before the next action.
import { careerAge } from './career2.ts';
import { answer, effect, EVENT_RULES, gamble } from './events-a.ts';
import type { LifeEvent } from './events-a.ts';
import { eventAnswer, EVENT2_KEYS as K } from './events-e.ts';
import type { EventExtra2 } from './events-e.ts';
import { LIFE_RULES } from './life-data.ts';
import type { GameState } from './types.ts';

export const HEALTH_RULES = { lowStamina: 40, burnoutCloses: 2, wristPenalty: 10, careRecovery: -10, fitnessRecovery: 5 } as const;
export const EVENTS_F: LifeEvent[] = [
  { id: 'burnout', title: '번아웃', text: '두 계절째 지친 몸으로 하루를 마치니 일할 의욕도 줄었다.', place: 'hospital', when: {}, weight: 5, life: true,
    eligible: s => (s.timers[K.lowStamina] ?? 0) >= HEALTH_RULES.burnoutCloses,
    choices: [s => eventAnswer('휴직', { happy: 8 }, 0, { salaryWait: 2 }, { stamina: s.s.capStamina }),
      answer('버틴다', { stamina: -10 }, 0, { perf: -10 })] },
  { id: 'wrist', title: '손목 부상', text: '조종기를 오래 잡았더니 손목에 통증이 생겼다.', place: 'hospital', when: {}, weight: 3, life: true,
    eligible: s => s.status === 'working' && EVENT_RULES.flightTracks.some(track => track === s.track),
    choices: [answer('치료', {}, 200), eventAnswer('참고 난다', {}, 0, { wristWait: 4 })] },
  { id: 'illness', title: '큰 병', text: '검사 결과를 듣고 치료 방법을 정해야 할 때가 왔다.', place: 'hospital', when: {}, weight: 3, life: true,
    eligible: s => careerAge(s) >= 45, choices: [answer('수술', { stamina: -20 }, 1500),
      answer('약물 치료', { capStamina: -5 }, 400), answer('버틴다', { capStamina: -10, happy: -10 })] },
  { id: 'parents_care', title: '부모님 간병', text: '부모님이 당분간 곁에서 돌봐 줄 사람이 필요하다고 한다.', place: 'care_hospital', when: {}, weight: 2, life: true, once: true,
    eligible: s => careerAge(s) >= 45 && careerAge(s) <= 60,
    choices: [answer('요양 병원', { happy: 5 }, 1200), eventAnswer('직접 돌본다', { happy: 12 }, 0, { careWait: 4 })] },
  { id: 'car_accident', title: '접촉 사고', text: '교차로에서 가벼운 접촉 사고가 나 몸과 차를 살핀다.', place: 'hospital', when: { min: { car: 1 } }, weight: 2, life: true,
    choices: [answer('보험 처리', { stamina: -20 }, 100), answer('합의', { stamina: -10 }, 400), answer('입원', { stamina: -30 }, 0, { perf: -8 })] },
  { id: 'marathon', title: '마라톤 대회', text: '동네 마라톤 대회에서 참가자와 응원단을 모집한다.', place: 'park', when: {}, weight: 3, life: true,
    choices: [s => gamble('참가', s.s.stamina < 60 ? 40 : 70, effect({ happy: 8, rep: 3 }), effect({ stamina: -25 }), 30), answer('응원', { net: 3 })] },
  { id: 'fitness', title: '운동 권유', text: '몸을 꾸준히 움직여 보자며 운동 지도를 권유받았다.', place: 'park', when: {}, weight: 3, life: true,
    choices: [eventAnswer('개인 지도', {}, 250, { fitnessWait: 8 }), answer('산책', { stamina: 8 })] },
  { id: 'midlife', title: '중년의 위기', text: '익숙해진 일상을 돌아보며 새로운 길을 생각한다.', place: 'culture', when: {}, weight: 3, life: true, once: true,
    eligible: s => careerAge(s) >= 40 && careerAge(s) <= 50,
    choices: [eventAnswer('새 도전', { happy: 10 }, 0, { jobPopup: 1 }), eventAnswer('스포츠카', { happy: 15 }, 2000, {}, { car: 3 }),
      answer('묵묵히', { happy: -5 }, 0, { perf: 5 })] },
];
export function healthEventEffect(prev: GameState, extra: EventExtra2): GameState {
  const state = structuredClone(prev);
  for (const [duration, key] of [[extra.wristWait, K.wristUntil], [extra.careWait, K.careUntil], [extra.fitnessWait, K.fitnessUntil]] as const) {
    if (duration) state.timers[key] = state.turn + duration;
  }
  state.s.capStamina = Math.max(LIFE_RULES.minCapStamina, state.s.capStamina);
  state.s.stamina = Math.min(state.s.stamina, state.s.capStamina);
  return state;
}
/** Record closing stamina before any seasonal recovery. */
export function closeEventHealth(prev: GameState): GameState {
  const state = structuredClone(prev);
  state.timers[K.lowStamina] = state.s.stamina < HEALTH_RULES.lowStamina ? (state.timers[K.lowStamina] ?? 0) + 1 : 0;
  return state;
}
export const eventRecovery = (s: GameState) => (s.timers[K.careUntil] > s.turn ? HEALTH_RULES.careRecovery : 0)
  + (s.timers[K.fitnessUntil] > s.turn ? HEALTH_RULES.fitnessRecovery : 0);
export const eventFlightPenalty = (s: GameState) => s.timers[K.wristUntil] > s.turn ? HEALTH_RULES.wristPenalty : 0;
