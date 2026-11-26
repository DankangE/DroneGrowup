// Life board state and vocabulary; base-types.ts holds the shared source catalog shapes.
import type {
  ChanceMod as V1ChanceMod, Choice as V1Choice, Effect as V1Effect, EndingId as V1EndingId,
  EventDef as V1EventDef, LogEntry, PlaceId as V1PlaceId, Roll as V1Roll, Stat as V1Stat,
} from './base-types.ts';
export type { LogEntry };

export type Stat = V1Stat | 'happy' | 'fans' | 'homeIndex' | 'capStamina';
export type StatMap = Partial<Record<Stat, number>>;
// New locations from appendix A; the existing places keep their v1 ids.
export type PlaceId = V1PlaceId
  | 'estate_street' | 'downtown' | 'broadcast_station' | 'city_park'
  | 'village_hall' | 'library' | 'park' | 'bus_terminal' | 'job_center' | 'estate'
  | 'city_hall' | 'wedding' | 'station' | 'department_store' | 'mall' | 'apartment' | 'lottery'
  | 'airport' | 'hospital' | 'jobfair' | 'convention' | 'culture'
  | 'field_office' | 'maintenance_base' | 'dorm' | 'safety_center' | 'freight_station' | 'warehouse'
  | 'test_shuttle' | 'fire_base' | 'logistics' | 'company_housing'
  | 'gate' | 'lab' | 'cert_center' | 'grad_school' | 'test_airfield' | 'raceway' | 'zone_shuttle'
  | 'startup_hub' | 'pro_shop' | 'research_housing'
  | 'newtown_square' | 'waterfront_mall' | 'startup_tower' | 'securities' | 'sales_office' | 'port'
  | 'business_school' | 'observatory' | 'newtown_station' | 'residence' | 'ferry' | 'invest_hall'
  | 'waterfront_park' | 'duty_free' | 'beach_square' | 'promenade' | 'resort' | 'beach_studio'
  | 'country_homes' | 'care_hospital' | 'culture_center' | 'marina' | 'lighthouse' | 'spa' | 'pension'
  | 'resort_station' | 'credit_union' | 'golf' | 'festival';
export type EndingId = V1EndingId | 'philanthropist' | 'legend' | 'master' | 'star' | 'hero'
  | 'tycoon' | 'family' | 'official' | 'freeman' | 'worker';
export type Status = 'student' | 'jobless' | 'working' | 'retired';
export type Cond = {
  status?: Status[]; track?: TrackId[];
  min?: StatMap; max?: StatMap; flags?: string[]; notFlags?: string[];
  /** At least one branch must match, in addition to every condition above. */
  any?: Cond[];
};
export type Effect = Omit<V1Effect, 'stage' | 'add' | 'set' | 'end'> & {
  status?: Status; track?: TrackId | null; add?: StatMap; set?: StatMap; end?: EndingId;
  grantCard?: string;
};
export type ChanceMod = Omit<V1ChanceMod, 'stat'> & { stat: Stat };
export type Roll = Omit<V1Roll, 'mods' | 'success' | 'fail'> & {
  mods?: ChanceMod[]; success: Effect; fail: Effect;
};
export type Choice = Omit<V1Choice, 'need' | 'roll' | 'effect'> & { need?: Cond; roll?: Roll; effect?: Effect };
export type ActionDef = Choice & { id: string; place: PlaceId; when: Cond; flight?: boolean };
export type EventDef = Omit<V1EventDef, 'place' | 'when' | 'choices'> & {
  place: PlaceId; when: Cond; choices: Choice[];
};

export type MapId = 'A' | 'B' | 'C' | 'D' | 'E' | 'F';
export type SpaceKind = 'start' | 'pay' | 'train' | 'job' | 'contest' | 'event' | 'rest' | 'rankup'
  | 'jobfair' | 'shop' | 'estate' | 'life' | 'biz' | 'luck' | 'station' | 'invest';
export type WorldNode = { id: string; map: MapId; kind: SpaceKind; place: PlaceId; x: number; y: number;
  next: string[]; cross?: { to: string; fare: number; gate?: Cond }[] };
export type TrackId = 'service' | 'delivery' | 'mechanic' | 'clerk' | 'pilot' | 'employee' | 'instructor' | 'public'
  | 'rescue' | 'creator' | 'engineer' | 'inspector' | 'film' | 'atc' | 'racer' | 'solo' | 'company' | 'academy' | 'director';
export type TrackDef = { id: TrackId; name: string; tier: 1 | 2 | 3 | 4; maps: MapId[] | 'any'; salaried: boolean;
  entry: Cond; entryRoll?: Roll; entryFee?: number; warnBelow: number; pensionPct: number;
  ranks: { title: string; salary: number; need: Cond; tenure: number; jobPct?: number }[] };

export type GameState = {
  v: 2;
  seed: number; rng: number; turn: number; // 0..204
  status: Status;
  track: TrackId | null;
  phase: 'action' | 'event' | 'ended';
  board: {
    pos: string;
    step: 'spin' | 'pick' | 'space' | 'bonus';
    dice: [number, number] | [number, number, number] | [];
    ledger: Record<string, number>;
    lapAt: Record<MapId, number>; // Last start crossing per map, or -1.
    visited: number; laps: number; // Six-map bitmasks.
    contests: number; rankups: number;
    dial?: import('./life-data.ts').DialNotch;
  };
  s: Record<Stat, number>; // rank remains available for imported v1 effects; overdue counts over-limit seasons.
  job: { rank: number; perf: number; tenure: number; total: number; warn: 0 | 1; changedAt: number; tracks: TrackId[] };
  home: { map: MapId; tier: number; deposit: number } | null;
  estates: { map: MapId; tier: number; paid: number }[];
  holdings: { id: string; level: 1 | 2 | 3; paid: number }[];
  hand: { id: string; at: number }[];
  family: { partnerAt: number | null; marriedAt: number | null; dual: boolean; kids: { born: number; pts: number; stage: 0 | 1 | 2 | 3 | 4 }[] };
  fund: { kind: 0 | 1 | 2; amount: number };
  life: 0 | 1 | 2 | 3;
  timers: Record<string, number>;
  flags: string[];
  feats: string[];
  eventId: string | null; seen: Record<string, number>;
  ending: EndingId | null; score: number; log: LogEntry[];
};
