import { grade, GRADED_STATS } from '../life/grades.ts';
import { STAT_LABEL } from '../life/life-data.ts';
import type { Derived, OptionView } from '../life/engine.ts';
import type { GameState } from '../life/types.ts';
import { MAPS, WORLD } from '../life/world.ts';
import { statChanges } from './popups/polish-model.ts';
import { COPY } from './popups/data.ts';
import { button, el } from '../ui/dom.ts';
import { fundsChangeTone, GRADE_COLOURS, HUD_GRADE_NAMES, lifeProgress, LIFE_MILESTONES, LIFE_ROUTE_SEGMENTS } from './hud-model.ts';
import { creditCoin, pilotAvatar, progressDrone } from './hud-art.ts';
import { diceDisplay } from './wheel.ts';

const COMPACT_HUD_MAX = { width: 499, height: 739 };

export const HUD_STYLE = `
.life2 .life2-shell { grid-template-rows:110px minmax(0,1fr) clamp(50px,18dvh,136px) 44px; }
.life2 .life2-bottom { position:relative; z-index:11; }
/* 110 = 2 border + 8 padding + 4 gaps + 12 date + 54 player + 30 route.
   The 44px avatar spans the player's 30 + 2 + 20px rows, inside 1px padding. */
.life2 .life2-hud {
  grid-template:'date' 12px 'player' 54px 'route' 30px / minmax(0,1fr);
  gap:2px; padding:4px 8px; color:#e9f6fa; background:#16394a;
  border-color:#0b2436; border-radius:12px; box-shadow:0 2px 0 #557681;
  font-family:system-ui,"Apple SD Gothic Neo","Malgun Gothic",sans-serif;
  font-size:11px; line-height:12px; font-variant-numeric:tabular-nums;
}
.life2 .life2-hud :is(div,span,h1,strong) { min-width:0; }
.life2 .life2-date { grid-area:date; display:flex; align-items:center; gap:5px; white-space:nowrap; }
.life2 .life2-date h1 { font-size:12px; line-height:12px; letter-spacing:0; }
.life2 .life2-date > span { font-size:11px; line-height:12px; }
.life2 .life2-hud-season { margin-left:auto; color:#c3dce5; }
.life2 .life2-player-card {
  grid-area:player; display:grid; grid-template-columns:44px minmax(0,1fr) auto;
  grid-template-rows:30px 20px; align-items:center; gap:2px 6px; padding:1px 4px;
  border-radius:8px; background:linear-gradient(115deg,#123246,#0e4c59);
  box-shadow:inset 0 0 0 1px #316474;
}
.life2 .life2-hud-avatar { grid-column:1; grid-row:1 / 3; width:44px; height:44px; }
.life2 .life2-hud-identity { grid-column:2; grid-row:1; display:grid; grid-template-rows:14px 14px; gap:2px; }
.life2 .life2-hud-rank { display:flex; align-items:center; gap:4px; white-space:nowrap; }
.life2 .life2-pilot-name { display:none; }
.life2 .life2-rank-pill { padding:0 4px; border-radius:4px; background:#194559; color:#f2fbff; line-height:14px; }
.life2 .life2-funds { grid-column:3; grid-row:1; display:grid; grid-template-rows:16px 14px;
  justify-items:end; text-align:right; white-space:nowrap; }
.life2 .life2-coin-chip { display:flex; align-items:center; gap:3px; padding:0 3px;
  height:16px; border-radius:5px; background:#0b2839; color:#ffe49a; }
.life2 .life2-credit-coin { flex:none; width:14px; height:14px; }
.life2 .life2-money { font-size:14px; line-height:16px; letter-spacing:-.025em; }
.life2 .life2-debt { font-size:11px; line-height:14px; color:#c3dce5; }
.life2 [data-debt-state=owing] .life2-debt { color:#ffbac6; font-weight:800; }
.life2 .life2-stats { display:flex; align-items:center; gap:4px; font-size:11px; line-height:14px; white-space:nowrap; }
/* Flex children get real line boxes instead of inline font-metric rectangles. */
.life2 .life2-stamina { display:flex; align-items:center; gap:3px; height:14px; line-height:14px; }
.life2 .life2-stamina > span { display:block; height:100%; line-height:inherit; }
.life2 .life2-battery { display:flex; gap:2px; width:30px; height:10px; padding:1px 4px 1px 1px;
  border:1px solid #a4c9d3; border-radius:2px; position:relative; flex:none; }
.life2 .life2-battery::after { content:''; position:absolute; right:1px; top:2px; width:2px; height:4px; background:#a4c9d3; }
.life2 .life2-battery-cell { min-width:0; flex:1 1 0; background:#385d70; }
.life2 .life2-battery-cell[data-filled] { background:#78e0b0; }
.life2 .life2-grades { grid-row:2; grid-column:2 / 4; align-self:stretch;
  display:grid; grid-template-columns:repeat(5,minmax(0,1fr)); gap:2px; }
.life2 .life2-grade { display:grid; justify-content:center; align-items:center;
  grid-template-columns:max-content max-content; grid-template-rows:13px 4px; gap:1px 1px;
  border:1px solid #477080; border-radius:4px; background:#102b40; font-size:11px; line-height:13px; }
.life2 .life2-grade[hidden] { display:none; }
.life2 .life2-grade-name,.life2 .life2-grade-short { grid-column:1; grid-row:1; }
.life2 .life2-grade-short { display:none; }
/* The letter spans both rows; the gauge sits below the name, never below the glyph.
   18px contains 14px system letters, and 20px contains 16px letters on desktop. */
.life2 .life2-grade-letter { grid-column:2; grid-row:1 / 3; height:18px;
  font-size:14px; line-height:18px; font-weight:700; color:var(--grade-colour); }
.life2 .life2-grade-gauge { grid-column:1; grid-row:2; width:100%; height:4px;
  border-radius:2px; background:linear-gradient(to right,var(--grade-colour) var(--grade-progress),#648094 var(--grade-progress)); }
.life2 .life2-hud-footer { grid-area:route; display:flex; align-items:center; gap:8px; }
.life2 .life2-hud-status { flex:none; padding:0 4px; border-radius:4px; background:#2b5265; color:#e9f6fa; white-space:nowrap; }
.life2 [data-pick-prompt] { background:#e9dbff; color:#46216f; line-height:12px; }
.life2 .life2-progress { flex:1; position:relative; height:30px; container:life-route / inline-size;
  font-size:11px; line-height:12px; }
.life2 .life2-progress-track { position:absolute; top:5px; left:0; right:0; height:8px;
  display:flex; border-radius:4px; background:#496579; }
.life2 .life2-progress-segment { height:100%; box-shadow:inset -1px 0 #16394a; }
.life2 .life2-progress-segment:first-child { border-radius:4px 0 0 4px; }
.life2 .life2-progress-segment:last-child { border-radius:0 4px 4px 0; }
.life2 .life2-progress-tick { position:absolute; top:4px; width:2px; height:10px; background:#e9f6fa; }
.life2 .life2-progress-label { position:absolute; top:18px; line-height:12px; white-space:nowrap;
  transform:translateX(-50%); color:#e9f6fa; }
.life2 .life2-progress-label[data-route-end=start] { transform:none; }
.life2 .life2-progress-label[data-route-end=end] { transform:translateX(-100%); }
.life2 .life2-progress-drone { position:absolute; top:0; width:28px; height:18px;
  left:clamp(0px,calc(var(--life-progress) - 14px),calc(100% - 28px)); }
/* Tick positions stay exact. Only labels that would crowd neighbours disappear. */
@container life-route (max-width:359px) { .life2 .life2-progress-label[data-age="60"] { display:none; } }
@container life-route (max-width:189px) { .life2 .life2-progress-label[data-age="55"] { display:none; } }
@container life-route (max-width:109px) { .life2 .life2-progress-label[data-age="35"] { display:none; } }
.life2 .life2-change-strip { display:none; font-size:11px; line-height:12px; white-space:nowrap; color:#e9f6fa; }
.life2 .life2-player-card[data-hud-delta] .life2-funds { grid-row:1 / 3; grid-template-rows:16px 12px 24px; }
.life2 .life2-player-card[data-hud-delta] .life2-debt { line-height:12px; }
.life2 .life2-player-card[data-hud-delta] .life2-change-strip { display:grid; grid-template-rows:12px 12px; }
.life2 .life2-player-card[data-hud-delta] .life2-grades { grid-column:2; }
.life2 .life2-player-card[data-hud-delta] .life2-grade-name { display:none; }
.life2 .life2-player-card[data-hud-delta] .life2-grade-short { display:block; }
.life2 .life2-hud [data-changed-stat][data-direction=down] { color:#ffbac6; }
.life2 .life2-hud [data-tone=good] { --hud-change-ink:#8cf0bf; --hud-change-bg:#123e34; }
.life2 .life2-hud [data-tone=bad] { --hud-change-ink:#ffc0cf; --hud-change-bg:#55283d; }
.life2 .life2-hud [data-changed-stat][data-tone] { color:var(--hud-change-ink); --hud-glow-ink:var(--hud-change-ink); }
.life2 .life2-change-strip > span { justify-self:end; padding:0 3px; border-radius:3px;
  color:var(--hud-change-ink); background:var(--hud-change-bg); box-shadow:inset 0 0 0 1px var(--hud-change-ink); }
/* Keep the navy background and readable inks throughout change feedback. */
.life2 .life2-hud [data-changed-stat] { animation-name:life2-hud-glow; }
@keyframes life2-hud-glow { from { box-shadow:inset 0 0 0 2px var(--hud-glow-ink,#ffdc68); } to { box-shadow:inset 0 0 0 0 transparent; } }
/* UX5b owns this future row. The empty slot must consume no space or gap. */
.life2 .life2-hud-cards[hidden] { display:none; }
.life2 .life2-options[data-single-page] { grid-template-rows:18px minmax(0,1fr); }
.life2 .life2-pager[hidden] { display:none; }
@media (max-width:899px) and (max-height:739px) {
  .life2 .life2-shell { --life2-hud-height:60px; grid-template-rows:60px minmax(0,1fr) 104px 44px; }
  /* 60 = 2 border + 4 padding + 54 player; the right column is 24 date + 30 route.
     During pick it is 12 date + (12 prompt + 30 route). No vertical gap.
     At 500x679 the unchanged board row is 437px: (437 - 16) / 9 = 46.78px tiles. */
  .life2 .life2-hud { padding:2px 8px; gap:0 8px;
    grid-template:'player date' 24px 'player route' 30px / minmax(0,1fr) clamp(176px,36vw,216px); }
  .life2 .life2-hud:has([data-pick-prompt]) { grid-template-rows:12px 42px; }
  .life2 .life2-date { height:24px; display:grid; grid-template:'calendar season' 12px 'map status' 12px / auto auto; gap:0 4px; }
  .life2 .life2-date h1 { grid-area:calendar; font-size:11px; line-height:12px; }
  .life2 .life2-hud-map { grid-area:map; }
  .life2 .life2-hud-season { grid-area:season; }
  .life2 .life2-date .life2-hud-status { grid-area:status; justify-self:end; }
  .life2 .life2-hud:has([data-pick-prompt]) .life2-date { height:12px; grid-template-rows:12px; }
  .life2 .life2-hud:has([data-pick-prompt]) .life2-hud-map { display:none; }
  .life2 .life2-player-card { grid-template-columns:28px minmax(0,1fr) auto; column-gap:4px; }
  .life2 .life2-hud-avatar { width:28px; height:28px; }
  .life2 .life2-stamina-word,.life2 .life2-grade-name { display:none; }
  .life2 .life2-grade-short { display:block; }
  .life2 .life2-money { font-size:11px; letter-spacing:0; }
  .life2 .life2-credit-coin { width:12px; height:12px; }
  .life2 .life2-coin-chip { gap:2px; padding:0 2px; }
  .life2 .life2-grades { grid-column:2; }
  .life2 .life2-hud-footer { display:grid; grid-template-rows:30px; gap:0; align-items:stretch; }
  .life2 .life2-hud-footer:has([data-pick-prompt]) { grid-template-rows:12px 30px; }
  .life2 [data-pick-prompt] { justify-self:start; }
  .life2 .life2-options,.life2 .life2-options[data-single-page] {
    padding:5px; gap:4px;
    grid-template:'heading pager' 44px 'choices choices' minmax(0,1fr) / minmax(0,1fr) auto;
  }
  .life2 .life2-options > h2 { grid-area:heading; align-self:center; }
  .life2 .life2-option-list { grid-area:choices; }
  .life2 .life2-pager { grid-area:pager; gap:4px; font-size:11px; }
  .life2 .life2-pager button { padding:0 6px; }
}
@media (max-width:${COMPACT_HUD_MAX.width}px) and (max-height:${COMPACT_HUD_MAX.height}px) {
  /* Keep 60px: 2 border + 4 padding + 54 content. At 320px the inner width
     is 302 = 226 player + 2 gap + 74 calendar/route. The player has 114px
     for rank/stamina/five grades + 2 gap + 110 funds (including deltas).
     At 360px those widths are 342 / 266 / 154; each grade is 30px wide.
     11px system money at 9,000,000 needs 91.38 + 12 coin + 2 gap + 4 padding.
     The existing app resize handler renders the compact DOM placement again. */
  .life2 .life2-hud,.life2 .life2-hud:has([data-pick-prompt]) {
    padding:2px; gap:0 2px;
    grid-template:'player date' 24px 'player route' 30px / minmax(0,1fr) 74px;
  }
  .life2 .life2-date,.life2 .life2-hud:has([data-pick-prompt]) .life2-date {
    height:24px; grid-template:'calendar' 12px 'season' 12px / minmax(0,1fr); gap:0;
  }
  .life2 .life2-hud-map { display:none; }
  .life2 .life2-hud-season { margin-left:0; }
  .life2 .life2-player-card {
    padding:1px 0; grid-template-columns:minmax(0,1fr) 110px;
    grid-template-rows:16px 14px 20px; gap:1px 2px;
  }
  .life2 .life2-hud-identity { display:contents; }
  .life2 .life2-hud-rank { grid-column:1; grid-row:1; gap:2px; }
  .life2 .life2-hud-avatar { flex:none; width:16px; height:16px; }
  .life2 .life2-rank-pill,.life2 .life2-money { font-weight:700; }
  .life2 .life2-rank-pill { padding:0 2px; }
  .life2 .life2-stats { grid-column:1; grid-row:2; gap:2px; }
  .life2 .life2-hud-status { margin-left:auto; padding:0 1px; }
  .life2 .life2-funds,.life2 .life2-player-card[data-hud-delta] .life2-funds {
    grid-column:2; grid-row:1 / 4; align-self:start;
  }
  .life2 .life2-grades,.life2 .life2-player-card[data-hud-delta] .life2-grades {
    grid-column:1; grid-row:3; gap:1px;
  }
  .life2 .life2-grade-letter { font-size:12px; }
  .life2 .life2-hud-footer { grid-template-rows:30px; }
  /* At 74px only the 35-year label fits. Keep its tick and the full-size drone. */
  .life2 .life2-progress-label[data-route-end] { display:none; }
  .life2 .life2-progress-label[data-age="35"] { display:block; }
}
@media (min-width:900px) {
  .life2 .life2-shell { grid-template-rows:138px minmax(0,1fr) 44px;
    grid-template-columns:minmax(0,1fr) clamp(380px,40vw,480px); }
  /* 138 = 2 border + 12 padding + 8 gaps + 16 date + 64 player + 36 route. */
  .life2 .life2-hud { padding:6px 10px; gap:4px; grid-template-rows:16px 64px 36px; font-size:12px; line-height:14px; }
  .life2 .life2-date h1 { font-size:14px; line-height:16px; }
  .life2 .life2-date > span { font-size:12px; line-height:16px; }
  .life2 .life2-player-card { padding:2px 4px; grid-template-columns:56px minmax(0,1fr) auto; grid-template-rows:36px 22px; }
  .life2 .life2-hud-avatar { width:56px; height:56px; }
  .life2 .life2-hud-identity { grid-template-rows:16px 16px; gap:4px; }
  .life2 .life2-rank-pill { line-height:16px; }
  .life2 .life2-funds { grid-template-rows:22px 14px; }
  .life2 .life2-coin-chip { height:22px; }
  .life2 .life2-credit-coin { width:18px; height:18px; }
  .life2 .life2-money { font-size:18px; line-height:22px; }
  .life2 .life2-debt,.life2 .life2-stats { font-size:12px; line-height:14px; }
  .life2 .life2-stamina { height:16px; line-height:16px; }
  .life2 .life2-grade { grid-template-rows:15px 4px; font-size:12px; line-height:15px; }
  .life2 .life2-grade-letter { height:20px; font-size:16px; line-height:20px; }
  .life2 .life2-progress { height:36px; font-size:12px; line-height:14px; }
  .life2 .life2-progress-track { height:10px; }
  .life2 .life2-progress-tick { height:12px; }
  .life2 .life2-progress-label { top:22px; line-height:14px; }
  .life2 .life2-progress-drone { width:32px; height:20px; left:clamp(0px,calc(var(--life-progress) - 16px),calc(100% - 32px)); }
  .life2 [data-pick-prompt] { line-height:16px; }
  .life2 .life2-player-card[data-hud-delta] .life2-funds { grid-template-rows:19px 14px 27px; }
  .life2 .life2-player-card[data-hud-delta] .life2-coin-chip { height:19px; }
  .life2 .life2-player-card[data-hud-delta] .life2-money { line-height:19px; }
  .life2 .life2-player-card[data-hud-delta] .life2-debt { line-height:14px; }
  .life2 .life2-player-card[data-hud-delta] .life2-change-strip { grid-template-rows:13px 13px; row-gap:1px; font-size:12px; line-height:13px; }
}
`;
export function hud(state: GameState, view: Derived, offered: OptionView[], choose: (id: string) => void,
  open?: (menu: 'my-life' | 'phone') => void, before?: GameState) {
  const compact = typeof window !== 'undefined'
    && window.innerWidth <= COMPACT_HUD_MAX.width && window.innerHeight <= COMPACT_HUD_MAX.height;
  const changes = before ? statChanges(before, state) : [];
  const mark = (cell: HTMLElement, stat: string, label = cell.textContent ?? '') => {
    cell.setAttribute('role', 'group');
    const change = changes.find(row => row.stat === stat);
    if (change) { cell.dataset.changedStat = stat; cell.dataset.direction = change.direction;
      if ((stat === 'money' || stat === 'debt') && change.direction)
        cell.dataset.tone = fundsChangeTone(stat, change.direction);
      cell.setAttribute('aria-label', `${label} · ${change.label} ${change.value}`); }
    else cell.setAttribute('aria-label', label);
    return cell;
  };
  const current = WORLD.find(node => node.id === state.board.pos)!;
  const progress = lifeProgress(state.turn);
  const starting = offered.some(option => option.id.startsWith('start:'));
  const picking = offered.some(option => option.id.startsWith('go:'));
  const top = el('header', 'life2-hud');
  const date = el('div', 'life2-date');
  const season = el('span', 'life2-hud-season', `계절 ${progress.season}/${progress.total}`);
  season.dataset.hudSeason = '';
  date.append(el('h1', '', view.dateLabel), el('span', 'life2-hud-map', MAPS[current.map].name), season);
  const player = el('div', 'life2-player-card'); player.dataset.hudPlayer = '';
  const identity = el('div', 'life2-hud-identity');
  const rank = el('div', 'life2-hud-rank');
  rank.append(el('span', 'life2-pilot-name', '파일럿'),
    el('strong', 'life2-rank-pill', starting ? '진로 선택 전' : view.rankName || view.stageName));
  const stats = el('div', 'life2-stats');
  const staminaText = `체력 ${state.s.stamina}/${view.capStamina}`;
  const battery = el('span', 'life2-battery'); battery.setAttribute('aria-hidden', 'true');
  for (let index = 0; index < 5; index++) {
    const segment = el('span', 'life2-battery-cell');
    if (state.s.stamina > index * view.capStamina / 5) segment.dataset.filled = '';
    battery.append(segment);
  }
  const stamina = el('span', 'life2-stamina');
  stamina.append(el('span', 'life2-stamina-word', '체력 '), el('span', '', `${state.s.stamina}/${view.capStamina}`));
  stats.append(mark(stamina, 'stamina', staminaText), battery);
  identity.append(rank, stats);
  const funds = el('div', 'life2-funds'); funds.dataset.debtState = state.s.debt > 0 ? 'owing' : 'clear';
  const coin = el('div', 'life2-coin-chip');
  coin.append(creditCoin(), mark(el('strong', 'life2-money', `자금 ${state.s.money.toLocaleString('ko-KR')}만`), 'money'));
  const ticks = el('div', 'life2-change-strip'); ticks.setAttribute('aria-live', 'polite');
  const changed = changes.filter(row => ['money', 'debt'].includes(row.stat!));
  if (changed.length) player.dataset.hudDelta = '';
  for (const row of changed) {
    if (row.stat !== 'money' && row.stat !== 'debt') continue;
    const delta = state.s[row.stat] - before!.s[row.stat];
    const tick = el('span', '', `${row.label} ${delta > 0 ? '+' : ''}${delta}만`);
    const direction = delta > 0 ? 'up' : 'down';
    tick.dataset.direction = direction;
    tick.dataset.tone = fundsChangeTone(row.stat, direction);
    tick.dataset.hudDeltaStat = row.stat; ticks.append(tick);
  }
  funds.append(coin, mark(el('span', 'life2-debt', `빚 ${state.s.debt.toLocaleString('ko-KR')}만`), 'debt'), ticks);
  const status = el('span', 'life2-hud-status', picking ? COPY.pickDestination : starting ? '진로 선택 전' : view.period);
  if (picking) { status.dataset.pickPrompt = ''; status.setAttribute('role', 'status'); }
  const grades = el('div', 'life2-grades'); grades.setAttribute('role', 'group'); grades.setAttribute('aria-label', '능력치 등급');
  for (const stat of GRADED_STATS) {
    const { letter, from, next } = grade(stat, state.s[stat])!;
    const cell = el('span', 'life2-grade'); cell.dataset.grade = stat;
    // UX1 shows five career grades. Preserve the other shared grade hooks;
    // their visible details remain in My Life, without a second HUD row.
    const names = HUD_GRADE_NAMES[stat as keyof typeof HUD_GRADE_NAMES];
    cell.hidden = !names;
    cell.setAttribute('role', 'group');
    cell.style.setProperty('--grade-colour', GRADE_COLOURS[letter]);
    const gauge = el('span', 'life2-grade-gauge'); gauge.setAttribute('aria-hidden', 'true');
    const filled = next === null ? 100 : Math.max(0, Math.min(100, (state.s[stat] - from) * 100 / (next - from)));
    gauge.style.setProperty('--grade-progress', `${filled}%`);
    const shortName = el('span', 'life2-grade-short', names?.short ?? STAT_LABEL[stat]);
    shortName.setAttribute('aria-hidden', 'true');
    cell.append(el('span', 'life2-grade-name', names?.full ?? STAT_LABEL[stat]), shortName,
      el('b', 'life2-grade-letter', letter), gauge);
    const label = `${STAT_LABEL[stat]} ${letter}등급`;
    if (cell.hidden) cell.setAttribute('aria-label', label);
    else mark(cell, stat, label);
    grades.append(cell);
  }
  const avatar = pilotAvatar();
  if (compact) rank.insertBefore(avatar, rank.firstElementChild);
  else player.append(avatar);
  player.append(identity, funds, grades);
  const timeline = el('div', 'life2-progress'); timeline.dataset.hudProgress = '';
  timeline.setAttribute('role', 'progressbar'); timeline.setAttribute('aria-label', '인생 항로');
  timeline.setAttribute('aria-valuemin', '0'); timeline.setAttribute('aria-valuemax', String(progress.total));
  timeline.setAttribute('aria-valuenow', String(progress.completed));
  timeline.setAttribute('aria-valuetext', `${view.dateLabel} · ${progress.completed}/${progress.total}계절 완료`);
  const track = el('div', 'life2-progress-track'); track.setAttribute('aria-hidden', 'true');
  timeline.style.setProperty('--life-progress', `${progress.percent}%`);
  for (const part of LIFE_ROUTE_SEGMENTS) {
    const segment = el('span', 'life2-progress-segment');
    segment.style.width = `${part.to - part.from}%`; segment.style.backgroundColor = part.colour;
    track.append(segment);
  }
  timeline.append(track);
  for (const milestone of LIFE_MILESTONES) {
    const tick = el('span', 'life2-progress-tick'); tick.setAttribute('aria-hidden', 'true');
    tick.style.left = `${milestone.percent}%`;
    const label = el('span', 'life2-progress-label', `${milestone.age}세`);
    label.dataset.age = String(milestone.age); label.style.left = `${milestone.percent}%`;
    timeline.append(tick, label);
  }
  for (const [end, age, percent] of [['start', progress.startAge, 0], ['end', progress.endAge, 100]] as const) {
    const label = el('span', 'life2-progress-label', `${age}세`);
    label.dataset.routeEnd = end; label.style.left = `${percent}%`; timeline.append(label);
  }
  timeline.append(progressDrone());
  const footer = el('div', 'life2-hud-footer');
  if (compact) {
    status.setAttribute('role', picking ? 'status' : 'group');
    status.setAttribute('aria-label', status.textContent!);
    status.title = status.textContent!;
    status.textContent = picking ? '도착칸' : starting ? '진로' : view.period;
    stats.append(status);
  } else if (picking) footer.append(status); else date.insertBefore(status, season);
  footer.append(timeline);
  const cards = el('div', 'life2-hud-cards'); cards.dataset.hudSlot = 'cards'; cards.hidden = true;
  top.append(el('style', '', HUD_STYLE), date, player, footer, cards);
  const bottom = el('footer', 'life2-bottom');
  // Navigation opens presentation views; engine options still own every service.
  for (const [name, nav] of [['내 인생', 'life'], ['휴대폰', 'phone']]) {
    const reserved = button(name, 'life2-reserved', () => open?.(nav === 'life' ? 'my-life' : 'phone'));
    reserved.disabled = !open;
    reserved.dataset.nav = nav;
    bottom.append(reserved);
  }
  const spin = offered.find(option => option.id === 'spin');
  const center = spin ? button(spin.title, 'life2-spin', () => choose(spin.id))
    : el('output', 'life2-dice', diceDisplay(state.board.dice).text);
  if (spin) { center.dataset.option = spin.id; (center as HTMLButtonElement).disabled = !spin.enabled; }
  else center.setAttribute('aria-label', diceDisplay(state.board.dice).label);
  bottom.insertBefore(center, bottom.lastChild);
  return { top, bottom };
}
