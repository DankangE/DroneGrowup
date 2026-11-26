import { grade, GRADED_STATS } from '../life/grades.ts';
import { STAT_LABEL } from '../life/life-data.ts';
import type { Derived, OptionView } from '../life/engine.ts';
import type { GameState } from '../life/types.ts';
import { MAPS, WORLD } from '../life/world.ts';
import { statChanges } from './popups/polish-model.ts';
import { COPY } from './popups/data.ts';
import { button, el } from '../ui/dom.ts';
import { lifeProgress, LIFE_MILESTONES } from './hud-model.ts';
import { pilotAvatar, progressDrone } from './hud-art.ts';

export const HUD_STYLE = `
.life2 .life2-shell { grid-template-rows:110px minmax(0,1fr) clamp(50px,18dvh,136px) 44px; }
.life2 .life2-bottom { position:relative; z-index:11; }
/* 110px = 2 border + 8 padding + 8 gaps + 14 + 34 + 18 + 12 + 14.
   Fixed rows include every line box; no overflow clipping or shrinking text. */
.life2 .life2-hud {
  grid-template-rows:14px 34px 18px 12px 14px; grid-template-columns:minmax(0,1fr);
  gap:2px; padding:4px 8px; color:#234554; background:#f7fbf8;
  border-color:#657d87; border-radius:12px; box-shadow:0 2px 0 #9aafb5;
  font-size:11px; line-height:14px; font-variant-numeric:tabular-nums;
}
.life2 .life2-hud :is(div,span,h1,strong) { min-width:0; }
.life2 .life2-date { display:flex; align-items:center; gap:6px; white-space:nowrap; }
.life2 .life2-date h1 { font-size:12px; line-height:14px; letter-spacing:0; }
.life2 .life2-date > span { font-size:11px; line-height:14px; }
.life2 .life2-hud-season { margin-left:auto; color:#526974; }
.life2 .life2-player-card {
  display:grid; grid-template-columns:32px minmax(0,1fr) auto; align-items:center; gap:6px;
  border-radius:8px; background:#eaf2f2;
}
.life2 .life2-hud-avatar { width:32px; height:32px; }
.life2 .life2-hud-identity { display:grid; grid-template-rows:16px 14px; gap:2px; }
.life2 .life2-hud-rank { display:flex; align-items:center; gap:4px; white-space:nowrap; }
.life2 .life2-pilot-name { font-size:11px; color:#526974; }
.life2 .life2-rank-pill { padding:0 5px; border-radius:5px; background:#f3dcc8; color:#70472f; line-height:16px; }
.life2 .life2-funds { display:grid; grid-template-rows:18px 14px; text-align:right; padding-right:4px; white-space:nowrap; }
.life2 .life2-money { font-size:16px; line-height:18px; letter-spacing:-.025em; }
.life2 .life2-debt { font-size:11px; line-height:14px; color:#526974; }
.life2 [data-debt-state=owing] .life2-debt { color:#9b323b; font-weight:800; }
.life2 .life2-stats { display:flex; align-items:center; gap:5px; font-size:11px; line-height:14px; white-space:nowrap; }
.life2 .life2-battery { display:flex; gap:2px; width:32px; height:10px; padding:1px 3px 1px 1px;
  border:1px solid #527778; border-radius:2px; position:relative; flex:none; }
.life2 .life2-battery::after { content:''; position:absolute; right:-3px; top:2px; width:2px; height:4px; background:#527778; }
.life2 .life2-battery-cell { flex:1; background:#c7d7d7; }
.life2 .life2-battery-cell[data-filled] { background:#447f78; }
.life2 .life2-grades { display:grid; grid-template-columns:repeat(5,minmax(0,1fr)); gap:4px; }
.life2 .life2-grade { display:flex; justify-content:center; align-items:start; gap:5px; position:relative;
  border:1px solid #bdcdd2; border-radius:5px; background:#fffdf6; font-size:11px; line-height:13px; }
.life2 .life2-grade[hidden] { display:none; }
.life2 .life2-grade-letter { font-size:13px; line-height:13px; color:#39586f; }
.life2 .life2-grade-gauge { position:absolute; left:4px; right:4px; bottom:1px; height:2px;
  border-radius:2px; background:linear-gradient(to right,#527f90 var(--grade-progress),#dce6e8 var(--grade-progress)); }
.life2 .life2-progress { display:grid; grid-template-columns:auto minmax(0,1fr) auto; align-items:center; gap:5px;
  font-size:11px; line-height:12px; }
.life2 .life2-progress-track { position:relative; height:12px;
  background:linear-gradient(to right,#527f90 var(--life-progress),#cddcde var(--life-progress)) center / 100% 4px no-repeat; }
.life2 .life2-progress-tick { position:absolute; top:2px; width:1px; height:8px; background:#809ba6; }
.life2 .life2-progress-drone { position:absolute; top:0; width:18px; height:12px;
  left:clamp(0px,calc(var(--life-progress) - 9px),calc(100% - 18px)); }
.life2 .life2-hud-footer { display:flex; align-items:center; justify-content:space-between; gap:6px; }
.life2 .life2-hud-status { padding:0 5px; border-radius:7px; background:#e4edef; white-space:nowrap; }
.life2 [data-pick-prompt] { background:#e6dcf1; color:#563a7b; }
.life2 .life2-change-strip { height:14px; font-size:11px; line-height:14px; white-space:nowrap; }
/* UX5b reserved: up to three chips with >=44px targets. Allocate a row in that
   ticket; the empty hidden slot must consume neither space nor a grid gap. */
.life2 .life2-hud-cards[hidden] { display:none; }
.life2 .life2-options[data-single-page] { grid-template-rows:18px minmax(0,1fr); }
.life2 .life2-pager[hidden] { display:none; }
/* Short screens: the visible heading shares a 44px row with the pager;
   the single choice gets the full width and another 44px row.
   Options = 2px border + 10px padding + 4px gap + 44px + 44px = 104px.
   At 500x679: 16px app padding + 60px HUD + 437px board + 104px options
   + 44px nav + 18px gaps. The board cell is (437 - 16) / 9 = 46.78px.
   Detailed abilities remain in My Life. No clipped, 1px heading: its wrapped
   text can otherwise enlarge the root's scrollable overflow despite clip-path. */
@media (max-width:899px) and (max-height:739px) {
  .life2 .life2-shell { --life2-hud-height:60px; grid-template-rows:60px minmax(0,1fr) 104px 44px; }
  /* 60px = 2 border + 4 padding + 12 metadata + 30 player + 12 progress.
     The status shares the progress row, so the destination prompt stays visible. */
  .life2 .life2-hud { padding:2px 8px; gap:0 8px;
    grid-template:'date date' 12px 'player player' 30px 'status progress' 12px / auto minmax(0,1fr); }
  .life2 .life2-date { grid-area:date; }
  .life2 .life2-date h1,.life2 .life2-date > span { font-size:11px; line-height:12px; }
  .life2 .life2-player-card { grid-area:player; grid-template-columns:28px minmax(0,1fr) auto; }
  .life2 .life2-hud-avatar { width:28px; height:28px; }
  .life2 .life2-hud-identity { gap:0; }
  .life2 .life2-pilot-name { display:none; }
  .life2 .life2-funds { grid-template-rows:18px 12px; }
  .life2 .life2-debt { line-height:12px; }
  .life2 .life2-grades,.life2 .life2-change-strip { display:none; }
  .life2 .life2-hud-footer { display:contents; }
  .life2 .life2-hud-status { grid-area:status; line-height:12px; }
  .life2 .life2-progress { grid-area:progress; }
  .life2 .life2-options,.life2 .life2-options[data-single-page] {
    padding:5px; gap:4px;
    grid-template:'heading pager' 44px 'choices choices' minmax(0,1fr) / minmax(0,1fr) auto;
  }
  .life2 .life2-options > h2 { grid-area:heading; align-self:center; }
  .life2 .life2-option-list { grid-area:choices; }
  .life2 .life2-pager { grid-area:pager; gap:4px; font-size:11px; }
  .life2 .life2-pager button { padding:0 6px; }
}
@media (min-width:900px) {
  .life2 .life2-shell { grid-template-rows:138px minmax(0,1fr) 44px; }
  /* 138px = 2 border + 12 padding + 16 gaps + 14 + 44 + 22 + 14 + 14. */
  .life2 .life2-hud { padding:6px 10px; gap:4px; grid-template-rows:14px 44px 22px 14px 14px; }
  .life2 .life2-player-card { grid-template-columns:42px minmax(0,1fr) auto; }
  .life2 .life2-hud-avatar { width:42px; height:42px; }
  .life2 .life2-hud-identity { grid-template-rows:18px 14px; gap:4px; }
  .life2 .life2-rank-pill { line-height:18px; }
  .life2 .life2-funds { grid-template-rows:24px 14px; }
  .life2 .life2-money { font-size:18px; line-height:24px; }
  .life2 .life2-grade { line-height:16px; }
  .life2 .life2-grade-letter { font-size:15px; line-height:16px; }
}
`;
const GRADE_NAMES = { skill: '조종', xp: '경험', teach: '교육', biz: '사업', support: '지지' };

export function hud(state: GameState, view: Derived, offered: OptionView[], choose: (id: string) => void,
  open?: (menu: 'my-life' | 'phone') => void, before?: GameState) {
  const changes = before ? statChanges(before, state) : [];
  const mark = (cell: HTMLElement, stat: string, label = cell.textContent ?? '') => {
    const change = changes.find(row => row.stat === stat);
    if (change) { cell.dataset.changedStat = stat; cell.dataset.direction = change.direction;
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
  stats.append(mark(el('span', '', staminaText), 'stamina'), battery);
  identity.append(rank, stats);
  const funds = el('div', 'life2-funds'); funds.dataset.debtState = state.s.debt > 0 ? 'owing' : 'clear';
  funds.append(mark(el('strong', 'life2-money', `자금 ${state.s.money.toLocaleString('ko-KR')}만`), 'money'),
    mark(el('span', 'life2-debt', `빚 ${state.s.debt.toLocaleString('ko-KR')}만`), 'debt'));
  player.append(pilotAvatar(), identity, funds);
  const status = el('span', 'life2-hud-status', picking ? COPY.pickDestination : starting ? '진로 선택 전' : view.period);
  if (picking) { status.dataset.pickPrompt = ''; status.setAttribute('role', 'status'); }
  const grades = el('div', 'life2-grades'); grades.setAttribute('aria-label', '능력치 등급');
  for (const stat of GRADED_STATS) {
    const { letter, from, next } = grade(stat, state.s[stat])!;
    const cell = el('span', 'life2-grade'); cell.dataset.grade = stat;
    // UX1 shows five career grades. Preserve the other shared grade hooks;
    // their visible details remain in My Life, without a second HUD row.
    cell.hidden = !(stat in GRADE_NAMES);
    const gauge = el('span', 'life2-grade-gauge'); gauge.setAttribute('aria-hidden', 'true');
    const filled = next === null ? 100 : Math.max(0, Math.min(100, (state.s[stat] - from) * 100 / (next - from)));
    gauge.style.setProperty('--grade-progress', `${filled}%`);
    cell.append(el('span', '', GRADE_NAMES[stat as keyof typeof GRADE_NAMES] ?? STAT_LABEL[stat]),
      el('b', 'life2-grade-letter', letter), gauge);
    grades.append(mark(cell, stat, `${STAT_LABEL[stat]} ${letter}등급`));
  }
  const timeline = el('div', 'life2-progress'); timeline.dataset.hudProgress = '';
  timeline.setAttribute('role', 'progressbar'); timeline.setAttribute('aria-label', '인생 항로');
  timeline.setAttribute('aria-valuemin', '0'); timeline.setAttribute('aria-valuemax', String(progress.total));
  timeline.setAttribute('aria-valuenow', String(progress.completed));
  timeline.setAttribute('aria-valuetext', `${view.dateLabel} · ${progress.completed}/${progress.total}계절 완료`);
  const track = el('div', 'life2-progress-track'); track.setAttribute('aria-hidden', 'true');
  track.style.setProperty('--life-progress', `${progress.percent}%`);
  for (const milestone of LIFE_MILESTONES) {
    const tick = el('span', 'life2-progress-tick'); tick.title = `${milestone.age}세`;
    tick.style.left = `${milestone.percent}%`; track.append(tick);
  }
  track.append(progressDrone());
  timeline.append(el('span', '', `${progress.startAge}세`), track, el('span', '', `${progress.endAge}세`));
  const ticks = el('div', 'life2-change-strip'); ticks.setAttribute('aria-live', 'polite');
  const changed = changes.filter(row => ['money', 'debt'].includes(row.stat!));
  ticks.textContent = changed.map(row => { const delta = state.s[row.stat!] - before!.s[row.stat!];
    return `${row.label} ${delta > 0 ? '+' : ''}${delta}만`; }).join(' · ');
  const footer = el('div', 'life2-hud-footer'); footer.append(status, ticks);
  const cards = el('div', 'life2-hud-cards'); cards.dataset.hudSlot = 'cards'; cards.hidden = true;
  top.append(el('style', '', HUD_STYLE), date, player, grades, timeline, footer, cards);
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
    : el('output', 'life2-dice', state.board.dice.join(' · ') || '— · —');
  if (spin) { center.dataset.option = spin.id; (center as HTMLButtonElement).disabled = !spin.enabled; }
  else center.setAttribute('aria-label', `룰렛 ${state.board.dice.join(', ')}`);
  bottom.insertBefore(center, bottom.lastChild);
  return { top, bottom };
}
