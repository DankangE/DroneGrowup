// Which raster image stands for which place, speaker and ending. Files live in public/art and are fetched
// only when an <img> that points at them is created, so a run downloads just the scenes it visits.
// tests/art.test.ts checks that every file named here exists and stays web-sized.
import type { EndingId, GameState, PlaceId, Stage } from '../game/types.ts';

export type SceneId =
  | 'home' | 'school' | 'airfield' | 'town' | 'shop' | 'garage' | 'bank'
  | 'farm' | 'site' | 'bridge' | 'windfarm' | 'studio' | 'coast'
  | 'solo' | 'office' | 'hq' | 'academy' | 'assoc';

export type SpeakerId =
  | 'senior' | 'mechanic' | 'professor' | 'broker' | 'client' | 'banker' | 'manager' | 'engineer'
  | 'trainee' | 'inspector' | 'anchor' | 'friend' | 'investor' | 'examiner';

export const SCENE_IDS: SceneId[] = [
  'home', 'school', 'airfield', 'town', 'shop', 'garage', 'bank', 'farm', 'site', 'bridge', 'windfarm',
  'studio', 'coast', 'solo', 'office', 'hq', 'academy', 'assoc',
];
export const SPEAKER_IDS: SpeakerId[] = [
  'senior', 'mechanic', 'professor', 'broker', 'client', 'banker', 'manager', 'engineer', 'trainee',
  'inspector', 'anchor', 'friend', 'investor', 'examiner',
];

const file = (name: string) => `${import.meta.env.BASE_URL}art/${name}.webp`;

/** The company grows from a solo desk to a small office to a full headquarters floor. */
function companyScene(state: GameState): SceneId {
  if (state.stage === 'employee') return 'hq';
  if (state.stage !== 'company') return state.stage === 'solo' ? 'solo' : 'office';
  return state.s.staff >= 6 || state.s.round >= 2 ? 'hq' : 'office';
}

export function sceneId(place: PlaceId, state: GameState): SceneId {
  switch (place) {
    case 'exam': return 'airfield';
    case 'office': return state.stage === 'solo' ? 'solo' : companyScene(state);
    case 'hq': return state.stage === 'solo' ? 'office' : companyScene(state);
    default: return place;
  }
}

export const sceneArt = (place: PlaceId, state: GameState) => file('scene-' + sceneId(place, state));

/** Where a career stage spends its days: the scene a run opens on. */
export const STAGE_PLACE: Record<Stage, PlaceId> = {
  student: 'school', pilot: 'airfield', employee: 'hq', instructor: 'academy', academy: 'academy',
  solo: 'office', company: 'hq', director: 'assoc',
};

const EVENT_SPEAKER: Record<string, SpeakerId> = {
  neglect: 'mechanic', typhoon: 'anchor', used_deal: 'broker', theft: 'friend', bird: 'mechanic',
  scholarship: 'professor', senior: 'senior', club: 'senior', cram: 'examiner', practice_bursary: 'senior',
  illegal: 'broker', regular: 'client', grant: 'banker', expo: 'client', friend: 'friend',
  market_map: 'client', coast_archive: 'client',
  restructure: 'manager', scout: 'manager', taskforce: 'manager',
  battery_log: 'inspector', field_handover: 'manager', new_hire: 'trainee',
  trainee_crash: 'trainee', best_instructor: 'examiner', rival_academy: 'trainee', inspection: 'inspector',
  silent_lesson: 'trainee', landing_marks: 'senior', workshop_bus: 'client',
  tax: 'inspector', subcontract: 'manager', key_staff: 'engineer', angel: 'investor', dumping: 'client',
  hearing: 'inspector', audit: 'banker', advisor: 'professor',
};

export const eventSpeaker = (eventId: string): SpeakerId => EVENT_SPEAKER[eventId] ?? 'senior';
export const speakerArt = (id: SpeakerId) => file('portrait-' + id);
export const eventPortrait = (eventId: string) => speakerArt(eventSpeaker(eventId));
export const endingPortrait = (id: EndingId) => file('ending-' + id);
/** The player as a full-body chibi in the outfit of a career stage: rank cards, the board piece, the player plate. The file's background is the flat cream #fdf5e6. */
export const chibiArt = (stage: Stage) => file('chibi-' + stage);
