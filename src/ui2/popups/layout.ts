// Isolated reviewer fixture: this entry is never imported by the game.
import '../../styles.css';
import { choose, derived, newGame, options } from '../../life/engine.ts';
import type { OptionView } from '../../life/engine.ts';
import { button, el } from '../../ui/dom.ts';
import { board } from '../board.ts';
import { hud } from '../hud.ts';
import { POPUPS } from './data.ts';
import type { PopupKind } from './data.ts';
import { mountPopup, phoneChoices, popupModel } from './index.ts';
import { mountEnding, mountEndingCollection } from './ending.ts';
import { ENDINGS2 } from './ending-data.ts';
import { POPUPS2 } from './data.ts';
import { popup2Fixture } from './fixtures.ts';
import type { Popup2Kind } from './fixtures.ts';

const state = choose(newGame(11), 'start:school').state;
const base = options(newGame(11))[0];
const offered: OptionView[] = ['buy:drone', 'repair', 'loan:100', 'retire:early', 'phone:future-1', 'phone:future-2', 'phone:future-3', 'phone:future-4']
  .map((id, index) => ({ ...base, id, title: `선택 ${index + 1} · 새로운 길을 향해 나아가는 이야기`,
    desc: '<저장된 내용> ' + '긴 설명과 예상 결과를 쪽 넘김으로 모두 읽습니다. '.repeat(10),
    enabled: index < 6, locks: index < 6 ? [] : ['조건이 아직 모자랍니다.'] }));
const root = document.querySelector<HTMLElement>('#app')!;
// Match the game's root-relative artwork when this extra entry is served from its nested path.
const artBase = el('base'); artBase.href = new URL('../../../', location.href).href; document.head.append(artBase);
const shell = el('main', 'life2-shell'), bands = hud(state, derived(state), [], () => {});
const host = el('section', 'life2-options'), opener = button('팝업 검사', '', () => {});
root.dataset.screen = 'play'; bands.bottom.replaceChild(opener, bands.bottom.lastChild!);
shell.append(bands.top, board(state), host, bands.bottom); root.append(shell);
let taken = '', closed = false;
function show(kind: PopupKind, deterministic = false) {
  taken = ''; closed = false; opener.focus();
  const result = { ...choose(newGame(11), 'start:school').result,
    ...(!deterministic && { roll: { value: 43, chance: 71, success: true } }) };
  const model = popupModel(state, { kind, offered, ...(kind === 'result' && { result }) })!;
  mountPopup(host, model, { choose: id => { taken = id; }, dismiss: () => { closed = true; }, returnFocus: opener,
    phoneTab: tab => popupModel(state, { kind: 'phone', offered: phoneChoices(offered, tab) })! });
  return model;
}
declare global {
  interface Window { __popupFixture: { show: typeof show; kinds: PopupKind[]; taken: () => string; closed: () => boolean } }
}
window.__popupFixture = { show, kinds: Object.keys(POPUPS) as PopupKind[], taken: () => taken, closed: () => closed };

// T19 uses its own states/options and leaves the T18 group unchanged.
function show2(kind: Popup2Kind) {
  root.replaceChildren(shell); root.dataset.screen = 'play'; taken = ''; closed = false; opener.focus();
  const fixture = popup2Fixture(kind), model = popupModel(fixture.state, fixture.context)!;
  mountPopup(host, model, { choose: id => { taken = id; }, dismiss: () => { closed = true; }, returnFocus: opener });
  return model;
}
function showEnding(index = 0) {
  const fixture = popup2Fixture('chapter');
  fixture.state.phase = 'ended'; fixture.state.ending = ENDINGS2[index].id; fixture.state.score = 84567;
  mountEnding(root, fixture.state, { title: () => show2('chapter'), restart: () => show2('shop'),
    collection: showCollection }, { ...fixture.context.summary, grade: 'A', featScore: 12300 });
}
function showCollection() {
  mountEndingCollection(root, { gallery: ['ceo', 'family', 'worker'], bestByEnding: { family: 84567 } }, () => showEnding());
}
declare global {
  interface Window { __popup2Fixture: { show: typeof show2; ending: typeof showEnding; collection: typeof showCollection;
    kinds: Popup2Kind[]; taken: () => string; closed: () => boolean } }
}
window.__popup2Fixture = { show: show2, ending: showEnding, collection: showCollection,
  kinds: Object.keys(POPUPS2) as Popup2Kind[], taken: () => taken, closed: () => closed };
