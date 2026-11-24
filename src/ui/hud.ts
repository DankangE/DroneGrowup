import { ITEMS, RULES, STAT_LABEL } from '../game/data.ts';
import { derived, num } from '../game/engine.ts';
import type { GameState, ItemKind, Stat, UpkeepLine } from '../game/types.ts';
import { button, el, meter } from './dom.ts';
import { icon } from './icons.ts';

const moneyStats = new Set<Stat>(['money', 'debt', 'value']);
export const statValue = (stat: Stat, value: number) => `${num(value)}${moneyStats.has(stat) ? '만원' : stat === 'cond' || stat === 'support' ? '%' : ''}`;
export const signed = (value: number) => `${value > 0 ? '+' : ''}${num(value)}`;

export function upkeepList(lines: UpkeepLine[], total: number): HTMLElement {
  const list = el('dl', 'upkeep-list');
  for (const line of lines) {
    const row = el('div');
    row.append(el('dt', '', line.label), el('dd', line.amount >= 0 ? 'positive' : 'negative', `${signed(line.amount)}만원`));
    list.append(row);
  }
  const sum = el('div', 'upkeep-total');
  sum.append(el('dt', '', '합계'), el('dd', total >= 0 ? 'positive' : 'negative', `${signed(total)}만원`));
  list.append(sum);
  return list;
}

export function statDetails(state: GameState): HTMLElement {
  const d = derived(state);
  const detail = el('div', 'stat-details');
  detail.append(el('h3', 'subheading', '나의 비행 기록'));
  const stats = el('dl', 'full-stats');
  for (const stat of Object.keys(STAT_LABEL) as Stat[]) {
    if (state.s[stat] === 0) continue;
    const row = el('div');
    row.append(el('dt', '', STAT_LABEL[stat]), el('dd', '', statValue(stat, state.s[stat])));
    stats.append(row);
  }
  const worth = el('div', 'net-worth');
  worth.append(el('dt', '', '순자산'), el('dd', '', `${num(d.netWorth)}만원`));
  stats.append(worth);
  detail.append(stats, el('h3', 'subheading', '다음 분기 예상 수입 · 지출'), upkeepList(d.upkeep.lines, d.upkeep.total));
  const log = el('ol', 'run-log');
  for (const entry of [...state.log].reverse()) {
    const item = el('li', `log-${entry.tone}`);
    item.append(el('span', 'log-turn', `${entry.turn + 1}번째 분기`), el('p', '', entry.text));
    log.append(item);
  }
  detail.append(el('h3', 'subheading', '최근 이야기'));
  detail.append(state.log.length ? log : el('p', 'muted', '아직 비행 일지가 비어 있어요. 첫 선택을 남겨 보세요.'));
  return detail;
}

export function createHud(state: GameState, onDetails: () => void): HTMLElement {
  const d = derived(state);
  const hud = el('section', 'hud');
  hud.setAttribute('aria-label', '파일럿 현황');
  const top = el('div', 'hud-top');
  const age = el('div', 'hud-age');
  age.append(el('strong', '', `${d.age}세`), el('span', '', `${d.quarter}분기`));
  const detailButton = button('상세', 'text-button', onDetails);
  detailButton.setAttribute('aria-haspopup', 'dialog');
  detailButton.dataset.action = 'details';
  detailButton.append(icon('arrow'));
  top.append(age, el('span', 'turns-left', `${d.turnsLeft}분기 남음`), detailButton);
  hud.append(top, meter(d.turnsLeft, RULES.maxTurns, `남은 시간 ${d.turnsLeft}분기`, 'career-meter'));
  const stage = el('div', 'hud-stage');
  stage.append(icon('drone'), el('strong', '', d.stageName));
  if (d.rankName) stage.append(el('span', 'badge', d.rankName));
  else stage.append(el('span', 'stage-note', state.stage === 'student' ? '꿈을 향한 첫걸음' : '나만의 비행 중'));
  const stats = el('div', 'hud-stats');
  const funds = el('div', 'hud-stat funds');
  funds.append(el('span', 'stat-label', '자금'), el('strong', '', `${num(state.s.money)}만원`));
  const debt = el('div', `hud-stat debt${state.s.debt >= d.creditLimit ? ' debt-warning' : ''}`);
  debt.append(el('span', 'stat-label', '빚 / 대출 한도'), el('strong', '', `${num(state.s.debt)} / ${num(d.creditLimit)}`), el('span', 'stat-unit', '만원'));
  const xp = el('div', 'hud-stat');
  xp.append(el('span', 'stat-label', '경험치'), el('strong', '', num(state.s.xp)));
  const rep = el('div', 'hud-stat');
  rep.append(el('span', 'stat-label', '평판'), el('strong', '', num(state.s.rep)));
  stats.append(funds, debt, xp, rep);
  const equipment = el('div', 'equipment');
  for (const kind of ['drone', 'gear', 'car'] as ItemKind[]) {
    const item = el('div', 'equipment-item');
    item.title = d.items[kind].name;
    item.setAttribute('aria-label', `${ITEMS[kind].label} ${d.items[kind].level}단계 · ${d.items[kind].name}`);
    item.append(icon(kind === 'drone' ? 'drone' : kind === 'car' ? 'car' : 'bag'), el('span', '', `${ITEMS[kind].label} ${d.items[kind].level}단계`));
    equipment.append(item);
  }
  const condition = el('div', `condition${state.s.drone > 0 && state.s.cond < RULES.flight.lowCond ? ' low-condition' : ''}`);
  condition.append(el('span', '', state.s.drone ? `기체 상태 ${state.s.cond}%` : '기체 미보유'), meter(state.s.drone ? state.s.cond : 0, 100, '기체 상태'));
  hud.append(stage, stats, equipment, condition);
  if (state.s.debt >= d.creditLimit || state.s.overdue > 0) {
    hud.append(el('p', 'debt-alert', `대출 한도에 주의하세요${state.s.overdue ? ` · 연체 ${state.s.overdue}/${RULES.overdueStrikes}` : ''}.`));
  }
  return hud;
}
