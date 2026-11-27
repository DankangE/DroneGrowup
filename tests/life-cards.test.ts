import assert from 'node:assert/strict';
import test from 'node:test';
import { applyCardChoice, CARDS, CARD_KEYS as K, CARD_RULES, cappedChanceBonus, grantCard } from '../src/life/cards.ts';
import { luckChanceBonus } from '../src/life/assets.ts';
import { cards, choose, forecast, newGame, options, reachable, restore } from '../src/life/engine.ts';
import { choose as interactiveChoose } from '../src/life/flow.ts';
import { ASSET_KEYS as A, LUCK } from '../src/life/life-data.ts';
import { BOT_CARD_TRAITS, pickBot, POLICY_IDS } from '../src/life/bots.ts';
import { randInt } from '../src/life/move.ts';
import { WORLD } from '../src/life/world.ts';
import { cloneSimulationState, runLife } from '../scripts/simulate-life.ts';
import { eventFixture } from '../scripts/outcome-check-life.ts';
import { materialize } from '../src/life/events-a.ts';
import { ALL_EVENTS } from '../src/life/engine.ts';
import type { GameState } from '../src/life/types.ts';

const ready = (step: 'spin' | 'space' = 'spin') => {
  const state = choose(newGame(19), 'start:self').state;
  state.board.step = step; state.board.dice = step === 'spin' ? [] : [1, 1];
  Object.assign(state.s, { drone: 1, cond: 50, skill: 30, theory: 30, net: 30, rep: 30, money: 10000 });
  return state;
};
function freeze(value: unknown): void {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
}
function roundtrip(state: GameState): GameState {
  const saved = restore(JSON.parse(JSON.stringify(state)));
  assert.ok(saved); assert.deepEqual(saved, state); return saved;
}
const use = (state: GameState, id: string) => choose(state, `card:use:${id}`);
const seedFor = (index: number, size: number) => {
  for (let seed = 1; ; seed++) if (randInt(newGame(seed), size) === index) return seed;
};
const context = { phoneUsed: true, tried: [], salaryIncome: 0, invested: 0 };

test('launch has seven existing luck cards and five original tools/connections; the hand starts empty', () => {
  assert.equal(CARDS.length, 12); assert.equal(new Set(CARDS.map(card => card.id)).size, 12);
  assert.equal(CARDS.filter(card => card.kind === 'luck').length, 7);
  assert.equal(CARDS.filter(card => card.kind === 'tool').length, 3);
  assert.equal(CARDS.filter(card => card.kind === 'connection').length, 2);
  assert.deepEqual(newGame(1).hand, []); assert.equal(CARD_RULES.cap, 3);
  assert.ok(CARDS.every(card => /[가-힣]/.test(card.title + card.text)));
});
for (const card of CARDS) test(`card ${card.id}: use, exact effect, detached forecast, save replay and season budget`, () => {
  const state = grantCard(ready(), card.id), original = structuredClone(state), beforeRng = state.rng;
  freeze(state);
  const held = cards(state).held[0]; assert.equal(held.usable, true); assert.equal(held.lockedReason, null);
  const preview = forecast(state, held.useId), actual = choose(state, held.useId);
  assert.deepEqual(actual.result.deltas, preview.branches[0].deltas);
  assert.deepEqual(actual.result.effects, preview.branches[0].effects);
  assert.deepEqual(actual, choose(roundtrip(state), held.useId));
  assert.deepEqual(state, original); assert.equal(actual.state.rng, beforeRng);
  assert.equal(actual.state.hand.length, 0); assert.equal(actual.state.turn, state.turn);
  assert.equal(actual.state.s.acts, state.s.acts); assert.equal(actual.state.timers[K.usedAt], state.turn);
  for (const [stat, amount] of Object.entries(card.add ?? {})) {
    assert.equal(actual.state.s[stat as keyof GameState['s']] - state.s[stat as keyof GameState['s']], amount);
  }
  if (card.flag) assert.ok(actual.state.flags.includes(card.flag));
  if (card.action === 'again') assert.equal(actual.state.timers[K.again], state.turn);
  if (card.action === 'shortcut') assert.equal(actual.state.timers[A.popup], A.shortcut);
  roundtrip(actual.state);
  const another = grantCard(actual.state, 'peer_intro');
  assert.equal(cards(another).held[0].usable, false);
  assert.throws(() => use(another, 'peer_intro'), /disabled/);
  assert.ok(!options(state).some(row => row.id.startsWith('card:')));
  assert.ok(!options(state, 'phone').some(row => row.id.startsWith('card:')));
});

test('all seven holdable luck draws store without activating and retain the existing result popup shape', () => {
  for (const card of CARDS.filter(card => card.kind === 'luck')) {
    const state = ready('space'); state.board.pos = 'A-o10'; state.board.step = 'pick';
    state.rng = seedFor(LUCK.findIndex(row => row.id === card.id), LUCK.length);
    const next = interactiveChoose(state, 'go:A-o12');
    assert.deepEqual(next.state.hand, [{ id: card.id, at: state.turn }]);
    assert.equal(next.result.luck?.title, card.title); assert.match(next.result.luck!.text, /보관/);
    assert.equal(next.state.timers[A.popup], undefined);
    assert.ok(!card.flag || !next.state.flags.includes(card.flag));
    assert.equal(next.state.s.net, state.s.net);
    assert.equal(next.state.timers[K.usedAt], undefined);
  }
});

test('hand cap offers a free skip; dropping one card accepts the offer without time, RNG, cash or slot cost', () => {
  let state = ready();
  for (const id of ['dream', 'triple', 'discount']) state = grantCard(state, id);
  state = grantCard(state, 'peer_intro');
  assert.equal(state.hand.length, 3); assert.equal(cards(state).offered?.id, 'peer_intro');
  assert.deepEqual(options(state).map(row => [row.id, row.title, row.cost, row.tire, row.enabled]), [['skip', '포기', 0, 0, true]]);
  const before = structuredClone(state); freeze(state);
  const dropped = choose(state, 'card:drop:discount');
  assert.deepEqual(dropped.state.hand.map(card => card.id), ['dream', 'triple', 'peer_intro']);
  assert.deepEqual(dropped.state.s, state.s); assert.deepEqual(dropped.state.board, state.board);
  assert.equal(dropped.state.turn, state.turn); assert.equal(dropped.state.rng, state.rng);
  assert.equal(dropped.state.timers[K.usedAt], undefined); assert.equal(cards(dropped.state).offered, null);
  assert.deepEqual(state, before); roundtrip(dropped.state);
  const skipped = interactiveChoose(state, 'skip');
  assert.deepEqual(skipped.state.hand, state.hand); assert.equal(cards(skipped.state).offered, null);
  assert.deepEqual(skipped.state.board, state.board); assert.deepEqual(skipped.state.s, state.s);
  assert.equal(skipped.state.turn, state.turn); roundtrip(skipped.state);
});

test('full-hand luck and event offers preserve bonus/spin/event continuations even in interactive flow', () => {
  for (const source of ['luck', 'event', 'life-event'] as const) {
    let state = source === 'luck' ? ready('space') : eventFixture('hobby');
    if (source === 'life-event') { state.board.step = 'spin'; state.board.dice = []; }
    for (const id of ['dream', 'triple', 'discount']) state = grantCard(state, id);
    if (source === 'luck') {
      state.board.pos = 'A-o10'; state.board.step = 'pick';
      state.rng = seedFor(LUCK.findIndex(row => row.id === 'transfer'), LUCK.length);
    }
    const next = interactiveChoose(state, source === 'luck' ? 'go:A-o12' : 'ev:0').state;
    assert.equal(cards(next).offered?.id, source === 'luck' ? 'transfer' : 'field_patch');
    assert.equal(next.board.step, source === 'life-event' ? 'spin' : 'bonus');
    assert.equal(next.turn, state.turn); roundtrip(next);
    const decline = interactiveChoose(next, 'skip').state;
    assert.equal(decline.board.step, next.board.step); assert.equal(decline.turn, state.turn);
    assert.ok(options(decline).some(row => row.enabled));
  }
  const event = grantCard(grantCard(grantCard(grantCard(eventFixture('hobby'), 'dream'), 'triple'), 'discount'), 'peer_intro');
  const dropped = choose(event, 'card:drop:discount').state;
  assert.equal(dropped.phase, 'event'); assert.equal(dropped.eventId, 'hobby');
  assert.ok(cards(dropped).held.every(card => !card.usable));
  assert.ok(options(dropped).some(row => row.id === 'ev:0'));
});

test('duplicate rules distinguish stackable repair cards and reject a duplicate without silently replacing it', () => {
  const nonstack = grantCard(grantCard(ready(), 'dream'), 'dream');
  assert.equal(nonstack.hand.length, 1); assert.equal(cards(nonstack).offered?.id, 'dream');
  assert.equal(choose(nonstack, 'card:drop:dream').state.hand.length, 1);
  let stack = ready();
  for (let i = 0; i < 3; i++) stack = grantCard(stack, 'field_patch');
  roundtrip(stack); assert.equal(use(stack, 'field_patch').state.hand.length, 2);
  assert.equal(choose(stack, 'card:drop:field_patch').state.hand.length, 2);
});

test('cards never expire; drops are free and do not bypass one use per season, including reloads', () => {
  let state = grantCard(grantCard(ready(), 'stick_drill'), 'route_notes');
  state = use(state, 'stick_drill').state; state = roundtrip(state);
  assert.match(cards(state).held[0].lockedReason!, /이번 계절/);
  state = choose(state, 'card:drop:route_notes').state;
  state = grantCard(state, 'peer_intro'); assert.throws(() => use(state, 'peer_intro'), /disabled/);
  state.board.step = 'space'; state.board.dice = [1, 1];
  state = choose(state, 'skip').state; state = choose(state, 'end').state;
  assert.equal(cards(state).held[0].usable, true); use(state, 'peer_intro');
  state.turn = 80; roundtrip(state); assert.equal(cards(state).held[0].at, 0);
});

test('use is locked in pick/bonus, events and every nested event popup; drop cannot escape event choices', () => {
  for (const step of ['pick', 'bonus'] as const) {
    const state = grantCard(ready('space'), 'dream'); state.board.step = step;
    assert.ok(cards(state).held[0].lockedReason); assert.throws(() => use(state, 'dream'), /disabled/);
  }
  for (const key of ['event_popup', 'event_fund_popup', 'event_jobs', 'family_choose_dual']) {
    const state = grantCard(ready('space'), 'dream'); state.timers[key] = 1;
    assert.equal(cards(state).held[0].usable, false); assert.throws(() => use(state, 'dream'), /disabled/);
  }
  const event = grantCard(eventFixture('hobby'), 'dream');
  assert.throws(() => use(event, 'dream'), /disabled/);
  assert.throws(() => choose(event, 'card:drop:dream'), /disabled/);
  assert.throws(() => choose(ready(), 'card:use:unknown'), /not available/);
  assert.throws(() => choose(ready(), 'card:drop:dream'), /not available/);
  assert.throws(() => use(grantCard(ready('space'), 'triple'), 'triple'), /disabled/);
});

test('an active effect cannot be overwritten; preview and nonmatching actions never consume it', () => {
  let state = use(grantCard(ready(), 'dream'), 'dream').state;
  state.turn++; state = grantCard(state, 'dream');
  assert.match(cards(state).held[0].lockedReason!, /효과/);
  const before = structuredClone(state); options(state); forecast(state, 'spin'); cards(state);
  assert.deepEqual(state, before); assert.ok(choose(state, 'spin').state.flags.includes(A.dream));
});

test('again before spin grants two moves but only the final tile; using it at space immediately reopens spin', () => {
  const state = use(grantCard(ready(), 'again'), 'again').state;
  let next = choose(state, 'spin').state;
  if (next.board.step === 'pick') next = choose(next, options(next).find(row => row.id.startsWith('go:'))!.id).state;
  assert.equal(next.board.step, 'spin'); assert.deepEqual(next.board.dice, []);
  assert.equal(next.turn, state.turn); assert.equal(next.timers[K.again], undefined);
  roundtrip(next); assert.equal(next.s.acts, state.s.acts);
  const space = use(grantCard(ready('space'), 'again'), 'again').state;
  assert.equal(space.board.step, 'spin'); assert.deepEqual(space.board.dice, []);
});

test('shortcut before spin replaces the movement, keeps nearest-kind routes and both action slots', () => {
  const next = use(grantCard(ready(), 'shortcut'), 'shortcut').state;
  const skipped = choose(next, 'skip').state;
  assert.equal(skipped.board.step, 'bonus'); roundtrip(skipped);
  const landed = choose(next, 'luck:shortcut:train').state;
  assert.equal(WORLD.find(node => node.id === landed.board.pos)!.kind, 'train');
  assert.equal(landed.board.step, 'space'); assert.equal(landed.s.acts, 0); roundtrip(landed);
});

test('shared card+dial correction caps at +30pp before the final clamp; no dial state is introduced', () => {
  assert.equal(cappedChanceBonus(20, 15), 30); assert.equal(cappedChanceBonus(30, -15), 15);
  assert.equal(cappedChanceBonus(0, -15), -15); assert.equal(cappedChanceBonus(0), 0);
  let state = grantCard(ready(), 'benefactor'); state = use(state, 'benefactor').state;
  state.turn++; state = use(grantCard(state, 'dream'), 'dream').state;
  assert.equal(luckChanceBonus(state, 'promo', 15), 30); assert.equal(luckChanceBonus(state, 'act:st_exam'), 20);
  state.board.step = 'space'; state.board.dice = [1, 1]; state.board.pos = 'A-o9';
  state.status = 'working'; state.track = 'service'; state.job.perf = 50; state.job.tenure = 4; state.s.xp = 100;
  assert.equal(options(state).find(row => row.id === 'promo')!.roll!.chance, 80);
  const result = choose(state, 'promo'); assert.equal(result.result.roll!.chance, 80);
  assert.ok(!result.state.flags.includes(A.dream)); assert.ok(!result.state.flags.includes(A.benefactor));
});

test('old saves default a missing hand and migrate all five flags without overflowing or paying network twice', () => {
  const old = ready() as GameState & { hand?: GameState['hand'] }; Reflect.deleteProperty(old, 'hand');
  assert.deepEqual(restore(old)!.hand, []);
  old.flags.push('luck_triple', 'luck_transfer', 'luck_benefactor', 'luck_discount', 'luck_dream');
  const before = structuredClone(old); let migrated = restore(old)!;
  assert.ok(migrated); assert.deepEqual(old, before); assert.equal(migrated.hand.length, 3);
  assert.ok(!migrated.flags.some(flag => flag.startsWith('luck_'))); roundtrip(migrated);
  assert.equal(cards(migrated).offered?.id, 'discount');
  migrated = choose(migrated, 'skip').state; assert.equal(cards(migrated).offered?.id, 'dream');
  migrated = choose(migrated, 'skip').state;
  assert.match(cards(migrated).held.find(card => card.id === 'benefactor')!.text, /이미 받았다/);
  const net = migrated.s.net; migrated = use(migrated, 'benefactor').state;
  assert.equal(migrated.s.net, net); assert.ok(migrated.flags.includes(A.benefactor)); roundtrip(migrated);
  assert.equal(cards(migrated).held.length, 2);
});

test('restoring each legacy flag produces its own card; new activated flags survive roundtrip', () => {
  for (const card of CARDS.filter(row => row.legacyFlag)) {
    const old = ready(); old.flags.push(card.legacyFlag!);
    const restored = restore(old)!;
    assert.deepEqual(restored.hand, [{ id: card.id, at: 0 }]);
    const active = use(restored, card.id).state;
    assert.ok(active.flags.includes(card.flag!)); roundtrip(active);
  }
});

test('restore strictly rejects malformed hands and card clocks, including duplicate ids and future acquisitions', () => {
  for (const hand of [null, {}, 'dream', [null], ['dream'], [{ id: 'dream' }], [{ id: 'missing', at: 0 }],
    [{ id: 'dream', at: -1 }], [{ id: 'dream', at: 1 }], [{ id: 'dream', at: 0.5 }],
    [{ id: 'dream', at: '0' }], [{ id: 'dream', at: 0 }, { id: 'dream', at: 0 }],
    Array.from({ length: 4 }, () => ({ id: 'field_patch', at: 0 }))]) {
    assert.equal(restore({ ...ready(), hand }), null, JSON.stringify(hand));
  }
  for (const timers of [{ [K.usedAt]: 1 }, { [K.offer + '0']: 12, [K.offerAt + '0']: 0 },
    { [K.offer + '0']: 1 }, { [K.offerAt + '0']: 0 }, { [K.offer + '0']: 1, [K.offerAt + '0']: 1 }]) {
    assert.equal(restore({ ...ready(), timers }), null);
  }
  const state = grantCard(ready(), 'dream'), cloned = cloneSimulationState(state);
  cloned.hand[0].id = 'triple'; assert.equal(state.hand[0].id, 'dream');
});

test('exactly three existing events grant all five new cards on paid responses and retain their cost-free exits', () => {
  const wired = new Map<string, string[]>();
  for (const event of ALL_EVENTS) {
    const state = eventFixture(event.id), choices = materialize(event, state).choices;
    for (const [index, choice] of choices.entries()) if (choice.effect?.grantCard) {
      assert.ok(choice.cost! > 0); assert.ok(choices.some(row => !row.cost && !row.tire && !row.need && !row.effect?.grantCard));
      const id = choice.effect.grantCard;
      wired.set(event.id, [...wired.get(event.id) ?? [], id]);
      const preview = forecast(state, `ev:${index}`), actual = choose(state, `ev:${index}`);
      assert.deepEqual(actual.state.hand, [{ id, at: state.turn }]);
      assert.deepEqual(actual.result.effects, preview.branches[0].effects); roundtrip(actual.state);
    }
  }
  assert.deepEqual([...wired.keys()], ['hobby', 'world_trip', 'fast_track']);
  assert.deepEqual([...wired.values()].flat().sort(), CARDS.filter(row => row.kind !== 'luck').map(row => row.id).sort());
});

for (const policy of POLICY_IDS) test(`bot ${policy}: uses a useful card and drops its weakest for a stronger offer`, () => {
  const active = grantCard(ready(), 'triple');
  assert.equal(pickBot(policy, active, options(active), context).id, 'card:use:triple');
  const preferred = BOT_CARD_TRAITS[policy][0] ?? 'field_patch';
  let full = ready();
  const weak = CARDS.filter(card => !BOT_CARD_TRAITS[policy].includes(card.id) && card.id !== preferred && !card.add).slice(0, 3);
  assert.equal(weak.length, 3);
  for (const card of weak) full = grantCard(full, card.id);
  full = grantCard(full, preferred);
  const chosen = pickBot(policy, full, options(full), context);
  assert.ok(chosen.id.startsWith('card:drop:'), chosen.id);
  assert.ok(choose(full, chosen.id).state.hand.some(row => row.id === preferred));
});

test('many seeded complete games remain deterministic, bounded and restorable with every policy using cards', () => {
  const uses = new Set<string>(); let runs = 0;
  for (const [index, policy] of POLICY_IDS.entries()) for (let sample = 0; sample < 4; sample++) {
    const seed = index * 4 + sample + 1;
    const run = runLife(policy, seed, 'base', { trace: step => {
      assert.ok(step.after.hand.length <= 3);
      if (step.option.id.startsWith('card:use:')) {
        uses.add(policy); assert.equal(step.before.timers[K.usedAt] === step.before.turn, false);
        assert.ok(cards(step.before).held.some(card => card.useId === step.option.id && card.usable));
        assert.deepEqual(choose(roundtrip(step.before), step.option.id).state, step.after);
      }
      if (step.after.phase !== 'ended') assert.ok(options(step.after).some(row => row.enabled));
    } });
    assert.equal(run.state.turn, 204); assert.equal(run.report.violations, 0, `${policy}/${seed}`);
    roundtrip(run.state); runs++;
    if (sample === 0) assert.deepEqual(runLife(policy, seed), run);
  }
  assert.equal(uses.size, 16); assert.equal(runs, 64);
});

test('empty-hand neutral operations preserve RNG and use the ordinary options/choose path', () => {
  const state = ready('space');
  assert.deepEqual(cards(state).held, []);
  const before = structuredClone(state); cards(state); options(state);
  assert.deepEqual(state, before);
  const dropped = applyCardChoice(grantCard(state, 'dream'), 'card:drop:dream');
  assert.deepEqual(dropped, state);
  assert.deepEqual(reachable(dropped), reachable(state));
});

test('discarding a migrated benefactor offer does not suppress a later new card network reward', () => {
  let state = ready();
  for (const id of ['dream', 'triple', 'discount']) state = grantCard(state, id);
  state.flags.push('luck_benefactor'); state = restore(state)!;
  assert.equal(cards(state).offered?.id, 'benefactor');
  state = choose(state, 'skip').state;
  assert.equal(state.timers[K.migratedNet], undefined);
  state = choose(state, 'card:drop:discount').state;
  state = grantCard(state, 'benefactor');
  assert.equal(use(state, 'benefactor').state.s.net, state.s.net + 10);
});

test('a card-forbidden counterfactual completes and never activates a held card', () => {
  const baseline = runLife('drifter', 1), disabled = runLife('drifter', 1, 'no-cards');
  assert.ok(Object.values(baseline.report.cardUses).reduce((a, b) => a + b, 0) > 0);
  assert.deepEqual(disabled.report.cardUses, {});
  assert.equal(disabled.report.violations, 0); assert.equal(disabled.state.turn, 204);
});
