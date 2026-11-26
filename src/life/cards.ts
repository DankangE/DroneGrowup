// UX5a: card data and detached transitions. Offers pause the existing board continuation;
// only their free skip is in options(). UX5b reads this query for use/drop controls.
import { ASSET_KEYS as A, ASSET_RULES, LUCK, STAT_MAX, TEXT } from './life-data.ts';
import { familyPopup } from './family.ts';
import { JOB_RULES } from './tracks.ts';
import type { Choice, Effect, GameState, StatMap } from './types.ts';

export type CardDef = { id: string; title: string; text: string; kind: 'luck' | 'tool' | 'connection';
  stackable: boolean; add?: StatMap; flag?: string; action?: 'again' | 'shortcut'; legacyFlag?: string };
export const CARD_RULES = { cap: 3, bonusCap: 30, maxOffers: 5 } as const;
export const CARD_KEYS = { usedAt: 'card_used_at', again: 'card_extra_move',
  offer: 'card_offer:', offerAt: 'card_offer_at:', migratedNet: 'card_migrated_benefactor' } as const;
export const CARD_TEXT = {
  phase: '굴리기 전이나 칸 행동 전에 쓸 수 있습니다.', popup: '열린 사건과 후속 선택을 먼저 마쳐 주세요.',
  used: '이번 계절에는 이미 카드를 썼습니다.', active: '같은 카드 효과가 아직 남아 있습니다.',
  spin: '룰렛을 돌리기 전에 써 주세요.', repair: '수리할 드론이 필요합니다.',
  full: '보관함이 가득 찼습니다. 가진 카드 한 장을 버리거나 새 카드를 포기할 수 있습니다.',
  duplicate: '같은 카드를 이미 보관 중입니다. 기존 카드를 버리거나 새 카드를 포기할 수 있습니다.',
  pending: '받을 카드를 먼저 정해 주세요.', skip: '포기', skipped: '새 카드를 포기했다.',
  stored: (title: string) => `${title} 카드를 보관했다. 굴리기 전이나 칸 행동 전에 사용할 수 있다.`,
  offered: (title: string) => `${title} 카드가 도착했다. 보관할 자리가 없어 포기하거나 가진 카드를 버릴 수 있다.`,
  drop: (title: string) => `${title} 카드 버리기`, dropped: (title: string) => `${title} 카드를 버렸다.`,
  reward: (title: string) => `${title} 카드 획득.`, again: '한 번 더 이동한다. 이번 칸의 행동은 건너뛴다.',
  migratedBenefactor: '인맥 보너스는 이미 받았다. 다음 승급 심사 성공률 +10%p.',
} as const;
const holdable = ['again', 'triple', 'transfer', 'shortcut', 'benefactor', 'discount', 'dream'];
export const CARDS: readonly CardDef[] = [
  ...LUCK.filter(row => holdable.includes(row.id)).map(row => ({ id: row.id, title: row.title, text: row.text,
    kind: 'luck' as const, stackable: false, add: row.add, flag: row.flag,
    action: row.action as CardDef['action'], ...(row.flag && { legacyFlag: `luck_${row.id}` }) })),
  { id: 'field_patch', kind: 'tool', title: '주머니 정비포', text: '드론을 닦고 조여 컨디션을 15 회복한다.',
    stackable: true, add: { cond: 15 } },
  { id: 'stick_drill', kind: 'tool', title: '손끝 연습표', text: '짧은 조종 연습으로 실력 +4.', stackable: false, add: { skill: 4 } },
  { id: 'route_notes', kind: 'tool', title: '항로 메모', text: '비행 경로를 복습해 이론 +4.', stackable: false, add: { theory: 4 } },
  { id: 'peer_intro', kind: 'connection', title: '동료 소개장', text: '새 동료에게 인사를 건네 인맥 +5.', stackable: false, add: { net: 5 } },
  { id: 'team_letter', kind: 'connection', title: '협업 감사장', text: '함께한 일을 소개받아 평판 +4.', stackable: false, add: { rep: 4 } },
];
const definition = (id: string) => CARDS.find(card => card.id === id);
const offers = (state: GameState) => Object.keys(state.timers).filter(key => key.startsWith(CARD_KEYS.offer))
  .map(key => Number(key.slice(CARD_KEYS.offer.length))).sort((a, b) => a - b);
export function offeredCard(state: GameState): (GameState['hand'][number] & { slot: number }) | null {
  const slot = offers(state)[0];
  return slot === undefined ? null : { slot, id: CARDS[state.timers[CARD_KEYS.offer + slot]].id,
    at: state.timers[CARD_KEYS.offerAt + slot] };
}
const fits = (state: GameState, id: string) => state.hand.length < CARD_RULES.cap
  && (definition(id)!.stackable || !state.hand.some(card => card.id === id));
function clearOffer(state: GameState, slot: number) {
  if (CARDS[state.timers[CARD_KEYS.offer + slot]]?.id === 'benefactor' && !state.hand.some(card => card.id === 'benefactor')) {
    delete state.timers[CARD_KEYS.migratedNet];
  }
  delete state.timers[CARD_KEYS.offer + slot]; delete state.timers[CARD_KEYS.offerAt + slot];
}
function storeWaiting(state: GameState) {
  for (let next = offeredCard(state); next && fits(state, next.id); next = offeredCard(state)) {
    state.hand.push({ id: next.id, at: next.at }); clearOffer(state, next.slot);
  }
}
export function grantCard(prev: GameState, id: string): GameState {
  if (!definition(id)) throw new Error(TEXT.unavailable(id));
  const state = structuredClone(prev);
  if (!offeredCard(state) && fits(state, id)) state.hand.push({ id, at: state.turn });
  else {
    const slot = Array.from({ length: CARD_RULES.maxOffers }, (_, index) => index)
      .find(index => state.timers[CARD_KEYS.offer + index] === undefined);
    if (slot === undefined) throw new Error(CARD_TEXT.pending);
    state.timers[CARD_KEYS.offer + slot] = CARDS.findIndex(card => card.id === id);
    state.timers[CARD_KEYS.offerAt + slot] = state.turn;
  }
  return state;
}
/** Event authors attach a reward without changing costs, requirements or the free exit. */
export function cardReward<T extends Choice>(choice: T, id: string): T {
  const text = CARD_TEXT.reward(definition(id)!.title);
  return { ...choice, desc: `${choice.desc} ${text}`, effect: { ...choice.effect!, grantCard: id,
    text: `${choice.effect!.text} ${text}` } };
}
export const cardGainText = (state: GameState, id: string) => (offeredCard(state) ? CARD_TEXT.offered : CARD_TEXT.stored)(definition(id)!.title);
// No dial is implemented here: UX3 can supply its signed delta at this shared boundary.
export const cappedChanceBonus = (cardBonus: number, dialBonus = 0) => Math.min(CARD_RULES.bonusCap, cardBonus + dialBonus);

function phaseLock(state: GameState): string | null {
  if (state.phase === 'ended') return CARD_TEXT.phase;
  if (state.phase === 'event' || state.timers.event_popup !== undefined || state.timers.event_fund_popup !== undefined
    || state.timers.event_jobs !== undefined || state.timers[JOB_RULES.popup] !== undefined || familyPopup(state)
    || state.timers[A.popup] !== undefined || !state.flags.includes(JOB_RULES.started)) return CARD_TEXT.popup;
  if (state.board.step !== 'spin' && state.board.step !== 'space') return CARD_TEXT.phase;
  return null;
}
export function cards(state: GameState) {
  const offer = offeredCard(state), phase = phaseLock(state);
  // Dropping is free, including the full-hand offer that follows a luck/event result.
  const dropLock = state.phase === 'ended' ? CARD_TEXT.phase : offer ? null : phase;
  return { capacity: CARD_RULES.cap,
    offered: offer && { ...offer, ...structuredClone(definition(offer.id)!),
      reason: state.hand.some(card => card.id === offer.id) && !definition(offer.id)!.stackable ? CARD_TEXT.duplicate : CARD_TEXT.full,
      skipId: 'skip', skipTitle: CARD_TEXT.skip },
    held: state.hand.map(held => {
      const card = definition(held.id)!;
      const lockedReason = phase ?? (offer ? CARD_TEXT.pending : null)
        ?? (state.timers[CARD_KEYS.usedAt] === state.turn ? CARD_TEXT.used : null)
        ?? (card.flag && state.flags.includes(card.flag) ? CARD_TEXT.active : null)
        ?? (card.id === 'triple' && state.board.step !== 'spin' ? CARD_TEXT.spin : null)
        ?? (card.id === 'field_patch' && (!state.s.drone || state.s.cond >= STAT_MAX.cond!) ? CARD_TEXT.repair : null);
      return { ...structuredClone(card), at: held.at, usable: !lockedReason, lockedReason,
        ...(card.id === 'benefactor' && state.timers[CARD_KEYS.migratedNet] !== undefined
          && { add: undefined, text: CARD_TEXT.migratedBenefactor }),
        useId: `card:use:${card.id}`, dropId: `card:drop:${card.id}`, droppable: !dropLock, dropLockedReason: dropLock };
    }) };
}
/** A private resolver for choose/forecast; never append these controls to options(). */
export function cardChoice(state: GameState, id: string): { choice: Choice; locks: string[] } | null {
  if (id === 'skip' && offeredCard(state) && state.phase !== 'ended') return {
    choice: { title: CARD_TEXT.skip, desc: CARD_TEXT.skipped, effect: { text: CARD_TEXT.skipped } }, locks: [] };
  const held = cards(state).held.find(card => card.useId === id || card.dropId === id);
  if (!held) return null;
  const drop = id === held.dropId, lock = drop ? held.dropLockedReason : held.lockedReason;
  const effect: Effect = drop ? { text: CARD_TEXT.dropped(held.title) }
    : { text: held.text, add: held.add, flag: held.flag };
  return { choice: { title: drop ? CARD_TEXT.drop(held.title) : held.title, desc: effect.text, effect }, locks: lock ? [lock] : [] };
}
export function applyCardChoice(prev: GameState, id: string): GameState {
  const state = structuredClone(prev);
  if (id === 'skip') { clearOffer(state, offeredCard(state)!.slot); storeWaiting(state); return state; }
  const [, action, cardId] = id.split(':'), card = definition(cardId)!;
  state.hand.splice(state.hand.findIndex(row => row.id === cardId), 1);
  if (cardId === 'benefactor') delete state.timers[CARD_KEYS.migratedNet];
  if (action === 'use') {
    state.timers[CARD_KEYS.usedAt] = state.turn;
    if (card.action === 'again') {
      if (state.board.step === 'spin') state.timers[CARD_KEYS.again] = state.turn;
      else { state.board.step = 'spin'; state.board.dice = []; }
    }
    if (card.action === 'shortcut') {
      // A shortcut replaces the pending normal move when played before the spin.
      if (state.board.step === 'spin') state.board.dice = [ASSET_RULES.singleStep, ASSET_RULES.singleStep];
      state.timers[A.popup] = A.shortcut; state.board.step = 'space';
    }
  }
  storeWaiting(state);
  return state;
}
/** Old effects were already activated; benefactor's +10 net must not be paid twice.
 * Over-cap migrations keep every card as a free, sequential offer instead of losing saves. */
export function migrateCards(prev: GameState): GameState | null {
  let state = structuredClone(prev);
  for (const card of CARDS) if (card.legacyFlag && state.flags.includes(card.legacyFlag)) {
    state.flags = state.flags.filter(flag => flag !== card.legacyFlag);
    if (!state.hand.some(held => held.id === card.id) && !offers(state).some(slot => CARDS[state.timers[CARD_KEYS.offer + slot]].id === card.id)) {
      if (offers(state).length >= CARD_RULES.maxOffers) return null;
      state = grantCard(state, card.id);
    }
    if (card.id === 'benefactor') state.timers[CARD_KEYS.migratedNet] = state.turn;
  }
  return state;
}
/** Called after the ordinary JSON integer check, before migration. */
export function validCards(state: GameState): boolean {
  if (!Array.isArray(state.hand) || state.hand.length > CARD_RULES.cap) return false;
  const seen = new Set<string>();
  for (const held of state.hand) {
    if (!held || typeof held !== 'object' || Array.isArray(held)) return false;
    const card = definition(held.id);
    if (!card || !Number.isSafeInteger(held.at) || held.at < 0 || held.at > state.turn
      || seen.has(held.id) && !card.stackable) return false;
    seen.add(held.id);
  }
  const slots = offers(state);
  if (slots.length > CARD_RULES.maxOffers) return false;
  for (const key of Object.keys(state.timers).filter(key => key.startsWith(CARD_KEYS.offer) || key.startsWith(CARD_KEYS.offerAt))) {
    const prefix = key.startsWith(CARD_KEYS.offer) ? CARD_KEYS.offer : CARD_KEYS.offerAt;
    const slot = Number(key.slice(prefix.length)), index = state.timers[CARD_KEYS.offer + slot], at = state.timers[CARD_KEYS.offerAt + slot];
    if (!Number.isInteger(slot) || slot < 0 || slot >= CARD_RULES.maxOffers || key !== prefix + slot
      || !Number.isInteger(index) || !CARDS[index] || !Number.isInteger(at) || at < 0 || at > state.turn) return false;
  }
  for (const key of [CARD_KEYS.usedAt, CARD_KEYS.again, CARD_KEYS.migratedNet]) {
    if (state.timers[key] !== undefined && state.timers[key] > state.turn) return false;
  }
  return true;
}
