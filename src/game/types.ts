// Shapes shared by the data tables (data.ts), the rules (engine.ts) and the UI. No DOM, no logic.

export type Stage = 'student' | 'pilot' | 'employee' | 'instructor' | 'academy' | 'solo' | 'company' | 'director';

export type EndingId =
  | 'ceo' | 'chairman' | 'academy' | 'solo' | 'debtor'
  | 'smallbiz' | 'director' | 'instructor' | 'employee' | 'pilot' | 'student';

/** Every number of a run lives in one flat record, so conditions and effects in data.ts can name any of them. */
export type Stat =
  | 'money' | 'debt' | 'xp' | 'rep' | 'biz' | 'teach' | 'net'
  | 'acts' | 'stamina' | 'theory' | 'skill'
  | 'drone' | 'gear' | 'car' | 'cond'
  | 'rank' | 'staff' | 'contracts' | 'value' | 'round' | 'students' | 'level' | 'support'
  | 'overdue' | 'flights' | 'crashes' | 'wins' | 'losses';

export type StatMap = Partial<Record<Stat, number>>;

export type PlaceId =
  | 'home' | 'school' | 'airfield' | 'exam' | 'town' | 'shop' | 'garage' | 'bank'
  | 'farm' | 'site' | 'bridge' | 'windfarm' | 'studio' | 'coast'
  | 'office' | 'hq' | 'academy' | 'assoc';

export type Cond = {
  stage?: Stage[];
  min?: StatMap;
  max?: StatMap;
  flags?: string[];
  notFlags?: string[];
};

export type Effect = {
  text: string;
  add?: StatMap;
  set?: StatMap;
  stage?: Stage;
  flag?: string;
  end?: EndingId;
};

/** +pct percentage points for every `per` of `stat` above `over`, up to `cap`. */
export type ChanceMod = { stat: Stat; over: number; per: number; pct: number; cap: number };

export type Roll = {
  /** Success chance in percent before modifiers. */
  base: number;
  mods?: ChanceMod[];
  success: Effect;
  fail: Effect;
};

export type Choice = {
  title: string;
  desc: string;
  /** Shown but disabled until met. */
  need?: Cond;
  /** 만원, paid up front whatever the outcome. */
  cost?: number;
  /** 체력 spent up front whatever the outcome. An action is disabled while stamina is below it. Actions only: event choices put stamina in their effects. */
  tire?: number;
  roll?: Roll;
  effect?: Effect;
};

export type ActionDef = Choice & {
  id: string;
  place: PlaceId;
  /** Hidden unless met. */
  when: Cond;
  /** A flight with the player's own drone: needs upkeep, wears the drone, can crash; success pay scales by stage. */
  flight?: boolean;
};

export type EventDef = {
  id: string;
  title: string;
  text: string;
  place: PlaceId;
  when: Cond;
  weight: number;
  choices: Choice[];
};

export type ItemKind = 'drone' | 'gear' | 'car';
export type ItemLevel = { name: string; price: number; desc: string };

export type EndingDef = {
  id: EndingId;
  title: string;
  main: boolean;
  bonus: number;
  text: string;
};

export type LogEntry = { turn: number; text: string; tone: 'good' | 'bad' | 'info' };

export type GameState = {
  v: 1;
  seed: number;
  rng: number;
  turn: number;
  stage: Stage;
  phase: 'action' | 'event' | 'ended';
  s: Record<Stat, number>;
  flags: string[];
  eventId: string | null;
  /** Event id -> turn it last fired (cooldown). */
  seen: Record<string, number>;
  ending: EndingId | null;
  score: number;
  log: LogEntry[];
};

// ---------------------------------------------------------------- what the UI and the bots read

export type OutcomeView = {
  text: string;
  /** Nominal additive effect used by the bots, including stage pay scaling. */
  add: StatMap;
  stage?: Stage;
  end?: EndingId;
};

export type OptionKind = 'action' | 'job' | 'event' | 'shop' | 'repair' | 'bank';

export type OptionView = {
  id: string;
  kind: OptionKind;
  place: PlaceId;
  title: string;
  desc: string;
  /** Free options (shop, repair, bank) do not spend the turn. */
  free: boolean;
  cost: number;
  tire: number;
  enabled: boolean;
  /** Korean reasons, one per unmet requirement; empty when enabled. */
  locks: string[];
  /** The same requirements as data, for bots. `money` is listed when the cost is not covered. */
  missing: { stat: Stat; need: number }[];
  roll?: { chance: number; staminaPct: number; success: OutcomeView; fail: OutcomeView; crashPct?: number };
  sure?: OutcomeView;
};

export type UpkeepLine = { label: string; amount: number };

export type BranchId = 'sure' | 'success' | 'fail' | 'crash';
export type BranchForecast = {
  id: BranchId;
  /** Complete option diff, before season settlement. */
  deltas: StatMap;
  flag?: string;
  stage?: Stage;
  end?: EndingId;
  endsSeason: boolean;
};
export type Forecast = {
  cost: number;
  tire: number;
  chance?: number;
  crashPct?: number;
  branches: BranchForecast[];
};

export type Result = {
  optionId: string;
  title: string;
  place: PlaceId;
  free: boolean;
  roll?: { chance: number; value: number; success: boolean };
  text: string;
  /** Net stat changes of the option itself (cost included), before upkeep. */
  deltas: StatMap;
  /** Net changes after the option, including automatic rest, upkeep and refill. */
  settle?: { deltas: StatMap };
  /** A flag acquired for the first time. */
  flag?: string;
  crashed: boolean;
  notes: string[];
  /** Present when the turn advanced. */
  upkeep?: { lines: UpkeepLine[]; total: number };
  season?: { from: string; to: string; rest: number; refill: number; auto: boolean };
  stageFrom: Stage;
  stageTo: Stage;
  /** A random event started and now waits for a choice. */
  eventId?: string;
  ended?: EndingId;
};

export type Derived = {
  age: number;
  season: number;
  seasonName: string;
  dateLabel: string;
  creditLimit: number;
  netWorth: number;
  stageName: string;
  rankName: string;
  items: Record<ItemKind, { level: number; name: string }>;
  /** Expected money change of the next turn's upkeep. */
  upkeep: { lines: UpkeepLine[]; total: number };
};
