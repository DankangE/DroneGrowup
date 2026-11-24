import { PLACES } from '../game/data.ts';
import { num } from '../game/engine.ts';
import type { OptionView, PlaceId } from '../game/types.ts';
import { button, el, meter } from './dom.ts';
import { icon } from './icons.ts';

export function optionCard(option: OptionView, onChoose: (id: string) => void): HTMLElement {
  const card = el('article', `choice-card${option.enabled ? '' : ' is-locked'}${option.roll ? ' has-roll' : ''}`);
  const topline = el('div', 'card-topline');
  const timing = el('span', option.free ? 'badge free-badge' : 'card-timing', option.free ? '분기 소모 없음' : option.kind === 'event' ? '이벤트 선택' : '1분기 소모');
  const cost = el('span', 'card-cost', `비용 ${num(option.cost)}만원`);
  topline.append(timing, cost);
  const heading = el('h3', 'card-title', option.title);
  const desc = el('p', 'card-description', option.desc);
  card.append(topline, heading, desc);
  if (option.roll) {
    const odds = el('div', 'odds');
    const line = el('div', 'odds-heading');
    line.append(el('span', '', '도전 성공률'), el('strong', '', `성공 ${option.roll.chance}%`));
    odds.append(line, meter(option.roll.chance, 100, `성공 확률 ${option.roll.chance}%`));
    const outcomes = el('div', 'outcomes');
    const success = el('p', 'outcome success');
    success.append(el('span', 'outcome-label', '성공'), el('span', '', option.roll.success.summary));
    const fail = el('p', 'outcome failure');
    fail.append(el('span', 'outcome-label', '실패'), el('span', '', option.roll.fail.summary));
    outcomes.append(success, fail);
    card.append(odds, outcomes);
    if (option.roll.crashPct !== undefined) card.append(el('p', 'crash-risk', `실패 시 추락 위험 ${option.roll.crashPct}%`));
  } else if (option.sure) {
    const outcome = el('p', 'sure-outcome', option.sure.summary);
    outcome.prepend(icon('check'));
    card.append(outcome);
  }
  if (option.locks.length) {
    const locks = el('ul', 'locks');
    for (const reason of option.locks) locks.append(el('li', '', reason));
    card.append(locks);
  }
  const action = button(option.enabled ? (option.free ? '이용하기' : option.roll ? '도전하기' : '선택하기') : '조건 미충족', `choice-button${option.roll ? ' challenge-button' : ''}`, () => onChoose(option.id));
  action.dataset.option = option.id;
  action.disabled = !option.enabled;
  action.setAttribute('aria-label', `${option.title} · ${option.enabled ? (option.roll ? `성공 ${option.roll.chance}% · 도전하기` : '선택하기') : option.locks.join(' · ')}`);
  action.append(icon(option.enabled ? 'arrow' : 'lock'));
  card.append(action);
  return card;
}

export function groupedOptions(choices: OptionView[], onChoose: (id: string) => void): HTMLElement {
  const groups = el('div', 'choice-groups');
  const places = [...new Set(choices.map((choice) => choice.place))];
  for (const place of places) {
    const group = el('section', 'choice-group');
    const heading = el('h3', 'group-heading');
    heading.append(icon('flag'), el('span', '', PLACES[place].name));
    const list = choices.filter((choice) => choice.place === place);
    heading.append(el('span', 'group-count', String(list.length)));
    group.append(heading);
    for (const option of list) group.append(optionCard(option, onChoose));
    groups.append(group);
  }
  return groups;
}

export function placeOptions(choices: OptionView[], place: PlaceId | null, onChoose: (id: string) => void): HTMLElement {
  if (!place) return groupedOptions(choices, onChoose);
  const list = el('div', 'choice-groups');
  for (const choice of choices.filter((choice) => choice.place === place)) list.append(optionCard(choice, onChoose));
  return list;
}
