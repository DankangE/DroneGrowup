import { choose, derived, forecast, newGame, options, reachable, restore } from '../life/flow.ts';
import type { OptionView } from '../life/flow.ts';
import type { GameState } from '../life/types.ts';
import { PLACES, WORLD } from '../life/world.ts';
import { button, el, reducedMotion } from '../ui/dom.ts';
import { board, KINDS, setBoardTilt, TILT_STYLE } from './board.ts';
import { POLISH as P } from './popups/polish-data.ts';
import { POLISH_STYLE } from './popups/polish-style.ts';
import { tileIcon } from './icons.ts';
import { hud } from './hud.ts';
import { townScene } from './pc-scenery.ts';
import { choiceDetail, highlightChoices } from './choice-detail.ts';
import { placeArt } from './art.ts';
import { wheel, WHEEL_STYLE } from './wheel.ts';
import { destinationDetails, destinationName, pick, PICK_STYLE } from './pick.ts';
import { movementFrames, playback, MOVE_STYLE } from './move.ts';
import type { Frame } from './move.ts';
import { transfer, TRANSFER_STYLE } from './transfer.ts';
import { mountPopup, phoneChoices, popupModel } from './popups/index.ts';
import type { PopupModel } from './popups/index.ts';
import { resultPopups } from './popups/presentation.ts';
import { COPY } from './popups/data.ts';
import { mountEnding, mountEndingCollection } from './popups/ending.ts';
import { loadLifeRun, loadLifeMeta, mergeLifeMeta, saveLifeRun, recordLifeEnding, migrateLifeSave, V1_NOTICE, loadLifeSettings, saveLifeSettings } from '../save.ts';
import { PLATFORM, bootPlatform, sessionOk, runStatus } from '../platform.ts';

const DESTINATION_PAGE_SIZE = 6;
const PHASE_LABEL = { spin: '이번 계절', pick: '갈 곳 고르기', space: '이곳에서 할 일',
  bonus: '추가 행동', event: '사건', chapter: '인생 결산', move: '이동 중', transfer: '지도 환승' } as const;
type PendingPopup = { model: PopupModel; resume?: 'phone' };

declare global {
  interface Window {
    __life?: { state: () => GameState; options: () => OptionView[]; load: (raw: unknown) => void };
  }
}

export function mountLife(root: HTMLElement, seed?: number, debug = false): void {
  let lastSeed = 0;
  const freshGame = () => {
    if (seed !== undefined) return newGame(seed);
    // Random starting point, then a UI-owned counter makes every restart distinct.
    lastSeed = lastSeed ? ((lastSeed + 1) >>> 0) || 1 : crypto.getRandomValues(new Uint32Array(1))[0] || 1;
    return newGame(lastSeed);
  };
  let state = freshGame(), page = 0;
  let settings = loadLifeSettings();
  let meta: ReturnType<typeof loadLifeMeta>;
  const collection = () => mergeLifeMeta(meta, loadLifeMeta());
  let ready = false, atTitle = false, notice = false, startedAt = performance.now();
  let pending: PendingPopup[] = [], menu: 'my-life' | 'phone' | undefined, dismissed = false;
  let glowBefore: GameState | undefined;
  let frame: Frame | undefined, before: GameState | undefined, sequence: ReturnType<typeof playback> | undefined;
  root.classList.add('life2');
  const skip = () => frame?.phase === 'spin' ? sequence?.next() : sequence?.finish();
  root.addEventListener('keydown', event => {
    if (sequence && event.key === 'Escape') { event.preventDefault(); skip(); }
  });
  root.addEventListener('click', event => {
    const target = event.target as Element;
    // A destination click may have just replaced its board; do not skip that new animation.
    if (sequence && root.contains(target) && target.closest('.life2-board-frame')) skip();
  });
  window.matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', event => {
    if (event.matches) sequence?.finish();
  });
  // Only the board has measured geometry. Other screens reflow through CSS;
  // retaining their mounted DOM also preserves gallery paging, details and focus.
  window.addEventListener?.('resize', () => { if (root.dataset.screen === 'play') render(); });
  function takeOption(id: string) {
    if (PLATFORM) { if (!sessionOk()) return; }
    const source = id !== 'end' && menu === 'phone' ? 'phone' : 'board';
    if (sequence || (pending.length && source !== 'phone' && id !== 'end') || !options(state, source)
      .some(option => option.id === id && option.enabled)) return;
    if (id === 'end') pending = [];
    before = state; glowBefore = state;
    const outcome = choose(state, id, source);
    state = outcome.state;
    if (state.phase === 'ended') meta = mergeLifeMeta(meta,
      recordLifeEnding(state, Math.max(1, Math.round((performance.now() - startedAt) / 1000))));
    else saveLifeRun(state);
    page = 0; dismissed = false;
    const cards: PendingPopup[] = resultPopups(before, state, outcome.result).map(model => ({ model }));
    if (source === 'phone' && cards.length && state.phase !== 'ended') cards[cards.length - 1].resume = 'phone';
    pending = [...cards, ...pending];
    menu = undefined;
    const frames = movementFrames(before.board.pos, outcome.result, id === 'spin');
    const landing = WORLD.find(node => node.id === state.board.pos)!;
    if (outcome.result.move && P.calloutKinds.includes(landing.kind)) frames.push({ phase: 'move', pos: landing.id, ms: P.calloutMs, callout: true });
    const done = () => { frame = undefined; before = undefined; sequence = undefined; render(true); };
    if (!frames.length || reducedMotion()) { done(); return; }
    sequence = playback(frames, next => { frame = next; render(true); }, done);
    sequence.next();
  }
  function render(focus = false) {
    if (!ready) return;
    if (atTitle) { showTitle(); return; }
    if (!frame && state.phase === 'ended' && !pending.length) {
      pending = []; menu = undefined;
      mountEnding(root, state, {
        title: showTitle, restart,
        collection: () => mountEndingCollection(root, collection(), () => render(true)),
      });
      if (PLATFORM) refreshStatus();
      return;
    }
    const shown = frame && before ? { ...before, board: { ...before.board, pos: frame.pos } } : state;
    const offered = frame ? [] : options(state), view = derived(shown);
    const model = frame ? undefined : menu === 'phone' ? phoneModel()
      : menu ? popupModel(state, { kind: menu, offered: [], summary: { netWorth: view.netWorth } })
      : pending[0]?.model ?? popupModel(state);
    const phase = frame?.phase ?? (state.phase === 'action' ? state.board.step : state.phase === 'ended' ? 'chapter' : 'event');
    root.dataset.screen = 'play';
    root.dataset.phase = !dismissed && model ? model.phase : phase;
    const shell = el('main', 'life2-shell'), bands = hud(shown, view, offered, takeOption, frame ? undefined : next => {
      menu = next; dismissed = false; render(true);
    }, frame ? undefined : glowBefore);
    const mode = frame?.phase ?? (!pending.length && !menu && offered.some(option => option.id === 'spin') ? 'ready' : 'idle');
    const center = wheel(state.board.dice, mode, () => sequence ? skip() : takeOption('spin'));
    const end = offered.find(option => option.id === 'end' && option.enabled);
    const turnControls = end ? el('div', 'life2-turn-controls') : center;
    if (end) turnControls.append(center, button(end.title, '', () => takeOption(end.id), 'end-season'));
    bands.bottom.querySelector('.life2-spin, .life2-dice')!.replaceWith(turnControls);
    const map = board(state, shown.board.pos);
    if (frame?.phase === 'transfer') {
      map.querySelector<HTMLElement>('[data-map]')!.inert = true;
      map.append(transfer(frame.from!, frame.to!));
    }
    if (frame?.callout) {
      const tile = WORLD.find(node => node.id === frame!.pos)!;
      const callout = el('div', 'life2-tile-callout'); callout.dataset.tileCallout = tile.kind;
      callout.setAttribute('role', 'status'); callout.append(tileIcon(tile.kind), el('strong', '', `${KINDS[tile.kind]} · ${PLACES[tile.place].name}`)); map.append(callout);
    }
    if (frame?.payment !== undefined) {
      const payment = el('output', 'life2-payment', `정산 ${frame.payment > 0 ? '+' : ''}${frame.payment}만`);
      payment.dataset.payment = String(frame.payment); map.append(payment);
    }
    const panel = el('section', 'life2-options');
    const heading = el('h2', '', PHASE_LABEL[phase]);
    heading.tabIndex = -1;
    const moves = !frame && phase === 'pick' ? reachable(state) : [];
    const decorate = moves.length ? pick(map, state.board.pos, moves, heading, takeOption) : undefined;
    panel.setAttribute('aria-label', PHASE_LABEL[phase]);
    const list = el('div', 'life2-option-list');
    const choices = model ? [] : offered.filter(option => option.id !== 'spin');
    const pages = Math.max(1, Math.ceil(choices.length / DESTINATION_PAGE_SIZE));
    page = Math.min(page, pages - 1);
    for (const option of choices.slice(page * DESTINATION_PAGE_SIZE, (page + 1) * DESTINATION_PAGE_SIZE)) {
      const preview = forecast(state, option.id);
      const move = moves.find(move => option.id === `go:${move.node}`);
      const control = button('', 'life2-option', () => takeOption(option.id));
      control.dataset.option = option.id;
      control.disabled = !option.enabled;
      control.title = [option.desc, ...option.locks].join(' ');
      control.setAttribute('aria-label', `${option.title}. ${control.title}`);
      control.append(el('strong', '', move ? destinationName(move, state.board.pos) : option.title), el('small', '',
        move ? destinationDetails(move) : option.id.startsWith('family:') ? option.desc : `비용 ${preview.cost}만 · 체력 ${preview.tire}${preview.chance === undefined ? '' : ` · 성공 ${preview.chance}%`}`));
      if (move) {
        decorate!(control, move);
        if (WORLD.find(node => node.id === move.node)!.map !== WORLD.find(node => node.id === state.board.pos)!.map) {
          control.classList.add('life2-transfer-badge');
        }
      }
      list.append(control);
    }
    if (model) {
      list.append(button(COPY.reopen, '', () => { dismissed = false; render(true); }, 'popup-reopen'));
    } else if (!choices.length) {
      const node = WORLD.find(node => node.id === shown.board.pos)!;
      list.append(el('strong', '', PLACES[node.place].name),
        el('p', '', offered[0]?.desc ?? state.log.at(-1)?.text ?? PHASE_LABEL[phase]));
    }
    const pager = el('div', 'life2-pager');
    const previous = button('이전', '', () => { page--; render(true); }, 'page-prev');
    const next = button('다음', '', () => { page++; render(true); }, 'page-next');
    previous.disabled = page === 0; next.disabled = page === pages - 1;
    pager.append(previous, el('span', '', `${page + 1} / ${pages}`), next);
    panel.append(heading, list, pager);
    if (moves.length && choices.length) {
      panel.classList.add('life2-destinations');
      const inspector = choiceDetail(WORLD.find(node => node.id === shown.board.pos)!.place);
      panel.append(inspector.pane);
      highlightChoices(list, id => {
        const option = choices.find(item => item.id === id)!;
        const move = moves.find(item => id === `go:${item.node}`);
        inspector.update({ id, title: move ? destinationName(move, state.board.pos) : option.title,
          summary: move ? destinationDetails(move) : option.desc, details: [option.desc], enabled: option.enabled });
        const destination = move && WORLD.find(node => node.id === move.node);
        if (destination) inspector.scene.replaceChildren(placeArt(destination.place));
      });
    }
    if (pages === 1) { pager.hidden = true; panel.dataset.singlePage = ''; }
    // Popup docking removes the options row on mobile. Measure the tilted board
    // only after that final shell geometry is in place, including on resize.
    if (model && !dismissed) panel.classList.add('life2-popup-host');
    const roulette = el('div', 'life2-roulette');
    roulette.setAttribute('aria-hidden', 'true');
    if (mode === 'spin') roulette.dataset.spinning = '';
    roulette.append(el('strong', '', state.board.dice.length ? state.board.dice.join(' · ') : 'GO!'));
    const hints = el('div', 'life2-key-hints');
    for (const hint of ['↑ ↓ 선택', 'Enter 결정', 'Esc 닫기']) hints.append(el('span', '', hint));
    shell.append(bands.top, map, roulette, panel, bands.bottom, hints);
    const style = el('style', '', WHEEL_STYLE + PICK_STYLE + MOVE_STYLE + TRANSFER_STYLE + POLISH_STYLE + TILT_STYLE);
    root.replaceChildren(style, shell);
    setBoardTilt(map, settings.tilt);
    if (model && !dismissed) {
      mountPopup(panel, model, { choose: takeOption, returnFocus: heading, navigation: bands.bottom,
        settings: { tilt: () => settings.tilt, toggleTilt: () => {
          settings = { tilt: !settings.tilt }; saveLifeSettings(settings); setBoardTilt(map, settings.tilt);
        } },
        dismiss: () => {
          if (menu) menu = undefined;
          else if (pending.length) menu = pending.shift()!.resume;
          else dismissed = true;
          render(true);
        },
        ...(menu === 'phone' && { phoneTab: phoneModel }),
      });
    } else if (focus) (frame ? center : heading).focus({ preventScroll: true });
    if (!frame) glowBefore = undefined;
  }
  function phoneModel(tab: Parameters<typeof phoneChoices>[1] = 'all') {
    const offered = phoneChoices(options(state, 'phone'), tab);
    return popupModel(state, { kind: 'phone', offered,
      previews: Object.fromEntries(offered.map(option => [option.id, forecast(state, option.id, 'phone')])) })!;
  }
  function restart() {
    if (PLATFORM) { if (!sessionOk()) return; }
    state = freshGame(); page = 0; dismissed = false; atTitle = false; notice = false;
    startedAt = performance.now(); saveLifeRun(state); render(true);
  }
  function showTitle() {
    atTitle = true; root.dataset.screen = 'title'; delete root.dataset.phase;
    const card = el('main', 'ng-gate'), title = el('h1', '', '파일럿 키우기'); title.tabIndex = -1;
    card.append(title);
    if (notice) card.append(el('p', '', V1_NOTICE));
    if (loadLifeRun()) card.append(button('이어서 하기', '', () => {
      if (PLATFORM) { if (!sessionOk()) return; }
      state = loadLifeRun()!; atTitle = false; notice = false; render(true);
    }, 'continue-run'));
    card.append(button('새 인생 시작', '', restart, 'new'), button('엔딩 모음', '', () => {
      notice = false; mountEndingCollection(root, collection(), showTitle);
    }, 'gallery'));
    root.replaceChildren(townScene('A'), card); title.focus({ preventScroll: true });
  }
  function refreshStatus() {
    if (root.dataset.screen !== 'ending') return;
    root.querySelector('.platform-status')?.remove();
    const status = el('p', 'platform-status', runStatus.text); status.setAttribute('aria-live', 'polite');
    root.querySelector('.life2-ending-copy')?.append(status);
  }
  if (debug) window.__life = {
    state: () => structuredClone(state), options: () => options(state),
    load(raw) {
      const loaded = restore(raw);
      if (!loaded) throw new Error('Invalid life layout fixture');
      sequence?.cancel(); sequence = undefined; frame = undefined; before = undefined;
      state = loaded; page = 0; pending = []; menu = undefined; dismissed = false; atTitle = false; render();
    },
  };
  const start = () => {
    settings = loadLifeSettings();
    notice = migrateLifeSave(); meta = loadLifeMeta(); state = loadLifeRun() ?? state; ready = true;
    if (seed === undefined) lastSeed = state.seed;
    if (notice) showTitle(); else render();
  };
  if (PLATFORM) { runStatus.onChange = refreshStatus; bootPlatform(root, start); }
  else start();
}
