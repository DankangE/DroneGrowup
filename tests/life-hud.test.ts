import assert from 'node:assert/strict';
import { test } from 'node:test';
import { choose, derived, newGame, options, restore } from '../src/life/engine.ts';
import { grade, GRADED_STATS } from '../src/life/grades.ts';
import { LIFE_RULES, STAT_LABEL, STAT_MAX } from '../src/life/life-data.ts';
import { MAPS } from '../src/life/world.ts';
import type { GameState, MapId } from '../src/life/types.ts';
import { hud } from '../src/ui2/hud.ts';
import { GRADE_COLOURS, HUD_GRADE_NAMES, LIFE_MILESTONES, LIFE_ROUTE_SEGMENTS, lifeProgress } from '../src/ui2/hud-model.ts';
import { COPY } from '../src/ui2/popups/data.ts';
import { TestNode, textOf, withDOM } from './life-popup2-dom-helper.ts';

// The script's CLI guard keeps imports free of servers, builds and browsers.
const { hudChangeFixture, lateHudFixture } = await import(new URL('../scripts/layout-check-life.mjs', import.meta.url).href);

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
    assert.equal(panel.querySelector('.life2-stamina')!.attributes['aria-label'], `체력 ${state.s.stamina}/${view.capStamina}`);
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
    assert.deepEqual(progress.querySelectorAll('[data-age]').map(label => label.textContent), ['35세', '55세', '60세']);
    assert.equal(progress.querySelectorAll('.life2-progress-segment').length, 4);
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
    assert.equal(chip.attributes.role, 'group');
    if (!(chip as unknown as HTMLElement).hidden && after.s[stat] !== before.s[stat]) {
      assert.equal(chip.dataset.changedStat, stat);
      assert.equal(chip.dataset.direction, after.s[stat] > before.s[stat] ? 'up' : 'down');
    } else assert.equal(chip.dataset.changedStat, undefined);
    assert.equal(chip.querySelector('.life2-grade-gauge')!.attributes['aria-hidden'], 'true');
  }
  assert.equal(top.querySelector('[data-changed-stat=stamina]')!.dataset.direction, 'down');
  assert.ok(top.querySelector('[data-changed-stat=stamina]')!.attributes['aria-label'].includes(`체력 ${after.s.stamina}/100`));
  assert.equal(top.querySelectorAll('[data-changed-stat=stamina]').length, 1, 'only the visible stamina readout glows');
  assert.match(textOf(top.querySelector('.life2-change-strip')!), /자금 \+250만 빚 \+100만/);
  assert.equal(top.querySelector('.life2-change-strip')!.attributes['aria-live'], 'polite');
  for (const selector of ['.life2-money', '.life2-debt', '.life2-stamina', '.life2-grades']) {
    assert.equal(top.querySelector(selector)!.attributes.role, 'group', `${selector} exposes its accessible name`);
  }
}));

test('UX1 segmented battery reflects depleted, partial and age-capped stamina', () => withDOM(() => {
  for (const [turn, stamina, cap, segments] of [[0, 0, 100, 0], [0, 1, 100, 1], [0, 40, 100, 2], [164, 80, 80, 5]]) {
    const state = started(); state.turn = turn; state.s.stamina = stamina;
    const top = render(state), battery = top.querySelector('.life2-battery')!;
    assert.equal(battery.children.length, 5);
    assert.equal(battery.querySelectorAll('[data-filled]').length, segments);
    assert.equal(top.querySelector('.life2-stamina')!.attributes['aria-label'], `체력 ${stamina}/${cap}`);
  }
}));

test('UX1b grade colours are distinct AA inks on the navy chips; route legs meet at the milestones', () => {
  const luminance = (hex: string) => {
    const rgb = hex.slice(1).match(/../g)!.map(channel => {
      const value = parseInt(channel, 16) / 255;
      return value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4;
    });
    return rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722;
  };
  assert.deepEqual(Object.keys(GRADE_COLOURS), ['G', 'F', 'E', 'D', 'C', 'B', 'A', 'S']);
  assert.equal(new Set(Object.values(GRADE_COLOURS)).size, 8);
  for (const ink of Object.values(GRADE_COLOURS)) {
    assert.ok((luminance(ink) + .05) / (luminance('#102b40') + .05) >= 4.5, `${ink} meets AA`);
  }
  assert.equal(LIFE_ROUTE_SEGMENTS[0].from, 0);
  assert.equal(LIFE_ROUTE_SEGMENTS.at(-1)!.to, 100);
  for (const [index, milestone] of LIFE_MILESTONES.entries()) {
    assert.equal(LIFE_ROUTE_SEGMENTS[index].to, milestone.percent);
    assert.equal(LIFE_ROUTE_SEGMENTS[index + 1].from, milestone.percent);
    assert.equal(LIFE_ROUTE_SEGMENTS[index].colour, milestone.colour);
  }
});

test('UX1b hidden grades never get change marks, while money and debt deltas stay beside the funds', () => withDOM(() => {
  const before = started(), after = structuredClone(before);
  Object.assign(after.s, { theory: 90, rep: 90, net: 90, stamina: 20, money: 0, debt: 9_000_000 });
  const top = render(after, before), funds = top.querySelector('.life2-funds')!;
  for (const stat of ['stamina', 'theory', 'rep', 'net']) {
    const cell = top.querySelector(`[data-grade=${stat}]`)!;
    assert.equal((cell as unknown as HTMLElement).hidden, true);
    assert.equal(cell.dataset.changedStat, undefined);
    assert.equal(cell.dataset.direction, undefined);
  }
  assert.equal(funds.querySelector('[data-hud-delta-stat=money]')!.textContent, `자금 -${before.s.money}만`);
  assert.equal(funds.querySelector('[data-hud-delta-stat=debt]')!.textContent, '빚 +9000000만');
  assert.ok(funds.querySelector('.life2-credit-coin'));
  const marks = top.querySelectorAll('[data-changed-stat]').map(cell => cell.dataset.changedStat);
  assert.equal(marks.length, new Set(marks).size);
  assert.equal(top.querySelector('[data-hud-player]')!.dataset.hudDelta, '');
  assert.equal(render(before).querySelector('[data-hud-player]')!.dataset.hudDelta, undefined);
}));

test('UX1 destination prompt does not replace the rank or remove debt state', () => withDOM(() => {
  const state = started(); state.board.step = 'pick'; state.board.dice = [2, 3];
  const top = render(state);
  assert.equal(top.querySelector('[data-pick-prompt]')!.textContent, COPY.pickDestination);
  assert.equal(top.querySelector('[data-pick-prompt]')!.attributes.role, 'status');
  assert.equal(top.querySelector('.life2-rank-pill')!.textContent, derived(state).rankName || derived(state).stageName);
  assert.equal(top.querySelector('.life2-funds')!.dataset.debtState, 'clear');
}));

test('UX1c each career grade has a unique short name and keeps its full accessible name, including S', () => withDOM(() => {
  const state = started();
  for (const stat of GRADED_STATS) state.s[stat] = STAT_MAX[stat] ?? LIFE_RULES.statMax;
  assert.deepEqual(restore(state), state);
  const top = render(state);
  assert.deepEqual(Object.values(HUD_GRADE_NAMES).map(name => name.short), ['조', '경', '교', '사', '지']);
  for (const [stat, name] of Object.entries(HUD_GRADE_NAMES)) {
    const chip = top.querySelector(`[data-grade=${stat}]`)!;
    assert.equal(chip.querySelector('.life2-grade-name')!.textContent, name.full);
    assert.equal(chip.querySelector('.life2-grade-short')!.textContent, name.short);
    assert.equal(chip.querySelector('.life2-grade-short')!.attributes['aria-hidden'], 'true');
    assert.equal(chip.querySelector('.life2-grade-letter')!.textContent, 'S');
    assert.equal(chip.attributes['aria-label'], `${STAT_LABEL[stat as keyof typeof HUD_GRADE_NAMES]} S등급`);
  }
}));

test('UX1d layout fixtures restore with legal maxima and render all five career grades as S', () => withDOM(() => {
  const assertSGrades = (state: GameState) => {
    const restored = restore(state);
    assert.ok(restored, 'layout loader accepts the fixture');
    assert.deepEqual(restored, state);
    // render() supplies derived(restored) to the HUD; grade() supplies its letters.
    const top = render(restored);
    for (const stat of ['skill', 'xp', 'teach', 'biz', 'support'] as const) {
      assert.equal(restored.s[stat], STAT_MAX[stat] ?? LIFE_RULES.statMax, `${stat}: legal maximum`);
      assert.equal(grade(stat, restored.s[stat])!.letter, 'S', `${stat}: maximum yields S`);
      assert.equal(top.querySelector(`[data-grade=${stat}]`)!.querySelector('.life2-grade-letter')!.textContent, 'S');
    }
  };
  for (const map of Object.keys(MAPS)) {
    const late = lateHudFixture(map);
    assert.deepEqual(restore(late), late);
    assertSGrades(lateHudFixture(map, true));
  }
  for (const id of ['loan:500', `repay:${LIFE_RULES.statMax}`]) {
    const run = hudChangeFixture(id);
    assertSGrades(run);
    assert.ok(options(run, 'phone').some(option => option.id === id && option.enabled));
    assertSGrades(choose(run, id, 'phone').state);
  }
}));

test('UX1c money and debt chips/readouts share benefit tone while preserving numeric direction and text', () => withDOM(() => {
  for (const [delta, direction, moneyTone, debtTone] of [
    [250, 'up', 'good', 'bad'], [-250, 'down', 'bad', 'good'],
  ] as const) {
    const before = started(); before.s.money = before.s.debt = 1000;
    const after = structuredClone(before);
    after.s.money += delta; after.s.debt += delta;
    const top = render(after, before);
    for (const [stat, tone] of [['money', moneyTone], ['debt', debtTone]] as const) {
      const readout = top.querySelector(`[data-changed-stat=${stat}]`)!;
      const chip = top.querySelector(`[data-hud-delta-stat=${stat}]`)!;
      assert.equal(chip.textContent, `${STAT_LABEL[stat]} ${delta > 0 ? '+' : ''}${delta}만`);
      for (const node of [chip, readout]) {
        assert.equal(node.dataset.direction, direction);
        assert.equal(node.dataset.tone, tone);
      }
    }
    const unchanged = render(before, before);
    assert.equal(unchanged.querySelector('.life2-money')!.dataset.tone, undefined);
    assert.equal(unchanged.querySelector('.life2-debt')!.dataset.tone, undefined);
    assert.equal(unchanged.querySelectorAll('[data-hud-delta-stat]').length, 0);
  }
}));

test('UX1f compact HUD keeps identity, accessible status, S grades and both signed delta fixtures', () => withDOM(() => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const viewport = { innerWidth: 360, innerHeight: 700 };
  Object.defineProperty(globalThis, 'window', { configurable: true, value: viewport });
  try {
    const initial = render(newGame(11));
    assert.equal(initial.querySelector('.life2-hud-status')!.textContent, '진로');
    assert.equal(initial.querySelector('.life2-hud-status')!.attributes['aria-label'], '진로 선택 전');
    const late = render(lateHudFixture('A', true));
    assert.equal(late.querySelector('[data-pick-prompt]')!.textContent, '도착칸');
    assert.equal(late.querySelector('[data-pick-prompt]')!.attributes['aria-label'], COPY.pickDestination);
    assert.ok(late.querySelector('.life2-stats')!.contains(late.querySelector('[data-pick-prompt]')!));
    assert.ok(late.querySelector('.life2-hud-rank')!.contains(late.querySelector('[data-hud-avatar]')!));
    for (const id of ['loan:500', `repay:${LIFE_RULES.statMax}`]) {
      const before = hudChangeFixture(id), after = choose(before, id, 'phone').state;
      const top = render(after, before);
      for (const stat of ['money', 'debt'] as const) {
        const delta = after.s[stat] - before.s[stat];
        assert.equal(top.querySelector(`[data-hud-delta-stat=${stat}]`)!.textContent,
          `${STAT_LABEL[stat]} ${delta > 0 ? '+' : ''}${delta}만`);
      }
      for (const stat of Object.keys(HUD_GRADE_NAMES)) {
        const chip = top.querySelector(`[data-grade=${stat}]`)!;
        assert.equal(chip.querySelector('.life2-grade-letter')!.textContent, 'S');
        assert.ok(chip.querySelector('.life2-grade-short')!.textContent);
      }
    }
    // Resizing across either boundary restores the full prompt in the route row.
    for (const [width, height, compact] of [[320, 700, true], [480, 739, true], [499, 739, true],
      [500, 700, false], [360, 740, false]] as const) {
      viewport.innerWidth = width; viewport.innerHeight = height;
      const top = render(lateHudFixture('A', true)), prompt = top.querySelector('[data-pick-prompt]')!;
      assert.equal(prompt.textContent, compact ? '도착칸' : COPY.pickDestination);
      assert.ok(top.querySelector(compact ? '.life2-stats' : '.life2-hud-footer')!.contains(prompt));
    }
  } finally {
    if (original) Object.defineProperty(globalThis, 'window', original);
    else Reflect.deleteProperty(globalThis, 'window');
  }
}));
