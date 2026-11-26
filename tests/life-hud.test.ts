import assert from 'node:assert/strict';
import { test } from 'node:test';
import { choose, derived, newGame, options } from '../src/life/engine.ts';
import { grade, GRADED_STATS } from '../src/life/grades.ts';
import { LIFE_RULES, STAT_LABEL } from '../src/life/life-data.ts';
import { MAPS } from '../src/life/world.ts';
import type { GameState, MapId } from '../src/life/types.ts';
import { hud } from '../src/ui2/hud.ts';
import { LIFE_MILESTONES, lifeProgress } from '../src/ui2/hud-model.ts';
import { COPY } from '../src/ui2/popups/data.ts';
import { TestNode, textOf, withDOM } from './life-popup2-dom-helper.ts';

const started = () => choose(newGame(11), 'start:school').state;
const render = (state: GameState, before?: GameState) => hud(state, derived(state), options(state),
  () => assert.fail('rendering must not choose'), undefined, before).top as unknown as TestNode;

test('UX1 progress uses the date calendar for all 204 seasons, with no off-by-one at 70', () => {
  const state = started();
  for (let turn = 0; turn <= LIFE_RULES.maxTurns; turn++) {
    state.turn = turn;
    const progress = lifeProgress(turn), view = derived(state);
    assert.equal(progress.completed, turn);
    assert.equal(progress.total, 204);
    assert.equal(progress.season, Math.min(turn + 1, 204));
    assert.equal(Math.floor(progress.startAge + progress.completed / LIFE_RULES.seasons.length), view.age);
    assert.equal(progress.percent, turn * 100 / 204);
    assert.ok(progress.percent >= 0 && progress.percent <= 100);
  }
  assert.equal(lifeProgress(0).percent, 0);
  assert.equal(lifeProgress(204).percent, 100);
  assert.equal(lifeProgress(204).endAge, 70);
  for (const tick of LIFE_MILESTONES) {
    assert.equal(lifeProgress((tick.age - 19) * 4).percent, tick.percent);
  }
  assert.deepEqual(LIFE_MILESTONES.map(tick => tick.age), [35, 55, 60]);
});

test('UX1 progress clamps malformed/out-of-range presentation inputs', () => {
  for (const turn of [-10, NaN, Infinity, -Infinity]) assert.equal(lifeProgress(turn).completed, 0);
  assert.equal(lifeProgress(10.9).completed, 10);
  assert.equal(lifeProgress(999).completed, 204);
});

test('UX1 HUD retains calendar, map, money, debt, stamina and neutral career identity', () => withDOM(() => {
  const initial = newGame(11), top = render(initial);
  assert.equal(top.querySelector('.life2-rank-pill')!.textContent, '진로 선택 전');
  assert.doesNotMatch(textOf(top), /드론학과 학생/);
  for (const map of Object.keys(MAPS) as MapId[]) {
    const state = started(); state.board.pos = `${map}-o0`; state.s.money = 1_234_567; state.s.debt = 9876;
    const before = structuredClone(state), panel = render(state), view = derived(state);
    assert.ok(textOf(panel.querySelector('.life2-date')!).includes(view.dateLabel));
    assert.equal(panel.querySelector('.life2-hud-map')!.textContent, MAPS[map].name);
    assert.equal(panel.querySelector('.life2-money')!.attributes['aria-label'], '자금 1,234,567만');
    assert.equal(panel.querySelector('.life2-money')!.textContent, '자금 1,234,567만');
    assert.equal(panel.querySelector('.life2-debt')!.textContent, '빚 9,876만');
    assert.equal(panel.querySelector('.life2-funds')!.dataset.debtState, 'owing');
    assert.ok(textOf(panel.querySelector('.life2-stats')!).includes(`체력 ${state.s.stamina}/${view.capStamina}`));
    assert.equal(panel.querySelector('.life2-rank-pill')!.textContent, view.rankName || view.stageName);
    assert.deepEqual(state, before, 'HUD is read-only');
  }
}));

test('UX1 drone progress marker, accessible counter and empty reserved slot survive all life stages', () => withDOM(() => {
  for (const turn of [0, 63, 64, 143, 144, 163, 164, 203, 204]) {
    const state = started(); state.turn = turn;
    const top = render(state), progress = top.querySelector('[data-hud-progress]')!, p = lifeProgress(turn);
    assert.equal(progress.attributes.role, 'progressbar');
    assert.equal(progress.attributes['aria-valuemin'], '0');
    assert.equal(progress.attributes['aria-valuemax'], '204');
    assert.equal(progress.attributes['aria-valuenow'], String(p.completed));
    assert.equal(progress.attributes['aria-valuetext'], `${derived(state).dateLabel} · ${turn}/204계절 완료`);
    assert.equal(top.querySelector('[data-hud-season]')!.textContent, `계절 ${p.season}/204`);
    assert.equal(progress.querySelectorAll('.life2-progress-tick').length, 3);
    assert.ok(progress.querySelector('.life2-progress-drone')!.querySelectorAll('path').length);
    const avatar = top.querySelector('[data-hud-avatar]')!;
    assert.equal(avatar.tagName, 'svg'); assert.ok(avatar.attributes['aria-label']);
    assert.equal(top.querySelectorAll('img, image, text').length, 0, 'inline art has no raster or tiny SVG lettering');
    const cards = top.querySelector('[data-hud-slot=cards]')!;
    assert.equal((cards as unknown as HTMLElement).hidden, true);
    assert.equal(cards.children.length, 0); assert.equal(cards.textContent, '');
  }
}));

test('UX1 grade letters, current values and change directions remain accessible together', () => withDOM(() => {
  const before = started(), after = structuredClone(before);
  Object.assign(after.s, { skill: 50, xp: 210, teach: 30, biz: 30, support: 60, money: before.s.money + 250,
    debt: 100, stamina: before.s.stamina - 20 });
  const top = render(after, before);
  assert.deepEqual(top.querySelectorAll('[data-grade]').map(chip => chip.dataset.grade), GRADED_STATS);
  assert.deepEqual(top.querySelectorAll('[data-grade]').filter(chip => !(chip as unknown as HTMLElement).hidden)
    .map(chip => chip.dataset.grade), ['skill', 'xp', 'teach', 'biz', 'support']);
  for (const stat of GRADED_STATS) {
    const chip = top.querySelector(`[data-grade=${stat}]`)!, letter = grade(stat, after.s[stat])!.letter;
    assert.equal(chip.querySelector('.life2-grade-letter')!.textContent, letter);
    assert.ok(chip.attributes['aria-label'].includes(`${STAT_LABEL[stat]} ${letter}등급`));
    if (after.s[stat] !== before.s[stat]) {
      assert.equal(chip.dataset.changedStat, stat);
      assert.equal(chip.dataset.direction, after.s[stat] > before.s[stat] ? 'up' : 'down');
    } else assert.equal(chip.dataset.changedStat, undefined);
    assert.equal(chip.querySelector('.life2-grade-gauge')!.attributes['aria-hidden'], 'true');
  }
  assert.equal(top.querySelector('[data-changed-stat=stamina]')!.dataset.direction, 'down');
  assert.ok(top.querySelector('[data-changed-stat=stamina]')!.attributes['aria-label'].includes(`체력 ${after.s.stamina}/100`));
  assert.match(top.querySelector('.life2-change-strip')!.textContent, /자금 \+250만 · 빚 \+100만/);
  assert.equal(top.querySelector('.life2-change-strip')!.attributes['aria-live'], 'polite');
}));

test('UX1 segmented battery reflects depleted, partial and age-capped stamina', () => withDOM(() => {
  for (const [turn, stamina, cap, segments] of [[0, 0, 100, 0], [0, 1, 100, 1], [0, 40, 100, 2], [164, 80, 80, 5]]) {
    const state = started(); state.turn = turn; state.s.stamina = stamina;
    const top = render(state), battery = top.querySelector('.life2-battery')!;
    assert.equal(battery.children.length, 5);
    assert.equal(battery.querySelectorAll('[data-filled]').length, segments);
    assert.ok(textOf(top.querySelector('.life2-stats')!).includes(`체력 ${stamina}/${cap}`));
  }
}));

test('UX1 destination prompt does not replace the rank or remove debt state', () => withDOM(() => {
  const state = started(); state.board.step = 'pick'; state.board.dice = [2, 3];
  const top = render(state);
  assert.equal(top.querySelector('[data-pick-prompt]')!.textContent, COPY.pickDestination);
  assert.equal(top.querySelector('[data-pick-prompt]')!.attributes.role, 'status');
  assert.equal(top.querySelector('.life2-rank-pill')!.textContent, derived(state).rankName || derived(state).stageName);
  assert.equal(top.querySelector('.life2-funds')!.dataset.debtState, 'clear');
}));
