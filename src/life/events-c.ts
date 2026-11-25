// §9.2 C. Salary references mean the current rank's base seasonal salary (§9.1).
import { careerAge, careerSalary, careerTrack } from './career2.ts';
import { demote, openJobOffers, performance, quit, special } from './jobs.ts';
import { LIFE_RULES, MAP_IDS } from './life-data.ts';
import { answer, effect, EVENT_KEYS as K, EVENT_RULES as R, EVENT_TEXT as T, gamble } from './events-a.ts';
import type { EventExtra, LifeEvent } from './events-a.ts';
import type { GameState } from './types.ts';

const salaried = (s: GameState) => !!careerTrack(s)?.salaried;
const notPublic = (s: GameState) => salaried(s) && s.track !== 'public';
const promotable = (s: GameState) => salaried(s) && !!careerTrack(s)?.ranks[s.job.rank + 1];
export const EVENTS_C: LifeEvent[] = [
  { id: 'special_promo', title: '특별 승진', text: '최근 성과를 인정받아 특별 승진 제안이 왔다.', place: 'office', when: {}, weight: 3,
    eligible: s => promotable(s) && s.job.perf >= 80, choices: [answer('받는다', {}, 0, { promote: 1, perfSet: 60 }), answer('정식 심사를 기다린다', { rep: 3 }, 0, { perf: 10 })] },
  { id: 'parachute', title: '낙하산 제안', text: '아는 사람이 빈 자리를 소개하며 승진을 약속한다.', place: 'office', when: { min: { net: 150 } }, weight: 2,
    eligible: promotable, choices: [answer('수락', { rep: -10 }, 0, { promote: 1, perfSet: 40 }), answer('거절', { rep: 6 })] },
  { id: 'team_fault', title: '팀 사고 책임', text: '팀의 실수에 대해 책임 소재를 정해야 한다.', place: 'office', when: {}, weight: 3,
    eligible: s => salaried(s) && s.job.rank >= 1, choices: [answer('책임진다', { rep: 8 }, 0, { perf: -20 }),
      gamble('해명한다', 50, effect(), effect({}, { demote: 1 })), answer('법률 자문', {}, 200, { perf: -5 })] },
  { id: 'posting', title: '지방 발령', text: '산업 벨트의 새 현장에서 함께 일하자는 발령이 났다.', place: 'office', when: {}, weight: 3,
    eligible: s => salaried(s) && ['B', 'E'].includes(s.board.pos[0]), choices: [answer('간다', { money: 200 }, 0, { move: 'C-o0', perf: 10 }), answer('거부', {}, 0, { perf: -15 })] },
  { id: 'hq_call', title: '본사 호출', text: '본사에서 직접 만나 업무를 논의하자는 연락이 왔다.', place: 'hq', when: {}, weight: 3,
    eligible: s => salaried(s) && ['A', 'C', 'F'].includes(s.board.pos[0]), choices: [answer('올라간다', {}, 0, { move: 'B-o0', perf: 8 }), answer('원격으로 한다', {}, 0, { perf: -5 })] },
  { id: 'headhunter', title: '헤드헌터', text: '경력을 눈여겨본 채용 담당자가 연락해 왔다.', place: 'jobfair', when: { min: { xp: 420 } }, weight: 4,
    eligible: s => s.status === 'working' && s.job.rank >= 2, choices: [answer('만난다', {}, 0, { popup: 'headhunter' }),
      s => answer('회사에 알린다', { money: careerSalary(s) }, 0, { perf: 5 }), answer('무시')] },
  { id: 'layoff', title: '구조조정', text: '회사가 조직을 줄이면서 희망퇴직 신청을 받는다.', place: 'office', when: {}, weight: 2,
    eligible: s => notPublic(s) && careerAge(s) >= 35, choices: [s => answer('희망퇴직', { money: careerSalary(s) * 8 }, 0, { quit: 'jobless' }),
      s => gamble('버틴다', s.job.perf, effect(), effect({ money: careerSalary(s) * 2 }, { quit: 'jobless' }))] },
  { id: 'overtime_rush', title: '야근 러시', text: '마감이 겹치며 사무실 불이 밤늦게까지 켜져 있다.', place: 'office', when: {}, weight: 5,
    eligible: salaried, choices: [s => answer('한다', { stamina: -25, money: Math.floor(careerSalary(s) * 30 / 100) }, 0, { perf: 12 }), answer('정시에 간다', { happy: 3 }, 0, { perf: -4 })] },
  { id: 'mentor', title: '사수의 조언', text: '선배가 시간을 내어 자신의 업무 요령을 알려 준다.', place: 'office', when: { status: ['working'] }, weight: 4,
    eligible: s => s.job.rank <= 1, choices: [answer('따라 배운다', { stamina: -10, xp: 20 }, 0, { perf: 5 }),
      gamble('내 방식', 50, effect({}, { perf: 12 }), effect({}, { perf: -8 }))] },
  { id: 'strike', title: '파업', text: '동료들이 근무 조건 개선을 요구하며 파업을 준비한다.', place: 'office', when: {}, weight: 2,
    eligible: notPublic, choices: [s => gamble('참여', 55, effect({ net: 10, money: careerSalary(s) * 2 }, { strike: 1 }), effect({ net: 10 }, { strike: 1 })),
      answer('출근', { net: -8 }, 0, { perf: 6 })] },
  { id: 'best_staff', title: '올해의 사원', text: '꾸준한 성과를 인정받아 올해의 사원으로 선정됐다.', place: 'office', when: { status: ['working'] }, weight: 3,
    eligible: s => s.job.perf >= 85, choices: [answer('상금', { money: 500, rep: 5 }), answer('팀 회식', { money: 200, net: 12 })] },
  { id: 'audit_note', title: '감사 지적', text: '업무 감사에서 보완할 점을 지적받았다.', place: 'office', when: { status: ['working'] }, weight: 4,
    eligible: s => s.job.perf < 40, choices: [answer('시말서', {}, 0, { perf: -5, warn: 1 }), answer('보완 교육', {}, 100, { perf: 8 })] },
  { id: 'sabbatical', title: '안식 휴가', text: '오래 근무한 사람에게 안식 휴가가 주어졌다.', place: 'office', when: { status: ['working'] }, weight: 2, once: true,
    eligible: s => s.job.total >= 40, choices: [s => ({ ...answer('쉰다', { happy: 15 }, 0, { salaryWait: 2 }),
      desc: `${T.fullStamina} ${effect({ happy: 15 }, { salaryWait: 2 }).text}`,
      effect: { ...effect({ happy: 15 }, { salaryWait: 2 }), set: { stamina: s.s.capStamina } } }), s => answer('반납한다', { money: careerSalary(s) })] },
  { id: 'early_retire', title: '명예퇴직 제안', text: '퇴직금을 더 받는 명예퇴직 신청 안내가 도착했다.', place: 'office', when: {}, weight: 3,
    eligible: s => salaried(s) && careerAge(s) >= 50, choices: [answer('수락', {}, 0, { popup: 'retire' }), answer('거절', {}, 0, { perf: 3 })] },
];

export function careerEventEffect(prev: GameState, extra: EventExtra): GameState {
  let state = structuredClone(prev);
  if (extra.promote) state = special(state);
  if (extra.demote) state = demote(state);
  if (extra.perf) state = performance(state, extra.perf);
  if (extra.perfSet !== undefined) state.job.perf = extra.perfSet;
  if (extra.warn) state.job.warn = 1;
  if (extra.move) {
    state.board.pos = extra.move;
    state.board.visited |= 1 << MAP_IDS.indexOf(extra.move[0] as typeof MAP_IDS[number]);
  }
  if (extra.quit) { state = quit(state); state.status = extra.quit; }
  if (extra.salaryWait) state.timers[K.salaryUntil] = state.turn + extra.salaryWait;
  if (extra.strike) state.timers[K.strikeAt] = state.turn;
  if (extra.popup === 'headhunter') {
    state.timers[K.headhunter] = Math.floor(careerSalary(state) * R.headhunterPct / LIFE_RULES.percent);
    state = openJobOffers(state, 'headhunter');
  }
  return state;
}
