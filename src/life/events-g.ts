// §9.2 G. Event travel is a relocation, not a lap: no fare, pass reward or landing action.
import { cardReward } from './cards.ts';
import { careerAge, careerTrack, jobConditionLocks } from './career2.ts';
import { jobChoices, openJobOffers } from './jobs.ts';
import { answer } from './events-a.ts';
import type { LifeEvent } from './events-a.ts';
import { eventAnswer, EVENT2_KEYS as K } from './events-e.ts';
import type { EventExtra2 } from './events-e.ts';
import { BOARD_CHOICES, LIFE_RULES } from './life-data.ts';
import { JOB_RULES, SPECIAL_RULES, TRACKS } from './tracks.ts';
import type { GameState, Stat, StatMap } from './types.ts';

export const TRAVEL_RULES = {
  inviteGrades: { theory: 150, skill: 150, xp: 420, rep: 105, teach: 150, biz: 150, net: 150, support: 60 } as StatMap,
  main: { engineer: 'theory', inspector: 'skill', film: 'skill', atc: 'theory', racer: 'skill' } as Record<string, Stat>,
  summer: 1, allJobs: 1, specialists: 2,
} as const;
const specialist = (s: GameState) => careerTrack(s)?.tier === JOB_RULES.specialistTier;
export const EVENTS_G: LifeEvent[] = [
  { id: 'invite_d', title: '특구 초청장', text: '그동안 쌓은 실력을 보고 특구에서 초청장을 보냈다.', place: 'gate', when: {}, weight: 4,
    eligible: s => s.board.pos[0] !== SPECIAL_RULES.map && Object.entries(TRAVEL_RULES.inviteGrades).some(([stat, n]) => s.s[stat as Stat] >= n!),
    choices: [eventAnswer('지금 간다', {}, 0, { move: 'D-o0' }), { title: '챙겨 둔다', desc: '특구 초청장을 챙겨 둔다.',
      effect: { text: '다음 방문에 쓸 초청장을 보관했다.', flag: SPECIAL_RULES.invite } }] },
  { id: 'field_call', title: '현장 파견', text: '산업 벨트 현장에서 일손을 보태 달라는 연락이 왔다.', place: 'field_office', when: { track: ['pilot', 'employee', 'inspector'] }, weight: 4,
    eligible: s => s.board.pos[0] !== 'C', choices: [eventAnswer('간다', { money: 250 }, 0, { move: 'C-o0' }), answer('사양')] },
  { id: 'abroad', title: '해외 연수', text: '두 계절 동안 해외 현장에서 배우는 연수 기회가 생겼다.', place: 'airport', when: {}, weight: 2, once: true,
    eligible: s => !!careerTrack(s)?.salaried && s.job.perf >= 70,
    choices: [eventAnswer('떠난다', { theory: 40, xp: 60, net: 20 }, 0, { skipSeasons: 2 }), answer('동료에게 양보', { net: 10, rep: 4 })] },
  { id: 'expo_e', title: '신도시 투자 박람회', text: '신도시에서 투자 경험을 나누는 박람회가 열린다.', place: 'invest_hall', when: { min: { biz: 60 } }, weight: 3,
    eligible: s => s.board.pos[0] !== 'E', choices: [eventAnswer('참석', { net: 10 }, 0, { move: 'E-o0' }), answer('자료만 받는다', { biz: 5 })] },
  { id: 'holiday', title: '휴가철', text: '여름 휴가철이 되어 여행객과 일감이 함께 늘었다.', place: 'resort', when: {}, weight: 4,
    eligible: s => s.turn % LIFE_RULES.seasons.length === TRAVEL_RULES.summer,
    choices: [eventAnswer('휴양지로', { stamina: 20 }, 100, { move: 'F-o0' }), answer('성수기 일감', { money: 200, stamina: -15 }), answer('집에서', { stamina: 10 })] },
  { id: 'hometown', title: '고향의 부름', text: '고향에서 안부를 묻는 전화가 와 마을 풍경이 떠오른다.', place: 'village_hall', when: {}, weight: 3,
    eligible: s => careerAge(s) >= 30 && s.board.pos[0] !== 'A', choices: [eventAnswer('내려간다', { happy: 8 }, 0, { move: 'A-o0' }),
      answer('용돈 송금', { happy: 4 }, 100), answer('전화만', { happy: 1 })] },
  { id: 'fast_track', title: '패스트트랙 선발', text: '특구의 전문 인력을 위한 집중 과정에 선발됐다.', place: 'grad_school', when: {}, weight: 4,
    eligible: s => s.board.pos[0] === SPECIAL_RULES.map && specialist(s),
    choices: [s => cardReward(eventAnswer('집중 과정', { [TRAVEL_RULES.main[s.track!] ?? 'theory']: 30, stamina: -30 }, 600, { tenure: 4 }), 'team_letter'), answer('평소대로', {}, 0, { perf: 4 })] },
  { id: 'd_scout', title: '특구 스카우트', text: '특구의 채용 담당자가 전문직 자리를 소개하겠다고 한다.', place: 'startup_hub', when: {}, weight: 4,
    eligible: s => s.board.pos[0] === SPECIAL_RULES.map && !specialist(s)
      && TRACKS.some(track => track.tier === JOB_RULES.specialistTier && !jobConditionLocks(s, track.entry).length),
    choices: [eventAnswer('만난다', {}, 0, { jobPopup: 2 }), answer('거절', { rep: 3 })] },
];
export function travelEventEffect(prev: GameState, extra: EventExtra2): GameState {
  let state = structuredClone(prev);
  if (extra.tenure) state.job.tenure += extra.tenure;
  if (extra.move?.[0] === SPECIAL_RULES.map) state.flags = state.flags.filter(flag => flag !== SPECIAL_RULES.invite);
  if (extra.jobPopup) { state = openJobOffers(state); state.timers[K.jobs] = extra.jobPopup; }
  return state;
}
export function eventJobChoices(state: GameState) {
  const menu = jobChoices(state);
  if (state.timers[K.jobs] === undefined) return menu;
  return { ...menu, choices: menu.choices.filter(row => state.timers[K.jobs] !== TRAVEL_RULES.specialists
    || row.id === 'job:none' || TRACKS.some(track => track.tier === JOB_RULES.specialistTier && row.id === `job:${track.id}`))
    .map(row => row.id === 'job:none' ? { ...row, choice: BOARD_CHOICES.skip } : row) };
}
