// nalidagame.online login gate, server save, play records and leaderboard (build flag VITE_NG_PLATFORM=1).
// With the flag off, PLATFORM is the literal `false` after Vite's env replacement: every call site is dead
// code, nothing here runs, and the game makes no network request.
//
// Versioned SDK namespaces and payloads are documented in docs/nalidagame-integration.md.
import { LIFE_RULES } from './life/life-data.ts';
import { finalNetWorth } from './life/ending.ts';
import type { GameState as LifeState } from './life/types.ts';
import { adoptLifeServerProgress, cleanLifeProgress, localLifeProgress, markSynced, mergeLifeMeta, syncedAt, type LifeProgress } from './save.ts';

export const PLATFORM = import.meta.env?.VITE_NG_PLATFORM === '1';
const GAME_ID = 'pilotgrowup-v2';
const clean = cleanLifeProgress;
// Defer the read: save.ts imports this module for uploads during platform boot.
const local = (): LifeProgress => localLifeProgress();
const trimSlash = (url: string) => url.replace(/\/+$/, '');
const API = /* @__PURE__ */ trimSlash(import.meta.env?.VITE_NG_API || 'https://api.nalidagame.online');
const PORTAL = /* @__PURE__ */ trimSlash(import.meta.env?.VITE_NG_PORTAL || 'https://nalidagame.online');
const LOGIN_URL = `${PORTAL}/login`;
const NICKNAME_URL = `${PORTAL}/nickname`;
const TIMEOUT = 8000;
const SAVE_DELAY = 1500;

type User = { id: string; loginId: string; nickname: string | null };
type Saved = { data: unknown; progressAt?: number; conflict?: boolean };
type Play = {
  stage: string; score: number; cleared: boolean; durationSec: number;
  detail: { turns: number; age: number; netWorth: number; debt: number; wins: number; losses: number; flights: number; crashes: number };
};
type BoardEntry = { rank?: unknown; nickname?: unknown; score?: unknown; stage?: unknown; me?: unknown };
type Sdk = {
  me(): Promise<User | null>;
  redirectToLogin(): void;
  redirectToNickname(): void;
  progress: { get(): Promise<Saved>; put(data: LifeProgress, progressAt: number): Promise<Saved> };
  plays: { submit(play: Play): Promise<{ newBest?: boolean; best?: unknown; rank?: unknown }> };
  leaderboard(q: { limit: number }): Promise<{ entries: BoardEntry[]; me: BoardEntry | null }>;
  onChange(cb: (u: User | null) => void): void;
};
type SdkGlobal = { init(opts: { gameId: string; apiBase: string; loginUrl: string; nicknameUrl: string }): Sdk };
type ApiError = Error & { status?: number; code?: string };

export type BoardRow = { rank: number | null; nickname: string; score: number | null; ending: string; me: boolean };

let sdk: Sdk | null = null;
let user: User | null = null;
let lost: '' | 'expired' | 'switched' | 'moved' = '';

const int = (v: unknown): number | null => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : Math.floor(Number(v)));
const err = (code: string): ApiError => Object.assign(new Error(code), { code });
const timed = <T>(p: Promise<T>): Promise<T> =>
  Promise.race([p, new Promise<T>((_, rej) => setTimeout(() => rej(err('network')), TIMEOUT))]);

// ------------------------------------------------------------ gate

const GATE: Record<string, [string, string, string?]> = {
  check: ['로그인 확인 중', 'nalidagame.online 계정을 확인하고 있습니다.'],
  login: ['로그인이 필요합니다', '파일럿 키우기는 nalidagame.online 계정으로 플레이합니다. 로그인하면 진행 상황과 랭킹이 저장됩니다.', '로그인'],
  nickname: ['닉네임 설정이 필요합니다', 'nalidagame.online 에서 닉네임을 정하면 게임으로 돌아옵니다.', '닉네임 설정'],
  expired: ['로그인이 만료되었습니다', '다시 로그인하면 이어서 플레이할 수 있습니다.', '다시 로그인'],
  switched: ['다른 계정으로 로그인되었습니다', '다른 탭에서 계정이 바뀌었습니다. 새로고침하면 지금 계정으로 이어서 플레이합니다.', '새로고침'],
  moved: ['다른 기기에서 플레이했습니다', '이 계정의 진행 상황이 다른 기기에서 바뀌었습니다. 새로고침하면 최신 상태로 이어서 플레이합니다.', '새로고침'],
  down: ['서버에 연결할 수 없습니다', '게임 서버에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.', '다시 시도'],
};

let host: HTMLElement;
let onReady: () => void = () => {};

const withNext = (url: string) => `${url}?next=${encodeURIComponent(location.href)}`;
const goLogin = () => (sdk ? sdk.redirectToLogin() : location.assign(withNext(LOGIN_URL)));
const goNickname = () => (sdk ? sdk.redirectToNickname() : location.assign(withNext(NICKNAME_URL)));

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  node.textContent = text;
  return node;
}

function showGate(state: keyof typeof GATE) {
  const [title, msg, action] = GATE[state];
  const card = el('section', 'ng-gate', '');
  card.dataset.gate = String(state);
  card.append(el('p', 'ng-brand', '파일럿 키우기 · nalidagame.online'), el('h1', '', title), el('p', '', msg));
  if (action) {
    const button = el('button', 'primary', action);
    button.type = 'button';
    button.addEventListener('click', () => {
      if (state === 'nickname') goNickname();
      else if (state === 'switched' || state === 'moved') location.reload();
      else if (state === 'down') void attempt();
      else goLogin();
    });
    card.append(button);
  }
  host.replaceChildren(card);
}

function loadSdk(): Promise<SdkGlobal> {
  const w = window as unknown as { NalidaGame?: SdkGlobal };
  if (w.NalidaGame) return Promise.resolve(w.NalidaGame);
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = `${API}/sdk/nalidagame.js`;
    s.onload = () => (w.NalidaGame ? resolve(w.NalidaGame) : reject(err('network')));
    s.onerror = () => { s.remove(); reject(err('network')); };
    document.head.append(s);
  });
}

async function attempt() {
  showGate('check');
  try {
    sdk = sdk ?? (await timed(loadSdk())).init({ gameId: GAME_ID, apiBase: API, loginUrl: LOGIN_URL, nicknameUrl: NICKNAME_URL });
    const me = await timed(sdk.me());
    if (!me) return showGate('login');
    if (!me.nickname) return showGate('nickname');
    const saved = await timed(sdk.progress.get());
    user = me;
    const server = clean(saved.data), stamp = Number(saved.progressAt) || 0;
    adoptLifeServerProgress(cleanLifeProgress(saved.data), String(me.id), stamp);
    known = syncedAt();
    // Choices or an ending that never reached the server (tab closed before the upload) go up now.
    const progress = local();
    if (JSON.stringify(progress) !== JSON.stringify(server)) pushProgress(progress);
    sdk.onChange((u) => {
      if (!user) return;
      if (!u) lost = 'expired';
      else if (u.id !== user.id) lost = 'switched';
      else user = u;
    });
    // Another tab may have logged out or switched accounts while this one was hidden.
    document.addEventListener('visibilitychange', () => { if (!document.hidden && user) timed(sdk!.me()).catch(() => {}); });
    host.replaceChildren();
    onReady();
  } catch (e) {
    console.error('nalidagame gate', e);
    showGate('down');
  }
}

/** Before the title screen: no session (or no nickname), no game. Renders its gate inside `root`, then calls `ready` once. */
export function bootPlatform(root: HTMLElement, ready: () => void) {
  host = root;
  onReady = ready;
  void attempt();
}

/** False (and the gate replaces the screen) once the session expired or another account logged in. */
export function sessionOk(): boolean {
  if (!lost) return true;
  showGate(lost);
  return false;
}

export const nickname = () => user?.nickname ?? '';
export const openNicknamePage = goNickname;

// ------------------------------------------------------------ server save

let pending: LifeProgress | null = null;
let saveTimer = 0;
let saveWait = 0;
let saving = false;
/** The server `progressAt` this tab last read or wrote. Kept per tab: the stored marker is shared by every tab. */
let known = 0;

/** Queues the latest progress; saves are debounced and run one at a time, newest wins. Never throws. */
export function pushProgress(progress: LifeProgress) {
  pending = progress;
  clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => void flush(), SAVE_DELAY);
}

// Read the server copy first so the gallery / best score from another device is merged, then PUT the whole
// record stamped after it. A conflict (someone wrote in between) or a network failure is retried with backoff.
async function flush() {
  if (saving || !pending || !sdk || !user || lost) return;
  saving = true;
  const sending = pending;
  try {
    const cur = await timed(sdk.progress.get());
    if ((Number(cur.progressAt) || 0) > known) {
      // Another device or tab saved since this page last synced: its record stands, this page must reload onto it.
      pending = null;
      lost = 'moved';
      return;
    }
    const run = sending.run;
    const meta = mergeLifeMeta(sending.meta, clean(cur.data).meta);
    const body = { run, meta } as LifeProgress;
    const stamp = Math.max(Date.now(), (Number(cur.progressAt) || 0) + 1);
    known = stamp;
    markSynced(stamp); // before the request: a reload while it is in flight must not mistake it for another device
    const r = await timed(sdk.progress.put(body, stamp));
    if (r.conflict) throw err('conflict');
    if (pending === sending) pending = null;
    saveWait = 0;
  } catch (e) {
    const x = e as ApiError;
    if (x.code === 'user_mismatch') lost = 'switched';
    else if (x.status === 401) lost = 'expired';
    else if (x.code === 'network' || x.code === 'conflict') saveWait = Math.min(300_000, saveWait * 2 || 15_000);
    else console.error('progress save failed', x);
  } finally {
    saving = false;
    if (pending && !lost) saveTimer = window.setTimeout(() => void flush(), saveWait || SAVE_DELAY);
  }
}

// ------------------------------------------------------------ a finished run

/** The ending screen's platform line; the UI renders `text` (textContent) and listens for changes. */
export const runStatus = { text: '', nicknameButton: false, onChange: () => {} };
function setStatus(text: string, nicknameButton = false) {
  runStatus.text = text;
  runStatus.nicknameButton = nicknameButton;
  runStatus.onChange();
}

function playError(e: ApiError): [string, boolean?] {
  if (e.code === 'nickname_required') return ['랭킹에 올리려면 nalidagame.online 에서 닉네임을 정해야 합니다.', true];
  if (e.code === 'user_mismatch') return ['다른 계정으로 로그인되어 기록을 올리지 않았습니다. 새로고침해 주세요.'];
  if (e.status === 401) return ['로그인이 만료되어 기록을 올리지 못했습니다. 다시 로그인해 주세요.'];
  if (e.status === 429) return ['기록 제출이 너무 잦습니다. 잠시 후 다시 플레이해 주세요.'];
  if (e.status === 400) return ['이 기록은 랭킹에 반영되지 않았습니다.'];
  if (e.code === 'network') return ['서버에 연결하지 못해 랭킹에 올리지 못했습니다.'];
  return ['기록을 올리지 못했습니다.'];
}

const bound = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Math.trunc(v)));

/** The play record of a finished run: integers only, every field inside the bounds the server validates. */
export function playOf(state: LifeState, durationSec: number): Play {
  const s = state.s, rules = LIFE_RULES;
  return {
    stage: state.ending ?? 'student',
    score: bound(state.score, 0, Number.MAX_SAFE_INTEGER),
    cleared: state.ending !== 'debtor',
    durationSec: bound(durationSec, 0, 86_400),
    detail: {
      turns: bound(state.turn, 0, rules.maxTurns),
      age: bound(rules.startAge + Math.floor(state.turn / 4), rules.startAge, rules.startAge + rules.maxTurns / 4),
      netWorth: bound(finalNetWorth(state),
        -Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER),
      debt: bound(s.debt, 0, 9_999_999),
      wins: bound(s.wins, 0, 9999),
      losses: bound(s.losses, 0, 9999),
      flights: bound(s.flights, 0, 9999),
      crashes: bound(s.crashes, 0, 9999),
    },
  };
}

/** Posts a finished run to the leaderboard. Never throws; the outcome lands in `runStatus`. */
export function submitRun(state: LifeState, durationSec: number) {
  if (!sdk || !user || lost) return setStatus('로그인이 끊겨 기록을 올리지 못했습니다.');
  setStatus('기록 저장 중…');
  timed(sdk.plays.submit(playOf(state, durationSec))).then(
    (res) => {
      const rank = int(res.rank);
      const top = int(res.best);
      setStatus(`${res.newBest ? '새 최고 기록! ' : ''}${rank != null ? `랭킹 ${rank}위` : '랭킹 반영'}${top != null ? ` · 최고 ${top}점` : ''}`);
    },
    (e: ApiError) => {
      if (e.code === 'user_mismatch') lost = 'switched';
      const [text, nick] = playError(e);
      setStatus(text, nick === true);
    });
}

// ------------------------------------------------------------ leaderboard

/** Top 20 plus the player's own row. Numbers are coerced to integers; nicknames are plain strings for textContent. */
export async function fetchLeaderboard(): Promise<BoardRow[]> {
  if (!sdk) throw err('network');
  const r = await timed(sdk.leaderboard({ limit: 20 }));
  const entries = Array.isArray(r.entries) ? r.entries : [];
  const rows = r.me && !entries.some((e) => e.me === true) ? [...entries, r.me] : entries;
  return rows.map((e) => ({
    rank: int(e.rank),
    nickname: String(e.nickname ?? '').slice(0, 40),
    score: int(e.score),
    ending: typeof e.stage === 'string' ? e.stage.slice(0, 20) : '',
    me: e.me === true,
  }));
}
